> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# Audit before the v2 refactor

**Read from the repository and the live database, not from memory.**

---

## 1 · Repository architecture

```
src/
  api/          13 modules · 2,940 lines   the ONLY layer that talks to the database
  components/
    primitives/ buttons, chips, cards, empty states          L1
    domain/     TimeLabel · HumanDuration · PlayheadContext   L2 — know domain shapes
    composite/  HourRail · Narrative · EventStream · …        L3 — take props, never query
    layout/     AppShell (management) · FieldShell (floor)
  routes/       19 screens · 7,989 lines                      L4 — the only layer that queries
  domain/       contracts (shared types) · time (pure functions)
  theme/        tokens.css — every colour and face as a CSS variable
supabase/
  migrations/   0001 … 0031
  seed/         the process definition, as data
tests/          23 files · 410 tests, most running against the real database
```

**The layering is enforced by a test**, not by convention: nothing below `routes/` may import
`api/`. That rule has caught two components this week and it is why the primitives can be built as
pure components without arguing about it.

**The process is already data.** 71 activity templates across days −7 to 22, with durations,
dependencies, evidence requirements, lab parameters, resource requirements and cardinality rules all
stored as rows. Changing a duration is a data edit today.

---

## 2 · Screens and components that exist

| Screen | Lines | State |
|---|---|---|
| ScheduleBuilder (batch plan) | 1,245 | works — plan review, assignment, hours, movements |
| BatchDetail (activity list) | 996 | works |
| LabQueue | 704 | works — sample, reading, retest |
| NewBatch | 592 | works — 5 steps |
| TaskDrawer (operator input) | 555 | works |
| ProcessExplorer | 491 | works |
| MyWork (operator) | 438 | works |
| ControlRoom (supervisor) | 430 | works |
| BatchPage | 402 | works — rail, narrative, events, individual batches |
| MonthlySchedule | 346 | **built recently — not yet verified by me** |
| Plant | 238 | works |
| ControlTower | 226 | works |
| AdminToday | 222 | works |

| Component | Lines | Purpose |
|---|---|---|
| MovementPlan | 400 | the physical journey, bunker by bunker |
| Narrative | 313 | why a batch is late, in prose |
| StaircaseCalendar | 233 | concurrent batches on the calendar |
| HourRail | 192 | plan and actual on the batch axis |
| EventStream | 188 | everything that happened, in order |
| ExceptionBand | 100 | what needs a person |

---

## 3 · Backend shape

**54 tables · 22 views · ~90 domain functions.** More than I had assumed — several capabilities were
added while other work was going on.

Already there and unused or under-used by the UI:

| | |
|---|---|
| `monthly_schedule_import` / `_group` + import and claim functions | the monthly schedule spine |
| **dev clock** — a settable "now" with play/pause | demo time travel |
| `machine_usage` + open/close stint functions | machine hours, derived |
| `v_prebatch_material_check` + pre-batch sampling | the PRE-H0 zone, partially |
| `management_checkpoint` + decision recording | the GM decision layer |
| `v_activity_timing` | standard · plan · actual side by side, per activity |

---

## 4 · Existing components mapped to the seven primitives

| Primitive | Exists | What is there | Gap |
|---|---|---|---|
| **P1 H-hour Rail** | **Yes** | `HourRail` — plan and actual rails, dashed forecast tail, batch-day ticks, three time registers | Forecast is a tail, not a register. Reads the browser clock. |
| **P2 Process Graph** | **No** | dependencies are stored and enforced; nothing draws them | Build |
| **P3 Parallel Lanes** | **No** | every activity carries its stream | Build |
| **P4 Resource Map** | **Partly** | `Plant` screen — vessels, occupied/held/empty | Extract to a component; add machines |
| **P5 Attention Stream** | **Partly** | `ExceptionBand` plus separate bands inside ControlRoom | Unify into one component |
| **P6 Proof Drawer** | **No** | `TaskDrawer` is an input form, not a proof view | Build — **and no evidence media renders anywhere in the product** |
| **P7 Causality Chain** | **Partly** | `Narrative` says it in prose, and says it well | No visual chain, no resource → constraint link, no H552 impact |

---

## 5 · What must be refactored

**1 · The clock. This is the one that matters.**

The database has a dev clock, it is **enabled**, and it is currently set to **14 September 12:30**.
The UI does not know it exists — **21 places call the browser's clock directly.**

So right now the backend believes one time and every screen believes another. The now-marker on the
rail, every rest countdown, every "waiting 33h" and every batch hour is computed against the wrong
instant. In a demo this reads as the product being broken.

One source of now, honoured everywhere. Nothing else can be trusted until this is done.

**2 · Plant screen → Resource Map component**, so the GM lens and the Admin lens can both use it.

**3 · ExceptionBand + ControlRoom's bands → one Attention Stream**, ordered by wait, naming who is
waited on.

**4 · HourRail** — make forecast a real fourth register rather than a dashed tail of actual.

**5 · Tunnel assignment** — currently offered during batch creation. The PRD says it must not be
required at H0. Make it optional and surface it as a later decision.

---

## 6 · Genuinely missing

- **Evidence media never renders.** Photographs are captured, stored and counted. Not one is
  displayed anywhere in the product. This is the single largest hole.
- Process Graph, Parallel Lanes, Proof Drawer, Causality Chain as components
- **Delay ticket** — operator raises, manager approves, forecast shifts, H552 impact appears. We have
  deviations; we have no forecast that moves.
- GM "Factory Now" and the Founder lens as distinct surfaces
- Daily Factory Report
- Machine stints are never opened, so machine hours are always zero

---

## 7 · Smallest safe sequence

Each step ends with typecheck, tests and a production build.

| | Step | Why here |
|---|---|---|
| **0** | **One effective now**, honouring the dev clock | Small, touches 21 call sites, and every time display is wrong until it is done |
| **1** | The seven primitives as components, with every state | The vocabulary the rest is built from |
| **2** | Operator and Lab lenses | Smallest, most used, and they prove the capture chain |
| **3** | GM Factory Now — attention stream + resource map | Most visible lens; both parts already half-exist |
| **4** | Batch Story — rail, graph, lanes, one playhead | Composition, not new data |
| **5** | Proof Drawer with real media | The largest hole; needs the storage path proven end to end |
| **6** | Manager Decision Center | Mostly existing logic behind the new primitive |
| **7** | Admin Batch Setup | Longest flow, benefits most from primitives existing first |
| **8** | Parallel Operations · Resource Map screen · Daily Report | |

**The backend is not touched before step 5.** The only thing that will need it is the delay ticket
and forecast propagation, and that is a new record beside the existing ones.

---

## The acceptance test for the whole refactor

**Change a duration in the process data. No screen may need editing.**

That is the test to run before trusting any of this, and it is the one that proves the UI renders
the process rather than containing it.

---

## Carried, not decided

Turner T2 has `6–8h` in the database and the newest source states the duration is unknown. A value
was invented where the factory states none. It stays flagged until the factory answers.
