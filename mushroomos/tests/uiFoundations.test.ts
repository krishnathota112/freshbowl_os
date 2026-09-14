/**
 * C1 — the UI foundations, against `docs/UI_ACCEPTANCE_CRITERIA.md`.
 *
 * The gate for this step is A3, A4 and A10–A14. Each is asserted here, in `npm test`, so a failure
 * blocks the step rather than being noticed later.
 *
 * NONE OF THESE NEEDS A DATABASE. That is the point of C1: L1, L2 and L3 render from props, so the
 * whole layer is checkable before any RPC exists.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ONE DEVIATION FROM THE DOCUMENT'S "HOW" COLUMN, stated rather than buried.
 *
 * A10 and A11 are specified as ESLint `no-restricted-imports` rules. **ESLint is not installed in
 * this repository** — no `eslint` package, no config file of any generation. Adding it means three
 * new direct dependencies and roughly a hundred transitive ones, and on its own it would still not
 * block: `npm test` runs vitest, so an ESLint rule would have to be wired into the test script
 * before it failed anything.
 *
 * So both are enforced here instead, as import-boundary scans over the component directories. The
 * ASSERTION is identical and it genuinely blocks; the MECHANISM differs from the document. If
 * ESLint is added later it should read the same boundary table, which is why the table below is
 * data rather than prose.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { humanDuration } from '../src/shared/ui/domain/HumanDuration';
import { densityForRole } from '../src/shared/utils/useDensity';
import { batchDay, isWithinBaseline, wallClock } from '../src/domain/time';
import {
  fixtureActivities,
  fixtureCounters,
  fixtureExceptions,
  fixtureSegments,
  fixtureStaircase,
  type FixtureGeometry,
} from '../src/legacy/dev/fixtures';
import type { ActivityRef, BatchBar, Exception, TowerCounters } from '../src/domain/contracts';
import { ACTIVITY_STATES } from '../src/domain/types';
import { REPO_ROOT } from './db';

const APP_ROOT = fileURLToPath(new URL('../', import.meta.url));
const HOURS_PER_DAY = 24;

// ─────────────────────────────────────────────────────────────────────────────────────────
// A3 / A4 — negative type tests.
//
// A type test that has never been seen to fail proves nothing about the type, so each probe file
// is required to produce an error and the legal file is required not to.
// ─────────────────────────────────────────────────────────────────────────────────────────

type TscRun = { ok: boolean; output: string };

function typecheckProbes(): TscRun {
  // The compiler is invoked through node against the resolved binary rather than through `npx`.
  // `execFileSync` cannot launch a Windows `.cmd` shim without a shell, and reaching for a shell to
  // work around that would mean building a command line out of paths.
  const tsc = join(APP_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  try {
    const output = execFileSync(
      process.execPath,
      [tsc, '-p', 'tests/typeprobes/tsconfig.json', '--noEmit'],
      { cwd: APP_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return { ok: true, output };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: `${err.stdout ?? ''}${err.stderr ?? ''}${err.message ?? ''}` };
  }
}

/** Probes are compiled once — tsc over the whole app takes a few seconds. */
let probeRun: TscRun | null = null;
const probes = () => (probeRun ??= typecheckProbes());

/** Errors reported against a given probe file, as reported by tsc. */
function errorsIn(output: string, file: string): string[] {
  return output
    .split(/\r?\n/)
    .filter((line) => line.includes(file) && /error TS\d+/.test(line));
}

describe('A3 — TimeLabel cannot render a batch hour without a wall clock', () => {
  it('every illegal call in the probe fails to compile', () => {
    const run = probes();
    expect(run.ok, 'the probe directory must not typecheck — that is what it is for').toBe(false);

    const errors = errorsIn(run.output, 'a3-timeLabel.bad.tsx');
    // Four cases: hour alone, startAt alone, no baseline, no timezone field.
    expect(errors.length, run.output.slice(0, 2000)).toBeGreaterThanOrEqual(4);
    // And they are missing-prop errors, not a stray syntax mistake in the probe itself.
    expect(errors.join('\n')).toMatch(/TS2\d{3}/);
  });

  it('the legal call DOES compile — otherwise the type rejects everything', () => {
    const errors = errorsIn(probes().output, 'legal.good.tsx');
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

describe('A4 — Bar cannot be used for batch progress', () => {
  it('a batch-progress call fails to compile', () => {
    const errors = errorsIn(probes().output, 'a4-bar.bad.tsx');
    // Three cases: no kind, a kind outside the union, material without a unit.
    expect(errors.length, probes().output.slice(0, 2000)).toBeGreaterThanOrEqual(3);
  });

  it('no Bar anywhere in src/ is used for anything but material', () => {
    // The compile probe stops a NEW violation. This catches an existing one that was never fixed.
    const offenders: string[] = [];
    for (const file of walk(join(APP_ROOT, 'src'), ['.tsx'])) {
      const text = readFileSync(file, 'utf8');
      for (const call of text.matchAll(/<Bar\b[^>]*>/g)) {
        if (!call[0].includes('kind="material"')) {
          offenders.push(`${rel(file)}: ${call[0].slice(0, 80)}`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// A10 / A11 — the layer boundaries.
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * The layer of each component directory, per `UI_COMPONENT_ARCHITECTURE §2`.
 *
 * `components/layout/` is NOT in this table. `AppShell` is the application chrome that sits ABOVE
 * the routes in that document's own tree, so it is L4-and-above and legitimately reads the role to
 * render the header. §3 rule 4 is precise about this — "nothing BELOW L4 reads `useAuth()`" — where
 * A11's shorter wording ("no component outside `useDensity`") would also forbid `RoleGuard` in
 * `App.tsx`, which A15 requires to exist. The architecture document wins.
 */
const COMPONENT_LAYERS: { dir: string; layer: 'L1' | 'L2' | 'L3' }[] = [
  { dir: 'src/shared/ui/primitives', layer: 'L1' },
  { dir: 'src/shared/ui/graph', layer: 'L2' },
  { dir: 'src/shared/ui/domain', layer: 'L2' },
  { dir: 'src/shared/ui/composite', layer: 'L3' },
];

/** Imports no L1/L2/L3 component may make. A component that fetches cannot render from a fixture. */
const FORBIDDEN_BELOW_L4 = [
  { pattern: /from\s+['"][^'"]*\bapi\/[^'"]*['"]/, why: "imports api/ — L1..L3 take props" },
  { pattern: /from\s+['"]@supabase\/supabase-js['"]/, why: 'imports the Supabase client directly' },
  { pattern: /from\s+['"]@tanstack\/react-query['"]/, why: 'uses a query — only L4 may' },
  { pattern: /from\s+['"][^'"]*\/routes\/[^'"]*['"]/, why: 'imports a route' },
];

function rel(file: string) {
  return relative(APP_ROOT, file).split(sep).join('/');
}

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => full.endsWith(e))) out.push(full);
  }
  return out;
}

describe('A10 — no L1/L2/L3 component imports api/ or the Supabase client', () => {
  it('every component directory is clean', () => {
    const offenders: string[] = [];
    let scanned = 0;

    for (const { dir, layer } of COMPONENT_LAYERS) {
      for (const file of walk(join(APP_ROOT, dir), ['.ts', '.tsx'])) {
        scanned += 1;
        const text = readFileSync(file, 'utf8');
        for (const { pattern, why } of FORBIDDEN_BELOW_L4) {
          if (pattern.test(text)) offenders.push(`${layer} ${rel(file)}: ${why}`);
        }
      }
    }

    // A boundary test over zero files is not a boundary test.
    expect(scanned, 'no component files were scanned — check COMPONENT_LAYERS').toBeGreaterThan(2);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

/**
 * `tests/http.ts` relaxes TLS verification so that A4's JWT-level proofs can run on a machine whose
 * network intercepts TLS with an untrusted root. That is defensible in a test process and it is a
 * real vulnerability in a shipped application, so the boundary is asserted rather than trusted.
 *
 * `tests/http.ts` says this test exists. Now it does.
 */
describe('TLS verification is never relaxed inside src/', () => {
  it('no shipped file disables certificate checking', () => {
    const banned = [
      { pattern: /NODE_TLS_REJECT_UNAUTHORIZED/, why: 'disables TLS verification process-wide' },
      { pattern: /rejectUnauthorized\s*:\s*false/, why: 'accepts an unverified certificate' },
      { pattern: /strictSSL\s*:\s*false/, why: 'accepts an unverified certificate' },
    ];

    const offenders: string[] = [];
    let scanned = 0;
    for (const file of walk(join(APP_ROOT, 'src'), ['.ts', '.tsx'])) {
      scanned += 1;
      const text = readFileSync(file, 'utf8');
      for (const { pattern, why } of banned) {
        if (pattern.test(text)) offenders.push(`${rel(file)} — ${why}`);
      }
    }
    expect(scanned, 'the scan found no files, so it proves nothing').toBeGreaterThan(0);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('A11 — role reaches layout through useDensity and nowhere else', () => {
  it('no L1/L2/L3 component reads useAuth', () => {
    const offenders: string[] = [];
    for (const { dir, layer } of COMPONENT_LAYERS) {
      for (const file of walk(join(APP_ROOT, dir), ['.ts', '.tsx'])) {
        const text = readFileSync(file, 'utf8');
        if (/\buseAuth\b/.test(text)) offenders.push(`${layer} ${rel(file)} reads useAuth`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('the role-to-density mapping exists in exactly one file', () => {
    // Any other file mapping lab_tech to a density would be a second copy of the rule.
    const mappers: string[] = [];
    for (const file of walk(join(APP_ROOT, 'src'), ['.ts', '.tsx'])) {
      const text = readFileSync(file, 'utf8');
      if (/lab_tech['"]?\s*:\s*['"]lab['"]/.test(text)) mappers.push(rel(file));
    }
    expect(mappers).toEqual(['src/shared/utils/useDensity.ts']);
  });

  it('the mapping is total over AppRole and narrows to operator when the role is unknown', () => {
    expect(densityForRole('lab_tech')).toBe('lab');
    expect(densityForRole('operator')).toBe('operator');
    expect(densityForRole('supervisor')).toBe('supervisor');
    expect(densityForRole('admin')).toBe('admin');
    expect(densityForRole('manager')).toBe('manager');
    expect(densityForRole('gm')).toBe('gm');
    // Before the claim arrives, the narrowest view — never a management one.
    expect(densityForRole(null)).toBe('operator');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// A12 / A13 — the fixtures.
// ─────────────────────────────────────────────────────────────────────────────────────────

type Book1 = {
  sha256: string;
  batches: { start_date: string; total_hours: number; hours: [number, string, number][] }[];
};

const book1 = JSON.parse(
  readFileSync(join(REPO_ROOT, 'docs', '_reference', 'source', 'book1_hour_grid.json'), 'utf8')
) as Book1;

/**
 * The geometry, READ from the grid. This is the whole of A12: the baseline and the stagger enter
 * the fixtures as values from `Book1.xlsx`, not as numbers somebody typed.
 */
function geometryFromBook1(): FixtureGeometry {
  const b = book1.batches[0];
  return {
    baselineHours: b.total_hours,
    // The grid gives a calendar date, not an instant — turning it into one needs the factory
    // timezone, and TBD-50 is open. So the fixture carries the live state: no H0, no zone.
    startAt: null,
    timezone: null,
    timezoneConflictId: 'TBD-50',
  };
}

/** The stagger, also read: the gap between the first hours of consecutive batches in the grid. */
function staggerFromBook1(): number {
  const [first, second] = book1.batches;
  const days =
    (Date.parse(`${second.start_date}T00:00:00Z`) - Date.parse(`${first.start_date}T00:00:00Z`)) /
    86_400_000;
  return days * HOURS_PER_DAY;
}

describe('A12 — time fixtures derive from the Book1 grid', () => {
  it('the grid is still the one the workbook produced', () => {
    const actual = createHash('sha256')
      .update(readFileSync(join(REPO_ROOT, 'mails', 'Book1.xlsx')))
      .digest('hex');
    expect(actual).toBe(book1.sha256);
  });

  it('no fixture file contains a typed-in hour geometry', () => {
    // The fixtures are functions of the geometry. If a baseline or a stagger were written into them
    // they would be both a typed-in hour (A12) and a literal in src/ (A1), so there is nowhere in
    // src/ for either number to live. This asserts the design rather than trusting it.
    const forbidden = [String(book1.batches[0].total_hours), String(staggerFromBook1())];
    const text = readFileSync(join(APP_ROOT, 'src', 'fixtures', 'index.ts'), 'utf8');
    for (const n of forbidden) {
      expect(new RegExp(`(?<![\\d.])${n}(?!\\d)`).test(text), `${n} is typed into the fixtures`).toBe(
        false
      );
    }
  });

  it('every fixture hour lands inside the baseline the grid states', () => {
    const g = geometryFromBook1();
    const bars = fixtureStaircase(g, staggerFromBook1());
    expect(bars.length).toBe(3);

    for (const bar of bars) {
      expect(bar.nowHour).not.toBeNull();
      // isWithinBaseline takes the baseline as a parameter — TIME_CONTRACT §1.3.
      expect(isWithinBaseline(bar.nowHour!, g.baselineHours)).toBe(true);
      expect(bar.clock.baselineHours).toBe(g.baselineHours);

      for (const seg of bar.segments) {
        expect(seg.fromHour).toBeGreaterThanOrEqual(1);
        expect(seg.toHour).toBeLessThanOrEqual(g.baselineHours);
        expect(seg.toHour).toBeGreaterThanOrEqual(seg.fromHour);
      }
    }
  });

  it('the staircase is sorted so the diagonal survives', () => {
    // UI_CONTROL_TOWER_SPEC §9.1 — do not sort by name or status.
    const bars = fixtureStaircase(geometryFromBook1(), staggerFromBook1());
    const hours = bars.map((b) => b.nowHour ?? 0);
    expect([...hours].sort((a, b) => b - a)).toEqual(hours);
    expect(new Set(hours).size).toBe(hours.length);
  });

  it('the segments cover the axis with no gap and no overlap', () => {
    const g = geometryFromBook1();
    const segs = fixtureSegments(g, Math.floor(g.baselineHours / 2));
    expect(segs.length).toBeGreaterThan(1);
    for (let i = 1; i < segs.length; i += 1) {
      expect(segs[i].fromHour).toBe(segs[i - 1].toHour);
    }
    expect(segs[0].fromHour).toBe(1);
    expect(segs.at(-1)!.toHour).toBe(g.baselineHours);
  });

  it('a fixture activity hour agrees with batchDay and wallClock from src/domain/time.ts', () => {
    const g = geometryFromBook1();
    const startAt = `${book1.batches[0].start_date}T00:00:00Z`;
    for (const a of fixtureActivities(g, Math.floor(g.baselineHours / 2))) {
      if (a.baselineStartHour === null) continue;
      expect(isWithinBaseline(Math.max(1, a.baselineStartHour), g.baselineHours)).toBe(true);
      // The hour index and the day agree with the frozen functions, not with a second derivation.
      const hour = Math.max(1, a.baselineStartHour);
      expect(batchDay(hour)).toBe(Math.floor((hour - 1) / HOURS_PER_DAY));
      expect(wallClock(hour, startAt).getTime()).toBe(
        Date.parse(startAt) + (hour - 1) * 3_600_000
      );
    }
  });
});

describe('A13 — every fixture typechecks against UI_DATA_CONTRACTS', () => {
  it('the fixtures satisfy the contract types, with no any and no cast', () => {
    // The real assertion is `tsc --noEmit`, which types these annotations. The runtime checks below
    // catch the thing a type cannot: a value that is legal by shape but impossible in the engine.
    const g = geometryFromBook1();
    const bars: BatchBar[] = fixtureStaircase(g, staggerFromBook1());
    const counters: TowerCounters = fixtureCounters(bars);
    const exceptions: Exception[] = fixtureExceptions(new Date().toISOString());
    const activities: ActivityRef[] = fixtureActivities(g, 100);

    // Four counters, no fifth. UI_CONTROL_TOWER_SPEC §9.
    expect(Object.keys(counters).sort()).toEqual(['held', 'needsDecision', 'onPlan', 'running']);
    expect(counters.running).toBe(bars.length);
    expect(counters.onPlan + counters.needsDecision + counters.held).toBe(counters.running);

    // No fixture may contain a state the engine cannot produce. UI_IMPLEMENTATION_PLAN §4.
    for (const a of activities) {
      expect(ACTIVITY_STATES as readonly string[]).toContain(a.state);
    }

    // Every non-actionable state carries a reason, and every actionable one does not pretend to.
    for (const a of activities) {
      const nonActionable = ['LOCKED', 'WAITING_TIME', 'BLOCKED', 'DEVIATION'].includes(a.state);
      if (nonActionable) expect(a.blockedReason, a.code).not.toBeNull();
    }

    // varianceMinutes is null, not 0, on anything that has not ended. The database returns NULL.
    for (const a of activities) {
      if (a.state !== 'COMPLETED') expect(a.varianceMinutes, a.code).toBeNull();
    }

    // An exception names a person and a since — criterion 2.
    for (const e of exceptions) {
      expect(e.whoIsWaiting.length).toBeGreaterThan(0);
      expect(Number.isFinite(Date.parse(e.since))).toBe(true);
    }

    // No batch carries a percentage. §8.3, rule E.1.
    for (const bar of bars) {
      expect(Object.keys(bar)).not.toContain('percentComplete');
      expect(Object.keys(bar)).not.toContain('progress');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// A14 — durations are spoken.
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Anchored deliberately. The document writes the pattern as `/\d+h( \d+m)?|\d+m/`, which unanchored
 * would also accept `about 3h, give or take 0.5 hours` — it matches a substring. A14's actual
 * requirement is that raw minutes and decimal hours are NEVER emitted, so the whole output has to
 * be the pattern.
 */
const SPOKEN = /^(\d+h( \d+m)?|\d+m)$/;

describe('A14 — HumanDuration never emits raw minutes or decimal hours', () => {
  it('holds for every integer minute across ±10000', () => {
    fc.assert(
      fc.property(fc.integer({ min: -10_000, max: 10_000 }), (minutes) => {
        const out = humanDuration(minutes);
        expect(out, `${minutes} -> ${out}`).toMatch(SPOKEN);
        // No sign, no decimal point, no unit word. The direction is the caller's register.
        expect(out).not.toMatch(/[-+.]/);
        expect(out).not.toMatch(/min|hour|hr/);
      }),
      { numRuns: 2000 }
    );
  });

  it('holds for fractional minutes too, by rounding to something a person would say', () => {
    fc.assert(
      fc.property(fc.double({ min: -10_000, max: 10_000, noNaN: true }), (minutes) => {
        expect(humanDuration(minutes)).toMatch(SPOKEN);
      }),
      { numRuns: 1000 }
    );
  });

  it('renders the cases UI_CONTROL_TOWER_SPEC §8.2 states', () => {
    expect(humanDuration(74)).toBe('1h 14m'); // never '+74 min'
    expect(humanDuration(-30)).toBe('30m'); // never '-0.5 h'
    expect(humanDuration(200)).toBe('3h 20m');
    expect(humanDuration(180)).toBe('3h'); // not '3h 0m'
    expect(humanDuration(0)).toBe('0m');
  });

  it('a whole number of hours never carries a zero-minute tail', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 400 }), (h) => {
        expect(humanDuration(h * 60)).toBe(`${h}h`);
      })
    );
  });

  it('is symmetric — the sign belongs to the caller, not to the duration', () => {
    fc.assert(
      fc.property(fc.integer({ min: -10_000, max: 10_000 }), (m) => {
        expect(humanDuration(m)).toBe(humanDuration(-m));
      })
    );
  });
});
