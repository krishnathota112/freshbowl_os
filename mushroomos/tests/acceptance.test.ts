/**
 * THE BACKEND ACCEPTANCE RUN — one batch, one journey, end to end.
 *
 * Every other suite proves one mechanism. This proves they compose: that a batch created by an
 * admin can actually be executed by an operator, tested by the laboratory, approved by the GM,
 * unblocked for the supervisor, delayed, extended, and read back by management with all five
 * numbers intact.
 *
 *     Admin      create → H0 → plan → activate
 *     Operator   start → server timestamp → photo → finish → photo
 *     Lab        test → result → evidence → submit
 *     GM         approve
 *     Gate       downstream blocked before · eligible after
 *     Delay      variance
 *     Extension  request → approve → authorised time
 *     Management plan · actual · variance · extension · forecast
 *
 * ── WHAT THIS RUN CAN AND CANNOT PROVE ──────────────────────────────────────
 *   It runs through `pg` inside one rolled-back transaction, adopting each role in turn. That is
 *   the right tool for proving the WORKFLOW composes, and the wrong one for proving AUTHORISATION:
 *   since 0058 `assert_role` exempts a BYPASSRLS session, so a refusal asserted here would be
 *   vacuous. Authorisation is proved over HTTP with real tokens in `roleEnforcement.test.ts`, and
 *   the real photograph — bytes into the bucket and back out again — in `evidence.test.ts`.
 *
 *   Said plainly rather than left implicit, because a green acceptance run that quietly proved
 *   less than it looked like is the exact failure this repository keeps finding.
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
  satisfyEvidence,
  withRollback,
  type Db,
} from './db';

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

const CODE = 'PROCESS-2026C';
const n = (v: unknown) => Number(v);
const MIN = 60_000;

describeDb('the backend acceptance run', () => {
  it('carries one batch from creation to the management story', async () => {
    await withRollback(async (db: Db) => {
      // ══ ADMIN · create → H0 → plan → activate ═══════════════════════════
      // H0 in the past, because this batch is going to be executed and an actual cannot precede
      // the clock it is measured on.
      const batch = await createActiveBatchOn(db, CODE, {
        startAt: '2026-09-01T05:00:00Z',
        startDate: '2026-09-01',
      });

      const created = await one<{
        code: string;
        status: string;
        start_at: Date;
        process_code: string;
        standard_hr: string;
        activity_count: string;
      }>(
        db,
        `select mb.code, mb.status::text as status, mb.start_at, pd.code as process_code,
                e.standard_hr,
                (select count(*)::text from batch_activity where master_batch_id = mb.id) as activity_count
           from master_batch mb
           join process_definition pd on pd.id = mb.process_definition_id
           join v_process_envelope e on e.process_definition_id = pd.id
          where mb.id = $1`,
        [batch]
      );
      expect(created.status, 'the baseline is activated and frozen').toBe('active');
      expect(created.process_code, 'planned against the standard it names').toBe(CODE);
      // 110 activities: 69 production + 41 laboratory. Both streams are in one plan.
      expect(n(created.activity_count)).toBeGreaterThan(100);
      // The plan is frozen — and the refusal must be the FREEZE, not the role. Asserted as the
      // admin who is otherwise entitled to regenerate a plan, because "an operator cannot" and
      // "nobody can once it is active" are different claims and only the second one is this.
      await actAs(db, 'admin');
      const frozen = await refuses(db, `select public.generate_activity_plan($1)`, [batch]);
      expect(frozen).toMatch(/frozen|cannot be regenerated/i);

      // ══ THE GATE, BEFORE ANYTHING ═══════════════════════════════════════
      // Bunker loading waits on LAB-BNK-PRE. Nothing has been tested, let alone approved.
      const bunkerLoad = await one<{ id: string }>(
        db,
        `select id from batch_activity where master_batch_id = $1 and code = 'FIB-BUNK-LOAD'`,
        [batch]
      );
      const gateBefore = await one<{ verdict: string; reason: string }>(
        db,
        `select verdict, reason from public.evaluate_gates($1, 'entry') where kind = 'LAB_APPROVED'`,
        [bunkerLoad.id]
      );
      expect(gateBefore.verdict, 'downstream is LOCKED before the laboratory approves').toBe('fail');
      expect(gateBefore.reason).toMatch(/waiting for laboratory approval/i);
      expect(gateBefore.reason).toMatch(/LAB-BNK-PRE/);

      // ══ OPERATOR · start → server timestamp → photo → finish → photo ════
      await actAs(db, 'operator');
      const task = await one<{ id: string; title: string; state: string }>(
        db,
        `select id, title, state::text as state from batch_activity
          where master_batch_id = $1 and code = 'FIB-WET-1'`,
        [batch]
      );

      await db.query(`select public.start_activity($1)`, [task.id]);
      const started = await one<{ state: string; actual_start: Date | null }>(
        db,
        `select state::text as state, actual_start from batch_activity where id = $1`,
        [task.id]
      );
      expect(started.state).toBe('IN_PROGRESS');
      // THE SERVER STAMPED IT. The operator sent no time and has no way to send one.
      expect(started.actual_start, 'the server records when work began').not.toBeNull();

      // Finishing without the photographs is refused, and the refusal names what is missing.
      const held = await one<{ new_state: string; outstanding_evidence: string | null }>(
        db,
        `select * from public.complete_activity($1)`,
        [task.id]
      );
      expect(held.new_state, 'evidence holds the submission').toBe('IN_PROGRESS');
      expect(held.outstanding_evidence).toMatch(/evidence item/i);

      // BEFORE and AFTER. Written as rows here; the real upload is proved in evidence.test.ts.
      await satisfyEvidence(db, task.id);
      const shots = await all<{ requirement_key: string }>(
        db,
        `select requirement_key from evidence_media where batch_activity_id = $1 order by 1`,
        [task.id]
      );
      expect(shots.map((s) => s.requirement_key)).toEqual(['AFTER_PHOTO', 'BEFORE_PHOTO']);

      const done = await one<{ new_state: string }>(
        db,
        `select * from public.complete_activity($1)`,
        [task.id]
      );
      expect(['COMPLETED', 'DEVIATION']).toContain(done.new_state);
      const finished = await one<{ actual_end: Date | null }>(
        db,
        `select actual_end from batch_activity where id = $1`,
        [task.id]
      );
      expect(finished.actual_end, 'the server records when work ended').not.toBeNull();

      // And it is history now — no path may restate it.
      const restate = await refuses(
        db,
        `update batch_activity set actual_end = now() - interval '5 hours' where id = $1`,
        [task.id]
      );
      expect(restate).toMatch(/correct_actual/);

      // ══ LAB · test → result → evidence → submit ═════════════════════════
      await actAs(db, 'lab_tech');
      const labTask = await one<{ id: string }>(
        db,
        `select id from batch_activity where master_batch_id = $1 and code = 'LAB-BNK-PRE'`,
        [batch]
      );
      const checkpoint = await one<{ id: string; parameters: string[] }>(
        db,
        `select id, parameters from lab_checkpoint
          where checkpoint_map = 'LAB_2026A' and code = 'LAB-BNK-PRE'`
      );

      await db.query(`select public.start_activity($1)`, [labTask.id]);
      const sample = await one<{ id: string }>(
        db,
        `select public.open_lab_sample($1, $2, 'Before bunker loading') as id`,
        [labTask.id, checkpoint.id]
      );
      // Every parameter the checkpoint names — read from the definition, not listed here.
      for (const p of checkpoint.parameters) {
        const t = await one<{ id: string }>(
          db,
          `select public.request_lab_test($1, $2, 'user') as id`,
          [sample.id, p]
        );
        await db.query(`select public.record_lab_result($1, 70.0)`, [t.id]);
      }
      const results = await all<{ parameter_code: string }>(
        db,
        `select t.parameter_code from lab_result r
           join lab_test t on t.id = r.test_id
          where t.sample_id = $1`,
        [sample.id]
      );
      expect(results.length, 'one reading per parameter the checkpoint names').toBe(
        checkpoint.parameters.length
      );

      await satisfyEvidence(db, labTask.id);
      // A SAMPLE_PHOTO, because that is what LAB-2026A asks for at this checkpoint — not a
      // before-and-after pair.
      const labShots = await all<{ requirement_key: string }>(
        db,
        `select requirement_key from evidence_media where batch_activity_id = $1`,
        [labTask.id]
      );
      expect(labShots.map((s) => s.requirement_key)).toEqual(['SAMPLE_PHOTO']);
      await db.query(`select * from public.complete_activity($1)`, [labTask.id]);

      // A RECORDED READING IS NOT AN APPROVED READING. The gate is still shut.
      const gateAfterSubmit = await one<{ verdict: string }>(
        db,
        `select verdict from public.evaluate_gates($1, 'entry') where kind = 'LAB_APPROVED'`,
        [bunkerLoad.id]
      );
      expect(gateAfterSubmit.verdict, 'submitting is not approving').toBe('fail');

      // ══ GM · approve ════════════════════════════════════════════════════
      await actAs(db, 'gm');
      await db.query(
        `select public.decide_lab_submission($1, 'approved', 'Moisture, pH and EC all within band')`,
        [labTask.id]
      );

      // ══ THE GATE, AFTER ═════════════════════════════════════════════════
      const gateAfter = await one<{ verdict: string }>(
        db,
        `select verdict from public.evaluate_gates($1, 'entry') where kind = 'LAB_APPROVED'`,
        [bunkerLoad.id]
      );
      expect(gateAfter.verdict, 'the approval opens the gate, and only the approval').toBe('pass');

      // ══ DELAY · VARIANCE ════════════════════════════════════════════════
      await actAs(db, 'supervisor');
      const late = await one<{ id: string; planned_start_at: Date; planned_end_at: Date }>(
        db,
        `select id, planned_start_at, planned_end_at from batch_activity
          where master_batch_id = $1 and code = 'FIB-HOP-2'`,
        [batch]
      );
      await db.query(
        `update batch_activity set actual_start = planned_start_at + interval '2 hours'
          where id = $1`,
        [late.id]
      );

      // ══ EXTENSION · request → approve → authorised time ═════════════════
      const req = await one<{ id: string }>(
        db,
        `select public.request_extension($1, 2, 'Hopper down; the fitter was called out') as id`,
        [late.id]
      );
      await actAs(db, 'manager');
      await db.query(
        `select public.manager_decide_extension($1, true, 'Downtime is on the machine log')`,
        [req.id]
      );
      await actAs(db, 'gm');
      await db.query(`select public.gm_decide_extension($1, true, 'Authorised')`, [req.id]);
      await db.query(
        `update batch_activity set actual_end = planned_end_at + interval '2 hours' where id = $1`,
        [late.id]
      );

      // ══ MANAGEMENT · plan · actual · variance · extension · forecast ════
      const story = await one<{
        planned_end_at: Date;
        approved_extension_hr: string;
        authorised_end_at: Date;
        actual_end: Date;
        original_variance_minutes: number;
        within_authorisation: boolean;
        projected_end_at: Date;
        forecast_basis: string;
      }>(
        db,
        `select planned_end_at, approved_extension_hr, authorised_end_at, actual_end,
                original_variance_minutes, within_authorisation, projected_end_at, forecast_basis
           from v_activity_forecast where activity_id = $1`,
        [late.id]
      );

      // THE PLAN DID NOT MOVE.
      expect(story.planned_end_at.getTime()).toBe(late.planned_end_at.getTime());
      // THE VARIANCE WAS NOT ERASED BY THE APPROVAL.
      expect(story.original_variance_minutes, 'two hours late, and it stays two hours late').toBe(120);
      // THE EXTENSION IS ITS OWN NUMBER, and the authorised end is a fourth.
      expect(n(story.approved_extension_hr)).toBe(2);
      expect(story.authorised_end_at.getTime()).toBe(story.planned_end_at.getTime() + 120 * MIN);
      expect(story.within_authorisation).toBe(true);
      // AND THE FORECAST, which for finished work is the actual and says so.
      expect(story.forecast_basis).toBe('finished');
      expect(story.projected_end_at.getTime()).toBe(story.actual_end.getTime());

      // The batch, at the level management reads it.
      const batchStory = await one<{
        process_code: string;
        standard_hr: string;
        planned_end_at: Date;
        authorised_end_at: Date;
        projected_end_at: Date | null;
        slip_minutes: number | null;
        forecast_basis: string;
      }>(
        db,
        `select process_code, standard_hr, planned_end_at, authorised_end_at, projected_end_at,
                slip_minutes, forecast_basis
           from v_batch_forecast where master_batch_id = $1`,
        [batch]
      );
      // Measured against ITS OWN process version's standard, never a constant.
      expect(batchStory.process_code).toBe(CODE);
      expect(batchStory.planned_end_at.getTime()).toBe(
        created.start_at.getTime() + n(batchStory.standard_hr) * 60 * MIN
      );
      // ⚠ THE BATCH SLIP IS NOT THE TWO HOURS I INTRODUCED, AND IT SHOULD NOT BE.
      //
      // `complete_activity` stamps the server's clock, and this fixture's H0 is 1 September while
      // the run happens later — so the operator's task genuinely finished days past its plan and
      // the batch's worst completed variance is that, not the deliberate delay. Asserting 120 here
      // was me assuming the only late thing was the one I made late.
      //
      // So the claim is stated against the data: the batch slip is the WORST completed variance,
      // and it is at least the delay that was introduced.
      const worst = await one<{ worst: number }>(
        db,
        `select max(variance_minutes) as worst from batch_activity
          where master_batch_id = $1 and actual_end is not null and planned_end_at is not null`,
        [batch]
      );
      expect(batchStory.slip_minutes, 'the batch carries the worst variance it actually has').toBe(
        worst.worst
      );
      expect(batchStory.slip_minutes!).toBeGreaterThanOrEqual(120);
      expect(batchStory.forecast_basis).toBe('projected');

      // The projection does NOT absorb the authorised extension. An authorised overrun is still
      // an overrun — the projection is the plan plus the measured slip, and nothing is forgiven.
      expect(batchStory.projected_end_at!.getTime()).toBe(
        batchStory.planned_end_at.getTime() + batchStory.slip_minutes! * MIN
      );
      expect(
        batchStory.projected_end_at!.getTime(),
        'the projection ignores the extension entirely'
      ).toBeGreaterThan(batchStory.authorised_end_at.getTime());

      // And the whole chain is answerable from one place: who, what, when, and what proved it.
      const trail = await all<{ action: string }>(
        db,
        `select distinct action from audit_event
          where entity_id in (select id::text from batch_activity where master_batch_id = $1)
          order by 1`,
        [batch]
      );
      for (const expected of ['start_activity', 'submit_activity', 'decide_lab_submission']) {
        expect(trail.map((t) => t.action), `${expected} is on the record`).toContain(expected);
      }
    });
  }, 120_000);
});
