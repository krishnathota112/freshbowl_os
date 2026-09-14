import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { captureEvidence, signedEvidenceUrl, type EvidenceItem } from '../../../shared/api/batch';
import { CaptureCancelled, assertIsImage, cameraIsGuaranteed, takeNativePhoto } from '../../../shared/camera/camera';
import { humanError } from '../../../shared/utilities/humanError';

/**
 * One evidence requirement, as a step in the work. `UI-SYSTEM.md` — "Evidence is part of the work,
 * not an upload". Shared by the Lab and Operator workstations.
 *
 *   CAPTURE PHOTO  →  the picture is shown back  →  USE THIS PHOTO  →  upload + bind  →  1 / 1
 *
 * Nothing counts until `bind_evidence` has answered: the counter is the server's `satisfied_count`,
 * re-read after the bind, never incremented here. If the upload or the bind fails the photograph is
 * kept on screen so "Try again" does not need a second picture, and the screen says plainly that
 * nothing was recorded — the behaviour proven on the device with the network cut.
 */
export type EvidenceRequirement = {
  key: string;
  label: string;
  captureHint: string | null;
  minCount: number;
  satisfiedCount: number;
  mediaKinds: string[];
};

export function requirementsFrom(items: EvidenceItem[]): {
  requirement: EvidenceRequirement;
  captured: EvidenceItem[];
}[] {
  const byKey = new Map<string, { requirement: EvidenceRequirement; captured: EvidenceItem[] }>();
  for (const it of items) {
    let entry = byKey.get(it.key);
    if (!entry) {
      entry = {
        requirement: {
          key: it.key,
          label: it.label,
          captureHint: it.captureHint,
          minCount: it.minCount,
          satisfiedCount: it.satisfiedCount,
          mediaKinds: it.mediaKinds,
        },
        captured: [],
      };
      byKey.set(it.key, entry);
    }
    if (it.mediaId && it.storagePath && it.supersededById === null) entry.captured.push(it);
  }
  return [...byKey.values()];
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'preview'; file: File; url: string }
  | { kind: 'uploading'; file: File; url: string }
  | { kind: 'failed'; file: File; url: string; title: string; detail: string };

export function EvidenceStep({
  batchId,
  activityId,
  requirement,
  captured,
  editable,
  onBound,
}: {
  batchId: string;
  activityId: string;
  requirement: EvidenceRequirement;
  captured: EvidenceItem[];
  /** False once the work is finished — the photographs stay visible, the camera does not. */
  editable: boolean;
  onBound: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [pickError, setPickError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const met = requirement.satisfiedCount >= requirement.minCount;

  // Release the preview's object URL when it is replaced or the step unmounts.
  useEffect(() => {
    const url = 'url' in phase ? phase.url : null;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [phase]);

  async function accept(file: File) {
    setPickError(null);
    try {
      await assertIsImage(file);
    } catch (e) {
      setPickError((e as Error).message);
      return;
    }
    setPhase({ kind: 'preview', file, url: URL.createObjectURL(file) });
  }

  async function capture() {
    setPickError(null);
    if (!cameraIsGuaranteed()) {
      fileInput.current?.click();
      return;
    }
    try {
      await accept(await takeNativePhoto());
    } catch (e) {
      if (e instanceof CaptureCancelled) return;
      setPickError(humanError(e).detail || (e as Error).message);
    }
  }

  async function upload(file: File, url: string) {
    setPhase({ kind: 'uploading', file, url });
    try {
      await captureEvidence({
        batchId,
        activityId,
        requirementKey: requirement.key,
        file,
        mediaKind: 'photo',
      });
      setPhase({ kind: 'idle' });
      onBound();
    } catch (e) {
      const raw = (e as Error)?.message?.toLowerCase() ?? '';
      // The storage policy admits the ASSIGNED person, or a supervisor. Said in those terms, because
      // "not yours to open" is the wrong sentence for somebody holding the sample in their hand.
      const h = raw.includes('row-level security') || raw.includes('unauthorized') || raw.includes('403')
        ? {
            title: 'This photo cannot be filed by you',
            detail:
              'This task is assigned to someone else. Ask the supervisor to assign it to you, then try again.',
          }
        : humanError(e);
      setPhase({ kind: 'failed', file, url, title: `Nothing was recorded. ${h.title}.`, detail: h.detail });
    }
  }

  return (
    <div className="rounded-lg border bg-surface p-4" style={{ borderColor: met ? 'var(--ok)' : 'var(--line)' }}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-head text-[13px] font-800 uppercase tracking-wider" style={{ color: 'var(--ink)' }}>
          {requirement.label}
        </p>
        <p className="mono shrink-0 text-[13px]" style={{ color: met ? 'var(--ok)' : 'var(--muted)' }}>
          {Math.min(requirement.satisfiedCount, requirement.minCount)} / {requirement.minCount}{' '}
          {requirement.minCount === 1 ? 'photo' : 'photos'}
        </p>
      </div>
      {requirement.captureHint && <p className="mt-1 text-[14px] text-ink2">{requirement.captureHint}</p>}

      {captured.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {captured.map((c) => (
            <SignedThumb key={c.mediaId!} path={c.storagePath!} alt={requirement.label} />
          ))}
        </div>
      )}

      {(phase.kind === 'preview' || phase.kind === 'uploading' || phase.kind === 'failed') && (
        <div className="mt-3">
          <img
            src={phase.url}
            alt="The photograph you just took"
            className="w-full rounded-md object-cover"
            style={{ maxHeight: 320, background: 'var(--surface-2)' }}
          />
          {phase.kind === 'failed' && (
            <div
              className="mt-2 rounded-md border px-3 py-2 text-[14px]"
              style={{ borderColor: 'var(--crit)', background: 'var(--crit-soft)', color: 'var(--crit)' }}
              role="alert"
            >
              <p className="font-700">{phase.title}</p>
              {phase.detail && <p className="mt-0.5">{phase.detail}</p>}
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={phase.kind === 'uploading'}
              onClick={() => setPhase({ kind: 'idle' })}
              className="rounded-md border font-head text-[15px] font-700 disabled:opacity-50"
              style={{ minHeight: 52, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
            >
              Retake
            </button>
            <button
              type="button"
              disabled={phase.kind === 'uploading'}
              onClick={() => upload(phase.file, phase.url)}
              className="rounded-md font-head text-[15px] font-800 disabled:opacity-60"
              style={{ minHeight: 52, background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              {phase.kind === 'uploading' ? 'Saving…' : phase.kind === 'failed' ? 'Try again' : 'Use this photo'}
            </button>
          </div>
        </div>
      )}

      {phase.kind === 'idle' && editable && !met && (
        <button
          type="button"
          onClick={capture}
          className="mt-3 w-full rounded-md border font-head text-[15px] font-800"
          style={{ minHeight: 52, borderColor: 'var(--accent)', color: 'var(--accent-ink)', background: 'var(--accent-soft)' }}
        >
          Capture photo
        </button>
      )}

      {pickError && (
        <p className="mt-2 text-[14px]" style={{ color: 'var(--crit)' }} role="alert">
          {pickError}
        </p>
      )}

      {editable && !met && !cameraIsGuaranteed() && phase.kind === 'idle' && (
        <p className="mt-2 text-[12px] text-muted">
          In a browser a file is chosen. On the phone app the camera opens directly.
        </p>
      )}

      {/* The web path. A browser can only open a picker from a real <input>; the app never uses it. */}
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(ev) => {
          const f = ev.target.files?.[0];
          ev.target.value = '';
          if (f) accept(f);
        }}
      />
    </div>
  );
}

/** A bound photograph, through a short-lived signed URL — the bucket is private. */
function SignedThumb({ path, alt }: { path: string; alt: string }) {
  const url = useQuery({
    queryKey: ['evidence-url', path],
    queryFn: () => signedEvidenceUrl(path, 300),
    staleTime: 240_000,
  });
  if (url.isLoading) return <div className="h-24 w-24 rounded-md" style={{ background: 'var(--surface-2)' }} />;
  if (url.error || !url.data) {
    return <p className="text-[12px]" style={{ color: 'var(--warn)' }}>Saved, but it cannot be shown right now.</p>;
  }
  return (
    <a href={url.data} target="_blank" rel="noopener noreferrer">
      <img src={url.data} alt={alt} className="h-24 w-24 rounded-md object-cover" loading="lazy" />
    </a>
  );
}
