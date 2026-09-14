import { useQuery } from '@tanstack/react-query';
import { supabase } from '../api/client';
import { PageHeading } from '../components/layout/PageHeading';
import { Card, Chip, EmptyState, Stat } from '../components/primitives';

/**
 * S14 · Manager resources. `UI_IMPLEMENTATION_PLAN §S14`.
 *
 * Extracted from `routes/Placeholders.tsx` into its own file, which `UI_IMPLEMENTATION_PLAN §3.1`
 * asked for — "extracted to its own file, Gantt added at A5" — and which C-FIELD now requires: this
 * is where `VesselGantt` and `MachineLoadGrid` land at A5, and the field entry must not download
 * them. While this shared a module with `LabQueue` it would have.
 *
 * The reference data seeded in step 2 is real, so it is shown. The occupancy timeline is not, so it
 * is stated rather than drawn.
 */
export function Resources() {
  const q = useQuery({
    queryKey: ['resources'],
    queryFn: async () => {
      const [loc, mach] = await Promise.all([
        supabase.from('location').select('kind, code, label, max_fill_height_m').order('code'),
        supabase.from('machine').select('code, name, kind, tbd_marker').order('code'),
      ]);
      if (loc.error) throw loc.error;
      if (mach.error) throw mach.error;
      return { locations: loc.data ?? [], machines: mach.data ?? [] };
    },
  });

  if (q.isLoading) return <p className="text-sm text-muted">Loading…</p>;
  const locations = q.data?.locations ?? [];
  const machines = q.data?.machines ?? [];
  const byKind = (k: string) => locations.filter((l) => l.kind === k).length;
  const turners = machines.filter((m) => m.kind === 'TURNER').length;

  return (
    <>
      <PageHeading
        title="Resources"
        subtitle="Vessels and machines as contended resources, not string fields"
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <Stat label="Bunkers" value={byKind('BUNKER')} compare="S7a shows 1–11 in rotation" />
        </Card>
        <Card className="p-3">
          <Stat label="Tunnels" value={byKind('TUNNEL')} compare="S7a shows 1–12 in rotation" />
        </Card>
        <Card className="p-3">
          <Stat
            label="Turners"
            value={turners}
            tone={turners >= 2 ? 'ok' : 'crit'}
            compare="T1 ∥ T2 needs at least 2"
          />
        </Card>
        <Card className="p-3">
          <Stat label="Machines" value={machines.length} compare="TBD-33 — fleet unconfirmed" />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-3">
          <p className="mb-2 font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
            Machines
          </p>
          <table className="w-full text-left">
            <tbody>
              {machines.map((m) => (
                <tr key={m.code} style={{ borderTop: '1px solid var(--line)' }}>
                  <td className="mono py-1 text-[12px]">{m.code}</td>
                  <td className="py-1 text-[12px] text-ink2">{m.name}</td>
                  <td className="py-1">
                    <Chip tone={m.kind === 'TURNER' ? 'accent' : 'muted'}>{m.kind}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="p-3">
            <p className="mb-2 font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
              Locations
            </p>
            <div className="flex flex-wrap gap-1">
              {locations.map((l) => (
                <span
                  key={l.code}
                  className="mono rounded border px-1.5 py-0.5 text-[11px]"
                  style={{ borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
                  title={l.max_fill_height_m ? `max fill ${l.max_fill_height_m} m` : undefined}
                >
                  {l.code}
                </span>
              ))}
            </div>
          </Card>
          <EmptyState
            title="The vessel timeline and conflict list arrive in Step 11"
            detail="Occupancy needs batches. Once one is activated, this becomes a Gantt across every bunker and tunnel with overlaps drawn as conflicts — straw occupancy visually distinct from compost but equally blocking."
          />
        </div>
      </div>
    </>
  );
}
