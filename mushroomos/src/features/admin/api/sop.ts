/**
 * SOP editing and batch amendments (migration 0130).
 *
 * The screen asks and renders; the server decides. Planned hours, which steps wait for which, what a
 * draft insert moves, what an amendment re-wires and every refusal come from the 0130 functions and the
 * existing projection (`project_batch`). Nothing here computes a process rule.
 */
import { supabase } from '../../../shared/api/client';
import { listBatchTimeline } from '../../../shared/api/monitor';
import { loadBatchActivitiesNow, loadBatchesNow } from '../../../shared/api/projection';

export type LabCheck = 'none' | 'before' | 'after' | 'both';

/** One activity of an SOP version (a process definition), with the steps it waits for. */
export type SopActivity = {
  id: string;
  code: string;
  title: string;
  stream: string;
  scope: string;
  stage: string | null;
  start: number | null;
  end: number | null;
  isHold: boolean;
  isPreH0: boolean;
  isLab: boolean;
  labGate: boolean;
  waitsFor: string[];
  /** A Lab activity: the parameters it measures and the field steps it belongs to (its own SOP data). */
  labParams: string[];
  labFor: string[];
};

export type SopVersion = {
  id: string;
  code: string;
  version: number;
  status: 'draft' | 'published' | 'archived';
  name: string;
  standardHr: number | null;
  activityCount: number;
  isCurrent: boolean;
  publishedAt: string | null;
  batches: number;
};

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

export async function listSopVersions(): Promise<SopVersion[]> {
  const [cat, batches] = await Promise.all([
    supabase
      .from('v_process_catalogue')
      .select('process_definition_id, code, version, status, name, standard_hr, activity_count, is_current, published_at')
      .not('code', 'like', 'AMEND-%')
      .order('code', { ascending: false })
      .order('version', { ascending: false }),
    supabase.from('master_batch').select('process_definition_id, status').in('status', ['active', 'draft']),
  ]);
  if (cat.error) throw cat.error;
  if (batches.error) throw batches.error;
  const count = new Map<string, number>();
  for (const b of batches.data ?? []) count.set(b.process_definition_id, (count.get(b.process_definition_id) ?? 0) + 1);
  return (cat.data ?? []).map((r) => ({
    id: r.process_definition_id,
    code: r.code,
    version: r.version,
    status: r.status,
    name: r.name,
    standardHr: num(r.standard_hr),
    activityCount: Number(r.activity_count ?? 0),
    isCurrent: !!r.is_current,
    publishedAt: r.published_at,
    batches: count.get(r.process_definition_id) ?? 0,
  }));
}

export async function getSopVersion(id: string): Promise<SopVersion | null> {
  return (await listSopVersions()).find((v) => v.id === id) ?? null;
}

type ActivityRow = {
  id: string;
  code: string;
  label_template: string;
  stream: string;
  scope: string;
  stage: string | null;
  standard_start_hour: number | string | null;
  standard_end_hour: number | string | null;
  is_hold: boolean;
  is_pre_h0: boolean;
  lab_parameters: string[] | null;
  gate_rule: { kind: string; phase: string; is_enabled: boolean; config: { activity_codes?: string[]; when?: string; field_step?: string } }[];
  lab_checkpoint_activity: { checkpoint_code: string; gates_activity_code: string | null }[];
};

export async function loadSopActivities(definitionId: string): Promise<SopActivity[]> {
  const { data, error } = await supabase
    .from('process_activity')
    .select(
      'id, code, label_template, stream, scope, stage, standard_start_hour, standard_end_hour, is_hold, is_pre_h0, lab_parameters, ' +
        'gate_rule(kind, phase, is_enabled, config), lab_checkpoint_activity(checkpoint_code, gates_activity_code)'
    )
    .eq('process_definition_id', definitionId);
  if (error) throw error;
  return ((data ?? []) as unknown as ActivityRow[])
    .map((r) => ({
      id: r.id,
      code: r.code,
      title: r.label_template,
      stream: r.stream,
      scope: r.scope,
      stage: r.stage,
      start: num(r.standard_start_hour),
      end: num(r.standard_end_hour),
      isHold: r.is_hold,
      isPreH0: r.is_pre_h0,
      isLab: r.lab_checkpoint_activity.length > 0,
      labGate: r.gate_rule.some((g) => g.kind === 'LAB_APPROVED' && g.is_enabled),
      waitsFor: r.gate_rule
        .filter((g) => g.kind === 'PREDECESSOR' && g.phase === 'entry' && g.is_enabled && g.config?.when !== 'started')
        .flatMap((g) => g.config?.activity_codes ?? []),
      labParams: r.lab_parameters ?? [],
      labFor: [
        ...r.gate_rule.map((g) => g.config?.field_step).filter((x): x is string => !!x),
        ...r.lab_checkpoint_activity.map((l) => l.gates_activity_code).filter((x): x is string => !!x),
      ],
    }))
    .sort((a, b) => (a.start ?? -1) - (b.start ?? -1) || a.code.localeCompare(b.code));
}

export type LabParameter = { code: string; label: string; unit: string | null };

export async function listLabParameters(): Promise<LabParameter[]> {
  const { data, error } = await supabase.from('v_lab_parameter_choice').select('code, label, unit').order('label');
  if (error) throw error;
  return (data ?? []) as LabParameter[];
}

export async function cloneSop(fromId: string): Promise<string> {
  const { data, error } = await supabase.rpc('clone_process_definition', { p_from: fromId, p_code: null, p_name: null });
  if (error) throw error;
  return data as string;
}

export async function insertIntoDraft(input: {
  definitionId: string;
  afterCode: string;
  templateCode: string;
  title: string;
  durationHr: number;
  isHold: boolean;
}): Promise<{ newCode: string; moved: number; standardHr: number | null }> {
  const { data, error } = await supabase.rpc('draft_insert_activity', {
    p_def: input.definitionId,
    p_after_code: input.afterCode,
    p_template_code: input.templateCode,
    p_title: input.title,
    p_duration_hr: input.durationHr,
    p_is_hold: input.isHold,
  });
  if (error) throw error;
  const row = (data as { new_code: string; moved: number; standard_hr: number | null }[])[0];
  return { newCode: row.new_code, moved: row.moved, standardHr: num(row.standard_hr) };
}

export async function publishSop(id: string, reason: string) {
  const { error } = await supabase.rpc('publish_process_definition', { p_definition: id, p_reason: reason });
  if (error) throw error;
}

export async function discardDraft(id: string) {
  const { error } = await supabase.rpc('discard_draft_process', { p_def: id });
  if (error) throw error;
}

/* ── running batches ─────────────────────────────────────────────────────────────────────── */

export type SopBatch = {
  id: string;
  code: string;
  label: string;
  status: string;
  isDemo: boolean;
  definitionId: string;
  sop: string;
  currentHour: number | null;
  runningNow: string | null;
  nextUp: string | null;
  projectedFinish: string | null;
  amendments: number;
};

export async function listSopBatches(): Promise<SopBatch[]> {
  const [mb, now, am] = await Promise.all([
    supabase
      .from('master_batch')
      .select('id, code, label, status, is_demo, process_definition_id, process_definition:process_definition_id(code, version)')
      .in('status', ['active', 'draft'])
      .order('created_at', { ascending: false }),
    loadBatchesNow(),
    supabase.from('batch_amendment').select('master_batch_id'),
  ]);
  if (mb.error) throw mb.error;
  if (am.error) throw am.error;
  const byId = new Map(now.map((n) => [n.master_batch_id, n]));
  const amCount = new Map<string, number>();
  for (const a of am.data ?? []) amCount.set(a.master_batch_id, (amCount.get(a.master_batch_id) ?? 0) + 1);
  type Row = { id: string; code: string; label: string; status: string; is_demo: boolean; process_definition_id: string; process_definition: { code: string; version: number } | null };
  return ((mb.data ?? []) as unknown as Row[]).map((r) => {
    const n = byId.get(r.id);
    return {
      id: r.id,
      code: r.code,
      label: r.label,
      status: r.status,
      isDemo: r.is_demo,
      definitionId: r.process_definition_id,
      sop: r.process_definition ? `${r.process_definition.code} v${r.process_definition.version}` : '—',
      currentHour: num(n?.current_hour),
      runningNow: n?.running_now ?? null,
      nextUp: n?.next_up ?? null,
      projectedFinish: n?.projected_finish ?? null,
      amendments: amCount.get(r.id) ?? 0,
    };
  });
}

/** One task of a batch: its frozen plan beside the server's forecast. */
export type BatchTask = {
  id: string;
  code: string;
  title: string;
  stream: string;
  scopeLabel: string | null;
  state: string;
  isHold: boolean;
  isLab: boolean;
  labGate: boolean;
  beforeTracking: boolean;
  planStart: number | null;
  planEnd: number | null;
  plannedStartAt: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  projectedStartAt: string | null;
  projectedEndAt: string | null;
  waitingFor: string | null;
  blockedReason: string | null;
  delayMinutes: number | null;
  isAmendment: boolean;
};

export async function loadBatchTasks(batchId: string): Promise<BatchTask[]> {
  const [timeline, projection] = await Promise.all([listBatchTimeline(batchId), loadBatchActivitiesNow(batchId).catch(() => [])]);
  const byId = new Map(projection.map((p) => [p.activity_id, p]));
  return timeline
    .map((t) => {
      const p = byId.get(t.activity_id);
      return {
        id: t.activity_id,
        code: t.code,
        title: t.title,
        stream: t.stream,
        scopeLabel: t.scope_label,
        state: p?.state ?? t.state,
        isHold: t.is_hold,
        isLab: t.is_lab,
        labGate: !!t.lab_is_gate,
        beforeTracking: t.before_tracking,
        planStart: num(t.baseline_start_hour),
        planEnd: num(t.baseline_end_hour),
        plannedStartAt: t.planned_start_at,
        actualStart: p?.actual_start ?? t.actual_start,
        actualEnd: p?.actual_end ?? t.actual_end,
        projectedStartAt: p?.projected_start_at ?? null,
        projectedEndAt: p?.projected_end_at ?? null,
        waitingFor: p?.waiting_for_title ?? null,
        blockedReason: p?.blocked_reason ?? t.blocked_reason,
        delayMinutes: num(p?.delay_minutes),
        isAmendment: /^AMD\d+-/.test(t.code),
      };
    })
    .sort((a, b) => (a.planStart ?? -1) - (b.planStart ?? -1) || a.code.localeCompare(b.code));
}

export type Amendment = {
  id: string;
  title: string;
  newCode: string | null;
  afterTitle: string | null;
  durationHr: number;
  isHold: boolean;
  labCheck: LabCheck;
  cleaning: LabCheck;
  reason: string;
  rewiredCodes: string[];
  labParams: string[];
  labGate: boolean;
  cleanWait: boolean;
  labTasks: { title: string; state: string }[];
  cleaningJobs: { label: string; state: string }[];
  newStart: number | null;
  newEnd: number | null;
  createdAt: string;
  createdBy: string | null;
};

export async function listAmendments(batchId: string): Promise<Amendment[]> {
  const { data, error } = await supabase
    .from('v_batch_amendment')
    .select('*')
    .eq('master_batch_id', batchId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    newCode: r.new_code,
    afterTitle: r.after_title,
    durationHr: Number(r.duration_hr),
    isHold: r.is_hold,
    labCheck: r.lab_check,
    cleaning: r.cleaning,
    reason: r.reason,
    rewiredCodes: r.rewired_codes ?? [],
    labParams: r.lab_params ?? [],
    labGate: !!r.lab_gate,
    cleanWait: !!r.clean_wait,
    labTasks: r.lab_tasks ?? [],
    cleaningJobs: r.cleaning_jobs ?? [],
    newStart: num(r.new_start_hour),
    newEnd: num(r.new_end_hour),
    createdAt: r.created_at,
    createdBy: r.created_by_name,
  }));
}

export async function amendBatch(input: {
  batchId: string;
  afterActivityId: string;
  templateCode: string;
  title: string;
  durationHr: number;
  isHold: boolean;
  labCheck: LabCheck;
  cleaning: LabCheck;
  reason: string;
  labParams: string[];
  labGate: boolean;
  cleanLocations: string[];
  cleanWait: boolean;
}): Promise<string> {
  const { data, error } = await supabase.rpc('amend_batch_add_activity', {
    p_batch: input.batchId,
    p_after: input.afterActivityId,
    p_template_code: input.templateCode,
    p_title: input.title,
    p_duration_hr: input.durationHr,
    p_is_hold: input.isHold,
    p_lab_check: input.labCheck,
    p_cleaning: input.cleaning,
    p_reason: input.reason,
    p_lab_params: input.labCheck === 'none' ? null : input.labParams,
    p_lab_gate: input.labGate,
    p_clean_locations: input.cleaning === 'none' ? null : input.cleanLocations,
    p_clean_wait: input.cleanWait,
  });
  if (error) throw error;
  return data as string;
}

/** For each task of a batch, the steps it waits for today (finish edges), read from its own SOP rows. */
export async function loadBatchWaits(batchId: string): Promise<Map<string, string[]>> {
  const { data, error } = await supabase
    .from('batch_activity')
    .select('code, process_activity:process_activity_id(gate_rule(kind, phase, is_enabled, config))')
    .eq('master_batch_id', batchId);
  if (error) throw error;
  type Row = { code: string; process_activity: { gate_rule: ActivityRow['gate_rule'] } | null };
  const out = new Map<string, string[]>();
  for (const r of (data ?? []) as unknown as Row[]) {
    out.set(
      r.code,
      (r.process_activity?.gate_rule ?? [])
        .filter((g) => g.kind === 'PREDECESSOR' && g.phase === 'entry' && g.is_enabled && g.config?.when !== 'started')
        .flatMap((g) => g.config?.activity_codes ?? [])
    );
  }
  return out;
}
