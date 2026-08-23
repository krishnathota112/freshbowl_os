/**
 * P0 — the Admin UI can create a VALID batch.  Migration `0023_batch_h0_default.sql`.
 *
 * THE DEFECT THIS CLOSES
 *
 * `TIME_CONTRACT §1.1` makes `master_batch.start_at` mandatory and `validate_batch` reports
 * `H0_NOT_SET` as BLOCKING — but `src/api/batches.ts::createBatch` never passed `p_start_at`, so
 * it defaulted to NULL on every call. Every batch created through the Admin screen was
 * unactivatable by construction. Every batch that exists today was made by a script passing the
 * parameter directly, which is why 324 green tests never caught it: nothing exercised the path a
 * person would actually take.
 *
 * So these proofs call the RPC with **exactly the argument list the UI sends** — seven parameters,
 * no `p_start_at` — rather than the eight-parameter form the test harness uses everywhere else.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DAY0_STRUCTURE,
  DB_URL,
  NO_DB_REASON,
  REPO_ROOT,
  all,
  defaultRoleBindings,
  one,
  refuses,
  withRollback,
  type Db,
} from './db';

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

const read = (...p: string[]) => readFileSync(join(REPO_ROOT, 'mushroomos', 'src', ...p), 'utf8');
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** The Day-0 answers, with every rest set so only H0 can be the blocker. */
async function day0Config(db: Db) {
  const gates = await all<{ code: string }>(
    db,
    `select pa.code from process_activity pa
       join process_definition pd on pd.id = pa.process_definition_id
      where pd.code = 'PROCESS-2026B' and pa.is_time_gate`
  );
  const cfg: Record<string, number> = { ...DAY0_STRUCTURE };
  for (const g of gates) cfg[`rest_hr_${g.code}`] = 0;
  return cfg;
}

/** Exactly what `createBatch` sends: SEVEN arguments. No p_start_at. */
async function createTheWayTheUiDoes(db: Db, startDate = '2026-06-15') {
  const cfg = await day0Config(db);
  const roles = await defaultRoleBindings(db);
  const row = await one<{ id: string }>(
    db,
    `select public.create_master_batch($1,$2,$3,$4,$5,$6,$7) as id`,
    [
      `P0-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      'created the way the UI creates',
      startDate,
      JSON.stringify(cfg),
      JSON.stringify(roles),
      'Ramarao',
      'Clear',
    ]
  );
  return row.id;
}

describeDb('P0 · a batch created the way the UI creates it has an H0', () => {
  it(
    'start_at is populated without the client passing one',
    async () => {
      await withRollback(async (db) => {
        const batch = await createTheWayTheUiDoes(db);
        const m = await one<{ start_at: string | null }>(
          db,
          `select start_at::text from master_batch where id = $1`,
          [batch]
        );
        expect(m.start_at, 'the UI call path still produces a NULL H0').not.toBeNull();
      });
    },
    60_000
  );

  it(
    'H0 lands at the factory hour, in the FACTORY timezone — not the caller session zone',
    async () => {
      await withRollback(async (db) => {
        // A zone deliberately unlike the factory's, standing in for a browser or CI runner
        // somewhere else. If the instant were composed client-side this is what would break it.
        await db.query(`set local timezone = 'UTC'`);

        const clock = await one<{ h: number; m: number; tz: string }>(
          db,
          `select h0_hour_of_day h, h0_minute_of_hour m, timezone tz from factory_clock where id = 1`
        );
        const batch = await createTheWayTheUiDoes(db, '2026-06-15');

        const shown = await one<{ local_time: string; local_day: string }>(
          db,
          `select to_char(start_at at time zone $2, 'HH24:MI') as local_time,
                  to_char(start_at at time zone $2, 'YYYY-MM-DD') as local_day
             from master_batch where id = $1`,
          [batch, clock.tz]
        );
        expect(shown.local_time).toBe(
          `${String(clock.h).padStart(2, '0')}:${String(clock.m).padStart(2, '0')}`
        );
        expect(shown.local_day).toBe('2026-06-15');
      });
    },
    60_000
  );

  it(
    'H0_NOT_SET no longer blocks activation',
    async () => {
      await withRollback(async (db) => {
        const batch = await createTheWayTheUiDoes(db);
        const blocking = await all<{ code: string }>(
          db,
          `select code from validate_batch($1) where severity = 'blocking'`,
          [batch]
        );
        expect(blocking.map((b) => b.code)).not.toContain('H0_NOT_SET');
      });
    },
    60_000
  );

  it(
    'with no factory timezone the creation is REFUSED, not silently given a null H0',
    async () => {
      await withRollback(async (db) => {
        // The original bug was a silent NULL. Failing loudly is the whole point: a batch that
        // cannot have a valid H0 must not come into existence looking fine.
        await db.query(`update factory_clock set timezone = null where id = 1`);
        const cfg = await day0Config(db);
        const roles = await defaultRoleBindings(db);
        const msg = await refuses(
          db,
          `select public.create_master_batch('P0-NOTZ','no zone','2026-06-15',$1::jsonb,$2::jsonb,'R','C')`,
          [JSON.stringify(cfg), JSON.stringify(roles)]
        );
        expect(msg).toMatch(/timezone is not set/i);
        expect(msg, 'the message must name the one call that fixes it').toMatch(
          /set_factory_timezone/
        );
      });
    },
    60_000
  );

  it(
    'an explicitly supplied H0 still wins over the factory default',
    async () => {
      await withRollback(async (db) => {
        const cfg = await day0Config(db);
        const roles = await defaultRoleBindings(db);
        const stated = '2026-06-15T02:15:00Z';
        const row = await one<{ id: string }>(
          db,
          `select public.create_master_batch('P0-EXPL','explicit','2026-06-15',
                    $1::jsonb,$2::jsonb,'R','C',$3::timestamptz) as id`,
          [JSON.stringify(cfg), JSON.stringify(roles), stated]
        );
        const m = await one<{ at: string }>(
          db,
          `select start_at::text at from master_batch where id = $1`,
          [row.id]
        );
        expect(Date.parse(m.at)).toBe(Date.parse(stated));
      });
    },
    60_000
  );
});

describe('P0 · the screen shows the H0 rather than letting it happen invisibly', () => {
  it('step 0 renders the factory hour and its timezone', () => {
    const src = codeOf(read('routes', 'NewBatch.tsx'));
    expect(src).toMatch(/getFactoryClock/);
    expect(src).toMatch(/label="Day 0 starts at"/);
    expect(src).toMatch(/clock\.data\.h0HourOfDay/);
    expect(src).toMatch(/clock\.data\.timezone/);
  });

  it('the wizard cannot advance while the factory clock has no timezone', () => {
    // The server refuses; the screen must not offer an action the server will reject.
    const src = codeOf(read('routes', 'NewBatch.tsx'));
    expect(src).toMatch(/Boolean\(clock\.data\?\.timezone\)/);
  });

  it('the instant is NOT composed in the browser', () => {
    const src = codeOf(read('routes', 'NewBatch.tsx'));
    // `new Date(`${date}T${time}`)` composes in the BROWSER's zone. The factory is +05:30, so an
    // admin anywhere else would silently shift the whole baseline.
    expect(src).not.toMatch(/new Date\(\s*`\$\{startDate\}/);
    expect(src).not.toMatch(/toISOString\(\)[\s\S]{0,40}startAt/);
  });
});
