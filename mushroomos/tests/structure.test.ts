/**
 * The source tree keeps its shape. `src/README.md` describes it; this makes the rules checkable.
 *
 *   1 · live code never imports from src/legacy/ (retired screens stay out of the app)
 *   2 · features do not import each other — shared code goes in src/shared/
 *   3 · src/domain/ has no React and no data access
 *   4 · the retired stub folders do not come back (routes/, components/, lib/, api/, theme/ at src root)
 *   5 · file names follow the convention: components PascalCase.tsx, modules camelCase.ts
 *
 * Pure file-system checks: no database, no build.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const APP_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC = join(APP_ROOT, 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const rel = (p: string) => relative(APP_ROOT, p).split(sep).join('/');
const code = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
const importsOf = (file: string) =>
  [...readFileSync(file, 'utf8').matchAll(/(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);

describe('source tree structure', () => {
  it('src/legacy is absent from src/ and quarantined in NOT_NEEDED/frontend_legacy', () => {
    expect(existsSync(join(SRC, 'legacy'))).toBe(false);
    expect(existsSync(join(APP_ROOT, '..', 'NOT_NEEDED', 'frontend_legacy'))).toBe(true);
  });

  it('live code never imports from legacy/', () => {
    const offenders = code
      .flatMap((f) => importsOf(f).filter((s) => /(^|\/)legacy\//.test(s)).map((s) => `${rel(f)} -> ${s}`));
    expect(offenders).toEqual([]);
  });

  it('a feature does not import another feature', () => {
    const offenders = code
      .filter((f) => rel(f).startsWith('src/features/'))
      .flatMap((f) => {
        const own = rel(f).split('/')[2];
        return importsOf(f)
          .filter((s) => s.startsWith('.'))
          .map((s) => rel(join(f, '..', s)))
          .filter((t) => t.startsWith('src/features/') && t.split('/')[2] !== own)
          .map((t) => `${rel(f)} -> ${t}`);
      });
    expect(offenders).toEqual([]);
  });

  it('src/domain/ is pure: no React, no Supabase, no screens', () => {
    const offenders = code
      .filter((f) => rel(f).startsWith('src/domain/') && !f.endsWith('.test.ts'))
      .flatMap((f) =>
        importsOf(f)
          .filter((s) => s === 'react' || s.startsWith('@supabase') || /\/(shared|features|app|legacy)\//.test(s))
          .map((s) => `${rel(f)} -> ${s}`)
      );
    expect(offenders).toEqual([]);
  });

  it('the retired stub folders have not come back', () => {
    for (const d of ['routes', 'components', 'lib', 'api', 'theme', 'fixtures']) {
      expect(existsSync(join(SRC, d)), `src/${d}/ was removed in the 14 Sep 2026 restructure`).toBe(false);
    }
  });

  it('file names follow the convention', () => {
    const offenders = code
      .map(rel)
      .filter((f) => !f.startsWith('src/legacy/'))
      .filter((f) => {
        const name = f.split('/').pop()!;
        if (name === 'index.tsx' || name === 'index.ts' || f === 'src/app/main.tsx') return false; // main.tsx: Vite's entry name
        if (name.endsWith('.test.ts')) return !/^[a-z][A-Za-z0-9]*\.test\.ts$/.test(name);
        if (name.endsWith('.tsx')) return !/^[A-Z][A-Za-z0-9]*\.tsx$/.test(name);
        return !/^[a-z][A-Za-z0-9]*\.ts$/.test(name);
      });
    const folders = [...new Set(code.map((f) => rel(f).split('/').slice(1, -1)).flat())].filter(
      (d) => !/^[a-z][a-z0-9-]*$/.test(d)
    );
    expect({ offenders, folders }).toEqual({ offenders: [], folders: [] });
  });
});
