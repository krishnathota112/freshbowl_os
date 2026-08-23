/**
 * The batch clock.
 *
 * `docs/TIME_CONTRACT.md` is normative; this module implements §1.3. Read it before changing
 * anything here — the contract was frozen at T0, and a change to it is a conflict-register
 * entry and a migration, not an edit.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE DISTINCTION THAT MATTERS — TIME_CONTRACT §1.2
 *
 *   H0        H1        H2                                    H(n-1)     H(n)
 *   ├─────────┼─────────┼───  …  ───────────────────────────────┼─────────┤
 *   │ hour 1  │ hour 2  │                                     │ hour n  │
 *
 * The factory's own grid (`mails/Book1.xlsx`) numbers HOURS `1…N`. Each of those is an
 * INTERVAL — hour n is `[H(n-1), H(n))`. `H<n>` is an INSTANT. They are not the same number.
 *
 *   wallClock(n)    → the START of hour n   = startAt + (n-1) hours
 *   batchInstant(n) → the instant H<n>      = startAt + n hours
 *
 * Code that conflates the two is one hour wrong on every row in the system, and it is wrong
 * consistently, so nothing looks broken. Hence two separate functions with two separate names.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * NO BASELINE CONSTANT LIVES HERE. `src/domain/` is a pure layer (ARCHITECTURE_V2 §9): it
 * cannot read `process_definition`, and a module-level constant is exactly how a hard-coded
 * process length gets back in. None of these functions needs the baseline. Where a range check
 * does, it takes it as a parameter from the layer that actually read it — `isWithinBaseline`.
 *
 * NO TIMEZONE LIVES HERE EITHER. Every function returns an instant or a pure index, so all of
 * this is DST-safe by construction. Formatting an instant into factory-local wall clock is
 * `TimeLabel`'s job (C1), and the factory zone is unresolved — TBD-50.
 *
 * TBD-47 IS ANSWERED BY THE GRID ITSELF — see `time.test.ts`. The workbook uses hour-of-day
 * slot 24, which only exists if slot k covers `[k-1:00, k:00)`. Under the other reading, slot 24
 * would need an hour-of-day 24 and the instant rolls into the next date instead. Reading A
 * reproduces all 1,656 cells; reading B fails 69 of them. So H0 falls at **05:00** factory time.
 *
 * TBD-50 remains open: 05:00 in WHICH timezone, and does that zone observe DST. That is why
 * `startAt` is still always supplied by the caller and never derived in here — this module
 * takes an instant and never a wall-clock reading.
 */

const MS_PER_HOUR = 3_600_000;

/**
 * Hours in a batch-day. This is a property of the calendar, not of the process — the process
 * length is data and never appears in this module.
 */
const HOURS_PER_BATCH_DAY = 24;

/** Anything that can name a moment. Normalised on the way in. */
export type Instant = Date | string | number;

function toEpochMs(value: Instant, label: string): number {
  const ms =
    value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);

  if (!Number.isFinite(ms)) {
    throw new RangeError(`${label} is not a valid instant: ${String(value)}`);
  }
  return ms;
}

function assertHour(hour: number, label: string): void {
  if (!Number.isInteger(hour)) {
    throw new RangeError(`${label} must be a whole number, received ${hour}`);
  }
  // Book1 numbers hours from 1. There is no hour 0 and no negative hour: H0 is the instant the
  // batch begins, and nothing in the batch precedes it.
  if (hour < 1) {
    throw new RangeError(`${label} is 1-based; received ${hour}`);
  }
}

/**
 * Which Book1 hour does this instant fall in?
 *
 * 1-based interval index: an instant exactly at H0 is in hour 1, and an instant one second
 * before H1 is still in hour 1.
 *
 * Throws for an instant before `startAt`. A negative batch hour has no meaning, and returning
 * one silently would push a clock-skew bug downstream into a timeline that looks plausible.
 */
export function batchHour(at: Instant, startAt: Instant): number {
  const elapsed = toEpochMs(at, 'at') - toEpochMs(startAt, 'startAt');

  if (elapsed < 0) {
    throw new RangeError(
      `Instant precedes the batch start by ${Math.abs(elapsed) / MS_PER_HOUR} h — ` +
        'nothing in a batch happens before H0'
    );
  }
  return Math.floor(elapsed / MS_PER_HOUR) + 1;
}

/**
 * The instant `H<h>` — the point scale, not the interval scale.
 *
 * `batchInstant(0)` is the batch start; `batchInstant(baselineHours)` is the instant the
 * baseline ends. Note this accepts 0, where the hour functions do not: H0 is a real instant,
 * hour 0 is not a real hour.
 */
export function batchInstant(h: number, startAt: Instant): Date {
  if (!Number.isInteger(h)) {
    throw new RangeError(`h must be a whole number, received ${h}`);
  }
  if (h < 0) {
    throw new RangeError(`h must not be negative; received ${h}`);
  }
  return new Date(toEpochMs(startAt, 'startAt') + h * MS_PER_HOUR);
}

/**
 * The instant Book1 hour `hour` begins — i.e. `H(hour-1)`.
 *
 * This is the function that maps a grid cell to a wall-clock moment, and the `-1` is the whole
 * reason it exists separately from `batchInstant`.
 */
export function wallClock(hour: number, startAt: Instant): Date {
  assertHour(hour, 'hour');
  return new Date(toEpochMs(startAt, 'startAt') + (hour - 1) * MS_PER_HOUR);
}

/**
 * Which batch-day does this hour belong to? Day 0 is hours 1…24.
 *
 * A batch-day is `[H0 + 24n, H0 + 24(n+1))`. It never coincides with a calendar date — the
 * factory's grid starts a batch five or six hours into the day (TBD-47) — so grouping by
 * `date_trunc('day', …)` or by a rendered date string is a bug. TIME_CONTRACT §1.4.
 */
export function batchDay(hour: number): number {
  assertHour(hour, 'hour');
  return Math.floor((hour - 1) / HOURS_PER_BATCH_DAY);
}

/**
 * Is this hour inside the baseline?
 *
 * `baselineHours` is a PARAMETER, supplied by the caller that read it from
 * `process_definition`. It is deliberately not a constant in this module — see the header.
 */
export function isWithinBaseline(hour: number, baselineHours: number): boolean {
  assertHour(hour, 'hour');
  if (!Number.isInteger(baselineHours) || baselineHours < 1) {
    throw new RangeError(`baselineHours must be a positive whole number, received ${baselineHours}`);
  }
  return hour <= baselineHours;
}
