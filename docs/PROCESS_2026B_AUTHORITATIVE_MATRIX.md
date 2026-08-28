# MushroomOS — PROCESS-2026B Authoritative Process Matrix
## Canonical Factory Operational Timing, Concurrency & Dependency Map

> **Specification Status:** FROZEN — Final Approved Baseline  
> **Process Code:** `PROCESS-2026B`  
> **Total Production Clock:** $H0 \longrightarrow H552$ (23 Human Days)  
> **Pre-H0 Zone:** Advisory preparation period (Outside $H0 \to H552$ production rail)

---

## 1. Classification, Concurrency & Readiness Rules

### Classification Legend
- `FACTORY CONFIRMED`: Definite factory operating rule, duration, or sequence.
- `FACTORY RANGE`: Factory-specified operating interval (e.g. $6\text{--}7\text{h}$, $8\text{--}10\text{h}$). Exact execution duration recorded by server timestamps (`actual_end - actual_start`).
- `RECOMMENDED / ADVISORY`: Operating practice guideline / flexible recommendation. Does not block production clock.
- `PARALLEL / NO SEPARATE TIME`: Concurrent workstream or in-process lab checkpoint running simultaneously within parent/adjacent window. Consumes 0 additional standalone timeline hours.
- `CONFIGURABLE`: Threshold or parameter configured via factory data/profile.
- `DERIVED READINESS`: Computed readiness condition (e.g., Pre-H0 readiness derived from lab test pass + weighment completion). Not a separate executable `process_activity`.

### Concurrency & Modeling Principles
1. **Parent vs Child Stages:** `FIB1-WET` is the parent process group ($H0 \to H8$). The executable activities are its child steps: `FIB1-HOP-1` $\to$ `LAB-FIB-MOISTURE-1` $\to$ `FIB1-HOP-2` $\to$ `FIB1-BUNK-LOAD`. `FIB1-WET` does not compete as an independent executable row.
2. **Parallel Streams:** Straw preparation, manure/nitrogen staging, and lab checks run concurrently as independent streams without artificial serialization.
3. **Planning Windows vs Activity Duration:** For multi-instance operations (such as Day 8–10 bunker loading), $H217 \to H240$ represents the permissible operational window. Each pile activity duration is strictly $3\text{h}$. Instance start/end times are determined by resource allocation (sequential $3 \times 3\text{h}$, partial overlap, or concurrent).
4. **Gap Accounting:** Non-active intervals are explicitly accounted for as `BUFFER`, `HOLD / CONDITIONING`, or `TURNAROUND`.

---

## 2. PRE-H0 Temporal Zone (Outside the $H0 \to H552$ Clock)

> **Pre-H0 Rule:** Pre-H0 intake testing and bagasse weighment are advisory targets ($\approx 10\text{--}12\text{h}$ before $H0$). They do NOT block or enforce rigid calendar stages. Pre-H0 startup readiness is **derived** automatically from lab acceptance + weighment state.

| Seq | Activity Code | Title / Operation | Scope | Target Window | Duration | Classification | Predecessor / Trigger | Deliverables & Evidence |
|:---:|---|---|:---:|:---:|:---:|---|---|---|
| **01** | `LAB-PRE-INTAKE` | Incoming Material Lab Check | `MASTER` | Advisory ($\approx H0 - 12\text{h}$) | $\approx 1\text{h}$ | `RECOMMENDED / ADVISORY` | Raw Material Lot Arrival | Moisture %, pH, Dry Weight, Lot Accept/Reject |
| **02** | `FIB1-WEIGH` | Primary Fibre (Bagasse) Weighment | `LOAD` | Advisory ($\approx H0 - 10\text{h}$) | $N \times \text{loads}$ | `RECOMMENDED / ADVISORY` | Lot Arrived | $N$ Load Slips, Machine, Vehicle, Operator, Photos |
| — | *(Derived)* | *Pre-H0 Startup Readiness* | `MASTER` | Prior to $H0$ | Instant | `DERIVED READINESS` | Lab Pass + Weighment Done | Unlocks Admin H0 Start Confirmation |

---

## 3. Phase I — Bagasse Wetting & Early Bunker Loading ($H0 \to H48$)

> **Process Structure:** Bagasse Wetting begins at **$H0$**. `FIB1-WET` serves as the parent grouping ($H0 \to H8$). Executable activities execute in physical sequence below.

| Seq | Code | Title / Operation | Scope | Standard Span | Duration | Classification | Predecessor Chain | Key Parameters & SOP |
|:---:|---|---|:---:|:---:|:---:|---|---|---|
| **10** | `H0-START` | Factory Clock Anchor Instant | `MASTER` | $H0$ | Instant | `FACTORY CONFIRMED` | Explicit Admin Start At | Continuous $H0 \to H552$ timer started |
| **12** | `FIB1-HOP-1` | Hopper Pass 1 (Water Pass) | `MASTER` | $H0 \to H3$ | $3\text{h}$ | `FACTORY CONFIRMED` | $H0$ Start | Initial hopper aeration and water pass |
| **14** | `LAB-FIB-WET` | Wetting Laboratory Check | `MASTER` | $H1 \to H2$ | $30\text{--}50\text{ min}$ | `PARALLEL / NO SEPARATE TIME` | Hopper 1 in progress | Moisture %, pH, EC |
| **16** | `LAB-FIB-MOISTURE-1`| Hopper 1 Moisture Check | `MASTER` | $H3$ | $30\text{--}50\text{ min}$ | `PARALLEL / NO SEPARATE TIME` | `FIB1-HOP-1` Complete | Moisture %, pH, EC |
| **18** | `DEC-HOP-MOIST` | Conditional Path Decision | `MASTER` | $H3$ | Instant | `CONFIGURABLE` | `LAB-FIB-MOISTURE-1` | Path A: Dry Pass / Path B: Water Pass |
| **20** | `FIB1-HOP-2` | Hopper Pass 2 (Conditional) | `MASTER` | $H3 \to H6$ | $3\text{h}$ | `FACTORY CONFIRMED` | `DEC-HOP-MOIST` | Dry pass or secondary water pass |
| **22** | `LAB-FIB-PREBUNK` | Pre-Bunker Loading Check | `MASTER` | $H6$ | $30\text{--}50\text{ min}$ | `PARALLEL / NO SEPARATE TIME` | `FIB1-HOP-2` Complete | Checkpoint prior to bunker loading |
| **24** | `FIB1-BUNK-LOAD` | Phase I Bunker Loading | `MASTER` | $H6 \to H8$ | $2\text{h}$ | `FACTORY CONFIRMED` | `FIB1-HOP-2` Complete | Target Bunker ID, JCB Loader |
| **26** | `GAP-H8-H48` | Phase I Bunker Early Conditioning | `MASTER` | $H8 \to H48$ | $40\text{h}$ | `HOLD / CONDITIONING` | `FIB1-BUNK-LOAD` Complete | Aeration floor active, biological ramp-up |

---

## 4. Phase I — Bunker Rest, Unload/Reload & Straw Stream ($H48 \to H120$)

| Seq | Code | Title / Operation | Scope | Standard Span | Duration | Classification | Predecessor Chain | Key Parameters & SOP |
|:---:|---|---|:---:|:---:|:---:|---|---|---|
| **30** | `FIB1-REST-1` | Phase I Bunker Rest / Hold | `MASTER` | $H48 \to H96$ | $48\text{h}$ | `FACTORY CONFIRMED` | `GAP-H8-H48` | Time Gate (auto-unblocks at $H96$) |
| **32** | `FIB1-UNLOAD` | Bunker Unloading | `MASTER` | $H96 \to H99$ | $3\text{h}$ | `FACTORY CONFIRMED` | `FIB1-REST-1` Unblocked | Unloader JCB, temperature verification |
| **34** | `LAB-FIB-MOISTURE-2`| Bunker Unload Lab Check | `MASTER` | $H99$ | $30\text{--}50\text{ min}$ | `PARALLEL / NO SEPARATE TIME` | `FIB1-UNLOAD` | Moisture %, pH, EC |
| **36** | `FIB1-HOP-3` | Hopper Pass 3 | `MASTER` | $H99 \to H102$ | $3\text{h}$ | `FACTORY CONFIRMED` | `FIB1-UNLOAD` | Hopper aeration and blending |
| **38** | `FIB1-BUNK-RELOAD` | Bunker Reload | `MASTER` | $H102 \to H104$ | $2\text{h}$ | `FACTORY CONFIRMED` | `FIB1-HOP-3` | Destination Bunker ID |
| **40** | `GAP-H104-H120` | Intermediate Bunker Aeration Hold | `MASTER` | $H104 \to H120$ | $16\text{h}$ | `HOLD / CONDITIONING` | `FIB1-BUNK-RELOAD` | Forced aeration conditioning |
| **42** | `STRAW-RECEIPT` | Structural Straw Receipt | `MASTER` | $H96$ | — | `PARALLEL / NO SEPARATE TIME` | Day 4 Schedule | Parallel raw material intake stream |
| **44** | `STRAW-INSPECT` | Straw Quality Inspection | `MASTER` | $H96 \to H98$ | — | `PARALLEL / NO SEPARATE TIME` | `STRAW-RECEIPT` | Visual quality, bale integrity |
| **46** | `STRAW-WEIGH` | Straw Intake Weighment | `MASTER` | $H96 \to H99$ | — | `PARALLEL / NO SEPARATE TIME` | `STRAW-INSPECT` | Gross/tare weighment slip |
| **48** | `LAB-STRAW-WEIGH` | Straw Laboratory Check | `MASTER` | $H96 \to H97$ | $30\text{--}50\text{ min}$ | `PARALLEL / NO SEPARATE TIME` | `STRAW-WEIGH` | Moisture %, Dry Weight |
| **50** | `STRAW-BALE-CUT` | Straw Bale Cutting | `MASTER` | $H99 \to H103$ | — | `PARALLEL / NO SEPARATE TIME` | `STRAW-WEIGH` | Bale opener / cutter |

---

## 5. Phase I — Straw Soaking, Nitrogen Mix & Yard Assembly ($H120 \to H192$)

| Seq | Code | Title / Operation | Scope | Standard Span | Duration | Classification | Predecessor Chain | Key Parameters & SOP |
|:---:|---|---|:---:|:---:|:---:|---|---|---|
| **52** | `STRAW-SOAK-1` | Straw Soaking 1 | `MASTER` | $H120 \to H130$ | $8\text{--}10\text{h}$ | `FACTORY RANGE` | `STRAW-BALE-CUT` | Water immersion in lagoon |
| **54** | `LAB-LAGOON-1` | Lagoon Water Check 1 | `MASTER` | $H120 \to H121$ | $30\text{--}50\text{ min}$ | `PARALLEL / NO SEPARATE TIME` | `STRAW-SOAK-1` | pH, EC, TDS |
| **56** | `STRAW-BUNK-STORE` | Straw Bunker Storage | `MASTER` | $H130 \to H144$ | $\approx 12\text{h}$ | `FACTORY CONFIRMED` | `STRAW-SOAK-1` | Bunker storage rest |
| **58** | `STRAW-SOAK-2` | Straw Soaking 2 | `MASTER` | $H144 \to H154$ | $8\text{--}10\text{h}$ | `FACTORY RANGE` | `STRAW-BUNK-STORE` | Second lagoon soak cycle |
| **60** | `LAB-LAGOON-2` | Lagoon Water Check 2 | `MASTER` | $H144 \to H145$ | $30\text{--}50\text{ min}$ | `PARALLEL / NO SEPARATE TIME` | `STRAW-SOAK-2` | pH, EC, TDS |
| **62** | `GAP-H154-H168` | Straw Intermediate Lagoon Rest | `MASTER` | $H154 \to H168$ | $14\text{h}$ | `HOLD / CONDITIONING` | `STRAW-SOAK-2` | Moisture penetration hold |
| **64** | `STRAW-SOAK-3` | Straw Soaking 3 | `MASTER` | $H168 \to H178$ | $8\text{--}10\text{h}$ | `FACTORY RANGE` | `STRAW-SOAK-2` | Third soak cycle |
| **66** | `LAB-LAGOON-3` | Lagoon Water Check 3 | `MASTER` | $H168 \to H169$ | $30\text{--}50\text{ min}$ | `PARALLEL / NO SEPARATE TIME` | `STRAW-SOAK-3` | pH, EC, TDS |
| **68** | `STRAW-REST-2` | Straw Rest after Soak 3 | `MASTER` | $H178 \to H192$ | $14\text{--}16\text{h}$ | `FACTORY RANGE` | `STRAW-SOAK-3` | Time Gate before yard mix |
| **70** | `NMIX-ROTAVATE` | Nitrogen + Mineral Rotavation | `MASTER` | $H168 \to H174$ | $6\text{h}$ | `FACTORY CONFIRMED` | Manure & Gypsum Setup | Chicken Manure + Gypsum blend |
| **72** | `FIB1-YARD-UNLOAD` | Primary Fibre to Yard | `PILE` | $H168 \to H171$ | **$3\text{h}$** | `FACTORY CONFIRMED` | Day 7 Yard Setup | 3 yard piles |
| **74** | `STRAW-YARD-LOAD` | Straw to Yard | `PILE` | $H168 \to H171$ | $3\text{h}$ | `FACTORY CONFIRMED` | `STRAW-REST-2` | 3 yard piles |
| **76** | `YD-NMIX-ADD` | Add Nitrogen Mix to Piles | `PILE` | $H171 \to H173$ | $2\text{h}$ | `FACTORY CONFIRMED` | `NMIX-ROTAVATE` | Distribution across 3 piles |
| **78** | `YD-FLIP-1` | Yard Flip 1 | `PILE` | $H168 \to H170$ | $2\text{h}$ | `FACTORY CONFIRMED` | Pile formed | Turner pass |
| **80** | `YD-FLIP-2` | Yard Flip 2 | `PILE` | $H170 \to H172$ | $2\text{h}$ | `FACTORY CONFIRMED` | `YD-FLIP-1` | Turner pass |
| **82** | `YD-HOP-COMBINE` | Combine Piles Hopper Pass | `PILE` | $H174 \to H177$ | $3\text{h}$ | `FACTORY CONFIRMED` | `YD-FLIP-2` | Water + aeration combination |
| **84** | `YD-REST` | Yard Rest | `PILE` | $H177 \to H187$ | $8\text{--}10\text{h}$ | `FACTORY RANGE` | `YD-HOP-COMBINE` | Time Gate |
| **86** | `GAP-H187-H192` | Yard Pile Settling Buffer | `PILE` | $H187 \to H192$ | $5\text{h}$ | `BUFFER` | `YD-REST` | Pre-turner temperature ramp-up |

---

## 6. Phase I — The 3 Parallel Pile Chains & Bunker Loading ($H192 \to H240$)

> **Concurrency & Resource Model:**
> 1. Piles: Exactly 3 instance scopes (`Pile 1`, `Pile 2`, `Pile 3`). Legacy `BUNKER_LINE` is eliminated.
> 2. Duration ranges: `TR-T0` ($6\text{--}7\text{h}$, max $8\text{h}$), `REST 1` ($2\text{h}$), `TR-T1` ($6\text{--}8\text{h}$), `REST 2` ($2\text{h}$), `TR-T2` ($6\text{--}7\text{h}$).
> 3. Each pile loads into a separate bunker ($3\text{h}$ per pile $\implies \mathbf{9\text{h}\text{ Total Workload}}$).
> 4. **No global barrier:** As each pile completes `TR-T2`, its bunker loading unblocks independently.
> 5. **Resource-driven schedule:** $H217 \to H240$ is the operational window. Actual planned timestamps depend on resource assignment (sequential $3 \times 3\text{h}$, partial overlap, or concurrent).

| Seq | Code | Title / Operation | Scope | Standard Baseline Range | Duration | Classification | Predecessor Chain (Per Pile) | Key Parameters & SOP |
|:---:|---|---|:---:|:---:|:---:|---|---|---|
| **88** | `YD-FLIP-3` | Flip 3 — Straw & Fibre Mix | `PILE` | $H192 \to H196$ | $4\text{h}$ | `FACTORY CONFIRMED` | `YD-REST` | Blending pass |
| **90** | `YD-FLIP-4` | Flip 4 | `PILE` | $H192 \to H196$ | $4\text{h}$ | `FACTORY CONFIRMED` | `YD-FLIP-3` | Homogenization pass |
| **92** | `TR-T0` | Turner Pass T0 | `PILE` | $H192 \to H199$ | $6\text{--}7\text{h}$ (max $8\text{h}$) | `FACTORY RANGE` | `YD-FLIP-4` on this pile | Turner Machine ID, Core Temp |
| **94** | `TR-REST-1` | Pile Rest 1 | `PILE` | $H199 \to H201$ | **$2\text{h}$** | `FACTORY CONFIRMED` | `TR-T0` on this pile | Time Gate per pile ($2\text{h}$) |
| **96** | `TR-T1` | Turner Pass T1 | `PILE` | $H201 \to H208$ | **$6\text{--}8\text{h}$** | `FACTORY RANGE` | `TR-REST-1` on this pile | Turner Machine ID, Core Temp |
| **98** | `TR-REST-2` | Pile Rest 2 | `PILE` | $H208 \to H210$ | **$2\text{h}$** | `FACTORY CONFIRMED` | `TR-T1` on this pile | Time Gate per pile ($2\text{h}$) |
| **100** | `TR-T2` | Turner Pass T2 | `PILE` | $H210 \to H217$ | $6\text{--}7\text{h}$ | `FACTORY RANGE` | `TR-REST-2` on this pile | Turner Machine ID, Core Temp |
| **102** | `P1-BUNK-LOAD` | Bunker Loading (Per Pile) | `PILE` | $H217 \to H240$ (Window) | **$3\text{h}$ per pile** | `FACTORY CONFIRMED` | `TR-T2` on this pile (**Independent**) | Target Bunker ID, Loader JCB |
| **104** | `LAB-BUNK-FILL` | Bunker Fill Lab Check | `PILE` | During Loading | $30\text{--}50\text{ min}$ | `PARALLEL / NO SEPARATE TIME` | `P1-BUNK-LOAD` | Moisture %, pH, Ammonia |

---

## 7. Phase I / II Boundary & Tunnel Planning Milestone ($H240 \to H360$)

| Seq | Code | Title / Operation | Scope | Standard Span | Duration | Classification | Predecessor Chain | Key Parameters & SOP |
|:---:|---|---|:---:|:---:|:---:|---|---|---|
| **106** | `PLAN-TUNNEL-DECISION` | Tunnel Planning Decision Deadline | `MASTER` | **$H240$ (Day 10)** | **Deadline** | `FACTORY CONFIRMED` | Reached $H240$ | Sub-batches `366`, `367`, `368` allocated |
| **108** | `P1-REST-1` | Bunker Conditioning Rest 1 | `MASTER` | $H240 \to H288$ | $48\text{h}$ | `FACTORY CONFIRMED` | Bunker Loading Complete | Aeration floor active |
| **110** | `P1-BUNK-RELOAD` | Bunker Reload | `MASTER` | $H288 \to H297$ | $9\text{h}$ | `FACTORY CONFIRMED` | `P1-REST-1` Unblocked | Transfer to Bunker B |
| **112** | `LAB-BUNK-RELOAD` | Bunker Reload Lab Check | `MASTER` | $H288 \to H290$ | $1\text{--}2\text{h}$ | `PARALLEL / NO SEPARATE TIME` | `P1-BUNK-RELOAD` | Moisture %, pH, Ammonia, Temp |
| **114** | `GAP-H297-H312` | Inter-Reload Temperature Equilibrium Hold | `MASTER` | $H297 \to H312$ | $15\text{h}$ | `HOLD / CONDITIONING` | `P1-BUNK-RELOAD` Complete | Core heat stabilization |
| **116** | `P1-REST-2` | Bunker Conditioning Rest 2 | `MASTER` | $H312 \to H360$ | $48\text{h}$ | `FACTORY CONFIRMED` | `GAP-H297-H312` | Pre-Tunnel conditioning |

---

## 8. Phase II — Tunnel Movements, Pasteurization & Discharge ($H360 \to H552$)

| Seq | Code | Title / Operation | Scope | Standard Span | Duration | Classification | Predecessor Chain | Key Parameters & SOP |
|:---:|---|---|:---:|:---:|:---:|---|---|---|
| **118** | `TN-LOAD` | Tunnel Loading | `TUNNEL` | $H360 \to H368$ | $6\text{--}8\text{h}$ | `FACTORY RANGE` | `P1-REST-2` + `PLAN-TUNNEL` | Sub-batch $\to$ Tunnel 1/2/3 |
| **120** | `LAB-TUNNEL-LOAD` | Tunnel Loading Lab Check | `TUNNEL` | $H360 \to H362$ | $1\text{--}2\text{h}$ | `PARALLEL / NO SEPARATE TIME` | `TN-LOAD` | Bulk density, moisture, ammonia |
| **122** | `GAP-H368-H384` | Tunnel Air Balancing & Equalization | `TUNNEL` | $H368 \to H384$ | $16\text{h}$ | `BUFFER / CONDITIONING` | `TN-LOAD` Complete | Temperature & ventilation equalization |
| **124** | `TN-HOLD` | Tunnel Phase II Hold & Process | `TUNNEL` | $H384 \to H528$ | $144\text{h}$ | `FACTORY CONFIRMED` | `GAP-H368-H384` Complete | Pasteurization ($58\text{--}60^\circ\text{C}$), Conditioning |
| **126** | `TN-UNLOAD` | Tunnel Unloading & Spawning | `TUNNEL` | $H528 \to H536$ | $8\text{h}$ | `FACTORY CONFIRMED` | `TN-HOLD` Complete | Spawn dosing, discharge conveyor |
| **128** | `LAB-COMPOST-OUT` | Compost-Out Release QC | `TUNNEL` | $H528 \to H530$ | $1\text{--}2\text{h}$ | `PARALLEL / NO SEPARATE TIME` | `TN-UNLOAD` | Moisture %, pH, N %, Spawn % |
| **130** | `GAP-H536-H552` | Post-Discharge Sanitation & Reset | `TUNNEL` | $H536 \to H552$ | $16\text{h}$ | `TURNAROUND / BUFFER` | `TN-UNLOAD` Complete | Tunnel steam cleaning & turnaround |
| **132** | `H552-BASELINE-END` | Production Baseline Complete | `MASTER` | **$H552$ (Day 22)** | — | `FACTORY CONFIRMED` | All Tunnels Unloaded | $552\text{h}$ Production Clock Finalized |
