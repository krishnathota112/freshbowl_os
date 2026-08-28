-- s10b · The lab's open questions, both checkpoint maps, and the settings that must not be
-- code literals.  (B5)
--
-- ⚠ RENAMED FROM `s12_lab.sql` ON 23 Aug 2026, and the number is load-bearing.
--
-- Everything in this file is REFERENCE data — register rows, policy readings, settings, checkpoint
-- maps. None of it depends on a batch existing. But `s11_demo_batches.sql` activates the three demo
-- batches, and after client decision 2 an activation requires an accepted incoming-material check,
-- which requires the `is_prebatch` checkpoints seeded below. On a fresh database the old ordering
-- meant s11 tried to activate before the checkpoints existed and the seed failed outright.
--
-- `scripts/db.mjs` orders seeds by filename, so reference data must sort BEFORE instance data.
-- `s10_hour_axis` < `s10b_lab` < `s11_demo_batches` — `_` (0x5F) sorts before `b` (0x62).
--
-- docs/BUILD_SEQUENCE_KIRO.md §B5, docs/CONTRACT_AUDIT_2026-08-22.md §2.D · §2.E · §5,
-- docs/LAB_MODEL.md §3 · §5, lab_technician_batch_process.md §3–§15.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- WHY THE REGISTER ROWS COME FIRST
--
-- `lab_checkpoint_conflict.conflict_id`, `lab_setting.conflict_id`, `lab_instrument.tbd_marker`
-- and `lab_test.spec_conflict_id` all carry `references conflict_register(conflict_id)`. The
-- deployed register held 67 rows and stopped at C-31 / TBD-41 plus C-37, TBD-47 and TBD-50.
-- C-32 and C-33 — the two questions §B5 is explicitly blocked on — WERE NEVER REGISTERED.
-- `CONTRACT_AUDIT §5` defines both and says "To be merged into SOURCE_CONFLICTS.md as Part 4";
-- that merge never happened, so `SOURCE_CONFLICTS.md` has no Part 4 and no C-32 entry.
--
-- Without these rows a C-33 marker is a foreign-key failure, which is exactly what
-- `CONTRACT_AUDIT §6` item 3 designed the FK to do. So the rows are TRANSCRIBED here from
-- `CONTRACT_AUDIT §5` — `question` and `sources` are that table's own words, and
-- `ship_with_default` quotes `BUILD_SEQUENCE_KIRO §B5` verbatim rather than composing a new
-- interim behaviour.
--
-- ⚠ ID COLLISION, REPORTED NOT RESOLVED. `docs/SCHEDULE_BUILDER_SPEC.md §8.1` and `§8.2` use
-- `C-32` and `C-33` for two COMPLETELY DIFFERENT questions — "one hopper pass on Day 1, or two?"
-- and "is there a rest after Day-5 paddy bunker storage?". A primary key cannot hold both
-- meanings. The document precedence list settles which meaning wins here — `BUILD_SEQUENCE_KIRO`
-- is #3 and `CONTRACT_AUDIT` is #7, while `SCHEDULE_BUILDER_SPEC` is unlisted — so the lab
-- readings take the IDs. THE SCHEDULE SPEC'S TWO QUESTIONS ARE THEREBY LEFT WITHOUT IDs. That is
-- a real gap and it is not this file's to close.
--
-- ⚠ TBD-51 AND TBD-52 ARE SKIPPED DELIBERATELY. `0017_deviations.sql:130` claims TBD-51 for the
-- missing gate severity model and `0017_deviations.sql:538` claims TBD-52 for "active does not
-- mean started". Neither was ever inserted. Writing register rows for them would mean AUTHORING
-- questions this step does not own, so the new lab questions below start at TBD-53 and the hole
-- at 51/52 is left visible for whoever closes B2's and B6's loose ends.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · The register rows. Transcribed, not composed.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.conflict_register
  (conflict_id, kind, severity, question, sources, ship_with_default, status, blocks_phase)
values

-- CONTRACT_AUDIT §5 and §2.D. Severity: `blocks_behaviour` rather than `blocks_build`, because
-- §B5 itself instructs the build to proceed — "Build the submission and the state; leave the
-- approver configurable" — so what is blocked is the routing, not the construction.
('C-32','conflict','blocks_behaviour',
 'Who approves a lab submission?',
 'The lab dictation §15 says the GM approves/rejects every one. ROLE_AND_APPROVAL_MODEL says the '
   || 'GM never approves per-activity work (~400 open approvals at scale) and the Supervisor holds '
   || 'release/hold/return. Both appear in the proposed contract. The authority matrix has no '
   || '"approve a lab submission" row at all; its nearest row, "Accept a lab result as final", is '
   || 'ticked for Lab and Supervisor and NOT for the GM.',
 'BUILD_SEQUENCE_KIRO §B5 verbatim: "Build the submission and the state; leave the approver '
   || 'configurable; report the block." Both readings are carried as lab_approval_reading rows, '
   || 'neither enabled; a decision from either named role is accepted and records which reading '
   || 'authorised it.',
 'open','Step 8'),

('C-33','conflict','blocks_behaviour',
 'Which lab checkpoint map is authoritative?',
 'The lab dictation''s day map, the repo''s 9 seeded lab activities, and S4b''s 18 '
   || 'column-derived checkpoints disagree on count and placement at Day 0, Day 1, Day 4, the '
   || 'soaks, the nitrogen source, Day 8, Day 12, Day 15 and Day 22. Partly answers TBD-36 and '
   || 'partly contradicts it. A FOURTH vocabulary already exists in lab_spec, which uses S4a '
   || 'phase names and overlaps S4b''s codes on three only.',
 'BUILD_SEQUENCE_KIRO §B5 verbatim: "Carry two checkpoint maps as two seeds ... each marked C-33 '
   || 'wherever they disagree. Do not merge, do not pick." Both maps are seeded into '
   || 'lab_checkpoint under checkpoint_map. The nine existing lab activities are untouched.',
 'open','Step 8'),

-- CONTRACT_AUDIT §5, transcribed. Each of these is a marker the maps below actually attach, so
-- each needs a row for the FK to hold.
('TBD-42','tbd','blocks_behaviour',
 'Day-8 turning moisture: one reading per pass (3) or one per pile per pass (9)?',
 'The lab dictation §9.2 offers an "average" that would hide the per-line spread S3f identified '
   || 'as a root cause (9 / 14 / 10 h to temperature on three parallel lines). PROCESS-2026B runs '
   || 'T1 and T2 per pile.',
 'Both the per-pass rows and the question are carried. No average is computed anywhere.',
 'open','Step 8'),

('TBD-45','tbd','cosmetic',
 'Does the lab record a dry weight at Day 0 and at paddy weighment?',
 'The lab dictation §3 and §4.4 say yes. No S4b column and no seeded lab_spec parameter exists '
   || 'for it.',
 'The parameter is carried on the dictation map with no spec and no band, so any result on it is '
   || 'no_spec.',
 'open','Step 8'),

('TBD-46','tbd','cosmetic',
 'Bunker height, tunnel height and shrunken height — lab or operational?',
 'LAB_MODEL §3 calls fill height "operational, not lab" and puts it on occupancy. The lab '
   || 'dictation §9.3, §11.1, §12.1 and §13 assign all three to the technician.',
 'Carried on the dictation map as the dictation states, marked, with no band. Nothing is moved '
   || 'off the occupancy tables either.',
 'open','Step 8'),

-- ── NEW. Found while building B5. None of these is in any register anywhere. ──
('TBD-53','tbd','blocks_behaviour',
 'A lab number has two homes and two bands. Which is canonical?',
 's08_routing_lab_activities.sql seeds 29 activity_field rows with sop_min/sop_max for the nine '
   || 'LAB-* activities — e.g. LAB-TUNNEL-LOAD.moisture_pct 72.5-74 — and lab_spec carries the '
   || 'same band under TUNNEL_LOAD. A technician''s reading can therefore land in '
   || 'batch_activity_value and be judged by record_actuals, AND in lab_result and be judged '
   || 'against the frozen lab_spec band. UI_DATA_CONTRACTS §12 puts values[] and labResults[] '
   || 'side by side on the same ActivityDetail, so the contract expects both to exist. No source '
   || 'says which is authoritative or whether the activity_field rows are retired.',
 'BOTH are kept and NEITHER is copied into the other. B5 writes no bridge, so a number entered '
   || 'in one place does not appear in the other and the duplication is visible rather than '
   || 'silently reconciled.',
 'open','Step 8'),

('TBD-54','tbd','blocks_behaviour',
 'May a lab technician submit an activity?',
 'ROLE_AND_APPROVAL_MODEL''s authority matrix ticks "Submit activity" for the Operator ONLY — the '
   || 'Lab column is blank. The lab dictation §14 and §15 have the technician submitting every '
   || 'lab activity for approval, and §20/§21 describe the submitted and rejected states from the '
   || 'technician''s side. Distinct from C-32, which asks who APPROVES.',
 'submit_activity is left role-open exactly as it was. No role check is added, because adding one '
   || 'either blocks the dictation''s flow or contradicts the matrix.',
 'open','Step 8'),

('TBD-55','tbd','cosmetic',
 'What makes a lab test overdue?',
 'UI_DATA_CONTRACTS §12 requires LabQueueItem.band to be overdue | today | retest. No source '
   || 'anywhere gives a lab turnaround time, an SLA or a due-by. LAB_MODEL §8''s mock shows '
   || '"requested 6 h ago" as illustrative prose, not a specification.',
 'v_lab_queue returns today | retest and carries overdue_unknown_reason naming the gap. No '
   || 'duration is invented.',
 'open','Step 8'),

('TBD-57','tbd','blocks_behaviour',
 'Is the incoming-material check a pre-batch prerequisite, or the batch''s own Day-0 activity?',
 'The lab dictation §3 puts raw-material moisture, pH and dry weight at DAY 0 — inside the '
   || '552-hour clock, as the batch''s first activity. The client''s operational description '
   || '(room.md, 23 Aug 2026) puts the same test BEFORE the clock starts, as a prerequisite for '
   || 'activation: "Material accepted? YES -> ready for batch / NO -> hold". The repository cannot '
   || 'hold both as one record, because submit_activity refuses an actual before H0 and batchHour() '
   || 'throws on one.',
 'CLIENT DECISION 2, 23 Aug 2026: implemented as a PRE-BATCH prerequisite. 0026 records the check '
   || 'against the pending draft batch with batch_activity_id null, so it sits outside the hour '
   || 'axis, and validate_batch blocks activation until its results are accepted. The Day-0 reading '
   || 'is NOT deleted — LAB_DICTATION.RAW_MATERIAL_WEIGHMENT stays on the dictation map. No '
   || 'material_lot entity was built, so one delivery feeding three batches is recorded three times '
   || 'and cannot be queried independently of a batch.',
 'open','Step 8'),

('TBD-56','tbd','blocks_behaviour',
 'Does a failing lab result block a gate, or only a missing lab activity?',
 'LAB_MODEL §5''s worked example has a FAILING result block the P2B gate and a passing retest '
   || 'release it, and §2 gives lab_test.required_for_gate_id. But the four seeded lab gate rules '
   || 'in s08 are kind = PREDECESSOR on the lab ACTIVITY, so they open when the activity '
   || 'completes regardless of verdict. No gate_rule kind that reads a lab result exists, and no '
   || 'source names one.',
 'The four seeded PREDECESSOR rules are untouched (CONTRACT_AUDIT §6 item 9). No new gate kind is '
   || 'invented. A failing result is recorded with verdict = fail and blocks nothing until the '
   || 'factory states that it should.',
 'open','Step 8')

on conflict (conflict_id) do update set
  kind = excluded.kind,
  severity = excluded.severity,
  question = excluded.question,
  sources = excluded.sources,
  ship_with_default = excluded.ship_with_default,
  status = excluded.status,
  blocks_phase = excluded.blocks_phase;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · Settings. Stated numbers, kept out of function bodies.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.lab_setting (key, int_value, text_value, source_ref, conflict_id)
values
  ('retest_escalation_above', 2, null,
   'LAB_MODEL §5 [DECISION] — "More than 2 retests on the same test escalates automatically to '
     || 'the GM." Sourced, but held as data rather than a literal (non-negotiable rule 4).', null),
  ('lab_turnaround_hours', null, null,
   'NO SOURCE. UI_DATA_CONTRACTS §12 asks for an "overdue" band; nothing states a turnaround '
     || 'time, so the value stays null and the band cannot report overdue.', 'TBD-55')
on conflict (key) do update set
  int_value = excluded.int_value,
  text_value = excluded.text_value,
  source_ref = excluded.source_ref,
  conflict_id = excluded.conflict_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · C-32 · both readings. NEITHER ENABLED.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.lab_approval_reading
  (reading_code, approver_role, statement, source_ref, consequence)
values
  ('GM_APPROVES_EVERY_LAB_SUBMISSION','gm',
   'The lab technician submits each completed lab activity and the General Manager approves or '
     || 'rejects it.',
   'lab_technician_batch_process.md §15 — "The lab technician submits each completed '
     || 'activity/stage for GM approval. The GM can: Approve / Reject." Stated directly by the '
     || 'factory.',
   'At ~10 concurrent batches the GM carries every lab decision. ROLE_AND_APPROVAL_MODEL sizes '
     || 'the comparable operator case at ~400 open approvals and rejects it for that reason.'),
  ('SUPERVISOR_ACCEPTS_LAB_RESULT','supervisor',
   'The Supervisor holds operational control and accepts or returns lab work; the GM is reserved '
     || 'for the four management checkpoints.',
   'ROLE_AND_APPROVAL_MODEL §2 — the authority matrix ticks "Accept a lab result as final" for '
     || 'Lab and Supervisor and NOT for the GM, and the [DECISION] states "The GM does not '
     || 'approve operator activities."',
   'The GM loses sight of individual lab submissions, which the factory asked for directly in the '
     || 'dictation. Approval latency moves to the Supervisor, who also holds release/hold/return.')
on conflict (reading_code) do update set
  approver_role = excluded.approver_role,
  statement = excluded.statement,
  source_ref = excluded.source_ref,
  consequence = excluded.consequence;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · MAP ONE — the lab dictation's day map.
--
-- Transcribed from lab_technician_batch_process.md §3 through §13, in its order, including the two
-- points it gives no day for: the nitrogen-source stream ("in parallel with the paddy-soaking
-- activities") and the storage/handling observations ("whenever the compost/material is being
-- stored in or handled around a bunker or tunnel").
--
-- ⚠ CODES ARE ROLE-BASED, NOT MATERIAL-BASED. The dictation speaks in material names — bagasse,
-- paddy, chicken manure — and non-negotiable rule 5 forbids a material name in a process
-- definition, which is why `s06` already de-materialised `lab_spec` to S4a phase names and why the
-- CHECK on `process_activity.code` exists (CONTRACT_AUDIT §6 item 1). The provenance is preserved
-- in `source_ref`, which cites the dictation section by number.
--
-- ⚠ THE DICTATION STATES NO NUMERIC LIMIT ANYWHERE. Not one band, in 830 lines. The closest it
-- comes is §11.2's "if moisture is below the required threshold" with the threshold unstated —
-- which is C-01 / C-29. So no row here maps to a lab_spec code, every test on this map freezes no
-- band, and every result on it is `no_spec`. That is the finding, not a defect.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.lab_checkpoint
  (checkpoint_map, code, name, rel_day, scope, parameters, spec_checkpoint_code, source_ref)
values
  ('LAB_DICTATION','RAW_MATERIAL_WEIGHMENT','Raw material weighment',0,'material_lot',
   array['moisture_pct','ph','dry_weight'],null,'lab dictation §3 — "The weighment activity is on Day 0, not Day 1."'),
  ('LAB_DICTATION','ROLE_LEAD_WETTING','Primary fibre wetting',1,'master',
   array['moisture_pct','ph','ec'],null,'lab dictation §3.1'),
  ('LAB_DICTATION','HOPPER_PASS_1','Hopper 1',1,'master',
   array['moisture_pct','ph','ec'],null,'lab dictation §3.2'),
  ('LAB_DICTATION','HOPPER_PASS_2','Hopper 2',1,'master',
   array['moisture_pct','ph','ec'],null,'lab dictation §3.3'),
  ('LAB_DICTATION','BEFORE_BUNKER_LOADING','Before bunker loading',1,'master',
   array['moisture_pct','ph','ec'],null,'lab dictation §3.4'),
  ('LAB_DICTATION','UNLOADING_D4','Unloading',4,'master',
   array['moisture_pct','ph','ec'],null,'lab dictation §4.1'),
  ('LAB_DICTATION','BEFORE_HOPPER_PASS_D4','Before hopper pass',4,'master',
   array['moisture_pct','ph','ec'],null,'lab dictation §4.2'),
  ('LAB_DICTATION','RELOADING_D4','Reloading',4,'master',
   array['moisture_pct','ph','ec'],null,'lab dictation §4.3'),
  ('LAB_DICTATION','STRUCTURAL_STRAW_WEIGHMENT','Structural straw weighment',4,'material_lot',
   array['moisture_pct','dry_weight'],null,'lab dictation §4.4'),
  ('LAB_DICTATION','SOAK_WATER_1','Soak pit water — soak 1',5,'master',
   array['ph','ec','tds'],null,'lab dictation §5 — "The water in the soak pit must be tested."'),
  ('LAB_DICTATION','SOAK_WATER_2','Soak pit water — soak 2',6,'master',
   array['ph','ec','tds'],null,'lab dictation §6'),
  ('LAB_DICTATION','SOAK_WATER_3','Soak pit water — soak 3',7,'master',
   array['ph','ec','tds'],null,'lab dictation §7'),
  -- NO DAY. "This happens in parallel with the paddy-soaking activities."
  ('LAB_DICTATION','NITROGEN_SOURCE_ARRIVAL','Nitrogen source on arrival',null,'material_lot',
   array['n_pct','ash_pct'],null,'lab dictation §8'),
  ('LAB_DICTATION','NITROGEN_SOURCE_BUNKER_UNLOAD','Nitrogen source on unload from bunker',
   null,'material_lot',array['n_pct','ash_pct'],null,
   'lab dictation §8 — "its composition may change ... test it again"'),
  ('LAB_DICTATION','AFTER_SECOND_FLIP','After the second flipping',8,'master',
   array['moisture_pct','ph'],null,'lab dictation §9.1'),
  ('LAB_DICTATION','AFTER_T0','Moisture after T0',8,'master',
   array['moisture_pct'],null,'lab dictation §9.2'),
  ('LAB_DICTATION','AFTER_T1','Moisture after T1',8,'master',
   array['moisture_pct'],null,'lab dictation §9.2'),
  ('LAB_DICTATION','AFTER_T2','Moisture after T2',8,'master',
   array['moisture_pct'],null,'lab dictation §9.2'),
  ('LAB_DICTATION','BUNKER_LOADING_D8','Bunker loading',8,'bunker_line',
   array['bunker_height','ph','ec','moisture_pct','n_pct','ash_pct','cn_ratio'],null,
   'lab dictation §9.3 — "Before loading, first check: Bunker height"'),
  ('LAB_DICTATION','BUNKER_UNLOAD_D12','Unloading from bunker',12,'bunker_line',
   array['shrunken_height','moisture_pct'],null,'lab dictation §11.1'),
  ('LAB_DICTATION','AFTER_WATER_ADDITION_D12','Re-check after adding water',12,'bunker_line',
   array['ph','ec','moisture_pct'],null,
   'lab dictation §11.2 — conditional on a threshold the dictation does not state'),
  ('LAB_DICTATION','RELOADING_D12','Reloading',12,'bunker_line',
   array['ph','ec','moisture_pct','n_pct','ash_pct','cn_ratio'],null,'lab dictation §11.3'),
  ('LAB_DICTATION','BEFORE_TUNNEL_LOADING','Before tunnel loading',15,'tunnel',
   array['tunnel_height'],null,'lab dictation §12.1'),
  ('LAB_DICTATION','DURING_TUNNEL_LOADING','During tunnel loading',15,'tunnel',
   array['ph','ec','moisture_pct','n_pct','ash_pct','cn_ratio'],null,'lab dictation §12.2'),
  ('LAB_DICTATION','TUNNEL_UNLOADING','Tunnel unloading',22,'tunnel',
   array['ph','ec','moisture_pct','n_pct','ash_pct','cn_ratio','shrunken_height'],null,
   'lab dictation §13'),
  ('LAB_DICTATION','ACTINOMYCETES_OBSERVATION','Actinomycetes observation',22,'tunnel',
   array['actinomycetes'],null,
   'lab dictation §13 — "treated as an observation rather than a standard numerical parameter"'),
  -- NO DAY. "whenever the compost/material is being stored in or handled around a bunker or tunnel"
  ('LAB_DICTATION','STORAGE_HANDLING_OBSERVATION','Storage and handling observations',
   null,'standing',array['smell','colour','spring'],null,'lab dictation §10')

on conflict (checkpoint_map, code) do update set
  name = excluded.name, rel_day = excluded.rel_day, scope = excluded.scope,
  parameters = excluded.parameters, spec_checkpoint_code = excluded.spec_checkpoint_code,
  source_ref = excluded.source_ref;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · MAP TWO — S4b's column-derived checkpoints.
--
-- Transcribed from LAB_MODEL §3, which is itself the transcription of S4b's column headers.
-- `mails/COMPOST LAB NEW  (USE THIS).xlsx` is a binary and was not parsed here.
--
-- ⚠ rel_day IS NULL FOR EVERY ROW. This map is derived from spreadsheet COLUMNS, which carry no
-- day. That is precisely half of C-33: one map is organised by day and the other by measurement
-- point, and they cannot be aligned without a statement nobody has made.
--
-- ⚠ TWO ROWS ARE NOT ACTUALLY S4b COLUMNS. LAB_MODEL §3's header claims all eighteen are
-- "derived directly from S4b's column headers", but its own table sources COMPOST_OUT to S3f §4
-- and WATER_SOURCE to S4a Table 3. `source_ref` records what the table says, not what the header
-- claims.
--
-- ⚠ TWO CODES ARE DE-MATERIALISED. LAB_MODEL §3 writes `BAGASSE_BL` and `BAGASSE_RL`. Rule 5, so
-- they are carried as PRIMARY_FIBRE_* with the original code named in source_ref.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.lab_checkpoint
  (checkpoint_map, code, name, rel_day, scope, parameters, spec_checkpoint_code, source_ref)
values
  ('S4B_COLUMNS','RAW_MATERIAL','Raw material',null,'material_lot',
   array['ph','moisture_pct','n_pct','ash_pct'],null,'LAB_MODEL §3 #1 — S4b cols R-BG'),
  ('S4B_COLUMNS','PRIMARY_FIBRE_BL','Primary fibre — bunker loading',null,'bunker_line',
   array['moisture_pct','ec','ph'],null,
   'LAB_MODEL §3 #2 — S4b cols BO-BQ. Written there as BAGASSE_BL; de-materialised per rule 5.'),
  ('S4B_COLUMNS','PRIMARY_FIBRE_RL','Primary fibre — reloading',null,'bunker_line',
   array['moisture_pct','ec','ph'],null,
   'LAB_MODEL §3 #3 — S4b cols BR-BT. Written there as BAGASSE_RL; de-materialised per rule 5.'),
  ('S4B_COLUMNS','LAGOON_BEFORE_SOAK1','Lagoon before soak 1',null,'master',
   array['ph','ec','tds'],null,'LAB_MODEL §3 #4 — S4b cols BU-BW'),
  ('S4B_COLUMNS','LAGOON_AFTER_SOAK1','Lagoon after soak 1',null,'master',
   array['ph','ec','tds'],null,'LAB_MODEL §3 #5 — S4b cols BX-BZ'),
  ('S4B_COLUMNS','LAGOON_BEFORE_SOAK2','Lagoon before soak 2',null,'master',
   array['ph','ec','tds'],null,'LAB_MODEL §3 #6 — S4b cols CA-CC'),
  ('S4B_COLUMNS','LAGOON_AFTER_SOAK2','Lagoon after soak 2',null,'master',
   array['ph','ec','tds'],null,'LAB_MODEL §3 #7 — S4b cols CD-CF'),
  ('S4B_COLUMNS','LAGOON_BEFORE_SOAK3','Lagoon before soak 3',null,'master',
   array['ph','ec','tds'],null,'LAB_MODEL §3 #8 — S4b cols CG-CI'),
  ('S4B_COLUMNS','LAGOON_AFTER_SOAK3','Lagoon after soak 3',null,'master',
   array['ph','ec','tds'],null,'LAB_MODEL §3 #9 — S4b cols CJ-CL'),
  ('S4B_COLUMNS','F3','F3',null,'master',
   array['moisture_pct'],null,'LAB_MODEL §3 #10 — S4b col CM'),
  ('S4B_COLUMNS','T0','T0',null,'master',
   array['moisture_pct'],null,'LAB_MODEL §3 #11 — S4b col CN'),
  ('S4B_COLUMNS','BUNKER_FILL','Bunker fill',null,'bunker_line',
   array['ph','ec','moisture_pct','ash_pct','n_pct','cn_ratio'],null,
   'LAB_MODEL §3 #12 — S4b cols CP-CU'),
  ('S4B_COLUMNS','BUNKER_RELOAD_1','Bunker reload 1',null,'bunker_line',
   array['ph','ec','moisture_pct','ash_pct','n_pct','cn_ratio'],null,
   'LAB_MODEL §3 #13 — S4b cols CZ-DE'),
  ('S4B_COLUMNS','BUNKER_RELOAD_2','Bunker reload 2',null,'bunker_line',
   array['ph','ec','moisture_pct','ash_pct','n_pct','cn_ratio'],null,
   'LAB_MODEL §3 #14 — S4b cols DJ-DO'),
  -- ✅ ONE OF THE THREE UNAMBIGUOUS MAPPINGS. The code is identical in lab_spec, so a band can be
  -- frozen without guessing. TBD-36's ship_with_default: "Map the unambiguous ones."
  ('S4B_COLUMNS','TUNNEL_LOAD','Tunnel load',null,'individual_batch',
   array['ph','ec','moisture_pct','ash_pct','n_pct','cn_ratio'],'TUNNEL_LOAD',
   'LAB_MODEL §3 #15 — S4b cols DT-DY. Code identical in lab_spec.'),
  ('S4B_COLUMNS','COMPOST_OUT','Compost out',null,'individual_batch',
   array['moisture_pct','n_pct','ph','ec','spring','colour','actinomycetes','smell'],'COMPOST_OUT',
   'LAB_MODEL §3 #16 — sourced to S3f §4, NOT to an S4b column. Code identical in lab_spec.'),
  ('S4B_COLUMNS','GR_LOAD','Growing room load',null,'growing_room_load',
   array['ph','ec','moisture_pct','ash_pct','n_pct','cn_ratio'],'GR_LOAD',
   'LAB_MODEL §3 #17 — S4b cols EN-ES. Code identical in lab_spec.'),
  ('S4B_COLUMNS','WATER_SOURCE','Water source',null,'standing',
   array['ph','ec','tds','hardness'],null,
   'LAB_MODEL §3 #18 — sourced to S4a Table 3, NOT to an S4b column. lab_spec splits water into '
     || 'nine typed codes (WATER_BORE_WELL …), so this single row cannot map to one of them.')

on conflict (checkpoint_map, code) do update set
  name = excluded.name, rel_day = excluded.rel_day, scope = excluded.scope,
  parameters = excluded.parameters, spec_checkpoint_code = excluded.spec_checkpoint_code,
  source_ref = excluded.source_ref;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6 · The markers. §B5: "each marked C-33 wherever they disagree."
--
-- EVERY ROW IN BOTH MAPS GETS C-33, and that is not laziness. CONTRACT_AUDIT §2.E's comparison
-- table disagrees at Day 0, Day 1, Day 4, the soaks, the nitrogen source, Day 8, Day 12, Day 15
-- and Day 22 — which is every point either map describes. A row left unmarked would be claiming
-- the two maps agree somewhere, and they do not.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.lab_checkpoint_conflict (checkpoint_id, conflict_id, note)
select cp.id, 'C-33',
       'This point is one of the nine where the dictation''s day map, the nine seeded lab '
         || 'activities and S4b''s 18 checkpoints disagree on count or placement.'
from public.lab_checkpoint cp
on conflict (checkpoint_id, conflict_id) do update set note = excluded.note;

-- TBD-36 · wherever the mapping to lab_spec is unstated, which is everywhere except the three
-- identical codes. The register's own default: "leave the rest unmapped and visible."
insert into public.lab_checkpoint_conflict (checkpoint_id, conflict_id, note)
select cp.id, 'TBD-36',
       'No source states which lab_spec checkpoint this maps to, so no band is frozen and every '
         || 'result here is no_spec.'
from public.lab_checkpoint cp where cp.spec_checkpoint_code is null
on conflict (checkpoint_id, conflict_id) do update set note = excluded.note;

-- TBD-42 · the Day-8 turning readings.
insert into public.lab_checkpoint_conflict (checkpoint_id, conflict_id, note)
select cp.id, 'TBD-42',
       'One reading per pass or one per pile per pass? Carried per pass, as the dictation states. '
         || 'No average is computed.'
from public.lab_checkpoint cp
where cp.checkpoint_map = 'LAB_DICTATION' and cp.code in ('AFTER_T0','AFTER_T1','AFTER_T2')
on conflict (checkpoint_id, conflict_id) do update set note = excluded.note;

-- TBD-45 · dry weight.
insert into public.lab_checkpoint_conflict (checkpoint_id, conflict_id, note)
select cp.id, 'TBD-45',
       'dry_weight is in the dictation but has no S4b column and no lab_spec parameter.'
from public.lab_checkpoint cp where 'dry_weight' = any (cp.parameters)
on conflict (checkpoint_id, conflict_id) do update set note = excluded.note;

-- TBD-46 · the three heights.
insert into public.lab_checkpoint_conflict (checkpoint_id, conflict_id, note)
select cp.id, 'TBD-46',
       'LAB_MODEL §3 calls fill height operational and puts it on occupancy; the dictation gives '
         || 'all three heights to the technician. Carried as the dictation states, marked.'
from public.lab_checkpoint cp
where cp.parameters && array['bunker_height','tunnel_height','shrunken_height']
on conflict (checkpoint_id, conflict_id) do update set note = excluded.note;

-- TBD-12 · the sensory attributes. Recording-only until the factory confirms which of them block.
insert into public.lab_checkpoint_conflict (checkpoint_id, conflict_id, note)
select cp.id, 'TBD-12',
       'Recording-only. No source states a fail value for any sensory attribute, so these carry '
         || 'no band and never auto-fail.'
from public.lab_checkpoint cp
where cp.parameters && array['spring','colour','actinomycetes','smell']
on conflict (checkpoint_id, conflict_id) do update set note = excluded.note;

-- C-01 · the Day-12 conditional depends on a moisture threshold no source states.
insert into public.lab_checkpoint_conflict (checkpoint_id, conflict_id, note)
select cp.id, 'C-01',
       'The dictation §11.2 branches on "the required threshold" without stating it. The two '
         || 'candidate moisture targets are C-01''s, and neither is adopted.'
from public.lab_checkpoint cp
where cp.checkpoint_map = 'LAB_DICTATION' and cp.code = 'AFTER_WATER_ADDITION_D12'
on conflict (checkpoint_id, conflict_id) do update set note = excluded.note;

-- TBD-13 · compost EC, wherever ec is measured on a checkpoint that DOES map to a spec. Those are
-- the two seeded null-null lab_spec rows, and they are the reason `no_spec` exists as a verdict.
insert into public.lab_checkpoint_conflict (checkpoint_id, conflict_id, note)
select cp.id, 'TBD-13',
       'EC has no band at any compost checkpoint in any source. lab_spec carries the row with '
         || 'null bounds so the absence is data; the verdict is no_spec and never fail.'
from public.lab_checkpoint cp
where 'ec' = any (cp.parameters) and cp.spec_checkpoint_code is not null
  and exists (select 1 from public.lab_spec ls
               where ls.checkpoint_code = cp.spec_checkpoint_code
                 and ls.parameter_code = 'ec'
                 and ls.min_value is null and ls.max_value is null)
on conflict (checkpoint_id, conflict_id) do update set note = excluded.note;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7 · CLIENT DECISION 2, 23 Aug 2026 · which checkpoints are PRE-BATCH.
--
-- `0026` added `lab_checkpoint.is_prebatch` so `open_prebatch_sample` does not name a checkpoint
-- code in a function body. Only the RAW-MATERIAL checkpoint on each carried map is flagged: it is
-- the only test of material that exists before the batch does.
--
-- ⚠ NOT FLAGGED, deliberately, even though their scope is also `material_lot`:
--   NITROGEN_SOURCE_ARRIVAL / NITROGEN_SOURCE_BUNKER_UNLOAD — the dictation §8 runs these "in
--     parallel with the paddy-soaking activities", i.e. Days 5-7, well inside the clock.
--   STRUCTURAL_STRAW_WEIGHMENT — Day 4, inside the clock, and now an activity of its own
--     (LAB-STRAW-WEIGH, client decision 5).
-- Flagging those would make three mid-batch tests into activation prerequisites, which is not what
-- "incoming material" means and would deadlock every batch.
-- ─────────────────────────────────────────────────────────────────────────────
update public.lab_checkpoint set is_prebatch = true
 where code in ('RAW_MATERIAL', 'RAW_MATERIAL_WEIGHMENT');

update public.lab_checkpoint set is_prebatch = false
 where code not in ('RAW_MATERIAL', 'RAW_MATERIAL_WEIGHMENT');

insert into public.lab_checkpoint_conflict (checkpoint_id, conflict_id, note)
select cp.id, 'TBD-57',
       'The dictation puts this test at Day 0, inside the clock. The client put it before the '
         || 'clock, as an activation prerequisite. Implemented as the latter; both stay on file.'
from public.lab_checkpoint cp where cp.is_prebatch
on conflict (checkpoint_id, conflict_id) do update set note = excluded.note;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8 · CLIENT DECISION 3, 23 Aug 2026 · which Day-1 map the BUILD implements.
--
-- C-33 STAYS OPEN. The client selected the lab dictation's four-check Day-1 structure for the
-- current product, and `s08` now seeds those four activities. That is a decision about what to
-- BUILD, not an answer to which source is authoritative — S4b's 18 checkpoints are not withdrawn,
-- both maps remain in `lab_checkpoint`, and every one of the four new Day-1 activities carries the
-- C-33 marker so `validate_batch` surfaces the question at the point of use.
--
-- Recorded in `ship_with_default` rather than by flipping `status`, following the pattern `s01`
-- established for the five frozen decisions: the interim behaviour is stated, the factory question
-- stays open.
-- ─────────────────────────────────────────────────────────────────────────────
update public.conflict_register
   set ship_with_default =
         'BUILD SELECTION, 23 Aug 2026 (client decision 3): PROCESS-2026B implements the lab '
      || 'dictation''s Day-1 structure — four independently recorded checkpoints at wetting, '
      || 'hopper 1, hopper 2 and before bunker loading. BOTH maps remain seeded in lab_checkpoint '
      || 'and neither is authoritative; S4b''s 18 checkpoints are not withdrawn. Every activity '
      || 'added under this selection carries the C-33 marker. Still unresolved: whether the '
      || 'dictation''s "Bagasse wetting" and "Hopper 1" are two checks around ONE hopper pass or '
      || 'around two distinct operations — the repo has two hopper passes and the dictation names '
      || 'three points before the bunker load.'
 where conflict_id = 'C-33';
