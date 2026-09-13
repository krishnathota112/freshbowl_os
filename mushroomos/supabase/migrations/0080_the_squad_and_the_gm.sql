-- ─────────────────────────────────────────────────────────────────────────────
-- 0080 · Product rules on the server (decisions of 13 Sep 2026).
--
--   1 · Work is open to the authorised squad. Activation no longer requires every activity to
--       have an assigned person (validate_batch NO_ASSIGNEE removed). start/submit already let a
--       supervisor perform eligible production work; the server records who did it.
--   2 · The GM is the lab approval authority. The GM reading of C-32 is enabled and the
--       Supervisor reading disabled, so decide_lab_submission accepts the GM only.
--   3 · G03 · A lab activity cannot be submitted without a sample and a result for every live test.
--   4 · G04 · A lab decision needs a submitted, complete package, and the decider may not be the
--       person who collected, recorded or submitted it.
--   6 · A lab technician may capture evidence on any lab activity without being assigned to it.
--   5 · Approving a package with a failing reading is recorded as approved_out_of_range, with the
--       count, and stays on the decision permanently.
--
-- Function bodies are the deployed ones (validate_batch from 0078) with only these insertions.
-- Requires 0078 applied first.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.lab_decision
  add column if not exists approved_out_of_range boolean not null default false,
  add column if not exists out_of_range_count int not null default 0;

update public.lab_approval_reading set is_enabled = (approver_role = 'gm');

update public.conflict_register
   set status = 'decided',
       ship_with_default = 'PRODUCT DECISION 13 Sep 2026 (user): the GM approves lab submissions, on phone and web. '
                           || 'The GM may reject, or approve an out-of-range result with a written reason, which '
                           || 'stays flagged. The decider may never be the person who recorded or submitted the package.'
 where conflict_id = 'C-32';

CREATE OR REPLACE FUNCTION public.validate_batch(p_batch uuid)
 RETURNS TABLE(severity text, code text, message text, activity_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare fc public.factory_clock;
begin
  select * into fc from public.factory_clock where id = 1;

  return query
    select 'blocking', 'H0_NOT_SET',
           case
             when fc.timezone is null then
               format('H0 is not set. %s:%s factory time cannot be turned into an instant while '
                      || 'the factory timezone is unresolved (%s)',
                      lpad(coalesce(fc.h0_hour_of_day, 0)::text, 2, '0'),
                      lpad(coalesce(fc.h0_minute_of_hour, 0)::text, 2, '0'),
                      coalesce(fc.timezone_conflict_id, 'TBD-50'))
             else 'H0 is not set for this batch'
           end,
           null::uuid
    from master_batch mb
    where mb.id = p_batch and mb.start_at is null;

  -- 0078 · a mandatory stream with no material bound is left out of the plan entirely (G01).
  return query
    select case when mb.status = 'draft' then 'blocking' else 'warning' end,
           'MATERIAL_ROLE_UNBOUND',
           case when mb.status = 'draft'
             then 'No material is chosen for ' || lower(replace(pa.material_role::text, '_', ' '))
                  || ', so its ' || count(*) || ' required activities are missing from the plan. '
                  || 'Choose the material and generate the plan again.'
             else 'This batch was activated with no material for '
                  || lower(replace(pa.material_role::text, '_', ' '))
                  || ', so its ' || count(*) || ' required activities are not in its plan.'
           end,
           null::uuid
    from master_batch mb
    join process_activity pa on pa.process_definition_id = mb.process_definition_id
    where mb.id = p_batch
      and not pa.is_optional
      and pa.material_role is not null
      and not exists (select 1 from batch_material_role bmr
                       where bmr.master_batch_id = mb.id and bmr.role = pa.material_role)
    group by mb.status, pa.material_role;

  -- ── NEW in 0032 · the incoming material check is a prerequisite ────────────
  --
  -- ⚠ THE SEVERITY DEPENDS ON WHETHER THE BATCH HAS STARTED, and that is not a softening.
  --
  -- `validate_batch` is what gates ACTIVATION. For a DRAFT batch a missing or unaccepted check must
  -- block, because that is exactly what "prerequisite" means and `activate_batch` reads this list.
  --
  -- For a batch that is ALREADY RUNNING the finding cannot un-start it, and calling it blocking would
  -- assert that three staged batches are invalid. What is actually true is narrower and worth saying
  -- precisely: they were activated before this check existed, and `open_prebatch_sample` is
  -- deliberately draft-only so the gap cannot be tidied away after the fact. A gap in the record is a
  -- warning. Reporting it as blocking would be the system lying about its own history in the
  -- flattering direction.
  return query
    select case when mb.status = 'draft' then 'blocking' else 'warning' end,
           'MATERIAL_NOT_CHECKED',
           case when mb.status = 'draft'
             then 'No incoming-material check is on record. The material must be sampled and its '
                  || 'results accepted before the batch clock starts (client decision 2).'
             else 'This batch was activated with no incoming-material check on record. It cannot be '
                  || 'added retrospectively, so the gap stands on the record (client decision 2).'
           end,
           null::uuid
    from master_batch mb
    where mb.id = p_batch
      and not exists (select 1 from v_prebatch_material_check c
                       where c.master_batch_id = mb.id);

  return query
    select case when c.batch_status = 'draft' then 'blocking' else 'warning' end,
           'MATERIAL_FAILED',
           'The incoming-material check on ' || c.checkpoint_code || ' has ' || c.failed
             || ' result(s) outside spec. Hold the material, record a corrective action and retest '
             || '— a retest supersedes the reading and clears this.',
           null::uuid
    from v_prebatch_material_check c
    where c.master_batch_id = p_batch and c.failed > 0;

  return query
    select case when c.batch_status = 'draft' then 'blocking' else 'warning' end,
           'MATERIAL_NOT_ACCEPTED',
           'The incoming-material check on ' || c.checkpoint_code || ' has ' || c.accepted || ' of '
             || c.tests_requested || ' result(s) accepted as final. A lab technician or supervisor '
             || 'must accept them before the batch can start.',
           null::uuid
    from v_prebatch_material_check c
    where c.master_batch_id = p_batch
      and c.failed = 0
      and c.accepted < c.tests_requested;

  return query
    select 'blocking', 'REST_NO_DURATION',
           ba.title || ' on Day ' || ba.rel_day || ' has no duration set', ba.id
    from batch_activity ba
    where ba.master_batch_id = p_batch and ba.is_time_gate and ba.day0_duration_hr is null;

  return query
    select 'blocking', 'SAME_VESSEL',
           ba.title || ' — ' || ba.scope_label || ' would reload into the bunker it came from', ba.id
    from batch_activity ba
    join movement_rule mr on mr.process_activity_id = ba.process_activity_id
    where ba.master_batch_id = p_batch
      and mr.requires_distinct_vessel
      and ba.destination_location_id is not null
      and ba.destination_location_id = ba.source_location_id;

  -- Kept as a PLAN-TIME check as well as a write-time one. The constraint refuses the second stint;
  -- this catches the intent before anybody tries, which is what an admin filling a form needs.
  return query
    select 'blocking', 'TURNER_CLASH',
           'Pile ' || t1.instance_no || ' has the same turner on T1 and T2', t2.id
    from batch_activity t1
    join batch_activity t2
      on t2.master_batch_id = t1.master_batch_id
     and t2.instance_no = t1.instance_no
     and t2.code = 'TR-T2'
    where t1.master_batch_id = p_batch
      and t1.code = 'TR-T1'
      and t1.assigned_machine_id is not null
      and t1.assigned_machine_id = t2.assigned_machine_id;

  -- BLOCKING · a RECORDED occupancy that overlaps another batch's. Evidence, not a window guess.
  return query
    select distinct 'blocking', 'VESSEL_DOUBLE_BOOKED',
           l.label || ' is held by ' || other.code || ' over an overlapping window', mine.batch_activity_id
    from location_occupancy mine
    join location l on l.id = mine.location_id
    join location_occupancy theirs on theirs.location_id = mine.location_id
                                 and theirs.master_batch_id <> mine.master_batch_id
                                 and theirs.during && mine.during
    join master_batch other on other.id = theirs.master_batch_id
    where mine.master_batch_id = p_batch and other.status = 'active';

  -- WARNING · a vessel-bound activity with no occupancy on record. The ±2-day heuristic used to guess
  -- here; it now says plainly that it cannot know, and names why.
  return query
    select 'warning', 'OCCUPANCY_NOT_RECORDED',
           ba.title || ' — ' || ba.scope_label || ' commits ' || l.label
             || ', but no occupancy window is recorded. The release rule is unanswered '
             || '(TBD-29), and whether paddy holds a bunker exclusively is unanswered (TBD-28), '
             || 'so no window can be derived.', ba.id
    from batch_activity ba
    join location l on l.id = ba.destination_location_id
    where ba.master_batch_id = p_batch
      and not exists (select 1 from location_occupancy oc where oc.batch_activity_id = ba.id);

  -- 0080 · NO_ASSIGNEE removed. Work is open to the authorised role (the Supervisor squad for
  -- production, the Lab for lab work); the server records who actually did each step. Assignment
  -- remains possible but is no longer a precondition for activation (product decision, 13 Sep 2026).

  return query
    select 'blocking', 'NO_DESTINATION',
           ba.title || ' — ' || ba.scope_label || ' has no destination chosen', ba.id
    from batch_activity ba
    join movement_rule mr on mr.process_activity_id = ba.process_activity_id
    where ba.master_batch_id = p_batch
      and mr.destination_kind in ('BUNKER','TUNNEL')
      and ba.destination_location_id is null;

  return query
    select 'warning', 'NO_BASELINE_HOUR',
           ba.title || ' — ' || ba.scope_label || ' has no hour on the axis', ba.id
    from batch_activity ba
    where ba.master_batch_id = p_batch and ba.baseline_start_hour is null;

  return query
    select 'warning', 'DURATION_OUT_OF_RANGE',
           ba.title || ' — ' || ba.day0_duration_hr || ' h is outside the stated '
             || ba.duration_target_min_hr || '–' || ba.duration_target_max_hr || ' h', ba.id
    from batch_activity ba
    where ba.master_batch_id = p_batch
      and ba.day0_duration_hr is not null
      and ba.duration_target_min_hr is not null
      and (ba.day0_duration_hr < ba.duration_target_min_hr
        or ba.day0_duration_hr > ba.duration_target_max_hr);

  -- INFO · every unresolved question this plan touches, named. TBD-28 and TBD-29 now reach this list
  -- through the occupancy warning above as well as through activity markers.
  return query
    select distinct 'info', ba.tbd_marker,
           coalesce(cr.question, 'Unresolved') || ' — ships as: '
             || coalesce(cr.ship_with_default, 'no default'), null::uuid
    from batch_activity ba
    join conflict_register cr on cr.conflict_id = ba.tbd_marker
    where ba.master_batch_id = p_batch and ba.tbd_marker is not null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_activity(p_activity uuid, p_values jsonb DEFAULT '{}'::jsonb, p_remarks text DEFAULT NULL::text, p_actual_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_actual_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(new_state text, out_of_range integer, outstanding_evidence text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ba          batch_activity;
  b           master_batch;
  k           text;
  v           text;
  fld         batch_activity_value;
  flag        text;
  target      numeric;
  target_src  text;
  dev_count   int := 0;
  reasons     text := '';
  outstanding text;
  entered_at  timestamptz := now();
  h0          timestamptz;
  eff_start   timestamptz;
  eff_end     timestamptz;
  -- Each failing field, captured so the deviation rows can be written after the state settles.
  fails       jsonb := '[]'::jsonb;
  f           jsonb;
  n_samples   int;
  n_tests     int;
  n_pending   int;
begin
  perform public.assert_role(array['operator', 'supervisor', 'lab_tech']::app_role[], 'submit an activity');

  -- 0071 · LOCK THE ROW, THEN DECIDE.
  -- The state check below is a read followed by a write. Five phones submitting at once all read
  -- IN_PROGRESS, and two of them got through before either had committed — one completion, one
  -- actual_end, but two 'submit_activity' rows in the trail. Taking the row lock here serialises
  -- them, so the second caller re-reads a COMPLETED row and receives the refusal that already
  -- exists a few lines below.
  select * into ba from batch_activity where id = p_activity for update;
  if not found then raise exception 'No such activity: %', p_activity; end if;
  -- 0050 · An operator records work by doing it, not by typing when it happened.
  if (p_actual_start is not null or p_actual_end is not null)
     and coalesce(public.current_app_role()::text, '') = 'operator' then
    raise exception
      'An operator may not state a start or end time. Use start_activity and '
      'complete_activity and the server records when it happened. If a time has to be '
      'entered after the fact, a supervisor does it.'
      using errcode = 'insufficient_privilege';
  end if;


  select * into b from master_batch where id = ba.master_batch_id;
  if b.status <> 'active' then
    raise exception 'Batch % is % — activate it before recording work', b.code, b.status;
  end if;
  if ba.state not in ('READY','IN_PROGRESS','RETURNED') then
    raise exception '% is %, so it cannot be submitted', ba.title, ba.state;
  end if;

  -- 0080 · G03 · A LAB ACTIVITY COMPLETES ONLY WITH ITS PACKAGE.
  -- A sample on record for this activity, at least one test requested on it, and a current result
  -- for every live test. Evidence is still enforced by the EVIDENCE_COMPLETE gate below. Pre-H0
  -- checks record their sample against the batch before any activity exists, so for those the
  -- sample is matched by the checkpoint the activity is bound to.
  if ba.responsible_role = 'lab_tech' then
    select count(distinct s.id),
           count(t.id) filter (where t.state not in ('superseded','cancelled')),
           count(t.id) filter (where t.state not in ('superseded','cancelled')
                                 and not exists (select 1 from lab_result r
                                                  where r.test_id = t.id
                                                    and r.superseded_by_result_id is null))
      into n_samples, n_tests, n_pending
      from lab_sample s
      left join lab_test t on t.sample_id = s.id
     where s.master_batch_id = ba.master_batch_id
       and (s.batch_activity_id = ba.id
            or (ba.is_pre_h0 and s.batch_activity_id is null and exists (
                  select 1 from lab_checkpoint lc
                    join lab_checkpoint_activity lca
                      on lca.checkpoint_code = lc.code and lca.checkpoint_map = lc.checkpoint_map
                   where lc.id = s.checkpoint_id
                     and lca.process_activity_id = ba.process_activity_id)));

    if n_samples = 0 then
      raise exception '% cannot be submitted: no sample is on record for it. Take the sample first.', ba.title
        using errcode = 'check_violation';
    end if;
    if n_tests = 0 then
      raise exception '% cannot be submitted: its sample has no readings requested. Record the readings first.', ba.title
        using errcode = 'check_violation';
    end if;
    if n_pending > 0 then
      raise exception '% cannot be submitted: % reading(s) still have no result.', ba.title, n_pending
        using errcode = 'check_violation';
    end if;
  end if;

  -- 0071 · AN OPERATOR CANNOT FINISH WHAT THEY NEVER STARTED.
  --
  -- Submitting from READY is deliberate and stays: a supervisor recording a paper slip after the
  -- fact has no start_activity call to lean on. But for an OPERATOR it produced a quiet lie. One
  -- stray tap on Finish stamped actual_start = now() for work that never began, and
  -- fn_actual_is_append_only then makes that stamp permanent — there is no un-happen, by design.
  -- So the mistake is unrecoverable, which is the wrong price for a mis-tap on a factory phone.
  --
  -- The refusal names the fix, because the operator's own screen has the button.
  if ba.actual_start is null
     and coalesce(public.current_app_role()::text, '') = 'operator' then
    raise exception
      '% has not been started, so it cannot be finished. Tap Start on the task first — the server '
      'records when it began.', ba.title
      using errcode = 'check_violation';
  end if;

  -- ── Recorded actuals are validated BEFORE anything is written ─────────────
  -- Carried unchanged from 0016. A refusal must leave the row exactly as it was, and a refusal an
  -- operator cannot act on is barely better than a silent one — so every message names the
  -- activity and the value it rejected.

  if p_actual_start is not null and p_actual_start > entered_at then
    raise exception
      'Cannot record a start of % for %: that is in the future. An actual is something that has '
      'already happened.', p_actual_start, ba.title
      using errcode = 'invalid_datetime_format';
  end if;

  if p_actual_end is not null and p_actual_end > entered_at then
    raise exception
      'Cannot record an end of % for %: that is in the future. An actual is something that has '
      'already happened.', p_actual_end, ba.title
      using errcode = 'invalid_datetime_format';
  end if;

  -- The EFFECTIVE pair, so a stated end earlier than an already-recorded start is refused too —
  -- start_activity may have written actual_start when the operator opened the card.
  eff_start := coalesce(p_actual_start, ba.actual_start);
  eff_end   := coalesce(p_actual_end, ba.actual_end);

  if eff_start is not null and eff_end is not null and eff_end < eff_start then
    raise exception
      'Cannot record % ending at % when it started at %: work does not end before it begins.',
      ba.title, eff_end, eff_start
      using errcode = 'invalid_datetime_format';
  end if;

  -- NEW in B2 · a STATED actual may not precede H0. `batchHour()` already throws on it —
  -- "nothing in a batch happens before H0" — so the server agrees with the domain function
  -- rather than accepting what the client would refuse to render.
  --
  -- SCOPED TO WHAT THE SUBMITTER STATES, deliberately. Applying it to the `now()` default would
  -- also refuse a live recording on a batch whose `start_at` is still in the future — and that
  -- situation is reachable today: `activate_batch` does not require H0 to have passed, and
  -- `start_activity` stamps `now()` with no H0 check, so an activity can already carry an
  -- `actual_start` a month before its own batch began. Refusing at submit would strand an
  -- operator over a value they did not state.
  --
  -- That incoherence is REAL and PRE-EXISTING, and it is registered as TBD-52 rather than
  -- resolved here: whether "active" should mean "started" is a factory question, and answering
  -- it inside a deviations migration would be the wrong place and the wrong authority.
  h0 := b.start_at;
  if h0 is not null and p_actual_start is not null and p_actual_start < h0 then
    raise exception
      'Cannot record % starting at %: the batch begins at % and nothing in it happens before '
      'that.', ba.title, p_actual_start, h0
      using errcode = 'invalid_datetime_format';
  end if;
  if h0 is not null and p_actual_end is not null and p_actual_end < h0 then
    raise exception
      'Cannot record % ending at %: the batch begins at % and nothing in it happens before '
      'that.', ba.title, p_actual_end, h0
      using errcode = 'invalid_datetime_format';
  end if;

  for k, v in select * from jsonb_each_text(p_values) loop
    select * into fld from batch_activity_value
     where batch_activity_id = p_activity and field_key = k;
    continue when not found;

    flag := 'not_applicable';

    if v ~ '^-?[0-9]+(\.[0-9]+)?$' then
      target := null;
      target_src := null;

      if fld.day0_value ~ '^-?[0-9]+(\.[0-9]+)?$' then
        target := fld.day0_value::numeric;
        target_src := 'the Day-0 plan';
      elsif ba.planned_qty_mt is not null and k like '%qty%' then
        target := ba.planned_qty_mt;
        target_src := 'the Day-0 plan';
      end if;

      if fld.sop_min is not null or fld.sop_max is not null then
        if (fld.sop_min is not null and v::numeric < fld.sop_min)
           or (fld.sop_max is not null and v::numeric > fld.sop_max) then
          flag := 'out_of_range';
          dev_count := dev_count + 1;
          reasons := reasons || fld.label || ' ' || v || coalesce(' ' || fld.unit,'')
                     || ' outside the SOP band ' || coalesce(fld.sop_min::text,'')
                     || '–' || coalesce(fld.sop_max::text,'') || '; ';
          fails := fails || jsonb_build_object(
            'kind', 'VALUE_OUT_OF_SOP',
            'summary', fld.label || ' ' || v || coalesce(' ' || fld.unit,'')
                       || ' is outside the SOP band '
                       || coalesce(fld.sop_min::text,'') || '–' || coalesce(fld.sop_max::text,''),
            'detail', jsonb_build_object(
              'field_key', k, 'label', fld.label, 'value', v, 'unit', fld.unit,
              'sop_min', fld.sop_min, 'sop_max', fld.sop_max,
              'sop_source_ref', fld.sop_source_ref, 'conflict_id', fld.conflict_id,
              'day0_value', fld.day0_value));
        else
          flag := 'in_range';
        end if;

      elsif target is not null and target > 0 then
        if abs(v::numeric - target) / target > 0.10 then
          flag := 'out_of_range';
          dev_count := dev_count + 1;
          reasons := reasons || fld.label || ' ' || v || coalesce(' ' || fld.unit,'')
                     || ' against ' || target || coalesce(' ' || fld.unit,'')
                     || ' in ' || target_src || ' ('
                     || case when v::numeric > target then '+' else '' end
                     || round(v::numeric - target, 2) || '); ';
          fails := fails || jsonb_build_object(
            'kind', 'VALUE_OFF_DAY0_TARGET',
            'summary', fld.label || ' ' || v || coalesce(' ' || fld.unit,'')
                       || ' against ' || target || coalesce(' ' || fld.unit,'')
                       || ' planned at Day 0 ('
                       || case when v::numeric > target then '+' else '' end
                       || round(v::numeric - target, 2) || ')',
            'detail', jsonb_build_object(
              'field_key', k, 'label', fld.label, 'value', v, 'unit', fld.unit,
              'target', target, 'target_source', target_src,
              'tolerance_pct', 10, 'conflict_id', fld.conflict_id,
              -- No SOP band exists here. Saying so is information: docs/LAB_MODEL.md §9.
              'sop_source_ref', fld.sop_source_ref));
        else
          flag := 'in_range';
        end if;
      end if;
    end if;

    update batch_activity_value
       set actual_value = v,
           actual_recorded_at = entered_at,
           actual_recorded_by = auth.uid(),
           variance_flag = flag,
           remarks = coalesce(nullif(p_remarks,''), remarks)
     where id = fld.id;
  end loop;

  select gv.reason into outstanding
  from public.evaluate_gates(p_activity, 'exit') gv
  where gv.kind = 'EVIDENCE_COMPLETE' and gv.verdict = 'fail'
  order by gv.ordering
  limit 1;

  if outstanding is not null then
    update batch_activity
       set state = 'IN_PROGRESS',
           actual_start = coalesce(actual_start, p_actual_start, entered_at),
           actual_end = coalesce(actual_end, p_actual_end),
           actual_recorded_at = entered_at,
           blocked_reason = null
     where id = p_activity;

    insert into audit_event (actor_id, actor_role, action, entity_table, entity_id,
                             after_state, reason)
    values (auth.uid(), public.current_app_role(), 'submit_blocked_on_evidence',
            'batch_activity', p_activity::text,
            jsonb_build_object('actual_start', p_actual_start, 'actual_end', p_actual_end,
                               'recorded_at', entered_at),
            outstanding);

    return query select 'IN_PROGRESS'::text, dev_count, outstanding;
    return;
  end if;

  update batch_activity
     set state = case when dev_count > 0 then 'DEVIATION'::activity_state
                      else 'COMPLETED'::activity_state end,
         actual_start = coalesce(actual_start, p_actual_start, entered_at),
         actual_end = coalesce(actual_end, p_actual_end, entered_at),
         actual_recorded_at = entered_at,
         submitted_at = entered_at,
         submitted_by = auth.uid(),
         blocked_reason = case when dev_count > 0
           then rtrim(reasons, '; ') || ' — held for supervisor review' end
   where id = p_activity;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id,
                           after_state, reason)
  select auth.uid(), public.current_app_role(), 'submit_activity', 'batch_activity',
         p_activity::text,
         jsonb_build_object(
           'actual_start', cur.actual_start,
           'actual_end', cur.actual_end,
           'recorded_at', cur.actual_recorded_at,
           'duration_actual_min', cur.duration_actual_min,
           'variance_minutes', cur.variance_minutes,
           'stated_by_submitter', (p_actual_start is not null or p_actual_end is not null)),
         case when dev_count > 0 then 'DEVIATION · ' || rtrim(reasons,'; ')
              else coalesce(nullif(p_remarks,''), 'submitted') end
    from batch_activity cur where cur.id = p_activity;

  -- ── B2 · every failing field becomes a record someone can act on ──────────────
  -- One row per failing condition, not one per submission: §3.1 waives "one failing condition"
  -- at a time, so a supervisor must be able to accept one and refuse another.
  for f in select * from jsonb_array_elements(fails) loop
    insert into deviation (master_batch_id, batch_activity_id, kind, summary, detail,
                           raised_by, raised_by_role)
    values (ba.master_batch_id, p_activity, (f->>'kind')::deviation_kind,
            f->>'summary', f->'detail', auth.uid(), public.current_app_role());
  end loop;

  if dev_count = 0 then
    perform public.advance_batch(ba.master_batch_id);
  else
    update batch_activity nxt
       set state = 'BLOCKED',
           blocked_reason = 'Blocked — ' || ba.title || ' (' || ba.scope_label
                            || ') is in deviation: ' || rtrim(reasons, '; ')
     where nxt.master_batch_id = ba.master_batch_id
       and nxt.stream = ba.stream
       and nxt.seq > ba.seq
       and nxt.state in ('LOCKED','READY','WAITING_TIME')
       and nxt.seq = (
         select min(n2.seq) from batch_activity n2
         where n2.master_batch_id = ba.master_batch_id
           and n2.stream = ba.stream
           and n2.seq > ba.seq
           and n2.state in ('LOCKED','READY','WAITING_TIME'));
  end if;

  return query
    select (select state::text from batch_activity where id = p_activity), dev_count, null::text;
end;
$function$;

CREATE OR REPLACE FUNCTION public.decide_lab_submission(p_activity uuid, p_verdict text, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ba      batch_activity;
  role_   app_role;
  reading lab_approval_reading;
  n_en    int;
  new_id  uuid;
  roles   text;
  n_samples int;
  n_tests   int;
  n_pending int;
  n_fail    int;
  out_of_range boolean;
begin
  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity: %', p_activity; end if;
  if ba.responsible_role is distinct from 'lab_tech' then
    raise exception
      '% is not a lab activity, so this is not a lab submission. A management checkpoint is '
      'decided with record_checkpoint_decision.', ba.title;
  end if;
  if p_verdict not in ('approved','rejected') then
    raise exception 'A lab submission is approved or rejected, not %', p_verdict;
  end if;
  -- MANDATORY, like every other decision reason in this system.
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A decision on % needs a stated reason', ba.title;
  end if;

  role_ := public.current_app_role();
  select count(*) into n_en from lab_approval_reading where is_enabled;

  if n_en > 0 then
    -- C-32 has been answered. Only the enabled reading's role may decide.
    select * into reading from lab_approval_reading where is_enabled;
    if role_ is distinct from reading.approver_role then
      raise exception
        'A % may not decide a lab submission. C-32 has been answered as "%": the % approves.',
        coalesce(role_::text, 'caller with no role'), reading.reading_code, reading.approver_role
        using errcode = 'insufficient_privilege';
    end if;
  else
    -- C-32 IS OPEN. Both readings stand, so a decision from either named role is accepted and the
    -- row records which reading authorised it. Refusing both would leave the state unreachable —
    -- exactly the defect B1 found in GM_APPROVAL.
    select * into reading from lab_approval_reading where approver_role = role_ limit 1;
    if not found then
      select string_agg(distinct approver_role::text, ' or ' order by approver_role::text)
        into roles from lab_approval_reading;
      raise exception
        'A % may not decide a lab submission. C-32 is open and neither reading names that role — '
        'the two readings on file name %. Both are carried; neither has been chosen.',
        coalesce(role_::text, 'caller with no role'), coalesce(roles, 'no role')
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- 0080 · G04 · A DECISION NEEDS A SUBMITTED, COMPLETE PACKAGE AND A DIFFERENT PERSON.
  if ba.state not in ('COMPLETED','DEVIATION') then
    raise exception '% has not been submitted by the lab (it is %), so there is nothing to decide yet.',
      ba.title, ba.state
      using errcode = 'check_violation';
  end if;

  select count(distinct s.id),
         count(t.id) filter (where t.state not in ('superseded','cancelled')),
         count(t.id) filter (where t.state not in ('superseded','cancelled')
                               and not exists (select 1 from lab_result r
                                                where r.test_id = t.id and r.superseded_by_result_id is null)),
         count(r.id) filter (where r.superseded_by_result_id is null and r.verdict = 'fail')
    into n_samples, n_tests, n_pending, n_fail
    from lab_sample s
    left join lab_test t on t.sample_id = s.id
    left join lab_result r on r.test_id = t.id
   where s.master_batch_id = ba.master_batch_id
     and (s.batch_activity_id = ba.id
          or (ba.is_pre_h0 and s.batch_activity_id is null and exists (
                select 1 from lab_checkpoint lc
                  join lab_checkpoint_activity lca
                    on lca.checkpoint_code = lc.code and lca.checkpoint_map = lc.checkpoint_map
                 where lc.id = s.checkpoint_id
                   and lca.process_activity_id = ba.process_activity_id)));

  if n_samples = 0 or n_tests = 0 or n_pending > 0 then
    raise exception
      '% has no complete lab package on record (samples %, readings %, readings without a result %). '
      'There is nothing valid to decide.', ba.title, n_samples, n_tests, n_pending
      using errcode = 'check_violation';
  end if;

  if auth.uid() is not null and (
       ba.submitted_by = auth.uid()
    or exists (select 1 from lab_sample s
                where s.collected_by = auth.uid()
                  and s.master_batch_id = ba.master_batch_id
                  and (s.batch_activity_id = ba.id or (ba.is_pre_h0 and s.batch_activity_id is null)))
    or exists (select 1 from lab_result r
                 join lab_test t on t.id = r.test_id
                 join lab_sample s on s.id = t.sample_id
                where r.technician_id = auth.uid()
                  and s.master_batch_id = ba.master_batch_id
                  and (s.batch_activity_id = ba.id or (ba.is_pre_h0 and s.batch_activity_id is null)))) then
    raise exception
      'You recorded or submitted % yourself, so you cannot decide it. A different person must approve or reject it.',
      ba.title
      using errcode = 'insufficient_privilege';
  end if;

  -- Approving a package with a reading outside its range is allowed only as an explicit, reasoned
  -- decision, and it stays flagged on the decision forever (product decision, 13 Sep 2026).
  out_of_range := p_verdict = 'approved' and n_fail > 0;

  insert into lab_decision (batch_activity_id, verdict, reason, decided_by, decided_role,
                            authorised_under_reading, reading_was_enabled, approved_out_of_range,
                            out_of_range_count)
  values (p_activity, p_verdict, p_reason, auth.uid(), role_,
          reading.reading_code, reading.is_enabled, out_of_range, n_fail)
  returning id into new_id;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), role_, 'decide_lab_submission', 'batch_activity', p_activity::text,
          jsonb_build_object('verdict', p_verdict, 'under_reading', reading.reading_code,
                             'reading_enabled', reading.is_enabled,
                             'approved_out_of_range', out_of_range, 'out_of_range_count', n_fail),
          case when out_of_range then 'approved OUT OF RANGE (' || n_fail || ' reading(s)): ' || p_reason
               else p_verdict || ': ' || p_reason end);
  /*
   * 0065 · THE GATE OPENS THROUGH `advance_batch`, LIKE EVERYTHING ELSE.
   *
   * 0064 was right that the decision had to write the release down, and WRONG about how.
   * It re-evaluated the held activities itself and set their state directly, which made
   * `decide_lab_submission` the tenth writer of `batch_activity.state` — and
   * `gates.test.ts` refused it, in the words of the rule it was defending:
   *
   *     "A new writer of batch_activity.state appeared. Either route it through
   *      advance_batch, or add it to SANCTIONED with the reason it is an actor
   *      transition rather than a gate."
   *
   * It is not an actor transition. Opening a held activity because a gate now passes is exactly
   * what `advance_batch` is for, and `submit_activity` and `release_activity` already delegate
   * to it for precisely this reason. 0064's stated objection — that a lab approval should not
   * release rests batch-wide as a side effect — was mine, not the project's, and the two functions
   * above had already settled the question the other way.
   *
   * So the decision now does what every other actor transition does: it records what it decided,
   * and asks the one gate-driven writer to work out what that opens.
   */
  perform public.advance_batch(ba.master_batch_id);

  return new_id;
end;
$function$;

-- 0080 · Evidence capture follows the same open-work rule. A lab technician may capture evidence on
-- any lab activity (the lab is a shared queue), a supervisor on any activity, and an operator only
-- on work assigned to them — as before.
CREATE OR REPLACE FUNCTION public.can_capture_for_activity(p_activity uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    public.current_app_role() in ('operator','lab_tech','supervisor')
    and exists (
      select 1 from batch_activity ba
      join master_batch mb on mb.id = ba.master_batch_id
      where ba.id = p_activity
        and mb.status = 'active'
        and (
          ba.assigned_person_id = auth.uid()
          or public.current_app_role() = 'supervisor'
          or (public.current_app_role() = 'lab_tech' and ba.responsible_role = 'lab_tech')
        )
    );
$function$;
