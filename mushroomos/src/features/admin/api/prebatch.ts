/**
 * Pre-H0 / initial material data — the batch's starting information, recorded by Admin.
 *
 * OPERATING FLOW (user decision, 14 Sep 2026): these are the material measurements already known when
 * a batch is created or onboarded. They are NOT a laboratory approval. Nobody accepts them; activation
 * needs them recorded, and a value outside spec is recorded and flagged, never blocking (0085). Post-H0
 * checkpoints are the Lab's work in the Lab app.
 *
 * Stored through the existing pre-batch checkpoint (lab_sample / lab_test / lab_result), so a value is
 * kept with who entered it and the server's time. Which checkpoint is the pre-batch one comes from
 * `lab_checkpoint.is_prebatch` — never named in code.
 */
import { supabase } from '../../../shared/api/client';

/** The initial material values the operating flow names. Each is optional; a blank is not recorded. */
export const PREBATCH_PARAMETERS = [
  { code: 'moisture_pct', label: 'Moisture', unit: '%' },
  { code: 'ph', label: 'pH', unit: '' },
  { code: 'dry_weight', label: 'Dry weight', unit: '' },
] as const;

/**
 * Pre-H0 material WEIGHTS (Batch Creation only, 17 Sep 2026): dry and fresh weight in kg per material.
 * Each is a numeric reading on the same pre-H0 sample, under a parameter registered by 0129
 * (`wt_<material>_<dry|fresh>_kg`), so it carries its label and unit like every other reading.
 */
export const PREBATCH_WEIGHT_MATERIALS = [
  { key: 'urea', label: 'Urea' },
  { key: 'ash', label: 'Ash' },
  { key: 'nitrogen', label: 'Nitrogen' },
  { key: 'gypsum', label: 'Gypsum' },
  { key: 'bagasse', label: 'Bagasse' },
  { key: 'paddy', label: 'Paddy' },
  { key: 'chicken_manure', label: 'Chicken Manure' },
  { key: 'wheat', label: 'Wheat' },
  { key: 'mustard', label: 'Mustard' },
  { key: 'ammonium_sulphate', label: 'Ammonium Sulphate' },
] as const;

export const weightCode = (material: string, kind: 'dry' | 'fresh') => `wt_${material}_${kind}_kg`;

/** The weights typed in, as readings. Blank fields are left out; a weight must be a number ≥ 0. */
export function weightReadingsFromInputs(values: Record<string, string>): PrebatchReading[] {
  const readings: PrebatchReading[] = [];
  for (const m of PREBATCH_WEIGHT_MATERIALS) {
    for (const kind of ['dry', 'fresh'] as const) {
      const code = weightCode(m.key, kind);
      const raw = (values[code] ?? '').replace(',', '.').trim();
      if (raw === '') continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error(`${m.label} ${kind} weight must be a number of kilograms (0 or more).`);
      }
      readings.push({ parameter: code, value: n });
    }
  }
  return readings;
}

export type PrebatchCheckpoint = { id: string; code: string; name: string };

/** The checkpoints the process marks as pre-batch. Read, never named in code — rule 4. */
export async function listPrebatchCheckpoints(): Promise<PrebatchCheckpoint[]> {
  const { data, error } = await supabase
    .from('lab_checkpoint')
    .select('id, code, name')
    .eq('is_prebatch', true)
    .order('code');
  if (error) throw error;
  return (data ?? []) as PrebatchCheckpoint[];
}

export type PrebatchReading = { parameter: string; value: number };

/**
 * The values an Admin typed, as readings. Blank fields are left out — a value that was not entered is
 * never recorded as a default. Throws if a field holds something that is not a number, or if nothing
 * was entered at all.
 */
export function readingsFromInputs(values: Record<string, string>): PrebatchReading[] {
  const readings = parseParameterInputs(values);
  if (readings.length === 0) throw new Error('Enter at least one initial material value.');
  return readings;
}

function parseParameterInputs(values: Record<string, string>): PrebatchReading[] {
  const readings: PrebatchReading[] = [];
  for (const p of PREBATCH_PARAMETERS) {
    const raw = (values[p.code] ?? '').replace(',', '.').trim();
    if (raw === '') continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`${p.label} must be a number.`);
    readings.push({ parameter: p.code, value: n });
  }
  return readings;
}

/**
 * Record the initial material data: one sample on the pre-batch checkpoint, one reading per value.
 *
 * Not a transaction — PostgREST has no way to make it one — so a failure part-way leaves what was
 * recorded, and `v_prebatch_material_check` says how far it got. The collection time and the person
 * are the server's (G05).
 */
export async function recordInitialMaterial(input: {
  batchId: string;
  checkpointId: string;
  label: string;
  readings: PrebatchReading[];
}): Promise<{ sampleId: string; recorded: number }> {
  const sample = await supabase.rpc('open_prebatch_sample', {
    p_batch: input.batchId,
    p_checkpoint: input.checkpointId,
    p_label: input.label,
  });
  if (sample.error) throw sample.error;
  const sampleId = (Array.isArray(sample.data) ? sample.data[0] : sample.data) as string;

  let recorded = 0;
  for (const r of input.readings) {
    const test = await supabase.rpc('request_lab_test', {
      p_sample: sampleId,
      p_parameter: r.parameter,
      // 'user', not 'system': a person typed this. The column allows only those two.
      p_via: 'user',
    });
    if (test.error) throw test.error;
    const testId = (Array.isArray(test.data) ? test.data[0] : test.data) as string;

    const result = await supabase.rpc('record_lab_result', { p_test: testId, p_numeric: r.value });
    if (result.error) throw result.error;
    recorded += 1;
  }
  return { sampleId, recorded };
}

/** Record initial material data on the process's pre-batch checkpoint. */
export async function recordInitialMaterialForBatch(
  batchId: string,
  label: string,
  values: Record<string, string>,
  /** Batch Creation's Weights section; the same save, the same sample. Omitted elsewhere. */
  weights: Record<string, string> = {},
) {
  const extra = weightReadingsFromInputs(weights);
  const readings = extra.length === 0 ? readingsFromInputs(values) : [...parseParameterInputs(values), ...extra];
  const cps = await listPrebatchCheckpoints();
  if (cps.length === 0) throw new Error('No pre-H0 material checkpoint is defined.');
  return recordInitialMaterial({ batchId, checkpointId: cps[0].id, label, readings });
}
