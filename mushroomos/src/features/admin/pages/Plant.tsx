import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { nowMs } from '../../../shared/utilities/now';

import { loadPlant, type PlantRow, type Vessel } from '../api/plant';
import { PageHeading } from '../../../shared/ui/layout/PageHeading';
import { ConflictMarker, EmptyState, Skeleton } from '../../../shared/ui/primitives';

/**
 * THE PLANT — the factory as a place, not as a list of batches.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS SCREEN EXISTS
 *
 * The Control Tower has a section headed `THE FACTORY` that renders horizontal bars. Bars are the
 * right answer to "is this batch late". They are the wrong answer to "what is in Bunker 7", and
 * that second question is the one an owner walking the floor actually asks.
 *
 * Every vessel the factory has is drawn, occupied or not. **An empty bunker is drawn as an empty
 * bunker** — that is the single most important thing on this screen for a planner, and filtering
 * empties out would turn it straight back into the list of batches it exists to stop being.
 *
 * Laid out in FLOW ORDER — yard, lagoon, hopper, bunkers, tunnels — because that is the direction
 * material moves. Alphabetical would put bunkers before the yard and read backwards.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export function Plant() {
  const q = useQuery({ queryKey: ['plant'], queryFn: loadPlant, refetchInterval: 60_000 });

  if (q.isLoading) {
    return (
      <>
        <PageHeading title="The plant" subtitle="Every vessel, and what is in it" />
        <Skeleton label="Reading the floor" lines={4} />
      </>
    );
  }

  if (q.error) {
    return (
      <>
        <PageHeading title="The plant" />
        <EmptyState
          title="Could not read the floor"
          detail={`${(q.error as Error).message}. Nothing has been changed — try again.`}
        />
      </>
    );
  }

  const d = q.data!;
  const free = d.totalVessels - d.totalOccupied;

  return (
    <>
      <PageHeading
        title="The plant"
        subtitle={`${d.totalOccupied} of ${d.totalVessels} vessels holding a batch · ${free} standing empty`}
      />

      <div className="flex flex-col gap-6">
        {d.rows.map((row) => (
          <Bank key={row.kind} row={row} />
        ))}
      </div>

      {d.unplaced.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-head text-[12px] font-700 uppercase tracking-wider text-muted">
            Running, but in no vessel
          </h2>
          {/*
            Not an error. Soaking, weighment and yard work happen outside a named vessel, and those
            scopes are deliberately unmapped (0026 §1). This band exists so a batch that SHOULD be
            in a bunker and is not becomes visible instead of simply being absent from the floor.
          */}
          <p className="mb-2 max-w-[62ch] text-[12px] leading-relaxed text-muted">
            Weighment, soaking and yard work are not held in an addressable vessel, so a batch doing
            those is correctly nowhere on this floor. A batch that should be in a bunker and is not
            appears here too — that is the one worth asking about.
          </p>
          <div className="flex flex-wrap gap-2">
            {d.unplaced.map((b) => (
              <Link
                key={b.batchId}
                to={`/batch/${b.batchId}`}
                className="rounded border px-3 py-2 font-head text-[12px] font-700"
                style={{ borderColor: 'var(--line-2)', color: 'var(--ink-2)', minHeight: 40 }}
              >
                {b.code}
                {b.hour !== null && <span className="mono ml-2 text-[11px] text-muted">H{b.hour}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** One bank of vessels — all the bunkers, all the tunnels. */
function Bank({ row }: { row: PlantRow }) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-head text-[12px] font-700 uppercase tracking-wider text-muted">
          {spoken(row.kind)}
        </h2>
        <span className="mono text-[11px] text-muted">
          {row.occupied} of {row.vessels.length} in use
        </span>
      </div>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))' }}
      >
        {row.vessels.map((v) => (
          <Cell key={v.locationId} v={v} />
        ))}
      </div>
    </section>
  );
}

/**
 * One vessel.
 *
 * The colour says one thing only: is something in it. State detail is text, because a second colour
 * axis on the same tile makes both unreadable — `UI_CONTROL_TOWER_SPEC §8.5` allows five semantic
 * colours across the product, not five on one square.
 */
function Cell({ v }: { v: Vessel }) {
  const occupied = v.batchCode !== null;
  const held =
    v.activityState === 'DEVIATION' || v.activityState === 'BLOCKED' || v.activityState === 'RETURNED';
  const resting =
    v.activityState === 'WAITING_TIME' ||
    v.activityState === 'WAITING_CONDITION' ||
    v.activityState === 'AWAITING_LAB';

  const edge = !occupied
    ? 'var(--line)'
    : held
      ? 'var(--crit)'
      : resting
        ? 'var(--inherit)'
        : 'var(--accent)';

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-1">
        <span className="font-head text-[13px] font-800">{v.label}</span>
        {v.conflictId !== null && <ConflictMarker id={v.conflictId} />}
      </div>

      {occupied ? (
        <>
          <span className="mono mt-1 block text-[12px] font-600" style={{ color: 'var(--accent-ink)' }}>
            {v.batchCode}
          </span>
          <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: 'var(--ink-2)' }}>
            {v.activityTitle ?? 'held'}
          </span>
          <span className="mono mt-1 block text-[10px] text-muted">
            {v.batchHour !== null ? `H${v.batchHour}` : 'no hour'}
            {v.occupiedSince !== null ? ` · in since ${sinceLabel(v.occupiedSince)}` : ''}
          </span>
        </>
      ) : (
        <>
          {/*
            The most important two words on this screen for a planner. Said plainly and calmly —
            an empty bunker is capacity, not a fault, so it gets no warning colour.
          */}
          <span className="mt-1 block text-[12px] text-muted">empty</span>
          {/*
            Empty but spoken for. A planner choosing where the next batch goes needs this — an
            unclaimed bunker and one another batch's plan already names are not the same capacity.
          */}
          {v.reservedFor !== null && (
            <span className="mt-0.5 block text-[10px] leading-tight" style={{ color: 'var(--accent-ink)' }}>
              held for {v.reservedFor}
            </span>
          )}
          {v.status !== 'available' && (
            <span className="mt-0.5 block text-[10px]" style={{ color: 'var(--warn)' }}>
              {v.status}
            </span>
          )}
        </>
      )}
    </>
  );

  const style = {
    minHeight: 92,
    borderColor: edge,
    borderLeftWidth: 3,
    background: occupied ? 'var(--surface)' : 'var(--surface-2)',
  } as const;

  if (!occupied || v.batchId === null) {
    return (
      <div className="rounded-md border p-2.5" style={style}>
        {body}
      </div>
    );
  }

  return (
    <Link
      to={`/batch/${v.batchId}${v.batchHour !== null ? `?h=${v.batchHour}` : ''}`}
      className="rounded-md border p-2.5 no-underline"
      style={style}
      title={`Open ${v.batchCode}${v.scopeLabel ? ` — ${v.scopeLabel}` : ''}`}
    >
      {body}
    </Link>
  );
}

/**
 * `BUNKER` → `Bunkers`. Mechanical, not a lookup table — a table would render a new vessel kind as
 * blank the first time the factory added one.
 */
function spoken(kind: string): string {
  const words = kind.toLowerCase().replace(/_/g, ' ');
  return words.endsWith('s') ? words : `${words}s`;
}

/** `in since 3d 4h`. Spoken, never a raw timestamp — `UI_CONTROL_TOWER_SPEC §8.2`. */
function sinceLabel(iso: string): string {
  const mins = Math.max(0, Math.round((nowMs() - Date.parse(iso)) / 60_000));
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}
