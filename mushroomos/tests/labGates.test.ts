/**
 * B4 — a laboratory gate holds production until an APPROVED result exists.
 *
 *     LAB TEST → RESULT → EVIDENCE → SUBMIT → APPROVAL → GATE PASSES → DOWNSTREAM ELIGIBLE
 *
 * The claim under test is the one sentence LAB-2026A turns on: **an entered result is not an
 * approved result.** A reading somebody typed unlocks nothing. And the lock is the SERVER'S — the
 * assertions here call `evaluate_gates` directly, never a screen, because "the frontend disables
 * the button" is not a gate.
 *
 * Nothing here names a checkpoint the database does not already bind. The set of gates comes from
 * `v_lab_gate`, so a fifth gate added to LAB-2026A is covered by these tests without editing them.
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
  refuses,
  withRollback,
  type Db,
} from './db';

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

const CODE = 'PROCESS-2026C';

/** The entry verdict on one production activity's laboratory gate. */
async function labGate(db: Db, batch: string, activityCode: string) {
  const a = await one<{ id: string }>(
    db,
    `select id from batch_activity where master_batch_id = $1 and code = $2`,
    [batch, activityCode]
  );
  return one<{ verdict: string; reason: string }>(
    db,
    `select verdict, reason from public.evaluate_gates($1, 'entry') where kind = 'LAB_APPROVED'`,
    [a.id]
  );
}

/**
 * Take one laboratory activity all the way to an approval.
 *
 * Through `decide_lab_submission`, which is the real approval path with the real C-32 role model —
 * not by writing a `lab_decision` row, which would prove the gate reads a table rather than that
 * the workflow reaches it.
 */
async function approveLab(db: Db, batch: string, labActivityCode: string, verdict = 'approved') {
  const a = await one<{ id: string }>(
    db,
    `select id from batch_activity where master_batch_id = $1 and code = $2`,
    [batch, labActivityCode]
  );
  // C-32 is open — both readings stand — so either named role may decide and the row records
  // which reading authorised it.
  await actAs(db, 'gm');
  await db.query(`select public.decide_lab_submission($1, $2, $3)`, [
    a.id,
    verdict,
    verdict === 'approved'
      ? 'Readings within band, evidence complete'
      : 'Moisture outside the band; resample before proceeding',
  ]);
  return a.id;
}

describeDb('the gates LAB-2026A describes are the gates the database enforces', () => {
  it('four gates, each bound to the production it holds', async () => {
    await withRollback(async (db: Db) => {
      const gates = await all<{
        checkpoint_code: string;
        blocks_activity_code: string;
        rule_exists: boolean;
      }>(
        db,
        `select checkpoint_code, blocks_activity_code, rule_exists
           from v_lab_gate where process_code = $1 and kind = 'GATE'
          order by checkpoint_code, blocks_activity_code`,
        [CODE]
      );

      // LAB-2026A: 25 checkpoints, FOUR of them gates.
      expect(new Set(gates.map((g) => g.checkpoint_code)).size).toBe(4);
      // Every one of them actually blocks something, and carries a rule that will be evaluated.
      for (const g of gates) {
        expect(g.blocks_activity_code, `${g.checkpoint_code} blocks nothing`).toBeTruthy();
        expect(g.rule_exists, `${g.checkpoint_code} is described but not enforced`).toBe(true);
      }

      // The per-bunker gates hold their own bunker, not all three.
      const bnk = gates.filter((g) => g.checkpoint_code === 'LAB-BNK-LOAD');
      expect(bnk.map((g) => g.blocks_activity_code).sort()).toEqual([
        'BNK-B1-FILL',
        'BNK-B2-FILL',
        'BNK-B3-FILL',
      ]);
    });
  });

  it('the DECISION is not a gate, and must never become one', async () => {
    await withRollback(async (db: Db) => {
      const dec = await all<{ checkpoint_code: string; rule_exists: boolean }>(
        db,
        `select checkpoint_code, rule_exists from v_lab_gate
          where process_code = $1 and kind = 'DECISION'`,
        [CODE]
      );
      expect(dec.length).toBe(1);
      // LAB-MOIST-DEC branches the process — >=68 % proceed, <67 % controlled mist — and the
      // 67-68 % band is UNRESOLVED. "Build no gate on any of them."
      expect(dec[0].rule_exists, 'a gate on an unresolved band would be a rule nobody stated')
        .toBe(false);
    });
  });
});

describeDb('an entered result is not an approved result', () => {
  it('production is BLOCKED before the laboratory has approved', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);

      const g = await labGate(db, batch, 'FIB-BUNK-LOAD');
      expect(g.verdict).toBe('fail');
      // A refusal must name what to do instead — which checkpoint, and how far along it is.
      expect(g.reason).toMatch(/waiting for laboratory approval/i);
      expect(g.reason).toMatch(/LAB-BNK-PRE/);
      expect(g.reason).toMatch(/0 of 1 approved/);
    });
  });

  it('recording a reading does NOT open the gate', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);

      // The technician does the work: sample, test, result. Everything except the approval.
      const labAct = await one<{ id: string }>(
        db,
        `select id from batch_activity where master_batch_id = $1 and code = 'LAB-BNK-PRE'`,
        [batch]
      );
      const cp = await one<{ id: string }>(
        db,
        `select id from lab_checkpoint where checkpoint_map = 'LAB_2026A' and code = 'LAB-BNK-PRE'`
      );
      await actAs(db, 'lab_tech');
      const sample = await one<{ id: string }>(
        db,
        `select public.open_lab_sample($1, $2, 'Bunker pre-load sample') as id`,
        [labAct.id, cp.id]
      );
      const test = await one<{ id: string }>(
        db,
        `select public.request_lab_test($1, 'moisture_pct', 'user') as id`,
        [sample.id]
      );
      await db.query(`select public.record_lab_result($1, 70.5)`, [test.id]);

      // The reading exists. The gate is still shut, and that is the whole point of LAB-2026A.
      const g = await labGate(db, batch, 'FIB-BUNK-LOAD');
      expect(g.verdict, 'a recorded reading is not an approval').toBe('fail');
    });
  });

  it('an APPROVED submission opens it', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);
      expect((await labGate(db, batch, 'FIB-BUNK-LOAD')).verdict).toBe('fail');

      await approveLab(db, batch, 'LAB-BNK-PRE');

      const g = await labGate(db, batch, 'FIB-BUNK-LOAD');
      expect(g.verdict).toBe('pass');
    });
  });

  it('a REJECTED submission does not', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);
      await approveLab(db, batch, 'LAB-BNK-PRE', 'rejected');

      const g = await labGate(db, batch, 'FIB-BUNK-LOAD');
      expect(g.verdict, 'a decision is not the same as an approval').toBe('fail');
    });
  });

  it('the LATEST decision governs — a rejection after an approval shuts it again', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);

      await approveLab(db, batch, 'LAB-BNK-PRE');
      expect((await labGate(db, batch, 'FIB-BUNK-LOAD')).verdict).toBe('pass');

      await approveLab(db, batch, 'LAB-BNK-PRE', 'rejected');
      expect((await labGate(db, batch, 'FIB-BUNK-LOAD')).verdict).toBe('fail');

      // And both decisions are on the record. An approval that vanished when it was superseded
      // would leave nobody able to say who opened the gate the first time.
      const decisions = await all<{ verdict: string }>(
        db,
        `select d.verdict from lab_decision d
           join batch_activity ba on ba.id = d.batch_activity_id
          where ba.master_batch_id = $1 and ba.code = 'LAB-BNK-PRE'
          order by d.seq`,
        [batch]
      );
      expect(decisions.map((d) => d.verdict)).toEqual(['approved', 'rejected']);
    });
  });

  it('each bunker waits on its OWN assay', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);

      await approveLab(db, batch, 'LAB-BNK-LOAD-B1');

      expect((await labGate(db, batch, 'BNK-B1-FILL')).verdict).toBe('pass');
      // "P1+P2 → B1 · P3+P4 → B2 · P5+P6 → B3", and each fill is gated on its own bunker's
      // reading. One approval must not open three bunkers.
      expect((await labGate(db, batch, 'BNK-B2-FILL')).verdict).toBe('fail');
      expect((await labGate(db, batch, 'BNK-B3-FILL')).verdict).toBe('fail');
    });
  });

  it('every gate in the set blocks its own activity before anything is approved', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);

      // Read the gates from the database rather than listing them here, so a checkpoint added to
      // LAB-2026A is covered by this test the day it is seeded.
      const held = await all<{ blocks_activity_code: string; checkpoint_code: string }>(
        db,
        `select distinct blocks_activity_code, checkpoint_code
           from v_lab_gate where process_code = $1 and kind = 'GATE' and rule_exists`,
        [CODE]
      );
      expect(held.length).toBe(8);

      for (const h of held) {
        const g = await labGate(db, batch, h.blocks_activity_code);
        expect(g.verdict, `${h.checkpoint_code} does not hold ${h.blocks_activity_code}`).toBe('fail');
      }
    });
  });
});

describeDb('who may approve is the server’s decision', () => {
  it('an operator cannot approve a laboratory submission', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);
      const a = await one<{ id: string }>(
        db,
        `select id from batch_activity where master_batch_id = $1 and code = 'LAB-BNK-PRE'`,
        [batch]
      );

      await actAs(db, 'operator');
      const message = await refuses(
        db,
        `select public.decide_lab_submission($1, 'approved', 'looks fine to me')`,
        [a.id]
      );
      expect(message).toMatch(/may not decide a lab submission/i);
      // C-32 is open, so the refusal names both readings rather than pretending one was chosen.
      expect(message).toMatch(/gm|supervisor/i);
    });
  });

  it('an approval needs a stated reason', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);
      const a = await one<{ id: string }>(
        db,
        `select id from batch_activity where master_batch_id = $1 and code = 'LAB-BNK-PRE'`,
        [batch]
      );

      await actAs(db, 'gm');
      const message = await refuses(
        db,
        `select public.decide_lab_submission($1, 'approved', '   ')`,
        [a.id]
      );
      expect(message).toMatch(/needs a stated reason/i);
    });
  });

  it('a production activity cannot be approved as though it were a lab submission', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);
      const a = await one<{ id: string }>(
        db,
        `select id from batch_activity where master_batch_id = $1 and code = 'FIB-BUNK-LOAD'`,
        [batch]
      );

      await actAs(db, 'gm');
      // The shortest route to opening a lab gate would be to approve the thing the gate protects.
      const message = await refuses(
        db,
        `select public.decide_lab_submission($1, 'approved', 'approving the production step')`,
        [a.id]
      );
      expect(message).toMatch(/not a lab activity/i);

      expect((await labGate(db, batch, 'FIB-BUNK-LOAD')).verdict).toBe('fail');
    });
  });
});
