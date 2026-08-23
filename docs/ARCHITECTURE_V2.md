# ARCHITECTURE V2

> ## ✅ CONFIRMED, WITH ADDITIONS — 20 Aug 2026
>
> The factory walkthrough changes the **process**, not the **architecture**. Everything in this
> document stands: Supabase + Postgres as the authority, RLS, all state transitions in Edge
> Functions and `SECURITY DEFINER` functions, `evaluate_gates` as a pure re-evaluating function,
> append-only history, offline write queue with idempotency keys, audit on every transition,
> no demo-only code paths, no runtime time-compression flag.
>
> Three additions, detailed in §14 at the end of this document:
>
> 1. **The process engine is data.** `PROCESS-2026B` is seed SQL, not code — `DOMAIN_MODEL.md §8`.
> 2. **Two more exclusion constraints.** `location_occupancy` (now including paddy in bunkers)
>    and `machine_usage`. Machines are contended resources, not string fields.
> 3. **Evidence gates submission server-side**, per named requirement — not a photo count.
>
> New Edge Functions: `generate_activity_plan`, `start_machine_stint`, `end_machine_stint`,
> `record_movement`, `select_activity_variant`.

Labels: **[FACT]** cited · **[INFER]** derived · **[DECISION]** product decision · **[TBD]** confirm.

---

## 1. Shape

One codebase, one deployment, four role-shaped experiences.

```
┌──────────────────────── CLIENT (single web app, PWA) ────────────────────────┐
│                                                                              │
│  OPERATOR MOBILE     LAB MOBILE      SUPERVISOR MOBILE    MANAGEMENT DESKTOP │
│  My Work             Lab Queue       Control Room         Schedule · Batches │
│  one task at a time  sample→result   release/hold/return  Resources · GM     │
│                                                                              │
│  React + TypeScript · Vite · TanStack Query · Zustand · Tailwind             │
│  offline queue (IndexedDB) · service worker · camera capture                 │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ HTTPS · JWT
┌───────────────────────────────────▼──────────────────────────────────────────┐
│                              SUPABASE                                        │
│                                                                              │
│  Auth (GoTrue)     PostgREST        Edge Functions      Storage    Realtime  │
│  6 roles           read paths       ALL WRITES that     evidence   live      │
│  RLS on JWT        + simple writes  change state        photos     boards    │
│                                                                              │
│  PostgreSQL 15 — the actual authority                                        │
│  · RLS policies per role                                                     │
│  · triggers: append-only history, gate re-evaluation, audit                  │
│  · pg_cron: timer expiry, calibration due, overdue lab tasks                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

**[DECISION] One web app, not one app per role.** Roles differ by route tree and layout, not
by codebase. Rationale: a supervisor uses the operator view to check work, a manager uses the
GM dashboards, and the domain model is identical. Four apps means four drifting copies of the
same batch card.

**[DECISION] PWA, not a Capacitor wrapper — initially.** The existing app is already a WebView
around static HTML (S8a); the wrapper adds nothing the browser does not give us except an
install icon and `capture="environment"` reliability. Ship as an installable PWA; keep
Capacitor as a packaging step in Phase 8 if the factory needs an APK for MDM distribution.
**[TBD-18]** Confirm whether phones are managed and require an APK.

---

## 2. Why Supabase, and where it is not enough

Supabase gives us, out of the box: Postgres (which is where the model actually lives), row
-level security tied to JWT claims, object storage with signed URLs for evidence, realtime
subscriptions for the supervisor board, and a managed auth surface.

What it does **not** give us is workflow. RLS answers *"may this user write this row?"*
It cannot answer *"may this activity move from SUBMITTED to COMPLETED given that its lab
result failed, its 44-hour hold has 3 hours to run, and no supervisor has released it?"*

**[DECISION]** That question is answered in **Edge Functions + Postgres functions**, never in
the browser.

---

## 3. The write boundary

**[DECISION]** Tables that carry process state are **not directly writable** by the
`authenticated` role. `INSERT`/`UPDATE`/`DELETE` are revoked; all mutation goes through
`SECURITY DEFINER` Postgres functions, invoked by Edge Functions.

| Table | Direct write | Mutated by |
|---|---|---|
| `master_batch` | ❌ | `create_master_batch`, `configure_batch`, `activate_batch` |
| `batch_activity` | ❌ | `submit_activity`, `evaluate_gates`, `supervisor_decide` |
| `batch_activity_value` | ❌ | `submit_activity` (append-only) |
| `lab_result` | ❌ | `record_lab_result`, `supersede_lab_result` |
| `deviation` | ❌ | `raise_deviation`, `resolve_deviation` |
| `decision` | ❌ | `supervisor_decide`, `gm_decide` |
| `bunker_occupancy`, `tunnel_load` | ❌ | `allocate_vessel`, `allocate_tunnel_pooling` |
| `audit_event` | ❌ | trigger only; no application path |
| `evidence` | ✅ insert only, RLS-scoped | Storage upload + row insert |
| reference tables (`material`, `vessel`, `route`, `lab_spec`, …) | ✅ admin only | |

### 3.1 The critical operations

```
activate_batch(batch_id)
  ├ assert caller is admin AND gm checkpoint-1 decision exists
  ├ assert validation report has zero BLOCKING findings
  ├ freeze baseline: copy route SOP values into batch_activity_value cols 1–3
  ├ materialise batch_activity rows (master / per-line / per-individual-batch)
  ├ convert vessel reservations to occupancy locks (exclusive, windowed)
  ├ set first activity READY; emit BATCH_ACTIVATED
  └ write audit_event with baseline hash
      ── all inside ONE transaction. Partial activation is not a state.

submit_activity(activity_id, values[], evidence_ids[], idempotency_key)
  ├ assert caller is the assigned operator AND state ∈ {READY, IN_PROGRESS, RETURNED}
  ├ upsert by idempotency_key   ← offline retry safety
  ├ append batch_activity_value.actual_value (never update in place)
  ├ compute variance_flag server-side against cols 2 then 1
  ├ raise_deviation() for each out-of-range value
  ├ create lab_sample + lab_test rows for this activity's checkpoints
  ├ start timers / sensor watches
  └ evaluate_gates(activity) → next state

record_lab_result(test_id, values, instrument_id, idempotency_key)
  ├ assert caller is lab_technician
  ├ assert instrument calibration status; record it, never block on it
  ├ compute derived params (C:N, TDS) server-side
  ├ verdict := compare vs frozen target_min/max  → pass | fail | no_spec
  ├ FAIL → raise_deviation, keep dependent gates blocked
  └ evaluate_gates(all activities waiting on this test)

evaluate_gates(scope)
  └ pure function of current state. Idempotent. Safe to replay.
     Returns (new_state, blocked_reason_code, blocked_reason_text, unblocks_at).
     blocked_reason_* is NOT NULL for every non-actionable state — enforced by CHECK.
```

**[DECISION]** `evaluate_gates` is a **pure Postgres function** over current state, not an
event applier. Any event — a late offline sync, a replayed webhook, a cron tick — simply
re-runs it. This is what makes offline operators safe.

---

## 4. Enforcement layers

| Layer | Enforces | Cannot enforce |
|---|---|---|
| UI | correct affordances, disabled buttons | anything |
| RLS | which rows a role sees; column-level write grants | temporal / conditional rules |
| Edge + SECURITY DEFINER functions | **all state transitions and gate logic** | — |
| Constraints & triggers | append-only, no orphan result, no overlapping vessel occupancy, `blocked_reason` NOT NULL, deviation cannot be deleted | business rules |

**[DECISION]** This directly answers the existing app's two documented admissions (S8d, S8c):
that its role check is "NOT a security boundary", and that its SOP targets are "advisory only —
the app must never block submission". In v2, the operator is still never blocked from
*recording reality* — but the *gate* is server-enforced and cannot be bypassed by editing
localStorage.

### 4.1 Vessel exclusivity

```sql
-- a bunker or tunnel cannot hold two batches in overlapping windows
ALTER TABLE vessel_occupancy ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    vessel_id WITH =,
    tstzrange(occupied_from, occupied_to, '[)') WITH &&
  );
```

**[FACT]** This is a real constraint, not a hypothetical: S7a shows bunker 5 used by master
batch 1 (reload-1, 18 Apr), batch 2 (reload-1, 21 Apr), batch 4 (reload-1, 28 Apr), batch 7
(reload-2, 12 May) — a tight rotation across 11 bunkers and ~10 concurrent batches.

---

## 5. Offline

> **CLIENT DECISION 22 Aug 2026 — network assumption revised.** Operators and lab technicians
> have **reliable realtime internet**. The offline design below is **not being built** and is
> retained as the specification if that ever changes.
>
> Three of its rules are kept anyway, because they are correct for other reasons:
> - **Evidence is upload-then-bind.** Not for replay — for integrity. A row that claims a photo
>   which is not in storage is a false record, which is the failure mode this product exists to
>   prevent.
> - **Timers are computed from server timestamps, never the device clock.** Already built and
>   tested (`advance_batch`, `unblocks_at`).
> - **No offline auth fallback.** The legacy local password table stays deleted.
>
> The write queue, IndexedDB read cache and blob capture are **out of scope**. `idempotency_key`
> is still worth having, but its justification is now double-tap and network retry, not replay.

**[FACT]** The old app already assumed a hostile network — S8d ships a local account table
"because the demo-room wifi must not hang the button". Bunkers and tunnels are worse than a
demo room.

**[DECISION]**

- **Reads** cached in IndexedDB via TanStack Query persistence. The operator's assigned tasks
  for the next 48 h, with SOP values, are prefetched.
- **Writes** queued locally with a client-generated `idempotency_key` (UUID). Replayed on
  reconnect. The server upserts by key, so a double-sync is a no-op.
- **Evidence** captured to IndexedDB as blobs, uploaded on reconnect, with the row inserted
  only after upload succeeds.
- **Timers** computed from server timestamps, never from device clock. A phone with a wrong
  clock must not open a 44-hour gate early.
- **No offline auth fallback.** The old app's local password table (S8d) is removed. Offline
  means "already signed in, session valid"; it does not mean "sign in against a table shipped
  in the bundle".
- **Gate state is never decided offline.** The client shows the last known state and marks it
  stale. Submitting works offline; *transitioning* happens on the server.

---

## 6. Realtime

Supabase Realtime subscriptions, scoped by RLS:

| Surface | Subscribes to |
|---|---|
| Supervisor Control Room | `batch_activity` state changes, `deviation` inserts, `lab_result` inserts for their batches |
| Lab Queue | `lab_test` inserts |
| GM Command Center | `deviation` where severity = critical, checkpoint decisions pending |
| Manager Resources | `vessel_occupancy` changes |
| Operator My Work | their own `batch_activity` state changes (a return arrives without a refresh) |

**[DECISION]** Realtime is a freshness optimisation, never a correctness mechanism. Every
surface also polls on focus and reconciles.

---

## 7. Storage & evidence

- Bucket `evidence`, private, path `{master_batch_id}/{activity_id}/{uuid}.jpg`.
- **[DECISION]** Signed URLs only, short TTL. RLS on the `evidence` table controls who can
  request a signature.
- **[DECISION]** Client-side downscale to ≤ 1600 px long edge, JPEG q80, before upload.
  Operators shoot dozens of photos per batch on cheap phones over 2G.
- **[DECISION]** Capture timestamp + capturing user are stored **server-side** on insert;
  EXIF is retained but never trusted as the record of when.

---

## 8. Scheduled work (pg_cron)

| Job | Cadence | Purpose |
|---|---|---|
| `expire_timers` | 1 min | `WAITING_TIME` → re-evaluate gates when a rest/hold window opens |
| `probe_reminder` | 15 min | bunker probes every 6 h (S1a), tunnel log every 4 h (S3f) — nudge before the window is missed |
| `overdue_lab_tasks` | 15 min | escalate lab tasks blocking a gate |
| `calibration_due` | daily | pH daily / EC weekly per S4a |
| `schedule_lookahead` | daily | surface slots starting in the next 3 days on Admin Today |
| `stale_batch_watch` | hourly | any active batch with no activity in 24 h → supervisor |

---

## 9. Frontend structure

```
src/
  domain/            types generated from the DB schema; zero UI imports
  api/               typed Supabase client; one module per aggregate
  workflow/          client-side MIRROR of gate logic — for display only,
                     never for decisions. Marked as such in every file header.
  components/
    batch/           BatchCard, BatchTimeline, SixColumnTable, VarianceChip
    lab/             SampleCard, ResultEntry, MethodSheet, RetestChain
    evidence/        Capture, Gallery, Lightbox
    decision/        DecisionPackage, ApprovalBar
  routes/
    operator/        my-work, task/:id
    lab/             queue, sample/:id
    supervisor/      control-room, release/:id, deviations
    admin/           today, schedule, batch/new/*, batch/:id, reference/*
    manager/         resources, conflicts, roster
    gm/              command-center, checkpoints, batches, compare
```

**[DECISION]** `workflow/` on the client is explicitly a mirror for rendering "why is this
blocked" without a round-trip. Every file in it carries a header saying so. The one thing that
must not happen is a second, drifting implementation of gate logic that someone later trusts.

---

## 10. Data volume and retention

**[FACT]** From the sources, per master batch:

| Thing | Count |
|---|---|
| activity instances | ~48 (17 stages × 1 master / 3 line / 4 batch scope) |
| activity field values | ~350 |
| lab samples | ~34 |
| lab results | ~120 |
| tunnel hourly log rows | 4 tunnels × 21 rows = 84 (at 4 h over ~84 h) |
| bunker probe readings | 3 lines × 5 stints × ~8 = ~120 |
| evidence photos | 30–60 |

At one master batch every 2.5 days ≈ **146 batches/year**: ~51 k activity values, ~18 k lab
results, ~7 k evidence photos (~3 GB at 400 kB each) per year. Trivial for Postgres. Storage
is the only cost line that matters.

**[DECISION]** Nothing is deleted. Ever. The point of the product is the record.

---

## 11. Environments

| Env | Purpose |
|---|---|
| `local` | Supabase CLI, seeded with the full ROUTE-2026A route, `lab_spec` from S4a, and 3 synthetic master batches at different stages |
| `demo` | the demo target (DEMO_PLAN.md), seeded from real batches 391–394 and 387–390 with names anonymised |
| `prod` | **[TBD-15]** new project, or the existing `omsxtifyzlldaxkeqerx`? The existing one carries the old 4-account seed and a documented `auth.users` NULL bug (S8d) |

**[DECISION]** Migrations are SQL files in-repo, applied by CLI. Seed data for the route,
lab specs and control bands is **also** SQL in-repo — the SOP is version-controlled, because
publishing a route version is a governed act (ROLE_AND_APPROVAL_MODEL §7).

---

## 12. Security posture

- **[DECISION]** Delete the offline account table (S8d). It ships credentials in the bundle.
- **[DECISION]** Role comes from a JWT custom claim populated from `profiles.role` by an auth
  hook — not from a client fetch after login, which the old app did and which is trivially
  spoofable in localStorage.
- **[DECISION]** No service-role key ever reaches the client. Edge Functions hold it.
- **[DECISION]** Every state-changing function writes an `audit_event` in the same transaction:
  actor, role, before-state, after-state, reason. Immutable, `REVOKE UPDATE, DELETE` from all
  roles.
- **[DECISION]** The `TIME_SCALE = 3600` demo accelerator (S8e) does not exist in the new
  codebase. Demo time compression is a **seeded-data** concern (batches created with historical
  timestamps), not a runtime flag that could ship to production and open a 44-hour gate in 44
  seconds.

---

## 13. What we deliberately do not build in v2

- No tunnel controller integration (**[TBD-8]** may change this in Phase 6).
- No mobile-native app (PWA first).
- No automatic batch narrative generation — the data is structured so it becomes possible, but
  the S3f-style diagnosis stays human in v2.
- No historical migration in the demo path (**[TBD-17]**); history imports as read-only
  reference in Phase 8 if wanted.
- No multi-site. One factory.
