/**
 * The factory map's grouping: which area of the floor each batch activity belongs to, and what that
 * area should look like. Pure — no React, no data access.
 *
 * It groups and summarises; it decides nothing. Every state, time and reason is the server's
 * (`project_batch` + `v_batch_timeline`). The only thing read here is WHERE an activity happens, and
 * that comes from the process data's own stream and scope columns, never from a code or an hour.
 */

export type ZoneId =
  | 'fibre'
  | 'cm'
  | 'paddy'
  | 'mixing'
  | 'lab'
  | 'pile-1' | 'pile-2' | 'pile-3' | 'pile-4' | 'pile-5' | 'pile-6'
  | 'line-1' | 'line-2' | 'line-3'
  | 'tunnel'
  | 'growroom';

/** What an area of the floor looks like right now, most urgent first. */
export type ZoneStatus = 'blocked' | 'active' | 'resting' | 'ready' | 'waiting' | 'notdue' | 'done' | 'empty';

export type MapActivity = {
  activity_id: string;
  code: string;
  title: string;
  stream: string | null;
  scope_label: string | null;
  state: string;
  is_hold: boolean;
  is_lab: boolean;
  before_tracking: boolean;
  overdue: boolean;
  baseline_start_hour: number | null;
  baseline_end_hour: number | null;
  actual_start: string | null;
  actual_end: string | null;
  projected_start_at: string | null;
  projected_end_at: string | null;
  waiting_for_title: string | null;
  blocked_reason: string | null;
  delay_minutes: number | null;
};

export type Zone = {
  id: ZoneId;
  status: ZoneStatus;
  activities: MapActivity[];
  /** The activity the zone's status came from, if any. */
  lead: MapActivity | null;
  late: number;
};

export const ZONE_NAME: Record<ZoneId, string> = {
  fibre: 'Bagasse yard',
  cm: 'CM & minerals pad',
  paddy: 'Paddy platform & soaking pit',
  mixing: 'Mixing yard & hopper',
  lab: 'Laboratory',
  'pile-1': 'Pile 1',
  'pile-2': 'Pile 2',
  'pile-3': 'Pile 3',
  'pile-4': 'Pile 4',
  'pile-5': 'Pile 5',
  'pile-6': 'Pile 6',
  'line-1': 'Bunker line 1',
  'line-2': 'Bunker line 2',
  'line-3': 'Bunker line 3',
  tunnel: 'Tunnel process',
  growroom: 'Grow-room hand-off',
};

export const ZONE_IDS = Object.keys(ZONE_NAME) as ZoneId[];

export const STATUS_WORD: Record<ZoneStatus, string> = {
  blocked: 'Blocked',
  active: 'Work in progress',
  resting: 'Resting',
  ready: 'Ready to start',
  waiting: 'Waiting',
  notdue: 'Not due yet',
  done: 'Done',
  empty: 'Nothing here',
};

const FINISHED = new Set(['COMPLETED', 'SKIPPED', 'CANCELLED']);
const BLOCKING = new Set(['BLOCKED', 'LOCKED', 'DEVIATION', 'RETURNED']);
const WORKING = new Set(['IN_PROGRESS', 'SUBMITTED', 'AWAITING_LAB', 'AWAITING_SUPERVISOR']);

const numberIn = (label: string | null, word: string): number | null => {
  const m = label ? new RegExp(`^${word}\\s+(\\d+)`, 'i').exec(label.trim()) : null;
  return m ? Number(m[1]) : null;
};

/** Where on the floor an activity happens, from its stream and scope. Null = not placed on the map. */
export function zoneOf(a: Pick<MapActivity, 'stream' | 'scope_label' | 'is_lab'>): ZoneId | null {
  if (a.is_lab) return 'lab';
  const pile = numberIn(a.scope_label, 'Pile');
  if (pile !== null && pile >= 1 && pile <= 6) return `pile-${pile}` as ZoneId;
  switch (a.stream) {
    case 'PRIMARY_FIBRE':
      return 'fibre';
    case 'NITROGEN_MINERAL':
      return 'cm';
    case 'STRUCTURAL_STRAW':
      return 'paddy';
    case 'BUNKER': {
      const line = numberIn(a.scope_label, 'Bunker');
      return line !== null && line >= 1 && line <= 3 ? (`line-${line}` as ZoneId) : null;
    }
    case 'TUNNEL':
      return numberIn(a.scope_label, 'Stream') !== null ? 'growroom' : 'tunnel';
    case 'YARD':
      return 'mixing';
    default:
      return null;
  }
}

/** One activity's contribution to its zone's look. */
export function activityStatus(a: MapActivity): ZoneStatus {
  if (a.before_tracking || FINISHED.has(a.state)) return 'done';
  if (BLOCKING.has(a.state)) return 'blocked';
  if (WORKING.has(a.state)) return a.is_hold ? 'resting' : 'active';
  if (a.state === 'READY') return 'ready';
  if (a.state === 'NOT_DUE_YET') return 'notdue';
  return 'waiting';
}

const RANK: ZoneStatus[] = ['blocked', 'active', 'resting', 'ready', 'waiting', 'notdue', 'done', 'empty'];

/**
 * A zone shows its most urgent live state. A zone whose work is all finished is Done; one whose work
 * has not begun and is only waiting shows Waiting — so the eye lands on where the batch actually is.
 */
export function buildZones(rows: MapActivity[]): Record<ZoneId, Zone> {
  const out = {} as Record<ZoneId, Zone>;
  for (const id of ZONE_IDS) out[id] = { id, status: 'empty', activities: [], lead: null, late: 0 };

  for (const a of rows) {
    const id = zoneOf(a);
    if (!id) continue;
    out[id].activities.push(a);
  }

  for (const z of Object.values(out)) {
    z.activities.sort((x, y) => (x.baseline_start_hour ?? Infinity) - (y.baseline_start_hour ?? Infinity));
    z.late = z.activities.filter((a) => a.overdue && activityStatus(a) !== 'done').length;
    let best: { s: ZoneStatus; a: MapActivity } | null = null;
    for (const a of z.activities) {
      const s = activityStatus(a);
      if (!best || RANK.indexOf(s) < RANK.indexOf(best.s)) best = { s, a };
    }
    if (best) {
      z.status = best.s;
      z.lead = best.a;
    }
  }
  return out;
}

/** Which zone the side panel opens on: where work is happening, else what is next. */
export function focusZone(zones: Record<ZoneId, Zone>): ZoneId {
  for (const s of ['active', 'resting', 'blocked', 'ready', 'waiting'] as ZoneStatus[]) {
    // The lab zone is a parallel stream; the floor position is what an Admin opens the map for.
    const hit = ZONE_IDS.find((id) => id !== 'lab' && zones[id].status === s);
    if (hit) return hit;
  }
  return 'fibre';
}

/** A baseline window in the operational language: "H190–H255", or "H0". */
export function hourWindow(a: Pick<MapActivity, 'baseline_start_hour' | 'baseline_end_hour'>): string {
  const f = (h: number) => `H${Number.isInteger(h) ? h : h.toFixed(1)}`;
  if (a.baseline_start_hour === null) return 'no planned hour';
  if (a.baseline_end_hour === null || a.baseline_end_hour === a.baseline_start_hour) return f(a.baseline_start_hour);
  return `${f(a.baseline_start_hour)}–${f(a.baseline_end_hour)}`;
}
