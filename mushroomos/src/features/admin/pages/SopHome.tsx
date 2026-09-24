import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';

import { cloneSop, listSopBatches, listSopVersions, type SopVersion } from '../api/sop';
import { EmptyState, Skeleton } from '../../../shared/ui/primitives';
import { humanError } from '../../../shared/utils/humanError';

/**
 * Admin · SOP. Two jobs, kept apart on purpose:
 *   Running batches — change ONE batch that is already on the floor (an amendment).
 *   SOP versions    — change the process for batches that have not started (draft → publish → current).
 */
export function SopHome() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'versions' ? 'versions' : 'batches';
  const setTab = (t: string) => setParams(t === 'batches' ? {} : { tab: t }, { replace: true });

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <header className="mb-6">
        <h1 className="font-head text-[28px] font-800">SOP</h1>
        <p className="mt-1 text-[14px] text-muted">What do you want to change?</p>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-2" role="tablist" aria-label="What to change">
        {([
          ['batches', 'A batch that is running', 'Add a step to one batch on the floor. Only that batch changes.'],
          ['versions', 'The SOP for future batches', 'Draft a new version, publish it, make it current.'],
        ] as const).map(([k, title, sub]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className="rounded-xl border px-5 py-4 text-left transition-colors"
                  style={{ borderColor: tab === k ? 'var(--accent)' : 'var(--line)', background: tab === k ? 'var(--accent-soft)' : 'var(--surface)' }}>
            <span className="block font-head text-[16px] font-700">{title}</span>
            <span className="mt-1 block text-[13px] text-ink2">{sub}</span>
          </button>
        ))}
      </div>

      {tab === 'batches' ? <BatchList /> : <VersionList />}
    </div>
  );
}

function BatchList() {
  const q = useQuery({ queryKey: ['sop-batches'], queryFn: listSopBatches, refetchInterval: 60_000 });
  if (q.isLoading) return <Skeleton label="Reading running batches" lines={4} />;
  if (q.error) return <EmptyState title="Batches could not be loaded" detail={humanError(q.error).title} />;
  const rows = q.data ?? [];
  if (rows.length === 0) return <p className="text-[14px] text-muted">No batches are running.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((b) => (
        <li key={b.id}>
          <Link to={`/admin/sop/batch/${b.id}`} className="flex items-center gap-4 rounded-xl border bg-surface px-5 py-4 transition-colors hover:border-[var(--accent)]"
                style={{ borderColor: 'var(--line)' }}>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-head text-[17px] font-700">{b.code}</span>
                {b.isDemo && <span className="text-[11px] font-700 text-muted">DEMO</span>}
                {b.status === 'draft' && <span className="text-[11px] font-700" style={{ color: 'var(--warn)' }}>DRAFT</span>}
              </div>
              <div className="truncate text-[13px] text-ink2">
                <span className="font-mono">{b.currentHour != null ? `H${b.currentHour.toFixed(0)}` : 'no H0'}</span>
                {' · '}{b.runningNow ?? b.nextUp ?? 'nothing running'}
              </div>
              <div className="text-[12px] text-muted">{b.sop}{b.amendments ? ` · ${b.amendments} added step${b.amendments > 1 ? 's' : ''}` : ''}</div>
            </div>
            <span className="font-head text-[13px] font-700" style={{ color: 'var(--accent-ink)' }}>Open →</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function VersionList() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['sop-versions'], queryFn: listSopVersions });
  const [err, setErr] = useState<string | null>(null);
  const clone = useMutation({
    mutationFn: (v: SopVersion) => cloneSop(v.id),
    onSuccess: (id) => nav(`/admin/sop/version/${id}`),
    onError: (e) => setErr(humanError(e).detail || (e as Error).message),
  });
  if (q.isLoading) return <Skeleton label="Reading SOP versions" lines={4} />;
  if (q.error) return <EmptyState title="SOP versions could not be loaded" detail={humanError(q.error).title} />;
  const rows = (q.data ?? []).filter((v) => v.status !== 'archived');
  const current = rows.find((v) => v.isCurrent);
  const drafts = rows.filter((v) => v.status === 'draft');
  const others = rows.filter((v) => !v.isCurrent && v.status === 'published');

  const Row = ({ v }: { v: SopVersion }) => (
    <li className="flex items-center gap-4 border-t px-5 py-3" style={{ borderColor: 'var(--line)' }}>
      <div className="min-w-0 flex-1">
        <span className="font-head text-[15px] font-700">{v.code} <span className="text-muted">v{v.version}</span></span>
        <div className="text-[12px] text-muted">H0 → H{v.standardHr ?? '—'} · {v.batches} running batch{v.batches === 1 ? '' : 'es'}</div>
      </div>
      <Link to={`/admin/sop/version/${v.id}`} className="text-[13px] font-700" style={{ color: 'var(--accent-ink)' }}>{v.status === 'draft' ? 'Edit' : 'View'}</Link>
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      {err && <p className="rounded-lg px-3 py-2 text-[13px] font-600" style={{ background: 'var(--crit-soft)', color: 'var(--crit)' }}>{err}</p>}
      {current && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-surface px-5 py-5" style={{ borderColor: 'var(--accent)' }}>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-700 uppercase tracking-wider" style={{ color: 'var(--accent-ink)' }}>Current SOP · new batches use this</p>
            <p className="font-head text-[20px] font-800">{current.code} <span className="text-muted">v{current.version}</span></p>
            <p className="text-[13px] text-muted">H0 → H{current.standardHr ?? '—'} · {current.activityCount} steps · {current.batches} running batch{current.batches === 1 ? '' : 'es'}</p>
          </div>
          <div className="flex gap-2">
            <Link to={`/admin/sop/version/${current.id}`} className="rounded-lg border px-4 py-2 text-[13px] font-600" style={{ borderColor: 'var(--line-2)' }}>View</Link>
            <button type="button" disabled={clone.isPending} onClick={() => clone.mutate(current)} className="rounded-lg px-4 text-[13px] font-700 disabled:opacity-40"
                    style={{ minHeight: 40, background: 'var(--accent)', color: 'var(--on-accent)' }}>{clone.isPending ? 'Copying…' : 'Draft a change'}</button>
          </div>
        </div>
      )}
      {drafts.length > 0 && (
        <section className="overflow-hidden rounded-xl border bg-surface" style={{ borderColor: 'var(--line)' }}>
          <h2 className="px-5 pt-4 pb-2 font-head text-[14px] font-700">Drafts in progress</h2>
          <ul>{drafts.map((v) => <Row key={v.id} v={v} />)}</ul>
        </section>
      )}
      <section className="overflow-hidden rounded-xl border bg-surface" style={{ borderColor: 'var(--line)' }}>
        <h2 className="px-5 pt-4 pb-2 font-head text-[14px] font-700">Earlier versions</h2>
        <ul>{others.map((v) => <Row key={v.id} v={v} />)}</ul>
      </section>
    </div>
  );
}

export default SopHome;
