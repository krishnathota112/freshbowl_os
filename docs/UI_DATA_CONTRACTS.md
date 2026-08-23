# UI DATA CONTRACTS

The typed interface between Track C and Tracks A/B. A component is built against the interface;
the route swaps a fixture for a query when the source lands, **and the component does not
change**.

**Availability legend**

| Tag | Meaning |
|---|---|
| `NOW` | reads tables/RPCs that exist in the repository today |
| `A2` | needs the hour axis (`start_at`, `standard_start_hour`, `planned_*_at`, `variance_minutes`) |
| `A4` | needs evidence storage (`evidence_media`, bucket, ownership checks) |
| `A5` | needs `location_occupancy` and `machine_usage` |
| `B1` | needs `evaluate_gates` — until then activity state is produced by a global day barrier |
| `B2` | needs the `deviation` entity and release/hold/return |
| `B4` | needs the variance-attribution view |
| `B5` | needs the lab subsystem (`lab_sample`, `lab_test`, `lab_result`, `lab_instrument`) |
| `⛔C-nn` | blocked on an unresolved factory question, not on engineering |

**Rules**

1. Every field maps to a real column, a real RPC return, or a stated derivation. **No field
   exists here that the database will not hold.**
2. Nullable means *the source genuinely gives no value* — render `—` with the source ref, never
   a blank and never a substituted default (`LAB_MODEL §9`).
3. `conflictId` appears wherever a value is disputed. It is not optional decoration; it is the
   mechanism of `UI_DESIGN_SPEC §5`.
4. Hours are **Book1 hours**: 1-based interval indices. `H`n is an instant.
   `TIME_CONTRACT §1.2`. Any field named `*Hour` is an interval index; any named `*At` is an
   instant.

---

## 0. Shared types

```ts
type ActivityState =            // src/domain/types.ts — exists, 14 values, do not widen
  'LOCKED' | 'READY' | 'IN_PROGRESS' | 'SUBMITTED' | 'AWAITING_LAB' | 'WAITING_TIME'
  | 'WAITING_CONDITION' | 'AWAITING_SUPERVISOR' | 'BLOCKED' | 'DEVIATION' | 'RETURNED'
  | 'COMPLETED' | 'SKIPPED' | 'CANCELLED';

type Density = 'operator' | 'lab' | 'supervisor' | 'admin' | 'manager' | 'gm';   // exists

type Tone = 'ok' | 'warn' | 'crit' | 'inherit' | 'lock' | 'accent' | 'muted';    // exists

/** The only way an hour reaches the UI. TIME_CONTRACT §1. */
type BatchClock = {
  startAt: string;          // master_batch.start_at   ISO      A2
  baselineHours: number;    // process_definition — NEVER a literal
  nowHour: number | null;   // derived; null for a draft
  timezone: string;         // factory timezone            ⛔TBD-50
  h0Conflict: 'TBD-47';     // always present until answered
};

type ConflictRef = { id: string; question: string; shipWithDefault: string | null };  // NOW
```

---

## 1. Control Tower — S1

```ts
type TowerCounters = {                                    // derived from BatchBar[]
  running: number;
  onPlan: number;
  needsDecision: number;
  held: number;
};                                                        // NOW (shape) · A2+B2 (truth)

type BatchBar = {
  batchId: string;
  code: string;               // master_batch.code                     NOW
  label: string;              // master_batch.label                    NOW
  startAt: string;            // master_batch.start_at                 A2
  baselineHours: number;      // process_definition                    A2
  nowHour: number | null;     // derived from startAt + server now      A2
  forecastHours: number | null; // baseline + accumulated variance      B4
  segments: BarSegment[];
  flags: BatchFlag[];
};

type BarSegment = {
  fromHour: number;           // batch_activity.baseline_start_hour     A2
  toHour: number;
  kind: 'work' | 'rest';      // batch_activity.is_time_gate            NOW
  rail: 'plan' | 'actual';
  state: ActivityState;       // batch_activity.state                   NOW · honest at B1
  label: string;              // batch_activity.title                   NOW
  activityId: string;
};

type BatchFlag = {
  kind: 'deviation' | 'held' | 'evidence_gap' | 'lab_warning';
  activityId: string | null;
  summary: string;
};                            // deviation/held B2 · evidence_gap NOW · lab_warning B5

type Exception = {
  batchId: string; batchCode: string;
  activityId: string;
  what: string;               // one sentence, no code
  whoIsWaiting: 'gm' | 'supervisor' | 'admin';
  since: string;              // ISO — the UI renders "waiting 1h 34m"
  severity: 'needs_decision' | 'held';
};                                                        // B2
```

**Sources.** `master_batch`, `batch_activity` `NOW`; hours `A2`; `deviation` `B2`.
**Sort.** `BatchBar[]` **must** arrive sorted by `startAt` and the UI must not re-sort —
`UI_CONTROL_TOWER_SPEC §9.1`, the diagonal is the explanation.

---

## 2. Batch Page / 552h rail — S2

```ts
type BatchOverview = {
  batchId: string; code: string; label: string;
  status: 'draft' | 'active' | string;      // master_batch.status              NOW
  clock: BatchClock;                                                          // A2
  planRail: BarSegment[];                                                     // A2
  actualRail: BarSegment[];                                                   // A2
  forecast: { endHour: number; varianceMinutes: number } | null;              // B4
  currentPosition: {                        // one per active stream, not six
    stream: string; scopeLabel: string; activityId: string; title: string;
    startedAt: string | null; targetMinHr: number | null; targetMaxHr: number | null;
  }[];                                                                        // NOW
};

type TimeAttribution = {
  totalVarianceMinutes: number;
  contributors: {                            // ranked; UI shows top 3
    activityId: string; title: string; scopeLabel: string;
    varianceMinutes: number;
    cause: string | null;                    // e.g. "lab result came at 09:40"
    person: string | null; machine: string | null;
  }[];
  remainderMinutes: number;                  // everything outside the top 3
};                                                                            // B4

type EventRow = {
  id: number; occurredAt: string;            // audit_event                    NOW
  action: string; entityId: string;
  actorName: string | null; actorRole: string | null;
  reason: string | null;
  batchHour: number | null;                  // derived from clock             A2
};
```

**Sources.** `master_batch`, `batch_activity`, `audit_event` `NOW`; hour fields `A2`;
attribution `B4`; honest `state` `B1`.

**Note.** `audit_event` today carries only the ~8 hand-written inserts inside RPCs
(`CONTRACT_AUDIT §3.9`). `EventStream` renders what exists and states that the trail becomes
complete at **B3**; it does not fabricate missing events.

---

## 3. Evidence / Decision panel — S3

```ts
type ActivityDetail = {
  activityId: string; batchId: string;
  code: string; title: string; scopeLabel: string; instanceNo: number;       // NOW
  state: ActivityState; blockedReason: string | null; unblocksAt: string | null; // NOW
  baselineStartHour: number | null; baselineEndHour: number | null;          // A2
  plannedStartAt: string | null; plannedEndAt: string | null;                // A2
  actualStartAt: string | null; actualEndAt: string | null;                  // NOW
  varianceMinutes: number | null;                                            // A2 (generated)
  responsibleRole: string;                                                   // NOW
  person: { id: string; name: string } | null;                               // NOW
  machine: { code: string; name: string } | null;                            // NOW
  vehicle: { code: string; name: string } | null;                            // NOW
  sourceLocation: { code: string; label: string } | null;                    // NOW
  destinationLocation: { code: string; label: string } | null;               // NOW
  goldenRule: string | null;                                                 // NOW
  tbdMarker: string | null;                                                  // NOW
  values: ActivityValue[];
  evidence: EvidenceRequirementState[];
  labResults: LabResultSummary[];                                            // B5
  decision: DecisionRecord | null;                                           // B2
};

type ActivityValue = {                        // batch_activity_value — the six columns
  fieldKey: string; label: string; unit: string | null;                      // NOW
  sopValue: string | null; sopMin: number | null; sopMax: number | null;     // NOW
  sopSourceRef: string | null;                // cites the ABSENCE too       // NOW
  day0Value: string | null;                                                  // NOW
  actualValue: string | null;                                                // NOW
  varianceFlag: 'in_range' | 'out_of_range' | 'not_applicable' | null;       // NOW
  recordedAt: string | null; recordedBy: string | null;                      // NOW
  conflictId: string | null;                                                 // NOW
  operatorInput: 'required' | 'optional' | 'not_collected';                  // NOW
};

type EvidenceRequirementState = {
  requirementId: string; key: string; label: string;                         // NOW
  mediaKinds: string[]; minCount: number; satisfiedCount: number;            // NOW
  gatesSubmission: boolean; captureHint: string | null;                      // NOW
  media: EvidenceMedia[];                                                    // A4
};

type EvidenceMedia = {
  id: string; storagePath: string; signedUrl: string;
  kind: 'photo' | 'video';
  uploadedBy: string; uploadedByName: string;
  uploadedAt: string;                          // SERVER timestamp
};                                                                            // A4

type DecisionRecord = {
  kind: 'released' | 'held' | 'returned' | 'accepted_with_deviation';
  actorName: string; actorRole: string; at: string;
  reason: string;                              // quoted VERBATIM in the UI
  deviationId: string | null; stillOpen: boolean;
};                                                                            // B2
```

**Until A4**, `media` is `[]` and the panel states plainly that photographs are stored from the
evidence release onward. `satisfiedCount` is shown as a **historical record**, never as a
stand-in for a picture.

---

## 4. Admin Today — S4

```ts
type TodayItem = {
  kind: 'needs_day0_answer' | 'ready_to_validate' | 'ready_to_activate'
      | 'gate_opening_today' | 'open_question';
  batchId: string | null; batchCode: string | null;
  summary: string;
  detail: string | null;
  conflictId: string | null;                  // for 'open_question'
  href: string;
};                                            // NOW · 'gate_opening_today' needs A2
```

Sources: `master_batch`, `batch_activity`, `validate_batch` (severity `info` supplies
`open_question`), `conflict_register`. All `NOW`.

---

## 5. Monthly Schedule — S5 ⛔ **C-19, C-20**

Interface defined so the screen can be finished the day it unblocks. **No source exists; do not
implement a fetch.**

```ts
type SchedulePeriod = { code: string; from: string; to: string };
type ScheduleSlot = {
  date: string;                    // calendar date
  batchGroupLabel: string;         // e.g. "118 119 120"
  token: string;                   // the scheduled activity token
  mappedActivityCode: string | null;  // null while C-20 is open — MOST WILL BE NULL
  conflictId: string | null;
};
type ScheduleGrid = { period: SchedulePeriod; slots: ScheduleSlot[] };
```

`mappedActivityCode` is deliberately nullable and deliberately mostly null: **C-20** says the
mapping may no longer hold, and **C-35** records that the live `AUG - SEP` sheet and
`PROCESS-2026B` disagree by about a day from D2 onward. A UI that fills this in has made a
factory decision.

---

## 6. Master Batch Creation — S6

```ts
type BatchDraftInput = {
  code: string; label: string;
  startAt: string;                 // date + time. MANDATORY. TBD-47 marker.     A2
  roles: { role: string; materialCode: string; lead: boolean }[];                // NOW
  config: Record<string, string | number>;   // quantities, counts, rest hours   NOW
};

type Consequence = {               // the live rail — all derived, none stored
  loadCount: { value: number; formula: string };      // "ceil(21.0 / 2.0) = 11"  NOW
  instanceCounts: { scope: string; count: number }[];                            NOW
  computedBaselineHours: number;   // from standard_start_hour — may differ       A2
  baselineHours: number;           // from process_definition
  restsUnset: { activityCode: string; label: string }[];   // blocks activation   NOW
};

type RoleBindingOption = {         // material_role_eligibility + material
  role: string; materials: { id: string; code: string; name: string }[];
  defaultLeadId: string | null; tbdMarker: string | null;
};                                                                                NOW
```

**`computedBaselineHours` may differ from `baselineHours`. Show the difference; never clamp it**
(`TIME_MODEL_CONFIRMED §5`). Hopper mode offers Water and Dry; **Auto is rendered disabled**
(frozen decision 1). Rest durations have **no default** (frozen decision 2).

Writes: `create_master_batch(p_code, p_label, p_start_date, p_config, p_roles, p_supervisor,
p_weather)` — `NOW`, gains a `start_at` parameter at `A2`.

---

## 7. Batch Review / Activation — S7

```ts
type Finding = {                   // validate_batch returns exactly this
  severity: 'blocking' | 'warning' | 'info';
  code: string;                    // 'REST_NO_DURATION', 'SAME_VESSEL', 'TBD-21', …
  message: string;
  activityId: string | null;
};                                                                                NOW

type ScheduleRow = { /* as src/api/schedule.ts already defines — 30 fields */ };  NOW
```

Writes, all existing: `set_activity_plan(activityId, patch)` — whitelist ·
`assign_activity(activityId, personId, reason)` · `send_alert(...)` · `activate_batch(id)`.

`activate_batch` raises a human-readable exception listing blockers. **Render it verbatim.**

---

## 8. Operator My Work — S8

```ts
type WorkItem = {
  activityId: string; batchId: string; batchCode: string;
  title: string; scopeLabel: string; instanceNo: number;                          NOW
  state: ActivityState; blockedReason: string | null;                             NOW
  unblocksAt: string | null;                  // server-stamped, drives Countdown  NOW
  baselineStartHour: number | null;                                               A2
  plannedStartAt: string | null;                                                  A2
  band: 'now' | 'waiting' | 'later';          // derived from state
  goldenRule: string | null;                                                      NOW
  evidenceOutstanding: number;                                                    NOW
};
```

Write: `release_elapsed_rests(batchId)` / `advance_batch(batchId)` — poll, then refetch. `NOW`.
Honest banding depends on `B1`; until then `state` is produced by the global day barrier and
`MyWork` may show items whose true predecessor is incomplete. **Do not paper over this in the
UI** — it is fixed in `B1`, not here.

---

## 9. Current Activity — S9

```ts
type TaskDetail = ActivityDetail;              // same shape, operator density

type RunningTotal = {                          // LOAD-scoped activities only
  targetMt: number; loadedMt: number; remainingMt: number;
  loadsDone: number; loadsPlanned: number;     // "9 / ~11" — planned is approximate
};                                                                                NOW

type SubmitResult = {                          // submit_activity returns this
  newState: string;
  outOfRange: number;
  outstandingEvidence: string | null;          // NAMES the requirement
};                                                                                NOW
```

Writes: `start_activity(id)` · `submit_activity(id, values, remarks)`. Both `NOW`.

**Contract detail the UI must honour:** `submit_activity` records values **even when out of
range** and **even when evidence is outstanding** — it returns `IN_PROGRESS` plus the named
outstanding requirement. Submit stays enabled. *Evidence gates submission, not recording.*

---

## 10. Evidence Capture — S10 ⛔ **A4**

```ts
type CaptureRequest = {
  activityId: string; requirementKey: string;
  file: File; kind: 'photo' | 'video';
};
type CaptureResult = { mediaId: string; storagePath: string; uploadedAt: string;
                       satisfiedCount: number; minCount: number };
```

Replaces `mark_evidence(reqId)`, which today increments a counter with **no file, no path, no
uploader and no ownership check** (`CONTRACT_AUDIT §3.3`). Until `A4`, S10 renders read-only.
**Do not call `mark_evidence` from a capture affordance.**

---

## 11. Supervisor Control Room — S11

```ts
type ControlRoomBands = {
  timeCritical: WorkItem[];        // gates opening/expiring within 4 h            NOW
  labIssues: LabResultSummary[];                                                   B5
  openDeviations: DeviationRow[];                                                  B2
  awaitingRelease: WorkItem[];                                                     B2
  evidenceReview: EvidenceRequirementState[];                                      A4
  activeBatches: BatchBar[];                                                       NOW
};

type DeviationRow = {
  deviationId: string; batchId: string; batchCode: string;
  activityId: string; activityTitle: string; scopeLabel: string;
  raisedAt: string; raisedByName: string;
  triggeringValues: { label: string; value: string; unit: string | null;
                      against: string; conflictId: string | null }[];
  state: 'open' | 'accepted' | 'resolved';
};                                                                                 B2
```

Writes `B2`: `release(activityId, reason)` · `hold(activityId, reason)` ·
`return_activity(activityId, reason)` · `accept_with_deviation(deviationId, reason)`.
**Reason is mandatory on every one.**

A band with no backend renders its header and the note "released with B2" —
**never a zero count**, which would read as "nothing is wrong".

---

## 12. Lab Queue — S12

```ts
type LabQueueItem = {
  batchId: string; batchCode: string; batchLabel: string;                          NOW
  currentDay: number;                          // batchDay(nowHour) at A2; rel_day NOW
  activityId: string; activityTitle: string;                                       NOW
  parameters: string[];                        // process_activity.lab_parameters   NOW
  state: ActivityState;                                                            NOW
  actionRequired: boolean;                     // state in READY|IN_PROGRESS|RETURNED
  lastSubmission: 'pending' | 'approved' | 'rejected' | null;                       B5
  band: 'overdue' | 'today' | 'retest';
  blocking: string | null;                     // what an overdue item holds up      B1
};
```

**Buildable now on real data:** nine lab activities are already seeded into `batch_activity`
with `responsible_role = 'lab_tech'` and `lab_parameters`
(`supabase/seed/s08_routing_lab_activities.sql`).

---

## 13. Current Sample / Test — S13

```ts
type LabParameterSpec = {
  parameterCode: string; label: string; unit: string | null;
  kind: 'numeric' | 'observation' | 'derived';
  min: number | null; max: number | null;      // null = NO source gives a bound
  sourceRef: string;                           // cites the absence too
  conflictId: string | null;                   // C-01 renders BOTH bands
  options: string[] | null;                    // observations only
  derivedFrom: string[] | null;                // C:N ← ash, nitrogen
};                                                                                 NOW

type LabResultSummary = {
  resultId: string; parameterCode: string; version: number;
  value: string; unit: string | null;
  verdict: 'pass' | 'fail' | 'no_spec' | 'invalid';
  targetMin: number | null; targetMax: number | null;   // FROZEN at request time
  measuredAt: string; technicianName: string;
  instrument: { code: string; calibration: 'valid'|'due'|'expired'|'unknown' } | null;
  supersedesResultId: string | null; supersededByResultId: string | null;
};                                                                                 B5
```

**Rules the UI must enforce.**
- `kind: 'derived'` renders in `lock` tone with a `derived` chip and **no input**.
- `min`/`max` both null → verdict is `no_spec`. **Never auto-fail** (`TBD-13`).
- `conflictId` present → render **both** candidate bands side by side and judge neither
  (C-01: operator target 68–69 %, lab band 75–78 %).
- The submit button reads **"Submit for approval"**. It must not name GM or Supervisor —
  ⛔ **C-32** is unresolved.

---

## 14. Manager Resource View — S14

```ts
type VesselOccupancy = {
  locationId: string; code: string; label: string;
  kind: 'BUNKER' | 'TUNNEL' | 'YARD' | 'PILE' | 'STRAW_PILE' | 'SOAK_PIT' | 'HOPPER';
  stints: { batchId: string; batchCode: string; fromAt: string; toAt: string;
            contentKind: 'compost' | 'straw'; activityId: string }[];
};                                                                                 A5

type MachineLoad = {
  machineId: string; code: string; name: string; kind: string;
  hours: number;                    // DERIVED from stints — no editable field      A5
  stints: { batchId: string; activityId: string; fromAt: string; toAt: string;
            operatorName: string | null }[];
};                                                                                 A5

type ResourceConflict = {
  locationId: string; code: string;
  batchA: { id: string; code: string; window: [string, string] };
  batchB: { id: string; code: string; window: [string, string] };
  detectedBy: 'exclusion_constraint' | 'validate_batch';
};                                                                                 A5

type FleetInventory = {            // what the screen already shows today
  locations: { kind: string; code: string; label: string; maxFillHeightM: number | null }[];
  machines: { code: string; name: string; kind: string; tbdMarker: string | null }[];
};                                                                                 NOW
```

`MachineLoad.hours` is derived. **No editable hours field may exist anywhere in the schema or
the UI** — `DEMO_PLAN_V2` criterion 20.

---

## 15. Contract change process

Interfaces here are the agreement between three tracks. Changing one mid-build silently breaks
another.

1. A field may be **added** freely if it is optional and the component degrades without it.
2. **Renaming or removing a field, or making an optional field required, is a change to this
   document first** — then the fixture, then the component, then the query.
3. If connecting a component to a real query requires editing the component, **the interface was
   wrong.** Fix it here, not in the component.
4. No field is added here without a real column, a real RPC return, or a stated derivation
   behind it. An interface that promises data nobody will produce is how a fake UI gets built.
