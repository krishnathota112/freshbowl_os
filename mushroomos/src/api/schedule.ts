import { supabase } from './client';

/**
 * The schedule builder's data.
 *
 * Reads are direct. Every write goes through a SECURITY DEFINER function whose parameter
 * list is a whitelist — code, day, order, scope and dependencies are not reachable through
 * it, which is what keeps the shape fixed while the content stays hers.
 */

export type ScheduleRow = {
  id: string;
  code: string;
  title: string;
  stream: string;
  scope: string;
  scope_label: string;
  instance_no: number;
  rel_day: number;
  seq: number;
  is_time_gate: boolean;
  responsible_role: 'operator' | 'lab_tech' | 'supervisor' | 'gm' | 'admin' | 'manager';
  lab_parameters: string[] | null;
  duration_target_min_hr: number | null;
  duration_target_max_hr: number | null;
  day0_duration_hr: number | null;
  planned_qty_mt: number | null;
  planned_qty_override_mt: number | null;
  planned_time: string | null;
  assigned_person_id: string | null;
  assigned_machine_id: string | null;
  assigned_vehicle_id: string | null;
  source_location_id: string | null;
  destination_location_id: string | null;
  variant_code: string | null;
  golden_rule: string | null;
  tbd_marker: string | null;
  state: string;
  blocked_reason: string | null;
  admin_question: string | null;
  day_span_label: string | null;
};

export type Finding = {
  severity: 'blocking' | 'warning' | 'info';
  code: string;
  message: string;
  activity_id: string | null;
};

export type Option = { id: string; label: string; kind?: string };

export async function loadSchedule(batchId: string): Promise<ScheduleRow[]> {
  const { data, error } = await supabase
    .from('batch_activity')
    .select(
      'id, code, title, stream, scope, scope_label, instance_no, rel_day, seq, is_time_gate, responsible_role, lab_parameters, duration_target_min_hr, duration_target_max_hr, day0_duration_hr, planned_qty_mt, planned_qty_override_mt, planned_time, assigned_person_id, assigned_machine_id, assigned_vehicle_id, source_location_id, destination_location_id, variant_code, golden_rule, tbd_marker, state, blocked_reason, process_activity(admin_question, day_span_label)'
    )
    .eq('master_batch_id', batchId)
    .order('rel_day')
    .order('seq')
    .order('instance_no');
  if (error) throw error;

  // Flatten the joined definition text onto the row.
  return (data ?? []).map((r) => {
    const pa = (r as Record<string, unknown>).process_activity as
      | { admin_question: string | null; day_span_label: string | null }
      | null;
    return {
      ...(r as unknown as ScheduleRow),
      admin_question: pa?.admin_question ?? null,
      day_span_label: pa?.day_span_label ?? null,
    };
  });
}

export async function loadOptions() {
  const [locations, machines, people, movement, variants, evidence] = await Promise.all([
    supabase.from('location').select('id, code, label, kind').order('code'),
    supabase.from('machine').select('id, code, name, kind').order('code'),
    supabase.from('profiles').select('id, display_name, role').eq('is_active', true),
    supabase
      .from('movement_rule')
      .select('process_activity_id, source_kind, destination_kind, requires_distinct_vessel'),
    supabase.from('activity_variant').select('process_activity_id, code, label, auto_select_enabled'),
    supabase.from('batch_activity_evidence_req').select('batch_activity_id, label, min_count'),
  ]);
  for (const r of [locations, machines, people, movement, variants, evidence]) {
    if (r.error) throw r.error;
  }
  return {
    locations: (locations.data ?? []) as { id: string; code: string; label: string; kind: string }[],
    machines: (machines.data ?? []) as { id: string; code: string; name: string; kind: string }[],
    people: (people.data ?? []) as { id: string; display_name: string; role: string }[],
    movement: (movement.data ?? []) as {
      process_activity_id: string;
      source_kind: string | null;
      destination_kind: string | null;
      requires_distinct_vessel: boolean;
    }[],
    variants: (variants.data ?? []) as {
      process_activity_id: string;
      code: string;
      label: string;
      auto_select_enabled: boolean;
    }[],
    evidence: (evidence.data ?? []) as {
      batch_activity_id: string;
      label: string;
      min_count: number;
    }[],
  };
}

/** Which activity template each instance came from — needed to look up movement rules. */
export async function loadTemplateMap(batchId: string) {
  const { data, error } = await supabase
    .from('batch_activity')
    .select('id, process_activity_id')
    .eq('master_batch_id', batchId);
  if (error) throw error;
  const m = new Map<string, string>();
  for (const r of data ?? []) m.set(r.id as string, r.process_activity_id as string);
  return m;
}

export async function setActivityPlan(activityId: string, patch: Record<string, string | null>) {
  const { error } = await supabase.rpc('set_activity_plan', {
    p_activity: activityId,
    p_patch: patch,
  });
  if (error) throw error;
}

export async function assignActivity(activityId: string, personId: string, reason?: string) {
  const { error } = await supabase.rpc('assign_activity', {
    p_activity: activityId,
    p_person: personId,
    p_reason: reason ?? null,
  });
  if (error) throw error;
}

export async function sendAlert(
  activityId: string,
  role: 'operator' | 'lab_tech' | 'supervisor',
  message: string,
  reason?: string
) {
  const { error } = await supabase.rpc('send_alert', {
    p_activity: activityId,
    p_role: role,
    p_message: message,
    p_reason: reason ?? null,
  });
  if (error) throw error;
}

export async function validateBatch(batchId: string): Promise<Finding[]> {
  const { data, error } = await supabase.rpc('validate_batch', { p_batch: batchId });
  if (error) throw error;
  return (data ?? []) as Finding[];
}

export async function loadNotifications(batchId: string) {
  const { data, error } = await supabase
    .from('notification')
    .select('id, kind, message, reason, to_role, sent_at')
    .eq('master_batch_id', batchId)
    .order('sent_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return data ?? [];
}

/** Day labels come from the definition, and a rest that spans days reads as a span. */
export function dayLabel(rows: ScheduleRow[], day: number, allDays: number[]): string {
  const idx = allDays.indexOf(day);
  const next = allDays[idx + 1];
  const spans = rows.some((r) => r.is_time_gate) && next !== undefined && next - day > 1;
  return spans ? `Day ${day}–${next - 1}` : `Day ${day}`;
}

export const DAY_TITLES: Record<number, string> = {
  0: 'Weighment',
  1: 'Wetting and bunker loading',
  2: 'Rest',
  4: 'Reload, and straw arrives',
  5: 'First soak, bunker storage',
  6: 'Second soak',
  7: 'Third soak, nitrogen mix, yard integration',
  8: 'Turner passes and bunker loading',
  10: 'Rest',
  12: 'Bunker reload',
  13: 'Rest',
  15: 'Tunnel loading',
  16: 'Tunnel process',
  22: 'Tunnel unloading and compost-out',
  23: 'Batch state',
};
