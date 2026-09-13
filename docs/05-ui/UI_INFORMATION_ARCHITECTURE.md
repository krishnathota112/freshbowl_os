# UI information architecture — reconciliation review draft

> **Scope update:** the first release now follows the FINAL library's Admin, Operations/Supervisor and Lab surfaces. Consolidate the Operator task navigation below into Operations; keep shared oversight distinct from owned work and preserve supporting Manager/GM decisions. The two-choice Supervisor/Lab APK login does not remove Admin or backend roles. See [library review](../04-audit/FINAL-LIBRARY-REVIEW-2026-09-13.md) and [delivery plan](../03-mission/PROJECT-DELIVERY.md). The table below remains the earlier conceptual role map, not six required first-release menus.

13 September 2026 · Navigation follows user jobs. This specifies information placement using the existing visual system; it does not redesign components.

## Proposed primary navigation

| Role | Primary destinations | Contextual destinations, not additional competing main menus |
|---|---|---|
| Admin | Home · Batches · Attention · SOPs | New Batch/Add Ongoing on Home and Batches; Batch → Plan Review/Assignment/Resources/Lab/History; Approvals as oversight within Attention |
| Operations (operator, supervisor) | **All:** My Work, with Do Now · Upcoming · Waiting · Done filters. **With supervisor authority:** Attention · Active Work · Lab Status · Batches | Task → required evidence/readings/issue; batch context as needed; permitted Approvals and Exceptions from Attention; Lab Status opens read-only packages; no administration navigation |
| Lab | Lab Work, with Ready · In Progress · Retest · Waiting · Done filters | Checkpoint → sample/readings/evidence/submit; incoming draft-batch requests included; Approved/Rejected are statuses, not separate apps |
| Manager — *extended authority, not first-release UI* | Decisions · Batches · Resources | Extension/deviation decision detail, variance and history |
| GM — *extended authority, not first-release UI* | Control Tower · Decisions · Batches · Plant | Lab approval/extension/override detail as authorized; SOP publication only when designated |

These are proposed labels and grouping, not approved permission expansions. Account/profile/help/sign-out remain common utilities. No generic “Tasks” item for Admin. No primary technician Lab Queue in Operations merely to expose approval or status.

**Operations is one product workstation. Operator and Supervisor are not separate application experiences. Backend authorization remains capability-specific.** ([role model](../02-roles/OWNERSHIP_VISIBILITY_AUTHORITY.md#operations-workstation--product-direction-13-september-2026)) Operator and supervisor share one shell, navigation shape and My Work. Supervisor-authority destinations are added to that workstation for users whose backend role holds the authority; they are never shown to an operator and never granted by the navigation itself.

**First-release scope** (user direction, 13 September 2026): the product workstations are **Admin, Operations and Lab**. Manager and GM are **extended authority roles**: their backend authority is preserved, but their rows above are not first-release UI and gain no screens or navigation unless explicitly brought into scope.

## Shared versus personal

Personal work lists answer “what must I do?” and are scoped to assignee/delegated ownership. Shared batch/plant views answer “what is happening?” and can include work owned by others within visibility policy. Decision lists answer “what must I authorize?” and are scoped to decision authority and subject state. The same activity can appear as status in several views while having one execution owner.

Every cross-context link retains batch identity, scope, selected filter and return destination. A status link opens read-only context unless the user also owns an allowed action. Switching accounts discards role-specific cached data. Direct links use both server read authorization and mutation checks.

## Primary journeys

```text
Admin Home → New Batch → configuration/materials → generated plan
 → readiness → Assignment/Resources → Plan Review → Activate → Batch

Admin Home → Add Ongoing → verified facts and unknowns
 → supported-state validation → review/cutover OR explicit unsupported state

Batch → Assignment → activity + assignee + lab owner + status
Batch → Lab Status → current package → permitted Decision → server gate status

Operations My Work → Task → Start → required evidence → Finish → Done
Lab Work → incoming/active checkpoint → Sample → Readings → Evidence → Submit
 → Waiting; technician returns to other work
Operations Attention (supervisor authority) → Lab Decision → reasoned verdict
 → updated downstream status

Exception → Extension Request → Manager Decision → GM Decision when required
 → authorized allowance shown beside original plan and actual

SOPs → Draft/copy → Edit → Review/Validate → Publish
 → available for new batches; historical batch retains old version
```

## Batch page hierarchy

1. Identity: batch code, exact SOP version, status, H0 and factory timezone.
2. Now / Next / Blocked: actual work, eligible successor and named reason/owner.
3. Work allocation: activity, stream/scope, role and assigned person; explicit unassigned count.
4. Lab: sample/test/submission/approval states and downstream impact.
5. Plan versus actual: original baseline, approved extension, authorized end and forecast basis; unknowns remain unknown.
6. History: actuals/corrections, evidence, decisions, reassignment and movements.

For a draft, readiness and plan review take precedence over execution. For historical/terminal batches, records and provenance replace Start/Finish controls. There is one shared batch story with role-dependent actions, not separate inconsistent batch implementations.

## Current route implications (no changes made)

- `/admin/batch/start` is the main intake and `/admin/batch/new` is an older richer flow. Reconcile them into one supported product contract before choosing route redirects.
- `/admin/batch/:id/prepare` and `/admin/batch/:id/schedule` currently exclude Lab. Adding a link to these URLs cannot fix incoming-material access; L10 requires an authorized reachable workflow and draft queue source.
- `/lab/queue` currently admits Lab and Supervisor. Proposed Supervisor entry is Lab Status; keep exceptional delegated execution explicit rather than relying on a shared default menu.
- `operator` gets the field shell and `supervisor` the management shell (`isFieldRole`). The Operations workstation requires one shared shell with authority-dependent sections; this is a UI change, not a role change.
- `/lab/approvals` is a management-visible route. Its actions must derive from decision authority, independent actor and submitted-package validity, not management membership alone.
- Existing BatchPage embeds BatchDetail; legacy graph rendering must be corrected within the common batch story, not duplicated into another new dashboard.

## Navigation/state acceptance

At every hop the user can identify the batch, what state it is in, who owns the next step and where to return. Empty lists explain whether there is no work, no matching filter or no assignment. Failure/offline states never navigate as if a mutation succeeded. A supervisor can find a permitted lab decision from Home without knowing a URL; a lab technician can find incoming work while the batch is draft; an Admin can inspect work allocation without seeing worker execution buttons. These are required outcomes, not yet demonstrated implementation facts.
