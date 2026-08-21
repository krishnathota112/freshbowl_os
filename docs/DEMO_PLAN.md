# DEMO PLAN

> ## ⚠ REPLACED — 20 Aug 2026
>
> The walkthrough replaces the demo's process scope. **`DEMO_PLAN_V2.md` is the current demo
> plan.** What survives from this document: the seeding philosophy (historical timestamps, not
> a runtime clock multiplier), the "no demo-only code paths" rule, the six demo accounts, and
> the 13 acceptance criteria in §7 — all of which still apply verbatim.
>
> What changes:
>
> | | Old | New |
> |---|---|---|
> | Live scope | 8-day window, Day 0 mixing → Day 8 tunnel loading | **Day 0 weighment → Day 22 tunnel unloading** |
> | Process | ROUTE-2026A, 17 stages | **`PROCESS-2026B`, ~36 activity templates** |
> | Demo batch | MB 391–394 | **MB starting 20 Sep 2026** (391–394 retained as seeded history) |
> | First beat after activation | stage 0A moisture | **bagasse weighment, 11 loads with running totals** |
> | Centrepiece | GM pooling decision | **still the GM checkpoint, plus the bunker-swap movement graph** |
>
> Reason for the change: the day-numbering base moved and the process is now 23 days — see
> conflicts **C-19** and **C-20**.

Target: a deployment-ready end-to-end demo covering the 15 required capabilities, using the
**8-day execution window** (Day 0 mixing → Day 8 tunnel loading) as the live scope, on an
architecture that already supports the full 52-day process.

---

## 1. Demo narrative

One continuous story, ~20 minutes, six logins. The story is deliberately **batch 391–394** —
a real batch whose real failure is documented in S3f — replayed as if MushroomOS had been
running.

> "This is the batch that underperformed. Here is what the system would have shown, to whom,
> on which day, and what decision it would have put in front of you while it still mattered."

### Seeded world

| Object | Seed |
|---|---|
| Schedule | `March-April'26` sheet from S6a, imported |
| Routes | ROUTE-2026A with all 17 activities, gates, SOP values from S1a |
| Lab specs | all of S4a Tables 1–3 |
| Phase-2 control bands | all 7 bands from S1c |
| Materials, vessels | bunkers 1–11, tunnels 1–12, rooms 1–60 |
| **MB 387–390** | already active, sitting at Phase-2C (tunnel process) — gives the dashboard something real |
| **MB 384–386** | at P2D, awaiting GM checkpoint 4 — gives the GM an item on login |
| **MB 391–394** | **the demo batch — not yet created.** Its schedule slot is "starting today" |
| History | batches 366–390 loaded as read-only history so trends and "last batch actual" work |

**[DECISION]** Demo time compression is done by **seeding historical timestamps**, not by a
runtime clock multiplier. The 44-hour hold on MB 387–390 is real because the seed placed its
reload-2 44 hours ago. No `TIME_SCALE` flag exists (contrast S8e).

---

## 2. The 15 capabilities, mapped to the walkthrough

| # | Capability | Demo beat |
|---|---|---|
| 1 | Login / roles | 6 accounts, 6 different landing screens |
| 2 | Monthly schedule | Admin opens the imported March–April grid |
| 3 | Master Batch creation | Admin picks slot `391 392 393 394`, previews, creates |
| 4 | Day-0 configuration | 8 configuration steps, including the operator plan and lab plan |
| 5 | Batch activation | validation report → GM checkpoint 1 → baseline frozen |
| 6 | Operator task execution | Operator's My Work now has stage 0A |
| 7 | Evidence upload | pH meter + moisture photos on 0A |
| 8 | Lab task generation | 0A submission auto-creates the BAGASSE_BL sample |
| 9 | Lab measurement | technician records MC/EC/pH with instrument + calibration |
| 10 | Pass / fail / correction | a **failing** result on bunker fill, then corrective action + retest |
| 11 | Supervisor review | Control Room shows the failure and the blocked downstream gate |
| 12 | Supervisor release / hold | supervisor accepts-with-deviation and releases |
| 13 | GM decision package | checkpoint 3 at tunnel loading — with the 2.25 m warning |
| 14 | Batch timeline | full plan-vs-actual timeline for 391–394 |
| 15 | Multi-batch dashboard | 3 live batches, exceptions surfaced |

---

## 3. Walkthrough

### Beat 1 — Admin, Today *(2 min)*
Login as Admin. **Today** shows one card under STARTING TODAY: `391 392 393 394 ·
Bagasse pre-wet F1 +H1`, and 2 running batches. Click **Preview**: the inherited plan appears —
4 individual batches, start 26 Mar, T/L due 3 Apr, all 17 activity dates from the schedule
column. Nothing has been typed.

**Point made:** the schedule is upstream. Admin does not invent a batch.

### Beat 2 — Day-0 configuration *(5 min)*
**Create** → the 8-step wizard.

- Step 1 **Identity** — inherited fields shown with an `INHERITED` chip. Admin adds rooms
  covered (4), target 200 MT / 50 MT per room, supervisor Ramarao.
- Step 2 **Structure** — 3 bunker lines, 4 individual batches, 4 rooms, reload-2 ON,
  3 paddy soaks. Changing "bunker lines" from 3 to 2 visibly regenerates the plan preview.
- Step 3 **Formulation** — "Clone from MB 387–390". Admin edits to Paddy 53 / Bagasse 38 /
  Wheat 9. **Live chemistry updates:** N 1.53 %, Ash 20.4 %, C:N 26.1, each shown against the
  historical band from S5a. Raw-material lots entered with supplier + vehicle.
- Step 4 **Resources** — bunkers 2/3/4 → 5/6/7 → 8/9/10. Deliberately try bunker 5 in a window
  where MB 387–390 still holds it → **conflict shown inline**, with the other batch named.
- Step 5 **People**.
- Step 6 **Operator plan** — the six-column table. Show stage 0A: SOP `68–69 %` read-only,
  Day-0 set to `69 %`, customisation `± 1 %`, operator-required toggles, evidence requirements.
  **Point made:** admin sets *what will be asked*, not what was measured.
- Step 7 **Lab plan** — 18 checkpoints with their S4a specs; admin confirms.
- Step 8 **Options**.

### Beat 3 — Validate & activate *(2 min)*
Validation report: 0 blocking, 2 warnings (C:N slightly above last batch; tunnel availability
tight on 3 Apr), 3 info (including the unresolved C-01 moisture conflict, shown honestly).
Plan preview: **48 activity instances, 34 lab samples**. Activate → GM checkpoint 1 →
**baseline frozen**, audit event written, first activity goes READY.

**Point made:** after this moment the plan cannot be quietly edited.

### Beat 4 — Operator *(3 min)*
Login as Operator (phone form factor). **My Work** shows one card: `MB 391-394 · 0A Bagasse
Pre-Wet & Rest`, target 68–69 %, last batch actual 71.3 %, plus the golden rule
*"Stage-0A mixing is hydration, not aeration"*.

Record: old bagasse 12 MT, new bagasse 54 MT, lime 0, 2 flippings ✅, moisture **71.5 %**.
Out of range → inline warning + **remark required** — but the submit button still works.
Capture pH meter photo and moisture photo. Submit.

Immediately: 0A → `WAITING_TIME · Rest period — 9:47 remaining`, and a deviation appears.

**Point made:** the operator is never blocked from recording reality; the *gate* is.

### Beat 5 — Lab *(3 min)*
Login as Lab Technician. **Lab Queue** already has the auto-generated `BAGASSE_BL` sample —
nobody created it. Open it: parameters MC / EC / pH with their specs, the method sheet one tap
away, instrument picker showing pH-01 calibrated today ✅ and Balance-02 calibration **due** ⚠.

Now the fail case: open the pre-seeded `BUNKER_FILL` sample on MB 387–390. Enter pH **7.71**
against spec 8.1–8.4 → **FAIL**. Submit. A deviation is raised and the downstream Phase-1D-A
activity shows `BLOCKED — bunker-3 pH 7.71 below 8.1`.

### Beat 6 — Supervisor *(3 min)*
Login as Supervisor. **Control Room** ordered by urgency:

```
⏱ TIME-CRITICAL      MB 387-390 · bunker 9 at 71 °C, 29 h — reload trigger in ~1 h
🧪 LAB FAILURES      MB 387-390 · bunker-3 pH 7.71 (spec 8.1–8.4)
⚠ DEVIATIONS         MB 391-394 · 0A moisture 71.5 % (target 68–69 %)
📋 AWAITING RELEASE  2
📷 EVIDENCE REVIEW   4
```

On the lab failure, choose **corrective action → retest**. Retest comes back 8.15 → PASS.
The timeline shows `7.71 → 8.15 (retest)` — **v1 is still there**. Gate re-evaluates,
Phase-1D-A goes READY.

On the 0A deviation, choose **accept with deviation**, reason "sweet smell, no anaerobic
indication; moisture spec under review (C-01)". The deviation stays open on the record.

**Point made:** nothing disappears. Acceptance is a decision, not an erasure.

### Beat 7 — GM *(4 min)*
Login as GM. **Command Center**: 3 live batches, 1 checkpoint pending.

Open **Checkpoint 3 — MB 387–390, Phase-1 → Phase-2**. The decision package
(ROLE_AND_APPROVAL_MODEL §5) with all nine sections. Section 9 proposes the pooling:

```
3 reload-2 bunkers (8, 9, 10) → 4 tunnels (3, 1, 10, 9)
Fill heights 1.95 / 1.95 / 2.25 / 2.25 m
⚠ 2 tunnels above the 2.2 m SOP maximum
⚠ 3 bunkers pooling into 4 tunnels — uneven maturity risk
⚠ carries 1 accepted deviation from Stage-0 (67.1 °C vs 58 °C max)
```

**This is the demo's climax.** Those are the exact three factors S3f's hand-written diagnosis
later named as the causes of that batch's non-uniformity. GM chooses **Approve with
conditions** — fill height capped at 2.2 m — and the condition propagates to the operator's
P2B task as a Day-0 override with the GM's name on it.

Then **Batch Intelligence**: 391–394 vs 387–390 vs 384–386 on Stage-0 peak temp, reload hold
spread, tunnel fill height, compost-out N/EC, and (from history) room yield. The pattern S3f
described by hand is visible as a chart.

### Beat 8 — Timeline & dashboard *(2 min)*
Open MB 391–394 **Timeline**: 17 activities × 3 lines, plan vs actual, deviations pinned,
lab results inline, evidence thumbnails, decisions with who and why. Close on the
**multi-batch dashboard**.

---

## 4. What is real vs staged

| Real (server-enforced) | Staged (seeded) |
|---|---|
| Schedule import from S6a | the specific month loaded |
| Every gate evaluation | historical timestamps that make holds elapse |
| Deviation raising | pre-existing deviations on MB 387–390 |
| Lab task generation | the pre-seeded failing bunker sample |
| Retest supersession | — |
| RLS + Edge Function enforcement | — |
| Vessel conflict detection | the deliberate bunker-5 collision |
| Evidence upload | stock photos where a real one is unavailable |

**[DECISION]** No demo-only code paths. Everything above runs the production logic. The only
demo artefact is the seed.

---

## 5. Demo accounts

| Role | Email | Lands on |
|---|---|---|
| General Manager | gm@freshbowl.demo | Command Center |
| Manager | manager@freshbowl.demo | Resources |
| Admin | admin@freshbowl.demo | Today |
| Supervisor | supervisor@freshbowl.demo | Control Room |
| Field Operator | operator@freshbowl.demo | My Work |
| Lab Technician | lab@freshbowl.demo | Lab Queue |

**[DECISION]** Real Supabase Auth. No offline fallback table (contrast S8d).

---

## 6. Scope boundaries for the demo

**In:** the 8-day execution window end to end, Stage-0 (7 days) as seeded history, Phase-2C as
a monitored run with the 4-hourly log, tunnel-out QC, GM checkpoints 1 and 3.

**Out but architecturally supported:** growing-room operations, harvest breaks and yield entry
(shown as read-only history), checkpoints 2 and 4 (built, not walked through), tunnel
controller ingestion (**[TBD-8]**), casing soil and spawn checkpoints.

---

## 7. Acceptance criteria

The demo is ready when all of the following are true against a fresh deploy:

1. Six roles log in and land on six different, correct screens.
2. A master batch can be created **only** from a schedule slot.
3. Activation is refused when validation has a blocking finding.
4. After activation, no client request can modify a frozen baseline value — verified by
   attempting it directly against PostgREST with a valid JWT.
5. An operator submission with an out-of-range value **succeeds** and **raises a deviation**.
6. A lab task appears without anyone creating it.
7. A failing lab result blocks a specific downstream activity, with a reason string naming the
   parameter and the bound.
8. A retest supersedes without destroying v1, and both are visible on the timeline.
9. A supervisor release moves the next activity to READY within one realtime tick.
10. The GM package renders all nine sections with real data and snapshots on decision.
11. Killing the network mid-submission and restoring it results in exactly one submission.
12. Every blocked or waiting activity in the UI displays a non-empty reason.
13. The audit log contains every transition with actor, role and reason.
