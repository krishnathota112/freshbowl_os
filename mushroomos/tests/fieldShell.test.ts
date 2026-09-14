/**
 * C-FIELD — the field shell. `BUILD_SEQUENCE_KIRO.md §C-FIELD`.
 *
 * THE GATE, verbatim:
 *   · an operator lands on the field shell and can reach no management route
 *   · a management role never sees the field shell
 *   · the field entry's initial bundle excludes the tower, graph and Gantt chunks, asserted against
 *     build output
 *
 * The third one is asserted against a REAL BUILD, not against the source. This suite runs
 * `vite build --sourcemap --outDir dist-audit` and then reads two things Rollup emits:
 *
 *   `.vite/manifest.json`  the chunk graph — and crucially the split between `imports` (STATIC:
 *                          downloaded with the chunk) and `dynamicImports` (LAZY: downloaded only
 *                          when that route is opened). That distinction IS the proof.
 *   `*.js.map`             the `sources` array of each chunk, which names every source module inside
 *                          it. Un-minified and exact, so "this chunk contains the staircase" is a
 *                          fact read from the build rather than a guess from a file name.
 *
 * It is the same production build the deploy makes, with sourcemaps added by a flag — the committed
 * `vite.config.ts` is not changed for the test's benefit, and the output goes to its own directory so
 * `dist/` is never clobbered by a test run.
 *
 * NO DOM ENVIRONMENT IS INSTALLED — no jsdom, no @testing-library — so the first two assertions are
 * made against the route table and the shell-selection code rather than by rendering. Same trade and
 * same disclosure as C2 and C3. What that does and does not prove is stated at each test.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FIELD_ROLES, ROLE_HOME, isFieldRole } from '../src/shared/auth/auth';
import type { AppRole } from '../src/domain/types';

const APP_ROOT = fileURLToPath(new URL('../', import.meta.url));
const AUDIT_DIR = 'dist-audit';

const src = (...parts: string[]) => readFileSync(join(APP_ROOT, 'src', ...parts), 'utf8');
const ALL_ROLES: AppRole[] = ['gm', 'manager', 'admin', 'supervisor', 'operator', 'lab_tech'];

/**
 * Source with the comments removed.
 *
 * EVERY SCAN BELOW RUNS ON THIS, and the reason is a lesson C3 already paid for: a test that searches
 * prose for a banned word tests the prose. Six assertions in the first run of this file failed on
 * `FieldShell`'s own header — which says, in as many words, that there is no `NavLink`, no
 * `dataset.theme`, no modal and no IndexedDB cache. Explaining a ban is not breaking it.
 */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments, including the JSX `{/* … */}` form
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// The route table, read out of App.tsx
// ─────────────────────────────────────────────────────────────────────────────────────────

type RouteRow = {
  path: string;
  guarded: boolean;
  /** null for a route whose element is a bare redirect, so there is nothing to authorise. */
  allow: AppRole[] | null;
  devOnly: boolean;
  redirect: boolean;
};

/**
 * Parse the routes rather than trusting a list retyped here.
 *
 * A hand-maintained copy of the route table is the thing that goes stale first, and a stale copy
 * would let a management route become operator-reachable while this suite stayed green.
 */
/**
 * The names of components in `App.tsx` that do nothing but navigate.
 *
 * A route element is not always a bare `<Navigate>`. `/admin/batch/:id` cannot be one:
 * `<Navigate to="/batch/:id">` would send the LITERAL `:id`, and it would drop the search string —
 * losing the deep-linked hour that `?h=` exists for. So the redirect is a tiny component that reads
 * the param and the search and then navigates.
 *
 * ⚠ THE NAME IS NOT THE TEST. Trusting a `Redirect`-shaped name would let any component be waved
 * past the A15 guard check by renaming it. This reads each component's own body and keeps only the
 * ones that genuinely return a `<Navigate>` and render nothing else — same reasoning as the
 * `start_url` test below, which re-checks that `Landing` really does redirect by role.
 */
function redirectComponents(text: string): { name: string; targets: string[] }[] {
  const found: { name: string; targets: string[] }[] = [];
  const decls = [...text.matchAll(/function\s+([A-Za-z0-9_]+)\s*\(/g)];

  for (let i = 0; i < decls.length; i++) {
    const start = decls[i].index ?? 0;
    const end = i + 1 < decls.length ? (decls[i + 1].index ?? text.length) : text.length;
    const body = text.slice(start, end);

    // Returns a Navigate, and contains no other element — a component that redirects AND renders
    // is not a bare redirect, and its route does still need a guard.
    const elements = [...body.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)].map((m) => m[1]);
    if (elements.length === 0 || !elements.every((e) => e === 'Navigate')) continue;

    // Its OWN navigation targets, reduced to the first path segment. Scoped to this component's body
    // rather than the whole file: `Landing` also navigates, and to `/sign-in`, which A15 exempts by
    // name — reading file-wide would attribute that target to every redirect.
    const targets = [
      ...body.matchAll(/<Navigate[\s\S]*?to=\{?[`"']\/?([A-Za-z0-9-]+)/g),
    ].map((m) => m[1]);
    found.push({ name: decls[i][1], targets });
  }
  return found;
}

function routeTable(): RouteRow[] {
  const text = src('app', 'App.tsx');
  const lines = text.split('\n');

  // The named role sets, read from their declarations: `const MGMT: AppRole[] = [...]`.
  const sets = new Map<string, AppRole[]>();
  for (const m of text.matchAll(/const\s+([A-Z_]+):\s*AppRole\[\]\s*=\s*\[([^\]]*)\]/g)) {
    sets.set(
      m[1],
      [...m[2].matchAll(/'([a-z_]+)'/g)].map((r) => r[1] as AppRole)
    );
  }
  expect(sets.size, 'no role sets were parsed out of App.tsx — the parser is broken').toBeGreaterThan(0);

  // `{import.meta.env.DEV && … (` opens the dev-only block and `)}` closes it. Any route between the
  // two is dev-only. Brace counting was tried first and mis-attributed the `*` catch-all, which sits
  // after the block: a route was called dev-only because the depth arithmetic had not unwound.
  let inDev = false;

  const rows: RouteRow[] = [];
  for (const line of lines) {
    if (/import\.meta\.env\.DEV\s*&&/.test(line)) inDev = true;

    const route = /<Route\s+path="([^"]+)"/.exec(line);
    if (route) {
      const allowExpr = /allow=\{([^}]*)\}/.exec(line);
      let allow: AppRole[] | null = null;
      if (allowExpr) {
        const named = sets.get(allowExpr[1].trim());
        allow = named ?? [...allowExpr[1].matchAll(/'([a-z_]+)'/g)].map((r) => r[1] as AppRole);
      }
      const redirectComps = redirectComponents(text);
      rows.push({
        path: route[1],
        guarded: line.includes('RoleGuard'),
        allow,
        devOnly: inDev,
        redirect:
          /element=\{<Navigate/.test(line) ||
          redirectComps.some((c) => new RegExp(`element=\\{<${c.name}\\s*/?>`).test(line)),
      });
    }

    if (inDev && /^\s*\)\}/.test(line)) inDev = false;
  }

  expect(rows.length, 'no routes were parsed out of App.tsx — the parser is broken').toBeGreaterThan(5);
  return rows;
}

/** Every path a role can actually open in a production build. */
function reachableBy(role: AppRole): string[] {
  return routeTable()
    .filter((r) => !r.devOnly && !r.redirect && r.allow !== null && r.allow.includes(role))
    .map((r) => r.path)
    .sort();
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// The build, read once
// ─────────────────────────────────────────────────────────────────────────────────────────

type Chunk = {
  key: string;
  file: string;
  isEntry: boolean;
  /** Chunks downloaded WITH this one. */
  imports: string[];
  /** Chunks downloaded only if something asks for them. */
  dynamicImports: string[];
  /** Every source module inside this chunk, as a repo-relative path. */
  modules: string[];
};

let built: Map<string, Chunk> | null = null;

function build(): Map<string, Chunk> {
  if (built) return built;

  execFileSync(
    process.execPath,
    [
      join(APP_ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
      'build',
      '--mode',
      'production',
      '--sourcemap',
      '--outDir',
      AUDIT_DIR,
      '--emptyOutDir',
    ],
    {
      cwd: APP_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      /*
        NODE_ENV MUST BE FORCED, and this is not defensive tidying — it was a real defect in this test.

        Vitest runs with `NODE_ENV=test`, `execFileSync` inherits the environment, and Vite honours an
        NODE_ENV that is already set: `isProduction` stayed false, so `import.meta.env.DEV` compiled to
        `true` and the DEV-only Gallery survived into the audit build. The suite was auditing a build
        the deploy would never produce, which is worse than not auditing one.

        The Gallery assertion below is now the canary for it: if this build ever stops being a
        production build, a Gallery chunk reappears and that test fails.
      */
      env: { ...process.env, NODE_ENV: 'production' },
    }
  );

  const manifestPath = join(APP_ROOT, AUDIT_DIR, '.vite', 'manifest.json');
  expect(
    existsSync(manifestPath),
    'no build manifest — vite.config.ts must set build.manifest, or the build failed'
  ).toBe(true);

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
    string,
    { file: string; isEntry?: boolean; imports?: string[]; dynamicImports?: string[] }
  >;

  const chunks = new Map<string, Chunk>();
  for (const [key, v] of Object.entries(manifest)) {
    if (!v.file.endsWith('.js')) continue;

    // The sourcemap names every module Rollup put in this chunk.
    let modules: string[] = [];
    const mapPath = join(APP_ROOT, AUDIT_DIR, v.file + '.map');
    if (existsSync(mapPath)) {
      const map = JSON.parse(readFileSync(mapPath, 'utf8')) as { sources: string[] };
      modules = map.sources
        .map((s) => s.replace(/\\/g, '/'))
        .filter((s) => s.includes('/src/'))
        .map((s) => 'src/' + s.split('/src/')[1]);
    }

    chunks.set(key, {
      key,
      file: v.file,
      isEntry: v.isEntry ?? false,
      imports: v.imports ?? [],
      dynamicImports: v.dynamicImports ?? [],
      modules,
    });
  }

  expect(chunks.size, 'the build produced no JS chunks').toBeGreaterThan(5);
  built = chunks;
  return chunks;
}

const entryKey = () => {
  const key = [...build().values()].find((c) => c.isEntry)?.key;
  expect(key, 'the build has no entry chunk').toBeTruthy();
  return key!;
};

/** The chunk whose modules include `module`. */
function chunkOf(module: string): Chunk {
  const hits = [...build().values()].filter((c) => c.modules.includes(module));
  expect(hits.map((c) => c.key), `${module} is in ${hits.length} chunks, expected exactly 1`).toHaveLength(
    1
  );
  return hits[0];
}

/**
 * Everything a browser downloads to render the given chunks: the chunks themselves plus the
 * transitive closure of their STATIC imports. Dynamic imports are deliberately not followed — not
 * following them is what "initial bundle" means.
 */
function initialBundle(keys: string[]): Set<string> {
  const chunks = build();
  const seen = new Set<string>();
  const queue = [...keys];
  while (queue.length > 0) {
    const key = queue.pop()!;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const dep of chunks.get(key)?.imports ?? []) queue.push(dep);
  }
  return seen;
}

const modulesIn = (keys: Set<string>) =>
  new Set([...keys].flatMap((k) => build().get(k)?.modules ?? []));

const bytesIn = (keys: Set<string>) =>
  [...keys].reduce((n, k) => n + statSync(join(APP_ROOT, AUDIT_DIR, build().get(k)!.file)).size, 0);

/**
 * THE HEAVY LAYER the field entry must not download. Named by MODULE, not by chunk file, because
 * Rollup merges a route's dependencies into the route's own chunk and the file names carry hashes.
 */
const FORBIDDEN_IN_FIELD: { module: string; what: string; inProductionBuild?: false }[] = [
  { module: 'src/legacy/ui/StaircaseCalendar.tsx', what: 'the staircase', inProductionBuild: false }, // retired to src/legacy, 14 Sep 2026
  {
    module: 'src/shared/ui/composite/HourRail.tsx',
    what: 'the hour rail',
    // The `inProductionBuild: false` exception THIS ENTRY USED TO CARRY IS GONE.
    //
    // C2 built `HourRail` and for a while the only thing that rendered it was the DEV gallery, so once
    // the gallery stopped being emitted the rail had no production consumer and Rollup dropped it. This
    // suite discovered that and recorded it as a flagged exception rather than a quiet one.
    //
    // C4 landed and put the rail on the batch page — `UI_IMPLEMENTATION_PLAN §S2` — exactly as the
    // exception predicted. So the entry is now an ordinary positive control again: the rail must be in
    // the production build AND out of the field entry.
  },
  { module: 'src/shared/ui/composite/geometry.ts', what: 'the board geometry' },
  { module: 'src/legacy/ui/ExceptionBand.tsx', what: 'the exception band', inProductionBuild: false }, // retired
  { module: 'src/shared/api/tower.ts', what: "the tower's query layer" },
  { module: 'src/legacy/gm/ControlTower.tsx', what: 'the control tower', inProductionBuild: false }, // retired
  { module: 'src/shared/ui/graph/FiveLayerNode.tsx', what: 'the production graph node' },
  { module: 'src/features/admin/pages/ProcessExplorer.tsx', what: 'the process graph' },
  // The Gantt does not exist yet — A5 builds it. `UI_IMPLEMENTATION_PLAN §3.1` puts it in `Resources`,
  // which is why that screen was extracted into its own module: the boundary is asserted now, so the
  // Gantt cannot land inside the field entry later without failing this test.
  { module: 'src/legacy/manager/Resources.tsx', what: 'the resource view', inProductionBuild: false }, // retired
  { module: 'src/shared/ui/layout/AppShell.tsx', what: 'the management shell' },
];

/** The chunks a field session downloads: the entry, the field shell, and the field screens. */
function fieldBundle(): Set<string> {
  return initialBundle([
    entryKey(),
    chunkOf('src/shared/ui/layout/FieldShell.tsx').key,
    chunkOf('src/features/supervisor/pages/MyWork.tsx').key,
    chunkOf('src/features/lab/pages/LabQueue.tsx').key,
    chunkOf('src/features/lab/pages/LabCheckpoint.tsx').key,
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────────────────

describe('C-FIELD — an operator lands on the field shell and can reach no management route', () => {
  it('the shell is chosen by ROLE, and the field roles are exactly operator and lab_tech', () => {
    expect([...FIELD_ROLES].sort()).toEqual(['lab_tech', 'operator']);
    expect(isFieldRole('operator')).toBe(true);
    expect(isFieldRole('lab_tech')).toBe(true);
    // A role with no claim yet is not a field role — it is nothing, and RoleGuard refuses to render.
    expect(isFieldRole(null)).toBe(false);
  });

  it('every role has a home, and each field role goes to a field route', () => {
    for (const role of ALL_ROLES) expect(ROLE_HOME[role], `${role} has no home`).toBeTruthy();
    for (const role of FIELD_ROLES) {
      expect(reachableBy(role), `${role} cannot open their own home`).toContain(ROLE_HOME[role]);
    }
  });

  it('an operator can open exactly one route, and it is their own', () => {
    // The whole of "can reach no management route", stated positively so a NEW management route that
    // forgot to exclude the operator fails this rather than slipping past a deny-list.
    expect(reachableBy('operator')).toEqual(['/operator/my-work']);
  });

  it('a lab technician can open exactly their own two routes — the queue and one checkpoint', () => {
    // UI-001 gave the lab its own checkpoint screen rather than widening `/operator/my-work` to
    // lab_tech. Stated positively, as for the operator, so a new management route that forgot to
    // exclude lab_tech fails here.
    expect([...reachableBy('lab_tech')].sort()).toEqual(['/lab/checkpoint/:activityId', '/lab/queue']);
  });

  it('no route allowing a field role is a management route', () => {
    const management = routeTable().filter(
      (r) => !r.devOnly && !r.redirect && /^\/(admin|gm|manager|supervisor)\//.test(r.path)
    );
    expect(management.length, 'no management routes were found — the parser is broken').toBeGreaterThan(
      4
    );
    for (const r of management) {
      for (const role of FIELD_ROLES) {
        expect(r.allow ?? [], `${role} can open ${r.path}`).not.toContain(role);
      }
    }
  });

  it('every route is guarded except the landing page, sign-in and the bare redirects — A15', () => {
    // A15 reads "except `/` and `/sign-in`". A route whose element is a bare `<Navigate>` has no
    // component and no data, so there is nothing for a guard to protect; it is listed here rather than
    // waved through silently.
    const unguarded = routeTable()
      .filter((r) => !r.guarded && !r.redirect && r.path !== '/' && r.path !== '/sign-in')
      .map((r) => r.path);
    expect(unguarded).toEqual([]);
  });

  /**
   * ADDED WITH C4's ROUTE MOVE. An unguarded redirect is only safe if it lands somewhere guarded —
   * otherwise the redirect launders access to the page behind it, and A15 would be satisfied by a
   * route table that leaks.
   */
  it('an unguarded redirect lands on a GUARDED route, so it cannot launder access', () => {
    const text = src('app', 'App.tsx');
    const table = routeTable();
    const comps = redirectComponents(text);

    // C4 moved `/admin/batch/:id` to `/batch/:id` and left a redirect behind, so there is at least one
    // named redirect component to check. If this ever hits zero the check below is vacuous.
    const named = comps.filter((c) => new RegExp(`element=\\{<${c.name}\\s*/?>`).test(text));
    expect(
      named.length,
      'no named redirect component is routed — this check would be vacuous'
    ).toBeGreaterThan(0);

    for (const c of named) {
      expect(c.targets.length, `${c.name} navigates nowhere the parser can see`).toBeGreaterThan(0);

      for (const seg of new Set(c.targets)) {
        // A15 exempts `/` and `/sign-in` by name — an unauthenticated person has to be able to reach
        // the sign-in screen, so landing there is not laundering.
        if (seg === 'sign-in') continue;
        const landing = table.filter((t) => t.path === `/${seg}` || t.path.startsWith(`/${seg}/`));
        expect(landing.length, `${c.name} navigates to /${seg}, which is not a route`).toBeGreaterThan(
          0
        );
        for (const l of landing.filter((t) => !t.redirect)) {
          expect(l.guarded, `${c.name} lands on ${l.path}, which is NOT guarded`).toBe(true);
        }
      }
    }
  });

  it('there is no dev-only route — the gallery was retired to src/legacy (14 Sep 2026)', () => {
    const dev = routeTable().filter((r) => r.devOnly);
    expect(dev.map((r) => r.path)).toEqual([]);
    // And it is absent from the production build — asserted on the build output further down.
  });
});

describe('C-FIELD — a management role never sees the field shell', () => {
  it('isFieldRole is false for every management role', () => {
    for (const role of ['gm', 'manager', 'admin', 'supervisor'] as AppRole[]) {
      expect(isFieldRole(role), `${role} would be given the field shell`).toBe(false);
    }
  });

  it('the supervisor keeps the management shell on the operator screen, deliberately', () => {
    // §C-FIELD's argument against a second application: "a supervisor is genuinely both roles — on the
    // floor and in the control room". `OPS` lets them open `/operator/my-work`, and a supervisor who
    // lost the nav bar there would be stranded on a screen with no way out.
    expect(reachableBy('supervisor')).toContain('/operator/my-work');
    expect(isFieldRole('supervisor')).toBe(false);
  });

  it('the shell is selected in exactly ONE place, and only by isFieldRole', () => {
    // Two selectors would drift. A URL-prefix selector anywhere would reintroduce the supervisor trap.
    const users: string[] = [];
    for (const file of walk(join(APP_ROOT, 'src'), ['.ts', '.tsx'])) {
      const text = code(readFileSync(file, 'utf8'));
      if (/\bFieldShell\b/.test(text) && !file.endsWith('FieldShell.tsx')) {
        users.push(relative(APP_ROOT, file).split(sep).join('/'));
      }
    }
    expect(users).toEqual(['src/app/App.tsx']);

    const app = code(src('app', 'App.tsx'));
    const selector = /isFieldRole\(role\)\s*\?\s*FieldShell\s*:\s*AppShell/.exec(app);
    expect(selector, 'the shell is not chosen by isFieldRole(role)').toBeTruthy();
    // No second, URL-based path into the field shell.
    expect(app).not.toMatch(/startsWith\(['"]\/operator/);
    expect(app).not.toMatch(/pathname.*FieldShell/);
  });
});

describe('C-FIELD — FieldShell is what §C-FIELD specifies', () => {
  /** Comments stripped — see `code()`. The header describes every one of these bans by name. */
  const shell = () => code(src('shared', 'ui', 'layout', 'FieldShell.tsx'));

  it('has no nav bar', () => {
    const text = shell();
    expect(text).not.toMatch(/\bNavLink\b/);
    expect(text).not.toMatch(/<nav\b/);
    // And no route table of its own — the thing that made AppShell a nav bar.
    expect(text).not.toMatch(/\bto=["']\//);
  });

  it('has no theme toggle, and does not write the theme either', () => {
    const text = shell();
    expect(text).not.toMatch(/dataset\.theme/);
    expect(text).not.toMatch(/localStorage/);
    // Two writers of one attribute would mean the last shell to mount wins.
    expect(text).not.toMatch(/useTheme/);
  });

  it('carries a persistent offline chip, and it states a consequence rather than a status', () => {
    const text = shell();
    expect(text).toMatch(/navigator\.onLine/);
    expect(text).toMatch(/addEventListener\('offline'/);
    // Persistent, not a modal: it sticks to the top instead of covering the task.
    expect(text).toMatch(/sticky/);
    expect(text).not.toMatch(/\bdialog\b|\bmodal\b/i);
    // Criterion 84 — the reason on its face. "Offline" alone is a status; this says what it means.
    expect(text.replace(/\s+/g, ' ')).toMatch(/will not save until this clears/);
  });

  it('builds no offline queue, no cache and no blob capture — offline is out of scope', () => {
    const text = shell();
    for (const banned of ['indexedDB', 'IndexedDB', 'serviceWorker', 'caches.', 'localforage']) {
      expect(text, `${banned} appears in FieldShell — offline is out of scope`).not.toContain(banned);
    }
  });

  it('its own controls meet the 48 px target, from one constant', () => {
    const text = shell();
    const constant = /const TARGET_PX = (\d+)/.exec(text);
    expect(constant, 'the target size is not declared once').toBeTruthy();
    expect(Number(constant![1])).toBeGreaterThanOrEqual(48);
    // Used, not merely declared.
    expect(text).toMatch(/minHeight: TARGET_PX/);
  });

  it('is one column, and cannot push the page sideways', () => {
    const text = shell();
    expect(text).toMatch(/mx-auto/);
    expect(text).toMatch(/max-w-\[\d+px\]/);
    // Criterion 49 / E.10 — no horizontal page scroll at 375 px in any state.
    expect(text).toMatch(/overflow-x-hidden/);
    expect(text).not.toMatch(/overflow-x-auto|grid-cols/);
  });

  it('reads its colours from tokens, never from a literal — criterion 79', () => {
    const text = shell();
    const literals = text.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(literals, 'a colour literal outside theme/tokens.css').toEqual([]);
  });

  it('no service worker is registered anywhere in src/ — offline is out of scope', () => {
    const offenders: string[] = [];
    for (const file of walk(join(APP_ROOT, 'src'), ['.ts', '.tsx'])) {
      const text = code(readFileSync(file, 'utf8'));
      if (/serviceWorker|workbox|registerSW/.test(text)) {
        offenders.push(relative(APP_ROOT, file).split(sep).join('/'));
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('C-FIELD — the PWA manifest', () => {
  const manifest = () =>
    JSON.parse(readFileSync(join(APP_ROOT, 'public', 'manifest.webmanifest'), 'utf8')) as Record<
      string,
      string
    >;

  it('is linked from the one index.html — no second entry point', () => {
    const html = readFileSync(join(APP_ROOT, 'index.html'), 'utf8');
    expect(html).toMatch(/<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"/);

    // ONE application: exactly one HTML entry in the repo.
    const roots = readdirSync(APP_ROOT).filter((f) => f.endsWith('.html'));
    expect(roots).toEqual(['index.html']);

    /*
      THIS ASSERTION USED TO READ `expect(pkg).not.toMatch(/@capacitor/)`.
      It was correct when C-FIELD chose a PWA, and it is wrong now — but the RULE it was standing
      in for is not, so it is replaced rather than removed.

      The rule is ONE APPLICATION. Capacitor does not break it: the Android project is a native
      SHELL around the identical Vite build — same `index.html`, same bundle, same Supabase client,
      same tokens. It is the relationship `FieldShell` already has to `AppShell`, one layer further
      out. What WOULD break the rule is a second entry point or a second build, so those are what
      is asserted: exactly one root HTML above, and `webDir` pointing at the one build below.

      Deleting the assertion outright would have left nothing watching for a genuine fork.
    */
    const cap = JSON.parse(
      readFileSync(join(APP_ROOT, 'capacitor.config.json'), 'utf8')
    ) as Record<string, unknown>;
    expect(cap.webDir, 'the APK must ship the ONE build, never a fork of it').toBe('dist');
  });

  it('start_url resolves to the field home through the one role mapping', () => {
    // A manifest carries ONE start_url and there are TWO field homes, so `/` is not a hedge: it is the
    // Landing route, whose only job is to redirect to ROLE_HOME[role]. Naming one field home here would
    // put the wrong screen on the other person's home screen, and copying the mapping would make this
    // file a second source of truth for it.
    const m = manifest();
    expect(m.start_url).toBe('/');
    expect(m.scope).toBe('/');
    expect(m.display).toBe('standalone');

    // The claim above only holds if Landing really does redirect by role.
    const app = code(src('app', 'App.tsx'));
    expect(app).toMatch(/function Landing\(\)/);
    expect(app).toMatch(/<Navigate to=\{ROLE_HOME\[role\]\} replace \/>/);
    expect(app).toMatch(/<Route path="\/" element=\{<Landing \/>\}/);
  });

  it('its colours are the token values, not invented ones', () => {
    // A manifest is JSON read by the operating system, so it cannot use var(--accent). This is the one
    // place a token value is duplicated, and it has to match.
    const tokens = readFileSync(join(APP_ROOT, 'src', 'styles', 'tokens.css'), 'utf8');
    const light = tokens.slice(tokens.indexOf(':root'), tokens.indexOf("[data-theme='dark']"));
    const value = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(light)?.[1];

    const m = manifest();
    expect(m.theme_color).toBe(value('accent'));
    expect(m.background_color).toBe(value('paper'));

    const html = readFileSync(join(APP_ROOT, 'index.html'), 'utf8');
    expect(html).toContain(`content="${value('accent')}"`);
  });

  it('claims no icons it does not have', () => {
    // An icon is a brand asset. A manifest pointing at a file that is not there is worse than one that
    // says nothing, and a placeholder glyph would be invented identity — criterion 86.
    const m = manifest() as unknown as { icons?: unknown[] };
    if (m.icons) {
      for (const icon of m.icons as { src: string }[]) {
        expect(
          existsSync(join(APP_ROOT, 'public', icon.src.replace(/^\//, ''))),
          `manifest names ${icon.src}, which does not exist`
        ).toBe(true);
      }
    }
  });
});

describe('C-FIELD — the field entry excludes the tower, graph and Gantt chunks', () => {
  it('every route is its own chunk, so the entry carries no screen at all', () => {
    const entry = build().get(entryKey())!;
    // The entry is App, the shells' selector, auth, the Supabase client and the primitives — nothing
    // that renders a screen.
    for (const m of entry.modules) {
      expect(m, `${m} is in the entry chunk`).not.toMatch(/^src\/features\//);
      expect(m, `${m} is in the entry chunk`).not.toMatch(/^src\/shared\/ui\/(composite|layout)\//);
    }
    // And the screens are reached lazily.
    expect(entry.dynamicImports.length, 'nothing is lazily loaded').toBeGreaterThan(10);
  });

  it('the field entry contains none of the heavy layer', () => {
    const bundle = fieldBundle();
    const present = modulesIn(bundle);

    const leaks = FORBIDDEN_IN_FIELD.filter((f) => present.has(f.module)).map(
      (f) => `${f.what} (${f.module})`
    );
    expect(leaks, `the field entry downloads:\n  ${leaks.join('\n  ')}`).toEqual([]);
  });

  it('and it excludes them by BOUNDARY, not because they are missing from the build', () => {
    // The positive control. Without it, deleting the control tower would make the test above pass.
    const everywhere = new Set([...build().values()].flatMap((c) => c.modules));
    for (const f of FORBIDDEN_IN_FIELD) {
      if (f.inProductionBuild === false) continue;
      expect(everywhere.has(f.module), `${f.module} is not in the build at all`).toBe(true);
    }
  });

  /**
   * REWRITTEN BY C4, NOT DELETED. This used to assert `HourRail` was ABSENT from the production build —
   * a real finding this suite made on its own: C2 built the rail, only the DEV gallery rendered it, and
   * once the gallery left the production build Rollup dropped it. The test said so out loud and
   * predicted that C4 would make it fail.
   *
   * C4 landed. So the claim inverts: the rail is in the production build, it is there because the batch
   * page renders it, and it is STILL out of the field entry. That last clause is the one that matters —
   * a rail that arrived in the build by leaking into the operator's bundle would satisfy a naive
   * "is it present" check.
   */
  it('HourRail is in the production build now C4 landed, and still out of the field entry', () => {
    const rail = 'src/shared/ui/composite/HourRail.tsx';
    const everywhere = new Set([...build().values()].flatMap((c) => c.modules));
    expect(
      everywhere.has(rail),
      'HourRail left the production build again — the batch page is its only consumer'
    ).toBe(true);

    // Its consumer is the batch page, not the gallery. If this were still gallery-only it would drop
    // out of the production build the moment the dev block stopped being emitted.
    expect(src('features', 'admin', 'pages', 'BatchPage.tsx')).toMatch(/HourRail/);

    // AND IT IS NOT IN THE FIELD ENTRY. The operator never downloads the rail.
    expect(modulesIn(fieldBundle()).has(rail), 'the field entry downloads the hour rail').toBe(false);

    expect(existsSync(join(APP_ROOT, rail)), 'the rail was deleted rather than wired up').toBe(true);
  });

  // The Control Tower was retired to src/legacy (14 Sep 2026); the batch page is now the management
  // screen that carries the heavy layer, so it is the positive control.
  it('the management batch page DOES contain the heavy layer, so the two really differ', () => {
    const mgmt = initialBundle([
      entryKey(),
      chunkOf('src/shared/ui/layout/AppShell.tsx').key,
      chunkOf('src/features/admin/pages/BatchPage.tsx').key,
    ]);
    const present = modulesIn(mgmt);
    for (const m of [
      'src/shared/ui/composite/HourRail.tsx',
      'src/shared/ui/layout/AppShell.tsx',
    ]) {
      expect(present.has(m), `${m} is not in the management entry either`).toBe(true);
    }
  });

  it('the field entry is smaller than the management entry — a real reduction, not a nominal one', () => {
    const field = bytesIn(fieldBundle());
    const mgmt = bytesIn(
      initialBundle([
        entryKey(),
        chunkOf('src/shared/ui/layout/AppShell.tsx').key,
        chunkOf('src/features/admin/pages/BatchPage.tsx').key,
        chunkOf('src/features/admin/pages/ProcessExplorer.tsx').key,
      ])
    );
    expect(field).toBeLessThan(mgmt);
    // Reported so the report carries measured numbers rather than adjectives.
    console.info(
      `\n  field entry ${(field / 1024).toFixed(1)} kB · management entry ${(mgmt / 1024).toFixed(1)} kB\n`
    );
  });

  it('the field shell is in the field entry and the management shell is not', () => {
    const present = modulesIn(fieldBundle());
    expect(present.has('src/shared/ui/layout/FieldShell.tsx')).toBe(true);
    expect(present.has('src/shared/ui/layout/AppShell.tsx')).toBe(false);
  });

  it('the gallery leaves the production build entirely', () => {
    // Its route was already DEV-gated, but the `lazy()` call sat at module scope where nothing removed
    // it, so a Gallery chunk of its own was emitted — carrying the staircase, the rail and api/tower.
    const everywhere = new Set([...build().values()].flatMap((c) => c.modules));
    expect(everywhere.has('src/legacy/dev/Gallery.tsx')).toBe(false);
    expect(
      [...build().values()].filter((c) => /Gallery/i.test(c.file)).map((c) => c.file)
    ).toEqual([]);
  });

  it('no field chunk reaches the management shell, by any path', () => {
    // The reason `PageHeading` was moved out of `AppShell.tsx`: ten routes import it, `MyWork` among
    // them, so every one of them used to pull the management shell into its chunk.
    const appShell = chunkOf('src/shared/ui/layout/AppShell.tsx').key;
    for (const module of [
      'src/features/supervisor/pages/MyWork.tsx',
      'src/features/lab/pages/LabQueue.tsx',
      'src/features/lab/pages/LabCheckpoint.tsx',
      'src/shared/ui/layout/FieldShell.tsx',
    ]) {
      const reached = initialBundle([chunkOf(module).key]);
      expect([...reached], `${module} statically reaches AppShell`).not.toContain(appShell);
    }
  });
});

/** Depth-first walk over source files, skipping node_modules and dot-directories. */
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
