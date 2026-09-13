-- ─────────────────────────────────────────────────────────────────────────────
-- 0077 · A poll that moves nothing writes nothing.
--
-- A regression introduced by 0072, caught by the existing suite (eventTrail.test.ts,
-- "a poll that moves nothing writes nothing"): advance_batch wrote a gate_opened audit event for
-- every READY activity whose gates still passed — 30 per call on a fresh 2026C batch, with no
-- state changing. The rescan of READY rows that 0072 needs, to shut a gate after a later
-- rejection, is kept; an activity that was READY and still passes is now left alone.
--
-- Generated from the DEPLOYED body (pg_get_functiondef), with one guard inserted. Nothing else
-- in the function changes. Backend freeze (DEC-025): a named defect, FINDINGS F47.
-- ─────────────────────────────────────────────────────────────────────────────

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
           or (ba.state = 'READY' and not ba.is_time_gate))
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

    -- 0077 · AN OPEN GATE THAT STILL PASSES HAS NOTHING TO SAY.
    --
    -- 0072 added READY rows to this scan so that a later rejection could shut them again. A READY
    -- row whose gates still pass then fell through to the branch below and was "opened" a second
    -- time: set to READY again, counted, and a gate_opened event written. On a fresh
    -- PROCESS-2026C batch that was thirty events on every call, and My Work polls every 15 s.
    -- Nothing had happened, and the trail said it had (DEC-028). Found by eventTrail.test.
    if cand.was_ready then
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
      update batch_activity set state = 'READY', blocked_reason = null where id = cand.id;
      n_opened := n_opened + 1;

      insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
      values (null, null, 'gate_opened', 'batch_activity', cand.id::text,
              cand.title || ' — ' || cand.scope_label || ': every entry gate is satisfied');
    end if;
  end loop;

  return query select n_opened, n_resting;
end;
$function$
;

do $$
declare def text := pg_get_functiondef('public.advance_batch(uuid)'::regprocedure);
begin
  if position('0077 · AN OPEN GATE THAT STILL PASSES' in def) = 0 then
    raise exception '0077 failed: the guard is not in advance_batch';
  end if;
  -- What 0072 added must survive: a READY row is still rescanned, and can still shut.
  if position('gate_closed' in def) = 0 or position('was_ready' in def) = 0 then
    raise exception '0077 failed: advance_batch lost the 0072 re-evaluation';
  end if;
end $$;
