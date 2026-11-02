-- ─────────────────────────────────────────────────────────────────────────────
-- 0118 · WAITING IS NOT BLOCKED (user ruling, 16 Sep 2026).
--
-- THE DEFECT. Everything that failed an entry gate became LOCKED — 691 rows of it across the live
-- database, and the only shut state the engine ever produced. So these two read identically on
-- every screen:
--
--     "Bunker filling — bunker 3 not complete"        the step before it is still running
--     "waiting for laboratory approval. LAB-BNK-LOAD" the GM has not approved the assay
--
-- The first is normal process flow and needs nobody. The second needs a person. Admin could not
-- tell them apart, which is exactly what §12 of the Geetha context separates:
--
--     WAITING · waiting on a normal process dependency that is not a fault
--     BLOCKED · a condition is ACTIVELY preventing execution
--
-- WHAT THIS CHANGES.
--
-- 1 · advance_batch files a shut activity under WAITING_CONDITION when a required PREDECESSOR is
--     unfinished, and BLOCKED when anything else holds it (an unapproved Lab gate, an unresolved
--     factory dependency, a readiness rule). The reason SENTENCE is unchanged — only the state it
--     is filed under becomes meaningful. Both values already existed in the activity_state enum and
--     were completely unused: nothing in the database wrote either of them before this file.
--
-- 2 · A FAILING PREDECESSOR NOW OUTRANKS EVERY OTHER REASON. The old ordering was gate_rule.ordering
--     alone, and LAB_APPROVED sorts (5) ahead of PREDECESSOR (10). A bunker fill whose pile was not
--     yet turned AND whose Lab result was not yet approved therefore reported "waiting for GM
--     approval" — true, but not the thing holding it up, and it sent someone to chase the GM about
--     work that could not have started anyway. While the step before it is unfinished, nothing else
--     is ACTIVELY preventing this activity. That is the whole distinction.
--
-- 3 · The rescan set gains WAITING_CONDITION and BLOCKED. Without this a task that became either
--     would never be examined again and could never open — the same trap 0072 fixed for READY and
--     0117 for NOT_DUE_YET.
--
-- 4 · v_batch_monitor gains production_not_due. 0117 moved future work from READY to NOT_DUE_YET,
--     and NOT_DUE_YET appears in no existing filter on that view, so those rows silently vanished
--     from every count on Admin Home. production_locked already counted LOCKED, BLOCKED,
--     WAITING_TIME and WAITING_CONDITION, so the WAITING/BLOCKED split does not disturb it.
--
-- NOT CHANGED HERE: the Lab/GM split (AWAITING_LAB vs "awaiting GM") stays out of the state column.
-- v_batch_monitor already carries an awaiting_gm count, and distinguishing "no result recorded" from
-- "recorded but unapproved" belongs with the Lab surface in a later stage. AWAITING_LAB remains
-- unused rather than being claimed for a meaning it might not keep.
--
-- Rollback: db-rollback/pre_0118__advance_batch.sql, and drop the appended view column by replacing
-- v_batch_monitor with its previous definition.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1 · advance_batch — the live body, plus one declaration, the widened rescan, the predecessor-
--     first ordering and the WAITING/BLOCKED choice. Nothing else in the function changes.
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
  v_shut    activity_state;
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
           or ba.state = 'NOT_DUE_YET'
           -- 0118 · the two states that replace LOCKED for work that is shut. Without them here a
           -- task that became WAITING_CONDITION would never be re-examined and could not open.
           or ba.state in ('WAITING_CONDITION', 'BLOCKED'))
    order by ba.seq, ba.instance_no
  loop
    -- 0118 · A FAILING PREDECESSOR OUTRANKS EVERY OTHER REASON.
    --
    -- The old ordering was gate_rule.ordering alone, and LAB_APPROVED sorts (5) ahead of
    -- PREDECESSOR (10). So a bunker fill whose pile was not yet turned AND whose Lab result was
    -- not yet approved reported "waiting for GM approval" — true, but not the thing actually
    -- holding it up, and it invited someone to go and chase the GM.
    --
    -- While the step before it is unfinished, nothing else is ACTIVELY preventing this work: it
    -- could not have started anyway. That is the difference between WAITING and BLOCKED.
    select v.reason, v.kind into fail
    from evaluate_gates(cand.id, 'entry') v
    where v.verdict = 'fail'
    order by (v.kind = 'PREDECESSOR') desc, v.ordering
    limit 1;

    if fail.reason is not null then
      -- 0118 · WAITING IS NOT BLOCKED.
      --
      -- Everything shut used to be LOCKED — 691 rows of it — so "the step before this one is still
      -- running" and "the GM has not approved the assay" read identically on every screen, and
      -- Admin could not tell normal process flow from something that needed a person.
      --
      --   WAITING_CONDITION · a required predecessor is simply not finished. Normal, not a fault.
      --   BLOCKED           · a condition is ACTIVELY preventing execution — an unapproved Lab
      --                       gate, an unresolved factory dependency, a readiness rule.
      --
      -- The reason sentence is unchanged; only the state it is filed under is now meaningful.
      v_shut := case when fail.kind = 'PREDECESSOR'
                     then 'WAITING_CONDITION'::activity_state
                     else 'BLOCKED'::activity_state end;

      -- Still shut, and it says why in the rule's own words. No event when it was already shut:
      -- nothing happened. But a READY activity closing again IS something happening, and the
      -- people who saw it open need to find out why it went away.
      update batch_activity
         set state = v_shut, blocked_reason = fail.reason
       where id = cand.id and (state <> v_shut or coalesce(blocked_reason,'') <> fail.reason);

      if cand.was_ready then
        insert into audit_event (actor_id, actor_role, action, entity_table, entity_id,
                                 before_state, after_state, reason)
        values (auth.uid(), public.current_app_role(), 'gate_closed', 'batch_activity',
                cand.id::text,
                jsonb_build_object('state', 'READY'),
                jsonb_build_object('state', v_shut::text, 'kind', fail.kind),
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

-- advance_batch keeps its ACL: {postgres, service_role}. NOT reachable by `authenticated`.
revoke all on function public.advance_batch(uuid) from public, anon, authenticated;
grant execute on function public.advance_batch(uuid) to service_role;

-- 2 · v_batch_monitor — the live definition with ONE column appended.
create or replace view public.v_batch_monitor with (security_invoker = on) as
SELECT mb.id AS master_batch_id,
mb.code AS batch_code,
mb.label AS batch_label,
mb.is_demo,
mb.status::text AS status,
pd.code AS process_code,
pd.version AS process_version,
mb.start_at AS h0,
mb.activated_at,
(EXISTS ( SELECT 1
FROM batch_activity x
WHERE x.master_batch_id = mb.id AND x.before_tracking)) AS onboarded,
( SELECT string_agg(DISTINCT m.code, ', '::text) AS string_agg
FROM batch_material_role bmr
JOIN material m ON m.id = bmr.material_id
WHERE bmr.master_batch_id = mb.id) AS materials,
count(ba.id) FILTER (WHERE ba.responsible_role IS DISTINCT FROM 'lab_tech'::app_role) AS production_total,
count(ba.id) FILTER (WHERE ba.responsible_role IS DISTINCT FROM 'lab_tech'::app_role AND ba.state = 'COMPLETED'::activity_state) AS production_completed,
count(ba.id) FILTER (WHERE ba.responsible_role IS DISTINCT FROM 'lab_tech'::app_role AND ba.before_tracking) AS production_before_tracking,
count(ba.id) FILTER (WHERE ba.responsible_role IS DISTINCT FROM 'lab_tech'::app_role AND (ba.state = ANY (ARRAY['READY'::activity_state, 'RETURNED'::activity_state]))) AS production_ready,
count(ba.id) FILTER (WHERE ba.responsible_role IS DISTINCT FROM 'lab_tech'::app_role AND ba.state = 'IN_PROGRESS'::activity_state) AS production_in_progress,
count(ba.id) FILTER (WHERE ba.responsible_role IS DISTINCT FROM 'lab_tech'::app_role AND (ba.state = ANY (ARRAY['LOCKED'::activity_state, 'BLOCKED'::activity_state, 'WAITING_TIME'::activity_state, 'WAITING_CONDITION'::activity_state]))) AS production_locked,
count(ba.id) FILTER (WHERE ba.state = 'DEVIATION'::activity_state) AS deviations,
count(ba.id) FILTER (WHERE ba.responsible_role = 'lab_tech'::app_role AND NOT ba.is_pre_h0 AND NOT ba.before_tracking AND (ba.state = ANY (ARRAY['READY'::activity_state, 'IN_PROGRESS'::activity_state, 'RETURNED'::activity_state]))) AS lab_pending,
count(ba.id) FILTER (WHERE ba.responsible_role = 'lab_tech'::app_role AND ba.state = 'COMPLETED'::activity_state AND NOT (EXISTS ( SELECT 1
FROM lab_decision d
WHERE d.batch_activity_id = ba.id)) AND (EXISTS ( SELECT 1
FROM lab_checkpoint_activity lca
JOIN lab_checkpoint lc ON lc.code = lca.checkpoint_code AND lc.checkpoint_map = lca.checkpoint_map
WHERE lca.process_activity_id = ba.process_activity_id AND lc.kind = 'GATE'::text))) AS awaiting_gm,
count(ba.id) FILTER (WHERE ba.state = 'IN_PROGRESS'::activity_state AND ba.actual_start IS NOT NULL AND ba.duration_target_max_hr IS NOT NULL AND now() > (ba.actual_start + make_interval(secs => ((ba.duration_target_max_hr + COALESCE(( SELECT sum(er.approved_extension_hr) AS sum
FROM extension_request er
WHERE er.batch_activity_id = ba.id AND extension_is_effective(er.status)), 0::numeric)) * 3600::numeric)::integer::double precision))) AS overdue,
( SELECT string_agg(DISTINCT pa2.stage, ' · '::text) AS string_agg
FROM batch_activity x
JOIN process_activity pa2 ON pa2.id = x.process_activity_id
WHERE x.master_batch_id = mb.id AND x.responsible_role IS DISTINCT FROM 'lab_tech'::app_role AND (x.state = ANY (ARRAY['READY'::activity_state, 'IN_PROGRESS'::activity_state, 'RETURNED'::activity_state]))) AS current_stages,
max(ba.actual_end) AS last_activity_at,
( SELECT count(*) AS count
FROM extension_request er
WHERE er.master_batch_id = mb.id AND er.status = 'REQUESTED'::extension_status) AS open_tickets,
    -- 0118 · work whose planned hour has not arrived. Before 0117 these rows were READY and were
    -- counted in production_ready; 0117 moved them to NOT_DUE_YET, which appears in NO existing
    -- filter, so they silently vanished from every tally on Admin Home. A new column at the END
    -- (CREATE OR REPLACE VIEW only permits additions there) rather than folding them into
    -- production_locked, because "not due yet" is not "locked".
    count(ba.id) FILTER (WHERE ba.responsible_role IS DISTINCT FROM 'lab_tech'::app_role
                           AND ba.state = 'NOT_DUE_YET'::activity_state) AS production_not_due
FROM master_batch mb
JOIN process_definition pd ON pd.id = mb.process_definition_id
LEFT JOIN batch_activity ba ON ba.master_batch_id = mb.id
GROUP BY mb.id, pd.code, pd.version;


grant select on public.v_batch_monitor to authenticated;

notify pgrst, 'reload schema';
