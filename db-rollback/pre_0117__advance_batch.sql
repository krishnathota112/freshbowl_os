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
CREATE OR REPLACE FUNCTION public.start_block_reason(p_activity uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ba batch_activity; v_early int; tz text; v_from timestamptz;
begin
  select * into ba from batch_activity where id = p_activity;
  if not found or ba.planned_start_at is null or ba.before_tracking or ba.is_hold
     or public.batch_clock_waived(ba.master_batch_id)
     or ba.state::text not in ('READY', 'RETURNED') or ba.actual_start is not null then
    return null;
  end if;
  select p.early_start_min into v_early from extension_policy p where p.id;
  v_from := ba.planned_start_at - make_interval(mins => coalesce(v_early, 30));
  if now() >= v_from then return null; end if;
  select fc.timezone into tz from factory_clock fc limit 1;
  tz := coalesce(tz, 'Asia/Kolkata');
  return ba.title || coalesce(' (' || ba.scope_label || ')', '') || ' is planned for '
         || to_char(ba.planned_start_at at time zone tz, 'DD Mon HH24:MI')
         || '. It can be started from ' || to_char(v_from at time zone tz, 'DD Mon HH24:MI') || '.';
end;
$function$
;
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
  if ba.state::text not in ('LOCKED', 'BLOCKED', 'WAITING_TIME', 'WAITING_CONDITION') then
    raise exception '% is %; only a locked or waiting task can be forced open.', ba.title, ba.state using errcode = 'check_violation';
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
