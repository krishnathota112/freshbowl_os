/**
 * F3 · Role resolution — claim first, profiles second, nothing third.
 *
 * The five cases the fix has to survive:
 *   1 · a valid JWT role claim              -> that role
 *   2 · no claim, an active profile         -> the profile's role
 *   3 · neither                             -> NULL, and every guarded call refuses
 *   4 · a user trying to promote themselves -> refused, by RLS, at the table
 *   5 · a guarded RPC under each of the above
 *
 * Case 4 is the one that decides whether the fallback was safe to add at all, so it is proved
 * under `set local role authenticated` — as a real client, with RLS applied — rather than as
 * `postgres`, where RLS is bypassed and the proof would be worthless.
 */

import { describe, expect, it } from 'vitest';
import { databaseUrl, NO_DB_REASON, all, one, refuses, withRollback } from './db';
import type { Db } from './db';

const HAS_DB = databaseUrl() !== null;
const suite = HAS_DB ? describe : describe.skip;
if (!HAS_DB) console.warn(`roleResolution: skipped — ${NO_DB_REASON}`);

const OPERATOR = '9dc49f5e-a4d4-4915-a305-bffb3f7e582f';
const ADMIN = '8c21e85b-f65c-47c4-8b9f-bdb239e1c52d';
const SUPERVISOR = '10927fc3-4464-424c-9986-3f7a41c7d0fd';

/** Wear a JWT. `role: null` means a signed-in user whose token carries no app_role. */
async function wear(db: Db, opts: { sub?: string; role?: string | null }) {
  const claims: Record<string, unknown> = {};
  if (opts.sub) claims.sub = opts.sub;
  if (opts.role) claims.app_metadata = { app_role: opts.role };
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    Object.keys(claims).length ? JSON.stringify(claims) : '',
  ]);
}

const roleNow = (db: Db) =>
  one<{ role: string | null }>(db, `select public.current_app_role()::text as role`);

suite('F3 · role resolution', () => {
  it('case 1 — the JWT claim is the fast path', async () => {
    await withRollback(async (db) => {
      await wear(db, { sub: OPERATOR, role: 'gm' });
      expect((await roleNow(db)).role).toBe('gm');
    });
  });

  it('case 1b — the claim WINS over the profile, so production behaviour is unchanged', async () => {
    await withRollback(async (db) => {
      // The operator's profile says operator. The token says gm. The token is the fast path and
      // must win — otherwise enabling the hook would silently change how the system behaves.
      await wear(db, { sub: OPERATOR, role: 'gm' });
      expect((await roleNow(db)).role).toBe('gm');

      const profile = await one<{ role: string }>(
        db,
        `select role::text from profiles where id = $1`,
        [OPERATOR]
      );
      expect(profile.role).toBe('operator');
    });
  });

  it('case 2 — no claim, an active profile: the fallback resolves it', async () => {
    await withRollback(async (db) => {
      await wear(db, { sub: OPERATOR });
      expect((await roleNow(db)).role).toBe('operator');

      await wear(db, { sub: ADMIN });
      expect((await roleNow(db)).role).toBe('admin');
    });
  });

  it('case 2b — a deactivated profile resolves to nothing', async () => {
    await withRollback(async (db) => {
      await db.query(`update profiles set is_active = false where id = $1`, [OPERATOR]);
      await wear(db, { sub: OPERATOR });
      expect((await roleNow(db)).role).toBeNull();
    });
  });

  it('case 3 — neither claim nor profile: NULL', async () => {
    await withRollback(async (db) => {
      await wear(db, {});
      expect((await roleNow(db)).role).toBeNull();

      // A signed-in user with no profile row is also nobody.
      await wear(db, { sub: '00000000-0000-0000-0000-000000000000' });
      expect((await roleNow(db)).role).toBeNull();
    });
  });

  it('case 4 — a user cannot promote themselves', async () => {
    await withRollback(async (db) => {
      await wear(db, { sub: OPERATOR });
      await db.query('set local role authenticated');

      // The assertion is on the OUTCOME, not on the mechanism, because the mechanism has changed
      // and only the outcome is the security claim. Before `0074` an RLS `USING (false)` filtered
      // the rows out, so an UPDATE or DELETE reported zero rows; since `0074` the client role holds
      // no write privilege on any table, so the same statement is refused outright. Either is
      // "nothing changed" — and a statement that changed a row fails this test under both.
      for (const [sql, values] of [
        [`update profiles set role = 'admin' where id = $1`, [OPERATOR]],
        [`update profiles set role = 'gm'`, []],
        [`delete from profiles where id = $1`, [OPERATOR]],
      ] as const) {
        await db.query('savepoint promote_probe');
        let outcome: string;
        try {
          const res = await db.query(sql, [...values]);
          outcome = `rows=${res.rowCount}`;
          await db.query('release savepoint promote_probe');
        } catch (e) {
          await db.query('rollback to savepoint promote_probe');
          outcome = (e as Error).message;
        }
        expect(outcome).toMatch(/^rows=0$|permission denied/i);
      }

      const inserted = await refuses(
        db,
        `insert into profiles (id, display_name, role, is_active) values ($1,'x','admin',true)`,
        ['00000000-0000-0000-0000-0000000000aa']
      );
      expect(inserted).toMatch(/row-level security|permission denied/i);

      await db.query('reset role');

      // The roster is exactly as it was, and the operator is still an operator.
      const after = await one<{ role: string; n: string }>(
        db,
        `select (select role::text from profiles where id = $1) as role,
                (select count(*)::text from profiles) as n`,
        [OPERATOR]
      );
      expect(after.role).toBe('operator');
      expect(after.n).toBe('6');

      // And the resolved role did not budge either — the point of the whole exercise.
      await wear(db, { sub: OPERATOR });
      expect((await roleNow(db)).role).toBe('operator');
    });
  });

  it('case 4b — and cannot forge the claim by writing to the setting a client controls', async () => {
    await withRollback(async (db) => {
      // A client cannot set `request.jwt.claims` — PostgREST sets it from the verified token, and
      // `app_metadata` is server-controlled in Supabase. What this proves is narrower and still
      // worth having: the FALLBACK adds no new way in, because it reads a table with no write
      // policy for any client role.
      const writePolicies = await all<{ policyname: string }>(
        db,
        `select policyname from pg_policies
          where schemaname = 'public' and tablename = 'profiles' and cmd <> 'SELECT'
            and coalesce(with_check, 'false') <> 'false'`
      );
      expect(writePolicies).toEqual([]);

      const rls = await one<{ on: boolean }>(
        db,
        `select relrowsecurity as on from pg_class where relname = 'profiles'`
      );
      expect(rls.on).toBe(true);
    });
  });

  it('case 5 — a guarded RPC follows the resolved role in every case', async () => {
    await withRollback(async (db) => {
      // `hold_activity` asserts `supervisor` as its FIRST statement and only then checks that the
      // reason is non-empty. Passing an empty reason therefore separates the two cleanly: the
      // role message means the guard refused, the reason message means the guard let it through
      // and nothing was written either way.
      const call = `select public.hold_activity('00000000-0000-0000-0000-000000000000'::uuid, '')`;

      // 1 · no claim, no profile -> refused, and the message says so in words
      await wear(db, {});
      expect(await refuses(db, call)).toMatch(/requires role supervisor.*unauthenticated session/i);

      // 2 · profile-resolved operator -> refused, and the message names the RESOLVED role,
      //     which is only possible if the fallback ran
      await wear(db, { sub: OPERATOR });
      expect(await refuses(db, call)).toMatch(/requires role supervisor, not operator/i);

      // 3 · profile-resolved supervisor, no claim -> the guard passes. THIS is the case that
      //     was broken before 0035: with the hook off, a real supervisor was refused everything.
      await wear(db, { sub: SUPERVISOR });
      expect(await refuses(db, call)).toMatch(/hold needs a reason/i);

      // 4 · claim-resolved supervisor -> the guard passes by the fast path too
      await wear(db, { sub: OPERATOR, role: 'supervisor' });
      expect(await refuses(db, call)).toMatch(/hold needs a reason/i);
    });
  });

  it('the fallback is invoker-rights, so it can never read another user’s role', async () => {
    await withRollback(async (db) => {
      const fn = await one<{ prosecdef: boolean }>(
        db,
        `select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'current_app_role'`
      );
      // SECURITY DEFINER here would let the function read rows the caller cannot, which is the
      // widening this fix was required not to perform.
      expect(fn.prosecdef).toBe(false);
    });
  });
});
