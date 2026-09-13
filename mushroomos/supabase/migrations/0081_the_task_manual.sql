-- ─────────────────────────────────────────────────────────────────────────────
-- 0081 · The task manual.
--
-- The application knows HOW an SOP is executed; the SOP itself is data. This migration adds the
-- generic places an authored activity keeps what the person doing it needs, and the places a batch
-- keeps what doing it recorded. It writes NO process data: every new authoring column is empty or at
-- its neutral default until an Admin authors a draft.
--
--   AUTHORING (definition side)
--     process_activity.stage · instructions · skip_policy · parallel_group · notes
--     evidence_requirement.capture_phase     before_start | after_start | any
--     activity_field.datatype 'check'        a checklist item (numeric / text / duration as before)
--
--   EXECUTION (batch side)
--     batch_activity.started_by · skip_reason · skipped_by · skipped_at
--     batch_activity_value.datatype · skip_reason · skipped_by · skipped_at
--     batch_activity_evidence_req.capture_phase
--
--   RULES
--     start_activity      stamps who started; refuses while a before-start photograph is missing.
--     bind_evidence       refuses an after-start photograph before the work has started.
--     submit_activity     + p_skipped: a required reading or checklist item is recorded, or skipped
--                         with a reason (flagged 'skipped'); a finish missing one is held, like
--                         missing evidence, and says which. Lab work keeps its own package rule (G03).
--     complete_activity   + p_skipped; the live path refuses to finish production work never started.
--     skip_activity       a supervisor skips a whole task only where the SOP allows it, with a reason.
--
--   VIEWS
--     v_my_work           + stage, skip_policy, unblocks_at, started_by_name, finished_by_name
--     v_task_sheet        one activity as its manual: instructions, rule, record of who did what.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1 · authoring columns ─────────────────────────────────────────────────────────
alter table public.process_activity
  add column if not exists stage          text,
  add column if not exists instructions   text,
  add column if not exists skip_policy    text not null default 'not_allowed',
  add column if not exists parallel_group text,
  add column if not exists notes          text;

alter table public.process_activity drop constraint if exists process_activity_skip_policy_known;
alter table public.process_activity add constraint process_activity_skip_policy_known
  check (skip_policy in ('not_allowed', 'with_reason'));

alter table public.evidence_requirement
  add column if not exists capture_phase text not null default 'any';
alter table public.evidence_requirement drop constraint if exists evidence_requirement_capture_phase_known;
alter table public.evidence_requirement add constraint evidence_requirement_capture_phase_known
  check (capture_phase in ('before_start', 'after_start', 'any'));

-- 2 · execution columns ─────────────────────────────────────────────────────────
alter table public.batch_activity_evidence_req
  add column if not exists capture_phase text not null default 'any';
alter table public.batch_activity_evidence_req drop constraint if exists batch_activity_evidence_req_capture_phase_known;
alter table public.batch_activity_evidence_req add constraint batch_activity_evidence_req_capture_phase_known
  check (capture_phase in ('before_start', 'after_start', 'any'));

alter table public.batch_activity
  add column if not exists started_by  uuid references public.profiles(id),
  add column if not exists skip_reason text,
  add column if not exists skipped_by  uuid references public.profiles(id),
  add column if not exists skipped_at  timestamptz;

alter table public.batch_activity_value
  add column if not exists datatype    text,
  add column if not exists skip_reason text,
  add column if not exists skipped_by  uuid references public.profiles(id),
  add column if not exists skipped_at  timestamptz;

-- 3 · generate_activity_plan copies the new authored columns ─────────────────
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
         capture_hint, ordering, capture_phase)
      select new_id, er.key, er.label, er.media_kinds, er.min_count, er.gates_submission,
             er.capture_hint, er.ordering, er.capture_phase
      from evidence_requirement er
      where er.process_activity_id = a.id;
      n_ev := n_ev + (select count(*) from evidence_requirement where process_activity_id = a.id);

      insert into batch_activity_value
        (batch_activity_id, field_key, label, unit, sop_value, sop_min, sop_max,
         sop_source_ref, conflict_id, day0_value, variance_allowed, section,
         operator_input, display_order, datatype)
      select new_id, af.key, af.label, af.unit, af.sop_value, af.sop_min, af.sop_max,
             af.sop_source_ref, af.conflict_id,
             nullif(b.config->>('field_' || a.code || '_' || af.key), ''),
             af.default_variance, af.section, af.operator_input, af.display_order, af.datatype
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
$function$;

-- 4 · start_activity ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_activity(p_activity uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.assert_role(array['operator', 'supervisor', 'lab_tech']::app_role[], 'start an activity');

  perform public.assert_may_execute(p_activity, 'start an activity');
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

-- 5 · bind_evidence ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bind_evidence(p_activity uuid, p_requirement_key text, p_storage_path text, p_media_kind text DEFAULT 'photo'::text, p_supersedes uuid DEFAULT NULL::uuid, p_supersede_reason text DEFAULT NULL::text)
 RETURNS TABLE(media_id uuid, requirement_key text, satisfied_count integer, min_count integer, uploaded_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ba      batch_activity;
  req     batch_activity_evidence_req;
  obj     record;
  segs    text[];
  new_id  uuid;
  live    int;
begin
  if auth.uid() is null then
    raise exception 'bind_evidence needs a signed-in user — the uploader is taken from the JWT, never from a parameter'
      using errcode = 'insufficient_privilege';
  end if;

  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity: %', p_activity; end if;

  -- 5 · entitlement first, so an unauthorised caller learns nothing about the rest.
  if not public.can_capture_for_activity(p_activity) then
    raise exception
      'Not permitted: % may not capture evidence for %. Evidence is captured by the assigned '
      'operator or lab technician, or by a supervisor (ROLE_AND_APPROVAL_MODEL §2).',
      coalesce(public.current_app_role()::text, 'an unknown role'), ba.title
      using errcode = 'insufficient_privilege';
  end if;

  -- 3 · the requirement must be this activity's.
  select * into req from batch_activity_evidence_req
   where batch_activity_id = p_activity and key = p_requirement_key;
  if not found then
    raise exception 'Activity % has no evidence requirement named %', ba.title, p_requirement_key;
  end if;

  -- 0081 · a photograph authored as after_start cannot exist before the work began.
  if req.capture_phase = 'after_start' and ba.actual_start is null then
    raise exception '% is taken after the work has started. Tap Start first.', req.label
      using errcode = 'check_violation';
  end if;

  -- 4 · the kind must be one this requirement accepts.
  if not (p_media_kind = any (req.media_kinds)) then
    raise exception '% accepts % — % was offered',
      req.label, array_to_string(req.media_kinds, ' or '), p_media_kind;
  end if;

  -- 2 · the path must name this batch and this activity.
  segs := string_to_array(p_storage_path, '/');
  if array_length(segs, 1) <> 3
     or segs[1] <> ba.master_batch_id::text
     or segs[2] <> p_activity::text then
    raise exception
      'Storage path % does not belong to this activity. Expected %/%/<file>',
      p_storage_path, ba.master_batch_id, p_activity;
  end if;

  -- 1 · THE INTEGRITY RULE. The object has to be there already.
  select o.id, o.metadata into obj
    from storage.objects o
   where o.bucket_id = 'evidence' and o.name = p_storage_path;
  if not found then
    raise exception
      'No object at evidence/% — upload the file first, then bind it. A row claiming a photograph '
      'that is not in storage is a false record.', p_storage_path
      using errcode = 'no_data_found';
  end if;

  -- 0071 · AN EMPTY FILE IS NOT A PHOTOGRAPH.
  --
  -- The object-exists rule above asks whether something is in storage. It does not ask whether that
  -- something is anything. A zero-byte upload was accepted and bound, and satisfied the requirement
  -- outright — satisfied_count 1 of 1 — so an evidence gate could be cleared with nothing at all.
  -- That is not a hypothetical: a camera that fails, a file picker cancelled at the wrong instant
  -- and a dropped connection all produce exactly this, and the operator is then told they are done.
  --
  -- Found by uploading Buffer.alloc(0) as a real signed-in operator.
  if coalesce(nullif(obj.metadata->>'size', '')::bigint, 0) <= 0 then
    raise exception
      'The file uploaded for % is empty (0 bytes). That is usually a photograph that did not '
      'capture, or an upload cut short. Take it again.', req.label
      using errcode = 'check_violation';
  end if;

  -- 6 · already satisfied? Only an explicit retake may proceed.
  select count(*) into live from evidence_media
   where requirement_id = req.id and superseded_by_id is null;

  if p_supersedes is null and live >= req.min_count then
    raise exception
      '% already has % of % item(s). Pass the id of the item this one replaces, with a reason.',
      req.label, live, req.min_count;
  end if;

  if p_supersedes is not null then
    if coalesce(trim(p_supersede_reason), '') = '' then
      raise exception 'Replacing an evidence item needs a reason — the original is kept, not deleted';
    end if;
    if not exists (
      select 1 from evidence_media
       where id = p_supersedes and requirement_id = req.id and superseded_by_id is null
    ) then
      raise exception 'No live evidence item % on %', p_supersedes, req.label;
    end if;
  end if;

  insert into evidence_media (
    master_batch_id, batch_activity_id, requirement_id, requirement_key,
    storage_path, media_kind, mime_type, byte_size, uploaded_by
  ) values (
    ba.master_batch_id, p_activity, req.id, req.key,
    p_storage_path, p_media_kind,
    nullif(obj.metadata->>'mimetype', ''),
    nullif(obj.metadata->>'size', '')::bigint,
    auth.uid()
  )
  returning id into new_id;

  -- §6 — retaking does not delete. The original stays, pointing at what replaced it.
  if p_supersedes is not null then
    update evidence_media
       set superseded_by_id = new_id, superseded_reason = p_supersede_reason
     where id = p_supersedes;
  end if;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'bind_evidence', 'evidence_media', new_id::text,
          jsonb_build_object('activity', p_activity, 'requirement', req.key, 'path', p_storage_path),
          case when p_supersedes is null then 'Evidence captured for ' || req.label
               else 'Retake of ' || req.label || ': ' || p_supersede_reason end);

  return query
    select new_id, req.key, r.satisfied_count, r.min_count,
           (select m.uploaded_at from evidence_media m where m.id = new_id)
      from batch_activity_evidence_req r where r.id = req.id;
end;
$function$;

-- 6 · submit_activity gains p_skipped; the five-argument version is replaced ───
drop function if exists public.complete_activity(uuid, jsonb, text);
drop function if exists public.submit_activity(uuid, jsonb, text, timestamptz, timestamptz);
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
           actual_start = coalesce(actual_start, p_actual_start, entered_at),
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
           'skipped', coalesce(p_skipped, '{}'::jsonb),
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

-- 7 · complete_activity ────────────────────────────────────────────────────────
create or replace function public.complete_activity(
  p_activity uuid, p_values jsonb default '{}'::jsonb, p_remarks text default null::text,
  p_skipped jsonb default '{}'::jsonb)
 returns table(new_state text, out_of_range integer, outstanding_evidence text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  ba batch_activity;
begin
  -- 0081 · THE LIVE PATH FINISHES ONLY WHAT WAS STARTED.
  -- Finishing an unstarted task stamps start and end together and records work that took no time.
  -- Production work starts first (Start stamps who and when); a hold is not performed and a lab
  -- activity keeps its own sample-to-submit path. The paper-slip path (submit_activity with stated
  -- times) is unchanged.
  select * into ba from batch_activity where id = p_activity;
  if found and ba.actual_start is null and not ba.is_hold
     and coalesce(ba.responsible_role::text, '') <> 'lab_tech'
     and ba.state in ('READY', 'RETURNED') then
    raise exception '% has not been started, so it cannot be finished. Tap Start first; the server records when it began.', ba.title
      using errcode = 'check_violation';
  end if;

  -- Deliberately a thin delegation: submit_activity carries every rule. What this adds is the
  -- ABSENCE of the two time parameters, so a live client cannot state a time through it.
  return query select * from public.submit_activity(p_activity, p_values, p_remarks, null, null, p_skipped);
end;
$function$;

-- 8 · skip_activity ────────────────────────────────────────────────────────────
create or replace function public.skip_activity(p_activity uuid, p_reason text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  ba     batch_activity;
  b      master_batch;
  policy text;
begin
  perform public.assert_role(array['supervisor', 'admin', 'gm']::app_role[], 'skip a task');

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

-- 9 · views ────────────────────────────────────────────────────────────────────
-- v_my_work · the same rows and columns, and the task manual's first facts appended.
create or replace view public.v_my_work with (security_invoker = on) as
 SELECT ba.id AS activity_id,
    ba.master_batch_id,
    mb.code AS batch_code,
    ba.code,
    ba.title,
    ba.scope_label,
    ba.stream::text AS stream,
    ba.instance_no,
    ba.state::text AS state,
    ba.blocked_reason,
    ba.is_hold,
    ba.responsible_role::text AS responsible_role,
    ba.assigned_person_id,
    ba.assigned_machine_id,
    ba.baseline_start_hour,
    ba.baseline_end_hour,
    ba.planned_start_at,
    ba.planned_end_at,
    ba.actual_start,
    ba.actual_end,
    ba.variance_minutes,
    ev.required_count,
    ev.satisfied_total,
    ev.outstanding_labels,
    pa.stage,
    COALESCE(pa.skip_policy, 'not_allowed'::text) AS skip_policy,
    ba.unblocks_at,
    ps.display_name AS started_by_name,
    pf.display_name AS finished_by_name
   FROM batch_activity ba
     JOIN master_batch mb ON mb.id = ba.master_batch_id
     LEFT JOIN process_activity pa ON pa.id = ba.process_activity_id
     LEFT JOIN profiles ps ON ps.id = ba.started_by
     LEFT JOIN profiles pf ON pf.id = ba.submitted_by
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS required_count,
            sum(LEAST(r.satisfied_count, r.min_count))::integer AS satisfied_total,
            string_agg(r.label, ', '::text ORDER BY r.ordering) FILTER (WHERE r.satisfied_count < r.min_count) AS outstanding_labels
           FROM batch_activity_evidence_req r
          WHERE r.batch_activity_id = ba.id AND r.gates_submission) ev ON true
  WHERE mb.status = 'active'::batch_status AND (ba.assigned_person_id = auth.uid() OR (current_app_role() = ANY (ARRAY['supervisor'::app_role, 'manager'::app_role, 'admin'::app_role, 'gm'::app_role])));

-- v_task_sheet · one activity as its manual, and the record of who did what, by the server's clock.
create or replace view public.v_task_sheet with (security_invoker = on) as
select
  ba.id                         as activity_id,
  ba.master_batch_id,
  mb.code                       as batch_code,
  mb.status::text               as batch_status,
  pd.code                       as process_code,
  pd.version                    as process_version,
  ba.code,
  ba.title,
  pa.stage,
  ba.scope_label,
  ba.instance_no,
  ba.stream::text               as stream,
  ba.state::text                as state,
  ba.blocked_reason,
  ba.is_hold,
  ba.is_time_gate,
  ba.unblocks_at,
  ba.responsible_role::text     as responsible_role,
  pa.instructions,
  pa.admin_question,
  ba.golden_rule,
  ba.tbd_marker,
  coalesce(pa.skip_policy, 'not_allowed') as skip_policy,
  ba.duration_target_min_hr,
  ba.duration_target_max_hr,
  ba.day0_duration_hr,
  ba.baseline_start_hour,
  ba.baseline_end_hour,
  ba.planned_start_at,
  ba.planned_end_at,
  ba.actual_start,
  ba.started_by,
  ps.display_name               as started_by_name,
  ba.actual_end,
  ba.submitted_at,
  ba.submitted_by,
  pf.display_name               as finished_by_name,
  ba.skip_reason,
  ba.skipped_at,
  pk.display_name               as skipped_by_name,
  ba.variance_minutes,
  ba.variant_code,
  src.label                     as source_label,
  dst.label                     as destination_label,
  m.code                        as machine_code,
  (select string_agg(distinct lca.checkpoint_code, ', ')
     from lab_checkpoint_activity lca
    where lca.process_activity_id = ba.process_activity_id) as lab_checkpoint_codes
from batch_activity ba
join master_batch mb             on mb.id = ba.master_batch_id
left join process_activity pa    on pa.id = ba.process_activity_id
left join process_definition pd  on pd.id = pa.process_definition_id
left join profiles ps            on ps.id = ba.started_by
left join profiles pf            on pf.id = ba.submitted_by
left join profiles pk            on pk.id = ba.skipped_by
left join location src           on src.id = ba.source_location_id
left join location dst           on dst.id = ba.destination_location_id
left join machine m              on m.id = ba.assigned_machine_id;

grant select on public.v_my_work to authenticated;
grant select on public.v_task_sheet to authenticated;


revoke all on function public.submit_activity(uuid, jsonb, text, timestamptz, timestamptz, jsonb) from public, anon;
grant execute on function public.submit_activity(uuid, jsonb, text, timestamptz, timestamptz, jsonb) to authenticated, service_role;
revoke all on function public.complete_activity(uuid, jsonb, text, jsonb) from public, anon;
grant execute on function public.complete_activity(uuid, jsonb, text, jsonb) to authenticated, service_role;
revoke all on function public.skip_activity(uuid, text) from public, anon;
grant execute on function public.skip_activity(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
