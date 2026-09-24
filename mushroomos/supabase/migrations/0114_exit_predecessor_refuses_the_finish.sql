-- ─────────────────────────────────────────────────────────────────────────────
-- 0114 · AN EXIT PREDECESSOR GATE REFUSES THE FINISH (user ruling, 16 Sep 2026).
--
-- THE GAP. In PROCESS-2026J nothing in the dependency graph depends on TRN-P2-T3, TRN-P4-T3 or
-- TRN-P6-T3 ever completing:
--
--     select codes with no dependent  ->  TRN-P2-T3, TRN-P4-T3, TRN-P6-T3, FIB-WEIGH, TUN-DISCHARGE-3
--
-- Three of the six turner piles were dead-end physical work. A bunker could be sealed, and its
-- 63-hour hold begun, with only one pile of its pair turned. The documents call P1+P2 -> B1 "a real
-- physical grouping/dependency relationship, not just a UI label"; today it is only a label.
--
-- WHY THE FIX GOES HERE AND NOT ON THE GATE THAT LOOKS OBVIOUS.
--   · NOT the fill's ENTRY gate: the factory decided (SOP-C05, 14 Sep 2026, status 'decided') that
--     a bunker fill OPENS on the first pile of its pair. Adding the second pile there would delay a
--     physical start the factory has already ruled on.
--   · NOT the following hold's ENTRY gate: time_gate_status measures a hold's window from
--     max(actual_end) across its entry predecessors. Naming a pile there would run the 63-hour
--     bunker clock from a turner pass instead of from the moment the bunker was closed, silently
--     extending every bunker hold in the process.
--   · SO: the fill's EXIT. It opens on one pile and cannot be FINISHED until both are turned,
--     which is the first pair-dependent continuation point and leaves the hold's clock alone.
--
-- evaluate_gates already evaluates a PREDECESSOR rule in either phase. submit_activity consulted
-- the exit phase for two kinds only, so an exit PREDECESSOR rule was computed and discarded. This
-- file is that one missing block: no new engine, no new rule kind, no process data.
--
-- The rules themselves are process DATA and arrive in 0115 with PROCESS-2026K. Applied alone this
-- migration changes nothing for any batch, because no gate_rule of this shape exists yet.
--
-- Body: the live definition verbatim plus one declaration and one block.
-- Rollback: db-rollback/pre_0114__submit_activity.sql
-- ─────────────────────────────────────────────────────────────────────────────

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
  v_timed        boolean;
  v_time_reason  text;
  v_late         text;
  v_pair_reason  text;
begin
  perform public.assert_role(array['operator', 'supervisor', 'lab_tech']::app_role[], 'submit an activity');
  -- 0091 · the same role boundary as starting: production for supervisors, Lab work for the laboratory.
  perform public.assert_may_execute(p_activity, 'submit an activity');

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


  -- 0096 · A TIMED TASK IS TIMED BY THE SERVER. Its start is the Start tap and its end is the Finish
  -- tap; a stated time would let the SOP duration be written instead of waited for.
  v_timed := exists (select 1 from gate_rule g
                      where g.process_activity_id = ba.process_activity_id
                        and g.phase = 'exit' and g.kind = 'MIN_DURATION' and g.is_enabled);
  if v_timed and (p_actual_start is not null or p_actual_end is not null) then
    raise exception '% is timed by the server: it starts when Start is tapped and finishes when Finish is tapped. A start or finish time cannot be typed in.', ba.title
      using errcode = 'insufficient_privilege';
  end if;
  if v_timed and not ba.is_hold and ba.actual_start is null then
    raise exception '% has not been started, so it cannot be finished. Tap Start first; the server records when it began.', ba.title
      using errcode = 'check_violation';
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
    -- 0091 · a controlled choice accepts only its stated options (sop_value, '|'-separated).
    if fld.datatype = 'choice' and nullif(trim(v), '') is not null
       and not (trim(v) = any (string_to_array(coalesce(fld.sop_value, ''), '|'))) then
      raise exception '% must be one of: %. "%" was entered.', fld.label, replace(coalesce(fld.sop_value, ''), '|', ', '), v
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

  -- 0100 · LATE WORK NEEDS AN APPROVED TICKET. Past its due time (day plan + granted hours + grace) the
  -- task cannot be finished until Admin grants more time.
  v_late := public.late_block_reason(p_activity);
  if v_late is not null then
    raise exception '%', v_late using errcode = 'check_violation';
  end if;

  -- 0096 · THE TIME GATE, judged after this submission's readings are in place (a temperature trigger
  -- reads them). A refusal undoes the whole call, readings included.
  if v_timed then
    select gv.reason into v_time_reason
      from public.evaluate_gates(p_activity, 'exit') gv
     where gv.kind = 'MIN_DURATION' and gv.verdict = 'fail'
     order by gv.ordering limit 1;
    if v_time_reason is not null then
      raise exception '%', v_time_reason using errcode = 'check_violation';
    end if;
  end if;

  -- 0114 · AN EXIT PREDECESSOR IS A REAL REFUSAL, NOT A ROW NOBODY READS.
  --
  -- evaluate_gates has always evaluated a PREDECESSOR rule in either phase, but this function
  -- consulted the exit phase for exactly two kinds — MIN_DURATION and EVIDENCE_COMPLETE — so an
  -- exit PREDECESSOR rule was computed and then discarded. A rule that is stored, evaluated and
  -- ignored is worse than an absent one, because the process data claims a constraint the engine
  -- does not keep.
  --
  -- What needs it: bunker filling. The factory decided (SOP-C05, 14 Sep 2026) that a bunker fill
  -- OPENS on the first pile of its pair, so the entry gate names one pile and must keep naming
  -- one pile. But B1 holds P1 AND P2, and nothing may seal it while its second pile is still
  -- unturned — which, until now, left P2/P4/P6 as work nothing in the graph ever required.
  --
  -- Deliberately NOT an entry gate on the hold that follows: time_gate_status measures a hold
  -- from max(actual_end) over its entry predecessors, so naming a pile there would start the
  -- 63-hour bunker clock from a turner pass instead of from the moment the bunker was closed.
  select gv.reason into v_pair_reason
    from public.evaluate_gates(p_activity, 'exit') gv
   where gv.kind = 'PREDECESSOR' and gv.verdict = 'fail'
   order by gv.ordering limit 1;
  if v_pair_reason is not null then
    raise exception '%', v_pair_reason using errcode = 'check_violation';
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
$function$
;

revoke all on function public.submit_activity(uuid, jsonb, text, timestamptz, timestamptz, jsonb) from public, anon;
grant execute on function public.submit_activity(uuid, jsonb, text, timestamptz, timestamptz, jsonb) to authenticated;

notify pgrst, 'reload schema';
