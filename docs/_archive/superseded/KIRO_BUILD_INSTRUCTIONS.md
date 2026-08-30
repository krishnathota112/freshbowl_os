> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# KIRO BUILD INSTRUCTIONS — MushroomOS v2

**Audience:** Kiro running Claude Opus 5 at xhigh reasoning.
**Status:** authoritative work order. Build exactly this, in this order.

---

## 0. Read before writing any code

Read these in order. They are the specification; this document is the work order.

| # | Document | What you need from it |
|---|---|---|
| 1 | `PROCESS_V2_FACTORY_CONFIRMED.md` | **The process.** The 36-row activity register in §17 is your seed data. §18 lists what must be configurable. §19 locks terminology. |
| 2 | `DOMAIN_MODEL.md` §8, §9 | **The process engine.** Three layers, cardinality rules, gate rules, scopes. |
| 3 | `RESOURCE_MOVEMENT_MODEL.md` | Locations, occupancy, movements, the visualisations. |
| 4 | `MACHINE_UTILIZATION_MODEL.md` | Machines as contended resources; the usage ledger. |
| 5 | `EVIDENCE_CONFIGURATION_MODEL.md` | Named requirements, not photo counts. |
| 6 | `ARCHITECTURE_V2.md` | Supabase, the write boundary, offline, security. Unchanged and confirmed. |
| 7 | `WORKFLOW_MODEL.md` | States, gates, events, deviations, the four GM checkpoints. |
| 8 | `ROLE_AND_APPROVAL_MODEL.md` | Six roles, authority matrix, decision packages. |
| 9 | `LAB_MODEL.md` | Sample → test → result → validation → retest. |
| 10 | `BATCH_CREATION_SPEC.md` | The Day-0 wizard. |
| 11 | `SOURCE_CONFLICTS.md` | **31 conflicts, 41 TBDs. You must preserve every one.** |
| 12 | `DEMO_PLAN_V2.md` | What the demo must show; acceptance criteria 14–23. |
| 13 | `ADMIN_CONFIGURABILITY_MODEL.md` | **Material roles.** Why the process cannot name a material. What Admin may change freely vs. what needs GM publish. |
| 14 | `UI_DESIGN_SPEC.md` | Tokens, the five-layer node, the production graph, the per-role quality bar. |
| — | Admin screen mockups | https://claude.ai/code/artifact/acf656c9-fcd1-4a5b-b7cb-af915ce95953 — approved, do not redesign |

---

## 0.5 FROZEN PRODUCT DECISIONS — client, 20 Aug 2026

These five are **decided**. Build them exactly. They are demo decisions where the underlying
factory question is still open — mark them as such in the UI, do not present them as factory
truth.

**1 · Hopper pass mode — auto-selection DISABLED**

The dry-vs-water decision changes the physical action, and the threshold is unresolved
(C-01 / C-29). Day-0 configures the expected mode per hopper-pass activity:

```
Hopper Pass Mode
  ○ Water Pass
  ○ Dry Pass
  ○ Auto — disabled pending factory confirmation      [greyed, not selectable]

  Current moisture reading shown beside it, with both candidate bands (68–69 % / 75–78 %)
```

Admin selects. The operator still **records actual moisture**, and the system stores it for
later comparison against SOP and lab ranges. **Do not invent an automatic threshold.**

**2 · Rest durations — Day-0 configurable, mandatory**

Rest activities (Days 2–3, 10–11, 13–14) take a Day-0 duration. **No default. Required before
activation.** Amber `TBD-21` marker on the field, but the batch still runs.
**Do not silently convert "two rest days" into 48 h.**

**3 · Reload — ONE reload on Day 12**

`PROCESS-2026B` has one Phase-1 reload, per the walkthrough. The historical multi-reload
structure stays as a **separate process definition**. `ROUTE-2026A` = historical / SOP
reference. `PROCESS-2026B` = current demo operational process. **Never merge them silently.**

**4 · Bagasse quantity — 21 MT target, load count calculated**

```
Target             21 MT
Expected load size  2 MT
Estimated loads    ceil(21 / 2) = 11
```

Execution accumulates actuals (2.08, 1.96, …) into cumulative and remaining.
**Never store 10 or 11 as a rule.**

**5 · Days 16–21 — tunnel monitoring stays**

Not blank rest days. Show the named thermal stages — conditioning · heating · pasteurisation ·
cooling · conditioning · final hold — with configured monitoring. **But** the disputed bands
(C-04, C-05, C-17) are **configuration-driven and visibly sourced**, not hard-coded gates.
A disputed value renders with its conflict ID.

---

## 0.6 TWO ADDITIONAL REQUIREMENTS — client, 20 Aug 2026

**A · Admin needs far broader option selection.**

*"instead of bagasse they may use mustard."* Therefore **no material name appears anywhere in
the process definition.** Activities bind to **roles** (`PRIMARY_FIBRE`, `SECONDARY_FIBRE`,
`STRUCTURAL_STRAW`, `NITROGEN_SOURCE`, `MINERAL`, `PH_CORRECTOR`); Day-0 binds materials to
roles; labels resolve from templates (`{role_lead} Weighment` → "Bagasse Weighment" or
"Mustard Weighment"). Streams generate only when their role is filled.

Read `ADMIN_CONFIGURABILITY_MODEL.md` in full before writing the seed. §3 gives the code
mapping from the `PROCESS_V2 §17` register to role-based codes. **Seed the role-based codes.**

**B · The UI must be genuinely good for every role — not just Admin.**

*"it should not look sloppy."* `UI_DESIGN_SPEC.md` is binding: fixed tokens, the **five-layer
node** (SOP → Plan → Actual → Evidence → Decision) as one component reused everywhere, the
**production graph** as the spine of the batch view, and the per-role quality bar in §4.
§6 of that document is a ten-point checklist you will be held to.

The application must read as a factory operating system, not a prettier spreadsheet.

---

## 1. Non-negotiables

Violating any of these means the build is wrong, regardless of whether it runs.

1. **No hard-coded counts.** Not 10 loads, not 2 piles, not 3 bunkers, not 3 tunnels, not 17
   activities. Every count comes from a cardinality rule evaluated against Day-0 config.
   `grep -rE '\b(10|11) loads|pileCount = [0-9]|BUNKER_COUNT'` must return nothing.

1b. **No hard-coded material names.** `grep -riE '\b(bagasse|paddy|mustard|wheat|gypsum)\b' src/`
   must return **only** UI copy that resolves from a label template, and **nothing** in the
   process definition, schema, gate logic or seed activity codes. Materials live in the
   `material` table and bind to roles at Day-0.

2. **The process is data, not code.** Adding an activity, changing a duration, or adding an
   evidence requirement must be a seed-SQL change with **zero** application-code changes.
   You will be asked to demonstrate this (acceptance criterion 22).

3. **Every state transition is server-enforced.** `INSERT`/`UPDATE`/`DELETE` are revoked from
   `authenticated` on every process-state table. All mutation goes through Edge Functions
   calling `SECURITY DEFINER` Postgres functions. The browser is never the authority.

4. **Every action writes an audit event** in the same transaction as the change. `audit_event`
   has `REVOKE UPDATE, DELETE` from all roles.

5. **The six-column model is mandatory.** SOP value / Day-0 target / allowed variance /
   operator actual / remarks / section context. Never collapse them. Columns 1–3 freeze at
   activation; column 4 is append-only.

6. **Never invent a threshold.** If no source gives a bound, the field is recorded with
   `verdict = no_spec`. No default ranges. No "reasonable" guesses.

7. **Preserve every `[TBD]` and `[CONFLICT]`.** They live in the database as data, they are
   visible in the UI at the point they matter, and they are never silently resolved. See §7.

8. **Out-of-range never blocks recording.** It forces a remark and raises a deviation, and the
   *deviation* blocks the downstream gate. The operator can always record reality.

9. **Terminology is locked.** `PROCESS_V2_FACTORY_CONFIRMED.md §19`. "Weighment" — never
   weighing, never payment. Enforce with a lint rule over UI strings.

10. **No demo-only code paths.** Time compression is seeded timestamps. No `TIME_SCALE`.
    No mock state. No fake workflow in the frontend.

---

## 2. Stack

Fixed. Do not substitute.

```
Frontend   React 18 + TypeScript (strict) · Vite · TanStack Query v5 · Zustand
           Tailwind · react-router v6 · PWA (vite-plugin-pwa) · IndexedDB (idb)
Backend    Supabase — Postgres 15, GoTrue, PostgREST, Edge Functions (Deno), Storage, Realtime
Tooling    Supabase CLI, migrations in-repo, Vitest, Playwright, ESLint + Prettier
```

Repo layout per `ARCHITECTURE_V2.md §9`. Types are **generated** from the DB schema
(`supabase gen types typescript`) — never hand-written.

---

## 3. Build order

Twelve steps. **Do not start a step until the previous step's definition of done passes.**
After each step, report status and stop for review if anything in §7 is hit.

---

### STEP 1 — Foundation

**Build**
- Repo, toolchain, CI (typecheck, lint, migrations apply clean, tests).
- Supabase project. **[TBD-15]** — ask before reusing `omsxtifyzlldaxkeqerx`; default to a new project.
- Auth: six roles as a JWT custom claim from `profiles.role` via an auth hook.
  **Delete any offline account table.** Roles: `gm`, `manager`, `admin`, `supervisor`,
  `operator`, `lab_tech`.
- RLS: every table denies by default.
- `audit_event` + the trigger helper that writes it.
- App shell: six role layouts, route guards, PWA manifest, service worker, offline read cache.
- Design system per `UI_DESIGN_SPEC.md §1` — warm neutrals, probe-teal accent, Archivo /
  Public Sans / IBM Plex Mono, the chip and card vocabulary, both themes complete. Build
  components, do not copy the mockup HTML.
- **Build the five-layer node component now** (`UI_DESIGN_SPEC.md §2`). SOP → Plan → Actual →
  Evidence → Decision, with the role-based density variants. Every later step reuses it;
  building it once here is what stops six roles drifting into six inconsistent UIs.

**Done when**
- Six accounts log in and land on six distinct screens.
- A role cannot reach another role's data — verified by a **direct PostgREST call with a valid
  JWT**, not by clicking.
- `audit_event` cannot be updated or deleted by any role.

---

### STEP 2 — Reference data + the process engine schema

**Build**

Reference tables: `material`, `material_spec`, `material_role`, `location`, `machine`,
`vehicle`, `personnel`.

Process-definition tables per `DOMAIN_MODEL.md §8`:
`process_definition`, `process_activity`, `activity_field`, `evidence_requirement`,
`lab_requirement`, `gate_rule`, `movement_rule`, `resource_requirement`, `activity_variant`.

**Material roles** per `ADMIN_CONFIGURABILITY_MODEL.md §2–§4`. Seed the six roles and which
materials may fill each. `process_activity` carries `material_role` and `label_template`
(`'{role_lead} Weighment'`), never a material name.

**Seed `PROCESS-2026B`** from `PROCESS_V2_FACTORY_CONFIRMED.md §17`, translated to the
**role-based codes** in `ADMIN_CONFIGURABILITY_MODEL.md §3` — `FIB1-WEIGH`, not `BG-WEIGH`.
All 36 templates with stream, rel_day, scope, cardinality rule, durations, evidence
requirements, movement rules, resource requirements. Streams: `PRIMARY_FIBRE`,
`SECONDARY_FIBRE` (defined, **disabled**, TBD-39), `STRUCTURAL_STRAW`, `NITROGEN_MINERAL`,
`YARD`, `BUNKER`, `TUNNEL`.

**Seed the rest durations with NO default** — required Day-0 fields carrying a `TBD-21` marker.

**Seed the hopper-pass variants** with `auto_select_enabled = false` (frozen decision 1).

**Seed `ROUTE-2026A` with `status = 'archived'`** — the 17 SOP stages from `DOMAIN_MODEL.md §4`,
carrying all ~110 process-control limits. This is the reference layer, not an executable route.

**Seed the SOP limit mapping.** Every limit from `ROUTE-2026A` that maps onto a
`PROCESS-2026B` activity becomes a `gate_rule` with:
```
mapping_confidence ∈ { 'dictated', 'sop_direct', 'sop_inferred', 'unmapped' }
is_enabled = (mapping_confidence IN ('dictated','sop_direct'))
```
`sop_inferred` and `unmapped` load **disabled**. Produce a report listing every mapping for
human review — this is conflict **C-28** and it is the largest reconciliation surface.

Seed `lab_spec` (S4a Tables 1–3), `lab_method` (8 methods), `phase2_control_band` (S1c's 7 bands).

**Done when**
- `SELECT count(*) FROM process_activity WHERE process_definition = 'PROCESS-2026B'` = 36.
- Every activity has its cardinality rule, duration targets and evidence requirements.
- **No material name appears in `process_activity`** — verified by query, not by eye.
- Binding mustard instead of bagasse to `PRIMARY_FIBRE` produces the same activities with
  labels reading "Mustard Weighment", "Mustard Hopper Pass 1" — **with zero code changes**.
- The SOP mapping report exists and every row is classified.
- Changing a duration in seed SQL and re-running migrations changes the process — no code touched.

---

### STEP 3 — Batch tree + Day-0 configuration schema

**Build**
- `master_batch`, `formulation`, `formulation_line`, `material_lot`
- `bunker_line`, `pile`, `paddy_pile`, `individual_batch`
- `batch_process_config` — the Day-0 answers: counts, capacities, options
- `batch_activity` (full shape per `DOMAIN_MODEL.md §8.6`), `batch_activity_value` (six columns),
  `batch_activity_evidence_req`, `batch_movement_plan`, `batch_resource_plan`
- `location_occupancy` + the exclusion constraint (`RESOURCE_MOVEMENT_MODEL.md §3.1`)
- `machine_usage` + its exclusion constraint (`MACHINE_UTILIZATION_MODEL.md §3`)
- `material_movement`
- `schedule_period`, `schedule_slot`, `schedule_slot_day`

**Critical:** `batch_activity.duration_actual_min` and `variance_minutes` are
`GENERATED ALWAYS`. `machine_usage.duration_minutes` is `GENERATED ALWAYS`. There is **no**
writable duration column anywhere.

**Done when**
- Two overlapping occupancies of the same bunker are refused by the database.
- Two overlapping stints of the same machine are refused by the database.
- No table has a writable duration or utilisation-hours column.

---

### STEP 4 — Schedule import + Admin Today + Slot preview

**Build**
- Importer for the monthly sheet. Columns → slots, cells → slot days. **Unmapped tokens go to
  a review queue — never guessed.**
- **Slot supplies identity only** — batch numbers, start date, route. Per-activity dates are
  generated from `PROCESS-2026B`. Surface conflict **C-20** on the preview screen.
- Admin **Today**: starting today / running / needs me. Per approved mockup screen 01.
- Monthly schedule grid, read-only. Screen 02.
- Slot preview showing the generated 23-day plan. Screen 03.

**Done when**
- Import a month; the target slot exists with its batch numbers and start date.
- The preview shows Day 0 → Day 22 generated from the process definition, and states plainly
  that dates come from the process, not the sheet.

---

### STEP 5 — Day-0 configuration wizard

**Build** — eight steps, per `BATCH_CREATION_SPEC.md` and mockup screens 04–09.

1. **Identity** — inherited fields marked, override requires a reason
2. **Materials + structure + load plan** — the **material-role binder** first
   (`ADMIN_CONFIGURABILITY_MODEL.md §2`): which materials fill `PRIMARY_FIBRE`,
   `SECONDARY_FIBRE`, `STRUCTURAL_STRAW`, `NITROGEN_SOURCE`, `MINERAL`, with proportions and
   a role lead. Binding a role **enables its stream**; leaving one empty suppresses it.
   Then `required_mt` per role, `expected_load_capacity_mt`, `bunker_line_count`,
   `yard_pile_count`, `straw_pile_count`, `tunnel_count`.
   **Live instance-count preview** that recalculates on every change, and shows the delta —
   "binding wheat to SECONDARY_FIBRE adds 6 activities and 1 bunker occupancy".
3. **Formulation** — clone-from-previous, live N% / Ash% / C:N against the historical band,
   raw-material assay range check against S4a Table 1
4. **Resources** — bunkers, tunnels, **machines**; live conflict detection against every other
   batch's occupancies, reservations and machine stints
5. **People**
6. **Operator plan** — the six-column table across all ~36 activities. Includes evidence
   requirement editing and variant configuration.
7. **Lab plan** — 18 checkpoints, specs from `lab_spec`. **[TBD-36]** the activity mapping is
   open; show it as open.
8. **Process options** — `reload_2_included` (default **OFF**, **C-25**), paddy soak count,
   lime correction, probe intervals, video-allowed flags

Then **Validate** (blocking / warning / info, unresolved conflicts listed honestly) and
**Review**. Screens 10–11.

**Done when**
- Setting 21 MT ÷ 2 MT produces 11 load instances in the preview; 2.5 MT produces 9.
- Changing bunker lines from 3 to 2 regenerates the whole plan preview.
- Swapping the `PRIMARY_FIBRE` lead from bagasse to mustard relabels the whole stream.
- Assigning `TURNER-01` to both T1 and T2 shows a conflict at configuration time.
- Every rest activity refuses activation until a duration is entered, with the `TBD-21` marker.
- Hopper mode is a manual Day-0 choice; the **Auto** option renders greyed and unselectable.
- Activation is refused while any blocking finding exists.

---

### STEP 6 — `generate_activity_plan` + `activate_batch`

**Build** — the two functions that turn configuration into a frozen baseline.

```
generate_activity_plan(batch_id) → preview, no writes to live state
  FOR each process_activity IN definition ORDER BY seq:
    IF not enabled by batch_process_config → skip
    instances := evaluate_cardinality_rule(rule, batch_process_config)
    FOR each instance:
      build batch_activity {scope, scope_id, instance_no, planned_start/end,
                            duration targets, responsible_role, source/dest location}
      build batch_activity_value rows  -- cols 1–3 from the definition
      build batch_activity_evidence_req rows
      build lab_test templates
      build batch_resource_plan + batch_movement_plan rows

activate_batch(batch_id)  -- ONE transaction
  assert admin AND gm checkpoint-1 decision exists
  assert validation report has zero BLOCKING
  materialise everything generate_activity_plan produced
  freeze: cols 1–3 and evidence requirements become immutable (trigger-enforced)
  convert reservations → location_occupancy locks
  first activity → READY
  emit BATCH_ACTIVATED; create raw-material lab tasks
  write audit_event with baseline hash
```

**Done when**
- Activating the demo batch creates ≈72 activity instances and ≈34 lab samples in one transaction.
- A direct PostgREST `PATCH` on a frozen `batch_activity_value.sop_value` returns 403.
- A failed activation leaves **no** partial state.

---

### STEP 7 — `evaluate_gates` + operator execution

**Build**

`evaluate_gates(scope)` — a **pure Postgres function over current state**. Idempotent.
Returns `(new_state, blocked_reason_code, blocked_reason_text, unblocks_at)`.
A `CHECK` constraint enforces `blocked_reason_text IS NOT NULL` for every non-actionable state.

Gate kinds: `PREDECESSOR` (with `predecessor_binding`), `ELAPSED_TIME`, `TIME_WINDOW`,
`SENSOR_THRESHOLD`, `EITHER_OR`, `BOTH`, `LAB_RESULT_PASS`, `EVIDENCE_COMPLETE`,
`FIELD_IN_RANGE`, `MACHINE_STINT_CLOSED`, `MOVEMENT_VALID`, `SUPERVISOR_RELEASE`,
`GM_APPROVAL`, `MANUAL_OVERRIDE`.

> **`predecessor_binding = 'SAME_SCOPE_INSTANCE'` is the T1 → T2 requirement.** Pile 2's T2
> waits only on pile 2's T1. Building this as a global barrier is a failed build.

`submit_activity(activity_id, values[], evidence_ids[], idempotency_key)` per
`ARCHITECTURE_V2.md §3.1`, plus: assert all machine stints closed, assert all gating evidence
requirements satisfied, write `material_movement` if the activity moves material.

`start_machine_stint` / `end_machine_stint` — server timestamps only.

`record_movement` — enforces `movement_rule.requires_distinct_vessel`.

`select_activity_variant` — for the conditional hopper passes. **The auto-selection rule ships
DISABLED** (conflict **C-29**): show the measured value and both candidate bands, operator
chooses, reason mandatory.

**Operator UI**
- **My Work** — assigned tasks, scope visible (`MB · Line 2 · Bunker 3`), blocked reasons rendered
- **Task screen** — target, previous batch's actual, golden rule, one input at a time
- **Weighment screen** — the running-total component from `PROCESS_V2 §2`:
  `TARGET / LOADED / REMAINING / LOADS n of N` with a progress bar
- **Evidence capture** — one slot per named requirement, `n / N uploaded`, submit disabled until complete
- **Machine start/finish** — pre-filled from the resource plan
- **Time gates** — `RESTING · started · required · remaining`
- Offline write queue with idempotency keys; blobs in IndexedDB; server timestamps only

**Done when**
- Out-of-range submission **succeeds**, requires a remark, raises a deviation.
- Airplane mode → 3 submissions + 6 photos → reconnect → exactly 3 and 6.
- A device clock 48 h fast does not open a time gate.
- Pile 2's T2 becomes READY while piles 1 and 3 are still in T1.
- `NM-ROTAVATE` cannot submit at 2 of 3 evidence, and the outstanding item is named.
- A reload with destination = source is refused with the rule quoted.

---

### STEP 8 — Lab

Per `LAB_MODEL.md`. Auto-generated samples, versioned results, derived C:N and TDS,
instrument + calibration status, retest with mandatory reason code, sensory results as
enumerated values with mandatory photos.

**Done when** a submission auto-creates a sample with no human action; a FAIL blocks a named
downstream activity with a reason naming parameter and bound; a retest yields v2 with v1
preserved and visible; C:N and TDS cannot be typed; no-spec parameters get no verdict.

---

### STEP 9 — Supervisor Control Room

Per `ROLE_AND_APPROVAL_MODEL.md §3`. `supervisor_decide` with release / hold / return /
accept-with-deviation / request-override, each with mandatory reason, each writing a `decision`
and an `audit_event`. Protected gates refuse supervisor waiver. Urgency-ordered board.
Realtime subscriptions.

**Done when** a release moves the next activity to READY within one realtime tick; a protected
gate cannot be waived at the function level; accept-with-deviation resolves the block but the
deviation stays open and appears in the next GM package.

---

### STEP 10 — GM checkpoints + decision packages

Four checkpoints re-anchored to the new numbering: **activation · Day 4 reload · Day 15 tunnel
loading · Day 22 tunnel out**. Nine-section package per `ROLE_AND_APPROVAL_MODEL.md §5`,
snapshotted on decision. `gm_decide` with approve / approve-with-conditions / return; conditions
propagate to the affected activity as a named override.

**Done when** the package renders all nine sections from real data and is immutable after the
decision; a condition appears on the operator's task with the GM's name.

---

### STEP 11 — The production graph + movement + machine visualisation

Per `UI_DESIGN_SPEC.md §3`, `RESOURCE_MOVEMENT_MODEL.md §5`, `MACHINE_UTILIZATION_MODEL.md §4`.

- **The production graph** — the spine of the batch view, in the shape the client drew:
  streams as columns, converging into the yard, then bunkers, then tunnels. Each node is the
  five-layer component. Node height ∝ actual duration with a planned ghost behind it. Three
  zoom levels: STREAM → DAY → INSTANCE. Column count from enabled streams, never fixed.
- **Bunker swap card** at every reload — `BUNKER 03 → BUNKER 07`, via machine, plan vs actual,
  before/after evidence.
- **Yard spatial layout** — plan view, mixed pile centre, straw piles beside.
- **Vessel timeline** — Manager's Gantt; straw occupancy visually distinct but equally blocking.
- **Machine utilisation** — per batch, plan vs actual per activity, factory-wide daily load.

This is where *"proper sleek visuals which show how bunkers are switched"* and *"a factory
operating system rather than a prettier spreadsheet"* are satisfied. Give it the same care as
the data layer.

**Done when** the ten-point checklist in `UI_DESIGN_SPEC.md §6` passes on every role's
screens — not only Admin's.

---

### STEP 12 — Seed, test, deploy

Seed `DEMO_PLAN_V2.md §1`. Test suites: gate logic (exhaustive — it is a pure function),
RLS (6 roles × every table × every verb, direct against PostgREST), offline (partition during
submit / upload / retest, duplicate sync, clock skew), Playwright over the full slice.

**Done when** all 13 criteria in `DEMO_PLAN.md §7` and all 10 in `DEMO_PLAN_V2.md §3` pass on
a fresh deploy.

---

## 4. Edge Function inventory

Revoked from `authenticated` at table level; these are the only write paths.

| Function | Step |
|---|---|
| `create_master_batch` · `configure_batch` | 5 |
| `generate_activity_plan` · `activate_batch` | 6 |
| `evaluate_gates` (Postgres, pure) | 7 |
| `submit_activity` · `start_machine_stint` · `end_machine_stint` · `record_movement` · `select_activity_variant` | 7 |
| `record_lab_result` · `supersede_lab_result` | 8 |
| `raise_deviation` · `resolve_deviation` · `supervisor_decide` | 9 |
| `gm_decide` · `approve_override` · `allocate_tunnel_pooling` | 10 |

Every one is idempotent by `idempotency_key` and writes an `audit_event` in-transaction.

---

## 5. What NOT to build

- No dashboards beyond those named. No charts "because the screen looks empty".
- No growing room, spawning, casing or harvest. Out of demo scope (**TBD-37**).
- No tunnel-controller integration (**TBD-8**). `TN-HOLD` is manual entry with the SOP's
  hour-banded rules as advisory content.
- No native app. PWA only.
- No automatic batch-narrative generation.
- No historical migration in the demo path.
- No mobile-only or desktop-only codebase split.

---

## 6. The client's own words — hold these

> *"The operator should never need to understand the whole graph."* — one task, one input,
> large controls, minimal typing.
>
> *"A Master Batch is therefore a graph, not a linear checklist."*
>
> *"Do not fake the workflow in the frontend."*
>
> *"The plan remains frozen. Actual execution produces variance."*
>
> *"Bunkers are not static labels."*

---

## 7. Stop and ask

These are unresolved in the sources. **Do not invent an answer. Ship the mechanism, default it
to the safest behaviour, surface the question in the UI, and report it.**

**Five items are now DECIDED — see §0.5. Build them, do not ask again:**
C-01/C-29 (hopper mode manual), TBD-21 (rest durations Day-0 mandatory), C-25 (one reload),
TBD-20 (21 MT, count derived), C-27 (Days 16–21 monitoring retained, bands configurable).

Everything below is still open.

| ID | Question | Ship-with default |
|---|---|---|
| **C-19** 🔴 | Day-numbering base moved — Day 0 = weighment, tunnel load Day 15. Does the schedule sheet still describe this process? | `PROCESS-2026B` numbering only. |
| **C-20** 🔴 | Does the monthly schedule still map to the process? | Slot supplies identity only; dates generated. Say so on screen. |
| **C-23** 🔴 | Paddy soaks — 8–10 h (walkthrough) or 2–3 h (SOP)? | Walkthrough. |
| **C-04 / C-05 / C-17** 🟠 | Phase-2 conditioning-2 band, cooling-2 target, unload temperature — all disputed. | Configuration-driven, visibly sourced, rendered with the conflict ID. Never a silent gate. |
| **C-28** 🟠 | ~110 SOP limits mapped onto new activities. | `sop_direct` enabled; `sop_inferred` and `unmapped` **disabled**. Produce the review report. |
| **TBD-19** | 2 paddy piles or 3? | 2 straw + 1 mixed = 3 at turner. Configurable. |
| **TBD-22** | Day 4 — is "~3 h" the unload, the hopper pass, or both? | Day-0 value per activity. |
| **TBD-24** | Rest after straw bunker storage — 2 h or 12 h? | Day-0 value, required, no default. |
| **TBD-25** | Day 7 flips (2 h) and Day 8 flips (4 h) — four distinct, or two restated? | Four distinct. |
| **TBD-26** | Day 12 reload — 9 h per bunker or 9 h total? | Day-0 value, required, no default. |
| **TBD-28** | How many bunkers does straw occupy, for how long? | 1 per batch, Day-0 configurable. |
| **TBD-33** | Real fleet size? T1‖T2 needs **≥2 turners**. | Seed 2 turners, 2 JCBs, 1 hopper, 1 rotavator. |
| **TBD-34 / 35** | Weighment evidence per load; video on `FIB1-HOP-3`? | 1 photo per load; video allowed, capped 30 s / 720p. |
| **TBD-36** | Which lab checkpoints attach to which new activities? | Map the unambiguous ones; leave the rest unmapped and visible. |
| **TBD-38** 🟠 | Do durations change when a different material leads a role — e.g. mustard needs a longer pre-wet than bagasse? | Duration defaults on the **role** only. Flag the question in the Day-0 UI when a non-default material leads a role. |
| **TBD-39** | Are `Wheat wetting` / `Mustard wetting + B/L` the `SECONDARY_FIBRE` stream? | Stream defined, **disabled by default**, no activities seeded until confirmed. |
| **TBD-40** | Can `STRUCTURAL_STRAW` ever be something other than paddy? | Role allows any material; demo binds paddy. |
| ~~**TBD-15**~~ | ~~New Supabase project or reuse the old one?~~ | ✅ **RESOLVED 20 Aug 2026 — a new project.** The old `omsxtifyzlldaxkeqerx` is abandoned. |

### Credential handling — standing rule

- **No secret ever enters `docs/`, the repo, or a chat message.** Not the DB password, not the
  service-role key, not a connection string.
- `.env.local` (gitignored) holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
  Edge Functions read the service-role key from Supabase's own secret store — never from a file.
- The **database password is not an application credential.** It is used once by
  `supabase link` for CLI migrations and never appears in application code.
- A password containing `$ # @` must be percent-encoded in a connection URI, or the string
  silently truncates at the `#`. Prefer `supabase link` over hand-built URIs for this reason.
- If a secret is ever exposed, rotate first, then continue: Supabase dashboard →
  Settings → Database → Reset database password; API keys under Settings → API.

**How to surface a TBD in the UI:** a small amber marker at the point of use, linking to the
conflict ID, e.g.

```
REST REQUIRED   [ ____ ] hours     ⚠ TBD-21 — duration not specified by the factory
```

Never a silent default. Never a made-up number.

---

## 8. Reporting

After each step: what was built, what passed, which acceptance criteria are green, which §7
items were hit and how they were defaulted. **Stop and ask** on anything marked 🔴 that blocks
correct behaviour rather than merely correct appearance.
