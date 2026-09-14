import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { loadLabWork, type LabWorkItem } from '../features/lab/api/lab';
import { PageHeading } from '../shared/ui/layout/PageHeading';
import { Chip, EmptyState, Skeleton } from '../shared/ui/primitives';
import { ErrorPanel } from '../shared/ui/ErrorPanel';
import { fmtWhen, labStatus, paramLabel } from '../shared/utilities/labWords';

const NEXT_SHOWN = 6;
const DONE_SHOWN = 5;

const byPlan = (a: LabWorkItem, b: LabWorkItem) =>
  (a.plannedStartAt ?? '9999').localeCompare(b.plannedStartAt ?? '9999');

export function LabQueue() {
  const q = useQuery({ queryKey: ['lab-work'], queryFn: loadLabWork, refetchInterval: 30_000 });
  const [showAll, setShowAll] = useState(false);

  if (q.isLoading) {
    return (
      <>
        <PageHeading title="Lab" subtitle="What to sample next" />
        <Skeleton label="Loading your lab work" lines={4} />
      </>
    );
  }
  if (q.error) {
    return (
      <>
        <PageHeading title="Lab" />
        <ErrorPanel error={q.error} prefix="The lab queue could not be loaded." onRetry={() => q.refetch()} />
      </>
    );
  }

  const items = q.data ?? [];
  const running = items.filter((i) => i.state === 'IN_PROGRESS' || i.state === 'RETURNED').sort(byPlan);
  const next = items.filter((i) => i.state === 'READY' || i.state === 'LOCKED' || i.state === 'BLOCKED').sort(byPlan);
  const done = items.filter((i) => i.state === 'COMPLETED');
  const waiting = done.filter((i) => i.lastSubmission === null && i.holdsGate);
  const rejected = done.filter((i) => i.lastSubmission === 'rejected');
  const finished = done
    .filter((i) => !waiting.includes(i) && !rejected.includes(i))
    .sort((a, b) => (b.actualEnd ?? '').localeCompare(a.actualEnd ?? ''));

  const shownNext = showAll ? next : next.slice(0, NEXT_SHOWN);

  return (
    <>
      <PageHeading
        title="Lab"
        subtitle={
          running.length > 0
            ? `${running.length} in progress`
            : next.length > 0
              ? 'What to sample next'
              : 'Nothing waiting on the lab'
        }
      />

      {items.length === 0 && (
        <EmptyState
          title="Nothing is assigned to the lab right now"
          detail="A checkpoint appears here when a batch you are assigned to is activated."
        />
      )}

      {running.length > 0 && (
        <Section title="Continue">
          {running.map((i) => (
            <WorkCard key={i.activityId} i={i} />
          ))}
        </Section>
      )}

      {next.length > 0 && (
        <Section title="Next">
          {shownNext.map((i) => (
            <WorkCard key={i.activityId} i={i} />
          ))}
          {next.length > NEXT_SHOWN && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="rounded-lg border font-head text-[14px] font-700"
              style={{ minHeight: 48, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
            >
              {showAll ? 'Show fewer' : `Show all ${next.length}`}
            </button>
          )}
        </Section>
      )}

      {waiting.length > 0 && (
        <Section title="Waiting approval">
          {waiting.map((i) => (
            <WorkCard key={i.activityId} i={i} />
          ))}
        </Section>
      )}

      {rejected.length > 0 && (
        <Section title="Rejected">
          {rejected.map((i) => (
            <WorkCard key={i.activityId} i={i} />
          ))}
        </Section>
      )}

      {finished.length > 0 && (
        <Section title="Recently done">
          {finished.slice(0, DONE_SHOWN).map((i) => (
            <WorkCard key={i.activityId} i={i} />
          ))}
        </Section>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 font-head text-[12px] font-800 uppercase tracking-wider text-muted">{title}</h2>
      <div className="grid gap-2">{children}</div>
    </section>
  );
}

function WorkCard({ i }: { i: LabWorkItem }) {
  const s = labStatus(i.state, i.lastSubmission, i.holdsGate);
  const measuring = i.parameters.map(paramLabel).join(', ');
  const inProgress = i.state === 'IN_PROGRESS' || i.state === 'RETURNED';

  let line: string;
  if (inProgress) {
    const photos =
      i.requiredEvidence && i.requiredEvidence > 0
        ? ` · ${Math.min(i.satisfiedEvidence ?? 0, i.requiredEvidence)} / ${i.requiredEvidence} photos`
        : '';
    line = `${Math.min(i.results, i.parameters.length)} of ${i.parameters.length} readings${photos}`;
  } else if (i.state === 'COMPLETED') {
    line = `Submitted ${fmtWhen(i.actualEnd)}`;
  } else if (i.blockedReason) {
    line = i.blockedReason;
  } else {
    line = `${i.plannedStartAt ? `Planned ${fmtWhen(i.plannedStartAt)}` : 'No planned time'}${measuring ? ` · ${measuring}` : ''}`;
  }

  return (
    <Link
      to={`/lab/checkpoint/${i.activityId}`}
      className={`mos-card block p-4.5 border no-underline transition-all hover:border-accent/40 tappable ${
        inProgress ? 'border-accent shadow-card' : 'border-line'
      }`}
      style={{ color: 'var(--ink)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`mos-icon-tile w-10 h-10 ${
              inProgress
                ? 'bg-accent text-white'
                : i.state === 'COMPLETED'
                ? 'bg-ok-soft text-ok'
                : 'bg-surface-2 text-muted'
            }`}
          >
            <span className="material-symbols-outlined text-lg">
              {inProgress ? 'biotech' : i.state === 'COMPLETED' ? 'check_circle' : 'science'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-head text-base font-extrabold text-ink leading-snug">{i.activityTitle}</p>
            <p className="mt-0.5 text-xs text-muted font-medium">
              {i.scopeLabel} · <span className="mono font-bold text-ink-2">{i.batchCode}</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Chip tone={s.tone}>{s.label}</Chip>
          {i.band === 'retest' && <Chip tone="warn">Retest</Chip>}
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-line flex items-center justify-between gap-2 text-xs text-ink-2">
        <p className="font-medium text-muted">{line}</p>
        <span className="font-head text-xs font-bold text-accent flex items-center gap-0.5 shrink-0">
          {inProgress ? 'Continue' : i.state === 'COMPLETED' ? 'View' : 'Record'}
          <span className="material-symbols-outlined text-sm">chevron_right</span>
        </span>
      </div>
    </Link>
  );
}

export default LabQueue;
