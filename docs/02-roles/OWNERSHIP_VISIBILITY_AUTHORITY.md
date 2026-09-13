# Ownership, visibility and authority — reconciliation review draft

13 September 2026 · **Proposed product policy, not a permissions migration.** Confirm unresolved authority with the factory before implementation. Current backend permissions are evidence of what works today, not proof of the intended policy.

## Four independent concepts

- **Ownership:** accountable person/role expected to perform or resolve an item.
- **Visibility:** information a person may inspect for their job.
- **Authority:** server permission for a specific action on a specific subject in a specific state.
- **Queue:** an ordered presentation of owned work or decisions. Visibility alone never adds an item to a personal queue.

## Operations workstation — product direction, 13 September 2026

**CONFIRMED as product direction** (user instruction, 13 September 2026). Canonical wording — use it verbatim wherever this is stated:

> **Operations is one product workstation. Operator and Supervisor are not separate application experiences. Backend authorization remains capability-specific.**

This is a workstation decision, not a permissions change. It does **not** mean operator and supervisor are the same backend role.

- **One workstation, one shell.** One entry, one navigation shape, one vocabulary for batches and work. No separate navigation shells for operator and supervisor.
- **Backend authority stays distinct.** `operator` and `supervisor` remain separate `app_role` values with different server authority. They are not merged, and no supervisor-only permission is granted to `operator`.
- **Capabilities appear only when the server grants them.** Within the workstation, supervisor-capability sections and actions — hold/release/return, numeric result acceptance and lab submission decision (both D09), deviation disposition, override request, vessel allocation — are shown only to a user whose role holds that authority. Their absence for an operator is authority, not a different product.
- **Separation of duties survives inside one workstation.** A person may not release, accept or approve work they performed or recorded, whatever their role (distinct-actor rule; server gap G04).
- **Not decided here.** Who in the factory holds supervisor authority, and whether an individual operator can be delegated a capability without changing role, remain D15. Per-person capability grants would need a backend change; this direction does not.
- **Rejected interpretation.** "One backend role" — every operational user receives supervisor authority — would be an authorization change that removes the release/approval separation. It requires its own explicit decision and is not implied by one workstation.

In the matrix and queue table below, the **Supervisor** and **Operator** columns describe backend capabilities inside the single Operations workstation.

## Ownership summary

An operator owns assigned production execution. Lab owns assigned sampling/testing. The supervisor monitors both and owns operational attention/decisions only where authorized. Admin controls preparation/configuration. Manager and GM own designated management decisions. The server owns timed holds and gate evaluation; no person is assigned fictitious work to make a rest expire.

## Action vocabulary

| Capability | Exact meaning |
|---|---|
| OWN | Accountable for the work item, not automatically every possible action |
| VIEW | Read permitted subject/context; does not permit mutation |
| START | Begin assigned eligible work or a sample/test workflow |
| EDIT | Change a draft or enter unsubmitted data; never overwrite frozen baseline or old actual/result |
| SUBMIT | Commit owned work/package/request for subsequent processing |
| ACCEPT | A specific numeric-result or deviation disposition; never an ambiguous synonym for APPROVE |
| APPROVE / REJECT | Record a verdict on an identified submitted package/request |
| HOLD / RELEASE | Authorized operational pause/resume; release cannot bypass unsatisfied gates |
| OVERRIDE | Explicit controlled exception allowed by policy, with reason/evidence and audit; no baseline rewrite |

All actions also require subject visibility, batch/version compatibility, allowed state and server validation. Normal worker actions require assignment or an explicit recorded delegation. Distinct-actor checks apply to approvals, not merely role-name differences. A person switching roles must not approve their own work.

## Proposed complete role/action matrix

Cells list allowed capabilities from the vocabulary above. `—` means no authority proposed for this item. `VIEW*` means contextual scope requires D15 sign-off. `?Dxx` marks a decision-dependent capability and **must not be implemented as granted**. OWN does not bypass other listed restrictions.

| Item/action surface | Admin | Supervisor | Operator | Lab technician | Manager | GM |
|---|---|---|---|---|---|---|
| Factory overview / active batches | OWN, VIEW | VIEW | VIEW* assigned context | VIEW* lab context | VIEW | VIEW |
| New batch identity/configuration | OWN, VIEW, EDIT, SUBMIT | VIEW | — | VIEW* incoming work | VIEW | VIEW, EDIT, SUBMIT |
| Generate/review/activate draft | OWN, VIEW, SUBMIT | VIEW; SUBMIT ?D15 | — | VIEW* readiness | VIEW | VIEW, SUBMIT |
| Ongoing batch onboarding | OWN, VIEW, EDIT, SUBMIT ?D13 | VIEW, SUBMIT ?D13 | — | VIEW* attested lab facts | VIEW | VIEW, SUBMIT ?D13 |
| Assign/reassign production work | OWN, VIEW, EDIT, SUBMIT | OWN, VIEW, EDIT, SUBMIT | VIEW own assignment | — | VIEW | VIEW, EDIT, SUBMIT |
| Assign/reassign lab work | VIEW, EDIT, SUBMIT ?D15 | VIEW, EDIT, SUBMIT ?D15 | — | VIEW own/shared scope ?D15 | VIEW | VIEW, EDIT, SUBMIT ?D15 |
| Production activity execution | VIEW | VIEW; OWN, START, EDIT, SUBMIT only explicitly assigned/delegated | OWN, VIEW, START, EDIT, SUBMIT assigned | — | VIEW | VIEW |
| Production evidence capture/bind | VIEW | VIEW; EDIT, SUBMIT if authorized performer | OWN, VIEW, EDIT, SUBMIT assigned | — | VIEW | VIEW |
| Lab sample/testing/reading execution | VIEW | VIEW; execution only explicit delegation ?D15 | VIEW* needed outcome | OWN, VIEW, START, EDIT, SUBMIT assigned | VIEW | VIEW |
| Incoming-material sample/results | VIEW | VIEW; execution delegation ?D15 | VIEW* readiness | OWN, VIEW, START, EDIT, SUBMIT | VIEW | VIEW |
| Numeric reading acceptance | VIEW | ACCEPT ?D09 | — | ACCEPT ?D09, never self-approval | VIEW | VIEW; ACCEPT ?D09 |
| Lab submission review | VIEW | VIEW | VIEW* downstream status | VIEW own package/status | VIEW | VIEW |
| Lab approval decision | VIEW | OWN, VIEW, APPROVE, REJECT ?D09 | — | VIEW status; no own approval | VIEW; APPROVE, REJECT only if explicitly designated ?D09 | OWN, VIEW, APPROVE, REJECT ?D09 |
| Retest following rejection | VIEW | VIEW; request/disposition ?D09 | VIEW* downstream status | OWN, VIEW, START, EDIT, SUBMIT under approved retest policy | VIEW | VIEW |
| Raise a deviation | VIEW | OWN, VIEW, EDIT, SUBMIT | OWN, VIEW, EDIT, SUBMIT for performed work | OWN, VIEW, EDIT, SUBMIT for lab work | VIEW | VIEW, EDIT, SUBMIT |
| Corrective action / verification | VIEW | OWN, VIEW, EDIT, SUBMIT, ACCEPT under policy | VIEW, EDIT, SUBMIT assigned corrective work | VIEW, EDIT, SUBMIT assigned corrective work | VIEW; decision ?D14 | VIEW, ACCEPT under policy |
| Operational hold/release/return | VIEW | OWN, VIEW, HOLD, RELEASE, REJECT with reason | VIEW affected work | VIEW affected work | VIEW | VIEW; override separately |
| Controlled override | VIEW | VIEW, SUBMIT request | VIEW affected work | VIEW affected work | VIEW | OWN, VIEW, APPROVE, REJECT, OVERRIDE ?D14 |
| Extension request | VIEW | OWN, VIEW, EDIT, SUBMIT ?D14 | OWN, VIEW, EDIT, SUBMIT ?D14 | OWN, VIEW, EDIT, SUBMIT ?D14 | VIEW | VIEW |
| Manager extension decision | VIEW | VIEW | VIEW own request | VIEW own request | OWN, VIEW, APPROVE, REJECT ?D14 | VIEW |
| GM extension decision | VIEW | VIEW | VIEW own request | VIEW own request | VIEW | OWN, VIEW, APPROVE, REJECT ?D14 |
| Extension cancellation/expiry | VIEW | SUBMIT cancellation if permitted ?D14 | SUBMIT own cancellation if permitted ?D14 | SUBMIT own cancellation if permitted ?D14 | VIEW | VIEW; cancellation ?D14; expiry is server action |
| Actual correction | VIEW, SUBMIT reasoned correction under policy | VIEW, SUBMIT reasoned correction under policy | VIEW history; no time editing | VIEW history; lab retest separate | VIEW, SUBMIT reasoned correction under policy | VIEW, SUBMIT reasoned correction under policy |
| Resource allocation/release | VIEW | OWN, VIEW, SUBMIT under declared constraints | VIEW; SUBMIT usage if assigned | VIEW* context | VIEW | VIEW |
| Draft SOP authoring/copy | OWN, VIEW, EDIT, SUBMIT ?D12 | VIEW/reviewer ?D12 | VIEW instructions | VIEW lab requirements/reviewer ?D12 | VIEW/reviewer ?D12 | VIEW, EDIT, SUBMIT ?D12 |
| SOP review/publication | VIEW, SUBMIT publication ?D12 | VIEW; APPROVE/REJECT review only if designated ?D12 | — | VIEW; review only if designated ?D12 | VIEW; review only if designated ?D12 | VIEW, SUBMIT publication ?D12 |
| Historical batch / audit | VIEW | VIEW | VIEW* own facts | VIEW* own facts | VIEW | VIEW |
| Batch cancellation/closure | VIEW, SUBMIT ?D13 | VIEW, SUBMIT ?D13 | VIEW context | VIEW context | VIEW | VIEW, SUBMIT ?D13 |
| Evaluate/release process gate | VIEW only | VIEW only | VIEW only | VIEW only | VIEW only | VIEW only; approved override still processed by server |

No row permits editing a published recipe, frozen plan, old result, original evidence or audit event. UI omission is usability, not security. Server refusal must apply to direct/replayed calls as well.

## Personal queue, shared visibility and authority surface

| Role | Personal queue | Shared visibility | Authority surface |
|---|---|---|---|
| Admin | Preparation/review items requiring Admin action; no worker task feed | Factory, batches, assignments, readiness and decision status | Batch setup, assignments, SOP control; only authorized decisions |
| Supervisor | Assigned operational work plus owned attention items; not every lab test | Active work, lab progress, resource conflicts, blocked dependencies | Operational holds/release/return and permitted approvals |
| Operator | Assigned eligible/upcoming/waiting/done production work | Context necessary for that batch/task and blocker | Task Start/Finish, evidence and permitted deviation/request actions |
| Lab | Assigned samples/checkpoints, retests, draft-batch incoming work | Explicit shared lab pool if D15 permits; own approval status | Sample/readings/evidence/submit; independent acceptance policy pending |
| Manager | Requests requiring manager decisions | Batches, variance, resources, decision history | Manager extension/other explicitly configured decisions |
| GM | Requests requiring GM decisions | Plant, batch, lab and authorization state | GM extension, controlled override and configured lab/publication actions |

An approval is a separate work item from the lab checkpoint. A supervisor's Lab Status may link to a read-only checkpoint package without opening the technician workstation. A supervisor doing exceptional lab work must have explicit authority/delegation and cannot independently approve that same package.

## Current implementation differences

- Admin Tasks navigation has already been removed. Supervisor still has Lab Queue as primary navigation, which does not express the proposed contextual model.
- Operator and supervisor currently receive **different shells**: `isFieldRole` routes `operator` to the field shell and `supervisor` to the management shell with Control Room (`src/App.tsx`, `src/lib/auth.ts`). This is an implementation gap against the single Operations workstation; closing it is UI work and needs no role change.
- `v_my_work` grants broad management visibility; it is not sufficient as a personal queue definition. `v_lab_queue` is shared across active lab activities and has no assignee predicate. It excludes draft incoming work.
- Preparation and schedule routes admit Admin/GM/Supervisor; numeric acceptance admits Lab/Supervisor. This is the immediate reason Lab cannot find its incoming acceptance action and Admin encounters a refusal.
- `decide_lab_submission` currently falls back to GM/Supervisor when the unresolved approval settings are disabled. That fallback must not be documented as final factory policy.
- Current `accept_lab_result` allows Lab/Supervisor without a distinct-recording-actor check. Current lab completion/decision checks do not establish a valid reviewed package.
- `hold_activity`, `release_activity` and `return_activity` inspect Supervisor authority; `gm_decide_override` inspects GM; `correct_actual` admits Supervisor/Manager/GM/Admin. The proposed matrix preserves those distinctions while requiring subject/state checks.
- Some writers lack uniform role/ownership checks. Merely having a matrix or hidden button does not repair them.

## Handoff acceptance

For a named batch, show activity → owner → status → blocker → decision owner → next eligible task. Reassignment retains previous/new owner and reason. It does not duplicate execution ownership to achieve visibility. Another user with the same role cannot mutate an assigned item unless the approved policy explicitly permits it. A decision by a person who recorded the package must be rejected even after switching role. Test all six roles, denied direct RPC calls and shared/personal queue membership; see [acceptance scenarios](../06-acceptance/FACTORY_E2E_SCENARIOS.md).
