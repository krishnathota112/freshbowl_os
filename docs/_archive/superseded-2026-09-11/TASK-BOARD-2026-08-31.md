# Task board

Derived from `docs/_reference/SYSTEM_ARCHITECTURE_V1.md`. Every task is self-contained: an agent
should be able to act on one without reading the conversation that produced it.

**Claim a task by putting your name in Owner and moving it to In Progress. One task, one migration,
one branch of work. If you find something outside your Allowed files — report it, do not fix it.**

| Legend | |
|---|---|
| 🔒 | touches a FROZEN boundary — architecture task, Claude only |
| ⛔ | blocks the demo |
| 🟢 | safe for parallel work, no boundary risk |

---

## Ready — ordered by what unblocks the most

### ARCH-001 · Make actual execution records immutable 🔒⛔
**Domain** Execution · **Register** ACTUAL · **Owner** _unclaimed (Claude)_

**Goal.** `batch_activity.actual_start` and `actual_end` can currently be overwritten after being
set, so an operator can restate the past. This is the sibling of the baseline freeze and the last
place the product's central claim leaks.

**Approach.** A `BEFORE UPDATE` trigger refusing a change to a non-null `actual_start` / `actual_end`.
A correction becomes a **new superseding record with a reason** — model it on
`evidence_media.superseded_by_id`, which already does this correctly. Do not add an "edit" path.

**Allowed files** `supabase/migrations/0038_*.sql` · `tests/actualImmutability.test.ts`
**Do NOT modify** `batch_activity` plan columns · `trg_plan_is_frozen` · RLS · any screen

**Acceptance**
- setting an actual once succeeds; overwriting it is refused by the table
- the refusal names the column and says what to do instead
- a supersession path exists and is tested
- `submit_activity` and `start_activity` still work unchanged
- existing 431 passing tests still pass

---

### ARCH-008 · Capture the deployed schema drift 🔒⛔
**Domain** Infrastructure · **Owner** _unclaimed (Claude)_

**Goal.** 2 tables and 11 functions exist in the deployed database that **no migration creates**, so
a fresh project built from `supabase/migrations/` is a different database. With five parallel
workstreams nobody can trust a local environment until this is closed.

**The drift** — `dev_effective_clock`, `dev_environment_marker`; `get_effective_now`,
`set_dev_clock_h`, `pause_dev_clock`, `play_dev_clock`, `reset_dev_clock_to_live`,
`assert_dev_clock_writer`, `dev_environment_enabled`, `cancel_monthly_schedule_group`,
`demo_day0_config`, `fn_audit_plan_generated`, `rls_auto_enable`.

**Approach.** `pg_get_functiondef` / DDL for each, into `0037_capture_deployed_drift.sql`, applied
with `create ... if not exists` / `create or replace` so it is a no-op against the current database.
Then a script that diffs migrations-built schema against deployed and fails on drift.

**Also assert the dev-clock invariant here** (§14): `get_effective_now()` must never be reachable
from a function that writes ACTUAL, AUTHORIZATION or AUDIT. Write it as a test that greps function
bodies, so it fails the day someone wires it in.

**Allowed files** `supabase/migrations/0037_*.sql` · `scripts/schema-diff.mjs` ·
`tests/schemaDrift.test.ts`
**Do NOT modify** any existing migration · any function body being captured

**Acceptance**
- applying 0037 to the deployed database changes nothing
- `scripts/schema-diff.mjs` reports zero drift and exits non-zero when drift exists
- the dev-clock invariant is a failing-by-design test

---

### ARCH-011 · Restore the demo data and green the suite ⛔
**Domain** Test env · **Owner** _unclaimed_

**Goal.** 32 of 483 tests fail solely because the database holds one batch where the suites expect
three staged demo batches (`MB-DEMO-EARLY` / `MID` / `LATE`), and 20 evidence tests skip for want of
a storage key. Until this is clean, nobody can tell a regression from an environment.

**Approach.** Run `scripts/stage-history.mjs`; configure a storage service key; re-run. Then
investigate the two failures that are **not** missing data: `plant` (three occupancy rows for
vessels nobody allocated → ARCH-006) and `controlRoom` (30 s timeout).

**Allowed files** `scripts/stage-history.mjs` · `.env.local` · test fixtures
**Do NOT modify** any migration · any RPC · the assertions themselves

**Acceptance**
- three demo batches exist, staggered, with staged history
- evidence tests run rather than skip
- the only remaining failures are ARCH-006 and the `controlRoom` timeout, each with a diagnosis

---

### ARCH-002 · Split `batch.ts` along domain lines 🟢
**Domain** UI / contracts · **Owner** _unclaimed_ · **Blocks Junior A and Junior B from colliding**

**Goal.** `src/api/batch.ts` (534 ln) spans three domains: Planning (`create_master_batch`,
`activate_batch`, `generate_activity_plan`), Execution (`start_activity`, `submit_activity`) and
Evidence (`bind_evidence`). It is the file two juniors will collide in.

**Approach.** Split into `src/api/planning.ts`, `src/api/execution.ts`, `src/api/evidence.ts`.
Pure move — **no behaviour change, no RPC change**. Update imports in `BatchDetail`, `MyWork`,
`TaskDrawer`, `NewBatch`, `Batches`, `Gallery`, `AdminToday`.

**Allowed files** `src/api/*` · `src/routes/*` imports only · `tests/*` imports only
**Do NOT modify** any RPC · any migration · any component · any assertion

**Acceptance**
- `npm run typecheck` and `npm run build` clean
- every test that passed before still passes, unchanged
- no file in `src/api/` touches more than one domain's RPCs
- the diff is imports and moves, nothing else

---

### ARCH-010 · Close the contract leak 🟢
**Domain** UI / contracts · **Owner** _unclaimed_ · **Do after ARCH-002**

**Goal.** Several api modules read base tables instead of views, so a schema change breaks screens
and a screen can see things it should not.

| Module | Reads | Should read |
|---|---|---|
| `execution.ts` | `batch_activity`, `batch_activity_value` | `v_live_batch`, `v_activity_timing`, `v_evidence_state` |
| `lab.ts` | `lab_sample`, `lab_test`, `lab_checkpoint` | `v_lab_queue`, `v_lab_result_history` |
| `tower.ts`, `batches.ts` | `batch_activity`, `master_batch` | `v_live_batch` |
| `controlRoom.ts` | `batch_activity`, `gate_rule` | **a gate view that does not exist yet** |
| `schedule.ts` | 6 base tables | **a planning view that does not exist yet** |

**Approach.** Where a view exists, switch to it. Where one does not, **specify** it and hand the
specification to Claude as a migration task rather than reading the base table "for now".

**Allowed files** `src/api/*` · a new `docs/02-architecture/DATA-CONTRACTS.md`
**Do NOT modify** migrations · RPCs · RLS

**Acceptance**
- no `src/api/` module selects from a base table, or the exception is listed with a reason
- the two missing views are specified with their columns and consumers
- a contract test asserts each view returns the shape its screen depends on

---

### ARCH-009 · `send_alert` has no role guard 🟢
**Domain** Gates · **Owner** _unclaimed_

**Goal.** `send_alert` is `SECURITY DEFINER`, granted to `authenticated`, and calls no
`assert_role`. Any signed-in user can send an alert to any role. Small, but it is an open
authorisation gap and a five-line fix.

**Approach.** `assert_role(['admin','manager','gm','supervisor'])` as its first statement — confirm
the list against `docs/ROLE_AND_APPROVAL_MODEL.md` before choosing. Check nothing legitimate calls
it as another role first: `src/api/schedule.ts` does.

**Allowed files** `supabase/migrations/0039_*.sql` · `tests/gates.test.ts`
**Acceptance** an operator is refused; a manager succeeds; `ScheduleBuilder`'s alert still works

---

### MGMT-001 · Authorization UI — the extension register has no screen 🟢
**Domain** Authorization · **Owner** _unclaimed (OpenCode)_

**Goal.** The register, the RPCs and the views exist and are tested; nothing surfaces them. An
operator cannot request an extension and a manager cannot approve one.

**Three surfaces**
1. **Operator** — a "Request more time" action on a running activity: hours, reason, optional photo.
2. **Manager / GM** — a decision queue: what was asked, why, by whom, the plan it misses, and
   approve/reject with a mandatory reason. The GM sees the manager's decision first.
3. **Management** — on the batch story, the four numbers side by side, never collapsed.

**Contracts — use these, do not query tables**
```
requestExtension(activityId, hours, reason, evidenceId?)  → request_extension
managerDecide(requestId, approve, reason, grantedHr?)     → manager_decide_extension
gmDecide(requestId, approve, reason, grantedHr?)          → gm_decide_extension
cancel(requestId, reason)                                 → cancel_extension
list(batchId)                                             → v_extension_request
expectation(activityId)                                   → v_activity_expectation
```

**Allowed files** `src/routes/Authorization*.tsx` · `src/api/authorization.ts` ·
`tests/authorizationUi.test.ts`
**Do NOT modify** `extension_request` · any extension RPC · RLS · PLAN · ACTUAL

**Acceptance**
- planned end, approved extension, authorised end and actual end are shown as **four separate
  numbers**; the original variance is never hidden by an approval
- a rejected request states who rejected it and why
- the screen computes no eligibility, no variance and no status of its own
- role gating comes from the server's refusal, not from hiding a button
- no fake values anywhere

---

### ARCH-003 · Publish and freeze process versions 🔒
**Domain** Process Definition · **Owner** _unclaimed (Claude)_

**Goal.** A definition an active batch was generated from is still editable, so "the standard" can
change under a batch that already ran.

**Approach.** `published_at` / `published_by` / `status ∈ (draft, published, retired)` on
`process_definition`; a trigger refusing writes to a published definition and its children;
`publish_process_version(id)` as the only `draft → published` path; a new version is a **copy** with
`supersedes_id`, never an edit.

**Do NOT** merge `ROUTE-2026A` into `PROCESS-2026B`. It is archived reference.

**Acceptance** a published definition refuses edits; a new version leaves historical batches
explainable; `PROCESS-2026B` is marked published without disturbing the live batch

---

### ARCH-004 · Prove evidence end to end ⛔
**Domain** Evidence · **Owner** _unclaimed_ · **Do after ARCH-011**

**Goal.** All 20 evidence tests skip on `403 AccessDenied`. "Evidence is real" is currently an
assertion, not a proof — and it is the claim the whole traceability story rests on.

**Chain to prove** capture → upload → storage object → `evidence_media` row → server timestamp →
uploader from JWT → requirement recount → gate → retrieval → **the actual image displayed**.

**Acceptance** every step asserted with a real object; no fake photo counters anywhere;
`mark_evidence` proven unused in new code

---

### ARCH-006 · Occupancy invents rows 🟢
**Domain** Resources · **Owner** _unclaimed_

**Goal.** Three `location_occupancy` rows exist for vessels nobody allocated. Occupancy must derive
from recorded movement and invent nothing.

**Approach.** Find the writer — `fn_track_occupancy` or `record_occupancy` — and determine whether
this is stale demo data or a live defect. **Diagnose before fixing.**

**Acceptance** the `plant` test passes for the right reason, with the cause stated

---

### ARCH-007 · The event log has no actor 🟢
**Domain** Audit · **Owner** _unclaimed_

**Goal.** The demo batch's events are all stamped H456 with "no actor recorded". A history with no
actor answers none of the product's questions.

**Approach.** Likely the staging script writing as `postgres` with no JWT claim. Fix the script to
name its actor — the same fix already applied to `s11_demo_batches.sql` and
`setup-demo-showcase.mjs` for F6.

**Acceptance** every staged event names an actor and a role; hours spread across the batch's life

---

### ARCH-005 · Forward forecast to the envelope
**Domain** Forecast · **Owner** _unclaimed_ · **Do last of the ARCH set**

**Goal.** Everything today looks backwards. There is no projection of where a batch lands.

**The envelope is 470 h and is read from the process definition, never written as a literal.** This
task is blocked on PRD-002, which gives the envelope a column it can actually be stored in — see
`docs/03-mission/FINDINGS.md` F7.

**Critical constraint.** The factory has **not** confirmed a forecasting formula. Build the
*mechanism* and make the *basis* replaceable — one view, swapped without touching PLAN or ACTUAL.
Document the assumption as an assumption. Do not bake it into a screen. Do not invent a factory rule.

**Working assumption to implement and label as such:** downstream planned activities shift by the
accumulated variance of their predecessors, except across a time gate, where the rest duration is
absolute and absorbs upstream lateness rather than adding to it.

**Acceptance** `v_batch_forecast` gives the projected envelope and exposure, both read from
`v_process_envelope` and never as a literal; swapping the basis touches one
view; PLAN and ACTUAL are untouched; the assumption is visible in the UI as an assumption

---

## PRD-470H — the revised PRD, 30 Aug

Reconciliation and reasoning: `docs/_reference/PRD_470H_RECONCILIATION.md`.
Decision memory: `T:\obsidian\memory` — `Build-Plan-470H`, `DEC-018` … `DEC-022`, `F7` … `F13`.

**Read the reconciliation before claiming any of these.** Four of the eight exist because a value
was silently promoted a confidence class, and the fifth is the column that makes that impossible.

### PRD-001 · Confidence class on every process value 🟢
**Domain** Process Definition · **Register** STANDARD · **Owner** _unclaimed_ · **Do first**

**Goal.** Revised PRD §61 requires every process field to carry one of seven confidence classes, and
forbids an agent from silently converting one into another. There is nowhere in the schema to record
a class. The classification exists in `PROCESS_2026B_AUTHORITATIVE_MATRIX.md` as a markdown table
column — where no engine can read it and no constraint can defend it.

Four findings from one reading session are each one instance of that conversion happening: a
simulation span became the confirmed envelope; a machine-utilisation property became a material gate;
an unresolved proposal was written as a hard derived rule; three bunker-fill durations circulate with
no marker for which is stated. Care does not prevent this. A not-null column does.

**Approach.** `0040_process_confidence_class.sql` — **skeleton already in the repo, unprobed.**
Enum of the seven §61 classes; `timing_confidence` on `process_activity` and `envelope_confidence` on
`process_definition`, both `not null default 'UNRESOLVED'`; backfill everything to `UNRESOLVED`
because that is the true state. Two rules made structural: a `FACTORY_RANGE` carries both bounds, and
`PARALLEL_NO_WALLCLOCK` contributes zero to the envelope. Plus `v_process_confidence`.

**Probe before applying.** Does the deployed database hold rows with
`standard_hour_source = 'factory_stated'` that the seeds do not? The 29 Aug decision says 50 of them
existed. The backfill must not classify those as `UNRESOLVED` without somebody looking.

**Allowed files** `supabase/migrations/0040_*.sql` · `tests/processEnvelope.test.ts`
**Do NOT modify** any existing column · any function body · any seed

**Acceptance**
- every `process_activity` row carries a class, and every one of them is `UNRESOLVED`
- a `FACTORY_RANGE` with one bound is refused by the table, naming the constraint
- `v_process_confidence.envelope_is_defensible` is **false** for every definition today
- 431 existing tests still pass, unchanged

---

### PRD-002 · The envelope is a stated hour, not a day count 🔒⛔
**Domain** Process Definition · **Register** STANDARD · **Owner** _unclaimed (Claude)_

**Goal.** `process_definition.baseline_hours` is `generated always as ((total_days + 1) * 24)`. H552
was never a factory number — it is 23 × 24. The PRD states **470**, and `470 / 24 = 19.583…`, so no
integer `total_days` produces it. **The schema cannot hold the number the PRD calls the standard.**

The wrong fix is `total_days = 19` → 480. Close enough to look right on a screen; wrong by ten hours
in every variance the product computes; permanent, because `DEC-002` freezes the plan at activation.

`0011` already solved this one level down — `standard_hour_source` exists so *"nobody mistakes a
derivation for a statement"*. This is that, one level up.

**Approach.** `0041_process_envelope_hours.sql` — **skeleton already in the repo, unprobed.**
`envelope_hours` (nullable, need not divide by 24) + `envelope_hour_source`; `baseline_hours` stays
untouched and keeps meaning the day grid; one resolver view `v_process_envelope`;
`set_process_envelope` refusing a number classed `UNRESOLVED` or carrying no source.

**Then remove the literal.** `README.md`, `SYSTEM_ARCHITECTURE_V1` §14/§15, `ARCH-005` and the
Forecast notes all name H552 in prose. They are how the next agent learns the number.

**Allowed files** `supabase/migrations/0041_*.sql` · `tests/processEnvelope.test.ts` ·
`README.md` · `docs/_reference/SYSTEM_ARCHITECTURE_V1.md` (§14/§15 prose only)
**Do NOT modify** `baseline_hours` · the `rel_day` CHECK · any planning function

**Acceptance**
- a definition stores 470 and reads it back exactly through `v_process_envelope`
- `envelope_lands_on_a_day` is **false** for it, and that is not an error
- a definition with no stated envelope falls back to the day grid and reports
  `envelope_is_a_derivation = true`
- setting an envelope with no source, or classed `UNRESOLVED`, is refused with a sentence saying
  what to do instead
- no literal `552` outside a seed or a comment naming it as history

---

### PRD-003 · Publish refuses an indefensible standard 🔒
**Domain** Process Definition · **Owner** _unclaimed (Claude)_ · **Do after ARCH-003 + PRD-001**

**Goal.** Make §61 a gate rather than documentation, at the one moment it matters: when a set of
numbers becomes "the standard".

**Approach.** `publish_process_version` raises if `v_process_confidence.envelope_is_defensible` is
false — i.e. if anything the envelope depends on is still `UNRESOLVED` or `SIMULATION`. The refusal
lists the offending activity codes. Three lines inside a function `ARCH-003` is already writing.

**Acceptance** `PROCESS-2026B` cannot be published today, and the refusal names why; classifying its
activities makes it publishable; the refusal is tested

---

### PRD-004 · Copy PROCESS-2026B → PROCESS-2026C v1 🔒
**Domain** Process Definition · **Owner** _unclaimed (Claude)_ · **Blocked by ARCH-003**

**Goal.** The 470h standard is a **new version**, never an edit. PRD §3.1, §49, R14. The change is
not small — envelope, six activities moving day, a pre-H0 zone becoming real, a Turner stage that
does not exist in `PROCESS-2026B` at all, and a bunker cycle count still being argued about.

**Approach.** Mark `PROCESS-2026B` published and leave it alone. Copy to a draft
`PROCESS-2026C v1` with `supersedes_id`. Every subsequent PRD task applies to the copy.

**Do NOT** re-plan the live batch. No controlled re-planning mechanism exists and the PRD does not
ask for one — active batches stay tied to the version they were activated against.
**Do NOT** merge `ROUTE-2026A`. Standing rule 3.

**Acceptance** `PROCESS-2026B` is published and byte-identical afterwards; the live batch still
resolves its definition and explains itself; the copy is a draft with `supersedes_id` set

---

### PRD-005 · Apply the confirmed H0 model to the copy 🔒
**Domain** Process Definition · **Owner** _unclaimed (Claude)_ · **Blocked by PRD-004**

**Goal.** The PRD closes the H0 question `DECISION_2026-08-29_PROCESS_BASELINE.md` §3 left open:
**H0 is Bagasse Wetting**; pre-H0 intake and weighment sit ~10–12 h before it, advisory, and do
**not** gate H0 (§5.1, §5.2, §6). The live database had this model; the seeds do not.

**Approach.** Replay the 29 Aug preserved export — all 52 rows carrying `factory_stated` hours and
the pre-H0 flags — onto the copy. **Replay, do not reconstruct.** `is_pre_h0` / `pre_h0_offset` exist
in the deployed database and are created by no migration; create them properly (coordinate with
`ARCH-008`).

**The trap.** The matrix made pre-H0 readiness a `DERIVED READINESS` that *unlocks* H0. The PRD
removes that gate. Same hours, **different rule**. Do not carry the gate across with the hours.

**Acceptance** the six Day-1 activities are Day 0 with their stated hours; `P1-BUNK-LOAD` and
`LAB-BUNK-FILL` are Day 9; weighment is recorded, classed `ADVISORY`, and **gates nothing**; a batch
generated from the copy starts at Bagasse Wetting with no pre-H0 blocker

---

### PRD-006 · Turner / pile / bunker structure 🔒
**Domain** Process Definition · **Owner** _unclaimed (Claude)_ · **Blocked by PRD-004 and by the factory**

**Goal.** `PROCESS-2026B` has no Turner stage at all. The PRD needs T0→T1→T2→T3 at pile level, six
piles, two machines of class `TURNER`, and the P1+P2→B1 / P3+P4→B2 / P5+P6→B3 grouping (§23).

**Approach.** Structure only, values left `UNRESOLVED`, so PRD-003 refuses to publish until the
factory answers. That refusal is the feature.

- pass duration and machine count → `resource_requirement`, naming a **class** never a unit
- the rest before T2 → a `gate_rule` row, so changing the answer is an `UPDATE` not a migration
- the pile→bunker grouping → `movement_rule`
- bunker-fill eligibility is a **derived gate over two pile streams** — both piles' T3 actuals — not
  a scheduled time

**Do NOT.** No `PADDY-*` or `BAGASSE-*` codes — `process_activity_code_has_no_material_name` is a
CHECK and names both words. The PRD's "paddy" is the `STRAW` stream, its "bagasse" is `FIB1`; labels
resolve from `{role_lead}` at read time. And **no importer for the Turner spreadsheet** — it is a
one-off simulation and an importer would make its optimism structural.

**Four factory answers needed first** (see PRD-RULES below). Build the shape; do not invent the
numbers.

**Acceptance** six piles progress independently with no global barrier; machine assignment is
recorded as **actual** and is planned nowhere; the definition is unpublishable while the four values
are `UNRESOLVED`

---

### PRD-007 · The junior payload contract 🟢
**Domain** UI / contracts · **Owner** _unclaimed_ · **Do after ARCH-002**

**Goal.** The view layer largely exists. What does not is a **written, versioned payload shape per
screen**, so a junior can build against it before it is finished. `contracts.md` names this as the
actual deliverable for them and nobody has written it.

**Approach.** One document, one section per screen: the view it reads, every field, the type, and
what the screen must **never** compute. Operator, Lab, Decision Center, Factory Now, Batch Story.

**Acceptance** a junior can build a screen from the document with the backend unavailable; no screen
computes eligibility, variance, status or "on time"; each shape has a contract test

---

### PRD-RULES · Two PRD rules that must NOT be implemented as written ⛔
**Domain** Process Definition · **Owner** _nobody — this is a blocker, not a task_

Recorded here so an agent reading the PRD alone does not implement them.

**§18 "T0 → T1 continuous, no gap; a gap is an automatic deviation."** All six piles in the source
have a gap — 1.5 to 4.5 h, recorded in the sheet's own Rest row. The continuity belongs to the
**machines** (M1 and M2 each run 09:00–18:00 with zero idle, which the 2-then-4 / 4-then-2 load
inversion buys), not to the piles. Implemented as written it raises **six deviations per batch,
forever**.

**§19 "T2 planned start = T0 actual start + 24 h", derived and uneditable after T0 starts.** The
source says 12.5–15.5 h, never 24. The real driver is **`T1 actual end + 8 h`** — honoured to the
minute on all six piles and stated independently in the compost SOP's prose. Wrong anchor event,
wrong stage, wrong number. And §19 wants it **frozen**: a wrong number behind a correct freeze is
worse than an editable one, because the integrity guarantee then protects the error.

Both stay `UNRESOLVED`. **Build no gate on either** until the process owner rules.

---

### PRD-QUESTIONS · Eight things only the factory can answer ⛔

None can be inferred. Each is one `UPDATE` once answered. Send as one list.

1. Bunker cycles after the Turner — **two or three?** SOP three, Turner sheet two. ~40–46 h.
2. Bunker fill — **2 h, 3 h or 10 h?** All three in circulation.
3. T2 gate — **`T1 end + 8 h` or `T0 start + 24 h`?** Differ by 9–11 h per pile.
4. The T0→T1 gap — **normal, or waste?**
5. Is a Turner pass **1.5 h per pile**, or is T0 a **7–8 h stage span**? The PRD quotes both.
6. Is **470** the factory's target, or a measurement of the simulation? Currently the latter.
7. Paddy prep — **74 h or 86 h?** PRD declares 74 authoritative; sub-values sum to 86.
8. **Tunnel count.** One tunnel at ~160 h per batch caps throughput at a batch per 6.7 days.


---

## Blocked

| Task | Blocked by |
|---|---|
| ARCH-004 (evidence proof) | ARCH-011 — needs a storage key |
| ARCH-010 (contract leak) | ARCH-002 — split first, then re-point |
| ARCH-005 (forecast) | ARCH-001 — forecast built on mutable actuals is worthless |
| PRD-003 (publish refusal) | ARCH-003 + PRD-001 |
| PRD-004 (2026C copy) | ARCH-003 — no publish step means no version boundary |
| PRD-005 (H0 model) | PRD-004 · coordinate with ARCH-008 for `is_pre_h0` |
| PRD-006 (Turner structure) | PRD-004, and four unanswered factory questions |
| PRD-007 (payload contract) | ARCH-002 — split first |

---

## Done

| Task | Result |
|---|---|
| F1 — baseline immutability | `0034`, 14 tests |
| F3 — role resolution | `0035`, 9 tests |
| F6 — `assert_role` failed open | `0035` §3 |
| F2 — extension register | `0036`, 21 tests |
| Architecture freeze | `SYSTEM_ARCHITECTURE_V1.md` |

---

## Template for a new task

```
### <ID> · <one-line goal>
**Domain** · **Register** · **Owner**

**Goal.** Why this matters, in two sentences. What breaks without it.

**Approach.** The shape of the solution, not the code.

**Inputs** which contracts and views this consumes
**Allowed files** exact paths
**Do NOT modify** the boundaries this task must not cross

**Acceptance**
- observable, checkable statements
- no fake values
- npm run typecheck && npm run build && npm run test
```
