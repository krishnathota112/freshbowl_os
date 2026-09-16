-- ─────────────────────────────────────────────────────────────────────────────
-- 0109 · DEPENDENCY-DRIVEN DOWNSTREAM PROJECTION (backend repair spec §4, §5, §14.4, §14.5).
--
-- WHAT EXISTED: v_activity_forecast / v_batch_forecast project with v_batch_slip — ONE number for the whole batch
-- ("worst completed slip"), added to every unfinished activity's planned end. That is the global cascade §4 forbids:
-- a late Turner pile moves the paddy line, and an authorised-but-unused extension moves everything.
--
-- WHAT THIS ADDS (read-only: it writes nothing and rewrites no baseline column):
--   project_batch(batch) walks the REAL dependency graph of ONE batch, in baseline order, and returns per activity:
--     ready_at             earliest it could begin: every predecessor's projected end (plus that edge's rest),
--                          a "when started" predecessor's projected start, its own planned start (0106) and now().
--     projected_start_at   actual start if started, else ready_at.
--     projected_end_at     actual end if finished; a running task, its start + the SOP duration (or now() if past);
--                          otherwise projected start + the SOP duration.
--     waiting_for_code     WHICH predecessor sets the ready time — so waiting can be explained, not guessed.
--     blocked_reason       Lab approval outstanding / waiting for a named predecessor / planned for later.
--     basis                actual · running · projected · blocked · before tracking.
--   v_activity_projection  every active batch's activities, for Admin "Now".
--   v_batch_projection     one row per active batch: its own H-hour from H0, what is running, ready, blocked, late.
--
-- RULES HELD (§4): only real gate_rule edges propagate, so independent parallel work never moves; a convergence takes
-- the MAXIMUM of its branches; frozen baseline columns are never written; an approved extension moves nothing by
-- itself — only actual execution does (case D: +2 h approved, 30 min late ⇒ 30 min of impact).
-- ─────────────────────────────────────────────────────────────────────────────

drop view if exists public.v_batch_projection;
drop view if exists public.v_activity_projection;
drop function if exists public.project_batch(uuid);

create or replace function public.project_batch(p_batch uuid)
returns table (
  activity_id        uuid,
  code               text,
  title              text,
  scope_label        text,
  stream             text,
  state              text,
  is_hold            boolean,
  planned_start_at   timestamptz,
  planned_end_at     timestamptz,
  actual_start       timestamptz,
  actual_end         timestamptz,
  ready_at           timestamptz,
  projected_start_at timestamptz,
  projected_end_at   timestamptz,
  basis              text,
  waiting_for_code   text,
  waiting_for_title  text,
  blocked_reason     text,
  delay_minutes      integer
)
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_now    timestamptz := now();
  -- activity id -> {"end": ts, "start": ts}: filled in baseline order, so every predecessor is already known
  v_seen   jsonb := '{}'::jsonb;
  v_out    jsonb := '[]'::jsonb;
  r        record;
  w        record;
  v_wcode  text;
  v_wtitle text;
  v_wat    timestamptz;
  v_ready  timestamptz;
  v_start  timestamptz;
  v_end    timestamptz;
  v_basis  text;
  v_block  text;
begin
  for r in
    select ba.id, ba.code, ba.title, ba.scope_label, ba.stream::text as stream, ba.state::text as state, ba.is_hold,
           ba.duration_target_max_hr as dur_hr, ba.planned_start_at, ba.planned_end_at,
           ba.actual_start, ba.actual_end, ba.before_tracking, ba.instance_no, ba.process_activity_id,
           -- every GATE-kind Lab checkpoint bound to this activity, and whether all are approved
           (select coalesce(bool_and(lab.verdict = 'approved'), true)
              from (select (select d.verdict from lab_decision d
                             where d.batch_activity_id = lba.id order by d.seq desc limit 1) as verdict
                      from batch_activity lba
                      join lab_checkpoint_activity lca on lca.process_activity_id = lba.process_activity_id
                      join lab_checkpoint cp on cp.checkpoint_map = lca.checkpoint_map and cp.code = lca.checkpoint_code
                     where lba.master_batch_id = ba.master_batch_id and lca.gates_activity_code = ba.code
                       and not lba.before_tracking and cp.kind = 'GATE') lab) as lab_ok,
           (select string_agg(distinct lca.checkpoint_code, ', ')
              from batch_activity lba
              join lab_checkpoint_activity lca on lca.process_activity_id = lba.process_activity_id
              join lab_checkpoint cp on cp.checkpoint_map = lca.checkpoint_map and cp.code = lca.checkpoint_code
             where lba.master_batch_id = ba.master_batch_id and lca.gates_activity_code = ba.code
               and not lba.before_tracking and cp.kind = 'GATE') as lab_cp
      from batch_activity ba
     where ba.master_batch_id = p_batch
     order by coalesce(ba.baseline_start_hour, -1), ba.seq, ba.instance_no
  loop
    v_ready := null; v_start := null; v_end := null; v_basis := null; v_block := null;
    v_wcode := null; v_wtitle := null; v_wat := null;

    if r.before_tracking then
      v_basis := 'before tracking';
    elsif r.actual_end is not null then
      v_start := r.actual_start; v_end := r.actual_end; v_ready := r.actual_start; v_basis := 'actual';
    else
      -- the governing predecessor: the one whose projected end (or start, for a "when started" edge) is latest
      select max(x.at) as at,
             (array_agg(x.code order by x.at desc nulls last))[1] as code,
             (array_agg(x.title order by x.at desc nulls last))[1] as title
        into w
        from (
          select pred.code, pred.title,
                 case when coalesce(g.config->>'when', '') = 'started'
                      then coalesce((v_seen -> pred.id::text ->> 'start')::timestamptz, pred.actual_start)
                      else coalesce((v_seen -> pred.id::text ->> 'end')::timestamptz, pred.actual_end)
                 end
                 + make_interval(secs => (coalesce(nullif(g.config->>'min_rest_hr', '')::numeric, 0) * 3600)::int) as at
            from gate_rule g
            join batch_activity pred
              on pred.master_batch_id = p_batch
             and pred.code in (select jsonb_array_elements_text(g.config->'activity_codes'))
             and (coalesce(g.predecessor_binding, 'ALL_INSTANCES') <> 'SAME_SCOPE_INSTANCE'
                  or pred.instance_no = r.instance_no)
           where g.process_activity_id = r.process_activity_id
             and g.phase = 'entry' and g.kind = 'PREDECESSOR' and g.is_enabled
             and not pred.before_tracking
        ) x;
      v_wcode := w.code; v_wtitle := w.title; v_wat := w.at;

      -- 0106 · it cannot start before its own planned time either; and nothing is projected into the past
      v_ready := greatest(coalesce(v_wat, r.planned_start_at, v_now), coalesce(r.planned_start_at, v_now), v_now);
      v_start := coalesce(r.actual_start, v_ready);
      v_end := case
        when r.actual_start is not null
          then greatest(r.actual_start + make_interval(secs => (coalesce(r.dur_hr, 0) * 3600)::int), v_now)
        else v_start + make_interval(secs => (coalesce(r.dur_hr, 0) * 3600)::int)
      end;
      v_basis := case when r.actual_start is not null then 'running' else 'projected' end;

      if not r.lab_ok then
        v_block := 'Waiting for the GM to approve ' || coalesce(r.lab_cp, 'the Lab check');
        v_basis := 'blocked';
      elsif v_wat is not null and v_wat > v_now then
        v_block := 'Waiting for ' || coalesce(v_wtitle, v_wcode);
      elsif r.actual_start is null and r.planned_start_at is not null and r.planned_start_at > v_now then
        v_block := 'Planned for later';
      end if;
    end if;

    v_seen := v_seen || jsonb_build_object(r.id::text,
                jsonb_build_object('start', v_start, 'end', v_end));

    if not r.before_tracking then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'activity_id', r.id, 'code', r.code, 'title', r.title, 'scope_label', r.scope_label, 'stream', r.stream,
        'state', r.state, 'is_hold', r.is_hold, 'planned_start_at', r.planned_start_at, 'planned_end_at', r.planned_end_at,
        'actual_start', r.actual_start, 'actual_end', r.actual_end, 'ready_at', v_ready,
        'projected_start_at', v_start, 'projected_end_at', v_end, 'basis', v_basis,
        'waiting_for_code', v_wcode, 'waiting_for_title', v_wtitle, 'blocked_reason', v_block,
        'delay_minutes', case when r.planned_end_at is null or v_end is null then null
                              else (extract(epoch from (v_end - r.planned_end_at)) / 60)::int end));
    end if;
  end loop;

  return query
    select x.activity_id, x.code, x.title, x.scope_label, x.stream, x.state, x.is_hold,
           x.planned_start_at, x.planned_end_at, x.actual_start, x.actual_end, x.ready_at,
           x.projected_start_at, x.projected_end_at, x.basis, x.waiting_for_code, x.waiting_for_title,
           x.blocked_reason, x.delay_minutes
      from jsonb_to_recordset(v_out) as x(
        activity_id uuid, code text, title text, scope_label text, stream text, state text, is_hold boolean,
        planned_start_at timestamptz, planned_end_at timestamptz, actual_start timestamptz, actual_end timestamptz,
        ready_at timestamptz, projected_start_at timestamptz, projected_end_at timestamptz, basis text,
        waiting_for_code text, waiting_for_title text, blocked_reason text, delay_minutes integer);
end;
$fn$;

revoke all on function public.project_batch(uuid) from public, anon;
grant execute on function public.project_batch(uuid) to authenticated;

create or replace view public.v_activity_projection with (security_invoker = on) as
select mb.id as master_batch_id, mb.code as batch_code, mb.is_demo, p.*
  from master_batch mb
  cross join lateral public.project_batch(mb.id) p
 where mb.status = 'active';
grant select on public.v_activity_projection to authenticated;

create or replace view public.v_batch_projection with (security_invoker = on) as
select mb.id as master_batch_id, mb.code as batch_code, mb.label as batch_label, mb.is_demo,
       mb.start_at as h0,
       case when mb.start_at is null then null
            else round(extract(epoch from (now() - mb.start_at)) / 3600.0, 1) end as current_hour,
       (select bool_or(ba.onboarded_position) from batch_activity ba where ba.master_batch_id = mb.id) as onboarded,
       x.*
  from master_batch mb
  cross join lateral (
    select count(*) filter (where p.basis = 'actual')                                  as finished,
           count(*) filter (where p.actual_start is not null and p.actual_end is null)  as running,
           count(*) filter (where p.state in ('READY', 'RETURNED'))                     as ready_now,
           count(*) filter (where p.blocked_reason is not null
                              and p.blocked_reason <> 'Planned for later')                 as blocked,
           count(*) filter (where p.blocked_reason = 'Planned for later')               as not_due_yet,
           count(*) filter (where p.actual_end is null and p.planned_end_at is not null
                              and now() > p.planned_end_at)                             as late,
           max(p.delay_minutes) filter (where p.actual_end is null)                     as worst_delay_min,
           max(p.projected_end_at)                                                      as projected_finish,
           (array_agg(p.title order by p.projected_start_at)
              filter (where p.actual_start is null and p.blocked_reason is null))[1]    as next_up,
           (array_agg(p.title order by p.actual_start desc)
              filter (where p.actual_start is not null and p.actual_end is null))[1]    as running_now
      from public.project_batch(mb.id) p
  ) x
 where mb.status = 'active';
grant select on public.v_batch_projection to authenticated;

notify pgrst, 'reload schema';
