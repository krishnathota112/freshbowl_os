# MushroomOS — work checklist and role audit (15 Sep 2026)

All database changes are migrations in `mushroomos/supabase/migrations/`, each tested in a rolled-back transaction
before being applied, with a rollback file in `db-rollback-2026-09-13/`. Commits are local only.

## 1 · Process and rules

- [x] **PROCESS-2026F** — current factory baseline: new hopper pass, two-cycle bunker, Turner machine M1/M2 (0090)
- [x] Role boundaries: supervisor = field work, Lab = Lab work, Admin/GM/manager execute nothing; running-batch onboarding without H0; Lab value types (0091)
- [x] **PROCESS-2026G** — tunnel preparation as a parallel prerequisite (~1 h lead) (0092)
- [x] **PROCESS-2026H** — hopper passes 3 h with bunker preparation + cleaning checklist; T0 → T1 rest 6 h (0093)
- [x] **PROCESS-2026I** — day plan: every task has a planned hour from H0 (upper durations, holds on stated hours, Lab with its field step) (0094)
- [x] Onboarded batches plan from their current position; Lab sees its own work (0095)
- [x] **Time gate** engine: after photo and Finish wait for the SOP time; holds on their SOP trigger (OR / AND); Lab checks locked to their field step; typed times refused (0096)
- [x] **PROCESS-2026J** (current) — time gates on 64 timed tasks, 8 temperature triggers, 40 Lab entry rules (0097)
- [x] **DEMO / TEST batch** has no clock; order, photos, readings, Lab locks, approvals and roles unchanged (0098)
- [x] Onboarding from the Admin screen fixed ("DELETE requires a WHERE clause") (0099)
- [x] **Late work needs an approved ticket**; due = day plan + granted hours + 30 min grace; granted hours move every later step; planned / extended / actual variance per task (`v_activity_schedule`) (0100)
- [x] Cheat audit 1: role checks added to 15 server functions; tickets only by the role doing the task; a photo file cannot be reused (0101)
- [x] Cheat audit 2 (full role audit): see section 3 (0102)

## 2 · Screens and apps

- [x] Admin: new batch / add ongoing batch / onboarding; Batches hides cancelled; Demo/Test button opens New Batch with DEMO ticked (fake-data shortcut removed)
- [x] Supervisor: My Work per batch — Today, Due today (waiting), Coming up
- [x] Lab: queue Today / Coming up; value inputs by kind; late banner
- [x] Task screen: before photo → readings → after photo; "Can be finished from HH:MM"; after photo and Finish locked until then; red late banner; ticket buttons 30 min / 1 h / 2 h
- [x] GM: Lab approvals show the actual photos; Progress cards open the batch timeline with every step's photos and readings
- [x] APK rebuilt and installed on the emulator (Medium_Phone); web preview + Cloudflare tunnel
- [x] Run sheet for validation: every task H0 → H476 with its opening rule, finish rule and records (published page)

## 3 · Role audit — holes found and closed

| Severity | Role | Hole | Status |
|---|---|---|---|
| Critical | Supervisor | `hold_activity` + `release_activity` marked **any** task COMPLETED — no photo, reading, time, ticket or approval | Fixed (0102): release only ends a supervisor hold and returns the task to its work |
| Critical | Supervisor | `return_activity` on a LOCKED/READY task made it executable past its entry rules; could reopen Lab checks | Fixed (0102): field work under way or done only |
| Critical | Supervisor, manager, GM | `correct_actual` could move a recorded Start back and beat the time gate and the late rule | Fixed (0102): Admin only, reason required, audited |
| Critical | Supervisor, Lab | Finish or after photo before the SOP time | Fixed (0096/0097) |
| Critical | Supervisor, Lab | Typing an earlier start time on a timed task | Fixed (0096) |
| Critical | Admin (app) | Onboarding a running batch failed from the screen | Fixed (0099) |
| High | Supervisor | `accept_with_deviation` / `verify_corrective_action` waived deviations on their own readings | Fixed (0102): GM only |
| High | Supervisor | `hold_activity` on Lab checks and finished work | Fixed (0102): open field work only |
| High | Any signed-in user | Assign tasks, change planned times, movements, monthly schedule, vessels, machine records, initial material data, lab test requests — no role check | Fixed (0101) |
| High | Supervisor ↔ Lab | Raise a late ticket on the other role's work | Fixed (0101) |
| High | Supervisor, Lab | Reuse an old photo file as new evidence | Fixed (0101) |
| High | Supervisor, Lab | Finish late work without asking for time | Fixed (0100) |
| Medium | Deactivated account | Kept its role from its token until expiry | Fixed (0102): the active profile is the authority |
| Medium | Lab | Sample or photo on a Lab check before its field step | Fixed (0096) |

### Verified as not a hole

- [x] The app has **no direct write access** to any table; every change goes through a server function.
- [x] A user **cannot change their own role** (role comes from server-controlled app_metadata and the profile).
- [x] Anonymous (not signed-in) users can call nothing and read nothing.
- [x] Photos cannot be overwritten (no storage update policy) or deleted once bound.
- [x] The dev clock is not used by any rule; every rule uses the server's time.
- [x] Skipping a task is off for every task in PROCESS-2026J.
- [x] Lab submissions are approved by the GM only, never by the person who submitted.
- [x] Admin and GM cannot do field or Lab work; GM cannot onboard or change batches; Admin cannot approve Lab results.
- [x] Supervisor screen does not list Lab work, and the server refuses it anyway.

### Tests run (all against the live database, rolled back)

| Suite | Result |
|---|---|
| Time gates (0097) | 26 / 26 |
| Demo batch without clock (0098) | 10 / 10 |
| Late tickets (0100) | 14 / 14 (one check had a wrong expectation; the value itself is correct) |
| Cheat audit 1 (0101) | 6 / 6 |
| Role audit (0102) | 14 / 14 |
| Admin → Supervisor → Lab → GM as the app roles | 16 / 16 (one check expected the supervisor list to exclude Lab rows; the screen filters them) |
| Earlier suites 0091 / 0092 / 0093 / 0095 | 39 / 18 / 10 / 16 — unchanged |

## 4 · Known limits (cannot be closed in software)

- [ ] **Web gallery upload.** The APK opens the camera only; a browser can pick a file. Supervisors and Lab should use the APK.
- [ ] **Photo content and typed readings** cannot be proven true; out-of-range readings become deviations, and the GM sees every photo.
- [ ] **Shared logins** cannot be detected.
- [ ] **Operator role.** An `operator` account can still execute operator-responsible field tasks. Decide whether it should exist.
- [ ] **Lab result acceptance.** `accept_lab_result` allows the Lab and the supervisor; decide whether only the Lab should.

## 5 · Still to do

- [ ] GM audit screen: every override in one list (onboarding positions, DEMO flags, time corrections, ticket decisions, cancellations)
- [ ] Variance report screen (planned / extended / actual) on top of `v_activity_schedule`
- [ ] Admin enters the real start time of a step that was already running at onboarding (awaiting decision)
- [ ] Admin user-account creation screen
- [ ] Factory questions: 67–68 % moisture rule; Turner planning durations
- [ ] UI walk-through on the emulator for each role (needs the user to sign in)
