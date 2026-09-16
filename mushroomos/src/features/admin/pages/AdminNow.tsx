import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { loadBatchActivitiesNow, loadBatchesNow, type ActivityNow, type BatchNow } from '../../../shared/api/projection';
import { PageHeading } from '../../../shared/ui/layout/PageHeading';
import { Chip, EmptyState, Skeleton } from '../../../shared/ui/primitives';

/**
 * Admin · Now (spec §14). Each running batch on its OWN process clock: H0, the current H-hour, what is running,
 * what is waiting and why, what is late, and where the dependency projection says the work has moved to.
 * Every number comes from the backend (v_batch_projection / project_batch, migration 0109).
 */
const hm = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const hourLabel = (h: number | null) => (h === null ? 'H0 not recorded' : `H${h}`);

const STREAM_WORDS: Record<string, string> = {
  PRIMARY_FIBRE: 'Bagasse',
  STRUCTURAL_STRAW: 'Paddy',
  NITROGEN_MINERAL: 'Chicken manure',
  YARD: 'Yard and Turner',
  BUNKER: 'Bunkers',
  TUNNEL: 'Tunnel',
};

export function AdminNow() {
  const batches = useQuery({ queryKey: ['batches-now'], queryFn: loadBatchesNow, refetchInterval: 60_000 });
  const [open, setOpen] = useState<string | null>(null);

  const rows = batches.data ?? [];

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <PageHeading title="Now" subtitle="Every running batch on its own process clock" />
      {batches.isLoading && <Skeleton label="Reading the process clock" lines={4} />}
      {batches.error && <EmptyState title="Now could not be loaded" detail={(batches.error as Error).message} />}
      {batches.data && rows.length === 0 && (
        <EmptyState title="No batch is running" detail="Start a batch, or add one that is already running, from Home." />
      )}

      <div className="grid gap-4">
        {rows.map((b) => (
          <BatchCard key={b.master_batch_id} b={b} open={open === b.master_batch_id} onToggle={() => setOpen(open === b.master_batch_id ? null : b.master_batch_id)} />
        ))}
      </div>
    </div>
  );
}

function BatchCard({ b, open, onToggle }: { b: BatchNow; open: boolean; onToggle: () => void }) {
  const attention = b.late > 0 || b.blocked > 0;
  return (
    <article className="rounded-2xl border bg-surface p-4" style={{ borderColor: attention ? 'var(--warn)' : 'var(--line)' }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-head text-[22px] font-800 leading-tight">{b.batch_code}</h2>
            {b.is_demo && <Chip tone="warn">DEMO</Chip>}
            {b.onboarded && <Chip tone="muted">added while running</Chip>}
          </div>
          <p className="text-[13px] text-muted">
            H0 {hm(b.h0)} · now <strong className="mono text-ink">{hourLabel(b.current_hour)}</strong>
          </p>
        </div>
        <Link to={`/batch/${b.master_batch_id}`} className="text-[14px] font-600">Open batch →</Link>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
        <Stat label="Done" value={b.finished} />
        <Stat label="Running" value={b.running} />
        <Stat label="Ready" value={b.ready_now} />
        <Stat label="Blocked" value={b.blocked} warn={b.blocked > 0} />
        <Stat label="Late" value={b.late} warn={b.late > 0} />
        <Stat label="Later" value={b.not_due_yet} />
      </dl>

      <p className="mt-3 text-[14px] text-ink2">
        {b.running_now ? <>Running now: <strong className="text-ink">{b.running_now}</strong>. </> : null}
        {b.next_up ? <>Next: <strong className="text-ink">{b.next_up}</strong>. </> : null}
        {b.projected_finish ? <>Projected finish {hm(b.projected_finish)}.</> : null}
      </p>

      <button
        type="button"
        onClick={onToggle}
        className="mt-3 w-full rounded-lg border font-head text-[14px] font-700"
        style={{ minHeight: 44, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
      >
        {open ? 'Hide the detail' : 'What is happening, waiting and blocked'}
      </button>

      {open && <BatchDetailNow batchId={b.master_batch_id} />}
    </article>
  );
}

function BatchDetailNow({ batchId }: { batchId: string }) {
  const q = useQuery({
    queryKey: ['batch-now', batchId],
    queryFn: () => loadBatchActivitiesNow(batchId),
    refetchInterval: 60_000,
  });
  if (q.isLoading) return <Skeleton label="Reading the dependency graph" lines={3} />;
  if (q.error) return <p className="mt-3 text-[13px]" style={{ color: 'var(--crit)' }}>{(q.error as Error).message}</p>;

  const rows = q.data ?? [];
  const running = rows.filter((r) => r.actual_start && !r.actual_end);
  const ready = rows.filter((r) => !r.actual_start && ['READY', 'RETURNED'].includes(r.state));
  const blocked = rows.filter((r) => r.blocked_reason && r.blocked_reason !== 'Planned for later' && !r.actual_start);
  const late = rows.filter((r) => !r.actual_end && r.planned_end_at && Date.parse(r.planned_end_at) < Date.now());
  const next = rows
    .filter((r) => !r.actual_start && !ready.includes(r) && !blocked.includes(r))
    .sort((a, b) => (a.projected_start_at ?? '').localeCompare(b.projected_start_at ?? ''))
    .slice(0, 5);

  return (
    <div className="mt-4 grid gap-4">
      <Group title="Running now" rows={running} empty="Nothing is running." />
      <Group title="Ready to start" rows={ready} empty="Nothing is ready." />
      <Group title="Waiting / blocked" rows={blocked} empty="Nothing is blocked." showBlocker />
      <Group title="Late" rows={late} empty="Nothing is late." />
      <Group title="Coming next" rows={next} empty="Nothing left to plan." />
    </div>
  );
}

function Group({ title, rows, empty, showBlocker }: { title: string; rows: ActivityNow[]; empty: string; showBlocker?: boolean }) {
  return (
    <section>
      <h3 className="mb-1 font-head text-[12px] font-800 uppercase tracking-wider text-muted">
        {title} {rows.length > 0 && <span className="mono">· {rows.length}</span>}
      </h3>
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted">{empty}</p>
      ) : (
        <ul className="grid gap-1.5">
          {rows.slice(0, 12).map((r) => (
            <li key={r.activity_id} className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--line)' }}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-head text-[15px] font-700">
                  {r.title}
                  {r.scope_label && r.scope_label !== 'Whole batch' ? <span className="font-400 text-muted"> · {r.scope_label}</span> : null}
                </span>
                <span className="text-[12px] text-muted">{STREAM_WORDS[r.stream ?? ''] ?? r.stream}</span>
              </div>
              <p className="mt-0.5 text-[12px] text-ink2">
                <span className="text-muted">Planned</span> {hm(r.planned_start_at)} → {hm(r.planned_end_at)}
                {r.actual_start && <> · <span className="text-muted">Started</span> {hm(r.actual_start)}</>}
                {!r.actual_end && r.projected_end_at && (
                  <> · <span className="text-muted">Projected end</span> <strong className="text-ink">{hm(r.projected_end_at)}</strong></>
                )}
                {r.delay_minutes != null && r.delay_minutes > 5 && !r.actual_end && (
                  <> · <span style={{ color: 'var(--warn)' }}>{Math.round(r.delay_minutes / 60)} h behind the baseline</span></>
                )}
              </p>
              {showBlocker && r.blocked_reason && (
                <p className="mt-0.5 text-[12px] font-600" style={{ color: 'var(--warn)' }}>{r.blocked_reason}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-xl py-2" style={{ background: warn ? 'var(--warn-soft)' : 'var(--surface-2)' }}>
      <dd className="mono text-[18px] font-800" style={{ color: warn ? 'var(--warn)' : 'var(--ink)' }}>{value}</dd>
      <dt className="text-[11px] text-muted">{label}</dt>
    </div>
  );
}

export default AdminNow;
