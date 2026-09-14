import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { factoryInstant } from '../api/batch';
import { evidenceNeeds, markRunning, recordHistory, type HistoryOutcome } from '../api/intake';
import { loadSchedule, type ScheduleRow } from '../api/schedule';
import { getBatchContext } from '../api/work';
import { ErrorPanel } from '../components/field/ErrorPanel';
import { fmtWhen, labStatus } from '../components/field/labWords';
import { Chip, Skeleton } from '../components/primitives';
import { useAuth } from '../lib/auth';

/**
 * Onboarding a batch the factory is already running. `WORKSTATIONS.md` §4, the ONGOING door.
 *
 * WHAT THIS IS
 *   A helper for one moment: MushroomOS is introduced while a batch is mid-flight, and somebody has
 *   to tell it where that batch has got to. It adds no authority and no new server behaviour — it
 *   calls `submit_activity` with stated times (the paper-slip path) and `start_activity` +
 *   `correct_actual` for work that is running now.
 *
 * WHAT IT REFUSES TO DO
 *   Pretend. Three rules of the unchanged backend shape this screen, and each is said out loud:
 *
 *   · Only a SUPERVISOR (or a lab technician, for lab checkpoints) may state a past time. An admin
 *     is refused by the server, so the screen tells an admin that plainly instead of offering
 *     buttons that will fail.
 *   · An activity whose required photograph is missing is NOT completed — the times are recorded and
 *     it stays open. Historical work has no photograph, so this is the ordinary outcome here, and
 *     the row says so in the server's own words.
 *   · Nothing is written twice: a row that has been recorded shows what the server now holds.
 *
 * The normal operator flow — START, work, COMPLETE — is untouched and lives somewhere else. What
 * MushroomOS watched and what it was told about must never look the same.
 */
export function OnboardBatch() {
  const { id = '' } = useParams();
  const { role } = useAuth();
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);

  const batch = useQuery({ queryKey: ['batch-context', id], queryFn: () => getBatchContext(id) });
  const rows = useQuery({ queryKey: ['schedule', id], queryFn: () => loadSchedule(id) });
  const needs = useQuery({ queryKey: ['evidence-needs', id], queryFn: () => evidenceNeeds(id) });

  const refresh = () => {
    for (const k of ['schedule', 'evidence-needs', 'batch-context', 'admin-home']) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  };

  const canRecord = role === 'supervisor' || role === 'lab_tech';

  const back = (
    <Link
      to="/admin"
      className="mb-3 inline-flex items-center rounded-md border px-4 font-head text-[14px] font-700 no-underline"
      style={{ minHeight: 48, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
    >
      ← Admin
    </Link>
  );

  const all = rows.data ?? [];
  const recorded = all.filter((r) => r.actual_end !== null || r.actual_start !== null);
  const byDay = useMemo(() => {
    const visible = showAll ? all : all.filter((r) => r.actual_end === null);
    const m = new Map<number, ScheduleRow[]>();
    for (const r of visible) {
      const list = m.get(r.rel_day) ?? [];
      list.push(r);
      m.set(r.rel_day, list);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [all, showAll]);

  if (batch.isLoading || rows.isLoading) {
    return (
      <>
        {back}
        <Skeleton label="Opening the batch" lines={5} />
      </>
    );
  }
  if (batch.error || rows.error || !batch.data) {
    return (
      <>
        {back}
        <ErrorPanel
          error={batch.error ?? rows.error}
          prefix="This batch could not be opened."
          onRetry={() => {
            batch.refetch();
            rows.refetch();
          }}
        />
      </>
    );
  }

  const b = batch.data;

  return (
    <>
      {back}

      <header className="mb-4">
        <h1 className="font-head text-[22px] font-800 leading-tight">Where has {b.code} got to?</h1>
        <p className="mt-1 text-[14px] text-ink2">
          <span className="mono">{b.process_code}</span>
          {b.standard_hr !== null && <> · standard H{b.standard_hr}</>}
          {b.h0 && <> · H0 {fmtWhen(b.h0)}</>}
        </p>
        <p className="mt-0.5 text-[13px] text-muted">
          {recorded.length} of {all.length} activities have times on record.
        </p>
      </header>

      <div
        className="mb-5 rounded-lg border px-4 py-3 text-[14px] leading-relaxed"
        style={{ borderColor: 'var(--line-2)', background: 'var(--surface-2)', color: 'var(--ink-2)' }}
      >
        This records work the factory did <strong>before MushroomOS was watching</strong>. Entries are
        marked as stated by the person recording them — they are never presented as work done through
        the app. Anything from here on is recorded normally, by the people doing it.
      </div>

      {!canRecord && (
        <div
          className="mb-5 rounded-lg border px-4 py-3 text-[14px] leading-relaxed"
          style={{ borderColor: 'var(--warn)', background: 'var(--warn-soft)', color: 'var(--ink)' }}
        >
          <strong>Recording past work needs a supervisor.</strong> The server accepts a stated time
          only from a supervisor — or a lab technician, for a lab checkpoint — and refuses everyone
          else, including an admin. You can see the position below; sign in as the supervisor to
          record it.
        </div>
      )}

      <label className="mb-4 flex items-center gap-2 text-[13px] text-ink2">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        Show activities that already have times
      </label>

      {byDay.length === 0 && (
        <p className="text-[14px] text-muted">Every activity already has times on record.</p>
      )}

      {byDay.map(([day, list]) => (
        <section key={day} className="mb-6">
          <h2 className="mb-2 font-head text-[12px] font-800 uppercase tracking-wider text-muted">
            Day {day}
          </h2>
          <div className="grid gap-2">
            {list.map((r) => (
              <ActivityRow
                key={r.id}
                row={r}
                need={needs.data?.get(r.id) ?? null}
                canRecord={canRecord}
                onDone={refresh}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

type Mode = null | 'done' | 'running';

function ActivityRow({
  row,
  need,
  canRecord,
  onDone,
}: {
  row: ScheduleRow;
  need: { required: number; satisfied: number } | null;
  canRecord: boolean;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [outcome, setOutcome] = useState<HistoryOutcome | null>(null);

  const status = labStatus(row.state, null, null);
  const photoShort = need !== null && need.satisfied < need.required;
  const open = ['READY', 'IN_PROGRESS', 'RETURNED'].includes(row.state);

  return (
    <div className="rounded-lg border bg-surface p-4" style={{ borderColor: 'var(--line)' }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-head text-[15px] font-800 leading-snug">{row.title}</p>
          <p className="mt-0.5 text-[13px] text-muted">
            {row.scope_label}
            {row.planned_start_at && <> · planned {fmtWhen(row.planned_start_at)}</>}
          </p>
        </div>
        <Chip tone={status.tone}>{status.label}</Chip>
      </div>

      {(row.actual_start || row.actual_end) && (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--ok)' }}>
          {row.actual_start && <>Started {fmtWhen(row.actual_start)}</>}
          {row.actual_start && row.actual_end && ' · '}
          {row.actual_end && <>Finished {fmtWhen(row.actual_end)}</>}
        </p>
      )}

      {photoShort && open && (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--warn)' }}>
          The process requires a photograph here ({need!.satisfied} of {need!.required}). MushroomOS
          cannot mark this complete from this screen — the times can still be recorded, and the
          activity stays open for whoever finishes it.
        </p>
      )}

      {outcome && <Outcome outcome={outcome} />}

      {canRecord && open && mode === null && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode('done')}
            className="rounded-md border font-head text-[14px] font-700"
            style={{ minHeight: 48, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
          >
            Already done
          </button>
          <button
            type="button"
            onClick={() => setMode('running')}
            className="rounded-md border font-head text-[14px] font-700"
            style={{ minHeight: 48, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
          >
            Running now
          </button>
        </div>
      )}

      {canRecord && mode !== null && (
        <RecordForm
          row={row}
          mode={mode}
          onCancel={() => setMode(null)}
          onResult={(o) => {
            setOutcome(o);
            setMode(null);
            onDone();
          }}
        />
      )}
    </div>
  );
}

function Outcome({ outcome }: { outcome: HistoryOutcome }) {
  if (outcome.kind === 'completed') {
    return (
      <p className="mt-2 text-[13px]" style={{ color: 'var(--ok)' }}>
        Recorded as completed.
      </p>
    );
  }
  if (outcome.kind === 'held') {
    return (
      <p className="mt-2 text-[13px]" style={{ color: 'var(--warn)' }}>
        The times are on record, but the activity is not complete — {outcome.outstanding}.
      </p>
    );
  }
  return (
    <div className="mt-2">
      <ErrorPanel error={new Error(outcome.message)} prefix="Nothing was recorded." />
    </div>
  );
}

/**
 * The form for one entry. Dates and times become real instants through `factory_instant`, the same
 * server function H0 uses — never a locally-built timestamp, which is silently wrong across a DST
 * boundary and would be frozen into the record.
 */
function RecordForm({
  row,
  mode,
  onCancel,
  onResult,
}: {
  row: ScheduleRow;
  mode: 'done' | 'running';
  onCancel: () => void;
  onResult: (o: HistoryOutcome) => void;
}) {
  const base = row.planned_start_at ? new Date(row.planned_start_at) : new Date();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  const [startDate, setStartDate] = useState(iso(base));
  const [startTime, setStartTime] = useState(hhmm(base));
  const [endDate, setEndDate] = useState(iso(base));
  const [endTime, setEndTime] = useState(hhmm(new Date(base.getTime() + 3_600_000)));
  const [note, setNote] = useState('');

  const run = useMutation({
    mutationFn: async (): Promise<HistoryOutcome> => {
      if (note.trim().length < 5) {
        throw new Error('Say where this came from — the log sheet, the supervisor, the weighbridge slip.');
      }
      const startAt = await factoryInstant(startDate, startTime);
      if (startAt === null) throw new Error('The factory timezone is not set, so this time cannot be recorded.');

      if (mode === 'running') {
        await markRunning({ activityId: row.id, realStart: startAt, reason: note.trim() });
        return { kind: 'completed' };
      }
      const endAt = await factoryInstant(endDate, endTime);
      if (endAt === null) throw new Error('The factory timezone is not set, so this time cannot be recorded.');
      return recordHistory({ activityId: row.id, actualStart: startAt, actualEnd: endAt, remark: note.trim() });
    },
    onSuccess: onResult,
  });

  return (
    <div className="mt-3 rounded-md border p-3" style={{ borderColor: 'var(--line-2)', background: 'var(--surface-2)' }}>
      <p className="mb-2 font-head text-[13px] font-800 uppercase tracking-wider text-muted">
        {mode === 'done' ? 'When was it done?' : 'When did it start?'}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 text-[13px] text-ink2">{mode === 'done' ? 'Started' : 'Started'}</span>
        <input
          type="date"
          aria-label="Start date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded-md border bg-surface px-2 text-[15px]"
          style={{ minHeight: 48, borderColor: 'var(--line-2)' }}
        />
        <input
          type="time"
          aria-label="Start time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="rounded-md border bg-surface px-2 text-[15px]"
          style={{ minHeight: 48, borderColor: 'var(--line-2)' }}
        />
      </div>

      {mode === 'done' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="w-16 text-[13px] text-ink2">Finished</span>
          <input
            type="date"
            aria-label="Finish date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border bg-surface px-2 text-[15px]"
            style={{ minHeight: 48, borderColor: 'var(--line-2)' }}
          />
          <input
            type="time"
            aria-label="Finish time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="rounded-md border bg-surface px-2 text-[15px]"
            style={{ minHeight: 48, borderColor: 'var(--line-2)' }}
          />
        </div>
      )}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Where does this come from? e.g. day log sheet, checked with M. Rao"
        className="mt-2 w-full rounded-md border bg-surface px-3 text-[15px]"
        style={{ minHeight: 48, borderColor: 'var(--line-2)' }}
        aria-label="Where this information came from"
      />

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={run.isPending}
          className="rounded-md border font-head text-[14px] font-700 disabled:opacity-50"
          style={{ minHeight: 48, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => run.mutate()}
          disabled={run.isPending}
          className="rounded-md font-head text-[14px] font-800 disabled:opacity-50"
          style={{ minHeight: 48, background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          {run.isPending ? 'Recording…' : 'Record it'}
        </button>
      </div>

      {run.error && (
        <div className="mt-2">
          <ErrorPanel error={run.error} prefix="Nothing was recorded." />
        </div>
      )}
    </div>
  );
}
