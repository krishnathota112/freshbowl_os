> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# 01 · Foundation Mission — the executable brief

**For Claude Code.** Derived from `CLAUDE_COWORK_FOUNDATION_FREEZE_MASTER.md`, narrowed to what is
actually left to do, ordered, with a hard stop gate.

Issued 30 August 2026. Supersedes every instruction file in the repository root.

---

## 0 · Read this first

The freeze document is right about the shape of the work and it is 1,000 lines long. This is the
same mission with three changes:

1. **A Phase 0 the freeze does not have.** The repository cannot currently be read by an agent
   without being misled — see §2. Everything downstream depends on fixing that first.
2. **The parts already done are marked done**, with their proof. Do not re-audit them. Spend the
   budget on what is open.
3. **The red-team audit is pre-seeded.** Eight write-path rows are already filled in from a prior
   read of the migrations. Verify them against the deployed database; do not rediscover them.

**The single rule that governs this whole mission:**

> Phase 1 produces a report and changes no code. You stop, and a human reads it, before anything is
> fixed. If you find yourself editing a migration during Phase 1, you have left the mission.

---

## 1 · What is already true — do not redo

Proven means a test asserts it against a real database.

| Freeze section | State | Proof |
|---|---|---|
| §7 Plan / baseline immutability | **GREEN** | `0034`, 14 tests. Four layers: grants, in-function guards, `trg_plan_is_frozen`, `trg_activation_is_one_way`. The `repoint_batch_activities` hole is closed and the function is revoked from `public`, `anon`, `authenticated`. |
| Role resolution, fail-closed | **GREEN** | `0035`, 9 tests. `current_app_role()` falls back to `profiles` (which is SELECT-only under RLS, so it cannot self-escalate). `has_role` is `coalesce(..., false)` — the three-valued-logic hole that made every `assert_role` a no-op is closed. |
| §11 Extension / authorization register | **GREEN, no UI** | `0036`, 21 tests. `request_extension` → `manager_decide_extension` → `gm_decide_extension`. Approval only narrows; the window runs from the planned end; a request after completion is refused. |
| §17 Confidence discipline — *the classes* | AMBER | Defined in PROCESS-2026C §12. Not yet in the schema. `0040` skeleton exists, unapplied, unprobed. |
| §15 470-hour standard — *the number* | AMBER | Confirmed by the process owner 30 Aug. **Cannot be stored** — see §4.2. `0041` skeleton exists, unapplied, unprobed. |

**Everything else in the freeze document is open.**

---

## 2 · PHASE 0 — make the repository readable · ~1 hour · no code

You are about to be told to "read the repository and the Obsidian notes". Today that instruction is
actively harmful.

**Measured, 30 Aug 2026:** the repository root holds **15 markdown files, 10,193 lines, 252 KB**.
Every one of them describes the **552-hour** model. **None mentions 470.** Several are pasted chat
transcripts that open with *"Yes. This is finally coherent."* and *"You're right. That diagram was
way too compressed."* — they are conversation, filed as if they were specification.

`docs/` adds roughly forty more files and twenty-two agent reports.

An agent told to read this repository will reconstruct the superseded process, because that is what
the overwhelming majority of the words in it say. No amount of care in later phases survives that.

**Do:**

1. Execute the archive move in `docs/DOCUMENT_MAP.md` verbatim. It is a `git mv` list — nothing is
   deleted, everything keeps its history.
2. Leave `docs/DOCUMENT_MAP.md` at the root of `docs/`. It is the first file any agent reads.
3. Add one line to `README.md` pointing at it.

**Acceptance:** the repository root holds `README.md` and nothing else in markdown. Every archived
file sits under `docs/_archive/` with the reason it was archived recorded in the map. A grep for
`552` outside `docs/_archive/` returns only comments that name it as history.

**Do not** rewrite the archived documents. They are the record of how the project got here.

---

## 3 · PHASE 1 — the red-team audit · REPORT ONLY · no code changes

This is the phase the mission exists for. **Nothing is fixed here.**

### 3.1 · The question

Not *"can the operator edit it in the UI?"* — a hidden button is not security.

> **Can anyone cause the database to believe something happened earlier, faster, by someone else, or
> under a different condition than it really did?**

Assume an authorised insider with the anon key, a REST client, and a willingness to call any RPC
directly. Assume they will replay a request, duplicate it, alter the payload, and try every helper,
import and maintenance path.

### 3.2 · The twenty facts

`planned_start` · `planned_end` · `baseline_start/end` · `actual_start` · `actual_end` ·
activity state · operator identity · machine identity · pile identity · bunker movement ·
lab result · lab approval · evidence · deviation · extension · manager decision · GM decision ·
process definition/version · resource occupancy · audit event.

### 3.3 · Method — probe, do not read

The lesson from the last integrity pass: **reading migration files gives the wrong answer.** Three
conclusions moved the moment the deployed database was actually queried — `repoint_batch_activities`
turned out to be granted to `anon` and `PUBLIC`, not just `authenticated`; `batch_activity` grants
no write at all to any client role; `profiles` has three policies and all three are SELECT.

For every fact, query the live database:

```sql
-- who can execute what
select p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef, p.proacl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';
-- table grants
select grantee, privilege_type from information_schema.role_table_grants where table_schema='public';
-- policies
select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname='public';
-- triggers and constraints
select * from pg_trigger where not tgisinternal;
```

Then, for each fact, **attempt the forgery** as each client role and record what happened.

### 3.4 · Pre-seeded rows — verify these, do not rediscover them

`docs/audit/WRITE_PATH_MATRIX.md` already contains eight rows filled in from the migration files.
Four carry a specific suspicion worth checking first:

| # | Suspicion | Where |
|---|---|---|
| 1 | **`submit_activity` lets the caller overwrite a recorded actual.** `0016` writes `actual_end = coalesce(p_actual_end, actual_end)` — the parameter wins over the stored value. This is a live path through the supported RPC, not a theoretical one. | `0016_recorded_actuals.sql` ~line 270 |
| 2 | **The caller supplies `p_actual_start` / `p_actual_end` at all.** The freeze requires server-generated authoritative timestamps. Today the client states them, with only a "not in the future" check. Decide, and record, whether operator-stated times are a deliberate factory requirement or an accident. | `0016` |
| 3 | **`send_alert` is `SECURITY DEFINER`, granted to `authenticated`, and calls no `assert_role`.** Any signed-in user can alert any role. | grep `send_alert` |
| 4 | **Schema drift.** Two tables and eleven functions exist in the deployed database that no migration creates — including `get_effective_now`, `set_dev_clock_h`, `pause_dev_clock`. A dev clock reachable from any function that writes ACTUAL, AUTHORIZATION or AUDIT would make every timestamp deniable. **Prove it is not reachable, as a test that greps function bodies.** | `ARCH-008` |

### 3.5 · Output

Write, and stop:

- `docs/audit/WRITE_PATH_MATRIX.md` — every fact, every write path, the full template per row.
- `docs/audit/SECURITY_ATTACK_MATRIX.md` — each attempted forgery, the role used, the exact call,
  and what the database did.
- `docs/audit/FOUNDATION_STATUS.md` — GREEN / AMBER / RED / UNRESOLVED per freeze §24 heading.

Then **report to the human and wait.** Rank findings by severity, state the exploit path for each in
one sentence, and propose the fix — do not apply it.

**Acceptance for Phase 1:** `git diff` touches only `docs/`. No migration, no function, no test, no
screen has changed.

---

## 4 · PHASE 2 — fix and prove · only after the report is read

Order matters. Take them in this sequence.

### 4.1 · Actual immutability — the last hole in the central claim

The plan is frozen; the actuals are not. Freezing one end only moves the hole: instead of dragging
the plan onto the actual, you drag the actual onto the plan. Both directions must close for a
variance to mean anything.

Requirements are freeze §6 in full. The shape:

- a `BEFORE UPDATE` trigger on `batch_activity` refusing any change to a non-null `actual_start` or
  `actual_end`, whatever asked for it;
- corrections as **superseding records** with old value, new value, reason, actor and server
  timestamp — model it on `evidence_media.superseded_by_id`, which already does this correctly;
- the original stays visible;
- `actual_recorded_at` stays distinct from `actual_start` / `actual_end`. One is when the server
  heard it; the other is when the operator says it happened. That distinction is correct and must
  survive.

**The trap.** `return_activity`, `hold_activity` and `release_activity` may re-submit an activity
that already has actuals. A write-once trigger that breaks the return flow would be discovered in
production. **Probe those paths before writing the trigger**, and test them after.

**Acceptance:** setting an actual once succeeds; overwriting is refused by the table and the refusal
names the column and says what to do instead; a supersession path exists and is tested; the hold /
release / return flows still work; the existing suite still passes.

### 4.2 · The envelope must be storable — this blocks the exit gate

Freeze §24 requires *"470h resolves from process data"*. **It cannot today.**

```sql
-- 0011_hour_axis.sql
baseline_hours int generated always as ((total_days + 1) * 24) stored
```

H552 was never a factory figure. It is 23 × 24. And `470 / 24 = 19.583…`, so no integer
`total_days` produces it. The schema physically cannot hold the number the process owner confirmed.

The wrong fix is `total_days = 19` → 480: close enough to look right on a screen, wrong by ten hours
in every variance the product computes, and permanent, because the plan freezes at activation. The
integrity guarantee would then be protecting the error.

`0041_process_envelope_hours.sql` is drafted: `envelope_hours` stated and nullable, an
`envelope_hour_source`, one resolver view, and `set_process_envelope` which refuses a number with no
confidence class and no source. `baseline_hours` stays untouched and keeps meaning the day grid.

**Probe before applying.** Then remove the literal `552` from `README.md`,
`SYSTEM_ARCHITECTURE_V1` §14/§15 and `ARCH-005`. Those are how the next agent learns the number.

### 4.3 · Confidence class — freeze §17, made structural

`0040_process_confidence_class.sql` is drafted. Enum of the seven classes on `process_activity` and
`process_definition`, `not null`, everything backfilled `UNRESOLVED`.

**Probe first:** the deployed database was reported to hold ~50 rows with
`standard_hour_source = 'factory_stated'` that the seeds do not have. The backfill must not classify
those without somebody looking at them.

Two rules worth making structural rather than cultural: a `FACTORY_RANGE` carries both bounds, and a
`PARALLEL_NO_WALLCLOCK` row contributes zero to the envelope — which makes the paddy 74-versus-86
double-count arithmetically impossible instead of a thing to remember.

### 4.4 · Then, in order

`ARCH-009` role guard on `send_alert` · `ARCH-003` publish/freeze on `process_definition` ·
`PRD-003` publish refuses an `UNRESOLVED` standard · `PRD-004` copy PROCESS-2026B → 2026C ·
`PRD-005` the H0 model · `PRD-006` Turner / pile / bunker structure.

Detail for each is on the task board.

---

## 5 · PHASE 3 — rebuildability

Freeze §18. A blank Supabase project, built only from committed migrations and seeds, must produce
the same domain behaviour.

Today it does not: two tables and eleven functions exist in the deployed database that no migration
creates. `ARCH-008` captures them into `0037` with `create ... if not exists` / `create or replace`
so applying it to the current database is a no-op, plus `scripts/schema-diff.mjs` that exits
non-zero on drift.

Also here: `ARCH-011` — restore the three staged demo batches and configure a storage service key.
While 32 tests fail on the environment and 20 skip, a real regression is indistinguishable from a
missing row.

**Acceptance:** `docs/audit/REBUILDABILITY.md` records a clean rebuild that was actually performed,
and the suite is green with every skip stating why.

---

## 6 · PHASE 4 — freeze the contracts

Not before Phase 2 and 3 are green. A contract frozen over a bypassable engine is worse than no
contract, because people build on it.

Freeze §19 in full. `docs/architecture/DATA_CONTRACTS.md`, one section per screen, with
`INPUTS · OUTPUTS · STATES · MUTATIONS · ERRORS · PERMISSIONS · NULL SEMANTICS`.

**The first draft already exists** — section 9 of `MushroomOS_Technical_PRD_Architecture.docx` gives
field-level payloads for Operator, Lab, Decision Centre, Factory Now and Batch Story. Lift it,
verify each field against the actual view, and add the four headings it does not yet carry.

Two of the views a contract needs **do not exist yet**: a gate view (`controlRoom.ts` reads
`batch_activity` and `gate_rule` directly) and a planning view (`schedule.ts` reads six base tables).
Specify them and build them here. Do not let a screen read a base table "for now".

Also in this phase: `ARCH-002`, the pure move that splits `src/api/batch.ts` (534 lines spanning
Planning, Execution and Evidence) into three. It is the file two people will collide in, and it is
imports and moves, nothing else.

---

## 7 · PHASE 5 — the UI system

Freeze §20. `docs/ui/UI_SYSTEM.md`, `COMPONENT_INVENTORY.md`, `SCREEN_CONTRACT_INDEX.md`,
`DESIGN_DECISIONS.md`.

**Start from `docs/ui/UI_VISUAL_LANGUAGE.md`**, which reads the stakeholder HTML prototype and says
exactly which patterns to promote to primitives and which parts of that file must never reach the
product. Read it before opening the prototype, because the prototype contains a hardcoded 23-day
process table that looks exactly like something a junior would wire up.

---

## 8 · PHASE 6 — the work split

Only once `FOUNDATION STATUS = GREEN`.

```
Cowork / Opus        architecture · process reasoning · security review · UI system · handovers
OpenCode / Kiro      implementation · tests · refactoring · repetitive work
People on screens    screen construction against frozen contracts
```

The two rules that make it safe: **read from views, never base tables; write through RPCs, never
insert or update.** A screen built that way can be rebuilt without a backend change and can never
encode a factory rule, because it is never handed one.

When blocked: do not invent, do not patch the screen, do not change a process rule, do not touch the
baseline. Report the missing contract and update the handover.

### 8.1 · What people can start **today**, without waiting for GREEN

Screen *wiring* waits for frozen contracts. Four streams do not, and they can run in parallel from
day one because none of them touches the engine.

| Who | Work | Why it is safe now |
|---|---|---|
| **Person A** | Phase 0 — the archive move, the headers, the map. Then sweep `H552` out of the ~20 kept documents. | Mechanical, reversible, and everything else depends on it. About a day. |
| **Person B** | `ARCH-002` — split `src/api/batch.ts` into `planning.ts` / `execution.ts` / `evidence.ts`. Imports and moves, no behaviour change. Then `ARCH-011` — restore the demo batches, configure the storage key, green the suite. | Neither changes an RPC, a migration or a rule. `ARCH-002` is the file two people would otherwise collide in, so doing it first is what makes the parallelism possible. |
| **Person C** | The **component library**, built against fixtures. Take the ten primitives from `docs/ui/UI_VISUAL_LANGUAGE.md` and the field-level payloads in section 9 of the Technical PRD. Build each with a typed props interface and a fixture file — no network calls. | A component that accepts a typed payload does not care whether the payload is real yet. This is the largest body of screen work and it can be done before the backend is green, provided **nothing computes** — no variance, no eligibility, no status, no "on time". |
| **Cowork / Claude Code** | Phases 1 → 4. | The stop gate is here, not in the other three lanes. |

**Person C's boundary, stated once:** a component receives `variance_min`, it never subtracts two
timestamps. It receives `state`, it never infers one. It receives `blocked_reason` as a finished
sentence, it never composes one. If a component needs a value the fixture does not carry, that is a
backend contract task — write it down and move to the next component.

When contracts freeze at the end of Phase 4, Person C's components get real payloads instead of
fixtures. That is the whole integration.

---

## 9 · Status vocabulary — use only these

```
GREEN       empirically proved
AMBER       implemented, proof incomplete
RED         broken or bypassable
UNRESOLVED  requires a factory or stakeholder decision
```

"The migrations exist", "the tests are green" and "the demo works" are **not** GREEN.

---

## 10 · Do not silently decide these

Four factory questions are open and none may be inferred:

1. The loader as a modelled resource. It does the bunker fill, the unload/reload and the tunnel
   load, and it appears in no source sheet and no resource requirement.
2. Turner changeover / repositioning time. Zero everywhere in the source, silently.
3. The receiving bunker for each reload. The source names no destination.
4. The moisture band between 67 % and 68 % at `FIB-MOIST-DEC`.

Record them `UNRESOLVED`. Build no gate on any of them.

---

## 11 · Session report format

Every substantive session ends with:

```
WHAT BECAME TRUE · WHAT CHANGED · WHAT STOPPED BEING TRUE · WHAT IS STILL UNKNOWN
FILES CHANGED · MIGRATIONS CHANGED · CONTRACTS CHANGED
TEST STATUS · SECURITY STATUS · OPEN DECISIONS · DO NOT TOUCH
EXACT NEXT TASK · ACCEPTANCE TEST
```

And the decision memory in `T:\obsidian\memory` is updated in the same session. A decision that
exists only in a commit message is a decision that will be re-litigated.
