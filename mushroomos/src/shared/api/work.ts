/**
 * The operator's work list, read from `v_my_work`.
 *
 * WHY A VIEW AND NOT `batch_activity`
 *   The screen this replaced selected from the base table and then worked out, in TypeScript, which
 *   task was current: four fallbacks over `baseline_start_hour`, a `currentBatchHour` derived from
 *   the device clock, and `baselineHours = (maxDay + 1) * 24` — the day grid CLAUDE.md forbids,
 *   which reads 480 against a 470-hour standard.
 *
 *   `v_my_work` already answers every one of those questions, and answers them the way the database
 *   will answer them when it decides whether to refuse the next call. A screen that computes its own
 *   version will eventually disagree with the thing that does the refusing.
 *
 *   docs/02-architecture/DATA-CONTRACTS.md §0: read from views, write through RPCs, compute nothing the backend gives you.
 */
import { supabase } from './client';

/**
 * One row of `v_my_work`. Column-for-column — no renaming, because a rename is where a screen starts
 * believing something the database did not say.
 *
 * `numeric` arrives from PostgREST as a JSON number, so the hour columns are `number` and not
 * `string`. That was verified over HTTP, not assumed (`pg` returns them as strings; PostgREST does
 * not).
 */
export interface MyWorkRow {
  activity_id: string;
  master_batch_id: string;
  batch_code: string;
  code: string;
  title: string;
  scope_label: string | null;
  stream: string | null;
  instance_no: number | null;
  /** `activity_state` — LOCKED · READY · IN_PROGRESS · SUBMITTED · AWAITING_LAB · WAITING_TIME ·
   *  WAITING_CONDITION · AWAITING_SUPERVISOR · BLOCKED · DEVIATION · RETURNED · COMPLETED ·
   *  SKIPPED · CANCELLED. Render it; never re-derive it. */
  state: string;
  /** Already a sentence. Show it verbatim — the UI must not invent a reason of its own. */
  blocked_reason: string | null;
  is_hold: boolean;
  responsible_role: string | null;
  assigned_person_id: string | null;
  assigned_machine_id: string | null;
  baseline_start_hour: number | null;
  baseline_end_hour: number | null;
  planned_start_at: string | null;
  planned_end_at: string | null;
  actual_start: string | null;
  actual_end: string | null;
  variance_minutes: number | null;
  required_count: number | null;
  satisfied_total: number | null;
  /** Already names the missing evidence. Show it verbatim. */
  outstanding_labels: string | null;
  /** The SOP stage of the activity (0081). */
  stage: string | null;
  skip_policy: string | null;
  unblocks_at: string | null;
  started_by_name: string | null;
  finished_by_name: string | null;
  /** In progress past its stated maximum duration plus approved hours (0088). */
  overdue: boolean | null;
  duration_target_max_hr: number | null;
  latest_ticket_status: string | null;
  is_demo: boolean | null;
}

/**
 * Every row the signed-in user may see, in planned order.
 *
 * No `.eq('master_batch.status', 'active')` filter and no state whitelist: the view decides what is
 * work. Filtering here would mean holding a second opinion about it.
 */
export async function listMyWork(): Promise<MyWorkRow[]> {
  const { data, error } = await supabase
    .from('v_my_work')
    .select('*')
    .order('planned_start_at', { ascending: true, nullsFirst: false })
    .order('baseline_start_hour', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as MyWorkRow[];
}

/** The same, narrowed to one batch. */
export async function listMyWorkForBatch(batchId: string): Promise<MyWorkRow[]> {
  const { data, error } = await supabase
    .from('v_my_work')
    .select('*')
    .eq('master_batch_id', batchId)
    .order('planned_start_at', { ascending: true, nullsFirst: false })
    .order('baseline_start_hour', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as MyWorkRow[];
}

export type CompletionResult = {
  new_state: string;
  out_of_range: number;
  /** Non-null means the finish was REFUSED and this names what is missing. */
  outstanding_evidence: string | null;
};

/**
 * Finish an activity. **There is no timestamp parameter, by design.**
 *
 * `submit_activity` still exists and still takes `p_actual_start` / `p_actual_end`, but it is the
 * paper-slip backfill path: it refuses stated timestamps from an operator, and a stored value always
 * beats a passed one. It must not be wired into the Operator or Supervisor workflow —
 * DATA-CONTRACTS.md §3, and the standing instruction that no editable official timestamp appears in
 * the normal flow.
 *
 * The server stamps `actual_end`. That is the whole point: it must be hard to make a late activity
 * look on time.
 */
export async function completeActivity(
  activityId: string,
  values: Record<string, unknown> = {},
  remarks?: string | null
): Promise<CompletionResult> {
  const { data, error } = await supabase.rpc('complete_activity', {
    p_activity: activityId,
    p_values: values,
    p_remarks: remarks ?? null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row as CompletionResult;
}

/**
 * The states an operator can act on right now, and the ones that are merely waiting.
 *
 * These are groupings for LAYOUT — which heading a card sits under. They are not a second opinion
 * about eligibility: whether the work may actually start is settled by the server when
 * `start_activity` is called, and by `blocked_reason` when it is not null.
 */
export const ACTIONABLE_STATES = ['READY', 'RETURNED', 'DEVIATION'] as const;
export const RUNNING_STATES = ['IN_PROGRESS'] as const;
export const WAITING_STATES = [
  // 0117 · its planned hour has not arrived. It sits under a waiting heading and carries no Start
  // button. `workGroupOf` already folded any unknown state to 'waiting', so this is the explicit
  // form of what the UI was doing anyway — not a new opinion about eligibility.
  'NOT_DUE_YET',
  'LOCKED',
  'BLOCKED',
  'WAITING_TIME',
  'WAITING_CONDITION',
  'AWAITING_LAB',
  'AWAITING_SUPERVISOR',
  'SUBMITTED',
] as const;
export const DONE_STATES = ['COMPLETED', 'SKIPPED', 'CANCELLED'] as const;

export function workGroupOf(state: string): 'running' | 'ready' | 'waiting' | 'done' {
  if ((RUNNING_STATES as readonly string[]).includes(state)) return 'running';
  if ((ACTIONABLE_STATES as readonly string[]).includes(state)) return 'ready';
  if ((DONE_STATES as readonly string[]).includes(state)) return 'done';
  return 'waiting';
}

/**
 * The words a field worker reads, for each `activity_state`.
 *
 * A map and not a formatter: every state the database can produce is listed, so a new one shows up
 * as itself rather than being quietly folded into "Waiting".
 */
export const STATE_LABEL: Record<string, string> = {
  NOT_DUE_YET: 'Not due yet',
  LOCKED: 'Locked',
  READY: 'Ready now',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
  AWAITING_LAB: 'Waiting for lab',
  WAITING_TIME: 'Waiting — rest period',
  WAITING_CONDITION: 'Waiting — condition',
  AWAITING_SUPERVISOR: 'With supervisor',
  BLOCKED: 'Locked',
  DEVIATION: 'Deviation raised',
  RETURNED: 'Returned to you',
  COMPLETED: 'Completed',
  SKIPPED: 'Skipped',
  CANCELLED: 'Cancelled',
};

/**
 * The four numbers that must never be collapsed on a screen, for one batch.
 *
 * PROCESS · STANDARD · H0 · BASELINE — plus the two that come after execution starts, AUTHORISED and
 * PROJECTED. `v_batch_forecast` holds all six and derives every one of them, so nothing here
 * multiplies days by 24. `baseline_hours` is a day grid that reads 480 against a 470-hour standard;
 * `standard_hr` is what the process actually computes.
 */
export interface BatchContext {
  master_batch_id: string;
  code: string;
  status: string;
  process_code: string;
  h0: string | null;
  standard_hr: number | null;
  planned_end_at: string | null;
  approved_extension_hr: number | null;
  authorised_end_at: string | null;
  slip_minutes: number | null;
  measured_count: number;
  finished_count: number;
  running_count: number;
  activity_count: number;
  projected_end_at: string | null;
  /** `finished` | `running` | `projected` | `unknown` — say which, never imply certainty. */
  forecast_basis: string;
  exposure_minutes: number | null;
  forecast_unknown_reason: string | null;
}

export async function getBatchContext(batchId: string): Promise<BatchContext | null> {
  const { data, error } = await supabase
    .from('v_batch_forecast')
    .select('*')
    .eq('master_batch_id', batchId)
    .maybeSingle();
  if (error) throw error;
  return (data as BatchContext) ?? null;
}

/** Every batch the caller may see, with its four numbers and its forecast. */
export async function listBatchContexts(): Promise<BatchContext[]> {
  const { data, error } = await supabase
    .from('v_batch_forecast')
    .select('*')
    .order('h0', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BatchContext[];
}
