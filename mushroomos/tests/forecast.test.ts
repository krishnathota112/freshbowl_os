/**
 * B6 — PLAN · EXTENSION · AUTHORISED · ACTUAL · FORECAST. Five numbers, never collapsed.
 *
 * THE INVARIANT THIS FILE EXISTS FOR, stated by the product owner:
 *
 *     The extension must never rewrite the original plan.
 *
 *         PLAN       09:00 → 12:00
 *         ACTUAL     11:00 → 14:00
 *         VARIANCE   +2h
 *         EXTENSION  +2h approved
 *         FORECAST   14:00
 *
 *   Management must see all five separately. The failure this guards against is the comfortable
 *   one: an approval that quietly moves the plan, so a two-hour overrun becomes a batch that was
 *   never late — CLAUDE.md's opening sentence, in the one place it is easiest to break.
 *
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
  withRollback,
  type Db,
} from './db';

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

const CODE = 'PROCESS-2026C';
const n = (v: unknown) => Number(v);
const MIN = 60_000;

/** A batch whose clock has already started, so an actual can legitimately be recorded on it. */
const started = { startAt: '2026-09-01T05:00:00Z', startDate: '2026-09-01' };

type Expectation = {
  planned_start_at: Date | null;
  planned_end_at: Date | null;
  approved_extension_hr: string | null;
  authorised_end_at: Date | null;
  actual_start: Date | null;
  actual_end: Date | null;
  original_variance_minutes: number | null;
  within_authorisation: boolean | null;
  projected_end_at: Date | null;
  forecast_basis: string;
};

async function expectation(db: Db, activityId: string) {
  return one<Expectation>(
    db,
    `select planned_start_at, planned_end_at, approved_extension_hr, authorised_end_at,
            actual_start, actual_end, original_variance_minutes, within_authorisation,
            projected_end_at, forecast_basis
       from v_activity_forecast where activity_id = $1`,
    [activityId]
  );
}

/** An activity that has a real planned window, so a variance against it means something. */
async function plannedActivity(db: Db, batch: string) {
  return one<{ id: string; code: string; planned_start_at: Date; planned_end_at: Date }>(
    db,
    `select id, code, planned_start_at, planned_end_at
       from batch_activity
      where master_batch_id = $1 and planned_end_at is not null and not is_hold
      order by seq limit 1`,
    [batch]
  );
}

describeDb('an extension is a third number, never an edit', () => {
  it('the whole story: plan, actual, variance, extension, authorised, forecast', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE, started);
      const act = await plannedActivity(db, batch);

      // ── The work starts two hours late and is STILL RUNNING. ────────────
      //
      // ⚠ THE ORDER MATTERS, and the server taught it to me: `request_extension` refuses an
      // activity that has already finished — "extending it now would be rewriting history —
      // record a deviation instead." That guard is right, and it means the real factory sequence
      // is the one below: you ask for more time while you still need it, not afterwards.
      await db.query(
        `update batch_activity set actual_start = planned_start_at + interval '2 hours'
          where id = $1`,
        [act.id]
      );

      const before = await expectation(db, act.id);
      // Zero, not null: nothing has been approved, and the register says so as a figure.
      expect(n(before.approved_extension_hr), 'nothing authorised yet').toBe(0);
      expect(before.authorised_end_at!.getTime()).toBe(before.planned_end_at!.getTime());

      // ── Two hours are requested and approved, while the work is running. ──
      await actAs(db, 'supervisor');
      const req = await one<{ id: string }>(
        db,
        `select public.request_extension($1, 2, 'Loader unavailable; the yard crew waited on it') as id`,
        [act.id]
      );
      await actAs(db, 'manager');
      await db.query(
        `select public.manager_decide_extension($1, true, 'Wait is corroborated by the machine log')`,
        [req.id]
      );
      await actAs(db, 'gm');
      await db.query(
        `select public.gm_decide_extension($1, true, 'Authorised — the cause is on record')`,
        [req.id]
      );

      // ── And only then does the work finish, two hours past the plan. ────
      await db.query(
        `update batch_activity set actual_end = planned_end_at + interval '2 hours'
          where id = $1`,
        [act.id]
      );

      const after = await expectation(db, act.id);
      expect(after.original_variance_minutes, 'two hours late').toBe(120);

      // ── 1 · THE PLAN HAS NOT MOVED. ────────────────────────────────────
      // The single most important assertion in this file.
      expect(after.planned_start_at!.getTime(), 'the plan is frozen').toBe(
        before.planned_start_at!.getTime()
      );
      expect(after.planned_end_at!.getTime(), 'the plan is frozen').toBe(
        before.planned_end_at!.getTime()
      );

      // ── 2 · THE VARIANCE HAS NOT BEEN ERASED. ──────────────────────────
      // An approval authorises an overrun; it does not un-happen it.
      expect(
        after.original_variance_minutes,
        'an approved extension must not make a late activity read as on time'
      ).toBe(120);

      // ── 3 · The extension is its own number. ───────────────────────────
      expect(n(after.approved_extension_hr)).toBe(2);

      // ── 4 · Authorised = planned + approved, and is a FOURTH number. ───
      expect(after.authorised_end_at!.getTime()).toBe(
        after.planned_end_at!.getTime() + 120 * MIN
      );
      expect(after.within_authorisation, 'the overrun is now authorised').toBe(true);

      // ── 5 · The forecast. The work is done, so the projection IS the actual. ──
      expect(after.forecast_basis).toBe('finished');
      expect(after.projected_end_at!.getTime()).toBe(after.actual_end!.getTime());

      // All five are distinguishable, which is the requirement.
      const five = new Set([
        after.planned_end_at!.getTime(),
        after.authorised_end_at!.getTime(),
        after.actual_end!.getTime(),
      ]);
      expect(five.size, 'planned, authorised and actual must not collapse into one').toBe(2);
      // planned 12:00 · authorised 14:00 · actual 14:00 — authorised and actual coincide here
      // BECAUSE exactly the overrun was authorised. Planned is still its own number.
      expect(after.planned_end_at!.getTime()).toBeLessThan(after.authorised_end_at!.getTime());
    });
  });

  it('a rejected request authorises nothing, and says who rejected it and why', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE, started);
      const act = await plannedActivity(db, batch);
      // Running, not finished — an extension is asked for while it is still needed.
      await db.query(
        `update batch_activity set actual_start = planned_start_at + interval '2 hours'
          where id = $1`,
        [act.id]
      );

      await actAs(db, 'supervisor');
      const req = await one<{ id: string }>(
        db,
        `select public.request_extension($1, 2, 'Running over; asking for the time') as id`,
        [act.id]
      );
      await actAs(db, 'manager');
      await db.query(
        `select public.manager_decide_extension($1, false, 'No cause recorded against the delay')`,
        [req.id]
      );
      await db.query(
        `update batch_activity set actual_end = planned_end_at + interval '2 hours'
          where id = $1`,
        [act.id]
      );

      const after = await expectation(db, act.id);
      expect(n(after.approved_extension_hr), 'a rejection authorises nothing').toBe(0);
      expect(after.authorised_end_at!.getTime()).toBe(after.planned_end_at!.getTime());
      expect(after.within_authorisation).toBe(false);
      expect(after.original_variance_minutes).toBe(120);

      const row = await one<{ status: string; manager_decision: string; manager_reason: string }>(
        db,
        `select status::text, manager_decision::text, manager_reason
           from v_extension_request where id = $1`,
        [req.id]
      );
      expect(row.manager_decision).toBe('rejected');
      expect(row.manager_reason).toMatch(/no cause recorded/i);
    });
  });

  it('nothing in the extension path can write a plan column', async () => {
    await withRollback(async (db: Db) => {
      // The mechanical check, not a reading of the code: no extension function names a plan column.
      const bodies = await all<{ proname: string; body: string }>(
        db,
        `select p.proname, pg_get_functiondef(p.oid) as body
           from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
          where ns.nspname = 'public'
            and p.proname in ('request_extension','manager_decide_extension',
                              'gm_decide_extension','cancel_extension','expire_extensions')`
      );
      expect(bodies.length).toBeGreaterThan(0);
      for (const b of bodies) {
        for (const col of ['planned_start_at', 'planned_end_at', 'baseline_start_hour', 'baseline_end_hour']) {
          expect(
            b.body.includes(`set ${col}`) || b.body.includes(`${col} =`),
            `${b.proname} must not write ${col} — an extension is a third number, never an edit`
          ).toBe(false);
        }
      }
    });
  });
});

describeDb('a forecast says which arithmetic produced it', () => {
  it('a finished activity is not forecast at all — it is reported', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE, started);
      const act = await plannedActivity(db, batch);
      await db.query(
        `update batch_activity set actual_start = planned_start_at,
                                   actual_end   = planned_end_at + interval '30 minutes'
          where id = $1`,
        [act.id]
      );

      const f = await expectation(db, act.id);
      expect(f.forecast_basis).toBe('finished');
      expect(f.projected_end_at!.getTime()).toBe(f.actual_end!.getTime());
    });
  });

  it('a running activity is projected from its own real start', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE, started);
      const act = await plannedActivity(db, batch);
      await db.query(
        `update batch_activity set actual_start = planned_start_at + interval '90 minutes'
          where id = $1`,
        [act.id]
      );

      const f = await expectation(db, act.id);
      expect(f.forecast_basis).toBe('running');
      // It started 90 minutes late; project the planned duration from where it really began.
      const plannedDuration = act.planned_end_at.getTime() - act.planned_start_at.getTime();
      expect(f.projected_end_at!.getTime()).toBe(f.actual_start!.getTime() + plannedDuration);
    });
  });

  it('with nothing finished there is no forecast, and it says why rather than guessing', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE, started);
      const b = await one<{
        projected_end_at: Date | null;
        forecast_basis: string;
        forecast_unknown_reason: string | null;
        planned_end_at: Date;
      }>(
        db,
        `select projected_end_at, forecast_basis, forecast_unknown_reason, planned_end_at
           from v_batch_forecast where master_batch_id = $1`,
        [batch]
      );
      expect(b.projected_end_at).toBeNull();
      expect(b.forecast_basis).toBe('no measurement yet');
      expect(b.forecast_unknown_reason).toMatch(/no measured slip/i);
      // The PLAN is still known, because it is a fact and not a projection.
      expect(b.planned_end_at).not.toBeNull();
    });
  });

  it('the batch is measured against its OWN process standard', async () => {
    await withRollback(async (db: Db) => {
      const c = await one<{ standard_hr: string; process_code: string; h0: Date; planned_end_at: Date }>(
        db,
        `select standard_hr, process_code, h0, planned_end_at from v_batch_forecast
          where master_batch_id = $1`,
        [await createActiveBatchOn(db, CODE, started)]
      );
      expect(c.process_code).toBe(CODE);
      // H0 + this version's own calculated standard. Not a constant, and not the day grid.
      expect(c.planned_end_at.getTime()).toBe(
        c.h0.getTime() + n(c.standard_hr) * 60 * MIN
      );

      // Two versions in the same view, disagreeing about their own length — the point of 0045.
      const spread = await all<{ process_code: string; standard_hr: string }>(
        db,
        `select distinct process_code, standard_hr from v_batch_forecast where standard_hr is not null`
      );
      expect(new Set(spread.map((s) => n(s.standard_hr))).size).toBeGreaterThan(1);
    });
  });

  it('the projection never folds the approved extension into itself', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE, started);
      const act = await plannedActivity(db, batch);
      await db.query(
        `update batch_activity set actual_start = planned_start_at + interval '2 hours'
          where id = $1`,
        [act.id]
      );
      await actAs(db, 'supervisor');
      const req = await one<{ id: string }>(
        db,
        `select public.request_extension($1, 2, 'Loader unavailable; the yard crew waited') as id`,
        [act.id]
      );
      await actAs(db, 'manager');
      await db.query(`select public.manager_decide_extension($1, true, 'Corroborated')`, [req.id]);
      await actAs(db, 'gm');
      await db.query(`select public.gm_decide_extension($1, true, 'Authorised')`, [req.id]);
      await db.query(
        `update batch_activity set actual_end = planned_end_at + interval '2 hours'
          where id = $1`,
        [act.id]
      );

      const b = await one<{
        planned_end_at: Date;
        authorised_end_at: Date;
        projected_end_at: Date | null;
        slip_minutes: number | null;
        exposure_minutes: number | null;
      }>(
        db,
        `select planned_end_at, authorised_end_at, projected_end_at, slip_minutes, exposure_minutes
           from v_batch_forecast where master_batch_id = $1`,
        [batch]
      );

      // The authorised end moved. The PROJECTION did not follow it — an authorised overrun is
      // still an overrun, and folding it in is how a late batch reads as on time.
      expect(b.authorised_end_at.getTime()).toBeGreaterThan(b.planned_end_at.getTime());
      expect(b.projected_end_at!.getTime()).toBe(
        b.planned_end_at.getTime() + b.slip_minutes! * MIN
      );
      expect(b.exposure_minutes, 'exposure is the slip, not the slip minus what was forgiven')
        .toBe(b.slip_minutes);
    });
  });

  it('the forecast writes nothing — it is a view, and views cannot be a second plan', async () => {
    await withRollback(async (db: Db) => {
      const kinds = await all<{ relname: string; relkind: string }>(
        db,
        `select c.relname, c.relkind::text from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relname in ('v_activity_forecast','v_batch_forecast','v_batch_slip')`
      );
      expect(kinds.length).toBe(3);
      // 'v' — a view. A forecast that persisted would be a second plan, and DEC-002 allows one.
      for (const k of kinds) expect(k.relkind, `${k.relname}`).toBe('v');
    });
  });
});
