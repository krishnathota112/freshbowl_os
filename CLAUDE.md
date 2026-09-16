# MushroomOS — Project Authority

The authoritative product/process context for this project is:

docs/MUSHROOMOS_GEETHA_FINAL/

Read ALL files in that folder before making substantive changes.

These documents define the intended MushroomOS product and factory process.

Priority:
1. These final Geetha documents define WHAT MushroomOS must do.
2. The active runtime database/process version defines exact current implementation values.
3. Existing code is implementation to inspect, not authority over product behavior.
4. Older documents, old prompts, old plans, old audits and historical interpretations are NOT product authority.

Do not use old documentation to override the final Geetha context.

Core principles:
- MushroomOS is a factory process execution + monitoring system.
- H0 is the master batch clock.
- H-hour is the primary operational timeline.
- Plan, Actual, Variance, Extension and Forecast are separate.
- The process is a dependency graph with parallel streams and convergence.
- READY means actually startable now.
- NOT DUE YET, WAITING and BLOCKED are different states.
- Demo uses the same business rules as production; demo acceleration must never bypass process rules.
- Local Paddy = 2 soaks.
- Punjab/Standard Paddy = 3 soaks.
- Lab RECORD != Lab GATE.
- Lab submission != GM approval.
- Do not put process rules in React.
- Do not create a second process engine/scheduler.
- Do not rewrite published process versions or activated batch baselines.
- Do not invent factory rules.

Before changing code:
UNDERSTAND → INSPECT → RECONCILE → IMPLEMENT → RUNTIME TEST → ACCEPT.

Do not claim a feature works from a migration/build/typecheck alone.

## Where things are

- App: `mushroomos/` (React + Vite + Capacitor Android; Supabase Postgres).
- Database changes: `mushroomos/supabase/migrations/` (next number 0114). Rollback bodies: `db-rollback/`.
- Raw factory source files (SOP workbook, Lab document, baseline table): `docs/SOURCE/`.
- Superseded documentation and earlier interpretations were moved out of the project to
  `C:\Users\prath\MushroomOS_ARCHIVE\2026-09-16\` on 16 Sep 2026. Do not reintroduce them as authority.

## Runtime facts to re-verify, never assume

- Which process version is current (`process_catalogue.current_definition_id`) — it was PROCESS-2026J on 16 Sep 2026.
- Which batches are live, and which are DEMO (`master_batch.is_demo`).
- The target database is shared and live: it holds real batches, real staff logins, evidence and the audit trail.
  Never reset, reseed or bulk-delete it. Cancel instead of deleting production batches.
