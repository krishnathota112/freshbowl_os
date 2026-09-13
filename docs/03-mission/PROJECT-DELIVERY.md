# Complete-project delivery and Claude resume checkpoint

13 September 2026 · Planning/handoff only. No application implementation was performed in this documentation phase. Start at [AGENT-BRIEF](../AGENT-BRIEF.md).

## Latest supplied target and scope

The FINAL agent library specifies three first-release workstations: **Admin, Operations/Supervisor, Lab**. Do not build a separate Operator UX. Keep necessary backend roles distinct; a product label is not permission to broaden server authority. Existing/supporting Manager/GM approval views remain available when policy requires them, without inventing extra first-release workstations. The stakeholder APK has exactly two quick-login choices, Supervisor and Lab, backed by actual Supabase Auth. Admin preparation remains a separate supported surface; two quick logins do not mean only two backend roles or two identities for every test.

The earlier 40-screen specification is reusable detail, not a requirement for 40 pages or six first-release products. Reconcile O01–O05 into Operations, retain independent decision authority, and use [FINAL Library Review](../04-audit/FINAL-LIBRARY-REVIEW-2026-09-13.md) for discrepancies before implementing. The complete project additionally includes process authoring/import and durable offline behavior; those are later milestones, not grounds to hold up approved initial execution work.

## Build milestones

| ID | Deliverable and scope | Required dependency | Proof before completion |
|---|---|---|---|
| M00 Safe working baseline | Preserve dirty work, map current code/contracts, identify authorized test DB/storage; correct migration-runner tracking/target safety before using it | Build authorization and explicit test environment | Runner does not replay already-applied migrations, tracks success/checksum, rejects wrong target; no unsolicited seed; inspect migration SQL for rollback limits |
| M01 Integrity and truthful display | Correct missing-as-completed; uniform server ownership/state checks; lab package completeness, independent current-package decision; truthful sample time; real evidence chain | Settled requirements; unresolved approver mapping isolated | Direct-call negative tests, genuine upload/bind/retrieve; missing samples/results/evidence cannot submit/approve |
| M02 Complete batch preparation | One intake, explicit process/material/scope inputs, correct expansion, assignments/resources, validation, exact plan review, activation freeze | M00/M01; D10 readiness policy | Acceptance A; expected activity set based on configuration, not universal110; repeated activation safe; assignment visible by batch |
| M03 Operations/Supervisor | Reuse execution components; owned Ready/Waiting/InProgress/Done, Start/Finish, camera, required values, resource usage and Turner pile context | M01/M02; explicit role/delegation mapping | Acceptance C/E/H with Operations mapping; wrong-person denial; real camera and server time; no separate Operator interface |
| M04 Lab and decisions | Incoming draft work, dynamic checkpoints, per-pile pre/postT1, samples/tests/evidence, submit/wait/retest, separate authorized approval | M01/M02; D09 policy, exact conditional CM rule | Acceptance D/F/G; RECORD does not become an approval gate; 25 templates expand correctly by applicable scope; same actor cannot self-approve |
| M05 Complete physical flow and batch story | Parallel preparation/convergences, six piles/shared machines, paired bunker streams/rolling fills, shared tunnel, finalQC/discharge; history/variance/forecast | M03/M04; approved process version and resource rules | Full graph/scoped gate tests; correct original plan/actual/authorized/forecast distinction; unknown forecasts labelled |
| M06 Exceptions and extensions | Reasons, corrective action, holds/release, configured Manager/GM decisions, additive allowance | M01/M05; D14 policy | Acceptance I/J; approved extension never changes baseline; no release bypass or hidden overwrite |
| M07 Stakeholder APK | Build existing Capacitor app with Supervisor/Lab quick-login presentation; correct auth routing, camera, logout/session isolation, failure states | M03/M04 and safe demo environment | Web build + sync + Gradle; APK path/checksum/build identity; install and test physical phone; two accounts do not substitute for all-role authority tests |
| M08 Honest ongoing onboarding and closure | Explicit supported historical states, verified facts/unknowns, authorized cutover, terminal criteria | D13 and required backend contract | Acceptance B; no inferred history or placeholder photos; unsupported state remains unsupported |
| M09 SOP authoring and Excel import | Blank/copy/import draft, source-cell mapping, graph edit/diff, validation/review/publication, historical isolation | D12 and settled affected recipe; existing schema reused | Authoring/import tests plus K/L; both workbooks traceable; no direct Excel publication |
| M10 Durable offline/retry | Persistent capture queue, stable action IDs, resumable evidence upload, conflict/refusal handling, server receipt vs device time | M01/M03/M04; approved offline contract | Network interruption/restart/retry tests; one logical effect; no locally opened gates or silently lost captures |
| M11 Integrated acceptance and release | Complete real batch story, policy/version traceability, source/build identity, web and device walkthrough, remaining blockers explicit | Applicable milestones and factory decisions | Acceptance A–L plus mobile/security/retry checks; no fake 110/110; deployment authorized separately |

Milestones are dependencies, not a requirement to run every suite after every edit. Continue independent work while a factory decision blocks a specific branch. Do not mark M11 complete if required authoring/onboarding/offline scope is deliberately deferred; label the release scope and remaining full-project work clearly.

## Mandatory slice record

For each task record requirement/screen/scenario IDs, current implementation, exact files/functions/views affected, proposed-vs-approved status, result evidence, remaining limitations and next action. Reuse existing working paths. Inspect tests before executing against any configured database. Record a newly found backend defect in FINDINGS before fixing it within authorized scope. Keep migration deployment separate from migration design/test.

## Current checkpoint for the next Claude session

- Completed: prior read-only DB/code comparison; seven reconciliation documents; full current activity inventory; entrypoint rewrite; authoring/import specification; FINAL library review and scope mapping.
- Latest request: prepare documents Claude can use to finish the entire project, then thoroughly inspect the supplied FINAL library. This task did not authorize guessing factory policy or mutate the application/database.
- No implementation milestone above is marked complete by this handoff. Existing code may already satisfy portions; verify and reuse it.
- Critical evidence: empty primary intake config, false completion fallback, incomplete lab server invariants, incoming timestamp fabrication, shared-vs-personal queue gaps, and migration runner replay risk. See linked audit/FINDINGS for evidence, not broad claims that everything is broken.
- FINAL library has incorrect workbook provenance for Stage1B and Paddy; do not build those statements as approved recipe data. Its referenced source copies are not a new independent authority.
- Next implementation step after user build instruction: M00 environment/runner inspection and M01 truthful display/server integrity slice, while resolving only the exact policy decisions needed. Do not run demo writers or bulk migration commands to discover behavior.

## Ready-to-use Claude prompt

> Read CLAUDE.md and docs/AGENT-BRIEF.md, then the current checkpoint in docs/03-mission/PROJECT-DELIVERY.md. Use the supplied FINAL library through docs/04-audit/FINAL-LIBRARY-REVIEW-2026-09-13.md, including its source corrections and first-release scope mapping. Implement MushroomOS incrementally in the existing codebase through the delivery roadmap. Reuse working infrastructure and preserve uncommitted work. Build Admin, one Operations/Supervisor experience and Lab first; retain supporting authorized management decisions and deliver the two-login stakeholder APK. Complete later authoring/import, onboarding and offline milestones as specified. Do not infer unresolved factory rules or silently deploy/mutate production data. Prove each slice with appropriate server and user-flow evidence, update the checkpoint, and continue independent authorized work instead of restarting documentation or stopping at a superficial demo.

This prompt is supplied for the user to issue when ready; its presence in a file is not an executed build instruction.
