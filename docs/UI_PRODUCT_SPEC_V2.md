# MushroomOS — UI / Product Specification v2

**One system, six lenses.** Not six dashboards with different permissions.

This is the interaction model. It is frozen before implementation so the tools implement a product
rather than deciding one.

---

## 1 · The rule that shapes everything

**The screens render the process. They never contain it.**

No screen may hold a duration, a dependency, a day number, a parameter list or an evidence rule. All
of those are configuration. When the factory says *"that rest is 12 hours, not 14"*, the answer is a
changed value — not a changed screen.

```
        PROCESS DEFINITION
   activities · durations · dependencies
   roles · evidence rules · lab checks
   resource requirements
                 │
                 ▼
          UI RENDERER
   the same components, whatever the process says
```

**This already holds in the data.** Every one of those is stored, not written into software. What
has not held is the UI: screens were built around what the process happens to say today. That is
what v2 corrects.

**Test for any screen:** if the factory changed a duration and the screen needed editing, the screen
is wrong.

---

## 2 · The seven visual primitives

The entire application is built from these. Nothing else. If something cannot be expressed with
them, either it does not belong or one of them needs extending — deliberately, once, here.

---

### P1 · H-HOUR RAIL

**Says:** where this batch is in its life, and whether it is where it should be.

```
H0 ──────────────────────────────────────────────── H552
PLAN     ████████████████░░░░░░░░░░░░░░░░░░░░░░░░
ACTUAL   ██████████████████░░░░░░░░░░░░░░░░░░░░░░
                          ▲ NOW  H419 · Sat 6 AM
                                          +3h 51m
```

- Four registers, never merged: **standard · plan · actual · forecast**.
- Hour and calendar time always side by side. `H419` alone is engineer language.
- The offset between the plan rail and the actual rail *is* the delay. No number needed to see it.
- Forecast is drawn dashed and lighter. A forecast must never look like a fact.
- **No percentage complete, anywhere.** Half the process is resting; rest does not compress.
- Scrubbing the rail moves every other primitive on the screen.

**States:** not started · running · resting · held · finished · past H552.

---

### P2 · PROCESS GRAPH

**Says:** what depends on what, and what is free to move.

```
        ┌─ PILE 1 ─ T0 ─ rest ─ T1 ─ rest ─ T2 ─┐
YARD ───┼─ PILE 2 ─ T0 ─ rest ─ T1 ────────────┼─── BUNKER
        └─ PILE 3 ─ T0 ─ rest ─────────────────┘
```

- Drawn from the recorded dependencies. Never a hand-drawn picture of today's process.
- **No global barrier.** Pile 2 reaching T2 first goes on to bunker loading while Piles 1 and 3 are
  still turning. The graph must show that as normal, not as an error.
- Blocked nodes carry the reason on their face.

---

### P3 · PARALLEL LANES

**Says:** what else is happening for this batch that is not on the main spine.

```
MAIN      H0 ─ Wetting ─ Bunker ─ Conditioning ─ Unload ─ Reload ─ ▸
──────────────────────────────────────────────────────────────────
PADDY              Weighment ─ Slips ─ Bale cutting ─ Soak 1 ─ ▸
NITROGEN                    Manure + gypsum + AS ─ Rotavator ─ ▸
READINESS                        Bunker clean ─ Tunnel clean ─ ▸
```

- The main spine stays uncluttered. Parallel work is a lane, not an interruption.
- Every lane item opens the same way: **who · when · resource · evidence · status · delay**.
- Lanes are derived from the stream each activity belongs to. Adding a stream adds a lane.

---

### P4 · RESOURCE MAP

**Says:** the physical factory, right now.

```
BUNKERS   B1 ▓ MB-391    B2 ░ empty     B3 ▓ MB-388   B4 ░ held for MB-392
TUNNELS   T3 ▓ MB-390    T4 ░ empty     T5 ▒ cleaning
MACHINES  JCB-02 ▓ MB-391   Turner-03 ░ free   Hopper-01 ▒ maintenance
```

- **Every vessel is drawn, occupied or not.** Empty is capacity and it is the most useful state on
  the screen for a planner.
- Three states are distinct and must not be merged: **holding** (material is physically in it),
  **held for** (a plan claims it, nothing in it yet), **unavailable** (cleaning, maintenance).
- Machine hours are derived from timestamps. There is no field anyone can type hours into.

---

### P5 · ATTENTION STREAM

**Says:** what needs a person, ordered by how long it has been waiting.

```
MB-391   Delay +4h                waiting on manager 3h 20m
MB-392   Lab approval waiting     waiting on GM 1h 05m
MB-394   Resource conflict        Turner-03 double-booked
```

- Ordered by **wait**, never by batch. The oldest blockage has cost the most.
- Every row names **who** it is waiting on, not who performs the work — those differ.
- A count badge is not an attention stream. Each row is a sentence someone can act on.
- Empty is a real, good state and says so plainly.

---

### P6 · PROOF DRAWER

**Says:** everything behind one activity, in one place.

```
BUNKER RELOAD · line 2 · H288
SUPPOSED TO BE   2h, into a different bunker
WHAT HAPPENED    Bunker 5 → Bunker 3 · 09:00 → 11:42
WHO              Ravi          MACHINE   JCB-02 · 2h 42m
MEASURED         moisture 71.4%   ⚠ two specs disagree
PROOF            [ before ] [ after ]   uploaded 11:38 by Ravi
LAB              moisture 71.4 · pH 8.2 · Meena 09:40
DECISION         Released by Anand 10:15
                 "material acceptable, sweet smell"
```

- **The media opens.** "2 photos" is not proof. If the object does not display, the drawer has
  failed its only job.
- The decision reason is quoted exactly. Never summarised.
- Where a value is disputed, the conflict is named and the system states it did not judge.
- One component. Every primitive opens it. Same order every time.

---

### P7 · CAUSALITY CHAIN

**Says:** why, and what it cost.

```
H120  Bunker Loading
        ↓
      JCB-02
        ↓
      Hydraulic failure
        ↓
      +7h
        ↓
      forecast +7h
        ↓
      H552 +7h
```

- Activity → resource → constraint → delay → forecast → **H552 impact**.
- Every link is clickable and opens the proof drawer.
- Where no reason was recorded, the chain says so — that absence is the finding.
- Contributors come from the stream the headline came from, so the minutes shown add up to the
  number above them.

---

## 3 · The six lenses

Each role gets one question answered. Built from the primitives above, arranged differently.

| Lens | The question | Primitives, in order |
|---|---|---|
| **Operator** | What do I do now? | current task · proof capture · rail (own batch only, small) |
| **Lab** | What needs testing now? | attention stream (own queue) · proof capture · result history |
| **Admin** | What am I planning and authorizing? | process graph · parallel lanes · resource map · rail (plan register) |
| **Manager** | What needs my decision? | attention stream · proof drawer · resource map |
| **GM** | What is happening, and what needs attention? | attention stream · resource map · rail (all batches) |
| **Founder** | Why, who, what proves it, what did it cost? | causality chain · proof drawer · rail · comparisons |

**The same batch, seen six ways. Not six copies of it.**

---

## 4 · The eleven surfaces

For each: purpose · who · what they see · what they do · what happens automatically · what it reads.

---

### 1 · Operator — My Work
**Mobile-first.** Purpose: answer *what do I do now* and nothing else.
Sees: active batches, current assigned task, batch hour with calendar time, the machine and vessel
needed, what to record, what to photograph.
Does: **Start → photo → complete.** Raise a delay ticket if late.
Automatic: start and finish timestamps, actor, machine, vessel. Out-of-range values are recorded and
routed, never blocked. Evidence gates submission, not recording.
Reads: the activated plan for tasks assigned to them.
**Never sees:** the management graph, other roles' work, process definitions.

### 2 · Lab — Queue
**Mobile-first.** Purpose: *what needs testing now*, across every batch at once.
Sees: all active batches, what is due, the target band, the parameters.
Does: enter results, capture evidence, submit, **move immediately to the next batch without
waiting for approval**.
Automatic: freezes the spec band at request time; reports `no specification` where none exists;
preserves every earlier version — a retest never overwrites.
Reads: lab checkpoints and the specification tables.

### 3 · Admin — Batch Setup
**Desktop-first.** Purpose: turn a scheduled slot into a runnable batch.
Sees: the guided flow — slot, identity, H0, materials and formulation, quantities, resources,
generated timeline, operator plan, lab plan, evidence plan, review.
Does: configure; the system generates. Activate freezes the plan.
Automatic: load splitting, dry-to-fresh weight, task generation, vessel conflict refusal, validation
in plain sentences.
**Tunnel selection is available but not required at H0** — it is a planning decision later in the
batch's life.

### 4 · Manager — Decision Center
Purpose: *what needs my decision*.
Sees: attention stream — lab approvals, delay tickets, resource conflicts, held work.
Does: approve, reject, release, hold, return, accept with deviation, escalate.
Automatic: orders by wait. Records who, when, what, and the reason verbatim.
**Cannot rewrite an actual timestamp.** Approval and history are separate things.

### 5 · GM — Factory Now
Purpose: *what is happening, what needs attention*.
Sees: current factory hour, count of active batches, attention stream, resource map, every batch
with its hour and its variance.
Does: click through to the causality chain.
**Not a KPI wall.** No number appears that cannot be acted on.

### 6 · Founder — Batch Story
Purpose: *why is it late, who, what proves it, what did it cost*.
Sees: the rail, the causality chain, the proof beside it, comparison against other batches.
Does: drill from H552 impact all the way down to a photograph.

### 7 · Batch Story / Batch Detail
The shared deep view. Rail + process graph + parallel lanes + event history, all on **one playhead**.
Drag to H419 and every panel shows H419.
Drills into individual batches — 366 → Tunnel 10 — each with its own timeline from tunnel loading on.

### 8 · Parallel Operations
**A first-class screen, not a footnote.** Paddy preparation, bale cutting, manure and mineral
preparation, bunker cleaning, tunnel cleaning, machine maintenance, resource preparation.
Every item batch-linked and carrying actor, timestamps, evidence, status, resource.

### 9 · Resource Map
The plant as a place. Bunkers, tunnels, lagoon, yard, hopper, machines. Occupied, held, empty,
unavailable. Click a vessel to open what is in it.

### 10 · Evidence / Audit
Every record for a batch in order, with the media reachable. Who entered, who changed, old value,
new value, when, why.

### 11 · Daily Factory Report
Generated from the record. **Nobody re-enters anything.** Yesterday's completions, delays and their
reasons, approvals, resource utilisation, what is due today. Exportable.

---

## 5 · Interaction rules that apply everywhere

1. **The main timeline is the summary. The proof is one click away.** Never both at once.
2. **Hour and calendar time together**, always.
3. **Live versus baseline always distinguishable** at a glance.
4. **No invented states.** Three absences are different and must read differently:
   *not yet recorded* · *not stated by any source* · *disputed, both readings shown*.
5. **No percentage completion bars.**
6. **Mobile is task-first, alert-first, camera-first.** Web is story-first, comparison-first.
7. **Every noun is a link.** Person, machine, vessel, batch, reading, decision.
8. **Actual history is immutable.** Approvers approve; they do not edit time.
9. **Factory language only.** No definition codes, no internal identifiers, no build names on any
   screen a factory user reaches.

---

## 6 · What each primitive binds to

So the visual layer can be built against real shapes rather than invented ones.

| Primitive | Reads |
|---|---|
| H-hour rail | batch start instant, baseline length, per-activity planned and actual instants, variance |
| Process graph | activity dependencies, state, blocked reason |
| Parallel lanes | activity stream membership |
| Resource map | vessel occupancy windows, planned allocations, machine usage |
| Attention stream | open deviations, lab failures, time-critical gates, resource conflicts, with wait duration and responsible role |
| Proof drawer | activity, its recorded values against spec, its evidence media, lab results, decisions and reasons |
| Causality chain | per-activity variance attributed to stream, resource, recorded cause, and the forecast shift |

**All of this exists today** except the forecast shift and the delay ticket, which are the one
genuinely new record the PRD asks for.

---

## 7 · Build order

**Visual system first, against real shapes. Then bind.**

1. **The seven primitives**, as components, with real data shapes and every state including empty,
   loading, blocked and disputed.
2. **Operator and Lab** — the two mobile lenses. Smallest, most used, and they prove capture.
3. **GM Factory Now** — attention stream plus resource map. The most visible lens.
4. **Batch Story** — rail, graph, lanes, one playhead.
5. **Proof drawer** everywhere. Nothing is finished until the media opens.
6. **Manager Decision Center.**
7. **Admin Batch Setup** — the longest flow, and the one that benefits most from the primitives
   already existing.
8. **Parallel Operations · Resource Map · Daily Report.**

**The backend is not touched until step 5.** The one thing that will need it is the delay ticket and
the forecast shift, and that is a new record beside the existing ones, not a change to them.

---

## 8 · Still open, carried not decided

These stay visible in the product. They are never silently resolved in a screen.

- Exact rest after Soak 1, Soak 2, Soak 3
- The condition that starts the post-soak bunker rest
- Pile sizing method
- Turner T2 duration — **stated as unknown; a value currently exists in the data and should not**
- Whether T1 and T2 may overlap between piles
- Bunker-loading concurrency limits
- Owner and capture method for the 6-hour conditioning checks
- The complete lab decision tree
- Tunnel lab checkpoints and cleaning procedure
- Evidence storage lifecycle
- Which register owns each field when standard, plan, actual and forecast disagree
- **H0 anchor** — bagasse wetting, with weighment in a pre-H0 zone
- Day numbering, where the factory's own documents differ by six days
