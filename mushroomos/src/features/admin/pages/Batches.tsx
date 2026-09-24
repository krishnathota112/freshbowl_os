import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listBatches } from '../../../shared/api/batch';
import { supabase } from '../../../shared/api/client';
import { PageHeading } from '../../../shared/ui/layout/PageHeading';
import { Card, Chip, EmptyState } from '../../../shared/ui/primitives';
import { ClearBatchesPanel } from '../components/ClearBatchesPanel';

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
        if (r.state === 'IN_DEVIATION') e.flagged += 1;
        m.set(k, e);
      }
      return m;
    },
  });

  const [showCancelled, setShowCancelled] = useState(false);

  if (batches.isLoading) return <p className="text-sm text-muted">Loading…</p>;
  const all = (batches.data ?? []) as any[];
  // Cancelled batches stay on record (audited, never deleted) but are not live work, so they are
  // hidden unless asked for.
  const cancelledCount = all.filter((b) => b.status === 'cancelled').length;
  const rows = showCancelled ? all : all.filter((b) => b.status !== 'cancelled');

  return (
    <>
      <PageHeading
        title="Batches"
        subtitle={`${rows.length} shown${cancelledCount > 0 && !showCancelled ? ` · ${cancelledCount} cancelled hidden` : ''}`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <ClearBatchesPanel batches={all} />
            {cancelledCount > 0 && (
              <button
                type="button"
                onClick={() => setShowCancelled((v) => !v)}
                className="inline-flex items-center rounded border px-3 py-1.5 font-head text-[13px] font-600"
                style={{ minHeight: 44, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
              >
                {showCancelled ? 'Hide cancelled' : `Show cancelled (${cancelledCount})`}
              </button>
            )}
            {/* A DEMO / TEST batch is a real batch without the clock (0098): the same process, order,
                photos, readings, approvals and roles, but no time gates or rests. Nothing is filled in for it. */}
            <Link
              to="/admin/batch/start?demo=1"
              className="inline-flex items-center rounded px-3 py-1.5 font-head text-[13px] font-700 bg-surface-2 border border-line text-ink hover:bg-surface-3"
              style={{ minHeight: 44 }}
            >
              + Demo/Test Batch
            </Link>
            <Link
              to="/admin/batch/start"
              className="inline-flex items-center rounded px-3 py-1.5 font-head text-[13px] font-700"
              style={{ minHeight: 44, background: 'var(--accent)', color: '#fff' }}
            >
              Start a new batch
            </Link>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No batches yet"
          detail="Start one and the process definition generates every task, target and evidence requirement for it."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((b: any) => {
            const p = progress.data?.get(b.id);
            return (
              <Link
                key={b.id}
                to={`/batch/${b.id}`}
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
                  {b.is_demo && <Chip tone="warn">DEMO</Chip>}
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
