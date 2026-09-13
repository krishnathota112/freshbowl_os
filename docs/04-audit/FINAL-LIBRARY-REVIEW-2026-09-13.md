# FINAL agent library — full review and Claude applicability

13 September 2026. Reviewed the supplied library at `T:/exisiting_freshbowl/MushroomOS_Agent_Library_FINAL`: 35 Markdown files and both included workbooks. The user's path with escaped underscores resolves to this directory. This review continues the authorized Claude documentation handoff; it is not an application implementation or factory sign-off.

## What was checked

- Read the entrypoints, PRD, process/register/reconciliation, lab/evidence, Operations, Admin, architecture, UML/story, current-state/reuse/comparison, build/acceptance, governance, traceability and APK documents.
- Read the two long master/source narratives. Compared the copied CURRENT_PRODUCT_MODEL_SOURCE and CURRENT_PROCESS_MODEL_SOURCE byte-for-byte with the repository versions: identical at inspection. Their 110-activity appendix was already reviewed/generated in the preceding task; copying it into this library adds no independent evidence.
- Read every populated cell and formula in the two original-source workbooks: revised workbook Sheet1, 69 rows/8-column extent; older workbook Sheet1, 72 rows/13-column extent. Formula text is source evidence, not a recalculated result. Workbooks were not edited.
- Located the previously missing end-to-end document and master PRD under `T:/exisiting_freshbowl/exisiting_freshbowl/docs_for_reading/`. The previous reconciliation said they were not found; these are now available through the supplied library/source folder.
- Cross-checked relevant LAB-2026A Word sections and existing saved DB lab definitions, plus current login source and migration runner. No new mutation/API probes, APK install or complete acceptance run occurred.

## Material scope change

The library's first release has **three workstations: Admin, Operations/Supervisor, Laboratory**. It explicitly removes a separate Operator UX while permitting distinct existing backend roles. Manager/GM authority remains in supporting views/actions where configured, not extra first-release products. The stakeholder APK exposes **two quick-login choices: Supervisor and Lab**, authenticated through Supabase. This is different from the earlier six-role screen/navigation proposal; merely renaming a menu must not grant Supervisor every Operator/Lab permission.

For the handoff, use this as the latest supplied release target, with unresolved policy still explicitly pending. It is not proof the user approved every sentence or factory number in the library. Existing O01–O05 task/evidence states can be reused inside Operations. Shared Lab Status and independent approval remain separate from technician execution ownership. Admin still prepares batches outside the two-choice field login surface. Keep configured managerial decisions accessible through supporting authorized paths; do not grant them to either quick-login account just to finish a demonstration.

## Findings and corrections

| ID | Library claim / area | Evidence and conclusion | Handoff treatment |
|---|---|---|---|
| L01 | Revised workbook explicitly introduces Stage1B Pass2 and computes26h | `revised_source_Compost_SOP.xlsx`, Sheet1 C24:D26: heading12, mixing8, one hopper4. Row27 is blank. No second pass, rest10 or 26 calculation appears there | Correct attribution: second pass/rest is a separately supplied proposed amendment. D01 stays unresolved; locate a dated factory ruling before publication |
| L02 | Additional22/28/24 soaking rows are Stage1B | Same workbook C28:D33 places them under Stage1C-A Paddy. Older workbook B28:C32 does too | This is a source-reading error, not a new factory ambiguity. Do not add those steps to Stage1B |
| L03 | Paddy74 vs86 vs90 | Revised D28 heading74; D29:D32 sum86; D33 adds4 pile preparation, producing90 for that grouping. Older source puts the4h preparation in the following Stage1C-B region | Keep work grouping distinct from changed duration.86 versus90 can describe different included work; D06 still governs approved stage boundary/convergence |
| L04 | “FINAL” and strong definitive language imply approval | The same library lists unresolved timings/authority and sources “for signature”; opaque `filecite` tokens in master narratives cannot be followed as repository citations | FINAL is a package name, not factory sign-off. Retain source/date/status on every rule; do not promote prose automatically |
| L05 |25 checkpoints per batch | Snapshot has25 LAB_2026A definition rows:4 GATE/1 DECISION/20 RECORD. Current C binds41 lab activity definitions; scope expansion and conditional applicability are different measures | Test25 templates and correct occurrence expansion separately. Never force25 sample rows or treat41 as a contradiction without scope mapping |
| L06 | CM pre-use test skipped below configured12h | LAB-2026A supports conditional rule but asks whether gap ends at unload or mixing start. Saved evaluate_gates LAB_APPROVED branch counts gate decisions; that branch has no gap/window skip logic | Require end-to-end contract verification and exact time-anchor decision. Do not implement a browser skip or claim source/config text proves runtime behavior |
| L07 | Only four gate types; RECORD never blocks | Supported by lab contract; records still need evidence for their own completion. Saved LAB_APPROVED evaluator filters checkpoint kind=GATE | Keep record completeness separate from downstream blocking. Do not turn all lab activity evidence/approval tasks into production hard gates |
| L08 |48 operational Turner photos | Library distinguishes2 per pile per pass from lab evidence. Its lab evidence-type occurrence counts are not photo minima | Preserve separation and bind requirements to version/scoped occurrence. Do not derive per-checkpoint minima from aggregate type counts |
| L09 | UML is the complete visual contract | Six diagrams are requested but only two Mermaid references supplied. End-to-end reference omits explicit review/activation between generate/freeze, collapses two convergences and routes a generic Lab gate into Turner | Use as overview only. Complete state/sequence/swimlane diagrams before claiming UML acceptance; actual gate targets must come from approved bindings |
| L10 | Operations sees “only eligible” tasks, while queue includes blocked/waiting | Wording conflicts within Operations/story material | Only Start eligibility is restricted; visible owned queue may contain waiting/blocked work with reasons. Do not hide blockers |
| L11 | Migration runner is unsafe to bulk replay | `mushroomos/scripts/db.mjs` reads sorted SQL and executes every file; no applied-migration ledger/checksum skip; default phases include migrations and seeds | Verified source-level risk. M00 must fix/validate runner before any use on non-disposable data. The file's idempotent-seed comment is not proof |
| L12 | Two-login stakeholder APK versus current source | `src/routes/SignIn.tsx` lists six demo-role accounts and defaults to Admin | Confirmed source mismatch. Desired two choices are a build/presentation target, not auth bypass. Existing APK correctness was not freshly verified |
| L13 | Two-account factory acceptance | Admin setup and potentially independent Manager/GM decisions still required | Use Admin/supporting authorized accounts in acceptance setup and decisions; two field quick-login choices cannot prove all authority boundaries |
| L14 | One source of truth but multiple entrypoints/master claims | Library brief, Claude/Codex entries, reference MASTER_PRD “primary build brief,” older repo briefs all claim authority | Repo CLAUDE.md → AGENT-BRIEF is the engineering entry. Library canonical sections are source requirements; reference masters are supporting detail with known conflicts |
| L15 | Full scope versus future authoring | Library Admin labels SOP management future; its execution wave plan does not specify detailed authoring/import or durable offline delivery | First release targets three workstations/APK. Complete-project roadmap retains those later capabilities and must label any deferred scope rather than declare entirety complete |

Additional unresolved source facts remain: Stage0C8 heading vs5+40+3; old/revised AND/OR temperature/time language; Turner schedule versus headers; two/three bunker cycles; shared-tunnel phase timing;67–68 moisture band; lab authority/turnaround/methods/photo minima; unload duration and milestone terminology. The library does not resolve them by repeating a “working standard.”

## Canonical ownership and overlap

| Subject | Engineering owner | Library source / compatibility |
|---|---|---|
| Agent entry and change authority | docs/AGENT-BRIEF.md | Library entry files are supporting onboarding, not competing missions |
| First-release product scope | This applicability section + Project Delivery | Library PRODUCT_PRD, SUPERVISOR_OPERATIONS and APK target; earlier separate Operator UX is not first-release target |
| Process values/conflicts | Existing process decision register, STANDARD/schedule and actual ruling | FULL_PROCESS contract/register/reconciliation provide candidate details; L01/L02 correct their source attribution |
| Lab semantics | Version-bound lab contract and approved decisions | LAB_COMPLETE and evidence matrix, checked against source LAB-2026A/current DB; counts distinguish templates/occurrences |
| SOP lifecycle | SOP_VERSION_MODEL | Library change-control agrees; no duplicate lifecycle required |
| Authoring/import | PROCESS_AUTHORING_AND_IMPORT | Fills the library's intentionally future/incomplete editing contract |
| Screens/navigation | SCREEN_SPECIFICATION and UI_INFORMATION_ARCHITECTURE with this release mapping | Eight-row library screen matrix is a summary, not replacement for full states/contracts |
| API/security | Verified DATA-CONTRACTS/schema/current source | Library architecture/integrity is desired behavior; no new engine |
| Defect status | FINDINGS, linked dated audit | CURRENT_BUILD_AND_GAPS is a checklist to recheck, not empirical proof |
| Delivery/acceptance | PROJECT-DELIVERY and FACTORY_E2E_SCENARIOS | Library waves/DoD/APK checks supplement scoped release and device proof |

No source files in the FINAL library were changed or deleted. Earlier copied reference masters should not be read as new instructions. Opaque citation tokens need replacing with real file/section/cell provenance whenever used to justify a change.

## Decision continuity

Retain existing D IDs. Library open items1–2 map to D01;3 to D06;4 to D06;5–7 to D03/D11;8 to D04/D11;9 to D11;10 to D09;11 to D08 plus lab specification provenance;12 to explicit evidence-minimum clarification under D09/D12;13 to D05/D13;14 to D05/D06. These are mappings, not resolved rulings. The Operations/backend-role mapping falls under D15. Do not erase previous questions absent from the shorter library list.

## Result

The library is useful as a concise release brief and supplies missing source narratives, explicit Operations/APK scope, and lab distinctions. It is not safe to consume literally as a fully reconciled executable specification. The handoff now routes Claude through this review, the existing detailed contracts and a complete-project milestone plan. Application, database, workbooks and supplied library remain unchanged during this review.
