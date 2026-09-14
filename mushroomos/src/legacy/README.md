# `src/legacy/` — retired screens

These screens were built earlier and are **no longer part of the product** (Admin web + Supervisor,
Lab and GM phone screens). They were moved here on 14 Sep 2026 so the live code is easy to read.

- **Not routed**: their old URLs send you to your home screen.
- **Not in the build**: nothing in `app/`, `features/`, `shared/` or `domain/` imports from here
  (enforced by `tests/structure.test.ts`), so none of it ships in the web app or the APK.
- **Still compiled** by `npm run typecheck`, so it does not silently rot.
- Full history is in git; the state before the move is commit `19ec69d`.

| Folder | What was here |
|---|---|
| `admin/` | `NewBatch` (old new-batch flow, replaced by `BatchStart`), `ScheduleBuilder` (per-batch schedule and vessel allocation), `Plant` (factory map of bunkers/tunnels), `BatchTimelineView` (replaced by `BatchMonitor`), `BulkAssign` |
| `gm/` | `ControlTower` — the old GM home board |
| `supervisor/` | `ControlRoom` — the old supervisor home and its data module |
| `manager/` | `Resources` — the manager's resource view |
| `lab/` | `LabQueue.previous.tsx` — an older duplicate of the Lab queue (the live one is `features/lab/pages/LabQueue.tsx`) |
| `ui/` | Components only those screens used: staircase calendar, exception band, movement plan, pending placeholder |
| `dev/` | The developer component gallery and its fixture data |

To bring a screen back: move it into the right `features/<role>/pages/` folder, fix its imports, add
its route in `app/App.tsx`, and run `npm run typecheck` and `npx vitest run tests/structure.test.ts`.
