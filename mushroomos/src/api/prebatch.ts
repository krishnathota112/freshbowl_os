/**
 * The incoming-material check — the one step that stands between a planned batch and a running one.
 *
 * WHY THIS FILE EXISTS
 *   `activate_batch` refuses while no incoming assay is on record: "The material must be sampled and
 *   its results accepted before the batch clock starts (client decision 2)." Every RPC needed to
 *   satisfy that has existed since 0032. None of them had a caller anywhere in `src/`.
 *
 *   So an Admin could create a batch, generate its plan and validate it — and then hit a wall with
 *   no screen that clears it. Measured on 2026-09-08: `open_prebatch_sample` and `accept_lab_result`
 *   had zero references in the application. The acceptance script did this over HTTP; a person
 *   could not.
 *
 * WHAT IT DOES NOT DO
 *   It invents no process rule. Which checkpoint is the pre-batch one comes from
 *   `lab_checkpoint.is_prebatch`; the parameters are the two the laboratory model states; and the
 *   collection instant is chosen so it is genuinely before H0 rather than merely now.
 */
import { supabase } from './client';

/**
 * The two parameters the incoming assay records.
 *
 * TWO, NOT THREE. The dictation asks for moisture, pH **and** dry weight, but no source states a
 * method for dry weight (TBD-45). Requesting a test nobody can report would leave the check
 * permanently unaccepted and the batch permanently unactivatable — a worse failure than the gap
 * it would paper over.
 */
export const PREBATCH_PARAMETERS = [
  { code: 'moisture_pct', label: 'Moisture', unit: '%' },
  { code: 'ph', label: 'pH', unit: '' },
] as const;

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

/**
 * When the sample was collected.
 *
 * `least(now, H0 − 1h)`, which is right in both directions: a batch planned for the future keeps
 * the real current time, and a backdated H0 places the assay an hour ahead of the clock it is
 * supposed to precede. It can never be in the future, which is the one thing
 * `open_prebatch_sample` refuses outright.
 */
export function collectionInstant(h0: string | null): string {
  const now = Date.now();
  if (h0 === null) return new Date(now).toISOString();
  const anHourBeforeH0 = Date.parse(h0) - 3_600_000;
  if (Number.isNaN(anHourBeforeH0)) return new Date(now).toISOString();
  return new Date(Math.min(now, anHourBeforeH0)).toISOString();
}

export type PrebatchReading = { parameter: string; value: number };

/**
 * Take the check: open the sample, request each test, record each reading, accept each as final.
 *
 * ONE CALL FROM THE SCREEN, four RPCs underneath, in the order the database expects. It is not a
 * transaction — PostgREST has no way to make it one — so a failure part-way leaves a real,
 * incomplete record rather than pretending nothing happened. That is the honest outcome: the
 * sample WAS collected, and `v_prebatch_material_check` will say how far it got.
 *
 * ACCEPTING IS A LABORATORY ACT. `accept_lab_result` is restricted to the lab technician and the
 * supervisor — an admin is refused, and correctly so. The refusal names the roles that may.
 */
export async function takePrebatchMaterialCheck(input: {
  batchId: string;
  checkpointId: string;
  h0: string | null;
  label: string;
  readings: PrebatchReading[];
}): Promise<{ sampleId: string; accepted: number }> {
  const sample = await supabase.rpc('open_prebatch_sample', {
    p_batch: input.batchId,
    p_checkpoint: input.checkpointId,
    p_label: input.label,
    p_at: collectionInstant(input.h0),
  });
  if (sample.error) throw sample.error;
  const sampleId = (Array.isArray(sample.data) ? sample.data[0] : sample.data) as string;

  let accepted = 0;
  for (const r of input.readings) {
    const test = await supabase.rpc('request_lab_test', {
      p_sample: sampleId,
      p_parameter: r.parameter,
      // 'user', not 'system': a person typed this. The column allows only those two.
      p_via: 'user',
    });
    if (test.error) throw test.error;
    const testId = (Array.isArray(test.data) ? test.data[0] : test.data) as string;

    const result = await supabase.rpc('record_lab_result', {
      p_test: testId,
      p_numeric: r.value,
    });
    if (result.error) throw result.error;
    const resultId = (Array.isArray(result.data) ? result.data[0] : result.data) as string;

    const ok = await supabase.rpc('accept_lab_result', {
      p_result: resultId,
      p_reason: 'Incoming material assay, accepted as final before H0.',
    });
    if (ok.error) throw ok.error;
    accepted += 1;
  }

  return { sampleId, accepted };
}

/**
 * Finish an incoming check somebody else started.
 *
 * WHY THIS EXISTS
 *   `takePrebatchMaterialCheck` does four things in a row, and the last one — accepting — is
 *   restricted to a lab technician or supervisor. An ADMIN running it therefore gets three
 *   quarters of the way and stops: the sample is collected and the reading is recorded, and the
 *   batch is left with "0 of 1 result accepted as final", which blocks activation exactly as
 *   firmly as no sample at all.
 *
 *   The panel already refused to offer the form again in that state, so a second sample could not
 *   be recorded on top of the first. That was right, and it was also a dead end: the only screen
 *   that mentioned the problem gave the person who could fix it nothing to press. Reproduced on
 *   the device during the handset run — an admin created MB-20260910, was correctly refused at the
 *   accept, and no role could then clear it from any screen in the application.
 *
 *   So this accepts what is already recorded. It records nothing new: no sample, no test, no
 *   reading. If the readings are wrong, the answer is a retest through the laboratory, not a
 *   second incoming assay.
 */
export async function listOutstandingPrebatchResults(batchId: string): Promise<string[]> {
  // Through `v_lab_result_current`, not the base tables — rule 5, and it already resolves which
  // result of a supersession chain is the live one.
  const { data, error } = await supabase
    .from('v_lab_result_current')
    .select('result_id, accepted, is_current, batch_activity_id')
    .eq('master_batch_id', batchId)
    .eq('accepted', false)
    .eq('is_current', true);
  if (error) throw error;
  // A pre-batch sample belongs to the batch and to no activity within it.
  return (data ?? [])
    .filter((r) => (r as { batch_activity_id: string | null }).batch_activity_id === null)
    .map((r) => (r as { result_id: string }).result_id);
}

export async function acceptOutstandingPrebatchResults(batchId: string): Promise<number> {
  const ids = await listOutstandingPrebatchResults(batchId);
  let accepted = 0;
  for (const id of ids) {
    const ok = await supabase.rpc('accept_lab_result', {
      p_result: id,
      p_reason: 'Incoming material assay, accepted as final before H0.',
    });
    if (ok.error) throw ok.error;
    accepted += 1;
  }
  return accepted;
}
