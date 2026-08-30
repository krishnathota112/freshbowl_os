> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# 07 · Write-path matrix

**Status: PRE-SEEDED, UNVERIFIED.** Eight of twenty facts are filled in from a read of the migration
files. **Every row below must be re-derived against the deployed database before it is trusted.**

The last integrity pass moved three conclusions the moment the live database was actually queried:
`repoint_batch_activities` was granted to `anon` and `PUBLIC`, not just `authenticated`;
`batch_activity` grants no write at all to any client role; `profiles` had three policies and all
three were SELECT. Migration files describe intent. Only `pg_proc.proacl`, `pg_policies` and
`role_table_grants` describe the system.

---

## How to fill a row

```
FACT
AUTHORITATIVE TABLE          where the truth lives
AUTHORITATIVE VIEW           what a screen is allowed to read it from
LEGITIMATE WRITE PATH        the one RPC that is supposed to write it
EVERY OTHER WRITE PATH       every function, trigger, script or grant that CAN
RPCS / FUNCTIONS             names, with prosecdef
GRANTS / ACLS                pg_proc.proacl, verbatim
RLS                          policies, cmd, qual, with_check
SECURITY DEFINER             yes/no, and whether search_path is pinned
TRIGGERS / CONSTRAINTS       what the table itself refuses
SERVER TIMESTAMP?            does the server generate the authoritative time
CALLER-SUPPLIED TIMESTAMP?   can the caller state it
CALLER-SUPPLIED ACTOR?       can the caller state who
ROLE CHECK?                  assert_role, and whether it fails closed
STATE CHECK?                 does it verify the record's current state
IDEMPOTENCY?                 same request twice
REPLAY SAFE?                 captured request replayed later
DELETE POSSIBLE?             by any client role, by any path
SUPERSESSION SUPPORTED?      correction as a new record
DIRECT SQL BYPASS?           as anon / authenticated / service_role
ALTERNATE PATH?              import, maintenance, seed, demo scripts
SEVERITY                     RED / AMBER / GREEN
PROOF STATUS                 the test that proves it, or NONE
```

**A row is not done until a forgery was attempted and the result recorded.**

---

## 1 · `planned_start_at` / `planned_end_at` / `baseline_start_hour` / `baseline_end_hour`

| | |
|---|---|
| **Authoritative table** | `batch_activity` |
| **Authoritative view** | `v_activity_timing` |
| **Legitimate write path** | `generate_activity_plan` (draft only), `activate_batch` (freeze) |
| **Every other write path** | `set_activity_plan`, `set_batch_start_at`, `clear_planned_time`, `repoint_batch_activities`, `repoint_one_activity`, trigger `trg_replan_hours` |
| **Grants** | All five revoked from `public`, `anon`, `authenticated` in `0034`. **Verify with `proacl`.** |
| **Triggers** | `trg_plan_is_frozen` on `batch_activity` refuses any change to the six baseline columns when the parent batch is not `draft`. `trg_activation_is_one_way` on `master_batch` refuses `→ draft` and refuses moving `start_at`. |
| **Direct SQL bypass** | `batch_activity` reportedly grants **no write to any client role**. Re-verify. |
| **Severity** | GREEN |
| **Proof** | `tests/baselineImmutability.test.ts`, 14 tests |

**Re-verify anyway:** migrations 0035 and 0036 landed after 0034. Confirm neither introduced a
function that writes these columns.

---

## 2 · `actual_start` / `actual_end` — **the priority**

| | |
|---|---|
| **Authoritative table** | `batch_activity.actual_start`, `.actual_end`, `.actual_recorded_at` |
| **Legitimate write path** | `start_activity`, `submit_activity` |
| **Server timestamp?** | **Partly.** `actual_recorded_at` is the server clock and correct. `actual_start` / `actual_end` are **caller-supplied**, checked only against "not in the future". |
| **Caller-supplied timestamp?** | **YES.** `submit_activity(p_actual_start timestamptz, p_actual_end timestamptz)` |
| **First write wins?** | **NO.** `0016` ~line 270: `actual_end = coalesce(p_actual_end, actual_end)` — the parameter takes precedence over the stored value. A second submit with a different time overwrites the first. |
| **Triggers** | Only `batch_activity_actual_end_after_start` (a CHECK). Nothing enforces write-once. |
| **Replay safe?** | Unknown. Probe. |
| **Supersession?** | **NO.** No superseding-record path exists for actuals. `evidence_media.superseded_by_id` shows the correct shape. |
| **Severity** | **RED** |
| **Proof** | NONE |

**This is the last hole in the product's central claim.** The plan is frozen and the actuals are
not — so instead of dragging the plan onto the actual, you drag the actual onto the plan.

**Two questions the audit must answer before the fix:**

1. Is a caller-supplied `actual_start` a deliberate factory requirement — an operator recording work
   done an hour ago on paper — or an accident? The answer decides whether the fix is *server
   generates it* or *the operator may state it once and never again*. **Do not decide this alone.**
2. Do `return_activity`, `hold_activity` or `release_activity` re-submit an activity that already
   carries actuals? A write-once trigger that breaks the return flow would be discovered in
   production.

---

## 3 · Activity state

| | |
|---|---|
| **Authoritative table** | `batch_activity.state` |
| **Legitimate write path** | `start_activity`, `submit_activity`, `hold_activity`, `release_activity`, `return_activity`, `accept_with_deviation` |
| **Role check?** | `assert_role` present on several. **Fails closed since `0035` §3** — before that, `NULL = any(...)` returned NULL, `not NULL` is NULL, and the guard returned normally for any caller with no role claim. Nine functions were open. |
| **State check?** | **UNVERIFIED.** Does each transition verify the current state, or only the role? |
| **Idempotency / replay** | **UNVERIFIED.** Can an activity complete twice? Restart after completion? Move backward? |
| **Severity** | AMBER |
| **Proof** | Partial — `tests/roleResolution.test.ts` proves the guard, not the transitions |

Freeze §8 lists ten forbidden transitions. **Attempt every one of them.**

---

## 4 · Operator identity

| | |
|---|---|
| **Caller-supplied actor?** | **UNVERIFIED — probe first.** If any RPC accepts an actor parameter rather than reading `auth.uid()`, every "who did it" in the product is deniable. |
| **Known symptom** | The demo batch's event log is stamped H456 with **"no actor recorded"** — every event, no actor. Diagnose whether that is the staging script running as `postgres` with no JWT claim, or a real defect in the write path. |
| **Severity** | AMBER pending probe |

---

## 5 · Machine identity · 6 · Pile identity · 7 · Bunker movement

| | |
|---|---|
| **Tables** | `machine_usage`, `batch_movement`, `location_occupancy` |
| **Known symptom** | Three `location_occupancy` rows exist for vessels **nobody allocated** — `batch_vessel_allocation` was empty while occupancy still claimed three tunnels. Occupancy must derive from recorded movement and invent nothing. Find the writer (`fn_track_occupancy` / `record_occupancy`) and determine whether this is stale demo data or a live defect. **Diagnose before fixing.** |
| **Overlap** | No impossible resource overlap. One machine cannot flip two piles at once, whether or not they belong to the same batch. **Is that enforced, or merely displayed?** |
| **Severity** | RED — the domain is entirely unaudited |
| **Proof** | NONE |

Per the confirmed model: machine assignment is **actual execution data**, never planned. Pile
identity is stable. A pile may change machine mid-process — four of six do.

---

## 8 · Evidence

| | |
|---|---|
| **Authoritative table** | `evidence_media`, with `superseded_by_id` |
| **Supersession** | **Correct by design.** This table is the model the actuals should copy. |
| **Severity** | **RED — unproven** |
| **Proof** | NONE. All 20 evidence tests **skip** on `403 AccessDenied` for want of a storage service key. |

"Evidence is real" is currently an assertion, and it is the claim the entire traceability story
rests on. The chain to prove, with a real object: capture → upload → storage object →
`evidence_media` row → server timestamp → uploader from JWT → requirement recount → gate →
retrieval → **the actual image displayed**.

Also probe: can a client delete a storage object directly? Can it delete or update an
`evidence_media` row? Freeze §10 — proof is never silently deleted or replaced.

---

## 9 · Extension · manager decision · GM decision

| | |
|---|---|
| **Authoritative table** | `extension_request`, `extension_policy` |
| **Legitimate write path** | `request_extension`, `manager_decide_extension`, `gm_decide_extension`, `cancel_extension` |
| **Client may write?** | Never `status`, never any `*_decided_at`, never `approved_extension_hr` |
| **Invariant** | `approved_extension_hr` is a **third number**. It is never added into `planned_end_at`. Compliance is computed at read time as `actual_end <= planned_end_at + approved_extension`. |
| **Sub-rules** | Approval only narrows — a manager may grant less than asked, never more; the GM may not exceed the manager. The window runs from the **planned** end, not from the approval. A request after completion is refused. |
| **Severity** | GREEN |
| **Proof** | `tests/extensionRegister.test.ts`, 21 tests |

**Still probe:** duplicate request, replayed request, unauthorised approver, approval after
completion. Freeze §11 lists ten cases; confirm all ten are covered.

---

## 10 · `send_alert` — an open hole found in passing

`SECURITY DEFINER`, granted to `authenticated`, and it calls **no `assert_role` at all**. Any
signed-in user can send an alert to any role.

Small, five lines, and it is an authorisation gap. Confirm the role list against
`ROLE_AND_APPROVAL_MODEL.md` first, and check nothing legitimate calls it as another role —
`src/api/schedule.ts` does.

**Severity: AMBER. Proof: NONE.**

---

## 11 · The dev clock — the one that would make everything else pointless

Two tables and eleven functions exist in the deployed database that **no migration creates**:

```
dev_effective_clock · dev_environment_marker
get_effective_now · set_dev_clock_h · pause_dev_clock · play_dev_clock
reset_dev_clock_to_live · assert_dev_clock_writer · dev_environment_enabled
cancel_monthly_schedule_group · demo_day0_config · fn_audit_plan_generated · rls_auto_enable
```

**If `get_effective_now()` is reachable from any function that writes ACTUAL, AUTHORIZATION or
AUDIT, then every timestamp in the product is deniable** — someone can set the clock and record the
past as the present.

Prove it is not, and prove it as a **test that greps function bodies**, so it fails the day someone
wires it in.

**Severity: RED until proven. Proof: NONE.**

---

## Still to fill

`lab result` · `lab approval` · `deviation` · `process definition/version` · `resource occupancy` ·
`audit event`.

For `process definition/version`, the known gap: there is **no publish step**.
`process_definition` and `process_activity` are writable by an admin at any time under `ref_write`,
including a definition that activated batches were generated from. Editing one silently changes what
"the standard" means for a batch that already ran.

For `audit event`: `audit_event` and `checkpoint_decision` have append-only triggers. Verify they
cover UPDATE **and** DELETE, and that no `SECURITY DEFINER` function can bypass them.
