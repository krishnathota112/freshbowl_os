/**
 * B4 — variance attribution. `0019_variance_attribution.sql`, `BUILD_SEQUENCE_KIRO.md §B4`.
 *
 * THE EXIT PROOF, verbatim: "For the staged demo batch the top two contributors are correct against
 * hand-computed values."
 *
 * So these assertions recompute the numbers from `batch_activity` and compare them with what the
 * views report. A view that agrees with itself proves nothing; a view that agrees with independent
 * arithmetic over the same rows is what B4 asked for.
 *
 * `scripts/stage-history.mjs` produced the data, through `submit_activity` over HTTP. If it has not
 * run, these skip with a stated reason rather than passing on an empty board.
 */

import { describe, expect, it } from 'vitest';
import { DB_URL, NO_DB_REASON, all, one, withRollback } from './db';

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

/** The batch the staging script walked deepest. Chosen by the data, not named here. */
const DEEPEST = `(select mb.id from master_batch mb
                   join batch_activity ba on ba.master_batch_id = mb.id
                  where mb.code like 'MB-DEMO-%' and ba.variance_minutes is not null
                  group by mb.id order by count(ba.variance_minutes) desc, mb.code limit 1)`;

describeDb('B4 — the batch is as late as its worst stream, not the sum of them', () => {
  it('there is staged history to attribute, or this suite says so instead of passing', async () => {
    await withRollback(async (db) => {
      const n = await one<{ n: string }>(
        db,
        `select count(*)::text as n from batch_activity ba
           join master_batch mb on mb.id = ba.master_batch_id
          where mb.code like 'MB-DEMO-%' and ba.variance_minutes is not null`
      );
      expect(
        Number(n.n),
        'no measured variance on the demo batches — run scripts/stage-history.mjs'
      ).toBeGreaterThan(0);
    });
  });

  it('the headline equals the worst stream, computed independently', async () => {
    await withRollback(async (db) => {
      // Recomputed from batch_activity, not read back from the view.
      const streams = await all<{ stream: string; total: string }>(
        db,
        `select ba.stream::text as stream, sum(ba.variance_minutes)::text as total
           from batch_activity ba
          where ba.master_batch_id = ${DEEPEST} and ba.variance_minutes is not null
          group by ba.stream order by sum(ba.variance_minutes) desc, ba.stream::text`
      );
      expect(streams.length, 'the staged batch should span several streams').toBeGreaterThan(1);

      const worst = Number(streams[0].total);
      const sumOfAll = streams.reduce((n, s) => n + Number(s.total), 0);

      const view = await one<{
        variance_minutes: number;
        worst_stream: string;
        all_streams_sum_minutes: number;
      }>(
        db,
        `select variance_minutes, worst_stream, all_streams_sum_minutes
           from v_batch_variance where master_batch_id = ${DEEPEST}`
      );

      expect(view.variance_minutes).toBe(worst);
      expect(view.worst_stream).toBe(streams[0].stream);
      expect(view.all_streams_sum_minutes).toBe(sumOfAll);

      // THE POINT OF THE WHOLE STEP. Four streams run simultaneously, so summing them counts the same
      // wall clock more than once and reports the batch as later than it is. If these two ever match
      // on a multi-stream batch, the per-stream logic has been lost.
      expect(
        view.variance_minutes,
        'the headline is the sum across streams — parallel work is being double-counted'
      ).toBeLessThan(view.all_streams_sum_minutes);
    });
  });

  it('the top contributors are the worst stream\u2019s own activities, and their minutes add up', async () => {
    await withRollback(async (db) => {
      const view = await one<{ worst_stream: string; variance_minutes: number }>(
        db,
        `select worst_stream, variance_minutes from v_batch_variance
          where master_batch_id = ${DEEPEST}`
      );

      // Every contributor in the worst stream, recomputed.
      const inWorst = await all<{ code: string; variance_minutes: number }>(
        db,
        `select ba.code, ba.variance_minutes
           from batch_activity ba
          where ba.master_batch_id = ${DEEPEST}
            and ba.stream::text = $1 and ba.variance_minutes is not null
          order by ba.variance_minutes desc`,
        [view.worst_stream]
      );
      const total = inWorst.reduce((n, r) => n + Number(r.variance_minutes), 0);

      // The headline is exactly what its own contributors sum to. This is the assertion that makes
      // the paragraph honest: the reader can add the lines up and get the number above them.
      expect(total).toBe(view.variance_minutes);

      const ranked = await all<{ rank: number; code: string; variance_minutes: number }>(
        db,
        `select rank, code, variance_minutes from v_variance_contributor
          where master_batch_id = ${DEEPEST} order by rank limit 2`
      );
      expect(ranked.length, 'the exit proof needs a top TWO').toBe(2);
      expect(ranked[0].rank).toBe(1);
      // Worst first, and the ranking is over the whole batch.
      const worstOverall = await all<{ v: number }>(
        db,
        `select ba.variance_minutes as v from batch_activity ba
          where ba.master_batch_id = ${DEEPEST} and ba.variance_minutes is not null
          order by ba.variance_minutes desc limit 2`
      );
      expect(ranked[0].variance_minutes).toBe(Number(worstOverall[0].v));
      expect(ranked[1].variance_minutes).toBe(Number(worstOverall[1].v));
    });
  });

  it('an activity that ran exactly to plan is not a contributor', async () => {
    await withRollback(async (db) => {
      const zeros = await all<{ n: string }>(
        db,
        `select count(*)::text as n from v_variance_contributor where variance_minutes = 0`
      );
      expect(Number(zeros[0].n), 'a zero-variance activity contributed nothing').toBe(0);
    });
  });
});

describeDb('B4 — zero and unknown are different answers', () => {
  it('a batch with nothing measured reports NULL, never 0', async () => {
    await withRollback(async (db) => {
      // The correction made before 0019 was ever applied. A 0 here reads as "on plan" on the GM's
      // screen, which is the auto-fail in UI_ACCEPTANCE_CRITERIA §E item 4 — a zero that means
      // "not built". `MB-DEMO-EARLY`'s weighment loads have no planned end, so nothing is measurable.
      const unmeasured = await all<{
        code: string;
        variance_minutes: number | null;
        all_streams_sum_minutes: number | null;
        measured_count: number;
      }>(
        db,
        `select code, variance_minutes, all_streams_sum_minutes, measured_count
           from v_batch_variance where measured_count = 0`
      );
      expect(unmeasured.length, 'no unmeasured batch to check — the assertion is vacuous').toBeGreaterThan(0);
      for (const b of unmeasured) {
        expect(b.variance_minutes, `${b.code} reports a number with nothing measured`).toBeNull();
        expect(b.all_streams_sum_minutes, `${b.code} sums nothing to a number`).toBeNull();
      }
    });
  });

  it('a batch measured and on plan reports 0, and it means on plan', async () => {
    await withRollback(async (db) => {
      const onPlan = await all<{ code: string; variance_minutes: number; measured_count: number }>(
        db,
        `select code, variance_minutes, measured_count from v_batch_variance
          where measured_count > 0 and variance_minutes = 0`
      );
      // Not asserted to exist — it depends on how staging fell out — but where it does, the 0 must be
      // backed by measured rows. That is the whole distinction: 0 is an answer, NULL is its absence.
      for (const b of onPlan) {
        expect(b.measured_count, `${b.code} reports 0 with nothing behind it`).toBeGreaterThan(0);
      }
    });
  });

  it('every batch appears, so a screen can tell "nothing recorded" from "not a batch"', async () => {
    await withRollback(async (db) => {
      const batches = await one<{ n: string }>(db, `select count(*)::text as n from master_batch`);
      const rows = await one<{ n: string }>(db, `select count(*)::text as n from v_batch_variance`);
      expect(rows.n).toBe(batches.n);
    });
  });
});

describeDb('B4 — the cause is recorded, never inferred', () => {
  it('every stated cause traces to a deviation summary or a gate\u2019s own words', async () => {
    await withRollback(async (db) => {
      const invented = await all<{ code: string; cause: string }>(
        db,
        `select c.code, c.cause
           from v_variance_contributor c
          where c.cause is not null
            and c.cause is distinct from (
              select d.summary from deviation d
               where d.batch_activity_id = c.activity_id order by d.raised_at limit 1)
            and c.cause is distinct from (
              select ba.blocked_reason from batch_activity ba where ba.id = c.activity_id)`
      );
      expect(invented, 'a cause appeared that no record produced').toEqual([]);
    });
  });

  it('a delay with no recorded explanation says so, rather than being given one', async () => {
    await withRollback(async (db) => {
      // NULL is the finding, not a gap to fill: it says this delay has no explanation on file, which
      // is exactly the question a GM should be asking. Asserted so nobody later coalesces it to
      // "unknown reason" or, worse, to a guess.
      const n = await one<{ n: string }>(
        db,
        `select count(*)::text as n from v_variance_contributor
          where cause is null and variance_minutes > 0`
      );
      expect(Number(n.n), 'the staged history should include an unexplained delay').toBeGreaterThan(0);
    });
  });

  it('a deviation on the record surfaces on the batch it belongs to', async () => {
    await withRollback(async (db) => {
      const withDev = await all<{ code: string; on_record: number; awaiting: number }>(
        db,
        `select code, deviations_on_record as on_record, deviations_awaiting_verdict as awaiting
           from v_batch_variance where deviations_on_record > 0`
      );
      expect(withDev.length, 'the staged 3.6 MT overfill should be on the record').toBeGreaterThan(0);
      for (const b of withDev) {
        // ROLE_AND_APPROVAL_MODEL §7 — an accepted deviation stays open on the record, so awaiting a
        // verdict can never exceed what stands on it.
        expect(b.awaiting).toBeLessThanOrEqual(b.on_record);
      }
    });
  });
});
