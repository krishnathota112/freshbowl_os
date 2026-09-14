import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  acceptWithDeviation,
  escalateDeviation,
  holdActivity,
  loadControlRoom,
  releaseActivity,
  returnActivity,
} from '../api/controlRoom';
import type {
  AwaitingRelease,
  Band as BandData,
  DeviationRow,
  LabFailure,
  UrgentGate,
} from '../../../domain/contracts';
import { PageHeading } from '../../../shared/ui/layout/PageHeading';
import {
  Band,
  BandNotBuilt,
  Card,
  Chip,
  ConflictMarker,
  Countdown,
  EmptyState,
  Skeleton,
} from '../../../shared/ui/primitives';
import { HumanDuration } from '../../../shared/ui/domain/HumanDuration';
import { nowMs } from '../../../shared/utilities/now';

/**
 * S11 · the Supervisor Control Room.  `UI_IMPLEMENTATION_PLAN §S11`,
 * `ROLE_AND_APPROVAL_MODEL §3.3`.
 *
 * ORDERED BY URGENCY, NOT BY BATCH — criterion 60. The batch board is last, deliberately: a
 * supervisor opens this to find what is stuck, not to browse batches.
 *
 * Every verdict acts IN PLACE with a mandatory reason — criterion 61. Nothing here navigates
 * away to decide, because a decision that costs a page load is a decision that gets postponed.
 *
 * The reason field is not validated here. `ROLE_AND_APPROVAL_MODEL §3.1` makes it mandatory and
 * the server refuses an empty one; a second opinion in the client is how the two drift apart. The
 * button is disabled while the box is empty as a courtesy, not as the rule.
 */

/** One verdict row: a reason, then the actions it enables. Two taps, no navigation. */
function Verdict({
  actions,
  busy,
  error,
}: {
  actions: { label: string; tone: 'ok' | 'warn' | 'crit'; run: (reason: string) => void; hint?: string }[];
  busy: boolean;
  error: string | null;
}) {
  const [reason, setReason] = useState('');
  const ready = reason.trim().length > 0;

  return (
    <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--line)' }}>
      <label className="flex flex-col gap-1">
        <span className="font-head text-[10px] font-600 uppercase tracking-wider text-muted">
          Reason — recorded verbatim, permanently
        </span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="what you decided, and why"
          className="w-full rounded border bg-surface px-2 py-2 text-[14px]"
          style={{ borderColor: 'var(--line-2)', color: 'var(--ink)', minHeight: 44 }}
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            disabled={!ready || busy}
            title={a.hint}
            onClick={() => a.run(reason.trim())}
            className="rounded border px-3 font-head text-[12px] font-700"
            style={{
              minHeight: 44,
              borderColor: `var(--${a.tone})`,
              color: ready && !busy ? `var(--${a.tone})` : 'var(--muted)',
              background: ready && !busy ? `var(--${a.tone}-soft)` : 'var(--surface-2)',
              opacity: ready && !busy ? 1 : 0.6,
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      {error && (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--crit)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Renders a band's contents, or states plainly that the band has no backend. */
function BandBody<T>({
  band,
  count,
  title,
  urgent,
  empty,
  render,
  defaultOpen,
}: {
  band: BandData<T>;
  count: (b: Extract<BandData<T>, { built: true }>) => number;
  title: string;
  urgent?: boolean;
  empty: string;
  render: (rows: T[]) => React.ReactNode;
  defaultOpen?: boolean;
}) {
  if (!band.built) {
    return (
      <Band title={title}>
        <BandNotBuilt releasedWith={band.releasedWith} why={band.why} />
      </Band>
    );
  }
  return (
    <Band title={title} count={count(band)} urgent={urgent} defaultOpen={defaultOpen ?? true}>
      {band.rows.length === 0 ? (
        <EmptyState title={empty} detail="" />
      ) : (
        render(band.rows)
      )}
    </Band>
  );
}

export function ControlRoom() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorFor, setErrorFor] = useState<Record<string, string | null>>({});

  const q = useQuery({
    queryKey: ['control-room'],
    queryFn: loadControlRoom,
    refetchInterval: 30_000,
  });

  const act = useMutation({
    mutationFn: async (job: { id: string; run: () => Promise<void> }) => {
      setBusyId(job.id);
      await job.run();
    },
    onSuccess: () => {
      setErrorFor({});
      qc.invalidateQueries({ queryKey: ['control-room'] });
      qc.invalidateQueries({ queryKey: ['tower'] });
    },
    onError: (e, job) => setErrorFor((m) => ({ ...m, [job.id]: (e as Error).message })),
    onSettled: () => setBusyId(null),
  });

  const run = (id: string, fn: () => Promise<void>) => act.mutate({ id, run: fn });

  if (q.isLoading) {
    return (
      <>
        <PageHeading title="Control Room" subtitle="Ordered by urgency, not by batch" />
        <Skeleton label="Loading the control room" />
        <Skeleton label="Loading the control room" />
      </>
    );
  }

  if (q.error) {
    return (
      <>
        <PageHeading title="Control Room" subtitle="Ordered by urgency, not by batch" />
        <EmptyState
          title="The control room could not be read"
          detail={`${(q.error as Error).message}. Nothing has been changed — try again.`}
        />
      </>
    );
  }

  const d = q.data!;
  const now = nowMs();

  return (
    <>
      <PageHeading
        title="Control Room"
        subtitle="Ordered by urgency, not by batch"
        right={<Chip tone="accent">supervisor</Chip>}
      />

      {/* 1 · The only genuinely time-critical band: a window that opens or expires soon. */}
      <BandBody<UrgentGate>
        band={d.timeCritical}
        title="Time-critical gates"
        urgent
        count={(b) => b.rows.length}
        empty="No rest window opens or expires in the next four hours."
        render={(rows) => (
          <div className="grid gap-2">
            {rows.map((g) => (
              <Card key={g.activityId} className="p-3" rail="var(--inherit)">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-head text-[13px] font-700">{g.title}</span>
                  <Link
                    to={`/batch/${g.batchId}`}
                    className="mono inline-flex items-center px-2 text-[11px] text-muted"
                    style={{ minHeight: 44 }}
                  >
                    {g.batchCode} · {g.scopeLabel}
                  </Link>
                </div>
                {/* The countdown never claims the gate opened. The server decides; this asks. */}
                <div className="mt-1">
                  <Countdown until={g.unblocksAt} />
                </div>
              </Card>
            ))}
          </div>
        )}
      />

      {/* 2 · Backed by B5. Only `fail` — a no_spec reading is not a failure (TBD-13). */}
      <BandBody<LabFailure>
        band={d.labIssues}
        title="Lab failures"
        urgent
        count={(b) => b.rows.length}
        empty="No lab result is outside its stated band."
        render={(rows) => (
          <div className="grid gap-2">
            {rows.map((l) => (
              <Card key={l.resultId} className="p-3" rail="var(--crit)">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-head text-[13px] font-700">
                    {l.parameterCode} {l.value}
                    {l.unit ? ` ${l.unit}` : ''}
                  </span>
                  {/* The band it missed, quoted rather than summarised. An em dash where a bound
                      genuinely has no source, never a substituted number. */}
                  <span className="mono text-[11px] text-muted">
                    spec {l.targetMin ?? '—'} – {l.targetMax ?? '—'}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-muted">
                  {l.checkpointCode} ·{' '}
                  <Link to={`/batch/${l.batchId}`} className="mono">
                    {l.batchCode}
                  </Link>
                  {l.version > 1 ? ` · v${l.version} after retest` : ''}
                  {l.technicianName ? ` · ${l.technicianName}` : ''}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {/* C-33 is open, so which map the number was filed under is part of the reading. */}
                  <Chip tone="lock">{l.checkpointMap}</Chip>
                  {l.conflictId && <ConflictMarker id={l.conflictId} />}
                </div>
              </Card>
            ))}
          </div>
        )}
      />

      {/* 3 · What actually needs a verdict. */}
      <BandBody<DeviationRow>
        band={d.openDeviations}
        title="Open deviations"
        urgent
        count={(b) => b.rows.length}
        empty="Nothing is awaiting a verdict."
        render={(rows) => (
          <div className="grid gap-2">
            {rows.map((v) => (
              <Card key={v.deviationId} className="p-3" rail="var(--crit)">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-head text-[13px] font-700">{v.summary}</span>
                  {v.conflictId && <ConflictMarker id={v.conflictId} />}
                </div>
                <p className="mt-1 text-[12px] text-muted">
                  {v.activityTitle ?? 'batch-level'}
                  {v.scopeLabel ? ` · ${v.scopeLabel}` : ''} ·{' '}
                  <Link to={`/batch/${v.batchId}`} className="mono">
                    {v.batchCode}
                  </Link>
                  {' · raised '}
                  <HumanDuration minutes={Math.round((now - Date.parse(v.raisedAt)) / 60_000)} />
                  {' ago'}
                  {v.raisedByName ? ` by ${v.raisedByName}` : ''}
                  {v.raisedByRole ? ` (${v.raisedByRole})` : ''}
                </p>

                {v.isProtected && (
                  <p className="mt-1 text-[12px]" style={{ color: 'var(--crit)' }}>
                    Protected gate — a supervisor cannot accept this. It has to go to the GM.
                  </p>
                )}

                <Verdict
                  busy={busyId === v.deviationId}
                  error={errorFor[v.deviationId] ?? null}
                  actions={
                    v.isProtected
                      ? [
                          {
                            label: 'Escalate to GM',
                            tone: 'warn',
                            run: (r) =>
                              run(v.deviationId, () => escalateDeviation(v.deviationId, r)),
                          },
                        ]
                      : [
                          {
                            label: 'Accept with deviation',
                            tone: 'warn',
                            hint: 'Waives this condition. The deviation stays on the record.',
                            run: (r) =>
                              run(v.deviationId, () => acceptWithDeviation(v.deviationId, r)),
                          },
                          {
                            label: 'Escalate to GM',
                            tone: 'crit',
                            run: (r) =>
                              run(v.deviationId, () => escalateDeviation(v.deviationId, r)),
                          },
                        ]
                  }
                />
              </Card>
            ))}
          </div>
        )}
      />

      {/* 4 · Every deviation on these has a verdict, so the server will accept a release. */}
      <BandBody<AwaitingRelease>
        band={d.awaitingRelease}
        title="Awaiting release"
        count={(b) => b.rows.length}
        empty="Nothing is waiting on a release."
        render={(rows) => (
          <div className="grid gap-2">
            {rows.map((a) => (
              <Card key={a.activityId} className="p-3" rail="var(--warn)">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-head text-[13px] font-700">{a.title}</span>
                  <Link
                    to={`/batch/${a.batchId}`}
                    className="mono inline-flex items-center px-2 text-[11px] text-muted"
                    style={{ minHeight: 44 }}
                  >
                    {a.batchCode} · {a.scopeLabel}
                  </Link>
                </div>
                <p className="mt-1 text-[12px] text-muted">
                  waiting{' '}
                  <HumanDuration minutes={Math.round((now - Date.parse(a.since)) / 60_000)} />
                  {a.acceptedCount > 0 &&
                    ` · ${a.acceptedCount} accepted deviation${a.acceptedCount > 1 ? 's' : ''} stay on the record`}
                </p>
                <Verdict
                  busy={busyId === a.activityId}
                  error={errorFor[a.activityId] ?? null}
                  actions={[
                    {
                      label: 'Release',
                      tone: 'ok',
                      run: (r) => run(a.activityId, () => releaseActivity(a.activityId, r)),
                    },
                    {
                      label: 'Hold',
                      tone: 'crit',
                      run: (r) => run(a.activityId, () => holdActivity(a.activityId, r)),
                    },
                    {
                      label: 'Return to operator',
                      tone: 'warn',
                      hint: 'Say what specifically to redo.',
                      run: (r) => run(a.activityId, () => returnActivity(a.activityId, r)),
                    },
                  ]}
                />
              </Card>
            ))}
          </div>
        )}
      />

      {/* 5 · No backend, and the missing piece was never storage. */}
      <BandBody<never>
        band={d.evidenceReview}
        title="Evidence review"
        count={(b) => b.rows.length}
        empty=""
        render={() => null}
      />

      {/* 6 · The board comes LAST. Criterion 60 — urgency, not batches. */}
      <BandBody
        band={d.activeBatches}
        title="Active batches"
        defaultOpen={false}
        count={(b) => b.rows.length}
        empty="No batch is running."
        render={(rows) => (
          <div className="grid gap-2 md:grid-cols-2">
            {rows.map((b) => (
              <Card key={b.batchId} className="p-3">
                <Link to={`/batch/${b.batchId}`} className="font-head text-[13px] font-700">
                  {b.code}
                </Link>
                <p className="mono mt-1 text-[11px] text-muted">
                  {b.nowHour === null
                    ? 'not started'
                    : `H${b.nowHour} of ${b.clock.baselineHours}`}
                </p>
              </Card>
            ))}
          </div>
        )}
      />
    </>
  );
}
