import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { releaseElapsedRests, startActivity } from '../../../shared/api/batch';
import {
  listMyWork,
  STATE_LABEL,
  workGroupOf,
  type MyWorkRow,
} from '../../../shared/api/work';
import { PageHeading } from '../../../shared/ui/layout/PageHeading';
import { Card, EmptyState, Skeleton } from '../../../shared/ui/primitives';
import { TaskDrawer } from '../../../shared/ui/task/TaskDrawer';
import { humanError, type HumanError } from '../../../shared/utils/humanError';
import { dayLabel, isDueByToday } from '../../../shared/utils/day';
import { useAuth } from '../../../shared/auth/auth';
import { DueLine } from '../../../shared/ui/task/DueInfo';

export function MyWork() {
  const qc = useQueryClient();
  const { role } = useAuth();
  const [open, setOpen] = useState<{ id: string; batchStatus: string } | null>(null);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (key: string) => setOpenGroups((p) => ({ ...p, [key]: !p[key] }));
  const [starting, setStarting] = useState<string | null>(null);
  const [startError, setStartError] = useState<HumanError | null>(null);

  const work = useQuery({
    queryKey: ['my-work'],
    queryFn: listMyWork,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  /*
    OPERATING FLOW §4–5 (14 Sep 2026): the Supervisor sees currently executable PRODUCTION work across
    every active batch. Lab checkpoints belong to the Lab app; locked work is the engine's business and
    is shown to Admin in monitoring, not here. There is no single "current batch".
  */
  const rows = useMemo(
    () => (work.data ?? []).filter((r) => r.responsible_role !== 'lab_tech'),
    [work.data]
  );

  const mayReleaseRests = role === 'supervisor' || role === 'admin' || role === 'gm';
  const batchIds = useMemo(
    () => (mayReleaseRests ? [...new Set(rows.map((r) => r.master_batch_id))] : []),
    [rows, mayReleaseRests]
  );

  useEffect(() => {
    if (batchIds.length === 0) return;
    let cancelled = false;
    const ask = async () => {
      const results = await Promise.allSettled(batchIds.map((b) => releaseElapsedRests(b)));
      if (!cancelled && results.some((r) => r.status === 'fulfilled')) {
        qc.invalidateQueries({ queryKey: ['my-work'] });
      }
    };
    ask();
    const t = setInterval(ask, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [batchIds, qc]);

  if (work.isLoading) {
    return (
      <div className="space-y-4">
        <PageHeading title="My Work" subtitle="Loading current assignment…" />
        <Skeleton label="Loading task cards" lines={4} />
      </div>
    );
  }

  if (work.isError) {
    return (
      <>
        <PageHeading title="My Work" subtitle="One task at a time" />
        <EmptyState
          title={humanError(work.error).title}
          detail={humanError(work.error).detail}
        />
      </>
    );
  }

  /*
    THE DAY'S WORK, per batch (day plan, 15 Sep 2026). The planned time is the server's: counted from H0 for
    a new batch, from its position for an onboarded one.
      Today           running work, and work that can start now and is due today or earlier
      Due today       planned for today (or earlier) but still waiting on the step before it
      Coming up       planned for a later day — shown on request; work that is ready early can still start
    Work without a planned time (older process versions) counts as due, as before.
  */
  const executable = rows.filter((r) => ['running', 'ready'].includes(workGroupOf(r.state)));
  const done = rows.filter((r) => r.state === 'COMPLETED');
  const byPlan = (a: MyWorkRow, b: MyWorkRow) => (a.planned_start_at ?? '').localeCompare(b.planned_start_at ?? '');
  const byBatch = new Map<string, { code: string; today: MyWorkRow[]; waiting: MyWorkRow[]; later: MyWorkRow[] }>();
  const groupFor = (r: MyWorkRow) => {
    const g = byBatch.get(r.master_batch_id) ?? { code: r.batch_code, today: [], waiting: [], later: [] };
    byBatch.set(r.master_batch_id, g);
    return g;
  };
  for (const r of rows) {
    const kind = workGroupOf(r.state);
    if (kind === 'done') continue;
    const due = isDueByToday(r.planned_start_at);
    if (kind === 'running' || (kind === 'ready' && due)) groupFor(r).today.push(r);
    else if (kind === 'waiting' && due && r.planned_start_at) groupFor(r).waiting.push(r);
    else if (r.planned_start_at && !due) groupFor(r).later.push(r);
  }
  for (const g of byBatch.values()) {
    g.today.sort((a, b) => Number(workGroupOf(b.state) === 'running') - Number(workGroupOf(a.state) === 'running') || byPlan(a, b));
    g.waiting.sort(byPlan);
    g.later.sort(byPlan);
  }
  const todayCount = [...byBatch.values()].reduce((n, g) => n + g.today.length, 0);

  const handleStart = async (row: MyWorkRow) => {
    setStarting(row.activity_id);
    setStartError(null);
    try {
      await startActivity(row.activity_id);
      qc.invalidateQueries({ queryKey: ['my-work'] });
    } catch (e) {
      setStartError(humanError(e));
    } finally {
      setStarting(null);
    }
  };

  return (
    <div className="pb-20 max-w-3xl mx-auto space-y-5">
      <PageHeading
        title="My Work"
        subtitle={`${todayCount} task${todayCount === 1 ? '' : 's'} for today · ${byBatch.size} batch${byBatch.size === 1 ? '' : 'es'}`}
      />

      {startError && (
        <Card className="p-4 border-danger/40" rail="var(--danger)">
          <span className="text-[10px] font-bold uppercase tracking-widest text-danger">
            Refused by the server
          </span>
          <p className="mt-1 text-sm font-bold text-ink">{startError.title}</p>
          {startError.detail && <p className="mt-0.5 text-[12px] text-ink-2">{startError.detail}</p>}
        </Card>
      )}

      {byBatch.size === 0 && executable.length === 0 && (
        <EmptyState
          title="Nothing to do right now"
          detail="Production work appears here on the day it is planned for."
        />
      )}

      {[...byBatch.entries()].map(([id, g]) => (
        <section key={id} className="space-y-2">
          <GroupHeading tone="accent">{g.code}</GroupHeading>
          {g.today.length === 0 && (
            <p className="px-1 text-[13px] text-muted">Nothing to start today for this batch.</p>
          )}
          {g.today.map((r) => (
            <TaskCard
              key={r.activity_id}
              row={r}
              busy={starting === r.activity_id}
              onStart={() => handleStart(r)}
              onOpen={() => setOpen({ id: r.activity_id, batchStatus: 'active' })}
            />
          ))}
          <CollapsibleGroup
            title="Due today · waiting on the step before"
            count={g.waiting.length}
            open={openGroups[`${id}:waiting`] ?? false}
            onToggle={() => toggleGroup(`${id}:waiting`)}
          >
            {g.waiting.map((r) => (
              <TaskCard key={r.activity_id} row={r} onOpen={() => setOpen({ id: r.activity_id, batchStatus: 'active' })} />
            ))}
          </CollapsibleGroup>
          <CollapsibleGroup
            title="Coming up"
            count={g.later.length}
            open={openGroups[`${id}:later`] ?? false}
            onToggle={() => toggleGroup(`${id}:later`)}
          >
            {g.later.map((r) => (
              <div key={r.activity_id} className="space-y-1">
                <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-muted">{dayLabel(r.planned_start_at)}</p>
                <TaskCard
                  row={r}
                  busy={starting === r.activity_id}
                  onStart={workGroupOf(r.state) === 'ready' ? () => handleStart(r) : undefined}
                  onOpen={() => setOpen({ id: r.activity_id, batchStatus: 'active' })}
                />
              </div>
            ))}
          </CollapsibleGroup>
        </section>
      ))}


      <CollapsibleGroup
        title="Completed"
        count={done.length}
        open={completedOpen}
        onToggle={() => setCompletedOpen(!completedOpen)}
      >
        {done.map((r) => (
          <TaskCard
            key={r.activity_id}
            row={r}
            onOpen={() => setOpen({ id: r.activity_id, batchStatus: 'active' })}
          />
        ))}
      </CollapsibleGroup>

      {open && (
        <TaskDrawer
          activityId={open.id}
          batchStatus={open.batchStatus}
          onClose={() => setOpen(null)}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ['my-work'] });
            qc.invalidateQueries({ queryKey: ['batch-monitor'] });
          }}
        />
      )}
    </div>
  );
}

function GroupHeading({
  children,
  tone,
  pulse,
}: {
  children: React.ReactNode;
  tone?: 'accent';
  pulse?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-1">
      <h2
        className={`text-[12px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 ${
          tone === 'accent' ? 'text-accent' : 'text-ink-2'
        }`}
      >
        {pulse && <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />}
        {children}
      </h2>
    </div>
  );
}

function CollapsibleGroup({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="space-y-2">
      <button
        className="w-full flex items-center justify-between px-1 py-1 text-left"
        onClick={onToggle}
        aria-expanded={open}
      >
        <h2 className="text-[12px] font-mono font-bold uppercase tracking-wider text-ink-2">
          {title}
        </h2>
        <span className="text-[11px] text-muted">
          {count} {count === 1 ? 'task' : 'tasks'} {open ? '▲' : '▼'}
        </span>
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </section>
  );
}

function TaskCard({
  row,
  prominent,
  busy,
  onStart,
  onOpen,
}: {
  row: MyWorkRow;
  prominent?: boolean;
  busy?: boolean;
  onStart?: () => void;
  onOpen: () => void;
}) {
  const group = workGroupOf(row.state);
  const evidenceShort =
    row.required_count != null &&
    row.satisfied_total != null &&
    row.satisfied_total < row.required_count;

  if (prominent) {
    return (
      <div className="mos-next-card p-6 text-white shadow-raised overflow-hidden">
        <div className="flex items-start justify-between gap-3 relative z-10">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-extrabold uppercase tracking-wider text-white">
                {group === 'running' ? '⚡ IN PROGRESS' : '▶ READY TO START'}
              </span>
              <span className="font-mono text-xs font-bold text-white/90 bg-black/20 px-2 py-0.5 rounded-md">
                {row.batch_code}
              </span>
            </div>
            <h3 className="font-head font-extrabold text-xl text-white leading-tight">
              {row.title}
              {row.scope_label && <span className="font-normal text-white/80"> · {row.scope_label}</span>}
            </h3>
            <p className="text-xs text-white/80 mt-1">{row.stage ?? row.code}</p>
          </div>
          {row.variance_minutes != null && row.variance_minutes !== 0 && (
            <div className="text-right shrink-0 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20">
              <span className="text-[9px] font-bold uppercase tracking-wider text-white/70">
                Variance
              </span>
              <p className="font-mono text-sm font-bold text-white">
                {formatVariance(row.variance_minutes)}
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-white/15 flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/90 relative z-10">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">schedule</span>
            Planned: <strong className="font-mono">{formatWindow(row.planned_start_at, row.planned_end_at)}</strong>
          </span>
          {group !== 'done' && (
            <span className="flex items-center gap-1">
              <DueLine activityId={row.activity_id} tone="light" />
            </span>
          )}
          {row.required_count ? (
            <span className={`flex items-center gap-1 ${evidenceShort ? 'text-amber-200 font-bold' : ''}`}>
              <span className="material-symbols-outlined text-sm">photo_camera</span>
              Evidence: <strong className="font-mono">{row.satisfied_total ?? 0}/{row.required_count}</strong>
            </span>
          ) : null}
        </div>

        <div className="mt-5 flex gap-3 relative z-10">
          {group === 'ready' && onStart && !row.is_hold && (
            <button
              className="flex-1 rounded-xl bg-white text-accent font-head font-extrabold py-3.5 px-4 text-sm shadow-card tappable flex items-center justify-center gap-2 disabled:opacity-60"
              onClick={onStart}
              disabled={busy}
            >
              <span className="material-symbols-outlined text-lg">play_arrow</span>
              {busy ? 'Starting…' : 'Start Task Now'}
            </button>
          )}
          <button
            className={`rounded-xl border border-white/30 bg-white/15 backdrop-blur-md text-white font-head font-bold py-3.5 px-5 text-sm tappable flex items-center justify-center gap-2 ${
              group === 'ready' && onStart ? '' : 'flex-1 bg-white text-accent font-extrabold'
            }`}
            onClick={onOpen}
          >
            <span className="material-symbols-outlined text-lg">
              {group === 'running' ? 'arrow_forward' : 'open_in_new'}
            </span>
            {group === 'running' ? 'Continue Task' : group === 'done' ? 'View Record' : 'Open Details'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <Card
      className="p-4.5 border border-line"
      rail={
        group === 'running'
          ? 'var(--accent)'
          : group === 'waiting'
            ? 'var(--muted)'
            : group === 'done'
              ? 'var(--ok)'
              : undefined
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StateTag state={row.state} isHold={row.is_hold} />
            <span className="font-mono text-[11px] text-muted font-semibold bg-surface-2 px-2 py-0.5 rounded">
              {row.batch_code}
            </span>
          </div>
          <h3 className="mt-1.5 font-head font-bold text-base text-ink">
            {row.title}
            {row.scope_label && <span className="text-muted font-normal"> · {row.scope_label}</span>}
          </h3>
          <p className="text-[11px] text-muted">{row.stage ?? row.code}</p>
          {row.overdue && (
            <p className="mt-1 text-[12px] font-bold" style={{ color: 'var(--crit)' }}>
              Over its stated time{row.latest_ticket_status === 'REQUESTED' ? ' · ticket sent to Admin' : ' · open the task to raise a ticket'}
            </p>
          )}
        </div>
        {row.variance_minutes != null && row.variance_minutes !== 0 && (
          <div className="text-right shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
              Variance
            </span>
            <p
              className={`font-mono text-sm font-bold ${row.variance_minutes > 0 ? 'text-warn' : 'text-ok'}`}
            >
              {formatVariance(row.variance_minutes)}
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-2">
        {row.baseline_start_hour !== null && <strong className="font-mono">Planned H{row.baseline_start_hour}</strong>}
        <span>
          Planned <strong className="font-mono">{formatWindow(row.planned_start_at, row.planned_end_at)}</strong>
        </span>
        {group !== 'done' && <DueLine activityId={row.activity_id} />}
        {row.actual_start && (
          <span>
            Started <strong className="font-mono">{formatInstant(row.actual_start)}</strong>
          </span>
        )}
        {row.actual_end && (
          <span>
            Finished <strong className="font-mono">{formatInstant(row.actual_end)}</strong>
          </span>
        )}
        {row.required_count ? (
          <span className={evidenceShort ? 'text-warn font-bold' : ''}>
            Evidence{' '}
            <strong className="font-mono">
              {row.satisfied_total ?? 0}/{row.required_count}
            </strong>
          </span>
        ) : null}
      </div>

      {row.blocked_reason && group === 'waiting' && (
        <div className="mt-3 rounded-xl bg-surface-2 border border-line px-3 py-2 text-[12px]">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
            Why this is locked
          </span>
          <p className="text-ink mt-0.5 font-medium">{row.blocked_reason}</p>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        {group === 'ready' && onStart && !row.is_hold && (
          <button
            className="flex-1 rounded-xl bg-accent text-white font-head font-bold py-3 text-sm shadow-card tappable flex items-center justify-center gap-1.5 disabled:opacity-60"
            onClick={onStart}
            disabled={busy}
          >
            <span className="material-symbols-outlined text-base">play_arrow</span>
            {busy ? 'Starting…' : 'Start task'}
          </button>
        )}
        <button
          className={`rounded-xl border border-line font-head font-bold py-3 text-sm px-4 text-ink hover:bg-surface-2 tappable ${
            group === 'ready' && onStart ? '' : 'flex-1'
          }`}
          onClick={onOpen}
        >
          {group === 'running' ? 'Continue task' : group === 'done' ? 'View record' : row.is_hold ? 'Confirm when the condition is met' : 'Open'}
        </button>
      </div>
    </Card>
  );
}

function StateTag({ state, isHold }: { state: string; isHold?: boolean }) {
  if (isHold) {
    return (
      <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full bg-surface-2 text-muted">
        Resting — nobody performs this
      </span>
    );
  }
  const group = workGroupOf(state);
  const cls =
    group === 'running'
      ? 'bg-accent/15 text-accent'
      : group === 'ready'
        ? 'bg-ok/15 text-ok'
        : group === 'done'
          ? 'bg-surface-2 text-muted'
          : 'bg-warn/15 text-warn';
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full ${cls}`}>
      {STATE_LABEL[state] ?? state}
    </span>
  );
}

function formatVariance(minutes: number): string {
  const sign = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

function formatInstant(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatWindow(start: string | null, end: string | null): string {
  if (!start && !end) return '—';
  const t = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
  return `${t(start)} → ${t(end)}`;
}

export default MyWork;
