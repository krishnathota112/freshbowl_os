import { useEffect, useState, type ReactNode } from 'react';

/** Semantic tones. Meaning only — never decoration. docs/UI_DESIGN_SPEC.md §1. */
export type Tone = 'ok' | 'warn' | 'crit' | 'inherit' | 'lock' | 'accent' | 'muted';

const TONE_STYLE: Record<Tone, { color: string; bg: string; border: string }> = {
  ok: { color: 'var(--ok)', bg: 'var(--ok-soft)', border: 'var(--ok)' },
  warn: { color: 'var(--warn)', bg: 'var(--warn-soft)', border: 'var(--warn)' },
  crit: { color: 'var(--crit)', bg: 'var(--crit-soft)', border: 'var(--crit)' },
  inherit: { color: 'var(--inherit)', bg: 'var(--inherit-soft)', border: 'var(--inherit)' },
  lock: { color: 'var(--lock)', bg: 'var(--lock-soft)', border: 'var(--lock-2, var(--lock))' },
  accent: { color: 'var(--accent-ink)', bg: 'var(--accent-soft)', border: 'var(--accent)' },
  muted: { color: 'var(--muted)', bg: 'var(--surface-2)', border: 'var(--line-2)' },
};

export function Chip({
  children,
  tone = 'muted',
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  title?: string;
}) {
  const s = TONE_STYLE[tone];
  return (
    <span
      title={title}
      style={{ color: s.color, background: s.bg, borderColor: s.border }}
      className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-head text-[11px] font-600 uppercase leading-none tracking-wide"
    >
      {children}
    </span>
  );
}

/**
 * A conflict or TBD marker. docs/UI_DESIGN_SPEC.md §5 — never a silent default,
 * never a made-up number. The identifier is always named at the point of use.
 */
export function ConflictMarker({ id, note }: { id: string; note?: string }) {
  return (
    <span
      title={note ?? `${id} — unresolved; see the conflict register`}
      style={{ color: 'var(--warn)' }}
      className="inline-flex items-center gap-1 font-head text-[11px] font-600"
    >
      <span aria-hidden>⚠</span>
      <span className="mono">{id}</span>
    </span>
  );
}

/**
 * A number, its unit, and something to compare it against.
 * docs/UI_DESIGN_SPEC.md §5 — a number alone on a screen is a design failure here.
 */
export function Stat({
  label,
  value,
  unit,
  compare,
  tone,
  size = 'md',
}: {
  label: string;
  value: string | number;
  unit?: string;
  compare?: string;
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg';
}) {
  const valueSize = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-lg';
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-head text-[10px] font-600 uppercase tracking-wider text-muted">
        {label}
      </span>
      <span className="flex items-baseline gap-1">
        <span
          className={`mono ${valueSize} font-500`}
          style={tone ? { color: TONE_STYLE[tone].color } : undefined}
        >
          {value}
        </span>
        {unit && <span className="mono text-xs text-ink2">{unit}</span>}
      </span>
      {compare && <span className="mono text-[11px] text-muted">{compare}</span>}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  marker,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  marker?: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-2">
        <span className="font-head text-[11px] font-600 uppercase tracking-wider text-ink2">
          {label}
        </span>
        {marker}
      </span>
      {children}
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

export function NumberInput({
  value,
  onChange,
  step = 0.1,
  min = 0,
  unit,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  unit?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="number"
        inputMode="decimal"
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mono w-24 rounded border bg-surface px-2 py-1.5 text-sm"
        style={{ borderColor: 'var(--line-2)', color: 'var(--ink)' }}
      />
      {unit && <span className="mono text-xs text-muted">{unit}</span>}
    </span>
  );
}

export function Card({
  children,
  className = '',
  rail,
}: {
  children: ReactNode;
  className?: string;
  rail?: string;
}) {
  return (
    <div
      className={`rounded-md border bg-surface ${className}`}
      style={{
        borderColor: 'var(--line)',
        borderLeftWidth: rail ? 3 : 1,
        borderLeftColor: rail ?? 'var(--line)',
      }}
    >
      {children}
    </div>
  );
}

export function Bar({
  value,
  max,
  tone = 'accent',
}: {
  value: number;
  max: number;
  tone?: Tone;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-sm"
      style={{ background: 'var(--surface-2)' }}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className="h-full rounded-sm transition-[width] duration-300"
        style={{ width: `${pct}%`, background: TONE_STYLE[tone].border }}
      />
    </div>
  );
}

/** One shared interval for every countdown on the page, not a timer per node. */
let subscribers = new Set<() => void>();
let ticker: number | undefined;

function subscribeTick(fn: () => void) {
  subscribers.add(fn);
  if (ticker === undefined) {
    ticker = window.setInterval(() => subscribers.forEach((s) => s()), 1000);
  }
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0 && ticker !== undefined) {
      window.clearInterval(ticker);
      ticker = undefined;
    }
  };
}

export function Countdown({ until }: { until: string }) {
  const [, force] = useState(0);
  useEffect(() => subscribeTick(() => force((n) => n + 1)), []);

  const ms = new Date(until).getTime() - Date.now();
  if (Number.isNaN(ms)) return <span className="mono text-xs text-muted">—</span>;

  // The gate does not open because this hit zero. It opens because the server said so.
  if (ms <= 0) {
    return (
      <span className="mono" style={{ color: 'var(--ok)' }}>
        window open — opening now
      </span>
    );
  }

  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  // Under an hour, seconds matter — a 3-minute rest reads as 02:47, not "0 h 02 min".
  const text =
    h > 0
      ? `${h} h ${String(m).padStart(2, '0')} min remaining`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} remaining`;

  return (
    <span className="mono" style={{ color: 'var(--inherit)' }}>
      RESTING · {text}
    </span>
  );
}

/**
 * Empty states say what will fill them and when.
 * docs/UI_DESIGN_SPEC.md §5 — never "No data".
 */
export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div
      className="rounded-md border border-dashed p-6"
      style={{ borderColor: 'var(--line-2)' }}
    >
      <p className="font-head text-sm font-600 text-ink2">{title}</p>
      <p className="mt-1 max-w-prose text-sm text-muted">{detail}</p>
    </div>
  );
}
