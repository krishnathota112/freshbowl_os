-- 0010 · Activity state must not lie.
--
-- Two defects found by running the browser's own queries against the demo batch
-- (scripts/check-screens.mjs). Both are display lies with real consequences.
--
--   1. A DRAFT batch's Day-0 work was created in READY. Nothing had been validated, no
--      baseline was frozen, and submit_activity would refuse it — yet it appeared in the
--      operator's My Work. With one draft left over from a test run, the Fibre weighment
--      card read "42.0 MT / 22 loads" for a batch the admin had entered as 21 MT / 11
--      loads. That destroys the load-derivation beat, which is the one thing the demo
--      cannot do without.
--
--   2. EVERY time gate was flipped to WAITING_TIME at generation time, with no
--      unblocks_at. So on the day a batch starts, fifteen rests across Days 2-16 all
--      showed "RESTING" with no countdown, because there is no clock to show: their
--      predecessors have not run. Fifteen fake resting cards bury the one rest that is
--      genuinely running.
--
-- The rule both violate: WAITING_TIME means the clock is running. LOCKED means it is not.
-- READY means a person may act now. advance_batch already moves LOCKED -> WAITING_TIME and
-- stamps unblocks_at at the moment the predecessors finish, which is the only moment the
-- window can honestly be said to have started.

-- ─────────────────────────────────────────────────────────────────────────────
-- generate_activity_plan · a draft plan is entirely LOCKED.
--
-- Unchanged from 0005 except the two initial-state decisions at the end. Regeneration is
-- still draft-only, still one transaction.
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
  rest_hr    numeric;
  pred_title text;
begin
  select * into b from master_batch where id = p_batch_id;
  if not found then raise exception 'No such batch: %', p_batch_id; end if;

  if b.status <> 'draft' then
    raise exception 'Batch % is % — the baseline is frozen and cannot be regenerated',
      b.code, b.status;
  end if;

  delete from batch_activity where master_batch_id = p_batch_id;

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
          + make_interval(secs => (coalesce(rest_hr, a.duration_target_max_hr, 0) * 3600)::int),
        a.duration_target_min_hr, a.duration_target_max_hr, rest_hr,
        a.is_time_gate, a.golden_rule, a.tbd_marker,
        -- A draft has opened nothing. activate_batch is what opens Day 0, and it only runs
        -- once validate_batch reports no blocking findings.
        'LOCKED'::activity_state,
        'pending'
      )
      returning id into new_id;
      n_act := n_act + 1;

      insert into batch_activity_evidence_req
        (batch_activity_id, key, label, media_kinds, min_count, gates_submission,
         capture_hint, ordering)
      select new_id, er.key, er.label, er.media_kinds, er.min_count, er.gates_submission,
             er.capture_hint, er.ordering
      from evidence_requirement er
      where er.process_activity_id = a.id;
      n_ev := n_ev + (select count(*) from evidence_requirement where process_activity_id = a.id);

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

  -- Name the activity each locked instance is actually waiting for.
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

  -- A rest states its required window while it waits, so the admin can see what they
  -- answered without opening the row. It is still LOCKED: no clock is running.
  update batch_activity ba
     set blocked_reason = case
           when ba.day0_duration_hr is null then
             'Rest duration has not been set for this batch'
             || coalesce(' — ' || ba.tbd_marker || ' is unresolved', '')
           when ba.day0_duration_hr >= 1 then
             format('Rest of %s h begins when the previous step is complete',
                    round(ba.day0_duration_hr, 2))
           else
             format('Rest of %s min begins when the previous step is complete',
                    round(ba.day0_duration_hr * 60))
         end
   where ba.master_batch_id = p_batch_id and ba.is_time_gate and ba.state = 'LOCKED';

  -- The earliest day says what it is really waiting for: a human decision, not a predecessor.
  update batch_activity ba
     set blocked_reason = 'Waiting for activation — the baseline is not frozen yet'
   where ba.master_batch_id = p_batch_id
     and not ba.is_time_gate
     and ba.rel_day = (select min(rel_day) from batch_activity where master_batch_id = p_batch_id);

  -- Anything still generic gets an honest fallback rather than the word 'pending'.
  update batch_activity
     set blocked_reason = 'Waiting on an earlier step in this stream'
   where master_batch_id = p_batch_id and state = 'LOCKED'
     and (blocked_reason is null or blocked_reason = 'pending');

  return query select n_act, n_ev, n_val;
end;
$$;

revoke execute on function public.generate_activity_plan(uuid) from anon;
grant execute on function public.generate_activity_plan(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- repair_plan_states · brings plans generated before this migration back in line.
--
-- Idempotent, so it can be run from a seed or by hand as often as needed.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.repair_plan_states()
returns table (drafts_closed int, clocks_cleared int)
language plpgsql security definer set search_path = public as $$
declare
  n_draft int := 0;
  n_rest  int := 0;
  bid     uuid;
begin
  -- A draft has opened nothing, no matter what its rows currently say.
  update batch_activity ba
     set state = 'LOCKED',
         actual_start = null,
         unblocks_at = null,
         blocked_reason = coalesce(
           nullif(ba.blocked_reason, 'pending'),
           'Waiting for activation — the baseline is not frozen yet')
    from master_batch mb
   where mb.id = ba.master_batch_id
     and mb.status = 'draft'
     and ba.state <> 'LOCKED';
  get diagnostics n_draft = row_count;

  -- RESTING with no unblocks_at is not resting. Put it back under lock and let
  -- advance_batch start the clock at the moment its predecessors finish.
  update batch_activity ba
     set state = 'LOCKED',
         actual_start = null,
         blocked_reason = case
           when ba.day0_duration_hr is null then
             'Rest duration has not been set for this batch'
           when ba.day0_duration_hr >= 1 then
             format('Rest of %s h begins when the previous step is complete',
                    round(ba.day0_duration_hr, 2))
           else
             format('Rest of %s min begins when the previous step is complete',
                    round(ba.day0_duration_hr * 60))
         end
   where ba.state = 'WAITING_TIME' and ba.unblocks_at is null;
  get diagnostics n_rest = row_count;

  -- Re-derive from the corrected base. advance_batch is a function of current state, so
  -- anything that genuinely should be open or resting comes straight back, with a clock.
  for bid in select id from master_batch where status = 'active' loop
    perform public.advance_batch(bid);
  end loop;

  return query select n_draft, n_rest;
end;
$$;

grant execute on function public.repair_plan_states() to authenticated;

select 'repair' as step, * from public.repair_plan_states();
