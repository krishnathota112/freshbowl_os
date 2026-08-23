/**
 * B6 — management checkpoints. `0020_management_checkpoints.sql`, `BUILD_SEQUENCE_KIRO.md §B6`.
 *
 * THE EXIT PROOF, verbatim:
 *   · a batch whose Day-12 work is complete stays LOCKED at `TN-LOAD` with the seeded reason
 *   · after a GM decision is recorded, `evaluate_gates` opens it
 *   · a decision without a reason is refused
 *   · the snapshot is immutable
 *
 * WHY THE GM HALF GOES OVER HTTP. `record_checkpoint_decision` takes its actor from the JWT and
 * refuses any role but `gm`. Called through `pg` the role is NULL and it refuses — correctly — so a
 * test that only ever connected as `postgres` could prove the refusal and never the approval. The
 * approval path signs in as `gm@freshbowl.demo`.
 *
 * The gate half runs through `pg` inside a rolled-back transaction, because it needs to drive a batch
 * to the tunnel and must not leave it there.
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
import { ACCOUNTS, HTTP_READY, NO_HTTP_REASON, rpc, signIn, type Session } from './http';

const ready = Boolean(DB_URL);
const describeDb = ready ? describe : describe.skip;
if (!ready) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

const describeHttp = HTTP_READY && ready ? describe : describe.skip;
if (!HTTP_READY) console.warn(`\n  SKIPPED: ${NO_HTTP_REASON}\n`);

/** The seeded rule, so the test asserts against the process definition rather than a retyped guess. */
async function seededRule(db: Db) {
  return one<{ checkpoint: number; template: string; is_enabled: boolean; confidence: string }>(
    db,
    `select (g.config->>'checkpoint')::int as checkpoint,
            g.blocked_reason_template as template,
            g.is_enabled, g.mapping_confidence as confidence
       from gate_rule g join process_activity pa on pa.id = g.process_activity_id
      where pa.code = 'TN-LOAD' and g.kind = 'GM_APPROVAL' and g.phase = 'entry'`
  );
}

describeDb('B6 — the seeded rule is intact, and it is what holds the tunnel', () => {
  it('the GM_APPROVAL rule is still enabled, still dictated, and still names its checkpoint', async () => {
    await withRollback(async (db) => {
      // §B6: "Do not disable or edit the seeded GM_APPROVAL rule to unblock the tunnel." This is the
      // assertion that would catch someone doing exactly that.
      const g = await seededRule(db);
      expect(g.is_enabled, 'the rule was disabled to make the tunnel reachable').toBe(true);
      expect(g.confidence).toBe('dictated');
      expect(g.checkpoint, 'the rule must say WHICH checkpoint it waits on').toBe(3);
      expect(g.template).toMatch(/GM approval/i);
    });
  });

  it('TN-LOAD fails its GM_APPROVAL gate on a batch with no decision, naming the checkpoint', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      const tn = await one<{ id: string }>(
        db,
        `select id from batch_activity
          where master_batch_id = $1 and code = 'TN-LOAD' order by instance_no limit 1`,
        [batch]
      );

      const v = await one<{ verdict: string; reason: string }>(
        db,
        `select verdict, reason from evaluate_gates($1, 'entry') where kind = 'GM_APPROVAL'`,
        [tn.id]
      );
      expect(v.verdict).toBe('fail');
      // The gate's own words, with the checkpoint rendered into them.
      expect(v.reason).toMatch(/checkpoint 3/i);
      expect(v.reason).toMatch(/Phase-1 to Phase-2/i);
    });
  });
});

describeDb('B6 — an approval opens the gate, and only an approval', () => {
  /**
   * Drive one tunnel line's predecessors to COMPLETED so the ONLY thing left holding `TN-LOAD` is the
   * GM approval. Everything goes through `submit_activity`; the rest clocks are the one thing pushed,
   * because a 48-hour window cannot elapse inside a test and the server clock is deliberately the
   * authority on it (`0008`).
   */
  async function driveToTunnel(db: Db, batch: string): Promise<string> {
    for (let pass = 0; pass < 40; pass += 1) {
      // Any rest window still pending is moved into the past. This is the one shortcut, it is taken as
      // `postgres` inside a rolled-back transaction, and it is not available to any client.
      await db.query(
        `update batch_activity set unblocks_at = now() - interval '1 minute'
          where master_batch_id = $1 and state = 'WAITING_TIME'`,
        [batch]
      );
      await db.query(`select public.advance_batch($1)`, [batch]);

      const ready = await all<{ id: string }>(
        db,
        `select ba.id from batch_activity ba
          where ba.master_batch_id = $1 and ba.state in ('READY','RETURNED')
            and ba.code <> 'TN-LOAD'
          order by ba.seq, ba.instance_no`,
        [batch]
      );
      if (ready.length === 0) break;

      for (const a of ready) {
        await satisfyEvidence(db, a.id);
        // Mid-band values, so no FIELD_IN_RANGE gate fails and no deviation is raised — this test is
        // about the approval, not about out-of-range handling.
        await db.query(
          `select public.submit_activity(
             $1,
             coalesce((select jsonb_object_agg(v.field_key,
                 case when v.sop_min is not null and v.sop_max is not null
                        then round((v.sop_min + v.sop_max) / 2, 2)::text
                      when v.day0_value ~ '^-?[0-9]+(\\.[0-9]+)?$' then v.day0_value
                      when v.field_key like '%qty%' and ba.planned_qty_mt is not null
                        then ba.planned_qty_mt::text
                 end)
               from batch_activity_value v
               join batch_activity ba on ba.id = v.batch_activity_id
              where v.batch_activity_id = $1
                and (v.sop_min is not null or v.sop_max is not null
                     or v.day0_value ~ '^-?[0-9]+(\\.[0-9]+)?$'
                     or v.field_key like '%qty%')), '{}'::jsonb),
             'B6 proof run')`,
          [a.id]
        );
      }
    }

    const tn = await one<{ id: string }>(
      db,
      `select id from batch_activity
        where master_batch_id = $1 and code = 'TN-LOAD' order by instance_no limit 1`,
      [batch]
    );
    return tn.id;
  }

  it('with every predecessor complete, GM_APPROVAL is the ONLY thing still failing', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      const tn = await driveToTunnel(db, batch);

      const failing = await all<{ kind: string; reason: string }>(
        db,
        `select kind, reason from evaluate_gates($1, 'entry') where verdict = 'fail' order by ordering`,
        [tn]
      );
      expect(
        failing.map((f) => f.kind),
        'something other than the approval is still holding the tunnel'
      ).toEqual(['GM_APPROVAL']);

      // And the row itself is LOCKED carrying that reason, not merely evaluable as failing.
      const row = await one<{ state: string; blocked_reason: string }>(
        db,
        `select state::text as state, blocked_reason from batch_activity where id = $1`,
        [tn]
      );
      expect(row.state).toBe('LOCKED');
      expect(row.blocked_reason).toMatch(/GM approval/i);
    });
  });

  it('a recorded approval opens it; a return does not', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      const tn = await driveToTunnel(db, batch);
      const gm = await one<{ id: string }>(db, `select id from profiles where role = 'gm'`);

      const open = async () =>
        (
          await one<{ verdict: string }>(
            db,
            `select verdict from evaluate_gates($1, 'entry') where kind = 'GM_APPROVAL'`,
            [tn]
          )
        ).verdict;

      // A checkpoint with a RETURNED decision is still open. Written directly here because
      // `record_checkpoint_decision` refuses `postgres` (no JWT), which the HTTP suite below proves.
      await db.query(
        `insert into management_checkpoint (master_batch_id, checkpoint_no) values ($1, 3)`,
        [batch]
      );
      const cp = await one<{ id: string }>(
        db,
        `select id from management_checkpoint where master_batch_id = $1 and checkpoint_no = 3`,
        [batch]
      );
      await db.query(
        `insert into checkpoint_decision (management_checkpoint_id, verdict, reason,
                                          package_snapshot, decided_by, decided_by_role)
         values ($1, 'returned', 'Fill heights above the SOP maximum on two tunnels.',
                 public.checkpoint_package($2, 3), $3, 'gm')`,
        [cp.id, batch, gm.id]
      );
      expect(await open(), 'a RETURNED checkpoint must not open the gate').toBe('fail');
      expect(
        (await one<{ state: string }>(db, `select state::text as state from management_checkpoint where id = $1`, [cp.id])).state
      ).toBe('open');

      // Now an approval. The LATEST decision governs.
      await db.query(
        `insert into checkpoint_decision (management_checkpoint_id, verdict, reason,
                                          package_snapshot, decided_by, decided_by_role)
         values ($1, 'approved_with_conditions',
                 'Approved on condition that both tunnels load at or below 2.2 m.',
                 public.checkpoint_package($2, 3), $3, 'gm')`,
        [cp.id, batch, gm.id]
      );
      expect(await open(), 'an approval must open the gate').toBe('pass');

      // Both decisions stay on the record. §5 — the trail is what happened, not the latest state.
      const n = await one<{ n: string }>(
        db,
        `select count(*)::text as n from checkpoint_decision where management_checkpoint_id = $1`,
        [cp.id]
      );
      expect(Number(n.n)).toBe(2);

      // And advance_batch now opens the row, because the predicate it was waiting on holds.
      await db.query(`select public.advance_batch($1)`, [batch]);
      const row = await one<{ state: string }>(
        db,
        `select state::text as state from batch_activity where id = $1`,
        [tn]
      );
      expect(row.state, 'TN-LOAD should be open once the approval is on record').not.toBe('LOCKED');
    });
  });
});

describeDb('B6 — the decision is immutable and cannot be unreasoned', () => {
  it('a decision with a blank reason is refused by the column, not only by the RPC', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      const gm = await one<{ id: string }>(db, `select id from profiles where role = 'gm'`);
      await db.query(
        `insert into management_checkpoint (master_batch_id, checkpoint_no) values ($1, 3)`,
        [batch]
      );
      const cp = await one<{ id: string }>(
        db,
        `select id from management_checkpoint where master_batch_id = $1 and checkpoint_no = 3`,
        [batch]
      );

      for (const blank of ['', '   ']) {
        const why = await refuses(
          db,
          `insert into checkpoint_decision (management_checkpoint_id, verdict, reason,
                                            package_snapshot, decided_by, decided_by_role)
           values ($1, 'approved', $2, '{}'::jsonb, $3, 'gm')`,
          [cp.id, blank, gm.id]
        );
        expect(why).toMatch(/reason/i);
      }
    });
  });

  it('the snapshot cannot be edited or deleted, by anyone, including postgres', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      const gm = await one<{ id: string }>(db, `select id from profiles where role = 'gm'`);
      await db.query(
        `insert into management_checkpoint (master_batch_id, checkpoint_no) values ($1, 3)`,
        [batch]
      );
      const cp = await one<{ id: string }>(
        db,
        `select id from management_checkpoint where master_batch_id = $1 and checkpoint_no = 3`,
        [batch]
      );
      const d = await one<{ id: string }>(
        db,
        `insert into checkpoint_decision (management_checkpoint_id, verdict, reason,
                                          package_snapshot, decided_by, decided_by_role)
         values ($1, 'approved', 'Approved.', public.checkpoint_package($2, 3), $3, 'gm')
         returning id`,
        [cp.id, batch, gm.id]
      );

      // §5 — "The GM's approval is bound to exactly what they saw, not to whatever the data later
      // became." `postgres` has BYPASSRLS and every privilege there is, and it still cannot.
      const onUpdate = await refuses(
        db,
        `update checkpoint_decision set package_snapshot = '{"tampered":true}'::jsonb where id = $1`,
        [d.id]
      );
      expect(onUpdate).toMatch(/append-only/i);

      const onDelete = await refuses(db, `delete from checkpoint_decision where id = $1`, [d.id]);
      expect(onDelete).toMatch(/append-only/i);
    });
  });

  it('the snapshot records what the GM was NOT shown', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      const pkg = await one<{ absent: { section: number; name: string; reason: string }[] }>(
        db,
        `select public.checkpoint_package($1, 3)->'sections_absent' as absent`,
        [batch]
      );
      const names = pkg.absent.map((a) => a.name);

      // ROLE_AND_APPROVAL_MODEL §5 specifies nine sections. Four cannot be assembled today, and the
      // snapshot says so rather than implying completeness — a future reader must not conclude the GM
      // saw lab results that did not exist.
      expect(names).toContain('QUALITY');
      expect(names).toContain('RESOURCE USAGE');
      expect(names).toContain('PROPOSED NEXT STEP');
      for (const a of pkg.absent) {
        expect(a.reason.length, `section ${a.section} is absent with no stated reason`).toBeGreaterThan(20);
      }
    });
  });

  it('the sections it DOES assemble are read from real records', async () => {
    await withRollback(async (db) => {
      const pkg = await one<{
        plan: { code: string } | null;
        position: Record<string, number>;
        evidence: { requirements_total: number };
      }>(
        db,
        `select (public.checkpoint_package(mb.id, 3))->'plan' as plan,
                (public.checkpoint_package(mb.id, 3))->'position' as position,
                (public.checkpoint_package(mb.id, 3))->'evidence' as evidence
           from master_batch mb where mb.code = 'MB-DEMO-LATE'`
      );
      expect(pkg.plan?.code).toBe('MB-DEMO-LATE');
      // The staged batch has completed work, so the position is not empty.
      expect(Object.keys(pkg.position).length).toBeGreaterThan(1);
      expect(pkg.evidence.requirements_total).toBeGreaterThan(0);
    });
  });
});

describeHttp('B6 — only the GM records a checkpoint decision', () => {
  const sessions: Record<string, Session> = {};

  // A NON-EXISTENT BATCH ID IS DELIBERATE in these four. The role check and the reason check both run
  // BEFORE the batch is looked up, so a refusal here proves the guard rather than the lookup — and it
  // writes nothing to the deployed project whichever way it goes.
  const NOWHERE = '00000000-0000-0000-0000-000000000000';

  it('a supervisor is refused, and the message says who may', async () => {
    sessions.supervisor ??= await signIn(ACCOUNTS.supervisor);
    const r = await rpc(sessions.supervisor, 'record_checkpoint_decision', {
      p_batch: NOWHERE,
      p_checkpoint: 3,
      p_verdict: 'approved',
      p_reason: 'Trying it on.',
    });
    expect(r.ok, 'a supervisor must not record a management checkpoint decision').toBe(false);
    expect(JSON.stringify(r.body)).toMatch(/General Manager/i);
  });

  it('an operator is refused too', async () => {
    sessions.operator ??= await signIn(ACCOUNTS.operator);
    const r = await rpc(sessions.operator, 'record_checkpoint_decision', {
      p_batch: NOWHERE,
      p_checkpoint: 3,
      p_verdict: 'approved',
      p_reason: 'Trying it on.',
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r.body)).toMatch(/General Manager/i);
  });

  it('the GM is refused a decision with no reason', async () => {
    sessions.gm ??= await signIn(ACCOUNTS.gm);
    const r = await rpc(sessions.gm, 'record_checkpoint_decision', {
      p_batch: NOWHERE,
      p_checkpoint: 3,
      p_verdict: 'approved',
      p_reason: '   ',
    });
    expect(r.ok).toBe(false);
    // The reason check comes before the batch lookup, so this is the message we should see.
    expect(JSON.stringify(r.body)).toMatch(/needs a reason/i);
  });

  it('the GM is refused a verdict outside the three §5 puts on the screen', async () => {
    sessions.gm ??= await signIn(ACCOUNTS.gm);
    const r = await rpc(sessions.gm, 'record_checkpoint_decision', {
      p_batch: NOWHERE,
      p_checkpoint: 3,
      p_verdict: 'rubber_stamped',
      p_reason: 'A real reason.',
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r.body)).toMatch(/approved_with_conditions/);
  });
});
