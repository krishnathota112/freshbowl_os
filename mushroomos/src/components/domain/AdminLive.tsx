import { Link } from 'react-router-dom';

import { Card, Chip, EmptyState, Skeleton } from '../primitives';

/*
 * THE PROPS ARE DECLARED HERE, NOT IMPORTED FROM `api/`.
 *
 * A10 in `uiFoundations.test.ts` forbids an L1–L3 component from importing `api/` AT ALL — a
 * `type`-only import still counts, and the suite failed on exactly that. The rule is not about
 * runtime weight; it is that a component must not know which view its data came from. These are
 * structural shapes: whatever the route hands over must have these fields, and the compiler checks
 * that at the call site.
 */
type BatchContext = {
  master_batch_id: string;
  code: string;
  status: string;
  process_code: string;
  h0: string | null;
  standard_hr: number | null;
  planned_end_at: string | null;
  approved_extension_hr: number | null;
  authorised_end_at: string | null;
  slip_minutes: number | null;
  measured_count: number;
  finished_count: number;
  activity_count: number;
  projected_end_at: string | null;
  forecast_basis: string;
  forecast_unknown_reason: string | null;
};

type LabApprovalRow = {
  activity_id: string;
  batch_code: string;
  activity_title: string;
  checkpoint_code: string;
  gates_activity_code: string | null;
  gates_activity_title: string | null;
  is_gate: boolean;
  is_approved: boolean;
  awaiting_decision: boolean;
  result_count: number;
};

/**
 * The two panels Admin was missing. PRESENTATIONAL ONLY — they take props and fetch nothing.
 *
 * `uiFoundations.test.ts` A10 enforces that: an L1–L3 component may not import `api/` or hold a
 * query, because only a route (L4) is allowed to know where data comes from. The suite caught two
 * versions of this file — one that called `useQuery` itself, and one that still imported its prop
 * types from `api/`. A `type`-only import counts, and it should: the rule is about a component not
 * knowing which view its data came from.
 *
 * WHAT THESE REPLACE
 *   A reference implementation of this screen rendered both as literal arrays — `value="2"`,
 *   `value="4"`, a hardcoded gate list, a hardcoded process rail. It looked exactly like this and
 *   knew nothing.
 *
 * FOUR NUMBERS, NEVER COLLAPSED
 *   PROCESS · STANDARD · H0 · BASELINE are shown separately, and the projection is shown apart from
 *   all four with its basis named. There is no constant here and no arithmetic on days —
 *   `standard_hr` is what the batch's own process version computes, 470 for PROCESS-2026C and 536
 *   for PROCESS-2026B. `baseline_hours` would read 480 and 552; it is not used.
 */
export function LiveBatches({
  batches,
  loading,
}: {
  batches: BatchContext[] | undefined;
  loading: boolean;
}) {
  if (loading) return <Skeleton label="Loading batches" lines={3} />;

  const rows = (batches ?? []).filter((b) => b.status === 'active');
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No batch is live."
        detail="A batch appears here once it is activated. Until then its plan is still editable."
      />
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((b) => (
        <BatchRow key={b.master_batch_id} b={b} />
      ))}
    </div>
  );
}

function BatchRow({ b }: { b: BatchContext }) {
  /*
   * `forecast_basis` on `v_batch_forecast` is NOT the same vocabulary as `v_activity_forecast`'s.
   * It yields `projected`, `unknown`, or `no measurement yet` — the last being the common case on a
   * young batch. So the test is "did it actually project?", never a match on 'unknown'.
   */
  const projected = b.forecast_basis === 'projected';
  const late = (b.slip_minutes ?? 0) > 0;

  return (
    <Card className="p-4" rail={late ? 'var(--warn)' : 'var(--accent)'}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link
          to={`/batch/${b.master_batch_id}`}
          className="font-head text-base font-extrabold text-ink"
        >
          {b.code}
        </Link>
        <Chip tone={late ? 'warn' : 'ok'}>
          {b.finished_count}/{b.activity_count} done
        </Chip>
      </div>

      <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Cell label="Process" value={b.process_code} />
        <Cell
          label="Standard"
          value={b.standard_hr != null ? `H${b.standard_hr}` : '—'}
          hint="from its own process"
        />
        <Cell label="H0" value={fmt(b.h0)} />
        <Cell label="Baseline end" value={fmt(b.planned_end_at)} />
      </dl>

      <dl className="mt-2 pt-2 border-t border-line grid grid-cols-2 sm:grid-cols-3 gap-2">
        {b.approved_extension_hr ? (
          <Cell
            label="Authorised end"
            value={fmt(b.authorised_end_at)}
            hint={`+${b.approved_extension_hr} h approved`}
            tone="warn"
          />
        ) : (
          <Cell label="Authorised end" value="—" hint="no extension approved" />
        )}
        <Cell
          label="Projected end"
          value={projected ? fmt(b.projected_end_at) : '—'}
          hint={projected ? 'from measured slip' : (b.forecast_unknown_reason ?? b.forecast_basis)}
        />
        <Cell
          label="Worst slip"
          value={b.slip_minutes != null ? mins(b.slip_minutes) : '—'}
          tone={late ? 'warn' : undefined}
          hint={`${b.measured_count} measured`}
        />
      </dl>
    </Card>
  );
}

/**
 * What is holding production shut right now, and the one link that can release it.
 *
 * `decide_lab_submission` had no caller anywhere in the product before this session. A panel that
 * merely counted gates would have been pointing at a door with no handle.
 */
export function LabGateBoard({
  approvals,
  loading,
}: {
  approvals: LabApprovalRow[] | undefined;
  loading: boolean;
}) {
  if (loading) return <Skeleton label="Loading gates" lines={2} />;

  const rows = approvals ?? [];
  const holding = rows.filter((r) => r.awaiting_decision && r.is_gate);
  const released = rows.filter((r) => r.is_approved && r.is_gate);

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No lab checkpoint is bound on a live batch."
        detail="PROCESS-2026C binds four gating checkpoints. They appear once a batch generated from it reaches them."
      />
    );
  }

  return (
    <div className="space-y-2">
      {holding.length === 0 ? (
        <Card className="p-3" rail="var(--ok)">
          <p className="text-[13px] text-ink">
            No submission is holding a gate. {released.length} released.
          </p>
        </Card>
      ) : (
        holding.map((r) => (
          <Card key={r.activity_id} className="p-3" rail="var(--danger)">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-mono text-[11px] text-muted">
                {r.batch_code} · {r.checkpoint_code}
              </span>
              <Link to="/lab/approvals" className="text-[11px] font-bold text-accent">
                Decide →
              </Link>
            </div>
            <p className="text-[13px] text-ink mt-0.5">
              Holds <strong>{r.gates_activity_title ?? r.gates_activity_code}</strong>
            </p>
            <p className="text-[11px] text-muted">
              {r.activity_title} finished with {r.result_count}{' '}
              {r.result_count === 1 ? 'reading' : 'readings'} and no decision. Submission is not
              approval.
            </p>
          </Card>
        ))
      )}
    </div>
  );
}

function Cell({
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
      <dd className={`font-mono text-[13px] font-bold ${tone === 'warn' ? 'text-warn' : 'text-ink'}`}>
        {value}
      </dd>
      {hint && <p className="text-[10px] text-muted leading-tight">{hint}</p>}
    </div>
  );
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function mins(m: number): string {
  const sign = m > 0 ? '+' : m < 0 ? '−' : '';
  const a = Math.abs(m);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}
