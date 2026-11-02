# Lab tasks and Turner piles — 27 Sep 2026

The owner corrected the calendar template: ordinary Lab checks must be actual Lab tasks, not only text in the
Lab/control column. He requested Process/Lab tabs retaining one master numbering sequence, Turner pile records
with separate before/after photos, and an Admin Description column. He explicitly chose **Turner stages only**
for pile tracking. This supersedes earlier notes that per-pile support should remain unbuilt.

The default is now Compost standard v2 (new published version, no existing version overwritten): 104 rows,
64 process/rest rows and 40 Lab/gate rows. The Lab tab uses the same row numbers as Process. All tasks shows
the combined order. Filtering never creates another numbering sequence. Views exist in both the SOP/new-batch
editor and running batches. Description is independent of Lab/control and operational notes.

Each of six default Turner piles has T0 → Lab before T1 → T1 → Lab after T1 → rest → T2 → T3.
The four process passes each have their own task identity, before/after photos, machine entry and actual times.
Lab readings are bound to the selected pile's Lab task. Ordinary Lab records remain non-blocking; GM gates
retain the existing submit/approve behavior. Pile work follows serial order within its own pile independently.
Suggested per-pile dates are intentionally blank, because the source gave overall windows rather than exact
per-pile times. The 8-hour rest is an instruction recorded as a rest row, not a newly enforced timer.

Set pile count adds/removes Turner rows before batch creation and preserves retained piles' edits.
The existing downstream bunker descriptions refer to P1+P2, P3+P4, P5+P6; review those descriptions if changing
the pile count. This update does not introduce per-pile tracking outside Turner or cross-stream dependencies.

Database: 0148 adds description/pile/turner_pass, additive v3 RPCs, and tk_v_task_v3; 0149 installs the full SOP.
Both are applied. RPCs validate Turner photo settings and keep pile identity fixed when editing existing tasks.
Rollback refuses to discard description/pile data already in use. All existing batch evidence stays intact.
The app checks feature availability and refuses to silently save unsupported new fields if used with an old DB.

Verification:
- `node --test app/tests/turner-plan.test.cjs`: 3 passing local tests for pile expansion, retained edits and Lab counts.
- `node database/lab-piles.mjs`: migration/rollback proof passed before installation; all test data rolled back.
- `node database/lab-piles.mjs --live`: 14 checks passed after installation, including photo isolation, Lab isolation,
  description persistence, independent piles, admin authorization and immutable started tasks.
- Original `node database/proof/tasks-app-proof.mjs --live`: 9/9, including complete GM return/retest/approve flow.
- Android v1.2 built from the same web sources; physical-device installation remains for the owner.
- Browser check: Process shows 1, 3, 5… while Lab shows 2, 4, 7…; a Description edit survives switching tabs.
  Changing six piles to seven produces 69 process / 42 Lab / 111 total rows, retaining the edit. These were
  unsaved checks, cleared before handing the page back. Assets have versioned URLs to refresh browser caches.

Use the new template for new batches. Existing batches are not automatically expanded into the new plan.
