import { supabase } from '../../../shared/api/client';

/**
 * THE PROCESS CATALOGUE.
 *
 * 470 h is not a property of this application. It is what PROCESS-2026C's stages, durations
 * and dependencies add up to. Another standard adds up to something else, and both have to be
 * able to exist here at once:
 *
 *     SOP / PROCESS VERSION
 *           ↓   its own stages · durations · dependencies · parallel streams · gates
 *     CALCULATED STANDARD DURATION
 *           ↓   + this batch's H0
 *     BATCH BASELINE — exact planned timestamps
 *
 * Three different things. This module answers the first two; `api/batch.ts` answers the third.
 *
 * NOTHING HERE COMPUTES A STANDARD. `v_process_catalogue` derives it in the database from the
 * definition's own activities (migration 0045), so a screen showing "470 h" is showing what
 * PROCESS-2026C computes — not a constant, and not `(total_days + 1) × 24`, which is a day
 * grid and reads 480 for the same definition.
 */

export type ProcessVersion = {
  id: string;
  code: string;
  version: number;
  status: 'draft' | 'published' | 'archived';
  name: string;
  anchorDayLabel: string;
  sourceRef: string;
  publishedAt: string | null;

  /**
   * THE STANDARD, calculated from this definition's own activities. Null when none of them
   * carry a standard hour, which is a definition nothing can be planned against.
   */
  standardHr: number | null;
  /**
   * The last hour anything happens at all. Differs from `standardHr` when the standard is
   * measured on one stream and others run past it — PROCESS-2026C is H470 on stream 1 and
   * H474 when the third stream is out. Both are true and they mean different things.
   */
  fullSpanHr: number | null;

  /** What the factory wrote down beside it, if anybody did. */
  statedEnvelopeHr: number | null;
  envelopeConfidence: string | null;
  /** True when the stated number and the activities beneath it describe different processes. */
  envelopeDisagrees: boolean;
  statedMinusCalculatedHr: number | null;

  activityCount: number;
  holdCount: number;
  streamCount: number;
  unplacedActivityCount: number;

  /** The standard a new batch is planned against when the admin does not choose another. */
  isCurrent: boolean;
  /** Published, non-empty, and every activity placed on the hour axis. Decided by the server. */
  isSelectable: boolean;
};

type Row = {
  process_definition_id: string;
  code: string;
  version: number;
  status: string;
  name: string;
  anchor_day_label: string;
  source_ref: string;
  published_at: string | null;
  standard_hr: string | number | null;
  full_span_hr: string | number | null;
  stated_envelope_hr: number | null;
  envelope_confidence: string | null;
  envelope_disagrees: boolean;
  stated_minus_calculated_hr: string | number | null;
  activity_count: number;
  hold_count: number;
  stream_count: number;
  unplaced_activity_count: number;
  is_current: boolean | null;
  is_selectable: boolean;
};

/**
 * `numeric` arrives from PostgREST as a string, because a JavaScript number cannot hold every
 * value the type can. Half hours can be — the axis is constrained to them (0042) — so this
 * converts rather than carrying strings into arithmetic, where `'470' + 4` would be `'4704'`.
 */
function hours(v: string | number | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toVersion(r: Row): ProcessVersion {
  return {
    id: r.process_definition_id,
    code: r.code,
    version: r.version,
    status: r.status as ProcessVersion['status'],
    name: r.name,
    anchorDayLabel: r.anchor_day_label,
    sourceRef: r.source_ref,
    publishedAt: r.published_at,
    standardHr: hours(r.standard_hr),
    fullSpanHr: hours(r.full_span_hr),
    statedEnvelopeHr: r.stated_envelope_hr,
    envelopeConfidence: r.envelope_confidence,
    envelopeDisagrees: r.envelope_disagrees,
    statedMinusCalculatedHr: hours(r.stated_minus_calculated_hr),
    activityCount: r.activity_count,
    holdCount: r.hold_count,
    streamCount: r.stream_count,
    unplacedActivityCount: r.unplaced_activity_count,
    isCurrent: r.is_current === true,
    isSelectable: r.is_selectable,
  };
}

const COLUMNS =
  'process_definition_id, code, version, status, name, anchor_day_label, source_ref, ' +
  'published_at, standard_hr, full_span_hr, stated_envelope_hr, envelope_confidence, ' +
  'envelope_disagrees, stated_minus_calculated_hr, activity_count, hold_count, stream_count, ' +
  'unplaced_activity_count, is_current, is_selectable';

/** Every process version, newest publication first. Drafts and archived versions included. */
export async function listProcessVersions(): Promise<ProcessVersion[]> {
  const { data, error } = await supabase
    .from('v_process_catalogue')
    .select(COLUMNS)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('code');
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map(toVersion);
}

/**
 * The versions a new batch may be planned against. `is_selectable` is the server's judgement —
 * published, non-empty, every activity on the axis — so the picker offers no standard that
 * would generate a baseline with holes in it, and the screen decides nothing.
 */
export async function listSelectableProcessVersions(): Promise<ProcessVersion[]> {
  return (await listProcessVersions()).filter((p) => p.isSelectable);
}

/** The current standard, or null while nobody has set one. */
export async function getCurrentProcessVersion(): Promise<ProcessVersion | null> {
  const { data, error } = await supabase
    .from('v_process_catalogue')
    .select(COLUMNS)
    .eq('is_current', true)
    .maybeSingle();
  if (error) throw error;
  return data ? toVersion(data as unknown as Row) : null;
}

export async function getProcessVersion(id: string): Promise<ProcessVersion | null> {
  const { data, error } = await supabase
    .from('v_process_catalogue')
    .select(COLUMNS)
    .eq('process_definition_id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toVersion(data as unknown as Row) : null;
}

/**
 * Which standard a batch that already exists was planned against.
 *
 * Read per batch rather than from the catalogue, because the catalogue's pointer moves and a
 * batch's baseline does not. A batch created on PROCESS-2026B is still a PROCESS-2026B batch
 * after 2026C becomes current, and showing it against the new standard would misreport every
 * variance it has.
 */
export async function getBatchProcessVersion(batchId: string): Promise<ProcessVersion | null> {
  const { data, error } = await supabase
    .from('master_batch')
    .select('process_definition_id')
    .eq('id', batchId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.process_definition_id) return null;
  return getProcessVersion(data.process_definition_id as string);
}

/** Move the pointer. Admin or GM; the server refuses anyone else and refuses a draft. */
export async function setCurrentProcess(definitionId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('set_current_process', {
    p_definition: definitionId,
    p_reason: reason,
  });
  if (error) throw error;
}
