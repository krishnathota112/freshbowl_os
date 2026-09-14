import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  beginSample,
  findOpenSample,
  loadCheckpointOptions,
  loadLabActivity,
  loadResults,
  loadSampleTests,
  orderRetest,
  recordResult,
  type LabActivityContext,
  type LabResultRow,
  type SampleTest,
} from '../../../shared/api/lab';
import { loadEvidenceState } from '../../../shared/api/batch';
import { completeActivity } from '../../../shared/api/work';
import { EvidenceStep, requirementsFrom } from '../components/EvidenceStep';
import { ErrorPanel } from '../../../shared/ui/feedback/ErrorPanel';
import { approverWords, fmtTime, fmtWhen, labStatus, paramLabel } from '../../../shared/utils/labWords';
import { Chip, Skeleton } from '../../../shared/ui/primitives';
import { LateTicketPanel } from '../../../shared/ui/task/LateTicketPanel';

const RETEST_REASONS = [
  { value: 'sampling_error', label: 'The sample was wrong' },
  { value: 'instrument_out_of_calibration', label: 'The instrument was out of calibration' },
  { value: 'post_corrective_action', label: 'Re-measured after a corrective action' },
  { value: 'supervisor_request', label: 'The supervisor asked for it' },
  { value: 'result_implausible', label: 'The reading was not believable' },
];

const OPEN_STATES = ['READY', 'IN_PROGRESS', 'RETURNED'];

export function LabCheckpoint() {
  const { activityId = '' } = useParams();
  const qc = useQueryClient();

  const ctx = useQuery({
    queryKey: ['lab-activity', activityId],
    queryFn: () => loadLabActivity(activityId),
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && d.item.state === 'COMPLETED' && !d.decision ? 30_000 : false;
    },
  });
  const sample = useQuery({ queryKey: ['lab-sample', activityId], queryFn: () => findOpenSample(activityId) });
  const tests = useQuery({
    queryKey: ['lab-sample-tests', sample.data?.id ?? 'none'],
    queryFn: () => loadSampleTests(sample.data!.id),
    enabled: !!sample.data,
  });
  const results = useQuery({ queryKey: ['lab-results', activityId], queryFn: () => loadResults(activityId) });
  const evidence = useQuery({ queryKey: ['evidence-full', activityId], queryFn: () => loadEvidenceState(activityId) });

  const refresh = () => {
    for (const k of ['lab-activity', 'lab-sample', 'lab-sample-tests', 'lab-results', 'evidence-full', 'lab-work']) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  };

  const back = (
    <Link
      to="/lab/queue"
      className="mb-3 inline-flex items-center rounded-md border px-4 font-head text-[14px] font-700 no-underline"
      style={{ minHeight: 48, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
    >
      ← Lab queue
    </Link>
  );

  if (ctx.isLoading) {
    return (
      <>
        {back}
        <Skeleton label="Opening the checkpoint" lines={5} />
      </>
    );
  }
  if (ctx.error || !ctx.data) {
    return (
      <>
        {back}
        <ErrorPanel error={ctx.error} prefix="This checkpoint could not be opened." onRetry={() => ctx.refetch()} />
      </>
    );
  }

  return (
    <>
      {back}
      <Checkpoint
        c={ctx.data}
        sample={sample.data ?? null}
        sampleLoading={sample.isLoading}
        tests={tests.data ?? []}
        results={results.data ?? []}
        evidence={evidence.data ?? []}
        refresh={refresh}
      />
    </>
  );
}

function Checkpoint({
  c,
  sample,
  sampleLoading,
  tests,
  results,
  evidence,
  refresh,
}: {
  c: LabActivityContext;
  sample: { id: string; checkpointId: string; collectedAt: string } | null;
  sampleLoading: boolean;
  tests: SampleTest[];
  results: LabResultRow[];
  evidence: Awaited<ReturnType<typeof loadEvidenceState>>;
  refresh: () => void;
}) {
  const { item } = c;
  const open = OPEN_STATES.includes(item.state);
  const verdict = c.decision?.verdict ?? item.lastSubmission;
  const status = labStatus(item.state, verdict, c.gate?.holdsShut ?? false);

  const [chosen, setChosen] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const needsChoice = c.checkpoints.length !== 1;
  const options = useQuery({
    queryKey: ['lab-checkpoints', item.currentDay],
    queryFn: () => loadCheckpointOptions(item.currentDay),
    enabled: open && !sample && c.checkpoints.length === 0,
  });
  const choices =
    c.checkpoints.length > 1
      ? c.checkpoints.map((x) => ({ id: x.id, name: x.name, detail: `${x.code} · ${x.map}` }))
      : (options.data ?? []).map((x) => ({ id: x.id, name: x.name, detail: `${x.code} · ${x.map}` }));
  const checkpointId = needsChoice ? chosen : c.checkpoints[0].id;
  const sampledAt = sample
    ? c.checkpoints.find((x) => x.id === sample.checkpointId)?.name ?? null
    : null;

  const begin = useMutation({
    mutationFn: () => {
      if (!checkpointId) throw new Error('Choose which checkpoint this sample is taken at.');
      return beginSample({ activityId: item.activityId, checkpointId, parameters: item.parameters, state: item.state });
    },
    onSettled: refresh,
  });

  const submit = useMutation({
    mutationFn: () => completeActivity(item.activityId, {}, null),
    onSuccess: (r) => {
      setNotice(r?.outstanding_evidence ? `Not submitted yet — still needed: ${r.outstanding_evidence}.` : null);
    },
    onSettled: refresh,
  });

  const pending = tests.filter((t) => t.state === 'requested' || t.state === 'in_progress');
  const missingParams = sample ? item.parameters.filter((p) => !tests.some((t) => t.parameterCode === p)) : [];
  const current = useMemo(() => results.filter((r) => r.isCurrent), [results]);
  const superseded = useMemo(() => results.filter((r) => !r.isCurrent), [results]);
  const reqs = requirementsFrom(evidence);
  const photosOutstanding = reqs.filter((r) => r.requirement.satisfiedCount < r.requirement.minCount).length;

  const outstanding: string[] = [];
  if (pending.length > 0) outstanding.push(`${pending.length} reading${pending.length === 1 ? '' : 's'}`);
  if (photosOutstanding > 0) outstanding.push(`${photosOutstanding} photo${photosOutstanding === 1 ? '' : 's'}`);
  const ready = sample !== null && outstanding.length === 0 && missingParams.length === 0;

  return (
    <>
      <header className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-head text-[22px] font-800 leading-tight">{item.activityTitle}</h1>
          <Chip tone={status.tone}>{status.label}</Chip>
        </div>
        <p className="mt-1 text-[14px] text-ink2">
          {item.scopeLabel} · <span className="mono">{item.batchCode}</span>
          {c.processCode && (
            <>
              {' '}
              · <span className="mono">{c.processCode}</span>
            </>
          )}
        </p>
        <p className="mt-0.5 text-[13px] text-muted">
          {c.checkpoints.length === 1 ? `Checkpoint: ${c.checkpoints[0].name}` : 'Checkpoint to be chosen'}
          {item.plannedStartAt && ` · planned ${fmtWhen(item.plannedStartAt)}`}
        </p>
        {item.band === 'retest' && (
          <p className="mt-2 text-[13px]" style={{ color: 'var(--warn)' }}>
            A reading on this checkpoint has been measured again.
          </p>
        )}
      </header>

      <GatePanel c={c} verdict={verdict} />

      <LateTicketPanel
        batchId={item.masterBatchId}
        activityId={item.activityId}
        taskOpen={['READY', 'IN_PROGRESS', 'RETURNED'].includes(item.state)}
      />

      {item.blockedReason && !open && item.state !== 'COMPLETED' && (
        <Panel tone="lock">{item.blockedReason}</Panel>
      )}

      <Step n={1} title="Sample" done={sample !== null}>
        {sampleLoading ? (
          <Skeleton label="Checking for a sample" />
        ) : sample ? (
          <p className="text-[14px] text-ink2">
            Taken at {fmtTime(sample.collectedAt)}
            {sampledAt ? ` · ${sampledAt}` : ''}.
          </p>
        ) : (
          <>
            <p className="text-[14px] text-ink2">
              You will measure: <strong>{item.parameters.map(paramLabel).join(', ') || 'no parameter is named'}</strong>
            </p>
            {open && needsChoice && (
              <div className="mt-3 grid gap-2">
                <p className="text-[13px] text-muted">Which checkpoint is this sample taken at?</p>
                {options.isLoading && <Skeleton label="Loading checkpoints" />}
                {choices.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    aria-pressed={chosen === x.id}
                    onClick={() => setChosen(x.id)}
                    className="rounded-lg border p-3 text-left"
                    style={{
                      minHeight: 52,
                      borderColor: chosen === x.id ? 'var(--accent)' : 'var(--line)',
                      background: chosen === x.id ? 'var(--accent-soft)' : 'var(--surface)',
                    }}
                  >
                    <span className="font-head text-[15px] font-700">{x.name}</span>
                    <span className="mono ml-2 text-[11px] text-muted">{x.detail}</span>
                  </button>
                ))}
              </div>
            )}
            {open && (
              <PrimaryButton
                onClick={() => begin.mutate()}
                disabled={begin.isPending || !checkpointId}
                label={begin.isPending ? 'Recording the sample…' : 'Take the sample'}
              />
            )}
          </>
        )}
        {sample && open && missingParams.length > 0 && (
          <div className="mt-2">
            <p className="text-[13px]" style={{ color: 'var(--warn)' }}>
              {missingParams.map(paramLabel).join(', ')} {missingParams.length === 1 ? 'was' : 'were'} not requested
              — the connection may have dropped.
            </p>
            <SecondaryButton
              onClick={() => begin.mutate()}
              disabled={begin.isPending}
              label={begin.isPending ? 'Requesting…' : 'Request the missing tests'}
            />
          </div>
        )}
        {begin.error && <ErrorPanel error={begin.error} prefix="The sample was not recorded." />}
      </Step>

      <Step n={2} title="Readings" done={sample !== null && pending.length === 0 && missingParams.length === 0} dim={!sample}>
        {!sample ? (
          <p className="text-[14px] text-muted">Take the sample first.</p>
        ) : (
          <div className="grid gap-2">
            {pending.map((t) => (
              <ReadingEntry key={t.id} t={t} enabled={open} onDone={refresh} />
            ))}
            {current.map((r) => (
              <RecordedReading key={r.resultId} r={r} canRetest={open} onDone={refresh} />
            ))}
            {superseded.length > 0 && (
              <div className="mt-1">
                <p className="font-head text-[11px] font-800 uppercase tracking-wider text-muted">Measured before</p>
                {superseded.map((r) => (
                  <p key={r.resultId} className="mono text-[12px] text-muted line-through">
                    {paramLabel(r.parameterCode)} {r.valueNumeric ?? r.valueText} {r.unit ?? ''} · v{r.version}
                  </p>
                ))}
              </div>
            )}
            {pending.length === 0 && current.length === 0 && (
              <p className="text-[14px] text-muted">This sample has no tests on it.</p>
            )}
          </div>
        )}
      </Step>

      <Step n={3} title="Photos" done={reqs.length > 0 && photosOutstanding === 0} dim={!sample}>
        {reqs.length === 0 ? (
          <p className="text-[14px] text-muted">No photograph is required for this checkpoint.</p>
        ) : (
          <div className="grid gap-2">
            {reqs.map(({ requirement, captured }) => (
              <EvidenceStep
                key={requirement.key}
                batchId={item.masterBatchId}
                activityId={item.activityId}
                requirement={requirement}
                captured={captured}
                editable={open && sample !== null}
                onBound={refresh}
              />
            ))}
          </div>
        )}
      </Step>

      {open && sample && (
        <Step n={4} title="Submit" done={false}>
          <p className="text-[14px] text-ink2">
            {ready
              ? c.gate?.holdsShut
                ? `Submitting sends this to ${approverWords(c.approverRoles)} for approval.`
                : 'Everything is recorded.'
              : `Still to do: ${outstanding.join(', ') || 'request the missing tests'}.`}
          </p>
          {ready ? (
            <PrimaryButton
              onClick={() => submit.mutate()}
              disabled={submit.isPending}
              label={submit.isPending ? 'Submitting…' : 'Submit'}
            />
          ) : (
            <SecondaryButton
              onClick={() => submit.mutate()}
              disabled={submit.isPending}
              label={submit.isPending ? 'Submitting…' : 'Submit anyway — the server will say what is missing'}
            />
          )}
          {notice && <Panel tone="warn">{notice}</Panel>}
          {submit.error && <ErrorPanel error={submit.error} prefix="Nothing was submitted." />}
        </Step>
      )}
    </>
  );
}

function GatePanel({ c, verdict }: { c: LabActivityContext; verdict: string | null }) {
  const { item, gate, decision } = c;
  const blocks = gate?.blocksActivity ?? null;
  const open = OPEN_STATES.includes(item.state);

  if (open && verdict === 'rejected' && decision) {
    return (
      <Panel tone="warn">
        <strong>Returned after a rejection.</strong> {decision.reason ? `“${decision.reason}”. ` : ''}Take the
        readings again and submit.
      </Panel>
    );
  }
  if (open) {
    if (gate?.holdsShut && blocks) {
      return (
        <Panel tone="muted">
          <strong>{blocks}</strong> stays locked until this checkpoint is submitted and approved.
        </Panel>
      );
    }
    if (gate && gate.kind === 'DECISION') {
      return <Panel tone="muted">This reading informs a decision. It does not lock other work.</Panel>;
    }
    return null;
  }
  if (item.state !== 'COMPLETED') return null;

  if (verdict === 'approved') {
    return (
      <Panel tone="ok">
        <strong>Approved</strong>
        {decision ? ` by ${decision.decidedRole ?? 'the approver'} · ${fmtWhen(decision.decidedAt)}` : ''}.
        {blocks && gate?.holdsShut ? ` This checkpoint no longer holds ${blocks}.` : ''}
        {decision?.reason ? <span className="mt-1 block text-ink2">“{decision.reason}”</span> : null}
      </Panel>
    );
  }
  if (verdict === 'rejected') {
    return (
      <Panel tone="crit">
        <strong>Rejected</strong>
        {decision ? ` by ${decision.decidedRole ?? 'the approver'} · ${fmtWhen(decision.decidedAt)}` : ''}.
        {decision?.reason ? <span className="mt-1 block">“{decision.reason}”</span> : null}
        <span className="mt-1 block">
          {blocks && gate?.holdsShut ? `${blocks} stays locked. ` : ''}The supervisor decides what happens next — if
          this checkpoint is returned to you, it appears under Continue.
        </span>
      </Panel>
    );
  }
  if (gate?.holdsShut) {
    return (
      <Panel tone="warn">
        <strong>Waiting approval.</strong> Submitted {fmtWhen(item.actualEnd)}. {approverWords(c.approverRoles)}{' '}
        decides next{blocks ? `; until then ${blocks} stays locked` : ''}. You do not need to wait here.
      </Panel>
    );
  }
  return <Panel tone="ok">Completed · {fmtWhen(item.actualEnd)}.</Panel>;
}

function ReadingEntry({ t, enabled, onDone }: { t: SampleTest; enabled: boolean; onDone: () => void }) {
  const [value, setValue] = useState('');
  const save = useMutation({
    mutationFn: () => {
      const n = Number(value.replace(',', '.'));
      if (value.trim() === '' || !Number.isFinite(n)) throw new Error(`${paramLabel(t.parameterCode)}: enter a number.`);
      return recordResult({ testId: t.id, numeric: n });
    },
    onSuccess: () => {
      setValue('');
      onDone();
    },
  });

  return (
    <div className="rounded-lg border bg-surface p-3" style={{ borderColor: 'var(--line)' }}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={`t-${t.id}`} className="font-head text-[15px] font-800">
          {paramLabel(t.parameterCode)}
        </label>
        <span className="mono text-[12px] text-muted">
          {t.specFound ? `range ${t.min ?? '—'}–${t.max ?? '—'} ${t.unit ?? ''}` : 'no range to judge against'}
        </span>
      </div>
      <div className="mt-2 flex gap-2">
        <input
          id={`t-${t.id}`}
          inputMode="decimal"
          value={value}
          disabled={!enabled || save.isPending}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t.unit ? `Value in ${t.unit}` : 'Value'}
          className="mono min-w-0 flex-1 rounded-md border bg-surface px-3 text-[18px]"
          style={{ minHeight: 52, borderColor: 'var(--line-2)', color: 'var(--ink)' }}
        />
        <button
          type="button"
          disabled={!enabled || save.isPending || value.trim() === ''}
          onClick={() => save.mutate()}
          className="shrink-0 rounded-md px-5 font-head text-[15px] font-800 disabled:opacity-50"
          style={{ minHeight: 52, background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          {save.isPending ? 'Saving…' : 'Record'}
        </button>
      </div>
      {save.error && (
        <div className="mt-2">
          <ErrorPanel error={save.error} prefix="The reading was not saved." />
        </div>
      )}
    </div>
  );
}

function RecordedReading({ r, canRetest, onDone }: { r: LabResultRow; canRetest: boolean; onDone: () => void }) {
  const [retesting, setRetesting] = useState(false);
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const retest = useMutation({
    mutationFn: () => {
      const n = Number(value.replace(',', '.'));
      if (value.trim() === '' || !Number.isFinite(n)) throw new Error('Enter the new reading.');
      if (reason === '') throw new Error('Say why this is being measured again.');
      return orderRetest({ testId: r.testId, reason, numeric: n });
    },
    onSuccess: () => {
      setRetesting(false);
      setValue('');
      setReason('');
      onDone();
    },
  });

  const verdict =
    r.verdict === 'pass'
      ? { text: 'Within range', color: 'var(--ok)' }
      : r.verdict === 'fail'
        ? { text: 'Outside range', color: 'var(--crit)' }
        : { text: 'No range to judge against', color: 'var(--muted)' };

  return (
    <div className="rounded-lg border bg-surface p-3" style={{ borderColor: 'var(--line)' }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-head text-[15px] font-800">{paramLabel(r.parameterCode)}</span>
        <span className="font-head text-[13px] font-700" style={{ color: verdict.color }}>
          {verdict.text}
        </span>
      </div>
      <p className="mono mt-1 text-[20px] font-600">
        {r.valueNumeric ?? r.valueText} <span className="text-[14px] text-muted">{r.unit ?? ''}</span>
      </p>
      <p className="mt-0.5 text-[12px] text-muted">
        {r.version > 1 ? `Retest · v${r.version} · ` : ''}
        {fmtTime(r.measuredAt)} · {r.technicianName ?? 'no technician recorded'}
        {r.targetMin !== null || r.targetMax !== null ? ` · range ${r.targetMin ?? '—'}–${r.targetMax ?? '—'}` : ''}
      </p>

      {canRetest &&
        (retesting ? (
          <div className="mt-3 grid gap-2">
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-md border bg-surface px-3 text-[16px]"
              style={{ minHeight: 52, borderColor: 'var(--line-2)' }}
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
                placeholder="New reading"
                className="mono min-w-0 flex-1 rounded-md border bg-surface px-3 text-[18px]"
                style={{ minHeight: 52, borderColor: 'var(--line-2)' }}
              />
              <button
                type="button"
                onClick={() => retest.mutate()}
                disabled={retest.isPending || reason === '' || value.trim() === ''}
                className="shrink-0 rounded-md px-4 font-head text-[15px] font-800 disabled:opacity-50"
                style={{ minHeight: 52, background: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                {retest.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
            <SecondaryButton onClick={() => setRetesting(false)} label="Cancel" />
            {retest.error && <ErrorPanel error={retest.error} prefix="The retest was not saved." />}
            <p className="text-[12px] text-muted">
              The first reading stays on record. A retest never replaces it silently.
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setRetesting(true)}
            className="mt-2 rounded-md border px-3 font-head text-[13px] font-700"
            style={{ minHeight: 44, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
          >
            Measure again
          </button>
        ))}
    </div>
  );
}

function Step({
  n,
  title,
  done,
  dim = false,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  dim?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="mb-5" style={{ opacity: dim ? 0.55 : 1 }}>
      <h2 className="mb-2 flex items-center gap-2 font-head text-[13px] font-800 uppercase tracking-wider">
        <span
          className="mono inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px]"
          style={{
            background: done ? 'var(--ok)' : 'var(--surface-3)',
            color: done ? 'var(--on-accent)' : 'var(--ink-2)',
          }}
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

function Panel({ tone, children }: { tone: 'ok' | 'warn' | 'crit' | 'muted' | 'lock'; children: ReactNode }) {
  const s = {
    ok: { b: 'var(--ok)', bg: 'var(--ok-soft)', c: 'var(--ink)' },
    warn: { b: 'var(--warn)', bg: 'var(--warn-soft)', c: 'var(--ink)' },
    crit: { b: 'var(--crit)', bg: 'var(--crit-soft)', c: 'var(--crit)' },
    muted: { b: 'var(--line-2)', bg: 'var(--surface-2)', c: 'var(--ink-2)' },
    lock: { b: 'var(--line-2)', bg: 'var(--lock-soft)', c: 'var(--ink-2)' },
  }[tone];
  return (
    <div
      className="mb-4 rounded-lg border px-4 py-3 text-[14px] leading-relaxed"
      style={{ borderColor: s.b, background: s.bg, color: s.c }}
    >
      {children}
    </div>
  );
}

function PrimaryButton({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-3 w-full rounded-lg font-head text-[16px] font-800 disabled:opacity-50"
      style={{ minHeight: 56, background: 'var(--accent)', color: 'var(--on-accent)' }}
    >
      {label}
    </button>
  );
}

function SecondaryButton({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-2 w-full rounded-lg border font-head text-[14px] font-700 disabled:opacity-50"
      style={{ minHeight: 48, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
    >
      {label}
    </button>
  );
}

export default LabCheckpoint;
