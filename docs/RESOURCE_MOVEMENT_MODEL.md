# RESOURCE MOVEMENT MODEL

**[DICTATED]** *"Bunkers are not static labels. They are physical resources that batches move
through."* · *"This is one of the most important visualizations in the management interface."*

Companion to `PROCESS_V2_FACTORY_CONFIRMED.md`. Defines how material location is modelled,
constrained, and drawn.

---

## 1. The core idea

Every unit of material in a master batch is, at every moment, **somewhere**. That somewhere is
a `location`. Every activity that moves material records a **source location** and a
**destination location**. The chain of those records is the batch's physical history — and it
is the thing the paper system loses.

```
BUNKER 03 ──unload──► HOPPER ──reload──► BUNKER 07 ──unload──► YARD (PILE-1, PILE-2)
                                                                    │
                                                                    ├─ +N-MIX
                                                                    ├─ FLIP ×2
                                                                    └─ HOPPER ──► MIXED-PILE
                                                                                     │
PADDY ──soak──► BUNKER P ──────────────────────────► YARD (PADDY-PILE-1, PADDY-PILE-2)
                                                                                     │
                                                                    T0 → T1 → T2 ────┤
                                                                                     ▼
                                              BUNKER 3 ─┐
                                              BUNKER 5 ─┼── reload ──► BUNKER 8/9/10 ──► TUNNELS 1,2,3
                                              BUNKER 8 ─┘
```

---

## 2. Location kinds

```
location
  id, kind, code, label, capacity_mt, status, is_persistent

kind ∈ {
  BUNKER          -- numbered, persistent, exclusive          (Bunker 1..11)
  TUNNEL          -- numbered, persistent, exclusive          (Tunnel 1..12)
  YARD            -- the platform; a container for piles      (Yard-A)
  PILE            -- transient, created and destroyed         (PILE-1, MIXED-PILE)
  PADDY_PILE      -- transient                                (PADDY-PILE-1)
  SOAK_PIT        -- persistent, exclusive                    (Lagoon-1)
  HOPPER          -- pass-through, not an occupancy           (Hopper-01)
  GROWING_ROOM    -- persistent, exclusive, out of demo scope
  EXTERNAL        -- supplier / vehicle / off-site
}
```

**[DICTATED]** Paddy is stored in a bunker. **Bunkers therefore serve two streams and a paddy
occupancy blocks a compost occupancy exactly the same way.**

**Transient locations.** Piles are created by an activity and destroyed by another:
- `BG-YARD-UNLOAD` creates `PILE-1`, `PILE-2`
- `YD-HOP-COMBINE` consumes both and creates `MIXED-PILE`
- `PD-YARD-LOAD` creates `PADDY-PILE-1`, `PADDY-PILE-2`
- `P1-BUNK-LOAD` consumes the piles

Pile count is **never** hard-coded — it comes from Day-0 configuration.

**Hopper is not an occupancy.** Material passes through it; it is a *machine*, tracked in
`MACHINE_UTILIZATION_MODEL.md`, not a location that holds a batch.

---

## 3. Occupancy

```sql
location_occupancy
  id
  location_id
  master_batch_id
  scope           -- BUNKER_LINE | PILE | PADDY_PILE | TUNNEL | INDIVIDUAL_BATCH
  scope_id
  stream          -- BAGASSE | PADDY | MANURE_MINERAL | YARD | BUNKER | TUNNEL
  material_state  -- raw_bagasse | conditioned_bagasse | soaked_paddy | n_mix
                  -- | mixed_compost | phase1_compost | phase2_compost
  occupied_from   timestamptz  NOT NULL
  occupied_to     timestamptz  NULL         -- NULL = still occupied
  planned_from, planned_to                  -- from the Day-0 movement plan
  quantity_mt
  entered_by_activity_id
  exited_by_activity_id
```

### 3.1 Exclusivity is enforced in the database

```sql
ALTER TABLE location_occupancy ADD CONSTRAINT no_double_occupancy
  EXCLUDE USING gist (
    location_id WITH =,
    tstzrange(occupied_from, COALESCE(occupied_to, 'infinity'), '[)') WITH &&
  )
  WHERE (location_id IN (SELECT id FROM location
                         WHERE kind IN ('BUNKER','TUNNEL','SOAK_PIT','GROWING_ROOM')));
```

**[DICTATED]** *"Therefore another batch cannot silently use Bunker 3 in the same window."*

Transient locations (`PILE`, `PADDY_PILE`) are excluded — they belong to exactly one batch by
construction.

### 3.2 Reservation vs occupancy

| | Created at | Enforced | Becomes |
|---|---|---|---|
| **Reservation** | Day-0 configuration | soft — conflicts warn | occupancy at activation |
| **Occupancy** | batch activation, then updated on each move | **hard — exclusion constraint** | closed when material leaves |

Conflict detection at Day-0 compares proposed reservations against every existing occupancy
**and** every other batch's reservations.

---

## 4. Movement records

Every material-moving activity writes one movement row. This is the append-only physical
ledger.

```sql
material_movement
  id
  master_batch_id
  activity_id                 -- the activity that performed the move
  moved_at
  source_location_id          -- NULL for receipt from EXTERNAL
  destination_location_id     -- NULL for consumption / dispatch
  via_machine_ids[]           -- e.g. {Hopper-01} for an unload→hopper→reload
  quantity_mt_planned
  quantity_mt_actual
  material_state_before
  material_state_after
  operator_id
  evidence_ids[]
```

### 4.1 The movement plan is part of the Day-0 baseline

**[DICTATED §39-D]** Day-0 configures a **Movement Plan**: `SOURCE · DESTINATION · WHEN ·
QUANTITY`. Frozen at activation like every other baseline column. Actual movements produce
variance against it.

| Activity | Source | Destination | Planned | Actual |
|---|---|---|---|---|
| `BG-BUNK-LOAD` | Yard | **Bunker 3** | D1 14:00 | D1 14:20 |
| `BG-BUNK-RELOAD` | Bunker 3 | **Bunker 7** | D4 09:00 | D4 11:15 |
| `BG-YARD-UNLOAD` | Bunker 7 | Yard → PILE-1, PILE-2 | D7 06:00 | — |
| `P1-BUNK-LOAD` (line 1) | MIXED-PILE | **Bunker 3** | D8 18:00 | — |
| `P1-BUNK-RELOAD` (line 1) | Bunker 3 | **Bunker 8** | D12 06:00 | — |
| `TN-LOAD` (batch 1) | Bunker 8 | **Tunnel 1** | D15 07:00 | — |

### 4.2 The different-vessel rule

**[DICTATED]** *"SOURCE BUNKER ≠ DESTINATION BUNKER unless the process configuration
explicitly allows it."*

Modelled as a per-activity flag on the process definition, not a global rule:

```
route_activity.movement_rule = {
  requires_distinct_vessel: true,
  allow_same_vessel_override: false,     -- if true, override needs a reason + deviation
  source_kind: 'BUNKER',
  destination_kind: 'BUNKER'
}
```

Violation → operator can still record it (reality is reality) → deviation raised → downstream
gate blocked pending supervisor decision. Same principle as every other out-of-spec value.

---

## 5. Required visualisations

### 5.1 Batch movement graph — the management centrepiece

**[DICTATED §46]** Must be readable at a glance.

```
MASTER BATCH 20-SEP-2026
│
├── BAGASSE ─────────────────────────────────────────────────┐
│     Bunker 03  ▓▓▓▓▓▓  D1 14:20 → D4 09:40                 │
│         ↓ unload · hopper · reload                          │
│     Bunker 07  ▓▓▓▓▓▓▓▓▓  D4 11:15 → D7 06:00              │
│         ↓ unload to yard                                    │
│     PILE-1  PILE-2 ──────────► MIXED-PILE ─────────────────┤
│                                                             │
├── PADDY ────────────────────────────────────────────────────┤
│     soak 1 → Bunker P4 ▓▓▓▓ → soak 2 → soak 3 → rest        │
│         ↓                                                   │
│     PADDY-PILE-1   PADDY-PILE-2 ───────────────────────────┤
│                                                             │
├── MANURE + MINERALS ────────────────────────────────────────┤
│     weighment → Rotavator-01 → N-MIX ──────────────────────┘
│                                                             │
│                          T0 → [T1→T2 × 3 piles]
│                                    ↓
├── BUNKERS ──  Bunker 3 ─┐
│               Bunker 5 ─┼─ reload ─► Bunker 8 / 9 / 10 ─┐
│               Bunker 8 ─┘                                │
│                                                          ▼
└── TUNNELS ────────────────────── Tunnel 1 · Tunnel 2 · Tunnel 3
                                        ↓
                                   UNLOAD · D22
```

Rendering rules:
- **One column per stream.** Bagasse, Paddy, Manure+Minerals, Yard, Bunker, Tunnel.
- **Occupancy bars carry real time.** Bar length = actual duration; a ghost bar behind it = planned.
- **Transfers are arrows with a label** naming the machine used (`unload · hopper · reload`).
- **Current position pulses.** One clear "the batch is here right now" marker per stream.
- **Colour = material state**, not decoration. Raw bagasse → conditioned → mixed → phase-1 → phase-2 is a legible progression.

### 5.2 Bunker swap detail — required by the dictation

**[DICTATED]** *"bunkers are changed everytime, we need proper sleek visuals which show how
bunkers are switched."*

At each reload, an explicit transfer card:

```
┌─────────────────────────────────────────────────────────┐
│  RELOAD · Day 12 · Line 1                               │
│                                                          │
│    BUNKER 03            ──►            BUNKER 08         │
│    occupied 96 h                       empty since D9    │
│    out 06:12                           in 09:40          │
│                                                          │
│    via  JCB-02 · 3 h 28 min      plan 9 h → actual 3 h 28│
│    qty  46.2 MT                  📷 before  📷 after      │
└─────────────────────────────────────────────────────────┘
```

### 5.3 Yard spatial layout

**[DICTATED]** The mixed pile sits in the middle, paddy piles beside it. Draw it as a plan
view, not a list — the layout is operationally meaningful.

```
        ┌──────────────┐
        │ PADDY-PILE-1 │   soaked paddy · 18.4 MT · placed D7 15:20
        └──────────────┘
   ┌────────────────────────┐
   │      MIXED PILE        │   bagasse + N-mix · 34.1 MT · hopper D7 12:00
   │   T1 ✓   T2 in progress│
   └────────────────────────┘
        ┌──────────────┐
        │ PADDY-PILE-2 │
        └──────────────┘
```

Pile count and arrangement come from Day-0 configuration.

### 5.4 Vessel timeline — the Manager's view

Gantt across all bunkers and tunnels, all batches, 21-day window. Conflicts drawn as
overlapping bars in `--crit`. Paddy occupancy visually distinct from compost occupancy but
equally blocking.

---

## 6. Queries the model must answer cheaply

| Question | Answer from |
|---|---|
| Where is master batch X right now? | open `location_occupancy` rows |
| What is in Bunker 7, and until when? | `location_occupancy` by location |
| Which bunkers are free on 30 Sep? | occupancy + reservations |
| What is the full physical history of this batch? | `material_movement` ordered by `moved_at` |
| Did any reload violate the distinct-vessel rule? | movements where source = destination |
| How long did material actually sit in each bunker? | `occupied_to − occupied_from`, vs planned |
| Which batch is blocking Bunker 5? | occupancy → master batch |

---

## 7. Conflicts and open questions

**[TBD-27]** Does the yard have named, finite bays, or is it unbounded space? If bays are
finite, `YARD` becomes an exclusive location and pile placement becomes a schedulable resource.

**[TBD-28]** How many bunkers does paddy occupy, and for how long? The dictation says paddy is
stored in *a* bunker during soaking. If paddy holds a bunker for Days 5–7, the effective
bunker pool for compost shrinks by one per batch — which materially changes conflict detection.

**[TBD-29]** During `BG-UNLOAD → BG-HOP-3 → BG-BUNK-RELOAD`, is the source bunker released at
the start of the unload or at the end of the reload? Over ~5 hours with ~11 bunkers and ~10
concurrent batches this is not academic.

**[CONFLICT C-30]** The historical movement log records **one bunker per line per stint**, but
also shows a real case of a single line reloading into **two** bunkers on the same day. The
model supports a list; the dictation implies a single destination. Not reconciled.
