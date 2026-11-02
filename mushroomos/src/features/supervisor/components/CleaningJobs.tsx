import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  attachCleaningPhoto,
  completeCleaning,
  loadOpenCleaningJobs,
  startCleaning,
  type CleaningJob,
} from '../../../shared/api/resources';
import { useAuth } from '../../../shared/auth/auth';
import { CaptureCancelled, assertIsImage, cameraIsGuaranteed, takeNativePhoto } from '../../../shared/camera/camera';
import { Chip } from '../../../shared/ui/primitives';
import { humanError } from '../../../shared/utils/humanError';

/**
 * Supervisor · bunker and tunnel cleaning jobs (0110, and the cleaning an Admin adds on a batch amendment, 0132).
 *
 * The Admin asks for a cleaning on Resources or on an SOP amendment; the job lands here. The Supervisor starts it,
 * photographs the cleaned vessel, ticks the factory's checklist and finishes it. Every rule — at least one photo,
 * every item ticked, one photo never reused — is the server's; this screen only carries the work to it.
 * A job assigned to a named person shows whose it is; an unassigned one is anyone's.
 */
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export function CleaningJobs() {
  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const jobs = useQuery({ queryKey: ['cleaning-jobs'], queryFn: loadOpenCleaningJobs, refetchInterval: 30_000 });

  const list = [...(jobs.data ?? [])].sort(
    (a, b) => Number(b.assigned_to === me) - Number(a.assigned_to === me) || a.requested_at.localeCompare(b.requested_at)
  );
  if (jobs.isLoading || (list.length === 0 && !jobs.error)) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-[12px] font-mono font-bold uppercase tracking-wider text-ink-2">
        Cleaning jobs · {list.length}
      </h2>
      {jobs.error && (
        <p className="text-[13px]" style={{ color: 'var(--crit)' }}>
          Cleaning jobs could not be loaded: {(jobs.error as Error).message}
        </p>
      )}
      {list.map((j) => (
        <CleaningCard key={j.id} job={j} mine={j.assigned_to === me} />
      ))}
    </section>
  );
}

export function CleaningCard({ job, mine }: { job: CleaningJob; mine: boolean }) {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [ticked, setTicked] = useState<Record<string, boolean>>(
    () => Object.fromEntries(job.checklist.map((i) => [i.key, i.done]))
  );
  const [error, setError] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['cleaning-jobs'] });
  const fail = (e: unknown) => {
    const h = humanError(e);
    setError(h.detail || h.title || (e as Error).message);
  };

  const start = useMutation({ mutationFn: () => startCleaning(job.id), onSuccess: refresh, onError: fail });
  const photo = useMutation({ mutationFn: (f: File) => attachCleaningPhoto(job.id, f), onSuccess: refresh, onError: fail });
  const finish = useMutation({
    mutationFn: () => completeCleaning(job.id, job.checklist.map((i) => ({ ...i, done: !!ticked[i.key] }))),
    onSuccess: () => {
      refresh();
      qc.invalidateQueries({ queryKey: ['my-work'] });
    },
    onError: fail,
  });

  async function takePhoto() {
    setError(null);
    if (!cameraIsGuaranteed()) {
      fileInput.current?.click();
      return;
    }
    try {
      const f = await takeNativePhoto();
      await assertIsImage(f);
      photo.mutate(f);
    } catch (e) {
      if (e instanceof CaptureCancelled) return;
      fail(e);
    }
  }

  const started = job.state === 'IN_PROGRESS';
  const allTicked = job.checklist.every((i) => ticked[i.key]);
  const busy = start.isPending || photo.isPending || finish.isPending;

  return (
    <article
      className="rounded-xl border bg-surface px-4 py-3"
      style={{ borderColor: mine ? 'var(--accent)' : 'var(--line)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-head text-[16px] font-700">Clean {job.location_label}</span>
        <Chip tone={started ? 'accent' : 'warn'}>{started ? 'under way' : 'to do'}</Chip>
      </div>
      <p className="mt-0.5 text-[12px] text-muted">
        {job.batch_code ? `For batch ${job.batch_code} · ` : ''}asked {when(job.requested_at)}
        {job.assigned_name ? ` · ${mine ? 'assigned to you' : `assigned to ${job.assigned_name}`}` : ' · anyone'}
      </p>
      {job.note && <p className="mt-1 text-[13px] text-ink-2">{job.note}</p>}

      {!started ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setError(null);
            start.mutate();
          }}
          className="mt-3 w-full rounded font-head text-[15px] font-800 disabled:opacity-60"
          style={{ minHeight: 48, background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          {start.isPending ? 'Starting…' : 'Start cleaning'}
        </button>
      ) : (
        <div className="mt-3 grid gap-2">
          <ul className="grid gap-1">
            {job.checklist.map((i) => (
              <li key={i.key}>
                <label className="flex items-center gap-3 text-[15px]" style={{ minHeight: 44 }}>
                  <input
                    type="checkbox"
                    checked={!!ticked[i.key]}
                    onChange={(e) => setTicked((t) => ({ ...t, [i.key]: e.target.checked }))}
                    className="h-5 w-5"
                  />
                  {i.label}
                </label>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={takePhoto}
              className="rounded border px-4 font-head text-[14px] font-700 disabled:opacity-60"
              style={{ minHeight: 48, borderColor: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              {photo.isPending ? 'Uploading…' : 'Take photo'}
            </button>
            <span className="text-[13px] text-muted">
              {job.photo_count} photo{job.photo_count === 1 ? '' : 's'}
              {job.photo_count === 0 ? ' — at least one is needed' : ''}
            </span>
          </div>

          <button
            type="button"
            disabled={busy || !allTicked || job.photo_count === 0}
            onClick={() => {
              setError(null);
              finish.mutate();
            }}
            className="w-full rounded font-head text-[15px] font-800 disabled:opacity-50"
            style={{ minHeight: 48, background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            {finish.isPending ? 'Finishing…' : 'Cleaning done'}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-[13px]" style={{ color: 'var(--crit)' }}>{error}</p>}

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
            photo.mutate(f);
          } catch (e) {
            fail(e);
          }
        }}
      />
    </article>
  );
}

export default CleaningJobs;
