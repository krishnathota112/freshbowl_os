# LABORATORY MODEL

Labels: **[FACT]** cited · **[INFER]** derived · **[DECISION]** product decision · **[TBD]** confirm.

---

## 1. The lab is a subsystem, not a set of fields

**[FACT]** S4b is a 158-column spreadsheet that exists *because* the lab has its own life
cycle. **[FACT]** S4a is a 12-page manual with methods, reagents, calibration cadence and five
acceptance-range tables. Neither of these fits inside "a moisture input on an operator screen",
which is where the existing app put them (S8b/S8c).

Model:

```
SAMPLE ──► REQUESTED TEST ──► MEASUREMENT ──► RESULT ──► VALIDATION
                                                            │
                                              ┌─────────────┴─────────────┐
                                              ▼                           ▼
                                          ACCEPTED                  RETEST / CORRECTION
                                              │                           │
                                              ▼                     new RESULT (v2)
                                        FINAL RESULT                original kept, SUPERSEDED
```

---

## 2. Entities

```
lab_checkpoint          -- WHERE in the process a sample is taken
  code, name, stage_code, scope(master|bunker_line|individual_batch|
       growing_room|material_lot|water_source), auto_generated

lab_sample
  id, checkpoint_code, master_batch_id, scope_ref,
  vessel_id NULL, material_lot_id NULL,
  collected_at, collected_by, sample_ref_label,
  condition_note, evidence_id
  ─ [DECISION] the sample, not the reading, is the traceable object.
    S4a's methods all begin "Take X g of sample" — the sample is physical.

lab_test                -- one requested parameter on one sample
  id, sample_id, parameter_code, method_code,
  requested_at, requested_by(system|user), required_for_gate_id,
  state(requested|in_progress|reported|superseded|cancelled)

lab_result
  id, test_id, version,
  value_numeric, value_text, unit,
  target_min, target_max,              -- frozen copy of lab_spec at request time
  verdict(pass|fail|no_spec|invalid),
  measured_at, technician_id,
  instrument_id, calibration_status(valid|due|expired|unknown),
  calibrated_on, raw_readings_json,    -- e.g. titrate value, blank value, weights
  supersedes_result_id NULL, superseded_by_result_id NULL,
  accepted(bool), accepted_by, accepted_at,
  deviation_id NULL

lab_instrument
  id, name, kind(ph_meter|ec_meter|balance|muffle_furnace|micro_oven|
       kjeldahl_digestion|kjeldahl_distillation|hardness_kit|tds),
  serial, last_calibrated_on, calibration_interval_days, status

lab_spec                -- acceptance ranges, seeded from S4a (see §3)
  checkpoint_code, parameter_code, min, max, unit, source_ref, effective_from

lab_method              -- the SOP for the test itself, from S4a
  code, name, principle, apparatus[], reagents[], procedure_steps[],
  calculation_formula, calibration_note, source_ref
```

**[DECISION]** `lab_result.target_min/max` are **copied and frozen** at request time, like the
six-column SOP values. Changing a spec must never silently re-judge a historical result.

---

## 3. The checkpoint catalogue

**[FACT]** Derived directly from S4b's column headers (row 4/5), which is the definitive list
of every point at which this factory measures something.

| # | Checkpoint code | Scope | Parameters measured | S4b cols |
|---|---|---|---|---|
| 1 | `RAW_MATERIAL` | material_lot | pH, Moisture %, N %, Ash %, (Age months, source region) | R–BG |
| 2 | `BAGASSE_BL` | bunker_line | MC %, EC, pH | BO–BQ |
| 3 | `BAGASSE_RL` | bunker_line | MC %, EC, pH | BR–BT |
| 4 | `LAGOON_BEFORE_SOAK1` | master | pH, EC, TDS | BU–BW |
| 5 | `LAGOON_AFTER_SOAK1` | master | pH, EC, TDS | BX–BZ |
| 6 | `LAGOON_BEFORE_SOAK2` | master | pH, EC, TDS | CA–CC |
| 7 | `LAGOON_AFTER_SOAK2` | master | pH, EC, TDS | CD–CF |
| 8 | `LAGOON_BEFORE_SOAK3` | master | pH, EC, TDS | CG–CI |
| 9 | `LAGOON_AFTER_SOAK3` | master | pH, EC, TDS | CJ–CL |
| 10 | `F3` | master | MC | CM |
| 11 | `T0` | master | MC | CN |
| 12 | `BUNKER_FILL` | bunker_line | pH, EC, MC %, Ash, N, C:N | CP–CU |
| 13 | `BUNKER_RELOAD_1` | bunker_line | pH, EC, MC %, Ash, N, C:N | CZ–DE |
| 14 | `BUNKER_RELOAD_2` | bunker_line | pH, EC, MC %, Ash, N, C:N | DJ–DO |
| 15 | `TUNNEL_LOAD` | individual_batch | pH, EC, MC %, Ash, N, C:N | DT–DY |
| 16 | `COMPOST_OUT` | individual_batch | Final MC %, N %, pH, EC, + Spring, Colour, Actinomycetes, Smell | S3f §4 |
| 17 | `GR_LOAD` | growing_room_load | pH, EC, MC %, Ash, N %, C:N | EN–ES |
| 18 | `WATER_SOURCE` | standing | pH, EC, TDS, Total Hardness | S4a Table 3 |

**[FACT]** Also recorded alongside 12–15 but **operational, not lab**: fill height,
time-to-reach 68–72 °C, hold hours (S4b cols CV/CW/CX etc.). These live on
`bunker_occupancy` / `tunnel_load`, not on `lab_result`.

### 3.1 Acceptance ranges — compost phases

**[FACT]** Verbatim from S4a Table 2. This is the seed data for `lab_spec`.

| Phase checkpoint | Moisture % | pH | Ash % | N % | C:N |
|---|---|---|---|---|---|
| Soak pit water | — | 6.5–7.5 | — | — | — |
| Bagasse wetting | 75–78 | — | — | — | — |
| Bagasse bunker loading | 75–77 | — | — | — | — |
| Bagasse reloading | 75–76.5 | — | — | — | — |
| Turning/0 + Turning/1 | 72–74 | — | — | — | — |
| Turning/2 + Bunker loading | 74–77 | 8.1–8.4 | 16–20 | 1.3–1.6 | 25–32 |
| Reloading | 75–76.5 | 7.8–8.0 | 19–23 | 1.4–1.7 | 22–28 |
| Tunnel loading | 72.5–74 | 7.6–7.8 | 23–26 | 1.6–1.9 | 19–24 |
| Growing room loading | 65–68 | 7.4–7.7 | 25–29 | 1.8–2.2 | 16–20 |

⚠ **The "Bagasse wetting 75–78 %" row directly contradicts S1a's "Target Moisture 68–69 %"
for the same operation.** See SOURCE_CONFLICTS C-01. Until resolved, `lab_spec` is seeded
from S4a for *lab* verdicts and `route_activity_field` from S1a for *operator* targets, and
both are shown side by side rather than reconciled.

### 3.2 Acceptance ranges — raw materials

**[FACT]** S4a Table 1.

| Material | Moisture % | pH | Ash % | N % | C:N |
|---|---|---|---|---|---|
| Paddy straw | 12–13 | 7.0–7.3 | 12–17 | 0.7–1.0 | 60–70 |
| Mustard straw | 7.5–8 | — | 6–8 | 0.5–0.9 | 51–60 |
| Bagasse | 40–55 | 4.6–5.0 | 2–5 | 0.4–0.5 | 97–98 |
| Chicken Manure | 16–20 | 7.5–8.0 | 25–33 | 2.7–3.5 | 11–15 |
| Gypsum | 25–30 | 2.8–3.5 | 85–88 | — | — |
| Urea | — | — | — | 46 | — |
| Ammonium Sulphate | — | — | — | 20.6 | — |

**[FACT]** Real incoming assays sit close to these: S3f records Paddy MC 12.4 / pH 6.49 /
N 0.90 / Ash 15.4; Bagasse MC 56.2 / pH 5.63 / N 0.42 / Ash 1.50; CM MC 17.2 / pH 7.75 /
N 3.29 / Ash 29.7. Note paddy pH 6.49 is **below** the 7.0–7.3 band and bagasse pH 5.63 is
**above** 4.6–5.0 — the raw-material gate will flag real incoming lots, which is the point.

### 3.3 Acceptance ranges — water

**[FACT]** S4a Table 3. Nine water types, each with pH / EC / TDS / Total Hardness bands
(Bore well, Maintenance, Chilling line, Cooling tower, Soft, Boiler, Compost RO, Growing RO,
Canteen RO). TDS is always computed: **TDS = EC × 0.64** (S4a). Cooling-tower EC is quoted
as `4.2 – 6.5` against `700 – 900` for every other row — a unit inconsistency, logged as
SOURCE_CONFLICTS C-09.

### 3.4 Casing soil and spawn

**[FACT]** S4a Tables 4 & 5. Casing soil (mixing) pH 7.8–8.1 / MC 67–70 / EC 200–300;
casing soil (application) pH 7.6–7.8 / MC 65–68 / EC 170–250; Spawn MC 40–45 / pH 7.3–7.7.
**[DECISION]** Modelled as checkpoints but out of scope for the v2 demo, which stops at
growing-room loading.

---

## 4. Methods — the lab's own SOP

**[FACT]** All eight from S4a, stored as `lab_method` rows so a technician can open the method
from the task.

| Code | Name | Apparatus | Key procedure | Calculation | Calibration |
|---|---|---|---|---|---|
| `MOISTURE` | Moisture | beaker, micro oven, desiccator, balance | 100 g sample, micro oven **72 °C, 12–15 min**, weigh | `(initial − dry)` ⚠ formula incomplete in source — C-10 | — |
| `MOISTURE_SPAWN` | Moisture (spawn) | hot air oven | 50 g, **100 °C, 2 h** | as above | — |
| `PH` | pH | pH meter, beaker, glass rod | 10 g sample + 100 ml distilled water, mix, immerse probe | direct read | **daily**, 7.0 buffer, temperature set to ambient |
| `ASH` | Ash | crucible, muffle furnace, desiccator | 5 g, **600 °C, 4 h**, cool in desiccator 30 min, weigh | `(W3−W1)/W2 × 100` ⚠ garbled in source — C-10 | — |
| `NITROGEN` | Nitrogen (Kjeldahl) | block digestion + distillation system, burette | digest **350–420 °C** with 3 g catalyst + 10 ml H₂SO₄ → distil with NaOH into boric acid + mixed indicator → titrate with HCl | `14.01 × 0.1 × (titrate − blank) × 100 / sample weight` | — |
| `CN_RATIO` | C:N ratio | *(computed)* | — | `(100 − Ash) × 0.5 / N` | — |
| `EC` | Electro-conductivity | EC meter | 10 g + 100 ml distilled water | direct read | **weekly** |
| `TDS` | Total dissolved solids | *(computed)* | — | `EC × 0.64` | — |
| `HARDNESS` | Total hardness | hardness kit | per kit procedure | per kit | — |

**[DECISION]** `CN_RATIO` and `TDS` are **derived parameters**, computed server-side from Ash+N
and EC respectively. A technician never types them. This alone removes a class of arithmetic
error visible in S4b (where C:N is sometimes `26.0:1` text and sometimes `27.4` numeric).

**[DECISION]** Every result records `instrument_id` + `calibration_status`. S4a mandates daily
pH calibration and weekly EC calibration; a result taken on an out-of-calibration instrument
is recorded with `calibration_status = expired` and automatically flagged for supervisor review
rather than silently accepted.

**[FACT / C-10]** Three calculations in S4a are transcription-damaged: the moisture formula
omits `/ initial × 100`, the ash formula is garbled across two lines, and the Kjeldahl
procedure says "Add the **200 grams** of sample" where a block digestion takes ~0.2 g.
These need confirmation before the method text is shown to a technician as authoritative.

---

## 5. Retest and supersession

**[DECISION]** Results are **immutable and versioned**. A retest never edits; it creates
`version = n+1` with `supersedes_result_id` pointing back.

```
lab_result v1   MC 76.4 %   verdict FAIL (tunnel-load spec 72.5–74)   superseded_by → v2
                └── deviation D-22 raised, P2B gate blocked
                └── corrective_action: "extended cooling, re-sampled after 4 h"
lab_result v2   MC 73.8 %   verdict PASS   accepted_by supervisor   supersedes → v1
                └── D-22 → RESOLVED, gate re-evaluated, P2B → READY
```

Rules:

- **[DECISION]** v1 is never hidden. The batch timeline and every decision package show
  `MC 76.4 → 73.8 (retest)`, because "we measured it twice" is itself a material fact.
- **[DECISION]** A retest requires a **reason code**: `sampling_error`,
  `instrument_out_of_calibration`, `post_corrective_action`, `supervisor_request`,
  `result_implausible`.
- **[DECISION]** Only a supervisor or the technician who owns the sample may order a retest.
  An operator cannot make a failing number go away.
- **[DECISION]** More than 2 retests on the same test escalates automatically to the GM.

---

## 6. How lab tasks get created

**[DECISION]** A technician never creates work manually in the normal flow. Tasks are
generated by workflow events (WORKFLOW_MODEL.md §4.2).

| Trigger | Generates |
|---|---|
| `material_lot` received at 0A | `RAW_MATERIAL` sample per material — pH, MC, N, Ash |
| 0A submitted | `BAGASSE_BL` — MC, EC, pH |
| 0C submitted | `BAGASSE_RL` — MC, EC, pH |
| Each paddy soak/tilt step in 1C-A | `LAGOON_*` before/after — pH, EC, TDS |
| 1C-B `F3` step submitted | `F3` — MC |
| P1A T0 submitted | `T0` — MC |
| P1C submitted, per bunker line | `BUNKER_FILL` — pH, EC, MC, Ash, N (→ C:N) |
| P1D-A submitted, per bunker line | `BUNKER_RELOAD_1` — same panel |
| P1D-B submitted, per bunker line | `BUNKER_RELOAD_2` — same panel |
| P2B submitted, per tunnel | `TUNNEL_LOAD` — same panel |
| P2D submitted, per tunnel | `COMPOST_OUT` — MC, N, pH, EC + sensory panel |
| Growing-room loading | `GR_LOAD` — pH, EC, MC, Ash, N (→ C:N) |
| Scheduled (daily/weekly) | `WATER_SOURCE` for each of the 9 water types |

**[DECISION]** Ad-hoc samples are supported (supervisor or technician initiated) but are
flagged `requested_by = user` and are never allowed to satisfy a gate that an
auto-generated sample was created for.

---

## 7. Sensory and semi-quantitative results

**[FACT]** S3f Section 4 records four non-numeric quality attributes at compost-out:
`Spring (Pass/Fail)`, `Colour (Grey brown / Dark chocolate)`,
`Actinomycetes (visible — weak / mild / strong)`, `Smell (Sour / Earthy)`.
S3f Section 1B also records `Smell (sweet/sour)` at Stage-0 and
`Ammonia smell (strong/mild/weak)` at each bunker stint.

**[DECISION]** These are first-class `lab_result` rows with `value_text` and an enumerated
domain, **paired with mandatory photo evidence** for colour and actinomycetes. They are not
free-text notes. S3f's diagnosis uses "Actino: Strong / Mild mix" as evidence of uneven
biological strength — that comparison is only possible if the values are enumerated.

**[TBD-12]** Is there a defined *fail* value for any sensory attribute, or are they purely
descriptive inputs to human judgement? S1a P2D lists "Actinomycetes — white patches" as part
of the unload trigger, implying it is a gate. Confirm which sensory values block.

---

## 8. Lab technician mobile — Lab Queue

```
LAB QUEUE                                  3 overdue · 7 waiting

⚠ OVERDUE
  BUNKER_RELOAD_2 · MB 391-394 · Bunker 8
  pH · EC · MC · Ash · N          requested 6 h ago   [ START ]
  ↳ blocking: P2B tunnel loading

  TUNNEL_LOAD · MB 387-390 · Tunnel 4
  ...

TODAY
  RAW_MATERIAL · MB 396-399 · Bagasse lot BG-4471
  pH · MC · N · Ash                                   [ START ]

RETEST REQUIRED
  COMPOST_OUT · MB 384-386 · Tunnel 9
  MC v1 = 76.4 FAIL   reason: post_corrective_action  [ START ]
```

Entering a result:

```
BUNKER_RELOAD_2 · Bunker 8 · sample LS-2211
Collected 06:20 by R. Kumar          [ view sample photo ]

  MOISTURE          spec 75 – 76.5 %          [ 74.6 ]  ⚠ below
     method: 100 g, micro oven 72 °C, 12–15 min      [ open method ]
     instrument: Balance-02 · calibrated 18 Aug ✅

  pH                spec 7.8 – 8.0            [ 7.71 ]  ⚠ below
     instrument: pH-01 · calibrated TODAY ✅

  EC                spec —                    [ 2.11 ]  no spec
  ASH               spec 19 – 23 %            [ 21.1 ]  ✅
  NITROGEN          spec 1.4 – 1.7 %          [ 1.59 ]  ✅
     titrate [ 12.4 ]  blank [ 0.3 ]  sample wt [ 0.2 ] → 1.59 computed

  C:N               derived                     24.8    ✅  (spec 22–28)

  OVERALL: FAIL (2 of 5 out of spec)
  [ SUBMIT RESULT ]   [ FLAG SAMPLE INVALID ]
```

**[FACT]** Every number in that example is a real value from S4b row 7 / S3f, checked against
S4a Table 2 — including the two genuine out-of-spec values, which shows the spec set is tight
enough to bite on real production data.

---

## 9. What the lab model refuses to do

- **No invented thresholds.** EC has no band in S4a Table 2 at any compost checkpoint, so EC
  results carry `verdict = no_spec`. They are recorded, trended and shown, but never
  auto-failed. **[TBD-13]** S1a gives `EC < 1.5` for lagoon dilution water and `EC > 2.5` at
  tunnel unload — the only two EC bounds anywhere. Confirm whether compost EC has an intended
  operating band, since S3f's narrative explicitly reasons about it ("⚠ EC slightly high in
  some tunnels").
- **No silent unit conversion.** S4b stores TDS in three different magnitudes across rows
  (`3800`, `2.150`, `1.25`). The importer must reject rather than guess.
- **No result without a sample.** A number with no `lab_sample` is not traceable and is
  rejected at the database level.
