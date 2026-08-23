# CONTRACT AUDIT — `MUSHROOMOS_V2_END_TO_END_PRODUCT_CONTRACT.md` vs the repository

**Date:** 22 August 2026 · **Scope:** the proposed contract, `lab_technician_batch_process.md`,
the full `docs/` set, `mushroomos/` (10 migrations, 9 seeds, 17 source files), `mails/`, `apk_extracted/`.

**Standing rule observed:** nothing below silently resolves a factory or process conflict.
New disagreements are registered in §5 with IDs continuing `SOURCE_CONFLICTS.md`.

---

## 0. One-paragraph verdict

The contract is **directionally correct and substantially already built at the schema layer**.
The repository is not a prototype — it is a governed process engine with the process expressed
as data, server-side write authority, a JWT role claim, a 31-conflict register enforced by
foreign key, and a database-level `CHECK` that forbids a material name appearing in a process
activity code. Most of what the contract asks for in §5, §9, §10, §13, §16, §25, §27 and §29 exists.

Three things are not true of the current system, and all three are load-bearing:

1. **The repository cannot be rebuilt from source.** Migration `0004` — the one that creates
   `master_batch`, `batch_activity`, `batch_activity_value`, `batch_activity_evidence_req`,
   `batch_material_role` and the `activity_state` enum — **does not exist on disk and has never
   existed in git history.** Migrations 0005–0010, all nine seeds and every screen depend on it.
2. **The gate engine is seeded but never executed.** `gate_rule` holds 25+ rules including the
   `SAME_SCOPE_INSTANCE` binding the contract calls the most important workflow requirement.
   Nothing reads that table. `advance_batch` uses a **global "all earlier `rel_day` complete"
   barrier** — which is precisely the `ALL T1 → ALL T2` model the contract forbids in §17.
3. **The time model is day-based, not hour-based.** There is no hour axis anywhere. §6, §7,
   §21.2, §22 and §23 of the contract have no foundation to sit on.

Everything else in this document is downstream of those three.

---

## 1. Where the contract AGREES with what exists

| Contract | Status in repo | Evidence |
|---|---|---|
| §3 mental model — not a checklist, not an operator app | **Held, and enforced** | `src/routes/Placeholders.tsx` refuses to render placeholder cards because "faking the workflow in the frontend" is forbidden by `KIRO_BUILD_INSTRUCTIONS §1` |
| §5.1 Standard process as its own layer | **Built** | `process_definition` / `process_activity` / `activity_field` / `evidence_requirement` / `gate_rule` / `movement_rule` / `resource_requirement` — `0003_process_engine.sql` |
| §5.3 Day-0 plan as a distinct layer | **Built** | `master_batch.config` jsonb + `batch_material_role` + the `set_activity_plan` whitelist |
| §5.4 Actual execution stored separately | **Built** | `batch_activity_value` carries `sop_*`, `day0_value` and `actual_value` as separate columns — the six-column model |
| §9.2 Material roles, no material names in the process | **Built and enforced at DB level** | `constraint process_activity_code_has_no_material_name check (code !~* '(bagasse\|paddy\|mustard\|…)')`. Stronger than the contract asks for. |
| §9.4 Load count derived, never hard-coded | **Built** | `evaluate_cardinality`, kind `DERIVED_FROM_QUANTITY`, `ceil(qty/cap)` with the tail instance taking the remainder |
| §10 Baseline freeze on activation | **Built** | `generate_activity_plan` and `set_activity_plan` both refuse when `status <> 'draft'`; `activate_batch` refuses while `validate_batch` reports any blocking finding |
| §13 Activity object | **~80% built** | `batch_activity` carries scope, scope_label, instance_no, responsible_role, assigned_person/machine/vehicle, source/destination location, state, blocked_reason |
| §14 Evidence as N named requirements | **Schema built** | `evidence_requirement` + `batch_activity_evidence_req` with `gates_submission`; `submit_activity` names the outstanding item. **Runtime is a counter — see §3.3.** |
| §16 The 14 workflow states, verbatim | **Built** | `src/domain/types.ts ACTIVITY_STATES` is the identical 14-value list |
| §16 "every non-actionable state must explain why" | **Built as a DB CHECK** | `batch_activity_reason_required` — a blocked row without a reason cannot be written |
| §16 server-side transition authority | **Built, and stronger** | every write is a `SECURITY DEFINER` RPC; `revoke insert, update, delete on batch_activity… from authenticated`; role is a signed JWT claim via `custom_access_token_hook`, not a fetched value |
| §25.7 Device clocks cannot open gates | **Built** | `advance_batch` compares server `now()` against a stored `unblocks_at`; `0008` documents the three defects that made this real |
| §25.9 Unresolved conflicts represented explicitly | **Built, better than specified** | `conflict_register` is a table with FK-enforced markers on `process_activity`, `activity_field`, `gate_rule`, `lab_spec`, `machine`; `validate_batch` emits every TBD the plan touches as an `info` finding |
| §25.11–13 no fixed 3/4, no 1:1 bunker↔tunnel, no invented threshold | **Held** | `DOMAIN_MODEL §1.1`; `lab_spec` rows carry `null` bounds with a `source_ref` that cites *the absence* |
| §27 What not to build | **Already complied with** | no page-per-stage, no localStorage authority, no second auth model, no fake transitions |
| §28 Legacy APK position | **Matches** | `SOURCE_INVENTORY §S8` reaches the same seven conclusions independently |
| §29 Technology architecture | **Matches exactly** | React 18 + TS + Vite + Tailwind + TanStack Query + Zustand + `@supabase/supabase-js` |
| §32 "Build the connected production record first" | **This is what was built.** | The schema exists; the screens are the missing part, not the reverse. |

**Two corrections to the framing that preceded the contract.** `evaluate_gates` does **not**
exist — it is named in `KIRO_BUILD_INSTRUCTIONS` Step 7 as future work. The functions that do
exist are `create_master_batch`, `generate_activity_plan`, `validate_batch`, `activate_batch`,
`set_activity_plan`, `assign_activity`, `send_alert`, `start_activity`, `submit_activity`,
`mark_evidence`, `advance_batch`, `release_elapsed_rests`, `repair_plan_states`. And the seed holds
**36 process activities + 9 lab activities** — matching the register's 36 exactly. (An earlier
revision of this document said 34; that was a miscount of the `VALUES` list, corrected against
`scripts/counts.mjs` on 22 Aug.)

---

## 2. Where the contract CONFLICTS with the repository or the sources

Lettered A–N. **None of these is resolved here.**

### A. §6 — the 552-hour clock has no counterpart in the engine

`process_activity.rel_day` is an **integer day**. `generate_activity_plan` computes
`planned_start = (start_date + rel_day)::timestamptz` — **midnight of a calendar day**. There
is no `standard_start_hour`, no `planned_start_at` carrying a time of day, and `planned_time`
(added in `0007`) is a nullable admin field that nothing derives a baseline from.

Consequence: §7's two time systems, §21.2's H0–H552 timeline, §22's daily boundary and §23's
forecast all have no data to render. This is the largest single structural gap and it is not a
UI problem.

### B. §6 — a fixed 552-hour window contradicts the repo's own unresolved durations

The contract fixes 23 × 24 = 552 h. But:

- **TBD-21** (the register's *"highest-priority walkthrough gap"*) — the rest durations on
  Days 2–3, 10–11 and 13–14 **have never been stated by the factory**. They are Day-0
  configurable with **no default**, mandatory before activation. A rest configured at 72 h
  overflows its 48-hour day grid and the baseline is no longer 552.
- **C-27 / C-04 / C-05** — Days 16–21 (144 h) must hold the six named Phase-2 thermal stages.
  Taking the register's own interim bands, those sum to **129–166 h**; the recorded actuals for
  conditioning-2 alone are **89–111 h**, which pushes the total to roughly **143–185 h**. The
  upper half of that range does not fit in 144 h.

552 is therefore a *nominal label for `PROCESS-2026B`*, not a property of a batch. Hard-coding
it is exactly the class of assumption `PROCESS_V2 §18` and `KIRO_BUILD_INSTRUCTIONS §1` forbid.
**Not resolved — see amendment §4.1.** Registered as **C-34**.

### C. §6/§7 — "H0" is undefined

Midnight of the start date, or the moment the first weighment load starts? The walkthrough's own
Day-0 example begins at **08:10**. `generate_activity_plan` currently assumes midnight. §7's
worked example (`BATCH HOUR 126/552 · PLANNED 08:00 · ACTUAL 09:14`) only makes sense if H0
carries a time. This single undefined term blocks all of item A. Registered as **TBD-44**.

### D. §15 + the lab document vs §20 and `ROLE_AND_APPROVAL_MODEL` — who approves lab work

- `lab_technician_batch_process.md` §15: **every** lab activity is submitted to the **GM** for
  approve/reject.
- The contract §20: *"GM is NOT a per-operator task approval queue."*
- `ROLE_AND_APPROVAL_MODEL.md`: *"The GM does not approve operator activities … at ~10
  concurrent batches × 17 activities × 2–3 lines, GM-per-task is ~400 open approvals at any
  moment."* The GM holds **four decision checkpoints**; the **Supervisor** holds
  release/hold/return.

The contract carries both positions in the same document, and the factory has now stated the GM
position directly in the lab dictation. **This is a genuine factory-vs-design conflict and it is
not resolved here.** Registered as **C-32**.

### E. The lab day-map disagrees three ways: lab document vs `PROCESS-2026B` seed vs S4b

| Point | Lab document (new) | Repo seed `s08` | S4b / `LAB_MODEL §3` |
|---|---|---|---|
| Day 0 raw material | moisture, pH, **dry weight** | **no Day-0 lab activity** | `RAW_MATERIAL` checkpoint (cols R–BG) |
| Day 1 | **four** checks — wetting, hopper 1, hopper 2, before bunker loading | **one** (`LAB-FIB-MOISTURE-1`) | `BAGASSE_BL`, one group |
| Day 4 | **four** — unloading, before hopper pass, reloading, paddy weighment | **one** (`LAB-FIB-MOISTURE-2`) | `BAGASSE_RL`, one group |
| Soaks D5–D7 | **three** (soak-pit water, once per soak) | **three** (`LAB-LAGOON-1/2/3`) | **six** — before **and** after each soak |
| Nitrogen source | N + Ash **on arrival** and again **on unload from bunker** | **no nitrogen-source lab activity at all** | inside `RAW_MATERIAL` only |
| Day 8 | flipping (moisture, pH); **moisture after T0, T1, T2** + optional average; **bunker height** | one full panel per bunker line | `F3` MC and `T0` MC as separate checkpoints |
| Day 12 | shrunken height, moisture, **conditional water then re-check pH/EC/moisture** | one panel, no conditional retest | `BUNKER_RELOAD_1` / `_2` |
| Day 15 | **tunnel height** before loading | no height parameter | `TUNNEL_LOAD` |
| Day 22 | **shrunken height** + actinomycetes | actinomycetes present, **no shrunken height** | `COMPOST_OUT` |

**TBD-36** asked exactly this and is now *partly* answered — but the lab document's map does not
match S4b's 18 checkpoints on count or placement. **Both maps must be carried as separate seeds
with conflict markers. Do not merge them.** Registered as **C-33**.

### F. Lab document Day-8 "average moisture" vs per-pile execution

`PROCESS-2026B` runs T1 and T2 **per pile** (3 piles). The lab document treats turnings as
batch-level and offers *"an average moisture value may also be calculated."* Averaging across
piles destroys exactly the spread S3f named as a root cause (9 / 14 / 10 h to temperature on
three parallel lines). One reading per pass (3) or one per pile per pass (9)? Registered as
**TBD-42**.

### G. §11 states disputed numbers without their conflict markers

- **H120–H144 paddy soak "8–10 hours"** is **C-23 🔴** — walkthrough says 8–10 h, SOP says 2–3 h.
- **Day 0 "TARGET = 21 MT"** is **TBD-20** — 21 MT vs the historical 66.66 MT.
- **H288 moisture decision** is **C-01 / C-29** — 68–69 % vs 75–78 %, still open. The lab
  document also implies a hard threshold exists ("if moisture is below the required threshold").

Stated bare in the contract, these will be seeded as fact. Each needs its marker.

### H. §5.2 / §8 / §21.1 make the monthly schedule the product's entry point — it sits on a 🔴

**C-19**: the day-numbering base has moved. **C-20**: *"the monthly schedule may no longer map
to the process."* **C-18**: the schedule vocabulary is not stable across months.
`DOMAIN_MODEL §3` (schedule token → stage mapping) is marked **SUSPENDED**.

The contract makes "select a scheduled batch from the monthly schedule" step one of the whole
flow. Nothing in the repo implements a schedule entity, and the mapping that would make one
meaningful is an open blocking conflict. **This cannot be built as though resolved.**

### I. §13's own scope list violates §9.2

The contract lists `MATERIAL_LOAD` and **`PADDY_SOAK`** as scope types. `PADDY` is a material
name. The repo enum is `MASTER, LOAD, BUNKER_LINE, PILE, STRAW_PILE, TUNNEL, INDIVIDUAL_BATCH`
— already material-agnostic. Align the contract to the repo, not the reverse.

### J. §11 prose is written entirely in material names

"Bagasse", "Paddy", "Chicken Manure", "Gypsum". §9.2 forbids this in the process definition and
the database enforces it. §11 is fine **as an instantiated example** — but it is not labelled as
one, and it is the section Kiro will read as the seed specification. It needs a banner.

### K. §22 daily report vs the contract's own §6

§6: *"a day is a grouping window, not a single activity"*; activities cross boundaries. The
walkthrough: *"the schedule is not necessarily one activity = one calendar day."* A frozen
24-hour report will double-count every straddling activity, and the boundary itself is undefined
— factory calendar day, shift boundary (**TBD-10**, open), or batch-hour multiple of 24?
Registered as **TBD-43**.

### L. §26 "the first demo may stage/seed some lab data"

In direct tension with `KIRO_BUILD_INSTRUCTIONS §1`'s non-negotiable against demo-only fake
state, and with the repo's own refusal to render placeholder workflow. Amendment proposed in
§4.10; not resolved here.

### M. §20 asserts six roles including Manager as settled

**TBD-9** (is Compost Manager distinct from Supervisor?) and **TBD-11** (does a Manager role
exist at this factory today?) are both open. The enum already carries six roles — fine — but the
contract presents the Manager's authority as factory truth. It is a design decision awaiting
confirmation.

### N. `process_definition.total_days = 22` vs "23 days"

Cosmetic but it will propagate: the seed stores `22` meaning *last day index*; the contract
computes 23 × 24 = 552 from *day count*. One of the two must be renamed.

---

## 3. What is MISSING — the contract requires it, the repo has nothing

Ordered by what blocks what.

### 3.1 🔴 Migration `0004` does not exist

`master_batch`, `batch_activity`, `batch_activity_value`, `batch_activity_evidence_req`,
`batch_material_role`, and the `activity_state` / batch-status enums are referenced by
migrations 0005–0010, by all nine seeds and by every screen — and are **created by no file in
`supabase/migrations/` and by no commit in git history** (`git log --all` finds nothing named
`0004`).

`npm run db:migrate` against a clean Supabase project fails at `0006_execution.sql`
(`alter table public.batch_activity`). The live database has these tables because they were
applied out of band. **The repository is not reproducible.** Nothing else should be built until
this is fixed.

### 3.2 🔴 `evaluate_gates` — the gate engine is seeded and never run

`s04_gates_evidence.sql` seeds `PREDECESSOR` rules with `SAME_SCOPE_INSTANCE` bindings for 14
activities, a dedicated `TR-T2 ← TR-T1 SAME_SCOPE_INSTANCE` rule, two `COMPOSITE` rules with
`ALL_INSTANCES` / `ANY_INSTANCE` sub-rules, plus `EVIDENCE` and `LIMIT` rules carrying
`mapping_confidence`. **No function reads `gate_rule`.** `generate_activity_plan` reads it only
to write a nicer blocked-reason string.

What actually gates progression, in `advance_batch`:

```sql
and not exists (select 1 from batch_activity earlier
                where earlier.master_batch_id = ba.master_batch_id
                  and earlier.rel_day < ba.rel_day
                  and earlier.state not in ('COMPLETED','SKIPPED'))
```

A global day barrier. Contract §17's *"must NOT become ALL T1 → ALL T2"* is what the code does
today. `DEMO_PLAN_V2` acceptance criterion 15 fails.

### 3.3 🔴 Evidence has no media, no storage, and no ownership check

No storage bucket, no `evidence_media` table, no upload path anywhere in `src/`.
`mark_evidence(p_req)` increments `satisfied_count` by one. It records no file, no path and no
uploader binding, and **performs no role or ownership check** — any authenticated user can
satisfy any requirement on any batch. Contract §14 and integrity rule §25.4 are unmet, and this
is a security defect as well as a feature gap.

### 3.4 Laboratory execution subsystem — absent

`lab_spec`, `lab_method` and `phase2_control_band` (reference data) exist and are well seeded.
`lab_checkpoint`, `lab_sample`, `lab_test`, `lab_result`, `lab_instrument` — the entities
`LAB_MODEL §2` specifies and contract §15 requires — **do not exist**. The lab today is nine
rows in `batch_activity` with a `lab_parameters text[]`. No versioning, no supersede, no
retest, no instrument/calibration binding, no decision on a result.

### 3.5 Deviation — no entity

A deviation is a `state` value plus free-text `blocked_reason`. There is no deviation record,
no id, no raiser, no reviewer, no resolution, no corrective action, no `ACCEPT_WITH_DEVIATION`.
`ROLE_AND_APPROVAL_MODEL §7` defines the lifecycle in full; nothing implements it. Contract
§16, §21.6 and §22 depend on it.

### 3.6 Resource occupancy — no model

No `location_occupancy` / vessel-stint table. `validate_batch`'s `VESSEL_DOUBLE_BOOKED` check
is a **±2-day heuristic on `planned_start`** against other batches. It cannot express
**TBD-29** (is a source bunker released at start of unload or end of reload?), cannot express
straw occupancy (**C-24**, **TBD-28**), and cannot be enforced. `btree_gist` is installed in
`0001` for exclusion constraints that were never written. Demo criterion 19 fails.

### 3.7 Machine utilization ledger — no model

No `machine_usage` / `machine_stint`. Contract §19 and demo criteria **16** (one turner cannot
do T1 and T2 on the same pile — currently checked in `validate_batch` by hand, not by an
exclusion constraint) and **20** (machine hours derived, no editable hours field) both fail.

### 3.8 Monthly schedule — no entity

See conflict **H**. `src/routes/ScheduleBuilder.tsx` is the *per-batch Day-0 schedule editor*,
not the factory monthly schedule. Nothing imports `June'2026 Schedule.xlsx`.

### 3.9 Event model — `fn_audit()` is defined and attached to nothing

`0001` creates the trigger function. **No `create trigger` uses it.** All audit rows come from
~8 hand-written inserts inside RPCs. Of contract §24's 21 event types, roughly 6 exist.

### 3.10 Everything management-facing

Contract §21 (all six areas), §22 daily report, §23 forecast, §20 GM decision packages.
`LabQueue`, `ControlRoom` and `CommandCenter` are honest placeholders; `Resources` shows
reference data only. **This is the part the contract calls "the main product value" and it is
0% built** — correctly, because it must read a production record that does not yet fully exist.

### 3.11 Outcome link (§12)

`individual_batch`, `growing_room`, tunnel charge, harvest break — absent. `INDIVIDUAL_BATCH`
exists in the scope enum, used only by the `ROUTE-2026A` SOP reference seed.

### 3.12 Verification infrastructure

`vitest` and `fast-check` are dependencies. **There are zero test files** — `npm test` passes
vacuously. `node_modules` is not installed and there is no CI. The 23 acceptance criteria in
`DEMO_PLAN §7` and `DEMO_PLAN_V2 §3` exist only as prose. `DEMO_SPRINT_ORDER §0.2` already
records two broken npm scripts.

---

## 4. What I would change in the contract

### 4.1 Stop treating 552 as a property of a batch

Keep "552-hour control tower" as the product's name. Do **not** let `552` or `23` enter the
schema. The baseline length is **computed** from the process definition plus the Day-0 answers;
when the computed baseline is not 552 h, show that rather than clamp it. This is the same rule
the repo already applies to load counts, pile counts and tunnel counts, and conflict **B** shows
the overflow is real, not hypothetical.

### 4.2 Define H0 as a stored timestamp

Add `master_batch.start_at timestamptz` (Admin picks date **and** time at Day-0). Give
`process_activity` a `standard_start_hour` / `standard_end_hour`. Then
`planned_start_at = start_at + standard_start_hour`, and both of §7's time systems derive from
one column. Keep `rel_day` as a **derived** value over the hour axis — do not delete it; 34 seed
rows and every screen order by it.

### 4.3 Fix §13's scope list

`MATERIAL_LOAD` → `LOAD`; **delete `PADDY_SOAK`** — it names a material and violates §9.2. Use
the repo's existing enum verbatim.

### 4.4 Make §14 unsatisfiable by a counter

State explicitly: evidence is a **file** in private storage with a server timestamp, an uploader
bound from the JWT, and a path; satisfaction of a requirement is a *consequence* of a stored
object, not an independent flag. As written, §14 is satisfied by
`satisfied_count = satisfied_count + 1` — which is what shipped.

### 4.5 Add a §16.1 naming the gate engine

*"`evaluate_gates` is the single state-transition entry point; it reads `gate_rule`; no other
function may encode a progression rule."* Without that sentence the contract is compatible with
the day barrier that exists today. This is the highest-leverage edit in the document.

### 4.6 Split the GM question explicitly (conflict D)

Put it in the existing **frozen demo decisions** table in `KIRO_BUILD_INSTRUCTIONS §0.5`, in the
same shape as the other five — a demo decision, marked as such in the UI, with the factory
question recorded as still open. Do not let the contract assert both positions.

### 4.7 Add a section the contract does not have: conflict surfacing

The repo's most valuable existing behaviour — 31 conflicts + 41 TBDs, FK-enforced markers,
`validate_batch` emitting every TBD a plan touches, and the rule that a disputed value renders
with its ID at the point of use — appears in the contract only as a half-line in §25.9. It
deserves a numbered section with the UI rule stated.

### 4.8 Add the positive rule to §27

§27 lists what not to hard-code but never states the rule that already holds and is demo
criterion 22: **changing the process — adding an activity, changing a duration, adding an
evidence requirement — is a seed-SQL change with zero application-code change.**

### 4.9 Do not replace the acceptance criteria — merge them

§31's 26 items are good but softer than what exists. `DEMO_PLAN §7` (13) and `DEMO_PLAN_V2 §3`
(14–23) hold the sharp ones — **15** (T2 on pile 2 while piles 1 and 3 are still in T1), **16**
(turner clash refused by an exclusion constraint, *not by the form*), **20** (machine hours
derived, no editable field), **21** (`variance_minutes` generated, never written), **22**
(seed-only process change). Those five are exactly the ones failing today. Keep them.

### 4.10 Tighten §26

"May stage/seed some lab data" → "historical/closed batches only; the live demo batch's lab data
is produced by the lab flow or is absent."

---

## 5. New conflict register entries

To be merged into `SOURCE_CONFLICTS.md` as Part 4. IDs continue the existing sequence.

| ID | Severity | Question | Blocks |
|---|---|---|---|
| **C-32** | 🔴 | **Who approves a lab submission?** The lab dictation says the GM approves/rejects every one. `ROLE_AND_APPROVAL_MODEL` says the GM never approves per-activity work (~400 open approvals at scale) and the Supervisor holds release/hold/return. Both appear in the proposed contract. | Lab step; GM screens |
| **C-33** | 🔴 | **Which lab checkpoint map is authoritative?** The lab dictation's day map, the repo's 9 seeded lab activities, and S4b's 18 column-derived checkpoints disagree on count and placement at Day 0, Day 1, Day 4, the soaks, the nitrogen source, Day 8, Day 12, Day 15 and Day 22. Partly answers TBD-36 and partly contradicts it. | Lab step; seed structure |
| **C-34** | 🟠 | **Is the baseline a fixed 552 h?** Contradicted by TBD-21 (rest durations unstated, no default) and by C-04/C-05/C-27 (Phase-2 stages sum to 129–166 h nominal, 143–185 h against recorded actuals, inside a 144 h window). | Time model; forecast |
| **TBD-42** | 🟠 | **Day-8 turning moisture: one reading per pass (3) or one per pile per pass (9)?** The lab document offers an "average" that would hide the per-line spread S3f identified as a root cause. | Lab plan; Day-8 activities |
| **TBD-43** | 🟠 | **What is the daily-report boundary?** Factory calendar day, shift boundary (TBD-10 open), or batch-hour multiple of 24? Activities routinely straddle whichever is chosen. | Daily report |
| **TBD-44** | 🟠 | **What is H0?** Midnight of the start date, or the first weighment load's start time (08:10 in the walkthrough)? | Everything hour-based |
| **TBD-45** | 🟡 | **Does the lab record a dry weight at Day 0 and at paddy weighment?** The lab document says yes; no S4b column and no seeded parameter exists for it. | Lab parameter catalogue |
| **TBD-46** | 🟡 | **Bunker height, tunnel height and shrunken height — lab or operational?** `LAB_MODEL §3` calls fill height *"operational, not lab"* and puts it on occupancy. The lab document assigns all three to the technician. | Lab vs operator field split |

---

## 6. What must NOT be thrown away

Recorded because a restructure is the moment these get lost.

1. The **material-name `CHECK` constraint** on `process_activity.code`.
2. The **six-column model** as three separate columns on `batch_activity_value`.
3. **`conflict_register` as a table with FK-enforced markers**, and `validate_batch` emitting
   every TBD a plan touches.
4. The **JWT role claim via `custom_access_token_hook`** and `revoke insert/update/delete` on the
   batch tables — the write boundary.
5. `batch_activity_reason_required` — the CHECK that makes a silent blocked row impossible.
6. The **server-clock rest gate** (`unblocks_at` + `advance_batch`) and the three defects `0008`
   documents. Those were paid for once.
7. `evaluate_cardinality`'s **remainder tail** (21 MT / 2 MT → ten 2.0 loads + one 1.0 load).
8. `set_activity_plan`'s **whitelist** — code, day, order, scope and dependencies are unreachable
   through it, which is what keeps the shape fixed and the content the admin's.
9. The **seeded `gate_rule` rows** — 25+ correct rules waiting for an engine. Do not regenerate
   them; write the engine that reads them.
