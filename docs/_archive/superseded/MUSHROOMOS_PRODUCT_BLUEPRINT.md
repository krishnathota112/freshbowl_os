> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# MushroomOS — Product Blueprint

**24 August 2026.** Written for the factory and product owner. No code names, no technical codes.

Read from the factory's own records: the master batch form, six filled batch records, the batch
phase movement sheet, ten months of production schedule, the formulations workbook, the lab summary
workbook, the lab manual, the composting guideline, the process flow diagrams, and the hour grid.

---

## A · What MushroomOS is

**The factory's current way of working is good. MushroomOS does not replace it.**

What the factory does today is recorded on paper and in spreadsheets, after the fact, by hand. The
information is real and the people are careful. But it is written down hours or days later, the
proof is a memory, and answering *"why was batch 367 late and who was there"* means opening four
files and asking three people.

MushroomOS does two things and only two things:

1. **It puts the batch on a 552-hour clock**, so every activity has a place in time and *planned*
   can be compared with *actual* the moment it happens rather than at month end.
2. **It collects the evidence as the work happens** — the reading, the photograph, the person, the
   machine, the vessel, the decision and the reason — so the record is built by doing the work
   instead of being written up afterwards.

Everything else follows from those two. The reports the office types up become something the system
already knows. The chairman's question *"why?"* becomes a click instead of an investigation.

**What it is not.** Not a task app. Not a general ERP. Not a copy of the old app.

---

## B · The two ways in, and the one thing that decides what you see

**Every person gets both. There is a mobile app and there is a web application, and they contain the
same thing. Which one you pick up does not change what you can do — the login does.**

```
                        ONE SHARED BACKEND
                       the single source of truth
                                 │
                  ┌──────────────┴──────────────┐
                  │                             │
            WEB APPLICATION              MOBILE APPLICATION
              every role                     every role
                  └──────────────┬──────────────┘
                                 │
                          WHO SIGNED IN
                                 │
   ┌──────────┬──────────┬───────┴───┬──────────┬──────────┬──────────┐
   ▼          ▼          ▼           ▼          ▼          ▼          ▼
ADMIN    SUPERVISOR   MANAGER       GM      CHAIRMAN   OPERATOR      LAB
"create  "what needs  "where are  "what is  "what is   "what do    "what do
 this     my          my          happening  happening  I do        I test
 batch"   decision?"  resources?" and why?"  and why?"  now?"       now?"
```

A chairman on his phone gets the control tower. An operator at a desk gets his work list. A
supervisor standing in the yard approves a deviation on the same screen he would see in the office.
**Nobody is locked out of their own work by which device they happened to pick up.**

One codebase, one build, delivered two ways. A screen fixed in one place is fixed in both, and there
is no second application to keep in step.

**What the role does change** is the shape of the chrome around the work. Operator and lab technician
get a stripped view — one task on screen, no navigation bar, bigger controls, because they are on
the floor and often wearing gloves. Everyone else gets the full navigation. An operator never
reaches the lab queue, a lab technician never sees operator tasks, and neither sees a management
screen — but that is the login deciding, not the device.

**The apps are not the source of truth. The backend is.** They record; it decides. A phone with its
clock set two days forward cannot open a rest window, because the server owns the clock.

---

## C · The complete Admin journey

**Admin's job in one sentence: turn the monthly schedule into a batch the factory can actually run.**

She does not create tasks. She does not type 552 rows. She configures one batch and the system
builds everything else.

### Step 1 — The scheduled slot
She opens the month. The schedule shows which batch groups are due, which bunkers and tunnels are
already committed, and which rooms are free. She picks the slot that is due to start.

### Step 2 — Identity and start
The batch numbers as the factory writes them — **366, 367, 368**. The start date. **The start time**,
which defaults to the factory clock but can be set to the hour this batch actually began.

### Step 3 — Materials and formulation
She picks which material fills each role, and the percentage split:

```
PRIMARY FIBRE      New Bagasse      47 %
STRAW              Local Paddy      53 %
NITROGEN           Chicken Manure
MINERALS           Gypsum · Ammonium Sulphate · Urea
```

For each material she enters the tested moisture, nitrogen and ash. The system computes the dry
weight, the fresh weight and the estimated carbon-to-nitrogen ratio.

### Step 4 — Quantities and loads
Target compost tonnage, and how much fits on one truck. The system works out the number of loads —
eleven loads of two tonnes leaves one tonne on the last, not another full truck.

### Step 5 — Resources
Supervisor, operators, machines, vehicles. And the **vessels for each movement** — which bunker
takes the first fill, which takes reload one, which takes reload two, which tunnels the individual
batches go into. If a vessel is already spoken for, the system refuses and names the batch holding
it.

### Step 6 — The generated timeline
The system has already built every activity, on every day, in every stream, with standard durations,
required photographs, lab checkpoints, and the order things must happen in. She reads it back.

### Step 7 — Timing
The process supplies the day and the normal duration. Admin states the **hour** for this batch where
it matters. Anything she leaves alone keeps the standard.

### Step 8 — Operator work plan
Who does what. Anything unassigned is listed as a problem before activation.

### Step 9 — Laboratory plan
Which checkpoints apply, which parameters at each, and which specification band each will be judged
against.

### Step 10 — Evidence plan
Which activities need a photograph, and what the photograph must show.

### Step 11 — Review and activate
The system lists every remaining problem in plain words. She clicks activate. **The plan freezes** —
after that a target changes only through a recorded deviation or a supervisor's decision.

---

## D · The complete Operator journey

**One question: what do I do now?**

He signs in — on the phone in the yard, or a tablet, or a browser. It knows him. No menu, no
navigation — nothing but his work.

He sees the master batch, the individual batch, the current task, what he must record, what he must
photograph, and how long it should take.

He taps **Start**. The system records the time — he never types one.

He does the work, records the readings, takes the photographs, taps **Submit**. The system records
the finish time, the machine, the vessel and his name.

**If a reading is outside target, he records it anyway.** The system warns, asks him why, and sends
it to his supervisor. It does not block him. Blocking the real number only teaches people to write a
convenient one.

**The photograph gates the submission, not the recording.** He can enter figures freely; he cannot
finish without the proof.

When a task is waiting on time — a rest — he sees it counting down on the factory's clock.

---

## E · The complete Lab journey

**One question: what do I test now?**

Same application, different door. She sees her queue: which batches need a reading, at which
checkpoint, and
which parameters.

She takes the sample, records the values, adds the observations — smell, colour, the squeeze test —
and photographs the sample.

**The verdict comes from the specification band**, frozen when the test was requested so it cannot
change under her afterwards. Where no authoritative band exists, the reading is recorded and marked
**no specification** — never an invented pass or fail.

**She cannot overwrite a reading.** A wrong measurement is corrected by a retest that names its
reason, and the first reading stays on the record — *"we measured it twice"* is itself a fact.

She submits and moves straight to the next batch. She does not wait for approval.

### The specification bands, from the lab manual

| Phase | Moisture | pH | Ash | Nitrogen | C:N |
|---|---|---|---|---|---|
| Soak pit water | — | 6.5–7.5 | — | — | — |
| Bagasse wetting | 75–78 | — | — | — | — |
| Bagasse bunker loading | 75–77 | — | — | — | — |
| Bagasse reloading | 75–76.5 | — | — | — | — |
| Turning 0 + Turning 1 | 72–74 | — | — | — | — |
| Turning 2 + Bunker loading | 74–77 | 8.1–8.4 | 16–20 | 1.3–1.6 | 25–32 |
| Reloading | 75–76.5 | 7.8–8.0 | 19–23 | 1.4–1.7 | 22–28 |
| Tunnel loading | 72.5–74 | 7.6–7.8 | 23–26 | 1.6–1.9 | 19–24 |
| Growing room loading | 65–68 | 7.4–7.7 | 25–29 | 1.8–2.2 | 16–20 |

**The carbon-to-nitrogen ratio falls through the process — 25–32 down to 16–20 — and that fall is
the quality signal.** The real batch records show exactly that: 26.0 → 24.8 → 20.8 → 16.0.

There are also bands for raw materials, for every kind of water on site, for casing soil and for
spawn. All of them exist and none of them is loaded into the system today.

---

## F · The complete Supervisor journey

**One question: what needs my decision?**

Ordered by urgency, not by batch:

- rests opening or expiring in the next few hours
- lab readings outside their band
- deviations waiting on a verdict
- work returned for correction
- resource conflicts

He can release, hold, return for correction, accept with a deviation on the record, or escalate.
**Every decision records who, when, what was decided and why — in his own words, kept exactly.**

---

## G · The complete Chairman journey

**Two questions: what is happening, and why?**

He opens the **Control Tower** — at his desk or on his phone, the same screen. First what needs a decision, then the shape of the factory: every
active master batch as a staircase across the calendar, each at its own hour, sorted by start.

```
MB 366–368   ████████████████████░░░░░   H419
MB 369–371     ██████████████░░░░░░░░░   H371
MB 372–374       ████████░░░░░░░░░░░░░   H323
```

**No percentage complete anywhere.** Half the process is resting and rest does not compress.

He clicks a batch, sees the 552-hour rail with plan above and actual below, and a paragraph in plain
English that names the person, the machine and the reason. He drags the playhead to hour 419 and the
whole screen shows what was happening at hour 419.

He clicks the late activity and sees the proof: what should have happened, what did, who, which
machine, which vessel, the lab reading, the photographs themselves, the supervisor's decision and
their exact words.

---

## H · How one master batch is created

```
MONTHLY SCHEDULE  ──►  ADMIN CONFIGURES  ──►  SYSTEM GENERATES  ──►  ACTIVATE
   which slot          numbers, start,        every activity          plan
   is due              materials, %,          every day               freezes
                       quantities,            every stream
                       resources, hours       durations, photos,
                                              lab checks, order
```

---

## I · How a master batch contains individual batches

**A master batch is a group of individual batches — two, three or four of them.** The records show
all three sizes: *366,367,368* and *387,388,389,390* and *121,122*.

```
MASTER BATCH 366 / 367 / 368
        │
        ├── Individual batch 366  ──►  Tunnel 10
        ├── Individual batch 367  ──►  Tunnel 8
        └── Individual batch 368  ──►  Tunnel 6
```

They share the early process — the same weighment, the same soak, the same yard — and **separate at
tunnel loading**, where each takes its own tunnel, its own phase-2 timings and its own quality
result.

The system must be able to answer *"which tunnel did 367 use, and what came out of it"*.

---

## J · How movements work

A batch does not sit still. It **moves**, and each move is a recorded event with a source, a
destination, a time and a person.

```
RAW MATERIAL ─► WEIGHMENT ─► HOPPER ─► BUNKER (fill) ─► BUNKER (reload 1)
                                                              │
                                                              ▼
                                                       BUNKER (reload 2)
                                                              │
                                                              ▼
                              YARD ──► PILE 1 / PILE 2 / PILE 3
                                          │        │        │
                                         T0       T0       T0
                                         T1       T1       T1
                                         T2       T2       T2
                                          └────────┼────────┘
                                                   ▼
                                              BUNKER (load)
                                                   ▼
                                          TUNNEL 10 / 8 / 6
                                                   ▼
                                            COMPOST OUT
                                                   ▼
                                          GROWING ROOMS
                                                   ▼
                                               YIELD
```

Every movement records the vessel it came from, the vessel it went to, the clock time, the operator,
the machine, the fill height and the readings taken at that moment.

---

## K · How bunkers and tunnels are allocated

**Per movement — not once per batch.** This is the clearest finding in the factory's records and the
system currently gets it wrong.

From a real batch:

| Movement | Group A | Group B |
|---|---|---|
| First fill | Bunker 3 | Bunker 6 |
| Reload 1 | Bunker 5 | Bunker 4 |
| Reload 2 | Bunker 3 | Bunker 4 |

And the counts do not match either: *"3 batches loading into 2 bunkers"*, then *"2 bunkers filled
into 3 tunnels"*.

So the rules are:

- A movement claims a vessel for a window of time.
- Two batches cannot hold the same vessel at the same time, and the system must refuse it.
- A batch may return to a bunker it used earlier, once it has been released.
- Admin chooses the vessel for each movement. Nothing is auto-assigned.
- Tunnels are allocated **per individual batch**, not per master batch.

---

## L · How the 552-hour clock works

The batch starts at an instant — a date and a time, in the factory's own timezone. That instant is
**hour zero**. Every hour after it is numbered up to 552.

- **Hour** is the position. *Hour 419.*
- **Batch day** is derived from the hour, for reading convenience only. It is never the underlying
  mechanism.
- A batch day starts at the batch's own start time, **not at midnight**. If a batch starts at 05:00,
  an activity planned for 03:00 falls twenty-two hours into that batch day — on the next calendar
  date.
- Batches start every two days, so about twelve run at once, each at a different hour.

**Why not factory day numbers?** Because the factory's own documents number days two different ways
— one counting from mixing, one from weighment, six days apart. The hour clock is unambiguous and
both day labels can be shown against it.

**Where the hour comes from.** The process supplies the day and the standard duration. Admin states
the hour for a particular batch where she knows it. The factory already records real clock times to
the minute — *8:00 PM, 4:06 PM, 5:10 AM, 11:25 AM* — so this is how they already work.

**Nothing is invented.** Where no source states an hour, the activity keeps its day placement and the
screen says so rather than showing a made-up time.

---

## M · How planned versus actual works

Four separate registers. They are never merged into one number.

| | |
|---|---|
| **Standard** | what the process says: this day, this long, these checks |
| **Plan** | what Admin decided for this batch: this hour, this duration, this vessel |
| **Actual** | what happened: real timestamps from the floor |
| **Forecast** | where it is heading, from the gap so far |

The difference between plan and actual is the variance. It is stated in minutes and spoken in
words — *"3h 51m behind"* — never as a percentage.

**A batch is as late as its slowest stream**, not the sum of its streams. Four streams run at once;
adding them counts the same afternoon several times.

---

## N · How evidence works

Evidence is part of the production record, not an attachment to it.

An activity may require a before photograph, an after photograph, a video, a document or a named
observation. The requirement is part of the process definition, so it can change without anyone
touching the software.

The photograph is uploaded first and only then attached to the named requirement — a record of a
photograph that is not actually stored would be a false record.

**Management sees the photograph, not a count.** *"2 of 2"* is a checklist for the person doing the
work. The chairman needs the image, who took it, when, and against which activity.

---

## O · How the lab works

- The **sample** is the traceable object, not the reading. Every method begins *"take X grams of
  sample"*.
- A test is requested against a **checkpoint**, and the specification band is frozen at that moment.
- A result is recorded once. It is never edited. A retest creates a new version and keeps the old.
- Where no band exists, the result is **no specification** — recorded, not judged.
- Instrument and calibration state are recorded with the reading. Where no calibration interval is
  known, it says **unknown** rather than claiming the instrument was fine.
- Observations — smell, colour, squeeze test, actinomycetes, ammonia strength — are recorded as
  choices, not forced into numbers.
- Lab work does not block the technician. She submits and moves to the next batch.

---

## P · How machines and people are tracked

Every physical activity records the machine, the vehicle, the operator, the vessel, the start and the
finish.

**Machine hours are derived from those timestamps.** There is no field anyone can type hours into,
because a typed number and a recorded one will disagree and the typed one will win.

Management can then answer: how many hours did JCB-02 work on this batch; which batch was holding
Turner-03 when another batch waited; how long was Bunker 7 occupied.

---

## Q · How deviations and decisions work

```
Operator records a real value
        │
        ▼
Outside the allowed target?
        │
        ▼
DEVIATION raised automatically, with the operator's own reason
        │
        ▼
SUPERVISOR: release · hold · return · accept with deviation · escalate
        │
        ▼
Decision recorded: who, when, what, and the reason in their own words
        │
        ▼
Visible on the batch forever
```

Nothing is deleted. A corrective action is recorded against the deviation, not in place of it.

---

## R · How growing rooms and yield connect

The factory already keeps this chain in one row of one spreadsheet. The system should hold the same
chain and be able to walk it in both directions.

```
552-HOUR PROCESS ─► TUNNEL ─► GROWING ROOM ─► SPAWN ─► HARVEST ─► YIELD
```

Recorded at the growing room: tunnel number, growing room number, spawn date, nitrogen at loading,
moisture, structure, smell.

Recorded at harvest: **first break, second break, third break, room total, number of days, batch
total** — in metric tonnes.

**A master batch can cover a fractional number of rooms.** The records say *"3½ rooms"* and
*"4 rooms, 150 MT, 50 MT each room"*. Rooms are not a whole-number count.

This is what eventually lets management ask: *did the batches we composted hotter yield more?*

---

## S · The screens we need to build

Each one below states its purpose, who uses it, what they see, what they can do, what the system
does by itself, what it reads, what it creates, and what happens next.

---

### S1 · Monthly Schedule — **NOT BUILT**

| | |
|---|---|
| **Purpose** | Where Admin's morning starts: what is due this month and what is free |
| **Who** | Admin, GM |
| **They see** | The month as a grid. Batch groups due to start. Bunkers, tunnels and rooms already committed. Batches running late |
| **They can** | Import the month's schedule. Pick a slot and start creating that batch |
| **Automatic** | Flags a slot whose vessels are already taken. Flags a batch that should have started and has not |
| **Reads** | The imported schedule; existing batches and their vessels |
| **Creates** | Nothing until a slot is chosen — this is a planning input, not a record |
| **Next** | Batch creation, pre-filled with the numbers and the date |

### S2 · Create Master Batch — **PARTLY BUILT**

| | |
|---|---|
| **Purpose** | Turn one scheduled slot into a runnable batch |
| **Who** | Admin |
| **They see** | Eleven guided steps: identity, start, materials, formulation, quantities, resources, timeline, operators, lab, evidence, review |
| **They can** | Set everything the process allows; leave the rest to the standard |
| **Automatic** | Splits quantity into truck loads. Computes dry and fresh weights and the C:N estimate. Generates every task, day and dependency. Refuses a double-booked vessel. Lists every problem before activation |
| **Reads** | The process definition; materials and their tested values; free vessels, machines and people |
| **Creates** | The master batch, its individual batches, the whole execution plan, and the frozen baseline on activation |
| **Next** | The batch appears on the tower and work reaches the phones |

**Built:** identity, start date, **start time**, supervisor, quantities, load splitting, task
generation, people and machines, vessel choice, hour-level timing, validation, activation.
**Missing:** the scheduled-slot step, materials and formulation, individual batch identity, evidence
and lab configuration steps.

### S3 · Batch Plan Review — **BUILT, needs re-shaping**

| | |
|---|---|
| **Purpose** | Read back what the system generated, and correct what Admin is allowed to correct |
| **Who** | Admin, Supervisor |
| **They see** | The batch day by day; standard beside plan beside actual for every activity |
| **They can** | Set hour, duration, person, machine, vessel; clear back to the standard |
| **Automatic** | Re-places the activity on the clock the moment an hour changes |
| **Reads** | The generated plan |
| **Creates** | The batch's own timing and assignments |
| **Next** | Validate, then activate |

### S4 · Operator — My Work — **BUILT**

| | |
|---|---|
| **Purpose** | Show one person the one thing to do now |
| **Who** | Operator, on whichever device is to hand |
| **They see** | Their tasks, the current one first, with progress on the batch |
| **They can** | Start, record, photograph, submit |
| **Automatic** | Records start and finish times, person, machine, vessel. Raises a deviation on an out-of-range value. Refuses submission without the required proof |
| **Reads** | The activated plan |
| **Creates** | The actual record and the evidence |
| **Next** | The next task opens; anything unusual goes to the supervisor |

### S5 · Lab Queue and Reading — **BUILT, needs the spec bands**

| | |
|---|---|
| **Purpose** | Show the technician what to test now |
| **Who** | Lab technician, on whichever device is to hand |
| **They see** | Waiting checkpoints by batch, the parameters, and the band each will be judged against |
| **They can** | Take a sample, record values and observations, photograph, order a retest |
| **Automatic** | Freezes the band at request time. Judges against it or reports no specification. Preserves every earlier version |
| **Reads** | The lab plan and the specification tables |
| **Creates** | Samples, tests, results and their versions |
| **Next** | A failing result reaches the supervisor; the technician moves on |

**Missing:** the specification tables from the lab manual are not loaded, so most readings currently
report *no specification* when a real band exists.

### S6 · Supervisor Control Room — **BUILT**

| | |
|---|---|
| **Purpose** | Everything waiting on a decision, worst wait first |
| **Who** | Supervisor, GM |
| **They see** | Time-critical gates, failed lab results, open deviations, held work |
| **They can** | Release, hold, return, accept with deviation, escalate |
| **Automatic** | Orders by how long each has waited. Records every decision permanently |
| **Reads** | Live batch state |
| **Creates** | Decisions and their reasons |
| **Next** | Work unblocks, or escalates to the GM |

### S7 · Control Tower — **BUILT, needs the staircase**

| | |
|---|---|
| **Purpose** | The whole factory at a glance |
| **Who** | GM, Chairman, Manager, Admin |
| **They see** | What needs a decision, then every active batch at its own hour |
| **They can** | Open an exception, or open a batch at a chosen hour |
| **Automatic** | Counts and orders everything from live records |
| **Reads** | Every running batch |
| **Creates** | Nothing — it is a view |
| **Next** | The batch page |

**Missing:** the concurrent-batch staircase across the calendar. Today it draws simple bars.

### S8 · Master Batch Page — **BUILT, needs drill-down**

| | |
|---|---|
| **Purpose** | One batch's whole life on one screen |
| **Who** | Management |
| **They see** | The 552-hour rail, plan against actual, where the time went, a written explanation, every event |
| **They can** | Drag the playhead; open any activity; drill into an individual batch |
| **Automatic** | Writes the explanation from the records. Keeps all views on one hour |
| **Reads** | The batch, its activities, its measurements and its decisions |
| **Creates** | Nothing |
| **Next** | The proof panel |

**Missing:** the drill-down to individual batches, and the physical flow diagram beside the rail.

### S9 · Individual Batch Page — **NOT BUILT**

| | |
|---|---|
| **Purpose** | Follow one of the two-to-four batches inside a master batch |
| **Who** | Management |
| **They see** | Its own timeline, its bunker sequence, its tunnel, its phase-2 stages, its quality result, its yield |
| **They can** | Open any movement or reading |
| **Automatic** | Inherits the shared early process; separates from tunnel loading onward |
| **Reads** | Movements, tunnel monitoring, growing room and harvest |
| **Creates** | Nothing |
| **Next** | The proof panel |

### S10 · Proof Panel — **NOT BUILT**

| | |
|---|---|
| **Purpose** | Turn *"why?"* into an answer in one click |
| **Who** | Everyone, at their own level of detail |
| **They see** | What should have happened · what did · who · machine · vessel · measurement · **the photographs themselves** · lab result · deviation · decision and its exact words |
| **They can** | Open the full-size image; jump to the person, machine or vessel |
| **Automatic** | Assembles from the record |
| **Reads** | One activity and everything attached to it |
| **Creates** | Nothing |
| **Next** | Wherever the reader clicks |

**This is the biggest hole in the product.** Every fact is stored. Fifty photographs sit in the
system and none of them is visible anywhere.

### S11 · The Plant — **BUILT**

| | |
|---|---|
| **Purpose** | Which vessels are in use, which are free, and what is in them |
| **Who** | Management |
| **They see** | Every bunker and tunnel, occupied or empty, with the batch and how long it has been there |
| **They can** | Open the batch in a vessel |
| **Automatic** | Distinguishes physically occupied from reserved for a plan |
| **Reads** | Vessel occupancy |
| **Creates** | Nothing |
| **Next** | The batch page |

**Needs:** the movement arrows between vessels once movements are modelled properly.

### S12 · Phase 2 Tunnel Monitoring — **NOT BUILT**

| | |
|---|---|
| **Purpose** | The most closely watched part of the process |
| **Who** | Operator, lab technician, supervisor |
| **They see** | The six stages with their bands, and the four-hourly log |
| **They can** | Record average temperature, outside air, fan percentage, plenum temperature |
| **Automatic** | Compares against the stage band; records time-to-reach and time-held separately |
| **Reads** | The tunnel's stage plan |
| **Creates** | The four-hourly record |
| **Next** | Compost-out quality |

The stages and their bands, from the records:

| Stage | Duration | Temperature |
|---|---|---|
| Levelling + Conditioning 1 | 18–20 h | 46–49 °C |
| Heating up | 8–12 h | 59 °C |
| Pasteurization | 8–10 h | 59 (58–60) °C |
| Cooling 1 | 12–14 h | 60→48 °C |
| Conditioning 2 | 75–80 h | 48–45 °C |
| Cooling 2 | 8–14 h | 24 °C |

### S13 · Growing Room and Harvest — **NOT BUILT**

| | |
|---|---|
| **Purpose** | Close the chain from compost to mushrooms |
| **Who** | Growing room supervisor, harvest supervisor, management |
| **They see** | Which room took which tunnel, spawn date, and the harvest by break |
| **They can** | Record filling, spawn and each break's weight |
| **Automatic** | Computes yield per tonne of compost and per square metre |
| **Reads** | The tunnel result |
| **Creates** | The room record and the harvest record |
| **Next** | Yield against process quality |

### S14 · Reports and Export — **NOT BUILT**

| | |
|---|---|
| **Purpose** | Produce what the office types up today, from what the system already knows |
| **Who** | Management, office |
| **They see** | The batch summary, the phase movement sheet, the daily report |
| **They can** | Export to Excel |
| **Automatic** | Everything — nobody re-enters anything |
| **Reads** | The whole record |
| **Creates** | A file |
| **Next** | — |

---

## T · What data must appear on each screen

Rather than repeat it, the rule is: **every screen shows the four registers and the source of each
number.** Standard, plan, actual, forecast — and for any measurement, who recorded it, when, with
what instrument, and against which band.

Where a value is absent the screen says which of these it is:
- **not yet recorded** — the work has not happened
- **not stated by any source** — nobody has ever written it down
- **disputed** — two sources disagree, and both are shown

Those three are different and the product must never blur them into a blank or a zero.

---

## U · What is already working

- Sign in on either the web application or the app; the role decides the screens, and every role
  can use both
- The process as data — activities, durations, evidence needs and lab checks change without touching
  the software
- Batch creation with a real start date and time, automatic load splitting, task generation
- Assigning people, machines and vessels; refusing a double-booked vessel by name
- Hour-level timing per batch, with the standard shown beside it
- Validation that refuses to activate an incomplete plan; activation that freezes the baseline
- Operator work capture — readings, photographs, automatic timestamps, out-of-range recording
- Rests that open on the factory's clock and cannot be opened by a phone
- Lab sampling, readings, versioned retests that never overwrite
- Supervisor decisions with reasons kept exactly
- Control tower, batch page with the rail and the written explanation, event history, the plant view
- Machine and vessel utilisation
- A complete audit trail: who, when, old value, new value, and why

## V · What is missing

- Monthly schedule import
- **Individual batch identity** — the 366 / 367 / 368 level
- **Movement-based vessel allocation** — currently a vessel is bound to a batch for its whole life
- Material formulation: percentages, moisture, nitrogen, ash, dry and fresh weight, C:N
- Raw material lots, suppliers, and approval before use
- Weighbridge detail: vehicle, slip number, gross, tare, net
- **The proof panel** — photographs are stored and never shown
- The specification tables from the lab manual
- Phase 2 detail: ammonia, fan percentage, outside air, plenum temperature, settled height,
  time-to-reach and time-held, four-hourly logging
- The physical flow diagram
- Growing rooms, spawn, harvest and yield
- Reports and Excel export

## W · What is conflicting, and left unresolved

**These are factory decisions. The system carries both readings and names the conflict rather than
choosing.**

1. **Day numbering.** The master batch form runs Stage 0 from day −6 and starts Phase 1 at day 0 =
   mixing. Other documents count day 0 = weighment. Six days apart. *The hour clock avoids the
   problem; the day labels still need settling.*
2. **Mineral bag weight.** *2 bags = 90 kg* implies 45 kg a bag. *7 bags = 350 kg* and *4 bags =
   200 kg* imply 50 kg. Any tonnage computed from bags depends on which is right.
3. **Who approves a lab submission.** One document says the general manager; the working practice
   elsewhere says the supervisor. Both are recorded; neither is enabled by default.
4. **Which checkpoint map applies.** Two maps describe the same physical moments under different
   codes with different parameter panels. The technician chooses and the choice is recorded.
5. **Offline capture.** The written scope requires it. The system is built online-only, deliberately,
   and offline recording would weaken the guarantee that a device clock cannot open a rest.
6. **Master batch size.** Two, three and four individual batches all appear in the records.
7. **Live photographs only.** The scope asks for gallery images to be blocked. That has an
   operational cost when a camera fails mid-shift.

## X · Frontend build order

1. **Proof panel.** Smallest work, biggest hole. Every fact is already stored.
2. **Individual batches.** Identity, then the drill-down page. Everything downstream needs it.
3. **Movement-based vessels.** Correct a model that is currently wrong, and unlock the flow diagram.
4. **Lab specification bands.** Load the manual's tables so readings are judged instead of reported
   unjudged.
5. **Materials and formulation.** Percentages, moisture, dry and fresh weight, C:N.
6. **Monthly schedule.** Where Admin's day should begin.
7. **The staircase and the flow diagram.** The two pictures that make the factory legible.
8. **Phase 2 monitoring.** The four-hourly log and the stage bands.
9. **Growing rooms and harvest.** Closes the chain to yield.
10. **Reports and export.**

---

## THE PRODUCT IN ONE FLOW

```
MONTHLY SCHEDULE
        ▼
      ADMIN
        ▼
   MASTER BATCH
        ▼
 INDIVIDUAL BATCHES
        ▼
   552-HOUR PLAN
        ▼
OPERATOR / LAB / RESOURCES
        ▼
  ACTUAL EXECUTION
        ▼
EVIDENCE + MEASUREMENTS
        ▼
   PLAN vs ACTUAL
        ▼
    SUPERVISOR
        ▼
     CHAIRMAN
        ▼
      QUALITY
        ▼
   GROWING ROOM
        ▼
       YIELD
```
