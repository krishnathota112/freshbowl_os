# The revised 470h PRD, reconciled against the build and its sources

**29 August 2026.** Written after reading `MushroomOS_PRD_REVISED_470H_STANDARD_EXECUTION.md`
against `imp_compost_sop_30082026.xlsx`, `TURNERPRCOESS.xlsx`, `SYSTEM_ARCHITECTURE_V1.md` and the
migrations.

Decision memory lives in `T:\obsidian\memory`. This file is the repo-side summary so an agent
working from the codebase alone does not have to have read the vault.

> **Method note.** The two spreadsheets were read **before** the PRD, as raw resource schedules,
> without knowing what the PRD claimed about them. That is the only reason the numbers reconciled —
> knowing that H174 and H470 were the answers would have made it easy to find arithmetic producing
> them. Everything below marked *derived* is arithmetic on the source files, classification
> `SIMULATION / DERIVED`. **None of it is a factory statement. Do not cite it back to the factory.**

---

## 1 · What the PRD settles

**H0 is Bagasse Wetting.** §5.1, §5.2, §6. Pre-H0 intake and weighment sit ~10–12 h before it,
**advisory**, outside the rail, and explicitly do **not** gate H0:

> "the system should not block H0 simply because weighment did not happen exactly 10 or 12 hours
> earlier."

This closes the question `DECISION_2026-08-29_PROCESS_BASELINE.md` §3 deliberately left open, and it
closes it in favour of `PROCESS_2026B_AUTHORITATIVE_MATRIX.md` — the model the **live database** had
and the **seeds** do not.

**Not a pure restatement.** The matrix made pre-H0 readiness a `DERIVED READINESS` that *unlocks
Admin H0 start confirmation*. The PRD removes that gate. Same hours, different rule. Whoever
implements `is_pre_h0` must not carry the matrix's gate across with the matrix's hours.

Rows still to move (from `DECISION_2026-08-29_PROCESS_BASELINE.md` §2):
`FIB1-HOP-1`, `FIB1-HOP-2`, `FIB1-BUNK-LOAD`, `LAB-FIB-WET`, `LAB-FIB-MOISTURE-1`, `LAB-FIB-PREBUNK`
Day 1 → Day 0; `P1-BUNK-LOAD`, `LAB-BUNK-FILL` Day 8 → Day 9.

The 29 Aug export preserved all 52 rows with `factory_stated` hours and the pre-H0 flags as
replayable SQL. **Replay it. Do not reconstruct it.**

---

## 2 · The envelope cannot be stored — and this is the blocker

`0011_hour_axis.sql`:

```sql
add column if not exists baseline_hours int generated always as ((total_days + 1) * 24) stored;
```

H552 is not a factory figure. It is 23 × 24, with `PROCESS-2026B.total_days = 22`.

**470 is not a multiple of 24.** `470 / 24 = 19.583…`. No integer `total_days` produces it. The
schema cannot hold the number the PRD calls the standard.

The likely wrong fix is `total_days = 19` → 480: close enough to look right, wrong by ten hours in
every variance the product computes, and permanent, because `DEC-002` freezes the plan at activation.

`0011` already solved this one level down. `process_activity.standard_hour_source ∈
('factory_stated','derived_from_rel_day')` exists explicitly so *"nobody mistakes a derivation for a
statement"*. The instinct was right and was applied to exactly one column.

**Fix:** `0041_process_envelope_hours.sql` (skeleton in this repo) — `envelope_hours` stated and
nullable, `envelope_hour_source`, one resolving view `v_process_envelope`, and `set_process_envelope`
which refuses a number with no confidence class and no source.

`README.md`, `SYSTEM_ARCHITECTURE_V1` §14/§15 and `ARCH-005` all name H552 in prose. They change in
the same pass or they will re-teach 552 to the next agent.

---

## 3 · Where 470 comes from — *derived*

```
SOP maximum pre-Turner path                     174 h   = PRD Turner anchor H174   exact
Turner sheet span, D1 09:00 → D13 17:00         296 h   = 470 − 174                exact
```

Both PRD anchors reproduce to the hour from the sources alone. **470 is the SOP's front half plus
the Turner sheet's back half.** The old 552 is the SOP end to end (538 h max) rounded to H536 plus a
16 h tunnel turnaround.

The 82-hour difference is three specific things, all downstream of the Turner:

| | SOP | Turner sheet |
|---|---|---|
| Bunker cycles after the Turner | **three** (fill → reload 1 → reload 2) | **two** (fill → one reload) |
| Bunker filling, each | 10 h | 2 h |
| Tunnel filling | 8–10 h | 2 h |

**So 470 is a measurement of a simulation, not a target the factory set.** Published as the standard,
every batch runs late against its own envelope, the extension queue fills with requests nobody can
refuse, and the variance number — the entire point of the product — measures the spreadsheet's
optimism rather than the factory's performance. Silently. It looks exactly like a factory that is
chronically behind.

**Store 470 classed `SIMULATION`, not `FACTORY_CONFIRMED`, until the process owner rules.**

---

## 4 · Two PRD rules that must not be implemented as written

### §18 — "T0 → T1 continuous, no gap; a gap is an automatic deviation"

Every one of the six piles in the source has a gap, recorded deliberately in the sheet's own
`Rest Hrs` row:

| P1 | P2 | P3 | P4 | P5 | P6 |
|---|---|---|---|---|---|
| 1.5 h | 3.0 h | 3.0 h | **4.5 h** | 1.5 h | 1.5 h |

The continuity is real, but it belongs to the **machines**:

```
M1  09:00 ─ T0 p1,p2 ─┬─ T1 p1,p3,p2,p4 ─ 18:00     9 h, zero idle
M2  09:00 ─ T0 p3,p4,p5,p6 ─┴─ T1 p5,p6 ─ 18:00     9 h, zero idle
```

The load inversion — 2 piles then 4, versus 4 then 2 — is what buys both machines six passes with no
idle minute. A machine-utilisation property was read off the sheet and written down as a material
property. **Implemented as written it raises six deviations per batch, forever.**

T1 is the water pass, so the gap is also a real process variable: pile 4 sits dry 4.5 h against pile
1's 1.5, systematically, every batch, by pile position.

### §19 — "T2 planned start = T0 actual start + 24 h", derived and uneditable

| Pile | T0 start | T2 start | Interval |
|---|---|---|---|
| P1 | 09:00 | 21:30 | 12.5 h |
| P2 | 10:30 | 00:30 +1 | 14.0 h |
| P3 | 09:00 | 23:00 | 14.0 h |
| P4 | 10:30 | 02:00 +1 | 15.5 h |
| P5 | 12:00 | 00:30 +1 | 12.5 h |
| P6 | 13:30 | 02:00 +1 | 12.5 h |

Never 24. The actual driver is **`T1 actual end + 8 h`**, honoured to the minute on all six piles and
stated independently in the compost SOP's prose (row 40). Wrong anchor event, wrong stage, wrong
number.

And §19 wants it **frozen** after T0 starts. A wrong number behind a correct freeze is worse than an
editable one, because the integrity guarantee then protects the error.

Both are `UNRESOLVED`. **Build no gate on either** until the process owner rules. When they do, it is
a `gate_rule` row — anchor event, offset, unit — not arithmetic in `generate_activity_plan`.

---

## 5 · The loader is the real constraint and is not modelled

`TURNERPRCOESS.xlsx` tracks two turners meticulously — 24 pile-passes, 36 machine-hours, split
18.0/18.0, no double-booking. Then rows 54–92 schedule bunker filling, unload/reload and tunnel
loading in the same grid, 2 h each, belonging to a machine with **no row and no conflict check**.

Three durations circulate for one critical-path operation:

| | SOP | PRD §24 | Turner sheet |
|---|---|---|---|
| Bunker filling | 10 h | ~3 h | 2 h |

The sheet's own schedule shows the consequence: bunker 1 fills 05:00–07:00 D2 while pile 2's T3 ends
06:30 D2 — **thirty minutes** to fill a bunker the SOP costs at ten hours.

Also assumed silently: **zero changeover on all 24 passes** (M1 ends T2 on pile 6 at 03:30 and starts
T3 on pile 1 at 03:30, crossing the platform in zero minutes), and a reload with **no named
destination bunker**.

The loader is named in PRD §47 and costed nowhere. `0021_resources.sql` already has the machinery;
the loader is simply not declared. Per `DEC-005` an activity names a resource **class**, never a unit.

**For capacity conversations:** two turners run 36 machine-hours against a 296-hour cycle — **6 %
utilisation**. A third turner buys nothing. The constraint is the tunnel (~160 h per batch on one
tunnel) and the loader.

---

## 6 · PRD §61 has no home in the schema

> "every process field must be classified as … **an agent must not silently convert one class into
> another**."

Half of it exists, one level down, on one column: `standard_hour_source`, two values, hours only. The
full classification exists in `PROCESS_2026B_AUTHORITATIVE_MATRIX.md` — as a markdown table column,
where no engine can read it and no constraint can defend it.

**Sections 3, 4 and 5 above are each one instance of a class being silently promoted.** Four
mistakes, one mechanism. Care does not prevent it; a column does.

`0040_process_confidence_class.sql` (skeleton in this repo): the seven classes as an enum, on
`process_activity` and `process_definition`, `not null`, everything backfilled `UNRESOLVED`. Plus two
rules made structural — a `FACTORY_RANGE` must carry both bounds, and `PARALLEL_NO_WALLCLOCK`
contributes zero to the envelope, which makes PRD §10.1's paddy double-count (12+22+28+24 = 86 under
a stated 74) arithmetically impossible rather than a thing to remember.

Where it bites: **`ARCH-003`'s `publish_process_version` refuses a definition still `UNRESOLVED` on
anything the envelope depends on.** §61 stops being documentation and becomes a gate at the one
moment it matters.

---

## 7 · 470h is a new version, and ARCH-003 must land first

PRD §3.1, §49 and R14 all require it: a published standard is frozen, a change is a new version, a
new version is a **copy** with `supersedes_id`, and active batches stay tied to the version they were
activated against.

**`ARCH-003` is not built.** `process_definition` and `process_activity` are writable by an admin at
any time under `ref_write`, including a definition an activated batch was generated from. So the
version boundary is currently a convention — and the pressure to edit `PROCESS-2026B` in place will
be highest exactly now, when a large change has landed and copying feels like ceremony.

```
ARCH-003 exists  →  PROCESS-2026B marked published, untouched
                 →  copy → PROCESS-2026C v1 (draft)
                 →  apply: envelope · H0 model · Turner stages · confidence classes
                 →  publish only when nothing the envelope depends on is UNRESOLVED
```

Do not merge `ROUTE-2026A` into anything. Standing rule 3.

---

## 8 · Eight questions blocking factory truth

None can be inferred. Each is one `UPDATE` once answered. They should go to the process owner as one
list, not one at a time.

1. **Bunker cycles after the Turner — two or three?** SOP three, Turner sheet two. ~40–46 h.
2. **Bunker fill — 2 h, 3 h or 10 h?** All three in circulation.
3. **T2 gate — `T1 actual end + 8 h` or `T0 actual start + 24 h`?** Differ by 9–11 h per pile.
4. **The T0→T1 gap — normal, or waste?** As §18 is written it raises six deviations per batch.
5. **Is a Turner pass 1.5 h per pile, or is T0 a 7–8 h stage span?** The PRD quotes both.
6. **Is 470 the factory's target, or a measurement of the simulation?** Currently the latter.
7. **Paddy prep — 74 h or 86 h?** The PRD declares 74 authoritative; sub-values still sum to 86.
8. **Tunnel count.** One tunnel at ~160 h per batch caps throughput at a batch per 6.7 days
   regardless of anything upstream.

---

## 9 · What was written, and what was deliberately not

**Written, as skeletons:** `supabase/migrations/0040_process_confidence_class.sql`,
`supabase/migrations/0041_process_envelope_hours.sql`, `tests/processEnvelope.test.ts`,
eight `PRD-*` tasks on the board.

**Not written, and why.** No migration was applied and no existing migration was edited. The method
that worked last session was *probe the live database before writing the fix* — and three conclusions
moved the moment it was actually probed. These skeletons are written against migration files only, so
they are proposals to be probed. Specifically unverified: whether `0040`'s backfill collides with
rows carrying `standard_hour_source = 'factory_stated'` in the deployed database but not in the seeds.

`ARCH-001` was not written, though it is the ranked #1 gap and fully specified. The trigger is easy;
what is not easy without a live database is whether `return_activity` and the hold/release path
re-submit actuals on an activity that already has them. A write-once trigger that breaks the return
flow would be discovered in production.

Note for whoever picks up `ARCH-001`: it is a **live** path, not theoretical. `0016` line ~270 writes
`actual_end = coalesce(p_actual_end, actual_end)` — the caller's parameter wins over the stored value.
An operator can already restate the past through the supported RPC.
