import { describe, expect, it } from 'vitest';
import type { MyWorkRow } from '../api/work';
import { alarmId, isAlarmId, planAlarms } from './planAlarms';

const NOW = Date.parse('2026-09-25T10:00:00Z');
const at = (min: number) => new Date(NOW + min * 60_000).toISOString();
const row = (over: Partial<MyWorkRow>): MyWorkRow => ({
  activity_id: 'a1', master_batch_id: 'b', batch_code: 'DEMO-SOP-1', code: 'X', title: 'Water hopper pass', scope_label: null,
  stream: null, instance_no: 1, state: 'NOT_DUE_YET', blocked_reason: null, is_hold: false, responsible_role: 'operator',
  assigned_person_id: null, assigned_machine_id: null, baseline_start_hour: 1, baseline_end_hour: 2, planned_start_at: at(60),
  planned_end_at: at(120), actual_start: null, actual_end: null, variance_minutes: null, required_count: null, satisfied_total: null,
  outstanding_labels: null, stage: null, skip_policy: null, unblocks_at: null, started_by_name: null, finished_by_name: null,
  overdue: null, duration_target_max_hr: null, latest_ticket_status: null, is_demo: true, ...over,
});

describe('task alarms', () => {
  it('rings 5 min before and 5 min after the planned start of a task that can start', () => {
    const a = planAlarms([row({})], {}, NOW);
    expect(a.map((x) => [x.key, (x.at - NOW) / 60_000])).toEqual([['a1:start-before', 55], ['a1:start-after', 65]]);
    expect(a[0].title).toBe('DEMO-SOP-1 · Water hopper pass');
    expect(a[0].body).toMatch(/Starts in 5 min/);
  });

  it('a running task rings around its finish-by (from activity_due), not its start', () => {
    const a = planAlarms([row({ state: 'IN_PROGRESS', actual_start: at(-30) })], { a1: at(20) }, NOW);
    expect(a.map((x) => [x.key, (x.at - NOW) / 60_000])).toEqual([['a1:finish-before', 15], ['a1:finish-after', 25]]);
  });

  it('only the after-alarm is left once the start is under 5 min away; nothing once both have passed', () => {
    expect(planAlarms([row({ planned_start_at: at(2) })], {}, NOW).map((x) => x.key)).toEqual(['a1:start-after']);
    expect(planAlarms([row({ planned_start_at: at(-10) })], {}, NOW)).toEqual([]);
  });

  it('no alarm for waiting, blocked or finished work, or beyond 24 h', () => {
    for (const state of ['WAITING_CONDITION', 'BLOCKED', 'LOCKED', 'COMPLETED', 'SUBMITTED'])
      expect(planAlarms([row({ state })], {}, NOW)).toEqual([]);
    expect(planAlarms([row({ planned_start_at: at(25 * 60) })], {}, NOW)).toEqual([]);
  });

  it('ids are stable, distinct and in their own band', () => {
    expect(alarmId('a1:start-before')).toBe(alarmId('a1:start-before'));
    expect(alarmId('a1:start-before')).not.toBe(alarmId('a1:start-after'));
    expect(isAlarmId(alarmId('x'))).toBe(true);
    expect(isAlarmId(5)).toBe(false);
  });
});
