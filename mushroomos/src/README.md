# `src/` — how the MushroomOS app code is organised

One React + TypeScript app serves all four surfaces. The Admin screens run on the web; the Supervisor,
Lab and GM screens run in the Android APK (Capacitor), which wraps this same code.

```
src/
├── app/                 Entry point and router — where the app starts
│   ├── main.tsx         Boots React, React Query and the router (index.html loads this)
│   └── App.tsx          Every route (URL → screen) and the role guard
│
├── domain/              Pure business logic: types, time arithmetic, contracts. No React, no database
│
├── features/            The screens, one folder per role / surface
│   ├── admin/           ADMIN — web
│   │   ├── api/         Data calls only the admin screens make
│   │   ├── components/  Pieces used only by admin pages (BatchMonitor)
│   │   └── pages/       One file per admin screen
│   ├── supervisor/      SUPERVISOR — phone app
│   │   └── pages/       MyWork (production tasks across all active batches)
│   ├── lab/             LAB — phone app
│   │   ├── components/  EvidenceStep (photo capture for a checkpoint)
│   │   └── pages/       LabQueue, LabCheckpoint
│   └── gm/              GENERAL MANAGER — phone app
│       └── pages/       LabApprovals, GmProgress
│
├── shared/              Code used by more than one feature
│   ├── api/             Supabase client and data calls shared across roles
│   ├── auth/            Sign-in screen, roles, which screens each role may open
│   ├── camera/          Native camera capture (the only camera code in the app)
│   ├── ui/              Reusable interface pieces
│   │   ├── primitives/  Buttons, chips, cards, skeletons — the smallest building blocks
│   │   ├── layout/      AppShell (web/management chrome), FieldShell (Lab phone chrome), PageHeading
│   │   ├── task/        TaskDrawer (the task sheet) and LateTicketPanel (late-task tickets)
│   │   ├── feedback/    ErrorPanel
│   │   ├── domain/      Time labels, durations, live admin widgets
│   │   ├── composite/   Larger composed views: hour rail, event stream, narrative
│   │   └── graph/       Process-graph node
│   └── utils/           Small helpers: readable errors, server clock, lab wording
│
├── styles/              index.css (Tailwind + globals) and tokens.css (colours, fonts)
│
└── NOT_NEEDED/          RETIRED screens moved to NOT_NEEDED/frontend_legacy/. Not routed, not built into the app
```

## Where each screen lives

| Who | URL | File |
|---|---|---|
| Everyone | `/sign-in` | `shared/auth/SignIn.tsx` |
| Admin | `/admin` | `features/admin/pages/AdminHome.tsx` |
| Admin | `/admin/today` | `features/admin/pages/AdminToday.tsx` |
| Admin | `/admin/batches` | `features/admin/pages/Batches.tsx` |
| Admin | `/admin/batch/start` · `/admin/batch/ongoing` | `features/admin/pages/BatchStart.tsx` |
| Admin | `/admin/batch/:id/prepare` | `features/admin/pages/PrepareBatch.tsx` |
| Admin | `/admin/batch/:id/onboard` | `features/admin/pages/OnboardBatch.tsx` |
| Admin | `/batch/:id` (Monitor tab) | `features/admin/pages/BatchPage.tsx` → `features/admin/components/BatchMonitor.tsx` |
| Admin | `/admin/tickets` | `features/admin/pages/AdminTickets.tsx` |
| Admin | `/admin/schedule` | `features/admin/pages/MonthlySchedule.tsx` |
| Admin | `/admin/process-explorer` | `features/admin/pages/ProcessExplorer.tsx` |
| Admin | `/admin/reference` | `features/admin/pages/ReferenceData.tsx` |
| Supervisor | `/operator/my-work` | `features/supervisor/pages/MyWork.tsx` (+ `shared/ui/task/TaskDrawer.tsx`) |
| Lab | `/lab/queue` | `features/lab/pages/LabQueue.tsx` |
| Lab | `/lab/checkpoint/:activityId` | `features/lab/pages/LabCheckpoint.tsx` |
| GM | `/lab/approvals` | `features/gm/pages/LabApprovals.tsx` |
| GM | `/gm/progress` | `features/gm/pages/GmProgress.tsx` |

## Rules (checked by `tests/structure.test.ts`)

1. **Live code never imports from `NOT_NEEDED/frontend_legacy/`.** If a retired screen is needed again, move it back into
   `features/` on purpose.
2. **A feature never imports another feature.** Anything two roles need goes in `shared/`.
3. **`domain/` stays pure** — no React, no Supabase, no screens.
4. **The old stub folders do not come back**: no `src/routes/`, `src/components/`, `src/lib/`, `src/api/`.
5. **Names**
   - Folders: lowercase (`kebab-case` if more than one word).
   - React components: `PascalCase.tsx` — one main component per file, named like the file.
   - Other modules (data calls, helpers, hooks): `camelCase.ts`; hooks start with `use`.
   - Tests: `camelCase.test.ts`, in `/tests` (or beside pure `domain/` code).

And from the architecture: screens **read from views** and **write through RPCs**
(`shared/api`, `features/*/api`), never directly to base tables.

## Outside `src/`

| Folder | What it is |
|---|---|
| `android/` | The Capacitor Android project that packages this app as the APK |
| `public/` | Static files served as-is (icons, web manifest) |
| `supabase/migrations/` | The database, as numbered SQL migrations — never renamed, never edited after applying |
| `supabase/seed/` | Seed data for a fresh database |
| `tests/` | Unit and engine tests (the database suites refuse to run against the shared remote DB) |
| `scripts/` | Maintenance, verification and probe scripts run with `node` |
| `dist/` | Build output (generated, not committed) |
