import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../api/client';
import { listMyWork, type MyWorkRow } from '../api/work';
import { useAuth } from '../auth/auth';
import { planAlarms, type TaskAlarm } from './planAlarms';
import { exactAlarmsAllowed, nativeAlarmsAvailable, openExactAlarmSetting, scheduleTestAlarm, syncNativeAlarms } from './nativeAlarms';

/**
 * Task alarms for the Supervisor (production work) and the Lab (Lab work). Mounted once, inside the shell.
 *
 *   Android app   alarms are scheduled on the phone and ring even when the app is closed (nativeAlarms.ts).
 *   Open screen   a banner plus, on the web, a repeating buzzer — the browser cannot ring when the tab is closed.
 */
const ALARM_ROLES = ['supervisor', 'operator', 'lab_tech'];

async function loadAlarmInputs(role: string): Promise<{ rows: MyWorkRow[]; due: Record<string, string | null> }> {
  const all = await listMyWork();
  const rows = all.filter((r) => (role === 'lab_tech' ? r.responsible_role === 'lab_tech' : r.responsible_role !== 'lab_tech'));
  const running = rows.filter((r) => r.state === 'IN_PROGRESS');
  const due: Record<string, string | null> = {};
  await Promise.all(
    running.map(async (r) => {
      const { data } = await supabase.rpc('activity_due', { p_activity: r.activity_id });
      const d = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
      due[r.activity_id] = d && d.applies ? ((d.due_at as string | null) ?? null) : null;
    })
  );
  return { rows, due };
}

/** A short "ding-dong" ping, three times, from the Web Audio API — no sound file needed. */
let audio: AudioContext | null = null;
function ping() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const t0 = audio.currentTime;
    for (let rep = 0; rep < 3; rep++) {
      [880, 660].forEach((f, i) => {
        const osc = audio!.createOscillator();
        const gain = audio!.createGain();
        const t = t0 + rep * 0.9 + i * 0.25;
        osc.type = 'sine';
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.6, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        osc.connect(gain).connect(audio!.destination);
        osc.start(t);
        osc.stop(t + 0.4);
      });
    }
    navigator.vibrate?.([400, 200, 400, 200, 400]);
  } catch {
    /* no audio device */
  }
}

export function TaskAlarms() {
  const { role, session } = useAuth();
  const on = !!session && !!role && ALARM_ROLES.includes(role);
  const inputs = useQuery({
    queryKey: ['alarm-work', role],
    queryFn: () => loadAlarmInputs(role!),
    enabled: on,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const alarms = useMemo(
    () => (inputs.data ? planAlarms(inputs.data.rows, inputs.data.due, Date.now()) : []),
    [inputs.data]
  );

  const [ringing, setRinging] = useState<TaskAlarm[]>([]);
  const [blocked, setBlocked] = useState<'notifications' | 'exact' | null>(null);
  const fired = useRef(new Set<string>());
  const [testNote, setTestNote] = useState<string | null>(null);

  // The browser only lets sound play after the person has touched the page once.
  useEffect(() => {
    const unlock = () => {
      audio ??= new AudioContext();
      void audio.resume();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // Phone: replace the scheduled set.
  useEffect(() => {
    if (!on || !inputs.data || !nativeAlarmsAvailable()) return;
    (async () => {
      const ok = await syncNativeAlarms(alarms);
      if (!ok) return setBlocked('notifications');
      setBlocked((await exactAlarmsAllowed()) ? null : 'exact');
    })().catch(() => undefined);
  }, [on, inputs.data, alarms]);

  // Open screen: a banner at the alarm's minute; the web also buzzes (the phone's own notification sounds there).
  useEffect(() => {
    if (!on) return;
    const timers = alarms
      .filter((a) => !fired.current.has(a.key))
      .map((a) =>
        window.setTimeout(() => {
          fired.current.add(a.key);
          setRinging((r) => [...r.filter((x) => x.key !== a.key), a]);
          if (!nativeAlarmsAvailable()) ping();
        }, a.at - Date.now())
      );
    return () => timers.forEach(clearTimeout);
  }, [on, alarms]);

  // Web: keep buzzing every 20 s until someone presses OK (at most 3 minutes).
  useEffect(() => {
    if (ringing.length === 0 || nativeAlarmsAvailable()) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      if (Date.now() - started > 180_000) return window.clearInterval(id);
      ping();
    }, 20_000);
    return () => window.clearInterval(id);
  }, [ringing.length]);

  if (!on) return null;

  // TESTING ONLY (25 Sep 2026): ring once in 10 s so a phone can be locked and checked. Remove after testing.
  const testAlarm = async () => {
    const ok = await scheduleTestAlarm(10).catch(() => false);
    if (!ok) return setBlocked('notifications');
    setTestNote('Test alarm in 10 seconds — lock the phone now.');
    window.setTimeout(() => {
      setTestNote(null);
      setRinging((r) => [...r, { key: `test:${Date.now()}`, at: Date.now(), activityId: '', title: 'Test alarm', body: 'Task alarms are working.' }]);
      if (!nativeAlarmsAvailable()) ping();
    }, 10_000);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void testAlarm()}
        className="fixed bottom-4 right-4 z-40 rounded-full border-2 px-4 font-head text-[14px] font-800 shadow-lg"
        style={{ minHeight: 48, background: 'var(--surface)', borderColor: 'var(--accent)', color: 'var(--accent-ink)' }}
      >
        🔔 Test alarm
      </button>
      {testNote && (
        <div className="px-4 py-2 text-[14px] font-600" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }} role="status">
          {testNote}
        </div>
      )}
      {blocked && (
        <div className="px-4 py-2 text-[14px] font-600" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }} role="status">
          {blocked === 'notifications'
            ? 'Task alarms are off: allow notifications for MushroomOS in the phone Settings → Apps → MushroomOS → Notifications.'
            : (
              <>
                Task alarms may ring late.{' '}
                <button type="button" className="underline font-700" onClick={() => void openExactAlarmSetting()}>
                  Allow “Alarms &amp; reminders”
                </button>
              </>
            )}
        </div>
      )}
      {ringing.length > 0 && (
        <div
          className="fixed inset-x-0 top-0 z-50 mx-auto max-w-[560px] space-y-2 p-3"
          role="alert"
          aria-live="assertive"
        >
          {ringing.map((a) => (
            <div
              key={a.key}
              className="flex items-start gap-3 rounded-xl border-2 px-4 py-3 shadow-lg"
              style={{ background: 'var(--surface)', borderColor: 'var(--crit)' }}
            >
              <span aria-hidden className="text-[22px]">⏰</span>
              <div className="min-w-0 flex-1">
                <p className="font-head text-[15px] font-800">{a.title}</p>
                <p className="text-[14px] text-ink-2">{a.body}</p>
              </div>
              <button
                type="button"
                onClick={() => setRinging((r) => r.filter((x) => x.key !== a.key))}
                className="rounded font-head text-[15px] font-800"
                style={{ minHeight: 48, minWidth: 64, background: 'var(--crit)', color: '#fff' }}
              >
                OK
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default TaskAlarms;
