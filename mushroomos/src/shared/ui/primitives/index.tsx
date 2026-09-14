import { useEffect, useState, type ReactNode } from 'react';
import { nowMs } from '../../utils/now';

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

/**
 * A filled bar — for MATERIAL QUANTITY and nothing else.
 *
 * `kind` is required and has exactly one member. That is deliberate, and it is what
 * `UI_ACCEPTANCE_CRITERIA` A4 tests: a bar is the natural thing to reach for when showing a count of
 * finished tasks against a total, and a batch percentage is banned outright —
 * `UI_CONTROL_TOWER_SPEC §8.3` (half the process is resting and rest does not compress, so "50%"
 * tells the reader nothing true) and rule E.1, which auto-fails the workstream for it. The honest
 * batch indicator is position on the hour rail, which is `HourRail`, not this.
 *
 * Making the single legal kind explicit means the ban is enforced by the compiler at the call site
 * rather than by whoever reviews it. `unit` is required for the same reason: a material bar without
 * a unit is a fraction, which is the thing being prevented.
 *
 * It found two live violations when it was introduced — a done/total activities bar on the batch
 * page and an instance-count bar against an arbitrary maximum. Both were deleted rather than
 * relabelled; the `Stat` above each already said the same thing with its comparison.
 */
export function Bar({
  kind,
  value,
  max,
  unit,
  tone = 'accent',
}: {
  kind: 'material';
  value: number;
  max: number;
  /** e.g. 'MT'. A bar with no unit is a percentage wearing a disguise. */
  unit: string;
  tone?: Tone;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-sm"
      style={{ background: 'var(--surface-2)' }}
      role="progressbar"
      aria-label={`${kind} loaded, ${value} of ${max} ${unit}`}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuetext={`${value} of ${max} ${unit}`}
    >
      <div
        className="h-full rounded-sm transition-[width] duration-300"
        style={{ width: `${pct}%`, background: TONE_STYLE[tone].border }}
      />
    </div>
  );
}

/**
 * A loading placeholder that says what is coming.
 *
 * `label` is required. `UI_DESIGN_SPEC §5` and cross-cutting criterion 83 say an empty state must
 * name what will fill it; a bare grey rectangle is the loading equivalent of "No data". The label
 * is announced to assistive technology and shown as text at the larger sizes.
 */
export function Skeleton({
  label,
  lines = 1,
  className = '',
}: {
  label: string;
  lines?: number;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-1.5 ${className}`}
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      {Array.from({ length: Math.max(1, lines) }, (_, i) => (
        <div
          key={i}
          className="motion-safe:animate-pulse h-3 rounded-sm"
          style={{
            background: 'var(--surface-2)',
            // A staggered last line reads as text arriving rather than as a broken box.
            width: i === lines - 1 && lines > 1 ? '60%' : '100%',
          }}
        />
      ))}
      <span className="text-[11px] text-muted">{label}</span>
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

  const ms = new Date(until).getTime() - nowMs();
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

/**
 * A Control Room band. `ROLE_AND_APPROVAL_MODEL §3.3`, `UI_ACCEPTANCE_CRITERIA` 60–63.
 *
 * The count is REQUIRED when the band is built and IMPOSSIBLE when it is not — criterion 62 says a
 * band with no backend must never show a zero, because a zero reads as "nothing is wrong". The
 * caller cannot get that wrong: there is no count to pass on the unbuilt branch.
 */
export function Band({
  title,
  count,
  urgent,
  children,
  defaultOpen = true,
}: {
  title: string;
  /** Omit only when the band is unbuilt. */
  count?: number;
  urgent?: boolean;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const tone: Tone = count === undefined ? 'lock' : count === 0 ? 'muted' : urgent ? 'crit' : 'warn';

  return (
    <section className="mb-3">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left"
        style={{ borderColor: 'var(--line)', background: 'var(--surface)', minHeight: 44 }}
      >
        <span aria-hidden className="mono text-[11px] text-muted">
          {open ? '▾' : '▸'}
        </span>
        <span className="font-head text-[13px] font-700 uppercase tracking-wide">{title}</span>
        {count === undefined ? (
          <Chip tone="lock">not built</Chip>
        ) : (
          <Chip tone={tone}>{count}</Chip>
        )}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </section>
  );
}

/**
 * The unbuilt half of a band. States which step releases it and why it is not merely empty.
 *
 * `UI_DESIGN_SPEC §5` — an empty state says what will fill it and when. This says the stronger
 * thing: that the absence is a gap in the system rather than an absence of problems.
 */
export function BandNotBuilt({ releasedWith, why }: { releasedWith: string; why: string }) {
  return (
    <div
      className="rounded-md border border-dashed p-3"
      style={{ borderColor: 'var(--line-2)', background: 'var(--lock-soft)' }}
    >
      <p className="font-head text-[12px] font-600" style={{ color: 'var(--lock)' }}>
        No count is shown here on purpose — released with {releasedWith}
      </p>
      <p className="mt-1 max-w-prose text-[12px] text-muted">{why}</p>
    </div>
  );
}
