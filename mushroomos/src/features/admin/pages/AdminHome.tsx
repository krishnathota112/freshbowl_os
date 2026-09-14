import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { loadAdminHome } from '../api/intake';
import type { BatchContext } from '../../../shared/api/work';
import { ErrorPanel } from '../../../shared/ui/feedback/ErrorPanel';
import { fmtWhen } from '../../../shared/utils/labWords';
import { Chip, EmptyState, Skeleton } from '../../../shared/ui/primitives';

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
    <div className="space-y-6 max-w-5xl mx-auto pb-16 page-in">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <span className="label-caps text-muted">Factory Operations Dashboard</span>
          <h1 className="font-head text-2xl font-extrabold text-ink">Control Tower</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/users"
            className="rounded-xl border border-line bg-surface px-3.5 py-2 font-head text-xs font-bold text-ink-2 hover:bg-surface-2 flex items-center gap-1.5 no-underline tappable"
          >
            <span className="material-symbols-outlined text-base">group</span>
            User Management
          </Link>
          <Link
            to="/admin/batches"
            className="rounded-xl border border-line bg-surface px-3.5 py-2 font-head text-xs font-bold text-ink-2 hover:bg-surface-2 flex items-center gap-1.5 no-underline tappable"
          >
            <span className="material-symbols-outlined text-base">view_module</span>
            All Batches
          </Link>
        </div>
      </header>

      {/* Action Doors */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/admin/batch/start"
          className="mos-next-card p-6 text-white no-underline shadow-raised tappable flex flex-col justify-between"
          style={{ minHeight: 120 }}
        >
          <div className="flex items-start justify-between relative z-10">
            <div>
              <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-[10px] font-extrabold tracking-wider uppercase">
                NEW PRODUCTION
              </span>
              <h2 className="font-head text-xl font-extrabold text-white mt-1">Start New Batch</h2>
            </div>
            <div className="mos-icon-tile bg-white/20 text-white backdrop-blur-md">
              <span className="material-symbols-outlined text-xl">add_circle</span>
            </div>
          </div>
          <p className="text-xs text-white/80 relative z-10 mt-2">
            Initialize and schedule a fresh batch from published SOP specs.
          </p>
        </Link>

        <Link
          to="/admin/batch/ongoing"
          className="mos-card p-6 border border-line no-underline shadow-card tappable flex flex-col justify-between hover:border-accent/40"
          style={{ minHeight: 120 }}
        >
          <div className="flex items-start justify-between">
            <div>
              <span className="label-caps text-muted">ONBOARDING</span>
              <h2 className="font-head text-xl font-extrabold text-ink mt-1">Add Ongoing Batch</h2>
            </div>
            <div className="mos-icon-tile bg-surface-2 text-accent">
              <span className="material-symbols-outlined text-xl">move_to_inbox</span>
            </div>
          </div>
          <p className="text-xs text-muted mt-2">
            Bring a batch currently running on the factory floor into Mushroom OS.
          </p>
        </Link>
      </div>

      {q.isLoading && <Skeleton label="Loading factory console…" lines={5} />}
      {q.error && <ErrorPanel error={q.error} prefix="The factory console could not be loaded." onRetry={() => q.refetch()} />}

      {q.data && (
        <div className="space-y-6">
          {(q.data.approvalsWaiting > 0 || q.data.deviationsOpen > 0) && (
            <Section title="Attention Required">
              {q.data.approvalsWaiting > 0 && (
                <RowLink
                  to="/lab/approvals"
                  label={`${q.data.approvalsWaiting} Lab ${q.data.approvalsWaiting === 1 ? 'submission' : 'submissions'} awaiting GM decision`}
                  detail="Production gates remain locked until checkpoint approval is granted."
                  icon="biotech"
                />
              )}
              {q.data.deviationsOpen > 0 && (
                <RowLink
                  to="/gm/progress"
                  label={`${q.data.deviationsOpen} open ${q.data.deviationsOpen === 1 ? 'deviation' : 'deviations'} on record`}
                  detail="Supervisor or GM review required to clear active deviations."
                  icon="warning"
                />
              )}

            </Section>
          )}

          {q.data.draft.length > 0 && (
            <Section title="Draft Batches (Not Started)">
              <div className="grid gap-3 sm:grid-cols-2">
                {q.data.draft.map((b) => (
                  <BatchCard key={b.master_batch_id} b={b} to={`/admin/batch/${b.master_batch_id}/prepare`} cta="Continue Setup" />
                ))}
              </div>
            </Section>
          )}

          <Section title={`Active Concurrent Batches (${q.data.active.length})`}>
            {q.data.active.length === 0 ? (
              <EmptyState
                title="No batch is running right now"
                detail="Start a new batch or onboard a running floor batch using the action buttons above."
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {q.data.active.map((b) => (
                  <BatchCard key={b.master_batch_id} b={b} to={`/batch/${b.master_batch_id}`} />
                ))}
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="label-caps text-muted">{title}</h2>
      {children}
    </section>
  );
}

function RowLink({ to, label, detail, icon }: { to: string; label: string; detail: string; icon?: string }) {
  return (
    <Link
      to={to}
      className="mos-card flex items-start gap-3.5 p-4 border no-underline transition-all hover:border-warn text-ink shadow-card tappable"
      style={{ borderColor: 'var(--warn)', background: 'var(--warn-soft)' }}
    >
      <div className="mos-icon-tile w-10 h-10 bg-amber-200 text-warn font-bold">
        <span className="material-symbols-outlined text-lg">{icon ?? 'warning'}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-head text-base font-extrabold text-ink">{label}</p>
        <p className="mt-0.5 text-xs text-ink-2 font-medium">{detail}</p>
      </div>
      <span className="material-symbols-outlined text-warn text-lg">chevron_right</span>
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
  const pct = total > 0 ? Math.round((finished / total) * 100) : 0;

  return (
    <Link
      to={to}
      className={`mos-card block p-4 border no-underline transition-all hover:border-accent/40 shadow-card tappable ${
        running > 0 ? 'border-accent' : 'border-line'
      }`}
      style={{ color: 'var(--ink)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-extrabold text-ink">{b.code}</span>
            <Chip tone={running > 0 ? 'accent' : 'inherit'}>{b.status.toUpperCase()}</Chip>
          </div>
          <p className="mt-1 text-xs text-muted font-medium">
            SOP: <span className="font-mono font-bold text-ink-2">{b.process_code}</span>
            {b.standard_hr !== null && <> · H{b.standard_hr}</>}
            {b.h0 && <> · H0 {fmtWhen(b.h0)}</>}
          </p>
        </div>
        {cta ? <Chip tone="accent">{cta}</Chip> : running > 0 ? <Chip tone="accent">{running} active</Chip> : null}
      </div>

      {total > 0 && (
        <div className="mt-3 pt-2.5 border-t border-line space-y-1.5">
          <div className="flex items-center justify-between text-xs text-ink-2">
            <span>Progress: <strong>{finished} / {total}</strong> tasks</span>
            <span className="font-mono font-bold text-accent">{pct}%</span>
          </div>
          <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div className="bg-accent h-full rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </Link>
  );
}
