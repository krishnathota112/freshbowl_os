import type { Exception } from '../../domain/contracts';
import { HumanDuration } from '../../shared/ui/domain/HumanDuration';
import { Card, Chip, ConflictMarker, EmptyState } from '../../shared/ui/primitives';

export function ExceptionBand({
  exceptions,
  nowMs,
  onOpen,
  emptyDetail,
}: {
  exceptions: Exception[];
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
                  style={{ minHeight: 44, borderColor: 'var(--warn)', color: 'var(--warn)' }}
                >
                  look at it
                </button>
              )}
            </div>
          </Card>
        );
      })}

      <p className="mono text-[10px] text-muted">
        <Chip tone="warn">needs you</Chip> ordered by longest wait first
      </p>
    </div>
  );
}
