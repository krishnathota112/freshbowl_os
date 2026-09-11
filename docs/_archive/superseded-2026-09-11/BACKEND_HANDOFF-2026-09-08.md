# BACKEND_HANDOFF — MushroomOS

**Status: the backend spine (B1–B7) is frozen.** Migrations `0001–0060` replay clean; typecheck and
build are clean; `tests/acceptance.test.ts` carries one batch through Admin → Operator → Lab → GM →
gate → delay → extension → management.

This file is the contract the three screens are built against. It describes **the deployed
database**, probed directly (`pg_proc`, `pg_policy`, `information_schema`), not the migration files.

---

## 0 · The four rules the frontend must not break

1. **Read from views. Write through RPCs.** No `select` on a base table, no `insert`/`update` ever.
2. **Compute nothing the backend already answers.** `state`, `blocked_reason`, `variance_minutes`,
   `projected_end_at`, `outstanding_labels`, `satisfied_total`, `within_authorisation` are given.
   A screen that recomputes one of them will disagree with the database, and the database is right.
3. **No timestamp input in the Operator or Supervisor workflow.** `start_activity` and
   `complete_activity` take no time. The server stamps it. A correction is `correct_actual`, which
   operators may not call.
4. **Never treat a disabled button as enforcement.** Every refusal below is raised by the database.
   The button is a courtesy; the refusal is the rule. Render `blocked_reason`; do not invent one.

---

## 1 · The process chain

```
PROCESS CATALOGUE → PROCESS VERSION → BATCH + H0 → GENERATED BASELINE → BATCH ACTIVITIES
```

Four numbers that must never be collapsed on a screen:

| | where it comes from | for PROCESS-2026C |
|---|---|---|
| **PROCESS** | `v_process_catalogue.code` + `.version` | `PROCESS-2026C v1` |
| **STANDARD** | `v_process_catalogue.standard_hr` — *calculated from the activities* | `470` |
| **H0** | `master_batch.start_at`, chosen by Admin | per batch |
| **BASELINE** | `H0 + standard_hr` | per batch |

`standard_hr` is `max(standard_end_hour)` over the definition's activities, excluding
`timing_confidence = 'PARALLEL_NO_WALLCLOCK'` — lab work that runs alongside production and consumes
no wall clock. `full_span_hr` (474 for 2026C) is the last activity of *any* stream: full discharge.
`stated_envelope_hr` is what a document claims; `envelope_disagrees` says the two differ.

**Never** read the standard from a constant, and **never** from `baseline_hours`, which is
`(total_days + 1) × 24` — a day grid that reads 480 against a 470-hour standard.

Deployed catalogue today:

| code | version | status | standard_hr | full_span_hr | activities | current |
|---|---|---|---|---|---|---|
| `PROCESS-2026C` | 1 | published | **470** | 474 | 110 (69 operator + 41 lab) | yes |
| `PROCESS-2026B` | 1 | published | 536 | 536 | 54 | |
| `ROUTE-2026A` | 1 | archived | — | — | 17 | |

> PROCESS-2026B computes **536**, not the 552 older screens showed. 552 was the day grid. That is a
> factory question, not a code one, and it does not affect 2026C.

**A published definition is frozen.** Its activities cannot be inserted, deleted or changed. An
UPDATE that sets every column to the value it already holds is permitted, because it changes nothing.

---

## 2 · Read views

All 37 views are readable by `authenticated` **and by nobody else**. Since `0061` every view is
declared `security_invoker`, so it reads with the CALLER's permissions and RLS applies to it exactly
as it applies to the tables beneath — and `anon` holds no privilege anywhere in `public`.

Two consequences for a screen:

- **The publishable key alone reads nothing.** A page that has not signed the user in gets `401`,
  not an empty array. There is no "live mode" without a session.
- **`v_batch_event` is management-only.** It reads `audit_event`, whose `audit_read` policy names
  gm / manager / admin / supervisor. An operator sees zero rows there, by design.

These are the ones the three screens need.

### Process selection — Admin

**`v_process_catalogue`** — `process_definition_id · code · version · status · name ·
anchor_day_label · source_ref · published_at · standard_hr · full_span_hr · stated_envelope_hr ·
envelope_confidence · envelope_disagrees · stated_minus_calculated_hr · activity_count · hold_count ·
stream_count · unplaced_activity_count · is_current · is_selectable`

Filter the picker on `is_selectable`. `v_process_standard`, `v_process_envelope` and
`v_process_envelope_reconciliation` hold the derivation, for a "why does the document say 470?"
panel. Not needed for the normal flow.

### Work — Operator and Supervisor

**`v_my_work`** — the signed-in worker's OWN work, scoped in `0066`. Before that it filtered on
nothing but `mb.status = 'active'`, so an operator's "My Work" listed all 41 laboratory checkpoints.
It now returns the rows assigned to you, or everything if you are supervisor / manager / admin / gm.
This only works because `0061` made views `security_invoker` — `auth.uid()` is the caller's:
`activity_id · master_batch_id · batch_code · code · title · scope_label · stream · instance_no ·
state · blocked_reason · is_hold · responsible_role · assigned_person_id · assigned_machine_id ·
baseline_start_hour · baseline_end_hour · planned_start_at · planned_end_at · actual_start ·
actual_end · variance_minutes · required_count · satisfied_total · outstanding_labels`

`blocked_reason` is already a sentence. `outstanding_labels` already names the missing evidence.

`v_activity_expectation` — plan vs authorised vs actual for one activity, with
`approved_extension_hr`, `authorised_end_at`, `within_authorisation`, `pending_extension_count`.
`v_activity_timing`, `v_batch_variance`, `v_stream_variance`, `v_variance_contributor` are the
variance roll-ups for management.

### Evidence

**`v_evidence_state`** — one row per requirement × media:
`requirement_id · batch_activity_id · master_batch_id · key · label · media_kinds · min_count ·
satisfied_count · gates_submission · capture_hint · ordering · media_id · storage_path · media_kind ·
uploaded_at · uploaded_by · uploaded_by_name · uploaded_by_role · superseded_by_id ·
superseded_reason`

### Lab

**`v_lab_queue`** — `master_batch_id · batch_code · batch_label · current_day · activity_id ·
activity_title · scope_label · parameters[] · state · action_required · last_submission · band ·
overdue_unknown_reason · samples · results`

**`v_lab_approval_queue`** (0063) — every lab submission and the decision standing on it, with what
that decision holds shut: `activity_id · activity_title · activity_state · checkpoint_code ·
checkpoint_kind · gates_activity_code · gates_activity_title · gates_activity_state · is_gate ·
gate_is_enabled · latest_verdict · latest_reason · decided_at · decided_role · decided_by_name ·
decision_count · sample_count · result_count · awaiting_decision · is_approved · approver_roles ·
approver_question_settled`

`approver_roles` reports C-32 rather than resolving it — while neither reading is enabled it lists
both `gm` and `supervisor`. Read it; never hardcode "GM".

**`v_lab_gate`** — which checkpoint blocks which production activity:
`process_code · checkpoint_code · checkpoint_name · kind · blocks_activity_code · blocks_activity ·
rule_exists · is_enabled`

Also `v_lab_checkpoint_map`, `v_lab_result_current`, `v_lab_result_history`,
`v_lab_approval_question`, `v_sop_limit_mapping`.

### Extension and forecast — Management

**`v_extension_request`** — the full record including both decisions:
`id · master_batch_id · batch_code · batch_activity_id · activity_title · scope_label · status ·
is_effective · requested_extension_hr · approved_extension_hr · requested_reason · requested_at ·
requested_by_name · requested_by_role · manager_decision · manager_decided_at · manager_reason ·
manager_name · gm_decision · gm_decided_at · gm_reason · gm_name · effective_from · effective_to ·
cancel_reason · cancelled_at · expired_at · evidence_id · planned_end_at_at_request ·
planned_end_at_now · actual_end`

**`v_activity_forecast`** — `activity_id · master_batch_id · code · title · scope_label ·
planned_start_at · planned_end_at · approved_extension_hr · authorised_end_at · actual_start ·
actual_end · original_variance_minutes · within_authorisation · projected_end_at · forecast_basis ·
forecast_unknown_reason`

**`v_batch_forecast`** — `master_batch_id · code · status · process_code · h0 · standard_hr ·
planned_end_at · approved_extension_hr · authorised_end_at · slip_minutes · measured_count ·
finished_count · running_count · activity_count · projected_end_at · forecast_basis ·
exposure_minutes · forecast_unknown_reason`

`forecast_basis` names how the projection was reached, and **the two views do not share a
vocabulary**:

- `v_activity_forecast` — `finished` · `running` · `projected` · `unknown`
- `v_batch_forecast` — `projected` · `unknown` · **`no measurement yet`**

`no measurement yet` is the common case on a young batch (nothing has completed, so there is no
variance to project from) and it is the one a screen is most likely to forget. Key on the exact
string, or treat everything that is not `projected` as "not yet knowable" and show
`forecast_unknown_reason`.

**The projection never folds in the approved extension** — plan, authorisation and forecast stay
three separate numbers. `v_batch_slip` is the worst completed variance the projection is built
from.

### History and audit

**`v_actual_history`** — `actual_start · actual_end · actual_recorded_at · correction_count ·
first_recorded_start · first_recorded_end · has_been_corrected`. Show `has_been_corrected` wherever
an actual is displayed; that is the whole point of an append-only actual.
Also `v_batch_event`, `v_checkpoint_status`, `v_deviation_open`.

### Plant, vessels, machines

`v_plant_now` · `v_live_batch` · `v_batch_vessel` · `v_batch_vessel_slot` · `v_vessel_availability` ·
`v_batch_movement` · `v_machine_utilisation` · `v_prebatch_material_check`.

### Ops-only

`v_unguarded_writer` — writer functions with no role guard. Should return zero rows. Not a screen; a
regression check.

---

## 3 · Write RPCs

Call via PostgREST `rpc/<name>`. All are `SECURITY DEFINER`; `EXECUTE` was revoked from `anon` and
`public` on every one of them in `0057`, so **the grant is the boundary** — an unauthenticated call
gets no further than the grant. Role is read from the JWT (`app_metadata.app_role`), never from a
parameter.

### Admin — batch lifecycle

| RPC | roles | notes |
|---|---|---|
| `create_master_batch(p_code, p_label, p_start_date, p_config, p_roles, p_supervisor, p_weather, p_start_at, p_process_definition_id)` | `admin, gm` | null definition ⇒ the catalogue's current version. No process **code** parameter. |
| `set_batch_start_at(p_batch, p_start_at)` → `activities_repointed` | `admin, gm` | draft only |
| `generate_activity_plan(p_batch_id)` → `(activities, evidence_items, field_values)` | `admin, gm` | |
| `validate_batch(p_batch)` → `(severity, code, message, activity_id)` | any | run before activating; render the rows |
| `activate_batch(p_batch_id)` | `admin, gm` | **freezes the plan permanently** |
| `cancel_batch(p_batch, p_reason)` → `activities_cancelled` | `admin, gm` | |
| `set_activity_plan(p_activity, p_patch)` · `clear_planned_time(p_activity)` | `admin, gm, supervisor` | draft only |
| `set_current_process(p_definition, p_reason)` | `admin, gm` | moves the catalogue pointer |
| `publish_process_definition(p_definition, p_reason)` | `admin, gm` | after this, frozen |
| `set_process_envelope(p_definition, p_hours, p_confidence, p_source_ref)` | `admin, gm` | records the *stated* envelope only |
| `set_factory_timezone(p_timezone, p_reason)` | `admin, gm` | |

### Operator and Supervisor — execution

| RPC | roles | notes |
|---|---|---|
| `start_activity(p_activity)` | `operator, supervisor, lab_tech` — **and the role must match the activity's `responsible_role`** (`0066`) | **no timestamp.** Server stamps `actual_start`. A supervisor and above may take eligible downstream work; an operator may not start a laboratory checkpoint. |
| `complete_activity(p_activity, p_values, p_remarks)` → `(new_state, out_of_range, outstanding_evidence)` | same | **no timestamp.** Use this, not `submit_activity`. |
| `submit_activity(p_activity, p_values, p_remarks, p_actual_start, p_actual_end)` | same | Stated timestamps are refused for an operator, and a stored value always wins over a passed one. Exists for the paper-slip backfill case. **Do not wire it into a screen.** |
| `correct_actual(p_activity, p_field, p_value, p_reason)` | `supervisor, manager, gm, admin` | append-only correction; reason ≥ 10 chars; **never operator** |
| `hold_activity` · `release_activity` · `return_activity` `(p_activity, p_reason)` | `supervisor` | |
| `assign_activity(p_activity, p_person, p_reason)` | supervisor path | |
| `release_elapsed_rests(p_batch)` → int | `supervisor, admin, gm` | opens rests whose wait has genuinely elapsed |
| `raise_deviation(p_activity, p_summary, p_kind, p_detail)` | `operator, lab_tech, supervisor, gm` | |
| `accept_with_deviation` · `verify_corrective_action` · `add_corrective_action` | `supervisor, gm` (+`lab_tech` for add) | |
| `escalate_deviation(p_deviation, p_reason)` | `supervisor` | |
| `gm_decide_override(p_deviation, p_approve, p_reason)` | `gm` | |
| `allocate_vessel` · `release_vessel` · `record_occupancy` · `open_machine_stint` · `close_machine_stint` | | machine assignment is **actual, never planned** |

`advance_batch` and `repair_plan_states` are **revoked from `authenticated`**. They are maintenance,
not product. Do not call them.

### Evidence

| RPC | roles | notes |
|---|---|---|
| `bind_evidence(p_activity, p_requirement_key, p_storage_path, p_media_kind, p_supersedes, p_supersede_reason)` → `(media_id, requirement_key, satisfied_count, min_count, uploaded_at)` | `operator, lab_tech, supervisor` | uploader taken from the JWT; refuses if `auth.uid()` is null; replacing requires a reason |
| `can_capture_for_activity(p_activity)` → bool | any | the same predicate the storage policy uses |

### Lab

| RPC | roles | notes |
|---|---|---|
| `open_lab_sample(p_activity, p_checkpoint, p_label, p_at)` · `open_prebatch_sample(p_batch, …)` | lab | `p_at` may not be in the future |
| `request_lab_test(p_sample, p_parameter, p_via)` | lab | |
| `record_lab_result(p_test, p_numeric, p_text, p_instrument, p_invalid_reason, p_raw, p_measured_at)` | lab | measurement may not be in the future |
| `order_retest(p_test, p_reason, …)` | lab | |
| `accept_lab_result(p_result, p_reason)` | `lab_tech, supervisor` | |
| `decide_lab_submission(p_activity, p_verdict, p_reason)` | **`gm` or `supervisor`** — see below | verdict is `approved` or `rejected`; reason required |
| `record_checkpoint_decision(p_batch, p_checkpoint, p_verdict, p_reason)` | `gm` only | verdict is `approved`, `approved_with_conditions` or `returned` |
| `checkpoint_package(p_batch, p_checkpoint)` → jsonb | | the evidence pack behind the decision |

> **C-32 is open.** `lab_approval_reading` holds two readings —
> `GM_APPROVES_EVERY_LAB_SUBMISSION` (gm) and `SUPERVISOR_ACCEPTS_LAB_RESULT` (supervisor) — and
> **neither is enabled**. While that is true, `decide_lab_submission` accepts a decision from either
> role and refuses every other. When the factory answers C-32, enabling one reading narrows this to
> that role alone with no code change. **A lab technician can never decide a lab submission.**

### Extension

| RPC | roles | notes |
|---|---|---|
| `request_extension(p_activity, p_hours, p_reason, p_evidence)` → uuid | `operator, supervisor, lab_tech` (`extension_policy.requester_roles`) | **ask while the activity is still running** — refused after completion; one open request per activity; reason required; hours > 0 |
| `manager_decide_extension(p_request, p_approve, p_reason, p_granted_hr)` | `manager` | |
| `gm_decide_extension(p_request, p_approve, p_reason, p_granted_hr)` | `gm` | strict order: manager first |
| `cancel_extension(p_request, p_reason)` | | |
| `expire_extensions()` → int | | maintenance |

Policy in force: manager **and** GM approval required, strict order, one open request per activity,
late requests allowed, evidence not required, no hour cap.

### Notification

`send_alert(p_activity, p_role, p_message, p_reason)` — `gm, manager, admin, supervisor`.

---

## 4 · Evidence and photo flow

Bucket **`evidence`**, private. Limit **25 MiB**. MIME allow-list:
`image/jpeg · image/png · image/webp · video/mp4 · video/quicktime`.

**The path must be exactly three tokens: `<batch_id>/<activity_id>/<filename>`.** The storage policy
parses `path_tokens[2]` as the activity id and calls `can_capture_for_activity` on it, **and since
`0066` it also checks that `path_tokens[1]` is the batch that activity is actually on**. Any other
shape is refused by the policy, not by a check in your code.

`can_capture_for_activity` is true when the caller's role is `operator`, `lab_tech` or `supervisor`
**and** either they are the assigned person or they are a supervisor.

```
1. upload → supabase.storage.from('evidence').upload(`${batchId}/${activityId}/${name}`, file)
2. bind   → rpc('bind_evidence', { p_activity, p_requirement_key, p_storage_path, p_media_kind })
3. read   → v_evidence_state  (satisfied_count vs min_count)
4. view   → createSignedUrl(storage_path, ttl)   — the bucket is NOT public
```

An orphan — uploaded but never bound — can be deleted by the uploader. A **bound** object cannot be
deleted at all: the `evidence_delete_unbound` policy checks that no `evidence_media` row references
it. **Never fabricate a local URL or stash a photo in localStorage.** An unbound object proves
nothing.

PROCESS-2026C carries **150 evidence requirements** and **93 `EVIDENCE_COMPLETE` exit rules**. An
activity whose required evidence is short is refused at completion — `complete_activity` returns
`outstanding_evidence`.

---

## 5 · Gates

`gate_rule` rows on a process activity, evaluated by `evaluate_gates(p_activity, p_phase)` →
`(rule_id, kind, binding, verdict, reason, is_enabled, mapping_confidence, …)`.

PROCESS-2026C:

| kind | phase | count | meaning |
|---|---|---|---|
| `EVIDENCE_COMPLETE` | exit | 93 | cannot finish until required evidence is bound |
| `LAB_APPROVED` | entry | 8 | cannot start until the bound checkpoint has an **approved** `lab_decision` |
| `PREDECESSOR` | entry | 6 | cannot start until a named predecessor's **actual end** plus `min_rest_hr` has passed |

**Submission is not approval.** A lab result recorded and submitted leaves the gate shut. Only
`decide_lab_submission(..., 'approved', reason)` opens it — and since `0064` that call also writes
the release down. Before `0064` it recorded the decision and stopped: `evaluate_gates` returned
`pass` from that instant, but `batch_activity.state` and `blocked_reason` are STORED columns and
nothing rewrote them, so the held activity stayed `LOCKED` and the operator's screen went on saying
"0 of 1 approved". Found by running a batch, not by reading.

**The Turner T2 rule is `min_rest_hr = 8` measured from that pile's own T1 actual end** — never
`T0 + 24h`. Six `PREDECESSOR` rules, one per pile. `v_gate_rest_rule` shows them.

Four lab gates are bound: `LAB-BNK-PRE`, `LAB-CM-USE`, `LAB-BNK-LOAD`, `LAB-TUN-LOAD`.
**`LAB-MOIST-DEC` is a DECISION, not a gate** — the 67–68 % band is `UNRESOLVED` and no gate may be
built on it.

---

## 6 · States and enums

```
activity_state   LOCKED · READY · IN_PROGRESS · SUBMITTED · AWAITING_LAB · WAITING_TIME ·
                 WAITING_CONDITION · AWAITING_SUPERVISOR · BLOCKED · DEVIATION · RETURNED ·
                 COMPLETED · SKIPPED · CANCELLED
batch_status     draft · active · closed · cancelled
process_status   draft · published · archived
app_role         gm · manager · admin · supervisor · operator · lab_tech
extension_status REQUESTED · MANAGER_APPROVED · MANAGER_REJECTED · GM_APPROVED · GM_REJECTED ·
                 EXPIRED · CANCELLED
extension_decision   approved · rejected
checkpoint_state     open · decided
checkpoint_verdict   approved · approved_with_conditions · returned
deviation_kind   VALUE_OUT_OF_SOP · VALUE_OFF_DAY0_TARGET · GATE_WAIVED · MANUAL
deviation_state  open · accepted · escalated · resolved
lab_test_state   requested · in_progress · reported · superseded · cancelled
activity_scope   MASTER · LOAD · BUNKER_LINE · PILE · STRAW_PILE · TUNNEL · INDIVIDUAL_BATCH
stream_code      PRIMARY_FIBRE · SECONDARY_FIBRE · STRUCTURAL_STRAW · NITROGEN_MINERAL · YARD ·
                 BUNKER · TUNNEL
process_confidence   FACTORY_CONFIRMED · FACTORY_RANGE · SIMULATION · PARALLEL_NO_WALLCLOCK ·
                     CONFIGURABLE · ADVISORY · UNRESOLVED
```

---

## 7 · Role permission matrix

Enforced by `assert_role` inside the function body — **server-side, over any client**.
`v_unguarded_writer` lists writers with no guard and should be empty.

| | operator | lab_tech | supervisor | manager | gm | admin |
|---|---|---|---|---|---|---|
| create · activate · cancel batch | | | | | yes | yes |
| generate plan · set batch start | | | | | yes | yes |
| edit draft plan | | | yes | | yes | yes |
| publish · point process version | | | | | yes | yes |
| start · complete assigned work | yes | yes | yes | | | |
| capture evidence | yes (assigned) | yes (assigned) | yes (any) | | | |
| correct an actual | **no** | **no** | yes | yes | yes | yes |
| hold · release · return | | | yes | | | |
| release elapsed rests | | | yes | | yes | yes |
| record lab result | | yes | | | | |
| accept lab result | | yes | yes | | | |
| **decide lab submission** | **no** | **no** | yes ¹ | | yes ¹ | |
| management checkpoint decision | | | | | yes | |
| request extension | yes | yes | yes | | | |
| manager extension decision | | | | yes | | |
| GM extension decision | | | | | yes | |
| deviation override | | | | | yes | |

¹ While C-32 is open. A lab technician can never decide a lab submission, including their own.

---

## 8 · Integration examples

**Admin — create and activate**

```ts
const { data: versions } = await supabase
  .from('v_process_catalogue').select('*').eq('is_selectable', true);
// show PROCESS / STANDARD / H0 / BASELINE from the SELECTED row, never a constant

const { data: batch } = await supabase.rpc('create_master_batch', {
  p_code: 'MB-2026-401', p_label: 'Batch 401', p_start_date: '2026-09-15',
  p_start_at: '2026-09-15T06:00:00+05:30',
  p_process_definition_id: selected.process_definition_id,
});

const { data: issues } = await supabase.rpc('validate_batch', { p_batch: batchId });
if (!issues.some(i => i.severity === 'error')) {
  await supabase.rpc('generate_activity_plan', { p_batch_id: batchId });
  await supabase.rpc('activate_batch',        { p_batch_id: batchId });  // plan freezes here
}
```

**Operator — do the work**

```ts
const { data: work } = await supabase.from('v_my_work')
  .select('*').eq('master_batch_id', batchId).order('planned_start_at');
// render state / blocked_reason / outstanding_labels AS GIVEN

await supabase.rpc('start_activity', { p_activity: id });          // no timestamp

const path = `${batchId}/${id}/before-${Date.now()}.jpg`;
await supabase.storage.from('evidence').upload(path, file);
await supabase.rpc('bind_evidence', {
  p_activity: id, p_requirement_key: 'BEFORE_PHOTO',
  p_storage_path: path, p_media_kind: 'image/jpeg',
});

const { data } = await supabase.rpc('complete_activity', {         // no timestamp
  p_activity: id, p_values: { temperature_c: 62.5 }, p_remarks: null,
});
// data[0].outstanding_evidence is non-null ⇒ the finish was refused. Show it.
```

**Lab, then the gate**

```ts
const sample = await supabase.rpc('open_lab_sample',  { p_activity, p_checkpoint, p_label: 'S1' });
const test   = await supabase.rpc('request_lab_test', { p_sample: sample, p_parameter: 'moisture' });
await supabase.rpc('record_lab_result', { p_test: test, p_numeric: 67.4 });
await supabase.rpc('complete_activity', { p_activity, p_values: {}, p_remarks: null });

// the gate is STILL SHUT — submission is not approval
await supabase.rpc('decide_lab_submission', {                       // gm or supervisor
  p_activity, p_verdict: 'approved', p_reason: 'Within the SOP band.',
});
```

**Extension — asked while still running**

```ts
const req = await supabase.rpc('request_extension', {
  p_activity, p_hours: 6, p_reason: 'Turner breakdown, engineering attending.', p_evidence: null,
});
await supabase.rpc('manager_decide_extension',
  { p_request: req, p_approve: true, p_reason: '…', p_granted_hr: 6 });
await supabase.rpc('gm_decide_extension',
  { p_request: req, p_approve: true, p_reason: '…', p_granted_hr: 6 });
// v_activity_expectation.authorised_end_at now moves. planned_end_at does NOT.
```

---

## 9 · Error handling

Every refusal is a Postgres exception whose message names **what to do instead**. Surface it. Do not
map it to "Something went wrong". `src/lib/humanError.ts` already exists for this.

Typical shapes:

- `"Requesting an extension requires role manager, not operator"` — role guard
- `"Activity X cannot finish: BEFORE_PHOTO (0 of 1)"` — evidence gate
- `"PROCESS-2026C v1 is published — its activities are frozen…"` — definition freeze
- `"… is active — its plan is frozen"` — baseline freeze

Typed wrappers already live in `src/api/` (`process.ts`, `batch.ts`, `lab.ts`, `plant.ts`, …).
Extend those rather than calling `supabase.rpc` from a component.

---

## 9a · What the product cannot yet do

Measured against `src/` on 2026-09-08. These RPCs are proved by tests and **reachable from no
screen**, which means the capability exists in the database and not in the product:

| capability | RPC | wired? |
|---|---|---|
| approve a lab submission — the only thing that opens a `LAB_APPROVED` gate | `decide_lab_submission` | **yes** — `/lab/approvals` |
| what a checkpoint holds shut | `v_lab_gate` · `v_lab_approval_queue` | **yes** — Admin + `/lab/approvals` |
| accept a lab result as final | `accept_lab_result` | no |
| ask for more time | `request_extension` | no |
| decide an extension | `manager_decide_extension` · `gm_decide_extension` | no |
| management checkpoint decision | `record_checkpoint_decision` | no |

The extension chain (B6) is still reachable from no screen: a delay can be measured but never
authorised through the product.

---

## 10 · Two things that must not reach production

1. **`dev_environment_marker = 'development'`** on this database is the only reason the dev clock
   (`set_dev_clock_h`, `play_dev_clock`, `pause_dev_clock`, `reset_dev_clock_to_live`) is permitted
   to exist. A production database must not carry it. `get_effective_now()` returns
   `dev_available: false` there, and every screen must read the clock through it.
2. **The demo fixtures.** `MB-DEMO-EARLY/MID/LATE` were regenerated onto PROCESS-2026C and never
   re-staged, which is why 20 of the 21 remaining test failures are fixture state rather than product
   behaviour. They are demo data. **Do not delete active batches to make a counter go green.**

---

## 11 · Known-failing, and why

`561 passing · 21 failing · 585 total.` No product assertion fails.

| suite | n | cause |
|---|---|---|
| `demoBatches` | 7 | demo set on 2026C, no staged history |
| `hourlyPlan` | 6 | same — nothing at `rel_day 12` |
| `varianceAttribution` | 5 | same — no completed work to measure |
| `lab` | 1 | same |
| `evidence` | 1 | needs an `NMIX-ROTAVATE` with 3 outstanding requirements |
| `plant` | 1 | `ARCH-006` — occupancy rows for vessels nobody allocated. Pre-existing, diagnosed. |

---

## 12 · The habit that found every real defect

Every serious problem in this backend was **invisible to reading the code** and appeared within
minutes of actually calling the deployed system: 58 `SECURITY DEFINER` functions callable with no
token; an operator creating a master batch over HTTP; a T2 gate whose `min_rest_hr` sat in data that
nothing read; 150 evidence requirements gating nothing; and an `assert_role` exemption that used
`current_user` — which inside `SECURITY DEFINER` is the function *owner*, and so disabled every role
guard in the product for one apply.

That last one was caught only because the adversarial probe was re-run, not because the code was
re-read.

**Probe the deployed system by using it.** Carry that habit into the frontend.
