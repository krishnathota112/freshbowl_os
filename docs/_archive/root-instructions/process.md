> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

Yes. You're right — that diagram is **far too compressed**. It loses the actual operating logic you have been explaining for hours.

I’ve gone back through everything you gave me in this conversation: the factory grid, live schedule, master-batch forms, phase-movement records, the three-pile clarification, the H0/H552 rules, operator/lab workflow, movement model, tunnel timing, the UI requirements, and the corrections you gave during the meeting.

The important thing is that we should **not invent missing hour positions just to make the diagram look complete**. Where the factory has given us a duration or dependency, we show it. Where the exact placement is still source-dependent, we leave the hour as generated data rather than pretending we know it.

Here is the much more complete story.

# MushroomOS — Canonical Factory Workflow Story

## 1. There are actually two clocks

The factory process has a **pre-H0 preparation period** and then the **552-hour controlled process**.

They must never be visually or logically confused.

```text
PRE-H0 PREPARATION
────────────────────────────────────────────────────────

Incoming material arrives
        │
        ▼
Incoming / pre-batch laboratory checking
        │
        ├── moisture
        ├── pH
        ├── dry weight
        └── other required intake parameters
        │
        ▼
Material decision / preparation requirement
        │
        ▼
Bagasse weighment
        │
        ├── load 01
        ├── load 02
        ├── load 03
        ├── ...
        └── final load
        │
        ├── actual quantity
        ├── weighment slip
        ├── operator
        ├── machine / vehicle
        └── server timestamp
        │
        ▼
ALL PRE-H0 REQUIREMENTS READY
        │
        ▼
H0
```

The important rule you gave me is:

> **Bagasse weighment happens before the H0 process clock.**

You also said the weighment is approximately **10 hours before the process start**. That should therefore be represented as a pre-H0 relationship, not as an H0 activity.

So, for example:

```text
PROCESS START
26 Aug 2026 · 18:00

H0 = 26 Aug · 18:00

PRE-H0 WEIGHMENT TARGET
≈ 10 hours before H0
≈ 26 Aug · 08:00
```

The exact pre-H0 anchor should be represented as data/configuration, not scattered hard-coded UI numbers.

---

# 2. Admin starts the actual production clock

Admin does **not** schedule every task manually.

Admin establishes the batch:

```text
Monthly schedule / batch identity
Material selections
Quantity
Individual batch structure
Known physical resources
H0 start date
H0 start time
Factory timezone
```

For example:

```text
MASTER BATCH
366 / 367 / 368

PRIMARY FIBRE
Punjab

STRUCTURAL STRAW
Local Paddy

PROCESS START
26 Aug 2026 · 18:00
```

The moment Admin confirms that:

```text
H0 = 26 Aug 2026 · 18:00
```

the system creates the actual factory clock.

---

# 3. H0 is not “Day 0 at midnight”

The batch clock is continuous.

```text
H0
H1
H2
H3
...
H23
H24
H25
...
H47
H48
...
H551
H552
```

With H0 at 18:00:

```text
H0    26 Aug · 18:00
H1    26 Aug · 19:00
H6    27 Aug · 00:00
H24   27 Aug · 18:00
H48   28 Aug · 18:00
H72   29 Aug · 18:00
...
H456  14 Sep · 18:00
...
H552  18 Sep · 18:00
```

The application must always calculate timestamps from:

```text
H0 + elapsed batch hours
```

not from:

```text
calendar date + Day number
```

Day 0, Day 1, Day 2, etc. are **human navigation labels**, not the timing engine.

---

# 4. The process itself has duration

A process does not simply exist at a point called “Day 8”.

It has a real start and end.

For example:

```text
H126 → H133
7 hours
```

or:

```text
H134 → H143
9 hours
```

If a process starts near the end of a human day and finishes after it:

```text
H142 → H149
```

it remains **one continuous activity**.

It is not split into:

```text
Day 5 activity
Day 6 activity
```

That is one of the biggest principles of MushroomOS.

---

# 5. Early process: fibre preparation and bunker work

The early part of the process consists of the factory's actual bagasse/fibre operations.

Conceptually:

```text
H0
 │
 ▼
Bagasse process
 │
 ▼
Wetting / Hopper Pass 1
 │
 ▼
Lab checkpoint
 │
 ▼
Hopper Pass 2
 │
 ▼
Bunker Loading
 │
 ▼
Conditioning / Rest
 │
 ▼
Unload / Reload
 │
 ▼
Paddy-related preparation
 │
 ▼
Soaking / storage / preparation
 │
 ▼
Yard / mixing operations
```

The exact H-hour positions come from the process definition, duration data, and later actual execution.

The system must **generate** these positions rather than making the Admin type 100 clock times.

---

# 6. Conditional work is real

A task can depend on a preceding result.

Your example is important:

```text
Hopper Pass 1
    ↓
Lab check
    ↓
Result / decision
    ↓
Hopper Pass 2
```

There can be different handling depending on the material result.

But the system must not invent unresolved thresholds.

The correct model is:

```text
LAB RESULT
    ↓
APPROVED FACTORY RULE / DECISION
    ↓
REQUIRED OPERATOR PATH
```

So when the factory has settled a rule, MushroomOS executes it.

When the factory hasn't settled it, MushroomOS should not fabricate it.

---

# 7. There is a separate physical material flow

The batch is not just a list of software activities.

Material physically moves:

```text
Weighment
   ↓
Hopper
   ↓
Bunker
   ↓
Unload / Reload
   ↓
Yard / pile preparation
   ↓
Bunker
   ↓
Tunnel
```

Therefore resources are part of the story:

```text
people
machines
vehicles
bunkers
turners
tunnels
locations
```

The system must record who/what was actually involved.

---

# 8. The important concurrency begins with three piles

This is where the workflow becomes much more interesting.

The Master Batch becomes:

```text
MASTER BATCH
   │
   ├────────────┐
   │            │
 PILE 1       PILE 2       PILE 3
```

Exactly **three piles** for this process model.

Not:

```text
Line 01
Line 02
Line 03
```

unless the factory separately establishes those as real resources.

---

# 9. Every pile has its own process chain

The chain is:

```text
T0
 ↓
REST
 ↓
T1
 ↓
REST
 ↓
T2
 ↓
BUNKER LOADING
```

And that chain exists independently for each pile.

### Pile 1

```text
PILE 1
  ↓
T0
  ↓
Rest
  ↓
T1
  ↓
Rest
  ↓
T2
  ↓
Bunker Loading
```

### Pile 2

```text
PILE 2
  ↓
T0
  ↓
Rest
  ↓
T1
  ↓
Rest
  ↓
T2
  ↓
Bunker Loading
```

### Pile 3

```text
PILE 3
  ↓
T0
  ↓
Rest
  ↓
T1
  ↓
Rest
  ↓
T2
  ↓
Bunker Loading
```

---

# 10. These three pile streams are concurrent

This is **not**:

```text
Pile 1 finishes everything
then Pile 2
then Pile 3
```

It is:

```text
                 TIME →

PILE 1     T0 ─── REST ─── T1 ─── REST ─── T2 ─── BUNKER

PILE 2          T0 ─── REST ─── T1 ─── REST ─── T2 ─── BUNKER

PILE 3              T0 ─── REST ─── T1 ─── REST ─── T2 ─── BUNKER
```

At any moment the state might be:

```text
PILE 1 → T2
PILE 2 → T1
PILE 3 → REST
```

and that is completely valid.

---

# 11. T0 takes real time

You clarified from the meeting:

```text
T0 ≈ 6–7 hours
```

So T0 is an actual duration-bearing activity.

It should appear on the hour rail as a span.

Not:

```text
T0 at H192
```

but:

```text
T0
H192 → H198/199
```

with the actual duration determined by the approved process configuration.

I am deliberately not choosing an exact 6 or 7 hours here because you told me the factory says approximately 6–7.

---

# 12. After T0 there is a rest

This is a genuine time gate.

```text
T0
 ↓
REST
 ↓
T1
```

The rest must be represented as time.

An operator does not “complete” the rest by pressing a button.

The system knows:

```text
rest started
rest duration / gate
rest eligible
T1 can start
```

---

# 13. After T1 there is another rest

This is the correction you just made and it is important.

It is:

```text
T0
 ↓
REST
 ↓
T1
 ↓
REST
 ↓
T2
```

Not:

```text
T0
 ↓
T1
 ↓
T2
```

That second rest must exist independently for each pile.

---

# 14. T2 is independently executable per pile

This is the operationally important part.

Suppose:

```text
PILE 1 → T2 complete
PILE 2 → T1 complete
PILE 3 → second REST
```

Then:

```text
PILE 1
   ↓
BUNKER LOADING
```

can start.

It does **not** wait for Pile 2 and Pile 3.

Therefore:

```text
PILE 1 ── T2 ──→ Bunker
PILE 2 ── T1 ──→ Rest ──→ T2
PILE 3 ── Rest ──→ T2
```

This is why MushroomOS needs a real dependency graph, not a global Day barrier.

---

# 15. The bunker movement happens as the pile becomes ready

The physical relationship is:

```text
PILE 1
  ↓
T2 complete
  ↓
Bunker Loading

PILE 2
  ↓
T2 complete
  ↓
Bunker Loading

PILE 3
  ↓
T2 complete
  ↓
Bunker Loading
```

Each movement has its own actual timestamp and resource assignment.

This is why **the UI should say Pile 1 / Pile 2 / Pile 3**, not “Line 1 / Line 2 / Line 3”.

---

# 16. Tunnel planning is a later decision

Another important clarification:

**Tunnel selection does not need to happen at H0.**

The factory wants the tunnel decision **by approximately Day 10 / H240 or earlier**.

Therefore the system should have a visible planning deadline:

```text
TUNNEL PLAN
Decision due by H240

366   Pending
367   Tunnel 8
368   Tunnel 6
```

When the decision is made:

```text
366 → Tunnel 10
367 → Tunnel 8
368 → Tunnel 6
```

The tunnel itself must also be checked for availability against the planned time window.

---

# 17. The Master Batch later becomes Individual Batches

The Master Batch carries the overall process.

Later the physical output is split into individual batches:

```text
MASTER BATCH
   │
   ├── 366
   ├── 367
   └── 368
```

Those individual batches are what eventually get tunnel destinations.

So:

```text
Piles
   ↓
physical movement
   ↓
Individual batches
   ↓
tunnel allocation
```

This distinction is important.

---

# 18. The tunnel stage continues under the same H0 clock

Once the individual batches have tunnel destinations:

```text
366 → Tunnel 10
367 → Tunnel 8
368 → Tunnel 6
```

the tunnel operations continue within the same:

```text
H0 → H552
```

clock.

The tunnel stage itself consists of the actual factory process durations, not arbitrary day-sized blocks.

---

# 19. The factory also needs accountability

Every meaningful execution step should eventually answer:

```text
WHO?
WHAT?
WHEN?
WHERE?
WITH WHAT?
WHAT WAS MEASURED?
WHAT PROVES IT?
```

For Operator:

```text
Ravi
H137
Hopper Pass 1
Hopper-01
Start: server timestamp
End: server timestamp
Photo
Actual reading
```

For Lab:

```text
Lab technician
H137
Checkpoint
Target specification
Actual result
Evidence
Submission time
```

For Supervisor:

```text
Deviation
Reason
Affected batch/activity
Evidence
Decision
Decision time
Decision maker
```

---

# 20. The Admin's actual job

This is one thing we should now be extremely strict about.

Admin does **not** operate the batch.

Admin:

```text
1. Select / upload monthly schedule
2. Create Master Batch
3. Choose materials
4. Define quantity
5. System calculates loads
6. Define Individual Batches
7. Plan physical movements/resources
8. Set H0
9. Review generated H0→H552 plan
10. Activate
```

Then the system takes over the operational timetable.

Admin may make an intentional plan adjustment later, but it must be explicit:

```text
STANDARD
H24 → H25

ADMIN PLAN
H27 → H28

REASON
JCB unavailable
```

Actual execution is never rewritten.

---

# 21. The operator's job

Operator does not choose the standard process.

Operator receives:

```text
WHAT DO I DO NOW?
```

The system selects the relevant task from the chosen batch using:

```text
current H
task window
state
dependencies
time gates
assignment
```

Then:

```text
Start
→ server timestamp
→ do work
→ capture readings
→ capture evidence
→ complete
```

---

# 22. The lab's job

Lab asks:

```text
WHAT IS DUE NOW?
```

The screen shows:

```text
Checkpoint
Batch
Current H
Target specification
Result fields
Evidence
Submit
```

Target and result remain visually separate.

---

# 23. Management's job

Management does not want 100 activity cards.

They want:

```text
WHERE IS THE BATCH?
WHAT'S HAPPENING NOW?
WHAT IS LATE?
WHAT IS AT RISK?
WHO DID IT?
WHAT PROVES IT?
WHAT DECISION IS NEEDED?
```

So the Control Tower should show:

```text
FACTORY NOW
      ↓
concurrent batches
      ↓
H0 → H552 staircase
      ↓
physical flow
      ↓
exceptions
      ↓
drill down
```

---

# 24. The UI should represent the process graph, not the database

This is the biggest UI lesson from everything we've seen.

The current bad UI does:

```text
Activity
Activity
Activity
Activity
Activity
Activity
...
```

The correct UI should visually represent:

```text
PRE-H0
   ↓
H0
   ↓
continuous process
   ↓
three parallel piles
   ├── Pile 1
   ├── Pile 2
   └── Pile 3
         ↓
individual movements
         ↓
tunnel allocation
         ↓
tunnel process
         ↓
H552
```

And click into a node when the user needs detail.

---

# 25. One consolidated picture

This is the version I would actually use as the **master product story**:

```text
                         PRE-H0
                           │
             ┌─────────────┴─────────────┐
             │                           │
       MATERIAL LAB                 BAGASSE WEIGHMENT
       Moisture / pH /              Load 1...N
       dry weight / etc.            actual qty + slip
             │                           │
             └─────────────┬─────────────┘
                           │
                    STARTUP READY
                           │
                           ▼
                   ┌───────────────┐
                   │      H0       │
                   │ explicit H0   │
                   └───────┬───────┘
                           │
                           ▼
                 CONTINUOUS H0 → H552
                           │
             ┌─────────────┴─────────────┐
             │             │             │
           PILE 1         PILE 2        PILE 3
             │             │             │
             ▼             ▼             ▼
            T0            T0            T0
             │             │             │
           REST          REST          REST
             │             │             │
             ▼             ▼             ▼
            T1            T1            T1
             │             │             │
           REST          REST          REST
             │             │             │
             ▼             ▼             ▼
            T2            T2            T2
             │             │             │
             ▼             ▼             ▼
         BUNKER LOAD   BUNKER LOAD   BUNKER LOAD
             │             │             │
             └─────────────┴─────────────┘
                           │
                     LATER IN PROCESS
                           │
               TUNNEL DECISION DEADLINE
                    ≈ H240 / Day 10
                           │
             ┌─────────────┼─────────────┐
             │             │             │
          366 → T10     367 → T8      368 → T6
             │             │             │
             └─────────────┼─────────────┘
                           │
                    TUNNEL PROCESS
                           │
                           ▼
                    H552 BASELINE END
```

And underneath that entire physical story sits the accountability layer:

```text
ADMIN
configure + activate

OPERATOR
execute + capture

LAB
measure + prove

SUPERVISOR
decide

MANAGER / GM / CHAIRMAN
monitor + drill down
```

## What is **not** allowed to be invented

We still have unresolved factory items—exact hour placement of some activities, some disputed durations, some lab-map differences, and some material decision thresholds.

Those should remain **data/configuration or explicit TBDs**, not be guessed in the UI.

That is the piece I would now treat as the master narrative. Once this is accepted, **then** we rewrite the actual implementation prompt/design contract from this—not the other way around.
