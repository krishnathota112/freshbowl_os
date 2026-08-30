# Write-path matrix

**Status: VERIFIED against the deployed database, 31 August 2026.** The eight pre-seeded rows were
probed live; the remaining facts were derived by query and by attempted forgery. Every attack in
this file was run inside a transaction that was rolled back — nothing was altered. The full attack
log is `SECURITY-ATTACK-MATRIX.md`; per-RPC replay behaviour is `IDEMPOTENCE.md`; the roll-up is
`FOUNDATION-STATUS.md`.

The last integrity pass moved three conclusions the moment the live database was actually queried:
`repoint_batch_activities` was granted to `anon` and `PUBLIC`, not just `authenticated`;
`batch_activity` grants no write at all to any client role; `profiles` had three policies and all
three were SELECT. Migration files describe intent. Only `pg_proc.proacl`, `pg_policies` and
`role_table_grants` describe the system.

---

## ⚠ THE FINDING THE PRE-SEEDED MATRIX MISSED — read before the rest

Every pre-seeded row reasoned about **base-table** grants and RLS, and every one of those claims held
up: `batch_activity` grants no client write; `master_batch`, `deviation`, `process_activity` are all
protected at the base table. **But three views are auto-updatable, owned by `postgres`, and carry no
`security_invoker`** — so a write through the view runs with the view owner's rights and bypasses
both the base-table grant and RLS entirely.

| View | Base table | Exposed to a writer |
|---|---|---|
| `v_live_batch` | `master_batch` | **every column** — `start_at` (H0), `status`, `config`, `process_definition_id`, `activated_by/at`, … |
| `v_deviation_open` | `deviation` | `state`, `decided_by`, `decided_by_role`, `decision_reason` — a manager decision |
| `v_lab_checkpoint_map` | `lab_checkpoint_conflict` | checkpoint mapping, spec code (parallel-team surface — reported, not touched) |

**Confirmed live, over HTTPS, with only the anon key that ships inside the web bundle and the APK:**

```
PATCH /rest/v1/master_batch  (base table)   → 401 permission denied for table master_batch
PATCH /rest/v1/v_live_batch  (same row)      → 200, row updated
```

As `anon`, through `v_live_batch`, the following **succeeded** (rolled back): rewrite `activated_by`
/ `activated_at`; rewrite Day-0 `config`; **delete the batch outright**; swap an active batch's
`process_definition_id` to another definition; insert a fabricated batch. The `0034` triggers still
held the two they cover — moving H0 and un-activating were both refused. See
`SECURITY-ATTACK-MATRIX.md` for the exact calls and results.

**This is the highest-severity finding in the audit** and it is not in any pre-seeded row because the
pre-seeded rows looked at tables, not at the views layered over them.

**Proposed fix (not applied):** set `security_invoker = true` on every view in `public` (or revoke
INSERT/UPDATE/DELETE on views from `anon`/`authenticated`), and add a test that fails if any
`public` view is auto-updatable and lacks `security_invoker`. Coordinate with the parallel team
before touching `v_lab_checkpoint_map`.

---

## VERIFICATION SUMMARY — 31 August 2026

| # | Fact | Verdict | Note |
|---|---|---|---|
| 1 | planned / baseline | **GREEN** | `0034` triggers hold; base-table writes refused. **But** `v_live_batch` exposes them via the view bypass above. |
| 2 | actual_start / actual_end | **RED** | Suspicion 1 **confirmed**: `actual_end = coalesce(p_actual_end, actual_end)` overwrites, no immutability guard, no protective trigger, no supersession. Reachable in IN_PROGRESS / RETURNED. |
| 3 | activity state | **AMBER** | State guard exists (`state not in (READY,IN_PROGRESS,RETURNED) → raise`). Full transition matrix not exhaustively forged — see gaps. |
| 4 | operator identity | **GREEN** | No write RPC takes a caller-supplied actor. All 28 write RPCs read `auth.uid()`. The H456 "no actor" is the staging script running as `postgres` (no JWT), not a write-path defect. |
| 5–7 | machine / pile / bunker | **AMBER** | `record_occupancy` reads `auth.uid()`; occupancy has **no unique key** (idempotence gap). 3 orphan rows are stale demo data — see #19. |
| 8 | evidence | **RED (unproven)** | `evidence_media` unique on `storage_path` (a natural dedup key). Supersession available. Still unproven end-to-end — storage-key tests skip. Direct storage-object delete not probed (no service key here). |
| 9 | extension | **GREEN** | `0036`, 21 tests. Not re-forged this pass. |
| 10 | manager / GM decision | **RED** | `v_deviation_open` exposes `state` / `decided_by_role` / `decision_reason` to the anon view bypass. |
| 11 | process definition/version | **RED** | No publish step. `process_activity` / `process_definition` writable by any `authenticated` admin under `ref_write`, including a definition active batches were generated from — **and** swappable via `v_live_batch` as anon. |
| 12 | audit event | **AMBER** | `actor_id` / `actor_role` are **nullable, no default** — the "no actor recorded" symptom is structural. Append-only triggers not re-verified for DELETE this pass. TRUNCATE is open — see below. |
| — | **TRUNCATE** (new) | **RED** | `anon` and `authenticated` can `TRUNCATE audit_event`, `batch_activity`, `evidence_media` — RLS does not apply to TRUNCATE. Confirmed. |
| — | **dev clock** (susp. 4) | **GREEN** | `get_effective_now` is **not** called by any function that writes ACTUAL or AUDIT. `set_dev_clock_h` is granted to `anon` but guarded by `assert_dev_clock_writer` (dev-mode + admin/gm). |
| — | **send_alert** (susp. 3) | **AMBER** | `SECURITY DEFINER`, granted `anon`, **no role guard in body** — confirmed. |

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
| **Replay safe?** | A re-submit is refused once state leaves READY/IN_PROGRESS/RETURNED (line 29 guard). While IN_PROGRESS, each submit overwrites `actual_end` via `coalesce`. |
| **Supersession?** | **NO.** No superseding-record path exists for actuals. The old value is gone, not versioned. `evidence_media.superseded_by_id` shows the correct shape. |
| **Severity** | **RED — confirmed 31 Aug** |
| **Proof** | NONE (the defect is confirmed present; no test asserts immutability because there is none) |

**VERIFIED 31 Aug.** Deployed `submit_activity` body: line 180/201 `actual_end = coalesce(p_actual_end, actual_end, ...)`. Top-of-function guard (line 29) blocks re-submit of a COMPLETED/DEVIATION activity, so the overwrite is reachable two ways: (a) repeated submits while IN_PROGRESS (evidence outstanding); (b) `return_activity` → RETURNED → submit again with a new time. No `BEFORE UPDATE` trigger protects `actual_start`/`actual_end` — `trg_plan_is_frozen` covers plan columns only. This is MISSION §4.1, confirmed.

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
| **Caller-supplied actor?** | **NO — verified.** Every one of the 28 write RPCs reads `auth.uid()`. The uuid parameters they accept are target entities (`p_activity`, `p_batch`, `p_deviation`) or an assignee (`assign_activity.p_person`) / instrument — never the acting actor. Identity is not deniable through the RPCs. |
| **Known symptom — diagnosed** | The H456 "no actor recorded" is the **staging script** (`scripts/stage-history.mjs`) writing as `postgres` over `pg`, where `auth.uid()` is null — not a defect in the write path. A capture made by a real signed-in user carries the JWT actor. |
| **Severity** | **GREEN** (write path) · the staging artifact is cosmetic demo data |

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

**VERIFIED 31 Aug: confirmed.** Deployed `send_alert` is `prosecdef = true`, `acl` includes `anon`
and `authenticated`, and its body contains no `assert_role`/`has_role`. Signature
`send_alert(p_activity uuid, p_role app_role, p_message text, p_reason text)`. **Severity: AMBER.
Proof: NONE.** Proposed fix (not applied): add `assert_role` for the caller, matching what
`src/api/schedule.ts` legitimately does.

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

**VERIFIED 31 Aug: GREEN.** No function that writes `actual_start`/`actual_end` or `audit_event`
references `get_effective_now` or any dev-clock reader. The only functions that reference the clock
are `pause_dev_clock` / `play_dev_clock` (themselves). `set_dev_clock_h(p_batch uuid, p_h integer)`
is `SECURITY DEFINER` and granted to `anon`, **but** `assert_dev_clock_writer` gates it on
`dev_environment_enabled()` **and** (`has_role('admin')` or `has_role('gm')`), so an anon caller
cannot move the clock. **The grep test the mission asks for is NOT written yet** — a new test file
under `mushroomos/tests/` is code, and Phase 1's rule is that `git diff` touches `docs/` only (see the
contradiction note in the session report). It is specified for Phase 2 as
`mushroomos/tests/devClockIsolation.test.ts`. **Severity: GREEN. Proof: pending that test.**

---

## 12 · TRUNCATE — a write path RLS does not cover (new, RED)

`TRUNCATE` is a table-level privilege and is **not subject to row-level security**. Verified live,
rolled back: as `anon` and as `authenticated`, `TRUNCATE public.audit_event`,
`TRUNCATE public.batch_activity CASCADE` and `TRUNCATE public.evidence_media CASCADE` all
**succeeded**. The append-only triggers on `audit_event` are `BEFORE UPDATE/DELETE` and do not fire on
TRUNCATE. A single call empties the entire audit trail.

**Proposed fix (not applied):** `REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon,
authenticated`, and a test asserting no client role holds TRUNCATE.

---

## 13 · lab result · lab approval

| | |
|---|---|
| **Tables** | `lab_result` (unique on `test_id, version`), `lab_decision` |
| **Writers** | `record_lab_result`, `decide_lab_submission`, `order_retest` — all `SECURITY DEFINER`, all read `auth.uid()`, none takes a caller-supplied actor |
| **Note** | `lab_result` is the EXISTING lab table (`0022`), inside this boundary — distinct from the parallel team's new `lab_*` tables, which were **not** touched or probed. |
| **Idempotence** | `record_lab_result` INSERTs a new `lab_result`; version is server-assigned. A replay creates a **new version** (a phantom retest), not a duplicate of the same row. See `IDEMPOTENCE.md`. |
| **Severity** | AMBER — writer identity sound; replay creates spurious versions |

---

## 14 · deviation

| | |
|---|---|
| **Table** | `deviation` — **no unique constraint** |
| **Writers** | `raise_deviation`, `submit_activity` (auto-raises on out-of-band values), `accept_with_deviation`, `escalate_deviation`, `gm_decide_override` |
| **Idempotence** | **None.** `raise_deviation` INSERTs unconditionally; a double-tap or replay creates **two deviation rows**. `submit_activity` likewise inserts a deviation per failing field per call. |
| **View bypass** | `v_deviation_open` (§ top) lets `anon` write `state` / `decided_by_role` / `decision_reason` directly, forging a manager decision. |
| **Severity** | **RED** (view bypass) · AMBER (duplicate-on-replay) |

---

## 15 · process definition / version — no publish step (RED)

Confirmed. `process_activity` and `process_definition` carry `ref_write` = `ALL` to `authenticated`
with `WITH CHECK has_role('admin')`. An admin can edit a definition **that active batches were
generated from**, silently changing what "the standard" means for a batch that already ran. There is
no `published`/frozen flag and no copy-on-activate of the definition. **And** via `v_live_batch` an
`anon` caller can swap a live batch's `process_definition_id` outright (§ top).

**Proposed fix (not applied):** a publish/freeze flag on `process_definition`, an activation-time
snapshot or an FK lock, and `ref_write` narrowed to unpublished definitions. This is MISSION §4.4
(`ARCH-003`).

---

## 16 · resource occupancy

| | |
|---|---|
| **Table** | `location_occupancy` — **no unique key on (location, batch_activity)** |
| **Writer** | `record_occupancy` (`auth.uid()`), trigger `fn_track_occupancy` on `batch_activity` actual writes |
| **Orphans** | 3 rows for vessels with no matching `batch_vessel_allocation`. **Diagnosis:** stale demo data — the database was re-seeded and `allocate-vessels.mjs` had not re-run against the current batches; the same 3 reappear after any occupancy backfill that outpaces allocation. Not a live write-path defect. **Not fixed.** |
| **Idempotence** | None — a replay of `record_occupancy` inserts a second overlapping row. |
| **Severity** | AMBER |

---

## 17 · audit event

| | |
|---|---|
| **Table** | `audit_event` |
| **Actor columns** | `actor_id`, `actor_role` are **nullable with no default** — an event written without a JWT (the staging script) records no actor, structurally. |
| **Append-only** | `BEFORE UPDATE/DELETE` triggers present (not re-forged this pass). **They do not cover TRUNCATE** — see §12, which is the live hole. |
| **Severity** | AMBER (nullable actor) · the TRUNCATE exposure is RED and tracked in §12 |
