> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# 03 · The process standard — PROCESS-2026C v1

**470 hours. H0 → H470.** Confirmed by the process owner, 30 August 2026.

> This file and `MushroomOS_Process_Standard_470H.docx` are generated from the same source,
> `data/schedule.json`. The .docx is the stakeholder artefact that gets signed; **this file is the
> one an agent reads.** If they ever disagree, `schedule.json` settles it.

---

## Anchors

| | Batch hour | Worked example (H0 = 31 Aug 2026, 09:00) |
|---|---|---|
| Clock starts | `H0` | Mon 31 Aug 09:00 |
| Turner anchor | `H174` | Mon 07 Sep 15:00 |
| **Standard end** — stream 1 discharge | **`H470`** | **Sat 19 Sep 23:00** |
| Batch fully discharged — stream 3 | `H474` | Sun 20 Sep 03:00 |

`H470` is measured on stream 1 (piles 1+2). Streams 2 and 3 discharge at `H472` and `H474`. Both
numbers are true and they mean different things — do not conflate them.

## How the envelope is built

```
SOP maximum pre-Turner chain      174 h   → lands exactly on the Turner anchor
Turner sheet span, T0 → GR load   296 h
                                  ─────
                                  470 h
```

The pre-Turner chain is contiguous — 15 activities, no gaps, no overlaps — and reaches 174 **only
when planned on MAX**. MIN gives 154, AVG gives 164. The two factory documents agree only on MAX,
and that agreement lands on the anchor. **MAX is the planning column. MIN is the floor. AVG is for
reporting and is never used to build a plan.**

---

## 1 · The main rail — H0 → H174

Strict sequence. Each activity begins when the previous one ends.
`STD` is the planned duration (MAX). `KIND`: WORK = someone is working · HOLD = material is resting.

| Stage | Code | Activity | From | To | STD | MIN | AVG | Kind |
|---|---|---|---:|---:|---:|---:|---:|---|
| 0A | `FIB-WET-1` | Bagasse wetting — hopper pass 1 (full water, target 69–71% moisture) | H0 | H3 | **3** | 3 | 3 | WORK |
| 0A | `FIB-REST-1` | Material rest | H3 | H11 | **8** | 8 | 8 | HOLD |
| 0A | `FIB-HOP-2` | Hopper pass 2 (dry, or water to reach target moisture) | H11 | H14 | **3** | 3 | 3 | WORK |
| 0A | `FIB-HEAP` | Heap formation (height ≤1.5 m) + rest | H14 | H26 | **12** | 8 | 10 | HOLD |
| 0B | `FIB-BUNK-LOAD` | Flipping + bunker filling (ht 2.6–2.7 m), no water | H26 | H28 | **2** | 2 | 2 | WORK |
| 0B | `FIB-COND-1` | Bunker conditioning, 45–55 °C. Unload trigger ≥58 °C or ≥60 h | H28 | H88 | **60** | 48 | 54 | HOLD |
| 0C | `FIB-RELOAD-1` | Loader unload, flipping, reload to new bunker (no water) | H88 | H93 | **5** | 5 | 5 | WORK |
| 0C | `FIB-COND-2` | Conditioning. Unload trigger ≥58 °C or ≥40 h | H93 | H133 | **40** | 40 | 40 | HOLD |
| 0C | `FIB-MOIST-DEC` | Unload. If moisture ≥68% proceed; if <67% controlled mist via hopper | H133 | H136 | **3** | 3 | 3 | WORK |
| 1B | `MIX-CM-ADD` | Add chicken-manure mix to conditioned bagasse + loader mix + flip 1 + flip 2 | H136 | H144 | **8** | 8 | 8 | WORK |
| 1B | `MIX-HOP-WATER` | Hopper pass, full water (target 73% moisture, temp <45–50 °C) | H144 | H148 | **4** | 4 | 4 | WORK |
| 1B | `MIX-REST` | Rest | H148 | H160 | **12** | 8 | 10 | HOLD |
| 1C | `YARD-PILES` | Preparation of 2 equal piles on platform | H160 | H164 | **4** | 4 | 4 | WORK |
| 1C | `YARD-ADD` | Add bagasse + CM mix gradually onto the 2 paddy piles | H164 | H166 | **2** | 2 | 2 | WORK |
| 1C | `YARD-FLIP` | Flipping 1 + flipping 2, back to back | H166 | H174 | **8** | 8 | 8 | WORK |

Fifteen activities, six of them holds. The holds account for 128 of the 174 hours.

### Triggers on the rail

Three activities end on whichever condition is met first. **Both the temperature and the elapsed
time are recorded.**

| Activity | Standard | Trigger |
|---|---|---|
| `FIB-COND-1` | 60 h | Unload at temperature ≥ 58 °C **OR** elapsed ≥ 60 h |
| `FIB-COND-2` | 40 h | Unload at temperature ≥ 58 °C **OR** elapsed ≥ 40 h |
| `FIB-MOIST-DEC` | 3 h | Moisture ≥ 68 % → proceed. Moisture < 67 % → controlled mist, re-measure. |

**The 67–68 % band is undefined in the source and this standard does not invent one.** A reading in
that band is recorded, flagged and referred. It does not auto-proceed and it does not auto-mist.
Classification: `UNRESOLVED`.

---

## 2 · The parallel streams

Parallel means **no separate wall-clock on the main rail**. It does not mean optional and it does
not mean free — both streams have hard deadlines.

### 2.1 · Paddy / straw — 86 h, must deliver at H160

| Code | Activity | From | To | Hours |
|---|---|---:|---:|---:|
| `STR-WEIGH` | Paddy bale weighment + cutting + thread removal | H74 | H86 | **12** |
| `STR-SOAK-1` | Soaking 1 — push in, tilt 1, tilt 2, push out (8–10 h) + rest in bunker (10–12 h) | H86 | H108 | **22** |
| `STR-SOAK-2` | Soaking 2 — push in, tilt 1, tilt 2, push out (8–10 h) + rest in bunker (18 h) | H108 | H136 | **28** |
| `STR-SOAK-3` | Soaking 3 — push in, tilt 1, tilt 2, push out (8–10 h) + rest in bunker (12–14 h) | H136 | H160 | **24** |

**Latest start H74.** Eighty-six hours long against a rail that gives it exactly 86 hours of room —
there is no slack in it at all. One hour late on bale cutting is one hour late on the batch, and
nothing on the main rail will show why. This is the most likely cause of an unexplained slip.

### 2.2 · Nitrogen / minerals — 6 h, must be ready at H136

| Code | Activity | From | To | Hours |
|---|---|---:|---:|---:|
| `CM-WEIGH` | Chicken manure + gypsum + ammonium sulphate weighment | H130 | H132 | **2** |
| `CM-DRYMIX` | Dry mix + rotavator to break manure lumps (no water) | H132 | H136 | **4** |

No water is added during dry preparation. Chicken manure is tested **twice** — on arrival, and again
when unloaded for mixing, because composition changes in storage. The second reading is a gate.

### 2.3 · Two convergences

```
H136   conditioned bagasse  +  nitrogen mix        must both be ready
H160   the above            +  soaked paddy        must all be ready
```

A calendar day arriving is not readiness. If a predecessor stream is not actually ready, the
convergence stays locked.

---

## 3 · The Turner — H174 → H197

Six working piles. Two machines, **M1** and **M2**. Four passes each: T0 → T1 → T2 → T3.
24 pile-passes, 1.5 h each, **36 machine-hours split exactly 18.0 / 18.0**.

### Every pile, every pass

| Pile | T0 | T1 | T2 | T3 | T1→T2 rest | T0→T1 gap |
|---|---|---|---|---|---:|---:|
| **P1** | M1 H174–175.5 | M1 H177–178.5 | M1 H186.5–188 | M1 H192.5–194 | **8.0 h** | 1.5 h |
| **P2** | M1 H175.5–177 | M1 H180–181.5 | M1 H189.5–191 | M1 H194–195.5 | **8.0 h** | 3.0 h |
| **P3** | M2 H174–175.5 | M1 H178.5–180 | M2 H188–189.5 | M2 H192.5–194 | **8.0 h** | 3.0 h |
| **P4** | M2 H175.5–177 | M1 H181.5–183 | M2 H191–192.5 | M2 H194–195.5 | **8.0 h** | 4.5 h |
| **P5** | M2 H177–178.5 | M2 H180–181.5 | M2 H189.5–191 | M1 H195.5–197 | **8.0 h** | 1.5 h |
| **P6** | M2 H178.5–180 | M2 H181.5–183 | M1 H191–192.5 | M2 H195.5–197 | **8.0 h** | 1.5 h |

### The three rules that matter

1. **The rest before T2 is 8 hours from that pile's own `T1` actual end.** Honoured to the minute on
   all six piles in the source, and stated independently in the SOP prose. This is the gate.
   It is **not** `T0 start + 24 h` — that reading was rejected on 30 Aug and must not be built.
2. **The T0→T1 gap is normal.** Every pile waits 1.5–4.5 h between its dry pass and its water pass.
   It is recorded and it is not a deviation. "Continuous, no gap" describes the *machines*, which
   run 15:00 → 00:00 with no idle minute — not the piles.
3. **Machine assignment is recorded as actual, never planned.** Four of the six piles change machine
   mid-process. The machine does not belong to a pile.

### Machine loading

| Machine | T0 | T1 | T2 · T3 | Total |
|---|---|---|---|---|
| **M1** | P1, P2 | P1, P3, P2, P4 | P1, P2, P6 · P1, P2, P5 | 12 passes · 18.0 h |
| **M2** | P3, P4, P5, P6 | P5, P6 | P3, P5, P4 · P3, P4, P6 | 12 passes · 18.0 h |

The inversion — two piles then four, versus four then two — is what lets both machines run nine
hours with no idle minute and finish on exactly six passes each.

**Piles progress independently.** Pile 1 at T2 while pile 4 is at T0 and pile 6 is waiting is a
valid factory state. There is no barrier making all six finish together.

---

## 4 · The bunkers — three streams, one after another

`P1+P2 → Bunker 1` · `P3+P4 → Bunker 2` · `P5+P6 → Bunker 3`

| Bunker | Piles | Fill · 2 h | Hold | Unload + reload · 2 h | Hold | Tunnel load · 2 h | Discharge |
|---|---|---|---:|---|---:|---|---|
| **B1** | P1+P2 | H194→H196 | 63 h | H259→H261 | 63 h | H324→H326 | **H470** |
| **B2** | P3+P4 | H196→H198 | 63 h | H261→H263 | 63 h | H326→H328 | **H472** |
| **B3** | P5+P6 | H198→H200 | 63 h | H263→H265 | 63 h | H330→H332 | **H474** |

**Bunker fill is 2 hours and that is normal** — confirmed 30 Aug. It is a **rolling** operation: the
bunker opens when the first pile of its pair leaves T3 and the second joins as it finishes. B1 opens
at H194 when P1 leaves T3; P2 joins at H195.5. Do not build a global six-pile barrier.

**Each hold is 63 hours** — approximately 15 h to reach 70 °C, then 48 h at temperature. Reload
trigger: 73–74 °C with the hold satisfied, whichever comes first, both recorded.

**At reload:** shrunken height is recorded **first** — it determines the reload height. Then
moisture. If short, water is added through the hopper during reloading and pH, EC and moisture are
taken again. **The original reading is never overwritten.** Both are part of the record.

---

## 5 · The tunnel — H324 → H470

One tunnel receives all three streams. Filling runs **H324 → H332** — an eight-hour window in three
two-hour loads, inside the factory range of 8–10 h.

| Phase | Standard | Range |
|---|---:|---:|
| Levelling & conditioning 1 | **19 h** | 18–20 h |
| Heating up | **10 h** | 8–12 h |
| Pasteurisation | **9.5 h** | 9–10 h |
| Cooling down 1 | **13 h** | 12–14 h |
| Conditioning 2 | **81.5 h** | 80–85 h |
| Cooling down 2 | **11 h** | 8–14 h |
| **TOTAL** | **144 h** | 135–155 h |

Unloading begins at 24 °C. Stream 1 at H470 — the standard end. Streams 2 and 3 at H472 and H474.

**Tunnel preparation, before loading:** tunnel washed and gliding net fixed tight across the whole
grid · nets removed and high-pressure washed, no folds, no dirt, stitch damage repaired · 6.0 m of
pulling net left at the winch side · probes cleaned, dried, hung; sensors checked.

---

## 6 · The laboratory

Twenty-six checkpoints. Each one: **perform the test → enter the values → upload photo evidence →
submit for GM approval.** The technician then moves to the next batch **without waiting**.

The pending approval belongs to the **activity**, not to the technician. Several master batches run
concurrently at different days; nothing about one blocks work on another.

| Code | Checkpoint | Hour | Parameters | Note |
|---|---|---:|---|---|
| `LAB-00` | Raw material / bagasse weighment | PRE-H0 | Moisture, pH, Dry weight | ADVISORY — does not gate H0 |
| `LAB-01` | Bagasse wetting | H1 | Moisture, pH, EC | — |
| `LAB-02` | Hopper pass 1 | H3 | Moisture, pH, EC | — |
| `LAB-03` | Hopper pass 2 | H14 | Moisture, pH, EC | — |
| `LAB-04` | Before bunker loading | H26 | Moisture, pH, EC | GATE — FIB-BUNK-LOAD is locked until approved |
| `LAB-05` | Bunker unloading | H88 | Moisture, pH, EC | — |
| `LAB-06` | Before hopper pass | H90 | Moisture, pH, EC | — |
| `LAB-07` | Reloading | H93 | Moisture, pH, EC | — |
| `LAB-08` | Paddy weighment | H74 | Moisture, Dry weight | Parallel stream |
| `LAB-09` | Paddy soak 1 — pit water | H86 | pH, EC, TDS | Parallel stream |
| `LAB-10` | Paddy soak 2 — pit water | H108 | pH, EC, TDS | Parallel stream |
| `LAB-11` | Paddy soak 3 — pit water | H136 | pH, EC, TDS | Parallel stream |
| `LAB-12` | Chicken manure — on arrival | H130 | Nitrogen, Ash | Parallel stream |
| `LAB-13` | Chicken manure — on unload for mixing | H136 | Nitrogen, Ash | GATE — MIX-CM-ADD locked until approved |
| `LAB-14` | Moisture decision point | H133 | Moisture | DECISION — ≥68% proceed / <67% controlled mist |
| `LAB-15` | After flipping 2 | H174 | Moisture, pH | + photo |
| `LAB-16` | Moisture after T0 | H180 | Moisture | Per pile, 6 records |
| `LAB-17` | Moisture after T1 | H183 | Moisture | Per pile, 6 records |
| `LAB-18` | Moisture after T2 | H192.5 | Moisture | Per pile, 6 records |
| `LAB-19` | Moisture after T3 | H197 | Moisture | Per pile, 6 records; batch average recorded |
| `LAB-20` | Bunker loading | H194 | Bunker height, pH, EC, Moisture, Nitrogen, Ash, C:N | GATE — height checked first |
| `LAB-21` | Bunker unloading (reload 1) | H259 | Shrunken height, Moisture | Height determines reload height |
| `LAB-22` | Bunker reloading | H259 | pH, EC, Moisture, Nitrogen, Ash, C:N | + conditional water branch |
| `LAB-23` | Before tunnel loading | H324 | Tunnel height | Checked first |
| `LAB-24` | Tunnel loading | H324 | pH, EC, Moisture, Nitrogen, Ash, C:N | GATE |
| `LAB-25` | Tunnel unloading | H470 | pH, EC, Moisture, Nitrogen, Ash, C:N, Shrunken height, Actinomycetes | Final QC |

### The four gates

`LAB-04` before bunker loading · `LAB-13` chicken manure on unload · `LAB-20` bunker loading ·
`LAB-24` tunnel loading.

The activity after a gate **cannot be started by anyone** — not a supervisor, not an operator —
until the result exists, the evidence is attached and the GM has approved. This is a **server
refusal**, not a greyed-out button.

`LAB-14` is a **decision**, not a gate: the moisture reading selects the branch. Both the reading
and the branch chosen are recorded.

### Measurements versus observations

**Numeric, with units:** moisture · pH · EC · TDS · dry weight · nitrogen · ash · C:N ratio ·
bunker height · tunnel height · shrunken height.

**Observations — never forced into numeric fields:**

| Observation | Values |
|---|---|
| Smell test | recorded as observed |
| Colour | recorded as observed |
| Spring / squeeze test | Too dry · Normal · Too wet · Dripping |
| Actinomycetes | Not visible · Weak · Clearly present (tunnel unloading only) |

Smell, colour and squeeze are available at **every** stage where material is stored in or handled
around a bunker or tunnel, including all loading and unloading.

### Evidence

Every checkpoint requires photographic evidence. The photograph is what lets the GM verify the test
before approving, so it is part of the activity, not an afterthought. Requirements are **named**
(`BEFORE_PHOTO`, `AFTER_PHOTO`, `WEIGHMENT_SLIP`, `LAB_RESULT_PHOTO`) — never counted. Evidence is
never deleted; a correction **supersedes**.

### Day labels

The laboratory workflow document numbers its checkpoints by day, from the earlier 552-hour model.
Under this standard the sequence is unchanged and the days compress — days 0 through 15 land within
a day throughout; tunnel unloading is **day 20, not day 22**.

**The batch hour is authoritative. The day column exists so the laboratory recognises its own
document.**

---

## 7 · Source and confidence

Every value carries a class. **Nothing may be promoted from one class to another without a decision
and a source.**

| Element | Class | Source |
|---|---|---|
| 470-hour envelope | `FACTORY_CONFIRMED` | Process owner, 30 Aug 2026 |
| H174 Turner anchor | `FACTORY_CONFIRMED` | SOP maximum pre-Turner chain |
| Main rail durations | `FACTORY_RANGE` | `imp_compost_sop_30082026.xlsx`, MIN/MAX |
| Turner pass, 1.5 h per pile | `FACTORY_CONFIRMED` | `TURNERPRCOESS.xlsx` |
| T1 → T2 rest, 8 h | `FACTORY_CONFIRMED` | Both sources agree |
| Two turner machines M1/M2 | `FACTORY_CONFIRMED` | `TURNERPRCOESS.xlsx` |
| Bunker fill, 2 h | `FACTORY_CONFIRMED` | Process owner, 30 Aug 2026 |
| Three bunkers in sequence | `FACTORY_CONFIRMED` | Process owner, 30 Aug 2026 |
| Bunker hold, 63 h | `FACTORY_CONFIRMED` | `TURNERPRCOESS.xlsx` |
| Tunnel process, 144 h | `FACTORY_RANGE` | 135–155 h, SOP |
| Pre-H0 weighment, ≈10–12 h | `ADVISORY` | **Does not gate H0** |
| Lab checkpoints | `PARALLEL_NO_WALLCLOCK` | `lab_technician_batch_process.md` |
| Moisture band 67–68 % | **`UNRESOLVED`** | Undefined in the SOP |

---

## 8 · Where the two source spreadsheets differ

Recorded, not silently reconciled.

| Item | SOP sheet | Turner sheet | This standard |
|---|---|---|---|
| Bunker cycles after the Turner | three | two | **TWO** — confirmed by the process owner |
| Bunker filling | 10 h | 2 h | **2 h** — confirmed |
| Tunnel filling | 8–10 h | 2 h × 3 | **8 h window, three 2-h loads** — both satisfied |
| T3 timing | "immediately after T2" | 1.5–4.5 h after T2 | **The Turner sheet.** The prose is a simplification |
| Paddy total | 74 h stated, 86 h in sub-steps | — | **86 h.** The four sub-steps are the real operations |
| Stage 0C header | 8 h | — | **48 h.** The header excludes the 40-h rest beneath it |
| Stage 0D | 24 h claimed, no sub-steps | — | **Not carried.** No timed content in the source |

**The 470-hour envelope holds only with the Turner sheet's downstream model.** Under the SOP's
three-cycle model the same process runs to roughly 538 hours.

---

## 9 · Pre-H0

Raw material and bagasse weighment happen approximately 10–12 hours before H0. Moisture, pH and dry
weight are recorded with photo evidence.

**This is ADVISORY. It is recorded, it is evidence, and it gates nothing.** If weighment happened
eight hours before H0 rather than ten, H0 still starts on time. The system records the actual
interval and does not block.

*(The earlier authoritative matrix made pre-H0 readiness a derived gate that unlocked H0. That gate
was removed. Same hours, different rule — do not carry the gate across with the hours.)*

---

## 10 · Worked example — H0 = Monday 31 August 2026, 09:00

Every hour below is that batch's own clock. A batch starting at a different hour has the same
H-numbers against different wall-clock times.


### Pre-H0  ·  Sun 30 Aug, about 23:00  ·  ≈10 h before H0

- Bagasse arrives and is weighed. The lab records moisture, pH and dry weight on the incoming lot and uploads photo evidence.
- This is ADVISORY. It is recorded, it is evidence, and it gates nothing. If weighment happened 8 hours before H0 rather than 10, H0 still starts on time. The system records the actual interval and does not block.

### Days 1–2  ·  Mon 31 Aug → Tue 01 Sep  ·  H0 → H26  ·  wetting and the first bunker

- 09:00  H0. The production clock starts. From this instant every activity is stamped in batch hours, and midnight does not reset it.
- 09:00 → 12:00  H0 → H3   Bagasse wetting, hopper pass 1, full water. Target moisture 69–71 %.
- Lab LAB-01 at H1 and LAB-02 at H3 — moisture, pH, EC, with photographs. These run alongside the pass; they consume no separate hours on the rail.
- 12:00 → 20:00  H3 → H11   Material rest, 8 h.
- 20:00 → 23:00  H11 → H14  Hopper pass 2. Dry if the moisture check passed; with water if it did not. Lab LAB-03 at H14.
- 23:00 → 11:00 (+1 day)  H14 → H26   Heap formation, height ≤ 1.5 m, and rest. Standard 12 h; the factory range is 8–12.

### Days 2–5  ·  Tue 01 Sep → Fri 04 Sep  ·  H26 → H88  ·  first conditioning cycle

- 11:00  H26   Lab LAB-04 — moisture, pH, EC before bunker loading. THIS IS A GATE. Bunker filling stays locked until the GM approves it. The technician submits and moves to another batch; the activity waits.
- 11:00 → 13:00  H26 → H28   Flipping and bunker filling to 2.6–2.7 m, no water. 2 h.
- 13:00 (day 2) → 01:00 (day 5)   H28 → H88   Bunker conditioning at 45–55 °C. Standard 60 h; factory range 48–60.
- Unload trigger: temperature ≥ 58 °C OR elapsed ≥ 60 h. Whichever comes first, and both are recorded.

### Day 4  ·  Thu 03 Sep  ·  H74  ·  the paddy stream opens

- 11:00  H74   Paddy bales are weighed, cut, threads removed. 12 h. Lab LAB-08 — moisture and dry weight.
- This runs in PARALLEL. It consumes no hours on the main rail. But it has a hard latest start: the paddy must be ready at H160, and the stream is 86 hours long. Start it after H74 and the convergence slips.
- 23:00  H86   Soaking 1 begins — push in, tilt 1, tilt 2, push out (8–10 h), then rest in the bunker (10–12 h). 22 h total. Lab LAB-09 tests the soak-pit water: pH, EC, TDS.

### Days 5–6  ·  Fri 04 Sep → Sat 05 Sep  ·  H88 → H133  ·  unload, reload, second cycle

- 01:00  H88    Bunker unloading. Lab LAB-05 — moisture, pH, EC on the sample.
- 01:00 → 06:00  H88 → H93   Loader unload, flipping, reload to a new bunker, no water. 5 h. Lab LAB-06 before the hopper pass and LAB-07 during reloading.
- 06:00 (day 5) → 22:00 (day 6)   H93 → H133   Second conditioning cycle. 40 h. Unload trigger: ≥ 58 °C OR ≥ 40 h.
- 21:00  H108   Paddy soaking 2 begins — 28 h, the longest of the three. Lab LAB-10 on the pit water.

### Day 6  ·  Sat 05 Sep  ·  H130  ·  the nitrogen stream opens

- 19:00  H130   Chicken manure, gypsum and ammonium sulphate are weighed. 2 h. Lab LAB-12 records nitrogen and ash on arrival.
- 21:00  H132   Dry mix with the rotavator to break the manure lumps. 4 h. NO WATER at this stage.
- Six hours in total, and like the paddy it is parallel with a hard deadline: ready at H136.

### Days 6–8  ·  Sat 05 Sep → Mon 07 Sep  ·  H133 → H160  ·  first convergence

- 22:00  H133   Unload. Lab LAB-14 is a DECISION POINT: if moisture ≥ 68 % the batch proceeds; if below 67 % a controlled mist is applied through the hopper and the readings are taken again. The original reading is never erased.
- 01:00  H136   CONVERGENCE. The conditioned bagasse and the nitrogen mix must both be ready. Lab LAB-13 re-tests the chicken manure for nitrogen and ash after its rest — composition changes in storage, and this is a GATE.
- 01:00 → 09:00  H136 → H144   Chicken-manure mix added to the conditioned bagasse, loader mixing, flip 1 and flip 2 back to back. 8 h.
- 09:00 → 13:00  H144 → H148   Hopper pass with full water. Target 73 % moisture, temperature below 45–50 °C.
- 13:00 (day 7) → 01:00 (day 8)   H148 → H160   Rest. Standard 12 h; range 8–12.
- 01:00  H136   Paddy soaking 3 begins — 24 h. Lab LAB-11 on the pit water. It completes at H160, exactly when it is needed.

### Day 8  ·  Mon 07 Sep  ·  H160 → H183  ·  the yard, then the Turner

- 01:00 → 05:00  H160 → H164   SECOND CONVERGENCE. Paddy is ready. Two equal piles are prepared on the platform. 4 h.
- 05:00 → 07:00  H164 → H166   Bagasse + chicken-manure mix added gradually onto the two paddy piles. 2 h.
- 07:00 → 15:00  H166 → H174   Flip 1 and flip 2, back to back. 8 h. Lab LAB-15 after the second flip — moisture and pH, with a photograph.
- 15:00  H174   TURNER ANCHOR. The material is laid out as six working piles. Two machines, M1 and M2, begin.
- 15:00 → 21:00  H174 → H180   T0, the dry pass. M1 takes piles 1 and 2; M2 takes piles 3, 4, 5 and 6. Lab LAB-16 records moisture after T0 for each pile.
- 18:00 → 00:00  H177 → H183   T1, the water pass, interleaved with T0 so neither machine stops. M1 takes piles 1, 3, 2, 4; M2 takes 5 and 6. Lab LAB-17 records moisture per pile.
- Both machines run 15:00 → 00:00 with no idle minute — six passes each. This is what 'continuous' means here: the machines never stop. Each pile does wait between its own T0 and T1, by 1.5 to 4.5 hours, and that is normal and recorded.

### Day 9  ·  Tue 08 Sep  ·  H183 → H200  ·  T2, T3 and the bunkers

- Each pile now rests exactly 8 hours from the END of its own T1. That is the rule. Pile 1 finished T1 at 19:30 on day 8, so its T2 opens at 03:30.
- 03:30 → 09:30  H186.5 → H192.5   T2. Moisture is checked; if it is short, controlled water is added and re-checked. Target 73–75 %. The windrow is broken to prevent compaction. Lab LAB-18.
- 09:30 → 14:00  H192.5 → H197   T3. Lab LAB-19 records moisture per pile, and the batch average is recorded for future reference.
- 11:00 → 13:00  H194 → H196   BUNKER 1 fills with piles 1 and 2. 2 h. Filling is rolling — it starts the moment pile 1 leaves T3 at 11:00 and pile 2 joins at 12:30 as it finishes.
- 13:00 → 15:00  H196 → H198   BUNKER 2 fills with piles 3 and 4. 2 h.
- 15:00 → 17:00  H198 → H200   BUNKER 3 fills with piles 5 and 6. 2 h.
- Lab LAB-20 at each fill: bunker height first, then pH, EC, moisture, nitrogen, ash and the calculated C:N ratio. Plus smell, colour and the squeeze test.

### Days 9–12  ·  Tue 08 Sep → Fri 11 Sep  ·  H196 → H265  ·  first hold and reload

- Each bunker holds 63 hours: approximately 15 hours to reach 70 °C, then 48 hours at temperature.
- 04:00  H259  (Fri 11 Sep, 04:00)   Bunker 1 unloads and reloads. 2 h. Lab LAB-21 records the shrunken height — which determines the reload height — and moisture.
- If moisture is below threshold, water is added through the hopper while reloading and pH, EC and moisture are taken again. Lab LAB-22 records the full set on reload: pH, EC, moisture, nitrogen, ash, C:N.
- 06:00  H261   Bunker 2 unloads and reloads.   08:00  H263   Bunker 3.
- The three bunkers run two hours apart throughout, one after another, on the same loader.

### Days 12–15  ·  Fri 11 Sep → Mon 14 Sep  ·  H265 → H332  ·  second hold and the tunnel

- A second 63-hour hold on the same terms.
- 21:00  H324  (Sun 13 Sep, 21:00)   Tunnel loading begins. Bunker 1 loads first, 2 h. Lab LAB-23 checks tunnel height FIRST, then LAB-24 records pH, EC, moisture, nitrogen, ash and C:N, with smell, colour and squeeze test.
- 23:00  H326   Bunker 2 loads.  03:00 on Mon 14 Sep  H330   Bunker 3 loads.
- The tunnel filling window is H324 → H332 — eight hours, three loads. This matches the factory range of 8–10 h for tunnel filling.

### Days 15–20  ·  Mon 14 Sep → Sat 19 Sep  ·  H332 → H470  ·  the tunnel process

- 144 hours inside the tunnel, in six phases:
- Levelling and conditioning 1 · 19 h   (range 18–20)
- Heating up · 10 h   (range 8–12)
- Pasteurisation · 9.5 h   (range 9–10)
- Cooling down 1 · 13 h   (range 12–14)
- Conditioning 2 · 81.5 h   (range 80–85)
- Cooling down 2 · 11 h   (range 8–14)
- Total 144 h, inside the factory range of 135–155 h for the tunnel process.

### Day 20  ·  Sat 19 Sep  ·  H470  ·  the standard end

- 23:00  H470   Unloading begins and the compost is loaded to the grow room. Lab LAB-25 is the final QC: pH, EC, moisture, nitrogen, ash, C:N, shrunken height, and the actinomycetes observation, plus smell, colour and squeeze test.
- H470 is measured on stream 1 — piles 1 and 2. Stream 2 discharges at H472 (Sun 20 Sep, 01:00) and stream 3 at H474 (Sun 20 Sep, 03:00), two hours apart, in the same order they were filled.
- THE BATCH IS FULLY DISCHARGED AT H474 — Sun 20 Sep, 03:00. The 470-hour envelope is the standard reference; the last material leaves four hours later.

---

## 11 · Open — do not decide these alone

1. **The loader as a modelled resource.** It does the bunker fill, the unload/reload and the tunnel
   load. It appears in no source sheet and in no resource requirement.
2. **Turner changeover / repositioning time.** Zero everywhere in the source, silently. Recorded
   `CONFIGURABLE`, default zero, visible.
3. **The receiving bunker for each reload.** The source names no destination.
4. **The moisture band between 67 % and 68 %** at `FIB-MOIST-DEC`.
