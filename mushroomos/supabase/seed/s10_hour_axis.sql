-- s10 · A2 — the hour axis, as data. docs/BUILD_SEQUENCE_KIRO.md §A2.
--
-- Additive. s01 and s03 are NOT edited: the conflict rows and the activity hours are written
-- here so the existing seeds stay exactly as they were verified.
--
-- Idempotent, like every seed.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · The two time questions, registered.
--
-- Neither is resolved here. TBD-47 is recorded as RESOLVED because it was closed by reading the
-- source correctly — the complete Book1 grid uses hour-of-day slot 24, which only one of the two
-- slot conventions can express (0 mismatches out of 1,656 cells against 69). TBD-50 is recorded
-- as OPEN and nothing in this repository picks a value for it.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.conflict_register
  (conflict_id, kind, severity, question, sources, ship_with_default, status, blocks_phase)
values
('TBD-47','tbd','blocks_build','At what hour of the day does H0 fall?',
 'Book1.xlsx labels its columns 1–24 with no times. Two readings were possible: slot k covers '
 '[k-1:00, k:00), or slot k covers [k:00, k+1:00).',
 'CLOSED 22 Aug 2026. H0 = 05:00 factory time. The workbook uses slot 24, which the second '
 'reading cannot express — it would need an hour-of-day 24. Reading one reproduces all 1,656 '
 'cells; reading two fails 69 of them. Asserted in src/domain/time.test.ts, which keeps both '
 'readings and requires one to match and the other to fail.',
 'resolved','T0'),

('TBD-50','tbd','blocks_behaviour',
 'What IANA timezone is the factory clock, and does it observe DST?',
 'Not stated in any source. timestamptz renders in the VIEWER''s zone, so a five-hour batch-day '
 'boundary silently moves for anyone in another zone, and the staircase slides against the '
 'calendar axis. If the zone observes DST then H0 + 552 h and "23 days later at the same wall '
 'clock" are not the same instant twice a year, which Book1.xlsx assumes they are.',
 'NO DEFAULT. factory_clock.timezone is created and left NULL. While it is NULL, '
 'factory_h0_instant() returns NULL rather than adopting the server zone, and validate_batch '
 'reports H0_NOT_SET as blocking. The hour axis itself needs no zone and is fully populated.',
 'open','A2')
on conflict (conflict_id) do update set
  kind              = excluded.kind,
  severity          = excluded.severity,
  question          = excluded.question,
  sources           = excluded.sources,
  ship_with_default = excluded.ship_with_default,
  status            = excluded.status,
  blocks_phase      = excluded.blocks_phase;

-- The clock row now has a conflict to point at.
update public.factory_clock set timezone_conflict_id = 'TBD-50' where id = 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · The axis on every template activity.
--
-- DERIVED, and marked as derived. The factory has stated no per-activity hour for any of the 36
-- activities, so every row gets `rel_day × 24` and `standard_hour_source = 'derived_from_rel_day'`.
-- As soon as a real hour arrives for an activity, that row's source becomes 'factory_stated' and
-- nothing else changes.
--
-- Hours are on the POINT scale: Day n begins at H(24n), so Day 0 begins at H0. TIME_CONTRACT
-- §1.2/§1.4. The rel_day = standard_start_hour / 24 constraint in 0011 holds by construction.
--
-- standard_end_hour uses `duration_target_max_hr`, matching what generate_activity_plan has
-- always used for a planned end. Where NO duration is stated the end hour stays NULL, including
-- every rest whose hours the factory has never written down (TBD-21, frozen decision 2). A
-- zero-length activity would be an invented duration.
--
-- ONLY PROCESS-2026B. ROUTE-2026A anchors `Day 0 = Mixing` and its rel_day runs from D−7 (C-03),
-- so its days are measured from a different origin than H0. Multiplying that by 24 would place
-- activities before the batch start, which TIME_CONTRACT §1.2 says cannot exist and
-- src/domain/time.ts refuses outright. The archived definition therefore keeps NULL hours until
-- somebody states where its H0 is.
-- ─────────────────────────────────────────────────────────────────────────────
update public.process_activity pa
   set standard_start_hour  = pa.rel_day * 24,
       standard_end_hour    = case
         when pa.duration_target_max_hr is not null
           then pa.rel_day * 24 + ceil(pa.duration_target_max_hr)::int
       end,
       standard_hour_source = 'derived_from_rel_day'
 where pa.process_definition_id in (
         select id from public.process_definition where code = 'PROCESS-2026B')
   and (pa.standard_hour_source is null or pa.standard_hour_source = 'derived_from_rel_day');

-- Undo any derived hour on a definition whose day origin is not H0. Idempotent, and it repairs a
-- project where an earlier run of this seed set them.
update public.process_activity pa
   set standard_start_hour  = null,
       standard_end_hour    = null,
       standard_hour_source = null
 where pa.standard_hour_source = 'derived_from_rel_day'
   and pa.process_definition_id not in (
         select id from public.process_definition where code = 'PROCESS-2026B');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · The day headings, moved out of the client.
--
-- These were `DAY_TITLES` in src/api/schedule.ts. The map's final key was the process length
-- written as a literal, which is invariant 8's second debt (docs/TIME_CONTRACT.md §2). The copy
-- is unchanged; only its home is.
--
-- Day 23 is retained deliberately. No PROCESS-2026B activity occupies it — the last is
-- TN-UNLOAD on Day 22 — but C-36 is open on whether H552 lands on tunnel unloading or on
-- growing-room loading, so the heading is kept rather than deleted as dead copy.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.process_day (process_definition_id, rel_day, title, source_ref)
select pd.id, d.rel_day, d.title,
       'src/api/schedule.ts DAY_TITLES, relocated to data at A2'
from public.process_definition pd, (values
  (0,  'Weighment'),
  (1,  'Wetting and bunker loading'),
  (2,  'Rest'),
  (4,  'Reload, and straw arrives'),
  (5,  'First soak, bunker storage'),
  (6,  'Second soak'),
  (7,  'Third soak, nitrogen mix, yard integration'),
  (8,  'Turner passes and bunker loading'),
  (10, 'Rest'),
  (12, 'Bunker reload'),
  (13, 'Rest'),
  (15, 'Tunnel loading'),
  (16, 'Tunnel process'),
  (22, 'Tunnel unloading and compost-out'),
  (23, 'Batch state')
) as d(rel_day, title)
where pd.code = 'PROCESS-2026B' and pd.version = 1
on conflict (process_definition_id, rel_day) do update set
  title      = excluded.title,
  source_ref = excluded.source_ref;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · Put the already-generated plans onto the axis.
--
-- 0011 repoints every batch, but a fresh project runs migrations BEFORE seeds, so at that moment
-- no activity has an hour yet. Repointing again here — after section 2 — is what actually
-- populates `baseline_start_hour` on the deployed plans. Idempotent, and it invents no H0: where
-- `master_batch.start_at` is NULL the planned instants stay NULL.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare bid uuid;
begin
  -- ⚠ DRAFT BATCHES ONLY. `where status = 'draft'` is what makes this file replayable.
  --
  -- `scripts/db.mjs` replays every migration and seed on every run. This backfill repoints every
  -- batch it can see, and the moment one batch is ACTIVE the F1 freeze refuses the write — for
  -- exactly the right reason: "the plan of an activated batch is evidence, not a working
  -- document". So a backfill written to repair plans stopped the whole run against any database
  -- with a live batch in it, which is every real one.
  --
  -- An active batch does not want repointing. Its baseline is frozen against the hours it was
  -- activated with, and a backfill that moved it would be the freeze being bypassed by a
  -- migration rather than by a person — the one path F1 did not close.
  for bid in select id from public.master_batch
   where status = 'draft'
  loop
    perform public.repoint_batch_activities(bid);
  end loop;
end $$;
