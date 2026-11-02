# Tasks v2.3 — Paddy convergence and photo finish

This release uses the existing batch plan and task actuals. It adds no database tables or destructive data operation.

## Admin planning

- The **Second convergence** process row is the intended target. Admin can edit its date directly in the Paddy planning card on new-batch and batch-edit screens.
- The Paddy stream needs one preparation row and **Paddy soak 1/2**, with **Paddy soak 3** only for the three-soak variant. Lab rows are not mistaken for process steps.
- Admin sets each Paddy row's planned duration. The saved spacing between a row's planned finish and the next Paddy step (or convergence) is retained as the inter-stage wait. The card works backward from the target and shows the suggested start and finish of every step. **Apply** changes only editable Paddy planned starts, never recorded work.
- The current forecast uses actual starts/finishes for recorded steps and today's time for unstarted ones. A completed soak cannot count as ready before its planned duration has elapsed from actual start. A missed target shows the shortfall, the first detected timing cause and the earliest **Paddy-based** convergence time; early-ready Paddy is shown as **waiting**, not late.
- Admin sees shortfall or incomplete-timing status on active batch cards and a full explanation inside each batch. These are on-screen advisories, recalculated on refresh or when a plan is edited. They are not push notifications or task gates.
- If a stage date/duration/actual is missing, a route is ambiguous, or a running stage is already beyond its duration, the card does not falsely claim that Paddy will be on time. When possible it still shows shifted reference starts, clearly marked as unverified. It never shortens a soak, skips Lab work or moves actual task records.
- The forecast does **not** prove bagasse/CM readiness, physical platform availability, bunker/tunnel availability, or Lab clearance. Its “next feasible” time is specifically the earliest **Paddy-based** time; Admin must check the other constraints before changing the batch plan. The physical meaning of finishing the final soak and any additional mandatory handling period needs factory confirmation. Until then the saved gap to convergence remains the rule.

## Supervisor task completion

The running task screen labels required evidence as **Step 1 · Before photo** and **Step 2 · After photo**, then shows **Step 3 · Finish task**. A successful upload is acknowledged without clearing typed remarks or resource entries. The Finish button is disabled while either required photo is missing; a photo upload alone does not mark the task done. Tasks with different photo rules show their corresponding steps.

## Verification and release

`npm test` passed **76/76** tests covering the backward calculation, two- and three-soak routes, late actuals, early waiting, missing data, Admin editing and the photo workflow. Android package remains `in.freshbowl.tasks`; v2.3 uses versionCode 14 and the same signing certificate as v2.2.

Published on 1 October 2026:

- Tasks website: `https://mushroomos-tasks.pages.dev/` (deployment `https://81b09858.mushroomos-tasks.pages.dev/`).
- APK update site: `https://freshbowl-tasks-downloads.pages.dev/` (deployment `https://a2185aa3.freshbowl-tasks-downloads.pages.dev/`).
- APK: `MushroomOS-Tasks-v2.3.apk`, 6,398,258 bytes, SHA-256 `9c1eaaa285af79c00d544d24593000ffc3376d481b0eddbd6b2ef58e39091b6a`.
- Read-only release check matched all 19 tested public website files to local source and matched the public manifest/APK bytes, checksum and update headers.

The website and APK-download site are separate Cloudflare Pages deployments. No database migration was run for v2.3; existing batch, task and photo records were not modified by this release. A real-phone camera, upgrade and factory-network test is still required.
