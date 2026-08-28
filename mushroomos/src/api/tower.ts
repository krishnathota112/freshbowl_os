import { supabase } from './client';
import type { BatchBar, BarSegment, BatchFlag, Exception, TowerCounters } from '../domain/contracts';
import { nowMs } from '../lib/now';

/**
 * The board's data. `UI_DATA_CONTRACTS §2`.
 *
 * L4-facing: the route calls this, the components take the result as props. `UI_ACCEPTANCE_CRITERIA`
 * A10 forbids any component below L4 from importing this module, and a test enforces it.
 *
 * EVERY NUMBER HERE IS DERIVED FROM A ROW. The counters are computed from the bars rather than
 * stored, the segments come from `batch_activity.baseline_start_hour`, and the baseline comes from
 * `process_definition.baseline_hours`. Nothing is a literal — `TIME_CONTRACT §1.3`, invariant 8.
 *
 * Cancelled batches are excluded by reading `v_live_batch`. A cancelled batch is not running, so it
 * has no place in a running count — but it is still a record, and it still exists in `master_batch`.
 */

type LiveBatchRow = {
  id: string;
  code: string;
  label: string;
  start_at: string | null;
  status: string;
  process_definition: { baseline_hours: number } | null;
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

/** States that mean recorded work. Anything else has not happened. */
const DONE_STATES = new Set(['COMPLETED', 'SKIPPED']);
const RUNNING_STATES = new Set(['IN_PROGRESS', 'SUBMITTED', 'AWAITING_SUPERVISOR']);
const RESTING_STATES = new Set(['WAITING_TIME', 'WAITING_CONDITION', 'AWAITING_LAB']);
/** States where a PERSON is the blocker. These become exceptions and the `needs a decision` count. */
const NEEDS_PERSON_STATES = new Set(['DEVIATION', 'RETURNED', 'BLOCKED']);

export type TowerData = {
  bars: BatchBar[];
  counters: TowerCounters;
  exceptions: Exception[];
  /** The factory clock, so a caller can say why a wall clock is missing rather than inventing one. */
  timezone: string | null;
  timezoneConflictId: string | null;
};

export async function loadTower(): Promise<TowerData> {
  const [batches, clock] = await Promise.all([
    supabase
      .from('v_live_batch')
      .select('id, code, label, start_at, status, process_definition(baseline_hours)')
      .order('start_at', { ascending: true, nullsFirst: false }),
    supabase
      .from('factory_clock')
      .select('timezone, timezone_conflict_id')
      .eq('id', 1)
      .maybeSingle(),
  ]);
  if (batches.error) throw batches.error;
  if (clock.error) throw clock.error;

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

  // One clock for the whole product — the factory's effective now, not the browser's.
  const at = nowMs();
  const bars: BatchBar[] = rows.map((r) => {
    const baselineHours = r.process_definition?.baseline_hours ?? 0;
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

  // Computed once and passed to the counters, so the number and the list it labels cannot
  // disagree — see the note in `countersFor`.
  const exceptions = exceptionsFor(rows, byBatch);

  return {
    bars,
    counters: countersFor(bars, exceptions.length),
    exceptions,
    timezone,
    timezoneConflictId,
  };
}

/** Where the batch is on its own axis. Null when there is no H0 or it is past the baseline. */
function hourNow(startAt: string | null, baselineHours: number, nowMs: number): number | null {
  if (startAt === null || baselineHours <= 0) return null;
  const elapsed = Math.floor((nowMs - Date.parse(startAt)) / 3_600_000) + 1;
  if (elapsed < 1 || elapsed > baselineHours) return null;
  return elapsed;
}

/**
 * One segment per contiguous run of same-meaning activities, on the batch's own hour axis.
 *
 * Not one element per hour: a dozen rows at that rate is thousands of nodes on one board. Activities
 * with no baseline hour are skipped rather than guessed at — A2 leaves the hour NULL where the
 * factory has stated none, and a segment at an invented hour would be worse than a gap.
 */
function segmentsFor(acts: ActivityRow[], baselineHours: number): BarSegment[] {
  if (baselineHours <= 0) return [];

  const placed = acts
    .filter((a) => a.baseline_start_hour !== null)
    .map((a) => {
      /*
        `to` IS DERIVED FROM THE CLAMPED `from`, and that is the whole fix.

        THE DEFECT: `from` was clamped up to 1 while `to` was computed from the RAW
        `baseline_start_hour`. Every Day-0 activity carries `baseline_start_hour = 0` — H0 is an
        INSTANT, and the interval scale is 1-based (`TIME_CONTRACT §1.2`) — so the pair came out
        `from = 1, to = 1`. `mergeSegments` drops zero-width segments, correctly, and eleven
        recorded activities disappeared off the axis.

        What that looked like on screen: `MB-DEMO-EARLY`'s ACTUAL rail read "nothing submitted
        yet" directly above an event stream listing twelve submissions by name. The honest-state
        rule (`UI_ACCEPTANCE_CRITERIA §B1`) fails on the first half of that sentence.

        An activity with no stated end occupies exactly ONE hour. That is a display convention and
        not a claim about the factory — TBD-21 records that several activities have no duration
        stated, and one hour is the narrowest width that keeps the work visible. Widening it to a
        guess would be the invented value that rule E.5 forbids.
      */
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

/**
 * The four counters. `UI_CONTROL_TOWER_SPEC §9` — there is no fifth number and no chart.
 * Derived from the bars, never stored, so they cannot disagree with what is drawn.
 */
export function countersFor(bars: BatchBar[], exceptionCount: number): TowerCounters {
  // `NEEDS A DECISION` counts the ROWS IN THE BAND, because its own sub-label says "in the band
  // above" and a number that disagrees with the list beside it destroys trust in both.
  //
  // The first version counted BATCHES, and excluded any batch that was also held — so a batch that
  // was held AND carried three deviations awaiting a verdict rendered as `NEEDS A DECISION 0`
  // directly above three things needing a decision. Held and needs-a-decision are not mutually
  // exclusive; treating them as a partition is what produced the contradiction.
  //
  // Found by opening the screen. No test caught it, because every test asserted the counters
  // against themselves rather than against what the band renders.
  const held = bars.filter((b) => b.flags.some((f) => f.kind === 'held')).length;
  const onPlan = bars.filter((b) => b.flags.length === 0).length;
  return { running: bars.length, onPlan, needsDecision: exceptionCount, held };
}

function emptyCounters(): TowerCounters {
  return { running: 0, onPlan: 0, needsDecision: 0, held: 0 };
}

/**
 * `NEEDS YOU`. Every row states how long a PERSON has been the blocker — manual criterion 2, and
 * §9.2: "Waiting on you since 07:40 · 1h 34m is the sentence that makes a GM act. A count badge is
 * not."
 *
 * `since` is the last server timestamp on the row. Where none exists the exception says so rather
 * than substituting `now`, which would render as "waiting 0m" and be a lie.
 */
/**
 * WHO the exception is waiting on — which is not who performs the activity.
 *
 * The first version used `responsible_role`, so a deviation that only a supervisor can clear
 * rendered as "waiting on operator". This product exists so an owner can ask the right person;
 * naming the wrong one is worse than naming nobody.
 *
 * `ROLE_AND_APPROVAL_MODEL §2`: release, hold, return and accept-with-deviation are the
 * supervisor's alone. A RETURNED activity is the one case that genuinely waits on whoever performs
 * it — that is what returning means.
 */
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
  // Longest wait first: the oldest blockage is the one that has cost the most.
  return out.sort((x, y) => Date.parse(x.since || '9999') - Date.parse(y.since || '9999'));
}
