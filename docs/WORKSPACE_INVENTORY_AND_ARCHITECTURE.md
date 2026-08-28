# MushroomOS Comprehensive Codebase Inventory & Architecture Guide

**Date:** 25 August 2026  
**Repository:** `freshbowl_os`  
**Canonical Implementation:** `mushroomos/`  
**Backend:** Supabase (PostgreSQL 15 + PostgREST + Auth + Storage + RLS)  
**Client Surfaces:** Web (Desktop/Tablet) + Capacitor Mobile Android (`in.freshbowl.mushroomos`)  
**Process Definition:** `PROCESS-2026B` v1 (H0 → H552 process clock)

---

## 1. Top-Level Workspace Structure

```text
d:\freshbowl_os\
├── mushroomos/                 # [CANONICAL] Single runtime frontend & Capacitor mobile project
│   ├── src/                    # React 18 + Vite 6 + Tailwind source
│   ├── supabase/               # Migrations (0001–0032) & Seeds (s01–s11)
│   ├── android/                # Capacitor 6 Android wrapper (loads dist/)
│   ├── tests/                  # 24 test suites, 431 automated tests (vitest)
│   ├── scripts/                # DB migration, seed, demo staging, and verification tools
│   ├── capacitor.config.json   # App ID: in.freshbowl.mushroomos
│   └── package.json            # Vite, React, React Router, TanStack Query, Zustand, Capacitor
├── mushroomos-codex/           # [EXPERIMENT / REFERENCE] Source for monthly schedule import
├── apk_extracted/              # [LEGACY ARCHIVE] Extracted legacy Cordova/HTML assets (Reference only)
├── docs/                       # [SPECIFICATION CORPUS] Authoritative domain, architecture, time specs
├── room.md / room2.md          # Growing room / tunnel reference documentation
├── lab_technician_*.md         # Lab technician batch process SOP notes
└── MUSHROOMOS_*.md             # Product contracts and user journeys
```

---

## 2. Canonical Frontend Architecture (`mushroomos/src/`)

The application is built with **React 18**, **TypeScript 5.7**, **Vite 6**, **Tailwind CSS 3.4**, **TanStack Query 5**, **Zustand 5**, and **React Router 6**.

Web and Mobile share 100% of domain logic, API clients, routes, and business rules.

### 2.1 Domain Layer (`src/domain/`)
*Pure TypeScript functions with zero UI or API dependencies.*

| File | Purpose & Responsibilities |
|---|---|
| [`src/domain/time.ts`](file:///d:/freshbowl_os/mushroomos/src/domain/time.ts) | Authoritative H0 process clock. Computes `batchHour`, `batchInstant`, `wallClock`, `batchDay(hour)`, and relative hour offsets. **Contains zero hard-coded process length literals (e.g. no 552 constants).** |
| [`src/domain/types.ts`](file:///d:/freshbowl_os/mushroomos/src/domain/types.ts) | TypeScript type definitions for activity states (`LOCKED`, `READY`, `IN_PROGRESS`, `SUBMITTED`, `COMPLETED`, `DEVIATION`, `BLOCKED`, etc.), roles (`gm`, `manager`, `admin`, `supervisor`, `operator`, `lab_tech`), scopes (`BATCH`, `PILE`, `TUNNEL`, `LOAD`), and vessel kinds (`BUNKER`, `TUNNEL`, `YARD`, `SOAK_PIT`). |
| [`src/domain/contracts.ts`](file:///d:/freshbowl_os/mushroomos/src/domain/contracts.ts) | UI Data Contracts defining shape of data consumed by composite screens and nodes. |
| [`src/domain/cardinality.ts`](file:///d:/freshbowl_os/mushroomos/src/domain/cardinality.ts) | Logic for activity instance generation (`SINGLETON`, `DERIVED_FROM_QUANTITY`, `PER_SCOPE_INSTANCE`, `CREATES_SCOPE_INSTANCES`, `MERGES_SCOPE_INSTANCES`). |
| [`src/domain/label.ts`](file:///d:/freshbowl_os/mushroomos/src/domain/label.ts) | Human-readable labeling helpers for activities, scopes, and materials. |
| [`src/domain/time.test.ts`](file:///d:/freshbowl_os/mushroomos/src/domain/time.test.ts) | Comprehensive unit tests for time math and boundaries. |

---

### 2.2 API Layer (`src/api/`)
*Typed communication with Supabase Postgres functions and views. Web and Mobile call the exact same endpoints.*

| File | Purpose & Endpoints Covered |
|---|---|
| [`src/api/client.ts`](file:///d:/freshbowl_os/mushroomos/src/api/client.ts) | Supabase JS client initialization with anon key and session persistence. |
| [`src/api/batch.ts`](file:///d:/freshbowl_os/mushroomos/src/api/batch.ts) | RPC wrappers for `create_master_batch`, `generate_activity_plan`, `activate_batch`, `start_activity`, `submit_activity`, `bind_evidence`, `dispose_batch`. |
| [`src/api/batches.ts`](file:///d:/freshbowl_os/mushroomos/src/api/batches.ts) | Master batch listing, filtering, and summary statistics. |
| [`src/api/batchPage.ts`](file:///d:/freshbowl_os/mushroomos/src/api/batchPage.ts) | Aggregated queries for the multi-density `/batch/:id` screen (activities, milestones, playhead state). |
| [`src/api/schedule.ts`](file:///d:/freshbowl_os/mushroomos/src/api/schedule.ts) | Schedule Builder queries and mutations (`set_planned_time`, `clear_planned_time`, `set_batch_h0`). |
| [`src/api/movements.ts`](file:///d:/freshbowl_os/mushroomos/src/api/movements.ts) | Per-movement vessel allocations (`BUNKER_FILL`, `BUNKER_RELOAD_1/2`, `TUNNEL_LOAD`, `TUNNEL_OUT`) and conflict checking. |
| [`src/api/plant.ts`](file:///d:/freshbowl_os/mushroomos/src/api/plant.ts) | Factory vessel occupancy status (`v_plant_now`, vessel map, bunker/tunnel utilization). |
| [`src/api/lab.ts`](file:///d:/freshbowl_os/mushroomos/src/api/lab.ts) | Lab sample management, versioned test results, retest requests, and pre-batch sample RPCs. |
| [`src/api/controlRoom.ts`](file:///d:/freshbowl_os/mushroomos/src/api/controlRoom.ts) | Supervisor deviation queue, release/hold/return decisions, and checkpoint reviews. |
| [`src/api/tower.ts`](file:///d:/freshbowl_os/mushroomos/src/api/tower.ts) | Management Control Tower staircase calendar, active batch status, and exception rollups. |
| [`src/api/adminToday.ts`](file:///d:/freshbowl_os/mushroomos/src/api/adminToday.ts) | Admin daily command view (`v_admin_today`), unallocated vessels, and unactivated batches. |
| [`src/api/processDefinition.ts`](file:///d:/freshbowl_os/mushroomos/src/api/processDefinition.ts) | Dynamic loader for published process definitions (`PROCESS-2026B`). |

---

### 2.3 UI Components Layer (`src/components/`)

#### Primitives (`src/components/primitives/index.tsx`)
High-performance atomic components supporting 6 visual densities:
- `Chip`: Status indicators (`READY`, `RUNNING`, `LOCKED`, `SUBMITTED`, `DEVIATION`).
- `ConflictMarker`: Highlights open factory questions and assumptions (e.g. `TBD-57`).
- `Stat`: Numeric and metric displays.
- `Field`: Key-value metadata pair.
- `Card`: Structured container.
- `Bar`: Visual progress/timeline bar.
- `Skeleton`: Loading state placeholder.
- `Countdown`: Time-gate unlock countdown timer.
- `EmptyState`: Contextual empty views.
- `BandNotBuilt`: Explicit stub for roadmap features.

#### Layout (`src/components/layout/`)
- [`AppShell.tsx`](file:///d:/freshbowl_os/mushroomos/src/components/layout/AppShell.tsx): Management navigation shell (TopBar, role indicator, navigation links for Admin, Supervisor, Manager, GM).
- [`FieldShell.tsx`](file:///d:/freshbowl_os/mushroomos/src/components/layout/FieldShell.tsx): Operator / Lab Tech field shell. Centered column, ≥48px touch targets, zero navigation bars, connection status chip.
- [`PageHeading.tsx`](file:///d:/freshbowl_os/mushroomos/src/components/layout/PageHeading.tsx): Standardized header with breadcrumb, title, and action slot.

#### Domain Components (`src/components/domain/`)
- [`TimeLabel.tsx`](file:///d:/freshbowl_os/mushroomos/src/components/domain/TimeLabel.tsx): Standardized badge rendering H-hour, Day label, and relative time offsets.
- [`HumanDuration.tsx`](file:///d:/freshbowl_os/mushroomos/src/components/domain/HumanDuration.tsx): Formats durations and plan-vs-actual variances (+/- minutes/hours).
- [`PlayheadContext.tsx`](file:///d:/freshbowl_os/mushroomos/src/components/domain/PlayheadContext.tsx): Shared React context synchronizing the selected batch hour (`?h=`) across all components on a page.

#### Composite Visualizations (`src/components/composite/`)
- [`HourRail.tsx`](file:///d:/freshbowl_os/mushroomos/src/components/composite/HourRail.tsx): Interactive H0 → H552 horizontal timeline rail with activity blocks.
- [`StaircaseCalendar.tsx`](file:///d:/freshbowl_os/mushroomos/src/components/composite/StaircaseCalendar.tsx): Multi-batch overlapping process flow visualization for Control Tower.
- [`MovementPlan.tsx`](file:///d:/freshbowl_os/mushroomos/src/components/composite/MovementPlan.tsx): Step-by-step movement table for bunker fills, reloads, and tunnel loading.
- [`ExceptionBand.tsx`](file:///d:/freshbowl_os/mushroomos/src/components/composite/ExceptionBand.tsx): Renders critical deviation notices and blocked activities.
- [`EventStream.tsx`](file:///d:/freshbowl_os/mushroomos/src/components/composite/EventStream.tsx): Chronological audit trail stream of system and operator actions.
- [`Narrative.tsx`](file:///d:/freshbowl_os/mushroomos/src/components/composite/Narrative.tsx): Prose summary of batch execution status and milestones.
- [`geometry.ts`](file:///d:/freshbowl_os/mushroomos/src/components/composite/geometry.ts) / [`railGeometry.ts`](file:///d:/freshbowl_os/mushroomos/src/components/composite/railGeometry.ts): Math utilities for SVG coordinate mapping on time rails.

#### Node (`src/components/node/`)
- [`FiveLayerNode.tsx`](file:///d:/freshbowl_os/mushroomos/src/components/node/FiveLayerNode.tsx): Core 5-layer activity visualization card:
  1. SOP Target
  2. Planned Window
  3. Actual Execution & Server Timestamps
  4. Evidence & Photos
  5. Decision / Deviations

---

### 2.4 Application Routes (`src/routes/`)

| Route Path | Component File | Allowed Roles | Description |
|---|---|---|---|
| `/sign-in` | [`SignIn.tsx`](file:///d:/freshbowl_os/mushroomos/src/routes/SignIn.tsx) | Anonymous | Supabase authentication with demo account quick-login |
| `/admin/today` | [`AdminToday.tsx`](file:///d:/freshbowl_os/mushroomos/src/routes/AdminToday.tsx) | Admin, GM, Manager, Supervisor | Daily overview of active batches, unallocated slots, and exceptions |
| `/admin/batches` | [`Batches.tsx`](file:///d:/freshbowl_os/mushroomos/src/routes/Batches.tsx) | Admin, GM, Manager, Supervisor | Master batch inventory and filterable directory |
| `/admin/batch/new` | [`NewBatch.tsx`](file:///d:/freshbowl_os/mushroomos/src/routes/NewBatch.tsx) | Admin, GM | Master Batch formulation, Day-0 config, load derivation, and plan generation |
| `/admin/batch/:id/schedule` | [`ScheduleBuilder.tsx`](file:///d:/freshbowl_os/mushroomos/src/routes/ScheduleBuilder.tsx) | Admin, GM, Supervisor | Planned hour scheduling, vessel assignment, and plan review |
| `/batch/:id` | [`BatchPage.tsx`](file:///d:/freshbowl_os/mushroomos/src/routes/BatchPage.tsx) | Management | Deep-dive batch view with Playhead, HourRail, Narrative, and Events |
| `BatchDetail.tsx` | [`BatchDetail.tsx`](file:///d:/freshbowl_os/mushroomos/src/routes/BatchDetail.tsx) | Management | Embedded batch activation and detail panel |
| `/plant` | [`Plant.tsx`](file:///d:/freshbowl_os/mushroomos/src/routes/Plant.tsx) | Management | Real-time vessel occupancy (Bunkers 1–7, Tunnels 1–12, Soak Pits, Yard) |
| `/admin/process-explorer` | [`ProcessExplorer.tsx`](file:///d:/freshbowl_os/mushroomos/src/routes/ProcessExplorer.tsx) | Management | Graph viewer for `PROCESS-2026B` activities, gates, and evidence rules |
| `/admin/reference` | [`ReferenceData.tsx`](file:///d:/freshbowl_os/mushroomos/src/routes/ReferenceData.tsx) | Management | Materials, machines, and open conflict register |
| `/operator/my-work` | [`MyWork.tsx`](file:///d:/freshbowl_os/mushroomos/src/routes/MyWork.tsx) | Operator (+ Ops) | Operator primary field screen showing actionable tasks |
| `TaskDrawer.tsx` | [`TaskDrawer.tsx`](file:///d:/freshbowl_os/mushroomos/src/routes/TaskDrawer.tsx) | Operator, Supervisor | Task lifecycle execution (START → Before Evidence → Readings → After Evidence → SUBMIT) |
| `/lab/queue` | [`LabQueue.tsx`](file:///d:/freshbowl_os/mushroomos/src/routes/LabQueue.tsx) | Lab Tech, Supervisor | Sample testing queue, versioned test recording, retest requests |
| `/supervisor/control-room` | [`ControlRoom.tsx`](file:///d:/freshbowl_os/mushroomos/src/routes/ControlRoom.tsx) | Supervisor, GM | Deviation reviews and RELEASE / HOLD / RETURN actions |
| `/manager/resources` | [`Resources.tsx`](file:///d:/freshbowl_os/mushroomos/src/routes/Resources.tsx) | Manager, Admin, GM | Machine and operator allocation and double-booking checks |
| `/gm/control-tower` | [`ControlTower.tsx`](file:///d:/freshbowl_os/mushroomos/src/routes/ControlTower.tsx) | GM, Chairman | Executive control tower with multi-batch staircase and variance summaries |
| `/dev/gallery` | [`Gallery.tsx`](file:///d:/freshbowl_os/mushroomos/src/routes/Gallery.tsx) | All (DEV only) | Visual regression gallery for design system primitives |

---

## 3. Database Architecture (`mushroomos/supabase/`)

### 3.1 Migration Ledger (`supabase/migrations/`)

| Range | Migration File | Focus Area |
|---|---|---|
| `0001` | `0001_foundation.sql` | `app_role` enum, `profiles`, JWT hook, `audit_event` table |
| `0002` | `0002_reference.sql` | Materials, suppliers, machines, locations, conflict register |
| `0003` | `0003_process_engine.sql` | `process_definition`, `process_activity`, variants, gates, evidence requirements |
| `0004` | `0004_batch_tree.sql` | `master_batch`, `batch_activity`, values, evidence instances |
| `0005` | `0005_generate_plan.sql` | `generate_activity_plan()`, `create_master_batch()`, `activate_batch()` |
| `0006` | `0006_execution.sql` | `start_activity()`, `submit_activity()`, server-authoritative timestamps |
| `0007` | `0007_schedule.sql` | Schedule columns, location bindings, activity assignments |
| `0008` | `0008_rest_gate.sql` | Rest gates and server-controlled `unblocks_at` computation |
| `0009` | `0009_admin_questions.sql` | Admin question register at Day-0 |
| `0010` | `0010_state_truth.sql` | Activity state integrity triggers and transition constraints |
| `0011` | `0011_hour_axis.sql` | Instant-based H0 clock and hour axis calculation views |
| `0012` | `0012_evaluate_gates.sql` | Gate evaluation engine (`evaluate_gates()`) |
| `0013` | `0013_batch_disposal.sql` | Batch disposal lifecycle (`dispose_batch()`) |
| `0014` | `0014_evidence_storage.sql` | Supabase Storage bucket configuration and `bind_evidence()` |
| `0015` | `0015_role_claim.sql` | `has_role()` helper and RLS claims |
| `0016` | `0016_recorded_actuals.sql` | Plan vs actual variance computation views |
| `0017` | `0017_deviations.sql` | Deviation triggers, `v_deviation_open`, supervisor release/hold RPCs |
| `0018` | `0018_event_trail.sql` | Append-only event trail and audit trigger `v_batch_event` |
| `0019` | `0019_variance_attribution.sql` | Root-cause variance attribution functions |
| `0020` | `0020_management_checkpoints.sql` | Management checkpoint reviews and snapshot immutability |
| `0021` | `0021_resources.sql` | Resource occupancy views and double-booking exclusion constraints |
| `0022` | `0022_lab.sql` | Lab sample entities, test parameters, versioned results, retests |
| `0023` | `0023_batch_h0_default.sql` | Default H0 calculation (05:00 factory time) |
| `0024` | `0024_contributor_conflict.sql` | Multi-contributor delay resolution |
| `0025` | `0025_gate_protection.sql` | Gate bypass prevention |
| `0026` | `0026_vessel_allocation.sql` | Legacy vessel allocation *(superseded by 0031)* |
| `0027` | `0027_hourly_plan.sql` | `planned_time`, `planned_hour_source` (STANDARD vs ADMIN_PLAN) |
| `0028` | `0028_clear_planned_time.sql` | `clear_planned_time()` to revert to standard baseline |
| `0029` | `0029_vessel_slots.sql` | Required vessel slots validator |
| `0030` | `0030_batch_start_override.sql` | Admin H0 start override RPC |
| `0031` | `0031_individual_batches_and_movements.sql` | `individual_batch`, `movement_template`, per-movement claims |
| `0032` | `0032_prebatch_material.sql` | Pre-H0 raw material sampling (`open_prebatch_sample`) |

---

### 3.2 Seed Scripts (`supabase/seed/`)

- `s01_conflicts.sql`: Seeds open factory conflicts & TBD register.
- `s02_reference.sql`: Bunkers, tunnels, machines, raw materials.
- `s03_process_2026b.sql`: Complete `PROCESS-2026B` v1 activity definitions across 22 days.
- `s04_gates_evidence.sql`: Process gates and named evidence requirements.
- `s05_fields_route2026a.sql`: Form field specifications per activity.
- `s06_lab.sql` & `s10b_lab.sql`: Lab parameter specifications and test checkpoints.
- `s07_demo_accounts.sql`: Pre-configured user logins for each role.
- `s08_routing_lab_activities.sql`: Lab activities integrated into process routing.
- `s09_admin_questions.sql`: Day-0 configuration options.
- `s10_hour_axis.sql`: Factory time parameters.
- `s11_demo_batches.sql`: Seed batches across various lifecycle states.

---

## 4. Test Suite (`mushroomos/tests/`)

**Status:** 24 Test Suites · 431 / 431 Tests Passing

| Test Suite File | Coverage Scope |
|---|---|
| `adminToday.test.ts` | Daily admin overview and validation checks |
| `batchCreation.test.ts` | Master Batch creation with default and explicit H0 |
| `batchPage.test.ts` | Management batch detail queries and playhead hours |
| `checkpoints.test.ts` | Immutable management decision snapshots |
| `controlRoom.test.ts` | Supervisor deviation queue and verdict actions |
| `controlTower.test.ts` | Control Tower staircase rendering and batch status |
| `dayZeroToSix.test.ts` | End-to-end execution of Day 0 through Day 6 activities |
| `demoBatches.test.ts` | Verification of seed batches |
| `deviations.test.ts` | Deviation escalation and resolution rules |
| `eventTrail.test.ts` | Append-only audit trail integrity |
| `evidence.test.ts` | Evidence requirement validation and storage binding |
| `fieldShell.test.ts` | Mobile FieldShell bundle isolation and touch targets |
| `gates.test.ts` | Rest gates, prerequisite gates, and scope instance isolation |
| `hourAxis.test.ts` | Instant H0 calculations and batch day boundaries |
| `hourlyPlan.test.ts` | 4-layer hour registers and planned time resets |
| `lab.test.ts` | Lab queue, sample testing, versioned results, retests |
| `labUi.test.ts` | UI data contracts for lab queue and options |
| `plant.test.ts` | Vessel occupancy and double-booking refusal |
| `recordedActuals.test.ts` | Server-authoritative timestamps vs client inputs |
| `resources.test.ts` | Machine utilization and operator allocations |
| `tower.test.ts` | Tower data contracts and variance aggregations |
| `uiFoundations.test.ts` | Component design system tokens and visual densities |
| `varianceAttribution.test.ts` | Root cause analysis and contributor math |

---

## 5. Mobile Wrapper (`mushroomos/android/`)

- **Technology:** Capacitor 6 Android.
- **Application ID:** `in.freshbowl.mushroomos`.
- **Assets:** Loads direct Vite build output from `mushroomos/dist/`.
- **Permissions:** `INTERNET` only. Zero Cordova/native plugin divergence.
- **UI Experience:** Dynamically renders `FieldShell` for field roles (`operator`, `lab_tech`) and `AppShell` for management roles.
