/**
 * Recorded-actual timestamps on `submit_activity`. `0016_recorded_actuals.sql`.
 *
 * THE GATE, verbatim:
 *   · a backdated submission stores the stated actuals AND a distinct entry timestamp
 *   · a future timestamp is refused
 *
 * WHY THIS IS NOT A DEMO AFFORDANCE. `PROCESS_V2 §2` specifies the per-load execution record with a
 * Start, an End and a Duration — eleven loads, each written on a slip at the weighbridge and typed
 * in afterwards. The truck does not wait for the phone. Until 0016 `submit_activity` wrote
 * `actual_end = now()` unconditionally, so `variance_minutes` and `duration_actual_min` — both
 * GENERATED from the actuals — were measuring the operator's typing rather than the factory's work.
 *
 * `now()` IS FROZEN FOR A TRANSACTION, and every test here runs inside one that is rolled back. That
 * is what makes these assertions exact rather than approximate: the entry clock and the stated time
 * are compared against a single instant, not against two readings of a moving one.
 */

import { describe, expect, it } from 'vitest';

import {
  DB_URL,
  NO_DB_REASON,
  all,
  createActiveBatch,
  one,
  refuses,
  satisfyEvidence,
  withRollback,
  type Db,
} from './db';

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

/**
 * A batch whose whole baseline is in the PAST, so a recorded actual is a recorded actual rather
 * than work against a batch that has not started yet.
 *
 * It also has to sit clear of the three live demo batches. `validate_batch` treats a vessel as held
 * for ±2 days around every activity start, and there are eleven bunkers against three concurrent
 * batches, so a test batch overlapping them is refused with `VESSEL_DOUBLE_BOOKED` — correctly. So
 * this ends before the earliest live batch begins, by twice that window.
 *
 * Both terms are READ: the baseline length from `process_definition`, the earliest live H0 from
 * `master_batch`. Nothing here types a day count, and it stays correct if the demo stagger moves.
 */
async function pastStartDate(db: Db): Promise<string> {
  const row = await one<{ d: string }>(
    db,
    `select (coalesce(
               (select min(mb.start_at)::date from master_batch mb where mb.status = 'active'),
               current_date)
             - (pd.baseline_days + 4))::text as d
       from process_definition pd where pd.code = 'PROCESS-2026B'`
  );
  return row.d;
}

/**
 * A running batch, and one activity on it that is READY with its evidence already satisfied — so a
 * submission exercises the timestamps rather than the evidence gate.
 */
async function readyActivity(
  db: Db
): Promise<{ id: string; title: string; planned_end_at: string | null }> {
  const batch = await createActiveBatch(db, { startDate: await pastStartDate(db) });

  const row = await one<{ id: string; title: string; planned_end_at: string | null }>(
    db,
    `select ba.id, ba.title, ba.planned_end_at::text as planned_end_at
       from batch_activity ba
      where ba.master_batch_id = $1 and ba.state = 'READY'
      order by ba.seq, ba.instance_no
      limit 1`,
    [batch]
  );

  await satisfyEvidence(db, row.id);
  return row;
}

// ─────────────────────────────────────────────────────────────────────────────────────────

describeDb('the two clocks are separate', () => {
  it('a backdated submission stores the stated actuals AND a distinct entry timestamp', async () => {
    await withRollback(async (db) => {
      const act = await readyActivity(db);

      // The slip says the work ran for a stretch that ended before the operator sat down to type
      // it. Both offsets are expressed against the server's own frozen clock, so nothing is typed.
      const stated = await one<{ started: string; ended: string; entered: string }>(
        db,
        `select (now() - interval '5 hours')::text as started,
                (now() - interval '4 hours')::text as ended,
                now()::text                        as entered`
      );

      await db.query(
        `select * from public.submit_activity($1, '{}'::jsonb, 'transcribed from the slip', $2, $3)`,
        [act.id, stated.started, stated.ended]
      );

      const row = await one<{
        state: string;
        actual_start: string;
        actual_end: string;
        actual_recorded_at: string;
        duration_actual_min: number | null;
        submitted_at: string;
      }>(
        db,
        `select state::text as state,
                actual_start::text, actual_end::text, actual_recorded_at::text,
                duration_actual_min, submitted_at::text
           from batch_activity where id = $1`,
        [act.id]
      );

      expect(row.state).toBe('COMPLETED');

      // 1 · THE STATED ACTUALS ARE WHAT WAS STORED. Not the clock.
      expect(Date.parse(row.actual_start)).toBe(Date.parse(stated.started));
      expect(Date.parse(row.actual_end)).toBe(Date.parse(stated.ended));

      // 2 · THE ENTRY TIME IS DISTINCT, and it is the server's clock rather than anything sent.
      expect(Date.parse(row.actual_recorded_at)).toBe(Date.parse(stated.entered));
      expect(row.actual_recorded_at).not.toBe(row.actual_end);
      expect(Date.parse(row.actual_recorded_at)).toBeGreaterThan(Date.parse(row.actual_end));

      // 3 · The derived numbers now measure the WORK. The span the slip states is one hour; had the
      //     old code written `actual_end = now()` the duration would have read as five.
      const minutes =
        (Date.parse(stated.ended) - Date.parse(stated.started)) / 60_000;
      expect(row.duration_actual_min).toBe(minutes);
    });
  });

  it('a live submission records both clocks as the same instant, which is what makes them comparable', async () => {
    await withRollback(async (db) => {
      // The control. Without it, "the entry time differs from the end time" would be satisfied just
      // as well by two clocks that always disagree, which would tell you nothing.
      const act = await readyActivity(db);

      await db.query(`select * from public.submit_activity($1, '{}'::jsonb, 'recorded live')`, [
        act.id,
      ]);

      const row = await one<{
        actual_end: string;
        actual_recorded_at: string;
        submitted_at: string;
        transcribed: boolean;
      }>(
        db,
        `select actual_end::text, actual_recorded_at::text, submitted_at::text,
                (actual_recorded_at > actual_end) as transcribed
           from batch_activity where id = $1`,
        [act.id]
      );

      expect(row.actual_recorded_at).toBe(row.actual_end);
      expect(row.actual_recorded_at).toBe(row.submitted_at);
      expect(row.transcribed, 'a live recording must not read as transcribed').toBe(false);
    });
  });

  it('variance is measured against when the work ended, not against when it was typed', async () => {
    await withRollback(async (db) => {
      // `variance_minutes` is GENERATED as `actual_end - planned_end_at`. This is the assertion that
      // the recorded actual reaches the derived column, which is the reason the column exists.
      const act = await readyActivity(db);
      if (act.planned_end_at === null) return; // the activity states no duration — TBD-21

      const stated = await one<{ ended: string }>(
        db,
        `select (now() - interval '3 hours')::text as ended`
      );

      await db.query(`select * from public.submit_activity($1, '{}'::jsonb, null, null, $2)`, [
        act.id,
        stated.ended,
      ]);

      const row = await one<{ variance_minutes: number | null; actual_end: string }>(
        db,
        `select variance_minutes, actual_end::text from batch_activity where id = $1`,
        [act.id]
      );

      // `::integer` in the generated expression rounds; it does not truncate.
      const expected = Math.round(
        (Date.parse(stated.ended) - Date.parse(act.planned_end_at!)) / 60_000
      );
      expect(row.variance_minutes).toBe(expected);
    });
  });
});

describeDb('the server refuses a timestamp that cannot be an actual', () => {
  it('a future start is refused, and nothing is recorded', async () => {
    await withRollback(async (db) => {
      const act = await readyActivity(db);

      const why = await refuses(
        db,
        `select * from public.submit_activity($1, '{}'::jsonb, null, (now() + interval '1 hour'))`,
        [act.id]
      );
      expect(why).toMatch(/in the future/);

      // A refusal must leave the row exactly as it was. This read is the reason `refuses` uses a
      // savepoint: after a plain error the transaction is aborted and nothing further can be asked.
      const row = await one<{ state: string; actual_start: string | null }>(
        db,
        `select state::text as state, actual_start::text from batch_activity where id = $1`,
        [act.id]
      );
      expect(row.state).toBe('READY');
      expect(row.actual_start).toBeNull();
    });
  });

  it('a future end is refused too, and the message names the activity', async () => {
    await withRollback(async (db) => {
      const act = await readyActivity(db);

      const why = await refuses(
        db,
        `select * from public.submit_activity($1, '{}'::jsonb, null, null,
                                              (now() + interval '1 minute'))`,
        [act.id]
      );
      expect(why).toMatch(/in the future/);
      // A refusal an operator cannot act on is not much better than a silent one.
      expect(why).toContain(act.title);
    });
  });

  it('there is no tolerance window — a second into the future is still the future', async () => {
    await withRollback(async (db) => {
      // A tolerance would be a number nobody stated, and the rule it would soften is the one that
      // keeps a device clock out of the record.
      const act = await readyActivity(db);

      const why = await refuses(
        db,
        `select * from public.submit_activity($1, '{}'::jsonb, null, null,
                                              (now() + interval '1 second'))`,
        [act.id]
      );
      expect(why).toMatch(/in the future/);
    });
  });

  it('an end before its start is refused', async () => {
    await withRollback(async (db) => {
      const act = await readyActivity(db);

      const why = await refuses(
        db,
        `select * from public.submit_activity($1, '{}'::jsonb, null,
                                              (now() - interval '2 hours'),
                                              (now() - interval '3 hours'))`,
        [act.id]
      );
      expect(why).toMatch(/does not end before it begins/);

      const row = await one<{ state: string; actual_end: string | null }>(
        db,
        `select state::text as state, actual_end::text from batch_activity where id = $1`,
        [act.id]
      );
      expect(row.state).toBe('READY');
      expect(row.actual_end).toBeNull();
    });
  });

  it('a stated end earlier than an already-recorded start is refused as well', async () => {
    await withRollback(async (db) => {
      // `start_activity` writes `actual_start` when the operator opens the card, so the pair being
      // validated is not always the pair in the call. Checking only the parameters would let this
      // through.
      const act = await readyActivity(db);

      await db.query(`select public.start_activity($1)`, [act.id]);
      const opened = await one<{ actual_start: string | null }>(
        db,
        `select actual_start::text from batch_activity where id = $1`,
        [act.id]
      );
      expect(opened.actual_start, 'start_activity must have recorded a start').not.toBeNull();

      const why = await refuses(
        db,
        `select * from public.submit_activity($1, '{}'::jsonb, null, null,
                                              (now() - interval '6 hours'))`,
        [act.id]
      );
      expect(why).toMatch(/does not end before it begins/);
    });
  });

  it('the impossible pair is unwritable by ANY path, not only through the RPC', async () => {
    await withRollback(async (db) => {
      // The CHECK constraint. `postgres` has BYPASSRLS and every privilege there is, and it still
      // cannot write an end before a start — which is what "the server is the authority" means when
      // the rule does not depend on the clock.
      const act = await readyActivity(db);

      const why = await refuses(
        db,
        `update batch_activity
            set actual_start = now() - interval '1 hour', actual_end = now() - interval '2 hours'
          where id = $1`,
        [act.id]
      );
      expect(why).toMatch(/batch_activity_actual_end_after_start/);
    });
  });
});

describeDb('the trail carries both clocks', () => {
  it('the audit event records what was stated and when it was typed', async () => {
    await withRollback(async (db) => {
      const act = await readyActivity(db);

      const stated = await one<{ started: string; ended: string }>(
        db,
        `select (now() - interval '9 hours')::text as started,
                (now() - interval '8 hours')::text as ended`
      );

      await db.query(
        `select * from public.submit_activity($1, '{}'::jsonb, 'slip 04', $2, $3)`,
        [act.id, stated.started, stated.ended]
      );

      const ev = await one<{
        actual_start: string;
        actual_end: string;
        recorded_at: string;
        stated_by_submitter: boolean;
        duration_actual_min: number;
      }>(
        db,
        `select after_state->>'actual_start' as actual_start,
                after_state->>'actual_end'   as actual_end,
                after_state->>'recorded_at'  as recorded_at,
                (after_state->>'stated_by_submitter')::boolean as stated_by_submitter,
                (after_state->>'duration_actual_min')::int as duration_actual_min
           from audit_event
          where entity_table = 'batch_activity' and entity_id = $1::text
            and action = 'submit_activity'
          order by id desc limit 1`,
        [act.id]
      );

      expect(Date.parse(ev.actual_end)).toBe(Date.parse(stated.ended));
      expect(Date.parse(ev.recorded_at)).toBeGreaterThan(Date.parse(ev.actual_end));
      // The flag is what lets a reader tell a transcription from a live recording without doing
      // arithmetic on two timestamps.
      expect(ev.stated_by_submitter).toBe(true);
      expect(ev.duration_actual_min).toBe(60);
    });
  });

  it('a live submission is not marked as stated by the submitter', async () => {
    await withRollback(async (db) => {
      const act = await readyActivity(db);

      await db.query(`select * from public.submit_activity($1, '{}'::jsonb, null)`, [act.id]);

      const ev = await one<{ stated_by_submitter: boolean }>(
        db,
        `select (after_state->>'stated_by_submitter')::boolean as stated_by_submitter
           from audit_event
          where entity_table = 'batch_activity' and entity_id = $1::text
            and action = 'submit_activity'
          order by id desc limit 1`,
        [act.id]
      );
      expect(ev.stated_by_submitter).toBe(false);
    });
  });
});

describeDb('nothing else about submit_activity changed', () => {
  it('the three-argument call still works, so no existing caller was broken', async () => {
    await withRollback(async (db) => {
      const act = await readyActivity(db);

      const r = await one<{ new_state: string; out_of_range: number }>(
        db,
        `select new_state, out_of_range from public.submit_activity($1, '{}'::jsonb, 'three args')`,
        [act.id]
      );
      expect(r.new_state).toBe('COMPLETED');
      expect(r.out_of_range).toBe(0);
    });
  });

  it('there is exactly ONE submit_activity — the old overload is gone', async () => {
    await withRollback(async (db) => {
      // Two overloads would make the PostgREST call ambiguous, and the older one is the version
      // that could only ever write the clock.
      const fns = await all<{ args: string }>(
        db,
        `select pg_get_function_identity_arguments(p.oid) as args
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'submit_activity'`
      );
      expect(fns.map((f) => f.args)).toEqual([
        'p_activity uuid, p_values jsonb, p_remarks text, p_actual_start timestamp with time zone, p_actual_end timestamp with time zone',
      ]);
    });
  });

  it('evidence still gates submission, and a held submission keeps what was stated', async () => {
    await withRollback(async (db) => {
      // This time WITHOUT satisfying the evidence, so the exit gate holds it.
      const batch = await createActiveBatch(db, { startDate: await pastStartDate(db) });
      const act = await one<{ id: string }>(
        db,
        `select ba.id from batch_activity ba
           join batch_activity_evidence_req r on r.batch_activity_id = ba.id
          where ba.master_batch_id = $1 and ba.state = 'READY' and r.gates_submission
          order by ba.seq, ba.instance_no limit 1`,
        [batch]
      );

      const stated = await one<{ started: string }>(
        db,
        `select (now() - interval '2 hours')::text as started`
      );

      const r = await one<{ new_state: string; outstanding_evidence: string | null }>(
        db,
        `select new_state, outstanding_evidence
           from public.submit_activity($1, '{}'::jsonb, null, $2)`,
        [act.id, stated.started]
      );
      expect(r.new_state).toBe('IN_PROGRESS');
      expect(r.outstanding_evidence).toBeTruthy();

      const row = await one<{
        actual_start: string;
        actual_end: string | null;
        actual_recorded_at: string;
      }>(
        db,
        `select actual_start::text, actual_end::text, actual_recorded_at::text
           from batch_activity where id = $1`,
        [act.id]
      );
      // The stated start survives the hold — otherwise the operator retypes it and the second
      // typing is a different number.
      expect(Date.parse(row.actual_start)).toBe(Date.parse(stated.started));
      // And no end is invented: with the submission held, an end nobody stated has not happened.
      expect(row.actual_end).toBeNull();
      expect(Date.parse(row.actual_recorded_at)).toBeGreaterThan(Date.parse(row.actual_start));
    });
  });
});
