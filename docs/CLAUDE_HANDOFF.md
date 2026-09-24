# CLAUDE HANDOFF — read this in 2 minutes, then open `docs/IMPLEMENTATION_STATE.md`

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
