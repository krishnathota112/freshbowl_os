import { supabase } from './client';

/** Vessel readiness and cleaning (migrations 0110 / 0111). Every state here is the server's. */
export type VesselReadiness = {
  location_id: string;
  code: string;
  kind: string;
  label: string;
  status: string;
  occupied_by_batch: string | null;
  occupied_since: string | null;
  last_released_at: string | null;
  last_cleaned_at: string | null;
  last_cleaned_by: string | null;
  open_task_id: string | null;
  open_task_state: string | null;
  open_task_assigned_name: string | null;
  is_ready: boolean;
  not_ready_reason: string | null;
};

export type ResourceNeed = {
  master_batch_id: string;
  batch_code: string;
  activity_id: string;
  activity_code: string;
  title: string;
  scope_label: string | null;
  scope: string;
  needs_kind: string;
  needed_at: string | null;
  allocated_location: string | null;
  ready_count: number;
};

export async function loadVessels(kinds: string[] = ['BUNKER', 'TUNNEL']): Promise<VesselReadiness[]> {
  const { data, error } = await supabase.from('v_vessel_readiness').select('*').in('kind', kinds).order('code');
  if (error) throw error;
  return (data ?? []) as VesselReadiness[];
}

export async function loadResourceNeeds(): Promise<ResourceNeed[]> {
  const { data, error } = await supabase.from('v_resource_need').select('*').order('needed_at');
  if (error) throw error;
  return (data ?? []) as ResourceNeed[];
}

export async function requestCleaning(input: { locationId: string; forBatchId?: string | null; assignedTo?: string | null; note?: string | null }) {
  const { error } = await supabase.rpc('request_vessel_cleaning', {
    p_location: input.locationId,
    p_for_batch: input.forBatchId ?? null,
    p_assigned_to: input.assignedTo ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw error;
}

export async function cancelCleaning(taskId: string, reason: string) {
  const { error } = await supabase.rpc('cancel_vessel_cleaning', { p_task: taskId, p_reason: reason });
  if (error) throw error;
}

export async function allocateVessel(input: { batchId: string; scope: string; instanceNo: number; locationId: string; activityCode: string; note?: string | null }) {
  const { error } = await supabase.rpc('allocate_vessel', {
    p_batch: input.batchId,
    p_scope: input.scope,
    p_instance_no: input.instanceNo,
    p_location: input.locationId,
    p_note: input.note ?? null,
    p_activity_code: input.activityCode,
  });
  if (error) throw error;
}
