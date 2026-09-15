import { supabase } from './client';

/** Every write here goes through a SECURITY DEFINER function. Tables are read-only. */

export type BatchRow = {
  id: string;
  code: string;
  label: string;
  start_date: string;
  /**
   * H0 — the instant the batch clock starts. TIME_CONTRACT §1.1.
   *
   * `null` means H0 is unknown, which is a BLOCKING `validate_batch` finding and not a default.
   * It is null for every batch created before A2, because turning "05:00 factory time" into an
   * instant needs the factory timezone and TBD-50 is open. Render the stated empty state; do not
   * fall back to `start_date`, which is midnight in the viewer's zone.
   */
  start_at: string | null;
  status: 'draft' | 'validated' | 'active' | 'closed' | 'cancelled';
  supervisor_name: string | null;
  activated_at: string | null;
};

export type BatchActivityRow = {
  id: string;
  code: string;
  title: string;
  stream: string;
  scope: string;
  scope_label: string;
  instance_no: number;
  /** Derived and display-only. `baseline_start_hour` is the source of truth. TIME_CONTRACT §5. */
  rel_day: number;
  seq: number;
  /**
   * The activity's window on the hour axis, in hours from H0, on the POINT scale — Day n begins
   * at H(24n). Needs no timezone, so it is populated even while TBD-50 is open.
   * `baseline_end_hour` is null where the process states no duration (TBD-21).
   */
  baseline_start_hour: number | null;
  baseline_end_hour: number | null;
  /** H0 + the baseline hour. Null while H0 is unknown — never five hours early. */
  planned_start_at: string | null;
  planned_end_at: string | null;
  planned_qty_mt: number | null;
  duration_target_min_hr: number | null;
  duration_target_max_hr: number | null;
  day0_duration_hr: number | null;
  is_time_gate: boolean;
  golden_rule: string | null;
  tbd_marker: string | null;
  state: string;
  blocked_reason: string | null;
  actual_start: string | null;
  actual_end: string | null;
  /** GENERATED in the database. DEMO_PLAN_V2 criterion 21 — a write is rejected. */
  variance_minutes: number | null;
};

export type BatchValueRow = {
  id: string;
  batch_activity_id: string;
  field_key: string;
  label: string;
  unit: string | null;
  sop_value: string | null;
  sop_min: number | null;
  sop_max: number | null;
  sop_source_ref: string | null;
  conflict_id: string | null;
  day0_value: string | null;
  variance_allowed: string | null;
  actual_value: string | null;
  variance_flag: string | null;
  operator_input: string;
  display_order: number | null;
  /** 'numeric' | 'text' | 'duration' | 'check' (a checklist item, 0081). */
  datatype: string | null;
};

export type BatchEvidenceRow = {
  id: string;
  batch_activity_id: string;
  key: string;
  label: string;
  media_kinds: string[];
  min_count: number;
  satisfied_count: number;
  gates_submission: boolean;
  capture_hint: string | null;
  ordering: number;
  /** 'after_duration' (0096): taken only once the SOP time has passed since Start. */
  capture_phase: string;
};

/** The time gate on one task (0096 · time_gate_status). `hasGate` false means the task is not timed. */
export type TimeGate = {
  hasGate: boolean;
  hours: number | null;
  readyAt: string | null;
  readyLabel: string | null;
  /** The time part is met (server clock; always true on a DEMO / TEST batch, 0098). */
  timeOk: boolean;
  triggerLabel: string | null;
  triggerMin: number | null;
  triggerJoin: 'and' | 'or' | null;
  ok: boolean;
  summary: string | null;
};

export async function loadTimeGate(activityId: string): Promise<TimeGate> {
  const { data, error } = await supabase.rpc('time_gate_status', { p_activity: activityId });
  if (error) throw error;
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  return {
    hasGate: Boolean(r?.has_gate),
    hours: (r?.hours as number | null) ?? null,
    readyAt: (r?.ready_at as string | null) ?? null,
    readyLabel: (r?.ready_label as string | null) ?? null,
    timeOk: Boolean(r?.time_ok),
    triggerLabel: (r?.trigger_label as string | null) ?? null,
    triggerMin: (r?.trigger_min as number | null) ?? null,
    triggerJoin: (r?.trigger_join as 'and' | 'or' | null) ?? null,
    ok: r ? Boolean(r.ok) : true,
    summary: (r?.summary as string | null) ?? null,
  };
}

// Kept as inline literals rather than shared constants: supabase-js infers the row type from the
// select string, and a concatenated string degrades it to `GenericStringError[]`.

export async function listBatches(): Promise<BatchRow[]> {
  const { data, error } = await supabase
    .from('master_batch')
    .select('id, code, label, start_date, start_at, status, supervisor_name, activated_at')
    .order('start_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BatchRow[];
}

export async function getBatch(id: string): Promise<BatchRow> {
  const { data, error } = await supabase
    .from('master_batch')
    .select('id, code, label, start_date, start_at, status, supervisor_name, activated_at')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as BatchRow;
}

export async function getBatchActivities(batchId: string): Promise<BatchActivityRow[]> {
  const { data, error } = await supabase
    .from('batch_activity')
    .select(
      'id, code, title, stream, scope, scope_label, instance_no, rel_day, seq, baseline_start_hour, baseline_end_hour, planned_start_at, planned_end_at, planned_qty_mt, duration_target_min_hr, duration_target_max_hr, day0_duration_hr, is_time_gate, golden_rule, tbd_marker, state, blocked_reason, actual_start, actual_end, variance_minutes'
    )
    .eq('master_batch_id', batchId)
    .order('seq')
    .order('instance_no');
  if (error) throw error;
  return (data ?? []) as BatchActivityRow[];
}

export type PreBatchMaterialCheckRow = {
  master_batch_id: string;
  batch_code: string;
  batch_status: string;
  checkpoint_code: string;
  checkpoint_map: string;
  sample_id: string;
  sample_ref_label: string;
  collected_at: string;
  collected_by_name: string | null;
  tests_requested: number;
  results_current: number;
  failed: number;
  no_spec: number;
  accepted: number;
  before_h0: boolean | null;
};

export async function getPreBatchMaterialCheck(batchId: string): Promise<PreBatchMaterialCheckRow | null> {
  const { data, error } = await supabase
    .from('v_prebatch_material_check')
    .select('*')
    .eq('master_batch_id', batchId)
    .maybeSingle();
  if (error) return null;
  return data as PreBatchMaterialCheckRow | null;
}

export function isPreH0Activity(activity: { code: string; rel_day?: number; baseline_start_hour?: number | null }): boolean {
  return (
    activity.code === 'FIB1-WEIGH' ||
    activity.code.startsWith('RAW-') ||
    activity.code === 'RAW_MATERIAL' ||
    activity.code === 'RAW_MATERIAL_WEIGHMENT' ||
    (activity.rel_day != null && activity.rel_day < 0)
  );
}

/**
 * The standard length of ONE process version, calculated from that version's own activities.
 *
 * ⚠ THIS USED TO READ `process_definition.baseline_hours`, AND THAT WAS THE DAY GRID.
 *
 * `baseline_hours` is `(total_days + 1) × 24` — a generated column, correct at what it means
 * and never the standard. It reads 552 for PROCESS-2026B, whose activities compute 536, and
 * 480 for PROCESS-2026C, whose activities compute 470. Every screen showing "of 480" for a
 * 470-hour standard was showing a day count with an hour label on it.
 *
 * The standard is a PROPERTY OF THE SOP, not of this application. `v_process_catalogue`
 * derives it in the database (0045) from the definition's own stages, durations and
 * dependencies, so PROCESS-2026C answers 470 and a future standard answers whatever its own
 * process computes. Nothing here is a literal — TIME_CONTRACT §1.3, invariant 8 — and now
 * nothing here is a day grid either.
 */
export type ProcessBaseline = {
  code: string;
  /** The definition this describes. Pass it to `createBatch` to plan against exactly this one. */
  processDefinitionId: string;
  /** The standard, calculated from this version's activities. Pass to `isWithinBaseline`. */
  baselineHours: number;
  /**
   * The last hour anything happens, which is not always the standard. PROCESS-2026C's standard
   * is H470, measured on stream 1; the third stream is not out until H474. Both are true.
   */
  fullSpanHours: number;
  /** How many batch-days the process spans: Day 0 through Day `finalDayIndex`. */
  baselineDays: number;
  /** The index of the last day, which is what `process_definition.total_days` holds. */
  finalDayIndex: number;
};

/**
 * The standard for one process version — the current one by default.
 *
 * Pass `definitionId` whenever the caller knows which standard it is showing. Omitting it asks
 * the catalogue, which is right for "what would a NEW batch be planned against" and wrong for
 * any batch that already exists: a batch created on PROCESS-2026B stays a PROCESS-2026B batch
 * after 2026C becomes current, and measuring it against the new standard would misreport every
 * variance it has. For those, use `getBatchProcessVersion` in `api/process.ts`.
 */
export async function getPublishedBaseline(definitionId?: string): Promise<ProcessBaseline | null> {
  const query = supabase
    .from('v_process_catalogue')
    .select('process_definition_id, code, standard_hr, full_span_hr');

  const { data, error } = await (definitionId
    ? query.eq('process_definition_id', definitionId)
    : query.eq('is_current', true)
  ).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // `numeric` arrives as a string from PostgREST — `Number` here, never string arithmetic.
  const standard = Number(data.standard_hr);
  const span = Number(data.full_span_hr ?? data.standard_hr);
  if (!Number.isFinite(standard)) return null;

  return {
    code: data.code as string,
    processDefinitionId: data.process_definition_id as string,
    baselineHours: standard,
    fullSpanHours: Number.isFinite(span) ? span : standard,
    // The day grid, DERIVED FROM THE STANDARD rather than read from total_days, so the two can
    // never disagree on a screen that shows both.
    baselineDays: Math.ceil(standard / 24),
    finalDayIndex: Math.max(0, Math.ceil(standard / 24) - 1),
  };
}

/** H0, and the zone it is stated in. `timezone` is null while TBD-50 is open. */
export type FactoryClock = {
  h0HourOfDay: number;
  h0MinuteOfHour: number;
  timezone: string | null;
  timezoneConflictId: string | null;
};

export async function getFactoryClock(): Promise<FactoryClock | null> {
  const { data, error } = await supabase
    .from('factory_clock')
    .select('h0_hour_of_day, h0_minute_of_hour, timezone, timezone_conflict_id')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    h0HourOfDay: data.h0_hour_of_day as number,
    h0MinuteOfHour: data.h0_minute_of_hour as number,
    timezone: (data.timezone as string | null) ?? null,
    timezoneConflictId: (data.timezone_conflict_id as string | null) ?? null,
  };
}

export async function getActivityDetail(activityId: string) {
  const [values, evidence] = await Promise.all([
    supabase
      .from('batch_activity_value')
      .select(
        'id, batch_activity_id, field_key, label, unit, sop_value, sop_min, sop_max, sop_source_ref, conflict_id, day0_value, variance_allowed, actual_value, variance_flag, operator_input, display_order, datatype'
      )
      .eq('batch_activity_id', activityId)
      .order('display_order'),
    supabase
      .from('batch_activity_evidence_req')
      .select(
        'id, batch_activity_id, key, label, media_kinds, min_count, satisfied_count, gates_submission, capture_hint, ordering, capture_phase'
      )
      .eq('batch_activity_id', activityId)
      .order('ordering'),
  ]);
  if (values.error) throw values.error;
  if (evidence.error) throw evidence.error;
  return {
    values: (values.data ?? []) as BatchValueRow[],
    evidence: (evidence.data ?? []) as BatchEvidenceRow[],
  };
}

export type RoleBindingInput = { role: string; material_code: string; lead: boolean };

export async function createBatch(input: {
  code: string;
  label: string;
  start_date: string;
  /**
   * H0 as an explicit instant, when the caller has one. Omit it and the server derives 05:00
   * factory time on `start_date` from `factory_clock` — which yields null while TBD-50 is open,
   * rather than silently adopting a zone. Never send a locally-constructed midnight.
   */
  start_at?: string | null;
  config: Record<string, number | string>;
  roles: RoleBindingInput[];
  supervisor?: string;
  weather?: string;
  /**
   * WHICH STANDARD THIS BATCH IS PLANNED AGAINST.
   *
   * Omit it and the server reads `process_catalogue` — the current standard. Pass one to plan
   * deliberately against a different published version, which is what makes two SOPs able to
   * run in the same factory at the same time: a batch started last month on the old standard
   * keeps being measured against the old standard, because its baseline was generated from it.
   *
   * There is no process code in this call, and none in the server function behind it (0044).
   */
  process_definition_id?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_master_batch', {
    p_code: input.code,
    p_label: input.label,
    p_start_date: input.start_date,
    p_config: input.config,
    p_roles: input.roles,
    p_supervisor: input.supervisor ?? null,
    p_weather: input.weather ?? null,
    p_start_at: input.start_at ?? null,
    p_process_definition_id: input.process_definition_id ?? null,
  });
  if (error) throw error;
  return data as string;
}

/**
 * A date and a factory-local wall-clock time, as an absolute instant.
 *
 * Asked of the database rather than computed in the browser: turning "5 June, 07:00 in
 * Asia/Kolkata" into an instant needs that zone's offset on that date, and the usual client-side
 * trick — format to a string and parse it back — is fragile and silently wrong across a DST
 * boundary. Returns null when the factory timezone is unset, which is a refusal, not a default.
 */
export async function factoryInstant(date: string, time: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('factory_instant', { p_date: date, p_time: time });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** Set or correct H0 on a draft, and repoint every planned instant. Draft only. */
export async function setBatchStartAt(batchId: string, startAt: string) {
  const { error } = await supabase.rpc('set_batch_start_at', {
    p_batch: batchId,
    p_start_at: startAt,
  });
  if (error) throw error;
}

export async function regeneratePlan(batchId: string) {
  const { error } = await supabase.rpc('generate_activity_plan', { p_batch_id: batchId });
  if (error) throw error;
}

export async function activateBatch(batchId: string) {
  const { error } = await supabase.rpc('activate_batch', { p_batch_id: batchId });
  if (error) throw error;
}

export async function startActivity(activityId: string) {
  const { error } = await supabase.rpc('start_activity', { p_activity: activityId });
  if (error) throw error;
}

/**
 * Capture one named evidence requirement. A4.
 *
 * UPLOAD FIRST, THEN BIND, and in that order for an integrity reason rather than an offline one: the
 * row is written only once the object is in storage, so a record claiming a photograph that is not
 * there cannot exist. If the upload fails, nothing is recorded and the requirement stays outstanding
 * — which is the truth.
 *
 * `markEvidence` used to be here. It called an RPC that incremented a counter with no file, no role
 * check and no ownership check, so any signed-in user could satisfy any requirement on any batch.
 * That function is dropped; there is no counter-only path left to call.
 *
 * The uploader and the capture time are taken from the JWT and the server clock inside
 * `bind_evidence`. Nothing here can claim either.
 */
export type BoundEvidence = {
  mediaId: string;
  requirementKey: string;
  satisfiedCount: number;
  minCount: number;
  uploadedAt: string;
};

export async function captureEvidence(input: {
  batchId: string;
  activityId: string;
  requirementKey: string;
  file: File;
  mediaKind?: 'photo' | 'video';
  /** The id of the item this replaces. A retake supersedes; it never deletes. */
  supersedes?: string | null;
  supersedeReason?: string | null;
}): Promise<BoundEvidence> {
  // `{master_batch_id}/{activity_id}/{uuid}.ext` — ARCHITECTURE_V2 §7. The storage INSERT policy
  // reads the activity out of the second segment to authorise the upload, because at that moment no
  // row exists yet to authorise against.
  const ext = extensionOf(input.file);
  const path = `${input.batchId}/${input.activityId}/${crypto.randomUUID()}${ext}`;

  const up = await supabase.storage.from('evidence').upload(path, input.file, {
    contentType: input.file.type || undefined,
    // Never overwrite. A path collision must fail rather than replace somebody's photograph.
    upsert: false,
  });
  if (up.error) throw up.error;

  try {
    const { data, error } = await supabase.rpc('bind_evidence', {
      p_activity: input.activityId,
      p_requirement_key: input.requirementKey,
      p_storage_path: path,
      p_media_kind: input.mediaKind ?? 'photo',
      p_supersedes: input.supersedes ?? null,
      p_supersede_reason: input.supersedeReason ?? null,
    });
    if (error) throw error;

    const row = (Array.isArray(data) ? data[0] : data) as {
      media_id: string;
      requirement_key: string;
      satisfied_count: number;
      min_count: number;
      uploaded_at: string;
    };
    return {
      mediaId: row.media_id,
      requirementKey: row.requirement_key,
      satisfiedCount: row.satisfied_count,
      minCount: row.min_count,
      uploadedAt: row.uploaded_at,
    };
  } catch (e) {
    // The bind failed, so the object is an orphan: it exists in storage and nothing references it.
    // Removing it keeps the bucket honest. If the removal also fails the object is simply unbound —
    // harmless, because only a bound row counts towards a requirement.
    await supabase.storage.from('evidence').remove([path]).catch(() => undefined);
    throw e;
  }
}

function extensionOf(file: File): string {
  const fromName = /\.[a-z0-9]{2,5}$/i.exec(file.name)?.[0];
  if (fromName) return fromName.toLowerCase();
  if (file.type === 'image/png') return '.png';
  if (file.type === 'image/webp') return '.webp';
  if (file.type === 'video/mp4') return '.mp4';
  return '.jpg';
}

/**
 * A short-lived signed URL for one stored object.
 *
 * The bucket is private, so this is the only way an image reaches a screen — `ARCHITECTURE_V2 §7`:
 * signed URLs only, short TTL. A URL is never stored, because it expires.
 */
export async function signedEvidenceUrl(storagePath: string, ttlSeconds = 300): Promise<string> {
  const { data, error } = await supabase.storage
    .from('evidence')
    .createSignedUrl(storagePath, ttlSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export type EvidenceItem = {
  requirementId: string;
  key: string;
  label: string;
  mediaKinds: string[];
  minCount: number;
  satisfiedCount: number;
  gatesSubmission: boolean;
  captureHint: string | null;
  ordering: number;
  mediaId: string | null;
  storagePath: string | null;
  mediaKind: string | null;
  uploadedAt: string | null;
  uploadedByName: string | null;
  supersededById: string | null;
};

/** Every requirement on an activity, with whatever has been captured against it. */
export async function loadEvidenceState(activityId: string): Promise<EvidenceItem[]> {
  const { data, error } = await supabase
    .from('v_evidence_state')
    .select(
      'requirement_id, key, label, media_kinds, min_count, satisfied_count, gates_submission, capture_hint, ordering, media_id, storage_path, media_kind, uploaded_at, uploaded_by_name, superseded_by_id'
    )
    .eq('batch_activity_id', activityId)
    .order('ordering')
    .order('uploaded_at', { ascending: true, nullsFirst: true });
  if (error) throw error;

  return (data ?? []).map((r) => ({
    requirementId: r.requirement_id as string,
    key: r.key as string,
    label: r.label as string,
    mediaKinds: (r.media_kinds as string[]) ?? [],
    minCount: r.min_count as number,
    satisfiedCount: r.satisfied_count as number,
    gatesSubmission: r.gates_submission as boolean,
    captureHint: (r.capture_hint as string | null) ?? null,
    ordering: r.ordering as number,
    mediaId: (r.media_id as string | null) ?? null,
    storagePath: (r.storage_path as string | null) ?? null,
    mediaKind: (r.media_kind as string | null) ?? null,
    uploadedAt: (r.uploaded_at as string | null) ?? null,
    uploadedByName: (r.uploaded_by_name as string | null) ?? null,
    supersededById: (r.superseded_by_id as string | null) ?? null,
  }));
}

export type BatchFullEvidenceItem = EvidenceItem & { activityId: string };

/** All evidence requirements and uploaded photos for a whole batch. */
export async function loadBatchFullEvidence(masterBatchId: string): Promise<BatchFullEvidenceItem[]> {
  const { data, error } = await supabase
    .from('v_evidence_state')
    .select(
      'batch_activity_id, requirement_id, key, label, media_kinds, min_count, satisfied_count, gates_submission, capture_hint, ordering, media_id, storage_path, media_kind, uploaded_at, uploaded_by_name, superseded_by_id'
    )
    .eq('master_batch_id', masterBatchId)
    .order('ordering')
    .order('uploaded_at', { ascending: true, nullsFirst: true });
  if (error) throw error;

  return (data ?? []).map((r) => ({
    activityId: r.batch_activity_id as string,
    requirementId: r.requirement_id as string,
    key: r.key as string,
    label: r.label as string,
    mediaKinds: (r.media_kinds as string[]) ?? [],
    minCount: r.min_count as number,
    satisfiedCount: r.satisfied_count as number,
    gatesSubmission: r.gates_submission as boolean,
    captureHint: (r.capture_hint as string | null) ?? null,
    ordering: r.ordering as number,
    mediaId: (r.media_id as string | null) ?? null,
    storagePath: (r.storage_path as string | null) ?? null,
    mediaKind: (r.media_kind as string | null) ?? null,
    uploadedAt: (r.uploaded_at as string | null) ?? null,
    uploadedByName: (r.uploaded_by_name as string | null) ?? null,
    supersededById: (r.superseded_by_id as string | null) ?? null,
  }));
}

/**
 * Submit an activity, optionally stating when the work actually happened.
 *
 * `actualStart` / `actualEnd` are INSTANTS, and they are what the slip says — `PROCESS_V2 §2`
 * records a start and an end per load, written at the weighbridge and typed in afterwards. Leave
 * them out and the server uses its own clock, which is what a live recording is.
 *
 * The entry time is never sent from here. `submit_activity` stamps `actual_recorded_at` from the
 * server clock, so the record always distinguishes when the work happened from when it was typed,
 * and a device clock cannot claim either. The server refuses a future timestamp and an end before
 * its start; there is no client-side check standing in for that.
 */
export async function submitActivity(
  activityId: string,
  values: Record<string, string>,
  remarks?: string,
  actuals?: { actualStart?: string | null; actualEnd?: string | null }
) {
  const { data, error } = await supabase.rpc('submit_activity', {
    p_activity: activityId,
    p_values: values,
    p_remarks: remarks ?? null,
    p_actual_start: actuals?.actualStart ?? null,
    p_actual_end: actuals?.actualEnd ?? null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row as { new_state: string; out_of_range: number; outstanding_evidence: string | null };
}

export async function releaseElapsedRests(batchId: string) {
  const { error } = await supabase.rpc('release_elapsed_rests', { p_batch: batchId });
  if (error) throw error;
}

/** The Day-0 questions the generator needs answered, in plain language. */
export const STRUCTURE_QUESTIONS: {
  key: string;
  label: string;
  help: string;
  step: number;
  suffix?: string;
}[] = [
  { key: 'primary_fibre_required_mt', label: 'Fibre needed', help: 'Total for the batch', step: 0.5, suffix: 'MT' },
  { key: 'expected_load_capacity_mt', label: 'Per truck load', help: 'The load count is worked out from this', step: 0.5, suffix: 'MT' },
  { key: 'bunker_line_count', label: 'Bunker lines', help: 'How many parallel lines this batch runs', step: 1 },
  { key: 'yard_pile_count', label: 'Yard piles', help: 'Piles formed when fibre comes out of the bunker', step: 1 },
  { key: 'mixed_pile_count', label: 'Mixed piles', help: 'What the yard piles combine into', step: 1 },
  { key: 'straw_pile_count', label: 'Straw piles', help: 'Placed beside the mixed pile', step: 1 },
  { key: 'straw_bunker_count', label: 'Bunkers for straw', help: 'Straw competes for bunker space', step: 1 },
  { key: 'turner_pile_count', label: 'Piles at the turner', help: 'Mixed pile plus the straw piles', step: 1 },
  { key: 'tunnel_count', label: 'Tunnels', help: 'Tunnel charges at the end', step: 1 },
];

export const DEFAULT_STRUCTURE: Record<string, number> = {
  primary_fibre_required_mt: 21,
  expected_load_capacity_mt: 2,
  bunker_line_count: 3,
  yard_pile_count: 2,
  mixed_pile_count: 1,
  straw_pile_count: 2,
  straw_bunker_count: 1,
  turner_pile_count: 3,
  tunnel_count: 3,
};
