/**
 * Day grouping for work lists. FORMATTING ONLY: the planned time comes from the server (the process's day
 * plan counted from H0, or from the onboarding position); this only says which calendar day it falls on,
 * in the phone's own clock.
 */

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** The end of today on this device. */
export function endOfToday(now: Date = new Date()): Date {
  const x = startOfDay(now);
  x.setDate(x.getDate() + 1);
  return x;
}

/** Due today or earlier (still open). Work without a planned time counts as due — nothing is hidden. */
export function isDueByToday(plannedStartAt: string | null, now: Date = new Date()): boolean {
  if (!plannedStartAt) return true;
  return new Date(plannedStartAt).getTime() < endOfToday(now).getTime();
}

/** "Today", "Tomorrow", or the date — for the day a planned time falls on. */
export function dayLabel(plannedStartAt: string | null, now: Date = new Date()): string {
  if (!plannedStartAt) return 'No planned day';
  const d = startOfDay(new Date(plannedStartAt)).getTime();
  const today = startOfDay(now).getTime();
  const days = Math.round((d - today) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return new Date(plannedStartAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
