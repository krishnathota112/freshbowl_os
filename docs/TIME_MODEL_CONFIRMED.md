# TIME MODEL — CONFIRMED FROM THE FACTORY'S OWN GRID

**Date:** 22 August 2026 · **Sources:** `mails/Book1.xlsx` (new, **S9**),
`mails/June'2026 Schedule.xlsx` sheet **`AUG - SEP`** (new, **S6b** — not listed in
`SOURCE_INVENTORY.md`).

Labels: **[FACT]** read directly from the file · **[INFER]** derived · **[TBD]** confirm.

This document supersedes the *open question* status of **TBD-44** and reframes **C-34**.
It does **not** resolve C-04, C-05, C-23, C-25 or C-27.

---

## 1. What `Book1.xlsx` actually is

A single sheet, 73 rows. Column A = batch number, column B = calendar date, columns C–Z =
**hour-of-day slots 1…24**. Each cell holds the **batch hour** that falls in that slot.

Three batches are laid out. Machine-verified:

| Batch | Hour 1 at | Hour 552 at | Hour cells | Contiguous 1…552 | Calendar dates spanned |
|---|---|---|---|---|---|
| 1 | **1 Aug, slot 6** | **24 Aug, slot 5** | 552 | ✅ | 24 |
| 2 | **3 Aug, slot 6** | **26 Aug, slot 5** | 552 | ✅ | 24 |
| 3 | **5 Aug, slot 6** | **28 Aug, slot 5** | 552 | ✅ | 24 |

---

## 2. Four facts this establishes

### 2.1 **[FACT]** The planned batch length is exactly 552 hours

Not approximately. Every batch is a contiguous run of hours numbered 1 → 552, with no gaps and
no overlap. The factory drew the grid itself.

### 2.2 **[FACT]** A batch does **not** start at midnight

Batch hour 1 falls in **hour-slot 6** of the start date, in all three batches. The batch clock
is offset from the calendar day by **five hours**.

**[FACT — established 22 Aug 2026]** **H0 = 05:00.** Slot *k* covers `[k-1:00, k:00)`, so
slot 6 = 05:00–06:00. Verified against all 1,656 cells: this reading gives 0 mismatches, the
alternative (H0 = 06:00) gives 69. The workbook uses **slot 24**, which the alternative cannot
express — it would need an hour-of-day 24 and instead rolls into the next date. **TBD-47 is
closed by the source.** What remains is **TBD-50**: 05:00 in which timezone.

**This breaks the code that exists today.** `generate_activity_plan` computes
`planned_start = (b.start_date + a.rel_day)::timestamptz` — **midnight**. Every planned
timestamp in the system is currently 5–6 hours early, and every batch-day boundary is drawn in
the wrong place.

### 2.3 **[FACT]** A batch spans 24 calendar dates but only 23 batch-days

1 Aug slot 6 → 24 Aug slot 5. Day 0 gives 19 hours, Days 1–22 give 528, Day 23 gives 5.
`19 + 528 + 5 = 552`.

Consequence for the UI: **a batch-day boundary never coincides with a calendar-date boundary.**
Any screen that groups by calendar date will split every batch-day in two. Group by
**batch-day** (H0 + n × 24) and label with the date range it covers.

### 2.4 **[FACT]** New batches start every 2 days → ~12 run concurrently

Start dates 1, 3, 5 August. Stagger = **48 hours**.

```
552 h ÷ 48 h = 11.5  →  12 master batches live at any moment
```

**[INFER]** This is the steady-state factory load and it is a *fixed, knowable* number. The
Control Tower is a twelve-row board, not an unbounded list. The GM mock's "ACTIVE 11" is
correct to within one.

---

## 3. What the `AUG - SEP` schedule sheet adds

`SOURCE_INVENTORY.md` records the June workbook's current sheets as `March-April'26` and
`May'26`. The workbook also contains **`AUG - SEP`**, which is more recent and is the live
planning artefact for the period we are building against. Register it as **S6b**.

Structure: rows = calendar dates 01/07 → 31/08; columns = master batch groups
(`097 098 099`, `100 101 102`, … `127 128 129`); cells = the scheduled activity token.
Two extra columns track **growing-room loading** (`GR/L No`, `GR/L Batch No`).

### 3.1 **[FACT]** The stable day map in the live schedule

The last five batch groups (115–129) converge on one shape:

```
D0   Bagasse weighment
D1   Bagasse pre-wet  F1 - H1 + H2          ← two hopper passes, confirms C-21
D2   F2 + B/L
D3   Rest
D4   Rest
D5   Bag R/L  (+ Paddy soaking 1)
D6   PS-2
D7   PS-3
D8   Mixing of minerals + Bagasse  F1 + F2
D9   PF-T0 + T0 + T1
D10  F3 + B/L
D11  Rest
D12  Rest
D13  B - R/L-1                              ← ONE reload
D14  Rest
D15  Rest
D16  T/L        (tunnel loading)
D22  GR-L       (growing room loading)
D23  GR-L
```

**D0 → D22/D23 = 23 batch-days = 552 hours.** `Book1.xlsx` and `S6b` agree with each other.

### 3.2 **[FACT]** Cadence in the live schedule

Start gaps across the eleven groups: 3, 3, 3, 4, 2, 6, 2, 2, 2, 2 days. The recent half settles
on **2 days**, matching `Book1.xlsx`. Book1 is the idealised cadence; S6b is what was actually
scheduled, including the slips.

---

## 4. New conflicts — none resolved here

| ID | Severity | Statement |
|---|---|---|
| **C-35** | 🔴 | **The day map in `PROCESS-2026B` disagrees with the live schedule.** The walkthrough puts bunker loading D1, reload D4, yard/turners D7–8, bunker reload D12, tunnel loading **D15**, unload D22. S6b puts B/L D2, R/L D5, mixing D8, T0+T1 D9, F3+B/L D10, reload **D13**, tunnel loading **D16**, GR-L D22. Every step from D2 onward differs by roughly **+1 day**. The walkthrough is 20 Aug; S6b covers July–August. Both are current. **Not reconciled.** |
| **C-36** | 🟠 | **What event marks H552?** The proposed contract §11 says *"At H552 the controlled compost process ends"* = tunnel unloading. S6b's terminal token inside the same window is **GR-L, growing-room loading**, at D22–D23. If H552 is GR-L, then growing-room loading is *inside* the 552-hour product scope, not after it — which contradicts contract §12 and **TBD-37**. |
| ~~**TBD-47**~~ | ✅ | **CLOSED 22 Aug 2026 by the complete grid.** Slot *k* = `[k-1:00, k:00)`; **H0 = 05:00**. The alternative reading fails 69 of 1,656 cells because it cannot express slot 24. |
| **TBD-48** | 🟡 | S6b contains two activities absent from `PROCESS-2026B`: **"Bunker Rain Washing (paddy)"** (group 115–117, D3) and **"Paddy leaching"** (group 121–123, D4). Are these standard steps, weather responses, or one-offs? |
| **TBD-49** | 🟡 | S6b's `GR/L No` column lists growing-room numbers up to **72**. Confirm the real growing-room count — it sets the scale of the outcome model. |

## 5. Two register entries that change status

**TBD-44 — "What is H0?"** → **CLOSED.** H0 is **05:00** factory time, not midnight. Build
`master_batch.start_at timestamptz` and stop deriving from `start_date` alone. The remaining
question is the timezone (**TBD-50**), not the hour.

**TBD-43 — "What is the daily-report boundary?"** → **answered.** The batch-day boundary is
`H0 + n × 24`, i.e. 05:00-ish, not midnight. A daily report is a **batch-day** report.

**C-34 — "Is the baseline a fixed 552 h?"** → **reframed, not closed.**

The *plan* is exactly 552 hours — the factory's own grid says so, twice, independently.
The *actuals* do not fit: recorded conditioning-2 alone ran 89–111 h (C-05), and the six named
Phase-2 stages sum to 129–166 h nominal inside a 144-hour window (C-04, C-27).

**That gap is not a contradiction to resolve. It is the product.** MushroomOS exists to show
where a 552-hour plan meets a reality that does not fit inside it. So:

- **552 is the baseline**, seeded from the process definition, rendered everywhere.
- **The forecast is derived** from actuals and open gates, and it is routinely > 552.
- Neither number is hard-coded in application logic; both come from data.

---

## 6. What Kiro must do with this

1. `master_batch.start_at timestamptz` — mandatory at Day-0. Pre-fill the **time** to
   **05:00** (TBD-47, closed); never default it to midnight. The zone is still **TBD-50**.
2. `process_activity.standard_start_hour` / `standard_end_hour` — seed the day boundaries at
   `rel_day × 24`, so the existing 34-row seed keeps working, then refine per activity as the
   factory gives hours.
3. Batch-day grouping = `floor((hour - 1) / 24)`, **not** `date_trunc('day', …)`.
4. Seed the demo with **three staggered batches at 48 h** so the Control Tower renders its real
   shape from day one. Twelve is the steady state; three proves the geometry.
5. Carry the `PROCESS-2026B` day map and the S6b day map as **two process definitions**, exactly
   as `ROUTE-2026A` and `PROCESS-2026B` are already carried. **Do not merge them (C-35).**
