import { useQuery } from '@tanstack/react-query';
import { supabase } from '../api/client';
import { PageHeading } from '../components/layout/AppShell';
import { Card, Chip, ConflictMarker } from '../components/primitives';

/** Reference data as seeded: materials and their roles, lab specs, the conflict register. */
export function ReferenceData() {
  const q = useQuery({
    queryKey: ['reference'],
    queryFn: async () => {
      const [mats, elig, specs, methods, conflicts] = await Promise.all([
        supabase.from('material').select('id, code, name, category').order('code'),
        supabase.from('material_role_eligibility').select('role, material_id, is_default_lead, tbd_marker'),
        supabase
          .from('lab_spec')
          .select('checkpoint_code, parameter_code, min_value, max_value, unit, source_ref, conflict_id')
          .order('checkpoint_code'),
        supabase.from('lab_method').select('code, name, calculation_formula, conflict_id').order('code'),
        supabase
          .from('conflict_register')
          .select('conflict_id, kind, severity, status, question, ship_with_default')
          .order('conflict_id'),
      ]);
      for (const r of [mats, elig, specs, methods, conflicts]) if (r.error) throw r.error;
      return {
        mats: mats.data ?? [],
        elig: elig.data ?? [],
        specs: specs.data ?? [],
        methods: methods.data ?? [],
        conflicts: conflicts.data ?? [],
      };
    },
  });

  if (q.isLoading) return <p className="text-sm text-muted">Loading…</p>;
  const d = q.data!;
  const nameOf = (id: string) => d.mats.find((m) => m.id === id)?.name ?? '—';
  const roles = [...new Set(d.elig.map((e) => e.role))];

  return (
    <>
      <PageHeading
        title="Reference data"
        subtitle="Materials bind to roles. Specs carry their source. Nothing is resolved that the sources leave open."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
            Material roles
          </p>
          <div className="mt-3 flex flex-col gap-3">
            {roles.map((role) => {
              const rows = d.elig.filter((e) => e.role === role);
              const tbd = rows.find((r) => r.tbd_marker)?.tbd_marker;
              return (
                <div key={role}>
                  <div className="flex items-center gap-2">
                    <span className="mono text-[11px] font-600">{role}</span>
                    {tbd && <ConflictMarker id={tbd} />}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {rows.map((r) => (
                      <span
                        key={r.material_id}
                        className="rounded border px-1.5 py-0.5 text-[11px]"
                        style={{
                          borderColor: r.is_default_lead ? 'var(--accent)' : 'var(--line-2)',
                          background: r.is_default_lead ? 'var(--accent-soft)' : 'transparent',
                          color: r.is_default_lead ? 'var(--accent-ink)' : 'var(--ink-2)',
                        }}
                      >
                        {nameOf(r.material_id)}
                        {r.is_default_lead ? ' · lead' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-muted">
            The lead material names the stream. Bagasse leading primary fibre renders "Bagasse
            Weighment"; mustard leading it renders "Mustard Straw Weighment". Same activity code,
            same gates.
          </p>
        </Card>

        <Card className="p-4">
          <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
            Lab methods
          </p>
          <table className="mt-2 w-full text-left">
            <tbody>
              {d.methods.map((m) => (
                <tr key={m.code} style={{ borderTop: '1px solid var(--line)' }}>
                  <td className="mono py-1 align-top text-[11px]">{m.code}</td>
                  <td className="py-1 align-top text-[12px] text-ink2">
                    {m.name}
                    <div className="mono text-[10px] text-muted">{m.calculation_formula}</div>
                  </td>
                  <td className="py-1 align-top">
                    {m.conflict_id && <ConflictMarker id={m.conflict_id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted">
            Three calculations are transcription-damaged in the source manual and carry C-10.
            Shipping a known-wrong procedure as authoritative would be worse than shipping none.
          </p>
        </Card>
      </div>

      <Card className="mt-4 p-4">
        <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
          Lab specifications · {d.specs.length} rows
        </p>
        <div className="mt-2 max-h-80 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted">
                <th className="py-1 pr-2">Checkpoint</th>
                <th className="py-1 pr-2">Parameter</th>
                <th className="py-1 pr-2">Band</th>
                <th className="py-1 pr-2">Source</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {d.specs.map((s) => (
                <tr
                  key={`${s.checkpoint_code}-${s.parameter_code}`}
                  style={{ borderTop: '1px solid var(--line)' }}
                >
                  <td className="mono py-1 pr-2 text-[11px]">{s.checkpoint_code}</td>
                  <td className="mono py-1 pr-2 text-[11px] text-ink2">{s.parameter_code}</td>
                  <td className="mono py-1 pr-2 text-[11px]">
                    {s.min_value === null && s.max_value === null
                      ? '—'
                      : `${s.min_value ?? ''}–${s.max_value ?? ''} ${s.unit ?? ''}`}
                  </td>
                  <td className="py-1 pr-2 text-[10px] text-muted">{s.source_ref}</td>
                  <td className="py-1">{s.conflict_id && <ConflictMarker id={s.conflict_id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          An em dash means no source gives a bound. Those parameters are recorded and trended but
          never auto-failed — inventing a threshold the factory never stated would be worse than
          having none.
        </p>
      </Card>

      <Card className="mt-4 p-4">
        <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
          Conflict register · {d.conflicts.length} entries
        </p>
        <div className="mt-2 max-h-96 overflow-auto">
          <table className="w-full text-left">
            <tbody>
              {d.conflicts.map((c) => (
                <tr key={c.conflict_id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td className="mono py-1.5 pr-2 align-top text-[11px] font-600">
                    {c.conflict_id}
                  </td>
                  <td className="py-1.5 pr-2 align-top">
                    <Chip
                      tone={
                        c.status === 'decided'
                          ? 'ok'
                          : c.severity === 'blocks_build'
                            ? 'crit'
                            : c.severity === 'blocks_behaviour'
                              ? 'warn'
                              : 'muted'
                      }
                    >
                      {c.status === 'decided' ? 'frozen' : (c.severity ?? c.kind)}
                    </Chip>
                  </td>
                  <td className="py-1.5 align-top text-[12px] text-ink2">
                    {c.question}
                    {c.ship_with_default && (
                      <div className="mt-0.5 text-[11px] text-muted">
                        ships as: {c.ship_with_default}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
