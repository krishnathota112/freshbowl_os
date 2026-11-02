import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { listLabParameters, type LabCheck, type SopActivity } from '../api/sop';
import { loadVessels } from '../../../shared/api/resources';
import { humanError } from '../../../shared/utils/humanError';

/**
 * "Add an activity after this step" — the form behind every ＋ on the SOP timelines.
 *
 * `mode="batch"` amends ONE running batch (0130/0132): the Admin decides the Lab readings (tick boxes,
 * pre-ticked only as a SUGGESTION from the template activity's own Lab check in the SOP), whether the
 * check is a Record or a Gate, and which bunkers/tunnels are cleaned and whether work waits for them.
 * `mode="draft"` edits a draft SOP version. What any of it does is the server's.
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
  const canSave = !!templateCode && title.trim().length > 0 && durationHr > 0 && (mode === 'draft' || (reason.trim().length >= 5 && labOk && cleanOk));
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

  return (
    <div role="dialog" aria-modal="true" aria-label="Add an activity" className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(20,26,22,0.45)' }}>
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-surface" style={{ boxShadow: 'var(--shadow-raised)' }}>
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
          <div>
            <p className="font-head text-[11px] font-700 uppercase tracking-wider" style={{ color: 'var(--accent-ink)' }}>
              {mode === 'batch' ? 'Amend this batch' : 'Edit draft SOP'}
            </p>
            <h2 className="font-head text-[20px] font-800">Add after “{afterTitle}”</h2>
            <p className="text-[13px] text-muted">Starts when that step finishes · planned from {afterEndLabel}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg border px-3 text-[18px]" style={{ minHeight: 40, borderColor: 'var(--line-2)' }}>×</button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
          <Section n="1" title="What work is it">
            <select value={templateCode} onChange={(e) => pickTemplate(e.target.value)} aria-label="Activity type"
                    className="w-full rounded-lg border bg-surface px-3 text-[14px]" style={{ minHeight: 44, borderColor: 'var(--line-2)' }}>
              {options.map((o) => <option key={o.code} value={o.code}>{o.title}</option>)}
            </select>
            <p className="text-[11px] text-muted">Readings, photos and who does it are copied from this activity.</p>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-600 uppercase tracking-wider text-ink2">Name shown to the floor</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-lg border bg-surface px-3 text-[14px]" style={{ minHeight: 44, borderColor: 'var(--line-2)' }} />
            </label>
          </Section>

          <div className="grid gap-4 sm:grid-cols-2">
            <Section n="2" title="How long">
              <div className="flex items-center overflow-hidden rounded-lg border" style={{ borderColor: 'var(--line-2)' }}>
                <button type="button" aria-label="Half an hour less" onClick={() => step(-0.5)} className="h-11 w-11 text-[18px]" style={{ background: 'var(--surface-2)' }}>−</button>
                <span className="flex-1 text-center font-mono text-[16px] font-600">{durationHr} h</span>
                <button type="button" aria-label="Half an hour more" onClick={() => step(0.5)} className="h-11 w-11 text-[18px]" style={{ background: 'var(--surface-2)' }}>+</button>
              </div>
            </Section>
            <Section n="3" title="Type">
              <Segmented value={isHold ? 'rest' : 'work'} onChange={(v) => setHold(v === 'rest')}
                         options={[['work', 'Work (Start / Finish)'], ['rest', 'Passive rest (timed)']]} />
            </Section>
          </div>

          {mode === 'batch' && (
            <Section n="4" title="Lab check">
              <Segmented value={labCheck} onChange={(v) => setLab(v as LabCheck)} options={SIDES} />
              {labCheck !== 'none' && (
                <div className="flex flex-col gap-3 rounded-lg border px-3 py-3" style={{ borderColor: 'var(--line)' }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12px] font-600 text-ink2">Which readings must the Lab take?</span>
                    {suggestion.names.length > 0 ? (
                      <button type="button" onClick={() => setLabParams(suggestion.params)} className="rounded-md px-2 py-1 text-[11px] font-600"
                              style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}>
                        Suggested from SOP: {suggestion.names.join(', ')} · reset
                      </button>
                    ) : <span className="text-[11px] text-muted">This activity has no Lab check in the SOP — tick what you need.</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {(params.data ?? []).map((p) => {
                      const on = labParams.includes(p.code);
                      const suggested = suggestion.params.includes(p.code);
                      return (
                        <label key={p.code} className="flex cursor-pointer items-center gap-2 rounded-md border px-2 text-[13px]"
                               style={{ minHeight: 40, borderColor: on ? 'var(--accent)' : 'var(--line)', background: on ? 'var(--accent-soft)' : 'transparent' }}>
                          <input type="checkbox" checked={on} onChange={() => toggle(labParams, setLabParams, p.code)} aria-label={p.label} className="h-4 w-4" />
                          <span className="flex-1">{p.label}{p.unit ? <span className="text-muted"> ({p.unit})</span> : null}</span>
                          {suggested && <span className="text-[10px] font-700" style={{ color: 'var(--accent-ink)' }}>SOP</span>}
                        </label>
                      );
                    })}
                  </div>
                  {!labOk && <span className="text-[11px]" style={{ color: 'var(--warn)' }}>Tick at least one reading.</span>}
                  <Segmented value={labGate ? 'gate' : 'record'} onChange={(v) => setLabGate(v === 'gate')}
                             options={[['record', 'Record — logged, never blocks'], ['gate', 'Gate — work waits for GM approval']]} />
                  <p className="text-[11px] text-muted">
                    Creates a Lab task in the Lab queue with these readings. No pass/fail range is set for it, so values are recorded as measured.
                    {labGate ? ' Gate: ' + (labCheck === 'after' ? 'the steps after the new one' : labCheck === 'before' ? 'the new step' : 'the new step and the steps after it') + ' cannot start until the GM approves.' : ''}
                  </p>
                </div>
              )}
            </Section>
          )}

          {mode === 'batch' && (
            <Section n="5" title="Cleaning">
              <Segmented value={cleaning} onChange={(v) => setCleaning(v as LabCheck)} options={SIDES} />
              {cleaning !== 'none' && (
                <div className="flex flex-col gap-3 rounded-lg border px-3 py-3" style={{ borderColor: 'var(--line)' }}>
                  <span className="text-[12px] font-600 text-ink2">Which bunker or tunnel needs cleaning?</span>
                  {vessels.isLoading && <span className="text-[12px] text-muted">Reading bunkers and tunnels…</span>}
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                    {vesselList.map((v) => {
                      const on = cleanLocations.includes(v.location_id);
                      const note = v.open_task_id ? 'job open' : v.occupied_by_batch ? `in use · ${v.occupied_by_batch}` : v.is_ready ? 'ready' : 'needs cleaning';
                      return (
                        <label key={v.location_id} className="flex cursor-pointer flex-col rounded-md border px-2 py-1.5 text-[12px]"
                               style={{ borderColor: on ? 'var(--accent)' : 'var(--line)', background: on ? 'var(--accent-soft)' : 'transparent' }}>
                          <span className="flex items-center gap-1.5 font-600">
                            <input type="checkbox" checked={on} onChange={() => toggle(cleanLocations, setCleanLocations, v.location_id)} aria-label={v.label} className="h-4 w-4" />
                            {v.label}
                          </span>
                          <span className="text-[10px] text-muted">{note}</span>
                        </label>
                      );
                    })}
                  </div>
                  {!cleanOk && <span className="text-[11px]" style={{ color: 'var(--warn)' }}>Tick at least one bunker or tunnel.</span>}
                  <label className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={cleanWait} onChange={(e) => setCleanWait(e.target.checked)} className="h-4 w-4" />
                    {cleaning === 'after' ? 'The steps after the new one wait until cleaning is done' : cleaning === 'before' ? 'The new step waits until cleaning is done' : 'The new step and the steps after it wait until cleaning is done'}
                  </label>
                  <p className="text-[11px] text-muted">Creates a cleaning job on the Resources screen for each ticked resource (checklist + photo). An already-open job is reused.</p>
                </div>
              )}
            </Section>
          )}

          {mode === 'batch' && (
            <Section n="6" title="Why this batch needs it">
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Moisture still low after the water pass"
                        className="w-full rounded-lg border bg-surface px-3 py-2 text-[14px]" style={{ borderColor: 'var(--line-2)' }} />
              {reason.trim().length < 5 && (
                <span className="text-[11px]" style={{ color: 'var(--warn)' }}>
                  Write at least a few words ({reason.trim().length}/5 characters) — the reason is kept in the batch record.
                </span>
              )}
            </Section>
          )}

          <div className="rounded-lg border px-4 py-3" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
            <p className="font-head text-[12px] font-700 uppercase tracking-wider text-ink2">What happens</p>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-[13px]">
              <li><b>{title || 'The new step'}</b> ({durationHr} h{isHold ? ', passive rest' : ''}) starts after <b>{afterTitle}</b>.</li>
              <li>{waitingSteps.length > 0
                ? <>These steps will then wait for it: <b>{waitingSteps.join(', ')}</b>. Only their chain moves; parallel streams keep their times.</>
                : <>Nothing waits for {afterTitle} today, so the new step runs alongside and moves nothing.</>}</li>
              {mode === 'batch' && labCheck !== 'none' && labParams.length > 0 && (
                <li>Lab {labCheck === 'both' ? 'checks before and after' : `check ${labCheck}`}: {labParams.map(paramLabel).join(', ')} — <b>{labGate ? 'gate (GM approval needed)' : 'record only'}</b>.</li>
              )}
              {mode === 'batch' && cleaning !== 'none' && cleanLocations.length > 0 && (
                <li>Cleaning job{cleanLocations.length > 1 ? 's' : ''} for {vesselList.filter((v) => cleanLocations.includes(v.location_id)).map((v) => v.label).join(', ')}{cleanWait ? ' — work waits until done' : ' — work does not wait'}.</li>
              )}
            </ul>
            <p className="mt-1 text-[12px] text-muted">
              {mode === 'batch'
                ? 'The frozen plan of every existing step stays exactly as it is. The forecast shows the effect.'
                : 'Only this draft changes. Published versions and running batches are untouched until you publish.'}
            </p>
          </div>
          {err && <p className="rounded-lg border px-3 py-2 text-[13px] font-600" style={{ borderColor: 'var(--crit)', color: 'var(--crit)' }}>{err}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--line)' }}>
          <button type="button" onClick={onClose} className="rounded-lg border px-4 font-head text-[14px] font-600" style={{ minHeight: 44, borderColor: 'var(--line-2)' }}>Cancel</button>
          <button type="button" disabled={!canSave || busy} onClick={save} className="rounded-lg px-5 font-head text-[14px] font-700 disabled:opacity-40"
                  style={{ minHeight: 44, background: 'var(--accent)', color: 'var(--on-accent)' }}>
            {busy ? 'Saving…' : mode === 'batch' ? 'Add to this batch' : 'Add to draft'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">{n} · {title}</span>
      {children}
    </div>
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
