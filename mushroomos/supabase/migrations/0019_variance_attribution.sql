-- 0019 · Variance attribution.  (B4)
--
-- The data behind `UI_CONTROL_TOWER_SPEC §10`'s "WHERE THE TIME WENT" and §11's paragraph — the
-- highest-value management feature in the product, and the one the factory already writes by hand
-- after every batch (`S3a`–`S3f`, the "core diagnosis" section).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE ARITHMETIC MISTAKE THIS AVOIDS
--
-- The obvious implementation is `sum(variance_minutes)` per batch. It is wrong, and wrong in the
-- direction that makes a batch look worse than it is.
--
-- `PROCESS-2026B` is a GRAPH, not a line. At Day 7 the fibre, straw, nitrogen and yard streams run
-- SIMULTANEOUSLY (`PROCESS_V2 §0`, four parallel streams). If the paddy soak runs 40 minutes long
-- while the rotavator mix runs 30 minutes long ON THE SAME AFTERNOON, the batch is 40 minutes
-- behind — not 70. Summing across streams counts the same wall-clock twice.
--
-- Within ONE stream the activities are sequential, so their variances genuinely do accumulate.
--
-- So: variance is summed PER STREAM, and the batch is as late as its WORST stream. The
-- contributors a reader is shown are the activities in that stream, because those are the ones
-- whose minutes actually add up to the number above them.
--
-- WHAT IS STILL NOT COMPUTED: a true critical path. The worst stream is a good proxy — the streams
-- converge on the yard and the slowest one gates the join — but a cross-stream dependency could in
-- principle make a faster stream critical. Computing that needs the dependency graph walked
-- properly, and guessing at it would put an invented number in front of the owner. Reported as
-- `worst_stream`, named as such, and not dressed up as a critical path.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠ TWO CORRECTIONS MADE BEFORE THIS FILE WAS EVER APPLIED
--
-- The first draft of this migration was written but never run. Two things were fixed first, both
-- the same class of error, and both worth stating because the draft's reasoning above is otherwise
-- sound:
--
-- 1 · `coalesce(stream_variance_minutes, 0)`. A batch with nothing recorded reported
--     `variance_minutes = 0`, which on screen reads "on plan". `KIRO_BUILD_INSTRUCTIONS §1` item 10
--     and `UI_ACCEPTANCE_CRITERIA §E` item 4 both fail the build for a zero that means "not built".
--     A GM reading 0 would conclude the batch is on schedule when the truth is that nobody has
--     recorded anything. It is NULL now, and the UI renders the stated empty state.
--
-- 2 · ZERO AND UNKNOWN ARE DIFFERENT ANSWERS, and the draft could not tell them apart because it
--     aggregated the CONTRIBUTOR view, which deliberately drops rows whose variance is zero. Both
--     of these are real and they are not the same finding:
--
--       MB-DEMO-MID    four activities recorded, every one exactly on plan   →  0     "on plan"
--       MB-DEMO-EARLY  no activity has both a planned and an actual end      →  NULL  "not known"
--
--     So the per-stream aggregate reads `batch_activity` directly, over every row with a non-null
--     `variance_minutes`, and the contributor list stays non-zero-only. A stream that ran to plan
--     now reports 0 instead of vanishing from the result.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · Every activity that MOVED the clock, with who and what.
--
-- Non-zero only: an activity that ran exactly to plan did not contribute to anything and does not
-- belong in a list headed "where the time went".
--
-- `cause` is the RECORDED reason, never an inferred one. A deviation summary if one exists, else
-- the blocked reason the gate wrote in its own words, else null. Null means "nothing recorded",
-- which is information — it says the delay has no explanation on file, and that is exactly the
-- question a GM should be asking.
--
-- `rank` is here rather than left to each consumer. §B4 asks for "the RANKED activities that
-- produced it", and a ranking computed independently by every caller is a ranking that will
-- eventually disagree with itself.
-- ─────────────────────────────────────────────────────────────────────────────

-- ⚠ DROP RATHER THAN REPLACE, AND THE REASON IS REPLAY.
--
-- `scripts/db.mjs` replays EVERY migration on every run, so each one has to be idempotent against a
-- database where every later migration has already been applied. `0024` appends `tbd_marker` to this
-- view. On the next run the `create or replace` below would therefore be asking Postgres to REMOVE a
-- column, which it refuses outright — `cannot drop columns from view` — and the whole run stopped
-- here with nothing after 0019 applying.
--
-- `cascade` is safe: the only view that depends on this one is `v_batch_variance`, and this same file
-- recreates and re-grants it further down.
drop view if exists public.v_variance_contributor cascade;

create or replace view public.v_variance_contributor as
select
  ba.master_batch_id,
  ba.id                        as activity_id,
  ba.code,
  ba.title,
  ba.scope_label,
  ba.stream::text              as stream,
  ba.seq,
  ba.baseline_start_hour,
  ba.variance_minutes,
  ba.planned_start_at,
  ba.planned_end_at,
  ba.actual_start,
  ba.actual_end,
  p.display_name               as person,
  m.code                       as machine,
  -- Recorded, not inferred.
  coalesce(
    (select d.summary from public.deviation d
      where d.batch_activity_id = ba.id
      order by d.raised_at limit 1),
    ba.blocked_reason
  )                            as cause,
  exists (
    select 1 from public.v_deviation_open d
     where d.batch_activity_id = ba.id and d.stands_on_record
  )                            as has_open_deviation,
  -- Worst first, within the batch. `seq` breaks ties so the order is stable between calls.
  row_number() over (
    partition by ba.master_batch_id
    order by ba.variance_minutes desc, ba.seq, ba.instance_no
  )::int                       as rank
from public.batch_activity ba
left join public.profiles p on p.id = ba.assigned_person_id
left join public.machine  m on m.id = ba.assigned_machine_id
where ba.variance_minutes is not null
  and ba.variance_minutes <> 0;

grant select on public.v_variance_contributor to authenticated;

comment on view public.v_variance_contributor is
  'One row per activity whose actual differed from its plan, ranked worst first. `cause` is the '
  'recorded reason - a deviation summary or the gate''s own blocked reason - and NULL means nothing '
  'was recorded, which is itself the finding.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · Per stream. Within a stream, activities are sequential and minutes accumulate.
--
-- Sourced from `batch_activity`, NOT from the contributor view — see correction 2 in the header. A
-- stream whose every activity ran to plan must report 0, and a stream with nothing measured must
-- not appear at all.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.v_stream_variance as
select
  ba.master_batch_id,
  ba.stream::text                                     as stream,
  sum(ba.variance_minutes)::int                       as stream_variance_minutes,
  -- Only the activities that actually moved the clock are contributors.
  count(*) filter (where ba.variance_minutes <> 0)::int as contributor_count,
  count(*)::int                                       as measured_count,
  sum(case when ba.variance_minutes > 0 then ba.variance_minutes else 0 end)::int as minutes_late,
  sum(case when ba.variance_minutes < 0 then -ba.variance_minutes else 0 end)::int as minutes_early
from public.batch_activity ba
where ba.variance_minutes is not null
group by ba.master_batch_id, ba.stream;

grant select on public.v_stream_variance to authenticated;

comment on view public.v_stream_variance is
  'Variance summed within a stream, where activities are sequential and minutes genuinely '
  'accumulate. `measured_count` is how many activities had both a plan and an actual; a stream '
  'absent from this view has nothing measured, which is not the same as running to plan.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · Per batch. The headline number, and the stream it came from.
--
-- Every batch appears, so a screen can tell "nothing recorded" from "not a batch". What it must
-- never do is turn the first of those into a number.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.v_batch_variance as
with worst as (
  select distinct on (master_batch_id)
         master_batch_id, stream, stream_variance_minutes, contributor_count
  from public.v_stream_variance
  -- Worst first. `stream` breaks ties, so which stream gets named does not vary between calls on
  -- identical data — a headline that moves on its own is a headline nobody trusts.
  order by master_batch_id, stream_variance_minutes desc, stream
)
select
  mb.id                                    as master_batch_id,
  mb.code,
  -- The batch is as late as its worst stream. NOT the sum across streams — see the header.
  -- NULL where nothing is measured. Never 0 standing in for unknown.
  w.stream_variance_minutes                as variance_minutes,
  w.stream                                 as worst_stream,
  -- Kept beside the headline so nobody re-derives it by summing the contributor list and wonders
  -- why it disagrees. Also NULL rather than 0 when there is nothing to sum.
  (select sum(s.stream_variance_minutes)::int
     from public.v_stream_variance s
    where s.master_batch_id = mb.id)       as all_streams_sum_minutes,
  (select count(*)::int from public.v_variance_contributor c
    where c.master_batch_id = mb.id)       as contributor_count,
  -- How much of the batch has been measured at all. This is what tells a reader whether a small
  -- variance means "going well" or "barely started".
  (select count(*)::int from public.batch_activity ba
    where ba.master_batch_id = mb.id and ba.variance_minutes is not null) as measured_count,
  (select count(*)::int from public.batch_activity ba
    where ba.master_batch_id = mb.id)      as activity_count,
  (select count(*)::int from public.v_deviation_open d
    where d.master_batch_id = mb.id and d.stands_on_record) as deviations_on_record,
  (select count(*)::int from public.v_deviation_open d
    where d.master_batch_id = mb.id and d.awaiting_verdict) as deviations_awaiting_verdict
from public.master_batch mb
left join worst w on w.master_batch_id = mb.id;

grant select on public.v_batch_variance to authenticated;

comment on view public.v_batch_variance is
  'variance_minutes is the WORST STREAM, not the sum across streams - PROCESS-2026B runs four '
  'streams simultaneously and summing them counts the same wall-clock twice. '
  'all_streams_sum_minutes is kept beside it so the difference is visible rather than surprising. '
  'BOTH ARE NULL, NEVER ZERO, where nothing has been measured: 0 means every measured activity ran '
  'to plan, and those are different answers. `measured_count` says how much is measured at all.';
