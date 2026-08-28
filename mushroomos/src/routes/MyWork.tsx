import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../api/client';
import { releaseElapsedRests } from '../api/batch';
import { PageHeading } from '../components/layout/PageHeading';
import { Bar, Card, Chip, Countdown, EmptyState, Skeleton, Stat } from '../components/primitives';
import { TaskDrawer } from './TaskDrawer';
import { nowMs } from '../lib/now';

interface WorkItem {
  id: string;
  code: string;
  title: string;
  scope_label: string;
  rel_day: number;
  seq: number;
  state: string;
  blocked_reason: string | null;
  unblocks_at: string | null;
  planned_qty_mt: number | null;
  day0_duration_hr: number | null;
  duration_target_min_hr: number | null;
  duration_target_max_hr: number | null;
  baseline_start_hour: number | null;
  baseline_end_hour: number | null;
  actual_start: string | null;
  actual_end: string | null;
  master_batch_id: string;
  machine?: { code: string } | null;
  source?: { label: string } | null;
  destination?: { label: string } | null;
  master_batch: {
    code: string;
    label: string;
    status: string;
    start_date: string;
    start_at: string | null;
  };
}

/**
 * Phase 1 · Operator "My Work" Screen.
 *
 * Mental Model: "What do I do NOW?"
 * - Displays active batch hour (e.g. H37 / baseline)
 * - Single authoritative CURRENT TASK (NOW)
 * - UP NEXT card for what comes right after
 * - Collapsed WAITING / COMPLETED groups
 */
export function MyWork() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<{ id: string; batchStatus: string } | null>(null);
  const [waitingOpen, setWaitingOpen] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);

  const q = useQuery({
    queryKey: ['my-work'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batch_activity')
        .select(
          `id, code, title, scope_label, rel_day, seq, state, blocked_reason, unblocks_at,
           planned_qty_mt, day0_duration_hr, duration_target_min_hr, duration_target_max_hr,
           baseline_start_hour, baseline_end_hour, actual_start, actual_end, master_batch_id,
           machine:machine!batch_activity_assigned_machine_id_fkey(code),
           source:location!batch_activity_source_location_id_fkey(label),
           destination:location!batch_activity_destination_location_id_fkey(label),
           master_batch!inner(code, label, status, start_date, start_at)`
        )
        .eq('master_batch.status', 'active')
        .in('state', ['READY', 'IN_PROGRESS', 'RETURNED', 'DEVIATION', 'WAITING_TIME', 'BLOCKED', 'COMPLETED'])
        .order('baseline_start_hour', { ascending: true, nullsFirst: false })
        .order('rel_day', { ascending: true })
        .order('seq', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as WorkItem[];
    },
    refetchOnWindowFocus: true,
  });

  const activeBatchIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of q.data ?? []) {
      if (r.master_batch?.status === 'active') ids.add(r.master_batch_id);
    }
    return [...ids];
  }, [q.data]);

  useEffect(() => {
    if (activeBatchIds.length === 0) return;
    let cancelled = false;
    const ask = async () => {
      try {
        await Promise.all(activeBatchIds.map((b) => releaseElapsedRests(b)));
        if (!cancelled) {
          qc.invalidateQueries({ queryKey: ['my-work'] });
        }
      } catch {
        // Polling retry
      }
    };
    ask();
    const t = setInterval(ask, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [activeBatchIds, qc]);

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

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <PageHeading title="My Work" subtitle="Loading current assignment..." />
        <Skeleton label="Loading task cards" lines={4} />
      </div>
    );
  }

  const rows = q.data ?? [];

  if (rows.length === 0) {
    return (
      <>
        <PageHeading title="My Work" subtitle="One task at a time" />
        <EmptyState
          title="No active tasks right now"
          detail="Tasks appear here when an active batch reaches an open gate. Check running batches or ask a supervisor."
        />
      </>
    );
  }

  // Active Batch header info & scoping
  const firstBatch = rows[0]?.master_batch;
  const activeBatchId = rows[0]?.master_batch_id;
  const batchLabel = firstBatch?.label ?? 'Active Batch';
  const startAtMs = firstBatch?.start_at ? new Date(firstBatch.start_at).getTime() : nowMs();
  const elapsedHours = Math.max(0, Math.floor((nowMs() - startAtMs) / (1000 * 60 * 60)));
  const maxDay = rows.length > 0 ? Math.max(...rows.map((r) => r.rel_day)) : 22;
  const baselineHours = (maxDay + 1) * 24;
  const currentBatchHour = Math.min(baselineHours, elapsedHours);

  // Filter rows strictly belonging to the active batch
  const batchRows = rows.filter((r) => !activeBatchId || r.master_batch_id === activeBatchId);

  // Time-aware task prioritization:
  // 1. In-progress task matching current H window
  // 2. Ready task at current H
  // 3. Overdue incomplete task
  // 4. Fallback in-progress / ready
  const inWindowInProgress = batchRows.find(
    (r) => r.state === 'IN_PROGRESS' &&
      (r.baseline_start_hour == null || r.baseline_start_hour <= currentBatchHour)
  );
  const inWindowReady = batchRows.find(
    (r) => (r.state === 'READY' || r.state === 'RETURNED') &&
      (r.baseline_start_hour == null || r.baseline_start_hour <= currentBatchHour)
  );
  const overdueTask = batchRows.find(
    (r) => (r.state === 'READY' || r.state === 'IN_PROGRESS' || r.state === 'DEVIATION') &&
      r.baseline_end_hour != null && r.baseline_end_hour < currentBatchHour
  );
  const fallbackReady = batchRows.find(
    (r) => r.state === 'READY' || r.state === 'RETURNED' || r.state === 'DEVIATION' || r.state === 'IN_PROGRESS'
  );

  const currentTask = inWindowInProgress || inWindowReady || overdueTask || fallbackReady;

  const upNextTask = batchRows.find(
    (r) => r.id !== currentTask?.id &&
      (r.state === 'READY' || r.state === 'BLOCKED' || r.state === 'WAITING_CONDITION' || r.state === 'LOCKED')
  );

  const waitingTasks = batchRows.filter(
    (r) => r.id !== currentTask?.id && (r.state === 'WAITING_TIME' || (r.state === 'BLOCKED' && r.id !== upNextTask?.id))
  );
  const completedTasks = batchRows.filter((r) => r.state === 'COMPLETED');

  // Weighment target strictly scoped to active batch
  const loads = ((totals.data ?? []) as { master_batch_id?: string; state: string; planned_qty_mt: number | null }[])
    .filter((l) => !activeBatchId || l.master_batch_id === activeBatchId);
  const targetMT = loads.reduce((s, l) => s + Number(l.planned_qty_mt ?? 0), 0);
  const loadedMT = loads
    .filter((l) => l.state === 'COMPLETED')
    .reduce((s, l) => s + Number(l.planned_qty_mt ?? 0), 0);
  const loadedCount = loads.filter((l) => l.state === 'COMPLETED').length;

  return (
    <div className="pb-20 max-w-3xl mx-auto space-y-5">
      {/* 1. TOP BATCH CLOCK HERO CARD */}
      <div className="bg-surface rounded-2xl p-5 shadow-card border border-line">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Current Batch Assignment</span>
            <h1 className="font-head text-xl font-extrabold text-ink">{batchLabel}</h1>
          </div>
          <div className="flex items-center gap-1.5 bg-green-100 text-green-700 px-3 py-1 rounded-full text-[11px] font-bold shadow-sm">
            <span className="w-2 h-2 rounded-full bg-green-700 pulse-dot"></span> SHIFT ACTIVE
          </div>
        </div>

        <div className="pt-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <span className="text-xs text-muted font-medium">Batch Process Clock:</span>
            <div className="font-head text-2xl font-extrabold text-accent">
              H{currentBatchHour} <span className="text-sm font-normal text-muted">/ H{baselineHours}</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs text-muted font-medium">Day Anchor:</span>
            <p className="font-mono text-xs font-bold text-ink-2">
              Day {Math.floor(currentBatchHour / 24)} · {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>

        {/* Visual Continuous Timeline Rail */}
        <div className="mt-3 w-full bg-surface-2 h-2 rounded-full overflow-hidden border border-line/60">
          <div
            className="bg-accent h-full transition-all duration-500 rounded-full"
            style={{ width: `${Math.min(100, Math.max(2, (currentBatchHour / baselineHours) * 100))}%` }}
          />
        </div>
      </div>

      {/* Fibre Weighment Progress (if applicable) */}
      {targetMT > 0 && (
        <Card className="p-4" rail="var(--accent)">
          <div className="flex items-center justify-between mb-2">
            <span className="font-head text-[11px] font-bold uppercase tracking-wider text-ink-2">
              Fibre Weighment Progress
            </span>
            <span className="font-mono text-xs font-bold text-accent">
              {loadedCount} of {loads.length} loads
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Target" value={targetMT.toFixed(1)} unit="MT" />
            <Stat label="Loaded" value={loadedMT.toFixed(2)} unit="MT" tone="ok" />
            <Stat label="Remaining" value={(targetMT - loadedMT).toFixed(2)} unit="MT" />
          </div>
          <div className="mt-2.5">
            <Bar kind="material" value={loadedMT} max={targetMT} unit="MT" tone="ok" />
          </div>
        </Card>
      )}

      {/* 2. CURRENT TASK (NOW) */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[12px] font-mono font-bold uppercase tracking-wider text-accent flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
            Current Work (Now)
          </h2>
          <span className="text-[11px] text-muted">Primary Action</span>
        </div>

        {currentTask ? (
          <div
            className="bg-surface rounded-2xl p-5 shadow-raised border border-line transition-all"
            style={{ borderLeftWidth: 5, borderLeftColor: 'var(--accent)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-accent-soft text-accent-ink">
                    H{currentTask.baseline_start_hour ?? currentTask.rel_day * 24}
                    {currentTask.baseline_end_hour ? ` → H${currentTask.baseline_end_hour}` : ''}
                  </span>
                  {currentTask.day0_duration_hr && (
                    <span className="font-mono text-xs text-muted font-semibold">
                      {currentTask.day0_duration_hr}h target
                    </span>
                  )}
                  <Chip tone={currentTask.state === 'IN_PROGRESS' ? 'accent' : 'ok'}>
                    {currentTask.state === 'IN_PROGRESS' ? 'IN PROGRESS' : 'READY TO START'}
                  </Chip>
                </div>
                <h3 className="font-head text-lg font-bold text-ink leading-tight">
                  {currentTask.title}
                </h3>
                <p className="mt-1 text-xs text-muted font-mono">
                  {currentTask.scope_label}
                  {currentTask.machine?.code ? ` · Machine: ${currentTask.machine.code}` : ''}
                  {currentTask.destination?.label ? ` · Vessel: ${currentTask.destination.label}` : ''}
                </p>
              </div>
            </div>

            {currentTask.actual_start && (
              <div className="mt-3 p-2.5 rounded-xl bg-surface-2 border border-line/60 text-xs text-ink-2">
                <span className="font-semibold text-accent">Started:</span>{' '}
                {new Date(currentTask.actual_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} (Server authoritative)
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-line flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] text-muted">
                {currentTask.state === 'IN_PROGRESS' ? 'Record readings & attach photos' : 'Press start to begin timer'}
              </span>
              <button
                type="button"
                onClick={() => setOpen({ id: currentTask.id, batchStatus: currentTask.master_batch.status })}
                className="h-11 px-6 rounded-xl font-head text-[13px] font-bold text-white shadow-md transition-transform active:scale-95 flex items-center gap-2"
                style={{ background: 'var(--accent)' }}
              >
                {currentTask.state === 'IN_PROGRESS' ? 'Record & Submit →' : 'Start Task →'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-surface rounded-2xl p-4 border border-line text-center text-muted text-xs">
            No pending action items right now.
          </div>
        )}
      </section>

      {/* 3. UP NEXT */}
      {upNextTask && (
        <section className="space-y-2 pt-1">
          <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-muted px-1">
            Up Next
          </h2>
          <div
            onClick={() => setOpen({ id: upNextTask.id, batchStatus: upNextTask.master_batch.status })}
            className="bg-surface rounded-xl p-4 shadow-card border border-line cursor-pointer hover:border-primary/40 transition-colors flex items-center justify-between gap-3"
          >
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-muted/20 text-ink-2">
                  H{upNextTask.baseline_start_hour ?? upNextTask.rel_day * 24}
                  {upNextTask.baseline_end_hour ? ` → H${upNextTask.baseline_end_hour}` : ''}
                </span>
                <span className="text-[10px] uppercase font-bold text-muted">
                  {upNextTask.state.replace(/_/g, ' ')}
                </span>
              </div>
              <h4 className="font-head text-sm font-bold text-ink">{upNextTask.title}</h4>
              <p className="text-[11px] text-muted">{upNextTask.scope_label}</p>
            </div>
            <span className="text-muted text-sm font-bold">→</span>
          </div>
        </section>
      )}

      {/* 4. WAITING ON REST / TIME-GATE (Collapsible) */}
      {waitingTasks.length > 0 && (
        <section className="pt-2">
          <button
            type="button"
            onClick={() => setWaitingOpen(!waitingOpen)}
            className="w-full flex items-center justify-between py-2 px-1 text-[12px] font-mono font-bold uppercase tracking-wider text-muted hover:text-ink transition-colors"
          >
            <span>Waiting on Rest / Time-Gates ({waitingTasks.length})</span>
            <span>{waitingOpen ? '▲ Hide' : '▼ View'}</span>
          </button>

          {waitingOpen && (
            <div className="space-y-2 mt-2">
              {waitingTasks.map((t) => (
                <div key={t.id} className="bg-surface rounded-xl p-3.5 border border-line shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-head text-xs font-bold text-ink">{t.title}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                      RESTING
                    </span>
                  </div>
                  <p className="text-[11px] text-muted mt-0.5">{t.scope_label}</p>
                  {t.unblocks_at && (
                    <div className="mt-2 text-xs font-mono font-bold text-accent flex items-center gap-1.5">
                      <span>Rest Timer:</span>
                      <Countdown until={t.unblocks_at} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 5. COMPLETED TODAY (Collapsible) */}
      {completedTasks.length > 0 && (
        <section className="pt-1">
          <button
            type="button"
            onClick={() => setCompletedOpen(!completedOpen)}
            className="w-full flex items-center justify-between py-2 px-1 text-[12px] font-mono font-bold uppercase tracking-wider text-muted hover:text-ink transition-colors"
          >
            <span>Completed Work ({completedTasks.length})</span>
            <span>{completedOpen ? '▲ Hide' : '▼ View'}</span>
          </button>

          {completedOpen && (
            <div className="space-y-2 mt-2">
              {completedTasks.slice(0, 10).map((t) => (
                <div key={t.id} className="bg-surface rounded-xl p-3 border border-line/60 flex items-center justify-between opacity-80">
                  <div>
                    <span className="font-head text-xs font-bold text-ink">{t.title}</span>
                    <p className="text-[10px] text-muted font-mono">{t.scope_label}</p>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-ok flex items-center gap-1">
                    ✓ Done
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Task Drawer */}
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
    </div>
  );
}
