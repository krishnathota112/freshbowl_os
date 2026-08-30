> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# MushroomOS — product build plan

**23 August 2026.** Plain language. What we are building, what already works, what changes, in what
order, and how we know each piece is done.

---

## 1 · One application, two ways to open it

```
                        ONE SHARED DATABASE
                                │
                        ONE APPLICATION
                                │
                ┌───────────────┴───────────────┐
                │                               │
          IN A BROWSER                    ON A PHONE
          any role                        any role
                └───────────────┬───────────────┘
                                │
                        WHO SIGNED IN
                                │
    ┌──────────┬──────────┬─────┴────┬──────────┬──────────┐
    ▼          ▼          ▼          ▼          ▼          ▼
 OPERATOR    LAB     SUPERVISOR   ADMIN    MANAGER   GM / CHAIRMAN
 "what do   "what    "what needs  "create  "where     "what is
  I do?"    do I      my          this      are my     happening,
            test?"    decision?"  batch"    resources" and why?"
```

**There is one application. It is delivered two ways — a web address and an installable file — and
they contain exactly the same thing. The login decides the interface. That is the only thing that
varies.**

A chairman can open the phone app and get the Control Tower. An operator can open the browser and
get My Work. Nobody is locked out of their own screens by which device they happened to pick up.

Under the surface this is one codebase, one build, one set of screens. The installable file wraps
the identical build, so a screen fixed in one place is fixed in both, and there is no second app to
keep in step.

**What the role changes:** operator and lab technician get a stripped shell — one task on screen, no
navigation bar, larger controls, because they are on the floor and often wearing gloves. Everyone
else gets the management shell with the navigation bar. An operator never reaches the lab queue, a
lab technician never sees operator tasks, and neither ever sees a management screen. A supervisor
deliberately keeps the management shell even when looking at operator work, because a supervisor is
genuinely both roles and would otherwise be stranded on a screen with no way back.

**Because every role can now be on a phone, every screen has to work on one.** That was checked
today: no management screen scrolls sideways at phone width, and every control on them is now at
least 44 pixels tall. It was not true this morning — the management navigation bar was 26 pixels,
built for a mouse.

**The reason all of it exists:** the owner should know exactly where every Master Batch is in its
production life, whether it is on plan, what happened when it wasn't, who did the work, what machine
was used, what the lab found, and what evidence proves it.

---

## 2 · The Admin journey

**Admin's whole job is one sentence: turn the month's schedule into one batch the factory can run.**
She does not create tasks. She answers business questions and the system builds the rest.

### Where she starts

Monday morning, the **Monthly Schedule**. It shows the month, which batch groups are due to start,
and which bunkers, tunnels and rooms are already spoken for.

> *This screen does not exist yet.* Today she starts from an empty New Batch form and has to know
> from memory what is due.

### Step 1 — Identity and start

```
Batch            127 · 128 · 129
Day 0 date       23 Aug 2026
Day 0 starts at  05:00
Supervisor       Ramarao
Weather note     clear, humid          (optional)
```

Day 0 is fibre weighment. Every other day counts from here. The start time is mandatory — a batch
with no starting instant has a plan but no position, and the system refuses to activate it.

### Step 2 — Materials and quantity

```
PRIMARY FIBRE    Bagasse (new)      21 MT     truck holds 2 MT
PADDY            Paddy straw
NITROGEN         Chicken manure
MINERALS         Gypsum · Ammonium sulphate
```

**She does not type "11 loads."** She says 21 tonnes and 2 tonnes per truck. The system works out
eleven loads — ten of 2 tonnes and a last one of 1 tonne, because the remainder goes on the tail, not
into another full truck.

### Step 3 — The mix

```
                  Moisture   Dry wt   N%     Fresh wt needed   Rate/t   Cost
Bagasse (new)      55%       9.45     0.4        21.00 MT
Paddy straw        12%       ...
Chicken manure     ...
                                          Total N ___   C:N ___
```

> *This does not exist.* The system knows material names and roles but holds no moisture, nitrogen,
> carbon or price. This is the formulation the workflow document opens with.

### Step 4 — Where and who

```
BUNKERS                  TUNNELS                MACHINES        PEOPLE
Line 1 → Bunker 3        Tunnel 1 → Tunnel 4    Hopper 01       Supervisor  Ramarao
Line 2 → Bunker 7        Tunnel 2 → Tunnel 5    JCB 02          Operator A  Ravi
Line 3 → Bunker 8        Tunnel 3 → Tunnel 6    Turner 03       Operator B  ...
```

If a vessel or machine is already taken, the system refuses and says who has it:

```
Bunker 7 is occupied by MB-2026-08-14 since 14 Aug 05:00, and has not been released.
```

> *Half built.* The engine that assigns a bunker and refuses a double-booking was finished today and
> the database enforces it. **Admin has no screen for it** — today's assignments were made by a
> script. People and machines she can already assign, on the plan review screen.

### Step 5 — Timing

This is where the batch becomes hourly.

```
                              STANDARD          THIS BATCH
Bunker reload · Line 1        Day 12, 2 h       Day 12, 09:00 → 11:00
Bunker reload · Line 2        Day 12, 2 h       Day 12, 11:00 → 13:00
Paddy soak 1                  Day 5,  6 h       Day 5,  05:00 → 11:00
```

The process supplies the day and the normal duration. **Admin sets the actual planned hour for this
batch**, where the process allows it. She is not forced to — anything she leaves alone keeps the
standard.

**This is the decision that makes the product hourly, and it needs nobody at the factory to write
down sixty start times first.** The factory's grid proves the 552-hour clock; it does not state the
start hour of every operation. Admin states it per batch, from what she actually intends to happen.

> *Does not exist as a screen. The storage does.* Every activity already carries a real planned start
> and end timestamp — not a day number. The generator currently fills them at day granularity, which
> is why all 800 tasks land on only fourteen hour positions, every one a multiple of 24. **Making it
> hourly is a screen, not a rebuild.**

### Step 6 — Review the generated plan

The system has already built everything: every task, every day, every stream, standard durations,
photograph requirements, lab checkpoints, and the order things must happen in. She reads it back day
by day:

```
DAY 0   Weighment
DAY 1   Wetting and bunker loading
DAY 2   Rest
DAY 4   Reload, and straw arrives
DAY 5   First soak, bunker storage
DAY 6   Second soak
DAY 7   Third soak, nitrogen mix, yard integration
DAY 8   Turner passes and bunker loading
DAY 10  Rest
DAY 12  Bunker reload
DAY 13  Rest
DAY 15  Tunnel loading
DAY 16  Tunnel process
DAY 22  Tunnel unloading and compost-out
DAY 23  Batch state
```

Beside every operation, the four registers stay separate and stay visible:

```
                STANDARD        THIS BATCH      ACTUAL          FORECAST
Duration        6 h             6 h             —               —
Photographs     2               2               0 / 2           —
Machine         JCB-02          JCB-02          —               —
Vessel          Bunker 3 → 7    Bunker 3 → 7    —               —
Operator        —               Ravi            —               —
Lab             Moisture, EC    Moisture, EC    —               —
```

*Standard* is what the process says. *This batch* is what Admin decided. *Actual* is what happened.
*Forecast* is where it is heading. **They are never merged into one number.**

### Step 7 — Validate and activate

The system checks the plan and lists every problem in plain words — *"this rest has no duration"*,
*"this task has nobody assigned"*, *"this reload goes back into the bunker it came from"*, *"Turner-03
is already assigned at this time"*. It refuses to start the batch while any remain.

She clicks **Activate**. **The plan freezes.** From that moment a target changes only through a
recorded deviation or a supervisor's decision. Nobody can quietly edit what the operators were
working to.

### What Admin never does

She never creates the management dashboard. It is built automatically from every active batch.

---

## 3 · The Operator journey

**One question: what do I do now?**

He opens the app. It knows him. No menu, no navigation, nothing but his work.

```
Ravi — Field Operator

MY WORK                          48 tasks open

FIBRE WEIGHMENT PROGRESS
Target 63.0 MT · Loaded 57.00 MT · Remaining 6.00 MT
Loads 30 / 33                          derived, not typed

DAY 0
  Bagasse Weighment · Load 09 of 11              IN PROGRESS
```

Those totals are added up from loads actually recorded. Nobody types them, so nobody can mistype
them.

He taps the task:

```
BAGASSE WEIGHMENT · Load 09 of 11 · Day 0

How much fibre does this batch need, and how much fits on one truck?

Target quantity   ____ MT
Actual quantity   ____ MT

EVIDENCE · 0 / 1
  ○ Load photo — weighbridge slip or loaded vehicle    [ Capture ]

REMARKS  ______________________

  [ Submit · 1 evidence item outstanding ]
```

He records, photographs, submits. **Times are recorded for him** — he never types a start or finish.

**A number outside target is always recordable.** The system warns, asks why, and raises it to the
supervisor. Blocking the real number would only teach him to write a convenient one.

**The photograph gates the submission, not the recording.** He can enter figures freely; he cannot
finish without the photograph, and the system enforces that, not the button.

Waiting work shows the wait:

```
Bagasse Rest · Line 3 of 3
RESTING · 30 h 07 min remaining
```

**That countdown is the factory's clock, not his phone's.** A phone set forward two days opens
nothing.

**Missing:** he cannot look at any photograph, his own or anyone else's. There is no live-photo-only
rule, so an old gallery picture is accepted.

---

## 4 · The Lab journey

**One question: what do I test now?**

Same app, different door.

```
LAB                              35 waiting on a reading

Bagasse (new) Moisture Check                    MB-DEMO-MID
Whole batch · Day 4 · moisture
0 samples · 0 readings                      [ Take a sample ]
```

Taking a sample asks her something honest:

> **Two source maps describe the same moments under different codes, and nothing in the sources says
> which one the factory follows. Pick the one you are actually working to — the system will not
> choose for you, and your choice is recorded with the sample.**

Both maps are listed. Several warn: *"No spec is mapped to this checkpoint, so readings taken here
will have no pass/fail band."*

She records the value:

```
moisture = 71.4 %            no spec to judge it against

v1 · K. Menon — Lab Technician
BEFORE_HOPPER_PASS_D4 · calibration unknown

                     [ Measured again? Order a retest ]
```

- **"No spec to judge it against"** — the system did not pass or fail it, because two sources
  disagree and nobody has decided.
- **"Calibration unknown"** — nothing states a calibration interval, so it does not claim the
  instrument was fine.
- **No edit button anywhere.** A wrong reading is corrected by a retest that names its reason, and
  the first reading stays on the record.

There is no "overdue" list, and the screen says why: nobody has stated how long a test should take,
so calling something late would be inventing a standard.

**Missing:** she cannot attach a photograph. Raw-material approval does not exist — she can test
what is in a bunker but cannot approve or reject a truckload before it is used.

---

## 5 · The Supervisor journey

**One question: what is waiting on my decision?**

The **Control Room**, ordered by urgency rather than by batch:

```
TIME-CRITICAL GATES  0    No rest opens or expires in the next four hours.
LAB FAILURES         0    No reading is outside its stated band.
OPEN DEVIATIONS      3

  Actual quantity 3.6 MT against 2.000 MT planned (+1.60)
  Bagasse Weighment · Load 07 · MB-DEMO-EARLY
  raised 18h 20m ago by Ravi — Field Operator

  REASON — RECORDED VERBATIM, PERMANENTLY

  [ Accept with deviation ]   [ Escalate to GM ]
```

He can release, hold, return for correction, accept with a deviation on the record, or escalate.
Whatever he writes is kept word for word and never edited. He can also open any batch's plan and
reassign people and machines.

**This is one of the more complete parts of the product.**

---

## 6 · The Chairman journey

**Two questions: what is happening, and why?**

```
NEEDS YOU
  Bagasse Weighment · Load 07: actual 3.6 MT against 2.000 MT planned
  Waiting on supervisor for 16h 50m                     [ look at it ]

RUNNING 4     ON PLAN 3     NEEDS A DECISION 3     HELD 1

THE FACTORY
  MB-DEMO-LATE   ████████████████████░░░░░░░░░  H419
  MB-DEMO-MID      ██████████░░░░░░░░░░░░░░░░░  H227
  MB-DEMO-EARLY      ██░░░░░░░░░░░░░░░░░░░░░░░  H35
```

**No percentage complete, anywhere, on purpose.** Half the process is resting and rest does not
compress. A batch at hour 419 is not "76% done" in any way he can act on.

He clicks a batch and gets its whole life on one ruler — plan above, actual below, the gap visible
without reading a number. Under it, in plain English:

> **MB-DEMO-LATE is 3h 51m behind plan**, on the bunker stream — the slowest one, which is the one
> that sets the batch. The largest single piece — **44m** — came from Bunker Fill Check · Line 1 of 3,
> run by **K. Menon**, and no reason was recorded for it. […] At this rate it finishes **Sat 29 Aug,
> 8 am** — about 3h 51m after the planned 5 am.

**Nobody wrote that.** Every fact is a record from the floor. It names the person, quotes the reason
exactly, and where no reason was recorded it says so — which is the sentence that makes him ask.

He can also open **The Plant** — every bunker and tunnel, occupied or empty:

```
BUNKERS                                          3 of 11 in use
  Bunker 1 empty   Bunker 2 empty   Bunker 3 empty   …
  Bunker 7 MB-DEMO-MID · Bagasse Rest · H231 · in since 20h 37m
```

**The empty ones are the point.** That is capacity.

### Clicking through to proof

```
"Why is this batch late?"
        ↓
"Bunker reload ran 42 minutes long"
        ↓
BUNKER 3 → BUNKER 7
  SUPPOSED TO BE   2 h
  WHAT HAPPENED    08:14 → 10:56
  WHO              Ravi
  MACHINE          JCB-02
  MEASURED         moisture 71.4%   ⚠ two specs disagree
  PROOF            [ before ] [ after ]
  LAB              Meena, 09:40
  DECISION         Released by Anand 10:15
                   "material acceptable, sweet smell"
```

**The last panel does not exist.** Every fact in it is stored. Fifty photographs are in the system
and none of them displays anywhere. **This is the biggest single hole in the product today.**

---

## 7 · How one batch connects all five

```
            MONTHLY SCHEDULE
                    │
                  ADMIN
        answers business questions
                    │
                    ▼
        SYSTEM GENERATES THE PLAN
   tasks · days · streams · durations
   photographs · lab checks · order
                    │
                 ACTIVATE
              the plan freezes
                    │
         ┌──────────┼──────────┐
         ▼          ▼          ▼
     OPERATOR      LAB     MACHINES
     records      tests    & VESSELS
         │          │          │
         └──────────┼──────────┘
                    ▼
              PLAN vs ACTUAL
                    │
            ┌───────┴───────┐
            ▼               ▼
        ON PLAN         DEVIATION
                            │
                       SUPERVISOR
                    decides, in writing
                            │
                            ▼
                        CHAIRMAN
              sees the factory, the batch,
              and the evidence behind both
```

**Nobody enters the same fact twice.** The operator records a weight once. It becomes the progress
card on his phone, the variance on the chairman's screen, the deviation in the supervisor's queue,
and a clause in the paragraph. One copy, one origin.

---

## 8 · What already exists, screen by screen

| What | Where | State |
|---|---|---|
| Sign in, role decides the screen | web + phone | **Works** |
| Admin home — starts today, running, needs you | web | **Works** |
| New Batch — identity, date, **start time**, supervisor, quantities, auto load-splitting | web | **Works** |
| Plan review day by day, assign people and machines | web | **Works** |
| Validate — every problem in plain words | web | **Works** |
| Activate — the plan freezes | web | **Works** |
| Operator: my work, task, readings, photograph capture, submit | phone | **Works** |
| Rest countdowns on the factory clock | phone | **Works** |
| Out-of-range recordable, raises a deviation | phone | **Works** |
| Lab: queue, sample, checkpoint choice, readings, retest | phone | **Works** |
| Supervisor Control Room — release, hold, return, accept, escalate | web | **Works** |
| Chairman Control Tower — exceptions, counters, batches | web | **Works** |
| Batch page — the ruler, the paragraph, every event | web | **Works** |
| The Plant — every vessel, occupied or empty | web | **Works (new)** |
| Resources — machine and vessel use | web | **Works** |
| Bunker/tunnel assignment refuses double-booking | database | **Works — no screen** |
| Hour-level planned start and end per task | database | **Stored — no screen, filled at day level** |

---

## 9 · Exactly which screens must change

| Screen | Change |
|---|---|
| **New Batch** | Add step 4 (bunkers and tunnels) and step 5 (timing). Both write to storage that already exists. |
| **Plan review** | Show the four registers side by side — standard, this batch, actual, forecast — and let Admin edit "this batch". Today it is readable but shaped for a developer. |
| **Control Tower** | Replace the bars in `THE FACTORY` with the calendar staircase across concurrent batches. |
| **Batch page** | Add the physical flow diagram beside the ruler. The plant data to draw it now exists. |
| **Batch page** | Add the proof panel — clicking anything opens what should have happened, what did, who, machine, reading, photographs, lab result, decision. |
| **Operator task** | Show captured photographs back. |
| **Lab reading** | Allow a photograph on a reading. |

---

## 10 · What works — the scoreboard

```
✅  Admin can create a Master Batch with a real start instant
✅  System generates every task, day, stream and dependency
✅  System splits quantity into truck loads by itself
✅  Admin can assign people and machines
✅  System validates and refuses an incomplete plan
✅  Activation freezes the plan
✅  Operator can execute work from the phone
✅  Operator can capture evidence, and cannot submit without it
✅  Rest gates open on the factory clock, never the device
✅  Lab can sample, measure, and order a retest without overwriting
✅  Supervisor can resolve deviations, in writing, permanently
✅  Chairman can see every active batch and what needs a decision
✅  Chairman gets a written explanation of why a batch is late
✅  Batch can be followed hour by hour from start to end of baseline
✅  Every vessel in the plant shows what is in it
```

## 11 · What is missing

```
❌  Monthly schedule — Admin has nowhere to start from
❌  Material formulation — moisture, nitrogen, carbon, C:N, cost
❌  Raw-material lots, suppliers, and approve/reject before use
❌  Weighbridge detail — vehicle, slip number, gross/tare/net
     (and the "same slip twice" rule, which needs the slip number stored)
❌  Bunker and tunnel assignment SCREEN
❌  Hour-level timing SCREEN
❌  Evidence panel — 50 photographs stored, none displayed
❌  Physical flow diagram
❌  Growing rooms
❌  Harvest, yield, cost, profitability
❌  Reports and Excel export
❌  Offline capture — see the decision below
```

### One decision only you can make

Your workflow document requires **offline capture with automatic sync**. The system is built the
opposite way, deliberately, after confirming reliable internet and around thirty users. Offline
recording also weakens the guarantee that a device clock can never open a rest window. Both
positions are on record and they contradict each other. **This is a business decision.**

---

## 12 · Implementation order

| | What | Why here |
|---|---|---|
| **1** | **Admin batch creation — bunkers, tunnels, and hourly timing** | One journey, not two projects. Both write to storage that already exists, so this is screens, not foundations. It is also what makes the whole product hourly. |
| **2** | **Evidence panel** | Smallest work on this list, biggest visible hole. Fifty photographs are already stored. |
| **3** | **Monthly schedule** | Where Admin's morning should begin. Feeds step 1. |
| **4** | **Chairman's staircase and flow diagram** | The two pictures that make the factory legible at a glance. The plant data now exists to draw them. |
| **5** | **Raw material — suppliers, lots, approval** | The laboratory machinery is built; it needs something to attach to. |
| **6** | **Formulation and the material requirement sheet** | The mix, the C:N, the cost. The requirement sheet falls out of it nearly free. |
| **7** | **Weighbridge detail** | Slip number and the double-entry rule. |
| **8** | **Growing rooms and harvest** | The largest new ground. Everything about yield depends on it. |
| **9** | **Reports and Excel** | Last, because most reports need step 8 first. |

---

## 13 · How we know each screen is done

Each one is a thing a person can do, start to finish, without help.

| Screen | Done when |
|---|---|
| **Monthly schedule** | Admin opens it on a Monday, sees which batch groups are due this month and which vessels are already committed, clicks one, and lands in batch creation with the date and batch numbers already filled. |
| **Batch creation — vessels** | Admin assigns Line 1 → Bunker 3. She then tries to give Bunker 3 to a second batch whose dates overlap, and the screen refuses and names the batch already holding it. |
| **Batch creation — timing** | Admin sets bunker reload to 09:00 on Day 12. The plan shows standard 2 h beside this batch 09:00 → 11:00. Nothing she leaves alone changes. After activation, the ruler places that task at that hour and not at the start of the day. |
| **Plan review** | A factory admin who has never seen the system reads a day and can say what happens, who does it, how long it should take and what proof is needed — without asking anyone. |
| **Validate** | A plan missing a person, a duration and a bunker produces three sentences naming the activity and the problem, and activation is refused until all three are cleared. |
| **Operator task** | Ravi records a weight, takes a photograph, submits, and the next task appears — without typing a single timestamp. Submitting without the photograph is refused with a reason. |
| **Out-of-range** | Ravi records 3.6 MT against a 2.0 MT target. It saves. He is asked why. It reaches the supervisor within a minute. |
| **Rest gate** | A phone set 48 hours forward does not open a rest window. |
| **Lab reading** | K. Menon takes a sample, picks the checkpoint map, records moisture, and sees the reading with its verdict, her name, the map she chose, and the calibration state. She cannot edit it afterwards; she can only retest, and the first reading stays visible. |
| **Control Room** | A supervisor arriving at 6 am sees the longest-waiting decision first, with the operator's own words, and can resolve it in one click plus a reason. |
| **Control Tower** | The chairman sees twelve concurrent batches as a staircase on the calendar, current position on each, and every exception ordered by how long it has been waiting. No percentage anywhere. |
| **Batch page** | The chairman drags one marker and the ruler, the events and the paragraph move together. The paragraph names a person and quotes a reason, or says none was recorded. |
| **Proof panel** | Clicking "bunker reload" shows the photographs themselves, the operator, the machine, the lab reading, the supervisor's decision and their exact words — in one panel, without leaving the page. |
| **The Plant** | A planner opens it and can immediately say which bunkers are free next Tuesday. |
| **Excel export** | A month's production comes out as a file the office can open, with the same numbers as the screens. |

---

## The product in one line

**A factory planning and accountability system: one Admin creates a production plan, workers execute
it from their phones, and the Chairman can see hour by hour whether the factory followed the plan —
and prove what happened when it didn't.**
