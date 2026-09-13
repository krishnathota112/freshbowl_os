# Next session — start here (13 September 2026)

Written for a fresh Claude session on another machine. Read this whole file first, then `docs/AGENT-BRIEF.md` only when a task needs its routing. **Do not write more planning documents.** The planning phase is over; the job is to finish the application.

## 1 · The story

Fresh Bowl makes compost for button mushrooms. One batch takes about 470 hours and runs through many stages — wetting, bunkers, a paddy/straw stream and a nitrogen stream running **in parallel**, six Turner piles, three bunker streams, a shared tunnel — and the laboratory tests the material along the way. Some lab results are **gates**: production cannot continue until a lab result is submitted and someone authorised approves it.

MushroomOS is the app that runs one batch from start to finish and keeps an honest record:

1. **Admin** (web) picks a process version, creates the batch, chooses its materials and start time (H0), generates the plan, reviews it and **activates** it. From that moment the plan is frozen.
2. **Operations / Supervisor** (phone) sees the work that is ready, taps Start, takes the before photo, does the job, takes the after photo, taps Finish. The server records the real times and who did it.
3. **Lab** (phone) takes samples, records readings and photos, and submits. Submitting is not approving.
4. An **authorised person** approves the lab submission. The server re-checks the gate and the next task unlocks.
5. Admin sees what happened: planned vs actual, photos, readings, approvals, who did what.

**What we are doing now:** most of the backend already exists and is good (frozen plans, append-only records, audit log, process stored as data, 25 lab checkpoints). We are **not** rewriting it. We are fixing the places where the code does not yet match the requirements, then proving one real end-to-end batch works, then shipping a two-login Android APK (Supervisor + Lab).

## 2 · Rulings from the user — these override older documents

| Date | Ruling |
|---|---|
| 13 Sep | **Any operator may start or continue any task.** Do not enforce assignment. What matters is recording who started, finished and uploaded what — the server already stores the actor on every action and photo. (Older docs saying "cannot start another person's task" are superseded.) |
| 13 Sep | **First release = Admin, Operations, Lab.** Operations is one product workstation. Operator and Supervisor are not separate application experiences. Backend authorization remains capability-specific. Manager/GM keep backend authority but get no new screens now. |
| 13 Sep | **APK has two quick logins: Supervisor and Lab**, using real Supabase Auth. |
| 13 Sep | **Development happens on a local Supabase in Docker**, never on the shared database. |
| 13 Sep | **Leave GitHub out.** Do not push unless the user asks again. |
| 13 Sep | Stop producing documentation; build and prove the product. |

## 3 · Where things are

| Path (relative to the zip root the user chose) | What |
|---|---|
| `freshbowl_os/` | **The git repository.** Branch `main`, tag `mushroomos-codex-handoff-2026-09-13` |
| `freshbowl_os/mushroomos/` | **The app**: React 18 + TypeScript + Vite, Supabase, Capacitor Android, `supabase/migrations`, `supabase/seed`, `tests/` |
| `freshbowl_os/docs/` | Codex's reconciled model: process, roles, screens, findings (`03-mission/FINDINGS.md`) |
| `CLAUDE_HANDOFF/` (if zipped) | Codex's context bundle + fresh read-only database snapshot `evidence/database-readonly.json` |
| `MushroomOS_Agent_Library_FINAL/` (if zipped) | Requirement library. **Has known errors** — see §6 |
| `manus_frontend/` | Unrelated prototype. Ignore. |

## 4 · Safety rules

- **`mushroomos/.env.local` points at the shared Supabase database** (marked `development`, but it holds demo batches and is what the coworker and APK use). Never run migrations, seeds, demo scripts or the database test suites against it.
- `npm run db` is now **refused** unless the target is localhost (F49: it re-runs every migration and seed and keeps no ledger).
- The test harness (`tests/target.ts`) **refuses a non-local database** unless `ALLOW_REMOTE_DB_TESTS=1`. Do not set that.
- Do not run: `scripts/batchexp-run.mjs`, `lab-demo-state.mjs`, `clean-demo-data.mjs`, `dummy-batch.mjs`, `realtime-batches.mjs`, `acceptance-run.mjs`. They write fake demo data to the shared database.
- Batches `BATCHexp`, `BATCHDEMO`, `BATCHLAB` on the shared database are **fake**: 1×1 placeholder photos and lab approvals with no sample. Never use them as proof.
- `supabase/migrations-pending/0077_...sql` fixes F47 (false `gate_opened` audit events) but is **not applied** to the shared database. It was moved out of `migrations/` so the local database matches the shared one. Test it locally before anyone applies it anywhere.
- Never commit `.env.local`, `key.txt`, `.mcp.json`, `android/app/src/debug/` (a TLS certificate), run logs or the demo scripts above.

## 5 · Set up the local environment

1. Install Docker Desktop and start it. Node 20.
2. `cd freshbowl_os/mushroomos && npm install`
3. `npx supabase start` — first run downloads ~2–3 GB, then applies `supabase/migrations/*` (0001–0036, 0040–0076, 0078) and `supabase/seed/*.sql`. Config: `supabase/config.toml` (custom access-token hook enabled, realtime/edge/analytics off).
4. `npx supabase status -o env` prints the local URL, anon key and DB URL. Put them in `mushroomos/.env.localdb.local` as `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_DB_URL` (local values only).
5. Run the app against local: `npx vite --mode localdb`. Run DB tests with those three variables exported in the shell, e.g. `npx vitest run tests/adminIntake.test.ts`.
6. **The fresh replay fails today — first known failure, 13 Sep.** `supabase start` applied 0001–0020, then stopped at **`0021_resources.sql`**: it inserts `resource_policy` rows referencing `conflict_register` ids `TBD-28`/`TBD-29`, which are created only by **seed** `s01_conflicts.sql` — and the CLI runs all migrations before any seed. The shared database never hit this because its files were applied in a different order over time. Fix inside the repo, e.g. a migration placed before 0021 that inserts the `conflict_register` rows later migrations depend on (take them from `s01_conflicts.sql`, idempotent `on conflict do nothing`), then `npx supabase start` again and fix the next failure the same way. Expect more of this class (migrations depending on seed data) and objects that exist in the shared database but in no migration (dev clock `get_effective_now`, `set_dev_clock_h`, …; ARCH-008) — capture those from `CLAUDE_HANDOFF/evidence/database-readonly.json`. Never fix by editing the shared database.

## 6 · Facts already verified — do not re-investigate

- **94-activity batches:** `src/api/intake.ts` `createAndPlan` sent `roles: []`. `generate_activity_plan` skips every activity whose material role is unbound. PROCESS-2026C has 16 such mandatory activities (9 primary fibre, 4 structural straw, 3 nitrogen) → 110 − 16 = 94: all three preparation streams missing. Active batch `888,999,777` on the shared database has this defect.
- **`validate_batch` did not catch it** (no material-role check).
- The older `src/routes/NewBatch.tsx` has a working material picker; the primary `BatchStart.tsx` dropped it.
- **BatchDetail** (`src/routes/BatchDetail.tsx` ~800–860) looks up activity codes `TR-T0…P1-BUNK-LOAD` that do not exist in PROCESS-2026C (real codes `TRN-P1-T0 … TRN-P6-T3`, six piles) and defaults a missing activity to **COMPLETED**; it also hardcodes an H240 tunnel deadline and "Stream n of 3". (G02)
- **Lab collection time is invented** on the client: `src/api/prebatch.ts` `collectionInstant` = min(now, H0 − 1 h). (G05)
- **Lab integrity (G03/G04):** `complete_activity` → `submit_activity` completes a lab activity with no sample and no readings; `decide_lab_submission` approves it without checking a valid package exists. `accept_lab_result` has no recorder/acceptor separation.
- **Who approves lab submissions is undecided (D09).** Table `lab_approval_reading` has two options (GM / Supervisor), both disabled; the server currently accepts either.
- Lab model in data matches the requirement: 25 LAB-2026A checkpoints, 4 gates (LAB-BNK-PRE, LAB-CM-USE, LAB-BNK-LOAD, LAB-TUN-LOAD), 1 decision (LAB-MOIST-DEC), 20 records; Turner lab only before/after T1, per pile.
- Turner in data: 24 activities (6 piles × T0–T3), each requires a BEFORE and an AFTER photo (48 total).
- Views for a test console exist: `v_evidence_state` (uploader, role, time, storage path), `v_lab_result_history`, `v_lab_approval_queue` (sample_count, result_count, decided_by), `v_batch_event`. Photo `byte_size`/`mime_type` are only in table `evidence_media`.
- **Library errors** (`MushroomOS_Agent_Library_FINAL`): its "revised" SOP workbook is the unrevised one; the only workbook with the Stage-1B second hopper pass is `freshbowl_os/docs/05-ui/Compost SOP.xlsx` and it says 16 h, not 26 h; the "extra Stage-1B soaking rows 22/28/24 h" are the paddy soaks; it states Stage-0B trigger as OR while the workbook says AND; it understates bunker cycles (the SOP has three bunker phases).

## 7 · Current state

**Git** (`freshbowl_os`): `main` at `803d4ad`, tagged. Three local commits are not on GitHub; that is intentional.

**Uncommitted work from the last session — finish it first:**

| File | Change | Status |
|---|---|---|
| `mushroomos/src/api/intake.ts` | `createAndPlan` takes `roles`; new `requiredMaterialRoles(processDefinitionId)` | typecheck passes |
| `mushroomos/src/routes/BatchStart.tsx` | new step "What is it made from?" — per role, defaults from `material_role_eligibility.is_default_lead`, roles used by the chosen process are required | typecheck passes; **not yet tried in a browser** |
| `mushroomos/supabase/migrations/0078_required_streams_need_a_material.sql` | `validate_batch` + blocking `MATERIAL_ROLE_UNBOUND` (warning on already-active batches). Built from the deployed body | **not yet applied anywhere** |
| `mushroomos/tests/adminIntake.test.ts` | new case: all mandatory role activities planned; removing a binding blocks activation | **not yet run** |
| `mushroomos/tests/target.ts`, `tests/db.ts`, `tests/http.ts` | refuse non-local database targets | done |
| `mushroomos/scripts/db.mjs` | refuses non-local targets (F49) | done |
| `mushroomos/supabase/config.toml`, `.gitignore`, `migrations-pending/` | local Supabase setup | done |
| `mushroomos/package.json`, lock | `supabase` CLI devDependency | done |

Still held out on purpose (not ours to commit yet): edits to migrations `0011`, `0012`, `0027` and seeds `s03`, `s10`, `s11`, and new seeds `s12`, `s13` — they belonged to the old re-run-everything runner. `s12`/`s13` publish PROCESS-2026C/2026B and are needed for a working local database.

## 8 · The work, in order

Each step = change → test on the local database → check in the browser → commit locally.

1. **Local environment up** (§5). Record what failed in the replay and fix it with migrations.
2. **Finish G01** (§7 table): run `tests/adminIntake.test.ts`; create a batch in the browser with `BatchStart` and confirm 110 activities for PROCESS-2026C.
3. **G02 — BatchDetail tells the truth**: build the pile panel from the batch's own PILE-scope activities (grouped by pile, ordered by planned start); a missing activity is shown as missing; remove the H240 deadline (tunnel timing is decision D05).
4. **G03 — lab submission integrity** (server): a lab activity cannot complete without a sample and its required current readings and evidence.
5. **G04 — lab approval integrity** (server): a decision needs a valid submitted package; the approver must not be the person who recorded it. The approver *role* stays D09 — do not pick GM or Supervisor.
6. **G05 — real collection time**: stop inventing it in `prebatch.ts`; the server stamps it.
7. **Test console** (read-only, admin-only screen): per batch — photos with thumbnails (signed URLs), uploader/role/time, file size (needs a small view over `evidence_media`), lab readings with retests, approvals with sample/reading counts and approver, audit trail, red flags (approved with 0 samples, tiny photos, recorder = approver, completed with photos missing).
8. **One end-to-end web batch**: Admin create → materials → H0 → plan → assign → activate → Supervisor start/photos/finish → Lab sample/reading/photo/submit → approval → gate opens → next task ready → Admin sees it all in the console.
9. **Operations workstation**: one shell for operator and supervisor (today `isFieldRole` sends operator to the field shell and supervisor to the management shell); remove "Lab Queue" from the supervisor menu, give Lab Status instead.
10. **Lab reachability**: Lab cannot open the incoming-material check (it sits on admin routes).
11. **APK**: two quick logins (Supervisor, Lab), real auth, camera on a physical phone, upload and retrieve a real photo.
12. Later: the full process storyline (parallel streams, Turner, bunkers, tunnel) tested through; extensions/deviations UI; SOP authoring; offline.

## 9 · Do not decide these — build the flag/refer path instead

D01 Stage-1B second hopper pass (new process version, not an edit) · D03 Turner timing · D04 bunker cycles · D05 tunnel timing · D06 stage totals (paddy 74 vs 86/90 h) · D07 trigger AND/OR · D08 lab turnaround · D09 who approves lab · D10 pre-H0 readiness · D11 resources (loader, receiving bunker) · D12 SOP governance · D13 onboarding/closure · D14 extensions · D15 visibility/delegation · moisture band 67–68 %. Register: `docs/01-process/MUSHROOMOS_PROCESS_MODEL.md` § decision register.

## 10 · Checks

From `mushroomos/`: `npm run typecheck` · `npm run build` · `npx vitest run src/domain/time.test.ts tests/fieldShell.test.ts` (no database) · database suites only with local variables exported. Last known: typecheck, build and 61/61 local tests pass at `803d4ad`.
