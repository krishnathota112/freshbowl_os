import type { MyWorkRow } from '../api/work';

/**
 * Task alarms (owner request, 25 Sep 2026): ring 5 minutes BEFORE a task's time, and again 5 minutes AFTER it
 * if nothing has happened yet.
 *
 *   start   a task the engine says can start once its hour comes (READY, NOT_DUE_YET) and has not started:
 *           5 min before its planned start, and 5 min after it.
 *   finish  a task IN_PROGRESS: 5 min before its finish-by, and 5 min after it.
 *
 * Every time is the server's: `planned_start_at` from v_my_work, finish-by from `activity_due` (the planned end plus
 * extra time granted on tickets). This file decides only WHEN to ring, never whether work may start.
 * An alarm whose time has passed is not set; one further than the horizon is set on a later refresh.
 */
export const ALARM_OFFSET_MIN = 5;
export const ALARM_HORIZON_HR = 24;
export const ALARM_MAX = 60;

const START_STATES = ['READY', 'NOT_DUE_YET'];

export type TaskAlarm = {
  key: string;
  at: number;
  activityId: string;
  title: string;
  body: string;
};

const hm = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function planAlarms(rows: MyWorkRow[], dueAt: Record<string, string | null>, now: number): TaskAlarm[] {
  const off = ALARM_OFFSET_MIN * 60_000;
  const until = now + ALARM_HORIZON_HR * 3_600_000;
  const out: TaskAlarm[] = [];
  const add = (row: MyWorkRow, kind: string, at: number, body: string) => {
    if (at <= now || at > until) return;
    out.push({
      key: `${row.activity_id}:${kind}`,
      at,
      activityId: row.activity_id,
      title: `${row.batch_code} · ${row.title}`,
      body,
    });
  };

  for (const r of rows) {
    if (START_STATES.includes(r.state) && !r.actual_start && r.planned_start_at) {
      const t = Date.parse(r.planned_start_at);
      if (!Number.isNaN(t)) {
        add(r, 'start-before', t - off, `Starts in ${ALARM_OFFSET_MIN} min — planned ${hm(t)}`);
        add(r, 'start-after', t + off, `Not started — was planned for ${hm(t)}`);
      }
    }
    const due = dueAt[r.activity_id];
    if (r.state === 'IN_PROGRESS' && !r.actual_end && due) {
      const t = Date.parse(due);
      if (!Number.isNaN(t)) {
        add(r, 'finish-before', t - off, `Finish by ${hm(t)} — ${ALARM_OFFSET_MIN} min left`);
        add(r, 'finish-after', t + off, `Not finished — was due by ${hm(t)}`);
      }
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, ALARM_MAX);
}

/** A stable Android notification id (positive 31-bit int) per alarm, in a band of its own. */
export const ALARM_ID_BASE = 700_000_000;
export function alarmId(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  return ALARM_ID_BASE + (Math.abs(h) % 100_000_000);
}
export const isAlarmId = (id: number) => id >= ALARM_ID_BASE && id < ALARM_ID_BASE + 100_000_000;
