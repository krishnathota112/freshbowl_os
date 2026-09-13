# MushroomOS product model — reconciliation review draft

> **Release-scope update, 13 September:** the later supplied FINAL library targets Admin, one Operations/Supervisor experience and Lab for the first release, with Supervisor/Lab quick-login choices in the stakeholder APK. Reuse this domain model and detailed workflows under the [library applicability review](../04-audit/FINAL-LIBRARY-REVIEW-2026-09-13.md) and [delivery roadmap](../03-mission/PROJECT-DELIVERY.md); do not implement six separate first-release workstations. Backend roles/approvals remain distinct.

13 September 2026 · **Not approved for implementation.** This package records the proposed coherent product model and preserves unresolved factory decisions. It does not publish an SOP, grant permissions or change the application.

## Purpose

MushroomOS manages button-mushroom compost production at Fresh Bowl Horticulture. For every batch it must explain what should have happened, what actually happened, when it diverged, who did the work, what proves it and who authorized a difference. It supports concurrent batches, production execution, laboratory work, resource allocation and management decisions.

The core relationship is:

```text
Process definition → immutable published version → batch → generated draft plan
→ readiness and review → activation → frozen baseline
→ actual work + samples/readings + evidence → authorized decisions
→ server-evaluated gates → eligible downstream work
                                      ↘ deviations, extensions, forecast, audit
```

A plan does not prove work occurred. A result is not an approval. An approval does not bypass other gates. Visibility does not assign work. An extension does not erase lateness against the original baseline.

## Package and authority

| Document | Owns the definition of |
|---|---|
| [Process model](../01-process/MUSHROOMOS_PROCESS_MODEL.md) | Process vocabulary, all 110 current activity records and factory conflict register |
| [SOP version model](../01-process/SOP_VERSION_MODEL.md) | Version lifecycle, publication validation and historical isolation |
| [Role model](../02-roles/OWNERSHIP_VISIBILITY_AUTHORITY.md) | Ownership, visibility, action authority and personal queues |
| [Screen specification](../05-ui/SCREEN_SPECIFICATION.md) | Screen questions, actions, states and backend sources |
| [Information architecture](../05-ui/UI_INFORMATION_ARCHITECTURE.md) | Navigation and cross-role handoffs |
| [Factory acceptance](../06-acceptance/FACTORY_E2E_SCENARIOS.md) | Observable journeys and negative checks |
| [Prior comparison](../05-ui/CONTEXT_VS_IMPLEMENTATION_2026-09-13.md) | Evidence of current implementation gaps |

Evidence order is purpose-specific: a dated factory decision establishes intended process; the supplied workbook establishes what its author wrote; the saved deployed catalog establishes observed database behavior; source establishes current client behavior. None silently overrides the others. The chat and context pack propose a model; they are not signed factory rulings. `CONFIRMED` below means supported requirement or observed fact, not a claim that end-to-end enforcement passed. `NEEDS FACTORY DECISION` means no implementation may choose the answer. Proposed product choices are labelled **PROPOSED** until this package is approved.

Inputs: `T:/exisiting_freshbowl/gpt_chat.txt`, `context.txt`, canonical context-pack documents and its `Compost_SOP_31-08-2026_SOURCE.xlsx`, repository standard/schedule/brief/contracts, current source, and [read-only database snapshot](../04-audit/context-comparison-2026-09-13/database-readonly.json). The separately named `MUSHROOMOS_PROCESS_END_TO_END.md` was not found in the workspace or supplied ZIP; no contents are attributed to it. Workbook and supplemental definition details were reread for this phase. No new end-to-end run occurred.

Later source update: the FINAL library supplied the complete end-to-end and master PRD narratives, also located under `T:/exisiting_freshbowl/exisiting_freshbowl/docs_for_reading/`. They were read in the library review. The earlier “not found” statement describes the preceding inspection only. Source corrections and scope differences are recorded in that review, not silently merged.

## Entities and lifecycle

Conceptual entities do not imply one new table each. Reuse the existing family where it expresses the contract. Owners below are business accountabilities; the role matrix determines actual permission.

| Entity | Purpose and owner | Lifecycle | Immutable facts | Changeable facts and relationships | Source of truth / current mapping |
|---|---|---|---|---|---|
| Process definition | Factory's reusable recipe; process owner, administered by Admin | Established → versions evolve → retired catalogue entry | Stable identity of referenced definition | Name/description under control; contains versions | `process_catalogue` plus version family; exact identity split requires contract review |
| Process version | Exact approved recipe; process owner/publisher | Draft → review → validate → publish/frozen → archived | Whole published graph, timing, lab/evidence/resource/option semantics | Draft content only; catalogue selection separate | `process_definition`, `process_activity` and related definitions |
| Batch | One traceable production run; Admin prepares, supervisor operates | Draft → active → terminal; proposed verified closure | Version identity after plan commitment, activated H0 and baseline linkage | Assignments/resources via authorized events; terminal history retained | `master_batch`; `v_live_batch`; closure contract not established |
| Batch plan | Version instantiated using explicit batch inputs; Admin | Generate → validate → revise in draft → review | Reviewed revision must identify exact inputs | Draft regeneration invalidates prior review; generates activity instances | `batch_activity`, process configuration; current generator RPC |
| Baseline | Frozen expectation at activation; system | Created at activation → permanent | Planned offsets, instants, version/configuration provenance | None; related forecasts may change | Plan columns and plan-freeze trigger; complete snapshot boundary needs review |
| Actual | What happened and when; performer | Recorded → optionally superseded with reason | Original observation, actor and recording history | Correction creates traceable successor, not invisible history replacement | Execution RPCs, `v_actual_history`; current projection columns backed by correction audit |
| Evidence | Proof for a specified requirement; performer | Capture → upload → metadata → bind → retrieve | Original bytes/provenance and binding history | New evidence/correction under audited rules, not silent replacement | Storage + `evidence_media` + binding; `v_evidence_state` |
| Lab result | Measured value/observation for a test and sample; Lab | Test requested → measured → recorded → submitted/retested | Original result, units, method/spec context, actor | New result supersedes old; numeric acceptance distinct from gate decision | `lab_sample`, `lab_test`, `lab_result`; current/history views |
| Approval | Accountable verdict on a particular submission; configured approver | Pending → approved/rejected; later decision retained | Actor, subject/revision, verdict, reason, recording time | Subsequent decision is a new event; no self-approval | `lab_decision`, checkpoint decisions and extension decisions; exact subject-revision contract is a gap |
| Gate | Conditions that permit transition; system evaluates factory policy | Unsatisfied → satisfied; invalidated prerequisites can close it again | Referenced version rule for the batch | Derived state changes with evidence/results/rest/decisions | `gate_rule`, `evaluate_gates`, `advance_batch`, gate views |
| Deviation | Departure requiring attention and disposition; reporter then supervisor | Raised → investigated → corrective action → verified/resolved or escalated | Original departure and evidence | Audited corrective action/decision; never changes baseline | `v_deviation_open` and existing deviation RPCs |
| Extension | Authorized additional allowance; requester, Manager/GM decide | Requested → decisions → effective/rejected/cancelled/expired | Original request and decisions | New events only; allowance distinct from actual/plan | `extension_policy`, `v_extension_request`, forecast views |
| Audit | Trace who changed what and why; system | Append → retain | Event identity, actor, time and prior facts | No user edits; retention policy needs owner confirmation | Audit/event/correction records; `v_batch_event` |

Additional relationships: a batch contains scoped activity occurrences; an occurrence can have multiple samples, tests and evidence requirements. A reading must trace to its sample, checkpoint-map version, activity and batch. An incoming-material sample is batch-linked before an execution activity where appropriate; it must not disappear merely because a batch is still draft. Resource class belongs to the process; physical unit allocation belongs to actual operations. Scope/cardinality determines occurrences; a missing occurrence never means completed.

## New batch contract

1. Choose a selectable published version and unique batch identity; record H0 in factory timezone.
2. Capture prerequisites, material roles/quantities, optional branches and supported scope counts explicitly. Required input rules come from the version; zero/empty is not a universal default.
3. Generate the draft plan on the server. Report included/excluded activities and why; activity count is configuration-dependent, not globally fixed at 110.
4. Validate plan completeness, graph placement, required material acceptance and declared resource constraints. Assign people to execution work; timed holds have no invented performer.
5. Review the exact plan/configuration/version: parallel streams, lab workload, assignments, resources, H0 and end measures. A later edit invalidates that review.
6. Activate only after the server revalidates current inputs and review identity. Freeze the baseline atomically; repeated activation must not duplicate work.
7. Execution queues expose eligible owned work. Shared batch views expose all relevant states and the responsible person.

Current primary intake skips material/configuration choices; review identity and atomic activation preconditions are required capabilities, not existing claimed RPCs. Resource readiness means constraints actually declared by the selected SOP; unresolved loader/bunker policy must remain visible rather than invented as a new gate.

## Ongoing batch contract

Identify the real batch, actual H0, source process/version, verified current position, existing samples/evidence and supported historical facts. Mark unknown history explicitly. Keep actual occurrence time (if attested), entry time, source, actor and correction reason distinct. Do not generate photos, accepted results or inferred completion timestamps to fill gaps.

The normal operator workflow never edits timestamps. Existing privileged stated-time/correction functions do not prove support for arbitrary historical states. If the current backend cannot represent a verified onboarding state, show **Onboarding unsupported — contract decision required**, retain the draft information and do not activate or advance it. Onboarding authority, permitted proof and cutover semantics are decision D13 in the process register.

## Execution, timing and lab contract

Normal Start/Finish uses server recording time and authoritative eligibility. An assigned person may record evidence; the server checks ownership and role on every mutation. Completion requires all version-defined inputs, evidence and valid transitions. Holds elapse according to server rules rather than a user completing a timer. Display planned, actual, variance, approved extension and authorized end separately.

Lab progresses sample → required tests → current readings/observations → evidence → submit → independent decision. Submission freezes the reviewed package conceptually. Retests retain originals and invalidate stale decisions where applicable; the exact revision-binding mechanism is a backend gap, not an invented RPC. The technician may work on another batch while approval waits. Numeric acceptance and approval to open a gate require separate names and policies (D09). Rejection explains why and identifies the next authorized action. A failed reading is recordable; it is not silently converted into a pass.

Offline capture retains device time and a stable action identity. Server receipt remains authoritative for normal operational timing. Reconnect must not backdate work, double-submit records or open a gate locally. This is a required future capability; the present client has no demonstrated durable replay queue.

## Critical gap register

| ID | Why it matters / required behavior | Current evidence | Backend change? |
|---|---|---|---|
| G01 Batch completeness | Explicit inputs, complete expansion and reviewed readiness before activation | `intake.ts` sends empty config/roles; active 94-activity batch exists; validation lacks these requirements | Yes: validation/activation contract; plus intake UI |
| G02 False completion | Absence/unknown must be visible | BatchDetail legacy three-pile codes default missing rows to COMPLETED | Client correction; read projection may need additions |
| G03 Lab completion | Server rejects submission missing required sample/tests/current results/evidence | UI checks exist; `submit_activity` does not enforce lab package completeness | Yes |
| G04 Lab decisions | Decide only a valid submitted package; distinct authorized actor; stale decisions cannot release gates | `decide_lab_submission` lacks completeness/state/distinct-actor checks | Yes; D09 authority policy first |
| G05 Sample timestamps | Real collection/entry times and honest historical evidence | Prebatch client chooses min(now,H0−1h) | Client change plus server timestamp/history validation |
| G06 Queue separation | Personal assignment distinct from plant visibility; all mutations validate authority | Broad `v_my_work` management access and shared `v_lab_queue`; completion ownership enforcement incomplete in inspected body | Yes for contract consistency; UI navigation too |
| G07 Lab overdue | Reliable turnaround or explicit unknown | `v_lab_queue` returns today/retest and an unknown-turnaround explanation | Data/contract after D08; do not invent overdue now |
| G08 Extensions/deviations | Request, reasons, evidence, decisions, resolution and separate time numbers | Backend families exist; extensions lack action workflow in frontend | Primarily UI; verify RPC policy/idempotency before use |
| G09 Offline replay | One action has one durable effect after retry/reconnect | No durable client queue found; end-to-end replay not demonstrated | Client and server idempotency contract review |
| G10 SOP publication | Freeze entire graph; validate draft, review and publish | Catalogue/publication/activity freeze exist; full authoring and graph validation absent | Yes and UI |
| G11 Incoming lab reachability | Lab receives draft-batch work; authorized acceptance has a reachable screen | Acceptance controls on routes excluding Lab; Admin can reach controls but server refuses acceptance | UI plus draft-lab queue contract |
| G12 Honest onboarding/closure/demo | Unknown history retained; verified closure; identifiable demos | Historic scripts backfill; all 12 batches have is_demo=false; completed demos still active | Contract review and explicit data-management plan; no cleanup in this phase |

## Review and release gate

Approve the conceptual product and role/screen proposals separately from factory process choices. The [process decision register](../01-process/MUSHROOMOS_PROCESS_MODEL.md#reconciliation-and-factory-decision-register) records each unresolved item, owner and consequence. Approval should name document revision/date and decision IDs, with exact answers and scope. No response is an approval.

After approval, implementation should address G02/G01, then lab integrity and role routing, then agreed version changes and missing workflows, followed by acceptance. This is sequencing advice only. This phase ends with this package; no React changes, migrations, process publication or database cleanup are authorized by the package itself.
