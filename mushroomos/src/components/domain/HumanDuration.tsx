/**
 * Durations are spoken, not computed. `UI_CONTROL_TOWER_SPEC §8.2`.
 *
 * | Never | Always |
 * |---|---|
 * | `+74 min`          | `1h 14m behind` |
 * | `-0.5 h`           | `30 min early`  |
 * | `variance 0.0512 d`| deleted         |
 *
 * L2 — knows domain shapes, imports L1 only, never touches `api/`.
 */

/**
 * The duration text, and nothing else.
 *
 * `UI_ACCEPTANCE_CRITERIA` A14 is a property test over ±10000 minutes asserting the output matches
 * `/\d+h( \d+m)?|\d+m/`. So this returns a MAGNITUDE: no sign, no unit word, no decimal. The
 * direction is a separate register, because "behind" and "early" are the caller's knowledge, not
 * the duration's — the same 200 minutes reads as late on a variance and as remaining on a rest.
 *
 * Fractional input is rounded to whole minutes. A decimal minute is not something a person says.
 */
export function humanDuration(minutes: number): string {
  if (!Number.isFinite(minutes)) return '0m';

  const total = Math.round(Math.abs(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;

  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function HumanDuration({ minutes }: { minutes: number }) {
  return <span className="mono tabular-nums">{humanDuration(minutes)}</span>;
}

/**
 * A variance, spoken. `3h 20m behind`, `30m early`, `on plan`.
 *
 * Deliberately separate from `HumanDuration` so that component's output stays checkable against
 * A14's pattern. Exact zero is `on plan` rather than `0m`, because "0m behind" is not a sentence.
 *
 * `null` is not zero. It means there is nothing to compare yet — no plan, or no actual end — and
 * `variance_minutes` is genuinely NULL in that case rather than 0.
 */
export function Variance({
  minutes,
  absentLabel = 'no comparison yet',
}: {
  minutes: number | null;
  absentLabel?: string;
}) {
  if (minutes === null) {
    return <span className="text-[12px] text-muted">{absentLabel}</span>;
  }

  const rounded = Math.round(minutes);
  if (rounded === 0) {
    return (
      <span className="font-head text-[13px] font-600" style={{ color: 'var(--ok)' }}>
        on plan
      </span>
    );
  }

  const behind = rounded > 0;
  return (
    <span
      className="font-head text-[13px] font-600"
      style={{ color: behind ? 'var(--warn)' : 'var(--ok)' }}
    >
      <span className="mono tabular-nums">{humanDuration(rounded)}</span>{' '}
      {behind ? 'behind' : 'early'}
    </span>
  );
}
