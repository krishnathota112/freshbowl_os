> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# MushroomOS — The Frontend Story

**What each user sees, what they do, and how the frontend is built.**

---

## 1. Six Users, One Application, Two Shells

MushroomOS serves six roles. They all share one React app, but the experience splits into two shells:

| Shell | Users | Character |
|-------|-------|-----------|
| **AppShell** (management) | GM, Manager, Admin, Supervisor | Desktop/tablet, full nav bar, multi-batch views |
| **FieldShell** (field) | Operator, Lab Technician | Mobile-first, no nav, single-task, big targets, one hand |

The shell choice is made by role, not by URL. A supervisor viewing `/operator/my-work` keeps their management nav bar — they genuinely live in both worlds.

---

## 2. Per-Role Experience

### 2.1 Field Operator

**Home**: `/operator/my-work`  
**Shell**: FieldShell (no nav bar, centered 560px column)  
**Question they answer**: *"What is my next task, and what is the target?"*

**What they see:**
- A task queue of their current shift assignments
- One task at a time, expanded as a card with:
  - The batch scope (always visible at top)
  - The activity name in large type
  - TARGET from Day-0 plan
  - LAST LOAD — previous batch's actual, for calibration
  - A single numeric input (28px mono, 56px tall)
  - Machine picker with running stint timer
  - Evidence capture buttons (photo)
  - A golden rule from SOP ("Stage-0B decides compost breathability for the next 20 days")
  - A full-width 52px SUBMIT button
- A running-total bar above the load list (TARGET / LOADED / REMAINING / LOADS)
- Countdown timers for time-gated activities (bunker rest, tunnel pasteurisation)

**What they can do:**
- Record actuals (weight, height, temperature)
- Capture evidence photos
- Submit an activity
- See out-of-range warnings (never blocked from submitting — raises a deviation server-side)

**Design rules:**
- 48px minimum tap targets
- Body text ≥ 15px, numbers ≥ 18px
- No horizontal scrolling, ever
- Numeric keypads for numeric fields
- Offline chip (persistent, never modal)
- One primary action per screen

---

### 2.2 Lab Technician

**Home**: `/lab/queue`  
**Shell**: FieldShell  
**Question they answer**: *"What samples are waiting and what do I measure?"*

**What they see:**
- Queue in three bands: **overdue** (with what each blocks) → **today** → **retest required**
- Result entry with spec shown inline
- Method sheet one tap away
- Instrument picker with calibration state as a chip
- Verdict computes live per parameter as values are entered — `⚠ below` appears before submit

**What they can do:**
- Record structured lab results
- Order retests
- Accept a lab result as final
- See derived values (C:N, TDS) rendered in `lock` colour with a `derived` chip — no input

---

### 2.3 Supervisor

**Home**: `/supervisor/control-room`  
**Shell**: AppShell (management)  
**Question they answer**: *"What is stuck, and what do I do about it?"*

**Navigation**: Control Room, Batches, Tasks, Process

**What they see — the Control Room:**
Six bands ordered by urgency (not by batch), each collapsible with a count:

1. **Time-critical gates** — anything opening/expiring within 4 hours
2. **Lab failures** — results that failed spec and are blocking
3. **Open deviations** awaiting verdict
4. **Awaiting release** — submitted activities needing a decision
5. **Evidence review** — submissions with flagged photos
6. **Active batches board** — every live batch with position

Every row is actionable in place. Verdicts take two taps:

| Verdict | Effect |
|---------|--------|
| **RELEASE** | Activity → COMPLETED, dependents re-evaluate |
| **HOLD** | Activity → BLOCKED with mandatory reason |
| **RETURN** | Activity → RETURNED to operator's queue |
| **ACCEPT WITH DEVIATION** | One failing condition waived; deviation stays open on record |
| **ESCALATE** | Requests GM override on a protected gate |

**What they can do:**
- Release / hold / return activities
- Accept-with-deviation on most gates
- Request controlled overrides on 4 protected gates (need GM approval)
- View all five layers of any activity
- See the full production graph with all streams

---

### 2.4 Admin

**Home**: `/admin/today`  
**Shell**: AppShell (management)  
**Question they answer**: *"What exactly is this batch supposed to be?"*

**Navigation**: Today, Batches, Schedule, + New Batch, Tasks, Process, Reference

**What they see:**
- **Today** — daily work list: batches approaching checkpoints, config pending, schedule slots
- **Batches** — all master batches with status, position, and quick links
- **New Batch** — 5-step wizard: select slot → configure streams → bind materials → set Day-0 baseline → validate & activate
- **Schedule Builder** — per-row schedule editor for batch timelines
- **Process Explorer** — the full process definition tree (activities, stages, sequences)
- **Reference Data** — materials, machines, personnel, vessels
- **Batch Detail** — all five layers visible; layer ② (PLAN) is the editable one during config

**What they can do:**
- Create master batches from schedule slots
- Configure Day-0 baselines (targets, machines, personnel)
- Activate batches (requires GM checkpoint 1)
- Propose vessel/equipment allocations
- Edit route/SOP definitions (draft only — GM publishes)
- Manage users and roles

---

### 2.5 Manager

**Home**: `/manager/resources`  
**Shell**: AppShell (management)  
**Question they answer**: *"Can the factory physically do this plan?"*

**Navigation**: Resources, Batches

**What they see:**
- **Vessel Gantt** — 21-day window across all bunkers and tunnels, with batch occupancy
- **Machine load grid** — equipment allocation across active batches
- **Conflicts** — both contending batches named, with a resolve action
- Paddy occupancy visually distinct from compost but equally blocking

**What they can do:**
- Approve vessel/equipment/vehicle allocations
- Resolve resource conflicts
- Assign personnel
- View ② ③ collapsed to timing and resources (no operational detail)

---

### 2.6 General Manager (GM)

**Home**: `/gm/control-tower`  
**Shell**: AppShell (management)  
**Question they answer**: *"Is the factory alright this morning?"*

**Navigation**: Control Tower, Plant, Batches, Schedule, Process

**What they see — the Control Tower:**

```
┌──────────────────────────────────────────────────────────┐
│ FACTORY CONTROL TOWER              Sat 22 Aug · 09:14    │
│  12 RUNNING   8 ON PLAN   3 NEED A DECISION   1 HELD    │
├──────────────────────────────────────────────────────────┤
│ NEEDS YOU                                                │
│  ⚠ MB-118 · bunker reload ran 3h 20m long               │
│    waiting on you since 07:40 · 1h 34m     [ look ]     │
├──────────────────────────────────────────────────────────┤
│ THE FACTORY        ◀ 18  19  20  21 [22] 23  24 ▶       │
│  MB-097 ████████████████████████████▓                    │
│  MB-100   ██████████████████████████▓▓                   │
│  MB-103     ████████████████████████▓▓▓                  │
│  …                                  │ now                │
└──────────────────────────────────────────────────────────┘
```

Information hierarchy:
1. **Exception band** — what needs a decision, and how long it has been waiting
2. **Four counters** — running · on plan · needs a decision · held (no fifth, ever)
3. **Staircase calendar** — the factory's shape sorted by start time
4. Nothing else.

**What they can do:**
- Approve/return at 4 management checkpoints
- Approve controlled overrides (the 4 protected gates)
- Publish route/SOP definitions
- View the 9-section decision package at each checkpoint
- Click any batch bar to deep-link to that hour (`/batch/:id?h=<batchHour>`)

---

## 3. The Shared Batch Page

`/batch/:id` — one route, six densities. Every management role can access it, but they see different layers:

| Role | What they see |
|------|---------------|
| GM | ① ② ③ ⑤ aggregated per stream, exception first |
| Manager | ② ③ collapsed to timing and resources |
| Admin | ① ② ④ during config; all five after activation (② is editable) |
| Supervisor | All five layers at equal weight (③ vs ① variance, ⑤ is the action) |

Tabs: `?tab=overview` (rail + graph + events + narrative) · `?tab=activities` (instance list with five-layer nodes) · `?tab=schedule` (admin/draft only)

Deep-linkable via `?h=<batchHour>` (playhead position) and `?activity=<id>` (opens evidence/decision panel).

---

## 4. The Five-Layer Node — The Unifying Component

Every activity in the system renders as one component at different densities:

```
┌────────────────────────────────────────────────────────────┐
│  ⬤ FIB1-WEIGH · Bagasse Weighment          Load 08 of 11  │
│    Day 0 · PRIMARY_FIBRE · LOAD scope         IN PROGRESS  │
├────────────────────────────────────────────────────────────┤
│ ①  SOP        —                                    (lock)  │
│ ②  PLAN       2.0 MT · JCB-02 · Ravi · 12 min     (accent)│
│ ③  ACTUAL     2.08 MT · 08:10 → 08:19 · 9 min      ✓ ok   │
│ ④  EVIDENCE   1 / 1                                 ✓ ok   │
│ ⑤  DECISION   —                                            │
└────────────────────────────────────────────────────────────┘
```

| Layer | Colour | Nature |
|-------|--------|--------|
| ① SOP | `lock` (dark grey) | Never editable. What the SOP says. |
| ② PLAN | `accent` (teal) | Frozen at activation. The Day-0 target. |
| ③ ACTUAL | `ok`/`warn`/`crit` by variance | Append-only. What really happened. |
| ④ EVIDENCE | `ok` when complete, `inherit` when outstanding | Append-only. Photos, documents. |
| ⑤ DECISION | `warn` if open, `ok` if released | Append-only. Supervisor/GM verdict. |

---

## 5. The Production Graph

The spine of the application — shows how material flows through the factory:

```
             MASTER BATCH
                  │
      ┌───────────┼───────────┐
  PRIMARY      STRUCTURAL   NITROGEN
   FIBRE         STRAW      + MINERAL
      │           │           │
  WEIGHMENT     SOAK 1     ROTAVATOR
      │           │           │
   HOPPER       SOAK 2       YARD
      │           │           │
   BUNKER       SOAK 3        MIX
      │           │           │
    REST         REST        FLIPS
      │           │           │
   RELOAD         └────┬──────┘
      │               │
      └───────┬───────┘
              ▼
        T0 / T1 / T2
              │
      ┌───────┼───────┐
      ▼       ▼       ▼
  TUNNEL 1 TUNNEL 2 TUNNEL 3
              │
           UNLOAD
```

Each node is a compact five-layer component. Click expands inline. State is encoded by form, not colour alone (filled/outlined, rail colour, pulse, dashed border, strikethrough).

---

## 6. Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | React 18.3 + TypeScript 5.7 |
| Build | Vite 6 (route-level code splitting via `lazy()`) |
| Styling | Tailwind CSS 3.4 + CSS custom properties |
| State (client) | Zustand 5 |
| State (server) | TanStack React Query 5 (30s refetch for Control Room, 60s for Tower) |
| Routing | React Router DOM 6.28 |
| Backend | Supabase (Auth + Postgres/RLS + Edge Functions) |
| Mobile | Capacitor 6.2 (same web build as APK) |
| Testing | Vitest 2.1 |
| Fonts | Hanken Grotesk (headings/body), IBM Plex Mono (all numbers) |

---

## 7. Design System Summary

**Colours** — five semantic colours only:
- `ok` — in range, complete, released (green)
- `warn` — out of Day-0 band, variance, TBD marker (amber)
- `crit` — out of SOP band, blocked, conflict (red)
- `inherit` — resting, inherited from schedule (calm grey)
- `lock` — frozen baseline, SOP, read-only (dark grey)

**Typography** — `tabular-nums` on every column of digits. Monospace for all numbers, batch IDs, durations.

**Key rules:**
- No batch percentage-complete anywhere (half the process is resting — % is meaningless)
- Every number must have a unit and a comparison
- Blocked items state their reason on their face
- Skeletons in the shape of content, never a full-page spinner
- Empty states say what will fill them and when
- `prefers-reduced-motion` honoured (the rail pulse is the only animation)

---

## 8. Data Flow & Security Model

```
Browser  →  Supabase Auth (JWT with role in app_metadata)
         →  Direct queries (RLS enforces row visibility)
         →  Edge Functions (SECURITY DEFINER RPCs for all state transitions)
         →  DB constraints (last line of defence)
```

**The server is the authority.** The frontend mirrors state for display; it never decides it. Device clocks never open gates. Every state transition is an RPC. The browser is NOT the security boundary.

---

## 9. Route Map

```
/                           → redirect to role home
/sign-in                    → authentication

── Management (AppShell) ──────────────────────────────
/gm/control-tower           → Factory Control Tower
/plant                      → Physical plant (bunkers & tunnels)
/batch/:id                  → Shared batch page (6 densities)
/admin/today                → Admin daily work
/admin/batches              → All batches list
/admin/schedule             → Monthly schedule (BLOCKED: C-19, C-20)
/admin/batch/new            → Batch creation wizard
/admin/batch/:id/schedule   → Schedule builder
/admin/process-explorer     → Process definition viewer
/admin/reference            → Reference data
/manager/resources          → Resource allocation & Gantt
/supervisor/control-room    → Supervisor's urgency-ordered room

── Field (FieldShell) ─────────────────────────────────
/operator/my-work           → Operator task queue
/lab/queue                  → Lab technician queue

── Dev ────────────────────────────────────────────────
/dev/gallery                → Component gallery (DEV builds only)
```

---

## 10. What's Built vs What's Planned

### Built and functional
- Sign-in with Supabase auth and role resolution
- AppShell + FieldShell with per-role navigation
- Admin: Today, Batches, New Batch (5-step wizard), Schedule Builder, Process Explorer, Reference Data
- GM: Control Tower (staircase calendar + exception band + counters + vessel occupancy)
- Supervisor: Control Room (6 urgency bands, in-place verdicts)
- Operator: MyWork (task queue, countdown timers, weighment progress, task drawer)
- Lab: LabQueue
- Shared: BatchPage with hour rail, production graph, event stream, narrative
- Plant: physical factory vessel map
- Full primitives library (Chip, Card, Bar, Skeleton, Countdown, EmptyState, Band, etc.)
- Design tokens (light + dark theme)
- Route-level code splitting (operator APK never downloads management code)

### Blocked or not yet built
- Monthly Schedule (`/admin/schedule`) — blocked on C-19, C-20 (day-numbering base conflict)
- Current Activity as standalone route (`/operator/task/:id`) — TaskDrawer exists, not promoted yet
- Evidence Capture (S10) — blocked on A4 (file storage infrastructure)
- GM Decision Packages (9-section approval document) — needs K1/K4 data
- Manager's 21-day vessel Gantt — needs resource allocation backend
- Lab failures / deviations bands in Control Room — partially blocked on B2, B5

---

## 11. Mobile & Responsive

| Breakpoint | Behaviour |
|-----------|-----------|
| ≥ 1280px | Full layout — staircase calendar, side-by-side graph/stream |
| 768–1279px | Narrowed date window, stacked panels |
| < 768px | Staircase becomes vertical list, graph collapses to stream zoom |

**Capacitor**: Same build ships as Android APK. No second entry point, no separate Vite target.  
**Offline**: Connectivity shown as a persistent chip. Submissions queue locally with client-generated idempotency keys.  
**Safe areas**: CSS `env(safe-area-inset-*)` for notch and home indicator.

---

## 12. The One Rule That Ties It All Together

> The process is data. Adding an activity, changing a duration, or adding an evidence requirement is a seed-SQL change with zero application-code change.

The frontend renders whatever the `process_definition` table says. No activity name is hardcoded. No count is literal. No time is a magic number. The UI is a projection of the database — change the data, the UI follows.
