> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# MushroomOS — handover pack

Self-contained. **Start at `00_START_HERE.md`.**

Anyone picking this project up — a person, an agent, or a model — needs only this folder. Not the
conversation that produced it, and not the rest of the repository (which, until Phase 0 of the
mission is done, will actively mislead them).

```
00_START_HERE.md          the project in one page · read order · state of the world · the five rules
01_MISSION.md             the ordered brief, with the red-team stop gate
02_DOCUMENT_MAP.md        what is authoritative · the archive command to run verbatim
03_PROCESS_STANDARD.md    PROCESS-2026C v1 — the 470-hour standard, hour by hour, with the lab
04_ARCHITECTURE.md        five registers · tables · security · what not to break
05_DATA_CONTRACTS.md      the payload per screen — the screen developer's file
06_UI_VISUAL_LANGUAGE.md  what to keep from the prototype, and what must never be copied
07_WRITE_PATH_MATRIX.md   the red-team audit, eight rows pre-seeded and marked UNVERIFIED
08_DECISIONS.md           every decision and why — read before proposing to change one
09_FINDINGS.md            every known defect and its status
10_OPEN_QUESTIONS.md      four things only the factory can answer
11_TASK_BOARD.md          the work, claimable
12_SESSION_REPORT.md      the end-of-session template — no exceptions

data/schedule.json        the machine-readable 470-hour standard
```

**`data/schedule.json` is the source of truth for every hour figure.** File 03 and the .docx
documents were both generated from it. If two documents disagree about a number, this file settles
it.

## Three things that are true of this folder

**It is small on purpose.** Thirteen files. The project already failed once by accumulating ten
thousand lines of instruction nobody could navigate; this pack exists so that does not recur.

**Every fact lives in exactly one file.** Where another file needs it, it links rather than repeats.
Duplication is how two documents come to disagree.

**It is generated where it can be.** The process tables come from `schedule.json`, so a change to the
standard is a change to one file and a regeneration — not fourteen hand edits and a drift.
