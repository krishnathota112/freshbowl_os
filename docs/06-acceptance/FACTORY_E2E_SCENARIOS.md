# Factory end-to-end acceptance — reconciliation review draft

13 September 2026 · **Specification only; none of these journeys was executed in this phase.** Passing TypeScript or reaching a completed counter is not factory acceptance. Use [screen IDs](../05-ui/SCREEN_SPECIFICATION.md), [roles](../02-roles/OWNERSHIP_VISIBILITY_AUTHORITY.md), [gaps](../00-product/MUSHROOMOS_PRODUCT_MODEL.md#critical-gap-register) and [decision IDs](../01-process/MUSHROOMOS_PROCESS_MODEL.md#reconciliation-and-factory-decision-register).

## Test conditions and evidence

Use an explicitly identified nonproduction environment and a clearly marked demo batch with approved identity. Do not delete previous batches or relabel real operations as fixtures. Use six distinct accounts for Admin, Supervisor, Operator, Lab, Manager and GM, plus another worker for ownership tests. Credentials never enter screenshots or reports. Freeze the approved SOP version/configuration and relevant policy revision in the run manifest.

Every scenario record must include environment, batch/version, actor, starting state, action time, server response, resulting persisted state, UI capture and linked audit/evidence IDs. Report PASS, FAIL or BLOCKED with reason. A blocked policy/contract is not a pass. Before/after comparisons must use server records, not only screenshots. Direct API negative checks must exercise the same invariants as screens in an authorized test environment.

Use genuine captured evidence and actual measured/readable test values for a factory demonstration. Automated fixtures may use explicitly labelled synthetic values only in a separate test run; they must never be presented as real sampling. Long holds require real elapsed server time or a separately isolated test mechanism authorized for testing. Do not backdate actuals or use placeholder images to make the real demo appear complete. Record device capture and server receipt separately.

## A · Create a new batch and expose allocations

**Preconditions:** approved selectable version, explicit required material/configuration inputs and D10 readiness policy; permitted crew/resources. G01 must be corrected before this can pass.

**Actors/screens:** Admin A01→A02→A06/A13→A05→A04; Lab L10 when prerequisites require it.

**Steps:** choose exact version; enter identity/H0/timezone; complete material roles/quantities/options/scopes; generate; inspect included/excluded activity reasons; complete incoming-material workflow; assign each required production and lab occurrence; allocate declared resources; validate; review; activate.

**Expected:** server rejects incomplete inputs and readiness; valid generation matches that configuration's expected occurrence set, not a universal 110 count. Activation freezes reviewed plan/version/H0; Batch → Assignment displays every owned activity and unassigned blockers. Operator and Lab see only their relevant owned work, including any draft incoming request.

**Negative checks:** empty configuration, missing material role, unsupported scope, duplicate identity, missing assignee, occupied resource, stale review after edit, unauthorized activation, repeated click/concurrent activation. No partial active batch or duplicate occurrences.

**Proof:** request/response, validation findings, generated occurrence list, assignees, resource state, baseline before/after activation and activation audit. Links trace batch→activity→person.

## B · Add an ongoing batch honestly

**Preconditions:** D13 approved; real historical source facts and supported onboarding contract. Until then BLOCKED, not bypassed with generic completion RPCs.

**Actors/screens:** authorized onboarding actor A03→A04; Lab supplies attested history where needed.

**Steps:** identify real batch/version/H0; record verified current position and each known historical fact with source; mark missing intervals unknown; validate supported state; review proposed cutover; submit once.

**Expected:** actual occurrence and recorded-at times remain distinct; old facts are not generated from planned times. Current work/gates reflect verified history only. Unsupported state yields an actionable refusal and retains draft input.

**Negative checks:** unknown H0/version, unsupported mid-hold state, future/contradictory timestamps, missing proof, retry, ordinary operator attempting historical entry. No invented complete lab records or accepted sample collected at guessed H0−1h.

**Proof:** original source, entered facts and unknowns, actor/reason/time history, validation and verified live position after cutover.

## C · Operator executes an assigned task

**Preconditions:** active valid batch, assigned eligible work, required resource and evidence definitions.

**Actors/screens:** Operator O01→O02→O03→O05.

**Steps:** open owned task; Start; capture/upload/bind/retrieve before evidence; perform work and record required values/resource usage; capture required after evidence; Finish.

**Expected:** server stamps normal actuals; missing required evidence blocks completion; UI shows persisted Done only after server success; history identifies performer and proof.

**Negative checks:** other operator, Lab/Admin execution attempt, blocked task, missing bound evidence, duplicate Start/Finish, concurrent completion, future/stated operator timestamps, upload success without binding and binding with wrong batch. No silent actual overwrite.

**Proof:** actual history, evidence object/metadata/bind/retrieval, assignment, refusal responses and completion event.

## D · Lab executes and submits a checkpoint

**Preconditions:** assigned checkpoint with correct version/map/scope, required tests and evidence; G03/G05 corrected; D09 policy available.

**Actors/screens:** Lab L01→L02→L03/L04→L05→L06→L07.

**Steps:** collect/open correct sample with true provenance; request required tests; record each reading/observation with unit/method/spec; retain out-of-range results and reasons; upload/bind proof; submit complete package; move to another batch while waiting.

**Expected:** one traceable sample/test/result chain per required subject. Submission records a reviewable package; it does not approve or automatically release a gate. Failed values can be recorded without being passed.

**Negative checks:** missing sample, missing test/result, wrong checkpoint map/pile/batch, missing evidence, stale/superseded result, forged collection date, unauthorized user, duplicate retry. Direct completion call must reject the same missing package the UI rejects.

**Proof:** sample/activity association, required/current result coverage, evidence retrieval, submission identity/state/time, queue transition and unchanged downstream gate.

## E · Supervisor observes Lab without owning it

**Preconditions:** at least one testing checkpoint and one submitted package; D15 visibility approved.

**Actors/screens:** Supervisor S01→S04→S07; Lab L01.

**Steps:** find lab status from Home/Batch; inspect technician, test/package state and affected production; compare supervisor personal work with Lab queue.

**Expected:** lab work remains owned by Lab; Supervisor gets context and only authorized decision actions. Viewing does not reassign, start or submit anything. Unknown turnaround is labelled unknown rather than overdue.

**Negative checks:** view-only Supervisor attempts lab execution without delegation; unrelated worker reads restricted context; shared queue mistaken for personal assignment.

**Proof:** unchanged assignment/audit after reading, both queue memberships and denied mutation.

## F · Independent permitted lab decision

**Preconditions:** D09 signed, complete valid submitted package, authorized approver distinct from recorder; G04 corrected.

**Actors/screens:** configured Supervisor S05 or GM G02; Admin A09 oversight.

**Steps:** open package; inspect required readings/specs/proof and any failed/retest history; enter reason; approve or reject according to policy.

**Expected:** decision binds to the reviewed current submission and stores actor/verdict/reason/server time. Rejection preserves original values and routes permitted retest/correction. Admin sees status without acquiring decision authority.

**Negative checks:** Lab self-approval, same person switching role, zero-result package, unsubmitted activity, missing evidence, stale package after retest, wrong approver, blank reason, duplicate/concurrent verdicts. Numeric acceptance is tested separately according to D09 and must not silently substitute for this decision.

**Proof:** reviewed package identity, distinct actor, persisted decision and prior history, denied calls and resulting lab queue state.

## G · Gate opens only when every required condition holds

**Preconditions:** version-bound entry gate with known lab/evidence/rest/resource predicates; valid decision from F for one predicate.

**Actors/screens:** system evaluation; Supervisor S04/S07 and Operator O04 observe.

**Steps:** observe blocked gate; fulfill one prerequisite at a time; refresh authoritative status after decision; satisfy remaining conditions through valid operational paths.

**Expected:** approval alone does not open unrelated/unsatisfied gates. Only affected batch/scope advances. Enabled rules are enforced on direct start calls. If a current prerequisite is invalidated by retest/new rejection, the gate closes as defined without rewriting prior valid actuals.

**Negative checks:** approval for other pile/map/batch, superseded result, dev-clock advance used to bypass real rest, direct release attempting bypass, absent resource/evidence.

**Proof:** rule/subject, before/after gate reasons and server refusals, decision/result linkage, actual successor readiness. If work already started before later invalidation, demonstrate approved exception policy rather than inventing rollback semantics.

## H · Next task becomes eligible and stays correctly allocated

**Preconditions:** G satisfied, successor explicitly mapped, independent parallel task still blocked for its own reason.

**Actors/screens:** Operator O01/O04; Supervisor S02; Lab queue where successor is lab work.

**Steps:** refresh queues after gate evaluation; open eligible successor; Start using assigned person; inspect parallel stream.

**Expected:** correct scoped successor becomes Ready; unrelated work does not advance. A same-pile Turner T2 waits eight actual hours after its own T1 end under current approved rule; no global pile barrier. Timed holds are system-owned.

**Negative checks:** wrong assignee, premature rest, client clock changed, another stream approved, stale ready UI after server hold.

**Proof:** predecessor/successor linkage, server eligibility/start response and queue update for correct owner only.

## I · Deviation, correction and operational exception

**Preconditions:** approved disposition/override policy; an actual failed/out-of-range/late event; current original baseline captured.

**Actors/screens:** Operator/Lab report; Supervisor S06; GM G02 for protected override where permitted.

**Steps:** record true event and reason; raise deviation; assign corrective action; perform and record proof; verify/resolve or escalate; use controlled override only if policy permits that specific exception.

**Expected:** failed result/original actual remains visible. Baseline unchanged. Hold/release respects all other conditions. A correction is linked to its original fact with actor/reason; a resolution is not deletion.

**Negative checks:** worker edits actual, silent result replacement, release bypasses protected gate, Supervisor attempts GM-only override, missing reason/evidence.

**Proof:** deviation/corrective/verification events, original and superseding facts, protected decision and unchanged plan.

## J · Extension request and authorization

**Preconditions:** D14 approved and captured; current observed chain is Manager then GM, both required. Capture original planned end and actual.

**Actors/screens:** authorized requester M02; Manager M01; GM G02; M03/Batch.

**Steps:** request justified hours/proof; Manager decides; GM decides when required; inspect effective allowance and forecast; exercise permitted cancellation/expiry as separate cases.

**Expected:** request alone changes no authorization. Under the two-stage policy, manager approval alone is not effective. Show planned end, approved extension, authorized end and actual end distinctly; original variance remains unchanged by authorization. Rejection/expiry/cancellation retains history.

**Negative checks:** GM before Manager under strict policy, unauthorized requester, cap/evidence violation where defined, duplicate decisions, post-completion request when forbidden, direct plan edit, cancelled allowance still effective.

**Proof:** policy revision, both decisions, request history, four time values and baseline hash/field comparison before/after.

## K · Author, review and publish a new SOP version

**Preconditions:** D01/D03–D12 decisions resolved for affected recipe, D12 governance approved; complete authoring/publication contract exists. Do not test using an invented new version code on live data.

**Actors/screens:** authorized editor/reviewer/publisher A10/A11.

**Steps:** copy approved version into explicitly named test draft; apply approved changes as data; inspect stage/graph/role/lab/evidence/resource diff; validate; review exact revision; publish; separately select for future batches if authorized.

**Expected:** draft isolated from original; graph validation covers cycles/references/durations/options/convergences; invalid revisions cannot publish. Published content frozen, provenance recorded. Recomputed milestones reflect graph semantics, not a manual global470 replacement.

**Negative checks:** unresolved required rule, cyclic edge, missing lab binding, bad duration range, changed draft after review, duplicate/concurrent publish, direct published-child mutation, new draft editing shared immutable child.

**Proof:** source/draft identities, graph diff, structured validation/review evidence, publication event and denied mutation attempts.

## L · Historical batch remains intact after publication

**Preconditions:** batch on old version with real recorded work/results/evidence/decisions; K publishes a different version.

**Actors/screens:** Admin/Supervisor Batch A04/A12; authorized new-batch creator A02.

**Steps:** capture old version graph and batch configuration/baseline/actual/result/spec/gate references; publish/select new version; reopen old batch/history; create separate test batch choosing new version; compare.

**Expected:** old graph interpretation, planned times, actuals/corrections, lab specs, evidence and decision history unchanged. New batch uses explicitly selected new version. Catalogue selection and archive do not migrate existing drafts or active runs silently.

**Negative checks:** old batch reads current-catalogue recipe, shared lab/evidence rules mutate old interpretation, archived version cannot be retrieved, draft is silently repointed.

**Proof:** before/after canonical field comparisons and reference identities, old/new screen captures and audit demonstrating no hidden historical rewrite.

## Cross-cutting acceptance

| Test | Required outcome / evidence |
|---|---|
| Offline/retry | Same stable action ID on repeated delivery; one effect; device capture and server receipt both retained; stale gate never authorizes start locally; reconnect denial preserves pending data with reason. Currently blocked by G09 |
| Role isolation | All six roles and second same-role worker; reads follow D15, writes follow action/subject/state; direct API call does not bypass screen guard; account switching clears cached authority/data |
| Failure at every persistence stage | Upload failure, metadata failure, bind failure, decision failure and refresh failure are distinct; no Done/Approved from optimistic state; retry does not duplicate |
| Clock/timezone | Factory timezone retained for H0; display refresh uses server basis; browser/dev-clock change cannot bypass rest or create collection history; unspecified lab SLA remains unknown |
| Demo authenticity | All evidence retrieved and linked; all completed lab occurrences have legitimate required sample/results; no synthetic fixture presented as production; terminal status uses approved closure policy |
| Accessibility/navigation | Each role reaches owned work/decision without knowing URLs; keyboard-labelled actions, readable phone context/errors, no hidden critical blocker, no false completion |

## Release decision

No scenario is marked passed by this document. A future run must include its evidence and any unresolved decision/contract blockers. Model approval, factory SOP approval and implementation acceptance are separate sign-offs. Complete this documentation review first; implementation and real demo execution require the next explicitly authorized phase.
