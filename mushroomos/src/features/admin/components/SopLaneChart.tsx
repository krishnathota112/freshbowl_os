import { useMemo } from 'react';

/**
 * The H-hour swimlane: one lane per stream, every activity a bar at its planned hours, Lab checkpoints
 * as diamonds on their own lane. For a running batch it also draws the server's forecast under each bar
 * that has moved, and a NOW line. Pure layout — every hour and state it draws arrives in the props.
 */

export type LaneTone = 'plan' | 'done' | 'active' | 'ready' | 'waiting' | 'blocked' | 'notdue';

export type LaneBar = {
  id: string;
  lane: string;
  title: string;
  start: number;
  end: number;
  projStart?: number | null;
  projEnd?: number | null;
  tone: LaneTone;
  isHold: boolean;
  isLab: boolean;
  labGate: boolean;
  isNew: boolean;
  selectable: boolean;
};

const LANES: [string, string, string][] = [
  ['PRIMARY_FIBRE', 'Bagasse (fibre)', '#B08A55'],
  ['SECONDARY_FIBRE', 'Second fibre', '#9C7B4B'],
  ['NITROGEN_MINERAL', 'CM · nitrogen', '#7D5BA6'],
  ['STRUCTURAL_STRAW', 'Paddy', '#C9A227'],
  ['YARD', 'Yard · mixing · Turner', '#5A7F8C'],
  ['BUNKER', 'Bunkers', '#2457A5'],
  ['TUNNEL', 'Tunnel', '#5B4A3A'],
  ['LAB', 'Lab checkpoints', '#0E7C7B'],
];
const COLOR = Object.fromEntries(LANES.map(([k, , c]) => [k, c]));
const ROW = 18;

export function SopLaneChart({
  bars,
  endHour,
  nowHour,
  selectedId,
  onSelect,
}: {
  bars: LaneBar[];
  endHour: number;
  nowHour?: number | null;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const span = Math.max(endHour, 24);
  const pct = (h: number) => `${Math.max(0, Math.min(100, (h / span) * 100))}%`;

  const lanes = useMemo(() => {
    return LANES.map(([key, label, color]) => {
      const mine = bars
        .filter((b) => (key === 'LAB' ? b.isLab : !b.isLab && b.lane === key))
        .sort((a, b) => a.start - b.start || a.end - b.end);
      const rowsEnd: number[] = [];
      const placed = mine.map((b) => {
        if (key === 'LAB') return { b, row: 0 };
        let row = rowsEnd.findIndex((e) => e <= b.start + 1e-6);
        if (row < 0) { row = rowsEnd.length; rowsEnd.push(0); }
        rowsEnd[row] = Math.max(b.end, b.start + span * 0.012);
        return { b, row };
      });
      return { key, label, color, placed, rows: Math.max(1, rowsEnd.length) };
    }).filter((l) => l.placed.length > 0);
  }, [bars, span]);

  const ticks: number[] = [];
  for (let h = 0; h <= span; h += 24) ticks.push(h);

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 900 }}>
        <div className="flex">
          <div style={{ width: 150, flexShrink: 0 }} />
          <div className="relative h-5 flex-1">
            {ticks.map((h) => (
              <span key={h} className="absolute top-0 font-mono text-[10px] text-muted" style={{ left: pct(h), transform: 'translateX(-2px)' }}>
                {h % 48 === 0 ? `H${h}` : ''}
              </span>
            ))}
          </div>
        </div>
        {lanes.map((l) => (
          <div key={l.key} className="flex border-t" style={{ borderColor: 'var(--line)' }}>
            <div className="flex items-center gap-2 py-2 pr-2" style={{ width: 150, flexShrink: 0 }}>
              <span style={{ width: 4, height: 22, borderRadius: 2, background: l.color }} />
              <span className="text-[12px] font-600 text-ink2">{l.label}</span>
            </div>
            <div className="relative flex-1" style={{ height: l.rows * ROW + 12 }}>
              {ticks.map((h) => (
                <span key={h} className="absolute top-0 h-full" style={{ left: pct(h), width: 1, background: 'var(--line)', opacity: h % 48 === 0 ? 0.9 : 0.4 }} />
              ))}
              {l.placed.map(({ b, row }) => (
                <Bar key={b.id} b={b} row={row} lane={l.key} pct={pct} span={span} selected={b.id === selectedId} onSelect={onSelect} />
              ))}
              {nowHour != null && nowHour >= 0 && (
                <span className="absolute top-0 h-full" style={{ left: pct(nowHour), width: 2, background: 'var(--ink)' }} />
              )}
            </div>
          </div>
        ))}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-[150px] text-[11px] text-ink2">
          <Key swatch={{ background: '#5A7F8C' }}>Planned work</Key>
          <Key swatch={{ background: 'repeating-linear-gradient(135deg,#5A7F8C 0 3px,#5A7F8C66 3px 6px)' }}>Passive rest</Key>
          <Key swatch={{ background: 'repeating-linear-gradient(135deg,#B3431B 0 3px,#D9784F 3px 6px)' }}>Added (amendment / draft insert)</Key>
          {nowHour != null && <Key swatch={{ background: 'var(--ink)', width: 3 }}>Now</Key>}
          {bars.some((b) => b.projStart != null) && <Key swatch={{ background: '#B3431B', height: 4 }}>Forecast where it moved</Key>}
          <Key swatch={{ background: '#0E7C7B', transform: 'rotate(45deg)', width: 9, height: 9 }}>Lab gate</Key>
        </div>
      </div>
    </div>
  );
}

function Key({ swatch, children }: { swatch: React.CSSProperties; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span style={{ display: 'inline-block', width: 16, height: 10, borderRadius: 2, ...swatch }} />
      {children}
    </span>
  );
}

function Bar({ b, row, lane, pct, span, selected, onSelect }: {
  b: LaneBar;
  row: number;
  lane: string;
  pct: (h: number) => string;
  span: number;
  selected: boolean;
  onSelect?: (id: string) => void;
}) {
  const top = 6 + row * ROW;
  const hours = `H${fmt(b.start)}–H${fmt(b.end)}`;
  if (b.isLab) {
    return (
      <span
        title={`${b.title} · H${fmt(b.start)}${b.labGate ? ' · Lab gate' : ''}`}
        className="absolute"
        style={{ left: `calc(${pct(b.start)} - 5px)`, top: top + 2, width: 10, height: 10, transform: 'rotate(45deg)', boxSizing: 'border-box',
          background: b.labGate ? '#0E7C7B' : 'var(--surface)', border: '1.5px solid #0E7C7B', opacity: b.tone === 'done' ? 0.4 : 1 }}
      />
    );
  }
  const c = COLOR[lane] ?? '#8E897C';
  const fill = b.isNew
    ? 'repeating-linear-gradient(135deg,#B3431B 0 4px,#D9784F 4px 8px)'
    : b.isHold ? `repeating-linear-gradient(135deg,${c} 0 3px,${c}66 3px 6px)` : c;
  const opacity = b.tone === 'done' ? 0.35 : b.tone === 'notdue' || b.tone === 'waiting' ? 0.75 : 1;
  const ring = selected ? '0 0 0 2px var(--surface), 0 0 0 4px var(--ink)'
    : b.tone === 'active' ? '0 0 0 2px var(--accent)'
    : b.tone === 'blocked' ? '0 0 0 2px var(--crit)' : 'none';
  const width = `max(4px, calc(${pct(b.end)} - ${pct(b.start)} - 1px))`;
  const moved = b.projStart != null && Math.abs(b.projStart - b.start) >= 0.5;
  const style: React.CSSProperties = { left: pct(b.start), width, top, height: 13, background: fill, opacity, boxShadow: ring, borderRadius: 3 };
  return (
    <>
      {onSelect && b.selectable ? (
        <button type="button" aria-label={`${b.title}, ${hours}. Insert after this.`} aria-pressed={selected}
                title={`${b.title} · ${hours}`} onClick={() => onSelect(b.id)} className="absolute border-0 p-0" style={{ ...style, cursor: 'pointer' }} />
      ) : (
        <span title={`${b.title} · ${hours}`} className="absolute" style={style} />
      )}
      {moved && b.projStart != null && (
        <span title={`${b.title} forecast H${fmt(b.projStart)}${b.projEnd != null ? `–H${fmt(b.projEnd)}` : ''}`} className="absolute"
              style={{ left: pct(b.projStart), width: `max(3px, calc(${pct(b.projEnd ?? b.projStart + (b.end - b.start))} - ${pct(b.projStart)}))`,
                top: top + 14, height: 3, background: '#B3431B', borderRadius: 2, opacity: span ? 0.9 : 1 }} />
      )}
    </>
  );
}

const fmt = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(1));
