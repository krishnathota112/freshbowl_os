-- ─────────────────────────────────────────────────────────────────────────────
-- 0041 · The envelope is a stated factory hour, not a day count × 24. (F7)
--
-- THE PROBLEM, EXACTLY
--   0011_hour_axis.sql:
--
--     alter table public.process_definition
--       add column if not exists baseline_hours int
--         generated always as ((total_days + 1) * 24) stored;
--
--   H552 - the number this product puts on every management screen and uses as the
--   right-hand side of `exposure = forecast(H552) - PLAN(H552)` - is not a factory
--   figure. It is 23 days × 24. PROCESS-2026B has total_days = 22.
--
--   The revised PRD sets the standard envelope at 470 hours.
--
--     470 / 24 = 19.583...
--
--   470 IS NOT A MULTIPLE OF 24. No integer total_days produces it. The schema
--   physically cannot hold the number the PRD calls the standard.
--
-- THE FAILURE THIS PREVENTS
--   Nobody reads `baseline_hours` and thinks "day count". They read 552, compare it
--   to 470, and reach for the nearest thing that fits: total_days = 19 gives 480.
--   Close enough to look right on a screen, and wrong by ten hours in every variance
--   the product computes - permanently, because DEC-002 freezes the plan. Nobody
--   would choose that deliberately. Somebody will choose it at 11pm.
--
-- THE STANDING RULE, INVERTED
--   SYSTEM_ARCHITECTURE_V1 §24 rule 7: if a number can be computed, do not store it.
--   The inverse is the one being broken here:
--
--       IF A NUMBER WAS STATED BY THE FACTORY, DO NOT COMPUTE IT.
--
--   470 is a statement. 552 is a computation wearing a statement's clothes.
--
-- THE PRECEDENT
--   0011 solved this one level down and said why: standard_hour_source exists so that
--   "nobody mistakes a derivation for a statement", and a factory hour that contradicts
--   a derived rel_day "must fail loudly rather than be silently discarded". Same idea,
--   applied to process_definition, where it was never applied.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--   · It does not drop, rename or alter `baseline_hours`. That column is read by an
--     unknown number of the 22 views and is correct at what it means - the day grid.
--     Two columns, each named for what it is.
--   · It does not set an envelope for any definition. 470 is not FACTORY_CONFIRMED
--     (see F8: it is a measurement of a simulation missing a bunker cycle) and this
--     file will not be the place it quietly becomes so.
--   · It does not touch the rel_day CHECK. The day grid stays; it just stops being
--     the envelope.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1 · What the factory said, if the factory said anything. ────────────────

alter table public.process_definition
  add column if not exists envelope_hours       int,
  add column if not exists envelope_hour_source text;

comment on column public.process_definition.envelope_hours is
  'The envelope in hours AS STATED by the factory. Nullable: null means nobody has '
  'stated one and baseline_hours (the day grid) is standing in. Need not be a multiple '
  'of 24 - the revised PRD''s 470 is not. 0041 / F7.';

comment on column public.process_definition.envelope_hour_source is
  'factory_stated | derived_from_days. Same two-value discipline 0011 applied to '
  'process_activity.standard_hour_source, so a derivation is never read as a statement.';

alter table public.process_definition
  drop constraint if exists process_definition_envelope_source_known;
alter table public.process_definition
  add constraint process_definition_envelope_source_known check (
    envelope_hours is null
    or envelope_hour_source in ('factory_stated', 'derived_from_days'));

alter table public.process_definition
  drop constraint if exists process_definition_envelope_positive;
alter table public.process_definition
  add constraint process_definition_envelope_positive check (
    envelope_hours is null or envelope_hours > 0);

-- A stated envelope with no confidence class is exactly the laundering 0040 exists to
-- stop: a number appears, and nobody can tell whether the factory said it.
alter table public.process_definition
  drop constraint if exists process_definition_stated_envelope_is_classified;
alter table public.process_definition
  add constraint process_definition_stated_envelope_is_classified check (
    envelope_hours is null or envelope_confidence <> 'UNRESOLVED');


-- ── 2 · ONE place resolves "the envelope". ──────────────────────────────────
-- The literal 552 currently appears in README.md, SYSTEM_ARCHITECTURE_V1 §14/§15,
-- ARCH-005 and the Forecast register note. Every one of those is how the next agent
-- learns the number. After this view, no reader needs the literal - and a test can
-- assert that none of them still carries it.

-- Dropped first, not replaced. 0045 gives this view a WIDER column list, and on a replay
-- `create or replace` then fails with "cannot drop columns from view" — the run stops at
-- file forty-one. The cascade reaches views defined in LATER files, which are recreated by
-- those same later files a moment afterwards.
drop view if exists public.v_process_envelope cascade;

create view public.v_process_envelope as
select
  pd.id                  as process_definition_id,
  pd.code,
  pd.version,
  pd.status,
  pd.total_days,
  pd.baseline_hours,                                  -- the day grid. Unchanged, still true.
  pd.envelope_hours,                                  -- what the factory said, or null
  coalesce(pd.envelope_hours, pd.baseline_hours) as envelope_hr,
  coalesce(pd.envelope_hour_source, 'derived_from_days') as envelope_source,
  pd.envelope_confidence,
  -- Visible on purpose. While this is true the product is displaying a day count and
  -- calling it the factory standard, which is the state of the world today.
  (pd.envelope_hours is null)                    as envelope_is_a_derivation,
  (coalesce(pd.envelope_hours, pd.baseline_hours) % 24 = 0) as envelope_lands_on_a_day
from public.process_definition pd;

comment on view public.v_process_envelope is
  'The single resolver for "the envelope". Every screen, view and test reads envelope_hr '
  'from here and no literal hour figure survives anywhere else. envelope_is_a_derivation '
  'is true whenever the number being shown is (total_days+1)*24 rather than a factory '
  'statement. 0041 / F7 / DEC-019.';

grant select on public.v_process_envelope to authenticated;


-- ── 3 · Does the stated envelope agree with the activities under it? ────────
-- Not a constraint - a stated envelope is allowed to disagree with the sum of its
-- parts, because holds, buffers and turnarounds are real and the sum of durations is
-- not the length of a process. But the disagreement should be VISIBLE, because
-- silently disagreeing is how 470 and 552 both came to describe the same process.
--
-- PARALLEL_NO_WALLCLOCK rows are excluded from the sum. That is 0040's second
-- structural rule doing its work: PRD §10.1's paddy double-count (12+22+28+24 = 86
-- under a stated 74) becomes arithmetically impossible rather than a thing to remember.

-- Dropped first, not replaced. 0045 gives this view a WIDER column list, and on a replay
-- `create or replace` then fails with "cannot drop columns from view" — the run stops at
-- file forty-one. The cascade reaches views defined in LATER files, which are recreated by
-- those same later files a moment afterwards.
drop view if exists public.v_process_envelope_reconciliation cascade;

create view public.v_process_envelope_reconciliation as
select
  e.process_definition_id,
  e.code,
  e.version,
  e.envelope_hr,
  e.envelope_source,
  e.envelope_confidence,
  max(pa.standard_end_hour) filter (
    where pa.timing_confidence <> 'PARALLEL_NO_WALLCLOCK')          as last_activity_end_hour,
  sum(coalesce(pa.duration_target_max_hr, 0)) filter (
    where pa.timing_confidence <> 'PARALLEL_NO_WALLCLOCK')          as serial_duration_sum_hr,
  sum(coalesce(pa.duration_target_max_hr, 0)) filter (
    where pa.timing_confidence =  'PARALLEL_NO_WALLCLOCK')          as parallel_duration_sum_hr,
  e.envelope_hr - max(pa.standard_end_hour) filter (
    where pa.timing_confidence <> 'PARALLEL_NO_WALLCLOCK')          as envelope_slack_hr
from public.v_process_envelope e
join public.process_activity pa on pa.process_definition_id = e.process_definition_id
group by e.process_definition_id, e.code, e.version, e.envelope_hr,
         e.envelope_source, e.envelope_confidence;

comment on view public.v_process_envelope_reconciliation is
  'Does the stated envelope agree with the activities beneath it? Disagreement is legal - '
  'holds and turnarounds are real - but it must be visible. Parallel streams are excluded '
  'from the serial sum so PRD §10.1''s double-count cannot happen by arithmetic. 0041.';

grant select on public.v_process_envelope_reconciliation to authenticated;


-- ── 4 · Setting an envelope is a decision, so it is an RPC with a role. ─────
-- Not an UPDATE under ref_write. Somebody states a factory number, names its class,
-- and the server stamps who and when. A definition that has been published refuses
-- (ARCH-003 will add published status; until then the draft check is the guard we have).

create or replace function public.set_process_envelope(
  p_definition uuid,
  p_hours      int,
  p_confidence public.process_confidence,
  p_source_ref text
) returns void language plpgsql security definer set search_path = public as $fn$
declare
  d process_definition;
begin
  perform public.assert_role(array['admin','gm']::app_role[]);

  select * into d from process_definition where id = p_definition;
  if not found then
    raise exception 'No such process definition: %', p_definition;
  end if;

  if d.status <> 'draft' then
    raise exception
      'The standard % v% is % - its envelope is frozen. Publish a new version instead of editing this one.',
      d.code, d.version, d.status
      using errcode = 'check_violation';
  end if;

  if p_confidence = 'UNRESOLVED' then
    raise exception
      'An envelope of %h cannot be stored as UNRESOLVED. If nobody has ruled on the number, do not store the number - leave it null and the day grid stands in.',
      p_hours
      using errcode = 'check_violation';
  end if;

  if coalesce(trim(p_source_ref), '') = '' then
    raise exception
      'An envelope needs a source. Who stated %h, and where? A number with no provenance is how 552 became the factory standard.',
      p_hours
      using errcode = 'check_violation';
  end if;

  update process_definition
     set envelope_hours       = p_hours,
         envelope_hour_source = 'factory_stated',
         envelope_confidence  = p_confidence,
         source_ref           = p_source_ref
   where id = p_definition;
end;
$fn$;

revoke execute on function public.set_process_envelope(uuid, int, public.process_confidence, text)
  from public, anon;
grant execute on function public.set_process_envelope(uuid, int, public.process_confidence, text)
  to authenticated;

comment on function public.set_process_envelope(uuid, int, public.process_confidence, text) is
  'State the envelope of a DRAFT definition, with its confidence class and a source. '
  'Refuses UNRESOLVED and refuses a missing source - a number with no provenance is '
  'exactly how a derivation becomes "the factory standard". 0041 / DEC-019.';
