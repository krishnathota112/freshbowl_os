# Handover

**This document is addressed to you.** It is the only document you need to start. If a file you
are reading talks *about* you in the third person, or assigns work to another agent, it is not
addressed to you — close it and come back here.

---

```text
YOU ARE KIRO.

Your job is to build the application.

Do not perform the foundation work again.
Do not redo the security audit.
Do not reopen frozen process decisions.
Do not fix things marked as owned by the foundation workstream.

Read, in this order:
   1  docs/00-START-HERE.md
   2  this file, in full
   3  the contract for the screen you are building — docs/02-architecture/DATA-CONTRACTS.md
   4  docs/05-ui/VISUAL-LANGUAGE.md

Then:
   → claim the first task below
   → implement it
   → run its acceptance test
   → update the task status
   → continue
```

---

## What is frozen

You build against these. They do not move, and nothing you build may require them to.

**The process.** One batch is 470 hours. H0 is chosen by an admin; the system generates the entire
planned timeline from the approved process definition — planned timestamps, dependencies, lab
checkpoints, Turner stages, bunker stages, tunnel stages. No screen ever asks anyone for a planned
time.

**The five rules.**

1. The plan freezes at activation. Once a batch leaves draft its planned and baseline columns never
   change, by any path. A feature that needs a mutable plan is a wrong feature — the answer is a
   deviation, an override, or an authorised extension.
2. Actuals are append-only. A correction is a new superseding record with a reason, never an
   overwrite.
3. An extension is a third number, never an edit. `planned_end` · `approved_extension` ·
   `authorised_end` · `actual_end`. Four numbers, never collapsed into fewer.
4. The process is data. No factory rule lives in code or in a screen.
5. Read from views, never base tables. Write through RPCs, never insert or update.

**The Turner laboratory rule.** Testing happens **before T1 and after T1 only**. There is no
laboratory test after T0, T2 or T3 — that is not an omission, it is the process. Both readings are
taken **once per pile**: six each on a six-pile batch, not one each. A screen offering a single
moisture field at "before T1" is wrong, and it will not look wrong until somebody asks why pile 4
has no history.

**Timestamps.** The server sets them. Always.

```
recorded_at_server   authoritative. Server-set. The only value variance, gates and forecast read.
captured_at_device   evidence only. What the phone said. Never used in a calculation.
capture_mode         ONLINE | OFFLINE
```

Online: server timestamp, device value stored alongside. Offline: device value stored, event
queued, server timestamp set on receipt, record marked `OFFLINE CAPTURE`. Both are shown. Neither
is reconciled away, and you must not write anything that decides which one is "really" right.

**Four things nobody may decide** — not you, not anyone on this project, only the factory: the
loader as a modelled resource · Turner changeover time · the receiving bunker for each reload · the
moisture band between 67 % and 68 %. Build no gate on any of them. If your task appears to need
one, stop and report it.

---

## What exists

**The laboratory specification is data, not code.** Five tables — `lab_checkpoint`,
`lab_parameter`, `lab_threshold`, `lab_evidence_requirement`, `lab_gate_binding` — describe 25
checkpoints, 4 gates, 1 decision and 20 records. `docs/01-process/lab_checkpoints.json` is the
source they are seeded from; `docs/01-process/LAB-2026A-Laboratory-Process.pdf` is the human
version.

This is the single most important thing to understand before you write a screen:

> **The app ships a form renderer. It never ships forms.**
>
> It does not know that moisture exists. It reads `v_lab_checkpoint_spec` and draws whatever came
> back — a numeric field for NUMERIC, a chooser for OBSERVATION with options, a text field for
> OBSERVATION without. When the laboratory changes its mind — and it will, several times before
> December — that is an `UPDATE`, live the same hour. Not a release. Not a new APK.

**All four gates ship switched off.** `lab_gate_binding.is_enforced = false` everywhere. There is
not one confirmed threshold, for any parameter, at any checkpoint, and no confirmed sampling
method either. A gate firing on day one against numbers nobody has agreed stops the factory for a
reason that turns out to be wrong — that happens once, and then the app is never opened again.
Gates come on later, one boolean at a time, when the laboratory has signed the thresholds.

**Known open defects, owned by the foundation workstream.** You need to know these exist so you
neither build a workaround nor try to fix them:

| | |
|---|---|
| View write-bypass | client roles can write some tables through views. Being closed. |
| Actual overwrite | `submit_activity` can overwrite a recorded actual. Being fixed. |
| Capture idempotence | several existing RPCs duplicate on replay. Being fixed. |

Build against the contracts as written. Do not design around these, and do not repair them.

---

## What you may change

- Everything under the screen layer: components, routes, state, styling, navigation.
- The two capture applications and their offline queue.
- The five `lab_*` tables and `v_lab_checkpoint_spec` / `v_lab_batch_progress` — these are yours.
- Fixtures and test data for your own screens.

## What you may not change

- Any table, function, view or RPC that is not one of the five `lab_*` tables above.
- Migrations you did not write.
- Anything under `docs/01-process/` — that is the factory's process, not ours.
- The contracts in `docs/02-architecture/DATA-CONTRACTS.md`. If a contract is wrong or missing a
  field, report it; do not work around it and do not edit it.
- The nine protected facts: plan · actual timestamps · lab result · evidence · approval ·
  deviation · extension · movement · machine usage. Nothing you build may write one of these
  except through its RPC.

---

## Your current task

Three, in this order. The first blocks the other two; the second and third are independent and can
run at the same time.

### 1 · The laboratory specification tables

Full brief: `docs/03-mission/kiro/01_KIRO_LAB_SPEC_TABLES.md`.

Five tables, seeded idempotently from `docs/01-process/lab_checkpoints.json` by a script — not by
hand. Two views, `v_lab_checkpoint_spec(batch_id)` and `v_lab_batch_progress(batch_id)`. Three
RPCs: `submit_lab_result` (append-only, never updates), `supersede_lab_result` (writes a new row
marking the old superseded, with a reason), `approve_lab_result`.

`submit_lab_result` takes an `idempotency_key` (uuid), stored, unique. The device generates it once
per user action and resends the same value on every retry. One replayed submission produces one
row. This is not optional and not deferrable — the table does not exist yet, so it costs nothing
now and costs a migration against live field data later. Agree the column name with the foundation
workstream before writing it; both sides of the wire must match.

A batch keeps the specification it started with. Resolve the spec at activation and record which
rows applied — same rule as the plan freeze, same reason. Get this wrong and every historical batch
silently acquires a hole the first time somebody adds a checkpoint.

### 2 · The laboratory capture screen

Full brief: `docs/03-mission/kiro/02_KIRO_LAB_SCREEN.md`.

Four taps to a saved reading: batch → checkpoint → pile (only where `per_pile` is true) → enter,
photograph, submit. Offline is the normal case, not the edge case: queue locally, show the queue
count on the main screen at all times, retry automatically and idempotently, never drop anything
silently.

### 3 · The operator capture screen

Full brief: `docs/03-mission/kiro/03_KIRO_OPERATOR_SCREEN.md`.

The operator UI is intentionally minimal. For a normal activity the operator may only:

```
open the assigned/eligible task
   ↓ START
capture the required start/before photo
   ↓ do the physical work
   ↓ FINISH
capture the required finish/after photo
```

Nothing else. Do not expose editable `actual_start`, `actual_end`, duration, planned timestamps,
variance, forecast or process rules. The operator is executing the process, not interpreting or
scheduling it. Every extra field is a field somebody has to be trained on, at night, on a phone,
with one hand free.

Show every time as its H-hour **and** its clock time together — `H132 · Tue 02 Sep, 21:00`. The
H-hour is what the process is written in; the clock time is what the operator lives in. Showing one
without the other has already produced a real error on this project.

---

## Your contract

Whatever the contract hands you, you render. Whatever it does not hand you, you do not compute.

```
It gives you    variance_min          → you never subtract two timestamps
It gives you    state                 → you never infer one
It gives you    blocked_reason        → a finished sentence. You never compose one from a code.
It gives you    is_out_of_range       → you never compare a value to a threshold
It gives you    expected · captured   → you never count
```

The screen never computes process sequence, duration, eligibility, gate logic, lateness, variance,
forecast, evidence requirements, approval authority, or an official timestamp. A component that
computes has to be rewritten every time a contract moves. A component that computes nothing
survives.

**The grep test.** When a screen is finished, search its directory for `moisture`, `pH`, `EC`,
`nitrogen`, `ash`, `T1`, `bunker`, `pile 6`. Every hit is a bug. There should be none.

---

## Your acceptance criteria

A task is done when all of its criteria pass — not when the code looks right.

**Task 1**

1. The seed script reads `lab_checkpoints.json`, creates 25 checkpoints and every parameter, and
   running it a second time changes nothing.
2. `v_lab_checkpoint_spec(<batch>)` returns every checkpoint with its parameters, in order, ready
   to render, in one round trip.
3. Adding one row to `lab_parameter` makes a new field appear in that view with no code change.
   Prove it: add EC to the pre-Turner check, show it, remove it again.
4. Every gate binding has `is_enforced = false`, and a test asserts no activity is blocked by a
   laboratory gate.
5. `submit_lab_result` called twice with the same `idempotency_key` produces one row. Called twice
   with different keys produces two, and the first is unchanged.

**Task 2 and Task 3**

1. The grep test returns zero hits.
2. Adding a parameter row makes a new field appear with no rebuild.
3. Aeroplane mode: capture four readings, close the app, reopen, restore signal — exactly four rows
   arrive and the queue empties visibly.
4. The same capture submitted twice creates one row.
5. A per-pile checkpoint asks for the pile; every other checkpoint does not.
6. The photograph is taken through the camera at the bench. It cannot be selected from the gallery
   — the entire value of the photograph is *when*, and a gallery pick destroys it.
7. `recorded_at_server` and `captured_at_device` are both stored, both visible, and `capture_mode`
   is set correctly.
8. Recording a two-hour-late activity takes exactly the same number of taps as an on-time one. If
   it is harder, people will record late work as on-time, and the product loses its purpose.

---

## How to report completion

At the end of every session, before you summarise anything:

1. Write the session report — format at `docs/_templates/SESSION-REPORT.md` — into
   `T:\obsidian\memory\sessions\YYYY-MM-DD-<slug>.md`.
2. Rewrite `T:\obsidian\memory\Now.md` so it describes this evening, not this morning. It is what
   the next session reads first; stale, it starts everything after it from a false picture.
3. Update the session list and findings table in `T:\obsidian\memory\MushroomOS.md`.
4. New decision? `T:\obsidian\memory\decisions\DEC-0NN-<slug>.md`. Never edit an existing decision
   file — supersede it and keep both.
5. New defect? `T:\obsidian\memory\findings\F<N>-<slug>.md`.
6. Claim, complete or add tasks in `docs/03-mission/TASK-BOARD.md`.

Three sections people skip, in order of what they cost: **what stopped being true** (a document now
wrong, an assumption disproved, a workaround no longer needed) · **what is still unknown** —
"probed X, did not probe Y", because silence reads as "checked and fine" · **where you were wrong**,
which is the most useful line in any report this project has produced.

Then say, in your summary: what became true, what is still unknown, and the exact next task.

---

## Known limitations, stated so you do not trip over them

- No confirmed threshold exists for any parameter. Do not colour anything against a number.
- Approval is not yet a separate act. Who may approve a laboratory result is an open stakeholder
  decision; until it is answered, capture only, and `approve_lab_result` records who pressed it and
  gates nothing.
- There is no trend screen and should not be one yet. Twenty readings is not a trend.
- The 67–68 % moisture band has no rule. Record, flag, refer to a human. Never round it.

## Open stakeholder decisions

These block parts of the product and only the factory can answer them. If one blocks you, stop and
report it — do not default it, and do not infer it from what seems sensible.

| | |
|---|---|
| Who approves a laboratory result | and whether a technician may approve their own |
| Whether a gate can be overridden | and by whom, and whether it needs a reason |
| Every threshold, for every parameter | none is confirmed |
| The chicken-manure window measurement point | arrival-to-unload, or arrival-to-mixing-start |
| The 67–68 % moisture band | no rule exists |

---

> **This section is replaced when the foundation mission completes.** At that point *What exists*
> above gains the proven backend path — batch creation, plan generation, server timestamps,
> evidence upload and retrieval, the approval and gate path, resource contention, and the
> management read contracts — and the three known open defects are struck out or restated with
> what actually shipped.
