/**
 * Batch simulation — pure, no React, no data access.
 *
 * Lays a batch onto the calendar from a start date and the SOP version's OWN planned hours
 * (process_activity.standard_start_hour / standard_end_hour — the same numbers plan generation freezes).
 * It is a preview of "what happens if batches start on these dates", not a plan: it creates nothing,
 * changes nothing and judges nothing (no collision engine — owner decision, 25 Sep 2026).
 */
import type { SopActivity } from '../api/sop';

export type SimGroup = 'fibre' | 'cm' | 'paddy' | 'mix' | 'turner' | 'bunker' | 'tunnel';

export const SIM_GROUPS: { key: SimGroup; label: string; color: string }[] = [
  { key: 'fibre', label: 'Bagasse', color: '#B08A55' },
  { key: 'cm', label: 'CM & minerals', color: '#8C6BAF' },
  { key: 'paddy', label: 'Paddy', color: '#C9A227' },
  { key: 'mix', label: 'Mixing', color: '#6E8B8F' },
  { key: 'turner', label: 'Turner', color: '#5E8A55' },
  { key: 'bunker', label: 'Bunkers', color: '#4F6FA0' },
  { key: 'tunnel', label: 'Tunnel', color: '#6B5443' },
];

export function simGroupOf(a: Pick<SopActivity, 'stream' | 'scope' | 'isLab' | 'isPreH0'>): SimGroup | null {
  if (a.isLab || a.isPreH0) return null;
  switch (a.stream) {
    case 'PRIMARY_FIBRE':
    case 'SECONDARY_FIBRE':
      return 'fibre';
    case 'NITROGEN_MINERAL':
      return 'cm';
    case 'STRUCTURAL_STRAW':
      return 'paddy';
    case 'BUNKER':
      return 'bunker';
    case 'TUNNEL':
      return 'tunnel';
    case 'YARD':
      return a.scope === 'PILE' ? 'turner' : 'mix';
    default:
      return null;
  }
}

export type Window = { group: SimGroup; start: number; end: number };

/** Each stage of the process as one window of hours from H0 (earliest start → latest end of its steps). */
export function stageWindows(acts: SopActivity[]): Window[] {
  const by = new Map<SimGroup, Window>();
  for (const a of acts) {
    const g = simGroupOf(a);
    if (!g || a.start == null) continue;
    const end = a.end ?? a.start;
    const w = by.get(g);
    if (!w) by.set(g, { group: g, start: a.start, end });
    else { w.start = Math.min(w.start, a.start); w.end = Math.max(w.end, end); }
  }
  return SIM_GROUPS.map((g) => by.get(g.key)).filter((w): w is Window => !!w);
}

export const finishHour = (w: Window[]) => Math.max(0, ...w.map((x) => x.end));

/** Where a batch is at a given hour: which stages are running, or not started / finished. */
export function positionAt(w: Window[], hour: number): { kind: 'before' | 'running' | 'done'; groups: SimGroup[] } {
  if (hour < 0) return { kind: 'before', groups: [] };
  if (hour >= finishHour(w)) return { kind: 'done', groups: [] };
  return { kind: 'running', groups: w.filter((x) => hour >= x.start && hour < x.end).map((x) => x.group) };
}

export const HOUR_MS = 3_600_000;
