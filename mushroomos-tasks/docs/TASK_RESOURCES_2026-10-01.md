# Task labour, machine usage and measured refuelling

Status (1 October 2026): **migration 0159 is applied to the live Supabase database; the new UI is running on localhost. The public Tasks website and APK have not been updated.** Existing factory records were not rewritten or deleted.

## Why these are separate measurements

- A Supervisor can record the actual number of labourers on a started work/cleaning task. Blank means unknown; `0` is an explicit observation. Rest and Lab tasks are not forced to invent a crew.
- Admin maintains a named machine list with type (machine or heavy machine), active state and whether an odometer exists. A task can record several machines. Machine identities and types are copied into each resource revision so later catalog edits do not rewrite old observations.
- For a mobile machine, the Supervisor can enter start/end odometer readings in **km** and attach a photo to each reading. Both readings yield a task distance. One reading is incomplete, not a zero distance. Stationary machines do not require odometer fields.
- Kilometres are **not fuel litres**. The Fuel log records actual **litres added** at each refuelling, against a registered machine and event time; the all-time machine total excludes voided entries. It does not pretend to allocate those litres to a task or batch. If the factory later obtains per-task litres from a meter, that should be a separate measured field with its method documented.

## Data integrity

`database/0159_task_resources.sql` adds only new tables/views/functions and extends the existing progress-report RPC. It does not update existing batches, tasks, answers, or photo links. The old `tk_finish` remains for older APKs. The new `tk_finish_with_resources` records resources and finishes in one transaction, preserving task photo and role checks. `tk_task_resource_revision` is append-only through the app; corrections create a new revision and an audit event. An expected-revision token prevents one Supervisor from silently replacing another's newer entry. Refuelling errors can be voided by Admin with a reason; rows are retained. The guarded rollback refuses to drop tables after any machine or resource entry exists.

The task page reads the machine list and resource snapshot only for work/cleaning tasks. If the migration is unavailable, it displays a clear warning and keeps the existing task controls. The website/Excel batch progress report can show crew, machine and measured km in remarks after the migration is applied. The fuel log is machine-level, not part of a batch report.

## Validation and rollout status

- `cd app; npm test` — 65 tests passed locally, including six new resource/fuel tests.
- After explicit owner approval, a read-only safety copy was saved as `database/recovery/tasks-before-0159-2026-10-01.json` (SHA-256 `fb3607919bfc8267c102a6a8f5d43cb804f6bcc1379bddd46ff55a53c8c7f57f`). Its inventory was 6 batches, 253 tasks, 59 photo rows, 6 Lab readings and 66 Tasks storage objects, plus SOPs/rows/decisions.
- `node database/task-resources-proof.mjs` passed all migration/role/photo/revision/finish/fuel checks inside a transaction that rolled back.
- `node database/apply-task-resources.mjs` committed only the additive migration. Before/after digests inside that transaction showed every pre-existing Tasks table and Tasks storage-object row unchanged. No `DELETE`, `DROP` or `TRUNCATE` statement was applied.
- `node database/verify-task-resources.mjs` confirmed the same existing row counts after commit, all three new tables empty, expected functions present, and the `tk_machine` PostgREST schema-cache route available (anonymous access correctly returns 401 rather than missing-table error).
- Next release step, if requested: test the localhost screen with Admin/Supervisor accounts, then publish a versioned website/APK update. Never run the old flush script or interpret an empty interface as permission to delete data.

Relevant files: `app/www/task-resources.js`, `app/www/app.js`, `app/www/batch-report.js`, `app/tests/task-resources.test.cjs`, `database/0159_task_resources.sql`, `database/task-resources-proof.mjs`, `database/apply-task-resources.mjs`, `database/verify-task-resources.mjs`, `database/rollback_0159_task_resources.sql`.
