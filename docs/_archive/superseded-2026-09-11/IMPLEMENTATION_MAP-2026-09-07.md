# IMPLEMENTATION MAP — MushroomOS

**One structured inspection, 7 Sep 2026. This is the working map. Do not re-derive it.**

Sources read once: `MushroomOS_MASTER_PRD_CLAUDE_CODE_BUILD.md`, `docs/01-process/STANDARD.md`,
`docs/01-process/schedule.json`, `docs/01-process/lab_checkpoints.json`,
`docs/03-mission/{TASK-BOARD,FINDINGS}.md`, the deployed database (probed, not read from
migration files), and `mushroomos/src`.

---

## 1 · CURRENT ARCHITECTURE

```
mushroomos/                  Vite 6 · React 18 · TS 5.7 · Tailwind 3 · React Router 6
  src/api/*.ts               the ONLY place supabase is called. RPC in, typed row out.
  src/routes/*.tsx           one screen per route, every one lazy()
  src/components/            primitives · layout (AppShell | FieldShell) · composite · node
  src/domain/                contracts · types · time · cardinality (client mirror of the DB rule)
  supabase/migrations/       0001-0041, forward-only, applied through scripts/db.mjs
  supabase/seed/             s01-s11, idempotent
  tests/                     vitest, ~35 files, hits the real database over pg
```

**Backend is the authority and already is.** 80 tables/views + ~90 project functions deployed.
Reads go through `v_*` views; writes go through `SECURITY DEFINER` RPCs with `assert_role`.
RLS is on. The shell is chosen by role, not by URL. Auth is real Supabase auth with a JWT role
claim and a `profiles` fallback for routing only. **There is no localStorage auth and no
client-only gate to remove** — that was fixed before this session (findings F3/F6).

**The deployed database is live and reachable** from `.env.local` (session pooler, ap-southeast-1).

## 2 · EXISTING ROUTES

| Route | Screen | Surface | Verdict |
|---|---|---|---|
| `/sign-in` | `SignIn` | all | reuse |
| `/admin/today` | `AdminToday` | Admin | reuse, extend |
| `/admin/batches` | `Batches` | Admin | reuse |
| `/admin/batch/new` | `NewBatch` (7-step wizard) | Admin | **reuse — Slice 1 lands here** |
| `/admin/batch/:id/schedule` | `ScheduleBuilder` (1245 ln) | Admin | keep, do not extend — manual editor |
| `/batch/:id` | `BatchPage` | Admin/Mgmt | reuse — Slice 6 lands here |
| `/plant` | `Plant` | Admin | reuse |
| `/admin/process-explorer` | `ProcessExplorer` | Admin | reuse |
| `/admin/reference` | `ReferenceData` | Admin | reuse |
| `/admin/schedule` | `MonthlySchedule` | Admin | reuse |
| `/operator/my-work` | `MyWork` + `TaskDrawer` | Supervisor/Operator | **reuse — Slice 2** |
| `/lab/queue` | `LabQueue` (704 ln) | Laboratory | **reuse — Slice 4** |
| `/supervisor/control-room` | `ControlRoom` | Supervisor | reuse |
| `/gm/control-tower` | `ControlTower` | Mgmt | supporting |
| `/manager/resources` | `Resources` | Mgmt | supporting |
| `/dev/gallery` | `Gallery` | dev only | leave |

Missing route: **extension request / approval** (`MGMT-001`) — Slice 6.

## 3 · EXISTING API (`src/api/`)

`batch.ts` (534 ln — planning + execution + evidence, the collision file) · `batches.ts` ·
`batchPage.ts` · `lab.ts` · `processDefinition.ts` · `schedule.ts` · `adminToday.ts` ·
`controlRoom.ts` · `tower.ts` · `plant.ts` · `movements.ts` · `monthlySchedule.ts` ·
`client.ts` (the single Supabase client).

RPCs already wired: `create_master_batch` · `generate_activity_plan` · `activate_batch` ·
`set_batch_start_at` · `factory_instant` · `start_activity` · `submit_activity` ·
`bind_evidence` · `release_elapsed_rests` · the lab set.

## 4 · EXISTING DATABASE ACCESS

**Deployed, probed 7 Sep.** Key shapes:

- `process_definition` — `code · version · status(draft|published|archived) · total_days`,
  `baseline_hours` **GENERATED `(total_days+1)*24`** ← finding F7.
- `process_activity` — `stream · rel_day · seq · scope · cardinality_rule(jsonb) ·
  duration_target_{min,max}_hr · standard_start_hour · standard_end_hour ·
  standard_hour_source('factory_stated'|'derived_from_rel_day') · responsible_role · lab_parameters`.
  Constraint `rel_day = standard_start_hour / 24`. **Both hour columns are `int`.**
- `master_batch` — `code · process_definition_id · start_date · start_at · status · config(jsonb)
  · activated_at`.
- `batch_activity` — plan (`planned_start_at/end_at`, `baseline_{start,end}_hour`), actual
  (`actual_start/end`, `actual_recorded_at`), `state` (14 values), `blocked_reason`,
  `variance_minutes`, `assigned_machine_id`, `scope_label`.
- Lab: `lab_checkpoint · lab_sample · lab_test · lab_result · lab_spec · lab_approval_reading`
  + `v_lab_queue · v_lab_result_current · v_lab_result_history · v_checkpoint_status`.
- Evidence: `evidence_requirement -> batch_activity_evidence_req -> evidence_media` with
  `superseded_by_id`. Supabase Storage bucket behind `bind_evidence`.
- Authorization: `extension_request` + `v_extension_request` + `request_extension` /
  `manager_decide_extension` / `gm_decide_extension`.
- Gates: `gate_rule` + `evaluate_gates` + `render_gate_reason`.

**Data content (the gap):** the only published definition is **`PROCESS-2026B`, 552 h,
54 activities**. `ROUTE-2026A` is archived. **`PROCESS-2026C` does not exist in the database.**

## 5 · EXISTING COMPONENTS

`primitives/index.tsx` (396 ln — buttons, cards, skeletons, badges) · `layout/AppShell`
(desktop nav) · `layout/FieldShell` (mobile, one-hand) · `layout/PageHeading` ·
`composite/{HourRail, StaircaseCalendar, EventStream, ExceptionBand, MovementPlan, Narrative}` ·
`node/FiveLayerNode` · `domain/{TimeLabel, HumanDuration, PlayheadContext}`.
`theme/tokens.css` + `05-ui/VISUAL-LANGUAGE.md` are the design language. **Keep all of it.**

## 6 · EXISTING FIXTURES

`src/fixtures/index.ts` (dev Gallery only) · `supabase/seed/s01-s11` ·
`scripts/{stage-history,demo-prep,demo-stage,setup-demo-showcase}.mjs`.
Demo batches `MB-DEMO-{EARLY,MID,LATE}` are referenced by tests but **not currently present** —
32 tests fail on that alone (`ARCH-011`).

## 7 · WHAT CAN BE REUSED

Everything structural. Specifically:

- The whole write path: RPC + `assert_role` + RLS + `fn_plan_is_frozen` + `trg_plan_is_frozen`.
- The **hour axis** (`0011`) and the **hourly plan** (`0027`) — plan generation is already
  hour-based, not day-based, and already separates STANDARD / PLAN / ACTUAL / FORECAST.
- The batch creation wizard, the My Work + TaskDrawer pair, the Lab queue, the evidence binder.
- `evaluate_cardinality` — six rule kinds, no literal counts. The Turner's 6 piles and the
  bunkers' 3 lines come out of it without new code.
- The four-number extension register (`0036`), tested, unsurfaced.
- The visual language and both shells.

## 8 · WHAT IS STALE

| Stale | Where | Action |
|---|---|---|
| **PROCESS-2026B / 552 h is the only published process** | database + `s03` | Seed PROCESS-2026C beside it. **Do not edit 2026B** — batches were generated from it. |
| `baseline_hours` generated as `(total_days+1)*24` — cannot hold 470 | `process_definition` | Apply drafted `0041`: `envelope_hours` + `v_process_envelope`. |
| Hour columns are `int` — the Turner runs on half hours (H175.5) | `process_activity`, `batch_activity` | Widen to `numeric`; `rel_day = floor(hour/24)`. |
| Lab checkpoint set is the old `LAB_DICTATION`/`S4B_COLUMNS` maps, not LAB-2026A's 25 | `lab_checkpoint` | Add the `LAB-2026A` checkpoint map. Do not delete the old ones. |
| Turner rule: no `T2 = T0 + 24 h` anywhere — good; but **no Turner activities exist at all** | — | Slice 1 seeds `TRN-P{1..6}-T{0..3}` with the `T1 end + 8 h` rest. |
| Lab tests after T0 / T2 / T3 | not implemented — correct | keep absent (`lab_checkpoints.json.absent[]`). |
| `actual_start`/`actual_end` overwritable via `submit_activity` | `0016` | `ARCH-001` — closed in Slice 2. |
| `send_alert` has no role guard | `0009` | `ARCH-009` — one line, folded into Slice 6. |
| Old APK (`MushroomOS-extracted/`, `apk_extracted/`) | repo root | **visual reference only**, never imported. |

## 9 · WHAT IS MISSING

1. **PROCESS-2026C itself** — definition, 15-activity main rail, 4 paddy, 2 nitrogen,
   24 Turner pile-passes, 3 bunker streams x 5 steps, 6 tunnel phases, 3 discharges.
2. **The LAB-2026A checkpoint set** — 25 checkpoints, 4 gates, 1 decision, per-pile
   `LAB-T1-PRE` / `LAB-T1-POST`.
3. **Gate bindings from lab checkpoint to activity code.** `lab_checkpoints.json` deliberately
   supplies `blocks_activity_code: null` — the real codes come from `process_activity`, and
   they do not exist until (1) lands.
4. **The seven LAB-2026A evidence kinds** (`LOT_PHOTO`, `WEIGHMENT_SLIP`, `SAMPLE_PHOTO`,
   `BEFORE_PHOTO`, `HEIGHT_PHOTO`, `TUNNEL_PHOTO`, `AFTER_PHOTO`) as evidence requirements.
5. **Before/after photo pair on every physical activity** (2 per task; 48 across the Turner).
6. **Extension request + approval UI** (`MGMT-001`).
7. **Actual-immutability trigger** (`ARCH-001`).
8. Proof that evidence upload -> storage -> retrieval works end to end (all 20 tests skip).

## 9a · THE ARCHITECTURE RULING THAT SHAPES ALL OF THIS

**The standard duration is a property of the SOP, not of MushroomOS.** Confirmed by the product
owner, 7 Sep 2026.

```
SOP / PROCESS VERSION
      ↓   its own stages · durations · dependencies · parallel streams · gates
CALCULATED STANDARD DURATION
      ↓   + this batch's H0
BATCH BASELINE — exact planned timestamps
```

Three different things, and the product had been collapsing the first two into
`baseline_hours = (total_days + 1) × 24`. There is no `STANDARD_HOURS = 470` anywhere and there
must never be one. `PROCESS-2026C → 470 h` · `PROCESS-2026B → 536 h` · a future standard → its own
number, all in the same database at once.

Implemented as: `v_process_standard` (what one version's activities compute) → `v_process_envelope`
(the resolver, with the stated envelope beside it and the disagreement visible) →
`v_process_catalogue` (every version + which one is current). The screens read `standard_hr`.

**A batch is measured against the version it was generated from**, never against whatever is
current — `getBatchProcessVersion` in `src/api/process.ts`.

## 10 · FIRST IMPLEMENTATION SLICE

**SLICE 1 — Admin: create batch -> set H0 -> generate plan -> review -> activate, on PROCESS-2026C.**

Blocked on nothing. Everything downstream is blocked on it: there is no 470-hour plan for an
operator to execute, no Turner pass for a photo to attach to, and no activity code for a lab
gate to name.

Order inside the slice:
1. Apply `0040` (confidence class) and `0041` (envelope hours) — drafted, additive, unapplied.
2. `0042` — widen the hour axis to numeric so H175.5 is representable.
3. `0043` + generator — seed `PROCESS-2026C` v1 from `docs/01-process/schedule.json`,
   mechanically, `standard_hour_source = 'factory_stated'`, envelope 470 h.
4. Prove `create_master_batch -> generate_activity_plan -> activate_batch` on 2026C: the plan
   lands on H0..H474, the Turner has 24 passes, the baseline freezes at activation.
5. `NewBatch`: choose the process version (it currently assumes one published definition), and
   show the generated 470-hour plan in review before activation.

## 11 · FILES EXPECTED TO CHANGE

```
supabase/migrations/0042_half_hour_axis.sql            new
supabase/migrations/0043_process_2026c.sql             new  (generated, checked in)
scripts/gen-process-2026c.mjs                          new  (schedule.json -> SQL)
src/api/processDefinition.ts                           list published definitions
src/api/batch.ts                                       createBatch takes a definition id
src/routes/NewBatch.tsx                                process picker + 470h review
tests/process2026c.test.ts                             new  (the smallest slice-1 check)
docs/implementation/IMPLEMENTATION_MAP.md              this file
```

Later slices, for the record: Slice 2 `MyWork`/`TaskDrawer` + actual immutability (`ARCH-001`) ·
Slice 3 evidence storage proof · Slice 4 `LabQueue` + LAB-2026A checkpoint renderer ·
Slice 5 approval -> gate -> downstream eligibility · Slice 6 variance/extension/forecast
on `BatchPage` + the authorization screen.

---

## 12 · SLICE 1 — DONE, 7 Sep 2026

`tests/process2026c.test.ts` — 10 tests, green. Every expected hour is read from
`docs/01-process/schedule.json`; no hour figure is typed into an assertion.

| Migration | What it does |
|---|---|
| `0040`, `0041` | drafted but never applied. Applied — which is what exposed `0048`. |
| `0042` | hour axis `int` → `numeric`. The Turner runs half hours; 16 of its 24 passes start or end on one. Discovers its own dependent views rather than naming them. |
| `0043` | **PROCESS-2026C**, 69 activities, generated from `schedule.json` by `scripts/gen-process-2026c.mjs`. Adds `FIXED_LABEL` cardinality and `is_hold`. |
| `0044` | **the process catalogue.** Removes the `'PROCESS-2026B'` literal from `create_master_batch`; publishing freezes a definition's activities. |
| `0045` | **the standard is calculated from the SOP's own activities.** `v_process_standard` · `v_process_envelope` · `v_process_catalogue`. |
| `0046` | `make_interval(hours => …)` takes an int and would have truncated every half hour. |
| `0047` | a hold has nobody to assign; `MIX-CM-ADD` belongs to the nitrogen role. |
| `0048` | `set_process_envelope` called `assert_role` with the wrong arity and could never run. |
| `s12`, `s13` | publish 2026C as the current standard; republish 2026B after the seeds that write it. |

Client: `src/api/process.ts` (new) · `getPublishedBaseline` reads the calculated standard per
version · `createBatch` takes a definition id · `NewBatch` has a process picker and a
PROCESS / STANDARD / H0 / BASELINE review.

### Found while building it

| | |
|---|---|
| **PROCESS-2026B's activities compute 536 h, not 552.** | 552 was `(22+1) × 24`. Every screen has been showing a day grid. `0045` makes the two distinguishable; which number is right for 2026B is a factory question, not one to settle here. |
| **`npm run db` could not complete.** | Not caused by this work — the `0011`/`s10` backfills repoint *every* batch, and the F1 freeze correctly refuses an active one, so the run stopped on any database with a live batch. Scoped to draft batches. It now runs 48 migrations + 14 seeds clean. |
| **`0041`'s `set_process_envelope` was dead code.** | Wrong `assert_role` arity. Invisible because 0041 had never been applied — a migration that has never run is a hypothesis. |
| **A hardcoded `H240` tunnel-planning deadline lived in `NewBatch.tsx`.** | No process version states it. Removed. |

---

## 13 · BACKEND COMPLETION MISSION — B1..B7, 7 Sep 2026

Frontend out of scope. The spine, proved against the deployed database and real storage.

| | | migrations | proof |
|---|---|---|---|
| **B1** | Actuals append-only, server-stamped | `0049`, `0050` | `tests/execution.test.ts` |
| **B2** | Turner T2 = that pile's own T1 end + 8 h | `0051` | same |
| **B3** | LAB-2026A · 25 checkpoints · 41 lab activities | `0052`, `0053` | `tests/evidence2026c.test.ts` |
| **B4** | lab → approval → gate → downstream | `0054` | `tests/labGates.test.ts` |
| **B5** | photo → storage → metadata → retrieval | `0055` | `tests/evidence.test.ts` (HTTP) |
| **B6** | variance · extension · forecast | `0056` | `tests/forecast.test.ts` |
| **B7** | role enforcement, probed adversarially | `0057`, `0058`, `0059` | `tests/roleEnforcement.test.ts` (HTTP) |
| — | the whole journey, composed | — | `tests/acceptance.test.ts` |

### The contracts a frontend consumes

```
v_process_catalogue     every process version + its OWN calculated standard
v_my_work               plan · actual · state · why blocked · outstanding evidence
v_lab_queue             the technician's queue
v_lab_gate              which checkpoint holds which production activity
v_gate_rest_rule        the Turner's rest, as data
v_activity_forecast     plan · extension · authorised · actual · forecast, per activity
v_batch_forecast        the same five for the batch, + exposure
v_actual_history        was this always the finish time, or was it changed?
v_extension_request     the authorisation trail
v_unguarded_writer      which SECURITY DEFINER functions name no role
```

### What the mission found that reading could not

- **58 `SECURITY DEFINER` functions executable by `anon`.** RLS was working and irrelevant —
  `SECURITY DEFINER` bypasses it, so the grant was the whole boundary.
- **An operator could create a master batch** over HTTP.
- **PROCESS-2026C's evidence gated nothing** — 150 requirements marked `gates_submission`, and not
  one `EVIDENCE_COMPLETE` rule to act on them.
- **The Turner's T2 rest rule was inert** — `min_rest_hr` was in the data and `evaluate_gates`
  never read the key.
- **Three writers record the role and never check it.**
- **`0041`'s `set_process_envelope` could never run** — wrong `assert_role` arity, invisible
  because the migration had never been applied.

### Known-failing, and why

Everything below traces to ONE cause: `scripts/stage-history.mjs` has not been re-run since the
demo batches were regenerated onto PROCESS-2026C. `s11` now names its process explicitly so it
cannot recur, but the existing rows are stale — they carry 69 activities, no completed work, no
measured variance, and nothing at `rel_day 12`. Correcting them means deleting active batches that
carry staged history: **a deliberate decision, not a side effect of a backend slice.** `ARCH-011`.

| suite | what it needs |
|---|---|
| `demoBatches` · `hourlyPlan` · `varianceAttribution` · `lab` | staged history on the demo set |
| `evidence` criterion 17 | an `NMIX-ROTAVATE` instance with all three requirements outstanding |
| `plant` | `ARCH-006` — occupancy rows for vessels nobody allocated. Pre-existing, diagnosed. |

### Three suites that had never run

`hourAxis`, `uiFoundations` and `src/domain/time.test.ts` failed at COLLECTION — they read
`docs/source/book1_hour_grid.json`, which the documentation restructure moved to
`docs/_reference/source/`. 71 tests, absent from every green run anybody had seen. Repointed, and
they immediately caught two real defects:

- **`batchInstant()` and `batchDay()` threw on a half hour.** Correct while the axis was `int`;
  PROCESS-2026C's Turner sits at H175.5, so any screen rendering it would have thrown.
- **`numeric` arrives from `pg` as a string.** Checked whether that reached production: PostgREST
  serialises numeric as a JSON number, so `src/` is unaffected. Verified over HTTP, not assumed.

### A test suite that consumed its own fixtures

`evidence.test.ts` binds real photographs to any outstanding requirement, but its sweep is scoped
to `MB-DEMO-%` — so every run permanently consumed a `lab_tech` target on a real batch, until the
last one went and the suite failed at collection. Its `afterAll` now deletes the rows for the paths
it uploaded, wherever it bound them, keyed on the exact paths that run created.

---

## §14 · The backend is frozen

B1–B7 are accepted. **No further backend architecture or features.** The contract the three screens
are built against is `docs/implementation/BACKEND_HANDOFF.md` — views, RPCs, payloads, role matrix,
state values, evidence and gate flows, integration examples, and the two things that must not reach
production.

The frontend consumes the backend's answers. It does not recompute them:

```
eligible · blocked_reason · planned_start · planned_end · actual_start · actual_end ·
evidence_required · evidence_complete · gate_status · approval_status · variance_min ·
approved_extension · projected_end
```

Next: ADMIN UI → SUPERVISOR UI → LAB UI → connect to the real backend → real device test →
real factory walkthrough.
