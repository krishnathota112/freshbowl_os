> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# UI IMPLEMENTATION PLAN

**Date:** 22 August 2026 · **Status:** definitive plan for Kiro's Track C.

**Binding inputs, in precedence order.** Where they disagree, the higher one wins:

1. `KIRO_BUILD_INSTRUCTIONS.md` §0.5, §0.6, §1 — frozen decisions, material roles, non-negotiables
2. `TIME_CONTRACT.md` — normative; frozen at T0
3. `UI_DESIGN_SPEC.md` — tokens, five-layer node, production graph, per-role bar, checklist
4. `UI_CONTROL_TOWER_SPEC.md` — the management layer
5. `MUSHROOMOS_V2_END_TO_END_PRODUCT_CONTRACT.md` — product scope
6. This document — how the fifteen screens are actually built

**Companions:** `UI_COMPONENT_ARCHITECTURE.md` (component tree, state, harness) ·
`UI_DATA_CONTRACTS.md` (typed interfaces, availability) · `UI_ACCEPTANCE_CRITERIA.md` (the bar).

---

## 0. Rules for this workstream

1. **Extend, never replace.** The design system in `UI_DESIGN_SPEC §1`, `FiveLayerNode`,
   `AppShell`, `primitives/index.tsx` and the theme tokens all stay. No second design system,
   no second application, no fork of the legacy APK.
2. **A component may render from a typed fixture. It may never invent a state the engine cannot
   produce, or a number the database will not hold.** Missing data renders the stated empty
   state of `UI_DESIGN_SPEC §5`, naming what will fill it and when.
3. **No factory decision is made in the UI.** A disputed value renders with its conflict ID at
   the point of use. A blocked screen says which conflict blocks it.
4. **Five semantic colours only** — `UI_CONTROL_TOWER_SPEC §8.5`. No sixth, no decoration.
5. **No batch percentage-complete anywhere in the management layer** — `§8.3`. Position on the
   hour rail instead.
6. **No time literal.** `552`, `23`, `05:00` come from `BASELINE_HOURS` / `start_at` /
   configuration. `TIME_CONTRACT §4`.
7. **Operator and Lab never see the management graph.** Task-focused surfaces show one batch,
   one activity, one decision. `UI_DESIGN_SPEC §4.1`.
8. Everything is verified against `UI_ACCEPTANCE_CRITERIA.md`. Prose is not an exit proof.

### 0.1 One naming decision (UI, not factory)

`UI_DESIGN_SPEC §4.6` and `ROLE_AND_APPROVAL_MODEL §5` call the GM home **Command Center**.
`UI_CONTROL_TOWER_SPEC §9` calls it **Control Tower**. Two names for one screen violates the
terminology discipline of `PROCESS_V2 §19`.

**Decision: the screen is the Control Tower.** "Command Center" is retired as a name.
Route moves `/gm/command-center` → `/gm/control-tower` with a redirect, and `ROLE_HOME.gm` and
the `AppShell` nav entry update in the same commit. This is a naming call inside the UI
workstream; it changes no process, role or authority.

---

## 1. Route tree — target state

Existing routes are marked `[keep]`, changed ones `[move]`, new ones `[new]`. Guards are the
`RoleGuard` already in `App.tsx`; RLS remains the actual authorisation boundary.

```
/                                    Landing → ROLE_HOME[role]                    [keep]
/sign-in                             SignIn                                       [keep]

── MANAGEMENT ────────────────────────────────────────────────────────────────────
/gm/control-tower                    ControlTower            gm                   [move] ← /gm/command-center
/batch/:id                           BatchPage               MGMT                 [move] ← /admin/batch/:id
   ?tab=overview                       └ rail + graph + events + narrative        [new]
   ?tab=activities                     └ instance list, five-layer nodes          [keep]
   ?tab=schedule                       └ ScheduleBuilder — admin, draft only      [move] ← /admin/batch/:id/schedule
   ?activity=<id>                      └ EvidenceDecisionPanel (drawer)           [new]
   ?h=<batchHour>                      └ playhead position, deep-linkable         [new]
/admin/today                         AdminToday              MGMT                 [keep]
/admin/batches                       Batches                 MGMT                 [keep]
/admin/schedule                      MonthlySchedule         admin,gm      BLOCKED [new]
/admin/batch/new                     NewBatch                admin,gm             [keep]
/admin/process-explorer              ProcessExplorer         MGMT                 [keep]
/admin/reference                     ReferenceData           MGMT                 [keep]
/manager/resources                   ResourceView            manager,admin,gm     [keep]

── TASK SURFACES ─────────────────────────────────────────────────────────────────
/operator/my-work                    MyWork                  OPS                  [keep]
/operator/task/:id                   CurrentActivity         OPS                  [new]
/lab/queue                           LabQueue                lab_tech,supervisor  [keep]
/lab/task/:id                        CurrentSample           lab_tech,supervisor  [new]
/supervisor/control-room             ControlRoom             supervisor,gm        [keep]

── DEV ───────────────────────────────────────────────────────────────────────────
/dev/gallery                         Gallery  (DEV only)     ALL                  [keep]
```

### 1.1 Why `/batch/:id` is shared, not duplicated per role

The five-layer node already proves the pattern: **one component, six densities**
(`UI_DESIGN_SPEC §2.2`). The batch page is the same truth read at different densities — GM sees
the rail and the paragraph, admin additionally sees the schedule tab, supervisor sees the
decision layer. Building `/gm/batch/:id` alongside `/admin/batch/:id` is the second application
this workstream is forbidden to create.

`density` is derived from `useAuth().role` in one place (`useDensity()`), never passed down
manually.

### 1.2 `/admin/schedule` ships blocked, on purpose

The monthly schedule is **blocked on C-19 and C-20** — the day-numbering base has moved and
`DOMAIN_MODEL §3` (schedule token → stage map) is SUSPENDED. There is no schedule entity in the
database and no import.

The route exists and renders an honest blocked state naming both conflicts and stating that
Admin creates batches directly via `/admin/batch/new` until they are answered. **It does not
render a fabricated calendar.** See S5.

---

## 2. The fifteen screens

Fourteen were specified on 22 Aug; **S15 was added the same day** after B1 found that the
seeded GM approval gate had neither a data step nor a screen to record a decision.

Each block: purpose · user · layout · hierarchy · actions · states · responsive · data.
`→ DC §n` points at `UI_DATA_CONTRACTS.md`. `⛔` marks a backend dependency.

---

### S1 · Factory Control Tower

| | |
|---|---|
| **Route** | `/gm/control-tower` |
| **User** | GM / owner. Read-only; they decide, they do not execute. |
| **Density** | `gm` |
| **Replaces** | `Placeholders.tsx › CommandCenter` |
| **Answers** | *Is the factory alright this morning?* |

**Layout** — `UI_CONTROL_TOWER_SPEC §9.1`.

```
┌────────────────────────────────────────────────────────────┐
│ FACTORY CONTROL TOWER                Sat 22 Aug · 09:14    │
│  12 RUNNING    8 ON PLAN    3 NEED A DECISION    1 HELD    │  ← four counters, no fifth
├────────────────────────────────────────────────────────────┤
│ NEEDS YOU                                                  │  ← exceptions FIRST
│  ⚠ MB-118 · bunker reload ran 3h 20m long                  │
│    waiting on you since 07:40 · 1h 34m      [ look at it ] │
├────────────────────────────────────────────────────────────┤
│ THE FACTORY          ◀ 18  19  20  21 [22] 23  24 ▶        │
│  MB-097 ████████████████████████████▓                      │  ← staircase,
│  MB-100   ██████████████████████████▓▓                     │    sorted by start_at
│  MB-103     ████████████████████████▓▓▓                    │
│  …                                    │ now                │
└────────────────────────────────────────────────────────────┘
```

**Information hierarchy**
1. Exception band — what needs a decision, and **how long it has been waiting for a person**
2. Four counters — running · on plan · needs a decision · held
3. Staircase calendar — the factory's shape, sorted by `start_at`, never by status
4. Nothing else. No fifth counter, no chart, no trend tile.

**Primary action** — open an exception (`→ /batch/:id?activity=<id>`, panel open).
**Secondary** — click any bar at any point (`→ /batch/:id?h=<batchHour>`) · pan the date window ·
hover a bar segment for a one-line summary at that hour.

**Loading** — skeleton in the shape of the board: a counter strip and *n* bar rows at the
current batch count. Never a page spinner.
**Empty** — "No batches are running. The staircase appears when a batch is activated — a new
one starts roughly every 48 hours."
**Blocked** — not applicable; a read-only board is never blocked. Individual bars whose batch is
held render with the `crit` rail and the reason on the row.
**Error** — "Could not read the factory board. <message>. Retry." Retry button. Never a code
without text.

**Responsive**
- ≥1280 — full board.
- 768–1279 — staircase keeps the diagonal, date window narrows to 5 days, counters wrap to 2×2.
- <768 — **the staircase becomes a vertical list of batch rows**, each with a mini `HourRail`.
  The diagonal cannot survive a phone and faking it would force horizontal page scroll, which
  `UI_DESIGN_SPEC §4.1` forbids. Exception band stays first.

**Data** → `DC §1`. ⛔ real bars need **A2 (hour axis)**; exceptions need **B2 (deviations)**.
Buildable immediately against fixtures; connects incrementally.

---

### S2 · Batch Page — the 552-hour rail

| | |
|---|---|
| **Route** | `/batch/:id?tab=overview&h=<hour>` |
| **User** | GM primarily; supervisor and admin at their own density |
| **Density** | from `useDensity()` |
| **Extends** | `routes/BatchDetail.tsx` |
| **Answers** | *Where is this batch, and is it late?* |

**Layout** — `UI_CONTROL_TOWER_SPEC §10`, §13.

```
MB-118 · 118 119 120                          started Tue 6 AM
Thu 22 Aug · 09:14      Day 5 · H137 of 552      3h 20m behind
PLAN    ├──────────────────●────────────────────────────────┤
ACTUAL  ├────────────────────●
        finishes Thu 4 Sep ~9 AM   ·   planned Thu 4 Sep ~6 AM
┌ WHERE THE TIME WENT ─────────────────────────────────────┐
│ Bunker reload · line 2   2h 40m   lab result came 09:40  │
│ Hopper pass 2              42m   ran long                 │
│ everything else            -2m                            │
└───────────────────────────────────────────────────────────┘
─────────────────── ONE PLAYHEAD ───────────────────────────
[ production graph ]   [ event stream ]   [ narrative ]
```

**Information hierarchy**
1. Wall clock, then batch position, then scale — `UI_CONTROL_TOWER_SPEC §8.1`
2. Variance, spoken (`3h 20m behind`) — §8.2
3. The two rails: plan above, actual below; forecast tail lighter and dashed
4. `WHERE THE TIME WENT` — ranked, **capped at three lines plus a remainder**
5. The three synchronised views below, sharing one playhead

**Primary action** — scrub the playhead. Dragging moves graph, event stream and narrative
together. This is the moment the product explains itself (`§13`).
**Secondary** — open any node → `EvidenceDecisionPanel` · switch tab (`activities`, `schedule`
for admin on a draft) · jump to now.

**Loading** — rail skeleton at `BASELINE_HOURS` width with no segments; graph and stream as
shaped skeletons.
**Empty** — a draft batch with a generated plan shows the **plan rail only**, with "This batch
has not been activated. The actual rail appears when work starts."
**Blocked** — a batch held or in deviation renders the rail normally with a `crit` band at the
blocking hour and the reason on its face. `FiveLayerNode` already enforces reason-or-defect.
**Error** — inline on the failing region; the rest of the page still renders.

**Responsive**
- ≥1280 — rail full width; graph and event stream side by side.
- 768–1279 — graph and stream stack; rail keeps full width.
- <768 — rail scrolls **inside its own container** (never the page); graph collapses to
  `STREAM` zoom (`UI_DESIGN_SPEC §3.1`); the narrative is shown first because it is the most
  useful thing on a phone.

**Data** → `DC §2`. ⛔ **A2** for hours, **B1** for honest states, **B4** for
`WHERE THE TIME WENT`.

---

### S3 · Evidence / Decision Panel

| | |
|---|---|
| **Route** | not a route — a drawer, deep-linked as `?activity=<id>` on any management screen |
| **User** | GM, supervisor, manager |
| **Density** | `gm` / `supervisor` |
| **Answers** | *Why, who, and who allowed it?* |

**Layout** — `UI_CONTROL_TOWER_SPEC §12`. This is `FiveLayerNode` with the management labelling:

| Layer | Task label | Management label |
|---|---|---|
| ① SOP | `SOP` | `SUPPOSED TO BE` |
| ② PLAN | `PLAN` | folded into ① |
| ③ ACTUAL | `ACTUAL` | `WHAT HAPPENED` · `WHO` · `MACHINE` |
| ④ EVIDENCE | `EVIDENCE 2/2` | `PROOF` — **the photographs, not the count** |
| ⑤ DECISION | `DECISION` | `DECISION` with the reason quoted verbatim |

Same component, same order, same colours. Only labels and media rendering change.

**Information hierarchy** — what it was supposed to be → what happened → who and with what →
the photograph → the lab result → the decision and its quoted reason.

**Primary action** — none. This panel **answers**; it does not act. The GM's actions live on the
decision package, not here.
**Secondary** — open the full-size photograph · jump to the lab result · jump to the deviation ·
open the conflict entry · copy a permalink to this activity at this hour.

**Loading** — skeleton with the five layer rows in place, so the shape is stable.
**Empty per layer** — `—` with the source ref, never a blank. An absent SOP bound is
information: no source gives one (`LAB_MODEL §9`). Already enforced inside `FiveLayerNode`.
**Blocked** — ⛔ until **A4**, `PROOF` renders: "Photographs are stored from the evidence
release onward. This activity recorded 2 of 2 requirements as satisfied before file storage
existed." **State the truth; do not show a placeholder image.**
**Error** — per-region; a failed image load shows the requirement label and the failure, not a
broken-image glyph.

**Responsive** — ≥1024 right-hand drawer 420 px; <1024 full-screen sheet with a close affordance
in the top-left thumb arc.

**Data** → `DC §3`. ⛔ **A4** for real media, **B2** for the decision record.

---

### S4 · Admin — Today

| | |
|---|---|
| **Route** | `/admin/today` |
| **User** | Admin, supervisor, manager, GM |
| **Extends** | `routes/AdminToday.tsx` (exists) |
| **Answers** | *What does the factory need from me today?* |

**Layout** — a working list, not a dashboard: batches needing a Day-0 answer · batches ready to
validate · batches ready to activate · today's gates opening · unresolved TBDs touching any
active plan (from `validate_batch` severity `info`).

**Hierarchy** 1 things only Admin can unblock · 2 things opening today · 3 reference counters.

**Primary** — resume the batch that needs an answer.
**Secondary** — new batch · open batch list · open reference data.

**Loading** skeleton list rows. **Empty** — "Nothing needs an Admin decision today. New batches
are created from `+ New Batch`; the next scheduled start is in N days." **Blocked** n/a.
**Error** inline with retry.

**Responsive** single column ≤768; two columns above.

**Data** → `DC §4`. Available **now**; gains "gates opening today" with **A2**.

---

### S5 · Admin — Monthly Schedule ⛔ **BLOCKED — C-19, C-20**

| | |
|---|---|
| **Route** | `/admin/schedule` |
| **User** | Admin, GM |
| **Status** | route exists; renders a blocked state |

**Why blocked.** **C-19** — the day-numbering base has moved. **C-20** — the monthly schedule
may no longer map to the process; `DOMAIN_MODEL §3` is SUSPENDED. **C-18** — schedule vocabulary
is not stable across months. No schedule entity exists in the database, and `S6b` (the live
`AUG - SEP` sheet) disagrees with `PROCESS-2026B` by about a day from D2 onward (**C-35**).

**What ships now** — the route, a `PageHeading`, and a blocked state that names all four
conflicts, states what the screen will do when they are answered, and links to
`/admin/batch/new` as the working path. Copy pattern from `UI_DESIGN_SPEC §5`: say what will
fill it and when.

**What is explicitly forbidden here** — rendering the token grid as though the mapping were
settled, importing `June'2026 Schedule.xlsx` into a schedule table, or picking between the
`PROCESS-2026B` and `S6b` day maps. That is a factory decision.

**Design, held for when it unblocks** — rows = dates, columns = master batch groups, cells =
scheduled activity token, plus the two growing-room columns `S6b` carries. Selecting a slot
previews the Day-0 configuration and hands off to S6.

**Data** → `DC §5` (interface defined, no source).

---

### S6 · Admin — Master Batch Creation

| | |
|---|---|
| **Route** | `/admin/batch/new` |
| **User** | Admin, GM |
| **Extends** | `routes/NewBatch.tsx` (exists, 575 lines) |
| **Answers** | *What is this batch supposed to do?* |

**⚠ SCOPE SETTLED, 23 Aug 2026 — the wizard is FIVE steps, not nine.**

A nine-step shape was proposed: ① Identify ② Materials & Quantity ③ Resources ④ Timeline
⑤ Operator plan ⑥ Lab plan ⑦ Evidence plan ⑧ Review ⑨ Activate. **Four of those have no backend
to write to.**

Day-0 configuration is quantities plus structure *counts* (`STRUCTURE_QUESTIONS`). Specific
resources, operator plans, lab plans and evidence plans are **per activity**, written through
`set_activity_plan` — which is `ScheduleBuilder`'s job and which `ScheduleBuilder` already does.
Steps ③⑤⑥⑦ would be four screens that write nothing, which `KIRO_BUILD_INSTRUCTIONS §1` item 10
forbids.

The flow is therefore: **wizard → generate → `ScheduleBuilder` reviews and corrects → validate →
activate.** A wizard is for creating; a dense table is for scanning and correcting a generated
plan. See `docs/REPORTS/P0.md`.

**Layout** — the existing wizard, with three additions and no restructuring:

1. **`start_at` — date *and* time, mandatory.** New, required by `TIME_CONTRACT §1.1`. Carries a
   visible **TBD-47** marker ("the factory's hour grid starts a batch in the sixth hour of the
   day; whether that is 05:00 or 06:00 is unconfirmed"). **Never defaults to midnight.**
2. **Live consequence rail** (right side, persistent) — as configuration changes: derived load
   count `ceil(qty / capacity)`, instance count per scope, and the **computed baseline length**
   from `standard_start_hour`. If the computed baseline is not `BASELINE_HOURS`, show that;
   do not clamp it (`TIME_MODEL_CONFIRMED §5`).
3. **Material-role binder** — `ADMIN_CONFIGURABILITY_MODEL §2`. Labels resolve live
   (`{role_lead} Weighment` → "Bagasse Weighment"). Streams with no bound role are shown as
   disabled with the reason.

**Hierarchy** identity and `start_at` → material roles → formulation and quantities → structure
counts → rest durations (mandatory, **no default**, amber `TBD-21`) → hopper mode
(Water / Dry; **Auto greyed and unselectable**, frozen decision 1) → preview.

**Primary** — create the batch (`create_master_batch`, one transaction, generates the plan).
**Secondary** — save draft · clone previous batch (`TBD-41`) · cancel.

**Loading** — reference data skeletons per section. **Empty** n/a.
**Blocked** — the create button is disabled while any mandatory Day-0 answer is missing, and
**the button states which one**, not a generic "complete the form".
**Error** — the RPC's own message rendered verbatim above the action; `create_master_batch`
already raises human-readable exceptions.

**Responsive** — desktop-first. ≥1280 wizard plus consequence rail; 768–1279 rail collapses to a
sticky summary bar; <768 supported but not optimised — this is a desk task.

**Data** → `DC §6`. Available **now** except `start_at`, which needs **A2**.

---

### S7 · Admin — Batch Review / Activation

| | |
|---|---|
| **Route** | `/batch/:id?tab=schedule` |
| **User** | Admin, GM, supervisor |
| **Extends** | `routes/ScheduleBuilder.tsx` (exists, 768 lines) |
| **Answers** | *Is this plan executable, and may it be frozen?* |

**Layout** — the existing per-row schedule editor, plus a **validation panel** that is the
gate to activation:

```
BLOCKING  3      these prevent activation
  · Rest on Day 2 has no duration set              [ go to row ]
  · Bunker Reload line 2 would reload into Bunker 3 [ go to row ]
WARNING   1      recorded, does not block
INFO      7      unresolved questions this plan touches — each with its ID
```

`validate_batch` already returns exactly this shape (`severity`, `code`, `message`,
`activity_id`).

**Hierarchy** 1 blocking findings 2 the row being edited 3 warnings 4 info/TBD list.

**Primary** — **Activate**. Disabled while any blocking finding stands, and the button names the
count. Activation freezes the baseline (`§10` of the contract) — the UI must say so before the
click, not after.
**Secondary** — edit a row (`set_activity_plan` whitelist) · assign a person · send an alert ·
regenerate the plan (draft only).

**Loading** — table skeleton at the real row count.
**Empty** — n/a; a batch always has a generated plan.
**Blocked** — after activation the editor is read-only and says why: "The baseline is frozen. A
change now is a deviation or an override, not an edit." `set_activity_plan` already refuses.
**Error** — activation failure renders the raised message verbatim; it lists the blockers.

**Responsive** — desktop-first; the table scrolls **inside its own container**
(`UI_DESIGN_SPEC §6.8`). <768 shows a read-only summary and directs to a desktop.

**Data** → `DC §7`. Available **now**.

---

### S8 · Operator — My Work

| | |
|---|---|
| **Route** | `/operator/my-work` |
| **User** | Operator (supervisor/admin may view) |
| **Density** | `operator` |
| **Extends** | `routes/MyWork.tsx` (exists) |
| **Answers** | *What do I need to do now?* |

**Layout** — one vertical list, largest thing first. Bands: **now** · **waiting on a clock** ·
**later today**. No graph, no calendar, no other batch's business
(`UI_DESIGN_SPEC §4.1`).

**Hierarchy** 1 the single actionable task 2 running rests with live countdowns 3 what is next
and what it waits for.

**Primary** — open the actionable task → S9.
**Secondary** — none. One primary action per screen.

**Loading** — two card skeletons.
**Empty** — "Nothing is waiting for you. The next task opens when the rest on Bunker line 2
finishes — 3h 18m." Name the specific thing and the time.
**Blocked** — a `WAITING_TIME` card shows `Countdown` (already built and already server-anchored:
"window open — opening now", never "go"). **The gate does not open because the countdown hit
zero; it opens because the server said so.** Poll `advance_batch` and refetch — do not flip
state client-side.
**Error** — a persistent chip, never a modal; offline is already handled in `AppShell`.

**Responsive** — mobile-first 375 px. Tap targets ≥48 px, body ≥15 px, numbers ≥18 px, no
horizontal scroll ever.

**Data** → `DC §8`. Available **now**; honest states need **B1**.

---

### S9 · Operator — Current Activity

| | |
|---|---|
| **Route** | `/operator/task/:id` (full screen on mobile) |
| **User** | Operator |
| **Density** | `operator` |
| **Extends** | `routes/TaskDrawer.tsx` — promote to a route, keep the drawer for desktop |
| **Answers** | *What exactly do I record, and can I submit?* |

**Layout** — `UI_DESIGN_SPEC §4.1`, unchanged. Scope line · activity title ≥20 px · target from
② · last comparable actual · the input, 28 px mono in a 56 px-tall target · machine with a
change affordance · evidence block · golden rule verbatim · one 52 px full-width **Submit**.

For a load-scoped activity the **running-total component** sits above the input:

```
TARGET     21.0 MT
LOADED     17.8 MT  ████████████████░░░░  85%
REMAINING   3.2 MT
LOADS       9 / ~11
```

This is the one place a percentage bar is correct — it measures **material**, not batch
progress, and `PROCESS_V2 §2` calls it *"an important visual component"*.

**Hierarchy** 1 what to record 2 what it should be 3 evidence 4 submit.

**Primary** — Submit (`submit_activity`).
**Secondary** — start the activity (`start_activity`) · change machine · add a remark · capture
evidence → S10.

**Loading** — field-shaped skeletons; the golden rule renders as soon as it is known.
**Empty** — n/a.
**Blocked** — three distinct cases, each stated on the face of the card:
  · not READY — the blocked reason from the row
  · evidence outstanding — **Submit stays enabled**; `submit_activity` records the values, holds
    at `IN_PROGRESS` and returns the outstanding requirement by name. Show that name.
    *Evidence gates submission, not recording* — an operator with a dead camera still records
    the reading.
  · batch not active — "This batch has not been activated."
**Error** — the RPC message verbatim, above the button, non-blocking.

**Responsive** — mobile-first. ≥1024 may open as the existing drawer beside `MyWork`.

**Data** → `DC §9`. Available **now**.

---

### S10 · Operator — Evidence Capture ⛔ **A4 (K3)**

| | |
|---|---|
| **Route** | inside S9, as a sheet |
| **User** | Operator, lab technician |
| **Answers** | *What proof is required, and have I provided it?* |

**Layout** — **N named requirements, individually satisfied. Never a photo count**
(`EVIDENCE_CONFIGURATION_MODEL §1`). The reference case is `NMIX-ROTAVATE`:

```
EVIDENCE                              2 / 3
✓ Before Mix          [ view ]
✓ After Mix           [ view ]
○ Ammonium Sulphate Hand Mix   [ capture ]   ← required
```

**Hierarchy** 1 what is still missing 2 what is done 3 what has been captured.

**Primary** — capture the named outstanding requirement (camera, `capture_hint` shown).
**Secondary** — review a captured item · retake · pick from library where `media_kinds` allows.

**Loading** — thumbnail skeletons at the requirement count.
**Empty** — the requirement list with every item `○`; never "no photos".
**Blocked** — **today, and until A4 lands, this screen cannot be built honestly.** `mark_evidence`
increments a counter with no file, no path and no uploader, and performs no ownership check.
Until A4: render the requirement list read-only with "Photo capture is released with evidence
storage. Recording a requirement as met without storing the file would be a false record."
**Do not ship a capture button that increments a counter.**
**Error** — a failed upload keeps the local file and offers retry; it must never silently mark
the requirement satisfied.

**Responsive** — mobile only in practice; ≥1024 shows the same list with a file picker.

**Data** → `DC §10`. ⛔ **A4** entirely.

---

### S11 · Supervisor — Control Room

| | |
|---|---|
| **Route** | `/supervisor/control-room` |
| **User** | Supervisor, GM |
| **Density** | `supervisor` |
| **Replaces** | `Placeholders.tsx › ControlRoom` |
| **Answers** | *Can this process continue?* |

**Layout** — **ordered by urgency, not by batch** (`UI_DESIGN_SPEC §4.3`). Six collapsible
bands, each with a count:

```
TIME-CRITICAL GATES   opening or expiring within 4 h        [now]
LAB FAILURES / NO-SPEC RESULTS                              ⛔ B5
OPEN DEVIATIONS                                             ⛔ B2
AWAITING RELEASE                                            ⛔ B2
EVIDENCE REVIEW                                             ⛔ A4
ACTIVE BATCHES                                              [now]
```

**Hierarchy** 1 what expires soonest 2 what has failed 3 what is waiting on this person
4 the board.

**Primary** — release / hold / return **in place, two taps, with a mandatory reason**. No
navigation to act.
**Secondary** — open the batch · open the evidence panel · escalate to GM.

**Loading** — band headers render immediately with count skeletons, so the shape is stable.
**Empty per band** — "No open deviations." plus what would create one.
**Blocked** — bands whose backend is absent render the band header with an explicit "released
with B2" note rather than a zero count. **A zero that means "not built" is a lie.**
**Error** — per band; one failing band does not blank the room.

**Responsive** — tablet and desktop. <768 bands become a single accordion column.

**Data** → `DC §11`. Time-critical gates and active batches are buildable **now**; the rest
⛔ **B2**, **B5**, **A4**.

---

### S12 · Lab Technician — Lab Queue

| | |
|---|---|
| **Route** | `/lab/queue` |
| **User** | Lab technician, supervisor |
| **Density** | `lab` |
| **Replaces** | `Placeholders.tsx › LabQueue` |
| **Answers** | *Which batch needs a measurement now?* |

**Layout** — `lab_technician_batch_process.md §17.2`: a dashboard of **all master batches**,
each card showing batch, current day, current activity, whether action is required, and the
state of the previous submission. Above it, the three urgency bands of `UI_DESIGN_SPEC §4.2`:
**overdue** (with what each is blocking) · **today** · **retest required**.

```
Master Batch 1   Day 4 · Unloading            ACTION REQUIRED  [ open ]
Master Batch 2   Day 8 · Turning / Bunker     ACTION REQUIRED  [ open ]
Master Batch 4   Day 1 · Fibre Wetting        SUBMITTED        [ view ]
```

**Hierarchy** 1 overdue and what it blocks 2 due now 3 retests 4 everything else, calm.

**Primary** — open a batch's current lab activity → S13.
**Secondary** — filter to my submissions · view a rejected item.

**Loading** — card skeletons at the active batch count.
**Empty** — "No measurements are due. The next lab checkpoint is the bunker fill panel on
MB-118, which opens when bunker loading is submitted."
**Blocked** — **the technician is never blocked by another batch.** A submitted item shows
`SUBMITTED` and the technician moves on. This is explicit in the lab document and must not be
implemented as a modal or a lock.
**Error** — inline with retry; other cards keep rendering.

**Responsive** — mobile-first, bench-side. One card per row at 375 px.

**Data** → `DC §12`. **Buildable now on real data** — nine lab activities already exist in
`batch_activity` with `responsible_role = 'lab_tech'` and `lab_parameters`. Full sample/result
lifecycle ⛔ **B5**.

---

### S13 · Lab Technician — Current Sample / Test

| | |
|---|---|
| **Route** | `/lab/task/:id` |
| **User** | Lab technician |
| **Density** | `lab` |
| **Answers** | *What do I measure, and is it in spec?* |

**Layout** — one batch, one activity, **only the parameters that activity requires**
(`lab_technician_batch_process.md §22`: show what is needed now, not the whole process). Batch
header with a compact stage strip, then the parameter block, then evidence, then submit.

Two input families, visually distinct (`§18`):
- **numerical** — moisture, pH, EC, TDS, dry weight, N, ash, C:N, heights. Numeric keypad, unit
  shown, spec inline.
- **observational** — smell, colour, spring/squeeze, actinomycetes. Enumerated controls, never
  free numbers.

Verdict computes **live per parameter** as values are entered — the technician sees `⚠ below`
before submitting. Derived values (C:N, TDS) render in `lock` with a `derived` chip and no
input: *"C:N is computed from ash and nitrogen. It is never typed."*

**Where two specs disagree, both render side by side with the conflict ID and neither
auto-fails.** C-01 is the reference case: operator target 68–69 % and lab band 75–78 %.

**Hierarchy** 1 which batch and stage 2 the parameters due 3 spec beside each value 4 evidence
5 submit.

**Primary** — submit for approval.
**Secondary** — open the method sheet (`lab_method`) · pick the instrument with its calibration
chip · add an observation note · request a retest.

**Loading** — parameter-shaped skeletons from `lab_parameters`.
**Empty** — n/a.
**Blocked** — ⛔ **C-32 is unresolved: who approves a lab submission?** The lab dictation says
GM; `ROLE_AND_APPROVAL_MODEL` says the Supervisor and that the GM never approves per-activity
work. **The UI must not name an approver.** Ship the button as **"Submit for approval"** and
show the destination as configuration once answered. Do not write "Submit to GM".
**Error** — RPC message verbatim; entered values are never lost on a failed submit.

**Responsive** — mobile-first, bench-side, one hand.

**Data** → `DC §13`. Values and evidence **now**; versioning, retest and instrument binding
⛔ **B5**; approval routing ⛔ **C-32**.

---

### S14 · Manager — Resource View

| | |
|---|---|
| **Route** | `/manager/resources` |
| **User** | Manager, admin, GM |
| **Density** | `manager` |
| **Extends** | `routes/Placeholders.tsx › Resources` (real reference data already) |
| **Answers** | *Can the factory physically execute this plan?* |

**Layout** — vessel Gantt across bunkers and tunnels over a 21-day window, all batches; machine
load grid below; conflicts as a list naming **both** contending batches with a resolve action.
Straw occupancy is **visually distinct from compost but equally blocking** (`C-24`, `TBD-28`).

**Hierarchy** 1 conflicts 2 occupancy over time 3 machine hours 4 the fleet inventory.

**Primary** — open a conflict and resolve it.
**Secondary** — filter by vessel kind · change the window · open a batch.

**Loading** — Gantt skeleton at the real vessel count.
**Empty** — "No vessel is occupied. Occupancy opens when a batch's first bunker load is
submitted."
**Blocked** — until **A5**, the existing reference view stays and states plainly: "The vessel
timeline and conflict list arrive with the occupancy model. Today's double-booking check is a
±2-day proximity heuristic, not an occupancy record." The current `Resources` screen already
says something close to this — keep that honesty.
**Error** — inline per region.

**Responsive** — desktop-first; Gantt scrolls inside its own container. <768 becomes a list of
vessels with current occupant.

**Data** → `DC §14`. Fleet and vessel inventory **now**; Gantt, machine hours and real conflicts
⛔ **A5**. Machine hours are **derived from stints — no editable hours field may exist**
(`DEMO_PLAN_V2` criterion 20).

---

### S15 · GM — Decision Package  ⛔ **B6 + B2 + B4 + B5**

**Added 22 Aug 2026.** Not among the fourteen screens originally specified. B1 found that the
seeded `GM_APPROVAL` gate on `TN-LOAD` has nowhere to record a decision, and tracing that showed
neither a data step nor a screen owned it. `ROLE_AND_APPROVAL_MODEL §5` and product contract §20
both specify it. Client decision, 22 Aug: add it.

| | |
|---|---|
| **Route** | `/batch/:id/checkpoint/:n` |
| **User** | GM only. This is the one management surface that **acts**. |
| **Density** | `gm` |
| **Answers** | *Should this batch continue, and on what terms?* |

**Why a screen and not a tab on S2.** `UI_CONTROL_TOWER_SPEC §12` states the evidence panel
"answers; it does not act". A decision surface carries different stakes: it is snapshotted, it is
attributable, and its reason text becomes part of the permanent record. Folding it into a
monitoring page blurs a boundary the rest of this spec keeps sharp.

**Layout** — the nine sections of `ROLE_AND_APPROVAL_MODEL §5`, in that order: plan · actual
execution · quality · evidence · deviations · corrective actions · resource usage · current
position · **proposed next step**. A full-page read with a fixed action bar.

**Information hierarchy.** Section 9 is the point of the document — everything above it is the
case for the decision. `S3f` proves it: the 2.25 m fill height and the 3→4 tunnel pooling were
both real, both known at that moment, and both later identified as root causes. Section 9 is the
screen that surfaces them while the decision is still open. **Render its warnings at the top of
section 9, not buried in it.**

**Primary action** — `APPROVE` · `APPROVE WITH CONDITIONS` · `RETURN FOR REVIEW`.
Reason is **mandatory** on all three, not just on return.
**Secondary** — drill into any section's underlying activity (opens S3) · view the prior
checkpoint's decision.

**Loading** — section skeletons in the nine-section shape, so the reader sees the argument's
structure before its content.
**Empty** — a section with no content says why: "No deviations were raised in this phase" is a
finding, not an absence.
**Blocked** — until B6, the screen renders its stated blocked state naming B6. Sections whose
data steps have not landed (quality → B5, deviations → B2, variance → B4) render individually
blocked **rather than empty** — a blank deviations section reads as "nothing went wrong", which
is a lie the GM would act on.
**Error** — per section; one failing section must not blank the package.

**Responsive** — desktop-first; the action bar is fixed. Below 768 px the package is readable
but the action bar requires an explicit confirm step, because an accidental approve is not
recoverable.

**The snapshot rule.** `ROLE_AND_APPROVAL_MODEL §5`: *"the GM's approval is bound to exactly what
they saw, not to whatever the data later became."* The rendered package is captured at the moment
of decision and stored with it. Re-opening a decided checkpoint shows the **snapshot**, never a
re-query.

**Data** → B6's `management_checkpoint` / `checkpoint_decision`, plus the derived sections.

---

## 3. Component ledger

### 3.1 Exists — extend, do not rewrite

| Component | Where | Extension |
|---|---|---|
| `FiveLayerNode` | `components/node/` | management labelling (S3); media rendering in ④; `gm` density already present |
| `AppShell` / `PageHeading` | `components/layout/` | nav entries for the moved/new routes; nothing structural |
| `Chip` `ConflictMarker` `Stat` `Field` `NumberInput` `Card` `Bar` `Countdown` `EmptyState` | `components/primitives/` | add `Skeleton`, `Band`, `Sheet`; **`Bar` is restricted to material totals — never batch progress** |
| `Gallery` | `routes/Gallery.tsx` | **this is the fixture harness for the whole Track C**; extend it to cover every new component |
| `BatchDetail` | `routes/` | becomes `BatchPage` with tabs; day grouping replaced by hour grouping |
| `TaskDrawer` | `routes/` | promoted to `/operator/task/:id`, drawer retained for desktop |
| `MyWork` | `routes/` | bands; poll `advance_batch` (`DEMO_SPRINT_ORDER §0.1`) |
| `ScheduleBuilder` | `routes/` | validation panel promoted to a first-class region |
| `NewBatch` | `routes/` | `start_at`, consequence rail, role binder |
| `Resources` | `routes/Placeholders.tsx` | extracted to its own file, Gantt added at A5 |

### 3.2 Create

`TimeLabel` · `HumanDuration` · `HourRail` · `StaircaseCalendar` · `ExceptionBand` ·
`PlayheadContext` + `usePlayhead` · `Narrative` · `EvidenceDecisionPanel` · `EventStream` ·
`ValidationPanel` · `RunningTotal` · `LabParameterField` · `ObservationField` ·
`VesselGantt` · `MachineLoadGrid` · `Skeleton` · `useDensity`.

`ProductionGraph` is partly present in `ProcessExplorer.tsx` — **extract and extend, do not
start over.**

### 3.3 Two API modules have drifted

`api/batch.ts` and `api/batches.ts` both export `listBatches`, `getBatch`, `createBatch`,
`activateBatch` with different shapes. Two sources of truth for the same reads will produce two
different batch pages. **Consolidate to one module during C1**, before any new screen consumes
either. This is cleanup, not redesign.

---

## 4. Build order for Kiro

Strictly after **T0** is green. Nothing here starts before `time.test.ts` passes.

| # | Step | Depends on | Buildable |
|---|---|---|---|
| **C1** | `useDensity`, `TimeLabel`, `HumanDuration`, `Skeleton`, `PlayheadContext`; consolidate the two API modules; extend `Gallery` as the fixture harness | T0 | **immediately** |
| **C2** | `HourRail` + `StaircaseCalendar` in `Gallery` against fixtures | C1 | **immediately** |
| **C3** | **S1 Control Tower** — counters, `ExceptionBand`, staircase; connect to real batches | C2, A2 | shell now, live at A2 |
| **C4** | **S2 Batch Page** — rail, tabs, playhead; extract `ProductionGraph`; `EventStream` | C2, A2, B1 | shell now |
| **C5** | **S3 Evidence/Decision Panel** — `FiveLayerNode` management labelling | C1 | now; media at A4 |
| **C6** | **S9 + S8** operator route, bands, `RunningTotal`, `advance_batch` poll | C1 | **now on real data** |
| **C7** | **S12 + S13** lab queue and sample entry; `LabParameterField`, `ObservationField` | C1 | **now on real data**; approver unnamed (C-32) |
| **C8** | **S6 + S7** `start_at`, consequence rail, `ValidationPanel` | A2 | S7 now, S6 at A2 |
| ~~**C9**~~ | ✅ **DONE 22 Aug** — S11 Control Room. 4 of 6 bands live; lab (B5) and evidence-review (needs a flagging mechanism no document specifies) render as not-built rather than zero | B2 | **done** |
| **C10** | **S5** blocked state · **S14** honest reference state | — | **immediately** |
| **C11** | `Narrative` — pure function, testable against fixtures | B4 | **now against fixtures** |
| **C12** | **S10 Evidence Capture** | A4 | **blocked** |
| **C13** | **S14 Gantt** + `MachineLoadGrid` | A5 | **blocked** |
| **C15** | **S15 GM Decision Package** — nine sections, snapshotted, mandatory reason | B6, B2, B4, B5 | **blocked** |
| **C14** | Acceptance run against `UI_ACCEPTANCE_CRITERIA.md`; both themes; 375 px sweep | all | last |

### 4.1 Buildable immediately against typed interfaces
C1, C2, C5, C10, C11, and the shells of C3 and C4.

### 4.2 Buildable immediately **against real data**
C6 (operator — `batch_activity` and `submit_activity` exist), C7 (lab — nine seeded lab
activities with `lab_parameters` and `lab_spec` exist), C8's S7 (`validate_batch`,
`set_activity_plan`, `activate_batch` all exist).

### 4.3 Blocked, and by what
| Screen | Blocked by |
|---|---|
| S10 Evidence Capture | **A4** — storage, `evidence_media`, ownership checks |
| S14 Gantt, machine hours | **A5** — occupancy and `machine_usage` |
| S11 deviation bands | **B2** — the deviation entity |
| S13 versioning, retest, instruments | **B5** — the lab subsystem |
| S13 approver naming | **C-32** — a factory question, not a build task |
| S2 `WHERE THE TIME WENT` | **B4** — variance attribution |
| S1/S2 real hours | **A2** — the hour axis |
| S5 Monthly Schedule | **C-19, C-20** — factory questions |
| S15 GM Decision Package | **B6** to record a decision; **B2/B4/B5** for six of its nine sections |

---

## 5. What this workstream must not do

- Replace the design system, the tokens, or `FiveLayerNode`.
- Create a second application, a second auth model, or a role-specific fork of a shared screen.
- Reproduce the legacy APK's page-per-stage navigation. It is reference only.
- Invent data, a threshold, a duration, an approver, or a schedule mapping.
- Show a zero that means "not built".
- Ship a capture button that increments a counter without storing a file.
- Put a batch percentage-complete anywhere in the management layer.
- Add a sixth semantic colour.
