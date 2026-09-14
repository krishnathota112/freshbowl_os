import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { listBatchMonitors, type BatchMonitor } from '../../admin/api/monitor';
import { PageHeading } from '../../../shared/ui/layout/PageHeading';
import { Chip, EmptyState, Skeleton } from '../../../shared/ui/primitives';

/**
 * GM · process progress, read-only (operating flow §1, 14 Sep 2026).
 *
 * One card per running batch: batch, stage, progress, status. Large type, few words — the screen is
 * for a quick look on a phone. Every number is the server's (`v_batch_monitor`, 0086). There is no
 * action here: lab approvals are on their own screen, and execution belongs to Supervisor and Lab.
 */
export function GmProgress() {
  const q = useQuery({ queryKey: ['batch-monitor', 'active'], queryFn: () => listBatchMonitors(['active']), refetchInterval: 60_000 });

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-16">
      <PageHeading title="Process progress" subtitle="Running batches · read-only" />
      {q.isLoading && <Skeleton label="Loading batches" lines={4} />}
      {q.error && <EmptyState title="Progress could not be loaded" detail={(q.error as Error).message} />}
      {q.data && q.data.length === 0 && <EmptyState title="No batch is running" detail="Batches appear here once they are activated." />}
      {(q.data ?? []).map((b) => (
        <ProgressCard key={b.master_batch_id} b={b} />
      ))}
      <p className="text-center text-[14px]">
        <Link to="/lab/approvals">Go to lab approvals →</Link>
      </p>
    </div>
  );
}

function ProgressCard({ b }: { b: BatchMonitor }) {
  const tracked = Math.max(0, b.production_total - b.production_before_tracking);
  const pct = tracked === 0 ? 0 : Math.round((b.production_completed / tracked) * 100);
  const attention = b.awaiting_gm > 0 || b.overdue > 0 || b.deviations > 0;

  return (
    <article className="rounded-2xl border bg-surface p-5" style={{ borderColor: attention ? 'var(--warn)' : 'var(--line)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-head text-[22px] font-800">{b.batch_code}</h2>
        {b.is_demo && <Chip tone="warn">DEMO / TEST</Chip>}
      </div>
      <p className="mt-1 text-[16px] text-ink2">{b.current_stages ?? 'No open production work'}</p>

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] text-ink2">Progress</span>
          <span className="mono text-[20px] font-800">{pct}%</span>
        </div>
        <div className="mt-1 h-3 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
          <div className="h-3 rounded-full" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
        </div>
        <p className="mt-1 text-[13px] text-muted">
          {b.production_completed} of {tracked} production steps done{b.onboarded ? ' since tracking began' : ''}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-[16px]">
        <Status label="Awaiting your approval" value={b.awaiting_gm} warn />
        <Status label="Lab in progress" value={b.lab_pending} />
        <Status label="Over stated time" value={b.overdue} warn />
        <Status label="Deviations" value={b.deviations} warn />
      </div>
    </article>
  );
}

function Status({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  const hot = warn && value > 0;
  return (
    <div className="rounded-xl border px-3 py-2" style={{ borderColor: hot ? 'var(--warn)' : 'var(--line)', background: hot ? 'var(--warn-soft)' : 'transparent' }}>
      <p className="text-[12px] text-muted">{label}</p>
      <p className="mono text-[22px] font-800" style={{ color: hot ? 'var(--warn)' : 'var(--ink)' }}>{value}</p>
    </div>
  );
}
