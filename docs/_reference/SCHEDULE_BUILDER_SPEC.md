# MASTER BATCH SCHEDULE BUILDER — BUILD THIS NEXT

**For Kiro.** This is the next thing to build and the thing the demo must show:

> **An admin writes a complete master batch schedule for one batch, Day 0 → Day 23.**

Nothing else. Not batch execution, not the operator app, not the lab queue. One screen where
the admin lays out a batch and activates it.

Authoritative source for the process: the **client's Day 0 → Day 23 diagram, 20 Aug 2026**,
transcribed in §3 below. Where it differs from the earlier dictation
(`PROCESS_V2_FACTORY_CONFIRMED.md`), the diagram wins and the difference is logged in §8.

---

## 1. The model — fixed process, wide option surface

This was got wrong twice. It is neither of these:

| Wrong model | Why |
|---|---|
| Engineers author the process; admin picks from a narrow menu | Too narrow. She decides far more than a wizard offered. |
| Admin authors the process from scratch each batch | Too wide. The process is fixed. She does not invent Day 8. |

**Correct model:**

> **The shape is fixed. The content is hers.**

**Fixed — not editable by anyone in the app:**
- which days exist (0 → 23) and what happens on each
- the order of activities and the dependencies between them
- the stream structure — fibre, straw, manure/mineral, yard, bunker, tunnel
- T2 on a pile waits for T1 on **that** pile
- a reload's destination differs from its source
- Day 23 is a state view, not an operation

**Chosen by the admin, per batch:**

| She chooses | Example |
|---|---|
| Quantities | 21 MT bagasse; manure / gypsum / AS weights |
| Load size → **derives** load count | 2 MT/load → 11 loads |
| Which vessel → which vessel | Bunker 3 → Bunker 7 |
| Which tunnels | Tunnel 1, 2, 3 |
| Durations, within the stated range | rest 24 h; hopper pass 3 h |
| Who performs it | operator / lab / supervisor, and **which person** |
| Which machine, which vehicle | JCB-02, TURNER-01, TRUCK-04 |
| Evidence required | before + after; add a third; allow video |
| Water pass or dry pass | per hopper pass |
| Counts | bunker lines, yard piles, straw piles, soaks, tunnels |
| What gets recorded | which fields the operator fills |
| Start times | 08:00 |

`PROCESS-2026B` supplies the skeleton with sensible starting values. She overrides anything in
the right-hand column and nothing in the left.

---

## 2. The screen

**Route:** `/admin/batch/:id/schedule`

Not a wizard. Not a spreadsheet. **A schedule** — a vertical Day 0 → Day 23 timeline she reads
top to bottom, the way she reads the paper master batch record today.

```
┌──────────────────────────────────────────────────────────────────────┐
│  MASTER BATCH  ·  starts 20 Sep 2026                    [ ACTIVATE ] │
│  Draft · 11 loads · 3 bunker lines · 3 tunnels · 6 lab checks        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  DAY 0        Bagasse Weighment                                       │
│  ──────────────────────────────────────────────────────────────────  │
│   ▸ Bagasse Weighment                        OPERATOR                 │
│     Required  [ 21.0 ] MT    Load size  [ 2.0 ] MT   →  11 loads     │
│     Vehicle [ TRUCK-04 ▾ ]   Machine [ JCB-02 ▾ ]                    │
│     Operator [ Ravi ▾ ]      Evidence  1 photo per load       ⋮      │
│                                                                       │
│  DAY 1        Bagasse Wetting                                         │
│  ──────────────────────────────────────────────────────────────────  │
│   ▸ Moisture Check                           🧪 LAB                   │
│     Moisture %      Assign [ Lab bench ▾ ]                     ⋮     │
│     ⓘ Decides whether the hopper pass uses water                     │
│                                                                       │
│   ▸ Hopper Pass                              OPERATOR                 │
│     Mode  ( ) Water   ( ) Dry   ( ) Auto — unavailable               │
│     Duration [ 2.0 ] h   Machine [ HOPPER-01 ▾ ]                     │
│     Evidence  before ☑  after ☑                  [ + add ]     ⋮     │
│                                                                       │
│   ▸ Bunker Loading                           OPERATOR                 │
│     Into [ Bunker 3 ▾ ]  Duration [ 2.0 ] h  Machine [ JCB-02 ▾ ] ⋮  │
│                                                                       │
│  DAY 2–3      Rest / Hold                                             │
│  ──────────────────────────────────────────────────────────────────  │
│   ▸ Rest                                     TIME GATE                │
│     Duration [ __ ] h        ⚠ not specified by the factory — TBD-21 │
│                                                                       │
│  DAY 4        Bagasse Reload                                          │
│  ──────────────────────────────────────────────────────────────────  │
│   ▸ Unload         from Bunker 3        [ 3.0 ] h                     │
│   ▸ Moisture Check                      🧪 LAB                        │
│   ▸ Hopper Pass    ( ) Water  ( ) Dry   [ 3.0 ] h   photo or video   │
│   ▸ Reload         into [ Bunker 7 ▾ ]  [ 2.0 ] h                    │
│                                                                       │
│         Bunker 3  ──────────────►  Bunker 7                          │
│                                                                       │
│  … Days 5 – 22 …                                                      │
│                                                                       │
│  DAY 23       Batch State                          not an operation   │
│  ──────────────────────────────────────────────────────────────────  │
│     Post-tunnel state · current location · compost-out results ·      │
│     lab results · evidence · supervisor status · GM decision ·        │
│     growing-room allocation / next movement                           │
└──────────────────────────────────────────────────────────────────────┘
```

Rules:
- Day headers and activity rows come from `process_activity`. **Not addable, not removable,
  not reorderable.**
- Everything inside a row is a control — dropdown, number, toggle, person picker.
- A row is one line collapsed; tap expands it. She scans, then drills.
- Header totals recalculate live as she edits.
- `⋮` on every row = force assign / alert (§6).

---

## 3. The process, day by day — from the client's diagram

Durations and evidence are exactly as the diagram states. Blank duration = the diagram gives
none, so the admin sets it. `B/A` = before photo + after photo.

| Day | Activity | Who | Duration | Evidence | Admin chooses |
|---|---|---|---|---|---|
| **0** | Bagasse Weighment — Load 1…N | Operator | — | per load | **required MT · load size → N loads** · vehicle · machine · operator · cumulative shown live |
| **1** | Moisture Check | 🧪 **Lab** | — | — | assignee · does it gate the pass |
| 1 | Hopper Pass — **with water if moisture not met, without if met** | Operator | — | B/A | **water / dry** · duration · machine · operator |
| 1 | Bunker Loading | Operator | ~2 h | B/A | **destination bunker** · duration · machine · operator |
| **2** | Rest / Hold | Time gate | — | — | **duration (required, no default — TBD-21)** |
| **3** | Rest / Hold | Time gate | — | — | duration |
| **4** | Unload from source bunker | Operator | ~3 h | B/A | duration · machine |
| 4 | Moisture Check *(inferred — see §8.3)* | 🧪 **Lab** | — | — | assignee |
| 4 | Hopper Pass — water if low, dry if met | Operator | — | **B/A or video** | **water / dry** · duration · machine |
| 4 | Reload to new bunker | Operator | ~2 h | B/A | **destination ≠ source** · duration · machine |
| **4\*** | Paddy Receipt — driver / vehicle | Operator | — | — | vehicle · driver · quantity · bale count |
| 4\* | Bale Cutting | Operator | — | B/A | duration · operator |
| **5** | Paddy Soak 1 | Operator | 8–10 h | B/A | duration |
| 5 | Storage / Bunker | Operator | — | — | **bunker ID** |
| 5 | Lagoon check — pH · EC · TDS | 🧪 **Lab** | — | — | before / after soak |
| **6** | Paddy Soak 2 | Operator | 8–10 h | B/A | duration |
| 6 | Lagoon check | 🧪 **Lab** | — | — | before / after |
| **7** | Paddy Soak 3 | Operator | 8–10 h | B/A | duration |
| 7 | Paddy Rest | Time gate | **14–16 h** | — | duration |
| 7 | Lagoon check | 🧪 **Lab** | — | — | before / after |
| **7** | Weighments — manure + gypsum + AS | Operator | — | — | **quantities per material** |
| 7 | Rotavator Mix | Operator | **~6 h** | B/A **+ AS hand-mix photo** | duration · machine |
| **7** | Bagasse Unload to Yard → Pile 1, Pile 2 | Operator | ~2 h | B/A | source bunker · **number of piles** |
| 7 | Add N/Mineral Mix to Bagasse | Operator | — | B/A | which piles |
| 7 | Flip 1 | Operator | ~2 h | B/A | duration · machine |
| 7 | Flip 2 | Operator | ~2 h | B/A | duration · machine |
| 7 | Piles Combined → Hopper Pass **with water** | Operator | ~3 h | B/A | duration · machine · *water is fixed* |
| 7 | Rest → single mixed pile | Time gate | **8–10 h** | — | duration |
| **7** | Paddy to Yard → Paddy 1 · Mixed Pile (centre) · Paddy 2 | Operator | ~3 h | B/A | **number of straw piles** · duration |
| **8** | Flip 1 — paddy + bagasse + N/mix | Operator | ~4 h | B/A | duration · machine |
| 8 | Flip 2 | Operator | ~4 h | B/A | duration · machine |
| 8 | **T0** Turner Pass | Operator | ~6–8 h | B/A | duration · **turner** |
| 8 | **T1** — per pile ×N | Operator | ~6–8 h | B/A | duration · **turner A** |
| 8 | **T2** — per pile ×N, **immediate handoff after that pile's T1** | Operator | — | B/A | duration · **turner B, must differ from T1's** |
| **8–9** | Bunker Loading — Bunker A, B, C | Operator | ~3 h **each** | B/A each | **destination bunker per line** · machine |
| 8–9 | Bunker fill check — pH · EC · MC · Ash · N → C:N | 🧪 **Lab** | — | — | assignee |
| **10** | Rest | Time gate | — | — | duration |
| **11** | Rest | Time gate | — | — | duration |
| **12** | Reload — A→D, B→E, C→F | Operator | **~9 h per bunker** | B/A | **destination ≠ source, per line** · duration |
| 12 | Reload check | 🧪 **Lab** | — | — | assignee |
| **13** | Rest | Time gate | — | — | duration |
| **14** | Rest | Time gate | — | — | duration |
| **15** | Tunnel Loading — Tunnel 1, 2, 3 → one individual batch each | Operator | ~6–8 h **each** | B/A each | **which tunnel per line** · duration · machine |
| 15 | Tunnel load check | 🧪 **Lab** | — | — | assignee |
| **16–21** | Tunnel Process, per tunnel: **Conditioning → Heating → Pasteurisation → Cooling → Conditioning → Final Hold** | Monitoring | ~6 days | observations | probe interval · which stages · **who logs** |
| **22** | Tunnel Unloading — per tunnel | Operator | **~8 h each** | B/A each | duration · machine |
| 22 | Compost-out QC — MC · N · pH · EC + spring, colour, actinomycetes, smell | 🧪 **Lab** | — | — | assignee |
| **23** | **Batch State — not an operation** | — | — | — | **nothing** |

\* The diagram places the paddy stream "in parallel" without naming a day. Interim: Day 4.
See **TBD-23**.

---

## 4. Two details from the diagram that need building explicitly

**4.1 The T1 → T2 handoff.** The diagram says *"SAME PILE → T1 → T2 IMMEDIATE / HANDOFF"*.
That is more than a predecessor gate. When T1 completes on a pile:

- that pile's T2 becomes `READY` immediately (predecessor binding `SAME_SCOPE_INSTANCE`)
- it is marked **urgent**, because the material should not sit
- the second turner's operator is **alerted automatically**
- the other piles' T1s are unaffected

At planning time the admin must assign a **different turner** to T2 than T1, or activation is
refused. That is what makes the handoff physically possible rather than a hope.

**4.2 The bunker movement map.** Day 12 in the diagram is drawn as a map:

```
BUNKER A ───────► BUNKER D
BUNKER B ───────► BUNKER E
BUNKER C ───────► BUNKER F
```

Render it that way on the schedule — one row per line, source on the left, destination
dropdown on the right, arrow between. Not a table of two columns. The same treatment for
Day 1 → Day 4 (`Bunker 3 → Bunker 7`) and Day 15 (bunkers → tunnels).

---

## 5. Task routing — operator vs lab

**[FROM THE CLIENT]** *"things related to pH checks — we have the entire module right — all
these things are done by Lab, so they are assigned to lab."*

`process_activity.responsible_role` carries the default, seeded from the activity's nature:

- measuring **pH, moisture, EC, TDS, ash, nitrogen, C:N** → **lab**
- moving, mixing, loading, turning, weighing material → **operator**
- releasing, holding, deciding → **supervisor**

The admin sees the default on the row and **can change it**, and the change is recorded as a
plan decision.

Lab rows render with the lab marker and list the parameters requested. When the batch runs
they generate `lab_sample` + `lab_test` rows automatically — `LAB_MODEL.md` is unchanged. This
screen is where she decides *which* checks this batch gets and *who* they go to.

**The Day-1 and Day-4 moisture checks are lab rows feeding an operator row.** The lab result
is what tells the operator whether the hopper pass uses water. Draw that link on the screen.

---

## 6. Force assign and alert

**[FROM THE CLIENT]** *"admin should have a button to forcibly assign things or send an alert
to lab or the operator."*

Every activity row's `⋮` menu, available **while planning and while the batch is running**:

```
  ⋮
  ├─ Assign to…            pick a specific person; overrides the default assignee
  ├─ Alert operator        push + entry in their queue
  └─ Alert lab             push + entry in the lab queue
```

- **Assign to…** writes `assigned_person_id` + an `audit_event`. On a running batch it notifies
  both the previous and the new assignee.
- **Alert** writes a `notification` + an `audit_event`. It **never changes activity state** —
  it is a nudge, not an override. Alerting a `LOCKED` activity is allowed and says so.
- Both require a short reason once the batch is active.

```sql
notification
  id, master_batch_id, batch_activity_id,
  to_role, to_person_id,
  kind,          -- 'assignment' | 'alert' | 'gate_opened' | 'handoff_urgent' | 'returned'
  message, sent_by, sent_at, read_at, reason
```

`handoff_urgent` is what §4.1 emits automatically.

---

## 7. Day 23

**[FROM THE CLIENT]** *"DO NOT INVENT A DAY-23 OPERATION."*

Seed **no `process_activity` row for Day 23**. If one appears, that is a defect.

Day 23 is a state page showing exactly what the diagram lists:

- post-tunnel / next-stage state
- current location
- compost-out results
- quality / lab results
- evidence
- supervisor status
- GM / management decision
- growing-room allocation / next movement

---

## 8. Where the diagram differs from the earlier dictation

**Do not reconcile these silently.** Log them; the diagram is the working answer.

**8.1 — C-32 · One hopper pass on Day 1, or two?**
The diagram shows **moisture check → one hopper pass**, water or dry.
The earlier dictation described **two** passes — pass 1 always with water, pass 2 conditional.
**Interim: one conditional pass**, per the diagram. Seed `FIB1-HOP-2` as **disabled**, so the
second pass can be switched back on without a migration if the dictation was right.

**8.2 — C-33 · Is there a rest after Day-5 paddy bunker storage?**
The dictation mentioned one, ambiguous between 2 h and 12 h (**TBD-24**). The diagram shows
none. **Interim: no rest activity**, TBD-24 stays open.

**8.3 — Day-4 moisture check is inferred, not stated.**
The diagram shows *"water pass if moisture low / dry pass if requirement met"* without naming
a check. A check must exist for that branch to be decidable. Marked
`mapping_confidence = 'sop_inferred'` and visible as inferred on the screen.

**8.4 — TBD-26 answered.** The diagram states Day 12 reload is **~9 h per bunker**, not 9 h
total. Mark TBD-26 resolved by the diagram, pending confirmation.

**8.5 — C-27 confirmed.** The diagram names all six tunnel stages for Days 16–21 —
conditioning, heating, pasteurisation, cooling, conditioning, final hold — with continuous
monitoring. The Phase-2 programme is retained. Disputed **bands** stay configuration-driven
and flagged.

Everything else in the diagram matches `PROCESS_V2_FACTORY_CONFIRMED.md`.

---

## 9. Validation before activation

**Blocking:**
- a rest duration left empty
- a reload whose destination equals its source
- the same turner on T1 and T2 of the same pile
- a bunker or tunnel double-booked against another batch
- an activity with no assignee
- a required quantity missing

**Warning:**
- a duration outside the range the diagram states
- C:N, N% or Ash% outside the historical band
- fewer straw piles than lines

**Info:**
- every field carrying an unresolved conflict, named

---

## 10. What must be true when this is done

1. An admin opens a new master batch and sees **Day 0 → Day 23 already laid out**, every
   activity in place, nothing to invent.
2. She sets 21 MT and 2 MT/load → **11 load rows**. Changes it to 2.5 → **9**.
3. She picks Bunker 3 on Day 1 and Bunker 7 on Day 4; the screen draws `Bunker 3 → Bunker 7`.
   Choosing Bunker 3 again is refused with the rule stated.
4. Day 12 renders as the three-arrow bunker movement map.
5. TURNER-01 on T1 and TURNER-02 on T2 is accepted; the same turner on both is refused.
6. Lab rows are visibly lab rows, and she can reassign one to a named technician.
7. She can force-assign or alert from any row, with a reason once the batch is active.
8. Rest durations block activation until filled, and say why they have no default.
9. Day 23 shows a state page and **no activity**.
10. She activates; the plan freezes; every choice is in the database and the audit log.
11. **Every row came from `process_activity`.** Adding an activity to the seed adds a row here
    with no code change.

---

## 11. Scope

**Build:** this screen, its controls, the movement maps, validation, activation,
`notification`, force-assign, alert, and the automatic `handoff_urgent` on T1 completion.

**Do not build yet:** operator app, lab queue, supervisor control room, GM package, execution,
the production graph.

**First, clear the way.** Move `NewBatch.tsx`, `MyWork.tsx`, `TaskDrawer.tsx`,
`BatchDetail.tsx`, `Batches.tsx`, `0005_generate_plan.sql` and `0006_execution.sql` out of the
working tree — some of it will be reused when Steps 3–7 arrive, but it is in the way now.
Delete the ten scratch scripts; keep `verify.mjs` and `db.mjs`.

**UI language — the old app's, not a denser one.** Bottom tabs on mobile, green `#16794a`,
rounded cards, generous spacing, plain titles, one obvious action per screen. Conflict IDs
appear **only** on admin and supervisor screens, never on an operator or lab screen. The
five-layer detail lives one tap deeper, never on the surface.
