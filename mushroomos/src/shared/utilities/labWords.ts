import { STATE_LABEL } from '../api/work';
import type { Tone } from '../ui/primitives';

/**
 * The words the Lab workstation uses. `UI-SYSTEM.md` — one word per state, the same everywhere.
 *
 * FORMATTING, NOT RULES. Every input here is a server field: `state`, the latest `lab_decision`
 * verdict, and whether the checkpoint holds a gate (from `v_lab_gate`). Nothing is inferred from the
 * clock, and nothing decides what the technician may do — the RPCs do that.
 */

export type LabStatus = { label: string; tone: Tone };

export function labStatus(state: string, verdict: string | null, holdsGate: boolean | null): LabStatus {
  // Work that is open wins over an old verdict — a checkpoint returned after a rejection is work again.
  if (state === 'IN_PROGRESS') return { label: 'In progress', tone: 'accent' };
  if (state === 'RETURNED') return { label: 'Returned to you', tone: 'warn' };
  if (state === 'READY') return { label: 'Ready', tone: 'accent' };
  if (state === 'LOCKED' || state === 'BLOCKED') return { label: 'Locked', tone: 'lock' };
  if (verdict === 'approved') return { label: 'Approved', tone: 'ok' };
  if (verdict === 'rejected') return { label: 'Rejected', tone: 'crit' };
  if (state === 'COMPLETED' && holdsGate) return { label: 'Waiting approval', tone: 'warn' };
  if (state === 'COMPLETED') return { label: 'Completed', tone: 'ok' };
  return { label: STATE_LABEL[state] ?? state, tone: 'muted' };
}

/** `moisture_pct` → `Moisture %`, `ph` → `pH`. The code stays available for anyone who needs it. */
export function paramLabel(code: string): string {
  const words = code.split('_').map((w) => (w === 'pct' ? '%' : w === 'ph' ? 'pH' : w));
  const s = words.join(' ');
  if (s.startsWith('pH')) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A server instant, in the phone's own clock and words. Formatting only. */
export function fmtWhen(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

const ROLE_WORDS: Record<string, string> = {
  gm: 'the GM',
  supervisor: 'a supervisor',
  manager: 'a manager',
  admin: 'an admin',
};

/** `['gm','supervisor']` → "a supervisor or the GM". Read from the server, never assumed (C-32). */
export function approverWords(roles: string[]): string {
  const words = [...roles].sort((a) => (a === 'gm' ? 1 : -1)).map((r) => ROLE_WORDS[r] ?? r);
  if (words.length === 0) return 'the approver';
  return words.join(' or ');
}
