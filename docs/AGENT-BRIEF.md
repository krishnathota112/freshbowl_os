# MushroomOS — engineering entry and Claude handoff

## 0. FINAL BUILD DIRECTIVE — authoritative (user, 14 Sep 2026)

This section is the top-level instruction for every agent. Where anything below it, or any other document, conflicts with it, **this section wins**. Before any change ask: *is this a core product capability, an Admin configuration, or a process-version data change?*

```text
MUSHROOMOS — FINAL BUILD DIRECTIVE

This is the authoritative product direction for completing MushroomOS.

Do not redesign the product architecture again.
Do not create another architecture.
Do not create another competing process model.
Use the existing repository and database.

==================================================
1. PRODUCT DEFINITION
==================================================

MushroomOS is a factory process execution and monitoring system.

Its CORE is fixed.

The FACTORY SOP is replaceable/versioned data.

ADMIN CONFIGURATION is where factory-specific setup belongs.

The system must allow the factory to change its SOP without requiring
developers to rewrite React/business logic for every process change.

The core product must remain stable while process definitions change.

==================================================
2. FIXED PRODUCT CORE
==================================================

The fixed core includes:

- authentication
- role/permission model
- Admin web
- Supervisor mobile
- Lab mobile
- GM mobile
- batch lifecycle
- batch creation
- existing-running-batch onboarding
- process versions
- process execution
- task state
- parallel streams
- dependencies/gates
- passive holds
- evidence
- native camera
- readings/checklists
- timestamps
- performer accountability
- Lab submission
- GM approval
- extensions / late tickets
- monitoring
- audit/history

Do not redesign these because the SOP changes.

==================================================
3. ADMIN IS THE SYSTEM CONFIGURATION AUTHORITY
==================================================

ADMIN is responsible for:

A. USERS
- create real accounts
- assign department/role
- provide real login credentials
- manage active/inactive access

Current operating scale is small:
approximately 13 Supervisors and 4 Lab technicians,
plus GM and Admin users.

B. SOP / PROCESS AUTHORING
Admin must eventually be able to create a new process version
without developer code changes.

The authoring layer should configure:
- stages
- activities/tasks
- streams
- sequencing/dependencies
- durations
- holds
- readings
- Lab checkpoints
- evidence requirements
- gates/approvals
- skip rules
- process-specific instructions

Draft -> validate -> review -> publish.

Published versions are immutable.

For the current delivery, generic SOP authoring does not need to be
fully feature-rich, but the core architecture must keep the process
as data rather than React conditionals.

C. BATCHES
Admin:
- creates new batch
- enters starting/pre-H0 information
- activates new batch
- onboards existing/running batch
- sets current position per stream
- monitors all batches

D. MONITORING
Admin can inspect:
- batch
- process/version
- current stage/activity
- progress
- actual timestamps
- performer
- readings
- evidence
- Lab state
- GM state
- blocked reasons
- extensions/tickets

==================================================
4. ROLE BOUNDARIES
==================================================

ADMIN
Configure + onboard + monitor.

SUPERVISOR
Physical production execution only.

LAB
Post-H0 laboratory execution only.

GM
Lab approval + process progress oversight.

Do not use UI hiding as the only permission system.
Server-side permissions remain authoritative.

Admin does not perform Supervisor work.
Supervisor does not onboard batches.
Lab does not perform production tasks.
GM does not perform production/Lab execution.

==================================================
5. NEW BATCH
==================================================

For a NEW batch:

Admin:
- select process/version
- enter batch information
- enter required initial/pre-H0 material information
- enter actual H0 when appropriate
- prepare/activate

Pre-H0 values are starting material information, not ordinary
post-H0 Lab approval.

Do not force Admin through a generic Lab approval workflow for
these starting values.

==================================================
6. EXISTING RUNNING BATCH
==================================================

This is the canonical onboarding model.

Admin is the only role responsible for onboarding.

The physical batch already exists and is already running.

Admin tells MushroomOS:

- which process version applies
- where each relevant stream is CURRENTLY
- whether a stream has not started

Example:

Main/CM stream -> current activity
Paddy stream -> current activity
Turner -> current activity
Bunker -> current activity
Tunnel -> not started/current activity

Do not ask Admin to reconstruct the original start time of the
physical batch unless the process specifically requires it.

Do not ask Supervisor to participate in onboarding.

Do not fabricate historical:
- timestamps
- performers
- photos
- readings
- task completion

Earlier physical work is BEFORE TRACKING context.

The selected activity/position becomes the live tracking entry point.

MushroomOS starts tracking from that position.

The selected current activity must be available for live execution
unless a confirmed factory rule explicitly says otherwise.

Supervisor then sees the next valid work.

==================================================
7. PROCESS MODEL
==================================================

The factory SOP is structured data.

Never implement process-specific rules by hardcoding stage/activity
logic in React.

React renders backend/process answers.

A process version contains:
- stages
- streams
- tasks
- durations
- dependencies
- holds
- readings
- evidence
- Lab
- approvals
- unresolved items

When an SOP changes:
create a new process version.

Never rewrite an active batch baseline.

==================================================
8. PROCESS CHANGE CASCADE
==================================================

When a process activity changes, review its impact on:

- upstream/downstream tasks
- streams
- convergence
- dependencies
- holds
- durations
- Lab checkpoints
- readings
- units
- evidence
- approvals
- onboarding positions
- monitoring
- planned timing
- forecast
- unresolved questions

Do not only edit the visible timeline row.

Example:
if another hopper pass is inserted, review every downstream
dependency/timing/Lab/evidence implication before publishing the
new process version.

==================================================
9. TASK DECOMPOSITION
==================================================

The current SOP must be understood and decomposed into executable
tasks based on what the source actually says.

For each task determine:
- stage
- stream
- activity
- instruction
- human work vs passive hold
- predecessor/dependency
- duration if known
- required readings
- checklist
- evidence
- Lab dependency
- skip policy
- unresolved/conflict

Do not invent missing values.

A '+' in a source sentence does not automatically mean separate tasks.
Split only where the source clearly represents distinct executable work.

==================================================
10. LAB DATA TYPES
==================================================

Do not render every Lab field as a numeric input.

Parameter type must follow the Lab definition:

numeric -> numeric input
observation -> observation/text input
controlled qualitative -> predefined choices

For example:
Smell = observation
Colour = observation
Spring/squeeze = controlled qualitative observation

Spring/squeeze values are:
Too dry / Normal / Too wet / Dripping

Do not accept arbitrary numbers for those fields.

==================================================
11. SUPERVISOR EXPERIENCE
==================================================

Supervisor opens the mobile app and asks:

"What work can I do now?"

My Work shows executable production work across all active batches.

Human work:
Start
-> required before evidence
-> work
-> reading/checklist
-> required after evidence
-> Finish

Passive hold:
no manual Start
confirm when condition is met
hold timing is process-derived

Supervisor must never need to understand database/gate terminology.

Use normal factory language.

==================================================
12. LAB EXPERIENCE
==================================================

Lab opens the mobile app and asks:

"What tests do I need to do?"

Queue:
batch
checkpoint
sample
reading
observation
evidence
submit

Lab work is post-H0.

==================================================
13. GM EXPERIENCE
==================================================

GM mobile app contains two main areas:

LAB APPROVALS
- submitted results requiring GM decision
- approve/reject
- reason

PROGRESS
- read-only view of batch progress
- current stage
- current activity
- Lab waiting/approval state
- blocked/deviation/late state

Do not give GM production-execution controls.

==================================================
14. ADMIN MONITORING
==================================================

Admin monitoring must answer:

What happened?
When?
Who did it?
What was measured?
What evidence was captured?
What did Lab report?
What did GM decide?
What is blocked?
What needs attention?

For each activity show where available:
- activity
- stage
- status
- performer
- actual start
- actual finish
- reading
- observation
- before photo
- after photo
- Lab state
- GM state
- ticket/extension
- blocked reason

Use real persisted evidence.
No mock/fake production data.

==================================================
15. DEMO / TEST
==================================================

Demo data must be clearly DEMO/TEST.

Use real server timestamps during live demo execution.

Do not fabricate historical production execution.

A test batch should allow this complete test:

ADMIN
-> create/onboard DEMO batch
-> enter required initial material information
-> establish current position
-> confirm

SUPERVISOR
-> see task
-> Start
-> native camera
-> before evidence
-> reading/checklist
-> after evidence
-> Finish

LAB
-> checkpoint
-> sample
-> reading
-> photo
-> submit

GM
-> approval

ADMIN
-> monitor batch
-> see actual photo
-> performer
-> timestamps
-> reading
-> Lab result
-> GM decision

==================================================
16. CURRENT COMPLETION CRITERIA
==================================================

The product is considered READY FOR FIELD TEST when:

1. Admin can create a new batch.
2. Admin can onboard an existing running batch without Supervisor help.
3. Admin can set current position per stream.
4. Supervisor can see the correct executable work.
5. Supervisor can use the native phone camera.
6. Evidence is actually stored and linked correctly.
7. Real performer and server timestamps are stored.
8. Required readings/checklists persist.
9. Lab can complete a real checkpoint.
10. GM can approve/reject where required.
11. Admin monitoring shows the complete trace.
12. Multiple concurrent batches work.
13. Unresolved process dependencies remain blocked.
14. No role is being asked to perform another role's work.
15. Android APK works on a real phone.
16. Admin web works against the real Supabase project.

==================================================
17. ENGINEERING BEHAVIOUR
==================================================

Do not:
- create another architecture
- create another process engine
- create duplicate ticket systems
- create duplicate evidence systems
- create another onboarding model
- hardcode process-specific logic into React
- invent factory rules
- fabricate historical execution
- add unrelated features
- refactor unrelated files

Before changing code:
inspect current source, current database contracts and current process
data.

Reuse existing infrastructure wherever it already satisfies the contract.

Only add a backend capability when the current system genuinely cannot
represent an approved requirement.

==================================================
18. FUTURE SOP CHANGES
==================================================

Future SOP changes are expected.

Therefore:

FACTORY CHANGE
-> new process version
-> Admin/editor updates process data
-> validate
-> review
-> publish
-> new batches use new version
-> existing active batches retain their old baseline

The core MushroomOS application remains unchanged.

==================================================
19. EXECUTION MODE
==================================================

From this point forward, stop re-litigating settled architecture.

Work in this order:

PHASE 1
Audit current repository/database against this directive.

PHASE 2
Identify only concrete mismatches.

PHASE 3
Fix the highest-value mismatches required for field use.

PHASE 4
Run the complete DEMO/TEST workflow.

PHASE 5
Build Android APK and test on device.

PHASE 6
Freeze for field testing.

At each phase report:
- what is already correct
- what is missing
- what was changed
- what test proves it

Do not invent a new project plan unless the current system cannot satisfy
this directive.

If a requirement is genuinely unresolved, ask only one concise question
at a time and explain exactly which implementation decision it changes.

The objective is COMPLETION, not continued analysis.
```

---


13 September 2026. **Single starting point for Claude Code and all coding agents.** This is a router and operating contract, not another product specification. The user wants the entire application completed using the existing implementation and these documents.

## 1. Product and session scope

**Latest supplied library:** `T:/exisiting_freshbowl/MushroomOS_Agent_Library_FINAL`. Read [FINAL Library Review](04-audit/FINAL-LIBRARY-REVIEW-2026-09-13.md) before using it. First release is Admin + one Operations/Supervisor workstation + Lab, not separate Operator and management products. Backend role/approval boundaries remain distinct. Stakeholder APK has Supervisor/Lab quick-login choices. Earlier screen detail is reused under this explicit release mapping; inaccurate workbook claims identified in the review must not become process data.

MushroomOS manages button-mushroom compost production at Fresh Bowl Horticulture. It must explain what should have happened, what happened, when it diverged, who did it, what proves it and who authorized a difference.

Published process version → batch → generated plan → activated frozen baseline → actuals + lab/evidence → decisions → server gates → next eligible work → management traceability.

Process is versioned data. PROCESS-2026C's 470-hour first-stream standard and 474-hour complete span are version-specific, not global constants. Parallel work is not summed into elapsed duration. Ownership, visibility, authority and queues are separate.

This handoff prepares implementation; it does not itself execute the build or approve unresolved factory decisions. Follow the current user's instruction. Once the user authorizes implementation, older reconciliation documents saying “stop” do not prohibit that newly authorized work. Their unresolved policy choices still remain unresolved.

## 2. Fresh session reading order

1. Read this brief and the current user request; identify review, build, testing or deployment scope.
2. Read [Project Delivery](03-mission/PROJECT-DELIVERY.md), its current checkpoint and dependencies. Read [Product Model](00-product/MUSHROOMOS_PRODUCT_MODEL.md) once for the domain, then changed sections on subsequent sessions.
3. Inspect branch and `git status --short`. The repository root contains `docs/` and `mushroomos/`; the app root is `mushroomos/`. Preserve existing dirty/untracked work. Do not confuse nested workspace folders.
4. Route the selected task using the table below. Check [Findings](03-mission/FINDINGS.md) and [comparison evidence](05-ui/CONTEXT_VS_IMPLEMENTATION_2026-09-13.md). Inspect current source and relevant database/test contracts; do not assume snapshots are fresh.
5. State concrete scope and validation, identify decision-dependent work, and complete independent authorized work. Do not ask again for permission already given.
6. Finish the slice through server behavior, user workflow and appropriate verification. Update the delivery checkpoint and task status so another session can resume without this conversation.

Do not restart by writing another master specification. Do not rebuild from scratch. Do not finish at a visually complete screen with a broken underlying workflow.

## 3. Authority and canonical owners

Authority depends on the question, not a single ladder that ranks database contents above factory policy.

| Question | Canonical owner | Boundary |
|---|---|---|
| Approved factory values/policy | Dated process-owner ruling with applicable version; [STANDARD](01-process/STANDARD.md) and schedule.json for their version | A conflict among live sources must be recorded, not silently chosen |
| Unresolved factory choices | D01–D15 register in [Process Model](01-process/MUSHROOMOS_PROCESS_MODEL.md); [OPEN-QUESTIONS](01-process/OPEN-QUESTIONS.md) is linked source evidence | Add answers with owner/date/source/version; do not start another ledger |
| Actual database behavior | Fresh read-only catalog/functions/policies, dated [SCHEMA](SCHEMA.md), audit snapshots | Observation is not approval; migrations describe intent |
| Product entities and batch workflows | [Product Model](00-product/MUSHROOMOS_PRODUCT_MODEL.md) | Respect proposed/approved status |
| Graph vocabulary and current inventory | [Process Model](01-process/MUSHROOMOS_PROCESS_MODEL.md) | Its 110-record inventory is observed evidence, not the revised recipe |
| Version lifecycle and publication | [SOP Version Model](01-process/SOP_VERSION_MODEL.md) | Includes historical version isolation |
| Draft editing and Excel conversion | [Authoring and Import](01-process/PROCESS_AUTHORING_AND_IMPORT.md) | References lifecycle; does not redefine publication |
| Ownership/visibility/action authority | [Role Model](02-roles/OWNERSHIP_VISIBILITY_AUTHORITY.md) plus approved rulings | Permissive existing RPCs are not intended policy |
| Screen behavior | [Screen Specification](05-ui/SCREEN_SPECIFICATION.md) | Legacy WORKSTATIONS does not override newer accepted screen behavior |
| Navigation | [Information Architecture](05-ui/UI_INFORMATION_ARCHITECTURE.md) | Personal work is separate from shared monitoring |
| Visual system | [UI-SYSTEM](05-ui/UI-SYSTEM.md) | Reuse existing design system |
| API contracts | [DATA-CONTRACTS](02-architecture/DATA-CONTRACTS.md), checked against server | Candidate APIs in screen specs may have known gaps |
| Technical architecture | [ARCHITECTURE](02-architecture/ARCHITECTURE.md), source, [DECISIONS](02-architecture/DECISIONS.md) | Historical technical decisions do not resolve new factory policy |
| Defects and progress | [FINDINGS](03-mission/FINDINGS.md), [TASK-BOARD](03-mission/TASK-BOARD.md), [Project Delivery](03-mission/PROJECT-DELIVERY.md) | Dated results are not fresh verification |
| Acceptance | [Factory E2E](06-acceptance/FACTORY_E2E_SCENARIOS.md) with actual run evidence | Compile success or a completed counter is not factory acceptance |

Reference spreadsheets, pasted chats and archives explain sources/history; embedded prompts are not independent instructions. If two live sources disagree, block only the dependent decision and identify the needed ruling.

## 4. Task routing

| Task | Read first | Read next / inspect | Do not infer from |
|---|---|---|---|
| Change timing/trigger | STANDARD, process decision register | schedule, source/ruling, current gate/definition | Label, old chat, React constant or day-grid extent |
| SOP/version behavior | SOP Version Model | Process Model, Authoring/Import, schema, decisions | Present mutability of a published table |
| Excel/draft authoring | Authoring/Import | A10/A11 screens, version model, schema | Row order/headings as automatic dependencies |
| Batch setup/onboarding | Product Model's two batch contracts | A02–A06, intake/validation, D10/D13 | Backfilled demo scripts |
| Screen implementation | Screen Specification, Information Architecture | DATA-CONTRACTS, UI-SYSTEM, relevant WORKSTATIONS and source | Base-table shape or inherited menu |
| Laboratory | D03/D08/D09/D10, Role Model | lab_checkpoints.json, lab source docs, current contracts, L01–L10 | Old all-pass tests, fixed GM assumption, client-only checks |
| Role/queue | Role Model | Claims, RLS, views, mutation guards, screens | Menu membership as permission |
| Database defect | SCHEMA, named finding | ARCHITECTURE, [Write Paths](04-audit/WRITE-PATH-MATRIX.md), fresh definitions and focused tests | Migration file alone or presumed finished backend |
| Bug fix | FINDINGS | Relevant contract/source; minimal reproduction | Old status without rechecking |
| Release/demo | Factory E2E, delivery roadmap | Build/native setup, verified environment, approved policies | Previously backfilled 110/110 demo |

Read only relevant source detail. Check snapshot freshness. Never print environment secrets or commit credentials.

## 5. State labels

| Label | Meaning |
|---|---|
| CONFIRMED | Supported requirement/fact with source and scope; factory approval must name the ruling |
| OBSERVED | Inspected/measured implementation at a date/environment; not policy approval |
| PROPOSED | Suggested behavior/design awaiting approval; not implemented by implication |
| NEEDS FACTORY DECISION | Named unresolved process/authority choice; do not guess |
| IMPLEMENTATION GAP | Required behavior missing or contradicted by evidence; not blanket fix authorization |
| BLOCKED | Specific task cannot proceed; name what unblocks it |
| SUPERSEDED | Replaced for a stated subject; retained as history |

Legacy GREEN/AMBER/RED/UNRESOLVED are audit evidence/severity labels, not approval states. “Test passed” must name the test/environment; it does not mean factory acceptance passed.

## 6. Engineering invariants

- Published versions and activated baselines are immutable. Draft edits are explicit. Corrections/retests preserve original facts and reasons. Extensions are separate authorizations, never baseline edits or erased variance.
- Read through view contracts; write through authorized RPCs/server functions. A missing contract is an explicit backend task, not permission for direct writes or client-side business rules.
- Validate role, assignment, subject, state, current submission and required proof on the server. Hiding a button is not enforcement. Formatting is allowed in React; business thresholds, timing/gate eligibility and verdicts are authoritative server behavior.
- Never fake readings, photos, evidence, approvals, timestamps or successful demos. Missing data is not completed. Label synthetic fixtures and demo records honestly.
- Normal execution uses server time. Historical entry needs its own approved proof/authority path. Do not derive collection time from H0. Keep offline device capture separate from server receipt.
- Analysis is read-only. Inspect test setup before running tests: this repository contains scripts/tests that mutate configured Supabase data. Do not run migrations, seeds, demo runners or the full suite against an unverified environment.
- A named approved defect may require backend changes. The historical “backend frozen/UI only” mission does not prove current integrity. Design/test required migrations in an authorized test environment; obtain any missing production deployment authorization before applying them there.
- Respect existing authorization and scope. Do not repeatedly ask for reversible work already approved; do not infer factory policy or production deployment permission from a feature description.
- Preserve others' working-tree changes. No blanket reset, deletion, reseed, cleanup, push or deployment without applicable authorization.

## 7. Full-project delivery

The project includes Admin setup, assignments/resources, operator execution/capture, Lab samples/tests/retests/evidence, independent decisions, server gates, Supervisor attention/exceptions, Manager/GM extensions, authoring/import/versioning, honest onboarding, traceability, offline reliability and web/Android acceptance. Follow [Project Delivery](03-mission/PROJECT-DELIVERY.md) *(not yet written)*. Those items remain project scope and must not be silently dropped.

**First release (user direction, 13 September 2026):** the product workstations are **Admin, Operations and Lab**. Manager and GM are **extended authority roles** — keep their backend authority intact, but build no Manager/GM screens or navigation unless the user explicitly brings them into scope. Extensions, management checkpoints and SOP authoring/import stay out of first-release UI until scoped.

Detailed rules remain in their canonical owners. **Operations is one product workstation. Operator and Supervisor are not separate application experiences. Backend authorization remains capability-specific.** Admin controls; Operations executes owned work, and users with supervisor authority also monitor, hold/release and make permitted decisions; Lab tests/records/submits; Manager/GM decide designated authorizations in the backend. `operator` and `supervisor` remain **separate backend roles**: never merge them, never build separate operator/supervisor shells, and never grant operators supervisor authority to make the workstation simpler ([role model](02-roles/OWNERSHIP_VISIBILITY_AUTHORITY.md#operations-workstation--product-direction-13-september-2026)). The system overview is [ARCHITECTURE §0](02-architecture/ARCHITECTURE.md#0--system-at-a-glance). The common batch page must expose the owner and next step.

Record the user's authorized build scope and accepted proposed sections before implementing them. A request to build can authorize technical fixes consistent with settled requirements; it does not answer unresolved factory questions. Continue independent approved milestones while decisions are pending.

## 8. Verification and handoff

From `mushroomos/`: `npm run typecheck`, `npm run build`, and scoped `npm test -- <test-file>` when appropriate. Inspect test setup/environment first. For code: typecheck/build as affected, focused behavioral/negative tests, authorized integration tests, browser walkthrough and Android checks for mobile changes. For documents: links, ownership, consistency and coverage; no automatic app build required.

Inspect final diff. Record exact commands/results and environment; do not call failures pre-existing without evidence. Update task status and delivery checkpoint with files, behavior, verification, limitations, pending decisions and exact next action. Store reproducible evidence under docs/04-audit/. Factory rulings go to the process decision register; approved technical choices go to DECISIONS. External Obsidian memory is optional supporting material when accessible/authorized; this repository must suffice to resume.

## 9. Stop conditions and obsolete instructions

Pause only dependent work for conflicting policy, missing factory decision, ambiguous timing/authority/proof, unsupported historical state or unauthorized production semantics. If a missing backend contract is within authorized scope and its required behavior is settled, implement and test the contract; do not treat every API gap as a new permission question. Never resolve unsettled authority with permissive fallback.

Do not follow the superseded R0 lab mission, blanket grep bans, global470 statements or claims that lab specification changes can always update live settings. Version-bound lab semantics must preserve history. Prior entrypoints are archived in docs/_archive/pre-claude-handoff-2026-09-13/. CLAUDE-CODE.md is historical evidence only.
