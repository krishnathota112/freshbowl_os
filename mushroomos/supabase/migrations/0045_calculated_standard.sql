-- ─────────────────────────────────────────────────────────────────────────────
-- 0045 · The standard is a PROPERTY OF THE SOP, calculated from its own activities.
--
-- THE THING BEING FIXED
--   470 h is not a MushroomOS constant. It is what PROCESS-2026C's stages, durations and
--   dependencies add up to. PROCESS-2027A will add up to something else, and both must be
--   able to exist in this application at the same time, each with its own answer.
--
--       SOP / PROCESS VERSION
--             ↓  its own stages, durations, dependencies, parallel streams, gates
--       CALCULATED STANDARD DURATION
--             ↓  + this batch's H0
--       BATCH BASELINE — exact planned timestamps
--
--   Three different things, and the product has been collapsing the first two:
--
--     process_definition.baseline_hours = (total_days + 1) * 24
--
--   is a DAY GRID, and it is what every screen has been calling "the standard". For
--   PROCESS-2026B it happens to read 552. For PROCESS-2026C it reads 480 — ten hours
--   longer than the standard the factory actually confirmed, on every screen, for ever,
--   with nothing in the schema able to notice.
--
--   0041 half-fixed this by letting a definition CARRY a stated envelope. That was the
--   right column and the wrong direction on its own: a stated number with nothing to
--   check it against is just a literal that moved into the database. This migration adds
--   the other half — what the activities themselves compute — so the two can be compared.
--
-- THE THREE NUMBERS, KEPT APART
--   calculated_standard_hr   what THIS SOP's activities add up to.   Derived, always.
--   stated_envelope_hr       what the factory wrote down, if it did. Stated, nullable.
--   standard_hr              what a screen shows.                    calculated, always.
--
--   `standard_hr` is the calculated one and not a coalesce of the two. A screen must show
--   what the process it is displaying actually is; a stated number that disagrees with the
--   process beneath it is a FINDING, not a display value. The disagreement is published as
--   its own column so it can be surfaced rather than resolved silently.
--
-- WHY MAX(end) AND NOT SUM(duration)
--   The sum of durations is not the length of a process. PROCESS-2026C's activities sum to
--   855 h against a 470 h envelope, because three streams run in parallel and 128 of the
--   first 174 hours are material resting. The last hour the process reaches is the length;
--   the sum of its parts is not.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1 · What one SOP's activities add up to. ────────────────────────────────

create or replace view public.v_process_standard as
select
  pd.id      as process_definition_id,
  pd.code,
  pd.version,
  pd.status,

  -- THE STANDARD. The last hour any activity is planned to finish.
  --
  -- Activities whose timing is PARALLEL_NO_WALLCLOCK are excluded: they are concurrent by
  -- declaration and contribute no wall clock, so including one would stretch the standard by
  -- the length of a stream that runs inside another. 0040's second structural rule.
  max(pa.standard_end_hour) filter (
    where coalesce(pa.timing_confidence, 'UNRESOLVED') <> 'PARALLEL_NO_WALLCLOCK'
  ) as calculated_standard_hr,

  -- THE FULL SPAN. The last hour anything HAPPENS, ending or starting.
  --
  -- PROCESS-2026C's standard is measured on stream 1, which discharges at H470, while
  -- streams 2 and 3 discharge at H472 and H474 and state no duration for the unloading
  -- itself. Both numbers are true and they mean different things; conflating them is how a
  -- batch looks four hours early on the day it finishes.
  greatest(
    max(pa.standard_end_hour)   filter (where coalesce(pa.timing_confidence, 'UNRESOLVED') <> 'PARALLEL_NO_WALLCLOCK'),
    max(pa.standard_start_hour) filter (where coalesce(pa.timing_confidence, 'UNRESOLVED') <> 'PARALLEL_NO_WALLCLOCK')
  ) as full_span_hr,

  count(*)                                              as activity_count,
  count(*) filter (where pa.is_hold)                    as hold_count,
  count(distinct pa.stream)                             as stream_count,
  -- An activity with no stated hour cannot be planned onto the axis, so a definition
  -- carrying any is one whose standard is incomplete. Visible, not fatal.
  count(*) filter (where pa.standard_start_hour is null) as unplaced_activity_count
from public.process_definition pd
left join public.process_activity pa on pa.process_definition_id = pd.id
group by pd.id, pd.code, pd.version, pd.status;

grant select on public.v_process_standard to authenticated;

comment on view public.v_process_standard is
  'What ONE process version''s own activities add up to. The standard duration is a property '
  'of the SOP, not of the application — PROCESS-2026C computes 470 h and another version '
  'computes whatever its own stages compute. Nothing here is a literal. 0045.';


-- ── 2 · The resolver every screen reads. ────────────────────────────────────
-- One place answers "how long is this process, and do its parts agree with what the factory
-- wrote down". Replaces v_process_envelope's coalesce, which could return the day grid while
-- a screen believed it was showing the standard.

-- The column list changes shape, so this is a drop and recreate rather than a replace.
-- v_process_envelope_reconciliation and v_process_catalogue select from it; both are
-- recreated below, in dependency order.
drop view if exists public.v_process_catalogue cascade;
drop view if exists public.v_process_envelope_reconciliation cascade;
drop view if exists public.v_process_envelope cascade;

create view public.v_process_envelope as
select
  s.process_definition_id,
  s.code,
  s.version,
  s.status,
  pd.total_days,
  pd.baseline_hours,                                     -- the day grid. Still true, still not the standard.

  -- What the SOP computes. This is what a screen shows.
  s.calculated_standard_hr                as standard_hr,
  s.calculated_standard_hr,
  s.full_span_hr,

  -- What the factory wrote down, and whether the two agree.
  pd.envelope_hours                       as stated_envelope_hr,
  pd.envelope_hour_source,
  pd.envelope_confidence,
  case
    when pd.envelope_hours is null then null
    else pd.envelope_hours - s.calculated_standard_hr
  end                                     as stated_minus_calculated_hr,
  -- True when somebody wrote down a number the process beneath it does not produce. Surfaced,
  -- never resolved here: which of the two is wrong is a factory question.
  (pd.envelope_hours is not null and pd.envelope_hours <> s.calculated_standard_hr)
                                          as envelope_disagrees,

  -- Kept for the callers 0041 introduced, and the fallback order is the point.
  --
  --   1 · what the SOP's activities compute   — the process itself, and it wins
  --   2 · what the factory stated             — a real statement about a process not yet built out
  --   3 · the day grid                        — a derivation, and the only one of the three that
  --                                             is not about hours at all
  --
  -- Putting the day grid second would let (total_days + 1) x 24 outrank a number a person
  -- actually wrote down, which is F7 happening again one level along.
  coalesce(s.calculated_standard_hr, pd.envelope_hours, pd.baseline_hours) as envelope_hr,
  coalesce(pd.envelope_hour_source, 'derived_from_days')                   as envelope_source,
  -- True only when we fell all the way through to the day grid — when the number being shown is
  -- a day count wearing an hour label, which is the state worth being able to see.
  (s.calculated_standard_hr is null and pd.envelope_hours is null)         as envelope_is_a_derivation,
  (coalesce(s.calculated_standard_hr, pd.envelope_hours, pd.baseline_hours) % 24 = 0)
                                                                          as envelope_lands_on_a_day,

  s.activity_count,
  s.hold_count,
  s.stream_count,
  s.unplaced_activity_count
from public.v_process_standard s
join public.process_definition pd on pd.id = s.process_definition_id;

grant select on public.v_process_envelope to authenticated;

comment on view public.v_process_envelope is
  'The single resolver for "how long is this process". standard_hr is CALCULATED from the '
  'definition''s own activities — never a constant, never the day grid. stated_envelope_hr is '
  'what the factory wrote down beside it, and envelope_disagrees says whether the two agree. '
  '0045 supersedes 0041''s coalesce, which could return (total_days+1)*24 to a caller that '
  'believed it was reading the standard.';


-- ── 3 · The catalogue carries it through. ───────────────────────────────────

create view public.v_process_catalogue as
select
  e.process_definition_id,
  e.code,
  e.version,
  e.status,
  pd.name,
  pd.anchor_day_label,
  pd.source_ref,
  pd.published_at,

  e.standard_hr,
  e.full_span_hr,
  e.stated_envelope_hr,
  e.envelope_confidence,
  e.envelope_disagrees,
  e.stated_minus_calculated_hr,

  e.activity_count,
  e.hold_count,
  e.stream_count,
  e.unplaced_activity_count,

  (c.current_definition_id = e.process_definition_id) as is_current,
  -- A definition is choosable for a new batch when it is published and its activities are
  -- all on the axis. Computed here so no screen decides it, and no screen offers a standard
  -- that would generate a baseline with holes in it.
  (e.status = 'published'
     and e.activity_count > 0
     and e.unplaced_activity_count = 0)               as is_selectable
from public.v_process_envelope e
join public.process_definition pd on pd.id = e.process_definition_id
left join public.process_catalogue c on c.id = 1;

grant select on public.v_process_catalogue to authenticated;

comment on view public.v_process_catalogue is
  'Every process version with its OWN calculated standard. What the Admin process picker '
  'reads: choose a version, and the standard shown is that version''s, not the application''s. '
  '0044 / 0045.';


-- ── 4 · Publishing checks the SOP against itself. ───────────────────────────
-- A definition whose stated envelope disagrees with its own activities must not become the
-- factory standard silently. Publishing is where that is caught, because publishing is the
-- last moment before a batch freezes a baseline built from it.

create or replace function public.publish_process_definition(
  p_definition uuid,
  p_reason     text default null
) returns void language plpgsql security definer set search_path = public as $fn$
declare
  d process_definition;
  s record;
begin
  perform public.assert_role(array['admin','gm']::app_role[], 'publish a process definition');

  select * into d from process_definition where id = p_definition;
  if not found then
    raise exception 'No such process definition: %', p_definition;
  end if;

  if d.status = 'published' then
    return;                                   -- idempotent. Publishing twice is not an error.
  end if;

  if d.status = 'archived' then
    raise exception
      '% v% is archived. An archived standard is history — publish a new version rather than '
      'reviving this one.', d.code, d.version
      using errcode = 'check_violation';
  end if;

  select * into s from v_process_envelope where process_definition_id = p_definition;

  if coalesce(s.activity_count, 0) = 0 then
    raise exception
      'Refusing to publish % v%: it has no activities. A published standard with nothing in it '
      'would generate an empty baseline and freeze it.', d.code, d.version
      using errcode = 'check_violation';
  end if;

  if s.unplaced_activity_count > 0 then
    raise exception
      'Refusing to publish % v%: % of its % activities carry no standard hour, so they cannot '
      'be placed on the axis and every batch built from it would freeze a baseline with holes.',
      d.code, d.version, s.unplaced_activity_count, s.activity_count
      using errcode = 'check_violation';
  end if;

  -- The SOP must agree with itself. Not "must equal 470" — 470 belongs to PROCESS-2026C and
  -- to nothing else. The rule is that a stated number and the activities beneath it describe
  -- the same process, whatever process that is.
  if s.envelope_disagrees then
    raise exception
      'Refusing to publish % v%: its activities compute a standard of %h, but a stated '
      'envelope of %h is recorded against it — a difference of %h. One of the two is wrong. '
      'Correct the activities or restate the envelope; do not publish a standard that '
      'disagrees with itself.',
      d.code, d.version, s.calculated_standard_hr, s.stated_envelope_hr,
      s.stated_minus_calculated_hr
      using errcode = 'check_violation';
  end if;

  update process_definition
     set status = 'published', published_by = auth.uid(), published_at = now()
   where id = p_definition;
end;
$fn$;

revoke execute on function public.publish_process_definition(uuid, text) from public, anon;
grant execute on function public.publish_process_definition(uuid, text) to authenticated;


-- ── 5 · The reconciliation view, rebuilt on the new resolver. ───────────────
-- 0041 created it against a coalesce that could return the day grid, so its "slack" was the
-- gap between the activities and a number that was sometimes not the standard at all. It now
-- reconciles the SOP against its own stated envelope, which is the comparison worth making.

create or replace view public.v_process_envelope_reconciliation as
select
  e.process_definition_id,
  e.code,
  e.version,
  e.standard_hr,
  e.stated_envelope_hr,
  e.stated_minus_calculated_hr,
  e.envelope_disagrees,
  e.envelope_confidence,
  e.full_span_hr,
  -- Beyond the standard: PROCESS-2026C's streams 2 and 3 discharge at H472 and H474, after
  -- the H470 the standard is measured on. Not an overrun — a different measurement.
  e.full_span_hr - e.standard_hr                            as tail_beyond_standard_hr,
  sum(coalesce(pa.duration_target_max_hr, 0)) filter (
    where coalesce(pa.timing_confidence, 'UNRESOLVED') <> 'PARALLEL_NO_WALLCLOCK') as serial_duration_sum_hr,
  sum(coalesce(pa.duration_target_max_hr, 0)) filter (
    where pa.timing_confidence = 'PARALLEL_NO_WALLCLOCK')   as parallel_duration_sum_hr
from public.v_process_envelope e
left join public.process_activity pa on pa.process_definition_id = e.process_definition_id
group by e.process_definition_id, e.code, e.version, e.standard_hr, e.stated_envelope_hr,
         e.stated_minus_calculated_hr, e.envelope_disagrees, e.envelope_confidence, e.full_span_hr;

grant select on public.v_process_envelope_reconciliation to authenticated;

comment on view public.v_process_envelope_reconciliation is
  'Does a stated envelope agree with the activities beneath it, and how far past the standard '
  'does the last stream run? The sum of durations is reported but is NOT the length — three '
  'parallel streams and 128 hours of holds are why. 0041, rebuilt on 0045''s resolver.';
