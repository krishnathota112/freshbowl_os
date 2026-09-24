import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import { signedEvidenceUrl } from '../../../shared/api/batch';
import { loadBatchHour } from '../../../shared/api/projection';
import { Chip, EmptyState, Skeleton } from '../../../shared/ui/primitives';
import {
  getBatchMonitor,
  listBatchTimeline,
  listInitialMaterial,
  type BatchMonitor as Monitor,
  type TimelinePhoto,
  type TimelineRow,
} from '../../../shared/api/monitor';

/**
 * The verification console. Operating flow §6, 14 Sep 2026:
 * "What happened, when, who did it, what was measured, what evidence was uploaded, and what is blocked?"
 *
 * Every value is the server's — `v_batch_monitor` and `v_batch_timeline` (0086). Photos are the
 * persisted evidence rows, shown through short-lived signed URLs. Times are the server's timestamps.
 * Nothing is computed here beyond sorting and grouping.
 */
type View = 'timeline' | 'now' | 'blocked' | 'lab' | 'before';

const STATE_WORDS: Record<string, string> = {
  NOT_DUE_YET: 'Not due yet',
  COMPLETED: 'Completed', READY: 'Ready', IN_PROGRESS: 'In progress', LOCKED: 'Locked', BLOCKED: 'Blocked',
  DEVIATION: 'Deviation', RETURNED: 'Returned', SKIPPED: 'Skipped', WAITING_TIME: 'Resting',
  WAITING_CONDITION: 'Waiting', AWAITING_LAB: 'Waiting on lab', AWAITING_SUPERVISOR: 'Waiting on supervisor',
  SUBMITTED: 'Submitted', CANCELLED: 'Cancelled',
};

export function BatchMonitor({ batchId }: { batchId: string }) {
  const [view, setView] = useState<View>('now');
  const clock = useQuery({ queryKey: ['batch-hour', batchId], queryFn: () => loadBatchHour(batchId), refetchInterval: 30_000 });
  const monitor = useQuery({ queryKey: ['batch-monitor', batchId], queryFn: () => getBatchMonitor(batchId), refetchInterval: 30_000 });
  const timeline = useQuery({ queryKey: ['batch-timeline', batchId], queryFn: () => listBatchTimeline(batchId), refetchInterval: 30_000 });
  const material = useQuery({ queryKey: ['initial-material', batchId], queryFn: () => listInitialMaterial(batchId) });

  const rows = useMemo(() => timeline.data ?? [], [timeline.data]);
  const tracked = useMemo(
    () =>
      rows
        .filter((r) => !r.before_tracking && (r.actual_start || r.submitted_at || r.skipped_at))
        .sort((a, b) => stamp(a).localeCompare(stamp(b))),
    [rows]
  );
  const now = rows.filter((r) => !r.before_tracking && ['READY', 'IN_PROGRESS', 'RETURNED', 'DEVIATION'].includes(r.state));
  const blocked = rows.filter((r) => !r.before_tracking && ['LOCKED', 'BLOCKED'].includes(r.state) && (r.unresolved_dependency || r.blocked_reason));
  const lab = rows.filter((r) => r.is_lab && !r.before_tracking && (r.lab_results.length > 0 || r.decision_verdict || r.state === 'COMPLETED'));
  const before = rows.filter((r) => r.before_tracking);

  if (monitor.isLoading || timeline.isLoading) return <Skeleton label="Loading the batch record" lines={6} />;
  if (monitor.error || timeline.error) {
    return <EmptyState title="The batch record could not be loaded" detail={((monitor.error ?? timeline.error) as Error).message} />;
  }
  const m = monitor.data;
  if (!m) return <EmptyState title="Batch not found" detail="No monitoring row exists for this batch." />;

  return (
    <div className="space-y-5">
      <BatchHeader m={m} currentActivities={now.filter((r) => !r.is_lab).map((r) => `${r.title}${r.scope_label ? ` · ${r.scope_label}` : ''}`)} />
      <p className="text-[14px] text-ink2">Current batch hour: <strong className="mono">{clock.isError ? 'Unavailable' : clock.isLoading ? 'Loading…' : clock.data == null ? 'H0 not recorded' : `H${clock.data}`}</strong></p>
      <Progress m={m} />

      <section className="rounded-xl border bg-surface p-4" style={{ borderColor: 'var(--line)' }}>
        <h3 className="font-head text-[12px] font-800 uppercase tracking-wider text-ink2">Initial material data (pre-H0)</h3>
        {material.isLoading ? (
          <Skeleton label="Loading" lines={1} />
        ) : (material.data ?? []).length === 0 ? (
          <p className="mt-1 text-[13px] text-muted">None recorded.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-3">
            {(material.data ?? []).map((v, i) => (
              <div key={`${v.parameter}-${i}`} className="rounded-lg border px-3 py-2" style={{ borderColor: v.verdict === 'fail' ? 'var(--crit)' : 'var(--line)' }}>
                <p className="mono text-[11px] text-muted">{v.parameter}</p>
                <p className="mono text-[16px] font-700">{v.value ?? '—'} {v.unit ?? ''}</p>
                {v.verdict === 'fail' && <Chip tone="crit">outside spec</Chip>}
                <p className="text-[11px] text-muted">{v.by ?? '—'} · {v.measuredAt ? when(v.measuredAt) : '—'}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <nav className="flex flex-wrap gap-1" aria-label="Record views">
        <Tab on={view === 'timeline'} onClick={() => setView('timeline')}>Timeline ({tracked.length})</Tab>
        <Tab on={view === 'now'} onClick={() => setView('now')}>Now ({now.length})</Tab>
        <Tab on={view === 'blocked'} onClick={() => setView('blocked')}>Blocked ({blocked.length})</Tab>
        <Tab on={view === 'lab'} onClick={() => setView('lab')}>Lab & GM ({lab.length})</Tab>
        <Tab on={view === 'before'} onClick={() => setView('before')}>Before tracking ({before.length})</Tab>
      </nav>

      {view === 'timeline' && (tracked.length === 0
        ? <EmptyState title="Nothing has been recorded yet" detail="Work appears here as it is started and finished." />
        : <div className="space-y-3">{tracked.map((r) => <ActivityCard key={r.activity_id} r={r} />)}</div>)}
      {view === 'now' && (now.length === 0
        ? <EmptyState title="No open work" detail="Nothing is ready or in progress." />
        : <div className="space-y-3">{now.map((r) => <ActivityCard key={r.activity_id} r={r} />)}</div>)}
      {view === 'blocked' && (blocked.length === 0
        ? <EmptyState title="Nothing blocked with a stated reason" detail="Locked work that is simply waiting on the step before it is not listed." />
        : <div className="space-y-2">{blocked.map((r) => <BlockedRow key={r.activity_id} r={r} />)}</div>)}
      {view === 'lab' && (lab.length === 0
        ? <EmptyState title="No lab results yet" detail="Lab checkpoints appear once a sample or result is recorded." />
        : <div className="space-y-3">{lab.map((r) => <ActivityCard key={r.activity_id} r={r} />)}</div>)}
      {view === 'before' && (
        <div className="rounded-xl border bg-surface p-4 text-[13px]" style={{ borderColor: 'var(--line)' }}>
          <p className="mb-2 text-muted">Work that happened before MushroomOS tracking began. No execution record is claimed for it.</p>
          <ul className="grid gap-1">
            {before.map((r) => (
              <li key={r.activity_id}><span className="text-ink2">{r.stage}</span> · {r.title}{r.scope_label ? ` · ${r.scope_label}` : ''}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Server timestamps to the second, in the viewer's locale — the persisted value, not a device clock. */
function when(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function stamp(r: TimelineRow): string {
  return r.actual_start ?? r.submitted_at ?? r.skipped_at ?? '';
}

function BatchHeader({ m, currentActivities }: { m: Monitor; currentActivities: string[] }) {
  return (
    <section className="rounded-xl border bg-surface p-4" style={{ borderColor: 'var(--line)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-head text-[20px] font-800">{m.batch_code}</h2>
        {m.batch_label && m.batch_label !== m.batch_code && <span className="text-ink2">{m.batch_label}</span>}
        {m.is_demo && <Chip tone="warn">DEMO / TEST</Chip>}
        <Chip tone={m.status === 'active' ? 'ok' : 'muted'}>{m.status}</Chip>
        {m.onboarded && <Chip tone="accent">onboarded</Chip>}
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-3">
        <Fact label="Process / SOP" value={`${m.process_code} v${m.process_version}`} />
        <Fact
          label="Actual H0"
          value={
            m.h0
              ? when(m.h0)
              : m.onboarded
                ? `Not recorded — tracked from ${m.activated_at ? when(m.activated_at) : 'onboarding'}`
                : '—'
          }
        />
        <Fact label="Materials" value={m.materials ?? '—'} />
        <Fact label="Current stage" value={m.current_stages ?? '—'} wide />
        <Fact label="Current activity" value={currentActivities.length > 0 ? currentActivities.join(' · ') : '—'} wide />
      </dl>
    </section>
  );
}

function Fact({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-3' : ''}>
      <dt className="text-[10px] font-700 uppercase tracking-wider text-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function Progress({ m }: { m: Monitor }) {
  const tracked = m.production_total - m.production_before_tracking;
  const items: { label: string; value: string; tone?: string }[] = [
    { label: 'Production done', value: `${m.production_completed} / ${tracked}` },
    { label: 'Ready', value: String(m.production_ready) },
    { label: 'In progress', value: String(m.production_in_progress) },
    { label: 'Locked', value: String(m.production_locked) },
    { label: 'Lab pending', value: String(m.lab_pending) },
    { label: 'Awaiting GM', value: String(m.awaiting_gm), tone: m.awaiting_gm > 0 ? 'var(--warn)' : undefined },
    { label: 'Overdue', value: String(m.overdue), tone: m.overdue > 0 ? 'var(--crit)' : undefined },
    { label: 'Open tickets', value: String(m.open_tickets ?? 0), tone: (m.open_tickets ?? 0) > 0 ? 'var(--warn)' : undefined },
    { label: 'Deviations', value: String(m.deviations), tone: m.deviations > 0 ? 'var(--crit)' : undefined },
    { label: 'Before tracking', value: String(m.production_before_tracking) },
  ];
  return (
    <section className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-10">
      {items.map((i) => (
        <div key={i.label} className="rounded-lg border bg-surface px-3 py-2" style={{ borderColor: 'var(--line)' }}>
          <p className="text-[10px] font-700 uppercase tracking-wider text-muted">{i.label}</p>
          <p className="mono text-[18px] font-800" style={{ color: i.tone ?? 'var(--ink)' }}>{i.value}</p>
        </div>
      ))}
    </section>
  );
}

/** H-hours of the published plan, e.g. "H0–H3" or "H70". */
function hourSpan(r: TimelineRow): string {
  if (r.baseline_start_hour == null) return 'no planned hour';
  const s = `H${r.baseline_start_hour}`;
  return r.baseline_end_hour != null && r.baseline_end_hour !== r.baseline_start_hour ? `${s}–H${r.baseline_end_hour}` : s;
}

/**
 * 0117 · THE SERVER SAYS WHETHER A TASK IS DUE. THIS NO LONGER DECIDES.
 *
 * This used to be `r.due_from != null && Date.parse(r.due_from) > Date.now()` — the browser
 * re-deriving eligibility from a timestamp, and then rendering a "not due yet" chip beside a
 * "Ready" chip that disagreed with it. Two answers to one question, one of them computed here.
 *
 * `NOT_DUE_YET` is now a real state produced by `advance_batch` from `planned_time_status`, the
 * same function `start_block_reason` uses. This reads the answer instead of forming one, and
 * `due_from` is used only to SAY when — never to decide whether.
 */
function notDueYet(r: TimelineRow): boolean {
  return r.state === 'NOT_DUE_YET';
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function ActivityCard({ r }: { r: TimelineRow }) {
  const live = r.photos.filter((p) => !p.superseded);
  const tone = r.state === 'COMPLETED' ? 'ok' : r.state === 'DEVIATION' || r.overdue ? 'crit' : r.state === 'IN_PROGRESS' ? 'accent' : 'muted';
  return (
    <article className="rounded-xl border bg-surface p-4" style={{ borderColor: r.overdue ? 'var(--crit)' : 'var(--line)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={tone as 'ok' | 'crit' | 'accent' | 'muted'}>{STATE_WORDS[r.state] ?? r.state}</Chip>
        {r.overdue && <Chip tone="crit">over stated duration</Chip>}
        {r.is_lab && <Chip tone="accent">Lab{r.lab_checkpoint ? ` · ${r.lab_checkpoint}` : ''}</Chip>}
        {r.is_hold && <Chip tone="muted">hold</Chip>}
        {/* 0117 · no separate "not due yet" chip: the STATE chip above now says it, because the
            state itself is NOT_DUE_YET. Two chips saying the same thing was the visible symptom of
            the browser holding a second opinion. */}
        {r.lab_is_gate && <Chip tone="crit">needs GM approval</Chip>}
        {r.onboarded_position && <Chip tone="accent">onboarding position</Chip>}
      </div>
      <h4 className="mt-1 font-head text-[16px] font-800">{r.title}{r.scope_label ? <span className="font-normal text-muted"> · {r.scope_label}</span> : null}</h4>
      {/* The process hour first (H0 … H476) — the stage wording is the SOP's own and comes second. */}
      <p className="text-[13px] text-ink2">
        <strong className="mono">{hourSpan(r)}</strong>
        {r.planned_start_at && <> · planned {when(r.planned_start_at)}{r.planned_end_at ? ` → ${clock(r.planned_end_at)}` : ''}</>}
      </p>
      <p className="text-[12px] text-muted">{r.stage ?? '—'} · <span className="mono">{r.code}</span></p>
      {notDueYet(r) && (
        <p className="mt-1 text-[13px] font-600" style={{ color: 'var(--warn)' }}>
          {r.blocked_reason ?? (r.due_from ? `Not due yet — it can be started from ${when(r.due_from)}` : 'Not due yet.')}
        </p>
      )}

      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-2">
        <Line label="Actual start" value={r.actual_start ? `${when(r.actual_start)}${r.started_by_name ? ` · ${r.started_by_name}` : ''}` : '—'} />
        <Line label="Actual finish" value={r.actual_end ? `${when(r.actual_end)}${r.finished_by_name ? ` · ${r.finished_by_name}` : ''}` : '—'} />
        {(r.duration_target_min_hr != null || r.duration_target_max_hr != null) && (
          <Line label="Stated duration" value={r.duration_target_min_hr === r.duration_target_max_hr ? `${r.duration_target_max_hr} h` : `${r.duration_target_min_hr}–${r.duration_target_max_hr} h`} />
        )}
        {r.skip_reason && !r.before_tracking && <Line label="Skipped" value={r.skip_reason} />}
      </dl>

      {r.readings.length > 0 && (
        <Block title="Readings / checklist">
          <ul className="grid gap-1 text-[13px]">
            {r.readings.map((v) => (
              <li key={v.key}>
                <span className="text-ink2">{v.label}:</span>{' '}
                {v.datatype === 'check'
                  ? (v.value === 'true' ? '✓ done' : v.skip_reason ? `skipped — ${v.skip_reason}` : '—')
                  : v.skip_reason
                    ? <span style={{ color: 'var(--warn)' }}>skipped — {v.skip_reason}</span>
                    : <strong className="mono">{v.value ?? '—'}{v.value && v.unit ? ` ${v.unit}` : ''}</strong>}
                {v.target && v.datatype !== 'check' && <span className="text-muted"> (target {v.target})</span>}
                {v.flag === 'out_of_range' && <Chip tone="crit">outside SOP</Chip>}
                {v.remarks && <span className="text-muted"> · “{v.remarks}”</span>}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {(live.length > 0 || r.photo_requirements.length > 0) && (
        <Block title={`Photos ${r.photo_requirements.length > 0 ? `· ${r.photo_requirements.map((p) => `${p.label} ${Math.min(p.captured, p.required)}/${p.required}`).join(' · ')}` : ''}`}>
          {live.length === 0 ? (
            <p className="text-[13px] text-muted">No photo uploaded.</p>
          ) : (
            <div className="flex flex-wrap gap-3">{live.map((p) => <Photo key={p.media_id} p={p} />)}</div>
          )}
        </Block>
      )}

      {r.is_lab && (r.lab_results.length > 0 || r.decision_verdict) && (
        <Block title="Lab">
          <ul className="grid gap-1 text-[13px]">
            {r.lab_results.filter((l) => l.parameter).map((l, i) => (
              <li key={i}>
                <span className="text-ink2">{l.parameter}:</span> <strong className="mono">{l.value ?? '—'} {l.unit ?? ''}</strong>
                {l.verdict && <span className={l.verdict === 'fail' ? 'text-crit' : 'text-muted'}> · {l.verdict}</span>}
                <span className="text-muted"> · {l.technician ?? l.collected_by ?? '—'} · {l.measured_at ? when(l.measured_at) : '—'}</span>
                {l.retest_reason && <span className="text-muted"> · retest: {l.retest_reason}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[13px]">
            <span className="text-ink2">Decision:</span>{' '}
            {r.decision_verdict
              ? <><strong>{r.decision_verdict}</strong> by {r.decided_by_name ?? r.decided_role ?? '—'} · {r.decided_at ? when(r.decided_at) : ''}{r.decision_reason ? ` · “${r.decision_reason}”` : ''}{r.approved_out_of_range ? ' · approved out of range' : ''}</>
              : r.lab_is_gate && r.state === 'COMPLETED' ? <span style={{ color: 'var(--warn)' }}>awaiting GM</span> : '—'}
          </p>
        </Block>
      )}

      {r.onboarded_position && (
        <p className="mt-2 rounded border px-3 py-2 text-[12px]" style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}>
          Onboarding position — the factory stated the batch was at this activity when tracking began. Its earlier
          steps were not recorded in MushroomOS; they are listed under “Before tracking”, with no execution record claimed.
        </p>
      )}

      {r.tickets && r.tickets.length > 0 && (
        <Block title="Late-task tickets">
          <div className="grid gap-2">
            {r.tickets.map((t) => (
              <div key={t.id} className="rounded border px-3 py-2 text-[13px]" style={{ borderColor: t.status === 'REQUESTED' ? 'var(--warn)' : 'var(--line)' }}>
                <p>
                  <strong>{t.status === 'REQUESTED' ? 'Waiting for Admin' : t.status === 'ADMIN_APPROVED' ? 'Approved' : t.status === 'ADMIN_REJECTED' ? 'Rejected' : t.status}</strong>
                  {' '}· {t.requested_by ?? '—'} · {when(t.requested_at)} · {t.hours} h asked{t.overdue_at_request ? ' · was over its stated time' : ''}
                </p>
                <p className="text-ink2">“{t.reason}”</p>
                {t.photos.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {t.photos.map((p) => (
                      <Photo key={p.storage_path} p={{ media_id: p.storage_path, requirement_key: 'TICKET', label: 'Ticket photo', storage_path: p.storage_path, media_kind: p.media_kind, uploaded_at: p.uploaded_at, uploaded_by: t.requested_by, superseded: false, superseded_reason: null }} />
                    ))}
                  </div>
                )}
                {t.decision && (
                  <p className="mt-1 text-ink2">
                    Admin {t.decision} by {t.decided_by ?? '—'} · {when(t.decided_at)}{t.granted_hr ? ` · ${t.granted_hr} h granted` : ''} · “{t.decision_reason}”
                  </p>
                )}
              </div>
            ))}
          </div>
        </Block>
      )}

      {r.state !== 'COMPLETED' && (r.unresolved_dependency || r.blocked_reason) && (
        <p className="mt-2 rounded border px-3 py-2 text-[12px]" style={{ borderColor: 'var(--line-2)', background: 'var(--surface-2)' }}>
          {r.blocked_reason ?? r.unresolved_dependency}
        </p>
      )}
    </article>
  );
}

function BlockedRow({ r }: { r: TimelineRow }) {
  return (
    <div className="rounded-lg border bg-surface px-3 py-2 text-[13px]" style={{ borderColor: 'var(--line)' }}>
      <p className="font-700">{r.title}{r.scope_label ? ` · ${r.scope_label}` : ''} <span className="font-normal text-muted">· {r.stage}</span></p>
      {r.unresolved_dependency && <p style={{ color: 'var(--warn)' }}>Unresolved: {r.unresolved_dependency}</p>}
      {r.blocked_reason && <p className="text-ink2">{r.blocked_reason}</p>}
    </div>
  );
}

function Photo({ p }: { p: TimelinePhoto }) {
  const url = useQuery({ queryKey: ['evidence-url', p.storage_path], queryFn: () => signedEvidenceUrl(p.storage_path, 300), staleTime: 240_000 });
  return (
    <figure className="w-44">
      {url.data ? (
        <a href={url.data} target="_blank" rel="noopener noreferrer">
          <img src={url.data} alt={p.label ?? p.requirement_key} className="h-32 w-44 rounded-md object-cover" loading="lazy" />
        </a>
      ) : (
        <div className="h-32 w-44 rounded-md" style={{ background: 'var(--surface-2)' }} />
      )}
      <figcaption className="mt-1 text-[11px] leading-tight text-muted">
        <strong className="text-ink2">{p.label ?? p.requirement_key}</strong><br />
        {p.uploaded_by ?? '—'} · {when(p.uploaded_at)}
      </figcaption>
    </figure>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="inline text-ink2">{label}: </dt>
      <dd className="inline mono">{value}</dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-3">
      <p className="mb-1 text-[10px] font-700 uppercase tracking-wider text-muted">{title}</p>
      {children}
    </div>
  );
}

function Tab({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border px-3 font-head text-[13px] font-700"
      style={{
        minHeight: 40,
        borderColor: on ? 'var(--accent)' : 'var(--line-2)',
        background: on ? 'var(--accent-soft)' : 'transparent',
        color: on ? 'var(--accent-ink)' : 'var(--ink-2)',
      }}
    >
      {children}
    </button>
  );
}
