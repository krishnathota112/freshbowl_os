import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { BatchRow } from '../../../shared/api/batch';
import { supabase } from '../../../shared/api/client';
import { useAuth } from '../../../shared/auth/auth';
import { humanError } from '../../../shared/utils/humanError';
import { Chip } from '../../../shared/ui/primitives';

/**
 * Admin · clear the batch list in one go (owner request, 16 Sep 2026).
 *
 * Uses only the two server calls that already exist, one batch at a time, so every rule still holds:
 *   · `cancel_batch`        — any open batch the Admin ticks. It leaves the record (audited) and drops off the screens.
 *   · `admin_delete_batch`  — DEMO / TEST batches only, open or cancelled. The server refuses a real batch.
 * Real batches are listed but never pre-ticked. A real cancelled batch cannot be deleted; it stays hidden.
 */
const CONFIRM_WORD = 'CLEAR';

type Outcome = { code: string; action: 'cancelled' | 'deleted'; ok: boolean; detail?: string };

export function ClearBatchesPanel({ batches }: { batches: BatchRow[] }) {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const open_ = useMemo(() => batches.filter((b) => b.status === 'draft' || b.status === 'active' || b.status === 'validated'), [batches]);
  const demoAll = useMemo(() => batches.filter((b) => b.is_demo && b.status !== 'closed'), [batches]);
  const realCancelled = batches.filter((b) => !b.is_demo && b.status === 'cancelled').length;

  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const isPicked = (b: BatchRow) => picked[b.id] ?? Boolean(b.is_demo);
  const [deleteDemo, setDeleteDemo] = useState(true);
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');

  const toCancel = open_.filter(isPicked);
  // demo batches that will be deleted: every demo batch that is cancelled already, plus the demo ones being cancelled now
  const toDelete = deleteDemo
    ? demoAll.filter((b) => b.status === 'cancelled' || toCancel.some((c) => c.id === b.id))
    : [];
  const realPicked = toCancel.filter((b) => !b.is_demo);

  const run = useMutation({
    mutationFn: async () => {
      const out: Outcome[] = [];
      const why = reason.trim() || 'Batch list cleared by Admin';
      for (const b of toCancel) {
        const { error } = await supabase.rpc('cancel_batch', { p_batch: b.id, p_reason: why });
        out.push({ code: b.code, action: 'cancelled', ok: !error, detail: error ? humanError(error).detail || error.message : undefined });
      }
      for (const b of toDelete) {
        // a demo batch that failed to cancel is left alone
        if (out.some((o) => o.code === b.code && !o.ok)) continue;
        const { error } = await supabase.rpc('admin_delete_batch', { p_batch: b.id, p_confirm_code: b.code });
        out.push({ code: b.code, action: 'deleted', ok: !error, detail: error ? humanError(error).detail || error.message : undefined });
      }
      return out;
    },
    onSettled: () => {
      setTyped('');
      setPicked({});
      for (const k of ['batches', 'batch-progress', 'admin-home', 'batch-monitor', 'my-work']) qc.invalidateQueries({ queryKey: [k] });
    },
  });

  if (role !== 'admin') return null;
  if (open_.length === 0 && demoAll.length === 0 && !run.data) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { run.reset(); setOpen(true); }}
        className="inline-flex items-center rounded border px-3 py-1.5 font-head text-[13px] font-700"
        style={{ minHeight: 44, borderColor: 'var(--crit)', color: 'var(--crit)' }}
      >
        Clear batches…
      </button>
    );
  }

  const nothing = toCancel.length === 0 && toDelete.length === 0;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4" style={{ background: 'rgba(0,0,0,0.35)' }}>
      <div className="mt-10 w-full max-w-xl rounded-xl border bg-surface p-5" style={{ borderColor: 'var(--crit)' }} role="dialog" aria-label="Clear batches">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-head text-[18px] font-800" style={{ color: 'var(--crit)' }}>Clear batches</h2>
          <button type="button" onClick={() => setOpen(false)} className="font-head text-[14px] font-700 text-ink2" style={{ minHeight: 36 }}>Close ✕</button>
        </div>

        {run.data ? (
          <>
            <ul className="mt-3 grid gap-1 text-[14px]">
              {run.data.map((o) => (
                <li key={`${o.action}-${o.code}`} className="flex gap-2">
                  <span style={{ color: o.ok ? 'var(--ok)' : 'var(--crit)' }}>{o.ok ? '✓' : '✗'}</span>
                  <span><span className="mono">{o.code}</span> {o.ok ? o.action : `not ${o.action}`}{o.detail && <span className="text-muted"> — {o.detail}</span>}</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setOpen(false)} className="mt-4 rounded-lg px-4 font-head text-[14px] font-800"
                    style={{ minHeight: 44, background: 'var(--accent)', color: 'var(--on-accent)' }}>
              Done
            </button>
          </>
        ) : (
          <>
            <h3 className="mt-3 font-head text-[13px] font-800 uppercase tracking-wide">1 · Cancel open batches</h3>
            {open_.length === 0 ? (
              <p className="text-[14px] text-muted">No open batches.</p>
            ) : (
              <ul className="mt-1 grid gap-1">
                {open_.map((b) => (
                  <li key={b.id}>
                    <label className="flex items-center gap-2 text-[14px]" style={{ minHeight: 36 }}>
                      <input type="checkbox" className="h-5 w-5" checked={isPicked(b)}
                             onChange={(e) => setPicked((p) => ({ ...p, [b.id]: e.target.checked }))} />
                      <span className="mono font-700">{b.code}</span>
                      <Chip tone={b.status === 'active' ? 'ok' : 'inherit'}>{b.status}</Chip>
                      {b.is_demo ? <Chip tone="warn">DEMO / TEST</Chip> : <Chip tone="crit">REAL</Chip>}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {realPicked.length > 0 && (
              <p className="mt-2 rounded-md p-2 text-[13px] font-600" style={{ background: 'var(--crit-soft)', color: 'var(--crit)' }}>
                {realPicked.map((b) => b.code).join(', ')} {realPicked.length === 1 ? 'is a real batch' : 'are real batches'}.
                Cancelling stops all their open work and cannot be undone. Their history stays on record.
              </p>
            )}

            <h3 className="mt-4 font-head text-[13px] font-800 uppercase tracking-wide">2 · Delete demo / test batches</h3>
            <label className="mt-1 flex items-center gap-2 text-[14px]">
              <input type="checkbox" className="h-5 w-5" checked={deleteDemo} onChange={(e) => setDeleteDemo(e.target.checked)} />
              Permanently delete {toDelete.length} demo / test batch(es), with their tasks, readings and photos
            </label>
            <p className="mt-1 text-[12px] text-muted">
              Real batches are never deleted — the server refuses it.
              {realCancelled > 0 && ` ${realCancelled} real cancelled batch(es) stay on record, hidden from the list.`}
            </p>

            <h3 className="mt-4 font-head text-[13px] font-800 uppercase tracking-wide">3 · Confirm</h3>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (recorded) — e.g. clearing test data before go-live"
                   className="mt-1 w-full rounded-md border bg-surface px-3 text-[14px]" style={{ minHeight: 44, borderColor: 'var(--line-2)' }} />
            <label className="mt-2 block text-[13px] text-ink2" htmlFor="clear-confirm">
              Type <strong className="mono">{CONFIRM_WORD}</strong> to cancel {toCancel.length} and delete {toDelete.length}
            </label>
            <input id="clear-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off"
                   className="mono mt-1 w-full max-w-xs rounded-md border bg-surface px-3 text-[15px]" style={{ minHeight: 44, borderColor: 'var(--line-2)' }} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={nothing || typed !== CONFIRM_WORD || run.isPending} onClick={() => run.mutate()}
                      className="rounded-lg px-4 font-head text-[14px] font-800 disabled:opacity-40"
                      style={{ minHeight: 48, background: 'var(--crit)', color: '#fff' }}>
                {run.isPending ? 'Clearing…' : `Clear ${toCancel.length + toDelete.length} batch action(s)`}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-4 font-head text-[14px] font-700"
                      style={{ minHeight: 48, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}>
                Keep everything
              </button>
            </div>
            {run.error && <p className="mt-2 text-[13px]" style={{ color: 'var(--crit)' }}>{humanError(run.error).detail || (run.error as Error).message}</p>}
          </>
        )}
      </div>
    </div>
  );
}
