import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { amendBatch, listAmendments, listSopBatches, loadBatchTasks, loadBatchWaits, loadSopActivities, type BatchTask } from '../api/sop';
import { InsertActivityPanel, type InsertValues } from '../components/InsertActivityPanel';
import { SopLaneChart, type LaneBar, type LaneTone } from '../components/SopLaneChart';
import { STATE_LABEL } from '../../../shared/api/work';
import { PageHeading } from '../../../shared/ui/layout/PageHeading';
import { Card, Chip, EmptyState, Skeleton, type Tone } from '../../../shared/ui/primitives';
import { humanError } from '../../../shared/utils/humanError';

/**
 * Admin · SOP · one batch's timeline, H0 to the end, with a ＋ after every step that has not been
 * passed. Adding a step here amends THIS batch only (0130 amend_batch_add_activity): the frozen plan
 * stays, the new step gets its own plan, the steps after it wait for it, and the forecast shows the effect.
 */
const DONE = new Set(['COMPLETED', 'SKIPPED', 'CANCELLED']);
const toneOf = (t: BatchTask): LaneTone =>
  t.beforeTracking || DONE.has(t.state) ? 'done'
    : ['IN_PROGRESS', 'SUBMITTED', 'AWAITING_LAB', 'AWAITING_SUPERVISOR'].includes(t.state) ? 'active'
    : t.state === 'READY' ? 'ready'
    : ['BLOCKED', 'LOCKED', 'DEVIATION', 'RETURNED'].includes(t.state) ? 'blocked'
    : t.state === 'NOT_DUE_YET' ? 'notdue' : 'waiting';
const CHIP: Record<LaneTone, Tone> = { plan: 'muted', done: 'lock', active: 'accent', ready: 'ok', waiting: 'warn', blocked: 'crit', notdue: 'muted' };
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

  const [after, setAfter] = useState<BatchTask | null>(null);
  const [filter, setFilter] = useState<'all' | 'work' | 'lab'>('work');
  const [done, setDone] = useState<string | null>(null);

  const rows = tasks.data ?? [];
  const h0 = useMemo(() => {
    const t = rows.find((r) => r.plannedStartAt && r.planStart != null);
    return t ? new Date(t.plannedStartAt!).getTime() - t.planStart! * 3600_000 : null;
  }, [rows]);
  const toH = (iso: string | null) => (iso && h0 != null ? (new Date(iso).getTime() - h0) / 3600_000 : null);
  const endHour = Math.max(24, ...rows.map((r) => r.planEnd ?? 0), ...rows.map((r) => toH(r.projectedEndAt) ?? 0)) + 6;
  const planEnd = Math.max(0, ...rows.filter((r) => !r.isAmendment).map((r) => r.planEnd ?? 0));
  const forecastEnd = Math.max(0, ...rows.map((r) => toH(r.projectedEndAt) ?? r.planEnd ?? 0));
  const current = rows.find((r) => toneOf(r) === 'active') ?? rows.find((r) => toneOf(r) === 'ready') ?? null;
  const canInsertAfter = (t: BatchTask) => !t.beforeTracking && !DONE.has(t.state) && t.planStart != null && !t.isLab;

  const bars: LaneBar[] = rows.filter((r) => r.planStart != null).map((r) => ({
    id: r.id, lane: r.stream, title: r.title, start: r.planStart!, end: r.planEnd ?? r.planStart!,
    projStart: toH(r.projectedStartAt), projEnd: toH(r.projectedEndAt), tone: toneOf(r),
    isHold: r.isHold, isLab: r.isLab, labGate: r.labGate, isNew: r.isAmendment, selectable: canInsertAfter(r),
  }));

  const dependentsOf = (t: BatchTask) =>
    rows.filter((r) => (waits.data?.get(r.code) ?? []).includes(t.code)).map((r) => r.title);

  const submit = async (v: InsertValues) => {
    if (!after) return;
    const before = forecastEnd;
    await amendBatch({ batchId: id, afterActivityId: after.id, ...v });
    await Promise.all(['sop-batch-tasks', 'sop-batch-waits', 'sop-amendments', 'sop-batches', 'vessels'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    const fresh = await qc.fetchQuery({ queryKey: ['sop-batch-tasks', id], queryFn: () => loadBatchTasks(id) });
    const nowEnd = Math.max(0, ...fresh.map((r) => toH(r.projectedEndAt) ?? r.planEnd ?? 0));
    const deps = dependentsOf(after);
    setDone(`Added “${v.title}” (${v.durationHr} h) after “${after.title}”. ${deps.length ? `Now waiting for it: ${deps.join(', ')}. ` : ''}` +
      `Forecast finish ${fmtH(Math.round(before * 10) / 10)} → ${fmtH(Math.round(nowEnd * 10) / 10)}. The frozen plan is unchanged.`);
    setAfter(null);
  };

  if (tasks.isLoading || batches.isLoading) return <Skeleton label="Loading the batch timeline" lines={6} />;
  if (tasks.error || !batch) return <EmptyState title="This batch could not be opened" detail={tasks.error ? humanError(tasks.error).title : 'No draft or running batch with that id.'} />;

  const shown = rows.filter((r) => filter === 'all' || (filter === 'lab' ? r.isLab : !r.isLab));

  return (
    <div className="mx-auto max-w-7xl pb-16">
      <PageHeading title={`Batch ${batch.code}`} subtitle={`${batch.sop} · worked timeline H0 → ${fmtH(planEnd)} · click a bar or ＋ to add a step after it`}
        right={<div className="flex gap-2"><Link to="/admin/sop" className="rounded-lg border px-3 py-2 font-head text-[13px] font-600" style={{ borderColor: 'var(--line-2)' }}>Back to SOP</Link>
          <Link to={`/batch/${id}`} className="rounded-lg border px-3 py-2 font-head text-[13px] font-600" style={{ borderColor: 'var(--line-2)' }}>Batch monitor</Link></div>} />

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <Stat label="Batch hour now" value={batch.currentHour != null ? `H${batch.currentHour.toFixed(1)}` : 'no H0'} />
        <Stat label="Current position" value={current ? current.title : '—'} small />
        <Stat label="Frozen plan ends" value={fmtH(planEnd)} />
        <Stat label="Forecast ends" value={fmtH(Math.round(forecastEnd * 10) / 10)} tone={forecastEnd > planEnd + 0.5 ? 'var(--crit)' : undefined} />
      </div>

      {done && (
        <p className="mb-4 rounded-lg border px-4 py-3 text-[13px] font-600" style={{ borderColor: 'var(--ok)', color: 'var(--ok)', background: 'var(--ok-soft)' }}>{done}</p>
      )}

      <Card className="mb-4 p-4">
        <SopLaneChart bars={bars} endHour={endHour} nowHour={batch.currentHour}
          onSelect={(bid) => { const t = rows.find((r) => r.id === bid); if (t) setAfter(t); }} />
      </Card>

      {(amendments.data ?? []).length > 0 && (
        <Card className="mb-4 p-4" rail="#B3431B">
          <h2 className="mb-2 font-head text-[15px] font-700">Steps added to this batch</h2>
          <ul className="grid gap-2">
            {amendments.data!.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 border-t pt-2 text-[13px]" style={{ borderColor: 'var(--line)' }}>
                <span><b>{a.title}</b> · {a.durationHr} h{a.isHold ? ' rest' : ''} after “{a.afterTitle}” · <span className="font-mono">{fmtH(a.newStart)}–{fmtH(a.newEnd)}</span></span>
                <span className="text-[12px] text-muted">
                  {a.reason} · {a.createdBy ?? 'Admin'} · {when(a.createdAt)}
                </span>
                {(a.labTasks.length > 0 || a.cleaningJobs.length > 0) && (
                  <span className="flex w-full flex-wrap gap-1.5">
                    {a.labTasks.map((l) => (
                      <Chip key={l.title} tone={a.labGate ? 'crit' : 'muted'}>{l.title.replace(/:.*$/, '')} · {a.labParams.length} readings · {a.labGate ? 'gate' : 'record'} · {STATE_LABEL[l.state] ?? l.state}</Chip>
                    ))}
                    {a.cleaningJobs.map((c) => (
                      <Chip key={c.label} tone={c.state === 'DONE' ? 'ok' : 'warn'}>Clean {c.label} · {c.state.toLowerCase()}{a.cleanWait ? ' · work waits' : ''}</Chip>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--line)' }}>
          <h2 className="font-head text-[15px] font-700">Worked timeline</h2>
          <div className="flex gap-1">
            {([['work', 'Production'], ['lab', 'Lab'], ['all', 'All']] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className="rounded-lg px-3 text-[12px] font-600"
                      style={{ minHeight: 34, background: filter === k ? 'var(--ink)' : 'var(--surface-2)', color: filter === k ? 'var(--surface)' : 'var(--ink-2)' }}>{l}</button>
            ))}
          </div>
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0" style={{ background: 'var(--surface-2)' }}>
              <tr className="text-[11px] uppercase tracking-wider text-muted">
                <th className="px-3 py-2">Planned</th><th className="px-3 py-2">Time</th><th className="px-3 py-2">Activity</th>
                <th className="px-3 py-2">State</th><th className="px-3 py-2">Forecast</th><th className="px-3 py-2 text-center">Add</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const tone = toneOf(r);
                const moved = r.delayMinutes != null && Math.abs(r.delayMinutes) >= 30 && tone !== 'done';
                return (
                  <tr key={r.id} className="border-t" style={{ borderColor: 'var(--line)', background: r.isAmendment ? '#B3431B14' : tone === 'done' ? 'var(--surface-2)' : undefined, boxShadow: current?.id === r.id ? 'inset 4px 0 var(--accent)' : undefined }}>
                    <td className="whitespace-nowrap px-3 py-2 font-mono font-600">{fmtH(r.planStart)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-[12px] text-muted">{when(r.plannedStartAt)}</td>
                    <td className="px-3 py-2">
                      <span className={tone === 'done' ? 'text-muted' : 'font-600'}>{r.title}</span>
                      {r.isAmendment && <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-700 text-white" style={{ background: '#B3431B' }}>ADDED</span>}
                      {r.labGate && <span className="ml-2 text-[11px]" style={{ color: '#0E7C7B' }}>Lab gate</span>}
                      {r.isHold && <span className="ml-2 text-[11px] text-muted">passive rest</span>}
                      {r.scopeLabel && r.scopeLabel !== 'Whole batch' && <span className="ml-2 text-[11px] text-muted">{r.scopeLabel}</span>}
                    </td>
                    <td className="px-3 py-2"><Chip tone={CHIP[tone]}>{r.beforeTracking ? 'Before tracking' : STATE_LABEL[r.state] ?? r.state}</Chip></td>
                    <td className="whitespace-nowrap px-3 py-2 text-[12px]" style={{ color: moved && r.delayMinutes! > 0 ? 'var(--crit)' : 'var(--ink-2)' }}>
                      {tone === 'done' ? (r.actualEnd ? `done ${when(r.actualEnd)}` : '') : moved ? `${r.delayMinutes! > 0 ? '+' : ''}${(r.delayMinutes! / 60).toFixed(1)} h · ${when(r.projectedStartAt)}` : 'on plan'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {canInsertAfter(r) ? (
                        <button type="button" onClick={() => setAfter(r)} aria-label={`Add a step after ${r.title}`}
                                className="h-8 w-8 rounded-lg border text-[16px] font-700" style={{ borderColor: 'var(--accent)', color: 'var(--accent-ink)' }}>＋</button>
                      ) : <span className="text-[11px] text-muted">{tone === 'done' ? 'Completed' : '—'}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {after && (
        <InsertActivityPanel mode="batch" afterTitle={after.title} afterEndLabel={`${fmtH(after.planEnd)} · ${when(after.plannedStartAt)}`}
          templates={templates.data ?? []} waitingSteps={dependentsOf(after)} onSubmit={submit} onClose={() => setAfter(null)} />
      )}
    </div>
  );
}

function Stat({ label, value, tone, small }: { label: string; value: string; tone?: string; small?: boolean }) {
  return (
    <Card className="p-3">
      <div className="text-[11px] font-600 uppercase tracking-wider text-muted">{label}</div>
      <div className={`font-head font-800 ${small ? 'text-[15px]' : 'font-mono text-[22px]'}`} style={{ color: tone }}>{value}</div>
    </Card>
  );
}

export default SopBatchEditor;
