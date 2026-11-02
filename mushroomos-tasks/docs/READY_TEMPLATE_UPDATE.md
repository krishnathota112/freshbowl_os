# Ready template and calendar-first editing — 27 Sep 2026

This supersedes earlier instructions that the owner's table was only a format reference and every SOP should
start empty. The owner now explicitly asked for that schedule as an editable ready template, shown when
creating a batch, with simple calendar dates and serial order.

## Workflow

- New batch defaults to the latest published version of Compost standard, already filled in.
- Set Batch start — bagasse wetting. Dates move together relative to that start, including preparation before it.
- Edit the suggested dates, process names, streams, lab/control text and serial order. Add, duplicate or remove
  rows; add a Cleaning row directly. Task settings reveals type, Lab checkpoint, photos and requested values.
- Create batch writes only this batch's edited task plan, in one database transaction. Its source SOP stays
  unchanged. The task snapshot plus the tk_batch_plan audit entry records the customized plan.
- Save a reusable copy creates a draft SOP. Publish that draft to use it for later batches.
- SOP creation also defaults to copying a published template; Blank table remains an explicit choice.
- Existing batch/task screens use dates and times; all streams together are displayed in global serial order.
  Existing individual task editing remains available to Admin for tasks that have not started.

## Source interpretation

The template has 43 rows. Approval and production are separate rows at the three gates explicitly stated in
the owner's table, so Lab approval does not replace recording the physical work. LAB-04 maps to LAB-BNK-PRE;
LAB-13 maps to LAB-CM-USE; tunnel loading maps to LAB-TUN-LOAD, from the existing factory Lab register.

Main, Paddy and CM mix are separate streams. Turner T0/T1/T2/T3 are separate streams so interleaved work can be
recorded; operators must follow the per-pile rest/readiness instructions. The app has no cross-stream
readiness enforcement. These stream choices are editable. No cleaning schedule was provided, so no cleaning
times were invented; the Add cleaning task button creates a row in that stream.

Calendar dates take priority over conflicting H-hour references. Raw-material time and T1 start are marked
approximate. T2/T3 suggestions are blank because the source says “onward” and per-pile timing is needed.
The two hopper passes versus the next rest, the stated ten-hour rest, and the 144-hour tunnel standard versus
138 hours on the example calendar are flagged in row controls. No automatic correction to production rules.

## Files and database

- app/www/schedule-grid.js: shared SOP and new-batch calendar table.
- app/www/app.js: new-batch flow, reusable-copy creation, date labels and serial batch view.
- database/0146_tasks_ready_template.sql: ready SOP seed and admin-only tk_batch_create_plan RPC.
- database/0147_tasks_template_checkpoints.sql: resolve source checkpoint shorthand to live Lab codes.
- Each migration has a rollback file. 0146 rollback retains a template already referenced by a batch.
- Both migrations are applied live. No existing batch tasks or user SOPs were rewritten.

## Verification

`node database/ready-template.mjs --live --checkpoints` checks ready data, scheduling, row order, source
immutability, parallel streams, gate blocking, empty plans, duplicate names, atomic failure and authorization.
`node database/proof/tasks-app-proof.mjs --live` checks the original workflow including photos, Lab submission,
GM return/retest/approval, catch-up and isolation from the main app. Both always roll back their test data.

Before applying 0146, its migration and rollback passed 16 checks in a rolled-back transaction. Before 0147,
the checkpoint mappings and rollback were also proven. Original workflow proof: 9/9.
Browser verification used the signed-in local website with unsaved edits only: template loading, calendar
shift back to 31 Aug 09:00, prep before start, blank T2, individual date edits, duplication, and adding Cleaning.
No real test batch was kept. Android v1.2 (`apk/MushroomOS-Tasks-2026-09-27-v1.2.apk`, rebuilt 27 Sep 19:34 so it also
contains the Enter-to-move grid key) uses the same web assets; physical-device installation is separate.
Migrations 0145–0147 are also recorded in `workingcode/mushroomos/supabase/migrations/` (next number: 0148).
