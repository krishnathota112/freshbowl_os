import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';

import { cloneSop, listSopBatches, listSopVersions, type SopVersion } from '../api/sop';
import { PageHeading } from '../../../shared/ui/layout/PageHeading';
import { Card, Chip, EmptyState, Skeleton } from '../../../shared/ui/primitives';
import { humanError } from '../../../shared/utils/humanError';

/**
 * Admin · SOP. Two ways to change the process, kept apart on purpose:
 *   Running batches — open a batch's own H0 timeline and add a step for THAT batch (an amendment).
 *   SOP versions    — draft a new version, edit it, publish it; only FUTURE batches use it.
 */
export function SopHome() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'versions' ? 'versions' : 'batches';
  const setTab = (t: string) => setParams(t === 'batches' ? {} : { tab: t }, { replace: true });

  return (
    <div className="mx-auto max-w-6xl pb-16">
      <PageHeading title="SOP" subtitle="Change a running batch, or draft a new SOP version for future batches" />
      <nav className="mb-4 flex gap-1" aria-label="SOP views">
        {[['batches', 'Running batches'], ['versions', 'SOP versions']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}
                  className="rounded-t border-b-2 px-3 font-head text-[13px] font-700"
                  style={{ minHeight: 40, borderColor: tab === k ? 'var(--accent)' : 'transparent', color: tab === k ? 'var(--accent-ink)' : 'var(--muted)' }}>
            {l}
          </button>
        ))}
      </nav>
      {tab === 'batches' ? <BatchList /> : <VersionList />}
    </div>
  );
}

function BatchList() {
  const q = useQuery({ queryKey: ['sop-batches'], queryFn: listSopBatches, refetchInterval: 60_000 });
  if (q.isLoading) return <Skeleton label="Reading running batches" lines={4} />;
  if (q.error) return <EmptyState title="Batches could not be loaded" detail={humanError(q.error).title} />;
  const rows = q.data ?? [];
  return (
    <>
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted">
              <th className="px-4 py-3">Batch</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Now</th>
              <th className="px-4 py-3">SOP</th><th className="px-4 py-3">Changes</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                <td className="px-4 py-3">
                  <div className="font-head text-[15px] font-700">{b.code}</div>
                  <div className="text-[11px] text-muted">{b.label !== b.code ? b.label : ''}{b.isDemo ? ' · demo' : ''}</div>
                </td>
                <td className="px-4 py-3"><Chip tone={b.status === 'active' ? 'ok' : 'muted'}>{b.status}</Chip></td>
                <td className="px-4 py-3">
                  <div>{b.runningNow ?? b.nextUp ?? '—'}</div>
                  <div className="font-mono text-[11px] text-muted">{b.currentHour != null ? `H${b.currentHour.toFixed(1)}` : 'no H0 yet'}</div>
                </td>
                <td className="px-4 py-3"><span className="rounded border px-2 py-1 font-mono text-[11px]" style={{ borderColor: 'var(--line-2)' }}>{b.sop}</span></td>
                <td className="px-4 py-3">{b.amendments ? <Chip tone="warn">{b.amendments} added step{b.amendments > 1 ? 's' : ''}</Chip> : <span className="text-muted">none</span>}</td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/admin/sop/batch/${b.id}`} className="inline-flex items-center rounded-lg border px-3 font-head text-[13px] font-700"
                        style={{ minHeight: 40, borderColor: 'var(--accent)', color: 'var(--accent-ink)' }}>＋ Edit timeline</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-4 py-6 text-[14px] text-muted">No draft or running batches.</p>}
      </Card>
      <p className="mt-3 rounded-lg border px-4 py-3 text-[12px]" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
        Adding a step to a running batch changes <b>only that batch</b>. Its frozen plan stays on record; the new step gets its own plan and the steps after it wait for it.
        To change the SOP for batches that have not started yet, use <b>SOP versions</b>.
      </p>
    </>
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
  return (
    <div className="flex flex-col gap-3">
      {err && <p className="rounded-lg border px-3 py-2 text-[13px] font-600" style={{ borderColor: 'var(--crit)', color: 'var(--crit)' }}>{err}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((v) => (
          <Card key={v.id} className="flex flex-col gap-3 p-4" rail={v.isCurrent ? 'var(--accent)' : v.status === 'draft' ? 'var(--warn)' : undefined}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-head text-[17px] font-800">{v.code} <span className="text-muted">v{v.version}</span></div>
                <div className="text-[12px] text-muted">{v.name}</div>
              </div>
              <div className="flex gap-1">
                {v.isCurrent && <Chip tone="accent">current</Chip>}
                <Chip tone={v.status === 'published' ? 'ok' : 'warn'}>{v.status}</Chip>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-[12px] text-ink2">
              <span><b className="font-mono">H0 → H{v.standardHr ?? '—'}</b></span>
              <span>{v.activityCount} activities</span>
              <span>{v.batches} running batch{v.batches === 1 ? '' : 'es'}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to={`/admin/sop/version/${v.id}`} className="inline-flex items-center rounded-lg border px-3 font-head text-[13px] font-700"
                    style={{ minHeight: 40, borderColor: 'var(--line-2)' }}>{v.status === 'draft' ? 'Edit draft' : 'View timeline'}</Link>
              {v.status === 'published' && (
                <button type="button" disabled={clone.isPending} onClick={() => clone.mutate(v)}
                        className="rounded-lg px-3 font-head text-[13px] font-700 disabled:opacity-40"
                        style={{ minHeight: 40, background: 'var(--accent)', color: 'var(--on-accent)' }}>
                  {clone.isPending && clone.variables?.id === v.id ? 'Copying…' : 'Draft a new version from this'}
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default SopHome;
