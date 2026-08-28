Yes. **Now we fix it properly, from the generated process plan upward.** No more cosmetic patches.

The critical mistake was treating the UI as the source of truth. It isn't. The order now is:

```text
FACTORY PROCESS
      ↓
PROCESS DEFINITION
      ↓
PLAN GENERATION
      ↓
ACTUAL BATCH PLAN
      ↓
ROLE ASSIGNMENTS
      ↓
UI
```

So give Antigravity this as the **hard reset implementation instruction**.

```md
# MUSHROOMOS — AUTHORITATIVE FACTORY PROCESS RESET
## STOP UI PATCHING — FIX THE GENERATED PLAN FIRST

This is the definitive implementation instruction for the current
MushroomOS process correction.

The current application is still displaying the old generated process
shape:

- Bagasse Weighment appears inside H0→H552
- Day-1 activities are clustered at H24
- "Line 01 / Line 02 / Line 03" appears instead of Pile 1/2/3
- generic "Batch Sub-batch 1" appears instead of individual batch IDs
- tunnel allocation is still visually tied to initial batch setup

These are NOT primarily UI problems.

They indicate that the generated batch plan is still based on an
older process representation.

DO NOT PATCH THE UI AROUND THIS.

Fix the source/process-generation path first.

============================================================
PART 1 — SOURCE OF TRUTH
============================================================

The authoritative process is:

PRE-H0 preparation
→ H0
→ continuous H0→H552 production

PRE-H0 is a separate temporal zone.

H0→H552 is the production clock.

Calendar Day 0 / Day 1 / Day 2... are navigation labels only.

All production timing must be based on:

H0 + elapsed batch hours

NOT:
rel_day × 24
NOT:
calendar midnight
NOT:
day section position

============================================================
PART 2 — PRE-H0
============================================================

PRE-H0 contains:

1. Incoming/material laboratory check
2. Material assessment / preparation decision
3. Bagasse weighment
4. Weighment evidence
5. Startup readiness

Bagasse weighment is NOT a production activity inside H0→H552.

Factory guidance:
weighment target is approximately H0 - 10h.

This must be configurable data.

Do NOT hard-code 10h into the time engine.

The system should represent:

PRE-H0
  Material Lab
  Weighment

then:

H0

then:

H0→H552 production.

============================================================
PART 3 — H0 EXAMPLE
============================================================

If:

H0 = 26 Aug 2026 18:00

then:

H0    = 26 Aug 18:00
H24   = 27 Aug 18:00
H48   = 28 Aug 18:00
H72   = 29 Aug 18:00
...
H240  = Day 10 boundary relative to H0
...
H456  = Day 19 relative to H0
...
H552  = H0 + 552h

The exact calendar timestamps must be calculated from H0.

============================================================
PART 4 — ACTIVITIES HAVE REAL SPANS
============================================================

An activity can begin and finish inside one 24-hour interval.

Example:

H126 → H133 · 7h

An activity can cross a human-day boundary.

Example:

H142 → H149 · 7h

That remains one continuous activity.

Do not split activities because the calendar day changed.

============================================================
PART 5 — THREE PILES
============================================================

At the pile/turner section there are exactly:

Pile 1
Pile 2
Pile 3

These are NOT:

Line 01
Line 02
Line 03

Remove that old concept from generated plan/user-facing representation.

Each pile is an independent stream.

============================================================
PART 6 — EXACT PILE CHAIN
============================================================

Each pile follows:

T0
↓
REST 1
↓
T1
↓
REST 2
↓
T2
↓
BUNKER LOADING

Therefore:

Pile 1:
T0 → Rest 1 → T1 → Rest 2 → T2 → Bunker

Pile 2:
T0 → Rest 1 → T1 → Rest 2 → T2 → Bunker

Pile 3:
T0 → Rest 1 → T1 → Rest 2 → T2 → Bunker

These three streams operate concurrently.

============================================================
PART 7 — T0 / T1 / T2 DURATIONS
============================================================

Factory guidance:

T0 ≈ 6–7h
T1 ≈ 6–7h
T2 ≈ 6–7h

Preserve the range.

Do NOT convert 6–7h into:
6.5h
7h fixed
6h fixed

unless a source explicitly requires it.

Actual execution duration comes from:

actual_end - actual_start

using server-authoritative timestamps.

============================================================
PART 8 — RESTS ARE REAL TIME GATES
============================================================

There are TWO rests in each pile chain.

T0
↓
REST 1
↓
T1
↓
REST 2
↓
T2

The rests are time-gated.

Operators do not manually "complete" a rest.

A rest becomes eligible according to its gate.

============================================================
PART 9 — NO GLOBAL PILE BARRIER
============================================================

Pile streams are independent.

Example valid state:

Pile 1 = T2 complete
Pile 2 = T1 in progress
Pile 3 = Rest 2

Pile 1 must be able to become eligible for:

Pile 1 → Bunker Loading

without waiting for Pile 2 or Pile 3.

There must be no global:

"all piles must finish T2"

barrier.

The dependency is per pile / scope instance.

============================================================
PART 10 — BUNKER MOVEMENT
============================================================

Bunker movement is per pile.

Correct:

Pile 1 → Bunker
Pile 2 → Bunker
Pile 3 → Bunker

Do NOT render:

Line 01
Line 02
Line 03

Do NOT invent three bunker storage lanes.

Use the actual movement model already present in the system.

============================================================
PART 11 — TUNNEL PLANNING
============================================================

Tunnel destination selection is a LATER planning decision.

It is not a mandatory H0 configuration step.

Planning deadline:

H240 / Day 10 or earlier.

The system should show:

Tunnel Planning
Decision due H240

366 → Pending
367 → Pending
368 → Pending

Once selected:

366 → Tunnel X
367 → Tunnel Y
368 → Tunnel Z

Use the actual tunnel records in the development database.

Do not invent tunnel numbers.

H240 is the DECISION DEADLINE.

It is NOT the physical tunnel loading start.

============================================================
PART 12 — TUNNEL WINDOW
============================================================

Tunnel availability must be evaluated against the ACTUAL planned
movement window generated for the batch.

Do not simply mark a tunnel occupied because it exists in the UI.

Do not assume:
H360→H528
for every batch.

Use the batch's actual generated planned movement window.

============================================================
PART 13 — MASTER BATCH / INDIVIDUAL BATCHES
============================================================

Master Batch may contain:

366
367
368

Individual batch identity must be persisted.

Normal user-facing UI must show:

366
367
368

not:

IB-1
IB-2
IB-3
Batch Sub-batch 1

unless there is no real identity yet.

============================================================
PART 14 — ADMIN
============================================================

Admin configures:

1. Monthly Schedule
2. Master Batch
3. Materials
4. Quantity
5. Individual Batches
6. Physical movements/resources where appropriate
7. H0 date/time/timezone
8. Review
9. Activate

Admin does NOT manually set the clock time for every process task.

The system generates the production plan.

Tunnel allocation should NOT be mandatory at initial H0 creation
unless a confirmed factory rule requires early reservation.

============================================================
PART 15 — OPERATOR
============================================================

Operator work must be scoped to ONE active batch context.

Task selection priority:

1. IN_PROGRESS task in current H window
2. READY task due now
3. OVERDUE unfinished task
4. Next eligible task
5. Waiting/time-gated task

Pre-H0 weighment appears only when:

- the batch is still in PRE-H0, or
- the task is explicitly overdue

An H0/H24/etc. production task must never be mixed with unrelated batches.

============================================================
PART 16 — LAB
============================================================

Lab must distinguish:

PRE-H0 MATERIAL CHECKS

from:

IN-PROCESS CHECKPOINTS

Target is read-only.

Result is entered.

Evidence is attached to the actual result.

============================================================
PART 17 — TIME REGISTERS
============================================================

STANDARD
= process-defined position

ADMIN PLAN
= authorized operational adjustment

ACTUAL
= server-recorded execution

FORECAST
= system-derived projection

Admin Plan adjustment requires:

- new planned time
- operational reason
- audit trail

Never modify Standard because a planner changed the plan.

Never modify Actual to "make the schedule fit."

============================================================
PART 18 — FIRST ACTION: FORENSIC AUDIT
============================================================

DO NOT WRITE CODE YET.

Inspect the current DEV batch that is producing:

H0→H11 Bagasse Weighment
H24→H25 multiple Day-1 activities
Line 01 / Line 02 / Line 03
Batch Sub-batch 1

Return a forensic report.

For the exact displayed batch, report:

A. master_batch.id
B. master_batch.code
C. start_at
D. process_definition/version
E. all FIB1-WEIGH rows
F. process_activity for FIB1-WEIGH
G. generate_activity_plan() source
H. Day-1 process_activity rows
I. generated baseline_start/end hours
J. dependency data
K. source of Line 01/02/03
L. source of Batch Sub-batch 1
M. whether the batch is stale
N. what exact code/RPC generates the wrong shape

Do NOT patch the UI before this report.

============================================================
PART 19 — THEN FIX THE GENERATOR
============================================================

After the audit:

1. Fix process definition
2. Fix cardinality / pile instance generation
3. Fix dependency generation
4. Fix PRE-H0 classification
5. Fix H-hour generation
6. Fix individual batch identity generation
7. Fix tunnel planning representation

Do not hide wrong rows in ScheduleBuilder.

The generated batch_activity data must itself become correct.

============================================================
PART 20 — CREATE A FRESH DEMO BATCH
============================================================

ONLY after generator correction:

Create a new DEV batch:

Primary Fibre = Punjab
Structural Straw = Local Paddy
Individual Batches = 366 / 367 / 368
H0 = 26 Aug 2026 18:00

Generate the plan from the CURRENT process definition.

Do not reuse the stale batch for validation.

============================================================
PART 21 — FRESH BATCH ACCEPTANCE TEST
============================================================

A. PRE-H0
Material Lab
Bagasse Weighment
Evidence

B. H0
Correct explicit start

C. H0→H552
Continuous production clock

D. PILES
Exactly 3:
Pile 1
Pile 2
Pile 3

E. CHAIN
T0 → Rest 1 → T1 → Rest 2 → T2 → Bunker

F. CONCURRENCY
Pile 1 can reach Bunker while Pile 2/3 are still earlier.

G. TUNNEL
Planning deadline H240
Actual individual batch IDs
Actual tunnel inventory
Actual movement windows

H. OPERATOR
Correct batch
Correct current H
Correct task
Server timestamps
Evidence

I. LAB
Correct batch
Correct checkpoint
Target/result
Evidence

J. MANAGEMENT
Same batch
Same H-hour
Physical state
Exceptions
Evidence drill-down

============================================================
PART 22 — UI ONLY AFTER GENERATED DATA IS CORRECT
============================================================

Once the fresh batch passes the data acceptance test, THEN update:

Batch Detail
Control Tower
My Work
Lab Queue
Schedule Builder

The UI should visualize the corrected data.

It must NOT compensate for incorrect data generation.

============================================================
PART 23 — REQUIRED REPORTING
============================================================

Every phase must report:

PASS / FAIL

with actual proof.

Do not say:

"Implemented and verified"

unless the runtime acceptance test demonstrates it.

For the fresh demo batch report:

Master Batch ID
H0
Current H
Individual Batch IDs
Pile 1 state
Pile 2 state
Pile 3 state
Tunnel IDs
Operator
Lab Technician
Completed activities
Evidence records
Deviation/decision
```

### And one final thing: don't let Antigravity make the UI beautiful yet

Until the **fresh batch** produces the correct data shape, the only thing we care about is:

```text
CORRECT PROCESS
        ↓
CORRECT GENERATED PLAN
        ↓
CORRECT ROLE ASSIGNMENTS
        ↓
CORRECT EVIDENCE
```

Then the UI becomes a rendering problem.

Right now, the screenshots are telling us the generated plan is still carrying legacy assumptions. **That is the root we need to kill first.**
