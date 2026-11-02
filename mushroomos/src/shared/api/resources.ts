import { supabase } from './client';

/** Vessel readiness and cleaning (migrations 0110 / 0111). Every state here is the server's. */
export type VesselReadiness = {
  location_id: string;
  code: string;
  kind: string;
  label: string;
  status: string;
  occupied_by_batch_id: string | null;
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

/** One open cleaning job, as the Supervisor works it (0110: start → photos + checklist → finish). */
export type ChecklistItem = { key: string; label: string; done: boolean };
export type CleaningJob = {
  id: string;
  state: 'PENDING' | 'IN_PROGRESS';
  location_label: string;
  location_kind: string;
  batch_code: string | null;
  note: string | null;
  requested_at: string;
  started_at: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  checklist: ChecklistItem[];
  photo_count: number;
};

type CleaningRow = {
  id: string;
  state: 'PENDING' | 'IN_PROGRESS';
  note: string | null;
  requested_at: string;
  started_at: string | null;
  assigned_to: string | null;
  checklist: ChecklistItem[] | null;
  location: { label: string; kind: string } | null;
  batch: { code: string } | null;
  media: { id: string }[] | null;
};

export async function loadOpenCleaningJobs(): Promise<CleaningJob[]> {
  const [tasks, names] = await Promise.all([
    supabase
      .from('vessel_readiness_task')
      .select('id, state, note, requested_at, started_at, assigned_to, checklist, location:location(label, kind), batch:master_batch(code), media:vessel_readiness_media(id)')
      .in('state', ['PENDING', 'IN_PROGRESS'])
      .order('requested_at'),
    // The assignee's name, as the server already resolves it for the Resources screen.
    supabase.from('v_vessel_readiness').select('open_task_id, open_task_assigned_name').not('open_task_id', 'is', null),
  ]);
  if (tasks.error) throw tasks.error;
  if (names.error) throw names.error;
  const nameOf = new Map((names.data ?? []).map((n) => [n.open_task_id as string, n.open_task_assigned_name as string | null]));
  return ((tasks.data ?? []) as unknown as CleaningRow[]).map((t) => ({
    id: t.id,
    state: t.state,
    location_label: t.location?.label ?? 'Bunker / tunnel',
    location_kind: t.location?.kind ?? '',
    batch_code: t.batch?.code ?? null,
    note: t.note,
    requested_at: t.requested_at,
    started_at: t.started_at,
    assigned_to: t.assigned_to,
    assigned_name: nameOf.get(t.id) ?? null,
    checklist: t.checklist ?? [],
    photo_count: t.media?.length ?? 0,
  }));
}

export async function startCleaning(taskId: string) {
  const { error } = await supabase.rpc('start_vessel_cleaning', { p_task: taskId });
  if (error) throw error;
}

function extensionOf(file: File): string {
  const fromName = /\.[a-z0-9]{2,5}$/i.exec(file.name)?.[0];
  if (fromName) return fromName.toLowerCase();
  if (file.type === 'image/png') return '.png';
  if (file.type === 'image/webp') return '.webp';
  return '.jpg';
}

/** Upload one photo under readiness/<job>/<file> (the 0110 storage policy), then bind it. A failed bind removes the object. */
export async function attachCleaningPhoto(taskId: string, file: File) {
  const path = `readiness/${taskId}/${crypto.randomUUID()}${extensionOf(file)}`;
  const up = await supabase.storage.from('evidence').upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (up.error) throw up.error;
  const { error } = await supabase.rpc('attach_readiness_photo', { p_task: taskId, p_storage_path: path });
  if (error) {
    await supabase.storage.from('evidence').remove([path]).catch(() => undefined);
    throw error;
  }
}

export async function completeCleaning(taskId: string, checklist: ChecklistItem[], note?: string | null) {
  const { error } = await supabase.rpc('complete_vessel_cleaning', {
    p_task: taskId,
    p_checklist: checklist,
    p_note: note ?? null,
  });
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
