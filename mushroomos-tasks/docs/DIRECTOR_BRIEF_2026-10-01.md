# Director brief — a decision view for the director / Manager login

Built 1 October 2026. **Not linked, not released.** It lives in four new files so it cannot collide with other work in progress:
`app/www/director.html`, `director.css`, `director.js`, `director-model.js`, with 15 unit tests in `app/tests/director.test.cjs`.

## Why a separate view
The existing **Factory Operations** page (`operations.html`) answers *"what is happening?"* — running tasks, observed averages, crews, machines,
fuel, the full ledger. A director also needs *"what is at risk, what is behind, what is waiting on someone, where do materials stand?"* —
without reading tables. The Director brief is that view. It links to Operations for the detail.

## Who sees it
The account already exists as the **Manager** login (Vikas Jasti), so no new role or database change is needed. The page is **read-only**:
it contains no write call. Admin can open it too (shown as "Admin preview"). Permissions are still enforced by the database (RLS), not by this page.

## What it shows (all derived from data the Manager login can already read)
1. **Key figures** — batches on track, items needing attention, tasks completed in the period (with a trend line), materials at risk.
2. **Needs attention** — one ranked list: Paddy convergence shortfalls (from the existing forecast), tasks late to start, tasks running over
   plan, Lab gates waiting on GM, tasks returned to Lab, material over-delivery / short closes / open weighbridge alerts, quiet batches.
   Most serious first, then longest waiting. CSV download.
3. **Batch health** — per batch: completed share against the share the plan expected by now (marker on the bar), late/over/waiting counts,
   Paddy forecast status, next planned task, last activity. CSV download.
4. **Throughput** — tasks completed per India calendar day (done-before-the-app excluded: that is catch-up, not work).
5. **Schedule adherence** — typical and slowest-10% start versus the suggested start, and hours over planned duration, by stage.
6. **Materials** — weighment requirements of active batches with received/required and state.
7. **How to read this** — every definition and threshold on the page itself, so nothing is a black box.
8. **Print / PDF** — A4 portrait stylesheet for a one-page brief.

## Honesty rules (also covered by tests)
Missing times/crews/readings stay missing, never zero. Planned, forecast and actual are kept separate. A failing forecast or an unreadable
materials section never breaks the page; it says so and the rest renders. Thresholds are in one object (`THRESHOLDS` in `director-model.js`).

## Not claimed
Physical bunker/tunnel occupancy (no resource register exists yet), unique-person headcount, fuel burned per task, or cost. The Paddy
forecast is advisory and does not prove other readiness. See `MANAGER_OPERATIONS_2026-10-01.md` for the same limits on the Operations page.

## To switch it on (deliberately not done yet)
- Landing: in `app/www/auth.js` change the `manager` entry of `ROLE_HOME` from `operations.html` to `director.html`.
- Link: add an "Open Director brief" link on `operations.html` and from Admin's Data Orientation.
- Release: a new version (>= 2.6 if 2.5 is current), the usual build/sign/deploy; `verify-release.mjs` should list the four new files.
- First real use: sign in as the Manager and compare a few figures against the Operations page and the batch screens before trusting thresholds.

## Preview used
Seen with fake data only (overdue starts, an overrun, a GM wait, over-delivered ammonium sulphate, 14 days of finished work); no live record was read or written.
