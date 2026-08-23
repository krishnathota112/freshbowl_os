/**
 * Typed fixtures for the gallery and for render tests.
 *
 * TWO RULES SHAPE THIS FILE, and between them they decide its whole design.
 *
 *   A12 · Time fixtures derive from `docs/source/book1_hour_grid.json`, not from typed-in hours.
 *   A1  · The process length appears nowhere in `src/` (`TIME_CONTRACT §2` invariant 8).
 *
 * Those two cannot both be satisfied by a file of constants: the moment the baseline is written
 * here it is a typed-in hour AND a literal in `src/`. So every fixture is a FUNCTION of the hour
 * geometry, and the geometry is supplied by the caller — from the Book1 grid in tests, and from
 * `process_definition` in the gallery. Nothing in this file knows how long the process is.
 *
 * A13 · every fixture typechecks against the contracts in `src/domain/contracts.ts`, which are the
 * interfaces of `UI_DATA_CONTRACTS.md`. No `any`, no `as`.
 *
 * `UI_IMPLEMENTATION_PLAN §4` rule: a fixture may not contain a state the engine cannot produce.
 * Every `state` below is one of the fourteen in `activity_state`, and every `kind` is one the
 * contract names.
 */

import type {
  ActivityRef,
  BarSegment,
  BatchBar,
  BatchClock,
  BatchFlag,
  EventRow,
  Exception,
  TowerCounters,
} from '../domain/contracts';

/**
 * The hour geometry a fixture needs, supplied from outside.
 *
 * In tests this comes from the Book1 fixture — `total_hours` and `start_date` of a real batch. In
 * the gallery it comes from `process_definition.baseline_hours` and `master_batch.start_at`. Either
 * way it is read, never written.
 */
export type FixtureGeometry = {
  baselineHours: number;
  /** H0 as an instant, or null to exercise the TBD-50 path — which is the live state today. */
  startAt: string | null;
  timezone: string | null;
  timezoneConflictId: string | null;
};

const HOURS_PER_BATCH_DAY = 24;

export function fixtureClock(g: FixtureGeometry): BatchClock {
  return {
    startAt: g.startAt,
    baselineHours: g.baselineHours,
    timezone: g.timezone,
    timezoneConflictId: g.timezoneConflictId,
  };
}

/**
 * A batch's rail, expressed in hours from H0 and derived entirely from `nowHour`.
 *
 * The segments are proportions of the axis, not of a completion figure: `UI_CONTROL_TOWER_SPEC
 * §8.3` bans a batch percentage, and a rest band is drawn calm rather than amber because roughly
 * half the process is resting and §8.4 says a board that renders that as trouble reads as a dead
 * factory at all times.
 */
export function fixtureSegments(g: FixtureGeometry, nowHour: number): BarSegment[] {
  const total = g.baselineHours;
  const now = Math.min(Math.max(1, nowHour), total);

  // One rest band, placed and sized from the axis itself so no duration is invented. A real rail
  // reads its bands from batch_activity; this only has to be shaped like one.
  const restFrom = Math.min(now, Math.max(1, now - HOURS_PER_BATCH_DAY));

  const segments: BarSegment[] = [];
  if (restFrom > 1) {
    segments.push({ fromHour: 1, toHour: restFrom, kind: 'done', label: 'Completed work' });
  }
  segments.push({ fromHour: restFrom, toHour: now, kind: 'resting', label: 'Rest — window running' });
  if (now < total) {
    segments.push({ fromHour: now, toHour: total, kind: 'to_come', label: 'Still to come' });
  }
  return segments;
}

export function fixtureBatchBar(
  g: FixtureGeometry,
  opts: { batchId: string; code: string; label: string; nowHour: number; flags?: BatchFlag[] }
): BatchBar {
  return {
    batchId: opts.batchId,
    code: opts.code,
    label: opts.label,
    clock: fixtureClock(g),
    nowHour: Math.min(Math.max(1, opts.nowHour), g.baselineHours),
    segments: fixtureSegments(g, opts.nowHour),
    flags: opts.flags ?? [],
  };
}

/**
 * Three staggered batches, at the stagger the caller states.
 *
 * `Book1.xlsx` states the stagger; the fixture takes it as a parameter rather than carrying it, for
 * the same reason it does not carry the baseline. Writing the number here would be a typed-in hour
 * under A12, and the test asserts it is absent. Sorted by start hour so the diagonal survives —
 * `UI_CONTROL_TOWER_SPEC §9.1`: do not sort by name or status.
 */
export function fixtureStaircase(g: FixtureGeometry, staggerHours: number): BatchBar[] {
  return [0, 1, 2]
    .map((i) =>
      fixtureBatchBar(g, {
        batchId: `fixture-batch-${i + 1}`,
        code: `MB-FIXTURE-${i + 1}`,
        label: `Fixture batch ${i + 1}`,
        // The oldest batch is furthest along its own axis. The stagger is the caller's number.
        nowHour: Math.max(1, g.baselineHours - i * staggerHours),
        flags:
          i === 1
            ? [
                {
                  kind: 'evidence_gap',
                  activityId: 'fixture-activity-2',
                  note: 'Photo after mixing outstanding',
                },
              ]
            : [],
      })
    )
    .sort((a, b) => (b.nowHour ?? 0) - (a.nowHour ?? 0));
}

/** Four counters, no fifth. Derived from the bars, never stored. */
export function fixtureCounters(bars: BatchBar[]): TowerCounters {
  const held = bars.filter((b) => b.flags.some((f) => f.kind === 'held')).length;
  const needsDecision = bars.filter((b) =>
    b.flags.some((f) => f.kind === 'deviation' || f.kind === 'evidence_gap')
  ).length;
  return {
    running: bars.length,
    onPlan: bars.length - held - needsDecision,
    needsDecision,
    held,
  };
}

/**
 * An exception states how long a PERSON has been the blocker, not just a timestamp.
 * Manual criterion 2. `since` is passed in so the fixture has no clock of its own.
 */
export function fixtureExceptions(since: string): Exception[] {
  return [
    {
      batchId: 'fixture-batch-2',
      batchCode: 'MB-FIXTURE-2',
      activityId: 'fixture-activity-2',
      what: 'Nitrogen + Mineral Mix — ammonium sulphate hand mixing not photographed',
      whoIsWaiting: 'Ramarao',
      since,
      conflictId: null,
    },
    {
      batchId: 'fixture-batch-3',
      batchCode: 'MB-FIXTURE-3',
      activityId: 'fixture-activity-3',
      what: 'Tunnel loading held — GM approval for checkpoint 3 has nowhere to be recorded',
      whoIsWaiting: 'Nobody has decided',
      since,
      conflictId: 'TBD-50',
    },
  ];
}

/**
 * Activities on the axis. `baselineStartHour` is derived from `hour`, and `varianceMinutes` is null
 * on anything that has not ended — the database genuinely returns NULL there, and a fixture that
 * returned 0 would be a state the engine cannot produce.
 */
export function fixtureActivities(g: FixtureGeometry, nowHour: number): ActivityRef[] {
  const now = Math.min(Math.max(1, nowHour), g.baselineHours);
  const earlier = Math.max(1, now - HOURS_PER_BATCH_DAY);

  return [
    {
      activityId: 'fixture-activity-1',
      code: 'FIB1-BUNK-LOAD',
      title: 'Bagasse (new) Bunker Loading',
      scopeLabel: 'Line 1 of 3',
      instanceNo: 1,
      state: 'COMPLETED',
      blockedReason: null,
      baselineStartHour: earlier,
      baselineEndHour: earlier + 2,
      varianceMinutes: 200,
      tbdMarker: null,
    },
    {
      activityId: 'fixture-activity-2',
      code: 'NMIX-ROTAVATE',
      title: 'Nitrogen + Mineral Mix',
      scopeLabel: 'Whole batch',
      instanceNo: 1,
      state: 'IN_PROGRESS',
      blockedReason: null,
      baselineStartHour: now,
      baselineEndHour: now + 6,
      varianceMinutes: null,
      tbdMarker: null,
    },
    {
      activityId: 'fixture-activity-3',
      code: 'TR-T2',
      title: 'Turner Pass T2',
      scopeLabel: 'Pile 2 of 3',
      instanceNo: 2,
      state: 'LOCKED',
      blockedReason: 'Locked — T1 not complete on Pile 2 of 3',
      baselineStartHour: null,
      baselineEndHour: null,
      varianceMinutes: null,
      tbdMarker: null,
    },
    {
      activityId: 'fixture-activity-4',
      code: 'FIB1-REST-1',
      title: 'Bagasse (new) Rest',
      scopeLabel: 'Line 2 of 3',
      instanceNo: 2,
      state: 'WAITING_TIME',
      blockedReason: 'Rest duration has not been set for this batch — TBD-21 is unresolved',
      baselineStartHour: earlier,
      baselineEndHour: null,
      varianceMinutes: null,
      tbdMarker: 'TBD-21',
    },
  ];
}

/** Event rows quote the actor's reason verbatim. Criterion 20. */
export function fixtureEvents(occurredAt: string): EventRow[] {
  return [
    {
      id: 1,
      occurredAt,
      action: 'submit_activity',
      entityId: 'fixture-activity-1',
      actorName: 'Ramarao',
      actorRole: 'operator',
      reason: 'submitted',
    },
    {
      id: 2,
      occurredAt,
      action: 'set_batch_start_at',
      entityId: 'fixture-batch-1',
      actorName: 'Anand',
      actorRole: 'admin',
      reason: 'H0 set',
    },
  ];
}
