import { useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { activateBatch, getPreBatchMaterialCheck } from '../api/batch';
import { loadPrepare } from '../api/intake';
import {
  PREBATCH_PARAMETERS,
  acceptOutstandingPrebatchResults,
  listPrebatchCheckpoints,
  takePrebatchMaterialCheck,
} from '../api/prebatch';
import { getBatchContext } from '../api/work';
import { ErrorPanel } from '../components/field/ErrorPanel';
import { fmtWhen } from '../components/field/labWords';
import { Chip, Skeleton } from '../components/primitives';

/**
 * A4 · A5 · Prepare the batch, then activate it. `WORKSTATIONS.md` §4.
 *
 *   1 · incoming material check   the one thing that stands between a plan and a running batch
 *   2 · check and activate        the server's own findings, then the one-way door
 *
 * No crew step: work is open to the authorised squad and the server records who did it (0080).
 *
 * EVERY RULE HERE IS THE SERVER'S. `validate_batch` decides what blocks activation and says why in
 * its own words; `activate_batch` refuses if anything still blocks. This screen renders those
 * sentences and offers the action — it never decides that a batch is ready.
 *
 * ACTIVATION IS ONE-WAY and freezes the plan permanently, so the confirmation says exactly that
 * before anything is written.
 */
export function PrepareBatch() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const ongoing = params.get('ongoing') === '1';
  const qc = useQueryClient();

  const batch = useQuery({ queryKey: ['batch-context', id], queryFn: () => getBatchContext(id) });
  const prepare = useQuery({ queryKey: ['prepare', id], queryFn: () => loadPrepare(id) });
  const check = useQuery({ queryKey: ['prebatch', id], queryFn: () => getPreBatchMaterialCheck(id) });

  const refresh = () => {
    for (const k of ['batch-context', 'prepare', 'prebatch', 'admin-home']) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  };

  const activate = useMutation({ mutationFn: () => activateBatch(id), onSettled: refresh });

  const back = (
    <Link
      to="/admin"
      className="mb-3 inline-flex items-center rounded-md border px-4 font-head text-[14px] font-700 no-underline"
      style={{ minHeight: 48, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
    >
      ← Admin
    </Link>
  );

  if (batch.isLoading || prepare.isLoading) {
    return (
      <>
        {back}
        <Skeleton label="Opening the batch" lines={5} />
      </>
    );
  }
  if (batch.error || prepare.error || !batch.data) {
    return (
      <>
        {back}
        <ErrorPanel
          error={batch.error ?? prepare.error}
          prefix="This batch could not be opened."
          onRetry={() => {
            batch.refetch();
            prepare.refetch();
          }}
        />
      </>
    );
  }

  const b = batch.data;
  const p = prepare.data!;
  const isActive = b.status === 'active';
  const blocking = p.blocking;
  const warnings = p.findings.filter((f) => f.severity !== 'blocking');

  return (
    <>
      {back}

      <header className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="font-head text-[22px] font-800 leading-tight">{b.code}</h1>
          <Chip tone={isActive ? 'ok' : 'accent'}>{isActive ? 'Running' : 'Not started'}</Chip>
        </div>
        <p className="mt-1 text-[14px] text-ink2">
          <span className="mono">{b.process_code}</span>
          {b.standard_hr !== null && <> · standard H{b.standard_hr}</>}
          {b.h0 && <> · H0 {fmtWhen(b.h0)}</>}
        </p>
        <p className="mt-0.5 text-[13px] text-muted">
          {p.rows.length} activities generated from this process version.
        </p>
      </header>

      {ongoing && (
        <div
          className="mb-5 rounded-lg border px-4 py-3 text-[14px]"
          style={{ borderColor: 'var(--line-2)', background: 'var(--surface-2)', color: 'var(--ink-2)' }}
        >
          <strong>This batch is already running in the factory.</strong> Prepare it here, activate it,
          and then record where it has actually got to.
        </div>
      )}

      {isActive ? (
        <Step n={1} title="Activated" done>
          <p className="text-[14px] text-ink2">
            The plan is frozen. Work is now recorded against it as it happens.
          </p>
          <div className="mt-3 grid gap-2">
            {ongoing && (
              <Link
                to={`/admin/batch/${id}/onboard`}
                className="rounded-lg text-center font-head text-[16px] font-800 no-underline"
                style={{ minHeight: 56, background: 'var(--accent)', color: 'var(--on-accent)', lineHeight: '56px' }}
              >
                Record where it has got to →
              </Link>
            )}
            <Link
              to={`/batch/${id}`}
              className="rounded-lg border text-center font-head text-[15px] font-700 no-underline"
              style={{ minHeight: 52, borderColor: 'var(--line-2)', color: 'var(--ink-2)', lineHeight: '52px' }}
            >
              Open the batch
            </Link>
          </div>
        </Step>
      ) : (
        <>
          <Step n={1} title="Incoming material check" done={(check.data?.accepted ?? 0) > 0 && (check.data?.accepted ?? 0) >= (check.data?.tests_requested ?? 1)}>
            <MaterialCheck batchId={id} row={check.data ?? null} loading={check.isLoading} onDone={refresh} />
          </Step>

          <Step n={2} title="Check and activate" done={false}>
            <p className="mb-3 max-w-[60ch] text-[14px] text-ink2">
              Nobody is assigned in advance. Production work is open to every supervisor and lab work
              to every lab technician; the record shows who actually did each step.
            </p>
            {blocking.length > 0 && (
              <div
                className="mb-3 rounded-lg border px-4 py-3 text-[14px]"
                style={{ borderColor: 'var(--crit)', background: 'var(--crit-soft)', color: 'var(--crit)' }}
              >
                <p className="font-700">
                  {blocking.length} thing{blocking.length === 1 ? '' : 's'} must be settled first:
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {blocking.map((f, i) => (
                    <li key={`${f.code}-${i}`}>{f.message}</li>
                  ))}
                </ul>
              </div>
            )}
            {warnings.length > 0 && (
              <details className="mb-3 text-[13px] text-muted">
                <summary className="cursor-pointer">{warnings.length} note{warnings.length === 1 ? '' : 's'} that do not block</summary>
                <ul className="mt-1 list-disc pl-5">
                  {warnings.map((f, i) => (
                    <li key={`${f.code}-w-${i}`}>{f.message}</li>
                  ))}
                </ul>
              </details>
            )}

            <p className="mb-2 max-w-[60ch] text-[14px] text-ink2">
              Activating freezes the plan permanently. It cannot be undone — a batch that must not run
              is cancelled, never returned to draft.
            </p>
            <button
              type="button"
              disabled={activate.isPending || blocking.length > 0}
              onClick={() => activate.mutate()}
              className="w-full rounded-lg font-head text-[17px] font-800 disabled:opacity-50"
              style={{ minHeight: 60, background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              {activate.isPending ? 'Activating…' : 'Activate the batch'}
            </button>
            {activate.error && (
              <div className="mt-3">
                <ErrorPanel error={activate.error} prefix="The batch was not activated." />
              </div>
            )}
          </Step>
        </>
      )}
    </>
  );
}

/**
 * The incoming assay, in its three real states: none recorded, recorded but not accepted as final,
 * and accepted. The middle state exists because accepting is a LABORATORY act — an admin who
 * records the readings is refused at the accept, and the batch is then stuck until a lab technician
 * or supervisor finishes it. That refusal is shown, with the button that clears it.
 */
function MaterialCheck({
  batchId,
  row,
  loading,
  onDone,
}: {
  batchId: string;
  row: Awaited<ReturnType<typeof getPreBatchMaterialCheck>>;
  loading: boolean;
  onDone: () => void;
}) {
  const checkpoints = useQuery({ queryKey: ['prebatch-checkpoints'], queryFn: listPrebatchCheckpoints });
  const [values, setValues] = useState<Record<string, string>>({});

  const take = useMutation({
    mutationFn: () => {
      const cps = checkpoints.data ?? [];
      if (cps.length === 0) throw new Error('No incoming-material checkpoint is defined in this process.');
      const readings = PREBATCH_PARAMETERS.map((p) => {
        const raw = (values[p.code] ?? '').replace(',', '.');
        const n = Number(raw);
        if (raw.trim() === '' || !Number.isFinite(n)) throw new Error(`Enter the ${p.label.toLowerCase()} reading.`);
        return { parameter: p.code, value: n };
      });
      return takePrebatchMaterialCheck({
        batchId,
        checkpointId: cps[0].id,
        label: 'Incoming material',
        readings,
      });
    },
    onSettled: onDone,
  });

  const accept = useMutation({ mutationFn: () => acceptOutstandingPrebatchResults(batchId), onSettled: onDone });

  if (loading) return <Skeleton label="Checking the incoming material" lines={2} />;

  if (row && row.accepted >= row.tests_requested && row.tests_requested > 0) {
    return (
      <p className="text-[14px]" style={{ color: 'var(--ok)' }}>
        {row.accepted} of {row.tests_requested} readings accepted as final · sampled {fmtWhen(row.collected_at)}
        {row.collected_by_name ? ` by ${row.collected_by_name}` : ''}.
      </p>
    );
  }

  if (row && row.results_current > row.accepted) {
    return (
      <>
        <p className="text-[14px] text-ink2">
          {row.accepted} of {row.results_current} readings accepted as final. A lab technician or
          supervisor accepts the rest before the batch can start.
        </p>
        <button
          type="button"
          disabled={accept.isPending}
          onClick={() => accept.mutate()}
          className="mt-2 w-full rounded-lg font-head text-[15px] font-800 disabled:opacity-50"
          style={{ minHeight: 52, background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          {accept.isPending ? 'Accepting…' : `Accept the ${row.results_current - row.accepted} outstanding reading(s)`}
        </button>
        {accept.error && (
          <div className="mt-2">
            <ErrorPanel error={accept.error} prefix="Nothing was accepted." />
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <p className="mb-2 max-w-[60ch] text-[14px] text-ink2">
        The material is sampled before the batch clock starts. Record what the laboratory measured.
      </p>
      <div className="grid gap-2">
        {PREBATCH_PARAMETERS.map((p) => (
          <div key={p.code} className="flex items-center gap-2">
            <label htmlFor={`pb-${p.code}`} className="w-28 shrink-0 font-head text-[15px] font-700">
              {p.label}
            </label>
            <input
              id={`pb-${p.code}`}
              inputMode="decimal"
              value={values[p.code] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [p.code]: e.target.value }))}
              placeholder={p.unit ? `Value in ${p.unit}` : 'Value'}
              className="mono min-w-0 flex-1 rounded-md border bg-surface px-3 text-[17px]"
              style={{ minHeight: 52, borderColor: 'var(--line-2)' }}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={take.isPending}
        onClick={() => take.mutate()}
        className="mt-3 w-full rounded-lg font-head text-[15px] font-800 disabled:opacity-50"
        style={{ minHeight: 52, background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        {take.isPending ? 'Recording…' : 'Record the incoming check'}
      </button>
      {take.error && (
        <div className="mt-2">
          <ErrorPanel error={take.error} prefix="The check was not completed." />
        </div>
      )}
    </>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 flex items-center gap-2 font-head text-[13px] font-800 uppercase tracking-wider">
        <span
          className="mono inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px]"
          style={{ background: done ? 'var(--ok)' : 'var(--surface-3)', color: done ? 'var(--on-accent)' : 'var(--ink-2)' }}
          aria-hidden
        >
          {done ? '✓' : n}
        </span>
        <span style={{ color: 'var(--ink)' }}>{title}</span>
      </h2>
      {children}
    </section>
  );
}
