/**
 * F1 · The batch baseline is immutable after activation.
 *
 * The claim under test is the load-bearing one in the whole product: a variance number means
 * nothing if the plan it is measured against can be moved afterwards. So these proofs are not
 * "the RPC refuses" — they are "the DATABASE refuses, whoever asks, by whatever route, and the
 * stored plan is byte-for-byte what it was before the attempt".
 *
 * Every refusal is checked with `refuses()`, which rolls back to a savepoint and hands back the
 * message, so each proof also gets to assert that nothing was written and that the wording is one
 * a human can act on.
 *
 * Roles are worn by setting `request.jwt.claims`, which is how `current_app_role()` reads them.
 * These run as `postgres`, so RLS does not apply to the connection; the RLS-dependent half of the
 * story is proved separately in `roleResolution.test.ts` under `set local role authenticated`.
 * What is proved here is the part that must hold even for a caller RLS would have let through.
 */

import { describe, expect, it } from 'vitest';
import { actAs, createActiveBatch, createDraftBatch, databaseUrl, NO_DB_REASON, all, one, refuses, withRollback } from './db';
import type { Db } from './db';

const HAS_DB = databaseUrl() !== null;
const suite = HAS_DB ? describe : describe.skip;
if (!HAS_DB) console.warn(`baselineImmutability: skipped — ${NO_DB_REASON}`);

type PlanRow = {
  id: string;
  planned_start_at: string | null;
  planned_end_at: string | null;
  baseline_start_hour: number | null;
  baseline_end_hour: number | null;
  planned_time: string | null;
  day0_duration_hr: string | null;
};

/** The whole Plan register of a batch, ordered, so two snapshots compare exactly. */
async function planOf(db: Db, batch: string): Promise<PlanRow[]> {
  return all<PlanRow>(
    db,
    `select id, planned_start_at, planned_end_at, baseline_start_hour, baseline_end_hour,
            planned_time, day0_duration_hr
       from batch_activity where master_batch_id = $1 order by rel_day, seq, instance_no`,
    [batch]
  );
}

async function wearRole(db: Db, role: string | null, sub?: string) {
  const claims = role === null ? '' : JSON.stringify({ sub, app_metadata: { app_role: role } });
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
}

/** One activity of the batch that actually carries a plan, so a move would be visible. */
async function anyPlannedActivity(db: Db, batch: string) {
  return one<{ id: string; planned_start_at: string | null }>(
    db,
    `select id, planned_start_at from batch_activity
      where master_batch_id = $1 order by rel_day, seq limit 1`,
    [batch]
  );
}

suite('F1 · the baseline is frozen at activation', () => {
  it('a DRAFT batch can still be repointed — the freeze is not just "no writes ever"', async () => {
    await withRollback(async (db) => {
      const batch = await createDraftBatch(db, { startAt: '2026-09-20T06:00:00+05:30' });

      const moved = await one<{ n: number }>(
        db,
        `select public.repoint_batch_activities($1) as n`,
        [batch]
      );
      expect(Number(moved.n)).toBeGreaterThan(0);

      // And moving H0 in draft really does move the plan, so the next proof is meaningful.
      const before = await anyPlannedActivity(db, batch);
      // 0058 · setting H0 is admin-or-GM. The claim here is that a DRAFT still moves, not who may
      // move it, so it wears the entitled role.
      await actAs(db, 'admin');
      await db.query(`select public.set_batch_start_at($1, $2)`, [
        batch,
        '2026-09-21T06:00:00+05:30',
      ]);
      const after = await anyPlannedActivity(db, batch);
      expect(after.planned_start_at).not.toEqual(before.planned_start_at);
    });
  });

  it('an ACTIVATED batch refuses the repoint, and the plan is unchanged', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      const before = await planOf(db, batch);
      expect(before.length).toBeGreaterThan(0);

      const message = await refuses(db, `select public.repoint_batch_activities($1)`, [batch]);
      expect(message).toMatch(/baseline is frozen/i);

      expect(await planOf(db, batch)).toEqual(before);
    });
  });

  it.each([
    ['operator', '9dc49f5e-a4d4-4915-a305-bffb3f7e582f'],
    ['supervisor', '10927fc3-4464-424c-9986-3f7a41c7d0fd'],
    ['manager', '3b5b618b-1b87-42a6-bfa9-f9d6965b6487'],
    ['gm', '9efebce7-fe34-499d-a8d5-222c19da1cb9'],
    ['admin', '8c21e85b-f65c-47c4-8b9f-bdb239e1c52d'],
  ])('a %s cannot move the plan of an activated batch', async (role, sub) => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      const before = await planOf(db, batch);
      const activity = await anyPlannedActivity(db, batch);
      await wearRole(db, role, sub);

      // Every route to the five columns, one after another.
      //
      // ⚠ EITHER REFUSAL COUNTS, AND THE REASON IS NOT A WEAKENING.
      //
      // 0058 gave `set_activity_plan`, `set_batch_start_at` and `generate_activity_plan` role
      // guards, and a guard runs before the freeze. So an OPERATOR is now stopped one step earlier
      // — "requires role admin or gm" rather than "the baseline is frozen". Both mean the plan did
      // not move, which is the claim; insisting on the freeze wording would be asserting WHICH of
      // two locks held rather than that the door stayed shut.
      //
      // The freeze itself is not left unproved: the admin case below demands it by name, and the
      // admin is the role that may otherwise plan freely. If the freeze ever stopped working, that
      // is the case that goes red.
      for (const [sql, values] of [
        [`select public.repoint_batch_activities($1)`, [batch]],
        [`select public.repoint_one_activity($1)`, [activity.id]],
        [`select public.set_activity_plan($1, '{"planned_time":"04:00"}'::jsonb)`, [activity.id]],
        [`select public.clear_planned_time($1)`, [activity.id]],
        [`select public.set_batch_start_at($1, '2026-10-01T06:00:00+05:30')`, [batch]],
        [`select public.generate_activity_plan($1)`, [batch]],
      ] as const) {
        const message = await refuses(db, sql, [...values]);
        expect(message, `${role} · ${String(sql).slice(0, 60)}`).toMatch(
          /frozen|cannot be regenerated|requires role/i
        );
      }

      // THE FREEZE, BY NAME, for the role that is otherwise entitled to move a plan. An admin
      // passes every role guard on that list, so any refusal they get is the baseline's own.
      if (role === 'admin') {
        for (const [sql, values] of [
          [`select public.set_activity_plan($1, '{"planned_time":"04:00"}'::jsonb)`, [activity.id]],
          [`select public.set_batch_start_at($1, '2026-10-01T06:00:00+05:30')`, [batch]],
          [`select public.generate_activity_plan($1)`, [batch]],
        ] as const) {
          const message = await refuses(db, sql, [...values]);
          expect(message, `admin · ${String(sql).slice(0, 60)}`).toMatch(
            /frozen|cannot be regenerated/i
          );
        }
      }

      expect(await planOf(db, batch)).toEqual(before);
    });
  });

  it('a direct UPDATE of the plan columns is refused by the table itself', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      const before = await planOf(db, batch);
      const activity = await anyPlannedActivity(db, batch);

      // No RPC involved, and running as the table owner. This is the layer that holds against
      // code nobody has written yet.
      for (const column of [
        `planned_start_at = planned_start_at + interval '3 hours'`,
        `planned_end_at = planned_end_at + interval '3 hours'`,
        `baseline_start_hour = coalesce(baseline_start_hour, 0) + 3`,
        `baseline_end_hour = coalesce(baseline_end_hour, 0) + 3`,
        `planned_time = '23:15'`,
        `day0_duration_hr = 99`,
      ]) {
        const message = await refuses(
          db,
          `update batch_activity set ${column} where id = $1`,
          [activity.id]
        );
        expect(message).toMatch(/baseline of .* is frozen/i);
      }

      expect(await planOf(db, batch)).toEqual(before);
    });
  });

  it('recording what happened is NOT blocked by the freeze', async () => {
    await withRollback(async (db) => {
      // The freeze must be surgical. If it also stopped the Actual register being written, it
      // would have broken the product in order to protect it.
      const batch = await createActiveBatch(db);
      const activity = await anyPlannedActivity(db, batch);

      await db.query(
        `update batch_activity set actual_start = now(), actual_recorded_at = now() where id = $1`,
        [activity.id]
      );
      const row = await one<{ actual_start: string | null }>(
        db,
        `select actual_start from batch_activity where id = $1`,
        [activity.id]
      );
      expect(row.actual_start).not.toBeNull();
    });
  });

  it('a batch cannot be walked back to draft to unfreeze it', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);

      const message = await refuses(
        db,
        `update master_batch set status = 'draft' where id = $1`,
        [batch]
      );
      expect(message).toMatch(/one-way|cannot return to draft/i);

      const row = await one<{ status: string }>(
        db,
        `select status::text from master_batch where id = $1`,
        [batch]
      );
      expect(row.status).toBe('active');
    });
  });

  it('H0 cannot be moved after activation — it anchors every planned instant', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      const before = await one<{ start_at: string }>(
        db,
        `select start_at from master_batch where id = $1`,
        [batch]
      );

      const message = await refuses(
        db,
        `update master_batch set start_at = start_at + interval '1 day' where id = $1`,
        [batch]
      );
      expect(message).toMatch(/H0 of .* is frozen/i);

      const after = await one<{ start_at: string }>(
        db,
        `select start_at from master_batch where id = $1`,
        [batch]
      );
      expect(after.start_at).toEqual(before.start_at);
    });
  });

  it('no client role holds EXECUTE on the plan writers', async () => {
    await withRollback(async (db) => {
      const rows = await all<{ proname: string; grantee: string }>(
        db,
        `select p.proname, r.rolname as grantee
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
           join pg_roles r on r.oid = a.grantee
          where n.nspname = 'public'
            and p.proname in ('repoint_batch_activities','repoint_one_activity')
            and a.privilege_type = 'EXECUTE'
            and r.rolname in ('anon','authenticated')`
      );
      expect(rows).toEqual([]);
    });
  });

  it('no client role holds EXECUTE on the draft editors as anon', async () => {
    await withRollback(async (db) => {
      const rows = await all<{ proname: string }>(
        db,
        `select distinct p.proname
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
           join pg_roles r on r.oid = a.grantee
          where n.nspname = 'public'
            and p.proname in ('set_activity_plan','clear_planned_time',
                              'generate_activity_plan','set_batch_start_at')
            and a.privilege_type = 'EXECUTE'
            and r.rolname = 'anon'`
      );
      expect(rows).toEqual([]);
    });
  });

  it('batch_activity grants no write to any client role', async () => {
    await withRollback(async (db) => {
      // The reason there is no fourth route: the table itself was never writable by a client.
      const rows = await all<{ grantee: string; privilege_type: string }>(
        db,
        `select grantee, privilege_type from information_schema.role_table_grants
          where table_schema = 'public' and table_name = 'batch_activity'
            and grantee in ('anon','authenticated')
            and privilege_type in ('INSERT','UPDATE','DELETE')`
      );
      expect(rows).toEqual([]);
    });
  });
});
