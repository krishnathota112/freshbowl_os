import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { loadLabWork, type LabWorkItem } from '../api/lab';
import { PageHeading } from '../../../shared/ui/layout/PageHeading';
import { Chip, EmptyState, Skeleton } from '../../../shared/ui/primitives';
import { ErrorPanel } from '../../../shared/ui/ErrorPanel';
import { fmtWhen, labStatus, paramLabel } from '../../../shared/utilities/labWords';

/**
 * L1 · the Lab queue — "Take the sample, record the result, submit it." `WORKSTATIONS.md` §3.
 *
 * WHAT THE TECHNICIAN SEES, IN ORDER
 *   Continue          work they have started — always first, so an app restart lands on it
 *   Next              ready checkpoints in PLANNED order (`v_my_work.planned_start_at`)
 *   Waiting approval  submitted checkpoints that hold production shut until someone decides
 *   Rejected          a decision went against it — the reason is on the checkpoint
 *   Recently done
 *
 * WHY "NEXT" IS SHORT. Lab work carries no entry gates, so every lab activity on every active batch
 * is READY at once — 166 of them on 12 Sep. A list of 166 equal cards is noise. The order is the
 * server's plan; the screen only chooses how many to show before "Show all".
 *
 * Nothing here decides eligibility, lateness or approval. The status word comes from the server's
 * state, the latest decision, and whether the checkpoint holds a gate.
 */
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

  let line: string;
  if (i.state === 'IN_PROGRESS' || i.state === 'RETURNED') {
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
      className="block rounded-lg border bg-surface p-4 no-underline"
      style={{ borderColor: i.state === 'IN_PROGRESS' ? 'var(--accent)' : 'var(--line)', color: 'var(--ink)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-head text-[16px] font-800 leading-snug">{i.activityTitle}</p>
          <p className="mt-0.5 text-[13px] text-muted">
            {i.scopeLabel} · <span className="mono">{i.batchCode}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Chip tone={s.tone}>{s.label}</Chip>
          {i.band === 'retest' && <Chip tone="warn">Retest</Chip>}
        </div>
      </div>
      <p className="mt-2 text-[13px] text-ink2">{line}</p>
    </Link>
  );
}
