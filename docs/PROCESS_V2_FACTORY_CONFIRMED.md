# PROCESS V2 — FACTORY CONFIRMED

**Status: CURRENT DEMO OPERATIONAL FLOW.** Source: operational walkthrough dictated by the
people running the factory, 20 Aug 2026. Reference batch start date: **20 September 2026**.

This document supersedes the 17-stage decomposition in `DOMAIN_MODEL.md §4` **as the
executable process definition**. The SOP documents (S1a, S1c, S4a) remain authoritative for
**process-control limits** — temperatures, fill heights, moisture windows, acceptance ranges —
which this walkthrough does not restate. Where the two differ, see `SOURCE_CONFLICTS.md`
C-19 … C-31. **Nothing has been reconciled.**

Process definition code: **`PROCESS-2026B`**.

Labels: **[DICTATED]** stated directly in the walkthrough · **[INFER]** derived · **[TBD]** ambiguous in the dictation · **[CONFLICT]** disagrees with the SOP.

---

## 0. Shape of the process

Twenty-three days, **Day 0 → Day 22**, ending at tunnel unloading. Not a line — a graph of
**four parallel streams** that converge on the yard.

```
 D0    D1   D2  D3   D4        D5    D6    D7              D8      D9  D10 D11  D12  D13 D14  D15   D16-21   D22
  │     │    │   │    │         │     │     │               │       │   │   │    │    │   │    │       │       │
BAGASSE ─────────────────────────────────────┐
 weigh  hop×2  rest rest  unload→hop→reload   │ yard unload (2 piles)
        bunker                                │        │
                                              │        ▼
PADDY ──────────────────────── bale cut ──────┤   +N-MIX → FLIP1 → FLIP2 → HOPPER(water) → REST
                              soak1 soak2 soak3│                                              │
                              (bunker stored)  │   paddy piles to yard ───────────────────────┤
                                               │                                              │
MANURE+MINERALS ───────────────────────────────┤                                              ▼
 (weighment + rotavator, D7)                   │                          FLIP1 → FLIP2 → T0 → [T1→T2 per pile]
                                               │                                              │
                                               └──────────────────────────────────────────────▼
BUNKER  ──────────────────────────────────────────────────── load ×3 ── rest ── reload ── rest ──┐
                                                                                                  ▼
TUNNEL  ───────────────────────────────────────────────────────────────────────────────── load ×3 ── hold ── unload
```

**[DICTATED]** *"A Master Batch is therefore a graph, not a linear checklist."*

---

## 1. Reference quantities for the demo batch

| Item | Value | Source |
|---|---|---|
| Batch start (Day 0) | **20 September 2026** | **[DICTATED]** |
| Bagasse required | **21 MT** | **[DICTATED]** |
| Expected load capacity | **~2 MT per load** | **[DICTATED]** |
| Computed load count | **`ceil(21 / 2) = 11`** — “10–11 loads” | **[DICTATED]** *"DO NOT hard-code 10 loads"* |
| Yard bagasse piles | **2**, combined into **1** after flips | **[DICTATED]** |
| Paddy piles on yard | **2** | **[DICTATED]** — but see **[TBD-19]** |
| Piles at turner stage | **3** | **[DICTATED]** *"like this three piles are done"* |
| Phase-1 bunkers | **3** | **[DICTATED]** |
| Tunnels | **3** | **[DICTATED]** |

**[TBD-19]** The written frame shows `PADDY 1 / PADDY 2 — MIXED PILE — PADDY 3`, implying
three paddy piles; the dictation says “paddy1 pile and paddy2 pile are placed beside it”,
implying two, which with the central mixed pile gives the three piles the turner works.
**Interim reading: 2 paddy piles + 1 mixed pile = 3 piles.** Confirm.

**[TBD-20]** 21 MT bagasse against the historical records, which show 66.66 MT fresh bagasse
for a 4-batch master batch. Is 21 MT (a) a smaller batch, (b) one of three parallel lines, or
(c) dry weight rather than fresh? This changes the load count and the whole yard structure.

---

## 2. DAY 0 — BAGASSE WEIGHMENT

**Terminology is fixed: WEIGHMENT.** Not weighing, not payment. The activity code is
`BG-WEIGH`, the label is “Bagasse Weighment”, and no synonym appears anywhere in the UI.

**[DICTATED]** Bagasse is brought to the weighing/loading point. A truck and loader perform
repeated loads until the required quantity is reached.

### Load plan generation

```
load_count = ceil(required_qty / expected_load_capacity)
           = ceil(21.0 / 2.0) = 11
```

The system creates **11 load activity instances** at scope `LOAD`. Admin sets
`required_qty` and `expected_load_capacity` at Day-0; the count is derived, never typed,
never hard-coded.

### Per-load execution record

| Field | Example |
|---|---|
| Load number | `01` |
| Target qty | `2.00 MT` |
| Actual qty | `2.08 MT` |
| Vehicle | `Truck-04` |
| Machine | `JCB-02` |
| Operator | `Ravi` |
| Start | `08:10` |
| End | `08:19` |
| Duration | `9 min` |
| Evidence | per Day-0 evidence config |

### Running totals — required UI component

```
TARGET      21.0 MT
LOADED      17.8 MT   ████████████████░░░░  85%
REMAINING    3.2 MT
LOADS        9 / ~11
```

**[DICTATED]** *"This is an important visual component."*

**[DICTATED]** Day 0 is also when Admin configures what the Operator and the Lab Technician
will see and be required to fill — the Operator Plan and Lab Plan (`BATCH_CREATION_SPEC.md`).

---

## 3. DAY 1 — BAGASSE WETTING

Three activities, in order.

### 3.1 `BG-HOP-1` — Hopper Pass 1

**[DICTATED]** The hopper is the machine through which bagasse is sent and water is added.
Pass 1 is **with water**.

- Evidence: **2 photos — before, after**
- Machine: Hopper
- Records: pass number, water flag, actual water quantity, machine, operator, start, end, actual duration, moisture result, before photo, after photo

### 3.2 `BG-HOP-2` — Hopper Pass 2 *(conditional water)*

**[DICTATED]** Pass 2 always runs. Only the **water flag** is conditional:

| Condition | Path |
|---|---|
| Required moisture **not** met | Hopper pass **WITH WATER** |
| Required moisture **already achieved** | Hopper pass **WITHOUT WATER** (dry pass) |

**[DICTATED]** *"This decision must be based on actual measured condition. The application
must not force the operator to manually choose an arbitrary route without recording why."*

Therefore the water flag is **derived from a recorded moisture value**, and if the operator
overrides the derived path, a reason is mandatory and a deviation is raised.

- Evidence: **2 photos — before, after**

### 3.3 `BG-BUNK-LOAD` — Bunker Loading

- Duration target: **~2 hours** **[DICTATED]**
- Evidence: **2 photos — before, after**
- Records: bunker ID, machine, operator, start, end, quantity if available
- **Bunker occupancy opens here.** See `RESOURCE_MOVEMENT_MODEL.md`.

---

## 4. DAY 2 — REST · DAY 3 — REST

**[DICTATED]** Both are rest. Both are **TIME GATES**.

UI must show:

```
RESTING
Started    20 Sep 16:40
Required   48 h
Remaining  31 h 12 min
```

**[DICTATED]** *"Do not assume the calendar itself means the batch can progress. Process state
controls progression."*

**[TBD-21]** The dictation gives Day 2 and Day 3 as rest days but never states the required
rest duration in hours. Bunker load on Day 1 → unload on Day 4 implies ~48–72 h. The SOP's
0B conditioning is 48–60 h with an unload trigger at `temp ≥ 58 °C OR time ≥ 60 h`. **Is the
rest a fixed duration set at Day-0, or is it the SOP's temperature trigger?** This is the
single most important unanswered question in the Day 0–4 block.

---

## 5. DAY 4 — RELOADING

Three activities in sequence, plus the paddy stream starting in parallel.

### 5.1 `BG-UNLOAD` — Unload from bunker

- Duration target: **~3 hours** *(see [TBD-22])*
- Evidence: **2 photos — before, after**
- Bunker occupancy closes.

### 5.2 `BG-HOP-3` — Hopper Pass *(conditional water)*

**[DICTATED]** Same two-path logic as Day 1:
required moisture met → **dry hopper pass**; not met → **water hopper pass**.

- Duration target: **~3 hours** **[DICTATED]**
- Evidence: **2 photos — before, after — OR a video** where the Day-0 evidence config allows video

### 5.3 `BG-BUNK-RELOAD` — Reload into a **different** bunker

- Duration target: **~2 hours** **[DICTATED]**
- Evidence: **2 photos — before, after**
- **Constraint: `destination_bunker ≠ source_bunker`** unless the process configuration
  explicitly allows it.
- The transfer must be shown visually:

```
BUNKER 03  →  UNLOAD  →  HOPPER  →  BUNKER 07
```

**[TBD-22]** The dictation gives “~3 hours” once in a sentence covering both the unload and
the hopper pass. Confirm whether 3 h is the unload, the hopper pass, or the pair.

---

## 6. PADDY STREAM

**[DICTATED]** *"Paddy is a parallel stream. The system must treat it independently from
Bagasse."*

### 6.1 `PD-RECEIPT` — Paddy slip → driver → delivery

**[DICTATED]** A paddy slip is issued to a driver; the driver brings the paddy.

Records: vehicle, driver, quantity, bale count where available, operator, duration.

### 6.2 `PD-BALE-CUT` — Bale cutting

- Evidence: **2 photos — before bale cutting, after bale cutting**

**[TBD-23]** The dictation places receipt and bale cutting immediately after the Day-4 bagasse
reload, but does not name the day. **Interim: Day 4.** Confirm.

### 6.3 DAY 5 — `PD-SOAK-1`

- Duration: **8–10 hours** **[DICTATED]**
- Evidence: **2 photos — before soaking, after soaking**

### 6.4 DAY 5 — `PD-BUNK-STORE` — paddy into a bunker

**[DICTATED]** *"in between soaking, it is loaded into a bunker … Paddy is also stored in a
bunker."*

- Evidence: **2 photos — before loading, after loading**
- **Mandatory field: bunker ID** — the bunker the paddy is stored in
- **This makes paddy a competitor for bunker capacity.** Vessel exclusivity must account for
  paddy occupancy, not only compost occupancy.
- Then a rest period.

**[TBD-24]** The rest after paddy bunker storage was dictated as “twelve hours rest / two hours
rest” — the audio is ambiguous between **12 h** and **2 h**. Not resolved.

### 6.5 DAY 6 — `PD-SOAK-2`

- Duration: **8–10 hours** **[DICTATED]**
- Evidence: **2 photos — before, after**
- Records: soak number, water/storage location, bunker/storage ID, operator, start, end

### 6.6 DAY 7 — `PD-SOAK-3`

- Duration: **8–10 hours** **[DICTATED]**
- Evidence: **2 photos — before, after**

### 6.7 DAY 7 — `PD-REST`

- Duration: **14–16 hours** **[DICTATED]**
- **TIME GATE**

---

## 7. DAY 7 — MANURE + MINERAL STREAM *(parallel)*

**[DICTATED]** Runs while the paddy stream is progressing.

### 7.1 `NM-WEIGH` + `NM-ROTAVATE` — one activity, weighment included

Materials: **Chicken Manure + Gypsum + Ammonium Sulphate**. Machine: **ROTAVATOR**.

- Duration: **~6 hours including weighment** **[DICTATED]**
- Records: required quantity, actual quantity, machine, operator, start, end, duration

**Evidence — THREE items. This is the reference case for multi-evidence activities:**

| # | Evidence | Why |
|---|---|---|
| 1 | Photo **before mixing** | |
| 2 | Photo **after mixing** | |
| 3 | **Extra photo of ammonium sulphate mixing** | **[DICTATED]** *"one extra photo for ammonium sulphate mixing as they do it with hand"* |

**[DICTATED]** *"This is an IMPORTANT example of multiple evidence requirements inside one
activity."* The evidence model must support **N named, individually-satisfied requirements**
per activity — not a photo count. See `EVIDENCE_CONFIGURATION_MODEL.md`.

---

## 8. DAY 7 — YARD INTEGRATION

Six activities, in order, on the yard/platform.

### 8.1 `BG-YARD-UNLOAD` — bagasse out of bunker onto the yard

- Duration: **~2 hours** **[DICTATED]**
- Evidence: **2 photos — before unloading, after unloading**
- **Forms 2 piles: `PILE-1`, `PILE-2`** **[DICTATED]**
- Records: source bunker, destination yard, machine, operator, start, end, quantity
- Bunker occupancy closes; yard pile objects are created.

### 8.2 `YD-NMIX-ADD` — add the nitrogen/mineral mix to the bagasse piles

- Evidence: **2 photos — before, after**
- Records **which piles** are involved.

### 8.3 `YD-FLIP-1`

- Duration: **~2 hours** **[DICTATED]**
- Evidence: **2 photos — before, after**
- Machine: Turner / configured equipment

### 8.4 `YD-FLIP-2`

- Duration: **~2 hours** **[DICTATED]**
- Evidence: **2 photos — before, after**

### 8.5 `YD-HOP-COMBINE` — piles 1 and 2 combined, hopper pass **with water**

**[DICTATED]** *"Now pile one and pile two are combined … hopper pass is done with water."*

- Duration: **~3 hours** **[DICTATED]**
- Evidence: **2 photos — before pass, after pass**
- Water: **always ON** — this pass is not conditional
- **Pile topology change: `PILE-1` + `PILE-2` → `MIXED-PILE`**

### 8.6 `YD-REST`

- Duration: **8–10 hours** **[DICTATED]**
- **TIME GATE**

### 8.7 `PD-YARD-LOAD` — paddy piles onto the yard

- Duration: **~3 hours** **[DICTATED]**
- Evidence: **2 photos — before, after**
- Creates `PADDY-PILE-1`, `PADDY-PILE-2`
- **Spatial layout is meaningful** **[DICTATED]** — the mixed pile sits in the middle, paddy
  piles beside it:

```
              PADDY-PILE-1
                   │
   ─────────  MIXED-PILE  ─────────
                   │
              PADDY-PILE-2
```

**[DICTATED]** *"Do not hard-code the number of piles."*

---

## 9. DAY 8 — INTEGRATION, TURNER PASSES

### 9.1 `YD-FLIP-3` — flip paddy + bagasse mix

- Duration: **~4 hours** **[DICTATED]**
- Evidence: **2 photos — before, after**

### 9.2 `YD-FLIP-4`

- Duration: **~4 hours** **[DICTATED]**
- Evidence: **2 photos — before, after**

**[TBD-25]** Day 7 has two flips at 2 h each; Day 8 has two flips at 4 h each. Interim reading:
**four distinct flips**, the Day-8 pair being longer because paddy is now in the mix. Confirm
they are not the same two flips restated.

### 9.3 `TR-T0` — Turner pass T0

- Duration: **6–8 hours** **[DICTATED]** *(dictated as “6 to 7 hours / 8 hours”)*
- Evidence: **2 photos — before, after**
- Machine: Turner

### 9.4 `TR-T1` and `TR-T2` — **per pile, parallel, two turners**

**This is the most architecturally significant statement in the walkthrough.**

**[DICTATED]** *"T1 + T2 is parallelly followed — in the yard the turner is doing T1 for one
pile, like this three piles are done, so T2 is followed on immediately, because once a pile is
done by T1, another turner does T2."*

- `TR-T1`: **6–8 hours per pile**, evidence 2 photos
- `TR-T2`: starts on a pile **as soon as that pile's T1 completes**, using a **second turner**

**Correct model — activity-scoped dependency:**

```
PILE 1:  T1 ──────────► T2
PILE 2:      T1 ──────────► T2
PILE 3:          T1 ──────────► T2
              (turner A)    (turner B)
```

**Wrong model — do not build this:**

```
T1 (all piles) ──── barrier ────► T2 (all piles)
```

Requirements this creates:
1. `route_activity.predecessor_rule` must express **`SAME_SCOPE_INSTANCE`**, not
   “all instances of the predecessor activity”.
2. Two turner resources must be independently allocatable and independently tracked.
3. Machine utilisation is per turner, per pile, per pass.

### 9.5 `P1-BUNK-LOAD` — bunker loading after T2

- **3 bunkers**, each its **own activity instance** **[DICTATED]**
- Duration: **~3 hours per bunker** → ~9 hours total **[DICTATED]**
- Evidence: **2 photos per bunker — before, after**
- Independent parallel activities where physically possible

```
Bunker 3 · 3 h    Bunker 5 · 3 h    Bunker 8 · 3 h
```

---

## 10. DAY 9 — BUNKER LOADING CONTINUES

**[DICTATED]** *"Bunker loading is followed on to day 9."*

**[DICTATED]** *"This means the schedule is not necessarily one activity = one calendar day.
The planned timeline and actual timeline must be separate."*

No new activity — the Day-8 `P1-BUNK-LOAD` instances may span the day boundary. The activity
carries `planned_start/end` and `actual_start/end` independently.

---

## 11. DAY 10 — REST · DAY 11 — REST

**TIME GATES.** Duration not stated — set at Day-0. **[TBD-21]** applies here too.

---

## 12. DAY 12 — BUNKER RELOADING

- Duration: **~9 hours** **[DICTATED]**
- Evidence: **2 photos — before, after**
- **Constraint: `destination_bunker ≠ source_bunker`**

```
BUNKER 3  →  RELOAD  →  BUNKER 8
BUNKER 5  →  RELOAD  →  BUNKER 9
BUNKER 8  →  RELOAD  →  BUNKER 10
```

**[TBD-26]** Is 9 h **per bunker** (27 h for three) or **9 h total** for all three, matching
the Day-8 pattern of 3 h × 3? The written frame says “~9 hours per configured bunker”; the
Day-8 precedent says 3 h each. Not resolved.

**[CONFLICT C-25]** This is **one** Phase-1 reload. The SOP and the movement log both describe
**two** (Reload-1 and Reload-2). See the conflict register.

---

## 13. DAY 13 — REST · DAY 14 — REST

**TIME GATES.**

---

## 14. DAY 15 — TUNNEL LOADING

- **3 tunnels**, each an **independent execution record** **[DICTATED]**
- Duration: **6–8 hours per tunnel** **[DICTATED]**
- Evidence: **2 photos per tunnel — before, after**
- Tracks: source bunker(s), tunnel, individual batch, operator, machine, duration, evidence,
  planned quantity, actual quantity

**[DICTATED]** *"Tunnel assignment may be different from bunker assignment. Do not assume a
permanent one-to-one relationship."* — consistent with the N:M pooling already established in
`DOMAIN_MODEL.md §1.1`.

---

## 15. DAY 16–21 — TUNNEL PROCESS / HOLD

**[DICTATED]** *"These are not blank calendar days."*

The UI shows tunnel state with elapsed and remaining time:

```
TUNNEL 2 · CONDITIONING
Day 18 of 21   ·   elapsed 74 h   ·   next checkpoint 06:00
```

**[CONFLICT C-27]** The walkthrough describes Days 16–21 as “rest / process hold” with
“configured monitoring/checkpoints” but names none. The SOP (S1a P2C, S1c) specifies six named
stages with temperatures and durations — levelling/conditioning-1, heating-up, pasteurisation,
cooling-1, conditioning-2, cooling-2 — plus seven hour-banded control rules. **These are
retained as the configured monitoring content for Days 16–21, pending confirmation.**

---

## 16. DAY 22 — TUNNEL UNLOADING

- Duration: **~8 hours** **[DICTATED]**
- Evidence: **2 photos — before, after**
- Tracks: tunnel, operator, machine, start, end, quantity

**[DICTATED]** *"This becomes the completion of the current demo lifecycle."*

Growing-room loading, spawning and harvest are **out of demo scope** in PROCESS-2026B. They
remain in the domain model as outcome entities.

---

## 17. Complete activity register — `PROCESS-2026B`

Evidence column: `B/A` = before + after photo. Duration = target from the dictation.

| # | Code | Day | Stream | Scope | Activity | Duration | Machine | Evidence | Movement |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `BG-WEIGH` | 0 | Bagasse | **LOAD** ×11 | Bagasse Weighment (per load) | — | Truck + JCB | configured | yard-in |
| 2 | `BG-HOP-1` | 1 | Bagasse | MASTER | Hopper Pass 1 — **with water** | — | Hopper | B/A | — |
| 3 | `BG-HOP-2` | 1 | Bagasse | MASTER | Hopper Pass 2 — **water conditional** | — | Hopper | B/A | — |
| 4 | `BG-BUNK-LOAD` | 1 | Bagasse | BUNKER_LINE | Bunker Loading | 2 h | JCB | B/A | → Bunker A |
| 5 | `BG-REST-1` | 2–3 | Bagasse | BUNKER_LINE | Rest (time gate) | **[TBD-21]** | — | — | in Bunker A |
| 6 | `BG-UNLOAD` | 4 | Bagasse | BUNKER_LINE | Unload from bunker | ~3 h | JCB | B/A | Bunker A → |
| 7 | `BG-HOP-3` | 4 | Bagasse | MASTER | Hopper Pass — **water conditional** | ~3 h | Hopper | B/A **or video** | — |
| 8 | `BG-BUNK-RELOAD` | 4 | Bagasse | BUNKER_LINE | Reload into **different** bunker | 2 h | JCB | B/A | → Bunker B |
| 9 | `PD-RECEIPT` | 4 **[TBD-23]** | Paddy | MASTER | Paddy slip → driver → delivery | — | Vehicle | configured | → yard |
| 10 | `PD-BALE-CUT` | 4 | Paddy | MASTER | Bale cutting | — | — | B/A | — |
| 11 | `PD-SOAK-1` | 5 | Paddy | MASTER | Soaking 1 | 8–10 h | — | B/A | → soak |
| 12 | `PD-BUNK-STORE` | 5 | Paddy | BUNKER_LINE | Store paddy in bunker | — | JCB | B/A + **bunker ID** | → Bunker P |
| 13 | `PD-REST-1` | 5 | Paddy | MASTER | Rest | **[TBD-24]** | — | — | — |
| 14 | `PD-SOAK-2` | 6 | Paddy | MASTER | Soaking 2 | 8–10 h | — | B/A | — |
| 15 | `PD-SOAK-3` | 7 | Paddy | MASTER | Soaking 3 | 8–10 h | — | B/A | — |
| 16 | `PD-REST-2` | 7 | Paddy | MASTER | Rest after soak 3 | **14–16 h** | — | — | — |
| 17 | `NM-ROTAVATE` | 7 | Manure+Mineral | MASTER | Weighment + rotavator mix (CM + Gypsum + AS) | **6 h incl. weighment** | Rotavator | **3 photos** — before, after, **AS-by-hand** | — |
| 18 | `BG-YARD-UNLOAD` | 7 | Bagasse | PILE ×2 | Unload bunker → yard, form 2 piles | 2 h | JCB | B/A | Bunker B → Yard |
| 19 | `YD-NMIX-ADD` | 7 | Yard | PILE | Add N-mix to bagasse piles | — | JCB | B/A | — |
| 20 | `YD-FLIP-1` | 7 | Yard | PILE | Flip 1 | 2 h | Turner | B/A | — |
| 21 | `YD-FLIP-2` | 7 | Yard | PILE | Flip 2 | 2 h | Turner | B/A | — |
| 22 | `YD-HOP-COMBINE` | 7 | Yard | PILE | Combine piles + hopper pass **with water** | 3 h | Hopper | B/A | 2 piles → 1 |
| 23 | `YD-REST` | 7 | Yard | PILE | Rest | **8–10 h** | — | — | — |
| 24 | `PD-YARD-LOAD` | 7 | Paddy | PADDY_PILE ×2 | Load paddy piles onto yard | 3 h | JCB | B/A | Bunker P → Yard |
| 25 | `YD-FLIP-3` | 8 | Yard | PILE | Flip paddy + bagasse mix — flip 1 | **4 h** | Turner | B/A | — |
| 26 | `YD-FLIP-4` | 8 | Yard | PILE | Flip 2 | **4 h** | Turner | B/A | — |
| 27 | `TR-T0` | 8 | Yard | PILE | Turner pass **T0** | **6–8 h** | Turner | B/A | — |
| 28 | `TR-T1` | 8 | Yard | **PILE ×3** | Turner pass **T1** — per pile | 6–8 h | Turner A | B/A | — |
| 29 | `TR-T2` | 8 | Yard | **PILE ×3** | Turner pass **T2** — per pile, **immediately after that pile's T1** | 6–8 h | **Turner B** | B/A | — |
| 30 | `P1-BUNK-LOAD` | 8–9 | Bunker | **BUNKER_LINE ×3** | Bunker loading | **3 h each** | JCB | B/A each | Yard → Bunkers |
| 31 | `P1-REST-1` | 10–11 | Bunker | BUNKER_LINE | Rest (time gate) | **[TBD-21]** | — | — | — |
| 32 | `P1-BUNK-RELOAD` | 12 | Bunker | BUNKER_LINE ×3 | Reload into **different** bunker | **9 h [TBD-26]** | JCB | B/A | Bunker → Bunker |
| 33 | `P1-REST-2` | 13–14 | Bunker | BUNKER_LINE | Rest (time gate) | **[TBD-21]** | — | — | — |
| 34 | `TN-LOAD` | 15 | Tunnel | **TUNNEL ×3** | Tunnel loading | **6–8 h each** | JCB/conveyor | B/A each | Bunkers → Tunnels |
| 35 | `TN-HOLD` | 16–21 | Tunnel | TUNNEL ×3 | Tunnel process / conditioning | ~6 days | AHU/fans | monitoring | in tunnel |
| 36 | `TN-UNLOAD` | 22 | Tunnel | TUNNEL ×3 | Tunnel unloading | **8 h** | conveyor | B/A each | Tunnels → out |

### Instance count for the demo batch

| Scope | Templates | Instances |
|---|---|---|
| `LOAD` | 1 | **11** |
| `MASTER` | 11 | 11 |
| `BUNKER_LINE` | 9 | 3 lines → **~19** |
| `PILE` | 9 | 2 piles → 3 piles → **~20** |
| `PADDY_PILE` | 1 | **2** |
| `TUNNEL` | 3 | **9** |
| **Total** | **36 templates** | **≈ 72 activity instances** |

Compare: the old 17-stage model generated ~48. The new decomposition is finer and
load-aware, and the count is **derived from Day-0 configuration**, not fixed.

---

## 18. What must be configurable, not coded

**[DICTATED]** *"Build the process engine so process definitions are configurable rather than
hard-coded."*

| Thing | Must be derived from | Never |
|---|---|---|
| Number of weighment loads | `ceil(qty / load_capacity)` | a constant `10` |
| Number of yard piles | Day-0 config | a constant `2` |
| Number of paddy piles | Day-0 config | a constant `2` |
| Number of bunker lines | Day-0 config | a constant `3` |
| Number of tunnels | Day-0 config | a constant `3` |
| Every activity duration | Day-0 target, per activity | a hard-coded hour count |
| Every evidence requirement | Day-0 evidence config | a hard-coded photo count |
| Whether an activity runs at all | Day-0 process option | always-on |
| Water on / off at a hopper pass | recorded moisture + rule | operator free choice without a reason |
| Source and destination vessels | Day-0 movement plan + runtime record | inferred from a naming convention |
| Which turner does T1 vs T2 | Day-0 resource plan | assumed |
| Whether the process has 1 or 2 Phase-1 reloads | process definition version | assumed |

**The activity register in §17 is seed data for `PROCESS-2026B`, loaded as SQL. It is not
application logic.** Editing the process must never require editing code.

---

## 19. Terminology lock

| Use | Never |
|---|---|
| **Weighment** | weighing, payment, weighting |
| **Hopper Pass** | hopper run, wetting pass |
| **Dry Hopper Pass** / **Water Hopper Pass** | pass type A/B |
| **Rotavator** | rotor beater, rotovator |
| **Bale cutting** | bale breaking (that is the SOP's separate term) |
| **Flip** | turn (a *turner pass* is T0/T1/T2 and is a different machine) |
| **Turner pass T0 / T1 / T2** | turning 0/1/2 |
| **Reload** | re-fill |
| **Pile** / **Paddy pile** / **Mixed pile** | heap, windrow |
