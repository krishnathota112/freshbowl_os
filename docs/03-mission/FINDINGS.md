# Findings

**Something looks broken? Check here first — it may already be known, diagnosed and waiting.**

Full write-ups in `T:\obsidian\memory\findings\`. Severity uses the four-word vocabulary:
`GREEN` proved · `AMBER` implemented but unproven · `RED` broken or bypassable · `UNRESOLVED`
needs a factory decision.

---

## Closed — fixed and proved

| ID | Finding | Fix |
|---|---|---|
| **F1** | `repoint_batch_activities` rewrote the entire baseline of any batch, with **no status check and no role check**, granted to `anon` and `PUBLIC`. Move the plan onto the actuals and every variance in the product reads zero. | `0034`, 14 tests. Guard moved to the writer, then restated as a table trigger. Four layers. |
| **F2** | The extension workflow did not exist in any form. Searching 33 migrations and all of `src/` for "extension" returned `create extension pgcrypto` and a filename helper. | `0036`, 21 tests. |
| **F3** | Login worked and **every role check failed**, because `current_app_role()` read only the JWT claim, and the claim only exists if a Supabase dashboard hook is enabled. Symptom: *"auth doesn't work."* | `0035`, 9 tests. `profiles` fallback — safe because `profiles` has SELECT-only policies, so a user cannot promote themselves. Verified, not assumed. |
| **F6** | **`assert_role` failed OPEN.** `NULL = any(...)` is NULL, `not NULL` is NULL, the branch is never taken, the function returns normally. Nine guarded RPCs were open to any caller with no role claim. | `0035` §3. `coalesce(..., false)`. |

**F6 is the one to remember.** RLS read the same expression in a `USING` clause where NULL is
treated as false — so RLS failed *closed* and looked broken, while the RPC guards failed *open* and
looked like they were working. "Auth doesn't work" and "auth is fine" were both true at once.

> **Any boolean a security decision reads must be `coalesce`d.** Three-valued logic is how a
> fail-closed guard becomes fail-open without anybody editing it.

---

## Open — RED

| ID | Finding | Where |
|---|---|---|
| **—** | **`actual_start` / `actual_end` can be overwritten.** `0016` writes `actual_end = coalesce(p_actual_end, actual_end)` — the caller's parameter wins over the stored value. A live path through the supported RPC. | `ARCH-001` · migration `0038` |
| **F7** | **The 470-hour envelope cannot be stored.** `baseline_hours` is `generated always as ((total_days + 1) * 24)`. 470 is not a multiple of 24, so no integer `total_days` produces it. | `PRD-002` · migration `0041` drafted |
| **F14** | **The repository teaches the wrong process.** 15 root markdown files, 10,193 lines; **15 of 15 mention 552, none mentions 470.** Seven are pasted conversation filed where specifications live. | Phase 0 · `scripts/restructure-docs.sh` |
| **—** | **Evidence never proven end to end.** All 20 evidence tests skip on `403 AccessDenied`. "Evidence is real" is an assertion. | `ARCH-004` |
| **—** | **Schema drift.** 2 tables and 11 functions in the deployed database that no migration creates — including a **dev clock**. If `get_effective_now()` is reachable from anything that writes ACTUAL, AUTHORIZATION or AUDIT, every timestamp is deniable. | `ARCH-008` |

**F7's danger is the plausible wrong fix.** `total_days = 19` gives 480 — close enough to look right
on a screen, wrong by ten hours in every variance the product computes, and **permanent**, because
the plan freezes at activation. The integrity guarantee would then be protecting the error.

---

## Open — AMBER

| ID | Finding | Note |
|---|---|---|
| **F11** | **No confidence class in the schema.** PRD §61 requires every process value to carry one of seven classes and forbids silent promotion. There is nowhere to record it. The classification exists in a markdown table, where no engine can read it and no constraint can defend it. | `PRD-001` · `0040` drafted |
| **F12** | **The loader is not modelled.** It does the bunker fill, the unload/reload and the tunnel load — and appears in no source sheet and no `resource_requirement`. *Bunker fill = 2 h was confirmed 30 Aug; the resource half stays open.* | partly resolved |
| **F13** | **The seeds hold the losing H0 model.** Six activities sit on Day 1 that the confirmed model puts on Day 0, and two on Day 8 that belong on Day 9. `is_pre_h0` / `pre_h0_offset` exist in the deployed schema, created by no migration, unset. | `PRD-005` |
| **—** | **`send_alert` has no `assert_role` at all.** `SECURITY DEFINER`, granted to `authenticated`. Any signed-in user can alert any role. Five-line fix. | `ARCH-009` |
| **—** | **No publish/freeze on process definitions.** A definition an active batch was generated from is still editable. | `ARCH-003` |
| **—** | **The event log has no actor.** The demo batch's events are all stamped H456 with "no actor recorded". A history with no actor answers none of the product's questions. | `ARCH-007` |
| **—** | **Occupancy invents rows.** Three `location_occupancy` rows for vessels nobody allocated. **Diagnose before fixing** — stale demo data or a live defect. | `ARCH-006` |

---

## Resolved by ruling, kept for the reasoning

| ID | Was | Now |
|---|---|---|
| **F8** | Is 470 a target or a measurement of a simulation? | **A target.** Two bunker cycles after the Turner, not three. Confirmed 30 Aug. The derivation is still why the number is what it is: `174 (SOP max pre-Turner) + 296 (Turner sheet span) = 470`, exact. |
| **F9** | PRD §18 says T0→T1 has no gap; all six piles have one (1.5–4.5 h). | **The gap is normal.** The continuity belongs to the *machines*, which run nine hours with no idle minute. **§18 must not be implemented as written** — it would raise six deviations per batch, forever. |
| **F10** | PRD §19 says `T2 = T0 actual start + 24 h`; the source says 12.5–15.5 h. | **The gate is `T1 actual end + 8 h`** — honoured to the minute on all six piles and stated independently in the SOP prose. **§19 is rejected.** A wrong number behind a correct freeze is worse than an editable one, because the guarantee then protects the error. |

---

## Never audited at all

Evidence capture → storage → retrieval · the lab permission model · the gate engine ·
resource and movement · forecast · process versioning · the experimental template model ·
the UI data contracts.

**Never audited is not the same as working.** These are the reason the mission's Phase 1 exists.

---

## Method, learned the hard way

**Probe the deployed database before writing the fix.** Three conclusions moved the moment the live
database was actually queried rather than read from migration files: `repoint_batch_activities` was
granted to `anon` and `PUBLIC`, not just `authenticated`; `batch_activity` grants no write at all to
any client role; `profiles` had three policies and all three were SELECT.

**Assert the outcome, not the mechanism.** A self-promotion test did not raise — it affected zero
rows, because RLS `USING (false)` filters and only `WITH CHECK` raises. Asserting the outcome is both
correct and stronger.

**"I traced them" must mean traced, not sampled.** When claiming no regression, find the mechanical
check. Here: new guards can only fail loudly and in their own words, so grepping the whole run for
each new refusal message is the check that earns the claim.
