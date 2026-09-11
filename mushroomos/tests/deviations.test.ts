/**
 * B2 — deviations, supervisor verdicts, corrective actions.
 *
 * Spec: `docs/ROLE_AND_APPROVAL_MODEL.md` §2 (authority matrix), §3.1 (verdicts), §3.2
 * (protected gates). Migration `0017_deviations.sql`.
 *
 * ROLE SIMULATION. The harness connects as `postgres`, for which `current_app_role()` is NULL —
 * so every `assert_role` guard would refuse. `asRole` sets the same JWT claim PostgREST sets, so
 * these proofs exercise the real `current_app_role()` / `has_role()` path rather than a stub. It
 * is transaction-scoped and every test rolls back.
 *
 * That matters more than usual here: until `0015_role_claim.sql` the claim was never populated,
 * `has_role()` was false for everyone, and a deny-everyone policy passed every negative test. A
 * role guard is only proven by a POSITIVE case that succeeds alongside the negative that fails.
 */

import { describe, expect, it } from 'vitest';
import {
  DB_URL,
  all,
  createActiveBatch,
  one,
  refuses,
  satisfyEvidence,
  withRollback,
  type Db,
} from './db';

const d = DB_URL ? describe : describe.skip;

/** Impersonate a role for the rest of the transaction, exactly as PostgREST would. */
async function asRole(db: Db, role: string): Promise<string> {
  const who = await one<{ id: string }>(
    db,
    `select id from profiles where role = $1::app_role and is_active limit 1`,
    [role]
  );
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: who.id, app_metadata: { app_role: role } }),
  ]);
  return who.id;
}

/** The first READY weighment load — LOAD-scoped, has a Day-0 target, so a variance is reachable. */
async function firstLoad(db: Db, batch: string) {
  return one<{ id: string; title: string; stream: string; seq: number }>(
    db,
    `select id, title, stream, seq from batch_activity
      where master_batch_id = $1 and code = 'FIB1-WEIGH' and state = 'READY'
      order by instance_no limit 1`,
    [batch]
  );
}

/** Submit a load well outside its Day-0 target. 3.6 MT against 2.0 — DEMO_SPRINT_ORDER §0.3. */
async function submitOverweight(db: Db, activity: string, qty = 3.6) {
  const field = await one<{ field_key: string }>(
    db,
    `select field_key from batch_activity_value
      where batch_activity_id = $1 and field_key like '%qty%' limit 1`,
    [activity]
  );
  // Work that was never started cannot be finished by an operator (`0071`) — start it first, as
  // the screen does. The server stamps the start.
  await db.query(`select start_activity($1)`, [activity]);
  await satisfyEvidence(db, activity);
  return all(db, `select * from submit_activity($1, $2::jsonb, 'staged for a B2 proof')`, [
    activity,
    JSON.stringify({ [field.field_key]: String(qty) }),
  ]);
}

d('B2 · a variance becomes a record', () => {
  it(
    'one deviation row per failing field, carrying what triggered it',
    async () => {
      await withRollback(async (db) => {
        await asRole(db, 'operator');
        const batch = await createActiveBatch(db);
        const load = await firstLoad(db, batch);
        const res = await submitOverweight(db, load.id);

        expect(Number((res[0] as { out_of_range: number }).out_of_range)).toBeGreaterThan(0);

        const devs = await all<{
          kind: string;
          summary: string;
          state: string;
          detail: Record<string, unknown>;
          raised_by_role: string;
        }>(
          db,
          `select kind, summary, state, detail, raised_by_role::text
             from deviation where batch_activity_id = $1`,
          [load.id]
        );

        expect(devs).toHaveLength(1);
        expect(devs[0].state).toBe('open');
        expect(devs[0].kind).toBe('VALUE_OFF_DAY0_TARGET');
        // Self-describing: the GM package renders this without re-deriving it months later.
        expect(devs[0].detail).toMatchObject({ value: '3.6', target_source: 'the Day-0 plan' });
        expect(devs[0].summary).toContain('3.6');
        // Raised by whoever recorded it — §2 gives the operator that authority.
        expect(devs[0].raised_by_role).toBe('operator');
      });
    },
    60_000
  );

  it(
    'the activity holds, and so does the next step in its own stream only',
    async () => {
      await withRollback(async (db) => {
        await asRole(db, 'operator');
        const batch = await createActiveBatch(db);
        const load = await firstLoad(db, batch);
        await submitOverweight(db, load.id);

        const act = await one<{ state: string; blocked_reason: string }>(
          db,
          `select state::text, blocked_reason from batch_activity where id = $1`,
          [load.id]
        );
        expect(act.state).toBe('DEVIATION');
        expect(act.blocked_reason).toContain('held for supervisor review');

        // Parallel streams are independent; blocking them would be a lie about what is wrong.
        const otherStreams = await one<{ n: number }>(
          db,
          `select count(*)::int n from batch_activity
            where master_batch_id = $1 and stream <> $2 and state = 'BLOCKED'`,
          [batch, load.stream]
        );
        expect(Number(otherStreams.n)).toBe(0);
      });
    },
    60_000
  );
});

d('B2 · supervisor verdicts — §3.1', () => {
  it(
    'RELEASE is refused while a deviation still awaits a verdict',
    async () => {
      await withRollback(async (db) => {
        await asRole(db, 'operator');
        const batch = await createActiveBatch(db);
        const load = await firstLoad(db, batch);
        await submitOverweight(db, load.id);

        await asRole(db, 'supervisor');
        const msg = await refuses(db, `select release_activity($1, 'looks fine to me')`, [load.id]);
        expect(msg).toMatch(/awaiting a verdict/i);
      });
    },
    60_000
  );

  it(
    'accept-with-deviation then release: the activity completes and the line moves',
    async () => {
      await withRollback(async (db) => {
        await asRole(db, 'operator');
        const batch = await createActiveBatch(db);
        const load = await firstLoad(db, batch);
        await submitOverweight(db, load.id);

        await asRole(db, 'supervisor');
        const dev = await one<{ id: string }>(
          db,
          `select id from deviation where batch_activity_id = $1`,
          [load.id]
        );
        await db.query(`select accept_with_deviation($1, 'truck was overloaded at source')`, [
          dev.id,
        ]);
        await db.query(`select release_activity($1, 'accepted, quantity reconciled downstream')`, [
          load.id,
        ]);

        const act = await one<{ state: string }>(
          db,
          `select state::text from batch_activity where id = $1`,
          [load.id]
        );
        expect(act.state).toBe('COMPLETED');
      });
    },
    60_000
  );

  it(
    'an accepted deviation STAYS on the record — §3.1',
    async () => {
      await withRollback(async (db) => {
        await asRole(db, 'operator');
        const batch = await createActiveBatch(db);
        const load = await firstLoad(db, batch);
        await submitOverweight(db, load.id);

        await asRole(db, 'supervisor');
        const dev = await one<{ id: string }>(
          db,
          `select id from deviation where batch_activity_id = $1`,
          [load.id]
        );
        await db.query(`select accept_with_deviation($1, 'sweet smell, no anaerobic sign')`, [
          dev.id,
        ]);

        const row = await one<{
          state: string;
          awaiting_verdict: boolean;
          stands_on_record: boolean;
          decision_reason: string;
          decided_by_role: string;
        }>(
          db,
          `select state::text, awaiting_verdict, stands_on_record, decision_reason,
                  decided_by_role::text
             from v_deviation_open where id = $1`,
          [dev.id]
        );

        expect(row.state).toBe('accepted');
        expect(row.awaiting_verdict).toBe(false);
        // The whole point: waived is not gone. A GM package that dropped this would be wrong.
        expect(row.stands_on_record).toBe(true);
        expect(row.decision_reason).toBe('sweet smell, no anaerobic sign');
        expect(row.decided_by_role).toBe('supervisor');
      });
    },
    60_000
  );

  it(
    'HOLD and RETURN both state a reason on the face of the card',
    async () => {
      await withRollback(async (db) => {
        await asRole(db, 'operator');
        const batch = await createActiveBatch(db);
        const load = await firstLoad(db, batch);

        await asRole(db, 'supervisor');
        await db.query(`select hold_activity($1, 'weighbridge calibration overdue')`, [load.id]);
        let act = await one<{ state: string; blocked_reason: string }>(
          db,
          `select state::text, blocked_reason from batch_activity where id = $1`,
          [load.id]
        );
        expect(act.state).toBe('BLOCKED');
        expect(act.blocked_reason).toContain('weighbridge calibration overdue');

        await db.query(`select return_activity($1, 'reweigh load 1 and photograph the ticket')`, [
          load.id,
        ]);
        act = await one<{ state: string; blocked_reason: string }>(
          db,
          `select state::text, blocked_reason from batch_activity where id = $1`,
          [load.id]
        );
        expect(act.state).toBe('RETURNED');
        expect(act.blocked_reason).toContain('reweigh load 1');

        const note = await one<{ n: number }>(
          db,
          `select count(*)::int n from notification
            where batch_activity_id = $1 and kind = 'returned'`,
          [load.id]
        );
        expect(Number(note.n)).toBe(1);
      });
    },
    60_000
  );

  it('every verdict needs a reason', async () => {
    await withRollback(async (db) => {
      await asRole(db, 'operator');
      const batch = await createActiveBatch(db);
      const load = await firstLoad(db, batch);
      await submitOverweight(db, load.id);

      await asRole(db, 'supervisor');
      const dev = await one<{ id: string }>(
        db,
        `select id from deviation where batch_activity_id = $1`,
        [load.id]
      );
      expect(await refuses(db, `select accept_with_deviation($1, '')`, [dev.id])).toMatch(
        /needs a reason/i
      );
      expect(await refuses(db, `select hold_activity($1, '   ')`, [load.id])).toMatch(
        /needs a reason/i
      );
      expect(await refuses(db, `select return_activity($1, '')`, [load.id])).toMatch(
        /what specifically to redo/i
      );
    });
  }, 60_000);
});

d('B2 · authority — §2, and the guard is proven in both directions', () => {
  it(
    'an operator cannot release, hold, return or accept; a supervisor can',
    async () => {
      await withRollback(async (db) => {
        await asRole(db, 'operator');
        const batch = await createActiveBatch(db);
        const load = await firstLoad(db, batch);
        await submitOverweight(db, load.id);
        const dev = await one<{ id: string }>(
          db,
          `select id from deviation where batch_activity_id = $1`,
          [load.id]
        );

        // NEGATIVE — still as the operator.
        for (const sql of [
          `select release_activity($1, 'x')`,
          `select hold_activity($1, 'x')`,
          `select return_activity($1, 'x')`,
        ]) {
          expect(await refuses(db, sql, [load.id])).toMatch(/requires role supervisor/i);
        }
        expect(await refuses(db, `select accept_with_deviation($1, 'x')`, [dev.id])).toMatch(
          /requires role supervisor or gm/i
        );

        // POSITIVE — the guard must be discriminating, not blanket. This is the half that was
        // missing when the role claim was never populated and every deny looked correct.
        await asRole(db, 'supervisor');
        await db.query(`select accept_with_deviation($1, 'accepted for the proof')`, [dev.id]);
        const row = await one<{ state: string }>(
          db,
          `select state::text from deviation where id = $1`,
          [dev.id]
        );
        expect(row.state).toBe('accepted');
      });
    },
    60_000
  );

  it(
    'a supervisor cannot accept a PROTECTED gate — §3.2 — and must escalate instead',
    async () => {
      await withRollback(async (db) => {
        const supervisorId = await asRole(db, 'supervisor');
        const batch = await createActiveBatch(db);
        const load = await firstLoad(db, batch);

        // Tie a deviation to the tunnel fill-height gate, which 0017 marks protected.
        const dev = await one<{ raise_deviation: string }>(
          db,
          `select raise_deviation($1, 'fill height 2.25 m above the SOP maximum')::text
             as raise_deviation`,
          [load.id]
        );
        await db.query(
          `update deviation set gate_rule_id = (
             select g.id from gate_rule g
               join process_activity pa on pa.id = g.process_activity_id
              where pa.code = 'TN-LOAD' and g.kind = 'FIELD_IN_RANGE'
                and g.config->>'field_key' = 'fill_height_m'
              limit 1)
            where id = $1`,
          [dev.raise_deviation]
        );

        const msg = await refuses(db, `select accept_with_deviation($1, 'looked fine')`, [
          dev.raise_deviation,
        ]);
        expect(msg).toMatch(/protected/i);
        expect(msg).toMatch(/escalate/i);

        // The route that IS open to a supervisor.
        await db.query(`select escalate_deviation($1, 'above SOP max, need a GM call')`, [
          dev.raise_deviation,
        ]);
        let row = await one<{ state: string; decided_by: string }>(
          db,
          `select state::text, decided_by::text from deviation where id = $1`,
          [dev.raise_deviation]
        );
        expect(row.state).toBe('escalated');
        expect(row.decided_by).toBe(supervisorId);

        // And a GM may pass it.
        await asRole(db, 'gm');
        await db.query(`select gm_decide_override($1, true, 'accepted, settled by 4 h')`, [
          dev.raise_deviation,
        ]);
        row = await one<{ state: string; decided_by: string }>(
          db,
          `select state::text, decided_by::text from deviation where id = $1`,
          [dev.raise_deviation]
        );
        expect(row.state).toBe('accepted');
      });
    },
    60_000
  );

  it('exactly two gates ship protected, and both are identifiable', async () => {
    await withRollback(async (db) => {
      const rows = await all<{ code: string; kind: string }>(
        db,
        `select pa.code, g.kind from gate_rule g
           join process_activity pa on pa.id = g.process_activity_id
           join process_definition pd on pd.id = pa.process_definition_id
          where pd.code = 'PROCESS-2026B' and g.is_protected
          order by pa.code`
      );
      // §3.2 names four categories. Ammonia has no gate (TBD-14) and "critical severity at a
      // checkpoint" has no severity model (TBD-51). Marking either would be inventing one.
      expect(rows.map((r) => `${r.code}:${r.kind}`)).toEqual([
        'TN-HOLD:SENSOR_THRESHOLD',
        'TN-LOAD:FIELD_IN_RANGE',
      ]);
    });
  }, 60_000);

  /**
   * ADDED BY 0025, AFTER THIS SUITE CAUGHT PROTECTION BEING OFF IN THE DEPLOYED DATABASE.
   *
   * `0017` set `is_protected` with a one-off UPDATE. `s04_gates_evidence.sql` opens by DELETING every
   * gate rule and rebuilding it, and `scripts/db.mjs` runs all migrations and then all seeds — so the
   * update happened before the rows it updated were replaced with `is_protected` back at its `false`
   * default. Measured before the fix: **zero** protected rules in the whole table, meaning a supervisor
   * could accept-with-deviation on the tunnel fill-height gate.
   *
   * The two tests above only catch it AFTER a seed run. This one catches the CAUSE, so the defect
   * cannot return by someone adding another seed that rebuilds gate rules.
   */
  it(
    'protection is DERIVED on write, so a seed that rebuilds gate rules cannot disarm it',
    async () => {
      await withRollback(async (db) => {
        const trg = await one<{ present: boolean }>(
          db,
          `select exists (
             select 1 from pg_trigger
              where tgrelid = 'public.gate_rule'::regclass
                and tgname = 'trg_gate_rule_protection'
                and not tgisinternal) as present`
        );
        expect(trg.present, 'nothing re-derives is_protected — a seed will switch it off again').toBe(
          true
        );

        // The seed's own pattern: delete the rule, put it back without mentioning protection.
        const gate = await one<{ id: string; process_activity_id: string; config: unknown }>(
          db,
          `select g.id, g.process_activity_id, g.config from gate_rule g
             join process_activity pa on pa.id = g.process_activity_id
            where pa.code = 'TN-LOAD' and g.kind = 'FIELD_IN_RANGE'
              and g.config->>'field_key' = 'fill_height_m'`
        );

        await db.query(
          `insert into gate_rule (process_activity_id, phase, kind, config,
                                  blocked_reason_template, mapping_confidence, ordering, is_protected)
           select process_activity_id, 'exit', kind, config, blocked_reason_template,
                  mapping_confidence, 99, false
             from gate_rule where id = $1`,
          [gate.id]
        );
        const rebuilt = await one<{ is_protected: boolean }>(
          db,
          `select is_protected from gate_rule
            where process_activity_id = $1 and ordering = 99`,
          [gate.process_activity_id]
        );
        // Inserted with `false` EXPLICITLY, and it comes back protected. That is the whole claim.
        expect(
          rebuilt.is_protected,
          'a rule inserted with is_protected = false stayed unprotected'
        ).toBe(true);

        // And it cannot be turned off afterwards either.
        await db.query(`update gate_rule set is_protected = false where id = $1`, [gate.id]);
        const after = await one<{ is_protected: boolean }>(
          db,
          `select is_protected from gate_rule where id = $1`,
          [gate.id]
        );
        expect(after.is_protected, 'a direct UPDATE disarmed a protected gate').toBe(true);

        // The predicate is inspectable, so "why is this gate protected?" has a readable answer, and
        // an unrelated gate is NOT protected — otherwise a trigger returning true always would pass.
        const unrelated = await one<{ protected: boolean }>(
          db,
          `select public.gate_rule_is_protected('FIB1-WEIGH', 'EVIDENCE_COMPLETE', '{}'::jsonb) as protected`
        );
        expect(unrelated.protected).toBe(false);
      });
    },
    60_000
  );
});

d('B2 · corrective actions are what resolve a deviation', () => {
  it(
    'doing the work is not the same claim as the work having worked',
    async () => {
      await withRollback(async (db) => {
        await asRole(db, 'operator');
        const batch = await createActiveBatch(db);
        const load = await firstLoad(db, batch);
        await submitOverweight(db, load.id);

        await asRole(db, 'supervisor');
        const dev = await one<{ id: string }>(
          db,
          `select id from deviation where batch_activity_id = $1`,
          [load.id]
        );
        const ca = await one<{ id: string }>(
          db,
          `select add_corrective_action($1, 'reweighed and corrected the load record') as id`,
          [dev.id]
        );

        // Recording the action alone must not close it.
        let row = await one<{ state: string }>(
          db,
          `select state::text from deviation where id = $1`,
          [dev.id]
        );
        expect(row.state).toBe('open');

        expect(await refuses(db, `select verify_corrective_action($1, '')`, [ca.id])).toMatch(
          /needs a note/i
        );

        await db.query(`select verify_corrective_action($1, 'reweigh came back at 2.05 MT')`, [
          ca.id,
        ]);
        row = await one<{ state: string }>(db, `select state::text from deviation where id = $1`, [
          dev.id,
        ]);
        expect(row.state).toBe('resolved');
      });
    },
    60_000
  );

  it('a verdict without an attributed decider is unwritable', async () => {
    await withRollback(async (db) => {
      await asRole(db, 'operator');
      const batch = await createActiveBatch(db);
      const load = await firstLoad(db, batch);
      await submitOverweight(db, load.id);
      const dev = await one<{ id: string }>(
        db,
        `select id from deviation where batch_activity_id = $1`,
        [load.id]
      );

      // The CHECK, not the RPC. A future writer cannot bypass it.
      const msg = await refuses(
        db,
        `update deviation set state = 'accepted' where id = $1`,
        [dev.id]
      );
      expect(msg).toMatch(/deviation_verdict_is_attributed/i);
    });
  }, 60_000);
});
