# CLAUDE HANDOFF — read this in 2 minutes, then open `docs/IMPLEMENTATION_STATE.md`

> **26 Sep 2026 — read `docs/IMPLEMENTATION_STATE.md` from "26 Sep 2026 (CLI)" onward first.** Current process is
> **PROCESS-2026M** (not 2026K as below); migrations through 0139; SOP builder live (0138); repo = private
> github.com/krishnathota112/freshbowl_final; phone app = `field-app/`. The sections below are older history.


## PROJECT

MushroomOS — factory process execution + monitoring for button-mushroom compost (Fresh Bowl
Horticulture). Not a task manager. It answers: what should be happening now, what actually
happened, what is ready/waiting/blocked and why, what is late, what the forecast is, which Lab/GM
approval or ticket is holding work, which physical bunker/tunnel is needed and whether it is ready.

App: `mushroomos/` — React 18 + Vite + Capacitor Android, Supabase Postgres with RLS.
Authority documents: `CLAUDE.md`, then **every** file in `docs/MUSHROOMOS_GEETHA_FINAL/`.
Raw factory sources: `docs/SOURCE/` (Compost SOP.xlsx, TURNERPRCOESS.xlsx, LAB-2026A .docx).

## CURRENT PROCESS

**PROCESS-2026K v1 — published, current.** Ceiling **H476**, stated and `FACTORY_CONFIRMED`.
113 activities, 1412 gate rules, 41 Lab bindings.
Punjab/Standard Paddy is the only active material variant (Soak 1 → 2 → 3).

## CURRENT DB STATE

Shared live Supabase (`SUPABASE_DB_URL` in `mushroomos/.env.local`). **It holds real batches, real
staff logins, evidence and the audit trail. Never reset, reseed or bulk-delete it.**

**16 Sep 2026 (owner request): `158.1,159.1,160.1` is the ONLY live batch.** Every other draft/active
batch was cancelled via `cancel_batch` as an Admin profile, reason "Cleared on owner request 16 Sep
2026": demo `999.998.997`, `11,22,33`, `001,002,003`, `878,879,880`, `202,203,204` and the non-demo
fixtures `TEST-K-PAIR-02`, `TEST-K-READY-01`, `TEST-K-READY-02`. Nothing was deleted. The kept
batch's master row and all 113 activity rows were byte-identical before and after. New test
fixtures must be created fresh (or inside a rolled-back transaction).

| Batch | Version | Status | Demo | Note |
|---|---|---|---|---|
| `158.1,159.1,160.1` | 2026J | active | no | **REAL.** Onboarded at bunker loading |

Migrations applied through **0118**, plus **0125** (onboarding per unit + preview), **0126** (Lab rejection returns to Lab), **0127–0128** (third fibre role), **0129** (pre-H0 weight parameters); 0119–0124 left for Stage 2c on the other laptop. All four pre-existing active batches are pinned to 2026J and
were byte-identical before and after every change so far.

## COMPLETED WORK

- **Stage 0** — applied `0107` (material-conditional capability, unused) and `0108` (ticket photo
  eTag protection; retired extension RPCs revoked). PASS.
- **Stage 1** — `0114` (an exit PREDECESSOR gate is a real refusal) and `0115` (PROCESS-2026K:
  bunker pair at the fill's exit, H476 envelope stated). 8 runtime checks PASS.
- **Stage 2a** — `0116` (`NOT_DUE_YET` enum) and `0117` (the planned hour decides READY:
  `planned_time_status`, `start_block_reason` as its wrapper, `advance_batch`, `admin_force_open`),
  plus the four frontend label maps and the removal of `BatchMonitor`'s own `notDueYet()` derivation.
  13 runtime checks PASS. `npx tsc --noEmit` clean.
- **Stage 2b** — `0118` (WAITING vs BLOCKED; a failing predecessor outranks every other reason;
  `v_batch_monitor.production_not_due`). 8 runtime checks PASS, including the full
  record → evidence → submit → GM-approve chain opening a BLOCKED activity.

## CURRENT WORK

**Deployment MVP sprint (user scope, 16 Sep 2026).** Stage 2b is complete. Defer Stage 2c/2d
and the Admin redesign. Verify the existing new Punjab/Standard batch + single H0 + plan,
concurrent-batch isolation, Supervisor Start/Finish, Lab submission + GM gate decision,
ticket creation + Admin decision/remark visible to the requester, production build,
Cloudflare deployment and post-deployment smoke test. Make only necessary fixes/minimal UI changes.
No new scheduler, forecast refactor, Local Paddy, resource-cleaning work or visual polish.
Cloudflare project/URL requested from the user; no deployment config found in initial inspection.

Sprint progress: `scripts/sprint-proof.mjs` passed the rolled-back Admin create → initial material
→ activate path for 113 PROCESS-2026K tasks, one H0, future timing, authenticated Supervisor Start,
ticket → Admin decision → requester-visible remark, Lab queue reads, and unchanged existing active
batches/new baseline. No fixtures retained, migrations or persistent DB changes. One failed proof
assumed a READY Lab checkpoint at H0: all 40 queue checkpoints correctly await predecessors; the
pre-H0 checkpoint is excluded from that queue. Corrected that assertion rather than product logic.
Fixed LabQueue omitting WAITING_CONDITION/NOT_DUE_YET rows (11 live Lab waiting rows observed).
Added planned H-hour labels to Supervisor/Lab cards, existing server current_hour to BatchMonitor,
and defaulted the monitor to Now. Full Admin redesign remains deferred. Final production build and
the LabQueue rendering regression both passed; no comprehensive remote suite was run.
Browser verification is blocked: in-app browser failed to attach twice. Cloudflare destination/access
and test-account sign-in are still pending from the user. No deployment has been attempted.

16 Sep (later): added `mushroomos/public/_redirects` (`/* /index.html 200`, SPA fallback for
BrowserRouter on Cloudflare Pages). `npm run build` clean; `npx cap sync android`; debug APK built
with Android Studio's JBR (`JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"`,
`./gradlew.bat assembleDebug`) after pointing the git-ignored `android/local.properties` at
`C:/Users/prath/AppData/Local/Android/Sdk`. APK verified to carry the same `index-*.js` as `dist/`.
**DEPLOYED** to Cloudflare Pages project `mushroomos` (production branch `main`):
https://mushroomos.pages.dev. Redeploy from `mushroomos/`: `npx wrangler@4 pages deploy dist
--project-name mushroomos --branch main`. Smoke test: `/`, a deep route and the JS bundle all 200.
Signed-in role-flow check on the live site still not done.

**Acceptance:** `node mushroomos/scripts/demo-acceptance.mjs` (rolled back) — 28/28 PASS on 16 Sep after
reactivating GM login `singh`; all three GM logins had been deactivated, which silently made every Lab
gate unopenable. Results table in IMPLEMENTATION_STATE.md.

**Onboarding (16 Sep evening):** per-unit onboarding screen + `preview_onboard_batch` live (0125).
Proof `scripts/onboarding-units-proof.mjs` 15/15 (14/14 `--live`). See IMPLEMENTATION_STATE.md.
**Do not edit `onboard_batch` from the Stage 2c laptop without pulling 0125 first.**

**24 Sep 2026 — SOP editing + batch amendments live** (0130, 0131, 0132). Admin → SOP. Running batches get recorded amendments
(frozen plan untouched, dependents re-pointed, forecast moves down the chain only); Lab checks = real Lab tasks (Admin-ticked
parameters, Record/Gate); cleaning = real bunker/tunnel jobs with optional VESSEL_READY wait. **0132 redefined `evaluate_gates`
from its live body + VESSEL_READY — pull before touching it.** Details + proofs: IMPLEMENTATION_STATE.md, last section.
Demo fixture DEMO-SOP-1 is live (is_demo).

**25 Sep 2026 — running batches from a template.** `mushroomos/scripts/running-batch/` (make-template / load-running-batch,
dry run by default). Live: `155,156,157` active on 2026L, H0 02/09 20:00, at TN-COOL-2. Open: 3-tunnel model gap. See IMPLEMENTATION_STATE.md, last section.

**25 Sep 2026 (evening) — PROCESS-2026M (one tunnel per part, 0133) is LIVE and CURRENT.** 155–178 (8 batches) loaded on it with
formulation weights; 179 stays on 2026L. Weights now typed/shown in tons (built, not deployed). See IMPLEMENTATION_STATE.md, last sections.

**26 Sep 2026 — READ FIRST:** findings + owner decisions from the desktop session are in IMPLEMENTATION_STATE.md, section
"26 Sep 2026 — findings and owner decisions" (Lab due inheritance, field due from planned end, APK photo viewer, flicker/audit spam,
orange IF steps 0D/1D-B, Turner workbook schedule, 144 vs 147 h unresolved, Phase 1 vs Phase 2 boundary).

## HANDOFF RULE

Update `IMPLEMENTATION_STATE.md` and this file at the end of **every** stage, before starting the
next. Assume the session can die after any command. Never write "see previous conversation".

## NON-NEGOTIABLE RULES

```
H0 = master batch clock; H476 = ceiling, never invent a later endpoint
Process = dependency graph, NOT a flat task list
Baseline ≠ Actual ≠ Extension ≠ Forecast — an extension never rewrites a baseline
READY = startable NOW. Future work = NOT_DUE_YET
Passive rests are time windows, not human Start/Finish tasks
Delays propagate only through true dependencies; parallel branches stay independent
Lab RECORD ≠ Lab GATE (4 GATE, 1 DECISION, 20 RECORD). Lab cannot self-approve
B1 = P1+P2, B2 = P3+P4, B3 = P5+P6. Fill OPENS on the first pile; the pair is required
  before pair-dependent continuation
Resources are exact physical resources; cleaning/readiness is a real workflow
Process rules live in versioned process/domain data — never in React
No second process engine. No second scheduler. No second ticket system.
Never rewrite a published process version or an activated batch baseline
Never use fake data or UI filtering to hide a backend problem
DEMO must use the same business rules; only the clock may accelerate (NOT yet implemented)
```

## KNOWN RISKS

1. **`batch_clock_waived(b) = b.is_demo`** — demo currently *waives* rests, elapsed time, min
   durations and the early-start refusal. This is a defect the documents name explicitly. Deferred
   to the last stage; until then **do not trust a demo batch to prove a timing rule.**
2. **Passive holds still show as `READY`** rather than "resting". `is_time_gate` is false on all 113
   activities, so `WAITING_TIME` / `unblocks_at` are built and dormant. Enforcement is correct (the
   exit `MIN_DURATION` gate holds); only the state vocabulary is wrong. Stage 2c.
2b. **Blocker sentences still begin "Locked —"** even on a `WAITING_CONDITION` row. The wording is
   process data in published PROCESS-2026K, so it needs a new version — **not** a React patch.
3. **Two forecast engines live** — `project_batch` (correct, dependency-driven) vs
   `v_batch_forecast` (batch-wide worst slip). The UI mostly reads the wrong one.
4. `assert_role` grants **no exemption to the DB owner**. A migration or script with no JWT cannot
   call a role-guarded RPC. Adopt a role the way `tests/db.ts` `actAs` does.
5. The four active batches stay on 2026J, so they keep 2026J's behaviour including the dead-end
   piles. Their baselines are frozen. That is the rule, not an oversight.

## NEXT ACTION

Open `docs/IMPLEMENTATION_STATE.md`, read **NEXT ACTION** at the bottom, and continue from there.

## 27 Sep 2026 — Experimental Process Builder (stage 1: interaction only)

Built from the owner's spec (`OneDrive\Desktop\context.txt`). A separate mode, NOT the H0–H474 engine:
the Admin draws a process on an empty canvas, runs it, and every real action is appended as a
timestamped event. No plan, due time, grace, ticket or "late" anywhere.

- Route `/admin/experiments` (list + create) and `/admin/experiments/:id` (board). Admin only. Nav: "Experiments".
- Code: `mushroomos/src/features/experiments/`
  - `model.ts` — pure graph + event reducer (`apply`), statuses derived (`computeStatuses`), never stored.
    Nodes: work, lab, cleaning, split, combine, decision, movement, end. Entities: piles (made by a split,
    count fixed once material moves), Bunkers 1–3, Tunnels 1–3 (one of each slot). Edges = "can begin
    after"; option `when: 'start'` = parallel start. Entity→entity edges are the ONLY movements allowed.
    Lab mode per node: none / record / gate (needs GM approval to finish) / decision (PASS/FAIL path).
    Decisions: only drawn paths can be chosen; unchosen paths become "not taken". Joins are AND.
    Once live, graph edits are soft (removed flags) and each bumps `revision`; started nodes can't change.
  - `model.test.ts` — 10 tests (sequence, parallel-on-start, decision + merge, split/bunker/tunnel moves,
    lab gate + GM return, evidence, live revisions, loops, ended).
  - `store.ts` — STAGE 1 STORAGE IS THE BROWSER: localStorage (`mushroomos.experiments.v1`) and photos in
    IndexedDB (`mushroomos-experiments`). Nothing touches Supabase. "⤓ Data" downloads the full record as JSON.
  - `components/Canvas.tsx` (pan/zoom/drag/connect), `Inspector.tsx` (build config + run "game card"),
    `pages/ExperimentBoard.tsx`, `pages/Experiments.tsx`. Colour tokens `--x-*` in `styles/tokens.css`.
- Runtime-tested in the browser (temporary sign-in-free harness, since removed): create, add node, drag,
  connect, refusal toast, start, machine, photos, parallel open, decision, lab gate → GM → finish, split,
  pile → bunker → tunnel moves, live edit → rev 2. `npm run build` passes.
- CLAUDE.md says process rules don't belong in React: the rules are in `model.ts` (no React) so stage 2 can
  move `apply` behind an RPC and tables (`exp_*`) unchanged. Until then it is single-computer, and the GM /
  Lab / Supervisor actions are recorded by the Admin on their behalf.
- Open for stage 2: server tables + RPCs, real role routing (Lab submits, GM approves, supervisors act
  from the phone), photos in storage, experiment comparison/analysis.

## 27 Sep 2026 (later) — Experimental Mode: DIRECTION CHANGED — read before touching experiments

The canvas builder above (`src/features/experiments/`) is a **prototype that breaks the Geetha rule
"no second process engine"**. Do not extend it. The agreed direction:

- An experiment = a **version of the existing SOP**, flagged experimental, edited as rows in the existing
  SOP builder (0138). Default: clone the current standard; blank allowed.
- An experimental batch = a normal `master_batch` in **observed-time mode**: same dependencies, per-pile
  steps, Lab RECORD/GATE/DECISION, readings, photos, resources, audit — but no planned/due times, no
  tickets, no "late". H0 kept as a reference clock; standard time shown as reference only.
- A running batch keeps the revision it started on; changes to it are batch amendments.
- Compost Log (`dc_*`, 0141) is to be merged into the same batch/event model later — no second database.
- The canvas survives only as a read-only map drawn from the rows.

Design: **`docs/EXPERIMENTAL_MODE_SPEC.md`** (extensions E1–E16, phases 1–4, open decisions).
Answers to the 45 questions, with status Decided / Confirm / Factory: the shared doc
https://claude.ai/code/artifact/0137b4b0-623b-4aba-9c0f-77985af2eabe ("Decisions (27 Sep 2026)").

Engine facts found while designing (verified in code):
- `CREATES_SCOPE_INSTANCES` / `PER_SCOPE_INSTANCE` (count from Day-0 config) / `MERGES_SCOPE_INSTANCES`
  already exist (`evaluate_cardinality`, 0005/0139; `src/domain/cardinality.ts`). Live versions use
  `FIXED_LABEL` P1–P6 only because per-instance put all piles on one planned hour (0043) — irrelevant
  without planned hours, so pile count per batch is cheap.
- `gate_rule.predecessor_binding` ALL_INSTANCES / ANY_INSTANCE / SAME_SCOPE_INSTANCE; `activity_variant`
  for in-step variants; `activity_state` already has SKIPPED / CANCELLED / RETURNED.

NOT started: no migration, no code for the spec. Next step = owner reviews the spec and answers the
six OPEN decisions (Q14, 20, 25, 27, 38, 41); then Phase 1.

## Experimental Mode — build log (Phase 1, started 27 Sep 2026)

Spec: `docs/EXPERIMENTAL_MODE_SPEC.md` (v2). Read it first.

| Step | Status | Proof |
|---|---|---|
| 0142 `experimental_mode` — `process_definition.kind/derived_from/experiment_note`, `batch_is_experimental`, `create_experimental_process`, observed-time patches (`activity_due`, `planned_time_status`, `time_gate_status`, `evaluate_gates`, `advance_batch`), `set_current_process` refuses experiments, `batch_move_event` + `batch_move_photo` + `record_move` / `void_move` / `attach_move_photo`, bucket `moves`, views `v_experiment`, `v_batch_mode`, `v_batch_move`, `v_process_edge` | **APPLIED LIVE** 27 Sep | `node scripts/experimental-mode-proof.mjs [--live]` → 10/10 (rolled back) |
| 0143 `clone_keeps_experiment_kind` — a new draft of an experiment stays experimental | **APPLIED LIVE** 27 Sep | `node scripts/clone-keeps-kind-0143-proof.mjs --live` → PASS |
| Rollbacks | `db-rollback/pre_0142__experimental_mode.sql`, `pre_0143__clone_keeps_kind.sql` | |
| Web: `/admin/experiments` (list, New experiment = clone a standard → opens the SOP editor, Publish, Start a batch), `/admin/experiments/:id/map` (process map from rows), `/admin/experiments/batch/:batchId` (live batch map: states, H-hours, "k/n inputs done" at meeting points, movement log, Admin record/void move with stated time + reason). Code: `mushroomos/src/features/experiments/` (`api.ts`, `components/GraphView.tsx`, `pages/Experiments.tsx`, `ProcessMap.tsx`, `BatchMap.tsx`). Stage 1 canvas files deleted. SOP home hides `EXP-%` versions. | built; `tsc` clean, `npm run build` ok, `tests/fieldShell.test.ts` 32/32 | **Not yet clicked through signed in** (no password available to the agent) — next agent/owner: sign in as Admin and walk: create → edit rows → publish → start batch → batch map → record move |
| Field app: `www/move.html` (Record a movement: from/to bunker/tunnel, piles, photo, remark; server time), `batch.html` (EXPERIMENT tag, "Record a movement" button, "ref" hours), `task.html` (experiment card: nothing is late, standard reference, rest ends when confirmed), `work.html` ("Experiment · ref" hours), `api.js` `uploadMovePhoto`, `signedUrl(path, secs, bucket)`. versionCode 2 / 1.1-experiments | built → `workingcode/MushroomOS-field-2026-09-27-experiments.apk` (6.4 MB); page scripts syntax-checked; `tests/alarms.test.cjs` 6/6 | **Not yet tried on a phone** |
| Web deploy | NOT deployed — owner runs `npx wrangler@4 pages deploy dist --project-name mushroomos --branch main` from `mushroomos/` after `npm run build` | |

### How the owner uses it (Phase 1)
1. Web → Experiments → New experiment (starts from the current standard) → SOP editor opens on the copy → change rows → back → Publish.
2. Start a batch → the normal Batch start with the experiment preselected (`?process=`), same material/H0/onboarding as usual.
3. Phone (new APK): the batch shows EXPERIMENT; steps open as soon as what they wait for is done (no planned-hour lock, no tickets); rests are confirmed by a person; "Record a movement" logs B2 → B3 etc.
4. Web → the batch map shows what happened (H-hours), which meeting points are waiting on what, and every movement.

### Next (Phase 2, spec §6)
Pile count per batch (`CREATES_SCOPE_INSTANCES`/`PER_SCOPE_INSTANCE`), "any N of pile group" binding (Q14), controlled split N→M (Q20), options with Admin/reading as decision source, loops with max rounds, moves writing `location_occupancy`, Admin correction rows for step times (step times are append-only), outcomes + compare (Phase 3), Compost Log merge (Phase 3).

Helper scripts (read-only against live): `scripts/_fndump.mjs <out> <fn...>` dumps live function definitions;
`scripts/_probe_exp.mjs`, `_probe_exp2.mjs` print the facts in spec §7.

## 27 Sep 2026 (latest) — DIRECTION: MushroomOS Tasks, a separate app. READ `docs/PRD_MUSHROOMOS_TASKS.md` FIRST.
The owner chose a simple, separate task app (own APK + web page, tables `tk_*`, migration 0144 LIVE, proof 9/9)
over Experimental Mode inside the main app. Experimental Mode (0142/0143, experiments screens) is PARKED — live but
hidden from the main menu; do not extend it unless asked. APK: `MushroomOS-Tasks-2026-09-27.apk`.
