import { supabase } from './client';
import type { IndividualBatch, Movement } from '../domain/contracts';



export async function loadMovements(batchId: string): Promise<Movement[]> {
  const { data, error } = await supabase
    .from('v_batch_movement')
    .select(
      'seq, movement_code, movement_label, needs_kind, is_per_individual_batch, ' +
        'individual_batch_id, batch_no, movement_id, from_label, to_location_id, to_label, ' +
        'to_code, planned_at, actual_at, fill_height_m, conflict_id, recorded_by_name'
    )
    .eq('master_batch_id', batchId)
    .order('seq')
    .order('batch_no', { nullsFirst: true });
  if (error) throw error;

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    seq: Number(r.seq),
    code: r.movement_code as string,
    label: r.movement_label as string,
    needsKind: (r.needs_kind as string | null) ?? null,
    perIndividual: Boolean(r.is_per_individual_batch),
    individualBatchId: (r.individual_batch_id as string | null) ?? null,
    batchNo: (r.batch_no as string | null) ?? null,
    movementId: (r.movement_id as string | null) ?? null,
    fromLabel: (r.from_label as string | null) ?? null,
    toLocationId: (r.to_location_id as string | null) ?? null,
    toLabel: (r.to_label as string | null) ?? null,
    toCode: (r.to_code as string | null) ?? null,
    plannedAt: (r.planned_at as string | null) ?? null,
    actualAt: (r.actual_at as string | null) ?? null,
    fillHeightM: r.fill_height_m === null ? null : Number(r.fill_height_m),
    conflictId: (r.conflict_id as string | null) ?? null,
    recordedByName: (r.recorded_by_name as string | null) ?? null,
  }));
}

export async function loadIndividualBatches(batchId: string): Promise<IndividualBatch[]> {
  const { data, error } = await supabase
    .from('individual_batch')
    .select('id, batch_no, seq')
    .eq('master_batch_id', batchId)
    .order('seq');
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    batchNo: r.batch_no as string,
    seq: Number(r.seq),
  }));
}

/**
 * Split "366,367,368" into the individual batches it covers.
 *
 * The factory writes the group as one string and that is what Admin types, so the split happens on
 * the server — comma, slash or space, because the records use all three.
 */
export async function setIndividualBatches(batchId: string, numbers: string): Promise<number> {
  const { data, error } = await supabase.rpc('set_individual_batches', {
    p_batch: batchId,
    p_numbers: numbers,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function setMovementVessel(input: {
  batchId: string;
  movement: string;
  locationId: string;
  individualBatchId?: string | null;
  plannedAt?: string | null;
  note?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('set_movement_vessel', {
    p_batch: input.batchId,
    p_movement: input.movement,
    p_location: input.locationId,
    p_individual: input.individualBatchId ?? null,
    p_planned_at: input.plannedAt ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw error;
}
