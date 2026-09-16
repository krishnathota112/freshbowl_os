# 05 — PROCESS VARIANTS: LOCAL VS STANDARD/PUNJAB PADDY

## Purpose

Make material selection drive the actual generated process path.

## What the application must do

Admin chooses the actual paddy material at batch setup. Admin must not separately choose the number of soaks.

Standard/Punjab:
Bale preparation → Soak 1 → Soak 2 → Soak 3.

Local:
Bale preparation → Soak 1 → Soak 2 → NO Soak 3.

This rule belongs in process/domain data and plan generation. Do not create Soak 3 and hide it in React.

Removing Local Soak 3 makes the Paddy branch ready earlier, but the whole batch only becomes earlier if the dependency graph/critical path allows it.

## Acceptance / proof

Create a DEMO Standard/Punjab batch and prove Soak 3 exists. Create a DEMO Local batch and prove Soak 3 does not exist, has no assignment, no evidence requirement, no dependency, and no forecast/due time.

## Detailed source context

The following sections from the consolidated Geetha source are included below. They are implementation context, not permission to invent a different product.


# 9. LOCAL PADDY VS STANDARD/PUNJAB PADDY


This is a confirmed process variant requirement.

## Standard / Punjab Paddy

```text
Bale preparation
→ Soak 1
→ Soak 2
→ Soak 3
```

## Local Paddy

```text
Bale preparation
→ Soak 1
→ Soak 2
→ NO SOAK 3
```

This must happen at **plan-generation/process-data level**.

Do NOT merely hide Soak 3 in the Admin UI.

Do NOT create Soak 3 and mark it invisible.

Do NOT create a React-only `if (local)` branch.

The selected material at batch creation must determine the generated process path.

### Local timing implication

Using the documented Standard/Punjab example:

```text
H74 → H86  Bale preparation = 12h
H86 → H108 Soak 1            = 22h
H108 → H136 Soak 2           = 28h
```

Therefore Local Paddy's documented branch becomes ready at approximately H136 instead of H160.

**This does NOT automatically mean the whole batch becomes 24h shorter.**

The system must follow the dependency graph.
If the other branch required for the H160 convergence is still not ready until H160, the convergence
remains H160 and the Local Paddy branch simply becomes ready earlier and waits.

The acceptance test is:

```text
DEMO Standard/Punjab batch
→ plan generated
→ Soak 3 exists

DEMO Local batch
→ plan generated
→ Soak 3 does not exist
→ no assignment for Soak 3
→ no evidence requirement for Soak 3
→ no dependency on Soak 3
→ no forecast/due time created for Soak 3
```

---

