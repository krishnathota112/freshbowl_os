-- ─────────────────────────────────────────────────────────────────────────────
-- 0091 · Role boundaries, running-batch onboarding without H0, Lab value types.
--
-- From the current process baseline (14 Sep 2026) and the operating directive:
--   A · ROLE BOUNDARIES, ENFORCED BY THE SERVER (UI hiding is not security, baseline §10):
--       · a Supervisor executes production work only — never a Lab checkpoint;
--       · a Lab technician executes Lab checkpoints only — never production work;
--       · submit / skip now apply the same rule as start (assert_may_execute);
--       · collecting a post-H0 Lab sample and recording its result is Lab work; starting material
--         data (pre-H0) stays Admin (or Lab);
--       · photos: a Supervisor may capture for production work, a Lab technician for Lab work;
--       · Lab approvals: GM only (the "Supervisor accepts lab result" reading is not enabled);
--       · creating, setting H0 for, activating and onboarding a batch: Admin only (baseline §9, §11.1).
--   B · ONBOARDING WITHOUT H0 (baseline §2 "EXISTING running batch: original physical H0 is not
--       required merely to begin live tracking"): onboard_batch takes H0 optionally. Without it the
--       batch carries no H0 (no default instant is kept) and tracking starts at activation.
--   C · LAB VALUE TYPES: lab_parameter says whether a parameter is a number, an observation (text) or
--       a controlled choice; record_lab_result refuses a value of the wrong kind. Production readings
--       gain a 'choice' datatype (options in sop_value, '|'-separated), used for the Turner machine.
-- ─────────────────────────────────────────────────────────────────────────────

-- A1 · who may execute an activity
CREATE OR REPLACE FUNCTION public.assert_may_execute(p_activity uuid, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r   app_role;
  own app_role;
  ttl text;
begin
  select ba.responsible_role, ba.title into own, ttl
    from batch_activity ba where ba.id = p_activity;

  -- 0067 · NOT FOUND IS NOT THIS FUNCTION'S BUSINESS.
  -- Raising here turned start_activity's long-standing silent no-op on an unknown id into a 400,
  -- and failed a probe that was asking whether an OPERATOR MAY START WORK — not whether that
  -- particular uuid exists. Authorisation is the question; existence belongs to the caller.
  if not found then
    return;
  end if;

  r := public.current_app_role();

  -- 0091 · ROLE BOUNDARIES. A Supervisor performs production work (any non-Lab activity) and never a
  -- Lab checkpoint. A Lab technician performs Lab checkpoints only. Admin, Manager and GM do not
  -- execute field or Lab work. (Replaces the 0067 rule that let any supervisor-and-above run anything.)
  if r = 'supervisor' then
    if coalesce(own::text, '') = 'lab_tech' then
      raise exception '% is laboratory work. A supervisor performs production tasks; the laboratory performs this check.', ttl
        using errcode = 'insufficient_privilege';
    end if;
    return;
  end if;

  if r in ('manager', 'admin', 'gm') then
    raise exception '% is field work. A % does not perform field or laboratory tasks.', ttl, r
      using errcode = 'insufficient_privilege';
  end if;

  if own is null or r is distinct from own then
    raise exception
      '% is %''s work, not a %''s. A % may execute the work their role is responsible for; a '
      'supervisor may take eligible downstream work. Ask a supervisor to reassign it.',
      ttl, coalesce(own::text, 'nobody'), coalesce(r::text, 'caller with no role'),
      coalesce(r::text, 'caller with no role')
      using errcode = 'insufficient_privilege';
  end if;
end;
$function$;

-- A2 · submit: role boundary + controlled choices
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

-- A3 · skip: supervisor, production work only
CREATE OR REPLACE FUNCTION public.skip_activity(p_activity uuid, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ba     batch_activity;
  b      master_batch;
  policy text;
begin
  -- 0091 · skipping is a field decision taken by the Supervisor on production work.
  perform public.assert_role(array['supervisor']::app_role[], 'skip a task');
  perform public.assert_may_execute(p_activity, 'skip a task');

  select * into ba from batch_activity where id = p_activity for update;
  if not found then raise exception 'No such activity: %', p_activity; end if;

  select * into b from master_batch where id = ba.master_batch_id;
  if b.status <> 'active' then
    raise exception 'Batch % is %; only work on an active batch can be skipped.', b.code, b.status;
  end if;

  select pa.skip_policy into policy from process_activity pa where pa.id = ba.process_activity_id;
  if coalesce(policy, 'not_allowed') <> 'with_reason' then
    raise exception '% cannot be skipped: the SOP does not allow skipping it.', ba.title
      using errcode = 'check_violation';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Skipping % needs a reason.', ba.title using errcode = 'check_violation';
  end if;

  -- Only work that is open. A locked task is waiting on its gates, and skipping it would walk
  -- past them; finished work already happened.
  if ba.state not in ('READY', 'IN_PROGRESS', 'RETURNED') then
    raise exception '% is %, so it cannot be skipped.', ba.title, ba.state
      using errcode = 'check_violation';
  end if;

  update batch_activity
     set state = 'SKIPPED',
         skip_reason = trim(p_reason),
         skipped_by = auth.uid(),
         skipped_at = now(),
         blocked_reason = null
   where id = p_activity;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id,
                           before_state, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'skip_activity', 'batch_activity', p_activity::text,
          jsonb_build_object('state', ba.state),
          jsonb_build_object('state', 'SKIPPED', 'skipped_at', now()),
          trim(p_reason));

  perform public.advance_batch(ba.master_batch_id);
  return 'SKIPPED';
end;
$function$;

-- A4 · collecting a lab sample: laboratory only
CREATE OR REPLACE FUNCTION public.open_lab_sample(p_activity uuid, p_checkpoint uuid, p_label text DEFAULT NULL::text, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ba     batch_activity;
  cp     lab_checkpoint;
  at_    timestamptz;
  h0_    timestamptz;
  new_id uuid;
begin
  -- 0072 · WHO MAY COLLECT A SAMPLE.
  --
  -- There was no role check here at all. An OPERATOR could open a laboratory sample — measured,
  -- HTTP 200 — which every other laboratory entry point refuses. Sampling is laboratory work.
  -- 0091 · post-H0 sampling is laboratory work only (starting material data uses open_prebatch_sample).
  perform public.assert_role(array['lab_tech']::app_role[], 'collect a lab sample');

  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity: %', p_activity; end if;
  select * into cp from lab_checkpoint where id = p_checkpoint;
  if not found then raise exception 'No such lab checkpoint: %', p_checkpoint; end if;

  -- 0072 · A CORRECT READING FILED AGAINST THE WRONG CHECKPOINT IS A WRONG READING.
  --
  -- The activity was checked, and the checkpoint was checked, but never the two together. So a
  -- sample for one activity could be filed at any checkpoint in the catalogue — and because
  -- request_lab_test freezes the specification band from the SAMPLE's checkpoint, the same
  -- moisture reading was then judged against whichever band was chosen:
  --
  --     bound checkpoint      TUNNEL_LOAD    72.5 .. 74
  --     unrelated checkpoint  COMPOST_OUT    65   .. 68
  --
  -- Nothing about the resulting row looks wrong. That is what makes it dangerous.
  --
  -- lab_checkpoint_activity already states which checkpoints each activity performs, and every one
  -- of the 41 laboratory activities in PROCESS-2026C carries a binding, so there is always
  -- something to check against. Where an activity genuinely has no binding the rule cannot be
  -- applied and the sample is allowed, rather than inventing a pairing that the process does not
  -- state.
  -- 0076 · WITHIN ONE CHECKPOINT MAP, AND NOT ACROSS THEM.
  --
  -- 0072 required the checkpoint to be one this activity is bound to, full stop. That failed
  -- nineteen tests in lab.test.ts, which sample at S4B_COLUMNS/TUNNEL_LOAD while the activity's
  -- binding lives in LAB_2026A. Two different maps.
  --
  -- Whether an activity may legitimately be sampled at a checkpoint from another map is a factory
  -- question about the checkpoint model, and it is not mine to settle. What IS settled is the
  -- defect that was measured: within ONE map, a sample could be filed at any checkpoint, and the
  -- specification band comes from the sample's checkpoint, so the same reading could be judged
  -- against 72.5-74 or 65-68 at the technician's choice. Both checkpoints in that demonstration
  -- were LAB_2026A, so the narrowed rule still refuses it.
  --
  -- So: if this activity has bindings IN THE MAP the chosen checkpoint belongs to, the checkpoint
  -- must be one of them. A checkpoint from a map the activity has no bindings in is left alone,
  -- and reported rather than decided.
  if exists (select 1 from lab_checkpoint_activity lca
              where lca.process_activity_id = ba.process_activity_id
                and lca.checkpoint_map = cp.checkpoint_map)
     and not exists (
       select 1 from lab_checkpoint_activity lca
        where lca.process_activity_id = ba.process_activity_id
          and lca.checkpoint_code = cp.code
          and lca.checkpoint_map  = cp.checkpoint_map)
  then
    raise exception
      '% is not a checkpoint of %. That activity samples at %. Filing a reading under another '
      'checkpoint would judge it against that checkpoint''s band.',
      cp.code, ba.title,
      (select string_agg(distinct lca.checkpoint_code, ', ' order by lca.checkpoint_code)
         from lab_checkpoint_activity lca
        where lca.process_activity_id = ba.process_activity_id)
      using errcode = 'check_violation';
  end if;

  -- Same rule as every other recorded actual: not in the future. Consistent with 0016/0017/0021
  -- rather than a second opinion about time.
  at_ := coalesce(p_at, now());
  if at_ > now() then
    raise exception 'A sample cannot be collected in the future (% is ahead of now)', at_
      using errcode = 'invalid_datetime_format';
  end if;

  -- 0073 · NOR BEFORE THE BATCH EXISTED.
  --
  -- Only the future was refused, so a sample could be dated two days before H0 and accepted — a
  -- reading of material that had not been delivered yet, on record, feeding a checkpoint verdict.
  -- correct_actual already refuses exactly this ("the batch begins at X and nothing in it happened
  -- before that"); this is the same rule, applied where it was missing rather than a new opinion.
  --
  -- The incoming-material assay is deliberately NOT affected: it belongs before H0 by design, and
  -- it goes through open_prebatch_sample, which is a different function.
  select mb.start_at into h0_ from master_batch mb where mb.id = ba.master_batch_id;

  -- 0075 · ONLY ONCE THE CLOCK HAS ACTUALLY STARTED.
  --
  -- 0073 refused any sample dated before H0. That broke twenty existing tests, and they were right
  -- to break: a batch may be created with H0 in the FUTURE, and a sample taken today on a batch
  -- that starts next week is then "before H0" without anything being wrong. The comparison only
  -- means something once the batch clock has run — before that, "before H0" is just "now".
  --
  -- The attack the rule exists to stop is unaffected: a sample backdated two days on a batch whose
  -- H0 has already passed is still refused, because now() >= h0_ there.
  if h0_ is not null and now() >= h0_ and at_ < h0_ then
    raise exception
      'A sample for % cannot be dated %: the batch begins at % and nothing in it happened before '
      'that. The incoming-material assay is the one that precedes H0, and it is recorded '
      'separately.', ba.title, at_, h0_
      using errcode = 'invalid_datetime_format';
  end if;

  insert into lab_sample (checkpoint_id, master_batch_id, batch_activity_id, scope_ref,
                          vessel_id, sample_ref_label, collected_at, collected_by)
  values (cp.id, ba.master_batch_id, ba.id, ba.scope_label,
          ba.destination_location_id, p_label, at_, auth.uid())
  returning id into new_id;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'open_lab_sample', 'lab_sample', new_id::text,
          jsonb_build_object('checkpoint', cp.code, 'map', cp.checkpoint_map, 'activity', ba.title),
          'Sample collected at ' || cp.code || ' for ' || ba.title);
  return new_id;
end;
$function$;

-- A5 · photos: supervisor for production work, laboratory for Lab work
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
          or (public.current_app_role() = 'supervisor' and coalesce(ba.responsible_role::text, '') <> 'lab_tech')
          or (public.current_app_role() = 'lab_tech' and ba.responsible_role = 'lab_tech')
        )
    );
$function$;

-- A6 · create_master_batch: Admin only (baseline §9 — Admin creates / activates the batch)
CREATE OR REPLACE FUNCTION public.create_master_batch(p_code text, p_label text, p_start_date date, p_config jsonb, p_roles jsonb, p_supervisor text DEFAULT NULL::text, p_weather text DEFAULT NULL::text, p_start_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_process_definition_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_batch uuid;
  def       process_definition;
  r         jsonb;
  h0        timestamptz;
begin
  perform public.assert_role(array['admin']::app_role[], 'create a batch');

  -- WHICH STANDARD. Named by the caller, or the catalogue's. Never a literal.
  select * into def from process_definition
   where id = coalesce(p_process_definition_id, public.current_process_definition());

  if def.id is null then
    raise exception
      'No process definition to plan against. Either name one, or set the current standard: '
      'select public.set_current_process(''<definition id>'').'
      using errcode = 'invalid_parameter_value';
  end if;

  if def.status <> 'published' then
    raise exception
      'Cannot plan % against % v% — it is %. A draft standard can still change, and the '
      'baseline this batch freezes would then describe hours nobody stated.',
      p_code, def.code, def.version, def.status
      using errcode = 'check_violation';
  end if;

  -- An explicit H0 wins; otherwise the factory clock decides. `factory_h0_instant` returns
  -- NULL while `factory_clock.timezone` is unset, and a NULL here would recreate the exact
  -- defect 0030 exists to fix — so it is refused loudly, naming the one call that fixes it.
  h0 := coalesce(p_start_at, public.factory_h0_instant(p_start_date));
  if h0 is null then
    raise exception
      'Cannot create %: the factory timezone is not set, so H0 cannot be computed. '
      'Run select public.set_factory_timezone(''<IANA zone>'') once.', p_code
      using errcode = 'invalid_parameter_value';
  end if;

  insert into master_batch (code, label, process_definition_id, start_date, start_at, status,
                            supervisor_name, weather_note, config, created_by)
  values (p_code, p_label, def.id, p_start_date, h0, 'draft', p_supervisor, p_weather,
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
$function$;

-- A6 · activate_batch: Admin only (baseline §9 — Admin creates / activates the batch)
CREATE OR REPLACE FUNCTION public.activate_batch(p_batch_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  blockers   text;
  cur_status text;
begin
  perform public.assert_role(array['admin']::app_role[], 'activate a batch');

  select string_agg(message, '; ') into blockers
  from public.validate_batch(p_batch_id) where severity = 'blocking';

  if blockers is not null then
    raise exception 'Cannot activate — %', left(blockers, 400) using errcode = 'check_violation';
  end if;

  -- 0073 · ACTIVATION EITHER HAPPENS OR IS REFUSED. IT NEVER PRETENDS.
  --
  -- The update below has always been guarded by `status = 'draft'`, so an active or cancelled
  -- batch was never touched - the state machine was right. But the audit row at the end of this
  -- function ran unconditionally, and the function returns void, so:
  --
  --     activate a CANCELLED batch  ->  HTTP 204, nothing changed,
  --                                     and 'activate_batch / Baseline frozen' in the trail
  --
  -- A trail that records a baseline freeze that did not happen is worse than a silent no-op,
  -- because it is evidence of something untrue. Same shape as start_activity in 0071.
  --
  -- Re-activating an ALREADY ACTIVE batch stays silent and successful: an admin whose phone lost
  -- the response needs to be able to try again. Re-activating a CANCELLED one is refused, because
  -- cancellation is terminal and the caller is asking for something that will not happen.
  update master_batch
     set status = 'active', activated_at = now(), activated_by = auth.uid()
   where id = p_batch_id and status = 'draft';

  if not found then
    select mb.status::text into cur_status from master_batch mb where mb.id = p_batch_id;

    if cur_status is null then
      raise exception 'No such batch: %', p_batch_id using errcode = 'no_data_found';
    end if;

    if cur_status = 'active' then
      return;                      -- already done; a retry, not an error
    end if;

    raise exception
      'This batch is %, so it cannot be activated. Cancellation is final — create a new batch '
      'rather than restarting this one.', cur_status
      using errcode = 'check_violation';
  end if;

  -- Whatever the gates say is available becomes available. Nothing else.
  perform public.advance_batch(p_batch_id);

  insert into notification (master_batch_id, to_role, kind, message, sent_by)
  select p_batch_id, ba.responsible_role, 'gate_opened', ba.title || ' is ready', auth.uid()
  from batch_activity ba
  where ba.master_batch_id = p_batch_id and ba.state = 'READY';

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'activate_batch', 'master_batch',
          p_batch_id::text, 'Baseline frozen');
end;
$function$;

-- A6 · set_batch_start_at: Admin only (baseline §9 — Admin creates / activates the batch)
CREATE OR REPLACE FUNCTION public.set_batch_start_at(p_batch uuid, p_start_at timestamp with time zone)
 RETURNS TABLE(activities_repointed integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b master_batch;
begin
  perform public.assert_role(array['admin']::app_role[], 'set H0');

  select * into b from master_batch where id = p_batch;
  if not found then raise exception 'No such batch: %', p_batch; end if;
  if b.status <> 'draft' then
    raise exception 'Batch % is % — H0 is frozen at activation', b.code, b.status;
  end if;
  if p_start_at is null then
    raise exception 'H0 is mandatory and never defaults. TIME_CONTRACT §1.1';
  end if;

  update master_batch set start_at = p_start_at where id = p_batch;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'set_batch_start_at', 'master_batch',
          p_batch::text, jsonb_build_object('start_at', p_start_at), 'H0 set');

  return query select public.repoint_batch_activities(p_batch);
end;
$function$;

-- A7 · Lab approvals are decided by the GM (baseline §9: the Supervisor does not perform Lab approvals).
update public.lab_approval_reading set is_enabled = false where reading_code <> 'GM_APPROVES_EVERY_LAB_SUBMISSION';
update public.lab_approval_reading set is_enabled = true  where reading_code = 'GM_APPROVES_EVERY_LAB_SUBMISSION';
insert into public.audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
values (null, null, 'lab_approval_reading_enabled', 'lab_approval_reading', 'GM_APPROVES_EVERY_LAB_SUBMISSION',
        jsonb_build_object('is_enabled', true),
        '0091 · current process baseline 14 Sep 2026 §9: GM approves; the Supervisor does not perform Lab approvals');

-- B1 · onboard_batch: Admin only; actual H0 optional
drop function if exists public.onboard_batch(uuid, timestamp with time zone, uuid[], text[], text);
CREATE OR REPLACE FUNCTION public.onboard_batch(p_batch uuid, p_h0 timestamp with time zone DEFAULT NULL::timestamp with time zone, p_positions uuid[] DEFAULT '{}'::uuid[], p_completed_streams text[] DEFAULT '{}'::text[], p_note text DEFAULT NULL::text)
 RETURNS TABLE(before_tracking_count integer, position_count integer, open_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b          master_batch;
  v_pos      uuid[] := coalesce(p_positions, '{}');
  v_done     text[] := coalesce(p_completed_streams, '{}');
  v_seed     uuid[];
  v_before   uuid[] := '{}';
  v_frontier uuid[];
  v_next     uuid[];
  bad        text;
begin
  perform public.assert_role(array['admin']::app_role[], 'onboard a running batch');

  select * into b from master_batch where id = p_batch for update;
  if not found then raise exception 'No such batch: %', p_batch; end if;
  if b.status <> 'draft' then
    raise exception 'Batch % is %; only a batch still being set up can be onboarded.', b.code, b.status
      using errcode = 'check_violation';
  end if;
  -- 0091 · the original physical start is NOT required to begin tracking (baseline §2).
  if p_h0 is not null and p_h0 > now() then
    raise exception 'The actual H0 of a running batch cannot be in the future (% is ahead of now).', p_h0
      using errcode = 'check_violation';
  end if;
  if cardinality(v_pos) = 0 and cardinality(v_done) = 0 then
    raise exception 'Give the current position of at least one stream.' using errcode = 'check_violation';
  end if;

  select string_agg(p::text, ', ') into bad
    from unnest(v_pos) p
   where not exists (select 1 from batch_activity ba
                      where ba.id = p and ba.master_batch_id = p_batch
                        and coalesce(ba.responsible_role::text, '') <> 'lab_tech');
  if bad is not null then
    raise exception 'These positions are not production activities of batch %: %', b.code, bad
      using errcode = 'check_violation';
  end if;

  select string_agg(distinct ba.stream::text, ', ') into bad
    from batch_activity ba
   where ba.id = any(v_pos) and ba.stream::text = any(v_done);
  if bad is not null then
    raise exception 'Stream % is given both a current activity and "completed". Choose one.', bad
      using errcode = 'check_violation';
  end if;

  -- H0 first, so every planned instant is repointed from the actual start. Without an actual H0 the
  -- draft's default instant is removed rather than kept as if it were known, and nothing is planned
  -- against it; live tracking starts at activation.
  if p_h0 is not null then
    perform public.set_batch_start_at(p_batch, p_h0);
  else
    update master_batch set start_at = null where id = p_batch;
    perform public.repoint_batch_activities(p_batch);
  end if;

  -- Streams completed before tracking: all of their production work.
  select coalesce(array_agg(ba.id), '{}') into v_seed
    from batch_activity ba
   where ba.master_batch_id = p_batch and ba.stream::text = any(v_done)
     and coalesce(ba.responsible_role::text, '') <> 'lab_tech';
  v_before := v_seed;

  -- Everything each position and each completed step depends on, transitively, from the process's own
  -- PREDECESSOR rules. Nothing is inferred beyond the dependencies the process states.
  v_frontier := v_pos || v_seed;
  loop
    select coalesce(array_agg(distinct pred.id), '{}') into v_next
      from batch_activity cur
      join gate_rule g
        on g.process_activity_id = cur.process_activity_id
       and g.phase = 'entry' and g.kind = 'PREDECESSOR' and g.is_enabled
      join batch_activity pred
        on pred.master_batch_id = cur.master_batch_id
       and pred.code in (select jsonb_array_elements_text(g.config->'activity_codes'))
       and (coalesce(g.predecessor_binding, 'ALL_INSTANCES') <> 'SAME_SCOPE_INSTANCE'
            or pred.instance_no = cur.instance_no)
     where cur.id = any(v_frontier)
       and not pred.id = any(v_before);
    exit when cardinality(v_next) = 0;
    v_before := v_before || v_next;
    v_frontier := v_next;
  end loop;

  select string_agg(ba.title, ', ') into bad from batch_activity ba where ba.id = any(v_pos) and ba.id = any(v_before);
  if bad is not null then
    raise exception 'These positions come before another position you gave in the same stream: %. Give only the current step of each stream.', bad
      using errcode = 'check_violation';
  end if;

  -- Lab checkpoints of work that happened before tracking are before tracking. A GATE checkpoint that
  -- guards a position is too: the factory is already past it. A RECORD / DECISION checkpoint of a
  -- position stays live, because that reading may still be due.
  v_before := v_before || coalesce((
    select array_agg(distinct lba.id)
      from batch_activity lba
      join lab_checkpoint_activity lca on lca.process_activity_id = lba.process_activity_id
      join lab_checkpoint lc on lc.code = lca.checkpoint_code and lc.checkpoint_map = lca.checkpoint_map
     where lba.master_batch_id = p_batch
       and (lca.gates_activity_code in (select ba.code from batch_activity ba where ba.id = any(v_before))
            or (lc.kind = 'GATE'
                and lca.gates_activity_code in (select ba.code from batch_activity ba where ba.id = any(v_pos))))
       and not lba.id = any(v_before)), '{}');

  update batch_activity
     set state = 'SKIPPED',
         before_tracking = true,
         skip_reason = 'Before MushroomOS tracking — batch onboarded '
                       || coalesce('with actual H0 ' || to_char(p_h0 at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI'),
                                   'without a recorded H0'),
         skipped_at = now(),
         blocked_reason = null
   where id = any(v_before);

  update batch_activity
     set state = 'READY',
         onboarded_position = true,
         blocked_reason = null
   where id = any(v_pos);

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'onboard_batch', 'master_batch', p_batch::text,
          jsonb_build_object('actual_h0', p_h0,
                             'positions', (select jsonb_agg(jsonb_build_object('code', ba.code, 'stream', ba.stream, 'title', ba.title))
                                             from batch_activity ba where ba.id = any(v_pos)),
                             'completed_streams', to_jsonb(v_done),
                             'before_tracking_count', cardinality(v_before)),
          coalesce(nullif(trim(p_note), ''), 'Running batch onboarded at its current position'));

  perform public.activate_batch(p_batch);

  return query
    select cardinality(v_before), cardinality(v_pos),
           (select count(*)::int from batch_activity where master_batch_id = p_batch and state = 'READY');
end;
$function$;
revoke all on function public.onboard_batch(uuid, timestamp with time zone, uuid[], text[], text) from public, anon;
grant execute on function public.onboard_batch(uuid, timestamp with time zone, uuid[], text[], text) to authenticated, service_role;

-- B2 · validate_batch: an onboarded batch does not need H0
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
    where mb.id = p_batch and mb.start_at is null
      -- 0091 · a running batch onboarded at its current position may begin tracking without an H0.
      and not exists (select 1 from batch_activity ba
                       where ba.master_batch_id = mb.id and (ba.onboarded_position or ba.before_tracking));

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
             then 'No initial material data is recorded. Enter the pre-H0 material values before '
                  || 'activating the batch.'
             else 'This batch was activated with no incoming-material check on record. It cannot be '
                  || 'added retrospectively, so the gap stands on the record (client decision 2).'
           end,
           null::uuid
    from master_batch mb
    where mb.id = p_batch
      and not exists (select 1 from v_prebatch_material_check c
                       where c.master_batch_id = mb.id);

  return query
    -- 0085 · recorded and flagged, never a block: it is the batch's starting information.
    select 'warning',
           'MATERIAL_FAILED',
           'The initial material data on ' || c.checkpoint_code || ' has ' || c.failed
             || ' value(s) outside spec. Recorded as the starting material information and flagged.',
           null::uuid
    from v_prebatch_material_check c
    where c.master_batch_id = p_batch and c.failed > 0;

  -- 0085 · MATERIAL_NOT_ACCEPTED removed. Initial material data is recorded by Admin as the batch's
  -- starting information; nobody accepts it (operating flow, 14 Sep 2026).

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
$function$;

-- C1 · what kind of value each Lab parameter takes
create table if not exists public.lab_parameter (
  code        text primary key,
  label       text not null,
  value_kind  text not null check (value_kind in ('numeric', 'observation', 'choice')),
  choices     text[],
  unit        text,
  source_ref  text not null,
  check ((value_kind = 'choice') = (choices is not null and cardinality(choices) > 0))
);
alter table public.lab_parameter enable row level security;
drop policy if exists lab_parameter_read on public.lab_parameter;
create policy lab_parameter_read on public.lab_parameter for select to authenticated using (true);
grant select on public.lab_parameter to authenticated;

insert into public.lab_parameter (code, label, value_kind, choices, unit, source_ref) values
  ('moisture_pct',    'Moisture',           'numeric',     null, '%',  'LAB-2026A'),
  ('ph',              'pH',                 'numeric',     null, null, 'LAB-2026A'),
  ('ec',              'EC',                 'numeric',     null, null, 'LAB-2026A'),
  ('tds',             'TDS',                'numeric',     null, null, 'LAB-2026A'),
  ('dry_weight',      'Dry weight',         'numeric',     null, null, 'LAB-2026A'),
  ('n_pct',           'Nitrogen',           'numeric',     null, '%',  'LAB-2026A'),
  ('ash_pct',         'Ash',                'numeric',     null, '%',  'LAB-2026A'),
  ('cn_ratio',        'C:N ratio',          'numeric',     null, null, 'LAB-2026A'),
  ('bunker_height',   'Bunker height',      'numeric',     null, null, 'LAB-2026A'),
  ('shrunken_height', 'Shrunken height',    'numeric',     null, null, 'LAB-2026A'),
  ('tunnel_height',   'Tunnel height',      'numeric',     null, null, 'LAB-2026A'),
  ('smell',           'Smell',              'observation', null, null, 'Operating directive 14 Sep 2026 §10: Smell = observation'),
  ('colour',          'Colour',             'observation', null, null, 'Operating directive 14 Sep 2026 §10: Colour = observation'),
  ('spring',          'Spring / squeeze',   'choice',      array['Too dry', 'Normal', 'Too wet', 'Dripping'], null,
   'Operating directive 14 Sep 2026 §10: Spring/squeeze = Too dry / Normal / Too wet / Dripping'),
  ('actinomycetes',   'Actinomycetes',      'observation', null, null,
   'Baseline §6 final QC lists actinomycetes; its value type is not stated — recorded as an observation (text), no range invented')
on conflict (code) do nothing;

-- C2 · record_lab_result: who records, and the right kind of value
CREATE OR REPLACE FUNCTION public.record_lab_result(p_test uuid, p_numeric numeric DEFAULT NULL::numeric, p_text text DEFAULT NULL::text, p_instrument uuid DEFAULT NULL::uuid, p_invalid_reason text DEFAULT NULL::text, p_raw jsonb DEFAULT NULL::jsonb, p_measured_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t        lab_test;
  inst     lab_instrument;
  cal      lab_calibration_status := 'unknown';
  at_      timestamptz;
  existing int;
  new_id   uuid;
  s_act    uuid;
  lp       lab_parameter;
begin
  select * into t from lab_test where id = p_test;
  if not found then raise exception 'No such lab test: %', p_test; end if;

  -- 0091 · WHO. A result on a checkpoint of a running batch is laboratory work. Starting material data
  -- (a pre-H0 sample with no activity) is recorded by Admin, or by the laboratory.
  select s.batch_activity_id into s_act from lab_sample s where s.id = t.sample_id;
  if s_act is not null then
    perform public.assert_role(array['lab_tech']::app_role[], 'record a laboratory result');
  else
    perform public.assert_role(array['admin', 'lab_tech']::app_role[], 'record starting material data');
  end if;

  -- 0091 · WHAT KIND OF VALUE. A number where the parameter is measured, text where it is observed,
  -- one of the stated options where it is a controlled choice. An invalid-result record carries no value.
  select * into lp from lab_parameter where code = t.parameter_code;
  if found and p_invalid_reason is null then
    if lp.value_kind = 'numeric' and p_numeric is null then
      raise exception '% is measured: enter a number.', lp.label using errcode = 'invalid_text_representation';
    elsif lp.value_kind <> 'numeric' and p_numeric is not null then
      raise exception '% is not a number: record what is observed.', lp.label using errcode = 'invalid_text_representation';
    elsif lp.value_kind = 'observation' and nullif(trim(p_text), '') is null then
      raise exception '% is an observation: describe it.', lp.label using errcode = 'invalid_text_representation';
    elsif lp.value_kind = 'choice' and not (coalesce(trim(p_text), '') = any (lp.choices)) then
      raise exception '% must be one of: %.', lp.label, array_to_string(lp.choices, ', ')
        using errcode = 'invalid_text_representation';
    end if;
  end if;

  select count(*) into existing from lab_result where test_id = p_test;
  if existing > 0 then
    raise exception
      'A result already exists for this test. Results are immutable and versioned — order a '
      'retest instead, which preserves the original (LAB_MODEL §5).'
      using errcode = 'unique_violation';
  end if;

  at_ := coalesce(p_measured_at, now());
  if at_ > now() then
    raise exception 'A measurement cannot be recorded in the future (% is ahead of now)', at_
      using errcode = 'invalid_datetime_format';
  end if;

  -- Calibration status is DERIVED where it can be, and 'unknown' where it cannot. No source gives
  -- a calibration interval in days, so an instrument without one reports 'unknown' — never
  -- 'valid'. Rule 2: the absence is stated, not defaulted away.
  if p_instrument is not null then
    select * into inst from lab_instrument where id = p_instrument;
    if not found then raise exception 'No such instrument: %', p_instrument; end if;
    if inst.last_calibrated_on is null or inst.calibration_interval_days is null then
      cal := 'unknown';
    elsif inst.last_calibrated_on + inst.calibration_interval_days >= current_date then
      cal := 'valid';
    else
      cal := 'expired';
    end if;
  end if;

  insert into lab_result (test_id, version, value_numeric, value_text, unit,
                          target_min, target_max, invalid_reason, measured_at, technician_id,
                          instrument_id, calibration_status, calibrated_on, raw_readings)
  values (t.id, 1, p_numeric, p_text, t.target_unit,
          t.target_min, t.target_max, p_invalid_reason, at_, auth.uid(),
          p_instrument, cal, inst.last_calibrated_on, p_raw)
  returning id into new_id;

  update lab_test set state = 'reported' where id = t.id;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  select auth.uid(), public.current_app_role(), 'record_lab_result', 'lab_result', new_id::text,
         jsonb_build_object('parameter', t.parameter_code, 'value',
                            coalesce(p_numeric::text, p_text), 'verdict', r.verdict),
         t.parameter_code || ' = ' || coalesce(p_numeric::text, p_text, 'invalid')
           || ' · ' || r.verdict
  from lab_result r where r.id = new_id;
  return new_id;
end;
$function$;

-- C3 · order_retest: laboratory only, and the right kind of value
CREATE OR REPLACE FUNCTION public.order_retest(p_test uuid, p_reason lab_retest_reason, p_numeric numeric DEFAULT NULL::numeric, p_text text DEFAULT NULL::text, p_instrument uuid DEFAULT NULL::uuid, p_invalid_reason text DEFAULT NULL::text, p_measured_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t        lab_test;
  head     lab_result;
  inst     lab_instrument;
  cal      lab_calibration_status := 'unknown';
  at_      timestamptz;
  new_id   uuid;
  n_prior  int;
  escalate int;
  lp       lab_parameter;
begin
  select * into t from lab_test where id = p_test;
  if not found then raise exception 'No such lab test: %', p_test; end if;

  select * into head from lab_result
   where test_id = p_test and superseded_by_result_id is null;
  if not found then
    raise exception
      'There is nothing to retest — no result has been recorded for this test yet.'
      using errcode = 'no_data_found';
  end if;

  -- ROLE. `ROLE_AND_APPROVAL_MODEL` ticks "Order retest" for Lab and Supervisor and nobody else,
  -- and `LAB_MODEL §5` says why: "An operator cannot make a failing number go away."
  -- 0091 · measuring again is laboratory work: the Supervisor no longer enters Lab values.
  if public.current_app_role() is not null
     and public.current_app_role() not in ('lab_tech') then
    raise exception
      'A % may not order a retest. Measuring again is laboratory work — only the laboratory records a new value.',
      public.current_app_role()
      using errcode = 'insufficient_privilege';
  end if;

  -- 0091 · the retest value is the same kind as the parameter's definition.
  select * into lp from lab_parameter where code = t.parameter_code;
  if found and p_invalid_reason is null then
    if lp.value_kind = 'numeric' and p_numeric is null then
      raise exception '% is measured: enter a number.', lp.label using errcode = 'invalid_text_representation';
    elsif lp.value_kind <> 'numeric' and p_numeric is not null then
      raise exception '% is not a number: record what is observed.', lp.label using errcode = 'invalid_text_representation';
    elsif lp.value_kind = 'observation' and nullif(trim(p_text), '') is null then
      raise exception '% is an observation: describe it.', lp.label using errcode = 'invalid_text_representation';
    elsif lp.value_kind = 'choice' and not (coalesce(trim(p_text), '') = any (lp.choices)) then
      raise exception '% must be one of: %.', lp.label, array_to_string(lp.choices, ', ')
        using errcode = 'invalid_text_representation';
    end if;
  end if;

  at_ := coalesce(p_measured_at, now());
  if at_ > now() then
    raise exception 'A measurement cannot be recorded in the future (% is ahead of now)', at_
      using errcode = 'invalid_datetime_format';
  end if;

  if p_instrument is not null then
    select * into inst from lab_instrument where id = p_instrument;
    if not found then raise exception 'No such instrument: %', p_instrument; end if;
    if inst.last_calibrated_on is null or inst.calibration_interval_days is null then
      cal := 'unknown';
    elsif inst.last_calibrated_on + inst.calibration_interval_days >= current_date then
      cal := 'valid';
    else
      cal := 'expired';
    end if;
  end if;

  -- ⚠ ORDER MATTERS. `uq_lab_result_one_head` is a partial unique index, checked at the end of
  -- every statement and impossible to defer, so the outgoing head must be demoted BEFORE the new
  -- one is inserted. That means knowing the new id first, and pointing at a row that does not exist
  -- yet — which is why `lab_result_superseded_fk` is DEFERRABLE INITIALLY DEFERRED.
  new_id := gen_random_uuid();

  -- The original is PRESERVED and pointed forward. It is never deleted and never hidden.
  update lab_result set superseded_by_result_id = new_id where id = head.id;

  -- The new version carries the SAME frozen band as the original. That is the point of freezing:
  -- v1 and v2 are comparable because they were judged against one band.
  insert into lab_result (id, test_id, version, value_numeric, value_text, unit,
                          target_min, target_max, invalid_reason, measured_at, technician_id,
                          instrument_id, calibration_status, calibrated_on,
                          retest_reason, supersedes_result_id)
  values (new_id, t.id, head.version + 1, p_numeric, p_text, t.target_unit,
          t.target_min, t.target_max, p_invalid_reason, at_, auth.uid(),
          p_instrument, cal, inst.last_calibrated_on, p_reason, head.id);

  select count(*) into n_prior from lab_result where test_id = p_test and version > 1;
  select int_value into escalate from lab_setting where key = 'retest_escalation_above';

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'order_retest', 'lab_result', new_id::text,
          jsonb_build_object('parameter', t.parameter_code, 'version', head.version + 1,
                             'reason', p_reason, 'supersedes', head.id),
          t.parameter_code || ' retested (' || p_reason || '), v' || head.version
            || ' preserved'
          || case when escalate is not null and n_prior > escalate
                  then ' · escalates to the GM: ' || n_prior || ' retests on one test'
                  else '' end);
  return new_id;
end;
$function$;

notify pgrst, 'reload schema';
