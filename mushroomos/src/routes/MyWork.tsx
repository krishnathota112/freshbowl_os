import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../api/client';
import { releaseElapsedRests } from '../api/batch';
import { PageHeading } from '../components/layout/AppShell';
import { Bar, Card, Chip, ConflictMarker, Countdown, EmptyState, Stat } from '../components/primitives';
import { TaskDrawer } from './TaskDrawer';

/**
 * My Work. Only what is actionable, ordered by day.
 *
 * With six streams and ~80 instances a stage list is unusable, so this shows READY and
 * IN_PROGRESS only, each labelled with its scope so the operator knows WHICH pile, WHICH
 * bunker, WHICH load. The graph exists for the supervisor and the GM; the operator never
 * needs it.
 */
export function MyWork() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<{ id: string; batchStatus: string } | null>(null);

  const q = useQuery({
    queryKey: ['my-work'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batch_activity')
        .select(
          'id, code, title, scope_label, rel_day, state, blocked_reason, unblocks_at, planned_qty_mt, day0_duration_hr, duration_target_min_hr, duration_target_max_hr, tbd_marker, golden_rule, master_batch_id, master_batch!inner(code, label, status, start_date)'
        )
        // Only activated batches. A draft's plan is a proposal, not work — showing it here
        // once put a leftover test draft's 11 loads on the operator's screen alongside the
        // real batch's 11, and the progress card read 42 MT for a 21 MT batch.
        .eq('master_batch.status', 'active')
        .in('state', ['READY', 'IN_PROGRESS', 'RETURNED', 'DEVIATION', 'WAITING_TIME', 'BLOCKED'])
        .order('rel_day')
        .order('seq');
      if (error) throw error;
      return data ?? [];
    },
    refetchOnWindowFocus: true,
  });

  /** Every active batch this operator has work in. */
  const activeBatchIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of (q.data ?? []) as Record<string, unknown>[]) {
      const mb = r.master_batch as { status: string } | undefined;
      if (mb?.status === 'active') ids.add(r.master_batch_id as string);
    }
    return [...ids];
  }, [q.data]);

  /**
   * Ask the server whether any rest window has elapsed.
   *
   * This is NOT a client-side timer. The client only asks; advance_batch decides using the
   * SERVER clock and the Day-0 duration, which is why a phone set 48 h forward cannot open a
   * 48 h gate. Polling is a freshness mechanism, never the authority.
   */
  useEffect(() => {
    if (activeBatchIds.length === 0) return;

    let cancelled = false;
    const ask = async () => {
      try {
        await Promise.all(activeBatchIds.map((b) => releaseElapsedRests(b)));
        if (!cancelled) {
          qc.invalidateQueries({ queryKey: ['my-work'] });
          qc.invalidateQueries({ queryKey: ['my-work-totals'] });
        }
      } catch {
        // A failed poll is not an error worth showing — the next tick retries.
      }
    };

    ask(); // once immediately, so a gate that expired while away opens on arrival
    const t = setInterval(ask, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [activeBatchIds.join(','), qc]);

  const totals = useQuery({
    queryKey: ['my-work-totals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batch_activity')
        .select('code, state, planned_qty_mt, master_batch_id, master_batch!inner(status)')
        .eq('master_batch.status', 'active')
        .eq('code', 'FIB1-WEIGH');
      if (error) throw error;
      return data ?? [];
    },
  });

  if (q.isLoading) return <p className="text-sm text-muted">Loading…</p>;
  const rows = (q.data ?? []) as Record<string, unknown>[];

  if (rows.length === 0) {
    return (
      <>
        <PageHeading title="My Work" subtitle="One task at a time" />
        <EmptyState
          title="Nothing is open right now"
          detail="Tasks appear here when a batch is activated and its gates open. Ask an admin to start a batch, or check a running batch for what it is waiting on."
        />
      </>
    );
  }

  // Weighment running totals — the operator's whole sense of progress.
  const loads = (totals.data ?? []) as { state: string; planned_qty_mt: number | null }[];
  const target = loads.reduce((s, l) => s + Number(l.planned_qty_mt ?? 0), 0);
  const loadedCount = loads.filter((l) => l.state === 'COMPLETED').length;
  const loaded = loads
    .filter((l) => l.state === 'COMPLETED')
    .reduce((s, l) => s + Number(l.planned_qty_mt ?? 0), 0);

  const byDay = new Map<number, Record<string, unknown>[]>();
  for (const r of rows) {
    const d = r.rel_day as number;
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }

  return (
    <>
      <PageHeading
        title="My Work"
        subtitle={`${rows.length} task${rows.length === 1 ? '' : 's'} open`}
      />

      {target > 0 && (
        <Card className="mb-5 p-4" rail="var(--accent)">
          <p className="mb-2 font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
            Fibre weighment progress
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Target" value={target.toFixed(1)} unit="MT" />
            <Stat label="Loaded" value={loaded.toFixed(2)} unit="MT" tone="ok" />
            <Stat label="Remaining" value={(target - loaded).toFixed(2)} unit="MT" />
            <Stat label="Loads" value={`${loadedCount} / ${loads.length}`} compare="derived, not typed" />
          </div>
          <div className="mt-3">
            <Bar value={loaded} max={target} tone="ok" />
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-5">
        {[...byDay.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([day, items]) => (
            <div key={day}>
              <h2 className="mb-2 font-head text-sm font-800 uppercase tracking-wide">Day {day}</h2>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {items.map((r) => {
                  const mb = r.master_batch as { label: string; status: string };
                  const state = r.state as string;
                  const dur =
                    r.day0_duration_hr != null
                      ? `${r.day0_duration_hr} h`
                      : r.duration_target_min_hr != null
                        ? `${r.duration_target_min_hr}–${r.duration_target_max_hr} h`
                        : null;
                  return (
                    <button
                      key={r.id as string}
                      onClick={() => setOpen({ id: r.id as string, batchStatus: mb.status })}
                      className="rounded-md border bg-surface p-3 text-left"
                      style={{
                        borderColor: 'var(--line)',
                        borderLeftWidth: 3,
                        borderLeftColor:
                          state === 'DEVIATION' ? 'var(--crit)'
                          : state === 'IN_PROGRESS' ? 'var(--accent)'
                          : state === 'RETURNED' ? 'var(--warn)'
                          : 'var(--accent)',
                      }}
                    >
                      {/* Scope is always visible: which pile, which bunker, which load. */}
                      <p className="mono text-[10px] text-muted">
                        {mb.label} · {r.scope_label as string}
                      </p>
                      <p className="mt-0.5 font-head text-[14px] font-700 leading-tight">
                        {r.title as string}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Chip
                          tone={
                            state === 'DEVIATION' || state === 'BLOCKED' ? 'crit'
                            : state === 'RETURNED' ? 'warn'
                            : state === 'WAITING_TIME' ? 'inherit'
                            : 'accent'
                          }
                        >
                          {state === 'WAITING_TIME' ? 'RESTING' : state.replace(/_/g, ' ')}
                        </Chip>
                        {dur && <span className="mono text-[11px] text-ink2">{dur}</span>}
                        {r.planned_qty_mt != null && (
                          <span className="mono text-[11px] text-ink2">
                            target {r.planned_qty_mt as number} MT
                          </span>
                        )}
                        {r.tbd_marker != null && <ConflictMarker id={r.tbd_marker as string} />}
                      </div>

                      {/*
                        The countdown is display only. It reads a server-issued timestamp;
                        it never decides anything. When it reaches zero the poll asks the
                        server, and the server opens the gate.
                      */}
                      {state === 'WAITING_TIME' && r.unblocks_at != null && (
                        <p className="mt-2 font-head text-[13px] font-700">
                          <Countdown until={r.unblocks_at as string} />
                        </p>
                      )}

                      {r.blocked_reason != null && (
                        <p className="mt-2 text-[11px] leading-snug" style={{ color: 'var(--ink-2)' }}>
                          {r.blocked_reason as string}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
      </div>

      {open && (
        <TaskDrawer
          activityId={open.id}
          batchStatus={open.batchStatus}
          onClose={() => setOpen(null)}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ['my-work'] });
            qc.invalidateQueries({ queryKey: ['my-work-totals'] });
          }}
        />
      )}
    </>
  );
}
