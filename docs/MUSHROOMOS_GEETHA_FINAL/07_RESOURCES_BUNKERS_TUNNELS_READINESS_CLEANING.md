# 07 — RESOURCES: BUNKERS, TUNNELS, READINESS AND CLEANING

## Purpose

Make physical resource state part of process eligibility without creating a second occupancy system.

## What the application must do

MushroomOS must know which exact bunker/tunnel/resource is needed, whether it is ready, in use, or needs cleaning, and whether it can safely be allocated.

Cleaning is resource-level, not a generic batch task. The resource becomes READY only after the factory-defined cleaning/readiness requirements and required evidence are satisfied.

Allocation must use exact physical resource identity and existing occupancy/concurrency mechanisms. A dirty or occupied resource cannot be allocated. A different ready resource remains usable.

Do not invent final cleaning checklist content or unresolved cleaning timing rules. Those remain factory decisions until confirmed.

## Acceptance / proof

DEMO/TEST proves:
- a used bunker becomes unavailable/needs cleaning;
- incomplete cleaning cannot produce READY;
- completed cleaning + required evidence produces READY;
- exact allocation then succeeds;
- a second batch cannot double-book the same resource;
- other bunkers/tunnels are unaffected.

## Detailed source context

The following sections from the consolidated Geetha source are included below. They are implementation context, not permission to invent a different product.


# 16. BUNKERS — CONVERGENCE AND RESOURCE IDENTITY


The system must distinguish physical bunker identity from a generic “bunker” label.

The current Turner grouping is:

```text
P1 + P2 → B1
P3 + P4 → B2
P5 + P6 → B3
```

Admin and Supervisor must be able to identify the actual physical bunker/resource number at the
relevant process.

A generic activity code is not enough if the factory needs the real bunker number.

### Important distinction

There is an earlier single-fibre bunker stage after conditioning/rest and later combined compost
B1/B2/B3 stages.

Do not collapse these into one resource/use concept.

---


# 17. RESOURCE READINESS — BUNKER/TUNNEL/MACHINERY CLEANING


Physical resource readiness is part of the operational model.

A resource should not be considered allocatable simply because an activity row exists.

The intended resource lifecycle is approximately:

```text
AVAILABLE / READY
      ↓
ALLOCATED / IN USE
      ↓
NEEDS CLEANING
      ↓
CLEANING IN PROGRESS
      ↓
READY
```

## Bunker / tunnel cleaning

Cleaning is a **resource-level** concern, not a hidden batch task.

The system should support:

- exact bunker/tunnel identity
- readiness state
- upcoming need
- cleaning requirement
- assignment
- checklist where configured
- evidence/photo where configured
- audit trail
- allocation refusal when resource is not ready
- successful allocation after readiness is achieved
- no impact on unrelated resources

If the factory has selected cleaning requirements at batch setup, those configuration choices may
establish which resources are expected to be prepared. The controlled readiness mechanism must also
support changes during the process where the product specification permits it.

### Do not invent checklist content

The source material requires cleaning/readiness but the final factory checklist is not fully fixed.
Where the actual checklist is unresolved, mark it `NEEDS FACTORY DECISION` instead of inventing
steps.

## Machinery cleaning / machine evidence

Where machinery cleaning is part of the selected process:

- Admin can select which machine/resource will be used at the relevant process according to the
  configured model.
- Supervisor captures the required photo evidence.
- The application must retain provenance.
- Do not silently replace machinery usage history.

## Resource allocation

Allocation must consider:

- exact resource identity
- current occupancy
- readiness
- time overlap
- batch need

Database-level concurrency protection should be used where the existing schema supports it.

---


# 31. RESOURCE / OCCUPANCY CONCURRENCY


Multiple batches can run concurrently.

The system must support:

- independent batch plans
- shared resource allocation
- no overlapping exclusive-vessel allocations
- people/assignment handling
- monitoring across multiple batches

A new batch must not accidentally consume a bunker/tunnel/resource already occupied by another batch.

Resource conflicts must be enforced server-side/database-side where possible.

The UI should state which batch currently occupies a conflicting resource and since when.

---

