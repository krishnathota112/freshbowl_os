-- ─────────────────────────────────────────────────────────────────────────────
-- 0068 · "Before H0" means before H0.
--
-- THE QUESTION THAT FOUND IT
--   "The prerequisites before H0 are to be recorded — are they getting recorded properly?"
--   No. Measured on a freshly activated PROCESS-2026C batch:
--
--       process_activity  LAB-RM-01   is_pre_h0 = true    pre_h0_offset = 10
--       batch_activity    LAB-RM-01   is_pre_h0 = false   pre_h0_offset = null
--                                     planned_start_at   = H0, exactly
--
--       generate_activity_plan mentions is_pre_h0      : false
--       generate_activity_plan mentions pre_h0_offset  : false
--       functions anywhere reading pre_h0_offset       : none
--
--   The raw-material weighment is meant to happen TEN HOURS BEFORE the batch clock starts. It was
--   planned at hour zero, beside the first wetting. All 110 rows on every batch carried
--   `is_pre_h0 = false`.
--
--   The columns exist on both tables. The process data is correct. Nothing read it.
--
-- WHY IT MATTERED SILENTLY
--   Nothing failed. `standard_start_hour` is 0 for that activity, so the plan looked plausible and
--   every total came out right — the pre-H0 work simply appeared at the wrong time, which no
--   assertion tested and no screen showed. It is the second defect in this session where the data
--   was right and the thing that reads it was missing.
--
-- WHAT THIS CHANGES
--   1 · `generate_activity_plan` carries `is_pre_h0` and `pre_h0_offset` onto the batch row, so an
--       activity knows it precedes the clock without anyone consulting the process definition.
--   2 · Both repointers plan such an activity at `H0 − offset` rather than `H0 + standard hour`.
--
-- WHAT IT DELIBERATELY DOES NOT CHANGE
--   `baseline_start_hour` stays as the process states it. The hour axis, the calculated standard
--   and every total are untouched — a negative baseline hour would move the standard itself, which
--   is a property of the SOP and not this migration's business. Only the WALL-CLOCK instant moves.
--
--   And the incoming-material CHECK is a different thing entirely, already working: that is a lab
--   sample accepted before H0, enforced by `activate_batch`. This is the pre-H0 ACTIVITY on the
--   plan. Both had to be right; only one was.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_activity_plan(p_batch_id uuid)
 RETURNS TABLE(activities integer, evidence_items integer, field_values integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  perform public.assert_role(array['admin', 'gm']::app_role[], 'generate a batch plan');

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
        scope_label, instance_no, planned_qty_mt,
        baseline_start_hour, baseline_end_hour,
        duration_target_min_hr, duration_target_max_hr, day0_duration_hr,
        is_time_gate, golden_rule, tbd_marker, is_pre_h0, pre_h0_offset, state, blocked_reason
      ) values (
        p_batch_id, a.id, a.code,
        resolve_activity_label(p_batch_id, a.label_template, a.material_role, inst.instance_no),
        a.stream, a.rel_day, a.seq, a.scope,
        inst.scope_label, inst.instance_no, inst.planned_qty_mt,
        a.standard_start_hour, a.standard_end_hour,
        a.duration_target_min_hr, a.duration_target_max_hr, rest_hr,
        a.is_time_gate, a.golden_rule, a.tbd_marker, a.is_pre_h0, a.pre_h0_offset,
        -- A draft has opened nothing. activate_batch is what opens Day 0.
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

  -- Every planned instant, from H0 and the hour axis. One derivation, shared with
  -- set_batch_start_at, so the two can never disagree.
  perform public.repoint_batch_activities(p_batch_id);

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

  -- A rest states its required window while it waits. It is still LOCKED: no clock is running.
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

  update batch_activity
     set blocked_reason = 'Waiting on an earlier step in this stream'
   where master_batch_id = p_batch_id and state = 'LOCKED'
     and (blocked_reason is null or blocked_reason = 'pending');

  return query select n_act, n_ev, n_val;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.repoint_one_activity(p_activity uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b master_batch;
begin
  select mb.* into b from master_batch mb
    join batch_activity ba on ba.master_batch_id = mb.id
   where ba.id = p_activity;
  if not found then
    raise exception 'No such activity: %', p_activity;
  end if;
  if b.status <> 'draft' then
    raise exception
      'The baseline is frozen - % is %. Change goes through a deviation, an override or an approved extension.',
      b.code, b.status
      using errcode = 'check_violation';
  end if;

  update batch_activity ba
     set baseline_start_hour = case
           when ba.planned_time is not null and mb.start_at is not null
             then (ba.rel_day * 24 + public.hour_within_batch_day(mb.start_at, ba.planned_time))::int
           else pa.standard_start_hour
         end,
         baseline_end_hour = case
           when ba.planned_time is not null and mb.start_at is not null
             then (ba.rel_day * 24 + public.hour_within_batch_day(mb.start_at, ba.planned_time)
                   + coalesce(ba.day0_duration_hr, ba.duration_target_max_hr, 0))::int
           else pa.standard_end_hour
         end,
         planned_hour_source = case
           when ba.planned_time is not null and mb.start_at is not null then 'admin_planned'
           else 'standard'
         end::plan_hour_source,
         planned_start_at = case
           when mb.start_at is null then null
           when ba.planned_time is not null
             then mb.start_at + make_interval(
                    secs => ((ba.rel_day * 24
                              + public.hour_within_batch_day(mb.start_at, ba.planned_time))
                             * 3600)::int)
           when pa.is_pre_h0 and pa.pre_h0_offset is not null
             then mb.start_at - make_interval(secs => (pa.pre_h0_offset * 3600)::int)
           when pa.standard_start_hour is not null
             then mb.start_at + make_interval(secs => (pa.standard_start_hour * 3600)::int)
         end,
         planned_end_at = case
           when mb.start_at is null then null
           when ba.planned_time is not null then
             case when coalesce(ba.day0_duration_hr, ba.duration_target_max_hr) is not null
               then mb.start_at + make_interval(
                      secs => (((ba.rel_day * 24
                                 + public.hour_within_batch_day(mb.start_at, ba.planned_time))
                                + coalesce(ba.day0_duration_hr, ba.duration_target_max_hr))
                               * 3600)::int)
               else null
             end
           when pa.is_pre_h0 and pa.pre_h0_offset is not null
             then mb.start_at - make_interval(secs => (pa.pre_h0_offset * 3600)::int)
                  + make_interval(secs => (coalesce(ba.day0_duration_hr,
                                                    ba.duration_target_max_hr, 0) * 3600)::int)
           when pa.standard_start_hour is null then null
           when coalesce(ba.day0_duration_hr, ba.duration_target_max_hr) is not null
             then mb.start_at + make_interval(secs => (pa.standard_start_hour * 3600)::int)
                  + make_interval(secs => (coalesce(ba.day0_duration_hr,
                                                    ba.duration_target_max_hr) * 3600)::int)
           when pa.standard_end_hour is not null
             then mb.start_at + make_interval(secs => (pa.standard_end_hour * 3600)::int)
         end
    from master_batch mb, process_activity pa
   where ba.id = p_activity
     and mb.id = ba.master_batch_id
     and pa.id = ba.process_activity_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.repoint_batch_activities(p_batch uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n int;
  b master_batch;
begin
  select * into b from master_batch where id = p_batch;
  if not found then
    raise exception 'No such batch: %', p_batch;
  end if;
  if b.status <> 'draft' then
    raise exception
      'The baseline is frozen - % is %. Change goes through a deviation, an override or an approved extension.',
      b.code, b.status
      using errcode = 'check_violation';
  end if;

  update batch_activity ba
     set baseline_start_hour = case
           when ba.planned_time is not null and mb.start_at is not null
             then (ba.rel_day * 24 + public.hour_within_batch_day(mb.start_at, ba.planned_time))::int
           else pa.standard_start_hour
         end,
         baseline_end_hour = case
           when ba.planned_time is not null and mb.start_at is not null
             then (ba.rel_day * 24 + public.hour_within_batch_day(mb.start_at, ba.planned_time)
                   + coalesce(ba.day0_duration_hr, ba.duration_target_max_hr, 0))::int
           else pa.standard_end_hour
         end,
         planned_hour_source = case
           when ba.planned_time is not null and mb.start_at is not null then 'admin_planned'
           else 'standard'
         end::plan_hour_source,
         planned_start_at = case
           when mb.start_at is null then null
           when ba.planned_time is not null
             then mb.start_at + make_interval(
                    secs => ((ba.rel_day * 24
                              + public.hour_within_batch_day(mb.start_at, ba.planned_time))
                             * 3600)::int)
           when pa.is_pre_h0 and pa.pre_h0_offset is not null
             then mb.start_at - make_interval(secs => (pa.pre_h0_offset * 3600)::int)
           when pa.standard_start_hour is not null
             then mb.start_at + make_interval(secs => (pa.standard_start_hour * 3600)::int)
         end,
         planned_end_at = case
           when mb.start_at is null then null
           when ba.planned_time is not null then
             case when coalesce(ba.day0_duration_hr, ba.duration_target_max_hr) is not null
               then mb.start_at + make_interval(
                      secs => (((ba.rel_day * 24
                                 + public.hour_within_batch_day(mb.start_at, ba.planned_time))
                                + coalesce(ba.day0_duration_hr, ba.duration_target_max_hr))
                               * 3600)::int)
               else null
             end
           when pa.is_pre_h0 and pa.pre_h0_offset is not null
             then mb.start_at - make_interval(secs => (pa.pre_h0_offset * 3600)::int)
                  + make_interval(secs => (coalesce(ba.day0_duration_hr,
                                                    ba.duration_target_max_hr, 0) * 3600)::int)
           when pa.standard_start_hour is null then null
           when coalesce(ba.day0_duration_hr, ba.duration_target_max_hr) is not null
             then mb.start_at + make_interval(secs => (pa.standard_start_hour * 3600)::int)
                  + make_interval(secs => (coalesce(ba.day0_duration_hr,
                                                    ba.duration_target_max_hr) * 3600)::int)
           when pa.standard_end_hour is not null
             then mb.start_at + make_interval(secs => (pa.standard_end_hour * 3600)::int)
         end
    from master_batch mb, process_activity pa
   where ba.master_batch_id = p_batch
     and mb.id = ba.master_batch_id
     and pa.id = ba.process_activity_id;

  get diagnostics n = row_count;
  return n;
end;
$function$
;

do $a$
declare
  g text;
  r text;
begin
  select prosrc into g from pg_proc where proname = 'generate_activity_plan';
  if position('is_pre_h0' in g) = 0 or position('pre_h0_offset' in g) = 0 then
    raise exception '0068 failed: the planner still drops the pre-H0 columns';
  end if;

  select prosrc into r from pg_proc where proname = 'repoint_one_activity';
  if position('pre_h0_offset' in r) = 0 then
    raise exception '0068 failed: repoint_one_activity still plans pre-H0 work at H0';
  end if;

  -- The standard must not have moved. It is a property of the SOP.
  if (select standard_hr from v_process_catalogue where code = 'PROCESS-2026C') <> 470 then
    raise exception '0068 failed: PROCESS-2026C no longer computes 470 — the axis was disturbed';
  end if;

  raise notice '0068 · pre-H0 work is planned before H0, and the standard is unmoved';
end $a$;
