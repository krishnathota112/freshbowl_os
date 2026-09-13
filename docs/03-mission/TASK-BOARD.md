# Task board

**11 September 2026. The backend is frozen (`DEC-025`); the work is the three UI workstations.**
Every task is self-contained: an agent should be able to act on one without reading the conversation
that produced it. The previous board, with the full specs of the finished foundation tasks, is at
`docs/_archive/superseded-2026-09-11/TASK-BOARD-2026-08-31.md`.

**Claim a task by putting your name in Owner. One task at a time. If you find something outside the
task — record it in `FINDINGS.md`, do not fix it.**

Every UI task reads `docs/05-ui/UI-SYSTEM.md`, `docs/05-ui/WORKSTATIONS.md` and
`docs/02-architecture/DATA-CONTRACTS.md` first, and carries the same definition of done:

```
the three-second test · every state designed · reads views only · computes nothing forbidden ·
the server's refusals shown verbatim · typecheck and build clean · run on an Android handset
```

---

## Step 1 — make the workflow correct

The loop has breaks. A beautiful screen on a broken loop is still broken. **Do these first.**

### UI-001 · A lab technician can finish their own work
**Workstation** Lab · **Owner** _unclaimed_ · **Finding** F31

`/operator/my-work` is guarded to `OPS`, which excludes `lab_tech`, and the lab sample sheet has
readings and retests but no evidence capture and no submit. Today only a supervisor can complete a lab
activity. **The backend already permits it** — `start_activity` and `complete_activity` accept
`lab_tech` when the activity's `responsible_role` is `lab_tech`.

**Approach.** Put the submit where the lab technician already is: the checkpoint flow (L2) ends with
the sample photograph and **Submit**, calling `complete_activity`. Do not widen the `/operator` guard —
the lab workstation is its own place.
**Acceptance** signed in as `lab_tech`: sample → readings → photo → Submit → the activity is
`COMPLETED`, the gated task is **still `LOCKED`**, and the screen says *"Waiting for approval"*.

**Status, 12 Sep — IMPLEMENTED, NOT SIGNED OFF.** Code, integration tests and build agree; the
signed-in walkthrough of the screens (browser, then device) has not been done. Sign-off waits on it.
- **Verification run 12 Sep.** Typecheck clean · production build clean (`LabQueue` 3.95 kB,
  `LabCheckpoint` 35.18 kB, each its own chunk) · focused `labWorkstation`, `labUi`, `lab`,
  `fieldShell`, `evidence`: 98 / 99 — the one failure is `evidence` criterion 17, a fixture failure
  known since 8 Sep · full suite **570 passed · 18 failed · 3 todo (591)**, every failure
  pre-existing (`FOUNDATION-STATUS.md`); none introduced by this task.
- **What changed.** The Lab workstation is two screens: `/lab/queue` (Continue · Next in planned
  order · Waiting approval · Rejected · Recently done) and a new `/lab/checkpoint/:activityId`
  (1 Sample → 2 Readings → 3 Photos → 4 Submit, then the decision and what it holds shut, in words).
  The `/operator` guard was **not** widened. The single bound checkpoint is used automatically; a
  chooser appears only when there are several or none. "Take the sample" is re-runnable: a retry
  after a dropped connection finds the existing sample and requests only the missing tests.
  The URL carries the activity, so refresh and app restart re-read the same step from the server.
- **Files.** `src/routes/LabQueue.tsx` (rewritten) · `src/routes/LabCheckpoint.tsx` (new) ·
  `src/api/lab.ts` (`loadLabWork`, `loadLabActivity`, `loadSampleTests`, `beginSample`) ·
  `src/components/field/{EvidenceStep.tsx, ErrorPanel.tsx, labWords.ts}` (new, shared with the
  Operator build) · `src/App.tsx` (route) · tests below.
- **Contract used.** Reads `v_lab_queue` (incl. `last_submission`) · `v_my_work` · `v_evidence_state` ·
  `v_lab_result_history` · `v_lab_gate` · `v_batch_forecast`. Writes `start_activity` ·
  `open_lab_sample` · `request_lab_test` · `record_lab_result` · `order_retest` · storage upload ·
  `bind_evidence` · `complete_activity`. Three base-table reads have no view yet —
  `batch_activity.process_activity_id`, `lab_checkpoint_activity`, `lab_decision` (`CT-003`).
- **Tests.** `tests/labWorkstation.test.ts` (new): the whole chain as a real lab technician, rolled
  back — a double start writes one audit row, the sample files at the bound checkpoint, submit is
  held naming the photograph, self-approval refused, an unbound checkpoint refused.
  `tests/labUi.test.ts` re-pointed at both screens (retest reasons still checked against the enum).
  `tests/fieldShell.test.ts`: lab_tech reaches exactly its two routes. 48 / 48 pass. Typecheck and
  production build clean.
- **Remaining.** Walk the screens signed in as `lab_tech` in a browser and on the handset; a
  rejection is shown with its reason, but what the technician does next is the supervisor's call
  (return the activity) — the screen says so rather than inventing a path.

### UI-002 · Evidence is taken with the camera, not chosen from a gallery
**Workstation** all · **Owner** _unclaimed_ · **Finding** F32 · **Decision** DEC-026

`<input type="file" capture="environment">` opened `com.google.android.photopicker` on the emulator,
which *has* a camera app registered. An old photo can satisfy "before you begin".

**Approach.** The Capacitor Camera plugin (`@capacitor/camera`, the version matching Capacitor 6),
`source: CAMERA`, never `PROMPT` or `PHOTOS`. The web build keeps the file input as a fallback and is
not the field device. Show the captured image back before it counts. While in the upload path, check
the first bytes are a real JPEG/PNG/WebP before uploading (F40).
**Acceptance** on a **real handset**: the button opens the camera and nothing else; the photo is
bound, shown back through a signed URL, and byte-identical in storage; a non-image never uploads.

**Status, 12 Sep — SOURCE IMPLEMENTED, NOT SIGNED OFF.** No APK containing the camera plugin has
been built, so no device has run it. Sign-off requires a real Android handset.
- **Why no APK — the exact failure.** `./gradlew assembleDebug` cannot resolve
  `com.google.android.material:material:1.10.0`, a new dependency of `@capacitor/camera@6.1.3`, from
  either `https://dl.google.com/dl/android/maven2/…` or `https://repo.maven.apache.org/maven2/…`:
  *"PKIX path building failed … unable to find valid certification path to requested target"*.
  Norton's HTTPS scanning re-signs those connections, and the JDK Gradle runs on does not trust
  Norton's root. Passing `javax.net.ssl.trustStoreType=Windows-ROOT` (as `-D`, then as
  `JAVA_TOOL_OPTIONS`) for single builds did not help; nothing was persisted and no certificate
  store was changed.
- **The local change needed — the machine owner's decision, not the build's.** Either exclude
  `dl.google.com`, `repo.maven.apache.org` and `plugins.gradle.org` from Norton's web/HTTPS scanning
  (or pause it for one build) and re-run `./gradlew assembleDebug` — once the dependency is cached,
  later builds need no network — or build on a network without interception. Importing Norton's
  root into the Gradle JDK's `cacerts` would also work, but it widens what that JDK trusts and is not
  recommended. The APK in `app/build/outputs/apk/debug/` is the 10 Sep build **without** the camera.
- **What changed.** `@capacitor/camera@6.1.3` installed and synced into `android/`; `CAMERA`
  permission declared. `src/lib/camera.ts` opens `CameraSource.Camera` only — never `Photos` or
  `Prompt` — and saves nothing to the gallery. Every photo is checked for real JPEG/PNG/WebP bytes
  and a non-zero size before upload (F40). `EvidenceStep` is the one capture component:
  **Capture photo → the picture shown back → Use this photo / Retake → upload + bind → `1 / 1`**,
  with the photo kept on screen after a failure so "Try again" needs no second picture, and
  *"Nothing was recorded"* when upload or bind fails. In a desktop browser a file is chosen, and
  the screen says so — the camera guarantee is the app's.
- **Remaining.** Build the APK and confirm on a real handset that the camera, not a picker, opens.
  `TaskDrawer` still uses the old file input until the Operator rebuild (UI-009) moves it onto
  `EvidenceStep`.

### UI-003 · Finishing work calls `complete_activity`
**Workstation** Operator · **Owner** _unclaimed_ · **Finding** F34

`TaskDrawer` finishes through `submitActivity` → `submit_activity`, the paper-slip backfill path.
`completeActivity` already exists in `src/api/work.ts:110`.
**Acceptance** no worker screen imports `submitActivity`; `outstanding_evidence` from the response is
shown as the refusal.

### UI-019 · Admin home, and the two doors · UI-020 · New batch · UI-021 · Ongoing batch
**Workstation** Admin · **Owner** _unclaimed_ · **Status, 12 Sep — BUILT, not yet walked through signed in**

The factory needs two things before anything else: start a new batch, and bring in a batch that is
**already running**. They are separate doors on the Admin home, because what MushroomOS watched from
the beginning and what it was told about afterwards must never look the same.

- **`/admin`** — New batch · Add ongoing batch · what needs a person · the real active batches, with
  each one's process, standard and H0 from `v_batch_forecast`. No percentages, no charts.
- **`/admin/batch/start`** (and `/ongoing`) — three decisions: which process (from
  `v_process_catalogue.is_selectable`), what it is called, when it started. H0 becomes a real instant
  through `factory_instant`, never in the browser. Then `create_master_batch` + `generate_activity_plan`.
- **`/admin/batch/:id/prepare`** — incoming material check, crew, the server's own `validate_batch`
  findings, then Activate with what activation means said plainly.
- **`/admin/batch/:id/onboard`** — the optional onboarding flow for a running batch (below).
- **Files** `src/routes/{AdminHome,BatchStart,PrepareBatch,OnboardBatch}.tsx` ·
  `src/components/admin/BulkAssign.tsx` · `src/api/intake.ts` · `src/App.tsx` · `src/lib/auth.ts` ·
  nav in `AppShell.tsx`, links in `Batches.tsx`, `ScheduleBuilder.tsx`, `StaircaseCalendar.tsx`.
- **Contracts used — all pre-existing, nothing added.** `create_master_batch` ·
  `generate_activity_plan` · `factory_instant` · `open_prebatch_sample` · `request_lab_test` ·
  `record_lab_result` · `accept_lab_result` · `assign_activity` · `validate_batch` · `activate_batch` ·
  `submit_activity` (stated times) · `start_activity` · `correct_actual`. Reads
  `v_batch_forecast` · `v_process_catalogue` · `v_prebatch_material_check` · `v_evidence_state` ·
  `v_lab_approval_queue` · `v_deviation_open`.
- **Tests** `tests/adminIntake.test.ts` — 8 scenarios against the real backend, rolled back.
- **The old 7-step wizard stays** at `/admin/batch/new`, reachable from the monthly schedule, which
  claims a scheduled group — a real feature the new flow does not cover.
- **Remaining** walk both flows signed in; the Ongoing flow's limits are recorded as F48.

### UI-004 · Assign a batch's crew in one action
**Workstation** Supervisor / Admin · **Owner** _unclaimed_ · **Finding** F33

Activating one batch took 93 per-row assignments. `assign_activity` is one activity per call.
**Approach.** A crew screen: choose people per stream or per role, preview the rows, confirm once; the
client calls `assign_activity` per row and reports each refusal against its row. **No new RPC** — if
the per-row calls prove too slow on a handset, that is a named defect for a `CT-` task.
**Acceptance** a fresh 2026C batch is fully assigned in under a minute, and a partial failure says
exactly which rows were not assigned.

**Status, 12 Sep — BUILT.** `src/components/admin/BulkAssign.tsx`, inside the prepare screen: one
person per responsible role, applied to every unassigned row of that role, with progress and
per-row refusals. It loops the existing `assign_activity` — there is no bulk RPC and none was added.
**This is not optional polish:** `validate_batch` blocks activation with `NO_ASSIGNEE` until every
activity has somebody, so a 2026C batch cannot be activated at all until ~93 rows are assigned
(measured 12 Sep in `tests/adminIntake.test.ts`).

### UI-005 · A supervisor can reach Approvals
**Workstation** Supervisor · **Owner** _unclaimed_

While `C-32` is open a supervisor may decide a lab submission, and `/lab/approvals` admits them, but
it is not in the supervisor's navigation. Read `approver_roles`; never hardcode "GM".
**Acceptance** from the supervisor's home, one tap reaches the waiting approvals.

### UI-006 · "Request more time" on a running task
**Workstation** Operator · **Owner** _unclaimed_

The extension chain is proved by 21 tests and reachable from no screen. One quiet secondary action on
an `IN_PROGRESS` task: hours, reason, optional photo → `request_extension`. The server refuses it
after completion; the screen does not pre-empt that.
**Acceptance** the request appears in `v_extension_request`; the planned end on the operator's screen
does not move.

---

## Step 2 — make each workstation easy

Build the shared parts once, then each workstation on them.

| ID | Task | Screens (`WORKSTATIONS.md`) | Owner |
|---|---|---|---|
| **UI-007** | **The shell and the component set** — top bar · state chip from `STATE_LABEL` · one primary button · quiet secondary · task card · step · evidence step with counter · reason panel · rest countdown · empty state · confirmation. Tokens only; light and dark. | all | _unclaimed_ |
| **UI-008** | **Operator home** — DO NOW (every running task, then the first ready), UP NEXT, collapsed Waiting and Completed | O1 · S1 | _unclaimed_ |
| **UI-009** | **Operator task flow** — the guided BEFORE → work → AFTER steps, Complete when the server says nothing is outstanding. Replaces the drawer. | O2 | _unclaimed_ |
| **UI-010** | **Lab** — queue, the one-flow checkpoint (auto-select a single bound checkpoint; the two-map chooser stays available), "Waiting for approval" after submit | L1 · L2 · L3 | _unclaimed_ |
| **UI-011** | **Supervisor floor** — what is waiting on whom, by urgency; hold / return / release with a reason | S2 · S5 | _unclaimed_ |
| **UI-012** | **Admin Today and the batch** — counts that lead to a decision; the batch as *Materials → Plan → Production → Lab → Approvals → Complete* | A1 · A2 | _unclaimed_ |
| **UI-013** | **Admin create → check → activate** — three decisive steps; the incoming-check panel in its three states; crew (UI-004); `validate_batch` in words; a confirmation that says the plan freezes | A3 · A4 · A5 | _unclaimed_ |
| **UI-014** | **Approvals and exceptions** — lab approvals, extension decisions (manager then GM, the four numbers always separate), deviations | S3 · A6 | _unclaimed_ |

**Each one re-points its own reads to views** as it is rebuilt (`ARCH-010`), so the 28 base-table
reads disappear with the screens that make them.

## Step 3 — make the three one product

### UI-015 · One grammar, audited
Walk every screen against `UI-SYSTEM.md`: one primary per screen, state words only from
`STATE_LABEL`, no codes as primary text on operator screens, reasons verbatim, `Completed · 14:32`
with server time. A mismatch is fixed in the component, not the screen.

## Step 4 — test the whole loop on a phone

### UI-016 · The handset acceptance run
The script in `WORKSTATIONS.md`, on a **real Android handset**, on a fresh batch, after each
workstation lands and once at the end — camera, app kill, and the network cut included. The 10
September emulator run is the baseline.

## Step 5 — polish

### UI-017 · Every state of every screen
Loading, empty (with words that distinguish *nothing assigned* from *all done*), locked, refused,
offline, done — in light and dark, at 360 px and at desktop width.

## Step 6 — remove

### UI-018 · Take out what exists because it was interesting
Candidates: `/admin/process-explorer` and `/admin/reference` out of the main navigation; `/dev/gallery`
out of the production build; analytics that change no decision. Each removal named in the change.

---

## Contract tasks — the backend under the freeze

A backend change needs a named defect found by using the product (`DEC-025`). **Each of these needs
the process owner's yes before it is built.**

| ID | Task | Why | Status |
|---|---|---|---|
| **CT-001** | A server field saying a *running* task is past its planned (or authorised) end | Without it a screen can say `Delayed` only by comparing with the clock — forbidden (F35) | needs a decision |
| **CT-002** | `blocked_reason` sentences written for the person reading them, the code moved to a separate field | *"LAB-BNK-PRE: 0 of 1 approved"* is not operator language, and the screen may not rewrite it (F36) | needs a decision |
| **CT-003** | A view per lab activity: its bound checkpoint(s), what each holds shut, and the latest decision with its reason | The Lab workstation reads `batch_activity`, `lab_checkpoint_activity` and `lab_decision` directly for these (UI-001) | needs a decision |
| **BE-001** | `assert_role` on `request_lab_test` (lab_tech, supervisor, manager, admin, gm — as `open_lab_sample`) | Any signed-in user can add a test to an existing sample (F37) | needs a decision |
| **BE-002** | Make `v_unguarded_writer` recognise every guard mechanism, so it reports 2, not 38 | A regression check that is always red is ignored (F38) | needs a decision |
| **BE-005** | **Apply `0077`** — `advance_batch` stops writing `gate_opened` for a gate that was already open. Then `eventTrail.test` must pass and `w2a-lab` (reject after approve still shuts the gate) must still hold. | A regression from `0072`: 30 untrue audit events per poll (F47) | **written, awaiting approval to apply — do this before any workstation ships** |
| **BE-004** | `cancel_batch` closes the batch's open extension requests, with the cancellation reason | Requests on cancelled batches stay `REQUESTED` / `MANAGER_APPROVED` and will sit in a decision queue (F46) | needs a decision |
| **BE-003** | One idempotency key on every field RPC | Only when the offline queue is designed (F39, `04-audit/IDEMPOTENCE.md`) | deferred |

## Deployment — before a real factory uses it

| ID | Task | Status |
|---|---|---|
| **DEP-001** | Supabase → Authentication → Sessions → **Access token expiry = 1800** | decided by the process owner; to be set in the dashboard (F41) |
| **DEP-002** | A production database without `dev_environment_marker` | before production (F42) |
| **DEP-003** | Real accounts; the six demo accounts and the password on the sign-in screen removed; demo batches out of the production database | before production (F43) |
| **DEP-004** | The release APK built without the debug trust anchor — `src/debug/` only, confirm in the release manifest | before the first APK leaves the office |

## Carried over, still open

| ID | Task | Status |
|---|---|---|
| **ARCH-006** | Occupancy rows for vessels nobody allocated — diagnose, then fix the `plant` test for the right reason | RED |
| **ARCH-007** | Actor on the staged demo history | AMBER — human actions are attributed; demo history not re-checked |
| **ARCH-008** | Migrations-built vs deployed schema diff, as a script that fails on drift | AMBER — not run this cycle |
| **ARCH-010** | Screens read views only | folded into UI-008 … UI-014 |
| **ARCH-002** | Split `src/api/batch.ts` along domain lines | still one file; do it as the workstations stop importing it |
| **PRD-001** | Every `process_activity` row carries a confidence class, verified | AMBER — column exists, acceptance not re-run |
| **PRD-003** | Publishing refuses an indefensible standard | not re-verified |

---

## Done

| Task | Result |
|---|---|
| F1 · F2 · F3 · F6 | baseline immutability, extension register, role resolution, fail-closed `assert_role` — `0034`–`0036` |
| ARCH-001 · actuals immutable | `trg_actual_is_append_only`; `correct_actual` supersedes with a reason |
| ARCH-003 · publish and freeze | published definitions refuse every change, admin included |
| ARCH-004 · evidence end to end | proven on the device, byte-identical in storage, shown through a signed URL |
| ARCH-005 · forecast | `v_batch_forecast` · `v_activity_forecast`; the basis is named, the extension never folded in |
| ARCH-009 · `send_alert` guard | guarded |
| ARCH-011 · demo data | partly — demo batches exist; fixture-state failures remain (`FOUNDATION-STATUS.md`) |
| PRD-002 · the envelope | superseded by the calculated standard — `v_process_catalogue.standard_hr` |
| PRD-004 · PROCESS-2026C | published and current, 470; 2026B published and untouched, 536 |
| PRD-005 · the H0 model | H0 is bagasse wetting; pre-H0 weighment at H0 − offset, advisory (`0068`) |
| PRD-006 · Turner structure | six piles, T2 gated on each pile's own T1 end + 8 h |
| PRD-007 · the payload contract | `docs/02-architecture/DATA-CONTRACTS.md` |
| PRD-RULES · PRD-QUESTIONS | ruled by the process owner — `DEC-023`, F9, F10; the four still open are in `OPEN-QUESTIONS.md` |
| Hardening, 8–11 Sep | `0061`–`0076`; 195 adversarial attacks, no open code defect — `04-audit/SECURITY-ATTACK-MATRIX.md` §G |
| The device run, 10 Sep | the whole loop on an Android emulator — create, activate, capture, lab, approval, gate |

---

## Template for a new task

```
### <ID> · <one-line goal>
**Workstation / Domain** · **Owner** · **Finding**

Why this matters, in two sentences. What breaks without it.

**Approach.** The shape of the solution, not the code.
**Acceptance**
- observable, checkable statements, on a handset where the screen is a field screen
- no fake values
```
