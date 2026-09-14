import type { BarSegment, BatchBar } from '../../domain/contracts';

const MS_PER_HOUR = 3_600_000;
const HOURS_PER_BATCH_DAY = 24;

export const MAX_SEGMENTS_PER_BAR = 48;

export type FactoryDate = { iso: string; weekday: string; dayOfMonth: string; month: string };

export function factoryDate(instant: string | number | Date, timezone: string): FactoryDate {
  const at = instant instanceof Date ? instant : new Date(instant);

  const numeric = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);

  const labels = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).formatToParts(at);

  const pick = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  const year = pick(numeric, 'year');
  const month = pick(numeric, 'month');
  const day = pick(numeric, 'day');

  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
    throw new RangeError(
      `Could not read a calendar date for ${String(instant)} in ${timezone} — ` +
        `got year=${year} month=${month} day=${day}`
    );
  }

  return {
    iso: `${year}-${month}-${day}`,
    weekday: pick(labels, 'weekday'),
    dayOfMonth: pick(labels, 'day'),
    month: pick(labels, 'month'),
  };
}

export type CalendarAxis = {
  fromMs: number;
  toMs: number;
  spanHours: number;
  ticks: { date: FactoryDate; pct: number; isToday: boolean }[];
  timezone: string;
};

export function calendarAxis(bars: BatchBar[], nowMs: number): CalendarAxis | null {
  const placeable = bars.filter(
    (b): b is BatchBar & { clock: { startAt: string; timezone: string } } =>
      b.clock.startAt !== null && b.clock.timezone !== null
  );
  if (placeable.length === 0) return null;

  const timezone = placeable[0].clock.timezone;

  let fromMs = Infinity;
  let toMs = -Infinity;
  for (const b of placeable) {
    const start = Date.parse(b.clock.startAt);
    fromMs = Math.min(fromMs, start);
    toMs = Math.max(toMs, start + b.clock.baselineHours * MS_PER_HOUR);
  }
  fromMs = Math.min(fromMs, nowMs);
  toMs = Math.max(toMs, nowMs);

  fromMs = startOfFactoryDay(fromMs, timezone);
  toMs = startOfFactoryDay(toMs, timezone) + HOURS_PER_BATCH_DAY * MS_PER_HOUR;

  const spanHours = (toMs - fromMs) / MS_PER_HOUR;
  if (!(spanHours > 0)) return null;

  const todayIso = factoryDate(nowMs, timezone).iso;
  const ticks: CalendarAxis['ticks'] = [];

  for (let t = fromMs; t <= toMs; t += HOURS_PER_BATCH_DAY * MS_PER_HOUR) {
    const date = factoryDate(t, timezone);
    ticks.push({
      date,
      pct: ((t - fromMs) / MS_PER_HOUR / spanHours) * 100,
      isToday: date.iso === todayIso,
    });
  }

  return { fromMs, toMs, spanHours, ticks, timezone };
}

function startOfFactoryDay(atMs: number, timezone: string): number {
  const d = factoryDate(atMs, timezone);
  const asUtc = Date.parse(`${d.iso}T00:00:00Z`);
  const probe = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(asUtc));
  const h = Number(probe.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(probe.find((p) => p.type === 'minute')?.value ?? '0');
  return asUtc - (((h % 24) * 60 + m) * 60_000);
}

export function nowLinePct(axis: CalendarAxis, nowMs: number): number {
  const pct = ((nowMs - axis.fromMs) / MS_PER_HOUR / axis.spanHours) * 100;
  return Math.min(100, Math.max(0, pct));
}

export type PlacedSegment = {
  leftPct: number;
  widthPct: number;
  kind: BarSegment['kind'];
  label: string;
  fromHour: number;
  toHour: number;
};

export type PlacedBar = {
  bar: BatchBar;
  placement: { leftPct: number; widthPct: number; segments: PlacedSegment[] } | null;
  nowWithinBarPct: number | null;
};

export function sortByStartAt(bars: BatchBar[]): BatchBar[] {
  return [...bars].sort((a, b) => {
    const sa = a.clock.startAt === null ? Infinity : Date.parse(a.clock.startAt);
    const sb = b.clock.startAt === null ? Infinity : Date.parse(b.clock.startAt);
    if (sa !== sb) return sa - sb;
    return a.code.localeCompare(b.code);
  });
}

export function placeBars(bars: BatchBar[], axis: CalendarAxis | null, nowMs: number): PlacedBar[] {
  return sortByStartAt(bars).map((bar) => {
    if (axis === null || bar.clock.startAt === null) {
      return { bar, placement: null, nowWithinBarPct: null };
    }

    const startMs = Date.parse(bar.clock.startAt);
    const total = bar.clock.baselineHours;
    const leftPct = ((startMs - axis.fromMs) / MS_PER_HOUR / axis.spanHours) * 100;
    const widthPct = (total / axis.spanHours) * 100;

    const segments = mergeSegments(bar.segments, total).map((s) => ({
      ...s,
      leftPct: ((s.fromHour - 1) / total) * 100,
      widthPct: ((s.toHour - s.fromHour) / total) * 100,
    }));

    const elapsed = (nowMs - startMs) / MS_PER_HOUR;
    const nowWithinBarPct =
      elapsed >= 0 && elapsed <= total ? (elapsed / total) * 100 : null;

    return { bar, placement: { leftPct, widthPct, segments }, nowWithinBarPct };
  });
}

export function mergeSegments(segments: BarSegment[], totalHours: number): BarSegment[] {
  const clean = segments
    .filter((s) => s.toHour > s.fromHour)
    .map((s) => ({
      ...s,
      fromHour: Math.max(1, Math.min(s.fromHour, totalHours)),
      toHour: Math.max(1, Math.min(s.toHour, totalHours)),
    }))
    .sort((a, b) => a.fromHour - b.fromHour);

  const merged: BarSegment[] = [];
  for (const s of clean) {
    const last = merged.at(-1);
    if (last && last.kind === s.kind && s.fromHour <= last.toHour) {
      last.toHour = Math.max(last.toHour, s.toHour);
    } else if (last && s.fromHour < last.toHour) {
      merged.push({ ...s, fromHour: last.toHour });
    } else {
      merged.push({ ...s });
    }
  }

  while (merged.length > MAX_SEGMENTS_PER_BAR) {
    let shortest = 1;
    for (let i = 1; i < merged.length; i += 1) {
      if (merged[i].toHour - merged[i].fromHour < merged[shortest].toHour - merged[shortest].fromHour) {
        shortest = i;
      }
    }
    merged[shortest - 1].toHour = merged[shortest].toHour;
    merged.splice(shortest, 1);
  }

  return merged;
}

export type RailTick = { hour: number; day: number; pct: number };

export type RailGeometry = {
  totalHours: number;
  plan: PlacedSegment[];
  actualPct: number | null;
  nowPct: number | null;
  forecastFromPct: number | null;
  ticks: RailTick[];
};

export function railGeometry(bar: BatchBar, nowMs: number): RailGeometry {
  const total = bar.clock.baselineHours;
  const plan = mergeSegments(bar.segments, total).map((s) => ({
    ...s,
    leftPct: ((s.fromHour - 1) / total) * 100,
    widthPct: ((s.toHour - s.fromHour) / total) * 100,
  }));

  const lastDone = mergeSegments(bar.segments, total)
    .filter((s) => s.kind === 'done' || s.kind === 'in_progress')
    .reduce<number | null>((acc, s) => Math.max(acc ?? 0, s.toHour), null);
  const actualPct = lastDone === null ? null : (lastDone / total) * 100;

  const nowPct =
    bar.clock.startAt === null
      ? null
      : clampPct(((nowMs - Date.parse(bar.clock.startAt)) / MS_PER_HOUR / total) * 100);

  const ticks: RailTick[] = [];
  for (let h = 1; h <= total; h += HOURS_PER_BATCH_DAY) {
    ticks.push({
      hour: h,
      day: Math.floor((h - 1) / HOURS_PER_BATCH_DAY),
      pct: ((h - 1) / total) * 100,
    });
  }

  return {
    totalHours: total,
    plan,
    actualPct,
    nowPct,
    forecastFromPct: actualPct !== null && actualPct < 100 ? actualPct : null,
    ticks,
  };
}

function clampPct(pct: number): number | null {
  if (!Number.isFinite(pct)) return null;
  if (pct < 0 || pct > 100) return null;
  return pct;
}

export const SEGMENT_TOKEN: Record<BarSegment['kind'], string> = {
  done: 'var(--ink-2)',
  in_progress: 'var(--accent)',
  resting: 'var(--inherit)',
  to_come: 'var(--line-2)',
};
