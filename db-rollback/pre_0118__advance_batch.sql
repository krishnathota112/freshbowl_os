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
