/**
 * A batch hour never appears alone. `UI_CONTROL_TOWER_SPEC §8.1`.
 *
 *     Tue 6 AM             <- wall clock, largest. This is how a person thinks.
 *     Day 5 · H126         <- batch position, medium. This is how the process thinks.
 *     of <baselineHours>   <- scale, smallest. Read from process_definition, never written here.
 *
 * `H126` on its own is engineer language, so this component makes it impossible to render on its
 * own: `startAt` and `hour` are both required and there is no single-field form.
 * `UI_ACCEPTANCE_CRITERIA` A3 asserts that with a compile probe, in `tests/typeprobes/`.
 *
 * L2 — imports L1 and `src/domain/` only. It never touches `api/`, so it renders identically from a
 * fixture and from a live row.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHERE TBD-50 BITES, AND WHAT THIS DOES ABOUT IT
 *
 * `TIME_CONTRACT §3.2` says it plainly: the factory timezone matters only when an instant is
 * FORMATTED into factory-local wall clock, and that happens here. Registers 2 and 3 are pure
 * arithmetic on an hour index and need no zone at all.
 *
 * So when the zone is unknown, register 1 renders the marker and names the open question. It does
 * NOT fall back to the viewer's zone, which would render a different weekday for a GM in another
 * country and slide the whole staircase against the calendar axis. It does not fall back to UTC
 * either. `UI_ACCEPTANCE_CRITERIA` rule E.5 — no invented value — and `UI_DESIGN_SPEC §5`: the
 * stated empty state, never a plausible-looking substitute.
 *
 * NO TIME LITERAL APPEARS IN THIS FILE. H0's hour of day lives in `factory_clock`, and this
 * component only ever receives `startAt` as an instant. `UI_ACCEPTANCE_CRITERIA` A2.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

import { batchDay, wallClock } from '../../domain/time';
import { ConflictMarker } from '../primitives';

export type TimeLabelProps = {
  /** H0 as an absolute instant, ISO. Null while the factory timezone is unresolved. */
  startAt: string | null;
  /** The Book1 hour. 1-based on the interval scale — hour n runs `[H(n-1), H(n))`. */
  hour: number;
  /** `process_definition.baseline_hours`. Never a literal; register 3 has nothing to say without it. */
  baselineHours: number;
  /** IANA name from `factory_clock.timezone`. Null while TBD-50 is open. */
  timezone: string | null;
  /** Which conflict to name when `timezone` is null. */
  timezoneConflictId?: string | null;
  size?: 'sm' | 'md' | 'lg';
};

/** `Tue 6 AM` — weekday and hour, in the FACTORY's zone. Never the viewer's. */
function factoryWallClock(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    hour: 'numeric',
    hour12: true,
    timeZone: timezone,
  })
    .format(at)
    .replace(/\s+/g, ' ')
    .trim();
}

export function TimeLabel({
  startAt,
  hour,
  baselineHours,
  timezone,
  timezoneConflictId,
  size = 'md',
}: TimeLabelProps) {
  const wallSize = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-lg';
  const posSize = size === 'lg' ? 'text-sm' : size === 'sm' ? 'text-[11px]' : 'text-[12px]';
  const scaleSize = size === 'lg' ? 'text-[12px]' : 'text-[10px]';

  // Registers 2 and 3 are arithmetic on an hour index. They are always available.
  const day = hour >= 1 ? batchDay(hour) : null;

  // Register 1 needs both an instant and a zone to be true.
  const wall =
    startAt !== null && timezone !== null
      ? factoryWallClock(wallClock(hour, startAt), timezone)
      : null;

  return (
    <span className="flex flex-col gap-0.5 leading-tight">
      {wall !== null ? (
        <span className={`font-head ${wallSize} font-700`} style={{ color: 'var(--ink)' }}>
          {wall}
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <span className={`font-head ${wallSize} font-700 text-muted`}>—</span>
          {timezone === null ? (
            <ConflictMarker
              id={timezoneConflictId ?? 'TBD-50'}
              note="The factory timezone is unresolved, so this hour cannot be stated as a wall clock. Rendering the viewer's zone would move every batch-day boundary."
            />
          ) : (
            <span className="text-[11px] text-muted">H0 is not set for this batch</span>
          )}
        </span>
      )}

      <span className={`mono ${posSize}`} style={{ color: 'var(--ink-2)' }}>
        {day === null ? '—' : `Day ${day}`} · H{hour}
      </span>

      <span className={`mono ${scaleSize} text-muted`}>of {baselineHours}</span>
    </span>
  );
}
