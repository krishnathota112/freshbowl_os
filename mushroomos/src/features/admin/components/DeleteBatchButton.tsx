import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { supabase } from '../../../shared/api/client';
import { useAuth } from '../../../shared/auth/auth';
import { humanError } from '../../../shared/utils/humanError';

/**
 * Admin · delete a DEMO / TEST batch (spec §16, migration 0112). Two confirmations: open the panel, then retype
 * the batch code. The server refuses a production batch and points at Cancel; it also refuses any role but Admin.
 */
export function DeleteBatchButton({ batchCode, batchId, isDemo, onDeleted }: {
  batchCode: string;
  batchId: string;
  isDemo: boolean;
  onDeleted: () => void;
}) {
  const { role } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  const del = useMutation({
    mutationFn: async () => {
      const { data, error: e } = await supabase.rpc('admin_delete_batch', { p_batch: batchId, p_confirm_code: typed });
      if (e) throw e;
      return data;
    },
    onSuccess: () => {
      setOpen(false);
      setTyped('');
      onDeleted();
    },
    onError: (e) => {
      const h = humanError(e);
      setError(h.detail || h.title || (e as Error).message);
    },
  });

  if (role !== 'admin' || !isDemo) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setError(null); setOpen(true); }}
        className="rounded-lg border px-3 font-head text-[13px] font-700"
        style={{ minHeight: 44, borderColor: 'var(--crit)', color: 'var(--crit)' }}
      >
        Delete this test batch
      </button>
    );
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--crit)', background: 'var(--crit-soft)' }}>
      <p className="font-head text-[15px] font-800" style={{ color: 'var(--crit)' }}>Delete {batchCode}?</p>
      <p className="mt-1 text-[13px] text-ink2">
        This removes the batch and everything recorded on it — tasks, readings, photographs and Lab work. It cannot be
        undone. Only DEMO / TEST batches can be deleted; a real batch must be cancelled instead, so its history stays.
      </p>
      <label className="mt-3 block text-[13px] text-ink2" htmlFor="del-confirm">Type <strong className="mono">{batchCode}</strong> to confirm</label>
      <input
        id="del-confirm"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        className="mono mt-1 w-full max-w-xs rounded-lg border bg-surface px-3 text-[15px]"
        style={{ minHeight: 44, borderColor: 'var(--line-2)' }}
        autoComplete="off"
      />
      {error && <p className="mt-2 text-[13px] font-600" style={{ color: 'var(--crit)' }}>{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={typed !== batchCode || del.isPending}
          onClick={() => del.mutate()}
          className="rounded-lg px-4 font-head text-[14px] font-800 disabled:opacity-40"
          style={{ minHeight: 44, background: 'var(--crit)', color: '#fff' }}
        >
          {del.isPending ? 'Deleting…' : 'Delete for good'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setTyped(''); setError(null); }}
          className="rounded-lg border px-4 font-head text-[14px] font-700"
          style={{ minHeight: 44, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
