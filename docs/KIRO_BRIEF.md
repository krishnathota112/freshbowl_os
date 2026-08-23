# KIRO BRIEF & PROMPT SET

How Kiro is instructed on MushroomOS. §1 is the standing brief — it goes in
`.kiro/steering/mushroomos.md` so it is in context for **every** session. §3 onward are the
task prompts, released one gate at a time.

---

## 1. STANDING BRIEF — copy to `.kiro/steering/mushroomos.md`

```markdown
# MushroomOS — standing brief

## What this project is
A 552-hour production control tower for a mushroom-compost factory. The system records what a
Master Batch was supposed to do, what actually happened, who did it, with what machine, what
was measured, what proves it, and who allowed the process to continue.

## Your role
You implement. You do not decide architecture, invent business rules, resolve factory
questions, or change the process definition. Those are decided by the client and specified in
`docs/`. If a spec and the code disagree, the spec wins. If two specs disagree, the precedence
list below wins. If the specs are silent, you STOP AND ASK — you do not choose.

## Document precedence — higher wins
1. `docs/KIRO_BUILD_INSTRUCTIONS.md` §0.5 (five frozen decisions), §0.6, §1 (non-negotiables)
2. `docs/TIME_CONTRACT.md` — normative, frozen
3. `docs/BUILD_SEQUENCE_KIRO.md` — the order of work
4. `docs/UI_DESIGN_SPEC.md` + `docs/UI_CONTROL_TOWER_SPEC.md` — the design system
5. `docs/UI_IMPLEMENTATION_PLAN.md` / `UI_COMPONENT_ARCHITECTURE.md` / `UI_DATA_CONTRACTS.md`
6. `MUSHROOMOS_V2_END_TO_END_PRODUCT_CONTRACT.md` — product scope
7. `docs/CONTRACT_AUDIT_2026-08-22.md` — what exists, what is missing, what must not be touched

## Ten rules that are never suspended
1. **Never resolve a factory or process conflict.** 31 conflicts + 41 TBDs live in
   `docs/SOURCE_CONFLICTS.md`. Where sources disagree, carry BOTH, mark BOTH with the conflict
   ID, and add a register row. New IDs start at C-37 / TBD-51.
2. **Never invent a number** — no threshold, no duration, no rest hours, no lab spec, no
   approver, no schedule mapping. A value with no source is `null` plus a marker, never a
   default.
3. **The process is data.** Adding an activity, changing a duration or adding an evidence
   requirement is a seed-SQL change with zero application-code change. If a change needs code,
   you have modelled it wrong.
4. **No hard-coded counts or time literals.** Not `10` loads, not `3` bunkers, not `4` batches,
   not `552`, not `23`, not `05:00`. Everything derives from `process_definition` or Day-0
   config.
5. **No material name in a generic process definition.** The database enforces this with a
   CHECK constraint on `process_activity.code`. Activities bind to roles
   (`PRIMARY_FIBRE`, `STRUCTURAL_STRAW`, …), never to bagasse or paddy.
6. **The server is the authority.** Every state transition is a `SECURITY DEFINER` RPC. The
   frontend may mirror state for display; it never decides it. Device clocks never open gates.
7. **Never fake a state.** No demo-only transitions, no placeholder workflow, no plausible
   fixture the engine could not produce, no zero count that actually means "not built".
8. **Do not rebuild what exists.** `docs/CONTRACT_AUDIT_2026-08-22.md` §6 lists nine things that
   were paid for once and must survive. Read it before touching the schema.
9. **No second application.** One design system, one auth model, one backend. The legacy APK in
   `legacy/`/`apk_extracted/` is visual reference only — never forked.
10. **No step is done until its exit proof runs green** in `npm test` or `mushroomos/scripts/`.
    Prose is not an exit proof.

## Stop and ask
Halt and report rather than choosing, whenever you hit: a conflict ID, a missing duration, an
unnamed approver, a disputed threshold, two sources that disagree, or a spec that is silent on
something you need. `docs/BUILD_SEQUENCE_KIRO.md` has the full stop-and-ask register.

## How to report
Every task ends with:
- what was built (files touched)
- which exit proofs now pass, with the command and its output
- which acceptance criteria now pass (by ID)
- which conflicts/TBDs were touched, and how they were preserved
- what was left undone, and why
- anything you had to stop and ask about
```

---

## 2. Gate sequence

```
T0  time contract ─── gate: npm test green ───┐
                                              │
        ┌─────────────────────────────────────┼─────────────────────────────┐
        ▼                                     ▼                             ▼
   TRACK A (data)                       TRACK B (engine)               TRACK C (UI)
   A1 → A2 → A3 → A4 → A5               B1 → B2 → B3 → B4 → B5         C1 → C2 → …→ C14
```

**Do not release a track prompt before T0's gate passes.** Do not release C12 before A4, or
C13 before A5.

---

## 3. PROMPT T0 — release now, alone

```
TASK: T0 — freeze and test the time contract. This is the ONLY work authorised.

READ FIRST, in full:
  docs/TIME_CONTRACT.md          (normative — do not re-derive it)
  docs/TIME_MODEL_CONFIRMED.md   (the evidence behind it)
  docs/BUILD_SEQUENCE_KIRO.md    §T0
  docs/source/book1_hour_grid.json   (the extracted fixture, carries the source SHA-256)

PRODUCE EXACTLY TWO FILES:
  mushroomos/src/domain/time.ts
  mushroomos/src/domain/time.test.ts

time.ts exports EXACTLY these four pure functions, and is the ONLY place they are defined:
  batchHour(at, startAt)       1-based interval index
  batchInstant(h, startAt)     the instant H<h>
  wallClock(hour, startAt)     start of Book1 hour n
  batchDay(hour)               floor((hour - 1) / 24)

time.ts exports NO BASELINE_HOURS constant. src/domain/ is a pure layer (ARCHITECTURE_V2 §9) -
it cannot read process_definition, and a module-level constant is exactly how the literal 552
gets back in. None of the four functions needs the baseline anyway. Where a range check needs
it, it arrives as a PARAMETER from the query layer. See TIME_CONTRACT §1.3.

time.ts must not import, accept or assume a timezone. All four functions return instants or
pure indices; TBD-50 lands on TimeLabel in C1, not here. See TIME_CONTRACT §3.2.

FOUR THINGS THAT MUST BE RIGHT:
1. TIME_CONTRACT §1.2 - Book1 "hour n" is the INTERVAL [H(n-1), H(n)). H<n> is an INSTANT.
   They are not the same number. Conflating them is one hour wrong on every row in the system.
   wallClock(n) = startAt + (n-1)h and batchInstant(n) = startAt + n h are deliberately
   different; the signatures must keep them apart.
2. TIME_CONTRACT §2 invariant 5 - EVERY hour = 1 (mod 24) falls in the SAME SLOT AS HOUR 1.
   Fixture revision 2 carries all 552 cells per batch, so this is 23 boundaries x 3 batches =
   69 assertions, each anchored to a real cell. Do NOT sample the fixture.
3. TIME_CONTRACT §2 - NO expected hour, date, slot or bound may be typed into the test. Read
   every one from the fixture, INCLUDING the upper bound (batch.total_hours). Writing
   batchDay(552) would put the literal inside src/, where invariant 8 forbids it, and the two
   tests would contradict each other on first run.
4. TIME_CONTRACT §2 invariant 8 - a grep test over mushroomos/src and mushroomos/supabase with
   an EXHAUSTIVE exclusion list written in the test: supabase/seed/** and the test's own file,
   nothing else. Then a NEGATIVE CHECK: add `const x = 552` to a scratch file, confirm the test
   FAILS, remove it, and paste both outcomes in your report. A grep test that has never been
   seen to fail is not evidence.

LOADING THE FIXTURE: docs/source/book1_hour_grid.json is OUTSIDE mushroomos/, so it is outside
tsconfig's include ["src","tests"] and Vite's server.fs root - a static import will not resolve
or typecheck. Read it with node:fs, resolving the path from import.meta.url, and verify its
recorded sha256 against mails/Book1.xlsx so an edited fixture fails loudly, not quietly.

time.test.ts asserts all EIGHT invariants of TIME_CONTRACT §2 against that fixture. NEVER
against hand-typed numbers - a test that restates a developer's memory of the spreadsheet
proves nothing about the spreadsheet. Co-locate the test in src/domain/ (npm test is
`vitest run`, there is no vitest config file, and the default include picks it up).

TWO OPEN QUESTIONS - mark, do not guess:
  TBD-47  CLOSED - H0 = 05:00. The complete grid settles it: the workbook uses slot 24, which
          the 06:00 reading cannot express (69 mismatches / 1656). Do not re-open it.
  TBD-50  What IANA timezone is the factory clock, and does it observe DST? Do not solve it
          here and do not bake in a zone. See TIME_CONTRACT §3.2.

DO NOT TOUCH: any migration, any RPC, any component, any seed, any other file. No refactors.

EXIT PROOF: `npm test` runs time.test.ts and all eight invariants pass.
Report per the standing brief, then STOP. Do not start Track A, B or C.
```

---

## 4. TRACK A prompts — data

### A1 · Reconstruct migration 0004

```
TASK: A1 — reconstruct the missing batch-layer migration. Blocks all of Track A.

CONTEXT: migration 0004 does not exist on disk and has never existed in git history. It is the
one that creates master_batch, batch_activity, batch_activity_value,
batch_activity_evidence_req, batch_material_role and the activity_state enum. Migrations
0005–0010, all nine seeds and every screen depend on it. `npm run db:migrate` on a clean
Supabase project fails at 0006. The repository is currently NOT reproducible.

READ: docs/CONTRACT_AUDIT_2026-08-22.md §3.1 and §6 · docs/BUILD_SEQUENCE_KIRO.md A1

PRODUCE: mushroomos/supabase/migrations/0004_batch_tree.sql

Contents — exactly what 0005–0010, the seeds and src/api/*.ts already reference, no more:
  - enum activity_state (the 14 values in src/domain/types.ts) and the master_batch status
  - master_batch, batch_material_role, batch_activity, batch_activity_value,
    batch_activity_evidence_req
  - RLS enabled on all five, with the read policies 0006 already declares

DERIVE the column list MECHANICALLY from every statement that names these tables — every
insert, select, alter, and every .select('...') string in src/api/. Invent no column.

DO NOT pre-create columns that 0006/0007/0008 later `alter table` in — leave those alters
intact so the migration history stays honest.

EXIT PROOF: on a NEW, EMPTY Supabase project —
  npm ci && npm run db:migrate && npm run db:seed && npm run typecheck && npm run build
completes with zero errors, and scripts/counts.mjs reports activities_2026b=45 (36 operator
+ 9 lab_tech) and conflict_entries=64 (31 conflicts + 33 TBDs).

Report, then STOP for review before A2.
```

### A2 · The hour axis

```
TASK: A2 — put the hour axis into the schema. Requires T0 and A1.

READ: docs/TIME_CONTRACT.md (normative) · docs/TIME_MODEL_CONFIRMED.md §6 ·
      docs/BUILD_SEQUENCE_KIRO.md A2

BUILD:
  process_activity : standard_start_hour, standard_end_hour. Seed at rel_day * 24 so the
                     existing 34 rows keep working. Where the register states no hour, leave
                     NULL and mark it — DO NOT invent a start time.
  master_batch     : start_at timestamptz, MANDATORY. Never defaults to midnight.
                     Pre-fill the factory offset with a visible TBD-47 marker.
  batch_activity   : planned_start_at, planned_end_at, baseline_start_hour, baseline_end_hour,
                     and variance_minutes as a GENERATED column (never written).
  generate_activity_plan : replace `(b.start_date + a.rel_day)::timestamptz`. It is currently
                     5-6 hours early on every single row.

rel_day SURVIVES as a derived, display-only value. Do not drop it — 34 seed rows and every
screen order by it. But no gate and no timestamp may read it.

Import every hour function from src/domain/time.ts. Do not reimplement them in SQL by hand —
if SQL needs them, write them as SQL functions that the T0 tests also cover.

EXIT PROOF: every activity renders both H126 and its wall clock; changing start_at moves every
planned timestamp and no rel_day; a direct write to variance_minutes is rejected.

STOP AND ASK if: the register gives no hour for an activity you think needs one (leave NULL and
report it), or if C-35 forces a choice between the PROCESS-2026B and AUG-SEP day maps
(carry both as two process definitions; do not merge).
```

### A3 · Seed three staggered batches

```
TASK: A3 — seed the demo factory shape.

Three master batches at a 48-HOUR STAGGER, per Book1.xlsx. Not one. The staircase
(UI_CONTROL_TOWER_SPEC §9.1) is the product's hero image and needs more than one bar to exist.

Stage them at different positions — one early (Day 0-1), one mid-yard (Day 8), one in tunnel
hold (Day 18) — so the Control Tower, the rail and the exception band all have real content on
first render.

Historical CLOSED batches may be seeded for trends. The LIVE demo batches' lab and evidence
data may NOT be seeded — it is produced by the flows or it is absent (product contract §26 as
amended by CONTRACT_AUDIT §4.10).

EXIT PROOF: the three batches render as a diagonal staircase; scripts/verify.mjs passes.
```

### A4 · Evidence storage

```
TASK: A4 — real evidence. Also closes a security defect.

CONTEXT: mark_evidence(p_req) increments satisfied_count by one. It records no file, no path,
no uploader, and performs NO role or ownership check — any authenticated user can satisfy any
requirement on any batch. See CONTRACT_AUDIT §3.3.

BUILD:
  - a PRIVATE Supabase Storage bucket, database-controlled access
  - evidence_media: batch, activity, requirement key, storage path, uploader (from JWT),
    SERVER timestamp, media kind, optional metadata
  - an RPC that binds a stored object to a NAMED requirement, with role AND ownership checks
  - honour media_kinds (photo/video) and the per-activity cap for TBD-35

REPLACE mark_evidence. Do not leave a counter-only path callable from the UI.

EXIT PROOF: DEMO_PLAN_V2 criterion 17 (NM-ROTAVATE cannot submit with 2 of 3 satisfied, and the
outstanding one is named). A photo survives sign-out. A second user CANNOT satisfy another
user's requirement — asserted by a direct PostgREST call with a valid JWT, not by clicking.
```

### A5 · Resources

```
TASK: A5 — vessels and machines as time-bounded, constrained resources.

BUILD: location_occupancy and machine_usage, both time-bounded, both with btree_gist EXCLUSION
CONSTRAINTS. The extension is already installed in 0001 for exactly this and was never used.
Replace validate_batch's ±2-day proximity heuristic with a real occupancy query.

STOP AND ASK — do not choose:
  TBD-29  is a source bunker released at the START of unload or the END of reload?
  TBD-28  how many bunkers does straw occupy, and for how long?
  TBD-33  real fleet size — T1 ∥ T2 needs at least two turners
Model both readings as configuration.

EXIT PROOF: DEMO_PLAN_V2 criteria 16, 19, 20 — the turner clash is refused by the CONSTRAINT,
not by the form; straw in Bunker 4 blocks a compost occupancy of Bunker 4 in the same window;
machine hours are DERIVED and no editable hours field exists anywhere in the schema.
```

---

## 5. TRACK B prompts — engine

### B1 · `evaluate_gates`

```
TASK: B1 — make the seeded gate rules actually run. This is the second structural correction.

CONTEXT: supabase/seed/s04_gates_evidence.sql seeds 25+ gate rules, including a dedicated
TR-T2 ← TR-T1 SAME_SCOPE_INSTANCE rule. NOTHING READS gate_rule. What actually gates
progression in advance_batch is a global day barrier:
    earlier.rel_day < ba.rel_day AND earlier.state NOT IN ('COMPLETED','SKIPPED')
That is precisely the "ALL T1 → ALL T2" model the product contract §17 forbids.

READ: docs/CONTRACT_AUDIT_2026-08-22.md §3.2 · docs/WORKFLOW_MODEL.md §2, §9 ·
      docs/PROCESS_V2_FACTORY_CONFIRMED.md §9.4

BUILD evaluate_gates — the SINGLE server-side state-transition entry point. It reads gate_rule
and implements the kinds s04 already contains:
  PREDECESSOR with ALL_INSTANCES / ANY_INSTANCE / SAME_SCOPE_INSTANCE
  COMPOSITE (the {"sub":[...]} shape already seeded)
  TIME (the existing unblocks_at behaviour moves under it — keep the server-clock rule)
  EVIDENCE
  LIMIT — honour is_enabled and mapping_confidence. A rule that is not 'dictated' or
          'sop_direct' MUST NOT auto-fail anything (C-28).

Then advance_batch delegates to it, and you DELETE the rel_day barrier.

DO NOT regenerate or rewrite the gate_rule seed rows. They are correct. Write the engine that
reads them.

Every blocked row must still carry a reason built from blocked_reason_template — the
batch_activity_reason_required CHECK will reject anything else.

EXIT PROOF: DEMO_PLAN_V2 criterion 15 as an automated test — three piles seeded, T1 completed
OUT OF ORDER (pile 2 first), and pile 2's T2 becomes READY while piles 1 and 3 are still in T1.
Plus a test asserting no function other than evaluate_gates writes batch_activity.state.
```

### B2 · Deviations and release

```
TASK: B2 — the deviation entity and the supervisor's authority.

CONTEXT: a deviation today is a state value plus a free-text blocked_reason. There is no
record, no id, no raiser, no reviewer, no resolution, no corrective action.

READ: docs/ROLE_AND_APPROVAL_MODEL.md §7 · docs/CONTRACT_AUDIT_2026-08-22.md §3.5

BUILD: deviation (raised_by, raised_at, activity, kind, triggering values, state, resolution
with actor + reason) and corrective_action. RPCs: release / hold / return /
accept_with_deviation. REASON IS MANDATORY on every one. An accepted deviation STAYS OPEN on
the record and appears in every downstream GM package.

EXIT PROOF: the 3.6 MT vs 2.0 MT load deviation from DEMO_SPRINT_ORDER §0.3 is raised, reviewed
by a NAMED supervisor with a reason, resolved, the downstream unblocks — and the whole sequence
is readable from the event history.
```

### B3 · Events

```
TASK: B3 — complete the audit trail.

CONTEXT: fn_audit() is defined in 0001 and attached to NO TABLE. All audit rows come from ~8
hand-written inserts inside RPCs. Of the product contract §24's 21 event types, ~6 exist.

BUILD: attach fn_audit to the batch tables. Add the missing event kinds.

EXIT PROOF: a full batch lifecycle reconstructs from audit_event alone.
```

### B4 · Variance attribution

```
TASK: B4 — the data behind the narrative layer.

BUILD a view returning, per batch: total variance, and the RANKED activities that produced it,
each with actor, machine and cause. Pure derivation from A2 + B2; no new source data.

This is what UI_CONTROL_TOWER_SPEC §11 renders as a paragraph, and it is the highest-value
management feature in the product. The factory already writes this by hand after every batch
(S3a-S3f "core diagnosis").

EXIT PROOF: for the staged demo batch the top two contributors match hand-computed values.
```

### B5 · Lab subsystem

```
TASK: B5 — the laboratory as a first-class subsystem.

READ: docs/LAB_MODEL.md §2-§3 · lab_technician_batch_process.md · CONTRACT_AUDIT §3.4 and §2.E

BUILD: lab_checkpoint, lab_sample, lab_test, lab_result, lab_instrument. Results VERSIONED;
target_min/max FROZEN at request time; supersede, never overwrite.

CARRY TWO CHECKPOINT MAPS AS TWO SEEDS — the lab dictation's day map, and S4b's 18
column-derived checkpoints. Mark C-33 on every row where they disagree. DO NOT MERGE THEM and
DO NOT PICK ONE. They disagree at Day 0, Day 1 (4 checks vs 1), Day 4 (4 vs 1), the soaks
(3 vs 6), the nitrogen source (present vs absent), Day 8, Day 12, Day 15 and Day 22.

BLOCKED — approval routing (C-32). The lab dictation says the GM approves every submission;
ROLE_AND_APPROVAL_MODEL says the GM never approves per-activity work and the Supervisor holds
release/hold/return. Build the submission and the state. Leave the APPROVER CONFIGURABLE.
Name no approver anywhere. Report the block.

EXIT PROOF: a result is superseded by a retest with the original preserved and both visible.
A result with no spec records no_spec and NEVER auto-fails (TBD-13).
```

---

## 6. TRACK C prompts — UI

### C1 · Foundations *(release with T0's gate)*

```
TASK: C1 — UI foundations. Requires T0 only. Runs in parallel with A1 and B1.

READ IN FULL:
  docs/UI_DESIGN_SPEC.md               (the design system — do NOT replace it)
  docs/UI_CONTROL_TOWER_SPEC.md        (the management layer)
  docs/UI_IMPLEMENTATION_PLAN.md       (14 screens, route tree, build order)
  docs/UI_COMPONENT_ARCHITECTURE.md    (four layers, state, the fixture harness)
  docs/UI_DATA_CONTRACTS.md            (typed interfaces — the agreement between tracks)
  docs/UI_ACCEPTANCE_CRITERIA.md       (the bar)

BUILD:
  useDensity()      role → Density, ONE mapping in ONE place
  TimeLabel         takes {startAt, hour}; CANNOT render an hour alone (acceptance A3)
  HumanDuration     takes minutes, emits "1h 14m behind" — never raw minutes (acceptance A14)
  Skeleton          shaped loading, never a page spinner
  PlayheadContext + usePlayhead   backed by the ?h= URL param
  Bar               add a REQUIRED kind:'material' prop so batch-progress fails to COMPILE

ALSO: consolidate src/api/batch.ts and src/api/batches.ts. They both export listBatches,
getBatch, createBatch and activateBatch with DIFFERENT shapes. Two sources of truth for the same
reads will produce two different batch pages. This is cleanup, not redesign — do it before any
new screen consumes either.

ALSO: extend routes/Gallery.tsx as the fixture harness for the whole track. It already renders
FiveLayerNode in every state and is DEV-only. Do NOT add Storybook.

FIXTURE RULES (UI_COMPONENT_ARCHITECTURE §4.1):
  - fixtures live in src/domain/fixtures/, TYPED with the interfaces from UI_DATA_CONTRACTS
  - a fixture may NOT contain a state the engine cannot produce
  - a fixture may NOT contain a number the database will not hold
  - time fixtures derive from docs/source/book1_hour_grid.json, never typed-in hours

ADD ESLint no-restricted-imports: no L1/L2/L3 component may import api/ or supabase-js;
nothing outside useDensity may read useAuth().role.

EXIT PROOF: acceptance A3, A4, A10, A11, A12, A13, A14 pass. Gallery renders every new
component in default/loading/empty/blocked/error, in BOTH themes.
```

### C2–C14

```
TASK: C<n> — <screen>, per docs/UI_IMPLEMENTATION_PLAN.md §S<n> and the build order in §4.

For each screen implement EXACTLY the twelve points defined there: purpose, user, layout,
information hierarchy, primary action, secondary actions, loading, empty, blocked, error,
responsive behaviour, and the data contract in UI_DATA_CONTRACTS.md.

A component is finished when the route swaps its fixture for a query and NOTHING INSIDE THE
COMPONENT CHANGES. If connecting requires editing the component, the prop interface was wrong —
fix UI_DATA_CONTRACTS.md first, then the fixture, then the component.

EXIT PROOF: the numbered manual criteria for that screen in UI_ACCEPTANCE_CRITERIA.md §B, in
both themes, at 375 / 768 / 1280 px.
```

**Order:** C1 foundations → C2 HourRail + StaircaseCalendar → C3 Control Tower →
C4 Batch Page + playhead → C5 Evidence Panel → C6 operator → C7 lab → C8 creation/activation →
C9 Control Room → C10 blocked states → C11 Narrative → **C12 evidence capture (hold for A4)** →
**C13 Gantt (hold for A5)** → C14 acceptance run.

### Three UI prohibitions to restate in every C prompt

```
1. S10 EVIDENCE CAPTURE — do NOT ship a capture affordance that calls mark_evidence. It
   increments a counter with no file, no path, no uploader and no ownership check. Until A4
   lands, the requirement list is READ-ONLY and states why. A capture button over a counter
   creates false records.
2. S13 LAB SUBMIT — the button reads "Submit for approval" and NAMES NO APPROVER. C-32 is
   open: the lab dictation says GM, ROLE_AND_APPROVAL_MODEL says Supervisor. The UI is not
   where that gets decided.
3. S5 MONTHLY SCHEDULE — ships BLOCKED. Route, heading, and an honest state naming C-19, C-20,
   C-18 and C-35, pointing at /admin/batch/new as the working path. No token grid, no import,
   no mapped activity codes. Rendering the mapping IS making a factory decision.
```

---

## 7. Automatic failures

Any one of these fails the task regardless of everything else:

1. A factory conflict silently resolved.
2. An invented number, threshold, duration, approver or schedule mapping.
3. A hard-coded count or time literal (`10`, `3`, `4`, `552`, `23`, `05:00`).
4. A material name in a generic process definition.
5. A state transition decided by the client.
6. A fixture, seed or screen showing a state the engine cannot produce.
7. A zero count that means "not built".
8. A batch percentage-complete in the management layer, or a sixth semantic colour.
9. Anything in `CONTRACT_AUDIT_2026-08-22.md §6` rebuilt or removed.
10. A task reported as done without its exit proof output pasted in.
