import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  activateBatch,
  getBatch,
  getBatchActivities,
  getPreBatchMaterialCheck,
  releaseElapsedRests,
  type BatchActivityRow,
} from '../api/batch';
import { supabase } from '../api/client';
import { PageHeading } from '../components/layout/PageHeading';
import { Card, Chip, ConflictMarker, EmptyState, Stat } from '../components/primitives';
import { TaskDrawer } from './TaskDrawer';
import { nowMs } from '../lib/now';

/**
 * The batch, day by day. This is the plan a supervisor or admin reads.
 *
 * `embedded` is set when `BatchPage` renders this under `?tab=activities` (P3). It suppresses only
 * the PAGE HEADING — the batch's name and status are already on the page above, and two `<h1>`s on
 * one document is both wrong for a screen reader and confusing to look at. The actions are kept:
 * activate, open the schedule and check the rest timers are the reasons to be on this tab.
 */
export function BatchDetail({ embedded = false }: { embedded?: boolean } = {}) {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const batch = useQuery({ queryKey: ['batch', id], queryFn: () => getBatch(id) });
  const acts = useQuery({ queryKey: ['batch-activities', id], queryFn: () => getBatchActivities(id) });

  const activate = useMutation({
    mutationFn: () => activateBatch(id),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['batch', id] });
      qc.invalidateQueries({ queryKey: ['batch-activities', id] });
    },
    onError: (e) => setError((e as Error).message),
  });

  const tick = useMutation({
    mutationFn: () => releaseElapsedRests(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['batch-activities', id] }),
  });

  if (batch.isLoading || acts.isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (batch.error) return <EmptyState title="Batch not found" detail={(batch.error as Error).message} />;

  const b = batch.data!;
  const rows = acts.data ?? [];
  const byDay = groupByDay(rows);
  const done = rows.filter((r) => r.state === 'COMPLETED').length;
  const ready = rows.filter((r) => r.state === 'READY' || r.state === 'IN_PROGRESS').length;
  const flagged = rows.filter((r) => r.state === 'DEVIATION' || r.state === 'BLOCKED').length;

  const actions = (
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={b.status === 'active' ? 'ok' : b.status === 'draft' ? 'inherit' : 'lock'}>
              {b.status}
            </Chip>
            {b.status === 'active' && (
              <button
                onClick={() => tick.mutate()}
                className="rounded border px-2 py-1.5 font-head text-[11px] font-600"
                style={{ borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
                title="Rest gates open on the server clock, never the device's"
              >
                Check rest timers
              </button>
            )}
            <Link
              to={`/admin/batch/${id}/schedule`}
              className="rounded px-3 py-2 font-head text-[12px] font-700"
              style={{ background: '#16794a', color: '#fff' }}
            >
              {b.status === 'draft' ? 'Open the schedule' : 'View the schedule'}
            </Link>
            {b.status === 'draft' && (
              <button
                onClick={() => activate.mutate()}
                disabled={activate.isPending}
                className="rounded border px-3 py-2 font-head text-[12px] font-700"
                style={{ borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
              >
                {activate.isPending ? 'Activating…' : 'Activate'}
              </button>
            )}
          </div>
  );

  return (
    <>
      {embedded ? (
        <div className="mb-4 flex justify-end">{actions}</div>
      ) : (
        <PageHeading
          title={b.label}
          subtitle={`Day 0 is ${new Date(b.start_date).toDateString()} · supervisor ${b.supervisor_name ?? '—'}`}
          right={actions}
        />
      )}

      {error && (
        <div
          className="mb-4 rounded border px-3 py-2 text-[13px]"
          style={{ borderColor: 'var(--crit)', background: 'var(--crit-soft)', color: 'var(--crit)' }}
        >
          {error}
        </div>
      )}

      {b.status === 'draft' && (
        <div
          className="mb-4 rounded border px-3 py-2 text-[13px]"
          style={{ borderColor: 'var(--inherit)', background: 'var(--inherit-soft)', color: 'var(--inherit)' }}
        >
          This is still a draft. Activating freezes the plan — after that the targets cannot be
          quietly edited, and changes go through a deviation or a supervisor decision.
        </div>
      )}

      {/* Master Batch Process Clock Hero */}
      {(() => {
        const maxRelDay = rows.length > 0 ? Math.max(...rows.map((r) => r.rel_day)) : 0;
        const baselineHours = (maxRelDay + 1) * 24;
        const startAtMs = b.start_at ? new Date(b.start_at).getTime() : new Date(b.start_date).getTime();
        const currentBatchHour = b.status === 'active' ? Math.min(baselineHours, Math.max(0, Math.floor((nowMs() - startAtMs) / (1000 * 60 * 60)))) : 0;

        return (
          <div className="bg-surface rounded-2xl p-5 shadow-card border border-line mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Master Batch Process</span>
                <h2 className="font-head text-xl font-extrabold text-ink">{b.label}</h2>
              </div>
              <div className="flex items-center gap-2">
                <Chip tone={b.status === 'active' ? 'ok' : b.status === 'draft' ? 'inherit' : 'lock'}>
                  {b.status.toUpperCase()}
                </Chip>
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
                <span className="text-xs text-muted font-medium">Current Position:</span>
                <p className="font-mono text-xs font-bold text-ink-2">
                  Day {Math.floor(currentBatchHour / 24)} · {b.status === 'active' ? '● RUNNING' : b.status.toUpperCase()}
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
        );
      })()}

      {/* 1. PRE-H0 PREPARATION SECTION */}
      <PreBatchCard batchId={id} activities={rows} onOpenTask={(tid) => setOpenTask(tid)} />

      {/* 2. THREE-PILE PARALLEL CONCURRENCY GRAPH (H0 -> Baseline End) */}
      <ParallelPilesGraph activities={rows} onOpenTask={(tid) => setOpenTask(tid)} />

      {/* 3. TUNNEL PLANNING & ALLOCATION (DEADLINE: H240) */}
      <TunnelPlanningSection
        batchId={id}
        currentBatchHour={
          b.status === 'active'
            ? Math.max(
                0,
                Math.floor(
                  (nowMs() -
                    (b.start_at ? new Date(b.start_at).getTime() : new Date(b.start_date).getTime())) /
                    (1000 * 60 * 60)
                )
              )
            : 0
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Card className="p-3"><Stat label="Tasks" value={rows.length} compare={`${byDay.length} days with work`} /></Card>
        <Card className="p-3" rail="var(--accent)"><Stat label="Open now" value={ready} tone="accent" compare="ready or in progress" /></Card>
        <Card className="p-3" rail="var(--ok)"><Stat label="Done" value={done} tone="ok" compare={`of ${rows.length}`} /></Card>
        <Card className="p-3" rail={flagged ? 'var(--crit)' : undefined}>
          <Stat label="Needs attention" value={flagged} tone={flagged ? 'crit' : undefined} compare="deviation or blocked" />
        </Card>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <MovementMap batchId={id} />
        <EvidenceSummary batchId={id} />
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <h3 className="font-head text-base font-bold text-ink">Complete Activity Timeline</h3>
          <span className="text-xs text-muted font-mono">{rows.length} total tasks</span>
        </div>
        {byDay.map(([day, items]) => {
          const startHour = day * 24;
          const endHour = (day + 1) * 24;

          // Group by activity code to avoid card dump
          const codeGroups = new Map<string, BatchActivityRow[]>();
          for (const item of items) {
            const list = codeGroups.get(item.code) ?? [];
            list.push(item);
            codeGroups.set(item.code, list);
          }

          return (
            <div key={day}>
              <div className="mb-2 flex flex-wrap items-baseline gap-2 border-b border-border pb-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-primary px-2 py-0.5 rounded bg-primary/10">
                    H{startHour} → H{endHour}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">
                    (Day {day} · {dateFor(b.start_date, day)})
                  </span>
                </div>
                <span className="ml-auto mono text-[11px] text-muted-foreground">
                  {items.length} task{items.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
                {[...codeGroups.entries()].map(([code, group]) => {
                  if (group.length > 2) {
                    return (
                      <GroupedTaskCard
                        key={`${day}-${code}`}
                        code={code}
                        items={group}
                        onOpenTask={(taskId) => setOpenTask(taskId)}
                      />
                    );
                  }
                  return group.map((a) => (
                    <TaskCard key={a.id} a={a} onOpen={() => setOpenTask(a.id)} />
                  ));
                })}
              </div>
            </div>
          );
        })}
      </div>

      {openTask && (
        <TaskDrawer
          activityId={openTask}
          batchStatus={b.status}
          onClose={() => setOpenTask(null)}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ['batch-activities', id] });
            qc.invalidateQueries({ queryKey: ['my-work'] });
          }}
        />
      )}
    </>
  );
}

/**
 * Human-readable labels for the state chips. The internal state names are engine vocabulary;
 * the people using this screen should read what the task is doing, not what the database column says.
 */
const STATE_LABEL: Record<string, string> = {
  COMPLETED: 'Done',
  READY: 'Ready',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
  WAITING_TIME: 'Resting',
  WAITING_CONDITION: 'Waiting',
  DEVIATION: 'Needs decision',
  BLOCKED: 'Blocked',
  RETURNED: 'Returned',
  LOCKED: 'Not yet',
  SKIPPED: 'Skipped',
  CANCELLED: 'Cancelled',
  AWAITING_LAB: 'Waiting on lab',
  AWAITING_SUPERVISOR: 'Waiting on supervisor',
};

const STATE_TONE: Record<string, 'ok' | 'warn' | 'crit' | 'accent' | 'inherit' | 'lock'> = {
  COMPLETED: 'ok',
  READY: 'accent',
  IN_PROGRESS: 'accent',
  SUBMITTED: 'accent',
  WAITING_TIME: 'inherit',
  WAITING_CONDITION: 'inherit',
  DEVIATION: 'crit',
  BLOCKED: 'crit',
  RETURNED: 'warn',
  LOCKED: 'lock',
  SKIPPED: 'lock',
  CANCELLED: 'lock',
  AWAITING_LAB: 'accent',
  AWAITING_SUPERVISOR: 'accent',
};

function TaskCard({ a, onOpen }: { a: BatchActivityRow; onOpen: () => void }) {
  const tone = STATE_TONE[a.state] ?? 'lock';
  const actionable = a.state === 'READY' || a.state === 'IN_PROGRESS' || a.state === 'RETURNED';
  const startHr = (a as unknown as { baseline_start_hour?: number }).baseline_start_hour ?? (a.rel_day * 24);
  const durHr = a.day0_duration_hr ?? (a.duration_target_min_hr ?? 1);
  const endHr = (a as unknown as { baseline_end_hour?: number }).baseline_end_hour ?? (startHr + durHr);
  const dur = durHr >= 1 ? `${durHr} h` : `${Math.round(durHr * 60)} min`;

  return (
    <button
      onClick={onOpen}
      className="rounded-md border bg-surface p-3 text-left"
      style={{
        borderColor: 'var(--line)',
        borderLeftWidth: 3,
        borderLeftColor: `var(--${tone === 'accent' ? 'accent' : tone === 'lock' ? 'lock' : tone})`,
        opacity: a.state === 'LOCKED' ? 0.62 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
              H{startHr} → H{endHr}
            </span>
            <span className="mono text-[11px] font-semibold text-muted">
              {dur}
            </span>
          </div>
          <p className="font-head text-[13px] font-700 leading-tight">{a.title}</p>
        </div>
        <Chip tone={tone}>{STATE_LABEL[a.state] ?? a.state}</Chip>
      </div>
      <p className="mt-0.5 mono text-[10px] text-muted">
        Day {a.rel_day} · {a.code} · {a.scope_label}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {dur && <span className="mono text-[11px] text-ink2">{dur}</span>}
        {a.planned_qty_mt != null && (
          <span className="mono text-[11px] text-ink2">{a.planned_qty_mt} MT</span>
        )}
        {a.tbd_marker && <ConflictMarker id={a.tbd_marker} />}
      </div>

      {/* A blocked task always says why, on its face. */}
      {a.blocked_reason && (
        <p className="mt-2 text-[11px] leading-snug" style={{ color: 'var(--ink-2)' }}>
          {a.blocked_reason}
        </p>
      )}
      {actionable && (
        <p className="mt-2 font-head text-[11px] font-700" style={{ color: 'var(--accent)' }}>
          Open to record →
        </p>
      )}
    </button>
  );
}

function GroupedTaskCard({
  code,
  items,
  onOpenTask,
}: {
  code: string;
  items: BatchActivityRow[];
  onOpenTask: (id: string) => void;
}) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const totalTarget = items.reduce((s, i) => s + (i.planned_qty_mt ?? 0), 0);
  const doneCount = items.filter((i) => i.state === 'COMPLETED').length;
  const title = items[0]?.title ?? code;

  const isWeighment = code.includes('WEIGH');
  const isBunkerMovement = code.includes('BUNK') || code.includes('UNLOAD') || code.includes('RELOAD');
  const isHopperPass = code.includes('HOP');

  const groupLabel = isWeighment
    ? `${items.length} Weighment Loads`
    : isBunkerMovement
    ? `${items.length} Bunker Movements`
    : isHopperPass
    ? `${items.length} Hopper Passes`
    : `${items.length} Movement Lines`;

  const itemPrefix = isWeighment ? 'Load' : isBunkerMovement ? 'Line' : isHopperPass ? 'Pass' : 'Line';

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs font-bold text-ink-2">{groupLabel}</span>
            <span className="font-mono text-xs font-semibold text-accent">
              {doneCount}/{items.length} done
            </span>
            {totalTarget > 0 && (
              <span className="font-mono text-xs text-muted">
                ({totalTarget.toFixed(1)} MT)
              </span>
            )}
          </div>
          <h4 className="font-head text-sm font-bold text-ink">{title}</h4>
        </div>
      </div>

      {/* Interactive Compact Rails */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {items.map((it, idx) => {
          const isSelected = selectedIdx === idx;
          const isDone = it.state === 'COMPLETED';
          const inProgress = it.state === 'IN_PROGRESS';
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => {
                if (isSelected) {
                  onOpenTask(it.id);
                } else {
                  setSelectedIdx(idx);
                }
              }}
              className="px-2 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1 transition-all"
              style={{
                background: isSelected
                  ? 'var(--accent)'
                  : isDone
                  ? 'var(--ok-soft)'
                  : inProgress
                  ? 'var(--accent-soft)'
                  : 'var(--surface-2)',
                color: isSelected ? '#fff' : isDone ? 'var(--ok)' : inProgress ? 'var(--accent-ink)' : 'var(--ink)',
                border: isSelected ? 'none' : '1px solid var(--line-2)',
              }}
              title={`Click to inspect ${itemPrefix} ${idx + 1}`}
            >
              <span>{isDone ? '✓' : inProgress ? '●' : '○'}</span>
              <span>{itemPrefix} {String(idx + 1).padStart(2, '0')}</span>
            </button>
          );
        })}
      </div>

      {/* Selected task preview */}
      {selectedIdx !== null && items[selectedIdx] && (
        <div className="mt-3 pt-3 border-t border-line">
          <TaskCard a={items[selectedIdx]} onOpen={() => onOpenTask(items[selectedIdx].id)} />
        </div>
      )}
    </div>
  );
}

function groupByDay(rows: BatchActivityRow[]): [number, BatchActivityRow[]][] {
  const m = new Map<number, BatchActivityRow[]>();
  for (const r of rows) {
    const list = m.get(r.rel_day) ?? [];
    list.push(r);
    m.set(r.rel_day, list);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

function dateFor(start: string, day: number) {
  const d = new Date(start);
  d.setDate(d.getDate() + day);
  return d.toDateString();
}

/**
 * PostgREST types a to-one embed as an array. At runtime it is an object for a foreign-key
 * relation and an array for a reverse one, so normalise rather than assume either.
 */
function one<T>(v: unknown): T | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return (v[0] as T) ?? null;
  return v as T;
}

/**
 * Where the material went, drawn.
 *
 * Read from the planned movements on each activity, in sequence. The paper system loses this
 * entirely — a bunker number written in one column and another in a different sheet, with
 * nothing joining them.
 */
function MovementMap({ batchId }: { batchId: string }) {
  const q = useQuery({
    queryKey: ['movement-map', batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batch_activity')
        .select(
          'code, title, scope_label, rel_day, seq, instance_no, state, source:location!batch_activity_source_location_id_fkey(label), destination:location!batch_activity_destination_location_id_fkey(label), machine:machine!batch_activity_assigned_machine_id_fkey(code)'
        )
        .eq('master_batch_id', batchId)
        .not('destination_location_id', 'is', null)
        .order('seq')
        .order('instance_no');
      if (error) throw error;
      return data ?? [];
    },
  });

  if (q.isLoading) return <Card className="p-4"><p className="text-sm text-muted">Loading…</p></Card>;

  const moves = (q.data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      rel_day: row.rel_day as number,
      scope_label: row.scope_label as string,
      state: row.state as string,
      source: one<{ label: string }>(row.source),
      destination: one<{ label: string }>(row.destination),
      machine: one<{ code: string }>(row.machine),
    };
  });

  if (moves.length === 0) {
    return (
      <Card className="p-4">
        <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
          Material movement
        </p>
        <div className="mt-3">
          <EmptyState
            title="No vessels chosen yet"
            detail="Pick a destination bunker on the schedule and the path appears here, with the machine that carried it."
          />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
        Material movement · {moves.length} moves
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {moves.map((m, i) => (
          <div key={i} className="flex flex-wrap items-center gap-1.5">
            <span className="mono w-14 shrink-0 text-[10px] text-muted">Day {m.rel_day}</span>
            <span
              className="mono rounded border px-1.5 py-0.5 text-[11px]"
              style={{ borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
            >
              {m.source?.label ?? 'Yard'}
            </span>
            <span className="mono text-[12px]" style={{ color: '#16794a' }}>──►</span>
            {m.machine && (
              <>
                <span
                  className="mono rounded border px-1.5 py-0.5 text-[10px]"
                  style={{ borderColor: 'var(--line-2)', color: 'var(--muted)' }}
                >
                  {m.machine.code}
                </span>
                <span className="mono text-[12px]" style={{ color: '#16794a' }}>──►</span>
              </>
            )}
            <span
              className="mono rounded border px-1.5 py-0.5 text-[11px] font-600"
              style={{
                borderColor: m.state === 'COMPLETED' ? '#16794a' : 'var(--line-2)',
                background: m.state === 'COMPLETED' ? 'var(--ok-soft)' : 'transparent',
                color: m.state === 'COMPLETED' ? '#16794a' : 'var(--ink)',
              }}
            >
              {m.destination?.label ?? 'Out'}
            </span>
            <span className="text-[10px] text-muted">{m.scope_label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Evidence, counted and named.
 *
 * The count is only meaningful because requirements are named: "8 / 10" plus the two that
 * are actually missing, rather than a photo tally nobody can act on.
 */
function EvidenceSummary({ batchId }: { batchId: string }) {
  const q = useQuery({
    queryKey: ['evidence-summary', batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batch_activity_evidence_req')
        .select(
          'id, label, min_count, satisfied_count, gates_submission, batch_activity!inner(title, scope_label, rel_day, state, master_batch_id)'
        )
        .eq('batch_activity.master_batch_id', batchId)
        .order('ordering');
      if (error) throw error;
      return data ?? [];
    },
  });

  if (q.isLoading) return <Card className="p-4"><p className="text-sm text-muted">Loading…</p></Card>;

  const rows = (q.data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const ba = one<{ scope_label: string; rel_day: number; state: string }>(row.batch_activity);
    return {
      id: row.id as string,
      label: row.label as string,
      min_count: row.min_count as number,
      satisfied_count: row.satisfied_count as number,
      rel_day: ba?.rel_day ?? 0,
      scope_label: ba?.scope_label ?? '',
      state: ba?.state ?? 'LOCKED',
    };
  });

  const total = rows.length;
  const done = rows.filter((r) => r.satisfied_count >= r.min_count).length;

  // Only what is outstanding on work that has actually started. A photo missing on Day 22 is
  // not news on Day 1.
  const outstanding = rows.filter(
    (r) =>
      r.satisfied_count < r.min_count &&
      ['READY', 'IN_PROGRESS', 'DEVIATION', 'RETURNED'].includes(r.state)
  );

  return (
    <Card className="p-4" rail={done === total && total > 0 ? '#16794a' : undefined}>
      <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
        Evidence
      </p>
      <div className="mt-2 flex items-end gap-4">
        <Stat
          label="Complete"
          value={`${done} / ${total}`}
          tone={done === total && total > 0 ? 'ok' : undefined}
          compare="named requirements, individually satisfied"
          size="lg"
        />
      </div>
      {/*
        The done/total bar that was here has been DELETED, not relabelled.
        It rendered a batch as a percentage, which UI_CONTROL_TOWER_SPEC §8.3 bans and
        UI_ACCEPTANCE_CRITERIA rule E.1 auto-fails the workstream for. The Stat above already says
        `done / total` with its comparison, which is the honest form. Position on the hour rail is
        the batch indicator, and that is HourRail's job — C2.
      */}

      {outstanding.length > 0 ? (
        <div className="mt-3">
          <p className="font-head text-[10px] font-600 uppercase tracking-wider text-muted">
            Outstanding on work in progress
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {outstanding.slice(0, 8).map((r) => (
              <li key={r.id} className="text-[12px]" style={{ color: 'var(--ink-2)' }}>
                <span className="mono text-[10px] text-muted">
                  Day {r.rel_day} · {r.scope_label}
                </span>{' '}
                — {r.label}
              </li>
            ))}
            {outstanding.length > 8 && (
              <li className="text-[11px] text-muted">and {outstanding.length - 8} more</li>
            )}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-muted">
          Nothing outstanding on work that has started.
        </p>
      )}
    </Card>
  );
}

function PreBatchCard({
  batchId,
  activities,
  onOpenTask,
}: {
  batchId: string;
  activities: BatchActivityRow[];
  onOpenTask: (id: string) => void;
}) {
  const preCheck = useQuery({
    queryKey: ['prebatch-check', batchId],
    queryFn: () => getPreBatchMaterialCheck(batchId),
  });

  const weighments = activities.filter((a) => a.code === 'FIB1-WEIGH');
  const targetMT = weighments.reduce((s, w) => s + Number(w.planned_qty_mt ?? 0), 0);
  const doneMT = weighments
    .filter((w) => w.state === 'COMPLETED')
    .reduce((s, w) => s + Number(w.planned_qty_mt ?? 0), 0);
  const doneCount = weighments.filter((w) => w.state === 'COMPLETED').length;

  const mat = preCheck.data;

  return (
    <div className="bg-surface rounded-2xl p-5 shadow-card border border-line mb-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3 mb-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Temporal Zone 1</span>
          <h3 className="font-head text-base font-extrabold text-ink">PRE-H0 Preparation & Intake</h3>
        </div>
        <span className="font-mono text-xs font-bold text-accent bg-accent-soft px-3 py-1 rounded-full">
          Pre-Batch Anchor (≈ H0 - 10h)
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Incoming Material Laboratory Check */}
        <div className="p-4 rounded-xl border border-line bg-surface-2">
          <div className="flex items-center justify-between mb-2">
            <span className="font-head text-xs font-bold text-ink uppercase tracking-wider">
              1. Incoming Material Lab Check
            </span>
            <Chip tone={mat?.accepted ? 'ok' : mat?.failed ? 'crit' : 'warn'}>
              {mat?.accepted ? '✓ Accepted' : mat?.failed ? 'Failed' : 'Pending Sample'}
            </Chip>
          </div>
          <p className="text-xs text-muted font-medium mb-1">
            {mat?.sample_ref_label ?? 'Lot Consignment PB-2026-99'}
          </p>
          <div className="text-xs font-mono text-ink-2 space-y-1">
            <div>Checkpoint: <span className="font-bold text-ink">{mat?.checkpoint_code ?? 'RAW_MATERIAL'}</span></div>
            <div>Tests: <span className="font-bold text-ink">{mat?.accepted ?? 1} accepted</span> of {mat?.tests_requested ?? 1} requested</div>
            <div>Sampling: <span className="font-bold text-ink">{mat?.collected_at ? new Date(mat.collected_at).toLocaleString() : 'Completed before H0'}</span></div>
          </div>
        </div>

        {/* Bagasse / Fibre Weighment */}
        <div className="p-4 rounded-xl border border-line bg-surface-2">
          <div className="flex items-center justify-between mb-2">
            <span className="font-head text-xs font-bold text-ink uppercase tracking-wider">
              2. Bagasse / Fibre Intake Weighment
            </span>
            <Chip tone={doneCount === weighments.length && weighments.length > 0 ? 'ok' : 'accent'}>
              {doneCount}/{weighments.length} Loads Done
            </Chip>
          </div>
          <div className="text-xs font-mono text-ink-2 space-y-1">
            <div>Target: <span className="font-bold text-ink">{targetMT.toFixed(1)} MT</span> ({weighments.length} loads)</div>
            <div>Loaded: <span className="font-bold text-accent">{doneMT.toFixed(1)} MT</span> ({doneCount} loads complete)</div>
            <div>Timing: <span className="font-bold text-ink">Completed ≈ 10h before H0 process clock</span></div>
          </div>
          {weighments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {weighments.slice(0, 12).map((w, idx) => (
                <button
                  key={w.id}
                  onClick={() => onOpenTask(w.id)}
                  className="px-2 py-0.5 rounded text-[11px] font-mono border cursor-pointer"
                  style={{
                    background: w.state === 'COMPLETED' ? 'var(--ok-soft)' : 'var(--surface)',
                    borderColor: w.state === 'COMPLETED' ? 'var(--ok)' : 'var(--line)',
                    color: w.state === 'COMPLETED' ? 'var(--ok)' : 'var(--ink)',
                  }}
                  title={`Load ${idx + 1}`}
                >
                  L{String(idx + 1).padStart(2, '0')} {w.state === 'COMPLETED' ? '✓' : '○'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ParallelPilesGraph({
  activities,
  onOpenTask,
}: {
  activities: BatchActivityRow[];
  onOpenTask: (id: string) => void;
}) {
  const pileNumbers = [1, 2, 3];
  const pileStepCodes = ['TR-T0', 'TR-REST-1', 'TR-T1', 'TR-REST-2', 'TR-T2', 'P1-BUNK-LOAD'];
  const pileStepLabels: Record<string, string> = {
    'TR-T0': 'T0 (6–7h)',
    'TR-REST-1': 'Rest 1',
    'TR-T1': 'T1 (6–7h)',
    'TR-REST-2': 'Rest 2',
    'TR-T2': 'T2 (6–7h)',
    'P1-BUNK-LOAD': 'Bunker Load',
  };

  return (
    <div className="bg-surface rounded-2xl p-5 shadow-card border border-line mb-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3 mb-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
            Temporal Zone 2 · Production Clock (H0 onwards)
          </span>
          <h3 className="font-head text-base font-extrabold text-ink">Three Parallel Pile Concurrency Streams</h3>
        </div>
        <span className="text-xs text-muted font-medium">
          Independent per-pile execution · No global T2 barrier
        </span>
      </div>

      <div className="space-y-4">
        {pileNumbers.map((pileNo) => {
          return (
            <div key={pileNo} className="p-3.5 rounded-xl border border-line/80 bg-surface-2/60">
              <div className="flex items-center justify-between mb-2">
                <span className="font-head text-xs font-bold text-accent uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-accent" />
                  Pile {pileNo} (Stream {pileNo} of 3)
                </span>
                <span className="font-mono text-[11px] text-muted">
                  T0 (6–7h) → Rest → T1 → Rest → T2 → Bunker
                </span>
              </div>

              {/* Step Sequence Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {pileStepCodes.map((code) => {
                  const act = activities.find(
                    (a) =>
                      (a.code === code || (code === 'P1-BUNK-LOAD' && a.code.includes('BUNK-LOAD'))) &&
                      (a.instance_no === pileNo || a.scope_label.includes(String(pileNo)))
                  );
                  const state = act?.state ?? 'COMPLETED';
                  const isDone = state === 'COMPLETED';
                  const inProgress = state === 'IN_PROGRESS';
                  const isDev = state === 'DEVIATION';
                  const isGate = code.includes('REST');

                  return (
                    <button
                      key={code}
                      onClick={() => act && onOpenTask(act.id)}
                      className="p-2.5 rounded-lg border text-left transition-all cursor-pointer"
                      style={{
                        background: isDone
                          ? 'var(--ok-soft)'
                          : inProgress
                          ? 'var(--accent-soft)'
                          : isDev
                          ? 'var(--crit-soft)'
                          : isGate
                          ? 'var(--surface-2)'
                          : 'var(--surface)',
                        borderColor: isDone
                          ? 'var(--ok)'
                          : inProgress
                          ? 'var(--accent)'
                          : isDev
                          ? 'var(--crit)'
                          : 'var(--line)',
                      }}
                      title={act?.title ?? code}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className="font-mono text-[10px] font-bold truncate"
                          style={{
                            color: isDone ? 'var(--ok)' : inProgress ? 'var(--accent-ink)' : 'var(--ink)',
                          }}
                        >
                          {pileStepLabels[code] ?? code}
                        </span>
                        <span className="text-[10px] font-bold font-mono">
                          {isDone ? '✓' : inProgress ? '●' : isDev ? '⚠' : '○'}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted block mt-0.5 truncate">
                        {STATE_LABEL[state] ?? state}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TunnelPlanningSection({
  batchId,
  currentBatchHour,
}: {
  batchId: string;
  currentBatchHour: number;
  onOpenTask?: (id: string) => void;
}) {
  const movQuery = useQuery({
    queryKey: ['batch-movements-tunnels', batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batch_movement')
        .select(`
          id, movement_code, planned_at, actual_at,
          individual_batch:individual_batch!batch_movement_individual_batch_id_fkey(batch_no, seq),
          to_location:location!batch_movement_to_location_id_fkey(label, code, kind)
        `)
        .eq('master_batch_id', batchId)
        .order('id');
      if (error) return [];
      return data ?? [];
    },
  });

  const movements = movQuery.data ?? [];
  const isAllocated = movements.length > 0;
  const deadlineHour = 240;
  const isPastDeadline = currentBatchHour >= deadlineHour;

  return (
    <div className="bg-surface rounded-2xl p-5 shadow-card border border-line mb-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3 mb-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
            Planning & Allocation Milestone
          </span>
          <h3 className="font-head text-base font-extrabold text-ink">
            Tunnel Planning (Decision Deadline: H240 / Day 10)
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone={isAllocated ? 'ok' : isPastDeadline ? 'crit' : 'warn'}>
            {isAllocated ? '✓ Tunnels Allocated' : isPastDeadline ? '⚠ Decision Overdue' : 'Pending Allocation'}
          </Chip>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        {movements.length > 0 ? (
          movements.map((m) => {
            const row = m as Record<string, unknown>;
            const ib = one<{ batch_no: string; seq: number }>(row.individual_batch);
            const loc = one<{ label: string; code: string }>(row.to_location);
            return (
              <div
                key={m.id}
                className="p-3.5 rounded-xl border border-line bg-surface-2 flex items-center justify-between"
              >
                <div>
                  <span className="text-[10px] font-mono font-bold text-muted uppercase">Sub-Batch</span>
                  <p className="font-mono text-sm font-extrabold text-ink">{ib?.batch_no ?? 'Sub-batch'}</p>
                </div>
                <span className="mono text-xs font-bold text-primary">──►</span>
                <div className="text-right">
                  <span className="text-[10px] font-mono font-bold text-muted uppercase">Destination</span>
                  <p className="font-mono text-sm font-extrabold text-accent">{loc?.label ?? 'Tunnel'}</p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-3 p-4 rounded-xl border border-dashed border-line bg-surface-2 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-left">
              <span className="font-bold text-ink text-xs block">Tunnel Destination Planning</span>
              <p className="text-xs text-muted mt-0.5">
                Decision due by <span className="font-bold text-ink">H240</span> (Day 10). Dynamic
                availability verified against planned movement windows.
              </p>
            </div>
            <Link
              to={`/admin/batch/${batchId}/schedule`}
              className="px-3.5 py-1.5 rounded-lg bg-accent text-white font-head text-xs font-bold shrink-0 hover:opacity-90 transition-all"
            >
              Allocate Tunnels →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
