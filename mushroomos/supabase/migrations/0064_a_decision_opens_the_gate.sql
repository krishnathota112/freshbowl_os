-- ─────────────────────────────────────────────────────────────────────────────
-- 0064 · A decision opens the gate.
--
-- FOUND BY RUNNING A BATCH, NOT BY READING
--   `scripts/dummy-batch.mjs` walked a real PROCESS-2026C batch end to end over HTTP as the real
--   roles. Everything passed until the last step:
--
--       GM approves                                        ✓
--       the decision is recorded with who made it          ✓
--       BNK-B1-FILL is now eligible                        ✗  still LOCKED
--
--   And, measured a second later on the same row:
--
--       stored state       LOCKED
--       stored reason      "LAB-BNK-LOAD: 0 of 1 approved. A recorded result is not an
--                           approved result."
--       evaluate_gates()   pass
--
--   The gate agreed it was open. The activity did not know.
--
-- WHY
--   `batch_activity.state` and `blocked_reason` are STORED columns, written by whatever last moved
--   the batch — `advance_batch`, `start_activity`, `submit_activity`. `decide_lab_submission`
--   recorded the decision, wrote the audit row, and returned. Nothing re-evaluated the activities
--   that decision had just released.
--
--   So in the shipped product a GM would approve, the screen would go on saying "0 of 1 approved",
--   and the eight held activities of PROCESS-2026C would stay held until something unrelated
--   happened to call `advance_batch` — which is revoked from `authenticated` and therefore never
--   runs on a user's behalf at all.
--
--   B4 was proved end to end in the test suite because those tests call `evaluate_gates` directly
--   and assert the VERDICT. The verdict was always right. The last mile — writing it down — was
--   never there.
--
-- WHAT THIS DOES
--   After recording the decision, re-evaluates the entry gates of exactly the activities this
--   checkpoint holds, and opens the ones that now pass. Ones that remain shut have their
--   `blocked_reason` refreshed, so an operator reads the CURRENT reason rather than a stale one.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   It does not call `advance_batch`. That would also release elapsed rests and start time gates
--   across the whole batch, and a laboratory approval is not a reason for any of that to happen as
--   a side effect. Only the activities named by
--   `lab_checkpoint_activity.gates_activity_code` for this checkpoint are touched.
--
--   It does not change who may decide, what a verdict means, or when a gate passes. `evaluate_gates`
--   is the authority on the last of those and is called, not reimplemented.
--
-- HOW THIS FILE WAS BUILT
--   By patching the DEPLOYED body between statement anchors, the way 0062 was, after 0062's first
--   attempt showed what retyping a function from a partial reading costs.
-- ─────────────────────────────────────────────────────────────────────────────

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
  held      record;
  gate_fail text;
  n_opened  int := 0;
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

  insert into lab_decision (batch_activity_id, verdict, reason, decided_by, decided_role,
                            authorised_under_reading, reading_was_enabled)
  values (p_activity, p_verdict, p_reason, auth.uid(), role_,
          reading.reading_code, reading.is_enabled)
  returning id into new_id;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), role_, 'decide_lab_submission', 'batch_activity', p_activity::text,
          jsonb_build_object('verdict', p_verdict, 'under_reading', reading.reading_code,
                             'reading_enabled', reading.is_enabled),
          p_verdict || ': ' || p_reason);
  /*
   * 0064 · THE DECISION MUST ACTUALLY OPEN THE GATE.
   *
   * Until this, the function recorded the decision and stopped. `evaluate_gates` would return
   * `pass` on the held activity from that moment — but `batch_activity.state` and
   * `blocked_reason` are STORED, and nothing rewrote them. So a GM approved, and the operator's
   * screen went on saying "LAB-BNK-LOAD: 0 of 1 approved" indefinitely.
   *
   * Only the activities THIS checkpoint holds are re-evaluated — not the whole batch. A lab
   * decision is not a reason to release rests or start time gates elsewhere, and calling
   * `advance_batch` here would make an approval do all of that as a side effect.
   */
  for held in
    select ba2.id, ba2.title, ba2.scope_label
      from batch_activity ba2
     where ba2.master_batch_id = ba.master_batch_id
       and ba2.state = 'LOCKED'
       and ba2.code in (
         select lca.gates_activity_code
           from lab_checkpoint_activity lca
          where lca.process_activity_id = ba.process_activity_id
            and lca.gates_activity_code is not null)
  loop
    select v.reason into gate_fail
      from evaluate_gates(held.id, 'entry') v
     where v.verdict = 'fail'
     order by v.ordering
     limit 1;

    if gate_fail is null then
      update batch_activity set state = 'READY', blocked_reason = null where id = held.id;
      n_opened := n_opened + 1;

      insert into audit_event (actor_id, actor_role, action, entity_table, entity_id,
                               after_state, reason)
      values (auth.uid(), role_, 'gate_opened', 'batch_activity', held.id::text,
              jsonb_build_object('opened_by_decision', new_id, 'verdict', p_verdict),
              held.title || ' — ' || coalesce(held.scope_label, 'whole batch')
              || ': released by the laboratory decision on ' || ba.title);
    else
      -- Still shut, and it now says why in the CURRENT rule's words rather than a stale sentence.
      update batch_activity
         set blocked_reason = gate_fail
       where id = held.id and coalesce(blocked_reason, '') <> gate_fail;
    end if;
  end loop;

  return new_id;
end;
$function$
;

do $a$
declare
  body text;
begin
  select prosrc into body from pg_proc where proname = 'decide_lab_submission';

  if position('gate_opened' in body) = 0 then
    raise exception '0064 failed: decide_lab_submission still does not open anything';
  end if;
  -- A MENTION IS NOT A CALL. The body explains in a comment why it does not call `advance_batch`,
  -- and an earlier version of this very assertion failed on its own explanation — the same mistake
  -- as counting a number inside a comment. Strip the comments, then look for an actual call.
  if regexp_replace(body, '--[^
]*', '', 'g') ~* '(perform|select)\s+(public\.)?advance_batch\s*\(' then
    raise exception
      '0064 failed: it calls advance_batch. A lab approval must not release rests or start time '
      'gates across the whole batch as a side effect.';
  end if;
  -- The refusals it already made must survive.
  if position('may not decide a lab submission' in body) = 0 then
    raise exception '0064 failed: the role refusal was lost';
  end if;
  if position('needs a stated reason' in body) = 0 then
    raise exception '0064 failed: the reason requirement was lost';
  end if;

  raise notice '0064 · decide_lab_submission now writes down what it opened';
end $a$;
