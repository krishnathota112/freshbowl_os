# DOMAIN MODEL

> ## ⚠ PARTIAL SUPERSESSION — 20 Aug 2026
>
> **`PROCESS_V2_FACTORY_CONFIRMED.md` is now the authoritative process definition.**
>
> | Section | Status |
> |---|---|
> | §1 Shape of a master batch, cardinalities, N:M pooling | **STILL VALID** — confirmed by the walkthrough |
> | §2 Entity catalogue | **STILL VALID**, extended by §8 below and by the three new model docs |
> | §3 Schedule token → stage mapping | **SUSPENDED** — see conflict **C-20** |
> | **§4 The 17 route activities (ROUTE-2026A)** | **SUPERSEDED** by `PROCESS-2026B`. Retained as the SOP process-control reference, **not** as the executable route. |
> | §5 Six-column data principle | **STILL VALID AND MANDATORY** |
> | §6 Naming and identity | **STILL VALID** |
> | §7 What the model does not do | **STILL VALID** |
>
> New sections **§8 Process engine** and **§9 Scope model** are appended at the end of this
> document. New companion docs: `RESOURCE_MOVEMENT_MODEL.md`, `MACHINE_UTILIZATION_MODEL.md`,
> `EVIDENCE_CONFIGURATION_MODEL.md`.

Labels used throughout: **[FACT]** cited to a source · **[INFER]** derived from sources ·
**[DECISION]** product decision · **[TBD]** requires confirmation.

---

## 1. The shape of a master batch

### 1.1 Cardinalities — established from real records, not assumed

| Relationship | Cardinality | Evidence |
|---|---|---|
| Master Batch → Individual Batch | 1..N, **N varies (3 or 4 observed)** | **[FACT]** S3a/b/c/d = 3; S3e/f = 4; S6a column headers show both `366 367 368` and `392 393 394 395` |
| Master Batch → Bunker Line | 1..N, **N varies (2 or 3 observed)** | **[FACT]** S3a/b = 2 bunkers; S3f = 3 bunkers; S7a shows 3–5 line rows per batch |
| Master Batch → Tunnel charge | 1..M | **[FACT]** S3a = 3 tunnels, S3f = 4 tunnels |
| Bunker Lines → Tunnel charges | **N:M, not 1:1** | **[FACT]** S3f: reload-2 bunkers `8,9&10` (3) feed tunnels `3, 1, 10, 9` (4). S3a: reload-2 bunkers `3&4` (2) feed tunnels `10, 8, 6` (3) |
| Individual Batch → Growing Room load | 1..P, **P ≥ M** | **[FACT]** S4b master batch `1,2,3` has 3 tunnel rows but 4 GR rows: GR batch `1`, `3`, `2`, and `3 (A)` — a half room. S2a header reads "No. of Growing Rooms Covered: 3 ½" |
| Growing Room load → Harvest break | 1..3 | **[FACT]** S4b columns ET / EU / EV = 1st / 2nd / 3rd break; some rows have 0 for 3rd break |
| Master Batch → Formulation | 1:1 | **[FACT]** S5a — one formulation block per master batch group |

**[DECISION] The schema must never hard-code 3 or 4 anywhere.** Every one of these is a
count discovered at Day-0 configuration, and the tunnel-loading step is an explicit
many-to-many allocation, not an implied pairing.

### 1.2 Where individual-batch identity is created

**[INFER — high confidence]** The individual batch number (391, 392, …) is bound to a
**tunnel charge**, not to a bunker line.

Evidence: in S3f, Section 3B is headed `Batch No/Tunnel No` with values `391/3`, `392/1`,
`393/10`, `394/9` — the batch number is only ever paired with a tunnel, never with a bunker.
Section 2 (bunker record) is headed by bunker numbers alone. Section 4 (compost-out QC) is
keyed by tunnel number.

Consequence for the model: **before tunnel loading, material belongs to the master batch and
to a bunker line. At tunnel loading, the pooled material is split into individual batches.**

**[TBD-1]** The lab workbook S4b instead keys all four rows of a master batch from the bunker
stage onward, i.e. it *does* treat bunker line 1 → tunnel 1 → room 1 as a single thread.
Confirm: is the bunker→tunnel correspondence real and simply pooled on the exceptional
batches, or is pooling always total? This changes whether Phase-1 lab results can be attributed
to individual batches or only to the master batch.

---

## 2. Entity catalogue

### 2.1 Reference / configuration

```
material
  id, code, name, category(straw|fibre|manure|mineral|additive),
  default_unit, is_nitrogen_source, is_mineral
  ─ [FACT] S4b row 5 + S5a: L Paddy, P Paddy, Bagasse (new/old),
    Wheat, Mustard (new/old), Chicken Manure, Gypsum, Ammonium Sulphate,
    Lime, Urea

material_spec           -- acceptance ranges for incoming raw material
  material_id, parameter, min, max, unit, source_ref
  ─ [FACT] S4a Table 1 (Paddy straw MC 12–13%, pH 7.0–7.3, Ash 12–17%,
    N 0.7–1.0, C:N 60–70; Bagasse MC 40–55%, pH 4.6–5.0, Ash 2–5%,
    N 0.4–0.5, C:N 97–98; Chicken Manure MC 16–20%, pH 7.5–8.0,
    Ash 25–33, N 2.7–3.5, C:N 11–15; Gypsum, Urea 46 N, AS 20.6 N)

vessel                  -- bunkers and tunnels
  id, kind(bunker|tunnel), number, capacity_mt, max_fill_height_m, status
  ─ [FACT] S7a shows bunkers 1–11 and tunnels 1–12 in use

growing_room
  id, number, capacity_mt, status
  ─ [FACT] S4b column EM: room numbers up to 60

equipment               -- turner, hopper, rotovator, JCB/loader, conveyor, probes
vehicle                 -- delivery + internal movement
personnel               -- links to auth user; shift; certifications
```

### 2.2 Process definition (the SOP, as data)

```
route                   -- a named process variant
  id, code, name, version, is_active, effective_from
  ─ [DECISION] Routes exist because S6a shows the activity vocabulary
    changed between months. Older sheets use tokens the current SOP does
    not ("Mustard wetting + B/L", "H1+ F2 + T0", "Bunker Rain Washing").
    Freeze the current vocabulary as ROUTE-2026A; keep others addable.

route_activity          -- one row per SOP stage
  route_id, seq, stage_code, name, phase, rel_day,
  scope(master|bunker_line|individual_batch|growing_room),
  golden_rule, requires_evidence, generates_lab_task,
  entry_gate_json, exit_gate_json
  ─ [FACT] stage_code set from S1a (17 stages, listed in §4 below)
  ─ [FACT] rel_day from S6a column trace (see §3)
  ─ [FACT] golden_rule verbatim from S1a

route_activity_field    -- THE SIX-COLUMN MODEL (see §5)
  route_activity_id, key, label, datatype, unit,
  sop_value, sop_min, sop_max,        -- column 1: what the SOP says
  day0_editable, day0_required,       -- column 2/3: planning + customisation
  operator_input(bool),               -- column 4: what the operator records
  remarks_default,                    -- column 5
  section, step_no, display_order     -- column 6: activity/section context

lab_spec                -- acceptance ranges per checkpoint
  checkpoint_code, parameter, min, max, unit, source_ref
  ─ [FACT] S4a Table 2, verbatim (see LAB_MODEL.md §3)

phase2_control_band     -- hour-banded tunnel control rules
  from_hr, to_hr, probe(tunnel_top|compost|plenum),
  band_min, band_max, verdict, action, expected_outcome
  ─ [FACT] S1c Phase-2 tables, verbatim
```

### 2.3 Planning

```
schedule_period         -- one monthly sheet
  id, name, from_date, to_date, status(draft|approved|superseded)

schedule_slot           -- one COLUMN of the grid = one planned master batch
  id, period_id, column_label,        -- e.g. "392 393 394 395"
  planned_batch_numbers[],            -- [392,393,394,395]
  planned_start_date, route_id, status(planned|instantiated|cancelled),
  master_batch_id NULL

schedule_slot_day       -- one CELL of the grid
  slot_id, calendar_date, activity_token, stage_code
  ─ [FACT] S6a. Token→stage mapping in §3.
```

**[DECISION]** The schedule is imported from S6a, not re-invented. The importer reads a month
sheet, treats each column as a slot and each non-empty cell as a planned activity day. Slots
are the *only* thing an admin can instantiate from — an admin never types a batch number.

### 2.4 Execution — the batch tree

```
master_batch
  id, slot_id, batch_group_label,          -- "391,392,393,394"
  start_date,                              -- [FACT] S3f "Date of Batch Start 26/03/26"
                                           --   = the Bagasse Pre-Wet day (Day −7)
  target_compost_mt, target_per_room_mt,   -- [FACT] S3f "200MT (50MT each room)"
  rooms_covered_declared,                  -- [FACT] S2a "3 ½"; store as decimal
  supervisor_id, compost_manager_id,       -- [FACT] S3f "Supervisor/In-charge: RAMARAO"
  weather_note,                            -- [FACT] S2b "Weather"
  formulation_id, route_id,
  raw_material_basis_json,                 -- [FACT] S3f "Bagasse new%:38 Paddy new%:53 Wheat%:9"
  status(draft|configuring|validated|active|in_tunnel|closed|cancelled),
  baseline_frozen_at, activated_by

formulation
  id, master_batch_id, cloned_from_id,
  computed_n_pct, computed_ash_pct, computed_cn_ratio,
  total_dry_mt, total_fresh_mt
  ─ [FACT] S5a computes all three per batch; S3f Section 1A stores the
    per-material rows and a Total row

formulation_line
  formulation_id, material_id, pct, dry_mt, fresh_mt,
  age_months, assay_ph, assay_moisture_pct, assay_n_pct, assay_ash_pct,
  source_region                            -- [FACT] S4b col C "punjab"|"local"
  ─ [FACT] S3f Section 1A columns exactly

material_lot            -- what physically arrived
  id, master_batch_id, material_id, supplier_name, vehicle_number,
  received_at, gross_mt, age_months, lab_sample_id
  ─ [FACT] supplier + vehicle captured in S8b stage_0A Step 1
    ("Supplier Name", "Vehicle Number") — retained, it is real traceability

bunker_line             -- a physical thread through Phase 0 / Phase 1
  id, master_batch_id, line_no,
  compost_qty_mt                           -- [FACT] S3f "Compost Qty (MT) 140"

bunker_occupancy        -- one row per (line, bunker stint)
  id, bunker_line_id, vessel_id, stint(stage0_fill|stage0_reload|
      p1_fill|p1_reload1|p1_reload2),
  loaded_at_date, loaded_at_time,          -- [FACT] S7a records DATE **and TIME**
  unloaded_at, start_fill_height_m,
  settled_height_4h_m, settled_height_8h_m,-- [FACT] S3f "Settled Height @ 4h / 8h: 2.6/2.1"
  time_to_reach_target_hr, holding_time_hr,
  ammonia_observation_hr, ammonia_smell(strong|mild|weak),
  spring_test(pass|fail)
  ─ [FACT] every field above appears verbatim in S3f Section 2

tunnel_load             -- THE POOLING EVENT
  id, master_batch_id, vessel_id(tunnel), individual_batch_id,
  source_bunker_occupancy_ids[],           -- N sources → 1 tunnel
  loaded_at_date, loaded_at_time,
  compost_qty_mt, fill_height_m,
  moisture_pct, ec
  ─ [FACT] S3f Section 3A: "Reloading Bunker No: 8,9&10 | Tunnel No: 3 |
    Moisture% 74.3 | EC 1.83 | Compost Qty 80 | Fill Height 1.95"

individual_batch
  id, master_batch_id, batch_no,           -- 391
  tunnel_load_id, status
  ─ [INFER] identity bound at tunnel loading (§1.2)

tunnel_run_stage        -- 6 stages per tunnel charge
  individual_batch_id, stage(levelling_conditioning1|heating_up|
      pasteurisation|cooling1|conditioning2|cooling2),
  target_temp_min, target_temp_max, target_duration_min_hr, target_duration_max_hr,
  time_to_reach_hr, time_held_hr,
  probe_min_c, probe_max_c
  ─ [FACT] S3f Section 3B: "Levelling + Conditioning-1 (18–20 hrs) | 46-49 |
    8+1 | 47.29-50.27" → to-reach 8 h + held 1 h, probes 47.29–50.27 °C

tunnel_hourly_log       -- the 4-hourly grid
  individual_batch_id, hour_offset, avg_temp_c, oa_pct, fan_pct
  ─ [FACT] S3f final table: 21 rows at 0,4,8…80 hrs × (Avg°C, OA, Fan)
    per tunnel. S2a blank template has the same 21-row grid.

compost_out_qc
  individual_batch_id, final_moisture_pct, n_pct, ph, ec,
  spring(pass|fail), colour(grey_brown|dark_chocolate),
  actinomycetes(weak|mild|strong), smell(sour|earthy)
  ─ [FACT] S3f Section 4 columns exactly

growing_room_load
  id, individual_batch_id, growing_room_id, gr_batch_label,  -- "3 (A)"
  loaded_at, spawn_date,
  ph, ec, moisture_pct, ash_pct, n_pct, cn_ratio
  ─ [FACT] S4b columns EL–ES

harvest_break
  growing_room_load_id, break_no(1|2|3), harvested_kg, harvested_on
  ─ [FACT] S4b columns ET/EU/EV; EW = room total; EX = total days
```

### 2.5 Activity execution — where the six columns live

```
batch_activity          -- an instance of a route_activity, for a real batch
  id, master_batch_id, route_activity_id,
  scope_ref,                  -- master | bunker_line_id | individual_batch_id
  planned_date,               -- from schedule_slot_day, frozen at activation
  state,                      -- see WORKFLOW_MODEL.md §2
  blocked_reason_code, blocked_reason_text, unblocks_at,
  started_at, submitted_at, submitted_by,
  released_at, released_by,
  supersedes_id               -- for repeat / redo cycles

batch_activity_value        -- one row per field, carrying ALL SIX COLUMNS
  batch_activity_id, field_key,
  sop_value, sop_min, sop_max,          -- 1  frozen copy of the SOP
  day0_value,                           -- 2  what admin planned for THIS batch
  customisation_allowed,                -- 3  may the operator deviate
  actual_value, actual_recorded_at, actual_recorded_by,  -- 4
  remarks,                              -- 5
  section, step_no,                     -- 6
  variance_flag(in_range|warn|out_of_range|not_applicable)
```

**[DECISION] `batch_activity_value` is append-only for `actual_value`.** A correction writes
a new row version with `supersedes`, so the original reading is never destroyed. This is the
same rule the lab uses for retests (LAB_MODEL.md §5), applied uniformly.

### 2.6 Quality, evidence, control

```
lab_sample, lab_test, lab_result, lab_result_version   -- see LAB_MODEL.md
evidence                -- photo/video/document
  id, storage_path, kind(ph_meter|moisture_meter|pile|bunker|tunnel|
      probe|spring_test|colour|other),
  batch_activity_id NULL, lab_result_id NULL, deviation_id NULL,
  captured_at, captured_by, device_hint, exif_json
deviation
  id, master_batch_id, scope_ref, source(operator|lab|system|supervisor),
  parameter, expected, observed, severity(minor|major|critical),
  raised_at, raised_by, state(open|action_pending|retest_pending|
      accepted_with_deviation|resolved|escalated)
corrective_action
  deviation_id, action_text, performed_by, performed_at, evidence_id,
  verification_lab_result_id
decision                -- every release/hold/return/approve/return-for-review
  id, master_batch_id, scope_ref, level(supervisor|gm),
  verdict, reason_text, decided_by, decided_at, package_snapshot_id
override_request        -- controlled override, supervisor → GM
  id, batch_activity_id, requested_by, reason, state, approved_by
audit_event             -- immutable log of every state transition
```

---

## 3. Schedule token → stage mapping

**[FACT]** Column trace from S6a sheet `May'26`, column 18 (`372 373 374`), whose
S3b record states "Date of Batch Start 11/03/26":

| Date | Token (S6a) | Rel day | Stage (S1a) |
|---|---|---|---|
| 10 Mar | `Wheat wetting` | D−8 | *(not in S1a — see TBD-2)* |
| 11 Mar | `Bagasse pre-wet F1 +H1` | **D−7** | **0A** Bagasse pre-wet & rest |
| 12 Mar | `F2 + B/L` | D−6 | **0B** 1st bunker filling & conditioning |
| 13–14 Mar | `Rest` | D−5, D−4 | 0B conditioning hold (48–60 h) |
| 15 Mar | `F1 + R/L` | D−3 | **0C** unload & reload → **0D** 2nd bunker |
| 16 Mar | `Rest` | D−2 | 0D conditioning hold (36–40 h) |
| 17 Mar | `Paddy soaking 1` | D−1 | **1C-A** paddy prep, soak/tilt 1 |
| 18 Mar | `PS-2, Mixing of minerals +Bagasse+H1` | **D0** | **1C-A** soak 2 → **1A** dry mineral mix → **1B** wet mixing |
| 19 Mar | `F1+F2 + PF-T0` | D1 | **1C-B** paddy + bagasse + mineral mixing |
| 20 Mar | `F3+T0` | D2 | **Phase-1A** turner pass T0 |
| 21 Mar | `Rest / T1` | D3 | **Phase-1A** turner pass T1 |
| 22 Mar | `T2 + B/L` | D4 | **Phase-1B** T2 → **Phase-1C** bunker filling 1 |
| 23 Mar | `B - R/L-1` | D5 | **Phase-1D-A** unload & reload 1 |
| 24 Mar | `B - R/L-2` | D6 | **Phase-1D-B** unload & reload 2 |
| 25 Mar | `Rest` | D7 | Phase-1D-B hold (40–44 h) |
| 26 Mar | `T/L` | **D8** | **Phase-2A** tunnel prep → **Phase-2B** tunnel filling |
| — | *(not on the grid)* | D8–D14 | **Phase-2C** tunnel process (~150 h) |
| — | *(not on the grid)* | ~D14 | **Phase-2D** tunnel unloading |
| 1–2 Apr | `GR-L` ×2 days | D14, D15 | growing room loading |

**This confirms the "8-day execution window": Day 0 (mixing) → Day 8 (tunnel loading).**
Verified identical on columns 16 (`366 367 368`, start 4 Mar… S3a says 5 Mar — see TBD-3)
and 24 (`392 393 394 395`).

**Token glossary [INFER — high confidence]**

| Token part | Meaning | Support |
|---|---|---|
| `F1`, `F2`, `F3` | Loader flipping pass 1 / 2 / 3 | S1a repeatedly: "LOADER FLIPPING – 2 times", "2 Flippings" |
| `H1`, `H2` | Hopper pass (with full water) 1 / 2 | S1a 0A: "BAGASSE WETTING — Hopper pass with full water"; S1a 1B: "WATER ADDITION (ALLOWED HERE ONLY) Hopper pass with full water" |
| `B/L` | Bunker Loading | S1a 0B, Phase-1C |
| `R/L` | Reload | S1a 0C, Phase-1D-A/B |
| `T0`, `T1`, `T2` | Turner pass 0 / 1 / 2 | S1a Phase-1A, 1B |
| `PF-T0` | Pre-fill turner pass T0 | S1a 1C-B "TURNER PASS (T0) with full water" |
| `PS-1/2/3` | Paddy soak 1 / 2 / 3 | S1a 1C-A "PADDY SOAKING & TILTING – 1", "TILTING – 2" |
| `T/L` | Tunnel Loading | S1a Phase-2B |
| `GR-L` | Growing Room Loading | S4b "GR Loading" |

**[TBD-2]** `Wheat wetting` and `Mustard wetting + B/L` appear in S6a but have no stage in
S1a. S1a's 0A covers bagasse only. Confirm whether wheat/mustard wetting is a separate
route activity, a variant of 0A, or a Day-0 option.

---

## 4. The 17 route activities (ROUTE-2026A)

**[FACT]** All targets, durations and triggers below are verbatim from S1a.

| # | Stage | Name | Scope | Rel day | Key SOP targets & triggers |
|---|---|---|---|---|---|
| 1 | 0A | Bagasse (old & new) pre-wet & rest | master | D−7 | Old bagasse pH correction with lime; dry mixing 2 flippings; hopper pass with full water; **target MC 68–69 %**; heap height **≤ 1.5 m**; rest **8–12 h**; final flipping + uniformity check |
| 2 | 0B | 1st bunker filling & conditioning | bunker_line | D−6 | Input MC 68–69 %; **fill height 2.6–2.7 m (max 2.8)**; conditioning **48–60 h**; temp rise **45–55 °C, max 58**; probes every 6 h; **unload trigger: temp ≥ 58 °C OR time ≥ 60 h** |
| 3 | 0C | Unloading & re-loading | bunker_line | D−3 | Input temp 45–58 °C; unload + loader flipping; **MC ≥ 68 % → proceed; MC < 67 % → controlled mist, ONLY ≤ 45 °C**; reload to 2nd bunker **fill height 2.2–2.4 m (max 2.5)**, target MC ~68–69 % |
| 4 | 0D | 2nd bunker re-filling & conditioning | bunker_line | D−3→D−2 | Conditioning **36–40 h**; temp **50–55 °C declining, max 58**; **unload trigger: temp ≥ 58 °C OR time ≥ 40 h** |
| 5 | 1A | Chicken manure + minerals dry mix | master | D0 | CM + gypsum + AS, **NO WATER**; rotovator to break all manure lumps; loader gentle folding; **temp < 45 °C**; output must have no smell, no heat, no moisture |
| 6 | 1B | Conditioned bagasse + dry nitrogen mixing | master | D0 | Pile conditioned bagasse, add dry N mix on top; loader mixing + flipping ×2; **water addition ALLOWED HERE ONLY** — hopper pass with full water; **target MC 73 %**; **temp < 45–50 °C** |
| 7 | 1C-A | Paddy preparation | master | D−1→D0 | Bales spread; bale breaking + **plastic/twine removal**; lagoon dilution **1 part inoculum : 5 parts fresh water, EC < 1.5, pH 7.0**; transfer to soak pit, no compaction; **soak+tilt-1 2–3 h**; transfer to platform + drain; flipping (break water bridges); retransfer, **tilting-2 1 h**; flipping & piling, heap **≤ 1.5 m**; **rest 2–3 h** |
| 8 | 1C-B | Paddy + bagasse + mineral mixing | master | D1 | Add bagasse mix on paddy heap **in small layers, no bulk dumping**; loader flipping ×2 **with no gap**, no paddy lumps; **turner pass T0 with full water, temp < 45–50 °C**; remix all piles, break + flip + heap |
| 9 | P1A | T0 & T1 continuous, no gap | master | D2–D3 | Input **MC 73–74 %**; **turner pass T0 — no water**; loader flipping 1; **turner pass T1 — no water**; **maintain 24 h gap T0→T2** |
| 10 | P1B | T2 composting | master | D4 | **Turner pass T2 with water, target MC 73–75 %**; break windrow to prevent compaction; ready to bunker fill, **NO WATER** |
| 11 | P1C | Bunker filling 1 | bunker_line | D4 | T2 compost **MC ≤ 75 %**; **bunker loading fill height 2.6–2.7 m, NO WATER**; thermophilic phase **68–72 °C for 26–28 h**; probes every 6 h; **reload trigger: temp > 73–74 °C OR duration > 30 h** |
| 12 | P1D-A | Unload & reload 1 | bunker_line | D5 | Unload trigger **temp > 72 °C, time 30 h** (bunker-1 unload noted at **> 74 °C / > 30 h**); reload **fill height 2.5–2.6 m, NO WATER**; hold **68–72 °C for 28–30 h**, probes every 6 h |
| 13 | P1D-B | Unload & reload 2 | bunker_line | D6–D7 | Reload **fill height 2.4–2.5 m** with **moisture correction to target 75 %**; hold **68–72 °C for 40–44 h**, probes every 6 h; **unload trigger: temp > 70 °C, time 44 h** |
| 14 | P2A | Tunnel preparation | vessel | D8 | Tunnel emptying; remove + high-pressure wash nets (no folds, dirt or stitch damage); clean tunnel, plenum, seal pit, AHU filter (no water stagnation, no blocked air passages, no sludge); net refixing with buffer at winch side (no twists/folds); probe inspection — clean, dry, hung correctly; preload inspection |
| 15 | P2B | Tunnel filling | individual_batch | D8 | Phase-1 unload trigger **temp > 72 °C, time 44 h**; **fill height 1.8–2.2 m**, uniform filling + packing; entry check **target MC 73–74 %**, no lumps, no water pooling, proper sealing + sensor placement |
| 16 | P2C | Tunnel process | individual_batch | D8–D14 | Levelling + conditioning-1 **46–49 °C / 18–20 h** → heating-up **59 °C / 8–12 h** → pasteurisation **58–60 °C / 8–10 h** → cooling-1 **60→48 °C / 12–14 h** → conditioning-2 *(see TBD-4)* → cooling-2 **/ 8–14 h** → ready for spawning |
| 17 | P2D | Tunnel unloading | individual_batch | ~D14 | Conditioning-2 for **80–90 h**, then prepare cooling-2; **cooling-2 15–20 h to 24 °C**; **unload trigger: MC 65–66 %, temp 22 °C, actinomycetes white patches, EC > 2.5** *(see TBD-5)* |

---

## 5. The six-column data principle, concretely

S2a's record and S1a's SOP together define five distinct kinds of number that the old
application collapsed into one editable input. They must stay separate all the way to the
database.

| Column | Name | Who writes it | When | Example (stage 0B, field `fill_height_m`) |
|---|---|---|---|---|
| 1 | **SOP / Standard** | nobody at runtime — copied from `route_activity_field` and frozen | activation | `2.6–2.7 m, max 2.8` |
| 2 | **Day-0 Fixed** | Admin | batch configuration | `2.7 m` for this batch |
| 3 | **Customisation** | Admin sets the *permission*; Supervisor may widen it | configuration / runtime | `allowed ± 0.1 m` |
| 4 | **Operator Actual** | Field Operator | execution | `2.9 m` |
| 5 | **Remarks** | Operator / Supervisor / Lab | any time | "settled to 2.6 at 4 h" |
| 6 | **Activity / Section context** | system | definition | Section 2 · Phase-1 Bunker Record · Loading · step 3 |

Rules:

- **[DECISION]** Column 4 never overwrites columns 1–3. The variance flag is computed
  server-side from (4) against (2) if present, else (1).
- **[DECISION]** Column 4 is append-only. A correction creates a new version.
- **[DECISION]** An out-of-range actual **does not block submission** — it *raises a
  deviation and blocks the downstream gate*. This preserves the old app's correct instinct
  ("never block the operator from recording reality", S8c) while adding the control the old
  app lacked.
- **[DECISION]** Column 1 is *frozen per batch at activation*. Changing the SOP later must not
  retroactively re-judge a completed batch.

Worked example from real data — S3f stage 0B, `temp_24h`:

| | |
|---|---|
| SOP (1) | 45–55 °C, max allowed 58 °C |
| Day-0 (2) | *(not customised)* |
| Actual (4) | **67.10 °C** (bunker line 2) |
| Variance | **out_of_range** — 9.1 °C above max |
| Remarks (5) | recorded as `Deviations (Y/N) = Y`, smell "Sweet" |
| What the system should have done | raise a MAJOR deviation at stage 0B, block the 0C gate pending supervisor decision, and carry that deviation into the Phase-2 decision package |
| What actually happened | recorded on paper; surfaced weeks later in the batch narrative as "Stage-0 overheating → early biological acceleration → risk of uneven compost zones" |

---

## 6. Naming and identity conventions

| Concept | Format | Source |
|---|---|---|
| Master batch label | comma-joined individual batch numbers, e.g. `391,392,393,394` | **[FACT]** S3f, S4b col B, S7a col 2 |
| Individual batch number | integer, factory-wide sequence, **resets** — S6a shows `396 397 398 399` followed by `001 002 003 004` | **[FACT]** S6a `May'26` header |
| Batch/tunnel reference | `<batch>/<tunnel>`, e.g. `391/3` | **[FACT]** S3f Section 3B |
| Growing room batch label | may carry a suffix for partial rooms: `3 (A)`, `5(A)` | **[FACT]** S4b col EL |

**[DECISION]** `master_batch.batch_group_label` is a display string derived from the child
individual batch numbers, never a primary key. Because numbering resets, the primary key is a
UUID and the human key is `(schedule_period, batch_no)`.

**[TBD-6]** Confirm the numbering reset rule — is `001` the start of a new financial year, a
new season, or a manual reset? This affects uniqueness constraints and cross-year comparison.

---

## 7. What the model deliberately does NOT do

- It does not assume a bunker line maps 1:1 to a tunnel (§1.1).
- It does not assume every master batch runs every activity — S7a shows Reload-2 **skipped
  entirely** for master batches 8, 9, 12, 13. `batch_activity` supports a `skipped` state with
  a required reason.
- It does not assume one bunker per stint — S7a master batch 12 shows one line reloading into
  **two** bunkers on the same day. `bunker_occupancy` is a list, not a field.
- It does not invent any acceptance threshold. Where S1a/S4a give no range, `sop_min`/`sop_max`
  are NULL and the field is recorded without a verdict.

---

# 8. THE PROCESS ENGINE — added 20 Aug 2026

**[DICTATED]** *"Build the process engine so process definitions are configurable rather than
hard-coded."*

This section defines how a process is represented as **data**. Adding, removing or reordering
an activity, changing a duration, adding an evidence requirement, or defining a new process
variant must never require a code change.

## 8.1 Three layers

```
LAYER 1  PROCESS DEFINITION      versioned, published, governed
         process_definition → process_activity → activity_field
                                               → evidence_requirement
                                               → lab_requirement
                                               → gate_rule
                                               → movement_rule
                                               → resource_requirement
              ▲
              │ Admin configures at Day-0, within what the definition permits
              │
LAYER 2  DAY-0 BASELINE          frozen at activation, immutable thereafter
         batch_process_config → batch_activity (materialised instances)
                              → batch_activity_value (six columns)
                              → batch_activity_evidence_req
                              → batch_movement_plan
                              → batch_resource_plan
              ▲
              │ Operators, lab and supervisors execute
              │
LAYER 3  EXECUTION               append-only
         activity state transitions · actual values · evidence · lab results
         · machine_usage · location_occupancy · material_movement · deviations
         · decisions · audit_event
```

Layer 1 is seed SQL. Layer 2 is generated. Layer 3 is written by Edge Functions only.

## 8.2 Process definition

```sql
process_definition
  id, code            -- 'PROCESS-2026B'
  name, version, status            -- draft | published | archived
  source_ref                       -- 'factory walkthrough 20 Aug 2026'
  anchor_day_label                 -- 'Day 0 = Bagasse Weighment'
  total_days                       -- 22
  published_by, published_at
  -- ROUTE-2026A (the 17-stage SOP route) is stored here with status='archived'
  -- and remains queryable as the process-control reference.

process_activity
  id, process_definition_id
  code                             -- 'BG-HOP-2'
  name, stream, rel_day, seq
  scope                            -- see §9
  cardinality_rule jsonb           -- see §8.3
  duration_target_min_hr, duration_target_max_hr
  golden_rule                      -- carried over from the SOP where one exists
  is_time_gate boolean             -- true for the rest days
  is_optional boolean              -- can be turned off at Day-0
  default_enabled boolean
  notes, source_ref                -- 'W §5.2' or 'S1a data2.xml'
```

## 8.3 Cardinality is a rule, never a number

**[DICTATED]** *"DO NOT hard-code 10 loads."* · *"Do not hard-code the number of piles."*

```json
// BG-WEIGH — instance count derived from a quantity and a capacity
{ "kind": "DERIVED_FROM_QUANTITY",
  "quantity_field": "bagasse_required_mt",
  "capacity_field": "expected_load_capacity_mt",
  "formula": "ceil(quantity / capacity)" }

// P1-BUNK-LOAD — one instance per configured bunker line
{ "kind": "PER_SCOPE_INSTANCE", "scope": "BUNKER_LINE" }

// TR-T1, TR-T2 — one instance per pile
{ "kind": "PER_SCOPE_INSTANCE", "scope": "PILE" }

// BG-YARD-UNLOAD — creates N transient locations
{ "kind": "CREATES_SCOPE_INSTANCES", "scope": "PILE",
  "count_field": "yard_pile_count", "default": 2 }

// YD-HOP-COMBINE — consumes N piles, produces 1
{ "kind": "MERGES_SCOPE_INSTANCES", "scope": "PILE",
  "from": "all_open", "to_count": 1, "new_label": "MIXED-PILE" }

// BG-HOP-1 — exactly one, master scope
{ "kind": "SINGLETON" }
```

The generator reads these at activation and materialises `batch_activity` rows. **No
instance count appears anywhere in application code.**

## 8.4 Gate rules

```sql
gate_rule
  id, process_activity_id
  phase                -- 'entry' | 'exit'
  kind                 -- PREDECESSOR | ELAPSED_TIME | TIME_WINDOW | SENSOR_THRESHOLD
                       -- | EITHER_OR | BOTH | LAB_RESULT_PASS | EVIDENCE_COMPLETE
                       -- | FIELD_IN_RANGE | MACHINE_STINT_CLOSED | MOVEMENT_VALID
                       -- | SUPERVISOR_RELEASE | GM_APPROVAL | MANUAL_OVERRIDE
  config jsonb
  predecessor_binding  -- 'ANY_INSTANCE' | 'ALL_INSTANCES' | 'SAME_SCOPE_INSTANCE'
  is_enabled           -- SOP limits with ambiguous mapping load DISABLED (C-28)
  mapping_confidence   -- 'dictated' | 'sop_direct' | 'sop_inferred' | 'unmapped'
  blocked_reason_template  -- 'Waiting — {label}: {remaining} remaining'
```

### `predecessor_binding` is the fix for T1 → T2

**[DICTATED §23]** *"Do not model this as T1 global complete → wait → T2 global start."*

```
TR-T2  entry gate:
  kind: PREDECESSOR
  predecessor: TR-T1
  predecessor_binding: SAME_SCOPE_INSTANCE      ← pile 2's T2 waits only on pile 2's T1
```

With `ALL_INSTANCES` this would be the barrier the dictation forbids. The binding is data, so
a future process that *does* need a barrier is a config change, not a rewrite.

## 8.5 Conditional paths

**[DICTATED §5]** The hopper-pass water decision *"must be based on actual measured condition"*
and the operator *"must not be forced to manually choose an arbitrary route without recording
why."*

```sql
activity_variant
  id, process_activity_id
  code                     -- 'WATER' | 'DRY'
  label                    -- 'Water Hopper Pass' | 'Dry Hopper Pass'
  selection_rule jsonb
  requires_reason_on_override boolean   -- true
```

```json
{ "input_field": "measured_moisture_pct",
  "compare_to": { "source": "lab_spec", "checkpoint": "BAGASSE_PREWET" },
  "if_below": "WATER", "if_within_or_above": "DRY",
  "state": "DISABLED_PENDING_C29" }
```

**[CONFLICT C-29]** The threshold is contested (C-01). Until resolved, the rule is
**disabled**: the operator sees the measured value and both candidate bands, chooses, and
gives a reason. Nothing is auto-selected on a number nobody has confirmed.

## 8.6 The activity record

**[DICTATED §36]** *"Do NOT make activity a simple activity_name + status."*

```sql
batch_activity
  id
  master_batch_id
  process_activity_id
  scope, scope_id                 -- §9
  stream, rel_day
  instance_no                     -- load 07 of 11; pile 2 of 3
  planned_start, planned_end      -- FROZEN at activation
  actual_start, actual_end
  duration_target_min, duration_target_max
  duration_actual_min             -- GENERATED
  variance_minutes                -- GENERATED: actual − target_mid
  responsible_role
  assigned_person_id
  source_location_id, destination_location_id
  status
  blocked_reason_code, blocked_reason_text, unblocks_at
  selected_variant_code, variant_reason
  supersedes_id
```

Target values, actual values, evidence requirements and lab requirements hang off it in their
own tables — `batch_activity_value` (six columns, §5), `batch_activity_evidence_req`,
`lab_test`, `machine_usage`, `material_movement`.

**[DICTATED §40]** *"The schedule should never be overwritten. The plan remains frozen. Actual
execution produces variance."* Hence `planned_*` and `actual_*` are separate columns and
`variance_minutes` is generated, never stored by hand.

---

# 9. SCOPE MODEL

**[DICTATED §36]** Scopes: `MASTER · BUNKER_LINE · PILE · PADDY_PILE · TUNNEL ·
INDIVIDUAL_BATCH`, plus `LOAD` which the weighment requires.

| Scope | Instance is | Created by | Count from |
|---|---|---|---|
| `MASTER` | the master batch | activation | always 1 |
| `LOAD` | one weighment load | `ceil(qty / capacity)` | derived |
| `BUNKER_LINE` | one physical thread through bunkers | Day-0 config | `bunker_line_count` |
| `PILE` | a yard pile of bagasse / mixed material | `BG-YARD-UNLOAD`, merged by `YD-HOP-COMBINE` | `yard_pile_count` |
| `PADDY_PILE` | a yard pile of soaked paddy | `PD-YARD-LOAD` | `paddy_pile_count` |
| `TUNNEL` | one tunnel charge | `TN-LOAD` | `tunnel_count` |
| `INDIVIDUAL_BATCH` | the numbered batch bound to a tunnel charge | `TN-LOAD` | = `tunnel_count` |

A `batch_activity` is always scoped. `TR-T1` at `PILE` scope with 3 piles produces three
instances, each with its own machine, operator, evidence, timing and variance — and each
gating only its own `TR-T2`.

**Scope transitions** are where the graph branches and merges, and each is an explicit
activity, never an implicit rule:

```
MASTER ──BG-WEIGH──► LOAD ×11 ──► MASTER
MASTER ──BG-BUNK-LOAD──► BUNKER_LINE ×3
BUNKER_LINE ──BG-YARD-UNLOAD──► PILE ×2
PILE ×2 ──YD-HOP-COMBINE──► PILE ×1  (MIXED-PILE)
PILE ×1 + PADDY_PILE ×2 ──T0/T1/T2──► PILE ×3
PILE ×3 ──P1-BUNK-LOAD──► BUNKER_LINE ×3
BUNKER_LINE ×3 ──TN-LOAD──► TUNNEL ×3 = INDIVIDUAL_BATCH ×3
```

**[TBD-19]** The pile count going into the turner stage (3) versus the pile count coming out
of `YD-HOP-COMBINE` (1 mixed + 2 paddy) needs confirming — see the conflict register.
