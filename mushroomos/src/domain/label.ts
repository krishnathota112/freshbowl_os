/**
 * Label and reason rendering. Pure.
 *
 * Both throw on an unresolved placeholder rather than emitting a brace: a `{role_lead}`
 * visible on an operator's screen is a seed defect, and it should fail in CI, not in the yard.
 */

export type LabelBindings = {
  /** The material leading this activity's material role — 'Bagasse', 'Mustard Straw'. */
  role_lead?: string;
  /** Repeat index for REPEAT-cardinality activities. */
  n?: number | string;
  [key: string]: string | number | undefined;
};

const PLACEHOLDER = /\{([a-z0-9_]+)\}/gi;

export class UnresolvedPlaceholderError extends Error {
  constructor(
    public readonly template: string,
    public readonly placeholder: string
  ) {
    super(
      `Template '${template}' references '{${placeholder}}' but no value was supplied. ` +
        `This is a seed defect, not a runtime condition.`
    );
    this.name = 'UnresolvedPlaceholderError';
  }
}

function interpolate(template: string, values: Record<string, unknown>): string {
  return template.replace(PLACEHOLDER, (_match, key: string) => {
    const value = values[key];
    if (value === undefined || value === null || value === '') {
      throw new UnresolvedPlaceholderError(template, key);
    }
    return String(value);
  });
}

/**
 * Resolves `process_activity.label_template`.
 * '{role_lead} Weighment' → 'Bagasse Weighment' when bagasse leads PRIMARY_FIBRE,
 *                        → 'Mustard Straw Weighment' when mustard does. Same code, same gates.
 */
export function resolveLabel(template: string, bindings: LabelBindings): string {
  return interpolate(template, bindings);
}

/** Resolves `gate_rule.blocked_reason_template`. */
export function renderReason(template: string, values: Record<string, string | number>): string {
  return interpolate(template, values);
}

/** Non-throwing variant for surfaces that must render even when the seed is wrong. */
export function tryResolveLabel(
  template: string,
  bindings: LabelBindings
): { ok: true; text: string } | { ok: false; placeholder: string } {
  try {
    return { ok: true, text: resolveLabel(template, bindings) };
  } catch (e) {
    if (e instanceof UnresolvedPlaceholderError) {
      return { ok: false, placeholder: e.placeholder };
    }
    throw e;
  }
}
