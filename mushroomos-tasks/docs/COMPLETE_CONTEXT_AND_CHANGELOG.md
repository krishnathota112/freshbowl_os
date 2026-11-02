# MushroomOS Tasks — application context, decisions, and change record

**Recorded 30 September 2026.** This is the handoff for *why this application exists*, how the factory works, what the owner asked for, what was implemented, which earlier decisions were superseded, and what remains uncertain. It covers the separate Tasks app and the related weighment work. It does **not** turn the much larger main MushroomOS specification into a claim that every feature exists in Tasks.

The later decisions in this file take precedence over earlier design notes. In particular, do not reintroduce predecessor/Lab-gate blocking from the original Tasks PRD: migration 0155 intentionally removed it. Check live code and database before acting; a document is not proof of the current factory state.

## 1. Why the factory needs this

Freshbowl makes button-mushroom compost in batches. A batch is not one linear checklist. Bagasse is wetted and sent through hopper passes; material rests and is conditioned in bunkers. Paddy is prepared and soaked in parallel, while chicken manure/minerals are weighed and mixed. Those streams converge. Turner work takes place on distinct piles; the piles later go into bunkers, are reloaded, then feed tunnel streams and ultimately the grow room. Cleaning and Lab checks can happen alongside production. The worked example runs roughly from bagasse-wetting **H0** to final discharge around **H474**; that is a reference schedule, not a universal promise that every batch takes exactly 474 hours.

The owner needs to tell the team what to do, capture *what actually happened*, and see the state of each batch without reconstructing it from calls and paper. For an operational record to be useful, a task needs its batch, place in the sequence/stream, suggested time, actual start and finish, person, photos, machine/bunker/tunnel answer when asked, notes, and any separate Lab result or GM decision. The photos are evidence for specific work, not interchangeable pictures for a whole batch.

The physical context matters to the interface:

- Main, Paddy, chicken-manure/mix and Cleaning can run in parallel. A single global task list or a single rigid chain would misrepresent the floor.
- Local paddy normally has two soaks; the Standard/Punjab variant has three. The Admin must be able to adapt the batch plan rather than have those choices silently hard-coded into the Tasks UI.
- Turner work is per pile: default six piles, with T0, T1, an instructed rest, T2 and T3; Lab checks before/after T1. Before/after photos, times and machine identity belong to each pile/pass task. This separate pile tracking was **explicitly limited to Turner stages** by the owner. Earlier and later stages remain ordinary rows/streams unless the owner decides otherwise.
- The Lab register distinguishes ordinary **records**, **decision points**, and **gates**. Lab submission is not GM approval. The main factory specification has 25 checkpoints (four gates, one decision, 20 records). The Tasks template represented the particular checks and three gate rows called out in the owner's example. The current Tasks app records Lab/GM workflow but, after the owner's 0155 instruction, **does not block process tasks on those approvals**. The main MushroomOS engine has its own, stricter gate rules.
- Bunkers, tunnels, pile pairings, 8-hour Turner rests, moisture/temperature targets and cleaning are meaningful factory instructions. A suggested time or a description in Tasks is not, by itself, an automatic sensor reading, resource check or enforced safety gate. Do not invent missing production/Lab rules.

Primary factory inputs are in `reference/factory-sources/` (Compost SOP, Turner process, Lab process and baseline documents), with provenance in `reference/factory-sources/PROVENANCE.md`. The owner's example schedule is `reference/owner_sop_reference_table.md`. The 15 `reference/main-app-product-docs/` files describe the *main* process engine and its intended controls; they provide factory context, not blanket permission to copy all of that complexity into Tasks.

## 2. Why a separate Tasks application was chosen

The original MushroomOS web/field system is a detailed process execution and monitoring engine: versioned process definitions, frozen batch baselines, dependencies, readiness, time states, Lab gates, resources, deviations, tickets, forecasts and audit. A separate Compost Log also existed for collecting information from running batches. An Experimental Mode within the main engine and a canvas/node process builder were explored, then set aside. They were too elaborate for the owner's immediate need.

The owner repeatedly clarified the desired product: **a simple task-allocation and data-capture application**. The Admin should type and edit the SOP in an Excel-like row table, publish a version, create a batch from it, adjust the rows for that batch, and have those tasks appear on workers' phones. The owner asked for a **separate APK and separate website** using existing factory accounts and familiar field-app design. This is why `MushroomOS Tasks` exists instead of extending the main process engine or turning Compost Log into the new app.

“Assignment” here means placing a task in the SOP/batch, **not assigning each row to a named individual**. An authorized person can open the work and record it. Roles still separate powers: Admin manages plans, Supervisors/operators perform work and photos, Lab submits results, and GM makes Lab decisions. The user explicitly corrected a misunderstanding that only a particular person should be allowed to open a task.

Keep the mental model small:

```text
Published, versioned SOP → editable batch copy → serial-numbered task rows
                                           ↓
                     suggested plan + actual work + evidence + Lab/GM record
                                           ↓
                          batch view and progress report
```

This is **not** a second predictive ML engine. When the owner asked whether ML was needed to see which batch is in which process, the appropriate first layer is ordinary database state, rules and visualizations. The later **Data Orientation** tab is only a placeholder for requirements the owner has not supplied; it does not yet collect data or run analysis.

## 3. Present-day product boundaries and roles

| Surface | Purpose | State recorded here |
| --- | --- | --- |
| **MushroomOS Tasks website + APK** | Admin SOP/batch planning; Supervisor work and photos; Lab/GM records; batch reports | `tk_*` tables and private `tasks` photo bucket |
| **Main MushroomOS web + field app** | The larger official process engine, resource/readiness and monitoring workflows | `master_batch`, `batch_activity`, evidence and other main-app tables |
| **Weighbridge website + APK** | Dedicated, restricted slip-entry station | `wb_*` tables and private `weighments` bucket |
| **Weighments tab in Tasks / main field app** | Admin sets requirements; eligible Supervisor records slips on the main field workflow | The *same* `wb_*` records and rules, not a duplicate ledger |
| **Compost Log / parked Experimental Mode** | Earlier or separate work, not the Tasks workflow | `dc_*` and main-app experiment data remain distinct |

All use one live Supabase project and existing authenticated users/roles. The public website/APK contains only a publishable client key, never a database password or service-role key. Server functions and row-level permissions enforce writes. A downloadable APK can be inspected by anyone who has it; the bundled code/template is public, while factory records require login. Do not confuse a separate interface with a separate production database.

Tasks' operational model now is:

- **Admin:** create SOP drafts, edit rows, publish immutable versions, choose a version for a new batch, adjust the batch-specific copy, add/edit/remove *unrecorded* rows, edit timing, see reports, set weighment requirements and alerts. Recorded task identity and evidence must not be erased by editing a plan.
- **Supervisor/operator:** start and finish work, add photos and notes, record machine/bunker/tunnel answers when configured; a Supervisor can enter weighment slips where the Weighments interface is exposed. This is not Admin approval power.
- **Lab:** submit separate Lab task readings/photos. Returned work is a new submission round rather than overwriting history.
- **GM:** approve or return submitted gate results, with reasons where required. GM decisions remain distinguishable from Lab submissions.
- **Manager:** read/oversight according to existing permissions.

At the owner's later request, all unstarted process/rest/cleaning Tasks rows can be opened **independently** of the row above or a pending Lab/GM result. Serial order and suggested time guide the team; they do not block the Start action. Required task photos/answers, roles and closed-batch protection still apply. Older PRD text describing predecessor or Lab-gate blocking is history, **not the current Tasks rule**.

## 4. How the SOP and batch plan came to work

### The editor is a table, not an equation

The original reference showed `Time | H-hour | Process | Lab/control` from H0 to H474. Initially it was treated as only a format example and the user had to start an SOP from blank rows. The owner then explicitly asked for a **ready, editable template**. The current default `Compost standard` template is prefilled; the Admin can start from it, change rows, and save a reusable draft/version. Blank remains a deliberate choice. Import/paste is a convenience, not the main editing method.

H-hour entry and calculated H-hour labels confused users. Normal screens moved to **suggested calendar date/time**. The batch's bagasse-wetting start is the anchor; template dates shift to each new batch's start. Preparation can be before H0. Suggested times are advisory; actual timestamps are separately recorded. Conflicts in the example schedule were noted rather than silently “fixed” as factory facts. The latest template was expanded from the first 43-row interpretation to **Compost standard v2: 104 master rows, 64 Process/rest and 40 Lab/gate rows**. Later batches may have different row counts because the Admin can customize them.

The table has one master serial-number sequence, even when filtered into **Process**, **Lab** and **All tasks**. Lab is not merely text in a process row: ordinary checks are actual separate Lab tasks. **Description** is another Admin field for instructions/context, distinct from Lab/control and from a worker's actual note. Rows have stream, suggested date/time, process/task, description, control/checkpoint, photo requirement and task settings. Turner pile count defaults to six and is editable before creation; only Turner gets generated per-pile pass/check rows. The field can be changed without duplicating numbered sequences across tabs.

The wide row editor gained paging and a **Full screen** control because the table was hard to navigate. Full screen enlarges the editor with pinned headings and its own scrolling; exiting does not save automatically. Keyboard movement and row add/duplicate/move/remove help, but range selection, Excel-style fill-down and full undo remain proposed improvements, not implemented guarantees.

### SOP version versus a batch copy

Published SOP versions are frozen. A change makes a draft/new version that the Admin may publish and choose later. Creating a batch copies the selected SOP rows, then the Admin may customize **that batch's plan** without rewriting the SOP. After creation, **Edit batch · rows** edits the batch's own future rows: name/note, suggested time, order/stream, descriptions and settings; add/duplicate/remove unrecorded rows. A row with actual state, timestamp, actor, note, photo, reading or decision is protected. Saves use a snapshot token and reject stale edits; existing task UUIDs and evidence are preserved. Closed batches are read-only.

The owner then requested **planned duration** on rows and automatic timing. Admin can set reusable hours/minutes in **Timing setup**. New batch plans calculate suggested times from the bagasse-wetting anchor and the selected scheduling scope. A linked row can follow its predecessor's planned finish in its stream/pile or the master sequence, with a specified gap. Changing a planned start in the editor can shift following rows; a manually changed row becomes an anchor. Unknown durations stay unknown, and recorded rows form protected boundaries. This is *planning assistance*, not a new execution gate or an invented actual timestamp. Existing SOPs and batches were not auto-rewritten; Admin must set authoritative durations on a timed version.

## 5. Evidence, Lab and reports

Work task settings can require before/after photos and a bunker number, tunnel number or machine. The task screen records actual start/end and who did the action. Turner passes have independent photos per pile. Photos live in the private `tasks` Storage bucket at `<batch UUID>/<task UUID>/<file>` and have corresponding `tk_photo` rows; the path/task identity is important for both display and recovery. The mobile performance work can resize large images before upload; the resized uploaded evidence is what is stored, not an automatically archived original camera file.

Lab tasks bind to checkpoint parameters where configured. The Lab submits a round of readings; GM can approve or return the gate. These actions and readings are not the same as a worker's process completion. The owner asked for a separate Lab tab and for normal Lab work to be possible before/during the process. After 0155, even a pending GM result no longer blocks a process task in **Tasks**; approval still has an audit record. If enforcing a particular gate becomes necessary again, that needs a fresh, explicit factory workflow decision.

Each batch has a **website progress report and Excel download**, based on the owner's `20260925 Batch 182 Progress.xlsx` layout. The sample supplied *format*, not data to import. Reports include the master serial numbers, Process/Lab and pile rows, plan/actual dates and times, duration/time taken, descriptions, notes, Lab readings and photo counts. Task links on the website lead to the actual photos. The export takes a timestamped snapshot; it does not embed private expiring photo links. A blank actual time is not estimated, and “done before app” does not invent a date. Optional report-section headings group rows without changing their identity/order.

## 6. Weighment: related but not the same as process tasks

The owner also needed a dedicated way to capture **randomly arriving raw materials**. Admin enters a requirement for a batch number and material, with a calculation slip and an allowed variation. A weighbridge slip contains a required photo, ticket/vehicle/supplier details and gross/tare or net weight. The database subtracts net from required fresh weight in a numbered ledger: required → slip 1 → new balance → slip 2 → new balance. An over-delivery beyond allowance alerts Admin immediately; short is judged when the material is marked **Finished**. Voiding a wrong slip preserves history and recalculates the balance.

This first lived in a separate Weighbridge app/login and an Admin Weighments tab in Tasks. Weighment requirements were later allowed **before** a Tasks batch exists: Admin types batch numbers and a sheet of materials. Numbers can later link to a main-app batch. Admin can edit numbers, add materials, close/reopen and manage alerts. The main field APK later gained a Weighbridge tab so Supervisors can record slips with the **same** `wb_*` logic; Admin still decides the required quantities and is responsible for overrides and alerts. The separate weighbridge-only station/app remains available.

**Unit rule:** canonical values are stored in **kg**; the display/input unit is chosen explicitly. One metric ton = **1,000 kg**. The previous interface could reinterpret the same digits when changing kg ↔ tons, producing a 1,000× error. The fix converts the unsaved number while preserving the physical amount and shows units in labels/previews. Admin can set a preferred unit **per material** across devices: ammonium sulphate defaults to kg, other materials to tons, and Admin may change this. Slip entry may still choose a unit. For the owner-confirmed Paddy (Local) requirement on weighment batch `183,184,185`, **51.85 tons = 51,850 kg** and allowed variation **100 kg = 0.1 ton**. These figures were corrected through audited Admin functions; 100 kg is *not* one ton.

Weighment batches/requirements/slips are **not** `tk_batch`/`tk_task`. Similar batch numbers do not mean their rows can be deleted, merged or recovered interchangeably. Main-app evidence is another distinct bucket.

## 7. Delivery and usability changes

- The Tasks website uses `app/www/`; the Capacitor Android APK packages the same frontend. The website and APK download site are **different** deployments. Recorded addresses: `https://mushroomos-tasks.pages.dev/` for Tasks, `https://freshbowl-tasks-downloads.pages.dev/` for APKs, and `https://mushroomos-weighbridge.pages.dev/` for the separate weighbridge website. Availability was not retested while writing this document.
- The owner chose a visible **Update** button for new APKs, not silent installation. An APK checks a version manifest on the separate HTTPS download site, opens the download, and Android asks the user to confirm installation. Old APKs without the button need one manual update. Keep the same signing identity and do not uninstall over an existing data-bearing install.
- Reported sluggishness/freezing/jumping/lost inputs led to 20-row SOP-editor paging, deferred settings controls, less refetching, guarded navigation, background change indicators instead of screen replacement, request timeouts/read deduplication, photo preparation and form preservation during upload. Automated/browser checks passed; a factory-phone performance test was still called out as necessary. Do not claim every device glitch is solved from desktop tests alone.
- The native APK's logout control was first removed after repeated accidental taps, while website Sign out remained. The owner later asked for it back. The current APK has a visible **Logout** button with confirmation and duplicate-tap protection. The change of mind is intentional, not a contradictory spec.
- An Admin-only **Data Orientation** tab was added as a blank workspace after the owner said he would explain its purpose next. It currently has **no data sources, reports, ML model or new record-collection behavior**.

## 8. Chronological implementation record

This lists the meaningful changes; migration numbers are source-file identifiers, not permission to replay them against production. Some older README/PRD release notes were not kept current and are explicitly superseded above.

| Period / change | Why | Implemented result |
| --- | --- | --- |
| 27 Sep — `0144` initial Tasks app | Need a separate, simple SOP-to-phone task app | Versioned SOPs, batch/task snapshots, photos, Lab/GM records, role-based app and Android shell |
| `0145` suggested time | Need a “supposed to be done” column reusable with a new H0 | Relative SOP suggestions shift with each batch; actual work separate |
| `0146`–`0147` ready template | Starting every SOP from nothing and H-hour equations were too hard | Filled editable calendar plan, three explicit example gate rows/checkpoint mappings, batch-specific copy |
| `0148`–`0149` Lab/Turner | Lab checks were missing as tasks; each Turner pile/pass needed its own record | Process/Lab tabs with shared numbering, Description, six default Turner piles, individual pass photos/checks; 104-row default SOP |
| `0150`–`0151` Weighbridge | Raw-material receipts needed a dedicated, photo-backed balance ledger | Weighbridge role/app, Admin requirements, slips, alerts and audit |
| Android v1.4 / code 5 | Phones felt slow/glitchy; updates were hard to distribute | Update button and performance/navigation/photo improvements; public installer site |
| Android v1.5 / code 6 | Logout was tapped accidentally | Native toolbar logout removed at that stage |
| Website publication | Admin/others needed browser access | Separate Tasks Pages site with authenticated factory records |
| `0152`, Android v1.6 / code 7 | A created batch needed later row edits | Admin batch-plan editor with protected recorded work and atomic stale-save checks; later web fullscreen control |
| `0153` | Weighments can precede task-batch creation | Admin types batch numbers and material requirement sheet; per-slip balance display |
| `0154`, Android v1.7 / code 8 | Owner supplied Batch 182 output layout | Planned duration and website/Excel progress report |
| `0155` | Owner said open all tasks without the task-above dependency gate | Independent starts; Lab/GM recorded but not process blockers in Tasks |
| `0156`, Android v1.8 / code 9 | Planned times should fill automatically and move when edited | Admin timing rules, linked advisory schedules and protected anchors; kg/ton UI conversion fix also released |
| Android v1.9 / code 10 | Owner requested logout back | Confirmed native Logout restored |
| `0157` | Ammonium sulphate is entered in kg, other materials mainly in tons | Admin-controlled per-material unit preference; kg remains canonical storage |
| `0158` and later packaged releases | Supervisors needed a Weighments tab in the main field workflow | Same `wb_*` slip rules exposed to supervisors; Admin requirement control retained |
| Tasks APK v2.2 / code 13 | Owner asked for a “Data Orientation” interface before specifying its work | Admin-only empty tab; current packaged version per `app/www/build-info.js` and `release-site/latest.json` |

The repository contains v2.0 and v2.1 APK artifacts, but their exact per-version change notes are not preserved here; do not invent a mapping for those two installers. The latest *local* release manifest identifies v2.2/code 13. The separate Weighbridge and main-field APKs have their own release/version paths.

## 9. The production deletion and recovery — do not omit this

During this work, live **Tasks** batch/task/photo records were bulk-deleted. This was a destructive error, **not** a hidden-batch UI state. A runnable flush script had been left from an earlier clear-all discussion; leaving such a script available in a shared live project was unacceptable. The owner had spent a week monitoring these records. The loss includes data that cannot currently be reconstructed from audit alone. The script is disabled; do not run it or reproduce its behavior.

Recovery on 30 September used only surviving audit, Storage logs and the remaining live database. Four old Tasks batches—173–175, 176–178, 179–181 and 182—and **151 task rows** were reconstructed from audit snapshots. **34 missing photo links** were restored to exact original tasks; sample image bytes from each batch opened, and a restored photo displayed in the Tasks app. Seven more old batch 183–185 image files were made visible in private Storage and one was verified, but they were **not attached** to the newly recreated batch: the deleted plan had 103 rows, the newly created one 99, and original task IDs differ. Guessing a task/photo match would corrupt evidence. The recovered 183–185 upload paths and four original task start/finish audit pairs are preserved for manual reconciliation.

The post-photo-recovery local snapshot contained **6 live Tasks batches, 251 task rows, 37 `tk_photo` links and 44 Tasks Storage object rows** at the instant it was taken. Counts can change as factory staff continue working; they are not a live dashboard. The separate main factory `evidence` bucket had 1,442 objects and was not part of this Tasks repair. **Lab reading values and GM decision rows were not restored**: the surviving audit records submission/approval events and counts, not their values. Photos older than the available Storage-log window may also be missing. Do not present the reconstruction as complete.

Recovery evidence, checksums, scripts, exact caveats and original 183–185 photo/task IDs are in `database/recovery/RECOVERY-2026-09-30.md` and adjacent snapshots. The project had no usable free-plan database backup in the checked dashboard. Any further recovery must first snapshot current live state, preserve newer worker entries, and avoid fabricating timestamps, people, images, readings or approvals. Never bulk-delete production data to fix visibility. Prefer close/archive/hide only after confirming the exact intended scope and recovery route.

## 10. What is **not** built or not yet verified

- Data Orientation has not been specified beyond an empty Admin tab. No ML planning model, automatic process-stage analysis or new reports were authorized/implemented there.
- The Tasks app is not the main MushroomOS process engine. It does not enforce all convergence, bunker/tunnel occupancy, detailed cleaning readiness, late-ticket, forecast or process-variant rules found in the main-app product documents.
- A suggested calendar time or planned duration is advice, not a promise of startability, an actual recorded time, a sensor result or a late/overdue enforcement rule in Tasks.
- Turner per-pile rest is an instruction/row, not an automatic eight-hour timer. Per-pile tracking outside Turner was specifically not requested.
- Spreadsheet range copy/fill, drag-reorder and full undo were ideas in older next-step notes, not confirmed completed features.
- Physical factory-phone testing of each APK update, camera orientation, weak-signal uploads and performance was not conclusively documented by the desktop tests. Installation on a real device should be tested without uninstalling the existing app.
- The deleted 183–185 Tasks history, some potential older photos, and actual Lab reading values remain unresolved. The recreated batch must not be silently treated as an exact restoration.
- Factory source questions such as the 67–68% moisture decision band, final cleaning checklists, exact tunnel hold interpretation and unspecified Lab/photo thresholds remain **NEEDS FACTORY DECISION** in the main-app references. A convenient UI default must not be presented as a confirmed factory rule.

## 11. How to continue responsibly

1. Ask the owner for a concrete Data Orientation screen/workflow before building it. Begin with trustworthy normal-code status/visualizations and add ML only if there is a specific question, dataset and validation method.
2. For SOP/timing changes, confirm factory meaning when a source is ambiguous; show the resulting batch copy and protect recorded work. Do not alter a published SOP or existing evidence in place.
3. For weighments, keep the admin-required fresh weight, slip net, selected display unit, kg canonical value and allowed variation visibly distinct. Confirm any correction to saved quantities instead of deriving it from a screenshot alone.
4. Before touching live records, take a fresh read-only export, identify exact batch/task IDs, use a transactional dry run and verify after commit. Never use a broad delete/flush script as a UI cleanup mechanism.
5. Treat documentation, tests, generated APKs, deployed website and current database as separate evidence. Record which was actually checked. Do not call a deployment live because a local file exists.

## 12. Where to read next

- [README](../README.md) — project layout, historical release status and run/build commands (some older “latest” paragraphs are superseded here).
- [Context and decisions](CONTEXT_AND_DECISIONS.md) and [Tasks PRD](PRD_MUSHROOMOS_TASKS.md) — original owner's words and initial design; read alongside newer update docs because their dependency/H-hour sections are historical.
- [Ready template](READY_TEMPLATE_UPDATE.md), [Lab and piles](LAB_PILES_UPDATE.md), [batch editing](EDIT_BATCH.md), [progress report](BATCH_PROGRESS_REPORT.md) and [automatic timing and units](AUTO_TIMING_AND_WEIGHT_UNITS.md) — detailed implementation decisions and checks.
- [Weighbridge](WEIGHBRIDGE.md), [APK updates/performance](APK_UPDATES_AND_PERFORMANCE.md), [logout removal](ANDROID_1_5.md) and [logout restoration](ANDROID_1_9.md) — related workflow and release history.
- [`database/0144_tasks_app.sql`](../database/0144_tasks_app.sql) through [`database/0158_weighment_main_app.sql`](../database/0158_weighment_main_app.sql) — database implementation and migrations; read the applicable rollback/proof before any change.
- [`app/www/`](../app/www/) and [`app/tests/`](../app/tests/) — the actual Tasks web/APK behavior and tests; [`weighbridge-app/www/`](../weighbridge-app/www/) is the separate weighbridge client.
- [Recovery record](../database/recovery/RECOVERY-2026-09-30.md) — deletion/recovery evidence and unresolved losses; this must accompany any future claim that old Tasks data was restored.

**Guiding principle:** let Admin express the factory's plan in editable rows; let authorized people record reality; keep plan, actual work, Lab decisions, photo evidence and weighment numbers distinct; never fill gaps with invented facts.
