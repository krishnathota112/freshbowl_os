# Agent brief — MushroomOS

**Every coding agent reads this file. It is the only instruction document you need.**
Kiro, junior developers, any future agent. There is no second brief, no folder of task prompts,
no pack to assemble. If something else looks like an instruction, check its date against this one.

---

## 0 · Before you write a single line

```
1  read this file, all of it
2  read docs/SCHEMA.md          ← what is ACTUALLY deployed, generated, never hand-written
3  read the contract for your task — docs/02-architecture/DATA-CONTRACTS.md
4  append your session to T:\obsidian\memory\agent-log.md when you finish
```

**Step 2 is not optional and it is the one that keeps being skipped.**

A previous task specified a new table called `lab_checkpoint`. That name was already taken by a
different table with live foreign keys. Nobody found out until an agent tried to create it — three
documents and two sessions after the mistake was made. `docs/SCHEMA.md` is generated from the
deployed database by `scripts/schema-snapshot.mjs`. Every table name, every function signature,
every grant, every policy. **A name in that file is taken.** Check before you specify, before you
create, and before you believe any document that tells you a table is new.

If `docs/SCHEMA.md` is older than the last migration, regenerate it. That is one command.

---

## 1 · The product, in one line

```
SOP → PLAN → OPERATOR DOES WORK → SERVER RECORDS WHAT HAPPENED → EVIDENCE
    → LAB → APPROVAL → GATE → VARIANCE → EXTENSION → FORECAST → MANAGEMENT
```

One batch is 470 hours. An admin picks H0; the system generates the entire planned timeline from
the approved process definition. Nobody types a planned time, ever.

~20–30 users, one factory. **Do not solve problems we do not have.** Prefer the smallest
implementation that makes the important facts reliable.

---

## 2 · Frozen — build against these, never around them

**The five rules.**

1. The plan freezes at activation. Planned and baseline columns never change afterwards, by any path.
2. Actuals are append-only. A correction is a superseding row with a reason, never an overwrite.
3. An extension is a third number, never an edit — `planned_end` · `approved_extension` ·
   `authorised_end` · `actual_end`.
4. The process is data. No factory rule lives in code or in a screen.
5. Read from views, never base tables. Write through RPCs, never insert or update.

**Timestamps.** The server sets them. Always.

```
recorded_at_server   authoritative. The only value variance, gates and forecast read.
captured_at_device   evidence only. Never used in a calculation.
capture_mode         ONLINE | OFFLINE
```

Offline: store the device value, queue, set the server value on receipt, mark `OFFLINE CAPTURE`.
Show both. Reconcile neither. Do not write anything that decides which is "really" right.

**The operator UI is intentionally minimal.** For a normal activity the operator may only:
open the task → START → before photo → do the work → FINISH → after photo. Nothing else. No
editable `actual_start`, `actual_end`, duration, planned time, variance, forecast or process rule.
The operator executes the process; they do not interpret or schedule it.

**The Turner laboratory rule.** Testing happens **before T1 and after T1 only**. No test after T0,
T2 or T3 — that is the process, not an omission. Both readings are **per pile**: six each on a
six-pile batch.

**Four things nobody may decide** — not you, not any agent, only the factory: the loader as a
modelled resource · Turner changeover time · the receiving bunker for each reload · the moisture
band between 67 % and 68 %. Build no gate on any. If your task needs one, stop and report.

---

## 3 · What you may change, and what you may not

| | |
|---|---|
| **Yours** | screens, components, routes, state, styling · the two capture apps and their offline queue · the lab specification tables once R0 below is settled · fixtures for your own screens |
| **Not yours** | any table, function or view not named as yours · migrations you did not write · anything in `docs/01-process/` — that is the factory's process · the contracts (report a gap; never work around one) |
| **Never** | write one of the nine protected facts except through its RPC: plan · actual timestamps · lab result · evidence · approval · deviation · extension · movement · machine usage |

Known open defects, owned by the foundation workstream — **do not fix, do not design around**:
the view write-bypass · the actual-overwrite in `submit_activity` · replay duplication in several
existing RPCs.

---

## 4 · Your current task

### Task A — the laboratory specification model  ·  BLOCKED ON A DECISION, R0 FIRST

The earlier brief for this was wrong: it specified a new table `lab_checkpoint` when that name was
already taken, and simultaneously forbade altering existing tables. Stopping was correct.

**R0 — do this before any DDL.** Write `docs/02-architecture/LAB-SPEC-MODEL.md`, one page,
answering only:

1. What is `checkpoint_map`? Quote the DDL.
2. Does `lab_checkpoint` model definitions or occurrences? What does `lab_sample.checkpoint_id`
   point at?
3. Which fields the spec needs already exist, which are missing, which are named differently:
   `kind` (GATE/DECISION/RECORD) · `per_pile` · `sort_order` · parameters · evidence requirement ·
   gate binding.
4. Does a batch already record which `checkpoint_map` it ran under? If yes, the per-batch freeze is
   already solved — drop `effective_from` entirely.
5. What is `lab_spec`, what is in it, and where did its numbers come from?

Then recommend **EXTEND** (add to the existing family — expected, if `checkpoint_map` is a version)
or **PARALLEL** (a genuinely different concept — name it, and say why one table cannot serve both).
If PARALLEL, the prefix is `labspec_` for the whole family. Not `lab_checkpoint_spec`: three
near-identical names is how the next agent picks the wrong one.

**Stop after that document.**

Standing rulings for this task:
- **RPC names: keep what exists.** `record_lab_result` and the current approval and retest
  functions stay. `submit_lab_result` was invented in a document and is not real. Fix
  `DATA-CONTRACTS.md` to the deployed signature — the document is what is wrong.
- **Idempotency key stands.** One user action → one uuid on the device → same value on every
  retry → stored unique → a replay makes one row. Agree the column name with the foundation
  workstream first.
- **No gate that currently works gets disabled.** "Ships disabled" applied to new bindings only.
  Two gating mechanisms must never run at once.
- **`lab_spec` is the only threshold authority.** Add none. Every band in it needs provenance —
  `FACTORY_CONFIRMED` / `SIMULATION` / `UNRESOLVED` — and until classified may warn, never gate.
- **The JSON supplies no thresholds, no dates, no activity codes.** `null` there means *not
  supplied*, never *zero*. Read real activity codes from `process_activity`; invent none.

### Task B — the laboratory capture screen  ·  NOT BLOCKED

Four taps: batch → checkpoint → pile (only where `per_pile` is true) → enter, photograph, submit.

### Task C — the operator capture screen  ·  NOT BLOCKED

Section 2's operator flow, and nothing beyond it. Show every time as its H-hour **and** clock time
together — `H132 · Tue 02 Sep, 21:00`.

**B and C are not blocked by A.** They read a view; against fixtures they do not need it to exist.

**Both screens, non-negotiable:** offline is the normal case — queue locally, show the queue count
always, retry idempotently, drop nothing silently. The photograph is taken through the camera at
the bench, never chosen from the gallery — its entire value is *when*.

---

## 5 · The rule that makes screens survive

**The app ships a form renderer. It never ships forms.** It does not know that moisture exists. It
reads the spec view and draws whatever came back. When the laboratory changes its mind — and it
will, repeatedly — that is an `UPDATE`, live the same hour. Not a release.

Whatever the contract hands you, you render. Whatever it does not, you do not compute.

```
given  variance_min      → never subtract two timestamps
given  state             → never infer one
given  blocked_reason    → a finished sentence. Never compose one from a code.
given  is_out_of_range   → never compare a value to a threshold
given  expected/captured → never count
```

**Grep test.** Search your screen directory for `moisture`, `pH`, `EC`, `nitrogen`, `ash`, `T1`,
`bunker`, `pile 6`. Every hit is a bug. There should be none.

---

## 6 · When you finish — this is how the work gets tracked

**Append one entry to `T:\obsidian\memory\agent-log.md`.** One line per session, newest at the
bottom. This is how a human sees what every agent has done without opening six repositories:

```
| date | agent | task | status | what changed | what broke | next |
```

Then write the full session report — `docs/_templates/SESSION-REPORT.md` — into
`T:\obsidian\memory\sessions\`, and rewrite `Now.md` so it describes this evening rather than this
morning. Stale, it starts the next session from a false picture.

New decision → `decisions/DEC-0NN-<slug>.md`, never editing an old one; supersede and keep both.
New defect → `findings/F<N>-<slug>.md`.

Three sections people skip, in order of what they cost: **what stopped being true** · **what is
still unknown** ("probed X, did not probe Y" — silence reads as "checked and fine") · **where you
were wrong**, which is the most useful line in any report this project has produced.

**If a document contradicts another document, stop and report it. Do not choose.** That is what
went right last time.

---

## 7 · Open — not yours to decide

Who approves a laboratory result, and whether a technician may approve their own · whether a gate
can be overridden and by whom · every threshold for every parameter · what the chicken-manure
window is measured between · the 67–68 % moisture band · the provenance of every band already in
`lab_spec`.
