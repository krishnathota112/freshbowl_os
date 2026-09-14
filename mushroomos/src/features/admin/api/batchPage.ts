import { supabase } from './client';
import { loadTower } from './tower';
import type {
  BatchEvent,
  BatchPageData,
  BatchVariance,
  Contributor,
} from '../domain/contracts';

/**
 * S2's data. `UI_IMPLEMENTATION_PLAN §S2`, `UI_CONTROL_TOWER_SPEC §10`–§13.
 *
 * ONE CORRECTNESS RULE SHAPES THIS WHOLE MODULE.
 *
 * `v_batch_variance.variance_minutes` is the WORST STREAM, not the sum across streams — because
 * `PROCESS-2026B` runs four streams simultaneously and summing them counts the same wall-clock
 * twice (0019's header).
 *
 * `v_variance_contributor` ranks activities across the WHOLE batch. So the top-ranked contributor
 * may sit in a different stream from the one the headline came from — and "most of it came from X"
 * would then name an activity whose minutes are not in the number printed above it.
 *
 * The contributors are therefore FILTERED TO THE WORST STREAM. Within a stream activities are
 * sequential and their minutes genuinely add up, which is the only reading under which the
 * paragraph's arithmetic is true.
 */

const TOP_N = 3;

type VarianceRow = {
  variance_minutes: number | null;
  worst_stream: string | null;
  all_streams_sum_minutes: number | null;
  deviations_on_record: number;
  deviations_awaiting_verdict: number;
  measured_count: number;
  activity_count: number;
};

type ContributorRow = {
  activity_id: string;
  title: string;
  scope_label: string;
  stream: string;
  variance_minutes: number;
  person: string | null;
  machine: string | null;
  cause: string | null;
  has_open_deviation: boolean;
  baseline_start_hour: number | null;
  rank: number;
  tbd_marker: string | null;
};

type EventRow = {
  id: number;
  occurred_at: string;
  action: string;
  reason: string | null;
  actor_name: string | null;
  actor_role: string | null;
  server_decided: boolean;
  activity_title: string | null;
  scope_label: string | null;
  batch_hour: number | null;
};

export async function loadBatchPage(batchId: string): Promise<BatchPageData> {
  const [tower, header, varianceRes, contribRes, eventRes] = await Promise.all([
    // The bar carries the clock, the segments and the hour position. Reusing it rather than
    // recomputing the axis is what keeps this page and the tower from disagreeing.
    loadTower(),
    supabase
      .from('master_batch')
      .select('id, code, label, status, supervisor_name')
      .eq('id', batchId)
      .single(),
    supabase
      .from('v_batch_variance')
      .select(
        'variance_minutes, worst_stream, all_streams_sum_minutes, deviations_on_record, ' +
          'deviations_awaiting_verdict, measured_count, activity_count'
      )
      .eq('master_batch_id', batchId)
      .maybeSingle(),
    supabase
      .from('v_variance_contributor')
      .select(
        'activity_id, title, scope_label, stream, variance_minutes, person, machine, cause, ' +
          'has_open_deviation, baseline_start_hour, rank, tbd_marker'
      )
      .eq('master_batch_id', batchId)
      .order('rank'),
    supabase
      .from('v_batch_event')
      .select(
        'id, occurred_at, action, reason, actor_name, actor_role, server_decided, ' +
          'activity_title, scope_label, batch_hour'
      )
      .eq('master_batch_id', batchId)
      .order('occurred_at', { ascending: false })
      .limit(200),
  ]);

  if (header.error) throw header.error;
  if (varianceRes.error) throw varianceRes.error;
  if (contribRes.error) throw contribRes.error;
  if (eventRes.error) throw eventRes.error;

  const bar = tower.bars.find((b) => b.batchId === batchId);
  if (!bar) {
    // A cancelled batch is excluded from `v_live_batch` and therefore from the tower. It is still
    // a record; it just has no live position, and saying so beats rendering a blank axis.
    throw new Error(
      'This batch is not running. Cancelled and completed batches keep their record but have no live position on the hour axis.'
    );
  }

  const v = (varianceRes.data ?? null) as VarianceRow | null;
  const allContributors = (contribRes.data ?? []) as unknown as ContributorRow[];

  // THE FILTER THIS MODULE EXISTS FOR — see the header.
  const inWorstStream = v?.worst_stream
    ? allContributors.filter((c) => c.stream === v.worst_stream)
    : [];

  const top = inWorstStream.slice(0, TOP_N);
  const remainderMinutes = inWorstStream
    .slice(TOP_N)
    .reduce((sum, c) => sum + c.variance_minutes, 0);

  const contributors: Contributor[] = top.map((c) => ({
    activityId: c.activity_id,
    title: c.title,
    scopeLabel: c.scope_label,
    stream: c.stream,
    varianceMinutes: c.variance_minutes,
    person: c.person,
    machine: c.machine,
    cause: c.cause,
    hasOpenDeviation: c.has_open_deviation,
    baselineStartHour: c.baseline_start_hour,
    conflictId: c.tbd_marker,
  }));

  const variance: BatchVariance = {
    // NULL, not 0, and passed STRAIGHT THROUGH. 0019 §3 already makes this null where nothing is
    // measured, and 0 only where every measured activity ran to plan. A `?? 0` here would convert
    // the first of those into the second — the exact substitution that migration was rewritten to
    // remove — so there is deliberately no fallback.
    varianceMinutes: v?.variance_minutes ?? null,
    worstStream: v?.worst_stream ?? null,
    allStreamsSumMinutes: v?.all_streams_sum_minutes ?? null,
    deviationsOnRecord: Number(v?.deviations_on_record ?? 0),
    deviationsAwaitingVerdict: Number(v?.deviations_awaiting_verdict ?? 0),
    measuredCount: Number(v?.measured_count ?? 0),
    activityCount: Number(v?.activity_count ?? 0),
    contributors,
    remainderMinutes,
  };

  const events: BatchEvent[] = ((eventRes.data ?? []) as unknown as EventRow[]).map((e) => ({
    id: Number(e.id),
    occurredAt: e.occurred_at,
    action: e.action,
    reason: e.reason,
    actorName: e.actor_name,
    actorRole: e.actor_role,
    serverDecided: e.server_decided,
    activityTitle: e.activity_title,
    scopeLabel: e.scope_label,
    batchHour: e.batch_hour,
  }));

  const h = header.data as { label: string; status: string; supervisor_name: string | null };

  return {
    bar,
    label: h.label,
    status: h.status,
    supervisor: h.supervisor_name,
    variance,
    events,
  };
}
