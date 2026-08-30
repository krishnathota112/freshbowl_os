> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# Canonical MushroomOS architecture

**Date:** 25 August 2026  
**Scope:** `D:\freshbowl_os` only. Inspect first. No product redesign. No application-code change.  
**Normative product context:** `MUSHROOMOS_CURSOR_MASTER_CONTEXT.md`  
**Canonical implementation tree:** `mushroomos/`

This document records **what exists**, **what is true**, and **how the one product is organised**. Keep / modify / archive / build decisions live in `docs/CURRENT_TO_TARGET.md`.

---

## 0. One-line product

MushroomOS is one factory production planning, execution, traceability, and management-control system: **one backend, one H0–H552 clock, one process definition (`PROCESS-2026B`), two client surfaces (web + mobile) that share that backend, seven roles on both surfaces**.

The owner's question: **Are we following the process, and if not, why?**

```text
MONTHLY SCHEDULE
      ↓
ADMIN CREATES MASTER BATCH
      ↓
SYSTEM GENERATES H0 → H552 PLAN
      ↓
PLAN REVIEW + ACTIVATION
      ↓
OPERATOR + LAB + RESOURCES EXECUTE
      ↓
SERVER TIMESTAMPS + EVIDENCE + READINGS
      ↓
PLAN vs ACTUAL
      ↓
DEVIATIONS / DECISIONS
      ↓
MANAGEMENT CONTROL TOWER
      ↓
QUALITY → GROWING ROOM → YIELD
```

---

## 1. APK inventory (inside this folder)

Binary `.apk` files are not indexed by the workspace search (likely gitignored). Inventory is from **packaging source, extracted assets, and this folder's own APK documentation**.

| Artifact | Location | Identity | Framework | Backend | What it is |
|---|---|---|---|---|---|
| Canonical Capacitor project | `mushroomos/android/` | `in.freshbowl.mushroomos` · label **MushroomOS** · versionName `1.0` | Capacitor 6 WebView wrapping the Vite React build (`webDir: dist`) | Live Supabase HTTPS (`@supabase/supabase-js`) | The Android shell for the **current** product. Permissions: `INTERNET` only. |
| Documented demo APK | `mushroomos/dist-apk/MushroomOS-demo.apk` (cited in `docs/DEMO_AND_APK.md`; file not visible to search) | `in.freshbowl.mushroomos` · ~3.9 MB debug-signed | Same Capacitor wrapper | Same Supabase | Sideloadable build of the **canonical web app**. No OTA. |
| Extracted legacy APK | `apk_extracted/` | Documented in `docs/SOURCE_INVENTORY.md` S8 as `MushroomOS-debug.apk` / Capacitor (WebView). Packaged HTML lives under `assets/public/` | Cordova allowlist + static HTML/JS (not the React app) | Hard-coded GoTrue project `omsxtifyzlldaxkeqerx.supabase.co` **plus** unsalted local fallback accounts | 17 stage HTML screens + localStorage “progress”. Not the current product. |
| Legacy stage screens | `apk_extracted/assets/public/stage_*.html`, `phase_*.html` | Linear SOP pages | Static HTML | None for execution (localStorage) | Operator-shaped stage forms. Visual / field-name **reference** only. |
| Legacy chrome screens | `login.html`, `home.html`, `workflow.html`, `planning.html`, `records.html`, `approvals.html`, `notifications.html`, `users.html`, `admin_dashboard.html`, `profile.html` | 3 roles: operator / admin / chairman | Static HTML | Hybrid auth | Chairman exists here as a **viewer**. Not in the current `app_role` enum. |
| Legacy logic | `apk_extracted/assets/public/app.js`, `auth.js`, `sop-spec.js`, `demo.js` | `TIME_SCALE = 3600` demo accelerator; `STAGE_ORDER` linked list; `SOP_TARGETS` advisory | Client JS | Optional GoTrue | Explicitly **not** a specification (`SOURCE_INVENTORY` S8). |

**What the legacy APK proves (and must not be rebuilt):**

1. No Master Batch / Individual Batch / bunker / tunnel scope.  
2. No server-authoritative timestamps.  
3. No lab entity.  
4. Progression is a localStorage linked list.  
5. SOP targets do not gate submission.  
6. Only three roles; chairman is a viewer, not a control tower.  
7. SOP SmartArt (S1a) was never the runtime process.

---

## 2. APK / source families and classification

| Family | Classification | Path | Role in the one product |
|---|---|---|---|
| `mushroomos/` React + Vite + Capacitor + Supabase | **CANONICAL** | `D:\freshbowl_os\mushroomos` | The only source that ships. Web and mobile are **one application**; Capacitor is a wrapper, not a second business layer. |
| `mushroomos-codex/` | **EXPERIMENT / REFERENCE** | `D:\freshbowl_os\mushroomos-codex` | Near-clone of canonical. Extra: `/admin/schedule` `MonthlySchedule`, `api/monthlySchedule.ts`, `lib/monthlyScheduleImport.ts`, migration `20260824192339_monthly_schedule.sql`. Do not run as a second product. Merge the schedule work **into** canonical, then archive the tree. |
| `apk_extracted/` | **LEGACY** | `D:\freshbowl_os\apk_extracted` | Historical HTML operator shell. Keep for field-name / visual memory. Never connect it to the live database as an execution client. |
| `docs/` product corpus | **CANONICAL (truth, not code)** | `D:\freshbowl_os\docs` + root contracts | Process, time, lab, movement, UI, conflicts. Conflicts stay visible; they are not silently “fixed” in code. |
| Factory source IDs S1–S7 | **CANONICAL (factory record)** | Cited in `docs/SOURCE_INVENTORY.md` (`mails/`, schedules, lab workbooks) | Authoritative for structure and measurements. S8 (legacy APK) is **not**. |
| `mushroomos-codex/.npm-cache/` | **ARCHIVE** | cache | Tooling debris. Not product. |
| Dev Gallery route | **EXPERIMENT** | `src/routes/Gallery.tsx` — **DEV only**, omitted from production chunks | Component regression surface. Not a factory screen. |

There is **no second mobile business logic**. `FieldShell` vs `AppShell` is chrome. Same `App.tsx`, same RPCs, same RLS.

---

## 3. Current source structure

```text
D:\freshbowl_os\
  mushroomos/                          CANONICAL APP
    src/
      App.tsx                          routes + RoleGuard + shell choice
      main.tsx
      api/                             shared backend access (web = mobile)
        client.ts                      supabase-js
        processDefinition.ts
        batch.ts / batches.ts / batchPage.ts
        schedule.ts
        movements.ts
        plant.ts
        lab.ts
        tower.ts / controlRoom.ts / adminToday.ts
      domain/                          PURE: no api/, no process-length literals
        time.ts                        H0 clock (batchHour, batchInstant, wallClock, batchDay)
        types.ts                       states, roles, scopes, cardinality
        contracts.ts                   UI data contracts
        cardinality.ts / label.ts
        time.test.ts
      components/
        primitives/index.tsx           Chip, Stat, Field, Card, Bar, Skeleton, Countdown, …
        layout/                        AppShell, FieldShell, PageHeading
        domain/                        TimeLabel, HumanDuration, PlayheadContext
        composite/                     HourRail, StaircaseCalendar, MovementPlan,
                                       ExceptionBand, EventStream, Narrative, geometry
        node/                          FiveLayerNode
      routes/                          one file per screen (lazy, one chunk each)
      lib/                             auth.ts, humanError.ts, useDensity.ts
      fixtures/
    supabase/
      migrations/                      0001 … 0032 (imperative)
      seed/                            s01 … s11 (+ s10b)
    android/                           Capacitor shell
    tests/                             domain + DB-backed acceptance
    capacitor.config.json              appId in.freshbowl.mushroomos
  mushroomos-codex/                    EXPERIMENT (schedule import ahead of canonical)
  apk_extracted/                       LEGACY HTML APK
  docs/                                product + engineering corpus
  MUSHROOMOS_V2_END_TO_END_PRODUCT_CONTRACT.md
  MUSHROOMOS_USER_JOURNEYS.md
  lab_technician_batch_process.md
  room.md / room2.md
```

**Stack (canonical):** React 18, TypeScript, Vite 6, Tailwind, React Router 6, TanStack Query 5, Zustand 5, Capacitor 6, Supabase JS 2.47. Writes that change process state go through **Postgres functions**, not direct table writes from the browser.

---

## 4. Current web routes

Source: `mushroomos/src/App.tsx`. RLS is the authorisation boundary; `RoleGuard` is routing defence in depth.

| Path | Screen | Allowed roles | Shell |
|---|---|---|---|
| `/sign-in` | `SignIn` | anonymous | none |
| `/` | Landing → `ROLE_HOME[role]` | signed-in | — |
| `/admin/today` | `AdminToday` | gm, manager, admin, supervisor | AppShell |
| `/admin/batches` | `Batches` | same | AppShell |
| `/admin/batch/new` | `NewBatch` | admin, gm | AppShell |
| `/admin/batch/:id/schedule` | `ScheduleBuilder` | admin, gm, supervisor | AppShell |
| `/admin/batch/:id` | redirect → `/batch/:id` (keeps `?h=` / `?activity=`) | — | — |
| `/batch/:id` | `BatchPage` (tabs include `BatchDetail` + `TaskDrawer`) | gm, manager, admin, supervisor | AppShell |
| `/plant` | `Plant` | management | AppShell |
| `/admin/process-explorer` | `ProcessExplorer` | management | AppShell |
| `/admin/reference` | `ReferenceData` | management | AppShell |
| `/operator/my-work` | `MyWork` | operator, supervisor, admin, gm, manager | FieldShell **only** for operator; AppShell for others |
| `/lab/queue` | `LabQueue` | lab_tech, supervisor | FieldShell for lab_tech |
| `/supervisor/control-room` | `ControlRoom` | supervisor, gm | AppShell |
| `/manager/resources` | `Resources` | manager, admin, gm | AppShell |
| `/gm/control-tower` | `ControlTower` | management (home for gm) | AppShell |
| `/gm/command-center` | redirect → `/gm/control-tower` | — | — |
| `/dev/gallery` | `Gallery` | all roles, **DEV only** | AppShell |

**Not in canonical `App.tsx`:** `/admin/schedule` (exists only in `mushroomos-codex`). **Not routed:** `Pending.tsx` (placeholder component), `BatchDetail` (embedded in `BatchPage`). **Missing route named in older docs:** `/operator/task/:id` (FieldShell comments: S9 / C6 — not built).

**Role homes (`lib/auth.ts`):**

| Role in code | Home |
|---|---|
| operator | `/operator/my-work` |
| lab_tech | `/lab/queue` |
| supervisor | `/supervisor/control-room` |
| admin | `/admin/today` |
| manager | `/manager/resources` |
| gm | `/gm/control-tower` |

**Chairman / Owner:** not an `app_role`. Product text treats Control Tower as the owner home. That is a **role-model gap**, not a second app.

---

## 5. Current mobile structure

Mobile is **the same routes and the same JS**. Capacitor loads `dist/` in a WebView.

| Concern | Current fact |
|---|---|
| Entry | One Vite app. Role chooses shell. Field roles never download `AppShell` (lazy + `tests/fieldShell.test.ts`). |
| Operator / Lab | `FieldShell`: one centred column, ≥48 px targets, **no nav bar**, online/offline **chip only** (no queue). |
| Management on phone | `AppShell` with 44 px header controls. GM / admin / supervisor / manager use the same URLs as desktop. |
| Camera | File capture into Storage + `bind_evidence`. Live-camera-only policy **not** enforced. |
| Offline | Explicitly **out of scope** in the field shell. Architecture V2 still mentions a PWA queue; C-FIELD forbade a service worker. Conflict is recorded, not resolved. |
| Native plugins | INTERNET only. No QR scanner, no dedicated camera plugin. |

There are **no separate mobile routes**. Density (`useDensity`, `FiveLayerNode` densities) changes layout, not URLs.

---

## 6. Current web structure (screens and chrome)

**AppShell nav (by role):**

- Admin: Today, Batches, + New Batch, Tasks, Process, Reference  
- Supervisor: Control Room, Batches, Tasks, Process  
- Manager: Resources, Batches  
- GM: Control Tower, Plant, Batches, Process  

Plant is on GM nav only in chrome; the **route** is open to all management.

**Shared management batch page:** `/batch/:id` at six densities (`UI_IMPLEMENTATION_PLAN §1.1`). Playhead `?h=` is shared across rail, events, narrative.

---

## 7. Supabase / schema / domain

### 7.1 Migrations (canonical `mushroomos/supabase/migrations`)

| Range | Subject |
|---|---|
| 0001 | Foundation: `app_role`, `profiles`, JWT hook, `audit_event` |
| 0002 | Reference data (materials, locations, …) |
| 0003 | Process engine: `process_definition`, `process_activity`, variants, fields, evidence requirements, gates |
| 0004 | Batch tree: `master_batch`, `batch_activity`, values, evidence reqs, config |
| 0005 | `generate_activity_plan`, `create_master_batch`, `activate_batch` |
| 0006 | Execution: `start_activity`, `submit_activity` |
| 0007 | Schedule / assignment / location / variant / lab columns |
| 0008 | Rest gates, `unblocks_at` |
| 0009 | Admin questions |
| 0010 | State truth |
| 0011 | Hour axis (H0 as instant) |
| 0012 | `evaluate_gates` |
| 0013 | Batch disposal |
| 0014 | Evidence storage |
| 0015 | Role claim |
| 0016 | Recorded actuals |
| 0017 | Deviations + verdicts |
| 0018 | Event trail |
| 0019 | Variance attribution |
| 0020 | Management checkpoints |
| 0021 | Resources / machines / occupancy |
| 0022 | Lab samples, tests, versioned results, specs |
| 0023 | Batch H0 default |
| 0024 | Contributor conflict |
| 0025 | Gate protection |
| 0026 | Vessel allocation (batch-lifetime — **superseded in intent by 0031**) |
| 0027 | Hourly plan (`planned_hour_source`) |
| 0028 | Clear planned time |
| 0029 | Vessel slots |
| 0030 | Batch start override (Admin-set H0 clock) |
| 0031 | `individual_batch`, `movement_template`, per-movement vessel claims |
| 0032 | Pre-batch material sample (not on the H-clock) |

**Codex-only:** `20260824192339_monthly_schedule.sql` — `monthly_schedule_import` / `monthly_schedule_group`.

### 7.2 Seeds

| Seed | Content |
|---|---|
| s01 | Conflict / TBD register |
| s02 | Reference materials, locations, machines |
| s03 | `PROCESS-2026B` v1 — operator activity templates |
| s04 | Gates + named evidence |
| s05 | Activity fields (Route 2026A / 2026B fields) |
| s06 / s10b | Lab specs / checkpoints |
| s07 | Demo accounts |
| s08 | Lab activities + `responsible_role` |
| s09 | Admin questions at Day-0 |
| s10 | Hour axis / factory clock |
| s11 | Demo batches |

### 7.3 Domain objects (keep these names)

```text
Factory
  → Master Batch          (code like 366,367,368; start_at = H0; config jsonb; status draft|active|closed|cancelled)
      → Individual Batch  (batch_no 366 / 367 / 368; unique; separates at tunnel)
      → batch_activity    (planned hour, actual_start/end server, state machine)
      → movement          (BUNKER_FILL, BUNKER_RELOAD_1/2, TUNNEL_LOAD, TUNNEL_OUT)
      → evidence / lab_sample / deviation / decision / event
```

**Roles in DB:** `gm | manager | admin | supervisor | operator | lab_tech` (six).  
**Activity states:** LOCKED, READY, IN_PROGRESS, SUBMITTED, AWAITING_LAB, WAITING_TIME, WAITING_CONDITION, AWAITING_SUPERVISOR, BLOCKED, DEVIATION, RETURNED, COMPLETED, SKIPPED, CANCELLED.

**Guarded writes (representative):** `create_master_batch`, `generate_activity_plan`, `activate_batch`, `start_activity`, `bind_evidence`, `submit_activity`, `release_activity`, `hold_activity`, `return_activity`, `accept_with_deviation`, `escalate_deviation`, `open_lab_sample`, `open_prebatch_sample`, `request_lab_test`, `record_lab_result`, `order_retest`, `release_elapsed_rests`.

---

## 8. Time model

Normative: `docs/TIME_CONTRACT.md`. Implementation: `src/domain/time.ts`.

| Rule | Implementation |
|---|---|
| H0 is an instant (`master_batch.start_at`), Admin-overridable (0030) | Not calendar midnight |
| Baseline length is **data** (`process_definition` / `baselineHours` on contracts) | **No** `552` constant in `src/domain/` |
| Book1 hours are **1-based intervals**; H0 is instant 0 | `batchHour` vs `batchInstant` vs `wallClock` |
| Display days: Day 0 = hours 1–24 = H0–H24 | `batchDay(hour)` — never `date_trunc('day')` |
| Activities may cross a 24-hour display block | Plan uses `rel_day` + optional Admin hour (0027) |
| Device clock must not open rests | Server `unblocks_at` / `evaluate_gates` |
| Operators do not type actual start/end | `start_activity` / `submit_activity` server timestamps |

**Display vs logic:** Human labels “Day 1”, “Day 8” are navigation. Workflow uses **hours, gates, and activity graph**. Factory paperwork also has mixing-as-Day-0 (C-19/C-20); **PROCESS-2026B** anchors **Day 0 = Fibre Weighment**. That conflict stays in the register.

Default H0 wall time in sources: **05:00 factory time** (TBD-47 answered by Book1). **TBD-50** timezone still open.

---

## 9. Process definitions

**Active definition:** `PROCESS-2026B` v1, `published`, `anchor_day_label = Day 0 = Fibre Weighment`, `total_days = 22` → **H0–H552** as 23×24h display span.

Process is **data**. Adding an activity is a seed change (`processDefinition.ts` loads whatever is published).

**Operator / movement templates (s03)** — codes, `rel_day`, stream:

| rel_day | Display H-range (standard placement) | Codes |
|---:|---|---|
| 0 | H0–H24 | `FIB1-WEIGH` (LOAD cardinality from qty/capacity) |
| 1 | H24–H48 | `FIB1-HOP-1`, `FIB1-HOP-2`, `FIB1-BUNK-LOAD` |
| 2 | H48–H72 | `FIB1-REST-1` (time gate; duration TBD-21) |
| 3 | H72–H96 | *(no dedicated operator row — rest continues if duration requires)* |
| 4 | H96–H120 | `FIB1-UNLOAD`, `FIB1-HOP-3`, `FIB1-BUNK-RELOAD`, `STRAW-RECEIPT`, `STRAW-INSPECT`, `STRAW-WEIGH`, `STRAW-BALE-CUT` |
| 5 | H120–H144 | `STRAW-SOAK-1`, `STRAW-BUNK-STORE`, `STRAW-REST-1` |
| 6 | H144–H168 | `STRAW-SOAK-2` |
| 7 | H168–H192 | `STRAW-SOAK-3`, `STRAW-REST-2`, `NMIX-ROTAVATE`, `FIB1-YARD-UNLOAD`, `YD-NMIX-ADD`, `YD-FLIP-1/2`, `YD-HOP-COMBINE`, `YD-REST`, `STRAW-YARD-LOAD` |
| 8 | H192–H216 | `YD-FLIP-3/4`, `TR-T0`, `TR-T1`, `TR-T2`, `P1-BUNK-LOAD` |
| 10 | H240–H264 | `P1-REST-1` |
| 12 | H288–H312 | `P1-BUNK-RELOAD` |
| 13 | H312–H336 | `P1-REST-2` |
| 15 | H360–H384 | `TN-LOAD` |
| 16 | H384–H504 | `TN-HOLD` (Phase-2 bands in data; TBD-08) |
| 22 | H528–H552 | `TN-UNLOAD` |

**Lab templates (s08)** — separate records, not collapsed:

Day 1: `LAB-FIB-WET`, `LAB-FIB-MOISTURE-1`, `LAB-FIB-HOP2`, `LAB-FIB-PREBUNK`  
Day 4: `LAB-FIB-MOISTURE-2`, `LAB-STRAW-WEIGH`  
Days 5–7: `LAB-LAGOON-1/2/3`  
Days 8 / 12 / 15 / 22: `LAB-BUNK-FILL`, `LAB-BUNK-RELOAD`, `LAB-TUNNEL-LOAD`, `LAB-COMPOST-OUT`

**Cardinality kinds (never hard-coded counts in codes):** SINGLETON, DERIVED_FROM_QUANTITY, PER_SCOPE_INSTANCE, CREATES_SCOPE_INSTANCES, MERGES_SCOPE_INSTANCES.

**T1 → T2:** per pile, `SAME_SCOPE_INSTANCE` gate. No global T1 barrier.

**Movements (0031 templates):** BUNKER_FILL, BUNKER_RELOAD_1, BUNKER_RELOAD_2, TUNNEL_LOAD (per individual batch), TUNNEL_OUT. Bunkers are **not** a permanent batch property.

**Pre-H0:** incoming material sample (`0032`, `is_prebatch`) — **not** a `batch_activity`. TBD-57 vs lab dictation Day-0 remains open.

---

## 10. Role model

| Product role (master context) | Current `app_role` | Surface today |
|---|---|---|
| Admin | `admin` | Today, New Batch, ScheduleBuilder, Process, Reference, Tasks |
| Operator | `operator` | My Work + TaskDrawer |
| Lab Technician | `lab_tech` | Lab Queue |
| Supervisor | `supervisor` | Control Room + Tasks + Batches |
| Manager | `manager` | Resources + Batches |
| General Manager | `gm` | Control Tower, Plant, Batches |
| Chairman / Owner | **missing enum** | Intended = Control Tower; comments say “chairman on a phone lands in AppShell” |

Do **not** invent extra ERP roles (weighbridge operator, harvest supervisor, …) as new products. If the factory later names them, they are **profiles of the seven**, not a second backend.

---

## 11. Lab / evidence model

- Lab queue is activity-triggered; concurrent batches switchable.  
- Results are **versioned**; retest creates a new version; history immutable.  
- No spec → **NO SPEC / no_spec**, never invented PASS/FAIL. Dual maps (lab dictation vs S4b) carried with C-33 / TBD-36.  
- Evidence is **named requirements** that gate `submit_activity`. Capture: Storage upload then `bind_evidence`.  
- **Gap:** photos often exist in storage; proof UI still reduces toward counts (`DEMO_AND_APK.md`). Actual media must be visible on the proof panel.

Lifecycle (keep):

```text
READY → START → server start → BEFORE evidence → WORK → actual values → AFTER evidence → SUBMIT → server end
```

---

## 12. Movement / resource model

- `Plant` = factory as place (bunkers/tunnels occupied or empty).  
- `Resources` = people/machines utilisation.  
- `MovementPlan` = planned source/destination.  
- 0031 claims vessels **per movement**. 0026 lifetime binding is historical and must not drive new UI.  
- Exclusion constraints exist for occupancy / machine usage; double-booking prevention must stay server-side.

---

## 13. Existing reusable components

### Primitives (`components/primitives`)

`Chip`, `ConflictMarker`, `Stat`, `Field`, `NumberInput`, `Card`, `Bar`, `Skeleton`, `Countdown`, `EmptyState`, `Band`, `BandNotBuilt`

### Layout

`AppShell`, `FieldShell`, `PageHeading`

### Domain time/playhead

`TimeLabel`, `HumanDuration` / `Variance`, `PlayheadContext`

### Composite (management)

`HourRail`, `StaircaseCalendar`, `MovementPlan`, `ExceptionBand`, `EventStream`, `Narrative`, `geometry` / `railGeometry`

### Node

`FiveLayerNode` (SOP / plan / actual / evidence / decision × density)

### Route-level composites (keep, do not fork)

`TaskDrawer` (operator lifecycle), `BatchPage` / `BatchDetail`, `MyWork`, `LabQueue`, `ControlTower`, `ControlRoom`

**Reuse rule:** one component, six densities. Never a second design system for mobile.

---

## 14. KEEP / MODIFY / ARCHIVE / BUILD

See `docs/CURRENT_TO_TARGET.md` for the decision table. Summary:

- **KEEP** the canonical tree, H-clock, PROCESS-2026B, server timestamps, RLS, FieldShell/AppShell split, Control Tower visual language, individual batches + movement tables.  
- **MODIFY** proof panel, schedule→batch path, chairman as seventh role, hourly plan UI vs `rel_day * 24` default, 0026 leftover assumptions, GM nav so Plant/Tower are owner-complete.  
- **ARCHIVE** `apk_extracted` as a frozen reference; `mushroomos-codex` after schedule merge.  
- **BUILD** monthly Excel schedule in canonical, proof media, formulation/weighbridge fields, growing-room/harvest/yield, reports, QR, live-camera policy **after** factory decision.

---

## 15. Target module / folder architecture

Do not create a second app. Fold experiments **into** `mushroomos/`.

```text
mushroomos/
  src/
    app/                 App.tsx, main.tsx, router tables only
    domain/              time, types, contracts, cardinality  (PURE)
    api/                 one folder; no webApi vs mobileApi
    components/
      primitives/
      layout/            AppShell, FieldShell
      domain/            TimeLabel, Playhead
      composite/         HourRail, Staircase, Narrative, Movement, ProofPanel (new file, same layer)
      node/
    routes/
      admin/             Today, Batches, NewBatch, MonthlySchedule, ScheduleBuilder, Process, Reference
      field/             MyWork, LabQueue, TaskDrawer
      management/        BatchPage, Plant, ControlTower, ControlRoom, Resources
      auth/              SignIn
    lib/                 auth, errors, density
  supabase/
    migrations/          continue 0033+ here only
    seed/                PROCESS-2026B remains the one published definition
  android/               Capacitor wrapper only
  tests/
docs/                    this architecture + CURRENT_TO_TARGET + existing corpus
archive/
  apk_extracted/         move when ready (do not delete)
  mushroomos-codex/      after merge
```

**Boundaries:** web and mobile share `domain` + `api` + `routes`. Shells differ. No Capacitor-specific process code.

---

## 16. Complete H0–H552 process model (as seeded — do not invent)

The executable model is **PROCESS-2026B** plus lab rows in s08. Downstream growing-room / spawn / harvest / yield are **not** in the process graph. Phase-2 thermal stages are control **bands**, not extra invented activities.

Standard hour = `rel_day * 24` until Admin sets `planned_time` (0027). Durations may extend past the display day (T1/T2/bunker load example H192–H217).

Full activity matrix: **§20** below and the copy in `CURRENT_TO_TARGET.md`.

---

## 17. Role-by-role screen map

| Role | Primary question | Home | Other screens (same product) |
|---|---|---|---|
| Admin | Turn a scheduled slot into a runnable Master Batch | `/admin/today` | New Batch, ScheduleBuilder, (target) Monthly Schedule, Process, Reference, Tasks |
| Operator | What do I do now? | `/operator/my-work` | TaskDrawer on the current activity |
| Lab | What do I test now? | `/lab/queue` | Sample → parameters → submit / retest |
| Supervisor | What needs my decision? | `/supervisor/control-room` | Tasks, Batches, Process |
| Manager | How is the factory operating? | `/manager/resources` | Batches, (should use Plant + Tower) |
| GM | What needs my action now? | `/gm/control-tower` | Plant, Batches, Process, Control Room |
| Chairman | What happened, and why? Show proof | **target:** same Tower | Drill: Tower → MB → IB → H-hour → activity → proof |

---

## 18. Shared web / mobile boundaries

| Shared | Not shared |
|---|---|
| Supabase project, RLS, RPCs, Storage, process seed | Touch target size, nav chrome, information density |
| Routes and query keys | FieldShell forbids nav; AppShell has nav |
| Playhead `?h=` | Scrub UX may be denser on desktop |
| Evidence binary in Storage | Capture widget size |

---

## 19. Acceptance journeys (already specified — execute later)

1. Monthly schedule upload → select group → create Master Batch (identity + H0).  
2. Configure materials / loads / individuals / resources / movements / tunnels / lab / evidence.  
3. System generates H0–H552 plan → review → validate → activate.  
4. Operator: next task → START (server) → before → values → after → SUBMIT (server).  
5. Lab: queue → sample → result (or NO SPEC) → optional retest v2.  
6. Out of range → deviation → supervisor RELEASE / HOLD / RETURN (who, when, reason).  
7. Chairman: Control Tower → H-hour playhead → proof with **actual media**.  
8. Individual batch tunnel drill (366 → Tunnel 10, …).  
9. (Later) compost → growing room → spawn → harvest → yield.

---

## 20. Screen matrix

| Screen | Role | Web | Mobile | Input | Output | Data source | Next |
|---|---|---|---|---|---|---|---|
| Sign in | all | `/sign-in` | same | email, password | session + role claim/profile | Auth + `profiles` | Role home |
| Admin Today | admin, mgmt | `/admin/today` | same | none | today's exceptions / work | `adminToday` API | Batches / task / batch page |
| Monthly schedule | admin | **missing in canonical**; `/admin/schedule` in codex | same when merged | Excel file, month | scheduled groups, status, link to create | `monthly_schedule_*` (codex) | New Batch |
| Batches | mgmt | `/admin/batches` | same | filters | list of master batches | `batches` API | `/batch/:id` |
| New Batch | admin, gm | `/admin/batch/new` | same | identity, H0, Day-0 config, individuals | draft `master_batch` + generated plan | `create_master_batch`, `generate_activity_plan` | ScheduleBuilder |
| Schedule builder | admin, gm, supervisor | `/admin/batch/:id/schedule` | same | hours, vessels, people, machines | planned hours, movement claims | `schedule` + `movements` APIs | Activate |
| Batch page | mgmt | `/batch/:id?h=` | same | playhead hour | rail, narrative, events, individuals | `batchPage`, tower, events | TaskDrawer / proof |
| Batch detail (embedded) | mgmt | inside Batch page | same | activate | freeze plan | `activate_batch` | Execution |
| Plant | mgmt | `/plant` | same | selected hour (target) | bunker/tunnel occupancy | `plant` API | Batch / movement |
| Process explorer | mgmt | `/admin/process-explorer` | same | definition code | PROCESS-2026B graph | `process_activity` | — |
| Reference | admin | `/admin/reference` | same | none | materials, conflicts | reference tables | — |
| My Work | operator (+ ops) | `/operator/my-work` | **primary** | none | next READY/IN_PROGRESS tasks | generated `batch_activity` | TaskDrawer |
| Task drawer | operator, supervisor | overlay on My Work / Batch | **primary** | start, readings, evidence files | server timestamps, values, submit | `start_activity`, `bind_evidence`, `submit_activity` | next task / lab / supervisor |
| Lab queue | lab_tech, supervisor | `/lab/queue` | **primary** | sample, values, retest reason | versioned results | `lab` RPCs | next sample / supervisor |
| Control Room | supervisor, gm | `/supervisor/control-room` | same | verdict + reason | release/hold/return/escalate | deviations RPCs | operator / GM |
| Resources | manager, admin, gm | `/manager/resources` | same | none | utilisation, conflicts | `0021` views | Plant / batch |
| Control Tower | gm + mgmt | `/gm/control-tower` | same | playhead | staircase, exceptions, H n / H552 | `tower` API | Batch page proof |
| Gallery | dev | `/dev/gallery` | n/a | fixtures | visual regression | fixtures | — |
| Growing room / harvest / yield | chairman, GM, manager | **not built** | **not built** | — | — | — | — |
| Reports / Excel | mgmt | **not built** | **not built** | — | workbook | execution record | — |
| Proof panel | all mgmt + chairman | **partial** (counts) | **partial** | activity id | planned vs actual + **media** | evidence Storage + activity row | decision |

---

## 21. Activity matrix (PROCESS-2026B + s08)

H-range = **standard** display window from `rel_day` (Admin may shift planned hour). Operator/Lab columns are responsible roles as seeded. Evidence = named requirements exist in s04 (not every row listed here). Decision = typical supervisor path when gates fail.

| H-range | Activity | Operator | Lab | Evidence | Resource | Decision | Next |
|---|---|---|---|---|---|---|---|
| Pre-H0 | Incoming material sample (0032) | — | yes (`open_prebatch_sample`) | attachments if required | — | activation blocked if missing | H0 / FIB1-WEIGH |
| H0–H24 | FIB1-WEIGH (per load) | start/finish, actual weight | — | weighment slip / loaded vehicle | vehicle, JCB | variance → deviation | next load or Day 1 |
| H24–H48 | LAB-FIB-WET | — | moisture, pH, EC | as seeded | — | NO SPEC if unmapped | FIB1-HOP-1 |
| H24–H48 | FIB1-HOP-1 | hopper pass 1 (water) | — | before/after | hopper | — | LAB-FIB-MOISTURE-1 |
| H24–H48 | LAB-FIB-MOISTURE-1 | — | moisture, pH, EC | — | — | informs water/dry (operator chooses; auto-select off) | FIB1-HOP-2 |
| H24–H48 | FIB1-HOP-2 | dry **or** water variant | — | before/after | hopper | — | LAB-FIB-HOP2 |
| H24–H48 | LAB-FIB-HOP2 | — | moisture, pH, EC | — | — | — | LAB-FIB-PREBUNK |
| H24–H48 | LAB-FIB-PREBUNK | — | moisture, pH, EC | — | — | last check before bunker | FIB1-BUNK-LOAD |
| H24–H48 | FIB1-BUNK-LOAD | load; movement dest bunker | — | before/after | bunker, machine | double-book refuse | FIB1-REST-1 |
| H48–H96 | FIB1-REST-1 | none (time gate) | — | — | bunker occupied | server clock only | FIB1-UNLOAD when elapsed |
| H96–H120 | FIB1-UNLOAD | unload | — | — | bunker, machine | — | LAB-FIB-MOISTURE-2 |
| H96–H120 | LAB-FIB-MOISTURE-2 | — | moisture | — | — | hopper water/dry | FIB1-HOP-3 |
| H96–H120 | FIB1-HOP-3 | hopper | — | — | hopper | — | FIB1-BUNK-RELOAD |
| H96–H120 | FIB1-BUNK-RELOAD | reload to **new** bunker | — | — | bunkers, machine | movement claim | straw stream / later yard |
| H96–H120 | STRAW-RECEIPT | receipt | — | — | yard | — | STRAW-INSPECT |
| H96–H120 | STRAW-INSPECT | inspect | — | — | — | — | STRAW-WEIGH |
| H96–H120 | STRAW-WEIGH | weigh | LAB-STRAW-WEIGH moisture + dry_weight | slip | vehicle | TBD-45 dry_weight no_spec | STRAW-BALE-CUT |
| H96–H120 | STRAW-BALE-CUT | cut | — | before/after | machine | — | STRAW-SOAK-1 |
| H120–H144 | STRAW-SOAK-1 | soak | LAB-LAGOON-1 pH/EC/TDS | water check | soak pit | — | STRAW-BUNK-STORE |
| H120–H144 | STRAW-BUNK-STORE | store | — | — | bunker (competes C-24) | — | STRAW-REST-1 |
| H120–H144 | STRAW-REST-1 | time gate | — | — | — | — | STRAW-SOAK-2 |
| H144–H168 | STRAW-SOAK-2 | soak | LAB-LAGOON-2 | — | soak pit | — | STRAW-SOAK-3 |
| H168–H192 | STRAW-SOAK-3 | soak | LAB-LAGOON-3 | — | soak pit | — | STRAW-REST-2 |
| H168–H192 | STRAW-REST-2 | time gate 14–16 h | — | — | — | — | yard straw piles |
| H168–H192 | NMIX-ROTAVATE | mix N+mineral | — | multi named (incl. ammonium sulphate) | rotavator | — | YD-NMIX-ADD |
| H168–H192 | FIB1-YARD-UNLOAD | create piles | — | — | yard | — | YD-NMIX-ADD |
| H168–H192 | YD-NMIX-ADD | add mix per pile | — | — | — | — | YD-FLIP-1 |
| H168–H192 | YD-FLIP-1 / YD-FLIP-2 | flip per pile | — | — | turner | — | YD-HOP-COMBINE |
| H168–H192 | YD-HOP-COMBINE | merge to MIXED-PILE | — | water on | hopper | — | YD-REST |
| H168–H192 | YD-REST | time gate | — | — | — | — | STRAW-YARD-LOAD / Day 8 |
| H168–H192 | STRAW-YARD-LOAD | straw piles | — | — | yard | TBD-19 pile count | YD-FLIP-3 |
| H192–H216+ | YD-FLIP-3 / YD-FLIP-4 | per turner pile | — | — | turner | — | TR-T0 |
| H192–H216+ | TR-T0 | per pile | — | — | turner | — | TR-T1 |
| H192–H216+ | TR-T1 | per pile | — | — | turner | no global barrier | TR-T2 **same pile** |
| H200–H217+ | TR-T2 | per pile immediately after that pile's T1 | — | — | turner | — | P1-BUNK-LOAD |
| H192–H240 | P1-BUNK-LOAD | bunker load (may cross H216) | LAB-BUNK-FILL panel | before/after | bunker, machine | — | P1-REST-1 |
| H240–H288 | P1-REST-1 | time gate | — | — | bunker | — | P1-BUNK-RELOAD |
| H288–H312 | P1-BUNK-RELOAD | one Phase-1 reload (frozen C-25) | LAB-BUNK-RELOAD | — | bunkers | history had two reloads — conflict kept | P1-REST-2 |
| H312–H360 | P1-REST-2 | time gate | — | — | bunker | — | TN-LOAD |
| H360–H384 | TN-LOAD | per tunnel / individual batch | LAB-TUNNEL-LOAD | — | tunnel | 366→T10 etc. | TN-HOLD |
| H384–H528 | TN-HOLD | monitoring; time gate | Phase-2 bands (seeded) | ammonia/fan **fields missing** | fans, tunnel | TBD-08 stages | TN-UNLOAD |
| H528–H552 | TN-UNLOAD | unload | LAB-COMPOST-OUT (+ sensory) | photos for colour/actinomycetes | tunnel | compost QC | **handoff not built** (GR / spawn / harvest / yield) |

Days 9, 11, 14, 17–21 with no new **template** codes are **continuation of active rests/holds**, not invented steps.

---

## 22. Build order (architecture only)

1. Keep canonical `mushroomos/` as the only runtime.  
2. Merge monthly schedule from `mushroomos-codex` (tables + `/admin/schedule` + New Batch prefill).  
3. Proof panel: render actual media + timestamps + people + machines + vessels + lab + decision.  
4. Chairman as seventh role **or** documented alias of gm (factory choice; do not invent a second tower).  
5. Finish movement/individual drill + shared playhead on Plant.  
6. Formulation / weighbridge fields **without** inventing moisture bands.  
7. Growing room → harvest → yield **from factory forms**, not a new process.  
8. Reports from the execution record.  
9. Policy TBDs: offline, live-camera, Delayed status — wait for factory.

**Stop.** Implementation starts only after review of this document and `CURRENT_TO_TARGET.md`.
