import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { loadAdminHome } from '../api/intake';
import type { BatchContext } from '../api/work';
import { ErrorPanel } from '../components/field/ErrorPanel';
import { fmtWhen } from '../components/field/labWords';
import { Chip, EmptyState, Skeleton } from '../components/primitives';

/**
 * A1 · Admin home — "Control the factory." `docs/05-ui/WORKSTATIONS.md` §4.
 *
 * TWO THINGS ARE IMPOSSIBLE TO MISS, because they are the two things an admin comes here to do:
 * start a new batch, or bring a batch the factory is ALREADY RUNNING into MushroomOS. They are
 * deliberately separate doors — what happens behind them is different in kind, and mixing them is
 * how a system ends up claiming it watched work it never saw.
 *
 * Below them: what needs a person, then the batches themselves. No percentages, no charts, no
 * "on time" — the product has no field for a running task being late (CT-001), so this screen
 * does not imply one. Every number is a view's own count.
 */
export function AdminHome() {
  const q = useQuery({ queryKey: ['admin-home'], queryFn: loadAdminHome, refetchInterval: 60_000 });

  return (
    <>
      <header className="mb-6">
        <h1 className="font-head text-[24px] font-800 leading-tight">Control the factory</h1>
        <p className="mt-1 text-[14px] text-muted">Start production, or bring a running batch in.</p>
      </header>

      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        <Link
          to="/admin/batch/start"
          className="flex flex-col justify-center rounded-xl px-5 py-5 no-underline"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)', minHeight: 104 }}
        >
          <span className="font-head text-[19px] font-800">New batch</span>
          <span className="mt-1 text-[14px] opacity-90">
            Plan it from a published process, then activate it.
          </span>
        </Link>

        <Link
          to="/admin/batch/ongoing"
          className="flex flex-col justify-center rounded-xl border px-5 py-5 no-underline"
          style={{ borderColor: 'var(--line-2)', color: 'var(--ink)', background: 'var(--surface)', minHeight: 104 }}
        >
          <span className="font-head text-[19px] font-800">Add ongoing batch</span>
          <span className="mt-1 text-[14px] text-muted">
            Already running in the factory. Record where it is now.
          </span>
        </Link>
      </div>

      {q.isLoading && <Skeleton label="Loading the factory" lines={5} />}
      {q.error && <ErrorPanel error={q.error} prefix="The factory could not be loaded." onRetry={() => q.refetch()} />}

      {q.data && (
        <>
          {(q.data.approvalsWaiting > 0 || q.data.deviationsOpen > 0) && (
            <Section title="Needs you">
              {q.data.approvalsWaiting > 0 && (
                <RowLink
                  to="/lab/approvals"
                  label={`${q.data.approvalsWaiting} lab ${q.data.approvalsWaiting === 1 ? 'submission' : 'submissions'} waiting for a decision`}
                  detail="Production stays locked behind an unapproved checkpoint."
                  tone="warn"
                />
              )}
              {q.data.deviationsOpen > 0 && (
                <RowLink
                  to="/supervisor/control-room"
                  label={`${q.data.deviationsOpen} open ${q.data.deviationsOpen === 1 ? 'deviation' : 'deviations'}`}
                  detail="Somebody has to rule on these."
                  tone="warn"
                />
              )}
            </Section>
          )}

          {q.data.draft.length > 0 && (
            <Section title="Not started yet">
              {q.data.draft.map((b) => (
                <BatchCard key={b.master_batch_id} b={b} to={`/admin/batch/${b.master_batch_id}/prepare`} cta="Continue setup" />
              ))}
            </Section>
          )}

          <Section title={`Active batches${q.data.active.length ? ` · ${q.data.active.length}` : ''}`}>
            {q.data.active.length === 0 ? (
              <EmptyState
                title="No batch is running"
                detail="Start one with New batch, or bring an already-running batch in with Add ongoing batch."
              />
            ) : (
              q.data.active.map((b) => (
                <BatchCard key={b.master_batch_id} b={b} to={`/batch/${b.master_batch_id}`} />
              ))
            )}
          </Section>

          <p className="mt-6 text-[13px] text-muted">
            <Link to="/admin/batches" style={{ color: 'var(--accent-ink)' }}>All batches</Link>
            {' · '}
            <Link to="/admin/today" style={{ color: 'var(--accent-ink)' }}>Everything today</Link>
          </p>
        </>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 font-head text-[12px] font-800 uppercase tracking-wider text-muted">{title}</h2>
      <div className="grid gap-2">{children}</div>
    </section>
  );
}

function RowLink({ to, label, detail, tone }: { to: string; label: string; detail: string; tone: 'warn' }) {
  return (
    <Link
      to={to}
      className="block rounded-lg border p-4 no-underline"
      style={{ borderColor: 'var(--warn)', background: 'var(--warn-soft)', color: 'var(--ink)' }}
    >
      <p className="font-head text-[15px] font-800">{label}</p>
      <p className="mt-0.5 text-[13px] text-ink2">{detail}</p>
      <span className="sr-only">{tone}</span>
    </Link>
  );
}

/**
 * One batch: the four numbers that must never be collapsed — PROCESS, STANDARD, H0 — and the
 * server's own counts of what has finished and what is running.
 */
function BatchCard({ b, to, cta }: { b: BatchContext; to: string; cta?: string }) {
  const finished = Number(b.finished_count ?? 0);
  const total = Number(b.activity_count ?? 0);
  const running = Number(b.running_count ?? 0);

  return (
    <Link
      to={to}
      className="block rounded-lg border bg-surface p-4 no-underline"
      style={{ borderColor: running > 0 ? 'var(--accent)' : 'var(--line)', color: 'var(--ink)' }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-head text-[17px] font-800 leading-snug">{b.code}</p>
          <p className="mt-0.5 text-[13px] text-muted">
            <span className="mono">{b.process_code}</span>
            {b.standard_hr !== null && <> · standard H{b.standard_hr}</>}
            {b.h0 && <> · H0 {fmtWhen(b.h0)}</>}
          </p>
        </div>
        {cta ? <Chip tone="accent">{cta}</Chip> : running > 0 ? <Chip tone="accent">{running} running</Chip> : null}
      </div>
      {total > 0 && (
        <p className="mt-2 text-[13px] text-ink2">
          {finished} of {total} activities done
        </p>
      )}
    </Link>
  );
}
