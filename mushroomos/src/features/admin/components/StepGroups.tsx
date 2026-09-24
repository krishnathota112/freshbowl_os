import { useMemo, useState } from 'react';

/**
 * A calm, grouped list of process steps: one group per part of the floor (Bagasse, CM, Paddy, Mixing,
 * Turner, Bunkers, Tunnel, Lab), in the order the process reaches them. Finished groups fold away; the
 * group where work is happening opens. Each open step has one quiet "Add after" action.
 * Grouping is by the step's own stream/scope — display only, no process rule.
 */
export type StepRow = {
  id: string;
  title: string;
  stream: string;
  scopeLabel: string | null;
  isLab: boolean;
  isHold: boolean;
  labGate: boolean;
  start: number | null;
  end: number | null;
  /** 'done' | 'active' | 'ready' | 'waiting' | 'blocked' | 'notdue' | 'plan' */
  tone: string;
  stateLabel?: string;
  note?: string;
  noteTone?: 'late' | 'muted';
  isNew: boolean;
  canAdd: boolean;
};

const GROUPS: [string, string, string][] = [
  ['fibre', 'Bagasse', '#B08A55'],
  ['cm', 'Chicken manure & minerals', '#7D5BA6'],
  ['paddy', 'Paddy', '#C9A227'],
  ['mix', 'Mixing & yard', '#5A7F8C'],
  ['turner', 'Turner', '#2F6B47'],
  ['bunker', 'Bunkers', '#2457A5'],
  ['tunnel', 'Tunnel', '#5B4A3A'],
  ['lab', 'Lab checks', '#0E7C7B'],
];

const groupOf = (r: StepRow) => {
  if (r.isLab) return 'lab';
  if (r.stream === 'PRIMARY_FIBRE' || r.stream === 'SECONDARY_FIBRE') return 'fibre';
  if (r.stream === 'NITROGEN_MINERAL') return 'cm';
  if (r.stream === 'STRUCTURAL_STRAW') return 'paddy';
  if (r.stream === 'BUNKER') return 'bunker';
  if (r.stream === 'TUNNEL') return 'tunnel';
  if (/^pile/i.test(r.scopeLabel ?? '')) return 'turner';
  return 'mix';
};

const DOT: Record<string, string> = {
  done: 'var(--line-2)', active: 'var(--accent)', ready: 'var(--ok)', waiting: 'var(--warn)',
  blocked: 'var(--crit)', notdue: 'var(--line-2)', plan: 'var(--line-2)',
};
const fmtH = (h: number | null) => (h == null ? '' : `H${Number.isInteger(h) ? h : h.toFixed(1)}`);

export function StepGroups({
  rows,
  selectedId,
  onAdd,
  showLab,
}: {
  rows: StepRow[];
  selectedId: string | null;
  onAdd: (id: string) => void;
  showLab: boolean;
}) {
  const groups = useMemo(() => {
    const by = new Map<string, StepRow[]>();
    for (const r of rows) {
      const g = groupOf(r);
      if (g === 'lab' && !showLab) continue;
      by.set(g, [...(by.get(g) ?? []), r]);
    }
    return GROUPS.filter(([k]) => by.has(k))
      .map(([key, label, color]) => {
        const items = by.get(key)!;
        const done = items.filter((i) => i.tone === 'done').length;
        const live = items.some((i) => i.tone === 'active' || i.tone === 'ready');
        const first = Math.min(...items.map((i) => i.start ?? Infinity));
        const last = Math.max(...items.map((i) => i.end ?? i.start ?? 0));
        return { key, label, color, items, done, live, first, last, allDone: done === items.length };
      })
      .sort((a, b) => a.first - b.first);
  }, [rows, showLab]);

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (g: (typeof groups)[number]) => open[g.key] ?? (!g.allDone && (g.live || g.items.some((i) => i.id === selectedId) || g === groups.find((x) => !x.allDone)));

  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <section key={g.key} className="overflow-hidden rounded-xl border bg-surface" style={{ borderColor: 'var(--line)' }}>
          <button type="button" onClick={() => setOpen((o) => ({ ...o, [g.key]: !isOpen(g) }))} aria-expanded={isOpen(g)}
                  className="flex w-full items-center gap-3 px-4 text-left" style={{ minHeight: 56 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: g.color, flexShrink: 0 }} />
            <span className="flex-1">
              <span className="font-head text-[15px] font-700">{g.label}</span>
              <span className="ml-2 font-mono text-[12px] text-muted">{fmtH(g.first)}–{fmtH(g.last)}</span>
            </span>
            {g.live && <span className="rounded-full px-2 py-0.5 text-[11px] font-700" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}>now</span>}
            <span className="text-[12px] text-muted">{g.allDone ? 'done' : `${g.done}/${g.items.length} done`}</span>
            <span aria-hidden="true" className="text-muted" style={{ transform: isOpen(g) ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>›</span>
          </button>
          {isOpen(g) && (
            <ol className="border-t" style={{ borderColor: 'var(--line)' }}>
              {g.items.map((r) => {
                const sel = r.id === selectedId;
                return (
                  <li key={r.id} className="group flex items-center gap-3 px-4 py-2.5"
                      style={{ background: sel ? 'var(--accent-soft)' : r.isNew ? '#B3431B0F' : undefined, borderTop: '1px solid var(--line)' }}>
                    <span className="w-14 shrink-0 font-mono text-[12px] text-muted">{fmtH(r.start)}</span>
                    <span title={r.stateLabel} style={{ width: 8, height: 8, borderRadius: 4, background: DOT[r.tone] ?? 'var(--line-2)', flexShrink: 0,
                      boxShadow: r.tone === 'active' ? '0 0 0 3px var(--accent-soft)' : 'none' }} />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[14px] ${r.tone === 'done' ? 'text-muted' : 'font-600'}`}>
                        {r.title}
                        {r.isNew && <span className="ml-2 rounded px-1.5 py-0.5 align-middle text-[10px] font-700 text-white" style={{ background: '#B3431B' }}>ADDED</span>}
                      </span>
                      {(r.note || r.isHold || r.labGate || r.stateLabel) && (
                        <span className="block truncate text-[12px]" style={{ color: r.noteTone === 'late' ? 'var(--crit)' : 'var(--muted)' }}>
                          {[r.stateLabel, r.isHold ? 'passive rest' : null, r.labGate ? 'Lab gate' : null, r.note].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                    {r.canAdd && (
                      <button type="button" onClick={() => onAdd(r.id)} aria-label={`Add a step after ${r.title}`}
                              className={`shrink-0 rounded-lg border px-3 text-[12px] font-700 transition-opacity ${sel ? 'opacity-100' : 'opacity-60 group-hover:opacity-100 focus:opacity-100'}`}
                              style={{ minHeight: 36, borderColor: 'var(--accent)', color: 'var(--accent-ink)', background: 'var(--surface)' }}>
                        ＋ Add after
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}
