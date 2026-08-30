> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# 04 · Architecture

What you need to know to not break it. Full domain map:
`docs/architecture/SYSTEM_ARCHITECTURE_V1.md` — *which still carries the stale H552 in §14/§15 and
is being corrected under PRD-002.*

**Stack:** Supabase / PostgreSQL with RLS · React 18 + Vite · Capacitor for the field build.
**Size:** 36 migrations · 50+ tables · ~95 functions · 24 views · 19 routes · 28 test files.

---

## 1 · Five registers, one writer each

```
STANDARD ─→ PLAN ─→ ( ACTUAL | AUTHORIZATION ) ─→ FORECAST
```

| Register | Holds | Written by | Mutable after write? |
|---|---|---|---|
| **STANDARD** | the factory-approved process | Admin, before publish | No — a change publishes a **new version** |
| **PLAN** | this batch's baseline | `activate_batch`, once | **NEVER.** Frozen at activation |
| **ACTUAL** | what happened | `submit_activity` and friends | **APPEND-ONLY.** A correction supersedes |
| **AUTHORIZATION** | permission to differ | approval RPCs | Additive only. Never rewrites PLAN or ACTUAL |
| **FORECAST** | where it lands now | nobody — derived | Recomputed. Stored nowhere as truth |

### Why five and not one

Management must be able to ask, years later, *what should have happened, what did, and who
authorised the difference.* That is only answerable if the answers are stored **separately**. The
moment any two collapse into one column the question becomes unanswerable, and no amount of UI
fixes it afterwards.

### The whole integrity claim, in one sentence

> **Nothing written after activation may write into PLAN. Nothing at all may rewrite ACTUAL.
> If a number can be computed, it is never stored.**

### Registers never call each other

They are joined only by **pure read functions** — views, or SQL functions with no side effects:

```
variance    = ACTUAL − PLAN
compliance  = ACTUAL  vs  (PLAN + AUTHORIZATION)
forecast    = PLAN + ACTUAL-so-far + AUTHORIZATION
exposure    = forecast(envelope) − PLAN(envelope)
```

---

## 2 · Tables by domain

| Domain | Tables |
|---|---|
| Process definition | `process_definition` · `process_activity` · `process_day` · `phase` · `gate_rule` · `evidence_requirement` · `resource_requirement` · `lab_checkpoint` · `lab_spec` · `movement_rule` · `activity_variant` · `activity_field` |
| Planning | `master_batch` · `batch_activity` *(planned_\*, baseline_\*)* · `batch_process_config` · `batch_material_role` · `batch_activity_evidence_req` |
| Execution | `batch_activity` *(actual_\*)* · `batch_activity_value` |
| Evidence | `evidence_media` *(with `superseded_by_id`)* |
| Lab | `lab_sample` · `lab_test` · `lab_result` |
| Authorization | `extension_request` · `extension_policy` · `deviation` · `checkpoint_decision` · `management_checkpoint` · `corrective_action` |
| Resources / movement | `machine_usage` · `batch_movement` · `location_occupancy` · `batch_vessel_allocation` |
| Time / forecast | views only |
| Audit | `audit_event` |

**One dependency direction:**

```
PROCESS → PLANNING → EXECUTION → TIME/FORECAST → READ MODELS → UI
supporting: EVIDENCE · LAB · RESOURCES · AUTHORIZATION → EXECUTION / READ MODELS
AUDIT → everything important
```

Each domain owns its tables and rules. Others consume contracts, never tables. This is where
projects become spaghetti — with several people working at once, the only thing keeping them from
producing several incompatible systems is that none of them can reach into another domain's tables.

---

## 3 · The extension is a third number, never an edit

The single design decision most likely to be undone by someone trying to make a screen simpler:

```
planned end          12:00      never mutated
approved extension   +2 h    →  authorised 14:00
actual end           13:40

original variance    +1 h 40 m     ← still visible
within authorisation yes
```

Applying the extension by moving `planned_end_at` to 14:00 would erase the +1h40m. **The extension
is a third number.**

Three sub-rules, each of which was a decision:

- **Approval only narrows.** A manager may grant less than asked, never more; the GM may not exceed
  the manager. Approving more time than anyone requested is a decision nobody made.
- **The window runs from the PLANNED end, not from the approval.** Approve at 13:00 on a 12:00
  activity and it authorises until 14:00, not 15:00 — otherwise a late approval buys extra time.
- **A request after completion is refused.** That is a request to rewrite history; a deviation is
  the instrument for that.

Seven further policy questions live as columns of `extension_policy` with TBD markers. Answering one
is an `UPDATE` on a settings row, not a migration.

---

## 4 · The process is data

Sequence, durations, dependencies, cardinality, gates, lab requirements, evidence requirements,
resource requirements and options are all **rows**. The engine does not know what a mushroom is.

Consequences that are easy to get wrong:

- **No material name in a process definition.** Codes are `FIB1-WEIGH`, never `BG-WEIGH`; labels
  resolve from `{role_lead}` at read time. This is what makes "bagasse becomes mustard" a zero-code
  change, and it is enforced by a CHECK constraint that names the forbidden words — including
  `paddy` and `bagasse`. **The process's "paddy" is the `STRAW` stream; its "bagasse" is `FIB1`.**
- **A process activity names a machine CLASS, never a unit.** Adding a third turner touches the
  resource tables only.
- **Cardinality is a rule, not a constant.** Six piles is a row, not a number in a screen.
- **Evidence requirements are named, not counted.** `BEFORE_PHOTO`, never "2 photos".
- **The shape is fixed; the content is the admin's.** Options and dropdowns, not a blank page.

---

## 5 · Time

**H0 → H470** is the production axis. Calendar dates are a projection for humans. Batch-hour time is
continuous and server-authoritative — **calendar midnight does not reset it**, and a browser clock
never determines "now".

`actual_recorded_at` is kept distinct from `actual_start` / `actual_end`. One is when the server
heard it; the other is when the operator says it happened. **That distinction is correct and must
survive any refactor.**

### The envelope problem — read before touching `process_definition`

```sql
-- 0011_hour_axis.sql
baseline_hours int generated always as ((total_days + 1) * 24) stored
```

The old `H552` was never a factory figure. It is 23 × 24. And `470 / 24 = 19.583…`, so **no integer
`total_days` produces 470**. The schema physically cannot hold the confirmed standard.

The tempting fix — `total_days = 19` → 480 — is close enough to look right on a screen and wrong by
ten hours in every variance the product computes. Because the plan freezes at activation, that error
would be **permanent and protected by the guarantee meant to prevent it**.

`0041_process_envelope_hours.sql` gives the envelope its own stated column with a source and a
confidence class, plus one resolver view. `baseline_hours` stays untouched and keeps meaning the day
grid. Apply it **before** PROCESS-2026C is created.

---

## 6 · Security

**Assume an authorised insider will eventually try to make a batch look better than it was.**

The question is not *"can the operator edit it in the UI?"* — a hidden button is not security. It is:

> **Can anyone cause the database to believe something happened earlier, faster, by someone else, or
> under a different condition than it really did?**

Attack paths to assume: UI · DevTools · direct HTTP · direct RPC · direct SQL as client roles ·
replayed requests · duplicate requests · altered payloads · `SECURITY DEFINER` functions · helper,
maintenance and import paths · stale endpoints · role manipulation · roleless JWTs · direct storage
operations.

**The database enforces truth. Nothing else can.**

One trap worth naming, because it already happened here: `has_role` was
`current_app_role() = any(roles)`. For a caller with no role that is `NULL = any(...)` → **NULL**,
not false. `if not has_role(...)` on NULL never takes the branch, so the function **returned
normally** — nine guarded RPCs were open to anyone. RLS read the same expression in a `USING` clause
where NULL is false, so RLS failed *closed* and looked broken while the RPC guards failed *open* and
looked fine. Both "auth doesn't work" and "auth is fine" were true at once.

**Any boolean a security decision reads must be `coalesce`d.** Fixed in `0035` §3.

---

## 7 · Where the contract currently leaks

Several API modules read base tables instead of views, so a schema change breaks screens and a screen
can see things it should not.

| Module | Reads | Should read |
|---|---|---|
| `execution.ts` | `batch_activity`, `batch_activity_value` | `v_live_batch`, `v_activity_timing`, `v_evidence_state` |
| `lab.ts` | `lab_sample`, `lab_test`, `lab_checkpoint` | `v_lab_queue`, `v_lab_result_history` |
| `tower.ts`, `batches.ts` | `batch_activity`, `master_batch` | `v_live_batch` |
| `controlRoom.ts` | `batch_activity`, `gate_rule` | **a gate view that does not exist yet** |
| `schedule.ts` | six base tables | **a planning view that does not exist yet** |

Also: `src/api/batch.ts` is 534 lines spanning Planning, Execution and Evidence. **It is the file two
people will collide in.** Splitting it is a pure move — imports and moves, no behaviour change — and
doing it early is what makes parallel work possible.

---

## 8 · Migrations

Forward-only, numbered, applied in filename order. **They are the source of truth for schema — and
they are not currently complete.**

Two tables and eleven functions exist in the deployed database that no migration creates, including
a **dev clock**: `get_effective_now`, `set_dev_clock_h`, `pause_dev_clock`, `play_dev_clock`.

**If `get_effective_now()` is reachable from any function that writes ACTUAL, AUTHORIZATION or
AUDIT, every timestamp in the product is deniable.** Prove it is not — as a test that greps function
bodies, so it fails the day someone wires it in.

Reserved numbers: `0037` schema drift capture · `0038` actual immutability · `0039` `send_alert`
guard · `0040` confidence class *(drafted)* · `0041` envelope hours *(drafted)*.

---

## 9 · Ten standing rules

1. The process is data. No factory rule lives in code or in a screen.
2. No material name in a process definition.
3. Never merge `PROCESS-2026B` with the archived `ROUTE-2026A`.
4. Never invent a factory rule. Unknowns stay marked `UNRESOLVED`.
5. The process shape is fixed; the content is the admin's.
6. Out-of-range never blocks recording. It forces a remark and raises a deviation.
7. If a number can be computed, do not store it. If a number was **stated**, do not compute it.
8. A refusal must name what to do instead.
9. **Report bugs outside your boundary; do not fix them.** A casual fix to a foundational table is
   how several parallel workstreams become one broken one.
10. Update the handover before you report done.
