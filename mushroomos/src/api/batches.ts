import { supabase } from './client';

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

export const ROLE_ORDER = [
  'PRIMARY_FIBRE',
  'STRUCTURAL_STRAW',
  'NITROGEN_SOURCE',
  'MINERAL',
  'SECONDARY_FIBRE',
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
  planned_start: string | null;
  duration_target_min_hr: number | null;
  duration_target_max_hr: number | null;
  day0_duration_hr: number | null;
  is_time_gate: boolean;
  golden_rule: string | null;
  tbd_marker: string | null;
  state: string;
  blocked_reason: string | null;
};

export async function listBatches(): Promise<BatchSummary[]> {
  const { data, error } = await supabase
    .from('master_batch')
    .select('id, code, label, start_date, status, supervisor_name, activated_at')
    .order('start_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BatchSummary[];
}

export async function getBatch(id: string) {
  const [batch, steps, roles] = await Promise.all([
    supabase
      .from('master_batch')
      .select('id, code, label, start_date, status, supervisor_name, weather_note, config, activated_at')
      .eq('id', id)
      .single(),
    supabase
      .from('batch_activity')
      .select(
        'id, code, title, stream, rel_day, seq, scope_label, instance_no, planned_qty_mt, planned_start, duration_target_min_hr, duration_target_max_hr, day0_duration_hr, is_time_gate, golden_rule, tbd_marker, state, blocked_reason'
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

export type CreateBatchInput = {
  code: string;
  label: string;
  startDate: string;
  config: Record<string, number | string>;
  roles: { role: string; material_code: string; lead: boolean }[];
  supervisor?: string;
  weather?: string;
};

export async function createBatch(input: CreateBatchInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_master_batch', {
    p_code: input.code,
    p_label: input.label,
    p_start_date: input.startDate,
    p_config: input.config,
    p_roles: input.roles,
    p_supervisor: input.supervisor ?? null,
    p_weather: input.weather ?? null,
  });
  if (error) throw error;
  return data as string;
}

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
