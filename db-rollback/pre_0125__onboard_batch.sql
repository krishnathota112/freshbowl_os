-- Rollback for 0125: restores onboard_batch exactly as it was live on 16 Sep 2026 and removes the preview.
-- Apply from mushroomos/:  node scripts/apply.mjs ../../../db-rollback/pre_0125__onboard_batch.sql  (apply.mjs resolves paths under supabase/migrations)
drop function if exists public.preview_onboard_batch(uuid, timestamptz, uuid[], text[], text, text[], boolean);
drop function if exists public.onboard_batch(uuid, timestamptz, uuid[], text[], text, text[], boolean);
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
  v_now      timestamptz := now();
  n_pass     int;
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

  -- 0095 · A STAND-ALONE STEP ALREADY PASSED is before tracking too: a step with no step before or after
  -- it (e.g. the raw-material weighment) that sits earlier in its stream than the stream's first live step.
  v_before := v_before || coalesce((
    select array_agg(ba.id)
      from batch_activity ba
     where ba.master_batch_id = p_batch
       and coalesce(ba.responsible_role::text, '') <> 'lab_tech'
       and not ba.id = any(v_before) and not ba.id = any(v_pos)
       and not exists (select 1 from gate_rule g
                        where g.process_activity_id = ba.process_activity_id
                          and g.phase = 'entry' and g.kind = 'PREDECESSOR' and g.is_enabled)
       and not exists (select 1 from gate_rule g
                         join batch_activity o on o.process_activity_id = g.process_activity_id
                                              and o.master_batch_id = ba.master_batch_id
                        where g.kind = 'PREDECESSOR' and g.config->'activity_codes' ? ba.code)
       and exists (select 1 from batch_activity x
                    where x.master_batch_id = ba.master_batch_id and x.stream = ba.stream and x.id = any(v_before))
       and ba.seq < coalesce((select min(y.seq) from batch_activity y
                               where y.master_batch_id = ba.master_batch_id and y.stream = ba.stream
                                 and coalesce(y.responsible_role::text, '') <> 'lab_tech'
                                 and y.id <> ba.id and not y.id = any(v_before)), 2147483647)), '{}');

  -- 0106 · PARALLEL WORK ALREADY PASSED. "At Turner T2 of pile 4" means the other piles are at the same stage: their
  -- earlier passes are done. A field step in the same stream as a position, planned to END no later than the
  -- earliest position of that stream STARTS, is before tracking too (unless it is itself a position).
  v_before := v_before || coalesce((
    select array_agg(ba.id)
      from batch_activity ba
     where ba.master_batch_id = p_batch
       and coalesce(ba.responsible_role::text, '') <> 'lab_tech'
       and not ba.id = any(v_before) and not ba.id = any(v_pos)
       and ba.baseline_end_hour is not null
       and ba.baseline_end_hour <= (select min(p.baseline_start_hour) from batch_activity p
                                     where p.id = any(v_pos) and p.stream = ba.stream)), '{}');

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

  -- 0095 · THE PLAN COUNTS FROM WHERE THE BATCH IS, NOW (user, 15 Sep 2026).
  -- A running batch has no usable H0 to plan from. Each current position is planned to start at the
  -- moment of onboarding; everything after it follows at the process's own hour offsets. Where streams
  -- meet, the stream that will be ready LATER sets the time. A stream that is not started and feeds a
  -- later step (paddy, CM, tunnel preparation) is planned to be ready when that step starts. Lab checks
  -- follow their field step. Work before tracking has no planned time. Nothing is planned for a process
  -- version without hours.
  create temporary table if not exists pg_temp.ob_plan (
    id uuid primary key, s numeric, e numeric, is_lab boolean, before boolean, pos boolean, h0v timestamptz) on commit drop;
  create temporary table if not exists pg_temp.ob_edge (pred uuid, succ uuid) on commit drop;
  delete from pg_temp.ob_plan where true;
  delete from pg_temp.ob_edge where true;

  insert into pg_temp.ob_plan (id, s, e, is_lab, before, pos, h0v)
  select ba.id, ba.baseline_start_hour, coalesce(ba.baseline_end_hour, ba.baseline_start_hour),
         coalesce(ba.responsible_role::text, '') = 'lab_tech', ba.before_tracking, ba.id = any(v_pos),
         case when ba.id = any(v_pos) and ba.baseline_start_hour is not null
              then v_now - make_interval(secs => (ba.baseline_start_hour * 3600)::int) end
    from batch_activity ba where ba.master_batch_id = p_batch;

  insert into pg_temp.ob_edge (pred, succ)
  select pred.id, cur.id
    from batch_activity cur
    join gate_rule g on g.process_activity_id = cur.process_activity_id
                    and g.phase = 'entry' and g.kind = 'PREDECESSOR' and g.is_enabled
    join batch_activity pred
      on pred.master_batch_id = cur.master_batch_id
     and pred.code in (select jsonb_array_elements_text(g.config->'activity_codes'))
     and (coalesce(g.predecessor_binding, 'ALL_INSTANCES') <> 'SAME_SCOPE_INSTANCE' or pred.instance_no = cur.instance_no)
   where cur.master_batch_id = p_batch;

  for n_pass in 1..3 loop
    -- 0106 · the frontier: a live step whose every step-before is before tracking (e.g. pile 1 T3 when pile 1 T2 is
    -- already done) is planned with the positions of its stream (or of the batch), at its own hour.
    update pg_temp.ob_plan t set h0v = x.m
      from (select e.succ,
                   coalesce((select min(p2.h0v) from pg_temp.ob_plan p2 join batch_activity b2 on b2.id = p2.id
                              join batch_activity b3 on b3.id = e.succ
                             where p2.pos and p2.h0v is not null and b2.stream = b3.stream),
                            (select min(p2.h0v) from pg_temp.ob_plan p2 where p2.pos and p2.h0v is not null)) m
              from pg_temp.ob_edge e join pg_temp.ob_plan p on p.id = e.pred
             group by e.succ having bool_and(p.before)) x
     where t.id = x.succ and t.h0v is null and not t.before and not t.is_lab and not t.pos and t.s is not null
       and x.m is not null;
    -- forward: a live step starts after its latest live predecessor chain (the later stream governs)
    loop
      update pg_temp.ob_plan t set h0v = x.m
        from (select e.succ, max(p.h0v) m from pg_temp.ob_edge e join pg_temp.ob_plan p on p.id = e.pred
               where p.h0v is not null and not p.before group by e.succ) x
       where t.id = x.succ and not t.before and not t.is_lab and not t.pos and t.s is not null
         and (t.h0v is null or t.h0v < x.m);
      exit when not found;
    end loop;
    -- backward: a not-started feeder is ready when the step that uses it starts
    loop
      update pg_temp.ob_plan t set h0v = x.m
        from (select e.pred, min(s.h0v) m from pg_temp.ob_edge e join pg_temp.ob_plan s on s.id = e.succ
               where s.h0v is not null group by e.pred) x
       where t.id = x.pred and t.h0v is null and not t.before and not t.is_lab and t.s is not null;
      exit when not found;
    end loop;
  end loop;

  -- a stand-alone live step (nothing before or after it) is planned with the start of its own stream
  update pg_temp.ob_plan t set h0v = x.m
    from (select ba.id, (select min(p2.h0v) from pg_temp.ob_plan p2 join batch_activity b2 on b2.id = p2.id
                          where b2.master_batch_id = ba.master_batch_id and b2.stream = ba.stream and p2.h0v is not null) m
            from batch_activity ba where ba.master_batch_id = p_batch) x
   where t.id = x.id and t.h0v is null and not t.before and not t.is_lab and t.s is not null and x.m is not null;

  -- Lab checks follow their field step
  update pg_temp.ob_plan t set h0v = f.h0v
    from batch_activity lba
    join lab_checkpoint_activity lca on lca.process_activity_id = lba.process_activity_id
    join batch_activity fba on fba.master_batch_id = lba.master_batch_id and fba.code = lca.gates_activity_code
    join pg_temp.ob_plan f on f.id = fba.id
   where t.id = lba.id and t.is_lab and not t.before and t.s is not null and f.h0v is not null;

  update batch_activity ba
     set planned_start_at = case when p.before or p.h0v is null then null
                                 else p.h0v + make_interval(secs => (p.s * 3600)::int) end,
         planned_end_at   = case when p.before or p.h0v is null then null
                                 else p.h0v + make_interval(secs => (p.e * 3600)::int) end
    from pg_temp.ob_plan p
   where p.id = ba.id;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'onboard_batch', 'master_batch', p_batch::text,
          jsonb_build_object('actual_h0', p_h0,
                             'positions', (select jsonb_agg(jsonb_build_object('code', ba.code, 'stream', ba.stream, 'title', ba.title))
                                             from batch_activity ba where ba.id = any(v_pos)),
                             'completed_streams', to_jsonb(v_done),
                             'plan_counted_from', v_now,
                             'before_tracking_count', cardinality(v_before)),
          coalesce(nullif(trim(p_note), ''), 'Running batch onboarded at its current position'));

  perform public.activate_batch(p_batch);

  return query
    select cardinality(v_before), cardinality(v_pos),
           (select count(*)::int from batch_activity where master_batch_id = p_batch and state = 'READY');
end;
$function$
;
revoke all on function public.onboard_batch(uuid, timestamptz, uuid[], text[], text) from public, anon;
grant execute on function public.onboard_batch(uuid, timestamptz, uuid[], text[], text) to authenticated;
notify pgrst, 'reload schema';
