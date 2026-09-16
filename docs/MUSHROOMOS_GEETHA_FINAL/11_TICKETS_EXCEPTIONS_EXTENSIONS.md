# 11 — TICKETS, EXCEPTIONS AND EXTENSIONS

## Purpose

Define how MushroomOS records late/exception situations without rewriting the original plan.

## What the application must do

Ticketing exists to explain why normal execution could not proceed as expected.

The chain is:
task due → what happened → reason → ticket → review/authorization → separate extension/deviation if applicable → forecast impact.

The original planned time stays visible. Actual delay stays visible. Approved extension stays separate.

A non-critical parallel extension may have little or no final forecast impact. A critical dependency extension can move true downstream dependents. Multiple upstream extensions combine through the dependency graph rather than by blindly adding everything to the batch.

Do not create a second ticket system or duplicate competing late-time formulas.

## Acceptance / proof

DEMO/TEST proves:
- reason is recorded;
- authorization is recorded when required;
- original baseline remains intact;
- extension does not erase actual lateness;
- forecast changes only where the dependency graph supports the change;
- audit shows who decided.

## Detailed source context

The following sections from the consolidated Geetha source are included below. They are implementation context, not permission to invent a different product.


# 29. TICKETS, LATE WORK AND EXTENSIONS


Use the existing ticket model.

Do not create a second ticket system.

The flow is:

```text
Task due / exception
→ reason
→ evidence where required
→ ticket
→ decision/authorization
→ granted hours or deviation
→ effective due/exception state
→ completion
→ forecast impact
→ audit
```

## Extension semantics

The original plan stays visible.

The extension is separately recorded.

The actual completion is separately recorded.

The forecast is separately calculated.

### Critical dependency extension

If A controls B:

```text
A extended
→ B may move in forecast according to actual dependency
```

### Non-critical parallel extension

If C is independent:

```text
A extended
→ C does not move merely because A moved
```

### Multiple upstream extensions

Only applicable dependent/converging work should incorporate the combined authorized/actual effects.

Never use a single “worst slip” number for the whole batch.

---

