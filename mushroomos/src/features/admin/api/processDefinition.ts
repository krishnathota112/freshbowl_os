import { supabase } from './client';
import type {
  ActivityVariant,
  ConflictEntry,
  EvidenceRequirement,
  GateRule,
  Material,
  ProcessActivity,
  RoleEligibility,
} from '../domain/types';

/**
 * Reads the process definition. Read-only: nothing in Steps 1–2 writes process state.
 *
 * Note there is no list of activity codes anywhere in src/. Adding an activity is a seed
 * change and this loader picks it up without modification — that is the check-15 claim.
 */

export type ProcessDefinitionTree = {
  code: string;
  name: string;
  status: string;
  anchorDayLabel: string;
  totalDays: number;
  sourceRef: string;
  activities: ProcessActivity[];
  evidence: EvidenceRequirement[];
  gates: GateRule[];
  variants: ActivityVariant[];
};

export async function loadProcessDefinition(code: string): Promise<ProcessDefinitionTree> {
  const { data: def, error: defErr } = await supabase
    .from('process_definition')
    .select('id, code, name, status, anchor_day_label, total_days, source_ref')
    .eq('code', code)
    .order('version', { ascending: false })
    .limit(1)
    .single();
  if (defErr) throw defErr;

  const { data: activities, error: actErr } = await supabase
    .from('process_activity')
    .select(
      'id, code, label_template, material_role, stream, rel_day, seq, scope, cardinality_rule, duration_target_min_hr, duration_target_max_hr, duration_required_at_day0, is_time_gate, golden_rule, source_ref, tbd_marker'
    )
    .eq('process_definition_id', def.id)
    .order('seq');
  if (actErr) throw actErr;

  const ids = (activities ?? []).map((a) => a.id);

  const [ev, gates, variants] = await Promise.all([
    supabase
      .from('evidence_requirement')
      .select('process_activity_id, key, label, media_kinds, min_count, gates_submission, ordering')
      .in('process_activity_id', ids)
      .order('ordering'),
    supabase
      .from('gate_rule')
      .select(
        'process_activity_id, phase, kind, config, predecessor_binding, is_enabled, mapping_confidence, conflict_id, blocked_reason_template'
      )
      .in('process_activity_id', ids)
      .order('ordering'),
    supabase
      .from('activity_variant')
      .select('process_activity_id, code, label, auto_select_enabled, conflict_id, selection_rule')
      .in('process_activity_id', ids),
  ]);

  if (ev.error) throw ev.error;
  if (gates.error) throw gates.error;
  if (variants.error) throw variants.error;

  return {
    code: def.code,
    name: def.name,
    status: def.status,
    anchorDayLabel: def.anchor_day_label,
    totalDays: def.total_days,
    sourceRef: def.source_ref,
    activities: (activities ?? []) as unknown as ProcessActivity[],
    evidence: (ev.data ?? []) as unknown as EvidenceRequirement[],
    gates: (gates.data ?? []) as unknown as GateRule[],
    variants: (variants.data ?? []) as unknown as ActivityVariant[],
  };
}

export type RoleBinding = { role: string; materials: Material[]; leadId: string | null };

export async function loadMaterialRoles(): Promise<RoleBinding[]> {
  const [{ data: materials, error: mErr }, { data: elig, error: eErr }] = await Promise.all([
    supabase.from('material').select('id, code, name, category').order('code'),
    supabase.from('material_role_eligibility').select('role, material_id, is_default_lead'),
  ]);
  if (mErr) throw mErr;
  if (eErr) throw eErr;

  const byId = new Map((materials ?? []).map((m) => [m.id, m as Material]));
  const grouped = new Map<string, RoleBinding>();

  for (const e of (elig ?? []) as RoleEligibility[]) {
    const entry = grouped.get(e.role) ?? { role: e.role, materials: [], leadId: null };
    const mat = byId.get(e.material_id);
    if (mat) entry.materials.push(mat);
    if (e.is_default_lead) entry.leadId = e.material_id;
    grouped.set(e.role, entry);
  }
  return [...grouped.values()];
}

export async function loadConflicts(): Promise<Map<string, ConflictEntry>> {
  const { data, error } = await supabase
    .from('conflict_register')
    .select('conflict_id, kind, severity, question, ship_with_default, status');
  if (error) throw error;
  return new Map(((data ?? []) as ConflictEntry[]).map((c) => [c.conflict_id, c]));
}
