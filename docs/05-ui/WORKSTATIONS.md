# Workstations

**The three places MushroomOS is used, and every screen in them.** The backend is frozen
(`DEC-025`); these screens are built against it. How they look and speak: `UI-SYSTEM.md`. What they
read and write: `docs/02-architecture/DATA-CONTRACTS.md`. Tasks, in order:
`docs/03-mission/TASK-BOARD.md`.

---

## The product, in one loop

```
                    MUSHROOMOS
                         │
          ┌──────────────┼──────────────┐
        ADMIN       SUPERVISOR          LAB
                    / OPERATOR
          │              │              │
      Create batch     My Work         Queue
     Material check     Task          Checkpoint
       Activate         Start           Sample
    (plan freezes)      Camera         Readings
       Monitor          Work           Evidence
      Approvals         Camera          Submit
      Exceptions       Complete     Waiting for approval
          │              │              │
          └──────────────┼──────────────┘
                     NEXT GATE
                     NEXT TASK
                    COMPLETION
```

**That is the product.** Not fifty screens, not an ERP, not an analytics platform — a clear
operational loop. Anything that does not serve a step in it is a candidate for removal (`UI-018`).

---

## Build order

```
1  Make the workflow correct       the loop has three breaks today — close them first
2  Make each workstation easy       the three-second test, screen by screen
3  Make the three one product       one shell, one grammar, one set of states
4  Test the whole loop on a phone   a real Android handset, not the emulator
5  Polish                           spacing, type, empty, loading, error, offline
6  Remove                           anything that exists because it was technically interesting
```

**Step 1 comes first because three breaks in the loop were found on the handset**, and a beautiful
screen on a broken loop is still a broken loop:

| Break | What happens today | Task |
|---|---|---|
| **A lab technician cannot finish their own work** | `/operator/my-work` is guarded to `OPS`, which excludes `lab_tech`, and the lab sample sheet has readings and retests but no evidence capture and no submit. A lab submission can only be completed by a supervisor. | `UI-001` |
| **The camera button opens a gallery** | `capture="environment"` is ignored on current Android; the system Photo Picker opens, and an old photo can satisfy "before you begin". | `UI-002` |
| **Activating a batch takes 93 separate assignments** | Assignment is a per-row menu. The crew for one batch is ninety-three taps on a phone. | `UI-004` |

---

## Who lands where

| Role | Workstation | Home |
|---|---|---|
| `operator` | Operator | My Work |
| `supervisor` | Supervisor — Operator plus the floor around it | My Work, with the floor one tap away |
| `lab_tech` | Lab | Lab queue |
| `admin` | Admin | Today |
| `manager` · `gm` | Admin — monitoring and decisions | Today |

`ROLE_HOME` in `src/App.tsx` holds this. A role is taken from the session and the server; a screen
never trusts a role it was not told.

---

## 1 · Operator — "Tell me what I need to do."

The simplest workstation, on purpose. **No dashboard, no process chart, no codes as primary text.**

### O1 · My Work — home

```
DO NOW
Turner T1 — Pile 4
Machine M2 · Ready
[ Start ]

UP NEXT
Bunker loading — Bunker 1
Locked · Waiting for lab approval before this work can begin.

WAITING   ▸ 12        COMPLETED   ▸ 4
```

- **DO NOW** is everything the person is running, then the first thing ready. *Everything running* —
  a worker on three overlapping batches, or three tunnel lines of one batch, has several at once, and
  the handset run found the screen showing only the first (fixed in `MyWork.tsx`).
- **UP NEXT** is one card. **Waiting** and **Completed** stay collapsed.
- A **Resting** item is a quiet strip with a countdown — it is not a task and has no button.
- Every card names its batch in words; when work spans batches, the top says so once.

**Reads** `v_my_work` · **Writes** `start_activity`
**Exists today** `/operator/my-work` (`MyWork.tsx`) — keep the logic, rebuild the surface.

### O2 · Task — the guided flow

The task screen walks the person through the work. They never have to understand the software.

```
Turner T1 — Pile 4                                     In progress
Machine M2 · Pile P4

STEP 1   BEFORE PHOTO
Take a photo of the pile before turning.
[ Capture photo ]                                      0 / 2 photos

STEP 2   Do the work

STEP 3   AFTER PHOTO
Take a photo after turning.

[ Complete ]      ← appears when the server says nothing is outstanding
```

- **One step is active at a time.** Finished steps show the photo taken; later ones are dimmed.
- **Start stamps the time on the server.** There is no time field anywhere on this screen, and there
  never will be (`DATA-CONTRACTS.md` §0.3).
- **Complete calls `complete_activity`**, not `submit_activity` (`UI-003`). The drawer calls
  `submit_activity` today; it works, because the server now refuses stated times from an operator,
  but it is the backfill path and does not belong on a worker screen.
- **Locked** shows `blocked_reason` and nothing to press. **Refused** shows the server's sentence
  beside the action.
- **Request more time** is one quiet action on a running task (`UI-006`).

**Reads** `v_my_work` · `v_evidence_state` · **Writes** `start_activity` · storage upload ·
`bind_evidence` · `complete_activity` · `request_extension`
**Exists today** `TaskDrawer.tsx`, a drawer — becomes a full screen with the step flow.

---

## 2 · Supervisor — "Tell me what needs me."

The Operator workstation, plus the floor around it. A supervisor also performs work, so My Work stays
home.

| Screen | For | Reads · Writes | Today |
|---|---|---|---|
| **S1 · My Work** | their own work, as O1 | as O1 | `/operator/my-work` |
| **S2 · The floor** | what is waiting on whom, ordered by urgency, not by batch | `v_my_work` (all rows for this role) · `v_deviation_open` | `/supervisor/control-room` |
| **S3 · Approvals** | lab submissions waiting for a decision; approve or reject, with a reason | `v_lab_approval_queue` · `decide_lab_submission` | `/lab/approvals` — **not in the supervisor's navigation today** (`UI-005`) |
| **S4 · Crew** | assign a batch's work in one action, adjust individuals after | `assign_activity` | per-row only (`UI-004`) |
| **S5 · Hold / return / release** | stop, send back or resume one task, with a reason | `hold_activity` · `return_activity` · `release_activity` | partial |

While `C-32` is open a supervisor **or** a GM may decide a lab submission; `approver_roles` says who
may, and the screen reads it rather than assuming.

---

## 3 · Lab — "Take the sample, record the result, submit it."

Precision is the job. After submitting, the technician is done with that sample — **the approval
belongs to someone else**, and the lab screen says so rather than waiting.

### L1 · Queue — home

```
WAITING FOR LAB
Bunker loading — Pre-load moisture
Batch MB-2026-0910 · Bunker 1
[ Open ]
```

**Reads** `v_lab_queue` · **Exists today** `/lab/queue` (`LabQueue.tsx`).

### L2 · Checkpoint — one flow, start to submit

```
Sample   →   Readings   →   Pass / retest   →   Evidence   →   Submit
```

- **Sample.** When the activity has exactly one bound checkpoint in a map, it is chosen for the
  technician. The two-map chooser (`C-33`, `TBD-36`) remains available but is not the default path.
  The server refuses a checkpoint that does not belong to the activity (`0072`, `0076`).
- **Readings.** One row per parameter, with its unit and — where one is mapped — its band. A reading
  outside the band is still recorded; the server raises the deviation.
- **Retest** asks *why* from the server's list and keeps the superseded value visible:
  `ph = 7.8 · v2`, `SUPERSEDED: ph = 69.5 · v1`.
- **Evidence** is the sample photograph, as in O2.
- **Submit** completes the lab activity. **This step does not exist in the lab workstation today**
  (`UI-001`); it is the break in the loop.

**Reads** `v_lab_queue` · `v_lab_result_current` · `v_evidence_state` · **Writes**
`open_lab_sample` · `request_lab_test` · `record_lab_result` · `order_retest` · `bind_evidence` ·
`complete_activity`

### L3 · After submitting

```
Before first bunker loading — MB-20260910
Waiting for approval
Readings 3 · Samples 1
```

A lab technician **can never decide a lab submission, including their own.** The server refuses it
with a sentence that names `C-32`.

---

## 4 · Admin — "Control the factory."

Admin creates, assigns, monitors and resolves. **Admin does not complete factory tasks.** This is the
one workstation that carries real density.

### A1 · Today — home

```
Active batches        8
Waiting approvals     1      Bunker loading — MB-20260910
Delayed work          —      (shown only from a server field — CT-001)
Lab gates             4 holding production shut
Exceptions            2 deviations awaiting a verdict
```

**Reads** `v_batch_forecast` · `v_lab_approval_queue` · `v_deviation_open` · `validate_batch`
**Exists today** `/admin/today` (`AdminToday.tsx`).

### A2 · The batch

```
MB-2026-0910
PROCESS-2026C · H470 · Running

Materials → Plan → Production → Lab → Approvals → Complete
```

- The header reads the **standard of the version this batch was generated from** — never a constant,
  never the day grid. The handset run found this header showing `H0 → H480`; fixed to read
  `v_process_catalogue.standard_hr` for the batch's own version.
- Each stage is one screen, and the current stage opens by default.

**Exists today** `/batch/:id` (`BatchPage.tsx`) and `/admin/batch/:id/schedule` (`ScheduleBuilder.tsx`).

### A3 · New batch

Create → process and H0 → review. The wizard is seven steps today (`NewBatch.tsx`); the three that
decide anything are *which process*, *when is H0*, and *confirm*. The rest have sensible defaults and
belong on the batch screen afterwards.

Reads `v_process_catalogue` (filter `is_selectable`) and shows **PROCESS · STANDARD · H0 · BASELINE**
from the selected row.

### A4 · Materials — the incoming check

The check before H0 decides whether the batch may start at all. **Accepting a result is a laboratory
act** — a lab technician or supervisor; an admin is refused and told so. The panel has three states:
no check · recorded but not accepted (*"Accept the outstanding readings"*, added after the handset run
stranded a batch) · accepted.

### A5 · Crew and activate

Assign the crew in one action (`UI-004`), run `validate_batch`, show every blocking finding in words,
then **Activate**. The confirmation says what it does: *"Activating freezes the plan. It cannot be
undone."*

### A6 · Approvals and exceptions

Lab approvals (supervisor / GM), extensions (manager then GM, strict order), deviations. The four
extension numbers are always shown separately: **planned end · approved extension · authorised end ·
actual end.** An approval never hides the original variance.

---

## Definition of done, for every screen

1. **The three-second test**, by someone who has not seen it.
2. **Every state designed** — loading, empty, locked, refused, offline, done (`UI-SYSTEM.md`).
3. **Reads views only, and computes nothing it is forbidden to** (`UI-SYSTEM.md`, last section;
   `DATA-CONTRACTS.md` §11 lists the base-table reads each rebuild removes).
4. **Run on a real Android phone**, through the loop, with the camera and with the network cut.
5. **The server's refusals shown verbatim.** A disabled button is never the only protection.

---

## The handset acceptance run — the loop, end to end

One phone, one fresh batch. Repeated after every workstation lands (`UI-016`).

```
ADMIN       create → PROCESS-2026C → H0 → incoming check → crew → activate
OPERATOR    My Work → task → Start → BEFORE (camera) → work → AFTER (camera) → Complete
LAB         queue → checkpoint → sample → readings → photo → Submit
            → the gated task is still LOCKED
APPROVER    approve, with a reason → the gated task becomes READY
CHECK       actual_start / actual_end are server time · 2 / 2 photos are real objects ·
            the activity is COMPLETED · the gate moved only on approval
UGLY CASES  kill the app after one photo → it recovers from the server
            cut the network mid-upload → "nothing was recorded", no false tick
```

The 10 September emulator run passed every line except the camera and the lab submit, which are
`UI-002` and `UI-001`.

---

## What exists today and what happens to it

| Route | Screen | Becomes |
|---|---|---|
| `/operator/my-work` | `MyWork` · `TaskDrawer` | O1 · O2 · S1 |
| `/supervisor/control-room` | `ControlRoom` | S2 |
| `/lab/queue` | `LabQueue` | L1 · L2 · L3 |
| `/lab/approvals` | `LabApprovals` | S3 · A6 |
| `/admin/today` | `AdminToday` | A1 |
| `/admin/batches` · `/batch/:id` | `Batches` · `BatchPage` | A2 |
| `/admin/batch/new` | `NewBatch` | A3 |
| `/admin/batch/:id/schedule` | `ScheduleBuilder` | A4 · A5 |
| `/gm/control-tower` · `/plant` · `/manager/resources` | management views | A1 and A2, where they help a decision |
| `/admin/schedule` | `MonthlySchedule` | Admin, secondary |
| `/admin/process-explorer` · `/admin/reference` | reference | out of the main navigation |
| `/dev/gallery` | `Gallery` | development only; not in a production build |
