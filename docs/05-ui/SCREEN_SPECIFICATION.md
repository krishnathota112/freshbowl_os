# Screen specification — reconciliation review draft

> **Later first-release scope:** Admin + Operations/Supervisor + Lab. O01–O05 are reusable execution states within Operations, not a separate Operator interface. Manager/GM screens are supporting authority surfaces, not additional first-release workstations. Stakeholder APK quick login exposes Supervisor and Lab only. Apply the [FINAL library review](../04-audit/FINAL-LIBRARY-REVIEW-2026-09-13.md) before implementing this registry; the40 entries are contracts, not40 required pages.

13 September 2026 · Product contracts, not new components or routes. Roles/actions refer to the [role model](../02-roles/OWNERSHIP_VISIBILITY_AUTHORITY.md). A proposed action whose backend contract is missing must stay explicitly unavailable until implemented and verified; no browser workaround.

## Contract applied to every screen

Each registry row below inherits this full state contract. Its purpose is the user job expressed by its dominant question. Screen IDs are specification identifiers, not URLs. Related states may share one component; the registry does not require a page per state.

| State / rule | Required behavior for every registry entry |
|---|---|
| Loading | Retain batch/person/checkpoint context if known; mark data loading; disable mutations until fresh authority/state arrives |
| Empty | Use the specific empty-state wording in the registry; offer only a permitted next action; never invent example records |
| Error | Explain failed read/write and retry; preserve unsent values; do not show success or clear input before confirmed server response |
| Blocked | Show specific missing condition, responsible role/person and permitted next action; missing contract is “Not supported yet,” not fake functionality |
| Success | Show persisted outcome with server time/reference and next step; reconcile from server, not optimistic completion alone |
| Stale/offline | Show last refresh and pending local capture separately from server records; no locally inferred gate release; durable replay required before offline submit is offered |
| Permission | Contextual view may remain; unauthorized actions absent; direct URL/call still denied by server; do not expose restricted data in cached screens after account change |
| Responsive | Worker primary action usable on phone; context survives navigation; management wide tables have usable phone summaries; no new design system required |
| Universal exclusions | No raw IDs/RPC names, fake counts, default “Done,” globally fixed hours, inferred approvals, editable baseline, browser-computed eligibility or unrelated worker queue |

In the registry, **States** lists subject states beyond the shared loading/error/offline states. Empty wording is specified per row. Success corresponds to the primary action's confirmed persisted outcome, or a successful read for read-only screens. Backends below are existing sources/candidates; “gap” denotes an absent or incomplete contract. View access must follow D15; names do not imply permission.

## Backend source keys

| Key | Existing source / write path and limits |
|---|---|
| B | `v_live_batch`, `v_batch_forecast`, `v_batch_variance`, `v_batch_event`; batch detail/configuration still needs a view contract replacing direct reads |
| P | `v_process_catalogue`, `v_process_standard`, `v_process_confidence`; full version graph currently direct-table reads, view contract gap |
| I | `create_master_batch`, `generate_activity_plan`, `validate_batch`, `activate_batch`; completeness/review gaps G01 |
| A | `v_my_work`, `assign_activity`; explicit batch assignment read contract and consistent ownership checks required |
| W | `v_my_work`, `v_activity_expectation`, `v_activity_timing`; `start_activity`, `complete_activity`; G03/G06 checks incomplete |
| E | `v_evidence_state`; storage upload → metadata → `bind_evidence` → signed retrieval; confirm authorization at each step |
| L | `v_lab_queue`, `v_lab_checkpoint_map`, `v_lab_result_current`, `v_lab_result_history`, `checkpoint_package`; `open_lab_sample`, `request_lab_test`, `record_lab_result`, `order_retest`, completion; G03/G04 |
| Q | `v_lab_approval_queue`, `v_lab_approval_question`, `v_lab_gate`; `decide_lab_submission`; D09 and G04 unresolved |
| N | `v_prebatch_material_check`, current result/history views; `open_prebatch_sample`, result RPCs, `accept_lab_result`; draft lab queue, acceptance and timestamp gaps G05/G11 |
| D | `v_deviation_open`, batch events; `raise_deviation`, corrective-action/verification/escalation/accept-with-deviation RPCs; subject/state permissions need verification |
| X | `v_extension_request`, activity/batch forecast; `request_extension`, manager/GM decision, cancellation/expiry RPCs; D14 policy |
| R | `v_vessel_availability`, `v_batch_vessel`, `v_batch_movement`, `v_machine_utilisation`; allocate/release vessel and machine-usage RPCs; unresolved resources D11 |
| O | `hold_activity`, `release_activity`, `return_activity`, `gm_decide_override`; configured authority only, never arbitrary gate bypass |
| S | Catalogue read, `publish_process_definition`, `set_current_process`; complete copy/draft-edit/review/archive and publication contract gaps G10 |

## Admin and shared batch screens

| ID / screen / role | Dominant question and entry | Required information | Primary action; secondary actions | States; empty state | Backend; what must not appear |
|---|---|---|---|---|---|
| A01 Home / Admin | What is happening in my factory? · sign-in/Home | Attention by owner, active batches, waiting decisions, New Batch and Add Ongoing Batch | New Batch; open attention/batch, add ongoing | Normal/attention/stale; “No active batches” | B,D,Q; no operator task feed or unsupported decision buttons |
| A02 New Batch / Admin, authorized GM | What must I define before this batch can be planned? · Home | Version, identity, H0/timezone, required material roles/quantities, scopes/options and prerequisites | Generate draft plan; save draft/back | Draft/incomplete/generating/generated; “Start by choosing a published SOP” | P,I,N; no empty required defaults or typed planned activity times |
| A03 Ongoing Batch / Admin, authorized onboarding actor | What do we know about this batch already running? · Home | Real identity/H0/version, verified position, evidence sources, known/unknown history, supported-state validation | Submit verified onboarding when supported; save draft/review source | Draft/needs proof/unsupported/ready/onboarded; “No historical information recorded” | B and onboarding gap G12; no fabricated photos, inferred timestamps or mass-complete action |
| A04 Batch Detail / authorized shared roles | What is happening with this batch? · batch link | Version/H0, now/next/blocked, lab status, named owners, baseline vs actual/authorized/forecast, history | Open next relevant owned action; plan/lab/assignment/history | Draft/active/terminal/unknown; “No plan generated” | B,W,L,Q,R; no old fixed three-pile model or missing-as-done |
| A05 Plan Review / Admin, permitted reviewer | Is this exact plan ready to activate? · generated draft | Full version-specific activities/streams/holds, included/excluded options, timings/milestones, materials, assignments/resources, validation results | Confirm review then activate if authorized; return to setup/assignment | Invalid/reviewable/review stale/active; “Generate a plan first” | P,I,A,R,N; review revision contract gap; no activation while blockers exist |
| A06 Assignment / Admin, Supervisor as authorized | Who is doing each activity in this batch? · draft readiness/Batch | Group by role/scope, activity, person, eligibility, unassigned counts, shared-status link | Save explicit assignments; filter/reassign with reason | Unassigned/assigned/partial failure/locked; “No assignable work in this plan” | A; no assigning timed holds or assigning lab to supervisor for visibility |
| A07 Active Batches / management | Which batch needs attention? · navigation | Version, stage, owner, blockers, planned/actual/forecast with unknowns | Open batch; filter/search/create if authorized | Active/filtered/archived context; “No batches match these filters” | B; no demo rows disguised as live operations |
| A08 Attention / Admin | What needs routing or correction? · Home attention | Problem, affected batch, severity basis, owner, age basis and permitted resolution | Open responsible workflow; filter/contact context | Open/assigned/resolved/unknown age; “Nothing currently requires attention” | B,D,Q,R; no invented severity or test SLA |
| A09 Approvals / Admin oversight | Which decisions are waiting, and who can decide? · attention | Subject/package, designated approver, blockers, current verdict/history | Inspect decision; filter/open batch | Pending/decided/unresolved approver; “No decisions waiting” | Q,X; no blanket Admin approve button |
| A10 SOP Management / Admin, designated publisher | Which version should future batches use? · navigation | Catalogue status, standard/span, provenance, usage, version lineage and unresolved changes | Create draft version when supported; view/copy/review/publish/select current | Draft/review/validated/published/archived/unsupported; “No selectable published SOP” | P,S; no in-place published edits or silently repointing batches |
| A11 SOP Draft/Review / designated editor/reviewer | Is this proposed recipe complete and approved? · A10 | Graph, options, roles, resources, tests/evidence/gates, source diff, conflict IDs, validation | Submit review/validate/publish according to current step and role; edit/return draft | Draft/review returned/validated/stale/published; “Add the first stage and activity” | P,S; authoring gap; no permission invented for reviewer |
| A12 Batch History / permitted shared roles | What changed, who did it and why? · Batch | Chronological events, baseline, actual supersessions, evidence, submission and decision links | Inspect event/proof; filter | Recorded/corrected/missing evidence; “No recorded events yet” | B,E,L; no delete-history or silent actual editing |
| A13 Resource Allocation / Supervisor, authorized operations | Which physical resource can this work use? · readiness/task/Batch | Required class, availability/occupancy, batch scope, movement origin/destination and conflicts | Allocate permitted unit; release/record actual use | Unallocated/available/occupied/maintenance/unknown policy; “No eligible resource available” | R; no lifecycle available treated as vacant, invented loader capacity or destination |

## Operations workstation

**Operations is one product workstation. Operator and Supervisor are not separate application experiences. Backend authorization remains capability-specific.** ([role model](../02-roles/OWNERSHIP_VISIBILITY_AUTHORITY.md#operations-workstation--product-direction-13-september-2026)) Screen IDs are unchanged because acceptance scenarios reference them. **O-screens** are the shared work screens every Operations user has; **S-screens** are sections of the same workstation shown only to a user whose backend role holds supervisor authority. They are not a separate application, and the “role” column names the required authority, not a different product.

### Supervisor-authority screens (within Operations)

| ID / screen / role | Dominant question and entry | Required information | Primary action; secondary actions | States; empty state | Backend; what must not appear |
|---|---|---|---|---|---|
| S01 Home / Supervisor | What needs my attention now? · sign-in/Home | Running/blocked work, assigned attention, lab status, authorized pending decisions | Open highest relevant attention item; batches/lab status | Normal/attention/stale; “No operational attention items” | B,W,D,Q; no personal queue of every lab test |
| S02 Active Work / Supervisor | Who is working, and what is waiting? · Home | Activity/scope/assignee, actual start, eligibility, blocker and resource | Open work context; assignment/hold when permitted | Ready/running/held/blocked/completed; “No active work in this selection” | W,A,R,O; no automatic ownership from VIEW |
| S03 Attention / Supervisor | What can I resolve or route? · Home | Blocker reason, owner, affected successor, required proof/decision | Open permitted resolution; reassign/escalate | Open/in progress/escalated/resolved; “Nothing needs your attention” | D,Q,O,B; no unconditional release |
| S04 Lab Status / Supervisor | Which lab work affects production? · Home/Batch | Sample/test status, technician, submitted package, approver, blocked production and unknown turnaround | Open package/authorized decision; filter by batch | Awaiting sample/testing/submitted/approved/rejected/unknown SLA; “No lab work for this selection” | L,Q; no technician Start/Test controls by default |
| S05 Approvals / configured Supervisor/GM | What requires my decision? · attention/Lab Status | Current submitted package, values/specs, evidence, recorder, prior results, decision policy and affected gate | Approve or reject with reason; inspect proof/history | Pending/incomplete/stale/decided/not authorized; “No decisions assigned to you” | Q,L,E; no self-approval or zero-reading approval |
| S06 Exceptions / Supervisor | What departure needs controlled action? · attention | Deviation, failed requirement, corrective action/evidence, affected batch and permitted disposition | Record/verify permitted corrective action; escalate/request extension | Open/corrective action/pending verification/escalated/resolved; “No open exceptions” | D,X,O; no concealed baseline edits or arbitrary override |
| S07 Batch Detail / Supervisor | What is happening with this batch? · active work/batches | Same A04 data with supervisor actions only | Open owned attention item; lab status/assignments/history | Same A04; “No plan generated” | B,W,L,Q; no copying Admin setup actions into active execution |

### Work screens (every Operations user)

| ID / screen / role | Dominant question and entry | Required information | Primary action; secondary actions | States; empty state | Backend; what must not appear |
|---|---|---|---|---|---|
| O01 My Work / Operator | What do I need to do now? · sign-in | Assigned Do Now/Upcoming/Waiting/Done; batch/scope and eligibility reason | Open eligible assigned task; view waiting/done | Ready/upcoming/blocked/done; “No work assigned to you” | W,A; no other people's executable work |
| O02 Task / assigned Operator or delegated performer | What do I do on this task now? · My Work | Batch/scope, instructions, current state, required readings/evidence and resource | Start, capture next required proof, or Finish according to server state; report issue | Ready/in progress/evidence missing/returned/completed; “Task unavailable—refresh your work list” | W,E,R,D; no actual-time editing or local gate calculation |
| O03 Evidence / assigned performer | What proof is still required? · Task | Requirement label/count, capture context, uploaded/bound status and retrieved image | Capture/upload/bind next requirement; inspect/retry | Needed/captured/uploading/unbound/bound/retrieval failure; “No evidence required for this step” | E; no local-preview-as-completed upload or fake image |
| O04 Waiting / Operator | Why can I not start yet? · My Work | Blocker, dependency, responsible person/role, freshness and server-derived timing | View blocker context; return to work | Rest/lab/resource/hold/unknown; “No assigned tasks waiting” | W,Q,R; no Skip/Force Complete |
| O05 Done / Operator | What have I recorded? · My Work | Own completed work, server times, evidence and correction/rejection status | View record; return to current work | Completed/corrected/returned; “No completed work yet” | W,B,E; no editable original actuals |

## Laboratory screens

| ID / screen / role | Dominant question and entry | Required information | Primary action; secondary actions | States; empty state | Backend; what must not appear |
|---|---|---|---|---|---|
| L01 Queue / Lab | What sample do I test next? · sign-in | Assigned incoming and active checkpoints, batch/scope, readiness, retest and submission status; SLA only when defined | Open next owned checkpoint; own waiting/shared pool if approved | Ready/testing/retest/waiting/unknown timing; “No lab work assigned to you” | L,N,A; draft queue/ownership gaps; no whole production task catalogue |
| L02 Checkpoint/Sample / Lab | What exactly must I sample and test? · queue | Batch/version/map, material/pile, checkpoint, required tests/units/methods/evidence, collection provenance | Collect/open sample; view instructions/history | Ready/sample open/testing/blocked; “No sample collected yet” | L,N; no unrestricted checkpoint mismatch or guessed collection date |
| L03 Readings / Lab | Which measurements remain to be recorded? · checkpoint | Required parameters, units/spec/method, sample identity, pending/current readings and remarks | Record next reading; inspect result/history | Requested/in progress/recorded/out of range/invalid input; “No readings recorded” | L; no edited prior result or invented limits |
| L04 Retest / Lab | What must be remeasured and why? · rejected/current result | Original result, reason, new test/result linkage, required evidence and decision invalidation | Record authorized retest; inspect original | Requested/testing/retested/pending review; “No retest requested” | L,Q; no overwritten failed reading or reused stale approval |
| L05 Evidence / Lab | What proof supports this sample/package? · checkpoint | Sample/requirement context, required count, upload/bind/retrieval state | Capture/upload/bind; inspect/retry | Same O03; “No evidence required for this checkpoint” | E,L; no stock/placeholder proof |
| L06 Submit / Lab | Is this complete package ready for independent review? · checkpoint | Required/current tests/results, evidence, sample identity, failures, comments and package revision | Submit once; return to missing item | Incomplete/ready/submitting/submitted/stale; “Collect a sample before submission” | L,E,Q; G03/G04; no submit without package or client-only success |
| L07 Waiting / Lab | What have I submitted and who decides next? · queue/submission | Submitted package/time, designated approver, gate affected, read-only package | Open next lab task; inspect submission | Submitted/policy unresolved/reviewing; “No submissions waiting for approval” | L,Q; no technician Approve Own Result |
| L08 Approved / Lab | What was approved and what follows? · status/history | Approved package/revision, approver/reason/time, downstream gate state | Return to queue; inspect decision | Approved/gate still blocked/superseded; “No approved submissions” | Q,L; no assuming all gates opened from approval alone |
| L09 Rejected / Lab | What needs correction or retest? · status/queue | Rejected package, reason, actor, allowed next action and original readings | Begin permitted retest/correction; inspect history | Rejected/retest requested/resubmitted; “No rejected submissions” | Q,L; no delete-and-replace history |
| L10 Incoming Material / Lab; independent acceptor per D09 | Is this material ready for this batch? · queue/draft readiness | Draft batch/material, true collection time, required tests/parameters, recorded/accepted status, missing requirements | Lab records/submits; separate acceptor accepts only when permitted; view readiness | Needed/testing/submitted/accepted/rejected/policy unresolved; “No incoming-material request” | N; no combined record-and-self-accept or route excluding Lab |

## Manager and GM screens — extended authority, not first-release UI

First-release product workstations are Admin, Operations and Lab. These rows define the Manager/GM authority surfaces so the backend contracts stay coherent; they are not built in the first release unless explicitly brought into scope. First-release lab decisions reach users with supervisor authority through Operations (S05).

| ID / screen / role | Dominant question and entry | Required information | Primary action; secondary actions | States; empty state | Backend; what must not appear |
|---|---|---|---|---|---|
| M01 Decisions / Manager | Which requests need my authorization? · sign-in/attention | Extension/deviation subject, reason/proof, policy, prior decisions and baseline/actual impact | Approve/reject permitted request; inspect batch | Pending/blocked/decided/expired; “No requests awaiting your decision” | X,D; no GM action or direct planned-end editing |
| G01 Control Tower / GM | Where is production exposed and what must I decide? · sign-in | Plant/batch variance and forecast basis, pending GM decisions, protected exceptions | Open required decision; inspect plant/batch | Normal/attention/unknown forecast; “No active batches or pending decisions” | B,X,Q,R,D; no invented completion forecasts |
| G02 Decision / GM | Can I authorize this specific request? · tower/attention | Subject/package, evidence, requester/recorder, manager decision if required, policy and immutable plan | Approve/reject with reason; inspect history | Awaiting manager/ready/decided/incomplete/stale; “No pending decision” | X,Q,O; no bypassing manager order, self-approval or hidden override |
| M02 Extension Request / authorized requester | What extra allowance am I requesting and why? · task/exception | Original planned end, actual state, requested hours/reason/evidence, policy | Submit request; cancel if permitted/view status | Draft/invalid/pending/effective/rejected/expired; “No extension requested” | X; no changing planned end or pretending request is approval |
| M03 Extension History / management/requester scope | What allowance was authorized? · request/Batch | Requested/approved hours, manager and GM decisions, effective dates, original planned end, authorized end, actual end | Inspect decision; permitted cancellation/request | Pending/effective/rejected/cancelled/expired; “No extension records” | X,B; no collapse of baseline variance into authorized variance |

## Traceability and readiness

Every screen showing an action must show its owner and confirm server authorization, not infer it from menu membership. Batch Detail → Assignment is the explicit answer to “where is batch work allocation?” Lab Queue → Incoming Material is the required missing draft-batch lab entry. Supervisor Lab Status → Decision is the approval handoff; it must not be a disguised technician queue.

Acceptance scenarios reference screen IDs. Proposed screen availability is not a claim these routes currently exist. Screen implementation waits for model approval and required backend corrections.
