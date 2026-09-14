-- 0027 · The plan becomes hourly.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE DEFECT, IN ONE LINE
--
-- `batch_activity.planned_time` has existed since 0007. `set_activity_plan` writes it. The plan
-- screen has an input bound to it. AND NOTHING HAS EVER READ IT.
--
-- `repoint_batch_activities` places every activity at `process_activity.standard_start_hour`,
-- which is itself `rel_day * 24`. So all 800 activities on a batch land on fourteen hour
-- positions, every one a multiple of 24, and an Admin who typed 09:00 into the plan saw the typed
-- value persist and the batch not move an inch.
--
-- Book1 keeps time in hours — dates down the side, the 24 hours across the top, the running batch
-- hour in every cell. The clock was built to match. The plan hanging on it was not.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS DOES NOT REQUIRE
--
-- It does not require the factory to write down the start hour of sixty operations first. The
-- process supplies the DAY and the standard duration; Admin states the HOUR for this batch, on the
-- batch she is creating, from what she actually intends to happen. Anything she leaves alone keeps
-- the standard placement exactly as before.
--
-- Four registers, kept apart and kept visible:
--     STANDARD   process_activity.standard_start_hour   what the process says
--     PLAN       batch_activity.planned_time            what Admin decided for THIS batch
--     ACTUAL     batch_activity.actual_start            what happened
--     FORECAST   derived from variance                  where it is heading
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · Say which register placed each activity.
--
-- Without this the two are indistinguishable after the fact: an activity at hour 293 could be a
-- decision Admin made or arithmetic nobody checked. Every screen that shows an hour needs to be
-- able to say which, and `UI_ACCEPTANCE_CRITERIA`'s honest-state rule requires it.
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  create type plan_hour_source as enum ('standard', 'admin_planned');
exception when duplicate_object then null; end $$;

alter table public.batch_activity
  add column if not exists planned_hour_source plan_hour_source not null default 'standard';

comment on column public.batch_activity.planned_hour_source is
  'Which register placed this activity on the hour axis. `standard` = derived from the process '
  'definition''s day. `admin_planned` = an hour a person chose for this batch. Never guessed.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · Where in the batch-day does a wall-clock time fall?
--
-- H0 is an instant, and it is NOT midnight — the factory clock starts hours into the day. So a
-- batch-day runs from H0's time-of-day to the same time next day, and a planned time EARLIER than
-- H0's own hour belongs to the following calendar date within that same batch-day.
--
--   H0 at 05:00, Admin plans 09:00  ->  4 hours into the batch-day
--   H0 at 05:00, Admin plans 03:00  ->  22 hours into the batch-day, next calendar date
--
-- The modulo is what makes the second case correct. Written once, here, because getting it wrong
-- in two places is how the rail and the schedule end up disagreeing by a day.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.hour_within_batch_day(p_start_at timestamptz, p_planned time)
returns numeric language plpgsql stable as $$
declare
  tz   text;
  h0   time;
  diff numeric;
begin
  if p_start_at is null or p_planned is null then return null; end if;

  select timezone into tz from factory_clock where id = 1;
  if tz is null then
    -- No zone means no wall clock. Refuse rather than fall back to the server's zone, which would
    -- silently place every batch against the wrong day boundary.
    raise exception
      'The factory timezone is not set, so a planned time of day cannot be placed on the batch '
      'clock. Run set_factory_timezone once.'
      using errcode = 'invalid_parameter_value';
  end if;

  h0 := (p_start_at at time zone tz)::time;
  diff := (extract(epoch from p_planned) - extract(epoch from h0)) / 3600.0;
  -- Wrap into [0, 24). `mod` on a negative gives a negative in Postgres, hence the +24.
  return ((diff::numeric % 24) + 24) % 24;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · Repoint, now honouring the hour Admin chose.
--
-- The `standard` path is UNCHANGED, byte for byte, so a batch nobody has re-timed lands exactly
-- where it landed before this migration. Only an activity carrying a `planned_time` moves.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.repoint_batch_activities(p_batch uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update batch_activity ba
     set baseline_start_hour = case
           when ba.planned_time is not null and mb.start_at is not null
             then (ba.rel_day * 24 + public.hour_within_batch_day(mb.start_at, ba.planned_time))::int
           else pa.standard_start_hour
         end,
         baseline_end_hour = case
           when ba.planned_time is not null and mb.start_at is not null
             then (ba.rel_day * 24 + public.hour_within_batch_day(mb.start_at, ba.planned_time)
                   + coalesce(ba.day0_duration_hr, ba.duration_target_max_hr, 0))::int
           else pa.standard_end_hour
         end,
         planned_hour_source = case
           when ba.planned_time is not null and mb.start_at is not null then 'admin_planned'
           else 'standard'
         end::plan_hour_source,
         planned_start_at = case
           when mb.start_at is null then null
           when ba.planned_time is not null
             then mb.start_at + make_interval(
                    secs => ((ba.rel_day * 24
                              + public.hour_within_batch_day(mb.start_at, ba.planned_time))
                             * 3600)::int)
           when pa.standard_start_hour is not null
             then mb.start_at + make_interval(secs => (pa.standard_start_hour * 3600)::int)
         end,
         planned_end_at = case
           when mb.start_at is null then null
           -- ADMIN-TIMED. Start from her hour and run for the duration this batch plans.
           when ba.planned_time is not null then
             case when coalesce(ba.day0_duration_hr, ba.duration_target_max_hr) is not null
               then mb.start_at + make_interval(
                      secs => (((ba.rel_day * 24
                                 + public.hour_within_batch_day(mb.start_at, ba.planned_time))
                                + coalesce(ba.day0_duration_hr, ba.duration_target_max_hr))
                               * 3600)::int)
               -- She stated an hour but no source states a duration. The start is known and the
               -- end is not. NULL, never a zero-length activity — TBD-21.
               else null
             end
           -- STANDARD. Unchanged from 0011.
           when pa.standard_start_hour is null then null
           when coalesce(ba.day0_duration_hr, ba.duration_target_max_hr) is not null
             then mb.start_at + make_interval(secs => (pa.standard_start_hour * 3600)::int)
                  + make_interval(secs => (coalesce(ba.day0_duration_hr,
                                                    ba.duration_target_max_hr) * 3600)::int)
           when pa.standard_end_hour is not null
             then mb.start_at + make_interval(secs => (pa.standard_end_hour * 3600)::int)
         end
    from master_batch mb, process_activity pa
   where ba.master_batch_id = p_batch
     and mb.id = ba.master_batch_id
     and pa.id = ba.process_activity_id;

  get diagnostics n = row_count;
  return n;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · Editing the plan now MOVES the plan.
--
-- `set_activity_plan` wrote `planned_time` and stopped. The value persisted, the batch did not
-- move, and the screen showed a number that meant nothing. It repoints the one row it touched.
--
-- Scoped to the single activity rather than calling `repoint_batch_activities`, because rewriting
-- eight hundred rows on every keystroke in a form is a different kind of defect.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.repoint_one_activity(p_activity uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update batch_activity ba
     set baseline_start_hour = case
           when ba.planned_time is not null and mb.start_at is not null
             then (ba.rel_day * 24 + public.hour_within_batch_day(mb.start_at, ba.planned_time))::int
           else pa.standard_start_hour
         end,
         baseline_end_hour = case
           when ba.planned_time is not null and mb.start_at is not null
             then (ba.rel_day * 24 + public.hour_within_batch_day(mb.start_at, ba.planned_time)
                   + coalesce(ba.day0_duration_hr, ba.duration_target_max_hr, 0))::int
           else pa.standard_end_hour
         end,
         planned_hour_source = case
           when ba.planned_time is not null and mb.start_at is not null then 'admin_planned'
           else 'standard'
         end::plan_hour_source,
         planned_start_at = case
           when mb.start_at is null then null
           when ba.planned_time is not null
             then mb.start_at + make_interval(
                    secs => ((ba.rel_day * 24
                              + public.hour_within_batch_day(mb.start_at, ba.planned_time))
                             * 3600)::int)
           when pa.standard_start_hour is not null
             then mb.start_at + make_interval(secs => (pa.standard_start_hour * 3600)::int)
         end,
         planned_end_at = case
           when mb.start_at is null then null
           when ba.planned_time is not null then
             case when coalesce(ba.day0_duration_hr, ba.duration_target_max_hr) is not null
               then mb.start_at + make_interval(
                      secs => (((ba.rel_day * 24
                                 + public.hour_within_batch_day(mb.start_at, ba.planned_time))
                                + coalesce(ba.day0_duration_hr, ba.duration_target_max_hr))
                               * 3600)::int)
               else null
             end
           when pa.standard_start_hour is null then null
           when coalesce(ba.day0_duration_hr, ba.duration_target_max_hr) is not null
             then mb.start_at + make_interval(secs => (pa.standard_start_hour * 3600)::int)
                  + make_interval(secs => (coalesce(ba.day0_duration_hr,
                                                    ba.duration_target_max_hr) * 3600)::int)
           when pa.standard_end_hour is not null
             then mb.start_at + make_interval(secs => (pa.standard_end_hour * 3600)::int)
         end
    from master_batch mb, process_activity pa
   where ba.id = p_activity
     and mb.id = ba.master_batch_id
     and pa.id = ba.process_activity_id;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · Hook it into the edit path, WITHOUT rewriting `set_activity_plan`.
--
-- A trigger, not a rewrite. `set_activity_plan` already carries the frozen-baseline refusal and
-- the reload-into-its-own-bunker check, and a previous pass through this codebase regressed
-- exactly that kind of guard by rewriting a function instead of adding beside it.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_replan_hours()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.planned_time is distinct from old.planned_time
     or new.day0_duration_hr is distinct from old.day0_duration_hr then
    perform public.repoint_one_activity(new.id);
  end if;
  return null;                                  -- AFTER trigger; the UPDATE above does the work
end;
$$;

drop trigger if exists trg_replan_hours on public.batch_activity;
create trigger trg_replan_hours
  after update of planned_time, day0_duration_hr on public.batch_activity
  for each row execute function public.fn_replan_hours();


-- ─────────────────────────────────────────────────────────────────────────────
-- 6 · What the plan screen reads: standard beside planned, per activity.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.v_activity_timing as
select
  ba.id                       as activity_id,
  ba.master_batch_id,
  ba.rel_day,
  ba.title,
  ba.scope_label,
  ba.planned_hour_source::text as hour_source,
  -- STANDARD
  pa.standard_start_hour,
  pa.standard_end_hour,
  pa.duration_target_min_hr   as standard_min_hr,
  pa.duration_target_max_hr   as standard_max_hr,
  -- PLAN
  ba.planned_time,
  ba.day0_duration_hr         as planned_duration_hr,
  ba.baseline_start_hour,
  ba.baseline_end_hour,
  ba.planned_start_at,
  ba.planned_end_at,
  -- ACTUAL
  ba.actual_start,
  ba.actual_end,
  ba.duration_actual_min,
  ba.variance_minutes,
  ba.tbd_marker
from public.batch_activity ba
join public.process_activity pa on pa.id = ba.process_activity_id;

grant select on public.v_activity_timing to authenticated;

comment on view public.v_activity_timing is
  'The four registers side by side for one activity: what the process says, what Admin planned for '
  'this batch, what actually happened, and the gap. `hour_source` says which of the first two '
  'placed it on the axis.';

revoke all on function public.repoint_one_activity(uuid) from public;
