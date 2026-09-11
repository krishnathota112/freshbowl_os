/**
 * B1 + B2 — the execution register, and the gate that depends on it.
 *
 * WHAT THIS FILE DEFENDS
 *   The product's opening claim: *it must be hard to retroactively make a late activity look on
 *   time.* 0034 closed the plan half of that. These are the other half:
 *
 *     · an actual that has been recorded cannot be overwritten or cleared by any path
 *     · a correction is a new record with a reason, and the original survives
 *     · an operator cannot state a timestamp at all — the server owns the clock
 *     · the Turner's T2 rest is measured from THAT PILE'S OWN T1 actual end, and is enforced
 *
 *   The last one is why the first three had to come first. A gate built on a timestamp anyone
 *   could restate is not a gate.
 *
 * The eight hours are read from `docs/01-process/schedule.json` via the database, never typed.
 * Every test rolls back.
 */

import { describe, expect, it } from 'vitest';

import {
  DB_URL,
  NO_DB_REASON,
  actAs,
  all,
  createActiveBatchOn,
  one,
  refuses,
  withRollback,
  type Db,
} from './db';

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

const CODE = 'PROCESS-2026C';

/** One activity of a live 2026C batch, by code. */
async function activity(db: Db, batch: string, code: string) {
  return one<{
    id: string;
    title: string;
    state: string;
    actual_start: Date | null;
    actual_end: Date | null;
  }>(
    db,
    `select id, title, state::text as state, actual_start, actual_end
       from batch_activity where master_batch_id = $1 and code = $2`,
    [batch, code]
  );
}

describeDb('an actual, once recorded, is history', () => {
  it('a first recording is normal execution and is allowed', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);
      const a = await activity(db, batch, 'FIB-WET-1');

      await db.query(`update batch_activity set actual_start = now() - interval '3 hours' where id = $1`, [a.id]);
      const after = await activity(db, batch, 'FIB-WET-1');
      expect(after.actual_start).not.toBeNull();

      // And nothing was logged as a correction, because nothing was corrected.
      const corrections = await all(
        db,
        `select 1 from actual_correction where batch_activity_id = $1`,
        [a.id]
      );
      expect(corrections).toEqual([]);
    });
  });

  it('overwriting a recorded actual is refused, and the refusal names the path that is allowed', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);
      const a = await activity(db, batch, 'FIB-WET-1');
      await db.query(`update batch_activity set actual_end = now() - interval '2 hours' where id = $1`, [a.id]);

      const message = await refuses(
        db,
        `update batch_activity set actual_end = now() where id = $1`,
        [a.id]
      );
      expect(message).toMatch(/correct_actual/);
      expect(message, 'the refusal names the activity').toContain(a.title);

      // Unchanged.
      const after = await activity(db, batch, 'FIB-WET-1');
      expect(after.actual_end!.getTime()).toBeLessThan(Date.now());
    });
  });

  it('clearing a recorded actual is refused — there is no un-happen', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);
      const a = await activity(db, batch, 'FIB-WET-1');
      await db.query(`update batch_activity set actual_end = now() - interval '2 hours' where id = $1`, [a.id]);

      const message = await refuses(
        db,
        `update batch_activity set actual_end = null where id = $1`,
        [a.id]
      );
      expect(message).toMatch(/cannot become unknown/i);
    });
  });

  it('a correction keeps the original, names who made it and why', async () => {
    await withRollback(async (db: Db) => {
      // ⚠ AN H0 IN THE PAST, DELIBERATELY.
      //
      // The default fixture starts a batch on 2026-09-20, which is ahead of the clock, and
      // `correct_actual` refuses any value before H0 — "nothing in a batch happens before H0".
      // That refusal is right; a batch whose clock has not started has no actuals to correct.
      // The incoherence it exposes — `activate_batch` does not require H0 to have passed — is
      // pre-existing and registered as TBD-52 in submit_activity. Not resolved here.
      const batch = await createActiveBatchOn(db, CODE, {
        startAt: '2026-09-01T05:00:00Z',
        startDate: '2026-09-01',
      });
      const a = await activity(db, batch, 'FIB-WET-1');
      await db.query(
        `update batch_activity set actual_start = now() - interval '6 hours',
                                   actual_end   = now() - interval '2 hours' where id = $1`,
        [a.id]
      );
      const original = (await activity(db, batch, 'FIB-WET-1')).actual_end!;

      await actAs(db, 'supervisor');
      await db.query(
        `select public.correct_actual($1, 'actual_end', now() - interval '1 hour',
                  'Operator finished at 14:00 but the tablet had no signal until 15:00')`,
        [a.id]
      );

      const corr = await one<{
        field: string;
        previous_value: Date;
        new_value: Date;
        reason: string;
        corrected_role: string;
      }>(
        db,
        `select field, previous_value, new_value, reason, corrected_role::text as corrected_role
           from actual_correction where batch_activity_id = $1`,
        [a.id]
      );
      expect(corr.field).toBe('actual_end');
      expect(corr.previous_value.getTime(), 'the original survives').toBe(original.getTime());
      expect(corr.new_value.getTime()).toBeGreaterThan(original.getTime());
      expect(corr.corrected_role).toBe('supervisor');
      expect(corr.reason).toMatch(/no signal/);

      // And the batch story can say that this finish time is not the one first recorded.
      const hist = await one<{ has_been_corrected: boolean; first_recorded_end: Date }>(
        db,
        `select has_been_corrected, first_recorded_end from v_actual_history where activity_id = $1`,
        [a.id]
      );
      expect(hist.has_been_corrected).toBe(true);
      expect(hist.first_recorded_end.getTime()).toBe(original.getTime());
    });
  });

  it('the correction log is itself append-only', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE, {
        startAt: '2026-09-01T05:00:00Z',
        startDate: '2026-09-01',
      });
      const a = await activity(db, batch, 'FIB-WET-1');
      await db.query(`update batch_activity set actual_end = now() - interval '3 hours' where id = $1`, [a.id]);
      await actAs(db, 'supervisor');
      await db.query(
        `select public.correct_actual($1, 'actual_end', now() - interval '1 hour',
                  'A reason long enough to satisfy the ten-character rule')`,
        [a.id]
      );

      const message = await refuses(
        db,
        `delete from actual_correction where batch_activity_id = $1`,
        [a.id]
      );
      expect(message).toMatch(/append-only/i);
    });
  });

  it('an operator cannot correct an actual, and cannot state one', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);
      const a = await activity(db, batch, 'FIB-WET-1');
      await db.query(`update batch_activity set actual_end = now() - interval '3 hours' where id = $1`, [a.id]);

      await actAs(db, 'operator');

      // ⚠ `correct_actual`'s ROLE refusal is NOT asserted here, and the reason matters.
      //
      // 0058 exempts a BYPASSRLS session from `assert_role`, because these suites connect as
      // `postgres` and every fixture in the repository would otherwise be refused. That exemption
      // makes an assert_role-based refusal VACUOUS over `pg`: the guard is skipped before the role
      // is ever consulted, so a passing assertion here would prove nothing.
      //
      // `tests/roleEnforcement.test.ts` asserts it over HTTP with a real operator token, which is
      // the only place the claim can honestly be made — the same argument `tests/evidence.test.ts`
      // makes: "an authorisation proof made as a superuser proves nothing about authorisation".
      //
      // The refusal below IS asserted here, because 0050 wrote it as a direct
      // `current_app_role() = 'operator'` test rather than through assert_role, so it fires for
      // anyone carrying the claim regardless of how they connected.
      const stating = await refuses(
        db,
        `select * from public.submit_activity($1, '{}'::jsonb, null, now() - interval '5 hours', null)`,
        [a.id]
      );
      expect(stating).toMatch(/may not state a start or end time/i);
      expect(stating, 'the refusal names the path that is theirs').toMatch(/complete_activity/);
    });
  });

  it('a correction with a thin reason is refused', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);
      const a = await activity(db, batch, 'FIB-WET-1');
      await db.query(`update batch_activity set actual_end = now() - interval '3 hours' where id = $1`, [a.id]);
      await actAs(db, 'supervisor');

      const message = await refuses(
        db,
        `select public.correct_actual($1, 'actual_end', now(), 'typo')`,
        [a.id]
      );
      expect(message).toMatch(/at least ten characters/i);
    });
  });

  it('complete_activity has no timestamp to pass', async () => {
    await withRollback(async (db: Db) => {
      const args = await one<{ args: string }>(
        db,
        `select pg_get_function_arguments(p.oid) as args
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'complete_activity'`
      );
      // The shape IS the guarantee. A client cannot express a stated time through this call.
      expect(args.args).not.toMatch(/timestamp/i);
      expect(args.args).not.toMatch(/actual/i);
    });
  });
});

describeDb('the Turner rests eight hours after its own T1', () => {
  /**
   * Drive one pile's T1 to completion with a chosen finish time.
   *
   * Written directly rather than through `complete_activity`, because the thing under test is the
   * GATE, and walking twenty predecessors to reach T1 would make a failure anywhere in the chain
   * read as a failure of the rest rule. Setting an actual that is currently null is the normal
   * append-only path — no correction is involved and none is logged.
   */
  async function finishT1(db: Db, batch: string, pile: number, hoursAgo: number) {
    await db.query(
      `update batch_activity
          set state = 'COMPLETED',
              actual_start = now() - make_interval(hours => $3::int + 2),
              actual_end   = now() - make_interval(hours => $3::int)
        where master_batch_id = $1 and code = $2`,
      [batch, `TRN-P${pile}-T1`, hoursAgo]
    );
  }

  async function t2Verdict(db: Db, batch: string, pile: number) {
    const a = await activity(db, batch, `TRN-P${pile}-T2`);
    return one<{ verdict: string; reason: string }>(
      db,
      `select verdict, reason from public.evaluate_gates($1, 'entry') where kind = 'PREDECESSOR'`,
      [a.id]
    );
  }

  it('the rest is data, not a number in a function body', async () => {
    await withRollback(async (db: Db) => {
      const rules = await all<{ activity_code: string; waits_for: string; min_rest_hr: string }>(
        db,
        `select activity_code, waits_for, min_rest_hr from v_gate_rest_rule
          where process_code = $1 order by activity_code`,
        [CODE]
      );
      expect(rules.length, 'one per pile').toBe(6);
      for (const r of rules) {
        // Each pile waits on ITS OWN T1 — not on all six, and not on T0.
        expect(r.waits_for).toBe(r.activity_code.replace('-T2', '-T1'));
      }

      const body = await one<{ body: string }>(
        db,
        `select pg_get_functiondef(p.oid) as body
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'evaluate_gates'`
      );
      // The rule reads the hours from config. A literal 8 in the engine would be a factory value
      // living in code, and would be wrong for every other process version.
      expect(body.body).toMatch(/min_rest_hr/);
      // And the rejected reading must not exist anywhere in it.
      expect(body.body, 'T2 is not T0 start + 24 h — F10').not.toMatch(/24\s*\*\s*3600|hours\s*=>\s*24/);
    });
  });

  it('T2 is BLOCKED while its own T1 finished less than the rest ago', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);
      await finishT1(db, batch, 1, 2); // two hours ago; the rest is eight

      const v = await t2Verdict(db, batch, 1);
      expect(v.verdict).toBe('fail');
      // A refusal must name what to do instead — here, how much longer.
      expect(v.reason).toMatch(/still to go/);
      expect(v.reason).toMatch(/rests 8 h/);
    });
  });

  it('T2 is ELIGIBLE once the rest has elapsed', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);
      await finishT1(db, batch, 1, 9); // nine hours ago; the rest is eight

      const v = await t2Verdict(db, batch, 1);
      expect(v.verdict).toBe('pass');
    });
  });

  it('the rest is per pile — one pile resting does not hold another back', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);
      await finishT1(db, batch, 1, 9); // pile 1 has rested
      await finishT1(db, batch, 4, 1); // pile 4 has not

      expect((await t2Verdict(db, batch, 1)).verdict).toBe('pass');
      expect((await t2Verdict(db, batch, 4)).verdict).toBe('fail');

      // "Pile 1 at T2 while pile 4 is at T0 and pile 6 is waiting is a valid factory state."
      const untouched = await t2Verdict(db, batch, 6);
      expect(untouched.verdict).toBe('fail');
    });
  });

  it('a completed T1 with no recorded finish does not open the gate', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);
      // COMPLETED, but nobody recorded when. Treating an unknown end as "long enough ago" is how
      // a rest gets skipped by a data gap rather than by a decision.
      await db.query(
        `update batch_activity set state = 'COMPLETED'
          where master_batch_id = $1 and code = 'TRN-P1-T1'`,
        [batch]
      );

      const v = await t2Verdict(db, batch, 1);
      expect(v.verdict).toBe('fail');
      // 0062 reworded this refusal. What must hold is unchanged and is asserted more fully than
      // the old exact-phrase match: it names the missing finish time, AND it names what to do
      // about it. A refusal that does not say what to do next is how a gate gets worked around.
      expect(v.reason).toMatch(/no finish time/i);
      expect(v.reason).toMatch(/record the finish/i);
      // And it must not claim a finish that never happened.
      expect(v.reason).not.toMatch(/not recorded h/i);
    });
  });

  it('the gate cannot be opened by restating T1s finish time', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);
      await finishT1(db, batch, 1, 2);
      expect((await t2Verdict(db, batch, 1)).verdict).toBe('fail');

      // The whole reason B1 came before B2. Moving the finish nine hours back would open the gate,
      // and the table refuses it.
      const t1 = await activity(db, batch, 'TRN-P1-T1');
      const message = await refuses(
        db,
        `update batch_activity set actual_end = now() - interval '9 hours' where id = $1`,
        [t1.id]
      );
      expect(message).toMatch(/correct_actual/);

      expect((await t2Verdict(db, batch, 1)).verdict).toBe('fail');
    });
  });
});
