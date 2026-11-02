# PRD — MushroomOS Tasks (and the full context of how we got here)

> Current implementation: ready calendar template, Process/Lab tabs preserving master serial numbers,
> Description, and Turner-only pile/pass records with independent photos and Lab results. See
> `READY_TEMPLATE_UPDATE.md` and `LAB_PILES_UPDATE.md`; these supersede older format-reference-only,
> blank-SOP and no-pile instructions. Migrations through 0149 are live.

> **In this project folder** (canonical home since 27 Sep 2026): `tasks-app/` = `app/`, `0144_tasks_app.sql` and the
> proof = `database/`, the APK = `apk/`. Paths below that start with `workingcode/` refer to the original repo.
> **Owner's latest instruction:** the pasted table is only a format reference — SOP editing and task assignment must
> work like a spreadsheet grid, not by paste-and-parse. See `NEXT_STEPS.md` §1 (top priority).

Written 27 Sep 2026 so another Claude account can continue with the same context. Read this file first, then
`docs/CLAUDE_HANDOFF.md` (history of the main app) and `CLAUDE.md` (project rules).

---

## 1. The one-paragraph brief (owner's words, condensed)

> "This is a simple task allocation application." The Admin writes the SOP as a table — like Excel: H-hour, process,
> lab/control — changes it any time, and every change becomes a new version he can choose to use or not. He creates a
> batch, picks an SOP version, and every row becomes a task on the phone. No set durations. Inside a line the next
> task opens when the previous one is done; lines (e.g. Main, Paddy, Cleaning) run side by side. Lab can be done any
> time, before or during the process; at the decision points a **Lab gate** applies exactly as today (Lab submits →
> GM approves). The Admin types every row himself (P1–P6 included). It must be a **new APK, entirely separate** from
> the existing apps, plus a **separate web page**, taking design elements from the existing field app.

**Stop over-complicating.** The owner rejected, in this order: a canvas/"game" process builder, an experimental
layer inside the main SOP engine, "for each pile" automation, cross-line dependency links and a supervisor decision
engine. Build only what the brief says; ask before adding concepts.

---

## 2. Where everything is

| Thing | Path |
|---|---|
| Repo root (canonical copy, git remote "final") | `C:\Users\prath\gk_changes\allthecontext\allthecontext\workingcode` |
| **Tasks app (this PRD)** | `tasks-app/` — `www/` (app.html, app.js, app.css, tk-api.js, auth.js, config.js, login.html, index.html, role_not_served.html), `android/` (Capacitor 6 shell) |
| Tasks APK (current) | `apk/MushroomOS-Tasks-2026-09-27-v1.2.apk` — package `in.freshbowl.tasks`, name "MushroomOS Tasks", v1.2 (versionCode 3) |
| Tasks database | `mushroomos/supabase/migrations/0144_tasks_app.sql` (APPLIED LIVE 27 Sep) · rollback `db-rollback/pre_0144__tasks_app.sql` |
| Tasks proof | `mushroomos/scripts/tasks-app-proof.mjs [--live]` → 9/9 (one transaction, always rolled back) |
| Main MushroomOS web app | `mushroomos/` (React + Vite; Supabase) — deployed by the owner to Cloudflare Pages project `mushroomos` |
| Main field app (existing APK) | `field-app/` (plain HTML) — package `in.freshbowl.mushroomos` |
| Compost Log app (data-collection, 26 Sep) | `datalog-app/` — package `in.freshbowl.datalog`, tables `dc_*` (0141) |
| Factory sources | `docs/SOURCE/` (Compost SOP.xlsx, TURNERPRCOESS.xlsx, LAB-2026A, MushroomOS_Geetha.docx, baselines) |
| Product authority for the main app | `docs/MUSHROOMOS_GEETHA_FINAL/` (15 files) |

Database: one shared **live** Supabase project (holds real batches 155–181, staff logins, evidence). Never reset,
reseed or bulk-delete. `node scripts/apply.mjs <file>` (from `mushroomos/`) applies a migration in one transaction;
DB URL in `mushroomos/.env.local` (server-side only). The anon key in `*/www/config.js` is publishable; **no service
key may ever go into an app folder.**

---

## 3. MushroomOS Tasks — requirements

### 3.1 Roles (existing logins; role comes from the signed token)
| Role | Can |
|---|---|
| Admin | Create/edit SOP tables, publish, make new versions; create batches (pick SOP version, H0); add / edit / remove tasks that have not started; catch-up a running batch ("done before the app", "running since"); close a batch. Does **not** do floor work or approve Lab. |
| Supervisor (operator = same) | Start a task, take before/after photos, enter the asked value (bunker / tunnel / machine no.), remark, finish. |
| Lab | Enter Lab results for Lab and Lab-gate rows (parameters from the Lab checkpoint register or free readings), sample photo, submit. Retest when returned. |
| GM | Approve or return (reason required) a submitted Lab gate. |
| Manager | View only. |

### 3.2 The SOP table (Admin, web or phone)
Columns: **# · Line · H-hour · Suggested date/time · Task · Type · Lab/control · Lab checkpoint · Photos · Ask for**.
The Admin also enters an optional **Suggested date/time** in each SOP row. An example H0 at the top of the SOP
anchors those dates. When a batch is created with its own H0, the suggestions shift by the same amount. They are
shown on the phone as guidance; they do not make a task late or change when it can be opened. Actual start and finish
remain separate server-recorded facts. Main, Paddy and Cleaning use their own lines, so the Admin can suggest their
overlapping work in one table. No row is assigned to a named worker; the appropriate logged-in worker can do it.
- Type: Work, Rest, Cleaning, Lab, Lab gate.
- Photos: none / before / after / before + after (default before+after for Work/Cleaning, none otherwise).
- Ask for: — / Bunker no. / Tunnel no. / Bunker or tunnel no. / Machine (asked at Finish).
- H-hour is a **reference only** (free text, e.g. "H144–H146"). There are no durations and nothing is ever late.
- Row tools: add, insert below, duplicate, move up/down, delete. (Next: true spreadsheet editing — `NEXT_STEPS.md` §1.) **Paste from Excel** (a convenience only) reads Time · H-hour · Task ·
  Lab/control (4 cols), H-hour · Task · Lab/control (3), H-hour · Task (2) or Task (1); header rows skipped; wrapped
  cells (quoted, or split over two lines) joined back; "gate" in the control column → Lab gate.
- Draft → **Publish** (frozen). Any change to a published SOP = **Make new version** (draft copy, v+1). One draft per
  SOP at a time. Old versions stay selectable. Batches record the version they run.

### 3.3 Batches and tasks
- New batch: name (e.g. 182,183,184), SOP version (latest marked), H0 (default now; can be earlier), note. Every row
  becomes a task. The batch shows H-hours ("now H30").
- **Rule 1 — inside a line, in order.** A Work/Rest/Cleaning task can start only when every earlier task in its line
  (except plain Lab rows) is done or "done before the app". Lines are independent (parallel).
- **Rule 2 — Lab rows never hold anything** and can be entered any time.
- **Rule 3 — a Lab gate holds the tasks after it in its line** until the Lab has submitted and the GM approved. GM
  return (with reason) sends it back to the Lab; each submission is a new round; nothing is overwritten.
- Finish needs the configured photos and the asked value. Times are the server's clock. Rest = Start/Finish too.
- Catch-up (Admin): "Done before the app" marks this and the earlier tasks in its line (no times invented);
  "Running since <past time>" for the current task.
- The Admin can add a task to a running batch (end of a line), edit/rename or remove a task that has not started.
- Close batch (Admin) — nothing more can be recorded.

### 3.4 Screens (one page, hash routes; same code is the APK and the web page)
- Home tabs by role: **Batches** (all) · **SOPs** (Admin) · **Lab work** (Lab, Admin) · **Approvals** (GM, Admin; red
  badge with the count).
- Batch: header (SOP vN, H0, now Hx, done/total), line filter chips, each line's tasks in order with state chips
  (Open / Waiting / Running / Waiting GM / Returned / Done / Before app); Admin "+ Task" per line, Close batch.
- Task: details, Start / photos / ask / remark / Finish (Supervisor); Lab form + rounds history + GM decisions (Lab);
  Approve / Return (GM); notes; photos with viewer; Admin edit / remove / catch-up.
- SOP table editor (wide on web, scrolls sideways on phone) and New batch form.
- Look: the field app's greens (#16794a), Hanken Grotesk, cards, 44–48 px targets, Material Symbols.

### 3.5 Data (0144, all `tk_*`, RLS read for the six roles, writes only through functions)
`tk_sop` (family_id, name, version, status draft|published|archived) · `tk_sop_row` · `tk_batch` · `tk_task`
(status todo|running|done|done_before|submitted|returned) · `tk_photo` (bucket `tasks`, path
`<batch>/<task>/<file>`) · `tk_reading` (round, param, label, value, unit) · `tk_decision` (GM).
Views: `tk_v_sop`, `tk_v_task` (can_start, blocked_by, lab_can_enter, photo counts, names), `tk_v_batch`,
`tk_v_checkpoint` (the main app's LAB_2026A checkpoints + parameters/units, read-only).
Functions: `tk_sop_create/save/publish/new_version/delete_draft`, `tk_batch_create/close`,
`tk_task_add/edit/remove`, `tk_done_before`, `tk_running_since`, `tk_start`, `tk_finish`, `tk_add_photo`,
`tk_note`, `tk_lab_submit`, `tk_gm_decide`, helper `tk_blocker`. Every write is logged to `audit_event`.
The Tasks app never touches the main app's process tables (proof T9).

---

## 4. Status (27 Sep 2026, evening review)

**Current state:** migrations 0144, 0145 (suggested date/time), 0146 (ready "Compost standard" template, 43 rows,
`tk_batch_create_plan`) and 0147 (template gates → LAB-BNK-PRE / LAB-CM-USE / LAB-TUN-LOAD) are live. Live proofs on
27 Sep evening: ready template 15/15, workflow 9/9, suggested time 8/8 — all rolled back. The owner has used it with a
real login (three SOPs, three batches incl. "testing batch -0-user-0" on Compost standard). Current APK: v1.2.
Details of the template and calendar editing: `READY_TEMPLATE_UPDATE.md`. Rows below are the earlier history.


Later on 27 Sep: migration `0145_tasks_suggested_time.sql` was applied live after its nine rolled-back checks passed;
the original 0144 proof still passed 9/9. The separate web page is still not deployed and v1.1 has not yet been
installed on a physical phone. The updated APK is `apk/MushroomOS-Tasks-2026-09-27-v1.1.apk`.

| Piece | State | Evidence |
|---|---|---|
| 0144 database | **Live** | `tasks-app-proof.mjs --live` 9/9: SOP rows, versions (frozen v1, v2 draft→publish, one draft at a time), batch on chosen version, line order + parallel lines, photos + ask required, Lab gate (submit → GM return with reason → retest round 2 → approve → next task opens), catch-up, add/edit/remove, main app untouched |
| Web page / APK UI | Built; clicked through with a **fake-login test page** (home, batch, task as Supervisor, GM decision, SOP table, Paste from Excel with the owner's H0–H474 table, Save) | Not yet used with a real login (the agent does not enter passwords) |
| APK | v1.2 built (`apk/`) | **Not yet installed on a phone** |
| Web hosting | **Not deployed** | Owner runs: `npx wrangler@4 pages deploy tasks-app/www --project-name mushroomos-tasks --branch main` (creates a separate Cloudflare Pages site) |

## 5. Next steps (in order)
1. Owner: install the APK; sign in as Admin → SOPs → New SOP → Paste from Excel (the H0–H474 table) → set Line/Type
   (Paddy rows → line "Paddy", cleaning → "Cleaning", gates → Lab gate + checkpoint) → Publish → Batches → New batch.
   Then Supervisor / Lab / GM logins on phones. Fix whatever they report.
2. Deploy the web page (command above). Optionally add a friendly domain.
3. Likely asks to be ready for (do NOT build until asked): alerts/notifications for Lab and GM queues; a batch
   report/export (Excel) with times, photos, readings; reorder tasks inside a running batch; archive an SOP version;
   per-pile convenience ("copy these rows for P1–P6").
4. Keep `docs/CLAUDE_HANDOFF.md` and this file updated after each change.

## 6. Earlier work in this chat (context — mostly the main MushroomOS app)
- **Real batches loaded** into the main app on PROCESS-2026M (one tunnel per part, 127 steps, H472): 155–181, with
  times, weights (tons), vessels; loader `mushroomos/scripts/running-batch/`. Migrations 0133–0136 (process 2026M,
  vessels per step/part, onboarded due rules), 0138 (Lab due, by the CLI), 0140 (audit spam), 0141 cancel frees
  vessels (CLI).
- **Compost Log** (`datalog-app/`, 0141_data_collection, tables `dc_*`): a data-collection APK for running batches
  (typed tasks per lane, catch-up, photos, timestamps, alarms). Still valid; the Tasks app is its successor for new
  work. Its 173–175 data stays in `dc_*`.
- **Experimental Mode inside the main app** (0142 experimental_mode, 0143 clone keeps kind — both LIVE; spec
  `docs/EXPERIMENTAL_MODE_SPEC.md`; web screens `mushroomos/src/features/experiments/`; field-app 1.1
  `MushroomOS-field-2026-09-27-experiments.apk` with "Record a movement"). **PARKED on 27 Sep**: the owner chose the
  separate Tasks app instead. The main app's menu no longer shows Experiments (routes still exist). One draft
  experiment exists live: EXP-01 "sathvikbeta". Nothing needs to be removed; do not extend it unless asked.
- A canvas "experiment builder" prototype was built and deleted the same day (wrong direction).

## 7. Rules that bind any continuation
- Live DB is shared: additive migrations only, each with a rollback file in `db-rollback/` and a rolled-back proof
  script before applying; apply with `node scripts/apply.mjs`.
- No service key in app folders. The agent does not type passwords; the owner signs in.
- Deploys to Cloudflare are run by the owner.
- Commit to git only when asked.
- Do not invent factory rules; ask. The owner wants short answers and no extra concepts.

## 8. Build commands
```
# Tasks APK
cd tasks-app && npx cap sync android && cd android && JAVA_HOME=/c/Users/prath/.jdks/jbr-17.0.14 ./gradlew.bat assembleDebug
# → tasks-app/android/app/build/outputs/apk/debug/app-debug.apk  (Android Studio's Java 25 is too new for Gradle 8.2.1)

# Local web preview of the Tasks page
python -m http.server 5190 --directory tasks-app/www     # then open http://localhost:5190

# Database proof (from mushroomos/)
node scripts/tasks-app-proof.mjs --live
```
