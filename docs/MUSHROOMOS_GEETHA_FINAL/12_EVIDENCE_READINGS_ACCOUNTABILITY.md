# 12 — EVIDENCE, READINGS AND ACCOUNTABILITY

## Purpose

Ensure physical execution is backed by structured readings, evidence and server-side accountability.

## What the application must do

Process-defined readings and evidence must appear on the activity that needs them.

Normal execution uses server-authoritative actual timestamps. Evidence requirements come from process data. Before/after evidence rules, timing windows, duplicate-photo protection and append-only history must be enforced by the backend.

Do not treat a photo as proof of a numerical reading if the process requires a structured value.

Keep original readings/evidence. Retakes or corrections are additional history, not silent overwrites.

For Turner, capture pile, machine, operator, actual times and evidence. For Lab, capture parameter/value/unit/actor/timestamp/evidence and approval state where defined.

Do not invent photo counts when the source has not confirmed them.

## Acceptance / proof

Acceptance proves:
- required evidence is visible;
- missing required evidence blocks where defined;
- timestamps come from server-side records;
- duplicate evidence cannot be reused;
- original evidence/readings remain in history;
- measurements are structured when the process requires numbers;
- performer accountability is preserved.

## Detailed source context

The following sections from the consolidated Geetha source are included below. They are implementation context, not permission to invent a different product.


# 20. EVIDENCE — PROOF, NOT A PHOTO COUNTER


Evidence exists to preserve what happened.

Typical normal operator work may require:

```text
START
→ BEFORE PHOTO
→ physical work
→ readings/checklist
→ AFTER PHOTO
→ FINISH
```

The exact photo count must come from process data.

The Lab document explicitly says not to invent per-checkpoint photo counts where they have not been
confirmed.

## Evidence integrity

Where supported by the existing architecture:

- timestamps are server-authoritative
- zero-byte uploads are rejected
- duplicate-photo/eTag reuse is rejected
- before evidence is subject to its configured timing window
- after evidence cannot be accepted before required duration/time conditions
- evidence records are append-only
- corrections are additional history, not destructive overwrite
- originals remain traceable

A photo existing in storage is not by itself proof that the photo is authentic or depicts the claimed
work; the product can enforce provenance and anti-reuse rules, not visual truth.

## Native camera

For field work, use the existing native-camera/evidence pathway where required.

Do not introduce a second evidence subsystem merely to solve a UI problem.

---


# 21. ANTI-CHEAT / LOOPHOLE DEFENSE


The product should be tested explicitly against the ways a Supervisor could otherwise work around it.

## Risk 1 — Backdating timestamps

Attack:

> Start or finish a task now while pretending it happened hours ago.

Defense:

- server timestamps
- controlled admin correction only
- audit of corrections

## Risk 2 — Reusing an old photograph

Attack:

> Upload the same acceptable photo for multiple activities.

Defense:

- duplicate/eTag protection
- provenance
- append-only evidence history

## Risk 3 — Skipping Turner rest

Attack:

> Finish T1 and immediately start T2.

Defense:

- same-pile predecessor
- server-enforced minimum rest
- T2 start rejected until eligible

## Risk 4 — Using another pile's completion

Attack:

> Complete P1 so P2's corresponding work opens.

Defense:

- SAME_SCOPE_INSTANCE / equivalent same-pile dependency
- runtime test P1 vs P2

## Risk 5 — Claiming a different machine

Attack:

> Record M1 even though M2 physically performed the pass.

Defense:

- required machine identity
- assignment/availability validation
- audit

## Risk 6 — Using a dirty/occupied bunker

Attack:

> Select a bunker that is dirty or already assigned.

Defense:

- readiness gate
- occupancy concurrency constraint
- exact-resource allocation

## Risk 7 — Bypassing Lab approval

Attack:

> Enter Lab result and proceed without GM approval.

Defense:

- record ≠ approved
- gate enforced server-side
- Lab cannot self-approve

## Risk 8 — Extension used to erase lateness

Attack:

> Obtain an extension and make the original plan look like it was always later.

Defense:

- immutable baseline
- separate extension record
- actual variance retained
- audit of authorization

## Risk 9 — Onboarding opens old work

Attack:

> Onboard a running batch and accidentally reopen/execute work that already physically happened.

Defense:

- BEFORE TRACKING context
- current live position
- regression test across parallel pile streams

## Risk 10 — Local Paddy accidentally gets Soak 3

Attack:

> Local material is selected but generic Structural Straw activity generation still creates all 3 soaks.

Defense:

- material-conditional plan generation
- generated-plan acceptance test
- no UI-only hiding

## Risk 11 — Process version mixing

Attack:

> Use an activity from another process version because it happens to have the same title/code.

Defense:

- batch pinned to process version
- generated plan tied to batch version
- UI displays process version
- cross-version data contamination prohibited

## Risk 12 — Admin override abuse

Defense:

- reason required
- role restricted
- audit
- clearly marked as Admin intervention
- original worker history not fabricated

---


# 26. SUPERVISOR / OPERATIONS MOBILE EXPERIENCE


This is the field-work application.

The primary experience is **My Work**, not a giant management dashboard.

For each task the Supervisor should understand:

- what to do
- where/which pile/resource it applies to
- when it is due
- whether it can start now
- why it is blocked if not
- what readings are required
- what checklist is required
- what evidence is required
- what machine/resource is involved
- how to Start
- how to Finish

When an activity starts, its process-defined inputs appear.

The screen should never ask the Supervisor to fake a timestamp or manually edit the official clock.

## Dynamic activity forms

A task can define:

- number input
- decimal input
- unit
- observation
- checkbox
- checklist item
- photo requirement
- machine selection
- resource selection
- Lab linkage

The UI renders the definition.

The React code should not contain process-specific conditionals for every activity.

---


# 27. LAB MOBILE EXPERIENCE


Lab should see its own current checkpoints and batches.

For each checkpoint:

- what sample is required
- which parameters to record
- units
- evidence
- status
- whether it is a RECORD/DECISION/GATE
- whether it is submitted
- whether GM approval is pending
- whether it was rejected/needs retest

The Lab experience must make the difference between:

```text
Recorded
```

and

```text
Approved
```

obvious.

For Turner:

- six pre-T1 moisture readings
- six post-T1 moisture readings
- each tied to a pile
- no invented T0/T2/T3 Lab tests

---


# 40. AUDITABILITY / ACCOUNTABILITY


The system must preserve the facts that affect accountability:

- selected process/version
- H0
- frozen baseline
- actual timestamps
- actor
- readings
- evidence
- Lab result
- GM approval
- GM remark
- movement
- machine use
- resource allocation
- ticket reason
- extension authorization
- Admin override
- correction history
- onboarding position

Never silently overwrite these facts.

---

