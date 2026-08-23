# REPORT — staging work history on the three demo batches

**22 August 2026.** Client instruction: stage history *through the real RPCs only, no row inserts*,
with the `DEMO_SPRINT_ORDER §0.3` deviation and real evidence via the A4 path.

**Status: ✅ done as far as the engine permits — and it does not permit Day 8 or Day 16.** That limit
is the engine being right, not a shortfall, and §3 is the arithmetic.

---

## 1. What was built and run

```
new   scripts/stage-history.mjs      the walker. --dry-run reports without writing
edit  tests/demoBatches.test.ts      A3's "no history" assertions → "no FABRICATED history"
edit  tests/evidence.test.ts         the sweep no longer destroys staged evidence  ⚠ §4
edit  tests/tower.test.ts            "exactly three live batches" → at least three
edit  tests/controlTower.test.ts     same
```

Everything goes through `submit_activity` and `bind_evidence`, **over HTTP as the seeded accounts**.
Not one `insert into batch_activity`, not one `update … set state`, nothing written as `postgres`. So
`submitted_by`, `actual_recorded_by` and `uploaded_by` name real profiles, and the trail reads as work.

Actuals are transcribed from each activity's own `planned_start_at` / `planned_end_at` using ACTUALS'
backdating, so they sit where the work was planned to happen rather than at `now()`. They are still my
numbers, so **every submission carries a remark saying so** and the audit event carries
`stated_by_submitter: true`. The record says it was transcribed.

## 2. The result

| | completed | actual ends | variance rows | worst |
|---|---|---|---|---|
| MB-DEMO-LATE | 29 | 29 | 16 | 55 min |
| MB-DEMO-MID | 17 | 17 | 4 | 0 |
| MB-DEMO-EARLY | 9 | 11 | 0 | — |

**50 evidence objects · 57 submissions.** And the engine stopped each batch in its own words:

- **MB-DEMO-EARLY** — `FIB1-WEIGH Load 07` in `DEVIATION`: *"Actual quantity 3.6 MT against 2.000 MT
  planned at Day 0 (+1.60)"*, one successor `BLOCKED` behind it. `DEMO_SPRINT_ORDER §0.3`, left open so
  the Control Room has a real decision for a person to take.
- **MB-DEMO-EARLY** — `Load 09` in `IN_PROGRESS`: *"Cannot submit — 1 evidence item(s) outstanding:
  Load photo"*. Evidence submitted with its photograph deliberately withheld. **A correct engine
  outcome, shown rather than worked around**, per the instruction.
- **MB-DEMO-MID** — three `FIB1-REST-1` lines in `WAITING_TIME` on a live 48-hour countdown.
- **MB-DEMO-LATE** — `FIB1-HOP-1` `LOCKED`: *"Bagasse (new) Weighment not complete on all loads"*. The
  `ALL_INSTANCES` gate holding at 10 of 11, because **the client had already submitted Load 03 through
  the UI** and it is held on its own missing photograph. Their click is the thing blocking the batch.

Three different depths, real actual rails, four kinds of exception. Gate met.

## 3. ⚠ Why Day 8 and Day 16 are unreachable, and why that is correct

A rest gate's clock starts when the gate is **entered**, in server time:

```sql
unblocks_at = coalesce(ba.actual_start, now()) + day0_duration_hr    -- 0018, and 0012 before it
```

`actual_start` on a rest row is null until the gate opens, so it becomes `now()`. **The rest window
begins when the predecessor is submitted, not at the predecessor's recorded `actual_end`. Backdating
the work does not backdate the rest.**

The rest gates on the fibre/pile path to Day 15 are `48 + 24 + 16 + 10 + 48 + 48 = 194 hours`. Reaching
Day 15 through the real path needs 194 hours of wall clock, and no parameter shortens it — which is
exactly what `0008` was built to guarantee and what `demoBatches.test.ts` asserts a phone set forward
cannot bypass.

**The open question this raises, which is not mine to answer.** ACTUALS gave the system backdating, and
the rest gate ignores it. Should a rest window start when the bunker was *actually* loaded, or when the
operator got round to typing it in? Arguably the former is more correct even for the live factory — an
operator transcribing a slip an hour late currently pushes the whole downstream schedule an hour later.
Changing it would make transcribed history work and would change live gate timing. **Flagged, not
chosen.** A TBD candidate.

## 4. ⚠ A test was destroying the staged evidence

`tests/evidence.test.ts` has a `sweepDemoEvidence()` written during A4. It deleted **every** evidence
row on `MB-DEMO-%` at the start of each run — correct while A3's batches were asserted to carry none.

On its first run after staging it deleted all 50 photographs and left **49 activities COMPLETED with
zero proof behind them**. A state the engine cannot produce; the recount trigger manufactured a false
record silently.

It was caught by the criterion-17 assertion added to `demoBatches.test.ts` minutes earlier, **in that
assertion's first ever run**.

Fixed: the sweep scopes to evidence on work that is *not* finished. Staging completes its activities;
the suite only ever targets requirements that are **outstanding** and never submits — so the two are
cleanly separable. The 50 deleted photographs were then restored through the same upload-then-bind
path:

```
requirements to restore: 50
restored: 50
completed activities still owing evidence: 0
```

## 5. Two judgement calls, both reported rather than buried

### 5.1 Activities whose duration the factory never stated

`FIB1-WEIGH` has no `planned_end_at`, because the process definition states no duration for a load —
TBD-21's territory. An end is unavoidable: `submit_activity` writes
`coalesce(p_actual_end, actual_end, now())`, so omitting it stamps `now()`, and for a load transcribed
from 6 August that claims a **sixteen-day weighment**. `duration_actual_min` is generated from the pair.

So `actual_end = actual_start`: `duration_actual_min` reads **0**, which says *no span was measured*
rather than something false, and `variance_minutes` stays NULL because there is no `planned_end_at` to
measure against. Written into the remark on every affected row.

**A nominal load duration from the factory removes the guess entirely.** PROCESS_V2 §2's own example
record shows `Duration | 9 min`, but that is an example, not a spec.

### 5.2 A false record I created and corrected

`FIB1-WEIGH` carries **two** quantity fields — `target_qty_mt` ("Target quantity", the Day-0 plan shown
to the operator) and `actual_qty_mt`. My deviation override matched `/qty/` and wrote 3.6 into **both**,
so the record claimed the *target* was 3.6 against a plan of 2.0 — a false statement about the plan —
and 0017 correctly raised a deviation for each.

Corrected through the real workflow, not by editing rows: the supervisor called `return_activity` with
a reason, the operator re-submitted with `target_qty_mt = 2.000` and `actual_qty_mt = 3.6`.

```
target_qty_mt = 2.000 (in_range)
actual_qty_mt = 3.6   (out_of_range)
```

The script now overrides only fields matching `/^actual/`. **The residue is three open deviations
where there should be one** — see `B4.md §5`: `deviation` is append-only by design and B2 has no verb
for "raised on a mis-keyed value". That needs a process answer.

## 6. A3's assertions were rewritten, not deleted

`demoBatches.test.ts`'s block is still titled *"no work history was fabricated"* — which is what it
always meant. It used to test **absence**; it now tests **authenticity**, which is strictly harder:

- every COMPLETED activity carries `actual_end`, `submitted_at`, `submitted_by`, `actual_recorded_at` —
  the marks only `submit_activity` leaves;
- every satisfied requirement's counter equals the number of `evidence_media` rows whose
  `storage_path` **matches an object that exists in the bucket**;
- no evidence row has a null uploader;
- **no COMPLETED activity owes a gating photograph** — criterion 17, the state the engine cannot
  produce, and the assertion that caught §4;
- three batches, three different depths, and `variance_minutes` equal to
  `actual_end - planned_end_at` wherever both exist and NULL wherever they do not;
- and a guard that fails loudly if the history is ever wiped, so the suite cannot go green on an empty
  product.

## 7. Four tests encoded "exactly three live batches"

`v_live_batch` is `status in ('draft','active')` **by design** — the Batches list must show a draft for
someone to activate it, and `UI_IMPLEMENTATION_PLAN §S2` criterion 17 wants a draft on the tower
showing its plan rail alone.

Four assertions across `tower.test.ts`, `controlTower.test.ts` and `demoBatches.test.ts` asserted the
live set was **exactly** the three demo codes. They failed the first time the client used
`/admin/batch/new`. **A suite that cannot survive the product being used is testing the wrong thing.**

They now assert the three demo batches are *among* the live set, that nothing cancelled is, and that
every row carries one of the two live statuses. The diagonal test scopes explicitly to `MB-DEMO-%`,
because it is about A3's stagger, not a census of the board.

## 8. Left undone

- **`--dry-run` reports one pass only**, and says so. Nothing is submitted, so no gate opens and the
  same READY rows return next pass; counting them as progress spun the loop to its own limit and
  reported 2050 submissions that never happened. A dry run can only honestly report what is open now.
- **The script is not idempotent across a re-seed.** It skips anything not `READY`/`RETURNED`, so
  re-running is safe, but it has no repair mode for evidence deleted from already-completed work — that
  was done with a throwaway script. If §4 ever recurs it should become a `--repair-evidence` flag.
- **No lab results.** `LAB-*` activities were submitted with their `batch_activity_value` readings, but
  B5's `lab_result` subsystem does not exist, so nothing is a versioned lab result yet.
