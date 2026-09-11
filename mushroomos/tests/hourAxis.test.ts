/**
 * A2 — the hour axis, proved against the database and against T0's frozen functions.
 *
 * THE RISK THIS FILE EXISTS FOR is not that the arithmetic is wrong — `src/domain/time.test.ts`
 * already asserts that against all 1,656 cells of the factory's grid. It is that the DATABASE's
 * derivation and the DOMAIN's derivation drift apart, and then two places disagree about what H126
 * means with nothing to notice. So every timestamp the database produces is compared against
 * `batchInstant`/`wallClock` IMPORTED from `src/domain/time.ts`. Nothing here re-implements an
 * hour function, and no expected hour, date or bound is typed in: 552 is read from the Book1
 * fixture, and everything else from the database.
 *
 * Every test runs in a transaction that is rolled back. TBD-50 is NOT answered by this file — one
 * test sets a zone inside its own transaction purely to prove the conversion machinery, and that
 * transaction is discarded.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { batchDay, batchInstant, isWithinBaseline, wallClock } from '../src/domain/time';
import {
  actAs,
  DB_URL,
  NO_DB_REASON,
  REPO_ROOT,
  all,
  createDraftBatch,
  one,
  withRollback,
  type Db,
} from './db';

// ─────────────────────────────────────────────────────────────────────────────────────────
// The fixture, again — because the baseline length must be checked against the factory's own
// grid, not against a number somebody remembered.
// ─────────────────────────────────────────────────────────────────────────────────────────

type Fixture = {
  sha256: string;
  batches: { batch: number; start_date: string; total_hours: number; hours: [number, string, number][] }[];
};

const fixture = JSON.parse(
  readFileSync(join(REPO_ROOT, 'docs', '_reference', 'source', 'book1_hour_grid.json'), 'utf8')
) as Fixture;

const FIXTURE_TOTAL_HOURS = fixture.batches[0].total_hours;
const HOURS_PER_DAY = 24;

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

describe('the fixture is still the one Book1 produced', () => {
  it('matches the recorded SHA-256 of the workbook', () => {
    const actual = createHash('sha256')
      .update(readFileSync(join(REPO_ROOT, 'mails', 'Book1.xlsx')))
      .digest('hex');
    expect(actual).toBe(fixture.sha256);
  });
});

describeDb('the baseline length is derived, not typed', () => {
  it('process_definition.baseline_hours equals the hour count in the factory grid', async () => {
    // This is the check that turns "total_days is the final day index" from an assumption into a
    // verified reading. Three things have to agree: the column, the activities, and Book1.
    await withRollback(async (db) => {
      const def = await one<{ total_days: number; baseline_days: number; baseline_hours: number; max_rel_day: number }>(
        db,
        `select pd.total_days, pd.baseline_days, pd.baseline_hours,
                (select max(rel_day) from process_activity pa
                  where pa.process_definition_id = pd.id) as max_rel_day
           from process_definition pd
          where pd.code = 'PROCESS-2026B' and pd.status = 'published'`
      );

      expect(def.baseline_hours).toBe(FIXTURE_TOTAL_HOURS);
      expect(def.baseline_days).toBe(FIXTURE_TOTAL_HOURS / HOURS_PER_DAY);
      // The final day index, so the last activity's day is reachable and nothing sits past the end.
      expect(def.max_rel_day).toBe(def.total_days);
      expect(batchDay(FIXTURE_TOTAL_HOURS)).toBe(def.total_days);
    });
  });

  it('baseline_hours and baseline_days are generated — a write is rejected', async () => {
    await withRollback(async (db) => {
      await expect(
        db.query(`update process_definition set baseline_hours = 1 where code = 'PROCESS-2026B'`)
      ).rejects.toThrow(/can only be updated to DEFAULT|generated column/i);
    });
  });

  it('every template activity sits inside the baseline', async () => {
    await withRollback(async (db) => {
      const rows = await all<{ code: string; standard_start_hour: number; standard_end_hour: number | null }>(
        db,
      // ⚠ `::float8` IN THE QUERY, because 0042 made the hour axis `numeric` so it could hold the
      // Turner's half hours — and `pg` returns numeric as a STRING, since a JS number cannot
      // represent every numeric. The domain functions correctly refuse a string, so the cast is
      // where the conversion belongs: at the read, once, rather than at every comparison.
      //
      // PostgREST is unaffected — it serialises numeric as a JSON number, so `src/` sees numbers.
      // Verified over HTTP, not assumed.
        `select pa.code, pa.standard_start_hour::float8 as standard_start_hour,
                pa.standard_end_hour::float8 as standard_end_hour
           from process_activity pa
           join process_definition pd on pd.id = pa.process_definition_id
          where pd.code = 'PROCESS-2026B'
          order by pa.seq`
      );
      expect(rows.length).toBeGreaterThan(0);

      for (const r of rows) {
        // isWithinBaseline takes the baseline as a PARAMETER — TIME_CONTRACT §1.3. The hour axis
        // is on the point scale, so H0 is a legitimate start and hour 0 is not an interval index.
        expect(r.standard_start_hour).not.toBeNull();
        if (r.standard_start_hour > 0) {
          expect(isWithinBaseline(r.standard_start_hour, FIXTURE_TOTAL_HOURS)).toBe(true);
        }
        if (r.standard_end_hour !== null) {
          expect(isWithinBaseline(r.standard_end_hour, FIXTURE_TOTAL_HOURS)).toBe(true);
        }
      }
    });
  });
});

describeDb('rel_day is derived from the hour, not the other way round', () => {
  it('rel_day = floor(standard_start_hour / 24) for every activity — TIME_CONTRACT §5', async () => {
    await withRollback(async (db) => {
      const rows = await all<{ code: string; rel_day: number; standard_start_hour: number }>(
        db,
      // ⚠ `::float8` IN THE QUERY, because 0042 made the hour axis `numeric` so it could hold the
      // Turner's half hours — and `pg` returns numeric as a STRING, since a JS number cannot
      // represent every numeric. The domain functions correctly refuse a string, so the cast is
      // where the conversion belongs: at the read, once, rather than at every comparison.
      //
      // PostgREST is unaffected — it serialises numeric as a JSON number, so `src/` sees numbers.
      // Verified over HTTP, not assumed.
        `select code, rel_day, standard_start_hour::float8 as standard_start_hour
           from process_activity
          where standard_start_hour is not null`
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        // Nothing in a batch precedes H0. This is why ROUTE-2026A carries no hours: its Day 0 is
        // mixing, and its rel_day runs from D−7, so rel_day × 24 would be negative.
        expect(r.standard_start_hour).toBeGreaterThanOrEqual(0);
        expect(Math.floor(r.standard_start_hour / HOURS_PER_DAY)).toBe(r.rel_day);
        // batchDay is 1-based on the interval scale; the first hour of batch-day n is H(24n)+1.
        expect(batchDay(r.standard_start_hour + 1)).toBe(r.rel_day);
      }
    });
  });

  it('an hour is only derived where the definition measures its days from H0', async () => {
    await withRollback(async (db) => {
      const rows = await all<{ code: string; min_rel_day: number; with_hours: string }>(
        db,
        `select pd.code, min(pa.rel_day) as min_rel_day,
                count(pa.standard_start_hour)::text as with_hours
           from process_definition pd
           join process_activity pa on pa.process_definition_id = pd.id
          group by pd.code order by pd.code`
      );
      expect(rows.length).toBeGreaterThan(1);
      for (const r of rows) {
        if (r.min_rel_day < 0) {
          // A negative day means the definition's origin is not H0. Deriving hours from it would
          // be inventing an origin, so it gets none.
          expect(Number(r.with_hours)).toBe(0);
        } else {
          expect(Number(r.with_hours)).toBeGreaterThan(0);
        }
      }
    });
  });

  it('the database refuses an hour that contradicts its rel_day', async () => {
    await withRollback(async (db) => {
      // ⚠ A DRAFT DEFINITION OF ITS OWN. 0044 freezes a PUBLISHED definition's activities,
      // and every definition in this database is published — so editing PROCESS-2026B's row
      // raised the freeze and this probe tested that instead of the CHECK constraint it
      // names. The constraint is what is under test, so it needs a row it may legally edit.
      const probeDef = await one<{ id: string }>(
        db,
        `insert into process_definition
           (code, name, version, status, source_ref, anchor_day_label, total_days)
         values ('TEST-HOURAXIS-' || substr(md5(random()::text), 1, 6), 'axis probe', 1,
                 'draft', 'tests/hourAxis', 'Day 0', 1)
         returning id`
      );
      await db.query(
        `insert into process_activity
           (process_definition_id, code, label_template, stream, rel_day, seq, scope,
            cardinality_rule, standard_start_hour, standard_hour_source, source_ref)
         values ($1, 'AXIS-PROBE', 'Probe', 'YARD', 0, 10, 'MASTER',
                 '{"kind":"SINGLETON"}', 0, 'factory_stated', 'tests/hourAxis')`,
        [probeDef.id]
      );
      // A full day's shift, so the derived rel_day genuinely changes. Adding an hour would not:
      // integer division would still land on the same day, and the constraint would rightly pass.
      //
      // Applied to an activity with no end hour, so `process_activity_hours_ordered` cannot fire
      // first and the assertion names the rule that actually caught it.
      // The probe row created above: hour 0, rel_day 0, no end hour — so
      // `process_activity_hours_ordered` cannot fire first and the assertion names the rule that
      // actually caught it.
      await expect(
        db.query(
          `update process_activity set standard_start_hour = standard_start_hour + 24
            where process_definition_id = $1`,
          [probeDef.id]
        )
      ).rejects.toThrow(/process_activity_rel_day_derived/);
    });
  });

  it('the database refuses an hour before H0', async () => {
    await withRollback(async (db) => {
      // ⚠ A DRAFT DEFINITION OF ITS OWN. 0044 freezes a PUBLISHED definition's activities,
      // and every definition in this database is published — so editing PROCESS-2026B's row
      // raised the freeze and this probe tested that instead of the CHECK constraint it
      // names. The constraint is what is under test, so it needs a row it may legally edit.
      const probeDef = await one<{ id: string }>(
        db,
        `insert into process_definition
           (code, name, version, status, source_ref, anchor_day_label, total_days)
         values ('TEST-HOURAXIS-' || substr(md5(random()::text), 1, 6), 'axis probe', 1,
                 'draft', 'tests/hourAxis', 'Day 0', 1)
         returning id`
      );
      await db.query(
        `insert into process_activity
           (process_definition_id, code, label_template, stream, rel_day, seq, scope,
            cardinality_rule, standard_start_hour, standard_hour_source, source_ref)
         values ($1, 'AXIS-PROBE', 'Probe', 'YARD', 0, 10, 'MASTER',
                 '{"kind":"SINGLETON"}', 0, 'factory_stated', 'tests/hourAxis')`,
        [probeDef.id]
      );
      await expect(
        db.query(
          `update process_activity set standard_start_hour = -24
            where process_definition_id = $1`,
          [probeDef.id]
        )
      ).rejects.toThrow(/process_activity_(hour_not_before_h0|rel_day_derived)/);
    });
  });

  it('marks every derived hour as derived, so no derivation is mistaken for a statement', async () => {
    await withRollback(async (db) => {
      const rows = await all<{ standard_hour_source: string; n: string }>(
        db,
        `select standard_hour_source, count(*)::text as n from process_activity
          where standard_start_hour is not null group by 1`
      );
      for (const r of rows) {
        expect(['factory_stated', 'derived_from_rel_day']).toContain(r.standard_hour_source);
      }
    });
  });
});

describeDb('H0 is mandatory and never defaults', () => {
  it('a batch with no H0 is BLOCKED, and the finding names the open question', async () => {
    await withRollback(async (db) => {
      // The factory zone is unresolved, so create_master_batch cannot derive an instant. That must
      // produce a blocking finding, not a midnight stand-in.
      const batch = await createDraftBatch(db);

      const row = await one<{ start_at: string | null }>(
        db,
        `select start_at from master_batch where id = $1`,
        [batch]
      );
      const clock = await one<{ timezone: string | null }>(
        db,
        `select timezone from factory_clock where id = 1`
      );

      if (clock.timezone === null) {
        expect(row.start_at).toBeNull();

        const findings = await all<{ code: string; message: string }>(
          db,
          `select code, message from validate_batch($1) where severity = 'blocking'`,
          [batch]
        );
        const h0 = findings.find((f) => f.code === 'H0_NOT_SET');
        expect(h0, 'H0_NOT_SET must be raised while H0 is unknown').toBeDefined();
        expect(h0!.message).toMatch(/TBD-50/);

        // And the batch must be unactivatable for that reason.
        await expect(db.query(`select public.activate_batch($1)`, [batch])).rejects.toThrow(
          /Cannot activate/
        );
      } else {
        // Once TBD-50 is answered the derivation must produce an instant, and no such finding.
        expect(row.start_at).not.toBeNull();
      }
    });
  });

  it('factory_clock.timezone is either unset or a real IANA name — never a guess', async () => {
    await withRollback(async (db) => {
      const clock = await one<{ timezone: string | null; timezone_conflict_id: string | null }>(
        db,
        `select timezone, timezone_conflict_id from factory_clock where id = 1`
      );
      if (clock.timezone === null) {
        expect(clock.timezone_conflict_id).toBe('TBD-50');
      } else {
        const hit = await all(db, `select 1 from pg_timezone_names where name = $1`, [
          clock.timezone,
        ]);
        expect(hit.length).toBe(1);
      }
      await expect(
        db.query(`update factory_clock set timezone = 'Factory/Somewhere' where id = 1`)
      ).rejects.toThrow(/not an IANA timezone name/);
    });
  });

  it('factory_h0_instant returns NULL rather than adopting the server zone', async () => {
    await withRollback(async (db) => {
      await db.query(`update factory_clock set timezone = null where id = 1`);
      const row = await one<{ h0: string | null }>(
        db,
        `select public.factory_h0_instant(date '2026-09-20') as h0`
      );
      expect(row.h0).toBeNull();
    });
  });
});

describeDb('the axis, once H0 is known', () => {
  /**
   * Answers TBD-50 with UTC INSIDE A ROLLED-BACK TRANSACTION, purely to exercise the conversion.
   * UTC is chosen because it is the one zone that cannot be mistaken for a claim about the factory,
   * and because `src/domain/time.test.ts` reproduces the grid in UTC for the same reason.
   */
  const withZone = <T>(fn: (db: Db) => Promise<T>) =>
    withRollback(async (db) => {
      await db.query(`update factory_clock set timezone = 'UTC' where id = 1`);
      return fn(db);
    });

  it('H0 lands on the factory hour, not on midnight', async () => {
    await withZone(async (db) => {
      const clock = await one<{ h0_hour_of_day: number }>(
        db,
        `select h0_hour_of_day from factory_clock where id = 1`
      );
      const row = await one<{ h0: Date }>(
        db,
        `select public.factory_h0_instant(date '2026-09-20') as h0`
      );
      expect(row.h0).not.toBeNull();
      expect(new Date(row.h0).getUTCHours()).toBe(clock.h0_hour_of_day);
      // The bug this replaces: (start_date + rel_day)::timestamptz, i.e. hour 0.
      expect(new Date(row.h0).getUTCHours()).not.toBe(0);
    });
  });

  it('every planned instant equals batchInstant(baseline hour, H0) from src/domain/time.ts', async () => {
    await withZone(async (db) => {
      const batch = await createDraftBatch(db, { startDate: '2026-09-20' });
      // 0058 · setting H0 is admin-or-GM. The claim is about what MOVES, not about who may
      // move it, so it wears the entitled role.
      await actAs(db, 'admin');
      const h0 = await one<{ start_at: Date }>(
        db,
        `select start_at from master_batch where id = $1`,
        [batch]
      );
      expect(h0.start_at).not.toBeNull();

      const rows = await all<{
        title: string;
        baseline_start_hour: number | null;
        planned_start_at: Date | null;
      }>(
        db,
        // ::float8 — the axis is numeric since 0042 and `pg` returns numeric as a string.
        `select title, baseline_start_hour::float8 as baseline_start_hour, planned_start_at
           from batch_activity where master_batch_id = $1 order by seq, instance_no`,
        [batch]
      );
      expect(rows.length).toBeGreaterThan(0);

      let compared = 0;
      for (const r of rows) {
        expect(r.baseline_start_hour).not.toBeNull();
        const expected = batchInstant(r.baseline_start_hour!, new Date(h0.start_at));
        expect(new Date(r.planned_start_at!).toISOString()).toBe(expected.toISOString());
        compared += 1;
      }
      expect(compared).toBe(rows.length);
    });
  });

  it('the first hour of each batch-day begins at wallClock(24n + 1)', async () => {
    await withZone(async (db) => {
      const batch = await createDraftBatch(db, { startDate: '2026-09-20' });
      const h0 = await one<{ start_at: Date }>(
        db,
        `select start_at from master_batch where id = $1`,
        [batch]
      );

      const days = await all<{ rel_day: number; planned_start_at: Date }>(
        db,
        `select distinct rel_day, min(planned_start_at) as planned_start_at
           from batch_activity where master_batch_id = $1 group by rel_day order by rel_day`,
        [batch]
      );
      expect(days.length).toBeGreaterThan(1);

      for (const d of days) {
        // TIME_CONTRACT §1.2: Book1 hour n starts at H(n-1). The first hour of batch-day n is
        // hour 24n + 1, and it starts exactly at H(24n).
        const expected = wallClock(d.rel_day * HOURS_PER_DAY + 1, new Date(h0.start_at));
        expect(new Date(d.planned_start_at).toISOString()).toBe(expected.toISOString());
        expect(batchDay(d.rel_day * HOURS_PER_DAY + 1)).toBe(d.rel_day);
      }
    });
  });

  it('changing start_at moves every planned timestamp and no rel_day', async () => {
    await withZone(async (db) => {
      const batch = await createDraftBatch(db, { startDate: '2026-09-20' });
      // 0058 · setting H0 is admin-or-GM. The claim is about what MOVES when H0 moves, not about
      // who may move it, so it wears the entitled role.
      await actAs(db, 'admin');

      const before = await all<{ id: string; rel_day: number; planned_start_at: Date }>(
        db,
        `select id, rel_day, planned_start_at from batch_activity
          where master_batch_id = $1 order by id`,
        [batch]
      );
      const shiftedH0 = new Date(
        new Date((await one<{ s: Date }>(db, `select start_at s from master_batch where id = $1`, [batch])).s).getTime() +
          48 * 3_600_000
      );

      const moved = await one<{ activities_repointed: number }>(
        db,
        `select * from public.set_batch_start_at($1, $2)`,
        [batch, shiftedH0.toISOString()]
      );
      expect(Number(moved.activities_repointed)).toBe(before.length);

      const after = await all<{ id: string; rel_day: number; planned_start_at: Date }>(
        db,
        `select id, rel_day, planned_start_at from batch_activity
          where master_batch_id = $1 order by id`,
        [batch]
      );

      expect(after.length).toBe(before.length);
      for (let i = 0; i < before.length; i += 1) {
        expect(after[i].id).toBe(before[i].id);
        // Every rel_day is untouched — it is display-only and derived from the template.
        expect(after[i].rel_day).toBe(before[i].rel_day);
        // Every instant moved by exactly the shift.
        const delta =
          new Date(after[i].planned_start_at).getTime() -
          new Date(before[i].planned_start_at).getTime();
        expect(delta).toBe(48 * 3_600_000);
      }
    });
  });

  it('H0 is frozen at activation — it cannot be moved on a running batch', async () => {
    await withZone(async (db) => {
      const batch = await createDraftBatch(db);
      await db.query(`update master_batch set status = 'active' where id = $1`, [batch]);
      // 0058 · setting H0 is admin-or-GM. The claim is about what MOVES, not about who may
      // move it, so it wears the entitled role.
      await actAs(db, 'admin');

      await expect(
        db.query(`select * from public.set_batch_start_at($1, now())`, [batch])
      ).rejects.toThrow(/H0 is frozen at activation/);
    });
  });
});

describeDb('variance is generated, never written', () => {
  it('a direct write to variance_minutes is rejected', async () => {
    await withRollback(async (db) => {
      // 0058 · setting H0 is admin-or-GM. The claim is about what MOVES, not about who may
      // move it, so it wears the entitled role.
      await actAs(db, 'admin');
      // 0058 · setting H0 is admin-or-GM. The claim is about what MOVES, not about who may
      // move it, so it wears the entitled role.
      await actAs(db, 'admin');
      const batch = await createDraftBatch(db);
      await expect(
        db.query(`update batch_activity set variance_minutes = 99 where master_batch_id = $1`, [
          batch,
        ])
      ).rejects.toThrow(/can only be updated to DEFAULT|generated column/i);
    });
  });

  it('it is null until there is both a plan and an actual end', async () => {
    await withRollback(async (db) => {
      await db.query(`update factory_clock set timezone = 'UTC' where id = 1`);
      const batch = await createDraftBatch(db);

      const before = await one<{ n: string }>(
        db,
        `select count(variance_minutes)::text as n from batch_activity where master_batch_id = $1`,
        [batch]
      );
      expect(Number(before.n)).toBe(0);

      // Ending an activity late by a known amount must show up as exactly that many minutes.
      const target = await one<{ id: string; planned_end_at: Date }>(
        db,
        `select id, planned_end_at from batch_activity
          where master_batch_id = $1 and planned_end_at is not null order by seq limit 1`,
        [batch]
      );
      const late = new Date(new Date(target.planned_end_at).getTime() + 95 * 60_000);
      await db.query(`update batch_activity set actual_end = $2 where id = $1`, [
        target.id,
        late.toISOString(),
      ]);

      const after = await one<{ variance_minutes: number }>(
        db,
        `select variance_minutes from batch_activity where id = $1`,
        [target.id]
      );
      expect(Number(after.variance_minutes)).toBe(95);
    });
  });
});

describeDb('the day headings are data', () => {
  it('process_day covers every day that has work', async () => {
    await withRollback(async (db) => {
      const missing = await all<{ rel_day: number }>(
        db,
        `select distinct pa.rel_day
           from process_activity pa
           join process_definition pd on pd.id = pa.process_definition_id
          where pd.code = 'PROCESS-2026B'
            and not exists (select 1 from process_day d
                             where d.process_definition_id = pd.id and d.rel_day = pa.rel_day)
          order by 1`
      );
      expect(missing).toEqual([]);
    });
  });

  it('a heading can be changed by editing data alone — criterion 22', async () => {
    await withRollback(async (db) => {
      await db.query(
        `update process_day set title = 'Renamed by a seed change'
          where rel_day = 0 and process_definition_id =
            (select id from process_definition where code = 'PROCESS-2026B' and version = 1)`
      );
      const row = await one<{ title: string }>(
        db,
        `select title from process_day where rel_day = 0 and process_definition_id =
           (select id from process_definition where code = 'PROCESS-2026B' and version = 1)`
      );
      expect(row.title).toBe('Renamed by a seed change');
    });
  });
});
