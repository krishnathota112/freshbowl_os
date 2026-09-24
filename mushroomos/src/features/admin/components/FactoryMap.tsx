import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { listBatchTimeline } from '../../../shared/api/monitor';
import { loadBatchActivitiesNow, loadBatchNow } from '../../../shared/api/projection';
import { loadVessels, type VesselReadiness } from '../../../shared/api/resources';
import { STATE_LABEL } from '../../../shared/api/work';
import { humanDuration } from '../../../shared/ui/domain/HumanDuration';
import { Card, Chip, EmptyState, Skeleton, type Tone } from '../../../shared/ui/primitives';
import {
  activityStatus,
  buildZones,
  focusZone,
  hourWindow,
  STATUS_WORD,
  ZONE_NAME,
  type MapActivity,
  type Zone,
  type ZoneId,
  type ZoneStatus,
} from './factoryZones';

/**
 * THE FACTORY MAP — one batch drawn on the factory floor.
 *
 * The floor areas (bagasse yard, soaking pit, Turner piles, bunker lines, tunnel …) light up from the
 * server's own activity states (`project_batch`, `v_batch_timeline`); the bunker bank and tunnel hall
 * are the real physical vessels from `v_vessel_readiness`, so a bay shows which batch is in it and
 * whether it needs cleaning. The map calculates nothing: it places and colours backend answers.
 */

const VESSEL_KINDS = ['BUNKER', 'TUNNEL', 'SOAK_PIT', 'HOPPER', 'YARD'];

const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const hourText = (h: number | null) => (h === null ? 'H —' : `H${h.toFixed(1)}`);

/** Status → colours. Tokens only, so light and dark themes both hold. */
const LOOK: Record<ZoneStatus, { fill: string; stroke: string; ink: string; dash?: string }> = {
  blocked: { fill: 'var(--crit-soft)', stroke: 'var(--crit)', ink: 'var(--crit)' },
  active: { fill: 'var(--accent)', stroke: 'var(--accent)', ink: 'var(--on-accent)' },
  resting: { fill: 'var(--accent-soft)', stroke: 'var(--accent)', ink: 'var(--accent-ink)', dash: '6 4' },
  ready: { fill: 'var(--ok-soft)', stroke: 'var(--ok)', ink: 'var(--ok)' },
  waiting: { fill: 'var(--warn-soft)', stroke: 'var(--warn)', ink: 'var(--warn)' },
  notdue: { fill: 'var(--surface-2)', stroke: 'var(--line-2)', ink: 'var(--muted)' },
  done: { fill: 'var(--surface-3)', stroke: 'var(--line-2)', ink: 'var(--muted)' },
  empty: { fill: 'var(--surface)', stroke: 'var(--line)', ink: 'var(--muted)' },
};

const CHIP_TONE: Record<ZoneStatus, Tone> = {
  blocked: 'crit',
  active: 'accent',
  resting: 'accent',
  ready: 'ok',
  waiting: 'warn',
  notdue: 'muted',
  done: 'lock',
  empty: 'muted',
};

type Selection = { kind: 'zone'; id: ZoneId } | { kind: 'vessel'; id: string };

/* ── geometry: one fixed floor plan, scaled by the viewBox ───────────────────────────────────── */

const W = 1000;
const H = 820;
type Box = { x: number; y: number; w: number; h: number };

const BOX: Partial<Record<ZoneId, Box>> = {
  paddy: { x: 40, y: 170, w: 200, h: 240 },
  fibre: { x: 260, y: 170, w: 200, h: 112 },
  cm: { x: 260, y: 298, w: 200, h: 112 },
  mixing: { x: 480, y: 170, w: 220, h: 112 },
  lab: { x: 480, y: 298, w: 220, h: 112 },
  'line-1': { x: 40, y: 450, w: 290, h: 96 },
  'line-2': { x: 355, y: 450, w: 290, h: 96 },
  'line-3': { x: 670, y: 450, w: 290, h: 96 },
  tunnel: { x: 40, y: 586, w: 680, h: 96 },
  growroom: { x: 740, y: 586, w: 220, h: 96 },
};
const TURNER: Box = { x: 720, y: 170, w: 240, h: 240 };
const PILE_W = 100;
const PILE_H = 56;
const pileBox = (i: number): Box => ({
  x: TURNER.x + 14 + (i % 2) * (PILE_W + 12),
  y: TURNER.y + 34 + Math.floor(i / 2) * (PILE_H + 12),
  w: PILE_W,
  h: PILE_H,
});
const BANK_Y = 44;
const BANK_H = 86;
const HALL_Y = 724;
const HALL_H = 70;

const clip = (s: string, room: number) => {
  const max = Math.max(4, Math.floor(room / 7));
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
/** "Turner T1 — pile 1" → "Turner T1": the pile is already the box's name. */
const shortTitle = (t: string) => t.split(' — ')[0];

/* ── data ────────────────────────────────────────────────────────────────────────────────────── */

async function loadMap(batchId: string) {
  const [timeline, now, vessels, projection] = await Promise.all([
    listBatchTimeline(batchId),
    loadBatchNow(batchId),
    loadVessels(VESSEL_KINDS),
    loadBatchActivitiesNow(batchId).catch(() => []),
  ]);
  const byId = new Map(projection.map((p) => [p.activity_id, p]));
  const rows: MapActivity[] = timeline.map((t) => {
    const p = byId.get(t.activity_id);
    return {
      activity_id: t.activity_id,
      code: t.code,
      title: t.title,
      stream: t.stream,
      scope_label: t.scope_label,
      state: p?.state ?? t.state,
      is_hold: t.is_hold,
      is_lab: t.is_lab,
      before_tracking: t.before_tracking,
      overdue: t.overdue,
      baseline_start_hour: n(t.baseline_start_hour),
      baseline_end_hour: n(t.baseline_end_hour),
      actual_start: p?.actual_start ?? t.actual_start,
      actual_end: p?.actual_end ?? t.actual_end,
      projected_start_at: p?.projected_start_at ?? null,
      projected_end_at: p?.projected_end_at ?? null,
      waiting_for_title: p?.waiting_for_title ?? null,
      blocked_reason: p?.blocked_reason ?? t.blocked_reason,
      delay_minutes: n(p?.delay_minutes),
    };
  });
  return { rows, now, vessels };
}

/* ── component ───────────────────────────────────────────────────────────────────────────────── */

export function FactoryMap({ batchId }: { batchId: string }) {
  const q = useQuery({ queryKey: ['factory-map', batchId], queryFn: () => loadMap(batchId), refetchInterval: 60_000 });
  const zones = useMemo(() => (q.data ? buildZones(q.data.rows) : null), [q.data]);
  const [picked, setPicked] = useState<Selection | null>(null);

  if (q.isLoading) return <Skeleton label="Drawing the factory floor" lines={6} />;
  if (q.error || !q.data || !zones) {
    return <EmptyState title="The map could not be drawn" detail={`${(q.error as Error | null)?.message ?? 'No data.'} Nothing has been changed.`} />;
  }

  const { now, vessels } = q.data;
  const selection: Selection = picked ?? { kind: 'zone', id: focusZone(zones) };
  const bunkers = vessels.filter((v) => v.kind === 'BUNKER');
  const tunnels = vessels.filter((v) => v.kind === 'TUNNEL');
  const lagoon = vessels.find((v) => v.kind === 'SOAK_PIT') ?? null;
  const currentHour = n(now?.current_hour);

  return (
    <div className="flex flex-col gap-4">
      <NowStrip now={now} currentHour={currentHour} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-3">
          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              role="group"
              aria-label="Factory floor map"
              className="block w-full min-w-[680px]"
              style={{ fontFamily: 'var(--font-head)' }}
            >
              <style>{`
                .fm-hit { cursor: pointer; }
                .fm-hit:focus { outline: none; }
                .fm-hit:focus-visible > rect:first-of-type, .fm-hit:hover > rect:first-of-type { stroke-width: 3; }
                .fm-pulse { animation: fm-pulse 1.8s ease-in-out infinite; }
                @keyframes fm-pulse { 0%, 100% { stroke-opacity: .9 } 50% { stroke-opacity: .15 } }
                @media (prefers-reduced-motion: reduce) { .fm-pulse { animation: none; } }
              `}</style>
              <defs>
                <marker id="fm-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--line-2)" />
                </marker>
                <pattern id="fm-water" width="24" height="10" patternUnits="userSpaceOnUse">
                  <path d="M0 5 Q6 1 12 5 T24 5" fill="none" stroke="var(--accent)" strokeOpacity="0.25" strokeWidth="1.2" />
                </pattern>
                <pattern id="fm-soil" width="12" height="12" patternUnits="userSpaceOnUse">
                  <circle cx="3" cy="4" r="1.1" fill="var(--ink-2)" fillOpacity="0.25" />
                  <circle cx="9" cy="9" r="0.9" fill="var(--ink-2)" fillOpacity="0.2" />
                </pattern>
              </defs>

              {/* site boundary */}
              <rect x={16} y={16} width={W - 32} height={H - 32} rx={14} fill="var(--paper)" stroke="var(--line-2)" />

              <Flows />

              <SectionLabel x={40} y={BANK_Y - 12} text={`BUNKER BANK · ${bunkers.length} bays`} />
              <VesselRow vessels={bunkers} y={BANK_Y} h={BANK_H} batchId={batchId} selection={selection} onPick={setPicked} />

              <SectionLabel x={40} y={158} text="PREPARATION FLOOR" />
              <ZoneBox zone={zones.paddy} box={BOX.paddy!} selection={selection} onPick={setPicked}
                       extra={lagoon ? `${lagoon.label} · ${lagoon.occupied_by_batch ? 'in use' : lagoon.is_ready ? 'ready' : 'not ready'}` : undefined}
                       water />
              <ZoneBox zone={zones.fibre} box={BOX.fibre!} selection={selection} onPick={setPicked} />
              <ZoneBox zone={zones.cm} box={BOX.cm!} selection={selection} onPick={setPicked} />
              <ZoneBox zone={zones.mixing} box={BOX.mixing!} selection={selection} onPick={setPicked} />
              <ZoneBox zone={zones.lab} box={BOX.lab!} selection={selection} onPick={setPicked} />

              {/* Turner yard: six independent piles */}
              <rect x={TURNER.x} y={TURNER.y} width={TURNER.w} height={TURNER.h} rx={10}
                    fill="var(--surface)" stroke="var(--line-2)" strokeDasharray="5 4" />
              <text x={TURNER.x + 14} y={TURNER.y + 22} fontSize={13} fontWeight={800} fill="var(--ink)">Turner yard · P1–P6</text>
              {([1, 2, 3, 4, 5, 6] as const).map((p, i) => (
                <PileBox key={p} zone={zones[`pile-${p}` as ZoneId]} box={pileBox(i)} label={`P${p}`}
                         selection={selection} onPick={setPicked} />
              ))}

              <SectionLabel x={40} y={438} text="BUNKER LINES · P1+P2 → B1 · P3+P4 → B2 · P5+P6 → B3" />
              <ZoneBox zone={zones['line-1']} box={BOX['line-1']!} selection={selection} onPick={setPicked} />
              <ZoneBox zone={zones['line-2']} box={BOX['line-2']!} selection={selection} onPick={setPicked} />
              <ZoneBox zone={zones['line-3']} box={BOX['line-3']!} selection={selection} onPick={setPicked} />

              <SectionLabel x={40} y={574} text="TUNNEL & HAND-OFF" />
              <ZoneBox zone={zones.tunnel} box={BOX.tunnel!} selection={selection} onPick={setPicked} />
              <ZoneBox zone={zones.growroom} box={BOX.growroom!} selection={selection} onPick={setPicked} />

              <SectionLabel x={40} y={HALL_Y - 12} text={`TUNNEL HALL · ${tunnels.length} tunnels`} />
              <VesselRow vessels={tunnels} y={HALL_Y} h={HALL_H} batchId={batchId} selection={selection} onPick={setPicked} />
            </svg>
          </div>
          <Legend />
        </Card>

        <Card className="p-4 lg:max-h-[820px] lg:overflow-y-auto">
          {selection.kind === 'zone' ? (
            <ZonePanel zone={zones[selection.id]} />
          ) : (
            <VesselPanel v={vessels.find((v) => v.location_id === selection.id) ?? null} batchId={batchId} />
          )}
        </Card>
      </div>
    </div>
  );
}

/* ── the strip above the map: the batch clock and what matters next ─────────────────────────── */

function NowStrip({ now, currentHour }: { now: Awaited<ReturnType<typeof loadBatchNow>>; currentHour: number | null }) {
  if (!now) return null;
  const items: { k: string; v: string; tone?: Tone }[] = [
    { k: 'Running now', v: now.running_now ?? 'Nothing running' },
    { k: 'Next up', v: now.next_up ?? '—' },
    { k: 'Projected finish', v: when(now.projected_finish) },
  ];
  return (
    <Card className="flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
      <div>
        <div className="font-mono text-[28px] font-700 leading-none" style={{ color: 'var(--ink)' }}>{hourText(currentHour)}</div>
        <div className="mt-1 text-[12px] text-muted">{now.h0 ? `H0 ${when(now.h0)} · now ${when(new Date().toISOString())}` : 'No H0 recorded'}</div>
      </div>
      {items.map((i) => (
        <div key={i.k} className="min-w-0">
          <div className="text-[11px] font-700 uppercase tracking-wider text-muted">{i.k}</div>
          <div className="truncate font-head text-[15px] font-700" style={{ color: 'var(--ink)' }}>{i.v}</div>
        </div>
      ))}
      <div className="ml-auto flex flex-wrap gap-2">
        <Chip tone="ok">{Number(now.ready_now)} ready</Chip>
        <Chip tone="accent">{Number(now.running)} running</Chip>
        <Chip tone={Number(now.blocked) ? 'warn' : 'muted'}>{Number(now.blocked)} waiting / blocked</Chip>
        <Chip tone={Number(now.late) ? 'crit' : 'muted'}>{Number(now.late)} late</Chip>
      </div>
    </Card>
  );
}

/* ── SVG pieces ──────────────────────────────────────────────────────────────────────────────── */

function SectionLabel({ x, y, text }: { x: number; y: number; text: string }) {
  return <text x={x} y={y} fontSize={11} fontWeight={800} letterSpacing={1.2} fill="var(--muted)">{text}</text>;
}

function hitProps(sel: Selection, onPick: (s: Selection) => void, label: string) {
  return {
    className: 'fm-hit',
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    onClick: () => onPick(sel),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onPick(sel);
      }
    },
  };
}

const isPicked = (a: Selection, b: Selection) => a.kind === b.kind && a.id === b.id;

function ZoneBox({ zone, box, selection, onPick, extra, water }: {
  zone: Zone;
  box: Box;
  selection: Selection;
  onPick: (s: Selection) => void;
  extra?: string;
  water?: boolean;
}) {
  const look = LOOK[zone.status];
  const me: Selection = { kind: 'zone', id: zone.id };
  const on = isPicked(selection, me);
  const live = zone.status === 'active' || zone.status === 'resting';
  const lead = zone.lead ? shortTitle(zone.lead.title) : 'No activities in this process';
  return (
    <g {...hitProps(me, onPick, `${ZONE_NAME[zone.id]}: ${STATUS_WORD[zone.status]}`)}>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={10} fill={look.fill} stroke={look.stroke}
            strokeWidth={on ? 3 : 1.5} strokeDasharray={look.dash} />
      {water && (
        <rect x={box.x + 12} y={box.y + box.h * 0.45} width={box.w - 24} height={box.h * 0.45} rx={8}
              fill="url(#fm-water)" stroke="var(--accent)" strokeOpacity={0.3} />
      )}
      {live && (
        <rect className="fm-pulse" x={box.x - 4} y={box.y - 4} width={box.w + 8} height={box.h + 8} rx={13}
              fill="none" stroke="var(--accent)" strokeWidth={2} />
      )}
      <text x={box.x + 12} y={box.y + 22} fontSize={14} fontWeight={800} fill={look.ink}>{clip(ZONE_NAME[zone.id], box.w - 50)}</text>
      <text x={box.x + 12} y={box.y + 40} fontSize={11} fontWeight={700} fill={look.ink} opacity={0.85}>
        {STATUS_WORD[zone.status].toUpperCase()}{zone.status === 'done' ? ' ✓' : ''}
      </text>
      <text x={box.x + 12} y={box.y + 58} fontSize={12} fill={look.ink}>{clip(lead, box.w - 20)}</text>
      {zone.lead && zone.status !== 'done' && (
        <text x={box.x + 12} y={box.y + 74} fontSize={11} fontFamily="var(--font-mono)" fill={look.ink} opacity={0.8}>
          {hourWindow(zone.lead)}
        </text>
      )}
      {extra && <text x={box.x + 22} y={box.y + box.h - 14} fontSize={11} fontWeight={700} fill="var(--accent-ink)">{extra}</text>}
      {zone.late > 0 && <LateBadge x={box.x + box.w - 12} y={box.y + 12} count={zone.late} />}
    </g>
  );
}

function PileBox({ zone, box, label, selection, onPick }: {
  zone: Zone;
  box: Box;
  label: string;
  selection: Selection;
  onPick: (s: Selection) => void;
}) {
  const look = LOOK[zone.status];
  const me: Selection = { kind: 'zone', id: zone.id };
  const on = isPicked(selection, me);
  const live = zone.status === 'active' || zone.status === 'resting';
  const pass = zone.lead ? shortTitle(zone.lead.title).replace(/^Turner\s+/i, '') : '—';
  return (
    <g {...hitProps(me, onPick, `${ZONE_NAME[zone.id]}: ${STATUS_WORD[zone.status]}`)}>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={box.h / 2} fill={look.fill} stroke={look.stroke}
            strokeWidth={on ? 3 : 1.5} strokeDasharray={look.dash} />
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={box.h / 2} fill="url(#fm-soil)" pointerEvents="none" />
      {live && (
        <rect className="fm-pulse" x={box.x - 3} y={box.y - 3} width={box.w + 6} height={box.h + 6} rx={box.h / 2 + 3}
              fill="none" stroke="var(--accent)" strokeWidth={2} />
      )}
      <text x={box.x + box.w / 2} y={box.y + 24} textAnchor="middle" fontSize={14} fontWeight={800} fill={look.ink}>{label}</text>
      <text x={box.x + box.w / 2} y={box.y + 41} textAnchor="middle" fontSize={10} fontWeight={700} fill={look.ink}>
        {clip(zone.status === 'done' ? 'Done ✓' : pass, box.w - 10)}
      </text>
      {zone.late > 0 && <LateBadge x={box.x + box.w - 6} y={box.y + 6} count={zone.late} />}
    </g>
  );
}

function LateBadge({ x, y, count }: { x: number; y: number; count: number }) {
  return (
    <g aria-label={`${count} late`}>
      <circle cx={x} cy={y} r={10} fill="var(--crit)" />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="var(--surface)">{count}</text>
    </g>
  );
}

function vesselLook(v: VesselReadiness, batchId: string): { fill: string; stroke: string; ink: string; word: string; dash?: string } {
  if (v.occupied_by_batch_id === batchId) return { fill: 'var(--accent)', stroke: 'var(--accent)', ink: 'var(--on-accent)', word: 'This batch' };
  if (v.occupied_by_batch) return { fill: 'var(--surface-3)', stroke: 'var(--ink-2)', ink: 'var(--ink-2)', word: v.occupied_by_batch };
  if (v.open_task_id) return { fill: 'var(--warn-soft)', stroke: 'var(--warn)', ink: 'var(--warn)', word: 'Cleaning', dash: '4 3' };
  if (!v.is_ready) return { fill: 'var(--warn-soft)', stroke: 'var(--warn)', ink: 'var(--warn)', word: 'Needs clean' };
  return { fill: 'var(--surface)', stroke: 'var(--line-2)', ink: 'var(--muted)', word: 'Ready' };
}

function VesselRow({ vessels, y, h, batchId, selection, onPick }: {
  vessels: VesselReadiness[];
  y: number;
  h: number;
  batchId: string;
  selection: Selection;
  onPick: (s: Selection) => void;
}) {
  if (vessels.length === 0) {
    return <text x={40} y={y + h / 2} fontSize={12} fill="var(--muted)">No vessels configured.</text>;
  }
  const gap = 8;
  const w = (W - 80 - gap * (vessels.length - 1)) / vessels.length;
  return (
    <>
      {vessels.map((v, i) => {
        const x = 40 + i * (w + gap);
        const look = vesselLook(v, batchId);
        const me: Selection = { kind: 'vessel', id: v.location_id };
        const on = isPicked(selection, me);
        const short = v.label.replace(/^Bunker\s+/i, 'B').replace(/^Tunnel\s+/i, 'T');
        return (
          <g key={v.location_id} {...hitProps(me, onPick, `${v.label}: ${look.word}`)}>
            <rect x={x} y={y} width={w} height={h} rx={6} fill={look.fill} stroke={look.stroke}
                  strokeWidth={on ? 3 : 1.2} strokeDasharray={look.dash} />
            <text x={x + w / 2} y={y + h / 2 - 4} textAnchor="middle" fontSize={14} fontWeight={800} fill={look.ink}>{short}</text>
            <text x={x + w / 2} y={y + h / 2 + 13} textAnchor="middle" fontSize={9} fontWeight={700} fill={look.ink}>
              {clip(look.word, w + 6)}
            </text>
          </g>
        );
      })}
    </>
  );
}

/** Material flow between the areas: the process's physical shape, drawn behind the boxes. */
function Flows() {
  const p = (d: string) => (
    <path d={d} fill="none" stroke="var(--line-2)" strokeWidth={2} markerEnd="url(#fm-arrow)" />
  );
  // Each row of the yard is one pile pair (P1+P2, P3+P4, P5+P6); each pair leaves the yard for its own line.
  const exitX = (row: number) => TURNER.x + 60 + row * 60;
  const lineTop = (l: Box) => `${l.x + l.w / 2},${l.y}`;
  return (
    <g aria-hidden="true">
      {p(`M${BOX.fibre!.x + BOX.fibre!.w},${BOX.fibre!.y + 56} H${BOX.mixing!.x - 4}`)}
      {p(`M${BOX.cm!.x + BOX.cm!.w},${BOX.cm!.y + 40} C${BOX.cm!.x + BOX.cm!.w + 12},${BOX.cm!.y + 20} ${BOX.mixing!.x - 12},${BOX.mixing!.y + 100} ${BOX.mixing!.x - 4},${BOX.mixing!.y + 90}`)}
      {p(`M${BOX.paddy!.x + BOX.paddy!.w / 2},${BOX.paddy!.y} V148 H${BOX.mixing!.x + BOX.mixing!.w / 2} V${BOX.mixing!.y - 4}`)}
      {p(`M${BOX.mixing!.x + BOX.mixing!.w},${BOX.mixing!.y + 56} H${TURNER.x - 4}`)}
      {([0, 1, 2] as const).map((row) => {
        const line = BOX[`line-${row + 1}` as ZoneId]!;
        return (
          <g key={row}>
            {p(`M${exitX(row)},${TURNER.y + TURNER.h} C${exitX(row)},${TURNER.y + TURNER.h + 20} ${line.x + line.w / 2},${line.y - 30} ${lineTop(line)}`)}
          </g>
        );
      })}
      {(['line-1', 'line-2', 'line-3'] as ZoneId[]).map((id, i) => {
        const l = BOX[id]!;
        const tx = BOX.tunnel!.x + 120 + i * 220;
        return <g key={id}>{p(`M${l.x + l.w / 2},${l.y + l.h} C${l.x + l.w / 2},${l.y + l.h + 20} ${tx},${BOX.tunnel!.y - 20} ${tx},${BOX.tunnel!.y - 4}`)}</g>;
      })}
      {p(`M${BOX.tunnel!.x + BOX.tunnel!.w},${BOX.tunnel!.y + BOX.tunnel!.h / 2} H${BOX.growroom!.x - 4}`)}
    </g>
  );
}

function Legend() {
  const items: ZoneStatus[] = ['active', 'resting', 'ready', 'waiting', 'blocked', 'notdue', 'done'];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-[12px]" style={{ color: 'var(--ink-2)' }}>
      {items.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm border"
                style={{ background: LOOK[s].fill, borderColor: LOOK[s].stroke, borderStyle: LOOK[s].dash ? 'dashed' : 'solid' }} />
          {STATUS_WORD[s]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-full" style={{ background: 'var(--crit)' }} /> Late tasks
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-sm border" style={{ background: 'var(--surface-3)', borderColor: 'var(--ink-2)' }} /> Vessel used by another batch
      </span>
    </div>
  );
}

/* ── side panel ──────────────────────────────────────────────────────────────────────────────── */

function ZonePanel({ zone }: { zone: Zone }) {
  const open = zone.activities.filter((a) => activityStatus(a) !== 'done');
  const done = zone.activities.length - open.length;
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-head text-[18px] font-800" style={{ color: 'var(--ink)' }}>{ZONE_NAME[zone.id]}</h3>
        <Chip tone={CHIP_TONE[zone.status]}>{STATUS_WORD[zone.status]}</Chip>
      </div>
      <p className="mt-1 text-[12px] text-muted">
        {zone.activities.length === 0
          ? 'This batch’s process has no activities here.'
          : `${done} of ${zone.activities.length} done${zone.late ? ` · ${zone.late} late` : ''}`}
      </p>
      <ul className="mt-3 grid gap-2">
        {[...open, ...zone.activities.filter((a) => activityStatus(a) === 'done')].map((a) => (
          <ActivityRow key={a.activity_id} a={a} />
        ))}
      </ul>
    </div>
  );
}

function ActivityRow({ a }: { a: MapActivity }) {
  const s = activityStatus(a);
  const why = a.blocked_reason ?? (a.waiting_for_title && s !== 'done' ? `Waiting for ${a.waiting_for_title}` : null);
  return (
    <li className="rounded-lg border px-3 py-2" style={{ borderColor: s === 'done' ? 'var(--line)' : LOOK[s].stroke, opacity: s === 'done' ? 0.7 : 1 }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-head text-[14px] font-700" style={{ color: 'var(--ink)' }}>{a.title}</span>
        <span className="shrink-0 font-mono text-[11px] text-muted">{hourWindow(a)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <Chip tone={CHIP_TONE[s]}>{a.before_tracking ? 'Before tracking' : STATE_LABEL[a.state] ?? a.state}</Chip>
        {a.overdue && s !== 'done' && <Chip tone="crit">late</Chip>}
        {a.is_hold && <Chip tone="muted">passive rest</Chip>}
      </div>
      <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-2)' }}>
        {a.actual_end
          ? `Finished ${when(a.actual_end)}`
          : a.actual_start
            ? `Started ${when(a.actual_start)}${a.projected_end_at ? ` · expected to end ${when(a.projected_end_at)}` : ''}`
            : a.projected_start_at
              ? `Expected to start ${when(a.projected_start_at)}`
              : ''}
        {a.delay_minutes && a.delay_minutes > 0 && s !== 'done' ? ` · ${humanDuration(a.delay_minutes)} behind plan` : ''}
      </p>
      {why && s !== 'done' && <p className="mt-0.5 text-[12px]" style={{ color: LOOK[s].ink }}>{why}</p>}
    </li>
  );
}

function VesselPanel({ v, batchId }: { v: VesselReadiness | null; batchId: string }) {
  if (!v) return <p className="text-[14px] text-muted">This vessel is no longer listed.</p>;
  const look = vesselLook(v, batchId);
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-head text-[18px] font-800" style={{ color: 'var(--ink)' }}>{v.label}</h3>
        <Chip tone={v.occupied_by_batch_id === batchId ? 'accent' : v.occupied_by_batch ? 'lock' : v.is_ready ? 'ok' : 'warn'}>{look.word}</Chip>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        <dt className="text-muted">In use by</dt>
        <dd style={{ color: 'var(--ink)' }}>{v.occupied_by_batch ? `${v.occupied_by_batch} since ${when(v.occupied_since)}` : 'Nobody'}</dd>
        <dt className="text-muted">Last released</dt>
        <dd style={{ color: 'var(--ink)' }}>{when(v.last_released_at)}</dd>
        <dt className="text-muted">Last cleaned</dt>
        <dd style={{ color: 'var(--ink)' }}>{v.last_cleaned_at ? `${when(v.last_cleaned_at)}${v.last_cleaned_by ? ` by ${v.last_cleaned_by}` : ''}` : '—'}</dd>
        {v.open_task_id && (
          <>
            <dt className="text-muted">Cleaning</dt>
            <dd style={{ color: 'var(--ink)' }}>
              {v.open_task_state === 'IN_PROGRESS' ? 'Under way' : 'Requested'}{v.open_task_assigned_name ? ` · ${v.open_task_assigned_name}` : ''}
            </dd>
          </>
        )}
      </dl>
      {v.not_ready_reason && <p className="mt-3 text-[13px]" style={{ color: 'var(--warn)' }}>{v.not_ready_reason}</p>}
      <p className="mt-4 text-[12px] text-muted">Cleaning requests and allocation are on the Resources screen.</p>
    </div>
  );
}

export default FactoryMap;
