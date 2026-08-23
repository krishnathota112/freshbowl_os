# MushroomOS V2 — Manus Frontend Build Context

**Purpose:** This document is the canonical frontend brief for Manus.

**Audience:** Manus frontend/UI implementation agent, with Claude/Kiro providing backend/domain support.

**Product:** MushroomOS V2

**Current goal:** Build a production-quality frontend for a 552-hour compost production control system. The interface is primarily a management/control-tower product, with role-specific operational surfaces for Admin, Operator, Lab Technician, Supervisor, and Manager.

---

# 1. Product Story

MushroomOS is not primarily a digital SOP checklist and it is not primarily an operator app.

It is a **production control tower for the owner / General Manager**.

A Master Batch represents a complete compost production journey. The factory plans a batch, people execute it, laboratory staff measure it, machines and locations are used, evidence is captured, deviations occur, supervisors make operational decisions, and management reviews the full story.

The product exists so management can ask, with evidence:

- Where is this batch right now?
- Where should it be at this hour?
- Is it ahead or behind plan?
- What caused the delay?
- Who performed the work?
- Which machine or vehicle was used?
- Where was the material?
- What measurements were taken?
- What photos prove the work happened?
- What changed from the SOP?
- Who approved continuation?
- What is the likely effect on compost quality and eventual yield?

The UI must make these questions answerable without making the owner understand internal activity codes.

---

# 2. Product Mental Model

The canonical system flow is:

```text
STANDARD PROCESS
      +
MONTHLY / FACTORY SCHEDULE
      +
ADMIN BATCH CONFIGURATION
      ↓
FROZEN MASTER-BATCH BASELINE
      ↓
0 → 552 HOUR EXECUTION
      ↓
OPERATOR + LAB + MACHINE + LOCATION ACTUALS
      ↓
EVIDENCE + MEASUREMENTS + EVENTS
      ↓
VARIANCE / DEVIATIONS
      ↓
SUPERVISOR / GM DECISIONS
      ↓
OWNER CONTROL TOWER
      ↓
EVENTUAL COMPOST QUALITY / YIELD
```

The UI should always reinforce this chain.

---

# 3. The 552-Hour Model

The factory's Book1 grid establishes an exact 552-hour contiguous batch baseline. Three observed batches begin every 48 hours and each occupy 552 consecutive batch hours.

The application must distinguish:

```text
BOOK / BATCH HOUR = interval
Hn                = instant
```

For example:

```text
Hour 1   = [H0, H1)
Hour 552 = [H551, H552)
H552     = the instant at which the baseline ends
```

Do not implement hour 1 as H1. That creates a one-hour system-wide shift.

Every batch has:

```text
start_at
baseline_hours
batchHour(at)
batchDay(hour)
wallClock(hour)
```

The current target baseline is 552 hours, derived from the process definition. Do not scatter literal `552` or `23` through runtime business logic.

The batch-day boundary is:

```text
H0 + n × 24 hours
```

Do not derive batch days using calendar-midnight truncation.

The batch may span 24 calendar dates even though it has 23 batch-days.

The exact factory interpretation of the Excel hour-slot convention remains TBD; the UI must surface a clear TBD marker rather than pretending the factory answer is known.

---

# 4. The Primary Management Experience

The management layer answers exactly three questions:

1. **Is the factory alright right now?**
2. **What is happening to this batch and is it late?**
3. **Why, who, and who allowed it to continue?**

These map to:

```text
FACTORY CONTROL TOWER
        ↓
552-HOUR BATCH RAIL
        ↓
EVIDENCE / DECISION PANEL
```

Do not create screens that are disconnected from those questions.

---

# 5. Management Design Philosophy

The management user is the owner / GM. They know the factory but are not a software technician.

The UI must be:

- clean
- calm
- information-dense without being cluttered
- industrial
- highly visual
- trustworthy
- evidence-first
- direct
- fast to scan
- understandable without explaining internal codes

Do NOT create a generic SaaS analytics dashboard.

Do NOT use:

- donut charts for batch health
- gauge widgets
- 12–20 KPI cards
- decorative gradient cards
- rainbow status colours
- giant percentage-complete bars
- stage-code-heavy UI

The product should feel like a **modern industrial command center**.

---

# 6. Visual Language

## 6.1 Five semantic states

Use exactly five semantic meanings in the management layer:

| Meaning | Visual role |
|---|---|
| Going to plan | neutral / ink |
| Happening now | accent |
| Waiting on the clock | calm/inherit |
| Needs a person | warning |
| Rule broken / critical | critical |

Do not introduce a sixth semantic colour.

## 6.2 Rest is not an error

Large portions of the process are intentional rest / hold periods.

Resting should look calm and positive, not greyed-out or alarming.

Show a live countdown where relevant.

Example:

```text
RESTING
Started 05:00
Required 24h
Remaining 07h 18m
```

## 6.3 No percentage complete on batches

Never display:

```text
57% complete
```

The honest progress indicator is batch-hour position:

```text
Day 5 · H137
of 552
```

The timeline itself shows position.

## 6.4 Human-readable time

Always show a human wall-clock alongside batch time.

Preferred:

```text
Tue 6 AM
Day 5 · H137
of 552
```

Not:

```text
H137
```

For durations:

```text
1h 14m behind
30 min early
```

Not:

```text
+74 min
-0.5 h
```

---

# 7. The Factory Control Tower

This is the default GM/owner home screen.

## Primary layout

```text
┌──────────────────────────────────────────────────────────────────────┐
│ FACTORY CONTROL TOWER                               Sat 22 Aug 2026 │
│                                                                      │
│  12 RUNNING      8 ON PLAN      3 NEED A DECISION      1 HELD       │
├──────────────────────────────────────────────────────────────────────┤
│ NEEDS YOU                                                            │
│                                                                      │
│ ⚠ MB-118  Bunker reload ran 3h 20m long      [Look at it]           │
│ ⚠ MB-121  Lab moisture conflict C-01         [Look at it]           │
│ ⚠ MB-109  Tunnel unload is 6h late            [Look at it]           │
├──────────────────────────────────────────────────────────────────────┤
│ FACTORY                                                              │
│                                                                      │
│ MB-097 ███████████████████████████████████                           │
│ MB-100   ███████████████████████████████████                         │
│ MB-103      █████████████████████████████████                        │
│ MB-106        ███████████████████████████████                        │
│ MB-109          █████████████████████████████ ⚠                      │
│ MB-112            ███████████████████████████                        │
│ ...                                                                  │
│                         │ NOW                                        │
└──────────────────────────────────────────────────────────────────────┘
```

## Critical design rule: staircase

Batches start at roughly 48-hour intervals, so the shared calendar axis should create a diagonal staircase.

Sort rows by **batch start time**, never by status or batch name.

The staircase itself visually explains:

- multiple concurrent batches
- staggered production
- different batch positions on the same factory date

Do not destroy this geometry by reordering rows.

## Factory calendar axis

The calendar axis is wall-clock/factory time.

The rail inside a batch is batch-relative time.

Do not mix these two axes.

Clicking anywhere on a batch bar should open the batch **at the hour represented by the click**, not just open the batch homepage.

Hovering a bar segment should show:

```text
What is happening
Who is responsible
Whether it is on plan
```

---

# 8. Batch Detail / 552-Hour Rail

The batch page is the core product surface.

It must feel like a production flight recorder.

## Header

Show:

- Master Batch ID
- wall-clock current time
- batch day
- batch hour
- baseline hours
- variance
- forecast finish
- current location
- current activity

Example:

```text
MB-118
Thu 22 Aug · 09:14
Day 5 · H137
of 552

3h 20m behind plan
Forecast: Thu ~4 Sep 9 AM
```

## Two synchronized rails

```text
PLAN     ├────────────────────●────────────────────────┤
ACTUAL   ├──────────────────────●                         
         H0                  H137                       H552
```

Plan is authoritative baseline.

Actual is what happened.

Forecast is separate and visibly different from fact.

## Where the time went

Show the top three sources of accumulated variance.

Example:

```text
WHERE THE TIME WENT

Bunker reload · line 2     2h 40m
Started late because lab moisture arrived late.

Hopper pass 2                42m
Ran longer than plan.

Everything else              -2m
```

Do not display a long list.

Three causes + remainder is enough.

## Rest windows

Rest segments must be visible on the rail.

Do not hide them because they are “nothing happening.”

Rest is an intentional process state.

## Parallel streams

When multiple streams run concurrently, the rail splits into lanes:

```text
FIBRE     ──────────────┐
PADDY      ────────┐    │
N/MIX        ──────┼────┤
YARD               │    ├── T1/T2 per pile
                    └────┘
```

T1 and T2 are scope-specific, not global barriers.

---

# 9. One Playhead Across Three Views

The batch page must have three synchronized representations:

```text
SPATIAL       Production Graph
                 ↓
               WHERE

TEMPORAL      552-hour Rail
                 ↓
             WHEN / LATE?

CHRONOLOGICAL Event Stream
                 ↓
              WHAT HAPPENED
```

They share one playhead.

Dragging the rail must update:

- current position in production graph
- visible event stream position
- current activity
- narrative context
- evidence panel context

This is one of the most important UX interactions in the product.

Do not make three disconnected screens.

---

# 10. Production Graph

The graph represents physical production movement.

Example:

```text
                    MASTER BATCH
                         │
        ┌────────────────┼────────────────┐
        │                │                │
      FIBRE             PADDY          N/MIX
        │                │                │
        ▼                ▼                ▼
    WEIGHMENT          SOAK 1          WEIGHMENT
        │                │                │
        ▼                ▼                ▼
      HOPPER           SOAK 2        ROTAVATOR
        │                │                │
        ▼                ▼                ▼
     BUNKER             SOAK 3           YARD
        │                │                │
        └────────────────┼────────────────┘
                         ▼
                        YARD
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
            PILE 1     PILE 2     PILE 3
              │          │          │
             T1         T1         T1
              │          │          │
             T2         T2         T2
              └──────────┼──────────┘
                         ▼
                       BUNKERS
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
           TUNNEL 1   TUNNEL 2   TUNNEL 3
              │          │          │
              └──────────┼──────────┘
                         ▼
                       UNLOAD
```

Animate only when the playhead moves.

Do NOT use decorative particle animations, glowing paths, or excessive motion.

When `prefers-reduced-motion` is enabled, snap state instead of tweening.

---

# 11. Management Narrative Layer

This is one of the highest-value UI features.

The factory historically writes technical batch narratives. MushroomOS should generate a narrative from the database instead of asking people to write it again.

Example:

> **MB-118 is 3h 20m behind plan.** Most of it — 2h 40m — came from the bunker reload on line 2, which started late because the lab moisture came back at 09:40 instead of 07:00. **Ravi** ran it with **JCB-02**, Bunker 3 → Bunker 7. Moisture was **71.4%**, between two conflicting source specifications (**C-01**), so the system did not invent a pass/fail judgment. **Anand** released the step at 10:15: “material acceptable, sweet smell.”

Rules:

- generated from data
- never manually authored
- never invent a fact
- name people
- name machines
- name vessels/locations
- quote the decision reason verbatim
- mention conflict IDs when a source conflict applies
- include forecast impact when derivable
- every named noun should be clickable to the underlying evidence/detail

Narrative should exist at:

- batch level
- batch-day level

---

# 12. Evidence / Decision Panel

Clicking any event, node, graph segment, or noun in the narrative opens the same detail panel.

Example:

```text
┌─────────────────────────────────────────────┐
│ Bunker Reload · Line 2        Day 5          │
│ Wed 5 AM → 8 AM · ran 2h 40m long           │
├─────────────────────────────────────────────┤
│ SUPPOSED TO BE                              │
│ 2h · source Bunker 3 → different bunker     │
│                                             │
│ WHAT HAPPENED                               │
│ Bunker 3 → Bunker 7                         │
│ 05:00 → 10:40                               │
│                                             │
│ WHO                                         │
│ Ravi                                        │
│                                             │
│ MACHINE                                     │
│ JCB-02                                      │
│                                             │
│ MEASURED                                    │
│ Moisture 71.4%                              │
│ ⚠ C-01 — source specs disagree              │
│                                             │
│ PROOF                                       │
│ [image] [image]                             │
│ uploaded 10:38 by Ravi                      │
│                                             │
│ LAB                                         │
│ Moisture 71.4 · pH 8.2                      │
│ Meena · 09:40                               │
│                                             │
│ DECISION                                    │
│ Released by Anand · 10:15                   │
│ “material acceptable, sweet smell”          │
└─────────────────────────────────────────────┘
```

Management should see the **actual photos**, not merely “2/2 photos.”

The panel must distinguish:

```text
SUPPOSED TO BE
WHAT HAPPENED
PROOF
DECISION
```

Use plain language for management.

Internal technical fields can remain accessible in secondary detail.

---

# 13. Five-Layer Activity Node

The same underlying component is reused everywhere.

Conceptual layers:

```text
1. SOP / Standard
2. Day-0 Plan
3. Actual
4. Evidence
5. Decision
```

Management relabels them in plain English:

```text
SUPPOSED TO BE
PLAN
WHAT HAPPENED
PROOF
DECISION
```

Do not create separate representations with different structures for different roles.

Change density, labels, and visibility — not the underlying component model.

---

# 14. Admin Experience

Admin is the person who converts planned factory production into an executable batch.

## Admin Today

Should answer:

- What batches are scheduled?
- Which are ready to create?
- Which are active?
- Which need configuration?
- Which are blocked by resource conflicts?

## Admin Batch Creation

Flow:

```text
SCHEDULE / PLANNED SLOT
        ↓
MASTER BATCH IDENTITY
        ↓
MATERIAL ROLES
        ↓
FORMULATION / QUANTITIES
        ↓
LOAD PLAN
        ↓
BUNKER / TUNNEL / LOCATION PLAN
        ↓
MACHINE / VEHICLE PLAN
        ↓
PEOPLE
        ↓
OPERATOR PLAN
        ↓
LAB PLAN
        ↓
EVIDENCE PLAN
        ↓
TIMING / REST WINDOWS
        ↓
VALIDATE
        ↓
REVIEW
        ↓
ACTIVATE
```

Admin is **not** manually typing 552 rows.

The standard process generates the baseline.

Admin may make controlled adjustments where allowed.

Any adjustment that changes a baseline must be visible and reasoned.

---

# 15. Admin Six-Column Model

Use the source model as the visual foundation:

```text
┌──────────────────┬────────────────┬─────────────────┬─────────────────┬───────────────┐
│ SOP / STANDARD   │ DAY-0 PLAN     │ CUSTOMISATION   │ OPERATOR ACTUAL │ REMARKS       │
├──────────────────┼────────────────┼─────────────────┼─────────────────┼───────────────┤
│ 68–69 %          │ 69 %           │ ±1 %            │ —               │ Hopper wetting│
│ 2h               │ 2h             │ ±30m            │ —               │ Bunker load   │
│ required photo   │ 2 photos       │ photo/video     │ —               │ Before/after  │
└──────────────────┴────────────────┴─────────────────┴─────────────────┴───────────────┘
```

Do not collapse these into one value.

The Admin sets the plan.

The Operator later records reality.

The Lab records structured quality measurements.

Management compares all of them.

---

# 16. Operator UI

The Operator must not see the entire control tower.

Operator needs:

```text
MY WORK
  ↓
CURRENT BATCH
  ↓
CURRENT TASK
  ↓
EXECUTE
  ↓
EVIDENCE
  ↓
SUBMIT
```

The screen should show:

- current task
- target
- actual entry fields
- duration
- machine
- location
- evidence requirements
- progress
- blocked reason
- next task only when available

Example:

```text
MB-118
Day 1 · Hopper Pass

WATER PASS

Target moisture
68–69%

Actual moisture
[ 71.4 ] %

EVIDENCE
Before photo   ✓
After photo    ○

[ Take photo ]

1 / 2 complete

[ Submit ]  ← disabled
```

After the second photo:

```text
2 / 2 complete ✓

[ SUBMIT ]
```

---

# 17. Operator Batch Overview

The operator should see only relevant active work.

Example:

```text
MY WORK

NOW
┌─────────────────────────────┐
│ MB-118                       │
│ Day 5 · Bunker Reload        │
│ Bunker 3 → Bunker 7          │
│ Evidence 1/2                 │
│ [ Continue ]                 │
└─────────────────────────────┘

NEXT
MB-121 · Paddy Soak 2

WAITING
MB-109 · Resting · 7h 20m left
```

The operator should not need to understand the complete graph.

---

# 18. Lab Technician UI

Lab is a first-class operational subsystem.

The lab document defines a batch-centric queue with multiple concurrent batches, each potentially at a different stage. The technician can submit one batch and immediately move to another without waiting for management approval.

Lab Queue should show:

```text
LAB QUEUE

URGENT
MB-118
Day 7 · Paddy Soak 3
pH · EC · TDS
[ DO TEST ]

READY
MB-121
Day 1 · Hopper 1
Moisture · pH · EC
[ DO TEST ]

PENDING DECISION
MB-109
Day 12 · Reload
Submitted 10:42
[ VIEW ]
```

Batch detail should dynamically show only the tests required for the current activity.

### Numeric fields

Examples:

- moisture
- pH
- EC
- TDS
- dry weight
- nitrogen
- ash
- C:N
- bunker height
- tunnel height
- shrunken height

### Observational fields

Examples:

- smell
- colour
- spring/squeeze
- actinomycetes

Do not force observations into numeric inputs.

### Evidence

Photo evidence must be visible in the activity flow.

The technician should be able to submit and move to another batch immediately.

---

# 19. Supervisor UI

Supervisor is the operational control layer.

Supervisor sees:

- batches needing review
- deviations
- evidence gaps
- lab failures
- waiting gates
- operational release/hold/return actions

Control Room should be ordered by **urgency**, not alphabetically or by batch name.

Example:

```text
SUPERVISOR CONTROL ROOM

NEEDS YOU

1. MB-118
   Hopper 2 deviation
   waiting 1h 34m
   [ Review ]

2. MB-121
   Rest complete
   release pending
   [ Review ]

3. MB-109
   Evidence missing
   [ Review ]
```

Supervisor actions:

```text
RELEASE
HOLD
RETURN
ACCEPT WITH DEVIATION
```

The underlying decision must include actor, timestamp, and reason.

---

# 20. Manager UI

The Manager role is responsible for resource planning if enabled by the factory.

Manager view should focus on:

- bunkers
- tunnels
- machines
- vehicles
- people
- resource conflicts
- availability windows
- allocation

Do not turn this into another GM dashboard.

The Manager answers:

> Can the factory physically execute this plan with the resources available?

---

# 21. Calendar / Concurrent Batches

The factory runs concurrent Master Batches.

The calendar screen is therefore a **factory concurrency view**, not the process timeline of a single batch.

Clicking a calendar date should show:

```text
22 AUG 2026

12 ACTIVE MASTER BATCHES

MB-097   Day 22 · Tunnel unload
MB-100   Day 20 · Tunnel process
MB-103   Day 18 · Tunnel process
MB-106   Day 16 · Tunnel loading
MB-109   Day 14 · Rest
MB-112   Day 12 · Reload
...
```

Each entry should show:

- batch ID
- batch day
- batch hour
- current activity
- evidence completeness
- quality status
- decision / exception state

Do not use this calendar axis to derive batch days. It is the factory-calendar view.

---

# 22. Evidence Design

Evidence is not decoration.

It is proof.

Every activity may have named evidence requirements:

```text
Before photo
After photo
Video
Machine photo
Named material-mix photo
Instrument evidence
```

A task may say:

```text
Evidence

Before photo     ✓
After photo      ○
AS hand-mix photo ✓

2 / 3 complete
```

The requirement itself is part of the activity model.

Do not reduce evidence to `required_photo_count`.

Management sees the actual media.

---

# 23. Resource / Machine Visualization

Machines and locations are first-class resources.

The management layer should be able to answer:

- Which machine was used?
- For how long?
- Where?
- On which batch?
- What overlap/conflict occurred?

Example:

```text
MACHINE UTILISATION

JCB-02      14h 32m
TURNER-03   22h 10m
HOPPER-01    9h 18m
ROTAVATOR    6h 04m
```

Machine hours must be derived from activity timestamps.

Do not create an editable “machine hours” field.

For physical movement:

```text
Bunker 3
   ↓
Hopper
   ↓
Bunker 7
   ↓
Bunker 9
   ↓
Tunnel 2
```

Show source and destination explicitly.

---

# 24. Conflicts and Unknowns

The system contains unresolved factory conflicts.

The UI must not silently choose a side.

When a disputed value appears, show the conflict ID and a concise explanation.

Example:

```text
Moisture 71.4 %

⚠ C-01
Sources disagree:
68–69 % vs 75–78 %

System did not invent a pass/fail judgement.
```

This is a **trust feature**, not a defect.

The frontend must be capable of displaying:

```text
CONFLICT
TBD
SOURCE UNKNOWN
NO SPEC
```

without looking broken.

---

# 25. Loading / Empty / Error States

Every production screen must have a designed state for:

- loading
- no data
- partial data
- blocked data
- conflict
- permission denied
- server error
- offline / reconnecting

Examples:

```text
LAB SAMPLES
No sample is waiting for this activity yet.
The Hopper submission will create one automatically.
```

```text
EVIDENCE
No image has been uploaded yet.
```

Never use fake cards to make the screen “look full.”

---

# 26. Mobile Design Rules

Operator/Lab/Supervisor surfaces must work cleanly at 375px width.

Rules:

- touch-first
- no tiny buttons
- one primary action per screen
- camera/evidence capture close to the relevant field
- avoid dense tables on mobile
- long forms should be segmented
- use sticky action area where appropriate
- maintain readable units beside numbers

The mobile user should never need to pinch-zoom.

---

# 27. Desktop Design Rules

Management screens should be designed for:

- 1280px minimum practical width
- widescreen monitors
- dense but legible information
- split panels
- timeline/graph side-by-side relationships
- persistent context

The control tower should make sense at a glance on a large monitor mounted in an office.

---

# 28. Animation Rules

Animation is functional, not decorative.

Use animation to communicate:

- movement of the playhead
- transition of process state
- change in current physical location
- activation of a resource
- arrival of a new evidence item
- completion of a gate

Do not use:

- particle flows
- spinning machinery illustrations
- decorative infinite animations
- glowing animated edges
- excessive motion

Always respect reduced-motion preferences.

---

# 29. Frontend Architecture

Keep a clear separation between:

```text
DOMAIN TYPES
      ↓
API / DATA ADAPTERS
      ↓
VIEW MODELS
      ↓
UI COMPONENTS
      ↓
ROUTES
```

The UI must never contain the authoritative workflow logic.

The backend/state engine decides whether an activity is:

- locked
- ready
- in progress
- waiting
- blocked
- complete

The UI renders that state.

---

# 30. Suggested React Component Tree

```text
src/
├── components/
│   ├── control-tower/
│   │   ├── FactoryControlTower.tsx
│   │   ├── StaircaseCalendar.tsx
│   │   ├── ExceptionBand.tsx
│   │   └── ConcurrentBatchRow.tsx
│   ├── batch/
│   │   ├── BatchHeader.tsx
│   │   ├── BatchHourRail.tsx
│   │   ├── BatchNarrative.tsx
│   │   ├── BatchEventStream.tsx
│   │   ├── BatchStatus.tsx
│   │   └── BatchForecast.tsx
│   ├── process-graph/
│   │   ├── ProductionGraph.tsx
│   │   ├── StreamLane.tsx
│   │   ├── ProcessNode.tsx
│   │   └── ResourceNode.tsx
│   ├── evidence/
│   │   ├── EvidencePanel.tsx
│   │   ├── EvidenceGallery.tsx
│   │   └── EvidenceRequirement.tsx
│   ├── lab/
│   │   ├── LabQueue.tsx
│   │   ├── LabSample.tsx
│   │   ├── MeasurementField.tsx
│   │   └── ObservationField.tsx
│   ├── operator/
│   │   ├── MyWork.tsx
│   │   ├── CurrentTask.tsx
│   │   ├── TaskExecution.tsx
│   │   └── CameraEvidence.tsx
│   ├── supervisor/
│   │   ├── ControlRoom.tsx
│   │   ├── DeviationCard.tsx
│   │   └── ReleaseDecision.tsx
│   └── shared/
│       ├── FiveLayerNode.tsx
│       ├── TimeLabel.tsx
│       ├── HumanDuration.tsx
│       ├── StatusBadge.tsx
│       ├── EmptyState.tsx
│       └── ConflictNotice.tsx
│
└── routes/
    ├── gm/
    ├── admin/
    ├── operator/
    ├── lab/
    ├── supervisor/
    └── manager/
```

Extend existing components where practical rather than rewriting the whole current app.

---

# 31. Data Contracts the Frontend Needs

## Batch timeline

```ts
{
  batchId: string
  startAt: string
  baselineHours: number
  currentHour: number
  currentDay: number
  forecastEndAt?: string
  varianceMinutes: number
  activities: ActivitySegment[]
}
```

## Activity segment

```ts
{
  id: string
  scope: string
  label: string
  plannedStartAt?: string
  plannedEndAt?: string
  actualStartAt?: string
  actualEndAt?: string
  state: ActivityState
  responsibleRole: string
  assignedPerson?: string
  machine?: string
  sourceLocation?: string
  destinationLocation?: string
  evidence: EvidenceSummary
  lab?: LabSummary
  deviation?: DeviationSummary
}
```

These are view contracts, not authoritative business logic.

---

# 32. What Must Never Happen in the UI

1. Do not fabricate a lab result.
2. Do not fabricate a photo.
3. Do not fabricate a deviation.
4. Do not fabricate a machine-hour total.
5. Do not invent an acceptance threshold.
6. Do not turn a TBD into a pass/fail rule.
7. Do not calculate process state in React.
8. Do not bypass server-side gates.
9. Do not invent a workflow activity to fill an empty screen.
10. Do not hard-code the factory process into components.
11. Do not reproduce the legacy APK's old stage navigation.
12. Do not create a second auth or backend system.

---

# 33. Legacy APK Position

The old APK is **reference-only**.

Use it for:

- existing mobile visual familiarity
- evidence interaction ideas
- operator ergonomics
- stage/task presentation where useful

Do not:

- reuse its localStorage authority
- create a second authentication system
- create a second workflow engine
- create a second evidence backend
- fork the product architecture around it

The new product uses the new React/Supabase system as the authoritative application.

---

# 34. Frontend Implementation Order

Build in this order:

## Step 1 — Shared primitives

- TimeLabel
- HumanDuration
- FiveLayerNode
- StatusBadge
- ConflictNotice
- PlayheadContext

## Step 2 — Control Tower

- StaircaseCalendar
- ExceptionBand
- concurrent batch rows

## Step 3 — Batch Detail

- BatchHeader
- HourRail
- ProductionGraph
- EventStream
- shared playhead

## Step 4 — Evidence Panel

Start with real empty state if backend evidence media is not ready.
Connect actual media when the backend lands.

## Step 5 — Narrative

Pure function over structured data.

## Step 6 — Admin

- Today
- Schedule
- Batch Creation
- Validation
- Activation

## Step 7 — Operator

- My Work
- Current Task
- Execution
- Evidence

## Step 8 — Lab

- Queue
- Batch detail
- Measurement entry
- Observation entry

## Step 9 — Supervisor

- Control Room
- Deviations
- Release/Hold/Return

## Step 10 — Manager

- Resource allocation
- occupancy
- machine availability

---

# 35. Frontend Acceptance Criteria

The frontend is not complete until all of these are true.

### Control Tower

- [ ] Factory staircase visible.
- [ ] Rows sorted by start time.
- [ ] One global `now` line.
- [ ] Exceptions appear above the staircase.
- [ ] Calendar axis uses factory dates.
- [ ] Clicking a bar opens the batch at the selected hour.

### Batch Rail

- [ ] Batch hour shown with wall clock.
- [ ] Day number and 552 baseline shown together.
- [ ] Plan and actual rails are distinct.
- [ ] Forecast is visually distinct from fact.
- [ ] Rest segments visible and calm.
- [ ] Parallel streams rendered as lanes.
- [ ] Playhead controls graph + event stream + panel.

### Evidence

- [ ] Real images shown when available.
- [ ] Empty state when absent.
- [ ] Named evidence requirements visible.
- [ ] Uploader/timestamp available.

### Narrative

- [ ] Generated, not typed.
- [ ] Names people.
- [ ] Names machines.
- [ ] Names cause of variance.
- [ ] Quotes decision reasons.
- [ ] Surfaces conflict IDs when applicable.

### Operator

- [ ] One current task is obvious.
- [ ] Actual entry fields are clear.
- [ ] Evidence requirements visible.
- [ ] Submit state is trustworthy.
- [ ] Blocked reason is visible.

### Lab

- [ ] Multiple batches visible.
- [ ] Current required checkpoint clear.
- [ ] Numeric vs observation inputs distinct.
- [ ] Evidence integrated with tests.
- [ ] Submission does not block unrelated batches.

### Supervisor

- [ ] Urgent items sorted first.
- [ ] Deviation visible.
- [ ] Release/Hold/Return actions clear.
- [ ] Decision requires reason where configured.

### Overall

- [ ] 375px mobile works.
- [ ] Desktop widescreen works.
- [ ] Dark/light themes complete if supported by the existing design system.
- [ ] No lorem ipsum.
- [ ] No fake data presented as real.
- [ ] No raw internal activity codes in primary management UI.
- [ ] No decorative dashboard clutter.

---

# 36. Relationship to Backend Work

Frontend may proceed against typed interfaces while backend work is underway.

However:

- no fake state transitions
- no fake workflow logic
- no hard-coded lab results
- no fake evidence counts pretending to be database results
- no invented timestamps
- no invented machines
- no invented decisions

When a backend capability is missing, render a designed empty/disabled state and document the dependency.

The frontend should be ready to connect immediately when Kiro lands:

- K0 migration repair
- K1 hour axis
- K2 gate engine
- K3 evidence storage
- K4 deviation/supervisor
- K5 resources
- K6 event log
- K7 lab

---

# 37. Final Product Definition

MushroomOS should feel like this:

```text
                OWNER / GM
                    │
                    ▼
          ┌─────────────────────┐
          │ FACTORY CONTROL     │
          │ TOWER               │
          │                     │
          │ Is factory alright? │
          └─────────┬───────────┘
                    │
                    ▼
          ┌─────────────────────┐
          │ MASTER BATCH        │
          │ H0 → H552           │
          │                     │
          │ Where is it?        │
          │ Is it late?         │
          └─────────┬───────────┘
                    │
            ┌───────┼────────┐
            ▼       ▼        ▼
          GRAPH    RAIL     EVENTS
            │       │        │
            └───────┼────────┘
                    ▼
          ┌─────────────────────┐
          │ EVIDENCE / PANEL    │
          │                     │
          │ Why?                │
          │ Who?                │
          │ Which machine?      │
          │ Which measurement?  │
          │ Who allowed it?     │
          └─────────────────────┘
```

The operator and lab technician create the trusted record.

The supervisor controls operational progression.

The GM sees the factory story.

The owner can question the process with evidence.

That is the product Manus is building.
