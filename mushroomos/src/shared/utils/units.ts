/**
 * Weights are STORED in kilograms — the unit of every weight parameter (0129 `wt_*_kg`, `dry_weight`) — and
 * SHOWN in tons (owner, 25 Sep 2026: "change from kgs to tons for better understanding"). Display only:
 * no recorded value is rewritten; a kg reading of 18000 reads "18 t".
 */
export const KG_PER_TON = 1000;

const tidy = (n: number) => String(Math.round(n * 1000) / 1000);

export function shownQty(value: string | number | null | undefined, unit: string | null | undefined): { value: string | null; unit: string } {
  if (value == null || value === '') return { value: null, unit: unit ?? '' };
  const n = Number(value);
  if ((unit ?? '').trim().toLowerCase() === 'kg' && Number.isFinite(n)) return { value: tidy(n / KG_PER_TON), unit: 't' };
  return { value: String(value), unit: unit ?? '' };
}

/** "18 t", "58.6 %", "4" — value and unit as one string; '—' when there is no value. */
export function showQty(value: string | number | null | undefined, unit: string | null | undefined): string {
  const q = shownQty(value, unit);
  return q.value == null ? '—' : q.unit ? `${q.value} ${q.unit}` : q.value;
}
