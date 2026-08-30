> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# DEMO PLAN V2 — `PROCESS-2026B`

Supersedes the scope of `DEMO_PLAN.md`. Everything in that document's §4 (no demo-only code
paths), §5 (six real Supabase accounts, no offline fallback) and §7 (13 acceptance criteria)
still applies verbatim and is not repeated here.

---

## 1. The demo batch

| | |
|---|---|
| Master batch | **MB-2026-09-20** — starts **20 September 2026** |
| Process | `PROCESS-2026B`, Day 0 → Day 22 |
| Bagasse required | 21.0 MT · load capacity 2.0 MT → **11 loads** |
| Bunker lines | 3 · Yard piles 2 → 1 mixed · Paddy piles 2 · Tunnels 3 |
| Activity instances | ≈ 72 |
| Evidence items | ≈ 131 |

**Concurrent context, seeded so management screens are not empty:**

| Batch | State on demo day | Purpose |
|---|---|---|
| **MB 387–390** | Day 18 — tunnel hold, 1 open deviation | gives the Supervisor and GM live content |
| **MB 384–386** | Day 22 — tunnel unloaded, awaiting GM checkpoint | gives the GM an item on login |
| MB 366–383 | closed | trends, "previous batch actual", machine-utilisation history |

**[DECISION]** Time compression is achieved by **seeding historical timestamps**. There is no
runtime clock multiplier anywhere in the codebase.

---

## 2. Walkthrough — the vertical slice

The slice the client authorised, mapped onto the new process.

### Beat 1 · Admin — Today
Login as Admin. One card under **Starting today**: `MB-2026-09-20 · Bagasse Weighment · Day 0`.
Two batches running. One conflict in *Needs me*.

### Beat 2 · Monthly schedule → Slot preview
The imported grid. Pick the slot. Preview shows what is inherited — **identity only** — and
states plainly that per-activity dates are generated from `PROCESS-2026B`, not from the sheet
(**C-20** shown on screen, not hidden).

### Beat 3 · Day-0 configuration
Eight steps. Three of them are new and carry the demo:

- **Load plan** — enter `21 MT` and `2 MT/load`; watch **11 load instances** appear. Change
  the capacity to 2.5 and watch it become 9. Nothing is typed twice, nothing is hard-coded.
- **Operator plan** — the six-column table across ~36 activities, including `NM-ROTAVATE`
  with its **three** evidence requirements and `BG-HOP-2` with its **two variants**.
- **Resource plan** — assign `TURNER-01` to T1 and `TURNER-02` to T2, then deliberately assign
  both to `TURNER-01` and watch the conflict fire at configuration time.

### Beat 4 · Validate → GM checkpoint 1 → Activate
Validation report with blocking / warning / info, unresolved conflicts shown honestly.
GM approves. **Baseline freezes.** 72 activity instances materialise in one transaction.

### Beat 5 · Operator — Day 0 weighment
My Work shows `BG-WEIGH · Load 01 of 11`. Record vehicle, machine, start, actual 2.08 MT,
finish. The running-total component updates:

```
TARGET 21.0 MT   LOADED 2.08 MT   REMAINING 18.92 MT   LOADS 1 / 11
```

Complete four loads to make the progress visible, then jump the seed forward.

### Beat 6 · Operator — Day 1 hopper + bunker load
`BG-HOP-1` with water: capture **before** and **after** — the submit button stays disabled at
`1 / 2` and enables at `2 / 2`.

`BG-HOP-2`: the **variant decision**. Measured moisture is shown with **both** candidate bands
(68–69 % and 75–78 %) because **C-01/C-29 is unresolved**; operator picks water or dry and
gives a reason. The choice is recorded on the activity.

`BG-BUNK-LOAD` into Bunker 3: start machine stint on `JCB-02`, finish, duration computed.
**Bunker 3 occupancy opens** and appears immediately on the Manager's vessel timeline.

### Beat 7 · Lab
The bunker-load submission auto-generates a lab sample. Nobody created it. Technician records
moisture with instrument and calibration status; a **FAIL** blocks `BG-REST-1` with a reason
naming the parameter and the bound. Corrective action → **retest** → v1 preserved, v2 accepted,
gate re-evaluates.

### Beat 8 · Rest — the time gate
`BG-REST-1` shows `RESTING · started · required · remaining`. **[TBD-21]** is visible on the
screen: the required duration is a Day-0 value because the factory has not yet stated it.

### Beat 9 · Day 4 — the movement
`BG-UNLOAD → BG-HOP-3 → BG-BUNK-RELOAD`. Destination must differ from source; try Bunker 3
again and it is refused with the rule stated. Reload into Bunker 7. The **bunker-swap card**
renders — `BUNKER 03 → BUNKER 07`, via `JCB-02`, plan 2 h vs actual, before/after photos.

### Beat 10 · Supervisor — Control Room
Urgency-ordered: time-critical gates, lab failures, deviations, awaiting release, evidence
review. Release one activity, hold another, return a third — each with a mandatory reason,
each writing a `decision` and an `audit_event`.

### Beat 11 · GM — decision package
Nine sections, real data, snapshotted on decision. Section 9 proposes the next movement.
Approve with conditions; the condition propagates to the operator's task with the GM's name.

### Beat 12 · The movement graph
Close on the batch movement visualisation — four streams, occupancy bars with planned ghosts,
transfer arrows labelled with the machine, current position marked. Plus the machine
utilisation summary.

---

## 3. Additional acceptance criteria for `PROCESS-2026B`

In addition to the 13 in `DEMO_PLAN.md §7`:

14. Changing `expected_load_capacity_mt` regenerates the load count **before** activation and
    is refused **after** activation.
15. `TR-T2` on pile 2 becomes READY when **pile 2's** `TR-T1` completes — while pile 1 and
    pile 3 are still in T1. Verified by seeding three piles and completing them out of order.
16. Assigning one turner to both T1 and T2 on the same pile is refused by the
    `machine_usage` exclusion constraint, not by the form.
17. `NM-ROTAVATE` cannot be submitted with 2 of 3 evidence requirements satisfied, and the
    outstanding one is named.
18. A reload whose destination equals its source is refused, with the rule quoted.
19. Storing paddy in Bunker 4 blocks a compost occupancy of Bunker 4 in the same window.
20. Machine utilisation for the batch is derived entirely from `machine_usage` — no editable
    hours field exists anywhere in the schema.
21. Every activity carries `planned_start/end` and `actual_start/end` as separate columns, and
    `variance_minutes` is generated, never written.
22. The process definition can be changed — add an activity, change a duration, add an
    evidence requirement — **by editing seed SQL only**, with zero application-code changes.
23. Every unresolved conflict affecting the demo batch is visible in the UI at the point it
    matters, not silently resolved.
