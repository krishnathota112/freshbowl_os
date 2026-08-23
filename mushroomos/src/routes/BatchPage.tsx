import { lazy, Suspense, useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { loadBatchPage } from '../api/batchPage';
import type { BatchPageData, BatchVariance } from '../domain/contracts';
import { EventStream } from '../components/composite/EventStream';
import { HourRail } from '../components/composite/HourRail';
import { Narrative } from '../components/composite/Narrative';
import { PlayheadProvider, usePlayhead } from '../components/domain/PlayheadContext';
import { humanDuration } from '../components/domain/HumanDuration';
import { PageHeading } from '../components/layout/PageHeading';
import { Card, Chip, EmptyState, Skeleton } from '../components/primitives';
/*
  The activity list is LAZY, and stays lazy for the same reason `AppShell` is: the overview is the
  tab that opens, and `BatchDetail` drags `TaskDrawer` and the whole per-activity editing surface
  behind it. A GM who reads the rail and the paragraph and leaves never downloads any of it.
*/
const BatchDetail = lazy(() =>
  import('./BatchDetail').then((m) => ({ default: m.BatchDetail }))
);

/**
 * S2 · THE BATCH PAGE — the whole baseline on one axis.  `UI_IMPLEMENTATION_PLAN §S2`,
 * `UI_CONTROL_TOWER_SPEC §10`, §11, §13.
 *
 * The axis length is NOT written here, not even in prose. It comes from
 * `process_definition.baseline_hours`, which is a generated column, and `src/domain/time.test.ts`
 * scans this directory for the literal to keep it that way — non-negotiable rule 4. C-34 also
 * disputes whether the baseline is fixed at all, so a number in a comment would be taking a side.
 *
 * ONE BATCH, ONE PLAYHEAD, THREE VIEWS. The rail, the event stream and the paragraph all read the
 * same hour, and moving any of them moves the others. §13 calls that "the moment the product
 * explains itself"; it only holds because the position lives in `PlayheadProvider` and no view
 * keeps its own.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE ROUTE MOVE (C4)
 *
 * `/batch/:id` is the shared page for every management role, per `§1.1`: one page read at
 * different densities, never `/gm/batch/:id` beside `/admin/batch/:id`. The old admin path now
 * redirects here, so the links `AdminToday` and `Batches` were carrying — deliberately pointed at
 * the route that existed rather than the route that was planned — arrive in the right place
 * whether they are updated or not.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

type Tab = 'overview' | 'activities';

export function BatchPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'activities' ? 'activities' : 'overview';

  const q = useQuery({
    queryKey: ['batch-page', id],
    queryFn: () => loadBatchPage(id),
    refetchInterval: 60_000,
  });

  if (q.isLoading) {
    return (
      <>
        <PageHeading title="Batch" subtitle="Loading the hour axis" />
        <Skeleton label="Loading the rail" />
        <Skeleton label="Loading what happened" />
      </>
    );
  }

  if (q.error) {
    return (
      <>
        <PageHeading title="Batch" />
        <EmptyState
          title="Could not open this batch"
          detail={`${(q.error as Error).message} Nothing has been changed.`}
        />
      </>
    );
  }

  const d = q.data!;
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    if (t === 'overview') next.delete('tab');
    else next.set('tab', t);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeading
        title={`${d.bar.code} · ${d.label}`}
        subtitle={d.supervisor ? `supervisor ${d.supervisor}` : 'no supervisor named'}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={d.status === 'active' ? 'ok' : d.status === 'draft' ? 'inherit' : 'lock'}>
              {d.status}
            </Chip>
            <Link
              to={`/admin/batch/${id}/schedule`}
              className="rounded border px-3 py-2 font-head text-[12px] font-700"
              style={{ borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
            >
              {d.status === 'draft' ? 'Open the schedule' : 'View the schedule'}
            </Link>
          </div>
        }
      />

      <nav className="mb-4 flex gap-1" aria-label="Batch views">
        <TabButton current={tab} value="overview" onSelect={setTab}>
          Overview
        </TabButton>
        <TabButton current={tab} value="activities" onSelect={setTab}>
          Activities
        </TabButton>
      </nav>

      {tab === 'activities' ? (
        <Suspense fallback={<Skeleton label="Opening the activity list" lines={4} />}>
          <BatchDetail embedded />
        </Suspense>
      ) : (
        // `baselineHours` comes from `process_definition`, never a literal — invariant 8.
        <PlayheadProvider
          baselineHours={d.bar.clock.baselineHours}
          initialHour={initialHour(params.get('h'), d.bar.nowHour)}
        >
          <Overview data={d} nowMs={q.dataUpdatedAt} />
        </PlayheadProvider>
      )}
    </>
  );
}

/**
 * Where the playhead starts: the deep link if there is one, else where the batch is NOW.
 *
 * Not hour 1. A GM opening a batch on Day 12 wants Day 12; the provider clamps anything out of
 * range, so a stale or hand-edited `?h=` cannot put the page off its own axis.
 */
function initialHour(fromUrl: string | null, nowHour: number | null): number {
  const parsed = fromUrl === null ? Number.NaN : Number.parseInt(fromUrl, 10);
  if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  return nowHour ?? 1;
}

function TabButton({
  current,
  value,
  onSelect,
  children,
}: {
  current: Tab;
  value: Tab;
  onSelect: (t: Tab) => void;
  children: React.ReactNode;
}) {
  const on = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-current={on ? 'page' : undefined}
      className="rounded-t border-b-2 px-3 font-head text-[12px] font-700"
      style={{
        minHeight: 40,
        borderColor: on ? 'var(--accent)' : 'transparent',
        color: on ? 'var(--accent-ink)' : 'var(--muted)',
      }}
    >
      {children}
    </button>
  );
}

/* ── the overview, inside the provider so every child shares one hour ────────────────────────── */

function Overview({ data, nowMs }: { data: BatchPageData; nowMs: number }) {
  const play = usePlayhead();
  const [params, setParams] = useSearchParams();

  // `?h=` follows the playhead so the hour is deep-linkable — criterion 6, a bar clicked on the
  // tower opens the batch AT that hour. `replace` rather than push: scrubbing must not fill the
  // back button with one entry per hour.
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (next.get('h') === String(play.hour)) return;
    next.set('h', String(play.hour));
    setParams(next, { replace: true });
    // `params`/`setParams` deliberately out of the dependency list: including them re-runs this on
    // every URL change, including the one it just made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play.hour]);

  // Arrow keys move an hour, Shift+arrow a batch-day. Criterion 15.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === 'ArrowRight') (e.shiftKey ? play.stepDay : play.step)(1);
      else if (e.key === 'ArrowLeft') (e.shiftKey ? play.stepDay : play.step)(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [play]);

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-4">
        {/*
          `nowMs` is the moment THIS DATA was fetched, not the moment of this render.

          `Date.now()` inline would be a new value every render, which defeats `railGeometry`'s
          memo and makes the now-marker jitter against segments computed from an older read.
          `Date.now()` memoised on `[]` has the opposite fault: the marker freezes at mount and the
          60-second refetch moves the rows underneath it while the clock stays put. The query's own
          `dataUpdatedAt` is stable between renders and advances with the data — the one value that
          keeps the marker and the segments describing the same instant.
        */}
        <HourRail
          bar={data.bar}
          nowMs={nowMs}
          varianceMinutes={data.variance.varianceMinutes}
          onScrubToHour={play.setHour}
        />
      </Card>

      <WhereTheTimeWent variance={data.variance} onScrubToHour={play.setHour} />

      {/*
        The paragraph before the stream on a narrow screen and beside it on a wide one — §S2's
        responsive note: "the narrative is shown first because it is the most useful thing on a
        phone."
      */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-4">
          <SectionLabel>What has happened, in one paragraph</SectionLabel>
          <Narrative bar={data.bar} variance={data.variance} onScrubToHour={play.setHour} />
        </Card>

        <Card className="p-4">
          <SectionLabel>
            Every event · playhead at H{play.hour} of {play.baselineHours}
          </SectionLabel>
          <EventStream bar={data.bar} events={data.events} />
        </Card>
      </div>
    </div>
  );
}

/**
 * `WHERE THE TIME WENT`. §S2 item 4: ranked, **capped at three lines plus a remainder**.
 *
 * The cap and the worst-stream filter both happen in `loadBatchPage`, not here — a component that
 * did its own ranking would eventually disagree with the paragraph reading the same data.
 */
function WhereTheTimeWent({
  variance,
  onScrubToHour,
}: {
  variance: BatchVariance;
  onScrubToHour: (h: number) => void;
}) {
  if (variance.varianceMinutes === null) {
    return (
      <EmptyState
        title="Nothing has been measured on this batch yet"
        detail="An activity contributes here once it has both a planned end and a recorded one. Until then there is no comparison to make — which is not the same as being on plan."
      />
    );
  }

  if (variance.contributors.length === 0) {
    return (
      <EmptyState
        title="Every measured activity ran to plan"
        detail={`Measured on ${variance.measuredCount} of ${variance.activityCount} activities. Nothing has moved the clock in either direction.`}
      />
    );
  }

  return (
    <Card className="p-4">
      <SectionLabel>
        Where the time went · {variance.worstStream?.toLowerCase().replace(/_/g, ' ')} stream
      </SectionLabel>
      <ul className="flex flex-col divide-y" style={{ borderColor: 'var(--line)' }}>
        {variance.contributors.map((c) => (
          <li key={c.activityId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
            <button
              type="button"
              disabled={c.baselineStartHour === null}
              onClick={() => c.baselineStartHour !== null && onScrubToHour(c.baselineStartHour)}
              className="flex-1 text-left text-[13px] disabled:cursor-default"
              style={{ color: 'var(--ink)' }}
            >
              {c.title} · {c.scopeLabel}
            </button>
            <span
              className="mono tabular-nums text-[13px] font-600"
              style={{ color: c.varianceMinutes > 0 ? 'var(--warn)' : 'var(--ok)' }}
            >
              {c.varianceMinutes > 0 ? '' : '−'}
              {humanDuration(c.varianceMinutes)}
            </span>
            <span className="w-full text-[12px] text-muted">
              {/* The recorded reason, or the absence of one — which is itself the finding. */}
              {c.cause ?? 'no reason recorded'}
            </span>
          </li>
        ))}
        {variance.remainderMinutes !== 0 && (
          <li className="flex items-baseline justify-between py-2 text-[12px] text-muted">
            <span>everything else in this stream</span>
            <span className="mono tabular-nums">
              {variance.remainderMinutes > 0 ? '' : '−'}
              {humanDuration(variance.remainderMinutes)}
            </span>
          </li>
        )}
      </ul>
    </Card>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 font-head text-[10px] font-700 uppercase tracking-wider text-muted">
      {children}
    </h2>
  );
}
