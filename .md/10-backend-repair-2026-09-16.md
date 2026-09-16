# 10 · Backend repair pass — 16 Sep 2026

Work done against the **live** Supabase target `szwosmyqwvpaqugjtzcp` (PostgreSQL 17.6). Every change was trialled
inside a rolled-back transaction first, then applied. Rollback bodies now live in `freshbowl_os/db-rollback/`
(the old folder outside git was deleted by another agent; see §K).

## A · Backend readiness matrix

| Area | Exists | Correct in source | Runtime proven | Gap / fix |
|---|---|---|---|---|
| Process graph (dependencies, gates, holds) | yes | yes | yes — projection walks it, 11/11 | — |
| New batch creation / activation | yes | yes | yes — used in every test | — |
| Running-batch onboarding | yes | yes (after 0106) | yes — 0106 suite | H0 unknown case stays unknown, by design |
| Activity inputs rendered from process data | yes | yes | yes — TaskDrawer reads `batch_activity_value` | **weighment numbers missing from 3 activities** (§E) |
| Time gates / late tickets | yes | yes | yes — 0097/0100 suites | — |
| **Dependency projection** | **no → added (0109)** | yes | yes — 11/11 | replaces global-slip forecast |
| **Vessel readiness / cleaning** | **no → added (0110/0111)** | yes | yes — 15/15 | checklist wording is the SOP's; more items = factory call |
| Exact-vessel allocation + occupancy | broken | fixed (0111) | yes — occupancy now recorded | was silently dead: 0 occupancy rows ever |
| Lab → GM → gate | yes | yes | yes — 12/12 | no active GM login on the database today |
| Evidence | yes | yes | yes — reuse/empty/phase rules hold | — |
| Concurrency (two batches, same vessel) | partly | fixed (0111) | yes | — |
| **Admin batch delete** | **no → added (0112)** | yes | yes — 9/9 | DEMO/TEST only; storage files stay |
| Admin "Now" | no → added (UI) | yes | views proven; screen not clicked | needs a human pass |

## B · Active process graph

`PROCESS-2026J v1` (published, current since 15 Sep). 113 activities: 64 supervisor, 8 holds, 41 Lab.
The full table — hours, dependencies, gates, records — is [03-process-flow.md](03-process-flow.md), generated from
the same runtime source. Classification: PARALLEL (bagasse / paddy / CM streams, Turner piles P1–P6, bunkers B1–B3),
CONVERGENCE (`MIX-CM-ADD`, `YARD-ADD`, `BNK-B3-TUN-LOAD` → `TN-LEVEL`), GATE (4 Lab-approved steps),
HOLD (8), RESOURCE_READINESS (bunker/tunnel filling, now backed by 0110).

## C · New batch contract

`create_master_batch(code, label, start_date, config, roles, supervisor, weather, start_at, process_definition_id)`
→ `generate_activity_plan(batch)` → pre-H0 material (`open_prebatch_sample` → `request_lab_test` →
`record_lab_result`) → `validate_batch(batch)` → `activate_batch(batch)`.

| Input | Required | Source / written to | Default | Validation |
|---|---|---|---|---|
| Process version | yes | `process_definition` (picker shows published) | current from `process_catalogue` | must be published |
| Batch code | yes | `master_batch.code` | — | unique, non-empty |
| Label | no | `master_batch.label` | code | — |
| Material per role | yes for required roles | `batch_material_role` | lead material of the role | unbound role ⇒ its activities are skipped |
| H0 date + time | yes (new batch) | `master_batch.start_at` via `factory_instant` | today 06:00 | resolved in the factory timezone, server-side |
| DEMO / TEST | no | `master_batch.is_demo` via `mark_batch_demo` | false | draft only, one-way |
| Initial material readings | yes to activate | `lab_sample`/`lab_test`/`lab_result` | — | activation refuses without them |

## D · Running-batch onboarding contract

`onboard_batch(batch, h0 | null, positions[], completed_streams[], note)`.

- **Position per stream** = the step being worked now. Its entry rules are waived (`onboarded_position`).
- **Completed streams** and everything before a position ⇒ `before_tracking = true`, state SKIPPED, no planned time,
  no photos or readings asked for. Nothing is fabricated: no timestamps, no performers, no approvals.
- **0106**: parallel work in the same stream planned to end by the time the position starts is before tracking too
  (onboarding "at pile 4 T2" no longer leaves piles 1–3, 5–6 open at T0), and every remaining live task gets a
  planned time (39 tasks had none before).
- **H0 unknown** is preserved as unknown; the plan counts forward from the moment of onboarding.

## E · Activity input contract — and the one real gap

Inputs are defined in `activity_field` per `process_activity`, copied to `batch_activity_value` at plan generation,
and rendered dynamically by the task screen (no per-activity React form). Verified on 2026J: 46 of 57 supervisor
activities carry fields (readings, checklists, machine choice).

**NEEDS FACTORY DECISION — the physical weighments are not recorded as numbers.**

| Activity | Today | Missing |
|---|---|---|
| `FIB-WEIGH` New bagasse weighment | no fields, 2 photos | fresh / dry / actual weight numbers and units |
| `CM-WEIGH` CM + gypsum + AS weighment | no fields, 2 photos | CM, gypsum, ammonium sulphate weights |
| `STR-WEIGH` Paddy bales weighment | 3 checklist ticks | paddy weight number |
| `LAB-RM-01`, `LAB-PDY-WGH`, `LAB-CM-ARR` | Lab parameters + slip photo | whether the weight belongs to the Lab checkpoint or the field task |

Adding them is one migration (a new process version) once the factory states the exact fields, units and whether
they are entered by the supervisor or the Lab. They were **not** invented here.

## F · Dependency-projection contract (0109)

`project_batch(batch)` → per activity: `planned_start_at/planned_end_at` (frozen baseline), `actual_*`,
`ready_at` (earliest eligible), `projected_start_at/projected_end_at`, `basis`, `waiting_for_code/title`,
`blocked_reason`, `delay_minutes`. Views: `v_activity_projection`, `v_batch_projection` (adds batch H-hour).

Rules proven on the runtime: only real edges propagate; a convergence takes the maximum of its branches; rests are
added per edge; a Lab gate leaves the step blocked with the GM named; the baseline is never written; an approved
extension moves the **due** time, not the dependents.

## G · Resource-readiness contract (0110 / 0111)

`request_vessel_cleaning` → (`assign_vessel_cleaning`) → `start_vessel_cleaning` → `attach_readiness_photo` →
`complete_vessel_cleaning(checklist)`. State per vessel in `v_vessel_readiness`: ready when it is not occupied, its
status is available, and it has been cleaned since it was last released. `allocate_vessel(..., activity_code)`
refuses an unready vessel, by location — other vessels are unaffected. Upcoming needs: `v_resource_need`.

## H · Lab gate proof

`LAB-BNK-PRE` → sample → readings → photos → submit (COMPLETED) → gate still shut ("0 of 1 approved") → queue shows
`approver gm` → Lab and supervisor refused → GM reason required → rejection keeps it shut → approval opens exactly
`FIB-BUNK-LOAD` and nothing else → remark readable by management. 12/12.

## I · Extension / ticket proof

Case A (critical predecessor), B (independent branch unchanged), C (convergence), D (authorised but unused: due time
moves, dependents do not), E (multiple upstream delays) — covered by the 0109 suite and the earlier 0100 suite.

## J · Demo evidence

| Scenario | Result |
|---|---|
| DEMO-NEW-STANDARD | PASS — new batch on 2026J, plan generated, parallel streams independent |
| DEMO-RUNNING-ONBOARD | PASS — 0106 suite, 9/9 |
| DEMO-TURNER | PASS — pile 1 late, piles 2–6 unmoved |
| DEMO-LAB-GATE | PASS — 12/12 |
| DEMO-TICKET | PASS — 0100 suite, 14/14 |
| DEMO-PARALLEL-DELAY | PASS — 0109 suite, 11/11 |
| DEMO-RESOURCE-READY | PASS — 0110 suite, 15/15 |
| DEMO-NEW-LOCAL | NOT RUN — Local Paddy / Soak 3 is a factory decision (§K) |

## K · Remaining factory decisions and gaps

1. **NEEDS FACTORY DECISION — weighment fields** (§E).
2. **NEEDS FACTORY DECISION — Local Paddy removes Soak 3.** Another agent left `0107_material_conditional_eligibility.sql`
   on disk, unapplied and uncommitted. It is not applied here: the rule itself is unanswered.
3. **NEEDS FACTORY DECISION — cleaning checklist.** The items used are the SOP's own bunker preparation / cleaning
   and tunnel preparation lines. Whether more belongs on them is the factory's call.
4. **No active GM login** on the database: Lab approvals cannot be given until one is switched on.
5. **Storage files of a deleted test batch** stay in the bucket (Supabase refuses SQL deletes there); the count is
   reported so an Admin can clear them.
6. **Another agent's uncommitted work** is untouched in the working tree: 0107, 0108, 607 deleted files
   (`mails/`, `_archive/`, `src/legacy/`), and edits to `App.tsx`, `batches.ts`, `auth.ts`.
7. **The old rollback folder** outside git was deleted; rollback bodies from here on are in `freshbowl_os/db-rollback/`.
8. **The new Admin screens have not been clicked through** by a person; their data sources are proven on the runtime.
