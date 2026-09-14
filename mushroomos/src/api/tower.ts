import { supabase } from '../shared/api/client';
import type { BatchBar, BarSegment, BatchFlag, Exception, TowerCounters } from '../domain/contracts';
import { nowMs } from '../shared/utilities/now';

type LiveBatchRow = {
  id: string;
  code: string;
  label: string;
  start_at: string | null;
  status: string;
};

type ActivityRow = {
  id: string;
  code: string;
  title: string;
  scope_label: string;
  state: string;
  blocked_reason: string | null;
  baseline_start_hour: number | null;
  baseline_end_hour: number | null;
  master_batch_id: string;
  responsible_role: string;
  submitted_at: string | null;
  tbd_marker: string | null;
};

const DONE_STATES = new Set(['COMPLETED', 'SKIPPED']);
const RUNNING_STATES = new Set(['IN_PROGRESS', 'SUBMITTED', 'AWAITING_SUPERVISOR']);
const RESTING_STATES = new Set(['WAITING_TIME', 'WAITING_CONDITION', 'AWAITING_LAB']);
const NEEDS_PERSON_STATES = new Set(['DEVIATION', 'RETURNED', 'BLOCKED']);

export type TowerData = {
  bars: BatchBar[];
  counters: TowerCounters;
  exceptions: Exception[];
  timezone: string | null;
  timezoneConflictId: string | null;
};

export async function loadTower(): Promise<TowerData> {
  const [batches, clock, standards] = await Promise.all([
    supabase
      .from('v_live_batch')
      .select('id, code, label, start_at, status')
      .order('start_at', { ascending: true, nullsFirst: false }),
    supabase
      .from('factory_clock')
      .select('timezone, timezone_conflict_id')
      .eq('id', 1)
      .maybeSingle(),
    supabase.from('v_batch_forecast').select('master_batch_id, standard_hr'),
  ]);
  if (batches.error) throw batches.error;
  if (clock.error) throw clock.error;
  if (standards.error) throw standards.error;

  const standardOf = new Map<string, number>(
    ((standards.data ?? []) as { master_batch_id: string; standard_hr: number | null }[])
      .filter((r) => r.standard_hr != null)
      .map((r) => [r.master_batch_id, Number(r.standard_hr)])
  );

  const rows = (batches.data ?? []) as unknown as LiveBatchRow[];
  const timezone = (clock.data?.timezone as string | null) ?? null;
  const timezoneConflictId = (clock.data?.timezone_conflict_id as string | null) ?? null;

  if (rows.length === 0) {
    return { bars: [], counters: emptyCounters(), exceptions: [], timezone, timezoneConflictId };
  }

  const { data: actData, error: actErr } = await supabase
    .from('batch_activity')
    .select(
      'id, code, title, scope_label, state, blocked_reason, baseline_start_hour, baseline_end_hour, master_batch_id, responsible_role, submitted_at, tbd_marker'
    )
    .in(
      'master_batch_id',
      rows.map((r) => r.id)
    )
    .order('baseline_start_hour', { ascending: true, nullsFirst: false });
  if (actErr) throw actErr;

  const activities = (actData ?? []) as unknown as ActivityRow[];
  const byBatch = new Map<string, ActivityRow[]>();
  for (const a of activities) {
    const list = byBatch.get(a.master_batch_id);
    if (list) list.push(a);
    else byBatch.set(a.master_batch_id, [a]);
  }

  const at = nowMs();
  const bars: BatchBar[] = rows.map((r) => {
    const baselineHours = standardOf.get(r.id) ?? 0;
    const acts = byBatch.get(r.id) ?? [];

    return {
      batchId: r.id,
      code: r.code,
      label: r.label,
      clock: { startAt: r.start_at, baselineHours, timezone, timezoneConflictId },
      nowHour: hourNow(r.start_at, baselineHours, at),
      segments: segmentsFor(acts, baselineHours),
      flags: flagsFor(acts),
    };
  });

  const exceptions = exceptionsFor(rows, byBatch);

  return {
    bars,
    counters: countersFor(bars, exceptions.length),
    exceptions,
    timezone,
    timezoneConflictId,
  };
}

function hourNow(startAt: string | null, baselineHours: number, nowMs: number): number | null {
  if (startAt === null || baselineHours <= 0) return null;
  const elapsed = Math.floor((nowMs - Date.parse(startAt)) / 3_600_000) + 1;
  if (elapsed < 1 || elapsed > baselineHours) return null;
  return elapsed;
}

function segmentsFor(acts: ActivityRow[], baselineHours: number): BarSegment[] {
  if (baselineHours <= 0) return [];

  const placed = acts
    .filter((a) => a.baseline_start_hour !== null)
    .map((a) => {
      const from = Math.max(1, a.baseline_start_hour as number);
      const to = Math.min(baselineHours, Math.max(from + 1, (a.baseline_end_hour ?? 0) + 1));
      return { from, to, kind: kindOf(a.state), label: `${a.title} — ${a.scope_label}` };
    })
    .sort((x, y) => x.from - y.from || x.to - y.to);

  const out: BarSegment[] = [];
  for (const p of placed) {
    const last = out.at(-1);
    if (last && last.kind === p.kind && p.from <= last.toHour) {
      last.toHour = Math.max(last.toHour, p.to);
    } else if (last && p.from < last.toHour) {
      out.push({ fromHour: last.toHour, toHour: Math.max(last.toHour, p.to), kind: p.kind, label: p.label });
    } else {
      if (last && p.from > last.toHour) {
        out.push({ fromHour: last.toHour, toHour: p.from, kind: 'to_come', label: 'No activity on the axis here' });
      }
      out.push({ fromHour: p.from, toHour: p.to, kind: p.kind, label: p.label });
    }
  }

  const first = out[0];
  if (first && first.fromHour > 1) {
    out.unshift({ fromHour: 1, toHour: first.fromHour, kind: 'to_come', label: 'Before the first placed activity' });
  }
  const last = out.at(-1);
  if (last && last.toHour < baselineHours) {
    out.push({ fromHour: last.toHour, toHour: baselineHours, kind: 'to_come', label: 'Still to come' });
  }
  if (out.length === 0) {
    out.push({ fromHour: 1, toHour: baselineHours, kind: 'to_come', label: 'Nothing placed on the axis yet' });
  }
  return out;
}

function kindOf(state: string): BarSegment['kind'] {
  if (DONE_STATES.has(state)) return 'done';
  if (RUNNING_STATES.has(state)) return 'in_progress';
  if (RESTING_STATES.has(state)) return 'resting';
  return 'to_come';
}

function flagsFor(acts: ActivityRow[]): BatchFlag[] {
  const flags: BatchFlag[] = [];
  for (const a of acts) {
    if (a.state === 'DEVIATION') {
      flags.push({ kind: 'deviation', activityId: a.id, note: a.blocked_reason ?? `${a.title} is in deviation` });
    } else if (a.state === 'BLOCKED' || a.state === 'RETURNED') {
      flags.push({ kind: 'held', activityId: a.id, note: a.blocked_reason ?? `${a.title} is held` });
    } else if (a.state === 'AWAITING_LAB') {
      flags.push({ kind: 'lab_warning', activityId: a.id, note: a.blocked_reason ?? `${a.title} awaits the lab` });
    }
  }
  return flags;
}

export function countersFor(bars: BatchBar[], exceptionCount: number): TowerCounters {
  const held = bars.filter((b) => b.flags.some((f) => f.kind === 'held')).length;
  const onPlan = bars.filter((b) => b.flags.length === 0).length;
  return { running: bars.length, onPlan, needsDecision: exceptionCount, held };
}

function emptyCounters(): TowerCounters {
  return { running: 0, onPlan: 0, needsDecision: 0, held: 0 };
}

function waitingOn(state: string, responsibleRole: string): string {
  switch (state) {
    case 'DEVIATION':
    case 'BLOCKED':
    case 'AWAITING_SUPERVISOR':
      return 'supervisor';
    case 'AWAITING_LAB':
      return 'lab_tech';
    case 'RETURNED':
      return responsibleRole;
    default:
      return responsibleRole;
  }
}

function exceptionsFor(
  rows: LiveBatchRow[],
  byBatch: Map<string, ActivityRow[]>
): Exception[] {
  const out: Exception[] = [];
  for (const r of rows) {
    for (const a of byBatch.get(r.id) ?? []) {
      if (!NEEDS_PERSON_STATES.has(a.state)) continue;
      out.push({
        batchId: r.id,
        batchCode: r.code,
        activityId: a.id,
        what: `${a.title} — ${a.scope_label}: ${a.blocked_reason ?? a.state}`,
        whoIsWaiting: waitingOn(a.state, a.responsible_role),
        since: a.submitted_at ?? '',
        conflictId: a.tbd_marker,
      });
    }
  }
  return out.sort((x, y) => Date.parse(x.since || '9999') - Date.parse(y.since || '9999'));
}
