import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

import { alarmId, isAlarmId, type TaskAlarm } from './planAlarms';

/**
 * Android: the alarms are scheduled ON THE PHONE (AlarmManager via @capacitor/local-notifications), so they ring
 * with sound and vibration when the app is closed or the screen is locked. Each refresh replaces the whole set:
 * a task that started, finished or moved drops or moves its alarm the next time the list is read.
 */
const CHANNEL = 'task-alarms';
let ready: Promise<boolean> | null = null;

export const nativeAlarmsAvailable = () => Capacitor.isNativePlatform();

function prepare(): Promise<boolean> {
  ready ??= (async () => {
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return false;
    await LocalNotifications.createChannel({
      id: CHANNEL,
      name: 'Task alarms',
      description: 'Rings 5 minutes before and after a task’s time',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
    });
    return true;
  })().catch(() => false);
  return ready;
}

/** Whether Android lets the alarms ring at the exact minute (Android 12+ "Alarms & reminders"). */
export async function exactAlarmsAllowed(): Promise<boolean> {
  if (!nativeAlarmsAvailable()) return true;
  try {
    return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted';
  } catch {
    return true;
  }
}

export async function openExactAlarmSetting() {
  try {
    await LocalNotifications.changeExactNotificationSetting();
  } catch {
    /* older Android: nothing to change */
  }
}

/** Replace every pending task alarm with this set. Returns false when notifications are not allowed. */
export async function syncNativeAlarms(alarms: TaskAlarm[]): Promise<boolean> {
  if (!nativeAlarmsAvailable()) return true;
  if (!(await prepare())) return false;
  const want = new Map(alarms.map((a) => [alarmId(a.key), a]));
  const pending = await LocalNotifications.getPending();
  const stale = pending.notifications.filter((n) => isAlarmId(n.id) && !want.has(n.id)).map((n) => ({ id: n.id }));
  if (stale.length) await LocalNotifications.cancel({ notifications: stale });
  if (want.size === 0) return true;
  await LocalNotifications.schedule({
    notifications: [...want.entries()].map(([id, a]) => ({
      id,
      title: `⏰ ${a.title}`,
      body: a.body,
      channelId: CHANNEL,
      schedule: { at: new Date(a.at), allowWhileIdle: true },
      extra: { activityId: a.activityId },
    })),
  });
  return true;
}

/** On sign-out: a shared phone must not ring for the previous person's work. */
export async function cancelAllNativeAlarms() {
  if (!nativeAlarmsAvailable()) return;
  try {
    const pending = await LocalNotifications.getPending();
    const mine = pending.notifications.filter((n) => isAlarmId(n.id)).map((n) => ({ id: n.id }));
    if (mine.length) await LocalNotifications.cancel({ notifications: mine });
  } catch {
    /* nothing scheduled */
  }
}

/** TESTING ONLY: one alarm in `seconds`, through the same channel as real task alarms. */
export async function scheduleTestAlarm(seconds = 10): Promise<boolean> {
  if (!nativeAlarmsAvailable()) return true;
  if (!(await prepare())) return false;
  await LocalNotifications.schedule({
    notifications: [{
      id: 699_999_999,
      title: '⏰ Test alarm',
      body: 'MushroomOS task alarms are working on this phone.',
      channelId: CHANNEL,
      schedule: { at: new Date(Date.now() + seconds * 1000), allowWhileIdle: true },
    }],
  });
  return true;
}
