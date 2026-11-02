# Batch reports and independent tasks — 29 Sep 2026

## Report

Open a batch → **Progress report · Excel** → **Download Excel** or **Print**.
The supplied Batch 182 spreadsheet was used only for its layout; neither its records nor
its process instructions were imported into the factory. Original file unchanged.

Reports include all master task numbers, Lab rows and readings, each Turner pile, descriptions,
notes and photo counts. Click a task name on the website for its photos. Export uses the same
timestamped snapshot as the screen; Refresh loads fresh data. Closed-batch routes are readable.

Editors have optional **Planned duration** in whole hours + minutes. Both blank = unknown;
zero is valid. **Task settings → Report section** adds headings to consecutive rows sharing
the same section. It changes neither task order nor stream identity. Existing durations are
not guessed or backfilled; recorded rows remain protected.

Timings use IST / Asia/Kolkata. Unstarted rows show suggested start + duration for planned end.
Actual rows show only recorded times; the plan remains in Remarks. Time Taken is actual
elapsed time rounded to the nearest minute, blank when timestamps are missing/inconsistent.
Lab end means submission, not GM approval. Before-app completion does not invent dates.
Excel has typed date/time cells, `hh:mm` clocks and `[h]:mm` durations, including >24-hour rests.
Midnight crossings keep the full end date in Remarks. Export is a values-only snapshot.

Literal notes are inline strings, never executable formulas or links. Long text uses visible
continuation rows. Photos remain private; counts, not expiring URLs/credentials, are exported.

Migration **0154** adds nullable fields and preserves existing edit locks and write roles.
`tk_batch_progress` is a read-only security-invoker RPC under existing RLS; one JSON snapshot
avoids truncation at the 1000-row API limit. `report-layout.json` is a sanitized layout authored
with artifact-tool, not the original private spreadsheet. Conversion happens on the device.

Verification: 38 Node tests passed, including timing edge cases, safe XML, long notes, editor
state and existing fullscreen/performance/auth tests. Generated XLSX was imported and rendered
with artifact-tool without formula errors. A browser download for a 92-task batch included
all 34 Lab tasks; ZIP integrity and exact master-number checks passed.

`node database/progress-report.mjs` tests migration + fixtures then rolls back. `--apply`
commits DDL only after proof and fixture rollback; `--live` tests installed routines. Includes
all planning write paths, role/anonymous access, >1000 rows, closed batches and unchanged data.

## Independent starts

User-requested migration **0155** removes prior-row dependencies for existing/future batches.
`tk_blocker` returns null; `tk_v_task` exposes `can_start` for every todo work/rest/cleaning task
in active batches, with null blocker fields. All v2/v3 API clients and the current APK inherit
this after Refresh. Lab submissions and GM decisions remain recorded but do not block work.
Status, role permissions, photo requirements and closed-batch checks remain unchanged.

`node database/independent-start.mjs --apply` proves before committing; all test records roll
back. No flag rolls back the migration too. `--live` checks installed routines. Covers later
tasks while prior work/Lab is unfinished, Turner T3 before T0, pending GM results, retained
photo/role/closed-batch protections and unchanged existing records. Repeatable-read comparisons
isolate migration effects from concurrent factory activity.

Website deployment: https://07c2d98d.mushroomos-tasks.pages.dev/ (production domain unchanged).
The independently published v1.7/code 8 APK was also verified against its release manifest.
Independent-task behaviour requires no new APK build and applies to existing clients after Refresh. Keep additive
planning columns when reverting a web release, to avoid losing user-entered durations.
Re-enabling dependencies needs an explicit workflow decision, not a silent rollback.
