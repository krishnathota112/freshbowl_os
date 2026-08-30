# SOURCE CONFLICTS & TBD REGISTER

Nothing here has been silently resolved. Each entry states the conflict, why it matters, the
proposed interim interpretation, and whether confirmation is required before build.

Status legend: 🔴 **blocks build** · 🟠 **blocks correct behaviour, workaround exists** ·
🟡 **cosmetic / data-quality** · ✅ resolved.

---

## C-01 🔴 Stage-0 target moisture: 68–69 % or 75–78 %?

| Source | Statement |
|---|---|
| S1a stage 0A | `BAGASSE WETTING — Hopper pass with full water. **Target Moisture: 68-69 %**` |
| S1a stage 0B | `INPUT MATERIAL (Stage 0A) **Target Moisture: 68–69 %**` |
| S1a stage 0C | `RELOADING TO 2nd BUNKER … **Target Moisture: ~68–69 %**` |
| S8c `SOP_TARGETS` | `moistureBagassePreWet: { min: 68, max: 69 }` — agrees with S1a |
| **S4a Table 2** | `Bagasse wetting **75–78 %**` · `Bagasse bunker loading **75–77 %**` · `Bagasse reloading **75–76.5 %**` |
| S3f actuals | Stage-0B MC **72.2 %**, Stage-0D reload MC **68.2 %** |
| S3a actuals | Stage-0B MC **72.2 %**, Stage-0D reload MC **70.8 %** |
| S3b actuals | Stage-0A pre-wet **71.3 %**, 0B **72.9 %**, 0D **70.0 %** |

**Why it matters.** This is a ~7-point gap on the single most controlled variable in Stage-0,
and Stage-0 moisture is named in S3f's own diagnosis as an amplifier of batch failure. If the
system flags 72 % as out-of-range against 68–69 %, every batch generates a false deviation on
day −6. If it validates against 75–78 %, every batch generates a false *low* deviation.

**Observation.** Real actuals (68.2–72.9 %) sit between the two specs and satisfy neither.

**Proposed interim interpretation.** Two separate specs, not one:
- `route_activity_field.sop_min/max` for the *operator* target = S1a (68–69 %), because that
  is what the operator is instructed to hit at the hopper.
- `lab_spec` for the *lab verdict* = S4a (75–78 %), because that is the analytical acceptance
  band on the sample.
Both displayed side by side; no automatic deviation raised on this parameter until resolved.

**Confirmation required: YES — before Phase 3 (operator execution).**
Question for the factory: is 68–69 % the moisture measured *at the hopper on the day*, and
75–78 % the moisture measured *by the lab after conditioning*? If so both are right and the
model just needs two named measurement points.

---

## C-02 🟠 Phase-1 cadence: 3-day or 8-day?

| Source | Cadence |
|---|---|
| **S2b** "Phase 1 Record" | Day 0 Mixing · Day 1 Flipping & T0 Turning & Pile · Day 2 Pile breaking & flipping · **Day 3 T0, T1, T2 and Bunker Loading all on one day** · Day 6 RL-1 · Day 7 Resting · Day 8 B/R/L-2 · Day 9 Resting · Day 10 T/L |
| **S6a** (current sheets, verified on 3 columns) | Day 0 Mixing · Day 1 PF-T0 · Day 2 T0 · Day 3 T1 · Day 4 T2 + B/L · Day 5 R/L-1 · Day 6 R/L-2 · Day 7 Rest · **Day 8 T/L** |
| S1a Phase-1A | "maintain 24 hours gap (T0 – T2)" — implies T0, T1, T2 are **not** same-day |

**Why it matters.** It determines the entire activity plan skeleton and every `planned_date`.

**Proposed interim interpretation.** S6a is authoritative. It is the live planning artefact,
it is internally consistent across three independently traced columns and across months, its
day-8 tunnel-loading matches the stated "8-day execution window", and S1a's 24-hour T0→T2 gate
is impossible under S2b's same-day reading. **S2b is treated as a superseded template.**

**Confirmation required: YES, low urgency.** Confirm S2b is obsolete so it can be archived
rather than cited.

---

## C-03 🟠 Stage-0 length: 6 days or 7?

| Source | Stage-0 span |
|---|---|
| S2b "Stage 0 Operations" | Day −6 weighment · −5 wetting + bunker loading · −4 rest · −3 rest · −2 reloading · −1 rest → **6 days** |
| S6a column trace | D−7 bagasse pre-wet · D−6 F2 + B/L · D−5 rest · D−4 rest · D−3 F1 + R/L · D−2 rest · D−1 paddy soak → **7 days**, with weighment not shown as its own day |
| S3b `Date of Batch Start` | 11/03/26 = the `Bagasse pre-wet` cell = **D−7** |

**Why it matters.** Off-by-one on every Stage-0 planned date, and it changes what
"batch start date" means.

**Proposed interim interpretation.** Batch start = the bagasse pre-wet day = D−7 (S6a + S3b
agree). Weighment is a step *inside* 0A, not a separate day. **[FACT]** S8b's `stage_0A`
screen also puts weighment as Step 1 of 0A, supporting this.

**Confirmation required: YES, low urgency.**

---

## C-04 🟠 Phase-2C stage table has two transcription errors

**[FACT]** S1a diagram `data17.xml` (Phase-2C tunnel process) reads:

```
LEVELLING & CONDITIONING-1   46–49 °C    18–20 h
HEATING-UP                   59 °C        8–12 h
PASTEURIZATION               58–60 °C     8–10 h
COOLING DOWN - 1             60–48 °C    12–14 h
CONDITIONING - 2             58–60 °C    12–14 h    ← wrong
COOLING DOWN - 1             48 °C        8–14 h    ← duplicate label
```

Cross-check:

| Source | Conditioning-2 | Cooling-2 |
|---|---|---|
| S2a Section 3B | **48–45 °C, 75–80 h** | **24 °C, 8–14 h** |
| S1c | 51→45 over 48 h, then hold 45 for 40 h → **~88 h total** | bring to 24 °C in 8 h |
| S1a P2D | "after conditioning hrs **(80–90)** prepare for cooling down 2" · cooling-2 **15–20 h to 24 °C** | |
| S3f actuals | 101 / 96 / 93 / 103 h | 12+18 / 16+2 / 6+0 / 5+23 h |
| S3a actuals | 111 / 89 / 92 h | 14+4 / 7+10 / 9+7 h |

**Proposed interim interpretation.** Conditioning-2 = **48–45 °C, 75–90 h**; Cooling-2 =
**→ 24 °C, 8–20 h**. The `58–60 °C / 12–14 h` row in S1a is a copy-paste of the row above and
the second `COOLING DOWN - 1` is a mislabelled Cooling-2. Both flagged in the route seed data.

**Confirmation required: YES — the diagram should be corrected at source.**

---

## C-05 🟠 Conditioning-2 duration: spec 75–80 h, reality 89–111 h

**[FACT]** Every single tunnel in every batch record exceeds the upper bound:

| Batch | Conditioning-2 hours |
|---|---|
| 366–368 | 111 · 89 · 92 |
| 372–374 | 93 · 90 · 105 |
| 391–394 | 101 · 96 · 93 · 103 |

S1a P2D's own note says 80–90 h. S3f's narrative calls 101 h and 103 h "**over-conditioning**".

**Why it matters.** If the band is 75–80 h, the system raises a deviation on 100 % of tunnels
and the signal is worthless. If the band is 80–90 h, S3f's over-conditioning call is
reproducible and useful.

**Proposed interim interpretation.** Target band **80–90 h**, warning above 95 h, deviation
above 100 h. Flagged as an assumption in the route seed.

**Confirmation required: YES — before Phase 6 (GM management).**

---

## C-06 🟠 Starting nitrogen: 1.75 %, 1.4–1.6 %, or 1.25–1.70 %?

| Source | Statement |
|---|---|
| S1c note | "Starting N content of compost should be **1.75 %** before composting" |
| S1c monitoring table | "N content **1.4 % to 1.6 %** — Optimum. Intervention not required" |
| S5a computed, batches 267–323 | **1.25 – 1.70 %**, most 1.43–1.53 |
| S4a Table 2, Turning/2 + Bunker loading | **1.3–1.6 %** |

**Proposed interim interpretation.** Formulation validation uses the S5a historical band
(informational only, no hard gate). Lab verdicts use S4a Table 2 per checkpoint. The 1.75 %
figure is not used until confirmed.

**Confirmation required: YES, low urgency.**

---

## C-07 🟠 Phase-1 end pH: 7.8–8.2 or 8.2–8.5?

**[FACT]** Both statements are in S1c, ~2 pages apart:
- Monitoring table: "Optimum Ph – **7.8 to 8.2**" (repeated twice)
- Characteristics-after-Phase-1 note: "pH value should be around **8.2 - 8.5**"

S4a Table 2 gives Turning/2 + Bunker loading **8.1–8.4** and Reloading **7.8–8.0** — i.e. pH
*falls* through Phase-1, which reconciles the two if they refer to different moments.

**Proposed interim interpretation.** Use S4a Table 2's per-checkpoint values; treat S1c's two
figures as end-of-T2 (8.2–8.5) and end-of-reload (7.8–8.2) respectively.

**Confirmation required: YES, low urgency.**

---

## C-08 🟡 Data-entry transposition in S3b

**[FACT]** `Batch No 372,373,374.docx` Section 1A:

| Material | Moisture % as recorded | S4a Table 1 expected |
|---|---|---|
| Bagasse new | **12.5** | 40–55 |
| Wheat straw | **56.8** | ~12 (paddy/wheat class) |

The two values are transposed. Also `Bagasse new N% 0.70 / Ash 10.3` vs `Wheat 0.35 / 2.2`,
which are likewise swapped relative to S4a Table 1 (bagasse N 0.4–0.5, ash 2–5).

**Why it matters.** This is exactly the error class a range check at entry prevents, and it is
the argument for validating raw-material assays against S4a Table 1 at Day-0 (BATCH_CREATION_SPEC §5.3).

**Confirmation required: no — but the historical record should be corrected on import.**

---

## C-09 🟡 Cooling-tower water EC unit inconsistency

**[FACT]** S4a Table 3: every water type gives EC in the 50–900 range except
`Cooling tower water — EC 4.2 – 6.5`. Either the unit differs (mS/cm vs µS/cm) or a decimal
is misplaced. **Interim:** import as-is, flag as `unit_uncertain`, exclude from auto-verdict.

---

## C-10 🟡 Three damaged calculations in the lab manual

**[FACT]** S4a:

| Test | As written | Almost certainly |
|---|---|---|
| Moisture | `Moisture = [(Initial weight – dry weight)]` | `(initial − dry) / initial × 100` |
| Ash | `W3-W1 W2 x100` split across lines | `(W3 − W1) / W2 × 100` |
| Nitrogen digestion | "Add the **200 grams** of sample and 10 ml of Sulphuric acid" | ~0.2 g — 200 g into a digestion tube with 10 ml acid is not physically possible |

**Why it matters.** The method text is shown to technicians in-app as authoritative. Shipping
a known-wrong procedure is worse than shipping none.

**Confirmation required: YES — before Phase 4 (lab workflow).**

---

## C-11 🟡 "No. of Rooms Covered = 4" on a 3-batch, 3-tunnel record

**[FACT]** S3a (`Batch No 366,367,368`) Section 0 says `No. of Rooms Covered: 4`, but the
record contains 3 individual batches, 3 tunnel allocations (10, 8, 6) and 3 compost-out QC
rows.

Related: S2a's blank template says `3 ½`, and S4b shows a 4th growing-room row labelled
`3 (A)` with no bunker or tunnel of its own.

**Interim interpretation.** Rooms are a *separate count* from individual batches, can be
fractional, and a room may be fed from tunnels belonging to other rooms. Modelled as
`growing_room_load` with its own cardinality (DOMAIN_MODEL §1.1). Not treated as an error.

**Confirmation required: YES — what is a "½ room"?** Half the beds? A room shared between two
master batches? This affects yield attribution.

---

## C-12 🟠 Section headers in batch records are stale

**[FACT]**
- S3f Section 2 header: `(3 batches loading into 3 bunkers)` — correct
- S3f Section 3A header: `Tunnel Allocation (**2 bunkers** filled in **3 tunnels**)` — but the
  table below lists reload-2 bunkers `8,9&10` (three) feeding **four** tunnels
- S3a Section 2 header: `(3 batches loading into 2 bunkers)` with 2 bunkers listed — correct
- S3a Section 3A header: `(2 bunkers filled in 3 tunnels)` — correct
- S2a blank template Section 3A: `(3 bunkers filled in 3 tunnels)`

**Interim.** Headers are copy-pasted boilerplate and are **not** used as data. Structure is
read from the table rows only. This is itself an argument for the rebuild: the header and the
table can disagree on paper, but not in a schema.

---

## C-13 🟠 Existing app mislabels two Phase-1 stages

**[FACT]** S8e `STAGE_LABELS`:

| Stage id | App label | S1a actual |
|---|---|---|
| `phase_1B` | "Bunker Loading" | **T2 Composting** |
| `phase_1C` | "Bunker Conditioning" | **Bunker Filling 1** |
| `stage_1CB` | "Paddy Soaking" | **Paddy + Bagasse + Mineral Mixing** (soaking is 1C-A) |

**Interim.** S1a wins. Noted because the old app's labels appear on its screens and could be
mistaken for domain vocabulary during the rebuild.

---

## C-14 🟠 Two flow-diagram revisions with different stage decomposition

| S1b (v1) | S1a (v2, current) |
|---|---|
| `0C + 0D + moisture correction (one glance)` | 0C and 0D separate |
| `Phase-1: T0` and `Phase-1: T1` as two diagrams | `Phase-1A: T0 & T1 continuous no gap` as one |
| `Phase-1 Bunker Unload & Reload` as one | `Phase-1D-A` and `Phase-1D-B` separate |
| `Phase-2 Overview` as one | `Phase-2A / 2B / 2C / 2D` |
| 0A titled "Bagasse **+ Mustard** mixing and pre-wetting" | 0A titled "Bagasse (old & new) pre-wet & rest" |

**Interim.** S1a is authoritative — it matches the 17-stage set the existing app implements
(S8c) and is the finer decomposition. S1b is retained only as evidence that **mustard was once
part of stage 0A**, which bears on TBD-2.

---

## C-15 🟠 Tunnel unload trigger: EC > 2.5 vs recorded EC 1.69–2.16

**[FACT]** S1a P2D unloading trigger: `Target EC > 2.5`.
**[FACT]** S3f compost-out EC: 1.89, 1.94, 2.14, 2.16. S3a: 1.95, 1.86, 1.85. S3b: 1.74, 1.74, 1.69.

Not one tunnel in any record reaches 2.5. S3f's narrative separately calls 2.14–2.16 "⚠ EC
slightly high", which reads as an *upper* concern, not a target to reach.

**Why it matters.** If EC > 2.5 is a gate, no batch would ever unload. Either the direction is
inverted (should be `EC < 2.5`), or it is a different EC measurement, or it is aspirational.

**Interim.** Recording-only. **No EC gate at tunnel unload.**

**Confirmation required: YES — before Phase 4.**

---

## C-16 🟡 Tunnel unload target moisture: 65–66 % vs 65–68 % vs recorded 66.5–69 %

S1a P2D: `Target Moisture 65-66%`. S4a Table 2 (GR loading): `65–68`.
S3f actuals: 66.5, 67, 68, 68.6. S3a: 66.8, 68.2, 69.

**Interim.** Use S4a's 65–68 % for the verdict; show S1a's 65–66 % as the operational aim.
Note S3a's 69 % would fail both.

---

## C-17 🟠 Tunnel unload temperature: 22 °C or 24 °C?

**[FACT]** S1a P2D lists both in the same diagram: unloading trigger `Target temperature 22 °C`
and cooling-down-2 `Target temperature 24 °C`. S2a Section 3B: `Cooling-2 … 24 °C`.
S1c: "24–26 — no intervention required; not more than 28 — not ready for transfer".
S3f actual probe ranges: 21.15–26.26.

**Interim.** Cooling-2 target **24 °C**, acceptable **22–26 °C**, block above 28 °C (S1c is
explicit that > 28 means "compost not ready for transfer").

---

## C-18 🟡 Schedule vocabulary is not stable across months

**[FACT]** S6a older sheets contain tokens absent from the current SOP:
`Mustard wetting + B/L`, `BAG + MUSTARD (H1&H2)-R/L`, `Dry Mixing`, `H1 + Flipping (12Hrs)`,
`PS(8pm) + Mixing of all materials`, `Mixing all materials + Bag + Must + F1 + H1 + F2 + H2 +
Paddy mixing, F1, F2`, `Bunker Rain Washing (paddy)`, `Paddy leaching`, `T1 + B/L`, `F1+T0+T1`,
`Rest (or) R/L`, `PS- 3`.

Several sheets also contain **numeric pairs in activity cells** (`19,33`, `45,05`, `72,8,4`) —
almost certainly bunker or tunnel numbers pasted into the wrong column.

**Interim.** Only the current vocabulary (17 tokens) is mapped to ROUTE-2026A. The importer
**rejects** unmapped tokens into a review queue rather than guessing. Historical months import
as reference data only, not as executable routes.

---

## OPEN TBDs (no conflict, information missing)

| ID | Question | Blocks |
|---|---|---|
| **TBD-1** | Is the bunker-line → tunnel correspondence real (with pooling as the exception), or is pooling always total? | Whether Phase-1 lab results attribute to individual batches. Phase 2 (data model) |
| **TBD-2** | Are `Wheat wetting` / `Mustard wetting` separate route activities, a variant of 0A, or a Day-0 option? S1b's 0A title included mustard; S1a's does not. | Phase 2 |
| **TBD-3** | S3a says batch start 5/3/26; S6a column 16 shows the first activity on 4/3/26. Which is the true D−7? | Phase 2, low |
| **TBD-4** | Conditioning-2 true target band — see C-04/C-05 | Phase 6 |
| **TBD-5** | Which of the four P2D unload conditions are gates and which are observations? | Phase 4 |
| **TBD-6** | Batch numbering resets (`399 → 001`). Financial year? Season? Manual? | Phase 2 (uniqueness constraints) |
| **TBD-7** | Which moisture spec applies at 0A — see C-01 | Phase 3 |
| **TBD-8** | Tunnel probe data: manual entry every 4 h, or ingested from the controller? S3f records "data not available due to communication issue", implying an automated feed exists. | Phase 5/6 — changes Phase-2C from a form to a pipeline |
| **TBD-9** | Is Compost Manager a distinct role from Supervisor? | Phase 1 (roles) |
| **TBD-10** | Shift boundaries. S2b has a Day/Night column; S7a shows loading times across all 24 h. | Phase 3 (task assignment) |
| **TBD-11** | Does a Manager role exist at this factory today, or does Admin/Supervisor allocate resources? | Phase 1 |
| **TBD-12** | Do any sensory values (spring, colour, actinomycetes, smell) act as gates? | Phase 4 |
| **TBD-13** | Is there an intended operating band for compost EC? S3f reasons about it but no source gives one. | Phase 4 |
| **TBD-14** | Ammonia measurement — S1c specifies 800–1000 ppm at end of Phase-1 and "< 10 ppm" before spawning, but ammonia appears nowhere in S4b. Is it measured? With what? | Phase 4 |
| **TBD-15** | Is the existing Supabase project (`omsxtifyzlldaxkeqerx`) to be reused or replaced? It contains the old 4-account seed and a documented `auth.users` NULL bug. | Phase 1 |
| **TBD-16** | Who owns the harvest data (S4b cols ET–EY)? Is growing-room/harvest entry in scope for MushroomOS, or does it come from another system? | Phase 7 |
| **TBD-17** | Historical migration: import all ~230 master batches from S4b/S5a/S7a as read-only history, or start clean? | Phase 8 |

---
---

# PART 2 — CONFLICTS INTRODUCED BY THE FACTORY-CONFIRMED WALKTHROUGH

Added 20 Aug 2026 after the operational walkthrough now recorded in
`PROCESS_V2_FACTORY_CONFIRMED.md` (process definition `PROCESS-2026B`).

**Standing instruction from the client: do not silently reconcile any of these.** The SOP
documents remain the reference for process-control limits; the walkthrough is the current
demo operational flow. Where they disagree, both are carried and the difference is logged here.

Source labels in this part: **W** = the factory walkthrough · S1a/S1c/S2a/S4a/S6a/S7a = the
original documents per `SOURCE_INVENTORY.md`.

---

## C-19 🔴 The day-numbering base has moved

| Source | Day 0 is | Tunnel loading is | Process length |
|---|---|---|---|
| **W** | **Bagasse weighment** | **Day 15** | **Day 0 → Day 22** |
| S6a + S1a (derived) | Mixing of minerals + bagasse | **Day 8** | D−8 → D+15, then harvest |

The two schemes are not offsets of one another. In the old trace, bagasse pre-wet is D−7 and
mixing is D0, giving 7 pre-days. In the walkthrough, weighment is D0, hopper and bunker are
D1, and the manure/mineral mix — the old "Day 0" — is **Day 7**.

**Why it matters.** Every planned date, every `rel_day` in the route seed, and the whole
monthly-schedule import mapping depend on this. It also means the "8-day execution window"
from the earlier plan does not exist in the new process.

**Interim.** `PROCESS-2026B` uses the walkthrough's numbering exclusively. The old numbering
survives only inside the archived 17-stage route definition.

**Confirmation required: YES — this is the top item.** Specifically: does the monthly schedule
sheet still describe this process, and if so which schedule cell is Day 0?

---

## C-20 🔴 The monthly schedule may no longer map to the process

S6a's grid is ~19 days per master batch with `T/L` at D+8 and `GR-L` two days later, and its
17 tokens map cleanly onto the 17-stage SOP. The walkthrough describes a 23-day process with
tunnel loading on Day 15 and no growing-room step in scope.

A batch cannot be both 19 days ending in room loading and 23 days ending in tunnel unloading.

**Why it matters.** `BATCH_CREATION_SPEC.md` rests on the premise that the schedule is
upstream and Admin never invents a batch. If the schedule describes a different process, that
inheritance is wrong at the root.

**Interim.** The slot still supplies **identity** — batch numbers, start date, route — which
is safe. It no longer supplies **per-activity planned dates**; those are generated from the
`PROCESS-2026B` definition anchored on the slot's start date.

**Confirmation required: YES — before Phase 2.** Is there a newer schedule sheet matching the
23-day process?

---

## C-21 🟠 Two hopper passes on Day 1, not one

| | |
|---|---|
| **W** | Day 1 has **`BG-HOP-1` (with water)** then **`BG-HOP-2` (water conditional on measured moisture)** |
| S1a stage 0A | a single "BAGASSE WETTING — Hopper pass with full water" |

**Interim.** Two passes, per the walkthrough. The conditional water flag on pass 2 is a new
capability the SOP does not describe at all.

---

## C-22 🟠 Stage-0 bunker structure: one reload, not two conditionings

| | |
|---|---|
| **W** | Bunker load D1 → rest D2–D3 → unload + hopper + reload D4 → sits until the D7 yard unload |
| S1a | **0B** 1st bunker filling (48–60 h) → **0C** unload & reload → **0D** 2nd bunker conditioning (36–40 h), each with its own unload trigger |

Structurally similar, but the walkthrough gives no conditioning duration, no temperature band
and no unload trigger — the SOP's `temp ≥ 58 °C OR time ≥ 60 h` and `temp ≥ 58 °C OR time ≥
40 h` have no counterpart.

**Interim.** Activity structure from **W**; the SOP triggers carried as **configurable gate
content** on `BG-REST-1`, defaulted OFF pending TBD-21.

---

## C-23 🔴 Paddy soak durations: 8–10 hours vs 2–3 hours

| | |
|---|---|
| **W** | Soak 1, 2 and 3 each **8–10 h**, then rest **14–16 h**. Paddy stored **in a bunker** between soaks. |
| S1a stage 1C-A | "PADDY SOAKING & TILTING – 1, **Duration 2-3 hours**" · "TILTING – 2, **Duration 1 hour**" · "RESTING PERIOD **2-3 hours**", material on the platform and in the soak pit |

A 3–4× difference on every soak, plus a storage location the SOP does not mention.

**Why it matters.** It turns the paddy stream from a half-day into a three-day activity, and
it consumes a bunker for that whole period — which changes bunker availability for every
concurrent batch.

**Interim.** Walkthrough durations. SOP durations archived.

**Confirmation required: YES — before Phase 3.**

---

## C-24 🟠 Paddy occupies a bunker

**W** states paddy is loaded into a bunker between soaks and requires the bunker ID as a
mandatory field. No SOP document, batch record or movement log records paddy in a bunker —
S7a's bunker columns are compost-only.

**Why it matters.** Bunker exclusivity, conflict detection and the Manager's capacity view all
change if paddy holds a bunker for ~3 days per batch.

**Interim.** Modelled in `RESOURCE_MOVEMENT_MODEL.md §2`. See TBD-28 for how many and how long.

---

## C-25 🔴 One Phase-1 reload, or two?

| | |
|---|---|
| **W** | Bunker load D8–9 → rest D10–11 → **reload D12** → rest D13–14 → tunnel load D15. **One reload.** |
| S1a | **P1D-A** unload & reload 1 (hold 28–30 h) **and** **P1D-B** unload & reload 2 (hold 40–44 h) |
| S7a | Reload-1 and Reload-2 columns, both populated on most batches |
| S3f | Reload-1 and Reload-2 both recorded, with separate bunkers, heights and hold times |

Historical evidence is strongly for two. The walkthrough describes one.

**Why it matters.** It is a whole stage — 3 bunker occupancies, 3 lab samples, 3 activity
instances and 2 days of timeline.

**Interim.** `PROCESS-2026B` has **one** reload, as dictated. A `reload_2_included` process
option exists, defaulted OFF.

**Confirmation required: YES — before Phase 2.**

---

## C-26 🟠 Tunnel loading day

| | |
|---|---|
| **W** | Day 15, 3 tunnels, 6–8 h each |
| S6a trace | D+8 |
| S3a/S3b | 3 tunnels · S3e/S3f | 4 tunnels |

Tunnel count is already modelled as variable, so only the **day** is a conflict — C-19
restated. Logged separately because the tunnel date drives growing-room planning downstream.

---

## C-27 🟠 Days 16–21 carry no process content in the walkthrough

**W** calls Days 16–21 "rest / process hold" with "the appropriate configured
monitoring/checkpoints" but names none.

S1a P2C and S1c specify six named stages with temperature bands and durations — levelling and
conditioning-1 46–49 °C for 18–20 h, heating-up 59 °C for 8–12 h, pasteurisation 58–60 °C for
8–10 h, cooling-1 60→48 °C for 12–14 h, conditioning-2, cooling-2 — plus seven hour-banded
control rules with explicit corrective actions.

**Why it matters.** Pasteurisation is the food-safety-equivalent step. Dropping it because the
walkthrough did not restate it would be a serious regression.

**Interim.** SOP content is **retained** as the configured monitoring for `TN-HOLD`. This is
the clearest case of the two sources being **complementary layers** — the walkthrough
describes physical execution and evidence, the SOP describes process control — rather than
competing versions of the same thing.

**Confirmation required: YES, explicitly.** Confirm the Phase-2 temperature programme still
applies.

---

## C-28 🟠 The walkthrough carries no temperature, moisture or fill-height limits

Across all 23 days, **W** specifies durations, evidence, machines and movements. It specifies
**no** temperature band, **no** fill height, **no** moisture percentage and **no** lab
acceptance range — except the conditional "required moisture met / not met" at the hopper
passes, which references a threshold it does not state.

The SOP and lab manual specify roughly 110 such limits.

**Why it matters.** Without them there are no quality gates, no deviations, and no reason for
a supervisor to exist. With them applied to the wrong activities, every batch generates false
deviations.

**Interim.** SOP limits are retained and **mapped onto the new activities** where the mapping
is unambiguous — tunnel fill height 1.8–2.2 m → `TN-LOAD`; bunker fill height 2.6–2.7 m →
`P1-BUNK-LOAD`; T2 moisture 73–75 % → `TR-T2`. Every mapping carries a `mapping_confidence`
flag in the route seed and is listed for review. Where the mapping is ambiguous the limit is
loaded but **disabled**.

**Confirmation required: YES — this is the largest single body of reconciliation work and it
must be reviewed rather than assumed.**

---

## C-29 🔴 What moisture threshold drives the conditional hopper pass?

**W** makes the water/dry decision at `BG-HOP-2` and `BG-HOP-3` depend on whether "the
required moisture content is met" — without stating it.

Candidates, already in conflict from Part 1 (see **C-01**): S1a says 68–69 %, S4a Table 2 says
75–78 % for bagasse wetting, real records show 71.3–72.9 %.

**Why it matters.** This threshold is now **load-bearing**. It no longer merely flags a
deviation — it selects which physical operation the operator performs. C-01 has escalated from
"affects a warning" to "affects what happens in the yard".

**Interim.** The dry/water decision is presented to the operator with the measured value and
**both** candidate bands shown; the operator's choice is recorded with a mandatory reason. No
automatic path selection until C-01 is resolved.

**Confirmation required: YES — now blocking, and it was already blocking.**

---

## C-30 🟠 One destination bunker per reload, or several?

**W** shows one-to-one swaps (`Bunker 3 → Bunker 8`). S7a records a real case of a single line
reloading into **two** bunkers on the same day, and Reload-2 skipped entirely on four master
batches.

**Interim.** `material_movement` supports a list of destinations; the UI defaults to one.

---

## C-31 🟡 Old app stage labels are now doubly wrong

The existing app's `STAGE_LABELS` (S8e) already mislabelled `phase_1B` and `phase_1C` — see
C-13. Under `PROCESS-2026B` the entire 17-stage vocabulary is superseded, so the old APK's
screen names must not be used as domain vocabulary anywhere in v2. Terminology is locked in
`PROCESS_V2_FACTORY_CONFIRMED.md §19`.

---

## OPEN TBDs FROM THE WALKTHROUGH

| ID | Question | Blocks |
|---|---|---|
| **TBD-19** | 2 paddy piles or 3? The written frame implies 3; the dictation says 2, which with the central mixed pile gives the 3 piles the turner works. | Phase 2 — pile cardinality |
| **TBD-20** | Bagasse 21 MT vs 66.66 MT fresh in the historical formulations. Smaller batch, one of three lines, or dry weight? Changes the load count and the yard structure. | Phase 2 |
| **TBD-21** | **Rest durations are never stated** — D2–D3, D10–D11, D13–D14. Fixed hours set at Day-0, or the SOP's temperature triggers? | Phase 3 — **highest-priority walkthrough gap** |
| **TBD-22** | Day 4: is "~3 hours" the unload, the hopper pass, or both together? | Phase 3 |
| **TBD-23** | Which day do paddy receipt and bale cutting happen? Interim: Day 4. | Phase 2 |
| **TBD-24** | Rest after paddy bunker storage — the dictation is ambiguous between **2 h** and **12 h**. | Phase 3 |
| **TBD-24a** *(new, 22 Aug 2026)* | **"Rest duration" and "gap until the successor" are not the same quantity, and the demo seed equates them.** `s11`'s Day-0 derivation assigns each unstated rest the gap on the hour axis to the activity whose entry gate names it as predecessor. For the TBD-21 rests — never stated at all — that is the best available reading. For **STRAW-REST-1 it yields 24 h, contradicting BOTH stated readings** (2 h and 12 h). A 2-hour rest followed by 22 hours of idle is a different plan from a 24-hour rest, and that difference is exactly what a plan-vs-actual system reports on: under a 24 h baseline, 22 hours of unexplained slack registers as zero variance. Acceptable while no actuals exist; **must not enter a production baseline unanswered.** | Phase 3; any variance reporting on a rest |
| **TBD-51** *(new, 22 Aug 2026)* | **Two of §3.2's four protected-gate categories cannot be marked, and one has no mechanism at all.** `ROLE_AND_APPROVAL_MODEL §3.2` names four gates only a GM override may pass. B2 (`0017_deviations.sql`) marks the two that are identifiable in the seeded rules — pasteurisation (`SENSOR_THRESHOLD` on `TN-HOLD`) and tunnel fill height (`FIELD_IN_RANGE` on `TN-LOAD`). The other two are **not marked**: *ammonia not cleared at tunnel out* has no gate at all — **TBD-14** already records that ammonia appears nowhere in the lab workbook — and *"any gate whose failure is critical severity at a management checkpoint"* needs a **severity model that does not exist** on `gate_rule` or on a checkpoint. Until both are closed, a supervisor can accept-with-deviation on conditions §3.2 says only a GM may pass. | Lab plan (ammonia); **B6** (severity + checkpoints) |
| **TBD-52** *(new, 22 Aug 2026)* | **A batch can be activated before its own H0, and work recorded against it — producing actuals that precede the batch's start.** `activate_batch` does not require `start_at` to have passed, and `start_activity` stamps `now()` with no H0 check. A batch dated 20 September, activated today, accepts a "Start work" tap that writes an `actual_start` a month before the batch began. Surfaced by B2's H0 guard, which is therefore **scoped to stated actuals only** — refusing at submit would strand an operator over a value they never typed. **The question is what `active` means:** baseline frozen and ready to run, or running. If the former, activation-before-H0 is correct and `start_activity` needs the guard; if the latter, activation should refuse until H0. Advance planning makes the former likely, but it is a factory decision. | Operator flow; any variance measured from an actual |
| **TBD-25** | Day 7 flips (2 h each) and Day 8 flips (4 h each) — four distinct flips, or two restated? Interim: four. | Phase 2 |
| **TBD-26** | Day 12 reload: 9 h **per bunker** (27 h total), or 9 h total for three, matching the Day-8 pattern of 3 h × 3? | Phase 3 |
| **TBD-27** | Does the yard have finite named bays? If so it becomes a schedulable exclusive resource. | Phase 2 |
| **TBD-28** | How many bunkers does paddy occupy, and for how long? | Phase 2 — conflict detection |
| **TBD-29** | Is a source bunker released at the start of unload or at the end of reload? | Phase 3 |
| **TBD-30** | Do machine operators need certification, and should an uncertified assignment be refused or only warned? | Phase 3 |
| **TBD-31** | Is fuel recorded today, and at what granularity? | Phase 3 |
| **TBD-32** | Do machines have hour meters that are read? | Phase 3 |
| **TBD-33** | Real fleet size — how many turners, JCBs, hoppers? T1‖T2 needs **at least two turners**. | Phase 2 — resource plan |
| **TBD-34** | Evidence per weighment load — one photo × 11 loads, or something lighter? | Phase 3 |
| **TBD-35** | Is video genuinely wanted on `BG-HOP-3`? It is roughly 40× the storage of a photo. | Phase 3 |
| **TBD-36** | Which lab checkpoints attach to which `PROCESS-2026B` activities? The walkthrough names none; the lab workbook defines 18. | Phase 4 |
| **TBD-37** | Is growing-room loading and harvest genuinely out of scope now, or only out of **demo** scope? | Phase 7 |

---
---

# PART 3 — FIVE DECISIONS FIXED, AND WHAT THE MATERIAL-ROLE MODEL RAISES

Added 20 Aug 2026.

## Resolved for the demo — client decision

These five stay in the register because the **factory question is still open**. They are fixed
as *demo decisions*, marked as such in the UI, and must not be presented as factory truth.

| ID | Decision | Underlying question still open? |
|---|---|---|
| **C-01 / C-29** | Hopper pass auto-selection **DISABLED**. Admin selects Water or Dry at Day-0. Operator still records actual moisture. | **Yes** — 68–69 % vs 75–78 % unresolved |
| **TBD-21** | Rest durations are Day-0 configurable, **mandatory before activation**, no default. Amber marker on the field. | **Yes** — the factory has not stated a duration |
| **C-25** | `PROCESS-2026B` uses **one** reload on Day 12. Multi-reload structures remain a separate process definition. `ROUTE-2026A` = historical/SOP reference. **Never merge.** | **Yes** — history shows two |
| **TBD-20** | Demo target **21 MT**; load count **always derived** from `ceil(qty / capacity)`. | **Yes** — 66.66 MT appears in historical formulations |
| **C-27 / C-04 / C-05 / C-17** | Phase-2 monitoring **retained** for Days 16–21 with the named thermal stages. Disputed bands are **configuration-driven and visibly sourced**, never hard-coded gates. | **Yes** — conditioning-2 and cooling-2 bands disputed |

## New TBDs from the material-role model

The client requirement *"instead of bagasse they may use mustard"* means the process definition
binds to **roles**, not materials (`ADMIN_CONFIGURABILITY_MODEL.md`). That raises four questions
the sources do not answer.

| ID | Question | Blocks |
|---|---|---|
| **TBD-38** 🟠 | Do **durations change with the material** filling a role? S1c states waxy straws (wheat, mustard) absorb far more slowly than paddy, and *"the period of prewet is calculated by number of hours rather than number of days"* for paddy. If mustard leads `PRIMARY_FIBRE` instead of bagasse, the hopper and conditioning durations may all differ. If so, duration defaults belong to the **role + material** pair, not the role alone. | Phase 2 — seed structure |
| **TBD-39** 🟠 | Are the schedule tokens `Wheat wetting` and `Mustard wetting + B/L` the `SECONDARY_FIBRE` stream? They appear in S6a but nowhere in S1a, and the walkthrough did not cover them. The stream is defined but ships **disabled with no activities seeded**. | Phase 2 |
| **TBD-40** 🟡 | Can `STRUCTURAL_STRAW` ever be filled by something other than paddy? Every record uses paddy; the role exists to allow otherwise. | Phase 2, low |
| **TBD-41** 🟡 | How many named Day-0 templates does the factory want, and who owns them? Cloning the previous batch is expected to be the common path. | Phase 5 |

## Resolved — infrastructure

| ID | Question | Resolution |
|---|---|---|
| ~~**TBD-15**~~ | New Supabase project, or reuse `omsxtifyzlldaxkeqerx`? | ✅ **RESOLVED 20 Aug 2026 — a new project.** The old one is abandoned along with its four hard-coded demo accounts (S8d) and its documented `auth.users` NULL bug. Project identifiers live in `.env.local` and Supabase's secret store, **never in `docs/` or the repo.** |

## Standing rule, restated

`PROCESS-2026B` is the authoritative demo process. `ROUTE-2026A` is the historical / SOP
reference. **They are never merged silently.** Every value that comes from an unresolved
conflict is marked in the UI at the point of use with its conflict ID.
