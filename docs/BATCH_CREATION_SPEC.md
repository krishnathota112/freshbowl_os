# BATCH CREATION SPEC

> ## ⚠ PARTIAL SUPERSESSION — 20 Aug 2026
>
> | Section | Status |
> |---|---|
> | §1 The flow, §2 Schedule is upstream | **STILL VALID for identity.** The slot still supplies batch numbers, start date and route. It **no longer** supplies per-activity planned dates — see conflict **C-20**. Dates are now generated from `PROCESS-2026B` anchored on the slot's start date. |
> | §3 Identity | **STILL VALID** |
> | §4 Route & structure | **EXTENDED** — new counts: `bagasse_required_mt`, `expected_load_capacity_mt`, `yard_pile_count`, `paddy_pile_count`, plus `reload_2_included` now defaults **OFF** (**C-25**) |
> | §5 Formulation | **STILL VALID** |
> | §6 Resources | **EXTENDED** — machines are now first-class and contended; paddy occupies bunkers (**C-24**) |
> | §7 People | **STILL VALID** |
> | §8 Operator plan (six columns) | **STILL VALID AND MANDATORY** — now spans ~36 activity templates instead of 17 |
> | §9 Lab plan | **STILL VALID**, but checkpoint→activity mapping is open (**TBD-36**) |
> | §10 Process options | **EXTENDED** — see §15 below |
> | §11–13 Validate, generate, activate | **STILL VALID** |
> | §14 Admin Today | **STILL VALID** |
>
> **New sections §15–§17** are appended: load plan, movement plan, and the extended Day-0
> configuration surface. Companion docs: `PROCESS_V2_FACTORY_CONFIRMED.md`,
> `RESOURCE_MOVEMENT_MODEL.md`, `MACHINE_UTILIZATION_MODEL.md`,
> `EVIDENCE_CONFIGURATION_MODEL.md`.

The first product flow. Owned by **Admin**. Ends at **Activation**, which freezes the baseline.

Labels: **[FACT]** cited · **[INFER]** derived · **[DECISION]** product decision · **[TBD]** confirm.

---

## 1. The flow

```
MONTHLY SCHEDULE ──► SELECT SLOT ──► PREVIEW ──► CREATE MASTER BATCH
                                                        │
   ┌────────────────────────────────────────────────────┘
   ▼
CONFIGURE  (Day-0)
   1 Identity & inheritance      5 People
   2 Route & structure           6 Operator plan   ← what operators will record
   3 Formulation & materials     7 Lab plan       ← what the lab will measure
   4 Resources                   8 Process options
   ▼
VALIDATE ──► GENERATE PLAN ──► REVIEW ──► ACTIVATE (GM checkpoint 1) ──► BASELINE FROZEN
```

**[DECISION]** The admin does **not** invent a batch. Creation always starts from an approved
`schedule_slot`. There is no "New Batch" button that takes a blank form.

---

## 2. Why the schedule is upstream

**[FACT]** S6a already knows, two months ahead: the batch numbers (`392 393 394 395`), the
start date, and the full day-by-day activity sequence for that batch. Re-typing any of it is
a data-integrity defect, not a convenience question.

**[DECISION]** Everything the slot knows is **inherited and visibly marked** as inherited.
Inherited fields are read-only by default with an explicit "override" affordance that records
who overrode and why.

### 2.1 What is inherited

| Field | From | Example |
|---|---|---|
| Individual batch numbers | slot column header | `392, 393, 394, 395` |
| Count of individual batches | count of numbers | 4 |
| Batch start date | first non-empty cell in the column | 26 Mar 2026 (`Bagasse pre-wet F1 +H1`) |
| Planned date for every activity | each cell in the column | see DOMAIN_MODEL §3 |
| Route | slot's route, defaults to the current published route | ROUTE-2026A |
| Planned tunnel-loading date | the `T/L` cell | Day 8 |
| Planned growing-room loading dates | the `GR-L` cells | 2 dates |

### 2.2 What the schedule does NOT know — and Admin must supply

Formulation · raw material lots, suppliers, vehicles · bunker line count and bunker allocation
· tunnel allocation · growing room allocation · people · equipment · target quantities ·
process options · the operator plan · the lab plan.

---

## 3. Step 1 — Identity & inheritance

**[FACT]** Fields taken verbatim from S2a Section 0 and S2b, which are the two blank master
batch forms in use.

| Field | Source of value | Notes |
|---|---|---|
| Master Batch label | derived: `391,392,393,394` | **[FACT]** S3f header format |
| Date of batch start | inherited | **[FACT]** S3f "Date of Batch Start 26/03/26" |
| No. of individual batches | inherited (editable with reason) | 3 or 4 observed |
| No. of growing rooms covered | **admin enters** — decimal allowed | **[FACT]** S2a "3 ½"; S4b shows a 4th `3 (A)` room |
| Target compost qty (t) | admin | **[FACT]** S3f "200MT (50MT each room)" |
| Target per room (t) | admin, or `total ÷ rooms` | |
| Raw material basis (except minerals) | derived from formulation | **[FACT]** S3f "Bagasse new%: 38 · Paddy new%: 53 · Wheat Straw%: 9" |
| Supervisor / In-charge | admin selects | **[FACT]** S3f "RAMARAO" |
| Compost Manager | admin selects | **[FACT]** S2b field · **[TBD-9]** |
| Weather | admin | **[FACT]** S2b field |
| Expected tunnel loading date | inherited from `T/L` cell | **[FACT]** S2b field |
| Rooms allocated | step 4 | **[FACT]** S2b field |

---

## 4. Step 2 — Route & structure

This is where the counts that must never be hard-coded are set.

| Input | Default | Constraint |
|---|---|---|
| Route | current published | **[DECISION]** a batch is pinned to a route *version*; publishing a new route never changes a live batch |
| Number of bunker lines | 3 | **[FACT]** 2 and 3 both observed (S3a, S3f) |
| Number of individual batches (= tunnel charges) | inherited | 3–4 observed |
| Number of growing room loads | ≥ individual batches | **[FACT]** half rooms exist (S4b) |
| Reload-2 included? | yes | **[FACT]** S7a shows Reload-2 **omitted entirely** on master batches 8, 9, 12, 13 — this is a real route option, not an exception |
| Wheat/mustard wetting included? | from schedule token | **[TBD-2]** |
| Number of paddy soaks | 2 | **[FACT]** S3f uses 3 (`After Soaking-3`); S3a/S3b use 2. S4b has columns for 3. |

**[DECISION]** Changing any structural count regenerates the activity plan preview
immediately, so the admin sees the consequence before committing.

---

## 5. Step 3 — Formulation & raw materials

**[FACT]** Fields are S3f Section 1A exactly: Raw materials · Age (months) · Dry(wt) Qty (MT)
· Fresh (wt) Qty (MT) · pH · Moisture % · N% · Ash% · Total quantity row.

### 5.1 Starting point

**[DECISION]** Three ways to start, in order of expected use:

1. **Clone the previous master batch's formulation** — the actual factory practice. S5a is a
   near-continuous chain of small edits from batch 267 onward.
2. Pick a named formulation template.
3. Start blank.

### 5.2 Live computation

**[FACT]** S5a computes, per batch: batch N % (`Σ Total N2 / Σ Quantity`), batch Ash %, and
**C:N ratio**. S4a gives `C:N = (100 − Ash) × 0.5 / N`.

The screen computes and displays these live as the admin edits, with the historical
distribution alongside:

```
                     THIS BATCH        LAST 10 BATCHES
  Total dry wt        107.7 MT          81.4 – 107.7
  Total fresh wt      160.5 MT
  Batch N %            1.53 %           1.43 – 1.70     ✅
  Batch Ash %         20.4 %            14.1 – 20.8     ✅
  C:N ratio           26.1              24.3 – 34.3     ✅
```

**[FACT]** Those ranges are the real spread from S5a batches 267–323.

⚠ **[FACT / C-06]** S1c states "Starting N content of compost should be 1.75 % before
composting", while S1c's own monitoring table calls 1.4–1.6 % optimum and every real
formulation in S5a lands at 1.25–1.70 %. The screen shows the S5a historical band as the
practical guide and flags the 1.75 % figure as unresolved rather than validating against it.

### 5.3 Raw material lots

Per material, admin records: supplier name, vehicle number, received date, gross MT,
age (months), source region (`punjab` | `local` — **[FACT]** S4b col C).

**[DECISION]** Recording a lot auto-generates a `RAW_MATERIAL` lab task (LAB_MODEL §6). The
assay columns (pH / MC / N / Ash) in the formulation table are **populated from the lab
result**, not typed by the admin. If the lab has not reported yet, the admin may enter
provisional values which are visibly marked `provisional` and replaced on lab report.

**[FACT / C-08]** S3b (batch 372–374) has Bagasse moisture `12.5` and Wheat straw moisture
`56.8` — transposed, since S4a Table 1 gives bagasse 40–55 % and paddy/wheat 12–13 %. A
range check against S4a Table 1 catches exactly this class of error at entry.

---

## 6. Step 4 — Resources

Three allocation grids, each showing live conflicts against other batches.

**Bunkers.** Per bunker line, per stint (Stage-0 fill, Stage-0 reload, P1 fill, P1 reload-1,
P1 reload-2), pick a bunker. **[FACT]** S7a shows real allocations: MB `1,2,3` → fill 2/3/4,
reload-1 5/6/7, reload-2 8/9/10. Conflicts are checked against the planned occupancy window
of every other active batch.

**Tunnels.** Deferred: **[DECISION]** tunnel allocation is *proposed* at Day-0 but *committed*
at GM checkpoint 3, because the pooling decision genuinely happens then (WORKFLOW_MODEL §6).
Day-0 records a reservation.

**Growing rooms.** Same — proposed at Day-0, committed at checkpoint 4.

**Equipment & vehicles.** Turner, hopper, rotovator, loaders, conveyor, probes; delivery and
internal vehicles. Load is shown per day against the schedule.

---

## 7. Step 5 — People

Supervisor (mandatory) · Compost manager · Operators per shift per activity group · Lab
technician(s). **[TBD-10]** shift boundaries.

**[DECISION]** Assignment is per activity *group*, not per activity — assigning 17 × 3 lines
individually is unusable. Groups: Stage-0, Mixing (1A/1B/1C), Phase-1 turning, Phase-1 bunkers,
Phase-2 tunnels.

---

## 8. Step 6 — Operator plan *(this is the six-column screen)*

**This is what "the admin enters all the fields the operator needs to fill" means concretely.**

The admin is **not** entering readings. The admin is deciding, for this batch, **what will be
asked of the operator, what the target is, and how much they are allowed to vary**.

For every activity in the route, a table:

| Field | SOP (col 1) | Day-0 (col 2) | Customisable (col 3) | Operator records (col 4) | Remarks (col 5) |
|---|---|---|---|---|---|
| `moisture_pct` | 68–69 % | **69 %** | ± 1 % | ☑ required | "hopper pass with full water" |
| `heap_height_m` | ≤ 1.5 m | **1.5 m** | no | ☑ required | |
| `rest_duration_hr` | 8–12 h | **10 h** | ± 2 h | ☑ auto (timer) | |
| `flippings_count` | 2 | **2** | no | ☑ required | |
| `lime_added_kg` | — | **0** | yes | ☐ optional | old bagasse only |
| evidence | — | — | — | ☑ pH meter, ☑ moisture meter | |

Behaviour:

- **[DECISION]** Column 1 is read-only and comes from the route. The admin can never edit
  what the SOP says.
- **[DECISION]** Column 2 defaults to the SOP midpoint or bound; admin narrows it for this
  batch (e.g. wet season → target the low end of the moisture band).
- **[DECISION]** Column 3 is the *permission*, and it is what the deviation engine uses:
  outside Day-0 ± customisation → warning + remark required; outside SOP bound → deviation.
- **[DECISION]** Column 4 is a toggle: required / optional / not collected this batch. This
  is how the admin controls operator workload without editing the SOP.
- **[DECISION]** The route ships with sane defaults for all of this, so a fast batch creation
  is: accept defaults, click through. Nothing here is mandatory typing.

---

## 9. Step 7 — Lab plan *(the lab equivalent)*

Same idea, over the 18 checkpoints from LAB_MODEL §3.

| Checkpoint | Parameters | Spec (S4a) | Day-0 target | Required? | Sample count |
|---|---|---|---|---|---|
| `RAW_MATERIAL` | pH, MC, N, Ash | per material, S4a T1 | inherit | ☑ | 1 per lot |
| `BAGASSE_BL` | MC, EC, pH | MC 75–77 ⚠ *(C-01)* | 76 % | ☑ | 1 per bunker line |
| `LAGOON_*` | pH, EC, TDS | pH 6.5–7.5, EC < 1.5 | | ☑ | 1 per soak × before/after |
| `BUNKER_FILL` | pH, EC, MC, Ash, N, C:N | MC 74–77, pH 8.1–8.4, Ash 16–20, N 1.3–1.6, C:N 25–32 | inherit | ☑ | 1 per bunker line |
| `BUNKER_RELOAD_1` | same | MC 75–76.5, pH 7.8–8.0, Ash 19–23, N 1.4–1.7, C:N 22–28 | inherit | ☑ | 1 per line |
| `BUNKER_RELOAD_2` | same | same as reload-1 | inherit | ☑ *(off if reload-2 skipped)* | 1 per line |
| `TUNNEL_LOAD` | same | MC 72.5–74, pH 7.6–7.8, Ash 23–26, N 1.6–1.9, C:N 19–24 | inherit | ☑ | 1 per tunnel |
| `COMPOST_OUT` | MC, N, pH, EC + spring/colour/actino/smell | MC 65–68 | inherit | ☑ | 1 per tunnel |
| `GR_LOAD` | pH, EC, MC, Ash, N, C:N | pH 7.4–7.7, MC 65–68, Ash 25–29, N 1.8–2.2, C:N 16–20 | inherit | ☑ | 1 per room |

**[DECISION]** The admin can add a parameter to a checkpoint (e.g. add ammonia ppm at
compost-out — **[FACT]** S1c specifies "800–1000 ppm" as the Phase-1 end target, and it is
not currently in S4b) but cannot remove one that a gate depends on.

---

## 10. Step 8 — Process options

| Option | Values | Source |
|---|---|---|
| Reload-2 included | yes / no | **[FACT]** S7a omissions |
| Number of paddy soaks | 2 / 3 | **[FACT]** S3a vs S3f |
| Moisture correction at reload-2 | yes / no | **[FACT]** S1a P1D-B "moisture correction, target 75 %" |
| Lime pH correction on old bagasse | yes / no | **[FACT]** S1a 0A |
| Probe logging interval | 6 h (bunker) / 4 h (tunnel) | **[FACT]** S1a "probes every 6 hrs"; S3f log at 4 h |
| Tunnel probe source | manual / ingested | **[TBD-8]** |

---

## 11. Validate

The validator runs before activation and produces a report with three severities.

**BLOCKING** — cannot activate:
- Any inherited field overridden without a reason
- Formulation total ≠ sum of lines
- A bunker allocated to two batches in an overlapping window
- Fewer bunker lines than the route requires
- A gate-critical lab parameter disabled
- No supervisor assigned
- Route not published

**WARNING** — activate with acknowledgement:
- Computed N %, Ash % or C:N outside the S5a historical band
- A raw-material assay outside its S4a Table 1 range *(this is expected sometimes — S3f's
  paddy pH 6.49 was out of band and the batch ran)*
- Target compost qty > 10 % from the last 5 batches
- Planned tunnel loading date conflicts with tunnel availability
- Growing rooms allocated < individual batches

**INFO**:
- Formulation differs from previous batch — shows a diff
- Season/weather note absent
- Any unresolved TBD affecting this route (e.g. C-01 moisture conflict) is surfaced here, so
  the admin knows which numbers are still contested

---

## 12. Generate plan

The system materialises the full baseline:

- `batch_activity` rows for every route activity × scope (master / bunker line / individual
  batch), with `planned_date` from the schedule slot
- `batch_activity_value` rows with columns 1–3 populated, column 4 empty
- `lab_test` templates per checkpoint
- vessel reservations
- gate definitions frozen
- a **baseline snapshot** stored as an immutable document

**[DECISION]** The plan preview is shown as both a timeline and a table before activation.
For a 3-line, 4-batch master batch on ROUTE-2026A that is roughly:
17 activities × (1 master-scope, 3 line-scope, 4 batch-scope as applicable) ≈ **48 activity
instances** and **~34 lab samples**. The admin sees those counts before committing.

---

## 13. Review & Activate

Final screen: identity · structure · formulation with computed chemistry · resources ·
people · plan counts · validation report · unresolved TBDs.

**[DECISION]** Activation is GM checkpoint 1 (ROLE_AND_APPROVAL_MODEL §5). On activation:

1. Baseline is **frozen** — columns 1–3 become immutable for this batch.
2. `schedule_slot.status` → `instantiated`.
3. Vessel reservations become occupancy locks.
4. First activity (0A) → `READY`, and appears in the assigned operator's My Work.
5. `BATCH_ACTIVATED` event fires; raw-material lab tasks are created.
6. An immutable `audit_event` records who activated, when, and the baseline hash.

**[DECISION]** After activation the admin cannot edit the baseline. Legitimate mid-batch
change goes through: operator records reality → deviation → supervisor decision, or
supervisor → override request → GM approval. This is the mechanism that makes the batch
record trustworthy, and it is exactly what the existing app's editable-anything model
(S8e, drafts in localStorage) cannot provide.

---

## 14. Admin's daily screen

**[DECISION]** The admin's home is **Today**, not a batch list — matching the stated mental
model of "admin sees today's schedule and creates the batch".

```
TODAY · Thu 19 Aug 2026

  STARTING TODAY  (from schedule)
  ┌──────────────────────────────────────────────────────┐
  │ 396 397 398 399     Bagasse pre-wet F1 +H1           │
  │ route ROUTE-2026A · 4 batches · T/L due 27 Aug       │
  │                          [ PREVIEW ]  [ CREATE ]     │
  └──────────────────────────────────────────────────────┘

  RUNNING  (7 active master batches)
  391-394   D+6  P1D-B  reload-2 hold  ⚠ 1 deviation
  387-390   D+9  P2C    tunnel process
  384-386   D+13 P2D    ⏳ awaiting GM checkpoint 4
  …

  NEEDS ME
  · MB 396-399 draft — validation has 2 blocking issues
  · Bunker 5 double-booked 22–24 Aug (MB 396-399 vs MB 400-403)
```

---

# 15. LOAD PLAN — added 20 Aug 2026

**[DICTATED §4]** *"DO NOT hard-code 10 loads. The system should calculate
`required_qty / expected_load_capacity` and create a load plan."*

## 15.1 Day-0 inputs

| Field | Demo value | Notes |
|---|---|---|
| `bagasse_required_mt` | **21.0** | **[TBD-20]** — historical formulations show 66.66 MT fresh |
| `expected_load_capacity_mt` | **2.0** | typical truck load |
| → `load_count` (derived) | **`ceil(21.0 / 2.0) = 11`** | never typed, never stored as a constant |

The wizard shows the derived count live and regenerates the plan preview on every keystroke:

```
Bagasse required     [ 21.0 ] MT
Load capacity        [  2.0 ] MT per load
                     ─────────────────────
LOADS TO PLAN            11        ← recalculates on change
```

## 15.2 What each load instance carries

One `batch_activity` at scope `LOAD`, `instance_no` 1…11, each with its own target quantity,
vehicle, machine, operator, timings, evidence and variance. The final load's target is the
remainder (`21.0 − 10 × 2.0 = 1.0 MT`), not a full load — the generator must handle the tail.

## 15.3 Running totals

**[DICTATED]** *"This is an important visual component."* Required on the operator's weighment
screen and on the batch detail screen:

```
TARGET      21.0 MT
LOADED      17.8 MT   ████████████████░░░░  85%
REMAINING    3.2 MT
LOADS        9 / ~11
```

`LOADED` is `SUM(actual_qty)` over completed load instances — computed, never stored.
The `~` on the load count is deliberate: actual loads may differ from planned if real load
weights differ from the 2.0 MT assumption.

**[DECISION]** If actual cumulative quantity reaches `bagasse_required_mt` before all planned
loads are done, the remaining instances become `SKIPPED` with reason `target_reached`. If the
planned loads are exhausted while quantity is short, the system offers to **add a load
instance** — recorded as a plan deviation, not a silent edit.

---

# 16. MOVEMENT PLAN

**[DICTATED §39-D]** Day-0 configures `SOURCE · DESTINATION · WHEN · QUANTITY`.

Part of the frozen baseline, like every other Day-0 column. Actual movements produce variance
against it.

| Activity | Source | Destination | Planned | Rule |
|---|---|---|---|---|
| `BG-BUNK-LOAD` | Yard | **Bunker 3** | D1 14:00 | — |
| `BG-BUNK-RELOAD` | Bunker 3 | **Bunker 7** | D4 09:00 | `requires_distinct_vessel` |
| `PD-BUNK-STORE` | Soak pit | **Bunker 4** | D5 | paddy occupancy (**C-24**) |
| `BG-YARD-UNLOAD` | Bunker 7 | Yard → `PILE-1`, `PILE-2` | D7 06:00 | creates 2 transient locations |
| `PD-YARD-LOAD` | Bunker 4 | Yard → `PADDY-PILE-1/2` | D7 15:00 | creates 2 |
| `P1-BUNK-LOAD` ×3 | `MIXED-PILE` | **Bunkers 3, 5, 8** | D8 18:00 | per line |
| `P1-BUNK-RELOAD` ×3 | Bunkers 3, 5, 8 | **Bunkers 8, 9, 10** | D12 06:00 | `requires_distinct_vessel` |
| `TN-LOAD` ×3 | Bunkers 8, 9, 10 | **Tunnels 1, 2, 3** | D15 07:00 | N:M pooling, GM checkpoint 3 |

The Day-0 screen renders this as the movement graph from `RESOURCE_MOVEMENT_MODEL.md §5.1`,
not as a table alone — the admin should see the physical path they are committing to.

**Conflict detection** runs on every destination against all existing occupancies and every
other batch's reservations, including **paddy occupancies** (**C-24**).

---

# 17. EXTENDED DAY-0 CONFIGURATION SURFACE

**[DICTATED §39]** Four configuration surfaces. Steps 6 and 7 already exist in §8 and §9 of
this document; §17.1 and §17.2 below extend them for `PROCESS-2026B`.

## 17.1 Operator plan — now ~36 activities

The six-column table is unchanged in structure and remains mandatory. What changes is scale
and two new column groups per activity:

```
BG-HOP-2 · Hopper Pass 2 · Bagasse · Day 1 · MASTER scope

  FIELD             ① SOP        ② DAY-0    ③ VARY    ④ OPERATOR   ⑤ REMARKS
  Moisture %        68–69 ⚠C-01   [   ]     ± 1 %     Required     both bands shown
  Water added (L)   —             [   ]     free      Required     if water variant
  Duration          —             [   ] h   ± 30 m    Auto

  VARIANTS                                    ⚠ auto-selection DISABLED (C-29)
  ○ Water Hopper Pass    selected when moisture below target
  ○ Dry Hopper Pass      selected when moisture met
  Operator chooses and must give a reason until the threshold is confirmed.

  EVIDENCE                MEDIA      REQUIRED   GATES SUBMIT
  Before pass             photo         ☑            ☑
  After pass              photo         ☑            ☑
  + add requirement

  RESOURCES               PLANNED
  Machine                 HOPPER-01
  Operator                Kiran
  Expected duration       — ⚠ TBD
```

Every activity ships with defaults from the process definition. A fast batch is accept-and-continue.

## 17.2 Resource plan — machines are now first-class

**[DICTATED §39-C]** `MACHINE · BUNKER · TUNNEL · VEHICLE · OPERATOR · EXPECTED DURATION`.

The critical case is the turner assignment:

```
TR-T1 · pile 1   TURNER-01   Ravi     6–8 h    ✓
TR-T2 · pile 1   TURNER-02   Suresh   6–8 h    ✓
TR-T1 · pile 2   TURNER-01   Ravi     6–8 h    queued behind pile 1
TR-T2 · pile 2   TURNER-02   Suresh   6–8 h    ✓
```

Assigning `TURNER-01` to both T1 and T2 on the same pile produces a conflict **at
configuration time**, because the two stints would overlap. This is what makes the parallel
`T1 → T2` behaviour provable rather than hoped-for. See **[TBD-33]** — the real fleet size is
unconfirmed and at least two turners are required.

## 17.3 New process options

| Option | Default | Source |
|---|---|---|
| `reload_2_included` | **OFF** | **C-25** — the walkthrough describes one reload, history shows two |
| `paddy_soak_count` | 3 | **[DICTATED]** |
| `yard_pile_count` | 2 | **[DICTATED]** |
| `paddy_pile_count` | 2 | **[TBD-19]** |
| `expected_load_capacity_mt` | 2.0 | **[DICTATED]** |
| `hopper_variant_auto_select` | **OFF** | **C-29** — threshold unconfirmed |
| `video_allowed_on_BG-HOP-3` | ON, 30 s / 720p cap | **[TBD-35]** |
| `rest_duration_*` (D2–3, D10–11, D13–14) | **no default — required** | **[TBD-21]** |

**[DECISION]** Any option whose value comes from an unresolved TBD ships with **no default and
is a required field**, carrying an amber marker naming the TBD. The system never invents a
number the factory has not given.
