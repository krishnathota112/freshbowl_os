/**
 * The verification console's data: `v_batch_monitor` (one row per batch) and `v_batch_timeline` (one
 * row per activity), both from 0086. Read-only. Everything shown is what the server persisted —
 * performer, server timestamps, readings, the evidence rows and their storage paths, lab results and
 * the latest decision.
 */
import { supabase } from '../../../shared/api/client';

export type BatchMonitor = {
  master_batch_id: string;
  batch_code: string;
  batch_label: string;
  is_demo: boolean | null;
  status: string;
  process_code: string;
  process_version: number;
  h0: string | null;
  activated_at: string | null;
  onboarded: boolean;
  materials: string | null;
  production_total: number;
  production_completed: number;
  production_before_tracking: number;
  production_ready: number;
  production_in_progress: number;
  production_locked: number;
  deviations: number;
  lab_pending: number;
  awaiting_gm: number;
  overdue: number;
  current_stages: string | null;
  last_activity_at: string | null;
  open_tickets: number;
};

export type TimelineTicket = {
  id: string;
  status: string;
  requested_at: string;
  requested_by: string | null;
  requested_by_role: string | null;
  hours: number;
  reason: string;
  overdue_at_request: boolean;
  decision: string | null;
  decided_at: string | null;
  decided_by: string | null;
  granted_hr: number | null;
  decision_reason: string | null;
  photos: { storage_path: string; uploaded_at: string; media_kind: string }[];
};

export type TimelineReading = {
  key: string;
  label: string;
  datatype: string | null;
  unit: string | null;
  target: string | null;
  value: string | null;
  flag: string | null;
  skip_reason: string | null;
  remarks: string | null;
  recorded_at: string | null;
  recorded_by: string | null;
};

export type TimelinePhoto = {
  media_id: string;
  requirement_key: string;
  label: string | null;
  storage_path: string;
  media_kind: string;
  uploaded_at: string;
  uploaded_by: string | null;
  superseded: boolean;
  superseded_reason: string | null;
};

export type TimelineLabResult = {
  sample_label: string | null;
  collected_at: string | null;
  collected_by: string | null;
  parameter: string | null;
  value: string | null;
  unit: string | null;
  verdict: string | null;
  measured_at: string | null;
  technician: string | null;
  retest_reason: string | null;
};

export type TimelineRow = {
  master_batch_id: string;
  batch_code: string;
  activity_id: string;
  code: string;
  title: string;
  stage: string | null;
  stream: string;
  scope_label: string | null;
  seq: number;
  responsible_role: string | null;
  is_lab: boolean;
  is_hold: boolean;
  state: string;
  blocked_reason: string | null;
  unresolved_dependency: string | null;
  before_tracking: boolean;
  onboarded_position: boolean;
  skip_reason: string | null;
  skipped_at: string | null;
  duration_target_min_hr: number | null;
  duration_target_max_hr: number | null;
  actual_start: string | null;
  started_by_name: string | null;
  actual_end: string | null;
  submitted_at: string | null;
  finished_by_name: string | null;
  overdue: boolean;
  readings: TimelineReading[];
  photos: TimelinePhoto[];
  photo_requirements: { key: string; label: string; required: number; captured: number }[];
  lab_checkpoint: string | null;
  lab_is_gate: boolean | null;
  lab_results: TimelineLabResult[];
  decision_verdict: string | null;
  decision_reason: string | null;
  decided_at: string | null;
  decided_role: string | null;
  decided_by_name: string | null;
  approved_out_of_range: boolean | null;
  tickets: TimelineTicket[];
};

export async function listBatchMonitors(statuses: string[] = ['active']): Promise<BatchMonitor[]> {
  const { data, error } = await supabase
    .from('v_batch_monitor')
    .select('*')
    .in('status', statuses)
    .order('h0', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as BatchMonitor[];
}

export async function getBatchMonitor(batchId: string): Promise<BatchMonitor | null> {
  const { data, error } = await supabase.from('v_batch_monitor').select('*').eq('master_batch_id', batchId).maybeSingle();
  if (error) throw error;
  return (data as BatchMonitor) ?? null;
}

export async function listBatchTimeline(batchId: string): Promise<TimelineRow[]> {
  const { data, error } = await supabase
    .from('v_batch_timeline')
    .select('*')
    .eq('master_batch_id', batchId)
    .order('seq');
  if (error) throw error;
  return (data ?? []) as TimelineRow[];
}

export type InitialMaterialValue = { parameter: string; value: string | null; unit: string | null; verdict: string | null; measuredAt: string | null; by: string | null };

/** The batch's pre-H0 / initial material data: its pre-batch sample(s) and current results. */
export async function listInitialMaterial(batchId: string): Promise<InitialMaterialValue[]> {
  const { data, error } = await supabase
    .from('lab_sample')
    .select('collected_at, collector:profiles!lab_sample_collected_by_fkey(display_name), lab_test(parameter_code, state, lab_result(value_numeric, value_text, unit, verdict, measured_at, superseded_by_result_id))')
    .eq('master_batch_id', batchId)
    .is('batch_activity_id', null)
    .order('collected_at');
  if (error) throw error;
  const out: InitialMaterialValue[] = [];
  for (const s of (data ?? []) as unknown as Record<string, unknown>[]) {
    const by = (s.collector as { display_name: string } | null)?.display_name ?? null;
    for (const t of (s.lab_test as Record<string, unknown>[] | null) ?? []) {
      if (t.state === 'superseded' || t.state === 'cancelled') continue;
      const results = ((t.lab_result as Record<string, unknown>[] | null) ?? []).filter((r) => r.superseded_by_result_id === null);
      const r = results[0];
      out.push({
        parameter: String(t.parameter_code),
        value: r ? String(r.value_numeric ?? r.value_text ?? '') : null,
        unit: (r?.unit as string | null) ?? null,
        verdict: (r?.verdict as string | null) ?? null,
        measuredAt: (r?.measured_at as string | null) ?? null,
        by,
      });
    }
  }
  return out;
}
