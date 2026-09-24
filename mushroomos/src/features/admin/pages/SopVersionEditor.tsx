import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { cloneSop, discardDraft, getSopVersion, insertIntoDraft, loadSopActivities, publishSop, type SopActivity } from '../api/sop';
import { setCurrentProcess } from '../api/process';
import { InsertActivityPanel, type InsertValues } from '../components/InsertActivityPanel';
import { SopLaneChart, type LaneBar } from '../components/SopLaneChart';
import { PageHeading } from '../../../shared/ui/layout/PageHeading';
import { Card, Chip, EmptyState, Skeleton } from '../../../shared/ui/primitives';
import { humanError } from '../../../shared/utils/humanError';

/**
 * Admin · SOP · one version's H0 timeline. A published version is read-only (it may already have
 * batches); "Draft a new version" copies it. A draft takes inserts (0130 draft_insert_activity — only the
 * dependent chain is re-timed), then Publish, then Make current, then new batches use it.
 */
const fmtH = (h: number | null) => (h == null ? '—' : `H${Number.isInteger(h) ? h : h.toFixed(1)}`);

export function SopVersionEditor() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const version = useQuery({ queryKey: ['sop-version', id], queryFn: () => getSopVersion(id) });
  const acts = useQuery({ queryKey: ['sop-activities', id], queryFn: () => loadSopActivities(id) });
  const [after, setAfter] = useState<SopActivity | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reason, setReason] = useState('');
  const [filter, setFilter] = useState<'work' | 'all'>('work');

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['sop-version', id] }),
    qc.invalidateQueries({ queryKey: ['sop-activities', id] }),
    qc.invalidateQueries({ queryKey: ['sop-versions'] }),
  ]);
  const fail = (e: unknown) => setMsg({ ok: false, text: humanError(e).detail || (e as Error).message });
  const clone = useMutation({ mutationFn: () => cloneSop(id), onSuccess: (nid) => nav(`/admin/sop/version/${nid}`), onError: fail });
  const publish = useMutation({ mutationFn: () => publishSop(id, reason.trim()), onSuccess: async () => { await refresh(); setMsg({ ok: true, text: 'Published. It is now frozen; make it current so new batches use it.' }); }, onError: fail });
  const makeCurrent = useMutation({ mutationFn: () => setCurrentProcess(id, reason.trim() || 'Made current from the SOP editor'), onSuccess: async () => { await refresh(); setMsg({ ok: true, text: 'This is now the current SOP. New batches are planned against it; running batches keep theirs.' }); }, onError: fail });
  const discard = useMutation({ mutationFn: () => discardDraft(id), onSuccess: () => nav('/admin/sop?tab=versions'), onError: fail });

  if (version.isLoading || acts.isLoading) return <Skeleton label="Loading the SOP timeline" lines={6} />;
  const v = version.data;
  if (!v || acts.error) return <EmptyState title="This SOP version could not be opened" detail={acts.error ? humanError(acts.error).title : 'Not found.'} />;
  const rows = acts.data ?? [];
  const isDraft = v.status === 'draft';
  const selectable = (a: SopActivity) => isDraft && a.start != null && !a.isLab && !a.isPreH0;
  const endHour = Math.max(24, ...rows.map((r) => r.end ?? 0)) + 6;
  const bars: LaneBar[] = rows.filter((r) => r.start != null && !r.isPreH0).map((r) => ({
    id: r.id, lane: r.stream, title: r.title, start: r.start!, end: r.end ?? r.start!, tone: 'plan',
    isHold: r.isHold, isLab: r.isLab, labGate: r.labGate, isNew: /^ADD\d+-/.test(r.code), selectable: selectable(r),
  }));
  const waiting = (a: SopActivity) => rows.filter((r) => r.waitsFor.includes(a.code)).map((r) => r.title);

  const submit = async (val: InsertValues) => {
    if (!after) return;
    const res = await insertIntoDraft({ definitionId: id, afterCode: after.code, templateCode: val.templateCode, title: val.title, durationHr: val.durationHr, isHold: val.isHold });
    await refresh();
    setMsg({ ok: true, text: `Added “${val.title}” after “${after.title}”. ${res.moved} downstream step${res.moved === 1 ? '' : 's'} re-timed; the SOP now runs H0 → ${fmtH(res.standardHr)}. Parallel streams kept their hours.` });
    setAfter(null);
  };

  const shown = rows.filter((r) => filter === 'all' || !r.isLab);

  return (
    <div className="mx-auto max-w-7xl pb-16">
      <PageHeading title={`${v.code} v${v.version}`} subtitle={`${v.name} · H0 → ${fmtH(v.standardHr)} · ${v.activityCount} activities`}
        right={<div className="flex items-center gap-2">
          {v.isCurrent && <Chip tone="accent">current</Chip>}
          <Chip tone={isDraft ? 'warn' : 'ok'}>{v.status}</Chip>
          <Link to="/admin/sop?tab=versions" className="rounded-lg border px-3 py-2 font-head text-[13px] font-600" style={{ borderColor: 'var(--line-2)' }}>All versions</Link>
        </div>} />

      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4" rail={isDraft ? 'var(--warn)' : 'var(--accent)'}>
        {isDraft ? (
          <>
            <span className="text-[13px]"><b>Draft.</b> Click a bar or ＋ to insert a step. Nothing live changes until you publish.</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this version (kept with the publish)"
                   className="min-w-[260px] flex-1 rounded-lg border bg-surface px-3 text-[13px]" style={{ minHeight: 40, borderColor: 'var(--line-2)' }} />
            <button type="button" disabled={publish.isPending || reason.trim().length < 5} onClick={() => publish.mutate()}
                    className="rounded-lg px-4 font-head text-[13px] font-700 disabled:opacity-40" style={{ minHeight: 40, background: 'var(--accent)', color: 'var(--on-accent)' }}>Publish</button>
            <button type="button" disabled={discard.isPending} onClick={() => discard.mutate()}
                    className="rounded-lg border px-3 font-head text-[13px] font-600" style={{ minHeight: 40, borderColor: 'var(--line-2)', color: 'var(--crit)' }}>Discard draft</button>
          </>
        ) : (
          <>
            <span className="text-[13px]"><b>Published and frozen.</b> {v.batches} running batch{v.batches === 1 ? '' : 'es'} use it. Changes go into a new version.</span>
            <button type="button" disabled={clone.isPending} onClick={() => clone.mutate()}
                    className="rounded-lg px-4 font-head text-[13px] font-700 disabled:opacity-40" style={{ minHeight: 40, background: 'var(--accent)', color: 'var(--on-accent)' }}>
              {clone.isPending ? 'Copying…' : 'Draft a new version from this'}</button>
            {!v.isCurrent && v.status === 'published' && (
              <button type="button" disabled={makeCurrent.isPending} onClick={() => makeCurrent.mutate()}
                      className="rounded-lg border px-3 font-head text-[13px] font-700" style={{ minHeight: 40, borderColor: 'var(--accent)', color: 'var(--accent-ink)' }}>Make current</button>
            )}
            <Link to={`/admin/batch/start?process=${id}`} className="rounded-lg border px-3 py-2 font-head text-[13px] font-700" style={{ borderColor: 'var(--line-2)' }}>Create a batch on this version</Link>
          </>
        )}
      </Card>

      {msg && <p className="mb-4 rounded-lg border px-4 py-3 text-[13px] font-600" style={{ borderColor: msg.ok ? 'var(--ok)' : 'var(--crit)', color: msg.ok ? 'var(--ok)' : 'var(--crit)', background: msg.ok ? 'var(--ok-soft)' : 'var(--crit-soft)' }}>{msg.text}</p>}

      <Card className="mb-4 p-4">
        <SopLaneChart bars={bars} endHour={endHour} onSelect={isDraft ? (aid) => { const a = rows.find((r) => r.id === aid); if (a) setAfter(a); } : undefined} />
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--line)' }}>
          <h2 className="font-head text-[15px] font-700">Activities in order</h2>
          <div className="flex gap-1">
            {([['work', 'Production'], ['all', 'With Lab']] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className="rounded-lg px-3 text-[12px] font-600"
                      style={{ minHeight: 34, background: filter === k ? 'var(--ink)' : 'var(--surface-2)', color: filter === k ? 'var(--surface)' : 'var(--ink-2)' }}>{l}</button>
            ))}
          </div>
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0" style={{ background: 'var(--surface-2)' }}>
              <tr className="text-[11px] uppercase tracking-wider text-muted">
                <th className="px-3 py-2">Hours</th><th className="px-3 py-2">Activity</th><th className="px-3 py-2">Waits for</th><th className="px-3 py-2 text-center">Add</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const added = /^ADD\d+-/.test(r.code);
                return (
                  <tr key={r.id} className="border-t" style={{ borderColor: 'var(--line)', background: added ? '#B3431B14' : undefined }}>
                    <td className="whitespace-nowrap px-3 py-2 font-mono font-600">{r.isPreH0 ? 'pre-H0' : `${fmtH(r.start)}–${fmtH(r.end)}`}</td>
                    <td className="px-3 py-2">
                      <span className="font-600">{r.title}</span>
                      {added && <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-700 text-white" style={{ background: '#B3431B' }}>NEW</span>}
                      {r.labGate && <span className="ml-2 text-[11px]" style={{ color: '#0E7C7B' }}>Lab gate</span>}
                      {r.isHold && <span className="ml-2 text-[11px] text-muted">passive rest</span>}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-muted">{r.waitsFor.map((c) => rows.find((x) => x.code === c)?.title ?? c).join(', ') || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      {selectable(r) ? (
                        <button type="button" onClick={() => setAfter(r)} aria-label={`Insert after ${r.title}`}
                                className="h-8 w-8 rounded-lg border text-[16px] font-700" style={{ borderColor: 'var(--accent)', color: 'var(--accent-ink)' }}>＋</button>
                      ) : <span className="text-[11px] text-muted">{isDraft ? '—' : 'frozen'}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {after && (
        <InsertActivityPanel mode="draft" afterTitle={after.title} afterEndLabel={fmtH(after.end)} templates={rows}
          waitingSteps={waiting(after)} onSubmit={submit} onClose={() => setAfter(null)} />
      )}
    </div>
  );
}

export default SopVersionEditor;
