/**
 * THE RAIL — one batch, its own axis. `UI_CONTROL_TOWER_SPEC §10`.
 *
 * The place the whole-batch-in-hours idea becomes physical. Two rails, not one bar: plan above, actual below, and
 * the slippage is the horizontal offset between them — visible without reading a number (§10.1).
 *
 * L3 — takes data as props. No query, no `api/`, no Supabase. It renders identically from a fixture
 * and from a live row, which is what lets the gallery be the regression surface.
 *
 * WHAT IT REFUSES TO DRAW
 *   · a percentage. §8.3 bans it on a batch, and rule E.1 auto-fails the workstream. Position on the
 *     axis is the only honest indicator, so the rail shows H-of-baseline and never a fraction done.
 *   · an actual rail reaching `now`. It reaches the end of RECORDED work. Drawing it to the clock
 *     would claim work nobody submitted.
 *   · a forecast that looks like a fact. The tail is dashed and lighter (§10.1).
 *   · a rest as trouble. Half the process is resting; §8.4 gives it the calm `inherit` token.
 */

import { useMemo } from 'react';

import type { BatchBar } from '../../domain/contracts';
import { TimeLabel } from '../domain/TimeLabel';
import { Variance } from '../domain/HumanDuration';
import { EmptyState } from '../primitives';
import { SEGMENT_TOKEN, railGeometry } from './geometry';

const HOURS_PER_BATCH_DAY = 24;

export function HourRail({
  bar,
  nowMs,
  varianceMinutes = null,
  onScrubToHour,
}: {
  bar: BatchBar;
  /** Passed in, never read from the device — rule 6, and it keeps the component pure. */
  nowMs: number;
  varianceMinutes?: number | null;
  onScrubToHour?: (hour: number) => void;
}) {
  const g = useMemo(() => railGeometry(bar, nowMs), [bar, nowMs]);

  if (bar.clock.startAt === null) {
    return (
      <EmptyState
        title="This batch has no H0, so it cannot be placed on the hour axis"
        detail={
          'H0 is the instant the batch clock starts, and it is mandatory. Until it is set, the batch '
          + 'has a plan but no position — validate_batch reports it as blocking and will not let the '
          + 'batch activate.'
        }
      />
    );
  }

  const nowHour =
    g.nowPct === null ? null : Math.min(g.totalHours, Math.floor((g.nowPct / 100) * g.totalHours) + 1);

  return (
    <div className="flex flex-col gap-3">
      {/* The three registers, plus the variance spoken. §8.1 and §8.2. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <TimeLabel
          startAt={bar.clock.startAt}
          hour={nowHour ?? 1}
          baselineHours={bar.clock.baselineHours}
          timezone={bar.clock.timezone}
          timezoneConflictId={bar.clock.timezoneConflictId}
          size="lg"
        />
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-head text-[10px] font-600 uppercase tracking-wider text-muted">
            against plan
          </span>
          <Variance minutes={varianceMinutes} absentLabel="nothing recorded yet" />
        </div>
      </div>

      {/* PLAN and ACTUAL as two rails. The offset between them IS the slippage. */}
      <div className="flex flex-col gap-1.5">
        <RailRow label="PLAN">
          <div className="relative h-4 w-full overflow-hidden rounded-sm" style={{ background: 'var(--surface-2)' }}>
            {g.plan.map((s, i) => (
              <div
                key={`${s.kind}-${s.fromHour}-${i}`}
                className="absolute inset-y-0"
                style={{
                  left: `${s.leftPct}%`,
                  width: `${s.widthPct}%`,
                  background: SEGMENT_TOKEN[s.kind],
                }}
                title={`${s.label} · H${s.fromHour}–H${s.toHour}`}
              />
            ))}
            {g.ticks.map((t) => (
              <div
                key={t.hour}
                aria-hidden
                className="absolute inset-y-0 w-px opacity-30"
                style={{ left: `${t.pct}%`, background: 'var(--surface)' }}
              />
            ))}
          </div>
        </RailRow>

        <RailRow label="ACTUAL">
          <div className="relative h-4 w-full rounded-sm" style={{ background: 'var(--surface-2)' }}>
            {g.actualPct === null ? (
              <span className="absolute inset-y-0 left-1 flex items-center text-[10px] text-muted">
                nothing submitted yet
              </span>
            ) : (
              <>
                <div
                  className="absolute inset-y-0 left-0 rounded-l-sm"
                  style={{ width: `${g.actualPct}%`, background: 'var(--ink-2)' }}
                  title={`recorded work reaches H${Math.round((g.actualPct / 100) * g.totalHours)}`}
                />
                {/*
                  The forecast tail. Dashed and lighter, deliberately: §10.1 — a forecast is not a
                  fact and must not look like one.
                */}
                {g.forecastFromPct !== null && (
                  <div
                    className="absolute inset-y-0 rounded-r-sm opacity-40"
                    style={{
                      left: `${g.forecastFromPct}%`,
                      right: 0,
                      backgroundImage:
                        'repeating-linear-gradient(90deg, var(--ink-2) 0 3px, transparent 3px 7px)',
                    }}
                    title="forecast — not recorded"
                  />
                )}
              </>
            )}
            {/* Where the batch is by the clock. One marker on its own rail. */}
            {g.nowPct !== null && (
              <div
                className="absolute -top-1 bottom-[-4px] w-0.5"
                style={{ left: `${g.nowPct}%`, background: 'var(--accent)' }}
                title="now"
              />
            )}
          </div>
        </RailRow>
      </div>

      {/* Day ticks read as batch-days AND the dates they cover, because the two axes do not align. */}
      <div className="relative h-4 w-full">
        {g.ticks
          .filter((_, i) => i % tickStride(g.ticks.length) === 0)
          .map((t) => (
            <button
              key={t.hour}
              type="button"
              onClick={() => onScrubToHour?.(t.hour)}
              className="absolute top-0 -translate-x-1/2 mono text-[9px] text-muted hover:underline focus-visible:outline focus-visible:outline-1"
              style={{ left: `${t.pct}%` }}
              title={`Day ${t.day} begins at H${t.hour - 1}`}
            >
              D{t.day}
            </button>
          ))}
      </div>

      <p className="mono text-[10px] leading-relaxed text-muted">
        H0 to H{g.totalHours} · one tick per batch-day. A batch-day is H0 + n&nbsp;&times;&nbsp;
        {HOURS_PER_BATCH_DAY}, which never coincides with a calendar date — the factory clock starts
        hours into the day.
      </p>
    </div>
  );
}

function RailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 font-head text-[10px] font-700 uppercase tracking-wider text-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Label every tick when there is room, then every other, then every fourth. */
function tickStride(count: number): number {
  if (count <= 12) return 1;
  if (count <= 26) return 2;
  return 4;
}
