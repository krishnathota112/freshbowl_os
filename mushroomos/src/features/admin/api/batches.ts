import { supabase } from '../../../shared/api/client';

/** Plain-English names for the material roles. The codes stay in the database. */
export const ROLE_PLAIN: Record<string, { title: string; help: string }> = {
  PRIMARY_FIBRE: {
    title: 'Main fibre',
    help: 'The bulky material wetted at the hopper and conditioned in a bunker. Usually bagasse.',
  },
  SECONDARY_FIBRE: {
    title: 'Second fibre',
    help: 'Waxy straw wetted separately. Leave empty unless you are using wheat or mustard.',
  },
  TERTIARY_FIBRE: {
    title: 'Third fibre',
    help: 'Only when fibre is short: mixed in with the main and second fibre. Leave as "Not used" otherwise.',
  },
  STRUCTURAL_STRAW: {
    title: 'Straw',
    help: 'Soaked rather than hopper-wetted. Gives the compost its structure. Usually paddy.',
  },
  NITROGEN_SOURCE: {
    title: 'Nitrogen source',
    help: 'Dry-mixed, never wetted on its own. Usually chicken manure.',
  },
  MINERAL: {
    title: 'Minerals',
    help: 'Dry-mixed with the nitrogen source. Gypsum and ammonium sulphate.',
  },
  PH_CORRECTOR: {
    title: 'pH corrector',
    help: 'Only if you are correcting old fibre with lime.',
  },
};

// The fibres are listed together, in rank order: a later fibre cannot repeat an earlier one's material.
export const ROLE_ORDER = [
  'PRIMARY_FIBRE',
  'SECONDARY_FIBRE',
  'TERTIARY_FIBRE',
  'STRUCTURAL_STRAW',
  'NITROGEN_SOURCE',
  'MINERAL',
  'PH_CORRECTOR',
];

export type BatchSummary = {
  id: string;
  code: string;
  label: string;
  start_date: string;
  status: 'draft' | 'active' | 'closed' | 'cancelled';
  supervisor_name: string | null;
  activated_at: string | null;
};

export type BatchStep = {
  id: string;
  code: string;
  title: string;
  stream: string;
  rel_day: number;
  seq: number;
  scope_label: string;
  instance_no: number;
  planned_qty_mt: number | null;
  /** Hours from H0, point scale. Zone-free, so populated even while TBD-50 is open. */
  baseline_start_hour: number | null;
  baseline_end_hour: number | null;
  /** H0 + the baseline hour. Null while H0 is unknown — never a midnight stand-in. */
  planned_start_at: string | null;
  planned_end_at: string | null;
  duration_target_min_hr: number | null;
  duration_target_max_hr: number | null;
  day0_duration_hr: number | null;
  is_time_gate: boolean;
  golden_rule: string | null;
  tbd_marker: string | null;
  state: string;
  blocked_reason: string | null;
  /** GENERATED in the database. Criterion 21. */
  variance_minutes: number | null;
};

export async function listBatches(): Promise<BatchSummary[]> {
  const { data, error } = await supabase
    .from('master_batch')
    .select('id, code, label, start_date, start_at, status, supervisor_name, activated_at')
    .order('start_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BatchSummary[];
}

export async function getBatch(id: string) {
  const [batch, steps, roles] = await Promise.all([
    supabase
      .from('master_batch')
      .select(
        'id, code, label, start_date, start_at, status, supervisor_name, weather_note, config, activated_at'
      )
      .eq('id', id)
      .single(),
    supabase
      .from('batch_activity')
      .select(
        'id, code, title, stream, rel_day, seq, scope_label, instance_no, planned_qty_mt, baseline_start_hour, baseline_end_hour, planned_start_at, planned_end_at, duration_target_min_hr, duration_target_max_hr, day0_duration_hr, is_time_gate, golden_rule, tbd_marker, state, blocked_reason, variance_minutes'
      )
      .eq('master_batch_id', id)
      .order('seq')
      .order('instance_no'),
    supabase
      .from('batch_material_role')
      .select('role, is_role_lead, material_id')
      .eq('master_batch_id', id),
  ]);
  if (batch.error) throw batch.error;
  if (steps.error) throw steps.error;
  if (roles.error) throw roles.error;
  return {
    batch: batch.data,
    steps: (steps.data ?? []) as unknown as BatchStep[],
    roles: roles.data ?? [],
  };
}

/** Evidence requirement counts per step, for the whole batch, in one round trip. */
export async function getEvidenceCounts(batchId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('batch_activity')
    .select('id, batch_activity_evidence_req(id)')
    .eq('master_batch_id', batchId);
  if (error) throw error;
  const out = new Map<string, number>();
  for (const row of (data ?? []) as { id: string; batch_activity_evidence_req: unknown[] }[]) {
    out.set(row.id, row.batch_activity_evidence_req?.length ?? 0);
  }
  return out;
}

// 16 Sep 2026 audit: this file used to export CreateBatchInput/createBatch(), a second
// path into create_master_batch that never passed p_process_definition_id — a batch
// created through it would silently fall back to the catalogue's global "current"
// process rather than whatever the Admin screen had selected. Nothing imports it
// (BatchStart.tsx uses createAndPlan() in ../api/intake.ts, which does pass
// processDefinitionId), so it was dead code, not a live bug — removed rather than left
// as a trap for a future screen to wire up by mistake.

export async function activateBatch(id: string): Promise<void> {
  const { error } = await supabase.rpc('activate_batch', { p_batch_id: id });
  if (error) throw error;
}

/** The rest periods the factory never stated. Each is a required Day-0 answer. */
export const REST_FIELDS = [
  {
    key: 'rest_hr_FIB1-REST-1',
    title: 'After the first bunker loading',
    when: 'Days 2–3',
    tbd: 'TBD-21',
    suggestion: 48,
    note: 'The walkthrough gives two rest days without stating the hours. The SOP conditions for 48–60 h.',
  },
  {
    key: 'rest_hr_STRAW-REST-1',
    title: 'After straw goes into the bunker',
    when: 'Day 5',
    tbd: 'TBD-24',
    suggestion: 12,
    note: 'The dictation is ambiguous between 2 h and 12 h.',
  },
  {
    key: 'rest_hr_STRAW-REST-2',
    title: 'After the third soak',
    when: 'Day 7',
    tbd: null,
    suggestion: 15,
    note: 'The walkthrough gives 14–16 h.',
  },
  {
    key: 'rest_hr_YD-REST',
    title: 'After the piles are combined',
    when: 'Day 7',
    tbd: null,
    suggestion: 9,
    note: 'The walkthrough gives 8–10 h.',
  },
  {
    key: 'rest_hr_P1-REST-1',
    title: 'After Phase-1 bunker loading',
    when: 'Days 10–11',
    tbd: 'TBD-21',
    suggestion: 48,
    note: 'Two rest days, hours not stated.',
  },
  {
    key: 'rest_hr_P1-REST-2',
    title: 'After the Phase-1 reload',
    when: 'Days 13–14',
    tbd: 'TBD-21',
    suggestion: 44,
    note: 'Two rest days, hours not stated. The SOP holds for 40–44 h.',
  },
  {
    key: 'rest_hr_TN-HOLD',
    title: 'Tunnel process',
    when: 'Days 16–21',
    tbd: 'C-27',
    suggestion: 144,
    note: 'Six days of monitored thermal stages, not a blank rest.',
  },
] as const;
