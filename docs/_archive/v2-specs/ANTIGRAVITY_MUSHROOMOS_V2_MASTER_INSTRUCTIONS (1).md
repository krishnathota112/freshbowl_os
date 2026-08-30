> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# MUSHROOMOS V2 — MASTER SPECIFICATION

## Purpose

This is the master product, process, UX, architecture, and build specification for a clean centralized MushroomOS V2.

Use it with the supplied APKs, factory documents, schedules, current source code, Supabase project, and existing implementation.

**Rule: inspect first, agree on process second, implement third.**

The existing APKs and old code are reference material unless explicitly retained. Do not let multiple historical implementations become multiple products.

---

# 1. PRODUCT IN ONE SENTENCE

MushroomOS is a factory production planning, execution, traceability, evidence, and management-control system for a continuous **H0 → H552** production journey.

The owner's core question is:

> What should be happening, what actually happened, why did it happen, who did it, and show me the proof.

---

# 2. CENTRALIZED PRODUCT

There is:

```text
                    MUSHROOMOS V2
                         |
                  ONE SHARED BACKEND
                         |
             +-----------+-----------+
             |                       |
            WEB                    MOBILE
             |                       |
        ALL SEVEN ROLES        ALL SEVEN ROLES
```

Roles:

- Admin
- Operator
- Lab Technician
- Supervisor
- Manager
- General Manager
- Chairman / Owner

**Role changes the experience. Device does not change the business truth.**

Web and mobile share:

- domain rules
- API
- Supabase
- process definitions
- H0→H552 clock
- evidence
- Lab results
- resource state
- decisions
- audit events

---

# 3. CANONICAL REPOSITORY

Create one canonical source:

```text
mushroomos-v2/
├── app/
│   ├── web/
│   └── mobile/
├── shared/
│   ├── domain/
│   ├── process/
│   ├── time/
│   ├── api/
│   ├── contracts/
│   └── components/
├── supabase/
│   ├── migrations/
│   ├── seed/
│   └── functions/
├── docs/
├── reference/
│   ├── apks/
│   ├── factory-documents/
│   ├── schedules/
│   └── legacy-source/
└── README.md
```

Only `app/`, `shared/`, and `supabase/` are production code.

The APK is a build artifact, not a second product.

Classify old artifacts as:

```text
CANONICAL
REFERENCE
LEGACY
EXPERIMENT
ARCHIVE
```

Do not blindly merge old APKs.

---

# 4. CORE BUSINESS STORY

```text
MONTHLY SCHEDULE
      ↓
ADMIN SELECTS SCHEDULED SLOT
      ↓
CREATE MASTER BATCH
      ↓
CONFIGURE BATCH
      ↓
SYSTEM GENERATES H0→H552 PLAN
      ↓
REVIEW / VALIDATE
      ↓
ACTIVATE
      ↓
OPERATOR + LAB + RESOURCES EXECUTE
      ↓
SERVER TIMESTAMPS + ACTUAL VALUES + EVIDENCE
      ↓
PLAN vs ACTUAL
      ↓
DEVIATIONS / DECISIONS
      ↓
MANAGEMENT CONTROL TOWER
      ↓
QUALITY → GROWING ROOM → YIELD
```

This is the product. Screens exist to support this story.

---

# 5. MASTER BATCH / INDIVIDUAL BATCH

A Master Batch can contain several Individual Batches.

Example:

```text
MASTER 366 / 367 / 368

366 → Tunnel 10
367 → Tunnel 8
368 → Tunnel 6
```

Management drilldown:

```text
Factory
  ↓
Master Batch
  ↓
Individual Batch
  ↓
Activity / Movement
  ↓
Evidence / Lab / Decision
```

---

# 6. 552-HOUR CLOCK

The canonical clock is:

```text
H0 ------------------------------------------------ H552
```

H0 is the moment Admin starts/activates the batch.

H0 may be any permitted time of day.

Example:

```text
H0  = 24 Aug 2026 18:00
H24 = 25 Aug 18:00
H48 = 26 Aug 18:00
...
H552 = H0 + 552 hours
```

Human labels:

```text
Day 0 = H0-H24
Day 1 = H24-H48
Day 2 = H48-H72
...
```

These labels are for navigation only. The workflow engine uses hours.

## Activities may cross boundaries

Example:

```text
T1              H192 → H200
T2              H200 → H208
Bunker Loading  H208 → H217
```

Do not truncate or restart an activity when a visual day ends.

---

# 7. TIME / TIMESTAMP INTEGRITY

Each activity has:

```text
planned_start_hour
planned_end_hour
planned_duration

actual_start_at
actual_end_at
actual_duration

variance
forecast
```

Actual duration:

```text
actual_end_at - actual_start_at
```

Actual timestamps come from the server.

Users never manually type actual start/end times.

Lifecycle:

```text
READY
 ↓
START
 ↓
SERVER START
 ↓
BEFORE EVIDENCE
 ↓
WORK
 ↓
ACTUAL VALUES
 ↓
AFTER EVIDENCE
 ↓
SUBMIT
 ↓
SERVER END
```

Reject:

- finish before start
- after evidence before before evidence
- completion without required evidence
- device-clock manipulation of time gates
- manually editable duration

---

# 8. ADMIN — MONTHLY SCHEDULE

Admin's starting point is the monthly Excel schedule.

Screen:

```text
MONTHLY PRODUCTION SCHEDULE

[ UPLOAD EXCEL ]

Month
Calendar / Grid

Scheduled Master Batch groups
Created / Not Created
Basic resource conflicts
```

Flow:

```text
UPLOAD
 ↓
PARSE
 ↓
VALIDATE
 ↓
SELECT SCHEDULED SLOT
 ↓
CREATE MASTER BATCH
```

The schedule is planning input, not execution truth.

---

# 9. ADMIN — CREATE MASTER BATCH

Admin configures:

- batch identity
- H0
- material roles/materials
- formulation
- quantity
- load capacity
- individual batches
- operators
- supervisors
- machines
- vehicles
- bunker movements
- tunnels
- Lab checkpoints
- evidence requirements
- planned durations/rests

Flow:

```text
SCHEDULE
 ↓
IDENTITY + H0
 ↓
MATERIALS / FORMULATION
 ↓
QUANTITY / LOADS
 ↓
INDIVIDUAL BATCHES
 ↓
RESOURCES
 ↓
MOVEMENTS / BUNKERS
 ↓
TUNNELS
 ↓
LAB
 ↓
EVIDENCE
 ↓
GENERATED H0-H552 PLAN
 ↓
REVIEW
 ↓
VALIDATE
 ↓
ACTIVATE
```

Admin does not manually create hundreds of tasks.

The system generates them.

---

# 10. FORMULATION / LOADS

Real batch records use percentage formulation.

Example:

```text
Bagasse New 47%
Paddy New   53%
```

Known calculation:

```text
fresh weight = dry weight / (1 - moisture)
```

Admin should see:

- material
- role
- percentage
- dry weight
- moisture
- calculated fresh weight
- quantity

Load count is generated from quantity/capacity.

Example:

```text
21 MT / 2 MT
= 10 × 2 MT + 1 × 1 MT
= 11 loads
```

---

# 11. MOVEMENT / BUNKER MODEL

Bunkers are allocated per movement, not permanently to a Master Batch.

Example:

```text
Initial Load  → Bunker 3
Reload 1      Bunker 3 → Bunker 5
Reload 2      Bunker 5 → Bunker 3
```

Movement records:

```text
source
destination
resource/vessel
batch
individual batch where relevant
operator
machine
start
finish
evidence
```

Double-booking must be prevented.

Physical flow must derive from movement records.

---

# 12. PRE-H0 MATERIAL TEST

Where required, incoming material can be tested before the batch clock:

```text
MATERIAL ARRIVES
 ↓
LAB
 ├─ Moisture
 ├─ pH
 └─ Dry Weight
 ↓
READY
 ↓
H0
```

There is a source conflict about whether this is a pre-batch prerequisite or a Day-0 activity. Do not silently invent a permanent factory policy. Keep it visible/configurable while preserving the current product contract.

---

# 13. PROCESS CONTRACT — H0→H168

## DAY 0 — H0-H24 — WEIGHMENT

```text
H0
 ↓
MASTER BATCH ACTIVE
 ↓
WEIGHMENT
 ├─ Load 1
 ├─ Load 2
 ├─ ...
 └─ Load N
      ├─ actual weight
      ├─ vehicle
      ├─ JCB/equipment
      ├─ weighment slip
      ├─ operator
      ├─ server start
      ├─ server finish
      └─ evidence
 ↓
H24
```

---

## DAY 1 — H24-H48 — BAGASSE WETTING

```text
H24
 ↓
BAGASSE WETTING
 ↓
HOPPER 1
 ├─ WATER
 ├─ START
 ├─ BEFORE
 ├─ WORK
 ├─ AFTER
 └─ FINISH
 ↓
LAB CHECK 1
 ├─ Moisture
 ├─ pH
 └─ EC
 ↓
HOPPER 2
 ├─ DRY PATH
 └─ WATER PATH
 ↓
LAB CHECK 2
 ↓
PRE-BUNKER LAB CHECK
 ├─ Moisture
 ├─ pH
 └─ EC
 ↓
BUNKER LOAD
 ├─ source
 ├─ destination
 ├─ machine
 ├─ operator
 ├─ before
 ├─ start
 ├─ after
 └─ finish
 ↓
H48
```

The current product contract treats the Day-1 Lab moments as separate checkpoints:

1. bagasse wetting
2. Hopper 1
3. Hopper 2
4. before bunker loading

Do not collapse them into one generic Lab event.

---

## DAY 2 — H48-H72 — REST

```text
H48
 ↓
REST
 ↓
SERVER TIME GATE
 ↓
H72
```

Rest is a valid process state, not missing work.

Show:

- current H-hour
- rest start
- required duration
- remaining
- next activity

Do not provide a manual "Complete Rest" button.

---

## DAY 3 — H72-H96 — REST / GATE

```text
H72
 ↓
REST / WAIT
 ↓
SERVER CLOCK
 ├─ not ready → LOCKED
 └─ ready → NEXT TASK
 ↓
H96
```

---

## DAY 4 — H96-H120 — BAGASSE + PADDY

### Bagasse

```text
BUNKER UNLOAD
 ↓
LAB
 ↓
HOPPER PASS
 ├─ DRY
 └─ WATER
 ↓
LAB
 ↓
BUNKER RELOAD
 ├─ source
 ├─ destination
 ├─ machine
 ├─ operator
 ├─ start
 ├─ finish
 └─ evidence
```

### Paddy

```text
PADDY RECEIPT
 ↓
PADDY INSPECTION
 ↓
PADDY WEIGHMENT
 ├─ Moisture
 ├─ Dry Weight
 └─ slip/evidence
 ↓
BALE CUTTING
 ├─ before
 ├─ after
 ├─ start
 └─ finish
```

The two streams can overlap.

---

## DAY 5 — H120-H144 — PADDY SOAK 1

```text
PADDY SOAK 1
 ├─ START
 ├─ BEFORE
 ├─ water check
 │   ├─ pH
 │   ├─ EC
 │   └─ TDS
 ├─ AFTER
 └─ FINISH
 ↓
PADDY BUNKER STORAGE
 ├─ bunker ID
 ├─ before
 ├─ load
 └─ after
 ↓
REST
```

Keep unresolved duration values configurable.

---

## DAY 6 — H144-H168 — PADDY SOAK 2

```text
PADDY SOAK 2
 ├─ START
 ├─ BEFORE
 ├─ pH
 ├─ EC
 ├─ TDS
 ├─ AFTER
 └─ FINISH
```

---

# 14. PROCESS CONTRACT — H168-H552

## DAY 7 — H168-H192

Parallel streams may include:

```text
PADDY
 └─ Soak 3
    pH / EC / TDS

NITROGEN / MINERALS
 ├─ weigh
 ├─ mix
 └─ evidence

FIBRE / YARD
 ├─ unload
 ├─ material addition
 ├─ pile prep
 └─ pile operations
```

This is a graph, not one serial list.

---

## DAY 8 — H192-H216 — PILES / TURNING

Pile-specific dependency:

```text
Pile 1: T1 → T2
Pile 2: T1 → T2
Pile 3: T1 → T2
```

**T2 starts immediately after that pile's T1 finishes.**

No artificial buffer.

No global T1 barrier.

Example:

```text
Pile 1  T1 ████████ → T2 ████████
Pile 2     T1 ████████ → T2 ████████
Pile 3          T1 ████████ → T2 ████████
```

---

## DAY 8→9 CROSSOVER

Example:

```text
T1              H192→H200
T2              H200→H208
Bunker Loading  H208→H217
```

Crossing H216 is normal.

---

## DAY 9 — H216-H240

Continue movement/bunker activities that remain active.

Do not reset the activity at H216.

---

## DAY 10 — H240-H264

Continue the active process definition.

Do not invent new steps.

---

## DAYS 11-14

Continue configured rest/reload/movement stages.

The clock is continuous.

---

## DAY 15 — TUNNEL LOADING

Individual Batches may be assigned to separate tunnels:

```text
366 → Tunnel 10
367 → Tunnel 8
368 → Tunnel 6
```

Tunnel activity is independently traceable.

---

## DAYS 16-21 — TUNNEL / PHASE 2

Support configured monitoring such as:

- ammonia
- fan %
- outside air
- plenum temperature
- settled height
- time to target
- holding time
- spring/squeeze
- smell
- colour
- actinomycetes
- periodic monitoring

Use source-backed configuration rather than invented thresholds.

---

## DAY 22 — TUNNEL UNLOAD / COMPOST OUT

```text
TUNNEL
 ↓
UNLOAD
 ↓
EVIDENCE
 ↓
QUALITY / LAB
 ↓
COMPOST OUTPUT
```

---

## DAY 23 / DOWNSTREAM HANDOFF

Where configured:

```text
COMPOST
 ↓
GROWING ROOM
 ↓
SPAWN
 ↓
HARVEST
 ↓
YIELD
```

Growing-room allocation can be fractional.

---

# 15. ROLE UI DESIGN

## Admin

Screens:

```text
Admin Home
Monthly Schedule
Create Master Batch
Materials/Formulation
Loads
Resources
Movements
Individual Batches/Tunnels
Lab/Evidence Configuration
Generated Plan
Review
Activate
```

The big H-hour clock is visible while reviewing the plan.

---

## Operator

Home:

```text
MY WORK

BATCH
H-HOUR

CURRENT TASK
What
Where
Machine
Planned Duration
Evidence

[ START ]

[ BEFORE PHOTO ]

ACTUAL

[ AFTER PHOTO ]

[ SUBMIT ]
```

The system should bring the next valid task automatically.

---

## Lab

Home:

```text
LAB QUEUE

Batch
H-hour
Triggered by
Sample
Parameters
Spec
Evidence

[ SUBMIT ]
```

Retests create versions.

No authoritative spec = `NO SPEC`, not invented PASS/FAIL.

---

## Supervisor

```text
CONTROL ROOM

OPEN DECISIONS
Deviation
Batch
Activity
Evidence

[ RELEASE ]
[ HOLD ]
[ RETURN ]
```

---

## Manager

```text
RESOURCES

MACHINES
PEOPLE
BUNKERS
TUNNELS
UTILIZATION
CONFLICTS
UPCOMING WORK
```

---

## GM

```text
CONTROL TOWER

LATE
BLOCKED
LAB DELAYS
RESOURCE BOTTLENECKS
PENDING DECISIONS
NEXT CRITICAL WORK
```

---

## Chairman

```text
FACTORY CONTROL TOWER

ACTIVE BATCHES
ON PLAN
AT RISK
BLOCKED
NEEDS DECISION

MB366-368 █████████████████
MB369-371   ███████████████
MB372-374     █████████████
```

Then:

```text
Master Batch
 ↓
Individual Batch
 ↓
H-hour
 ↓
Activity
 ↓
Proof
```

---

# 16. BIG H-HOUR CLOCK

Every role gets a prominent H-hour indicator.

Operator:

```text
H137 / H552
CURRENT TASK
```

Lab:

```text
H137 / H552
CURRENT CHECK
```

Supervisor:

```text
H137 / H552
3 DECISIONS
```

Manager:

```text
H137 / H552
RESOURCE STATE
```

GM:

```text
H137 / H552
2 BATCHES AT RISK
```

Chairman:

```text
H137 / H552

PLAN   ───────────────●────
ACTUAL ────────────────●──
```

The clock must feel central to the product.

---

# 17. MANAGEMENT VISUALIZATION

Primary visualizations:

1. H0-H552 rail.
2. Concurrent-batch staircase.
3. Plan vs Actual rail.
4. Physical movement graph.
5. Resource occupancy.
6. Machine utilization.
7. Tunnel status.
8. Exceptions/deviation stream.
9. Actual evidence.
10. Growing-room / yield linkage later.

Do not lead with generic KPI tiles.

Use visuals that explain the factory.

---

# 18. PHYSICAL FLOW

Movement-driven graph:

```text
RAW MATERIAL
   ↓
WEIGHMENT
   ↓
HOPPER
   ↓
BUNKER
   ↓
RELOAD
   ↓
BUNKER
   ↓
YARD
   ↓
PILE 1 / PILE 2 / PILE 3
   ↓
T1 / T2
   ↓
BUNKER
   ↓
TUNNELS
   ↓
COMPOST OUT
   ↓
GROWING ROOM
   ↓
YIELD
```

At selected H-hour, show what was physically happening at that hour.

Do not hard-code movement arrows that disagree with records.

---

# 19. SHARED PLAYHEAD

Selecting H419 must synchronize:

```text
H-HOUR RAIL
PHYSICAL FLOW
EVENTS
ACTIVITY DETAIL
PROOF
LAB
RESOURCE STATE
```

The playhead is one of the signature features of MushroomOS.

---

# 20. PROOF PANEL

Click an activity.

Show:

```text
STANDARD
PLAN
ACTUAL
EVIDENCE
LAB
RESOURCE
PEOPLE
DEVIATION
DECISION
```

At minimum:

```text
planned start/end
actual start/end
duration
variance
operator
machine
vehicle
bunker/tunnel
measurement
lab result
decision
before media
after media
upload metadata
```

Actual media must be visible.

---

# 21. DAILY MANAGEMENT REPORT

Every 24-hour batch boundary generates:

```text
Current H-hour
Planned
Actual
Variance
Evidence
Lab
People
Machines
Vehicles
Bunkers
Tunnels
Deviations
Decisions
Forecast
Risks
Remarks
```

Reports are generated from the production record.

No duplicate typing.

---

# 22. EXCEL OUTPUT

The database is the source of truth.

Exports may contain:

```text
Summary
Schedule
Master Batch
Individual Batches
Plan
Actual Timeline
Materials/Formulation
Weighments
Movements
Bunkers
Tunnels
Lab
Evidence
People
Machines
Vehicles
Deviations
Decisions
Daily Reports
Tunnel Monitoring
Growing Rooms
Harvest
Yield
```

---

# 23. DATA MODEL PRINCIPLES

Core concepts:

```text
Factory
Schedule
Master Batch
Individual Batch
Activity
Movement
Resource
Lab Sample
Lab Result
Evidence
Deviation
Decision
Event
Growing Room
Harvest/Yield
```

One fact should be recorded once and reused everywhere.

---

# 24. PROCESS / STATE MODEL

Activities may be:

```text
LOCKED
READY
IN_PROGRESS
AWAITING_LAB
AWAITING_EVIDENCE
SUBMITTED
COMPLETED
BLOCKED
ON_HOLD
RETURNED
```

Use the existing implementation where already correct.

Prefer derived state from actual facts rather than editable status flags.

---

# 25. BUILD METHODOLOGY

Every activity is implemented in this order:

```text
PROCESS
 ↓
DATA
 ↓
STATE
 ↓
OPERATOR UI
 ↓
LAB UI
 ↓
MANAGEMENT UI
 ↓
PROOF
 ↓
TEST
```

Every activity contract must answer:

1. What starts it?
2. Who owns it?
3. What enters it?
4. What does the user do?
5. What evidence is required?
6. What resources are used?
7. What data is created?
8. What makes it complete?
9. What can fail/deviate?
10. What happens next?
11. What does management see?

Do not build screens first and invent behavior afterward.

---

# 26. RECOMMENDED IMPLEMENTATION ORDER

### Phase 0
Clean canonical repository and baseline.

### Phase 1
Schedule → Master Batch → H0 → generated plan → activation.

### Phase 2
H0-H168 end-to-end:
Admin + Operator + Lab + Management.

### Phase 3
H168-H264:
parallel streams, piles, T1/T2, movement crossover.

### Phase 4
H264-H552:
reloads, tunnels, Phase 2, tunnel unload.

### Phase 5
Control Tower, shared playhead, physical flow, proof.

### Phase 6
Reports and Excel.

### Phase 7
Growing room, harvest, yield.

---

# 27. DEFINITION OF DONE

A process is not done because a screen renders.

It is done when:

```text
Admin configures
 ↓
System generates
 ↓
Operator executes
 ↓
Lab executes relevant checks
 ↓
Server records timestamps
 ↓
Evidence is captured
 ↓
Exceptions are handled
 ↓
Supervisor/GM can decide
 ↓
Manager sees resources
 ↓
Chairman can inspect proof
 ↓
Report can be generated
```

The same truth must be visible from both web and mobile.

---

# 28. FINAL DEMO STORY

The final demo should be:

```text
MONTHLY EXCEL
    ↓
ADMIN
    ↓
CREATE MASTER BATCH
    ↓
H0
    ↓
GENERATED H0-H552 PLAN
    ↓
ACTIVATE
    ↓
OPERATOR MOBILE
    ↓
TASK
    ↓
SERVER START
    ↓
BEFORE PHOTO
    ↓
WORK
    ↓
AFTER PHOTO
    ↓
LAB MOBILE
    ↓
RESULT
    ↓
SUPERVISOR / GM
    ↓
DECISION
    ↓
CHAIRMAN
    ↓
CONTROL TOWER
    ↓
MASTER BATCH
    ↓
INDIVIDUAL BATCH
    ↓
H-HOUR
    ↓
ACTIVITY
    ↓
PROOF
    ↓
PHOTO + TIMESTAMP + PERSON + MACHINE + LAB + DECISION
    ↓
EXCEL REPORT
    ↓
GROWING ROOM / YIELD
```

---

# 29. NON-NEGOTIABLES

1. One canonical MushroomOS source.
2. One shared backend.
3. One H0-H552 process clock.
4. All seven roles on web and mobile.
5. Server timestamps are authoritative.
6. Activities can cross day boundaries.
7. Master Batch and Individual Batch are distinct.
8. Bunkers are movement resources.
9. T1→T2 is per-pile.
10. T2 follows immediately after that pile's T1.
11. Multiple Master Batches can run concurrently.
12. Admin configures; the system generates tasks.
13. Evidence is attached to actual activities.
14. Management can see actual media.
15. Lab results are versioned.
16. Do not invent unresolved factory values.
17. Excel is output, not source of truth.
18. Mobile and web never contain separate business logic.
19. No generic SaaS dashboard replacing the factory model.
20. Every screen must have a real process/data reason.

---

# 30. FINAL INSTRUCTION TO ANY BUILD AGENT

Read this specification and the provided source/APKs.

Inspect the existing implementation.

Preserve working capabilities where they match this contract.

Archive rather than duplicate legacy code.

Build from:

```text
PROCESS → DATA → STATE → SCREEN → PROOF → TEST
```

Do not create another interpretation of MushroomOS.

Build the one product described here.
