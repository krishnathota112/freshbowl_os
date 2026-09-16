# 08 — TIME MODEL: PLAN, ACTUAL, VARIANCE, EXTENSION AND FORECAST

## Purpose

Define the time model so the software never rewrites history or confuses authorization with execution.

## What the application must do

H0 is the master clock.

PLAN = frozen baseline created from the selected process/version and H0.
ACTUAL = server-recorded physical execution.
VARIANCE = difference between plan and actual, with cause where known.
EXTENSION = authorized additional time; it does not rewrite the baseline and does not fabricate actual delay.
FORECAST = current expected future completion based on actual progress, dependencies, readiness, Lab state and authorized exceptions.

Show plan, actual, variance, extension and forecast separately.

Dependency projection must not apply one worst slip to every unfinished task. Only true downstream dependents move.

A task whose baseline hour has not arrived is NOT DUE YET, not READY. READY means the task is actually startable now.

## Acceptance / proof

DEMO/TEST proves:
- baseline remains unchanged after execution and extensions;
- early/on-time/late are understandable;
- approved extension changes authorized due/exposure without pretending actual delay;
- only affected dependencies shift;
- Admin can explain why forecast moved.

## Detailed source context

The following sections from the consolidated Geetha source are included below. They are implementation context, not permission to invent a different product.


# 6. H0 AND THE TIME MODEL


## 6.1 H0 is the master clock

Every new batch has an Admin-selected H0.

The standard process is expressed relative to H0.

Operationally the product should speak in H-hours first:

```text
H0
H3
H11
H14
H26
...
H174
...
H470
H472
H474
```

A wall-clock date/time can be shown as supporting context.

Example:

```text
H136.4
16 Sep 2026 · 01:24 IST
```

The primary operational language is H-hour.

## 6.2 Plan

PLAN is the frozen SOP-generated expectation after process/version + H0 + applicable batch
configuration are selected.

## 6.3 Actual

ACTUAL is what physically happened, recorded by execution actions.

Normal official execution timestamps come from the server.

## 6.4 Variance

VARIANCE is the difference between plan and actual, with an explainable cause where available.

Variance never rewrites the plan.

## 6.5 Authorized extension

EXTENSION is separately authorized additional time.

An approved extension is not automatically actual delay.

Example:

```text
PLAN:       14:00 → 16:00
EXTENSION:             +2h authorized
ACTUAL:     14:22 → 16:11
FORECAST:   derived from actual/dependencies/authorized exception
```

## 6.6 Forecast

FORECAST is where the batch is currently expected to land based on:

- actual progress
- remaining task durations
- dependency graph
- convergence
- gates/readiness
- authorized exception/extension information where applicable

Forecast is NOT a batch-wide “worst slip” added to everything.

---


# 12. ACTIVITY ELIGIBILITY AND STATE MODEL


The backend must distinguish these concepts clearly.

## NOT STARTED

The activity exists in the generated plan but has not begun and no “start now” condition is met.

## READY TO START

The task can **actually be started now**.

This requires, as applicable:

- planned time has been reached (within approved early-start policy)
- required predecessor/dependency is complete
- required passive hold has elapsed
- required Lab gate is approved
- required resource is READY/available
- required assignment/capability conditions are satisfied
- required process conditions are satisfied

## NOT DUE YET

The task may have no missing predecessor but its fixed planned time has not yet arrived.

Example:

```text
Current batch hour: H0
Task planned: H308
State shown to human: NOT DUE YET
```

Do not label this READY.

## WAITING

The task is waiting on a normal process dependency that is not a fault.

Example:

```text
Paddy ready H160
Waiting for mixture H165
```

## BLOCKED

A condition is actively preventing execution, such as:

- Lab approval missing
- resource not ready
- unresolved factory decision
- evidence requirement
- required exception/ticket condition

The UI must explain the blocker in human language.

## IN PROGRESS

Official execution has started.

## OVERDUE

The task has passed its due/start window under the process/time rules without completing as required.

## COMPLETED

Work completed correctly.

## COMPLETED LATE

Work is complete, but its actual completion is later than baseline.

The original baseline remains unchanged.

## BEFORE TRACKING

Historical physical work that occurred before MushroomOS began tracking the batch.

It is context, not fabricated MushroomOS execution history.

---


# 13. TIME GATES, DEPENDENCY GATES, RESOURCE GATES


The backend is the enforcement point.

A task may be unavailable because of:

- fixed planned time not reached
- predecessor not complete
- passive rest not elapsed
- readiness condition not met
- Lab result missing
- Lab result recorded but not GM-approved
- required evidence incomplete
- stream convergence not satisfied
- required resource occupied/not ready
- unresolved factory dependency
- approved exception/ticket condition

The frontend explains the backend answer.

It must not recreate an independent eligibility engine.

---


# 14. PASSIVE HOLDS / RESTS


A passive rest is a time window, not a human task.

Example:

```text
NEW HOPPER PASS ends H150
10-hour passive rest
H150 → H160
```

The system starts the hold based on the configured predecessor/actual timing and tracks its elapsed
window.

A Supervisor cannot click “Start rest” and “Finish rest” like a normal work activity.

The UI should show:

```text
REST IN PROGRESS
Ends at H160
Remaining: 6h 22m
```

or equivalent plain-language status.

---


# 29. TICKETS, LATE WORK AND EXTENSIONS


Use the existing ticket model.

Do not create a second ticket system.

The flow is:

```text
Task due / exception
→ reason
→ evidence where required
→ ticket
→ decision/authorization
→ granted hours or deviation
→ effective due/exception state
→ completion
→ forecast impact
→ audit
```

## Extension semantics

The original plan stays visible.

The extension is separately recorded.

The actual completion is separately recorded.

The forecast is separately calculated.

### Critical dependency extension

If A controls B:

```text
A extended
→ B may move in forecast according to actual dependency
```

### Non-critical parallel extension

If C is independent:

```text
A extended
→ C does not move merely because A moved
```

### Multiple upstream extensions

Only applicable dependent/converging work should incorporate the combined authorized/actual effects.

Never use a single “worst slip” number for the whole batch.

---


# 30. DEPENDENCY-DRIVEN FORECAST MODEL


The desired model is:

```text
IMMUTABLE BASELINE
        +
ACTUAL EXECUTION
        +
REAL DEPENDENCY GRAPH
        +
GATES / READINESS
        +
AUTHORIZED EXCEPTIONS
        ↓
DYNAMIC FORECAST
```

For every task, the backend should be able to explain:

- baseline start
- baseline finish
- actual start
- actual finish
- current state
- dependency basis
- waiting-for
- blocked reason
- projected start
- projected finish
- delay/variance basis

## Convergence

For a downstream task requiring A and B:

```text
Projected eligibility = MAX(required predecessor readiness times)
```

Then apply other gates/readiness conditions.

Do not rewrite A or B's baseline just because the downstream waits for the other.

---

