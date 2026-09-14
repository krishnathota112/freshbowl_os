/**
 * The plant view. `0026_vessel_allocation.sql`, `src/api/plant.ts`, `src/legacy/admin/Plant.tsx`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS SUITE IS GUARDING
 *
 * Before 0026 the product modelled the PROCESS and not the PLANT: 736 of 800 activities had no
 * location and `location_occupancy` had zero rows. So the assertions here are mostly about the
 * things that would quietly put it back in that state —
 *
 *   · an empty vessel being filtered out (which turns a factory view back into a batch list)
 *   · a vessel being GUESSED for an activity whose slot was never allocated
 *   · the double-booking constraint being satisfied by accident rather than enforced
 *   · BUNKER_LINE → BUNKER hardening from a marked assumption into an unmarked fact
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DB_URL, NO_DB_REASON, REPO_ROOT, all, one, refuses, withRollback } from './db';

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

const read = (...p: string[]) => readFileSync(join(REPO_ROOT, 'mushroomos', 'src', ...p), 'utf8');
const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const api = () => codeOf(read('api', 'plant.ts'));
const screen = () => codeOf(read('routes', 'Plant.tsx'));

describe('the plant view keeps the empties', () => {
  it('never filters a vessel out for being empty', () => {
    // An empty bunker is capacity. Dropping it turns a view of a factory back into a list of
    // batches, which is the exact thing this screen exists to stop being.
    const src = api();
    expect(src).not.toMatch(/filter\([^)]*batchCode !== null\)[\s\S]{0,40}return/);
    expect(src).toMatch(/totalVessels: vessels\.length/);
    expect(screen()).toMatch(/>empty</);
  });

  it('says "empty" calmly — an empty vessel is not a fault', () => {
    const src = screen();
    // No warning colour on the empty state; `status` is a different thing and may warn.
    expect(src).toMatch(/empty<\/span>/);
    expect(src).not.toMatch(/empty[\s\S]{0,60}var\(--crit\)/);
  });

  it('lays the floor out in flow order, not alphabetically', () => {
    const src = api();
    expect(src).toMatch(/FLOW_ORDER = \['YARD', 'SOAK_PIT', 'HOPPER', 'BUNKER', 'TUNNEL'\]/);
    // An unknown kind sorts after rather than disappearing.
    expect(src).toMatch(/i === -1 \? FLOW_ORDER\.length : i/);
  });

  it('orders vessels numerically, so Bunker 10 follows Bunker 9', () => {
    expect(api()).toMatch(/numeric: true/);
  });
});

describeDb('0026 — the plant is bound to real vessels', () => {
  it('the scope→vessel map states an absence rather than leaving one', async () => {
    await withRollback(async (db) => {
      const rows = await all<{ scope: string; location_kind: string | null; unmapped_reason: string | null }>(
        db,
        `select scope, location_kind::text as location_kind, unmapped_reason from vessel_scope_map`
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        // The CHECK constraint says one of the two must be present; this asserts the reason is a
        // sentence rather than a placeholder character satisfying it.
        if (r.location_kind === null) {
          expect(r.unmapped_reason, `${r.scope} is unmapped with no reason`).toBeTruthy();
          expect((r.unmapped_reason ?? '').length).toBeGreaterThan(30);
        }
      }
    });
  }, 30_000);

  it('BUNKER_LINE carries TBD-57 — the mapping is an assumption, and it says so', async () => {
    await withRollback(async (db) => {
      const r = await one<{ conflict_id: string | null }>(
        db,
        `select conflict_id from vessel_scope_map where scope = 'BUNKER_LINE'`
      );
      // No source states whether a bunker line IS a bunker or a lane within one. Allocation works
      // under the reading; the reading is marked. Removing the marker would resolve the question by
      // deletion.
      expect(r.conflict_id).toBe('TBD-57');
      const c = await one<{ status: string }>(
        db,
        `select status::text from conflict_register where conflict_id = 'TBD-57'`
      );
      expect(c.status).toBe('open');
    });
  }, 30_000);

  it('TUNNEL is mapped with NO marker — the scope and the kind are the same word', async () => {
    await withRollback(async (db) => {
      const r = await one<{ location_kind: string; conflict_id: string | null }>(
        db,
        `select location_kind::text as location_kind, conflict_id from vessel_scope_map where scope = 'TUNNEL'`
      );
      expect(r.location_kind).toBe('TUNNEL');
      // Marking an unambiguous mapping is as misleading as failing to mark an ambiguous one.
      expect(r.conflict_id).toBeNull();
    });
  }, 30_000);

  it('every allocation made under an open question carries that question', async () => {
    await withRollback(async (db) => {
      const bad = await all<{ n: string }>(
        db,
        `select count(*)::text n
           from batch_vessel_allocation a
           join vessel_scope_map m on m.scope = a.scope
          where m.conflict_id is not null and a.conflict_id is distinct from m.conflict_id`
      );
      expect(Number(bad[0].n), 'an allocation lost the marker its mapping carries').toBe(0);
    });
  }, 30_000);
});

describeDb('0026 — the double-booking guarantee is enforced, not hoped for', () => {
  it('two open occupancies on one exclusive vessel are refused by the database', async () => {
    await withRollback(async (db) => {
      const loc = await one<{ id: string; label: string }>(
        db,
        `select id, label from location where is_exclusive and status = 'available' limit 1`
      );
      const batches = await all<{ id: string }>(db, `select id from master_batch limit 2`);
      if (batches.length < 2) return;

      await db.query(
        `insert into location_occupancy (location_id, master_batch_id, started_at, is_exclusive)
         values ($1, $2, now() - interval '2 hours', true)`,
        [loc.id, batches[0].id]
      );
      const msg = await refuses(
        db,
        `insert into location_occupancy (location_id, master_batch_id, started_at, is_exclusive)
         values ($1, $2, now() - interval '1 hour', true)`,
        [loc.id, batches[1].id]
      );
      expect(msg).toMatch(/location_occupancy_no_overlap|conflicting key|exclusion/i);
    });
  }, 30_000);

  it('a NON-exclusive vessel takes two batches at once, because the yard is shared', async () => {
    await withRollback(async (db) => {
      const loc = await all<{ id: string }>(
        db,
        `select id from location where not is_exclusive limit 1`
      );
      if (loc.length === 0) return;
      const batches = await all<{ id: string }>(db, `select id from master_batch limit 2`);
      if (batches.length < 2) return;

      // 0021's constraint covered EVERY location. Writing real occupancy would have made the second
      // batch onto the yard fail — which is why 0026 rebuilt it with `where (is_exclusive)`.
      for (const b of batches) {
        await db.query(
          `insert into location_occupancy (location_id, master_batch_id, started_at, is_exclusive)
           values ($1, $2, now(), false)`,
          [loc[0].id, b.id]
        );
      }
      const n = await one<{ n: string }>(
        db,
        `select count(*)::text n from location_occupancy where location_id = $1 and ended_at is null`,
        [loc[0].id]
      );
      expect(Number(n.n)).toBeGreaterThanOrEqual(2);
    });
  }, 30_000);

  it('allocate_vessel refuses a vessel of the wrong kind, by name', async () => {
    await withRollback(async (db) => {
      const batch = await one<{ id: string }>(db, `select id from master_batch limit 1`);
      const bunker = await one<{ id: string }>(
        db,
        `select id from location where kind = 'BUNKER' limit 1`
      );
      // TUNNEL scope must not accept a bunker. The message names both, so the reader does not have
      // to go and look up what went wrong.
      const msg = await refuses(db, `select allocate_vessel($1, 'TUNNEL', 1, $2, null)`, [
        batch.id,
        bunker.id,
      ]);
      expect(msg).toMatch(/needs a TUNNEL/);
      expect(msg).toMatch(/Bunker/);
    });
  }, 30_000);

  it('allocate_vessel refuses a scope that is not held in a vessel, and says why', async () => {
    await withRollback(async (db) => {
      const batch = await one<{ id: string }>(db, `select id from master_batch limit 1`);
      const yard = await one<{ id: string }>(db, `select id from location where kind = 'YARD' limit 1`);
      const msg = await refuses(db, `select allocate_vessel($1, 'LOAD', 1, $2, null)`, [
        batch.id,
        yard.id,
      ]);
      // A load is a vehicle, not a place. The refusal carries the recorded reason, not a code.
      expect(msg).toMatch(/not held in a vessel/);
      expect(msg.length).toBeGreaterThan(40);
    });
  }, 30_000);
});

describeDb('0026 — occupancy follows recorded work, and invents nothing', () => {
  it('an activity whose slot was never allocated places the batch nowhere', async () => {
    await withRollback(async (db) => {
      // The trigger returns early when there is no allocation. It must never fall back to "any free
      // vessel of the right kind" — a batch shown in Bunker 3 that was never in Bunker 3 is worse
      // than a batch shown nowhere.
      const orphan = await one<{ n: string }>(
        db,
        `select count(*)::text n
           from location_occupancy o
          where not exists (
            select 1 from batch_activity ba
              join process_activity pa on pa.id = ba.process_activity_id
              join batch_vessel_allocation a
                on a.master_batch_id = ba.master_batch_id
               and a.scope = pa.scope::text
               and a.instance_no = ba.instance_no
               and a.location_id = o.location_id
             where ba.id = o.batch_activity_id)
            and o.batch_activity_id is not null`
      );
      expect(Number(orphan.n), 'an occupancy row exists for a vessel nobody allocated').toBe(0);
    });
  }, 30_000);

  it('the window is the RECORDED start, never now()', async () => {
    await withRollback(async (db) => {
      const drift = await one<{ n: string }>(
        db,
        `select count(*)::text n
           from location_occupancy o
           join batch_activity ba on ba.id = o.batch_activity_id
          where ba.actual_start is not null and o.started_at <> ba.actual_start`
      );
      // An actual start backdated by an operator has to place the batch when it was actually there.
      expect(Number(drift.n)).toBe(0);
    });
  }, 30_000);

  it('v_plant_now returns EVERY vessel, occupied or not', async () => {
    await withRollback(async (db) => {
      const v = await one<{ n: string }>(db, `select count(*)::text n from v_plant_now`);
      const l = await one<{ n: string }>(db, `select count(*)::text n from location`);
      // A view that only returned occupied vessels would make the screen unable to show capacity,
      // which is the single most useful thing on it for a planner.
      expect(Number(v.n)).toBeGreaterThanOrEqual(Number(l.n));
    });
  }, 30_000);
});
