import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  allocateVessel,
  cancelCleaning,
  loadResourceNeeds,
  loadVessels,
  requestCleaning,
  type ResourceNeed,
  type VesselReadiness,
} from '../../../shared/api/resources';
import { listActivePeople } from '../api/intake';
import { PageHeading } from '../../../shared/ui/layout/PageHeading';
import { Chip, EmptyState, Skeleton } from '../../../shared/ui/primitives';
import { humanError } from '../../../shared/utils/humanError';

/**
 * Admin · Resources (spec §6). Which bunkers and tunnels are free, in use or waiting to be cleaned; what the
 * running batches will need and when; and the two Admin actions: ask for a vessel to be cleaned, and give an
 * exact vessel to an exact step. Readiness, needs and refusals all come from the server (0110 / 0111).
 */
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export function AdminResources() {
  const qc = useQueryClient();
  const vessels = useQuery({ queryKey: ['vessels'], queryFn: () => loadVessels(), refetchInterval: 60_000 });
  const needs = useQuery({ queryKey: ['resource-needs'], queryFn: loadResourceNeeds, refetchInterval: 60_000 });
  const people = useQuery({ queryKey: ['active-people'], queryFn: listActivePeople });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['vessels'] });
    qc.invalidateQueries({ queryKey: ['resource-needs'] });
  };

  const act = useMutation({
    mutationFn: async (fn: () => Promise<void>) => fn(),
    onSuccess: () => {
      setMsg({ ok: true, text: 'Done.' });
      refresh();
    },
    onError: (e) => {
      const h = humanError(e);
      setMsg({ ok: false, text: h.detail || h.title || (e as Error).message });
    },
  });

  const rows = vessels.data ?? [];
  const bunkers = rows.filter((v) => v.kind === 'BUNKER');
  const tunnels = rows.filter((v) => v.kind === 'TUNNEL');
  const supervisors = (people.data ?? []).filter((p) => ['supervisor', 'operator'].includes(p.role));
  const upcoming = (needs.data ?? []).filter((n) => !n.allocated_location).slice(0, 8);

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <PageHeading title="Resources" subtitle="Bunkers and tunnels: free, in use, or waiting to be cleaned" />

      {msg && (
        <p className="mb-3 rounded-lg border px-3 py-2 text-[13px] font-600"
           style={{ borderColor: msg.ok ? 'var(--ok)' : 'var(--crit)', color: msg.ok ? 'var(--ok)' : 'var(--crit)' }}>
          {msg.text}
        </p>
      )}

      <section className="mb-6">
        <h2 className="mb-2 font-head text-[13px] font-800 uppercase tracking-wider text-muted">What the batches will need</h2>
        {needs.isLoading && <Skeleton label="Reading upcoming needs" lines={2} />}
        {upcoming.length === 0 && !needs.isLoading && (
          <p className="text-[14px] text-muted">Nothing needs a bunker or tunnel yet.</p>
        )}
        <ul className="grid gap-2">
          {upcoming.map((n) => (
            <NeedRow key={n.activity_id} n={n} vessels={rows} onAllocate={(locationId) =>
              act.mutate(() => allocateVessel({
                batchId: n.master_batch_id, scope: n.scope, instanceNo: 1, locationId,
                activityCode: n.activity_code, note: `${n.batch_code} · ${n.title}`,
              }))} />
          ))}
        </ul>
      </section>

      <VesselGroup title="Bunkers" rows={bunkers} supervisors={supervisors}
        onClean={(v, person) => act.mutate(() => requestCleaning({ locationId: v.location_id, assignedTo: person, note: 'Cleaning before the next batch' }))}
        onCancel={(taskId) => act.mutate(() => cancelCleaning(taskId, 'Cancelled by Admin'))} />
      <VesselGroup title="Tunnels" rows={tunnels} supervisors={supervisors}
        onClean={(v, person) => act.mutate(() => requestCleaning({ locationId: v.location_id, assignedTo: person, note: 'Cleaning before the next batch' }))}
        onCancel={(taskId) => act.mutate(() => cancelCleaning(taskId, 'Cancelled by Admin'))} />

      {vessels.error && <EmptyState title="Resources could not be loaded" detail={(vessels.error as Error).message} />}
    </div>
  );
}

function NeedRow({ n, vessels, onAllocate }: { n: ResourceNeed; vessels: VesselReadiness[]; onAllocate: (locationId: string) => void }) {
  const [picked, setPicked] = useState('');
  const options = vessels.filter((v) => v.kind === n.needs_kind && v.is_ready);
  return (
    <li className="rounded-xl border px-4 py-3" style={{ borderColor: 'var(--line)' }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-head text-[15px] font-700">{n.batch_code} · {n.title}</span>
        <span className="text-[12px] text-muted">needs a {n.needs_kind.toLowerCase()} around {when(n.needed_at)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`pick-${n.activity_id}`}>Choose the vessel</label>
        <select id={`pick-${n.activity_id}`} value={picked} onChange={(e) => setPicked(e.target.value)}
                className="rounded-lg border bg-surface px-3 text-[14px]" style={{ minHeight: 44, borderColor: 'var(--line-2)' }}>
          <option value="">Choose a ready {n.needs_kind.toLowerCase()}…</option>
          {options.map((v) => <option key={v.location_id} value={v.location_id}>{v.label}</option>)}
        </select>
        <button type="button" disabled={!picked} onClick={() => onAllocate(picked)}
                className="rounded-lg border px-4 font-head text-[14px] font-700 disabled:opacity-40"
                style={{ minHeight: 44, borderColor: 'var(--accent)', color: 'var(--accent-ink)' }}>
          Give it this one
        </button>
        <span className="text-[12px] text-muted">{options.length} ready</span>
      </div>
    </li>
  );
}

function VesselGroup({ title, rows, supervisors, onClean, onCancel }: {
  title: string;
  rows: VesselReadiness[];
  supervisors: { id: string; display_name: string }[];
  onClean: (v: VesselReadiness, person: string | null) => void;
  onCancel: (taskId: string) => void;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 font-head text-[13px] font-800 uppercase tracking-wider text-muted">{title}</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((v) => <VesselCard key={v.location_id} v={v} supervisors={supervisors} onClean={onClean} onCancel={onCancel} />)}
      </div>
    </section>
  );
}

function VesselCard({ v, supervisors, onClean, onCancel }: {
  v: VesselReadiness;
  supervisors: { id: string; display_name: string }[];
  onClean: (v: VesselReadiness, person: string | null) => void;
  onCancel: (taskId: string) => void;
}) {
  const [person, setPerson] = useState('');
  const tone = v.occupied_by_batch ? 'accent' : v.is_ready ? 'ok' : 'warn';
  return (
    <article className="rounded-xl border bg-surface px-4 py-3" style={{ borderColor: v.is_ready ? 'var(--line)' : 'var(--warn)' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-head text-[16px] font-700">{v.label}</span>
        <Chip tone={tone}>{v.occupied_by_batch ? `in use · ${v.occupied_by_batch}` : v.is_ready ? 'ready' : 'needs cleaning'}</Chip>
      </div>
      <p className="mt-0.5 text-[12px] text-muted">
        {v.not_ready_reason ?? (v.last_cleaned_at ? `Cleaned ${when(v.last_cleaned_at)}${v.last_cleaned_by ? ` by ${v.last_cleaned_by}` : ''}` : 'Never used')}
      </p>

      {v.open_task_id ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Chip tone="muted">cleaning {v.open_task_state === 'IN_PROGRESS' ? 'under way' : 'requested'}{v.open_task_assigned_name ? ` · ${v.open_task_assigned_name}` : ''}</Chip>
          <button type="button" onClick={() => onCancel(v.open_task_id!)}
                  className="rounded-lg border px-3 font-head text-[13px] font-600"
                  style={{ minHeight: 40, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}>
            Cancel the job
          </button>
        </div>
      ) : (
        !v.is_ready && !v.occupied_by_batch && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`who-${v.location_id}`}>Who cleans it</label>
            <select id={`who-${v.location_id}`} value={person} onChange={(e) => setPerson(e.target.value)}
                    className="rounded-lg border bg-surface px-3 text-[14px]" style={{ minHeight: 40, borderColor: 'var(--line-2)' }}>
              <option value="">Anyone</option>
              {supervisors.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </select>
            <button type="button" onClick={() => onClean(v, person || null)}
                    className="rounded-lg border px-3 font-head text-[13px] font-700"
                    style={{ minHeight: 40, borderColor: 'var(--accent)', color: 'var(--accent-ink)' }}>
              Ask for cleaning
            </button>
          </div>
        )
      )}
    </article>
  );
}

export default AdminResources;
