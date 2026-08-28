# Implementation checklist

**Date:** 25 August 2026  
**Status:** Architecture accepted. This is the final planning pass. **Do not redesign.**  
**Sources:** `docs/CANONICAL_MUSHROOMOS_ARCHITECTURE.md` §14–§21.  
`docs/CURRENT_TO_TARGET.md` is **referenced but not present** in the repo; KEEP / MODIFY / ARCHIVE / BUILD below is taken from architecture §14 plus the screen and activity matrices (§20–§21).

**Canonical runtime:** `mushroomos/` only.  
**Web and Capacitor mobile:** same `domain/` + `api/` + routes. Capacitor is a build artifact, not a second product.

---

## Frozen corrections (do not reopen)

1. **Hour layers (UI must show all four; never collapse to one “hour”)**  
   `STANDARD POSITION` → `ADMIN BATCH PLAN` → `ACTUAL` → `FORECAST`  
   Standard planned hour today = `rel_day * 24` until Admin sets `planned_time` (migration `0027_hourly_plan.sql`). That is a **baseline**, not a factory-confirmed exact hour.

2. **Day 1 lab is four checkpoints** (already seeded — keep):  
   `LAB-FIB-WET` → `LAB-FIB-MOISTURE-1` → `LAB-FIB-HOP2` → `LAB-FIB-PREBUNK`  
   `FIB1-HOP-2` remains operator-chosen dry/water; auto-select stays off.

3. **T1 → T2 is same pile** (`SAME_SCOPE_INSTANCE`). T2 is available for that pile immediately. No global T1 barrier.

4. **Chairman is the seventh role.** Home = Control Tower. Drill: Tower → Master Batch → Individual Batch → H-hour → activity → proof.

5. **Tunnel timeline (seeded, do not invent another clock):**  
   TN-LOAD `H360–H384` → TN-HOLD `H384–H528` → TN-UNLOAD `H528–H552`.

---

## Status legend

| Mark | Meaning |
|---|---|
| **KEEP** | Already in canonical `mushroomos/`. Do not rewrite. |
| **MODIFY** | Exists; change behaviour or wiring only as specified. |
| **BUILD** | Missing in canonical. Implement in `mushroomos/`. |
| **BLOCKED** | Cannot finish until a factory TBD / conflict is decided. Do not invent. |

For **BUILD** and **MODIFY** rows, the four fields are: source file, API/domain, screen, acceptance test.

---

## Build sequence (execute in this order)

| Phase | Name | Scope |
|---|---|---|
| **P0** | Canonicalize | One runtime. Shared API/domain. Archive old APKs after schedule merge. Folder move toward architecture §15 (no second app). |
| **P1** | Monthly schedule → new batch | Codex schedule into canonical. Create Master Batch from scheduled group. Hour-layer labels on plan. |
| **P2** | H0–H168 execution | Operator + Lab + server timestamps + evidence for fibre / straw / mix through yard rest. |
| **P3** | H168–H552 execution | Parallel piles, T1→T2 same pile, bunker, tunnel load / hold / unload. |
| **P4** | Chairman / GM / Manager | Seventh role, Control Tower home, Plant + Tower on management nav, shared playhead. |
| **P5** | Proof panel | Actual media + people + machines + vessels + lab + decision, not counts. |
| **P6** | Resources / movement / Individual Batch | Per-movement claims, IB drill, Plant occupancy at playhead hour. |
| **P7** | Reports / Excel | From the execution record. |
| **P8** | Growing room / harvest / yield | From factory forms after compost handoff. Not a new process definition. |

Do not start a later phase by inventing a new architecture. Unblock **BLOCKED** items only with factory answers.

---

## P0 — Canonicalize

| ID | Item | Mark | Source | API / domain | Screen | Acceptance |
|---|---|---|---|---|---|---|
| P0-1 | Canonical tree is `mushroomos/` | KEEP | `mushroomos/` | `src/api/*`, `src/domain/*` | all | Web and APK load the same Vite `dist/`. `capacitor.config.json` `appId` = `in.freshbowl.mushroomos`. |
| P0-2 | H-clock | KEEP | `src/domain/time.ts` | no `552` literal in `src/domain/` | TimeLabel, HourRail | `src/domain/time.test.ts` + `tests/hourAxis.test.ts`. Device clock cannot open a rest. |
| P0-3 | PROCESS-2026B published definition | KEEP | `supabase/seed/s03_process_2026b.sql`, `s08_routing_lab_activities.sql` | `api/processDefinition.ts` | Process explorer | Published definition `PROCESS-2026B` v1; `anchor_day_label` Day 0 = Fibre Weighment; `total_days = 22`. |
| P0-4 | Server timestamps | KEEP | `supabase/migrations/0006_execution.sql` | `start_activity`, `submit_activity` via `api/batch.ts` | TaskDrawer | Operators cannot type actual start/end. `tests/recordedActuals.test.ts`. |
| P0-5 | RLS + JWT role claim | KEEP | `0001_foundation.sql`, `0015_role_claim.sql` | `lib/auth.ts`, `api/client.ts` | Sign in | `RoleGuard` is defence in depth only; RLS is the boundary. |
| P0-6 | FieldShell vs AppShell | KEEP | `components/layout/FieldShell.tsx`, `AppShell.tsx` | `lib/useDensity.ts` | operator/lab vs management | `tests/fieldShell.test.ts`: operator never downloads AppShell chunk. |
| P0-7 | Individual batches + movement tables | KEEP | `0031_individual_batches_and_movements.sql` | `api/movements.ts` | Batch page, MovementPlan | IB unique `batch_no`; movements BUNKER_FILL, BUNKER_RELOAD_1/2, TUNNEL_LOAD, TUNNEL_OUT. |
| P0-8 | Merge monthly schedule from codex | BUILD | Copy into canonical: `mushroomos-codex/src/routes/MonthlySchedule.tsx`, `api/monthlySchedule.ts`, `lib/monthlyScheduleImport.ts`, `supabase/migrations/20260824192339_monthly_schedule.sql` | new `mushroomos/src/api/monthlySchedule.ts` | `/admin/schedule` | Canonical `App.tsx` routes `/admin/schedule`. Creating a batch from a group does not require `mushroomos-codex` running. |
| P0-9 | Route `App.tsx` toward `src/app/` | MODIFY | `mushroomos/src/App.tsx`, `main.tsx` | none (move only) | all | Same URLs after move. No new routers. Optional; do not block P1. |
| P0-10 | Archive `apk_extracted/` | KEEP until move | `apk_extracted/` | none | none | Move to `archive/apk_extracted/` when ready. **Do not delete. Do not connect to live DB.** |
| P0-11 | Archive `mushroomos-codex/` | BUILD after P0-8 | `mushroomos-codex/` | none | none | After schedule merge, move to `archive/mushroomos-codex/`. Stop using as a second product. |
| P0-12 | Dev Gallery | KEEP | `src/routes/Gallery.tsx` | fixtures | `/dev/gallery` | Omitted from production chunks. Not a factory screen. |
| P0-13 | `Pending.tsx` | KEEP | `src/routes/Pending.tsx` | none | not routed | Do not promote to a product screen. |

---

## Screen matrix

Every row from architecture §20.

| Screen | Path | Mark | Phase | Source file | API / domain | Acceptance |
|---|---|---|---|---|---|---|
| Sign in | `/sign-in` | KEEP | P0 | `src/routes/SignIn.tsx` | Auth + `profiles`; `lib/auth.ts` | Email/password → JWT `app_role` → `ROLE_HOME[role]`. |
| Admin Today | `/admin/today` | KEEP | P2 | `src/routes/AdminToday.tsx` | `api/adminToday.ts` | `tests/adminToday.test.ts`. Today’s exceptions/work; no invented Delayed status. |
| Monthly schedule | `/admin/schedule` | **BUILD** | **P1** | Merge `mushroomos-codex/src/routes/MonthlySchedule.tsx` into canonical `src/routes/MonthlySchedule.tsx` (target folder `routes/admin/` optional) | `monthlySchedule.ts` + `monthlyScheduleImport.ts` + `monthly_schedule_import` / `monthly_schedule_group` | Upload Excel for a month → groups listed with status → action opens New Batch with identity + H0 prefilled. Same screen on web and APK. |
| Batches | `/admin/batches` | KEEP | P0 | `src/routes/Batches.tsx` | `api/batches.ts` | List of master batches → `/batch/:id`. |
| New Batch | `/admin/batch/new` | **MODIFY** | **P1** | `src/routes/NewBatch.tsx` | `create_master_batch`, `generate_activity_plan` (`api/batch.ts`, `0005_generate_plan.sql`) | From schedule group **or** manual. Identity + H0 + Day-0 config + individuals → draft MB + H0–H552 plan. `tests/batchCreation.test.ts` extended: schedule-origin path. |
| Schedule builder | `/admin/batch/:id/schedule` | **MODIFY** | **P1** | `src/routes/ScheduleBuilder.tsx` | `api/schedule.ts`, `api/movements.ts`; `0027_hourly_plan.sql`, `0028_clear_planned_time.sql`, `0029_vessel_slots.sql`, `0030_batch_start_override.sql` | UI labels **standard vs Admin planned** hours. Clearing planned time restores standard (`rel_day * 24`). `tests/hourlyPlan.test.ts` plus UI assertion: standard is not shown as factory-confirmed. |
| Batch page | `/batch/:id?h=` | **MODIFY** | **P4–P5** | `src/routes/BatchPage.tsx` | `api/batchPage.ts`, `PlayheadContext` | Shared `?h=` with rail, narrative, events, Plant. Individuals visible. `tests/batchPage.test.ts`. |
| Batch detail (embedded) | inside Batch page | KEEP | P1 | `src/routes/BatchDetail.tsx` | `activate_batch` | Activate freezes plan. Draft cannot execute. |
| Plant | `/plant` | **MODIFY** | **P4, P6** | `src/routes/Plant.tsx` | `api/plant.ts` | Occupancy at **playhead hour**, not only “now”. Bunkers not a permanent batch property (0031). `tests/plant.test.ts` with `?h=`. Put Plant on GM **and** Manager nav (`AppShell.tsx`). |
| Process explorer | `/admin/process-explorer` | KEEP | P0 | `src/routes/ProcessExplorer.tsx` | `api/processDefinition.ts` | Shows PROCESS-2026B graph from data. |
| Reference | `/admin/reference` | KEEP | P0 | `src/routes/ReferenceData.tsx` | reference tables (`0002`) | Materials + conflict register visible. Do not silently resolve conflicts. |
| My Work | `/operator/my-work` | KEEP | P2 | `src/routes/MyWork.tsx` | generated `batch_activity` | Next READY / IN_PROGRESS. FieldShell for operator. |
| Task drawer | overlay | KEEP (proof MODIFY in P5) | P2 | `src/routes/TaskDrawer.tsx` | `start_activity`, `bind_evidence`, `submit_activity` (`api/batch.ts`) | Lifecycle READY → START → before evidence → values → after evidence → SUBMIT. Server stamps. `tests/evidence.test.ts`, `tests/gates.test.ts`. |
| Lab queue | `/lab/queue` | KEEP | P2 | `src/routes/LabQueue.tsx` | `api/lab.ts`; `0022_lab.sql`, `0032_prebatch_material.sql` | Queue, versioned results, retest v2, **NO SPEC** never invented PASS/FAIL. `tests/lab.test.ts`, `tests/labUi.test.ts`. |
| Control Room | `/supervisor/control-room` | KEEP | P2 | `src/routes/ControlRoom.tsx` | `api/controlRoom.ts`; `0017_deviations.sql` | RELEASE / HOLD / RETURN / escalate with who, when, reason. `tests/controlRoom.test.ts`, `tests/deviations.test.ts`. |
| Resources | `/manager/resources` | KEEP | P6 | `src/routes/Resources.tsx` | `0021_resources.sql` | Utilisation + conflicts. Server-side double-book refuse. `tests/resources.test.ts`. Manager nav should also reach Plant + Tower. |
| Control Tower | `/gm/control-tower` | **MODIFY** | **P4** | `src/routes/ControlTower.tsx` | `api/tower.ts`; composites `StaircaseCalendar`, `HourRail`, `ExceptionBand` | Chairman + GM home. Playhead H n / H552. Drill to batch → activity → proof. `tests/controlTower.test.ts`, `tests/tower.test.ts`. |
| Gallery | `/dev/gallery` | KEEP | P0 | `src/routes/Gallery.tsx` | fixtures | DEV only. |
| Growing room / harvest / yield | **not built** | **BUILD** | **P8** | new route(s) under `src/routes/` — **not** a new process graph | factory forms; after `TN-UNLOAD` | Compost batch links to growing room → spawn → harvest → yield. Do not add invented PROCESS-2026B codes. |
| Reports / Excel | **not built** | **BUILD** | **P7** | new `src/routes/` + export helper | execution record (`batch_activity`, lab, evidence, events) | Workbook of plan vs actual + lab + deviations for a Master Batch / month. |
| Proof panel | partial | **MODIFY** / **BUILD** | **P5** | new `src/components/composite/ProofPanel.tsx`; wire from `BatchPage.tsx`, `FiveLayerNode.tsx`, `Narrative.tsx` | Storage + `bind_evidence` (`0014_evidence_storage.sql`) + activity row + lab versions + deviation verdict | Open an activity: **actual media** (not counts), planned vs actual, people, machines, vessels, lab, decision. Chairman path from Tower. |
| Operator task deep link | `/operator/task/:id` | **BUILD** | P2 | FieldShell comments S9/C6; extend `App.tsx` + `TaskDrawer` | same as TaskDrawer | Opening a task URL on mobile shows that activity. Optional if My Work + overlay already works; required if push/QR later. |
| Chairman role home | same Tower URL | **BUILD** | **P4** | `lib/auth.ts`, `0001_foundation.sql` `app_role` enum, `AppShell.tsx` | JWT claim | Seventh role `chairman` **or** documented alias of `gm` (factory choice). If enum: migration `0033+` in canonical only. Home `/gm/control-tower`. RLS read-only on execution writes. |

---

## Activity matrix (PROCESS-2026B + s08)

H-range = **standard** window from `rel_day`. Admin may shift planned hour. Execution UI is `MyWork` + `TaskDrawer` + `LabQueue` unless noted.

Shared KEEP for every seeded operator/lab row unless overridden:

- Template: `supabase/seed/s03_process_2026b.sql` and/or `s08_routing_lab_activities.sql`
- Fields: `s05_fields_route2026a.sql`
- Gates/evidence names: `s04_gates_evidence.sql`
- Lab specs: `s06_lab.sql`, `s10b_lab.sql`
- Plan generation: `generate_activity_plan` (`0005_generate_plan.sql`)
- Hour default: `0027_hourly_plan.sql` — **MODIFY UI in P1** so this default is labelled STANDARD, not confirmed

| H-range | Activity | Mark | Phase | Notes / BUILD-MODIFY detail |
|---|---|---|---|---|
| Pre-H0 | Incoming material sample (0032) | KEEP | P2 | `0032_prebatch_material.sql`, `open_prebatch_sample` in `api/lab.ts`. Not a `batch_activity`. **BLOCKED** vs lab dictation Day-0 (TBD-57): do not merge into H0. Activation blocked if missing when seeded that way. Screen: Lab queue. Test: extend `tests/lab.test.ts`. |
| H0–H24 | FIB1-WEIGH (per load) | KEEP | P2 | Cardinality DERIVED_FROM_QUANTITY. TaskDrawer. Evidence: weighment slip / loaded vehicle. **MODIFY (P5)** proof must show slip media. **BUILD (P6/P8 later)** formulation/weighbridge extra fields **without** inventing moisture bands. Test: `tests/dayZeroToSix.test.ts`. |
| H24–H48 | LAB-FIB-WET | KEEP | P2 | Four Day-1 labs stay separate. LabQueue. NO SPEC if unmapped. |
| H24–H48 | FIB1-HOP-1 | KEEP | P2 | Hopper pass 1 (water). before/after evidence. |
| H24–H48 | LAB-FIB-MOISTURE-1 | KEEP | P2 | Informs HOP-2; does **not** auto-select variant. |
| H24–H48 | FIB1-HOP-2 | KEEP | P2 | Operator chooses dry **or** water. Auto-select off. **BLOCKED** to add auto moisture rule until factory decides. |
| H24–H48 | LAB-FIB-HOP2 | KEEP | P2 | |
| H24–H48 | LAB-FIB-PREBUNK | KEEP | P2 | Last check before bunker. |
| H24–H48 | FIB1-BUNK-LOAD | KEEP | P2 / P6 | Movement dest bunker. `api/movements.ts`, `MovementPlan.tsx`. Double-book refuse server-side. |
| H48–H96 | FIB1-REST-1 | KEEP | P2 | Time gate. `0008_rest_gate.sql`, `unblocks_at`. **BLOCKED** duration TBD-21 — do not hard-code hours in `src/domain/`. Rel_day 3 has no extra operator row (continuation). |
| H96–H120 | FIB1-UNLOAD | KEEP | P2 | |
| H96–H120 | LAB-FIB-MOISTURE-2 | KEEP | P2 | |
| H96–H120 | FIB1-HOP-3 | KEEP | P2 | |
| H96–H120 | FIB1-BUNK-RELOAD | KEEP | P2 / P6 | Reload to **new** bunker (per-movement claim, not 0026 lifetime). **MODIFY:** do not let leftover `0026_vessel_allocation.sql` drive UI. |
| H96–H120 | STRAW-RECEIPT | KEEP | P2 | |
| H96–H120 | STRAW-INSPECT | KEEP | P2 | |
| H96–H120 | STRAW-WEIGH | KEEP / **BLOCKED** field | P2 | Operator weigh + `LAB-STRAW-WEIGH` moisture + `dry_weight`. **BLOCKED** TBD-45: `dry_weight` stays `no_spec` until factory spec. Screen: TaskDrawer + LabQueue. |
| H96–H120 | STRAW-BALE-CUT | KEEP | P2 | |
| H120–H144 | STRAW-SOAK-1 | KEEP | P2 | `LAB-LAGOON-1` pH/EC/TDS. |
| H120–H144 | STRAW-BUNK-STORE | KEEP / **BLOCKED** occupancy | P2 / P6 | Competes for bunker (C-24). Do not invent a second bunker model. Server exclusion stays. |
| H120–H144 | STRAW-REST-1 | KEEP | P2 | Time gate. |
| H144–H168 | STRAW-SOAK-2 | KEEP | P2 | `LAB-LAGOON-2`. |
| H168–H192 | STRAW-SOAK-3 | KEEP | P3 | `LAB-LAGOON-3`. |
| H168–H192 | STRAW-REST-2 | KEEP | P3 | Time gate 14–16 h is **data**, not a domain constant. |
| H168–H192 | NMIX-ROTAVATE | KEEP | P3 | Named evidence incl. ammonium sulphate. Resource: rotavator. |
| H168–H192 | FIB1-YARD-UNLOAD | KEEP | P3 | Creates piles (CREATES_SCOPE_INSTANCES). |
| H168–H192 | YD-NMIX-ADD | KEEP | P3 | Per pile. |
| H168–H192 | YD-FLIP-1 / YD-FLIP-2 | KEEP | P3 | Per pile. Turner. |
| H168–H192 | YD-HOP-COMBINE | KEEP | P3 | Merge to MIXED-PILE. |
| H168–H192 | YD-REST | KEEP | P3 | Time gate. |
| H168–H192 | STRAW-YARD-LOAD | KEEP / **BLOCKED** count | P3 | **BLOCKED** TBD-19 pile count — do not hard-code pile N in activity codes. |
| H192–H216+ | YD-FLIP-3 / YD-FLIP-4 | KEEP | P3 | May extend past display day. UI must allow cross-day activity. |
| H192–H216+ | TR-T0 | KEEP | P3 | Per pile. |
| H192–H216+ | TR-T1 | KEEP | P3 | Per pile. **No global T1 barrier.** Gate: `SAME_SCOPE_INSTANCE`. |
| H200–H217+ | TR-T2 | KEEP | P3 | Available immediately for **that pile** after its T1. Test: add pile-scoped gate case in `tests/gates.test.ts` if not already present. |
| H192–H240 | P1-BUNK-LOAD | KEEP | P3 / P6 | May cross H216. `LAB-BUNK-FILL`. |
| H240–H288 | P1-REST-1 | KEEP | P3 | Continuation days 9–11 are not new templates. |
| H288–H312 | P1-BUNK-RELOAD | KEEP / **BLOCKED** history | P3 | One Phase-1 reload (C-25 frozen). **Do not add a second reload** until factory clears the conflict. `LAB-BUNK-RELOAD`. |
| H312–H360 | P1-REST-2 | KEEP | P3 | Days 14 continuation. |
| H360–H384 | TN-LOAD | KEEP | P3 / P6 | Per tunnel / individual batch (366→T10 pattern). `LAB-TUNNEL-LOAD`. Movement `TUNNEL_LOAD`. Screen: TaskDrawer + Plant + Batch IB drill. |
| H384–H528 | TN-HOLD | KEEP / **BUILD** fields / **BLOCKED** stages | P3 | Time gate + Phase-2 **bands in data**. Ammonia/fan **fields missing** → **BUILD** only after factory field list (`s05` + TaskDrawer). **BLOCKED** TBD-08 thermal stage names — bands only, no invented activities. Days 17–21 are continuation. |
| H528–H552 | TN-UNLOAD | KEEP then **BUILD** handoff | P3 / P8 | `LAB-COMPOST-OUT` + sensory photos. Next growing room **not built**. |

Days with **no new template codes** (9, 11, 14, 17–21): **KEEP** as continuation of rests/holds. **Do not BUILD invented steps.**

---

## Cross-cutting BUILD / MODIFY (files, APIs, screens, tests)

### P1 — Monthly schedule → Master Batch + hour layers

| ID | Mark | Source | API / domain | Screen | Acceptance |
|---|---|---|---|---|---|
| P1-1 | BUILD | `mushroomos-codex/src/routes/MonthlySchedule.tsx` → `mushroomos/src/routes/MonthlySchedule.tsx` | `monthlySchedule.ts`, `monthlyScheduleImport.ts` | `/admin/schedule` | Admin uploads month Excel; groups appear; status stored in `monthly_schedule_*`. |
| P1-2 | BUILD | Codex migration `20260824192339_monthly_schedule.sql` → next canonical number `0033_*.sql` (or next free) | Postgres only | — | Migration applies on canonical project. Codex tree not required. |
| P1-3 | MODIFY | `src/App.tsx`, `components/layout/AppShell.tsx` | `lib/auth.ts` ROLE_HOME unchanged | Admin nav | Admin sees Schedule next to Today / Batches / New Batch. |
| P1-4 | MODIFY | `src/routes/NewBatch.tsx` | `api/batch.ts` `create_master_batch`; query params from schedule group | `/admin/batch/new` | Prefill identity + planned H0 from group. Manual create still works. |
| P1-5 | MODIFY | `src/routes/ScheduleBuilder.tsx`, `components/domain/TimeLabel.tsx`, `components/domain/HumanDuration.tsx` | `domain/time.ts`; `planned_hour_source` from 0027 | Schedule builder, Batch page rail | Four labels: STANDARD / ADMIN PLAN / ACTUAL / FORECAST. Standard never copy-written as “exact factory hour”. |
| P1-6 | MODIFY | `src/routes/BatchDetail.tsx` | `activate_batch` | Batch page | Activate after plan review. Generated plan is H0–H552 from PROCESS-2026B only. |

### P2 / P3 — Execution (no new engine)

| ID | Mark | Source | API / domain | Screen | Acceptance |
|---|---|---|---|---|---|
| P2-1 | KEEP | `TaskDrawer.tsx`, `MyWork.tsx` | `api/batch.ts` | Field mobile + web | Operator journey 4 (architecture §19). |
| P2-2 | KEEP | `LabQueue.tsx` | `api/lab.ts` | Lab | Journey 5. Concurrent batches switchable. |
| P2-3 | KEEP | `ControlRoom.tsx` | `api/controlRoom.ts` | Supervisor | Journey 6. |
| P2-4 | BUILD (optional URL) | `App.tsx` | same RPCs | `/operator/task/:id` | Deep link opens TaskDrawer on that id. |
| P3-1 | KEEP | seed s03 TR-T1 / TR-T2 | gates SAME_SCOPE_INSTANCE | TaskDrawer / Batch page | Completing T1 on pile A unlocks T2 on pile A while pile B may still be on T1. |
| P3-2 | BUILD fields | `s05_fields_route2026a.sql` + TaskDrawer field renderer | `batch_activity` values | TN-HOLD | Ammonia / fan values only after factory list. Until then **BLOCKED**. |

### P4 — Chairman / GM / Manager

| ID | Mark | Source | API / domain | Screen | Acceptance |
|---|---|---|---|---|---|
| P4-1 | BUILD | `0001_foundation.sql` `app_role`; new `0033+` if enum extended; `lib/auth.ts` `AppRole`, `ROLE_HOME` | JWT hook | Sign in | Chairman signs in → Control Tower. **Factory chooses enum vs gm alias; do not invent a second tower.** |
| P4-2 | MODIFY | `AppShell.tsx` | none | nav | GM: Tower, Plant, Batches, Process. Manager: Resources, **Plant**, **Tower**, Batches. Chairman: Tower-first (read). |
| P4-3 | MODIFY | `ControlTower.tsx`, `StaircaseCalendar.tsx`, `HourRail.tsx`, `PlayheadContext.tsx` | `api/tower.ts` | `/gm/control-tower` | Timeline visualization: H0 → prep → paddy → yard → turning → bunker → reload → rest → **TN-LOAD H360** → **TN-HOLD H384–H528** → **TN-UNLOAD H528–H552**. Click hour → batch → activity. |
| P4-4 | MODIFY | `Plant.tsx`, `BatchPage.tsx` | `PlayheadContext`; `?h=` | Plant + Batch | Same playhead. Occupancy matches selected hour. |

### P5 — Proof panel

| ID | Mark | Source | API / domain | Screen | Acceptance |
|---|---|---|---|---|---|
| P5-1 | BUILD | new `src/components/composite/ProofPanel.tsx` | Storage URLs from evidence rows; `api/batch.ts` bind; `api/lab.ts` versions; deviations | Batch page, Tower drill, FiveLayerNode evidence layer | Media renders (image/pdf). Counts-only is a fail. |
| P5-2 | MODIFY | `FiveLayerNode.tsx`, `Narrative.tsx`, `EventStream.tsx` | `0018_event_trail.sql` | Batch page | SOP / plan / actual / evidence / decision all visible at management density. |
| P5-3 | KEEP | `0014_evidence_storage.sql`, `bind_evidence` | `api/batch.ts` | TaskDrawer capture | Upload then bind. Live-camera-only **BLOCKED** (factory policy). QR **BLOCKED** until P6+ policy. |

### P6 — Movement / Individual Batch / resources

| ID | Mark | Source | API / domain | Screen | Acceptance |
|---|---|---|---|---|---|
| P6-1 | KEEP | `0031_individual_batches_and_movements.sql` | `api/movements.ts` | MovementPlan, ScheduleBuilder | Per-movement vessel claims. |
| P6-2 | MODIFY | `MovementPlan.tsx`, `BatchPage.tsx` | `api/batchPage.ts` | `/batch/:id` | Drill IB 366 / 367 / 368 to tunnel. Journey 8. |
| P6-3 | MODIFY | UI must ignore 0026 lifetime binding | `0026` historical | Plant, Schedule | New UI uses 0031 only. |
| P6-4 | KEEP | `0021_resources.sql` | Resources route | `/manager/resources` | Exclusion constraints remain server-side. |
| P6-5 | BUILD | formulation / weighbridge field seeds | `s05` + TaskDrawer | FIB1-WEIGH, STRAW-WEIGH | Extra fields from factory forms only. No invented moisture bands. |

### P7 — Reports

| ID | Mark | Source | API / domain | Screen | Acceptance |
|---|---|---|---|---|---|
| P7-1 | BUILD | new route e.g. `src/routes/Reports.tsx` | read-only queries on execution + lab + events | management | Export Excel for a Master Batch: standard vs admin plan vs actual, lab versions, deviations. |

### P8 — Growing room / harvest / yield

| ID | Mark | Source | API / domain | Screen | Acceptance |
|---|---|---|---|---|---|
| P8-1 | BUILD | new tables/migrations `0033+` **after** factory forms (`room.md` / factory harvest sheets are **reference**, not a new PROCESS-2026B) | new `api/` module shared web/mobile | new screens | TN-UNLOAD compost links to growing room → spawn → harvest → yield. Not a second APK. |
| P8-2 | BLOCKED | — | — | — | Do not start P8 until compost QC fields and room identity are confirmed. |

---

## Explicitly out of scope (do not spend build time)

| Item | Mark |
|---|---|
| Another architecture / another APK product | forbidden |
| Reconnecting `apk_extracted` to live Supabase | forbidden |
| PWA offline queue / service worker | **BLOCKED** (C-FIELD vs Architecture V2) |
| Live-camera-only evidence | **BLOCKED** |
| Delayed status invention | **BLOCKED** |
| Moisture auto-select for HOP-2 | **BLOCKED** |
| Second Phase-1 bunker reload | **BLOCKED** (C-25) |
| Invented TN-HOLD stage activities | **BLOCKED** (TBD-08) |
| Hard-coded 552 or rest hours in `src/domain/` | forbidden |
| Mixing-as-Day-0 vs Fibre-Weighment-as-Day-0 | **BLOCKED** keep register (C-19/C-20); runtime stays PROCESS-2026B |
| TBD-50 timezone | **BLOCKED**; default H0 wall **05:00** factory time (TBD-47 answered) |
| Weighbridge / harvest as extra ERP roles | forbidden; profiles of the seven |

---

## Acceptance journeys (from architecture §19) mapped to phases

| # | Journey | Phase when it must pass |
|---|---|---|
| 1 | Monthly schedule upload → group → Master Batch (identity + H0) | P1 |
| 2 | Configure materials / loads / IBs / resources / movements / tunnels / lab / evidence | P1 |
| 3 | Generate H0–H552 → review → validate → activate | P1 |
| 4 | Operator START → before → values → after → SUBMIT (server) | P2 (full through H168), P3 (through H552) |
| 5 | Lab queue → sample → result or NO SPEC → retest v2 | P2 |
| 6 | Deviation → supervisor RELEASE / HOLD / RETURN | P2 |
| 7 | Chairman Tower → playhead → proof with actual media | P4 + P5 |
| 8 | Individual batch tunnel drill | P6 |
| 9 | Compost → growing room → spawn → harvest → yield | P8 |

**Web and APK:** each journey passes on both surfaces without a second business layer.

---

## Stop

This file is the implementation backlog for Kiro.

Implement the approved architecture exactly. Do not redesign. Start at **P0** (canonical runtime) then **P1** (monthly schedule → Master Batch). For each ID: implement → test → open the UI → verify the workflow → next ID.

The APK is the Capacitor build of this source. Do not create another APK architecture.
