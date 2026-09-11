/**
 * B7 — roles are not labels. Every refusal here is the SERVER'S.
 *
 * EVERY CALL GOES OVER HTTP WITH A REAL TOKEN, and that is not stylistic. The other suites connect
 * as `postgres`, which carries `BYPASSRLS` — and since 0058 that also means `assert_role` exempts
 * it, because otherwise no fixture in the repository could run. So an authorisation assertion made
 * through `pg` is now doubly vacuous. This is the only file where the claim can honestly be made.
 *
 * WHAT THIS FOUND WHEN IT WAS FIRST RUN AS A PROBE
 *   · fifty-eight SECURITY DEFINER functions executable by `anon` — `advance_batch`,
 *     `repair_plan_states` and `start_activity` all returned success with no token at all
 *   · an OPERATOR created a master batch, over HTTP, and got a real id back
 *   · three writers that record `current_app_role()` in an audit event and never check it
 *
 * The tests below are the fixed shape of each of those.
 */

import { describe, expect, it } from 'vitest';

import { ACCOUNTS, HTTP_READY, NO_HTTP_REASON, rpc, signIn, type Session } from './http';
import { DB_URL, all, one, refuses, withRollback, type Db } from './db';

const ready = HTTP_READY && Boolean(DB_URL);
const describeHttp = ready ? describe : describe.skip;
if (!ready) console.warn(`\n  SKIPPED: ${NO_HTTP_REASON}\n`);

/** An id that exists nowhere. Every probe uses it, so nothing is mutated even if a guard fails. */
const NIL = '00000000-0000-0000-0000-000000000000';

const sessions: Partial<Record<keyof typeof ACCOUNTS, Session>> = {};
async function as(role: keyof typeof ACCOUNTS): Promise<Session> {
  if (!sessions[role]) sessions[role] = await signIn(ACCOUNTS[role]);
  return sessions[role]!;
}

/** True when the server refused on AUTHORISATION rather than on the fictional id. */
function refusedForRole(reply: { status: number; body: unknown }): boolean {
  if (reply.status !== 403) return false;
  const msg = JSON.stringify(reply.body);
  return /requires role|may not|insufficient|permission denied|forbidden/i.test(msg);
}

describeHttp('an unauthenticated caller may execute nothing', () => {
  // The publishable key alone. No sign-in, no token, no role — the position anyone on the internet
  // is in, since the key ships in the browser bundle by design.
  const anon = async (fn: string, args: Record<string, unknown> = {}) => {
    const { ANON_KEY, SUPABASE_URL } = await import('./http');
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY!,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    return { status: r.status, body: await r.text() };
  };

  it.each([
    ['start_activity', { p_activity: NIL }],
    ['submit_activity', { p_activity: NIL }],
    ['advance_batch', { p_batch: NIL }],
    ['repair_plan_states', {}],
    ['release_elapsed_rests', { p_batch: NIL }],
    ['activate_batch', { p_batch_id: NIL }],
    ['decide_lab_submission', { p_activity: NIL, p_verdict: 'approved', p_reason: 'x' }],
    ['record_lab_result', { p_test: NIL }],
  ])('%s is refused with no token at all', async (fn, args) => {
    const r = await anon(fn as string, args as Record<string, unknown>);
    // 401/403 both mean refused. What must NOT happen is 200 or 204.
    expect([401, 403], `${fn} returned ${r.status}: ${r.body.slice(0, 120)}`).toContain(r.status);
  });

  /**
   * BEFORE 0061 this asserted `200` with `[]` — the read reached RLS, and RLS returned nothing.
   * That was true and it was not enough: it only held for BASE TABLES. Every view carried SELECT
   * for `anon` and ran as its OWNER, so `v_my_work` returned 320 rows to a caller with no token,
   * and `update v_live_batch set label='HACKED'` wrote four rows to `master_batch`.
   *
   * 0061 revoked every privilege on every relation in `public` from `anon`. The read is now
   * refused at the GRANT and never reaches RLS at all, which is why the expected status changed
   * from 200 to 401. Both the table and the view are checked, because the view was the hole.
   */
  it('a caller with no token is refused at the grant, on tables AND on views', async () => {
    const { ANON_KEY, SUPABASE_URL } = await import('./http');
    const headers = { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY}` };

    for (const rel of ['master_batch', 'v_my_work', 'v_live_batch', 'v_actual_history']) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${rel}?select=*&limit=5`, { headers });
      expect([401, 403], `${rel} returned ${r.status}`).toContain(r.status);
    }
  });

  it('a view cannot be written through by an anonymous caller', async () => {
    const { ANON_KEY, SUPABASE_URL } = await import('./http');
    // `v_live_batch` is auto-updatable and sits on `master_batch`. Before 0061 this wrote.
    const r = await fetch(`${SUPABASE_URL}/rest/v1/v_live_batch?id=eq.${NIL}`, {
      method: 'PATCH',
      headers: {
        apikey: ANON_KEY!,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ label: 'HACKED' }),
    });
    expect([401, 403], `PATCH v_live_batch returned ${r.status}`).toContain(r.status);
  });
});

describeHttp('an operator executes work and decides nothing', () => {
  it('cannot create a batch', async () => {
    const r = await rpc(await as('operator'), 'create_master_batch', {
      p_code: `PROBE-${Date.now()}`,
      p_label: 'probe',
      p_start_date: '2026-10-01',
      p_config: {},
      p_roles: [],
    });
    // This one returned 200 and a real batch id before 0058.
    expect(refusedForRole(r), `got ${r.status}: ${JSON.stringify(r.body).slice(0, 160)}`).toBe(true);
  });

  it.each([
    ['activate_batch', { p_batch_id: NIL }],
    ['generate_activity_plan', { p_batch_id: NIL }],
    ['cancel_batch', { p_batch: NIL, p_reason: 'probe' }],
    ['set_activity_plan', { p_activity: NIL, p_patch: {} }],
    ['set_batch_start_at', { p_batch: NIL, p_start_at: '2026-10-01T05:00:00Z' }],
    ['set_factory_timezone', { p_timezone: 'UTC' }],
    ['release_elapsed_rests', { p_batch: NIL }],
    ['set_current_process', { p_definition: NIL, p_reason: 'probe' }],
    ['publish_process_definition', { p_definition: NIL }],
  ])('cannot %s', async (fn, args) => {
    const r = await rpc(await as('operator'), fn as string, args as Record<string, unknown>);
    expect(refusedForRole(r), `${fn} got ${r.status}: ${JSON.stringify(r.body).slice(0, 160)}`).toBe(
      true
    );
  });

  it('cannot reach the engine internals at all — they are not an API', async () => {
    for (const [fn, args] of [
      ['advance_batch', { p_batch: NIL }],
      ['repair_plan_states', {}],
    ] as const) {
      const r = await rpc(await as('operator'), fn, args);
      // Not a role refusal — no grant. Nothing outside the database should reach these.
      expect(r.status, `${fn}`).toBe(403);
      expect(JSON.stringify(r.body)).toMatch(/permission denied/i);
    }
  });

  it('cannot correct a recorded actual — the person whose work is late does not restate it', async () => {
    const r = await rpc(await as('operator'), 'correct_actual', {
      p_activity: NIL,
      p_field: 'actual_end',
      p_value: '2026-09-01T10:00:00Z',
      p_reason: 'I finished earlier than that, honestly',
    });
    expect(refusedForRole(r), `got ${r.status}: ${JSON.stringify(r.body).slice(0, 160)}`).toBe(true);
  });

  it('cannot approve a laboratory submission', async () => {
    const r = await rpc(await as('operator'), 'decide_lab_submission', {
      p_activity: NIL,
      p_verdict: 'approved',
      p_reason: 'looks fine to me',
    });
    // ⚠ REFUSED, BUT ON EXISTENCE — `decide_lab_submission` looks the activity up before it checks
    // the role, so a fictional id never reaches the guard. That ordering is fine, and it means the
    // honest assertion here is "not permitted", not "403".
    //
    // The ROLE-specific refusal on a REAL lab activity is proved in `tests/labGates.test.ts`:
    // "an operator cannot approve a laboratory submission". Asserting it twice against a nil id
    // would look like two proofs and be none.
    expect([200, 204], `got ${r.status}: ${JSON.stringify(r.body).slice(0, 140)}`).not.toContain(
      r.status
    );
  });

  it('CAN do the thing the role exists for', async () => {
    // A guard that refused everything would pass every test above and be useless. `start_activity`
    // is the operator's own verb, and the nil id means nothing is touched.
    const r = await rpc(await as('operator'), 'start_activity', { p_activity: NIL });
    expect([200, 204], `got ${r.status}: ${JSON.stringify(r.body).slice(0, 120)}`).toContain(
      r.status
    );
  });
});

describeHttp('a laboratory technician records results and approves none', () => {
  it('cannot approve a laboratory submission — not even its own', async () => {
    const r = await rpc(await as('lab'), 'decide_lab_submission', {
      p_activity: NIL,
      p_verdict: 'approved',
      p_reason: 'my own reading, approving it myself',
    });
    // Same ordering caveat as the operator's case above: refused, on the fictional id.
    expect([200, 204], `got ${r.status}: ${JSON.stringify(r.body).slice(0, 140)}`).not.toContain(
      r.status
    );

    // The claim that actually matters is provable without an activity at all: C-32 names the GM
    // and the supervisor as the two readings on file, and the technician is in neither. A lab
    // technician approving their own reading is the separation this whole gate exists for.
    await withRollback(async (db: Db) => {
      const readings = await all<{ approver_role: string }>(
        db,
        `select approver_role::text as approver_role from lab_approval_reading`
      );
      expect(readings.length, 'C-32 carries two readings').toBeGreaterThan(0);
      expect(readings.map((r2) => r2.approver_role)).not.toContain('lab_tech');
    });
  });

  it('cannot create or activate a batch', async () => {
    for (const [fn, args] of [
      ['create_master_batch', { p_code: `PROBE-${Date.now()}`, p_label: 'p', p_start_date: '2026-10-01', p_config: {}, p_roles: [] }],
      ['activate_batch', { p_batch_id: NIL }],
    ] as const) {
      const r = await rpc(await as('lab'), fn, args);
      expect(refusedForRole(r), `${fn} got ${r.status}`).toBe(true);
    }
  });

  it('CAN open a sample — the role is not merely refused everywhere', async () => {
    const r = await rpc(await as('lab'), 'open_lab_sample', { p_activity: NIL, p_checkpoint: NIL });
    // Refused on the fictional ids, NOT on authorisation. 403 here would mean the role is wrong.
    expect(r.status, JSON.stringify(r.body).slice(0, 160)).not.toBe(403);
  });
});

describeHttp('a supervisor oversees work and does not run the factory', () => {
  it('cannot create or activate a batch', async () => {
    for (const [fn, args] of [
      ['create_master_batch', { p_code: `PROBE-${Date.now()}`, p_label: 'p', p_start_date: '2026-10-01', p_config: {}, p_roles: [] }],
      ['activate_batch', { p_batch_id: NIL }],
      ['publish_process_definition', { p_definition: NIL }],
      ['set_current_process', { p_definition: NIL, p_reason: 'probe' }],
    ] as const) {
      const r = await rpc(await as('supervisor'), fn, args);
      expect(refusedForRole(r), `${fn} got ${r.status}: ${JSON.stringify(r.body).slice(0, 140)}`)
        .toBe(true);
    }
  });

  it('CAN correct an actual and edit a draft plan — the supervisory verbs', async () => {
    for (const [fn, args] of [
      ['correct_actual', { p_activity: NIL, p_field: 'actual_end', p_value: '2026-09-01T10:00:00Z', p_reason: 'A reason of sufficient length' }],
      ['set_activity_plan', { p_activity: NIL, p_patch: {} }],
    ] as const) {
      const r = await rpc(await as('supervisor'), fn, args);
      expect(r.status, `${fn}: ${JSON.stringify(r.body).slice(0, 160)}`).not.toBe(403);
    }
  });
});

describeHttp('an admin runs the factory and performs no work', () => {
  it('CAN create a batch', async () => {
    // The counterpart to the operator's refusal. Asserted with a fictional H0 so nothing is made:
    // an admin creating a real batch here would leave a row behind in a shared database.
    const r = await rpc(await as('admin'), 'create_master_batch', {
      p_code: `PROBE-${Date.now()}`,
      p_label: 'probe',
      p_start_date: '2026-10-01',
      p_config: {},
      p_roles: [],
      p_process_definition_id: NIL,
    });
    // Refused on the fictional definition, NOT on authorisation.
    expect(r.status, JSON.stringify(r.body).slice(0, 200)).not.toBe(403);
  });

  it('cannot start work or capture evidence — the permission matrix does not tick either', async () => {
    const start = await rpc(await as('admin'), 'start_activity', { p_activity: NIL });
    expect(refusedForRole(start), `start_activity got ${start.status}`).toBe(true);

    const bind = await rpc(await as('admin'), 'bind_evidence', {
      p_activity: NIL,
      p_requirement_key: 'BEFORE_PHOTO',
      p_storage_path: 'x/y/z.jpg',
    });
    expect(bind.status, 'an admin may not prove work they did not do').not.toBe(200);
  });
});

describeHttp('the invariant, not the roll-call', () => {
  it('no function in public is executable without signing in', async () => {
    await withRollback(async (db: Db) => {
      const open = await all<{ proname: string }>(
        db,
        `select p.proname from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
            and has_function_privilege('anon', p.oid, 'execute')
          order by 1`
      );
      // Fifty-eight of these existed. The next one added must fail this, not be discovered by
      // somebody calling it.
      expect(open.map((o) => o.proname)).toEqual([]);
    });
  });

  it('the development clock is not wired into anything authoritative', async () => {
    await withRollback(async (db: Db) => {
      const leaked = await all<{ proname: string }>(
        db,
        `select p.proname from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and pg_get_functiondef(p.oid) ilike '%get_effective_now%'
            and p.proname not in ('get_effective_now','pause_dev_clock','play_dev_clock',
                                  'set_dev_clock_h','reset_dev_clock_to_live')`
      );
      // ARCH-008: an actual is only evidence while it comes from a clock nobody can move.
      expect(leaked.map((l) => l.proname)).toEqual([]);

      // And moving it needs admin or GM, on a database explicitly marked as development.
      const guard = await one<{ body: string }>(
        db,
        `select pg_get_functiondef(p.oid) as body from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'assert_dev_clock_writer'`
      );
      expect(guard.body).toMatch(/dev_environment_enabled/);
      expect(guard.body).toMatch(/has_role\('admin'\)|has_role\('gm'\)/);
    });
  });

  it('assert_role exempts nobody — not the owner, not anybody', async () => {
    await withRollback(async (db: Db) => {
      const body = await one<{ body: string }>(
        db,
        `select pg_get_functiondef(p.oid) as body from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'assert_role'`
      );

      // TWO EXEMPTIONS WERE TRIED FOR THE HARNESS'S CONVENIENCE, AND BOTH WERE HOLES.
      //
      //   `rolbypassrls where rolname = current_user` — inside SECURITY DEFINER `current_user` is
      //   the OWNER, so it was true for every caller and disabled every guard in the product.
      //
      //   `session_user` plus "no role claimed" — correct over HTTP, and it still made every
      //   refusal vacuous over `pg` for suites that had not adopted a role. They went green while
      //   proving nothing.
      //
      // So there is no exemption at all, and this asserts the absence rather than the shape.
      // Fixtures adopt the role they need; `createDraftBatch` borrows `admin` and gives it back.
      expect(body.body).toMatch(/has_role/);

      // ASSERTED BY CALLING IT, not by grepping the body — the body NAMES both dead exemptions in
      // its own comment, so a text match on `rolbypassrls` finds the explanation of why there is
      // none. This connection is `postgres`, the most privileged role there is, carrying no claim.
      const refusal = await refuses(
        db,
        `select public.assert_role(array['admin']::app_role[], 'probe the guard')`
      );
      expect(refusal, 'the owner is refused like anyone else').toMatch(/requires role admin/i);
      expect(refusal).toMatch(/unauthenticated session/i);
    });
  });
});
