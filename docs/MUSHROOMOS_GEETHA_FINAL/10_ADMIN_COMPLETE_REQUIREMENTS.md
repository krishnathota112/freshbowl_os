# 10 — ADMIN: COMPLETE APPLICATION REQUIREMENTS

## Purpose

Define the full Admin workstation so the application answers operational questions instead of dumping technical task rows.

## What the application must do

Admin must be able to:
create/configure batches; onboard running batches; manage people/logins; manage SOP/process configuration; allocate/inspect resources; see batch health; understand process position; inspect plan vs actual vs forecast; see parallel streams and convergence; see blockers with human-readable reasons; see Lab/GM waits; review tickets/extensions; use authorized failsafes; and inspect audit history.

Admin Home should summarize active batches and health.

Batch Detail should show process/version, H0, baseline, variant, health, planned completion, forecast completion and total variance.

The Process Overview should show the rail:
Preparation → Conditioning → Paddy → Turner → Bunkers → Tunnel → Grow Room.

Turner should branch into P1–P6 and bunkers should visibly converge.

The Timeline must show Plan / Actual / Forecast separately. It must exist even when there are zero actual events.

The Now view prioritizes active work, newly ready work, critical blockers, Lab/GM waits, overdue work and important tickets.

The Blocked view groups blockers by dependency, time, Lab/GM, readiness, evidence, exceptions/tickets and other backend-supported causes.

The Resource screen shows exact bunkers/tunnels and readiness/occupancy/cleaning state.

Technical IDs are secondary. The UI uses human factory language.

## Acceptance / proof

Give a non-technical Admin only the Admin application and ask:
Where is this batch? What should have happened? What happened? What is late? Why? What is blocking it? Is Lab/GM holding anything? Are we on the SOP timeline? When will we finish?

They should be able to answer without opening many unrelated technical screens.

## Detailed source context

The following sections from the consolidated Geetha source are included below. They are implementation context, not permission to invent a different product.


# 24. ADMIN SOP / PROCESS EDITING CAPABILITY


The product must make future SOP changes manageable without rewriting existing production history.

The intended pattern is versioned authoring:

```text
Published Version A
       │
       ├── Active batches remain pinned to A
       │
       └── Create Draft Version B
                ↓
             Edit SOP data
                ↓
             Validate graph
                ↓
             Review / sign-off
                ↓
             Publish B
                ↓
             Future batches use B
```

Admin should be able to configure process data such as:

- activity titles
- stages
- stream membership
- baseline hours
- durations
- passive holds
- dependencies
- gate rules
- Lab checkpoint mapping
- evidence requirements
- reading definitions
- material/variant rules
- resource requirements
- machine requirements
- instructions

The editor must not directly mutate published data.

The UI must show a version clearly.

A process diff/review experience is desirable where supported by the current architecture, especially
for timing, added/removed activities, dependency changes, Lab gates, and evidence changes.

Do not rebuild the database around a new process system.

---


# 25. ADMIN — WHAT THE ADMIN EXPERIENCE IS SUPPOSED TO BE


Admin is a monitoring and decision workstation.

The Admin experience should not make 100+ activity cards the primary mental model.

## 25.1 Admin Home

Show:

- Active batches
- On Track
- At Risk
- Delayed
- Blocked
- Critical blockers
- Awaiting GM
- Overdue
- Open tickets

Each batch card should answer:

> How is this batch doing?

Show:

- batch
- process/version
- H0
- current process position
- health
- planned completion
- forecast completion
- variance
- main reason

## 25.2 Batch Detail Header

Show:

- batch identity
- process/version
- baseline state
- H0
- process variant/material variant
- health
- planned completion
- forecast completion
- total variance

## 25.3 Process Overview

Show a graph/rail:

```text
Preparation
→ Conditioning
→ Paddy
→ Turner
→ Bunkers
→ Tunnel
→ Grow Room
```

Turner visibly branches into:

```text
P1 P2 P3 P4 P5 P6
```

Bunkers visibly converge from:

```text
P1+P2 → B1
P3+P4 → B2
P5+P6 → B3
```

## 25.4 Current Position

Separate:

- Where the batch is
- What is happening now
- What can happen next
- What is waiting
- What is blocked
- What is ahead

## 25.5 Timeline

Make these three unmistakable:

```text
PLAN
ACTUAL
FORECAST
```

Example:

```text
Plan:     09:00–11:00
Actual:   09:27–12:18
Variance: +1h18m
Forecast: affected through remaining dependency graph
```

## 25.6 Now

“What matters right now?”

Prioritize:

- active work
- newly ready work
- critical blockers
- Lab/GM waits
- overdue work
- important tickets
- resource readiness issues

Every batch runs on its own H0 clock.

Show both:

```text
H-hour
+
wall-clock timestamp
```

## 25.7 Blocked

Never make raw codes the primary explanation.

Bad:

```text
Locked — LAB-BNK-LOAD: 0 of 1 approved
```

Good:

```text
Waiting for GM approval of the bunker-loading Lab result.
Bunker filling cannot proceed until approval is complete.
```

The blocker should state:

- what is missing
- why it matters
- what activity is affected

## 25.8 Resource screen

Show physical resources individually:

```text
Bunker 1 — Ready / In Use / Needs Cleaning
Bunker 2 — Ready
Bunker 3 — Needs Cleaning
Tunnel 1 — Ready
...
```

Show:

- current state
- current batch/use
- upcoming need
- cleaning/readiness work
- assignment
- exact allocation

## 25.9 Lab & GM

Show:

```text
Awaiting sample
Result recorded
Awaiting GM
Approved
Rejected / Retest
```

and always show the affected production activity.

Example:

```text
Bunker loading — B2
Lab result: Recorded
GM approval: Pending
Impact: B2 cannot proceed until approved
```

## 25.10 Ticketing

Explain:

```text
Task due
→ what happened
→ why exception exists
→ ticket
→ review/authorization
→ extension/deviation
→ forecast impact
```

Original planned time remains visible.

## 25.11 Activity Detail

Use drill-down for:

- Summary
- Time
- Why / dependencies
- Evidence
- Readings
- Lab
- Exceptions
- Audit

Primary lists remain compact.

## 25.12 State vocabulary

Prefer:

- Not started
- Ready to start
- In progress
- Waiting
- Blocked
- Not due yet
- Overdue
- Completed
- Completed late
- Awaiting Lab
- Awaiting GM
- Exception under review
- Before tracking

Technical codes are secondary detail.

---


# 32. ADMIN FAILSAFE / OPERATIONAL RECOVERY


Real factory operations sometimes continue when software fails.

Where the existing architecture supports controlled Admin recovery, use it.

Examples:

- force open
- mark done
- reopen
- correct actual
- cancel/re-onboard

Every failsafe action must:

- require a reason
- be role-restricted
- be audited
- preserve the fact that Admin intervened
- never fabricate the original operator's history

Example:

```text
Phone failed.
Supervisor physically completed task.
No digital completion captured.

Admin → mark done
Reason: "Phone failed while task was physically completed."

Audit records Admin intervention.
```

---


# 33. BATCH DELETE / TEST DATA


Production history is protected.

Test/demo data needs a controlled deletion path if the current architecture supports it.

The safe semantics are:

```text
PRODUCTION BATCH
→ do not hard-delete operational history
→ use cancel/lifecycle procedure

DEMO/TEST BATCH
→ controlled delete if explicitly allowed
→ explicit confirmation
→ audit deletion
→ preserve unrelated process/version/history data
```

Never expose a raw client-side destructive delete.

Storage-object cleanup and database-row deletion are separate concerns; do not falsely report that
storage files were removed if only database records were deleted.

---


# 37. UI DISPLAY PRINCIPLES


## Primary language

Use H-hour and plain factory language.

Example:

```text
H160 · Paddy ready
Waiting for mixture until H165
```

Not:

```text
PHASE-2A: STRUCTURAL_STRAW CONDITIONING
```

Stage/phase/SOP labels may remain as secondary reference metadata, but they must not replace the
operational H-hour view.

## READY must mean ready

Do not show:

```text
READY
Not due until 29 Sep
```

Use:

```text
NOT DUE YET
Planned from H308 · 29 Sep 06:00
```

## Blockers must be explained

Use sentence-level explanations rather than raw enum/database codes.

## Technical identifiers are secondary

Activity codes, RPC names and internal IDs can exist in drill-down, diagnostics or developer detail,
but not as the primary factory-language explanation.

---


# 38. UI SHOULD NOT CALCULATE THE OFFICIAL PROCESS


The browser should render backend answers for:

- official sequence
- task eligibility
- dependency state
- planned time
- duration
- variance
- forecast
- evidence requirement
- Lab state
- approval state
- official timestamps

The UI may format and visualize these answers.

It must not independently recreate the official process engine.

---

