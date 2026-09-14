import { useQuery } from '@tanstack/react-query';
import { supabase } from '../shared/api/client';
import { PageHeading } from '../shared/ui/layout/PageHeading';
import { Card, Chip, EmptyState, Stat } from '../shared/ui/primitives';

export function Resources() {
  const q = useQuery({
    queryKey: ['resources-summary'],
    queryFn: async () => {
      const [loc, mac] = await Promise.all([
        supabase.from('vessel_location').select('code, name, kind, max_fill_height_m'),
        supabase.from('machine').select('code, name, kind'),
      ]);
      if (loc.error) throw loc.error;
      if (mac.error) throw mac.error;
      return {
        locations: (loc.data ?? []) as Array<{ code: string; name: string; kind: string; max_fill_height_m: number | null }>,
        machines: (mac.data ?? []) as Array<{ code: string; name: string; kind: string }>,
      };
    },
  });

  if (q.isLoading) return <p className="text-sm text-muted">Loading…</p>;
  const locations = q.data?.locations ?? [];
  const machines = q.data?.machines ?? [];
  const byKind = (k: string) => locations.filter((l: { kind: string }) => l.kind === k).length;
  const turners = machines.filter((m: { kind: string }) => m.kind === 'TURNER').length;

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
              {machines.map((m: { code: string; name: string; kind: string }) => (
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
              {locations.map((l: { code: string; max_fill_height_m: number | null }) => (
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

export default Resources;
