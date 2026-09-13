import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  decideLabSubmission,
  loadApprovalQuestion,
  loadLabApprovals,
  loadResults,
  type LabApprovalRow,
} from '../api/lab';
import { loadEvidenceState } from '../api/batch';
import { PageHeading } from '../components/layout/PageHeading';
import { Card, Chip, EmptyState, Skeleton } from '../components/primitives';
import { humanError } from '../lib/humanError';
import { useAuth } from '../lib/auth';

/**
 * The decision that opens a gate.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS SCREEN EXISTS
 *
 * `decide_lab_submission` is the only thing that opens a `LAB_APPROVED` gate, and PROCESS-2026C
 * holds eight production activities behind four checkpoints. Measured on 2026-09-08, before this
 * file: **zero references to it in the entire frontend, and zero rows in `lab_decision`.** A gate
 * could be opened by the test suite and never by a person using the product. The eight held
 * activities would have stayed held forever.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * SUBMISSION IS NOT APPROVAL
 *
 * A lab technician records a reading and completes the activity. Every gate stays shut. That is not
 * a delay to be smoothed over — it is the separation the gate exists to create, and this screen
 * states it rather than hiding it behind a spinner.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * C-32 IS OPEN, AND THIS SCREEN SAYS SO
 *
 * `lab_approval_reading` holds two readings — the GM approves every submission, or the Supervisor
 * accepts lab work — and NEITHER IS ENABLED. While that is true the server accepts a decision from
 * either role and refuses everyone else. The screen reads `approver_roles` from the view instead of
 * hardcoding "GM", so the day the factory answers C-32 the narrowing happens in data, with no code
 * change. Both readings and the consequence each carries are shown on the page, because the person
 * approving is the person best placed to notice the question has never been settled.
 *
 * A LAB TECHNICIAN CAN NEVER DECIDE, including their own submission. That is enforced in
 * `decide_lab_submission`; the screen does not offer it, and the server would refuse it anyway.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export function LabApprovals() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [openRow, setOpenRow] = useState<LabApprovalRow | null>(null);

  const q = useQuery({
    queryKey: ['lab-approvals'],
    queryFn: loadLabApprovals,
    refetchInterval: 60_000,
  });
  const question = useQuery({ queryKey: ['lab-approval-question'], queryFn: loadApprovalQuestion });

  if (q.isLoading) {
    return (
      <>
        <PageHeading title="Lab approvals" subtitle="What a decision will unlock" />
        <Skeleton label="Loading submissions" lines={4} />
      </>
    );
  }

  if (q.error) {
    const e = humanError(q.error);
    return (
      <>
        <PageHeading title="Lab approvals" />
        <EmptyState title={e.title} detail={e.detail} />
      </>
    );
  }

  const rows = q.data ?? [];
  const waiting = rows.filter((r) => r.awaiting_decision);
  const gating = waiting.filter((r) => r.is_gate);
  const notGating = waiting.filter((r) => !r.is_gate);
  const decided = rows.filter((r) => r.latest_verdict !== null);

  const approverRoles = rows[0]?.approver_roles ?? [];
  const mayDecide = role !== null && approverRoles.includes(role);

  if (openRow) {
    return (
      <DecisionSheet
        row={openRow}
        mayDecide={mayDecide}
        onClose={() => setOpenRow(null)}
        onDecided={() => {
          qc.invalidateQueries({ queryKey: ['lab-approvals'] });
          qc.invalidateQueries({ queryKey: ['lab-queue'] });
          qc.invalidateQueries({ queryKey: ['my-work'] });
          setOpenRow(null);
        }}
      />
    );
  }

  return (
    <>
      <PageHeading
        title="Lab approvals"
        subtitle="A submission is not an approval. Production stays shut until somebody decides."
        right={<Chip tone={gating.length > 0 ? 'warn' : 'ok'}>{gating.length}</Chip>}
      />

      {!mayDecide && (
        <Card className="p-4 mb-3" rail="var(--muted)">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
            You are not one of the deciding roles
          </span>
          <p className="mt-1 text-[13px] text-ink">
            A lab submission is decided by{' '}
            <strong>{approverRoles.join(' or ') || 'a role the server names'}</strong>. You can read
            this queue; the server will refuse a decision from{' '}
            <strong>{role ?? 'a session with no role'}</strong>, and from anyone who recorded or
            submitted the package themselves.
          </p>
        </Card>
      )}

      <Band title="Holding production shut" tone="crit" count={gating.length}>
        {gating.length === 0 ? (
          <EmptyState
            title="No submission is holding a gate."
            detail="A row appears here when a lab activity bound to a gating checkpoint is finished and undecided."
          />
        ) : (
          gating.map((r) => (
            <ApprovalRow key={r.activity_id} row={r} onOpen={() => setOpenRow(r)} />
          ))
        )}
      </Band>

      {notGating.length > 0 && (
        <Band title="Awaiting a decision — holds nothing" tone="warn" count={notGating.length}>
          {/*
            A checkpoint that gates nothing still gets decided; it just does not stop production.
            LAB-MOIST-DEC lives here permanently: it is a DECISION, not a GATE, because the
            67–68 % moisture band is UNRESOLVED and no gate may be built on it.
          */}
          {notGating.map((r) => (
            <ApprovalRow key={r.activity_id} row={r} onOpen={() => setOpenRow(r)} />
          ))}
        </Band>
      )}

      {decided.length > 0 && (
        <Band title="Decided" tone="ok" count={decided.length}>
          {decided.slice(0, 20).map((r) => (
            <ApprovalRow key={r.activity_id} row={r} onOpen={() => setOpenRow(r)} muted />
          ))}
        </Band>
      )}

      {question.data && question.data.some((x) => x.still_open) && (
        <OpenQuestion readings={question.data} />
      )}
    </>
  );
}

/**
 * THE SIX STATES, and the three lines between them that this screen exists to draw.
 *
 *     RESULT ENTERED   ≠   APPROVED   ≠   GATE OPEN
 *
 * Every one is derived from what the backend returned. Nothing here is hardcoded: the activity's
 * own `activity_state`, the standing `latest_verdict`, and the held activity's `gates_activity_state`
 * are three separate facts and this function keeps them separate.
 */
export type ApprovalState =
  | 'SUBMITTED'
  | 'WAITING APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'GATE OPEN'
  | 'GATE CLOSED';

function approvalState(r: LabApprovalRow): ApprovalState {
  if (r.latest_verdict === 'rejected') return 'REJECTED';
  if (r.latest_verdict === 'approved') return 'APPROVED';
  if (r.activity_state === 'COMPLETED') return 'WAITING APPROVAL';
  return 'SUBMITTED';
}

/**
 * The gate is a SEPARATE fact from the approval.
 *
 * An approval that has not yet been written down leaves the held activity locked — which was a real
 * defect until 0064, and is exactly why this is read from `gates_activity_state` rather than
 * inferred from `is_approved`. If the two ever disagree again, this screen shows it instead of
 * hiding it.
 */
function gateState(r: LabApprovalRow): 'GATE OPEN' | 'GATE CLOSED' | null {
  if (!r.is_gate) return null;
  const held = r.gates_activity_state;
  if (held === null || held === undefined) return null;
  return held === 'LOCKED' ? 'GATE CLOSED' : 'GATE OPEN';
}

function StateTag({ state }: { state: ApprovalState | 'GATE OPEN' | 'GATE CLOSED' }) {
  const tone =
    state === 'APPROVED' || state === 'GATE OPEN'
      ? 'bg-ok/15 text-ok'
      : state === 'REJECTED' || state === 'GATE CLOSED'
        ? 'bg-danger/15 text-danger'
        : state === 'WAITING APPROVAL'
          ? 'bg-warn/15 text-warn'
          : 'bg-surface-2 text-muted';
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full ${tone}`}>
      {state}
    </span>
  );
}

function Band({
  title,
  tone,
  count,
  children,
}: {
  title: string;
  tone: 'crit' | 'warn' | 'ok';
  count: number;
  children: React.ReactNode;
}) {
  const colour = tone === 'crit' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-ok';
  return (
    <section className="mt-4 space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className={`text-[12px] font-mono font-bold uppercase tracking-wider ${colour}`}>
          {title}
        </h2>
        <span className="text-[11px] text-muted">{count}</span>
      </div>
      {children}
    </section>
  );
}

function ApprovalRow({
  row,
  onOpen,
  muted,
}: {
  row: LabApprovalRow;
  onOpen: () => void;
  muted?: boolean;
}) {
  return (
    <Card
      className={`p-4 ${muted ? 'opacity-70' : ''}`}
      rail={row.is_approved ? 'var(--ok)' : row.is_gate ? 'var(--danger)' : 'var(--warn)'}
    >
      <button className="w-full text-left" onClick={onOpen}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[11px] text-muted">
              {row.batch_code} · {row.checkpoint_code}
            </p>
            <h3 className="font-head text-base font-extrabold text-ink">
              {row.activity_title}
              {row.scope_label && <span className="font-normal text-muted"> · {row.scope_label}</span>}
            </h3>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <StateTag state={approvalState(row)} />
            {gateState(row) && <StateTag state={gateState(row)!} />}
          </div>
        </div>

        {/* The consequence, named. An approver should not have to work out what they are unlocking. */}
        {row.is_gate && row.gates_activity_title && (
          <p className="mt-2 text-[12px] text-ink-2">
            {row.is_approved ? 'Released' : 'Holds'}{' '}
            <strong className="text-ink">{row.gates_activity_title}</strong>
            {row.gates_activity_state && (
              <span className="text-muted"> ({row.gates_activity_state})</span>
            )}
          </p>
        )}
        {!row.is_gate && (
          <p className="mt-2 text-[12px] text-muted">
            This checkpoint is a {row.checkpoint_kind ?? 'record'} — it holds no production activity.
          </p>
        )}

        <div className="mt-2 flex flex-wrap gap-x-4 text-[11px] text-muted">
          <span>
            Readings <strong className="font-mono text-ink-2">{row.result_count}</strong>
          </span>
          <span>
            Samples <strong className="font-mono text-ink-2">{row.sample_count}</strong>
          </span>
          {row.decision_count > 0 && (
            <span>
              Decisions <strong className="font-mono text-ink-2">{row.decision_count}</strong>
            </span>
          )}
        </div>
      </button>
    </Card>
  );
}

function DecisionSheet({
  row,
  mayDecide,
  onClose,
  onDecided,
}: {
  row: LabApprovalRow;
  mayDecide: boolean;
  onClose: () => void;
  onDecided: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  // The readings and the photographs the decision is ABOUT. An approver who cannot see them is
  // rubber-stamping, which is the failure mode a gate is supposed to prevent.
  const results = useQuery({
    queryKey: ['lab-results', row.activity_id],
    queryFn: () => loadResults(row.activity_id),
  });
  const evidence = useQuery({
    queryKey: ['lab-evidence', row.activity_id],
    queryFn: () => loadEvidenceState(row.activity_id),
  });

  const decide = useMutation({
    mutationFn: (verdict: 'approved' | 'rejected') =>
      decideLabSubmission(row.activity_id, verdict, reason.trim()),
    onSuccess: onDecided,
    onError: (e) => setError(humanError(e).title + ' ' + humanError(e).detail),
  });

  // The server requires a reason in BOTH directions. Mirroring that here is a courtesy, not the
  // rule — pressing through it still gets refused.
  const hasReason = reason.trim().length > 0;
  const noReading = row.result_count === 0 || row.sample_count === 0;
  // A reading outside its band may still be approved, but only as a stated "approve anyway" that
  // the server records as approved_out_of_range and keeps on the decision permanently (0080).
  const failing = (results.data ?? []).filter((x) => x.isCurrent && x.verdict === 'fail');

  return (
    <>
      <PageHeading
        title={row.activity_title}
        subtitle={`${row.batch_code} · ${row.checkpoint_code}`}
        right={
          <button className="text-[12px] font-bold text-accent" onClick={onClose}>
            Back
          </button>
        }
      />

      <div className="flex gap-2 mb-3">
        <StateTag state={approvalState(row)} />
        {gateState(row) && <StateTag state={gateState(row)!} />}
      </div>

      {/* THE READINGS. What was actually measured, with the band it was measured against. */}
      <Card className="p-4 mb-3" rail="var(--accent)">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
          Result entered — this is not yet an approval
        </span>
        {results.isLoading ? (
          <p className="text-[12px] text-muted mt-1">Loading readings…</p>
        ) : (results.data ?? []).filter((x) => x.isCurrent).length === 0 ? (
          <p className="text-[13px] text-warn mt-1">
            No reading is recorded on this submission.
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {(results.data ?? [])
              .filter((x) => x.isCurrent)
              .map((x) => (
                <li key={x.resultId} className="text-[13px] text-ink flex flex-wrap gap-x-3">
                  <span className="font-mono">{x.parameterCode}</span>
                  <strong className="font-mono">
                    {x.valueNumeric ?? x.valueText ?? '—'}
                    {x.unit ? ` ${x.unit}` : ''}
                  </strong>
                  <span className="text-muted">
                    {x.specFound
                      ? `band ${x.targetMin ?? '—'}–${x.targetMax ?? '—'}`
                      : 'no band on file'}
                  </span>
                  <span className={x.verdict === 'pass' ? 'text-ok' : 'text-warn'}>{x.verdict}</span>
                </li>
              ))}
          </ul>
        )}
      </Card>

      {/* THE EVIDENCE. Counts come from the server; a short count is why a finish was refused. */}
      <Card className="p-4 mb-3" rail="var(--muted)">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Evidence</span>
        {(evidence.data ?? []).length === 0 ? (
          <p className="text-[12px] text-muted mt-1">
            {evidence.isLoading ? 'Loading…' : 'This checkpoint requires no evidence.'}
          </p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {(evidence.data ?? []).map((e) => (
              <li key={e.requirementId} className="text-[13px] text-ink">
                {e.label}{' '}
                <strong
                  className={`font-mono ${e.satisfiedCount < e.minCount ? 'text-warn' : 'text-ok'}`}
                >
                  {e.satisfiedCount}/{e.minCount}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4" rail={row.is_gate ? 'var(--danger)' : 'var(--warn)'}>
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
          What this decision does
        </span>
        {row.is_gate && row.gates_activity_title ? (
          <p className="mt-1 text-[13px] text-ink">
            Approving releases <strong>{row.gates_activity_title}</strong>. Until then it stays
            locked, whatever else is ready.
          </p>
        ) : (
          <p className="mt-1 text-[13px] text-ink">
            This checkpoint holds no production activity. The decision is recorded as part of the
            batch history and unlocks nothing.
          </p>
        )}
      </Card>

      {noReading && (
        <Card className="p-4 mt-3" rail="var(--warn)">
          <span className="text-[10px] font-bold uppercase tracking-widest text-warn">
            No sample or reading on record
          </span>
          <p className="mt-1 text-[13px] text-ink">
            This submission has no complete lab package, so it cannot be decided. The lab must take the
            sample and record every reading first.
          </p>
        </Card>
      )}

      {failing.length > 0 && (
        <Card className="p-4 mt-3" rail="var(--danger)">
          <span className="text-[10px] font-bold uppercase tracking-widest text-danger">
            {failing.length} reading{failing.length === 1 ? '' : 's'} outside the allowed range
          </span>
          <p className="mt-1 text-[13px] text-ink">
            Reject it so the lab retests, or approve anyway with a written reason. An approval here is
            recorded as <strong>approved out of range</strong> and stays flagged on the batch permanently.
          </p>
        </Card>
      )}

      {row.latest_verdict && (
        <Card className="p-4 mt-3" rail="var(--muted)">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
            Standing decision
          </span>
          <p className="mt-1 text-[13px] text-ink">
            <strong>{row.latest_verdict}</strong> by {row.decided_by_name ?? 'unknown'} (
            {row.decided_role}) — {row.latest_reason}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            A further decision supersedes this one. The original is kept.
          </p>
        </Card>
      )}

      <div className="mt-4">
        <label className="text-[10px] font-bold uppercase tracking-widest text-muted" htmlFor="why">
          Reason — required, in both directions
        </label>
        <textarea
          id="why"
          className="mt-1 w-full rounded-xl border border-line bg-surface p-3 text-sm"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What you checked, and why this passes or fails."
          disabled={!mayDecide}
        />
      </div>

      {error && (
        <Card className="p-3 mt-3" rail="var(--danger)">
          <p className="text-[12px] text-ink">{error}</p>
        </Card>
      )}

      <div className="mt-3 flex gap-2">
        <button
          className={`flex-1 rounded-xl text-white font-bold py-3 text-sm disabled:opacity-50 ${failing.length > 0 ? 'bg-danger' : 'bg-ok'}`}
          disabled={!mayDecide || !hasReason || noReading || decide.isPending}
          onClick={() => decide.mutate('approved')}
        >
          {decide.isPending ? 'Recording…' : failing.length > 0 ? 'Approve anyway' : 'Approve'}
        </button>
        <button
          className="flex-1 rounded-xl border border-danger text-danger font-bold py-3 text-sm disabled:opacity-50"
          disabled={!mayDecide || !hasReason || noReading || decide.isPending}
          onClick={() => decide.mutate('rejected')}
        >
          Reject
        </button>
      </div>

      <p className="mt-2 text-[11px] text-muted">
        Who may approve: <strong>{(row.approver_roles ?? []).join(' or ') || 'named by the server'}</strong>
        {row.approver_question_settled ? '' : ' — C-32 is open, so both readings stand.'}
      </p>
      {!mayDecide && (
        <p className="mt-1 text-[11px] text-muted">
          Your role may not decide a lab submission. The server enforces this — the disabled buttons
          are a courtesy, not the boundary.
        </p>
      )}
    </>
  );
}

/**
 * C-32, on the page. The approver is the person best placed to notice that nobody has ever settled
 * who is supposed to be doing this.
 */
function OpenQuestion({ readings }: { readings: { statement: string; consequence: string; approver_role: string; source_ref: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-6">
      <button
        className="text-[11px] font-bold uppercase tracking-widest text-muted"
        onClick={() => setOpen(!open)}
      >
        Who approves a lab submission? — unresolved {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {readings.map((r) => (
            <Card key={r.approver_role} className="p-3" rail="var(--muted)">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
                {r.approver_role}
              </span>
              <p className="text-[12px] text-ink mt-0.5">{r.statement}</p>
              <p className="text-[11px] text-muted mt-1">
                <strong>If this reading wins:</strong> {r.consequence}
              </p>
              <p className="text-[10px] text-muted mt-1 font-mono">{r.source_ref}</p>
            </Card>
          ))}
          <p className="text-[11px] text-muted">
            Neither reading is enabled, so the server accepts a decision from either role. Enabling
            one in <span className="mono">lab_approval_reading</span> narrows it, with no code change.
          </p>
        </div>
      )}
    </section>
  );
}
