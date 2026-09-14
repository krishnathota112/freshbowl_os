import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  captureEvidence,
  getActivityDetail,
  loadEvidenceState,
  signedEvidenceUrl,
  startActivity,
  type BatchValueRow,
  type EvidenceItem,
} from '../api/batch';
import { supabase } from '../api/client';
import { completeActivity } from '../api/work';
import { CaptureCancelled, assertIsImage, cameraIsGuaranteed, takeNativePhoto } from '../camera/camera';
import { Chip, ConflictMarker, Countdown } from './primitives';
import { LateTicketPanel } from './LateTicketPanel';

/**
 * Human-readable state labels — same map as BatchDetail.
 * The internal names are engine vocabulary; a person using this screen reads what the task is doing.
 */
const STATE_LABEL: Record<string, string> = {
  COMPLETED: 'Done', READY: 'Ready', IN_PROGRESS: 'In progress', SUBMITTED: 'Submitted',
  WAITING_TIME: 'Resting', WAITING_CONDITION: 'Waiting', DEVIATION: 'Needs decision',
  BLOCKED: 'Blocked', RETURNED: 'Returned', LOCKED: 'Not yet', SKIPPED: 'Skipped',
  CANCELLED: 'Cancelled', AWAITING_LAB: 'Waiting on lab', AWAITING_SUPERVISOR: 'Waiting on supervisor',
};
function acceptFor(kinds: string[] | null): string {
  const set = new Set(kinds ?? ['photo']);
  const accept: string[] = [];
  if (set.has('photo')) accept.push('image/jpeg', 'image/png', 'image/webp');
  if (set.has('video')) accept.push('video/mp4', 'video/quicktime');
  return accept.join(',');
}

type TaskDetail = {
  id: string;
  code: string;
  title: string;
  scope_label: string;
  rel_day: number;
  state: string;
  blocked_reason: string | null;
  golden_rule: string | null;
  tbd_marker: string | null;
  planned_qty_mt: number | null;
  day0_duration_hr: number | null;
  duration_target_min_hr: number | null;
  duration_target_max_hr: number | null;
  actual_start: string | null;
  unblocks_at: string | null;
  master_batch_id: string;
  variant_code: string | null;
  source: { label: string } | null;
  destination: { label: string } | null;
  machine: { code: string } | null;
  is_hold: boolean;
  process_activity: { admin_question: string | null; instructions: string | null; stage: string | null } | null;
};

/**
 * Recording one task. This is the operator's screen, reused as a drawer for supervisors
 * and admin.
 *
 * Two rules it must not break:
 *   an out-of-range value is always RECORDABLE — it warns, demands a remark, and raises a
 *   deviation, but the submit button still works;
 *   evidence gates SUBMISSION, not recording — the count comes from named requirements,
 *   and the server refuses a submit that is short, whatever the button does.
 */
export function TaskDrawer({
  activityId,
  batchStatus,
  onClose,
  onChanged,
}: {
  activityId: string;
  batchStatus: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const activity = useQuery({
    queryKey: ['activity', activityId],
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from('batch_activity')
        .select(
          'id, code, title, scope_label, rel_day, state, is_hold, blocked_reason, golden_rule, tbd_marker, planned_qty_mt, day0_duration_hr, duration_target_min_hr, duration_target_max_hr, actual_start, unblocks_at, master_batch_id, variant_code, assigned_machine_id, source_location_id, destination_location_id, source:location!batch_activity_source_location_id_fkey(label), destination:location!batch_activity_destination_location_id_fkey(label), machine:machine!batch_activity_assigned_machine_id_fkey(code), process_activity(admin_question, instructions, stage)'
        )
        .eq('id', activityId)
        .single();
      if (e) throw e;
      return data as unknown as TaskDetail;
    },
  });

  const detail = useQuery({
    queryKey: ['activity-detail', activityId],
    queryFn: () => getActivityDetail(activityId),
  });

  useEffect(() => {
    if (!detail.data) return;
    const seed: Record<string, string> = {};
    for (const v of detail.data.values) if (v.actual_value) seed[v.field_key] = v.actual_value;
    setValues(seed);
  }, [detail.data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['activity', activityId] });
    qc.invalidateQueries({ queryKey: ['activity-detail', activityId] });
    qc.invalidateQueries({ queryKey: ['evidence-full', activityId] });
    onChanged();
  };

  const start = useMutation({ mutationFn: () => startActivity(activityId), onSuccess: refresh });

  /**
   * Capture. Uploads the file, then binds it — A4.
   *
   * The previous version called an RPC that incremented a counter with no file. That affordance is
   * what `UI_ACCEPTANCE_CRITERIA` rule E.3 auto-fails the workstream for, and it is gone: there is no
   * longer a server function that can satisfy a requirement without an object in storage.
   *
   * A failure leaves the requirement outstanding and says why. It never marks it met — criterion 59.
   */
  const evidence = useMutation({
    mutationFn: (input: { requirementKey: string; file: File; mediaKind: 'photo' | 'video' }) =>
      captureEvidence({
        batchId: a!.master_batch_id,
        activityId,
        requirementKey: input.requirementKey,
        file: input.file,
        mediaKind: input.mediaKind,
      }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e) => setError(`Capture failed — nothing was recorded. ${(e as Error).message}`),
  });

  /**
   * In the Android app the CAMERA opens — never the gallery (camera.ts). A file input with
   * `capture` opened the system photo picker on the 10 Sep device run, so the web path is kept for
   * browsers only.
   */
  const captureWithCamera = async (requirementKey: string) => {
    setError(null);
    try {
      const file = await takeNativePhoto();
      await assertIsImage(file);
      evidence.mutate({ requirementKey, file, mediaKind: 'photo' });
    } catch (err) {
      if (err instanceof CaptureCancelled) return;
      setError(`Camera — nothing was recorded. ${(err as Error).message}`);
    }
  };
  const submit = useMutation({
    // The live path (complete_activity): the server stamps the finish and refuses to finish production
    // work that was never started. submit_activity with stated times is the paper-backfill path only.
    mutationFn: () => completeActivity(activityId, values, remarks),
    onSuccess: (r) => {
      setError(null);
      setResult(
        r.outstanding_evidence
          ? `Held — still needed: ${r.outstanding_evidence}`
          : r.out_of_range > 0
            ? `Recorded. ${r.out_of_range} value(s) outside the SOP band, so this is now a deviation for the supervisor.`
            : 'Recorded and complete.'
      );
      refresh();
    },
    onError: (e) => {
      setResult(null);
      setError((e as Error).message);
    },
  });

  const fullEvidence = useQuery({
    queryKey: ['evidence-full', activityId],
    queryFn: () => loadEvidenceState(activityId),
  });

  const a = activity.data;
  const vals = detail.data?.values ?? [];
  const evs = detail.data?.evidence ?? [];
  const fullEvItems = fullEvidence.data ?? [];
  const outstanding = evs.filter((e) => e.gates_submission && e.satisfied_count < e.min_count);
  const editable = a && ['READY', 'IN_PROGRESS', 'RETURNED'].includes(a.state) && batchStatus === 'active';

  const outOfRange = (v: BatchValueRow) => {
    const raw = values[v.field_key];
    if (!raw || !/^-?\d+(\.\d+)?$/.test(raw)) return false;
    const n = Number(raw);
    return (v.sop_min != null && n < v.sop_min) || (v.sop_max != null && n > v.sop_max);
  };
  const anyOutOfRange = vals.some(outOfRange);
  const remarkRequired = anyOutOfRange && remarks.trim().length === 0;

  return (
    <div className="fixed inset-0 z-20 flex justify-end" style={{ background: 'rgba(0,0,0,.4)' }}>
      <div
        className="h-full w-full max-w-xl overflow-auto p-5"
        style={{ background: 'var(--paper)' }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-head text-lg font-800 leading-tight">{a?.title ?? '…'}</h2>
            <p className="mono mt-0.5 text-[11px] text-muted">
              {a?.code} · {a?.scope_label} · Day {a?.rel_day}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded border px-2 py-1 font-head text-[11px] font-600"
            style={{ borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
          >
            Close
          </button>
        </div>

        {a && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Chip tone={a.state === 'COMPLETED' ? 'ok' : a.state === 'DEVIATION' ? 'crit' : 'accent'}>
              {STATE_LABEL[a.state] ?? a.state.replace(/_/g, ' ')}
            </Chip>
            {a.tbd_marker && <ConflictMarker id={a.tbd_marker} />}
            {a.day0_duration_hr != null && (
              <span className="mono text-[11px] text-ink2">rest {a.day0_duration_hr} h</span>
            )}
          </div>
        )}

        {/* What this task is: the stage and the SOP's own wording, from the process definition. */}
        {a?.process_activity?.stage && (
          <p className="mb-1 font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
            {a.process_activity.stage}
          </p>
        )}
        {(a?.process_activity?.instructions ?? a?.process_activity?.admin_question) && (
          <p className="mb-3 max-w-prose whitespace-pre-line text-[13px] text-ink">
            {a?.process_activity?.instructions ?? a?.process_activity?.admin_question}
          </p>
        )}

        {a?.blocked_reason && (
          <p
            className="mb-4 rounded border px-3 py-2 text-[13px]"
            style={{ borderColor: 'var(--line-2)', background: 'var(--surface-2)', color: 'var(--ink-2)' }}
          >
            {a.blocked_reason}
          </p>
        )}

        {/* Resting reads its countdown from a server-issued timestamp. */}
        {a?.state === 'WAITING_TIME' && a.unblocks_at && (
          <p className="mb-4 font-head text-[15px] font-700">
            <Countdown until={a.unblocks_at} />
          </p>
        )}

        {/* Where the material goes. Source is inherited from the previous stint. */}
        {(a?.source || a?.destination) && (
          <div
            className="mb-4 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: 'var(--surface-2)' }}
          >
            <span className="mono rounded border px-2 py-1 text-[12px]"
                  style={{ borderColor: 'var(--line-2)' }}>
              {a?.source?.label ?? 'Yard'}
            </span>
            <span className="mono text-[13px]" style={{ color: '#16794a' }}>──►</span>
            {a?.machine && (
              <>
                <span className="mono rounded border px-2 py-1 text-[11px]"
                      style={{ borderColor: 'var(--line-2)', color: 'var(--muted)' }}>
                  {a.machine.code}
                </span>
                <span className="mono text-[13px]" style={{ color: '#16794a' }}>──►</span>
              </>
            )}
            <span className="mono rounded border px-2 py-1 text-[12px] font-600"
                  style={{ borderColor: '#16794a', background: 'var(--ok-soft)', color: '#16794a' }}>
              {a?.destination?.label ?? 'Out'}
            </span>
          </div>
        )}

        {/*
          Water or dry, exactly as the admin set it on Day 0. The operator does not choose
          here — that decision was made in the schedule and is shown, not re-asked.
        */}
        {a?.variant_code && (
          <div
            className="mb-4 rounded-lg border px-3 py-2"
            style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}
          >
            <span className="font-head text-[11px] font-700 uppercase tracking-wider"
                  style={{ color: 'var(--accent-ink)' }}>
              Pass mode · set at Day 0
            </span>
            <p className="mono mt-0.5 text-[15px] font-600" style={{ color: 'var(--accent-ink)' }}>
              {a.variant_code === 'WATER' ? 'WATER PASS' : 'DRY PASS'}
            </p>
          </div>
        )}

        {/* The golden rule is the one part of the SOP written for the person doing the work. */}
        {a?.golden_rule && (
          <p
            className="mb-4 rounded border px-3 py-2 text-[13px] italic"
            style={{ borderColor: 'var(--warn)', background: 'var(--warn-soft)', color: 'var(--warn)' }}
          >
            {a.golden_rule}
          </p>
        )}

        {a?.state === 'READY' && batchStatus === 'active' && !a.is_hold && (
          <button
            onClick={() => start.mutate()}
            className="mb-4 w-full rounded px-3 py-3 font-head text-sm font-700"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Start work
          </button>
        )}

        {batchStatus !== 'active' && (
          <p className="mb-4 text-[12px] text-muted">
            The batch is {batchStatus}. Activate it before recording work.
          </p>
        )}

        {vals.length > 0 && (
          <section className="mb-5">
            <p className="mb-2 font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
              What to record
            </p>
            <div className="flex flex-col gap-3">
              {vals.map((v) => {
                const bad = outOfRange(v);
                // A checklist item is ticked or not; the server accepts 'true' / 'false' only (0081).
                if (v.datatype === 'check') {
                  return (
                    <label key={v.id} className="flex items-center gap-3" style={{ minHeight: 44 }}>
                      <input
                        type="checkbox"
                        checked={values[v.field_key] === 'true'}
                        disabled={!editable}
                        onChange={(e) =>
                          setValues((p) => ({ ...p, [v.field_key]: e.target.checked ? 'true' : 'false' }))
                        }
                        className="h-5 w-5 shrink-0"
                      />
                      <span className="text-[13px] text-ink">{v.label}</span>
                    </label>
                  );
                }
                return (
                  <div key={v.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-head text-[13px] font-600">{v.label}</span>
                      {v.operator_input === 'optional' && <Chip tone="muted">optional</Chip>}
                      {v.conflict_id && <ConflictMarker id={v.conflict_id} />}
                    </div>
                    <p className="mono text-[11px] text-muted">
                      {v.sop_value
                        ? `target ${v.sop_value}${v.unit ? ' ' + v.unit : ''}`
                        : `no target — ${v.sop_source_ref ?? 'no source gives a bound'}`}
                      {v.variance_allowed ? ` · allowed ${v.variance_allowed}` : ''}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        value={values[v.field_key] ?? ''}
                        disabled={!editable}
                        onChange={(e) =>
                          setValues((p) => ({ ...p, [v.field_key]: e.target.value }))
                        }
                        placeholder="—"
                        className="mono w-40 rounded border bg-surface px-2 py-2 text-base"
                        style={{
                          borderColor: bad ? 'var(--crit)' : 'var(--line-2)',
                          color: 'var(--ink)',
                        }}
                      />
                      {v.unit && <span className="mono text-[12px] text-muted">{v.unit}</span>}
                      {bad && <Chip tone="crit">outside SOP</Chip>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="mb-5">
          <p className="mb-2 font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
            Evidence {evs.length > 0 && `· ${evs.length - outstanding.length} / ${evs.length}`}
          </p>
          {evs.length === 0 ? (
            <p className="text-[12px] text-muted">Nothing required for this task.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {evs.map((e) => {
                const met = e.satisfied_count >= e.min_count;
                // Photos already captured for this requirement
                const captured = fullEvItems.filter(
                  (f) => f.key === e.key && f.mediaId !== null && f.supersededById === null
                );
                return (
                  <div key={e.id} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-600" style={{ color: met ? 'var(--ok)' : 'var(--ink)' }}>
                        {met ? '✓ ' : '○ '}
                        {e.label}
                      </span>
                      {!met && editable && cameraIsGuaranteed() && (
                        <button
                          type="button"
                          disabled={evidence.isPending}
                          onClick={() => captureWithCamera(e.key)}
                          className="shrink-0 rounded border px-3 py-2 font-head text-[11px] font-600"
                          style={{ borderColor: 'var(--accent)', color: 'var(--accent-ink)', minHeight: 44 }}
                        >
                          {evidence.isPending ? 'Uploading…' : 'Take photo'}
                        </button>
                      )}
                      {!met && editable && !cameraIsGuaranteed() && (
                        <label
                          className="shrink-0 cursor-pointer rounded border px-3 py-2 font-head text-[11px] font-600"
                          style={{
                            borderColor: 'var(--accent)',
                            color: 'var(--accent-ink)',
                            minHeight: 44,
                            display: 'inline-flex',
                            alignItems: 'center',
                          }}
                        >
                          {evidence.isPending ? 'Uploading…' : 'Capture'}
                          <input
                            type="file"
                            accept={acceptFor(e.media_kinds)}
                            capture="environment"
                            className="hidden"
                            disabled={evidence.isPending}
                            onChange={(ev) => {
                              const file = ev.target.files?.[0];
                              ev.target.value = '';
                              if (!file) return;
                              evidence.mutate({
                                requirementKey: e.key,
                                file,
                                mediaKind: file.type.startsWith('video/') ? 'video' : 'photo',
                              });
                            }}
                          />
                        </label>
                      )}
                    </div>
                    {e.capture_hint && (
                      <span className="text-[11px] text-muted">{e.capture_hint}</span>
                    )}
                    {/* Render the actual captured photos */}
                    {captured.map((f) => (
                      <PhotoThumb key={f.mediaId!} item={f} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {a && (
          <LateTicketPanel
            batchId={a.master_batch_id}
            activityId={activityId}
            taskOpen={['READY', 'IN_PROGRESS', 'RETURNED'].includes(a.state) && batchStatus === 'active'}
          />
        )}

        <section className="mb-4">
          <p className="mb-1 font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
            Remarks {remarkRequired && <span style={{ color: 'var(--crit)' }}>· required</span>}
          </p>
          <textarea
            value={remarks}
            disabled={!editable}
            onChange={(e) => setRemarks(e.target.value)}
            rows={2}
            placeholder={anyOutOfRange ? 'A value is outside the SOP band — say what you saw' : 'Optional'}
            className="w-full rounded border bg-surface px-2 py-2 text-[13px]"
            style={{
              borderColor: remarkRequired ? 'var(--crit)' : 'var(--line-2)',
              color: 'var(--ink)',
            }}
          />
        </section>

        {anyOutOfRange && (
          <p
            className="mb-3 rounded border px-3 py-2 text-[12px]"
            style={{ borderColor: 'var(--warn)', background: 'var(--warn-soft)', color: 'var(--warn)' }}
          >
            A value is outside the SOP band. You can still submit — recording reality is never
            blocked. It will be flagged as a deviation and held for the supervisor.
          </p>
        )}

        {outstanding.length > 0 && (
          <p className="mb-3 text-[12px]" style={{ color: 'var(--ink-2)' }}>
            {outstanding.length} evidence item(s) outstanding: {outstanding.map((o) => o.label).join(', ')}
          </p>
        )}

        {error && (
          <p
            className="mb-3 rounded border px-3 py-2 text-[12px]"
            style={{ borderColor: 'var(--crit)', background: 'var(--crit-soft)', color: 'var(--crit)' }}
          >
            {error}
          </p>
        )}
        {result && (
          <p
            className="mb-3 rounded border px-3 py-2 text-[12px]"
            style={{ borderColor: 'var(--ok)', background: 'var(--ok-soft)', color: 'var(--ok)' }}
          >
            {result}
          </p>
        )}

        {editable && (
          <button
            onClick={() => submit.mutate()}
            disabled={submit.isPending || remarkRequired}
            className="w-full rounded px-3 py-3.5 font-head text-sm font-700"
            style={{
              background: outstanding.length > 0 ? 'var(--lock)' : 'var(--accent)',
              color: '#fff',
              opacity: submit.isPending || remarkRequired ? 0.55 : 1,
            }}
          >
            {submit.isPending
              ? 'Submitting…'
              : outstanding.length > 0
                ? `Submit · ${outstanding.length} evidence item(s) outstanding`
                : 'Submit'}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * One captured photo or video — loads a signed URL and renders it.
 *
 * Signed URLs expire (5 min TTL). React Query re-fetches when the component mounts so a closed-and-
 * reopened drawer always shows a fresh URL. Private bucket: the object is never accessible without a
 * valid session; the signed URL is short-lived and not stored.
 */
function PhotoThumb({ item }: { item: EvidenceItem }) {
  const url = useQuery({
    queryKey: ['evidence-url', item.storagePath],
    queryFn: () => signedEvidenceUrl(item.storagePath!, 300),
    enabled: !!item.storagePath,
    staleTime: 240_000, // refresh before the 5-min TTL expires
  });

  if (!item.storagePath) return null;

  if (url.isLoading) {
    return (
      <div
        className="rounded"
        style={{ width: '100%', maxWidth: 240, height: 80, background: 'var(--surface-2)' }}
      />
    );
  }
  if (url.error || !url.data) {
    return (
      <p className="text-[11px]" style={{ color: 'var(--warn)' }}>
        Photo could not be loaded — {(url.error as Error)?.message ?? 'unknown error'}
      </p>
    );
  }

  if (item.mediaKind === 'video') {
    return (
      <video
        src={url.data}
        controls
        className="rounded"
        style={{ width: '100%', maxWidth: 360, maxHeight: 200, background: '#000' }}
      />
    );
  }

  return (
    <a href={url.data} target="_blank" rel="noopener noreferrer">
      <img
        src={url.data}
        alt={item.label}
        className="rounded"
        style={{ width: '100%', maxWidth: 360, maxHeight: 240, objectFit: 'cover' }}
        loading="lazy"
      />
    </a>
  );
}
