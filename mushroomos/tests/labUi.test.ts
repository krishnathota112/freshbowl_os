/**
 * P5 / UI-001 — the Lab workstation. `docs/05-ui/WORKSTATIONS.md` §3, `0022_lab.sql`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE ASSERTION THAT EARNS THIS FILE
 *
 * The retest reasons the screen offers are checked AGAINST THE DATABASE ENUM, not against a copy
 * of it. The first draft of `LabQueue` passed a hard-coded `'operator_request'`, which is not a
 * member of `lab_retest_reason` — every retest would have been rejected at the type boundary, in
 * front of a technician, with a Postgres error for a message.
 *
 * UI-001 (12 Sep) split the screen in two: `LabQueue` (what to sample next) and `LabCheckpoint`
 * (one checkpoint, sample to submit). The claims below are the same claims, read across both.
 *
 * ONE CLAIM CHANGED, deliberately: the checkpoint. Every PROCESS-2026C lab activity is bound to
 * exactly one checkpoint, and since `0072`/`0076` `open_lab_sample` refuses a checkpoint the
 * activity is not bound to within its map. So the screen uses the single bound checkpoint, and the
 * person chooses only when there are several or none. What must still never happen is a checkpoint
 * silently picked from the whole catalogue — that is what is asserted now.
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

const queue = () => codeOf(read('routes', 'LabQueue.tsx'));
const checkpoint = () => codeOf(read('routes', 'LabCheckpoint.tsx'));
const screens = () => queue() + '\n' + checkpoint();
const api = () => codeOf(read('api', 'lab.ts'));

describe('P5 — the screen is a screen, not a placeholder', () => {
  it('no longer renders Pending, and reads the real queue', () => {
    const src = screens();
    expect(src).not.toMatch(/from '\.\/Pending'/);
    expect(src).not.toMatch(/<Pending/);
    expect(queue()).toMatch(/loadLabWork/);
    expect(api()).toMatch(/from\('v_lab_queue'\)/);
  });

  it('the api module stays below the route and imports no component', () => {
    expect(api()).not.toMatch(/from '\.\.\/components/);
  });
});

describe('UI-001 — the checkpoint is never chosen silently', () => {
  it('the single BOUND checkpoint is used; otherwise the person chooses and the button refuses until they do', () => {
    const src = checkpoint();
    expect(src).toMatch(/needsChoice = c\.checkpoints\.length !== 1/);
    expect(src).toMatch(/useState<string \| null>\(null\)/);
    expect(src).toMatch(/disabled=\{begin\.isPending \|\| !checkpointId\}/);
    // The bound checkpoints come from the activity's own binding, not the catalogue.
    expect(api()).toMatch(/from\('lab_checkpoint_activity'\)/);
    // Both maps must still reach the chooser when it is shown — the loader must not filter to one.
    expect(api()).not.toMatch(/eq\('checkpoint_map'/);
  });

  it('a reading with no range says so BEFORE it is taken', () => {
    const src = checkpoint();
    expect(src).toMatch(/t\.specFound/);
    expect(src).toMatch(/no range to judge against/);
  });

  it('the verdict is reported, never computed on the client', () => {
    const src = checkpoint();
    expect(src).toMatch(/r\.verdict/);
    expect(src).toMatch(/No range to judge against/);
    // A client-side pass/fail against the band would be a second authority.
    expect(src).not.toMatch(/valueNumeric\s*[<>]=?\s*r\.(targetMin|targetMax)/);
  });

  it('a lab technician is never offered a decision on a lab submission', () => {
    expect(screens()).not.toMatch(/decideLabSubmission/);
  });

  it('finishing uses complete_activity, never the backfill path', () => {
    expect(checkpoint()).toMatch(/completeActivity/);
    expect(screens()).not.toMatch(/submitActivity/);
  });
});

describe('P5 — what it refuses to invent', () => {
  it('there is no overdue band', () => {
    // No source states a lab turnaround time. The screen shows the plan's time and invents no
    // lateness (`UI-SYSTEM.md` — "Delayed" only from a server field, CT-001).
    expect(screens()).not.toMatch(/'overdue'/);
  });

  it('a retest is offered, an edit is not', () => {
    const src = checkpoint();
    expect(src).toMatch(/orderRetest/);
    expect(src).toMatch(/Measure again/);
    expect(src).not.toMatch(/update\('lab_result'/);
    // The superseded reading stays on screen — v1 is never hidden.
    expect(src).toMatch(/Measured before/);
  });

  it('pending tests are scoped to one sample', () => {
    expect(api()).toMatch(/eq\('sample_id', sampleId\)/);
  });

  it('evidence goes through the real upload-then-bind path, with the camera in the app', () => {
    const step = codeOf(read('components', 'field', 'EvidenceStep.tsx'));
    expect(step).toMatch(/captureEvidence/);
    expect(step).toMatch(/takeNativePhoto/);
    const cam = codeOf(read('lib', 'camera.ts'));
    expect(cam).toMatch(/CameraSource\.Camera/);
    expect(cam).not.toMatch(/CameraSource\.(Photos|Prompt)/);
    expect(cam).toMatch(/saveToGallery: false/);
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

      const offered = new Set([...checkpoint().matchAll(/value: '([a-z_]+)'/g)].map((m) => m[1]));

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
        'overdue_unknown_reason', 'samples', 'results', 'last_submission',
      ]) {
        expect(have.has(c), `v_lab_queue has no ${c}`).toBe(true);
      }
    });
  }, 30_000);

  it('both checkpoint maps are populated, so a choice, when offered, is a real choice', async () => {
    await withRollback(async (db) => {
      const maps = await all<{ checkpoint_map: string; n: string }>(
        db,
        `select checkpoint_map, count(*)::text n from lab_checkpoint group by 1`
      );
      expect(maps.length).toBeGreaterThanOrEqual(2);
      for (const m of maps) expect(Number(m.n)).toBeGreaterThan(0);
      const codes = maps.map((m) => m.checkpoint_map);
      expect(codes).toContain('LAB_DICTATION');
      expect(codes).toContain('S4B_COLUMNS');
    });
  }, 30_000);
});
