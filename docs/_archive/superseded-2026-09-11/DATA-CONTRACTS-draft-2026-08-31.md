# The payload contract

**This is the screen developer's file.** Build against it with the backend unavailable.

Status: **DRAFT.** It becomes frozen at the end of Phase 4 of the mission. Until then, build
components against fixtures shaped like these payloads — that work is safe now and does not wait.

---

## The two rules

1. **Read from views, never base tables.**
2. **Write through RPCs, never `insert` / `update`.**

A screen built that way can be rebuilt completely without a backend change, and can never encode a
factory rule — because it is never handed one.

## What a screen must never contain

Process sequence · durations · timestamps it computed itself · gate logic · lab thresholds ·
approval authority · what "on time" means · how many photographs.

**If a screen needs a value that is not in its payload, that is a backend contract task.** Write it
down, move to the next component. Never a frontend workaround.

## The boundary, stated once

A component receives `variance_min` — it never subtracts two timestamps.
It receives `state` — it never infers one.
It receives `blocked_reason` as a finished sentence — it never composes one.

---

## 1 · Operator — My Work

```
READ   v_live_batch  WHERE assigned_to = me AND state IN (ELIGIBLE, RUNNING, BLOCKED)

activity_id           uuid
batch_code            text          "MB-2026-09-01"
activity_label        text          "T2 · Pile 4 · Turner"   resolved server-side
batch_hour            numeric       186
planned_start_at      timestamptz
planned_end_at        timestamptz
authorised_end_at     timestamptz   planned_end + approved extension, or null
actual_start_at       timestamptz   null until started
state                 enum          ELIGIBLE | RUNNING | BLOCKED | SUBMITTED | DONE
blocked_reason        text          null unless BLOCKED. A finished sentence, from the server.
required_fields       jsonb[]       {code, label, unit, type, min?, max?}
required_evidence     jsonb[]       {code, label, captured: bool}
resource_classes      text[]        ["TURNER"]        a class, never a unit
resource_units        jsonb[]       {id, label}       for that class, from the resource register
rest_until_at         timestamptz   null unless a time gate is open
may_request_extension bool

WRITE  start_activity(activity_id)
       submit_activity(activity_id, values, actual_start?, actual_end?)
       bind_evidence(activity_id, requirement_code, storage_key)
       request_extension(activity_id, hours, reason, evidence_id?)
```

**Never computes:** eligibility · lateness · how long the rest has left *as a rule* (it counts down
to a server-supplied instant) · which fields are required · how many photographs.

**Note for Phase 2:** whether the caller may state `actual_start` / `actual_end` at all is under
review. Today the client supplies them. Build the component so those inputs can be removed without
restructuring it.

---

## 2 · Lab — queue and entry

```
READ   v_lab_queue  WHERE role = lab_tech

checkpoint_id         uuid
master_batch_id       uuid
batch_code            text
batch_day             int           the label the laboratory recognises
batch_hour            numeric       authoritative
checkpoint_label      text          "Before bunker loading"
action_state          enum          ACTION_REQUIRED | SUBMITTED | APPROVED | REJECTED
rejection_reason      text          null unless REJECTED
parameters            jsonb[]       {code, label, unit, kind: NUMERIC | OBSERVATION,
                                     options?: text[], previous_value?, previous_at?}
required_evidence     jsonb[]       {code, label, captured}
is_gate               bool          true if downstream is locked on this

WRITE  record_lab_result(checkpoint_id, values)
       bind_evidence(checkpoint_id, requirement_code, storage_key)
```

Two things this shape settles:

**Observations arrive typed.** `kind: OBSERVATION` carries its own `options` — so the screen never
hard-codes `Too dry · Normal · Too wet · Dripping`, and never hard-codes the actinomycetes
vocabulary either. The laboratory can change its terminology without a deployment.

**`previous_value` is supplied.** The technician sees the last reading without the screen querying
history itself.

**Never computes:** whether a checkpoint is a gate · what a reading means · whether a value is out
of range. Out-of-range never blocks recording — it forces a remark and raises a deviation, and both
of those are server behaviour.

**Never waits.** After submit, the technician returns to the queue and opens another batch. The
pending approval belongs to the activity, not to the person.

---

## 3 · Manager / GM — Decision Centre

```
READ   v_extension_request  ·  v_activity_expectation  ·  v_lab_queue(pending)

request_id            uuid
activity_label        text
planned_end_at        timestamptz   ┐
requested_hr          numeric       │  four separate fields
approved_hr           numeric       │  never collapsed
authorised_end_at     timestamptz   │  planned_end + approved_hr
actual_end_at         timestamptz   ┘  null while running
original_variance_min int           actual − planned. NEVER hidden by an approval.
reason                text
evidence_id           uuid          optional
manager_decision      enum          null | APPROVED | REJECTED
manager_reason        text
gm_required           bool          from extension_policy, not from the screen
may_decide            bool          the server's answer, not a role check in JS

WRITE  accept_lab_result(result_id, decision, reason)
       manager_decide_extension(request_id, approve, reason, granted_hr?)
       gm_decide_extension(request_id, approve, reason, granted_hr?)
       gm_decide_override(deviation_id, decision, reason)
```

### The four numbers are the product

`planned_end` · `approved_extension` · `authorised_end` · `actual_end`.

A screen that shows three of them, or that moves the planned end to match the authorisation, has
destroyed the only thing this register exists to preserve.

```
planned end          12:00      never mutated
approved extension   +2 h    →  authorised 14:00
actual end           13:40

original variance    +1 h 40 m     ← still visible
within authorisation yes
```

**Role gating comes from the server's refusal, not from hiding a button.** Render the action; let
the server say no; show what it said.

**Approval only narrows.** A manager may grant less than was asked, never more; the GM may not
exceed the manager. The screen does not enforce this — it displays the bounds the server supplies.

---

## 4 · GM — Factory Now

```
READ   v_plant_now  ·  v_batch_variance  ·  v_batch_forecast

factory_now_at        timestamptz   the server clock, never the browser's
batches[]             {batch_code, batch_hour, stage_label, variance_min,
                       status: ON_PLAN | LATE | BLOCKED}
attention[]           {kind: LOCKED | EXTENSION | DEVIATION | CONFLICT,
                       batch_code, label, waiting_since, waiting_for, oldest_first_rank}
forecast              {envelope_hr, projected_hr, exposure_min, basis_label}
```

`envelope_hr` comes from the process definition. **It is never the literal 470 in a screen.**

`basis_label` carries the forecasting assumption as text. The factory has not confirmed a formula,
so the screen displays it **as an assumption**, not as a fact.

`oldest_first_rank` is supplied — the screen does not decide what deserves attention.

---

## 5 · Batch Story

```
READ   v_live_batch(batch)  ·  v_activity_timing(batch)  ·  v_extension_request(batch)

streams[]   {stream_code, label, lane_order,
             segments[]: {activity_id, label, kind: WORK | HOLD | LAB,
                          planned_start_hr, planned_end_hr,
                          actual_start_hr, actual_end_hr,
                          state, variance_min}}
playhead_hr           numeric
envelope_hr           numeric       470 — from the definition, not a constant
anchor_hr             numeric       174
```

Clicking a segment opens the **proof drawer** — one reusable component:

```
planned · actual · who · which machine · what was measured · the lab result and its timestamp
· the evidence, openable as the actual image · the decision and who made it · the deviation
· the extension
```

**"Two photographs uploaded" is not proof. Management must be able to open the image.**

---

## 6 · Admin — Batch Setup

```
READ   process definition views (published versions only)

WRITE  create_master_batch(process_definition_id, code, config)
       generate_activity_plan(batch_id)          draft only
       activate_batch(batch_id)                  one-way; freezes the plan
```

Admin creates a batch from a **published** standard. Admin does **not** edit the standard through
batch creation. Activation is one-way — a batch that must not run is cancelled, never returned to
draft.

---

## 7 · Views that do not exist yet

Two screens currently have no view to read from. **Specify and build them in Phase 4 — do not let a
screen read a base table "for now".**

| Consumer | Reads today | Needs |
|---|---|---|
| `controlRoom.ts` | `batch_activity`, `gate_rule` | a **gate view**: per activity, which gates apply, which are satisfied, which are blocking, and the reason as a sentence |
| `schedule.ts` | six base tables | a **planning view**: the batch plan as a screen needs it, without joining the planning domain by hand |

---

## 8 · Every contract, when frozen, carries these headings

```
INPUTS · OUTPUTS · STATES · MUTATIONS · ERRORS · PERMISSIONS · NULL SEMANTICS
```

**NULL SEMANTICS is the one that gets skipped and matters most.** Empty, zero, not-yet-recorded,
not-stated and unavailable are five different things, and a screen that renders them identically is
lying about four of them.
