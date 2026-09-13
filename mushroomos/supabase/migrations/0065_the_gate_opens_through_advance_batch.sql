-- ─────────────────────────────────────────────────────────────────────────────
-- 0065 · The gate opens through `advance_batch`, like everything else.
--
-- CORRECTING 0064
--   0064 fixed a real defect: `decide_lab_submission` recorded an approval and never wrote the
--   release down, so a GM approved and the held activity stayed LOCKED forever. That diagnosis
--   stands and the fix was needed.
--
--   The MECHANISM was wrong. 0064 re-evaluated the held activities itself and set their state
--   directly, which made `decide_lab_submission` the tenth writer of `batch_activity.state`.
--   `gates.test.ts` refused it immediately, in the words of the rule it exists to defend:
--
--       "A new writer of batch_activity.state appeared. Either route it through advance_batch,
--        or add it to SANCTIONED with the reason it is an actor transition rather than a gate."
--
--   It is not an actor transition. Opening a held activity because a gate now passes is precisely
--   what `advance_batch` is for — it is the one gate-driven writer, and `submit_activity` and
--   `release_activity` already delegate to it for exactly this. 0064's stated objection, that a
--   lab approval should not release rests batch-wide as a side effect, was mine rather than the
--   project's, and those two functions had already settled the question the other way.
--
--   This is the second time in this session that inventing a narrower mechanism was wrong where
--   following the established one was right. The suite caught it both times.
--
-- WHAT CHANGES
--   The block 0064 inserted is replaced by one line: `perform public.advance_batch(...)`. The
--   decision records what it decided and asks the gate-driven writer what that opens.
--
-- WHAT DOES NOT CHANGE
--   Every refusal `decide_lab_submission` already made — the role check, C-32's two readings, the
--   mandatory reason, the "responsible_role must be lab_tech" check — is untouched. And the
--   behaviour 0064 delivered is preserved: an approval still opens the gate. This changes who
--   writes it down.
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
$function$
;

do $a$
declare
  body text;
  bare text;
begin
  select prosrc into body from pg_proc where proname = 'decide_lab_submission';
  -- Comments mention names; only code calls them. Strip the comments before testing for a call.
  bare := regexp_replace(body, '--[^\n]*', '', 'g');

  if bare !~* '(perform|select)\s+(public\.)?advance_batch\s*\(' then
    raise exception '0065 failed: it does not delegate to advance_batch';
  end if;

  -- The whole point: it must no longer write batch_activity.state itself.
  if bare ~* 'update\s+batch_activity[^;]*\bset\b[^;]*\bstate\s*=' then
    raise exception
      '0065 failed: decide_lab_submission still writes batch_activity.state. advance_batch is the '
      'only gate-driven writer.';
  end if;

  -- And every refusal it already made must survive.
  if position('may not decide a lab submission' in body) = 0 then
    raise exception '0065 failed: the role refusal was lost';
  end if;
  if position('needs a stated reason' in body) = 0 then
    raise exception '0065 failed: the reason requirement was lost';
  end if;

  raise notice '0065 · decide_lab_submission delegates the unlock to advance_batch';
end $a$;
