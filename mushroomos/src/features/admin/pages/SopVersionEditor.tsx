import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { cloneSop, discardDraft, getSopVersion, insertIntoDraft, loadSopActivities, publishSop, type SopActivity } from '../api/sop';
import { setCurrentProcess } from '../api/process';
import { InsertActivityPanel, type InsertValues } from '../components/InsertActivityPanel';
import { SopLaneChart, type LaneBar } from '../components/SopLaneChart';
import { StepGroups, type StepRow } from '../components/StepGroups';
import { EmptyState, Skeleton } from '../../../shared/ui/primitives';
import { humanError } from '../../../shared/utils/humanError';

/**
 * Admin · SOP · one version. Published = read-only (batches may run on it); "Draft a new version" copies it.
 * A draft takes inserts (0130 draft_insert_activity — only the dependent chain is re-timed), then
 * Publish → Make current → new batches use it. Same layout as the batch page: steps left, one panel right.
 */
const fmtH = (h: number | null) => (h == null ? '—' : `H${Number.isInteger(h) ? h : h.toFixed(1)}`);

export function SopVersionEditor() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const version = useQuery({ queryKey: ['sop-version', id], queryFn: () => getSopVersion(id) });
  const acts = useQuery({ queryKey: ['sop-activities', id], queryFn: () => loadSopActivities(id) });
  const [afterId, setAfterId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reason, setReason] = useState('');
  const [view, setView] = useState<'list' | 'timeline'>('list');
  const [showLab, setShowLab] = useState(false);

  const refresh = () => Promise.all(['sop-version', 'sop-activities', 'sop-versions'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
  const fail = (e: unknown) => setMsg({ ok: false, text: humanError(e).detail || (e as Error).message });
  const clone = useMutation({ mutationFn: () => cloneSop(id), onSuccess: (nid) => nav(`/admin/sop/version/${nid}`), onError: fail });
  const publish = useMutation({ mutationFn: () => publishSop(id, reason.trim()), onSuccess: async () => { await refresh(); setMsg({ ok: true, text: 'Published and frozen. Make it current so new batches use it.' }); }, onError: fail });
  const makeCurrent = useMutation({ mutationFn: () => setCurrentProcess(id, reason.trim() || 'Made current from the SOP editor'), onSuccess: async () => { await refresh(); setMsg({ ok: true, text: 'This is now the current SOP. New batches use it; running batches keep theirs.' }); }, onError: fail });
  const discard = useMutation({ mutationFn: () => discardDraft(id), onSuccess: () => nav('/admin/sop?tab=versions'), onError: fail });

  if (version.isLoading || acts.isLoading) return <Skeleton label="Loading the SOP" lines={6} />;
  const v = version.data;
  if (!v || acts.error) return <EmptyState title="This SOP version could not be opened" detail={acts.error ? humanError(acts.error).title : 'Not found.'} />;
  const rows = acts.data ?? [];
  const isDraft = v.status === 'draft';
  const after = rows.find((r) => r.id === afterId) ?? null;
  const canAdd = (a: SopActivity) => isDraft && a.start != null && !a.isLab && !a.isPreH0;
  const end = Math.max(24, ...rows.map((r) => r.end ?? 0));
  const stepRows: StepRow[] = rows.filter((r) => r.start != null && !r.isPreH0).map((r) => ({
    id: r.id, title: r.title, stream: r.stream, scopeLabel: /TRN-P(\d)/.exec(r.code) ? `Pile ${/TRN-P(\d)/.exec(r.code)![1]}` : null,
    isLab: r.isLab, isHold: r.isHold, labGate: r.labGate, start: r.start, end: r.end, tone: 'plan',
    note: `${fmtH(r.start)}–${fmtH(r.end)}`, isNew: /^ADD\d+-/.test(r.code), canAdd: canAdd(r),
  }));
  const bars: LaneBar[] = rows.filter((r) => r.start != null && !r.isPreH0).map((r) => ({
    id: r.id, lane: r.stream, title: r.title, start: r.start!, end: r.end ?? r.start!, tone: 'plan',
    isHold: r.isHold, isLab: r.isLab, labGate: r.labGate, isNew: /^ADD\d+-/.test(r.code), selectable: canAdd(r),
  }));
  const waiting = (a: SopActivity) => rows.filter((r) => r.waitsFor.includes(a.code)).map((r) => r.title);

  const submit = async (val: InsertValues) => {
    if (!after) return;
    const res = await insertIntoDraft({ definitionId: id, afterCode: after.code, templateCode: val.templateCode, title: val.title, durationHr: val.durationHr, isHold: val.isHold });
    await refresh();
    setMsg({ ok: true, text: `“${val.title}” added after “${after.title}”. ${res.moved} later step${res.moved === 1 ? '' : 's'} re-timed; the SOP now runs H0 → ${fmtH(res.standardHr)}. Parallel streams kept their hours.` });
    setAfterId(null);
  };

  return (
    <div className="mx-auto max-w-6xl pb-16">
      <Link to="/admin/sop?tab=versions" className="text-[13px] font-600 text-muted">← SOP versions</Link>
      <header className="mt-2 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-head text-[28px] font-800 leading-tight">{v.code} <span className="text-muted">v{v.version}</span></h1>
          <p className="mt-1 text-[14px] text-ink2">
            <span className="rounded-full px-2 py-0.5 text-[12px] font-700" style={{ background: isDraft ? 'var(--warn-soft)' : 'var(--ok-soft)', color: isDraft ? 'var(--warn)' : 'var(--ok)' }}>{isDraft ? 'Draft' : 'Published'}</span>
            {v.isCurrent && <span className="ml-2 rounded-full px-2 py-0.5 text-[12px] font-700" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}>Current SOP</span>}
            <span className="ml-2">H0 → <span className="font-mono">{fmtH(v.standardHr)}</span> · {v.activityCount} steps · {v.batches} running batch{v.batches === 1 ? '' : 'es'}</span>
          </p>
        </div>
        <div className="flex rounded-lg p-1" style={{ background: 'var(--surface-2)' }} role="group" aria-label="View">
          {([['list', 'Steps'], ['timeline', 'Timeline']] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className="rounded-md px-3 text-[13px] font-600"
                    style={{ minHeight: 34, background: view === k ? 'var(--surface)' : 'transparent', boxShadow: view === k ? 'var(--shadow-card)' : 'none' }}>{l}</button>
          ))}
        </div>
      </header>

      {msg && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-[14px] font-600"
             style={{ background: msg.ok ? 'var(--ok-soft)' : 'var(--crit-soft)', color: msg.ok ? 'var(--ok)' : 'var(--crit)' }}>
          <span>{msg.text}</span><button type="button" onClick={() => setMsg(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          {view === 'list' ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[13px] text-muted">{isDraft ? <>Pick <b>＋ Add after</b> on the step the new work should follow.</> : 'Published versions are frozen. Draft a new version to change it.'}</p>
                <label className="flex items-center gap-2 text-[13px] text-ink2">
                  <input type="checkbox" checked={showLab} onChange={(e) => setShowLab(e.target.checked)} className="h-4 w-4" /> Show Lab checks
                </label>
              </div>
              <StepGroups rows={stepRows} selectedId={afterId} onAdd={setAfterId} showLab={showLab} />
            </>
          ) : (
            <div className="rounded-xl border bg-surface p-4" style={{ borderColor: 'var(--line)' }}>
              <SopLaneChart bars={bars} endHour={end + 6} selectedId={afterId} onSelect={isDraft ? setAfterId : undefined} />
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          {after ? (
            <InsertActivityPanel key={after.id} mode="draft" afterTitle={after.title} afterEndLabel={fmtH(after.end)} templates={rows}
              waitingSteps={waiting(after)} onSubmit={submit} onClose={() => setAfterId(null)} />
          ) : isDraft ? (
            <div className="flex flex-col gap-3 rounded-xl border bg-surface px-5 py-5" style={{ borderColor: 'var(--line)' }}>
              <h2 className="font-head text-[16px] font-700">Finish this draft</h2>
              <ol className="flex flex-col gap-2 text-[13px] text-ink2">
                <li><b className="text-ink">1 · Add or adjust steps</b> with ＋ Add after.</li>
                <li><b className="text-ink">2 · Publish</b> — it becomes frozen.</li>
                <li><b className="text-ink">3 · Make it current</b> — new batches use it.</li>
              </ol>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this version (kept with the publish)" aria-label="Why this version"
                     className="rounded-lg border bg-surface px-3 text-[13px]" style={{ minHeight: 40, borderColor: 'var(--line-2)' }} />
              <button type="button" disabled={publish.isPending || reason.trim().length < 5} onClick={() => publish.mutate()}
                      className="rounded-lg font-head text-[14px] font-700 disabled:opacity-40" style={{ minHeight: 44, background: 'var(--accent)', color: 'var(--on-accent)' }}>Publish</button>
              <button type="button" disabled={discard.isPending} onClick={() => discard.mutate()} className="text-[13px] font-600" style={{ color: 'var(--crit)' }}>Discard this draft</button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-xl border bg-surface px-5 py-5" style={{ borderColor: 'var(--line)' }}>
              <h2 className="font-head text-[16px] font-700">What you can do</h2>
              <button type="button" disabled={clone.isPending} onClick={() => clone.mutate()}
                      className="rounded-lg font-head text-[14px] font-700 disabled:opacity-40" style={{ minHeight: 44, background: 'var(--accent)', color: 'var(--on-accent)' }}>
                {clone.isPending ? 'Copying…' : 'Draft a new version from this'}</button>
              {!v.isCurrent && (
                <button type="button" disabled={makeCurrent.isPending} onClick={() => makeCurrent.mutate()}
                        className="rounded-lg border font-head text-[14px] font-700" style={{ minHeight: 44, borderColor: 'var(--accent)', color: 'var(--accent-ink)' }}>Make this the current SOP</button>
              )}
              <Link to={`/admin/batch/start?process=${id}`} className="flex items-center justify-center rounded-lg border font-head text-[14px] font-600"
                    style={{ minHeight: 44, borderColor: 'var(--line-2)' }}>Create a batch on this version</Link>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default SopVersionEditor;
