/**
 * Late-task tickets (0088). A ticket is a row of the extension register: the person doing the work
 * asks for more time with a reason and photos; Admin approves (granting hours) or rejects, with a reason.
 *
 * Photos use the existing evidence bucket and the same upload-then-bind rule as task evidence: the
 * object is uploaded under `batch/activity/…`, then `attach_extension_photo` binds it — a ticket photo
 * that is not in storage cannot be recorded.
 */
import { supabase } from './client';

export type TicketPhoto = { storage_path: string; uploaded_at: string; media_kind: string; uploaded_by?: string | null };

export type Ticket = {
  id: string;
  master_batch_id: string;
  batch_code: string;
  batch_activity_id: string;
  activity_title: string;
  scope_label: string | null;
  stage: string | null;
  status: string;
  requested_extension_hr: number;
  approved_extension_hr: number | null;
  requested_reason: string;
  requested_at: string;
  requested_by_name: string | null;
  requested_by_role: string | null;
  overdue_at_request: boolean;
  admin_decision: string | null;
  admin_decided_at: string | null;
  admin_reason: string | null;
  admin_granted_hr: number | null;
  admin_name: string | null;
  is_demo: boolean | null;
  activity_state: string;
  actual_start: string | null;
  duration_target_max_hr: number | null;
  photos: TicketPhoto[];
};

const COLS =
  'id, master_batch_id, batch_code, batch_activity_id, activity_title, scope_label, stage, status, requested_extension_hr, approved_extension_hr, requested_reason, requested_at, requested_by_name, requested_by_role, overdue_at_request, admin_decision, admin_decided_at, admin_reason, admin_granted_hr, admin_name, is_demo, activity_state, actual_start, duration_target_max_hr, photos';

export async function listTicketsForActivity(activityId: string): Promise<Ticket[]> {
  const { data, error } = await supabase
    .from('v_extension_request')
    .select(COLS)
    .eq('batch_activity_id', activityId)
    .order('requested_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Ticket[];
}

export async function listTickets(filter: 'open' | 'all'): Promise<Ticket[]> {
  let q = supabase.from('v_extension_request').select(COLS).order('requested_at', { ascending: false }).limit(200);
  if (filter === 'open') q = q.eq('status', 'REQUESTED');
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Ticket[];
}

/** Whether this activity is past its stated maximum duration (plus approved hours) — the server's answer. */
export async function isActivityOverdue(activityId: string): Promise<boolean> {
  const [timeline, late] = await Promise.all([
    supabase.from('v_batch_timeline').select('overdue').eq('activity_id', activityId).maybeSingle(),
    // 0100 · past its due time on the day plan (+ granted hours + grace): the task is blocked until a ticket is approved.
    supabase.rpc('late_block_reason', { p_activity: activityId }),
  ]);
  if (timeline.error) throw timeline.error;
  if (late.error) throw late.error;
  return Boolean((timeline.data as { overdue: boolean } | null)?.overdue) || Boolean(late.data);
}

/** Why this task is blocked for lateness, or null (0100 · late_block_reason). */
export async function lateBlockReason(activityId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('late_block_reason', { p_activity: activityId });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function raiseTicket(input: { activityId: string; hours: number; reason: string }): Promise<string> {
  const { data, error } = await supabase.rpc('request_extension', {
    p_activity: input.activityId,
    p_hours: input.hours,
    p_reason: input.reason,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as string;
}

function extensionOf(file: File): string {
  const fromName = /\.[a-z0-9]{2,5}$/i.exec(file.name)?.[0];
  if (fromName) return fromName.toLowerCase();
  if (file.type === 'image/png') return '.png';
  if (file.type === 'image/webp') return '.webp';
  return '.jpg';
}

/** Upload one photo, then bind it to the ticket. A failed bind removes the orphaned object. */
export async function attachTicketPhoto(input: { batchId: string; activityId: string; ticketId: string; file: File }) {
  const path = `${input.batchId}/${input.activityId}/ticket-${crypto.randomUUID()}${extensionOf(input.file)}`;
  const up = await supabase.storage.from('evidence').upload(path, input.file, {
    contentType: input.file.type || undefined,
    upsert: false,
  });
  if (up.error) throw up.error;
  const { error } = await supabase.rpc('attach_extension_photo', { p_request: input.ticketId, p_storage_path: path });
  if (error) {
    await supabase.storage.from('evidence').remove([path]).catch(() => undefined);
    throw error;
  }
}

export async function decideTicket(input: { ticketId: string; approve: boolean; reason: string; grantedHours?: number | null }) {
  const { error } = await supabase.rpc('admin_decide_extension', {
    p_request: input.ticketId,
    p_approve: input.approve,
    p_reason: input.reason,
    p_granted_hr: input.grantedHours ?? null,
  });
  if (error) throw error;
}

export const TICKET_STATUS_WORDS: Record<string, string> = {
  REQUESTED: 'Waiting for Admin',
  ADMIN_APPROVED: 'Approved',
  ADMIN_REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  GM_APPROVED: 'Approved',
  GM_REJECTED: 'Rejected',
  MANAGER_APPROVED: 'Manager approved',
  MANAGER_REJECTED: 'Rejected',
};
