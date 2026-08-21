# IMPLEMENTATION PLAN

> ## ⚠ SUPERSEDED AS THE BUILD ORDER — 20 Aug 2026
>
> **`KIRO_BUILD_INSTRUCTIONS.md` §3 is the build order.** Twelve steps, not eight phases.
>
> This document is retained for two things it still does better:
> - **§"Decision classification summary"** — the FACT / INFERENCE / PRODUCT DECISION / TBD
>   classification of every significant call, as the client asked for.
> - **The dependency map and "what must be answered before each phase"** — still a useful
>   view of which questions gate which work.
>
> Its 8-phase sequencing is superseded because the process changed (`PROCESS-2026B`,
> Day 0 → Day 22, 36 role-based activity templates). Phase numbering here does **not**
> correspond to step numbering there. Do not follow both.

Eight phases. Each phase lists: what gets built, the decisions it depends on, its exit
criteria, and the TBDs that must be answered before it starts.

Labels: **[FACT]** cited · **[INFER]** derived · **[DECISION]** product decision · **[TBD]** confirm.

**Nothing in Phase 2 onward starts until the 🔴 conflicts in SOURCE_CONFLICTS.md are answered.**
Phase 1 is safe to build now — it depends on no contested value.

---

## PHASE 1 — Foundation + Supabase + Auth

**Goal:** a deployed, empty, correctly-governed system with six roles that actually work.

### Build

1. **Repo & toolchain** — Vite + React + TypeScript, Tailwind, TanStack Query, Zustand,
   Supabase CLI, migrations in-repo, CI running typecheck + lint + migration apply.
2. **Reference schema** — `material`, `material_spec`, `vessel`, `growing_room`, `equipment`,
   `vehicle`, `personnel`, `profiles`.
3. **SOP-as-data schema + seed** — `route`, `route_activity`, `route_activity_field`,
   `lab_spec`, `lab_method`, `phase2_control_band`.
   **This is the highest-value single task in the whole plan.** Seed ROUTE-2026A from S1a
   (17 activities, all targets, durations, triggers, golden rules), `lab_spec` from S4a
   Tables 1–3, `phase2_control_band` from S1c's seven bands, `lab_method` from S4a's eight
   methods. All as version-controlled SQL.
4. **Auth** — Supabase GoTrue; six roles as a JWT custom claim populated by an auth hook from
   `profiles.role`. **Delete the offline account table (S8d).**
5. **RLS baseline** — every table denies by default; policies added per role.
6. **Audit infrastructure** — `audit_event`, `REVOKE UPDATE, DELETE`, trigger helper.
7. **App shell** — six role-shaped layouts, routing guard, PWA manifest, service worker,
   offline read cache, mobile/desktop breakpoints.
8. **Design system** — carried forward from S8's visual language (it is good and the factory
   knows it): the green primary, Material Symbols, card + step-tracker patterns. Rebuilt as
   components, not copied HTML.

### Depends on
**[TBD-9]** compost manager role · **[TBD-11]** does Manager exist · **[TBD-15]** Supabase project.

### Exit criteria
- Six accounts log in, land on six distinct screens, and a role cannot reach another role's
  route — verified by direct PostgREST call with a valid JWT, not by clicking.
- `select count(*) from route_activity where route = 'ROUTE-2026A'` = 17, and every activity
  has its golden rule and at least one SOP-valued field.
- `lab_spec` contains all 9 compost-phase rows and all 7 raw-material rows from S4a.
- An `audit_event` cannot be updated or deleted by any role.

---

## PHASE 2 — Batch creation

**Goal:** Admin can turn a schedule slot into an activated, baseline-frozen master batch.

### Build

1. **Schedule importer** — read an S6a month sheet: columns → `schedule_slot`, cells →
   `schedule_slot_day`. Map the 17 current tokens to stage codes (DOMAIN_MODEL §3).
   **Unmapped tokens go to a review queue, never guessed** (C-18).
2. **Batch tree schema** — `master_batch`, `formulation`, `formulation_line`, `material_lot`,
   `bunker_line`, `bunker_occupancy`, `tunnel_load`, `individual_batch`, `growing_room_load`.
   Cardinalities per DOMAIN_MODEL §1.1 — **no hard-coded 3 or 4**.
3. **Activity schema** — `batch_activity`, `batch_activity_value` with all six columns,
   append-only on `actual_value`.
4. **Vessel exclusivity** — the `EXCLUDE USING gist` constraint (ARCHITECTURE_V2 §4.1).
5. **Admin Today** — starting-today cards, running batches, needs-me.
6. **Monthly schedule view** — the grid, read-only, with slot status.
7. **Creation wizard** — the 8 steps of BATCH_CREATION_SPEC §3–§10, including the
   **six-column operator plan** and the **lab plan**.
8. **Formulation engine** — clone-from-previous, live N % / Ash % / C:N against the S5a
   historical band; raw-material assay range check against S4a Table 1 (catches C-08).
9. **Validator** — blocking / warning / info per BATCH_CREATION_SPEC §11.
10. **`activate_batch`** Edge Function — the single transaction of ARCHITECTURE_V2 §3.1.
11. **Baseline freeze** — post-activation writes to columns 1–3 rejected at the DB level.

### Depends on
**[TBD-1]** bunker→tunnel correspondence · **[TBD-2]** wheat/mustard wetting ·
**[TBD-3]** D−7 vs D−6 · **[TBD-6]** batch numbering reset · **C-02**, **C-03** cadence.

### Exit criteria
- Import `March-April'26` → the `391 392 393 394` slot exists with 19 activity days.
- Create MB 391–394; plan generates **48 activity instances and 34 lab samples**.
- A structural change (3 lines → 2) regenerates the plan.
- Bunker double-booking is refused **by the database**, not the form.
- After activation, a direct PostgREST `PATCH` on `batch_activity_value.sop_value` returns 403.
- Activation with a blocking validation finding is refused.

---

## PHASE 3 — Operator execution

**Goal:** operators do real work offline and the server decides what happens next.

### Build

1. **`submit_activity`** Edge Function — idempotent, append-only, variance computed
   server-side, deviations raised, lab tasks created, timers started.
2. **`evaluate_gates`** — pure Postgres function; every gate kind from WORKFLOW_MODEL §3.1;
   returns state + **non-null reason** for every non-actionable state (CHECK-enforced).
3. **Timer & sensor watches** — `pg_cron` `expire_timers` at 1 min; server-clock only.
4. **My Work** — assigned tasks, batch/line/vessel scope visible, blocked reasons rendered.
5. **Task screen** — the card of ROLE_AND_APPROVAL_MODEL §4: target, previous batch actual,
   golden rule, one input at a time, large controls.
6. **Evidence capture** — camera, client downscale, IndexedDB blob queue, upload on reconnect,
   signed-URL gallery.
7. **Offline write queue** — client `idempotency_key`, replay, conflict-free by upsert.
8. **Probe logging** — bunker readings every 6 h (S1a), with the reminder job.
9. **Deviation raising** — automatic from out-of-range, manual from the operator.

### Depends on
**C-01** 🔴 moisture spec · **[TBD-7]**, **[TBD-10]** shifts.

### Exit criteria
- An out-of-range submission **succeeds**, requires a remark, and raises a deviation.
- Airplane mode → submit 3 activities + 6 photos → reconnect → exactly 3 submissions, 6 photos.
- Every blocked/waiting card shows a true, generated reason string.
- A device clock set 48 h forward does not open a 44-hour gate.
- `batch_activity_value` has zero in-place updates to `actual_value` — verified by trigger test.

---

## PHASE 4 — Lab workflow

**Goal:** the lab is a real subsystem with samples, methods, instruments, verdicts and retests.

### Build

1. **Lab schema** — `lab_sample`, `lab_test`, `lab_result` (versioned), `lab_instrument`,
   `lab_checkpoint`.
2. **Auto-generation** — the trigger table of LAB_MODEL §6, all 18 checkpoints.
3. **`record_lab_result`** — derived params computed server-side (C:N, TDS), verdict against
   **frozen** targets, calibration status recorded, deviation on fail.
4. **`supersede_lab_result`** — retest with mandatory reason code; v1 preserved; auto-escalate
   after 2 retests.
5. **Lab Queue** — overdue / today / retest sections, with "blocking: …" annotations.
6. **Result entry** — spec inline, method sheet, instrument picker with calibration state,
   raw readings for Kjeldahl (titrate / blank / sample weight).
7. **Sensory results** — enumerated domains + mandatory photo for colour and actinomycetes.
8. **Calibration tracking** — daily pH, weekly EC (S4a); `calibration_due` job.

### Depends on
**C-10** 🟡 damaged calculations · **C-15** 🟠 EC direction · **[TBD-12]** sensory gates ·
**[TBD-13]** compost EC band · **[TBD-14]** ammonia.

### Exit criteria
- Submitting stage 0A creates a `BAGASSE_BL` sample with no human action.
- A FAIL blocks a named downstream activity with a reason naming the parameter and bound.
- A retest produces v2, v1 is queryable and shown, and the gate re-evaluates.
- C:N and TDS cannot be typed — they are computed.
- A result on an expired-calibration instrument is recorded and flagged, not rejected.
- No parameter without a spec receives a pass/fail verdict.

---

## PHASE 5 — Supervisor control

**Goal:** one person can run the floor across ~10 concurrent batches.

### Build

1. **`supervisor_decide`** — release / hold / return / accept-with-deviation / request
   override, each with mandatory reason, each writing a `decision` + `audit_event`.
2. **Protected gates** — the four categories of ROLE_AND_APPROVAL_MODEL §3.2 refuse
   supervisor waiver and require a GM override.
3. **Control Room** — urgency-ordered: time-critical gates, lab failures, deviations,
   awaiting-release, evidence review, active batches board.
4. **Time-critical detection** — any gate whose window opens or expires within 4 h.
5. **Deviation workbench** — full lifecycle (WORKFLOW_MODEL §7), corrective action with
   verification retest linkage.
6. **Evidence review** — gallery per activity, flag for follow-up.
7. **Realtime** — subscriptions per ARCHITECTURE_V2 §6.
8. **Override requests** — supervisor → GM.

### Exit criteria
- A release moves the next activity to READY within one realtime tick.
- A hold blocks with a reason and nothing downstream advances.
- A protected gate cannot be waived by a supervisor — verified at the function level.
- Accept-with-deviation resolves the block but the deviation remains open and appears in the
  next GM package.
- Control Room renders correctly with 10 concurrent batches seeded.

---

## PHASE 6 — GM management

**Goal:** the four checkpoints, with decision packages that would have caught batch 391–394.

### Build

1. **`gm_decide`** — approve / approve-with-conditions / return-for-review; conditions
   propagate to the affected activity as a named Day-0 override.
2. **Checkpoint engine** — the four checkpoints of WORKFLOW_MODEL §6.
3. **Decision package generator** — the nine sections of ROLE_AND_APPROVAL_MODEL §5,
   **snapshotted** on decision.
4. **Tunnel pooling allocation** — `allocate_tunnel_pooling`: N bunkers → M tunnels, creating
   individual batches, with fill-height validation against the 1.8–2.2 m SOP bound.
   *This is the screen that surfaces the 2.25 m problem.*
5. **Phase-2C monitoring** — 4-hourly log entry, `phase2_control_band` advisory engine
   surfacing the SOP's own recommended action.
6. **Compost-out QC** — full panel including the four sensory attributes.
7. **Command Center** — exceptions across all live batches.
8. **Batch comparison** — Stage-0 peak temp, reload hold spread, tunnel fill height,
   compost-out N/EC/actino, room yield.

### Depends on
**C-04**, **C-05** 🟠 conditioning-2 band · **C-17** unload temperature · **[TBD-8]** probe
ingestion — this determines whether Phase-2C is a form or a pipeline.

### Exit criteria
- Checkpoint 3 renders all nine sections from real data.
- The 391–394 seed produces the three warnings: 2.25 m fill, 3→4 pooling, carried Stage-0
  deviation.
- Approve-with-conditions writes a condition that appears on the operator's P2B task.
- A decision package is immutable after the decision.
- The comparison view reproduces, as a chart, what S3f's narrative says in prose.

---

## PHASE 7 — Multi-batch dashboard & resources

**Goal:** the factory view — Manager resources, GM intelligence, batch timeline.

### Build

1. **Batch timeline** — 17 activities × N lines, plan vs actual, deviations, lab results,
   evidence, decisions, on one scrollable axis.
2. **Multi-batch board** — every live batch, current position, blocked count, next gate.
3. **Manager resources** — vessel Gantt for bunkers 1–11 and tunnels 1–12 over 21 days;
   conflict list; equipment load; personnel roster.
4. **Capacity forecast** — from the schedule.
5. **Reports** — Master Batch Record export matching S2a's section structure (so the paper
   form can be printed from the system during transition), lab summary matching S4b's column
   groups, movement log matching S7a.
6. **Growing room & harvest** — room loading, spawn date, 3 breaks, room total, days
   (**[TBD-16]** ownership).

### Depends on
**[TBD-16]** harvest data ownership.

### Exit criteria
- The timeline for a completed seeded batch renders every activity, result, deviation and
  decision in order.
- The vessel Gantt shows the real S7a rotation without overlap errors.
- The Master Batch Record export is section-for-section comparable to S2a.

---

## PHASE 8 — Testing, hardening, deployment

### Build

1. **Workflow test suite** — every gate kind, every state transition, every protected gate,
   fed by the real values from S1a/S4a. Gate logic is a pure function; this suite is cheap and
   must be exhaustive.
2. **RLS test suite** — for each of 6 roles × each table × each verb, assert allow/deny
   directly against PostgREST.
3. **Offline test suite** — network partition during submit, during upload, during retest;
   duplicate-sync; clock skew.
4. **Seed & demo environment** — DEMO_PLAN §1.
5. **Performance** — 10 concurrent batches, 500 activities, 2 000 lab results, 5 000 photos.
6. **Historical import** (**[TBD-17]**) — S4b, S5a, S7a as read-only history so trends and
   "previous batch actual" are real from day one.
7. **Packaging** (**[TBD-18]**) — Capacitor APK if the phones are managed.
8. **Runbook** — backup/restore, migration procedure, route-version publishing, user
   onboarding.

### Exit criteria
All 13 acceptance criteria in DEMO_PLAN §7 pass on a fresh deploy.

---

## Dependency map

```
PHASE 1  Foundation ────────────────────────────────────────────┐
   │  needs: TBD-9, TBD-11, TBD-15                              │
   ▼                                                            │
PHASE 2  Batch creation                                         │
   │  needs: C-02, C-03, TBD-1, TBD-2, TBD-3, TBD-6             │
   ▼                                                            │
PHASE 3  Operator ◄── needs: C-01 🔴, TBD-7, TBD-10             │
   │                                                            │
   ▼                                                            │
PHASE 4  Lab ◄── needs: C-10, C-15, TBD-12, TBD-13, TBD-14      │
   │                                                            │
   ▼                                                            │
PHASE 5  Supervisor  (no new external dependencies)             │
   │                                                            │
   ▼                                                            │
PHASE 6  GM ◄── needs: C-04, C-05, C-17, TBD-8                  │
   │                                                            │
   ▼                                                            │
PHASE 7  Dashboards ◄── needs: TBD-16                           │
   │                                                            │
   ▼                                                            │
PHASE 8  Test & deploy ◄── needs: TBD-17, TBD-18 ───────────────┘
```

---

## What must be answered before each phase starts

| Before | Must have answers to |
|---|---|
| Phase 1 | TBD-9, TBD-11, TBD-15 |
| Phase 2 | C-02, C-03, TBD-1, TBD-2, TBD-3, TBD-6 |
| Phase 3 | **C-01 (blocking)**, TBD-7, TBD-10 |
| Phase 4 | C-10, C-15, TBD-12, TBD-13, TBD-14 |
| Phase 6 | C-04, C-05, C-17, TBD-8 |
| Phase 7 | TBD-16 |
| Phase 8 | TBD-17, TBD-18 |

Phase 1 can start immediately. Nothing in it depends on a contested number.

---

## Decision classification summary

Every significant call made across these documents, classified as instructed.

### FACT FROM SOURCE
17-stage route and all its targets, durations and triggers (S1a) · lab acceptance ranges
(S4a) · Phase-2 hour-banded control rules (S1c) · master batch record structure (S2a) ·
schedule grid semantics and the 17-token vocabulary (S6a) · the 8-day execution window (S6a
column trace, verified on 3 columns) · variable cardinality 3–4 individual batches, 2–3 bunker
lines, fractional rooms (S3a–f, S4b) · N:M pooling at tunnel loading (S3f, S3a) ·
bunker/tunnel movement with times, and Reload-2 sometimes skipped (S7a) · 18 lab checkpoints
(S4b) · formulation chemistry and C:N computation (S5a, S4a) · everything in
SOURCE_INVENTORY §8 about the existing app.

### INFERENCE
Individual-batch identity binds at tunnel loading, not bunker loading (DOMAIN_MODEL §1.2) ·
the schedule token glossary F/H/B-L/R-L/T0-T2/PF/PS/T-L/GR-L (DOMAIN_MODEL §3) · batch start
= bagasse pre-wet day = D−7 · S2b is a superseded template (C-02) · S1b is a superseded
diagram revision (C-14) · conditioning-2 real band is 80–90 h (C-05).

### PRODUCT DECISION
Six roles with the supervisor as operational authority and only four GM checkpoints ·
out-of-range never blocks recording, only blocks the gate · six columns preserved to the
database, columns 1–3 frozen at activation · append-only actuals and versioned lab results ·
every non-actionable state carries a generated reason · server-side gate evaluation as a pure
Postgres function, all writes through Edge Functions, no client authority · one web app with
four role experiences, PWA first · offline write queue with idempotency keys, no offline auth ·
demo time compression by seeding, never by a runtime multiplier · never invent a threshold the
sources do not give · nothing is ever deleted.

### TBD / REQUIRES CONFIRMATION
18 conflicts (C-01…C-18) and 18 open questions (TBD-1…TBD-18) in SOURCE_CONFLICTS.md.
**C-01 (Stage-0 moisture 68–69 % vs 75–78 %) is the one that blocks a build phase.**
