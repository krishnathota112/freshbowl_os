import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../../shared/api/client';
import { PageHeading } from '../../../shared/ui/layout/PageHeading';
import { Chip, EmptyState, Skeleton } from '../../../shared/ui/primitives';

/**
 * GM · People (0103, 15 Sep 2026). Who is doing the work today, and every override or decision.
 * Numbers are the server's (`v_person_activity`, `v_override_log`); the views return nothing to a supervisor or Lab.
 */
type Person = {
  person_id: string;
  display_name: string;
  role: string;
  started_today: number;
  finished_today: number;
  open_now: number;
  late_finishes_today: number;
  late_before_photos_today: number;
  tickets_today: number;
  tickets_rejected_today: number;
  photos_today: number;
  last_action_at: string | null;
  last_action: string | null;
};

type Override = {
  id: string;
  occurred_at: string;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  reason: string | null;
  batch_code: string | null;
  activity_title: string | null;
  scope_label: string | null;
};

const ROLE_WORDS: Record<string, string> = {
  supervisor: 'Supervisor',
  lab_tech: 'Lab',
  gm: 'GM',
  admin: 'Admin',
  manager: 'Manager',
};

const ACTION_WORDS: Record<string, string> = {
  onboard_batch: 'Onboarded a running batch',
  mark_batch_demo: 'Marked a batch DEMO / TEST',
  correct_actual: 'Corrected a recorded time',
  admin_decide_extension: 'Decided a late ticket',
  cancel_batch: 'Cancelled a batch',
  hold_activity: 'Put a task on hold',
  release_activity: 'Released a hold',
  return_activity: 'Sent a task back',
  skip_activity: 'Skipped a task',
  accept_with_deviation: 'Accepted a deviation',
  gm_decide_override: 'Decided an override',
  verify_corrective_action: 'Verified a corrective action',
  decide_lab_submission: 'Decided a Lab submission',
  set_current_process: 'Changed the current process',
  publish_process_definition: 'Published a process version',
  activate_batch: 'Activated a batch',
  set_batch_start_at: 'Set a batch start (H0)',
  assign_activity: 'Assigned a task',
  request_extension: 'Raised a late ticket',
  cancel_extension: 'Withdrew a late ticket',
  start_activity: 'Started a task',
  submit_activity: 'Finished a task',
  bind_evidence: 'Took a photo',
  record_lab_result: 'Recorded a Lab reading',
  open_lab_sample: 'Took a Lab sample',
  admin_force_open: 'Admin opened a stuck task',
  admin_mark_done: 'Admin marked a task done',
  admin_reopen_task: 'Admin reopened a task',
  admin_create_user: 'Created a login',
  admin_set_password: 'Changed a password',
  admin_set_user_role: 'Changed a role',
  admin_activate_user: 'Switched a login on',
  admin_deactivate_user: 'Switched a login off',
};

const words = (a: string | null) => (a ? ACTION_WORDS[a] ?? a.replace(/_/g, ' ') : '—');

function ago(iso: string | null): string {
  if (!iso) return 'no activity yet';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${min % 60} min ago`;
  return new Date(iso).toLocaleDateString([], { day: '2-digit', month: 'short' });
}

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function GmPeople() {
  const people = useQuery({
    queryKey: ['person-activity'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_person_activity').select('*');
      if (error) throw error;
      return (data ?? []) as Person[];
    },
    refetchInterval: 60_000,
  });
  const overrides = useQuery({
    queryKey: ['override-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_override_log')
        .select('id, occurred_at, actor_name, actor_role, action, reason, batch_code, activity_title, scope_label')
        .order('occurred_at', { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data ?? []) as Override[];
    },
    refetchInterval: 60_000,
  });

  const floor = (people.data ?? [])
    .filter((p) => p.role === 'supervisor' || p.role === 'lab_tech')
    .sort((a, b) => (b.last_action_at ?? '').localeCompare(a.last_action_at ?? ''));

  return (
    <div className="mx-auto max-w-2xl pb-16">
      <PageHeading title="People" subtitle="Today on the floor · who did what" />

      {people.isLoading && <Skeleton label="Loading people" lines={3} />}
      {people.error && <EmptyState title="People could not be loaded" detail={(people.error as Error).message} />}

      <section className="grid gap-3">
        {floor.map((p) => (
          <PersonCard key={p.person_id} p={p} />
        ))}
        {people.data && floor.length === 0 && (
          <EmptyState title="No supervisor or Lab account is active" detail="People appear here once their accounts are active." />
        )}
      </section>

      <h2 className="mb-2 mt-8 font-head text-[13px] font-800 uppercase tracking-wider text-muted">
        Overrides and decisions
      </h2>
      {overrides.isLoading && <Skeleton label="Loading the log" lines={3} />}
      {overrides.data && overrides.data.length === 0 && (
        <p className="text-[14px] text-muted">Nothing has been overridden or decided yet.</p>
      )}
      <ol className="grid gap-2">
        {(overrides.data ?? []).map((o) => (
          <li key={o.id} className="rounded-xl border bg-surface px-4 py-3" style={{ borderColor: 'var(--line)' }}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-head text-[15px] font-700">{words(o.action)}</span>
              <span className="mono text-[12px] text-muted">{when(o.occurred_at)}</span>
            </div>
            <p className="mt-0.5 text-[13px] text-ink2">
              {o.actor_name ?? 'System'}
              {o.actor_role ? ` · ${ROLE_WORDS[o.actor_role] ?? o.actor_role}` : ''}
              {o.batch_code ? ` · ${o.batch_code}` : ''}
              {o.activity_title ? ` · ${o.activity_title}${o.scope_label ? ` (${o.scope_label})` : ''}` : ''}
            </p>
            {o.reason && <p className="mt-1 text-[13px] text-ink">“{o.reason}”</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function PersonCard({ p }: { p: Person }) {
  const flags = [
    p.late_finishes_today > 0 && `${p.late_finishes_today} finished late`,
    p.late_before_photos_today > 0 && `${p.late_before_photos_today} before photo late`,
    p.tickets_rejected_today > 0 && `${p.tickets_rejected_today} ticket rejected`,
    p.open_now > 2 && `${p.open_now} tasks open at once`,
  ].filter(Boolean) as string[];

  return (
    <article
      className="rounded-2xl border bg-surface p-4"
      style={{ borderColor: flags.length > 0 ? 'var(--warn)' : 'var(--line)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-head text-[18px] font-800 leading-tight">{p.display_name}</h3>
          <p className="text-[13px] text-muted">
            {words(p.last_action)} · {ago(p.last_action_at)}
          </p>
        </div>
        <Chip tone="muted">{ROLE_WORDS[p.role] ?? p.role}</Chip>
      </div>

      <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
        <Stat label="Started" value={p.started_today} />
        <Stat label="Finished" value={p.finished_today} />
        <Stat label="Open now" value={p.open_now} />
        <Stat label="Photos" value={p.photos_today} />
      </dl>

      {(flags.length > 0 || p.tickets_today > 0) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {flags.map((f) => (
            <Chip key={f} tone="warn">{f}</Chip>
          ))}
          {p.tickets_today > 0 && <Chip tone="muted">{p.tickets_today} late ticket{p.tickets_today === 1 ? '' : 's'}</Chip>}
        </div>
      )}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl py-2" style={{ background: 'var(--surface-2)' }}>
      <dd className="mono text-[20px] font-800">{value}</dd>
      <dt className="text-[11px] text-muted">{label}</dt>
    </div>
  );
}

export default GmPeople;
