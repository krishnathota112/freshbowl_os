/**
 * What the Admin home needs, and nothing more. `docs/05-ui/WORKSTATIONS.md` §4.
 *
 * READ-ONLY, and every number comes from a view the server already derives:
 *   · `v_batch_forecast` — one row per batch with its process, H0, standard, and its own counts.
 *   · `v_lab_approval_queue` — lab submissions waiting for a decision (management-only by design).
 *   · `v_deviation_open` — the exceptions somebody must rule on.
 *
 * NOTHING IS COMPUTED HERE. No percentage of a batch, no "on time", no lateness — the product has
 * no field for a running task being overdue (CT-001), so the home screen does not imply one.
 */
import { supabase } from './client';
import { listBatchContexts, type BatchContext } from './work';

export type AdminHome = {
  active: BatchContext[];
  draft: BatchContext[];
  approvalsWaiting: number;
  deviationsOpen: number;
};

export async function loadAdminHome(): Promise<AdminHome> {
  const [batches, approvals, deviations] = await Promise.all([
    listBatchContexts(),
    supabase.from('v_lab_approval_queue').select('activity_id', { count: 'exact', head: true })
      .eq('batch_status', 'active').eq('awaiting_decision', true),
    supabase.from('v_deviation_open').select('id', { count: 'exact', head: true }),
  ]);
  if (approvals.error) throw approvals.error;
  if (deviations.error) throw deviations.error;

  return {
    active: batches.filter((b) => b.status === 'active'),
    draft: batches.filter((b) => b.status === 'draft'),
    approvalsWaiting: approvals.count ?? 0,
    deviationsOpen: deviations.count ?? 0,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * STARTING A BATCH — the existing chain, nothing new.
 *
 *   create_master_batch → generate_activity_plan → (material check) → validate_batch → activate_batch
 *
 * Every one of these already existed and is unchanged. This module only calls them in the order
 * the server expects, so a person does not have to know that order.
 * ───────────────────────────────────────────────────────────────────────────── */

import { createBatch, factoryInstant, regeneratePlan } from './batch';
import { assignActivity, loadSchedule, validateBatch, type Finding, type ScheduleRow } from './schedule';

export type Person = { id: string; display_name: string; role: string };

export async function listActivePeople(): Promise<Person[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, role')
    .eq('is_active', true)
    .order('display_name');
  if (error) throw error;
  return (data ?? []) as Person[];
}

/**
 * H0 as an instant, asked of the DATABASE.
 *
 * `factory_instant` turns "18 Sep, 06:00 factory time" into the real instant using the factory's
 * own timezone. The browser never builds it: the usual client-side trick is silently wrong across
 * a DST boundary, and a wrong H0 is frozen into the baseline forever.
 */
export async function resolveH0(date: string, time: string): Promise<string> {
  const at = await factoryInstant(date, time);
  if (at === null) {
    throw new Error(
      'The factory timezone is not set, so this date and time cannot be turned into a real instant. ' +
        'An admin sets it once in Reference data.'
    );
  }
  return at;
}

/** Create the batch and generate its plan. Two server calls, one step for the person. */
export async function createAndPlan(input: {
  code: string;
  label: string;
  date: string;
  startAt: string;
  processDefinitionId: string;
}): Promise<string> {
  const batchId = await createBatch({
    code: input.code,
    label: input.label,
    start_date: input.date,
    start_at: input.startAt,
    config: {},
    roles: [],
    process_definition_id: input.processDefinitionId,
  });
  await regeneratePlan(batchId);
  return batchId;
}

export type CrewRow = {
  role: string;
  total: number;
  assigned: number;
  activityIds: string[];
};

/** What still needs a person, grouped by the role the process says is responsible. */
export function crewGaps(rows: ScheduleRow[]): CrewRow[] {
  const byRole = new Map<string, CrewRow>();
  for (const r of rows) {
    const role = r.responsible_role ?? 'unassigned';
    let entry = byRole.get(role);
    if (!entry) {
      entry = { role, total: 0, assigned: 0, activityIds: [] };
      byRole.set(role, entry);
    }
    entry.total += 1;
    if (r.assigned_person_id) entry.assigned += 1;
    else entry.activityIds.push(r.id);
  }
  return [...byRole.values()].sort((a, b) => b.activityIds.length - a.activityIds.length);
}

export type BulkAssignResult = { assigned: number; failures: { activityId: string; message: string }[] };

/**
 * Assign one person to every unassigned activity of one role.
 *
 * THE SERVER STILL DECIDES EACH ONE. `assign_activity` takes a single activity and there is no
 * bulk RPC — so this is a loop over the existing contract, not a new mechanism, and every refusal
 * is reported against its own row rather than failing the whole run. A batch that is already
 * running needs a reason, and the server says so.
 */
export async function bulkAssign(
  activityIds: string[],
  personId: string,
  reason: string | null,
  onProgress?: (done: number) => void
): Promise<BulkAssignResult> {
  const failures: { activityId: string; message: string }[] = [];
  let assigned = 0;
  for (const id of activityIds) {
    try {
      await assignActivity(id, personId, reason ?? undefined);
      assigned += 1;
    } catch (e) {
      failures.push({ activityId: id, message: (e as Error).message });
    }
    onProgress?.(assigned + failures.length);
  }
  return { assigned, failures };
}

export type PrepareState = {
  rows: ScheduleRow[];
  crew: CrewRow[];
  findings: Finding[];
  blocking: Finding[];
};

export async function loadPrepare(batchId: string): Promise<PrepareState> {
  const [rows, findings] = await Promise.all([loadSchedule(batchId), validateBatch(batchId)]);
  return {
    rows,
    crew: crewGaps(rows),
    findings,
    blocking: findings.filter((f) => f.severity === 'blocking'),
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * ONBOARDING A BATCH THE FACTORY IS ALREADY RUNNING.
 *
 * OPTIONAL, AND IT ADDS NO AUTHORITY. Every call below already existed and is unchanged:
 *
 *   submit_activity(…, p_actual_start, p_actual_end)   the paper-slip path — supervisor / lab_tech
 *   start_activity + correct_actual                    work that is running now, with its real start
 *
 * The server's rules are untouched, and three of them decide what this flow can and cannot do:
 *   · an OPERATOR may not state a time — so onboarding is a supervisor's job, and the screen says so
 *   · a stated time may not be in the future, nor before H0
 *   · an activity whose required photograph is missing is NOT completed — the times are recorded and
 *     it stays open. Historical work has no photograph, so this is the normal outcome, and the
 *     screen reports it in the server's own words rather than pretending otherwise.
 * ───────────────────────────────────────────────────────────────────────────── */

import { submitActivity } from './batch';

export type EvidenceNeed = { required: number; satisfied: number };

/** What each activity of this batch still needs photographed, from `v_evidence_state`. */
export async function evidenceNeeds(batchId: string): Promise<Map<string, EvidenceNeed>> {
  const { data, error } = await supabase
    .from('v_evidence_state')
    .select('requirement_id, batch_activity_id, min_count, satisfied_count')
    .eq('master_batch_id', batchId);
  if (error) throw error;

  // One row per requirement × media, so fold by requirement before counting.
  const seen = new Set<string>();
  const byActivity = new Map<string, EvidenceNeed>();
  for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
    const reqId = r.requirement_id as string;
    if (seen.has(reqId)) continue;
    seen.add(reqId);
    const id = r.batch_activity_id as string;
    const entry = byActivity.get(id) ?? { required: 0, satisfied: 0 };
    entry.required += Number(r.min_count ?? 0);
    entry.satisfied += Math.min(Number(r.satisfied_count ?? 0), Number(r.min_count ?? 0));
    byActivity.set(id, entry);
  }
  return byActivity;
}

export type HistoryOutcome =
  | { kind: 'completed' }
  | { kind: 'held'; outstanding: string }
  | { kind: 'refused'; message: string };

/**
 * Record work that happened before MushroomOS, through the paper-slip path.
 *
 * The reason is required by this screen (not by the server) because a record of the past with no
 * account of where it came from is the thing the audit trail exists to prevent.
 */
export async function recordHistory(input: {
  activityId: string;
  actualStart: string | null;
  actualEnd: string;
  remark: string;
}): Promise<HistoryOutcome> {
  try {
    const r = await submitActivity(input.activityId, {}, input.remark, {
      actualStart: input.actualStart,
      actualEnd: input.actualEnd,
    });
    if (r?.outstanding_evidence) return { kind: 'held', outstanding: r.outstanding_evidence };
    return { kind: 'completed' };
  } catch (e) {
    return { kind: 'refused', message: (e as Error).message };
  }
}

/**
 * Work that is running right now, with the time it really began.
 *
 * `start_activity` stamps the server's clock — which is correct for live work and wrong for work
 * that started at 06:00 this morning. `correct_actual` is the existing append-only correction: the
 * first stamp stays on the record, superseded, with the reason. Nothing is overwritten.
 */
export async function markRunning(input: {
  activityId: string;
  realStart: string | null;
  reason: string;
}): Promise<void> {
  const started = await supabase.rpc('start_activity', { p_activity: input.activityId });
  if (started.error) throw started.error;
  if (input.realStart === null) return;

  const corrected = await supabase.rpc('correct_actual', {
    p_activity: input.activityId,
    p_field: 'actual_start',
    p_value: input.realStart,
    p_reason: input.reason,
  });
  if (corrected.error) throw corrected.error;
}
