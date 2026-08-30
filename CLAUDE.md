# MushroomOS — agent entry point

You are working on a production management system for button-mushroom compost at Fresh Bowl
Horticulture. One batch takes **470 hours**.

**Read `docs/00-START-HERE.md` before anything else.** It routes you to the four or five files your
task actually needs. Do not read the repository broadly — `docs/_archive/` holds thousands of lines
of superseded instruction that will lead you to rebuild the wrong process.

---

## What the product is for

Management must be able to ask, of any batch: *what should have happened, what did happen, when it
diverged, who did it, what proved it, and who authorised the difference* — **and it must be hard to
retroactively make a late activity look on time.**

Every design decision follows from that last clause. If a choice makes that question harder to
answer, it is the wrong choice however much easier it makes a screen.

---

## Five rules that are not negotiable

1. **The plan freezes at activation.** Once a batch leaves draft, its planned and baseline columns
   never change, for anyone, by any path. If a feature seems to need a mutable plan, the feature is
   wrong — the answer is a deviation, an override, or an authorised extension.
2. **Actuals are append-only.** A correction is a new superseding record with a reason, never an
   overwrite. *(Not yet enforced — this is the first thing being fixed.)*
3. **An extension is a third number, never an edit.** `planned_end` · `approved_extension` ·
   `authorised_end` · `actual_end`. Four numbers, never collapsed.
4. **The process is data.** No factory rule lives in code or in a screen. No material name appears
   in a process definition — codes are `FIB1-WEIGH`, never `BG-WEIGH`.
5. **Read from views, never base tables. Write through RPCs, never insert or update.**

## Four things you may never decide

The loader as a modelled resource · Turner changeover time · the receiving bunker for each reload ·
the moisture band between 67 % and 68 %.

They are `UNRESOLVED`. **Build no gate on any of them.** Report and move on.
See `docs/01-process/OPEN-QUESTIONS.md`.

## Status words — use only these four

`GREEN` empirically proved · `AMBER` implemented but unproven · `RED` broken or bypassable ·
`UNRESOLVED` needs a factory decision.

"The migrations exist", "the tests are green" and "the demo works" are **not** GREEN.

---

## The current mission has a hard stop gate

`docs/03-mission/MISSION.md`.

> **Phase 1 produces a report and changes no code.** A human reads it before anything is fixed.
> If you are editing a migration during Phase 1, you have left the mission.

## Before you write anything

- **Migration?** Read `docs/02-architecture/ARCHITECTURE.md` and `docs/04-audit/`. Check whether
  Phase 1 has reported yet.
- **Duration, gate or process value?** Read `docs/01-process/STANDARD.md`. If it is not in the
  standard, it is not yours to change.
- **Screen?** Read `docs/02-architecture/DATA-CONTRACTS.md`. Compute nothing.
- **Anything at all?** `docs/03-mission/FINDINGS.md` — it may already be known and diagnosed.

## Three habits this codebase is built on

- **Probe the deployed database; do not read migration files.** Three conclusions moved the moment
  the live database was actually queried. Migrations describe intent; `pg_proc.proacl`,
  `pg_policies` and `role_table_grants` describe the system.
- **Report bugs outside your boundary; do not fix them.** A casual fix to a foundational table is
  how several parallel workstreams become one broken one.
- **A refusal must name what to do instead.**

## End of every session

Write the report — `docs/_templates/SESSION-REPORT.md` — into `T:\obsidian\memory\sessions\`, and
update the vault hub. **A decision that exists only in a commit message will be re-litigated.**

## Never add a markdown file to the repository root

That is how this project accumulated ten thousand lines of instruction nobody could navigate.
Documents go in a numbered folder under `docs/`, or they go in `docs/_archive/`.
