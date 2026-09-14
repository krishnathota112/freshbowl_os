/**
 * The one place a role becomes a layout decision.
 *
 * `UI_COMPONENT_ARCHITECTURE §3.4` and `§3` rule 4: nothing below L4 reads `useAuth()` except
 * through this hook, so role leaks into layout in exactly one place. `UI_ACCEPTANCE_CRITERIA` A11
 * asserts it, and `tests/uiFoundations.test.ts` enforces it by scanning the component directories.
 */

import type { AppRole, Density } from '../domain/types';
import { useAuth } from '../shared/auth/auth';

/**
 * The mapping, once. `lab_tech` is the only name that changes shape — every other role maps to
 * itself, and writing them all out keeps the record exhaustive rather than implied by a fallthrough.
 */
const ROLE_DENSITY: Record<AppRole, Density> = {
  operator: 'operator',
  lab_tech: 'lab',
  supervisor: 'supervisor',
  admin: 'admin',
  manager: 'manager',
  gm: 'gm',
};

/**
 * The density for the signed-in role.
 */
export function useDensity(): Density {
  const { role } = useAuth();
  return role ? ROLE_DENSITY[role] : 'operator';
}

/** The pure mapping, for tests and for a caller that already has a role in hand. */
export function densityForRole(role: AppRole | null): Density {
  return role ? ROLE_DENSITY[role] : 'operator';
}
