# START HERE

**Two documents. Find your row, read that one, ignore everything else.**

| If you are… | Read |
|---|---|
| **any coding agent** — Kiro, a junior, anyone building | `docs/AGENT-BRIEF.md` |
| **Claude Code** — foundation, security, backend, contracts | `docs/CLAUDE-CODE.md` |

Both of them tell you to read `docs/SCHEMA.md` before you write a table name or an RPC signature.
Do that. It is generated from the deployed database by `scripts/schema-snapshot.mjs`, and it exists
because a table was specified that already existed under a different shape, and nobody found out
until an agent tried to create it.

---

## Reference — read only what your task needs

| I am about to… | Read |
|---|---|
| **write a migration or touch the database** | `SCHEMA.md` → `02-architecture/ARCHITECTURE.md` → `04-audit/WRITE-PATH-MATRIX.md` |
| **change a duration, a gate, or any process value** | `01-process/STANDARD.md` → `01-process/OPEN-QUESTIONS.md`. If it is not in the standard, it is not yours to change. |
| **build a screen** | `02-architecture/DATA-CONTRACTS.md` → `05-ui/UI-SYSTEM.md` → `05-ui/WORKSTATIONS.md` → `05-ui/VISUAL-LANGUAGE.md` |
| **do anything with the laboratory** | `01-process/LAB-2026A-Laboratory-Process.pdf` → `01-process/lab_checkpoints.json` |
| **understand why something is the way it is** | `02-architecture/DECISIONS.md` |
| **fix something that looks broken** | `03-mission/FINDINGS.md` — it is probably already diagnosed |
| **pick up a task** | `03-mission/TASK-BOARD.md` |
| **see what every agent has done** | `T:\obsidian\memory\agent-log.md` |

---

## The map

```
CLAUDE.md                        auto-loaded by Claude Code — points here
README.md                        human entry
docs/
  00-START-HERE.md               this file
  AGENT-BRIEF.md                 ← every coding agent. The only brief they need.
  CLAUDE-CODE.md                 ← Claude Code only.
  SCHEMA.md                      GENERATED. What is actually deployed. Never hand-edited.
  01-process/    STANDARD · OPEN-QUESTIONS · schedule.json · the LAB-2026A set
  02-architecture/  ARCHITECTURE · DATA-CONTRACTS · DECISIONS
  03-mission/    TASK-BOARD · FINDINGS
  04-audit/      the red-team output
  05-ui/         UI-SYSTEM · WORKSTATIONS · VISUAL-LANGUAGE
  _templates/    SESSION-REPORT
  _reference/    supporting detail · signed documents · source spreadsheets
  _archive/      HISTORY, NOT INSTRUCTION. Never read as current.
mushroomos/                      the code
scripts/
  schema-snapshot.mjs            regenerates docs/SCHEMA.md from the live database
  consolidate-docs.sh            one-shot archive of superseded instruction documents
```

**A folder that grows past three live files needs merging or archiving.** `docs/03-mission/`
reached twelve before this was enforced, and two of them were rival mission documents while this
router pointed at the stale one. That is how agents end up building against instructions nobody
believes any more.

---

## Precedence, when two things disagree

```
the process owner's latest ruling
   ↓  docs/SCHEMA.md              for anything about what exists in the database
   ↓  01-process/schedule.json    every hour figure, mechanically
   ↓  01-process/STANDARD.md      and the signed documents, generated from it
   ↓  02-architecture/            how the system implements it
   ↓  the two source spreadsheets for their own regions
   ↓  _reference/                 detail; carries stale numbers in places
   ↓  _archive/                   history only, never an instruction
```

**Do not silently reconcile a disagreement.** Record the conflict, name the source you chose, and
if two live documents contradict each other, stop and report rather than choosing.

---

## Where the reasoning lives

```
this repository        WHAT is implemented
T:\obsidian\memory     WHY we decided it, and WHO did what
```

Not copies. If a fact is in the repository, the vault links to it. Duplication is how two
documents come to disagree without anyone noticing.

Every agent appends one row to `T:\obsidian\memory\agent-log.md` before finishing. That file is
the index of all agent work; `sessions/` holds the detail.
