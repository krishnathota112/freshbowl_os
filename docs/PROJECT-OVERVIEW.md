# MushroomOS — what this project is

MushroomOS is the process-control system for **Fresh Bowl's mushroom compost yard**. It turns the compost SOP into
day-by-day work for the factory floor and makes sure every step is done **in order, on time, with evidence**, and
that the people approving the work can see exactly what happened.

It is one web application (Admin, GM) and one Android APK (Supervisor, Lab, GM).

---

## The problem it solves

Compost is made over roughly 20 days (H0 → H476). Every batch runs the same SOP: bagasse wetting and conditioning,
paddy soaking, chicken-manure mixing, hopper passes, six Turner piles, three bunkers with two holding cycles each, and
the tunnel programme, ending in discharge to grow rooms. Quality depends on each step happening at the right time,
for the right duration, at the right temperature and moisture.

On paper, steps get skipped, durations get shortened, photos get taken afterwards, and times get written in later.
MushroomOS exists so that **the record cannot be made to look better than what actually happened**.

---

## The fixed core (does not change per factory decision)

- **The SOP is versioned data, not code.** Each process version (PROCESS-2026E … **2026J**, current) holds the tasks,
  durations, readings, photo requirements, gates and the day plan. A published version is frozen; any change becomes
  a new version. A batch keeps the version it started on.
- **Admin configures; the floor executes; the GM approves.** No role can do another role's work.
- **The server decides.** Every rule is enforced in the database, not only on screen. Times are the server's clock.

---

## Roles

| Role | Does | Cannot |
|---|---|---|
| **Admin** (web) | Creates new batches (with H0) and onboards running batches; marks DEMO / TEST batches; decides late-task tickets; corrects a recorded time (with a reason, audited) | Do field or Lab work; approve Lab results |
| **Supervisor** (APK) | Starts and finishes production tasks; takes before/after photos; records readings and checklists; raises late tickets on their own tasks | Do Lab work; approve anything; change times, plans or batches |
| **Lab technician** (APK) | Takes samples, records readings and photos for Lab checks; raises late tickets on Lab checks | Do field work; approve their own results |
| **GM** (APK / web) | Approves or rejects Lab submissions (these open gated production steps); decides deviations; watches progress with every photo | Do field or Lab work; onboard or change batches; move recorded times |

---

## How a batch runs

1. **Admin creates the batch.**
   - *New batch* — choose the process version and materials, set H0. The day plan gives every task its planned time.
   - *Running batch* — say where each stream is now (not started / at a step / completed). Earlier work is recorded as
     "before tracking"; the plan counts forward from the moment of onboarding.
2. **Supervisor and Lab see "Today" and "Coming up"** per batch, from the day plan.
3. **Each task opens only when the steps before it are finished** (and, for gated steps, when the GM has approved the
   Lab check). Turner passes also wait their rests (T0 → T1 6 h, T1 → T2 8 h).
4. **Doing a task:** Start → before photo → readings → after photo → Finish.
   - The **after photo and Finish are locked until the SOP time has passed** since Start (upper number of a range).
   - **Holds** are not started by anyone; they begin when the step before finishes and are confirmed on their SOP
     condition (time, and/or temperature — e.g. ≥58 °C OR 40 h; ≥73 °C AND 63 h).
   - **Lab checks open with their field step** (after it finishes, just before it, or when it starts).
5. **Late work needs a ticket.** A task is due at its day-plan time + 30 min. After that the after photo and Finish are
   blocked until the Admin approves a late ticket (30 min / 1 h / 2 h …). Approved hours move that task and every step
   after it; planned vs extended vs actual is recorded for every task.
6. **GM approves Lab submissions** with the readings and the photos in front of them, and follows progress per batch.

**DEMO / TEST batches** follow the same order, photos, readings, Lab locks, approvals and roles, but have no clock:
no time gates, rests or late blocks. They are for testing the workflow.

---

## What "uncheatable" means here

- Order, durations, rests, temperature triggers and lateness are enforced on the server.
- Nobody types a start or finish time on a timed task; the server stamps Start and Finish.
- A photo must be a real uploaded file, bound to that task, taken in its phase; the same file cannot be reused.
- Roles are enforced on every server action; a deactivated account loses its role immediately.
- Every decision and override (tickets, onboarding, DEMO flag, time corrections, approvals) is audited with who, when
  and why.

What software cannot prove: that a photo shows the right thing, that a typed reading is true, or that people are not
sharing a login. Those are managed by review (the GM sees every photo) and by using the APK camera only.

---

## Technology

- React 18 + TypeScript + Vite + TanStack Query (web); Capacitor 6 Android APK with the native camera.
- Supabase: Postgres with row-level security and server functions, Storage bucket `evidence` for photos.
- Process rules live in tables (`process_definition`, `process_activity`, `activity_field`, `evidence_requirement`,
  `gate_rule`, `lab_checkpoint_activity`) and are applied by the gate engine (`evaluate_gates`, `time_gate_status`,
  `activity_due`).

## Open factory questions (not invented)

- The 67–68 % moisture rule at the moisture decision.
- Turner planning durations (1.5 h kept).
- Grace window and ticket policy details beyond 30 min, if the factory wants them different (Admin-configurable).
- Whether the Admin should state the real start time of a step that was already running when a batch is onboarded.
