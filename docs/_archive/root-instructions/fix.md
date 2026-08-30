> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

You're right. That diagram was **way too compressed**. It turns a 23-day factory operation into six boxes, which completely destroys the actual process.

What you need is a **full-process map**, where I can look at it and understand:

* what happens before H0
* what happens in each 24-hour window
* which activities overlap
* which ones have durations
* where lab checks happen
* where conditional decisions happen
* when the three piles begin
* how T0 → Rest → T1 → Rest → T2 works
* how one pile can move to bunker while the other two are still working
* when tunnel selection becomes due
* where the individual batches split
* how the process continues until H552

So here is the **proper expanded version**.

# MushroomOS — Full Factory Process Map

```text
========================================================================================================================
                                  MUSHROOMOS — 552 HOUR FACTORY PROCESS
========================================================================================================================

                               PRE-H0 PREPARATION
                                      │
       ┌──────────────────────────────┼─────────────────────────────────┐
       │                              │                                 │
       ▼                              ▼                                 ▼
 MATERIAL ARRIVAL               MATERIAL LAB                     BATCH PREPARATION
       │                        CHECK / TEST                          │
       │                              │                               │
       │                  ┌───────────┼───────────┐                   │
       │                  │           │           │                   │
       │               Moisture       pH      Dry Weight             │
       │                  │           │           │                   │
       └──────────────────┴───────────┴───────────┘                   │
                                  │                                    │
                                  ▼                                    │
                         MATERIAL DECISION                            │
                                  │                                    │
                                  ▼                                    │
                           BAGASSE WEIGHMENT                          │
                                  │                                    │
              ┌───────────────────┼────────────────────┐              │
              ▼                   ▼                    ▼              │
           LOAD 01              LOAD 02              LOAD 03 ... N    │
              │                   │                    │              │
              └───────────────────┴────────────────────┴──────────────┘
                                  │
                                  │
                         ACTUAL QUANTITY
                         WEIGHMENT SLIP
                         OPERATOR
                         MACHINE / VEHICLE
                         SERVER TIMESTAMP
                                  │
                                  ▼
                           PRE-H0 READY
                                  │
                                  │   ← target approximately H0 - 10h
                                  │
                                  ▼
========================================================================================================
                                             H0
========================================================================================================
                                             │
                                             ▼
                                   552-HOUR PROCESS CLOCK
                                             │
                                             │
                  IMPORTANT: EVERYTHING BELOW IS POSITIONED BY HOUR,
                  NOT BY MIDNIGHT / CALENDAR-DAY ARITHMETIC.
                                             │
                                             │
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
 H0 → H24                                      DAY 0
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
                                             │
                                             ▼
                                     START OF PROCESS
                                             │
                                             ▼
                                    FIBRE / BAGASSE
                                      PROCESSING
                                             │
                                             ▼
                                   WETTING / HOPPER
                                             │
                                             │
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
 H24 → H48                                      DAY 1
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
                                             │
                                             ▼
                                  BAGASSE WETTING
                                             │
                              ┌──────────────┴──────────────┐
                              │                             │
                              ▼                             ▼
                        HOPPER PASS 1                 LAB CHECK
                              │                             │
                        WATER PASS                         │
                              │                             │
                              └──────────────┬──────────────┘
                                             │
                                             ▼
                                    MOISTURE DECISION
                                             │
                           ┌─────────────────┴─────────────────┐
                           │                                   │
                           ▼                                   ▼
                  MOISTURE ACCEPTABLE                 MOISTURE NOT ACCEPTABLE
                           │                                   │
                           ▼                                   ▼
                   HOPPER PASS 2                         WET PASS AGAIN
                   (DRY PASS PATH)                     (WATER REQUIRED)
                           │                                   │
                           └─────────────────┬─────────────────┘
                                             │
                                             ▼
                                   LAB / PRE-BUNKER CHECK
                                             │
                                             ▼
                                    BUNKER LOADING
                                             │
                                             ▼
                                   CONDITION / REST
                                             │
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
 H48 → H72                                      DAY 2
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
                                             │
                                             ▼
                                  BUNKER REST / HOLD
                                             │
                                             │
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
 H72 → H96                                      DAY 3
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
                                             │
                                             ▼
                                  CONTINUED REST / HOLD
                                             │
                                             │
                                      NO FORCED DAILY
                                      "COMPLETION" ACTION
                                             │
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
 H96 → H120                                     DAY 4
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
                                             │
                              ┌──────────────┴──────────────┐
                              │                             │
                              ▼                             ▼
                         UNLOADING                   PADDY ARRIVAL
                              │                             │
                              ▼                             ▼
                         LAB CHECK                    PADDY INSPECTION
                              │                             │
                              ▼                             ▼
                        HOPPER PASS 3                PADDY WEIGHMENT
                              │                             │
                              ▼                             │
                     RELOAD / BUNKER                       │
                              │                             │
                              └──────────────┬──────────────┘
                                             │
                                             ▼
                                      NEXT CONDITIONING
                                             │
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
 H120 → H144                                    DAY 5
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
                                             │
                                  PADDY / STRAW STREAM
                                             │
                                             ▼
                                     SOAKING 1
                                     ~8–10 HOURS
                                             │
                                             ▼
                                      LAB CHECK
                                             │
                                             ▼
                                    BUNKER STORAGE
                                             │
                                             ▼
                                      STRAW REST
                                             │
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
 H144 → H168                                    DAY 6
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
                                             │
                                             ▼
                                     SOAKING 2
                                     ~8–10 HOURS
                                             │
                                             ▼
                                      LAB CHECK
                                             │
                                             ▼
                                  CONTINUE STRAW STREAM
                                             │
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
 H168 → H192                                    DAY 7
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
                                             │
                                             ▼
                                    STRAW / YARD WORK
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
                    ▼                        ▼                        ▼
                 SOAKING 3               ROTAVATE              HOPPER COMBINE
                    │                        │                        │
                    └────────────────────────┼────────────────────────┘
                                             │
                                             ▼
                                           REST
                                             │
                                             ▼
                                     TURNER STREAM
                                             │
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
 H192 → H216                                    DAY 8
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
                                             │
                                             ▼
                                  TURNER / PILE PROCESS
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
                    ▼                        ▼                        ▼
                  PILE 1                   PILE 2                   PILE 3
                    │                        │                        │
                    ▼                        ▼                        ▼
                    T0                       T0                       T0
                    │                        │                        │
                    │                    each target               │
                    │                     ~6–7h                     │
                    └────────────────────────┼────────────────────────┘
                                             │
                                             ▼
                              THREE PARALLEL PILE STREAMS
                                             │
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
 H216 → H240                                    DAY 9
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────

                PILE 1                         PILE 2                         PILE 3
                  │                              │                              │
                 T0                             T0                             T0
                  │                              │                              │
                  ▼                              ▼                              ▼
                REST                           REST                           REST
                  │                              │                              │
                  ▼                              ▼                              ▼
                 T1                             T1                             T1
                  │                              │                              │
            [can differ by pile]          [can differ by pile]          [can differ by pile]
                  │                              │                              │
                  ▼                              ▼                              ▼
                REST                           REST                           REST
                  │                              │                              │
                  ▼                              ▼                              ▼
                 T2                             T2                             T2
                  │                              │                              │
                  │                              │                              │
                  └──────────────┬───────────────┴───────────────┬──────────────┘
                                 │                               │
                                 │   NO GLOBAL T2 BARRIER       │
                                 │                               │
                                 ▼                               ▼
                         PILE MAY MOVE                     OTHER PILES MAY
                         TO BUNKER                         STILL BE RUNNING
                                 │
                                 ▼
                            BUNKER LOAD
                         PER INDIVIDUAL PILE
                                             │
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
 H240 → H264                                    DAY 10
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
                                             │
                                             ▼
                              TUNNEL PLANNING DEADLINE
                                             │
                                       DECISION DUE
                                        BY ~ H240
                                             │
                         ┌───────────────────┼───────────────────┐
                         │                   │                   │
                         ▼                   ▼                   ▼
                       366                 367                 368
                     [PENDING]           [PENDING]           [PENDING]
                         │                   │                   │
                         └───────────────────┼───────────────────┘
                                             │
                              ADMIN / SUPERVISOR DECIDES
                                             │
                         ┌───────────────────┼───────────────────┐
                         ▼                   ▼                   ▼
                     366 → TUNNEL X      367 → TUNNEL Y      368 → TUNNEL Z
                                             │
                                             │
                         IMPORTANT:
                         TUNNEL ALLOCATION DEADLINE = H240
                         TUNNEL PHYSICAL LOADING ≈ H360
                                             │
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
 H264 → H288                                    DAY 11
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
                                             │
                                             ▼
                                  BUNKER / CONDITIONING
                                             │
                                             ▼
                                     REST / HOLD
                                             │
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
 H288 → H312                                    DAY 12
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
                                             │
                                             ▼
                                     BUNKER RELOAD
                                             │
                                             ▼
                                      LAB RELOAD CHECK
                                             │
                                             ▼
                                    CONTINUE CONDITIONING
                                             │
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
 H312 → H336                                    DAY 13
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
                                             │
                                             ▼
                                     BUNKER REST 2
                                             │
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
 H336 → H360                                    DAY 14
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
                                             │
                                             ▼
                                 FINAL PRE-TUNNEL PREP
                                             │
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
 H360 → H384                                    DAY 15
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
                                             │
                                             ▼
                                  TUNNEL LOADING
                                             │
                         ┌───────────────────┼───────────────────┐
                         ▼                   ▼                   ▼
                     366 → TUNNEL X      367 → TUNNEL Y      368 → TUNNEL Z
                                             │
                                             ▼
                                      LAB TUNNEL LOAD
                                             │
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
 H384 → ...                                     DAY 16+
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
                                             │
                                             ▼
                                     TUNNEL PROCESS
                                             │
                                             ▼
                                   TUNNEL HOLD / PHASE
                                             │
                                             ▼
                                  CONTINUOUS MONITORING
                                             │
                                             │
                                             │  Lab / operator checks
                                             │  temperature
                                             │  ammonia / fan etc.
                                             │  where defined
                                             │
                                             ▼
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
 H456 → H480                                    DAY 19
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
                                             │
                                     DEMO / LIVE POSITION
                                             │
                                     MANAGEMENT SHOULD SEE:
                                             │
                                     CURRENT H456 / H552
                                             │
                                 BATCH STATE / TUNNEL STATE
                                             │
                                  LAB STATUS / EXCEPTIONS
                                             │
                                    OPERATOR CURRENT WORK
                                             │
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
 H480 → H504                                    DAY 20
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
                                             │
                                      CONTINUED TUNNEL
                                        PROCESS / HOLD
                                             │
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
 H504 → H528                                    DAY 21
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
                                             │
                                      FINAL TUNNEL PHASE
                                             │
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
 H528 → H552                                    DAY 22
─────────────────────────────────────────────┼────────────────────────────────────────────────────────────
                                             │
                                             ▼
                                    TUNNEL UNLOADING
                                      ~8 HOURS
                                             │
                                             ▼
                                     COMPOST-OUT QC
                                             │
                                             ▼
                                      FINAL EVIDENCE
                                             │
                                             ▼
                                      H552 BASELINE
                                             │
                                             ▼
========================================================================================================
                                     END OF 552-HOUR CLOCK
========================================================================================================
```

# The important thing this shows

This is **not**:

```text
Day 0
Day 1
Day 2
Day 3
...
Day 22
```

It's:

```text
PRE-H0
   │
   ▼
H0
   │
   ├── continuous process
   │
   ├── overlapping activities
   │
   ├── three parallel piles
   │       ├── T0
   │       ├── Rest
   │       ├── T1
   │       ├── Rest
   │       ├── T2
   │       └── Bunker
   │
   ├── tunnel planning deadline at H240
   │
   ├── tunnel loading around H360
   │
   ├── tunnel process
   │
   └── H552
```

And there are **three different kinds of time in the product**:

```text
STANDARD
Where the process definition places the activity.

ADMIN PLAN
Where management intentionally moves it, with a reason.

ACTUAL
When the operator/lab actually did it, from server timestamp.

FORECAST
Where the system now expects it to land.
```

The **day labels are just labels**.

The actual engine is:

```text
H0 + elapsed hours
```

---

## And this is how the three-pile part should actually be understood

```text
                                    H192
                                      │
                 ┌────────────────────┼────────────────────┐
                 │                    │                    │
                 ▼                    ▼                    ▼
              PILE 1                PILE 2               PILE 3
                 │                    │                    │
                 T0                   T0                   T0
              6–7h                 6–7h                 6–7h
                 │                    │                    │
                REST                 REST                 REST
                 │                    │                    │
                 T1                   T1                   T1
                 │                    │                    │
                REST                 REST                 REST
                 │                    │                    │
                 T2                   T2                   T2
                 │                    │                    │
                 ▼                    ▼                    ▼
              BUNKER               BUNKER               BUNKER
                 │                    │                    │
                 │                    │                    │
                 └──────────── can happen independently ────┘
```

So at one particular hour, this is perfectly valid:

```text
H208

Pile 1 → T2 complete → Bunker Loading
Pile 2 → T1 in progress
Pile 3 → Rest 2
```

That is the kind of state the **Control Tower, Batch Detail, Operator, and Supervisor screens must be capable of showing**.

And importantly, the exact H-hour at which those transitions happen should be **generated from the process durations/dependencies and then corrected by actual execution**, not invented by the UI.

This is the level of detail I should have been using from the start.
