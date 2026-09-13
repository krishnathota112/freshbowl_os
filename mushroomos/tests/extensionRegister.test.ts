/**
 * F2 · The extension register.
 *
 * The claim: an extension authorises an overrun WITHOUT hiding it. So the central proof is not
 * that the workflow works — it is that after a full operator → manager → GM approval, the frozen
 * plan is byte-for-byte unchanged and the original variance is still the original variance.
 *
 * Everything else here is the authorisation model the dictation asked to have verified: who may
 * request, who may approve, in what order, whether both approvals are mandatory, duration limits,
 * evidence, expiry, cancellation, multiple extensions, late requests, requests after completion,
 * audit stamps, and enforcement at the RPC rather than in a screen.
 */

import { describe, expect, it } from 'vitest';
import { createActiveBatch, databaseUrl, NO_DB_REASON, all, one, refuses, withRollback } from './db';
import type { Db } from './db';

const HAS_DB = databaseUrl() !== null;
const suite = HAS_DB ? describe : describe.skip;
if (!HAS_DB) console.warn(`extensionRegister: skipped — ${NO_DB_REASON}`);

const OPERATOR = '9dc49f5e-a4d4-4915-a305-bffb3f7e582f';
const SUPERVISOR = '10927fc3-4464-424c-9986-3f7a41c7d0fd';
const MANAGER = '3b5b618b-1b87-42a6-bfa9-f9d6965b6487';
const GM = '9efebce7-fe34-499d-a8d5-222c19da1cb9';
const ADMIN = '8c21e85b-f65c-47c4-8b9f-bdb239e1c52d';

async function wear(db: Db, sub: string) {
  // No app_role claim on purpose: this exercises the profiles fallback from 0035 at the same time,
  // which is the configuration the demo actually runs in.
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub })]);
}

/** An activity with a real planned window, so an extension has something to be measured against. */
async function activityWithPlan(db: Db, batch: string) {
  return one<{ id: string; planned_end_at: string; planned_start_at: string }>(
    db,
    `select id, planned_start_at, planned_end_at from batch_activity
      where master_batch_id = $1 and planned_end_at is not null
      order by rel_day, seq limit 1`,
    [batch]
  );
}

const planOf = (db: Db, batch: string) =>
  all(
    db,
    `select id, planned_start_at, planned_end_at, baseline_start_hour, baseline_end_hour
       from batch_activity where master_batch_id = $1 order by rel_day, seq, instance_no`,
    [batch]
  );

const expectationOf = (db: Db, activity: string) =>
  one<{
    planned_end_at: string;
    approved_extension_hr: string;
    authorised_end_at: string | null;
    actual_end: string | null;
    original_variance_minutes: number | null;
    within_authorisation: boolean | null;
  }>(db, `select * from v_activity_expectation where activity_id = $1`, [activity]);

/** Request, approve, approve. Returns the request id. */
async function fullyApprove(db: Db, activity: string, hours: number) {
  await wear(db, OPERATOR);
  const req = await one<{ id: string }>(
    db,
    `select public.request_extension($1, $2, 'Loader broke down mid-shift') as id`,
    [activity, hours]
  );
  await wear(db, MANAGER);
  await db.query(`select public.manager_decide_extension($1, true, 'Breakdown confirmed on site')`, [
    req.id,
  ]);
  await wear(db, GM);
  await db.query(`select public.gm_decide_extension($1, true, 'Approved, within the day window')`, [
    req.id,
  ]);
  return req.id;
}

suite('F2 · the extension register', () => {
  it('the whole chain runs, and the plan does not move a millisecond', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      const activity = await activityWithPlan(db, batch);
      const planBefore = await planOf(db, batch);

      const req = await fullyApprove(db, activity.id, 2);

      const row = await one<{ status: string; approved_extension_hr: string; is_effective: boolean }>(
        db,
        `select status::text, approved_extension_hr, is_effective from v_extension_request where id = $1`,
        [req]
      );
      expect(row.status).toBe('GM_APPROVED');
      expect(Number(row.approved_extension_hr)).toBe(2);
      expect(row.is_effective).toBe(true);

      // THE CENTRAL CLAIM.
      expect(await planOf(db, batch)).toEqual(planBefore);
    });
  });

  it('the four numbers stay separate — the original variance survives the approval', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      const activity = await activityWithPlan(db, batch);

      await fullyApprove(db, activity.id, 2);

      // Planned end + 1h40m. Inside the 2h that was approved, and still 100 minutes late.
      await db.query(
        `update batch_activity set actual_end = planned_end_at + interval '1 hour 40 minutes',
                                   actual_recorded_at = now()
          where id = $1`,
        [activity.id]
      );

      const e = await expectationOf(db, activity.id);
      expect(Number(e.approved_extension_hr)).toBe(2);
      expect(e.original_variance_minutes).toBe(100); // NOT zero. This is the whole point.
      expect(e.within_authorisation).toBe(true);

      // authorised_end = planned_end + 2h, and the actual sits between them.
      const gap = await one<{ auth_gap_min: string; actual_gap_min: string }>(
        db,
        `select round(extract(epoch from (authorised_end_at - planned_end_at))/60)::text as auth_gap_min,
                round(extract(epoch from (actual_end - planned_end_at))/60)::text as actual_gap_min
           from v_activity_expectation where activity_id = $1`,
        [activity.id]
      );
      expect(gap.auth_gap_min).toBe('120');
      expect(gap.actual_gap_min).toBe('100');
    });
  });

  it('an overrun BEYOND the approved extension is still reported as unauthorised', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      const activity = await activityWithPlan(db, batch);
      await fullyApprove(db, activity.id, 2);

      await db.query(
        `update batch_activity set actual_end = planned_end_at + interval '3 hours' where id = $1`,
        [activity.id]
      );

      const e = await expectationOf(db, activity.id);
      expect(e.original_variance_minutes).toBe(180);
      expect(e.within_authorisation).toBe(false);
    });
  });

  it('two approved extensions accumulate, and neither erases the first', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      const activity = await activityWithPlan(db, batch);

      await fullyApprove(db, activity.id, 2);
      await fullyApprove(db, activity.id, 1.5);

      const e = await expectationOf(db, activity.id);
      expect(Number(e.approved_extension_hr)).toBe(3.5);

      const rows = await all<{ status: string }>(
        db,
        `select status::text from extension_request where batch_activity_id = $1 order by requested_at`,
        [activity.id]
      );
      expect(rows.map((r) => r.status)).toEqual(['GM_APPROVED', 'GM_APPROVED']);
    });
  });

  describe('who may do what', () => {
    it('a manager and a GM may not REQUEST — they are approvers, not requesters', async () => {
      await withRollback(async (db) => {
        const batch = await createActiveBatch(db);
        const activity = await activityWithPlan(db, batch);

        for (const who of [MANAGER, GM, ADMIN]) {
          await wear(db, who);
          const msg = await refuses(db, `select public.request_extension($1, 1, 'because')`, [
            activity.id,
          ]);
          expect(msg).toMatch(/requires role/i);
        }

        // The supervisor and the lab technician can, because both own activities.
        await wear(db, SUPERVISOR);
        await db.query(`select public.request_extension($1, 1, 'supervisor may ask')`, [activity.id]);
      });
    });

    it('nobody but a manager may take the manager decision, and nobody but the GM the GM one', async () => {
      await withRollback(async (db) => {
        const batch = await createActiveBatch(db);
        const activity = await activityWithPlan(db, batch);
        await wear(db, OPERATOR);
        const req = await one<{ id: string }>(
          db,
          `select public.request_extension($1, 2, 'need more time') as id`,
          [activity.id]
        );

        for (const who of [OPERATOR, SUPERVISOR, GM, ADMIN]) {
          await wear(db, who);
          expect(
            await refuses(db, `select public.manager_decide_extension($1, true, 'ok')`, [req.id])
          ).toMatch(/requires role manager/i);
        }

        await wear(db, MANAGER);
        await db.query(`select public.manager_decide_extension($1, true, 'confirmed')`, [req.id]);

        for (const who of [OPERATOR, SUPERVISOR, MANAGER, ADMIN]) {
          await wear(db, who);
          expect(
            await refuses(db, `select public.gm_decide_extension($1, true, 'ok')`, [req.id])
          ).toMatch(/requires role gm/i);
        }
      });
    });

    it('the GM cannot decide before the manager while the order is strict', async () => {
      await withRollback(async (db) => {
        const batch = await createActiveBatch(db);
        const activity = await activityWithPlan(db, batch);
        await wear(db, OPERATOR);
        const req = await one<{ id: string }>(
          db,
          `select public.request_extension($1, 2, 'need more time') as id`,
          [activity.id]
        );

        await wear(db, GM);
        expect(
          await refuses(db, `select public.gm_decide_extension($1, true, 'jumping the queue')`, [
            req.id,
          ])
        ).toMatch(/the manager decides first/i);
      });
    });

    it('both approvals are mandatory by default, and the policy can make the GM optional', async () => {
      await withRollback(async (db) => {
        const batch = await createActiveBatch(db);
        const activity = await activityWithPlan(db, batch);

        // Default: a manager's yes alone does NOT authorise anything.
        await wear(db, OPERATOR);
        const req = await one<{ id: string }>(
          db,
          `select public.request_extension($1, 2, 'first') as id`,
          [activity.id]
        );
        await wear(db, MANAGER);
        await db.query(`select public.manager_decide_extension($1, true, 'yes')`, [req.id]);
        expect(Number((await expectationOf(db, activity.id)).approved_extension_hr)).toBe(0);

        // TBD-EXT-1 answered the other way: a settings change, not a migration.
        // A SECOND activity, because the first still carries a MANAGER_APPROVED request that is
        // correctly still awaiting the GM and correctly blocks another.
        const other = await one<{ id: string }>(
          db,
          `select id from batch_activity
            where master_batch_id = $1 and planned_end_at is not null and id <> $2
            order by rel_day, seq limit 1`,
          [batch, activity.id]
        );
        await db.query(`update extension_policy set gm_approval_required = false where id`);
        await wear(db, OPERATOR);
        const req2 = await one<{ id: string }>(
          db,
          `select public.request_extension($1, 1, 'second') as id`,
          [other.id]
        );
        await wear(db, MANAGER);
        await db.query(`select public.manager_decide_extension($1, true, 'yes')`, [req2.id]);
        expect(Number((await expectationOf(db, other.id)).approved_extension_hr)).toBe(1);
      });
    });
  });

  describe('the numbers only ever narrow', () => {
    it('a manager may grant less than was asked, never more', async () => {
      await withRollback(async (db) => {
        const batch = await createActiveBatch(db);
        const activity = await activityWithPlan(db, batch);
        await wear(db, OPERATOR);
        const req = await one<{ id: string }>(
          db,
          `select public.request_extension($1, 2, 'asked for two') as id`,
          [activity.id]
        );

        await wear(db, MANAGER);
        expect(
          await refuses(db, `select public.manager_decide_extension($1, true, 'generous', 5)`, [
            req.id,
          ])
        ).toMatch(/at most the 2 hours requested/i);

        await db.query(`select public.manager_decide_extension($1, true, 'one is enough', 1)`, [
          req.id,
        ]);
        await wear(db, GM);
        expect(
          await refuses(db, `select public.gm_decide_extension($1, true, 'more', 2)`, [req.id])
        ).toMatch(/at most 1 hours/i);
      });
    });

    it('a policy cap is enforced at the request', async () => {
      await withRollback(async (db) => {
        const batch = await createActiveBatch(db);
        const activity = await activityWithPlan(db, batch);
        await db.query(`update extension_policy set max_requested_hr = 4 where id`);
        await wear(db, OPERATOR);
        expect(
          await refuses(db, `select public.request_extension($1, 6, 'too much')`, [activity.id])
        ).toMatch(/may not exceed 4 hours/i);
        await db.query(`select public.request_extension($1, 4, 'exactly the cap')`, [activity.id]);
      });
    });
  });

  describe('the shape of a request', () => {
    it('a reason is mandatory, and so is a positive number of hours', async () => {
      await withRollback(async (db) => {
        const batch = await createActiveBatch(db);
        const activity = await activityWithPlan(db, batch);
        await wear(db, OPERATOR);

        expect(await refuses(db, `select public.request_extension($1, 2, '  ')`, [activity.id]))
          .toMatch(/needs a reason/i);
        expect(await refuses(db, `select public.request_extension($1, 0, 'zero')`, [activity.id]))
          .toMatch(/positive number of hours/i);
        expect(await refuses(db, `select public.request_extension($1, -3, 'negative')`, [activity.id]))
          .toMatch(/positive number of hours/i);
      });
    });

    it('evidence is optional by default and enforced when the policy says so', async () => {
      await withRollback(async (db) => {
        const batch = await createActiveBatch(db);
        const activity = await activityWithPlan(db, batch);
        await wear(db, OPERATOR);
        await db.query(`select public.request_extension($1, 1, 'no photo needed')`, [activity.id]);

        await db.query(`update extension_policy set evidence_required = true where id`);
        await db.query(`update extension_request set status = 'CANCELLED', cancelled_at = now(),
                          cancel_reason = 'clearing the slot' where batch_activity_id = $1`, [activity.id]);
        expect(
          await refuses(db, `select public.request_extension($1, 1, 'still no photo')`, [activity.id])
        ).toMatch(/requires evidence/i);
      });
    });

    it('only one request may be awaiting a decision at a time', async () => {
      await withRollback(async (db) => {
        const batch = await createActiveBatch(db);
        const activity = await activityWithPlan(db, batch);
        await wear(db, OPERATOR);
        await db.query(`select public.request_extension($1, 1, 'first')`, [activity.id]);
        expect(
          await refuses(db, `select public.request_extension($1, 1, 'second')`, [activity.id])
        ).toMatch(/already has an extension request awaiting a decision/i);
      });
    });

    it('a rejected request frees the slot for another attempt', async () => {
      await withRollback(async (db) => {
        const batch = await createActiveBatch(db);
        const activity = await activityWithPlan(db, batch);
        await wear(db, OPERATOR);
        const req = await one<{ id: string }>(
          db,
          `select public.request_extension($1, 1, 'first') as id`,
          [activity.id]
        );
        await wear(db, MANAGER);
        await db.query(`select public.manager_decide_extension($1, false, 'not justified')`, [req.id]);

        await wear(db, OPERATOR);
        await db.query(`select public.request_extension($1, 1, 'second, with a better reason')`, [
          activity.id,
        ]);

        // `now()` is frozen for the whole transaction, so both rows carry the same
        // `requested_at` and their relative order is undefined here. The claim is about WHICH
        // rows exist, not which came back first.
        const rows = await all<{ status: string }>(
          db,
          `select status::text from extension_request where batch_activity_id = $1`,
          [activity.id]
        );
        expect(rows.map((r) => r.status).sort()).toEqual(['MANAGER_REJECTED', 'REQUESTED']);
      });
    });

    it('a late request is allowed; one after completion is not', async () => {
      await withRollback(async (db) => {
        const batch = await createActiveBatch(db);
        const activity = await activityWithPlan(db, batch);

        // Late: the planned end is in the past. An operator notices they are late BECAUSE they
        // are late, so refusing this would just mean the feature went unused.
        await db.query(
          `update batch_activity set actual_start = now() - interval '5 hours' where id = $1`,
          [activity.id]
        );
        await wear(db, OPERATOR);
        const req = await one<{ id: string }>(
          db,
          `select public.request_extension($1, 2, 'running late, loader queue') as id`,
          [activity.id]
        );
        expect(req.id).toBeTruthy();

        // Finished: extending it now would be rewriting history.
        await wear(db, MANAGER);
        await db.query(`select public.manager_decide_extension($1, false, 'closing this one')`, [req.id]);
        await db.query(`update batch_activity set actual_end = now() where id = $1`, [activity.id]);
        await wear(db, OPERATOR);
        expect(
          await refuses(db, `select public.request_extension($1, 2, 'after the fact')`, [activity.id])
        ).toMatch(/already finished|rewriting history/i);
      });
    });
  });

  describe('cancellation and expiry', () => {
    it('only the requester may withdraw, and only before anyone has answered', async () => {
      await withRollback(async (db) => {
        const batch = await createActiveBatch(db);
        const activity = await activityWithPlan(db, batch);
        await wear(db, OPERATOR);
        const req = await one<{ id: string }>(
          db,
          `select public.request_extension($1, 2, 'mistake') as id`,
          [activity.id]
        );

        await wear(db, SUPERVISOR);
        expect(await refuses(db, `select public.cancel_extension($1, 'not mine')`, [req.id]))
          .toMatch(/only the requester/i);

        await wear(db, OPERATOR);
        expect(await refuses(db, `select public.cancel_extension($1, '  ')`, [req.id]))
          .toMatch(/needs a reason/i);
        await db.query(`select public.cancel_extension($1, 'raised on the wrong activity')`, [req.id]);

        const row = await one<{ status: string }>(
          db,
          `select status::text from extension_request where id = $1`,
          [req.id]
        );
        expect(row.status).toBe('CANCELLED');

        // And a decided request can no longer be withdrawn.
        const req2 = await one<{ id: string }>(
          db,
          `select public.request_extension($1, 2, 'second') as id`,
          [activity.id]
        );
        await wear(db, MANAGER);
        await db.query(`select public.manager_decide_extension($1, true, 'fine')`, [req2.id]);
        await wear(db, OPERATOR);
        expect(await refuses(db, `select public.cancel_extension($1, 'changed my mind')`, [req2.id]))
          .toMatch(/no longer be withdrawn/i);
      });
    });

    it('nothing expires while the factory has not stated a window', async () => {
      await withRollback(async (db) => {
        const batch = await createActiveBatch(db);
        const activity = await activityWithPlan(db, batch);
        const other = await one<{ id: string }>(
          db,
          `select id from batch_activity
            where master_batch_id = $1 and planned_end_at is not null and id <> $2
            order by rel_day, seq limit 1`,
          [batch, activity.id]
        );
        const otherActivity = other.id;
        await wear(db, OPERATOR);
        await db.query(`select public.request_extension($1, 2, 'waiting')`, [activity.id]);

        // TBD-EXT-7 unanswered: a request nobody decided stays visible as a request nobody decided.
        const swept = await one<{ n: string }>(db, `select public.expire_extensions()::text as n`);
        expect(swept.n).toBe('0');

        await db.query(`update extension_policy set request_expiry_hr = 4 where id`);

        // `requested_at` cannot be back-dated — the append-only trigger refuses, which is the
        // behaviour the suite proves elsewhere. So the stale request is INSERTED stale. The
        // trigger is BEFORE UPDATE; writing history is not the same as editing it.
        await db.query(
          `insert into extension_request
             (master_batch_id, batch_activity_id, requested_by, requested_by_role,
              requested_at, requested_extension_hr, requested_reason, status)
           select master_batch_id, $1, $2, 'operator', now() - interval '9 hours', 1,
                  'asked nine hours ago, nobody answered', 'REQUESTED'
             from batch_activity where id = $1`,
          [otherActivity, OPERATOR]
        );
        // The sweep is database-wide, so its COUNT includes any stale request on any other batch
        // — including open requests left on cancelled batches (FINDINGS F46). The claim is about
        // these two requests: the stale one expires, the fresh one is still a request.
        const swept2 = await one<{ n: string }>(db, `select public.expire_extensions()::text as n`);
        expect(Number(swept2.n)).toBeGreaterThanOrEqual(1);
        const mine = await all<{ batch_activity_id: string; status: string }>(
          db,
          `select batch_activity_id, status::text from extension_request
            where batch_activity_id in ($1, $2)`,
          [activity.id, otherActivity]
        );
        expect(mine.find((r) => r.batch_activity_id === otherActivity)?.status).toBe('EXPIRED');
        expect(mine.find((r) => r.batch_activity_id === activity.id)?.status).toBe('REQUESTED');
      });
    });
  });

  describe('the record cannot be edited afterwards', () => {
    it('a client cannot write the table at all', async () => {
      await withRollback(async (db) => {
        const rows = await all(
          db,
          `select grantee, privilege_type from information_schema.role_table_grants
            where table_schema = 'public' and table_name = 'extension_request'
              and grantee in ('anon','authenticated')
              and privilege_type in ('INSERT','UPDATE','DELETE')`
        );
        expect(rows).toEqual([]);
      });
    });

    it('a recorded decision cannot be changed, nor the request restated', async () => {
      await withRollback(async (db) => {
        const batch = await createActiveBatch(db);
        const activity = await activityWithPlan(db, batch);
        const req = await fullyApprove(db, activity.id, 2);

        for (const [sql, pattern] of [
          [`update extension_request set requested_extension_hr = 9 where id = $1`, /cannot be rewritten/i],
          [`update extension_request set requested_reason = 'a better story' where id = $1`, /cannot be rewritten/i],
          [`update extension_request set requested_at = now() - interval '2 days' where id = $1`, /cannot be rewritten/i],
          [`update extension_request set manager_decision = 'rejected' where id = $1`, /manager decision .* cannot be changed/i],
          [`update extension_request set gm_decision = 'rejected' where id = $1`, /GM decision .* cannot be changed/i],
        ] as const) {
          expect(await refuses(db, sql, [req])).toMatch(pattern);
        }
      });
    });

    it('every transition left an audit event naming the actor', async () => {
      await withRollback(async (db) => {
        const batch = await createActiveBatch(db);
        const activity = await activityWithPlan(db, batch);
        const req = await fullyApprove(db, activity.id, 2);

        const events = await all<{ action: string; actor_id: string | null; actor_role: string | null }>(
          db,
          `select action, actor_id::text, actor_role::text from audit_event
            where entity_table = 'extension_request' and entity_id = $1 order by occurred_at`,
          [req]
        );
        expect(events.map((e) => e.action)).toEqual([
          'request_extension',
          'manager_decide_extension',
          'gm_decide_extension',
        ]);
        // A history with no actor answers none of the questions the product exists to answer.
        for (const e of events) {
          expect(e.actor_id).not.toBeNull();
          expect(e.actor_role).not.toBeNull();
        }
      });
    });
  });

  it('the authorised window runs from the PLANNED end, not from the moment of approval', async () => {
    await withRollback(async (db) => {
      // Otherwise a late approval would quietly buy extra time: approve at 13:00 on a 12:00
      // activity and a naive implementation authorises until 15:00 instead of 14:00.
      const batch = await createActiveBatch(db);
      const activity = await activityWithPlan(db, batch);
      const req = await fullyApprove(db, activity.id, 2);

      const row = await one<{ gap_min: string }>(
        db,
        `select round(extract(epoch from (er.effective_from - ba.planned_end_at))/60)::text as gap_min
           from extension_request er join batch_activity ba on ba.id = er.batch_activity_id
          where er.id = $1`,
        [req]
      );
      expect(row.gap_min).toBe('0');
    });
  });
});
