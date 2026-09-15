import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { supabase } from '../../api/client';
import { humanError } from '../../utils/humanError';

/**
 * Admin failsafe on one task (0105). For when the app or a phone failed on a real batch: open a stuck task, record
 * work done on the floor, or reopen a task finished by mistake. Every repair needs a written reason and is shown to
 * the GM under "Overrides and decisions".
 */
export function AdminFixPanel({ activityId, state, onChanged }: { activityId: string; state: string; onChanged: () => void }) {
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const canOpen = ['LOCKED', 'BLOCKED', 'WAITING_TIME', 'WAITING_CONDITION'].includes(state);
  const canDone = !['COMPLETED', 'SKIPPED', 'CANCELLED'].includes(state);
  const canReopen = ['COMPLETED', 'SKIPPED', 'DEVIATION'].includes(state);

  const run = useMutation({
    mutationFn: async (fn: 'admin_force_open' | 'admin_mark_done' | 'admin_reopen_task') => {
      const { error } = await supabase.rpc(fn, { p_activity: activityId, p_reason: reason });
      if (error) throw error;
      return fn;
    },
    onSuccess: (fn) => {
      setMsg({
        ok: true,
        text: fn === 'admin_force_open' ? 'Task opened.' : fn === 'admin_mark_done' ? 'Marked done. The next steps open.' : 'Task reopened.',
      });
      setReason('');
      onChanged();
    },
    onError: (e) => {
      const h = humanError(e);
      setMsg({ ok: false, text: h.detail || h.title || (e as Error).message });
    },
  });

  const short = reason.trim().length < 10;
  const button = (label: string, fn: 'admin_force_open' | 'admin_mark_done' | 'admin_reopen_task', danger?: boolean) => (
    <button
      type="button"
      disabled={short || run.isPending}
      onClick={() => {
        if (window.confirm(`${label}? This is recorded with your name and reason, and the GM sees it.`)) run.mutate(fn);
      }}
      className="rounded-lg border px-3 font-head text-[14px] font-700 disabled:opacity-40"
      style={{ minHeight: 44, borderColor: danger ? 'var(--crit)' : 'var(--accent)', color: danger ? 'var(--crit)' : 'var(--accent-ink)' }}
    >
      {label}
    </button>
  );

  return (
    <section className="mb-5 rounded-xl border p-4" style={{ borderColor: 'var(--warn)', background: 'var(--warn-soft)' }}>
      <p className="font-head text-[15px] font-800">Fix this task (Admin)</p>
      <p className="mt-0.5 text-[13px] text-ink2">
        Use only when the app or a phone failed. Write what really happened — it stays on the record.
      </p>
      <label className="sr-only" htmlFor={`fix-${activityId}`}>Reason</label>
      <textarea
        id={`fix-${activityId}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="e.g. Phone died; wetting done 06:00–09:00 by Ramarao, checked by me"
        className="mt-2 w-full rounded-lg border bg-surface px-3 py-2 text-[14px]"
        style={{ borderColor: 'var(--line-2)' }}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {canOpen && button('Open this task now', 'admin_force_open')}
        {canDone && button('Mark as done (work was done)', 'admin_mark_done')}
        {canReopen && button('Reopen this task', 'admin_reopen_task', true)}
      </div>
      {short && <p className="mt-1 text-[12px] text-muted">Write at least 10 characters to enable the buttons.</p>}
      {msg && <p className="mt-2 text-[13px] font-600" style={{ color: msg.ok ? 'var(--ok)' : 'var(--crit)' }}>{msg.text}</p>}
    </section>
  );
}
