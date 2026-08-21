import { useQuery } from '@tanstack/react-query';
import { supabase } from '../api/client';
import { PageHeading } from '../components/layout/AppShell';
import { Card, Chip, EmptyState, Stat } from '../components/primitives';

/**
 * Five of the six role homes have no screen until later steps.
 *
 * They say what will fill them and when. docs/UI_DESIGN_SPEC.md §5 — never "No data",
 * and no placeholder cards, because docs/KIRO_BUILD_INSTRUCTIONS.md §1 item 10 forbids
 * faking a workflow in the frontend.
 */

function Pending({
  title,
  subtitle,
  waitingFor,
  step,
}: {
  title: string;
  subtitle: string;
  waitingFor: string;
  step: string;
}) {
  return (
    <>
      <PageHeading title={title} subtitle={subtitle} right={<Chip tone="lock">{step}</Chip>} />
      <EmptyState title={waitingFor} detail={`This screen is built in ${step}. Steps 1 and 2 build the process definition and the mechanisms that read it; nothing has instantiated a batch yet, so there is no work to show. Filling this with placeholder cards would be faking the workflow in the frontend, which the build instructions forbid.`} />
    </>
  );
}

export const LabQueue = () => (
  <Pending
    title="Lab Queue"
    subtitle="Overdue, today, retest required"
    waitingFor="Samples appear here when an activity submission generates them"
    step="Step 8"
  />
);

export const ControlRoom = () => (
  <Pending
    title="Control Room"
    subtitle="Ordered by urgency, not by batch"
    waitingFor="Time-critical gates, lab failures and open deviations appear here once batches are running"
    step="Step 9"
  />
);

export const CommandCenter = () => (
  <Pending
    title="Command Center"
    subtitle="Exceptions first, not what is fine"
    waitingFor="Checkpoint decision packages appear here when a batch reaches one"
    step="Step 10"
  />
);

/** Manager resources — the reference data this step DID seed is real, so show it. */
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
