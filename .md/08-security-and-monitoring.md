# 08 · Security, anti-cheat and monitoring

MushroomOS is an employee-monitoring tool: people will look for ways around it. These are the rules that stop them
and the holes that were found and closed.

## Rules enforced on the server

| What someone might try | What happens |
|---|---|
| Finish early, take the after photo right after Start | Refused until the SOP time has passed |
| Take before and after photos together at the end | Before photo refused later than 30 min after Start (needs a late ticket) |
| Type an earlier start time | Refused: timed tasks are timed by the server |
| Finish late without saying so | Blocked past due time until Admin approves a late ticket |
| Do steps out of order | Task stays locked until the steps before it are done |
| Tap Start on everything to run clocks | Allowed (parallel work is real) but flagged on GM People ("tasks open at once") |
| Reuse an old photo | Same file refused anywhere |
| Change the phone clock | No effect: server time only |
| Do another role's work | Refused (supervisor ↔ Lab ↔ Admin/GM) |
| Approve own Lab result | Refused: GM only, never the submitter |
| Waive own deviation | Refused: GM only |
| Hold + release a task to complete it | Fixed: release returns the task to its work |
| Send back a locked task to open it | Fixed: only work under way or finished |
| Move a recorded Start backwards | Admin only, with reason, audited |
| Keep working after being switched off | Refused immediately (active profile is the authority) |
| Read other people's monitoring or the audit trail | Supervisor / Lab see none of it |
| Sign in with published demo accounts | Accounts and password removed from the app; **replace the passwords** |

## Audits done (15 Sep 2026)

- **Cheat audit 1 (0101):** 15 callable functions had no role check (assignment, planned times, movements, schedule,
  vessels, machines, initial material, lab test requests, ticket expiry) — guarded. Tickets only by the doing role.
  Photo reuse blocked.
- **Role audit (0102):** hold/release completion bypass, send-back bypass, time corrections by supervisor/GM,
  supervisor deviation waivers, holds on Lab checks, deactivated tokens — all closed.
- **Monitoring (0103):** operator = supervisor, before-photo timing, audit trail hidden from the floor.
- **Sign-in:** accounts + password were printed on the APK sign-in page — removed.

Verified as safe: no direct table writes from the app; users cannot change their own role; anonymous users can do
nothing; bound photos cannot be overwritten or deleted; the dev clock is not used by rules; skipping is off.

## What software cannot prove

- That a photo shows the right thing, or that a typed reading is true (the GM sees every photo; out-of-range values
  become deviations).
- Shared logins.
- Gallery photos in a web browser (the APK opens the camera only — floor staff must use the APK).

## Monitoring for the GM

- **People** (`v_person_activity`): per Supervisor and Lab person today — started, finished, open now, photos,
  late finishes, late before-photos, tickets raised / rejected, last action and when.
- **Overrides and decisions** (`v_override_log`): onboarding, DEMO flags, time corrections, ticket decisions, holds,
  send-backs, cancellations, deviations, Lab decisions, process changes, Admin failsafe repairs, login changes —
  who, when, which batch and task, and the reason.
- **Batch page** (`v_batch_timeline`): every step with who, when, readings, photos and tickets.
- **Variance** (`v_activity_schedule`): planned vs extended vs actual per task (no screen yet).
