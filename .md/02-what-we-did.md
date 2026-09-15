# 02 · What was done

Every database change is a numbered migration in `mushroomos/supabase/migrations/`, tested inside a rolled-back
transaction first, then applied, with a rollback file in `db-rollback-2026-09-13/`. Commits are local git only.

## Before this work (foundation, migrations 0001–0088)

The engine already existed: master batches, process definitions and activities, gate rules, evidence
requirements and photo binding, Lab samples / tests / results and GM decisions, deviations, the audit trail,
extension (late ticket) register, monitoring views (`v_batch_monitor`, `v_batch_timeline`) and the Admin /
Supervisor / Lab / GM screens.

## Process versions

| Migration | Version | What changed |
|---|---|---|
| 0090 | PROCESS-2026F | Current factory baseline from the Word document: new hopper pass, two-cycle bunker (no Reload 2 / Holding 3), CM mix waits for dry mix + moisture decision, tunnel process after the last filling, Turner machine M1/M2 |
| 0092 | PROCESS-2026G | Tunnel preparation is a parallel prerequisite (~1 h before tunnel loading) |
| 0093 | PROCESS-2026H | Water and new hopper passes 3 h; new pass has before/after photos and checklist Bunker preparation + Bunker cleaning; T0 → T1 rest 6 h; photo-count rule |
| 0094 | PROCESS-2026I | Day plan: every task has a planned hour from H0 (upper durations, holds on stated hours, Lab with field step) |
| 0097 | **PROCESS-2026J (current)** | Time gates on 64 timed tasks, 8 temperature triggers, 40 Lab entry rules |

## Engine and rules

| Migration | What it does |
|---|---|
| 0089 | Admin can mark a draft batch DEMO / TEST |
| 0091 | Role boundaries (supervisor = field, Lab = Lab, Admin/GM execute nothing); onboarding a running batch without H0; Lab value types (number / observation / choice) |
| 0095 | An onboarded batch plans forward from its current position; Lab sees its own work |
| 0096 | Time gate engine: after photo and Finish wait for the SOP time; holds on OR/AND temperature triggers; Lab checks open with their field step; typed times refused |
| 0098 | DEMO / TEST batch has no clock |
| 0099 | Fix: onboarding failed from the app ("DELETE requires a WHERE clause") |
| 0100 | Late work needs an approved ticket; granted hours move later steps; planned / extended / actual variance (`v_activity_schedule`) |
| 0101 | Cheat audit 1: role checks on 15 functions; tickets only by the role doing the task; a photo file cannot be reused |
| 0102 | Role audit: hold + release no longer completes tasks; send-back limited; time corrections Admin only; deviations GM only; deactivated accounts lose their role |
| 0103 | Monitoring: operator = supervisor; before photo within 30 min of Start; `v_person_activity`, `v_override_log`; supervisors cannot read the audit trail |
| 0104 | Admin manages logins: create, set password, change role, switch off |
| 0105 | Admin failsafe: open a stuck task, mark work done, reopen a task (reason required, shown to GM) |

## Screens and apps

- **Admin:** simpler Home (actions · waiting for you · running batches), short menu with *More*; New batch / Add a
  batch already running / Onboarding; Batches (cancelled hidden); Tickets; People; **Logins**; failsafe panel on tasks;
  Demo/Test button opens New batch with DEMO ticked (old fake-data shortcut removed).
- **Supervisor:** My Work per batch — Today, Due today, Coming up; task screen with before photo → readings → after
  photo, "Can be finished from HH:MM", red late banner, ticket buttons 30 min / 1 h / 2 h.
- **Lab:** queue Today / Coming up; value inputs by kind; late banner; locked checks explain why.
- **GM:** Approvals show the actual photos; Progress cards open the batch timeline with photos; **People** page
  (who did what today, warnings) and the overrides log.
- **Sign-in:** no demo accounts or password shown in any installed build; icon names no longer show as text.
- **APK** rebuilt and delivered after each round; web preview served through a Cloudflare tunnel.

## Data resets

- 15 Sep: all test batches except 997,998,999 cancelled.
- 15 Sep (later): **all** batches cancelled for clean real-batch testing. Cancelled = hidden, kept on record.

## Tests (live database, rolled back)

Time gates 26/26 · demo 10/10 · late tickets 14/14 · cheat audit 6/6 · role audit 14/14 · monitoring checks ·
logins 13/13 · failsafe 7/7 · Admin → Supervisor → Lab → GM end-to-end with two concurrent batches 16/16 ·
earlier suites 0091 / 0092 / 0093 / 0095 unchanged.
