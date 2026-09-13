-- ─────────────────────────────────────────────────────────────────────────────
-- 0040 · Every process value carries the confidence class it was stated at. (F11)
--
-- THE RULE THIS IMPLEMENTS
--   Revised PRD §61, the section that governs all the others:
--
--     "For implementation, every process field must be classified as one of:
--      FACTORY CONFIRMED · FACTORY RANGE · SIMULATION / EXAMPLE ·
--      PARALLEL / NO SEPARATE WALL-CLOCK ALLOCATION · CONFIGURABLE ·
--      ADVISORY · UNRESOLVED
--      An agent must not silently convert one class into another."
--
-- WHY A COLUMN AND NOT A CONVENTION
--   An instruction cannot enforce that sentence. One reading session produced four
--   separate instances of exactly that conversion:
--
--     · a SIMULATION span became the FACTORY CONFIRMED envelope        (F8)
--     · a machine-utilisation property became a material gate          (F9)
--     · an UNRESOLVED proposal was written as a hard derived rule      (F10)
--     · three bunker-fill durations circulate, none marked as stated   (F12)
--
--   Four mistakes, one mechanism: a value moved up a class with nobody deciding
--   that it should. Care does not prevent that. A not-null column does.
--
--   The classification already exists — in docs/PROCESS_2026B_AUTHORITATIVE_MATRIX.md,
--   as a markdown table column, for all 51 activities. Where no engine can read it and
--   no constraint can defend it. Prose being authoritative is the thing §61 forbids.
--
-- THE PRECEDENT THIS GENERALISES
--   0011_hour_axis.sql did this one level down, for hours only:
--       check (standard_hour_source in ('factory_stated','derived_from_rel_day'))
--   explicitly so that "nobody mistakes a derivation for a statement". The instinct
--   was right and was applied to exactly one column. This is that instinct, finished.
--
-- SAFE TO APPLY FIRST
--   Purely additive. An enum, two columns, a backfill to the honest default, two
--   CHECKs that no existing row can violate because every row starts UNRESOLVED.
--   No function body moves. No behaviour changes. Nothing that passes today can fail.
--
-- WHAT THIS MIGRATION DOES NOT DO
--   It does not classify anything. Every row lands on UNRESOLVED, which is the true
--   state: nobody has ruled on these values. Promotion out of UNRESOLVED is a
--   deliberate UPDATE by a person, carrying a source_ref, and it is not this file's
--   business. See ARCH-003 / PRD-003 for where the classes acquire teeth.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1 · The seven classes, verbatim from §61. ───────────────────────────────
-- Names are the PRD's, uppercased and underscored. Do not add an eighth without a
-- process-owner decision — the point of a closed set is that it is closed.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'process_confidence') then
    create type public.process_confidence as enum (
      'FACTORY_CONFIRMED',        -- a definite factory rule, duration or sequence
      'FACTORY_RANGE',            -- a factory-specified interval; both bounds required
      'SIMULATION',               -- read off an example schedule; NOT a factory statement
      'PARALLEL_NO_WALLCLOCK',    -- concurrent; contributes zero to the envelope
      'CONFIGURABLE',             -- a parameter the factory sets per batch or profile
      'ADVISORY',                 -- guidance; never blocks and never gates
      'UNRESOLVED'                -- nobody has ruled. The honest default.
    );
  end if;
end $$;

comment on type public.process_confidence is
  'Revised PRD §61. What kind of claim a process value is. An agent must not silently '
  'convert one class into another - so the class travels with the value. 0040 / F11.';


-- ── 2 · On the activity: how good is this activity''s timing? ───────────────

alter table public.process_activity
  add column if not exists timing_confidence public.process_confidence
    not null default 'UNRESOLVED';

comment on column public.process_activity.timing_confidence is
  'The confidence class of this activity''s duration and placement. Defaults to '
  'UNRESOLVED because that is the true state until somebody rules. Promotion out of '
  'UNRESOLVED is a factory statement and needs source_ref to say who stated it.';


-- ── 3 · A FACTORY_RANGE must actually be a range. ───────────────────────────
-- A range with one bound is a confirmed value that lost its label, and it will be
-- read as a target. Making this structural costs nothing today: every row is
-- UNRESOLVED, so the constraint is vacuously true on the whole table.

alter table public.process_activity
  drop constraint if exists process_activity_range_has_both_bounds;
alter table public.process_activity
  add constraint process_activity_range_has_both_bounds check (
    timing_confidence <> 'FACTORY_RANGE'
    or (duration_target_min_hr is not null and duration_target_max_hr is not null));


-- ── 4 · A PARALLEL activity contributes nothing to the envelope. ────────────
-- PRD §10.1 warns about the paddy stream: 12 + 22 + 28 + 24 = 86h of sub-activities
-- under a stated 74h total, and "do not accidentally double-count the 12h weighment
-- if it is already embedded in the 74h total."
--
-- That warning is a thing to remember, and things to remember get forgotten. The
-- envelope view in 0041 sums only non-parallel rows, so a stream marked
-- PARALLEL_NO_WALLCLOCK cannot be double-counted by arithmetic. This comment is
-- where the reasoning lives; 0041 is where it bites.

comment on constraint process_activity_range_has_both_bounds on public.process_activity is
  'A FACTORY_RANGE carries both bounds. One bound is a confirmed value that lost its label.';


-- ── 5 · On the definition: how good is this standard''s envelope? ───────────
-- 0041 adds envelope_hours itself. The class is here so that both halves of §61 -
-- activity level and definition level - land in one migration and one idea.

alter table public.process_definition
  add column if not exists envelope_confidence public.process_confidence
    not null default 'UNRESOLVED';

comment on column public.process_definition.envelope_confidence is
  'The confidence class of this definition''s stated envelope. PROCESS-2026B''s H552 is '
  '(total_days+1)*24 - a derivation, not a statement. The revised PRD''s 470h is a '
  'measurement of a Turner simulation whose back half omits a bunker cycle (F8). '
  'Neither is FACTORY_CONFIRMED today and neither should be marked so without a ruling.';


-- ── 6 · Reading the classes without joining four tables. ────────────────────
-- One view, so a screen or an agent can ask "what in this standard is still
-- UNRESOLVED?" without knowing the schema. ARCH-003's publish step reads this.

create or replace view public.v_process_confidence as
select
  pd.id            as process_definition_id,
  pd.code,
  pd.version,
  pd.envelope_confidence,
  count(*)                                                              as activity_count,
  count(*) filter (where pa.timing_confidence = 'UNRESOLVED')           as unresolved_count,
  count(*) filter (where pa.timing_confidence = 'SIMULATION')           as simulation_count,
  count(*) filter (where pa.timing_confidence = 'FACTORY_CONFIRMED')    as confirmed_count,
  count(*) filter (where pa.timing_confidence = 'PARALLEL_NO_WALLCLOCK') as parallel_count,
  -- The one number that matters at publish time. A standard whose numbers nobody can
  -- defend is not publishable - PRD-003 turns this into a refusal.
  (count(*) filter (where pa.timing_confidence in ('UNRESOLVED','SIMULATION'))) = 0
                                                                        as envelope_is_defensible
from public.process_definition pd
join public.process_activity pa on pa.process_definition_id = pd.id
group by pd.id, pd.code, pd.version, pd.envelope_confidence;

comment on view public.v_process_confidence is
  'PRD §61 rolled up per definition. envelope_is_defensible is false while any activity '
  'is UNRESOLVED or SIMULATION - which is the state of every definition today, correctly.';

grant select on public.v_process_confidence to authenticated;
