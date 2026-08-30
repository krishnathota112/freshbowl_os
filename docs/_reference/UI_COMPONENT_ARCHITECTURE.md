# UI COMPONENT ARCHITECTURE

Companion to `UI_IMPLEMENTATION_PLAN.md`. Defines the component tree, where state lives, and the
harness that lets Track C build ahead of Tracks A and B without inventing anything.

Design system, tokens and the five-layer node come from `UI_DESIGN_SPEC.md` and are **not**
redefined here.

---

## 1. Four layers, and what may depend on what

```
  L4  ROUTES        one per screen · owns queries · owns URL state
       ▲            may import L3, L2, L1
  L3  COMPOSITES    HourRail · StaircaseCalendar · ProductionGraph · EventStream
       ▲            Narrative · EvidenceDecisionPanel · ValidationPanel · VesselGantt
       │            may import L2, L1 — never a route, never an api module
  L2  DOMAIN UI     FiveLayerNode · TimeLabel · HumanDuration · RunningTotal
       ▲            LabParameterField · ObservationField · ExceptionBand
       │            knows domain types · may import L1 only
  L1  PRIMITIVES    Chip · ConflictMarker · Stat · Field · NumberInput · Card
                    Bar · Countdown · EmptyState · Skeleton · Band · Sheet
                    knows tokens only · imports nothing from the app
```

**Enforced rules**

1. **L1 and L2 never call Supabase.** They take props. This is what makes them renderable from
   fixtures in `Gallery` before any RPC exists.
2. **L3 never calls Supabase either.** Composites take data as props. The route fetches.
3. **Only L4 uses `useQuery` / `useMutation`.** One place to reason about caching, one place to
   invalidate.
4. **Nothing below L4 reads `useAuth()` except through `useDensity()`.** Role leaks into layout
   in exactly one place.
5. **No component imports another route.** `TaskDrawer` becoming `/operator/task/:id` is a route
   that renders a composite, not a route importing a route.

Add an ESLint `no-restricted-imports` rule per directory so these hold without review.

---

## 2. Component tree

```
App
├── SignIn
└── AppShell                                  [exists]
    ├── RoleBanner (claim-vs-profile warning)  [exists — keep]
    ├── Nav
    └── <Route/>
        │
        ├── ControlTower                                        S1  [new]
        │   ├── TowerCounters            L2  running/on-plan/decision/held
        │   ├── ExceptionBand            L2  ← also used by ControlRoom
        │   │   └── ExceptionRow             states waiting-since
        │   └── StaircaseCalendar        L3
        │       ├── DateAxis                 calendar dates, weekday names
        │       ├── NowLine                  exactly one per board
        │       └── BatchBar × n         L2  plan/actual rails, flags
        │           └── HourRail (compact variant)
        │
        ├── BatchPage                                           S2  [extends BatchDetail]
        │   ├── BatchHeader              L2  TimeLabel + HumanDuration
        │   ├── HourRail (full)          L3  plan · actual · forecast · rest bands
        │   ├── TimeAttribution          L2  "where the time went", 3 + remainder
        │   ├── PlayheadProvider         ─── one position, shared by the three views
        │   │   ├── ProductionGraph      L3  [extract from ProcessExplorer]
        │   │   │   └── FiveLayerNode × n L2 compact form
        │   │   ├── EventStream          L3
        │   │   └── Narrative            L3  pure function of attribution + details
        │   ├── ActivitiesTab            L4-ish  list of FiveLayerNode
        │   ├── ScheduleTab              ─── ScheduleBuilder                S7 [exists]
        │   │   └── ValidationPanel      L3  [new] blocking/warning/info
        │   └── EvidenceDecisionPanel    L3  [new] drawer, ?activity=<id>   S3
        │       └── FiveLayerNode (management labelling)
        │           └── EvidenceMediaGrid L2 [new] ⛔ A4
        │
        ├── AdminToday                                          S4  [exists]
        ├── MonthlySchedule                                     S5  [new, blocked state]
        ├── NewBatch                                            S6  [exists]
        │   ├── StartAtField             L2  [new] date+time, TBD-47 marker
        │   ├── MaterialRoleBinder       L2  [new]
        │   └── ConsequenceRail          L3  [new] derived counts, computed baseline
        ├── Batches                                                 [exists]
        ├── ProcessExplorer                                         [exists — donor for graph]
        ├── ReferenceData                                           [exists]
        │
        ├── MyWork                                              S8  [exists]
        │   └── TaskCard                 L2  → FiveLayerNode operator density
        ├── CurrentActivity                                     S9  [from TaskDrawer]
        │   ├── RunningTotal             L2  [new] material totals only
        │   ├── ValueField               L2  reuses Field + NumberInput
        │   └── EvidenceCapture          L3  [new] ⛔ A4                     S10
        │
        ├── LabQueue                                            S12 [new]
        │   └── LabBatchCard             L2  [new]
        ├── CurrentSample                                       S13 [new]
        │   ├── LabParameterField        L2  [new] numeric + spec inline
        │   ├── ObservationField         L2  [new] enumerated
        │   └── DerivedValue             L2  [new] lock tone, no input
        │
        ├── ControlRoom                                         S11 [new]
        │   ├── Band × 6                 L1  [new] collapsible, counted
        │   ├── ExceptionRow             L2  ← shared with ControlTower
        │   └── DecisionActions          L2  [new] release/hold/return + reason ⛔ B2
        │
        ├── ResourceView                                        S14 [extract]
        │   ├── VesselGantt              L3  [new] ⛔ A5
        │   ├── MachineLoadGrid          L3  [new] ⛔ A5
        │   └── FleetInventory           L2  [exists inside Placeholders]
        │
        └── Gallery (DEV)                                           [exists — the harness]
```

---

## 3. State

### 3.1 Server state — TanStack Query, already in use

Key convention, so invalidation is mechanical:

```
['batches']                       list
['batch', id]                     one batch
['batch-activities', id]          instances
['activity', activityId]          detail + values + evidence reqs
['schedule', id]                  schedule rows
['validate', id]                  findings
['my-work', userId]               operator queue
['lab-queue']                     lab queue
['exceptions']                    control room + tower band
['attribution', id]               where the time went           ⛔ B4
['occupancy', window]             vessel Gantt                  ⛔ A5
```

**Mutations invalidate by prefix, never by refetching everything.** A submit invalidates
`['activity', id]`, `['batch-activities', batchId]`, `['my-work']`.

**Polling.** `MyWork` and `BatchPage` poll `advance_batch` on an interval and refetch
(`DEMO_SPRINT_ORDER §0.1`). This is not a client timer deciding anything — **the client asks,
the server decides from its own clock.** Never flip a state locally when `Countdown` hits zero;
`Countdown` already renders "window open — opening now" rather than claiming the gate is open.

### 3.2 URL state — the playhead lives here

```
/batch/:id?tab=overview&h=137&activity=<uuid>
```

`h` is the batch hour. Putting it in the URL makes a moment in a batch **shareable** — a GM can
send "look at MB-118 at H137" to a supervisor. That is worth more than a cleaner component API.

`usePlayhead()` reads and writes the `h` param; `PlayheadProvider` is a thin context over it so
the graph, stream and narrative subscribe without prop-drilling.

### 3.3 Client state — Zustand, sparingly

Already a dependency. Use it for exactly three things and nothing else: theme (currently in
`AppShell`), the collapsed/expanded state of `ControlRoom` bands, and the draft of an in-flight
operator entry so a mis-tap does not lose typed values.

**Never** batch state, activity state, gate state or evidence state. Those are server truth.
`SOURCE_INVENTORY §S8e` records exactly what happened last time state lived in the browser.

### 3.4 `useDensity()`

```ts
function useDensity(): Density   // from useAuth().role, one mapping, one place
```

`operator → operator`, `lab_tech → lab`, `supervisor → supervisor`, `admin → admin`,
`manager → manager`, `gm → gm`. `FiveLayerNode` already consumes `Density`; this removes the
last reason for a component to know a role.

---

## 4. The fixture harness — how Track C runs ahead safely

`routes/Gallery.tsx` already renders `FiveLayerNode` in every state against literal props, and
is excluded from production builds (`import.meta.env.DEV` in `App.tsx`). **This is the harness
for the entire UI track.** Extend it; do not build a Storybook.

### 4.1 Fixture rules

1. Fixtures live in `src/domain/fixtures/` and are **typed with the same interfaces the API
   returns**. A fixture that does not typecheck against the real contract is a lie.
2. **A fixture may not contain a state the engine cannot produce.** No `COMPLETED` activity with
   unmet mandatory evidence. No open gate with an unfinished `SAME_SCOPE_INSTANCE` predecessor.
3. **A fixture may not contain a number the database will not hold** — no invented SOP band, no
   invented rest duration, no fabricated lab spec. Where a value is genuinely absent, the fixture
   carries `null` and the component must render `—` with the source ref.
4. **Time fixtures derive from `docs/source/book1_hour_grid.json`**, not from typed-in hours.
   One source for the hour geometry, in tests and in the gallery alike.
5. Every new L1/L2/L3 component gets a Gallery section covering: default · loading · empty ·
   blocked · error · both themes. That section is what `UI_ACCEPTANCE_CRITERIA` is checked
   against.

### 4.2 Connecting a component to real data

A fixture-backed component is finished when the route swaps the fixture for a query and
**nothing inside the component changes**. If connecting requires editing the component, the prop
interface was wrong — fix the interface in `UI_DATA_CONTRACTS.md` first.

---

## 5. Shared rules that live in components, not in review

Put these in the component so they cannot be forgotten, exactly as `FiveLayerNode` already does
with layer order, layer colour and the missing-reason defect banner.

| Rule | Enforced in |
|---|---|
| layer order and colour are fixed | `FiveLayerNode` — module constants, not props |
| a non-actionable state without a reason renders a **DEFECT** banner | `FiveLayerNode` — already built |
| a batch hour never renders without a wall clock | `TimeLabel` — takes `{startAt, hour}`, cannot render one alone |
| durations are spoken | `HumanDuration` — takes minutes, emits "1h 14m behind" |
| `Bar` is for material totals only | `Bar` gains a required `kind: 'material'` prop so a batch-progress use fails to compile |
| one `now` line per board | `StaircaseCalendar` owns `NowLine`; `BatchBar` cannot draw one |
| five semantic tones | `Tone` union in `primitives` — already correct; do not widen it |
| a disputed value shows its ID | `ConflictMarker` — already built; `LayerValue.conflictId` already wired |

The `Bar` change is small and worth it: `UI_CONTROL_TOWER_SPEC §8.3` bans batch
percentage-complete, and a type error is a better guard than a checklist item.

---

## 6. Responsive strategy

**Client decision, 22 Aug 2026 — revised: ONE application.** An earlier note in this section
called for two apps; the client then confirmed operators and lab technicians have reliable
realtime internet and the user base is ~30 people. Both drivers for a split disappear.

One codebase. A **field shell** for operators and lab technicians alongside the management
`AppShell`, chosen by role. A PWA manifest whose `start_url` is the field home, so an installed
icon opens straight into the operator's work. Route-level code splitting keeps the field entry
small. `contract §29`'s *"responsive management web / mobile-first operational surface"* is
satisfied by two shells, not two applications.

Splitting later stays cheap because `domain`, `api`, `lib/auth`, `primitives` and `node` are
already shared. See `BUILD_SEQUENCE_KIRO.md §C-FIELD` for the triggers that would justify it.

| Band | Roles optimised | Behaviour |
|---|---|---|
| <768 | operator, lab | single column, ≥48 px targets, ≥15 px body, ≥18 px numbers, one primary action, **no horizontal page scroll ever** |
| 768–1279 | supervisor | bands and tabs; wide content scrolls inside its own container |
| ≥1280 | admin, manager, gm | full board, side-by-side graph and stream |

Management screens **must remain usable** below 768 — a GM will open the tower on a phone — but
they degrade rather than compress: the staircase becomes a list, the graph drops to `STREAM`
zoom, the narrative comes first.

Task screens are **mobile-first and are not desktop-optimised**. A desktop operator gets a
centred single column, not a rebuilt layout.

---

## 7. Accessibility and motion

Carried from `UI_DESIGN_SPEC §5`, restated where the new components could break them.

- Visible keyboard focus on every interactive element, including the staircase bars and the
  playhead. The playhead is a `slider` role with arrow-key support — an hour per press,
  a batch-day per `Shift`.
- 4.5:1 contrast in **both** themes. Every new token use is checked in dark as well as light.
- **State is never carried by colour alone.** Bars use fill pattern and border as well as tone;
  the staircase distinguishes done/remaining by fill, not hue.
- `prefers-reduced-motion` — the in-progress rail pulse stops, and playhead scrubbing **snaps
  instead of tweening**. No decorative motion exists to disable, by construction
  (`UI_DESIGN_SPEC §3.2`).
- Every countdown is announced politely, not assertively; a rest opening must not interrupt a
  screen-reader user mid-sentence.
- One shared 1 s ticker for every countdown on a page — already implemented in `Countdown`,
  reuse it rather than adding intervals.

---

## 8. Performance shape

The known steady state is **~12 concurrent batches × ~72 activity instances ≈ 900 rows**
(`TIME_MODEL_CONFIRMED §2.4`, `PROCESS_V2 §17`). That is small. Do not build virtualisation,
pagination or windowing for it.

Where care is needed:
- `StaircaseCalendar` renders 12 bars × up to 552 hour segments. **Render segments, not hours** —
  an activity span is one element, not 552.
- `ProductionGraph` at `INSTANCE` zoom is the largest render. Default to `DAY`
  (`UI_DESIGN_SPEC §3.1`) and let the user zoom in.
- The playhead updates on drag. Keep it in URL state but debounce the history write; update the
  three views from context immediately.
