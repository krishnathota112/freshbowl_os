# Claude Code

> **SUPERSEDED AS AN ENTRYPOINT — 13 September 2026.** Start at [AGENT-BRIEF.md](AGENT-BRIEF.md) for all engineering work. This file is retained as a historical foundation report. Its separate-mission, backend-frozen and role-specific reading directives below are not current task instructions. Consult dated technical evidence where relevant; use the new brief and current user scope to decide work.

**Addressed to Claude Code only.** Every other coding agent reads `docs/AGENT-BRIEF.md`; do not
give them this one, and do not read theirs.

This is the whole mission. There is no separate MISSION.md any more — it was a rival document
describing an earlier phase, and the router pointed at it by mistake. It is archived.

> **Status, 11 September 2026 — this foundation mission is complete and the backend is frozen
> (`DEC-025`).** Against the twelve stop conditions at the end: **1–8 and 11 are met**, with proof in
> `docs/04-audit/FOUNDATION-STATUS.md`. **9 is partial** — the machine and vessel exclusion is proven
> at model and RPC level, but no `PROCESS-2026C` activity carries an assigned machine, so a batch
> *waiting behind* a machine has never been seen on the real process. **10 was not verified.**
> **12 was not produced** — the build continued in this repository, and the contract a builder reads
> is `docs/02-architecture/DATA-CONTRACTS.md`.
>
> **The current work is the three UI workstations:** `docs/05-ui/WORKSTATIONS.md`. The brief below
> is the record of what the foundation had to achieve. It is no longer the instruction.

---

```text
YOU ARE CLAUDE CODE, working on MushroomOS.

This document is addressed to you. If you are not Claude Code, stop and ask for the document
addressed to you — acting on someone else's instructions is how two agents build the same thing
twice, differently.

Phase 1 is finished, its report is at docs/04-audit/, and the process owner has read it.
This is the foundation mission.

Read first, in this order, and nothing else until you have:
    CLAUDE.md
    docs/00-START-HERE.md
    docs/SCHEMA.md          ← what is ACTUALLY deployed. Generated, never hand-written.
    docs/04-audit/FOUNDATION-STATUS.md      your own Phase 1 roll-up
    docs/04-audit/IDEMPOTENCE.md
    docs/01-process/STANDARD.md
    docs/01-process/LAB-2026A-Laboratory-Process.pdf

Do not read docs/_archive/. It describes a 552-hour process the factory no longer runs.

═══════════════════════════════════════════════════════════════════════════════
THE FRAME — read this before the task list, because it changes what "done" means
═══════════════════════════════════════════════════════════════════════════════

We are overcomplicating this. The job in this phase is NOT to build the product. It is to leave a
small, stable, trustworthy foundation that the implementation workstream builds the application
on top of.

~20–30 users. One factory. Supabase and Postgres stay. Storage stays. RLS stays. The existing
process-as-data model, the existing RPCs, the existing auth model all stay. No microservices, no
second workflow engine, no second process definition, no speculative architecture.

    Inspect first. Reuse second. Fix only what is actually missing or broken.

    AND INSPECT MEANS docs/SCHEMA.md, NOT A DOCUMENT'S DESCRIPTION OF THE SCHEMA.

    A task brief on this project specified a new table whose name was already taken by a
    different table with live foreign keys. Three documents and two sessions passed before
    anyone found out. If docs/SCHEMA.md does not exist yet, or is older than the last
    migration, your FIRST action is:

        node scripts/schema-snapshot.mjs      → docs/SCHEMA.md

    Commit it. Regenerate it after every migration you write. It is the cheapest thing in this
    repository and it prevents the most expensive class of mistake in it.

    DO NOT SOLVE PROBLEMS WE DO NOT CURRENTLY HAVE.
    The system is for ~20–30 users in one factory. Prioritise process correctness, evidence,
    timestamps, gates, resource contention, approvals, extensions and management visibility.
    Prefer the smallest implementation that makes those truths reliable.

That paragraph outranks any instinct you have about what a system like this "should" have. If you
find yourself adding something because it is good practice rather than because a named problem in
this document needs it, stop and leave it out.

The whole product, held in one line:

    SOP → PLAN → OPERATOR DOES WORK → SERVER RECORDS WHAT HAPPENED → EVIDENCE
        → LAB → APPROVAL → GATE → VARIANCE → EXTENSION → FORECAST → MANAGEMENT

Make that work cleanly. Nothing more.

═══════════════════════════════════════════════════════════════════════════════
THE PRODUCT MODEL — two rules that decide most of the design
═══════════════════════════════════════════════════════════════════════════════

1. The admin chooses H0. The system generates everything else.

   Admin sets H0 = 31 Aug 2026 09:00. The system takes the approved process definition and
   generates the whole planned timeline: planned timestamps, dependencies, lab checkpoints,
   Turner stages, bunker stages, tunnel stages, against the 470-hour standard.

   No operator ever enters or edits a planned timestamp.

   OPERATOR UI IS INTENTIONALLY MINIMAL.

   For a normal executable activity, the operator may only:

       open the assigned/eligible task
       start it
       capture the required start/before photo
       perform the physical work
       finish it
       capture the required finish/after photo

   Do not expose editable:  actual_start · actual_end · duration · planned timestamps ·
   variance · forecast · process rules.

   The operator is executing the process, not interpreting or scheduling it. Every field added
   to that screen is a field somebody has to be trained on, at night, on a phone, with one hand
   free — and a field that can be got wrong is a fact that can no longer be trusted.

2. The operator never supplies a timestamp. The server does.

       OPEN TASK → START → server records actual_start
                 → do the physical work
                 → upload the required BEFORE photo
                 → FINISH → upload the required AFTER photo
                 → server records actual_end

   The normal operator UI exposes no editable actual_start / actual_end field anywhere.
   Do not design an "enter the time this happened earlier" workflow. If back-entry from paper is
   ever needed it is a separate, controlled, superseding capability — record it as a future
   requirement and do not complicate normal execution with it now.

── The one case rule 2 does not cover, handled as simply as possible ────────

The apps are offline-first. A technician taps START in a bunker with no signal at 14:00 and the
queue flushes at 16:00. "Server time on receipt" alone would record 16:00 — a two-hour error, in
the direction that makes a late activity look later.

Two fields, two clearly different meanings. Nothing more than this:

    recorded_at_server    the authoritative system event time. Always server-set.
    captured_at_device    evidence that the device says it happened at this time.
    capture_mode          ONLINE | OFFLINE

    ONLINE   → server timestamp, captured_at_device stored alongside it
    OFFLINE  → device timestamp stored, event queued, server timestamp set on receipt,
               the record marked OFFLINE CAPTURE

Variance, gates and forecast read the server value. Only ever the server value.

Management then sees, on the record itself:

    Device captured:  14:02
    Server received:  16:01
    Status:           OFFLINE CAPTURE

Neither timestamp has been falsified and neither has been reconciled away. That is enough.

Do NOT build a reconciliation mechanism, a drift threshold, an automatic deviation on divergence,
or any rule that decides which of the two is "really" right. Store both, label the mode, show it.
A human looking at that record has everything they need.

═══════════════════════════════════════════════════════════════════════════════
TASK 1 — CLOSE THE BYPASSES.  DO THIS FIRST, TODAY, BEFORE ANY APK IS BUILT.
═══════════════════════════════════════════════════════════════════════════════

Your own Phase 1 report proved that the anon key which ships inside the APK can rewrite a batch's
activation authorship, swap an active batch's process definition, delete the batch, and empty the
audit trail. Tomorrow that key is on phones in a factory. This task is not planning; it is a
tourniquet, and it comes before everything else in this document.

── 1a · The two revokes. Zero read-path risk. Reversible in one statement. ───

    revoke truncate on all tables in schema public from anon, authenticated;

    do $$ declare v record; begin
      for v in select schemaname, viewname from pg_views where schemaname = 'public' loop
        execute format('revoke insert, update, delete on %I.%I from anon, authenticated',
                       v.schemaname, v.viewname);
      end loop;
    end $$;

Then re-run your own proof. The call that returned 200 must now return 403:

    PATCH /rest/v1/v_live_batch?id=eq.<id>   with the real anon key

Record the new response in SECURITY-ATTACK-MATRIX.md next to the original. A fix without its
proof beside it is a claim.

── 1b · security_invoker — the durable fix, and the reason it is SECOND ──────

The revokes are grants, and a future migration saying `grant all on all tables in schema public`
re-opens the hole silently. That blanket grant is almost certainly how this happened. So
security_invoker is still the real fix.

BUT: your Phase 1 report recommends it without establishing what it does to READS, and that is
the one thing that can take both apps dark tomorrow.

    security_invoker = true routes reads through the caller too — base-table grants AND
    base-table RLS. Today v_live_batch reads run as postgres, which is why the app works.

Before you set the flag on anything, run and record:

    select table_name, grantee, privilege_type from information_schema.role_table_grants
     where table_schema='public' and grantee in ('anon','authenticated')
       and privilege_type='SELECT';

    select relname, relrowsecurity, relforcerowsecurity from pg_class
     where relname in ('master_batch','deviation','lab_checkpoint_conflict');

    select tablename, policyname, cmd, roles, qual from pg_policies where schemaname='public';

The dangerous outcome is not an error. It is SELECT granted, RLS enabled, no permissive policy
for those roles — reads return zero rows, silently, and the app looks empty rather than broken.

Set security_invoker only where the queries above prove the read path survives. Where they do not,
say so, leave the flag off, and leave the revoke as the protection. Then add a test that fails if
any auto-updatable view in public lacks security_invoker AND still grants write to a client role.

── 1c · v_lab_checkpoint_map — check the attribution before you skip it ──────

Phase 1 deferred this view as "the parallel team's surface". Verify that. The tables specified for
the parallel workstream are lab_checkpoint, lab_parameter, lab_threshold,
lab_evidence_requirement, lab_gate_binding,
with the view v_lab_checkpoint_spec. If lab_checkpoint_conflict predates that work, the view is
inside your boundary and is currently a RED that nobody owns — which is the worst state a finding
can be in. Establish which, and say so plainly.

═══════════════════════════════════════════════════════════════════════════════
TASK 2 — MAKE THE IMPORTANT FACTS UNFALSIFIABLE
═══════════════════════════════════════════════════════════════════════════════

The UI must never be the only protection. Users will try to bypass it, and the whole product is
worthless the day a late activity can be made to look on time.

    Protect the facts that affect ACCOUNTABILITY. Do not build an enterprise security framework.

The protected facts are exactly these nine, and the list is closed:

    plan · actual timestamps · lab result · evidence · approval · deviation · extension ·
    movement · machine usage

If a hardening idea does not defend one of those nine, it is out of scope for this phase. Write it
down and move on.

Work them server-side, in this order:

  1  actual execution timestamps
  2  the activated batch baseline
  3  lab results and lab approvals
  4  evidence
  5  approvals, deviations, extensions
  6  published process versions
  7  pile identity, machine assignment, bunker movement

── 2a · Actual immutability.  The shape is now DECIDED. ─────────────────────

The open question from Phase 1 — whether an operator may state their own actual times — is
answered: they may not. The server sets both. So:

  · BEFORE UPDATE trigger refusing any change to a non-null actual_start or actual_end.
  · Remove the caller-supplied p_actual_start / p_actual_end path from the normal flow.
    coalesce(p_actual_end, actual_end) is the exact line; the parameter must stop winning.
  · A correction is a superseding record with a reason. Model it on evidence_media.superseded_by_id
    — the pattern already exists in this codebase; do not invent a second one.
  · Probe the hold / return / release flows first. Phase 1 found the overwrite reachable through
    return_activity → RETURNED → submit, and a trigger that only covers the happy path is a
    trigger that gives false confidence.

Prove it with tests: a second submit with a different time is refused; a correction creates a new
row and leaves the first intact and visible.

── 2b · Process-definition publish ──────────────────────────────────────────

A definition an active batch was generated from is still editable. Add a published/frozen flag,
snapshot the definition at activation, and narrow ref_write to unpublished definitions.

── 2c · send_alert ──────────────────────────────────────────────────────────

SECURITY DEFINER, granted to authenticated, no role guard in the body. Add assert_role. Confirm
src/api/schedule.ts still works.

── 2d · Evidence, end to end ────────────────────────────────────────────────

Twenty tests skip on a storage key, so "evidence is real" is asserted and not proven. Configure
the key, run them, and probe whether a client can delete a storage object directly. If it can,
that is a RED and it outranks 2b and 2c.

═══════════════════════════════════════════════════════════════════════════════
TASK 3 — IDEMPOTENCY, THE SIMPLE PATTERN, ONLY WHERE IT IS NEEDED
═══════════════════════════════════════════════════════════════════════════════

One user action generates one key on the device. Every retry sends the same key. A replay produces
one logical submission.

  · New lab submission APIs: submit_lab_result accepts idempotency_key (uuid), stored, unique.
    This is not optional and not deferrable — the table does not exist yet, so it is free now and
    a migration against live field data later.
  · Apply the same pattern to the field-facing RPCs your own IDEMPOTENCE.md marked DUPLICATES:
    raise_deviation, record_occupancy, open_lab_sample, open_machine_stint.
  · Do not scatter ad-hoc unique constraints. One shape, applied uniformly.
  · Coordinate the column name and semantics with the parallel workstream before you write it, so both
    sides of the wire agree. Same contract, two callers.

═══════════════════════════════════════════════════════════════════════════════
TASK 4 — PROVE THE REAL PATH.  THIS IS THE FOUNDATION DEMO.
═══════════════════════════════════════════════════════════════════════════════

This is the main deliverable of the phase. Everything in Task 2 except the immutability trigger is
secondary to it. Do not turn this project into an audit platform before this one path works
end to end with real data.

Not fake React state. Not a mock. Against the deployed database and real Storage:

    create batch → generate plan from H0 → start an activity → server timestamp
      → upload an image → store evidence metadata → retrieve it back
      → record a lab reading → approve it → observe the gate open
      → read the whole thing through the management contract

One batch, end to end, with the artefacts to show for it. If any link in that chain does not work,
that is the most important thing you will find this phase and it outranks the rest of Task 2.

Lab gating is server-side and non-negotiable: LAB NOT APPROVED → downstream activity LOCKED.
LAB APPROVED → eligible. The lock lives in the database, never in a screen.

═══════════════════════════════════════════════════════════════════════════════
TASK 5 — RESOURCE CONTENTION.  MAKE THE WAIT VISIBLE.
═══════════════════════════════════════════════════════════════════════════════

This is the real operational problem, and it is the one genuinely interesting piece of complexity
in a factory this size. It is not an integrity problem — it is a scheduling one.

    Batch A · T0 needs M1 at 15:00
    Batch B · T0 needs M1 at 15:00

There is one M1. The system must show:

    Batch A → M1 → RUNNING
    Batch B → M1 → WAITING  (blocked_reason: "M1 in use by MB-…, since 15:00")

and the resulting delay then appears naturally in Batch B's actual execution, as a variance with a
cause attached. Nobody has to explain the lateness afterwards, because the reason was recorded at
the moment it happened.

── The scope, and it is deliberately narrow ─────────────────────────────────

    MODEL:   the turners M1 and M2 · the bunkers · the tunnels
    SHOW:    which batch holds a resource, from when, and who is waiting behind it
    RECORD:  the wait as the cause of the variance

    DO NOT:  build a scheduler, a solver, an optimiser, an auto-assigner, or any rule that
             decides which batch gets M1. A human decides. The system records the decision and
             the wait it caused.

Inspect before you build. location_occupancy, batch_vessel_allocation and machine_usage already
exist. This is very likely a view and a blocked_reason over primitives that are already there, not
a new subsystem. If it turns out to need new tables, say why before writing them.

The loader stays UNRESOLVED and is NOT modelled here. It is one of the four factory questions, and
modelling it would mean inventing its capacity — which is exactly the invented factory rule the
standing constraints forbid.

═══════════════════════════════════════════════════════════════════════════════
TASK 6 — THE CONTRACTS
═══════════════════════════════════════════════════════════════════════════════

Eight, in docs/02-architecture/DATA-CONTRACTS.md:

    Operator / My Work · Lab · Supervisor · Manager & GM · Admin · Batch Story ·
    Factory Now (management) · Evidence & Proof

Each one states: payload · states · permissions · actions · server-returned errors ·
blocked_reason as a finished sentence · required evidence · required lab information.

The UI computes NOTHING. Not process sequence, not duration, not eligibility, not gate logic, not
lateness, not variance, not forecast, not evidence requirements, not approval authority, not
official timestamps. The backend returns all of it, finished.

    A component receives variance_min. It never subtracts two timestamps.
    A component receives blocked_reason as a sentence. It never composes one from a code.

Management must be able to answer, through these contracts: what should have happened · what did
happen · why was it late · who acted · what evidence exists · who approved the exception · what is
the forecast now. Drill-down to activity, batch, pile, machine, lab reading, evidence, approval,
deviation, extension, reason.

Extensions never rewrite the baseline. Plan 15:00→22:00, actual 17:00→00:00, variance +2h,
extension a separate authorised record. The forecast moves. History does not.

Do not hardcode the Turner simulation anywhere. Six piles progress independently under M1 and M2;
the plan determines the schedule and the UI renders the backend's answer. Machine assignment is
execution data, not plan data.

═══════════════════════════════════════════════════════════════════════════════
TASK 7 — FIXTURES, SO SCREENS CAN BE BUILT WITHOUT A DATABASE
═══════════════════════════════════════════════════════════════════════════════

Realistic fixtures matching the contracts exactly, in a fixtures directory beside them:

    on-time batch · active · waiting · blocked-by-lab · delayed · extended · completed ·
    six Turner piles · M1/M2 usage · three bunker streams (P1+P2→B1, P3+P4→B2, P5+P6→B3) ·
    lab result pending · lab approved · evidence present · evidence missing · deviation ·
    extension request · two batches contending for M1 (one RUNNING, one WAITING) ·
    an offline-captured activity showing both timestamps

Generate them from the contract types so they cannot drift. A fixture that disagrees with its
contract is worse than no fixture.

═══════════════════════════════════════════════════════════════════════════════
WHAT YOU WRITE, AND WHERE — do not create a docs/handover/ folder
═══════════════════════════════════════════════════════════════════════════════

The repository was restructured in Phase 0 precisely to stop the same fact living in two places.
A second FOUNDATION_STATUS in a second folder is how these documents come to disagree without
anyone noticing. Update in place:

    docs/04-audit/FOUNDATION-STATUS.md      what is working · fixed · proven · placeholder
    docs/04-audit/SECURITY-ATTACK-MATRIX.md every fix, with its re-run proof beside the original
    docs/04-audit/IDEMPOTENCE.md            updated verdicts
    docs/02-architecture/DATA-CONTRACTS.md  the eight contracts
    docs/02-architecture/DECISIONS.md       what was decided this phase, and why
    docs/01-process/OPEN-QUESTIONS.md       what is still a stakeholder decision
    docs/03-mission/HANDOVER-TO-KIRO.md     NEW — the only new file. Self-contained.

HANDOVER-TO-KIRO.md is the output that matters most, because after it the implementation agent
should not need this conversation or your context to keep building. Structure it exactly:

    FOUNDATION            what exists and how it fits together, in one page
        ↓
    WHAT WORKS            demonstrated, with the artefact or the test that shows it
        ↓
    WHAT IS PROVEN        GREEN only — a test asserts it against a real database
        ↓
    WHAT IS PLACEHOLDER   AMBER and RED, named, with what is missing from each
        ↓
    WHAT YOU BUILD        written to the reader — concrete, in order
        ↓
    WHAT YOU MUST NOT CHANGE     frozen contracts, protected tables, the nine facts

Plus known limitations and open stakeholder decisions. Someone picking it up cold should need
nothing else.

── Who reads what you write ─────────────────────────────────────────────────

HANDOVER-TO-KIRO.md is read by the implementation agent and by nobody else. Write it entirely in
the second person, addressed to that agent. It must contain no discussion of your own tasks, your
audit method, why you decided something, or what phase anything belongs to. That is your history
and it is not their job.

    Include:  what is frozen · what exists · what they may change · what they may not ·
              their first task · the contract for it · its acceptance criteria ·
              how to report completion

    Exclude:  the Phase 1 report · red-team methodology · your reasoning · your task list ·
              anything phrased as "do not do X, that is a different agent's job"

Someone reading it should be able to start work from that file and the contracts alone, without
this document, without the audit, and without asking anybody a question.

═══════════════════════════════════════════════════════════════════════════════
STOP HERE
═══════════════════════════════════════════════════════════════════════════════

Stop when all twelve are true:

   1  the process source is unambiguous
   2  the database foundation is usable
   3  execution timestamps work, server-set, and cannot be overwritten
   4  photo upload and retrieval work against real Storage
   5  lab data storage works
   6  the approval and gate path works, server-enforced
   7  the extension data path works
   8  the management read contracts exist
   9  resource contention is visible — one batch RUNNING on M1, another WAITING with a reason
  10  fixtures exist and match the contracts
  11  the critical bypasses are closed, or explicitly documented as open with the reason
  12  HANDOVER-TO-KIRO.md is self-contained and addressed to its reader

Do not build the application UI. Your output is the foundation, the contracts and the fixtures —
the screens are built against them afterwards, by someone reading only HANDOVER-TO-KIRO.md.

═══════════════════════════════════════════════════════════════════════════════
STANDING CONSTRAINTS
═══════════════════════════════════════════════════════════════════════════════

Never invent a factory rule. Still UNRESOLVED and yours to report, not decide: the loader as a
modelled resource, Turner changeover time, and the 67–68 % moisture band. Build no gate on any.

The Turner lab rule is fixed: BEFORE T1 and AFTER T1 only. No test after T0, T2 or T3. Do not
reintroduce them. Both readings are per pile — six each on a six-pile batch.

A parallel workstream owns the lab_checkpoint / lab_parameter / lab_threshold /
lab_evidence_requirement / lab_gate_binding tables, the two capture screens, and everything under
docs/03-mission/kiro/. Do not modify any of it. Where you find a defect there, write it down and
leave it. The one exception is Task 3: the idempotency key is a shared contract on both sides of
the wire, so it is agreed with that workstream, never imposed on it.

Do not add a markdown file to the repository root, ever.
```
