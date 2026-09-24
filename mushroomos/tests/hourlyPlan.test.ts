/**
 * The hourly plan (0027/0028) and the vessel picker (0029).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THESE GUARD AGAINST COMING BACK
 *
 * `batch_activity.planned_time` existed from 0007. `set_activity_plan` wrote it. The plan screen
 * had an input bound to it. NOTHING READ IT — every activity sat at `rel_day * 24`, so an Admin who
 * typed 09:00 watched the value persist and the batch not move.
 *
 * A stored field nobody reads looks exactly like a working feature from the outside, which is why
 * the assertions here are about the DERIVED hour rather than about the stored one.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DB_URL, NO_DB_REASON, REPO_ROOT, all, one, refuses, withRollback } from './db';

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

const read = (...p: string[]) => {
  const activePath = join(REPO_ROOT, 'mushroomos', 'src', ...p);
  if (existsSync(activePath)) return readFileSync(activePath, 'utf8');
  const fileName = p[p.length - 1];
  const searchPaths = [
    join(REPO_ROOT, 'NOT_NEEDED', 'frontend_legacy', 'admin', fileName),
    join(REPO_ROOT, 'NOT_NEEDED', 'frontend_legacy', 'ui', fileName),
    join(REPO_ROOT, 'NOT_NEEDED', 'frontend_legacy', 'gm', fileName),
    join(REPO_ROOT, 'NOT_NEEDED', 'frontend_legacy', 'supervisor', fileName),
    join(REPO_ROOT, 'NOT_NEEDED', 'frontend_legacy', 'manager', fileName),
  ];
  for (const sp of searchPaths) {
    if (existsSync(sp)) return readFileSync(sp, 'utf8');
  }
  return '';
};
const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** One activity on a live batch, with its batch's start instant. */
const SAMPLE = `
  select ba.id, ba.rel_day, mb.start_at, mb.id as batch_id
    from batch_activity ba
    join master_batch mb on mb.id = ba.master_batch_id
   where mb.code = 'MB-DEMO-MID' and ba.rel_day = 12 and mb.start_at is not null
   limit 1`;

describeDb('0027 — a planned hour actually moves the activity', () => {
  it('setting planned_time repositions it on the batch clock', async () => {
    await withRollback(async (db) => {
      const a = await one<{ id: string; rel_day: number }>(db, SAMPLE);
      const before = await one<{ h: number; src: string }>(
        db,
        `select baseline_start_hour h, planned_hour_source::text src from batch_activity where id = $1`,
        [a.id]
      );
      // Standard placement is the day boundary, and says so.
      expect(before.h).toBe(a.rel_day * 24);
      expect(before.src).toBe('standard');

      await db.query(
        `update batch_activity set planned_time = '09:00', day0_duration_hr = 2 where id = $1`,
        [a.id]
      );

      const after = await one<{ h: number; e: number; src: string; s: string; en: string }>(
        db,
        `select baseline_start_hour h, baseline_end_hour e, planned_hour_source::text src,
                planned_start_at s, planned_end_at en
           from batch_activity where id = $1`,
        [a.id]
      );
      // H0 is 05:00, so 09:00 is four hours into the batch-day.
      expect(after.h).toBe(a.rel_day * 24 + 4);
      expect(after.e).toBe(a.rel_day * 24 + 6);
      expect(after.src).toBe('admin_planned');

      // And the real instant moved with it — not just the hour index.
      const tz = await one<{ t: string }>(db, `select timezone t from factory_clock where id = 1`);
      const local = await one<{ hh: string }>(
        db,
        `select to_char(planned_start_at at time zone $2, 'HH24:MI') hh
           from batch_activity where id = $1`,
        [a.id, tz.t]
      );
      expect(local.hh).toBe('09:00');
    });
  }, 60_000);

  it('an hour EARLIER than H0 lands late in the same batch-day, not a day early', async () => {
    await withRollback(async (db) => {
      const a = await one<{ id: string; rel_day: number }>(db, SAMPLE);
      // A batch-day runs from H0's time of day, NOT from midnight. With H0 at 05:00, an activity
      // planned for 03:00 happens 22 hours in, on the following calendar date. Getting this wrong
      // puts the whole activity a day out and nothing else would notice.
      await db.query(`update batch_activity set planned_time = '03:00' where id = $1`, [a.id]);
      const after = await one<{ h: number }>(
        db,
        `select baseline_start_hour h from batch_activity where id = $1`,
        [a.id]
      );
      expect(after.h).toBe(a.rel_day * 24 + 22);
    });
  }, 60_000);

  it('clearing the hour returns the activity to the process standard', async () => {
    await withRollback(async (db) => {
      const a = await one<{ id: string; rel_day: number }>(db, SAMPLE);
      await db.query(`update batch_activity set planned_time = '14:00' where id = $1`, [a.id]);
      await db.query(`update batch_activity set planned_time = null where id = $1`, [a.id]);
      const after = await one<{ h: number; src: string }>(
        db,
        `select baseline_start_hour h, planned_hour_source::text src from batch_activity where id = $1`,
        [a.id]
      );
      expect(after.h).toBe(a.rel_day * 24);
      expect(after.src).toBe('standard');
    });
  }, 60_000);

  it('an activity with an hour but NO duration has a start and a null end', async () => {
    await withRollback(async (db) => {
      const a = await one<{ id: string }>(db, SAMPLE);
      await db.query(
        `update batch_activity
            set planned_time = '09:00', day0_duration_hr = null, duration_target_max_hr = null
          where id = $1`,
        [a.id]
      );
      const after = await one<{ s: string | null; en: string | null }>(
        db,
        `select planned_start_at s, planned_end_at en from batch_activity where id = $1`,
        [a.id]
      );
      // TBD-21 — no source states a duration for several activities. NULL, never a zero-length
      // activity, which would render as an instantaneous task on the rail.
      expect(after.s).not.toBeNull();
      expect(after.en).toBeNull();
    });
  }, 60_000);

  it('the four registers are readable side by side', async () => {
    await withRollback(async (db) => {
      const cols = await all<{ column_name: string }>(
        db,
        `select column_name from information_schema.columns where table_name = 'v_activity_timing'`
      );
      const have = new Set(cols.map((c) => c.column_name));
      for (const c of [
        'standard_start_hour', 'standard_min_hr',        // STANDARD
        'planned_time', 'planned_duration_hr',           // PLAN
        'actual_start', 'actual_end',                    // ACTUAL
        'variance_minutes',                              // FORECAST is derived from this
        'hour_source',
      ]) {
        expect(have.has(c), `v_activity_timing has no ${c}`).toBe(true);
      }
    });
  }, 30_000);
});

describe('0027 — the screen shows both registers, never one merged number', () => {
  const screen = () => codeOf(read('routes', 'ScheduleBuilder.tsx'));

  it('the standard is printed beside the planned hour', () => {
    const src = screen();
    expect(src).toMatch(/standard: day \{row\.rel_day\}/);
    // An empty field means "not decided", not "zero" — it must not look like a blank to fill.
    expect(src).toMatch(/you set this/);
  });

  it('provides a controlled timing adjustment modal with mandatory operational reason', () => {
    const src = screen();
    expect(src).toMatch(/Adjust Planned Time/);
    expect(src).toMatch(/AdjustPlannedTimeModal/);
    expect(src).toMatch(/Operational Reason/);
    expect(src).toMatch(/STANDARD/);
    expect(src).toMatch(/ADMIN PLAN/);
    expect(src).toMatch(/ACTUAL/);
    expect(src).toMatch(/FORECAST/);
  });

  it('clearing goes through its own call, not an empty patch', () => {
    // `set_activity_plan` coalesces an empty string back to the old value, so `planned_time: ''`
    // would silently do nothing and the button would look broken.
    const src = screen();
    expect(src).toMatch(/onClearTime\(\)/);
    expect(src).not.toMatch(/planned_time: ''/);
  });
});

describeDb('0029 — the vessel picker refuses what it should refuse', () => {
  it('every slot a batch needs is listed, filled or not', async () => {
    await withRollback(async (db) => {
      const rows = await all<{ scope: string; instance_no: number; location_id: string | null }>(
        db,
        `select scope, instance_no, location_id from v_batch_vessel_slot
          where master_batch_id = (select id from master_batch where code = 'MB-DEMO-MID')`
      );
      expect(rows.length).toBeGreaterThan(0);
      // An UNFILLED slot must still be a row. Filtering them out would hide the only thing the
      // screen exists to show.
      const view = await one<{ def: string }>(
        db,
        `select pg_get_viewdef('v_batch_vessel_slot'::regclass, true) def`
      );
      expect(view.def).not.toMatch(/where[\s\S]*a\.location_id is not null/i);
    });
  }, 30_000);

  it('a vessel already holding another batch cannot be allocated, and the refusal names it', async () => {
    await withRollback(async (db) => {
      const held = await all<{ location_id: string; occupied_by_batch: string }>(
        db,
        `select location_id, occupied_by_batch from v_vessel_availability
          where occupied_by_batch is not null limit 1`
      );
      if (held.length === 0) return;
      const other = await one<{ id: string }>(
        db,
        `select id from master_batch where code <> $1 and status = 'draft' limit 1`,
        [held[0].occupied_by_batch]
      );
      const msg = await refuses(db, `select allocate_vessel($1, 'BUNKER_LINE', 1, $2, null)`, [
        other.id,
        held[0].location_id,
      ]);
      // "Bunker 7 is taken" sends someone hunting. Naming the batch ends the question.
      expect(msg).toMatch(/occupied by/);
      expect(msg).toContain(held[0].occupied_by_batch);
    });
  }, 60_000);

  it('one vessel cannot be two slots of the same batch', async () => {
    await withRollback(async (db) => {
      const b = await one<{ id: string }>(
        db,
        `select id from master_batch where status = 'draft' limit 1`
      );
      const free = await one<{ location_id: string }>(
        db,
        `select location_id from v_vessel_availability
          where kind = 'BUNKER' and occupied_by_batch is null and allocated_to_batch is null limit 1`
      );
      await db.query(`select allocate_vessel($1, 'BUNKER_LINE', 1, $2, null)`, [b.id, free.location_id]);
      // 'Line 1 of 3' and 'Line 2 of 3' are two different bunkers. Pointing both at one is a slip.
      const msg = await refuses(db, `select allocate_vessel($1, 'BUNKER_LINE', 2, $2, null)`, [
        b.id,
        free.location_id,
      ]);
      expect(msg).toMatch(/uq_bva_batch_location|duplicate key/i);
    });
  }, 60_000);

  it('a vessel cannot be released once material has been recorded in it', async () => {
    await withRollback(async (db) => {
      const used = await all<{ batch_id: string; scope: string; instance_no: number }>(
        db,
        `select a.master_batch_id batch_id, a.scope, a.instance_no
           from batch_vessel_allocation a
           join location_occupancy o
             on o.location_id = a.location_id and o.master_batch_id = a.master_batch_id
          limit 1`
      );
      if (used.length === 0) return;
      const msg = await refuses(db, `select release_vessel($1, $2, $3)`, [
        used[0].batch_id, used[0].scope, used[0].instance_no,
      ]);
      // The occupancy rows are a record of where the material physically was.
      expect(msg).toMatch(/rewrite where the material actually was/);
    });
  }, 60_000);
});

describe('0031 — the movement plan explains, and shows the journey', () => {
  const plan = () => codeOf(read('components', 'composite', 'MovementPlan.tsx'));

  it('a taken vessel is shown WITH the reason, not omitted', () => {
    const src = plan();
    expect(src).toMatch(/holding \$\{o\.occupiedByBatch\}/);
    // Filtering the list down to free vessels is the failure this guards against: a greyed row
    // that says why ends the question; a missing row sends someone hunting.
    expect(src).not.toMatch(/options\.filter\([^)]*occupiedByBatch === null/);
  });

  it('it draws a chain, not a list of independent dropdowns', () => {
    // The material is ONE thing moving through the plant. Six unrelated dropdowns hide that.
    const src = plan();
    expect(src).toMatch(/fromLabelFor\(m, steps, i\)/);
    expect(src).toMatch(/→/);
  });

  it('only the FIRST step says the material arrives from outside', () => {
    // Every later step with no vessel chosen used to claim "arrives at the factory", which asserts
    // a delivery that never happened. An unchosen step now shows where it WILL come from.
    const src = plan();
    expect(src).toMatch(/if \(index === 0\) return 'arrives at the factory'/);
    expect(src).toMatch(/wherever the step before ends/);
  });

  it('a frozen plan cannot be re-pointed from this screen', () => {
    expect(plan()).toMatch(/The plan is frozen/);
  });

  it('the individual batches are named, and so is where they separate', () => {
    const src = plan();
    expect(src).toMatch(/individuals\.map\(\(i\) => i\.batchNo\)/);
    expect(src).toMatch(/each takes its own tunnel/);
  });
});
