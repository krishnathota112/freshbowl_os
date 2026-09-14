/**
 * `NEEDS YOU` — the band above the calendar. `UI_CONTROL_TOWER_SPEC §9.1`/`§9.2`.
 *
 * L2/L3 — takes data as props. Also used by the Control Room (S11), which is why it lives here rather
 * than inside the tower route.
 *
 * THE ONE SENTENCE THIS COMPONENT EXISTS FOR, from §9.2:
 *
 *   "NEEDS YOU states the age of the wait. 'Waiting on you since 07:40 · 1h 34m' is the sentence
 *    that makes a GM act. A count badge is not."
 *
 * So every row states **how long a person has been the blocker** (B.2), spoken through
 * `HumanDuration` rather than printed as raw minutes (§8.2). Where the record carries no timestamp the
 * row says so — substituting `now` would render as "waiting 0m", which is a lie about the very number
 * the band exists to show.
 */

import type { Exception } from '../../domain/contracts';
import { HumanDuration } from '../domain/HumanDuration';
import { Card, Chip, ConflictMarker, EmptyState } from '../primitives';

export function ExceptionBand({
  exceptions,
  nowMs,
  onOpen,
  emptyDetail,
}: {
  exceptions: Exception[];
  /** Passed in, never read from the device — rule 6. */
  nowMs: number;
  onOpen?: (batchId: string, activityId: string) => void;
  emptyDetail: string;
}) {
  if (exceptions.length === 0) {
    return (
      <EmptyState
        title="Nothing is waiting on a person"
        detail={emptyDetail}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {exceptions.map((e) => {
        const sinceMs = e.since ? Date.parse(e.since) : NaN;
        const waitedMinutes = Number.isFinite(sinceMs) ? (nowMs - sinceMs) / 60_000 : null;

        return (
          <Card key={`${e.batchId}-${e.activityId}`} rail="var(--warn)" className="p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span aria-hidden style={{ color: 'var(--warn)' }}>
                    ⚠
                  </span>
                  <span className="mono text-[12px]">{e.batchCode}</span>
                  {e.conflictId && <ConflictMarker id={e.conflictId} />}
                </div>
                <p className="mt-1 text-[13px] leading-snug text-ink2">{e.what}</p>

                {/* B.2 — the age of the wait, and who it is waiting on. Not a timestamp. */}
                <p className="mt-1 text-[12px]">
                  {waitedMinutes === null ? (
                    <span className="text-muted">
                      Waiting on <strong>{e.whoIsWaiting}</strong> · no timestamp on the record, so
                      the age of this wait is not known
                    </span>
                  ) : (
                    <span style={{ color: 'var(--warn)' }}>
                      Waiting on <strong>{e.whoIsWaiting}</strong> for{' '}
                      <HumanDuration minutes={waitedMinutes} />
                    </span>
                  )}
                </p>
              </div>

              {onOpen && (
                <button
                  type="button"
                  onClick={() => onOpen(e.batchId, e.activityId)}
                  className="inline-flex shrink-0 items-center rounded border px-3 font-head text-[12px] font-600"
                  // 44 px, because the same build ships in the APK and a GM reads this on a phone.
                  style={{ minHeight: 44, borderColor: 'var(--warn)', color: 'var(--warn)' }}
                >
                  look at it
                </button>
              )}
            </div>
          </Card>
        );
      })}

      {/* Not a count badge — a statement of what the band is. §9.2. */}
      <p className="mono text-[10px] text-muted">
        <Chip tone="warn">needs you</Chip> ordered by longest wait first
      </p>
    </div>
  );
}
