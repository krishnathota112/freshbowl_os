# The data contract

**This is the screen builder's file.** It describes the **deployed database**, probed directly
(`pg_proc`, `pg_policy`, `role_table_grants`, `pg_event_trigger`) on 11 September 2026 through
migration `0076`. Migrations describe an intention; this describes the system.

**Status: FROZEN** with the backend (`DEC-025`). A screen that needs something not written here has
found a contract task (`CT-*` in `docs/03-mission/TASK-BOARD.md`), not a frontend workaround.

How screens look and speak: `docs/05-ui/UI-SYSTEM.md`. Which screens exist: `docs/05-ui/WORKSTATIONS.md`.
Superseded versions of this contract are in `docs/_archive/superseded-2026-09-11/`.

---

## 0 · The rules a screen must not break

1. **Read from views. Write through RPCs.** No `select` on a base table, no `insert` / `update` /
   `delete` ever. Writes are now impossible anyway — `0074` revoked them from every client role, and
   an event trigger revokes them from any table created later. **Reads are not yet impossible**, and
   the current frontend still reads base tables in 28 places (§11).
2. **Compute nothing the backend already answers.** `state`, `blocked_reason`, `variance_minutes`,
   `projected_end_at`, `outstanding_labels`, `satisfied_count`, `within_authorisation`,
   `approver_roles` are given. A screen that recomputes one will disagree with the database, and the
   database is right.
3. **No timestamp input in the Operator or Supervisor workflow.** `start_activity` and
   `complete_activity` take no time; the server stamps it. A correction is `correct_actual`, which an
   operator may not call.
4. **A disabled button is never the enforcement.** Every refusal below is raised by the database. The
   button is a courtesy; the refusal is the rule. Render the server's sentence; never invent one.

### What a screen must never contain

Process sequence · durations · timestamps it computed · gate logic · lab thresholds · approval
authority · what "on time" or "delayed" means · how many photographs.

### The boundary, stated once

A component receives `variance_minutes` — it never subtracts two timestamps.
It receives `state` — it never infers one.
It receives `blocked_reason` as a finished sentence — it never composes one.

---

## 1 · The process chain

```
PROCESS CATALOGUE → PROCESS VERSION → BATCH + H0 → GENERATED BASELINE → BATCH ACTIVITIES
```

Four numbers a screen must never collapse:

| | Where it comes from | For PROCESS-2026C |
|---|---|---|
| **PROCESS** | `v_process_catalogue.code` + `.version` | `PROCESS-2026C v1` |
| **STANDARD** | `v_process_catalogue.standard_hr` — *calculated from the activities* | `470` |
| **H0** | `master_batch.start_at`, chosen by Admin | per batch |
| **BASELINE** | `H0 + standard_hr` | per batch |

`standard_hr` is `max(standard_end_hour)` over the definition's activities, excluding
`timing_confidence = 'PARALLEL_NO_WALLCLOCK'` (lab work that runs alongside production).
`full_span_hr` — 474 for 2026C — is the last activity of *any* stream. `stated_envelope_hr` is what a
document claims; `envelope_disagrees` says the two differ.

**Never** read the standard from a constant, and **never** from `baseline_hours`, which is
`(total_days + 1) × 24` — a day grid that reads 480 against a 470-hour standard. The Admin schedule
header did exactly that until 10 September.

| Code | Version | Status | standard_hr | Activities | Current |
|---|---|---|---|---|---|
| `PROCESS-2026C` | 1 | published | **470** | 110 (69 operator + 41 lab) | yes |
| `PROCESS-2026B` | 1 | published | 536 | 54 | |
| `ROUTE-2026A` | 1 | archived | — | 17 | |

Both published versions can run at once; each batch is measured against the version it was generated
from. **A published definition is frozen** — its activities, gates, evidence requirements and
checkpoint bindings refuse every change, including from an admin.

---

## 2 · Read views

**38 views, all `security_invoker`** — each reads with the *caller's* permissions, so RLS applies to
it exactly as to the tables beneath. `anon` holds nothing in `public`, and since `0069` an event
trigger gives every new view the same treatment, so this cannot regress silently.

For a screen that means:

- **The publishable key alone reads nothing.** A page without a session gets `401`, not `[]`.
- **What a view returns depends on who asks.** `v_my_work` returns an operator's own rows and a
  supervisor's whole floor. `v_batch_event` and `v_lab_approval_queue` return **zero rows** to an
  operator or a lab technician, by design. Empty is not an error there — design the empty state.

### Admin — process and batch

**`v_process_catalogue`** — `process_definition_id · code · version · status · name ·
anchor_day_label · source_ref · published_at · standard_hr · full_span_hr · stated_envelope_hr ·
envelope_confidence · envelope_disagrees · stated_minus_calculated_hr · activity_count · hold_count ·
stream_count · unplaced_activity_count · is_current · is_selectable`

Filter the picker on `is_selectable`. `v_process_standard`, `v_process_envelope` and
`v_process_envelope_reconciliation` hold the derivation, for a "why 470?" panel only.

`v_prebatch_material_check` — the incoming check before H0. `validate_batch(p_batch)` (§3) is the
pre-activation list.

### Operator and Supervisor — work

**`v_my_work`** — `activity_id · master_batch_id · batch_code · code · title · scope_label · stream ·
instance_no · state · blocked_reason · is_hold · responsible_role · assigned_person_id ·
assigned_machine_id · baseline_start_hour · baseline_end_hour · planned_start_at · planned_end_at ·
actual_start · actual_end · variance_minutes · required_count · satisfied_total · outstanding_labels`

The caller's own work, or everything for supervisor / manager / admin / gm (`0066`). A worker may have
**several rows `IN_PROGRESS` at once** — overlapping batches, parallel tunnel lines — and a screen must
show all of them.

`v_activity_expectation` — plan vs authorised vs actual for one activity: `approved_extension_hr ·
authorised_end_at · within_authorisation · pending_extension_count`.

### Evidence

**`v_evidence_state`** — one row per requirement × media: `requirement_id · batch_activity_id ·
master_batch_id · key · label · media_kinds · min_count · satisfied_count · gates_submission ·
capture_hint · ordering · media_id · storage_path · media_kind · uploaded_at · uploaded_by ·
uploaded_by_name · uploaded_by_role · superseded_by_id · superseded_reason`

`label` and `capture_hint` are the words the operator sees — *"Take a photo of the pile before
turning"* is the requirement's own text.

### Lab

**`v_lab_queue`** — `master_batch_id · batch_code · batch_label · current_day · activity_id ·
activity_title · scope_label · parameters[] · state · action_required · last_submission · band ·
overdue_unknown_reason · samples · results`

**`v_lab_approval_queue`** — **supervisor, manager, admin and gm only** (`0070`). Every lab
submission and the decision on it, with what it holds shut: `activity_id · activity_title ·
activity_state · checkpoint_code · checkpoint_kind · gates_activity_code · gates_activity_title ·
gates_activity_state · is_gate · gate_is_enabled · latest_verdict · latest_reason · decided_at ·
decided_role · decided_by_name · decision_count · sample_count · result_count · awaiting_decision ·
is_approved · approver_roles · approver_question_settled`

`approver_roles` reports `C-32` rather than resolving it: while neither reading is enabled it lists
both `gm` and `supervisor`. **Read it; never hardcode "GM".**

**`v_lab_gate`** — which checkpoint holds which production activity: `process_code ·
checkpoint_code · checkpoint_name · kind · blocks_activity_code · blocks_activity · rule_exists ·
is_enabled`

Also `v_lab_checkpoint_map` · `v_lab_result_current` · `v_lab_result_history` ·
`v_lab_approval_question` · `v_sop_limit_mapping`.

### Management — extension, variance, forecast

**`v_extension_request`** — the whole record, both decisions: `id · master_batch_id · batch_code ·
batch_activity_id · activity_title · scope_label · status · is_effective · requested_extension_hr ·
approved_extension_hr · requested_reason · requested_at · requested_by_name · requested_by_role ·
manager_decision · manager_decided_at · manager_reason · manager_name · gm_decision · gm_decided_at ·
gm_reason · gm_name · effective_from · effective_to · cancel_reason · cancelled_at · expired_at ·
evidence_id · planned_end_at_at_request · planned_end_at_now · actual_end`

**`v_activity_forecast`** — `activity_id · master_batch_id · code · title · scope_label ·
planned_start_at · planned_end_at · approved_extension_hr · authorised_end_at · actual_start ·
actual_end · original_variance_minutes · within_authorisation · projected_end_at · forecast_basis ·
forecast_unknown_reason`

**`v_batch_forecast`** — `master_batch_id · code · status · process_code · h0 · standard_hr ·
planned_end_at · approved_extension_hr · authorised_end_at · slip_minutes · measured_count ·
finished_count · running_count · activity_count · projected_end_at · forecast_basis ·
exposure_minutes · forecast_unknown_reason`

`forecast_basis` differs between the two: activity `finished · running · projected · unknown`; batch
`projected · unknown · no measurement yet`. **`no measurement yet` is the common case on a young
batch.** Treat everything that is not `projected` as "not yet knowable" and show
`forecast_unknown_reason`.

**The projection never folds in the approved extension.** Proven 9 Sep with an 8-hour grant in
force: variance stayed −179 min, plan and actual did not move, `authorised_end = planned_end + 8 h`.

Variance roll-ups: `v_activity_timing` · `v_batch_variance` · `v_stream_variance` ·
`v_variance_contributor` · `v_batch_slip`.

### History and audit

**`v_actual_history`** — `actual_start · actual_end · actual_recorded_at · correction_count ·
first_recorded_start · first_recorded_end · has_been_corrected`. Show `has_been_corrected` wherever an
actual is displayed. Also `v_batch_event` (management only) · `v_checkpoint_status` ·
`v_deviation_open`.

### Plant, vessels, machines

`v_plant_now` · `v_live_batch` · `v_batch_vessel` · `v_batch_vessel_slot` · `v_vessel_availability` ·
`v_batch_movement` · `v_machine_utilisation`.

### Not a screen

`v_unguarded_writer` — **do not trust its count.** It matches the literal text `assert_role`, so it
reports 38 writers where the true number is 2 (`FINDINGS.md` F38).

---

## 3 · Write RPCs

Call through PostgREST `rpc/<name>`. All `SECURITY DEFINER`; `EXECUTE` is revoked from `anon` and
`PUBLIC` on every function, and since `0067` an event trigger does the same for every function
created later. **The role comes from the JWT (`app_metadata.app_role`), never from a parameter** —
which also means a role change takes effect only when the access token is renewed (`FINDINGS.md`
F41).

**A write either happens or refuses; it never pretends** (`DEC-028`). A repeat that changes nothing
succeeds silently and writes no audit event; anything the state forbids is refused with a sentence.

### Admin — batch lifecycle

| RPC | Roles | Behaviour |
|---|---|---|
| `create_master_batch(p_code, p_label, p_start_date, p_config, p_roles, p_supervisor, p_weather, p_start_at, p_process_definition_id)` | admin, gm | a null definition means the catalogue's current version |
| `set_batch_start_at(p_batch, p_start_at)` → `activities_repointed` | admin, gm | draft only |
| `generate_activity_plan(p_batch_id)` → `(activities, evidence_items, field_values)` | admin, gm | refused on an active batch |
| `validate_batch(p_batch)` → `(severity, code, message, activity_id)` | any | run before activating; render every row |
| `activate_batch(p_batch_id)` | admin, gm | **freezes the plan permanently.** Repeat on an active batch: silent, nothing written. On a cancelled batch: refused — *"Cancellation is final"* (`0073`) |
| `cancel_batch(p_batch, p_reason)` → `activities_cancelled` | admin, gm | final |
| `set_activity_plan(p_activity, p_patch)` · `clear_planned_time(p_activity)` | admin, gm, supervisor | draft only |
| `set_current_process` · `publish_process_definition` · `set_process_envelope` · `set_factory_timezone` | admin, gm | publishing freezes a definition |

### Operator and Supervisor — execution

| RPC | Roles | Behaviour |
|---|---|---|
| `start_activity(p_activity)` | operator, supervisor, lab_tech — **matching the activity's `responsible_role`** | **No timestamp.** Not startable → refused with its `blocked_reason`. Already running → silent success, nothing written. The audit event is written only when the state actually changes (`0071`). |
| `complete_activity(p_activity, p_values, p_remarks)` → `(new_state, out_of_range, outstanding_evidence)` | same | **No timestamp. The call a screen uses to finish work.** Delegates to `submit_activity`, so it inherits the row lock and refusals below. Non-null `outstanding_evidence` means the finish was refused — show it. |
| `submit_activity(p_activity, p_values, p_remarks, p_actual_start, p_actual_end)` | same | The paper-slip backfill path. Stated times are refused for an operator; a stored value always wins. An operator cannot finish work that was never started. Row-locked — five concurrent finishes produce one. **Do not wire it into a screen** (`TaskDrawer` does — §11). |
| `correct_actual(p_activity, p_field, p_value, p_reason)` | supervisor, manager, gm, admin | append-only correction, reason ≥ 10 characters; **never an operator** |
| `hold_activity` · `release_activity` · `return_activity` `(p_activity, p_reason)` | supervisor | |
| `assign_activity(p_activity, p_person, p_reason)` | supervisor path | one activity per call — there is no bulk form |
| `release_elapsed_rests(p_batch)` → int | supervisor, admin, gm | opens rests whose wait has genuinely elapsed |
| `raise_deviation(p_activity, p_summary, p_kind, p_detail)` | operator, lab_tech, supervisor, gm | duplicates on replay (§ idempotence) |
| `accept_with_deviation` · `verify_corrective_action` · `add_corrective_action` | supervisor, gm (+ lab_tech to add) | |
| `escalate_deviation(p_deviation, p_reason)` | supervisor | |
| `gm_decide_override(p_deviation, p_approve, p_reason)` | gm | |
| `allocate_vessel` · `release_vessel` · `record_occupancy` · `open_machine_stint` · `close_machine_stint` | | **one machine cannot be in two places, one exclusive vessel cannot hold two batches** — both refused by exclusion constraints with a sentence naming the other commitment. Machine assignment is actual, never planned. |

`advance_batch` and `repair_plan_states` are revoked from `authenticated` — maintenance, not product.

### Evidence

| RPC | Roles | Behaviour |
|---|---|---|
| `bind_evidence(p_activity, p_requirement_key, p_storage_path, p_media_kind, p_supersedes, p_supersede_reason)` → `(media_id, requirement_key, satisfied_count, min_count, uploaded_at)` | operator, lab_tech, supervisor | uploader from the JWT. **Refuses an empty (0-byte) object** (`0071`). The same path twice binds once. A replacement needs a reason and keeps the original. |
| `can_capture_for_activity(p_activity)` → bool | any | the predicate the storage policy uses |

### Lab

| RPC | Roles | Behaviour |
|---|---|---|
| `open_lab_sample(p_activity, p_checkpoint, p_label, p_at)` · `open_prebatch_sample(p_batch, …)` | lab_tech, supervisor, manager, admin, gm (`0072`) | the checkpoint must be bound to the activity **within the same checkpoint map** (`0076`); `p_at` not in the future, and not before H0 once H0 has passed (`0075`) |
| `request_lab_test(p_sample, p_parameter, p_via)` | **unguarded** — see §11 | freezes the specification band into the test |
| `record_lab_result(p_test, p_numeric, p_text, p_instrument, p_invalid_reason, p_raw, p_measured_at)` | lab | an out-of-band value is recorded, and the server raises the deviation |
| `order_retest(p_test, p_reason, …)` | lab | the superseded value stays visible as an earlier version |
| `accept_lab_result(p_result, p_reason)` | lab_tech, supervisor | an admin is refused — accepting a result is a laboratory act |
| `decide_lab_submission(p_activity, p_verdict, p_reason)` | **gm or supervisor** while `C-32` is open | verdict `approved` or `rejected` (lowercase); reason required both ways. Each call **appends**; the latest governs, and the gate follows it in both directions (`0072`, `DEC-029`) |
| `record_checkpoint_decision(p_batch, p_checkpoint, p_verdict, p_reason)` | gm | `approved` · `approved_with_conditions` · `returned` |
| `checkpoint_package(p_batch, p_checkpoint)` → jsonb | | the evidence behind that decision |

> **C-32 is open.** Neither `lab_approval_reading` is enabled, so `decide_lab_submission` accepts
> either gm or supervisor and refuses every other role. Enabling one reading narrows it with no code
> change. **A lab technician can never decide a lab submission, including their own.**

### Extension

| RPC | Roles | Behaviour |
|---|---|---|
| `request_extension(p_activity, p_hours, p_reason, p_evidence)` → uuid | operator, supervisor, lab_tech | **ask while the activity is running** — refused after completion; one open request per activity; reason required; hours > 0 |
| `manager_decide_extension(p_request, p_approve, p_reason, p_granted_hr)` | manager | may grant less than asked, never more |
| `gm_decide_extension(p_request, p_approve, p_reason, p_granted_hr)` | gm | strict order — manager first; may not exceed the manager |
| `cancel_extension(p_request, p_reason)` | | |

Policy in force: manager **and** GM, strict order, one open request per activity, late requests
allowed, evidence optional, no hour cap. **None of these four is reachable from a screen yet.**

### Notification

`send_alert(p_activity, p_role, p_message, p_reason)` — gm, manager, admin, supervisor.

---

## 4 · The photo flow

Bucket **`evidence`**, private, **25 MiB**. The *declared* type must be one of `image/jpeg ·
image/png · image/webp · video/mp4 · video/quicktime` — `application/pdf` and `text/html` are
refused. **The bytes are not inspected** (`FINDINGS.md` F40).

**The path is exactly `<batch_id>/<activity_id>/<filename>`.** The storage policy checks that the
activity is one the caller may capture for **and** that the first token is that activity's own batch
(`0066`). Any other shape is refused by the policy, not by your code.

```
1  capture  → the device camera, not a gallery              DEC-026 · UI-002
2  upload   → storage.from('evidence').upload(`${batch}/${activity}/${name}`, file)
3  bind     → rpc('bind_evidence', { p_activity, p_requirement_key, p_storage_path, p_media_kind })
4  read     → v_evidence_state   satisfied_count vs min_count
5  show     → createSignedUrl(storage_path, ttl)            the bucket is not public
```

An upload that is never bound is an orphan, deletable only by its uploader. A **bound** object cannot
be deleted by any role. **Never fabricate a local URL or keep a photo in localStorage** — an unbound
object proves nothing. If step 2 or 3 fails, the screen says nothing was recorded; proven on the device
with the network cut.

PROCESS-2026C carries **150 evidence requirements** and **93 `EVIDENCE_COMPLETE` exit rules**.

---

## 5 · Gates

`gate_rule` rows on a process activity, evaluated by `evaluate_gates(p_activity, p_phase)`.

| Kind | Phase | 2026C | Meaning |
|---|---|---|---|
| `EVIDENCE_COMPLETE` | exit | 93 | cannot finish until the required evidence is bound |
| `LAB_APPROVED` | entry | 8 | cannot start until the bound checkpoint's **latest** decision is `approved` |
| `PREDECESSOR` | entry | 6 | cannot start until a predecessor's **actual end** plus `min_rest_hr` has passed |

**Submission is not approval.** A lab activity completed leaves its gate shut; only
`decide_lab_submission(…, 'approved', …)` opens it. **And a gate can shut again:** a later rejection
returns a `READY` activity to `LOCKED`; work already `IN_PROGRESS` is never demoted (`DEC-029`).

**Turner T2 is `T1 actual end + 8 h`, per pile** — never `T0 + 24 h`. Four lab gates are bound:
`LAB-BNK-PRE` · `LAB-CM-USE` · `LAB-BNK-LOAD` · `LAB-TUN-LOAD`. **`LAB-MOIST-DEC` is a decision, not a
gate** — the 67–68 % band is `UNRESOLVED`.

---

## 6 · States and enums

```
activity_state      LOCKED · READY · IN_PROGRESS · SUBMITTED · AWAITING_LAB · WAITING_TIME ·
                    WAITING_CONDITION · AWAITING_SUPERVISOR · BLOCKED · DEVIATION · RETURNED ·
                    COMPLETED · SKIPPED · CANCELLED
batch_status        draft · active · closed · cancelled
process_status      draft · published · archived
app_role            gm · manager · admin · supervisor · operator · lab_tech
extension_status    REQUESTED · MANAGER_APPROVED · MANAGER_REJECTED · GM_APPROVED · GM_REJECTED ·
                    EXPIRED · CANCELLED
lab verdict         approved · rejected                     lowercase
checkpoint_verdict  approved · approved_with_conditions · returned
deviation_kind      VALUE_OUT_OF_SOP · VALUE_OFF_DAY0_TARGET · GATE_WAIVED · MANUAL
deviation_state     open · accepted · escalated · resolved
lab_test_state      requested · in_progress · reported · superseded · cancelled
activity_scope      MASTER · LOAD · BUNKER_LINE · PILE · STRAW_PILE · TUNNEL · INDIVIDUAL_BATCH
stream_code         PRIMARY_FIBRE · SECONDARY_FIBRE · STRUCTURAL_STRAW · NITROGEN_MINERAL · YARD ·
                    BUNKER · TUNNEL
```

The human word for each `activity_state` is `STATE_LABEL` in `src/api/work.ts`; the tone and shape
are in `UI-SYSTEM.md`.

---

## 7 · Who may do what

Enforced inside each function, server-side, over any client.

| | operator | lab_tech | supervisor | manager | gm | admin |
|---|---|---|---|---|---|---|
| create · activate · cancel a batch | | | | | yes | yes |
| generate plan · set H0 | | | | | yes | yes |
| edit a draft plan | | | yes | | yes | yes |
| publish · point a process version | | | | | yes | yes |
| start · complete own work | yes | yes | yes | | | |
| capture evidence | assigned | assigned | any | | | |
| correct an actual | **no** | **no** | yes | yes | yes | yes |
| hold · release · return | | | yes | | | |
| open a lab sample | **no** | yes | yes | yes | yes | yes |
| record a lab result | | yes | | | | |
| accept a lab result | | yes | yes | | | **no** |
| **decide a lab submission** | **no** | **no** | yes ¹ | | yes ¹ | |
| management checkpoint decision | | | | | yes | |
| request an extension | yes | yes | yes | | | |
| decide an extension | | | | manager step | GM step | |
| deviation override | | | | | yes | |

¹ While `C-32` is open.

**The server permits a lab technician to complete a lab activity; no screen lets them yet**
(`UI-001`).

---

## 8 · Examples

```ts
// Admin — the standard comes from the SELECTED version, never a constant
const { data: versions } = await supabase
  .from('v_process_catalogue').select('*').eq('is_selectable', true);

const { data: issues } = await supabase.rpc('validate_batch', { p_batch: batchId });
if (!issues.some((i) => i.severity === 'error')) {
  await supabase.rpc('generate_activity_plan', { p_batch_id: batchId });
  await supabase.rpc('activate_batch', { p_batch_id: batchId });   // the plan freezes here
}

// Operator — no timestamp anywhere
await supabase.rpc('start_activity', { p_activity: id });
const path = `${batchId}/${id}/before-${Date.now()}.jpg`;
await supabase.storage.from('evidence').upload(path, file);
await supabase.rpc('bind_evidence', {
  p_activity: id, p_requirement_key: 'BEFORE_PHOTO', p_storage_path: path, p_media_kind: 'image/jpeg',
});
const { data } = await supabase.rpc('complete_activity', { p_activity: id, p_values: {}, p_remarks: null });
// data[0].outstanding_evidence non-null ⇒ the finish was refused. Show it.

// Lab, then the gate — still shut after submission
await supabase.rpc('complete_activity', { p_activity: labId, p_values: {}, p_remarks: null });
await supabase.rpc('decide_lab_submission', {           // gm or supervisor
  p_activity: labId, p_verdict: 'approved', p_reason: 'Within the SOP band.',
});
```

Typed wrappers live in `src/api/` (`work.ts`, `process.ts`, `lab.ts`, `prebatch.ts`, …). **Extend
those rather than calling `supabase.rpc` from a component.**

---

## 9 · Errors

Every refusal is a Postgres exception whose message says what to do instead. Surface it verbatim;
`src/lib/humanError.ts` does this. Never *"Something went wrong."*

- *"… cannot be started — LAB-BNK-PRE: 0 of 1 approved …"* — a locked start (`0071`)
- *"Activity X cannot finish: BEFORE_PHOTO (0 of 1)"* — evidence outstanding
- *"… is COMPLETED, so it cannot be submitted"* — a retry after a lost response
- *"Cancellation is final"* — activating a cancelled batch
- *"PROCESS-2026C v1 is published — its activities are frozen …"* — the definition freeze
- *"There is no un-happen."* — an attempt to clear an actual

---

## 10 · Null semantics

**Empty, zero, not-yet-recorded, not-stated and unavailable are five different things.** A screen that
renders them identically is lying about four.

| Field | Null means | Show |
|---|---|---|
| `actual_start` · `actual_end` | not happened yet | nothing, or "Not started" — never `—:—` looking like a time |
| `variance_minutes` | the activity has not finished; there is nothing to measure | nothing. **Not "on time", not 0.** |
| `projected_end_at` | not knowable yet | `forecast_unknown_reason` |
| `blocked_reason` | nothing holds it | nothing |
| `approved_extension_hr` · `authorised_end_at` | no extension in force | the planned end alone |
| `latest_verdict` | submitted, no decision | "Waiting for approval" |
| `assigned_person_id` | unassigned | "Unassigned", visible to a supervisor |

Never `coalesce` a server null to `0` or `false` in a screen.

---

## 11 · Where the product breaks this contract today

Measured against `src/` on 11 September. **Each is a task, not a precedent.**

| Violation | Where | Task |
|---|---|---|
| **Base tables read directly** — 28 reads of `batch_activity`, `master_batch`, `lab_sample`, `lab_test`, `lab_checkpoint`, `gate_rule`, `process_activity`, `batch_activity_value` | `api/batch.ts` · `batches.ts` · `controlRoom.ts` · `schedule.ts` · `lab.ts` · `tower.ts` · `adminToday.ts` · `batchPage.ts` · `monthlySchedule.ts` · `process.ts` · `prebatch.ts` · `processDefinition.ts`, and inline in `routes/BatchDetail.tsx`, `Batches.tsx`, `TaskDrawer.tsx` | `ARCH-010` — re-pointed as each workstation is rebuilt |
| **`submit_activity` wired into a worker screen** | `api/batch.ts:536`, called from `TaskDrawer` | `UI-003` |
| **The extension chain is reachable from no screen** | — | `UI-006` · `UI-014` |
| **A lab technician cannot reach a completion** | route guard on `/operator/my-work`; no submit in the lab sheet | `UI-001` |
| **`request_lab_test` has no role guard** | backend | `BE-001` — recorded under the freeze |
| **No field for "running and overdue"** | backend | `CT-001` |

---

## 12 · What must not reach production

1. **`dev_environment_marker = 'development'`** is the only reason the dev clock may exist. Screens
   read time through `get_effective_now()`, which reports `dev_available: false` in production.
2. **The demo accounts and demo batches** — six accounts sharing `mushroom2026`, shown on the sign-in
   screen; `MB-DEMO-EARLY/MID/LATE` beside real batches. **Do not delete active batches to turn a
   counter green.**
3. **`/dev/gallery`.**
