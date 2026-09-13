import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { releaseElapsedRests, startActivity } from '../api/batch';
import {
  getBatchContext,
  listMyWork,
  STATE_LABEL,
  workGroupOf,
  type MyWorkRow,
} from '../api/work';
import { PageHeading } from '../components/layout/PageHeading';
import { Card, EmptyState, Skeleton } from '../components/primitives';
import { TaskDrawer } from './TaskDrawer';
import { humanError, type HumanError } from '../lib/humanError';
import { useAuth } from '../lib/auth';

/**
 * Phase 1 · Operator "My Work".
 *
 * WHAT CHANGED, AND WHY
 *   This screen used to select from `batch_activity` and then decide, in TypeScript, which task was
 *   current — four fallbacks over `baseline_start_hour`, a `currentBatchHour` derived from the
 *   device clock, and `baselineHours = (maxDay + 1) * 24`, the day grid CLAUDE.md forbids. It read
 *   480 against a 470-hour standard, and it held an opinion about eligibility that the database did
 *   not share.
 *
 *   It now reads `v_my_work` and renders what it is given. `state`, `blocked_reason`,
 *   `variance_minutes`, `outstanding_labels`, `satisfied_total` and `required_count` all arrive
 *   decided. The only thing computed here is which HEADING a card sits under, and that is layout,
 *   not eligibility — whether work may actually start is settled by the server when
 *   `start_activity` is called.
 *
 * FOUR NUMBERS, NEVER COLLAPSED
 *   PROCESS · STANDARD · H0 · BASELINE come from `v_batch_forecast`, which derives the standard from
 *   the process the batch was generated from. There is no constant in this file, and no arithmetic
 *   on days.
 *
 * NO TIMESTAMP INPUT
 *   The operator starts and finishes. The server stamps both. There is deliberately no field on this
 *   screen that accepts an official time.
 */
export function MyWork() {
  const qc = useQueryClient();
  const { role } = useAuth();
  const [open, setOpen] = useState<{ id: string; batchStatus: string } | null>(null);
  const [waitingOpen, setWaitingOpen] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [startError, setStartError] = useState<HumanError | null>(null);

  const work = useQuery({
    queryKey: ['my-work'],
    queryFn: listMyWork,
    refetchOnWindowFocus: true,
  });

  const rows = useMemo(() => work.data ?? [], [work.data]);

  /**
   * THE HEADER DESCRIBES THE BATCH OF THE WORK IN FRONT OF YOU.
   *
   * It used to take `rows[0]`, which on a real account was wrong the moment an operator had work on
   * more than one batch: the hero read "CURRENT BATCH ASSIGNMENT · MB-2026-366-368" above a list of
   * MB-DEMO-LATE tasks. Seen immediately on the running app, invisible in every test.
   *
   * It now follows the CURRENT card — what is running, else what is ready first — and says plainly
   * when the rest of the list belongs to other batches. Each card already names its own batch, so
   * nothing is hidden; what changes is that the header no longer makes a claim about all of them.
   */
  const runningFirst = rows.find((r) => workGroupOf(r.state) === 'running')
    ?? rows.find((r) => workGroupOf(r.state) === 'ready')
    ?? rows[0];
  const batchId = runningFirst?.master_batch_id ?? null;
  const otherBatches = new Set(
    rows.filter((r) => r.master_batch_id !== batchId).map((r) => r.batch_code)
  );

  const context = useQuery({
    queryKey: ['batch-context', batchId],
    queryFn: () => getBatchContext(batchId as string),
    enabled: Boolean(batchId),
  });

  /**
   * A rest whose wait has genuinely elapsed does not open itself, so somebody has to ask.
   *
   * ONLY A ROLE THAT MAY ASK, ASKS. `release_elapsed_rests` is supervisor / admin / gm. An earlier
   * version polled it for every batch every 15 seconds whatever the caller's role, and swallowed
   * the refusal — which on a real operator account meant seven refused calls a minute, forever.
   * Ninety-four `403`s were sitting in the console of the running app.
   *
   * A refusal that the code already knows is coming is not error handling; it is a request that
   * should never have been made.
   */
  const mayReleaseRests = role === 'supervisor' || role === 'admin' || role === 'gm';
  const batchIds = useMemo(
    () => (mayReleaseRests ? [...new Set(rows.map((r) => r.master_batch_id))] : []),
    [rows, mayReleaseRests]
  );

  useEffect(() => {
    if (batchIds.length === 0) return;
    let cancelled = false;
    const ask = async () => {
      const results = await Promise.allSettled(batchIds.map((b) => releaseElapsedRests(b)));
      if (!cancelled && results.some((r) => r.status === 'fulfilled')) {
        qc.invalidateQueries({ queryKey: ['my-work'] });
      }
    };
    ask();
    const t = setInterval(ask, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [batchIds, qc]);

  if (work.isLoading) {
    return (
      <div className="space-y-4">
        <PageHeading title="My Work" subtitle="Loading current assignment…" />
        <Skeleton label="Loading task cards" lines={4} />
      </div>
    );
  }

  if (work.isError) {
    return (
      <>
        <PageHeading title="My Work" subtitle="One task at a time" />
        <EmptyState
          title={humanError(work.error).title}
          detail={humanError(work.error).detail}
        />
      </>
    );
  }

  if (rows.length === 0) {
    return (
      <>
        <PageHeading title="My Work" subtitle="One task at a time" />
        <EmptyState
          title="No work assigned to you right now"
          detail="Tasks appear here when an active batch reaches one that is yours. If you expect work, ask your supervisor who it is assigned to."
        />
      </>
    );
  }

  const running = rows.filter((r) => workGroupOf(r.state) === 'running');
  const ready = rows.filter((r) => workGroupOf(r.state) === 'ready');
  const waiting = rows.filter((r) => workGroupOf(r.state) === 'waiting');
  const done = rows.filter((r) => workGroupOf(r.state) === 'done');

  /**
   * The cards that get the large treatment: everything running, else what is ready first.
   *
   * A LIST, NOT ONE ROW. This was `running[0]`, which assumed an operator has at most one task in
   * progress. That is false here. A person works several overlapping batches, and starting work on
   * batch B while batch A is still running is ordinary, not an error — the server allows it and
   * stamps both. But a second running row belonged to no section: it is not `ready`, not `waiting`
   * and not `done`, so nothing rendered it. The task disappeared from the operator's screen while
   * remaining IN_PROGRESS on the server, with no card left to open and therefore no way to finish
   * it. Found on the emulator with two batches running at once; invisible to every script, because
   * scripts finish one activity before starting the next.
   */
  const current = running.length > 0 ? running : ready[0] ? [ready[0]] : [];
  const currentIds = new Set(current.map((r) => r.activity_id));
  const upNext = rows.find((r) => !currentIds.has(r.activity_id) && workGroupOf(r.state) === 'ready')
    ?? waiting[0]
    ?? null;

  const handleStart = async (row: MyWorkRow) => {
    setStarting(row.activity_id);
    setStartError(null);
    try {
      await startActivity(row.activity_id);
      qc.invalidateQueries({ queryKey: ['my-work'] });
    } catch (e) {
      // The refusal names what to do instead. Show it; never replace it with "Something went wrong".
      setStartError(humanError(e));
    } finally {
      setStarting(null);
    }
  };

  return (
    <div className="pb-20 max-w-3xl mx-auto space-y-5">
      <BatchHeader
        context={context.data ?? null}
        batchCode={runningFirst.batch_code}
        otherBatches={[...otherBatches]}
      />

      {startError && (
        <Card className="p-4 border-danger/40" rail="var(--danger)">
          <span className="text-[10px] font-bold uppercase tracking-widest text-danger">
            Refused by the server
          </span>
          <p className="mt-1 text-sm font-bold text-ink">{startError.title}</p>
          {startError.detail && <p className="mt-0.5 text-[12px] text-ink-2">{startError.detail}</p>}
        </Card>
      )}

      <section className="space-y-2">
        <GroupHeading tone="accent" pulse>
          Current work (now)
        </GroupHeading>
        {current.length > 0 ? (
          current.map((r) => (
            <TaskCard
              key={r.activity_id}
              row={r}
              prominent
              busy={starting === r.activity_id}
              onStart={() => handleStart(r)}
              onOpen={() => setOpen({ id: r.activity_id, batchStatus: 'active' })}
            />
          ))
        ) : (
          <EmptyState
            title="Nothing to start yet"
            detail="Everything assigned to you is waiting on something else. The reason is on each card below."
          />
        )}
      </section>

      {upNext && (
        <section className="space-y-2">
          <GroupHeading>Up next</GroupHeading>
          <TaskCard
            row={upNext}
            busy={starting === upNext.activity_id}
            onStart={() => handleStart(upNext)}
            onOpen={() => setOpen({ id: upNext.activity_id, batchStatus: 'active' })}
          />
        </section>
      )}

      {ready.some((r) => !currentIds.has(r.activity_id) && r.activity_id !== upNext?.activity_id) && (
        <section className="space-y-2">
          <GroupHeading>Ready now</GroupHeading>
          {ready
            .filter((r) => !currentIds.has(r.activity_id) && r.activity_id !== upNext?.activity_id)
            .map((r) => (
              <TaskCard
                key={r.activity_id}
                row={r}
                busy={starting === r.activity_id}
                onStart={() => handleStart(r)}
                onOpen={() => setOpen({ id: r.activity_id, batchStatus: 'active' })}
              />
            ))}
        </section>
      )}

      <CollapsibleGroup
        title="Waiting"
        count={waiting.length}
        open={waitingOpen}
        onToggle={() => setWaitingOpen(!waitingOpen)}
      >
        {waiting.map((r) => (
          <TaskCard
            key={r.activity_id}
            row={r}
            onOpen={() => setOpen({ id: r.activity_id, batchStatus: 'active' })}
          />
        ))}
      </CollapsibleGroup>

      <CollapsibleGroup
        title="Completed"
        count={done.length}
        open={completedOpen}
        onToggle={() => setCompletedOpen(!completedOpen)}
      >
        {done.map((r) => (
          <TaskCard
            key={r.activity_id}
            row={r}
            onOpen={() => setOpen({ id: r.activity_id, batchStatus: 'active' })}
          />
        ))}
      </CollapsibleGroup>

      {open && (
        <TaskDrawer
          activityId={open.id}
          batchStatus={open.batchStatus}
          onClose={() => setOpen(null)}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ['my-work'] });
            qc.invalidateQueries({ queryKey: ['batch-context', batchId] });
          }}
        />
      )}
    </div>
  );
}

/**
 * PROCESS · STANDARD · H0 · BASELINE, and after work starts, AUTHORISED and PROJECTED.
 *
 * Six separate numbers on purpose. The projection never folds in the approved extension, and the
 * basis is always named, so nobody reads a guess as a commitment.
 */
function BatchHeader({
  context,
  batchCode,
  otherBatches,
}: {
  context: BatchContextRow | null;
  batchCode: string;
  otherBatches: string[];
}) {
  return (
    <div className="bg-surface rounded-2xl p-5 shadow-card border border-line">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
            Current batch assignment
          </span>
          <h1 className="font-head text-xl font-extrabold text-ink">{context?.code ?? batchCode}</h1>
        </div>
        {context?.status === 'active' && (
          <div className="flex items-center gap-1.5 bg-green-100 text-green-700 px-3 py-1 rounded-full text-[11px] font-bold shadow-sm">
            <span className="w-2 h-2 rounded-full bg-green-700 pulse-dot" /> SHIFT ACTIVE
          </div>
        )}
      </div>

      {otherBatches.length > 0 && (
        <p className="pt-2 text-[11px] text-muted">
          You also have work on {otherBatches.join(', ')}. Every card names its own batch.
        </p>
      )}

      <dl className="pt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Figure label="Process" value={context?.process_code ?? '—'} />
        <Figure
          label="Standard"
          value={context?.standard_hr != null ? `H${context.standard_hr}` : '—'}
          hint="calculated by the process"
        />
        <Figure label="H0" value={formatInstant(context?.h0)} />
        <Figure label="Baseline end" value={formatInstant(context?.planned_end_at)} />
      </dl>

      {context && (context.approved_extension_hr || context.projected_end_at) && (
        <dl className="mt-3 pt-3 border-t border-line grid grid-cols-2 sm:grid-cols-3 gap-3">
          {context.approved_extension_hr ? (
            <>
              <Figure
                label="Approved extension"
                value={`+${context.approved_extension_hr} h`}
                tone="warn"
              />
              <Figure label="Authorised end" value={formatInstant(context.authorised_end_at)} tone="warn" />
            </>
          ) : null}
          <Figure
            label="Projected end"
            value={formatInstant(context.projected_end_at)}
            /*
             * `v_batch_forecast.forecast_basis` is NOT the same vocabulary as
             * `v_activity_forecast`'s. It yields `projected`, `unknown`, or `no measurement yet` —
             * that last one being the common case on a young batch, and the one a screen forgets.
             * So the test is "did it actually project?", not "is it the string 'unknown'?".
             */
            hint={
              context.forecast_basis === 'projected'
                ? 'projected from measured slip'
                : context.forecast_unknown_reason ?? context.forecast_basis
            }
          />
        </dl>
      )}
    </div>
  );
}

type BatchContextRow = Awaited<ReturnType<typeof getBatchContext>>;

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'warn';
}) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</dt>
      <dd
        className={`font-head text-base font-extrabold ${tone === 'warn' ? 'text-warn' : 'text-ink'}`}
      >
        {value}
      </dd>
      {hint && <p className="text-[10px] text-muted">{hint}</p>}
    </div>
  );
}

function GroupHeading({
  children,
  tone,
  pulse,
}: {
  children: React.ReactNode;
  tone?: 'accent';
  pulse?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-1">
      <h2
        className={`text-[12px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 ${
          tone === 'accent' ? 'text-accent' : 'text-ink-2'
        }`}
      >
        {pulse && <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />}
        {children}
      </h2>
    </div>
  );
}

function CollapsibleGroup({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="space-y-2">
      <button
        className="w-full flex items-center justify-between px-1 py-1 text-left"
        onClick={onToggle}
        aria-expanded={open}
      >
        <h2 className="text-[12px] font-mono font-bold uppercase tracking-wider text-ink-2">
          {title}
        </h2>
        <span className="text-[11px] text-muted">
          {count} {count === 1 ? 'task' : 'tasks'} {open ? '▲' : '▼'}
        </span>
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </section>
  );
}

/**
 * One row of `v_my_work`.
 *
 * Everything shown is given: the state label, the blocked reason, the outstanding evidence, the
 * variance. The card computes nothing about whether the work may proceed — it offers the button and
 * lets the server answer.
 */
function TaskCard({
  row,
  prominent,
  busy,
  onStart,
  onOpen,
}: {
  row: MyWorkRow;
  prominent?: boolean;
  busy?: boolean;
  onStart?: () => void;
  onOpen: () => void;
}) {
  const group = workGroupOf(row.state);
  const evidenceShort =
    row.required_count != null &&
    row.satisfied_total != null &&
    row.satisfied_total < row.required_count;

  return (
    <Card
      className={prominent ? 'p-5' : 'p-4'}
      rail={
        group === 'running'
          ? 'var(--accent)'
          : group === 'waiting'
            ? 'var(--muted)'
            : group === 'done'
              ? 'var(--ok)'
              : undefined
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StateTag state={row.state} isHold={row.is_hold} />
          </div>
          <h3
            className={`mt-1.5 font-head font-extrabold text-ink ${prominent ? 'text-lg' : 'text-base'}`}
          >
            {row.title}
            {row.scope_label && <span className="text-muted font-normal"> · {row.scope_label}</span>}
          </h3>
          <p className="font-mono text-[11px] text-muted">
            {row.batch_code} · {row.code}
            {row.stream && ` · ${row.stream}`}
          </p>
        </div>
        {row.variance_minutes != null && row.variance_minutes !== 0 && (
          <div className="text-right shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
              Variance
            </span>
            <p
              className={`font-mono text-sm font-bold ${row.variance_minutes > 0 ? 'text-warn' : 'text-ok'}`}
            >
              {formatVariance(row.variance_minutes)}
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-2">
        <span>
          Planned <strong className="font-mono">{formatWindow(row.planned_start_at, row.planned_end_at)}</strong>
        </span>
        {row.actual_start && (
          <span>
            Started <strong className="font-mono">{formatInstant(row.actual_start)}</strong>
          </span>
        )}
        {row.actual_end && (
          <span>
            Finished <strong className="font-mono">{formatInstant(row.actual_end)}</strong>
          </span>
        )}
        {row.required_count ? (
          <span className={evidenceShort ? 'text-warn font-bold' : ''}>
            Evidence{' '}
            <strong className="font-mono">
              {row.satisfied_total ?? 0}/{row.required_count}
            </strong>
          </span>
        ) : null}
      </div>

      {/*
        The reason comes from the server, already written as a sentence — but only shown while the
        activity is ACTUALLY shut. `blocked_reason` is a stored column that survives the transition
        out of LOCKED, so a running task was rendering "IN PROGRESS" and "WHY THIS IS LOCKED"
        together. Seen on the first real screen; no test looked.
      */}
      {row.blocked_reason && group === 'waiting' && (
        <div className="mt-3 rounded-lg bg-surface-2 border border-line px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
            Why this is locked
          </span>
          <p className="text-[12px] text-ink mt-0.5">{row.blocked_reason}</p>
        </div>
      )}

      {row.outstanding_labels && (
        <div className="mt-2 rounded-lg bg-warn/10 border border-warn/30 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-warn">
            Still needed before this can finish
          </span>
          <p className="text-[12px] text-ink mt-0.5">{row.outstanding_labels}</p>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        {group === 'ready' && onStart && !row.is_hold && (
          <button
            className="flex-1 rounded-xl bg-accent text-white font-bold py-3 text-sm disabled:opacity-60"
            onClick={onStart}
            disabled={busy}
          >
            {busy ? 'Starting…' : 'Start task'}
          </button>
        )}
        <button
          className={`rounded-xl border border-line font-bold py-3 text-sm px-4 ${
            group === 'ready' && onStart ? '' : 'flex-1'
          }`}
          onClick={onOpen}
        >
          {group === 'running' ? 'Continue task' : group === 'done' ? 'View record' : 'Open'}
        </button>
      </div>

      {/* A hold is never started by anybody, so the line about starting does not belong on it. */}
      {group === 'ready' && !row.is_hold && (
        <p className="mt-2 text-[10px] text-muted">
          Starting records the official time. You do not enter it.
        </p>
      )}
    </Card>
  );
}

function StateTag({ state, isHold }: { state: string; isHold?: boolean }) {
  /*
   * A HOLD IS NOT READY. `is_hold` rows are material resting — nobody performs them — and the
   * screen was tagging them "Ready now" beside the line saying nobody performs this. A hold has
   * its own state and should read as one.
   */
  if (isHold) {
    return (
      <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full bg-surface-2 text-muted">
        Resting — nobody performs this
      </span>
    );
  }
  const group = workGroupOf(state);
  const cls =
    group === 'running'
      ? 'bg-accent/15 text-accent'
      : group === 'ready'
        ? 'bg-ok/15 text-ok'
        : group === 'done'
          ? 'bg-surface-2 text-muted'
          : 'bg-warn/15 text-warn';
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full ${cls}`}>
      {STATE_LABEL[state] ?? state}
    </span>
  );
}

/** `+01:18` / `−00:12`. A minute count is not a duration a person reads at arm's length. */
function formatVariance(minutes: number): string {
  const sign = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

function formatInstant(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatWindow(start: string | null, end: string | null): string {
  if (!start && !end) return '—';
  const t = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
  return `${t(start)} → ${t(end)}`;
}
