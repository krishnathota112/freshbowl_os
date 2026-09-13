/**
 * UI-001 — the exact server chain the Lab workstation calls, as a real lab technician.
 *
 *   start_activity (twice) → open_lab_sample at the BOUND checkpoint → request_lab_test per
 *   parameter → record_lab_result → complete_activity (held: the photograph is missing)
 *   → decide_lab_submission (refused: a technician never decides a lab submission)
 *
 * The screen decides none of this; this file proves the server does, in the order the screen asks.
 * Everything runs inside a rolled-back transaction on a READY lab activity of an active batch.
 * Photographs are not bound here — real bytes in storage are not transactional; that path is proven
 * by `evidence.test.ts` and on the device.
 */
import { describe, expect, it } from 'vitest';
import { DB_URL, all, one, refuses, withRollback } from './db';

const d = DB_URL ? describe : describe.skip;

d('UI-001 · the lab workstation chain, as a lab technician', () => {
  it('start → sample at the bound checkpoint → readings → submit held until the photo → no self-approval', async () => {
    await withRollback(async (db) => {
      const found = await all<{ id: string; tech: string; pa: string; params: string[] }>(
        db,
        `select ba.id, ba.assigned_person_id::text tech, ba.process_activity_id::text pa, ba.lab_parameters params
           from batch_activity ba
           join master_batch mb on mb.id = ba.master_batch_id
           join profiles p on p.id = ba.assigned_person_id and p.role = 'lab_tech'
          where mb.status = 'active' and ba.responsible_role = 'lab_tech' and ba.state = 'READY'
            and cardinality(ba.lab_parameters) > 0
            and exists (select 1 from lab_checkpoint_activity l where l.process_activity_id = ba.process_activity_id)
            and exists (select 1 from batch_activity_evidence_req r where r.batch_activity_id = ba.id and r.gates_submission)
          order by ba.planned_start_at nulls last
          limit 1`
      );
      expect(found.length, 'no READY, assigned lab activity with a required photo on an active batch').toBe(1);
      const act = found[0];

      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: act.tech, role: 'authenticated', app_metadata: { app_role: 'lab_tech' } }),
      ]);

      // The checkpoint the screen uses: the activity's own binding.
      const cp = await one<{ id: string }>(
        db,
        `select c.id from lab_checkpoint c
           join lab_checkpoint_activity l on l.checkpoint_code = c.code and l.checkpoint_map = c.checkpoint_map
          where l.process_activity_id = $1 limit 1`,
        [act.pa]
      );

      await db.query(`select start_activity($1::uuid)`, [act.id]);
      await db.query(`select start_activity($1::uuid)`, [act.id]); // a second tap changes nothing
      const started = await one<{ state: string; starts: number }>(
        db,
        `select ba.state::text,
                (select count(*)::int from audit_event e
                  where e.entity_id = ba.id::text and e.action = 'start_activity') starts
           from batch_activity ba where ba.id = $1`,
        [act.id]
      );
      expect(started.state).toBe('IN_PROGRESS');
      expect(started.starts).toBe(1);

      const sample = (await one<{ s: string }>(db, `select open_lab_sample($1::uuid, $2::uuid) s`, [act.id, cp.id])).s;
      for (const p of act.params) await db.query(`select request_lab_test($1::uuid, $2)`, [sample, p]);
      const tests = await all<{ id: string }>(db, `select id from lab_test where sample_id = $1`, [sample]);
      expect(tests.length).toBe(act.params.length);
      for (const t of tests) await db.query(`select record_lab_result($1::uuid, 50::numeric)`, [t.id]);

      // Submit with the photograph missing: held or refused, and it names what is missing.
      await db.query('savepoint submit_probe');
      let said: string;
      try {
        const r = await one<{ new_state: string; outstanding_evidence: string | null }>(
          db,
          `select * from complete_activity($1::uuid, '{}'::jsonb, null)`,
          [act.id]
        );
        said = r.outstanding_evidence ?? `finished as ${r.new_state}`;
        await db.query('release savepoint submit_probe');
      } catch (e) {
        await db.query('rollback to savepoint submit_probe');
        said = (e as Error).message;
      }
      expect(said).toMatch(/photo/i);
      const after = await one<{ state: string }>(db, `select state::text from batch_activity where id = $1`, [act.id]);
      expect(after.state).not.toBe('COMPLETED');

      // And the technician can never decide it.
      expect(
        await refuses(db, `select decide_lab_submission($1::uuid, 'approved', 'my own work looks fine')`, [act.id])
      ).toMatch(/.+/);
    });
  }, 120_000);

  it('a checkpoint the activity is not bound to is refused — the reason the screen does not offer one', async () => {
    await withRollback(async (db) => {
      const act = await one<{ id: string; tech: string; pa: string }>(
        db,
        `select ba.id, ba.assigned_person_id::text tech, ba.process_activity_id::text pa
           from batch_activity ba join master_batch mb on mb.id = ba.master_batch_id
           join profiles p on p.id = ba.assigned_person_id and p.role = 'lab_tech'
          where mb.status = 'active' and ba.responsible_role = 'lab_tech' and ba.state = 'READY'
            and exists (select 1 from lab_checkpoint_activity l where l.process_activity_id = ba.process_activity_id)
          limit 1`
      );
      const wrong = await one<{ id: string }>(
        db,
        `select c.id from lab_checkpoint c
          where c.checkpoint_map in (select l.checkpoint_map from lab_checkpoint_activity l where l.process_activity_id = $1)
            and c.code not in (select l.checkpoint_code from lab_checkpoint_activity l where l.process_activity_id = $1)
          limit 1`,
        [act.pa]
      );
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: act.tech, role: 'authenticated', app_metadata: { app_role: 'lab_tech' } }),
      ]);
      expect(await refuses(db, `select open_lab_sample($1::uuid, $2::uuid)`, [act.id, wrong.id])).toMatch(
        /is not a checkpoint of/
      );
    });
  }, 120_000);
});
