import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';

import { createAndPlan, resolveH0 } from '../api/intake';
import { listSelectableProcessVersions, type ProcessVersion } from '../api/process';
import { ErrorPanel } from '../components/field/ErrorPanel';
import { fmtWhen } from '../components/field/labWords';
import { Skeleton } from '../components/primitives';

/**
 * A3 · Starting a batch. Two doors, one flow — `WORKSTATIONS.md` §4.
 *
 *   NEW       the factory is about to start this. H0 is now or ahead.
 *   ONGOING   the factory is already running it. H0 is in the past, and the next screens record
 *             where the batch has actually got to.
 *
 * The difference is deliberate and visible: what MushroomOS watched from the beginning and what it
 * was told about afterwards must never look the same.
 *
 * THREE DECISIONS, and the rest has a sensible default:
 *   1 · which process     `v_process_catalogue`, filtered by the server's own `is_selectable`
 *   2 · what it is called
 *   3 · when it started   turned into a real instant by `factory_instant`, never by the browser
 *
 * The standard is the SELECTED version's own, never a constant. PROCESS-2026C computes H470 today;
 * another version computes its own number and this screen shows whatever that is.
 */
export function BatchStart({ mode }: { mode: 'new' | 'ongoing' }) {
  const nav = useNavigate();
  const ongoing = mode === 'ongoing';

  const versions = useQuery({ queryKey: ['selectable-processes'], queryFn: listSelectableProcessVersions });
  const [processId, setProcessId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const today = new Date();
  const [date, setDate] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  );
  const [time, setTime] = useState('06:00');

  const list = versions.data ?? [];
  const chosen: ProcessVersion | null = list.find((v) => v.id === processId) ?? null;

  const start = useMutation({
    mutationFn: async () => {
      if (!chosen) throw new Error('Choose the process this batch follows.');
      if (code.trim() === '') throw new Error('Give the batch a name — the numbers the factory calls it by.');
      const startAt = await resolveH0(date, time);
      return createAndPlan({
        code: code.trim(),
        label: label.trim() === '' ? code.trim() : label.trim(),
        date,
        startAt,
        processDefinitionId: chosen.id,
      });
    },
    onSuccess: (batchId) => nav(`/admin/batch/${batchId}/prepare${ongoing ? '?ongoing=1' : ''}`),
  });

  const baseline =
    chosen?.standardHr != null
      ? new Date(new Date(`${date}T${time}:00`).getTime() + chosen.standardHr * 3_600_000)
      : null;

  return (
    <>
      <header className="mb-6">
        <h1 className="font-head text-[24px] font-800 leading-tight">
          {ongoing ? 'Add an ongoing batch' : 'New batch'}
        </h1>
        <p className="mt-1 max-w-[60ch] text-[14px] text-muted">
          {ongoing
            ? 'For a batch the factory is already running. Register it here, then record where it has actually got to. Nothing is claimed to have happened inside MushroomOS.'
            : 'Plan it against a published process, check the incoming material, assign the crew, then activate.'}
        </p>
      </header>

      <Step n={1} title="Which process does it follow?">
        {versions.isLoading ? (
          <Skeleton label="Loading published processes" lines={2} />
        ) : versions.error ? (
          <ErrorPanel error={versions.error} prefix="The processes could not be loaded." onRetry={() => versions.refetch()} />
        ) : list.length === 0 ? (
          <p className="text-[14px] text-muted">
            No published process is available to plan against. One has to be published first.
          </p>
        ) : (
          <div className="grid gap-2">
            {list.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={processId === v.id}
                onClick={() => setProcessId(v.id)}
                className="rounded-lg border p-4 text-left"
                style={{
                  minHeight: 64,
                  borderColor: processId === v.id ? 'var(--accent)' : 'var(--line)',
                  background: processId === v.id ? 'var(--accent-soft)' : 'var(--surface)',
                }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-head text-[16px] font-800">
                    <span className="mono">{v.code}</span> v{v.version}
                  </span>
                  <span className="mono text-[13px]" style={{ color: 'var(--accent-ink)' }}>
                    {v.standardHr !== null ? `standard H${v.standardHr}` : 'no standard'}
                  </span>
                </div>
                <p className="mt-0.5 text-[13px] text-muted">{v.name}</p>
              </button>
            ))}
          </div>
        )}
      </Step>

      <Step n={2} title="What is this batch called?">
        <label className="block text-[13px] text-ink2" htmlFor="batch-code">
          The name the factory uses — often the batch numbers it covers, for example 366,367,368
        </label>
        <input
          id="batch-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="366,367,368"
          className="mt-1 w-full rounded-md border bg-surface px-3 text-[17px]"
          style={{ minHeight: 52, borderColor: 'var(--line-2)' }}
        />
        <label className="mt-3 block text-[13px] text-ink2" htmlFor="batch-label">
          A longer description (optional)
        </label>
        <input
          id="batch-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={code || 'Compost batch'}
          className="mt-1 w-full rounded-md border bg-surface px-3 text-[16px]"
          style={{ minHeight: 52, borderColor: 'var(--line-2)' }}
        />
      </Step>

      <Step n={3} title={ongoing ? 'When did it actually start?' : 'When does it start?'}>
        <p className="mb-2 max-w-[60ch] text-[13px] text-muted">
          H0 is bagasse wetting — the moment the batch clock begins.{' '}
          {ongoing
            ? 'Use the real time the factory started it. Everything is measured from here, and it cannot be changed once the batch is activated.'
            : 'Everything is measured from here, and it cannot be changed once the batch is activated.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            aria-label="Start date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border bg-surface px-3 text-[16px]"
            style={{ minHeight: 52, borderColor: 'var(--line-2)' }}
          />
          <input
            type="time"
            aria-label="Start time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="rounded-md border bg-surface px-3 text-[16px]"
            style={{ minHeight: 52, borderColor: 'var(--line-2)' }}
          />
        </div>
        {chosen && (
          <p className="mt-3 text-[14px] text-ink2">
            <span className="font-head font-700">{chosen.code}</span> · standard{' '}
            {chosen.standardHr !== null ? `H${chosen.standardHr}` : '—'} · H0 {date} {time}
            {baseline && <> · baseline ends {fmtWhen(baseline.toISOString())}</>}
          </p>
        )}
      </Step>

      {start.error && (
        <div className="mb-4">
          <ErrorPanel error={start.error} prefix="The batch was not created." />
        </div>
      )}

      <button
        type="button"
        disabled={start.isPending || !chosen || code.trim() === ''}
        onClick={() => start.mutate()}
        className="w-full rounded-lg font-head text-[17px] font-800 disabled:opacity-50"
        style={{ minHeight: 60, background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        {start.isPending
          ? 'Creating the batch and its plan…'
          : ongoing
            ? 'Register it and build the plan'
            : 'Create the batch and its plan'}
      </button>
      <p className="mt-2 text-[13px] text-muted">
        This creates the batch as a draft and generates its activities. Nothing is frozen until you
        activate it on the next screen.
      </p>
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 flex items-center gap-2 font-head text-[13px] font-800 uppercase tracking-wider">
        <span
          className="mono inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px]"
          style={{ background: 'var(--surface-3)', color: 'var(--ink-2)' }}
          aria-hidden
        >
          {n}
        </span>
        <span style={{ color: 'var(--ink)' }}>{title}</span>
      </h2>
      {children}
    </section>
  );
}
