import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listBatches } from '../api/batch';
import { supabase } from '../api/client';
import { PageHeading } from '../components/layout/AppShell';
import { Card, Chip, EmptyState } from '../components/primitives';

/** Every batch, newest first, with what each is waiting on. */
export function Batches() {
  const batches = useQuery({ queryKey: ['batches'], queryFn: listBatches });

  const progress = useQuery({
    queryKey: ['batch-progress'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batch_activity')
        .select('master_batch_id, state');
      if (error) throw error;
      const m = new Map<string, { total: number; done: number; open: number; flagged: number }>();
      for (const r of data ?? []) {
        const k = r.master_batch_id as string;
        const e = m.get(k) ?? { total: 0, done: 0, open: 0, flagged: 0 };
        e.total += 1;
        if (r.state === 'COMPLETED') e.done += 1;
        if (r.state === 'READY' || r.state === 'IN_PROGRESS') e.open += 1;
        if (r.state === 'DEVIATION' || r.state === 'BLOCKED') e.flagged += 1;
        m.set(k, e);
      }
      return m;
    },
  });

  if (batches.isLoading) return <p className="text-sm text-muted">Loading…</p>;
  const rows = batches.data ?? [];

  return (
    <>
      <PageHeading
        title="Batches"
        subtitle="A batch is a graph of parallel streams, not a linear checklist"
        right={
          <Link
            to="/admin/batch/new"
            className="rounded px-3 py-2 font-head text-[12px] font-700"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Start a new batch
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No batches yet"
          detail="Start one and the process definition generates every task, target and evidence requirement for it."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((b) => {
            const p = progress.data?.get(b.id);
            return (
              <Link
                key={b.id}
                to={`/admin/batch/${b.id}`}
                className="rounded-md border bg-surface p-4"
                style={{
                  borderColor: 'var(--line)',
                  borderLeftWidth: 3,
                  borderLeftColor:
                    b.status === 'active' ? 'var(--ok)'
                    : b.status === 'draft' ? 'var(--inherit)'
                    : 'var(--lock)',
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-head text-[15px] font-800">{b.label}</p>
                  <Chip
                    tone={b.status === 'active' ? 'ok' : b.status === 'draft' ? 'inherit' : 'lock'}
                  >
                    {b.status}
                  </Chip>
                </div>
                <p className="mono mt-1 text-[11px] text-muted">
                  Day 0 · {new Date(b.start_date).toDateString()}
                </p>
                {p && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                    <span className="mono text-[11px] text-ink2">{p.total} tasks</span>
                    <span className="mono text-[11px]" style={{ color: 'var(--ok)' }}>
                      {p.done} done
                    </span>
                    <span className="mono text-[11px]" style={{ color: 'var(--accent-ink)' }}>
                      {p.open} open
                    </span>
                    {p.flagged > 0 && (
                      <span className="mono text-[11px]" style={{ color: 'var(--crit)' }}>
                        {p.flagged} flagged
                      </span>
                    )}
                  </div>
                )}
                {b.supervisor_name && (
                  <p className="mt-2 text-[11px] text-muted">Supervisor {b.supervisor_name}</p>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <Card className="mt-5 p-4">
        <p className="text-[12px] leading-relaxed text-muted">
          Starting a batch asks five short questions. Everything else — which activities exist,
          how many instances of each, what the operator records, what must be photographed, and
          which gate blocks what — is generated from the process definition. That is why adding
          an activity is a data change rather than a release.
        </p>
      </Card>
    </>
  );
}
