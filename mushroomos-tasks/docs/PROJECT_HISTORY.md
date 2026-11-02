# MushroomOS Tasks — project folder (START HERE)

## Latest — Assign daily tasks + Monthly task chart (6 Oct 2026, local only)

Two new sidebar tabs laid out like the owner's workbooks: a **monthly chart** like the factory's June schedule (dates down, batches across, the day's stage in each cell, multi-day stages repeated with ↳) and a **daily hour-by-hour board** like the stakeholder's Status sheet (date + hour down, a column per batch, one block per task; solid = recorded work, dashed = plan). Admin can move/assign a task to a day from either. Moves go through the
existing guarded batch-plan save, so no migration was needed (next is still 0161) and recorded work stays protected. 151 tests pass. Colours: orange = task, white = rest, red = missed. Admin can edit rows (name, type Process/Rest/Lab/Cleaning, stream, timing, duration, remove), add tasks, change a batch's start (all tasks fill down), see/apply the Paddy convergence plan, drag tasks between days/hours, and use full screen.
Built and browser-checked against a fake-login harness only; **not yet used with a real login, not deployed, no APK built**.
See `docs/DAILY_AND_MONTHLY_PLANNING.md`. (This README's older entries below stop at v2.5; the code is at v2.7 / migration 0160.)

## Latest — v2.5 combined web and APK release (1 Oct 2026)

The Tasks website and public APK update site now both serve **v2.5/code 16**, combining the v2.4 visual theme with the read-only Factory Operations Manager dashboard. The APK is signed with the same certificate as v2.4; existing phones can use **Update** to install over the app without uninstalling. All 80 tests and byte-for-byte public release checks passed. No database or factory record was changed. A one-phone install/camera check is still needed, and Admin must create the Manager account separately. See `docs/RELEASE_2_5_THEME_AND_OPERATIONS.md`.

## Latest — Factory Operations Manager view (1 Oct 2026)

The website now has a separate read-only `operations.html` home for Manager accounts and an Admin link from Data Orientation. It shows active batches and parallel running tasks, actual task-time averages, manpower by task, machine odometer km, measured refuelling and Excel-ready CSV exports, plus the existing per-batch Excel report. The process map is functional, not a claimed physical location; the supplied minimap was a mockup. Admin can create the Manager login on the operations page using the prefilled email and a privately chosen password. No account, batch, photo or database record was changed by this release. All 80 tests passed; the website and final deployment `https://3d6f5864.mushroomos-tasks.pages.dev/` were verified. The APK was not updated. Design decisions and next steps: `docs/MANAGER_OPERATIONS_2026-10-01.md`.

## Latest — independent tasks and batch reports (29 Sep 2026)

**0155 is live:** every unstarted process/rest/cleaning task in an active batch is open,
regardless of earlier tasks or Lab approvals. Applies to all API versions and the existing APK
after Refresh. Lab/GM actions, role permissions, photo requirements and closed-batch protection
are unchanged. No task status or evidence was rewritten. Serial numbers remain guidance.

**0154 is live:** the website adds **Progress report · Excel** to every batch and planned
duration (hours + minutes) to SOP/batch rows. The report follows the supplied Batch 182
spreadsheet format and includes Lab and per-pile records. Optional **Report section** under
Task settings adds headings without changing task order. See `docs/BATCH_PROGRESS_REPORT.md`.
38 app tests and both migrations' transactional proofs pass. This work publishes the website;
existing APKs receive independent task eligibility from the server after Refresh.
Verified production deployment: https://07c2d98d.mushroomos-tasks.pages.dev/.

## Latest — fullscreen row editor (web)

The **Full screen** button beside **Task settings** expands the shared SOP/batch
grid, with pinned headings, its own scrolling area, and **Back to editor** / Esc
to return without losing edits. If browser fullscreen is unavailable, an expanded
window view is used. Exit to use the existing Save controls; fullscreen never saves
or submits a plan automatically. All 33 tests passed. Published to the existing
website and verified against local HTML/JS/CSS:
https://9ff1e3bf.mushroomos-tasks.pages.dev/ (production https://mushroomos-tasks.pages.dev/).
This is a web-only deployment; the published Android APK remains v1.6/code 7.
No database migrations or factory-record changes were made.

## Latest — edit existing batches (28 Sep 2026)

**v1.6 (versionCode 7)** adds **Edit batch · rows** for Admin on an open batch.
Edit the batch's own Process/Lab rows, suggested dates, descriptions and sequence;
add, duplicate or remove unrecorded rows without recreating the batch or changing its SOP.
Recorded work, notes, photos and Lab results are protected. Saves are atomic and reject
stale edits. Migration **0152 is live**; it changes no existing batch records.
See `docs/EDIT_BATCH.md` for verification and release details. Next migration: **0153**.
Website: https://mushroomos-tasks.pages.dev/. APK updates: https://freshbowl-tasks-downloads.pages.dev/.

## Live Tasks website (28 Sep 2026)

**Website:** https://mushroomos-tasks.pages.dev/ — sign in with an existing factory account.
Published `app/www/` to the separate Cloudflare Pages project `mushroomos-tasks` at the owner's request.
18 tests passed; the live entry, login, app, authentication and configuration files return HTTP 200 and
match the tested source. Deployment: https://484625bd.mushroomos-tasks.pages.dev/.
The public browser files contain only the publishable client key; server credentials/backups were not uploaded.
Factory data still uses the existing authenticated database permissions. No batches/photos were changed.
The APK download site remains separate: https://freshbowl-tasks-downloads.pages.dev/.
`app/www/_headers` requires revalidation so later web updates do not remain stuck in browser caches.

## Latest — Android toolbar (28 Sep 2026)

**v1.5 (versionCode 6)** removes the normal toolbar logout button from the mobile APK to prevent accidental
taps. The website retains Sign out. No session/authentication rules or factory records changed.
18 tests pass. See `docs/ANDROID_1_5.md`. Same download address and in-app Update flow as v1.4.

## Latest — Android updates and performance (27 Sep 2026)

**v1.4 (versionCode 5)** adds an Update button, paged SOP editing, no-refetch batch filters,
non-destructive background checks, navigation-race protection and smaller photo uploads that preserve typed
fields. The existing weighment features are retained. First install v1.4 manually; later APKs can be
downloaded through **Update**. **Live download:** https://freshbowl-tasks-downloads.pages.dev/
See `docs/APK_UPDATES_AND_PERFORMANCE.md` for release steps, checks and remaining phone testing.
No database changes in this release. Next migration remains **0152**.

## Latest — Weighbridge (27 Sep 2026, evening)
A separate **MushroomOS Weighbridge** app (own login role, weighments only) and an Admin **Weighments** tab in Tasks:
Admin sets required weight per batch + material with a calculation slip; each weighbridge slip (photo + ticket +
weight, t or kg) is subtracted; Admin is alerted when a material goes over, or is finished short. Migrations **0150,
0151 live** (proof 10/10). APKs: `apk/MushroomOS-Weighbridge-2026-09-27-v1.0.apk`, `apk/MushroomOS-Tasks-2026-09-27-v1.3.apk`.
Details: `docs/WEIGHBRIDGE.md`. Local: `python -m http.server 5191 --directory weighbridge-app/www`. **Next migration number: 0152.**


## Latest: Lab tasks, Turner piles and Description

**Compost standard v2** is the new default: 104 master rows, shown in **Process (64)** and **Lab (40)** tabs.
The tabs preserve master serial numbers. Admin descriptions are saved with SOP and batch tasks.
Turner alone has editable pile counts (six by default), with each pile's T0, T1, rest, T2, T3 and two T1 Lab checks.
Each of the 24 Turner passes has its own required before/after photos, actual times and machine entry.
Migrations 0148/0149 are live; existing batches retain their original task snapshots. The local website is updated.
Android v1.2 includes both this update and the calendar template update. See `docs/LAB_PILES_UPDATE.md`.

## Latest update — ready template and calendar dates (27 Sep 2026)

New batch opens the **Compost standard** template as a filled, editable table. Enter the batch name and
**Batch start — bagasse wetting**, then edit dates, tasks, streams, controls and row order before creating it.
The 43 rows include the owner's schedule and separate approval rows for its three stated Lab gates.
T2/T3 have no exact suggested time until the user sets the per-pile schedule. Conflicting source timings
are called out in the row notes; the supplied calendar dates take priority over H-hour labels.

H-hour inputs and calculated H-hour labels have been removed from normal screens. Dates move with the batch
start; preparation may fall before it. Each batch's edits are saved atomically without changing the source SOP.
All-stream batch view shows serial order. Use **Task settings** for type, checkpoint, photos and requested value.
Use **Save a reusable copy** to save an edited plan as an SOP draft for future batches.

Migrations **0146 and 0147 are live**. Verification: 16 rolled-back plan checks, checkpoint mapping/rollback
checks, the original 9/9 workflow proof, and browser checks of shifting dates, duplication and cleaning rows.
The local website is updated; public hosting still requires the owner's deployment. See
`docs/READY_TEMPLATE_UPDATE.md` for details and verification commands.

A simple, separate task-allocation app for the Freshbowl compost factory: the Admin writes the SOP as a table,
creates a batch on a chosen SOP version, and every row becomes a task that Supervisors, Lab and GM work through on
their phones. This folder is **self-contained**: code, database, APK, product docs, the full context of how it was
decided, and the factory reference material. It is the canonical home of the Tasks app from 27 Sep 2026.

## Read in this order
1. `docs/PRD_MUSHROOMOS_TASKS.md` — what the app is, rules, data, screens, status.
2. `docs/NEXT_STEPS.md` — what to build next (**first: true spreadsheet-style editing**, owner's instruction).
3. `docs/CONTEXT_AND_DECISIONS.md` — the whole story: what the owner asked, what was built, what was rejected and why.
4. `reference/` — the owner's SOP reference table, factory SOP / Turner / Lab sources, main-app product docs.

## Folder map
| Folder | What |
|---|---|
| `app/www/` | The whole app — plain HTML/JS/CSS. The same files are the APK and the web page. `app.js` (screens + logic), `tk-api.js` (database calls), `auth.js` (sign-in), `config.js` (Supabase URL + publishable key only), `app.css` (field-app look) |
| `app/android/` | Capacitor 6 Android shell — package `in.freshbowl.tasks`, name "MushroomOS Tasks" |
| `database/` | `0144`–`0147` migrations (**all applied to the live DB**), their rollback files, rolled-back proof scripts (`proof/`, `ready-template.mjs`), `.env.example` |
| `apk/` | **`MushroomOS-Tasks-2026-09-27-v1.2.apk` — the current one** (ready template, calendar dates, Enter-to-move in the grid). `older/` = v1.0, v1.1 |
| `docs/` | PRD, next steps, context; `history/` = main-app handoff, main-app rules, the parked Experimental Mode spec |
| `reference/owner_sop_reference_table.md` | The H0–H474 table the owner gave **as a format reference** |
| `reference/factory-sources/` | Compost SOP.xlsx, TURNERPRCOESS.xlsx, LAB-2026A Laboratory Process, Geetha / baseline documents |
| `reference/main-app-product-docs/` | The 15 "Geetha final" product docs of the main MushroomOS app (Lab gate rules come from here) |

## Run it on this computer
```
python -m http.server 5190 --directory app/www
```
Open http://localhost:5190 and sign in with a factory account (Admin, Supervisor, Lab, GM). It talks to the **live**
database — what you create is real.

## Build the APK
```
cd app
npm install
npx cap sync android
cd android && JAVA_HOME=/c/Users/prath/.jdks/jbr-17.0.14 ./gradlew.bat assembleDebug
```
→ `app/android/app/build/outputs/apk/debug/app-debug.apk`. (Android Studio's own Java 25 is too new for Gradle 8.2.1;
use JetBrains Runtime 17.) Bump `versionCode` in `app/android/app/build.gradle` for each release.

## Update the live website (with the owner's release approval)
```
npx wrangler@4 pages deploy app/www --project-name mushroomos-tasks --branch main
```

## Database
- One shared **live** Supabase project with the main MushroomOS app (real batches, staff logins, audit). The Tasks
  app owns only the `tk_*` tables, the `tk_*` functions, the `tk_v_*` views and the storage bucket `tasks`.
- Changes: write a new migration (next number after the main repo's latest — the main repo is
  `workingcode/mushroomos/supabase/migrations/`; 0144–0147 are live and are also recorded there, so the **next number is 0148**), a rollback file, and a proof script that runs in a
  rolled-back transaction; then apply. Never reset, reseed or bulk-delete.
- Proof: `cd database && npm install && cp .env.example .env.local` (fill the DB URL) `&& npm run proof:live`.

## Rules for whoever continues
- Keep it simple. The owner: "THIS IS A SIMPLE TASK ALLOCATION APPLICATION — WHY ARE WE OVERCOMPLICATING THINGS".
  Build what is asked; ask before adding a concept.
- The Lab gate stays exactly as in the main app: Lab submits → GM approves (or returns with a reason).
- Each SOP row may have a suggested date/time relative to its example H0. A batch shifts it to its own H0;
  suggestions guide work and never block tasks. Migrations 0144–0147 are live and the v1.2 APK is built; the separate
  web page still needs the owner's deployment.
- No secrets in `app/` (the APK is a zip anyone can open). The agent does not type passwords; the owner signs in.
- Deploys are run by the owner. Commit to git only when asked.
