> **ARCHIVED 31 Aug 2026 — historical record, not an instruction.**
> Superseded by `docs/AGENT-BRIEF.md` (all coding agents) and `docs/CLAUDE-CODE.md`.

# The prompt for Claude Code

Open Claude Code in `T:\freshbowl_os` and paste the block below. It is written to be pasted whole.

Everything after it — the appendices — is for you, not for Claude Code.

---

```text
You are working on MushroomOS, the production management system in this repository.

Read CLAUDE.md and docs/00-START-HERE.md first. Then read docs/03-mission/MISSION.md in full.
Do not read the repository broadly: docs/_archive/ contains thousands of lines of superseded
instruction describing a 552-hour process the factory no longer runs. Reading it will lead you
to rebuild the wrong system. The current process is 470 hours.

Your job right now is PHASE 0 and PHASE 1 of that mission. Nothing else.

═══════════════════════════════════════════════════════════════════════════════
PHASE 0 — restructure the documentation
═══════════════════════════════════════════════════════════════════════════════

Run:
    bash scripts/restructure-docs.sh

Review every move with `git status` before committing. The script deletes nothing — it moves
files with `git mv` so history follows them, and it prints its own proof at the end.

Then verify by hand, and tell me:
  - the repository root holds CLAUDE.md and README.md and no other markdown
  - eleven live documents exist in six numbered folders under docs/
  - every remaining "552" outside _archive/ and _reference/ is historical context
    ("the old model", "sweep this out"), never an instruction

Commit as one change. Then move to Phase 1.

═══════════════════════════════════════════════════════════════════════════════
PHASE 1 — the red-team audit.  REPORT ONLY.  YOU WILL NOT CHANGE ANY CODE.
═══════════════════════════════════════════════════════════════════════════════

THIS IS THE RULE THAT GOVERNS EVERYTHING BELOW:

    Phase 1 produces a report and changes no code. You stop, and I read it,
    before anything is fixed. If you find yourself editing a migration,
    a function, a test or a screen during Phase 1, you have left the mission.

    `git diff` at the end of Phase 1 must touch docs/ and nothing else.

Do not fix what you find. Do not "quickly patch" anything. Do not refactor while you are in
there. Write it down and keep going. A finding fixed in passing is a finding I never got to
read, and the map is worth more to me right now than any individual fix.

── The question ──────────────────────────────────────────────────────────────

Not "can the operator edit it in the UI?" — a hidden button is not security.

    Can anyone cause the database to believe something happened earlier, faster,
    by someone else, or under a different condition than it really did?

Assume an authorised insider who has the anon key, a REST client, and every intention of
making a batch look better than it was. Assume they will call RPCs directly, replay a captured
request, send it twice, alter the payload, and try every helper, import, seed and maintenance
path in the repository.

── Method: PROBE the deployed database. Do NOT read migration files. ─────────

This matters more than anything else in this phase, and it is the mistake that was made last
time. Three conclusions changed the moment the live database was actually queried:

  - repoint_batch_activities turned out to be granted to anon AND PUBLIC, not just authenticated
  - batch_activity grants no write at all to any client role
  - profiles has three policies and all three are SELECT

Migrations describe intent. Only pg_proc.proacl, pg_policies and role_table_grants describe the
system as it actually is. Query the live database for every claim you make.

Start from:

    select p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef, p.proacl
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public';

    select grantee, table_name, privilege_type
      from information_schema.role_table_grants where table_schema = 'public';

    select tablename, policyname, cmd, qual, with_check
      from pg_policies where schemaname = 'public';

    select tgname, tgrelid::regclass, pg_get_triggerdef(oid)
      from pg_trigger where not tgisinternal;

Then, for each fact below, ATTEMPT THE FORGERY as each client role and record exactly what the
database did. An attempt that was refused is as valuable as one that succeeded — record both,
with the error text.

── The twenty facts ──────────────────────────────────────────────────────────

planned_start · planned_end · baseline_start/end · actual_start · actual_end · activity state ·
operator identity · machine identity · pile identity · bunker movement · lab result ·
lab approval · evidence · deviation · extension · manager decision · GM decision ·
process definition/version · resource occupancy · audit event

docs/04-audit/WRITE-PATH-MATRIX.md already has eight of these filled in from a read of the
migration files, and the per-row template. Every one of them is marked UNVERIFIED.

VERIFY THEM AGAINST THE LIVE DATABASE. DO NOT REDISCOVER THEM FROM SCRATCH.

Four carry a specific suspicion. Check these first:

1. submit_activity lets the caller overwrite a recorded actual.
   0016_recorded_actuals.sql, around line 270:  actual_end = coalesce(p_actual_end, actual_end)
   The caller's parameter wins over the stored value. Confirm whether a second submit with a
   different timestamp really does overwrite the first. This is the highest-severity item on
   the board if it is true.

2. The caller supplies p_actual_start / p_actual_end at all, with only a "not in the future"
   check. Establish whether operator-stated times are a deliberate factory requirement — an
   operator recording work done an hour ago from paper — or an accident. DO NOT DECIDE THIS.
   Report both readings and what each would cost.

3. send_alert is SECURITY DEFINER, granted to authenticated, and calls no assert_role at all.
   Confirm, and confirm what legitimately calls it (src/api/schedule.ts does).

4. Schema drift. Two tables and eleven functions exist in the deployed database that no
   migration creates, including a dev clock: get_effective_now, set_dev_clock_h,
   pause_dev_clock, play_dev_clock, reset_dev_clock_to_live.

   If get_effective_now() is reachable from ANY function that writes ACTUAL, AUTHORIZATION or
   AUDIT, then every timestamp in this product is deniable. Trace it. Write the check as a test
   that greps function bodies, so it fails the day someone wires it in — but WRITE THE TEST
   FILE ONLY, do not change any function to satisfy it.

── Also probe these, which nobody has ever audited ───────────────────────────

  - Activity state transitions. Can an activity complete twice? Restart after completion? Move
    backward? Skip a hard gate? Be started by an unauthorised actor? Be completed without
    required data or evidence? Attempt all of them.
  - Operator identity. Does any RPC accept an actor as a parameter rather than reading
    auth.uid()? If so, every "who did it" in the product is deniable. Related known symptom:
    the demo batch's event log is stamped H456 with "no actor recorded" on every event.
  - Evidence. All 20 evidence tests currently skip on 403 AccessDenied, so "evidence is real"
    is an assertion and not a proof. Can a client delete a storage object directly? Update an
    evidence_media row? Is supersession actually enforced or merely available?
  - Resource occupancy. Three location_occupancy rows exist for vessels nobody allocated.
    Diagnose whether that is stale demo data or a live defect. Do not fix it.
  - Process definition. There is no publish step, so a definition an active batch was generated
    from is still editable under ref_write. Confirm.

── What to write ─────────────────────────────────────────────────────────────

  docs/04-audit/WRITE-PATH-MATRIX.md        all twenty facts, full template per row
  docs/04-audit/SECURITY-ATTACK-MATRIX.md   every forgery attempted: role, exact call, result
  docs/04-audit/FOUNDATION-STATUS.md        GREEN / AMBER / RED / UNRESOLVED per area

Use only those four status words. "The migrations exist", "the tests are green" and "the demo
works" are not GREEN. GREEN means a test asserts it against a real database.

── Then STOP ─────────────────────────────────────────────────────────────────

Report to me:
  - findings ranked by severity, each with its exploit path in ONE sentence
  - the fix you propose for each — proposed, not applied
  - anything you could not probe, and why. Say so explicitly. Silence reads as "checked and
    fine", and that is how a hole survives an audit.
  - anything that surprised you or contradicted the pre-seeded matrix

Do not begin Phase 2. Wait for me.

═══════════════════════════════════════════════════════════════════════════════
STANDING CONSTRAINTS
═══════════════════════════════════════════════════════════════════════════════

Never invent a factory rule. Four items are UNRESOLVED and only the factory can answer them:
the loader as a modelled resource, Turner changeover time, the receiving bunker for each
reload, and the moisture band between 67% and 68%. If you need one of them, record it and stop
— do not default it, do not infer it, do not build a gate on it.

Report bugs outside your boundary; do not fix them.

Do not add a markdown file to the repository root, ever.

At the end of the session write the report in the format at docs/_templates/SESSION-REPORT.md
into T:\obsidian\memory\sessions\, and update T:\obsidian\memory\Now.md. Include what you got
wrong or had to revise — those are the most useful lines in the file.
```

---

## Appendix A — why it is shaped this way

**The stop gate is repeated four times.** Once as a rule, once as a `git diff` acceptance test, once
as "do not fix what you find", once as "do not begin Phase 2". An agent forty minutes into an audit,
looking at a one-line fix, will take it unless stopped repeatedly. That is not distrust — it is how
anyone behaves when a fix is obviously right and obviously small.

**"Probe, do not read" is given with its evidence.** Told as a rule it gets followed loosely. Told as
*three specific conclusions that moved when someone actually checked*, it gets followed properly.

**The four suspicions are handed over, not withheld.** There is a temptation to let the audit find
them fresh as a test of the audit. That wastes budget on rediscovery and risks missing them. The
instruction is **verify, do not rediscover**, and every pre-seeded row is marked `UNVERIFIED` so
nothing is taken on trust.

**Suspicion 2 explicitly refuses to decide.** Whether an operator may state their own start time is a
factory question wearing an engineering costume. An agent will resolve it by default if not told not
to, and the default will be invisible afterwards.

**"Anything you could not probe, and why."** Silence in an audit report reads as coverage. Naming the
gaps is the difference between a report and a reassurance.

## Appendix B — after the report comes back

Read it before answering. Then expect to decide three things:

1. **Whether the caller may state `actual_start` / `actual_end`.** This is yours, not the agent's.
2. **Which RED items are fixed first.** Actual immutability and the envelope column are the two that
   block everything downstream.
3. **Whether the dev clock is reachable.** If it is, that outranks everything else on the board —
   nothing else matters if timestamps can be forged.

Then Phase 2 is a separate prompt: *"I have read the report. Fix them in this order, prove each one
with a test, and stop after each."*

## Appendix C — the other three people, starting today

None of these touch the engine, so they run in parallel with Phase 1 without a merge conflict.

| Person | Task | Brief |
|---|---|---|
| **A** | The H552 sweep of `docs/_reference/` | About twenty files kept because a live test or migration points at them. Each still names the old envelope. Correct the number, or add the archived-header if the file is dead. |
| **B** | `ARCH-002` then `ARCH-011` | Split `src/api/batch.ts` (534 lines spanning three domains) into `planning.ts` / `execution.ts` / `evidence.ts` — imports and moves, no behaviour change. Then restore the demo batches and configure the storage key so the suite is green. |
| **C** | The component library, against fixtures | `docs/02-architecture/DATA-CONTRACTS.md` and `docs/05-ui/VISUAL-LANGUAGE.md`. Typed props, a fixture file per component, no network calls. |

**Person C's one rule, and it is the whole rule:** a component receives `variance_min` — it never
subtracts two timestamps. It receives `state` — it never infers one. It receives `blocked_reason` as
a finished sentence — it never composes one. A component that computes nothing survives a contract
change; one that computes has to be rewritten when the contract moves.