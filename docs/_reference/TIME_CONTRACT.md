# TIME CONTRACT

**Normative.** This document defines how time works in MushroomOS. It is the interface;
`TIME_MODEL_CONFIRMED.md` is the evidence behind it.

**The split, so the two never drift:**

| Document | Holds | Changes when |
|---|---|---|
| `TIME_MODEL_CONFIRMED.md` | What the factory's files **prove** — `Book1.xlsx`, `S6b`. Facts and inferences, each labelled. | a new source document arrives |
| **`TIME_CONTRACT.md`** (this) | What the **code must do**. Definitions, invariants, forbidden patterns. | the factory answers an open question |
| `docs/source/book1_hour_grid.json` | The extracted fixture the tests assert against. Carries the source SHA-256. | `Book1.xlsx` itself changes |

**Frozen at T0. After T0 nobody reinterprets time.** A change here is a conflict-register entry
and a migration, not an edit.

---

## 1. Definitions

### 1.1 H0

`master_batch.start_at timestamptz` — the instant the batch clock starts.

- **Mandatory** at Day-0 configuration. Admin sets date **and** time.
- **Never defaults to midnight.** Pre-fill the factory's offset with a visible **TBD-47** marker.
- Everything else in this document derives from it. Nothing derives from `start_date` alone.

### 1.2 The hour axis — instants, not slots

```
H0        H1        H2                              H551      H552
├─────────┼─────────┼─── … ────────────────────────────┼─────────┤
│ hour 1  │ hour 2  │                                │ hour 552 │
```

**`H`n is an instant. Book1's "hour n" is the interval `[H(n-1), H(n))`.**

This is the single most likely source of an off-by-one in the whole system, so it is stated
once, here, and referenced everywhere:

```
Book1 hour 1    = [H0,   H1)     the FIRST hour of the batch
Book1 hour 552  = [H551, H552)   the LAST hour of the batch
H552            = H0 + 552 h     the instant the baseline ends
```

The proposed contract's `H0 → H552` axis and Book1's `1 … 552` are the same thing described
two ways — a point scale and an interval scale. Code that treats them as the same number will
be one hour wrong on every row.

### 1.3 Derived functions

`src/domain/` is a **pure layer** — `ARCHITECTURE_V2 §9`, enforced by an ESLint rule in C1. It
imports nothing from `api/` and cannot read Postgres. So these four functions are the whole of
`time.ts`, and every one of them is **independent of the baseline length**:

```ts
batchHour(at, startAt)      // 1-based interval index: floor((at - startAt)/1h) + 1
batchInstant(h, startAt)    // H<h>  : startAt + h hours              (point scale)
wallClock(hour, startAt)    // start of Book1 hour n: startAt + (n-1) hours
batchDay(hour)              // floor((hour - 1) / 24)   →  Day 0 … Day 22
```

**`time.ts` exports no `BASELINE_HOURS` constant.** A synchronous domain module cannot read
`process_definition`, and a module-level constant is exactly how the literal `552` gets back in.

Where a range check needs the baseline, **it arrives as a parameter** from the query layer,
which read it from `process_definition`. The provenance stays at the boundary where the read
actually happens.

```ts
// correct — the caller supplies what it read
isWithinBaseline(hour: number, baselineHours: number): boolean

// forbidden — there is no honest way to populate this here
const BASELINE_HOURS = 552;
```

### 1.4 Batch-day

`Day n` = `[H0 + 24n, H0 + 24(n+1))`.

A batch-day **never coincides with a calendar date** — the offset is 5–6 hours
(`TIME_MODEL_CONFIRMED §2.2`). `date_trunc('day', …)` and any client-side
`toDateString()` grouping are bugs.

---

## 2. Invariants — these become the T0 tests

Assert against `docs/source/book1_hour_grid.json`, **not** against hand-typed numbers. A test
that restates a developer's memory of the spreadsheet proves nothing about the spreadsheet.

**Fixture revision 2 carries the complete grid** — every one of the 552 hour cells for each of
the three batches, as `[hour, date, slot]`. Revision 1 held nine sampled checkpoints, which
could anchor only two of the twenty-three day boundaries; invariant 5 would then have asserted
the model against itself for the other twenty-one. **Do not sample the fixture again.**

**Loading it.** The fixture lives at `docs/source/`, outside `mushroomos/` and therefore outside
`tsconfig.json`'s `"include": ["src", "tests"]` and Vite's `server.fs` root. A static
`import … from` will not resolve or typecheck. Read it with `node:fs`, resolving the path from
`import.meta.url`, and **verify the recorded `sha256` against `mails/Book1.xlsx`** so an edited
fixture fails loudly rather than quietly.

**No expected hour, date, slot or bound may be typed into the test.** Every one is read from the
fixture, including the upper bound, which comes from `batch.total_hours`. This is not
stylistic: writing `batchDay(552)` would put the literal inside `src/`, where invariant 8
forbids it, and the two tests would contradict each other on first run.

For each of the three batches in the fixture:

| # | Invariant | Anchored by |
|---|---|---|
| 1 | The batch has exactly `total_hours` hour cells, and `total_hours` is identical across all three batches. | fixture |
| 2 | The hours are **contiguous** `1 … total_hours`, no gap, no repeat. | fixture |
| 3 | Hour **1** falls on `start_date`, in `start_slot`. | fixture |
| 4 | The last hour falls on `end_date` in `end_slot`, and `end_date − start_date` is identical across all three batches. | fixture |
| 5 | **Every hour ≡ 1 (mod 24) falls in the same slot as hour 1.** 23 boundaries × 3 batches = 69 assertions, each anchored to a real cell. This is what proves the day boundary holds across all 23 days, not only at the ends. | fixture |
| 6 | `batchDay` agrees with the fixture at every boundary: `batchDay(h) = (h−1)/24` for each hour ≡ 1 (mod 24), and `batchDay(h) = batchDay(h+23)` across each 24-hour span. | fixture |
| 7 | `batchHour(wallClock(n, startAt), startAt) === n` for every `n` in `1 … total_hours` — round-trip, bounds from the fixture. | fixture |
| 8 | The literals `552` and `23` appear **nowhere** in `mushroomos/src` or `mushroomos/supabase`, excluding `supabase/seed/**` and the grep test's own file. | grep test |

**Invariant 8's exclusion list is exhaustive and written in the test**, not left to the reader's
judgement. It excludes seed data — where the process definition legitimately states its own
length — and the test file itself, which must contain the search strings. Nothing else.

Invariant 8 is a real test, not a guideline, and it needs a **negative check**: add
`const x = 552` to a scratch file, confirm the test fails, remove it. A grep test that has never
been seen to fail is not evidence.

---

## 3. Open questions — marked, never guessed

### 3.1 TBD-47 · H0 is 05:00 — ANSWERED BY THE GRID, 22 Aug 2026

Book1's columns are labelled `1 … 24` with no times, which allowed two readings:

| Reading | Slot 6 is | H0 |
|---|---|---|
| **slot *k* = `[k-1:00, k:00)`** | **05:00–06:00** | **05:00 ✅** |
| slot *k* = `[k:00, k+1:00)` | 06:00–07:00 | 06:00 ❌ |

**The grid disambiguates. My earlier statement that it does not was wrong**, and wrong for the
same reason revision 1 of the fixture was inadequate: it was based on sampling the two endpoint
hours, which both readings satisfy.

Checked against the complete grid — 1,656 cells, three batches:

```
slot k = [k-1:00, k:00)  ->  H0 = 05:00     0 mismatches / 1656
slot k = [k:00, k+1:00)  ->  H0 = 06:00    69 mismatches / 1656
```

**The workbook uses slot 24.** Under the second reading slot 24 would require an hour-of-day 24,
which does not exist — the instant rolls into the next calendar date and the cell reads as
"slot 0" on the wrong day. It fails at exactly the 69 day-boundary cells that land on slot 24.
Only the first reading is coherent, and it reproduces every cell.

**H0 = 05:00 factory time.** This is now asserted in `src/domain/time.test.ts`, which keeps both
readings and requires one to match every cell and the other to fail, so the reasoning stays
checkable rather than becoming a comment.

**What remains open is TBD-50, not TBD-47**: 05:00 in *which* timezone.

### 3.2 TBD-50 · The factory clock is **Asia/Kolkata** — ANSWERED 22 Aug 2026

Client decision. Recorded in `factory_clock.timezone` via `set_factory_timezone('Asia/Kolkata')`.

**The DST hazard this entry was raised for does not arise.** Checked against the zone database:

```
Asia/Kolkata   offsets: 05:30:00 … 05:30:00   is_dst: false
H0 local:  2026-01-15 05:00 | 2026-07-15 05:00 | 2026-08-01 05:00
```

A single fixed offset, no daylight saving, so `H0 + 552 h` and "23 days later at the same wall
clock" are the same instant on every date of the year. The warning in earlier revisions of this
section — that the hour axis and wall clock could diverge twice a year — is void for this zone.

**Still binding:** `timestamptz` renders in the *viewer's* zone. Batch-days must be computed and
rendered in the stored factory zone, not the server's and not the browser's. `TimeLabel` (C1)
reads `factory_clock`; nothing else may assume a zone, and `src/domain/time.ts` still takes none.

## 4. Forbidden patterns

| Never | Instead |
|---|---|
| the literal `552` or `23` in `src/` or `supabase/` outside seed | `BASELINE_HOURS` from `process_definition` |
| `start_date + rel_day` | `start_at + standard_start_hour` |
| `date_trunc('day', …)` for a batch day | `batchDay(hour)` |
| defaulting `start_at` to midnight | mandatory input, marked TBD-47 |
| a bare `H126` in the UI | the three registers of `UI_CONTROL_TOWER_SPEC §8.1` |
| `variance_minutes` written by application code | a **generated** column |
| percentage-complete on a batch | position on the hour rail |
| treating Book1 hour *n* as `H`*n* | §1.2 — they differ by one hour |

---

## 5. What `rel_day` becomes

It stays. 34 seed rows, `generate_activity_plan`, `ScheduleBuilder`, `BatchDetail` and the day
grouping in the schedule screen all order by it, and removing it is gratuitous churn during a
48-hour build.

Its status changes: **`rel_day` is derived and display-only.** `standard_start_hour` is the
source of truth; `rel_day = floor(standard_start_hour / 24)`. Seed both, keep them consistent,
and never let a gate or a timestamp read `rel_day`.
