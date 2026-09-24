# MushroomOS Implementation State

> This file is the handoff record. Chat history is **not** the source of truth — this file is.
>
> ## HANDOFF SAFETY RULE (standing, applies to every agent)
>
> **After every completed stage, update `docs/IMPLEMENTATION_STATE.md` and
> `docs/CLAUDE_HANDOFF.md` BEFORE beginning the next stage.**
>
> Assume this session may terminate immediately after any command. A fresh agent on another account
> or laptop must be able to continue from the repository alone.
>
> These files must always carry the *exact current* state: migrations and whether each is applied ·
> current process version · active DB facts · files and functions modified · runtime tests and their
> results · test fixtures created, retained or cancelled · known deviations · unresolved issues ·
> decisions that must not be reversed · **failed approaches and why they failed** · and one explicit
> NEXT ACTION.
>
> Never write "see previous conversation". Write the information into the repository.

## Last Updated

2026-09-16 · **Stage 2b complete and proven.** User redirected work to the deployment MVP sprint.

## Current Objective

### Deployment sprint progress (16 Sep 2026)

- Live read-only inspection confirmed PROCESS-2026K v1 / H476, 113 activities, and 11 active Lab
  rows in WAITING_CONDITION. `scripts/sprint-inspect.mjs` captures targeted, credential-free facts.
- `scripts/sprint-proof.mjs` passed: Admin creates/records initial material/activates a new 113-task
  Standard batch; one H0 and matching planned hours; Soak 3 present; future tasks not falsely READY;
  authenticated Supervisor reads production and starts; Supervisor raises ticket, Admin approves
  with remark, requester reads persisted decision under authenticated RLS; Lab reads 40 checkpoints;
  all existing active batch rows/activity rows unchanged, new baseline unchanged after ticket.
  One transaction, unconditionally rolled back. No test fixtures retained. No production rows edited.
- Proof correction: first run expected READY in the Lab queue at H0, but the pre-H0 checkpoint is
  deliberately excluded and all 40 post-H0 checkpoints correctly wait. Corrected the fixture
  expectation. Initial network timeout recovered on approved retry.
- Minimal UI changes: LabQueue renders the shared waiting-state set rather than dropping the new
  states; waiting cards say View; labWords distinguishes Blocked/Waiting/Not due yet. Planned H-hour
  added to Supervisor/Lab cards from baseline_start_hour; BatchMonitor reads current_hour from the
  existing v_batch_projection and defaults to Now. No new timing or eligibility engine.
- Files: src/features/lab/pages/LabQueue.tsx, src/shared/utils/labWords.ts,
  src/shared/api/lab.ts, src/features/supervisor/pages/MyWork.tsx,
  src/shared/api/projection.ts, src/features/admin/components/BatchMonitor.tsx;
  scripts/sprint-inspect.mjs, scripts/sprint-proof.mjs and the focused LabQueue rendering test.
- Final `npm run build` passed with the existing ExcelJS bundle-size warning. Focused
  `npx vitest run src/features/lab/pages/LabQueue.test.tsx` passed (1/1): waiting/not-due/blocked
  checkpoints render with H-hour labels and View rather than Record. Server-render test emits
  React Router useLayoutEffect warnings; this is not a browser/hydration proof. No remote full suite.
- Migrations: none. Persistent DB effect: none. Commits/pushes/deployments: none.
- Still needed: full browser Start/Finish/evidence and Lab/GM gate flow verification, final build,
  Cloudflare deployment and post-deployment smoke test. Prior Stage 2b gate proof remains recorded;
  it was not rerun in this sprint. In-app browser failed to attach twice; test login and existing
  Cloudflare project/URL requested from user. No known Cloudflare deployment configuration in checkout.

**User scope override: two-hour deployment MVP sprint.** Stage 2c/2d and the full roadmap below
are deferred. Use the existing flows for new Punjab/Standard batch creation with one H0,
concurrent-batch isolation, planned-time eligibility, Supervisor execution, Lab/GM gate approval,
and tickets with visible Admin decisions/remarks. Then build, deploy through Cloudflare, and smoke test.
Only minimal frontend changes and fixes required for these flows. Preserve all pre-existing changes.

Sprint initial inspection: handoff records migration 0118 and Stage 2b proof; no runtime claims
reverified yet. Batch creation already uses createAndPlan with the selected process ID and server
factory_instant for H0. Task detail already renders ticket status and Admin remarks. No deployment
config found in the initial file scan; requested the existing Cloudflare project/URL from the user.
Changes so far: these two handoff documents only. Migrations: none. DB effect: none.
Next: inspect existing flows and runtime access, identify only acceptance-blocking gaps, run focused
verification, then build and deploy. The historical NEXT ACTION below is superseded by this sprint.

**Stage 2 — READY / eligibility semantics**, in four sub-steps:

| | | |
|---|---|---|
| **2a** | `READY` means startable now; `NOT_DUE_YET` is a real state | ✅ **DONE, 13/13 proven** |
| **2b** | separate `WAITING` from `BLOCKED` | ✅ **DONE, 8/8 proven** |
| 2c | wake the dormant passive-hold path so a rest reads "rest in progress, ends H160, 6 h 22 m" | **next** |
| 2d | `PRIMARY \| PARALLEL \| CLEANING` as process data; the view unions `batch_activity` + `vessel_readiness_task` | |

## Product Understanding

MushroomOS is Fresh Bowl Horticulture's factory process execution and monitoring system for
button-mushroom compost. It is **not** a task manager and **not** a completion counter.

Its job is to make trustworthy and traceable: what the selected SOP says should have happened, when,
what physically happened, when, who did it, what was measured, what was photographed, what the Lab
reported, whether that Lab result is merely *recorded* or actually *approved*, what is blocking
production, whether a late event really affects downstream work, what exception was authorised, and
what the current forecast is.

```
VERSIONED PROCESS DATA + BATCH H0/CONFIG + FROZEN BASELINE
  + DEPENDENCIES/GATES/READINESS + ACTUAL EXECUTION + READINGS/EVIDENCE
  + LAB RESULTS/GM DECISIONS + TICKETS/EXTENSIONS
  = TRUSTWORTHY PROCESS STATE + FORECAST + AUDIT
```

Roles: **Admin** (configure, create/onboard batches, monitor, decide tickets — never performs
production work, never substitutes for GM Lab approval) · **Supervisor/Operations** (one unified
field workflow; Operator and Supervisor are the same job) · **Lab** (samples, records, submits —
cannot approve itself) · **GM** (reviews and approves/rejects Lab results, oversight).

## Architecture

`mushroomos/` — React 18 + Vite + Capacitor Android; Supabase Postgres with row-level security.

```
src/app/        entry + routes (RoleGuard picks the shell)
src/domain/     pure logic (time.ts, contracts.ts, cardinality.ts) — no process rules
src/features/   admin/ supervisor/ lab/ gm/
src/shared/     api/ auth/ camera/ ui/ utils/
supabase/migrations/   numbered, forward-only   ·   db-rollback/  rollback bodies
tests/          vitest; tests/db.ts wraps every test in a ROLLED-BACK transaction
scripts/        apply.mjs (one file, one transaction), db.mjs (LOCAL ONLY — refuses remote)
```

### Functions that matter most

| Function | Role |
|---|---|
| `evaluate_gates(activity, phase)` | **THE process engine.** 13 gate kinds × entry/exit. Every rule change is a rule row or one branch here. Never build a second engine. |
| `gate_predecessor_status(batch, instance, codes, binding)` | `ALL_INSTANCES` ⇒ done = total. **Counts only codes that exist in this batch**; a code absent from the plan is not counted, and zero matches passes vacuously. |
| `time_gate_status(activity)` | Exit time gate. For a hold, measures from **the predecessor's actual end**; carries the SOP's AND/OR temperature triggers. |
| `advance_batch(batch)` | Re-evaluates entry gates and moves state. Also **re-shuts** a gate that re-fails (0072). Skips rows with `onboarded_position = true`. |
| `submit_activity` | The finish. `complete_activity` delegates to it. Calls `advance_batch` at the end. |
| `project_batch(batch)` | Correct dependency-driven forecast: MAX over predecessors, real `gate_rule` edges only. |
| `generate_activity_plan` / `repoint_batch_activities` | Plan generation; `planned_start_at = H0 + standard_start_hour`. |
| `publish_process_definition` | Refuses to publish when the stated envelope disagrees with the activities. **This is what enforces H476.** |

## Process Authority

- Active: **PROCESS-2026K v1**, published and current (`process_catalogue.current_definition_id`).
- Process rules live in `process_activity`, `gate_rule`, `activity_field`, `evidence_requirement`,
  `lab_checkpoint` / `lab_checkpoint_activity`. **Not in React. Not in TypeScript.**
- Published versions are immutable (`fn_definition_is_frozen`); activated batch baselines are
  immutable (`fn_plan_is_frozen`). SOP change ⇒ new version, copy-on-write.
- Version lineage: 2026B → 2026C → 2026E → 2026F → 2026G → 2026H → 2026I → 2026J → **2026K**.
- Existing batches keep their own `master_batch.process_definition_id`. `set_current_process` only
  writes the catalogue row — **it cannot migrate a running batch.**

## Clock Model

- **H0** is the master batch clock: `master_batch.start_at`.
- `planned_start_at = H0 + process_activity.standard_start_hour`. H-hour is the primary operational
  language; wall-clock is supporting context.
- **H476 is the ceiling.** 2026K's activities compute 476 (`max(standard_end_hour)`) and 476 is
  recorded as `envelope_hours` / `factory_stated` / `FACTORY_CONFIRMED`. The ladder inside it:
  `TUN-DISCHARGE-1` H470→472, `-2` 472→474, `-3` 474→476.
- ⚠ `process_definition.baseline_hours` is a **GENERATED** column, `(total_days + 1) * 24` = 504.
  It is a day grid, **not** the process endpoint. Never present it as the ceiling; never try to set
  it. The endpoint is `v_process_catalogue.standard_hr` / `v_process_envelope.envelope_hr`.
- PLAN (frozen) ≠ ACTUAL (server-stamped) ≠ VARIANCE ≠ EXTENSION (authorised, separate) ≠ FORECAST.

## Operational Streams

The user-facing board is organised by these three columns, **not** by the SOP's Stage/Phase wording
(`STAGE-0A`, `PHASE-1A`, …), which stays as secondary drill-down metadata.

```
PRIMARY    Bagasse → Hopper → Yard → Turner → Bunker → Tunnel → Final
           (stream_code PRIMARY_FIBRE, YARD, BUNKER, TUNNEL)

PARALLEL   Paddy  ·  CM / Nitrogen
           (stream_code STRUCTURAL_STRAW, NITROGEN_MINERAL; plus TN-PREP,
            which carries parallel_group = 'TUNNEL_PREREQUISITE')

CLEANING   Exact-resource preparation/readiness work
           (table vessel_readiness_task — NOT batch_activity)
```

⚠ **CLEANING comes from a different table.** The three-column view must union `batch_activity` and
`vessel_readiness_task`.

⚠ **Lab is NOT a fourth column.** Lab and GM have their own workflow surfaces; Admin shows Lab/GM
status and blockers separately. (User ruling, 16 Sep 2026.)

## Lab / GM Model

`lab_checkpoint` map `LAB_2026A`: **25 checkpoints = 4 GATE + 1 DECISION + 20 RECORD.** Verified live.

- **GATE** — hard stop until an *approved* result exists. `LAB-BNK-PRE` → `FIB-BUNK-LOAD`;
  `LAB-CM-USE` → `MIX-CM-ADD`; `LAB-BNK-LOAD` → `BNK-B{1,2,3}-FILL`; `LAB-TUN-LOAD` →
  `BNK-B{1,2,3}-TUN-LOAD`. 4 checkpoints → 8 `LAB_APPROVED` gate rules (per bunker).
- **DECISION** — `LAB-MOIST-DEC` chooses a branch. Not an approval.
- **RECORD** — 20 of them. Captured for trace/trend. **Never block by themselves.**
  `LAB-RM-01` (raw material / bagasse weighment) is advisory and **must never gate H0.**
- Chain: Lab records → Lab submits → GM reviews → GM approves/rejects with remark → the **mapped**
  gate opens or stays shut. Rejection keeps it shut. `advance_batch` re-shuts a gate on rejection.
- `evaluate_gates`' `LAB_APPROVED` branch reads only the **latest** `lab_decision` and counts only
  `cp.kind = 'GATE'`, paired through `lab_checkpoint_activity`. A rule with nothing bound returns
  `unevaluable` rather than silently passing.

## Resource Model

Physical identity exists: 11 `BUNKER`, 12 `TUNNEL`, 1 `YARD`, 1 `SOAK_PIT`, 1 `HOPPER` in `location`;
`machine` holds `TURNER-01/02`, `JCB-01/02`, hopper, rotavator, conveyor, 4 trucks.

Built and wired but **never exercised** (0 rows): `vessel_readiness_task`, `vessel_readiness_media`,
`request_vessel_cleaning`, `assign_vessel_cleaning`, `complete_vessel_cleaning`,
`attach_readiness_photo`, `cancel_vessel_cleaning`, `allocate_vessel`, `batch_vessel_allocation`.
`v_resource_need` already produces the "upcoming resource need" alert, driven by `project_batch`.

Intended flow: upcoming need → Admin alert → Admin picks the **exact** bunker/tunnel → cleaning task
→ assignee + checklist + evidence → READY → allocate. A dirty or occupied resource cannot be
allocated; cleaning one resource must not block another.

⚠ Today no active batch has any vessel allocation and no Turner activity has an
`assigned_machine_id`. "Bunker 1" is an instance ordinal, not `BUNKER-01`. Stage 6.

## Ticket Model

One engine: `extension_request` + `extension_request_media` + `admin_decide_extension` +
`late_block_reason` + `extension_policy`. **Do not add a second.**

Lifecycle: Supervisor raises against the exact batch/activity (concern, evidence, server timestamp)
→ Admin decides with a **mandatory** remark → optional extension/deviation recorded **separately**
from actual delay → dependency-aware forecast → notification to the affected user.

`notification` table exists and is already written by `assign_activity`, `admin_decide_extension`,
`request_extension`, `request_vessel_cleaning`, `activate_batch`, `return_activity`,
`admin_reopen_task`, `send_alert`. ⚠ The **read** side barely exists: the UI reads `notification` in
exactly one place (`features/admin/api/schedule.ts` `loadNotifications`, batch-scoped, Admin-only).
There is no per-user inbox for Supervisor or Lab. Stage 7.

An extension **never** rewrites the baseline. Original plan, actual lateness and authorised
extension stay three separate numbers.

---

## Completed Stages

### Stage 0 — Runtime / migration foundation · **PASS** (2026-09-16)

**What changed.** Applied the two migrations that existed in the repository but not in the live
database: `0107_material_conditional_eligibility.sql`, `0108_ticket_photo_reuse_and_dead_rpcs.sql`.

**Why.** Repo and runtime had silently diverged. `CLAUDE.md`: a migration in git is not proof it is
in the database.

**⚠ Important discovery — check this before applying any old migration.** `0107` contains a full
`CREATE OR REPLACE` of `generate_activity_plan` written against the 0081-era body. Four later
migrations had touched surrounding code, so applying it blind could have regressed the function. I
diffed its body against the live one first (whitespace-normalised): it was the live body **plus one
guarded branch**, nothing else. Safe. *Always do this diff for a migration that replaces a function.*

**Runtime proof.**
```
required_material_code column exists = 1      rows flagged = 0 (Local unused, as required)
attach_extension_photo has eTag protection    = true
gm_decide_extension       authenticated execute = false   (revoked)
manager_decide_extension  authenticated execute = false   (revoked)
admin_decide_extension    authenticated execute = true    (the live path)
Active-batch plan fingerprints before vs after = ZERO DIFF
```

### Stage 1 — PROCESS-2026K / H476 integrity · **PASS** (2026-09-16)

**What changed.**

`0114_exit_predecessor_refuses_the_finish.sql` — `submit_activity` now refuses on a failing
**exit-phase `PREDECESSOR`** gate. Body is the live definition verbatim plus one declaration
(`v_pair_reason`) and one block placed after the `MIN_DURATION` check.

`0115_process_2026k_the_bunker_pair.sql` — PROCESS-2026K v1, cloned from 2026J (pattern copied from
0097), with exactly two deltas:
1. Three **exit** `PREDECESSOR` rules: `BNK-B1-FILL ← [TRN-P1-T3, TRN-P2-T3]`,
   `BNK-B2-FILL ← [TRN-P3-T3, TRN-P4-T3]`, `BNK-B3-FILL ← [TRN-P5-T3, TRN-P6-T3]`.
2. `envelope_hours = 476`, `envelope_hour_source = 'factory_stated'`,
   `envelope_confidence = 'FACTORY_CONFIRMED'`.

**Why.**

*The pair.* In 2026J, `TRN-P2-T3`, `TRN-P4-T3` and `TRN-P6-T3` had **no dependent anywhere in the
graph** — three of six turner piles were dead-end physical work, and a bunker could be sealed with
one pile of its pair unturned. Geetha §16 calls the pairing "a real physical grouping/dependency
relationship, not just a UI label"; it was only a label.

*The envelope.* 2026J stated no envelope, so `v_process_envelope` fell through its `COALESCE` and
the generated `baseline_hours = 504` sat beside a number that is not the process's length. Stating
476 makes `publish_process_definition` assert, from now on, that the activities and the ceiling
agree — an activity added past H476 will fail to publish.

**Runtime proof.** 8 checks, all PASS. Script: `scratchpad/prove_pair.mjs` (one transaction, rolled
back; upstream chain is fixture, gates/refusal/hold-clock are the real functions).

```
P1  Punjab plan: STR-SOAK-1/2/3 + LAB-PDY-S1/S2/S3 present, 113 activities, ceiling H476
P2  batch pinned to PROCESS-2026K, max baseline hour = 476
P3  fill still OPENS on the first pile alone (entry PREDECESSOR = pass, LAB_APPROVED = fail)
P4  exit PREDECESSOR fails while pile 2 is unturned, in a human sentence
P5  submit_activity REFUSES to close the bunker while the pair is incomplete
P6  with both piles turned, the same exit gate passes
P7  the 63 h bunker hold is measured from the FILL end, not from a turner pass
    measured_from 06:25:46 = fill end 06:25:46  ≠  pile 2 end 07:53:56
P8  B2 is judged on its own pair (P3+P4), unaffected by B1
```

Dead ends, both versions:

| Version | Dead-end production activities |
|---|---|
| PROCESS-2026J | `FIB-WEIGH`, **`TRN-P2-T3`, `TRN-P4-T3`, `TRN-P6-T3`**, `TUN-DISCHARGE-3` |
| PROCESS-2026K | `FIB-WEIGH`, `TUN-DISCHARGE-3` (a pre-work weighment and the terminal step) |

### Stage 2a — the planned hour decides READY · **PASS** (2026-09-16)

**What changed.**

`0116_not_due_yet_is_a_state.sql` — adds `NOT_DUE_YET` to the `activity_state` enum. **Enum only.**
PostgreSQL will not let a value added by `ALTER TYPE` be *used* in the transaction that added it,
and `scripts/apply.mjs` wraps each invocation in one — so this must be applied as its **own call**,
before 0117.

`0117_planned_time_decides_ready.sql` — four changes, one formula:
1. **`planned_time_status(activity)`** — NEW. The single answer to "may this begin yet?":
   `planned_start_at − extension_policy.early_start_min`. Does not apply to a hold, a
   before-tracking row, an onboarded-position row, or a clock-waived (demo) batch.
2. **`start_block_reason`** — now a thin wrapper over it, so there is exactly ONE early-start
   formula in the database. Its accepted-state list gains `NOT_DUE_YET` (without that it would fall
   silent about the very state it produces).
3. **`advance_batch`** — consults it before saying READY, and re-examines `NOT_DUE_YET` rows on
   every pass. The live body plus one declaration and one branch; nothing else changed.
4. **`admin_force_open`** — `NOT_DUE_YET` added to its guard list.

Frontend: `NOT_DUE_YET` added to the four state-label maps and to `WAITING_STATES`;
`BatchMonitor.notDueYet()` now **reads** `r.state === 'NOT_DUE_YET'` instead of re-deriving it from
a timestamp, and the duplicate chip is gone.

**Why.** `advance_batch` said READY as soon as entry gates passed, and planned time was not an entry
gate — so every stream head was READY from activation. Measured live on `001,002,003` at H0.45:
`STR-WEIGH` (H70), `CM-WEIGH` (H130) and `TN-PREP` (H308) were all READY. 0106 refused the *starts*,
but the refusal lived in the RPC while the **state** said READY, and `v_my_work` serves the state.

**⚠ No new scheduler.** `MyWork` already calls `releaseElapsedRests` → `advance_batch` every 15 s
per batch on screen, and `BatchDetail` on load. That is the tick that flips NOT_DUE_YET → READY.

**Runtime proof — 13/13 PASS.** `node scratchpad/prove_ready.mjs` (one transaction, rolled back).

```
P2.1   work planned at H0 is READY                     FIB-WET-1, LAB-RM-01
P2.2   future stream heads are NOT_DUE_YET             STR-WEIGH H70, CM-WEIGH H130, TN-PREP H308
P2.2b  and each says why, in a sentence
P2.3   INVARIANT: nothing is READY whose hour has not arrived — zero rows
       distribution on a fresh batch: READY=3  NOT_DUE_YET=3  LOCKED=107
P2.4   start_activity refuses a NOT_DUE_YET task and names the planned hour
P2.5   a batch whose H0 is 8 h away has NO ready work at all
P2.5b  NOT_DUE_YET flips to READY once its window opens (the rescan works)
P2.5c  and only that activity moves — H70 is still not due (per-activity, not global)
P2.5d  and closes again when the window is restored — not a one-way door
P2.6   the Admin failsafe can still force a NOT_DUE_YET task open
P2.7   a NOT_DUE_YET task is never reported late
P2.8   demo batches untouched — their clock waiver still suppresses the rule
P2.9   on the REAL batch the fix corrects the state and touches NOTHING else:
       READY 3 -> 2, NOT_DUE_YET -> 1 (TN-PREP, H308, planned 20 Sep)
       plan fingerprint (planned/baseline/actuals) unchanged = true
```

**Applied to the real batch.** `advance_batch` was then run deliberately (as `admin`) on
`158.1,159.1,160.1`: `TN-PREP` moved READY → NOT_DUE_YET. This would have happened unattended
within 15 s of anyone opening MyWork, so it was done attributably instead. Verified end to end
through `v_my_work` **as a supervisor**: that row now serves `NOT_DUE_YET` with its reason.

### Stage 2b — WAITING is not BLOCKED · **PASS** (2026-09-16)

**What changed.** `0118_waiting_is_not_blocked.sql`:

1. `advance_batch` files shut work under **`WAITING_CONDITION`** when a required PREDECESSOR is
   unfinished, and **`BLOCKED`** when anything else holds it. Both enum values already existed and
   were **completely unused** — nothing in the database wrote either before this file.
2. **A failing PREDECESSOR now outranks every other reason.** The old ordering was
   `gate_rule.ordering` alone, and `LAB_APPROVED` sorts (5) ahead of `PREDECESSOR` (10) — so a
   bunker fill whose pile was not yet turned *and* whose Lab result was not approved reported
   "waiting for GM approval", sending someone to chase the GM about work that could not have
   started anyway.
3. The rescan set gains `WAITING_CONDITION` and `BLOCKED` — the same trap 0072 fixed for READY and
   0117 for NOT_DUE_YET.
4. `v_batch_monitor` gains **`production_not_due`**. 0117 moved future work to `NOT_DUE_YET`, which
   appears in no existing filter on that view, so those rows had silently vanished from every count
   on Admin Home.

No frontend change was needed: `WAITING_STATES` already contained both values and all four label
maps already had them.

**Runtime proof — 8/8 PASS.** `node scratchpad/prove_waiting.mjs`.

```
P2b.1  the single LOCKED bucket is gone
       COMPLETED 68 · WAITING_CONDITION 37 · READY 5 · BLOCKED 2 · NOT_DUE_YET 1 · LOCKED 0
P2b.2  a pending predecessor is WAITING_CONDITION          BNK-B1-HOLD-1
P2b.3  an unapproved Lab gate is BLOCKED                   BNK-B1-FILL
P2b.4  predecessor OUTRANKS the Lab gate when both fail    BNK-B3-FILL: both gates fail,
       reports "Turner T3 — pile 5 not complete", not the Lab gate
P2b.5  WAITING_CONDITION re-opens once its predecessor finishes
P2b.6  a BLOCKED task opens ONLY after GM approval of its mapped Lab gate:
       record -> evidence -> submit -> GM approve  =>  BNK-B2-FILL BLOCKED -> READY
P2b.7  REAL batch: states separate, plan fingerprint unchanged
P2b.8  v_batch_monitor counts not-due work instead of dropping it
```

**Applied to the real batch.** `158.1,159.1,160.1` now reads:
`SKIPPED 77 · WAITING_CONDITION 30 · READY 2 · IN_PROGRESS 1 · COMPLETED 1 · BLOCKED 1 ·
NOT_DUE_YET 1`. Plan columns unchanged. The three demo batches still show `LOCKED`; they convert on
their next `advance_batch`, which is harmless.

---

## Current Stage

**Stage 2c — passive holds.** A rest still sits in `READY`, inviting a person to Start and Finish
something nobody performs. `is_time_gate` is false and `day0_duration_hr` null on all 113
activities, so `WAITING_TIME`, `unblocks_at` and `release_elapsed_rests` are built and dormant.
Enforcement is already correct — the exit `MIN_DURATION` gate holds, measured from the predecessor's
actual end — so this is a state/vocabulary change, not an enforcement one.

## Current Implementation

Stages 0, 1 and 2a are complete and proven. Anything not recorded in *Runtime Proof* has not been
proven.

## Database State

- Migrations applied through **0117**.
- Process versions: 2026B, 2026C, 2026E–2026J published; **2026K published and current**;
  ROUTE-2026A archived.
- `process_catalogue.current_definition_id` → PROCESS-2026K v1.
- Batches: see `CLAUDE_HANDOFF.md` table. **`TEST-K-PAIR-02` is a retained fixture** — draft,
  non-demo, on 2026K, H0 = 2026-09-08 13:53:56 IST (190 h before creation), chosen so the bunker
  fill is due *now* rather than in the past. Keep it for Stage 2.
- `TEST-K-PAIR-01` cancelled (not deleted — `admin_delete_batch` correctly refuses a non-demo batch;
  cancellation is the right lifecycle action and leaves it on the record).
- **Retained Stage 2 fixtures**, both draft, non-demo, on 2026K:
  - `TEST-K-READY-01` — H0 = creation time. The fresh-batch case: READY at H0, NOT_DUE_YET for H70 /
    H130 / H308.
  - `TEST-K-READY-02` — H0 = creation time **+ 8 h**. The only way to prove the NOT_DUE_YET → READY
    transition without faking the clock: `extension_policy.early_start_min` is capped at 720 minutes
    by a CHECK, so the activity under test must be less than 12 h away.
- `158.1,159.1,160.1` had `advance_batch` run on it deliberately after 0117: `TN-PREP` READY →
  NOT_DUE_YET. Its plan (planned/baseline/actual columns) is unchanged.

## Runtime Proof

| Stage | Checks | Result | Reproduce |
|---|---|---|---|
| 0 | column/grants/eTag + zero-diff fingerprint | PASS | queries in *Commands* below |
| 1 | P1–P8 | 8/8 PASS | `node scratchpad/prove_pair.mjs` |
| 2a | P2.1–P2.9 | 13/13 PASS | `node scratchpad/prove_ready.mjs` |
| 2b | P2b.1–P2b.8 | 8/8 PASS | `node scratchpad/prove_waiting.mjs` |

The vitest suite has **not** been run. It requires `ALLOW_REMOTE_DB_TESTS=1` against the shared
database (`tests/target.ts` refuses a remote target otherwise; `tests/db.ts` rolls back every test).
Not run because that specific authorisation has not been given.

## Known Bugs

1. ~~`READY` assigned before planned time~~ — **FIXED in 0117**, proven P2.1–P2.9.
2. ~~`NOT DUE YET` computed in React~~ — **FIXED in 0117**; `BatchMonitor.notDueYet()` now reads the
   state instead of deriving it.
3. **The blocker SENTENCE still says "Locked —" on a `WAITING_CONDITION` row.** The state chip is
   now correct ("Waiting"), but the reason text beneath it reads
   `Locked — Bunker filling — bunker 3 not complete`. The wording lives in
   `gate_rule.blocked_reason_template`, which is **process data inside published PROCESS-2026K**, so
   correcting it needs a new process version — it must NOT be patched in React, and 2026K must not
   be rewritten. Pair it with the Stage 5 "sentence-level blocker text" work in one version bump.
4. **Passive holds sit in `READY`.** `is_time_gate = false` and `day0_duration_hr = null` on all 113
   activities, so `WAITING_TIME`, `unblocks_at` and `release_elapsed_rests` are built and **dormant**.
   Enforcement is correct (the exit `MIN_DURATION` gate holds); the state vocabulary is wrong.
5. **Two forecast engines.** `project_batch`/`v_batch_projection` (correct) is read by one screen;
   `v_batch_forecast` (= `planned_end_at + batch-wide worst slip`) is read by four
   (`shared/api/work.ts:213,224`, `shared/api/tower.ts:52`, `AdminToday`).
6. **DEMO waives the clock.** `batch_clock_waived(b) = b.is_demo`, consumed by `evaluate_gates`,
   `time_gate_status` and `start_block_reason`. `dev_effective_clock` / `get_effective_now()` exist
   and the engine never calls them. **A demo batch cannot currently prove a timing rule.**
7. **Onboarded batches carry two clocks.** `onboard_batch` (0095) rebases `planned_start_at` from a
   virtual per-stream H0 while leaving `baseline_start_hour` and `master_batch.start_at` alone. On
   `158.1`, `BNK-B2-FILL` reads H190 but is planned at H240 from its real H0.
8. **Third ceiling derivation in React.** `features/admin/pages/BatchDetail.tsx:169` recomputes the
   ceiling from `max(baseline_end_hour)` across the batch's rows. Live — lazily embedded in
   `BatchPage` at line 155. Yields 476 today by coincidence.
9. **Weighments capture photos but no numbers.** `FIB-WEIGH`, `CM-WEIGH`, `BNK-Bx-RELOAD`,
   `STR-PILES`, `YARD-ADD` all have 0 `activity_field` rows and 2 photo requirements.
10. **No resource or machine identity on any live batch.** 0 `batch_vessel_allocation` rows,
   0 `vessel_readiness_task` rows, every Turner `assigned_machine_id` null.

## Deferred Items

- **Local Paddy** — user ruling 16 Sep 2026. Capability (`required_material_code`) applied and
  **unused**; `0115` asserts zero flagged rows so a later edit cannot slip it in unnoticed. When it
  is implemented it needs: the flag on `STR-SOAK-3` **and on `LAB-PDY-S3`** (see *Design Decisions*),
  plus widening `STR-PILES` to `['STR-SOAK-3','STR-SOAK-2']`.
- **DEMO acceleration** — last stage, after the real rules are proven.
- Unresolved factory questions, tracked in the `conflict_register` table (112 entries). Open and
  deliberately **not** invented: `SOP-C06`, `SOP-C08`, `SOP-C09`, `SOP-C12`, `SOP-C13`, `SOP-C14`,
  `SOP-U02` (the 67–68 % moisture band — **do not invent a midpoint**), `SOP-U07`, `SOP-U18`,
  `TBD-57` (BUNKER_LINE → BUNKER mapping is provisional), bunker/tunnel cleaning checklist content,
  per-checkpoint photo counts (`SOP-C15`).
- Noted, not acted on: `Compost SOP.xlsx` row 44 says bunker filling starts "after 3-4 piles
  completion" while TURNERPRCOESS.xlsx and Geetha both say pairs. The user ruled **pairs**.

## Remaining Implementation Queue

1. **Stage 2 — READY/eligibility** (current)
2. **Stage 3 — Supervisor execution + data capture** — the missing `activity_field` rows (bug 8)
3. **Stage 4 — Time + dependencies** — one forecast (bug 4), onboarded clock (bug 6)
4. **Stage 5 — Lab** — verification, plus sentence-level blocker text
5. **Stage 6 — Resource / bunker / tunnel readiness** — exercise the built flow (bug 9)
6. **Stage 7 — Tickets + notifications** — the missing per-user read surface
7. **Stage 8 — Admin monitoring**
8. **Stage 9 — DEMO acceleration** (bug 5), deliberately last

## Important Design Decisions

*Future agents must not silently reverse these.*

1. **The bunker pair belongs on the fill's EXIT, not on the following hold's ENTRY.**
   `time_gate_status` measures a hold from `max(actual_end)` across its **entry** predecessors
   (and the query has no `limit`, so it aggregates across *every* entry PREDECESSOR rule). Naming a
   turner pile there would run the 63-hour bunker clock from a turner pass instead of from the
   moment the bunker was closed, silently extending every bunker hold. Proven by check P7.
2. **The bunker fill's ENTRY gate still names ONE pile.** `conflict_register.SOP-C05` is `decided`:
   "TURNERPRCOESS; opens at the first pile of the pair (user decision 14 Sep 2026)". Do not
   "fix" this to two piles.
3. **H476 is enforced by `publish_process_definition`, not by a comment.** The stated envelope must
   equal `max(standard_end_hour)`. Never state a number the activities do not produce, and never
   add an activity past H476 without a factory ruling.
4. **`process_definition.baseline_hours` is generated (`(total_days+1)*24`) and is NOT the ceiling.**
5. **A Local-Paddy implementation must also flag `LAB-PDY-S3`, not just `STR-SOAK-3`.**
   `LAB-PDY-S3.material_role` is NULL, so it would still generate on a Local batch, and its gate
   `{"when":"started","activity_codes":["STR-SOAK-3"]}` passes **vacuously** —
   `coalesce(bool_and(...), true)` over zero rows is `true`. The result would be an orphan Lab
   checkpoint, open from activation, for a soak that does not exist. Flagging it also requires
   setting its `material_role` (0107's CHECK constraint). Verified side-effect-free: no 2026J label
   template uses `{role_lead}`/`{n}`, and `requiredMaterialRoles()` already contains
   `STRUCTURAL_STRAW`.
6. **`assert_role` has no owner exemption, deliberately.** Two exemptions were tried historically
   and both silently disabled every role guard. Scripts adopt a role the way `tests/db.ts` `actAs`
   does — reading a real `profiles` id so `auth.uid()` points at a row that exists.
7. **Migrations run through `scripts/apply.mjs`** (named files, one transaction, rollback on
   failure). **Never `scripts/db.mjs` against the shared database** — it re-runs every file and
   keeps no ledger; it refuses a non-local host for exactly that reason.
8. **CLEANING is `vessel_readiness_task`, not `batch_activity`.** The three-column view unions them.
9. **Lab is not a fourth operational column** (user ruling, 16 Sep 2026).

## Files Changed

| Path | Purpose |
|---|---|
| `mushroomos/supabase/migrations/0114_exit_predecessor_refuses_the_finish.sql` | engine: an exit PREDECESSOR gate refuses the finish |
| `mushroomos/supabase/migrations/0115_process_2026k_the_bunker_pair.sql` | PROCESS-2026K: bunker pair + H476 envelope |
| `db-rollback/pre_0114__submit_activity.sql` | pre-0114 `submit_activity` body, captured live |
| `docs/IMPLEMENTATION_STATE.md` | this file |
| `docs/CLAUDE_HANDOFF.md` | short handoff |
| `mushroomos/supabase/migrations/0116_not_due_yet_is_a_state.sql` | enum value only — apply as its OWN call |
| `mushroomos/supabase/migrations/0117_planned_time_decides_ready.sql` | planned_time_status; start_block_reason wrapper; advance_batch; admin_force_open |
| `db-rollback/pre_0117__advance_batch.sql` | pre-0117 bodies of advance_batch, start_block_reason, admin_force_open |
| `mushroomos/src/shared/api/work.ts` | `NOT_DUE_YET` in `STATE_LABEL` and `WAITING_STATES` |
| `mushroomos/src/shared/ui/task/TaskDrawer.tsx` | `NOT_DUE_YET` label |
| `mushroomos/src/features/admin/pages/BatchDetail.tsx` | `NOT_DUE_YET` label |
| `mushroomos/src/features/admin/components/BatchMonitor.tsx` | `notDueYet()` reads the state; duplicate chip removed |
| `mushroomos/supabase/migrations/0118_waiting_is_not_blocked.sql` | WAITING vs BLOCKED; predecessor-first ordering; `production_not_due` |
| `db-rollback/pre_0118__advance_batch.sql` | pre-0118 `advance_batch` |

`npx tsc --noEmit` passes. A typecheck is not proof of behaviour — the runtime proof above is.

⚠ **The working tree already had uncommitted changes when this work began**, and they are NOT part
of it: `mushroomos/src/README.md`, `src/domain/time.test.ts`, `src/features/admin/api/batches.ts`,
`src/shared/auth/auth.ts`, plus a large set of `_archive/` deletions. Verified: none of them
contains any Stage 0–2 change. Nothing has been committed or pushed — the repository is meant to be
zipped and moved as-is.

## Migrations Added

| # | Purpose | Applied to shared DB |
|---|---|---|
| 0107 | material-conditional eligibility capability (pre-existing file) | ✅ yes, Stage 0 |
| 0108 | ticket photo eTag reuse + retire dead extension RPCs (pre-existing file) | ✅ yes, Stage 0 |
| 0114 | exit PREDECESSOR gate refuses the finish | ✅ yes, Stage 1 |
| 0115 | PROCESS-2026K — bunker pair, H476 envelope | ✅ yes, Stage 1 |
| 0116 | `NOT_DUE_YET` enum value — **must be its own apply call** | ✅ yes, Stage 2a |
| 0117 | the planned hour decides READY | ✅ yes, Stage 2a |
| 0118 | WAITING is not BLOCKED; `v_batch_monitor.production_not_due` | ✅ yes, Stage 2b |

## Commands / Tests Used

```bash
# apply named migrations, one transaction, rollback on failure
cd mushroomos && node scripts/apply.mjs 0114_....sql 0115_....sql

# read-only inspection (scratchpad helper: sets the session read-only)
node scratchpad/q.mjs "select ... "

# call a role-guarded RPC by adopting a real profile, as tests/db.ts actAs does
node scratchpad/rpc.mjs admin "select public.publish_process_definition(...)"

# the Stage 1 proof — one transaction, rolled back
node scratchpad/prove_pair.mjs
node scratchpad/prove_ready.mjs
node scratchpad/prove_waiting.mjs

# 0116 and 0117 MUST be two separate calls — an enum value cannot be used in the
# transaction that added it.
node scripts/apply.mjs 0116_not_due_yet_is_a_state.sql
node scripts/apply.mjs 0117_planned_time_decides_ready.sql
```

Key verification queries:

```sql
-- dead-end production activities in a version
select pa.code from process_activity pa
 where pa.process_definition_id = :v and pa.code not like 'LAB-%'
   and not exists (select 1 from gate_rule gr join process_activity pb on pb.id = gr.process_activity_id
                    where pb.process_definition_id = :v and gr.kind = 'PREDECESSOR'
                      and gr.config->'activity_codes' ? pa.code);

-- the ceiling, and whether it is stated and agreed
select code, standard_hr, stated_envelope_hr, envelope_disagrees, envelope_confidence
  from v_process_envelope;

-- plan fingerprint per active batch, for before/after comparison
select mb.code, count(*),
       md5(string_agg(a.code||'|'||a.instance_no||'|'||a.state::text||'|'
            ||coalesce(a.planned_start_at::text,'-')||'|'||coalesce(a.actual_start::text,'-')||'|'
            ||coalesce(a.actual_end::text,'-')||'|'||coalesce(a.baseline_start_hour::text,'-'),
            ',' order by a.seq, a.instance_no))
  from batch_activity a join master_batch mb on mb.id = a.master_batch_id
 where mb.status = 'active' group by mb.code order by mb.code;
```

## Failure Log

*Recorded so a future agent does not repeat the approach.*

### Test failure — 2026-09-16 · Stage 1 check P5

**Attempt.** Set the bunker-fill fixture `actual_start = now() - 30 minutes`, then called
`submit_activity` expecting the pair refusal.
**Expected.** The exit PREDECESSOR (pair) refusal.
**Actual.** `"Can be finished from 16 Sep 13:25 (1 h 30 min to go)."`
**Cause.** The fill's own `MIN_DURATION` is 2 h and `submit_activity` checks it **before** the pair
block, so a fill started 30 minutes ago is refused for being too soon — a correct refusal, but not
the one under test.
**Fix.** `actual_start = now() - 3 hours`.
**Result.** P5 passes, and the ordering of refusals is now understood: late → too soon → pair →
evidence.

### Activation failure — 2026-09-16 · Stage 1

**Attempt.** `activate_batch` on a freshly created test batch.
**Expected.** Activation.
**Actual.** `"Cannot activate — No initial material data is recorded. Enter the pre-H0 material
values before activating the batch."`
**Cause.** `validate_batch` enforces the pre-H0 incoming-material check (0032/0084). Correct guard.
**Fix.** Ported `satisfyPrebatchMaterialCheck` from `tests/db.ts` — `open_prebatch_sample` at
`least(now(), start_at - 1 hour)`, then `request_lab_test` / `record_lab_result` /
`accept_lab_result` for `moisture_pct` and `ph` as `lab_tech`. Two parameters, not three: no source
records a dry weight (`TBD-45`), and requesting it would leave the check permanently unaccepted.
**Result.** Activation succeeds. **Any future fixture that activates a batch needs this.**

### Wrong fixture H0 — 2026-09-16 · Stage 1

**Attempt.** `TEST-K-PAIR-01` created with H0 = now − 200 h.
**Actual.** The bunker fill was 8 h past due, so `late_block_reason` ("raise a late ticket") fired
ahead of everything under test.
**Fix.** `TEST-K-PAIR-02` with H0 = now − 190 h, placing the fill due *now*.
**Result.** Correct. `TEST-K-PAIR-01` was **cancelled**, not deleted — `admin_delete_batch` refuses a
non-demo batch, and cancellation is the right lifecycle action.

### Near-miss — 2026-09-16 · Stage 2a · hand-retyped function body

**Attempt.** Wrote `admin_force_open` into 0117 from memory of a `grep` for lines containing
`state`, rather than from its verbatim body.
**Actual.** The hand-written version silently dropped **four** things: the 10-character minimum on
the reason, the `for update` row lock, the batch-must-be-active check, and — worst —
`onboarded_position = true` on the update, which is what stops the engine re-locking a forced task.
**Cause.** Retyping instead of patching the live definition.
**Fix.** Rebuilt 0117 from `pg_get_functiondef` output with a single anchored string replacement.
**Rule.** *Never retype a function body. Dump it, patch one anchor, assert the anchor was found.*

### Near-miss — 2026-09-16 · Stage 2a · privilege escalation in a generated grant

**Attempt.** The 0117 builder emitted `grant execute on function advance_batch to authenticated`,
copying the pattern used for the other functions in the file.
**Actual.** `advance_batch`'s real ACL is `{postgres, service_role}` — it is deliberately **not**
reachable by a logged-in user; the field reaches it only through `release_elapsed_rests`,
`submit_activity` and `activate_batch`, each of which applies its own role guard first.
**Cause.** Assuming a uniform grant pattern.
**Fix.** Checked `proacl` for every function the migration replaces, before applying. The file now
revokes from `authenticated` and grants only `service_role`. Verified unchanged after apply.
**Rule.** *Read `p.proacl` for every function a migration replaces, and restate the grant it had —
not the grant its neighbours have.*

### Test failure — 2026-09-16 · Stage 2a · checks P2.5 and P2.8

**Attempt 1.** Prove the NOT_DUE_YET → READY transition by widening
`extension_policy.early_start_min` to 4260 minutes so a task at H70 came into range.
**Actual.** `violates check constraint "extension_policy_early_start_min_check"` — the column is
capped at **720 minutes (12 h)**. The assertion that a 12-hour window would reach H70 was also
simply wrong; the observed NOT_DUE_YET was correct behaviour and the test was at fault.
**Fix.** Created `TEST-K-READY-02` with **H0 = now + 8 h**, so a 12-hour window genuinely reaches
`FIB-WET-1` and a 30-minute one does not. The clock is never faked.
**Attempt 2.** `count(*) filter (where … public.planned_time_status(a.id) …)`.
**Actual.** `set-returning functions are not allowed in FILTER` / `argument of NOT must not return a
set`.
**Fix.** `cross join lateral public.planned_time_status(a.id) pt`.
**Result.** 13/13 pass.

### Fixture failures — 2026-09-16 · Stage 2b · four in a row, all mine

Each one is a real product guard doing its job; the test was wrong, not the code.

| Attempt | Actual | Cause | Fix |
|---|---|---|---|
| `open_lab_sample($1,'label')` | `invalid input syntax for type uuid` | the signature is `(activity, **checkpoint**, label, at)` | read the bound checkpoint from `lab_checkpoint_activity` rather than guessing |
| `record_lab_result(test, 50)` for every parameter | **"Smell is not a number: record what is observed."** | `lab_parameter.value_kind` is `numeric` / `choice` / `observation`; bunker loading includes all three | record each parameter in its declared kind |
| `try/catch` around a failing RPC inside the transaction | every later query answered `current transaction is aborted` | in PostgreSQL a failed statement aborts the whole transaction | wrap anything that may legitimately fail in a `savepoint` |
| lab `submit_activity` returned ok but the activity stayed `IN_PROGRESS` | the GM refused: "has not been submitted by the lab" | `submit_activity` does **not** raise on outstanding evidence — it sets `IN_PROGRESS` and returns the outstanding list | port `satisfyEvidence` from `tests/db.ts` (storage object + `evidence_media` row) before submitting |

**Rule.** *When a fixture fails, read the refusal before changing the code it refuses. Four times in
a row here the refusal was correct and the fixture was wrong.*

### Tooling note — heredocs

Writing a long SQL migration through a bash heredoc failed on quoting. Use the file-write tool for
migration files. Also: `do $$ … $$` inside a file passed through some shells is fragile — 0115 uses
`do $mig$ … $mig$`.

## Last Verified State

**2026-09-16, end of Stage 2b.** Migrations through **0118** applied. PROCESS-2026K published and
current, ceiling H476. Stage 1 P1–P8, Stage 2a P2.1–P2.9 and Stage 2b P2b.1–P2b.8 all PASS.
`npx tsc --noEmit` clean. The real batch `158.1,159.1,160.1` reads
`SKIPPED 77 · WAITING_CONDITION 30 · READY 2 · IN_PROGRESS 1 · COMPLETED 1 · BLOCKED 1 ·
NOT_DUE_YET 1`, with its planned/baseline/actual columns unchanged throughout. The three demo
batches still show `LOCKED` and convert on their next `advance_batch`.

## NEXT ACTION

Continue the **deployment MVP sprint**. Obtain the existing Cloudflare project/URL and authenticated
deployment access; finish browser role-flow verification (including evidence/Finish and Lab→GM gate),
deploy the verified build, then perform a post-deployment smoke test. The in-app browser failed to
attach twice in this session. Local Vite server was started at http://127.0.0.1:5173/.

Stage 2c (passive holds/new process version) and 2d (three columns) are deferred by the user's sprint
scope. Do not resume them or redesign Admin before the six MVP flows and deployment are handled.

## Demo-readiness acceptance — 2026-09-16 (afternoon)

**Deployed:** Cloudflare Pages project `mushroomos` → https://mushroomos.pages.dev (SPA fallback
`public/_redirects`). Debug APK built from the same `dist/` (see CLAUDE_HANDOFF).

**Script:** `node mushroomos/scripts/demo-acceptance.mjs` — one transaction, rolled back; product calls
run as `authenticated` with real profile claims (RLS + role guards apply). **27/28 PASS.**

| ID | Check | Result |
|---|---|---|
| A1 | existing batch 158.1 opens: monitor row, states, current work | PASS |
| B1–B5 | Admin create+activate; one H0 across all streams; PROCESS-2026K; 113 acts, STR-SOAK-1/2/3; no future READY | PASS |
| C1–C6 | My Work (lab rows filtered as `MyWork.tsx` does); future start refused; Start stamps actual_start; Finish → COMPLETED + actual_end; successors recalculated (FIB-REST-1 → READY) | PASS |
| C4 | a second supervisor may start a task assigned to the first — supervisors share production work; no per-person lock | PASS (documented behaviour) |
| E1–E2 | ticket keeps batch/activity/raiser/time/remark; Admin approve + remark; requester reads it; notification row | PASS |
| D1–D7 | FIB-BUNK-LOAD BLOCKED by LAB-BNK-PRE; Lab queue; Lab submit; Lab self-approve refused; submit ≠ approval; GM reject keeps it shut; GM approve → READY; RECORD never gates (`evaluate_gates` filters `cp.kind='GATE'`) | PASS |
| **D5a** | **an active GM login exists** | **FAIL — all 3 gm profiles `is_active=false` (deactivated by Admin 15–16 Sep). `GM_APPROVES_EVERY_LAB_SUBMISSION` is the enabled reading, so no one can open a Lab gate in production until a GM login is reactivated.** The script activates one inside its rolled-back transaction to prove the path. |
| G1–G3 | onboarding: H0 kept, 0 actual times, 62 before-tracking SKIPPED with no plan time, position READY, no future READY, supervisor sees positions | PASS |
| F1–F3 | real batch + batch B fingerprints unchanged; three distinct H0s | PASS |

Fixture failures on the way (test wrong, not product): C1 counted lab rows the screen filters out;
`advance_batch` is not granted to `authenticated` (server-side step) — the script runs it as owner in a
savepoint; D7's first query joined RECORD bindings the engine ignores.

Also found: the 29 cancelled batches — only the 13 demo ones can be deleted (`admin_delete_batch`
refuses production batches by design). Onboarding screen: "At an activity" already opens a per-stream
activity picker; the gap is no pre-confirm preview of what becomes "before tracking".

**Follow-up (same afternoon).** Owner chose: keep `158.1,159.1,160.1` running; reactivate GM login
`singh` (gm@freshbow.in) — done through `admin_set_user_active` as Admin (audited). Re-run:
**28/28 PASS.** Open batches afterwards: `158.1,159.1,160.1` (active) and a draft `1` created by a
user during the session (not touched). No app code changed after the Cloudflare deploy, so the
deployed site and the APK are current.

**NEXT ACTION.** Owner/factory: sign in on https://mushroomos.pages.dev (or the APK) as Admin,
Supervisor, Lab and GM (singh) and click through the same path the script proves. Optional
small fix still open: an onboarding pre-confirm preview (dry run of `onboard_batch` in a
subtransaction) so Admin sees what becomes "before tracking" before confirming.

## Running-batch onboarding — per unit + preview (16 Sep 2026, evening)

**Scope lock (owner):** onboarding screen + its save path only. Another laptop is on Stage 2c; nothing
here touches holds, time gates, eligibility, forecast, tickets, Lab gates, resources or H0 logic.

**Why a backend change was needed (proved, rolled back):** the old `onboard_batch` took only "stream
completed" or "activity is current" and guessed the rest from planned hours (0106). With Bunker 1 at
Holding 1, Pile 2 (which went into Bunker 1) stayed at T1 READY, and Bunker 2 was marked filled though
nobody said so. Owner approved a migration numbered **0125** (gap left for Stage 2c's 0119–0124).

**Migration 0125 — APPLIED to the live DB** (`scripts/apply.mjs`). Rollback:
`db-rollback/pre_0125__onboard_batch.sql` (exact live body before 0125).
- `onboard_batch(..., p_finished_units text[] = '{}', p_exact_units bool = false)` — old signature dropped,
  new one has defaults, so **old calls behave identically** (proved: 113/113 activities identical).
  Exact mode: units are `STREAM|scope_label`; an unstated unit is NOT STARTED; earlier steps of a
  position's own unit are before tracking; a DONE step implies its EXIT predecessors (closed bunker ⇒ both
  piles); anything else that would become history is **refused**, naming units as `[STREAM|scope]`.
- `preview_onboard_batch(same args)` — Admin only; runs `onboard_batch` in a subtransaction, returns every
  activity's resulting state, rolls back (no audit row, draft untouched).

**Frontend:** `src/features/admin/api/onboarding.ts` (units from the batch's own activities; preview;
read-back), `src/features/admin/pages/OnboardBatch.tsx` (per-unit dropdown: Not started / Currently at
<that unit's activities> / Finished; "All: not started · finished" per multi-unit stream; Review = server
preview per unit + Lab summary; Back / Confirm; after save the DB is read back and 10 checks shown),
`OnboardBatch.test.tsx` (4 tests).

**Proof:** `node scripts/onboarding-units-proof.mjs` (migration file inside a rolled-back tx) 15/15;
`--live` 14/14 (U1 is pre-apply only). U2 preview leaves draft untouched · U3 preview = saved (113/113) ·
U4 P1 finished, P2 at T2, P3–P6 not started · U5 B1 filling current, B2/B3 not assumed · U6 0 actual
times, H0 kept · U7 no future READY · U8 audit records units · U9–U12 contradictions refused (also via
preview) · U13 Admin-only preview · U14 Supervisor sees positions · U15 Lab queue readable.
`demo-acceptance.mjs` still 28/28. `tsc` clean; UI tests pass.

**Deployed:** Cloudflare `mushroomos` (bundle `index-BNA5LPRb.js`); debug APK rebuilt with the same bundle.

**Known:** `src/domain/time.test.ts` fails — it reads `docs/_reference/source/book1_hour_grid.json`,
which moved to the archive in the 16 Sep docs cleanup (pre-existing, not touched). The click-through of the
new screen needs a signed-in Admin (password sign-in is the owner's). Gradle's first run after a sync can
fail transiently on OneDrive file locks — rerun.

**NEXT ACTION:** owner signs in as Admin, opens a draft batch → Onboard, sets positions, reviews,
confirms; the screen shows the 10 read-back checks.

## Clear-batches panel + demo batching check (16 Sep 2026, evening)

**Demo batching:** `node mushroomos/scripts/demo-batch-proof.mjs` (rolled back) **11/11 PASS** — the
screen's path (create → plan → `mark_batch_demo` → material → activate) gives an active DEMO batch with
113 tasks and 3 soaks on PROCESS-2026K; Supervisor Start→Finish completes immediately (clock waived,
0098 — known risk 1, unchanged); evidence is still required; the Lab gate still holds; Admin can
delete a demo batch; deleting a real batch is refused; `cancel_batch` is Admin/GM only.

**Frontend (no DB change):** `src/features/admin/components/ClearBatchesPanel.tsx` on the Batches page
("Clear batches…", Admin only). Lists open batches — demo/test pre-ticked, REAL ones shown unticked
with a warning if ticked — cancels the ticked ones with `cancel_batch` (reason recorded), then
optionally deletes every demo/test batch (open-and-just-cancelled or already cancelled) with
`admin_delete_batch`. Typed word `CLEAR` required; per-batch result list. Real cancelled batches cannot
be deleted (server rule) and stay hidden behind "Show cancelled". `listBatches`/`getBatch` now select
`is_demo`; batch cards show a DEMO chip. Test: `ClearBatchesPanel.test.tsx` (2).
Deployed (bundle `index-BjuFqLhU.js`) and APK rebuilt with the same bundle.

## Demo Lab gate chain + 0126 rejection path (16 Sep 2026, evening)

**Owner requirement:** in a DEMO batch, Lab → GM → approval, the remark shown to Admin, then the
Supervisor starts. Demo waives only the clock (0098); Lab approvals are not waived.

**Proof:** `node mushroomos/scripts/demo-lab-gate-proof.mjs` (rolled back; `--with <file>` loads a
migration inside the transaction) — **10/10 PASS live**: Supervisor really does FIB-WET-1 → REST-1
(hold confirmed, not started) → HOP-2 → HEAP; FIB-BUNK-LOAD start refused; Lab sees LAB-BNK-PRE,
samples, records, submits; Lab self-approval refused; still refused; GM rejects with remark → Admin
sees verdict + remark + GM name, Supervisor still refused, Lab work RETURNED + Lab notified; Lab
re-tests and resubmits → awaiting GM again; GM approves with remark → Admin sees it; Supervisor sees
READY and starts; Supervisor can read the remark.

**Bug found and fixed — migration 0126 (APPLIED).** After a GM rejection the Lab activity stayed
COMPLETED (Lab screen could not re-test) and `v_lab_approval_queue.awaiting_decision` was true only
with NO decision, so a rejected gate could never be reopened — real and demo batches alike.
`decide_lab_submission`: a rejection sets the Lab activity RETURNED with "Rejected by gm — <remark>"
and notifies lab_tech. `v_lab_approval_queue` (security_invoker kept): awaiting also when the latest
verdict is `rejected` and the work is COMPLETED again. No existing rows were affected (0 rejected
decisions on live data). Rollback: `db-rollback/pre_0126__lab_rejection_returns.sql`.
`tests/gates.test.ts` SANCTIONED now lists `decide_lab_submission` (the suite refuses remote DBs; not run).
Also re-run live: demo-acceptance 28/28, demo-batch-proof 11/11.

**Frontend:** `loadGatesFor` (shared/api/lab.ts); `gateStatusWords` (shared/utils/labWords.ts);
TaskDrawer shows each Lab gate holding the task — waiting / approved by <name> (GM) · time · “remark” /
rejected — back with the Lab; `LabGateBoard` now lists GM decisions (APPROVED/REJECTED, remark, who,
when, whether the step is open) and is on Admin **Home** as "Lab gates — GM decisions" (also Today).
Test `src/shared/ui/domain/LabGateBoard.test.tsx` (2). Deployed bundle `index-C97HtsmQ.js`; APK same.

**Build note:** OneDrive turned `android/capacitor-cordova-android-plugins/src/main/res/.gitkeep` into a
cloud placeholder and Gradle failed ("Cannot snapshot … not a regular file"); rewriting the file locally fixed it.

## Batch Creation · three fibre selectors (17 Sep 2026)

**Owner:** a 3rd fibre, "just for mixing with the 1st and 2nd fibre when the material is low"; Main, Second
and Third fibre use one list; a later fibre cannot repeat an earlier one; "Not used" is not a material.

**DB (applied):** `0127_third_fibre_role.sql` adds enum value `material_role_code.TERTIARY_FIBRE` (own file —
Postgres cannot use a new enum value in the transaction that adds it). `0128_third_fibre_eligibility.sql`
makes the PRIMARY_FIBRE materials (bagasse new/old, wheat, mustard straw) eligible, no default.
No process activity names the role, so planning/validation are unchanged. Rollback:
`db-rollback/pre_0128__third_fibre.sql` (removes eligibility; refuses if a batch uses it; the enum value stays).

**Frontend:** `BatchStart.tsx` — fibre roles (`ROLE_ORDER` entries ending `_FIBRE`) share one list (union of
their eligible materials); Second/Third exclude earlier choices (`fibreTakenBefore`); changing an earlier fibre
clears a later duplicate (`clearRepeatedFibres`); a duplicate blocks Create with a message; the save lookup uses
the shared list (payload shape unchanged). `api/batches.ts`: `TERTIARY_FIBRE` label/help; ROLE_ORDER now lists the
three fibres together first. `domain/types.ts` MATERIAL_ROLES includes it. Test `BatchStart.test.tsx` (3).
Proof `node mushroomos/scripts/third-fibre-proof.mjs` (rolled back) 5/5: eligibility, bindings saved, 113 tasks,
no blockers, activates, monitor lists it, Second/Third "Not used" still creates the normal batch.
Deployed bundle `index-sACSJjeW.js`; APK rebuilt with the same bundle.
Migrations now live: 0118, 0125, 0126, 0127, 0128 (0119–0124 still left for Stage 2c on the other laptop).

## Batch Creation · Pre-H0 material weights (17 Sep 2026)

**Owner:** a "Weights" section above "Save Pre-H0 Material Entry" — Dry and Fresh weight (kg) for Urea, Ash,
Nitrogen, Gypsum, Bagasse, Paddy, Chicken Manure, Wheat, Mustard, Ammonium Sulphate — saved in the same Pre-H0 save.

**DB (applied):** `0129_prebatch_material_weights.sql` — data only: 20 numeric `lab_parameter` rows
`wt_<material>_<dry|fresh>_kg` (unit kg), so each weight is a reading on the batch's pre-H0 sample like
Moisture/pH/Dry weight (open_prebatch_sample → request_lab_test → record_lab_result; who/when from the server).
No checkpoint parameter list, spec, gate, validation or activation rule changed. Rollback:
`db-rollback/pre_0129__prebatch_weights.sql` (refuses once any weight is recorded).

**Frontend:** `api/prebatch.ts` — `PREBATCH_WEIGHT_MATERIALS`, `weightCode`, `weightReadingsFromInputs`
(blank skipped; number ≥ 0); `recordInitialMaterialForBatch(batch, label, values, weights = {})` puts both on one
sample. Without weights (onboarding) it behaves exactly as before; `PREBATCH_PARAMETERS` is unchanged.
`pages/PrepareBatch.tsx` `MaterialCheck` (now exported) renders the Weights table (Material · Dry kg · Fresh kg)
above the button. Note: "Enter at least one initial material value" now counts a weight as a value too.
Test `PrepareBatch.weights.test.tsx` (4). Proof `node mushroomos/scripts/prebatch-weights-proof.mjs` 5/5 (file in
tx) and `--live` 5/5. Deployed bundle `index-BSFD9jiI.js`; APK rebuilt with the same bundle.
Migrations live: 0118, 0125–0129 (0119–0124 reserved for Stage 2c on the other laptop).

## SOP editing + batch amendments (24 Sep 2026)

**Owner:** an Admin SOP section — pick a running batch, see its H0 timeline, add a step after any open step; draft/edit/publish SOP
versions for future batches. Lab checks on an added step are chosen by the Admin (tick boxes, pre-ticked only as a suggestion from the
template activity's own SOP Lab check; Record or Gate). Cleaning creates real bunker/tunnel jobs; work can wait for them.

**DB (applied live, user-approved):**
- `0130_sop_editing_and_batch_amendments.sql` — `clone_process_definition`, `draft_insert_activity` (re-times only the dependent chain,
  restates a stated envelope), `discard_draft_process`, `amend_batch_add_activity`, `batch_amendment`, `v_batch_amendment`. An amendment
  never writes a frozen plan column: the new task has its own plan and the steps that waited for the chosen step are re-pointed at copies
  of their own SOP rows (per-batch archived definition `AMEND-<batch id>`) whose rule names the new task. No engine function changed.
- `0131_lab_checkpoint_map_amend.sql` — enum label `lab_checkpoint_map.AMEND` (own file: enum values cannot be used in the adding tx).
- `0132_amendment_lab_checks_and_cleaning.sql` — Lab checks become real Lab tasks (map AMEND, exactly the ticked parameters, RECORD or
  GATE via the existing LAB_APPROVED machinery; no spec band invented); cleaning = `request_vessel_cleaning` jobs; new gate kind
  **VESSEL_READY** in `evaluate_gates`. ⚠ `evaluate_gates` was re-created from its LIVE definition (which includes the other laptop's
  0119–0124) plus that one branch. **The Stage 2c laptop must pull 0132 before redefining `evaluate_gates`**, or VESSEL_READY rules become
  'unevaluable'. Rollbacks: `db-rollback/pre_0130__sop_editing.sql`, `db-rollback/pre_0132__evaluate_gates.sql` (live pre-0132 body).

**Proofs (rolled back, run against the live DB after apply):** `node mushroomos/scripts/sop-amend-proof.mjs --live` 14/14;
`node mushroomos/scripts/amend-lab-clean-proof.mjs --live` 9/9. Existing batches byte-identical in both.

**Frontend:** `/admin/sop` (SopHome), `/admin/sop/batch/:id` (SopBatchEditor), `/admin/sop/version/:id` (SopVersionEditor);
`components/SopLaneChart.tsx`, `components/InsertActivityPanel.tsx`, `api/sop.ts`; "SOP" in the Admin nav; BatchStart accepts
`?process=<id>`; `listProcessVersions` hides AMEND- rows. `npx tsc --noEmit` clean; admin vitest 17/17.

**Live fixture:** `DEMO-SOP-1` (is_demo, PROCESS-2026K v1, active) created for UI testing — cancel when done.

**Found, not ours:** live DB has PROCESS-2026L (published, not current; all three real batches on it) and migrations 0119–0124 that are
in no repo/remote — push them from the other laptop. Current SOP is still PROCESS-2026K.
