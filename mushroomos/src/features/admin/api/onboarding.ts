/**
 * Onboarding a batch the factory is already running (operating flow, 14 Sep 2026).
 *
 * Admin states where each physical stream is RIGHT NOW. `onboard_batch` (0085) records the actual H0,
 * treats the work before those positions as "before MushroomOS tracking" — no times, performers,
 * photos or readings are invented — opens the positions, and activates the batch. From there the
 * process engine decides the next valid work in each stream.
 *
 * Streams, stages and activities are read from the batch's own generated activities, which come from
 * the process definition. Nothing here names a stage or an activity.
 */
import { supabase } from '../../../shared/api/client';

export type StreamActivity = {
  id: string;
  code: string;
  title: string;
  stage: string | null;
  scopeLabel: string | null;
  seq: number;
  isHold: boolean;
};

export type BatchStream = {
  stream: string;
  label: string;
  stages: string[];
  activities: StreamActivity[];
};

/** The engine's stream codes, in words. Presentation only — the grouping itself is the data's. */
const STREAM_WORDS: Record<string, string> = {
  PRIMARY_FIBRE: 'Main material (fibre)',
  SECONDARY_FIBRE: 'Secondary fibre',
  NITROGEN_MINERAL: 'Nitrogen & mineral',
  STRUCTURAL_STRAW: 'Straw / paddy',
  YARD: 'Yard — mixing & Turner',
  BUNKER: 'Bunkers',
  TUNNEL: 'Tunnel',
};

export async function listBatchStreams(batchId: string): Promise<BatchStream[]> {
  const { data, error } = await supabase
    .from('batch_activity')
    .select('id, code, title, stream, scope_label, seq, is_hold, responsible_role, process_activity(stage)')
    .eq('master_batch_id', batchId)
    .neq('responsible_role', 'lab_tech')
    .order('seq');
  if (error) throw error;

  const byStream = new Map<string, BatchStream>();
  for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
    const stream = String(r.stream);
    const pa = r.process_activity as { stage: string | null } | { stage: string | null }[] | null;
    const stage = Array.isArray(pa) ? pa[0]?.stage ?? null : pa?.stage ?? null;
    let s = byStream.get(stream);
    if (!s) {
      s = { stream, label: STREAM_WORDS[stream] ?? stream, stages: [], activities: [] };
      byStream.set(stream, s);
    }
    if (stage && !s.stages.includes(stage)) s.stages.push(stage);
    s.activities.push({
      id: String(r.id),
      code: String(r.code),
      title: String(r.title),
      stage,
      scopeLabel: (r.scope_label as string | null) ?? null,
      seq: Number(r.seq),
      isHold: Boolean(r.is_hold),
    });
  }
  return [...byStream.values()].sort((a, b) => (a.activities[0]?.seq ?? 0) - (b.activities[0]?.seq ?? 0));
}

export type OnboardResult = { beforeTracking: number; positions: number; open: number };

export async function onboardBatch(input: {
  batchId: string;
  /** Optional: the original physical start is not required to begin tracking (0091). */
  actualH0: string | null;
  positions: string[];
  completedStreams: string[];
  note: string | null;
}): Promise<OnboardResult> {
  const { data, error } = await supabase.rpc('onboard_batch', {
    p_batch: input.batchId,
    p_h0: input.actualH0,
    p_positions: input.positions,
    p_completed_streams: input.completedStreams,
    p_note: input.note,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as {
    before_tracking_count: number;
    position_count: number;
    open_count: number;
  };
  return { beforeTracking: row.before_tracking_count, positions: row.position_count, open: row.open_count };
}
