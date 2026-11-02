/**
 * Onboarding a batch the factory is already running (operating flow, 14 Sep 2026; per-unit, 16 Sep 2026).
 *
 * Admin states where each physical UNIT is right now — the whole-batch line of a stream, each pile,
 * each bunker, each tunnel line. `onboard_batch` (0085 → 0125) records the actual H0, treats the work
 * behind those positions as "before MushroomOS tracking" — no times, performers, photos or readings are
 * invented — opens the positions, and activates the batch. `preview_onboard_batch` (0125) runs the same
 * function and rolls it back, so the review shows the server's own answer before anything is saved.
 *
 * Streams, units and activities are read from the batch's own generated activities, which come from the
 * process definition. Nothing here names a stage or an activity.
 */
import { supabase } from '../../../shared/api/client';

export type UnitActivity = {
  id: string;
  code: string;
  title: string;
  seq: number;
  isHold: boolean;
  startHour: number | null;
};

export type OnboardUnit = {
  /** `STREAM|scope label` — the key the server takes for a finished unit. */
  key: string;
  stream: string;
  label: string;
  activities: UnitActivity[];
};

export type OnboardStream = {
  stream: string;
  label: string;
  units: OnboardUnit[];
};

/** The engine's stream codes, in words. Presentation only — the grouping itself is the data's. */
export const STREAM_WORDS: Record<string, string> = {
  PRIMARY_FIBRE: 'Main material (bagasse)',
  SECONDARY_FIBRE: 'Secondary fibre',
  NITROGEN_MINERAL: 'Chicken manure & minerals',
  STRUCTURAL_STRAW: 'Paddy straw',
  YARD: 'Yard — mixing & Turner piles',
  BUNKER: 'Bunkers',
  TUNNEL: 'Tunnel',
};

const WHOLE = 'Whole batch';
export const unitKey = (stream: string, scope: string | null) => `${stream}|${scope ?? WHOLE}`;

/** Every stream of the batch, split into its physical units, in process order. */
export async function listOnboardingUnits(batchId: string): Promise<OnboardStream[]> {
  const { data, error } = await supabase
    .from('batch_activity')
    .select('id, code, title, stream, scope_label, seq, is_hold, baseline_start_hour, responsible_role')
    .eq('master_batch_id', batchId)
    .neq('responsible_role', 'lab_tech')
    .order('baseline_start_hour', { ascending: true, nullsFirst: true })
    .order('seq');
  if (error) throw error;

  const streams = new Map<string, { stream: string; first: number; units: Map<string, OnboardUnit & { first: number }> }>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const stream = String(r.stream);
    const scope = (r.scope_label as string | null) ?? WHOLE;
    const hour = r.baseline_start_hour === null ? null : Number(r.baseline_start_hour);
    let s = streams.get(stream);
    if (!s) {
      s = { stream, first: hour ?? 0, units: new Map() };
      streams.set(stream, s);
    }
    let u = s.units.get(scope);
    if (!u) {
      u = { key: unitKey(stream, scope), stream, label: scope, activities: [], first: hour ?? 0 };
      s.units.set(scope, u);
    }
    u.activities.push({
      id: String(r.id),
      code: String(r.code),
      title: String(r.title),
      seq: Number(r.seq),
      isHold: Boolean(r.is_hold),
      startHour: hour,
    });
  }

  return [...streams.values()]
    .sort((a, b) => a.first - b.first)
    .map((s) => {
      const units = [...s.units.values()].sort((a, b) => {
        // the shared line first, then units in their natural order (Pile 1 … Pile 6, Bunker 1 … 3)
        if (a.label === WHOLE) return -1;
        if (b.label === WHOLE) return 1;
        return a.label.localeCompare(b.label, undefined, { numeric: true }) || a.first - b.first;
      });
      const label = STREAM_WORDS[s.stream] ?? s.stream;
      return {
        stream: s.stream,
        label,
        units: units.map(({ first: _first, ...u }) => ({
          ...u,
          // A stream that is one whole-batch line is named by the stream; named units keep their own name.
          label: u.label !== WHOLE ? u.label : units.length === 1 ? label : 'Shared steps (whole batch)',
        })),
      };
    });
}

export type OnboardInput = {
  batchId: string;
  /** Optional: the original physical start is not required to begin tracking (0091). */
  actualH0: string | null;
  positions: string[];
  finishedUnits: string[];
  note: string | null;
};

const rpcArgs = (i: OnboardInput) => ({
  p_batch: i.batchId,
  p_h0: i.actualH0,
  p_positions: i.positions,
  p_completed_streams: [],
  p_note: i.note,
  p_finished_units: i.finishedUnits,
  p_exact_units: true,
});

export type PreviewRow = {
  activity_id: string;
  code: string;
  title: string;
  stream: string;
  unit: string;
  is_lab: boolean;
  state: string;
  before_tracking: boolean;
  is_position: boolean;
  baseline_start_hour: number | null;
  planned_start_at: string | null;
};

/** The server's own result for these choices — computed and rolled back. Nothing is saved. */
export async function previewOnboarding(input: OnboardInput): Promise<PreviewRow[]> {
  const { data, error } = await supabase.rpc('preview_onboard_batch', rpcArgs(input));
  if (error) throw error;
  return (data ?? []) as PreviewRow[];
}

export type OnboardResult = { beforeTracking: number; positions: number; open: number };

export async function onboardBatch(input: OnboardInput): Promise<OnboardResult> {
  const { data, error } = await supabase.rpc('onboard_batch', rpcArgs(input));
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as {
    before_tracking_count: number;
    position_count: number;
    open_count: number;
  };
  return { beforeTracking: row.before_tracking_count, positions: row.position_count, open: row.open_count };
}

/** What the database holds for the batch after onboarding — read back, never taken from the screen. */
export async function loadOnboardedState(batchId: string) {
  const [batch, acts] = await Promise.all([
    supabase.from('master_batch').select('status, start_at, process_definition_id').eq('id', batchId).single(),
    supabase
      .from('batch_activity')
      .select('id, code, stream, scope_label, responsible_role, state, before_tracking, onboarded_position, actual_start, actual_end, planned_start_at')
      .eq('master_batch_id', batchId),
  ]);
  if (batch.error) throw batch.error;
  if (acts.error) throw acts.error;
  return {
    batch: batch.data as { status: string; start_at: string | null; process_definition_id: string },
    activities: (acts.data ?? []) as {
      id: string;
      code: string;
      stream: string;
      scope_label: string | null;
      responsible_role: string | null;
      state: string;
      before_tracking: boolean | null;
      onboarded_position: boolean | null;
      actual_start: string | null;
      actual_end: string | null;
      planned_start_at: string | null;
    }[],
  };
}

/** True when the stream is a single whole-batch line, so the unit needs no name of its own. */
export const isStreamLine = (s: OnboardStream, u: OnboardUnit) => s.units.length === 1 && u.key.endsWith(`|${WHOLE}`);

/** Server refusals name units as `[STREAM|scope]`; put them in the screen's words. */
export function unitWords(message: string, streams: OnboardStream[]): string {
  const names = new Map<string, string>();
  for (const s of streams) {
    for (const u of s.units) names.set(u.key, isStreamLine(s, u) ? s.label : `${s.label}: ${u.label}`);
  }
  return message.replace(/\[([A-Z_]+\|[^\]]+)\]/g, (_, key: string) => names.get(key) ?? key);
}
