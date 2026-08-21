import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  activateBatch,
  getBatch,
  getBatchActivities,
  releaseElapsedRests,
  type BatchActivityRow,
} from '../api/batch';
import { supabase } from '../api/client';
import { PageHeading } from '../components/layout/AppShell';
import { Bar, Card, Chip, ConflictMarker, EmptyState, Stat } from '../components/primitives';
import { TaskDrawer } from './TaskDrawer';

/** The batch, day by day. This is the plan a supervisor or admin reads. */
export function BatchDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const batch = useQuery({ queryKey: ['batch', id], queryFn: () => getBatch(id) });
  const acts = useQuery({ queryKey: ['batch-activities', id], queryFn: () => getBatchActivities(id) });

  const activate = useMutation({
    mutationFn: () => activateBatch(id),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['batch', id] });
      qc.invalidateQueries({ queryKey: ['batch-activities', id] });
    },
    onError: (e) => setError((e as Error).message),
  });

  const tick = useMutation({
    mutationFn: () => releaseElapsedRests(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['batch-activities', id] }),
  });

  if (batch.isLoading || acts.isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (batch.error) return <EmptyState title="Batch not found" detail={(batch.error as Error).message} />;

  const b = batch.data!;
  const rows = acts.data ?? [];
  const byDay = groupByDay(rows);
  const done = rows.filter((r) => r.state === 'COMPLETED').length;
  const ready = rows.filter((r) => r.state === 'READY' || r.state === 'IN_PROGRESS').length;
  const flagged = rows.filter((r) => r.state === 'DEVIATION' || r.state === 'BLOCKED').length;

  return (
    <>
      <PageHeading
        title={b.label}
        subtitle={`Day 0 is ${new Date(b.start_date).toDateString()} · supervisor ${b.supervisor_name ?? '—'}`}
        right={
          <div className="flex items-center gap-2">
            <Chip tone={b.status === 'active' ? 'ok' : b.status === 'draft' ? 'inherit' : 'lock'}>
              {b.status}
            </Chip>
            {b.status === 'active' && (
              <button
                onClick={() => tick.mutate()}
                className="rounded border px-2 py-1.5 font-head text-[11px] font-600"
                style={{ borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
                title="Rest gates open on the server clock, never the device's"
              >
                Check rest timers
              </button>
            )}
            <Link
              to={`/admin/batch/${id}/schedule`}
              className="rounded px-3 py-2 font-head text-[12px] font-700"
              style={{ background: '#16794a', color: '#fff' }}
            >
              {b.status === 'draft' ? 'Open the schedule' : 'View the schedule'}
            </Link>
            {b.status === 'draft' && (
              <button
                onClick={() => activate.mutate()}
                disabled={activate.isPending}
                className="rounded border px-3 py-2 font-head text-[12px] font-700"
                style={{ borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
              >
                {activate.isPending ? 'Activating…' : 'Activate'}
              </button>
            )}
          </div>
        }
      />

      {error && (
        <div
          className="mb-4 rounded border px-3 py-2 text-[13px]"
          style={{ borderColor: 'var(--crit)', background: 'var(--crit-soft)', color: 'var(--crit)' }}
        >
          {error}
        </div>
      )}

      {b.status === 'draft' && (
        <div
          className="mb-4 rounded border px-3 py-2 text-[13px]"
          style={{ borderColor: 'var(--inherit)', background: 'var(--inherit-soft)', color: 'var(--inherit)' }}
        >
          This is still a draft. Activating freezes the plan — after that the targets cannot be
          quietly edited, and changes go through a deviation or a supervisor decision.
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Card className="p-3"><Stat label="Tasks" value={rows.length} compare={`${byDay.length} days with work`} /></Card>
        <Card className="p-3" rail="var(--accent)"><Stat label="Open now" value={ready} tone="accent" compare="ready or in progress" /></Card>
        <Card className="p-3" rail="var(--ok)"><Stat label="Done" value={done} tone="ok" compare={`of ${rows.length}`} /></Card>
        <Card className="p-3" rail={flagged ? 'var(--crit)' : undefined}>
          <Stat label="Needs attention" value={flagged} tone={flagged ? 'crit' : undefined} compare="deviation or blocked" />
        </Card>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <MovementMap batchId={id} />
        <EvidenceSummary batchId={id} />
      </div>

      <div className="flex flex-col gap-5">
        {byDay.map(([day, items]) => (
          <div key={day}>
            <div className="mb-2 flex flex-wrap items-baseline gap-2">
              <h2 className="font-head text-sm font-800 uppercase tracking-wide">Day {day}</h2>
              <span className="mono text-[11px] text-muted">
                {dateFor(b.start_date, day)} · {items.length} task{items.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
              {items.map((a) => (
                <TaskCard key={a.id} a={a} onOpen={() => setOpenTask(a.id)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {openTask && (
        <TaskDrawer
          activityId={openTask}
          batchStatus={b.status}
          onClose={() => setOpenTask(null)}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ['batch-activities', id] });
            qc.invalidateQueries({ queryKey: ['my-work'] });
          }}
        />
      )}
    </>
  );
}

const STATE_TONE: Record<string, 'ok' | 'warn' | 'crit' | 'accent' | 'inherit' | 'lock'> = {
  COMPLETED: 'ok',
  READY: 'accent',
  IN_PROGRESS: 'accent',
  SUBMITTED: 'accent',
  WAITING_TIME: 'inherit',
  WAITING_CONDITION: 'inherit',
  DEVIATION: 'crit',
  BLOCKED: 'crit',
  RETURNED: 'warn',
  LOCKED: 'lock',
  SKIPPED: 'lock',
  CANCELLED: 'lock',
  AWAITING_LAB: 'accent',
  AWAITING_SUPERVISOR: 'accent',
};

function TaskCard({ a, onOpen }: { a: BatchActivityRow; onOpen: () => void }) {
  const tone = STATE_TONE[a.state] ?? 'lock';
  const actionable = a.state === 'READY' || a.state === 'IN_PROGRESS' || a.state === 'RETURNED';
  const dur =
    a.day0_duration_hr != null
      ? `${a.day0_duration_hr} h`
      : a.duration_target_min_hr != null
        ? a.duration_target_min_hr === a.duration_target_max_hr
          ? `${a.duration_target_min_hr} h`
          : `${a.duration_target_min_hr}–${a.duration_target_max_hr} h`
        : null;

  return (
    <button
      onClick={onOpen}
      className="rounded-md border bg-surface p-3 text-left"
      style={{
        borderColor: 'var(--line)',
        borderLeftWidth: 3,
        borderLeftColor: `var(--${tone === 'accent' ? 'accent' : tone === 'lock' ? 'lock' : tone})`,
        opacity: a.state === 'LOCKED' ? 0.62 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-head text-[13px] font-700 leading-tight">{a.title}</p>
        <Chip tone={tone}>{a.state.replace(/_/g, ' ')}</Chip>
      </div>
      <p className="mt-0.5 mono text-[10px] text-muted">
        {a.code} · {a.scope_label}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {dur && <span className="mono text-[11px] text-ink2">{dur}</span>}
        {a.planned_qty_mt != null && (
          <span className="mono text-[11px] text-ink2">{a.planned_qty_mt} MT</span>
        )}
        {a.tbd_marker && <ConflictMarker id={a.tbd_marker} />}
      </div>

      {/* A blocked task always says why, on its face. */}
      {a.blocked_reason && (
        <p className="mt-2 text-[11px] leading-snug" style={{ color: 'var(--ink-2)' }}>
          {a.blocked_reason}
        </p>
      )}
      {actionable && (
        <p className="mt-2 font-head text-[11px] font-700" style={{ color: 'var(--accent)' }}>
          Open to record →
        </p>
      )}
    </button>
  );
}

function groupByDay(rows: BatchActivityRow[]): [number, BatchActivityRow[]][] {
  const m = new Map<number, BatchActivityRow[]>();
  for (const r of rows) {
    const list = m.get(r.rel_day) ?? [];
    list.push(r);
    m.set(r.rel_day, list);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

function dateFor(start: string, day: number) {
  const d = new Date(start);
  d.setDate(d.getDate() + day);
  return d.toDateString();
}

/**
 * PostgREST types a to-one embed as an array. At runtime it is an object for a foreign-key
 * relation and an array for a reverse one, so normalise rather than assume either.
 */
function one<T>(v: unknown): T | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return (v[0] as T) ?? null;
  return v as T;
}

/**
 * Where the material went, drawn.
 *
 * Read from the planned movements on each activity, in sequence. The paper system loses this
 * entirely — a bunker number written in one column and another in a different sheet, with
 * nothing joining them.
 */
function MovementMap({ batchId }: { batchId: string }) {
  const q = useQuery({
    queryKey: ['movement-map', batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batch_activity')
        .select(
          'code, title, scope_label, rel_day, seq, instance_no, state, source:location!batch_activity_source_location_id_fkey(label), destination:location!batch_activity_destination_location_id_fkey(label), machine:machine!batch_activity_assigned_machine_id_fkey(code)'
        )
        .eq('master_batch_id', batchId)
        .not('destination_location_id', 'is', null)
        .order('seq')
        .order('instance_no');
      if (error) throw error;
      return data ?? [];
    },
  });

  if (q.isLoading) return <Card className="p-4"><p className="text-sm text-muted">Loading…</p></Card>;

  const moves = (q.data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      rel_day: row.rel_day as number,
      scope_label: row.scope_label as string,
      state: row.state as string,
      source: one<{ label: string }>(row.source),
      destination: one<{ label: string }>(row.destination),
      machine: one<{ code: string }>(row.machine),
    };
  });

  if (moves.length === 0) {
    return (
      <Card className="p-4">
        <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
          Material movement
        </p>
        <div className="mt-3">
          <EmptyState
            title="No vessels chosen yet"
            detail="Pick a destination bunker on the schedule and the path appears here, with the machine that carried it."
          />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
        Material movement · {moves.length} moves
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {moves.map((m, i) => (
          <div key={i} className="flex flex-wrap items-center gap-1.5">
            <span className="mono w-14 shrink-0 text-[10px] text-muted">Day {m.rel_day}</span>
            <span
              className="mono rounded border px-1.5 py-0.5 text-[11px]"
              style={{ borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
            >
              {m.source?.label ?? 'Yard'}
            </span>
            <span className="mono text-[12px]" style={{ color: '#16794a' }}>──►</span>
            {m.machine && (
              <>
                <span
                  className="mono rounded border px-1.5 py-0.5 text-[10px]"
                  style={{ borderColor: 'var(--line-2)', color: 'var(--muted)' }}
                >
                  {m.machine.code}
                </span>
                <span className="mono text-[12px]" style={{ color: '#16794a' }}>──►</span>
              </>
            )}
            <span
              className="mono rounded border px-1.5 py-0.5 text-[11px] font-600"
              style={{
                borderColor: m.state === 'COMPLETED' ? '#16794a' : 'var(--line-2)',
                background: m.state === 'COMPLETED' ? 'var(--ok-soft)' : 'transparent',
                color: m.state === 'COMPLETED' ? '#16794a' : 'var(--ink)',
              }}
            >
              {m.destination?.label ?? 'Out'}
            </span>
            <span className="text-[10px] text-muted">{m.scope_label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Evidence, counted and named.
 *
 * The count is only meaningful because requirements are named: "8 / 10" plus the two that
 * are actually missing, rather than a photo tally nobody can act on.
 */
function EvidenceSummary({ batchId }: { batchId: string }) {
  const q = useQuery({
    queryKey: ['evidence-summary', batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batch_activity_evidence_req')
        .select(
          'id, label, min_count, satisfied_count, gates_submission, batch_activity!inner(title, scope_label, rel_day, state, master_batch_id)'
        )
        .eq('batch_activity.master_batch_id', batchId)
        .order('ordering');
      if (error) throw error;
      return data ?? [];
    },
  });

  if (q.isLoading) return <Card className="p-4"><p className="text-sm text-muted">Loading…</p></Card>;

  const rows = (q.data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const ba = one<{ scope_label: string; rel_day: number; state: string }>(row.batch_activity);
    return {
      id: row.id as string,
      label: row.label as string,
      min_count: row.min_count as number,
      satisfied_count: row.satisfied_count as number,
      rel_day: ba?.rel_day ?? 0,
      scope_label: ba?.scope_label ?? '',
      state: ba?.state ?? 'LOCKED',
    };
  });

  const total = rows.length;
  const done = rows.filter((r) => r.satisfied_count >= r.min_count).length;

  // Only what is outstanding on work that has actually started. A photo missing on Day 22 is
  // not news on Day 1.
  const outstanding = rows.filter(
    (r) =>
      r.satisfied_count < r.min_count &&
      ['READY', 'IN_PROGRESS', 'DEVIATION', 'RETURNED'].includes(r.state)
  );

  return (
    <Card className="p-4" rail={done === total && total > 0 ? '#16794a' : undefined}>
      <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
        Evidence
      </p>
      <div className="mt-2 flex items-end gap-4">
        <Stat
          label="Complete"
          value={`${done} / ${total}`}
          tone={done === total && total > 0 ? 'ok' : undefined}
          compare="named requirements, individually satisfied"
          size="lg"
        />
      </div>
      <div className="mt-3">
        <Bar value={done} max={Math.max(total, 1)} tone={done === total ? 'ok' : 'accent'} />
      </div>

      {outstanding.length > 0 ? (
        <div className="mt-3">
          <p className="font-head text-[10px] font-600 uppercase tracking-wider text-muted">
            Outstanding on work in progress
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {outstanding.slice(0, 8).map((r) => (
              <li key={r.id} className="text-[12px]" style={{ color: 'var(--ink-2)' }}>
                <span className="mono text-[10px] text-muted">
                  Day {r.rel_day} · {r.scope_label}
                </span>{' '}
                — {r.label}
              </li>
            ))}
            {outstanding.length > 8 && (
              <li className="text-[11px] text-muted">and {outstanding.length - 8} more</li>
            )}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-muted">
          Nothing outstanding on work that has started.
        </p>
      )}
    </Card>
  );
}
