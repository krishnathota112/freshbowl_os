# MACHINE UTILIZATION MODEL

**[DICTATED §34]** *"THIS IS A FIRST-CLASS REQUIREMENT."* ·
*"i need to keep a track of what machineary i have used and how much time i have used it for"*

The management view must eventually answer: **how much machine time did this batch consume?**

---

## 1. Why this is not a field on an activity

A machine is a **contended, schedulable, meterable resource**, exactly like a bunker:

- Two turners exist and are **both needed simultaneously** — `TR-T1` runs on one turner while
  `TR-T2` runs on another, per pile (`PROCESS_V2 §9.4`). A single `machine` string on an
  activity cannot express that.
- The hopper is used at least **four times** in one batch (D1 ×2, D4 ×1, D7 ×1) and is shared
  across ~10 concurrent batches.
- The answer to "how many hours did Turner-02 work this batch" has to survive an activity
  being re-run, returned, or superseded.

So: machines get their own usage ledger, and utilisation is derived from it — never typed.

---

## 2. Entities

```sql
machine
  id, code, name, kind, status, location_hint,
  capacity_note, fuel_type, meters_fuel(bool), meters_hours(bool)

kind ∈ { LOADER_JCB, TURNER, HOPPER, ROTAVATOR, CONVEYOR, VEHICLE_TRUCK,
         WINCH, AHU_FAN, WEIGHBRIDGE, OTHER }
```

Machine fleet named in the walkthrough:

| Code | Kind | Used at |
|---|---|---|
| `JCB-01`, `JCB-02` | LOADER_JCB | weighment loads, bunker load/unload/reload, yard, paddy, tunnel |
| `TURNER-01`, `TURNER-02` | TURNER | yard flips, T0, **T1 and T2 concurrently** |
| `HOPPER-01` | HOPPER | `BG-HOP-1`, `BG-HOP-2`, `BG-HOP-3`, `YD-HOP-COMBINE` |
| `ROTAVATOR-01` | ROTAVATOR | `NM-ROTAVATE` |
| `TRUCK-04` … | VEHICLE_TRUCK | bagasse weighment loads, paddy delivery |
| `CONVEYOR-01` | CONVEYOR | tunnel load / unload |

```sql
machine_usage                 -- the ledger; one row per machine per activity stint
  id
  machine_id
  master_batch_id
  activity_id
  scope, scope_id             -- LOAD | PILE | BUNKER_LINE | TUNNEL | MASTER
  operator_id                 -- the person operating THIS machine on THIS stint
  started_at, ended_at
  duration_minutes            -- GENERATED, from the timestamps
  location_id                 -- where the work happened
  fuel_qty, fuel_unit         -- optional
  meter_start, meter_end      -- optional hour-meter reading
  notes
  superseded_by_id            -- if the activity was re-run
```

**[DICTATED §34]** Required fields — machine, machine ID, operator, start, end, duration,
batch, activity, location, optional fuel/energy. All present above.

### 2.1 Duration is derived, never entered

```sql
duration_minutes integer GENERATED ALWAYS AS
  (EXTRACT(EPOCH FROM (ended_at - started_at)) / 60)::int STORED
```

An operator records start and end. The system computes duration. There is no editable
"hours used" field anywhere.

### 2.2 One activity can use several machines

`BG-WEIGH` load 01 uses **`TRUCK-04` and `JCB-02`**. `BG-UNLOAD → BG-HOP-3 → BG-BUNK-RELOAD`
uses `JCB-02` and `HOPPER-01`. So `machine_usage` is many-per-activity, and the activity's
`equipment` field is a *requirement* (what the plan says is needed), while `machine_usage` is
the *record* (what was actually used, by whom, for how long).

---

## 3. Machine contention

Machines are exclusive for the duration of a stint, like bunkers:

```sql
ALTER TABLE machine_usage ADD CONSTRAINT no_machine_double_booking
  EXCLUDE USING gist (
    machine_id WITH =,
    tstzrange(started_at, COALESCE(ended_at, 'infinity'), '[)') WITH &&
  );
```

This is what makes the `T1 → T2` parallelism *provably* correct rather than aspirational: if
the Day-0 resource plan assigns `TURNER-01` to both T1 and T2, the conflict surfaces at
configuration time, not on Day 8 in the yard.

### 3.1 Day-0 resource plan

**[DICTATED §39-C]** Day-0 configures `MACHINE · BUNKER · TUNNEL · VEHICLE · OPERATOR ·
EXPECTED DURATION` per activity.

```
Activity            Machine        Operator   Expected   Conflict
─────────────────────────────────────────────────────────────────
TR-T1  · pile 1     TURNER-01      Ravi       6–8 h      —
TR-T2  · pile 1     TURNER-02      Suresh     6–8 h      —
TR-T1  · pile 2     TURNER-01      Ravi       6–8 h      queued behind pile 1
TR-T2  · pile 2     TURNER-02      Suresh     6–8 h      —
YD-HOP-COMBINE      HOPPER-01      Kiran      3 h        ⚠ HOPPER-01 also
                                                            booked D7 by MB 20-SEP-B
```

---

## 4. Utilisation views

### 4.1 Per master batch — the required summary

**[DICTATED §34]** Exactly this shape:

```
MACHINE UTILIZATION · MB 20-SEP-2026

JCB-01          14.5 h   ████████████░░░░░░░░   23 stints
TURNER-02       22.0 h   ██████████████████░░   11 stints
HOPPER-01        9.3 h   ████████░░░░░░░░░░░░    4 stints
ROTAVATOR-01     6.2 h   █████░░░░░░░░░░░░░░░    1 stint
VEHICLE-04       4.5 h   ████░░░░░░░░░░░░░░░░   11 loads
                ───────
TOTAL           56.5 h
```

Derived purely from `machine_usage`:

```sql
SELECT m.code, SUM(u.duration_minutes)/60.0 AS hours, COUNT(*) AS stints
FROM machine_usage u JOIN machine m ON m.id = u.machine_id
WHERE u.master_batch_id = $1 AND u.superseded_by_id IS NULL
GROUP BY m.code ORDER BY hours DESC;
```

### 4.2 Plan vs actual per activity

**[DICTATED §40]** The plan is frozen; actual execution produces variance.

```
ACTIVITY                     MACHINE      PLAN     ACTUAL    VARIANCE
──────────────────────────────────────────────────────────────────────
BG-BUNK-LOAD                 JCB-02       2 h 00   2 h 47    +47 min  ⚠
YD-HOP-COMBINE               HOPPER-01    3 h 00   2 h 51     −9 min  ✓
TR-T1 · pile 1               TURNER-01    7 h 00   8 h 12    +72 min  ⚠
TR-T2 · pile 1               TURNER-02    7 h 00   6 h 40    −20 min  ✓
P1-BUNK-LOAD · bunker 3      JCB-01       3 h 00   3 h 05     +5 min  ✓
```

### 4.3 Factory-wide, across batches — Manager view

Daily machine load, so the Manager sees before Day-0 activation that the turner is
double-booked on Day 8:

```
        D6   D7   D8   D9   D10
JCB-01  ▓▓   ▓▓▓▓ ▓▓▓  ▓▓   ░
JCB-02  ▓▓▓  ▓▓   ▓▓▓▓ ▓▓▓  ░
TURNER-01    ▓▓▓▓ ▓▓▓▓▓▓▓▓  ░     ⚠ 3 batches want this on D8
TURNER-02    ▓▓   ▓▓▓▓▓▓▓▓  ░
HOPPER-01 ▓  ▓▓▓▓ ▓         ▓
```

---

## 5. How usage gets recorded

**[DICTATED §43]** *"The operator should never need to understand the whole graph."* So the
operator does **not** fill in a machine-usage form. They start and finish a task:

```
┌────────────────────────────────────────┐
│  P1-BUNK-LOAD · Bunker 3               │
│                                        │
│  MACHINE   JCB-01        [ change ]    │  ← pre-filled from the Day-0 resource plan
│                                        │
│  ▶ START                               │  → machine_usage row opens
│                                        │
│  … running 2 h 14 min                  │
│                                        │
│  ■ FINISH                              │  → machine_usage row closes, duration computed
└────────────────────────────────────────┘
```

Rules:
- Machine is **pre-filled from the Day-0 plan**; changing it requires selecting from the
  available fleet and is recorded as a plan deviation.
- Start/finish are **server timestamps**, never device clock.
- An activity cannot reach `SUBMITTED` with an open (`ended_at IS NULL`) machine stint.
- If an operator forgets to finish, the stint is flagged `open > expected × 2` and appears in
  the Supervisor's Control Room, because an unclosed stint silently inflates utilisation.

---

## 6. Operator ↔ machine

`machine_usage.operator_id` is the person operating **that machine on that stint** — which is
not necessarily the person who owns the activity. On `BG-WEIGH` load 01 the truck driver and
the JCB operator are two different people on one load.

This gives, without extra data entry:
- hours per operator per machine, per batch
- who was operating when a deviation was raised
- certification checks — only certified operators may be assigned a turner

**[TBD-30]** Do machine operators need a certification / licence record, and should the system
refuse an uncertified assignment or merely warn?

---

## 7. Open questions

**[TBD-31]** Is fuel actually recorded today? The dictation lists it as optional. If it is
recorded, at what granularity — per stint, per day, per machine?

**[TBD-32]** Do machines have hour meters that are read, or is duration purely start/stop in
the app? Meter readings would let us reconcile app-recorded hours against the machine's own
count, which is a strong data-quality signal.

**[TBD-33]** How many turners, JCBs and hoppers actually exist? The `T1 → T2` parallelism
requires **at least two turners**. The demo seeds two; confirm the real fleet before
conflict detection is meaningful.
