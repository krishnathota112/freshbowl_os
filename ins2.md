# MUSHROOMOS — CONTROLLED BUILD EXECUTION CONTRACT

The factory process is now frozen enough to begin implementation.

The attached/process master input is the authoritative source.

DO NOT IMPLEMENT EVERYTHING AT ONCE.

Execute the following phases strictly in order.

==================================================
PHASE 0 — FREEZE PROCESS MATRIX
==================================================

Create:

docs/PROCESS_2026B_AUTHORITATIVE_MATRIX.md

Translate the authoritative process into a row-by-row matrix.

Every timing/dependency must be classified:

- FACTORY CONFIRMED
- FACTORY RANGE
- RECOMMENDED / ADVISORY
- PARALLEL / NO SEPARATE TIME
- CONFIGURABLE
- UNRESOLVED

Do not invent missing values.

STOP after Phase 0 and report.

==================================================
PHASE 1 — CORRECT PROCESS DEFINITION
==================================================

Fix the underlying PROCESS-2026B definition and seeds.

Critical requirements:

- Day 0 weighment is outside the H0 production rail.
- H0 starts Bagasse Wetting.
- Bagasse Wetting contains Hopper 1 → Lab → conditional Hopper 2
  → Bunker Loading.
- Pre-bunker check is a checkpoint, not an invented duration block.
- Day 2 and Day 3 are 24h process rest.
- Paddy work is a parallel workstream.
- Chicken manure monitoring is parallel.
- Day 7 mixing/yard process is represented correctly.
- Three piles only:
  Pile 1
  Pile 2
  Pile 3
- No Line 01 / Line 02 / Line 03.
- Pile chain:
  T0 → Rest → T1 → Rest → T2 → Bunker
- No global T2 barrier.
- Each pile can enter its bunker independently.
- Tunnel selection is not required at H0.
- Tunnel planning deadline ≈ H240.
- Each individual batch gets one tunnel.
- Day 15 tunnel loading.
- Day 16–21 tunnel process/hold.
- Day 22 tunnel unloading.
- H552 is the process target end.

Do not touch UI.

Run tests.

STOP and report exact migration/data changes.

==================================================
PHASE 2 — CORRECT PLAN GENERATION
==================================================

Inspect generate_activity_plan() and every related dependency/
replanning function.

The generator must use:

process definition
+ duration
+ dependency
+ scope instance
+ conditional branch

to generate batch_activity.

Do not use rel_day × 24 as a universal scheduling rule.

Verify:

- FIB1-WEIGH is not a production H0 activity.
- H0 activity = Bagasse Wetting.
- Day-1 activities have real hour spans.
- Conditional Hopper 2 path exists.
- Pile 1/2/3 are independent instances.
- no Line 01/02/03
- individual batch numbers are preserved.

Create tests proving these invariants.

STOP and report.

==================================================
PHASE 3 — FRESH DEV BATCH
==================================================

Only now create one fresh development batch:

Primary Fibre = Punjab
Structural Straw = Local Paddy

Individual batches:
366
367
368

H0:
26 Aug 2026 18:00

Generate a fresh plan.

Inspect the DATABASE directly before reviewing UI.

Provide:

master_batch
batch_activity
individual_batch
batch_movement

with hours and dependencies.

STOP if the generated data is wrong.

==================================================
PHASE 4 — EXECUTION / LAB / EVIDENCE
==================================================

Use the fresh batch.

Operator:
- assigned task
- start
- actual timestamp
- completion
- evidence

Lab:
- assigned checkpoint
- target
- result
- evidence
- submission

Verify stored evidence can be retrieved.

Verify GM approval workflow.

Verify technician can move to another batch without waiting.

==================================================
PHASE 5 — ROLE WORKFLOWS
==================================================

Implement/refine:

Operator My Work
Lab Queue
Supervisor Control Room
Manager/GM Control Tower
Chairman visibility

All must read the same batch data.

==================================================
PHASE 6 — UI / UX
==================================================

Only after functional acceptance.

Use the approved Stitch visual direction.

Six core screens:

1. Admin / Batch Setup
2. Batch Detail
3. Operator My Work
4. Lab Queue
5. Control Tower
6. Resources / Management

Timeline = summary.
Drawer = detail.

Do not produce 100-card invoice-style layouts.

==================================================
PHASE 7 — DEMO HARDENING
==================================================

Create one demonstrable batch state around H456.

It must show:

- operator work
- lab checkpoint
- evidence photo
- deviation
- tunnel assignments
- three-pile state
- H456 / H552
- remaining buffer
- management visibility

==================================================
REPORTING CONTRACT
==================================================

After every phase report:

PHASE:
STATUS: PASS / FAIL / BLOCKED

Files changed:
Database changes:
Tests:
Build:
Raw data proof:
UI proof:
Remaining issues:

Then STOP.

Never proceed automatically to the next phase.