/**
 * P5 — S12, the lab technician's screen. `UI_IMPLEMENTATION_PLAN §S12`, `0022_lab.sql`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE ASSERTION THAT EARNS THIS FILE
 *
 * The retest reasons the screen offers are checked AGAINST THE DATABASE ENUM, not against a copy
 * of it. The first draft of `LabQueue` passed a hard-coded `'operator_request'`, which is not a
 * member of `lab_retest_reason` — every retest would have been rejected at the type boundary, in
 * front of a technician, with a Postgres error for a message.
 *
 * A list of options that drifts from the enum it represents is either an option nobody can record
 * or an option that fails on save. Both are found by comparing the two sets, and by nothing else.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DB_URL, NO_DB_REASON, REPO_ROOT, all, withRollback } from './db';

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

const read = (...p: string[]) => readFileSync(join(REPO_ROOT, 'mushroomos', 'src', ...p), 'utf8');
const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const screen = () => codeOf(read('routes', 'LabQueue.tsx'));
const api = () => codeOf(read('api', 'lab.ts'));

describe('P5 — the screen is a screen, not a placeholder', () => {
  it('no longer renders Pending', () => {
    // The placeholder said "Samples appear here when an activity submission generates them ·
    // Step 8". True when written, false the moment there were 35 actionable lab activities —
    // the third stale-placeholder defect in this product.
    const src = screen();
    expect(src).not.toMatch(/from '\.\/Pending'/);
    expect(src).not.toMatch(/<Pending/);
    expect(src).toMatch(/loadLabQueue/);
  });

  it('the api module stays below the route and imports no component', () => {
    expect(api()).not.toMatch(/from '\.\.\/components/);
  });
});

describe('P5 — the two decisions pushed back onto a person', () => {
  it('no checkpoint is preselected, and the button refuses until one is chosen', () => {
    // C-33 is open. Auto-selecting resolves it in code, silently, which rule 1 forbids.
    const src = screen();
    expect(src).toMatch(/useState<string \| null>\(null\)/);
    expect(src).toMatch(/chosen === null \|\| take\.isPending/);
    expect(src).toMatch(/Choose a checkpoint first/);
    // Both maps must reach the screen — the loader must not filter to one of them.
    expect(api()).not.toMatch(/eq\('checkpoint_map'/);
  });

  it('an unmapped checkpoint warns BEFORE the reading is taken', () => {
    const src = screen();
    expect(src).toMatch(/c\.specCheckpointCode === null/);
    expect(src).toMatch(/TBD-36/);
  });

  it('the verdict is reported, never computed on the client', () => {
    const src = screen();
    expect(src).toMatch(/r\.verdict/);
    expect(src).toMatch(/no spec to judge it against/);
    // A client-side pass/fail against the band would be a second authority.
    expect(src).not.toMatch(/valueNumeric\s*[<>]=?\s*r\.(targetMin|targetMax)/);
  });
});

describe('P5 — what it refuses to invent', () => {
  it('there is no overdue band, and the absence is on screen', () => {
    const src = screen();
    expect(src).toMatch(/There is no/);
    expect(src).toMatch(/overdueUnknownReason/);
    // Inventing one would mean inventing a turnaround time no source states.
    expect(src).not.toMatch(/'overdue'/);
  });

  it('a retest is offered, an edit is not', () => {
    const src = screen();
    expect(src).toMatch(/orderRetest/);
    expect(src).toMatch(/Order a retest/);
    // `record_lab_result` refuses a second result on a test; there must be no UI that pretends
    // otherwise. LAB_MODEL §5 — v1 is never hidden.
    expect(src).not.toMatch(/update\('lab_result'/);
    expect(src).toMatch(/Superseded/);
  });

  it('pending tests are scoped to one sample', () => {
    // Filtering only on state returns every outstanding test in the factory, and the screen would
    // offer a technician readings belonging to a different batch — which `record_lab_result`
    // accepts, because the test id is all it checks.
    expect(api()).toMatch(/eq\('sample_id', sampleId\)/);
  });
});

describeDb('P5 — the options match the database, not a copy of it', () => {
  it('every retest reason offered is a member of lab_retest_reason, and none is missing', async () => {
    await withRollback(async (db) => {
      const rows = await all<{ label: string }>(
        db,
        `select e.enumlabel as label
           from pg_enum e join pg_type t on t.oid = e.enumtypid
          where t.typname = 'lab_retest_reason'
          order by e.enumsortorder`
      );
      const inDb = new Set(rows.map((r) => r.label));
      expect(inDb.size, 'lab_retest_reason has no members — is 0022 applied?').toBeGreaterThan(0);

      const offered = new Set(
        [...screen().matchAll(/value: '([a-z_]+)'/g)].map((m) => m[1])
      );

      for (const v of offered) {
        expect(inDb.has(v), `the screen offers "${v}", which is not a lab_retest_reason`).toBe(true);
      }
      for (const v of inDb) {
        expect(offered.has(v), `lab_retest_reason has "${v}" and no one can select it`).toBe(true);
      }
    });
  }, 30_000);

  it('the queue view exposes every column the screen reads', async () => {
    await withRollback(async (db) => {
      const cols = await all<{ column_name: string }>(
        db,
        `select column_name from information_schema.columns where table_name = 'v_lab_queue'`
      );
      const have = new Set(cols.map((c) => c.column_name));
      for (const c of [
        'master_batch_id', 'batch_code', 'batch_label', 'current_day', 'activity_id',
        'activity_title', 'scope_label', 'parameters', 'state', 'action_required', 'band',
        'overdue_unknown_reason', 'samples', 'results',
      ]) {
        expect(have.has(c), `v_lab_queue has no ${c}`).toBe(true);
      }
    });
  }, 30_000);

  it('both checkpoint maps are populated, so the choice is a real choice', async () => {
    await withRollback(async (db) => {
      const maps = await all<{ checkpoint_map: string; n: string }>(
        db,
        `select checkpoint_map, count(*)::text n from lab_checkpoint group by 1`
      );
      expect(maps.length, 'C-33 carries TWO maps; a screen offering one is a resolved conflict').toBe(2);
      for (const m of maps) expect(Number(m.n)).toBeGreaterThan(0);
    });
  }, 30_000);
});
