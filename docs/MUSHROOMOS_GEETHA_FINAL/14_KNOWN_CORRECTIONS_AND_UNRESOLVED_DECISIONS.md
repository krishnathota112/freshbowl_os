# 14 — KNOWN CORRECTIONS AND UNRESOLVED DECISIONS

## Purpose

Prevent Claude from repeating previously identified mistakes or inventing unresolved factory rules.

## What the application must do

Known corrections that must be preserved:
Local Paddy removes Soak 3 at plan-generation level.
The active process/version must be verified in runtime.
Turner rest/T2 must remain same-pile.
READY must not be used for work whose planned time has not arrived.
Dependency projection must not use a batch-wide worst-slip cascade.
Exact physical resource identity must control occupancy/readiness.
Lab record/approval semantics must remain distinct.
Ticket photo evidence must be protected from duplicate reuse where required.
Dead/obsolete authorization paths must not bypass the current model.
Activity measurements must be defined by process/activity data.
No fabricated onboarding history.
Demo must accelerate time without waiving business rules.

Unresolved factory/Lab questions must remain visible as NEEDS FACTORY DECISION. Do not invent cleaning checklist content, unresolved thresholds, unsupported photo counts, unresolved timing interpretation or override authority.

## Acceptance / proof

Before claiming completion, each known gap is either:
1) fixed and runtime-proven,
2) explicitly recorded as NEEDS FACTORY DECISION, or
3) documented as blocked by an environmental dependency.

Nothing is silently invented or hidden in UI.

## Detailed source context

The following sections from the consolidated Geetha source are included below. They are implementation context, not permission to invent a different product.


# 41. UNRESOLVED FACTORY/LAB QUESTIONS — DO NOT INVENT


The following should remain visible as decisions rather than silently converted into code:

- final exact cleaning checklist for bunker/tunnel
- final machinery-cleaning policy if not yet signed
- any unresolved tunnel hold duration interpretation (for example 144h vs another factory value)
- exact bunker-line vs lane interpretation where still open
- exact Lab testing methods and thresholds not yet defined
- unresolved moisture decision band (67–68% is deliberately unresolved in the Lab document)
- exact ownership/override authority for Lab gate overrides if not decided
- exact timing reference point for the configurable chicken-manure retest window if unresolved
- exact per-checkpoint photo counts where not supplied
- any unresolved process-specific H-hours in the current active version

When unresolved:

```text
NEEDS FACTORY DECISION
```

Do not create a sensible default and call it factory truth.

---


# 42. IMPORTANT CURRENTLY KNOWN IMPLEMENTATION GAPS TO VERIFY


Before claiming completion, explicitly verify whether these are fixed in the actual current checkout:

1. Local Paddy plan generation truly removes Soak 3.
2. The active process/version used by batch creation is the one actually selected/current in runtime.
3. Turner T1/rest/T2 is same-pile and independently enforced.
4. Planned time and actual start permission are represented consistently.
5. “READY” is not used as a misleading state for tasks whose planned time has not arrived.
6. Dependency projection does not apply a batch-wide worst-slip cascade.
7. Bunker/tunnel occupancy and readiness use exact physical resource identity.
8. Lab recorded vs GM-approved is enforced correctly.
9. Ticket evidence has duplicate-photo/eTag protection.
10. Existing ticket/due-time logic does not maintain duplicate competing formulas.
11. Old obsolete Manager/GM decision RPC paths cannot be used to bypass the current approval model.
12. New batch measurement inputs are rendered from process/activity definitions.
13. No production history is fabricated during onboarding.
14. DEMO mode accelerates time without waiving business rules.
15. Admin monitoring exposes H-hour, wall-clock, plan, actual, forecast, blockers and parallel streams correctly.

---


# 46. FINAL CLAUDE CODE INSTRUCTION


You are working on an existing production-oriented application.

The goal is **not** to create a clever new system.

The goal is to make the existing MushroomOS system faithfully represent and enforce the real factory
process described in this document.

When the code behaves differently from the specification, do not immediately patch the screen.
Trace the source of truth.

When a source document is ambiguous, do not invent the answer.

When the runtime differs from a document, show the difference explicitly and establish which source is
authoritative for that exact question.

When a change is made, prove it.

When a demo is run, the demo must exercise the same business rules as the real process.

When a task says READY, a human must be able to start it now.

When a task says WAITING or BLOCKED, the reason must be explainable.

When a batch is Local Paddy, Soak 3 must truly not exist in the generated plan.

When a Lab result is recorded but not approved, a mapped hard gate must remain closed.

When a pile is delayed, only the true downstream dependencies should be affected.

When an extension is approved, the baseline must remain exactly what it was.

When an SOP changes, publish a new version; never rewrite an active batch's baseline.

When the implementation is complete, demonstrate it with real runtime evidence rather than saying
“implemented.”

**Build MushroomOS as the factory process monitoring/execution-support system it is supposed to be —
end to end, with the same rules in DEMO and production, with H0 as the operational clock, with parallel
streams preserved, with dependencies/gates enforced, with evidence and accountability intact, and with
Admin able to understand the entire process without being buried in technical task output.**

