import { supabase } from './client';

/**
 * The backend's own dependency projection (migration 0109). Every value here is the server's:
 * baseline = planned_*, actual = actual_*, projected = the dependency walk, blocked_reason = the engine's words.
 * The screen renders these; it calculates nothing of its own.
 */
export type BatchNow = {
  master_batch_id: string;
  batch_code: string;
  batch_label: string | null;
  is_demo: boolean | null;
  h0: string | null;
  current_hour: number | null;
  onboarded: boolean | null;
  finished: number;
  running: number;
  ready_now: number;
  blocked: number;
  not_due_yet: number;
  late: number;
  worst_delay_min: number | null;
  projected_finish: string | null;
  next_up: string | null;
  running_now: string | null;
};

export type ActivityNow = {
  activity_id: string;
  code: string;
  title: string;
  scope_label: string | null;
  stream: string | null;
  state: string;
  is_hold: boolean;
  planned_start_at: string | null;
  planned_end_at: string | null;
  actual_start: string | null;
  actual_end: string | null;
  ready_at: string | null;
  projected_start_at: string | null;
  projected_end_at: string | null;
  basis: string;
  waiting_for_code: string | null;
  waiting_for_title: string | null;
  blocked_reason: string | null;
  delay_minutes: number | null;
};

export async function loadBatchesNow(): Promise<BatchNow[]> {
  const { data, error } = await supabase.from('v_batch_projection').select('*').order('batch_code');
  if (error) throw error;
  return (data ?? []) as BatchNow[];
}

export async function loadBatchNow(batchId: string): Promise<BatchNow | null> {
  const { data, error } = await supabase.from('v_batch_projection').select('*').eq('master_batch_id', batchId).maybeSingle();
  if (error) throw error;
  return (data ?? null) as BatchNow | null;
}

export async function loadBatchHour(batchId: string): Promise<number | null> {
  const { data, error } = await supabase.from('v_batch_projection')
    .select('current_hour').eq('master_batch_id', batchId).maybeSingle();
  if (error) throw error;
  return data?.current_hour == null ? null : Number(data.current_hour);
}

export async function loadBatchActivitiesNow(batchId: string): Promise<ActivityNow[]> {
  const { data, error } = await supabase.rpc('project_batch', { p_batch: batchId });
  if (error) throw error;
  return (data ?? []) as ActivityNow[];
}
