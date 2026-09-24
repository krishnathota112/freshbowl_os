import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { amendBatch, listAmendments, listSopBatches, loadBatchTasks, loadBatchWaits, loadSopActivities, type BatchTask } from '../api/sop';
import { InsertActivityPanel, type InsertValues } from '../components/InsertActivityPanel';
import { SopLaneChart, type LaneBar, type LaneTone } from '../components/SopLaneChart';
import { StepGroups, type StepRow } from '../components/StepGroups';
import { STATE_LABEL } from '../../../shared/api/work';
import { EmptyState, Skeleton } from '../../../shared/ui/primitives';
import { humanError } from '../../../shared/utils/humanError';

/**
 * Admin · SOP · one running batch. Left: the batch's steps, grouped by part of the floor, in process
 * order. Right: one thing at a time — a short guide, or the three-stage "add a step" panel. Adding a step
 * amends THIS batch only (0130/0132): frozen plan untouched, only the dependent chain moves in the forecast.
 */
const DONE = new Set(['COMPLETED', 'SKIPPED', 'CANCELLED']);
const toneOf = (t: BatchTask): LaneTone =>
  t.beforeTracking || DONE.has(t.state) ? 'done'
    : ['IN_PROGRESS', 'SUBMITTED', 'AWAITING_LAB', 'AWAITING_SUPERVISOR'].includes(t.state) ? 'active'
    : t.state === 'READY' ? 'ready'
    : ['BLOCKED', 'LOCKED', 'DEVIATION', 'RETURNED'].includes(t.state) ? 'blocked'
    : t.state === 'NOT_DUE_YET' ? 'notdue' : 'waiting';
const fmtH = (h: number | null) => (h == null ? '—' : `H${Number.isInteger(h) ? h : h.toFixed(1)}`);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export function SopBatchEditor() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const batches = useQuery({ queryKey: ['sop-batches'], queryFn: listSopBatches });
  const batch = batches.data?.find((b) => b.id === id) ?? null;
  const tasks = useQuery({ queryKey: ['sop-batch-tasks', id], queryFn: () => loadBatchTasks(id), refetchInterval: 60_000 });
  const waits = useQuery({ queryKey: ['sop-batch-waits', id], queryFn: () => loadBatchWaits(id) });
  const amendments = useQuery({ queryKey: ['sop-amendments', id], queryFn: () => listAmendments(id) });
  const templates = useQuery({ queryKey: ['sop-activities', batch?.definitionId], queryFn: () => loadSopActivities(batch!.definitionId), enabled: !!batch });

  const [afterId, setAfterId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'timeline'>('list');
  const [showLab, setShowLab] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const rows = tasks.data ?? [];
  const after = rows.find((r) => r.id === afterId) ?? null;
  const h0 = useMemo(() => {
    const t = rows.find((r) => r.plannedStartAt && r.planStart != null);
    return t ? new Date(t.plannedStartAt!).getTime() - t.planStart! * 3600_000 : null;
  }, [rows]);
  const toH = (iso: string | null) => (iso && h0 != null ? (new Date(iso).getTime() - h0) / 3600_000 : null);
  const planEnd = Math.max(0, ...rows.filter((r) => !r.isAmendment).map((r) => r.planEnd ?? 0));
  const forecastEnd = Math.max(0, ...rows.map((r) => toH(r.projectedEndAt) ?? r.planEnd ?? 0));
  const canAdd = (t: BatchTask) => !t.beforeTracking && !DONE.has(t.state) && t.planStart != null && !t.isLab;
  const late = forecastEnd > planEnd + 0.5;

  const stepRows: StepRow[] = rows.filter((r) => r.planStart != null).map((r) => {
    const tone = toneOf(r);
    const moved = r.delayMinutes != null && r.delayMinutes >= 30 && tone !== 'done';
    return {
      id: r.id, title: r.title, stream: r.stream, scopeLabel: r.scopeLabel, isLab: r.isLab, isHold: r.isHold, labGate: r.labGate,
      start: r.planStart, end: r.planEnd, tone,
      stateLabel: r.beforeTracking ? 'Before tracking' : tone === 'done' ? 'Done' : STATE_LABEL[r.state] ?? r.state,
      note: moved ? `forecast +${(r.delayMinutes! / 60).toFixed(1)} h` : undefined, noteTone: moved ? 'late' : 'muted',
      isNew: r.isAmendment, canAdd: canAdd(r),
    };
  });
  const bars: LaneBar[] = rows.filter((r) => r.planStart != null).map((r) => ({
    id: r.id, lane: r.stream, title: r.title, start: r.planStart!, end: r.planEnd ?? r.planStart!,
    projStart: toH(r.projectedStartAt), projEnd: toH(r.projectedEndAt), tone: toneOf(r),
    isHold: r.isHold, isLab: r.isLab, labGate: r.labGate, isNew: r.isAmendment, selectable: canAdd(r),
  }));
  const dependentsOf = (t: BatchTask) => rows.filter((r) => (waits.data?.get(r.code) ?? []).includes(t.code)).map((r) => r.title);
  const current = rows.find((r) => toneOf(r) === 'active') ?? rows.find((r) => toneOf(r) === 'ready') ?? null;

  const submit = async (v: InsertValues) => {
    if (!after) return;
    const before = forecastEnd;
    await amendBatch({ batchId: id, afterActivityId: after.id, ...v });
    await Promise.all(['sop-batch-tasks', 'sop-batch-waits', 'sop-amendments', 'sop-batches', 'vessels'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    const fresh = await qc.fetchQuery({ queryKey: ['sop-batch-tasks', id], queryFn: () => loadBatchTasks(id) });
    const nowEnd = Math.max(0, ...fresh.map((r) => toH(r.projectedEndAt) ?? r.planEnd ?? 0));
    const deps = dependentsOf(after);
    setDone(`“${v.title}” added after “${after.title}”. ${deps.length ? `${deps.join(', ')} now wait${deps.length === 1 ? 's' : ''} for it. ` : ''}` +
      `Forecast finish ${fmtH(Math.round(before * 10) / 10)} → ${fmtH(Math.round(nowEnd * 10) / 10)}.`);
    setAfterId(null);
  };

  if (tasks.isLoading || batches.isLoading) return <Skeleton label="Loading the batch" lines={6} />;
  if (tasks.error || !batch) return <EmptyState title="This batch could not be opened" detail={tasks.error ? humanError(tasks.error).title : 'No draft or running batch with that id.'} />;

  return (
    <div className="mx-auto max-w-6xl pb-16">
      <Link to="/admin/sop" className="text-[13px] font-600 text-muted">← SOP</Link>
      <header className="mt-2 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-head text-[28px] font-800 leading-tight">Batch {batch.code}</h1>
          <p className="mt-1 text-[14px] text-ink2">
            <span className="font-mono">{batch.currentHour != null ? `H${batch.currentHour.toFixed(1)}` : 'no H0 yet'}</span>
            {current ? <> · now: <b>{current.title}</b></> : null}
            {' · '}finish <span className="font-mono">{fmtH(planEnd)}</span> planned,{' '}
            <span className="font-mono" style={{ color: late ? 'var(--crit)' : 'var(--ok)' }}>{fmtH(Math.round(forecastEnd * 10) / 10)}</span> forecast
          </p>
          <p className="text-[12px] text-muted">{batch.sop}{batch.isDemo ? ' · demo batch' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg p-1" style={{ background: 'var(--surface-2)' }} role="group" aria-label="View">
            {([['list', 'Steps'], ['timeline', 'Timeline']] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className="rounded-md px-3 text-[13px] font-600"
                      style={{ minHeight: 34, background: view === k ? 'var(--surface)' : 'transparent', boxShadow: view === k ? 'var(--shadow-card)' : 'none' }}>{l}</button>
            ))}
          </div>
          <Link to={`/batch/${id}`} className="rounded-lg border px-3 py-2 text-[13px] font-600" style={{ borderColor: 'var(--line-2)' }}>Batch monitor</Link>
        </div>
      </header>

      {done && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-[14px]" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>
          <span className="font-600">{done} The frozen plan is unchanged.</span>
          <button type="button" onClick={() => setDone(null)} aria-label="Dismiss" className="text-[16px]">×</button>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          {view === 'list' ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[13px] text-muted">Pick <b>＋ Add after</b> on the step the new work should follow.</p>
                <label className="flex items-center gap-2 text-[13px] text-ink2">
                  <input type="checkbox" checked={showLab} onChange={(e) => setShowLab(e.target.checked)} className="h-4 w-4" /> Show Lab checks
                </label>
              </div>
              <StepGroups rows={stepRows} selectedId={afterId} onAdd={setAfterId} showLab={showLab} />
            </>
          ) : (
            <div className="rounded-xl border bg-surface p-4" style={{ borderColor: 'var(--line)' }}>
              <p className="mb-3 text-[13px] text-muted">Click a bar to add a step after it. Red strips show where the forecast has moved.</p>
              <SopLaneChart bars={bars} endHour={Math.max(planEnd, forecastEnd) + 6} nowHour={batch.currentHour} selectedId={afterId} onSelect={setAfterId} />
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          {after ? (
            <InsertActivityPanel key={after.id} mode="batch" afterTitle={after.title} afterEndLabel={`${fmtH(after.planEnd)} · ${when(after.plannedStartAt)}`}
              templates={templates.data ?? []} waitingSteps={dependentsOf(after)} onSubmit={submit} onClose={() => setAfterId(null)} />
          ) : (
            <div className="rounded-xl border bg-surface px-5 py-5" style={{ borderColor: 'var(--line)' }}>
              <h2 className="font-head text-[16px] font-700">Change this batch</h2>
              <ol className="mt-3 flex flex-col gap-3 text-[13px] text-ink2">
                <li><b className="text-ink">1 · Pick where.</b> ＋ Add after on any step that has not finished.</li>
                <li><b className="text-ink">2 · Describe the work.</b> Type, name, hours.</li>
                <li><b className="text-ink">3 · Add checks if needed.</b> Lab readings, cleaning.</li>
                <li><b className="text-ink">4 · Confirm with a reason.</b> Only the steps after it move.</li>
              </ol>
            </div>
          )}

          {(amendments.data ?? []).length > 0 && (
            <div className="rounded-xl border bg-surface px-5 py-4" style={{ borderColor: 'var(--line)' }}>
              <h2 className="font-head text-[14px] font-700">Changes to this batch</h2>
              <ul className="mt-2 flex flex-col">
                {amendments.data!.map((a) => (
                  <li key={a.id} className="border-t py-2.5 text-[13px]" style={{ borderColor: 'var(--line)' }}>
                    <div className="flex items-baseline justify-between gap-2">
                      <b>{a.title}</b>
                      <span className="font-mono text-[12px] text-muted">{fmtH(a.newStart)}–{fmtH(a.newEnd)}</span>
                    </div>
                    <div className="text-[12px] text-muted">after {a.afterTitle} · {a.createdBy ?? 'Admin'} · {when(a.createdAt)}</div>
                    <div className="text-[12px] text-ink2">“{a.reason}”</div>
                    {(a.labTasks.length > 0 || a.cleaningJobs.length > 0) && (
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
                        {a.labTasks.map((l) => (
                          <span key={l.title} style={{ color: a.labGate ? 'var(--crit)' : 'var(--ink-2)' }}>
                            ● Lab {l.title.startsWith('Lab check before') ? 'before' : 'after'} · {a.labGate ? 'gate' : 'record'} · {(STATE_LABEL[l.state] ?? l.state).toLowerCase()}
                          </span>
                        ))}
                        {a.cleaningJobs.map((c) => (
                          <span key={c.label} style={{ color: c.state === 'DONE' ? 'var(--ok)' : 'var(--warn)' }}>● Clean {c.label} · {c.state.toLowerCase()}</span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default SopBatchEditor;
