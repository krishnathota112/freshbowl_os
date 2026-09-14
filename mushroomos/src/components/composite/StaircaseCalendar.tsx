import { useMemo } from 'react';

import type { BatchBar } from '../../domain/contracts';
import { Chip, EmptyState } from '../primitives';
import { SEGMENT_TOKEN, calendarAxis, nowLinePct, placeBars } from './geometry';

export function StaircaseCalendar({
  bars,
  nowMs,
  onOpenAtHour,
}: {
  bars: BatchBar[];
  nowMs: number;
  onOpenAtHour?: (batchId: string, hour: number) => void;
}) {
  const axis = useMemo(() => calendarAxis(bars, nowMs), [bars, nowMs]);
  const placed = useMemo(() => placeBars(bars, axis, nowMs), [bars, axis, nowMs]);

  if (bars.length === 0) {
    return (
      <EmptyState
        title="No batch is running"
        detail="The board fills the moment a batch is activated. Admin creates one at /admin/batch/start; activation freezes its baseline and opens whatever its gates allow."
      />
    );
  }

  if (axis === null) {
    return (
      <EmptyState
        title="No batch can be placed on a calendar yet"
        detail="A bar needs an H0 and the factory timezone to sit on a calendar axis. Until both are set, the batches exist but have no position — rendering them at an assumed zone would move every batch-day boundary."
      />
    );
  }

  const nowPct = nowLinePct(axis, nowMs);

  return (
    <div className="flex flex-col gap-2">
      <div className="hidden overflow-x-auto md:block">
        <div className="relative min-w-[640px] pt-6">
          <div className="absolute inset-x-0 top-0 h-5" aria-hidden>
            {axis.ticks.map((t) => (
              <span
                key={t.date.iso}
                className="absolute -translate-x-1/2 whitespace-nowrap mono text-[9px]"
                style={{
                  left: `${t.pct}%`,
                  color: t.isToday ? 'var(--accent)' : 'var(--muted)',
                  fontWeight: t.isToday ? 700 : 400,
                }}
              >
                {t.date.weekday} {t.date.dayOfMonth}
              </span>
            ))}
          </div>

          <div
            className="pointer-events-none absolute bottom-0 top-5 w-px"
            style={{ left: `${nowPct}%`, background: 'var(--accent)' }}
            aria-label="now"
            data-testid="board-now-line"
          />

          <div className="flex flex-col gap-1.5">
            {placed.map(({ bar, placement, nowWithinBarPct }) => (
              <div key={bar.batchId} className="flex items-center gap-2">
                <span className="w-32 shrink-0 truncate mono text-[11px]" title={bar.label}>
                  {bar.code}
                </span>
                <div className="relative h-5 flex-1">
                  {placement === null ? (
                    <span className="absolute inset-y-0 left-0 flex items-center text-[10px] text-muted">
                      no H0 — cannot be placed
                    </span>
                  ) : (
                    <div
                      className="absolute inset-y-0 overflow-hidden rounded-sm"
                      style={{ left: `${placement.leftPct}%`, width: `${placement.widthPct}%` }}
                    >
                      {placement.segments.map((s, i) => (
                        <button
                          key={`${s.kind}-${s.fromHour}-${i}`}
                          type="button"
                          onClick={() => onOpenAtHour?.(bar.batchId, s.fromHour)}
                          className="absolute inset-y-0 focus-visible:outline focus-visible:outline-2"
                          style={{
                            left: `${s.leftPct}%`,
                            width: `${s.widthPct}%`,
                            background: SEGMENT_TOKEN[s.kind],
                          }}
                          title={`${bar.code} · ${s.label} · H${s.fromHour}–H${s.toHour}`}
                          aria-label={`${bar.code}, ${s.label}, hour ${s.fromHour} to ${s.toHour}`}
                        />
                      ))}
                      {nowWithinBarPct !== null && (
                        <div
                          aria-hidden
                          className="absolute inset-y-0 w-px opacity-70"
                          style={{ left: `${nowWithinBarPct}%`, background: 'var(--surface)' }}
                        />
                      )}
                    </div>
                  )}
                </div>
                <span className="w-16 shrink-0 text-right">
                  {bar.flags.length > 0 && (
                    <Chip tone="warn" title={bar.flags.map((f) => f.note).join(' · ')}>
                      {bar.flags.length === 1 ? 'needs you' : `${bar.flags.length} flags`}
                    </Chip>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ul className="flex flex-col gap-2 md:hidden">
        {placed.map(({ bar, placement, nowWithinBarPct }) => (
          <li key={bar.batchId}>
            <button
              type="button"
              onClick={() => onOpenAtHour?.(bar.batchId, hourFromBarPct(bar, nowWithinBarPct))}
              className="flex w-full flex-col gap-1 rounded border p-2 text-left"
              style={{ borderColor: 'var(--line-2)' }}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="mono text-[12px]">{bar.code}</span>
                <span className="mono text-[10px] text-muted">
                  {bar.nowHour === null ? 'no position' : `H${bar.nowHour} of ${bar.clock.baselineHours}`}
                </span>
              </span>
              <span className="truncate text-[12px] text-ink2">{bar.label}</span>
              {placement !== null && (
                <span className="relative block h-3 w-full overflow-hidden rounded-sm" style={{ background: 'var(--surface-2)' }}>
                  {placement.segments.map((s, i) => (
                    <span
                      key={`${s.kind}-${s.fromHour}-${i}`}
                      className="absolute inset-y-0"
                      style={{
                        left: `${s.leftPct}%`,
                        width: `${s.widthPct}%`,
                        background: SEGMENT_TOKEN[s.kind],
                      }}
                    />
                  ))}
                </span>
              )}
              {bar.flags.length > 0 && (
                <span className="text-[11px]" style={{ color: 'var(--warn)' }}>
                  {bar.flags[0].note}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <Legend />
    </div>
  );
}

function hourFromBarPct(bar: BatchBar, pct: number | null): number {
  if (pct === null) return bar.nowHour ?? 1;
  return Math.max(1, Math.min(bar.clock.baselineHours, Math.round((pct / 100) * bar.clock.baselineHours)));
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mono text-[10px] text-muted">
      {(
        [
          ['done', 'recorded'],
          ['in_progress', 'happening now'],
          ['resting', 'resting — correct, just not yet'],
          ['to_come', 'still to come'],
        ] as const
      ).map(([kind, label]) => (
        <span key={kind} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2 w-4 rounded-sm"
            style={{ background: SEGMENT_TOKEN[kind] }}
          />
          {label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-3 w-px" style={{ background: 'var(--accent)' }} />
        now
      </span>
    </div>
  );
}
