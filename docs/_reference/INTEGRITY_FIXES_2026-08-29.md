# Integrity fixes — 2026-08-29

Three findings closed and one register built, ahead of finishing the architecture audit.
Everything here is applied to the deployed database and covered by tests that run against it.

| # | Finding | Severity | State |
|---|---|---|---|
| F1 | The batch baseline could be rewritten after activation | Critical | **Closed** |
| F3 | Role resolution depended on a dashboard setting | Demo blocker | **Closed** |
| F6 | `assert_role` was a no-op for a caller with no role | **Critical**, found while proving F3 | **Closed** |
| F2 | No extension workflow existed | Missing | **Built** |

---

## 1 · What changed

### Migrations added

| File | Contains |
|---|---|
| `supabase/migrations/0034_baseline_immutability.sql` | F1 — grants, writer guards, two triggers |
| `supabase/migrations/0035_role_resolution.sql` | F3 + F6 — role fallback, roster policies, fail-closed `has_role` |
| `supabase/migrations/0036_extension_register.sql` | F2 — policy table, register, four RPCs, two views |

### Tests added

| File | Proves |
|---|---|
| `tests/baselineImmutability.test.ts` | 14 tests — F1 |
| `tests/roleResolution.test.ts` | 9 tests — F3 and F6 |
| `tests/extensionRegister.test.ts` | 21 tests — F2 |

### Existing files touched

| File | Change | Why |
|---|---|---|
| `tests/resources.test.ts` | Added an `AUTHORISATION` class to the criterion-20 allow-list | The new `_hr` columns tripped a deliberate tripwire. It was extended by classifying them, never by loosening its pattern. |
| `supabase/seed/s11_demo_batches.sql` | Sets a `lab_tech` claim around its `accept_lab_result` calls | It passed only because F6 made `assert_role` a no-op. It now has to say who it is. |
| `scripts/setup-demo-showcase.mjs` | Same | Same |
| `scripts/apply.mjs` | **New.** Applies named migrations in one transaction | A half-applied security fix is worse than none. |
| `scripts/probe-f1.mjs`, `probe-f3.mjs`, `probe-rls.mjs`, `probe-users.mjs`, `probe-esc.mjs` | **New.** Read-only audit probes | Every claim below was probed against the deployed database, not inferred from the migration files. |

**Nothing else was refactored.** No RPC was rewritten to a new shape, no RLS policy was weakened, no
screen was touched. The bodies of `repoint_batch_activities` and `repoint_one_activity` are 0027's
verbatim; the only edit is the refusal placed in front of each.

---

## 2 · F1 — the baseline is immutable after activation

### The invariant

> Once `master_batch.status` leaves `'draft'`, these columns of `batch_activity` never change again,
> for anyone, by any path:
> `planned_start_at`, `planned_end_at`, `baseline_start_hour`, `baseline_end_hour`,
> and the two inputs that derive them, `planned_time` and `day0_duration_hr`.
>
> And `master_batch.start_at` — H0 — never moves, because every planned instant in the batch hangs
> off it.

### Why it was broken

The refusal existed but lived in the **callers**. `set_activity_plan`, `set_batch_start_at` and
`clear_planned_time` each check `status = 'draft'`. The function that actually writes the columns —
`repoint_batch_activities` — checked nothing. A probe of the deployed ACL returned:

```
repoint_batch_activities   =X/postgres | anon=X | authenticated=X | service_role=X
```

`PUBLIC` and `anon` included. Anyone holding the anon key could repoint an active batch's whole plan
onto its actuals, and every variance in the product would read zero.

`repoint_one_activity` had `PUBLIC` revoked in 0027 but kept its own `anon` grant from Supabase's
schema defaults — revoking `PUBLIC` alone was never enough.

### The fix — four layers, deliberately redundant

1. **Grants.** `repoint_batch_activities` and `repoint_one_activity` revoked from `public`, `anon`
   and `authenticated`. Every legitimate caller is a `SECURITY DEFINER` RPC, so nothing broke.
   `set_activity_plan`, `clear_planned_time`, `generate_activity_plan` and `set_batch_start_at`
   revoked from `anon` — each reaches the frozen columns through `trg_replan_hours`.
2. **The guard travels with the writer.** Both repoint functions now refuse a non-draft batch
   themselves, wording the refusal exactly as `set_activity_plan` words it.
3. **`trg_plan_is_frozen`** — `BEFORE UPDATE` on `batch_activity`. Refuses any change to the six
   columns when the parent batch has left draft, whatever RPC, role or direct statement asked for
   it. It names the columns that moved, because a refusal an engineer cannot act on is half a
   refusal. This is the layer that holds against an RPC nobody has written yet.
4. **`trg_activation_is_one_way`** — `BEFORE UPDATE` on `master_batch`. Closes the route round layer
   3: `batch_admin_write` lets an admin write `master_batch` directly, so without this they could
   set the status back to `draft`, move the plan, and set it forward again. Also freezes `start_at`.
   A batch that must not run is **cancelled**, never un-activated.

Layer 3 costs one comparison on a normal execution write and returns early. Recording what actually
happened is untouched, which is proved rather than asserted.

### Why there is no fifth route

`batch_activity` grants **no INSERT, UPDATE or DELETE to `anon` or `authenticated`** — probed, and
asserted as a test. The table was never client-writable, so the RPC surface was the whole attack
surface.

### Proof

`tests/baselineImmutability.test.ts`, 14 tests, all passing:

- a **draft** batch can still be repointed, and moving H0 in draft really does move the plan — so
  the freeze is a freeze and not "no writes ever"
- an **activated** batch refuses the repoint, and the plan compares byte-for-byte equal afterwards
- **operator, supervisor, manager, gm and admin** each refused, across all six routes to the columns
  (`repoint_batch_activities`, `repoint_one_activity`, `set_activity_plan`, `clear_planned_time`,
  `set_batch_start_at`, `generate_activity_plan`), with the full plan snapshot compared before/after
- a **direct `UPDATE`** of each of the six columns, run as the table owner with no RPC involved, is
  refused by the table itself
- **recording an actual is not blocked** — the freeze is surgical
- the batch **cannot be walked back to draft**, and **H0 cannot be moved**
- no client role holds `EXECUTE` on the plan writers; `anon` holds none on the draft editors;
  `batch_activity` grants no write to any client role

Every refusal is checked with a savepoint helper that returns the message, so each test also asserts
that **nothing was written** and that the wording is one a human can act on.

---

## 3 · F3 — role resolution

### The symptom
"Auth doesn't work." Sign-in succeeds and then every guarded call fails.

### The cause
`current_app_role()` read the JWT claim and nothing else. That claim exists only if the **Custom
Access Token hook is enabled in the Supabase dashboard** — console state, not schema state, which no
migration can guarantee. With the hook off, the claim is absent and the role is NULL.

### The fix
Claim first, `profiles.role` second:

```sql
select coalesce(
  nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb
           -> 'app_metadata' ->> 'app_role', '')::app_role,
  (select p.role from public.profiles p where p.id = auth.uid() and p.is_active)
);
```

Accounts created by hand now work with no console configuration at all.

### Why this is not a privilege escalation — probed, not assumed

- `profiles` carries **three policies, all SELECT**. `authenticated` and `anon` hold the
  INSERT/UPDATE/DELETE grants Supabase gives every table in `public`, but RLS is enabled and
  deny-by-default, so with no write policy the write is refused.
- 0035 restates that as three explicit `false` policies. They change no behaviour today; they exist
  so the refusal is a written decision rather than an omission, and so anyone adding a write policy
  has to delete a line whose comment tells them what they are doing.
- The function stays **INVOKER-rights**. `SECURITY DEFINER` would let it read rows the caller
  cannot — the exact widening this fix was required not to perform. Under invoker rights,
  `profiles_read_self` is what permits the lookup, so it can only ever resolve the caller's own role.
- No policy on `profiles` calls `current_app_role()`, so the subquery cannot recurse. Checked.
- `is_active` is required in the fallback: a deactivated member of staff has no role.

### Proof
`tests/roleResolution.test.ts`, 9 tests, all passing — the five cases requested plus four:

1. valid JWT claim → that role
2. **the claim wins over the profile**, so enabling the hook does not silently change behaviour
3. no claim + active profile → the profile's role
4. no claim + **deactivated** profile → NULL
5. neither → NULL; and a signed-in user with no profile row is also nobody
6. **self-promotion**, under `set local role authenticated` with RLS applied
7. `profiles` has no write policy and RLS is on
8. guarded RPC under every case
9. `current_app_role` is not `SECURITY DEFINER`

**A note on case 6.** The first version of this test asserted an exception and failed — because the
attempt does not raise, it affects **zero rows**. An RLS `USING (false)` filters rows out; only
`WITH CHECK` raises. The test was asserting the *mechanism* instead of the *outcome*. It now asserts
the outcome — zero rows affected, the roster unchanged, the row still `operator`, and the resolved
role still `operator` — which is both the correct claim and the stronger one.

---

## 4 · F6 — `assert_role` failed OPEN

**Found while proving F3 case 3. It is the most severe of the four.**

```sql
-- before
create function has_role(variadic roles app_role[]) returns boolean as
  $$ select public.current_app_role() = any(roles); $$;

create function assert_role(...) as $$
  if not public.has_role(variadic p_allowed) then raise ... end if;
$$;
```

For a caller with no role, `NULL = any(...)` is **NULL**, not false. `not NULL` is NULL, the branch
is not taken, and `assert_role` **returns normally**. Every RPC guarded by it —
`hold_activity`, `release_activity`, `return_activity`, `accept_with_deviation`,
`escalate_deviation`, `gm_decide_override`, `add_corrective_action`, `verify_corrective_action`,
`accept_lab_result` — was open to any caller whose token carried no `app_role`.

With the hook disabled, that was **every caller**.

The two halves of the security model were failing in opposite directions: RLS policies read
`has_role` in a `USING` clause, where NULL is treated as false and the row is denied — so RLS failed
**closed** and looked broken. The RPC guards failed **open** and looked like they were working.

```sql
-- after
select coalesce(public.current_app_role() = any(roles), false);
```

`coalesce` changes nothing for RLS, where NULL and false already deny, and turns every guard from
open to closed.

**Fallout, handled:** two callers were passing only because of the hole —
`supabase/seed/s11_demo_batches.sql` and `scripts/setup-demo-showcase.mjs`, both calling
`accept_lab_result` as nobody. Both now set a `lab_tech` claim around the call, transaction-local,
and put it back afterwards. A seed that names itself is more honest than one that is nobody.

---

## 5 · F2 — the extension register

### The model

```
STANDARD PLAN  +  EXTENSION REQUEST  +  MANAGER APPROVAL  +  GM APPROVAL
                        =  AUTHORISED EXPECTATION

while ORIGINAL PLAN, ACTUAL EXECUTION and AUDIT HISTORY are all preserved, separately.
```

Four numbers, never collapsed:

| | |
|---|---|
| planned end | 12:00 — the frozen baseline |
| approved extension | +2h — this register |
| authorised expectation | 14:00 — derived, stored nowhere as truth |
| actual end | 13:40 — the execution record |
| **original variance** | **+1h40m — still visible, still the truth** |
| within authorisation | yes |

Nothing in 0036 writes `planned_end_at`. It could not if it tried — F1's trigger would refuse it,
and a test asserts the full plan is unchanged after a complete approval.

### Objects

- `extension_policy` — one row, admin-writable, holding **every factory rule still open**
- `extension_request` — the register; no client grant, no write policy, all writes via RPC
- `extension_is_effective(status)` — the one place "has every required approval" is decided
- `request_extension`, `manager_decide_extension`, `gm_decide_extension`, `cancel_extension`,
  `expire_extensions` — one per transition, each asserting its own role and stamping its own time
- `fn_make_extension_effective` — the only writer of the effective window; revoked from every client
- `trg_extension_is_append_only` — the request and any decision already made are write-once
- `v_activity_expectation` — the four numbers side by side
- `v_extension_request` — the register with names resolved

### Every question asked, and its answer

| Question | Answer | Where |
|---|---|---|
| Who may request | operator, supervisor, lab_tech | `extension_policy.requester_roles` |
| Who may approve | manager, then GM | `assert_role` in each RPC |
| Approval ordering | manager first | `strict_approval_order` **[TBD-EXT-2]** |
| Both mandatory? | yes by default | `manager_approval_required`, `gm_approval_required` **[TBD-EXT-1]** |
| Duration limits | none stated | `max_requested_hr` NULL **[TBD-EXT-3]** |
| Evidence required | no | `evidence_required` false **[TBD-EXT-4]** |
| Expiry | never | `request_expiry_hr` NULL **[TBD-EXT-7]** |
| Cancellation | requester only, while REQUESTED | `cancel_extension` |
| Multiple extensions | one open at a time; approved ones sum | `max_open_per_activity`, partial unique index |
| Late requests | allowed | `allow_late_request` true |
| After completion | refused | `allow_after_completion` false **[TBD-EXT-5]** |
| Audit timestamps | server-set on every transition | `audit_event` |
| RLS / RPC enforcement | no table grant, no write policy | probed and tested |
| Forecast impact | `authorised_end_at`, derived | `v_activity_expectation` |

**No factory rule was invented.** Seven TBD markers carry the defaults that follow the dictated
diagram and nothing further. Answering one is an `UPDATE` on a settings row, not a migration — and a
test proves that flipping `gm_approval_required` really does change the outcome.

### Three decisions worth naming

- **Approval only ever narrows.** A manager may grant less than was asked, never more; the GM may not
  exceed what the manager allowed. Approving more time than anyone requested is a decision nobody
  made.
- **The authorised window runs from the PLANNED end, not from the moment of approval.** An extension
  approved at 13:00 on a 12:00 activity authorises until 14:00, not 15:00 — otherwise a late
  approval would quietly buy extra time.
- **A request after the activity has finished is refused by default.** That is a request to rewrite
  history, which is what a deviation is for.

### Proof
`tests/extensionRegister.test.ts`, 21 tests — the full chain with the plan compared before and after;
the four numbers separate; an overrun beyond the approval still reported unauthorised; two
extensions accumulating; who may request and who may approve; strict ordering; the policy switch;
narrowing; caps; mandatory reason and positive hours; evidence; one-open-at-a-time; a rejected
request freeing the slot; late vs after-completion; cancellation; expiry; no client write grant;
append-only decisions; an audit event with a named actor for every transition; and the window
anchored to the planned end.

---

## 6 · Security invariants now enforced by the database

1. The Plan register of a non-draft batch is immutable — RPC, role, or direct statement.
2. Activation is one-way; H0 is frozen at activation.
3. `batch_activity` is not writable by any client role.
4. A role is never resolved from anything the client controls, and cannot be self-granted.
5. `assert_role` fails **closed**.
6. An extension is additive: it never writes the plan and never writes the execution record.
7. A request and any decision recorded on it are write-once.
8. Every extension transition is stamped by the server with a named actor.

---

## 7 · What is still open

### Found during this pass, not yet fixed

- **`send_alert` has no `assert_role` at all.** `SECURITY DEFINER`, granted to `authenticated`, so
  any signed-in user can send an alert to any role. Minor, but it is an authorisation gap.
- **The Standard register has no publish/freeze step.** `process_definition`, `process_activity`,
  `gate_rule`, `lab_spec` and the rest are writable by an admin at any time under `ref_write`, with
  nothing marking a version published. Editing a definition that activated batches were built from
  is currently possible.
- **`batch_activity.actual_start` / `actual_end` may be overwritten** after being set. An operator
  can restate the past. A correction should be a new record that supersedes, not an overwrite.
- **The demo batch's event log is stamped H456 with "no actor recorded"** — carried over from the
  earlier review, still unaddressed.

### Audit areas not yet examined

Evidence capture → storage → retrieval end to end; the lab permission model and workflow; the gate
engine and `evaluate_gates`; resource and movement; forecast; process versioning; the experimental
template model; the UI data contracts for the junior boundary.

`docs/architecture/ARCHITECTURE_FINAL_REVIEW.md` is written once those are done.

### Environment, not regression — verified

Full suite: **431 passed, 32 failed, 20 skipped** (28 files, 24 min).

The 32 failures were checked mechanically rather than by inspection. These changes only ever ADD
refusals, so a regression would surface as one of the new refusal messages. Searching the whole run
for `baseline is frozen`, `baseline of … is frozen`, `cannot return to draft`, `H0 of … is frozen`,
`cannot be rewritten`, `already recorded and cannot be changed` returns **14 hits, every one of them
the name of a passing test in `baselineImmutability.test.ts`, and none in any failure.** Searching
for `requires role` — what a now-fail-closed `assert_role` would produce — returns **nothing in any
failure**.

Every failure message is about rows that are not there:

| Suite | Failed | Cause |
|---|---|---|
| `demoBatches` | 10 | `MB-DEMO-EARLY/MID/LATE` do not exist |
| `varianceAttribution` | 6 | filters `code like 'MB-DEMO-%'` |
| `hourlyPlan` | 7 | hardcodes `MB-DEMO-MID`; two more need any `status='draft'` batch |
| `tower`, `controlTower`, `dayZeroToSix`, `lab`, `checkpoints` | 6 | all name a demo batch |
| `controlRoom` | 1 | test timed out at 30 s — slow, not refused |
| `plant` | 1 | "an occupancy row exists for a vessel nobody allocated: expected 3 to be 0" |
| `evidence` | 20 skipped | storage returns `403 AccessDenied`; no service key |

The deployed database holds **one** batch, `MB-2026-366-368` (active), and **no draft batch at all**.
Re-running `scripts/stage-history.mjs` and providing a storage key should clear all but two.

**Two that are not missing data and are not caused by this work, but are real:**

- `plant` — three `location_occupancy` rows exist for vessels nobody allocated. A data-integrity
  smell in the resource/movement area, which has not been audited yet.
- `controlRoom` — a 30-second timeout. Either genuinely slow or flaky; worth a second run.

Both are added to the open list rather than explained away.
