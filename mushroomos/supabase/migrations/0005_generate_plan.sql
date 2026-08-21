-- 0005 · create_master_batch and generate_activity_plan.
--
-- The cardinality rules are evaluated HERE, in the database, because the database is the
-- authority. The client mirror in src/domain/cardinality.ts exists so the wizard can preview
-- a count without a round trip; this is what actually decides.

-- ─────────────────────────────────────────────────────────────────────────────
-- Resolve a label template against this batch's role leads.
-- '{role_lead} Weighment' -> 'Bagasse (new) Weighment'
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.resolve_activity_label(
  p_batch_id uuid, p_template text, p_material_role material_role_code, p_index int default null
) returns text
language plpgsql stable as $$
declare
  lead_name text;
  out_text  text := p_template;
begin
  if p_material_role is not null then
    select m.name into lead_name
    from public.batch_material_role bmr
    join public.material m on m.id = bmr.material_id
    where bmr.master_batch_id = p_batch_id
      and bmr.role = p_material_role
      and bmr.is_role_lead
    limit 1;
  end if;

  -- Guard every substitution: replace() with a NULL argument returns NULL, which would
  -- null the whole title. Material-agnostic activities carry no {role_lead} at all.
  if position('{role_lead}' in out_text) > 0 then
    out_text := replace(
      out_text, '{role_lead}',
      coalesce(lead_name, initcap(replace(coalesce(p_material_role::text, 'material'), '_', ' ')))
    );
  end if;

  if position('{n}' in out_text) > 0 then
    out_text := replace(out_text, '{n}', coalesce(p_index, 1)::text);
  end if;

  return out_text;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- How many instances does this template produce, and what is each one called?
-- One function, six rule kinds, no literal counts.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.evaluate_cardinality(
  p_rule jsonb, p_config jsonb
) returns table (instance_no int, scope_label text, planned_qty_mt numeric)
language plpgsql stable as $$
declare
  kind      text := p_rule->>'kind';
  qty       numeric;
  cap       numeric;
  n         int;
  i         int;
  remaining numeric;
  planned   numeric;
  field     text;
  noun      text;
begin
  if kind = 'SINGLETON' then
    return query select 1, 'Whole batch'::text, null::numeric;

  elsif kind = 'DERIVED_FROM_QUANTITY' then
    qty := nullif(p_config->>(p_rule->>'quantity_field'), '')::numeric;
    cap := nullif(p_config->>(p_rule->>'capacity_field'), '')::numeric;
    if qty is null or cap is null or cap <= 0 then
      raise exception 'Missing or invalid Day-0 value: % / %',
        p_rule->>'quantity_field', p_rule->>'capacity_field';
    end if;
    n := ceil(qty / cap);
    remaining := qty;
    for i in 1..n loop
      -- The tail carries the remainder: 21.0 - 10 x 2.0 = 1.0 MT, not another full load.
      planned := round(least(cap, remaining), 3);
      if i = n then planned := round(remaining, 3); end if;
      return query select i, format('Load %s of %s', lpad(i::text, 2, '0'), n), planned;
      remaining := round(remaining - planned, 3);
    end loop;

  elsif kind = 'PER_SCOPE_INSTANCE' then
    field := coalesce(p_rule->>'count_field',
                      public.scope_count_field((p_rule->>'scope')::activity_scope));
    n := nullif(p_config->>field, '')::int;
    if n is null then
      raise exception 'Missing Day-0 value: %', field;
    end if;
    noun := public.scope_noun((p_rule->>'scope')::activity_scope);
    for i in 1..n loop
      return query select i, format('%s %s of %s', noun, i, n), null::numeric;
    end loop;

  elsif kind = 'CREATES_SCOPE_INSTANCES' then
    n := nullif(p_config->>(p_rule->>'count_field'), '')::int;
    if n is null then
      raise exception 'Missing Day-0 value: %', p_rule->>'count_field';
    end if;
    for i in 1..n loop
      return query select i, format('%s-%s', p_rule->>'label_prefix', i), null::numeric;
    end loop;

  elsif kind = 'MERGES_SCOPE_INSTANCES' then
    n := coalesce((p_rule->>'to_count')::int, 1);
    for i in 1..n loop
      return query select i, coalesce(p_rule->>'new_label', 'Merged'), null::numeric;
    end loop;

  elsif kind = 'REPEAT' then
    n := nullif(p_config->>(p_rule->>'count_field'), '')::int;
    if n is null then
      raise exception 'Missing Day-0 value: %', p_rule->>'count_field';
    end if;
    for i in 1..n loop
      return query select i,
        replace(coalesce(p_rule->>'index_label', 'Pass {n}'), '{n}', i::text), null::numeric;
    end loop;

  else
    raise exception 'Unknown cardinality kind: %', kind;
  end if;
end;
$$;

create or replace function public.scope_count_field(p_scope activity_scope)
returns text language sql immutable as $$
  select case p_scope
    when 'BUNKER_LINE'      then 'bunker_line_count'
    when 'PILE'             then 'yard_pile_count'
    when 'STRAW_PILE'       then 'straw_pile_count'
    when 'TUNNEL'           then 'tunnel_count'
    when 'INDIVIDUAL_BATCH' then 'individual_batch_count'
    when 'LOAD'             then 'load_count'
    else 'master_count' end;
$$;

create or replace function public.scope_noun(p_scope activity_scope)
returns text language sql immutable as $$
  select case p_scope
    when 'BUNKER_LINE'      then 'Line'
    when 'PILE'             then 'Pile'
    when 'STRAW_PILE'       then 'Straw pile'
    when 'TUNNEL'           then 'Tunnel'
    when 'INDIVIDUAL_BATCH' then 'Batch'
    when 'LOAD'             then 'Load'
    else 'Whole batch' end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- generate_activity_plan · materialises the whole plan in ONE transaction.
-- A partially generated plan is not a state.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.generate_activity_plan(p_batch_id uuid)
returns table (activities int, evidence_items int, field_values int)
language plpgsql security definer set search_path = public as $$
declare
  b          record;
  a          record;
  inst       record;
  new_id     uuid;
  n_act      int := 0;
  n_ev       int := 0;
  n_val      int := 0;
  first_seq  int;
  rest_hr    numeric;
  pred_title text;
begin
  select * into b from master_batch where id = p_batch_id;
  if not found then raise exception 'No such batch: %', p_batch_id; end if;

  -- Regeneration is allowed while the batch is a draft; never after activation.
  if b.status <> 'draft' then
    raise exception 'Batch % is % — the baseline is frozen and cannot be regenerated',
      b.code, b.status;
  end if;

  delete from batch_activity where master_batch_id = p_batch_id;

  select min(seq) into first_seq
  from process_activity where process_definition_id = b.process_definition_id;

  for a in
    select * from process_activity
    where process_definition_id = b.process_definition_id
      and default_enabled
    order by seq
  loop
    -- Skip a stream whose role has no material bound. Binding a role is what enables it.
    if a.material_role is not null
       and not exists (select 1 from batch_material_role
                       where master_batch_id = p_batch_id and role = a.material_role) then
      continue;
    end if;

    -- A time gate takes its duration from a REQUIRED Day-0 answer, with no default.
    rest_hr := nullif(b.config->>('rest_hr_' || a.code), '')::numeric;

    for inst in select * from evaluate_cardinality(a.cardinality_rule, b.config) loop
      insert into batch_activity (
        master_batch_id, process_activity_id, code, title, stream, rel_day, seq, scope,
        scope_label, instance_no, planned_qty_mt, planned_start, planned_end,
        duration_target_min_hr, duration_target_max_hr, day0_duration_hr,
        is_time_gate, golden_rule, tbd_marker, state, blocked_reason
      ) values (
        p_batch_id, a.id, a.code,
        resolve_activity_label(p_batch_id, a.label_template, a.material_role, inst.instance_no),
        a.stream, a.rel_day, a.seq, a.scope,
        inst.scope_label, inst.instance_no, inst.planned_qty_mt,
        (b.start_date + a.rel_day)::timestamptz,
        (b.start_date + a.rel_day)::timestamptz
          + make_interval(hours => coalesce(rest_hr, a.duration_target_max_hr, 0)::int),
        a.duration_target_min_hr, a.duration_target_max_hr, rest_hr,
        a.is_time_gate, a.golden_rule, a.tbd_marker,
        case when a.seq = first_seq then 'READY'::activity_state else 'LOCKED'::activity_state end,
        case when a.seq = first_seq then null else 'pending' end
      )
      returning id into new_id;
      n_act := n_act + 1;

      -- Freeze the evidence requirements for this instance.
      insert into batch_activity_evidence_req
        (batch_activity_id, key, label, media_kinds, min_count, gates_submission,
         capture_hint, ordering)
      select new_id, er.key, er.label, er.media_kinds, er.min_count, er.gates_submission,
             er.capture_hint, er.ordering
      from evidence_requirement er
      where er.process_activity_id = a.id;
      n_ev := n_ev + (select count(*) from evidence_requirement where process_activity_id = a.id);

      -- Freeze columns 1-3 of the six-column model.
      insert into batch_activity_value
        (batch_activity_id, field_key, label, unit, sop_value, sop_min, sop_max,
         sop_source_ref, conflict_id, day0_value, variance_allowed, section,
         operator_input, display_order)
      select new_id, af.key, af.label, af.unit, af.sop_value, af.sop_min, af.sop_max,
             af.sop_source_ref, af.conflict_id,
             nullif(b.config->>('field_' || a.code || '_' || af.key), ''),
             af.default_variance, af.section, af.operator_input, af.display_order
      from activity_field af
      where af.process_activity_id = a.id;
      n_val := n_val + (select count(*) from activity_field where process_activity_id = a.id);
    end loop;
  end loop;

  -- Now that every instance exists, write a true reason on each locked one, naming the
  -- activity it is actually waiting for.
  for a in
    select ba.id, ba.code, ba.scope_label, g.predecessor_binding, g.blocked_reason_template,
           g.config->'activity_codes'->>0 as pred_code
    from batch_activity ba
    join gate_rule g on g.process_activity_id = ba.process_activity_id
                    and g.phase = 'entry' and g.kind = 'PREDECESSOR'
    where ba.master_batch_id = p_batch_id and ba.state = 'LOCKED'
  loop
    select title into pred_title
    from batch_activity
    where master_batch_id = p_batch_id and code = a.pred_code
    limit 1;

    update batch_activity
       set blocked_reason = replace(
             replace(a.blocked_reason_template, '{predecessor_label}',
                     coalesce(pred_title, a.pred_code)),
             '{scope_label}', a.scope_label)
     where id = a.id;
  end loop;

  -- Anything still generic gets an honest fallback rather than the word 'pending'.
  update batch_activity
     set blocked_reason = 'Waiting on an earlier step in this stream'
   where master_batch_id = p_batch_id and state = 'LOCKED'
     and (blocked_reason is null or blocked_reason = 'pending');

  -- A time gate with no Day-0 duration says so, and names the open question.
  update batch_activity ba
     set state = 'WAITING_TIME',
         blocked_reason = case
           when ba.day0_duration_hr is null then
             'Rest duration has not been set for this batch'
             || coalesce(' — ' || ba.tbd_marker || ' is unresolved', '')
           else format('Resting — %s h required', ba.day0_duration_hr)
         end
   where ba.master_batch_id = p_batch_id and ba.is_time_gate and ba.state = 'LOCKED';

  return query select n_act, n_ev, n_val;
end;
$$;

revoke execute on function public.generate_activity_plan(uuid) from anon;
grant execute on function public.generate_activity_plan(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- create_master_batch · one call, one transaction: batch, role bindings, plan.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.create_master_batch(
  p_code       text,
  p_label      text,
  p_start_date date,
  p_config     jsonb,
  p_roles      jsonb,      -- [{"role":"PRIMARY_FIBRE","material_code":"BAGASSE_NEW","lead":true}]
  p_supervisor text default null,
  p_weather    text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_batch uuid;
  def_id    uuid;
  r         jsonb;
begin
  select id into def_id from process_definition
   where code = 'PROCESS-2026B' and status = 'published'
   order by version desc limit 1;
  if def_id is null then
    raise exception 'No published process definition found';
  end if;

  insert into master_batch (code, label, process_definition_id, start_date, status,
                            supervisor_name, weather_note, config, created_by)
  values (p_code, p_label, def_id, p_start_date, 'draft', p_supervisor, p_weather,
          p_config, auth.uid())
  returning id into new_batch;

  for r in select * from jsonb_array_elements(p_roles) loop
    insert into batch_material_role (master_batch_id, role, material_id, is_role_lead)
    select new_batch, (r->>'role')::material_role_code, m.id,
           coalesce((r->>'lead')::boolean, false)
    from material m where m.code = r->>'material_code'
    on conflict do nothing;
  end loop;

  perform generate_activity_plan(new_batch);
  return new_batch;
end;
$$;

revoke execute on function public.create_master_batch(text,text,date,jsonb,jsonb,text,text) from anon;
grant execute on function public.create_master_batch(text,text,date,jsonb,jsonb,text,text) to authenticated;

-- Activation freezes the baseline. After this the plan cannot be regenerated.
create or replace function public.activate_batch(p_batch_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  missing int;
begin
  -- Blocking finding: a rest with no duration. The factory never stated these hours, so
  -- Admin must answer before the batch can run. No default is invented.
  select count(*) into missing
  from batch_activity
  where master_batch_id = p_batch_id and is_time_gate and day0_duration_hr is null;

  if missing > 0 then
    raise exception 'Cannot activate: % rest period(s) have no duration set', missing;
  end if;

  update master_batch
     set status = 'active', activated_at = now(), activated_by = auth.uid()
   where id = p_batch_id and status = 'draft';
end;
$$;

revoke execute on function public.activate_batch(uuid) from anon;
grant execute on function public.activate_batch(uuid) to authenticated;
