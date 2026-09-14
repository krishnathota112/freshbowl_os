import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { loadAdminToday } from '../api/adminToday';
import { getFactoryClock } from '../../../shared/api/batch';
import { factoryDate } from '../../../shared/ui/composite/geometry';
import { PageHeading } from '../../../shared/ui/layout/PageHeading';
import { Card, Chip, EmptyState, Skeleton } from '../../../shared/ui/primitives';
import { nowMs } from '../../../shared/utilities/now';
import { LabGateBoard, LiveBatches } from '../../../shared/ui/domain/AdminLive';
import { listBatchContexts } from '../../../shared/api/work';
import { loadLabApprovals } from '../../lab/api/lab';

/*
 * C4 HAS LANDED, so these point at `/batch/:id` — the shared management batch page.
 *
 * They pointed at `/admin/batch/:id` until it existed, deliberately: a link to a planned route is a
 * dead link, and a dead link on the home screen of the person the product is for is not an
 * acceptable way to stage a rename. `/admin/batch/:id` is still a redirect for anything that kept
 * the old address.
 *
 * `/admin/batch/:id/schedule` is unchanged — ScheduleBuilder has not moved.
 */

/**
 * S4 · Admin's home.  `UI_IMPLEMENTATION_PLAN §S4`.
 *
 * WHAT STARTS TODAY · WHAT IS RUNNING · WHAT NEEDS ME.
 *
 * The previous version of this screen rendered `Process definition`, `Activity templates`,
 * `Evidence requirements` and `Gates shipped disabled` — process-engine metadata on a factory
 * manager's home screen. Those counts still exist, on `/admin/reference` and
 * `/admin/process-explorer`, which is where someone goes to ask about the process rather than
 * about today.
 *
 * NOTHING HERE IS A CHART OR A TOTAL. A count that cannot be acted on is not information a
 * manager needs at 6am; every row on this screen names one batch and one thing to do about it.
 */
export function AdminToday() {
  const clock = useQuery({ queryKey: ['factory-clock'], queryFn: getFactoryClock });

  // Today in the FACTORY's timezone. An admin travelling, or a browser on a different zone, must
  // still see the factory's day — `TIME_CONTRACT §3.2`. `factoryDate` is the one implementation.
  const today = clock.data?.timezone ? factoryDate(nowMs(), clock.data.timezone).iso : null;

  /*
   * The route fetches; the panels take props. `uiFoundations.test.ts` A10 enforces that an L1–L3
   * component may neither import `api/` nor hold a query — only a route may know where data comes
   * from. A first version put these two `useQuery` calls inside the panel component and the suite
   * caught it.
   */
  const live = useQuery({
    queryKey: ['batch-contexts'],
    queryFn: listBatchContexts,
    refetchInterval: 60_000,
  });
  const approvals = useQuery({
    queryKey: ['lab-approvals'],
    queryFn: loadLabApprovals,
    refetchInterval: 60_000,
  });

  const q = useQuery({
    queryKey: ['admin-today', today],
    queryFn: () => loadAdminToday(today as string),
    enabled: Boolean(today),
    refetchInterval: 60_000,
  });

  if (clock.isLoading || q.isLoading) {
    return (
      <>
        <PageHeading title="Today" subtitle="What starts, what is running, what needs you" />
        <Skeleton label="Loading today" />
        <Skeleton label="Loading today" />
      </>
    );
  }

  if (!clock.data?.timezone) {
    return (
      <>
        <PageHeading title="Today" subtitle="What starts, what is running, what needs you" />
        <EmptyState
          title="The factory clock has no timezone"
          detail="Today's date depends on the factory's own zone, and no batch can be created without it. Run set_factory_timezone once, then reload."
        />
      </>
    );
  }

  if (q.error) {
    return (
      <>
        <PageHeading title="Today" subtitle="What starts, what is running, what needs you" />
        <EmptyState
          title="Could not read today"
          detail={`${(q.error as Error).message}. Nothing has been changed — try again.`}
        />
      </>
    );
  }

  const d = q.data!;
  // `FactoryDate` carries the parts rather than a formatted string, deliberately — the ISO date is
  // built from NUMERIC parts so a locale rendering "Sept" cannot corrupt it. Composed here.
  const f = factoryDate(nowMs(), clock.data.timezone);
  const dayLabel = `${f.weekday} ${f.dayOfMonth} ${f.month}`;

  return (
    <>
      <PageHeading
        title="Today"
        subtitle={dayLabel}
        right={<Chip tone="lock">{clock.data.timezone}</Chip>}
      />

      {/* ── STARTING TODAY ─────────────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="mb-2 font-head text-[12px] font-700 uppercase tracking-wider text-muted">
          Starting today
        </h2>
        {d.startingToday.length === 0 ? (
          <EmptyState
            title="Nothing is due to start today."
            detail="A batch appears here on its Day 0. Create one from + New Batch when the schedule calls for it."
          />
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {d.startingToday.map((b: any) => (
              <Card key={b.batchId} className="p-3" rail={b.overdue ? 'var(--crit)' : 'var(--accent)'}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-head text-[15px] font-800">{b.code}</span>
                  {b.overdue && <Chip tone="crit">Day 0 was {b.startDate}</Chip>}
                </div>
                <p className="mt-0.5 text-[12px] text-muted">
                  {b.label}
                  {b.supervisor ? ` · ${b.supervisor}` : ''}
                </p>
                <p className="mt-2 text-[12px]">
                  {b.blockingCount === 0 ? (
                    <span style={{ color: 'var(--ok)' }}>Ready to activate</span>
                  ) : (
                    <span style={{ color: 'var(--warn)' }}>
                      {b.blockingCount} thing{b.blockingCount > 1 ? 's' : ''} to settle before it can
                      start
                    </span>
                  )}
                </p>
                <Link
                  to={`/admin/batch/${b.batchId}/schedule`}
                  className="mt-2 inline-flex items-center rounded border px-3 font-head text-[12px] font-700"
                  style={{
                    minHeight: 40,
                    borderColor: 'var(--accent)',
                    color: 'var(--accent-ink)',
                    background: 'var(--accent-soft)',
                  }}
                >
                  Open the plan
                </Link>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── RUNNING ────────────────────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="mb-2 font-head text-[12px] font-700 uppercase tracking-wider text-muted">
          Running
        </h2>
        {d.running.length === 0 ? (
          <EmptyState
            title="No batch is running."
            detail="A batch appears here once it is activated."
          />
        ) : (
          <div className="grid gap-2">
            {d.running.map((b: any) => (
              <Link
                key={b.batchId}
                to={`/batch/${b.batchId}`}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-md border px-3 py-2"
                style={{ borderColor: 'var(--line)', background: 'var(--surface)', minHeight: 44 }}
              >
                <span className="font-head text-[14px] font-700">{b.code}</span>
                {/*
                  Null is not zero. A batch with nothing recorded has not started, and rendering
                  "Day 0 · H0" would be a claim about progress that has not happened.
                */}
                {b.nowHour === null ? (
                  <span className="text-[12px] text-muted">not started yet</span>
                ) : (
                  <span className="mono text-[13px]">
                    Day {b.batchDayNo} · H{b.nowHour}
                    {b.baselineHours ? ` of ${b.baselineHours}` : ''}
                  </span>
                )}
                {b.flagCount > 0 && <Chip tone="warn">{b.flagCount} to look at</Chip>}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── NEEDS ME ───────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-2 font-head text-[12px] font-700 uppercase tracking-wider text-muted">
          Needs you
        </h2>
        {d.needsAdmin.length === 0 ? (
          <EmptyState
            title="Nothing is waiting on an Admin decision."
            detail="Blocking findings on a draft batch appear here — a rest with no duration, a reload into the bunker it came from, an activity with nobody assigned."
          />
        ) : (
          <div className="grid gap-2">
            {d.needsAdmin.map((b: any, i: number) => (
              <Card key={`${b.batchId}-${b.code}-${i}`} className="p-3" rail="var(--warn)">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  {/*
                    The MESSAGE, not the code. `validate_batch` already writes a sentence naming the
                    activity and what is wrong with it; showing `NO_ASSIGNEE` instead would be the
                    same mistake this screen was rewritten to remove.
                  */}
                  <span className="text-[13px]">{b.message}</span>
                  {/* 44 px — this is read on a phone as often as on a desktop now. */}
                  <Link
                    to={`/admin/batch/${b.batchId}/schedule`}
                    className="mono inline-flex items-center px-2 text-[11px] text-muted"
                    style={{ minHeight: 44 }}
                  >
                    {b.batchCode}
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/*
        RUNNING BATCHES and LAB GATES, from `v_batch_forecast` and `v_lab_approval_queue`.

        Both were absent from this screen. A batch's PROCESS, its calculated STANDARD, its H0 and
        its BASELINE were nowhere on the admin's home page, and neither was the fact that a lab
        submission can hold production shut indefinitely with nobody able to release it.
      */}
      <section className="mt-6">
        <h2 className="text-[12px] font-mono font-bold uppercase tracking-wider text-ink-2 px-1">
          Live batches
        </h2>
        <div className="mt-2">
          <LiveBatches batches={live.data} loading={live.isLoading} />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-[12px] font-mono font-bold uppercase tracking-wider text-danger px-1">
          Laboratory gates
        </h2>
        <div className="mt-2">
          <LabGateBoard approvals={approvals.data} loading={approvals.isLoading} />
        </div>
      </section>
    </>
  );
}
