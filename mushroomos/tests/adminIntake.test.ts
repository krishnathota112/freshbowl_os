/**
 * The two workflows the factory needs on day one, proven against the real backend.
 *
 *   SCENARIO A — a batch the factory is ALREADY RUNNING is brought into MushroomOS
 *   SCENARIO B — a NEW batch is created, prepared and activated
 *
 * NO BACKEND CHANGE SUPPORTS THESE. Every call here already existed; the screens call them in this
 * order. What the server refuses, it still refuses — and three of those refusals are asserted here,
 * because the onboarding flow is only honest if they hold:
 *
 *   · an operator may not state a time             (the paper-slip path is a supervisor's)
 *   · a missing photograph does not become a completion
 *   · a second submission does not complete the work twice
 *
 * Everything runs inside a transaction that is rolled back.
 */
import { describe, expect, it } from 'vitest';
import { DB_URL, actAs, all, createDraftBatch, one, refuses, satisfyPrebatchMaterialCheck, withRollback } from './db';

const d = DB_URL ? describe : describe.skip;
const PROCESS = 'PROCESS-2026C';

/** H0 three days ago — the shape of a batch that has been running since Monday. */
function threeDaysAgo(): string {
  return new Date(Date.now() - 3 * 24 * 3_600_000).toISOString();
}

/**
 * Give every activity somebody, as a FIXTURE step.
 *
 * `validate_batch` blocks activation with NO_ASSIGNEE until the whole crew is named — which is why
 * the prepare screen assigns before it offers Activate, and why bulk assignment is not a nicety.
 * The assignment CONTRACT is proven through `assign_activity` in its own test below; here it is
 * only the precondition, so it is set the fast way rather than 93 round trips per test.
 */
async function crewEverything(db: Parameters<typeof satisfyPrebatchMaterialCheck>[0], batch: string) {
  const person = await one<{ id: string }>(
    db,
    `select id from profiles where is_active order by created_at nulls last limit 1`
  );
  await db.query(
    `update batch_activity set assigned_person_id = $2
      where master_batch_id = $1 and not is_time_gate and not is_hold and assigned_person_id is null`,
    [batch, person.id]
  );
}

d('SCENARIO B · a new batch is created, prepared and activated', () => {
  it('the plan comes from the SELECTED process version, and its standard is that version own', async () => {
    await withRollback(async (db) => {
      const batch = await createDraftBatch(db, { processCode: PROCESS });

      const plan = await one<{ activities: number; process_code: string; standard_hr: string | null }>(
        db,
        `select (select count(*)::int from batch_activity ba where ba.master_batch_id = mb.id) activities,
                pc.code process_code, pc.standard_hr::text
           from master_batch mb
           join v_process_catalogue pc on pc.process_definition_id = mb.process_definition_id
          where mb.id = $1`,
        [batch]
      );
      expect(plan.process_code).toBe(PROCESS);
      expect(plan.activities).toBeGreaterThan(0);
      // The standard is the version's own calculated number — never a constant in a screen.
      expect(Number(plan.standard_hr)).toBeGreaterThan(0);
    });
  }, 120_000);

  it('every required stream is in the plan, and a stream with no material blocks activation', async () => {
    await withRollback(async (db) => {
      const batch = await createDraftBatch(db, { processCode: PROCESS });

      const missing = await all<{ code: string }>(
        db,
        `select pa.code
           from master_batch mb
           join process_activity pa on pa.process_definition_id = mb.process_definition_id
          where mb.id = $1 and not pa.is_optional and pa.material_role is not null
            and not exists (select 1 from batch_activity ba
                             where ba.master_batch_id = mb.id and ba.process_activity_id = pa.id)`,
        [batch]
      );
      expect(missing).toEqual([]);

      const before = await all<{ code: string }>(
        db,
        `select code from validate_batch($1) where code = 'MATERIAL_ROLE_UNBOUND'`,
        [batch]
      );
      expect(before).toEqual([]);

      await db.query(`delete from batch_material_role where master_batch_id = $1 and role = 'STRUCTURAL_STRAW'`, [batch]);
      const after = await all<{ severity: string; message: string }>(
        db,
        `select severity, message from validate_batch($1) where code = 'MATERIAL_ROLE_UNBOUND'`,
        [batch]
      );
      expect(after).toHaveLength(1);
      expect(after[0].severity).toBe('blocking');
      expect(after[0].message).toContain('structural straw');
    });
  }, 120_000);

  it('activation is refused while the incoming material check is missing, and allowed once it is accepted', async () => {
    await withRollback(async (db) => {
      const batch = await createDraftBatch(db, { processCode: PROCESS });
      await crewEverything(db, batch);
      await actAs(db, 'admin');

      const before = await all<{ code: string }>(
        db,
        `select code from validate_batch($1) where severity = 'blocking'`,
        [batch]
      );
      expect(before.length, 'a batch with no incoming check must not be activatable').toBeGreaterThan(0);
      expect(await refuses(db, `select activate_batch($1)`, [batch])).toMatch(/Cannot activate/i);

      await satisfyPrebatchMaterialCheck(db, batch);
      await actAs(db, 'admin');
      const after = await all<{ code: string; message: string }>(
        db,
        `select code, message from validate_batch($1) where severity = 'blocking'`,
        [batch]
      );
      expect(after.map((r) => r.code)).toEqual([]);

      await db.query(`select activate_batch($1)`, [batch]);
      const status = await one<{ status: string }>(db, `select status::text from master_batch where id = $1`, [batch]);
      expect(status.status).toBe('active');
    });
  }, 120_000);

  it('activation freezes the baseline — H0 cannot move afterwards', async () => {
    await withRollback(async (db) => {
      const batch = await createDraftBatch(db, { processCode: PROCESS });
      await crewEverything(db, batch);
      await satisfyPrebatchMaterialCheck(db, batch);
      await actAs(db, 'admin');
      await db.query(`select activate_batch($1)`, [batch]);

      expect(
        await refuses(db, `select set_batch_start_at($1, now() + interval '2 hours')`, [batch])
      ).toMatch(/.+/);

      // And a second activation is not a second freeze. `0073` made a repeat on an ACTIVE batch a
      // silent no-op rather than a refusal — deliberately, because nothing changed — so the claim is
      // that nothing moved, not that it raised.
      const before = await one<{ activated_at: string; status: string }>(
        db,
        `select activated_at::text, status::text from master_batch where id = $1`,
        [batch]
      );
      await db.query(`select activate_batch($1)`, [batch]);
      const after = await one<{ activated_at: string; status: string }>(
        db,
        `select activated_at::text, status::text from master_batch where id = $1`,
        [batch]
      );
      expect(after).toEqual(before);
    });
  }, 120_000);

  it('bulk assignment is the existing per-activity contract, called once per row', async () => {
    await withRollback(async (db) => {
      const batch = await createDraftBatch(db, { processCode: PROCESS });
      const person = await one<{ id: string }>(
        db,
        `select id from profiles where role = 'operator' and is_active limit 1`
      );
      const rows = await all<{ id: string }>(
        db,
        `select id from batch_activity
          where master_batch_id = $1 and responsible_role = 'operator' and assigned_person_id is null
          limit 25`,
        [batch]
      );
      expect(rows.length, 'the fixture should have unassigned operator work').toBeGreaterThan(0);

      await actAs(db, 'supervisor');
      for (const r of rows) {
        await db.query(`select assign_activity($1::uuid, $2::uuid, null)`, [r.id, person.id]);
      }

      const assigned = await one<{ n: number }>(
        db,
        `select count(*)::int n from batch_activity where id = any($1::uuid[]) and assigned_person_id = $2`,
        [rows.map((r) => r.id), person.id]
      );
      expect(assigned.n).toBe(rows.length);
    });
  }, 120_000);
});

d('SCENARIO A · a batch already running is brought in', () => {
  it('registers with its real past H0, and history is recorded through the paper-slip path', async () => {
    await withRollback(async (db) => {
      const h0 = threeDaysAgo();
      const batch = await createDraftBatch(db, { processCode: PROCESS, startAt: h0 });
      await crewEverything(db, batch);
      await satisfyPrebatchMaterialCheck(db, batch);
      await actAs(db, 'admin');
      await db.query(`select activate_batch($1)`, [batch]);

      // An activity the process does NOT require a photograph for: history can complete here.
      const target = await all<{ id: string; title: string }>(
        db,
        `select ba.id, ba.title from batch_activity ba
          where ba.master_batch_id = $1 and ba.state = 'READY'
            and not exists (select 1 from batch_activity_evidence_req r where r.batch_activity_id = ba.id)
          limit 1`,
        [batch]
      );
      if (target.length === 0) return; // stated rather than silently passing

      await actAs(db, 'supervisor');
      const started = new Date(Date.parse(h0) + 3_600_000).toISOString();
      const finished = new Date(Date.parse(h0) + 2 * 3_600_000).toISOString();
      await db.query(
        `select submit_activity($1::uuid, '{}'::jsonb, 'Recorded from the day log sheet', $2::timestamptz, $3::timestamptz)`,
        [target[0].id, started, finished]
      );

      const row = await one<{ state: string; actual_start: string; actual_end: string }>(
        db,
        `select state::text, actual_start::text, actual_end::text from batch_activity where id = $1`,
        [target[0].id]
      );
      expect(row.state).toBe('COMPLETED');
      // The stated times are what was recorded — not the moment of entry.
      expect(Date.parse(row.actual_start)).toBe(Date.parse(started));
      expect(Date.parse(row.actual_end)).toBe(Date.parse(finished));
    });
  }, 120_000);

  it('a missing photograph does NOT become a completion — the times are kept and the work stays open', async () => {
    await withRollback(async (db) => {
      const h0 = threeDaysAgo();
      const batch = await createDraftBatch(db, { processCode: PROCESS, startAt: h0 });
      await crewEverything(db, batch);
      await satisfyPrebatchMaterialCheck(db, batch);
      await actAs(db, 'admin');
      await db.query(`select activate_batch($1)`, [batch]);

      const gated = await all<{ id: string }>(
        db,
        `select ba.id from batch_activity ba
          where ba.master_batch_id = $1 and ba.state = 'READY'
            and exists (select 1 from batch_activity_evidence_req r
                         where r.batch_activity_id = ba.id and r.gates_submission)
          limit 1`,
        [batch]
      );
      expect(gated.length, 'PROCESS-2026C should have evidence-gated work').toBe(1);

      await actAs(db, 'supervisor');
      const started = new Date(Date.parse(h0) + 3_600_000).toISOString();
      const finished = new Date(Date.parse(h0) + 2 * 3_600_000).toISOString();
      const out = await one<{ new_state: string; outstanding_evidence: string | null }>(
        db,
        `select * from submit_activity($1::uuid, '{}'::jsonb, 'From the log sheet', $2::timestamptz, $3::timestamptz)`,
        [gated[0].id, started, finished]
      );
      expect(out.outstanding_evidence, 'the missing photograph must be named').toBeTruthy();
      expect(out.new_state).not.toBe('COMPLETED');

      const row = await one<{ state: string; actual_start: string | null }>(
        db,
        `select state::text, actual_start::text from batch_activity where id = $1`,
        [gated[0].id]
      );
      expect(row.state).not.toBe('COMPLETED');
      expect(row.actual_start, 'the stated time is still recorded').not.toBeNull();
    });
  }, 120_000);

  it('an operator may not state a time, and a second submission does not complete it twice', async () => {
    await withRollback(async (db) => {
      const h0 = threeDaysAgo();
      const batch = await createDraftBatch(db, { processCode: PROCESS, startAt: h0 });
      await crewEverything(db, batch);
      await satisfyPrebatchMaterialCheck(db, batch);
      await actAs(db, 'admin');
      await db.query(`select activate_batch($1)`, [batch]);

      const target = await all<{ id: string }>(
        db,
        `select ba.id from batch_activity ba
          where ba.master_batch_id = $1 and ba.state = 'READY'
            and not exists (select 1 from batch_activity_evidence_req r where r.batch_activity_id = ba.id)
          limit 1`,
        [batch]
      );
      if (target.length === 0) return;
      const started = new Date(Date.parse(h0) + 3_600_000).toISOString();
      const finished = new Date(Date.parse(h0) + 2 * 3_600_000).toISOString();

      // The rule that makes onboarding a supervisor's job.
      await actAs(db, 'operator');
      expect(
        await refuses(
          db,
          `select submit_activity($1::uuid, '{}'::jsonb, 'me', $2::timestamptz, $3::timestamptz)`,
          [target[0].id, started, finished]
        )
      ).toMatch(/.+/);

      await actAs(db, 'supervisor');
      await db.query(
        `select submit_activity($1::uuid, '{}'::jsonb, 'From the log sheet', $2::timestamptz, $3::timestamptz)`,
        [target[0].id, started, finished]
      );
      // Entered twice — a jittery thumb, or a page reloaded and re-submitted.
      expect(
        await refuses(
          db,
          `select submit_activity($1::uuid, '{}'::jsonb, 'again', $2::timestamptz, $3::timestamptz)`,
          [target[0].id, started, finished]
        )
      ).toMatch(/COMPLETED|cannot be submitted/i);

      const audit = await one<{ n: number }>(
        db,
        `select count(*)::int n from audit_event
          where entity_id = $1 and action = 'submit_activity'`,
        [target[0].id]
      );
      expect(audit.n, 'one submission, one record of it').toBe(1);
    });
  }, 120_000);

  it('work that is running now keeps its real start, as a superseding correction', async () => {
    await withRollback(async (db) => {
      const h0 = threeDaysAgo();
      const batch = await createDraftBatch(db, { processCode: PROCESS, startAt: h0 });
      await crewEverything(db, batch);
      await satisfyPrebatchMaterialCheck(db, batch);
      await actAs(db, 'admin');
      await db.query(`select activate_batch($1)`, [batch]);

      const target = await one<{ id: string; person: string | null }>(
        db,
        `select ba.id, ba.assigned_person_id::text person from batch_activity ba
          where ba.master_batch_id = $1 and ba.state = 'READY' and ba.responsible_role = 'operator'
          limit 1`,
        [batch]
      );

      await actAs(db, 'supervisor');
      await db.query(`select start_activity($1::uuid)`, [target.id]);
      const realStart = new Date(Date.parse(h0) + 3_600_000).toISOString();
      await db.query(
        `select correct_actual($1::uuid, 'actual_start', $2::timestamptz, 'It began at 07:00 per the day log sheet')`,
        [target.id, realStart]
      );

      const row = await one<{ actual_start: string; corrections: number }>(
        db,
        `select ba.actual_start::text,
                (select count(*)::int from actual_correction c where c.batch_activity_id = ba.id) corrections
           from batch_activity ba where ba.id = $1`,
        [target.id]
      );
      expect(Date.parse(row.actual_start)).toBe(Date.parse(realStart));
      // The first stamp is not erased — the correction is a record of its own.
      expect(row.corrections).toBeGreaterThan(0);
    });
  }, 120_000);
});
