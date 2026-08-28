import { supabase } from './client';
import type { VesselOption, VesselSlot } from '../domain/contracts';
import { nowMs } from '../lib/now';

/**
 * THE PLANT, RIGHT NOW. `v_plant_now` (migration 0026).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS MODULE EXISTS
 *
 * Every other screen in this product is organised around the PROCESS — day 5, line 2 of 3, stream
 * PRIMARY_FIBRE, an hour position on the batch axis. That is how the process thinks, and a
 * supervisor running the process needs it.
 *
 * (The axis length is deliberately not written here, not even in prose. It comes from
 * `process_definition.baseline_hours`, invariant 8 scans this directory for the literal, and C-34
 * disputes whether the baseline is fixed at all — so a number in a comment takes a side.)
 *
 * It is not how anyone LOOKS AT A FACTORY. An owner walking in asks what is in Bunker 7, whether
 * Tunnel 3 is free on Thursday, and how much of the plant is standing empty. Those questions are
 * about PLACES, and until 0026 the system could not answer any of them: 736 of 800 activities had
 * no location, and `location_occupancy` had zero rows.
 *
 * AN EMPTY VESSEL IS A ROW, NOT A GAP. `v_plant_now` returns every vessel the factory has, whether
 * or not anything is in it, and this module keeps them. Filtering empties out would turn a view of
 * a factory back into a list of batches — which is the thing it exists to stop being.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

export type Vessel = {
  locationId: string;
  kind: string;
  code: string;
  label: string;
  isExclusive: boolean;
  status: string;
  /** Null means EMPTY — a fact, not missing data. */
  batchId: string | null;
  batchCode: string | null;
  batchLabel: string | null;
  occupiedSince: string | null;
  stream: string | null;
  activityId: string | null;
  activityTitle: string | null;
  scopeLabel: string | null;
  activityState: string | null;
  batchHour: number | null;
  /** The open question this placement was made under — TBD-57 on every bunker, today. */
  conflictId: string | null;
  /**
   * Empty, but SPOKEN FOR. A bunker nothing has started in yet but which a batch's plan already
   * claims is not the same as a free bunker, and a planner deciding where the next batch goes needs
   * to see the difference. Null when the vessel is genuinely unclaimed.
   */
  reservedFor: string | null;
};

export type PlantRow = {
  /** `BUNKER`, `TUNNEL`, … — from the data, never a hard-coded list of the factory's rooms. */
  kind: string;
  vessels: Vessel[];
  occupied: number;
};

export type PlantData = {
  rows: PlantRow[];
  totalVessels: number;
  totalOccupied: number;
  /** Batches that are running but sitting in no vessel at all. See `unplacedReason`. */
  unplaced: { batchId: string; code: string; hour: number | null }[];
};

/**
 * The order the factory runs in, not alphabetical.
 *
 * Material enters at the yard, soaks, passes the hopper, fills the bunkers, then the tunnels. A
 * plant view sorted A–Z would put BUNKER before YARD and read backwards. Anything not named here
 * sorts after, so a new vessel kind appears rather than vanishing.
 */
const FLOW_ORDER = ['YARD', 'SOAK_PIT', 'HOPPER', 'BUNKER', 'TUNNEL'];

function flowRank(kind: string): number {
  const i = FLOW_ORDER.indexOf(kind);
  return i === -1 ? FLOW_ORDER.length : i;
}

export async function loadPlant(): Promise<PlantData> {
  const [plant, live, avail] = await Promise.all([
    supabase
      .from('v_plant_now')
      .select(
        'location_id, kind, code, label, is_exclusive, location_status, master_batch_id, ' +
          'batch_code, batch_label, occupied_since, stream, activity_id, activity_title, ' +
          'scope_label, activity_state, batch_hour, tbd_marker'
      )
      .order('kind')
      .order('code'),
    supabase.from('v_live_batch').select('id, code, start_at'),
    // Who has each vessel RESERVED. Separate from occupancy on purpose: allocation is a plan,
    // occupancy is a fact, and a vessel can be one without the other.
    supabase.from('v_vessel_availability').select('location_id, allocated_to_batch'),
  ]);
  if (plant.error) throw plant.error;
  if (live.error) throw live.error;
  if (avail.error) throw avail.error;

  const reserved = new Map<string, string>();
  for (const a of (avail.data ?? []) as { location_id: string; allocated_to_batch: string | null }[]) {
    if (a.allocated_to_batch !== null) reserved.set(a.location_id, a.allocated_to_batch);
  }

  const vessels = ((plant.data ?? []) as unknown as Record<string, unknown>[]).map<Vessel>((r) => ({
    locationId: r.location_id as string,
    kind: r.kind as string,
    code: r.code as string,
    label: r.label as string,
    isExclusive: Boolean(r.is_exclusive),
    status: r.location_status as string,
    batchId: (r.master_batch_id as string | null) ?? null,
    batchCode: (r.batch_code as string | null) ?? null,
    batchLabel: (r.batch_label as string | null) ?? null,
    occupiedSince: (r.occupied_since as string | null) ?? null,
    stream: (r.stream as string | null) ?? null,
    activityId: (r.activity_id as string | null) ?? null,
    activityTitle: (r.activity_title as string | null) ?? null,
    scopeLabel: (r.scope_label as string | null) ?? null,
    activityState: (r.activity_state as string | null) ?? null,
    batchHour: (r.batch_hour as number | null) ?? null,
    conflictId: (r.tbd_marker as string | null) ?? null,
    reservedFor: reserved.get(r.location_id as string) ?? null,
  }));

  const byKind = new Map<string, Vessel[]>();
  for (const v of vessels) {
    const list = byKind.get(v.kind);
    if (list) list.push(v);
    else byKind.set(v.kind, [v]);
  }

  const rows: PlantRow[] = [...byKind.entries()]
    .map(([kind, vs]) => ({
      kind,
      // Numeric order, so Bunker 10 follows Bunker 9 rather than Bunker 1.
      vessels: [...vs].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
      occupied: vs.filter((v) => v.batchCode !== null).length,
    }))
    .sort((a, b) => flowRank(a.kind) - flowRank(b.kind) || a.kind.localeCompare(b.kind));

  // A running batch that is in no vessel. Not an error — most of the process happens outside a
  // named vessel — but a batch that SHOULD be in a bunker and is not is worth seeing.
  const placed = new Set(vessels.map((v) => v.batchId).filter(Boolean) as string[]);
  const unplaced = ((live.data ?? []) as unknown as Record<string, unknown>[])
    .filter((b) => !placed.has(b.id as string))
    .map((b) => ({
      batchId: b.id as string,
      code: b.code as string,
      hour:
        b.start_at === null
          ? null
          : Math.floor((nowMs() - Date.parse(b.start_at as string)) / 3_600_000) + 1,
    }));

  return {
    rows,
    totalVessels: vessels.length,
    totalOccupied: vessels.filter((v) => v.batchCode !== null).length,
    unplaced,
  };
}

/** What a single batch holds, slot by slot. Used on the batch page. */
export type BatchVessel = {
  scope: string;
  instanceNo: number;
  kind: string;
  locationCode: string;
  locationLabel: string;
  conflictId: string | null;
  currentlyIn: boolean;
  firstOccupied: string | null;
  allocatedByName: string | null;
};

export async function loadBatchVessels(batchId: string): Promise<BatchVessel[]> {
  const { data, error } = await supabase
    .from('v_batch_vessel')
    .select(
      'scope, instance_no, kind, location_code, location_label, conflict_id, currently_in, ' +
        'first_occupied, allocated_by_name'
    )
    .eq('master_batch_id', batchId)
    .order('kind')
    .order('instance_no');
  if (error) throw error;

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    scope: r.scope as string,
    instanceNo: Number(r.instance_no),
    kind: r.kind as string,
    locationCode: r.location_code as string,
    locationLabel: r.location_label as string,
    conflictId: (r.conflict_id as string | null) ?? null,
    currentlyIn: Boolean(r.currently_in),
    firstOccupied: (r.first_occupied as string | null) ?? null,
    allocatedByName: (r.allocated_by_name as string | null) ?? null,
  }));
}

/* ── the vessel picker ───────────────────────────────────────────────────────────────────────── */



export async function loadVesselSlots(batchId: string): Promise<VesselSlot[]> {
  const { data, error } = await supabase
    .from('v_batch_vessel_slot')
    .select(
      'scope, needs_kind, instance_no, activity_count, first_day, last_day, location_id, ' +
        'location_code, location_label, conflict_id, allocated_by_name, work_started'
    )
    .eq('master_batch_id', batchId)
    .order('needs_kind')
    .order('instance_no');
  if (error) throw error;

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    scope: r.scope as string,
    needsKind: r.needs_kind as string,
    instanceNo: Number(r.instance_no),
    activityCount: Number(r.activity_count ?? 0),
    firstDay: Number(r.first_day ?? 0),
    lastDay: Number(r.last_day ?? 0),
    locationId: (r.location_id as string | null) ?? null,
    locationCode: (r.location_code as string | null) ?? null,
    locationLabel: (r.location_label as string | null) ?? null,
    conflictId: (r.conflict_id as string | null) ?? null,
    allocatedByName: (r.allocated_by_name as string | null) ?? null,
    workStarted: Boolean(r.work_started),
  }));
}

export async function loadVesselOptions(): Promise<VesselOption[]> {
  const { data, error } = await supabase
    .from('v_vessel_availability')
    .select(
      'location_id, kind, code, label, status, occupied_by_batch, occupied_by_batch_id, ' +
        'allocated_to_batch, allocated_to_batch_id'
    )
    .order('kind')
    .order('code');
  if (error) throw error;

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    locationId: r.location_id as string,
    kind: r.kind as string,
    code: r.code as string,
    label: r.label as string,
    status: r.status as string,
    occupiedByBatch: (r.occupied_by_batch as string | null) ?? null,
    occupiedByBatchId: (r.occupied_by_batch_id as string | null) ?? null,
    allocatedToBatch: (r.allocated_to_batch as string | null) ?? null,
    allocatedToBatchId: (r.allocated_to_batch_id as string | null) ?? null,
  }));
}

export async function allocateVessel(input: {
  batchId: string;
  scope: string;
  instanceNo: number;
  locationId: string;
  note?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('allocate_vessel', {
    p_batch: input.batchId,
    p_scope: input.scope,
    p_instance_no: input.instanceNo,
    p_location: input.locationId,
    p_note: input.note ?? null,
  });
  if (error) throw error;
}

export async function releaseVessel(batchId: string, scope: string, instanceNo: number) {
  const { error } = await supabase.rpc('release_vessel', {
    p_batch: batchId,
    p_scope: scope,
    p_instance_no: instanceNo,
  });
  if (error) throw error;
}
