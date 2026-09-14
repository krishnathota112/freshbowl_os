/**
 * The layout maths for the board and the rail. Pure — no React, no `api/`, no clock of its own.
 *
 * WHY THIS IS A SEPARATE MODULE. `UI_ACCEPTANCE_CRITERIA` B.4, B.5 and B.7 are stated as a manual
 * pass, and two of them are structural claims: bars are sorted by `startAt`, and there is **exactly
 * one** `now` line. A render test would count DOM nodes, and no DOM environment is installed. Making
 * the geometry a pure function is the stronger guarantee anyway: `nowLine` is a single value rather
 * than a list, so "exactly one" is enforced by the type and not by a count.
 *
 * ALL POSITIONS ARE FRACTIONS OF THE AXIS, in hours. Never a fraction of completion —
 * `UI_CONTROL_TOWER_SPEC §8.3` bans a batch percentage, and rule E.1 auto-fails the workstream for
 * it. A bar's width is how long the batch is, not how much of it is done.
 */

import type { BarSegment, BatchBar } from '../../domain/contracts';

const MS_PER_HOUR = 3_600_000;
const HOURS_PER_BATCH_DAY = 24;

/** How many segments one bar may draw. See `mergeSegments`. */
export const MAX_SEGMENTS_PER_BAR = 48;

// ─────────────────────────────────────────────────────────────────────────────────────────
// Factory-local calendar labels
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * A date as the FACTORY reads it, not as the viewer does.
 *
 * `TIME_CONTRACT §3.2`: a timestamptz renders in the viewer's zone, so a GM in another country would
 * see the staircase slide against the calendar axis. When the zone is unknown the caller gets
 * `null` and must render the stated marker — never a substitute.
 */
export type FactoryDate = { iso: string; weekday: string; dayOfMonth: string; month: string };

export function factoryDate(instant: string | number | Date, timezone: string): FactoryDate {
  const at = instant instanceof Date ? instant : new Date(instant);

  // TWO formatters, deliberately. The ISO date is built from NUMERIC parts; the labels come from a
  // second pass that may render however the locale likes.
  //
  // The first version derived the month number by looking the short name up in an array of twelve.
  // `en-GB` renders September as "Sept", not "Sep", so the lookup missed, and a `Math.max(0, …)`
  // fallback turned the miss into JANUARY — silently, for one month in twelve. The whole axis
  // collapsed to a negative span and the board rendered its empty state instead. A default where
  // there should have been a failure, which is the pattern rule 2 exists to prevent; there is now no
  // name-to-number mapping to get wrong.
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

// ─────────────────────────────────────────────────────────────────────────────────────────
// The shared calendar axis
// ─────────────────────────────────────────────────────────────────────────────────────────

export type CalendarAxis = {
  /** Absolute instants bounding the axis. */
  fromMs: number;
  toMs: number;
  spanHours: number;
  /** One tick per factory-local day, positioned as a fraction of the span. */
  ticks: { date: FactoryDate; pct: number; isToday: boolean }[];
  timezone: string;
};

/**
 * The axis every bar shares. This is what makes the staircase a staircase: one calendar, many
 * batches, each starting where its own H0 falls on it.
 *
 * Returns `null` when no bar has an H0 or the factory zone is unknown — the board then renders its
 * stated empty state rather than an axis it cannot label.
 */
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
  // `now` is always on the axis, so the line is never off the edge of the board.
  fromMs = Math.min(fromMs, nowMs);
  toMs = Math.max(toMs, nowMs);

  // Snap both ends OUT to a factory-local day boundary.
  //
  // Without this the first tick lands left of the axis and renders at a negative position, off the
  // edge of the board — the first version did exactly that. Snapping outward also means the board
  // begins and ends on a clean date, which is what a calendar axis should do.
  fromMs = startOfFactoryDay(fromMs, timezone);
  toMs = startOfFactoryDay(toMs, timezone) + HOURS_PER_BATCH_DAY * MS_PER_HOUR;

  const spanHours = (toMs - fromMs) / MS_PER_HOUR;
  if (!(spanHours > 0)) return null;

  const todayIso = factoryDate(nowMs, timezone).iso;
  const ticks: CalendarAxis['ticks'] = [];

  // One tick per factory-local day. Stepping by 24 h from the first day's start keeps the labels on
  // calendar dates, which §9.2 requires — the bars are batch-anchored, the axis is calendar-anchored,
  // and the two must not be mixed.
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

/** Midnight of the factory-local day containing `atMs`, as an absolute instant. */
function startOfFactoryDay(atMs: number, timezone: string): number {
  const d = factoryDate(atMs, timezone);
  // Find the offset the zone was at, then subtract the local time-of-day.
  const asUtc = Date.parse(`${d.iso}T00:00:00Z`);
  const probe = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(asUtc));
  const h = Number(probe.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(probe.find((p) => p.type === 'minute')?.value ?? '0');
  // If UTC midnight reads as HH:MM locally, local midnight is that many hours earlier.
  return asUtc - (((h % 24) * 60 + m) * 60_000);
}

/** `now`, as a single fraction of the axis. One value, so a board cannot draw two lines. */
export function nowLinePct(axis: CalendarAxis, nowMs: number): number {
  const pct = ((nowMs - axis.fromMs) / MS_PER_HOUR / axis.spanHours) * 100;
  return Math.min(100, Math.max(0, pct));
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Bars on the axis
// ─────────────────────────────────────────────────────────────────────────────────────────

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
  /** Null when the batch has no H0 — it is listed, not placed. */
  placement: { leftPct: number; widthPct: number; segments: PlacedSegment[] } | null;
  /** Position of `now` within THIS bar, as a fraction of the bar. Null when off the batch. */
  nowWithinBarPct: number | null;
};

/**
 * Bars in `startAt` order, oldest first, and **nothing re-sorts them afterwards**.
 *
 * `UI_CONTROL_TOWER_SPEC §9.1`: do not sort by name or status — sorting by start time is what
 * preserves the diagonal, and §9.3 lists "sorting that destroys the diagonal" as a thing the board
 * must never do. Exceptions are surfaced in the band above, not by reordering.
 *
 * A batch with no H0 cannot be placed on a calendar and sorts last, so an unplaced row never breaks
 * the diagonal of the ones that can be placed.
 */
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

/**
 * Coalesce a bar's segments so a full-length batch draws tens of elements, not hundreds.
 *
 * "Segments, not one element per hour" is not a micro-optimisation: a dozen rows at one node per hour
 * runs into thousands of elements, which is the difference between a board that scrolls and one that
 * stutters.
 * Adjacent segments of the same kind are merged, and anything left over past the cap is folded into
 * its predecessor rather than dropped — a bar must still cover its whole axis.
 */
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
      // Overlap between different kinds: the later one wins from where it starts.
      merged.push({ ...s, fromHour: last.toHour });
    } else {
      merged.push({ ...s });
    }
  }

  while (merged.length > MAX_SEGMENTS_PER_BAR) {
    // Fold the shortest segment into the one before it. Coverage is preserved.
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

// ─────────────────────────────────────────────────────────────────────────────────────────
// The rail — one batch, its own axis
// ─────────────────────────────────────────────────────────────────────────────────────────

export type RailTick = { hour: number; day: number; pct: number };

export type RailGeometry = {
  totalHours: number;
  /** Segments of the PLAN rail, as fractions of the batch's own axis. */
  plan: PlacedSegment[];
  /** How far the actual rail has got. Null when nothing has been recorded. */
  actualPct: number | null;
  /** Where the batch is by the clock. Null when it has no H0 or is outside its baseline. */
  nowPct: number | null;
  /** The forecast tail beyond `actualPct`, drawn dashed and lighter. Never mistakable for fact. */
  forecastFromPct: number | null;
  /** One tick per batch-day. `§10.1` — every 24 h, labelled with the batch-day. */
  ticks: RailTick[];
};

export function railGeometry(bar: BatchBar, nowMs: number): RailGeometry {
  const total = bar.clock.baselineHours;
  const plan = mergeSegments(bar.segments, total).map((s) => ({
    ...s,
    leftPct: ((s.fromHour - 1) / total) * 100,
    widthPct: ((s.toHour - s.fromHour) / total) * 100,
  }));

  // The actual rail reaches the end of recorded work — the last hour of a done segment, and nothing
  // beyond it. A rail drawn to `now` would claim work that has not been recorded.
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

/** The five meanings of `§8.5`, mapped once. No sixth colour, and rest is calm — `§8.4`. */
export const SEGMENT_TOKEN: Record<BarSegment['kind'], string> = {
  done: 'var(--ink-2)',
  in_progress: 'var(--accent)',
  resting: 'var(--inherit)',
  to_come: 'var(--line-2)',
};
