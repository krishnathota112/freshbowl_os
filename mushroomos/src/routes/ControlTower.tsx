import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { PageHeading } from '../components/layout/PageHeading';
import { Card, EmptyState, Skeleton, Stat } from '../components/primitives';
import { ExceptionBand } from '../components/composite/ExceptionBand';
import { StaircaseCalendar } from '../components/composite/StaircaseCalendar';
import { loadTower } from '../api/tower';

/**
 * S1 · THE FACTORY CONTROL TOWER. `UI_CONTROL_TOWER_SPEC §9`, `UI_IMPLEMENTATION_PLAN §S1`.
 *
 * The home screen for the GM and the owner. Opens on **what is wrong**, then shows the shape of the
 * factory.
 *
 * IT REPLACES THE `CommandCenter` PLACEHOLDER, and what that promised versus what shipped is worth
 * recording rather than losing. It said "checkpoint decision packages appear here when a batch
 * reaches one". They do not. The GM checkpoint has nowhere to be recorded — `docs/REPORTS/B1.md §5`,
 * now owned by **B6** — so this screen shows the board and the exception band, and `TN-LOAD` stays
 * locked carrying its own reason. The placeholder was deleted rather than relabelled, because a screen
 * that states a thing it cannot do is worse than one that is missing. `/gm/command-center` redirects
 * here so the GM's bookmark still works. (This note lived in `routes/Placeholders.tsx` until C-FIELD
 * split that file into one module per route.)
 *
 * L4 — this route owns the query and the URL. Everything it draws is a composite that takes props, so
 * the board and the band are the same components the gallery exercises against fixtures.
 *
 * THE EIGHT RULES THIS SCREEN IS MEASURED BY — `UI_ACCEPTANCE_CRITERIA` B.1 to B.8:
 *
 *   B.1  exceptions ABOVE the calendar, and above the counters on mobile
 *   B.2  each exception states how long it has been waiting for a PERSON
 *   B.3  exactly four counters · no fifth number, no chart, no trend arrow
 *   B.4  bars sorted by startAt, diagonal at >=768 px          — StaircaseCalendar
 *   B.5  exactly one `now` line                                 — StaircaseCalendar
 *   B.6  clicking a bar opens that batch AT THAT HOUR, `?h=`
 *   B.7  375 px is a vertical list, no horizontal page scroll   — StaircaseCalendar
 *   B.8  no batch shows a percentage
 *
 * B.8 is structural rather than a thing this file remembers: there is no percentage anywhere in the
 * data it receives. `TowerCounters` has four integer fields, `BatchBar` carries hours, and the rail
 * geometry has no progress field — asserted in `tests/tower.test.ts`.
 */
export function ControlTower() {
  const navigate = useNavigate();
  const tower = useQuery({
    queryKey: ['tower'],
    queryFn: loadTower,
    // The board is a wall display as much as a page. Refetching keeps the `now` line honest without a
    // per-component timer — cross-cutting criterion 90.
    refetchInterval: 60_000,
  });

  const nowMs = Date.now();

  if (tower.isLoading) {
    return (
      <>
        <PageHeading title="Factory Control Tower" subtitle="What needs a decision, then the shape of the factory" />
        <Skeleton label="Reading every running batch and what each one is waiting on" lines={6} />
      </>
    );
  }

  if (tower.error) {
    return (
      <>
        <PageHeading title="Factory Control Tower" subtitle="What needs a decision, then the shape of the factory" />
        <EmptyState
          title="The board could not be read"
          detail={(tower.error as Error).message}
        />
      </>
    );
  }

  const { bars, counters, exceptions } = tower.data!;

  /** B.6 — the URL carries the hour, so the link is shareable and the playhead lands there. */
  const openAtHour = (batchId: string, hour: number) =>
    navigate(`/batch/${batchId}?h=${hour}`);

  return (
    <>
      <PageHeading
        title="Factory Control Tower"
        subtitle="What needs a decision, then the shape of the factory"
      />

      {/*
        B.1 · EXCEPTIONS FIRST, and first in the DOM as well as on screen.
        `UI_DESIGN_SPEC §4.6` — exception first. On mobile this is above the counters' fold because it
        is literally the first block; nothing is reordered by CSS to achieve it.
      */}
      <section className="mb-5" aria-labelledby="needs-you">
        <h2
          id="needs-you"
          className="mb-2 font-head text-sm font-800 uppercase tracking-wide"
          style={{ color: 'var(--warn)' }}
        >
          Needs you
        </h2>
        <ExceptionBand
          exceptions={exceptions}
          nowMs={nowMs}
          onOpen={(batchId) => navigate(`/batch/${batchId}`)}
          emptyDetail={
            bars.length === 0
              ? 'No batch is running, so nothing can be waiting. The band fills the moment an activity is held, returned or in deviation.'
              : 'Every running batch is either working or waiting on the clock. This band fills when an activity goes into deviation, is returned, or is blocked by one — the states where a person is the blocker.'
          }
        />
      </section>

      {/*
        B.3 · FOUR COUNTERS. §9.2 — "The counters at the top are the only KPIs. There is no fifth
        number and no chart." Each one carries its comparison, so none is a bare number
        (`UI_DESIGN_SPEC §5`).
      */}
      <section className="mb-5" aria-label="Counters">
        <Card className="p-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat
              label="Running"
              value={counters.running}
              compare="live batches, cancelled excluded"
              size="lg"
            />
            <Stat
              label="On plan"
              value={counters.onPlan}
              compare="nothing waiting on a person"
              size="lg"
              tone={counters.onPlan === counters.running ? 'ok' : undefined}
            />
            <Stat
              label="Needs a decision"
              value={counters.needsDecision}
              compare="in the band above"
              size="lg"
              tone={counters.needsDecision > 0 ? 'warn' : undefined}
            />
            <Stat
              label="Held"
              value={counters.held}
              compare="stopped until somebody releases it"
              size="lg"
              tone={counters.held > 0 ? 'crit' : undefined}
            />
          </div>
        </Card>
      </section>

      {/* THE FACTORY. Sorted by start time so the diagonal survives — §9.1, B.4. */}
      <section aria-labelledby="the-factory">
        <h2 id="the-factory" className="mb-2 font-head text-sm font-800 uppercase tracking-wide">
          The factory
        </h2>
        <Card className="p-4">
          <StaircaseCalendar bars={bars} nowMs={nowMs} onOpenAtHour={openAtHour} />
        </Card>
      </section>

      <p className="mt-3 max-w-prose text-[11px] leading-relaxed text-muted">
        Every bar is one master batch on the factory calendar, drawn at its own length. Position is the
        hour the batch has reached, not a fraction of it — half the process is resting and rest does not
        compress, so a percentage would say nothing true. Clicking a bar opens that batch at the hour
        you clicked.
      </p>
    </>
  );
}
