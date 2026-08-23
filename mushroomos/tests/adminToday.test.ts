/**
 * P1 — S4, Admin Today. `UI_IMPLEMENTATION_PLAN §S4`.
 *
 * THE SCREEN THIS REPLACED rendered `Process definition`, `Activity templates`,
 * `Evidence requirements` and `Gates shipped disabled` — process-engine metadata on a factory
 * manager's home screen. Its own header admitted it was a placeholder: "in the finished product
 * this is today's schedule with start-these and these-are-running. Neither exists yet — there is
 * no schedule import and no batch." True when written, false by the time anyone read it.
 *
 * So the first assertions here are about what the screen must NOT be able to show again.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DB_URL, NO_DB_REASON, REPO_ROOT, all, one, withRollback } from './db';

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

const read = (...p: string[]) => readFileSync(join(REPO_ROOT, 'mushroomos', 'src', ...p), 'utf8');
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const screen = () => codeOf(read('routes', 'AdminToday.tsx'));
const api = () => codeOf(read('api', 'adminToday.ts'));

describe('P1 — the screen answers three questions and shows no engine metadata', () => {
  it('renders the three headings, in order', () => {
    const src = screen();
    // The heading text, not `>Heading` — JSX puts it on its own line inside the tag.
    const at = (h: string) => src.indexOf(h);
    const order = ['Starting today', 'Running', 'Needs you'].map(at);
    for (const i of order) expect(i).toBeGreaterThan(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('cannot render the counts it used to', () => {
    const src = screen();
    for (const banned of [
      'Process definition',
      'Activity templates',
      'Evidence requirements',
      'Gates shipped disabled',
    ]) {
      expect(src, `"${banned}" is engine metadata and belongs on /admin/reference`).not.toContain(
        banned
      );
    }
    // And it must not reach for the tables those counts came from.
    for (const table of ['process_definition', 'gate_rule', 'v_sop_limit_mapping']) {
      expect(api(), `${table} is not today's business`).not.toContain(table);
    }
  });

  it('shows the finding, not the finding code', () => {
    // `validate_batch` already writes a sentence naming the activity and what is wrong with it.
    // Rendering `NO_ASSIGNEE` instead would be the same mistake this screen was rewritten to fix.
    const src = screen();
    expect(src).toMatch(/\{b\.message\}/);
    expect(src).not.toMatch(/\{b\.code\}[\s\S]{0,40}Needs you/);
  });
});

describe('P1 — today is the FACTORY\'s day, and the date logic has one implementation', () => {
  it('reuses factoryDate rather than computing a date inline', () => {
    const src = screen();
    expect(src).toMatch(/import \{ factoryDate \}/);
    expect(src).toMatch(/factoryDate\(Date\.now\(\), clock\.data\.timezone\)/);
    // A second date implementation is how the two drift apart — and `factoryDate` is the one that
    // already had the September-became-January bug found and fixed in it.
    expect(src).not.toMatch(/toISOString\(\)\.slice\(0, ?10\)/);
  });

  it('the api module does not import a component to get the date', () => {
    // `UI_COMPONENT_ARCHITECTURE §1` — an api module importing a component inverts the layering.
    // The route computes today and passes it in.
    expect(api()).not.toMatch(/from '\.\.\/components/);
    expect(api()).toMatch(/factoryToday/);
  });

  it('refuses to guess when the factory clock has no timezone', () => {
    const src = screen();
    expect(src).toMatch(/factory clock has no timezone/i);
    expect(src).toMatch(/enabled: Boolean\(today\)/);
  });
});

describe('P1 — null is not zero', () => {
  it('a batch with no recorded position says so instead of claiming Day 0', () => {
    const src = screen();
    expect(src).toMatch(/b\.nowHour === null \? \([\s\S]{0,120}not started yet/);
    // Rendering `Day 0 · H0` for a batch nothing has happened on would be a claim about progress.
    expect(api()).toMatch(/nowHour === null \? null : batchDay\(nowHour\)/);
  });

  it('an overdue draft is shown, not filtered out', () => {
    // A batch that should have begun yesterday is MORE urgent, not less.
    expect(api()).toMatch(/b\.start_date <= factoryToday/);
    expect(api()).toMatch(/overdue: b\.start_date < factoryToday/);
    expect(screen()).toMatch(/b\.overdue/);
  });
});

describeDb('P1 — the bands read real rows', () => {
  it('validate_batch is the authority for "needs you"', async () => {
    await withRollback(async (db) => {
      // The screen must agree with what activation will actually say, so it asks the same
      // function `activate_batch` consults rather than deriving its own opinion.
      expect(api()).toMatch(/rpc\('validate_batch'/);

      const drafts = await all<{ id: string }>(
        db,
        `select id from master_batch where status = 'draft' limit 1`
      );
      if (drafts.length === 0) return;
      const rows = await all<{ severity: string; message: string }>(
        db,
        `select severity, message from validate_batch($1)`,
        [drafts[0].id]
      );
      for (const r of rows.filter((x) => x.severity === 'blocking')) {
        // Every blocking finding must be a sentence a person can act on, not a bare code.
        expect(r.message.length).toBeGreaterThan(12);
      }
    });
  }, 30_000);

  it('a running batch has an hour position to render', async () => {
    await withRollback(async (db) => {
      const active = await one<{ n: number }>(
        db,
        `select count(*)::int n from master_batch where status = 'active' and start_at is not null`
      );
      // Every active batch has an H0 since 0011; without one the screen would show "not started"
      // for a batch that plainly has.
      expect(Number(active.n)).toBeGreaterThan(0);
    });
  }, 30_000);
});
