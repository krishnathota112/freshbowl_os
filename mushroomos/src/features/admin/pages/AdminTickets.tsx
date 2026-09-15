import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { TICKET_STATUS_WORDS, decideTicket, listTickets, type Ticket } from '../../../shared/api/tickets';
import { PageHeading } from '../../../shared/ui/layout/PageHeading';
import { Chip, EmptyState, Skeleton } from '../../../shared/ui/primitives';
import { Thumb } from '../../../shared/ui/task/LateTicketPanel';
import { humanError } from '../../../shared/utils/humanError';
import { DueLine } from '../../../shared/ui/task/DueInfo';

/**
 * Admin · late-task tickets (0088). Only Admin decides: approve (granting up to the hours asked) or
 * reject, always with a reason. Every value is the server's (`v_extension_request`); photos are the
 * bound uploads, through signed URLs.
 */
export function AdminTickets() {
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const q = useQuery({ queryKey: ['admin-tickets', filter], queryFn: () => listTickets(filter), refetchInterval: 30_000 });

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-16">
      <PageHeading title="Late-task tickets" subtitle="Raised by Supervisor and Lab when work runs over its stated time" />
      <div className="flex gap-2">
        {(['open', 'all'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className="rounded-md border px-3 font-head text-[13px] font-700"
            style={{
              minHeight: 40,
              borderColor: filter === f ? 'var(--accent)' : 'var(--line-2)',
              background: filter === f ? 'var(--accent-soft)' : 'transparent',
              color: filter === f ? 'var(--accent-ink)' : 'var(--ink-2)',
            }}
          >
            {f === 'open' ? 'Waiting for decision' : 'All'}
          </button>
        ))}
      </div>
      {q.isLoading && <Skeleton label="Loading tickets" lines={3} />}
      {q.error && <EmptyState title="Tickets could not be loaded" detail={(q.error as Error).message} />}
      {q.data && q.data.length === 0 && <EmptyState title="No tickets" detail={filter === 'open' ? 'Nothing is waiting for a decision.' : 'No ticket has been raised yet.'} />}
      {(q.data ?? []).map((t) => <TicketCard key={t.id} t={t} />)}
    </div>
  );
}

function TicketCard({ t }: { t: Ticket }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState(String(t.requested_extension_hr));

  const decide = useMutation({
    mutationFn: (approve: boolean) =>
      decideTicket({
        ticketId: t.id,
        approve,
        reason: reason.trim(),
        grantedHours: approve ? Number(hours.replace(',', '.')) : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tickets'] });
      qc.invalidateQueries({ queryKey: ['batch-monitor'] });
      qc.invalidateQueries({ queryKey: ['batch-timeline'] });
      qc.invalidateQueries({ queryKey: ['activity-due'] });
    },
  });

  const open = t.status === 'REQUESTED';
  return (
    <article className="rounded-xl border bg-surface p-4" style={{ borderColor: open ? 'var(--warn)' : 'var(--line)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={t.status === 'ADMIN_APPROVED' ? 'ok' : t.status === 'ADMIN_REJECTED' ? 'crit' : 'warn'}>
          {TICKET_STATUS_WORDS[t.status] ?? t.status}
        </Chip>
        {t.overdue_at_request && <Chip tone="crit">was over its stated time</Chip>}
        {t.is_demo && <Chip tone="warn">DEMO / TEST</Chip>}
        <Link to={`/batch/${t.master_batch_id}`} className="mono text-[13px]">{t.batch_code}</Link>
      </div>
      <h3 className="mt-1 font-head text-[16px] font-800">
        {t.activity_title}{t.scope_label ? <span className="font-normal text-muted"> · {t.scope_label}</span> : null}
      </h3>
      <p className="text-[12px] text-muted">
        {t.stage ?? '—'}
        {t.duration_target_max_hr != null ? ` · stated max ${t.duration_target_max_hr} h` : ''}
        {t.actual_start ? ` · started ${new Date(t.actual_start).toLocaleString()}` : ''}
      </p>
      <p className="mt-2 text-[14px]">
        <strong>{t.requested_by_name ?? '—'}</strong> ({t.requested_by_role}) · {new Date(t.requested_at).toLocaleString()} ·{' '}
        <strong>{t.requested_extension_hr} h</strong> more asked
      </p>
      <p className="mt-1 rounded border px-3 py-2 text-[14px]" style={{ borderColor: 'var(--line)' }}>{t.requested_reason}</p>
      {/* The task's current finish time, including any extra time already granted (0100). */}
      <p className="mt-1 text-[13px]"><DueLine activityId={t.batch_activity_id} /></p>
      {t.photos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {t.photos.map((p) => <Thumb key={p.storage_path} path={p.storage_path} size={120} />)}
        </div>
      )}

      {t.admin_decision ? (
        <p className="mt-2 text-[14px] text-ink2">
          {t.admin_name ?? 'Admin'} {t.admin_decision}
          {t.admin_granted_hr ? ` · ${t.admin_granted_hr} h granted` : ''} · {t.admin_decided_at ? new Date(t.admin_decided_at).toLocaleString() : ''}: “{t.admin_reason}”
        </p>
      ) : open ? (
        <div className="mt-3 grid gap-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Reason for your decision (required)"
            className="w-full rounded border bg-surface px-2 py-2 text-[14px]"
            style={{ borderColor: 'var(--line-2)' }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[14px] text-ink2">
              Grant
              <input
                inputMode="decimal"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="mono w-20 rounded border bg-surface px-2"
                style={{ minHeight: 40, borderColor: 'var(--line-2)' }}
              />
              h (max {t.requested_extension_hr})
            </label>
            <button
              type="button"
              disabled={decide.isPending}
              onClick={() => decide.mutate(true)}
              className="rounded px-4 font-head text-[14px] font-800 disabled:opacity-60"
              style={{ minHeight: 44, background: 'var(--ok)', color: '#fff' }}
            >
              Approve
            </button>
            <button
              type="button"
              disabled={decide.isPending}
              onClick={() => decide.mutate(false)}
              className="rounded border px-4 font-head text-[14px] font-800 disabled:opacity-60"
              style={{ minHeight: 44, borderColor: 'var(--crit)', color: 'var(--crit)' }}
            >
              Reject
            </button>
          </div>
          {decide.error && (
            <p className="text-[13px]" style={{ color: 'var(--crit)' }}>
              {humanError(decide.error).title}. {humanError(decide.error).detail}
            </p>
          )}
        </div>
      ) : null}
    </article>
  );
}
