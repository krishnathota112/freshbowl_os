# Findings

**Something looks broken? Check here first — it may already be known, diagnosed and waiting.**

Severity uses the four-word vocabulary: `GREEN` proved · `AMBER` implemented but unproven · `RED`
broken or bypassable · `UNRESOLVED` needs a factory decision. Priority, where it helps: **P0**
falsifies history or bypasses a critical gate · **P1** wrong actor or cross-batch · **P2** workflow ·
**P3** usability.

**Reconciled against the deployed database on 11 September 2026.** The version before this still said
actuals could be overwritten and that 470 could not be stored — both stopped being true a week
earlier. It is kept at `docs/_archive/superseded-2026-09-11/FINDINGS-2026-08-31.md`.

---

## Open — breaks in the operational loop, for the UI build

Found by running the whole loop on an Android device on 10 September.

| ID | Status | Finding | Task |
|---|---|---|---|
| **F31** | **RED · P1** | **A lab technician cannot finish their own work.** `/operator/my-work` is guarded to `OPS`, which excludes `lab_tech`; the lab sample sheet has readings and retests but no evidence capture and no submit. Confirmed on the device: navigating there as `lab_tech` returns to `/lab/queue`. Only a supervisor can complete a lab activity. | `UI-001` |
| **F32** | **AMBER · P1** | **The camera control opens a gallery.** `<input type="file" capture="environment">` launched `com.google.android.photopicker`, not the camera — on an emulator that *has* a camera app registered for `IMAGE_CAPTURE`. An old photo can satisfy "before you begin". Needs one real handset to confirm. | `UI-002` · `DEC-026` |
| **F33** | **AMBER · P2** | **Activating a batch needs 93 separate assignments.** Assignment is a per-row menu; there is no bulk assign. | `UI-004` |
| **F34** | **AMBER · P2** | **The task drawer finishes work with `submit_activity`**, the backfill path, instead of `complete_activity`. Safe today — the server refuses stated times from an operator — but the wrong contract on a worker screen. | `UI-003` |
| **F35** | **AMBER · P2** | **No field says a running task is overdue.** `variance_minutes` exists only once work finishes, so a screen can say `Delayed` only by comparing a timestamp with the clock, which is forbidden. | `CT-001` |
| **F48** | **AMBER · P2** | **A batch already running cannot be brought to its current position in full, and that is the backend behaving correctly.** 93 of PROCESS-2026C's 110 activities require a photograph. `submit_activity` with stated times records them and **does not complete** an activity whose photograph is missing — so historical work, which has no photograph, stays open and the gates behind it stay shut. The onboarding flow therefore records what it legitimately can and says the rest in the server's own words. Options, for the process owner: photograph the paper record as the evidence; or decide a historical-entry path; or accept that only the current position is recorded. **No backend change was made.** | decision |
| **F45** | **AMBER · P2** | **Screens read base tables.** 28 direct reads of `batch_activity`, `master_batch`, `lab_*`, `gate_rule` and others, in twelve `src/api/` modules and three routes (measured 11 Sep). RLS still governs them, so this is a contract leak, not a hole — but a schema change breaks those screens, and they see columns no view chose to expose. | `ARCH-010`, folded into UI-008 … UI-014 |
| **F36** | **AMBER · P3** | **Some `blocked_reason` sentences lead with codes an operator does not know** — *"LAB-BNK-PRE: 0 of 1 approved…"*. The screen may not rewrite the server's sentence, so the sentence is the fix. | `CT-002` |

---

## Open — backend, recorded under the freeze and not fixed

The backend is frozen (`DEC-025`). These are real, and each needs a decision before it is touched.

| ID | Status | Finding | Task |
|---|---|---|---|
| **F37** | **AMBER · P2** | **`request_lab_test` has no role guard.** Any signed-in user can add a test to an existing sample, which freezes a specification band into it. Since `0072` an operator cannot *open* a sample, which limits the reach. One `assert_role` line. | `BE-001` |
| **F38** | **AMBER · P3** | **`v_unguarded_writer` reports 38 writers; the true number is 2.** It matches the literal text `assert_role`, so functions guarded by `assert_may_execute`, `can_capture_for_activity` or `has_role` are counted as unguarded, as are nine read-only helpers. The two genuine ones are `request_lab_test` (F37) and `expire_extensions`, which only applies an expiry the policy already makes due — and that policy is null. A regression check that is permanently red teaches everyone to ignore it. | `BE-002` |
| **F47** | **RED · P2** | **A poll that moves nothing writes 30 audit events** — a regression from `0072`, caught by `eventTrail.test`. `advance_batch` now rescans `READY` rows (so a later rejection can shut them), and a `READY` row whose gates still pass fell through to the open branch: set to `READY` again, counted, and a `gate_opened` event written. Measured 11 Sep: 36 `READY` before and after, 30 `gate_opened` on each call. My Work polls every 15 s, so an active batch writes about 120 untrue events a minute (`DEC-028`). **The fix is written and not applied** — `supabase/migrations/0077_a_poll_that_moves_nothing_writes_nothing.sql`, generated from the deployed body, one guard inserted; applying it to the database was held for the process owner's approval. | `BE-005` |
| **F49** | **RED · P1** | **`npm run db` re-executes every migration and seed against whatever `.env.local` names — today the live database.** `scripts/db.mjs` keeps no ledger (none exists in the database either), runs files one statement batch at a time with no transaction, and stops at the first failure. Against live it would: apply the unreviewed `0077`; re-run data backfills; re-run `s07` demo accounts and `s11` demo batches; and — via the edited `s03` — switch published PROCESS-2026B back to draft until `s13` republishes it, so a failure in between leaves it draft. The working-tree edits to applied migrations `0011`, `0012`, `0027` and seeds `s03`, `s10`, `s11` exist only to make that re-run survive; a fresh database replays without them. Classified 13 Sep in `04-audit/checkpoint-2026-09-13/`. **Do not run `npm run db`, `db:migrate` or `db:seed` against the configured environment.** Fix: a ledger-based runner that records applied files (baseline `0001`–`0076`), after which the historical edits are unnecessary. | decision |
| **F46** | **AMBER · P3** | **Cancelling a batch leaves its extension requests open.** 11 requests on the cancelled `MB-BRKX*` attack batches are still `REQUESTED` or `MANAGER_APPROVED` (probed 11 Sep). A manager or GM queue reading `v_extension_request` will ask for a decision on a batch that no longer exists, and `expire_extensions` sweeps them into its count. `cancel_batch` should close them with the cancellation reason. | `BE-004` |
| **F39** | **AMBER** | **Replay of the lab capture chain and of `raise_deviation` still duplicates.** No RPC accepts an idempotency key (probed 11 Sep). The field RPCs that matter most are now safe by other means — see `04-audit/IDEMPOTENCE.md` — but an offline queue replaying `open_lab_sample` would fabricate a sample. | with the offline queue |
| **F40** | **AMBER · P2** | **File content is not inspected.** The bucket enforces the *declared* type — `application/pdf` and `text/html` are refused — but PNG, HTML, PDF and executable bytes declared `image/jpeg` are all accepted. Storage bytes are not reachable from SQL, so this belongs at upload. | `UI-002` |
| **—** | **RED** | **`ARCH-006` — occupancy rows for vessels nobody allocated.** The `plant` test. Pre-existing, diagnosed as stale demo data. | `ARCH-006` |
| **—** | **AMBER** | **`ARCH-008` — schema drift.** Not re-verified this cycle; `SCHEMA.md` was regenerated on 11 Sep but no migrations-built-vs-deployed diff was run. | `ARCH-008` |
| **F11** | **AMBER** | **Confidence class.** `timing_confidence` exists and `PARALLEL_NO_WALLCLOCK` is excluded from the standard; `PRD-001`'s acceptance (every row classed) was not re-verified. | `PRD-001` |
| **F12** | **UNRESOLVED** | **The loader is not modelled.** Open question 1. | `OPEN-QUESTIONS.md` |
| **ARCH-007** | **AMBER** | **Actor on the event log.** Every *human* action carries actor and role (attacks W-AU-01/02, 11 Sep); gate and rest transitions have none by design, because the engine derived them from an act that is itself attributed. The staged demo history was not re-checked. | `ARCH-007` |

---

## Open — deployment, not code

| ID | Status | Finding | Task |
|---|---|---|---|
| **F41** | **UNRESOLVED → decided** | **A role change or a sign-out takes up to 60 minutes to bite.** `current_app_role()` reads `request.jwt.claims → app_metadata → app_role`, so an access token carries its role until it expires, and logout revokes only the refresh token. The process owner chose **1800 s**: a Supabase setting, not code. Revisit when the offline queue exists — a short expiry with no signal signs people out mid-task. | `DEP-001` |
| **F42** | **RED for production** | **`dev_environment_marker = 'development'`** on this database is what permits the dev clock. A production database must not carry it. | `DEP-002` |
| **F43** | **RED for production** | **Six demo accounts share the password `mushroom2026`**, shown on the sign-in screen, and demo batches run beside real ones. | `DEP-003` |
| **F44** | dev only | **Norton on the development machine rotates its TLS-interception root** (`2647F6A9…` → `D05F6067…` overnight), so the debug trust anchor goes stale and the emulator reports *"Could not reach the server"*. Re-export and rebuild. Does not affect a phone on an ordinary network. | — |

---

## Closed — fixed and proved

### This cycle, 8–11 September

Every one found by using the deployed system — over HTTP as a real signed-in person, or on a device —
and every fix re-attacked afterwards. Proof: `04-audit/SECURITY-ATTACK-MATRIX.md` §G and
`mushroomos/scripts/break/`.

| ID | Finding | Fix |
|---|---|---|
| **F15** | All 37 views were readable by `anon`, and three were **writable** by it. | `0061` — `security_invoker` on every view, no client write, nothing for `anon` |
| **F16** | An approval recorded the decision and **opened nothing** — the held activity stayed `LOCKED`. | `0064` → `0065`, through `advance_batch` |
| **F17** | An operator could start laboratory work; My Work listed all 41 lab rows; evidence could be filed under another batch's path. | `0066` |
| **F18** | Every **new** function was executable by `PUBLIC` — `0057`'s sweep covered only the functions that existed. | `0067` — an event trigger closes the class |
| **F19** | The pre-H0 weighment was planned **at** H0, ten hours late, on every batch. | `0068` — planned at H0 − offset, verified −10.00 h |
| **F20** | A new view inherited Supabase's full default grants — `anon` could write `v_lab_approval_queue`. | `0069` — an event trigger closes the class |
| **F21** | The approval queue answered every role alike: operator 697 rows, supervisor 697 rows. | `0070` — management only |
| **F22** | Starting a `LOCKED` task answered **204** and wrote *"Work started"*; five taps wrote five; a **zero-byte file** satisfied a photo requirement; an operator could finish work never started, **stamping a permanent actual**; concurrent finishes raced in the trail. | `0071` |
| **F23** | **A rejection after an approval left production open** — the queue said rejected, the gate said `READY`. `advance_batch` never re-examined an open activity. | `0072` — `READY` is re-evaluated; work in progress is never demoted |
| **F24** | An operator could open a lab sample; a reading could be filed at an unrelated checkpoint and **judged against its band** — 72.5–74 or 65–68 for the same value. | `0072`, narrowed to within a map by `0076` |
| **F25** | Activating a cancelled batch answered 204 and wrote **"Baseline frozen"**; a lab sample could be dated before its batch existed. | `0073`, the pre-H0 rule narrowed by `0075` |
| **F26** | 54 base tables granted `INSERT/UPDATE/DELETE/TRUNCATE` to `authenticated`; only missing RLS policies stopped the writes, and TRUNCATE ignores RLS. | `0074` — rule 5 at the privilege layer, and an event trigger for new tables |
| **F27** | `docs/SCHEMA.md` reported **all 38 views as not `security_invoker`** — the generator compared the stored option to `'true'`; Postgres stores `'on'`. The most trusted document said the opposite of the truth. | `scripts/schema-snapshot.mjs`, 11 Sep |
| **F28** | A half-finished incoming check **stranded the batch** — `accept_lab_result` had no caller outside the combined record-and-accept, so no role could finish it from any screen. | `ScheduleBuilder` · `prebatch.ts`, 10 Sep |
| **F29** | The Admin batch header showed **`H0 → H480`** — the day grid, computed in the screen. | `ScheduleBuilder`, 10 Sep |
| **F30** | My Work rendered **only the first** running task; the others vanished while still `IN_PROGRESS`. | `MyWork.tsx`, 9 Sep |

**Two fixes of this cycle were broader than the evidence for them**, and the existing suite caught
both: `0073` refused any sample before H0, including on batches whose H0 is in the future (`0075`
narrows it); `0072` required a checkpoint's binding across maps (`0076` narrows it to within one).

### Earlier, and still true

| ID | Finding | Fix |
|---|---|---|
| **F1** | `repoint_batch_activities` rewrote any batch's baseline, with no status or role check, granted to `anon`. | `0034`, 14 tests |
| **F2** | The extension workflow did not exist in any form. | `0036`, 21 tests |
| **F3** | Login worked and every role check failed — `current_app_role()` read only a claim that needed a dashboard hook. | `0035`, 9 tests |
| **F6** | **`assert_role` failed OPEN** — `NULL = any(...)` is NULL, the branch never ran. | `0035` §3, `coalesce(..., false)` |
| **—** | **Actuals could be overwritten** — `coalesce(p_actual_end, actual_end)` let the caller win. | `trg_actual_is_append_only`. It refused a clear **from a superuser connection** (9 Sep): *"There is no un-happen."* |
| **F7** | **470 could not be stored** — `baseline_hours` is `(total_days + 1) × 24`. | Superseded: the standard is **calculated** from the activities, `v_process_catalogue.standard_hr` = 470 |
| **F13** | The seeds held the losing H0 model; `is_pre_h0` was never applied. | `0068` |
| **F14** | The repository taught the wrong process — 15 root files, all naming 552. | Phase 0 restructure. **It recurred** — see the note at the top of this file. |
| **—** | Evidence was never proven end to end. | Proven on the device: uploaded, bound, byte-identical in storage (`959567` bytes), shown back through a signed URL |
| **—** | `send_alert` had no role guard. | Guarded — probed 11 Sep |
| **—** | A published definition was still editable. | Frozen — admin edits to activities, gates, evidence and bindings refused (W-PV, 11 Sep) |

**F6 is the one to remember.** RLS read the same expression in a `USING` clause where NULL is
treated as false — so RLS failed *closed* and looked broken, while the RPC guards failed *open* and
looked like they were working.

> **Any boolean a security decision reads must be `coalesce`d.** Three-valued logic is how a
> fail-closed guard becomes fail-open without anybody editing it.

---

## Resolved by ruling, kept for the reasoning

| ID | Was | Now |
|---|---|---|
| **F8** | Is 470 a target or a measurement of a simulation? | **A target.** Two bunker cycles after the Turner. `174 + 296 = 470`, exact. |
| **F9** | PRD §18 says T0→T1 has no gap; all six piles have one. | **The gap is normal.** Implementing §18 would raise six deviations per batch, forever. |
| **F10** | PRD §19 says `T2 = T0 + 24 h`. | **The gate is `T1 actual end + 8 h`**, per pile. Verified on the deployed engine: *"This pile rests 8 h after its own T1 ends."* |

---

## Not yet examined

Offline capture (not built) · the experimental template model · machine contention on the real
process — the exclusion is proven at model and RPC level, but no `PROCESS-2026C` activity carries an
assigned machine, so the *waiting-behind-a-machine* state has never been seen in a real batch.

**Not examined is not the same as working.**

---

## Method, learned the hard way

**Use the deployed system; do not read it.** Every serious defect in this list was invisible to
reading the code and appeared within minutes of calling it over HTTP as a real person, or tapping it
on a device.

**Measure the row, not the response.** `204` meant success, a no-op and a refused write on three
different occasions. Three candidate P0s were no-ops; one apparent pass was a malformed payload being
refused for the wrong reason.

**A test harness that turns its own errors into empty results will invent findings.** The first
adversarial run reported three defects that were one mistyped column. `readOrDie` in
`scripts/break/lib.mjs` exists so a broken query is fatal.

**Probe the deployed database before writing the fix** — `pg_proc`, `pg_policies`,
`role_table_grants` describe the system; migration files describe an intention.
