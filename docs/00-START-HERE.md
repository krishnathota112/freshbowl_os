# START HERE

The router. **Read the row for your task, read those files, ignore the rest.**

There are eleven live documents in this repository. Everything else is either code, or history in
`_archive/` which is not an instruction and must not be read as one.

---

## Read only what your task needs

| I am about to… | Read, in order |
|---|---|
| **start work of any kind** | `03-mission/MISSION.md` |
| **write a migration or touch the database** | `02-architecture/ARCHITECTURE.md` → `04-audit/WRITE-PATH-MATRIX.md` → `03-mission/FINDINGS.md` |
| **change a duration, a gate, or any process value** | `01-process/STANDARD.md` → `01-process/OPEN-QUESTIONS.md`. If it is not in the standard, it is not yours to change. |
| **build a screen or a component** | `02-architecture/DATA-CONTRACTS.md` → `05-ui/VISUAL-LANGUAGE.md` |
| **run the red-team audit** | `03-mission/MISSION.md` §3 → `04-audit/WRITE-PATH-MATRIX.md` |
| **understand why something is the way it is** | `02-architecture/DECISIONS.md` |
| **fix something that looks broken** | `03-mission/FINDINGS.md` — it is probably already diagnosed |
| **pick up a task** | `03-mission/TASK-BOARD.md` |
| **finish a session** | `_templates/SESSION-REPORT.md` |

---

## The whole map

```
CLAUDE.md                        agent entry — auto-loaded by Claude Code
README.md                        human entry
docs/
  00-START-HERE.md               this file
  01-process/
    STANDARD.md                  PROCESS-2026C v1 — the 470-hour process, hour by hour
    OPEN-QUESTIONS.md            four things only the factory can answer
    schedule.json                the machine-readable standard — SOURCE OF TRUTH for every hour
  02-architecture/
    ARCHITECTURE.md              five registers · tables · security · what not to break
    DATA-CONTRACTS.md            the payload per screen — the screen developer's file
    DECISIONS.md                 every decision and why
  03-mission/
    MISSION.md                   the phased brief, with the red-team stop gate
    TASK-BOARD.md                claimable work
    FINDINGS.md                  every known defect and its status
  04-audit/
    WRITE-PATH-MATRIX.md         eight rows pre-seeded, all marked UNVERIFIED
    (SECURITY-ATTACK-MATRIX.md · FOUNDATION-STATUS.md — written in Phase 1)
  05-ui/
    VISUAL-LANGUAGE.md           what to keep from the prototype, what never to copy
    (UI-SYSTEM.md · COMPONENT-INVENTORY.md — written in Phase 5)
  _templates/SESSION-REPORT.md   the end-of-session format
  _reference/                    supporting detail · the signed .docx · the source spreadsheets
  _archive/                      superseded. HISTORY, NOT INSTRUCTION. Do not read as current.
mushroomos/                      the code
```

**Six folders. Never more than three live files in any of them.** If a folder grows past three,
something needs merging or archiving.

---

## Precedence, when two things disagree

```
the process owner's latest ruling
   ↓
01-process/schedule.json          every hour figure, mechanically
   ↓
01-process/STANDARD.md            and the signed .docx, both generated from it
   ↓
02-architecture/                  how the system implements it
   ↓
the two source spreadsheets       for their own regions
   ↓
_reference/                       detail; still carries stale numbers in places
   ↓
_archive/                         history only, never an instruction
```

**Do not silently reconcile a disagreement.** Record the conflict, name the source you selected,
preserve the decision in the vault.

---

## Where the reasoning lives

```
this repository        WHAT is implemented
T:\obsidian\memory     WHY we decided it
```

They are not copies of each other. If a fact is in the repository, the vault links to it rather than
repeating it. Duplication is how two documents come to disagree without anyone noticing.

---

## The rule that keeps this small

**A document not listed in the map above is not an instruction.**

When something is superseded it moves to `_archive/` with a header, **in the same commit that
supersedes it** — not later. Later is how this repository accumulated 10,193 lines of root markdown
that all described a process the factory no longer runs.

Adding a markdown file to the repository root is how the problem comes back.
