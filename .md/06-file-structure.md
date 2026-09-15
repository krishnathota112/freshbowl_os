# 06 · File structure

```
exisiting_freshbowl/exisiting_freshbowl/exisiting_freshbowl/
├── db-rollback-2026-09-13/        rollback file for every migration applied since 13 Sep (pre_00xx__*.sql, rollback_00xx.sql)
└── freshbowl_os/                  the git repository (branch main, local only)
    ├── .md/                       ← this documentation folder
    ├── CLAUDE.md                  entry note for coding agents
    ├── README.md
    ├── docs/                      older and detailed documents
    │   ├── AGENT-BRIEF.md         §0 final build directive (fixed core, Admin configures, SOP as data)
    │   ├── 00-product … 06-acceptance   product, process, architecture, roles, mission, audit, UI, acceptance
    │   ├── PROJECT-OVERVIEW.md, CHECKLIST-2026-09-15.md, SCHEMA.md
    │   └── _archive, _reference, _templates
    ├── _archive/                  old root clutter, kept for history
    ├── mails/, scripts/           correspondence and top-level scripts
    └── mushroomos/                the application
        ├── index.html, vite.config.ts, tailwind.config.ts, tsconfig.json, package.json
        ├── capacitor.config.json  Android app id in.freshbowl.mushroomos
        ├── android/               Capacitor Android project → app/build/outputs/apk/debug/app-debug.apk
        ├── dist/                  built web app (served by vite preview)
        ├── public/
        ├── scripts/               maintenance and probe scripts (several are demo/test only — do not run on real data)
        ├── tests/                 vitest suites (most need a test database)
        ├── supabase/
        │   ├── config.toml
        │   ├── migrations/        0001 … 0105 — the whole database, in order
        │   ├── migrations-pending/
        │   └── seed/
        └── src/
            ├── app/               App.tsx (routes and role guards), main.tsx
            ├── domain/            shared types and contracts (roles, states)
            ├── features/
            │   ├── admin/
            │   │   ├── pages/     AdminHome, Batches, BatchStart (new / ongoing), OnboardBatch, PrepareBatch, BatchPage,
            │   │   │              BatchDetail, AdminTickets, AdminLogins, AdminToday, MonthlySchedule, ProcessExplorer, ReferenceData
            │   │   ├── components/ BatchMonitor (batch timeline with photos)
            │   │   └── api/       intake, onboarding, batches, schedule, prebatch, movements, monthlySchedule
            │   ├── supervisor/pages/  MyWork
            │   ├── lab/           pages: LabQueue, LabCheckpoint · components: EvidenceStep
            │   └── gm/pages/      GmProgress, LabApprovals, GmPeople
            ├── shared/
            │   ├── api/           client (Supabase), batch, work, lab, tickets, monitor, tower
            │   ├── auth/          auth.ts (role, app screens per role), SignIn
            │   ├── camera/        native camera capture (APK opens the camera, never the gallery)
            │   ├── ui/            layout (AppShell), task (TaskDrawer, LateTicketPanel, AdminFixPanel),
            │   │                  primitives (Chip, Card, …), feedback, composite, domain, graph
            │   └── utils/         day.ts (today / coming up), labWords, humanError, now
            ├── styles/            index.css (theme tokens, icon font rules)
            └── legacy/            retired screens, not routed (kept for reference)
```

## Routes

| Path | Who | Screen |
|---|---|---|
| `/admin` | Admin (and management) | Home |
| `/admin/batches` | management | Batches |
| `/admin/batch/start`, `/admin/batch/ongoing` | Admin | New batch / add a running batch |
| `/admin/batch/:id/prepare`, `/admin/batch/:id/onboard` | Admin | Set up / onboard |
| `/batch/:id` | management | Batch page (monitor, overview, activities) |
| `/admin/tickets` | Admin, GM, Manager | Late tickets |
| `/admin/logins` | Admin | Logins |
| `/gm/people` | Admin, GM, Manager | People and overrides |
| `/gm/progress` | Admin, GM, Manager | Progress |
| `/lab/approvals` | GM | Lab approvals |
| `/operator/my-work` | Supervisor | My Work |
| `/lab/queue`, `/lab/checkpoint/:id` | Lab | Lab queue / Lab check |
| `/admin/today`, `/admin/schedule`, `/admin/process-explorer`, `/admin/reference` | management | More menu |
