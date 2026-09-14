# MushroomOS

Production management and traceability for button-mushroom compost — Fresh Bowl Horticulture.

A batch on the current standard, PROCESS-2026C, runs **470 hours** from H0 to grow-room loading. Every activity records who did it, with
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
| **What is happening now** | `docs/03-mission/TASK-BOARD.md` — the backend is frozen; the three UI workstations are being built |
| **How the screens work** | `docs/05-ui/UI-SYSTEM.md` · `WORKSTATIONS.md` |
| **What is broken** | `docs/03-mission/FINDINGS.md` |
| **The signed documents** | `docs/_reference/*.docx` |
| **Why we decided things** | `T:\obsidian\memory` |

## Repository layout

```
freshbowl_os/
├── mushroomos/          THE APP — web (Admin) and Android APK (Supervisor, Lab, GM) from one codebase
│   ├── src/             Application code — see mushroomos/src/README.md for every folder
│   │   ├── app/         entry point + routes
│   │   ├── domain/      pure business logic
│   │   ├── features/    screens per role: admin/ supervisor/ lab/ gm/
│   │   ├── shared/      code used by several roles: api/ auth/ camera/ ui/ utils/
│   │   ├── styles/      CSS and design tokens
│   │   └── legacy/      retired screens, not built into the app
│   ├── supabase/        database: migrations/ (numbered SQL), seed/
│   ├── android/         Capacitor Android project (builds the APK)
│   ├── tests/           unit + engine tests
│   ├── scripts/         node maintenance / verification scripts
│   └── public/          static assets
├── docs/                all documentation (numbered folders; _archive/ is superseded)
├── scripts/             repository-level scripts
├── mails/               correspondence
├── _archive/            non-source material moved out of the root (unpacked APKs, old builds)
├── .kiro/  .claude/     agent configuration
└── CLAUDE.md            agent entry point
```

## Stack

Supabase / PostgreSQL with row-level security · React 18 + Vite · Capacitor for the field build.
76 migrations · 97 relations · 302 functions · 38 views — generated in `docs/SCHEMA.md`.

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
