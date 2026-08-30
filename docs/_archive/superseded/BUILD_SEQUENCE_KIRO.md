> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# BUILD SEQUENCE — KIRO · 48-HOUR THREE-TRACK BUILD

**Revision 2 — 22 August 2026.** Replaces the sequential revision of the same date.
Supersedes `KIRO_BUILD_INSTRUCTIONS.md §3` as the **order of work**. `KIRO_BUILD_INSTRUCTIONS`
§0.5 (frozen decisions), §0.6 (material roles, the UI bar) and §1 (non-negotiables) remain
binding and are **not** superseded.

**Reads before starting:** this file · `CONTRACT_AUDIT_2026-08-22.md` ·
`TIME_MODEL_CONFIRMED.md` · `UI_CONTROL_TOWER_SPEC.md` · `UI_DESIGN_SPEC.md` ·
`PROCESS_V2_FACTORY_CONFIRMED.md` · `SOURCE_CONFLICTS.md` ·
`MUSHROOMOS_V2_END_TO_END_PRODUCT_CONTRACT.md`.

---

## 0. Why three tracks are now safe

The sequential plan existed because the UI could not be built ahead of the engine without
guessing the time axis — and a wrong axis would have been baked into every component.

`Book1.xlsx` removed that risk. The axis is now a known quantity: **552 hours exactly, H0 at
05:00, 48-hour stagger, ~12 concurrent batches.**
(`TIME_MODEL_CONFIRMED.md`.)

So: **freeze the time contract first (T0, ~1 hour), then all three tracks run in parallel.**

```
        T0 · FREEZE THE TIME CONTRACT  (1 h, blocking, everyone)
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   TRACK A            TRACK B            TRACK C
   DATA / SQL         ENGINE             UI
   K0 migrations      K2 gates           StaircaseCalendar
   K1 hour axis       K4 deviations      HourRail
   K3 storage         K6 events          Narrative
   K5 resources       K7 lab logic       EvidencePanel
   seed 3 batches                        ProductionGraph
```

**Track A is the only one with a hard external blocker** (a clean Supabase project). Tracks B
and C proceed regardless.

---

## T0 · Freeze the time contract — ✅ **DONE, 22 Aug 2026**

`src/domain/time.ts` and `src/domain/time.test.ts` are written and green: 27 tests, `tsc
--noEmit` clean, `npm run build` clean. **The gate has passed — Tracks A, B and C may start.**
This section is retained as the record of what was frozen.

`docs/TIME_CONTRACT.md` is written and is **normative** — read it, do not re-derive it.
`docs/source/book1_hour_grid.json` is the extracted fixture, carrying the SHA-256 of
`Book1.xlsx`. Kiro produces two artefacts:

| Artefact | What it is |
|---|---|
| `mushroomos/src/domain/time.ts` | `batchHour`, `batchInstant`, `wallClock`, `batchDay`, `isWithinBaseline`. The only place any of these are defined. **No `BASELINE_HOURS` constant** — `src/domain/` is a pure layer and cannot read `process_definition`; the baseline arrives as a parameter. |
| `mushroomos/src/domain/time.test.ts` | The eight invariants of `TIME_CONTRACT §2`, asserted **against the fixture file** — never against hand-typed numbers. |

Co-locate the test with the module (`src/domain/`), consistent with the repo's flat layout;
`vitest` picks it up with no config change. There are currently **zero** test files, so this is
also the first thing `npm test` will ever actually run.

### Three things to get right, from `TIME_CONTRACT.md`

1. **§1.2 — the off-by-one.** Book1 "hour *n*" is the interval `[H(n-1), H(n))`. `H`*n* is an
   instant. They are not the same number. Code that conflates them is one hour wrong on every
   row in the system.
2. **§2 invariant 5** — *every* hour ≡ 1 (mod 24) falls in the same slot as hour 1. 23 boundaries
   × 3 batches = 69 assertions against real cells, which is what proves the day boundary holds
   across all 23 days rather than only at the two ends.
3. **§2 invariant 8** — a grep test asserting the process length appears nowhere in `src/` or
   `supabase/` outside seed data. On its first run it found **6 pre-existing violations**, now
   carried as an enumerated debt list in the test: `NewBatch.tsx` (1, cleared by A2),
   `api/schedule.ts` (1, A2), `ScheduleBuilder.tsx` (4, C8).

### One open question, marked not guessed

- ~~**TBD-47**~~ ✅ **CLOSED.** H0 = **05:00**. The complete grid settles it: the workbook uses
  slot 24, which the 06:00 reading cannot express (0 mismatches vs 69 of 1,656). Asserted in
  `time.test.ts`, which keeps both readings and requires one to match and the other to fail.
- **TBD-50 — the factory timezone.** New. `timestamptz` renders in the *viewer's* zone, so a
  5-hour day boundary silently moves for anyone in another zone. Store an explicit IANA
  `factory_timezone`; ask whether it observes DST (`TIME_CONTRACT §3.2`).

**Exit proof — met.** `npm test` → 27 passed. `tsc --noEmit` → clean. `npm run build` → clean.

---

# TRACK A — DATA

### A1 · `K0` Reconstruct migration `0004` — ✅ **DONE, 22 Aug 2026**

The batch layer is referenced everywhere and created nowhere
(`CONTRACT_AUDIT §3.1`). Build `supabase/migrations/0004_batch_tree.sql` containing exactly the
objects that 0005–0010, the nine seeds and `src/api/*.ts` already reference — no more:

- enums `activity_state` (the 14 values in `src/domain/types.ts`) and the master-batch status
- `master_batch`, `batch_material_role`, `batch_activity`, `batch_activity_value`,
  `batch_activity_evidence_req`
- RLS enabled on all five, with the read policies 0006 already declares
- columns later `alter table`d by 0006/0007/0008 are **not** pre-created — leave those alters
  intact so the migration history stays honest

Derive the column list mechanically from every statement that names these tables. Invent nothing.

**Exit proof — met, with one caveat.** `supabase/migrations/0004_batch_tree.sql` is written and
the full chain `0001…0010` plus all nine seeds applies clean. `scripts/counts.mjs` reports
`activities_2026b: 45` (36 operator + 9 lab_tech) and `conflict_entries: 64` (31 conflicts +
33 TBDs).

**Caveat: this was verified against the EXISTING project, not an empty one.** The tables were
already deployed, so `create table if not exists` would have silently no-opped. Verified instead
by replaying `0004` plus the `add column` statements from 0006/0007/0008 into a throwaway schema
and diffing against the live one — **92 columns across 6 tables, identical types, nullability and
defaults.** A run against a genuinely empty project is still owed.

Two things the reconstruction found that no repo file references: the table
**`batch_process_config`**, and the columns **`batch_activity.duration_actual_min`**,
**`batch_material_role.pct_of_role`** and **`master_batch.created_at`**. All are retained for
fidelity and flagged in the migration's comments. Do not build against `batch_process_config`
without asking what it was for.

### A2 · `K1` The hour axis

- `process_activity`: `standard_start_hour`, `standard_end_hour`. Seed at `rel_day × 24` so the
  existing 34 rows keep working; refine per activity as the factory supplies hours. **Where no
  hour is stated, leave NULL and mark it — do not invent a start time.**
- `master_batch.start_at timestamptz`, mandatory.
- `batch_activity`: `planned_start_at`, `planned_end_at`, `baseline_start_hour`,
  `baseline_end_hour`, and `variance_minutes` as a **generated** column
  (`DEMO_PLAN_V2` criterion 21 — generated, never written).
- Replace `(b.start_date + a.rel_day)::timestamptz` in `generate_activity_plan`. It is currently
  five hours early on every single row.

**Exit proof.** Every activity renders both `H126` and `Tue 6 AM`; changing `start_at` moves
every planned timestamp and no `rel_day`; a direct write to `variance_minutes` is rejected.

### A3 · Seed three staggered batches

Three master batches at **48-hour stagger**, per `Book1.xlsx`. Not one. The staircase
(`UI_CONTROL_TOWER_SPEC §9.1`) is the hero image and it needs more than one bar to exist.
Stage them at different positions — one early, one mid-yard, one in tunnel hold — so the board,
the rail and the exception band all have real content from the first render.

### A4 · `K3` Evidence storage

Private bucket; `evidence_media` (batch, activity, requirement key, storage path, uploader from
JWT, **server** timestamp, media kind). Replace `mark_evidence` with an RPC that binds a stored
object to a named requirement, **with the role and ownership checks that are missing today** —
any authenticated user can currently satisfy any requirement on any batch
(`CONTRACT_AUDIT §3.3`).

**Exit proof.** Criterion 17. A photo survives sign-out. A second user cannot satisfy another's
requirement — asserted by a direct PostgREST call with a valid JWT, not by clicking.

### A5 · `K5` Resources as constrained objects

`location_occupancy` and `machine_usage`, time-bounded, with **`btree_gist` exclusion
constraints** — the extension is already installed in `0001` for exactly this and was never
used. Replace `validate_batch`'s ±2-day heuristic.

**Blocked on TBD-28 / TBD-29 / TBD-33.** Model both readings as configuration; do not choose.

**Exit proof.** Criteria 16, 19, 20 — the turner clash refused by the **constraint**, not the
form; machine hours derived, no editable hours field anywhere in the schema.

---

# TRACK B — ENGINE

### B1 · `K2` `evaluate_gates` 🔴 the second structural correction

The single server-side state-transition entry point. Reads `gate_rule` — 25+ correct rules are
already seeded and **nothing reads them** (`CONTRACT_AUDIT §3.2`). Implement the kinds `s04`
already contains: `PREDECESSOR` with `ALL_INSTANCES` / `ANY_INSTANCE` / **`SAME_SCOPE_INSTANCE`**,
`COMPOSITE`, `TIME`, `EVIDENCE`, `LIMIT`.

`LIMIT` honours `is_enabled` and `mapping_confidence` — a rule that is not `dictated` or
`sop_direct` **must not auto-fail anything** (C-28).

Then: `advance_batch` delegates; **delete the `rel_day < rel_day` barrier.** It is the
`ALL T1 → ALL T2` model contract §17 forbids.

**Exit proof.** `DEMO_PLAN_V2` criterion 15 as an automated test: three piles, T1 completed
**out of order** (pile 2 first), pile 2's T2 becomes `READY` while piles 1 and 3 are still in T1.
Plus a test asserting no function other than `evaluate_gates` writes `batch_activity.state`.

### B2 · Deviations and release — ✅ **DONE, 22 Aug 2026** (`0017_deviations.sql`)

`deviation` · `corrective_action` · `gate_rule.is_protected` · `v_deviation_open`, and the
verdicts of `ROLE_AND_APPROVAL_MODEL §3.1`: `release_activity`, `hold_activity`,
`return_activity`, `accept_with_deviation`, `escalate_deviation`, `gm_decide_override`,
`add_corrective_action`, `verify_corrective_action`. `submit_activity` now writes **one
deviation row per failing field**, because §3.1 waives one failing condition at a time.

**The rule that shaped it.** §3.1: accept-with-deviation means *"deviation stays open on the
record and appears in every downstream GM package."* So `accepted` closes nothing —
`v_deviation_open.stands_on_record` is what every GM surface must read, and it counts accepted
deviations as still standing. Only a **verified** corrective action resolves one; recording the
action is a different claim from the action having worked.

**Protected gates — §3.2 names four, two are markable.** `TN-HOLD` pasteurisation and `TN-LOAD`
fill height ship protected. Ammonia has no gate (**TBD-14**) and "critical severity at a
checkpoint" has no severity model — both registered as **TBD-51**, not guessed. Until TBD-51
closes, a supervisor can accept conditions §3.2 says only a GM may pass.

**Note on the spec citation.** An earlier instruction in this file cited "ROLE_AND_APPROVAL_MODEL
§7" for the deviation lifecycle. There is no such section — §7 is *Admin*. The lifecycle is
§2, §3.1 and §3.2.

**Exit proof — met.** 12 proofs in `tests/deviations.test.ts`. Role guards are asserted in
**both directions** — an operator refused *and* a supervisor succeeding — because until
`0015_role_claim.sql` a deny-everyone policy passed every negative test. A negative alone proves
nothing about a guard.

### B3 · Events — ✅ **DONE, 22 Aug 2026** (`0018_event_trail.sql`)

Attached to nine governance tables, not to the execution tables — those are already covered
by semantic events and a row trigger there would bury the trail. `advance_batch` now writes
`gate_opened` / `rest_started` / `rest_released` with a **null actor**, because a gate has no
human behind it. `audit_event` is append-only by trigger. `v_batch_event` is the stream every
batch surface reads. Exposed and fixed a latent 0001 bug: `current_app_role()` raised on an
empty claims string, which every role check depends on. See `docs/REPORTS/B3.md`.

<!-- original heading: B3 · `K6` Events -->

Attach `fn_audit()` — defined in `0001`, **used by nothing** — to the batch tables. Add the
missing event kinds from contract §24.

**Exit proof.** A full batch lifecycle reconstructs from `audit_event` alone.

### B4 · Variance attribution — feeds the paragraph

A view that returns, per batch: total variance, and the ranked activities that produced it with
actor, machine and cause. This is what `UI_CONTROL_TOWER_SPEC §11` renders. Pure derivation from
K1 + K4; no new source data.

**Exit proof.** For the staged demo batch the top two contributors are correct against
hand-computed values.

### B5 · `K7` Lab logic

`lab_checkpoint`, `lab_sample`, `lab_test`, `lab_result`, `lab_instrument`. Results **versioned**;
`target_min/max` frozen at request time; supersede rather than overwrite.

**Carry two checkpoint maps as two seeds** — the lab dictation's day map and S4b's 18
column-derived checkpoints — each marked **C-33** wherever they disagree. **Do not merge, do not
pick.**

**Blocked: approval routing (C-32).** Whether a lab submission goes to the GM (lab dictation) or
the Supervisor (`ROLE_AND_APPROVAL_MODEL`) changes the queue, the notifications and the GM
screen. Build the submission and the state; leave the **approver configurable**; report the block.

**Exit proof.** A result is superseded by a retest with the original preserved and both visible.
A result with no spec records `no_spec` and never auto-fails (TBD-13).

### B6 · Management checkpoints 🔴 **NEW — plan defect found by B1, 22 Aug 2026**

**Why this step exists.** `s04` seeds an enabled, `dictated` `GM_APPROVAL` entry rule on
`TN-LOAD` — checkpoint 3, the Phase-1 → Phase-2 release. B1 evaluated it as written, correctly:
no approval exists, so the rule is unsatisfied and `TN-LOAD` stays LOCKED. **A batch therefore
cannot reach the tunnel.**

The approver is not in question — `ROLE_AND_APPROVAL_MODEL §1` gives the GM "approve management
checkpoint 2–4" and §5 names checkpoint 3 explicitly. **This is not a factory question.** What
was missing is a place to record the decision, and that is a gap in this build sequence. B1 was
right to report it rather than special-case the gate.

**Two separate gaps, found while writing this step:**

1. **No data step owns it.** No Track B step creates a checkpoint or an approval. That is fixed
   here.
2. **No screen owns it either.** `ROLE_AND_APPROVAL_MODEL §5` specifies a nine-section decision
   package as the GM's primary decision surface, and the product contract §20 lists it under GM
   responsibilities — but it is **not among the fourteen screens** in
   `UI_IMPLEMENTATION_PLAN.md`, and `C11` there is the `Narrative`, not a decision package.
   Adding a fifteenth screen is a scope decision for the client, so it is **flagged, not
   added**. Until it is decided, a checkpoint can be recorded by RPC but not by a human at a
   screen.

**Build**
- `management_checkpoint` — batch, checkpoint number, state, opened_at.
- `checkpoint_decision` — actor, role, decided_at, verdict
  (`approved` / `approved_with_conditions` / `returned`), reason (**mandatory**), and the
  **snapshot** of what the GM saw, per `ROLE_AND_APPROVAL_MODEL §5`: *"the GM's approval is
  bound to exactly what they saw, not to whatever the data later became."*
- An RPC to record a decision. `evaluate_gates`'s `GM_APPROVAL` branch then reads it — the
  branch already exists and needs no change to its shape.

**Do not** disable or edit the seeded `GM_APPROVAL` rule to unblock the tunnel. The rule is
correct; the recording mechanism was missing.

**Scope note.** This step builds only what RECORDS a decision — the four checkpoints and their
outcomes. The nine-section package that a GM reads before deciding is a derived view and has no
owning screen yet; see gap 2 above.

**Priority.** Nothing is blocked today: the live active batch is on Day 0–1 and `TN-LOAD` is
Day 15. This must land before any batch reaches Day 15.

**Exit proof.** A batch whose Day-12 work is complete stays LOCKED at `TN-LOAD` with the seeded
reason; after a GM decision is recorded, `evaluate_gates` opens it. A decision without a reason
is refused. The snapshot is immutable.

---

---

# TRACK C — UI

Starts at T0+1h. Builds against the typed interfaces in `UI_CONTROL_TOWER_SPEC §14`, connecting
to RPCs as Tracks A and B land them.

**The one rule.** A component may render from a typed fixture. It may **not** invent a state the
engine cannot produce, and it may **not** show a number the database will not have. Missing data
renders the stated empty state from `UI_DESIGN_SPEC §5` — never a plausible-looking fake.
`KIRO_BUILD_INSTRUCTIONS §1` item 10 is not suspended for this track.

### D-HOST · Get it reachable from a phone — **gap in this plan, found 22 Aug 2026**

Fifteen screens were sequenced and nowhere did this document say where they would run. Nothing
is hosted: no Vercel, Netlify, Cloudflare, Docker or CI config exists. The app runs on
`localhost` only, so a PWA cannot be installed and an APK has nothing to point at.

**Client decision 22 Aug: no Play Store.** ~30 users, sideloaded APK, distributed directly.

**Target shape**

```
hosted static SPA  (HTTPS)
        ^
        |  WebView loads the hosted URL
   Capacitor APK  ==  a thin launcher, sideloaded
```

The APK is a **shell pointing at the hosted URL**, not a bundle of the web assets. That way a
fix reaches thirty phones without redistributing anything. Bundling the assets inside would mean
re-installing every phone on every change, and with reliable internet confirmed it buys nothing.

**D-HOST scope — hosting only**
- A static host with HTTPS and an **SPA fallback** (every route rewrites to `index.html`; the
  app is client-routed).
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` supplied at build time.
- A deploy that runs `npm run build` — both the web and field entries.

**SECURITY PRECONDITION — do not deploy a build older than `0015_role_claim.sql`.** Before it,
`current_app_role()` returned NULL for every session and every write policy fell through the
`or current_app_role() is null` escape hatch. Publishing that would have been publishing an open
database. The publishable key shipping in the bundle is fine — RLS is the boundary — but only
now that RLS actually enforces.

**Not in this step:** Capacitor. Build the shell only once C6 exists and there is something on a
phone worth looking at. When you do: use a consistent release keystore from the first build or
upgrades require an uninstall, and each phone needs "install from unknown sources" once.

**Exit proof.** The hosted URL loads on a phone over the factory's own network, an operator can
sign in, and Chrome offers to install it to the home screen.

---

### C-FIELD · The field shell — **client decision revised, 22 Aug 2026**

**Supersedes C-SPLIT, which was written earlier the same day and is withdrawn.** The client
confirmed that operators and lab technicians have reliable realtime internet, and that the whole
user base is about **30 people**. Both facts remove the case for a second application.

**Decision: ONE application.** A field *shell* and a field *entry point*, not a second app.

| Driver for splitting | Status |
|---|---|
| Offline write queueing | **Gone** — reliable internet confirmed |
| Native camera | Not needed — `<input capture>` works in the browser |
| Bundle size on cheap Android | Solved by route-level code splitting inside one app |
| Operators must never see management screens | **Already solved** — `RoleGuard` + `ROLE_HOME` |
| Independent release cadence | Not wanted at 30 users |

**What to build instead**

- `FieldShell` — the operator/lab counterpart to `AppShell`. One task on screen, ≥48 px targets,
  no nav bar, no theme toggle, persistent offline chip. Chosen by role, not by URL.
- **PWA manifest with `start_url` at the field home**, so an operator installs a home-screen icon
  that opens straight into their work and never renders the management shell.
- **Route-level code splitting** so the field entry does not download the staircase, the
  production graph or the Gantt.
- The existing role redirect stays exactly as it is. One mapping in `lib/auth.ts`.

**Why not split anyway "to be safe".** Splitting is cheap later and expensive to undo. A
supervisor is genuinely both roles — on the floor and in the control room — and two apps force
them to switch. `OPS` in `App.tsx` already includes `supervisor` on the operator routes for
exactly that reason.

**What would justify splitting later**, any one of these: going Capacitor for native hardware ·
offline write queueing becoming real · measured bundle problems on the factory's actual phones ·
genuinely independent release cadence. **None applies today.** The move stays cheap precisely
because the core is already shared.

**Offline is out of scope.** `ARCHITECTURE_V2 §5` remains the specification if the network
assumption ever changes. Do not build the queue.

**Exit proof.** An operator signing in lands on the field shell and can reach no management
route. A management role signing in never sees the field shell. The field entry's initial bundle
excludes the tower, graph and Gantt chunks, asserted by a build-output test.

---

### C1 · Primitives — no backend dependency at all
`TimeLabel` (§8.1 three registers) · `HumanDuration` (§8.2) · `PlayheadContext` · `HourRail`
(§10) · extend `FiveLayerNode` with the management labelling of §12.

### C2 · The board
`StaircaseCalendar` + `ExceptionBand` + the four counters (§9). Sorted by start time so the
diagonal survives. One `now` line.

### C3 · The batch page
Rail + production graph + event stream on **one playhead** (§13). The graph already exists in
part; extend it rather than rewriting.

### C4 · `EvidencePanel` (§12)
Renders its stated empty state until A4 lands, then the photographs. **Management sees the
image, not the count.**

### C5 · `Narrative` (§11)
A pure function over B4's attribution view. Buildable and testable against fixtures before B4
exists. Names people and machines, quotes decision reasons verbatim, names the conflict when one
applies.

### C6 · Role surfaces
Operator `MyWork` wired to A4's real upload · Lab queue per `lab_technician_batch_process §17`
(dashboard across concurrent batches, focused current-activity view, numeric vs observational
inputs) · Supervisor Control Room on B2.

---

## Sequencing across 48 hours

| Window | Track A | Track B | Track C |
|---|---|---|---|
| 0–1 h | **T0 · freeze the time contract — everyone, blocking** | | |
| 1–8 h | K0 migration 0004 → clean rebuild | K2 `evaluate_gates` | C1 primitives |
| 8–16 h | K1 hour axis · A3 three staggered batches | K2 exit proof · B4 attribution | C2 the board |
| 16–24 h | K3 evidence storage | B2 deviations | C3 batch page, one playhead |
| 24–32 h | K5 occupancy + machine usage | B3 events | C4 evidence panel · C5 narrative |
| 32–40 h | seed depth · historical closed batches | B5 lab logic | C6 operator, lab, supervisor |
| 40–48 h | | | connect · acceptance run · polish |

### What this honestly delivers at hour 48

**Complete and real:** the time model, a reproducible database, the gate engine with per-pile
parallelism, evidence with real files and real authorisation, deviations end to end, the board,
the rail, the paragraph, the evidence panel, the batch page on one playhead.

**Schema-complete, UI-thin:** lab (approval routing blocked on C-32), resources and machine
utilisation.

**Not attempted, and correctly so:** historical import, harvest and growing-room operations,
analytics, a permissions UI, the monthly schedule (blocked on C-19/C-20), and any attempt to
resolve a factory conflict.

That is exactly the target sentence: *open MushroomOS → see the factory → click a batch → watch
its 552-hour journey → see where it is now → understand why it is late → open the evidence →
see who did it → see the lab result → see the deviation → see who approved continuation.*

---

## Stop-and-ask register

Kiro halts and reports rather than choosing:

| Before | Blocked on | Question |
|---|---|---|
| ~~T0~~ | ~~**TBD-47**~~ | ✅ **CLOSED 22 Aug 2026** — H0 = 05:00. The complete grid settles it: the workbook uses slot 24, which the 06:00 reading cannot express. |
| ~~T0~~ | ~~**TBD-50**~~ | **ANSWERED 22 Aug 2026 - `Asia/Kolkata`.** Single +05:30 offset, no DST, so the hour axis and wall clock never diverge. Stored in `factory_clock`. |
| A2 seed | **C-35** | `PROCESS-2026B` puts tunnel loading at D15; the live `AUG - SEP` schedule puts it at D16, with everything from D2 shifted ~+1 day. Carry both as two process definitions. |
| A2 seed | **C-36** | Does H552 land on tunnel unloading or on growing-room loading? |
| A5 | **TBD-28/29/33** | Paddy bunker count · when a source vessel is released · real fleet size (T1∥T2 needs ≥ 2 turners) |
| B5 | **C-33 / TBD-42 / TBD-45 / TBD-46** | Which lab map · per-pile or per-pass turning moisture · dry weight · heights lab or operational |
| B5 approval | **C-32** | GM or Supervisor approves a lab submission? |
| any hopper pass | **C-01 / C-29** | The moisture threshold. Auto-selection stays **DISABLED** (frozen decision 1). |
| any rest | **TBD-21** | Rest durations. Day-0 mandatory, **no default** (frozen decision 2). |
| Days 16–21 | **C-04/05/17/27** | Phase-2 bands: configuration-driven and visibly sourced, never hard-coded gates (frozen decision 5). |
| — | **TBD-48** | `AUG - SEP` contains "Bunker Rain Washing (paddy)" and "Paddy leaching", absent from every process definition. |

---

## Standing rules

1. **Do not resolve a factory or process conflict.** Carry both, mark both, add a row to
   `SOURCE_CONFLICTS.md`. New IDs start at **C-37** and **TBD-50**.
2. **Do not change the process definition** to make a build easier. The process is seed data.
3. **Do not rebuild** anything in `CONTRACT_AUDIT_2026-08-22.md §6`.
4. **No step is done until its exit proof runs green** in `npm test` or `scripts/`. Prose is not
   an exit proof.
5. **Server is the authority.** Every transition is a `SECURITY DEFINER` RPC.
6. **Every phase ends with a written report**: what was built, which acceptance criteria now
   pass, which conflicts were touched, what was left undone and why.
7. Kiro does not decide architecture, invent a business rule, default an unset duration, build a
   screen ahead of the record it reads, or fork the legacy APK.
