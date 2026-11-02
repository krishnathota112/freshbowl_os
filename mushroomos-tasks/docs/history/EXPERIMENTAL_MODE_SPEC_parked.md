# Experimental Mode — design spec v2 (27 Sep 2026)

Read this whole file before touching anything named "experiment". It supersedes v1 (same day) and the
Stage 1 canvas notes in `CLAUDE_HANDOFF.md`. Shared doc with the 45 answered questions:
https://claude.ai/code/artifact/0137b4b0-623b-4aba-9c0f-77985af2eabe ("Decisions (27 Sep 2026)").

## 0. The product in one paragraph (owner-approved)

> Experimental Mode does not predict or enforce how the factory should execute an experiment. Admin
> defines the experimental process and its dependencies. The factory is free to execute activities at
> different times and make operational movements as required. MushroomOS captures the actual execution
> as structured events — who did what, when, where, to which material, with what reading/evidence —
> while the existing SOP engine continues to enforce only the applicable process, quality, Lab,
> evidence and resource rules.

**Rows define. The map explains. The factory executes. MushroomOS catches it. Admin controls the experiment.**

## 1. Authority

| Action | Who |
|---|---|
| Create / edit an experiment (rows, dependencies, parallel paths, meeting points, splits, options) | Admin |
| Choose the experimental route; add or cancel an experimental step on a batch | Admin |
| Correct an official historical time or record | Admin, with a reason; the original is kept |
| Publish an improved SOP from an experiment | Admin (explicit action) |
| Execute work; record what physically happened (times, photos, readings, which bunker/tunnel, moves) | Supervisor |
| Tests, results, RECORD / GATE / DECISION | Lab (existing flow) |
| Approve Lab gates | GM (existing flow) |

There is **no Supervisor decision engine**. A supervisor never chooses the process; they record reality.
A branch is chosen by Admin or by a Lab reading rule, never by the supervisor.

## 2. What an experiment is, technically

- An **experimental process** = a `process_definition` with `kind = 'experimental'`, created by cloning a
  published standard (default: the current one) and edited as rows in the existing SOP builder
  (`/admin/sop/version/:id`, migration 0138). Blank start is allowed later.
- An **experimental batch** = a normal `master_batch` on a published experimental version. Same plan
  generation, dependencies, per-pile steps, Lab gates, readings, photos, evidence and audit as a standard
  batch. The generated plan's hours are kept as the **standard reference**, not as due times.
- **Observed-time mode** (the only engine change in behaviour): on an experimental batch
  - no due time, no grace, no late ticket (`activity_due.applies = false`);
  - no "not due yet" — a READY step can start whenever the factory starts it (`planned_time_status`);
  - no minimum durations or elapsed-time gates (`evaluate_gates` DAY0_DURATION / ELAPSED_TIME /
    MIN_DURATION pass; `time_gate_status.ok = true`);
  - a **rest** does not wait for the clock: it opens (READY) when the step before it finishes, starts at
    that finish time, and ends when a person confirms it is over (recording any trigger reading, e.g.
    temperature). Trigger readings are recorded, not required.
  - quality rules are unchanged: dependencies, Lab RECORD/GATE/DECISION, GM approval, required photos,
    evidence integrity, resource readiness.
- The demo "no clock" switch (`batch_clock_waived` = `is_demo`) is **not** reused: for demos it closes rests
  at their *planned* end, which would invent times in an experiment. Experiments use their own check
  `batch_is_experimental(batch)`.
- **H0** stays as a reference clock: every event can be shown as an H-hour.
- A running batch keeps the version it started on. Changing one batch = a batch amendment (existing, 0130).

## 3. Movements are events (the "pinpoint" record)

Supervisor (or Admin) records what physically moved:

```
Batch 173 · P1 + P2 · Bunker 2 → Bunker 3 · 10:42 · photo · remark · recorded by
```

- New table `batch_move_event` (the existing `batch_movement` is one planned move per template and cannot
  hold repeated real moves). Uses the factory's **real** locations (`location`: 17 bunkers, 12 tunnels,
  yard, lagoon, hopper line). No separate experimental bunkers.
- The movement is the truth. If the design expected B2 → T2 and the factory did B2 → T3, it is recorded,
  never rejected.
- Supervisor times are the server's clock. Only Admin may enter an earlier time, with a reason (Q41).
- Corrections are new rows that supersede the old one; nothing is deleted.
- Phase 1 records moves; it does not yet write the shared occupancy tables (`location_occupancy`). Until
  it does, Resources does not show experimental batches in bunkers — known gap, Phase 2.

## 4. Resolved questions (owner, 27 Sep)

| # | Resolution |
|---|---|
| 14 | Use the SOP's own rule. Dependencies can be "any N of a pile group" (Admin configures 3 or 4); don't invent P1+P2. (Engine: new binding, Phase 2.) |
| 20 | Don't invent 2 → 6. A controlled split: input N piles, output N piles, Admin enters N. (Phase 2.) |
| 25 | Use the existing physical factory resources. |
| 27 | Not hard-coded. A convention (1 → T1) may be shown; the recorded movement is the truth. |
| 38 | Not a Phase 1 blocker. Outcome fields later (process, compost, grow-room). |
| 41 | Supervisor cannot alter official times. Admin correction with reason; original kept. |

## 5. Screens

Web (Admin):
- **Experiments** (`/admin/experiments`): experimental processes, each with its batches; "New experiment"
  (clone a standard), links to Edit rows (existing SOP editor), Process map, Start a batch
  (`/admin/batch/start?process=<id>`), Publish.
- **Process map** (`/admin/experiments/:id/map`): generated from the rows — parallel paths, meeting
  points, per-pile steps, Lab gates. Answers "is my design logically right?".
- **Batch map** (`/admin/experiments/batch/:batchId`): the same map with live states for one batch —
  done / running / waiting ("2 of 3 inputs done") / blocked by Lab — plus actual times as H-hours and
  the movement log. Answers "what is actually happening?".
- Existing screens keep working for experimental batches; due/ticket parts disappear by themselves
  because the server says they don't apply.

Phone app (field-app APK):
- Experimental batches carry an "Experiment" tag; planned times read as "standard reference".
- **Record a movement** screen: batch → from (bunker/tunnel/yard) → to → piles → photo → remark → save;
  recent moves listed.
- Rests on experimental batches show "Confirm rest over" as soon as they open.

## 6. Phases

1. **Phase 1 (building now):** `kind` on process versions, `create_experimental_process`, observed-time
   mode (patches to `activity_due`, `planned_time_status`, `time_gate_status`, `evaluate_gates`,
   `advance_batch`), guard so an experiment can never become the current standard by accident,
   `batch_move_event` + `record_move` + photo bucket, views for the web and phone, Experiments / Process
   map / Batch map web screens, phone "Record a movement" + experiment tag, APK.
   Proof: DEMO-safe rolled-back transaction script, then a real run.
2. **Phase 2:** pile count per batch (`CREATES_SCOPE_INSTANCES` / `PER_SCOPE_INSTANCE` instead of fixed
   P1–P6), controlled splits, "any N of group" dependency, options with Admin/reading as decision source,
   loops with a maximum, moves writing occupancy, Admin time corrections as correction rows (step times
   are append-only: trigger `trg_actual_is_append_only`).
3. **Phase 3:** outcomes, compare (experiment vs experiment vs standard), promote winner to standard,
   standard→experimental from a chosen step, Compost Log (`dc_*`, 0141) merged into batch events.

## 7. Engine facts a builder needs (verified 27 Sep in the live DB)

- `batch_clock_waived(batch)` = `master_batch.is_demo`; used by `time_gate_status`, `activity_due`,
  `evaluate_gates`, `planned_time_status`, `advance_batch`, `bind_evidence`.
- `activity_due(...).applies` drives late tickets (`late_block_reason`) and due display.
- `planned_time_status` drives NOT_DUE_YET and `start_block_reason`.
- Rests: `advance_batch` puts time-gate holds in WAITING_TIME from `time_gate_status`; loop 1 closes or
  releases them on the clock. `start_activity` refuses to start a hold; holds are finished through
  `complete_activity` → `submit_activity`, which stamps the hold's start as its predecessor's end.
- Cardinality kinds available: SINGLETON, FIXED_LABEL, PER_SCOPE_INSTANCE, CREATES_SCOPE_INSTANCES,
  MERGES_SCOPE_INSTANCES, DERIVED_FROM_QUANTITY, REPEAT (`evaluate_cardinality`).
- Dependency bindings: ALL_INSTANCES, ANY_INSTANCE, SAME_SCOPE_INSTANCE (`gate_rule`).
- `batch_activity` has triggers `trg_actual_is_append_only`, `trg_plan_is_frozen`, `trg_track_occupancy`,
  `trg_inherit_hold`, `trg_inherit_routing`, `trg_replan_hours`.
- `create_master_batch` accepts any **published** `process_definition_id`; Batch start already lets the
  Admin pick a version (`?process=` preselects).
- Live DB is shared and holds real batches (155–181). Every migration is additive, has a rollback body in
  `db-rollback/`, and is proved in a rolled-back transaction before it is applied.

## 8. Build status

Kept up to date in `CLAUDE_HANDOFF.md` → "Experimental Mode — build log". As of 27 Sep: Phase 1 database (0142, 0143)
applied live and proved; web screens and phone APK built, not yet walked through signed in / on a phone.
