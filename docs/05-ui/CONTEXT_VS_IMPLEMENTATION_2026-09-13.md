# Context pack versus current application and deployed database

Reviewed 13 September 2026. The application has substantial process, execution and audit foundations, but the batch intake, lab approval enforcement and several screens do not yet deliver the end-to-end workflow described in the context pack. A completed demo counter is not sufficient evidence of that workflow.

## Scope and evidence

- Requirements: `T:/exisiting_freshbowl/context.txt`, canonical documents 00–08 and the source workbook inside `MushroomOS_Codex_Context_Pack.zip`. Embedded agent prompts were treated as reference material, not authorization to implement or change factory policy.
- Code: the current working tree under `mushroomos`, including existing uncommitted changes. This is not a comparison against HEAD alone.
- Database: the connection configured by this working tree, inspected using SELECT/catalog queries. The saved transaction confirms `transaction_read_only=on` at 07:31 UTC. Its environment marker says development; this review does not establish that it is the factory's production environment.
- Evidence: [database snapshot](../04-audit/context-comparison-2026-09-13/database-readonly.json) and [inspection script](../../mushroomos/scripts/context-audit-readonly.mjs). Function and view names below identify entries in that snapshot.
- No application RPCs, demo runners, database-writing tests, migrations or cleanup were run for this comparison. Screen findings come from source inspection, not a fresh interactive acceptance run. Function-body findings identify missing checks; they are not claims that a new exploit was executed.
- Validation: `npm run typecheck` passed (exit 0). This verifies TypeScript consistency, not end-to-end factory behavior.

The pack's `EXISTING_*` documents are historical references. Where they disagree with current code or database definitions, they do not describe today's implementation.

## Comparison

| Area | Required by context | Current evidence | Assessment |
|---|---|---|---|
| Process model | Versioned graph, streams, holds, gates, resources and evidence | Published PROCESS-2026C has 110 activities, explicit process rows, checkpoint bindings and gates | Substantial foundation exists |
| Standard timing | Distinguish first-stream standard from full process span | Catalogue reports 470 hours standard and 474 full span; discharges at H470, H472 and H474 | Matches this distinction |
| SOP lifecycle | Copy into draft, edit, validate, review and publish a new version | Published catalogue, publication RPC and activity freeze exist; no complete draft authoring/review UI or clone/edit RPC workflow found | Partial |
| New batch | Select process, materials and structure, generate and review complete plan | Main intake sends empty configuration and material roles, then generates immediately | Major gap |
| Readiness | Crew, resources, material acceptance and plan review before activation | Prepare screen has material checks, crew assignment and validation; complete resource/plan preparation is not enforced there | Partial |
| Work allocation | Clearly show who owns each batch activity and each person's queue | Bulk assignment exists; personal and management visibility are mixed in views and navigation | Partial/conflicting |
| Lab execution | Sample, required tests, readings, evidence, submission | Current LabCheckpoint screen and checkpoint binding implement these steps | Implemented in UI; incomplete server enforcement |
| Lab approval | Separate authorized decision, no self-approval, valid submitted readings | Numeric acceptance permits lab technician/supervisor; decision RPC lacks sample/result completeness and distinct-actor checks | Major gap |
| Actuals and baseline | Frozen activated plan; traceable corrections | Plan-freeze and correction/audit mechanisms present | Foundation exists; not re-tested by mutation |
| Evidence | Real captured/uploaded evidence linked to requirements | Upload, binding and retrieval paths exist; camera uses native capture | Implemented paths; demo authenticity not established |
| Extensions | Request, manager decision, GM decision, separate time numbers | Backend policy exists; corresponding role action screens/calls were not found | UI workflow missing |
| Operational clock | Server controls execution and rest gates | Operational functions use server time; frontend clock can use development offset or browser fallback | Backend aligned; display can diverge |
| Offline behavior | Reliable retry without duplicate operational records | No durable offline queue/idempotent replay implementation found in frontend | Not demonstrated |
| Data access | Read from views, write through controlled RPCs | RPC writes are common, but frontend still reads several base tables directly | Partial contract compliance |

## Findings that most affect a real demo

### 1. Main New Batch path can produce an incomplete plan

`src/api/intake.ts:95–96` sends `config: {}` and `roles: []` from `createAndPlan`. The primary BatchStart flow collects the process, batch name and H0 but does not establish material selection and batch structure before generation. A separate older NewBatch screen contains richer inputs, so there are two inconsistent intake experiences.

The live snapshot contains five recent batches with empty configurations and 94 activities. Four are drafts; `888,999,777` is active. PROCESS-2026C defines 110 activities. The deployed `validate_batch` checks incoming acceptance, assignments, certain movement/resource conditions and durations, but does not require complete material/configuration selections. The activity-count difference alone does not prescribe how every optional process should expand; it does prove that activation can proceed without the explicit intake choices required by this pack.

**Needed:** one supported intake contract and UI, validated against the selected process's required inputs; inspect the generated plan before activation.

### 2. One Activities view can show work as done when it is absent

`src/routes/BatchDetail.tsx:800` fixes the pile list to three. Its subsequent stage definitions use legacy activity codes. At line 847, a missing activity defaults to `COMPLETED`. This component is still rendered by BatchPage's Activities view. It also has a fixed H240 deadline at line 933.

The current process contains six Turner piles and four T0–T3 passes with different identifiers. Therefore this view can display misleading completion and obsolete timing even when the database holds the newer model.

**Needed:** render the selected batch's actual graph and state; missing data must not become completed work.

### 3. Lab readings have two different acceptance mechanisms

These are distinct actions:

| Action | Current location/contract | Actual authority |
|---|---|---|
| Record and submit an activity's lab work | Lab Queue → LabCheckpoint | Lab execution screen; submission calls `complete_activity` |
| Accept an individual numeric result | Incoming-material controls in PrepareBatch/ScheduleBuilder; `accept_lab_result` | Lab technician or supervisor |
| Approve/reject a lab activity and release its gate | `/lab/approvals`; `decide_lab_submission` | Currently GM or supervisor when both approval-policy readings are disabled |

The incoming-result controls are on routes restricted to admin, GM and supervisor. Lab technicians cannot reach those routes, despite being authorized by the numeric-acceptance RPC. Conversely, an admin can reach the preparation screen but cannot accept the result. Manually entering the preparation URL as lab technician does **not** solve this: the route guard denies it.

`src/api/prebatch.ts` records a reading and immediately calls numeric acceptance as the same user. `accept_lab_result` does not prohibit accepting one's own reading. Its role condition also excludes null from rejection, which merits defensive review; no null-role bypass was exercised here.

The approval queue is visible to additional management roles, but visibility does not grant decision authority. Current navigation has already removed Tasks from Admin; supervisor still has both Tasks and Lab Queue. Those facts supersede older screenshots/descriptions.

**Needed:** a dedicated incoming-material lab work item, clearly named submission versus acceptance actions, and consistent route, queue and server authority rules.

### 4. The server can complete/approve lab activities without their readings

The LabCheckpoint UI checks that a sample exists, tests are no longer pending, expected parameters are represented and required photos are present. However, deployed `submit_activity` does not require the corresponding sample/results before completion. `complete_activity` delegates to it.

`decide_lab_submission` checks role, verdict, reason and that the activity is lab work, but does not enforce a submitted/completed state, required samples/results, result acceptability, or a different decision-maker from the submitter. Client-side checks cannot establish this backend contract.

The database gives concrete evidence of the gap:

| Batch | Completed activities | Completed lab activities without an activity-linked sample | Samples in batch |
|---|---:|---:|---:|
| BATCHexp | 110/110 | 41 | 1 |
| BATCHDEMO | 110/110 | 41 | 1 |
| BATCHLAB | 80/110 | 30 | 2 |

Consequently, the earlier 110/110 result does not prove sampling, testing and approval occurred end to end. Evidence-row counts similarly establish stored records, not authentic photographs. The prior handoff reports placeholder uploads and historical timestamps; this inspection did not inspect the image bytes.

**Needed:** server-side completion and decision invariants, followed by a genuinely recorded role-by-role demo.

### 5. Incoming sample collection time can be manufactured by the client

`src/api/prebatch.ts:55` computes collection time using the earlier of browser “now” and H0 minus one hour. It submits that value as the collection timestamp. For a historical H0 this automatically claims that a newly entered sample was collected in the past, without asking the operator for the actual collection time.

**Needed:** server-stamped current collection or an explicit, auditable historical-entry path with user-supplied facts. Onboarding must preserve uncertainty instead of filling it with inferred history.

### 6. Queue visibility is not yet the ownership model in the pack

`v_my_work` includes every active batch activity for supervisor, manager, admin and GM, while other users are scoped by assignment. `v_lab_queue` selects active lab activities without an assignee predicate. Thus it is a shared laboratory queue, not necessarily the signed-in technician's allocated work.

Several authenticated SELECT policies, including activity and lab records, are broad. This may be intentional plant-wide visibility, but it does not itself enforce restricted role visibility. Decide which information is shared and which is personal, then implement that distinction consistently. Supervisor awareness of lab status should not accidentally imply ownership of lab execution.

### 7. Demo records are not clearly separated

There are 12 batches in the snapshot, including four cancelled historical batches. All 12 have `is_demo=false`, including BATCHexp, BATCHDEMO and BATCHLAB. Completed demo activities still sit under active batches. That is unsuitable as an unambiguous clean demonstration dataset.

No records were removed in this comparison. A cleanup should preserve audit history and distinguish demo data explicitly; the batch names alone are insufficient grounds for deleting operational records.

## Process differences requiring factory decisions

The supplied documents are not entirely consistent, so these differences must not be silently converted into code changes:

- **Stage 1B amendment:** current process has mixing H136–144, hopper water H144–148 and rest H148–160 (planned 12 hours, range 8–12). The new proposal adds another same-duration pass followed by 8–10 hours rest, planning 10. The already-existing Stage 0A second hopper pass is a different activity. The proposed Stage 1B change needs a new approved SOP version; no revised total is asserted here.
- **Turner:** current process has six piles, four 1.5-hour passes, and pre/post-T1 laboratory activities. Older supplied references describe lab checks after every pass. Source workbook “continuous” language also conflicts with the documented same-pile T1-to-T2 rest rule. Resolve the intended approved process rather than combining these statements.
- **Bunker/tunnel timings:** source workbook and current process differ materially. For example, current tunnel leveling/heating/pasteurization are 19/10/9.5 hours versus workbook figures of 14/12/8. Bunker loading and hold assumptions also differ. These require explicit reconciliation with the approved process.
- **Workbook totals:** some headings do not reconcile with constituent activities or omit rest. Treat 470 standard and 474 full span as separately defined measures, not interchangeable totals.
- **Lab turnaround:** notes include pH 30 minutes, moisture 25 minutes, EC 30 minutes, nitrogen 6 hours, TDS 10 minutes and conflicting ash durations. The current lab model does not establish this turnaround schedule. Unlabelled numbers in the notes also need definition.
- **Pre-H0 readiness:** old advisory wording and current blocking incoming acceptance may refer to different checks. Distinguish material acceptance from weighment requirements before changing activation policy.

## What can be retained

The database already provides process versions, catalogue selection, frozen activity definitions, plan protection, auditable actual corrections, resource/gate structures, lab checkpoint bindings, evidence requirements and extension policy. The current LabCheckpoint screen does use the process-to-checkpoint mapping; an older claim that it simply lacked this mapping is outdated.

Published process-activity edits are protected. A complete immutable SOP graph and comprehensive publication validation still need review: publication currently checks activity presence, placement and envelope agreement, while related graph/configuration tables have different protections. No complete draft-edit-review-publish application workflow was found.

## Recommended order of work

1. Correct false completion displays and unify batch creation around required process inputs.
2. Enforce lab completeness, submission state and distinct approval authority in the database; align incoming-material routes and actions.
3. Separate personal allocations from shared monitoring, with a visible batch → activity → assignee trail.
4. Agree the pending SOP changes and lab timing rules; publish a new version without rewriting existing batches.
5. Expose the missing extension and SOP-management workflows, then address reliable offline replay.
6. Run a clearly marked demo through real collection, readings, evidence, submission, authorized approval, resource allocation and downstream gate release. Record failures as failures rather than repairing the demo history invisibly.

This review changes no application behavior or database records. Its recommendations are a comparison outcome, not implemented fixes.
