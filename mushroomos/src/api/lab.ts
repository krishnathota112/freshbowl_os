import { supabase } from './client';
import { getBatchContext } from './work';

/**
 * S12's data — the lab technician's queue and the record-a-result flow.
 * `UI_IMPLEMENTATION_PLAN §S12`, `UI_DATA_CONTRACTS §12`, `0022_lab.sql`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * TWO THINGS THIS MODULE REFUSES TO DECIDE
 *
 * 1 · WHICH CHECKPOINT A SAMPLE BELONGS TO. C-33 is open: the dictation map and the S4b column map
 *     both describe the same physical moments, under different codes, with different parameter
 *     panels, and nothing in the sources prefers one. `lab_checkpoint` therefore holds BOTH
 *     (27 + 18 rows) and this module surfaces both for the technician to choose between, each
 *     carrying every conflict it touches. Picking one automatically would resolve C-33 by
 *     accident, in code, silently — the exact thing rule 1 forbids.
 *
 * 2 · WHETHER A READING PASSES. `record_lab_result` derives the verdict from the spec band frozen
 *     at request time, and where TBD-36 leaves a checkpoint unmapped no band is frozen at all and
 *     the verdict is `no_spec`. The UI reports that verdict; it never computes one of its own.
 *
 * There is also no OVERDUE band. `v_lab_queue` has no such member — no source states a lab
 * turnaround time, and the view carries `overdue_unknown_reason` so the absence is visible rather
 * than quietly filled in with a plausible SLA.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

export type LabQueueRow = {
  masterBatchId: string;
  batchCode: string;
  batchLabel: string;
  currentDay: number | null;
  activityId: string;
  activityTitle: string;
  scopeLabel: string;
  parameters: string[];
  state: string;
  actionRequired: boolean;
  band: 'today' | 'retest';
  overdueUnknownReason: string;
  samples: number;
  results: number;
  /** The latest `lab_decision` verdict on this activity, or null while none has been made. */
  lastSubmission: 'approved' | 'rejected' | null;
};

export type CheckpointOption = {
  id: string;
  map: string;
  code: string;
  name: string;
  relDay: number | null;
  scope: string;
  parameters: string[];
  /** Null wherever TBD-36 leaves the mapping unstated — which means no spec band gets frozen. */
  specCheckpointCode: string | null;
  sourceRef: string;
  conflictIds: string[];
  /** True when this map states a day AND it is the activity's day. Never a reason to auto-pick. */
  dayMatches: boolean;
};

export type LabResultRow = {
  resultId: string;
  testId: string;
  parameterCode: string;
  valueNumeric: number | null;
  valueText: string | null;
  unit: string | null;
  verdict: string;
  targetMin: number | null;
  targetMax: number | null;
  specFound: boolean;
  specSourceRef: string | null;
  specConflictId: string | null;
  retestReason: string | null;
  version: number;
  isCurrent: boolean;
  measuredAt: string;
  technicianName: string | null;
  instrumentCode: string | null;
  calibrationStatus: string;
  checkpointCode: string;
  checkpointMap: string;
};

/* ── the queue ──────────────────────────────────────────────────────────────────────────────── */

const QUEUE_COLS =
  'master_batch_id, batch_code, batch_label, current_day, activity_id, activity_title, ' +
  'scope_label, parameters, state, action_required, band, overdue_unknown_reason, ' +
  'samples, results, last_submission';

function mapQueueRow(r: Record<string, unknown>): LabQueueRow {
  return {
    masterBatchId: r.master_batch_id as string,
    batchCode: r.batch_code as string,
    batchLabel: r.batch_label as string,
    currentDay: (r.current_day as number | null) ?? null,
    activityId: r.activity_id as string,
    activityTitle: r.activity_title as string,
    scopeLabel: r.scope_label as string,
    // `lab_parameters` is a text[]; an activity that names none is a real state, not an error.
    parameters: (r.parameters as string[] | null) ?? [],
    state: r.state as string,
    actionRequired: Boolean(r.action_required),
    band: r.band as 'today' | 'retest',
    overdueUnknownReason: r.overdue_unknown_reason as string,
    // PostgREST returns these bigint counts as strings.
    samples: Number(r.samples ?? 0),
    results: Number(r.results ?? 0),
    lastSubmission: (r.last_submission as 'approved' | 'rejected' | null) ?? null,
  };
}

export async function loadLabQueue(): Promise<LabQueueRow[]> {
  const { data, error } = await supabase
    .from('v_lab_queue')
    .select(QUEUE_COLS)
    .order('current_day', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapQueueRow);
}

/* ── the checkpoint choice, both maps, neither preferred ────────────────────────────────────── */

export async function loadCheckpointOptions(activityDay: number | null): Promise<CheckpointOption[]> {
  const [cps, links] = await Promise.all([
    supabase
      .from('lab_checkpoint')
      .select('id, checkpoint_map, code, name, rel_day, scope, parameters, spec_checkpoint_code, source_ref')
      .order('checkpoint_map')
      .order('rel_day', { ascending: true, nullsFirst: false })
      .order('code'),
    supabase.from('lab_checkpoint_conflict').select('checkpoint_id, conflict_id'),
  ]);
  if (cps.error) throw cps.error;
  if (links.error) throw links.error;

  const byCheckpoint = new Map<string, string[]>();
  for (const l of (links.data ?? []) as { checkpoint_id: string; conflict_id: string }[]) {
    const list = byCheckpoint.get(l.checkpoint_id);
    if (list) list.push(l.conflict_id);
    else byCheckpoint.set(l.checkpoint_id, [l.conflict_id]);
  }

  const rows = ((cps.data ?? []) as Record<string, unknown>[]).map<CheckpointOption>((c) => ({
    id: c.id as string,
    map: c.checkpoint_map as string,
    code: c.code as string,
    name: c.name as string,
    relDay: (c.rel_day as number | null) ?? null,
    scope: c.scope as string,
    parameters: (c.parameters as string[] | null) ?? [],
    specCheckpointCode: (c.spec_checkpoint_code as string | null) ?? null,
    sourceRef: c.source_ref as string,
    conflictIds: byCheckpoint.get(c.id as string) ?? [],
    // The S4b map is column-derived and states no day at all, so `rel_day` is null for all 18 of
    // its rows. Null is NOT "does not match" — it is "this map does not say", and the screen has
    // to show that difference rather than sorting those rows to the bottom as failures.
    dayMatches: c.rel_day !== null && activityDay !== null && Number(c.rel_day) === activityDay,
  }));

  // Day-matched rows first as a CONVENIENCE ORDERING ONLY. Every checkpoint from both maps stays
  // in the list, and the screen requires an explicit choice regardless of this order.
  return rows.sort((a, b) => Number(b.dayMatches) - Number(a.dayMatches) || a.map.localeCompare(b.map));
}

/* ── the flow: sample → tests → results ─────────────────────────────────────────────────────── */

export async function openSample(input: {
  activityId: string;
  checkpointId: string;
  label?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('open_lab_sample', {
    p_activity: input.activityId,
    p_checkpoint: input.checkpointId,
    p_label: input.label ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function requestTest(sampleId: string, parameter: string): Promise<string> {
  const { data, error } = await supabase.rpc('request_lab_test', {
    p_sample: sampleId,
    p_parameter: parameter,
  });
  if (error) throw error;
  return data as string;
}

export async function recordResult(input: {
  testId: string;
  numeric?: number | null;
  text?: string | null;
  invalidReason?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('record_lab_result', {
    p_test: input.testId,
    p_numeric: input.numeric ?? null,
    p_text: input.text ?? null,
    p_invalid_reason: input.invalidReason ?? null,
  });
  if (error) throw error;
  return data as string;
}

/**
 * A retest. NEVER an edit.
 *
 * `record_lab_result` refuses a second result on a test — `LAB_MODEL §5`, "v1 is never hidden,
 * because we measured it twice is itself a material fact". The UI has no overwrite path either,
 * so the only way past a wrong reading is this, and it says why.
 */
export async function orderRetest(input: {
  testId: string;
  reason: string;
  numeric?: number | null;
  text?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('order_retest', {
    p_test: input.testId,
    p_reason: input.reason,
    p_numeric: input.numeric ?? null,
    p_text: input.text ?? null,
  });
  if (error) throw error;
  return data as string;
}

/**
 * Every version, not just the head.
 *
 * `v_lab_result_history` keeps the superseding chain intact and the screen shows it — a superseded
 * v1 beside its retest is the record of what actually happened, and hiding it would make the lab
 * look more certain than it was.
 */
export async function loadResults(activityId: string): Promise<LabResultRow[]> {
  const { data, error } = await supabase
    .from('v_lab_result_history')
    .select(
      'result_id, test_id, parameter_code, value_numeric, value_text, unit, verdict, target_min, ' +
        'target_max, spec_found, spec_source_ref, spec_conflict_id, retest_reason, version, ' +
        'is_current, measured_at, technician_name, instrument_code, calibration_status, ' +
        'checkpoint_code, checkpoint_map'
    )
    .eq('batch_activity_id', activityId)
    .order('parameter_code')
    .order('version');
  if (error) throw error;

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    resultId: r.result_id as string,
    testId: r.test_id as string,
    parameterCode: r.parameter_code as string,
    valueNumeric: r.value_numeric === null ? null : Number(r.value_numeric),
    valueText: (r.value_text as string | null) ?? null,
    unit: (r.unit as string | null) ?? null,
    verdict: r.verdict as string,
    targetMin: r.target_min === null ? null : Number(r.target_min),
    targetMax: r.target_max === null ? null : Number(r.target_max),
    specFound: Boolean(r.spec_found),
    specSourceRef: (r.spec_source_ref as string | null) ?? null,
    specConflictId: (r.spec_conflict_id as string | null) ?? null,
    retestReason: (r.retest_reason as string | null) ?? null,
    version: Number(r.version),
    isCurrent: Boolean(r.is_current),
    measuredAt: r.measured_at as string,
    technicianName: (r.technician_name as string | null) ?? null,
    instrumentCode: (r.instrument_code as string | null) ?? null,
    calibrationStatus: r.calibration_status as string,
    checkpointCode: r.checkpoint_code as string,
    checkpointMap: r.checkpoint_map as string,
  }));
}

/**
 * The tests still waiting on a reading, FOR ONE SAMPLE.
 *
 * Scoped deliberately. Filtering only on state would return every outstanding test in the factory,
 * and the screen would offer a technician readings belonging to a different batch — which
 * `record_lab_result` would then accept, because the test id is all it checks.
 */
export type PendingTest = {
  id: string;
  parameterCode: string;
  unit: string | null;
  min: number | null;
  max: number | null;
  specFound: boolean;
};

export async function loadPendingTests(sampleId: string): Promise<PendingTest[]> {
  const { data, error } = await supabase
    .from('lab_test')
    .select('id, parameter_code, target_min, target_max, target_unit, spec_found, state')
    .eq('sample_id', sampleId)
    .in('state', ['requested', 'in_progress'])
    .order('parameter_code');
  if (error) throw error;

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((t) => ({
    id: t.id as string,
    parameterCode: t.parameter_code as string,
    unit: (t.target_unit as string | null) ?? null,
    min: t.target_min === null ? null : Number(t.target_min),
    max: t.target_max === null ? null : Number(t.target_max),
    specFound: Boolean(t.spec_found),
  }));
}

/** The open sample on this activity, if the technician already started one. */
export async function findOpenSample(
  activityId: string
): Promise<{ id: string; checkpointId: string; collectedAt: string } | null> {
  const { data, error } = await supabase
    .from('lab_sample')
    .select('id, checkpoint_id, collected_at')
    .eq('batch_activity_id', activityId)
    .order('collected_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    checkpointId: data.checkpoint_id as string,
    collectedAt: data.collected_at as string,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * THE LAB WORKSTATION — UI-001.
 *
 * Everything below reads what the server already decided and puts it in one place for the screen.
 * The screen then decides nothing: not whether a task may start, not whether a reading passes, not
 * whether a gate opens. Those are `start_activity`, `record_lab_result` and `decide_lab_submission`.
 *
 * CONTRACT NOTE (ARCH-010). Three reads here are base tables — `batch_activity.process_activity_id`,
 * `lab_checkpoint_activity` and `lab_decision` — because no view yet says, per activity, which
 * checkpoint it samples at, what that checkpoint holds shut, and why the latest decision was made.
 * RLS permits all three for a lab technician (probed 12 Sep). A view carrying them is `CT-003`.
 * ───────────────────────────────────────────────────────────────────────────── */

const WORK_COLS =
  'activity_id, code, planned_start_at, actual_start, actual_end, blocked_reason, ' +
  'required_count, satisfied_total, outstanding_labels';

export type LabWorkItem = LabQueueRow & {
  code: string | null;
  plannedStartAt: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  blockedReason: string | null;
  requiredEvidence: number | null;
  satisfiedEvidence: number | null;
  outstandingLabels: string | null;
  /**
   * True when this finished checkpoint holds a production task shut until it is approved. Known for
   * finished work only (null otherwise) — it is what lets the queue say "Waiting approval" rather
   * than a vaguer "Submitted".
   */
  holdsGate: boolean | null;
};

function mergeWork(q: LabQueueRow, w: Record<string, unknown> | null): LabWorkItem {
  return {
    ...q,
    code: (w?.code as string | null) ?? null,
    plannedStartAt: (w?.planned_start_at as string | null) ?? null,
    actualStart: (w?.actual_start as string | null) ?? null,
    actualEnd: (w?.actual_end as string | null) ?? null,
    blockedReason: (w?.blocked_reason as string | null) ?? null,
    requiredEvidence: w?.required_count == null ? null : Number(w.required_count),
    satisfiedEvidence: w?.satisfied_total == null ? null : Number(w.satisfied_total),
    outstandingLabels: (w?.outstanding_labels as string | null) ?? null,
    holdsGate: null,
  };
}

type GateRow = {
  process_code: string;
  checkpoint_code: string;
  checkpoint_name: string;
  kind: string;
  blocks_activity_code: string | null;
  blocks_activity: string | null;
  rule_exists: boolean;
  is_enabled: boolean | null;
};

const holds = (g: GateRow) => g.kind === 'GATE' && g.rule_exists && g.is_enabled === true;

/** Of these finished lab activities, which ones hold a production task shut. */
async function gateHolders(activityIds: string[]): Promise<Set<string>> {
  if (activityIds.length === 0) return new Set();
  const ba = await supabase.from('batch_activity').select('id, process_activity_id').in('id', activityIds);
  if (ba.error) throw ba.error;
  const acts = (ba.data ?? []) as { id: string; process_activity_id: string | null }[];
  const paIds = [...new Set(acts.map((a) => a.process_activity_id).filter((x): x is string => !!x))];
  if (paIds.length === 0) return new Set();

  const [lca, gates] = await Promise.all([
    supabase
      .from('lab_checkpoint_activity')
      .select('process_activity_id, checkpoint_code, gates_activity_code')
      .in('process_activity_id', paIds),
    supabase.from('v_lab_gate').select('*'),
  ]);
  if (lca.error) throw lca.error;
  if (gates.error) throw gates.error;

  const shut = new Set(
    ((gates.data ?? []) as GateRow[]).filter(holds).map((g) => `${g.checkpoint_code}|${g.blocks_activity_code}`)
  );
  const holdingPa = new Set(
    ((lca.data ?? []) as { process_activity_id: string; checkpoint_code: string; gates_activity_code: string | null }[])
      .filter((l) => l.gates_activity_code && shut.has(`${l.checkpoint_code}|${l.gates_activity_code}`))
      .map((l) => l.process_activity_id)
  );
  return new Set(acts.filter((a) => a.process_activity_id && holdingPa.has(a.process_activity_id)).map((a) => a.id));
}

/** The lab technician's work: `v_lab_queue` for the lab facts, `v_my_work` for the plan and evidence. */
export async function loadLabWork(): Promise<LabWorkItem[]> {
  const [queue, work] = await Promise.all([
    loadLabQueue(),
    supabase.from('v_my_work').select(WORK_COLS).eq('responsible_role', 'lab_tech'),
  ]);
  if (work.error) throw work.error;
  const byId = new Map(
    ((work.data ?? []) as unknown as Record<string, unknown>[]).map((w) => [w.activity_id as string, w])
  );
  const items = queue.map((q) => mergeWork(q, byId.get(q.activityId) ?? null));

  const finished = items.filter((i) => i.state === 'COMPLETED' && i.lastSubmission === null);
  const holding = await gateHolders(finished.map((i) => i.activityId));
  for (const i of finished) i.holdsGate = holding.has(i.activityId);
  return items;
}

export type LabDecision = {
  verdict: 'approved' | 'rejected';
  reason: string | null;
  decidedRole: string | null;
  decidedAt: string;
};

export type LabGateEffect = {
  checkpointName: string;
  /** `GATE` holds production shut; `DECISION` informs a decision and locks nothing. */
  kind: string;
  blocksActivity: string | null;
  holdsShut: boolean;
};

export type BoundCheckpoint = { id: string; map: string; code: string; name: string };

export type LabActivityContext = {
  item: LabWorkItem;
  processCode: string | null;
  /** The checkpoints this activity is bound to. The server refuses a sample filed anywhere else. */
  checkpoints: BoundCheckpoint[];
  gate: LabGateEffect | null;
  decision: LabDecision | null;
  /** Who may decide right now — C-32 is open, so this is read, never assumed. */
  approverRoles: string[];
};

export async function loadLabActivity(activityId: string): Promise<LabActivityContext> {
  const [q, w, ba, dec] = await Promise.all([
    supabase.from('v_lab_queue').select(QUEUE_COLS).eq('activity_id', activityId).maybeSingle(),
    supabase.from('v_my_work').select(WORK_COLS).eq('activity_id', activityId).maybeSingle(),
    supabase.from('batch_activity').select('process_activity_id').eq('id', activityId).maybeSingle(),
    supabase
      .from('lab_decision')
      .select('verdict, reason, decided_role, decided_at')
      .eq('batch_activity_id', activityId)
      .order('seq', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (q.error) throw q.error;
  if (w.error) throw w.error;
  if (ba.error) throw ba.error;
  if (dec.error) throw dec.error;
  if (!q.data) {
    throw new Error('This lab task is not on an active batch any more, or it is not yours to open.');
  }

  const item = mergeWork(
    mapQueueRow(q.data as unknown as Record<string, unknown>),
    (w.data as unknown as Record<string, unknown> | null) ?? null
  );
  const [batch, approverRoles] = await Promise.all([
    getBatchContext(item.masterBatchId).catch(() => null),
    labApproverRoles().catch(() => [] as string[]),
  ]);
  const processCode = batch?.process_code ?? null;

  let checkpoints: BoundCheckpoint[] = [];
  let gate: LabGateEffect | null = null;
  const paId = (ba.data as { process_activity_id: string | null } | null)?.process_activity_id ?? null;
  if (paId) {
    const lca = await supabase
      .from('lab_checkpoint_activity')
      .select('checkpoint_map, checkpoint_code, gates_activity_code')
      .eq('process_activity_id', paId);
    if (lca.error) throw lca.error;
    const links = (lca.data ?? []) as { checkpoint_map: string; checkpoint_code: string; gates_activity_code: string | null }[];
    const codes = [...new Set(links.map((l) => l.checkpoint_code))];
    if (codes.length > 0) {
      const [cps, gates] = await Promise.all([
        supabase.from('lab_checkpoint').select('id, checkpoint_map, code, name').in('code', codes),
        supabase.from('v_lab_gate').select('*').in('checkpoint_code', codes),
      ]);
      if (cps.error) throw cps.error;
      if (gates.error) throw gates.error;
      checkpoints = ((cps.data ?? []) as { id: string; checkpoint_map: string; code: string; name: string }[])
        .filter((c) => links.some((l) => l.checkpoint_map === c.checkpoint_map && l.checkpoint_code === c.code))
        .map((c) => ({ id: c.id, map: c.checkpoint_map, code: c.code, name: c.name }));
      const g = ((gates.data ?? []) as GateRow[]).find(
        (row) =>
          (processCode === null || row.process_code === processCode) &&
          links.some(
            (l) =>
              l.checkpoint_code === row.checkpoint_code &&
              (l.gates_activity_code === null || l.gates_activity_code === row.blocks_activity_code)
          )
      );
      if (g) {
        gate = {
          checkpointName: g.checkpoint_name,
          kind: g.kind,
          blocksActivity: g.blocks_activity,
          holdsShut: holds(g),
        };
      }
    }
  }
  item.holdsGate = gate?.holdsShut ?? false;

  const d = dec.data as { verdict: string; reason: string | null; decided_role: string | null; decided_at: string } | null;
  return {
    item,
    processCode,
    checkpoints,
    gate,
    decision: d
      ? { verdict: d.verdict as 'approved' | 'rejected', reason: d.reason, decidedRole: d.decided_role, decidedAt: d.decided_at }
      : null,
    approverRoles,
  };
}

/** Every test on one sample, whatever its state — so a half-requested sample can be completed. */
export type SampleTest = PendingTest & { state: string };

export async function loadSampleTests(sampleId: string): Promise<SampleTest[]> {
  const { data, error } = await supabase
    .from('lab_test')
    .select('id, parameter_code, target_min, target_max, target_unit, spec_found, state')
    .eq('sample_id', sampleId)
    .order('parameter_code');
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((t) => ({
    id: t.id as string,
    parameterCode: t.parameter_code as string,
    unit: (t.target_unit as string | null) ?? null,
    min: t.target_min === null ? null : Number(t.target_min),
    max: t.target_max === null ? null : Number(t.target_max),
    specFound: Boolean(t.spec_found),
    state: t.state as string,
  }));
}

/**
 * "Take the sample": start the work, open the sample, request one test per parameter.
 *
 * Three server calls, and not atomic — so it is written to be RE-RUNNABLE. A retry after a lost
 * response or a dropped connection finds the sample that already exists (`open_lab_sample` would
 * otherwise write a second one; F39) and requests only the tests still missing. `start_activity` is
 * already idempotent: a second call on running work changes nothing and records nothing.
 */
export async function beginSample(input: {
  activityId: string;
  checkpointId: string;
  parameters: string[];
  state: string;
}): Promise<string> {
  if (input.state === 'READY' || input.state === 'RETURNED') {
    const { error } = await supabase.rpc('start_activity', { p_activity: input.activityId });
    if (error) throw error;
  }
  const existing = await findOpenSample(input.activityId);
  const sampleId = existing?.id ?? (await openSample({ activityId: input.activityId, checkpointId: input.checkpointId }));
  const have = new Set((await loadSampleTests(sampleId)).map((t) => t.parameterCode));
  for (const p of input.parameters) if (!have.has(p)) await requestTest(sampleId, p);
  return sampleId;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * APPROVAL — the step that opens a gate.
 *
 * SUBMISSION IS NOT APPROVAL. A lab result recorded, and its activity completed, leaves every
 * `LAB_APPROVED` gate shut. PROCESS-2026C binds eight production activities to four checkpoints
 * (`LAB-BNK-PRE`, `LAB-CM-USE`, `LAB-BNK-LOAD`, `LAB-TUN-LOAD`), and the only thing that opens one
 * is a `lab_decision` with verdict `approved`.
 *
 * Until this was written, nothing in the application called it — so a gate opened in the database's
 * tests and could never be opened by a person using the product.
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Who may decide, right now.
 *
 * C-32 IS OPEN. `lab_approval_reading` holds two readings — `GM_APPROVES_EVERY_LAB_SUBMISSION` (gm)
 * and `SUPERVISOR_ACCEPTS_LAB_RESULT` (supervisor) — and neither is enabled. While that is true the
 * server accepts a decision from EITHER named role and refuses every other. Enabling one reading
 * narrows it to that role with no code change, so the screen must ask rather than hardcode "GM".
 *
 * A lab technician can never decide a lab submission, including their own. That is the separation
 * the whole gate exists to create, and it is enforced in `decide_lab_submission`, not here.
 */
export async function labApproverRoles(): Promise<string[]> {
  const { data, error } = await supabase
    .from('lab_approval_reading')
    .select('approver_role, is_enabled');
  if (error) throw error;
  const rows = (data ?? []) as { approver_role: string; is_enabled: boolean }[];
  const enabled = rows.filter((r) => r.is_enabled);
  // No reading enabled ⇒ the question is open and both stand.
  return (enabled.length ? enabled : rows).map((r) => r.approver_role);
}

/**
 * Approve or reject a lab submission. The reason is required in both directions — a decision with
 * no stated reason is the thing the audit trail exists to prevent.
 */
export async function decideLabSubmission(
  activityId: string,
  verdict: 'approved' | 'rejected',
  reason: string
): Promise<string> {
  const { data, error } = await supabase.rpc('decide_lab_submission', {
    p_activity: activityId,
    p_verdict: verdict,
    p_reason: reason,
  });
  if (error) throw error;
  return data as string;
}

/** What each lab checkpoint holds shut, straight from `v_lab_gate`. */
export interface LabGateRow {
  process_code: string;
  checkpoint_code: string;
  checkpoint_name: string;
  kind: string;
  blocks_activity_code: string | null;
  blocks_activity: string | null;
  rule_exists: boolean;
  is_enabled: boolean;
}

/**
 * The consequence of a decision, so the screen can say what will unlock rather than leaving the
 * approver to guess. `kind` distinguishes a GATE from a DECISION — `LAB-MOIST-DEC` is a DECISION
 * and blocks nothing, because the 67–68 % band is UNRESOLVED and no gate may be built on it.
 */
export async function loadLabGates(): Promise<LabGateRow[]> {
  const { data, error } = await supabase
    .from('v_lab_gate')
    .select('*')
    .order('checkpoint_code', { ascending: true });
  if (error) throw error;
  return (data ?? []) as LabGateRow[];
}

/** One row of `v_lab_approval_queue` — a lab submission and the decision standing on it. */
export interface LabApprovalRow {
  master_batch_id: string;
  batch_code: string;
  batch_status: string;
  activity_id: string;
  activity_code: string;
  activity_title: string;
  scope_label: string | null;
  activity_state: string;
  actual_end: string | null;
  checkpoint_code: string;
  checkpoint_name: string | null;
  /** `GATE` holds production shut. `DECISION` does not — LAB-MOIST-DEC is a DECISION. */
  checkpoint_kind: string | null;
  gates_activity_code: string | null;
  gates_activity_title: string | null;
  gates_activity_state: string | null;
  is_gate: boolean;
  gate_is_enabled: boolean;
  latest_verdict: string | null;
  latest_reason: string | null;
  decided_at: string | null;
  decided_role: string | null;
  decided_by_name: string | null;
  decision_count: number;
  sample_count: number;
  result_count: number;
  awaiting_decision: boolean;
  is_approved: boolean;
  /** While C-32 is open this is both roles. Ask it; never hardcode "GM". */
  approver_roles: string[] | null;
  approver_question_settled: boolean | null;
}

export async function loadLabApprovals(): Promise<LabApprovalRow[]> {
  const { data, error } = await supabase
    .from('v_lab_approval_queue')
    .select('*')
    .eq('batch_status', 'active')
    .order('batch_code', { ascending: true })
    .order('activity_code', { ascending: true });
  if (error) throw error;
  return (data ?? []) as LabApprovalRow[];
}

/** The two readings of C-32, with the consequence each carries. Shown, not resolved. */
export interface ApprovalQuestionRow {
  reading_code: string;
  approver_role: string;
  statement: string;
  source_ref: string;
  consequence: string;
  is_enabled: boolean;
  question: string;
  conflict_status: string;
  still_open: boolean;
}

export async function loadApprovalQuestion(): Promise<ApprovalQuestionRow[]> {
  const { data, error } = await supabase.from('v_lab_approval_question').select('*');
  if (error) throw error;
  return (data ?? []) as ApprovalQuestionRow[];
}
