# 13 — END-TO-END ACCEPTANCE CHECKLIST

## Purpose

Turn the entire product requirement into concrete DEMO/TEST scenarios that must pass before the work is called complete.

## What the application must do

Run labelled DEMO/TEST scenarios covering:
new Standard/Punjab batch, new Local batch, running-batch onboarding, Turner P1–P6, Lab→GM gates, resource readiness/cleaning, tickets/extensions, and parallel-delay forecasting.

The demo must use the same business rules as production. The only difference is the effective test clock so H0→H474 can be exercised quickly.

The UI must be tested, not just compiled. Backend tests must be tied to observable runtime behavior.

Definition of Done is not “migration exists” or “build passes.” It is “the required scenario behaves correctly in the actual environment and the evidence is recorded.”

## Acceptance / proof

All relevant acceptance rows are proven with runtime evidence, and Admin UI flows are manually exercised after backend correctness is established.

## Detailed source context

The following sections from the consolidated Geetha source are included below. They are implementation context, not permission to invent a different product.


# 34. DEMO / TEST MODE — SAME BUSINESS RULES, FASTER TIME


This is critical.

A DEMO batch is **not a different business process**.

It exists so the same process can be speed-run for testing.

Therefore DEMO must preserve:

- H0 logic
- planned timing semantics
- dependencies
- convergence
- Lab gates
- GM approval
- resource readiness
- evidence rules
- Turner pile dependencies
- server-side eligibility
- extension semantics
- audit behavior

The only intentional difference is that test time can be accelerated so a long H0→H474 process can
be exercised quickly.

### Correct conceptual model

```text
NORMAL
real clock
same rules

DEMO
accelerated effective clock
same rules
```

Do NOT implement DEMO as:

```text
ignore time rules
ignore rest rules
ignore gates
allow everything immediately
```

If the current code does this, it is a DEMO implementation defect.

The preferred mechanism is an auditable test clock/effective-time mechanism that changes only the
relationship between wall-clock and H-hour for authorized DEMO/TEST batches.

Any skip/seek-ahead operation must be deliberate and auditable if it is required by the test harness.

---


# 35. DEMO BATCH ACCEPTANCE SUITE


The implementation is not complete until labelled DEMO/TEST batches prove the following.

## DEMO-NEW-STANDARD

Purpose:

- new batch creation
- H0
- Standard/Punjab Paddy
- generated plan
- weighments
- parallel preparation
- evidence
- Admin monitoring

Acceptance:

- selected process/version is visible
- H0 is correct
- Soak 3 exists
- tasks are generated from process data
- measurements appear on relevant activities, not prematurely in batch creation
- not-due tasks are not presented as startable

## DEMO-NEW-LOCAL

Purpose:

- Local Paddy variant
- generated-plan difference
- dependency impact

Acceptance:

- Local selection automatically produces two soaks
- Soak 3 is absent from the generated plan
- no downstream dependency refers to Soak 3
- paddy becomes ready earlier according to its own branch
- overall batch only moves earlier if the dependency graph actually allows it

## DEMO-RUNNING-ONBOARD

Purpose:

- existing physical batch
- current position
- before tracking
- 0106 parallel behavior

Acceptance:

- prior work is before_tracking
- no fabricated history
- current position is live
- future work is planned normally
- unrelated old pile work does not reopen incorrectly

## DEMO-TURNER

Purpose:

- P1–P6 independence
- machine assignment
- T1/rest/T2 dependencies
- Lab per pile

Acceptance:

- P1 T1 does not unlock P2 T2
- P1 T1 creates/starts only P1's relevant rest path
- T2 waits required rest
- machine usage is recorded
- six pre-T1 and six post-T1 Lab results are independently represented

## DEMO-LAB-GATE

Purpose:

- Lab record
- submit
- GM approval
- production gate

Acceptance:

```text
Lab records result
→ production gate stays closed

Lab submits
→ still closed until approval

GM rejects
→ stays closed

GM approves
→ mapped activity opens
```

Also prove unrelated gates do not open.

## DEMO-RESOURCE

Purpose:

- bunker/tunnel readiness
- cleaning
- occupancy

Acceptance:

- used bunker becomes unavailable/needs cleaning
- different ready bunker remains usable
- incomplete cleaning cannot make it ready
- complete cleaning + evidence makes it ready
- allocation succeeds only after readiness
- second batch cannot double-book it

## DEMO-TICKET

Purpose:

- late work
- reason
- ticket
- extension
- audit

Acceptance:

- original plan remains visible
- authorized extension is separate
- actual lateness remains actual
- forecast responds where dependency requires

## DEMO-PARALLEL-DELAY

Purpose:

- dependency projection
- critical vs non-critical delay

Acceptance:

Scenario A:

```text
critical predecessor late
→ dependent work forecast moves
```

Scenario B:

```text
non-critical parallel branch late
→ unrelated work unchanged
→ final forecast unchanged unless convergence/critical path is affected
```

Scenario C:

```text
multiple upstream delays
→ only applicable downstream/converging work reflects them
```

---


# 36. ADMIN ACCEPTANCE QUESTIONS


A non-technical Admin should be able to look at a batch and answer:

1. Which process/version is this batch following?
2. What was its H0?
3. What should have happened by now?
4. Where is each active stream?
5. What is actually running?
6. What is ready to start right now?
7. What is not due yet?
8. What is waiting normally?
9. What is genuinely blocked?
10. Why is it blocked?
11. Is Lab waiting on anything?
12. Is GM approval holding anything?
13. Which physical bunker/tunnel is involved?
14. Is that resource ready or occupied?
15. What did the frozen plan say?
16. What actually happened?
17. What is the variance?
18. Is the variance on the controlling path?
19. Did a ticket/extension affect the forecast?
20. When do we now expect to finish?

If the answer requires the Admin to mentally reconstruct 100+ flat task cards, the monitoring model is
not finished.

---


# 45. DEFINITION OF DONE


MushroomOS is not considered complete merely because it builds.

The end-to-end build is done when:

### Process

- the correct published process/version is selected and pinned
- generated plans match the process data
- Local vs Standard/Punjab variants generate correctly
- H0 and H-hour timing are understandable
- parallel streams remain parallel
- convergence is correct
- Turner P1–P6 are independent
- bunker grouping is correct
- tunnel streams are correct

### Eligibility

- planned-time rules are enforced
- dependency rules are enforced
- passive rests are enforced
- Lab gates are enforced
- resource readiness is enforced
- evidence requirements are enforced
- `READY` means actually startable now
- `NOT DUE YET` is distinct
- waiting/blocking reasons are intelligible

### Execution

- actual timestamps are authoritative
- activity measurements can be entered at the correct activity
- readings/checklists are persisted
- evidence is persisted with provenance
- performer accountability is preserved

### Lab / GM

- Lab can record/submit
- Lab cannot approve itself
- GM approval is distinct
- approval opens only mapped gates
- rejection keeps the gate closed
- remarks are visible as required

### Forecast

- baseline remains immutable
- actual remains separate
- variance remains separate
- extension remains separate
- dependency-driven forecast works
- unrelated parallel work does not shift unnecessarily
- convergence impact is explained

### Resources

- exact bunker/tunnel identity is recorded where required
- occupancy is enforced
- cleaning/readiness is enforced
- unrelated resources remain usable

### Admin

Admin can understand:

```text
Where are we?
What should have happened?
What happened?
What is late?
Why?
What is blocked?
What is Lab/GM holding?
What resource is involved?
What is the current forecast?
```

without reconstructing the entire batch manually from 100+ cards.

### Demo

The DEMO batch uses the same business rules as production and only accelerates test time.

The demo suite proves:

- new batch
- Local variant
- Standard/Punjab variant
- onboarding
- Turner
- Lab/GM
- resources
- tickets/extensions
- parallel delay
- forecast
- evidence
- Admin monitoring

### Safety

- no fabricated history
- no hidden bypasses
- no raw destructive client delete
- no silent process-version mutation
- no silent baseline rewrite
- no invented factory rules

---


# 44. REQUIRED REPORTING FORMAT AFTER EACH MAJOR AREA


For every significant area, report:

```text
SOURCE TRUTH
What the source says.

IMPLEMENTATION
What the current repository actually does.

RUNTIME TEST
What was executed in the real test/runtime environment.

RESULT
Pass/fail and observed behavior.

REMAINING GAP
Anything unresolved or not yet tested.
```

Do not use a migration diff as a substitute for runtime evidence.

---

