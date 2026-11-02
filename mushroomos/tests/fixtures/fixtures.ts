/**
 * Typed fixtures for tests.
 * Extracted from retired src/legacy/dev/fixtures.ts for active test suites.
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
} from '../../src/domain/contracts';

export type FixtureGeometry = {
  baselineHours: number;
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

export function fixtureSegments(g: FixtureGeometry, nowHour: number): BarSegment[] {
  const total = g.baselineHours;
  const now = Math.min(Math.max(1, nowHour), total);

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

export function fixtureStaircase(g: FixtureGeometry, staggerHours: number): BatchBar[] {
  return [0, 1, 2]
    .map((i) =>
      fixtureBatchBar(g, {
        batchId: `fixture-batch-${i + 1}`,
        code: `MB-FIXTURE-${i + 1}`,
        label: `Fixture batch ${i + 1}`,
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
