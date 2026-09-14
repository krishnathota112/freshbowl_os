import type { ActivityState, Density, FiveLayerNodeProps, LayerValue } from '../../domain/types';
import { NON_ACTIONABLE_STATES } from '../../domain/types';
import { Chip, ConflictMarker, Countdown } from '../primitives';

/**
 * THE five-layer node. docs/UI_DESIGN_SPEC.md §2.
 *
 * One component, six densities. The invariants below are enforced HERE, not by callers —
 * that is the whole point of building it before any screen uses it. Six roles cannot drift
 * into six inconsistent products if there is only one place the vocabulary lives.
 */

/** Fixed order. A module constant, not a prop — callers cannot reorder. */
const LAYER_ORDER = ['sop', 'plan', 'actual', 'evidence', 'decision'] as const;
type LayerKey = (typeof LAYER_ORDER)[number];

/** Fixed colour assignment per layer. A lookup table, not passed in. */
const LAYER_META: Record<LayerKey, { glyph: string; name: string; defaultColor: string }> = {
  sop: { glyph: '①', name: 'SOP', defaultColor: 'var(--lock)' },
  plan: { glyph: '②', name: 'PLAN', defaultColor: 'var(--accent-ink)' },
  actual: { glyph: '③', name: 'ACTUAL', defaultColor: 'var(--ink)' },
  evidence: { glyph: '④', name: 'EVIDENCE', defaultColor: 'var(--ink-2)' },
  decision: { glyph: '⑤', name: 'DECISION', defaultColor: 'var(--ink-2)' },
};

const TONE_COLOR: Record<string, string> = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  crit: 'var(--crit)',
  muted: 'var(--muted)',
};

const STATE_STYLE: Record<ActivityState, { rail: string; tone: 'ok' | 'warn' | 'crit' | 'accent' | 'inherit' | 'lock' | 'muted'; dim?: boolean; strike?: boolean; pulse?: boolean }> = {
  COMPLETED: { rail: 'var(--ok)', tone: 'ok' },
  IN_PROGRESS: { rail: 'var(--accent)', tone: 'accent', pulse: true },
  READY: { rail: 'var(--accent)', tone: 'accent' },
  SUBMITTED: { rail: 'var(--accent)', tone: 'accent' },
  WAITING_TIME: { rail: 'var(--inherit)', tone: 'inherit' },
  WAITING_CONDITION: { rail: 'var(--inherit)', tone: 'inherit' },
  AWAITING_LAB: { rail: 'var(--accent)', tone: 'accent' },
  AWAITING_SUPERVISOR: { rail: 'var(--accent)', tone: 'accent' },
  BLOCKED: { rail: 'var(--crit)', tone: 'crit' },
  DEVIATION: { rail: 'var(--crit)', tone: 'crit' },
  RETURNED: { rail: 'var(--warn)', tone: 'warn' },
  LOCKED: { rail: 'var(--lock)', tone: 'lock', dim: true },
  SKIPPED: { rail: 'var(--lock)', tone: 'lock', strike: true },
  CANCELLED: { rail: 'var(--lock)', tone: 'lock', dim: true, strike: true },
};

/** Which layers each role sees prominently. docs/UI_DESIGN_SPEC.md §2.2. */
const DENSITY_LAYERS: Record<Density, LayerKey[]> = {
  operator: ['sop', 'plan', 'actual', 'evidence'],
  lab: ['sop', 'plan', 'actual', 'evidence'],
  supervisor: ['sop', 'plan', 'actual', 'evidence', 'decision'],
  admin: ['sop', 'plan', 'actual', 'evidence', 'decision'],
  manager: ['plan', 'actual'],
  gm: ['sop', 'plan', 'actual', 'decision'],
};

function LayerRow({
  layerKey,
  value,
  compact,
}: {
  layerKey: LayerKey;
  value: LayerValue | null;
  compact: boolean;
}) {
  const meta = LAYER_META[layerKey];

  // A null layer renders an em dash, never a blank. An absent SOP bound is information:
  // it means no source gives one. docs/LAB_MODEL.md §9.
  const text = value?.text ?? '—';
  const color = value?.tone ? TONE_COLOR[value.tone] : meta.defaultColor;

  return (
    <div className={`flex gap-2 ${compact ? 'py-0.5' : 'py-1'}`}>
      <span className="w-4 shrink-0 text-center text-[11px] text-muted" aria-hidden>
        {meta.glyph}
      </span>
      <span className="w-[68px] shrink-0 font-head text-[10px] font-600 uppercase tracking-wider text-muted">
        {meta.name}
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="mono text-[13px]" style={{ color }}>
          {text}
        </span>
        {value?.annotations?.map((a) => (
          <span key={a} className="mono text-[11px]" style={{ color: TONE_COLOR.warn }}>
            ⚠ {a}
          </span>
        ))}
        {value?.sourceRef && (
          <span className="mono text-[10px] text-muted">{value.sourceRef}</span>
        )}
        {!value?.text && !value?.sourceRef && value === null && (
          <span className="sr-only">no value</span>
        )}
        {value?.conflictId && <ConflictMarker id={value.conflictId} />}
      </span>
    </div>
  );
}

export function FiveLayerNode(props: FiveLayerNodeProps) {
  const { title, subtitle, instanceLabel, state, blockedReason, unblocksAt, layers, density, onExpand } =
    props;

  const style = STATE_STYLE[state];
  const compact = density === 'manager' || density === 'gm';
  const visible = DENSITY_LAYERS[density];

  const isNonActionable = NON_ACTIONABLE_STATES.has(state);

  return (
    <div
      className="rounded-md border bg-surface"
      style={{
        borderColor: 'var(--line)',
        borderLeftWidth: 3,
        borderLeftColor: style.rail,
        opacity: style.dim ? 0.55 : 1,
      }}
      onClick={onExpand}
      role={onExpand ? 'button' : undefined}
      tabIndex={onExpand ? 0 : undefined}
    >
      <header
        className="flex flex-wrap items-start justify-between gap-2 border-b px-3 py-2"
        style={{ borderColor: 'var(--line)' }}
      >
        <div className="min-w-0">
          <p
            className="font-head text-sm font-700 leading-tight"
            style={{ textDecoration: style.strike ? 'line-through' : undefined }}
          >
            {title}
          </p>
          <p className="mt-0.5 font-head text-[11px] font-500 uppercase tracking-wide text-muted">
            {subtitle}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Chip tone={style.tone}>{state.replace(/_/g, ' ')}</Chip>
          {instanceLabel && <span className="mono text-[11px] text-ink2">{instanceLabel}</span>}
        </div>
      </header>

      {/*
        Every non-actionable state carries a reason, rendered on the face of the node.
        docs/WORKFLOW_MODEL.md §2.1 — the UI never shows a grey card with no explanation.
        A missing reason is a seed defect, so it renders loudly rather than as a blank.
      */}
      {isNonActionable && (
        <div
          className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5"
          style={{
            borderColor: 'var(--line)',
            background: blockedReason ? 'var(--surface-2)' : 'var(--crit-soft)',
          }}
        >
          {blockedReason ? (
            <span className="text-[12px]" style={{ color: 'var(--ink-2)' }}>
              {blockedReason}
            </span>
          ) : (
            <span className="font-head text-[11px] font-700" style={{ color: 'var(--crit)' }}>
              DEFECT · state {state} carries no reason — gate_rule.blocked_reason_template is
              missing
            </span>
          )}
          {unblocksAt && <Countdown until={unblocksAt} />}
        </div>
      )}

      <div className="px-3 py-1.5">
        {LAYER_ORDER.filter((k) => visible.includes(k)).map((k) => (
          <LayerRow key={k} layerKey={k} value={layers[k]} compact={compact} />
        ))}
      </div>
    </div>
  );
}
