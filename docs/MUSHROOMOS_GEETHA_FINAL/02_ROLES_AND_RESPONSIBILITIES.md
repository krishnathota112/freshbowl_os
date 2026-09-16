# 02 — ROLES AND RESPONSIBILITIES

## Purpose

Define the human workflows and boundaries so the application does not create conflicting role experiences.

## What the application must do

Admin is the configuration, setup, monitoring and decision workstation. Supervisor/Operations is one field-production workflow: the person performs physical work, captures readings/evidence and completes eligible activities. Lab performs laboratory work and submits results. GM reviews/approves/rejects Lab results and has management oversight.

Do not create separate Operator and Supervisor human workflows. Backend capability differences can remain, but the field experience is unified.

Admin must never be required to perform ordinary physical production work, and Admin must not substitute for GM Lab approval.

## Acceptance / proof

Each role can complete only the work assigned to it by the existing authorization model, while the screens remain aligned with the single Operations workflow and the Lab→GM authority boundary.

## Detailed source context

The following sections from the consolidated Geetha source are included below. They are implementation context, not permission to invent a different product.


# 4. ROLE MODEL — HUMAN WORKFLOWS


## Admin

Admin owns:

- accounts/logins
- SOP/process configuration
- process/version selection
- new batch setup
- running-batch onboarding
- resource/vessel configuration/allocation
- people assignment
- monitoring
- tickets/exception decisions where authorized
- operational failsafes
- audit visibility

Admin does not perform normal physical production work and does not approve Lab results.

## Supervisor / Operations

Supervisor is the field production executor.

This is the same physical employee/workflow that earlier material may call Operator.

Supervisor/Operations can:

- open eligible work
- start work
- capture required measurements/readings
- complete checklists
- capture native-camera evidence
- record machine/pile/resource where required
- finish work
- see why something is waiting or blocked

Supervisor cannot:

- freely edit official timestamps
- bypass a server gate
- approve their own Lab result
- turn a passive rest into manually completed work
- fabricate before-tracking history

## Laboratory

Lab:

- samples
- measures
- records readings
- captures evidence
- submits results

Lab does not approve its own result.

## GM / Management

GM:

- reviews Lab results
- approves/rejects Lab results where approval applies
- gives decision remarks
- oversees progress
- reviews authorized exceptions/overrides/extensions where supported

GM remarks must be visible to Admin and the relevant Lab user. Where factory procedure requires the
Lab to communicate a remark to the Supervisor, that communication is operational procedure, not a
new hidden backend state.

---

