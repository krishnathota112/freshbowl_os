> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# MushroomOS — MASTER HANDOVER

**Written 29 August 2026.** The primary artifact for transferring understanding of this repository
to an implementing agent (OpenCode).

**Read this section first.**

- The immediate target is the **WEB DEMO**. Nothing else.
- **APK packaging is Phase 2** and is not started until the process owner approves the web demo.
- **Do not rewrite the backend to make the demo easier.** It is more complete than it looks.
- **Do not hard-code the process into React.** Screens render process data. This is enforced by tests.
- **Do not invent factory rules.** A value with no source is `null` plus a marker, never a default.
- Where this document says **PROCESS-OWNER QUESTION**, stop and ask. Do not choose.

---

# 1 · CURRENT REPOSITORY STATE

Verified by running it on 29 Aug 2026, not from memory.

| | |
|---|---|
| **Typecheck** | `npx tsc --noEmit` — **clean** |
| **Build** | `npm run build` — **clean**, ~24 s |
| **Tests** | **434 passing / 5 failing / 0 skipped** (25 files, ~12 min) |
| **Database** | Supabase, live, reachable. 54 domain tables · 22 views · ~90 domain RPCs |
| **Migrations** | `0001` … `0033`, all applied |
| **Seeds** | `s01` … `s11`, all applied, now genuinely re-runnable |
| **Node** | 20.19.5 (README says 20+; built on 24) |
| **Android** | **BLOCKED and DEFERRED** — no Android SDK, no `android/local.properties`, Java is **1.8** where Capacitor 6 needs JDK 17+. `npx cap sync android` works and has been run. |

### Where it was at the start of this session

**55 failing / 364 passing.** The cause was almost entirely **database drift**, not code:

- The database was running **superseded function bodies** — `advance_batch` was still the `0008`
  version that `0018` replaces (2026 chars vs 4043).
- **Gate rules had been reduced from 10 kinds to 3.** Every `GM_APPROVAL` and `SENSOR_THRESHOLD`
  rule — the ones that hold the tunnel — was gone.
- The three `MB-DEMO-*` batches had been deleted.
- `batch_vessel_allocation` was empty while occupancy rows still claimed three tunnels — orphans the
  engine cannot produce, since `release_vessel` refuses to release an occupied vessel.
- ~17 activities and the day-9 heading were missing.

All restored through the repo's own tooling. **No table was hand-written.**

### The 5 remaining failures — none is a demo blocker

| # | Test | Diagnosis | Action |
|---|---|---|---|
| 1–3 | `demoBatches.test.ts` · *"the pre-A2 batches were replaced, not repaired"* | Three cancelled batches (`batch`, `MB-2026-08-20`, `MB-2026-09-20`) were **deleted** in an earlier session by a script that opens with `delete from master_batch`. `s11` only *cancels* them if present; nothing recreates them. | **Leave failing.** Recreating them would fabricate cancelled history — one assertion specifically checks a genuinely-completed activity survived. That is the fabrication the standing brief forbids. |
| 4 | `recordedActuals.test.ts` · *"variance is measured against when the work ended"* | Submits `actual_end = now − 3 h` on whichever activity `readyActivity()` returns. After restore that activity's `actual_start` is later than that, so `batch_activity_actual_end_after_start` fires. **Data-order fragility in the test**, not a code defect. | Fix the test to pick an activity whose `actual_start` permits the backdate, or to set both ends. |
| 5 | `hourlyPlan.test.ts` · *"one vessel cannot be two slots of the same batch"* | Needs one free `BUNKER`. **There are none** — see §14. | Resolve the capacity issue in §14; the test then passes untouched. |

### Commands that matter

```bash
npm run dev            # localhost:5173
npm run build          # tsc -b && vite build
npm run typecheck
npx vitest run --no-file-parallelism    # REQUIRED flag — shared DB, they contend otherwise
npm run db:migrate     # forward-only, idempotent, safe to re-run
npm run db:seed        # idempotent
node scripts/allocate-vessels.mjs       # allocations + occupancy backfill
node scripts/stage-history.mjs          # staged work, via real RPCs as real people
node scripts/stage-history.mjs --dry-run
```

> ### ⚠ SCRIPTS THAT DESTROY DATA — read before running
> `scripts/demo-prep.mjs` and `scripts/demo-stage.mjs` both begin with **`delete from master_batch`**.
> That is how the pre-A2 history was lost. **Do not run either without explicit instruction.**
> To repair the database, use `db:migrate` → `db:seed` → `allocate-vessels` → `stage-history`.

---

# 2 · EXISTING ARCHITECTURE

```
mushroomos/
  src/
    api/          13 modules · 2,944 lines   the ONLY layer that talks to the database
    components/
      primitives/ index.tsx (396)            L1 · buttons, chips, cards, empty states
      domain/     TimeLabel · HumanDuration · PlayheadContext   L2 · know domain shapes
      composite/  HourRail · Narrative · EventStream · MovementPlan · StaircaseCalendar
                  · ExceptionBand · geometry.ts                 L3 · take props, NEVER query
      node/       FiveLayerNode
      layout/     AppShell (management) · FieldShell (floor) · PageHeading
    routes/       19 screens · 8,021 lines   L4 · the ONLY layer that queries
    domain/       contracts.ts · time.ts · cardinality.ts · label.ts · types.ts
    lib/          now.ts (the clock) · monthlyScheduleImport.ts
    theme/        tokens.css — every colour and face as a CSS variable
  supabase/
    migrations/   0001 … 0033, forward-only
    seed/         s01 … s11 — the process definition, as data
  tests/          25 files · 439 tests, most against the real database
```

### Two rules enforced by tests, not convention

1. **Nothing below `routes/` may import `api/`.** Components take props, so they render identically
   from a fixture or a live row.
2. **The process length is never written into code.** It comes from `process_definition`.
   `src/domain/time.test.ts` scans `supabase/` for process-length literals and fails on collisions —
   this is why migration `0032` contains no calendar date anywhere.

### Verdicts

| Area | What exists | Verdict |
|---|---|---|
| **Process engine** | `generate_activity_plan`, `evaluate_gates`, `advance_batch`, `evaluate_cardinality`, `repoint_batch_activities`, `release_elapsed_rests`, `repair_plan_states` | **KEEP** |
| **Gates** | 10 kinds: `PREDECESSOR`, `EVIDENCE_COMPLETE`, `MACHINE_STINT_CLOSED`, `GM_APPROVAL`, `SENSOR_THRESHOLD`, `FIELD_IN_RANGE`, `DAY0_DURATION`, `ELAPSED_TIME`, `EITHER_OR`, `BOTH`. Entry/exit. `SAME_SCOPE_INSTANCE` vs `ALL_INSTANCES` binding. | **KEEP** |
| **Activities / dependencies** | Process is data — `process_activity`, `gate_rule`, `evidence_requirement`, `activity_variant`, `resource_requirement`, cardinality rules as JSONB | **KEEP** |
| **Lab** | Full module (`0022`): `lab_sample`, `lab_test`, `lab_result` (immutable, versioned), `lab_spec`, `lab_method`, `lab_instrument`, retest chains that never overwrite. RPCs: `open_lab_sample`, `request_lab_test`, `record_lab_result`, `decide_lab_submission`, `accept_lab_result`, `order_retest` | **KEEP** |
| **Evidence** | `evidence_media`, `evidence_requirement`, `bind_evidence`, `can_capture_for_activity`, Supabase Storage, `createSignedUrl`. Upload-then-bind ordering enforced server-side. | **KEEP** — and it *does* render now, in `TaskDrawer` (§4). The older audit saying "no media renders anywhere" is **out of date**. |
| **Approvals** | `management_checkpoint`, `checkpoint_package`, `record_checkpoint_decision`, `gm_decide_override`, `GM_APPROVAL` gate kind, `v_checkpoint_status` | **KEEP** — under-surfaced in UI |
| **Resources** | `location`, `machine`, `batch_vessel_allocation`, `location_occupancy` (GiST exclusion on exclusive vessels), `machine_usage`, `v_plant_now`, `v_vessel_availability`, `v_machine_utilisation` | **KEEP** |
| **Variance / causality** | `v_batch_variance`, `v_stream_variance`, `v_variance_contributor`, `variance_minutes` as a generated column, `Narrative` component | **KEEP** |
| **Clock** | `src/lib/now.ts` — one `nowMs()`, offset measured once from `get_effective_now`. Dev clock: `set_dev_clock_h`, `play_dev_clock`, `pause_dev_clock`, `reset_dev_clock_to_live` | **KEEP** · **FIX** the 4 leaks in §4 |
| **Auth** | Supabase Auth + `profiles` + `custom_access_token_hook` + `has_role` + RLS. 6 roles: `admin`, `gm`, `manager`, `supervisor`, `operator`, `lab_tech` | **KEEP** |
| **Monthly schedule** | `0033` · `monthly_schedule_import`/`_group`, `import_monthly_schedule`, `claim_monthly_schedule_group`, `MonthlySchedule.tsx` | **KEEP** |
| **FORECAST** | **Does not exist.** No forecast table, no view, no propagation. `HourRail` draws a dashed tail off *actual*; that is not a forecast register. | **BUILD** |
| **Parallel-operations view** | Every activity carries a `stream`; nothing draws streams as concurrent lanes | **BUILD** |
| **Delay ticket** | Deviations exist and work. A delay that **moves a forecast** does not. | **BUILD** |
| **1-hour HP1 rest** | Not modelled — see §3 | **BUILD** |

---

# 3 · PROCESS MODEL

Every statement is labelled. **Do not promote a label without asking the process owner.**

### 3.1 CONFIRMED — stated by the process owner, 29 Aug 2026

| # | Rule | Represented today? |
|---|---|---|
| C1 | Factory operates **24/7** | Yes — implicitly; no shift model exists |
| C2 | **Any authorised person** can perform a lab test | Partly — `/lab/queue` allows `lab_tech` + `supervisor` only |
| C3 | An **operator can perform lab** | **NO** — operator is excluded from `/lab/queue`. **FIX** |
| C4 | Lab has a **separate UI/workflow** | Yes — `LabQueue.tsx` (704 lines), `FieldShell` |
| C5 | Lab takes **≈ 30–40 minutes** | Partly — seeds say `0.5–1.0 h` (30–60 min). Max should become ≈ `0.67`. **FIX** |
| C6 | **Hopper Pass 1 must finish before the lab test** | **Yes** — `PREDECESSOR` gate, `LAB-FIB-MOISTURE-1 ← FIB1-HOP-1` |
| C7 | HP1 output needs **1 hour rest before lab eligibility** | **NO — NOT MODELLED. The single biggest process gap.** **BUILD** |
| C8 | **Lab result determines dry vs watered HP2** | **Yes** — `FIB1-HOP-2 ← LAB-FIB-MOISTURE-1` (C-29) + `activity_variant` WATER/DRY |
| C9 | **Parallel operations must be represented separately** | Data yes (`stream`); UI **NO**. **BUILD** |
| C10 | **Durations are elapsed time** unless explicitly stated otherwise | Consistent with `ELAPSED_TIME` gates and rest windows |

### 3.2 The Day-0/1 fibre chain, as the code has it today

```
FIB1-WEIGH  (per LOAD, count derived: ceil(required_mt / load_capacity_mt))
     │  PREDECESSOR · ALL_INSTANCES
     ▼
FIB1-HOP-1   Hopper Pass 1 — "water is always on for this one"
     │  PREDECESSOR · "nothing to measure"      ◄── C7's 1h rest belongs HERE, and is missing
     ▼
LAB-FIB-MOISTURE-1   Hopper 1 Check  (moisture_pct, ph, ec)
     │  PREDECESSOR · C-29 · "the moisture result decides water or dry"
     ▼
FIB1-HOP-2   Hopper Pass 2 — activity_variant: WATER | DRY, auto_select_enabled = FALSE
     │
     ▼
LAB-FIB-HOP2 → LAB-FIB-PREBUNK → FIB1-BUNK-LOAD
```

**This chain is the demo.** It already exists end to end except C7.

### 3.3 PROCESS-OWNER QUESTION — where does H0 start? (UNRESOLVED)

**The repository contains two frozen specifications that contradict each other.** This is not a bug
and must not be silently resolved.

| Source | Says | Marked |
|---|---|---|
| `docs/PROCESS_2026B_AUTHORITATIVE_MATRIX.md` | H0 **is** Bagasse Wetting. `FIB1-HOP-1` H0→H3, `LAB-FIB-WET` H1→H2, `LAB-FIB-MOISTURE-1` H3. Weighment outside the rail, pre-H0 at ≈ −10/−12 h | *"FROZEN — Final Approved Baseline"* |
| `docs/IMPLEMENTATION_CHECKLIST.md` §2 | *"Day 1 lab is four checkpoints (already seeded — keep)"* | *"Frozen corrections (do not reopen)"* |
| `supabase/seed/s03`, `s08` | Day 1 | committed; **what the tests assert** |

The **live database matched the authoritative matrix**; the seeds never caught up with it. On
29 Aug 2026 the process owner directed that **the committed repo is the implementation baseline**,
with the divergence recorded as an open question.

**The exact divergence — 8 rows of 51. Forty-three agreed.**

| Activity | Repo seed | Live DB | Live hours |
|---|---|---|---|
| `FIB1-HOP-1` | Day 1 | Day 0 | H0 → H3 |
| `FIB1-HOP-2` | Day 1 | Day 0 | H3 → H6 |
| `FIB1-BUNK-LOAD` | Day 1 | Day 0 | H6 → H8 |
| `LAB-FIB-WET` | Day 1 | Day 0 | H1 |
| `LAB-FIB-MOISTURE-1` | Day 1 | Day 0 | H3 |
| `LAB-FIB-PREBUNK` | Day 1 | Day 0 | H6 |
| `P1-BUNK-LOAD` | Day 8 | Day 9 | H217 |
| `LAB-BUNK-FILL` | Day 8 | Day 9 | H217 |

The live DB additionally had **50 rows** of `standard_hour_source = 'factory_stated'` (real hour
spans, not `rel_day × 24`) and `is_pre_h0` / `pre_h0_offset` on `LAB-PRE-INTAKE` (−12 h) and
`FIB1-WEIGH` (−10 h). **Nothing in the repository ever writes `factory_stated`, and no migration
creates those two columns** — `0032` adds `is_prebatch`, a different column.

All 52 rows are preserved as replayable SQL. Full detail:
`docs/DECISION_2026-08-29_PROCESS_BASELINE.md`.

> **Ask the process owner:** does H0 start at Bagasse Wetting, or at Fibre Weighment with the lab
> checks on Day 1? **Until answered, do not cite the current baseline to the factory as what the
> system believes.**

Related: `docs/KIRO_HANDOVER.md` §3 refers to a second working tree, `mushroomos-alpha`, with
migrations through `0034` and a planned `0035_authoritative_process_2026b.sql`. **This repo has
`0033` and no `0035`, and that tree is not on this machine.** If it exists, it holds work that never
arrived here. **Find out before rebuilding any of it.**

### 3.4 TBD / carried conflicts — do not resolve

The project carries **31 source conflicts and 41 TBDs** in `docs/SOURCE_CONFLICTS.md`, with a
`conflict_register` table and markers rendered at the point of use. New IDs start at **C-37 / TBD-51**.

Live examples the demo will surface, and which are *features*, not defects:

- **C-33** — two lab checkpoint maps (27-row dictation vs 18-row S4b). Both carried; the technician
  chooses and the choice is recorded with the sample.
- **C-29** — the moisture→water/dry decision. `auto_select_enabled = false`; a human chooses.
- **TBD-13 / TBD-36** — no pH or EC band for any fibre phase, so readings return
  *"no spec to judge it against"* rather than a verdict.
- **TBD-21** — rest durations are Day-0 configurable, **mandatory, and have no default**.
  `validate_batch` refuses activation while any is null.
- **Turner T2** — `6–8 h` in the database; the newest source says the duration is unknown. Flagged
  until the factory answers.

---

# 4 · EXISTING UI

All 19 routes exist and work. `RoleGuard` wraps each; role decides the shell, not the device.

| Route | File | Lines | Roles | Verdict |
|---|---|---|---|---|
| `/admin/batch/:id/schedule` | `ScheduleBuilder.tsx` | 1245 | admin, gm, supervisor | KEEP |
| `/batch/:id` (activity list) | `BatchDetail.tsx` | 997 | mgmt | KEEP |
| `/lab/queue` | `LabQueue.tsx` | 704 | lab_tech, supervisor | **FIX** — add `operator` (C3) |
| `/admin/batch/new` | `NewBatch.tsx` | 592 | admin, gm | KEEP |
| (drawer) | `TaskDrawer.tsx` | 555 | ops | KEEP — **renders evidence `<img>`** |
| `/admin/process-explorer` | `ProcessExplorer.tsx` | 491 | mgmt | KEEP |
| `/operator/my-work` | `MyWork.tsx` | 439 | ops | KEEP |
| `/dev/gallery` | `Gallery.tsx` | 432 | all | KEEP (dev only) |
| `/supervisor/control-room` | `ControlRoom.tsx` | 431 | supervisor, gm | KEEP |
| `/batch/:id` (story) | `BatchPage.tsx` | 402 | mgmt | **REFACTOR** — demo centrepiece |
| `/admin/schedule` | `MonthlySchedule.tsx` | 346 | mgmt | KEEP |
| `/gm/control-tower` | `ControlTower.tsx` | 253 | mgmt | **REFACTOR** → Factory Now |
| `/plant` | `Plant.tsx` | 239 | mgmt | **REFACTOR** → extract Resource Map |
| `/admin/today` | `AdminToday.tsx` | 223 | mgmt | KEEP |
| `/sign-in` | `SignIn.tsx` | 203 | — | KEEP |
| `/admin/reference` | `ReferenceData.tsx` | 201 | mgmt | KEEP |
| `/admin/batches` | `Batches.tsx` | 121 | mgmt | KEEP |
| `/manager/resources` | `Resources.tsx` | 110 | manager, admin, gm | **REFACTOR** |
| `/pending` | `Pending.tsx` | 37 | — | KEEP |

### Components to reuse — do not rebuild these

`HourRail` (192) · `Narrative` (313, prose causality, genuinely good) · `EventStream` (188) ·
`MovementPlan` (400) · `StaircaseCalendar` (233) · `ExceptionBand` (100) · `FiveLayerNode` (183) ·
`PlayheadContext` (75, shared playhead — `Shift+←/→`) · `TimeLabel` · `HumanDuration` ·
`primitives/index.tsx` (396) · `geometry.ts` (360).

### FIX — four clock leaks

`src/lib/now.ts` is the single source of now. These four still call the browser directly and will
show the wrong time whenever the dev clock is set (`Gallery.tsx` is dev-only, ignore it):

- `src/api/controlRoom.ts:211`
- `src/routes/MonthlySchedule.tsx:18`
- `src/routes/MyWork.tsx:225`
- `src/routes/NewBatch.tsx:53`

---

# 5 · DEMO REQUIREMENTS

The stakeholder demo must show, in order:

```
Batch → HP1 → 1h rest → Lab eligibility → Lab test → Lab result
     → Manager approval → HP2 branch (dry|watered) → downstream
     → parallel operations → delay → forecast impact
     → resource view → management view
```

Mapped to what exists:

| Step | Exists? | Gap |
|---|---|---|
| Batch | ✅ `MB-DEMO-EARLY/MID/LATE`, staged | — |
| HP1 | ✅ `FIB1-HOP-1` + gate | — |
| **1 h rest** | ❌ | **BUILD** — TASK-002 |
| Lab eligibility | ✅ gate + `v_lab_queue` | gated on rest once TASK-002 lands |
| Lab test | ✅ `LabQueue`, `open_lab_sample`, `record_lab_result` | operator access (C3) |
| Lab result | ✅ immutable, versioned, retest chain | — |
| **Manager approval** | ⚠️ backend complete, UI thin | **BUILD** — TASK-004 |
| HP2 branch | ✅ `activity_variant` WATER/DRY | surface the choice — TASK-005 |
| Downstream | ✅ full 552 h chain | — |
| **Parallel operations** | ⚠️ data only | **BUILD** — TASK-006 |
| Delay | ✅ deviations, `raise_deviation` | — |
| **Forecast impact** | ❌ nothing | **BUILD** — TASK-007, the hardest |
| Resource view | ⚠️ `Plant` exists | **REFACTOR** — TASK-008 · **see §14** |
| Management view | ⚠️ `ControlTower` exists | **REFACTOR** — TASK-009 |

---

# 6 · DEMO UI

Nine screens. Six exist in some form.

| Screen | Base | Work |
|---|---|---|
| **Factory Now** | `ControlTower.tsx` | Attention stream + resource map, one page |
| **Batch Detail** | `BatchPage.tsx` | Rail + graph + lanes on one playhead |
| **Process Timeline / Rail** | `HourRail.tsx` | Add FORECAST as a real 4th register, not a dashed tail |
| **Operator Workspace** | `MyWork.tsx` + `TaskDrawer.tsx` | Largely done |
| **Lab Workspace** | `LabQueue.tsx` | Add operator access; show the rest countdown |
| **Manager Approval** | — | New; backend exists (`checkpoint_package`) |
| **Parallel Operations** | — | New; `stream` → concurrent lanes |
| **Delay / Causality** | `Narrative.tsx` | Visual chain + H552 impact |
| **Resource View** | `Plant.tsx` | Extract to a component both lenses use |

**Four time registers must never collapse into one "hour":**
`STANDARD POSITION` → `ADMIN BATCH PLAN` → `ACTUAL` → `FORECAST`. `v_activity_timing` already
returns the first three side by side.

**No percentage-complete.** Half the process is resting and rest does not compress. Position on the
axis is the honest indicator.

---

# 7 · DATA MAPPING

| Feature | Table(s) | RPC / View | API module | Component |
|---|---|---|---|---|
| Batch list | `master_batch` | `v_live_batch` | `batches.ts` | `Batches` |
| Batch story | `batch_activity` | `v_activity_timing`, `v_batch_event` | `batchPage.ts` | `HourRail`, `EventStream`, `Narrative` |
| Activity state | `batch_activity` | `evaluate_gates`, `advance_batch`, `render_gate_reason` | `batch.ts` | `BatchDetail` |
| Operator task | `batch_activity`, `batch_activity_value` | `start_activity`, `submit_activity`, `hold_activity` | `batch.ts` | `MyWork`, `TaskDrawer` |
| Evidence | `evidence_media`, `evidence_requirement` | `bind_evidence`, `can_capture_for_activity`, `v_evidence_state` | `batch.ts` (`createSignedUrl`) | `TaskDrawer` |
| Lab queue | `lab_sample`, `lab_test`, `lab_result` | `v_lab_queue`, `v_lab_result_current`, `v_lab_checkpoint_map` | `lab.ts` | `LabQueue` |
| Lab submit | `lab_result` | `open_lab_sample`, `request_lab_test`, `record_lab_result`, `decide_lab_submission`, `order_retest` | `lab.ts` | `LabQueue` |
| **Approval** | `management_checkpoint` | `checkpoint_package`, `record_checkpoint_decision`, `v_checkpoint_status`, `GM_APPROVAL` gate | **none — GAP** | **none — GAP** |
| HP2 branch | `activity_variant` | — (`auto_select_enabled=false`) | `processDefinition.ts`, `schedule.ts` | **surface — GAP** |
| **Parallel ops** | `batch_activity.stream` | `v_stream_variance` | `batchPage.ts` | **none — GAP** |
| Delay | `deviation`, `corrective_action` | `raise_deviation`, `accept_with_deviation`, `escalate_deviation`, `v_deviation_open` | `controlRoom.ts` | `ExceptionBand` |
| Causality | `batch_activity` | `v_batch_variance`, `v_stream_variance`, `v_variance_contributor` | `batchPage.ts` | `Narrative` |
| **Forecast** | **none** | **none** | **none** | **none — BUILD** |
| Resources | `location`, `machine`, `batch_vessel_allocation`, `location_occupancy`, `machine_usage` | `v_plant_now`, `v_vessel_availability`, `v_machine_utilisation`, `allocate_vessel`, `release_vessel` | `plant.ts` | `Plant` |
| Clock | `dev_effective_clock`, `factory_clock` | `get_effective_now`, `set_dev_clock_h`, `play/pause_dev_clock` | `lib/now.ts` | `PlayheadContext` |

**Genuine gaps: forecast, approval UI, parallel-ops UI.** Everything else is wiring.

---

# 8 · IMPLEMENTATION PLAN

Ordered. Each task is independently demoable. **Stop at the end of each and report.**

---

### TASK-001 · Operator can perform lab (C3) + lab duration (C5)
- **Goal** — honour two confirmed rules.
- **Files** — `src/App.tsx:179`; `supabase/seed/s08_routing_lab_activities.sql`.
- **Changes** — add `'operator'` to the `/lab/queue` `RoleGuard`. Check RLS actually permits it —
  if the policy blocks operators, that is a migration, not a guard change. Change lab
  `duration_target_max_hr` from `1` to the 30–40 min figure.
- **Depends on** — nothing.
- **Acceptance** — `operator@freshbowl.demo` opens `/lab/queue` and can record a reading.
- **Test** — extend `tests/labUi.test.ts`; `npx vitest run --no-file-parallelism tests/lab*.test.ts`.

---

### TASK-002 · The 1-hour HP1 rest before lab eligibility (C7) — **highest process value**
- **Goal** — `LAB-FIB-MOISTURE-1` must not be READY until 1 h after `FIB1-HOP-1` finishes.
- **Files** — new migration `0034_hp1_rest_gate.sql`; possibly `supabase/seed/s08`.
- **⚠ Read before designing** — `ELAPSED_TIME` measures from **`actual_start`**
  (`0016_recorded_actuals.sql:53`). C7 is *1 h after HP1's **end***. Those are different.
  Two candidate shapes:
  - **(a)** an `ELAPSED_TIME` entry gate on the lab check, extended to measure from a predecessor's
    `actual_end`; or
  - **(b)** a distinct rest activity between them, consistent with existing `*-REST-*` rows.
  **(b) is more consistent with how every other rest in this system is modelled.**
  **PROCESS-OWNER QUESTION:** is the hour a *rest of the material* (an activity) or a *measurement
  delay* (a gate)? Ask before choosing. **Do not invent the duration** — 1 h is confirmed; anything
  else is not.
- **Depends on** — nothing.
- **Acceptance** — HP1 submitted → lab check is `WAITING_TIME` with a countdown naming the reason →
  READY after 1 h of **server** time. A phone set forward does not open it.
- **Test** — new spec beside `tests/gates.test.ts`.

---

### TASK-003 · Lab Workspace shows why it is waiting
- **Goal** — the technician sees the countdown and the reason, not an empty queue.
- **Files** — `src/routes/LabQueue.tsx`, `src/api/lab.ts`.
- **Changes** — surface `WAITING_TIME` with `render_gate_reason` text and a live countdown off
  `nowMs()`.
- **Depends on** — TASK-002.
- **Acceptance** — the demo can stand at the rest window and the screen explains itself.

---

### TASK-004 · Manager Approval screen
- **Goal** — the approval that holds the tunnel becomes visible and actionable.
- **Files** — new `src/routes/Approvals.tsx`, new `src/api/approvals.ts`, route in `App.tsx`.
- **Changes** — read `checkpoint_package` / `v_checkpoint_status`; write via
  `record_checkpoint_decision`. **Do not invent an approval model — it exists.**
- **Depends on** — nothing.
- **Acceptance** — a `GM_APPROVAL` gate fails naming its checkpoint; a recorded approval opens it;
  a return does not. `tests/checkpoints.test.ts` already asserts the backend half.

---

### TASK-005 · HP2 dry/water branch, surfaced
- **Goal** — show the lab result driving a human choice.
- **Files** — `src/routes/TaskDrawer.tsx`, `src/api/batch.ts`.
- **Changes** — render `activity_variant` WATER/DRY for `FIB1-HOP-2`, showing the moisture reading
  that informs it. **`auto_select_enabled = false` — a human chooses. Do not auto-select.**
- **Depends on** — TASK-001.
- **Acceptance** — operator picks WATER or DRY; the choice is recorded and appears in the event trail.

---

### TASK-006 · Parallel Operations view (C9)
- **Goal** — concurrent streams drawn as concurrent, not as a list.
- **Files** — new `src/components/composite/ParallelLanes.tsx`; used by `BatchPage`.
- **Changes** — group `batch_activity` by `stream`, one lane each, on the shared `PlayheadContext`.
  Reuse `geometry.ts`. **Component takes props — it must not import `api/`** (enforced by test).
- **Depends on** — nothing.
- **Acceptance** — fibre, straw, nitrogen and the three pile chains render as parallel lanes; the
  three piles are visibly independent (no global T2 barrier).

---

### TASK-007 · Forecast register + delay propagation — **hardest, do last**
- **Goal** — a delay moves a projected finish, and the H552 impact is visible.
- **Files** — new migration; `HourRail.tsx`; `src/api/batchPage.ts`.
- **Changes** — forecast as a real fourth register beside STANDARD/PLAN/ACTUAL. **A new record
  beside the existing ones — do not overwrite planned or actual.**
- **⚠** — the honest projection basis is a **PROCESS-OWNER QUESTION**. Do not invent a model
  (worst-stream? critical path? rest-aware?). Ask. Note rest does not compress, so naive
  extrapolation is wrong.
- **Acceptance** — raise a deviation → forecast finish moves → the delta against H552 is shown and
  traceable to the deviation.

---

### TASK-008 · Resource Map component + capacity fix
- **Goal** — one resource component both lenses use; a plant that is not 100 % full.
- **Files** — extract from `Plant.tsx`; **and resolve §14**.
- **Acceptance** — free and occupied vessels both visible; `hourlyPlan.test.ts` passes untouched.

---

### TASK-009 · Factory Now
- **Goal** — the management landing screen.
- **Files** — `ControlTower.tsx` + unify `ExceptionBand` with `ControlRoom`'s bands.
- **Acceptance** — attention stream ordered by wait, naming who is waited on, plus the resource map.

---

### TASK-010 · Demo reset + end-to-end rehearsal
- **Goal** — the demo can be run twice.
- **Files** — a **non-destructive** reset script. **Must not be another `delete from master_batch`.**
- **Acceptance** — reset → full §11 walkthrough → reset → identical result.

---

# 9 · OPEN QUESTIONS — ask, do not assume

1. **Where does H0 start?** (§3.3) — blocks any hour-axis work.
2. **Is the 1-hour HP1 rest an activity or a gate?** (TASK-002)
3. **What is the forecast basis?** (TASK-007)
4. **Does `mushroomos-alpha` still exist**, and does it hold migrations `0034`/`0035`?
5. **Exact lab duration** — 30, 40, or a range? Seeds currently say 30–60.
6. **Which lab checkpoint map is authoritative?** (C-33 — currently the technician chooses per sample)
7. **Moisture threshold for the water/dry decision** — none is seeded; the human decides.
8. **Turner T2 duration** — `6–8 h` in the DB, "unknown" in the newest source.
9. **Rest durations** — Day-0 configurable with no default (TBD-21). Who answers, per batch?
10. **pH / EC bands** — none exist for any fibre phase (TBD-13/36). Readings return no verdict.
11. **Is "Delayed" a status somebody sets, or derived?** The workflow doc lists it; the system derives it.
12. **Bunker capacity** — 11 bunkers, 3 per batch. Four concurrent batches do not fit. Real constraint?
13. **Should the 8 leftover draft batches be deleted?**
14. **Should the 3 lost pre-A2 cancelled batches be written off?** (their tests fail honestly)

---

# 10 · CONFIRMED DECISIONS

| Date | Decision |
|---|---|
| 29 Aug 2026 | **Committed repo is the implementation baseline.** The live DB's 8-row divergence is *not* ported; it is recorded as an open process-owner question and preserved as replayable SQL. |
| 29 Aug 2026 | **Web demo first.** The process owner tests it personally before packaging. |
| 29 Aug 2026 | **APK is Phase 2**, deferred until the web demo is approved. Keep Capacitor-compatible; build no APK. |
| 29 Aug 2026 | **The 3 pre-A2 test failures stay failing.** Fabricating cancelled history is forbidden. |
| 29 Aug 2026 | `s03_process_2026b.sql` clears derived hours before upsert, so the seed set is genuinely re-runnable as documented. |
| 23 Aug 2026 | Four independently recorded Day-1 lab checkpoints (C-33 carried, not resolved). |
| 23 Aug 2026 | Incoming material testing is a pre-batch prerequisite; **not** moved into the H0 clock (`0032`). |
| 22 Aug 2026 | Factory clock is `Asia/Kolkata`, no DST (TBD-50 closed). |
| — | T1→T2 is same pile (`SAME_SCOPE_INSTANCE`). **No global T2 barrier.** |
| — | Tunnel timeline seeded `TN-LOAD` H360 → `TN-HOLD` H384 → `TN-UNLOAD` H528. |
| — | Chairman is the seventh role; home is Control Tower. |

---

# 11 · DEMO SCRIPT (5–10 minutes)

**Before:** confirm the dev clock, and that the three `MB-DEMO-*` batches are active and staged.

**1 · The operator has real work — 90 s.** Sign in `operator@freshbowl.demo` / `mushroom2026`.
Open a weighment load. Point at `EVIDENCE · 0 / 1` and the button reading *"Submit · 1 evidence
item(s) outstanding"*. **Say:** the button is not disabled to be difficult — the server refuses a
short submission whatever the button does. The photograph is uploaded first, then bound to the named
requirement, *because a record of a photograph that is not in storage would be a false record*.

**2 · HP1, then the wait — 60 s.** Submit Hopper Pass 1. The lab check does not open. It shows the
rest countdown and says why. **Say:** that timer is the server's. A phone set forward does not open
a gate. *(Needs TASK-002.)*

**3 · The lab records something nobody can quietly change — 2 min.** Sign in as lab (or operator —
C3). Take a sample: two source maps are offered because the sources disagree, and the choice is
recorded with the sample. Record moisture. It returns *"no spec to judge it against"* and
*"calibration unknown"*. **There is no edit button** — a wrong reading is corrected by a retest that
names its reason and keeps v1. **Say:** the system did not pass it and did not fail it, because
nobody has decided the band.

**4 · The decision — 60 s.** The moisture result decides WATER or DRY on Hopper Pass 2. A human
picks; the system does not (`auto_select_enabled = false`). *(TASK-005.)*

**5 · Approval holds the tunnel — 60 s.** Sign in as gm. The tunnel load fails its `GM_APPROVAL`
gate, naming the checkpoint it waits on. Approve; it opens. Return; it does not. *(TASK-004.)*

**6 · Why is this batch late — 2 min.** Control Tower → the batch page. Read the paragraph aloud:

> *MB-DEMO-LATE is Xh behind plan, on the slowest stream — the one that sets the batch. The largest
> single piece came from … and no reason was recorded for it.*

**Say:** every fact in that sentence is a database row. Nobody wrote it. *"And no reason was
recorded for it"* is the sentence that makes someone go and ask.

**7 · One playhead — 30 s.** Press `Shift + ←`. Rail, event stream and paragraph move together —
one position, three views. Show the parallel lanes: three pile chains advancing independently.

**Say before anyone asks:** *"Why does it keep saying it doesn't know?"* — because the source
documents disagree in 31 places, and a number that looks confident and is wrong costs more than a
number that says it is disputed. *"Why no percentage complete?"* — half the process is resting, and
rest does not compress.

---

# 12 · TESTING PLAN

- `npx vitest run --no-file-parallelism` — **the flag is required**; the suite shares one Supabase
  project and contends on the pooler without it. ~12 minutes.
- **Baseline is 434 passing / 5 failing.** Any new failure is yours.
- Two architectural tests you must not break: nothing below `routes/` imports `api/`; no process-length
  literal in code.
- After each task: `npm run typecheck` → targeted tests → full suite before reporting.
- **Do not make a test pass by changing what it asserts** unless the process owner has changed the
  rule. Say so explicitly if you do.
- Manual: `npm run dev`, all six logins, password `mushroom2026` (lowercase).

---

# 13 · KNOWN BLOCKERS

| Blocker | Impact | Status |
|---|---|---|
| **H0 start unresolved** (§3.3) | Any hour-axis or pre-H0 work | **Ask the process owner** |
| **No forecast model** | TASK-007, and the demo's "forecast impact" beat | Needs a decision on basis |
| **Bunker capacity exhausted** (§14) | Resource view looks wrong; 1 test fails | Fix in TASK-008 |
| **Android toolchain absent** | No APK on this machine | **Deferred to Phase 2 — do not work on it** |
| **3 pre-A2 batches deleted** | 3 permanent honest test failures | Written off unless the owner says otherwise |
| **`mushroomos-alpha` unknown** | May contain `0034`/`0035` | Find out |
| Shared DB, no isolation | Two agents running tests corrupt each other | Coordinate |

---

# 14 · THE CAPACITY PROBLEM — read before the demo

**Every bunker and every tunnel is currently allocated. Zero free.**

| Batch | Bunkers | Tunnels |
|---|---|---|
| `MB-2026-366-368` | 3 | 3 |
| `MB-DEMO-EARLY` | 3 | 3 |
| `MB-DEMO-LATE` | 3 | 3 |
| `MB-DEMO-MID` | **2** (pool ran out) | 3 |

The factory has **11 bunkers and 12 tunnels**. `MB-2026-366-368` is a **stale leftover dev batch**
that is still `active` and holding 3 + 3 while contributing nothing.

**Consequence:** the Plant/Resource screen shows a completely full factory, `MB-DEMO-MID` is
short a bunker, and `hourlyPlan.test.ts` cannot find a free vessel.

**Recommended (a decision, not done):** cancel or release `MB-2026-366-368` via `cancel_batch` /
`release_vessel` — engine operations, not deletions. That frees 3 bunkers and 3 tunnels, fixes the
test honestly and makes the resource view demo-credible.

**Do not simply run `allocate-vessels.mjs` again** — it allocates every slot every active batch
needs and will exhaust the pool.

---

# 15 · OPENCODE HANDOVER

### Read first, in this order
1. This document.
2. `CLAUDE.md` — the standing brief. **Ten rules that are never suspended.**
3. `docs/DECISION_2026-08-29_PROCESS_BASELINE.md` — why the DB looks as it does.
4. `README.md` — restore procedure and the destructive-script warning.
5. `docs/TIME_CONTRACT.md` — normative, frozen.
6. Only then: `docs/UI_PRODUCT_SPEC_V2.md`, `docs/CANONICAL_MUSHROOMOS_ARCHITECTURE.md`.

> `docs/PROCESS_2026B_AUTHORITATIVE_MATRIX.md` and `docs/KIRO_HANDOVER.md` describe a model the code
> **does not implement.** Both carry a banner. Read them as the open proposal.

### What already works — do not rebuild
The process engine, gates, cardinality, the lab module, evidence capture + storage + rendering,
approvals (backend), resources and occupancy, variance and causality, auth and RLS, the clock, the
monthly schedule, and all 19 routes.

### What not to touch
- `supabase/migrations/0001`–`0033` — **forward-only.** New work is `0034+`.
- The layering rule and the no-literals rule. Both are enforced by tests.
- The 8 divergent rows (§3.3) without the process owner.
- `demo-prep.mjs` / `demo-stage.mjs` — they delete every batch.
- Anything Android.

### Implement in this order
**TASK-001 → 002 → 003 → 004 → 005 → 006 → 008 → 009 → 007 → 010.**
(007 last: it is the hardest and needs a decision first. 008 early enough that the resource view is
credible.)

### How to run
```bash
cd mushroomos
npm install
npm run dev          # localhost:5173
```
Logins: `admin@` `gm@` `supervisor@` `operator@` `lab@` `manager@` — all `@freshbowl.demo`,
password `mushroom2026` (**lowercase**). Role decides the screens, not the device.

### How to test
```bash
npm run typecheck
npx vitest run --no-file-parallelism
```
Baseline **434 / 5**. If the database looks wrong:
`npm run db:migrate` → `npm run db:seed` → `node scripts/allocate-vessels.mjs` →
`node scripts/stage-history.mjs`. **Never repair by hand-writing tables.**

### Demo is complete when
The §11 walkthrough runs start to finish, twice, without a manual database fix; every number on
screen traces to a row; nothing invented is presented as factory truth; typecheck and build are
clean; and no test regressed past the 5 known failures.

---

# 16 · SUMMARY

**KEEP** — process engine · gates · cardinality · lab module · evidence (capture, storage **and**
rendering) · approvals backend · resources and occupancy · variance and causality · `Narrative` ·
auth/RLS · `lib/now.ts` · monthly schedule · all 19 routes · every composite component.

**REFACTOR** — `ControlTower` → Factory Now · `Plant` → extractable Resource Map · `BatchPage` →
rail + graph + lanes on one playhead · `HourRail` → forecast as a real register · `ExceptionBand` +
`ControlRoom` bands → one attention stream.

**BUILD** — the 1-hour HP1 rest (C7) · Manager Approval screen · Parallel Operations lanes ·
Forecast register and delay propagation · HP2 branch surfacing · non-destructive demo reset.

**FIX** — operator access to lab (C3) · lab duration 30–40 min (C5) · 4 browser-clock leaks ·
bunker capacity (§14) · 2 fixable test failures (§1).

**OPEN QUESTIONS** — 14 in §9. The blocking three: **where H0 starts**, **rest-as-activity-or-gate**,
**forecast basis**.

**KNOWN BLOCKERS** — §13.

### FIRST OPENCODE TASK

> **TASK-001.** Add `'operator'` to the `/lab/queue` `RoleGuard` in `src/App.tsx:179`, verify the
> RLS policy actually permits an operator to open a sample and record a result (if not, that is a
> `0034` migration, not a guard change), and correct the lab activity `duration_target_max_hr` in
> `supabase/seed/s08_routing_lab_activities.sql` from `1` to the confirmed 30–40 minute figure.
>
> Then run `npm run typecheck` and
> `npx vitest run --no-file-parallelism tests/lab.test.ts tests/labUi.test.ts`, and **report before
> starting TASK-002.**
