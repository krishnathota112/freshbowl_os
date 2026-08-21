import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '../api/client';
import { PageHeading } from '../components/layout/AppShell';
import { Card, Chip, ConflictMarker, EmptyState, Stat } from '../components/primitives';

/**
 * Admin's home. In the finished product this is today's schedule with "start these" and
 * "these are running". Neither exists yet — there is no schedule import and no batch — so
 * it shows what Steps 1 and 2 actually produced, honestly labelled.
 */
export function AdminToday() {
  const q = useQuery({
    queryKey: ['admin-today'],
    queryFn: async () => {
      const [defs, acts, gates, conflicts, evidence, mapping] = await Promise.all([
        supabase.from('process_definition').select('code, name, status, total_days'),
        supabase.from('process_activity').select('id, process_definition_id, is_time_gate'),
        supabase.from('gate_rule').select('mapping_confidence, is_enabled'),
        supabase.from('conflict_register').select('conflict_id, kind, status, severity, question'),
        supabase.from('evidence_requirement').select('id'),
        supabase.from('v_sop_limit_mapping').select('mapping_confidence'),
      ]);
      for (const r of [defs, acts, gates, conflicts, evidence, mapping]) {
        if (r.error) throw r.error;
      }
      return {
        defs: defs.data ?? [],
        acts: acts.data ?? [],
        gates: gates.data ?? [],
        conflicts: conflicts.data ?? [],
        evidence: evidence.data ?? [],
        mapping: mapping.data ?? [],
      };
    },
  });

  if (q.isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (q.error) {
    return (
      <EmptyState
        title="Could not read reference data"
        detail={(q.error as Error).message}
      />
    );
  }

  const d = q.data!;
  const published = d.defs.find((x) => x.status === 'published');
  const archived = d.defs.find((x) => x.status === 'archived');
  const pubId = d.defs.length ? undefined : undefined; // ids not selected; count below by def
  void pubId;

  const disabledGates = d.gates.filter((g) => !g.is_enabled).length;
  const openConflicts = d.conflicts.filter((c) => c.status === 'open');
  const decided = d.conflicts.filter((c) => c.status === 'decided');
  const blockers = openConflicts.filter((c) => c.severity === 'blocks_build');

  return (
    <>
      <PageHeading
        title="Today"
        subtitle={new Date().toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-3" rail="var(--ok)">
          <Stat
            label="Process definition"
            value={published?.code ?? '—'}
            compare={published ? `published · ${published.total_days} days` : 'none published'}
          />
        </Card>
        <Card className="p-3">
          <Stat label="Activity templates" value={d.acts.length} compare="across both definitions" />
        </Card>
        <Card className="p-3">
          <Stat
            label="Evidence requirements"
            value={d.evidence.length}
            compare="named, individually satisfied"
          />
        </Card>
        <Card className="p-3" rail="var(--warn)">
          <Stat
            label="Gates shipped disabled"
            value={disabledGates}
            tone="warn"
            compare="ambiguous SOP mappings · C-28"
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
            Starting today
          </p>
          <div className="mt-3">
            <EmptyState
              title="No batch can start yet"
              detail="A master batch is instantiated from an approved schedule slot, and the schedule importer arrives in Step 4. Admin never types a batch number — that is the point of the slot being upstream."
            />
          </div>
        </Card>

        <Card className="p-4">
          <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
            Needs me
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {blockers.map((c) => (
              <li
                key={c.conflict_id}
                className="rounded border px-2 py-1.5"
                style={{ borderColor: 'var(--crit)', background: 'var(--crit-soft)' }}
              >
                <div className="flex items-center gap-2">
                  <ConflictMarker id={c.conflict_id} />
                  <Chip tone="crit">blocks build</Chip>
                </div>
                <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-2)' }}>
                  {c.question}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted">
            {openConflicts.length} open, {decided.length} decided. Every one is carried as data and
            rendered where it matters — none are silently resolved.
          </p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
            SOP reference
          </p>
          <p className="mt-2 text-[13px] text-ink2">
            <span className="mono">{archived?.code ?? '—'}</span> is seeded{' '}
            <Chip tone="lock">archived</Chip> — queryable and citable, never executable. Its
            process-control limits are mapped onto the current process with a confidence flag, and
            an ambiguous mapping ships disabled.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {['dictated', 'sop_direct', 'sop_inferred', 'unmapped'].map((c) => {
              const n = d.gates.filter((g) => g.mapping_confidence === c).length;
              const enabled = d.gates.filter((g) => g.mapping_confidence === c && g.is_enabled).length;
              return (
                <span
                  key={c}
                  className="rounded border px-2 py-1"
                  style={{ borderColor: 'var(--line-2)' }}
                >
                  <span className="mono text-[11px] text-ink2">{c}</span>{' '}
                  <span className="mono text-[11px] text-muted">
                    {n} · {enabled} on
                  </span>
                </span>
              );
            })}
          </div>
        </Card>

        <Card className="p-4">
          <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
            Look at the process
          </p>
          <p className="mt-2 text-[13px] text-ink2">
            The process definition is data. Change which material leads a role and every label in
            that stream follows; change a quantity and the instance count recalculates. Neither
            needs a code change.
          </p>
          <Link
            to="/admin/process-explorer"
            className="mt-3 inline-block rounded px-3 py-2 font-head text-[12px] font-700"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Open the process explorer
          </Link>
        </Card>
      </div>
    </>
  );
}
