> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# What the factory's own documents say

**23 August 2026.** Read end to end: `mails/` — the master batch form, six filled batch records, the
batch phase movement sheet, ten months of production schedule, the composting guideline, and Book1.

This is what I should have read before building. Several things in the system disagree with it.

---

## 1 · The factory records exact clock times. It always has.

`BATCH PHASE MOVEMENT UPDATED.xlsx` is one sheet, and it is the whole argument:

| | M Batch | I Batch | Bunker Filling | Reload‑1 | Reload‑2 | Tunnel Loading | Tunnel Out | Harvest |
|---|---|---|---|---|---|---|---|---|
| | | | Bunker · Date · **Timing** | Bunker · Date · **Timing** | Bunker · Date · **Timing** | Tunnel · Date · **Timing** | EST · **ACTUAL** · TIME | EST date |

The timings are real, to the minute: **8:00 PM · 4:06 PM · 5:10 AM · 11:25 AM · 12:50 PM · 6:20 AM ·
11:40 PM**. They are not all 05:00, and they are not day-level.

**This settles the hourly question completely.** The plan being placed at `day × 24` was never a
faithful model of this factory — and the hour picker built today is the right shape. It also means
the *phase movements* themselves want a recorded date and time, not just the activities.

It settles a second thing: **EST Date vs ACTUAL DATE** is already how they think. Planned against
actual, at the phase level, in their own spreadsheet.

---

## 2 · A master batch is three individual batches — and that is not modelled

Everywhere: `M Batch no` and `I Batch no`. Master batch `1` covers individual batches `1,2,3`.
Master batch `366,367,368` covers three. The filled records are titled *"Batch No 366,367,368"*.

Each **individual** batch gets its own tunnel and its own timings:

```
366 → Tunnel 10      367 → Tunnel 8      368 → Tunnel 6
```

The system has one `master_batch` with slots on it. That is compatible but incomplete — there is no
individual batch number, so "which tunnel did 367 go to" has no answer.

**Fixed today, partly:** the batch name field now asks for the numbers the way the factory writes
them (`366,367,368`) instead of defaulting to a date — which is also what caused the
`master_batch_code_key` error you hit, on the second batch of any day.

---

## 3 · Bunkers and tunnels do not map one-to-one, and TBD‑57 needs revisiting

From the real records, verbatim:

> **"(3 batches loading into 2 bunkers)"**
> **"3A. Tunnel Allocation (2 bunkers filled in 3 tunnels)"**

And the bunkers *change at every reload*:

| | Batch group A | Batch group B |
|---|---|---|
| Loading | Bunker 3 | Bunker 6 |
| Reload‑1 | Bunker 5 | Bunker 4 |
| Reload‑2 | Bunker 3 | Bunker 4 |

**This contradicts the model I built.** `vessel_scope_map` binds `BUNKER_LINE` to one bunker for the
whole batch. The factory allocates a bunker **per movement**, the count is 2 or 3 depending on the
batch, and material moves between bunkers as it reloads.

TBD‑57 asked "is a bunker line one bunker or a lane inside one?" The real answer is neither: **a
bunker is allocated per phase movement**, and "line" is a slot the movement occupies. The vessel
picker works and refuses double-booking correctly — but it should be per movement, not per batch.
That is a schema change, and I have not made it. It is now the largest known gap.

---

## 4 · The day numbering in the factory's own form is not ours

`Master Batch Information.docx` numbers days like this:

```
STAGE 0     Day −6  Wheat/Bagasse weighment
            Day −5  Wetting + bunker loading (MC 69–72%)
            Day −4  Resting
            Day −3  Resting
            Day −2  Reloading
            Day −1  Resting

PHASE 1     Day  0  Mixing
            Day  1  Flipping & T0 & Pile
            Day  2  Pile breaking & flipping
            Day  3  T0 · T1 · T2 · Bunker Loading
            Day  6  RL‑1
            Day  8  B/R/L‑2
            Day 10  T/L
```

**Day 0 is MIXING, and weighment is Day −6.** Our system has Day 0 = weighment and runs to Day 22.

This is C‑19/C‑20 — the "day-numbering base has moved" conflict that has blocked the monthly
schedule. It is now explained: **there are two numbering systems in the factory's own paperwork**,
one counting from mixing and one counting from weighment, and they differ by six days.

I have not resolved it. It is a factory decision and it changes every date on every screen.

---

## 5 · The formula is confirmed by real numbers

§4's `fresh = dry ÷ (1 − moisture)`, checked against batch 366/367/368:

| Material | Dry (MT) | Moisture | Computed fresh | Recorded fresh |
|---|---|---|---|---|
| Paddy straw new | 28.5 | 14.8% | 33.45 | **33.45** |
| Bagasse new | 25.5 | 51.4% | 52.47 | **52.5** |

Exact. And the formulation is stated as a **percentage split** — *Bagasse new 47%, Paddy new 53%* —
not as tonnages. That is the input Admin should give.

**Materials the system does not have:** Wheat Straw, Mustard Straw, and the old/new distinction that
applies to bagasse and mustard.

---

## 6 · Readings we are missing, all of them recorded on paper today

| | |
|---|---|
| **Ammonia** | smell strength (strong/mild/weak) **and** observation time in hours |
| **Fan %** | logged every four hours through Phase 2 |
| **OA** | outside air, same four-hourly log |
| **Plenum temp** | tunnel monitoring |
| **Settled height @ 4h / 8h** | bunker loading |
| **Time to reach 68–72 °C** | and **holding time** — per bunker |
| **Spring test** | Pass / Fail |
| **Smell** | sweet/sour at stage 0, earthy/sour at compost-out |
| **Colour** | grey brown / dark chocolate |
| **Actinomycetes** | visible-weak / mild / strong |

The Phase‑2 tunnel log is **hourly in four-hour steps** — `0hrs, 4hrs, 8hrs … 56hrs+` — three
columns per tunnel. That is a real hourly recording surface and nothing in the product does it.

---

## 7 · Phase 2 has stated durations and temperature bands

Straight from the record, and none of this is in the system:

| Stage | Duration | Temperature |
|---|---|---|
| Levelling + Conditioning‑1 | 18–20 h | 46–49 °C |
| Heating‑Up | 8–12 h | 59 °C |
| Pasteurization | 8–10 h | 59 (58–60) °C |
| Cooling‑1 | 12–14 h | 60→48 °C |
| Conditioning‑2 | 75–80 h | 48–45 °C |
| Cooling‑2 | 8–14 h | 24 °C |

Recorded as *"time to reach desired T + time held"* — e.g. `7+12`. That is a two-part measurement,
not one duration, and it needs its own field shape.

---

## 8 · Growing rooms and yield are in their form already

`Phase 2 Out & Room Preference`: **Tunnel · GR No · Smell · N · EC · pH · Structure · Moisture % ·
Spawn Date · Yield**.

And the header field is *"No. of Growing Rooms Covered: 3 ½"* — **fractional rooms**. A master batch
can fill three and a half rooms. Any room model that assumes whole numbers is wrong.

Batch 366/367/368: 4 rooms, 150 MT, 50 MT each room.

---

## 9 · Soaking has real durations

*"After Soaking‑1 (3hrs)"*, *"After Soaking‑2 (24 hrs later)"*, and a third soak in the blank form.
Lagoon water is tested **before, and after each soak**: volume, colour, pH, EC, TDS.

Our system has three soak activities and no stated gap between them. The gap is 3 hours then 24.

---

## What I changed today from this reading

- **Batch naming** now follows the factory (`366,367,368`), which also fixes the duplicate-key error.
- **Day 0 start time** is now a clock you can set per batch, with the factory clock as the default
  and the screen saying which is in force.
- **Error messages** for the duplicate key and for a lost connection now say what to do.

## What this reading says I got wrong

- **Bunker allocation is per movement, not per batch.** The picker is right in spirit and wrong in
  shape. Largest known gap.
- **Individual batch numbers do not exist** in the model.
- **Day numbering** has two conflicting bases in the factory's own paperwork, and I had picked one
  without knowing the other existed.

## What is still unread

`Batch Formulations & Chemical Composition Original.xlsx` and `COMPOST LAB NEW (USE THIS).xlsx` —
the chemistry workbooks, deliberately skipped. `Compost lab manual` and the process flow diagrams
were skimmed, not read line by line.
