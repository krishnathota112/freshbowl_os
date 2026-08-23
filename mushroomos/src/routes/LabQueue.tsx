import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  findOpenSample,
  loadCheckpointOptions,
  loadLabQueue,
  loadPendingTests,
  loadResults,
  openSample,
  orderRetest,
  recordResult,
  requestTest,
  type CheckpointOption,
  type LabQueueRow,
  type LabResultRow,
} from '../api/lab';
import { PageHeading } from '../components/layout/PageHeading';
import { Card, Chip, ConflictMarker, EmptyState, Skeleton } from '../components/primitives';

/**
 * S12 · the lab technician's queue. `UI_IMPLEMENTATION_PLAN §S12`, `UI_DATA_CONTRACTS §12`.
 *
 * A FIELD ROUTE — it renders inside `FieldShell`, not `AppShell`, because `lab_tech` is one of the
 * two roles in `FIELD_ROLES`. One task on screen, ≥48 px targets, no nav bar.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS SCREEN REPLACED
 *
 * A `Pending` placeholder reading "Samples appear here when an activity submission generates them
 * · Step 8". That was true when written. It stopped being true the moment there were 35 actionable
 * lab activities on live batches — the same stale-placeholder defect found on Admin Today and in
 * C9's lab band, now the third time.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * TWO DECISIONS THIS SCREEN PUSHES BACK ONTO A PERSON
 *
 * · WHICH CHECKPOINT. C-33 is open — the dictation map and the S4b column map both describe the
 *   same physical moments under different codes with different parameter panels, and nothing in
 *   the sources prefers one. The technician chooses, with both maps shown and every conflict each
 *   row touches named on its face. Auto-selecting would resolve C-33 in code, silently.
 *
 * · WHETHER A READING PASSES. The verdict comes back from `record_lab_result`, frozen against the
 *   spec band at request time. Where TBD-36 leaves a checkpoint unmapped no band exists and the
 *   verdict is `no_spec` — reported as such, never as a pass.
 *
 * AND ONE IT REFUSES TO INVENT: there is no OVERDUE band. No source states a lab turnaround time.
 * `v_lab_queue.overdue_unknown_reason` says so on screen rather than leaving a reader to assume
 * everything is on time.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export function LabQueue() {
  const [openActivity, setOpenActivity] = useState<LabQueueRow | null>(null);

  const q = useQuery({ queryKey: ['lab-queue'], queryFn: loadLabQueue, refetchInterval: 60_000 });

  if (q.isLoading) {
    return (
      <>
        <PageHeading title="Lab" subtitle="What is waiting for a reading" />
        <Skeleton label="Loading the queue" lines={4} />
      </>
    );
  }

  if (q.error) {
    return (
      <>
        <PageHeading title="Lab" />
        <EmptyState
          title="Could not read the queue"
          detail={`${(q.error as Error).message}. Nothing has been changed — try again.`}
        />
      </>
    );
  }

  const rows = q.data ?? [];
  const waiting = rows.filter((r) => r.actionRequired);
  const retest = waiting.filter((r) => r.band === 'retest');
  const today = waiting.filter((r) => r.band !== 'retest');
  const done = rows.filter((r) => !r.actionRequired);

  if (openActivity !== null) {
    return <SampleSheet row={openActivity} onClose={() => setOpenActivity(null)} />;
  }

  return (
    <>
      <PageHeading
        title="Lab"
        subtitle={`${waiting.length} waiting on a reading`}
        right={<Chip tone={waiting.length > 0 ? 'warn' : 'ok'}>{waiting.length}</Chip>}
      />

      {retest.length > 0 && (
        <Band title="Retest required" tone="crit">
          {retest.map((r) => (
            <QueueRow key={r.activityId} row={r} onOpen={() => setOpenActivity(r)} />
          ))}
        </Band>
      )}

      <Band title="Waiting on a reading" tone="warn">
        {today.length === 0 ? (
          <EmptyState
            title="Nothing is waiting on the lab."
            detail="An activity appears here when its plan calls for a lab parameter and the batch reaches it."
          />
        ) : (
          today.map((r) => <QueueRow key={r.activityId} row={r} onOpen={() => setOpenActivity(r)} />)
        )}
      </Band>

      {/*
        The absence, stated. `v_lab_queue` carries this sentence precisely so the missing third band
        is visible instead of being read as "nothing is late".
      */}
      {rows.length > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          There is no <span className="mono">overdue</span> band. {rows[0].overdueUnknownReason}.
        </p>
      )}

      {done.length > 0 && (
        <Band title="Already recorded" tone="ok">
          {done.slice(0, 20).map((r) => (
            <QueueRow key={r.activityId} row={r} onOpen={() => setOpenActivity(r)} muted />
          ))}
        </Band>
      )}
    </>
  );
}

/**
 * `lab_retest_reason`, in the technician's words. Every member of the enum is here — an enum with a
 * missing option is an option nobody can ever record.
 */
const RETEST_REASONS = [
  { value: 'sampling_error', label: 'The sample was wrong' },
  { value: 'instrument_out_of_calibration', label: 'The instrument was out of calibration' },
  { value: 'post_corrective_action', label: 'Re-measured after a corrective action' },
  { value: 'supervisor_request', label: 'The supervisor asked for it' },
  { value: 'result_implausible', label: 'The reading was not believable' },
];

function Band({
  title,
  tone,
  children,
}: {
  title: string;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 font-head text-[12px] font-700 uppercase tracking-wider text-muted">
        {title}
      </h2>
      <div className="grid gap-2" data-tone={tone}>
        {children}
      </div>
    </section>
  );
}

function QueueRow({
  row,
  onOpen,
  muted = false,
}: {
  row: LabQueueRow;
  onOpen: () => void;
  muted?: boolean;
}) {
  return (
    <Card className="p-3" rail={muted ? 'var(--line-2)' : row.band === 'retest' ? 'var(--crit)' : 'var(--warn)'}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-head text-[15px] font-800">{row.activityTitle}</span>
        <span className="mono text-[11px] text-muted">{row.batchCode}</span>
      </div>
      <p className="mt-0.5 text-[12px] text-muted">
        {row.scopeLabel}
        {row.currentDay !== null ? ` · Day ${row.currentDay}` : ' · no day stated'}
      </p>

      <p className="mt-1 flex flex-wrap gap-1">
        {row.parameters.length === 0 ? (
          <span className="text-[12px] text-muted">no parameter named on this activity</span>
        ) : (
          row.parameters.map((p) => (
            <span key={p} className="mono rounded px-1.5 text-[11px]" style={{ background: 'var(--surface-2)' }}>
              {p}
            </span>
          ))
        )}
      </p>

      <p className="mt-1 text-[12px] text-muted">
        {row.samples} sample{row.samples === 1 ? '' : 's'} · {row.results} reading
        {row.results === 1 ? '' : 's'} recorded
      </p>

      <button
        type="button"
        onClick={onOpen}
        className="mt-2 w-full rounded font-head text-[13px] font-700"
        style={{
          minHeight: 48,
          background: muted ? 'var(--surface-2)' : 'var(--accent-soft)',
          color: muted ? 'var(--ink-2)' : 'var(--accent-ink)',
          border: '1px solid var(--accent)',
        }}
      >
        {muted ? 'Open the record' : row.samples === 0 ? 'Take a sample' : 'Record a reading'}
      </button>
    </Card>
  );
}

/* ── the sample sheet: one activity, one task on screen ─────────────────────────────────────── */

function SampleSheet({ row, onClose }: { row: LabQueueRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  const existing = useQuery({
    queryKey: ['lab-sample', row.activityId],
    queryFn: () => findOpenSample(row.activityId),
  });
  const options = useQuery({
    queryKey: ['lab-checkpoints', row.currentDay],
    queryFn: () => loadCheckpointOptions(row.currentDay),
  });
  const results = useQuery({
    queryKey: ['lab-results', row.activityId],
    queryFn: () => loadResults(row.activityId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['lab-queue'] });
    qc.invalidateQueries({ queryKey: ['lab-sample', row.activityId] });
    qc.invalidateQueries({ queryKey: ['lab-results', row.activityId] });
    /*
      THE PENDING-TEST LIST TOO — it was missing, and the effect was visible immediately: after
      recording `moisture_pct = 71.4` the screen showed the finished reading AND an empty input
      still asking for `moisture_pct`, as though nothing had been saved. `record_lab_result` moves
      the test to `reported`, so the row is already gone from the server's answer; only the cached
      copy was stale. Invalidated by PREFIX so it does not have to name the sample id.
    */
    qc.invalidateQueries({ queryKey: ['lab-pending-tests'] });
  };

  const take = useMutation({
    mutationFn: async () => {
      if (chosen === null) throw new Error('Choose which checkpoint this sample is being taken at.');
      const sampleId = await openSample({ activityId: row.activityId, checkpointId: chosen });
      // One test per parameter the activity names. `request_lab_test` freezes the spec band now,
      // which is what makes the verdict reproducible later.
      for (const p of row.parameters) await requestTest(sampleId, p);
      return sampleId;
    },
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (e) => setError((e as Error).message),
  });

  const sample = existing.data ?? null;

  return (
    <>
      <PageHeading
        title={row.activityTitle}
        subtitle={`${row.scopeLabel} · ${row.batchCode}`}
        right={
          <button
            type="button"
            onClick={onClose}
            className="rounded border px-4 font-head text-[13px] font-700"
            style={{ minHeight: 48, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
          >
            Back to the queue
          </button>
        }
      />

      {error !== null && (
        <div
          className="mb-4 rounded border px-3 py-2 text-[13px]"
          style={{ borderColor: 'var(--crit)', background: 'var(--crit-soft)', color: 'var(--crit)' }}
        >
          {error}
        </div>
      )}

      {sample === null ? (
        <>
          <h2 className="mb-1 font-head text-[12px] font-700 uppercase tracking-wider text-muted">
            Which checkpoint is this sample from?
          </h2>
          {/*
            C-33, on the face of the screen rather than buried in a register. Both maps are listed
            and neither is preselected — `chosen` starts null and the button below refuses until a
            person picks. That refusal IS the feature.
          */}
          <p className="mb-3 max-w-[60ch] text-[12px] leading-relaxed text-muted">
            Two source maps describe the same moments under different codes, and nothing in the
            sources says which one the factory follows. Pick the one you are actually working to —
            the system will not choose for you, and your choice is recorded with the sample.
          </p>

          {options.isLoading ? (
            <Skeleton label="Loading checkpoints" lines={3} />
          ) : (
            <div className="grid gap-2">
              {(options.data ?? []).map((c) => (
                <CheckpointChoice
                  key={c.id}
                  c={c}
                  selected={chosen === c.id}
                  onSelect={() => setChosen(c.id)}
                />
              ))}
            </div>
          )}

          <button
            type="button"
            disabled={chosen === null || take.isPending}
            onClick={() => take.mutate()}
            className="mt-4 w-full rounded font-head text-[14px] font-800 disabled:opacity-50"
            style={{
              minHeight: 48,
              background: 'var(--accent)',
              color: '#fff',
              border: '1px solid var(--accent)',
            }}
          >
            {take.isPending
              ? 'Recording the sample…'
              : chosen === null
                ? 'Choose a checkpoint first'
                : `Take the sample · request ${row.parameters.length} test${row.parameters.length === 1 ? '' : 's'}`}
          </button>
        </>
      ) : (
        <ReadingList
          sampleId={sample.id}
          results={results.data ?? []}
          loading={results.isLoading}
          onDone={invalidate}
          onError={setError}
        />
      )}
    </>
  );
}

function CheckpointChoice({
  c,
  selected,
  onSelect,
}: {
  c: CheckpointOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="rounded border p-3 text-left"
      style={{
        minHeight: 48,
        borderColor: selected ? 'var(--accent)' : 'var(--line)',
        background: selected ? 'var(--accent-soft)' : 'var(--surface)',
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-head text-[14px] font-700">{c.name}</span>
        <span className="mono text-[10px] text-muted">{c.map}</span>
      </div>
      <p className="mt-0.5 mono text-[11px] text-muted">
        {c.code} · {c.scope} ·{' '}
        {c.relDay !== null ? `Day ${c.relDay}` : 'this map states no day'}
        {c.dayMatches ? ' · matches this activity' : ''}
      </p>
      <p className="mt-1 flex flex-wrap gap-1">
        {c.parameters.map((p) => (
          <span key={p} className="mono rounded px-1 text-[10px]" style={{ background: 'var(--surface-2)' }}>
            {p}
          </span>
        ))}
      </p>
      {/*
        Unmapped means NO SPEC BAND IS FROZEN and every reading on it comes back `no_spec`. A
        technician deserves to know that before choosing, not after recording.
      */}
      {c.specCheckpointCode === null && (
        <p className="mt-1 text-[11px]" style={{ color: 'var(--warn)' }}>
          No spec is mapped to this checkpoint (TBD-36), so readings taken here will have no
          pass/fail band.
        </p>
      )}
      <p className="mt-1 flex flex-wrap items-center gap-1">
        {c.conflictIds.map((id) => (
          <ConflictMarker key={id} id={id} />
        ))}
        <span className="text-[10px] text-muted">{c.sourceRef}</span>
      </p>
    </button>
  );
}

/* ── recording readings ─────────────────────────────────────────────────────────────────────── */

function ReadingList({
  sampleId,
  results,
  loading,
  onDone,
  onError,
}: {
  sampleId: string;
  results: LabResultRow[];
  loading: boolean;
  onDone: () => void;
  onError: (m: string | null) => void;
}) {
  /*
    SCOPED TO THIS SAMPLE. The first version filtered only on state, so it listed every outstanding
    test in the factory — a technician on one activity would have been offered readings belonging to
    a different batch, and `record_lab_result` would have accepted them.
  */
  const pending = useQuery({
    queryKey: ['lab-pending-tests', sampleId],
    queryFn: () => loadPendingTests(sampleId),
  });

  const current = useMemo(() => results.filter((r) => r.isCurrent), [results]);
  const superseded = useMemo(() => results.filter((r) => !r.isCurrent), [results]);

  if (loading) return <Skeleton label="Loading readings" lines={3} />;

  return (
    <>
      <h2 className="mb-2 font-head text-[12px] font-700 uppercase tracking-wider text-muted">
        Readings
      </h2>

      {(pending.data ?? []).map((t) => (
        <ReadingEntry
          key={t.id}
          testId={t.id}
          parameter={t.parameterCode}
          unit={t.unit}
          min={t.min}
          max={t.max}
          specFound={t.specFound}
          onDone={onDone}
          onError={onError}
        />
      ))}

      {current.map((r) => (
        <RecordedReading key={r.resultId} r={r} onDone={onDone} onError={onError} />
      ))}

      {superseded.length > 0 && (
        <>
          <h3 className="mb-1 mt-4 font-head text-[11px] font-700 uppercase tracking-wider text-muted">
            Superseded
          </h3>
          {/*
            `LAB_MODEL §5` — "v1 is never hidden, because we measured it twice is itself a material
            fact." Shown, struck through, with the retest reason on the row that replaced it.
          */}
          {superseded.map((r) => (
            <p key={r.resultId} className="mono text-[11px] text-muted line-through">
              {r.parameterCode} = {r.valueNumeric ?? r.valueText} {r.unit ?? ''} · v{r.version} ·{' '}
              {r.technicianName ?? 'no technician recorded'}
            </p>
          ))}
        </>
      )}

      {(pending.data ?? []).length === 0 && current.length === 0 && (
        <EmptyState
          title="This sample has no tests on it"
          detail="Tests are requested when the sample is taken, one per parameter the activity names. If the activity names none, there is nothing for the lab to measure here."
        />
      )}
    </>
  );
}

function ReadingEntry({
  testId,
  parameter,
  unit,
  min,
  max,
  specFound,
  onDone,
  onError,
}: {
  testId: string;
  parameter: string;
  unit: string | null;
  min: number | null;
  max: number | null;
  specFound: boolean;
  onDone: () => void;
  onError: (m: string | null) => void;
}) {
  const [value, setValue] = useState('');

  const save = useMutation({
    mutationFn: () => {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`${parameter}: enter a number.`);
      return recordResult({ testId, numeric: n });
    },
    onSuccess: () => {
      onError(null);
      setValue('');
      onDone();
    },
    onError: (e) => onError((e as Error).message),
  });

  return (
    <Card className="mb-2 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-head text-[14px] font-700">{parameter}</span>
        {/*
          The band, or the stated absence of one. `spec_found` false means TBD-36 left this
          checkpoint unmapped — the reading will be recorded and its verdict will be `no_spec`.
        */}
        {specFound ? (
          <span className="mono text-[11px] text-muted">
            {min ?? '—'}–{max ?? '—'} {unit ?? ''}
          </span>
        ) : (
          <span className="text-[11px]" style={{ color: 'var(--warn)' }}>
            no spec band
          </span>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={unit ? `value in ${unit}` : 'value'}
          className="flex-1 rounded border px-3 text-[16px]"
          style={{ minHeight: 48, borderColor: 'var(--line-2)', background: 'var(--surface)' }}
        />
        <button
          type="button"
          disabled={value.trim() === '' || save.isPending}
          onClick={() => save.mutate()}
          className="rounded px-4 font-head text-[13px] font-800 disabled:opacity-50"
          style={{ minHeight: 48, background: 'var(--accent)', color: '#fff' }}
        >
          {save.isPending ? 'Saving…' : 'Record'}
        </button>
      </div>
    </Card>
  );
}

function RecordedReading({
  r,
  onDone,
  onError,
}: {
  r: LabResultRow;
  onDone: () => void;
  onError: (m: string | null) => void;
}) {
  const [retesting, setRetesting] = useState(false);
  const [value, setValue] = useState('');
  /*
    WHY the retest happened is a material fact and there is no sensible default for it. The first
    draft passed a literal `'operator_request'`, which is not even a member of `lab_retest_reason` —
    the insert would have been rejected at the type boundary. It is chosen, and it starts empty.
  */
  const [reason, setReason] = useState('');

  const retest = useMutation({
    mutationFn: () => {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error('Enter the new reading.');
      if (reason === '') throw new Error('Say why this is being measured again.');
      return orderRetest({ testId: r.testId, reason, numeric: n });
    },
    onSuccess: () => {
      onError(null);
      setRetesting(false);
      setValue('');
      onDone();
    },
    onError: (e) => onError((e as Error).message),
  });

  const tone =
    r.verdict === 'pass' ? 'var(--ok)' : r.verdict === 'fail' ? 'var(--crit)' : 'var(--muted)';

  return (
    <Card className="mb-2 p-3" rail={tone}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-head text-[14px] font-700">
          {r.parameterCode} = {r.valueNumeric ?? r.valueText} {r.unit ?? ''}
        </span>
        <span className="font-head text-[12px] font-700" style={{ color: tone }}>
          {r.verdict === 'no_spec' ? 'no spec to judge it against' : r.verdict}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted">
        v{r.version} · {r.technicianName ?? 'no technician recorded'} · {r.checkpointCode} (
        {r.checkpointMap}) · calibration {r.calibrationStatus}
      </p>
      {r.specConflictId !== null && (
        <p className="mt-1">
          <ConflictMarker
            id={r.specConflictId}
            note="The sources give more than one spec for this parameter. The reading is recorded as measured and the system did not judge it against either."
          />
        </p>
      )}

      {/*
        A RETEST, NEVER AN EDIT. `record_lab_result` refuses a second result on a test, so there is
        no overwrite path in the API and none offered here. The original stays on the record.
      */}
      {retesting ? (
        <div className="mt-2 flex flex-col gap-2">
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded border px-3 text-[16px]"
            style={{ minHeight: 48, borderColor: 'var(--line-2)', background: 'var(--surface)' }}
          >
            <option value="">Why is it being measured again?</option>
            {RETEST_REASONS.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="new reading"
              className="flex-1 rounded border px-3 text-[16px]"
              style={{ minHeight: 48, borderColor: 'var(--line-2)', background: 'var(--surface)' }}
            />
            <button
              type="button"
              onClick={() => retest.mutate()}
              disabled={retest.isPending || reason === '' || value.trim() === ''}
              className="rounded px-4 font-head text-[13px] font-800 disabled:opacity-50"
              style={{ minHeight: 48, background: 'var(--warn)', color: '#fff' }}
            >
              {retest.isPending ? 'Saving…' : 'Save retest'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setRetesting(true)}
          className="mt-2 rounded border px-3 font-head text-[12px] font-700"
          style={{ minHeight: 44, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
        >
          Measured again? Order a retest
        </button>
      )}
    </Card>
  );
}
