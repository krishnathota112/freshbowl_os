import { describe, expect, it } from 'vitest';

import { activityStatus, buildZones, focusZone, hourWindow, zoneOf, type MapActivity } from './factoryZones';

const row = (over: Partial<MapActivity>): MapActivity => ({
  activity_id: Math.random().toString(36).slice(2),
  code: 'X',
  title: 'Something',
  stream: 'YARD',
  scope_label: 'Whole batch',
  state: 'WAITING_CONDITION',
  is_hold: false,
  is_lab: false,
  before_tracking: false,
  overdue: false,
  baseline_start_hour: 10,
  baseline_end_hour: 12,
  actual_start: null,
  actual_end: null,
  projected_start_at: null,
  projected_end_at: null,
  waiting_for_title: null,
  blocked_reason: null,
  delay_minutes: null,
  ...over,
});

describe('factory map zones', () => {
  it('places activities by stream and scope, never by code', () => {
    expect(zoneOf(row({ stream: 'PRIMARY_FIBRE' }))).toBe('fibre');
    expect(zoneOf(row({ stream: 'STRUCTURAL_STRAW' }))).toBe('paddy');
    expect(zoneOf(row({ stream: 'NITROGEN_MINERAL' }))).toBe('cm');
    expect(zoneOf(row({ stream: 'YARD', scope_label: 'Pile 4' }))).toBe('pile-4');
    expect(zoneOf(row({ stream: 'BUNKER', scope_label: 'Bunker 2' }))).toBe('line-2');
    expect(zoneOf(row({ stream: 'TUNNEL', scope_label: 'Bunker 2' }))).toBe('tunnel');
    expect(zoneOf(row({ stream: 'TUNNEL', scope_label: 'Stream 3' }))).toBe('growroom');
    expect(zoneOf(row({ stream: 'YARD', scope_label: 'Bunker 1', is_lab: true }))).toBe('lab');
    expect(zoneOf(row({ stream: 'YARD' }))).toBe('mixing');
  });

  it('a running passive rest reads as resting, not as work', () => {
    expect(activityStatus(row({ state: 'IN_PROGRESS', is_hold: true }))).toBe('resting');
    expect(activityStatus(row({ state: 'IN_PROGRESS' }))).toBe('active');
    expect(activityStatus(row({ state: 'READY', before_tracking: true }))).toBe('done');
    expect(activityStatus(row({ state: 'NOT_DUE_YET' }))).toBe('notdue');
  });

  it('a zone shows its most urgent state, and one pile does not colour another', () => {
    const zones = buildZones([
      row({ stream: 'YARD', scope_label: 'Pile 1', state: 'COMPLETED' }),
      row({ stream: 'YARD', scope_label: 'Pile 1', state: 'IN_PROGRESS', overdue: true }),
      row({ stream: 'YARD', scope_label: 'Pile 2', state: 'WAITING_CONDITION' }),
      row({ stream: 'PRIMARY_FIBRE', state: 'COMPLETED' }),
    ]);
    expect(zones['pile-1'].status).toBe('active');
    expect(zones['pile-1'].late).toBe(1);
    expect(zones['pile-2'].status).toBe('waiting');
    expect(zones.fibre.status).toBe('done');
    expect(zones.tunnel.status).toBe('empty');
    expect(focusZone(zones)).toBe('pile-1');
  });

  it('writes hours in the operational language', () => {
    expect(hourWindow({ baseline_start_hour: 190, baseline_end_hour: 255 })).toBe('H190–H255');
    expect(hourWindow({ baseline_start_hour: 186.5, baseline_end_hour: 186.5 })).toBe('H186.5');
    expect(hourWindow({ baseline_start_hour: null, baseline_end_hour: null })).toBe('no planned hour');
  });
});
