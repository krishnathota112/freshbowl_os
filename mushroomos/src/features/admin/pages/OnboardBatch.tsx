import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getPreBatchMaterialCheck } from '../../../shared/api/batch';
import { getBatchContext } from '../../../shared/api/work';
import { supabase } from '../../../shared/api/client';
import { ErrorPanel } from '../../../shared/ui/ErrorPanel';
import { Chip, Skeleton } from '../../../shared/ui/primitives';
import { fmtWhen } from '../../../shared/utilities/labWords';
import { resolveH0 } from '../api/intake';
import { listBatchStreams, onboardBatch, type BatchStream } from '../api/onboarding';
import { PREBATCH_PARAMETERS, recordInitialMaterialForBatch } from '../api/prebatch';

/**
 * Onboard a batch the factory is already running. Operating flow, 14 Sep 2026.
 *
 *   1 · actual H0            when the physical batch started (set when it was registered; correctable)
 *   2 · initial material     the pre-H0 values already known — starting information, never "accepted"
 *   3 · where it is now      for EACH stream: not started · at an activity · completed
 *
 * Confirming calls `onboard_batch`: everything before the positions is "before MushroomOS tracking"
 * (no invented times, people, photos or readings), the positions open, the batch activates, and the
 * process engine takes it from there. Streams, stages and activities come from the batch's own plan.
 */
type StreamChoice = { mode: 'not_started' | 'at' | 'completed'; positions: string[] };

export function OnboardBatch() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const batch = useQuery({ queryKey: ['batch-context', id], queryFn: () => getBatchContext(id), enabled: id !== '' });
  const material = useQuery({ queryKey: ['prebatch', id], queryFn: () => getPreBatchMaterialCheck(id), enabled: id !== '' });
  const streams = useQuery({ queryKey: ['batch-streams', id], queryFn: () => listBatchStreams(id), enabled: id !== '' });
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

  const [h0Date, setH0Date] = useState('');
  const [h0Time, setH0Time] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [choices, setChoices] = useState<Record<string, StreamChoice>>({});
  const [note, setNote] = useState('');

  const materialRecorded = (material.data?.results_current ?? 0) > 0;
  const choiceFor = (s: string): StreamChoice => choices[s] ?? { mode: 'not_started', positions: [] };
  const setChoice = (s: string, c: StreamChoice) => setChoices((p) => ({ ...p, [s]: c }));

  const positions = useMemo(
    () => Object.values(choices).flatMap((c) => (c.mode === 'at' ? c.positions.filter(Boolean) : [])),
    [choices]
  );
  const completed = useMemo(
    () => Object.entries(choices).filter(([, c]) => c.mode === 'completed').map(([s]) => s),
    [choices]
  );

  const confirm = useMutation({
    mutationFn: async () => {
      const b = batch.data;
      if (!b) throw new Error('The batch could not be read.');
      let actualH0 = b.h0;
      if (h0Date !== '' || h0Time !== '') {
        if (h0Date === '' || h0Time === '') throw new Error('Give both the date and the time of the actual start.');
        actualH0 = await resolveH0(h0Date, h0Time);
      }
      if (!actualH0) throw new Error('Give the actual date and time the batch started.');
      const unfinished = Object.entries(choices).find(([, c]) => c.mode === 'at' && c.positions.filter(Boolean).length === 0);
      if (unfinished) throw new Error('Pick the current activity for every stream marked "at an activity".');
      if (positions.length === 0 && completed.length === 0) {
        throw new Error('Give the current position of at least one stream.');
      }
      if (!materialRecorded) {
        await recordInitialMaterialForBatch(id, 'Initial material data (onboarding)', values);
      }
      return onboardBatch({ batchId: id, actualH0, positions, completedStreams: completed, note: note.trim() || null });
    },
    onSuccess: () => {
      for (const k of ['batch-context', 'prebatch', 'admin-home', 'my-work', 'batch-monitor']) {
        qc.invalidateQueries({ queryKey: [k] });
      }
      navigate(`/batch/${id}`);
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ['prebatch', id] });
    },
  });

  const back = (
    <Link
      to="/admin"
      className="mb-3 inline-flex items-center rounded-md border px-4 font-head text-[14px] font-700 no-underline"
      style={{ minHeight: 48, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
    >
      ← Admin
    </Link>
  );

  if (batch.isLoading || streams.isLoading || material.isLoading) {
    return (
      <>
        {back}
        <Skeleton label="Opening the batch" lines={5} />
      </>
    );
  }
  if (batch.error || streams.error || !batch.data) {
    return (
      <>
        {back}
        <ErrorPanel error={batch.error ?? streams.error} prefix="This batch could not be opened." />
      </>
    );
  }

  const b = batch.data;
  if (b.status !== 'draft') {
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

  return (
    <div className="mx-auto max-w-3xl pb-20">
      {back}
      <header className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="font-head text-[22px] font-800 leading-tight">Onboard running batch · {b.code}</h1>
          <Chip tone="accent">ONBOARDING</Chip>
        </div>
        <p className="mt-1 text-[14px] text-ink2">
          <span className="mono">{b.process_code}</span>
          {materials.data && materials.data.length > 0 && (
            <> · {materials.data.map((m) => m.material?.name ?? m.material?.code).filter(Boolean).join(', ')}</>
          )}
        </p>
        <p className="mt-1 max-w-[65ch] text-[13px] text-muted">
          Tell MushroomOS where each physical stream is right now. Work before that is recorded as
          “before MushroomOS tracking” — no times, people, photos or readings are invented for it.
        </p>
      </header>

      <Step n={1} title="Actual H0 — when the batch really started">
        <p className="text-[14px] text-ink2">
          Registered as <strong className="mono">{b.h0 ? fmtWhen(b.h0) : 'not set'}</strong>. Change it only if that is wrong.
        </p>
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
                  <input
                    inputMode="decimal"
                    value={values[p.code] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [p.code]: e.target.value }))}
                    placeholder={p.unit ? `Value in ${p.unit}` : 'Value'}
                    className="mono min-w-0 flex-1 rounded-md border bg-surface px-3 text-[17px]"
                    style={{ minHeight: 48, borderColor: 'var(--line-2)' }}
                  />
                </label>
              ))}
            </div>
          </>
        )}
      </Step>

      <Step n={3} title="Where is each stream now?">
        <div className="grid gap-3">
          {(streams.data ?? []).map((s) => (
            <StreamRow key={s.stream} stream={s} choice={choiceFor(s.stream)} onChange={(c) => setChoice(s.stream, c)} />
          ))}
        </div>
      </Step>

      <Step n={4} title="Confirm">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Note (optional) — e.g. who in the factory gave these positions"
          className="mb-3 w-full rounded-md border bg-surface px-3 py-2 text-[14px]"
          style={{ borderColor: 'var(--line-2)' }}
        />
        <p className="mb-2 text-[13px] text-muted">
          {positions.length} current position(s) · {completed.length} stream(s) completed. Confirming activates the
          batch; it cannot be undone.
        </p>
        <button
          type="button"
          disabled={confirm.isPending}
          onClick={() => confirm.mutate()}
          className="w-full rounded-lg font-head text-[17px] font-800 disabled:opacity-50"
          style={{ minHeight: 60, background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          {confirm.isPending ? 'Onboarding…' : 'Confirm and start tracking'}
        </button>
        {confirm.error && (
          <div className="mt-3">
            <ErrorPanel error={confirm.error} prefix="The batch was not onboarded." />
          </div>
        )}
      </Step>
    </div>
  );
}

function StreamRow({ stream, choice, onChange }: { stream: BatchStream; choice: StreamChoice; onChange: (c: StreamChoice) => void }) {
  const options: { mode: StreamChoice['mode']; label: string }[] = [
    { mode: 'not_started', label: 'Not started' },
    { mode: 'at', label: 'At an activity' },
    { mode: 'completed', label: 'Completed' },
  ];
  const setPosition = (i: number, activityId: string) => {
    const next = [...choice.positions];
    next[i] = activityId;
    onChange({ mode: 'at', positions: next });
  };
  const slots = choice.positions.length === 0 ? [''] : choice.positions;

  return (
    <div className="rounded-lg border bg-surface p-3" style={{ borderColor: 'var(--line)' }}>
      <p className="font-head text-[15px] font-800">{stream.label}</p>
      <p className="text-[12px] text-muted">{stream.stages.join(' · ')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.mode}
            type="button"
            onClick={() => onChange({ mode: o.mode, positions: o.mode === 'at' ? choice.positions : [] })}
            className="rounded-md border px-3 font-head text-[13px] font-700"
            style={{
              minHeight: 40,
              borderColor: choice.mode === o.mode ? 'var(--accent)' : 'var(--line-2)',
              background: choice.mode === o.mode ? 'var(--accent-soft)' : 'transparent',
              color: choice.mode === o.mode ? 'var(--accent-ink)' : 'var(--ink-2)',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      {choice.mode === 'at' && (
        <div className="mt-2 grid gap-2">
          {slots.map((value, i) => (
            <select
              key={i}
              value={value}
              onChange={(e) => setPosition(i, e.target.value)}
              className="rounded-md border bg-surface px-2 text-[14px]"
              style={{ minHeight: 44, borderColor: 'var(--line-2)' }}
            >
              <option value="">Choose the current activity…</option>
              {stream.stages.map((stage) => (
                <optgroup key={stage} label={stage}>
                  {stream.activities
                    .filter((a) => a.stage === stage)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                        {a.isHold ? ' (hold)' : ''}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          ))}
          <button
            type="button"
            onClick={() => onChange({ mode: 'at', positions: [...slots, ''] })}
            className="justify-self-start text-[13px] font-700"
            style={{ color: 'var(--accent-ink)' }}
          >
            + another position in this stream (e.g. a second pile or bunker)
          </button>
        </div>
      )}
    </div>
  );
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
