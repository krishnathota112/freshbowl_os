import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { nowDate, nowMs } from '../lib/now';

import { PageHeading } from '../components/layout/PageHeading';
import { EmptyState, Skeleton, Stat } from '../components/primitives';
import { ExceptionBand } from '../components/composite/ExceptionBand';
import { StaircaseCalendar } from '../components/composite/StaircaseCalendar';
import { loadTower } from '../api/tower';
import { supabase } from '../api/client';

/**
 * Phase 4 · Factory Control Tower.
 *
 * Mental Model: "What is happening in the factory, what is late, and where is risk?"
 * - Top Summary: Factory Now, Active Batches count, On Plan vs At Risk vs Held.
 * - Staggered Staircase Timeline: Continuous factory timeline position per batch.
 * - Physical Plant Occupancy: Bunkers (Phase I), Tunnels (Phase II), Yard & Lines.
 * - Exceptions & Attention: Deviations, delayed movements, missing lab results.
 */
export function ControlTower() {
  const navigate = useNavigate();
  const tower = useQuery({
    queryKey: ['tower'],
    queryFn: loadTower,
    refetchInterval: 60_000,
  });

  // Query physical vessel occupancy from v_plant_now
  const vesselsQuery = useQuery({
    queryKey: ['tower-vessel-occupancy'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_plant_now')
        .select('*')
        .order('code');
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  // The factory's effective now, so the staircase and the gates agree about the hour.
  const at = nowMs();

  if (tower.isLoading) {
    return (
      <div className="space-y-4 max-w-6xl mx-auto">
        <PageHeading title="Factory Control Tower" subtitle="Loading operational board..." />
        <Skeleton label="Reading every running batch and physical vessel occupancy" lines={6} />
      </div>
    );
  }

  if (tower.error) {
    return (
      <div className="max-w-6xl mx-auto">
        <PageHeading title="Factory Control Tower" subtitle="What needs a decision, then the shape of the factory" />
        <EmptyState
          title="The operational board could not be read"
          detail={(tower.error as Error).message}
        />
      </div>
    );
  }

  const { bars, counters, exceptions } = tower.data!;
  const openAtHour = (batchId: string, hour: number) =>
    navigate(`/batch/${batchId}?h=${hour}`);

  const vessels = vesselsQuery.data ?? [];
  const bunkers = vessels.filter((v) => v.kind === 'BUNKER');
  const tunnels = vessels.filter((v) => v.kind === 'TUNNEL');

  return (
    <div className="pb-24 max-w-6xl mx-auto space-y-6">
      {/* 1. CONTROL TOWER TOP HEADER */}
      <div className="bg-surface rounded-2xl p-5 shadow-card border border-line">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Management Overview</span>
            <h1 className="font-head text-2xl font-extrabold text-ink">Factory Control Tower</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-accent bg-accent-soft px-3 py-1 rounded-full">
              FACTORY NOW · {nowDate().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · {nowDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

      </div>

      {/*
        WHAT NEEDS A DECISION COMES FIRST.

        A rewrite moved the counters above this band. The order is the product: a GM opening this
        screen at 6am needs the thing waiting on him before he needs a count of what is running,
        and on a phone the counters alone can fill the first screen and bury it entirely.
      */}
      {/* 2. ATTENTION & EXCEPTIONS (NEEDS YOU) */}
      <section aria-labelledby="needs-you">
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 id="needs-you" className="font-mono text-xs font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-600 animate-pulse" />
            Attention & Open Exceptions ({exceptions.length})
          </h2>
          <span className="text-[11px] text-muted">Real-time alerts</span>
        </div>

        <ExceptionBand
          exceptions={exceptions}
          nowMs={at}
          onOpen={(batchId) => navigate(`/batch/${batchId}`)}
          emptyDetail={
            bars.length === 0
              ? 'No batch is running. The band fills the moment an activity is held, returned or in deviation.'
              : 'Every running batch is operating on plan. This band fills when an activity requires supervisor release or records a quality variance.'
          }
        />
      </section>

        {/*
          Four counters, no fifth. `aria-label` is what a screen reader announces AND what the test
          anchors on; a rewrite dropped it and took the accessibility with it.
        */}
        <div aria-label="Counters" className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
          <Stat
            label="Active Batches"
            value={counters.running}
            compare="live concurrent processes"
            size="lg"
          />
          <Stat
            label="On Plan"
            value={counters.onPlan}
            compare="operating within baseline"
            size="lg"
            tone={counters.onPlan === counters.running ? 'ok' : undefined}
          />
          <Stat
            label="Needs Decision"
            value={counters.needsDecision}
            compare="supervisor action required"
            size="lg"
            tone={counters.needsDecision > 0 ? 'warn' : undefined}
          />
          <Stat
            label="Held / Blocked"
            value={counters.held}
            compare="stopped at time-gate"
            size="lg"
            tone={counters.held > 0 ? 'crit' : undefined}
          />
        </div>

      {/* 3. STAGGERED BATCH STAIRCASE (TIMELINE) */}
      <section aria-labelledby="the-factory" className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 id="the-factory" className="font-mono text-xs font-bold uppercase tracking-wider text-accent">
            Factory Process Staircase Timeline
          </h2>
          <span className="text-[11px] text-muted">Click any bar to inspect batch at that hour</span>
        </div>

        <div className="bg-surface rounded-2xl p-5 shadow-card border border-line">
          <StaircaseCalendar bars={bars} nowMs={at} onOpenAtHour={openAtHour} />
        </div>

        {/*
          WHY THERE IS NO PROGRESS BAR, said on the screen rather than only in a document.

          This sentence was on the board and a rewrite removed it. It earns its space: without it,
          the first question anyone asks of this view is "why can't I see how far along it is", and
          the honest answer is that half the process is resting, rest does not compress, and a
          fraction would therefore say nothing true. Explaining the ban is how it survives.
        */}
        <p className="mt-3 px-1 text-[11px] leading-relaxed text-muted">
          Every bar is one master batch on the factory calendar, drawn at its own length. Position is
          the hour the batch has reached, not a fraction of it — half the process is resting and rest
          does not compress, so a percentage would say nothing true.
        </p>
      </section>

      {/* 4. PHYSICAL PLANT OCCUPANCY */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-muted">
            Physical Plant Vessel Occupancy
          </h2>
          <span className="text-[11px] text-muted">Phase I Bunkers & Phase II Tunnels</span>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Phase I Bunkers */}
          <div className="bg-surface rounded-2xl p-4 shadow-card border border-line">
            <div className="flex items-center justify-between border-b border-line pb-2 mb-3">
              <span className="font-head text-sm font-bold text-ink">Phase I Bunkers</span>
              <span className="font-mono text-xs text-muted">{bunkers.length} Vessels</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {bunkers.map((b) => {
                const isOccupied = !!b.batch_code;
                return (
                  <div
                    key={b.id}
                    className={`p-2.5 rounded-xl border text-xs ${
                      isOccupied
                        ? 'bg-accent-soft border-accent/40 text-accent-ink font-semibold'
                        : 'bg-surface-2 border-line/60 text-muted'
                    }`}
                  >
                    <span className="font-mono font-bold block">{b.label}</span>
                    <span className="text-[10px] mt-0.5 block truncate">
                      {isOccupied ? `● ${b.batch_code}` : '○ Empty'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Phase II Tunnels */}
          <div className="bg-surface rounded-2xl p-4 shadow-card border border-line">
            <div className="flex items-center justify-between border-b border-line pb-2 mb-3">
              <span className="font-head text-sm font-bold text-ink">Phase II Tunnels</span>
              <span className="font-mono text-xs text-muted">{tunnels.length} Tunnels</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {tunnels.map((t) => {
                const isOccupied = !!t.batch_code;
                return (
                  <div
                    key={t.id}
                    className={`p-2.5 rounded-xl border text-xs ${
                      isOccupied
                        ? 'bg-primary/10 border-primary/40 text-primary font-semibold'
                        : 'bg-surface-2 border-line/60 text-muted'
                    }`}
                  >
                    <span className="font-mono font-bold block">{t.label}</span>
                    <span className="text-[10px] mt-0.5 block truncate">
                      {isOccupied ? `● ${t.batch_code}` : '○ Available'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
