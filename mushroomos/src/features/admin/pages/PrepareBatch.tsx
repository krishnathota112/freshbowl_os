import { useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { activateBatch, getPreBatchMaterialCheck } from '../../../shared/api/batch';
import { loadPrepare } from '../api/intake';
import { PREBATCH_PARAMETERS, PREBATCH_WEIGHT_MATERIALS, recordInitialMaterialForBatch, weightCode } from '../api/prebatch';
import { getBatchContext } from '../../../shared/api/work';
import { ErrorPanel } from '../../../shared/ui/feedback/ErrorPanel';
import { fmtWhen } from '../../../shared/utils/labWords';
import { Chip, Skeleton } from '../../../shared/ui/primitives';

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
          <Step n={1} title="Pre-H0 / initial material data" done={(check.data?.results_current ?? 0) > 0}>
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
            {ongoing ? (
              <Link
                to={`/admin/batch/${id}/onboard`}
                className="w-full rounded-lg text-center font-head text-[16px] font-800 no-underline flex items-center justify-center gap-2"
                style={{ minHeight: 60, background: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                <span>Continue Onboarding Ongoing Batch (Position & Activity)</span>
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </Link>
            ) : (
              <button
                type="button"
                disabled={activate.isPending || blocking.length > 0}
                onClick={() => activate.mutate()}
                className="w-full rounded-lg font-head text-[17px] font-800 disabled:opacity-50"
                style={{ minHeight: 60, background: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                {activate.isPending ? 'Activating…' : 'Activate the batch'}
              </button>
            )}
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
 * Pre-H0 Material Entry: Record physical starting measurements (moisture, pH, dry weight).
 * Post-H0 checkpoints are recorded by the Lab team during active production.
 */
export function MaterialCheck({
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
  const [values, setValues] = useState<Record<string, string>>({});
  const [weights, setWeights] = useState<Record<string, string>>({});

  const take = useMutation({
    mutationFn: () => recordInitialMaterialForBatch(batchId, 'Initial material data', values, weights),
    onSettled: onDone,
  });

  if (loading) return <Skeleton label="Checking pre-H0 material record" lines={2} />;

  if (row && row.results_current > 0) {
    return (
      <div className="p-4 rounded-xl border border-ok/40 bg-ok-soft space-y-1">
        <p className="font-head text-sm font-bold text-ok flex items-center gap-1.5">
          <span className="material-symbols-outlined text-base">check_circle</span>
          Pre-H0 Material Measurements Recorded
        </p>
        <p className="text-xs text-ink-2">
          Recorded starting measurements prior to H0 start. Post-H0 checkpoints will be handled by the Lab team.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="mb-2 max-w-[60ch] text-[14px] text-ink2">
        Record the material values already known before H0 (moisture, pH, dry weight). They are the
        batch's starting information — leave a field blank if it is not known.
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
      <h3 className="mb-1 mt-5 font-head text-[13px] font-800 uppercase tracking-wider text-ink">Weights</h3>
      <p className="mb-2 max-w-[60ch] text-[13px] text-muted">
        Dry and fresh weight of each material, in kilograms. Leave blank what is not used or not known.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] border-collapse text-[14px]">
          <thead>
            <tr className="text-left text-[12px] uppercase tracking-wide text-muted">
              <th className="py-1 pr-2 font-700">Material</th>
              <th className="py-1 pr-2 font-700">Dry weight (kg)</th>
              <th className="py-1 font-700">Fresh weight (kg)</th>
            </tr>
          </thead>
          <tbody>
            {PREBATCH_WEIGHT_MATERIALS.map((m) => (
              <tr key={m.key} className="border-t" style={{ borderColor: 'var(--line)' }}>
                <th scope="row" className="py-1.5 pr-2 text-left font-head font-700">{m.label}</th>
                {(['dry', 'fresh'] as const).map((kind) => {
                  const code = weightCode(m.key, kind);
                  return (
                    <td key={kind} className={kind === 'dry' ? 'py-1.5 pr-2' : 'py-1.5'}>
                      <input
                        id={`pb-${code}`}
                        aria-label={`${m.label} ${kind} weight (kg)`}
                        inputMode="decimal"
                        value={weights[code] ?? ''}
                        onChange={(e) => setWeights((w) => ({ ...w, [code]: e.target.value }))}
                        placeholder="kg"
                        className="mono w-full min-w-0 rounded-md border bg-surface px-2 text-[16px]"
                        style={{ minHeight: 44, borderColor: 'var(--line-2)' }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        disabled={take.isPending}
        onClick={() => take.mutate()}
        className="mt-3 w-full rounded-lg font-head text-[15px] font-800 disabled:opacity-50"
        style={{ minHeight: 52, background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        {take.isPending ? 'Saving Pre-H0 Entry…' : 'Save Pre-H0 Material Entry'}
      </button>
      {take.error && (
        <div className="mt-2">
          <ErrorPanel error={take.error} prefix="The pre-H0 entry was not completed." />
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
