-- ─────────────────────────────────────────────────────────────────────────────
-- 0082 · Unresolved planning, passive holds, unresolved dependencies.
--
-- Three engine changes approved on 14 Sep 2026 (E-1 option B, E-2, E-5). No process data is written.
--
--   E-1 · PLANNING VALUE UNRESOLVED, EXECUTION VALID
--         process_activity.planning_unresolved marks an activity that has no planned hour ON PURPOSE.
--         v_process_standard no longer counts such an activity as unplaced, so a process whose planning
--         values are explicitly unresolved can be published and selected. An unflagged missing hour is
--         still refused exactly as before.
--
--   E-2 · A PASSIVE HOLD IS NOT STARTED BY A PERSON
--         start_activity refuses a hold. When a hold is confirmed, its actual_start is the actual finish
--         of the step(s) its entry PREDECESSOR rule names — never the confirmation time. With no such
--         finish on record it stays NULL (unknown). The confirmation itself stays in submitted_at,
--         submitted_by and actual_end.
--
--   E-5 · AN UNRESOLVED DEPENDENCY KEEPS THE ACTIVITY LOCKED
--         Gate kind UNRESOLVED_DEPENDENCY always fails. It must name a conflict_register entry, and the
--         blocked reason exposes that entry's question. There is no release path: the rule is resolved
--         by defining it in process data.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── E-1 ────────────────────────────────────────────────────────────────────────
alter table public.process_activity
  add column if not exists planning_unresolved boolean not null default false;

comment on column public.process_activity.planning_unresolved is
  'true = this activity has no planned hour on purpose: the source does not state one (0082, E-1). '
  'It may be published and executed; its planned times stay NULL.';

alter table public.process_activity drop constraint if exists process_activity_planning_unresolved_has_no_hour;
alter table public.process_activity add constraint process_activity_planning_unresolved_has_no_hour
  check (not planning_unresolved or standard_start_hour is null);

create or replace view public.v_process_standard with (security_invoker = on) as
 SELECT pd.id AS process_definition_id,
    pd.code,
    pd.version,
    pd.status,
    max(pa.standard_end_hour) FILTER (WHERE COALESCE(pa.timing_confidence, 'UNRESOLVED'::process_confidence) <> 'PARALLEL_NO_WALLCLOCK'::process_confidence) AS calculated_standard_hr,
    GREATEST(max(pa.standard_end_hour) FILTER (WHERE COALESCE(pa.timing_confidence, 'UNRESOLVED'::process_confidence) <> 'PARALLEL_NO_WALLCLOCK'::process_confidence), max(pa.standard_start_hour) FILTER (WHERE COALESCE(pa.timing_confidence, 'UNRESOLVED'::process_confidence) <> 'PARALLEL_NO_WALLCLOCK'::process_confidence)) AS full_span_hr,
    count(*) AS activity_count,
    count(*) FILTER (WHERE pa.is_hold) AS hold_count,
    count(DISTINCT pa.stream) AS stream_count,
    -- 0082 · an hour that is missing ON PURPOSE is not a hole in the baseline.
    count(*) FILTER (WHERE pa.standard_start_hour IS NULL AND NOT pa.planning_unresolved) AS unplaced_activity_count,
    count(*) FILTER (WHERE pa.planning_unresolved) AS unresolved_planning_count
   FROM process_definition pd
     LEFT JOIN process_activity pa ON pa.process_definition_id = pd.id
  GROUP BY pd.id, pd.code, pd.version, pd.status;

-- ── E-5 ────────────────────────────────────────────────────────────────────────
alter table public.gate_rule drop constraint if exists gate_rule_unresolved_dependency_is_registered;
alter table public.gate_rule add constraint gate_rule_unresolved_dependency_is_registered
  check (kind <> 'UNRESOLVED_DEPENDENCY' or (conflict_id is not null and phase = 'entry'));

-- ── E-2 · start_activity ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_activity(p_activity uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.assert_role(array['operator', 'supervisor', 'lab_tech']::app_role[], 'start an activity');

  perform public.assert_may_execute(p_activity, 'start an activity');

  -- 0082 · E-2 · A PASSIVE HOLD IS NOT STARTED BY A PERSON. It begins when the step before it
  -- finishes, and a person confirms it when its condition is met. A 'start' tapped on a hold would put
  -- a human start event on the record for something nobody did.
  if exists (select 1 from batch_activity where id = p_activity and is_hold) then
    raise exception '% is a passive hold: nobody starts it. It begins when the step before it finishes; confirm it when its condition is met.',
      (select title from batch_activity where id = p_activity)
      using errcode = 'check_violation';
  end if;
  -- 0071 · WHAT HAPPENED, AND WHY THIS IS NOT A COSMETIC CHANGE.
  --
  -- The update below has always been guarded by `state in ('READY','RETURNED')`, so a LOCKED
  -- activity was never started and the gate always held. But the audit insert that followed ran
  -- unconditionally, and the function returned void either way. Two things came of that:
  --
  --   · Starting a LOCKED activity over HTTP answered 204 — success — while the row stayed LOCKED.
  --     A refusal that reports success is worse than a refusal, because the caller believes it.
  --   · Five duplicate taps wrote five 'Work started' rows for one start. The trail then reads as
  --     though the work began five times. This product exists to answer "what did happen"; a trail
  --     that says something happened five times when it happened once is a defect in the answer.
  --
  -- So the audit row now follows the update instead of accompanying it, and a genuine refusal says
  -- why — using the reason the engine already computed, rather than inventing a second opinion.
  declare
    touched int;
    st      text;
    why     text;
    ttl     text;
    missing text;
  begin
    -- 0081 · THE BEFORE PHOTOGRAPH COMES BEFORE THE WORK.
    -- A requirement authored as before_start shows the material as it was. Taken after the start it
    -- would show something else, so an open task does not start without it.
    select string_agg(r.label, ', ' order by r.ordering) into missing
      from batch_activity_evidence_req r
      join batch_activity ba on ba.id = r.batch_activity_id
     where r.batch_activity_id = p_activity
       and ba.state in ('READY','RETURNED')
       and r.capture_phase = 'before_start'
       and r.gates_submission
       and r.satisfied_count < r.min_count;
    if missing is not null then
      raise exception '% cannot start yet: take % first. It records the material before the work begins.',
        (select title from batch_activity where id = p_activity), missing
        using errcode = 'check_violation';
    end if;

    update batch_activity
       set state = 'IN_PROGRESS',
           actual_start = coalesce(actual_start, now()),
           started_by = coalesce(started_by, auth.uid()),
           blocked_reason = null
     where id = p_activity and state in ('READY','RETURNED');
    get diagnostics touched = row_count;

    if touched = 0 then
      select ba.state::text, ba.blocked_reason, ba.title
        into st, why, ttl
        from batch_activity ba where ba.id = p_activity;

      -- Not found is not this function's business — 0067 settled that for assert_may_execute, and
      -- the same reasoning holds here.
      if st is null then
        return;
      end if;

      -- Already running. The second, third and fifth tap of a jittery thumb, or a phone retrying
      -- because it never heard the answer. Idempotent, and deliberately silent: nothing changed,
      -- so nothing is recorded.
      if st = 'IN_PROGRESS' then
        return;
      end if;

      raise exception '%', coalesce(
        nullif(why, ''),
        ttl || ' is ' || st || ', so it cannot be started yet. It opens when the conditions on '
             || 'its card are met.')
        using errcode = 'check_violation';
    end if;

    insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
    values (auth.uid(), public.current_app_role(), 'start_activity', 'batch_activity',
            p_activity::text, 'Work started');
  end;
end;
$function$;

-- ── E-2 · submit_activity ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_activity(p_activity uuid, p_values jsonb DEFAULT '{}'::jsonb, p_remarks text DEFAULT NULL::text, p_actual_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_actual_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_skipped jsonb DEFAULT '{}'::jsonb)
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
  sk_key      text;
  sk_reason   text;
  missing_fields text;
  v_hold_start   timestamptz;
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

  -- 0081 · A READING IS RECORDED, OR SKIPPED WITH A REASON — NEVER BOTH, NEVER SILENTLY.
  -- Validated before anything is written, so a refusal leaves every row as it was.
  if p_skipped is not null and jsonb_typeof(p_skipped) <> 'object' then
    raise exception 'Skipped readings must be given as field key → reason.';
  end if;
  for sk_key, sk_reason in select * from jsonb_each_text(coalesce(p_skipped, '{}'::jsonb)) loop
    select * into fld from batch_activity_value
     where batch_activity_id = p_activity and field_key = sk_key;
    if not found then
      raise exception '% has no reading named %', ba.title, sk_key;
    end if;
    if coalesce(trim(sk_reason), '') = '' then
      raise exception 'Skipping % on % needs a reason. Say why it was not recorded.', fld.label, ba.title
        using errcode = 'check_violation';
    end if;
    if nullif(trim(coalesce(p_values->>sk_key, '')), '') is not null then
      raise exception '% was both recorded and skipped. Record it or skip it, not both.', fld.label
        using errcode = 'check_violation';
    end if;
    if nullif(trim(coalesce(fld.actual_value, '')), '') is not null then
      raise exception '% is already recorded as %, so it cannot be skipped.', fld.label, fld.actual_value
        using errcode = 'check_violation';
    end if;
  end loop;
  for k, v in select * from jsonb_each_text(p_values) loop
    select * into fld from batch_activity_value
     where batch_activity_id = p_activity and field_key = k;
    continue when not found;
    if fld.datatype = 'numeric' and nullif(trim(v), '') is not null and v !~ '^-?[0-9]+(\.[0-9]+)?$' then
      raise exception '% must be a number; "%" was entered.', fld.label, v
        using errcode = 'invalid_text_representation';
    end if;
    if fld.datatype = 'check' and v not in ('true', 'false') then
      raise exception '% is a checklist item: it is ticked (true) or not (false); "%" was sent.', fld.label, v
        using errcode = 'invalid_text_representation';
    end if;
  end loop;

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
  -- 0082 · E-2 · A PASSIVE HOLD BEGINS WHEN THE STEP BEFORE IT FINISHED — the latest actual finish
  -- among the activities its entry PREDECESSOR rule(s) name. Never the confirmation time: with no
  -- finish on record the start stays unknown.
  if ba.is_hold then
    select max(pb.actual_end) into v_hold_start
      from gate_rule g
      join batch_activity pb
        on pb.master_batch_id = ba.master_batch_id
       and pb.code in (select jsonb_array_elements_text(g.config->'activity_codes'))
       and (coalesce(g.predecessor_binding, 'ALL_INSTANCES') <> 'SAME_SCOPE_INSTANCE'
            or pb.instance_no = ba.instance_no)
     where g.process_activity_id = ba.process_activity_id
       and g.phase = 'entry' and g.kind = 'PREDECESSOR' and g.is_enabled
       and pb.actual_end is not null;
  end if;

  eff_start := coalesce(p_actual_start, ba.actual_start, v_hold_start);
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
           remarks = coalesce(nullif(p_remarks,''), remarks),
           -- 0081 · a value recorded now replaces an earlier skip; the skip stays in the audit trail.
           skip_reason = case when nullif(trim(v), '') is not null then null else skip_reason end,
           skipped_by  = case when nullif(trim(v), '') is not null then null else skipped_by end,
           skipped_at  = case when nullif(trim(v), '') is not null then null else skipped_at end
     where id = fld.id;
  end loop;

  -- 0081 · skips, each with its reason, its person and the server's time. Flagged, never silent.
  for sk_key, sk_reason in select * from jsonb_each_text(coalesce(p_skipped, '{}'::jsonb)) loop
    update batch_activity_value
       set skip_reason = trim(sk_reason),
           skipped_by = auth.uid(),
           skipped_at = entered_at,
           variance_flag = 'skipped',
           remarks = coalesce(nullif(p_remarks,''), remarks)
     where batch_activity_id = p_activity and field_key = sk_key;
  end loop;

  -- 0081 · required readings and checklist items. Lab work is exempt: its readings are lab results,
  -- held by the package rule (G03) above.
  if coalesce(ba.responsible_role::text, '') <> 'lab_tech' then
    select string_agg(bav.label, ', ' order by bav.display_order, bav.label) into missing_fields
      from batch_activity_value bav
     where bav.batch_activity_id = p_activity
       and bav.operator_input = 'required'
       and bav.skip_reason is null
       and case when bav.datatype = 'check' then coalesce(bav.actual_value, '') <> 'true'
                else nullif(trim(coalesce(bav.actual_value, '')), '') is null end;
  end if;

  select gv.reason into outstanding
  from public.evaluate_gates(p_activity, 'exit') gv
  where gv.kind = 'EVIDENCE_COMPLETE' and gv.verdict = 'fail'
  order by gv.ordering
  limit 1;

  if missing_fields is not null then
    outstanding := concat_ws(' · ', 'Record or skip with a reason: ' || missing_fields, outstanding);
  end if;

  if outstanding is not null then
    update batch_activity
       set state = 'IN_PROGRESS',
           actual_start = coalesce(actual_start, p_actual_start,
                                  case when ba.is_hold then v_hold_start else entered_at end),
           actual_end = coalesce(actual_end, p_actual_end),
           actual_recorded_at = entered_at,
           blocked_reason = null
     where id = p_activity;

    insert into audit_event (actor_id, actor_role, action, entity_table, entity_id,
                             after_state, reason)
    values (auth.uid(), public.current_app_role(),
            case when missing_fields is not null then 'submit_blocked_on_readings'
                 else 'submit_blocked_on_evidence' end,
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
         actual_start = coalesce(actual_start, p_actual_start,
                                  case when ba.is_hold then v_hold_start else entered_at end),
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
           'skipped', coalesce(p_skipped, '{}'::jsonb),
           'stated_by_submitter', (p_actual_start is not null or p_actual_end is not null))
         || case when ba.is_hold then jsonb_build_object('hold_start_source',
              case when p_actual_start is not null then 'stated'
                   when ba.actual_start is not null then 'already_recorded'
                   when v_hold_start is not null then 'predecessor_actual_end'
                   else 'unknown' end)
            else '{}'::jsonb end,
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

-- ── E-5 · evaluate_gates ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.evaluate_gates(p_activity uuid, p_phase text DEFAULT 'entry'::text)
 RETURNS TABLE(rule_id uuid, kind text, binding text, verdict text, reason text, is_enabled boolean, mapping_confidence text, conflict_id text, ordering integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ba        batch_activity;
  g         record;
  sub       jsonb;
  st        record;
  v_ok      boolean;
  v_vars    jsonb;
  v_verdict text;
  v_sub_ok  boolean;
  v_any_ok  boolean;
  v_fld     batch_activity_value;
  v_out_n   int;
  v_out_lbl text;
  v_actual  numeric;
  v_hours   numeric;
  v_remain  interval;
  v_machine text;
  v_stints_exist boolean;
  v_cp      int;
begin
  if p_phase not in ('entry','exit') then
    raise exception 'phase must be entry or exit, got %', p_phase;
  end if;

  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity: %', p_activity; end if;

  select exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'machine_usage'
  ) into v_stints_exist;

  for g in
    select gr.* from gate_rule gr
    where gr.process_activity_id = ba.process_activity_id
      and gr.phase = p_phase
    order by gr.ordering, gr.id
  loop
    v_vars := jsonb_build_object('scope_label', ba.scope_label);
    v_verdict := null;
    v_ok := null;

    if not g.is_enabled then
      v_verdict := 'skipped';

    elsif g.kind in ('FIELD_IN_RANGE','SENSOR_THRESHOLD')
          and g.mapping_confidence not in ('dictated','sop_direct') then
      v_verdict := 'skipped';

    elsif g.kind = 'PREDECESSOR' then
      select * into st from gate_predecessor_status(
        ba.master_batch_id, ba.instance_no, g.config->'activity_codes', g.predecessor_binding);
      v_ok := st.ok;
      -- 0051 · A rest measured from the PREDECESSOR'S ACTUAL END.
      -- The Turner: 8 h after THAT PILE'S OWN T1 end. Not T0 start + 24 h (F10),
      -- and not ELAPSED_TIME, which measures from this activity's own start.
      v_hours := nullif(g.config->>'min_rest_hr', '')::numeric;

      -- 0062 · The required rest is a property of the RULE, knowable long before anything
      -- finishes. 0051 populated it only inside `if v_ok` — i.e. only once the predecessor was
      -- already complete — so in the ordinary case the card read "rests not recorded h".
      if v_hours is not null then
        v_vars := v_vars || jsonb_build_object(
          -- `FM` strips trailing ZEROS but leaves the decimal POINT, so 8 renders as "8." and the
          -- card reads "rests 8. h". Trim the point too; 7.5 still renders as "7.5".
          'rest_required_hr', trim(trailing '.' from trim(to_char(v_hours, 'FM999990.99'))));

        if not v_ok then
          -- The predecessor has not finished. Say so, instead of a sentence that claims it did.
          v_vars := v_vars || jsonb_build_object(
            'rest_status',
            'That ' || coalesce(st.blocker_title, 'earlier activity') || ' has not finished yet.');

        elsif st.last_actual_end is null then
          -- Complete, but with no recorded end there is nothing to measure from. Refuse:
          -- treating an unknown end as "long enough ago" is how a rest gets skipped.
          v_ok := false;
          v_vars := v_vars || jsonb_build_object(
            'rest_remaining', 'unknown — no finish time recorded',
            'rest_status',
            'It is marked complete but carries no finish time, so the rest cannot be measured. '
            || 'Ask a supervisor to record the finish.');

        else
          v_remain := greatest(
            st.last_actual_end + make_interval(secs => (v_hours * 3600)::int) - now(),
            interval '0');
          v_ok := (v_remain = interval '0');
          v_vars := v_vars || jsonb_build_object(
            'predecessor_ended_at', to_char(st.last_actual_end, 'DD Mon HH24:MI'),
            'rest_remaining',       to_char(v_remain, 'HH24:MI'),
            'rest_status',
              'It finished at ' || to_char(st.last_actual_end, 'DD Mon HH24:MI')
              || ' — ' || to_char(v_remain, 'HH24:MI') || ' still to go.');
        end if;
      end if;

      v_vars := v_vars
        || jsonb_build_object('predecessor_label', st.blocker_title)
        || jsonb_build_object('stream_label',
             case when st.blocker_stream is null then null
                  else initcap(replace(st.blocker_stream, '_', ' ')) end);

    elsif g.kind in ('BOTH','EITHER_OR') then
      v_any_ok := false;
      v_ok := (g.kind = 'BOTH');
      for sub in select * from jsonb_array_elements(coalesce(g.config->'sub', '[]'::jsonb)) loop
        v_sub_ok := null;
        if sub->>'kind' = 'PREDECESSOR' then
          select * into st from gate_predecessor_status(
            ba.master_batch_id, ba.instance_no, sub->'activity_codes', sub->>'binding');
          v_sub_ok := st.ok;
          if not st.ok then
            v_vars := v_vars
              || jsonb_build_object('predecessor_label', st.blocker_title)
              || jsonb_build_object('stream_label',
                   case when st.blocker_stream is null then null
                        else initcap(replace(st.blocker_stream, '_', ' ')) end);
          end if;
        elsif sub->>'kind' = 'ELAPSED_TIME' then
          v_hours := nullif(sub->>'hours','')::numeric;
          v_sub_ok := ba.actual_start is not null and v_hours is not null
                      and now() >= ba.actual_start + make_interval(secs => (v_hours * 3600)::int);
        else
          v_sub_ok := null;
        end if;

        if g.kind = 'BOTH' then
          if v_sub_ok is false then v_ok := false; end if;
        elsif v_sub_ok is true then
          v_any_ok := true;
        end if;
      end loop;

      if g.kind = 'EITHER_OR' then v_ok := v_any_ok; end if;

    elsif g.kind = 'DAY0_DURATION' then
      if ba.day0_duration_hr is null then
        v_ok := false;
        v_vars := v_vars || jsonb_build_object(
          'required', 'not set' || coalesce(' (' || ba.tbd_marker || ')', ''),
          'remaining', 'unknown');
      elsif ba.unblocks_at is null then
        v_ok := false;
        v_remain := make_interval(secs => (ba.day0_duration_hr * 3600)::int);
        v_vars := v_vars || jsonb_build_object(
          'required', to_char(v_remain, 'HH24:MI'), 'remaining', 'not started');
      else
        v_ok := now() >= ba.unblocks_at;
        v_remain := greatest(ba.unblocks_at - now(), interval '0');
        v_vars := v_vars || jsonb_build_object(
          'required', to_char(make_interval(secs => (ba.day0_duration_hr * 3600)::int), 'HH24:MI'),
          'remaining', to_char(v_remain, 'HH24:MI'));
      end if;

    elsif g.kind = 'ELAPSED_TIME' then
      v_hours := nullif(g.config->>'hours','')::numeric;
      v_ok := ba.actual_start is not null and v_hours is not null
              and now() >= ba.actual_start + make_interval(secs => (v_hours * 3600)::int);
      v_vars := v_vars || jsonb_build_object(
        'elapsed', case when ba.actual_start is null then 'not started'
                        else round(extract(epoch from (now() - ba.actual_start)) / 3600, 1)::text end);

    elsif g.kind = 'EVIDENCE_COMPLETE' then
      select count(*)::int, string_agg(r.label, ', ' order by r.ordering)
        into v_out_n, v_out_lbl
      from batch_activity_evidence_req r
      where r.batch_activity_id = ba.id
        and r.gates_submission and r.satisfied_count < r.min_count;
      v_ok := coalesce(v_out_n, 0) = 0;
      v_vars := v_vars || jsonb_build_object(
        'outstanding_count', coalesce(v_out_n, 0)::text, 'outstanding_labels', v_out_lbl);

    elsif g.kind = 'FIELD_IN_RANGE' then
      select * into v_fld from batch_activity_value
       where batch_activity_id = ba.id and field_key = g.config->>'field_key';

      if not found or v_fld.actual_value is null
         or v_fld.actual_value !~ '^-?[0-9]+(\.[0-9]+)?$' then
        v_verdict := 'unevaluable';
        v_vars := v_vars || jsonb_build_object('actual', 'not recorded');
      else
        v_actual := v_fld.actual_value::numeric;
        v_ok := (v_fld.sop_min is null or v_actual >= v_fld.sop_min)
            and (v_fld.sop_max is null or v_actual <= v_fld.sop_max);
        v_vars := v_vars || jsonb_build_object(
          'actual', v_fld.actual_value,
          'min', coalesce(v_fld.sop_min::text, '—'),
          'max', coalesce(v_fld.sop_max::text, '—'));
      end if;

    elsif g.kind = 'MACHINE_STINT_CLOSED' then
      select m.code into v_machine from machine m where m.id = ba.assigned_machine_id;
      v_vars := v_vars || jsonb_build_object('machine_code', v_machine);

      if v_stints_exist then
        execute 'select not exists (select 1 from public.machine_usage mu'
                || ' where mu.batch_activity_id = $1 and mu.ended_at is null)'
          into v_ok using ba.id;
      else
        v_ok := true;
      end if;

    elsif g.kind = 'LAB_APPROVED' then
      -- 0054 · ENTERED IS NOT APPROVED.
      --
      -- Which laboratory activities are bound to hold THIS one, and has the latest decision
      -- on each of them approved it? `lab_checkpoint_activity` carries the pairing, so a
      -- per-bunker gate waits on its own bunker's assay and not on all three.
      --
      -- A REJECTED or ABSENT decision does not open the gate. Neither does a recorded
      -- result: a reading that nobody has approved is a reading, not an approval.
      select count(*)::int,
             count(*) filter (where lab.verdict = 'approved')::int,
             string_agg(distinct lab.checkpoint_code, ', ')
        into v_out_n, v_cp, v_out_lbl
      from (
        select lca.checkpoint_code,
               (select d.verdict from lab_decision d
                 where d.batch_activity_id = lba.id
                 order by d.seq desc limit 1) as verdict
          from batch_activity lba
          join lab_checkpoint_activity lca on lca.process_activity_id = lba.process_activity_id
          join lab_checkpoint cp on cp.checkpoint_map = lca.checkpoint_map
                                and cp.code = lca.checkpoint_code
         where lba.master_batch_id = ba.master_batch_id
           and lca.gates_activity_code = ba.code
           and cp.kind = 'GATE'
      ) lab;

      if coalesce(v_out_n, 0) = 0 then
        -- A gate rule with nothing bound to it cannot be evaluated. Passing would silently
        -- open production; failing would lock it for ever with no way to clear it. Say so.
        v_verdict := 'unevaluable';
        v_vars := v_vars || jsonb_build_object(
          'checkpoint', 'no laboratory checkpoint is bound to this activity');
      else
        v_ok := (v_cp = v_out_n);
        v_vars := v_vars || jsonb_build_object(
          'checkpoint', coalesce(v_out_lbl, '?'),
          'approved_count', v_cp::text,
          'required_count', v_out_n::text);
      end if;

    elsif g.kind = 'UNRESOLVED_DEPENDENCY' then
      -- 0082 · E-5 · THE SOURCE DOES NOT DEFINE WHEN THIS MAY START. It stays shut, and says which
      -- registered question it is waiting on. Opening it would invent the rule; so would a GM approval.
      v_ok := false;
      select cr.question into v_out_lbl from conflict_register cr where cr.conflict_id = g.conflict_id;
      v_vars := v_vars || jsonb_build_object(
        'conflict_id', g.conflict_id,
        'question', coalesce(v_out_lbl, 'the dependency is not defined'));

    elsif g.kind = 'GM_APPROVAL' then
      -- ── B6 · CHANGED FROM 0012's `v_ok := false`. ─────────────────────────
      -- The checkpoint number is the RULE's, not this function's: `s04` seeds `'{"checkpoint":3}'`
      -- on TN-LOAD, so which checkpoint gates which activity stays data.
      --
      -- `returned` does NOT open the gate. Only an approval does, and `approved_with_conditions` is
      -- an approval — §5 puts it beside APPROVE on the screen, and the conditions live in the
      -- mandatory reason, which the snapshot preserves.
      --
      -- The LATEST decision governs. A batch approved, returned, then approved again is at its third
      -- decision, and the first two stay on the record.
      v_cp := nullif(g.config->>'checkpoint','')::int;

      if v_cp is null then
        -- An approval rule that does not say WHICH checkpoint cannot be evaluated, and guessing at
        -- one would be inventing the process's own structure.
        v_verdict := 'unevaluable';
        v_vars := v_vars || jsonb_build_object('checkpoint', 'not stated on the rule');
      else
        v_ok := exists (
          select 1 from public.v_checkpoint_status s
           where s.master_batch_id = ba.master_batch_id
             and s.checkpoint_no = v_cp
             and s.latest_verdict in ('approved','approved_with_conditions'));
        v_vars := v_vars || jsonb_build_object('checkpoint', v_cp::text);
      end if;

    else
      v_verdict := 'unevaluable';
    end if;

    if v_verdict is null then
      v_verdict := case when v_ok then 'pass' when v_ok is null then 'unevaluable' else 'fail' end;
    end if;

    return query select
      g.id,
      g.kind,
      g.predecessor_binding,
      v_verdict,
      case when v_verdict = 'fail' then render_gate_reason(g.blocked_reason_template, v_vars) end,
      g.is_enabled,
      g.mapping_confidence,
      g.conflict_id,
      g.ordering;
  end loop;
end;
$function$;

notify pgrst, 'reload schema';
