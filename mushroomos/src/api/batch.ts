import { supabase } from './client';

/** Every write here goes through a SECURITY DEFINER function. Tables are read-only. */

export type BatchRow = {
  id: string;
  code: string;
  label: string;
  start_date: string;
  status: 'draft' | 'validated' | 'active' | 'closed' | 'cancelled';
  supervisor_name: string | null;
  activated_at: string | null;
};

export type BatchActivityRow = {
  id: string;
  code: string;
  title: string;
  stream: string;
  scope: string;
  scope_label: string;
  instance_no: number;
  rel_day: number;
  seq: number;
  planned_start: string | null;
  planned_qty_mt: number | null;
  duration_target_min_hr: number | null;
  duration_target_max_hr: number | null;
  day0_duration_hr: number | null;
  is_time_gate: boolean;
  golden_rule: string | null;
  tbd_marker: string | null;
  state: string;
  blocked_reason: string | null;
  actual_start: string | null;
  actual_end: string | null;
};

export type BatchValueRow = {
  id: string;
  batch_activity_id: string;
  field_key: string;
  label: string;
  unit: string | null;
  sop_value: string | null;
  sop_min: number | null;
  sop_max: number | null;
  sop_source_ref: string | null;
  conflict_id: string | null;
  day0_value: string | null;
  variance_allowed: string | null;
  actual_value: string | null;
  variance_flag: string | null;
  operator_input: string;
  display_order: number | null;
};

export type BatchEvidenceRow = {
  id: string;
  batch_activity_id: string;
  key: string;
  label: string;
  media_kinds: string[];
  min_count: number;
  satisfied_count: number;
  gates_submission: boolean;
  capture_hint: string | null;
  ordering: number;
};

export async function listBatches(): Promise<BatchRow[]> {
  const { data, error } = await supabase
    .from('master_batch')
    .select('id, code, label, start_date, status, supervisor_name, activated_at')
    .order('start_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BatchRow[];
}

export async function getBatch(id: string): Promise<BatchRow> {
  const { data, error } = await supabase
    .from('master_batch')
    .select('id, code, label, start_date, status, supervisor_name, activated_at')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as BatchRow;
}

export async function getBatchActivities(batchId: string): Promise<BatchActivityRow[]> {
  const { data, error } = await supabase
    .from('batch_activity')
    .select(
      'id, code, title, stream, scope, scope_label, instance_no, rel_day, seq, planned_start, planned_qty_mt, duration_target_min_hr, duration_target_max_hr, day0_duration_hr, is_time_gate, golden_rule, tbd_marker, state, blocked_reason, actual_start, actual_end'
    )
    .eq('master_batch_id', batchId)
    .order('seq')
    .order('instance_no');
  if (error) throw error;
  return (data ?? []) as BatchActivityRow[];
}

export async function getActivityDetail(activityId: string) {
  const [values, evidence] = await Promise.all([
    supabase
      .from('batch_activity_value')
      .select(
        'id, batch_activity_id, field_key, label, unit, sop_value, sop_min, sop_max, sop_source_ref, conflict_id, day0_value, variance_allowed, actual_value, variance_flag, operator_input, display_order'
      )
      .eq('batch_activity_id', activityId)
      .order('display_order'),
    supabase
      .from('batch_activity_evidence_req')
      .select(
        'id, batch_activity_id, key, label, media_kinds, min_count, satisfied_count, gates_submission, capture_hint, ordering'
      )
      .eq('batch_activity_id', activityId)
      .order('ordering'),
  ]);
  if (values.error) throw values.error;
  if (evidence.error) throw evidence.error;
  return {
    values: (values.data ?? []) as BatchValueRow[],
    evidence: (evidence.data ?? []) as BatchEvidenceRow[],
  };
}

export type RoleBindingInput = { role: string; material_code: string; lead: boolean };

export async function createBatch(input: {
  code: string;
  label: string;
  start_date: string;
  config: Record<string, number | string>;
  roles: RoleBindingInput[];
  supervisor?: string;
  weather?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_master_batch', {
    p_code: input.code,
    p_label: input.label,
    p_start_date: input.start_date,
    p_config: input.config,
    p_roles: input.roles,
    p_supervisor: input.supervisor ?? null,
    p_weather: input.weather ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function regeneratePlan(batchId: string) {
  const { error } = await supabase.rpc('generate_activity_plan', { p_batch_id: batchId });
  if (error) throw error;
}

export async function activateBatch(batchId: string) {
  const { error } = await supabase.rpc('activate_batch', { p_batch_id: batchId });
  if (error) throw error;
}

export async function startActivity(activityId: string) {
  const { error } = await supabase.rpc('start_activity', { p_activity: activityId });
  if (error) throw error;
}

export async function markEvidence(reqId: string) {
  const { error } = await supabase.rpc('mark_evidence', { p_req: reqId });
  if (error) throw error;
}

export async function submitActivity(
  activityId: string,
  values: Record<string, string>,
  remarks?: string
) {
  const { data, error } = await supabase.rpc('submit_activity', {
    p_activity: activityId,
    p_values: values,
    p_remarks: remarks ?? null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row as { new_state: string; out_of_range: number; outstanding_evidence: string | null };
}

export async function releaseElapsedRests(batchId: string) {
  const { error } = await supabase.rpc('release_elapsed_rests', { p_batch: batchId });
  if (error) throw error;
}

/** The Day-0 questions the generator needs answered, in plain language. */
export const STRUCTURE_QUESTIONS: {
  key: string;
  label: string;
  help: string;
  step: number;
  suffix?: string;
}[] = [
  { key: 'primary_fibre_required_mt', label: 'Fibre needed', help: 'Total for the batch', step: 0.5, suffix: 'MT' },
  { key: 'expected_load_capacity_mt', label: 'Per truck load', help: 'The load count is worked out from this', step: 0.5, suffix: 'MT' },
  { key: 'bunker_line_count', label: 'Bunker lines', help: 'How many parallel lines this batch runs', step: 1 },
  { key: 'yard_pile_count', label: 'Yard piles', help: 'Piles formed when fibre comes out of the bunker', step: 1 },
  { key: 'mixed_pile_count', label: 'Mixed piles', help: 'What the yard piles combine into', step: 1 },
  { key: 'straw_pile_count', label: 'Straw piles', help: 'Placed beside the mixed pile', step: 1 },
  { key: 'straw_bunker_count', label: 'Bunkers for straw', help: 'Straw competes for bunker space', step: 1 },
  { key: 'turner_pile_count', label: 'Piles at the turner', help: 'Mixed pile plus the straw piles', step: 1 },
  { key: 'tunnel_count', label: 'Tunnels', help: 'Tunnel charges at the end', step: 1 },
];

export const DEFAULT_STRUCTURE: Record<string, number> = {
  primary_fibre_required_mt: 21,
  expected_load_capacity_mt: 2,
  bunker_line_count: 3,
  yard_pile_count: 2,
  mixed_pile_count: 1,
  straw_pile_count: 2,
  straw_bunker_count: 1,
  turner_pile_count: 3,
  tunnel_count: 3,
};
