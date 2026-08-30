> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# MushroomOS — what each person actually does

**23 August 2026.** Written in factory language. No build codes, no database terms.

---

## First: the thing Book1 tells us, and what the product got wrong

Book1 is a single sheet. Down the side are the dates. Across the top are the **24 hours of a day**.
In every cell is a number — 1 through 552 — counting the hours of the batch from the moment it
starts. Three batches, each 552 hours, each starting two days after the last.

That sheet says something plain: **the chairman keeps time in hours, not days.** Hour 419 is a real
place. "Day 17" is a rounding of it.

**The product built the clock correctly and then hung a daily plan on it.**

Every batch runs on a 552-hour clock, and that part is right. But when we look at where the
activities actually sit on that clock, all 800 of them land on only **fourteen** positions — hour 0,
24, 48, 96, 120, 144, 168, 192, 240, 288, 312, 360, 384, 528. Every one is a multiple of 24. They
were not read from a source; they were calculated as *day number × 24*.

So a supervisor asking "when does the reload start on Day 12" gets "hour 288", which means
"sometime on Day 12". Book1 can say Thursday 3 PM. The plan cannot.

**This is the single biggest gap between the product and the chairman's own way of working**, and it
is not something a programmer can fix by working harder. Book1 gives us the *calendar* — which
wall-clock hour is hour 419 — but it does not say what happens in hour 419. Nothing we have does.
Somebody at the factory has to say "bunker reload starts at hour 5 of Day 12, and takes 2 hours," or
we keep guessing at day level.

Two ways forward, and this is a business decision, not a technical one:

1. **The factory states the standard hours.** For each of the roughly 60 operations, what hour of
   its day does it normally start, and how long does it normally run. That is maybe two hours of
   somebody's time and it makes the whole product hourly.
2. **We learn them from the floor.** The system already records the real start and finish of every
   task to the minute. After three or four batches we would know the true hours from what actually
   happened, rather than from what anyone remembered.

Option 1 gives it to us next week. Option 2 gives it to us honestly but slowly. They are not
exclusive — state them now, correct them from reality later.

Everything below assumes we fix this. Until we do, every screen that says "Day 5" could be saying
"Wednesday 11 AM" and isn't.

---

## The shape of the whole thing

```
                        ONE SHARED DATABASE
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
    WEB BROWSER              PHONE                    PHONE
    Management            Operator                  Lab technician
    Admin · Supervisor    "What do I do?"           "What do I test?"
    Manager · Chairman
```

**One phone app, two experiences.** The same file installs for both. It looks at who signed in and
opens straight into that person's work — an operator never sees the lab queue, a lab technician
never sees the operator's task list, and neither ever sees a management screen. That was a
deliberate choice made when we confirmed the factory has reliable internet and around thirty users:
two separate apps would mean two things to install, two to update, and two to keep in step.

---

## 1 · ADMIN

**Her whole job is one sentence: turn the month's production schedule into one batch the factory can
actually run.** She does not create tasks. She does not maintain the 552 hours. She answers business
questions and the system builds everything else.

### What she does today

She signs in and lands on **Today**, which shows three things and nothing else: what starts today,
what is running, what is waiting on her.

She clicks **New Batch** and answers five short questions:

| | |
|---|---|
| **What is it called** | The name on every screen after this |
| **Day 0 date** | Day 0 is fibre weighment; every other day counts from here |
| **Day 0 start time** | The hour the clock starts. Defaults to the factory's own start hour |
| **Supervisor** | Who releases work and handles problems |
| **How much material** | Total tonnes, and what fits on one truck |

She does **not** type "11 loads". She says 21 tonnes and 2 tonnes per truck, and the system works
out eleven loads — ten of 2 tonnes and a last one of 1 tonne. Before she commits, the screen tells
her how many tasks this will create in total and across how many parallel streams.

She clicks create. The system builds the whole plan: every task, on every day, in every stream, with
its standard duration, the photographs it will require, the lab tests it will need, and the order
things must happen in.

Then she opens the plan and sees it day by day:

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

On each task she can set the person and the machine. She can change quantities and durations.
Anything she does not set, the process supplies.

Before she can start the batch, the system checks it and lists every problem in plain words — *"this
rest has no duration"*, *"this task has nobody assigned"*, *"this reload goes back into the bunker it
came from"*. It refuses to start a batch with any of those outstanding.

She clicks **Activate**. **The plan freezes.** From that moment a target can only change through a
recorded deviation or a supervisor's decision — nobody can quietly edit what the operators were
working to.

### What is missing from her journey

- **She cannot say which bunker.** The plan says "Line 1 of 3" and "Tunnel 2 of 3" — a slot, not a
  place. The engine that assigns Bunker 7 and warns if Bunker 7 is already taken was built today,
  but there is no screen for her to use it. Right now the bunkers were filled in by a script.
- **There is no monthly schedule to start from.** She creates batches one at a time. The screen that
  should show "23 August: new production scheduled, Master Batch 127–129" does not exist.
- **She cannot see the mix.** How much bagasse, how much manure, what the carbon-to-nitrogen ratio
  comes to, what the batch costs. None of that is in the system.

---

## 2 · OPERATOR

**One question: what do I need to do?**

He opens the app on his phone. It knows him. There is no menu, no navigation bar, and nothing on
screen except his work — a deliberate decision, because a link to somewhere he cannot go is worse
than no link.

```
Ravi — Field Operator

MY WORK                    48 tasks open

FIBRE WEIGHMENT PROGRESS
Target 63.0 MT   Loaded 57.00 MT   Remaining 6.00 MT
Loads 30 / 33                        derived, not typed

DAY 0
  Bagasse Weighment · Load 09 of 11        IN PROGRESS
  target 2 MT
```

Those numbers are added up from loads that were actually recorded. Nobody types them, so nobody can
mistype them.

He taps a task:

```
BAGASSE WEIGHMENT
Load 09 of 11 · Day 0

How much fibre does this batch need,
and how much fits on one truck?

Target quantity     ___ MT
Actual quantity     ___ MT

EVIDENCE · 0 / 1
  ○ Load photo — weighbridge slip or loaded vehicle
                                       [ Capture ]

REMARKS

  1 evidence item outstanding

  [ Submit · 1 evidence item outstanding ]
```

He records the weight, takes the photograph, submits. The times are recorded for him — he never
types a start or finish time.

**If the number is outside the target he can still record it.** The system does not block him. It
warns him, asks him to say why, and sends it to his supervisor as a deviation. Blocking the real
number would only teach him to write down a fake one.

**The photograph gates the submission, not the recording.** He can enter figures all he likes; he
cannot finish the task without the photograph, and that rule is enforced by the system, not by the
button.

When a task is waiting on time — a 48-hour rest — he sees it counting down:

```
Bagasse Rest · Line 3 of 3
RESTING · 30 h 07 min remaining
```

**That timer is the factory's clock, not his phone's.** Setting a phone forward two days does not
open a rest.

### What is missing

- He cannot see the photographs he or anyone else has taken. Fifty are stored and none of them
  displays anywhere.
- There is no "take a live photograph only" rule — an old picture from the gallery is accepted.

---

## 3 · LAB TECHNICIAN

**One question: what do I need to test?**

Same app, different door. She signs in and lands on her queue — currently 35 things waiting.

```
LAB                        35 waiting on a reading

Bagasse (new) Moisture Check          MB-DEMO-MID
Whole batch · Day 4
moisture_pct
0 samples · 0 readings recorded
                                  [ Take a sample ]
```

She taps **Take a sample**, and the screen asks her something honest:

> **Two source maps describe the same moments under different codes, and nothing in the sources says
> which one the factory follows. Pick the one you are actually working to — the system will not
> choose for you, and your choice is recorded with the sample.**

Both maps are listed. Several say plainly: *"No spec is mapped to this checkpoint, so readings taken
here will have no pass/fail band."* She picks the one she actually works to. Her choice is stored
with the sample, so if the factory settles the question later we know exactly which readings to
revisit.

She records the value:

```
moisture_pct = 71.4        no spec to judge it against

v1 · K. Menon — Lab Technician
BEFORE_HOPPER_PASS_D4 · calibration unknown

           [ Measured again? Order a retest ]
```

Three things worth noticing:

- **"No spec to judge it against"** — the system did not pass it and did not fail it, because two
  sources give different specs and nobody has decided. It says so instead of picking one.
- **"Calibration unknown"** — no source gives a calibration interval, so it does not claim the
  instrument was fine.
- **There is no edit button.** A wrong reading is corrected by a retest that names its reason. The
  first reading stays on the record, because *"we measured it twice"* is itself a fact worth keeping.

There is also no "overdue" list, and the screen says why: nobody has ever stated how long a lab test
should take, so calling something late would be inventing a standard.

### What is missing

- She cannot attach a photograph to a reading.
- Raw material testing does not exist. She can test what is in a bunker; she cannot approve or
  reject a truckload of straw before it is used.

---

## 4 · SUPERVISOR

**One question: what is waiting on my decision?**

He signs in to the web app and lands on the **Control Room**, ordered by urgency rather than by
batch:

```
TIME-CRITICAL GATES    0
  No rest window opens or expires in the next four hours.

LAB FAILURES           0
  No lab result is outside its stated band.

OPEN DEVIATIONS        3
  Actual quantity 3.6 MT against 2.000 MT planned (+1.60)
  Bagasse Weighment · Load 07 · MB-DEMO-EARLY
  raised 18h 20m ago by Ravi — Field Operator

  REASON — RECORDED VERBATIM, PERMANENTLY

  [ Accept with deviation ]   [ Escalate to GM ]
```

He can release work, hold it, send it back for correction, accept it with a deviation on the record,
or escalate it. Whatever he writes is kept word for word and never edited.

He can also open any batch's day-by-day plan and reassign people and machines.

### What is missing

Not much — this is one of the more complete parts. There is no view of which bunkers are free before
he reassigns, though the new plant screen now answers that.

---

## 5 · GM / CHAIRMAN

**One question: what is happening in my factory?**

He signs in and sees the **Control Tower** — what needs a decision first, then the shape of the
factory:

```
NEEDS YOU
  Bagasse Weighment · Load 07: actual 3.6 MT against 2.000 MT planned
  Waiting on supervisor for 16h 50m                    [ look at it ]

RUNNING  4        ON PLAN  3        NEEDS A DECISION  3       HELD  1

THE FACTORY
  MB-DEMO-LATE    H419 of 552
  MB-DEMO-MID     H227 of 552
  MB-DEMO-EARLY   H35  of 552
```

**There is no percentage complete anywhere, on purpose.** Half the process is resting, and rest does
not compress. A batch at hour 419 of 552 is not "76% done" in any sense he can act on.

He clicks a batch and gets its whole life on one ruler — the plan above, what actually happened
below, and the gap between them visible without reading a number. Under it, in plain English:

> **MB-DEMO-LATE is 3h 51m behind plan**, on the bunker stream — the slowest one, which is the one
> that sets the batch. Measured on 16 of 100 activities. The largest single piece — **44m** — came
> from Bunker Fill Check · Line 1 of 3, run by **K. Menon**, and no reason was recorded for it. […]
> At this rate it finishes **Sat 29 Aug, 8 am** — about 3h 51m after the planned Sat 29 Aug, 5 am.

**Nobody wrote that paragraph.** Every fact in it is a record from the floor. It names the person, it
quotes the reason exactly as recorded, and where no reason was recorded it says so — which is the
sentence that makes him go and ask.

Beside it is every event on the batch in order, and dragging the marker moves all three views
together.

New today, he can also open **The Plant**:

```
BUNKERS                                     3 of 11 in use
  Bunker 1  empty      Bunker 2  empty      Bunker 3  empty
  Bunker 4  empty      Bunker 5  empty      Bunker 6  empty
  Bunker 7  MB-DEMO-MID                     Bunker 8  MB-DEMO-MID
            Bagasse Rest                              Bagasse Rest
            H231 · in since 20h 37m
  Bunker 10 empty      Bunker 11 empty

TUNNELS                                     0 of 12 in use
  Tunnel 1  empty   …
```

Every vessel the factory has, occupied or empty. **The empty ones are the point** — that is capacity,
and it is what a planner needs to see.

### What is missing

- The physical flow picture — bagasse → weighment → hopper → Bunker 3 → Bunker 7 → yard → tunnels —
  as a drawn diagram. The plant screen is the first half of it: we now know where things are. The
  arrows between them are next.
- Yield. Cost. Anything about mushrooms. See section 9.

---

## 6 · How one batch connects all five

```
          ADMIN
   answers five questions
            │
            ▼
   SYSTEM BUILDS THE PLAN
   every task · every day · every stream
            │
   ┌────────┼────────┐
   ▼        ▼        ▼
OPERATOR   LAB    MACHINES
records   tests   & VESSELS
what        what   who used
happened    it was  what, when
   │        │        │
   └────────┼────────┘
            ▼
      REAL vs PLANNED
            │
      ┌─────┴─────┐
      ▼           ▼
  ON PLAN     DEVIATION
                  │
                  ▼
             SUPERVISOR
             decides, in writing
                  │
                  ▼
              CHAIRMAN
   sees the batch, the plant, and
   the paragraph explaining both
```

The important part: **nobody enters the same fact twice.** The operator records a weight once. It
becomes the progress card on his own screen, the variance on the chairman's, the deviation in the
supervisor's queue, and a line in the paragraph. There is one copy of everything and one place it
came from.

---

## 7 · What the phone app does today

One installable file. It carries the whole application inside it, so there is no website to keep
running — only the data comes over the internet.

**It works:** sign in, land on your own work, record readings, capture photographs, submit, see rest
timers counting on the factory's clock, take lab samples, record readings, order retests.

**It does not work offline.** Nothing is queued if the signal drops. This is worth being clear about
because your workflow document asks for offline capture and the system is currently built the
opposite way — deliberately, after we confirmed the factory has reliable internet. Offline recording
would also weaken the guarantee that a phone's clock can never open a rest window. **This is a
decision for you, not for us**, and it is the one real contradiction between the document and the
build.

**Updating it means sending a new file.** There is no automatic update.

---

## 8 · What the web app does today

| Screen | Who | State |
|---|---|---|
| Today | Admin, Manager | Works |
| Batches | Management | Works |
| New Batch | Admin, GM | Works — missing bunker assignment and the material mix |
| Batch plan, day by day | Admin, Supervisor | Works — assign people and machines, validate, activate |
| Batch page | Management | Works — the ruler, the paragraph, every event |
| Control Room | Supervisor, GM | Works |
| Control Tower | Management | Works |
| **The Plant** | Management | **New today** |
| Resources | Manager, Admin, GM | Works — machine and vessel usage |
| Process | Management | Works — what the standard process says |
| Monthly schedule | Admin | **Does not exist** |
| Growing rooms | — | **Does not exist** |
| Harvest | — | **Does not exist** |
| Reports and Excel | — | **Does not exist** |

---

## 9 · What needs to change

In the order I would do it.

**1 · Make it hourly.** The thing at the top of this document. Get the factory to state the standard
hours for each operation, or start learning them from recorded reality. Until this is done, every
screen is rounding the chairman's own way of working to the nearest day.

**2 · Let Admin choose the bunkers and tunnels.** The engine exists as of today and refuses to
double-book. It needs a screen in the batch-creation flow — *Line 1 → Bunker 3, Line 2 → Bunker 7* —
and a warning when a vessel is taken.

**3 · Show the photographs.** Fifty are stored and none of them displays. This is the smallest piece
of work on this list and the most visible hole in a demonstration.

**4 · The physical flow picture.** Bagasse → weighment → hopper → bunkers → yard → tunnels, drawn,
with the batch's position on it. The plant screen made this possible today by recording where things
actually are.

**5 · Raw material: suppliers, lots, approval.** A truckload of straw needs to be testable and
rejectable before it enters a batch. The laboratory machinery for this is already built — it just
has nothing to attach to.

**6 · The mix.** How much of each material, the carbon-to-nitrogen ratio, what the batch costs. This
is the calculation your workflow document opens with and it does not exist in any form.

**7 · Weighbridge detail.** Vehicle number, slip number, gross and tare weight — and the rule that
the same slip cannot be entered twice, which we cannot enforce today because the slip number is not
recorded anywhere.

**8 · Growing rooms and harvest.** The largest single piece of new ground. The system currently stops
at the tunnel. Every question about yield, kilograms per square metre, yield per tonne of compost,
and batch profitability depends on this existing first.

**9 · Reports and Excel.** Last, because most of the reports need item 8 to exist before they have
anything to report.

**10 · The monthly schedule.** Where Admin's morning should start. Blocked on a question about how
days are numbered that nobody has settled yet.

---

## What I would put in front of someone tomorrow

The operator's task screen, the lab reading, the supervisor's decision, the chairman's paragraph, and
the plant. That chain is real, it is connected, and every number in it came from somebody's hands.

**Say out loud what is not there:** no photographs on screen, no growing rooms, no harvest, no
reports. It runs out after about five minutes, and it is better to say so than to be asked.
