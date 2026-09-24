import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { loadAdminHome } from '../api/intake';
import { listBatchMonitors, type BatchMonitor } from '../../../shared/api/monitor';
import { listTickets } from '../../../shared/api/tickets';
import { loadLabApprovals } from '../../../shared/api/lab';
import { LabGateBoard } from '../../../shared/ui/domain/AdminLive';
import { ErrorPanel } from '../../../shared/ui/feedback/ErrorPanel';
import { Chip, Skeleton } from '../../../shared/ui/primitives';

/**
 * Admin home (simplified 15 Sep 2026). Three questions, top to bottom:
 *   1 · What do I want to do?      start a batch, or add one already running
 *   2 · What is waiting for me?    late tickets to decide, batches not finished setting up
 *   3 · How are the batches doing? one card per running batch: where it is, what is open, what is late
 * Every number is the server's (v_batch_monitor, v_extension_request).
 */
export function AdminHome() {
  const home = useQuery({ queryKey: ['admin-home'], queryFn: loadAdminHome, refetchInterval: 60_000 });
  const running = useQuery({ queryKey: ['batch-monitor', 'active'], queryFn: () => listBatchMonitors(['active']), refetchInterval: 60_000 });
  const tickets = useQuery({ queryKey: ['admin-tickets', 'open'], queryFn: () => listTickets('open'), refetchInterval: 30_000 });
  const approvals = useQuery({ queryKey: ['lab-approvals'], queryFn: loadLabApprovals, refetchInterval: 30_000 });

  const ticketCount = tickets.data?.length ?? 0;
  const drafts = home.data?.draft ?? [];
  const batches = running.data ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-16">
      <header>
        <h1 className="font-head text-[28px] font-800 leading-tight">Home</h1>
        <p className="mt-1 text-[15px] text-muted">
          {batches.length === 0 ? 'No batch is running.' : `${batches.length} batch${batches.length === 1 ? '' : 'es'} running`}
          {ticketCount > 0 ? ` · ${ticketCount} ticket${ticketCount === 1 ? '' : 's'} waiting for you` : ''}
        </p>
      </header>

      {/* 1 · what to do */}
      <section className="grid gap-3 sm:grid-cols-2">
        <ActionCard
          to="/admin/batch/start"
          primary
          title="Start a new batch"
          detail="The batch starts now or at a set time (H0). Every task is planned from there."
        />
        <ActionCard
          to="/admin/batch/ongoing"
          title="Add a batch already running"
          detail="Say where each part of the batch is today. Tracking starts from now."
        />
      </section>

      {/* 2 · waiting for the admin */}
      {(ticketCount > 0 || drafts.length > 0) && (
        <section className="space-y-2">
          <h2 className="font-head text-[13px] font-800 uppercase tracking-wider text-muted">Waiting for you</h2>
          {ticketCount > 0 && (
            <WaitingRow
              to="/admin/tickets"
              tone="warn"
              title={`${ticketCount} late ticket${ticketCount === 1 ? '' : 's'} to decide`}
              detail="The task stays blocked until you approve more time or reject."
            />
          )}
          {drafts.map((b) => (
            <WaitingRow
              key={b.master_batch_id}
              to={`/admin/batch/${b.master_batch_id}/prepare`}
              title={`Finish setting up ${b.code}`}
              detail="Created but not started yet."
            />
          ))}
        </section>
      )}

      {/* Lab gates: what the GM decided, with the remark (0126) */}
      <section className="space-y-2">
        <h2 className="font-head text-[13px] font-800 uppercase tracking-wider text-muted">Lab gates — GM decisions</h2>
        {approvals.error
          ? <ErrorPanel error={approvals.error} prefix="Lab gates could not be loaded." onRetry={() => approvals.refetch()} />
          : <LabGateBoard approvals={approvals.data} loading={approvals.isLoading} />}
      </section>

      {/* 3 · running batches */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-head text-[13px] font-800 uppercase tracking-wider text-muted">Running batches</h2>
          <Link to="/admin/batches" className="text-[14px] font-600">All batches →</Link>
        </div>
        {(home.isLoading || running.isLoading) && <Skeleton label="Loading batches" lines={3} />}
        {running.error && <ErrorPanel error={running.error} prefix="Batches could not be loaded." onRetry={() => running.refetch()} />}
        {running.data && batches.length === 0 && (
          <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-[15px] text-muted" style={{ borderColor: 'var(--line-2)' }}>
            Nothing is running. Use “Start a new batch” or “Add a batch already running”.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {batches.map((b) => (
            <RunningBatch key={b.master_batch_id} b={b} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ActionCard({ to, title, detail, primary }: { to: string; title: string; detail: string; primary?: boolean }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-4 rounded-2xl border p-5 no-underline transition-shadow hover:shadow-card"
      style={{
        minHeight: 108,
        borderColor: primary ? 'var(--accent)' : 'var(--line)',
        background: primary ? 'var(--accent)' : 'var(--surface)',
        color: primary ? '#fff' : 'var(--ink)',
      }}
    >
      <span>
        <span className="block font-head text-[19px] font-800 leading-tight">{title}</span>
        <span className="mt-1 block text-[14px]" style={{ opacity: primary ? 0.9 : 1, color: primary ? '#fff' : 'var(--muted)' }}>
          {detail}
        </span>
      </span>
      <span aria-hidden className="text-[24px] font-700">→</span>
    </Link>
  );
}

function WaitingRow({ to, title, detail, tone }: { to: string; title: string; detail: string; tone?: 'warn' }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3 no-underline"
      style={{
        borderColor: tone === 'warn' ? 'var(--warn)' : 'var(--line)',
        background: tone === 'warn' ? 'var(--warn-soft)' : 'var(--surface)',
        color: 'var(--ink)',
      }}
    >
      <span className="min-w-0">
        <span className="block font-head text-[16px] font-700">{title}</span>
        <span className="block text-[13px] text-muted">{detail}</span>
      </span>
      <span aria-hidden className="text-[20px]">›</span>
    </Link>
  );
}

function RunningBatch({ b }: { b: BatchMonitor }) {
  const tracked = Math.max(0, b.production_total - b.production_before_tracking);
  const pct = tracked === 0 ? 0 : Math.round((b.production_completed / tracked) * 100);
  const day = b.h0 ? Math.max(0, Math.floor((Date.now() - Date.parse(b.h0)) / 86_400_000)) : null;
  const attention = b.open_tickets > 0 || b.overdue > 0 || b.deviations > 0;

  return (
    <Link
      to={`/batch/${b.master_batch_id}`}
      className="block rounded-2xl border bg-surface p-4 no-underline transition-shadow hover:shadow-card"
      style={{ borderColor: attention ? 'var(--warn)' : 'var(--line)', color: 'var(--ink)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-head text-[20px] font-800 leading-tight">{b.batch_code}</p>
          <p className="truncate text-[13px] text-muted">
            {day !== null ? `Day ${day}` : 'Added while running'}
            {b.batch_label && b.batch_label !== b.batch_code ? ` · ${b.batch_label}` : ''}
          </p>
        </div>
        {b.is_demo && <Chip tone="warn">DEMO</Chip>}
      </div>

      <p className="mt-3 line-clamp-2 text-[14px] text-ink2">{b.current_stages ?? 'No task open right now'}</p>

      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
          <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
        </div>
        <p className="mt-1 text-[12px] text-muted">
          {b.production_completed} of {tracked} tasks done · {b.production_ready + b.production_in_progress} open now
        </p>
      </div>

      {attention && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {b.open_tickets > 0 && <Chip tone="warn">{b.open_tickets} ticket{b.open_tickets === 1 ? '' : 's'}</Chip>}
          {b.overdue > 0 && <Chip tone="warn">{b.overdue} over time</Chip>}
          {b.deviations > 0 && <Chip tone="warn">{b.deviations} deviation{b.deviations === 1 ? '' : 's'}</Chip>}
        </div>
      )}
    </Link>
  );
}
