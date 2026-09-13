-- ─────────────────────────────────────────────────────────────────────────────
-- 0083 · PROCESS-2026E v1 — the 31-08 Compost SOP + TURNERPRCOESS baseline, as process DATA.
--
-- Source: the reviewed baseline process table v3 (14 Sep 2026). Data only: no engine change.
--   · main compost stages from Compost SOP.xlsx (31-08-2026); Turner / pile / bunker / tunnel execution values and sequence
--     from TURNERPRCOESS.xlsx. SOP wording is copied verbatim into instructions.
--   · every activity carries planning_unresolved = true (0082 E-1): no planned hours are stated.
--   · unresolved dependencies use UNRESOLVED_DEPENDENCY (0082 E-5): MIX-CM-ADD (SOP-U03),
--     BNK-B1/B2/B3-HOLD-3 (SOP-U04), TN-PREP (SOP-U05), TN-LEVEL (SOP-U06). No GM_APPROVAL substitute.
--   · Stage 0D generates no activity (SOP-U03).
--   · lab: the 41 LAB-2026A checkpoint activities, bindings, evidence and the 8 GM lab gates are
--     copied from PROCESS-2026C unchanged in behaviour (no lab entry gates); 6 reload-2 checkpoint
--     activities are added because LAB-2026A states LAB-RLD2-UNL / LAB-RLD2-RE for stage 1D-B.
--   · created as DRAFT. Publishing and making it current are separate steps.
--   · PROCESS-2026B and PROCESS-2026C are not touched.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from public.process_definition where code = 'PROCESS-2026E' and version = 1) then
    raise exception 'PROCESS-2026E v1 already exists; 0083 does not overwrite a process definition.';
  end if;
end $$;

-- 1 · register: source conflicts and unresolved questions this process carries
insert into public.conflict_register (conflict_id, kind, severity, question, sources, ship_with_default, status) values
  ('SOP-C01', 'conflict', null, 'Stage 0C heading 8 h vs its lines 5 + 40 + 3 = 48 h', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Lines kept as tasks; heading conflict carried', 'decided'),
  ('SOP-C02', 'conflict', null, 'Paddy 1C-A heading 74 h vs its lines 12 + 22 + 28 + 24 + 4 = 90 h', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Lines kept as tasks; conflict carried', 'decided'),
  ('SOP-C03', 'conflict', null, 'Phase 1A ''T0 15 h'' (23 h) and 1B 16 h vs TURNERPRCOESS T0+T1 all piles 9 h, T2+T3 10.5 h', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'TURNERPRCOESS governs per-pile values', 'decided'),
  ('SOP-C04', 'conflict', null, 'SOP ''T1 immediately after T0 / no gap'' and ''T3 immediately after T2'' vs TURNERPRCOESS gaps 1.5–4.5 h', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'TURNERPRCOESS governs; gaps informational, not enforced', 'decided'),
  ('SOP-C05', 'conflict', null, 'Bunker fill ''after 3–4 piles completion'', 8 h vs TURNERPRCOESS 2 h per bunker from the first pile of the pair', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'TURNERPRCOESS; opens at the first pile of the pair (user decision 14 Sep 2026)', 'decided'),
  ('SOP-C06', 'conflict', null, '1C holding ''48 h after attaining 70 °C'' vs reload trigger ''73–74 °C + 48+ h''', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Both shown; Supervisor confirms', 'open'),
  ('SOP-C07', 'conflict', null, 'Reload 1: SOP 8 h vs TURNERPRCOESS 2 h per bunker', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'TURNERPRCOESS governs', 'decided'),
  ('SOP-C08', 'conflict', null, '1D-A holding ''45 h after attaining 68 °C'' vs unload trigger ''70 °C + 36+ h''', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Both shown; Supervisor confirms', 'open'),
  ('SOP-C09', 'conflict', null, 'TURNERPRCOESS hold 2 labelled 15 + 45 = 60 h, but tunnel loading scheduled 63 / 63 / 65 h after reload', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Both shown', 'open'),
  ('SOP-C10', 'conflict', null, 'Reload 2 (1D-B) in the SOP; absent in TURNERPRCOESS', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Optional; skip with reason (user decision 14 Sep 2026)', 'decided'),
  ('SOP-C11', 'conflict', null, '1D-B holding 30–36 h vs trigger ''70 °C + 24 h'' vs 2B ''after 36 hrs of Reloading 2''', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Both shown; Supervisor confirms', 'open'),
  ('SOP-C12', 'conflict', null, 'Tunnel filling ''36 h after reloading 2'' vs TURNERPRCOESS 63 / 63 / 65 h after reload 1', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Eligibility by dependency; both shown', 'open'),
  ('SOP-C13', 'conflict', null, 'TURNERPRCOESS B3 grow-room loading 142 h after its tunnel load; B1/B2 144 h', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Informational', 'open'),
  ('SOP-C14', 'conflict', null, 'LAB-2026A: LAB-BNK-LOAD ''at each bunker fill'' and LAB-TUN-LOAD ''during tunnel filling'' are GATE checkpoints that lock those same activities until GM approval', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Existing gate model kept', 'open'),
  ('SOP-U01', 'tbd', null, '0A new bagasse weighment: meaning of ''pre-ho-10''; whether ''Optional'' means skip with reason', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Unresolved — recorded, not decided', 'open'),
  ('SOP-U02', 'tbd', null, '0C: rule for moisture between 67 % and 68 %', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Unresolved — recorded, not decided', 'open'),
  ('SOP-U03', 'tbd', 'blocks_behaviour', 'Stage 0D has a heading (24 h), a trigger and a dependency note but no task lines. When may Stage 1B (add CM mix) begin relative to the main compost stream?', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Unresolved — activity blocked until defined', 'open'),
  ('SOP-U04', 'tbd', 'blocks_behaviour', 'What follows a skipped Reload 2? Holding 3 must not open on a skip; the tunnel-filling path is undefined.', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Unresolved — activity blocked until defined', 'open'),
  ('SOP-U05', 'tbd', 'blocks_behaviour', 'When does tunnel preparation (2A) open? Neither source states a start condition.', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Unresolved — activity blocked until defined', 'open'),
  ('SOP-U06', 'tbd', 'blocks_behaviour', 'Tunnel clock: does the tunnel process start after all three tunnel fillings (SOP phases) or run per stream (TURNERPRCOESS 144 h per stream)?', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Unresolved — activity blocked until defined', 'open'),
  ('SOP-U07', 'tbd', null, '2D unloading: no duration; SOP one unloading line vs TURNERPRCOESS three grow-room loadings', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Unresolved — recorded, not decided', 'open'),
  ('SOP-U08', 'tbd', null, 'Hold hours vs trigger text disagree (SOP-C06, C08, C11) — displayed only; no rule chosen', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Unresolved — recorded, not decided', 'open'),
  ('SOP-U09', 'tbd', null, 'Photos on passive holds are not specified — none required', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Unresolved — recorded, not decided', 'open'),
  ('SOP-U11', 'tbd', null, '''Action: Start Cooling down 2'' with 8–14 h — performed start or passive hold (stored as a passive hold; unreachable while SOP-U06 blocks)', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Unresolved — recorded, not decided', 'open'),
  ('SOP-U12', 'tbd', null, 'Lab checkpoint timing (LAB-2026A ''during/after'' relationships) — deferred; existing behaviour = available from activation', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Unresolved — recorded, not decided', 'open'),
  ('SOP-U13', 'tbd', null, 'Absolute planned hours cannot be stated without resolving SOP-C01, SOP-C02, SOP-U03 — every activity carries planning_unresolved', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Unresolved — recorded, not decided', 'open'),
  ('SOP-U14', 'tbd', null, 'Readings stored as text targets; numeric bands would turn an out-of-range reading into a DEVIATION', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Unresolved — recorded, not decided', 'open'),
  ('SOP-U15', 'tbd', null, '1B 16 h line kept as one task; per-pass durations not stated', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Unresolved — recorded, not decided', 'open'),
  ('SOP-U16', 'tbd', null, '2A: three action lines, one 8 h value — kept as one task', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Unresolved — recorded, not decided', 'open'),
  ('SOP-U17', 'tbd', null, 'Borderline checklist splits: ''resting'' (heap), ''Resting in bunkers (…)'' (soaks), ''After tunnel wash'' — confirm they are actions', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Unresolved — recorded, not decided', 'open'),
  ('SOP-U18', 'tbd', null, 'Authority over unresolved dependencies — GM approval is NOT used; they stay blocked until the factory rule is defined', 'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A', 'Unresolved — recorded, not decided', 'open')
on conflict (conflict_id) do nothing;

-- 2 · definition (draft)
insert into public.process_definition (code, name, version, status, source_ref, anchor_day_label, total_days)
values ('PROCESS-2026E', 'Compost Standard Process 31-08-2026 + Turner process (baseline)', 1, 'draft',
        'Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A · baseline process table v3, 14 Sep 2026',
        'Planning unresolved — execution by dependency', 0);

-- 3 · production activities (one row per pile / bunker / stream instance)
insert into public.process_activity (process_definition_id, code, label_template, material_role, stream, rel_day, seq, scope,
  cardinality_rule, duration_target_min_hr, duration_target_max_hr, source_ref, tbd_marker, responsible_role,
  timing_confidence, is_hold, stage, instructions, skip_policy, notes, planning_unresolved)
values
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'FIB-WEIGH', 'New bagasse weighment', 'PRIMARY_FIBRE'::material_role_code, 'PRIMARY_FIBRE'::stream_code, 0, 100, 'MASTER'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, null, null, 'Compost SOP.xlsx (31-08-2026) C4:D4, F4 ''Optional''', 'SOP-U01', 'operator'::app_role, 'UNRESOLVED'::process_confidence, false, 'STAGE–0A: BAGASSE (NEW) PRE-WET & REST', 'New bagasse : weighment', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'FIB-WET-1', 'Wetting — 1st hopper pass', 'PRIMARY_FIBRE'::material_role_code, 'PRIMARY_FIBRE'::stream_code, 0, 200, 'MASTER'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 3, 3, 'Compost SOP.xlsx (31-08-2026) C5:D5', null, 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'STAGE–0A: BAGASSE (NEW) PRE-WET & REST', 'Action : Wetting (1st hopper pass with full water+ target moisture 69-71%)', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'FIB-REST-1', 'Rest', 'PRIMARY_FIBRE'::material_role_code, 'PRIMARY_FIBRE'::stream_code, 0, 300, 'MASTER'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 8, 8, 'Compost SOP.xlsx (31-08-2026) C6:D6', null, 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, true, 'STAGE–0A: BAGASSE (NEW) PRE-WET & REST', 'Rest', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'FIB-HOP-2', '2nd hopper pass', 'PRIMARY_FIBRE'::material_role_code, 'PRIMARY_FIBRE'::stream_code, 0, 400, 'MASTER'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 3, 3, 'Compost SOP.xlsx (31-08-2026) C7:D7', null, 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'STAGE–0A: BAGASSE (NEW) PRE-WET & REST', 'Action : 2nd Hopper pass (dry/with sufficent water to reach target mosture)', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'FIB-HEAP', 'Heap formation + resting', 'PRIMARY_FIBRE'::material_role_code, 'PRIMARY_FIBRE'::stream_code, 0, 500, 'MASTER'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 12, 12, 'Compost SOP.xlsx (31-08-2026) C8:D8', 'SOP-U17', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'STAGE–0A: BAGASSE (NEW) PRE-WET & REST', 'Action :Heap formation (height ≤1.5mts) + resting', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'FIB-BUNK-LOAD', 'Flipping + bunker filling', 'PRIMARY_FIBRE'::material_role_code, 'PRIMARY_FIBRE'::stream_code, 0, 600, 'MASTER'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 2, 2, 'Compost SOP.xlsx (31-08-2026) C10:D10', null, 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'STAGE–0B: 1st BUNKER FILLING & CONDITIONING', 'Action : Flipping + bunker filling (ht 2.6-2.7mts) without water', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'FIB-COND-1', 'Resting period — unloading trigger', 'PRIMARY_FIBRE'::material_role_code, 'PRIMARY_FIBRE'::stream_code, 0, 700, 'MASTER'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 60, 60, 'Compost SOP.xlsx (31-08-2026) C11:D12', null, 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, true, 'STAGE–0B: 1st BUNKER FILLING & CONDITIONING', 'Resting period & temp 45-55°C · Unloading trigger ≥ 58 °C &Time ≥ 60 hrs', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'FIB-RELOAD-1', 'Unloading, flipping, reloading to new bunker', 'PRIMARY_FIBRE'::material_role_code, 'PRIMARY_FIBRE'::stream_code, 0, 800, 'MASTER'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 5, 5, 'Compost SOP.xlsx (31-08-2026) C14:D15', 'SOP-C01', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'STAGE–0C: UNLOADING AND RE-LOADING', 'Action : Loader unloading, Flipping and Reloading to new bunker (without water) · Temp: 45–58 °C + Fill height: 2.2–2.4 ; Rest : 40 hrs', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'FIB-COND-2', 'Rest — start unloading at trigger', 'PRIMARY_FIBRE'::material_role_code, 'PRIMARY_FIBRE'::stream_code, 0, 900, 'MASTER'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 40, 40, 'Compost SOP.xlsx (31-08-2026) C16:D16', 'SOP-C01', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, true, 'STAGE–0C: UNLOADING AND RE-LOADING', 'Action : Whenever Temp reaches 58 °C OR crossing 40 Hrs Start Unloading', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'FIB-MOIST-DEC', 'Unload with moisture decision', 'PRIMARY_FIBRE'::material_role_code, 'PRIMARY_FIBRE'::stream_code, 0, 1000, 'MASTER'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 3, 3, 'Compost SOP.xlsx (31-08-2026) C17:D17', 'SOP-U02', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'STAGE–0C: UNLOADING AND RE-LOADING', 'UNLOAD TRIGGER Temp ≥ 58 °C OR Time ≥ 40 hrs; If Moisture ≥ 68 % → Proceed /If Moisture < 67 % → Controlled mist with hopper', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'CM-WEIGH', 'CM + gypsum + AS weighment', 'NITROGEN_SOURCE'::material_role_code, 'NITROGEN_MINERAL'::stream_code, 0, 1200, 'MASTER'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 2, 2, 'Compost SOP.xlsx (31-08-2026) C22:D22', null, 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'STAGE–1A: CHICKEN MANURE + MINERALS (DRY) MIX', 'Materials: CM + Gypsum + AS WEIGHMENT', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'CM-DRYMIX', 'Dry mix + rotavator', 'NITROGEN_SOURCE'::material_role_code, 'NITROGEN_MINERAL'::stream_code, 0, 1300, 'MASTER'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 4, 4, 'Compost SOP.xlsx (31-08-2026) C23:D23', null, 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'STAGE–1A: CHICKEN MANURE + MINERALS (DRY) MIX', 'Action: Dry mix+ use Rotovator for breaking manure lumps', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'MIX-CM-ADD', 'Add CM mix + loader mixing + flipping 1 + flipping 2', 'NITROGEN_SOURCE'::material_role_code, 'YARD'::stream_code, 0, 1400, 'MASTER'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 8, 8, 'Compost SOP.xlsx (31-08-2026) C25:D25', 'SOP-U03', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'STAGE–1B: CONDITIONED BAGASSE + MIXING OF DRY NITROGEN', 'Action : Add Chicken Manure(CM) Mix on conditioned bagasse + Loader mixing + Flipping 1+ Flipping 2 BACK TO BACK', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'MIX-HOP-PASSES', 'Hopper pass + another hopper pass + rest 10 h', null, 'YARD'::stream_code, 0, 1500, 'MASTER'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 16, 16, 'Compost SOP.xlsx (31-08-2026) C26:D26', 'SOP-U15', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'STAGE–1B: CONDITIONED BAGASSE + MIXING OF DRY NITROGEN', 'Action : Hopper pass with full (Target: 73% moisture+Temperature < 45–50 °C). Another Hopper Pass , plus rest of 10 hours', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'STR-WEIGH', 'Paddy bales weighment + cutting + threads removal', 'STRUCTURAL_STRAW'::material_role_code, 'STRUCTURAL_STRAW'::stream_code, 0, 1600, 'MASTER'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 12, 12, 'Compost SOP.xlsx (31-08-2026) C29:D29; E28 ''parallel process … converted to the bagasse mix timing''', 'SOP-C02', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'STAGE–1C-A: PADDY PREPARATION', 'Action :paddy bales weighment+ cutting+threads removal', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'STR-SOAK-1', 'Soaking 1', 'STRUCTURAL_STRAW'::material_role_code, 'STRUCTURAL_STRAW'::stream_code, 0, 1700, 'MASTER'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 22, 22, 'Compost SOP.xlsx (31-08-2026) C30:D30; E28 ''parallel process … converted to the bagasse mix timing''', 'SOP-C02', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'STAGE–1C-A: PADDY PREPARATION', 'Soaking 1 :- Pushing in + Tilting 1 + Tilting 2 + Pushing out(8-10 hours) + Resting in bunkers(10-12hrs)', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'STR-SOAK-2', 'Soaking 2', 'STRUCTURAL_STRAW'::material_role_code, 'STRUCTURAL_STRAW'::stream_code, 0, 1800, 'MASTER'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 28, 28, 'Compost SOP.xlsx (31-08-2026) C31:D31; E28 ''parallel process … converted to the bagasse mix timing''', 'SOP-C02', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'STAGE–1C-A: PADDY PREPARATION', 'Soaking 2 :- Pushing in + Tilting 1 + Tilting 2 + Pushing out(8-10 hours) + Resting in bunkers(18hrs)', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'STR-SOAK-3', 'Soaking 3', 'STRUCTURAL_STRAW'::material_role_code, 'STRUCTURAL_STRAW'::stream_code, 0, 1900, 'MASTER'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 24, 24, 'Compost SOP.xlsx (31-08-2026) C32:D32; E28 ''parallel process … converted to the bagasse mix timing''', 'SOP-C02', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'STAGE–1C-A: PADDY PREPARATION', 'Soaking 3 :- Pushing in + Tilting 1+ Tilting 2 + Pushing out(8-10 hours) + Resting in bunkers(12-14hrs)', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'STR-PILES', 'Preparation of 2 equal piles on platform', 'STRUCTURAL_STRAW'::material_role_code, 'STRUCTURAL_STRAW'::stream_code, 0, 2000, 'MASTER'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 4, 4, 'Compost SOP.xlsx (31-08-2026) C33:D33; E28 ''parallel process … converted to the bagasse mix timing''', 'SOP-C02', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'STAGE–1C-A: PADDY PREPARATION', 'Preparation of 2 equal piles on platform(4hrs)', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'YARD-ADD', 'Add bagasse + CM mix onto 2 paddy piles', null, 'YARD'::stream_code, 0, 2100, 'MASTER'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 2, 2, 'Compost SOP.xlsx (31-08-2026) C35:D35', null, 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'STAGE–1C-B: PADDY + BAGASSE + MINERAL MIXING', 'Action : Add Bagasse+ CM mix gradually on 2 paddy piles', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'YARD-FLIP', 'Flipping 1 + flipping 2 back to back', null, 'YARD'::stream_code, 0, 2200, 'MASTER'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 8, 8, 'Compost SOP.xlsx (31-08-2026) C36:D36', null, 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'STAGE–1C-B: PADDY + BAGASSE + MINERAL MIXING', 'Action :Flipping 1+ Flipping 2 BACK TO BACK', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P1-T0', 'Turner T0 — pile 1', null, 'YARD'::stream_code, 0, 2301, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 1"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C38 · TURNERPRCOESS.xlsx A2:S13', 'SOP-C03', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1A: T0 & T1 CONTINUOUS NO GAP', 'Action: Dry Turner pass (TO) without water (Estimated piles : 6 ), (No.of. Turner''s : 2 )', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 1 T0 09:00–10:30 D1', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P1-T1', 'Turner T1 — pile 1', null, 'YARD'::stream_code, 0, 2401, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 1"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C39 · TURNERPRCOESS.xlsx A15:S27', 'SOP-C04', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1A: T0 & T1 CONTINUOUS NO GAP', 'PHASE-1: T1 (immediately after TO ) with water (No.of. Turner''s : 2 )', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 1 T1 12:00–13:30 D1', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P1-T2', 'Turner T2 — pile 1', null, 'YARD'::stream_code, 0, 2501, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 1"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C40:D41 · TURNERPRCOESS.xlsx A28:S40', 'SOP-C03', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1B: T2 & T3', 'PHASE–1B: T2 & T3 · Action: 8 Hrs rest between T1&T2', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 1 T2 21:30–23:00 D1', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P1-T3', 'Turner T3 — pile 1', null, 'YARD'::stream_code, 0, 2601, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 1"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C42 · TURNERPRCOESS.xlsx A41:S53', 'SOP-C04', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1B: T2 & T3', 'Action: T3 immediately after T2', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 1 T3 03:30–05:00 D2', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P2-T0', 'Turner T0 — pile 2', null, 'YARD'::stream_code, 0, 2302, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 2"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C38 · TURNERPRCOESS.xlsx A2:S13', 'SOP-C03', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1A: T0 & T1 CONTINUOUS NO GAP', 'Action: Dry Turner pass (TO) without water (Estimated piles : 6 ), (No.of. Turner''s : 2 )', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 2 T0 10:30–12:00 D1', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P2-T1', 'Turner T1 — pile 2', null, 'YARD'::stream_code, 0, 2402, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 2"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C39 · TURNERPRCOESS.xlsx A15:S27', 'SOP-C04', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1A: T0 & T1 CONTINUOUS NO GAP', 'PHASE-1: T1 (immediately after TO ) with water (No.of. Turner''s : 2 )', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 2 T1 15:00–16:30 D1', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P2-T2', 'Turner T2 — pile 2', null, 'YARD'::stream_code, 0, 2502, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 2"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C40:D41 · TURNERPRCOESS.xlsx A28:S40', 'SOP-C03', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1B: T2 & T3', 'PHASE–1B: T2 & T3 · Action: 8 Hrs rest between T1&T2', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 2 T2 00:30–02:00 D2', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P2-T3', 'Turner T3 — pile 2', null, 'YARD'::stream_code, 0, 2602, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 2"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C42 · TURNERPRCOESS.xlsx A41:S53', 'SOP-C04', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1B: T2 & T3', 'Action: T3 immediately after T2', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 2 T3 05:00–06:30 D2', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P3-T0', 'Turner T0 — pile 3', null, 'YARD'::stream_code, 0, 2303, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 3"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C38 · TURNERPRCOESS.xlsx A2:S13', 'SOP-C03', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1A: T0 & T1 CONTINUOUS NO GAP', 'Action: Dry Turner pass (TO) without water (Estimated piles : 6 ), (No.of. Turner''s : 2 )', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 3 T0 09:00–10:30 D1', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P3-T1', 'Turner T1 — pile 3', null, 'YARD'::stream_code, 0, 2403, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 3"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C39 · TURNERPRCOESS.xlsx A15:S27', 'SOP-C04', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1A: T0 & T1 CONTINUOUS NO GAP', 'PHASE-1: T1 (immediately after TO ) with water (No.of. Turner''s : 2 )', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 3 T1 13:30–15:00 D1', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P3-T2', 'Turner T2 — pile 3', null, 'YARD'::stream_code, 0, 2503, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 3"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C40:D41 · TURNERPRCOESS.xlsx A28:S40', 'SOP-C03', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1B: T2 & T3', 'PHASE–1B: T2 & T3 · Action: 8 Hrs rest between T1&T2', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 3 T2 23:00 D1–00:30 D2', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P3-T3', 'Turner T3 — pile 3', null, 'YARD'::stream_code, 0, 2603, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 3"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C42 · TURNERPRCOESS.xlsx A41:S53', 'SOP-C04', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1B: T2 & T3', 'Action: T3 immediately after T2', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 3 T3 03:30–05:00 D2', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P4-T0', 'Turner T0 — pile 4', null, 'YARD'::stream_code, 0, 2304, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 4"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C38 · TURNERPRCOESS.xlsx A2:S13', 'SOP-C03', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1A: T0 & T1 CONTINUOUS NO GAP', 'Action: Dry Turner pass (TO) without water (Estimated piles : 6 ), (No.of. Turner''s : 2 )', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 4 T0 10:30–12:00 D1', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P4-T1', 'Turner T1 — pile 4', null, 'YARD'::stream_code, 0, 2404, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 4"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C39 · TURNERPRCOESS.xlsx A15:S27', 'SOP-C04', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1A: T0 & T1 CONTINUOUS NO GAP', 'PHASE-1: T1 (immediately after TO ) with water (No.of. Turner''s : 2 )', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 4 T1 16:30–18:00 D1', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P4-T2', 'Turner T2 — pile 4', null, 'YARD'::stream_code, 0, 2504, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 4"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C40:D41 · TURNERPRCOESS.xlsx A28:S40', 'SOP-C03', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1B: T2 & T3', 'PHASE–1B: T2 & T3 · Action: 8 Hrs rest between T1&T2', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 4 T2 02:00–03:30 D2', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P4-T3', 'Turner T3 — pile 4', null, 'YARD'::stream_code, 0, 2604, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 4"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C42 · TURNERPRCOESS.xlsx A41:S53', 'SOP-C04', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1B: T2 & T3', 'Action: T3 immediately after T2', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 4 T3 05:00–06:30 D2', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P5-T0', 'Turner T0 — pile 5', null, 'YARD'::stream_code, 0, 2305, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 5"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C38 · TURNERPRCOESS.xlsx A2:S13', 'SOP-C03', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1A: T0 & T1 CONTINUOUS NO GAP', 'Action: Dry Turner pass (TO) without water (Estimated piles : 6 ), (No.of. Turner''s : 2 )', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 5 T0 12:00–13:30 D1', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P5-T1', 'Turner T1 — pile 5', null, 'YARD'::stream_code, 0, 2405, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 5"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C39 · TURNERPRCOESS.xlsx A15:S27', 'SOP-C04', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1A: T0 & T1 CONTINUOUS NO GAP', 'PHASE-1: T1 (immediately after TO ) with water (No.of. Turner''s : 2 )', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 5 T1 15:00–16:30 D1', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P5-T2', 'Turner T2 — pile 5', null, 'YARD'::stream_code, 0, 2505, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 5"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C40:D41 · TURNERPRCOESS.xlsx A28:S40', 'SOP-C03', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1B: T2 & T3', 'PHASE–1B: T2 & T3 · Action: 8 Hrs rest between T1&T2', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 5 T2 00:30–02:00 D2', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P5-T3', 'Turner T3 — pile 5', null, 'YARD'::stream_code, 0, 2605, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 5"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C42 · TURNERPRCOESS.xlsx A41:S53', 'SOP-C04', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1B: T2 & T3', 'Action: T3 immediately after T2', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 5 T3 06:30–08:00 D2', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P6-T0', 'Turner T0 — pile 6', null, 'YARD'::stream_code, 0, 2306, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 6"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C38 · TURNERPRCOESS.xlsx A2:S13', 'SOP-C03', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1A: T0 & T1 CONTINUOUS NO GAP', 'Action: Dry Turner pass (TO) without water (Estimated piles : 6 ), (No.of. Turner''s : 2 )', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 6 T0 13:30–15:00 D1', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P6-T1', 'Turner T1 — pile 6', null, 'YARD'::stream_code, 0, 2406, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 6"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C39 · TURNERPRCOESS.xlsx A15:S27', 'SOP-C04', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1A: T0 & T1 CONTINUOUS NO GAP', 'PHASE-1: T1 (immediately after TO ) with water (No.of. Turner''s : 2 )', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 6 T1 16:30–18:00 D1', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P6-T2', 'Turner T2 — pile 6', null, 'YARD'::stream_code, 0, 2506, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 6"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C40:D41 · TURNERPRCOESS.xlsx A28:S40', 'SOP-C03', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1B: T2 & T3', 'PHASE–1B: T2 & T3 · Action: 8 Hrs rest between T1&T2', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 6 T2 02:00–03:30 D2', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TRN-P6-T3', 'Turner T3 — pile 6', null, 'YARD'::stream_code, 0, 2606, 'PILE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Pile 6"}'::jsonb, 1.5, 1.5, 'Compost SOP.xlsx (31-08-2026) C42 · TURNERPRCOESS.xlsx A41:S53', 'SOP-C04', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1B: T2 & T3', 'Action: T3 immediately after T2', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): pile 6 T3 06:30–08:00 D2', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'BNK-B1-FILL', 'Bunker filling — bunker 1', null, 'BUNKER'::stream_code, 0, 2701, 'BUNKER_LINE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Bunker 1"}'::jsonb, 2, 2, 'Compost SOP.xlsx (31-08-2026) C44:D44 · TURNERPRCOESS.xlsx A54:S66', 'SOP-C05', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1C BUNKER FILLING 1', 'Action :Bunker filling starts immediately after 3-4 piles completion (Ht 2.6-2.7 m) without water', 'not_allowed', 'Piles P1+P2. TURNERPRCOESS.xlsx planned clock (informational): 05:00–07:00 D2', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'BNK-B1-HOLD-1', 'Holding 1 — reload trigger — bunker 1', null, 'BUNKER'::stream_code, 0, 2801, 'BUNKER_LINE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Bunker 1"}'::jsonb, 63, 63, 'Compost SOP.xlsx (31-08-2026) C45:D46 · TURNERPRCOESS.xlsx row 67', 'SOP-C06', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, true, 'PHASE–1C BUNKER FILLING 1', 'Holding Duration :48 hours After attaining 70°C +15 HRS TO REACH 70 · Action: Reload trigger Temp 73–74 °C + Duration 48+ hours, start unload and load in to another bunker', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'BNK-B1-RELOAD', 'Unload & reload 1 — bunker 1', null, 'BUNKER'::stream_code, 0, 2901, 'BUNKER_LINE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Bunker 1"}'::jsonb, 2, 2, 'Compost SOP.xlsx (31-08-2026) C48:D48 · TURNERPRCOESS.xlsx A68:S79', 'SOP-C07', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1D-A UNLOAD & RELOAD – 1', 'Bunker filling (SOP) · ''Bunker Reloading'' (TURNERPRCOESS.xlsx)', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): 22:00–24:00 D4', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'BNK-B1-HOLD-2', 'Holding 2 — unload trigger — bunker 1', null, 'BUNKER'::stream_code, 0, 3001, 'BUNKER_LINE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Bunker 1"}'::jsonb, 60, 60, 'Compost SOP.xlsx (31-08-2026) C49:D50 · TURNERPRCOESS.xlsx row 80', 'SOP-C08', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, true, 'PHASE–1D-A UNLOAD & RELOAD – 1', 'Holding Duration : 45 hours After attaining 68°C · Action: unload trigger Temp 70 °C+Duration 36+ hrs,start unload and RELOAD', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'BNK-B1-RELOAD-2', 'Reload 2 (optional) — bunker 1', null, 'BUNKER'::stream_code, 0, 3101, 'BUNKER_LINE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Bunker 1"}'::jsonb, 10, 10, 'Compost SOP.xlsx (31-08-2026) C52:D52', 'SOP-C10', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1D-B UNLOAD & RELOAD – 2', 'Bunker filling (Reload 2)', 'with_reason', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'BNK-B1-HOLD-3', 'Holding 3 — unload into tunnel — bunker 1', null, 'BUNKER'::stream_code, 0, 3201, 'BUNKER_LINE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Bunker 1"}'::jsonb, 30, 36, 'Compost SOP.xlsx (31-08-2026) C53:D54', 'SOP-U04', 'operator'::app_role, 'FACTORY_RANGE'::process_confidence, true, 'PHASE–1D-B UNLOAD & RELOAD – 2', 'Holding Duration : 24 hours After attaining 68°C · Action: unload trigger Temp 70 °C+Duration 24 hrs,start unload and load into a tunnel', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'BNK-B2-FILL', 'Bunker filling — bunker 2', null, 'BUNKER'::stream_code, 0, 2702, 'BUNKER_LINE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Bunker 2"}'::jsonb, 2, 2, 'Compost SOP.xlsx (31-08-2026) C44:D44 · TURNERPRCOESS.xlsx A54:S66', 'SOP-C05', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1C BUNKER FILLING 1', 'Action :Bunker filling starts immediately after 3-4 piles completion (Ht 2.6-2.7 m) without water', 'not_allowed', 'Piles P3+P4. TURNERPRCOESS.xlsx planned clock (informational): 07:00–09:00 D2', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'BNK-B2-HOLD-1', 'Holding 1 — reload trigger — bunker 2', null, 'BUNKER'::stream_code, 0, 2802, 'BUNKER_LINE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Bunker 2"}'::jsonb, 63, 63, 'Compost SOP.xlsx (31-08-2026) C45:D46 · TURNERPRCOESS.xlsx row 67', 'SOP-C06', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, true, 'PHASE–1C BUNKER FILLING 1', 'Holding Duration :48 hours After attaining 70°C +15 HRS TO REACH 70 · Action: Reload trigger Temp 73–74 °C + Duration 48+ hours, start unload and load in to another bunker', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'BNK-B2-RELOAD', 'Unload & reload 1 — bunker 2', null, 'BUNKER'::stream_code, 0, 2902, 'BUNKER_LINE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Bunker 2"}'::jsonb, 2, 2, 'Compost SOP.xlsx (31-08-2026) C48:D48 · TURNERPRCOESS.xlsx A68:S79', 'SOP-C07', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1D-A UNLOAD & RELOAD – 1', 'Bunker filling (SOP) · ''Bunker Reloading'' (TURNERPRCOESS.xlsx)', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): 00:00–02:00 D5', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'BNK-B2-HOLD-2', 'Holding 2 — unload trigger — bunker 2', null, 'BUNKER'::stream_code, 0, 3002, 'BUNKER_LINE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Bunker 2"}'::jsonb, 60, 60, 'Compost SOP.xlsx (31-08-2026) C49:D50 · TURNERPRCOESS.xlsx row 80', 'SOP-C08', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, true, 'PHASE–1D-A UNLOAD & RELOAD – 1', 'Holding Duration : 45 hours After attaining 68°C · Action: unload trigger Temp 70 °C+Duration 36+ hrs,start unload and RELOAD', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'BNK-B2-RELOAD-2', 'Reload 2 (optional) — bunker 2', null, 'BUNKER'::stream_code, 0, 3102, 'BUNKER_LINE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Bunker 2"}'::jsonb, 10, 10, 'Compost SOP.xlsx (31-08-2026) C52:D52', 'SOP-C10', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1D-B UNLOAD & RELOAD – 2', 'Bunker filling (Reload 2)', 'with_reason', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'BNK-B2-HOLD-3', 'Holding 3 — unload into tunnel — bunker 2', null, 'BUNKER'::stream_code, 0, 3202, 'BUNKER_LINE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Bunker 2"}'::jsonb, 30, 36, 'Compost SOP.xlsx (31-08-2026) C53:D54', 'SOP-U04', 'operator'::app_role, 'FACTORY_RANGE'::process_confidence, true, 'PHASE–1D-B UNLOAD & RELOAD – 2', 'Holding Duration : 24 hours After attaining 68°C · Action: unload trigger Temp 70 °C+Duration 24 hrs,start unload and load into a tunnel', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'BNK-B3-FILL', 'Bunker filling — bunker 3', null, 'BUNKER'::stream_code, 0, 2703, 'BUNKER_LINE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Bunker 3"}'::jsonb, 2, 2, 'Compost SOP.xlsx (31-08-2026) C44:D44 · TURNERPRCOESS.xlsx A54:S66', 'SOP-C05', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1C BUNKER FILLING 1', 'Action :Bunker filling starts immediately after 3-4 piles completion (Ht 2.6-2.7 m) without water', 'not_allowed', 'Piles P5+P6. TURNERPRCOESS.xlsx planned clock (informational): 09:00–11:00 D2', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'BNK-B3-HOLD-1', 'Holding 1 — reload trigger — bunker 3', null, 'BUNKER'::stream_code, 0, 2803, 'BUNKER_LINE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Bunker 3"}'::jsonb, 63, 63, 'Compost SOP.xlsx (31-08-2026) C45:D46 · TURNERPRCOESS.xlsx row 67', 'SOP-C06', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, true, 'PHASE–1C BUNKER FILLING 1', 'Holding Duration :48 hours After attaining 70°C +15 HRS TO REACH 70 · Action: Reload trigger Temp 73–74 °C + Duration 48+ hours, start unload and load in to another bunker', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'BNK-B3-RELOAD', 'Unload & reload 1 — bunker 3', null, 'BUNKER'::stream_code, 0, 2903, 'BUNKER_LINE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Bunker 3"}'::jsonb, 2, 2, 'Compost SOP.xlsx (31-08-2026) C48:D48 · TURNERPRCOESS.xlsx A68:S79', 'SOP-C07', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1D-A UNLOAD & RELOAD – 1', 'Bunker filling (SOP) · ''Bunker Reloading'' (TURNERPRCOESS.xlsx)', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): 02:00–04:00 D5', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'BNK-B3-HOLD-2', 'Holding 2 — unload trigger — bunker 3', null, 'BUNKER'::stream_code, 0, 3003, 'BUNKER_LINE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Bunker 3"}'::jsonb, 60, 60, 'Compost SOP.xlsx (31-08-2026) C49:D50 · TURNERPRCOESS.xlsx row 80', 'SOP-C08', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, true, 'PHASE–1D-A UNLOAD & RELOAD – 1', 'Holding Duration : 45 hours After attaining 68°C · Action: unload trigger Temp 70 °C+Duration 36+ hrs,start unload and RELOAD', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'BNK-B3-RELOAD-2', 'Reload 2 (optional) — bunker 3', null, 'BUNKER'::stream_code, 0, 3103, 'BUNKER_LINE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Bunker 3"}'::jsonb, 10, 10, 'Compost SOP.xlsx (31-08-2026) C52:D52', 'SOP-C10', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–1D-B UNLOAD & RELOAD – 2', 'Bunker filling (Reload 2)', 'with_reason', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'BNK-B3-HOLD-3', 'Holding 3 — unload into tunnel — bunker 3', null, 'BUNKER'::stream_code, 0, 3203, 'BUNKER_LINE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Bunker 3"}'::jsonb, 30, 36, 'Compost SOP.xlsx (31-08-2026) C53:D54', 'SOP-U04', 'operator'::app_role, 'FACTORY_RANGE'::process_confidence, true, 'PHASE–1D-B UNLOAD & RELOAD – 2', 'Holding Duration : 24 hours After attaining 68°C · Action: unload trigger Temp 70 °C+Duration 24 hrs,start unload and load into a tunnel', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TN-PREP', 'Tunnel preparation', null, 'TUNNEL'::stream_code, 0, 3300, 'TUNNEL'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 8, 8, 'Compost SOP.xlsx (31-08-2026) C55:D58', 'SOP-U05', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–2A TUNNEL PREPERATION', 'Action: After tunnel wash + gliding net should be tight fix to the total grid area + Clean and dry probes & hang probably · Action: Remove and wash nets (wash with high pressure water No folds & dirt + stich damages) · Action:Leave 6.0mts of Pulling net at wynch side( for unloading)', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'BNK-B1-TUN-LOAD', 'Tunnel filling — bunker 1', null, 'TUNNEL'::stream_code, 0, 3401, 'BUNKER_LINE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Bunker 1"}'::jsonb, 2, 2, 'Compost SOP.xlsx (31-08-2026) C60:D60 · TURNERPRCOESS.xlsx A81:S92', 'SOP-C12', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–2B TUNNEL FILLING', 'Action:After 36hrs of Reloading 2, start load in to Tunnel', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): 15:00–17:00 D7', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'BNK-B2-TUN-LOAD', 'Tunnel filling — bunker 2', null, 'TUNNEL'::stream_code, 0, 3402, 'BUNKER_LINE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Bunker 2"}'::jsonb, 2, 2, 'Compost SOP.xlsx (31-08-2026) C60:D60 · TURNERPRCOESS.xlsx A81:S92', 'SOP-C12', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–2B TUNNEL FILLING', 'Action:After 36hrs of Reloading 2, start load in to Tunnel', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): 17:00–19:00 D7', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'BNK-B3-TUN-LOAD', 'Tunnel filling — bunker 3', null, 'TUNNEL'::stream_code, 0, 3403, 'BUNKER_LINE'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Bunker 3"}'::jsonb, 2, 2, 'Compost SOP.xlsx (31-08-2026) C60:D60 · TURNERPRCOESS.xlsx A81:S92', 'SOP-C12', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–2B TUNNEL FILLING', 'Action:After 36hrs of Reloading 2, start load in to Tunnel', 'not_allowed', 'TURNERPRCOESS.xlsx planned clock (informational): 21:00–23:00 D7', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TN-LEVEL', 'Levelling & conditioning', null, 'TUNNEL'::stream_code, 0, 3500, 'TUNNEL'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 14, 14, 'Compost SOP.xlsx (31-08-2026) C62:D62 · TURNERPRCOESS.xlsx row 93 ''144 Hrs (6 Days)''', 'SOP-U06', 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, false, 'PHASE–2C TUNNEL PROCESS', 'Action: Levelling&conditioning', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TN-HEAT', 'Heating up', null, 'TUNNEL'::stream_code, 0, 3600, 'TUNNEL'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 12.0, 12.0, 'Compost SOP.xlsx (31-08-2026) C63:D63 · TURNERPRCOESS.xlsx row 93 ''144 Hrs (6 Days)''', null, 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, true, 'PHASE–2C TUNNEL PROCESS', 'Heating up', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TN-PAST', 'Pasteurization', null, 'TUNNEL'::stream_code, 0, 3700, 'TUNNEL'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 8.0, 8.0, 'Compost SOP.xlsx (31-08-2026) C64:D64 · TURNERPRCOESS.xlsx row 93 ''144 Hrs (6 Days)''', null, 'operator'::app_role, 'FACTORY_CONFIRMED'::process_confidence, true, 'PHASE–2C TUNNEL PROCESS', 'Pasteurization', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TN-COOL-1', 'Cooling down 1', null, 'TUNNEL'::stream_code, 0, 3800, 'TUNNEL'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 12.0, 14.0, 'Compost SOP.xlsx (31-08-2026) C65:D65 · TURNERPRCOESS.xlsx row 93 ''144 Hrs (6 Days)''', null, 'operator'::app_role, 'FACTORY_RANGE'::process_confidence, true, 'PHASE–2C TUNNEL PROCESS', 'Cooling down 1', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TN-COND-2', 'Conditioning 2', null, 'TUNNEL'::stream_code, 0, 3900, 'TUNNEL'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 80.0, 85.0, 'Compost SOP.xlsx (31-08-2026) C66:D66 · TURNERPRCOESS.xlsx row 93 ''144 Hrs (6 Days)''', null, 'operator'::app_role, 'FACTORY_RANGE'::process_confidence, true, 'PHASE–2C TUNNEL PROCESS', 'Conditioning 2', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TN-COOL-2', 'Start cooling down 2', null, 'TUNNEL'::stream_code, 0, 4000, 'TUNNEL'::activity_scope, '{"kind": "SINGLETON"}'::jsonb, 8.0, 14.0, 'Compost SOP.xlsx (31-08-2026) C67:D67 · TURNERPRCOESS.xlsx row 93 ''144 Hrs (6 Days)''', 'SOP-U11', 'operator'::app_role, 'FACTORY_RANGE'::process_confidence, true, 'PHASE–2C TUNNEL PROCESS', 'Action: Start Cooling down 2', 'not_allowed', null, true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TUN-DISCHARGE-1', 'Tunnel unloading / grow-room loading — stream 1', null, 'TUNNEL'::stream_code, 0, 4101, 'TUNNEL'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Stream 1"}'::jsonb, null, null, 'Compost SOP.xlsx (31-08-2026) C68:C69 · TURNERPRCOESS.xlsx A94:S94', 'SOP-U07', 'operator'::app_role, 'UNRESOLVED'::process_confidence, false, 'PHASE–2D TUNNEL UNLOADING', 'Action :At 24 degree start unloading compost', 'not_allowed', 'TURNERPRCOESS.xlsx grow-room loading start (informational): B1 17:00 D13', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TUN-DISCHARGE-2', 'Tunnel unloading / grow-room loading — stream 2', null, 'TUNNEL'::stream_code, 0, 4102, 'TUNNEL'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Stream 2"}'::jsonb, null, null, 'Compost SOP.xlsx (31-08-2026) C68:C69 · TURNERPRCOESS.xlsx A94:S94', 'SOP-U07', 'operator'::app_role, 'UNRESOLVED'::process_confidence, false, 'PHASE–2D TUNNEL UNLOADING', 'Action :At 24 degree start unloading compost', 'not_allowed', 'TURNERPRCOESS.xlsx grow-room loading start (informational): B2 19:00 D13', true),
  ((select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), 'TUN-DISCHARGE-3', 'Tunnel unloading / grow-room loading — stream 3', null, 'TUNNEL'::stream_code, 0, 4103, 'TUNNEL'::activity_scope, '{"kind": "FIXED_LABEL", "label": "Stream 3"}'::jsonb, null, null, 'Compost SOP.xlsx (31-08-2026) C68:C69 · TURNERPRCOESS.xlsx A94:S94', 'SOP-U07', 'operator'::app_role, 'UNRESOLVED'::process_confidence, false, 'PHASE–2D TUNNEL UNLOADING', 'Action :At 24 degree start unloading compost', 'not_allowed', 'TURNERPRCOESS.xlsx grow-room loading start (informational): B3 21:00 D13', true);

-- 4 · checklist items ('+' actions only) and readings (stated SOP targets, text only)
insert into public.activity_field (process_activity_id, key, label, datatype, unit, sop_value, sop_source_ref, operator_input, section, display_order)
select pa.id, v.key, v.label, v.datatype, v.unit, v.target, pa.source_ref, 'required', v.section, v.ord
from (values
  ('FIB-WET-1', 'moisture_pct', 'Moisture', 'numeric', '%', '69–71', 'Readings', 1),
  ('FIB-HOP-2', 'moisture_pct', 'Moisture', 'numeric', '%', 'reach target moisture', 'Readings', 1),
  ('FIB-HEAP', 'chk_1', 'Heap formation (height ≤1.5mts)', 'check', null, null, 'Checklist', 1),
  ('FIB-HEAP', 'chk_2', 'resting', 'check', null, null, 'Checklist', 2),
  ('FIB-HEAP', 'heap_height_m', 'Heap height', 'numeric', 'm', '≤1.5', 'Readings', 3),
  ('FIB-BUNK-LOAD', 'chk_1', 'Flipping', 'check', null, null, 'Checklist', 1),
  ('FIB-BUNK-LOAD', 'chk_2', 'bunker filling (ht 2.6-2.7mts) without water', 'check', null, null, 'Checklist', 2),
  ('FIB-BUNK-LOAD', 'fill_height_m', 'Fill height', 'numeric', 'm', '2.6–2.7', 'Readings', 3),
  ('FIB-COND-1', 'temperature_c', 'Temperature at confirmation', 'numeric', '°C', 'unload trigger ≥58 °C AND ≥60 h', 'Readings', 1),
  ('FIB-RELOAD-1', 'temperature_c', 'Temperature', 'numeric', '°C', '45–58', 'Readings', 1),
  ('FIB-RELOAD-1', 'fill_height_m', 'Fill height', 'numeric', 'm', '2.2–2.4', 'Readings', 2),
  ('FIB-COND-2', 'temperature_c', 'Temperature at confirmation', 'numeric', '°C', 'trigger ≥58 °C OR ≥40 h', 'Readings', 1),
  ('FIB-MOIST-DEC', 'moisture_pct', 'Moisture', 'numeric', '%', '≥68 proceed / <67 controlled mist with hopper', 'Readings', 1),
  ('CM-DRYMIX', 'chk_1', 'Dry mix', 'check', null, null, 'Checklist', 1),
  ('CM-DRYMIX', 'chk_2', 'use Rotovator for breaking manure lumps', 'check', null, null, 'Checklist', 2),
  ('MIX-CM-ADD', 'chk_1', 'Add Chicken Manure(CM) Mix on conditioned bagasse', 'check', null, null, 'Checklist', 1),
  ('MIX-CM-ADD', 'chk_2', 'Loader mixing', 'check', null, null, 'Checklist', 2),
  ('MIX-CM-ADD', 'chk_3', 'Flipping 1', 'check', null, null, 'Checklist', 3),
  ('MIX-CM-ADD', 'chk_4', 'Flipping 2 BACK TO BACK', 'check', null, null, 'Checklist', 4),
  ('MIX-HOP-PASSES', 'moisture_pct', 'Moisture', 'numeric', '%', '73', 'Readings', 1),
  ('MIX-HOP-PASSES', 'temperature_c', 'Temperature', 'numeric', '°C', '<45–50', 'Readings', 2),
  ('STR-WEIGH', 'chk_1', 'paddy bales weighment', 'check', null, null, 'Checklist', 1),
  ('STR-WEIGH', 'chk_2', 'cutting', 'check', null, null, 'Checklist', 2),
  ('STR-WEIGH', 'chk_3', 'threads removal', 'check', null, null, 'Checklist', 3),
  ('STR-SOAK-1', 'chk_1', 'Pushing in', 'check', null, null, 'Checklist', 1),
  ('STR-SOAK-1', 'chk_2', 'Tilting 1', 'check', null, null, 'Checklist', 2),
  ('STR-SOAK-1', 'chk_3', 'Tilting 2', 'check', null, null, 'Checklist', 3),
  ('STR-SOAK-1', 'chk_4', 'Pushing out(8-10 hours)', 'check', null, null, 'Checklist', 4),
  ('STR-SOAK-1', 'chk_5', 'Resting in bunkers(10-12hrs)', 'check', null, null, 'Checklist', 5),
  ('STR-SOAK-2', 'chk_1', 'Pushing in', 'check', null, null, 'Checklist', 1),
  ('STR-SOAK-2', 'chk_2', 'Tilting 1', 'check', null, null, 'Checklist', 2),
  ('STR-SOAK-2', 'chk_3', 'Tilting 2', 'check', null, null, 'Checklist', 3),
  ('STR-SOAK-2', 'chk_4', 'Pushing out(8-10 hours)', 'check', null, null, 'Checklist', 4),
  ('STR-SOAK-2', 'chk_5', 'Resting in bunkers(18hrs)', 'check', null, null, 'Checklist', 5),
  ('STR-SOAK-3', 'chk_1', 'Pushing in', 'check', null, null, 'Checklist', 1),
  ('STR-SOAK-3', 'chk_2', 'Tilting 1', 'check', null, null, 'Checklist', 2),
  ('STR-SOAK-3', 'chk_3', 'Tilting 2', 'check', null, null, 'Checklist', 3),
  ('STR-SOAK-3', 'chk_4', 'Pushing out(8-10 hours)', 'check', null, null, 'Checklist', 4),
  ('STR-SOAK-3', 'chk_5', 'Resting in bunkers(12-14hrs)', 'check', null, null, 'Checklist', 5),
  ('YARD-FLIP', 'chk_1', 'Flipping 1', 'check', null, null, 'Checklist', 1),
  ('YARD-FLIP', 'chk_2', 'Flipping 2 BACK TO BACK', 'check', null, null, 'Checklist', 2),
  ('BNK-B1-FILL', 'fill_height_m', 'Fill height', 'numeric', 'm', '2.6–2.7', 'Readings', 1),
  ('BNK-B1-HOLD-1', 'temperature_c', 'Temperature at confirmation', 'numeric', '°C', 'reload trigger 73–74 °C + 48+ h', 'Readings', 1),
  ('BNK-B1-HOLD-2', 'temperature_c', 'Temperature at confirmation', 'numeric', '°C', 'unload trigger 70 °C + 36+ h', 'Readings', 1),
  ('BNK-B1-HOLD-3', 'temperature_c', 'Temperature at confirmation', 'numeric', '°C', 'unload trigger 70 °C + 24 h', 'Readings', 1),
  ('BNK-B2-FILL', 'fill_height_m', 'Fill height', 'numeric', 'm', '2.6–2.7', 'Readings', 1),
  ('BNK-B2-HOLD-1', 'temperature_c', 'Temperature at confirmation', 'numeric', '°C', 'reload trigger 73–74 °C + 48+ h', 'Readings', 1),
  ('BNK-B2-HOLD-2', 'temperature_c', 'Temperature at confirmation', 'numeric', '°C', 'unload trigger 70 °C + 36+ h', 'Readings', 1),
  ('BNK-B2-HOLD-3', 'temperature_c', 'Temperature at confirmation', 'numeric', '°C', 'unload trigger 70 °C + 24 h', 'Readings', 1),
  ('BNK-B3-FILL', 'fill_height_m', 'Fill height', 'numeric', 'm', '2.6–2.7', 'Readings', 1),
  ('BNK-B3-HOLD-1', 'temperature_c', 'Temperature at confirmation', 'numeric', '°C', 'reload trigger 73–74 °C + 48+ h', 'Readings', 1),
  ('BNK-B3-HOLD-2', 'temperature_c', 'Temperature at confirmation', 'numeric', '°C', 'unload trigger 70 °C + 36+ h', 'Readings', 1),
  ('BNK-B3-HOLD-3', 'temperature_c', 'Temperature at confirmation', 'numeric', '°C', 'unload trigger 70 °C + 24 h', 'Readings', 1),
  ('TN-PREP', 'chk_1', 'After tunnel wash', 'check', null, null, 'Checklist', 1),
  ('TN-PREP', 'chk_2', 'gliding net should be tight fix to the total grid area', 'check', null, null, 'Checklist', 2),
  ('TN-PREP', 'chk_3', 'Clean and dry probes & hang probably', 'check', null, null, 'Checklist', 3),
  ('TUN-DISCHARGE-1', 'temperature_c', 'Temperature', 'numeric', '°C', 'start unloading at 24', 'Readings', 1),
  ('TUN-DISCHARGE-2', 'temperature_c', 'Temperature', 'numeric', '°C', 'start unloading at 24', 'Readings', 1),
  ('TUN-DISCHARGE-3', 'temperature_c', 'Temperature', 'numeric', '°C', 'start unloading at 24', 'Readings', 1)
) v(code, key, label, datatype, unit, target, section, ord)
join public.process_activity pa on pa.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026E' and version = 1) and pa.code = v.code;

-- 5 · evidence: before + after photo, after Start, on performed / physical / Turner work only (not on holds)
insert into public.evidence_requirement (process_activity_id, key, label, media_kinds, min_count, gates_submission, ordering, capture_phase)
select pa.id, v.key, v.label, array['photo'], 1, true, v.ord, 'after_start'
from (values
  ('FIB-WEIGH', 'BEFORE_PHOTO', 'Before photo', 1),
  ('FIB-WEIGH', 'AFTER_PHOTO', 'After photo', 2),
  ('FIB-WET-1', 'BEFORE_PHOTO', 'Before photo', 1),
  ('FIB-WET-1', 'AFTER_PHOTO', 'After photo', 2),
  ('FIB-HOP-2', 'BEFORE_PHOTO', 'Before photo', 1),
  ('FIB-HOP-2', 'AFTER_PHOTO', 'After photo', 2),
  ('FIB-HEAP', 'BEFORE_PHOTO', 'Before photo', 1),
  ('FIB-HEAP', 'AFTER_PHOTO', 'After photo', 2),
  ('FIB-BUNK-LOAD', 'BEFORE_PHOTO', 'Before photo', 1),
  ('FIB-BUNK-LOAD', 'AFTER_PHOTO', 'After photo', 2),
  ('FIB-RELOAD-1', 'BEFORE_PHOTO', 'Before photo', 1),
  ('FIB-RELOAD-1', 'AFTER_PHOTO', 'After photo', 2),
  ('FIB-MOIST-DEC', 'BEFORE_PHOTO', 'Before photo', 1),
  ('FIB-MOIST-DEC', 'AFTER_PHOTO', 'After photo', 2),
  ('CM-WEIGH', 'BEFORE_PHOTO', 'Before photo', 1),
  ('CM-WEIGH', 'AFTER_PHOTO', 'After photo', 2),
  ('CM-DRYMIX', 'BEFORE_PHOTO', 'Before photo', 1),
  ('CM-DRYMIX', 'AFTER_PHOTO', 'After photo', 2),
  ('MIX-CM-ADD', 'BEFORE_PHOTO', 'Before photo', 1),
  ('MIX-CM-ADD', 'AFTER_PHOTO', 'After photo', 2),
  ('MIX-HOP-PASSES', 'BEFORE_PHOTO', 'Before photo', 1),
  ('MIX-HOP-PASSES', 'AFTER_PHOTO', 'After photo', 2),
  ('STR-WEIGH', 'BEFORE_PHOTO', 'Before photo', 1),
  ('STR-WEIGH', 'AFTER_PHOTO', 'After photo', 2),
  ('STR-SOAK-1', 'BEFORE_PHOTO', 'Before photo', 1),
  ('STR-SOAK-1', 'AFTER_PHOTO', 'After photo', 2),
  ('STR-SOAK-2', 'BEFORE_PHOTO', 'Before photo', 1),
  ('STR-SOAK-2', 'AFTER_PHOTO', 'After photo', 2),
  ('STR-SOAK-3', 'BEFORE_PHOTO', 'Before photo', 1),
  ('STR-SOAK-3', 'AFTER_PHOTO', 'After photo', 2),
  ('STR-PILES', 'BEFORE_PHOTO', 'Before photo', 1),
  ('STR-PILES', 'AFTER_PHOTO', 'After photo', 2),
  ('YARD-ADD', 'BEFORE_PHOTO', 'Before photo', 1),
  ('YARD-ADD', 'AFTER_PHOTO', 'After photo', 2),
  ('YARD-FLIP', 'BEFORE_PHOTO', 'Before photo', 1),
  ('YARD-FLIP', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P1-T0', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P1-T0', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P1-T1', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P1-T1', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P1-T2', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P1-T2', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P1-T3', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P1-T3', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P2-T0', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P2-T0', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P2-T1', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P2-T1', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P2-T2', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P2-T2', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P2-T3', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P2-T3', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P3-T0', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P3-T0', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P3-T1', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P3-T1', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P3-T2', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P3-T2', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P3-T3', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P3-T3', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P4-T0', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P4-T0', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P4-T1', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P4-T1', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P4-T2', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P4-T2', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P4-T3', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P4-T3', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P5-T0', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P5-T0', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P5-T1', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P5-T1', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P5-T2', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P5-T2', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P5-T3', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P5-T3', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P6-T0', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P6-T0', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P6-T1', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P6-T1', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P6-T2', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P6-T2', 'AFTER_PHOTO', 'After photo', 2),
  ('TRN-P6-T3', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TRN-P6-T3', 'AFTER_PHOTO', 'After photo', 2),
  ('BNK-B1-FILL', 'BEFORE_PHOTO', 'Before photo', 1),
  ('BNK-B1-FILL', 'AFTER_PHOTO', 'After photo', 2),
  ('BNK-B1-RELOAD', 'BEFORE_PHOTO', 'Before photo', 1),
  ('BNK-B1-RELOAD', 'AFTER_PHOTO', 'After photo', 2),
  ('BNK-B1-RELOAD-2', 'BEFORE_PHOTO', 'Before photo', 1),
  ('BNK-B1-RELOAD-2', 'AFTER_PHOTO', 'After photo', 2),
  ('BNK-B2-FILL', 'BEFORE_PHOTO', 'Before photo', 1),
  ('BNK-B2-FILL', 'AFTER_PHOTO', 'After photo', 2),
  ('BNK-B2-RELOAD', 'BEFORE_PHOTO', 'Before photo', 1),
  ('BNK-B2-RELOAD', 'AFTER_PHOTO', 'After photo', 2),
  ('BNK-B2-RELOAD-2', 'BEFORE_PHOTO', 'Before photo', 1),
  ('BNK-B2-RELOAD-2', 'AFTER_PHOTO', 'After photo', 2),
  ('BNK-B3-FILL', 'BEFORE_PHOTO', 'Before photo', 1),
  ('BNK-B3-FILL', 'AFTER_PHOTO', 'After photo', 2),
  ('BNK-B3-RELOAD', 'BEFORE_PHOTO', 'Before photo', 1),
  ('BNK-B3-RELOAD', 'AFTER_PHOTO', 'After photo', 2),
  ('BNK-B3-RELOAD-2', 'BEFORE_PHOTO', 'Before photo', 1),
  ('BNK-B3-RELOAD-2', 'AFTER_PHOTO', 'After photo', 2),
  ('TN-PREP', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TN-PREP', 'AFTER_PHOTO', 'After photo', 2),
  ('BNK-B1-TUN-LOAD', 'BEFORE_PHOTO', 'Before photo', 1),
  ('BNK-B1-TUN-LOAD', 'AFTER_PHOTO', 'After photo', 2),
  ('BNK-B2-TUN-LOAD', 'BEFORE_PHOTO', 'Before photo', 1),
  ('BNK-B2-TUN-LOAD', 'AFTER_PHOTO', 'After photo', 2),
  ('BNK-B3-TUN-LOAD', 'BEFORE_PHOTO', 'Before photo', 1),
  ('BNK-B3-TUN-LOAD', 'AFTER_PHOTO', 'After photo', 2),
  ('TN-LEVEL', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TN-LEVEL', 'AFTER_PHOTO', 'After photo', 2),
  ('TUN-DISCHARGE-1', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TUN-DISCHARGE-1', 'AFTER_PHOTO', 'After photo', 2),
  ('TUN-DISCHARGE-2', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TUN-DISCHARGE-2', 'AFTER_PHOTO', 'After photo', 2),
  ('TUN-DISCHARGE-3', 'BEFORE_PHOTO', 'Before photo', 1),
  ('TUN-DISCHARGE-3', 'AFTER_PHOTO', 'After photo', 2)
) v(code, key, label, ord)
join public.process_activity pa on pa.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026E' and version = 1) and pa.code = v.code;

-- 6 · entry gates: stated dependencies, the existing GM lab gates, and unresolved dependencies
insert into public.gate_rule (process_activity_id, phase, kind, config, predecessor_binding, blocked_reason_template, ordering, conflict_id, mapping_confidence)
select pa.id, 'entry', v.kind, v.config::jsonb, v.binding, v.tpl, v.ord, v.cid, v.conf
from (values
  ('FIB-REST-1', 'PREDECESSOR', '{"activity_codes": ["FIB-WET-1"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('FIB-HOP-2', 'PREDECESSOR', '{"activity_codes": ["FIB-REST-1"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('FIB-HEAP', 'PREDECESSOR', '{"activity_codes": ["FIB-HOP-2"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('FIB-BUNK-LOAD', 'PREDECESSOR', '{"activity_codes": ["FIB-HEAP"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('FIB-BUNK-LOAD', 'LAB_APPROVED', '{"checkpoint_map": "LAB_2026A"}', null, 'Locked — waiting for laboratory approval. {checkpoint}: {approved_count} of {required_count} approved. A recorded result is not an approved result.', 5, null, 'dictated'),
  ('FIB-COND-1', 'PREDECESSOR', '{"activity_codes": ["FIB-BUNK-LOAD"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('FIB-RELOAD-1', 'PREDECESSOR', '{"activity_codes": ["FIB-COND-1"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('FIB-COND-2', 'PREDECESSOR', '{"activity_codes": ["FIB-RELOAD-1"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('FIB-MOIST-DEC', 'PREDECESSOR', '{"activity_codes": ["FIB-COND-2"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('CM-DRYMIX', 'PREDECESSOR', '{"activity_codes": ["CM-WEIGH"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('MIX-CM-ADD', 'PREDECESSOR', '{"activity_codes": ["CM-DRYMIX"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('MIX-CM-ADD', 'LAB_APPROVED', '{"checkpoint_map": "LAB_2026A"}', null, 'Locked — waiting for laboratory approval. {checkpoint}: {approved_count} of {required_count} approved. A recorded result is not an approved result.', 5, null, 'dictated'),
  ('MIX-CM-ADD', 'UNRESOLVED_DEPENDENCY', '{}', null, 'Locked — not yet defined by the SOP: {question} ({conflict_id})', 20, 'SOP-U03', 'unmapped'),
  ('MIX-HOP-PASSES', 'PREDECESSOR', '{"activity_codes": ["MIX-CM-ADD"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('STR-SOAK-1', 'PREDECESSOR', '{"activity_codes": ["STR-WEIGH"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('STR-SOAK-2', 'PREDECESSOR', '{"activity_codes": ["STR-SOAK-1"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('STR-SOAK-3', 'PREDECESSOR', '{"activity_codes": ["STR-SOAK-2"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('STR-PILES', 'PREDECESSOR', '{"activity_codes": ["STR-SOAK-3"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('YARD-ADD', 'PREDECESSOR', '{"activity_codes": ["MIX-HOP-PASSES", "STR-PILES"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('YARD-FLIP', 'PREDECESSOR', '{"activity_codes": ["YARD-ADD"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TRN-P1-T0', 'PREDECESSOR', '{"activity_codes": ["YARD-FLIP"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TRN-P1-T1', 'PREDECESSOR', '{"activity_codes": ["TRN-P1-T0"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TRN-P1-T2', 'PREDECESSOR', '{"activity_codes": ["TRN-P1-T1"], "min_rest_hr": 8}', 'SAME_SCOPE_INSTANCE', 'Locked — waits on {predecessor_label}. This pile rests {rest_required_hr} h after its own T1 ends. {rest_status}', 10, null, 'dictated'),
  ('TRN-P1-T3', 'PREDECESSOR', '{"activity_codes": ["TRN-P1-T2"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TRN-P2-T0', 'PREDECESSOR', '{"activity_codes": ["YARD-FLIP"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TRN-P2-T1', 'PREDECESSOR', '{"activity_codes": ["TRN-P2-T0"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TRN-P2-T2', 'PREDECESSOR', '{"activity_codes": ["TRN-P2-T1"], "min_rest_hr": 8}', 'SAME_SCOPE_INSTANCE', 'Locked — waits on {predecessor_label}. This pile rests {rest_required_hr} h after its own T1 ends. {rest_status}', 10, null, 'dictated'),
  ('TRN-P2-T3', 'PREDECESSOR', '{"activity_codes": ["TRN-P2-T2"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TRN-P3-T0', 'PREDECESSOR', '{"activity_codes": ["YARD-FLIP"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TRN-P3-T1', 'PREDECESSOR', '{"activity_codes": ["TRN-P3-T0"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TRN-P3-T2', 'PREDECESSOR', '{"activity_codes": ["TRN-P3-T1"], "min_rest_hr": 8}', 'SAME_SCOPE_INSTANCE', 'Locked — waits on {predecessor_label}. This pile rests {rest_required_hr} h after its own T1 ends. {rest_status}', 10, null, 'dictated'),
  ('TRN-P3-T3', 'PREDECESSOR', '{"activity_codes": ["TRN-P3-T2"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TRN-P4-T0', 'PREDECESSOR', '{"activity_codes": ["YARD-FLIP"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TRN-P4-T1', 'PREDECESSOR', '{"activity_codes": ["TRN-P4-T0"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TRN-P4-T2', 'PREDECESSOR', '{"activity_codes": ["TRN-P4-T1"], "min_rest_hr": 8}', 'SAME_SCOPE_INSTANCE', 'Locked — waits on {predecessor_label}. This pile rests {rest_required_hr} h after its own T1 ends. {rest_status}', 10, null, 'dictated'),
  ('TRN-P4-T3', 'PREDECESSOR', '{"activity_codes": ["TRN-P4-T2"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TRN-P5-T0', 'PREDECESSOR', '{"activity_codes": ["YARD-FLIP"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TRN-P5-T1', 'PREDECESSOR', '{"activity_codes": ["TRN-P5-T0"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TRN-P5-T2', 'PREDECESSOR', '{"activity_codes": ["TRN-P5-T1"], "min_rest_hr": 8}', 'SAME_SCOPE_INSTANCE', 'Locked — waits on {predecessor_label}. This pile rests {rest_required_hr} h after its own T1 ends. {rest_status}', 10, null, 'dictated'),
  ('TRN-P5-T3', 'PREDECESSOR', '{"activity_codes": ["TRN-P5-T2"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TRN-P6-T0', 'PREDECESSOR', '{"activity_codes": ["YARD-FLIP"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TRN-P6-T1', 'PREDECESSOR', '{"activity_codes": ["TRN-P6-T0"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TRN-P6-T2', 'PREDECESSOR', '{"activity_codes": ["TRN-P6-T1"], "min_rest_hr": 8}', 'SAME_SCOPE_INSTANCE', 'Locked — waits on {predecessor_label}. This pile rests {rest_required_hr} h after its own T1 ends. {rest_status}', 10, null, 'dictated'),
  ('TRN-P6-T3', 'PREDECESSOR', '{"activity_codes": ["TRN-P6-T2"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('BNK-B1-FILL', 'PREDECESSOR', '{"activity_codes": ["TRN-P1-T3"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('BNK-B1-FILL', 'LAB_APPROVED', '{"checkpoint_map": "LAB_2026A"}', null, 'Locked — waiting for laboratory approval. {checkpoint}: {approved_count} of {required_count} approved. A recorded result is not an approved result.', 5, null, 'dictated'),
  ('BNK-B1-HOLD-1', 'PREDECESSOR', '{"activity_codes": ["BNK-B1-FILL"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('BNK-B1-RELOAD', 'PREDECESSOR', '{"activity_codes": ["BNK-B1-HOLD-1"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('BNK-B1-HOLD-2', 'PREDECESSOR', '{"activity_codes": ["BNK-B1-RELOAD"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('BNK-B1-RELOAD-2', 'PREDECESSOR', '{"activity_codes": ["BNK-B1-HOLD-2"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('BNK-B1-HOLD-3', 'PREDECESSOR', '{"activity_codes": ["BNK-B1-RELOAD-2"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('BNK-B1-HOLD-3', 'UNRESOLVED_DEPENDENCY', '{}', null, 'Locked — not yet defined by the SOP: {question} ({conflict_id})', 20, 'SOP-U04', 'unmapped'),
  ('BNK-B2-FILL', 'PREDECESSOR', '{"activity_codes": ["TRN-P3-T3"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('BNK-B2-FILL', 'LAB_APPROVED', '{"checkpoint_map": "LAB_2026A"}', null, 'Locked — waiting for laboratory approval. {checkpoint}: {approved_count} of {required_count} approved. A recorded result is not an approved result.', 5, null, 'dictated'),
  ('BNK-B2-HOLD-1', 'PREDECESSOR', '{"activity_codes": ["BNK-B2-FILL"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('BNK-B2-RELOAD', 'PREDECESSOR', '{"activity_codes": ["BNK-B2-HOLD-1"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('BNK-B2-HOLD-2', 'PREDECESSOR', '{"activity_codes": ["BNK-B2-RELOAD"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('BNK-B2-RELOAD-2', 'PREDECESSOR', '{"activity_codes": ["BNK-B2-HOLD-2"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('BNK-B2-HOLD-3', 'PREDECESSOR', '{"activity_codes": ["BNK-B2-RELOAD-2"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('BNK-B2-HOLD-3', 'UNRESOLVED_DEPENDENCY', '{}', null, 'Locked — not yet defined by the SOP: {question} ({conflict_id})', 20, 'SOP-U04', 'unmapped'),
  ('BNK-B3-FILL', 'PREDECESSOR', '{"activity_codes": ["TRN-P5-T3"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('BNK-B3-FILL', 'LAB_APPROVED', '{"checkpoint_map": "LAB_2026A"}', null, 'Locked — waiting for laboratory approval. {checkpoint}: {approved_count} of {required_count} approved. A recorded result is not an approved result.', 5, null, 'dictated'),
  ('BNK-B3-HOLD-1', 'PREDECESSOR', '{"activity_codes": ["BNK-B3-FILL"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('BNK-B3-RELOAD', 'PREDECESSOR', '{"activity_codes": ["BNK-B3-HOLD-1"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('BNK-B3-HOLD-2', 'PREDECESSOR', '{"activity_codes": ["BNK-B3-RELOAD"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('BNK-B3-RELOAD-2', 'PREDECESSOR', '{"activity_codes": ["BNK-B3-HOLD-2"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('BNK-B3-HOLD-3', 'PREDECESSOR', '{"activity_codes": ["BNK-B3-RELOAD-2"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('BNK-B3-HOLD-3', 'UNRESOLVED_DEPENDENCY', '{}', null, 'Locked — not yet defined by the SOP: {question} ({conflict_id})', 20, 'SOP-U04', 'unmapped'),
  ('TN-PREP', 'UNRESOLVED_DEPENDENCY', '{}', null, 'Locked — not yet defined by the SOP: {question} ({conflict_id})', 20, 'SOP-U05', 'unmapped'),
  ('BNK-B1-TUN-LOAD', 'PREDECESSOR', '{"activity_codes": ["BNK-B1-HOLD-3", "TN-PREP"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('BNK-B1-TUN-LOAD', 'LAB_APPROVED', '{"checkpoint_map": "LAB_2026A"}', null, 'Locked — waiting for laboratory approval. {checkpoint}: {approved_count} of {required_count} approved. A recorded result is not an approved result.', 5, null, 'dictated'),
  ('BNK-B2-TUN-LOAD', 'PREDECESSOR', '{"activity_codes": ["BNK-B2-HOLD-3", "TN-PREP", "BNK-B1-TUN-LOAD"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('BNK-B2-TUN-LOAD', 'LAB_APPROVED', '{"checkpoint_map": "LAB_2026A"}', null, 'Locked — waiting for laboratory approval. {checkpoint}: {approved_count} of {required_count} approved. A recorded result is not an approved result.', 5, null, 'dictated'),
  ('BNK-B3-TUN-LOAD', 'PREDECESSOR', '{"activity_codes": ["BNK-B3-HOLD-3", "TN-PREP", "BNK-B2-TUN-LOAD"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('BNK-B3-TUN-LOAD', 'LAB_APPROVED', '{"checkpoint_map": "LAB_2026A"}', null, 'Locked — waiting for laboratory approval. {checkpoint}: {approved_count} of {required_count} approved. A recorded result is not an approved result.', 5, null, 'dictated'),
  ('TN-LEVEL', 'UNRESOLVED_DEPENDENCY', '{}', null, 'Locked — not yet defined by the SOP: {question} ({conflict_id})', 20, 'SOP-U06', 'unmapped'),
  ('TN-HEAT', 'PREDECESSOR', '{"activity_codes": ["TN-LEVEL"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TN-PAST', 'PREDECESSOR', '{"activity_codes": ["TN-HEAT"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TN-COOL-1', 'PREDECESSOR', '{"activity_codes": ["TN-PAST"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TN-COND-2', 'PREDECESSOR', '{"activity_codes": ["TN-COOL-1"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TN-COOL-2', 'PREDECESSOR', '{"activity_codes": ["TN-COND-2"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TUN-DISCHARGE-1', 'PREDECESSOR', '{"activity_codes": ["TN-COOL-2"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TUN-DISCHARGE-2', 'PREDECESSOR', '{"activity_codes": ["TUN-DISCHARGE-1"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated'),
  ('TUN-DISCHARGE-3', 'PREDECESSOR', '{"activity_codes": ["TUN-DISCHARGE-2"]}', 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, null, 'dictated')
) v(code, kind, config, binding, tpl, ord, cid, conf)
join public.process_activity pa on pa.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026E' and version = 1) and pa.code = v.code;

-- 7 · lab checkpoint activities: LAB-2026A as modelled in PROCESS-2026C (copied; no lab entry gates)
insert into public.process_activity (process_definition_id, code, label_template, material_role, stream, rel_day, seq, scope,
  cardinality_rule, source_ref, responsible_role, lab_parameters, timing_confidence, is_hold, is_pre_h0, stage, tbd_marker,
  planning_unresolved)
select (select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), c.code, c.label_template, c.material_role, c.stream, 0, c.seq, c.scope, c.cardinality_rule, c.source_ref,
       c.responsible_role, c.lab_parameters, 'PARALLEL_NO_WALLCLOCK', false, c.is_pre_h0,
       (select lc.stage from public.lab_checkpoint_activity lca
          join public.lab_checkpoint lc on lc.code = lca.checkpoint_code and lc.checkpoint_map = lca.checkpoint_map
         where lca.process_activity_id = c.id limit 1),
       case when c.code like 'LAB-BNK-LOAD-%' or c.code like 'LAB-TUN-LOAD-%' then 'SOP-C14' end,
       true
from public.process_activity c
where c.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026C' and version = 1)
  and c.code like 'LAB-%';

-- 7b · reload-2 checkpoint activities (LAB-2026A LAB-RLD2-UNL / LAB-RLD2-RE, stage 1D-B), shaped as their reload-1 twins
insert into public.process_activity (process_definition_id, code, label_template, material_role, stream, rel_day, seq, scope,
  cardinality_rule, source_ref, responsible_role, lab_parameters, timing_confidence, is_hold, is_pre_h0, stage, planning_unresolved)
select (select id from public.process_definition where code = 'PROCESS-2026E' and version = 1), replace(c.code, 'LAB-RLD-', 'LAB-RLD2-'), replace(c.label_template, 'reload 1', 'reload 2'), c.material_role,
       c.stream, 0, c.seq + 100, c.scope, c.cardinality_rule, 'LAB-2026A · stage 1D-B (only where the process runs a second reload)',
       c.responsible_role, c.lab_parameters, 'PARALLEL_NO_WALLCLOCK', false, false, '1D-B', true
from public.process_activity c
where c.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026C' and version = 1)
  and (c.code like 'LAB-RLD-UNL-%' or c.code like 'LAB-RLD-RE-%');

-- 7c · lab evidence, copied from the same PROCESS-2026C checkpoint activities
insert into public.evidence_requirement (process_activity_id, key, label, media_kinds, min_count, max_count, is_required,
  gates_submission, capture_hint, ordering, capture_phase)
select n.id, e.key, e.label, e.media_kinds, e.min_count, e.max_count, e.is_required, e.gates_submission, e.capture_hint,
       e.ordering, e.capture_phase
from public.process_activity n
join public.process_activity c
  on c.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026C' and version = 1)
 and c.code = replace(n.code, 'LAB-RLD2-', 'LAB-RLD-')
join public.evidence_requirement e on e.process_activity_id = c.id
where n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026E' and version = 1) and n.code like 'LAB-%';

-- 7d · lab bindings: the PROCESS-2026C LAB-2026A bindings (same production codes), plus the explicit reload-2 bindings
insert into public.lab_checkpoint_activity (checkpoint_map, checkpoint_code, process_activity_id, gates_activity_code)
select lca.checkpoint_map, lca.checkpoint_code, n.id, lca.gates_activity_code
from public.lab_checkpoint_activity lca
join public.process_activity c on c.id = lca.process_activity_id
join public.process_activity n on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026E' and version = 1) and n.code = c.code
where c.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026C' and version = 1);

insert into public.lab_checkpoint_activity (checkpoint_map, checkpoint_code, process_activity_id, gates_activity_code)
select 'LAB_2026A', case when n.code like 'LAB-RLD2-UNL-%' then 'LAB-RLD2-UNL' else 'LAB-RLD2-RE' end, n.id,
       'BNK-B' || right(n.code, 1) || '-RELOAD-2'
from public.process_activity n
where n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026E' and version = 1) and n.code like 'LAB-RLD2-%';

-- 8 · exit gate: evidence completes the submission, for every activity that has evidence
insert into public.gate_rule (process_activity_id, phase, kind, config, blocked_reason_template, ordering, mapping_confidence)
select pa.id, 'exit', 'EVIDENCE_COMPLETE', '{}'::jsonb, 'Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}', 20, 'dictated'
from public.process_activity pa
where pa.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026E' and version = 1)
  and exists (select 1 from public.evidence_requirement e where e.process_activity_id = pa.id and e.gates_submission);

-- 9 · self-check: refuse to leave a definition that disagrees with the reviewed table
do $$
declare d uuid := (select id from public.process_definition where code = 'PROCESS-2026E' and version = 1); n int; bad text;
begin
  select count(*) into n from public.process_activity where process_definition_id = d and code not like 'LAB-%';
  if n <> 76 then raise exception '0083: expected 76 production activity rows, found %', n; end if;
  select count(*) into n from public.process_activity where process_definition_id = d and code like 'LAB-%';
  if n <> 47 then raise exception '0083: expected 47 lab checkpoint activity rows, found %', n; end if;
  select count(*) into n from public.gate_rule g join public.process_activity pa on pa.id = g.process_activity_id
   where pa.process_definition_id = d and g.kind = 'UNRESOLVED_DEPENDENCY';
  if n <> 6 then raise exception '0083: expected 6 UNRESOLVED_DEPENDENCY rules, found %', n; end if;
  select count(*) into n from public.gate_rule g join public.process_activity pa on pa.id = g.process_activity_id
   where pa.process_definition_id = d and g.kind = 'LAB_APPROVED';
  if n <> 8 then raise exception '0083: expected 8 LAB_APPROVED rules, found %', n; end if;
  select count(*) into n from public.gate_rule g join public.process_activity pa on pa.id = g.process_activity_id
   where pa.process_definition_id = d and g.kind in ('GM_APPROVAL');
  if n <> 0 then raise exception '0083: GM_APPROVAL must not be used'; end if;
  select string_agg(distinct x.code, ', ') into bad
    from public.gate_rule g join public.process_activity pa on pa.id = g.process_activity_id
    cross join lateral jsonb_array_elements_text(g.config->'activity_codes') x(code)
   where pa.process_definition_id = d and g.kind = 'PREDECESSOR'
     and not exists (select 1 from public.process_activity o where o.process_definition_id = d and o.code = x.code);
  if bad is not null then raise exception '0083: predecessor codes not in the definition: %', bad; end if;
  select string_agg(distinct lca.gates_activity_code, ', ') into bad
    from public.lab_checkpoint_activity lca join public.process_activity pa on pa.id = lca.process_activity_id
   where pa.process_definition_id = d and lca.gates_activity_code is not null
     and not exists (select 1 from public.process_activity o where o.process_definition_id = d and o.code = lca.gates_activity_code);
  if bad is not null then raise exception '0083: lab bindings name activities not in the definition: %', bad; end if;
  select count(*) into n from public.process_activity where process_definition_id = d and not planning_unresolved;
  if n <> 0 then raise exception '0083: % activities are not flagged planning_unresolved', n; end if;
end $$;

notify pgrst, 'reload schema';
