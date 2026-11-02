# Edit existing batch rows — v1.6

28 September 2026. Admin opens an active batch and selects **Edit batch · rows**.
The same paged calendar editor offers Process, Lab and All tasks with one master
sequence. Edit name/note, task titles, dates, streams, descriptions, controls and
advanced settings; add, duplicate, insert, remove and reorder upcoming rows.
Save applies one atomic plan update. Cancel/navigation warns about unsaved edits.

This edits only the batch copy. Its source SOP and batch-start timestamp remain
unchanged. Each suggested date is editable separately. Pile identities on retained
tasks stay fixed; bulk pile resizing is intentionally unavailable on existing
batches. Existing pile rows can be edited or duplicated subject to evidence rules.

## Data protections

- Admin-only `tk_batch_plan_get` and `tk_batch_plan_save` RPCs; closed batches are read-only.
- Any actual task state, timestamps, actor, note, answer, photo, reading or decision
  makes that row protected against plan-field changes and removal. Numbers may
  renumber as upcoming rows change; task UUIDs and all execution/evidence data remain.
- No new/moved process prerequisite may be placed ahead of recorded process work
  in its stream/pile. Plain Lab records remain non-blocking and may be recorded any time.
- Save locks the batch and its tasks before comparing a snapshot token. A changed
  plan, newly started task or newly recorded evidence refuses the stale save. Edits
  remain on screen; reopen the editor to reconcile with current data.
- Existing task IDs are updated in place; only explicit new rows receive new IDs.
  No wholesale delete/recreate, status reset, photo deletion or SOP modification.
- All changes and deletions are validated before writes. The batch edit audit entry
  includes before/after snapshots. Only unrecorded rows may be removed, with UI confirmation.
- Duplicate clears identity/history. A save in progress disables the form and blocks
  route departure. Failed/uncertain writes are never automatically retried.
- Unchanged suggested dates preserve original timestamp seconds; edited dates save
  the exact selected local minute even if the batch-start timestamp includes seconds.

## Installation and verification

Migration `database/0152_tasks_edit_batch.sql` adds functions only and changes no
existing factory rows. Rollback is `database/rollback_0152_tasks_edit_batch.sql`.
`node database/edit-batch.mjs` tests migration, fixtures and rollback in one rolled-back
transaction. `--apply` installs only the functions; `--live` verifies the installed
functions and rolls back all fixtures. Both proof modes passed. Next migration: 0153.

27 Node tests cover the editor, ID preservation, Process/Lab edits, dates, stale-save
errors, removal confirmation, duplicate-submit protection, navigation races, role
visibility and existing performance/update/photo behavior. Browser verification on
an existing 98-row batch loaded 58 Process and 40 Lab rows, with three recorded Lab
rows protected. No real batch edits were submitted during verification.

Web deployment: https://0c2204a4.mushroomos-tasks.pages.dev/.
Production URL: https://mushroomos-tasks.pages.dev/.

Android version 1.6 / versionCode 7, package `in.freshbowl.tasks`. Signature matches
v1.5. Normal APK logout stays removed; website Sign out remains. The separate
Weighbridge app and existing Admin weighment features are unchanged. Real-phone
installation and touch testing remain to be done on a factory device.

APK: `release-site/MushroomOS-Tasks-v1.6.apk` (6,280,592 bytes).
SHA-256: `e740e29de162ab220f00e52bd9b43e97251117058bd6a63d8b9f3c3cc51b5100`.

Published APK deployment: https://7ba2ba9f.freshbowl-tasks-downloads.pages.dev/.
The stable download URL reports v1.6/code 7, with correct CORS/no-store update
headers. Downloaded bytes match the local SHA-256 and size. All nine checked live
website assets match source; six key APK assets also match source. Repeat the
read-only public verification with `node app/scripts/verify-release.mjs`.
