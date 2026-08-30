> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# 00 · START HERE

**MushroomOS · Fresh Bowl Horticulture · handover pack**
Assembled 30 August 2026.

If you are a person, an agent, or a model picking this project up cold: **everything you need is in
this folder.** You do not need the conversation that produced it. You do not need to read the rest
of the repository — and until Phase 0 is done, you should not.

---

## The project in five lines

A production management system for button-mushroom compost. One batch takes **470 hours**.

The product exists so management can ask, of any batch: *what should have happened, what did happen,
when it diverged, who did it, what proved it, and who authorised the difference* — **and so that it
is hard to retroactively make a late activity look on time.**

Every design decision follows from that last clause. If a choice makes that question harder to
answer, it is the wrong choice however much easier it makes a screen.

---

## Read in this order

| # | File | Read it when |
|---|---|---|
| **00** | `00_START_HERE.md` | now |
| **01** | `01_MISSION.md` | **before touching anything.** The ordered brief, with the stop gate |
| **02** | `02_DOCUMENT_MAP.md` | before reading any other file in the repository |
| **03** | `03_PROCESS_STANDARD.md` | before touching the process, the plan, or any duration |
| **04** | `04_ARCHITECTURE.md` | before touching the database or an API module |
| **05** | `05_DATA_CONTRACTS.md` | before building a screen — **this is the screen developer's file** |
| **06** | `06_UI_VISUAL_LANGUAGE.md` | before opening the HTML prototype |
| **07** | `07_WRITE_PATH_MATRIX.md` | during the red-team audit |
| **08** | `08_DECISIONS.md` | when you want to know *why*, before proposing to change it |
| **09** | `09_FINDINGS.md` | when something looks broken — it may already be known |
| **10** | `10_OPEN_QUESTIONS.md` | when you are tempted to decide a factory rule |
| **11** | `11_TASK_BOARD.md` | when picking up work |
| **12** | `12_SESSION_REPORT.md` | at the end of every session, without exception |

`data/schedule.json` is the machine-readable 470-hour standard. Every table in file 03 and every
figure in the .docx was generated from it. **If two documents disagree about an hour, this file
settles it.**

---

## Where things are

```
T:\freshbowl_os\mushroomos      the codebase — Supabase/Postgres + React/Vite
T:\freshbowl_os\docs            specifications; docs/_archive holds superseded history
T:\freshbowl_os\docs\handover   this folder
T:\obsidian\memory              decision memory — WHY each choice was made
```

The repository answers *what is implemented*. The Obsidian vault answers *why we decided this*.
A decision that exists only in a commit message is a decision that will be re-litigated.

---

## State of the world, on one page

**Confirmed by the process owner, 30 Aug:** 470-hour envelope · Turner anchor H174 · six piles ·
two machines M1 and M2 · T0→T1→T2→T3 · P1+P2→B1, P3+P4→B2, P5+P6→B3 · bunker fill 2 h, three
bunkers one after another · both source spreadsheets are what the factory follows.

**Proven in code** — a test asserts it against a real database:

- Plan freeze at activation. Four layers, 14 tests. Migration `0034`.
- Role resolution, fails closed. 9 tests. Migration `0035`.
- Extension / authorisation register. 21 tests. Migration `0036`. **No UI exists for it.**

**Known broken or unproven:**

| | |
|---|---|
| `actual_start` / `actual_end` can be overwritten | **RED.** A live path through the supported RPC. The last hole in the central claim. |
| The 470-hour envelope cannot be stored | **RED.** `baseline_hours` is generated as `(total_days+1)×24`; 470 is not a multiple of 24. |
| Evidence never proven end to end | **RED.** 20 tests skip on a storage permission error. |
| Schema drift | **RED.** 2 tables and 11 functions exist in the deployed DB that no migration creates. |
| The repository teaches the wrong process | **RED.** 10,193 lines of root markdown, all describing the superseded 552-hour model. |
| Publish/freeze on process definitions | Missing — a definition an active batch was built from is still editable. |
| Gate engine, lab permissions, resources, forecast | Never audited. |

**Test suite:** 431 passing · 32 failing · 20 skipped. Every failure is the environment, not the
product — but while that is true a real regression is invisible, which is why greening it is an
early task and not a tidy-up.

---

## The five rules you must not break

1. **The plan freezes at activation.** Once a batch leaves draft, its planned and baseline columns
   never change, for anyone, by any path. If a feature seems to need a mutable plan, the feature is
   wrong — the answer is a deviation, an override, or an authorised extension.
2. **Actuals are append-only.** A correction is a new superseding record with a reason, never an
   overwrite. *(Not yet enforced. It is the first thing being fixed.)*
3. **An extension is a third number**, never an edit. `planned_end` · `approved_extension` ·
   `authorised_end` · `actual_end` — four numbers, never collapsed. Applying an extension by moving
   the planned end erases the original variance, which is the one thing the register exists to keep.
4. **The process is data.** No factory rule lives in code or in a screen. No material name appears
   in a process definition — codes are `FIB1-WEIGH`, never `BG-WEIGH`.
5. **Read from views, never base tables. Write through RPCs, never insert or update.** A screen
   built that way can be rebuilt without a backend change, and can never encode a factory rule,
   because it is never handed one.

---

## The rule that governs the current mission

> **Phase 1 produces a report and changes no code.** Somebody reads it before anything is fixed.
> If you are editing a migration during Phase 1, you have left the mission.

A red-team audit allowed to fix as it goes produces a list of fixes and no map. A report that lands
before any code moves produces a map — and the map is what makes the fixes safe to split across
several people.

---

## Four things nobody may decide alone

The loader as a modelled resource · Turner changeover time · the receiving bunker for each reload ·
the moisture band between 67 % and 68 %.

They are `UNRESOLVED`. Record them as such. **Build no gate on any of them.** File 10 has the full
statement of each.

---

## Status vocabulary — use only these four

```
GREEN       empirically proved
AMBER       implemented, proof incomplete
RED         broken or bypassable
UNRESOLVED  requires a factory or stakeholder decision
```

"The migrations exist", "the tests are green" and "the demo works" are **not** GREEN.

---

## If you are about to

| | Read first |
|---|---|
| write a migration | `01`, `04`, `07` — and check whether Phase 1 has reported yet |
| change a duration or a gate | `03`, `10` — and if it is not in the standard, it is not yours to change |
| build a screen | `05`, `06` — and never compute anything |
| decide a factory rule | `10`. You cannot. Ask. |
| add a markdown file to the repository root | `02`. Don't. |
