import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { listLabParameters, type LabCheck, type SopActivity } from '../api/sop';
import { loadVessels } from '../../../shared/api/resources';
import { humanError } from '../../../shared/utils/humanError';

/**
 * "Add a step after this one" — a side panel that walks through three short stages:
 * Work → Checks → Confirm (a draft SOP skips Checks).
 *
 * `mode="batch"` amends ONE running batch (0130/0132): the Admin decides the Lab readings (pre-ticked only
 * as a SUGGESTION from the template activity's own SOP Lab check), Record or Gate, and which bunkers/tunnels
 * are cleaned and whether work waits for them. `mode="draft"` edits a draft SOP version. The server decides
 * what any of it does.
 */
export type InsertValues = {
  templateCode: string;
  title: string;
  durationHr: number;
  isHold: boolean;
  labCheck: LabCheck;
  cleaning: LabCheck;
  reason: string;
  labParams: string[];
  labGate: boolean;
  cleanLocations: string[];
  cleanWait: boolean;
};

const SIDES: [LabCheck, string][] = [['none', 'None'], ['before', 'Before'], ['after', 'After'], ['both', 'Both']];

export function InsertActivityPanel({
  mode,
  afterTitle,
  afterEndLabel,
  templates,
  waitingSteps,
  onSubmit,
  onClose,
}: {
  mode: 'batch' | 'draft';
  afterTitle: string;
  afterEndLabel: string;
  templates: SopActivity[];
  waitingSteps: string[];
  onSubmit: (v: InsertValues) => Promise<void>;
  onClose: () => void;
}) {
  const options = useMemo(() => {
    const seen = new Set<string>();
    return templates.filter((t) => !t.isLab && !t.isPreH0 && !seen.has(t.title) && seen.add(t.title));
  }, [templates]);
  const [templateCode, setTemplate] = useState(options[0]?.code ?? '');
  const tpl = options.find((o) => o.code === templateCode);
  const [title, setTitle] = useState(tpl?.title ?? '');
  const [durationHr, setDuration] = useState(tpl && tpl.end != null && tpl.start != null ? Math.max(0.5, tpl.end - tpl.start) : 2);
  const [isHold, setHold] = useState(tpl?.isHold ?? false);
  const [labCheck, setLab] = useState<LabCheck>('none');
  const [labParams, setLabParams] = useState<string[]>([]);
  const [labGate, setLabGate] = useState(false);
  const [cleaning, setCleaning] = useState<LabCheck>('none');
  const [cleanLocations, setCleanLocations] = useState<string[]>([]);
  const [cleanWait, setCleanWait] = useState(true);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const params = useQuery({ queryKey: ['lab-parameters'], queryFn: listLabParameters, enabled: mode === 'batch' });
  const vessels = useQuery({ queryKey: ['vessels'], queryFn: () => loadVessels(), enabled: mode === 'batch' && cleaning !== 'none' });

  // The SOP's own Lab check(s) for the chosen activity — a suggestion, never a decision.
  const suggestion = useMemo(() => {
    const checks = templates.filter((t) => t.isLab && t.labFor.includes(templateCode));
    return { names: checks.map((c) => c.title), params: [...new Set(checks.flatMap((c) => c.labParams))] };
  }, [templates, templateCode]);
  useEffect(() => { setLabParams(suggestion.params); }, [suggestion]);

  const pickTemplate = (code: string) => {
    const t = options.find((o) => o.code === code);
    setTemplate(code);
    if (t) {
      setTitle(t.title);
      setHold(t.isHold);
      if (t.end != null && t.start != null) setDuration(Math.max(0.5, t.end - t.start));
    }
  };
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const step = (d: number) => setDuration((v) => Math.min(72, Math.max(0.5, Math.round((v + d) * 2) / 2)));
  const labOk = labCheck === 'none' || labParams.length > 0;
  const cleanOk = cleaning === 'none' || cleanLocations.length > 0;
  const workOk = !!templateCode && title.trim().length > 0 && durationHr > 0;
  const canSave = workOk && (mode === 'draft' || (reason.trim().length >= 5 && labOk && cleanOk));
  const paramLabel = (c: string) => params.data?.find((p) => p.code === c)?.label ?? c;

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onSubmit({ templateCode, title: title.trim(), durationHr, isHold, labCheck, cleaning, reason: reason.trim(), labParams, labGate, cleanLocations, cleanWait });
    } catch (e) {
      const h = humanError(e);
      setErr(h.detail || h.title || (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const vesselList = (vessels.data ?? []).filter((v) => v.kind === 'BUNKER' || v.kind === 'TUNNEL');
  const steps: string[] = mode === 'batch' ? ['Work', 'Checks', 'Confirm'] : ['Work', 'Confirm'];
  const [stepIdx, setStepIdx] = useState(0);
  const stepName = steps[stepIdx];
  const nextOk = stepName === 'Work' ? workOk : stepName === 'Checks' ? labOk && cleanOk : canSave;

  return (
    <section aria-label="Add a step" className="flex flex-col overflow-hidden rounded-xl border bg-surface" style={{ borderColor: 'var(--accent)', boxShadow: 'var(--shadow-raised)' }}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <p className="font-head text-[11px] font-700 uppercase tracking-wider" style={{ color: 'var(--accent-ink)' }}>
            {mode === 'batch' ? 'Add a step to this batch' : 'Add a step to this draft'}
          </p>
          <h2 className="font-head text-[18px] font-800 leading-tight">After “{afterTitle}”</h2>
          <p className="text-[12px] text-muted">Starts when it finishes · {afterEndLabel}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg border px-3 text-[16px]" style={{ minHeight: 36, borderColor: 'var(--line-2)' }}>×</button>
      </div>

      <ol className="flex gap-2 px-5 pt-4" aria-label="Steps">
        {steps.map((n, i) => (
          <li key={n} className="flex flex-1 flex-col gap-1">
            <span className="h-1 rounded-full" style={{ background: i <= stepIdx ? 'var(--accent)' : 'var(--line)' }} />
            <span className="text-[11px] font-600" style={{ color: i === stepIdx ? 'var(--ink)' : 'var(--muted)' }}>{i + 1}. {n}</span>
          </li>
        ))}
      </ol>

      <div className="flex max-h-[62vh] flex-col gap-4 overflow-y-auto px-5 py-4">
        {stepName === 'Work' && (
          <>
            <Field2 label="What kind of work">
              <select value={templateCode} onChange={(e) => pickTemplate(e.target.value)} aria-label="Activity type"
                      className="w-full rounded-lg border bg-surface px-3 text-[14px]" style={{ minHeight: 44, borderColor: 'var(--line-2)' }}>
                {options.map((o) => <option key={o.code} value={o.code}>{o.title}</option>)}
              </select>
              <span className="text-[11px] text-muted">Photos, readings and who does it are copied from this.</span>
            </Field2>
            <Field2 label="Name the floor will see">
              <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Name the floor will see"
                     className="rounded-lg border bg-surface px-3 text-[14px]" style={{ minHeight: 44, borderColor: 'var(--line-2)' }} />
            </Field2>
            <div className="grid grid-cols-2 gap-3">
              <Field2 label="How long">
                <div className="flex items-center overflow-hidden rounded-lg border" style={{ borderColor: 'var(--line-2)' }}>
                  <button type="button" aria-label="Half an hour less" onClick={() => step(-0.5)} className="h-11 w-11 text-[18px]" style={{ background: 'var(--surface-2)' }}>−</button>
                  <span className="flex-1 text-center font-mono text-[15px] font-600">{durationHr} h</span>
                  <button type="button" aria-label="Half an hour more" onClick={() => step(0.5)} className="h-11 w-11 text-[18px]" style={{ background: 'var(--surface-2)' }}>+</button>
                </div>
              </Field2>
              <Field2 label="Type">
                <Segmented value={isHold ? 'rest' : 'work'} onChange={(v) => setHold(v === 'rest')} options={[['work', 'Work'], ['rest', 'Timed rest']]} />
              </Field2>
            </div>
          </>
        )}

        {stepName === 'Checks' && (
          <>
            <Field2 label="Lab check">
              <Segmented value={labCheck} onChange={(v) => setLab(v as LabCheck)} options={SIDES} />
            </Field2>
            {labCheck !== 'none' && (
              <div className="flex flex-col gap-2 rounded-lg px-3 py-3" style={{ background: 'var(--surface-2)' }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12px] font-600 text-ink2">Readings the Lab must take</span>
                  {suggestion.names.length > 0
                    ? <button type="button" onClick={() => setLabParams(suggestion.params)} className="text-[11px] font-600 underline" style={{ color: 'var(--accent-ink)' }}>Use SOP suggestion</button>
                    : <span className="text-[11px] text-muted">No SOP suggestion for this work</span>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(params.data ?? []).map((p) => {
                    const on = labParams.includes(p.code);
                    return (
                      <label key={p.code} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12px]"
                             style={{ minHeight: 34, borderColor: on ? 'var(--accent)' : 'var(--line-2)', background: on ? 'var(--accent-soft)' : 'var(--surface)' }}>
                        <input type="checkbox" checked={on} onChange={() => toggle(labParams, setLabParams, p.code)} aria-label={p.label} className="h-3.5 w-3.5" />
                        {p.label}
                        {suggestion.params.includes(p.code) && <span className="text-[9px] font-700" style={{ color: 'var(--accent-ink)' }}>SOP</span>}
                      </label>
                    );
                  })}
                </div>
                <Segmented value={labGate ? 'gate' : 'record'} onChange={(v) => setLabGate(v === 'gate')}
                           options={[['record', 'Record only'], ['gate', 'Gate · GM approves']]} />
                <span className="text-[11px] text-muted">
                  {labGate ? 'Work waits until the GM approves the result.' : 'Logged for the batch record; never blocks work.'} No pass/fail range is set.
                </span>
              </div>
            )}
            <Field2 label="Cleaning">
              <Segmented value={cleaning} onChange={(v) => setCleaning(v as LabCheck)} options={SIDES} />
            </Field2>
            {cleaning !== 'none' && (
              <div className="flex flex-col gap-2 rounded-lg px-3 py-3" style={{ background: 'var(--surface-2)' }}>
                <span className="text-[12px] font-600 text-ink2">Which bunker or tunnel</span>
                {vessels.isLoading && <span className="text-[12px] text-muted">Reading bunkers and tunnels…</span>}
                <div className="flex flex-wrap gap-1.5">
                  {vesselList.map((v) => {
                    const on = cleanLocations.includes(v.location_id);
                    const busyV = !!v.open_task_id || !!v.occupied_by_batch || !v.is_ready;
                    return (
                      <label key={v.location_id}
                             title={v.open_task_id ? 'cleaning job open' : v.occupied_by_batch ? `in use · ${v.occupied_by_batch}` : v.is_ready ? 'ready' : 'needs cleaning'}
                             className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12px]"
                             style={{ minHeight: 34, borderColor: on ? 'var(--accent)' : 'var(--line-2)', background: on ? 'var(--accent-soft)' : 'var(--surface)' }}>
                        <input type="checkbox" checked={on} onChange={() => toggle(cleanLocations, setCleanLocations, v.location_id)} aria-label={v.label} className="h-3.5 w-3.5" />
                        {v.label}
                        {busyV && <span title="not free" style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--warn)' }} />}
                      </label>
                    );
                  })}
                </div>
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={cleanWait} onChange={(e) => setCleanWait(e.target.checked)} className="h-4 w-4" />
                  Work waits until cleaning is done
                </label>
              </div>
            )}
            {labCheck === 'none' && cleaning === 'none' && <p className="text-[12px] text-muted">Both are optional — press Next if this step needs neither.</p>}
          </>
        )}

        {stepName === 'Confirm' && (
          <>
            <ul className="flex flex-col gap-2 text-[13px]">
              <Line k="Step" v={`${title} · ${durationHr} h${isHold ? ' timed rest' : ''}`} />
              <Line k="Starts after" v={afterTitle} />
              <Line k="Then waits for it" v={waitingSteps.length ? waitingSteps.join(', ') : 'nothing — runs alongside'} />
              {mode === 'batch' && (
                <Line k="Lab" v={labCheck === 'none' ? 'none' : `${labCheck} · ${labParams.map(paramLabel).join(', ')} · ${labGate ? 'gate' : 'record'}`} />
              )}
              {mode === 'batch' && (
                <Line k="Cleaning" v={cleaning === 'none' ? 'none'
                  : `${cleaning} · ${vesselList.filter((v) => cleanLocations.includes(v.location_id)).map((v) => v.label).join(', ')}${cleanWait ? ' · work waits' : ''}`} />
              )}
            </ul>
            <p className="rounded-lg px-3 py-2 text-[12px]" style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
              {mode === 'batch'
                ? 'Only the chain after this point moves. Every existing step keeps its frozen plan; the forecast shows the effect.'
                : 'Only this draft changes. Nothing live moves until you publish.'}
            </p>
            {mode === 'batch' && (
              <Field2 label="Why this batch needs it">
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Moisture still low after the water pass"
                          aria-label="Why this batch needs it"
                          className="w-full rounded-lg border bg-surface px-3 py-2 text-[14px]" style={{ borderColor: 'var(--line-2)' }} />
                {reason.trim().length < 5 && (
                  <span className="text-[11px]" style={{ color: 'var(--warn)' }}>A few words, kept in the batch record ({reason.trim().length}/5)</span>
                )}
              </Field2>
            )}
          </>
        )}
        {err && <p className="rounded-lg border px-3 py-2 text-[13px] font-600" style={{ borderColor: 'var(--crit)', color: 'var(--crit)' }}>{err}</p>}
      </div>

      <div className="flex items-center justify-between gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--line)' }}>
        <button type="button" onClick={() => (stepIdx === 0 ? onClose() : setStepIdx(stepIdx - 1))}
                className="rounded-lg px-3 font-head text-[13px] font-600 text-muted" style={{ minHeight: 40 }}>
          {stepIdx === 0 ? 'Cancel' : '← Back'}
        </button>
        {stepIdx < steps.length - 1 ? (
          <button type="button" disabled={!nextOk} onClick={() => setStepIdx(stepIdx + 1)}
                  className="rounded-lg px-5 font-head text-[14px] font-700 disabled:opacity-40"
                  style={{ minHeight: 44, background: 'var(--ink)', color: 'var(--surface)' }}>Next →</button>
        ) : (
          <button type="button" disabled={!canSave || busy} onClick={save}
                  className="rounded-lg px-5 font-head text-[14px] font-700 disabled:opacity-40"
                  style={{ minHeight: 44, background: 'var(--accent)', color: 'var(--on-accent)' }}>
            {busy ? 'Saving…' : mode === 'batch' ? 'Add to this batch' : 'Add to draft'}
          </button>
        )}
      </div>
    </section>
  );
}

function Field2({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-600 text-ink2">{label}</span>
      {children}
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <li className="flex gap-3 border-b pb-2" style={{ borderColor: 'var(--line)' }}>
      <span className="w-28 shrink-0 text-muted">{k}</span>
      <span className="font-600">{v}</span>
    </li>
  );
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--surface-2)' }}>
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
                className="flex-1 rounded-md px-2 text-[12px] font-600"
                style={{ minHeight: 36, background: value === v ? 'var(--ink)' : 'transparent', color: value === v ? 'var(--surface)' : 'var(--ink-2)' }}>
          {l}
        </button>
      ))}
    </div>
  );
}
