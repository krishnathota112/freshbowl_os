-- ─────────────────────────────────────────────────────────────────────────────
-- 0117 · THE PLANNED HOUR DECIDES WHETHER A TASK IS READY (user ruling, 16 Sep 2026).
--
-- Needs 0116 (the enum value). Applied as a separate call because PostgreSQL will not let a value
-- added by ALTER TYPE be used in the transaction that added it.
--
-- WHAT WAS WRONG. advance_batch said READY as soon as an activity's ENTRY gates passed, and the
-- entry gates are only PREDECESSOR and LAB_APPROVED. Planned time was not one of them, so every
-- stream head was READY from activation. Measured on the live database, batch 001,002,003 at H0.45:
--
--     FIB-WET-1   planned H0    READY   correct
--     STR-WEIGH   planned H70   READY   three days early
--     CM-WEIGH    planned H130  READY   five days early
--     TN-PREP     planned H308  READY   thirteen days early
--
-- 0106 refused those STARTS, so the field never executed them — but the refusal lived in
-- start_activity while the STATE still read READY, and v_my_work serves the state. The board
-- offered a Start button on work due in a fortnight, which is precisely the shape Geetha §37
-- forbids: "Do not show READY / Not due until 29 Sep. Use NOT DUE YET."
--
-- THREE CHANGES, ONE FORMULA.
--
-- 1 · planned_time_status(activity) — NEW. The single answer to "may this begin yet?", lifted out
--     of 0106's start_block_reason unchanged: planned_start_at minus extension_policy.early_start_min.
--     It does not apply to a hold (a rest begins when the step before it ends, not at a clock
--     time), to before-tracking or onboarded-position rows (their gates are waived by 0085), or to
--     a batch whose clock is waived.
--
-- 2 · start_block_reason — becomes a thin wrapper over it. There is now exactly ONE early-start
--     formula in the database, so the board and the refusal cannot drift apart. Its accepted-state
--     list gains NOT_DUE_YET: without that it would return null for the very state it explains,
--     and the only thing left refusing the start would be start_activity's row guard, with a
--     generic message.
--
-- 3 · advance_batch — consults it before saying READY, and re-examines NOT_DUE_YET rows on every
--     pass so the state flips when the hour arrives. MyWork already calls release_elapsed_rests ->
--     advance_batch every 15 s for each batch on screen, and BatchDetail calls it on load. That is
--     the tick. NO NEW SCHEDULER.
--
-- 4 · admin_force_open — its guard listed LOCKED / BLOCKED / WAITING_TIME / WAITING_CONDITION, so
--     once a future task became NOT_DUE_YET the Admin failsafe could no longer open it. The factory
--     does sometimes run ahead of the plan; refusing the override would have been a regression
--     introduced by this very migration. NOT_DUE_YET is added to that list.
--
-- DELIBERATELY NOT CHANGED HERE:
--   · The demo waiver. batch_clock_waived(b) = b.is_demo still switches the clock off entirely, so
--     the three demo batches keep their present (defective) behaviour and are not broken by this
--     file. Replacing the waiver with a real accelerated clock is the last stage; when it lands,
--     NOT_DUE_YET starts applying to demo batches with no further change here.
--   · WAITING vs BLOCKED. Everything that fails an entry gate is still LOCKED. Next step.
--   · Passive holds. Still READY rather than "rest in progress" — is_time_gate is false on all 113
--     activities, so WAITING_TIME/unblocks_at stay dormant. Next step.
--
-- Rollback: db-rollback/pre_0117__advance_batch.sql (advance_batch, start_block_reason,
-- admin_force_open as they were); drop function planned_time_status. The enum value from 0116
-- cannot be dropped and is harmless once nothing produces it.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1 ─────────────────────────────────────────────────────────────────────────
create or replace function public.planned_time_status(p_activity uuid)
returns table(applies boolean, planned_start_at timestamptz, due_from timestamptz,
              ok boolean, reason text)
language plpgsql stable security definer set search_path = public
as $fn$
declare ba batch_activity; v_early int; tz text; v_from timestamptz;
begin
  select * into ba from batch_activity where id = p_activity;

  -- Where the planned hour has nothing to say. Each exclusion is a rule that already exists:
  --   no planned time      · an older process version placed nothing on the axis
  --   before_tracking      · it happened before MushroomOS was watching
  --   is_hold              · 0082: a rest is not started by a person, and begins from the step
  --                          before it ending, not from a clock time
  --   onboarded_position   · 0085: the factory stated the batch is HERE; its gates are waived
  --   clock waived         · a DEMO batch has no clock (0098). Deferred, not endorsed.
  if not found or ba.planned_start_at is null or ba.before_tracking or ba.is_hold
     or ba.onboarded_position
     or public.batch_clock_waived(ba.master_batch_id) then
    return query select false,
                        (select x.planned_start_at from batch_activity x where x.id = p_activity),
                        null::timestamptz, true, null::text;
    return;
  end if;

  select p.early_start_min into v_early from extension_policy p where p.id;
  v_from := ba.planned_start_at - make_interval(mins => coalesce(v_early, 30));

  select fc.timezone into tz from factory_clock fc limit 1;
  tz := coalesce(tz, 'Asia/Kolkata');

  if now() >= v_from then
    return query select true, ba.planned_start_at, v_from, true, null::text;
  else
    return query select true, ba.planned_start_at, v_from, false,
      ba.title || coalesce(' (' || ba.scope_label || ')', '')
      || ' is not due yet. It is planned for '
      || to_char(ba.planned_start_at at time zone tz, 'DD Mon HH24:MI')
      || ' and can be started from '
      || to_char(v_from at time zone tz, 'DD Mon HH24:MI') || '.';
  end if;
end;
$fn$;

revoke all on function public.planned_time_status(uuid) from public, anon;
grant execute on function public.planned_time_status(uuid) to authenticated;

-- 2 ─────────────────────────────────────────────────────────────────────────
create or replace function public.start_block_reason(p_activity uuid)
returns text language plpgsql stable security definer set search_path = public
as $fn$
declare ba batch_activity; pt record;
begin
  select * into ba from batch_activity where id = p_activity;
  -- This function answers "why can this not be started NOW", so it speaks only about work that is
  -- actually being offered. NOT_DUE_YET is in the list because it is the state this very reason
  -- produces — leaving it out would make the function fall silent about its own verdict.
  if not found
     or ba.state::text not in ('READY', 'RETURNED', 'NOT_DUE_YET')
     or ba.actual_start is not null then
    return null;
  end if;

  select * into pt from public.planned_time_status(p_activity);
  if pt.applies and not pt.ok then
    return pt.reason;
  end if;
  return null;
end;
$fn$;

revoke all on function public.start_block_reason(uuid) from public, anon;
grant execute on function public.start_block_reason(uuid) to authenticated;

-- 4 · admin_force_open — the live body, with NOT_DUE_YET added to its guard and nothing else.
CREATE OR REPLACE FUNCTION public.admin_force_open(p_activity uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ba batch_activity;
begin
  perform public.assert_role(array['admin']::app_role[], 'force a task open');
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Write why (at least 10 characters). It is kept on the record.' using errcode = 'check_violation';
  end if;
  select * into ba from batch_activity where id = p_activity for update;
  if not found then raise exception 'No such task.'; end if;
  if (select status from master_batch where id = ba.master_batch_id) <> 'active' then
    raise exception 'The batch is not running.' using errcode = 'check_violation';
  end if;
  -- 0117 · NOT_DUE_YET joins this list. The factory sometimes runs ahead of the plan, and before
  -- 0117 such a task was READY — so refusing the override here would be a capability this migration
  -- took away, not a rule the factory asked for. The reason, the audit row and onboarded_position
  -- are unchanged: a forced open is still a recorded Admin intervention.
  if ba.state::text not in ('LOCKED', 'BLOCKED', 'WAITING_TIME', 'WAITING_CONDITION', 'NOT_DUE_YET') then
    raise exception '% is %; only a locked, waiting or not-yet-due task can be forced open.', ba.title, ba.state using errcode = 'check_violation';
  end if;
  -- onboarded_position keeps the engine from locking it again (its entry rules are waived, as for an onboarded step)
  update batch_activity
     set state = case when actual_start is not null then 'IN_PROGRESS'::activity_state else 'READY'::activity_state end,
         blocked_reason = null, onboarded_position = true
   where id = p_activity;
  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, before_state, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'admin_force_open', 'batch_activity', p_activity::text,
          jsonb_build_object('state', ba.state, 'blocked_reason', ba.blocked_reason), jsonb_build_object('state', 'READY'), trim(p_reason));
end;
$function$
;

revoke all on function public.admin_force_open(uuid, text) from public, anon;
grant execute on function public.admin_force_open(uuid, text) to authenticated;

-- 3 · advance_batch — the live body, plus one declaration, the NOT_DUE_YET rescan and the
--     planned-hour branch. Nothing else in the function changes.
CREATE OR REPLACE FUNCTION public.advance_batch(p_batch uuid)
 RETURNS TABLE(opened integer, resting integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n_opened  int := 0;
  n_resting int := 0;
  cand      record;
  fail      record;
  touched   boolean;
  pt        record;
begin
  -- 1 · A rest window that has elapsed opens.
  for cand in
    select ba.id, ba.title, ba.scope_label, ba.unblocks_at
    from batch_activity ba
    where ba.master_batch_id = p_batch and ba.state = 'WAITING_TIME'
      and ba.unblocks_at is not null
  loop
    if not exists (
      select 1 from evaluate_gates(cand.id, 'exit') v
      where v.kind = 'DAY0_DURATION' and v.verdict = 'fail'
    ) then
      update batch_activity set state = 'READY', blocked_reason = null where id = cand.id;
      n_opened := n_opened + 1;

      insert into audit_event (actor_id, actor_role, action, entity_table, entity_id,
                               after_state, reason)
      values (null, null, 'rest_released', 'batch_activity', cand.id::text,
              jsonb_build_object('unblocks_at', cand.unblocks_at, 'released_at', now()),
              cand.title || ' — ' || cand.scope_label
              || ': rest window elapsed on the server clock');
    end if;
  end loop;

  -- 2 · Anything still shut is re-evaluated against its OWN entry rules.
  for cand in
    select ba.id, ba.is_time_gate, ba.day0_duration_hr, ba.actual_start, ba.unblocks_at,
           ba.title, ba.scope_label, (ba.state = 'READY') as was_ready
    from batch_activity ba
    where ba.master_batch_id = p_batch
      -- 0085 · the factory stated the batch is at an onboarded position: its entry gates are waived
      and not ba.onboarded_position
      and (ba.state = 'LOCKED'
           or (ba.state = 'WAITING_TIME' and ba.unblocks_at is null)
           -- 0072 · READY IS NOT A ONE-WAY DOOR.
           --
           -- This scan used to consider only activities that were already shut, so a gate could
           -- open and never close again. The laboratory case makes the consequence plain:
           --
           --     supervisor approves  -> BNK-B3-FILL becomes READY
           --     GM rejects           -> lab_decision seq 369 = 'rejected'
           --                             v_lab_approval_queue.latest_verdict = 'rejected'
           --                             BNK-B3-FILL is still READY
           --
           -- evaluate_gates was right the whole time: its LAB_APPROVED rule already reads the
           -- LATEST decision. Nothing ever asked it again. So the queue said rejected while
           -- production stood open, which is the one shape that is genuinely hard to explain
           -- afterwards.
           --
           -- READY only. An activity that is IN_PROGRESS or beyond represents work that has
           -- actually begun, and shutting that would rewrite what happened; the answer there is a
           -- deviation, not a demotion. Time gates are excluded because their path is
           -- LOCKED -> WAITING_TIME and re-entering it would restamp actual_start.
           or (ba.state = 'READY' and not ba.is_time_gate)
           -- 0117 · NOT_DUE_YET IS NOT A ONE-WAY DOOR EITHER. Its planned hour arrives on the
           -- clock, with nothing else happening, so it must be re-examined on every pass or it
           -- would sit there for ever. MyWork already calls release_elapsed_rests -> advance_batch
           -- every 15 s per batch on screen, and BatchDetail on load; that is the tick, and no new
           -- scheduler is introduced for this.
           or ba.state = 'NOT_DUE_YET')
    order by ba.seq, ba.instance_no
  loop
    select v.reason, v.kind into fail
    from evaluate_gates(cand.id, 'entry') v
    where v.verdict = 'fail'
    order by v.ordering
    limit 1;

    if fail.reason is not null then
      -- Still shut, and it says why in the rule's own words. No event when it was already shut:
      -- nothing happened. But a READY activity closing again IS something happening, and the
      -- people who saw it open need to find out why it went away.
      update batch_activity
         set state = 'LOCKED', blocked_reason = fail.reason
       where id = cand.id and (state <> 'LOCKED' or coalesce(blocked_reason,'') <> fail.reason);

      if cand.was_ready then
        insert into audit_event (actor_id, actor_role, action, entity_table, entity_id,
                                 before_state, after_state, reason)
        values (auth.uid(), public.current_app_role(), 'gate_closed', 'batch_activity',
                cand.id::text,
                jsonb_build_object('state', 'READY'),
                jsonb_build_object('state', 'LOCKED', 'kind', fail.kind),
                cand.title || ' — ' || coalesce(cand.scope_label, 'whole batch')
                  || ' was open and is shut again: ' || fail.reason);
      end if;
      continue;
    end if;

    if cand.is_time_gate then
      update batch_activity ba
         set state = 'WAITING_TIME',
             actual_start = coalesce(ba.actual_start, now()),
             unblocks_at = case
               when ba.day0_duration_hr is not null
                 then coalesce(ba.actual_start, now())
                      + make_interval(secs => (ba.day0_duration_hr * 3600)::int)
               else ba.unblocks_at end,
             blocked_reason = case
               when ba.day0_duration_hr is null then
                 'Rest duration has not been set for this batch'
                 || coalesce(' — ' || ba.tbd_marker || ' is unresolved', '')
               when ba.day0_duration_hr >= 1 then
                 'Resting — ' || round(ba.day0_duration_hr, 2)::text || ' h required'
               else
                 'Resting — ' || round(ba.day0_duration_hr * 60)::text || ' min required'
             end
       where ba.id = cand.id;
      n_resting := n_resting + 1;

      insert into audit_event (actor_id, actor_role, action, entity_table, entity_id,
                               after_state, reason)
      select null, null, 'rest_started', 'batch_activity', cand.id::text,
             jsonb_build_object('unblocks_at', cur.unblocks_at,
                                'day0_duration_hr', cur.day0_duration_hr),
             cur.title || ' — ' || cur.scope_label || ': ' || coalesce(cur.blocked_reason, 'resting')
        from batch_activity cur where cur.id = cand.id;
    else
      -- 0117 · EVERY GATE IS SATISFIED IS NOT THE SAME AS STARTABLE NOW.
      --
      -- A stream head has no predecessor, so its entry gates pass at activation and it used to go
      -- straight to READY — STR-WEIGH (H70), CM-WEIGH (H130) and TN-PREP (H308) were all READY at
      -- H0.45 on a live batch. 0106 already refused those STARTS; what it could not do from inside
      -- start_activity was correct the STATE, so v_my_work kept serving READY to the field.
      --
      -- planned_time_status is the same formula start_block_reason uses — deliberately one
      -- function, so the board and the refusal can never disagree about when a task may begin.
      select * into pt from public.planned_time_status(cand.id);

      if pt.applies and not pt.ok then
        update batch_activity
           set state = 'NOT_DUE_YET', blocked_reason = pt.reason
         where id = cand.id
           and (state <> 'NOT_DUE_YET' or coalesce(blocked_reason, '') <> coalesce(pt.reason, ''));
        -- No audit row: waiting for your own planned hour is the resting position, not an event.
        -- The crossing into READY below IS an event, and is recorded.
      else
        update batch_activity set state = 'READY', blocked_reason = null where id = cand.id;
        n_opened := n_opened + 1;

        insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
        values (null, null, 'gate_opened', 'batch_activity', cand.id::text,
                cand.title || ' — ' || cand.scope_label || ': every entry gate is satisfied');
      end if;
    end if;
  end loop;

  return query select n_opened, n_resting;
end;
$function$
;

-- advance_batch is NOT granted to `authenticated`, and must stay that way. The field reaches it
-- only through release_elapsed_rests / submit_activity / activate_batch, each of which applies its
-- own role guard first. CREATE OR REPLACE preserves the existing ACL
-- ({postgres, service_role}), so no grant to authenticated is issued here.
revoke all on function public.advance_batch(uuid) from public, anon, authenticated;
grant execute on function public.advance_batch(uuid) to service_role;

notify pgrst, 'reload schema';
