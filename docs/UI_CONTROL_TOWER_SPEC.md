# UI SPEC — THE MANAGEMENT LAYER

**Extension of `UI_DESIGN_SPEC.md`, not a replacement.** §1 tokens, §2 the five-layer node,
§3 the production graph, §4 the per-role bar, §5 cross-cutting rules and §6 the ten-point
checklist all stand unchanged and are binding here.

This document is **§7–§14**: the screens that do not exist yet and are the reason the product
exists — the Factory Control Tower, the 552-hour rail, the narrative layer, and the rules that
make all of it readable by someone who has never seen the software before.

**Grounded in:** `TIME_MODEL_CONFIRMED.md` (552 h exact, H0 offset 5–6 h, 48 h stagger,
~12 concurrent batches).

---

## 7. Who this layer is for, and the only three questions it answers

The reader is the owner or GM. They know the factory intimately and the software not at all.
They will not learn an activity code, and they should never have to.

Everything in the management layer serves three questions, in this order:

```
1.  Is the factory alright this morning?          →  the board
2.  What is happening to this batch, and is it late?  →  the rail
3.  Why, who, and who said it could continue?      →  the panel
```

**A fourth question does not exist.** Anything that does not serve 1, 2 or 3 is detail behind a
click. If a screen cannot be traced to one of these, it is not built.

### 7.1 The one thing to get right

`S3a`–`S3f` each contain a hand-written technical narrative — raw material verdict, stage-0,
phase-1, phase-2 entry, phase-2 process, compost-out QC, **core diagnosis**, expected
growing-room behaviour, final verdict. Someone at the factory writes that paragraph by hand
after every master batch.

**That paragraph is the deliverable.** The board and the rail are how you get to it. See §11.

---

## 8. Legibility rules — non-negotiable

These exist because the reader is not a technician. Every one of them is checkable.

### 8.1 A batch hour never appears alone

Three registers, always together, in this order of visual weight:

```
Tue 6 AM          ← wall clock, largest. This is how a person thinks.
Day 5 · H126      ← batch position, medium. This is how the process thinks.
of 552            ← scale, smallest.
```

`H126` on its own is engineer language. `PROCESS_V2 §19` locks vocabulary for the same reason.

### 8.2 Durations are spoken, not computed

| Never | Always |
|---|---|
| `+74 min` | `1h 14m behind` |
| `-0.5 h` | `30 min early` |
| `variance 0.0512 d` | — (delete) |
| `H553.2` | `finishes Thu ~11 AM · 1h behind` |
| `98.7% evidence` | `46 of 49 photos · 3 missing` |

A forecast is a **weekday and a rough hour**, with the slip beside it. Nobody plans around
`H553.2`.

### 8.3 Percentage-complete is banned on a batch

Half of the 552 hours is resting, and rest does not compress. A batch at "50%" tells the
reader nothing true. The honest progress indicator is **position on the hour rail** — H137 of
552, drawn — and nothing else.

### 8.4 Rest must not look like trouble

Roughly half the process is a time gate. If resting renders grey, dim or amber, the board reads
as a dead or dangerous factory at all times. Rest is **the process working correctly**: give it
a calm, positive treatment (`inherit` token, solid, with a live countdown). Reserve `warn` and
`crit` for things a human must act on.

### 8.5 Colour is a five-word language, used nowhere else

| Meaning | Token | Reader's understanding |
|---|---|---|
| going to plan | `ink` / neutral | nothing to do |
| happening now | `accent` | someone is working |
| waiting on the clock | `inherit` | correct, just not yet |
| needs a person | `warn` | someone must decide |
| a rule was broken | `crit` | look at this |

No sixth colour. No gradients. No colour for decoration, branding or emphasis. `UI_DESIGN_SPEC
§6.5` already says this; the board is where it will be tempting to break it.

### 8.6 Every number carries its comparison and its provenance

A number alone is a design failure (`UI_DESIGN_SPEC §5`). In the management layer that means:
value · what it was supposed to be · who produced it · when · what proves it.

### 8.7 The system says what it does not know

31 conflicts and 41 TBDs are visible at the point of use with their ID. To a layman this is not
clutter — it is the reason to trust the screen. A product that admits `C-01 — two sources
disagree, 68–69% and 75–78%` is more credible than one that silently picks.

---

## 9. §9 · THE BOARD — Factory Control Tower

The home screen for GM and owner. Opens on **what is wrong**, then shows the shape of the
factory.

### 9.1 The staircase is the hero

Twelve master batches, each 552 hours, each starting 48 hours after the last
(`TIME_MODEL_CONFIRMED §2.4`). Drawn on a shared calendar axis they form a **diagonal
staircase**. That single image teaches the entire business model in two seconds, without a word
of explanation: *twenty-three days each, a new one every two days, twelve alive at once.*

**Build the calendar so the staircase is obvious.** Do not sort rows by name or status —
sort by **start time**, so the diagonal is preserved. Exceptions are surfaced in the band above,
not by reordering the staircase.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  FACTORY CONTROL TOWER                              Sat 22 Aug 2026 · 09:14  │
│                                                                              │
│   12 RUNNING       8 ON PLAN       3 NEED A DECISION       1 HELD           │
│                    ─────────       ─────────────────       ────             │
│                                    ↓ these three first                       │
├──────────────────────────────────────────────────────────────────────────────┤
│  NEEDS YOU                                                                   │
│                                                                              │
│  ⚠  MB-118   Bunker reload ran 3h 20m long          Anand held it 07:40     │
│              Waiting on you since 07:40 · 1h 34m    [ look at it ]          │
│  ⚠  MB-121   Lab moisture 71.4% — two specs disagree (C-01)                 │
│              Nobody has decided · 4h 10m            [ look at it ]          │
│  ⚠  MB-109   Tunnel 7 is 6h past its planned unload [ look at it ]          │
├──────────────────────────────────────────────────────────────────────────────┤
│  THE FACTORY                    ◀  18   19   20   21  [22]  23   24  ▶      │
│                                                        ↑ today               │
│  MB-097  ████████████████████████████████████████████▓                      │
│  MB-100    ██████████████████████████████████████████▓▓                     │
│  MB-103      ████████████████████████████████████████▓▓▓                    │
│  MB-106        ██████████████████████████████████████▓▓▓▓                   │
│  MB-109          ███████████████████████████████████▓▓▓▓▓  ⚠               │
│  MB-112            ██████████████████████████████████▓▓▓▓▓▓                 │
│  MB-115              ████████████████████████████████▓▓▓▓▓▓▓                │
│  MB-118                ██████████████████████████████▓▓▓▓▓▓▓▓ ⚠            │
│  MB-121                  ████████████████████████████▓▓▓▓▓▓▓▓▓ ⚠           │
│  MB-124                    ██████████████████████████▓▓▓▓▓▓▓▓▓▓             │
│  MB-127                      ████████████████████████▓▓▓▓▓▓▓▓▓▓▓            │
│  MB-130                        ██████████████████████▓▓▓▓▓▓▓▓▓▓▓▓           │
│                                                                              │
│           █ done    ▒ still to come    │ now    ⚠ needs a decision          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Rules for the board

- **Twelve rows is the design target, not a limit.** The layout is built for the steady state
  the factory actually runs. It must survive 3 (early days) and 20 (a bad month) without
  reflowing into something unreadable.
- **One `now` line down the whole board.** Not twelve markers.
- **The three counters at the top are the only KPIs.** Running · on plan · needs a decision ·
  held. There is no fifth number and no chart. `UI_DESIGN_SPEC §4.6` — exception first.
- **`NEEDS YOU` states the age of the wait.** "Waiting on you since 07:40 · 1h 34m" is the
  sentence that makes a GM act. A count badge is not.
- **Clicking anywhere on a bar** opens that batch at that hour, with the playhead set to where
  the click landed. Not the batch's home page — *that hour*.
- **Hovering a bar segment** shows a one-line summary at that hour: what was happening, who,
  and whether it was on plan.
- Day columns render as **dates and weekday names**, never as batch-day indices. The staircase
  is calendar-anchored; the rail (§10) is batch-anchored. Do not mix the two axes.

### 9.3 What the board must never do

- No pie charts, no gauges, no donut of "batch health".
- No stacked KPI grid of 14 tiles.
- No sorting that destroys the diagonal.
- No colour on a bar that does not mean one of the five things in §8.5.
- No batch-day grouping on a calendar axis — the boundaries do not align
  (`TIME_MODEL_CONFIRMED §2.3`).

---

## 10. §10 · THE RAIL — the 552-hour batch timeline

The batch page's spine, and the place the "552-hour" idea becomes physical.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  MB-118 · 118 119 120                                    Started Tue 6 AM    │
│                                                                              │
│  Thu 22 Aug · 09:14         Day 5 · H137 of 552            3h 20m behind    │
│                                                                              │
│  PLAN    ├──────────────────────●───────────────────────────────────────┤   │
│  ACTUAL  ├────────────────────────●                                          │
│          H0                     H137                                  H552   │
│                                                                              │
│          finishes  Thu 4 Sep ~9 AM      planned Thu 4 Sep ~6 AM             │
│                                                                              │
│  ┌─ WHERE THE TIME WENT ────────────────────────────────────────────────┐   │
│  │  Bunker reload · line 2      2h 40m   started late, lab came back    │   │
│  │                                        at 09:40 instead of 07:00      │   │
│  │  Hopper pass 2                 42m   ran long                        │   │
│  │  everything else               -2m                                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────────────────────┤
│  RIGHT NOW                                                                   │
│                                                                              │
│  Yard · Pile 2 · Turner pass T1        Ravi · Turner-03                      │
│  running 4h 20m of 6–8h                started 05:00, on plan                │
│                                                                              │
│  Piles 1 and 3 are still in T1. Pile 2 goes to T2 the moment this finishes.  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 10.1 Rules for the rail

- **Two rails, not one bar.** Plan above, actual below. Slippage is the horizontal offset
  between them — visible without reading a number. This is the whole point of the six-column
  model made spatial.
- **The forecast tail is drawn differently from the actual** (lighter, dashed). A forecast is
  not a fact and must not look like one.
- **`WHERE THE TIME WENT` is ranked and capped at three lines** plus an "everything else"
  remainder. Four causes is already too many to hold in the head.
- **Rest windows are drawn, not hidden.** They are half the rail. Draw them as calm filled
  segments with the required duration; a running rest shows its countdown.
- **Parallel streams stack.** When fibre, straw, nitrogen and yard run at once, the rail splits
  into lanes for that span and rejoins. This is where `PROCESS_V2 §9.4`'s T1∥T2 per pile becomes
  visible — three pile lanes, staggered, not a barrier.
- **Hour ticks every 24 h, labelled with the batch-day and the date range it covers**
  (`Day 5 · Tue 6 AM → Wed 6 AM`), because batch-days do not align to calendar dates.

---

## 11. §11 · THE PARAGRAPH — the narrative layer

**This is the highest-value feature in the management layer and it is nearly free.**

The factory already writes this paragraph by hand after every batch (`S3a`–`S3f`). Every fact
it contains will exist in the database after K1–K4: actor, machine, planned vs actual
timestamps, lab result, spec, deviation, decision, reason.

### 11.1 The generated form

> **MB-118 is 3h 20m behind plan.**
> Most of it — 2h 40m — came from the **bunker reload on line 2**, which started late because
> the lab moisture came back at 09:40 instead of 07:00. **Ravi** ran it with **JCB-02**, into
> **Bunker 7** from Bunker 3. The recorded moisture was **71.4%**, which sits between the two
> specs the sources give (**C-01** — 68–69% and 75–78%), so no deviation was raised on it.
> **Anand** released the step at 10:15 with the note *"material acceptable, sweet smell."*
> A further 42m came from hopper pass 2 running long.
> At this rate the batch finishes **Thursday 4 September, around 9 AM** — about **3 hours**
> after plan.

### 11.2 Rules

- **Generated from the record, never authored.** If a fact is not in the database it does not
  appear in the paragraph.
- **Names people and machines.** "The operator" is useless; "Ravi with JCB-02" is accountability.
- **Quotes the decision reason verbatim.** The supervisor's own words carry more weight than any
  status chip.
- **Names the conflict when one applies**, and says plainly that the system did not judge the
  value because the sources disagree.
- **Every noun in the paragraph is a link** — the person, the machine, the vessel, the lab
  result, the deviation, the conflict. Clicking any of them opens the evidence (§12).
- **One paragraph per batch, one per batch-day.** The batch-day version is the daily report
  (contract §22), and its boundary is `H0 + n × 24` — **not** midnight
  (`TIME_MODEL_CONFIRMED §5`).

### 11.3 Why this and not another chart

A chart tells the GM *that* something is late. The paragraph tells them *what to do about it*
and *who to ask*. Every additional chart competes with the paragraph for the same attention.

---

## 12. §12 · THE PANEL — question to evidence in one click

Clicking any node, bar segment, or noun in the paragraph opens the same panel. One component,
everywhere.

```
┌────────────────────────────────────────────┐
│ Bunker Reload · Line 2          Day 5      │
│ Wed 5 AM → 8 AM  ·  ran 2h 40m long        │
├────────────────────────────────────────────┤
│ SUPPOSED TO BE   2h, into a different      │
│                  bunker than it came from  │
│ WHAT HAPPENED    Bunker 3 → Bunker 7       │
│                  05:00 → 10:40             │
│ WHO              Ravi                      │
│ MACHINE          JCB-02 · 5h 40m           │
│ MEASURED         moisture 71.4%            │
│                  ⚠ C-01 two specs disagree │
│ PROOF            [ before ] [ after ]      │
│                  uploaded 10:38 by Ravi    │
│ LAB              moisture 71.4 · pH 8.2    │
│                  Meena, 09:40              │
│ DECISION         Released by Anand 10:15   │
│                  "material acceptable,     │
│                   sweet smell"             │
└────────────────────────────────────────────┘
```

This is `UI_DESIGN_SPEC §2`'s five-layer node with the layers relabelled into plain English for
the management audience. **Same component, same order, same colours** — the labels change with
the reader, the structure never does.

| Layer | Operator/Lab label | Management label |
|---|---|---|
| ① SOP | `SOP` | `SUPPOSED TO BE` |
| ② PLAN | `PLAN` | (folded into ①) |
| ③ ACTUAL | `ACTUAL` | `WHAT HAPPENED` + `WHO` + `MACHINE` |
| ④ EVIDENCE | `EVIDENCE 2/2` | `PROOF` — the photos themselves, not a count |
| ⑤ DECISION | `DECISION` | `DECISION` with the reason quoted |

**Management sees the photograph, not the number of photographs.** `2 / 2 ✓` is an operator's
checklist; the GM needs the image.

---

## 13. §13 · THREE VIEWS, ONE PLAYHEAD

The batch page offers the same truth three ways. They share **one scrub position**.

```
      ┌─────────────────────────────────────────────┐
      │  SPATIALLY   production graph               │  where the material is
      │  TEMPORALLY  the 552-hour rail              │  whether it is late
      │  CHRONOLOGICALLY  the event stream          │  what happened, in order
      └─────────────────────────────────────────────┘
                          │
                    one playhead
```

Drag the rail: the graph redraws to that moment, the event list scrolls to it, the paragraph
recomputes for that point. That is the demo, and it is the moment the product explains itself.

**On "animation".** The graph animates *because the playhead moves* — nodes change state,
material appears in a different vessel, the current-position marker relocates. It does **not**
animate decoratively. `UI_DESIGN_SPEC §3.2` stands: no particle flow, no edge tracing, no
gradients, and `prefers-reduced-motion` is honoured by snapping instead of tweening.

---

## 14. §14 · Component inventory for the parallel UI track

These are buildable **now**, against typed interfaces, before the RPCs exist. Each names the
domain type it consumes so the contract is fixed before the data arrives.

| Component | Consumes | Blocked by |
|---|---|---|
| `HourRail` — plan/actual/forecast, 0…N hours | `{ baselineHours, planSegments[], actualSegments[], forecastEnd, nowHour }` | nothing |
| `StaircaseCalendar` — n batches on a date axis | `BatchBar[] { code, startAt, baselineHours, actualHours, flags[] }` | nothing |
| `FiveLayerNode` — **exists**, extend with the management labelling of §12 | `ActivityNode` | nothing |
| `EvidencePanel` | `ActivityDetail` + `EvidenceMedia[]` | **K3** for real images; renders a stated empty state until then |
| `Narrative` | `VarianceAttribution[]` + `ActivityDetail[]` | **K1/K4** for real data; the generator itself is pure |
| `ProductionGraph` — **partially exists** | `StreamGraph` + `atHour` | **K2** for honest state |
| `ExceptionBand` | `Exception[] { batch, what, whoIsWaiting, since }` | **K4** |
| `PlayheadContext` | `{ hour, setHour }` | nothing |
| `TimeLabel` — the three-register renderer of §8.1 | `{ startAt, hour }` | nothing |
| `HumanDuration` — §8.2 | `minutes` | nothing |

**Rule for the parallel track.** A component may render from a typed fixture. It may **not**
invent a state the engine cannot produce, and it may **not** show a number the database will
not have. When a data source is missing, render the stated empty state from
`UI_DESIGN_SPEC §5` — "Lab samples appear here when the bunker load is submitted" — never a
plausible-looking fake. `KIRO_BUILD_INSTRUCTIONS §1` item 10 is not suspended for the UI track.

---

## 15. Checklist — the management layer specifically

Additional to `UI_DESIGN_SPEC §6`. A reviewer checks these in five minutes.

1. No batch hour appears without a wall clock beside it.
2. No duration appears in raw minutes or decimal hours.
3. No percentage-complete appears on a batch.
4. Resting looks calm, not broken.
5. Exactly five semantic colours are in use across the whole management layer.
6. The staircase is visible and sorted by start time.
7. There is exactly one `now` line on the board.
8. The top of the tower is what is wrong, not what is fine.
9. Every exception states how long it has been waiting for a person.
10. One click from any bar, node or noun reaches the photograph.
11. The paragraph names a person, a machine, and quotes a decision reason.
12. Every disputed value shows its conflict ID at the point of use.
13. Scrubbing the rail moves the graph and the event stream together.
14. Nothing on screen was invented to fill a gap.
