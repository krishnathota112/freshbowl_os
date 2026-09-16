# 06 — LAB, GM, GATES AND DECISIONS

## Purpose

Define laboratory semantics so records, decisions and hard production gates cannot be confused.

## What the application must do

The Lab process contains 25 checkpoints: 4 GATE, 1 DECISION, 20 RECORD.

GATE = hard production stop until an approved result exists.
DECISION = a reading determines a defined branch; it is not an approval.
RECORD = captured for traceability/trend and never blocks by itself.

The Lab→GM sequence is:
Lab records readings/evidence → Lab submits → GM reviews → GM approves/rejects → mapped production gate opens/remains closed.

Lab cannot approve its own result. A recorded result is not an approved result.

Current named gates are:
LAB-BNK-PRE, LAB-CM-USE, LAB-BNK-LOAD, LAB-TUN-LOAD.
The exact production activity affected must come from the active process/version.

The moisture decision must preserve the unresolved 67–68% band; do not invent a midpoint.

The chicken-manure rule is configurable: the second test is required when the arrival/use gap is at or above the configured window; under the configured threshold it is recorded as not required, with reason.

## Acceptance / proof

DEMO/TEST proves:
Lab result recorded → gate remains closed;
Lab submitted → still closed;
GM rejection → remains closed;
GM approval → only the mapped production activity becomes eligible;
unrelated gates remain closed.
All Lab/GM state is auditable and visible to authorized roles.

## Detailed source context

The following sections from the consolidated Geetha source are included below. They are implementation context, not permission to invent a different product.


# 18. LABORATORY — 25 CHECKPOINTS, 4 GATES, 1 DECISION, 20 RECORDS


The Laboratory specification is explicit:

```text
25 total checkpoints
4 GATE
1 DECISION
20 RECORD
```

## GATE semantics

A GATE is a hard stop.

The production activity remains unavailable until an **approved** Lab result exists.

Recorded/entered is not enough.

The four current gates are:

1. `LAB-BNK-PRE` — before first bunker loading
2. `LAB-CM-USE` — chicken manure before use in mixing
3. `LAB-BNK-LOAD` — bunker loading
4. `LAB-TUN-LOAD` — tunnel loading

The exact production activities attached to these gates must come from the active process/version.

## DECISION semantics

The moisture decision is a branch, not an approval gate.

Current documented behavior:

- ≥68% → proceed
- <67% → controlled mist + new measurement
- 67–68% → unresolved; record and refer

Do not invent a midpoint such as 67.5%.

Every re-measure is a new record; the original is retained.

## RECORD semantics

A RECORD is captured for the batch file and trend.

It does **not** block production by itself.

Example:

`LAB-RM-01` raw-material/bagasse weighment is a RECORD and is explicitly advisory/pre-H0; it does
not gate H0.

If a factory decision later requires it to become a gate, that is a process-version change and must
not be invented silently.

## Lab submission and GM approval

The operational chain is:

```text
Lab checkpoint
→ sample/readings/evidence
→ Lab submits
→ result is recorded/submitted
→ GM reviews
→ GM approves or rejects
→ mapped production gate opens/stays closed
```

Lab cannot approve its own result.

An Admin cannot substitute for GM approval merely by hiding the gate in the UI.

## Lab data integrity

Where configured by the active Lab/process specification, capture:

- parameter
- value
- unit
- actor
- timestamp
- evidence
- result status
- approval status
- GM remark/decision reason
- superseded/retest chain

Do not overwrite the original reading.

---


# 19. CHICKEN MANURE SPECIAL RULE


The Lab specification says chicken manure is tested:

- on arrival — RECORD
- before use — GATE when required

There is a configurable window: where arrival is less than 12 hours before use, the second test is
currently described as skippable and the arrival result stands.

Important:

- the window is configurable data
- if skipped, the batch should record that it was skipped and why
- this must not look like an accidental missing checkpoint
- exact measurement reference point for “12 hours” remains an unresolved Lab question unless the
  active source/runtime resolves it

Do not hard-code the 12-hour rule into React.

---


# 28. GM EXPERIENCE


GM needs a simple oversight/approval flow:

```text
Pending Lab result
        ↓
Review readings/evidence
        ↓
Remark
        ↓
Approve / Reject
        ↓
Gate changes if applicable
```

Approval must record:

- GM actor
- server timestamp
- decision
- reason/remark where required
- affected Lab result/checkpoint
- affected production activity/gate

Reject must keep the gate closed.

Approval opens only the mapped production gate(s).

A generic “Lab approved” flag that unlocks unrelated work is incorrect.

---

