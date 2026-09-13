# SOP version model — reconciliation review draft

13 September 2026 · Proposed lifecycle; publication policy requires approval. See [product model](../00-product/MUSHROOMOS_PRODUCT_MODEL.md) for evidence and approval rules.

## Identity and snapshot boundary

An SOP is a named family of factory procedures. A version is one fully specified recipe. Catalogue availability is separate from recipe content. Every batch pins an exact version and the lab/checkpoint/evidence/option definitions required to interpret that version. A current-catalogue pointer must never be consulted to reinterpret an existing batch.

Current mapping: `process_catalogue` and `process_definition` provide selection/version identity; `process_activity` holds activities; `gate_rule`, `evidence_requirement`, `resource_requirement`, `activity_variant` and laboratory definition/binding tables hold related semantics. This conceptual model does not create a second competing lab-definition family. Exact immutable boundary across shared tables needs backend design and proof.

## Lifecycle

```text
New from scratch OR copy a published version
→ Draft → Review → Validate → Publish → Frozen
     ↑        ↘ changes required ↗
     └──────── any changed content invalidates review/validation
Frozen → archive from future selection, retain for all historical references
```

Review and validation may repeat. Machine validation can run before review as feedback; publication requires successful validation of the exact reviewed revision. **Frozen is a property of published content, not a second editable state.** Review/reviewed revision is conceptual and not an existing DB status claimed here.

| Transition | Required inputs / authorized actor | Result and invariants |
|---|---|---|
| Create draft | Admin or authorized process editor; code/name/version lineage | New identity; blank graph is not selectable |
| Copy | Source published version and new identity | New editable graph with references remapped; source untouched |
| Edit | Authorized editor; draft revision | Timings, roles, branches, lab, evidence, resources editable as data; invalidate previous review |
| Review | Factory process owner and designated reviewers; change summary and conflicts | Record accepted/rejected changes and unresolved issues; reviewer identity not assumed from app role |
| Validate | Server against exact revision | Structured blocking errors and warnings; no frontend truth substitution |
| Publish | Approved publisher and matching reviewed/validated revision | Atomic freeze, publication actor/time and provenance; no partial published graph |
| Make selectable/current | Separately authorized catalogue action | Affects future batch selection only |
| Archive | Authorized catalogue owner | Unavailable for new selection; existing batches and version details still readable |

Current `publish_process_definition` admits Admin/GM. Whether factory review needs a separate publisher or reviewer is D12; the document does not grant a new role. Current publication does not demonstrate this complete transition contract.

## Validation requirements

1. Unique identity and scoped activity codes; nonempty activities and consistent stages.
2. Every activity has scope/cardinality, role or explicit system-hold ownership, type and authoritative timing basis.
3. All dependency/resource/lab/evidence/branch references resolve inside the version boundary or immutable external version.
4. Graph has no impossible cycles; every required convergence identifies its actual prerequisites. A rolling fill must not become a global completion barrier.
5. Standard duration is consistent with permitted range and declared planning method. Missing required durations block publication; optional/unresolved scenarios must be explicitly excluded or referred for decision.
6. Every controlled option has defaults only when approved, valid combinations and expansion rules. No material names or UI constants substitute for material-role definitions.
7. Required evidence and laboratory tests bind to the right scope and checkpoint map. Gate approval references the intended submission and authorized policy.
8. Stage order, resource constraints and conditional branches are feasible. Actual physical machine allocation remains operational, not an invented permanent pile-to-machine relationship.
9. Compute named milestones from graph semantics. Show first-stream standard, final discharge span and relevant parallel deadlines separately; do not sum concurrent work or use day-grid extent as duration.
10. Expose differences from source version: added/removed work, dependencies, durations, lab/evidence, resource constraints, roles and resulting milestones. Unresolved required factory decisions block publishing the affected recipe.
11. Revalidate at publication to prevent edits between validation and publish. Concurrent/repeated publication cannot create inconsistent identities or duplicate effects.

## Stage 1B change example

Proposed new recipe content: retain mixing, make existing Stage 1B hopper the first pass, introduce second pass with duration equal to first pass, then rest range 8–10 hours with standard 10. Under the current first-pass value, each pass would be four hours; this is a conditional interpretation, not approval of a new schedule.

The equality is a recipe constraint maintained and validated in the version, not React arithmetic. The new version must recalculate affected dependencies, parallel convergence deadlines, lab/evidence bindings and named end milestones. Stage 0A's existing second hopper is unrelated. New version identifier, downstream timing, required extra testing and resource implications remain D01/D12. Do not announce a revised total by merely adding/subtracting hours from 470.

## Existing batches

Publishing or selecting a new version changes neither draft batches already pinned to an older version nor activated/historical baselines. **PROPOSED:** a draft may deliberately switch version only through an explicit regenerate-and-review operation with provenance; never silently. Active batches stay on their original version. Exceptions during a run use deviations/authorized decisions, not repointing historical activity rows.

Archive does not delete recipe data, samples, evidence, approvals or audit. For every historical batch, the product must reproduce its version, configuration, planned values, actual/correction history, lab specification, evidence and approvals after later publication. A copy must not share mutable child definitions that allow later drafts to mutate history.

## Present implementation and proof required

The snapshot has PROCESS-2026C v1 published/current (470 standard, 474 span), PROCESS-2026B v1 published/selectable (536 computed span with unresolved stated envelope), and ROUTE-2026A archived. No draft in that snapshot establishes a tested authoring flow.

`fn_definition_is_frozen` protects published process-activity mutation. Publication currently checks activity presence, placement and envelope agreement; it does not implement the full validation list above. Other definition tables have different protections. No complete draft/copy/edit/review UI or RPC workflow was found. Keep names for missing contracts descriptive until backend design; do not invent callable APIs in screens.

Acceptance K/L in [factory scenarios](../06-acceptance/FACTORY_E2E_SCENARIOS.md) must prove old graph, plans, actuals, results and gate interpretation unchanged, including attempted direct mutation, shared-reference leakage and concurrent publication.
