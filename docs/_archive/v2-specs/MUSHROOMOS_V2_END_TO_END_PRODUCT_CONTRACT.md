> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# MushroomOS V2 — End-to-End Product Contract

## Status

**Purpose:** alignment document for Claude Max (product/architecture brain) and Kiro/Opus (implementation engine).

**This document is the product contract.** It describes what MushroomOS is, what must be built, what must not be built, how the production process is represented, and how the roles connect.

This is intentionally stricter than a UI specification. It is the bridge between the factory process and the software implementation.

---

# 1. Product in One Sentence

**MushroomOS is a 552-hour production control tower for every Master Batch.**

The system converts:

**Standard Process + Monthly Schedule + Admin Batch Configuration**

into a frozen batch baseline, then continuously records:

**Operator Execution + Laboratory Quality + Evidence + People + Machines + Locations + Decisions**

and compares that reality against the baseline.

The primary customer is the owner/founder/general management layer. Operators, laboratory technicians, supervisors, managers, and admins are the people who create the reliable operational record that management consumes.

---

# 2. The Problem We Are Solving

The factory can physically make compost. The problem is traceability and reconstruction.

Today the relevant information is spread across schedules, master-batch records, laboratory spreadsheets, movement records, formulation workbooks, operator memory, supervisor memory, and photographs.

When a batch performs poorly, management should not have to reconstruct the answer after the fact.

MushroomOS must make it possible to answer, for any batch and any point in its lifecycle:

1. What was supposed to happen?
2. What actually happened?
3. When did reality diverge from the plan or standard?
4. Who performed the work?
5. What machine/resource was used?
6. Where was the material?
7. What measurements were taken?
8. What evidence proves the activity happened?
9. What deviation/correction occurred?
10. Who allowed the process to continue?
11. What is the current forecast for completion?
12. What could this deviation mean for final compost quality and eventual yield?

The formal source material explicitly describes this reconstruction problem and the need to connect schedule, batch records, lab data, movement, formulation, memory, and evidence into one traceable record.

---

# 3. Product Mental Model

MushroomOS is NOT:

- a digital checklist
- a stage-by-stage form app
- an operator-only application
- a generic ERP
- a dashboard on top of disconnected forms

MushroomOS IS:

- a batch-centric production record
- a 552-hour process timeline
- a workflow/gate engine
- a laboratory traceability system
- an evidence system
- an accountability system
- a resource/machine utilization system
- a management control tower

The operator and lab interfaces are input surfaces for the management system.

The management control tower is the main product value.

---

# 4. Canonical System Hierarchy

```text
                         MONTHLY SCHEDULE
                                │
                                ▼
                         MASTER BATCH
                                │
                ┌───────────────┼────────────────┐
                │               │                │
                ▼               ▼                ▼
              PLAN          EXECUTION         QUALITY
                │               │                │
                │          ┌────┼────┐           │
                │          ▼    ▼    ▼           │
                │       PEOPLE MACHINE EVIDENCE   │
                │               │                │
                └───────────────┼────────────────┘
                                ▼
                           VARIANCE
                                │
                                ▼
                            DECISIONS
                                │
                                ▼
                     MANAGEMENT CONTROL TOWER
                                │
                                ▼
                     COMPOST QUALITY / OUTCOME
                                │
                                ▼
                         EVENTUAL YIELD
```

---

# 5. Source-of-Truth Hierarchy

The system must keep these layers separate.

## 5.1 Standard Process

The formal process/SOP definition.

Contains:

- process sequence
- standard durations
- process targets
- rules
- gates
- evidence requirements
- lab checkpoints
- acceptable ranges where defined
- source references

The SOP is the standard/reference layer.

## 5.2 Monthly Schedule

The factory planning layer.

Provides:

- scheduled batch slot
- expected batch start
- factory-calendar context
- concurrent batch positioning

The schedule is NOT the execution record.

## 5.3 Day-0 Batch Plan

Admin-specific configuration for one scheduled Master Batch.

Contains:

- material-role bindings
- formulation
- quantities
- load plans
- bunker assignments
- tunnel reservations/allocations where applicable
- people
- machines
- vehicles
- operator fields
- evidence requirements
- lab requirements
- controlled process options
- batch-specific timings where permitted

## 5.4 Actual Execution

What physically happened.

Contains:

- actual timestamps
- actual quantities
- actual duration
- actual values
- operator/lab personnel
- equipment
- locations
- evidence
- observations
- remarks

## 5.5 Decision

What a supervisor or GM decided when a process condition, deviation, exception, or management checkpoint required a decision.

---

# 6. The 552-Hour Master Clock

The controlled production window is:

**H0 → H552**

23 days × 24 hours = 552 hours.

The day mapping is:

```text
DAY 0   H000–H024
DAY 1   H024–H048
DAY 2   H048–H072
DAY 3   H072–H096
DAY 4   H096–H120
DAY 5   H120–H144
DAY 6   H144–H168
DAY 7   H168–H192
DAY 8   H192–H216
DAY 9   H216–H240
DAY 10  H240–H264
DAY 11  H264–H288
DAY 12  H288–H312
DAY 13  H312–H336
DAY 14  H336–H360
DAY 15  H360–H384
DAY 16  H384–H408
DAY 17  H408–H432
DAY 18  H432–H456
DAY 19  H456–H480
DAY 20  H480–H504
DAY 21  H504–H528
DAY 22  H528–H552
```

**Important:** a day is a grouping window, not a single activity.

Activities may:

- start inside a day
- finish inside another day
- overlap other activities
- continue across day boundaries
- run in parallel

The actual process is therefore represented by a time-based graph, not a list of day screens.

---

# 7. Two Time Systems Must Always Exist

Every planned/executed activity must support both:

## Relative batch time

```text
H126 → H135
```

## Absolute factory time

```text
25 June 08:00 → 25 June 17:00
```

The owner must be able to see both.

Example:

```text
BATCH HOUR       126 / 552
PLANNED START    08:00
ACTUAL START     09:14
VARIANCE         +1h 14m
```

---

# 8. Master Batch Creation

Admin starts from a scheduled slot.

The flow is:

```text
MONTHLY SCHEDULE
        ↓
SELECT SCHEDULED BATCH
        ↓
BATCH PREVIEW
        ↓
DAY-0 CONFIGURATION
        ↓
VALIDATE
        ↓
GENERATE 552-HOUR PLAN
        ↓
REVIEW
        ↓
ACTIVATE
```

Admin does not manually type 552 hours of activities.

The system compiles the baseline from the standard process + schedule + admin options.

---

# 9. Day-0 Configuration Model

Admin configures the batch in structured sections.

## 9.1 Identity

- schedule slot
- Master Batch identity
- start date/time
- process version

## 9.2 Material Roles

The process definition must NOT name a specific material where behaviour is what matters.

Use role abstractions such as:

- PRIMARY_FIBRE
- SECONDARY_FIBRE
- STRUCTURAL_STRAW
- NITROGEN_SOURCE
- MINERAL
- PH_CORRECTOR

Admin binds actual materials to these roles.

Example:

```text
PRIMARY_FIBRE → Bagasse
PRIMARY_FIBRE → Mustard
```

The process definition must continue to work without code changes when the material binding changes.

If a material has role-specific behaviour that changes duration/operation rules, the material-role mapping must be configuration, not hard-coded UI logic.

## 9.3 Formulation

- materials
- quantities
- ratios
- raw material lots
- assay values/status
- calculated totals
- derived N/Ash/C:N where applicable

## 9.4 Load Plan

Example:

```text
Target = 21 MT
Expected load = 2 MT
Planned loads = ceil(21 / 2) = 11
```

The number of loads is calculated, never hard-coded.

## 9.5 Resources

- bunkers
- tunnels
- yard/platform
- hopper
- turner
- rotavator
- loader/JCB
- vehicles
- drivers

Resource occupancy must be time-aware.

## 9.6 People

- supervisor
- operators
- lab technician(s)
- other configured personnel

## 9.7 Operator Plan

Each activity specifies:

- SOP value
- Day-0 target
- allowed customization
- operator fields
- evidence requirements
- remarks/instructions

## 9.8 Lab Plan

Each checkpoint specifies:

- sample scope
- parameters
- target/spec where defined
- sample count
- required/not required
- evidence requirement

## 9.9 Process Options

Examples:

- water hopper vs dry hopper mode
- rest duration
- optional/conditional activity
- machine selection
- route choices

Where a factory rule is unresolved, the system must surface it as a configuration/TBD rather than invent an answer.

---

# 10. Activation and Baseline Freeze

Before activation, the system runs validation.

After activation:

```text
BASELINE = IMMUTABLE
```

Column 1/2/3 planning values cannot silently change.

If an approved planning change is later required, it becomes an explicit change/deviation event with actor, timestamp, old value, new value and reason.

Actual execution is always stored separately.

---

# 11. The Factory Process — H0 to H552

This section is the canonical operational story for the demo/current factory walkthrough.

## H0–H24 — Day 0

### Bagasse / raw material weighment

Physical flow:

```text
Material
   ↓
Vehicle / Loader
   ↓
Weighment
   ↓
Load N
```

Example:

```text
TARGET = 21 MT
EXPECTED LOAD ≈ 2 MT
PLANNED LOADS = 11
```

Each load records:

- target
- actual
- cumulative quantity
- remaining quantity
- machine
- vehicle
- operator
- start/end
- evidence

### Lab checkpoint

Where configured, the lab records incoming raw-material values such as:

- moisture
- pH
- dry weight

---

## H24–H48 — Day 1

### Bagasse wetting / Hopper flow

```text
BAGASSE
   ↓
MOISTURE CONDITION
   ├── WATER HOPPER
   └── DRY HOPPER
   ↓
BUNKER LOADING
```

The actual Water/Dry decision must remain configurable until the underlying moisture conflict is formally resolved.

Hopper evidence can include:

- before photo
- after photo

### Bunker Loading

Records:

- bunker
- machine
- operator
- start/end
- quantity
- evidence

---

## H48–H96 — Days 2–3

Rest/hold window(s).

This is a time-gated state, not an empty period.

UI:

```text
RESTING
Batch H61 / 552
Remaining: 18h 42m
```

The server controls gate release.

---

## H96–H120 — Day 4

### Bagasse unload → Hopper → Reload

```text
SOURCE BUNKER
      ↓
    UNLOAD
      ↓
    HOPPER
      ↓
DESTINATION BUNKER
```

Record both source and destination.

Lab checks may include:

- moisture
- pH
- EC

Paddy weighment/checks may also occur around this process stage according to the lab process definition.

---

## H120–H144 — Day 5

### Paddy Soaking 1

```text
PADDY
  ↓
SOAK 1
  ↓
STORAGE / BUNKER WHERE CONFIGURED
```

Typical duration from current factory walkthrough: 8–10 hours.

Lab:

- pH
- EC
- TDS

---

## H144–H168 — Day 6

### Paddy Soaking 2

Duration: approximately 8–10 hours.

Lab:

- pH
- EC
- TDS

---

## H168–H192 — Day 7

This is a high-concurrency window.

### Stream A — Paddy

```text
SOAK 3
  ↓
REST 14–16h
```

Lab:

- pH
- EC
- TDS

### Stream B — Chicken Manure / Minerals

```text
CHICKEN MANURE
      +
GYPSUM
      +
AMMONIUM SULPHATE
      ↓
WEIGHMENT
      ↓
ROTAVATOR MIX
      ↓
READY
```

Duration around 6h per current factory walkthrough.

Lab monitoring may include N/Ash before and after storage/resting.

### Stream C — Bagasse to yard

```text
BUNKER
  ↓
UNLOAD
  ↓
YARD
  ↓
PILE 1 / PILE 2
```

### Stream D — Yard integration

```text
MINERAL/MANURE MIX
        ↓
ADD TO BAGASSE
        ↓
FLIP 1
        ↓
FLIP 2
        ↓
HOPPER WITH WATER
        ↓
SINGLE MIXED PILE
        ↓
REST
```

### Stream E — Paddy to yard

Paddy pile(s) are positioned relative to the central mixed pile according to the batch configuration.

---

## H192–H216 — Day 8

### Final yard integration

```text
PADDY + BAGASSE + N/MIX
          ↓
        FLIP 1
          ↓
        FLIP 2
          ↓
          T0
          ↓
   PARALLEL PILE FLOW
```

The process supports scope-specific turning:

```text
PILE 1 → T1 → T2
PILE 2 → T1 → T2
PILE 3 → T1 → T2
```

The dependency is bound to the same physical scope/pile, not globally across the whole batch.

### Bunker loading

Outputs are loaded into configured bunker lines.

Each bunker load is independently tracked.

---

## H216–H240 — Day 9

Bunker loading may continue across the day boundary.

The plan should remain hour-based rather than forcing a day-level completion.

---

## H240–H288 — Days 10–11

Rest/hold window(s).

---

## H288–H312 — Day 12

### Bunker unloading / reloading

```text
SOURCE BUNKER
      ↓
    UNLOAD
      ↓
MOISTURE DECISION
   ├── ACCEPTABLE → RELOAD
   └── LOW → HOPPER + WATER → RE-MEASURE → RELOAD
```

Checks can include:

- moisture
- pH
- EC
- N
- Ash
- C:N
- smell
- colour
- spring/squeeze

Lab results and physical decisions are linked to the same activity.

---

## H312–H360 — Days 13–14

Rest/hold window(s).

---

## H360–H384 — Day 15

### Tunnel loading

```text
BUNKER(S)
    ↓
TUNNEL ALLOCATION
    ├── Tunnel 1
    ├── Tunnel 2
    └── Tunnel 3
```

Each tunnel becomes an independently tracked branch.

Lab checks include the configured tunnel-loading quality parameters.

---

## H384–H528 — Days 16–21

### Tunnel processing

The tunnel process is a monitored multi-stage state.

Conceptually:

```text
CONDITIONING
   ↓
HEATING
   ↓
PASTEURIZATION
   ↓
COOLING
   ↓
CONDITIONING / HOLD
```

The exact bands/targets are configuration data and remain versioned because the source set contains identified Phase-2 conflicts.

Each tunnel has its own:

- current state
- elapsed time
- temperatures/readings
- machine/resources
- evidence
- lab checkpoints
- deviations
- forecast

---

## H528–H552 — Day 22

### Tunnel unloading

```text
TUNNEL 1 ─┐
TUNNEL 2 ─┼──→ UNLOAD
TUNNEL 3 ─┘
```

Lab may record:

- pH
- EC
- moisture
- nitrogen
- ash
- C:N
- shrunken height
- actinomycetes observation
- smell
- colour
- spring/squeeze where applicable

At H552 the controlled compost process ends.

---

# 12. H552+ — Outcome Link

The initial operational scope ends at tunnel unloading/compost-out.

The data model must nevertheless support:

```text
MASTER BATCH
   ↓
COMPOST OUT
   ↓
GROWING ROOM
   ↓
SPAWN / GROWING LIFECYCLE
   ↓
HARVEST BREAKS
   ↓
YIELD
```

The purpose is eventual causal analysis:

```text
PROCESS VARIANCE
      ↓
COMPOST QUALITY
      ↓
GROWING ROOM BEHAVIOUR
      ↓
YIELD
```

This linkage is supported by the source batch/lab records and is a future analytics objective, not a requirement to expand the first demo into a full mushroom-growing execution system.

---

# 13. Activity Data Model

Every activity is a scoped execution object.

```text
activity
├── id
├── master_batch_id
├── scope_type
│    ├── MASTER
│    ├── MATERIAL_LOAD
│    ├── BUNKER_LINE
│    ├── PILE
│    ├── PADDY_SOAK
│    ├── TUNNEL
│    └── INDIVIDUAL_BATCH
├── scope_id
├── activity_code
├── label
├── standard_start_hour
├── standard_end_hour
├── planned_start_at
├── planned_end_at
├── actual_start_at
├── actual_end_at
├── responsible_role
├── assigned_person
├── machine_id
├── vehicle_id
├── source_location_id
├── destination_location_id
├── status
├── blocked_reason_code
├── blocked_reason_text
└── decision_state
```

Activity fields remain configuration-driven.

---

# 14. Evidence Model

Evidence is an explicit requirement, not a generic photo counter.

Each activity can define named requirements:

```text
HOPPER PASS
  ├── Before Photo
  └── After Photo

ROTAVATOR MIX
  ├── Before Mix
  ├── After Mix
  └── Ammonium Sulphate Hand Mix
```

The UI must show:

```text
2 / 3 evidence complete

✓ Before Mix
✓ After Mix
○ Ammonium Sulphate Hand Mix
```

The activity cannot submit while mandatory evidence remains missing.

Evidence records include:

- user
- server timestamp
- batch
- activity
- requirement code
- storage path
- optional metadata

---

# 15. Laboratory Model

Lab is a first-class subsystem.

The lab document explicitly defines a batch-centric queue, required measurements, evidence, concurrent batch work, submission, and GM approval/rejection without blocking the technician from moving to another batch.

Core model:

```text
LAB CHECKPOINT
      ↓
LAB SAMPLE
      ↓
LAB TEST
      ↓
LAB RESULT
      ↓
PASS / FAIL / NO-SPEC
      ↓
RETEST / CORRECTION when applicable
```

Results are versioned.

Historical results are never overwritten.

Typical parameters include:

- moisture
- pH
- EC
- TDS
- dry weight
- nitrogen
- ash
- C:N
- bunker/tunnel height where relevant
- observational checks

Observations such as smell, colour, spring/squeeze and actinomycetes are separate from numerical measurements.

---

# 16. Workflow / Gate Engine

Workflow progression is state-based, not calendar-based.

Recommended states:

```text
LOCKED
READY
IN_PROGRESS
SUBMITTED
AWAITING_LAB
WAITING_TIME
WAITING_CONDITION
AWAITING_SUPERVISOR
BLOCKED
DEVIATION
RETURNED
COMPLETED
SKIPPED
CANCELLED
```

Every non-actionable state must explain why.

Examples:

```text
WAITING_TIME
Rest period — 03:18 remaining

AWAITING_LAB
Awaiting lab — Moisture + EC for bunker reload

BLOCKED
Blocked — previous pile's T1/T2 dependency incomplete

DEVIATION
Deviation — actual load 3.6 MT vs Day-0 target 2.0 MT
```

The state transition authority must be server-side.

The frontend may mirror state for display, but never become the authoritative source of truth.

---

# 17. Parallelism

The Master Batch is a graph.

At different points the following streams may execute simultaneously:

```text
BAGASSE
PADDY
MANURE / MINERALS
YARD
BUNKERS
TUNNELS
LAB
```

The workflow engine must support:

- independent activity scopes
- parallel activities
- same-scope dependencies
- time dependencies
- condition dependencies
- resource constraints
- joins

Example:

```text
PILE 1 → T1 → T2
PILE 2 → T1 → T2
PILE 3 → T1 → T2
```

must NOT become:

```text
ALL T1
   ↓
ALL T2
```

unless a process definition explicitly requires that barrier.

---

# 18. Resource Model

Resources are physical, time-bound objects.

Core resources:

- bunker
- tunnel
- hopper
- turner
- rotavator
- JCB/loader
- vehicle
- driver
- yard/platform
- growing room

Every resource assignment has:

- start
- end
- batch
- activity
- person/operator where applicable

Bunker and tunnel occupancy must prevent overlapping reservations where the physical process does not allow them.

---

# 19. Machine / Equipment Utilization

For each machine/equipment resource:

```text
MACHINE
├── activity
├── batch
├── operator
├── start
├── end
├── duration
├── location
└── optional fuel/energy information
```

Management can then see:

```text
JCB-02       14.5 h
TURNER-03    22.0 h
HOPPER-01     9.3 h
ROTAVATOR-01  6.2 h
```

Machine utilization is part of accountability and cost/process analysis.

---

# 20. Role Model

## Admin

Answers:

> What is this batch supposed to do?

Responsibilities:

- schedule selection
- batch creation
- Day-0 configuration
- process/options selection
- people/resource planning
- validation
- activation

## Field Operator

Answers:

> What do I need to do now?

Responsibilities:

- physical execution
- actual values
- timestamps
- machine usage
- evidence
- remarks

## Lab Technician

Answers:

> What do I need to measure now?

Responsibilities:

- samples
- tests
- measurements
- observations
- evidence
- retests
- submissions

The lab technician can move between concurrent batches while waiting for GM decisions.

## Supervisor

Answers:

> Can this process continue?

Responsibilities:

- operational control
- release
- hold
- return
- deviation review
- evidence review
- escalation

## Manager

Answers:

> Can the factory physically execute this plan?

Responsibilities:

- resource allocation
- people
- machine conflicts
- vehicle conflicts
- capacity

## General Manager

Answers:

> What is happening, why, and what decision do I need to make?

Responsibilities:

- management checkpoints
- meaningful approval/return decisions
- controlled overrides
- batch comparison
- exception visibility
- quality/process questions

GM is NOT a per-operator task approval queue.

---

# 21. Management Control Tower

The primary management surface has six connected areas.

## 21.1 Factory Calendar

Click a date and see all concurrent active Master Batches.

For each:

- current process position
- batch hour
- progress
- evidence completeness
- delay/variance
- deviations
- status

This answers:

> What is happening in the factory today?

## 21.2 552-Hour Batch Timeline

A horizontal time view from H0 to H552.

Show:

- baseline bars
- actual bars
- current playhead
- delays
- gates
- parallel branches
- evidence markers
- lab markers
- decisions

## 21.3 Animated Production Graph

Material visibly moves:

```text
WEIGHMENT
   ↓
HOPPER
   ↓
BUNKER
   ↓
RELOAD
   ↓
YARD
   ↓
T1 / T2
   ↓
BUNKERS
   ↓
TUNNELS
   ↓
UNLOAD
```

Graph and timeline share the same playhead.

## 21.4 Evidence Trail

Management can click any activity and see:

- photos
- timestamps
- uploader
- measurements
- lab results
- remarks
- decision history

## 21.5 Resource View

Management sees:

- active machines
- machine hours
- bunker occupancy
- tunnel occupancy
- vehicle usage
- personnel activity where appropriate

## 21.6 Management Questioning Layer

Every abnormal/late node should answer:

- Why late?
- Who did it?
- Which machine?
- Where?
- What was planned?
- What happened?
- What evidence exists?
- Was it within standard?
- Who approved continuation?
- What downstream effect is forecast?

---

# 22. Daily Management Report

At each 24-hour boundary, generate a frozen daily report for the batch.

The report contains:

- planned work
- completed work
- delayed work
- missed work
- lab results
- evidence completeness
- machine/resource usage
- personnel/accountability
- deviations
- corrective actions
- decisions
- current batch hour
- current forecast
- quality/risk flags

This is the GM's daily narrative layer on top of the raw event history.

---

# 23. Batch Completion Forecast

The system continuously estimates:

```text
CURRENT BATCH HOUR
BASELINE END H552
ACCUMULATED VARIANCE
OPEN GATES
CURRENT RESOURCE CONSTRAINTS
```

Then:

```text
FORECAST END
FORECAST VARIANCE
```

The forecast is derived, not manually entered.

---

# 24. Event Model

Every important state change creates an immutable event.

Examples:

```text
BATCH_CREATED
BATCH_ACTIVATED
LOAD_STARTED
LOAD_COMPLETED
ACTIVITY_STARTED
ACTIVITY_SUBMITTED
EVIDENCE_UPLOADED
LAB_SAMPLE_CREATED
LAB_RESULT_RECORDED
LAB_RESULT_SUPERSEDED
REST_STARTED
REST_RELEASED
DEVIATION_RAISED
CORRECTIVE_ACTION_CREATED
SUPERVISOR_RELEASED
SUPERVISOR_HELD
GM_APPROVED
GM_RETURNED
RESOURCE_ASSIGNED
RESOURCE_RELEASED
BATCH_FORECAST_CHANGED
```

The event history is the audit trail and the source for timeline reconstruction.

---

# 25. Data Integrity Rules

1. Baseline is immutable after activation.
2. Actual values are append-only/superseding, never silently overwritten.
3. Lab results are versioned.
4. Evidence has a server timestamp.
5. Gate decisions are server-enforced.
6. Resource conflicts are database-enforced where appropriate.
7. Device clocks cannot open time gates.
8. A blocked task always explains why.
9. Unresolved source conflicts are represented explicitly.
10. No material-specific assumption is hard-coded into a generic process definition.
11. No fixed assumption of 3 or 4 individual batches.
12. No fixed assumption of one bunker/tunnel per batch.
13. No invented quality threshold.
14. No frontend-only authorization boundary.

---

# 26. Demo Scope

The first deployable demo should prove the architecture, not implement every future screen.

## Must work end-to-end

```text
SCHEDULE
  ↓
ADMIN MASTER BATCH CREATION
  ↓
552-HOUR BASELINE
  ↓
ACTIVATE
  ↓
OPERATOR EXECUTION
  ↓
EVIDENCE
  ↓
REST / GATE
  ↓
VARIANCE / DEVIATION
  ↓
BATCH TIMELINE
  ↓
MANAGEMENT CONTROL TOWER
```

## High-value management visualization

Must eventually show:

- factory calendar
- concurrent batches
- batch progress
- evidence completeness
- 552-hour plan vs actual
- production graph
- machine/resource use
- variance

## Lab

Must be designed as a real subsystem and connected to batch checkpoints.

The first demo may stage/seed some lab data if full live lab implementation is not yet ready, but the data model must not be fake or disconnected.

## Growing room / harvest

Architecturally supported, but outside the first 552-hour execution demo.

---

# 27. What NOT To Build

Do NOT:

- reproduce the legacy APK page-per-stage navigation
- build 23 completely separate day pages
- build a dashboard disconnected from the batch event model
- make GM approve every operator task
- put lab logic into generic operator forms
- hard-code material names into generic process definitions
- hard-code load counts
- hard-code 3 or 4 batch lines
- hard-code one-to-one bunker/tunnel relationships
- invent unresolved SOP thresholds
- use localStorage as the source of truth
- create a second authentication model for the APK
- create demo-only fake state transitions
- rebuild architecture just to change visual styling

---

# 28. Legacy APK Position

The legacy APK is reference material for:

- existing factory UX familiarity
- mobile interaction patterns
- existing evidence/camera usage
- existing labels/terminology where still relevant

It is NOT the architecture for MushroomOS V2.

Do not fork the legacy APK into a second data/auth/workflow implementation.

The long-term operator application should use the same MushroomOS backend and domain model as the web management system.

---

# 29. Technology Architecture

Recommended implementation:

```text
FRONTEND
React + TypeScript
Responsive management web
Mobile-first operational surface

BACKEND
Supabase
├── PostgreSQL
├── Auth
├── RLS
├── Storage
├── Realtime
└── Edge Functions / server-side functions
```

Critical state transitions must be server-enforced.

Frontend workflow logic may mirror server state for display but is never the authority.

Evidence lives in private storage with database-controlled access.

---

# 30. Implementation Sequence

## Phase 1 — Foundation

- clean Supabase project
- auth
- profiles/roles
- RLS
- migrations
- seed
- audit
- process definitions
- 552h timing model

## Phase 2 — Master Batch Creation

- schedule import
- schedule selection
- material-role binding
- formulation
- load planning
- bunker/tunnel/resource allocation
- operator plan
- lab plan
- evidence plan
- validation
- activation

## Phase 3 — Operator Execution

- My Work
- task detail
- actual values
- machine/resource capture
- evidence capture
- task submission
- time gates
- variance

## Phase 4 — Laboratory

- lab queue
- sample creation
- test entry
- results
- evidence
- retest/versioning
- approval status

## Phase 5 — Supervisor

- control room
- blocked activities
- deviations
- release/hold/return
- corrective actions

## Phase 6 — Management

- GM control tower
- checkpoints
- decision packages
- exceptions
- batch compare

## Phase 7 — Visual Intelligence

- factory calendar
- 552h Gantt
- animated production graph
- playhead synchronization
- evidence heatmap
- resource utilization
- batch variance

## Phase 8 — Outcome

- growing-room linkage
- harvest/yield linkage
- process-to-outcome analytics

---

# 31. Acceptance Criteria for the First Complete Vertical Slice

A reviewer must be able to:

1. Open a monthly schedule.
2. Select one scheduled Master Batch.
3. Create its Day-0 plan.
4. Bind materials to process roles.
5. Generate dynamic load counts.
6. Assign bunker/resource movements.
7. Configure evidence.
8. Configure lab checkpoints.
9. Validate the plan.
10. Activate the batch.
11. See the 552-hour baseline.
12. Log in as operator.
13. Execute a real activity.
14. Capture actual values.
15. Upload required evidence.
16. Submit the activity.
17. See a time-gated activity remain blocked.
18. See the gate open from server time without a manual override.
19. See a variance/deviation recorded when actual differs from plan.
20. Open the batch control tower.
21. See planned vs actual.
22. See current batch hour.
23. See evidence completeness.
24. See machine/resource usage.
25. See the physical process graph.
26. Drill into the evidence and event history.

If these 26 things work, the system has demonstrated the core MushroomOS thesis.

---

# 32. Final Product Principle

The most important rule in MushroomOS V2 is:

> **Do not build screens first. Build the connected production record first, then make every role a different view of that same record.**

The operator sees the next action.

The lab technician sees the next measurement.

The supervisor sees the next decision.

The manager sees the next resource conflict.

The admin sees the next plan to instantiate.

The GM/owner sees the entire 552-hour story.

All of them are looking at the same Master Batch truth.

That is MushroomOS V2.
