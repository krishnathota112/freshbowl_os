# WORKFLOW MODEL

> ## ⚠ PARTIAL SUPERSESSION — 20 Aug 2026
>
> | Section | Status |
> |---|---|
> | §1 Process state is the authority, not the calendar | **STILL VALID** — reinforced by the walkthrough (*"Do not assume the calendar itself means the batch can progress"*) |
> | §2 Activity states + mandatory blocked reasons | **STILL VALID** |
> | §3.1 Gate kinds | **STILL VALID**, extended: add `EVIDENCE_COMPLETE`, `MACHINE_STINT_CLOSED`, `MOVEMENT_VALID` |
> | **§3.2 The gate table for ROUTE-2026A** | **SUPERSEDED.** Those 17 rows describe the SOP route. `PROCESS-2026B` gate rules live in the process-definition seed. The SOP limits are **retained and mapped** — see conflict **C-28**. |
> | §4 Event-driven propagation | **STILL VALID** |
> | §5 Phase-2 hour-banded control | **STILL VALID** — retained as the configured monitoring for `TN-HOLD`, see **C-27** |
> | §6 Four GM checkpoints | **STILL VALID**, re-anchored to the new day numbering: activation · Day 4 reload · **Day 15 tunnel loading** · Day 22 tunnel out |
> | §7 Deviation lifecycle | **STILL VALID** |
> | §8 Concurrency | **STILL VALID**, extended — see §9 below |
>
> **New: §9 Parallel streams and scoped dependencies** is appended at the end. It is the most
> important workflow change: `T1 → T2` must bind **per pile**, not as a global barrier.

Labels: **[FACT]** cited · **[INFER]** derived · **[DECISION]** product decision · **[TBD]** confirm.

---

## 1. The governing principle

**The calendar is a plan. Process state is the authority.**

**[FACT]** The sources prove the calendar cannot be the authority:

- S6a plans `T/L` (tunnel loading) for a fixed date, but S1a makes it conditional on
  `temp > 72 °C AND time ≥ 44 h` since reload-2. Those triggers fire when biology decides,
  not when the calendar does.
- S7a records the *actual* bunker and tunnel movements with **times**, and they routinely
  slip a day from the plan: master batch 4 loads tunnel 5 and 6 on 02-May but tunnel 10 on
  03-May — one batch, two calendar days, same activity.
- S3f records `Time to Reach 68–72 °C` of 9 / 14 / 10 hours on the *same* reload for three
  parallel bunker lines. The three lines are simply not on the same day.

**[DECISION]** Therefore: the schedule seeds `planned_date` on every `batch_activity` and
nothing more. Progression is driven by state transitions and gate evaluation.

---

## 2. Activity states

```
                       ┌──────────┐
                       │  LOCKED  │  predecessor not complete
                       └────┬─────┘
                            │ predecessor completed
                            ▼
   ┌────────────────┐  ┌──────────┐
   │ WAITING_TIME   │◄─┤  entry   │   entry gate evaluated
   │ WAITING_COND   │  │   gate   │
   │ AWAITING_LAB   │  └────┬─────┘
   └───────┬────────┘       │ gate satisfied
           │ gate satisfied  ▼
           └──────────► ┌──────────┐
                        │  READY   │
                        └────┬─────┘
                             │ operator opens
                             ▼
                        ┌──────────────┐
                        │ IN_PROGRESS  │
                        └────┬─────────┘
                             │ operator submits
                             ▼
                        ┌──────────────┐
       ┌────────────────┤  SUBMITTED   │
       │                └────┬─────────┘
       │ exit gate needs lab │ exit gate needs supervisor
       ▼                     ▼
┌──────────────┐    ┌────────────────────┐
│ AWAITING_LAB │───►│ AWAITING_SUPERVISOR│
└──────┬───────┘    └────┬──────────┬────┘
       │ FAIL             │ release  │ return
       ▼                  ▼          ▼
┌──────────────┐   ┌───────────┐  ┌──────────┐
│  DEVIATION   │   │ COMPLETED │  │ RETURNED │──► back to IN_PROGRESS
└──────┬───────┘   └───────────┘  └──────────┘
       │ corrective action + retest accepted
       └──────────► AWAITING_SUPERVISOR

   BLOCKED   — an upstream deviation elsewhere prevents this activity
   SKIPPED   — supervisor recorded a documented non-execution (S7a: Reload-2 omitted)
   CANCELLED — batch cancelled
```

Full state set: `LOCKED, READY, IN_PROGRESS, SUBMITTED, AWAITING_LAB, WAITING_TIME,
WAITING_CONDITION, AWAITING_SUPERVISOR, BLOCKED, DEVIATION, RETURNED, COMPLETED, SKIPPED,
CANCELLED`.

### 2.1 Every non-actionable state must carry a reason

**[DECISION]** `blocked_reason_code` + `blocked_reason_text` are **NOT NULL** whenever the
state is one of `LOCKED, WAITING_TIME, WAITING_CONDITION, AWAITING_LAB, BLOCKED, DEVIATION`.
The UI never shows a grey card with no explanation.

Reasons are generated from the gate that failed, so they are always true:

| State | Reason text the operator sees | Generated from |
|---|---|---|
| `WAITING_TIME` | **Rest period — 03:18 remaining** (0A rest 8–12 h) | S1a 0A `REST PERIOD Duration: 8–12 hours` |
| `WAITING_CONDITION` | **Waiting — bunker at 54 °C, unload needs ≥ 58 °C or 60 h (41 h elapsed)** | S1a 0B unload trigger |
| `AWAITING_LAB` | **Awaiting lab — Moisture + EC on bunker-3 reload sample** | lab task generated by exit gate |
| `BLOCKED` | **Blocked — Paddy soak EC 2.1 exceeds 1.5, awaiting re-dilution** | S1a 1C-A `EC < 1.5` |
| `DEVIATION` | **Deviation — Stage-0B held 67.1 °C against max 58 °C** | S3f real case |
| `LOCKED` | **Locked — Phase-1C bunker filling not yet complete** | predecessor |

---

## 3. Gates

A gate is a declarative rule attached to `route_activity.entry_gate_json` /
`exit_gate_json`, evaluated **server-side only**.

### 3.1 Gate kinds

| Kind | Meaning | Example from source |
|---|---|---|
| `PREDECESSOR` | listed activities must be COMPLETED | Phase-1D-A requires Phase-1C |
| `ELAPSED_TIME` | ≥ N hours since a named event | **[FACT]** S1a P1A: "maintain 24 hours gap (T0 → T2)" |
| `TIME_WINDOW` | between N and M hours since event | **[FACT]** S1a 0A rest 8–12 h |
| `SENSOR_THRESHOLD` | probe value crosses a bound | **[FACT]** S1a 0B: temp ≥ 58 °C |
| `EITHER_OR` | any sub-gate satisfies | **[FACT]** S1a 0B: "Temp ≥ 58 °C **OR** Time ≥ 60 hrs" |
| `BOTH` | all sub-gates satisfy | **[FACT]** S1a P2B: "Temperature > 72 °C, Time 44 hours" |
| `LAB_RESULT_PASS` | named lab tests returned an accepted PASS | **[FACT]** S1a 1C-A: "EC < 1.5, pH 7.0" on lagoon water |
| `EVIDENCE_PRESENT` | required evidence kinds attached | **[DECISION]** applied to 0A pH/moisture, spring test, compost-out colour |
| `FIELD_IN_RANGE` | an operator actual sits inside its band | **[FACT]** S1a 0C: "If Moisture ≥ 68 % → proceed" |
| `SUPERVISOR_RELEASE` | a supervisor decision exists | **[DECISION]** |
| `GM_APPROVAL` | a GM decision exists | **[DECISION]** — only at the 4 checkpoints in §6 |
| `MANUAL_OVERRIDE` | approved override request | **[DECISION]** |

### 3.2 The complete gate table for ROUTE-2026A

**[FACT]** unless marked. Every trigger below is transcribed from S1a.

| Stage | Entry gate | Exit gate |
|---|---|---|
| **0A** | `PREDECESSOR: none` · batch is ACTIVE | `FIELD_IN_RANGE moisture 68–69 %` **[TBD-7 — see conflict register]** · `TIME_WINDOW rest 8–12 h` · `EVIDENCE_PRESENT: ph_meter, moisture_meter` · `LAB_RESULT_PASS: bagasse MC/EC/pH` |
| **0B** | `PREDECESSOR 0A` · `FIELD_IN_RANGE input_moisture 68–69 %` | `EITHER_OR( SENSOR_THRESHOLD temp ≥ 58 °C , ELAPSED_TIME ≥ 60 h )` · `FIELD_IN_RANGE fill_height 2.6–2.7 m (hard max 2.8)` · probe readings logged every 6 h |
| **0C** | `PREDECESSOR 0B` · `SENSOR_THRESHOLD temp between 45–58 °C` | branch: `moisture ≥ 68 %` → proceed · `moisture < 67 %` → require `controlled_mist` action **and** `SENSOR_THRESHOLD temp ≤ 45 °C` before misting · `FIELD_IN_RANGE reload_fill_height 2.2–2.4 m (max 2.5)` |
| **0D** | `PREDECESSOR 0C` | `EITHER_OR( SENSOR_THRESHOLD temp ≥ 58 °C , ELAPSED_TIME ≥ 40 h )` · conditioning duration 36–40 h · temp band 50–55 °C declining, hard max 58 |
| **1A** | `PREDECESSOR 0D` | `FIELD_IN_RANGE temp < 45 °C` · checklist: rotovator lump-break confirmed, no water added, output dry/no smell/no heat |
| **1B** | `PREDECESSOR 1A` **and** `PREDECESSOR 0D` | `FIELD_IN_RANGE moisture ≈ 73 %` · `FIELD_IN_RANGE temp < 45–50 °C` · 2 loader flips confirmed · `LAB_RESULT_PASS: moisture` |
| **1C-A** | `PREDECESSOR: none` (parallel track) | `LAB_RESULT_PASS: lagoon EC < 1.5 AND pH ≈ 7.0` · soak-1 2–3 h · tilt-2 1 h · rest 2–3 h · heap ≤ 1.5 m · plastic/twine removal confirmed |
| **1C-B** | `PREDECESSOR 1B` **and** `PREDECESSOR 1C-A` | `FIELD_IN_RANGE temp < 45–50 °C` at T0 · 2 loader flips with no gap · no paddy lumps confirmed |
| **P1A** | `PREDECESSOR 1C-B` · `FIELD_IN_RANGE moisture 73–74 %` | T0 and T1 both recorded, **no water** confirmed · `ELAPSED_TIME 24 h gap T0 → T2` |
| **P1B** | `PREDECESSOR P1A` · `ELAPSED_TIME ≥ 24 h since T0` | `FIELD_IN_RANGE moisture 73–75 %` after T2 · windrow broken confirmed |
| **P1C** | `PREDECESSOR P1B` · `FIELD_IN_RANGE moisture ≤ 75 %` | `SENSOR_THRESHOLD 68–72 °C sustained 26–28 h` · `FIELD_IN_RANGE fill_height 2.6–2.7 m` · no water confirmed · `EITHER_OR( temp > 73–74 °C , ELAPSED_TIME > 30 h )` for reload trigger · `LAB_RESULT_PASS: pH, EC, MC, Ash, N, C:N` |
| **P1D-A** | `PREDECESSOR P1C` · `BOTH( temp > 72 °C , ELAPSED_TIME ≥ 30 h )` | `FIELD_IN_RANGE fill_height 2.5–2.6 m` · no water · hold 68–72 °C for 28–30 h · probes every 6 h · `LAB_RESULT_PASS` |
| **P1D-B** | `PREDECESSOR P1D-A` | `FIELD_IN_RANGE fill_height 2.4–2.5 m` · moisture correction to 75 % · hold 68–72 °C for 40–44 h · `BOTH( temp > 70 °C , ELAPSED_TIME ≥ 44 h )` · `LAB_RESULT_PASS` |
| **P2A** | tunnel is free (`vessel.status = available`) | 6-point checklist all confirmed + `EVIDENCE_PRESENT: tunnel, probe` |
| **P2B** | `PREDECESSOR P1D-B` **and** `PREDECESSOR P2A` · `BOTH( temp > 72 °C , ELAPSED_TIME ≥ 44 h )` | `FIELD_IN_RANGE fill_height 1.8–2.2 m` · `FIELD_IN_RANGE moisture 73–74 %` · no lumps / no pooling / sealed / sensors placed · `LAB_RESULT_PASS: MC, EC, pH, Ash, N, C:N` · **`GM_APPROVAL` — checkpoint 3** |
| **P2C** | `PREDECESSOR P2B` | all 6 tunnel stages recorded with to-reach + held hours and probe min/max · 4-hourly log present |
| **P2D** | `PREDECESSOR P2C` · conditioning-2 ≥ 80 h | `BOTH( moisture 65–66 % , temp ≈ 22–24 °C )` · actinomycetes white patches observed · `LAB_RESULT_PASS: compost-out QC panel` · **`GM_APPROVAL` — checkpoint 4** |

### 3.3 The "no invented threshold" rule

**[DECISION]** Where S1a or S4a give no bound, the gate is **recording-only**: the value is
captured, no verdict is computed, and no deviation is raised. Examples: `settled_height_4h/8h`
(S3f records it, no SOP bound), `ammonia_observation_hr` (recorded, no bound),
`smell sweet/sour` (categorical, no defined fail value).

---

## 4. Event-driven propagation

The engine is a set of server-side handlers on domain events. No client action changes state
directly; the client submits, the server decides.

### 4.1 The canonical loop (worked with real data)

```
OPERATOR completes Phase-1C bunker filling, bunker 2
   ├─ records: fill_height 2.9 m, MC 76 %, EC 1.87        (S3f actuals)
   ├─ attaches: bunker photo, probe photo
   └─ submits
        │
        ▼
SERVER  evaluates exit gate for P1C
   ├─ fill_height 2.9 m vs SOP 2.6–2.7 m  →  OUT OF RANGE
   │     └─► raise DEVIATION (major): "fill height 2.9 m exceeds 2.7 m max"
   ├─ generates LAB TASK: sample BUNKER_FILL / bunker 2
   │     parameters pH, EC, MC, Ash, N, C:N  (S4b cols CP–CU)
   ├─ starts SENSOR watch: 68–72 °C for 26–28 h
   └─ sets P1C state = AWAITING_LAB, and P1D-A = LOCKED
        │
        ▼
LAB TECHNICIAN sees the task in the Lab Queue
   ├─ records MC 75.8 %, pH 7.87, EC 1.82, Ash 20.8, N 1.52 → C:N computed 26.0
   └─ submits with instrument + calibration status
        │
        ▼
SERVER evaluates each result against lab_spec
   ├─ MC 75.8 % vs "Turning/2 + Bunker loading 74–77 %"   → PASS   (S4a Table 2)
   ├─ pH 7.87  vs 8.1–8.4                                  → FAIL
   ├─ N 1.52   vs 1.3–1.6                                  → PASS
   └─ overall = FAIL
        │
   ┌────┴──────────────────────────────────────────────┐
   │ PASS path                        │ FAIL path       │
   ▼                                  ▼                 
P1C → AWAITING_SUPERVISOR       DEVIATION created, linked to lab_result
(or COMPLETED if no             P1D-A stays LOCKED with reason
 supervisor gate)               "Blocked — bunker-2 pH 7.87 below 8.1"
   │                                  │
   │                            SUPERVISOR chooses:
   │                              (a) corrective action → retest
   │                              (b) accept with deviation (reason required)
   │                              (c) return to operator
   │                                  │
   │                            RETEST creates lab_result v2
   │                            v1 remains, marked SUPERSEDED
   │                                  │
   └──────────────► SUPERVISOR RELEASE ◄──────────────┘
                            │
                            ▼
                    P1C = COMPLETED
                    P1D-A = READY (its own entry gate now evaluated)
```

### 4.2 Event catalogue

| Event | Emitted when | Consequences |
|---|---|---|
| `BATCH_ACTIVATED` | admin activates | freeze baseline; instantiate all `batch_activity`; first activity → READY |
| `ACTIVITY_SUBMITTED` | operator submits | evaluate exit gate; create lab tasks; start timers/watches; raise deviations |
| `LAB_RESULT_RECORDED` | technician submits | evaluate vs `lab_spec`; PASS → satisfy gate; FAIL → deviation |
| `LAB_RESULT_SUPERSEDED` | retest accepted | re-evaluate the gate that the original blocked |
| `TIMER_ELAPSED` | scheduled job | `WAITING_TIME` → re-evaluate gate |
| `SENSOR_READING_RECORDED` | probe log entry (manual or ingested) | `WAITING_CONDITION` → re-evaluate; also evaluate Phase-2 control bands (§5) |
| `DEVIATION_RAISED` | any source | block dependents; notify supervisor; add to GM package |
| `CORRECTIVE_ACTION_RECORDED` | supervisor/operator | may require verification lab result |
| `SUPERVISOR_DECISION` | release / hold / return | unblock / hold / send back |
| `GM_DECISION` | approve / return for review | pass or fail a management checkpoint |
| `VESSEL_OCCUPIED` / `VESSEL_RELEASED` | bunker/tunnel in/out | update resource availability; feed manager conflict view |
| `POOLING_ALLOCATED` | tunnel loading | create individual batches; bind batch numbers |

### 4.3 Idempotency and ordering

**[DECISION]** Every event carries `(aggregate_id, sequence_no)`. Handlers are idempotent and
the engine re-evaluates gates from current state rather than applying deltas — so a replayed
or out-of-order event cannot corrupt state. Required because operators work offline in
bunkers and sync late.

---

## 5. Phase-2 is a different kind of workflow

Phase-2C is not a task. It is a **150-hour continuously monitored run** with an
hour-banded control rule set.

**[FACT]** S1c gives, for 7 time bands, per probe (Tunnel Top / Compost / Plenum), the
observed-value bands and the exact action:

| Band | Stage | Probe | Observed | Verdict | Action |
|---|---|---|---|---|---|
| 0–14 h | Levelling | Compost | < 47 | low N, over-degraded in bunker | **decrease fan speed** |
| | | | 47–50 | ideal | none |
| | | | > 51 | high N, under-degraded | **increase fan speed** |
| 15–28 h | Heating-up | Compost 58–60 target | reached in < 10 h | low N / over-degradation | decrease fan |
| | | | 10–12 h | ideal | none |
| | | | > 14 h | high N / under-degradation | increase fan |
| 29–40 h | Pasteurisation *(fan ≥ 75 %)* | Compost | > 63 | microbe loss → poor yield | increase airflow |
| | | | 58–60 | ideal | none |
| | | | < 54 | improper pasteurisation | check fan, damper, phase-1 duration, formulation |
| 41–54 h | Cooling-1 (58→51 in 14 h) | all | > target | less microbial multiplication | increase airflow |
| 55–102 h | Conditioning (51→45 in 48 h) | Plenum **never below 42** | | | |
| 103–142 h | Conditioning hold at 45 (40 h) | | | | |
| 143–150 h | Cooling-2 | Compost | > 28 | not ready to transfer | increase airflow |
| | | | 24–26 | ideal | none |

**[DECISION]** These become `phase2_control_band` rows and drive an **advisory** engine:
when a logged reading falls outside the ideal band, the system surfaces the SOP's own
recommended action to the supervisor. It **does not** control the fan. Acting on it is a
recorded human decision.

**[DECISION]** The 4-hourly log grid (S3f: 21 rows × Avg °C / OA / Fan per tunnel) is a
first-class table, not a note field. It is the single richest evidence source for the
post-batch narrative and must be queryable.

**[TBD-8]** Are the tunnel probe values entered manually by an operator every 4 hours, or can
they be ingested from the tunnel controller? S3f contains a batch record note
*"Data not available due to communication issue"* against Reload-2 timings, which implies an
automated feed exists somewhere and can fail. The answer changes Phase-2C from a data-entry
screen to an ingestion pipeline with a manual fallback.

---

## 6. Where approval actually sits

**[DECISION]** GM approval exists at exactly **four** management checkpoints. Everything else
is supervisor authority. Rationale: S3f shows the factory runs ~10 concurrent master batches
across a 52-day cycle; routing every operator submission to a GM is not a workflow, it is a
queue that will be rubber-stamped.

| # | Checkpoint | When | Why it is a management decision |
|---|---|---|---|
| 1 | **Batch Activation** | end of Day-0 configuration | commits ~160 MT of raw material, 3 bunkers, 3–4 tunnels and 3–4 growing rooms for 52 days |
| 2 | **Phase-0 → Phase-1 release** | after 0D, before 1B | the fibre is now committed; S1a: "Stage-0 decides whether nitrogen will bind or escape" |
| 3 | **Phase-1 → Phase-2 release** | at tunnel loading (P2B) | **the pooling decision** — which bunkers feed which tunnels, at what fill height. S3f's core diagnosis names exactly this step ("two tunnels at 2.25 m") as the amplifier of batch failure |
| 4 | **Tunnel out → Growing room allocation** | at P2D | compost-out QC decides which room gets which tunnel, and whether the batch ships at all |

Checkpoints 2–4 each present a **decision package** — see ROLE_AND_APPROVAL_MODEL.md §5.

---

## 7. Deviation lifecycle

```
RAISED ──► ACKNOWLEDGED ──┬──► CORRECTIVE_ACTION ──► RETEST ──┬──► RESOLVED
                          │                                    └──► still failing ──► ESCALATED (GM)
                          ├──► ACCEPTED_WITH_DEVIATION (supervisor, reason mandatory)
                          └──► ESCALATED (severity = critical, or supervisor chooses)
```

- **[DECISION]** A deviation never disappears. `ACCEPTED_WITH_DEVIATION` is a resolution, not
  a deletion, and it appears in every downstream decision package for that batch.
- **[DECISION]** Severity is derived, not typed: `critical` if the failing gate blocks a
  management checkpoint; `major` if it blocks any downstream activity; `minor` if it is
  recording-only. A supervisor may raise severity, never lower it.
- **[FACT]** Real precedent for `ACCEPTED_WITH_DEVIATION`: S3a/S3f record
  `Deviations (Y/N) = Y` at stage 0B and the batch continued. The system must support that
  outcome — with the reason attached, which the paper form does not capture.

---

## 8. Concurrency: the factory runs ~10 batches at once

**[FACT]** S6a `May'26` shows 7–9 columns with activity on any single day. S7a confirms
overlapping bunker and tunnel occupancy.

Consequences the workflow engine must handle:

1. **Vessel contention.** Bunker 5 cannot be reload-1 for two master batches simultaneously.
   `VESSEL_OCCUPIED` is an exclusive lock with a queue; the Manager's resource view shows the
   conflict before it happens.
2. **Operator contention.** One `T2 + B/L` day requires the turner; two batches scheduled on
   the same turner on the same day is a conflict the Manager resolves, not a runtime error.
3. **Every screen is batch-scoped.** The old app's global `mushroomos.completed.stage_0A`
   (S8e) is the single most important thing not to repeat.

---

# 9. PARALLEL STREAMS AND SCOPED DEPENDENCIES — added 20 Aug 2026

**[DICTATED §41]** *"The process is parallel … A Master Batch is therefore a graph, not a
linear checklist."*

## 9.1 The six streams

A master batch under `PROCESS-2026B` runs six streams that start, overlap and converge:

| Stream | Days | Converges into |
|---|---|---|
| `BAGASSE` | 0 – 7 | YARD at `BG-YARD-UNLOAD` |
| `PADDY` | 4 – 7 | YARD at `PD-YARD-LOAD` |
| `MANURE_MINERAL` | 7 | YARD at `YD-NMIX-ADD` |
| `YARD` | 7 – 8 | BUNKER at `P1-BUNK-LOAD` |
| `BUNKER` | 8 – 14 | TUNNEL at `TN-LOAD` |
| `TUNNEL` | 15 – 22 | end of demo scope |

Streams are **not** phases. Two streams can be simultaneously READY, IN_PROGRESS and BLOCKED,
with different operators and different machines. `batch_activity.stream` exists so a task
queue, a board and a timeline can all be filtered by it.

## 9.2 Convergence gates

Where streams meet, the gate is an explicit `BOTH` over predecessors in different streams:

```
YD-NMIX-ADD  entry:  BOTH( PREDECESSOR BG-YARD-UNLOAD [ALL_INSTANCES],
                           PREDECESSOR NM-ROTAVATE    [ANY_INSTANCE] )

YD-FLIP-3    entry:  BOTH( PREDECESSOR YD-REST        [ALL_INSTANCES],
                           PREDECESSOR PD-YARD-LOAD   [ALL_INSTANCES] )
```

A blocked convergence must name **which stream** it is waiting for:

```
BLOCKED — waiting for Paddy stream: PD-YARD-LOAD (pile 2 of 2) not complete
```

## 9.3 `predecessor_binding` — the T1 → T2 rule

**This is the single most important workflow requirement in the walkthrough.**

**[DICTATED §23]** *"once a pile is done by T1, another turner does T2 … Do not model this as
T1 global complete → wait → T2 global start."*

```sql
gate_rule.predecessor_binding ∈ {
  'ALL_INSTANCES',       -- every instance of the predecessor must be COMPLETED
  'ANY_INSTANCE',        -- at least one
  'SAME_SCOPE_INSTANCE'  -- only the predecessor instance sharing this scope_id
}
```

```
TR-T2  entry gate:
  kind:                PREDECESSOR
  predecessor:         TR-T1
  predecessor_binding: SAME_SCOPE_INSTANCE
```

Result, with three piles:

```
t →
PILE 1   T1 ████████        T2 ████████
PILE 2        T1 ████████        T2 ████████
PILE 3             T1 ████████        T2 ████████
         └─ TURNER-01 ─┘     └─ TURNER-02 ─┘
```

Wall clock ≈ 24 h. With `ALL_INSTANCES` it would be ≈ 42 h — and would be wrong, because it is
not what the factory does.

**Correctness is enforced twice.** The gate binding makes T2 *eligible* per pile; the
`machine_usage` exclusion constraint makes it *possible* only if two turners are actually
assigned. If Day-0 assigns one turner to both, the conflict fires at configuration time
(`MACHINE_UTILIZATION_MODEL.md §3.1`), not in the yard on Day 8.

## 9.4 Scoped instances everywhere

The same binding rule governs every per-instance activity, not just the turner passes:

| Activity | Scope | Binding to its predecessor |
|---|---|---|
| `BG-WEIGH` load *n* | `LOAD` | none — all 11 are independent and parallel |
| `P1-BUNK-LOAD` bunker *n* | `BUNKER_LINE` | `SAME_SCOPE_INSTANCE` on that line's `TR-T2` |
| `P1-BUNK-RELOAD` line *n* | `BUNKER_LINE` | `SAME_SCOPE_INSTANCE` |
| `TN-LOAD` tunnel *n* | `TUNNEL` | `ALL_INSTANCES` on `P1-REST-2` — pooling needs all lines ready |
| `TN-UNLOAD` tunnel *n* | `TUNNEL` | `SAME_SCOPE_INSTANCE` on that tunnel's `TN-HOLD` |

`TN-LOAD` is deliberately `ALL_INSTANCES`: it is the pooling event, and pooling is a decision
over the whole batch — which is also why it is GM checkpoint 3.

## 9.5 Consequences for the operator queue

**[DICTATED §43]** *"The operator should never need to understand the whole graph."*

With six streams and ~72 instances, a stage list is unusable. My Work therefore shows only
**READY** and **IN_PROGRESS** activities assigned to that person, ordered by urgency, each
labelled with its scope so the operator knows *which* pile, *which* bunker, *which* load:

```
MB 20-SEP  ·  PILE 2  ·  TR-T2   Turner pass T2      TURNER-02   READY
MB 20-SEP  ·  LOAD 08 ·  BG-WEIGH  Bagasse Weighment  JCB-02      IN PROGRESS
```

The graph exists for the Supervisor, the Manager and the GM. The operator never sees it.

## 9.6 Consequences for `evaluate_gates`

Because streams progress independently and offline submissions arrive late, `evaluate_gates`
must remain what `ARCHITECTURE_V2.md §3` requires: **a pure function of current state, not an
event applier.** Any event — a late sync, a cron tick, a replayed webhook — re-runs it, and
re-running it can never corrupt state.

Scope: an event on one instance re-evaluates only the activities whose gates reference that
instance, resolved via `predecessor_binding`. Re-evaluating all ~72 on every event is also
correct, just wasteful; correctness must never depend on the narrower scoping being right.
