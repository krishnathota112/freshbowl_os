import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { listSopBatches, listSopVersions, loadSopActivities, type SopActivity } from '../api/sop';
import { loadMonthlySchedule } from '../api/monthlySchedule';
import { HOUR_MS, SIM_GROUPS, finishHour, positionAt, stageWindows, type SimGroup, type Window } from '../components/simulation';
import { EmptyState, Skeleton } from '../../../shared/ui/primitives';
import { humanError } from '../../../shared/utils/humanError';

/**
 * Admin · Simulation. "If batches start on these dates, what happens, and when?"
 * Batches come from the Monthly schedule, from dates typed here, and (optionally) from the batches
 * already running. Each is laid out on the SOP version's own planned hours; press play and the
 * factory clock runs forward so you can watch every batch move through its stages.
 * A preview only: nothing is created or changed.
 */
type SimBatch = { key: string; code: string; startMs: number; source: 'schedule' | 'manual' | 'running'; defId: string };

const DAY = 24 * HOUR_MS;
const GROUP = Object.fromEntries(SIM_GROUPS.map((g) => [g.key, g]));
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short' });
const fmtDT = (ms: number) => new Date(ms).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const monthStart = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
const SPEEDS: [number, string][] = [[1, '1 day / s'], [3, '3 days / s'], [7, '1 week / s']];

export function Simulation() {
  const versions = useQuery({ queryKey: ['sop-versions'], queryFn: listSopVersions });
  const published = (versions.data ?? []).filter((v) => v.status === 'published');
  const [defId, setDefId] = useState<string | null>(null);
  const chosenDef = defId ?? published.find((v) => v.isCurrent)?.id ?? published[0]?.id ?? null;

  const [month, setMonth] = useState(monthStart());
  const [useSchedule, setUseSchedule] = useState(true);
  const [useRunning, setUseRunning] = useState(true);
  const [startTime, setStartTime] = useState('06:00');
  const [manual, setManual] = useState<{ key: string; code: string; date: string }[]>([]);

  const schedule = useQuery({ queryKey: ['monthly-schedule', month], queryFn: () => loadMonthlySchedule(month), enabled: useSchedule });
  const running = useQuery({ queryKey: ['sop-batches'], queryFn: listSopBatches, enabled: useRunning });

  const batches: SimBatch[] = useMemo(() => {
    if (!chosenDef) return [];
    const at = (date: string) => new Date(`${date}T${startTime}:00`).getTime();
    const out: SimBatch[] = [];
    if (useRunning) {
      for (const b of running.data ?? []) {
        if (b.status !== 'active' || b.currentHour == null) continue;
        out.push({ key: `r-${b.id}`, code: b.code, startMs: Date.now() - b.currentHour * HOUR_MS, source: 'running', defId: b.definitionId });
      }
    }
    if (useSchedule) {
      for (const g of schedule.data?.groups ?? []) {
        if (g.status === 'cancelled' || g.masterBatchId) continue;
        out.push({ key: `s-${g.id}`, code: g.groupCode, startMs: at(g.scheduledStartDate), source: 'schedule', defId: chosenDef });
      }
    }
    for (const m of manual) if (m.date) out.push({ key: m.key, code: m.code || 'New batch', startMs: at(m.date), source: 'manual', defId: chosenDef });
    return out.sort((a, b) => a.startMs - b.startMs);
  }, [chosenDef, useRunning, running.data, useSchedule, schedule.data, manual, startTime]);

  const defIds = [...new Set(batches.map((b) => b.defId))];
  const acts = useQuery({
    queryKey: ['sim-acts', defIds.join(',')],
    queryFn: async () => Object.fromEntries(await Promise.all(defIds.map(async (d) => [d, await loadSopActivities(d)] as const))),
    enabled: defIds.length > 0,
  });
  const windowsOf = (b: SimBatch): Window[] => stageWindows((acts.data?.[b.defId] ?? []) as SopActivity[]);

  const rangeStart = batches.length ? Math.min(...batches.map((b) => b.startMs)) - DAY : Date.now();
  const rangeEnd = batches.length ? Math.max(...batches.map((b) => b.startMs + finishHour(windowsOf(b)) * HOUR_MS)) + DAY : Date.now() + 30 * DAY;
  const span = Math.max(rangeEnd - rangeStart, DAY);

  // The simulation clock.
  const [clock, setClock] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const now = clock ?? Math.min(Math.max(Date.now(), rangeStart), rangeEnd);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      setClock((c) => {
        const next = (c ?? now) + dt * speed * DAY;
        if (next >= rangeEnd) { setPlaying(false); return rangeEnd; }
        return next;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, rangeEnd]);

  const pct = (ms: number) => `${Math.max(0, Math.min(100, ((ms - rangeStart) / span) * 100))}%`;
  const days: number[] = [];
  const firstMidnight = new Date(rangeStart); firstMidnight.setHours(0, 0, 0, 0);
  for (let d = firstMidnight.getTime() + DAY; d < rangeEnd; d += DAY) days.push(d);
  const labelEvery = Math.max(1, Math.ceil(days.length / 14));

  const inStage = SIM_GROUPS.map((g) => ({
    ...g,
    n: batches.filter((b) => positionAt(windowsOf(b), (now - b.startMs) / HOUR_MS).groups.includes(g.key)).length,
  }));

  if (versions.isLoading) return <Skeleton label="Loading" lines={4} />;
  if (versions.error) return <EmptyState title="Could not load SOP versions" detail={humanError(versions.error).title} />;

  return (
    <div className="pb-16">
      <header className="mb-6">
        <h1 className="font-display text-[28px] font-600 leading-tight">Simulation</h1>
        <p className="mt-1 text-[14px] text-muted">See how a month of batches plays out — press play and watch every batch move through its stages. A preview only; nothing is created.</p>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 rounded-xl border bg-surface p-5" style={{ borderColor: 'var(--line)' }}>
          <Field label="SOP version for new batches">
            <select value={chosenDef ?? ''} onChange={(e) => setDefId(e.target.value)} className="rounded-lg border bg-surface px-3 text-[14px]" style={{ minHeight: 42, borderColor: 'var(--line-2)' }}>
              {published.map((v) => <option key={v.id} value={v.id}>{v.code} v{v.version}{v.isCurrent ? ' · current' : ''} · H{v.standardHr}</option>)}
            </select>
          </Field>

          <label className="flex items-start gap-3 text-[14px]">
            <input type="checkbox" checked={useSchedule} onChange={(e) => setUseSchedule(e.target.checked)} className="mt-1 h-4 w-4" />
            <span><b>Monthly schedule</b><span className="block text-[12px] text-muted">Batches planned in the uploaded schedule</span></span>
          </label>
          {useSchedule && (
            <div className="-mt-2 ml-7 flex flex-col gap-2">
              <input type="month" value={month.slice(0, 7)} onChange={(e) => setMonth(`${e.target.value}-01`)} aria-label="Schedule month"
                     className="rounded-lg border bg-surface px-3 text-[14px]" style={{ minHeight: 40, borderColor: 'var(--line-2)' }} />
              <span className="text-[12px] text-muted">
                {schedule.isLoading ? 'Reading…' : schedule.data ? `${schedule.data.groups.filter((g) => g.status !== 'cancelled' && !g.masterBatchId).length} planned batches` : 'No schedule uploaded for this month'}
              </span>
            </div>
          )}

          <label className="flex items-start gap-3 text-[14px]">
            <input type="checkbox" checked={useRunning} onChange={(e) => setUseRunning(e.target.checked)} className="mt-1 h-4 w-4" />
            <span><b>Batches already running</b><span className="block text-[12px] text-muted">From their own H0 and SOP</span></span>
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-[14px] font-700">Try your own dates</span>
            {manual.map((m, i) => (
              <div key={m.key} className="flex gap-2">
                <input value={m.code} placeholder="Batch" aria-label="Batch code" onChange={(e) => setManual(manual.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))}
                       className="w-20 rounded-lg border bg-surface px-2 text-[13px]" style={{ minHeight: 38, borderColor: 'var(--line-2)' }} />
                <input type="date" value={m.date} aria-label="Start date" onChange={(e) => setManual(manual.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))}
                       className="min-w-0 flex-1 rounded-lg border bg-surface px-2 text-[13px]" style={{ minHeight: 38, borderColor: 'var(--line-2)' }} />
                <button type="button" aria-label="Remove" onClick={() => setManual(manual.filter((_, j) => j !== i))} className="px-2 text-muted">×</button>
              </div>
            ))}
            <button type="button" onClick={() => setManual([...manual, { key: `m-${Date.now()}`, code: '', date: new Date(Date.now() + 2 * DAY).toISOString().slice(0, 10) }])}
                    className="rounded-lg border px-3 text-[13px] font-600" style={{ minHeight: 38, borderColor: 'var(--line-2)', borderStyle: 'dashed' }}>+ Add a batch</button>
          </div>

          <Field label="H0 time of day for planned batches">
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="rounded-lg border bg-surface px-3 text-[14px]" style={{ minHeight: 40, borderColor: 'var(--line-2)' }} />
          </Field>
        </aside>

        <div className="flex min-w-0 flex-col gap-5">
          {/* Player */}
          <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-surface px-5 py-4" style={{ borderColor: 'var(--line)' }}>
            <button type="button" onClick={() => { if (!playing && now >= rangeEnd) setClock(rangeStart); setPlaying(!playing); }} disabled={!batches.length}
                    aria-label={playing ? 'Pause' : 'Play'} className="flex h-12 w-12 items-center justify-center rounded-full disabled:opacity-40"
                    style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d={playing ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M7 4l13 8-13 8z'} />
              </svg>
            </button>
            <div className="min-w-[180px]">
              <div className="text-[11px] font-700 uppercase tracking-wider text-muted">Factory clock</div>
              <div className="font-display text-[22px] font-600">{fmtDT(now)}</div>
            </div>
            <input type="range" min={rangeStart} max={rangeEnd} step={HOUR_MS} value={now} aria-label="Move through time"
                   onChange={(e) => { setPlaying(false); setClock(Number(e.target.value)); }} className="min-w-[200px] flex-1" style={{ accentColor: 'var(--accent)' }} />
            <div className="flex rounded-lg p-1" style={{ background: 'var(--surface-2)' }} role="group" aria-label="Speed">
              {SPEEDS.map(([s, l]) => (
                <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)} className="rounded-md px-2.5 text-[12px] font-600"
                        style={{ minHeight: 32, background: speed === s ? 'var(--surface)' : 'transparent', boxShadow: speed === s ? 'var(--shadow-card)' : 'none' }}>{l}</button>
              ))}
            </div>
            <button type="button" onClick={() => { setPlaying(false); setClock(null); }} className="text-[13px] font-600 text-muted">Today</button>
          </div>

          {/* How many batches are in each stage right now */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {inStage.map((g) => (
              <div key={g.key} className="rounded-xl border bg-surface px-4 py-3" style={{ borderColor: 'var(--line)' }}>
                <div className="flex items-center gap-2 text-[12px] font-600 text-ink2"><span style={{ width: 8, height: 8, borderRadius: 2, background: g.color }} />{g.label}</div>
                <div className="font-display text-[26px] font-600" style={{ color: g.n ? 'var(--ink)' : 'var(--line-2)' }}>{g.n}</div>
              </div>
            ))}
          </div>

          {/* Calendar */}
          {!batches.length ? (
            <div className="rounded-xl border bg-surface px-6 py-12 text-center" style={{ borderColor: 'var(--line)' }}>
              <p className="font-display text-[20px] font-600">No batches to simulate yet</p>
              <p className="mt-1 text-[14px] text-muted">Pick a month with an uploaded schedule, include running batches, or add your own dates on the left.</p>
            </div>
          ) : acts.isLoading ? <Skeleton label="Laying out batches" lines={5} /> : (
            <div className="overflow-x-auto rounded-xl border bg-surface" style={{ borderColor: 'var(--line)' }}>
              <div style={{ minWidth: 820 }}>
                <div className="flex border-b" style={{ borderColor: 'var(--line)' }}>
                  <div className="w-[190px] shrink-0 px-4 py-2 text-[11px] font-700 uppercase tracking-wider text-muted">Batch</div>
                  <div className="relative h-8 flex-1">
                    <span className="absolute bottom-0 z-10 rounded-t px-1.5 text-[10px] font-700 text-white" style={{ left: pct(now), transform: 'translateX(-50%)', background: 'var(--accent)' }}>now</span>
                    {days.map((d, i) => i % labelEvery === 0 && (
                      <span key={d} className="absolute top-2 text-[11px] text-muted" style={{ left: pct(d), transform: 'translateX(-50%)' }}>{fmtDay(d)}</span>
                    ))}
                  </div>
                </div>
                {batches.map((b) => {
                  const w = windowsOf(b);
                  const h = (now - b.startMs) / HOUR_MS;
                  const pos = positionAt(w, h);
                  const where = pos.kind === 'before' ? `starts ${fmtDay(b.startMs)}` : pos.kind === 'done' ? 'discharged' : pos.groups.map((g) => GROUP[g].label).join(' · ');
                  return (
                    <div key={b.key} className="flex border-b last:border-b-0" style={{ borderColor: 'var(--line)' }}>
                      <div className="w-[190px] shrink-0 px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-600">{b.code}</span>
                          <span className="rounded px-1.5 text-[10px] font-700 uppercase" style={{ background: b.source === 'running' ? 'var(--ok-soft)' : b.source === 'manual' ? 'var(--accent-soft)' : 'var(--surface-2)', color: b.source === 'running' ? 'var(--ok)' : 'var(--ink-2)' }}>
                            {b.source === 'running' ? 'running' : b.source === 'manual' ? 'yours' : 'planned'}
                          </span>
                        </div>
                        <div className="truncate text-[12px] text-muted">
                          {pos.kind === 'running' ? <><span className="font-mono">H{Math.floor(h)}</span> · {where}</> : where}
                        </div>
                      </div>
                      <div className="relative flex-1">
                        {days.map((d) => <span key={d} className="absolute top-0 h-full" style={{ left: pct(d), width: 1, background: 'var(--line)', opacity: 0.6 }} />)}
                        <span className="absolute top-0 z-10 h-full" style={{ left: pct(now), width: 2, background: 'var(--accent)' }} />
                        {w.map((x) => (
                          <span key={x.group} title={`${GROUP[x.group].label} · ${fmtDT(b.startMs + x.start * HOUR_MS)} → ${fmtDT(b.startMs + x.end * HOUR_MS)}`}
                                className="absolute rounded-sm"
                                style={{
                                  left: pct(b.startMs + x.start * HOUR_MS),
                                  width: `max(3px, calc(${pct(b.startMs + x.end * HOUR_MS)} - ${pct(b.startMs + x.start * HOUR_MS)}))`,
                                  top: 10 + (SIM_GROUPS.findIndex((g) => g.key === x.group) % 3) * 9, height: 7,
                                  background: GROUP[x.group].color,
                                  opacity: pos.groups.includes(x.group) ? 1 : b.startMs + x.end * HOUR_MS < now ? 0.35 : 0.8,
                                }} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {batches.length > 0 && !acts.isLoading && (
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink2">
              {SIM_GROUPS.map((g) => <span key={g.key} className="inline-flex items-center gap-1.5"><span style={{ width: 12, height: 7, borderRadius: 2, background: g.color }} />{g.label}</span>)}
            </div>
          )}

          {/* Key dates */}
          {batches.length > 0 && !acts.isLoading && (
            <div className="overflow-x-auto rounded-xl border bg-surface" style={{ borderColor: 'var(--line)' }}>
              <h2 className="px-5 pt-4 pb-2 font-display text-[18px] font-600">Key dates</h2>
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-muted">
                    {['Batch', 'H0', 'Turner', 'Bunkers', 'Tunnel', 'Finished'].map((h) => <th key={h} className="px-5 py-2 font-700">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => {
                    const w = windowsOf(b);
                    const at = (g: SimGroup) => { const x = w.find((y) => y.group === g); return x ? fmtDT(b.startMs + x.start * HOUR_MS) : '—'; };
                    return (
                      <tr key={b.key} className="border-t" style={{ borderColor: 'var(--line)' }}>
                        <td className="px-5 py-2.5 font-600">{b.code}</td>
                        <td className="px-5 py-2.5">{fmtDT(b.startMs)}</td>
                        <td className="px-5 py-2.5">{at('turner')}</td>
                        <td className="px-5 py-2.5">{at('bunker')}</td>
                        <td className="px-5 py-2.5">{at('tunnel')}</td>
                        <td className="px-5 py-2.5 font-600">{fmtDT(b.startMs + finishHour(w) * HOUR_MS)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-700">{label}</span>
      {children}
    </label>
  );
}

export default Simulation;
