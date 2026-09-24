import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getPreBatchMaterialCheck } from '../../../shared/api/batch';
import { getBatchContext } from '../../../shared/api/work';
import { supabase } from '../../../shared/api/client';
import { ErrorPanel } from '../../../shared/ui/feedback/ErrorPanel';
import { Chip, Skeleton } from '../../../shared/ui/primitives';
import { fmtWhen } from '../../../shared/utils/labWords';
import { resolveH0 } from '../api/intake';
import {
  listOnboardingUnits,
  loadOnboardedState,
  onboardBatch,
  previewOnboarding,
  isStreamLine,
  unitWords,
  type OnboardInput,
  type OnboardStream,
  type OnboardUnit,
  type PreviewRow,
} from '../api/onboarding';
import { PREBATCH_PARAMETERS, recordInitialMaterialForBatch } from '../api/prebatch';

/**
 * Onboard a batch the factory is already running. Per-unit, 16 Sep 2026.
 *
 *   1 · actual start        optional — only if the factory knows it
 *   2 · initial material    the pre-H0 values already known
 *   3 · where is it now     for EACH unit (the stream's shared line, each pile, each bunker, each tunnel
 *                           line): not started · currently at <activity> · finished
 *   4 · review              the SERVER's answer for those choices (`preview_onboard_batch`, rolled back)
 *   5 · confirm             `onboard_batch`, then the batch is read back and checked against the review
 *
 * Nothing here decides what is done: the server does, from the process's own dependencies, and refuses
 * a combination that would need history nobody stated.
 */
const NOT_STARTED = '';
const FINISHED = '__finished__';
type Step = 'edit' | 'review' | 'done';

export function OnboardBatch() {
  const { id = '' } = useParams();
  const qc = useQueryClient();

  const batch = useQuery({ queryKey: ['batch-context', id], queryFn: () => getBatchContext(id), enabled: id !== '' });
  const material = useQuery({ queryKey: ['prebatch', id], queryFn: () => getPreBatchMaterialCheck(id), enabled: id !== '' });
  const streams = useQuery({ queryKey: ['onboard-units', id], queryFn: () => listOnboardingUnits(id), enabled: id !== '' });
  const materials = useQuery({
    queryKey: ['batch-materials', id],
    enabled: id !== '',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batch_material_role')
        .select('role, material:material(code, name)')
        .eq('master_batch_id', id);
      if (error) throw error;
      return (data ?? []) as unknown as { role: string; material: { code: string; name: string | null } | null }[];
    },
  });

  const [step, setStep] = useState<Step>('edit');
  const [h0Date, setH0Date] = useState('');
  const [h0Time, setH0Time] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  /** unit key → NOT_STARTED | FINISHED | activity id */
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');

  const materialRecorded = (material.data?.results_current ?? 0) > 0;
  const units = useMemo(() => (streams.data ?? []).flatMap((s) => s.units), [streams.data]);

  const input = useMemo((): Omit<OnboardInput, 'actualH0'> => ({
    batchId: id,
    positions: units.map((u) => choice[u.key] ?? NOT_STARTED).filter((v) => v !== NOT_STARTED && v !== FINISHED),
    finishedUnits: units.filter((u) => choice[u.key] === FINISHED).map((u) => u.key),
    note: note.trim() || null,
  }), [id, units, choice, note]);

  // ── review: validate on the screen, then ask the server what it would do ─────────────────────
  const review = useMutation({
    mutationFn: async () => {
      if (!batch.data) throw new Error('The batch could not be read.');
      let actualH0: string | null = null;
      if (h0Date !== '' || h0Time !== '') {
        if (h0Date === '' || h0Time === '') throw new Error('Give both the date and the time of the actual start, or leave both empty.');
        actualH0 = await resolveH0(h0Date, h0Time);
        if (new Date(actualH0).getTime() > Date.now()) throw new Error('The actual start cannot be in the future.');
      }
      if (input.positions.length === 0 && input.finishedUnits.length === 0) {
        throw new Error('Everything is marked "not started". Say where at least one part of the batch is — or create it as a new batch instead.');
      }
      for (const u of units) {
        const c = choice[u.key];
        if (c && c !== FINISHED && !u.activities.some((a) => a.id === c)) {
          throw new Error(`${u.label}: the chosen activity does not belong to this unit. Choose again.`);
        }
      }
      if (!materialRecorded && Object.values(values).some((v) => v.trim() !== '')) {
        // starting information, saved as soon as it is given — the same as the earlier screen did on confirm
        await recordInitialMaterialForBatch(id, 'Initial material data (onboarding)', values);
        await qc.invalidateQueries({ queryKey: ['prebatch', id] });
      }
      const full = { ...input, actualH0 };
      const rows = await previewOnboarding(full);
      const { batch: before } = await loadOnboardedState(id);
      return { full, rows, processBefore: before.process_definition_id };
    },
    onSuccess: () => setStep('review'),
  });

  // ── confirm: save, read back, check ──────────────────────────────────────────────────────────
  const confirm = useMutation({
    mutationFn: async () => {
      const r = review.data;
      if (!r) throw new Error('Review the onboarding first.');
      const result = await onboardBatch(r.full);
      const saved = await loadOnboardedState(id);
      return { result, checks: verify(r.full, r.rows, r.processBefore, saved, units) };
    },
    onSuccess: () => {
      setStep('done');
      for (const k of ['batch-context', 'prebatch', 'admin-home', 'my-work', 'batch-monitor']) {
        qc.invalidateQueries({ queryKey: [k] });
      }
    },
  });

  const back = (
    <Link to="/admin" className="mb-3 inline-flex items-center rounded-md border px-4 font-head text-[14px] font-700 no-underline"
          style={{ minHeight: 48, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}>
      ← Admin
    </Link>
  );

  if (batch.isLoading || streams.isLoading || material.isLoading) {
    return (<>{back}<Skeleton label="Opening the batch" lines={5} /></>);
  }
  if (batch.error || streams.error || !batch.data) {
    return (<>{back}<ErrorPanel error={batch.error ?? streams.error} prefix="This batch could not be opened." /></>);
  }

  const b = batch.data;
  if (b.status !== 'draft' && step !== 'done') {
    return (
      <>
        {back}
        <p className="text-[15px] text-ink2">
          {b.code} is {b.status}. Only a batch still being set up can be onboarded.{' '}
          <Link to={`/batch/${id}`}>Open the batch</Link>
        </p>
      </>
    );
  }

  const header = (
    <header className="mb-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="font-head text-[22px] font-800 leading-tight">Onboard running batch · {b.code}</h1>
        <Chip tone="accent">{step === 'edit' ? 'STEP 1 OF 2 · POSITIONS' : step === 'review' ? 'STEP 2 OF 2 · REVIEW' : 'ONBOARDED'}</Chip>
      </div>
      <p className="mt-1 text-[14px] text-ink2">
        <span className="mono">{b.process_code}</span>
        {materials.data && materials.data.length > 0 && (
          <> · {materials.data.map((m) => m.material?.name ?? m.material?.code).filter(Boolean).join(', ')}</>
        )}
      </p>
    </header>
  );

  const streamList = streams.data ?? [];
  const errorText = (e: unknown) => {
    const m = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
    return new Error(unitWords(m, streamList));
  };

  // ── DONE ─────────────────────────────────────────────────────────────────────────────────────
  if (step === 'done' && confirm.data) {
    const failed = confirm.data.checks.filter((c) => !c.ok);
    return (
      <div className="mx-auto max-w-3xl pb-20">
        {back}
        {header}
        <Step n={3} title="Saved — checked against the database">
          <ul className="grid gap-1 text-[14px]">
            {confirm.data.checks.map((c) => (
              <li key={c.label} className="flex gap-2">
                <span style={{ color: c.ok ? 'var(--ok)' : 'var(--crit)' }} aria-hidden>{c.ok ? '✓' : '✗'}</span>
                <span>{c.label}{c.detail && <span className="text-muted"> — {c.detail}</span>}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[14px]" style={{ color: failed.length ? 'var(--crit)' : 'var(--ok)' }}>
            {failed.length
              ? `${failed.length} check(s) did not match. The batch is saved; tell the team before work continues.`
              : 'Everything saved as reviewed.'}
          </p>
          <Link to={`/batch/${id}`} className="mt-3 inline-flex items-center rounded-lg px-5 font-head text-[16px] font-800 no-underline"
                style={{ minHeight: 52, background: 'var(--accent)', color: 'var(--on-accent)' }}>
            Open the batch →
          </Link>
        </Step>
      </div>
    );
  }

  // ── REVIEW ───────────────────────────────────────────────────────────────────────────────────
  if (step === 'review' && review.data) {
    const { full, rows } = review.data;
    const lab = rows.filter((r) => r.is_lab);
    return (
      <div className="mx-auto max-w-3xl pb-20">
        {back}
        {header}
        <Step n={1} title="Check before saving">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[14px]">
            <dt className="text-muted">Batch</dt><dd className="font-700">{b.code}</dd>
            <dt className="text-muted">Actual start (H0)</dt>
            <dd>{full.actualH0 ? fmtWhen(full.actualH0) : 'Not known — the plan counts from now'}</dd>
            <dt className="text-muted">Process</dt><dd className="mono">{b.process_code}</dd>
          </dl>
          <p className="mt-2 text-[13px] text-muted">
            This is what MushroomOS will save — worked out by the server from the process, not by this screen.
            Work marked “done” is recorded as <em>before MushroomOS tracking</em>: no times, people, photos or readings are invented for it.
          </p>
        </Step>

        {streamList.map((s) => (
          <section key={s.stream} className="mb-4">
            <h3 className="mb-1 font-head text-[14px] font-800 uppercase tracking-wide">{s.label}</h3>
            <div className="rounded-lg border" style={{ borderColor: 'var(--line)' }}>
              {s.units.map((u) => (
                <UnitResult key={u.key} unit={u} single={isStreamLine(s, u)} choice={choice[u.key] ?? NOT_STARTED}
                            rows={rows.filter((r) => !r.is_lab && `${r.stream}|${r.unit}` === u.key)} />
              ))}
            </div>
          </section>
        ))}

        <section className="mb-4">
          <h3 className="mb-1 font-head text-[14px] font-800 uppercase tracking-wide">Laboratory</h3>
          <p className="text-[14px] text-ink2">
            {lab.filter((r) => r.before_tracking).length} check(s) recorded as before tracking ·{' '}
            {lab.filter((r) => !r.before_tracking && r.state === 'READY').length} due now ·{' '}
            {lab.filter((r) => !r.before_tracking && r.state !== 'READY').length} later
          </p>
        </section>

        <Step n={2} title="Confirm">
          <p className="mb-2 text-[13px] text-muted">Confirming activates the batch. It cannot be undone.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { confirm.reset(); setStep('edit'); }} disabled={confirm.isPending}
                    className="rounded-lg border px-5 font-head text-[16px] font-800"
                    style={{ minHeight: 56, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}>
              ← Back
            </button>
            <button type="button" onClick={() => confirm.mutate()} disabled={confirm.isPending}
                    className="flex-1 rounded-lg font-head text-[17px] font-800 disabled:opacity-50"
                    style={{ minHeight: 56, background: 'var(--accent)', color: 'var(--on-accent)' }}>
              {confirm.isPending ? 'Saving and checking…' : 'Confirm onboarding'}
            </button>
          </div>
          {confirm.error && (
            <div className="mt-3"><ErrorPanel error={errorText(confirm.error)} prefix="The batch was not onboarded." /></div>
          )}
        </Step>
      </div>
    );
  }

  // ── EDIT ─────────────────────────────────────────────────────────────────────────────────────
  const setUnit = (key: string, v: string) => { review.reset(); setChoice((p) => ({ ...p, [key]: v })); };
  const setStream = (s: OnboardStream, v: string) => {
    review.reset();
    setChoice((p) => ({ ...p, ...Object.fromEntries(s.units.map((u) => [u.key, v])) }));
  };

  return (
    <div className="mx-auto max-w-3xl pb-20">
      {back}
      {header}
      <p className="-mt-3 mb-5 max-w-[65ch] text-[13px] text-muted">
        Say where each part of the batch is right now. You will see exactly what will be saved before anything changes.
      </p>

      <Step n={1} title="Actual start (optional)">
        <p className="text-[14px] text-ink2">Only if the factory knows when bagasse wetting really started. Leave empty if not known.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input type="date" value={h0Date} onChange={(e) => setH0Date(e.target.value)}
                 className="mono rounded-md border bg-surface px-3" style={{ minHeight: 48, borderColor: 'var(--line-2)' }} />
          <input type="time" value={h0Time} onChange={(e) => setH0Time(e.target.value)}
                 className="mono rounded-md border bg-surface px-3" style={{ minHeight: 48, borderColor: 'var(--line-2)' }} />
        </div>
      </Step>

      <Step n={2} title="Initial material data (pre-H0)">
        {materialRecorded ? (
          <p className="text-[14px] text-ok">Recorded ({material.data?.results_current} value(s)).</p>
        ) : (
          <>
            <p className="mb-2 text-[14px] text-ink2">The values already known. Leave a field blank if it is not known.</p>
            <div className="grid gap-2">
              {PREBATCH_PARAMETERS.map((p) => (
                <label key={p.code} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 font-head text-[15px] font-700">{p.label}</span>
                  <input inputMode="decimal" value={values[p.code] ?? ''}
                         onChange={(e) => setValues((v) => ({ ...v, [p.code]: e.target.value }))}
                         placeholder={p.unit ? `Value in ${p.unit}` : 'Value'}
                         className="mono min-w-0 flex-1 rounded-md border bg-surface px-3 text-[17px]"
                         style={{ minHeight: 48, borderColor: 'var(--line-2)' }} />
                </label>
              ))}
            </div>
          </>
        )}
      </Step>

      <Step n={3} title="Where is the batch now?">
        <div className="grid gap-4">
          {streamList.map((s) => (
            <section key={s.stream} className="rounded-lg border bg-surface" style={{ borderColor: 'var(--line)' }}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--line)' }}>
                <h3 className="font-head text-[15px] font-800">{s.label}</h3>
                {s.units.length > 1 && (
                  <div className="flex gap-1 text-[12px]">
                    <span className="text-muted">All:</span>
                    <button type="button" className="font-700" style={{ color: 'var(--accent-ink)' }} onClick={() => setStream(s, NOT_STARTED)}>not started</button>
                    <span className="text-muted">·</span>
                    <button type="button" className="font-700" style={{ color: 'var(--accent-ink)' }} onClick={() => setStream(s, FINISHED)}>finished</button>
                  </div>
                )}
              </div>
              {s.units.map((u) => (
                <UnitRow key={u.key} unit={u} single={isStreamLine(s, u)}
                         value={choice[u.key] ?? NOT_STARTED} onChange={(v) => setUnit(u.key, v)} />
              ))}
            </section>
          ))}
        </div>
      </Step>

      <Step n={4} title="Review">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                  placeholder="Note (optional) — e.g. who in the factory gave these positions"
                  className="mb-3 w-full rounded-md border bg-surface px-3 py-2 text-[14px]" style={{ borderColor: 'var(--line-2)' }} />
        <p className="mb-2 text-[13px] text-muted">
          {input.positions.length} current · {input.finishedUnits.length} finished ·{' '}
          {units.length - input.positions.length - input.finishedUnits.length} not started. Nothing is saved yet.
        </p>
        <button type="button" disabled={review.isPending} onClick={() => review.mutate()}
                className="w-full rounded-lg font-head text-[17px] font-800 disabled:opacity-50"
                style={{ minHeight: 60, background: 'var(--accent)', color: 'var(--on-accent)' }}>
          {review.isPending ? 'Working out the result…' : 'Review what will be saved →'}
        </button>
        {review.error && (
          <div className="mt-3"><ErrorPanel error={errorText(review.error)} prefix="These positions cannot be saved as they are." /></div>
        )}
      </Step>
    </div>
  );
}

/** One physical unit: one dropdown, built only from that unit's own process activities. */
function UnitRow({ unit, single, value, onChange }: { unit: OnboardUnit; single: boolean; value: string; onChange: (v: string) => void }) {
  const tone = value === FINISHED ? 'var(--ok)' : value === NOT_STARTED ? 'var(--line-2)' : 'var(--accent)';
  return (
    <label className="flex flex-wrap items-center gap-2 border-b px-3 py-2 last:border-b-0" style={{ borderColor: 'var(--line)' }}>
      <span className="w-full font-head text-[14px] font-700 sm:w-44 sm:shrink-0">{single ? 'Status' : unit.label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
              className="min-w-0 flex-1 rounded-md border bg-surface px-2 text-[14px]"
              style={{ minHeight: 44, borderColor: tone, borderWidth: value === NOT_STARTED ? 1 : 2 }}>
        <option value={NOT_STARTED}>Not started</option>
        <optgroup label="Currently at">
          {unit.activities.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}{a.isHold ? ' (rest / hold)' : ''}{a.startHour !== null ? ` · H${a.startHour}` : ''}
            </option>
          ))}
        </optgroup>
        <option value={FINISHED}>Finished — all {unit.activities.length} step(s) done</option>
      </select>
    </label>
  );
}

/** The server's result for one unit: what becomes history, what is current, what comes next. */
function UnitResult({ unit, single, choice, rows }: { unit: OnboardUnit; single: boolean; choice: string; rows: PreviewRow[] }) {
  const done = rows.filter((r) => r.before_tracking);
  const current = rows.filter((r) => r.is_position);
  const next = rows.filter((r) => !r.before_tracking && !r.is_position && r.state === 'READY');
  const later = rows.length - done.length - current.length - next.length;
  const said = choice === FINISHED ? 'Finished' : choice === NOT_STARTED ? 'Not started'
    : `Currently at ${unit.activities.find((a) => a.id === choice)?.title ?? '?'}`;
  return (
    <div className="border-b px-3 py-2 text-[14px] last:border-b-0" style={{ borderColor: 'var(--line)' }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-head font-700">{single ? said : `${unit.label} → ${said}`}</span>
        <span className="text-[12px] text-muted">{rows.length} step(s)</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        {done.length > 0 && <span style={{ color: 'var(--ok)' }}>✓ {done.length} done before tracking</span>}
        {current.map((r) => <span key={r.activity_id} style={{ color: 'var(--accent-ink)' }}>● Current: {r.title}</span>)}
        {next.map((r) => <span key={r.activity_id}>→ Ready next: {r.title}</span>)}
        {later > 0 && <span className="text-muted">○ {later} later</span>}
      </div>
    </div>
  );
}

type Check = { label: string; ok: boolean; detail?: string };

/** After saving: the database, read back, against the review and the choices. */
export function verify(
  full: OnboardInput,
  preview: PreviewRow[],
  processBefore: string,
  saved: Awaited<ReturnType<typeof loadOnboardedState>>,
  units: OnboardUnit[],
): Check[] {
  const prod = saved.activities.filter((a) => a.responsible_role !== 'lab_tech');
  const key = (a: { stream: string; scope_label: string | null }) => `${a.stream}|${a.scope_label ?? 'Whole batch'}`;
  const chosenNotStarted = units.filter((u) => !full.finishedUnits.includes(u.key) && !u.activities.some((a) => full.positions.includes(a.id)));
  const prevState = new Map(preview.map((r) => [r.activity_id, `${r.state}/${r.before_tracking}`]));
  const differs = saved.activities.filter((a) => prevState.get(a.id) !== `${a.state}/${Boolean(a.before_tracking)}`);
  const lostPositions = full.positions.filter((p) => !prod.some((a) => a.id === p && a.onboarded_position && !a.before_tracking));
  const unfinished = prod.filter((a) => full.finishedUnits.includes(key(a)) && !a.before_tracking);
  const assumed = prod.filter((a) => chosenNotStarted.some((u) => u.key === key(a)) && a.before_tracking);
  const invented = saved.activities.filter((a) => a.actual_start || a.actual_end);
  const plannedHistory = saved.activities.filter((a) => a.before_tracking && a.planned_start_at);
  const soon = Date.now() + 30 * 60 * 1000;
  const earlyReady = saved.activities.filter((a) => a.state === 'READY' && a.planned_start_at && new Date(a.planned_start_at).getTime() > soon);
  const h0ok = full.actualH0 === null ? saved.batch.start_at === null
    : saved.batch.start_at !== null && new Date(saved.batch.start_at).getTime() === new Date(full.actualH0).getTime();

  return [
    { label: 'Batch is active', ok: saved.batch.status === 'active', detail: saved.batch.status },
    { label: 'Actual start (H0) saved as given', ok: h0ok, detail: saved.batch.start_at ? fmtWhen(saved.batch.start_at) : 'none — plan counts from onboarding' },
    { label: 'Process version unchanged', ok: saved.batch.process_definition_id === processBefore },
    { label: `All ${full.positions.length} current position(s) saved`, ok: lostPositions.length === 0, detail: lostPositions.length ? `${lostPositions.length} missing` : undefined },
    { label: 'Finished units recorded as done before tracking', ok: unfinished.length === 0, detail: unfinished.length ? unfinished.map((a) => a.code).join(', ') : undefined },
    { label: '“Not started” units have no assumed history', ok: assumed.length === 0, detail: assumed.length ? assumed.map((a) => a.code).join(', ') : undefined },
    { label: 'No start or finish times invented', ok: invented.length === 0, detail: invented.length ? `${invented.length} activity(ies) carry times` : undefined },
    { label: 'Work before tracking has no planned time', ok: plannedHistory.length === 0 },
    { label: 'Nothing planned for later is marked ready now', ok: earlyReady.length === 0, detail: earlyReady.length ? earlyReady.map((a) => a.code).join(', ') : undefined },
    { label: 'Saved result matches the review', ok: differs.length === 0, detail: differs.length ? `${differs.length} activity(ies) differ: ${differs.slice(0, 5).map((a) => a.code).join(', ')}` : `${saved.activities.length} activities` },
  ];
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 flex items-center gap-2 font-head text-[13px] font-800 uppercase tracking-wider">
        <span className="mono inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px]"
              style={{ background: 'var(--surface-3)', color: 'var(--ink-2)' }} aria-hidden>
          {n}
        </span>
        <span style={{ color: 'var(--ink)' }}>{title}</span>
      </h2>
      {children}
    </section>
  );
}
