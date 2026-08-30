# MushroomOS

Production management and traceability for button-mushroom compost — Fresh Bowl Horticulture.

One batch runs **470 hours** from H0 to grow-room loading. Every activity records who did it, with
which machine, in which window, with what measured and what photographed — and the system is built
so that a late activity cannot be made to look on time afterwards.

## If you are an agent

Read **`CLAUDE.md`**, then **`docs/00-START-HERE.md`**. Do not read the repository broadly:
`docs/_archive/` holds superseded instruction that will lead you to rebuild the wrong process.

## If you are a person

| | |
|---|---|
| **What the factory does** | `docs/01-process/STANDARD.md` — the 470-hour process, hour by hour |
| **What we are building and why** | `docs/02-architecture/` |
| **What is happening now** | `docs/03-mission/MISSION.md` and `TASK-BOARD.md` |
| **What is broken** | `docs/03-mission/FINDINGS.md` |
| **The signed documents** | `docs/_reference/*.docx` |
| **Why we decided things** | `T:\obsidian\memory` |

## Stack

Supabase / PostgreSQL with row-level security · React 18 + Vite · Capacitor for the field build.
36 migrations · 50+ tables · ~95 functions · 24 views · 28 test files.

```bash
npm install
npm run db:migrate      # apply migrations
npm run db:seed         # process definition, gates, lab specs
npm run dev
npm run test
```

## The five rules

1. The plan freezes at activation.
2. Actuals are append-only — a correction supersedes, it never overwrites.
3. An extension is a third number, never an edit.
4. The process is data. No factory rule lives in code or in a screen.
5. Read from views, never base tables. Write through RPCs, never insert or update.

## Do not add a markdown file to the repository root

Documents go in a numbered folder under `docs/`, or in `docs/_archive/`. This repository once held
ten thousand lines of root markdown describing a process the factory no longer runs.
