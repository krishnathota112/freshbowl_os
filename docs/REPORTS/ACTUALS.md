# REPORT — recorded-actual timestamps on `submit_activity`

**22 August 2026.** `PROCESS_V2_FACTORY_CONFIRMED.md §2`, `TIME_CONTRACT.md §1`,
`DOMAIN_MODEL.md §5`, `DEMO_PLAN_V2.md` criterion 21. Format per the steering brief's
*How to report*.

**Status: ✅ GATE GREEN.** A backdated submission stores the stated actuals and a distinct entry
timestamp. A future timestamp is refused. **181 tests · 9 files · typecheck clean · build clean ·
migrate clean.**

---

## 1. What was wrong

`submit_activity` wrote this, and only this:

```sql
actual_start = coalesce(actual_start, now()),
actual_end   = now(),
```

So every activity in the system was recorded as having finished **at the moment somebody pressed
Submit**. There was no way to say otherwise.

That is not a cosmetic inaccuracy, because two columns are GENERATED from those two values:

```
duration_actual_min   = (actual_end - actual_start) in minutes
variance_minutes      = (actual_end - planned_end_at) in minutes
```

Both were therefore measuring **the operator's typing**, not the factory's work. `PROCESS_V2 §2`
specifies the per-load execution record and it is explicit about the shape of the thing:

| Field | Example |
|---|---|
| Start | `08:10` |
| End | `08:19` |
| Duration | `9 min` |

Eleven loads, each with a start and an end, written on a slip at the weighbridge and typed in
afterwards. The truck does not wait for the phone. A nine-minute load transcribed an hour later read
as a nine-minute-late nothing, and `WHERE THE TIME WENT` — B4's attribution view, which
`UI_CONTROL_TOWER_SPEC §11` renders — would have been built on it.

**This is factory behaviour, not a demo affordance.** There is no demo-only backdating path, no flag,
no role that gets to skip the checks. The two parameters are part of the ordinary submission because
transcription is the ordinary case for a per-load record.

---

## 2. What was built

```
new   supabase/migrations/0016_recorded_actuals.sql
      · batch_activity.actual_recorded_at, with comments on all three timestamp columns
      · CHECK batch_activity_actual_end_after_start
      · submit_activity gains p_actual_start / p_actual_end; the 3-argument overload is dropped
      · the audit event carries both clocks and a stated_by_submitter flag

new   tests/recordedActuals.test.ts        14 tests — the gate, plus what did NOT change
edit  tests/db.ts                          satisfyEvidence · createActiveBatch · refuses
edit  tests/gates.test.ts                  uses the two shared helpers instead of its own copies
edit  src/api/batch.ts                     submitActivity takes an optional actuals pair
```

### Two clocks, kept separate

```
actual_start / actual_end     WHEN THE WORK HAPPENED.  Stated by the person, or the server clock
                              when they state nothing.
actual_recorded_at            WHEN IT WAS TYPED.       Always the server clock. Never a parameter,
                              never a device clock.
```

Equal values mean it was recorded live. Different values mean it was transcribed, and by how much is
**visible rather than inferred**. `batch_activity_value` has carried exactly this pair since 0004 —
column ④ of `DOMAIN_MODEL §5`'s six-column model is `actual_value, actual_recorded_at,
actual_recorded_by` — so this puts the activity on the same footing as its own fields rather than
inventing a pattern.

**No provenance column was added.** Whether a time was stated or taken from the clock is derivable
from the row: `actual_recorded_at = actual_end` is a live recording, and because both are written
from a single `now()` read inside one statement, the equality is exact rather than approximate. A
column would have been a second copy of a fact already there.

### What the server refuses, and why one rule is structural and the other cannot be

| Refusal | Mechanism | Why |
|---|---|---|
| **end before start** | a **CHECK constraint** | Unwritable by ANY path, not only by this RPC. Same move A2 made for a negative baseline hour. `postgres` has `BYPASSRLS` and every privilege there is, and it still cannot write the pair — which is what "the server is the authority" means when the rule does not depend on the clock |
| **a future timestamp** | checked in the RPC | It **cannot** be a constraint: `now()` is not immutable, so Postgres will not accept it in a CHECK. Work that has not happened yet is not an actual |

**No tolerance window on the future check.** A tolerance would be a number nobody stated, and the
rule it would soften is the one that keeps a device clock out of the record. A second into the future
is refused, and there is a test that says so.

Both refusals are validated **before anything is written**. Recording half a submission and then
raising would be worse than refusing it, and out-of-range values are written further down the
function.

The **effective** pair is what gets validated, not the parameters: `start_activity` may already have
written `actual_start` when the operator opened the card, so a stated end earlier than *that* is
refused too. Checking only the arguments would let it through.

---

## 3. Exit proofs

```
$ node scripts/db.mjs migrations
  ok    0001_foundation.sql  201 ms          ok    0009_admin_questions.sql  65 ms
  ok    0002_reference.sql  68 ms            ok    0010_state_truth.sql  75 ms
  ok    0003_process_engine.sql  94 ms       ok    0011_hour_axis.sql  118 ms
  ok    0004_batch_tree.sql  74 ms           ok    0012_evaluate_gates.sql  196 ms
  ok    0005_generate_plan.sql  74 ms        ok    0013_batch_disposal.sql  67 ms
  ok    0006_execution.sql  76 ms            ok    0014_evidence_storage.sql  81 ms
  ok    0007_schedule.sql  75 ms             ok    0015_role_claim.sql  77 ms
  ok    0008_rest_gate.sql  87 ms            ok    0016_recorded_actuals.sql  72 ms
done
```

```
$ node node_modules/typescript/bin/tsc --noEmit
(no output, exit 0)

$ node node_modules/vite/bin/vite.js build
✓ 178 modules transformed.
dist/index.html                    0.43 kB │ gzip:   0.28 kB
dist/assets/index-CnPGNozd.css    14.15 kB │ gzip:   4.11 kB
dist/assets/browser-CQE9AkOa.js    0.62 kB │ gzip:   0.43 kB
dist/assets/index-Ceez7Ht1.js    444.46 kB │ gzip: 128.83 kB
✓ built in 1.52s
```

```
$ node node_modules/vitest/vitest.mjs run
 ✓ tests/evidence.test.ts (20 tests) 25065ms
 ✓ tests/gates.test.ts (11 tests) 31468ms
 ✓ tests/uiFoundations.test.ts (21 tests) 2824ms
 ✓ tests/demoBatches.test.ts (16 tests) 12874ms
 ✓ tests/tower.test.ts (23 tests) 1622ms
 ✓ tests/hourAxis.test.ts (21 tests) 18151ms
 ✓ tests/recordedActuals.test.ts (14 tests) 29966ms
 ✓ src/domain/time.test.ts (27 tests) 109ms
 ✓ tests/controlTower.test.ts (28 tests) 2351ms

 Test Files  9 passed (9)
      Tests  181 passed (181)
   Duration  126.82s
```

The new file, verbatim:

```
 ✓ the two clocks are separate > a backdated submission stores the stated actuals AND a distinct entry timestamp
 ✓ the two clocks are separate > a live submission records both clocks as the same instant, which is what makes them comparable
 ✓ the two clocks are separate > variance is measured against when the work ended, not against when it was typed
 ✓ the server refuses a timestamp that cannot be an actual > a future start is refused, and nothing is recorded
 ✓ the server refuses a timestamp that cannot be an actual > a future end is refused too, and the message names the activity
 ✓ the server refuses a timestamp that cannot be an actual > there is no tolerance window — a second into the future is still the future
 ✓ the server refuses a timestamp that cannot be an actual > an end before its start is refused
 ✓ the server refuses a timestamp that cannot be an actual > a stated end earlier than an already-recorded start is refused as well
 ✓ the server refuses a timestamp that cannot be an actual > the impossible pair is unwritable by ANY path, not only through the RPC
 ✓ the trail carries both clocks > the audit event records what was stated and when it was typed
 ✓ the trail carries both clocks > a live submission is not marked as stated by the submitter
 ✓ nothing else about submit_activity changed > the three-argument call still works, so no existing caller was broken
 ✓ nothing else about submit_activity changed > there is exactly ONE submit_activity — the old overload is gone
 ✓ nothing else about submit_activity changed > evidence still gates submission, and a held submission keeps what was stated
```

### The gate, item by item

| The gate says | How it is proved |
|---|---|
| **a backdated submission stores the stated actuals** | the stated start and end are read back and compared instant-for-instant against what was sent; `duration_actual_min` is asserted equal to the span the slip states, which under the old code would have read as the transcription delay instead |
| **AND a distinct entry timestamp** | `actual_recorded_at` is asserted equal to the server's own `now()`, strictly greater than `actual_end`, and not equal to it |
| **a future timestamp is refused** | separately for start and end, and once more a single second ahead. The row is then read back and asserted still `READY` with a null `actual_start` — a refusal must leave the row exactly as it was |

`now()` **is frozen for a transaction**, and every test runs inside one that is rolled back. That is
what makes these assertions exact rather than approximate: the entry clock and the stated time are
compared against a single instant, not against two readings of a moving one.

And the control that stops the first two passing for the wrong reason: **a live submission records
both clocks as the same instant.** Without it, "the entry time differs from the end time" would be
satisfied just as well by two clocks that always disagree, which would prove nothing.

---

## 4. Three test-harness defects fixed on the way

### 4.1 `tests/db.ts` now owns what two suites need

`satisfyEvidence` and `createActiveBatch` lived inside `tests/gates.test.ts`. This step needed both,
and two copies of *"what counts as satisfied evidence"* and *"what makes a batch activatable"* would
drift the moment `validate_batch` gains a check — which is the same duplication A4 removed from the
server. Both moved to `tests/db.ts`; `gates.test.ts` imports them and its eleven proofs still pass
unchanged.

`createActiveBatch` keeps its assertion that the blocking set is **empty before** `activate_batch` is
called, so it remains the shortest *honest* path to a running batch rather than a way around the
checks. That is why `tests/db.ts` now imports `expect`.

### 4.2 A refusal aborted the transaction, so "and nothing was written" could not be asked

Postgres aborts a transaction on any error, so `expect(...).rejects` proves the refusal and then
makes every following query fail with *"current transaction is aborted"*. But "the server refused it"
is only half the claim; "and the row is untouched" is the half that needs a read.

New `refuses(db, sql)` helper: a savepoint, the statement, roll back to the savepoint, and **return
the message** so the caller can assert *which* refusal it was. A refusal that says the wrong thing is
a refusal an operator cannot act on, and one test now asserts the message names the activity.

### 4.3 A test batch cannot share the yard with the live ones

The first version placed the test batch mid-process by counting back half a baseline. That overlaps
A3's three live batches, and `validate_batch` refused it with **thirteen `VESSEL_DOUBLE_BOOKED`
findings** — correctly: eleven bunkers against three concurrent batches, held ±2 days around every
activity start.

The batch now ends before the earliest live batch begins. Both terms are **read** — the baseline
length from `process_definition`, the earliest live H0 from `master_batch` — so nothing types a day
count and it stays correct if the demo stagger moves.

### 4.4 One file's encoding was damaged and repaired

`tests/gates.test.ts` was briefly rewritten through a PowerShell pipeline that read UTF-8 as
Windows-1252, turning every em dash and section sign into mojibake. Repaired by reversing the cp1252
decode and re-decoding as UTF-8, verified by asserting no replacement characters remained. The file's
non-ASCII set is back to `— § · → ─` and its eleven proofs pass. Recorded because it happened, not
because it left anything behind.

---

## 5. ⚠ One consequence, stated rather than buried

`evaluate_gates`' `ELAPSED_TIME` kind measures from `actual_start`. **A backdated start therefore
reports a rest as having elapsed earlier than a live clock would** — which is correct when the work
genuinely started then, and is a way to open a gate early when it did not.

What this step does about it:

- the stated time and the typed time are **both** on the row, and both in the audit event;
- the event carries `stated_by_submitter`, so a reader can tell a transcription from a live recording
  without doing arithmetic on two timestamps;
- the server refuses anything in the future.

What it does **not** do is decide **who** may state an actual other than the present, or **how far
back**. Nothing in `docs/` says. `ROLE_AND_APPROVAL_MODEL §2` gives *Record operator actual* to the
operator's column and says nothing about the time of recording, and a limit in hours would be an
invented number. **Reported, not chosen. If the factory wants a rule here, it is one line in this
function.**

---

## 6. Where I did not choose

| Question | What I did |
|---|---|
| **a stated end on a submission held by the evidence gate** | **kept.** The row records what the person reported; discarding it would make them type it again and the second typing would be a different number. The state does not advance — evidence still gates submission, and there is a test for that |
| **an end nobody stated, on a held submission** | left **null**. No `now()` fallback in that branch: with the submission held, an end nobody stated has not happened |
| **a stated end surviving into the call that finally clears the gate** | kept, by `coalesce(p_actual_end, actual_end, now())`. Otherwise the clock of the second call would silently overwrite the slip |
| **an actual before H0** | **not refused.** `TIME_CONTRACT §1.2` says an hour before H0 cannot exist, but it is normative about the *baseline axis*, not about recorded actuals, and it says nothing about this case. Adding the rule would be inventing one. Flagged here instead |
| **a tolerance for device-clock skew** | none. §2 |
| **who may backdate, and by how much** | not decided. §5 |

---

## 7. Conflicts and TBDs touched

**None resolved.** Nothing here decides a factory question, holds a threshold, a duration, an
approver or a schedule mapping.

| Marker | State |
|---|---|
| **TBD-21, TBD-24, TBD-24a** | untouched. No rest duration is read or written here |
| **C-37, C-35, C-32, C-33, C-36** | untouched |
| **TBD-50** | closed already; this step reads no timezone. The two parameters are `timestamptz`, so they are instants and carry their own offset |

`conflict_register` count unchanged. **No new ID was needed** — nothing in this step required a
decision between two sources.

---

## 8. Left undone, and why

- **No operator input for a transcribed time yet.** The server accepts it and `submitActivity` in
  `src/api/batch.ts` passes it, but no screen collects it. It is deliberately not bolted onto
  `TaskDrawer`: a `datetime-local` input yields a **wall clock with no zone**, and `TIME_CONTRACT
  §3.2` is explicit that a factory time must not be interpreted in the browser's zone. That
  conversion belongs beside the field task surface, which is C-FIELD's, and it is where an operator
  actually transcribes a slip. **Named as owed rather than half-built.**
- **`variance_minutes` on the live demo batches is still null**, because no work has been submitted
  on them. `A3.md §8`'s staging question is still open, and this step is the other half of what makes
  a real answer possible: with A4 a photograph can exist, and with this a load's nine minutes can be
  recorded as nine minutes. **Still needs your word.**
- **`audit_event.after_state` on submissions written before this migration** carries nothing. Not
  backfillable — the actuals of a past submission are on the row, but whether they were stated or
  clocked is not recoverable. Rows written from here on carry it.
- **`scripts/prove-acceptance.mjs` and `prove-rest-gate.mjs`** call `submit_activity` with three
  arguments, which still resolves. They fail earlier for other reasons already recorded in `A2.md §4`
  and `A4.md §8`. Not touched.

## 9. Stopped and asked

Nothing. Two questions were **flagged rather than answered**: whether an actual may precede H0 (§6),
and who may backdate and by how much (§5). Neither blocks the gate, and both would have required
inventing a rule the documents do not state.
