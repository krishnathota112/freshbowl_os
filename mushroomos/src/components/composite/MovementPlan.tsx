import { useMemo, useState } from 'react';
import type { IndividualBatch, Movement, VesselOption } from '../../domain/contracts';
import { humanError } from '../../lib/humanError';
import { ConflictMarker, EmptyState, Skeleton } from '../primitives';

/**
 * WHERE THIS BATCH PHYSICALLY GOES, movement by movement.
 *
 * Designed with the APK's visual storytelling:
 * Elevated white cards, strong green accents, clear branch trees, and 48px touch targets.
 */
export function MovementPlan({
  movements,
  individuals,
  options,
  draft,
  loading,
  busy,
  error,
  onPick,
}: {
  movements: Movement[];
  individuals: IndividualBatch[];
  options: VesselOption[];
  draft: boolean;
  loading: boolean;
  busy: boolean;
  error: string | null;
  onPick: (v: { movement: string; locationId: string; individualBatchId: string | null }) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const byKind = useMemo(() => {
    const m = new Map<string, VesselOption[]>();
    for (const o of options) {
      const list = m.get(o.kind);
      if (list) list.push(o);
      else m.set(o.kind, [o]);
    }
    return m;
  }, [options]);

  if (loading) return <Skeleton label="Reading the movement plan" lines={3} />;

  const steps = movements.filter((m) => m.needsKind !== null);
  if (steps.length === 0) {
    return (
      <EmptyState
        title="This batch has no vessel movements yet"
        detail="Bunkers and tunnels appear here once the batch covers at least one individual batch."
      />
    );
  }

  const bunkerSteps = steps.filter((m) => m.code !== 'TUNNEL_LOAD');
  const tunnelSteps = steps.filter((m) => m.code === 'TUNNEL_LOAD');

  const unchosenBunkers = bunkerSteps.filter((s) => s.toLocationId === null).length;
  const unchosenTunnels = tunnelSteps.filter((s) => s.toLocationId === null).length;
  const allocatedBunker = [...bunkerSteps].reverse().find((s) => s.toLabel !== null);
  const lastBunkerLabel = allocatedBunker?.toLabel ?? 'Phase I Bunker (Planned)';

  return (
    <section className="mb-6 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <div>
          <h2 className="font-head text-[14px] font-800 uppercase tracking-wider text-on-surface">
            Physical Flow & Vessel Movements
          </h2>
          <p className="text-[12px] text-on-surface-variant mt-0.5">
            Phase I Bunker journey (H0→H240) followed by Phase II Tunnel allocation (decided by H240).
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold shadow-sm"
          style={{
            background: unchosenBunkers > 0 ? 'var(--warn-soft)' : 'var(--ok-soft)',
            color: unchosenBunkers > 0 ? 'var(--warn)' : 'var(--ok)',
          }}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: unchosenBunkers > 0 ? 'var(--warn)' : 'var(--ok)' }}
          />
          {unchosenBunkers > 0
            ? `${unchosenBunkers} bunker${unchosenBunkers === 1 ? '' : 's'} to allocate`
            : unchosenTunnels > 0
            ? 'Bunkers Configured · Tunnel Decision Due H240'
            : 'All Vessels Allocated'}
        </span>
      </div>

      {individuals.length > 0 && (
        <div className="rounded-xl border border-line bg-surface-2 p-3 text-[12px] text-ink-2 shadow-sm">
          This master batch covers{' '}
          <span className="font-mono font-bold text-accent">
            {individuals.map((i) => i.batchNo).join(' · ')}
          </span>
          . They travel together until tunnel loading, where each takes its own tunnel.
        </div>
      )}

      {error !== null && (
        <div
          className="rounded-xl border p-3.5 text-xs shadow-sm"
          style={{
            borderColor: 'var(--crit)',
            background: 'var(--crit-soft)',
            color: 'var(--crit)',
          }}
        >
          <p className="font-head font-bold text-[13px]">{humanError(error).title}</p>
          <p className="mt-0.5 opacity-90">{humanError(error).detail}</p>
        </div>
      )}

      {/* PHASE I · BUNKER MOVEMENTS */}
      <div className="space-y-3">
        <span className="text-[11px] font-bold tracking-widest text-on-surface-variant uppercase px-1">
          Phase I · Bunker Movements
        </span>

        <div className="grid gap-3 md:grid-cols-3">
          {bunkerSteps.map((m, i) => {
            const key = `${m.code}-${m.individualBatchId ?? 'all'}`;
            const isOpen = openKey === key;
            const fromText = fromLabelFor(m, steps, i);
            const isAllocated = Boolean(m.toLocationId);

            return (
              <div
                key={key}
                className="bg-surface rounded-2xl p-4 shadow-card border border-line flex flex-col justify-between transition-all hover:shadow-raised"
                style={{
                  borderLeftWidth: 4,
                  borderLeftColor: isAllocated ? 'var(--accent)' : 'var(--warn)',
                }}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-head text-[13px] font-bold text-ink flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-accent-soft text-accent text-[11px] flex items-center justify-center font-mono">
                        {i + 1}
                      </span>
                      {m.label}
                    </span>
                    {m.conflictId ? (
                      <ConflictMarker id={m.conflictId} />
                    ) : isAllocated ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-ok-soft text-ok uppercase">
                        Allocated
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-warn-soft text-warn uppercase">
                        Pending
                      </span>
                    )}
                  </div>

                  {/* Visual Diagram */}
                  <div className="my-3 p-2.5 rounded-xl bg-surface-2 border border-line/60 flex items-center justify-between font-mono text-xs">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase text-muted font-sans font-semibold">From</span>
                      <span className="font-bold text-ink-2 truncate max-w-[90px]">{fromText}</span>
                    </div>
                    <span className="text-accent font-bold text-sm">──►</span>
                    <div className="flex flex-col text-right">
                      <span className="text-[10px] uppercase text-muted font-sans font-semibold">To</span>
                      <span className="font-bold text-accent truncate max-w-[100px]">
                        {m.toLabel ?? <span className="text-warn italic">Choose</span>}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 mt-1 border-t border-line/40">
                  {draft ? (
                    <div className="relative">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setOpenKey(isOpen ? null : key)}
                        className="w-full h-10 rounded-xl font-head text-[12px] font-bold flex items-center justify-center transition-colors"
                        style={{
                          background: isAllocated ? 'var(--surface-2)' : 'var(--accent)',
                          color: isAllocated ? 'var(--ink)' : 'var(--on-accent)',
                          border: isAllocated ? '1px solid var(--line-2)' : 'none',
                        }}
                      >
                        {isAllocated ? `Change (${m.toLabel})` : 'Choose Bunker'}
                      </button>

                      {isOpen && (
                        <div className="absolute left-0 right-0 z-30 mt-1.5 rounded-xl border border-line-2 bg-surface p-1.5 shadow-raised">
                          {(byKind.get(m.needsKind ?? '') ?? []).map((o) => {
                            const takenByOther =
                              o.occupiedByBatch !== null &&
                              o.occupiedByBatchId !== null &&
                              o.occupiedByBatchId !== movements[0]?.movementId;
                            const chosen = o.locationId === m.toLocationId;
                            const unavailable = o.status !== 'available' || takenByOther;

                            return (
                              <button
                                key={o.locationId}
                                type="button"
                                disabled={unavailable || busy || chosen}
                                onClick={() => {
                                  setOpenKey(null);
                                  onPick({
                                    movement: m.code,
                                    locationId: o.locationId,
                                    individualBatchId: m.individualBatchId,
                                  });
                                }}
                                className="w-full rounded-lg px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-surface-2 transition-colors mb-0.5 last:mb-0"
                                style={{
                                  background: chosen ? 'var(--accent-soft)' : undefined,
                                  color: chosen ? 'var(--accent-ink)' : 'var(--ink)',
                                }}
                              >
                                <span className="font-head font-bold">{o.label}</span>
                                <span className="text-[10px] font-mono opacity-80">
                                  {chosen
                                    ? 'chosen'
                                    : o.status !== 'available'
                                      ? o.status
                                      : o.occupiedByBatch
                                        ? `holding ${o.occupiedByBatch}`
                                        : 'free'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted text-center">
                      The plan is frozen. Changing a vessel goes through a supervisor.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* PHASE II · TUNNEL ALLOCATION (INDIVIDUAL BATCH SPLIT) */}
      <div className="space-y-3 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <span className="text-[11px] font-bold tracking-widest text-on-surface-variant uppercase">
            Phase II · Tunnel Planning (Per Individual Batch)
          </span>
          <span className="font-mono text-xs font-bold text-accent bg-accent-soft px-2.5 py-0.5 rounded-full">
            Decision Due by H240
          </span>
        </div>

        <div className="bg-surface rounded-2xl p-5 shadow-card border border-line">
          <div className="flex items-center justify-between gap-2 border-b border-line pb-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted font-head font-bold uppercase tracking-wider">Source Bunker:</span>
              <span className="px-2.5 py-1 rounded-lg bg-accent-soft text-accent font-mono font-bold text-xs">
                {lastBunkerLabel}
              </span>
            </div>
            <span className="text-[11px] text-muted">
              {tunnelSteps.filter((s) => s.toLocationId).length} of {tunnelSteps.length} allocated
            </span>
          </div>

          {/* Helper Notice */}
          <div className="mb-4 rounded-xl border border-line bg-surface-2 p-3 text-xs text-ink-2">
            <span className="font-bold text-ink">Milestone:</span> Tunnel allocation is finalized by <span className="font-bold text-ink">H240</span> (Day 10) during active production. Early reservation before H0 is optional.
          </div>

          {/* Hierarchical Tree Graph */}
          <div className="space-y-3 pl-2 sm:pl-4">
            {tunnelSteps.map((m, idx) => {
              const key = `${m.code}-${m.individualBatchId ?? idx}`;
              const isOpen = openKey === key;
              const isLast = idx === tunnelSteps.length - 1;
              const branchSymbol = isLast ? '└─→' : '├─→';
              const isAllocated = Boolean(m.toLocationId);

              const realBatchNo = m.batchNo ?? individuals[idx]?.batchNo ?? `Sub-batch ${idx + 1}`;

              return (
                <div
                  key={key}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-line bg-surface-2 transition-all hover:bg-surface-3/50"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-muted text-base font-bold select-none">{branchSymbol}</span>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-md bg-surface border border-line text-ink font-mono font-bold text-xs shadow-sm">
                        Batch {realBatchNo}
                      </span>
                      <span className="text-accent font-mono text-xs">──►</span>
                      <span className="font-head text-sm font-bold text-ink">
                        {m.toLabel ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-ok-soft text-ok font-mono text-xs">
                            {m.toLabel}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-surface border border-line text-muted font-mono text-xs">
                            Due by H240
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  <div>
                    {draft ? (
                      <div className="relative">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setOpenKey(isOpen ? null : key)}
                          className="h-9 px-4 rounded-lg font-head text-[12px] font-bold flex items-center justify-center transition-colors"
                          style={{
                            background: isAllocated ? 'var(--surface)' : 'var(--accent-soft)',
                            color: isAllocated ? 'var(--ink)' : 'var(--accent-ink)',
                            border: isAllocated ? '1px solid var(--line-2)' : '1px solid var(--accent)',
                          }}
                        >
                          {isAllocated ? `Change (${m.toLabel})` : 'Allocate (Due H240)'}
                        </button>

                        {isOpen && (
                          <div className="absolute right-0 z-30 mt-1.5 w-60 rounded-xl border border-line-2 bg-surface p-1.5 shadow-raised">
                            {(byKind.get('TUNNEL') ?? []).map((o) => {
                              const chosen = o.locationId === m.toLocationId;
                              const takenByOther =
                                o.occupiedByBatch !== null &&
                                o.occupiedByBatchId !== null &&
                                o.occupiedByBatchId !== movements[0]?.movementId;
                              const unavailable = o.status !== 'available' || takenByOther;

                              return (
                                <button
                                  key={o.locationId}
                                  type="button"
                                  disabled={unavailable || busy || chosen}
                                  onClick={() => {
                                    setOpenKey(null);
                                    onPick({
                                      movement: m.code,
                                      locationId: o.locationId,
                                      individualBatchId: m.individualBatchId,
                                    });
                                  }}
                                  className="w-full rounded-lg px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-surface-2 transition-colors mb-0.5 last:mb-0"
                                  style={{
                                    background: chosen ? 'var(--accent-soft)' : undefined,
                                    color: chosen ? 'var(--accent-ink)' : 'var(--ink)',
                                  }}
                                >
                                  <span className="font-head font-bold">{o.label}</span>
                                  <span className="text-[10px] font-mono opacity-80">
                                    {chosen
                                      ? 'chosen'
                                      : o.status !== 'available'
                                        ? o.status
                                        : o.occupiedByBatch
                                          ? `holding ${o.occupiedByBatch}`
                                          : 'free'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="font-mono text-xs font-bold text-ink">{m.toLabel}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function fromLabelFor(m: Movement, steps: Movement[], index: number): string {
  if (m.fromLabel !== null) return m.fromLabel;
  if (index === 0) return 'arrives at the factory';
  for (let i = index - 1; i >= 0; i -= 1) {
    const prev = steps[i];
    if (prev.toLabel !== null && prev.code !== m.code) return prev.toLabel;
  }
  return 'wherever the step before ends';
}
