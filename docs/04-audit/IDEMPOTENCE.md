# Idempotence of the write RPCs

**31 August 2026.** Tomorrow two APKs go into the factory and real people capture against a real
batch, some offline. **A capture arriving twice — a retry, a double tap, a replayed offline queue —
must create one row, not two.** This file answers, per existing write RPC: is there a natural key, a
unique constraint, a client-supplied idempotency key, or nothing?

**Report only. No constraint was added.** Adding an idempotency key to a foundational table under
time pressure, while a parallel team builds against it, is the casual fix the mission forbids.

Derived from `pg_proc.prosrc` (which tables each RPC INSERTs into) cross-referenced with the live
`pg_constraint` catalogue. **No RPC accepts a client-supplied idempotency key** — that column does
not exist anywhere. So idempotence rests entirely on natural unique keys.

---

## 11 September — measured, not inferred

The table further down is the 31 August verdict, derived from function bodies. These are the same
questions **answered by doing it**: duplicate taps fired concurrently, and retries sent after a delay,
over HTTP as a real person (`mushroomos/scripts/break/`).

| RPC | What was done | What happened | Verdict now |
|---|---|---|---|
| `start_activity` | 5 simultaneous taps; a retry after 2.5 s | one `actual_start`, unchanged by the retry; **one** audit row | **SAFE** (`0071` — the audit follows the change, not the call) |
| `complete_activity` · `submit_activity` | 5 simultaneous finishes; a retry after a lost response | one completion, one `actual_end`, one audit row; the retry refused *"… is COMPLETED, so it cannot be submitted"* | **SAFE** (`0071` row lock) |
| `bind_evidence` | the same file bound 5 times | one row | **SAFE** (unique `storage_path`) |
| `accept_lab_result` | 3 people accept one result at once | accepted once | **SAFE** |
| `gm_decide_extension` | 3 further identical GM approvals | the approved figure did not accumulate | **SAFE** |
| `activate_batch` | two admin sessions at once; again on an active batch | one activation instant; a repeat changes nothing | **SAFE**; on a **cancelled** batch it now refuses (`0073`) |
| `generate_activity_plan` | two concurrent regenerations on an active batch | both refused; activity count unchanged | **SAFE** |
| `open_machine_stint` | a second open stint for the same machine | refused by `EXCLUDE USING gist (machine_id WITH =, during WITH &&)`, with a sentence naming the other commitment | **SAFE for overlap** — was DUPLICATES |
| `record_occupancy` | a second batch in the same vessel, same window | refused by the `is_exclusive` exclusion constraint | **SAFE for exclusive occupancy** — was DUPLICATES |
| `decide_lab_submission` | concurrent approvals; approve → reject; reject → approve | each accepted call **appends** a decision; the latest governs and the gate follows it (`0072`) | **A sequence by design**, not idempotent — duplicates are recorded, not merged |
| `open_lab_sample` · `request_lab_test` · `record_lab_result` · `order_retest` · `raise_deviation` · `add_corrective_action` | not re-measured | no unique key; **no RPC accepts an idempotency key** (probed 11 Sep) | **DUPLICATES — still open** |

**What remains.** The captures a tired person double-taps — start, finish, a photo, an approval —
are safe. What is not is a **replayed offline queue** for the lab chain and for deviations: a replay
of `open_lab_sample` fabricates a sample, and of `record_lab_result` a phantom retest. Nothing is
replayed today, because there is no offline queue. **Design the idempotency key with the offline
queue, as one shape on every field RPC**, per the proposal at the end of this file — not before it,
and not as scattered constraints.

---

## The unique keys that exist

| Table | Unique constraint |
|---|---|
| `batch_activity` | `(master_batch_id, process_activity_id, instance_no)` |
| `batch_activity_value` | `(batch_activity_id, field_key)` |
| `batch_vessel_allocation` | `(master_batch_id, scope, instance_no)` |
| `evidence_media` | `(storage_path)` |
| `lab_result` | `(test_id, version)` |
| `management_checkpoint` | `(master_batch_id, checkpoint_no)` |

Every other write-target table — `deviation`, `location_occupancy`, `audit_event`, `lab_sample`,
`lab_test`, `lab_decision`, `notification`, `corrective_action`, `individual_batch`,
`checkpoint_decision`, `machine_usage` — has **no natural unique key relevant to replay.**

---

## Per-RPC verdict

Legend: **SAFE** = a replay hits a unique key or updates one row; **DUPLICATES** = a replay creates a
second row; **CONDITIONAL** = safe for the row it targets, but a side-effect INSERT can duplicate.

| RPC | Writes | Replay behaviour | Verdict |
|---|---|---|---|
| `start_activity` | updates `batch_activity`, `audit_event` | same activity row; sets state | **SAFE** (audit gains a line, expected) |
| `submit_activity` | updates `batch_activity`; INSERTs `deviation`, `audit_event` | activity row is unique-keyed and updated in place — **but** each call INSERTs a fresh `deviation` per failing field, and (suspicion 1) can overwrite `actual_end` | **CONDITIONAL** — no duplicate activity, but duplicate deviations and a mutable actual |
| `assign_activity` | updates `batch_activity`; INSERTs `notification`, `audit_event` | one activity row | **SAFE** (duplicate notification only) |
| `raise_deviation` | INSERTs `deviation` | **no unique key → two rows on double-tap/replay** | **DUPLICATES** |
| `accept_with_deviation` | updates `deviation`; INSERTs `audit_event` | targets one deviation | **SAFE** |
| `escalate_deviation` | updates `deviation` | one row | **SAFE** |
| `gm_decide_override` | updates `deviation` | one row | **SAFE** |
| `record_lab_result` | INSERTs `lab_result` (unique `test_id,version`) | version is server-assigned per call → a replay writes a **new version = a phantom retest** | **DUPLICATES** (as a spurious version) |
| `decide_lab_submission` | INSERTs `lab_decision` | no replay key | **DUPLICATES** |
| `order_retest` | INSERTs `lab_result` | new version | **DUPLICATES** (spurious retest) |
| `request_lab_test` | INSERTs `lab_test` | no replay key | **DUPLICATES** |
| `open_lab_sample` | INSERTs `lab_sample`, `audit_event` | no replay key | **DUPLICATES** |
| `bind_evidence` | INSERTs `evidence_media` (unique `storage_path`) | same object path → **unique violation, second refused** | **SAFE** (natural key = storage_path) |
| `record_occupancy` | INSERTs `location_occupancy` | **no unique key → second overlapping row** (this is the mechanism behind the 3 orphan rows) | **DUPLICATES** |
| `allocate_vessel` | INSERTs `batch_vessel_allocation` (unique `master,scope,instance`) | second identical allocation → **unique violation, refused** | **SAFE** |
| `release_vessel` | updates state; `audit_event` | idempotent update | **SAFE** |
| `record_checkpoint_decision` | INSERTs `management_checkpoint` (unique `master,checkpoint_no`) + `checkpoint_decision` | checkpoint row protected; the decision row is not | **CONDITIONAL** |
| `add_corrective_action` | INSERTs `corrective_action` | no replay key | **DUPLICATES** |
| `hold_activity` / `return_activity` / `release_activity` | update `batch_activity` | one row | **SAFE** |
| `set_individual_batches` | INSERTs `individual_batch` | keyed by batch+number; a replay of the same numbers — **verify the key covers it** | **CONDITIONAL — verify** |
| `create_master_batch` | INSERTs `master_batch` | `code` uniqueness — verify | **CONDITIONAL — verify** |
| `activate_batch` / `cancel_batch` | update `master_batch`; `audit_event` | one-way state guard (`0034`) makes a replay a no-op refusal | **SAFE** |
| `open_machine_stint` | INSERTs `machine_usage` | no replay key → duplicate open stint | **DUPLICATES** |
| `close_machine_stint` | updates `machine_usage` | one row | **SAFE** |

---

## The ones that matter for tomorrow

The captures a field user actually makes, ranked by exposure to a double-tap or a replayed offline
queue:

1. **`raise_deviation`** — the most likely to be hit twice (a supervisor re-taps when the screen
   lags) and the most visible when duplicated. **DUPLICATES.**
2. **`record_occupancy`** — already demonstrably producing orphan/duplicate rows.
3. **`open_lab_sample` / `request_lab_test` / `record_lab_result`** — the lab capture chain; a replay
   fabricates a sample or a retest version. (`lab_result` here is the existing `0022` table, in
   boundary; the parallel team's new `lab_*` tables are theirs.)
4. **`open_machine_stint`** — a duplicate open stint corrupts machine-hour derivation.

**SAFE by natural key, no action needed:** `bind_evidence` (storage_path), `allocate_vessel`
(master/scope/instance), everything that updates a unique-keyed row in place.

---

## Proposed direction (NOT applied, for the process owner and the parallel team to weigh)

The clean fix is **not** a scattered set of ad-hoc constraints. Two coherent options:

- **A per-capture idempotency key** accepted by the field-facing RPCs (`raise_deviation`,
  `record_occupancy`, `open_lab_sample`, `open_machine_stint`), stored and unique — the APK generates
  it once per user action and resends it on retry. This is the honest fix for offline replay and it
  is one shape applied uniformly.
- **Natural unique keys** where a real one exists (e.g. one open `location_occupancy` per
  location+activity; one open `machine_usage` per machine+activity). Cheaper, but does not cover a
  genuine offline replay of a legitimately repeatable action.

Both are foundational-table changes and must be designed **with** the parallel lab team, since their
new `lab_*` tables will want the same idempotency contract. This is a decision, not a patch.