# MushroomOS process model — reconciliation review draft

13 September 2026 · Current deployed definition is evidence, not approval of proposed amendments. This document owns the factory decision register for the package.

## Vocabulary

| Concept | Meaning / relationship |
|---|---|
| SOP / SOP version | Named procedure family / immutable approved graph and parameter set |
| Stage | Human-readable grouping of related activities; not a substitute for dependency edges |
| Activity | Scoped work, hold, measurement or decision with explicit start/end conditions |
| Stream | Work that can progress independently until a specified convergence |
| Scope | Batch, pile, bunker stream, tunnel or another declared subject; cardinality determines occurrences |
| Dependency | A typed prerequisite: predecessor completion, elapsed rest, lab decision, evidence, resource or conditional branch |
| Duration | Standard planning value plus permitted bounds and source; elapsed hold distinct from labor effort |
| Start/end condition | Server-evaluated predicate controlling transition, not calendar position alone |
| Resource | Required class and operational allocation to a physical unit with occupancy constraints |
| Lab checkpoint / test | Version-bound sampling point / measurement or observation method for a parameter |
| Evidence requirement | Defined proof kind/count/capture context bound to the occurrence |
| Gate | Version rule combining readiness requirements before a transition |
| Decision | Authorized recorded choice about an identified subject/package; not a measured value |

Every activity definition must expose code, name, stage, stream, scope/cardinality, duration and timing basis, prerequisite, successor, responsible role, lab requirement, evidence requirement, resource requirement and gate relationship. Absence of a typed field in current storage is an explicit model gap, not permission to infer it from a label or timestamp.

## Current observed graph

PROCESS-2026C v1 has 110 definition activities. It is the current selectable version in the saved database. H470 is first-stream discharge standard; H472 and H474 are later discharges; 474 hours is the complete span. These are version-specific milestones. Activity effort across parallel streams is not the wall-clock total.

The documented structure is primary fibre preparation → nitrogen convergence near H136 → straw convergence near H160 → six independent Turner piles T0–T3 → three paired bunker streams → one receiving tunnel → staggered discharge. Timings are current observations and historical documented rulings, not automatically the revised workbook's approved recipe.

The main rail currently includes Stage 0A's two hopper passes, conditioning and reload, Stage 1B mixing/one hopper/rest, and final yard combination. Paddy preparation runs in parallel; dry nitrogen/mineral preparation is separately timed. Turner passes are 1.5 hours each, six piles and four passes, with T2 no earlier than eight hours after that same pile's T1 actual end under the current rule. Physical machine used is an operational fact. Bunker filling is rolling, not a wait-for-all-six barrier. Combined tunnel loading and phase offsets need explicit review in D05.

## Reconciliation and factory decision register

Later source evidence: [FINAL library review L01–L03](../04-audit/FINAL-LIBRARY-REVIEW-2026-09-13.md) checks both included workbooks. The revised Sheet1 C24:D26 contains mixing8 + one hopper4 only; the second-pass/rest proposal has separate provenance. C30:D32 soaking rows belong to Paddy, not Stage1B. D01 remains unresolved; correct source attribution does not approve a new recipe. D06's86/90 distinction depends on including the4-hour pile-preparation row. The supplied library's14 open items map to these existing D IDs in the review; no second factory decision ledger is created.

`CONFIRMED` below applies to the described observation/requirement. A proposed interpretation remains unapproved until a dated process-owner ruling is recorded. Every pending item is **NEEDS FACTORY DECISION**. Decision owner means the factory business owner, not an automatically inferred app permission.

| ID / conflict | Current database | Current documentation | Supplied workbook / notes | Proposed interpretation (not approved) | Factory decision required / owner |
|---|---|---|---|---|---|
| D01 Stage 1B / Hopper Pass 2 | MIX-CM-ADD H136–144, MIX-HOP-WATER H144–148, MIX-REST H148–160, range8–12/std12 | STANDARD agrees with old sequence; pack requests added pass | Workbook lists mixing8 + hopper4, no second pass/rest row; notes request pass2=same duration and rest8–10/std10 | Separate new version: mixing → pass1 → pass2 → rest; retain equality constraint | **NEEDS FACTORY DECISION:** approve amendment, lab/evidence requirements and version scope; process owner. Current sequence and requested change are CONFIRMED as different sources |
| D02 Stage 0A versus 1B | FIB-HOP-2 already at H11–14 | STANDARD identifies early fibre pass | Workbook also has early second hopper3h | Never treat early pass as satisfying D01 | **CONFIRMED:** distinct activities; D01 remains pending |
| D03 Turner sequence/testing | Six piles, four1.5h passes; pre/post-T1 lab activities; same-pile rest rule | STANDARD lab section says tests afterT0/T1/T2/T3; later AGENT-BRIEF says pre/postT1 only and rejects no-gap pile reading | Workbook says T0/T1 continuous, immediateT1; rest8; phase headings23 and16 | Preserve observed current recipe for old batches; reconcile operational meaning and laboratory coverage in new approved graph | **NEEDS FACTORY DECISION:** test locations, per-pile rules, timing/meaning of continuous; process+lab owners |
| D04 Bunker loading/reload | Fills/reloads2h, holds mostly63h; B3 second hold65h in data | STANDARD says all holds63h but B3 schedule leaves additional gap before H330 loading | Workbook fill8h, first hold63, reload1 fill8/hold60; reload2 fill10/hold30–36 | Treat as competing recipes/aggregate-vs-stream timings; do not splice totals | **NEEDS FACTORY DECISION:** number of reloads, per-stream vs whole-load durations, B3 extra2h, trigger semantics; process owner |
| D05 Tunnel | Level19, heat10, pasteurize9.5, cool1 13, condition2 81.5, cool2 11; first phase startsH326 | STANDARD states one tunnel receives streams in H324–332 and 144h phases | Workbook prep8, load8, level14/heat12/pasteurize8/cool1 12–14/condition80–85/cool2 8–14 | Explicitly define whether processing overlaps rolling loading, phase start trigger and one-tunnel aggregation | **NEEDS FACTORY DECISION:** phase timing, load dependencies, unload24°C condition; process owner |
| D06 Totals and stage arithmetic | 470 standard /474 span for C; B536 computed | STANDARD uses max planning; global470 wording elsewhere is stale | Stage0C heading8 omits40 rest;0D24 has no complete activity detail; paddy74 heading vs12+22+28+24=86 plus4 prep | Keep named milestones and per-stage derived totals; never sum parallel streams | **NEEDS FACTORY DECISION:** intended stage inclusions and planning column for revised version; process owner |
| D07 Temperature/time logic | Gate/trigger data must be checked against selected version | STANDARD 0B says temp≥58 OR elapsed≥60 | Workbook 0B uses AND;0C uses OR; later bunker triggers have differing wording | Represent explicit Boolean conditions with both observations retained | **NEEDS FACTORY DECISION:** AND/OR and minimum holds at each trigger; process owner |
| D08 Lab turnaround/overdue | Queue explicitly reports unknown turnaround; no adopted schedule for new notes | No definitive new test clock model | Notes pH30min/moisture25min/EC30min/N6h/TDS10min/ash12h and ash5h; loose7,8,10,12,13 undefined | Treat times as proposals; separate test processing, sample wait and approval wait | **NEEDS FACTORY DECISION:** ash method, timing anchors, business/elapsed hours, parallel processing and SLA; lab owner |
| D09 Acceptance/approval | Numeric acceptance Lab/Supervisor; gate decision fallback GM/Supervisor while policy unresolved | STANDARD says GM; later contracts explicitly leave approver question open | Pack prohibits self-approval and separates record/submit/approve | Independent approval; explicit per-decision policy, no blanket Admin authority | **NEEDS FACTORY DECISION:** incoming numeric acceptance meaning, gate approvers, exceptions/delegation; process+quality owners |
| D10 Pre-H0 readiness | Draft validation blocks on incoming material acceptance | STANDARD LAB-00 advisory does not gateH0; later activation validation mandatory | Workbook new-bagasse weighment pre-H0 optional | Separate weighment, material quality acceptance and execution readiness | **NEEDS FACTORY DECISION:** required parameters incl dry weight, who collects/accepts, activation conditions; quality+operations |
| D11 Resource/branch unknowns | Existing modeled turners/vessels; no authority to infer missing resource semantics | OPEN-QUESTIONS names loader tracking, turner changeover, receiving bunker and moisture67–68 band | Workbook names loader/new bunker without complete inventory or gap policy | Preserve unresolved markers; no invented capacity or automatic moisture branch | **NEEDS FACTORY DECISION:** each of the four items separately; operations/process owner |
| D12 SOP governance | Admin/GM can publish; no complete review workflow | Published content immutable; review authority not consistently named | Pack requires draft/review/validate/publish | Separate process owner approval and technical publication; version scope includes dependent definitions | **NEEDS FACTORY DECISION:** authorized editors/reviewers/publishers, version identity and review evidence; process owner |
| D13 Ongoing batch/terminal lifecycle | Existing privileged historical paths; demo batches remain active after completion | Never invent history; old instructions overstate universal server time | Pack calls for verified historical position, no unsupported mechanism | Explicit supported onboarding and completion/cancellation contracts | **NEEDS FACTORY DECISION:** accepted historical proof, cutover actor, closure criteria and retention; operations/quality |
| D14 Extension/override policy | Current extension policy requires Manager then GM; additional configurable policy exists | OPEN-QUESTIONS leaves caps, evidence, expiry and post-completion requests open | Pack says configured approvals, separate authorization | Retain effective settings as observed; obtain explicit policy sign-off before exposing actions | **NEEDS FACTORY DECISION:** limits, evidence, chain, expiry, cancellation, protected overrides; Manager/GM/process owner |
| D15 Visibility and reassignment | Broad management work view and shared lab queue | Pack distinguishes ownership/visibility/authority | No factory-specific confidentiality/delegation scope supplied | Personal assigned queues plus contextual shared status; explicit reasoned reassignment | **NEEDS FACTORY DECISION:** cross-batch visibility, technician shared pool and supervisor lab delegation; operations/quality |

For each answer record exact wording, decision owner/name, date, supporting source, affected activity/parameter IDs, applicable version(s), required tests and approval status. No answers have been supplied in this phase. D02 is a confirmed distinction, not an independent process amendment.

## Activity inventory interpretation

The appendix below is generated from the read-only snapshot plus [supplemental definition details](../04-audit/context-comparison-2026-09-13/reconciliation-definition-details.json). It enumerates every current C activity, not a fabricated revised schedule. Stage grouping is labelled **inferred presentation** where the database has no stage field. Scope/cardinality and lab fields are copied. Prerequisite/gate rules show enabled state and raw configuration; successors are only explicit reverse references, not guessed from chronological adjacency. Evidence fields distinguish required/submission-gating definitions.

Missing explicit links are written as **not explicitly mapped in this inventory**. They require graph reconciliation before a new version is published. Temporal order alone does not prove a start condition. Raw metadata in this engineering appendix is not proposed production-screen wording.

## Current activity inventory — 110 definition records

Generated from the named snapshots. Stage labels are inferred presentation groupings, not a deployed stage field. No edge is inferred merely from timing. Required/optional flags describe definitions, not proof of correct enforcement.

### FIB-WET-1

{role_lead} wetting — hopper pass 1 (full water, target 69–71% moisture)

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Stage 0A |
| Stream / scope / cardinality | PRIMARY_FIBRE / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H0–H3; offset span 3h; duration range 3–3h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-RM-01 from LAB-RM-01; LAB_2026A:LAB-WET-01 from LAB-WET-01 |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-RM-01

Raw material / bagasse weighment

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Incoming / PRE-H0 |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H0–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 true |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | FIB-WET-1 (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct","ph","dry_weight"]; own checkpoint bindings LAB_2026A:LAB-RM-01 -> FIB-WET-1; incoming checkpoint bindings none |
| Evidence | WEIGHMENT_SLIP: Weighment slip; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; LOT_PHOTO: Lot photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### FIB-REST-1

Material rest

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Stage 0A |
| Stream / scope / cardinality | PRIMARY_FIBRE / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | HOLD (system elapsed rule) / operator |
| Timing / duration | H3–H11; offset span 8h; duration range 8–8h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | Not explicitly mapped in this inventory; do not infer readiness. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | No definition rows in snapshot |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

### LAB-WET-01

Bagasse wetting — first hopper pass

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H3–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | FIB-WET-1 (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct","ph","ec"]; own checkpoint bindings LAB_2026A:LAB-WET-01 -> FIB-WET-1; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### FIB-HOP-2

Hopper pass 2 (dry, or water to reach target moisture)

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Stage 0A |
| Stream / scope / cardinality | PRIMARY_FIBRE / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H11–H14; offset span 3h; duration range 3–3h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-WET-02 from LAB-WET-02 |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### FIB-HEAP

Heap formation (height ≤1.5 m) + rest

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Stage 0A |
| Stream / scope / cardinality | PRIMARY_FIBRE / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | HOLD (system elapsed rule) / operator |
| Timing / duration | H14–H26; offset span 12h; duration range 8–12h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | Not explicitly mapped in this inventory; do not infer readiness. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | No definition rows in snapshot |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

### LAB-WET-02

Second hopper pass

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H14–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | FIB-HOP-2 (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct","ph","ec"]; own checkpoint bindings LAB_2026A:LAB-WET-02 -> FIB-HOP-2; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### FIB-BUNK-LOAD

Flipping + bunker filling (ht 2.6–2.7 m), no water

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Stage 0B |
| Stream / scope / cardinality | PRIMARY_FIBRE / BUNKER_LINE / {"kind":"SINGLETON"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H26–H28; offset span 2h; duration range 2–2h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-BNK-PRE from LAB-BNK-PRE |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- entry LAB_APPROVED; enabled=true; binding=none; config={"checkpoint_map":"LAB_2026A"}; conflict=none; reason=Locked — waiting for laboratory approval. {checkpoint}: {approved_count} of {required_count} approved. A recorded result is not an approved result.
- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-BNK-PRE

Before first bunker loading

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H26–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | FIB-BUNK-LOAD (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct","ph","ec"]; own checkpoint bindings LAB_2026A:LAB-BNK-PRE -> FIB-BUNK-LOAD; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### FIB-COND-1

Bunker conditioning, 45–55 °C. Unload trigger ≥58 °C or ≥60 h

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Stage 0B |
| Stream / scope / cardinality | PRIMARY_FIBRE / BUNKER_LINE / {"kind":"SINGLETON"} |
| Kind / responsible role | HOLD (system elapsed rule) / operator |
| Timing / duration | H28–H88; offset span 60h; duration range 48–60h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | Not explicitly mapped in this inventory; do not infer readiness. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | No definition rows in snapshot |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

### STR-WEIGH

{role_lead} bale weighment + cutting + thread removal

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Stage 1C-A parallel straw |
| Stream / scope / cardinality | STRUCTURAL_STRAW / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H74–H86; offset span 12h; duration range 12–12h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-PDY-WGH from LAB-PDY-WGH |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-PDY-WGH

Paddy weighment

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H74–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | STR-WEIGH (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct","dry_weight"]; own checkpoint bindings LAB_2026A:LAB-PDY-WGH -> STR-WEIGH; incoming checkpoint bindings none |
| Evidence | WEIGHMENT_SLIP: Weighment slip; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### STR-SOAK-1

Soaking 1 — push in, tilt 1, tilt 2, push out (8–10 h) + rest in bunker (10–12 h)

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Stage 1C-A parallel straw |
| Stream / scope / cardinality | STRUCTURAL_STRAW / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H86–H108; offset span 22h; duration range 22–22h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-PDY-S1 from LAB-PDY-S1 |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-PDY-S1

Paddy soak 1 — pit water

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H86–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | STR-SOAK-1 (checkpoint binding) |
| Lab requirement | Parameters ["ph","ec","tds"]; own checkpoint bindings LAB_2026A:LAB-PDY-S1 -> STR-SOAK-1; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### FIB-RELOAD-1

Loader unload, flipping, reload to new bunker (no water)

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Stage 0C |
| Stream / scope / cardinality | PRIMARY_FIBRE / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H88–H93; offset span 5h; duration range 5–5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-UNL-01 from LAB-UNL-01; LAB_2026A:LAB-HOP-PRE from LAB-HOP-PRE; LAB_2026A:LAB-RLD-01 from LAB-RLD-01 |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-UNL-01

Bunker unloading

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H88–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | FIB-RELOAD-1 (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct","ph","ec"]; own checkpoint bindings LAB_2026A:LAB-UNL-01 -> FIB-RELOAD-1; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-HOP-PRE

Before hopper pass

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H90–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | FIB-RELOAD-1 (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct","ph","ec"]; own checkpoint bindings LAB_2026A:LAB-HOP-PRE -> FIB-RELOAD-1; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### FIB-COND-2

Conditioning. Unload trigger ≥58 °C or ≥40 h

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Stage 0C |
| Stream / scope / cardinality | PRIMARY_FIBRE / BUNKER_LINE / {"kind":"SINGLETON"} |
| Kind / responsible role | HOLD (system elapsed rule) / operator |
| Timing / duration | H93–H133; offset span 40h; duration range 40–40h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | Not explicitly mapped in this inventory; do not infer readiness. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | No definition rows in snapshot |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

### LAB-RLD-01

Reloading to new bunker

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H93–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | FIB-RELOAD-1 (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct","ph","ec"]; own checkpoint bindings LAB_2026A:LAB-RLD-01 -> FIB-RELOAD-1; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### STR-SOAK-2

Soaking 2 — push in, tilt 1, tilt 2, push out (8–10 h) + rest in bunker (18 h)

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Stage 1C-A parallel straw |
| Stream / scope / cardinality | STRUCTURAL_STRAW / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H108–H136; offset span 28h; duration range 28–28h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-PDY-S2 from LAB-PDY-S2 |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-PDY-S2

Paddy soak 2 — pit water

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H108–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | STR-SOAK-2 (checkpoint binding) |
| Lab requirement | Parameters ["ph","ec","tds"]; own checkpoint bindings LAB_2026A:LAB-PDY-S2 -> STR-SOAK-2; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### CM-WEIGH

{role_lead} + mineral weighment

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Stage 1A |
| Stream / scope / cardinality | NITROGEN_MINERAL / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H130–H132; offset span 2h; duration range 2–2h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-CM-ARR from LAB-CM-ARR |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-CM-ARR

Chicken manure — on arrival

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H130–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | CM-WEIGH (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct","ph","n_pct","ash_pct"]; own checkpoint bindings LAB_2026A:LAB-CM-ARR -> CM-WEIGH; incoming checkpoint bindings none |
| Evidence | LOT_PHOTO: Lot photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### CM-DRYMIX

Dry mix + rotavator to break lumps (no water)

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Stage 1A |
| Stream / scope / cardinality | NITROGEN_MINERAL / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H132–H136; offset span 4h; duration range 4–4h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### FIB-MOIST-DEC

Unload. If moisture ≥68% proceed; if <67% controlled mist via hopper

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Stage 0C |
| Stream / scope / cardinality | PRIMARY_FIBRE / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H133–H136; offset span 3h; duration range 3–3h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-MOIST-DEC from LAB-MOIST-DEC |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-MOIST-DEC

Moisture decision point

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H133–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | FIB-MOIST-DEC (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct"]; own checkpoint bindings LAB_2026A:LAB-MOIST-DEC -> FIB-MOIST-DEC; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### MIX-CM-ADD

Add {role_lead} mix to conditioned fibre + loader mix + flip 1 + flip 2

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Stage 1B |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H136–H144; offset span 8h; duration range 8–8h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-CM-USE from LAB-CM-USE |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- entry LAB_APPROVED; enabled=true; binding=none; config={"checkpoint_map":"LAB_2026A"}; conflict=none; reason=Locked — waiting for laboratory approval. {checkpoint}: {approved_count} of {required_count} approved. A recorded result is not an approved result.
- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### STR-SOAK-3

Soaking 3 — push in, tilt 1, tilt 2, push out (8–10 h) + rest in bunker (12–14 h)

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Stage 1C-A parallel straw |
| Stream / scope / cardinality | STRUCTURAL_STRAW / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H136–H160; offset span 24h; duration range 24–24h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-PDY-S3 from LAB-PDY-S3 |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-CM-USE

Chicken manure — before use in mixing

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H136–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | MIX-CM-ADD (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct","ph","n_pct","ash_pct"]; own checkpoint bindings LAB_2026A:LAB-CM-USE -> MIX-CM-ADD; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-PDY-S3

Paddy soak 3 — pit water

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H136–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | STR-SOAK-3 (checkpoint binding) |
| Lab requirement | Parameters ["ph","ec","tds"]; own checkpoint bindings LAB_2026A:LAB-PDY-S3 -> STR-SOAK-3; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### MIX-HOP-WATER

Hopper pass, full water (target 73% moisture, temp <45–50 °C)

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Stage 1B |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H144–H148; offset span 4h; duration range 4–4h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### MIX-REST

Rest

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Stage 1B |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | HOLD (system elapsed rule) / operator |
| Timing / duration | H148–H160; offset span 12h; duration range 8–12h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | Not explicitly mapped in this inventory; do not infer readiness. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | No definition rows in snapshot |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

### YARD-PILES

Preparation of 2 equal piles on platform

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Stage 1C combination |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H160–H164; offset span 4h; duration range 4–4h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### YARD-ADD

Add fibre + nitrogen mix gradually onto the 2 straw piles

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Stage 1C combination |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H164–H166; offset span 2h; duration range 2–2h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### YARD-FLIP

Flipping 1 + flipping 2, back to back

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Stage 1C combination |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H166–H174; offset span 8h; duration range 8–8h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-PRE-T from LAB-PRE-T |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TRN-P1-T0

Turner T0 — pile 1

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 1"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H174–H175.5; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TRN-P3-T0

Turner T0 — pile 3

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 3"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H174–H175.5; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-PRE-T

Pre-Turner check

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H174–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | YARD-FLIP (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct","ph"]; own checkpoint bindings LAB_2026A:LAB-PRE-T -> YARD-FLIP; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TRN-P2-T0

Turner T0 — pile 2

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 2"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H175.5–H177; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TRN-P4-T0

Turner T0 — pile 4

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 4"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H175.5–H177; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TRN-P1-T1

Turner T1 — pile 1

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 1"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H177–H178.5; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | TRN-P1-T2 |
| Lab requirement | Parameters ["moisture"]; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-T1-PRE from LAB-T1-PRE-P1; LAB_2026A:LAB-T1-POST from LAB-T1-POST-P1 |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TRN-P5-T0

Turner T0 — pile 5

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 5"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H177–H178.5; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-T1-PRE-P1

Moisture before T1 — pile 1

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 1"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H177–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | TRN-P1-T1 (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct"]; own checkpoint bindings LAB_2026A:LAB-T1-PRE -> TRN-P1-T1; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TRN-P3-T1

Turner T1 — pile 3

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 3"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H178.5–H180; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | TRN-P3-T2 |
| Lab requirement | Parameters ["moisture"]; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-T1-PRE from LAB-T1-PRE-P3; LAB_2026A:LAB-T1-POST from LAB-T1-POST-P3 |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TRN-P6-T0

Turner T0 — pile 6

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 6"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H178.5–H180; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-T1-PRE-P3

Moisture before T1 — pile 3

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 3"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H178.5–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | TRN-P3-T1 (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct"]; own checkpoint bindings LAB_2026A:LAB-T1-PRE -> TRN-P3-T1; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-T1-POST-P1

Moisture after T1 — pile 1

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 1"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H178.5–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | TRN-P1-T1 (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct"]; own checkpoint bindings LAB_2026A:LAB-T1-POST -> TRN-P1-T1; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TRN-P2-T1

Turner T1 — pile 2

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 2"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H180–H181.5; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | TRN-P2-T2 |
| Lab requirement | Parameters ["moisture"]; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-T1-PRE from LAB-T1-PRE-P2; LAB_2026A:LAB-T1-POST from LAB-T1-POST-P2 |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TRN-P5-T1

Turner T1 — pile 5

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 5"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H180–H181.5; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | TRN-P5-T2 |
| Lab requirement | Parameters ["moisture"]; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-T1-PRE from LAB-T1-PRE-P5; LAB_2026A:LAB-T1-POST from LAB-T1-POST-P5 |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-T1-PRE-P2

Moisture before T1 — pile 2

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 2"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H180–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | TRN-P2-T1 (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct"]; own checkpoint bindings LAB_2026A:LAB-T1-PRE -> TRN-P2-T1; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-T1-PRE-P5

Moisture before T1 — pile 5

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 5"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H180–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | TRN-P5-T1 (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct"]; own checkpoint bindings LAB_2026A:LAB-T1-PRE -> TRN-P5-T1; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-T1-POST-P3

Moisture after T1 — pile 3

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 3"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H180–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | TRN-P3-T1 (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct"]; own checkpoint bindings LAB_2026A:LAB-T1-POST -> TRN-P3-T1; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TRN-P4-T1

Turner T1 — pile 4

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 4"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H181.5–H183; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | TRN-P4-T2 |
| Lab requirement | Parameters ["moisture"]; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-T1-PRE from LAB-T1-PRE-P4; LAB_2026A:LAB-T1-POST from LAB-T1-POST-P4 |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TRN-P6-T1

Turner T1 — pile 6

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 6"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H181.5–H183; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | TRN-P6-T2 |
| Lab requirement | Parameters ["moisture"]; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-T1-PRE from LAB-T1-PRE-P6; LAB_2026A:LAB-T1-POST from LAB-T1-POST-P6 |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-T1-PRE-P4

Moisture before T1 — pile 4

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 4"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H181.5–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | TRN-P4-T1 (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct"]; own checkpoint bindings LAB_2026A:LAB-T1-PRE -> TRN-P4-T1; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-T1-PRE-P6

Moisture before T1 — pile 6

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 6"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H181.5–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | TRN-P6-T1 (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct"]; own checkpoint bindings LAB_2026A:LAB-T1-PRE -> TRN-P6-T1; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-T1-POST-P2

Moisture after T1 — pile 2

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 2"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H181.5–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | TRN-P2-T1 (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct"]; own checkpoint bindings LAB_2026A:LAB-T1-POST -> TRN-P2-T1; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-T1-POST-P5

Moisture after T1 — pile 5

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 5"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H181.5–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | TRN-P5-T1 (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct"]; own checkpoint bindings LAB_2026A:LAB-T1-POST -> TRN-P5-T1; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-T1-POST-P4

Moisture after T1 — pile 4

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 4"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H183–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | TRN-P4-T1 (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct"]; own checkpoint bindings LAB_2026A:LAB-T1-POST -> TRN-P4-T1; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-T1-POST-P6

Moisture after T1 — pile 6

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 6"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H183–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | TRN-P6-T1 (checkpoint binding) |
| Lab requirement | Parameters ["moisture_pct"]; own checkpoint bindings LAB_2026A:LAB-T1-POST -> TRN-P6-T1; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TRN-P1-T2

Turner T2 — pile 1

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 1"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H186.5–H188; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- entry PREDECESSOR; enabled=true; binding=SAME_SCOPE_INSTANCE; config={"min_rest_hr":8,"activity_codes":["TRN-P1-T1"]}; conflict=none; reason=Locked — waits on {predecessor_label}. This pile rests {rest_required_hr} h after its own T1 ends. {rest_status}
- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TRN-P3-T2

Turner T2 — pile 3

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 3"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H188–H189.5; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}
- entry PREDECESSOR; enabled=true; binding=SAME_SCOPE_INSTANCE; config={"min_rest_hr":8,"activity_codes":["TRN-P3-T1"]}; conflict=none; reason=Locked — waits on {predecessor_label}. This pile rests {rest_required_hr} h after its own T1 ends. {rest_status}

### TRN-P2-T2

Turner T2 — pile 2

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 2"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H189.5–H191; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}
- entry PREDECESSOR; enabled=true; binding=SAME_SCOPE_INSTANCE; config={"min_rest_hr":8,"activity_codes":["TRN-P2-T1"]}; conflict=none; reason=Locked — waits on {predecessor_label}. This pile rests {rest_required_hr} h after its own T1 ends. {rest_status}

### TRN-P5-T2

Turner T2 — pile 5

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 5"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H189.5–H191; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}
- entry PREDECESSOR; enabled=true; binding=SAME_SCOPE_INSTANCE; config={"min_rest_hr":8,"activity_codes":["TRN-P5-T1"]}; conflict=none; reason=Locked — waits on {predecessor_label}. This pile rests {rest_required_hr} h after its own T1 ends. {rest_status}

### TRN-P4-T2

Turner T2 — pile 4

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 4"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H191–H192.5; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}
- entry PREDECESSOR; enabled=true; binding=SAME_SCOPE_INSTANCE; config={"min_rest_hr":8,"activity_codes":["TRN-P4-T1"]}; conflict=none; reason=Locked — waits on {predecessor_label}. This pile rests {rest_required_hr} h after its own T1 ends. {rest_status}

### TRN-P6-T2

Turner T2 — pile 6

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 6"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H191–H192.5; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}
- entry PREDECESSOR; enabled=true; binding=SAME_SCOPE_INSTANCE; config={"min_rest_hr":8,"activity_codes":["TRN-P6-T1"]}; conflict=none; reason=Locked — waits on {predecessor_label}. This pile rests {rest_required_hr} h after its own T1 ends. {rest_status}

### TRN-P1-T3

Turner T3 — pile 1

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 1"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H192.5–H194; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TRN-P3-T3

Turner T3 — pile 3

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 3"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H192.5–H194; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TRN-P2-T3

Turner T3 — pile 2

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 2"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H194–H195.5; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TRN-P4-T3

Turner T3 — pile 4

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 4"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H194–H195.5; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### BNK-B1-FILL

Bunker fill — bunker 1

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Bunker stream |
| Stream / scope / cardinality | BUNKER / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 1"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H194–H196; offset span 2h; duration range 2–2h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-BNK-LOAD from LAB-BNK-LOAD-B1 |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- entry LAB_APPROVED; enabled=true; binding=none; config={"checkpoint_map":"LAB_2026A"}; conflict=none; reason=Locked — waiting for laboratory approval. {checkpoint}: {approved_count} of {required_count} approved. A recorded result is not an approved result.
- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-BNK-LOAD-B1

Bunker loading — bunker 1

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 1"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H194–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | BNK-B1-FILL (checkpoint binding) |
| Lab requirement | Parameters ["bunker_height","ph","ec","moisture_pct","n_pct","ash_pct","cn_ratio","smell","colour","spring"]; own checkpoint bindings LAB_2026A:LAB-BNK-LOAD -> BNK-B1-FILL; incoming checkpoint bindings none |
| Evidence | HEIGHT_PHOTO: Height photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TRN-P5-T3

Turner T3 — pile 5

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 5"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H195.5–H197; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TRN-P6-T3

Turner T3 — pile 6

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Turner |
| Stream / scope / cardinality | YARD / PILE / {"kind":"FIXED_LABEL","label":"Pile 6"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H195.5–H197; offset span 1.5h; duration range 1.5–1.5h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### BNK-B1-HOLD-1

Conditioning hold 1 — bunker 1

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Bunker stream |
| Stream / scope / cardinality | BUNKER / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 1"} |
| Kind / responsible role | HOLD (system elapsed rule) / operator |
| Timing / duration | H196–H259; offset span 63h; duration range 63–63h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | Not explicitly mapped in this inventory; do not infer readiness. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | No definition rows in snapshot |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

### BNK-B2-FILL

Bunker fill — bunker 2

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Bunker stream |
| Stream / scope / cardinality | BUNKER / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 2"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H196–H198; offset span 2h; duration range 2–2h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-BNK-LOAD from LAB-BNK-LOAD-B2 |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- entry LAB_APPROVED; enabled=true; binding=none; config={"checkpoint_map":"LAB_2026A"}; conflict=none; reason=Locked — waiting for laboratory approval. {checkpoint}: {approved_count} of {required_count} approved. A recorded result is not an approved result.
- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-BNK-LOAD-B2

Bunker loading — bunker 2

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 2"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H196–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | BNK-B2-FILL (checkpoint binding) |
| Lab requirement | Parameters ["bunker_height","ph","ec","moisture_pct","n_pct","ash_pct","cn_ratio","smell","colour","spring"]; own checkpoint bindings LAB_2026A:LAB-BNK-LOAD -> BNK-B2-FILL; incoming checkpoint bindings none |
| Evidence | HEIGHT_PHOTO: Height photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### BNK-B2-HOLD-1

Conditioning hold 1 — bunker 2

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Bunker stream |
| Stream / scope / cardinality | BUNKER / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 2"} |
| Kind / responsible role | HOLD (system elapsed rule) / operator |
| Timing / duration | H198–H261; offset span 63h; duration range 63–63h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | Not explicitly mapped in this inventory; do not infer readiness. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | No definition rows in snapshot |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

### BNK-B3-FILL

Bunker fill — bunker 3

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Bunker stream |
| Stream / scope / cardinality | BUNKER / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 3"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H198–H200; offset span 2h; duration range 2–2h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-BNK-LOAD from LAB-BNK-LOAD-B3 |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- entry LAB_APPROVED; enabled=true; binding=none; config={"checkpoint_map":"LAB_2026A"}; conflict=none; reason=Locked — waiting for laboratory approval. {checkpoint}: {approved_count} of {required_count} approved. A recorded result is not an approved result.
- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-BNK-LOAD-B3

Bunker loading — bunker 3

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 3"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H198–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | BNK-B3-FILL (checkpoint binding) |
| Lab requirement | Parameters ["bunker_height","ph","ec","moisture_pct","n_pct","ash_pct","cn_ratio","smell","colour","spring"]; own checkpoint bindings LAB_2026A:LAB-BNK-LOAD -> BNK-B3-FILL; incoming checkpoint bindings none |
| Evidence | HEIGHT_PHOTO: Height photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### BNK-B3-HOLD-1

Conditioning hold 1 — bunker 3

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Bunker stream |
| Stream / scope / cardinality | BUNKER / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 3"} |
| Kind / responsible role | HOLD (system elapsed rule) / operator |
| Timing / duration | H200–H263; offset span 63h; duration range 63–63h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | Not explicitly mapped in this inventory; do not infer readiness. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | No definition rows in snapshot |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

### BNK-B1-RELOAD

Unload, flip and reload — bunker 1

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Bunker stream |
| Stream / scope / cardinality | BUNKER / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 1"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H259–H261; offset span 2h; duration range 2–2h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-RLD-UNL from LAB-RLD-UNL-B1; LAB_2026A:LAB-RLD-RE from LAB-RLD-RE-B1 |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-RLD-UNL-B1

Bunker unloading — reload 1 — bunker 1

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 1"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H259–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | BNK-B1-RELOAD (checkpoint binding) |
| Lab requirement | Parameters ["shrunken_height","moisture_pct"]; own checkpoint bindings LAB_2026A:LAB-RLD-UNL -> BNK-B1-RELOAD; incoming checkpoint bindings none |
| Evidence | HEIGHT_PHOTO: Height photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### BNK-B1-HOLD-2

Conditioning hold 2 — bunker 1

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Bunker stream |
| Stream / scope / cardinality | BUNKER / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 1"} |
| Kind / responsible role | HOLD (system elapsed rule) / operator |
| Timing / duration | H261–H324; offset span 63h; duration range 63–63h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | Not explicitly mapped in this inventory; do not infer readiness. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | No definition rows in snapshot |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

### BNK-B2-RELOAD

Unload, flip and reload — bunker 2

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Bunker stream |
| Stream / scope / cardinality | BUNKER / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 2"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H261–H263; offset span 2h; duration range 2–2h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-RLD-UNL from LAB-RLD-UNL-B2; LAB_2026A:LAB-RLD-RE from LAB-RLD-RE-B2 |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-RLD-UNL-B2

Bunker unloading — reload 1 — bunker 2

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 2"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H261–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | BNK-B2-RELOAD (checkpoint binding) |
| Lab requirement | Parameters ["shrunken_height","moisture_pct"]; own checkpoint bindings LAB_2026A:LAB-RLD-UNL -> BNK-B2-RELOAD; incoming checkpoint bindings none |
| Evidence | HEIGHT_PHOTO: Height photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-RLD-RE-B1

Bunker reloading — reload 1 — bunker 1

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 1"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H261–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | BNK-B1-RELOAD (checkpoint binding) |
| Lab requirement | Parameters ["ph","ec","moisture_pct","n_pct","ash_pct","cn_ratio","smell","colour","spring"]; own checkpoint bindings LAB_2026A:LAB-RLD-RE -> BNK-B1-RELOAD; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### BNK-B2-HOLD-2

Conditioning hold 2 — bunker 2

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Bunker stream |
| Stream / scope / cardinality | BUNKER / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 2"} |
| Kind / responsible role | HOLD (system elapsed rule) / operator |
| Timing / duration | H263–H326; offset span 63h; duration range 63–63h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | Not explicitly mapped in this inventory; do not infer readiness. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | No definition rows in snapshot |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

### BNK-B3-RELOAD

Unload, flip and reload — bunker 3

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Bunker stream |
| Stream / scope / cardinality | BUNKER / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 3"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H263–H265; offset span 2h; duration range 2–2h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-RLD-UNL from LAB-RLD-UNL-B3; LAB_2026A:LAB-RLD-RE from LAB-RLD-RE-B3 |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-RLD-UNL-B3

Bunker unloading — reload 1 — bunker 3

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 3"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H263–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | BNK-B3-RELOAD (checkpoint binding) |
| Lab requirement | Parameters ["shrunken_height","moisture_pct"]; own checkpoint bindings LAB_2026A:LAB-RLD-UNL -> BNK-B3-RELOAD; incoming checkpoint bindings none |
| Evidence | HEIGHT_PHOTO: Height photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-RLD-RE-B2

Bunker reloading — reload 1 — bunker 2

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 2"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H263–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | BNK-B2-RELOAD (checkpoint binding) |
| Lab requirement | Parameters ["ph","ec","moisture_pct","n_pct","ash_pct","cn_ratio","smell","colour","spring"]; own checkpoint bindings LAB_2026A:LAB-RLD-RE -> BNK-B2-RELOAD; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### BNK-B3-HOLD-2

Conditioning hold 2 — bunker 3

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Bunker stream |
| Stream / scope / cardinality | BUNKER / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 3"} |
| Kind / responsible role | HOLD (system elapsed rule) / operator |
| Timing / duration | H265–H330; offset span 65h; duration range 65–65h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | Not explicitly mapped in this inventory; do not infer readiness. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | No definition rows in snapshot |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

### LAB-RLD-RE-B3

Bunker reloading — reload 1 — bunker 3

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 3"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H265–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | BNK-B3-RELOAD (checkpoint binding) |
| Lab requirement | Parameters ["ph","ec","moisture_pct","n_pct","ash_pct","cn_ratio","smell","colour","spring"]; own checkpoint bindings LAB_2026A:LAB-RLD-RE -> BNK-B3-RELOAD; incoming checkpoint bindings none |
| Evidence | SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### BNK-B1-TUN-LOAD

Tunnel loading — bunker 1

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Bunker stream |
| Stream / scope / cardinality | BUNKER / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 1"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H324–H326; offset span 2h; duration range 2–2h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-TUN-PRE from LAB-TUN-PRE; LAB_2026A:LAB-TUN-LOAD from LAB-TUN-LOAD-B1 |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- entry LAB_APPROVED; enabled=true; binding=none; config={"checkpoint_map":"LAB_2026A"}; conflict=none; reason=Locked — waiting for laboratory approval. {checkpoint}: {approved_count} of {required_count} approved. A recorded result is not an approved result.
- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-TUN-PRE

Tunnel readiness

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H324–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | BNK-B1-TUN-LOAD (checkpoint binding) |
| Lab requirement | Parameters ["tunnel_height"]; own checkpoint bindings LAB_2026A:LAB-TUN-PRE -> BNK-B1-TUN-LOAD; incoming checkpoint bindings none |
| Evidence | TUNNEL_PHOTO: Tunnel photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-TUN-LOAD-B1

Tunnel loading — bunker 1

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 1"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H324–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | BNK-B1-TUN-LOAD (checkpoint binding) |
| Lab requirement | Parameters ["ph","ec","moisture_pct","n_pct","ash_pct","cn_ratio","smell","colour","spring"]; own checkpoint bindings LAB_2026A:LAB-TUN-LOAD -> BNK-B1-TUN-LOAD; incoming checkpoint bindings none |
| Evidence | BEFORE_PHOTO: Before photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### BNK-B2-TUN-LOAD

Tunnel loading — bunker 2

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Bunker stream |
| Stream / scope / cardinality | BUNKER / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 2"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H326–H328; offset span 2h; duration range 2–2h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-TUN-LOAD from LAB-TUN-LOAD-B2 |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- entry LAB_APPROVED; enabled=true; binding=none; config={"checkpoint_map":"LAB_2026A"}; conflict=none; reason=Locked — waiting for laboratory approval. {checkpoint}: {approved_count} of {required_count} approved. A recorded result is not an approved result.
- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TN-LEVEL

Levelling & conditioning 1

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Tunnel |
| Stream / scope / cardinality | TUNNEL / TUNNEL / {"kind":"SINGLETON"} |
| Kind / responsible role | HOLD (system elapsed rule) / operator |
| Timing / duration | H326–H345; offset span 19h; duration range 18–20h; confidence FACTORY_RANGE; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | Not explicitly mapped in this inventory; do not infer readiness. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | No definition rows in snapshot |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

### LAB-TUN-LOAD-B2

Tunnel loading — bunker 2

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 2"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H326–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | BNK-B2-TUN-LOAD (checkpoint binding) |
| Lab requirement | Parameters ["ph","ec","moisture_pct","n_pct","ash_pct","cn_ratio","smell","colour","spring"]; own checkpoint bindings LAB_2026A:LAB-TUN-LOAD -> BNK-B2-TUN-LOAD; incoming checkpoint bindings none |
| Evidence | BEFORE_PHOTO: Before photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### BNK-B3-TUN-LOAD

Tunnel loading — bunker 3

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Bunker stream |
| Stream / scope / cardinality | BUNKER / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 3"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H330–H332; offset span 2h; duration range 2–2h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-TUN-LOAD from LAB-TUN-LOAD-B3 |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- entry LAB_APPROVED; enabled=true; binding=none; config={"checkpoint_map":"LAB_2026A"}; conflict=none; reason=Locked — waiting for laboratory approval. {checkpoint}: {approved_count} of {required_count} approved. A recorded result is not an approved result.
- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-TUN-LOAD-B3

Tunnel loading — bunker 3

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / BUNKER_LINE / {"kind":"FIXED_LABEL","label":"Bunker 3"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H330–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | BNK-B3-TUN-LOAD (checkpoint binding) |
| Lab requirement | Parameters ["ph","ec","moisture_pct","n_pct","ash_pct","cn_ratio","smell","colour","spring"]; own checkpoint bindings LAB_2026A:LAB-TUN-LOAD -> BNK-B3-TUN-LOAD; incoming checkpoint bindings none |
| Evidence | BEFORE_PHOTO: Before photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TN-HEAT

Heating up

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Tunnel |
| Stream / scope / cardinality | TUNNEL / TUNNEL / {"kind":"SINGLETON"} |
| Kind / responsible role | HOLD (system elapsed rule) / operator |
| Timing / duration | H345–H355; offset span 10h; duration range 8–12h; confidence FACTORY_RANGE; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | Not explicitly mapped in this inventory; do not infer readiness. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | No definition rows in snapshot |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

### TN-PAST

Pasteurisation

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Tunnel |
| Stream / scope / cardinality | TUNNEL / TUNNEL / {"kind":"SINGLETON"} |
| Kind / responsible role | HOLD (system elapsed rule) / operator |
| Timing / duration | H355–H364.5; offset span 9.5h; duration range 9–10h; confidence FACTORY_RANGE; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | Not explicitly mapped in this inventory; do not infer readiness. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | No definition rows in snapshot |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

### TN-COOL-1

Cooling down 1

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Tunnel |
| Stream / scope / cardinality | TUNNEL / TUNNEL / {"kind":"SINGLETON"} |
| Kind / responsible role | HOLD (system elapsed rule) / operator |
| Timing / duration | H364.5–H377.5; offset span 13h; duration range 12–14h; confidence FACTORY_RANGE; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | Not explicitly mapped in this inventory; do not infer readiness. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | No definition rows in snapshot |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

### TN-COND-2

Conditioning 2

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Tunnel |
| Stream / scope / cardinality | TUNNEL / TUNNEL / {"kind":"SINGLETON"} |
| Kind / responsible role | HOLD (system elapsed rule) / operator |
| Timing / duration | H377.5–H459; offset span 81.5h; duration range 80–85h; confidence FACTORY_RANGE; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | Not explicitly mapped in this inventory; do not infer readiness. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | No definition rows in snapshot |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

### TN-COOL-2

Cooling down 2

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Tunnel |
| Stream / scope / cardinality | TUNNEL / TUNNEL / {"kind":"SINGLETON"} |
| Kind / responsible role | HOLD (system elapsed rule) / operator |
| Timing / duration | H459–H470; offset span 11h; duration range 8–14h; confidence FACTORY_RANGE; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | Not explicitly mapped in this inventory; do not infer readiness. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | No definition rows in snapshot |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

### TUN-DISCHARGE-1

Tunnel discharge to grow-room — stream 1

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Not explicitly mapped; stage decision required |
| Stream / scope / cardinality | TUNNEL / TUNNEL / {"kind":"FIXED_LABEL","label":"Stream 1"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H470–H?; offset span ?h; duration range ?–?h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings LAB_2026A:LAB-QC-FINAL from LAB-QC-FINAL |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### LAB-QC-FINAL

Final QC — tunnel unloading

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Laboratory — stage association requires review |
| Stream / scope / cardinality | YARD / MASTER / {"kind":"SINGLETON"} |
| Kind / responsible role | LAB / lab_tech |
| Timing / duration | H470–H?; offset span ?h; duration range ?–?h; confidence PARALLEL_NO_WALLCLOCK; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | TUN-DISCHARGE-1 (checkpoint binding) |
| Lab requirement | Parameters ["ph","ec","moisture_pct","n_pct","ash_pct","cn_ratio","shrunken_height","actinomycetes","smell","colour","spring"]; own checkpoint bindings LAB_2026A:LAB-QC-FINAL -> TUN-DISCHARGE-1; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; SAMPLE_PHOTO: Sample photograph; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TUN-DISCHARGE-2

Tunnel discharge to grow-room — stream 2

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Not explicitly mapped; stage decision required |
| Stream / scope / cardinality | TUNNEL / TUNNEL / {"kind":"FIXED_LABEL","label":"Stream 2"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H472–H?; offset span ?h; duration range ?–?h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}

### TUN-DISCHARGE-3

Tunnel discharge to grow-room — stream 3

| Field | Current definition |
|---|---|
| Stage (inferred presentation) | Not explicitly mapped; stage decision required |
| Stream / scope / cardinality | TUNNEL / TUNNEL / {"kind":"FIXED_LABEL","label":"Stream 3"} |
| Kind / responsible role | WORK or decision within work / operator |
| Timing / duration | H474–H?; offset span ?h; duration range ?–?h; confidence FACTORY_CONFIRMED; PRE-H0 false |
| Enabled / optional | true / false |
| Prerequisite / start and end conditions | See explicit gate rules below; other implicit runtime rules require separate reconciliation. |
| Explicit successors | Not explicitly mapped in this inventory |
| Lab requirement | Parameters null; own checkpoint bindings none; incoming checkpoint bindings none |
| Evidence | AFTER_PHOTO: After finishing; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true; BEFORE_PHOTO: Before starting; kind=["photo"]; min=1, max=unspecified; required=true; gates submission=true |
| Resources | No explicit resource_requirement rows in snapshot |
| Source / unresolved marker | docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026 / none on this row |

Gate relationships:

- exit EVIDENCE_COMPLETE; enabled=true; binding=none; config={}; conflict=none; reason=Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}
