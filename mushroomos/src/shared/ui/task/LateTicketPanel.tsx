import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { signedEvidenceUrl } from '../../api/batch';
import {
  TICKET_STATUS_WORDS,
  attachTicketPhoto,
  isActivityOverdue,
  listTicketsForActivity,
  raiseTicket,
  type Ticket,
} from '../../api/tickets';
import { CaptureCancelled, assertIsImage, cameraIsGuaranteed, takeNativePhoto } from '../../camera/camera';
import { useAuth } from '../../auth/auth';
import { humanError } from '../../utils/humanError';
import { Chip } from '../primitives';

/**
 * Late-task ticket, for the person doing the work (Supervisor or Lab). 0088.
 *
 * Shows the task's tickets and their Admin decisions. While the task is open and nothing is waiting for
 * Admin, the worker can raise one: why it is late, how many more hours, and photos taken with the
 * phone's camera. Only Admin decides.
 */
export function LateTicketPanel({
  batchId,
  activityId,
  taskOpen,
}: {
  batchId: string;
  activityId: string;
  /** READY / IN_PROGRESS / RETURNED — work that can still be late. */
  taskOpen: boolean;
}) {
  const qc = useQueryClient();
  const { role } = useAuth();
  const mayRaise = role === 'supervisor' || role === 'lab_tech';
  const [form, setForm] = useState(false);
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [pickError, setPickError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const tickets = useQuery({ queryKey: ['tickets', activityId], queryFn: () => listTicketsForActivity(activityId) });
  const overdue = useQuery({ queryKey: ['overdue', activityId], queryFn: () => isActivityOverdue(activityId), refetchInterval: 60_000 });

  const waiting = (tickets.data ?? []).some((t) => t.status === 'REQUESTED');

  const submit = useMutation({
    mutationFn: async () => {
      const h = Number(hours.replace(',', '.'));
      if (reason.trim() === '') throw new Error('Say why the task is late.');
      if (!Number.isFinite(h) || h <= 0) throw new Error('Enter how many more hours are needed.');
      const ticketId = await raiseTicket({ activityId, hours: h, reason: reason.trim() });
      for (const file of photos) {
        await attachTicketPhoto({ batchId, activityId, ticketId, file });
      }
    },
    onSuccess: () => {
      setForm(false);
      setReason('');
      setHours('');
      setPhotos([]);
      qc.invalidateQueries({ queryKey: ['tickets', activityId] });
      qc.invalidateQueries({ queryKey: ['my-work'] });
    },
  });

  async function addPhoto() {
    setPickError(null);
    if (!cameraIsGuaranteed()) {
      fileInput.current?.click();
      return;
    }
    try {
      const f = await takeNativePhoto();
      await assertIsImage(f);
      setPhotos((p) => [...p, f]);
    } catch (e) {
      if (e instanceof CaptureCancelled) return;
      setPickError(humanError(e).detail || (e as Error).message);
    }
  }

  const list = tickets.data ?? [];
  if (!mayRaise && list.length === 0) return null;

  return (
    <section className="mb-5 rounded-lg border p-3" style={{ borderColor: overdue.data ? 'var(--crit)' : 'var(--line-2)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">Late-task ticket</p>
        {overdue.data && <Chip tone="crit">over its stated time</Chip>}
      </div>

      {list.map((t) => (
        <TicketLine key={t.id} t={t} />
      ))}

      {mayRaise && taskOpen && !waiting && !form && (
        <button
          type="button"
          onClick={() => setForm(true)}
          className="mt-2 w-full rounded border px-3 font-head text-[13px] font-700"
          style={{ minHeight: 44, borderColor: overdue.data ? 'var(--crit)' : 'var(--line-2)', color: overdue.data ? 'var(--crit)' : 'var(--ink-2)' }}
        >
          Raise a late-task ticket
        </button>
      )}

      {form && (
        <div className="mt-2 grid gap-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why is this task late? What happened?"
            className="w-full rounded border bg-surface px-2 py-2 text-[14px]"
            style={{ borderColor: 'var(--line-2)' }}
          />
          <div className="flex flex-wrap gap-2">
            {[
              ['0.5', '30 min more'],
              ['1', '1 hour more'],
              ['2', '2 hours more'],
            ].map(([h, label]) => (
              <button
                key={h}
                type="button"
                aria-pressed={hours === h}
                onClick={() => setHours(h)}
                className="rounded border px-3 font-head text-[13px] font-700"
                style={{
                  minHeight: 44,
                  borderColor: hours === h ? 'var(--accent)' : 'var(--line-2)',
                  background: hours === h ? 'var(--accent-soft)' : 'transparent',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[14px]">
            <span className="text-ink2">More hours needed</span>
            <input
              inputMode="decimal"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="mono w-24 rounded border bg-surface px-2"
              style={{ minHeight: 44, borderColor: 'var(--line-2)' }}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={addPhoto}
              className="rounded border px-3 font-head text-[13px] font-700"
              style={{ minHeight: 44, borderColor: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              Take photo
            </button>
            <span className="text-[13px] text-muted">{photos.length} photo(s)</span>
          </div>
          {pickError && <p className="text-[13px]" style={{ color: 'var(--crit)' }}>{pickError}</p>}
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="hidden"
            onChange={async (ev) => {
              const f = ev.target.files?.[0];
              ev.target.value = '';
              if (!f) return;
              try {
                await assertIsImage(f);
                setPhotos((p) => [...p, f]);
              } catch (e) {
                setPickError((e as Error).message);
              }
            }}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm(false)}
              className="rounded border font-head text-[14px] font-700"
              style={{ minHeight: 48, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submit.isPending}
              onClick={() => submit.mutate()}
              className="rounded font-head text-[14px] font-800 disabled:opacity-60"
              style={{ minHeight: 48, background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              {submit.isPending ? 'Sending…' : 'Send to Admin'}
            </button>
          </div>
          {submit.error && (
            <p className="text-[13px]" style={{ color: 'var(--crit)' }}>
              {humanError(submit.error).title}. {humanError(submit.error).detail}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function TicketLine({ t }: { t: Ticket }) {
  return (
    <div className="mt-2 rounded border px-3 py-2 text-[13px]" style={{ borderColor: 'var(--line)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={t.status === 'ADMIN_APPROVED' ? 'ok' : t.status === 'ADMIN_REJECTED' ? 'crit' : 'warn'}>
          {TICKET_STATUS_WORDS[t.status] ?? t.status}
        </Chip>
        <span className="text-muted">
          {t.requested_by_name ?? '—'} · {new Date(t.requested_at).toLocaleString()} · {t.requested_extension_hr} h asked
        </span>
      </div>
      <p className="mt-1 text-ink">{t.requested_reason}</p>
      {t.photos.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {t.photos.map((p) => <Thumb key={p.storage_path} path={p.storage_path} />)}
        </div>
      )}
      {t.admin_decision && (
        <p className="mt-1 text-ink2">
          Admin {t.admin_decision}{t.admin_granted_hr ? ` · ${t.admin_granted_hr} h granted` : ''}: “{t.admin_reason}”
        </p>
      )}
    </div>
  );
}

export function Thumb({ path, size = 72 }: { path: string; size?: number }) {
  const url = useQuery({ queryKey: ['evidence-url', path], queryFn: () => signedEvidenceUrl(path, 300), staleTime: 240_000 });
  if (!url.data) return <div className="rounded" style={{ width: size, height: size, background: 'var(--surface-2)' }} />;
  return (
    <a href={url.data} target="_blank" rel="noopener noreferrer">
      <img src={url.data} alt="Ticket photo" className="rounded object-cover" style={{ width: size, height: size }} loading="lazy" />
    </a>
  );
}
