# 03 — COMPLETE PROCESS: H0 TO H474

## Purpose

Give Claude one coherent picture of the physical process so it does not implement isolated tasks without understanding where they belong.

## What the application must do

Represent the process as the factory's H0-based dependency graph. H0 is the selected batch start and the master clock. The standard working model runs to H470 for the first grow-room stream, with later staggered discharge streams at H472 and H474.

The current working shape is:
H0/main process → parallel Paddy + Nitrogen/CM + Lab/readiness → convergence → Water Hopper → NEW Hopper → 10-hour passive rest → second convergence → Turner P1–P6 → B1/B2/B3 bunker streams → tunnel loading streams → tunnel process → grow-room/final QC.

Exact current timings must come from the active process/version in the runtime database. The worked Geetha timeline is used to understand process shape; it must not silently override the active process version.

## Acceptance / proof

Generated plans show the same physical chain, H-hour relationships and convergence structure. A new batch can be followed from H0 to final discharge without the application inventing a different sequence.

## Detailed source context

The following sections from the consolidated Geetha source are included below. They are implementation context, not permission to invent a different product.


# 5. CORE END-TO-END LIFECYCLE


The complete application flow is:

```text
PROCESS VERSION
      ↓
BATCH CREATION / EXISTING-BATCH ONBOARDING
      ↓
H0 / CURRENT TRACKING POSITION
      ↓
GENERATED PLAN
      ↓
FROZEN BASELINE
      ↓
DEPENDENCIES + TIME GATES + LAB GATES + READINESS
      ↓
ELIGIBLE WORK
      ↓
SUPERVISOR / OPERATIONS EXECUTION
      ↓
READINGS + CHECKLISTS + EVIDENCE
      ↓
LAB RESULTS / DECISIONS
      ↓
GM APPROVAL WHERE REQUIRED
      ↓
TICKETS / EXTENSIONS / EXCEPTIONS WHEN REQUIRED
      ↓
DEPENDENCY-AWARE FORECAST
      ↓
ADMIN / GM MONITORING
      ↓
FINAL QC / DISCHARGE / GROW-ROOM HANDOFF
      ↓
COMPLETE TRACE + AUDIT
```

Every major state change must be traceable.

---


# 8. STANDARD PROCESS — H0 TO H474 WORKING MODEL


The historical Geetha/PROCESS-2026C worked example describes a 470-hour standard from H0 to the
first grow-room stream, with later streams at H472 and H474.

The active published process/version in the actual runtime must be checked before using exact current
values. The following is the working process shape that the implementation must understand.

## 8.1 Main rail and early preparation

```text
H0
  ↓
Bagasse wetting + Hopper Pass 1
  ↓
H3 material rest begins
  ↓
H11 Hopper Pass 2 / dry-or-water branch
  ↓
H14 heap formation + rest
  ↓
H26 before first bunker loading / first bunker-related gate
  ↓
H28 conditioning begins
```

The exact active-process durations and triggers must come from the selected published process.

## 8.2 Paddy parallel stream

Standard/Punjab path:

```text
H74  Bale weigh/cut/thread removal
H86  Soak 1
H108 Soak 2
H136 Soak 3
H160 Paddy ready for second convergence
```

Documented example durations:

- Bale preparation: 12h
- Soak 1: 22h
- Soak 2: 28h
- Soak 3: 24h

Important: this branch is parallel. It is not added on top of the main rail.

## 8.3 Nitrogen / chicken manure / minerals stream

Approximate working sequence:

```text
H130 CM/minerals weighment
  ↓
H132 dry mix / rotavator
  ↓
H133 moisture decision
  ↓
H136 first convergence / CM mix path
```

The active process and Lab rules determine the exact gate and branch behavior.

## 8.4 New Hopper change

The later process correction introduces a distinct New Hopper Pass after the Water Hopper Pass,
followed by a confirmed 10-hour passive rest.

Working model:

```text
H144–H146  Water Hopper Pass
     ↓
H147–H149  NEW Hopper Pass
     ↓
H150–H160  10-hour passive rest
     ↓
H160       Second convergence
```

Do not treat the 10-hour rest as a human task to Start/Finish.

The exact current hours must be taken from the active process version.

## 8.5 Yard / pre-Turner work

Working example:

```text
H160  Second convergence / two equal paddy piles
  ↓
H164  Add conditioned bagasse + CM mix
  ↓
H166  Flip 1 + Flip 2 back-to-back
  ↓
H174  Turner start
```

## 8.6 Turner

At approximately H174 the material is organized into six physical working piles:

```text
P1 P2 P3 P4 P5 P6
```

Two Turner machines:

```text
M1
M2
```

Each pile is independently trackable.

Each pile has:

```text
T0 → T1 → required rest → T2 → T3
```

The exact durations and machine assignment rules must come from the active process and Turner data.

Working example anchors:

```text
H174–H180  T0 window
H177+      T1 interleaved with T0
H183       T1 window complete
H186.5+    T2 after each pile's own 8h rest
H192.5+    T3
```

These values are an example/anchor, not permission to hard-code them in React.

## 8.7 Bunker grouping

After Turner:

```text
P1 + P2 → B1
P3 + P4 → B2
P5 + P6 → B3
```

This is a real physical grouping/dependency relationship, not just a UI label.

Working example:

```text
H194  B1 fill
H196  B2 fill
H198  B3 fill
```

Later reload example:

```text
H259  B1 reload
H261  B2 reload
H263  B3 reload
```

Do not merge these combined-compost bunker streams with the earlier single early-fibre bunker stage.

## 8.8 Tunnel

Working example:

```text
H324  Tunnel loading stream 1
H326  Tunnel loading stream 2
H330  Tunnel loading stream 3
H332  Tunnel filling complete / tunnel process starts
H332–H470  Tunnel working process
H470  First grow-room stream
H472  Second stream discharge
H474  Final stream discharge / full three-stream discharge
```

The 470h standard refers to the first grow-room stream.
The full three-stream discharge reaches H474 in the worked example.

The current factory range and any unresolved 144h/150h tunnel interpretation must remain explicitly
identified until resolved by the active process/factory owner.

---

