import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../api/client';

/**
 * When a task must be finished (0100 · activity_due): the day-plan end, plus every extra hour granted on late
 * tickets for this task or a step before it, plus the grace. Shown so a granted ticket is visible where people look.
 */
export type Due = {
  plannedEnd: string | null;
  shiftHr: number;
  extendedEnd: string | null;
  dueAt: string | null;
  applies: boolean;
};

export function useDue(activityId: string, enabled = true) {
  return useQuery({
    queryKey: ['activity-due', activityId],
    enabled,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Due | null> => {
      const { data, error } = await supabase.rpc('activity_due', { p_activity: activityId });
      if (error) throw error;
      const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
      if (!r) return null;
      return {
        plannedEnd: (r.planned_end_at as string | null) ?? null,
        shiftHr: Number(r.shift_hr ?? 0),
        extendedEnd: (r.extended_end_at as string | null) ?? null,
        dueAt: (r.due_at as string | null) ?? null,
        applies: Boolean(r.applies),
      };
    },
  });
}

const hm = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
const dayHm = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  return same ? hm(iso) : d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export function extraWords(hours: number): string {
  const min = Math.round(hours * 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** One line for a task card: "Finish by 15:02 · +30 min extra time". */
export function DueLine({ activityId, tone = 'dark' }: { activityId: string; tone?: 'dark' | 'light' }) {
  const due = useDue(activityId);
  const d = due.data;
  if (!d || !d.applies || !d.extendedEnd) return null;
  const late = d.dueAt ? Date.now() > Date.parse(d.dueAt) : false;
  const color = tone === 'light' ? '#fff' : late ? 'var(--crit)' : 'var(--ink)';
  return (
    <span className="font-600" style={{ color }}>
      {late ? 'Was due ' : 'Finish by '}
      <strong className="font-mono">{dayHm(d.extendedEnd)}</strong>
      {d.shiftHr > 0 && <span style={{ color: tone === 'light' ? '#fff' : 'var(--ok)' }}> · +{extraWords(d.shiftHr)} extra time</span>}
    </span>
  );
}

/** The full box on the task screen. */
export function DueCard({ activityId }: { activityId: string }) {
  const due = useDue(activityId);
  const d = due.data;
  if (!d || !d.applies || !d.extendedEnd) return null;
  const late = d.dueAt ? Date.now() > Date.parse(d.dueAt) : false;
  return (
    <section
      className="mb-4 rounded-xl border px-4 py-3"
      style={{ borderColor: late ? 'var(--crit)' : d.shiftHr > 0 ? 'var(--ok)' : 'var(--line-2)', background: late ? 'var(--crit-soft)' : 'var(--surface)' }}
    >
      <p className="text-[12px] font-700 uppercase tracking-wider text-muted">{late ? 'Late' : 'Finish by'}</p>
      <p className="font-head text-[24px] font-800 leading-tight" style={{ color: late ? 'var(--crit)' : 'var(--ink)' }}>
        {dayHm(d.extendedEnd)}
      </p>
      <p className="mt-1 text-[13px] text-ink2">
        Planned end {dayHm(d.plannedEnd)}
        {d.shiftHr > 0 && (
          <>
            {' '}· <strong style={{ color: 'var(--ok)' }}>+{extraWords(d.shiftHr)} extra time granted</strong>
          </>
        )}
      </p>
      <p className="mt-0.5 text-[12px] text-muted">
        {late
          ? 'Past the last allowed time. Raise a late ticket below to ask Admin for more time.'
          : `Blocked after ${dayHm(d.dueAt)} unless Admin grants more time.`}
      </p>
    </section>
  );
}
