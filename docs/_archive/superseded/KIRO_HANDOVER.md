> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# MUSHROOMOS — KIRO ENGINEERING & ARCHITECTURE HANDOVER

> ## ⚠ SUPERSEDED IN PART — 29 August 2026
>
> §2 of this handover (H0 = Bagasse Wetting; `is_pre_h0` with 12 h / 10 h offsets; `PILE` scope
> replacing `BUNKER_LINE`) describes a model **the canonical repository does not implement.** The
> seeds place those activities on Day 1 and the tests assert Day 1.
>
> §3 states migrations run through `0034` with a planned `0035_authoritative_process_2026b.sql`, in a
> second working tree `mushroomos-alpha`. **This repository has `0033` and no `0035`, and that working
> tree was not present on this machine.** If it still exists, it holds work that never reached here.
>
> The database was restored to the committed seed definition on 29 Aug 2026 as a working baseline.
> Where H0 starts remains an open process-owner question; the divergent model is preserved and can be
> reinstated.
>
> → `docs/DECISION_2026-08-29_PROCESS_BASELINE.md`

**Date:** 2026-08-26  
**Auditor / Agent:** Antigravity  
**Target Repositories:**  
- `D:\freshbowl_os\mushroomos-alpha` (Active Working / Runtime Build Sandbox)  
- `D:\freshbowl_os\mushroomos` (Canonical Kiro Repository)  
**Database Backend:** PostgreSQL on Supabase (`SUPABASE_DB_URL`)

---

## 1. Executive Summary & Handover Context

This document serves as the formal handover for the Kiro engineering team. It synthesizes the complete forensic audit, process architecture corrections, database schema extensions, and application reality state across all seven organizational roles.

### Core Guiding Principles (Maintained Throughout)
1. **The Process is Data, Not Code:** All durations, sequences, cardinalities, and gates originate from database tables (`process_definition`, `process_activity`, `gate_rule`, `evidence_requirement`), not hardcoded in React frontend components.
2. **Honest Time & Clock Alignment:** $H0$ represents the true start of factory production (Bagasse Wetting Hopper 1). Pre-$H0$ intake/weighment is advisory and sits outside the 552-hour production axis.
3. **No Phantom Progress:** Percentages, artificial progress bars, and guessed occupancy windows are prohibited. Time registers (`STANDARD`, `PLAN`, `ACTUAL`, `FORECAST`) are strictly segregated.
4. **Three Independent Pile Chains:** Piles 1, 2, and 3 progress through turner passes ($T0 \to \text{Rest 1} \to T1 \to \text{Rest 2} \to T2 \to \text{Bunker Loading}$) independently via `SAME_SCOPE_INSTANCE` gates without an artificial global barrier.

---

## 2. Process Model Corrections (PROCESS-2026B Baseline)

The authoritative factory process matrix is frozen at [`docs/PROCESS_2026B_AUTHORITATIVE_MATRIX.md`](file:///d:/freshbowl_os/docs/PROCESS_2026B_AUTHORITATIVE_MATRIX.md).

### Key Architectural Baseline:
| Process Phase | Hours | Critical Rules & Scope |
| :--- | :---: | :--- |
| **PRE-H0** | $\approx H0-12\text{h}$ | `LAB-PRE-INTAKE` & `FIB1-WEIGH` marked `is_pre_h0 = true`, `pre_h0_offset = 12h/10h`. Advisory only; does not block $H0$. |
| **Phase I Wetting** | $H0 \to H8$ | Bagasse Wetting starts at **$H0$**: `Hopper 1` ($H0\to H3$) $\to$ `Moisture Lab` ($H3$) $\to$ `Hopper 2` ($H3\to H6$, conditional dry/water) $\to$ `Pre-Bunker Check` ($H6$, 0h checkpoint) $\to$ `Bunker Loading` ($H6\to H8$). |
| **Bunker Rest 1** | $H48 \to H96$ | 48h biological conditioning hold. |
| **Straw Parallel Stream** | $H96 \to H192$ | Straw receipt ($H96$), soak 1 ($H120\to H130$), bunker storage ($H130\to H144$), soak 2 ($H144\to H154$), soak 3 ($H168\to H178$), rest ($H178\to H192$). |
| **Yard Assembly** | $H168 \to H192$ | Nitrogen rotavation ($H168\to H174$), yard discharge ($H168\to H171$), flip 1 & 2 ($H168\to H172$), combine hopper pass ($H174\to H177$), yard rest ($H177\to H187$). |
| **Three Pile Turner Chains** | $H192 \to H240$ | Piles 1, 2, 3 independently: `TR-T0` ($6\text{--}7\text{h}$) $\to$ `TR-REST-1` ($2\text{h}$) $\to$ `TR-T1` ($6\text{--}8\text{h}$) $\to$ `TR-REST-2` ($2\text{h}$) $\to$ `TR-T2` ($6\text{--}7\text{h}$) $\to$ `P1-BUNK-LOAD` ($3\text{h}$ per pile, $9\text{h}$ total window $H217\to H240$). No global barrier. |
| **Bunker Conditioning** | $H240 \to H360$ | Bunker Rest 1 ($H240\to H288$, 48h) $\to$ Bunker Reload ($H288\to H297$, 9h) $\to$ Bunker Rest 2 ($H312\to H360$, 48h). Tunnel decision deadline is **$H240$**. |
| **Phase II Tunnel Ops** | $H360 \to H552$ | Tunnel Loading ($H360\to H368$, 6–8h per tunnel) $\to$ Tunnel Hold ($H384\to H528$, 144h pasteurization/conditioning) $\to$ Tunnel Unload ($H528\to H536$, 8h spawn dosing) $\to$ Compost release. |

---

## 3. Database Schema & Migration Audit

### Migration Sequence State
- Migrations `0001` through `0034` are established in `mushroomos-alpha/supabase/migrations/`.
- The new authoritative process definition and schema extension script is prepared for sequential naming as **`0035_authoritative_process_2026b.sql`**.

### Database Schema Additions
1. **`process_activity` & `batch_activity` Extensions:**
   - `is_pre_h0 boolean not null default false`
   - `pre_h0_offset integer default null` (advisory offset before $H0$, avoids hour regex collisions with Criterion 20)
2. **Cardinality & Scopes:**
   - Eliminated legacy `BUNKER_LINE` scope.
   - All Turner, Yard, and Phase I Bunker loading activities scoped to `PILE` (`Pile 1`, `Pile 2`, `Pile 3`).
   - Cardinality evaluated dynamically via `evaluate_cardinality(rule, config)`.
3. **Exit & Entry Gates:**
   - Entry predecessor gates use `SAME_SCOPE_INSTANCE` for pile-specific continuity.
   - Exit gates: `MACHINE_STINT_CLOSED` prevents submitting open machine stints; `EVIDENCE_COMPLETE` enforces server-side photo evidence requirements.

---

## 4. Current Application Reality & Cross-Role State

### Role Inventory & Authentication
| Role | Database Enum | Auth Source | Primary Route | Shell Used | Actual Permission State |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Admin** | `admin` | Profile / JWT | `/admin/today` | `AppShell` | Full batch creation, scheduling, and configuration access. |
| **Operator** | `operator` | Profile / JWT | `/operator/my-work` | `FieldShell` | Actionable work queue, stint starts/ends, evidence capture. |
| **Lab Technician** | `lab_tech` | Profile / JWT | `/lab/queue` | `FieldShell` | Sample registration, test parameter entry, reading verification. |
| **Supervisor** | `supervisor` | Profile / JWT | `/supervisor/control-room` | `AppShell` | Plant floor overview, schedule adjustments, deviation reviews. |
| **Manager** | `manager` | Profile / JWT | `/manager/resources` | `AppShell` | Fleet machines, vessel occupancies, constraint monitoring. |
| **General Manager** | `gm` | Profile / JWT | `/gm/control-tower` | `AppShell` | Cross-factory staircase calendar, exception triage, master approvals. |
| **Chairman / Owner**| *None* | *N/A* | `/plant` or `/gm/control-tower` | `AppShell` | Uses `gm` role permissions. No distinct `chairman` enum in DB. |

---

## 5. What is Working, Partially Working, Broken, and to be Rebuilt

### What is Actually Working (Preserve)
- **Time Invariant Framework:** `src/domain/time.ts` and `src/domain/time.test.ts` (100% green, strict prevention of hardcoded length literals).
- **Resource Constraints:** `tests/resources.test.ts` (100% green, exclusion constraints on machine stints and bunker/tunnel occupancy).
- **Role Code-Splitting:** Dynamic bundle chunking separating `FieldShell` (mobile floor) from `AppShell` (management).
- **Playhead Navigation:** `PlayheadProvider` in `BatchPage` scrubbing synchronously across hour rail, event stream, and narrative.

### What is Partially Working (Requires Plan Generator Refinement)
- **Batch Creation RPC:** `create_master_batch()` successfully creates master batch and activities, but does not yet populate the `individual_batch` (366/367/368) and `batch_movement` tables.
- **Pre-H0 Placement:** `repoint_batch_activities()` places $H0$ onwards accurately, but pre-$H0$ activities currently have null baseline hours instead of explicit negative advisory coordinate mapping.

### What is Broken / Fake / Needs Rebuild
- **Tunnel Allocation at Step 6:** Batch creation UI previously demanded immediate tunnel assignment at $H0$, which contradicts the factory rule that tunnel destinations are decided at $H240$.
- **Hardcoded `FIB1-WEIGH` on Operator Screen:** `MyWork.tsx` had an ad-hoc query targeting `FIB1-WEIGH` for total quantities. Must read dynamically from assigned tasks.

---

## 6. Recommended Next Steps for Kiro Team

1. **Step 1:** Apply migration `0035_authoritative_process_2026b.sql` in `mushroomos-alpha`.
2. **Step 2 (Phase 2 of ins2.md):** Update `generate_activity_plan()` and `repoint_batch_activities()` to auto-populate `individual_batch` records (366, 367, 368) and compute pre-$H0$ offsets.
3. **Step 3:** Refactor `NewBatch.tsx` Step 6 movement plan to display "Tunnel Planning: Decision Due by H240" instead of requiring immediate vessel selection.
4. **Step 4:** Execute full end-to-end integration tests using fresh test batches.
