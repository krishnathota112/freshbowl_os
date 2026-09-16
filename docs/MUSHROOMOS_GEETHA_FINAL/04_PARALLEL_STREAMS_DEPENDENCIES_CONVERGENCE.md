# 04 — PARALLEL STREAMS, DEPENDENCIES AND CONVERGENCE

## Purpose

Define the dependency graph behavior that prevents unrelated delays from propagating through the batch.

## What the application must do

The process must never be treated as one long checklist. Parallel work means multiple branches can progress independently. A downstream activity becomes eligible only when its required planned time, predecessors, gates and readiness conditions are satisfied.

A delay must propagate only to true dependents. At a convergence, the downstream activity waits for all required predecessors and therefore the latest required predecessor controls the earliest eligible point.

Example:
Paddy ready H160 + mixture ready H165 → convergence earliest eligible H165. Paddy remains ready at H160 and should say it is waiting for the mixture.

Turner P1–P6 remain independent. P1 delay must not move P2–P6 or unrelated Paddy work.

Forecast must use the remaining dependency graph, not a batch-wide worst-slip number.

## Acceptance / proof

DEMO/TEST proves:
- one branch can be late while unrelated branches remain unchanged;
- convergence waits for all required predecessors;
- same-pile Turner dependencies stay within the same pile;
- forecast explanation names the causal dependency.

## Detailed source context

The following sections from the consolidated Geetha source are included below. They are implementation context, not permission to invent a different product.


# 7. THE PROCESS IS A DEPENDENCY GRAPH, NOT A FLAT LIST


Conceptually:

```text
                              H0
                               │
             ┌─────────────────┼──────────────────┐
             │                 │                  │
             ▼                 ▼                  ▼
           PADDY          BAGASSE / CM           LAB
             │                 │                  │
        weigh/prep        weigh/prep              │
             │                 │                  │
           soaks          conditioning            │
             │                 │                  │
             └────────────┬────┴────────────┬─────┘
                          ▼                 │
                    CONVERGENCE ◄──────────┘
                          │
                          ▼
                   HOPPER / REST
                          │
                          ▼
                    YARD / TURNER
                          │
                  ┌───────┼────────┐
                  ▼       ▼        ▼
                  B1      B2       B3
                  │       │        │
                  └───────┼────────┘
                          ▼
                       TUNNEL
                          │
                          ▼
                    GROW ROOM
```

Parallel means independently executable within its own rules.

Parallel does NOT mean optional.

Convergence means downstream work must wait for every required predecessor that actually controls
that downstream activity.

Example:

```text
PADDY ready H160
MIXTURE ready H165
        ↓
Convergence eligible H165
```

Paddy remains “ready H160 / waiting for mixture” rather than having its baseline silently rewritten
to H165.

---


# 30. DEPENDENCY-DRIVEN FORECAST MODEL


The desired model is:

```text
IMMUTABLE BASELINE
        +
ACTUAL EXECUTION
        +
REAL DEPENDENCY GRAPH
        +
GATES / READINESS
        +
AUTHORIZED EXCEPTIONS
        ↓
DYNAMIC FORECAST
```

For every task, the backend should be able to explain:

- baseline start
- baseline finish
- actual start
- actual finish
- current state
- dependency basis
- waiting-for
- blocked reason
- projected start
- projected finish
- delay/variance basis

## Convergence

For a downstream task requiring A and B:

```text
Projected eligibility = MAX(required predecessor readiness times)
```

Then apply other gates/readiness conditions.

Do not rewrite A or B's baseline just because the downstream waits for the other.

---

