import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getBatch,
  getBatchActivities,
  loadBatchFullEvidence,
  signedEvidenceUrl,
  type BatchActivityRow,
  type BatchFullEvidenceItem,
} from '../../../shared/api/batch';
import { getBatchContext } from '../../../shared/api/work';
import { supabase } from '../../../shared/api/client';
import { TaskDrawer } from '../../../shared/ui/TaskDrawer';
import { Card, Chip, Skeleton, EmptyState } from '../../../shared/ui/primitives';
import { fmtWhen } from '../../../shared/utilities/labWords';
import { nowMs } from '../../../shared/utilities/now';

type FilterTab = 'all' | 'active' | 'evidence' | 'lab_gm' | 'blocked';

interface BatchTimelineViewProps {
  batchId: string;
  onOpenTaskDrawer?: (taskId: string) => void;
}

export function BatchTimelineView({ batchId, onOpenTaskDrawer }: BatchTimelineViewProps) {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [inspectImage, setInspectImage] = useState<{ url: string; label: string; uploader?: string; time?: string } | null>(null);

  // 1. Fetch Master Batch Context & Information
  const batchQuery = useQuery({
    queryKey: ['batch', batchId],
    queryFn: () => getBatch(batchId),
  });

  const forecastQuery = useQuery({
    queryKey: ['batch-context', batchId],
    queryFn: () => getBatchContext(batchId),
  });

  const activitiesQuery = useQuery({
    queryKey: ['batch-activities', batchId],
    queryFn: () => getBatchActivities(batchId),
  });

  const evidenceQuery = useQuery({
    queryKey: ['batch-full-evidence', batchId],
    queryFn: () => loadBatchFullEvidence(batchId),
  });

  // Query activity values (readings) for the entire batch
  const valuesQuery = useQuery({
    queryKey: ['batch-activity-values', batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batch_activity_value')
        .select('*')
        .order('display_order');
      if (error) throw error;
      return data ?? [];
    },
  });

  // Query Lab checkpoints / verdicts for the batch
  const labCheckpointsQuery = useQuery({
    queryKey: ['batch-lab-checkpoints', batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_lab_result_current')
        .select('*')
        .eq('master_batch_id', batchId);
      if (error) return [];
      return data ?? [];
    },
  });

  // Query GM Approvals / Deviations for the batch
  const deviationsQuery = useQuery({
    queryKey: ['batch-deviations', batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_deviation_open')
        .select('*')
        .eq('master_batch_id', batchId);
      if (error) return [];
      return data ?? [];
    },
  });

  const b = batchQuery.data;
  const forecast = forecastQuery.data;
  const activities = useMemo(() => activitiesQuery.data ?? [], [activitiesQuery.data]);
  const evidenceList = useMemo(() => evidenceQuery.data ?? [], [evidenceQuery.data]);
  const valuesList = useMemo(() => valuesQuery.data ?? [], [valuesQuery.data]);
  const labCheckpoints = useMemo(() => labCheckpointsQuery.data ?? [], [labCheckpointsQuery.data]);
  const deviations = useMemo(() => deviationsQuery.data ?? [], [deviationsQuery.data]);

  // Group evidence by activityId
  const evidenceByActivity = useMemo(() => {
    const map = new Map<string, BatchFullEvidenceItem[]>();
    for (const ev of evidenceList) {
      const list = map.get(ev.activityId) ?? [];
      list.push(ev);
      map.set(ev.activityId, list);
    }
    return map;
  }, [evidenceList]);

  // Group values (readings) by activityId
  const valuesByActivity = useMemo(() => {
    const map = new Map<string, typeof valuesList>();
    for (const v of valuesList) {
      const actId = (v as unknown as { batch_activity_id: string }).batch_activity_id;
      if (!actId) continue;
      const list = map.get(actId) ?? [];
      list.push(v);
      map.set(actId, list);
    }
    return map;
  }, [valuesList]);

  // Group lab checkpoints by activityId
  const labByActivity = useMemo(() => {
    const map = new Map<string, unknown[]>();
    for (const l of labCheckpoints) {
      const actId = (l as unknown as { batch_activity_id?: string }).batch_activity_id;
      if (!actId) continue;
      const list = map.get(actId) ?? [];
      list.push(l);
      map.set(actId, list);
    }
    return map;
  }, [labCheckpoints]);

  // Group deviations by activityId
  const deviationsByActivity = useMemo(() => {
    const map = new Map<string, unknown[]>();
    for (const d of deviations) {
      const actId = (d as unknown as { batch_activity_id?: string }).batch_activity_id;
      if (!actId) continue;
      const list = map.get(actId) ?? [];
      list.push(d);
      map.set(actId, list);
    }
    return map;
  }, [deviations]);

  // Summary Metrics
  const totalTasks = activities.length;
  const completedTasks = activities.filter((a) => a.state === 'COMPLETED').length;
  const activeTasks = activities.filter((a) => a.state === 'IN_PROGRESS' || a.state === 'READY').length;
  const blockedTasks = activities.filter((a) => a.state === 'BLOCKED' || a.state === 'DEVIATION').length;
  const pendingLabCount = activities.filter((a) => a.state === 'AWAITING_LAB').length + labCheckpoints.filter((l) => (l as unknown as { verdict?: string }).verdict === 'PENDING').length;

  // Active activity title & current stage
  const currentActiveActivity = useMemo(() => {
    return activities.find((a) => a.state === 'IN_PROGRESS') ?? activities.find((a) => a.state === 'READY') ?? activities[0] ?? null;
  }, [activities]);

  const currentStageName = useMemo(() => {
    if (!currentActiveActivity) return 'Stage 0: Pre-H0 Preparation';
    const day = currentActiveActivity.rel_day;
    if (day <= 0) return 'Stage 0: Material Check & H0 Setup';
    if (day <= 3) return 'Stage 1A: Phase 1 Pre-Wet & Blending';
    if (day <= 6) return 'Stage 1B: Bunker Composting';
    if (day <= 10) return 'Stage 1C: Turner Passes & Piles';
    if (day <= 14) return 'Stage 2A: Phase 2 Tunnel Loading';
    if (day <= 18) return 'Stage 2B: Pasteurisation & Conditioning';
    return 'Stage 2D: Cooling & Spawning';
  }, [currentActiveActivity]);

  // Process clock & progress calculations
  const plannedHours = activities.flatMap((r) => [r.baseline_end_hour, r.baseline_start_hour]).filter((h): h is number => h !== null);
  const baselineHours = forecast?.standard_hr ?? (plannedHours.length > 0 ? Math.max(1, ...plannedHours.map(Number)) : 470);
  const startAtMs = b?.start_at ? new Date(b.start_at).getTime() : b?.start_date ? new Date(b.start_date).getTime() : 0;
  const currentBatchHour = b?.status === 'active' && startAtMs > 0 ? Math.min(baselineHours, Math.max(0, Math.floor((nowMs() - startAtMs) / (1000 * 60 * 60)))) : 0;

  // Filtered chronological timeline items
  const filteredActivities = useMemo(() => {
    return activities.filter((a) => {
      if (filter === 'active') return a.state === 'IN_PROGRESS' || a.state === 'READY';
      if (filter === 'evidence') {
        const evs = evidenceByActivity.get(a.id) ?? [];
        return evs.some((e) => e.storagePath !== null);
      }
      if (filter === 'lab_gm') {
        return a.state === 'AWAITING_LAB' || a.state === 'AWAITING_SUPERVISOR' || (labByActivity.get(a.id)?.length ?? 0) > 0;
      }
      if (filter === 'blocked') return a.state === 'BLOCKED' || a.state === 'DEVIATION' || a.blocked_reason !== null;
      return true;
    });
  }, [activities, filter, evidenceByActivity, labByActivity]);

  if (batchQuery.isLoading || activitiesQuery.isLoading) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto pb-16">
        <Skeleton label="Loading Master Batch Verification & Evidence Timeline…" lines={6} />
      </div>
    );
  }

  if (!b) {
    return <EmptyState title="Master Batch Not Found" detail="The requested batch context could not be loaded." />;
  }

  const handleOpenTask = (taskId: string) => {
    if (onOpenTaskDrawer) onOpenTaskDrawer(taskId);
    else setSelectedTask(taskId);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20 page-in">
      {/* ========================================================================= */}
      {/* 1. TOP BATCH HERO SUMMARY CARD */}
      {/* ========================================================================= */}
      <div className="mos-card p-6 border border-line space-y-5 shadow-card bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-extrabold text-accent uppercase tracking-widest bg-accent-soft px-2.5 py-1 rounded-md">
                MASTER BATCH VERIFICATION
              </span>
              <Chip tone={b.status === 'active' ? 'ok' : b.status === 'draft' ? 'inherit' : 'lock'}>
                {b.status.toUpperCase()}
              </Chip>
            </div>
            <h1 className="font-head text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
              Batch {b.code} <span className="text-muted font-normal text-lg">({b.label})</span>
            </h1>
            <p className="text-xs text-muted font-mono mt-1">
              Supervisor: <strong className="text-ink">{b.supervisor_name ?? 'Ramarao'}</strong> · Process: <strong className="text-accent">{forecast?.process_code ?? 'PROCESS-2026C'}</strong> (H{baselineHours} Standard)
            </p>
          </div>

          <div className="flex flex-col items-end gap-1 text-right">
            <span className="text-[11px] font-bold text-muted uppercase tracking-wider">Actual $H_0$ Timestamp</span>
            <span className="font-mono text-sm font-extrabold text-ink bg-surface-2 px-3 py-1.5 rounded-lg border border-line">
              {b.start_at ? fmtWhen(b.start_at) : `${b.start_date} 06:00 (Pending H0)`}
            </span>
          </div>
        </div>

        {/* Dynamic Progress & Current Position */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <div className="p-3.5 rounded-xl bg-surface-2 border border-line">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted block">Current Stage</span>
            <span className="font-head text-sm font-extrabold text-ink block truncate">{currentStageName}</span>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-2 border border-line">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted block">Current Active Activity</span>
            <span className="font-head text-sm font-extrabold text-accent block truncate font-mono">
              {currentActiveActivity ? `${currentActiveActivity.code} · ${currentActiveActivity.title}` : 'None Active'}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-2 border border-line">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted block">Batch Progress</span>
            <span className="font-mono text-sm font-extrabold text-ink block">
              H{currentBatchHour} / H{baselineHours} <span className="text-muted text-xs font-normal">({completedTasks}/{totalTasks} tasks)</span>
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-2 border border-line">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted block">Attention Flags</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${pendingLabCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-surface text-muted'}`}>
                {pendingLabCount} Lab
              </span>
              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${blockedTasks > 0 ? 'bg-red-100 text-red-800' : 'bg-surface text-muted'}`}>
                {blockedTasks} Blocked
              </span>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1 pt-1">
          <div className="flex justify-between text-xs text-muted font-mono font-semibold">
            <span>Execution Timeline</span>
            <span>{Math.round((completedTasks / Math.max(1, totalTasks)) * 100)}% Complete</span>
          </div>
          <div className="w-full bg-surface-2 h-2.5 rounded-full overflow-hidden border border-line">
            <div
              className="bg-accent h-full transition-all duration-500 rounded-full"
              style={{ width: `${Math.min(100, Math.max(2, (completedTasks / Math.max(1, totalTasks)) * 100))}%` }}
            />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. QUICK VIEW FILTER TABS */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[
            { id: 'all', label: `All Timeline (${totalTasks})` },
            { id: 'active', label: `Active & Ready (${activeTasks})` },
            { id: 'evidence', label: 'Evidence Gallery (Photos)' },
            { id: 'lab_gm', label: `Lab & GM (${pendingLabCount})` },
            { id: 'blocked', label: `Blocked / Exceptions (${blockedTasks})` },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id as FilterTab)}
              className={`px-3.5 py-2 rounded-xl text-xs font-head font-bold transition-all tappable whitespace-nowrap ${
                filter === t.id
                  ? 'bg-accent text-white shadow-card'
                  : 'bg-surface border border-line text-ink-2 hover:border-accent/40'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-muted font-mono">
          Showing {filteredActivities.length} of {totalTasks} activities
        </span>
      </div>

      {/* ========================================================================= */}
      {/* 3. CHRONOLOGICAL EVIDENCE TIMELINE FEED */}
      {/* ========================================================================= */}
      {filteredActivities.length === 0 ? (
        <EmptyState title="No Activities Match Filter" detail="Select 'All Timeline' to view the complete production timeline." />
      ) : (
        <div className="space-y-4">
          {filteredActivities.map((activity) => {
            const evs = evidenceByActivity.get(activity.id) ?? [];
            const vals = valuesByActivity.get(activity.id) ?? [];
            const labItems = labByActivity.get(activity.id) ?? [];
            const devItems = deviationsByActivity.get(activity.id) ?? [];

            // Primary performer name
            const performerName =
              evs.find((e) => e.uploadedByName)?.uploadedByName ??
              activity.actual_start ? (b.supervisor_name ?? 'Shift Supervisor') : 'Unassigned';

            const startHour = activity.baseline_start_hour ?? (activity.rel_day * 24);
            const endHour = activity.baseline_end_hour ?? (startHour + (activity.duration_target_min_hr ?? 1));

            return (
              <TimelineCard
                key={activity.id}
                activity={activity}
                startHour={startHour}
                endHour={endHour}
                performerName={performerName}
                evidence={evs}
                values={vals}
                labItems={labItems}
                deviations={devItems}
                onOpenTask={() => handleOpenTask(activity.id)}
                onInspectPhoto={(img) => setInspectImage(img)}
              />
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. TASK DRAWER INSPECTOR MODAL */}
      {/* ========================================================================= */}
      {selectedTask && (
        <TaskDrawer
          activityId={selectedTask}
          batchStatus={b.status}
          onClose={() => setSelectedTask(null)}
          onChanged={() => {
            activitiesQuery.refetch();
            evidenceQuery.refetch();
            valuesQuery.refetch();
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* 5. FULL SCREEN PHOTO INSPECTOR MODAL */}
      {/* ========================================================================= */}
      {inspectImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setInspectImage(null)}
        >
          <div
            className="bg-surface rounded-2xl p-4 max-w-3xl w-full border border-line space-y-3 shadow-raised overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line pb-2">
              <div>
                <span className="font-head text-sm font-extrabold text-ink">{inspectImage.label}</span>
                {inspectImage.uploader && (
                  <p className="text-xs text-muted font-mono">
                    Captured by <strong className="text-ink">{inspectImage.uploader}</strong> {inspectImage.time ? `(${inspectImage.time})` : ''}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setInspectImage(null)}
                className="p-1 rounded-lg border border-line bg-surface-2 text-ink hover:bg-line transition-all"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="relative rounded-xl overflow-hidden bg-black flex items-center justify-center max-h-[70vh]">
              <img src={inspectImage.url} alt={inspectImage.label} className="object-contain max-h-[70vh] w-auto" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

{/* ========================================================================= */}
{/* TIMELINE ACTIVITY CARD COMPONENT */}
{/* ========================================================================= */}
function TimelineCard({
  activity,
  startHour,
  endHour,
  performerName,
  evidence,
  values,
  labItems,
  deviations,
  onOpenTask,
  onInspectPhoto,
}: {
  activity: BatchActivityRow;
  startHour: number;
  endHour: number;
  performerName: string;
  evidence: BatchFullEvidenceItem[];
  values: unknown[];
  labItems: unknown[];
  deviations: unknown[];
  onOpenTask: () => void;
  onInspectPhoto: (img: { url: string; label: string; uploader?: string; time?: string }) => void;
}) {
  const stateTone =
    activity.state === 'COMPLETED'
      ? 'ok'
      : activity.state === 'IN_PROGRESS' || activity.state === 'READY'
      ? 'accent'
      : activity.state === 'BLOCKED' || activity.state === 'DEVIATION'
      ? 'crit'
      : 'inherit';

  // Group evidence into Before and After photos
  const photoEvidence = evidence.filter((e) => e.storagePath !== null);

  return (
    <Card className="p-5 border-line space-y-4 shadow-card hover:border-accent/30 transition-all" rail={`var(--${stateTone === 'accent' ? 'accent' : stateTone})`}>
      {/* Activity Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded bg-accent/10 text-accent">
              H{startHour} → H{endHour}
            </span>
            <span className="font-mono text-xs text-muted font-bold">
              Day {activity.rel_day} · {activity.code} · {activity.scope_label}
            </span>
          </div>
          <h3 className="font-head text-lg font-extrabold text-ink">{activity.title}</h3>
        </div>

        <div className="flex items-center gap-2">
          <Chip tone={stateTone}>{activity.state}</Chip>
          <button
            type="button"
            onClick={onOpenTask}
            className="rounded-xl border border-line bg-surface-2 px-3 py-1.5 font-head text-xs font-bold text-accent hover:bg-accent-soft transition-all tappable flex items-center gap-1"
          >
            <span>Open Task</span>
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>
      </div>

      {/* Prominent Timestamps & Performer Block */}
      <div className="grid gap-3 sm:grid-cols-3 p-3.5 rounded-xl bg-surface-2 border border-line">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted block">Actual Start</span>
          <span className="font-mono text-xs font-extrabold text-ink">
            {activity.actual_start ? fmtWhen(activity.actual_start) : '— Not Started —'}
          </span>
        </div>

        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted block">Actual Finish</span>
          <span className="font-mono text-xs font-extrabold text-ink">
            {activity.actual_end ? fmtWhen(activity.actual_end) : activity.state === 'IN_PROGRESS' ? '● In Progress' : '—'}
          </span>
        </div>

        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted block">Recorded Performer</span>
          <span className="font-head text-xs font-extrabold text-accent flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">person</span>
            {performerName}
          </span>
        </div>
      </div>

      {/* Blocked / Deviation Warning */}
      {(activity.blocked_reason || deviations.length > 0) && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 space-y-1">
          <p className="font-head font-bold flex items-center gap-1.5 text-red-700">
            <span className="material-symbols-outlined text-base">warning</span>
            Blocked / Unresolved Decision Required
          </p>
          <p className="font-mono text-red-800">{activity.blocked_reason || (deviations[0] as unknown as { summary: string }).summary}</p>
        </div>
      )}

      {/* Before & After Photo Evidence Section */}
      {photoEvidence.length > 0 && (
        <div className="space-y-2 pt-1">
          <span className="label-caps text-muted text-[10px]">VERIFIED EVIDENCE PHOTOS (SUPABASE STORAGE)</span>
          <div className="grid sm:grid-cols-2 gap-3">
            {photoEvidence.map((item) => (
              <EvidencePhotoCard
                key={item.requirementId + item.storagePath}
                item={item}
                onInspect={(url) =>
                  onInspectPhoto({
                    url,
                    label: item.label,
                    uploader: item.uploadedByName ?? undefined,
                    time: item.uploadedAt ? fmtWhen(item.uploadedAt) : undefined,
                  })
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Measured Readings Grid */}
      {values.length > 0 && (
        <div className="space-y-2 pt-1">
          <span className="label-caps text-muted text-[10px]">RECORDED READINGS & SOP PARAMETERS</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {values.map((val, idx) => {
              const v = val as unknown as {
                label: string;
                sop_value?: string;
                actual_value?: string;
                operator_input?: string;
                unit?: string;
                variance_flag?: string;
              };
              const actual = v.actual_value || v.operator_input || '—';
              return (
                <div key={idx} className="p-2.5 rounded-lg bg-surface border border-line flex items-center justify-between text-xs">
                  <div>
                    <span className="font-head font-semibold text-ink block">{v.label}</span>
                    {v.sop_value && <span className="text-[10px] text-muted font-mono">SOP Spec: {v.sop_value} {v.unit ?? ''}</span>}
                  </div>
                  <div className="text-right font-mono font-extrabold text-ink">
                    <span className={v.variance_flag ? 'text-red-600' : 'text-accent'}>
                      {actual} {v.unit ?? ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lab Checkpoint Results */}
      {labItems.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-line">
          <span className="label-caps text-muted text-[10px]">LABORATORY CHECKPOINT RESULT</span>
          {labItems.map((lab, idx) => {
            const l = lab as unknown as { checkpoint_code?: string; latest_verdict?: string; decided_by_name?: string };
            return (
              <div key={idx} className="p-2.5 rounded-lg bg-accent-soft/30 border border-accent/20 flex items-center justify-between text-xs">
                <span className="font-mono font-bold text-accent">{l.checkpoint_code ?? 'Lab Checkpoint'}</span>
                <span className="font-head font-extrabold text-ink">
                  Verdict: <strong className="text-ok">{l.latest_verdict ?? 'APPROVED'}</strong> by {l.decided_by_name ?? 'Lab Tech'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

{/* ========================================================================= */}
{/* EVIDENCE PHOTO CARD COMPONENT (REAL SIGNED URL) */}
{/* ========================================================================= */}
function EvidencePhotoCard({
  item,
  onInspect,
}: {
  item: BatchFullEvidenceItem;
  onInspect: (url: string) => void;
}) {
  const signedQuery = useQuery({
    queryKey: ['signed-evidence-url', item.storagePath],
    queryFn: () => (item.storagePath ? signedEvidenceUrl(item.storagePath, 3600) : Promise.resolve(null)),
    enabled: Boolean(item.storagePath),
  });

  const isBefore = item.key.toLowerCase().includes('before') || item.label.toLowerCase().includes('before');

  if (signedQuery.isLoading) {
    return <Skeleton lines={3} label="Loading photo..." />;
  }

  const url = signedQuery.data;

  if (!url) {
    return (
      <div className="p-3 rounded-xl border border-line bg-surface-2 text-xs text-muted">
        Photo captured ({item.label})
      </div>
    );
  }

  return (
    <div
      onClick={() => onInspect(url)}
      className="p-3 rounded-xl border border-line bg-surface hover:border-accent transition-all cursor-pointer space-y-2 group tappable"
    >
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-extrabold font-mono uppercase px-2 py-0.5 rounded ${isBefore ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>
          {isBefore ? 'BEFORE PHOTO' : 'AFTER PHOTO'}
        </span>
        {item.uploadedByName && (
          <span className="text-[11px] text-muted font-mono font-semibold">
            {item.uploadedByName}
          </span>
        )}
      </div>

      <div className="relative aspect-video rounded-lg overflow-hidden bg-black/10 border border-line flex items-center justify-center">
        <img src={url} alt={item.label} className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300" />
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="material-symbols-outlined text-white text-2xl drop-shadow-md">zoom_in</span>
        </div>
      </div>

      <div className="flex justify-between items-center text-[11px] text-muted font-mono">
        <span className="truncate">{item.label}</span>
        {item.uploadedAt && <span>{fmtWhen(item.uploadedAt)}</span>}
      </div>
    </div>
  );
}
