import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { bulkAssign, type BulkAssignResult, type CrewRow, type Person } from '../../features/admin/api/intake';
import { ErrorPanel } from '../../shared/ui/feedback/ErrorPanel';

/**
 * S4 · Assign the crew — `UI-004`, finding F33.
 *
 * Activating one PROCESS-2026C batch meant opening a per-row menu ninety-three times. This assigns
 * everyone the process holds responsible for a role in one action.
 *
 * IT IS NOT A NEW MECHANISM. `assign_activity` takes ONE activity and there is no bulk RPC; this
 * loops over the existing contract, so every row is authorised, audited and notified exactly as
 * before. A refusal is reported against its own row and the rest carry on — a half-assigned batch
 * that says which rows failed is honest; one that rolls back silently is not.
 *
 * A running batch needs a reason for a forced assignment. The server requires it, so the field
 * appears; the screen does not pretend to know when it is needed.
 */
export function BulkAssign({
  crew,
  people,
  batchIsActive,
  onDone,
}: {
  crew: CrewRow[];
  people: Person[];
  batchIsActive: boolean;
  onDone: () => void;
}) {
  const open = crew.filter((c) => c.activityIds.length > 0);

  return (
    <div className="grid gap-3">
      {crew.length === 0 && <p className="text-[14px] text-muted">This batch has no activities yet.</p>}
      {crew.length > 0 && open.length === 0 && (
        <p className="text-[14px]" style={{ color: 'var(--ok)' }}>
          Everyone is assigned — {crew.reduce((n, c) => n + c.assigned, 0)} activities.
        </p>
      )}
      {open.map((c) => (
        <RoleRow
          key={c.role}
          crew={c}
          people={people}
          batchIsActive={batchIsActive}
          onDone={onDone}
        />
      ))}
    </div>
  );
}

function RoleRow({
  crew,
  people,
  batchIsActive,
  onDone,
}: {
  crew: CrewRow;
  people: Person[];
  batchIsActive: boolean;
  onDone: () => void;
}) {
  const [personId, setPersonId] = useState<string>(people[0]?.id ?? '');
  const [reason, setReason] = useState<string>('');
  const [done, setDone] = useState<number>(0);

  // People whose own role matches what the process holds responsible, then everyone else — a
  // supervisor genuinely does operator work, so the list narrows rather than excludes.
  const matching = people.filter((p) => p.role === crew.role);
  const others = people.filter((p) => p.role !== crew.role);

  const run = useMutation<BulkAssignResult, Error>({
    mutationFn: () => {
      if (personId === '') throw new Error('Choose who is doing this work.');
      if (batchIsActive && reason.trim() === '') {
        throw new Error('This batch is already running, so an assignment needs a reason.');
      }
      setDone(0);
      return bulkAssign(crew.activityIds, personId, batchIsActive ? reason.trim() : null, setDone);
    },
    onSuccess: onDone,
  });

  const result = run.data;

  return (
    <div className="rounded-lg border bg-surface p-4" style={{ borderColor: 'var(--line)' }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-head text-[16px] font-800 capitalize">{crew.role.replace('_', ' ')}</span>
        <span className="mono text-[13px] text-muted">
          {crew.assigned} of {crew.total} assigned
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <label className="text-[12px] text-muted">Assign all {crew.total} activities to</label>
        <select
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          className="rounded border bg-surface px-2.5 py-1.5 text-[13px]"
          style={{ borderColor: 'var(--line-2)' }}
        >
          {matching.length > 0 && (
            <optgroup label={`${crew.role.replace('_', ' ')}s`}>
              {matching.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </optgroup>
          )}
          {others.length > 0 && (
            <optgroup label="Other roles">
              {others.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} ({p.role.replace('_', ' ')})
                </option>
              ))}
            </optgroup>
          )}
        </select>

        {batchIsActive && (
          <label className="flex flex-col gap-1 text-[12px] text-muted">
            Reason for reassigning a running batch
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Shift changeover"
              className="rounded border bg-surface px-2.5 py-1 text-[13px]"
              style={{ borderColor: 'var(--line-2)' }}
            />
          </label>
        )}
      </div>

      <button
        onClick={() => run.mutate()}
        disabled={run.isPending}
        className="mt-3 w-full rounded px-3 py-1.5 font-head text-[13px] font-700"
        style={{
          background: 'var(--accent)',
          color: 'var(--accent-ink)',
          opacity: run.isPending ? 0.6 : 1,
        }}
      >
        {run.isPending ? `Assigning… ${done} / ${crew.total}` : `Assign all ${crew.total}`}
      </button>

      {run.error && (
        <div className="mt-2">
          <ErrorPanel error={run.error} prefix="Nobody was assigned." />
        </div>
      )}

      {result && (
        <div className="mt-2 text-[13px]">
          <p style={{ color: result.failures.length === 0 ? 'var(--ok)' : 'var(--warn)' }}>
            {result.assigned} assigned
            {result.failures.length > 0 && `, ${result.failures.length} refused`}.
          </p>
          {result.failures.slice(0, 3).map((f: { activityId: string; message: string }) => (
            <p key={f.activityId} className="mt-0.5 text-muted">
              {f.message}
            </p>
          ))}
          {result.failures.length > 3 && (
            <p className="mt-0.5 text-muted">…and {result.failures.length - 3} more with the same shape.</p>
          )}
        </div>
      )}
    </div>
  );
}
