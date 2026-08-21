# PRODUCT STORY

## 1. What this factory actually does

Fresh Bowl Horticulture runs a mushroom composting plant. Every ~2–3 days a new
**master batch** starts. Each master batch is a fixed recipe of straw, bagasse, chicken
manure and minerals that is wetted, conditioned in bunkers, composted through turner
passes, re-loaded through more bunkers, pasteurised in tunnels, and finally loaded into
growing rooms where mushrooms are grown and harvested over three breaks.

A master batch is not one thing moving through one line. It is:

- **one formulation** (S5a)
- flowing through **2–3 bunker lines** in Phase 0 and Phase 1 (S7a)
- pooled and split into **3–4 tunnel charges** in Phase 2 (S3a, S3f)
- each tunnel charge becoming **one individual batch** with its own number (391, 392, …)
- each individual batch loaded into **one growing room** — sometimes with a half room extra (S4b rows `3 (A)`, `5(A)`)
- each room harvested over **3 breaks** and reported as kg (S4b columns ET/EU/EV/EW)

The whole thing takes about **52–57 days** from first wetting to last harvest (S4b column EX).
The part MushroomOS controls tightly is the first ~23 days: Stage 0 (7 days),
the 8-day execution window (Day 0 mixing → Day 8 tunnel loading), and the ~6-day tunnel run.

## 2. The problem is not knowledge. It is reconstruction.

The factory knows how to make compost. The SOP exists, it is good, and it is specific —
S1a gives exact fill heights, moisture windows, temperature triggers and hold durations for
all 17 stages. The lab manual gives exact acceptance ranges per phase (S4a Table 2). The
schedule is planned two months ahead (S6a).

The problem is that **after a batch goes wrong, nobody can reconstruct what happened
without a week of forensic work**, because the record of that batch is scattered across:

| Where | What lives there | Source |
|---|---|---|
| A monthly Excel grid | what was *supposed* to happen, by date | S6a |
| A Word master batch record | formulation, stage-0 summary, bunker record, tunnel record, compost-out QC | S2a, S3a–f |
| A 158-column lab spreadsheet | every measured value, 4 rows per batch | S4b |
| A movement spreadsheet | which bunker, which tunnel, at what time | S7a |
| A formulation workbook | the recipe and its computed C:N | S5a |
| Operator memory | why a reload was late | — |
| Supervisor memory | why a value was accepted | — |
| Photographs on phones | evidence | — |
| A hand-written narrative at the end of the Word file | the diagnosis | S3f |

Batch 391–394 (S3f) is the clearest example. The written diagnosis at the bottom of that
file says the batch was "a process-overdrive batch where heat, loading variation, and tunnel
height created non-uniform compost", pointing at three interacting causes: Stage-0
overheating (67.1 °C observed against a 45–55 °C target), Reload-1 variation
(peak times 9 / 14 / 10 h, hold times 44 / 35 / 35 h), and two tunnels filled to 2.25 m
against an SOP maximum of 2.2 m (S1a Phase-2B).

Every one of those three signals was **already measurable at the moment it happened**.
Stage-0 was 12 °C over target on day −6. Reload-1 spread was visible on day 5. The 2.25 m
fill height was known at the moment of tunnel loading, and it was out of spec against a
number written in the SOP. Nothing stopped, nothing flagged, nobody was asked to decide.
The diagnosis was written weeks later, after the rooms underperformed.

**That is the product.** MushroomOS exists so that the deviation is visible on the day it
happens, to the person who can act on it, with the evidence attached.

## 3. The four questions the system must answer

Given any master batch, at any moment:

1. **What was supposed to happen?** — the frozen Day-0 baseline: route, formulation, target values, planned dates, allocated vessels.
2. **What actually happened?** — operator-recorded actuals, lab-measured results, timestamps, evidence, who did it.
3. **Where did it diverge, and what did we do about it?** — deviations with cause, corrective action, retest, and the decision that let the batch continue.
4. **Where is it now, and what is it waiting for?** — process state, with a stated reason for every block.

Everything else — dashboards, comparisons, decision packages, the end-of-batch narrative —
is derived from those four.

## 4. Central object: the Master Batch

Everything connects back to the master batch. Concretely, in this factory that means:

```
SCHEDULE SLOT  (S6a — a column in the monthly grid)
      │  admin instantiates
      ▼
MASTER BATCH  ── formulation (S5a)
      │      ── raw material lots + supplier + vehicle
      │      ── route (17 activities, Day −7 … Day +8)
      │      ── people, equipment, vehicles
      │
      ├─► BUNKER LINES  1..N     (Phase 0 / Phase 1 — S7a)
      │        fill → reload-1 → reload-2, each in a named bunker, with times
      │
      │   ═══ POOLING AT TUNNEL LOADING ═══
      │       N bunker lines feed M tunnels; N ≠ M is normal
      │       (S3f: 3 bunkers → 4 tunnels; S3a: 2 bunkers → 3 tunnels)
      │
      ├─► INDIVIDUAL BATCHES  1..M   (one per tunnel charge — 391, 392, 393, 394)
      │        tunnel run: conditioning-1 → heating-up → pasteurisation →
      │        cooling-1 → conditioning-2 → cooling-2 → tunnel out
      │
      └─► GROWING ROOM LOADS  1..P   (P ≥ M; half rooms exist — S4b)
               spawn → 1st break → 2nd break → 3rd break → room total kg
```

Every lab sample, every photo, every deviation, every decision hangs off a node in that tree.

## 5. Why the existing application cannot be extended

The existing app (S8) is a well-built **17-screen SOP checklist**. It is not wrong; it is a
different product. Extending it is not viable because the central object is missing at the
foundation:

- Its completion state is a global localStorage key per stage (`mushroomos.completed.stage_0A`), not per batch. Two concurrent master batches — which is the *normal* state of this factory, given a batch starts every 2–3 days — cannot both exist.
- Progression is `first stage with no localStorage key`. A batch cannot be blocked, waiting on a rest timer, waiting on a lab result, in deviation, or returned.
- There is no lab subsystem, so the 158 columns of S4b have nowhere to go.
- There is no server, so nothing is enforceable and nothing survives a phone wipe.
- Its own source comments state that role checks are "NOT a security boundary" and that SOP targets are "advisory only — the app must never block submission" (S8c, S8d).

We keep from it: the visual language, the mobile task ergonomics, the stage decomposition
(which matches S1a), and the field lists in `SOP_SPEC` as a cross-check against S1a.

## 6. What "good" looks like, per role

| Role | Opens the app to find | Leaves having |
|---|---|---|
| **Field Operator** | one task, with its target, its last-batch actual, and what to photograph | recorded actuals + evidence, submitted |
| **Lab Technician** | a queue of samples that the process generated, each with the exact parameters and ranges required | entered structured results; pass/fail evaluated by the system |
| **Supervisor** | a control room: what is blocked and why, which lab results failed, which evidence needs review, which time-gates are about to open | released, held, or returned specific activities with a reason |
| **Manager** | resource load: which bunkers and tunnels are free when, who is assigned where, where the conflicts are | a resolvable plan |
| **Admin** | today's schedule with "start these" and "these are running" | a configured, validated, activated master batch |
| **General Manager** | exceptions across all live batches, and a decision package per checkpoint containing plan vs actual vs quality vs evidence vs deviations vs proposed next step | an approval or a return, recorded against the batch |

## 7. Non-goals for v2

- Not a SCADA replacement. Tunnel probe data (S3f's 21-row × 4-hour log) is **ingested or entered**, not controlled. MushroomOS reads temperatures; it does not drive fans.
- Not a growing-room management system. Rooms and harvest breaks are modelled as **outcome** so that batch performance can be closed out, not as an operational subsystem.
- Not an ERP. Purchasing, payroll and finance are out.
- Not an automatic diagnostician in v2. The system surfaces the signals that the human narrative in S3f used; generating that narrative automatically is a later phase.
