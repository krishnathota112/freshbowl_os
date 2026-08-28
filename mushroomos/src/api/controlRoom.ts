import { supabase } from './client';
import { loadTower } from './tower';
import type {
  AwaitingRelease,
  Band,
  ControlRoomData,
  DeviationRow,
  LabFailure,
  UrgentGate,
} from '../domain/contracts';
import { nowMs } from '../lib/now';

/**
 * S11's data. `UI_IMPLEMENTATION_PLAN §S11`, `ROLE_AND_APPROVAL_MODEL §3.3`.
 *
 * ORDERED BY URGENCY, NOT BY BATCH — criterion 60. A supervisor's question is "what is stuck",
 * not "how is MB-118 doing"; the batch board is the LAST band for that reason.
 *
 * ONE OF THE SIX BANDS HAS NO BACKEND, and says so rather than reporting zero:
 *
 *   Evidence review   §3.3 asks for "submissions with photos flagged for check". A4 built the
 *                     storage and the binding, but NOTHING defines who flags a photo or what
 *                     flagged means — there is no reviewed/flagged column anywhere. The plan
 *                     attributed this band to A4; A4 landed and the band is still unbacked,
 *                     because the missing piece was never storage.
 *
 * LAB FAILURES IS NOW BACKED — B5 built `lab_sample` / `lab_test` / `lab_result`, so the band reads
 * `v_lab_result_current`. It was `built: false` before B5 landed and the note said so; leaving that
 * note in place once the tables existed would have been the same class of false record in the other
 * direction. A zero here now means "no lab result has failed", which is a fact.
 *
 * Criterion 62 forbids rendering a zero for an UNBUILT band. `Band<T>` makes that a compile error
 * rather than a review note.
 */

const HOURS_AHEAD = 4;

/** `ROLE_AND_APPROVAL_MODEL §3.3` band 1 — "opens or expires within 4 hours". */
async function loadTimeCritical(): Promise<Band<UrgentGate>> {
  const horizon = new Date(nowMs() + HOURS_AHEAD * 3_600_000).toISOString();

  const { data, error } = await supabase
    .from('batch_activity')
    .select(
      'id, title, scope_label, unblocks_at, master_batch_id, master_batch!inner(code, status)'
    )
    .eq('state', 'WAITING_TIME')
    .eq('master_batch.status', 'active')
    .not('unblocks_at', 'is', null)
    .lte('unblocks_at', horizon)
    .order('unblocks_at');
  if (error) throw error;

  return {
    built: true,
    rows: (data ?? []).map((r) => {
      const mb = (Array.isArray(r.master_batch) ? r.master_batch[0] : r.master_batch) as {
        code: string;
      };
      return {
        activityId: r.id as string,
        batchId: r.master_batch_id as string,
        batchCode: mb?.code ?? '—',
        title: r.title as string,
        scopeLabel: r.scope_label as string,
        unblocksAt: r.unblocks_at as string,
      };
    }),
  };
}

/**
 * Bands 3 and 4, from one read.
 *
 * `v_deviation_open` is the authority — `awaiting_verdict` is the supervisor's queue, and
 * `stands_on_record` includes accepted ones, which is what a GM package must show. B2 header.
 *
 * A view carries no foreign keys, so PostgREST cannot embed through it. The activity and batch
 * columns are fetched separately and joined here, which is the same shape `loadTower` uses.
 */
/**
 * The shape `v_deviation_open` returns. Declared here because a VIEW carries no foreign keys and
 * appears in no generated type, so PostgREST widens it to an error type without this.
 */
type DevViewRow = {
  id: string;
  master_batch_id: string;
  batch_activity_id: string | null;
  kind: string;
  summary: string;
  raised_at: string;
  raised_by: string | null;
  raised_by_role: string | null;
  state: string;
  gate_rule_id: string | null;
  awaiting_verdict: boolean;
  stands_on_record: boolean;
  detail: { conflict_id?: string | null } | null;
};

async function loadDeviationBands(): Promise<{
  openDeviations: Band<DeviationRow>;
  awaitingRelease: Band<AwaitingRelease>;
}> {
  const [devRes, actRes] = await Promise.all([
    supabase
      .from('v_deviation_open')
      .select(
        'id, master_batch_id, batch_activity_id, kind, summary, raised_at, raised_by, ' +
          'raised_by_role, state, gate_rule_id, awaiting_verdict, stands_on_record, detail'
      )
      .eq('stands_on_record', true)
      .order('raised_at'),
    supabase
      .from('batch_activity')
      .select('id, title, scope_label, state, submitted_at, master_batch_id, master_batch!inner(code, status)')
      .eq('master_batch.status', 'active')
      .in('state', ['DEVIATION']),
  ]);
  if (devRes.error) throw devRes.error;
  if (actRes.error) throw actRes.error;
  const devs = (devRes.data ?? []) as unknown as DevViewRow[];

  const acts = new Map(
    (actRes.data ?? []).map((a) => {
      const mb = (Array.isArray(a.master_batch) ? a.master_batch[0] : a.master_batch) as {
        code: string;
      };
      return [
        a.id as string,
        {
          title: a.title as string,
          scopeLabel: a.scope_label as string,
          batchId: a.master_batch_id as string,
          batchCode: mb?.code ?? '—',
          submittedAt: a.submitted_at as string | null,
        },
      ];
    })
  );

  // Which gates are protected, so the room can say a supervisor must escalate rather than let
  // them try and be refused. §3.2.
  const gateIds = [...new Set(devs.map((d) => d.gate_rule_id).filter(Boolean))];
  const protectedGates = new Set<string>();
  if (gateIds.length > 0) {
    const { data } = await supabase
      .from('gate_rule')
      .select('id, is_protected')
      .in('id', gateIds as string[]);
    for (const g of data ?? []) if (g.is_protected) protectedGates.add(g.id as string);
  }

  const people = new Map<string, string>();
  const raisers = [...new Set(devs.map((d) => d.raised_by).filter(Boolean))];
  if (raisers.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', raisers as string[]);
    for (const p of data ?? []) people.set(p.id as string, p.display_name as string);
  }

  const rows: DeviationRow[] = devs
    .filter((d) => d.awaiting_verdict)
    .map((d) => {
      const a = d.batch_activity_id ? acts.get(d.batch_activity_id as string) : undefined;
      const detail = (d.detail ?? {}) as { conflict_id?: string | null };
      return {
        deviationId: d.id as string,
        batchId: (a?.batchId ?? d.master_batch_id) as string,
        batchCode: a?.batchCode ?? '—',
        activityId: (d.batch_activity_id as string) ?? null,
        activityTitle: a?.title ?? null,
        scopeLabel: a?.scopeLabel ?? null,
        kind: d.kind as string,
        summary: d.summary as string,
        raisedAt: d.raised_at as string,
        raisedByName: d.raised_by ? (people.get(d.raised_by as string) ?? null) : null,
        raisedByRole: (d.raised_by_role as string) ?? null,
        state: d.state as string,
        isProtected: d.gate_rule_id ? protectedGates.has(d.gate_rule_id as string) : false,
        conflictId: detail.conflict_id ?? null,
      };
    });

  // An activity is releasable when nothing on it still awaits a verdict — which is exactly what
  // `release_activity` checks server-side. Showing it here when the server would refuse it would
  // be the frontend disagreeing with the authority.
  const stillWaiting = new Set(
    devs
      .filter((d) => d.awaiting_verdict && d.batch_activity_id)
      .map((d) => d.batch_activity_id as string)
  );
  const acceptedPer = new Map<string, number>();
  for (const d of devs) {
    if (d.state === 'accepted' && d.batch_activity_id) {
      const k = d.batch_activity_id as string;
      acceptedPer.set(k, (acceptedPer.get(k) ?? 0) + 1);
    }
  }

  const releasable: AwaitingRelease[] = [...acts.entries()]
    .filter(([id]) => !stillWaiting.has(id))
    .map(([id, a]) => ({
      activityId: id,
      batchId: a.batchId,
      batchCode: a.batchCode,
      title: a.title,
      scopeLabel: a.scopeLabel,
      since: a.submittedAt ?? new Date().toISOString(),
      acceptedCount: acceptedPer.get(id) ?? 0,
    }))
    .sort((x, y) => x.since.localeCompare(y.since));

  return {
    openDeviations: { built: true, rows },
    awaitingRelease: { built: true, rows: releasable },
  };
}

/**
 * Band 2 — lab results that FAILED their frozen band and have not been superseded.
 *
 * ⚠ `verdict = 'fail'` ONLY. `no_spec` is deliberately excluded: `LAB_MODEL §9` and TBD-13 say a
 * parameter with no stated band is recorded and trended but NEVER auto-failed, so listing one here
 * would turn "the factory has not stated a limit" into "something is wrong". `invalid` is excluded
 * for the same reason — an unusable reading is not an out-of-spec reading.
 *
 * `is_current` filters superseded versions out of the BAND while leaving them in the record. A
 * failure that was retested and passed is history, not an open problem, and
 * `v_lab_result_history` still shows both — which is what a decision package needs.
 */
/** `v_lab_result_current`'s shape. Declared and cast, same as `DevViewRow` above — the generated
 *  client types cover tables, not views. */
type LabResultViewRow = {
  result_id: string;
  master_batch_id: string;
  batch_code: string | null;
  batch_activity_id: string | null;
  checkpoint_code: string;
  checkpoint_map: string;
  parameter_code: string;
  value_numeric: string | null;
  value_text: string | null;
  unit: string | null;
  target_min: string | null;
  target_max: string | null;
  version: number;
  measured_at: string;
  technician_name: string | null;
  spec_conflict_id: string | null;
};

async function loadLabFailures(): Promise<Band<LabFailure>> {
  const { data, error } = await supabase
    .from('v_lab_result_current')
    .select(
      'result_id, master_batch_id, batch_code, batch_activity_id, checkpoint_code, checkpoint_map,' +
        ' parameter_code, value_numeric, value_text, unit, target_min, target_max, version,' +
        ' measured_at, technician_name, spec_conflict_id, verdict'
    )
    .eq('verdict', 'fail')
    .order('measured_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as LabResultViewRow[];
  return {
    built: true,
    rows: rows.map((r) => ({
      resultId: r.result_id,
      batchId: r.master_batch_id,
      batchCode: r.batch_code ?? '—',
      activityId: r.batch_activity_id,
      checkpointCode: r.checkpoint_code,
      checkpointMap: r.checkpoint_map,
      parameterCode: r.parameter_code,
      // A result carries a number or a text observation, never neither — `lab_result_has_a_value`.
      value: r.value_numeric ?? r.value_text ?? '—',
      unit: r.unit,
      // `numeric` arrives as a string over the wire. Converted here rather than rendered raw, so a
      // null bound stays null and is shown as an em dash instead of a substituted number.
      targetMin: r.target_min === null ? null : Number(r.target_min),
      targetMax: r.target_max === null ? null : Number(r.target_max),
      version: r.version,
      measuredAt: r.measured_at,
      technicianName: r.technician_name,
      conflictId: r.spec_conflict_id,
    })),
  };
}

export async function loadControlRoom(): Promise<ControlRoomData> {
  // One failing band must not blank the room — criterion 63. Each is settled independently and a
  // rejection becomes an unbuilt-shaped band carrying the error, so the others still render.
  const [timeCritical, labIssues, devBands, tower] = await Promise.allSettled([
    loadTimeCritical(),
    loadLabFailures(),
    loadDeviationBands(),
    loadTower(),
  ]);

  const failed = (e: unknown, what: string): Band<never> => ({
    built: false,
    releasedWith: 'error',
    why: `${what} could not be read: ${(e as Error)?.message ?? 'unknown error'}`,
  });

  return {
    timeCritical:
      timeCritical.status === 'fulfilled'
        ? timeCritical.value
        : failed(timeCritical.reason, 'Time-critical gates'),

    labIssues:
      labIssues.status === 'fulfilled'
        ? labIssues.value
        : failed(labIssues.reason, 'Lab failures'),

    openDeviations:
      devBands.status === 'fulfilled'
        ? devBands.value.openDeviations
        : failed(devBands.reason, 'Open deviations'),

    awaitingRelease:
      devBands.status === 'fulfilled'
        ? devBands.value.awaitingRelease
        : failed(devBands.reason, 'Awaiting release'),

    evidenceReview: {
      built: false,
      releasedWith: 'a flagging mechanism that does not exist',
      why:
        'ROLE_AND_APPROVAL_MODEL §3.3 asks for "submissions with photos flagged for check". A4 ' +
        'built the storage and the binding, but nothing anywhere defines who flags a photo or ' +
        'what flagged means — there is no reviewed or flagged column. The plan attributed this ' +
        'band to A4; A4 landed and it is still unbacked, because the missing piece was never ' +
        'storage.',
    },

    activeBatches:
      tower.status === 'fulfilled'
        ? { built: true, rows: tower.value.bars }
        : failed(tower.reason, 'The active batch board'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Verdicts. Every one takes a mandatory reason, and the server refuses an empty one — these
// wrappers do not re-check it, because two places deciding what counts as a reason is how they
// drift apart. `ROLE_AND_APPROVAL_MODEL §3.1`.
// ─────────────────────────────────────────────────────────────────────────────

export async function releaseActivity(activityId: string, reason: string) {
  const { error } = await supabase.rpc('release_activity', {
    p_activity: activityId,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function holdActivity(activityId: string, reason: string) {
  const { error } = await supabase.rpc('hold_activity', {
    p_activity: activityId,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function returnActivity(activityId: string, reason: string) {
  const { error } = await supabase.rpc('return_activity', {
    p_activity: activityId,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function acceptWithDeviation(deviationId: string, reason: string) {
  const { error } = await supabase.rpc('accept_with_deviation', {
    p_deviation: deviationId,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function escalateDeviation(deviationId: string, reason: string) {
  const { error } = await supabase.rpc('escalate_deviation', {
    p_deviation: deviationId,
    p_reason: reason,
  });
  if (error) throw error;
}
