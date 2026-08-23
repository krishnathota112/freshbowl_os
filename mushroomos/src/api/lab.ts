import { supabase } from './client';

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

export async function loadLabQueue(): Promise<LabQueueRow[]> {
  const { data, error } = await supabase
    .from('v_lab_queue')
    .select(
      'master_batch_id, batch_code, batch_label, current_day, activity_id, activity_title, ' +
        'scope_label, parameters, state, action_required, band, overdue_unknown_reason, ' +
        'samples, results'
    )
    .order('current_day', { ascending: true, nullsFirst: false });
  if (error) throw error;

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
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
    samples: Number(r.samples ?? 0),
    results: Number(r.results ?? 0),
  }));
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
export async function findOpenSample(activityId: string): Promise<{ id: string; checkpointId: string } | null> {
  const { data, error } = await supabase
    .from('lab_sample')
    .select('id, checkpoint_id')
    .eq('batch_activity_id', activityId)
    .order('collected_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id as string, checkpointId: data.checkpoint_id as string };
}
