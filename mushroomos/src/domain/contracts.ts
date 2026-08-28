/**
 * The typed interfaces of `docs/UI_DATA_CONTRACTS.md`, as code.
 *
 * WHY THESE LIVE HERE. `UI_ACCEPTANCE_CRITERIA` A13 requires every fixture to typecheck against
 * the interface in that document rather than being `any`. A document cannot enforce that; a type
 * can. So the shapes are transcribed once, here, and both the fixtures and the components that
 * consume them are checked against the same declaration.
 *
 * This module is part of `src/domain/`, which `ARCHITECTURE_V2 §9` makes a PURE layer: it imports
 * nothing from `api/` and holds no literal from the process. In particular it holds **no baseline
 * length** — `baselineHours` is a field that arrives from `process_definition`, exactly as
 * `TIME_CONTRACT §1.3` requires of every other consumer.
 *
 * Only the contracts C1 actually needs are transcribed. The rest of the document stays in the
 * document until the step that reads it arrives; a type nobody consumes is a claim nobody checks.
 */

import type { ActivityState } from './types';

/**
 * The only way an hour reaches the UI. `UI_DATA_CONTRACTS §1`, `TIME_CONTRACT §1`.
 *
 * `startAt` is H0 as an absolute instant, and it is nullable because it genuinely can be unknown:
 * turning "the factory's start hour" into an instant needs the factory timezone, and TBD-50 is
 * open. A component given `null` must render the stated marker, never a substitute.
 *
 * `timezone` is the IANA name the factory clock is stated in — also nullable, and for the same
 * reason. The batch hour and the batch day need neither field.
 */
export type BatchClock = {
  /** `master_batch.start_at`, ISO. Null while H0 is unknown. */
  startAt: string | null;
  /** `process_definition.baseline_hours`. NEVER a literal. */
  baselineHours: number;
  /** `factory_clock.timezone`, IANA. Null while TBD-50 is open. */
  timezone: string | null;
  /** The conflict to name when `timezone` is null. */
  timezoneConflictId: string | null;
};

/** `UI_DATA_CONTRACTS §1`. A conflict or TBD, quoted at the point of use. */
export type ConflictRef = {
  id: string;
  question: string;
  shipWithDefault: string | null;
};

/** `UI_DATA_CONTRACTS §2`. Four counters, no fifth. `UI_CONTROL_TOWER_SPEC §9`. */
export type TowerCounters = {
  running: number;
  onPlan: number;
  needsDecision: number;
  held: number;
};

/**
 * One segment of a batch's rail. Hours, not percentages — `UI_CONTROL_TOWER_SPEC §8.3` bans a
 * batch percentage outright, and position on the hour axis is the honest indicator.
 */
export type BarSegment = {
  /** `batch_activity.baseline_start_hour`. Hours from H0, point scale. */
  fromHour: number;
  toHour: number;
  kind: 'done' | 'in_progress' | 'resting' | 'to_come';
  label: string;
};

export type BatchFlag = {
  kind: 'deviation' | 'held' | 'evidence_gap' | 'lab_warning';
  activityId: string | null;
  note: string;
};

export type BatchBar = {
  batchId: string;
  code: string;
  label: string;
  clock: BatchClock;
  /** Where the batch is on its own axis. Hours, never a fraction of the whole. */
  nowHour: number | null;
  segments: BarSegment[];
  flags: BatchFlag[];
};

/** `UI_DATA_CONTRACTS §2`. An exception states how long a PERSON has been the blocker. */
export type Exception = {
  batchId: string;
  batchCode: string;
  activityId: string;
  what: string;
  whoIsWaiting: string;
  /** ISO. The UI renders elapsed time from this, spoken. */
  since: string;
  conflictId: string | null;
};

/** `UI_DATA_CONTRACTS §3`. A row of the event stream. */
export type EventRow = {
  id: number;
  occurredAt: string;
  action: string;
  entityId: string;
  actorName: string | null;
  actorRole: string | null;
  reason: string | null;
};

/**
 * `UI_DATA_CONTRACTS §3`. One activity, enough to render a `FiveLayerNode`.
 *
 * `baselineStartHour` is nullable because the factory has stated no per-activity hour yet and A2
 * refuses to invent one; `varianceMinutes` is nullable until there is both a plan and an actual.
 */
export type ActivityRef = {
  activityId: string;
  code: string;
  title: string;
  scopeLabel: string;
  instanceNo: number;
  state: ActivityState;
  blockedReason: string | null;
  baselineStartHour: number | null;
  baselineEndHour: number | null;
  varianceMinutes: number | null;
  tbdMarker: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// S11 · Supervisor Control Room. `UI_DATA_CONTRACTS §11`, built in C9.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A band's contents, OR a statement that the band has no backend yet.
 *
 * `UI_ACCEPTANCE_CRITERIA` 62: "A band with no backend shows its header and a released-with note —
 * NEVER a zero count." A zero that means "not built" reads as "nothing is wrong", which is a lie a
 * supervisor would act on.
 *
 * Making that a TYPE rather than a rule means the compiler will not let a caller render `0` for an
 * unbuilt band: there is no `.length` on the unbuilt branch. Same reasoning as `Bar`'s required
 * `kind` for criterion A4.
 */
export type Band<T> = { built: true; rows: T[] } | { built: false; releasedWith: string; why: string };

/** A rest window opening or expiring soon. §3.3 band 1 — the only genuinely time-critical one. */
export type UrgentGate = {
  activityId: string;
  batchId: string;
  batchCode: string;
  title: string;
  scopeLabel: string;
  /** ISO. The UI renders the countdown from this; the server decides when it actually opens. */
  unblocksAt: string;
};

/** §3.3 band 3. One row per failing condition — B2 writes one deviation per field. */
export type DeviationRow = {
  deviationId: string;
  batchId: string;
  batchCode: string;
  activityId: string | null;
  activityTitle: string | null;
  scopeLabel: string | null;
  kind: string;
  summary: string;
  raisedAt: string;
  raisedByName: string | null;
  raisedByRole: string | null;
  state: string;
  isProtected: boolean;
  conflictId: string | null;
};

/** §3.3 band 4. Every deviation on it has a verdict, so `release_activity` will now succeed. */
export type AwaitingRelease = {
  activityId: string;
  batchId: string;
  batchCode: string;
  title: string;
  scopeLabel: string;
  since: string;
  /** How many were waived rather than resolved. These stay on the record — §3.1. */
  acceptedCount: number;
};

/**
 * §3.3 band 2 — a lab result that failed its frozen band, and has not been superseded.
 *
 * A subset of `UI_DATA_CONTRACTS §13`'s `LabResultSummary`: the room asks "what is stuck", so it
 * needs the reading, the band it missed and where it was taken, not the instrument trail.
 *
 * `verdict` is only ever `'fail'` here. `no_spec` is NOT a failure — TBD-13 — and putting it in this
 * band would turn "nobody has stated a limit" into "something is wrong", which is the specific lie
 * `LAB_MODEL §9` exists to prevent.
 */
export type LabFailure = {
  resultId: string;
  batchId: string;
  batchCode: string;
  activityId: string | null;
  checkpointCode: string;
  /** Which of the two carried checkpoint maps this was filed under — C-33 is still open. */
  checkpointMap: string;
  parameterCode: string;
  value: string;
  unit: string | null;
  /** Frozen at request time. Null means no source gave a bound, and then the verdict is no_spec. */
  targetMin: number | null;
  targetMax: number | null;
  version: number;
  measuredAt: string;
  technicianName: string | null;
  /** The marker on the spec this was judged against, where the spec itself is disputed. */
  conflictId: string | null;
};

export type ControlRoomData = {
  timeCritical: Band<UrgentGate>;
  labIssues: Band<LabFailure>;
  openDeviations: Band<DeviationRow>;
  awaitingRelease: Band<AwaitingRelease>;
  evidenceReview: Band<never>;
  activeBatches: Band<BatchBar>;
};

// ─────────────────────────────────────────────────────────────────────────────
// S4 · Admin Today. `UI_IMPLEMENTATION_PLAN §S4`, built in P1.
//
// Three questions: what starts today, what is running, what needs me. Nothing else — the process
// counts that used to fill this screen belong on /admin/reference.
// ─────────────────────────────────────────────────────────────────────────────

export type StartingToday = {
  batchId: string;
  code: string;
  label: string;
  startDate: string;
  /** Day 0 has already passed. More urgent, not less — so it is shown, not filtered out. */
  overdue: boolean;
  supervisor: string | null;
  /** How many blocking findings stand between this draft and activation. */
  blockingCount: number;
};

export type RunningBatch = {
  batchId: string;
  code: string;
  label: string;
  /** Null when nothing has been recorded. NOT zero — zero would read as "Day 0". */
  nowHour: number | null;
  batchDayNo: number | null;
  baselineHours: number | null;
  flagCount: number;
};

/** One blocking finding from `validate_batch` — the same authority `activate_batch` consults. */
export type AdminBlocker = {
  batchId: string;
  batchCode: string;
  code: string;
  message: string;
  activityId: string | null;
};

export type AdminTodayData = {
  /** Today's date in the FACTORY's timezone, computed by the route and passed in. */
  factoryToday: string;
  startingToday: StartingToday[];
  running: RunningBatch[];
  needsAdmin: AdminBlocker[];
};

// ─────────────────────────────────────────────────────────────────────────────
// S2 · Batch page. `UI_IMPLEMENTATION_PLAN §S2`, `UI_CONTROL_TOWER_SPEC §10`–§13. Built in P3/C11.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One activity that moved the clock.
 *
 * `cause` is the RECORDED reason — a deviation summary or the gate's own blocked reason. NULL
 * means nothing was recorded, which is itself the finding and is rendered as such.
 */
export type Contributor = {
  activityId: string;
  title: string;
  scopeLabel: string;
  stream: string;
  varianceMinutes: number;
  person: string | null;
  machine: string | null;
  cause: string | null;
  hasOpenDeviation: boolean;
  baselineStartHour: number | null;
  /**
   * The conflict this activity carries, from 0024. NULL means the sources agree — never that
   * nobody checked. `UI_CONTROL_TOWER_SPEC §11.2`: the paragraph names the conflict when one
   * applies, and says plainly that the system did not judge the value.
   */
  conflictId: string | null;
};

/**
 * What the paragraph and the "where the time went" block are built from.
 *
 * `varianceMinutes` is NULL when nothing has been measured — distinct from 0, which means measured
 * and on plan. `UI_ACCEPTANCE_CRITERIA §E` item 4: a zero that means "not built" is a lie.
 */
export type BatchVariance = {
  varianceMinutes: number | null;
  /** The batch is as late as its worst stream. Summing across parallel streams double-counts. */
  worstStream: string | null;
  allStreamsSumMinutes: number | null;
  deviationsOnRecord: number;
  deviationsAwaitingVerdict: number;
  /**
   * How much of the batch has been measured at all. This is what tells a reader whether a small
   * variance means "going well" or "barely started" — 0019 §3's own words.
   */
  measuredCount: number;
  activityCount: number;
  /** Ranked worst first, and RESTRICTED to the worst stream — see `loadBatchPage`. */
  contributors: Contributor[];
  /** Everything outside the top three, in minutes. §10: three lines plus a remainder. */
  remainderMinutes: number;
};

/** One row of the chronological stream. `server_decided` marks a gate nobody opened. */
export type BatchEvent = {
  id: number;
  occurredAt: string;
  action: string;
  reason: string | null;
  actorName: string | null;
  actorRole: string | null;
  serverDecided: boolean;
  activityTitle: string | null;
  scopeLabel: string | null;
  batchHour: number | null;
};

export type BatchPageData = {
  bar: BatchBar;
  label: string;
  status: string;
  supervisor: string | null;
  variance: BatchVariance;
  events: BatchEvent[];
};

/* ── the vessel picker (0029) ─────────────────────────────────────────────────────────────── */

/**
 * One slot a batch has to fill — "BUNKER_LINE 2 of this batch".
 *
 * `locationCode` null is an UNFILLED slot, and it is the main thing the picker exists to show.
 * `workStarted` true means material has physically been in this vessel, and changing it now would
 * rewrite where the material actually was.
 */
export type VesselSlot = {
  scope: string;
  needsKind: string;
  instanceNo: number;
  activityCount: number;
  firstDay: number;
  lastDay: number;
  locationId: string | null;
  locationCode: string | null;
  locationLabel: string | null;
  conflictId: string | null;
  allocatedByName: string | null;
  workStarted: boolean;
};

/** Every vessel of a kind, and the reason each unavailable one is unavailable. */
export type VesselOption = {
  locationId: string;
  kind: string;
  code: string;
  label: string;
  status: string;
  /** Physically occupied right now — an open occupancy window. */
  occupiedByBatch: string | null;
  occupiedByBatchId: string | null;
  /** Spoken for by a plan. May be a different batch from the one occupying it. */
  allocatedToBatch: string | null;
  allocatedToBatchId: string | null;
};

/* ── the physical journey (0031) ──────────────────────────────────────────────────────────── */

/**
 * The batch's physical journey: which vessel it is in at each movement, and which individual batch
 * goes to which tunnel.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS REPLACED THE PER-BATCH VESSEL PICKER
 *
 * The first version bound one bunker to a batch for its whole life. The factory's own records do
 * something the first version could not express at all:
 *
 *     Bunker filling   →  Bunker 3
 *     Reload 1         →  Bunker 5
 *     Reload 2         →  Bunker 3      ← back into a bunker it already used
 *
 * and then the master batch splits, one tunnel per individual batch:
 *
 *     366 → Tunnel 10      367 → Tunnel 8      368 → Tunnel 6
 *
 * So a vessel is claimed by a MOVEMENT, not by a batch. Where the material came from is the vessel
 * of the previous movement, which means the chain draws itself and nobody types it twice.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

export type Movement = {
  seq: number;
  code: string;
  label: string;
  needsKind: string | null;
  /** True for tunnel loading: each individual batch chooses its own. */
  perIndividual: boolean;
  individualBatchId: string | null;
  batchNo: string | null;
  movementId: string | null;
  fromLabel: string | null;
  toLocationId: string | null;
  toLabel: string | null;
  toCode: string | null;
  plannedAt: string | null;
  actualAt: string | null;
  fillHeightM: number | null;
  conflictId: string | null;
  recordedByName: string | null;
};

export type IndividualBatch = {
  id: string;
  batchNo: string;
  seq: number;
};
