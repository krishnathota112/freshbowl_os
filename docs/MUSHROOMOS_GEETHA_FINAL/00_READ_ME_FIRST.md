# MUSHROOMOS GEETHA — READ THIS FIRST

## What this folder is

These Markdown files are the complete end-to-end product/process context for MushroomOS. Read **all files before changing code**.

They describe what we want the application to do from batch creation through H0, parallel production, Lab/GM controls, Turner, bunkers, tunnel, forecast, Admin monitoring, mobile execution, demo testing, auditability and final acceptance.

## Order of understanding

1. Product purpose and non-negotiable rules
2. Human roles
3. Complete H0-to-final process
4. Parallel streams and dependencies
5. Material/process variants
6. Lab → GM → gates
7. Physical resources and readiness
8. Time, plan, actual, variance, extensions and forecast
9. Batch creation and onboarding
10. Admin workstation requirements
11. Tickets/exceptions/extensions
12. Evidence/readings/accountability
13. End-to-end acceptance tests
14. Known corrections and unresolved decisions

## Absolute execution rule

Do not code from one file in isolation.

The repository/database are the implementation to inspect. These files are the intended product/process behavior. Reconcile them before implementation.

The required loop is:

UNDERSTAND → INSPECT → RECONCILE → IMPLEMENT → RUNTIME TEST → ACCEPT

Never:

GUESS → PATCH → BUILD → CLAIM DONE

## Non-negotiables

- Existing MushroomOS architecture stays.
- No second process engine or scheduler.
- Process rules belong in versioned process/domain data, not React.
- Do not flatten parallel work into one fake linear schedule.
- Do not rewrite an activated batch baseline.
- Do not invent factory/Lab rules.
- Demo mode has the same business rules as production; only the test clock is faster.
- READY means startable now, not merely “has no predecessor”.
- H-hour is the primary operational time language; technical stage/phase labels are secondary metadata.
- Local Paddy has 2 soaks; Standard/Punjab has 3.
- Lab RECORD ≠ Lab GATE. Lab submission ≠ GM approval.
- Runtime evidence is required for important behavior.

Read everything in this folder before editing the repository.
