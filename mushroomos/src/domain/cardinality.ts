import type { ActivityScope, CardinalityRule } from './types';

/**
 * The cardinality evaluator. Pure: no I/O, no clock, no state, no writes.
 *
 * docs/KIRO_BUILD_INSTRUCTIONS.md §1 item 1 — every instance count comes from a rule
 * evaluated against Day-0 config. There is no literal count in this file and there must
 * never be one.
 */

export type Instance = {
  index: number;
  scopeLabel: string;
  scope: ActivityScope | 'MASTER';
  plannedQuantityMt?: number;
};

export type CardinalityError = {
  code: 'MISSING_CONFIG_FIELD' | 'INVALID_VALUE' | 'UNKNOWN_KIND';
  field?: string;
  message: string;
};

export type CardinalityResult =
  | { ok: true; instances: Instance[] }
  | { ok: false; error: CardinalityError };

/** The Day-0 answers a rule may read. Values only — no derived counts. */
export type BatchConfigView = Record<string, number | string | undefined>;

function requireNumber(
  config: BatchConfigView,
  field: string
): { ok: true; value: number } | { ok: false; error: CardinalityError } {
  const raw = config[field];
  if (raw === undefined || raw === null || raw === '') {
    return {
      ok: false,
      error: {
        code: 'MISSING_CONFIG_FIELD',
        field,
        // Named, never defaulted. docs/KIRO_BUILD_INSTRUCTIONS.md §1 item 6.
        message: `Day-0 configuration is missing '${field}'. No default exists for this field.`,
      },
    };
  }
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return {
      ok: false,
      error: {
        code: 'INVALID_VALUE',
        field,
        message: `'${field}' must be a positive number, received ${String(raw)}.`,
      },
    };
  }
  return { ok: true, value };
}

/** Round to 3 decimals so 0.1 + 0.2 style drift never shows up in a quantity. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function evaluateCardinality(
  rule: CardinalityRule,
  config: BatchConfigView
): CardinalityResult {
  switch (rule.kind) {
    case 'SINGLETON':
      return {
        ok: true,
        instances: [{ index: 1, scopeLabel: 'Master batch', scope: 'MASTER' }],
      };

    case 'DERIVED_FROM_QUANTITY': {
      const quantity = requireNumber(config, rule.quantity_field);
      if (!quantity.ok) return quantity;
      const capacity = requireNumber(config, rule.capacity_field);
      if (!capacity.ok) return capacity;

      const count = Math.ceil(quantity.value / capacity.value);
      const instances: Instance[] = [];
      let remaining = quantity.value;

      for (let i = 1; i <= count; i += 1) {
        const isTail = i === count;
        // The tail carries the remainder: 21.0 − 10 × 2.0 = 1.0 MT, not another full load.
        const planned =
          isTail && rule.tail_instance_takes_remainder !== false
            ? round3(remaining)
            : round3(Math.min(capacity.value, remaining));
        instances.push({
          index: i,
          scopeLabel: `Load ${String(i).padStart(2, '0')} of ${count}`,
          scope: 'LOAD',
          plannedQuantityMt: planned,
        });
        remaining = round3(remaining - planned);
      }
      return { ok: true, instances };
    }

    case 'PER_SCOPE_INSTANCE': {
      const field = rule.count_field ?? scopeCountField(rule.scope);
      const count = requireNumber(config, field);
      if (!count.ok) return count;
      const n = Math.floor(count.value);
      return {
        ok: true,
        instances: Array.from({ length: n }, (_, i) => ({
          index: i + 1,
          scopeLabel: `${scopeNoun(rule.scope)} ${i + 1} of ${n}`,
          scope: rule.scope,
        })),
      };
    }

    case 'CREATES_SCOPE_INSTANCES': {
      const count = requireNumber(config, rule.count_field);
      if (!count.ok) return count;
      const n = Math.floor(count.value);
      return {
        ok: true,
        instances: Array.from({ length: n }, (_, i) => ({
          index: i + 1,
          scopeLabel: `${rule.label_prefix}-${i + 1}`,
          scope: rule.scope,
        })),
      };
    }

    case 'MERGES_SCOPE_INSTANCES':
      return {
        ok: true,
        instances: Array.from({ length: rule.to_count }, (_, i) => ({
          index: i + 1,
          scopeLabel: rule.new_label,
          scope: rule.scope,
        })),
      };

    case 'REPEAT': {
      const count = requireNumber(config, rule.count_field);
      if (!count.ok) return count;
      const n = Math.floor(count.value);
      return {
        ok: true,
        instances: Array.from({ length: n }, (_, i) => ({
          index: i + 1,
          scopeLabel: rule.index_label.replace('{n}', String(i + 1)),
          scope: 'MASTER',
        })),
      };
    }

    default: {
      const exhaustive: never = rule;
      return {
        ok: false,
        error: {
          code: 'UNKNOWN_KIND',
          message: `Unrecognised cardinality kind: ${JSON.stringify(exhaustive)}`,
        },
      };
    }
  }
}

/** Which Day-0 field holds the count for a scope. Still config, never a literal. */
export function scopeCountField(scope: ActivityScope): string {
  switch (scope) {
    case 'BUNKER_LINE':
      return 'bunker_line_count';
    case 'PILE':
      return 'yard_pile_count';
    case 'STRAW_PILE':
      return 'straw_pile_count';
    case 'TUNNEL':
      return 'tunnel_count';
    case 'INDIVIDUAL_BATCH':
      return 'individual_batch_count';
    case 'LOAD':
      return 'load_count';
    case 'MASTER':
    default:
      return 'master_count';
  }
}

function scopeNoun(scope: ActivityScope): string {
  switch (scope) {
    case 'BUNKER_LINE':
      return 'Line';
    case 'PILE':
      return 'Pile';
    case 'STRAW_PILE':
      return 'Straw pile';
    case 'TUNNEL':
      return 'Tunnel';
    case 'INDIVIDUAL_BATCH':
      return 'Batch';
    case 'LOAD':
      return 'Load';
    default:
      return 'Instance';
  }
}
