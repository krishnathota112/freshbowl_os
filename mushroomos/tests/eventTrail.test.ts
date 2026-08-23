/**
 * B3 — the event trail.  Migration `0018_event_trail.sql`.
 *
 * Two questions this suite exists to answer:
 *
 *   1. Can a governance change happen SILENTLY? (role, process, gate, H0, the conflict register)
 *   2. Does the record say why a gate opened, on the one transition class no person performs?
 *
 * The second is the interesting one. A gate opening has no human actor — that is the entire point
 * of a server-authoritative gate — so `actor_id` is null by design, and `server_decided`
 * distinguishes that from missing data.
 */

import { describe, expect, it } from 'vitest';
import { DB_URL, all, createActiveBatch, one, refuses, withRollback, type Db } from './db';

const d = DB_URL ? describe : describe.skip;

const auditCount = async (db: Db) =>
  Number((await one<{ n: number }>(db, `select count(*)::int n from audit_event`)).n);

d('B3 · a governance change cannot happen silently', () => {
  it('the trigger is attached to every governance table, and to no execution table', async () => {
    await withRollback(async (db) => {
      const rows = await all<{ table_name: string }>(
        db,
        `select distinct c.relname as table_name
           from pg_trigger t
           join pg_class c on c.oid = t.tgrelid
           join pg_proc p on p.oid = t.tgfoid
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and p.proname = 'fn_audit' and not t.tgisinternal
          order by 1`
      );
      const attached = rows.map((r) => r.table_name);

      expect(attached).toEqual([
        'activity_field',
        'conflict_register',
        'evidence_requirement',
        'factory_clock',
        'gate_rule',
        'master_batch',
        'process_activity',
        'process_definition',
        'profiles',
      ]);

      // Deliberately absent. These carry hundreds of transitions per batch and every one is
      // already covered by a semantic event that says WHY. A row trigger here would bury the
      // trail it was meant to complete. 0018 header.
      expect(attached).not.toContain('batch_activity');
      expect(attached).not.toContain('batch_activity_value');
      expect(attached).not.toContain('audit_event');
    });
  }, 30_000);

  it('a role change is recorded with both states', async () => {
    await withRollback(async (db) => {
      const who = await one<{ id: string; role: string }>(
        db,
        `select id, role::text from profiles where role = 'operator' limit 1`
      );
      await db.query(`update profiles set role = 'supervisor' where id = $1`, [who.id]);

      const ev = await one<{ action: string; before_state: any; after_state: any }>(
        db,
        `select action, before_state, after_state from audit_event
          where entity_table = 'profiles' and entity_id = $1
          order by id desc limit 1`,
        [who.id]
      );
      expect(ev.action).toBe('UPDATE');
      expect(ev.before_state.role).toBe('operator');
      expect(ev.after_state.role).toBe('supervisor');
    });
  }, 30_000);

  it('an update that changes nothing writes nothing', async () => {
    // The seeds are idempotent and re-run `on conflict do update` with identical values on every
    // `db:seed`. Without the `is distinct from` guard each run would write ~130 rows saying
    // nothing happened, and the noise would be indistinguishable from real edits.
    await withRollback(async (db) => {
      const before = await auditCount(db);
      await db.query(`update process_activity set label_template = label_template`);
      expect(await auditCount(db)).toBe(before);

      // And a real edit on the same table still lands.
      await db.query(
        `update process_activity set golden_rule = 'probe'
          where code = 'FIB1-WEIGH' and golden_rule is distinct from 'probe'`
      );
      expect(await auditCount(db)).toBeGreaterThan(before);
    });
  }, 30_000);

  it('the conflict register is audited despite keying on conflict_id, not id', async () => {
    await withRollback(async (db) => {
      await db.query(`update conflict_register set status = 'decided' where conflict_id = 'C-01'`);
      const ev = await one<{ entity_id: string }>(
        db,
        `select entity_id from audit_event
          where entity_table = 'conflict_register' order by id desc limit 1`
      );
      // The 0001 function hard-coded `new.id` and would have written '(unkeyed)' here.
      expect(ev.entity_id).toBe('C-01');
    });
  }, 30_000);
});

d('B3 · the trail is append-only, and provably so', () => {
  it('audit_event refuses UPDATE and DELETE even to a privileged path', async () => {
    await withRollback(async (db) => {
      const row = await one<{ id: string }>(db, `select id from audit_event order by id limit 1`);

      // 0001 revoked these from `authenticated` and `anon`. This connection is `postgres`, so the
      // revoke does not apply to it — the trigger is what makes the claim true.
      expect(await refuses(db, `update audit_event set reason = 'x' where id = $1`, [row.id])).toMatch(
        /append-only/i
      );
      expect(await refuses(db, `delete from audit_event where id = $1`, [row.id])).toMatch(
        /append-only/i
      );
    });
  }, 30_000);
});

d('B3 · the events advance_batch never wrote', () => {
  it(
    'a gate opening is recorded, and its actor is null BECAUSE the server decided',
    async () => {
      await withRollback(async (db) => {
        const batch = await createActiveBatch(db);
        const mark = await one<{ hi: string }>(
          db,
          `select coalesce(max(id), 0)::text hi from audit_event`
        );

        const moved = await one<{ opened: number; resting: number }>(
          db,
          `select * from advance_batch($1)`,
          [batch]
        );
        const total = Number(moved.opened) + Number(moved.resting);

        const fresh = await all<{ action: string; actor_id: string | null; reason: string }>(
          db,
          `select action, actor_id::text, reason from audit_event
            where id > $1::bigint
              and action in ('gate_opened','rest_started','rest_released')
            order by id`,
          [mark.hi]
        );

        // One event per transition. Not one per call — a poll that moves nothing writes nothing.
        expect(fresh).toHaveLength(total);
        for (const e of fresh) {
          // The whole point: nobody did this. A null actor here is the claim, not a gap.
          expect(e.actor_id).toBeNull();
          expect(e.reason.length).toBeGreaterThan(10);
        }
      });
    },
    60_000
  );

  it('a poll that moves nothing writes nothing', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      await db.query(`select advance_batch($1)`, [batch]);

      const mark = await one<{ hi: string }>(
        db,
        `select coalesce(max(id), 0)::text hi from audit_event`
      );
      // MyWork polls this every 15 s. If a settled batch wrote events on every poll the trail
      // would be unreadable within a day.
      await db.query(`select advance_batch($1)`, [batch]);
      const after = await one<{ n: number }>(
        db,
        `select count(*)::int n from audit_event where id > $1::bigint`,
        [mark.hi]
      );
      expect(Number(after.n)).toBe(0);
    });
  }, 60_000);

  it(
    'v_batch_event marks a server decision as such, and a human action as not',
    async () => {
      await withRollback(async (db) => {
        const batch = await createActiveBatch(db);
        await db.query(`select advance_batch($1)`, [batch]);

        const rows = await all<{ action: string; server_decided: boolean; actor_id: string | null }>(
          db,
          `select action, server_decided, actor_id::text from v_batch_event
            where master_batch_id = $1 order by id`,
          [batch]
        );
        expect(rows.length).toBeGreaterThan(0);

        for (const r of rows) {
          if (['gate_opened', 'rest_started', 'rest_released'].includes(r.action)) {
            expect(r.server_decided).toBe(true);
            expect(r.actor_id).toBeNull();
          } else {
            expect(r.server_decided).toBe(false);
          }
        }
      });
    },
    60_000
  );

  it('a batch appearing is recorded, with the Day-0 config it was built from', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      const ev = await one<{ action: string; after_state: any }>(
        db,
        `select action, after_state from audit_event
          where entity_table = 'master_batch' and entity_id = $1 and action = 'INSERT'`,
        [batch]
      );
      // No separate `plan_generated` event exists — see 0018 §5 for why. The config the plan was
      // built from is here, and the activities it produced are rows.
      expect(ev.after_state.config).toBeTruthy();
      expect(ev.after_state.config.primary_fibre_required_mt).toBeDefined();
    });
  }, 60_000);
});

d('B3 · v_batch_event resolves an event to its batch', () => {
  it(
    'whatever the event is attached to — activity, batch, deviation or corrective action',
    async () => {
      await withRollback(async (db) => {
        const batch = await createActiveBatch(db);

        const kinds = await all<{ entity_table: string; n: number }>(
          db,
          `select entity_table, count(*)::int n from v_batch_event
            where master_batch_id = $1 group by 1 order by 1`,
          [batch]
        );
        const tables = kinds.map((k) => k.entity_table);
        // Both of these resolve through different joins in the view.
        expect(tables).toContain('master_batch');
        expect(tables).toContain('batch_activity');

        // Every event about a LIVE activity resolves to its batch. Events about deleted rows do
        // not, and that is correct rather than a defect: `generate_activity_plan` deletes and
        // recreates the plan while a batch is a draft, so an event can outlive the row it names.
        const orphan = await one<{ n: number }>(
          db,
          `select count(*)::int n
             from v_batch_event v
             join batch_activity ba on ba.id::text = v.entity_id
            where v.entity_table = 'batch_activity' and v.master_batch_id is null`
        );
        expect(Number(orphan.n)).toBe(0);
      });
    },
    60_000
  );

  it('places an event on the hour axis when the batch has an H0', async () => {
    await withRollback(async (db) => {
      // A start in the PAST, so events happening now sit on the hour axis rather than before H0.
      // June, not August: the seeded demo batches run 5 Aug - mid Sep and `validate_batch`
      // correctly refuses a fourth batch competing for the same vessels in that window.
      const batch = await createActiveBatch(db, {
        startDate: '2026-06-01',
        startAt: '2026-06-01T05:00:00Z',
      });
      const row = await one<{ batch_hour: number | null }>(
        db,
        `select batch_hour from v_batch_event
          where master_batch_id = $1 and batch_hour is not null order by id limit 1`,
        [batch]
      );
      // 1-based, matching Book1 and TIME_CONTRACT §1.2 — hour 1 is the first hour, not hour 0.
      expect(Number(row.batch_hour)).toBeGreaterThanOrEqual(1);
    });
  }, 60_000);
});
