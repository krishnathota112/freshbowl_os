# MushroomOS — System Architecture V1

**Status: FROZEN as of 2026-08-29.** Changing anything in §3, §8, §9, §10 or §17 requires an
architecture task and an entry in `docs/process/CONFIRMED_DECISIONS.md`. Everything else may evolve.

This document exists so that five people and agents can work on different parts of MushroomOS at the
same time without producing five incompatible versions of it. It is descriptive where the system
already works this way, and prescriptive where it does not — and it says which is which, every time.

Read `docs/architecture/INTEGRITY_FIXES_2026-08-29.md` for the security work this rests on.

---

## 1 · System purpose

MushroomOS exists so that management can answer, of any batch, at any hour:

> What should have happened? What actually happened? When did it diverge? Who did it? What resource
> was used? Where was the material? What measurements were taken? What evidence proves it? Who
> approved it? Was an extension requested and by whom approved? What did the delay do to H552?

Two consequences follow, and everything in this document is downstream of them:

1. **The system must make it hard to retroactively make an actual event look compliant.** Not
   merely discouraged in the UI — refused by the database.
2. **The factory process will keep changing.** So the process cannot be code. It is data, versioned,
   and the engine must not know what a mushroom is.

---

## 2 · Domain boundaries

Ten domains. Each owns its tables and its rules. Others consume its contract, never its tables.

| Domain | Answers | Owns |
|---|---|---|
| **A · Process Definition** | What *should* happen? | the approved process, versions, activities, dependencies, durations, gate definitions, evidence & lab & resource requirements, variants |
| **B · Planning** | What are we planning for *this* batch? | monthly schedule, master batch, Day-0 answers, H0, generated plan, baseline creation |
| **C · Execution** | What *actually* happened? | actual start/end, quantities, readings, actor, machine, location |
| **D · Evidence** | What *proves* it? | storage objects, metadata, activity association, capture time, supersession |
| **E · Lab** | What did the material say? | checkpoints, samples, tests, results, decisions, retests |
| **F · Workflow / Gates** | *Can* this happen yet? | eligibility, dependency progression, rest gates, blocked states, supervisor verdicts |
| **G · Authorization** | Was the exception *legitimately authorised*? | extension requests, manager & GM approvals, overrides, deviations, checkpoint decisions |
| **H · Resources / Movement** | Where is the material, on what machine? | machines, vessels, locations, allocations, occupancy, movements |
| **I · Time / Forecast** | Where does it land? | H-axis arithmetic, variance, forecast, H552 impact — **calculations only, never truth** |
| **J · Audit** | Who did or approved what? | append-only event trail across every domain |

**Authorization is a separate domain from both Plan and Actual, deliberately.** Collapsing it into
either is the single most damaging mistake available in this codebase.

---

## 3 · The five-register model — FROZEN

This is the central contract. Every agent must know it before touching anything.

```
┌──────────────────────────────────────────────┐
│ STANDARD    the approved factory process     │  versioned; frozen on publish
└───────────────────────┬──────────────────────┘
                        ▼
┌──────────────────────────────────────────────┐
│ PLAN        this batch's frozen baseline     │  written once, at activation
└───────────────────────┬──────────────────────┘
            ┌───────────┴───────────┐
            ▼                       ▼
┌──────────────────────┐  ┌──────────────────────┐
│ ACTUAL               │  │ AUTHORIZATION        │
│ what happened        │  │ what was permitted   │  additive only
└──────────┬───────────┘  └──────────┬───────────┘
           └───────────┬─────────────┘
                       ▼
              ┌────────────────┐
              │ FORECAST       │  derived only, stored nowhere as truth
              └────────────────┘
```

| Register | Written by | After write |
|---|---|---|
| STANDARD | admin, before publish | new **version**, never an edit |
| PLAN | `generate_activity_plan` (draft), frozen at `activate_batch` | **never** |
| ACTUAL | execution RPCs | **append-only** |
| AUTHORIZATION | approval RPCs | **additive only** |
| FORECAST | nobody — derived | recomputed on read |

The whole integrity claim reduces to one sentence:

> **Nothing written after activation may write into PLAN, and nothing at all may rewrite ACTUAL.**

Registers never write to each other. They are joined by **pure read functions**:

```
variance    = ACTUAL − PLAN
compliance  = ACTUAL vs (PLAN + AUTHORIZATION)
forecast    = PLAN + ACTUAL-so-far + AUTHORIZATION
exposure    = forecast(H552) − PLAN(H552)
```

**If a number can be computed, it is never stored.** Stored numbers are the ones a human or a clock
produced.

---

## 4 · Database ownership map

56 tables, 24 views, 97 application functions. RLS is enabled on **every** table — verified.

### A · Process Definition
`process_definition` · `process_activity` · `process_day` · `phase` · `gate_rule` ·
`evidence_requirement` · `resource_requirement` · `lab_checkpoint` · `lab_spec` · `lab_method` ·
`movement_rule` · `movement_template` · `activity_variant` · `activity_field` ·
`material` · `material_spec` · `material_role_eligibility` · `phase2_control_band` ·
`conflict_register` · `vessel_scope_map`

Write policy: `has_role('admin')`. **Gap — see §7:** there is no published/frozen flag, so a
definition an active batch was built from is still editable.

### B · Planning
`master_batch` · `batch_activity` *(the `planned_*` and `baseline_*` columns only)* ·
`batch_process_config` · `batch_material_role` · `batch_activity_evidence_req` ·
`monthly_schedule_import` · `monthly_schedule_group` · `individual_batch` · `factory_clock`

### C · Execution
`batch_activity` *(the `actual_*` columns only)* · `batch_activity_value` · `machine_usage`

`batch_activity` is the one table two domains share. Planning owns its plan columns, Execution owns
its actual columns, and `trg_plan_is_frozen` is what keeps that boundary real rather than a
convention. **No new domain may add a column to this table without an architecture task.**

### D · Evidence
`evidence_media` + the `evidence` storage bucket

### E · Lab
`lab_sample` · `lab_test` · `lab_result` · `lab_decision` · `lab_approval_reading` ·
`lab_instrument` · `lab_setting` · `lab_checkpoint_conflict`

### F · Workflow / Gates
`deviation` · `corrective_action` · `notification`
(gate *definitions* belong to A; gate *evaluation* is a pure function, §10)

### G · Authorization
`extension_request` · `extension_policy` · `checkpoint_decision` · `management_checkpoint`

### H · Resources / Movement
`machine` · `location` · `location_occupancy` · `batch_movement` · `batch_vessel_allocation` ·
`resource_policy`

### I · Time / Forecast
**No tables.** Views only. This is load-bearing.

### J · Audit
`audit_event` — append-only by trigger

### Not a domain — development scaffolding
`dev_effective_clock` · `dev_environment_marker`. See §7 and §23.

### Write access at a glance

- **24 tables** carry an admin write policy — all of Process Definition, plus `master_batch`,
  `batch_process_config`, `batch_material_role`, `factory_clock`, `extension_policy`.
- **32 tables have no write policy at all.** Every write goes through an RPC. This includes all of
  Execution, Evidence, Lab, Audit, Authorization and Movement.
- `profiles` is the exception that proves the rule: three SELECT policies and three explicit
  `false` write policies. A role is granted by SQL or the service role, never by its holder.

---

## 5 · RPC ownership map

Only RPCs are listed; trigger functions and `btree_gist` internals are omitted.

| Domain | RPCs |
|---|---|
| **A Process** | *(none — admin writes tables directly under RLS)* |
| **B Planning** | `create_master_batch` · `generate_activity_plan` · `set_activity_plan` · `clear_planned_time` · `set_batch_start_at` · `set_individual_batches` · `validate_batch` · `activate_batch` · `cancel_batch` · `assign_activity` · `import_monthly_schedule` · `claim_monthly_schedule_group` · `cancel_monthly_schedule_group` |
| **C Execution** | `start_activity` · `submit_activity` · `advance_batch` · `release_elapsed_rests` · `open_machine_stint` · `close_machine_stint` |
| **D Evidence** | `bind_evidence` · `can_capture_for_activity` · `mark_evidence` *(legacy)* |
| **E Lab** | `open_lab_sample` · `open_prebatch_sample` · `request_lab_test` · `record_lab_result` · `accept_lab_result` · `decide_lab_submission` · `order_retest` |
| **F Gates** | `evaluate_gates` · `evaluate_cardinality` · `gate_predecessor_status` · `render_gate_reason` · `hold_activity` · `release_activity` · `return_activity` · `raise_deviation` · `accept_with_deviation` · `escalate_deviation` · `add_corrective_action` · `verify_corrective_action` · `send_alert` |
| **G Authorization** | `request_extension` · `manager_decide_extension` · `gm_decide_extension` · `cancel_extension` · `expire_extensions` · `extension_is_effective` · `gm_decide_override` · `record_checkpoint_decision` · `checkpoint_package` |
| **H Resources** | `allocate_vessel` · `release_vessel` · `set_movement_vessel` · `record_occupancy` |
| **I Time** | `factory_h0_instant` · `factory_instant` · `hour_within_batch_day` · `set_factory_timezone` |
| **Security** | `current_app_role` · `has_role` · `assert_role` · `custom_access_token_hook` |

**Owner-only, never client-callable** — the four that could rewrite a register:
`repoint_batch_activities` · `repoint_one_activity` · `fn_make_extension_effective` ·
`sync_role_claim`

### Naming rule for new RPCs
`<verb>_<noun>`, one transition per RPC, each asserting its own role and stamping its own
timestamps. A client may never pass a status, a decision, an approval or a timestamp.

---

## 6 · Data contracts

### The two rules that make parallel work safe

1. **Read from views, never from base tables.**
2. **Write through RPCs, never `insert`/`update`.**

A screen built this way can be rebuilt completely without a backend change, and is structurally
unable to encode a factory rule — because it is never handed one.

### Contracts, by domain

```
EXECUTION            startActivity(activityId)
                     submitActivity(activityId, values, remark)
                     getCurrentWork(userId)          → v_live_batch
                     getExecutionHistory(batchId)    → v_batch_event

EVIDENCE             uploadEvidence(activityId, requirementKey, file)
                     listEvidence(activityId)        → v_evidence_state
                     canCapture(activityId)

LAB                  getEligibleTests()              → v_lab_queue
                     openSample / requestTest / recordResult / acceptResult
                     getLabHistory(batchId)          → v_lab_result_history

AUTHORIZATION        requestExtension(activityId, hours, reason, evidence?)
                     managerDecide(requestId, approve, reason, grantedHr?)
                     gmDecide(requestId, approve, reason, grantedHr?)
                     getAuthorizationHistory(batchId)→ v_extension_request
                     getExpectation(activityId)      → v_activity_expectation

GATES                getGateState(activityId)        → evaluate_gates
                     hold / release / return / raiseDeviation

RESOURCES            allocateVessel / releaseVessel / setMovementVessel
                     getPlantNow()                   → v_plant_now
                     getUtilisation()                → v_machine_utilisation

TIME / FORECAST      getVariance(batchId)            → v_batch_variance
                     getContributors(batchId)        → v_variance_contributor
                     getTiming(activityId)           → v_activity_timing
```

### Where the contract currently leaks — **this is the main refactor**

`src/api/*` is already the contract layer, but several modules read base tables:

| Module | Reads base tables | Should read |
|---|---|---|
| `batch.ts` (534 ln) | `batch_activity`, `master_batch`, `batch_activity_value`, `batch_activity_evidence_req` | `v_live_batch`, `v_activity_timing`, `v_evidence_state` |
| `schedule.ts` | `batch_activity`, `master_batch`, `machine`, `location`, `profiles` | a planning view that does not exist yet |
| `lab.ts` | `lab_sample`, `lab_test`, `lab_checkpoint` | `v_lab_queue`, `v_lab_result_history` |
| `controlRoom.ts` | `batch_activity`, `gate_rule`, `profiles` | a gate view that does not exist yet |
| `tower.ts`, `batches.ts` | `batch_activity`, `master_batch` | `v_live_batch` |

And **`batch.ts` spans three domains at once** — Planning (`create_master_batch`, `activate_batch`,
`generate_activity_plan`), Execution (`start_activity`, `submit_activity`) and Evidence
(`bind_evidence`). It is the file two juniors will collide in. Splitting it is task **ARCH-002**.

---

## 7 · Process versioning

**Current state:** `process_definition` carries a code and a version, `master_batch` pins the
definition it was built from, and `batch_activity` copies `code`, `title` and `stream` at generation
so a row stays readable if the definition changes.

**Gap:** there is no publish step. `process_definition` and `process_activity` are writable by an
admin at any time under `ref_write`, including a definition that activated batches were generated
from. Editing one silently changes what "the standard" means for a batch that already ran.

**Required (ARCH-003):**
- `process_definition.published_at`, `published_by`, `status ∈ (draft, published, retired)`
- a trigger refusing any write to a `published` definition or its children
- `publish_process_version(id)` — the only way to move `draft → published`
- a new version is a **copy**, never an edit; `supersedes_id` links them
- `PROCESS-2026B` is the current standard; `ROUTE-2026A` is archived reference and is **never**
  merged into it

---

## 8 · Plan freeze — FROZEN, enforced

> Once `master_batch.status` leaves `'draft'`: `planned_start_at`, `planned_end_at`,
> `baseline_start_hour`, `baseline_end_hour`, `planned_time`, `day0_duration_hr` never change again,
> for anyone, by any path. `master_batch.start_at` (H0) never moves. Activation is one-way; a batch
> that must not run is **cancelled**.

Four enforcement layers — grants, in-function guards, `trg_plan_is_frozen`,
`trg_activation_is_one_way`. Proven by 14 tests in `tests/baselineImmutability.test.ts`.
Details in `INTEGRITY_FIXES_2026-08-29.md` §2.

**Never weaken this to make a feature easier.** If a feature seems to need a mutable plan, the
feature is wrong: the answer is a deviation, an override, or an authorised extension.

---

## 9 · Actual immutability — PARTIAL, and the next gap to close

**Enforced today:** `audit_event` and `checkpoint_decision` are append-only by trigger.
`extension_request` is write-once on the request and on each decision. `actual_recorded_at` is kept
distinct from `actual_start`/`actual_end` — when the server heard it versus when the operator says
it happened. That distinction is correct and must survive any refactor.

**Not enforced:** `batch_activity.actual_start` and `actual_end` can be **overwritten** after being
set. An operator can restate the past. This is F1's sibling and it is the highest-priority remaining
integrity gap.

**Required (ARCH-001):** a `BEFORE UPDATE` trigger refusing a change to a non-null `actual_start` or
`actual_end`. A correction becomes a **new superseding record with a reason**, exactly as
`evidence_media.superseded_by_id` already models supersession — never an overwrite.

---

## 10 · Authorization / extension model — BUILT

`STANDARD PLAN + EXTENSION REQUEST + MANAGER APPROVAL + GM APPROVAL = AUTHORISED EXPECTATION`,
while ORIGINAL PLAN, ACTUAL EXECUTION and AUDIT HISTORY all persist separately.

```
planned end            12:00      the frozen baseline
approved extension     +2h        the authorization register
authorised end         14:00      derived
actual end             13:40      the execution record
original variance      +1h40m     STILL VISIBLE — never erased
within authorisation   yes
```

Applying an extension by moving `planned_end_at` would erase the +1h40m. §8's trigger refuses it.

Three decisions, recorded so they are not re-litigated:
- **Approval only narrows.** A manager may grant less than requested, never more; the GM may not
  exceed the manager.
- **The authorised window runs from the PLANNED end, not the approval.** Otherwise a late approval
  silently buys extra time.
- **A request after completion is refused.** That is a request to rewrite history — use a deviation.

Seven factory rules are still open and each is a column of `extension_policy` with a TBD marker
(`TBD-EXT-1` … `TBD-EXT-7`). **Answering one is an `UPDATE`, not a migration.** 21 tests.

---

## 11 · Evidence model

`capture → upload to storage → evidence_media row → requirement recount → gate → retrieval`.

- The storage path is `{batch}/{activity}/{uuid}.ext` and is **unique**, so one upload cannot be
  bound twice to inflate a count.
- `uploaded_by` comes from the JWT, never a parameter. `uploaded_at` is a server timestamp — a device
  clock is not evidence of when a photograph was taken.
- Requirements are **named**, not counted. `NMIX-ROTAVATE` has three: before, after, and the
  ammonium-sulphate hand-mixing photo. Never "3 photos".
- Supersession, not deletion: `superseded_by_id` with a mandatory reason.
- `mark_evidence` is legacy — it forged a counter with no file. **Do not use it in new code.**

**Not yet verified end to end.** `tests/evidence.test.ts` currently skips all 20 tests because
storage returns `403 AccessDenied` — no service key is configured. Until that runs, "evidence is
real" is an assertion, not a proof. Task **ARCH-004**.

---

## 12 · Lab model

**Confirmed:** any authorised user may perform a lab test — operator included. Lab has its own
interface. A test takes roughly 30–40 minutes. HP1 must finish and its output must rest one hour
before lab eligibility.

**"Who may perform" is authorization, not a separate data model.** There is one lab data model; the
role decides who may write to it. Do not fork the schema per role.

**No lab thresholds are invented.** `lab_spec` is keyed `(checkpoint, parameter)`. Out-of-range never
blocks recording — it forces a remark and raises a deviation, and the deviation blocks the gate.

---

## 13 · Resource / movement model

Resources are **separate from process definitions**. A process activity names a *class* of machine,
never `JCB-01`. This is what lets the factory add a loader without touching the process.

A movement carries source, destination, resource, start, finish, actor, machine and evidence.
**Vessels are allocated per movement, not owned by a batch** — bunkers pool N:M (3 bunkers → 4
tunnels), and individual batch identity binds at tunnel loading, not bunker loading.

**Open defect:** three `location_occupancy` rows exist for vessels nobody allocated
(`tests/plant.test.ts`). Occupancy must derive from recorded movement and invent nothing. Task
**ARCH-006**.

---

## 14 · Time / H0 / H552 model

- The factory runs **24 hours a day, every day.** All durations are elapsed time. There are no
  working-day calendars, and none may be introduced.
- **H0 → H552** is the production axis. Calendar dates are a projection for humans.
- H0 is `master_batch.start_at`, set explicitly, frozen at activation. It never defaults.
- `baseline_start_hour` / `baseline_end_hour` are **coordinates on the axis**, not quantities of
  time. `duration_*_hr` are quantities. `tests/resources.test.ts` criterion 20 enforces that every
  hour-named column in the schema is classified as `AXIS`, `PLAN`, `CAPABILITY`, `PROVENANCE` or
  `AUTHORISATION`. **Extend that list when you add a column; never loosen its pattern.**

### The dev clock — read this before trusting a timestamp
`dev_effective_clock` and `get_effective_now()` let an admin or GM move the *displayed* now, gated on
a `dev_environment_marker` row so it is inert on a production database.

**It is used by exactly one file, `src/lib/now.ts`, and by no write path.** Server timestamps are
real `now()`. That must stay true:

> **INVARIANT: `get_effective_now()` must never be called from a function that writes ACTUAL,
> AUTHORIZATION or AUDIT.** The moment it is, actual timestamps become admin-settable and the
> product's central claim is void.

---

## 15 · Forecast model

Derived, stored nowhere as truth.

```
forecast = PLAN + ACTUAL-so-far + approved AUTHORIZATION
exposure = forecast(H552) − PLAN(H552)
```

Present: `v_batch_variance`, `v_stream_variance`, `v_variance_contributor`, `v_activity_timing`,
`v_activity_expectation`. All of these look **backwards**.

**Missing:** a forward projection to H552.

**The factory has not confirmed a forecasting formula.** So the *basis* must be replaceable — one
view, swapped without touching PLAN or ACTUAL. The current working assumption, recorded as an
assumption and not as a factory rule:

> Downstream planned activities shift by the accumulated variance of their predecessors, **except
> across a time gate**, where the rest duration is absolute and absorbs upstream lateness rather than
> adding to it.

**Do not bake this into any screen.** Task **ARCH-005**.

---

## 16 · Audit model

`audit_event` — `occurred_at`, `actor_id`, `actor_role`, `action`, `entity_table`, `entity_id`,
`before_state`, `after_state`, `reason`. Append-only by trigger.

Every state transition writes one. Every extension transition is proven to write one with a named
actor.

**Open defect:** the current demo batch's event log is stamped H456 throughout with "no actor
recorded". A history with no actor answers none of §1's questions. Task **ARCH-007**.

---

## 17 · Security boundaries — FROZEN

1. **RLS on every table.** Verified: zero tables with RLS off. Deny-by-default.
2. **Role resolution:** JWT `app_metadata.app_role` first, `profiles.role` second. Never anything a
   client controls. `profiles` is read-only to every client role.
3. **`assert_role` fails closed.** `has_role` returns `coalesce(…, false)` — never NULL. This was a
   real hole (F6) and the `coalesce` is what closes it.
4. **All state transitions are server-enforced.** Clients may *request*; the server decides
   eligibility, timestamps, gate satisfaction, permission, approval authority and validity.
5. **Never trusted from a client:** timestamps, clocks, countdown completion, approval status,
   variance, gate satisfaction, eligibility, role.
6. **`SECURITY DEFINER` functions that can rewrite a register are revoked from every client role.**

**Weakening any of these six requires an architecture task.** "It was easier for the UI" is not a
reason.

---

## 18 · UI boundaries

**Current structure is `src/routes/*.tsx` + `src/api/*.ts` — flat, not `src/features/`.** The
proposed feature-folder layout does not exist yet; ARCH-002 introduces it. Until then, ownership is
assigned by *route file* and *api module*, which is unambiguous today.

| Domain | Routes | API modules |
|---|---|---|
| Process | `ProcessExplorer`, `ReferenceData` | `processDefinition` |
| Planning | `NewBatch`, `ScheduleBuilder` (1245 ln), `MonthlySchedule`, `AdminToday`, `Batches` | `schedule`, `monthlySchedule`, `adminToday`, `batches` |
| Execution | `MyWork`, `TaskDrawer`, `BatchDetail` (997 ln) | `batch` *(shared — see §6)* |
| Lab | `LabQueue` (704 ln) | `lab` |
| Gates | `ControlRoom` | `controlRoom` |
| Authorization | **none yet** | **none yet** |
| Resources | `Plant`, `Resources` | `plant`, `movements` |
| Management | `ControlTower`, `BatchPage`, `Gallery` | `tower`, `batchPage` |

### Role lenses over the same data
Operator "what do I do now?" · Lab "what test is due?" · Manager "what decision is needed?" ·
GM "how is the factory performing?" · Founder "why is it late, who caused it, show me the proof."

Five lenses, **one underlying truth**. A role-specific number that no other role can see is a bug.

### Reusable primitives
H-hour rail · process graph · parallel lanes · resource map · attention stream · proof drawer ·
causality chain. These live in `src/components/` and belong to no single domain — changing one is a
shared-surface task.

---

## 19 · Agent ownership boundaries

| Owner | Owns | May read |
|---|---|---|
| **Junior A** | `src/routes/MyWork`, `TaskDrawer`, `BatchDetail` + `src/api/execution.ts` | any view, any contract |
| **Junior B** | `src/routes/LabQueue` + `src/api/lab.ts` | any view, any contract |
| **Junior C** | `src/routes/Plant`, `Resources` + `src/api/plant.ts`, `movements.ts` | any view |
| **OpenCode** | `src/routes/ControlTower`, `BatchPage`, `Gallery` + `src/api/tower.ts`, `batchPage.ts` | any view |
| **Claude** | `supabase/migrations/**`, `tests/**`, `docs/architecture/**` | everything |
| **You** | process decisions, stakeholder changes, UX freeze, `docs/process/**` | everything |

### DO NOT TOUCH — without an explicit architecture task

```
process definitions            production seed data
migrations owned by another    the authentication model
RLS policies                   actual execution records
baseline immutability          audit history
forecast logic                 shared components in src/components/
```

**And the rule that matters most:** if you find a bug outside your boundary, you **report it**, you
do not fix it. A casual fix to a foundational table is how five parallel workstreams become one
broken one.

---

## 20 · Change-impact matrix

| Change | May affect | Must NOT affect |
|---|---|---|
| A process **duration** | plan generation, dependent planned times, forecast, timeline UI | historical actuals, evidence, users, lab schema, resources |
| An **evidence requirement** | operator UI, lab UI, evidence validation | H0, durations, historical actuals |
| A **lab measurement** | lab schema/config, lab UI | the process engine |
| A **new material** | `material`, `material_role_eligibility` | process definitions — codes are `FIB1-`, never `BG-` |
| A **new machine or vessel** | resource tables, plant UI | process definitions — they name classes, never units |
| The **approval chain** | authorization domain, manager/GM UI | PLAN, ACTUAL |
| The **forecast formula** | one view, management UI | every other register |
| A **process version** | new batches only | historical batches, which stay explainable |
| A **screen** | that screen | nothing else, ever |

If your change affects something in the right-hand column, **stop** — it is an architecture task.

---

## 21 · Testing strategy

**Every test runs inside a transaction that is rolled back.** The only database is the deployed one;
a test that leaves rows behind corrupts the thing it protects.

Four layers:
1. **Invariant tests** — the register boundaries. `baselineImmutability`, `roleResolution`,
   `extensionRegister`. These are the ones that must never be weakened to make a test pass.
2. **Engine tests** — cardinality, gates, hour axis, plan generation.
3. **Contract tests** — each view returns the shape a screen depends on.
4. **Tripwires** — tests designed to fail when the schema grows in an unclassified direction, such
   as criterion 20 in `resources.test.ts`. **Extend the classification; never loosen the pattern.**

Rules:
- Assert the **outcome**, not the mechanism. An RLS `USING (false)` affects zero rows rather than
  raising — asserting the exception would have been asserting the wrong thing.
- Every refusal test asserts three things: that it was refused, that **nothing was written**, and
  that the message is one a human can act on.
- A test that skips must say why. A green run must mean assertions were actually made.

Current: **431 passing.** 32 failures, all traced to a database holding one batch where the suites
expect three staged demo batches; 20 evidence tests skipped for want of a storage key. See §23.

---

## 22 · Current gaps — ranked

| # | Gap | Domain | Task |
|---|---|---|---|
| 1 | `actual_start`/`actual_end` can be overwritten | Execution | ARCH-001 |
| 2 | `batch.ts` spans Planning + Execution + Evidence | UI/contracts | ARCH-002 |
| 3 | No publish/freeze on process definitions | Process | ARCH-003 |
| 4 | Evidence never proven end to end — 20 tests skipped | Evidence | ARCH-004 |
| 5 | No forward forecast to H552 | Forecast | ARCH-005 |
| 6 | Occupancy rows for vessels nobody allocated | Resources | ARCH-006 |
| 7 | Demo event log: all H456, "no actor recorded" | Audit | ARCH-007 |
| 8 | Schema drift: 2 tables + 11 functions in DB, in no migration | Infrastructure | ARCH-008 |
| 9 | `send_alert` has no `assert_role` at all | Gates | ARCH-009 |
| 10 | Contract leak: api modules read base tables | UI/contracts | ARCH-010 |
| 11 | No Authorization UI — the register has no screen | Authorization | MGMT-001 |
| 12 | Missing demo data; `controlRoom` 30 s timeout | Test env | ARCH-011 |

---

## 23 · Migration strategy

**Migrations are forward-only, numbered, and are the source of truth for schema.** They are applied
in filename order by `npm run db:migrate`; `scripts/apply.mjs` applies named files in one
transaction.

**They are not currently a complete source of truth, and that is gap #8.** The deployed database
contains, created by no migration:

```
tables     dev_effective_clock  dev_environment_marker
functions  get_effective_now  set_dev_clock_h  pause_dev_clock  play_dev_clock
           reset_dev_clock_to_live  assert_dev_clock_writer  dev_environment_enabled
           cancel_monthly_schedule_group  demo_day0_config  fn_audit_plan_generated
           rls_auto_enable
```

A fresh project built from `supabase/migrations/` would be a **different database**. With five
parallel workstreams that is untenable: it means nobody can trust a local environment. ARCH-008
captures these into `0037_capture_deployed_drift.sql` and adds a CI check that the migrations
reproduce the deployed schema.

Rules going forward:
- **Never edit an applied migration.** Add a new one.
- One migration per task, numbered by claim order, named for what it does.
- A migration that changes a §17 security boundary needs an architecture task.
- Every migration carries a header saying what invariant it establishes and why.

---

## 24 · Rules for future agents

### The canonical workflow

```
READ  →  UNDERSTAND  →  IDENTIFY DOMAIN  →  READ CONTRACT  →  CHECK DEPENDENCIES
      →  IMPLEMENT   →  TEST  →  UPDATE HANDOVER  →  REPORT
```

Never: *see bug → change random table → break something else.*

### Before you write anything
1. Which domain does this belong to? (§2)
2. Which register does it write? (§3)
3. Is that register frozen or append-only? (§8, §9)
4. Does the contract already exist? (§6)
5. Does it appear in the right-hand column of §20?
6. Is it inside your boundary? (§19)

### Ten standing rules
1. **The process is data.** No factory rule lives in code or in a screen.
2. **No material name in a process definition.** `FIB1-WEIGH`, never `BG-WEIGH`.
3. **Never merge `PROCESS-2026B` with `ROUTE-2026A`.** The latter is archived reference.
4. **Never invent a factory rule.** Unknowns stay marked `TBD-*` with a stated default.
5. **The process shape is fixed; the content is the admin's.** Options, not a blank page.
6. **Out-of-range never blocks recording.** It forces a remark and raises a deviation.
7. **If a number can be computed, do not store it.**
8. **A refusal must name what to do instead.**
9. **Report bugs outside your boundary; do not fix them.**
10. **Update the handover before you report done.**

### The repo answers "what is implemented". Obsidian answers "why did we decide this".
`T:\obsidian\memory` holds the decision memory. A decision that only exists in a commit message is
a decision that will be re-litigated.
