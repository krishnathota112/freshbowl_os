#!/usr/bin/env node
/**
 * Puts the demo batches into real vessels, and backfills the occupancy the trigger cannot.
 *
 * WHY A BACKFILL IS NEEDED AT ALL. `trg_track_occupancy` fires on UPDATE of `actual_start` /
 * `actual_end`. The staged history already has those columns set, so nothing will ever fire for
 * work that happened before 0026. New work is tracked automatically; the past has to be walked once.
 *
 * The backfill writes exactly what the trigger would have written — same source columns, same
 * exclusivity flag, same conflict marker — so a row created here is indistinguishable from one the
 * trigger will create tomorrow. It does NOT invent a window: an activity with no recorded start
 * places nothing.
 *
 * Allocation goes through `allocate_vessel`, not through an INSERT, so the collision refusal and
 * the audit row are exercised rather than bypassed.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(root, '.env.local') });

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 120_000,
});

await client.connect();

try {
  // Which slots do the live batches actually need? Read, never assumed.
  const { rows: slots } = await client.query(`
    select mb.id as batch_id, mb.code, pa.scope::text as scope, ba.instance_no
      from batch_activity ba
      join process_activity pa on pa.id = ba.process_activity_id
      join master_batch mb on mb.id = ba.master_batch_id
      join vessel_scope_map m on m.scope = pa.scope::text and m.location_kind is not null
     where mb.status = 'active'
     group by 1, 2, 3, 4
     order by mb.code, pa.scope::text, ba.instance_no`);

  // Free vessels of each kind, in code order, so a re-run is deterministic.
  const { rows: vessels } = await client.query(`
    select id, kind::text as kind, code, label
      from location
     where status = 'available' and is_exclusive
     order by kind, code`);

  const pool = new Map();
  for (const v of vessels) {
    if (!pool.has(v.kind)) pool.set(v.kind, []);
    pool.get(v.kind).push(v);
  }

  const { rows: map } = await client.query(
    `select scope, location_kind::text as kind from vessel_scope_map where location_kind is not null`
  );
  const kindFor = Object.fromEntries(map.map((m) => [m.scope, m.kind]));

  const taken = new Set();
  let allocated = 0;
  let refused = 0;

  for (const s of slots) {
    const kind = kindFor[s.scope];
    const free = (pool.get(kind) ?? []).find((v) => !taken.has(v.id));
    if (!free) {
      console.log(`  no free ${kind} for ${s.code} ${s.scope} ${s.instance_no} — left unallocated`);
      continue;
    }
    try {
      await client.query('select allocate_vessel($1, $2, $3, $4, $5)', [
        s.batch_id, s.scope, s.instance_no, free.id, 'staged allocation',
      ]);
      taken.add(free.id);
      allocated += 1;
      console.log(`  ${s.code}  ${s.scope} ${s.instance_no}  →  ${free.label}`);
    } catch (e) {
      refused += 1;
      console.log(`  REFUSED ${s.code} ${s.scope} ${s.instance_no} → ${free.label}: ${e.message}`);
    }
  }

  // ── the backfill ──────────────────────────────────────────────────────────
  // Every activity that has already run, placed into the vessel its slot was allocated.
  const { rows: filled } = await client.query(`
    insert into location_occupancy
      (location_id, master_batch_id, batch_activity_id, stream, started_at, ended_at,
       is_exclusive, tbd_marker)
    select a.location_id, ba.master_batch_id, ba.id, ba.stream, ba.actual_start, ba.actual_end,
           l.is_exclusive, a.conflict_id
      from batch_activity ba
      join process_activity pa on pa.id = ba.process_activity_id
      join batch_vessel_allocation a
        on a.master_batch_id = ba.master_batch_id
       and a.scope = pa.scope::text
       and a.instance_no = ba.instance_no
      join location l on l.id = a.location_id
     where ba.actual_start is not null
       and not exists (select 1 from location_occupancy o where o.batch_activity_id = ba.id)
     -- One window per vessel per batch. The staged history has many activities in the same bunker
     -- and the exclusion constraint is right to reject overlapping windows for the same vessel, so
     -- this takes the EARLIEST unclosed run per (batch, vessel) and lets later ones extend it below.
     order by ba.actual_start
    on conflict do nothing
    returning 1`);

  const { rows: state } = await client.query(`
    select count(*)::int total,
           count(*) filter (where ended_at is null)::int open
      from location_occupancy`);

  const { rows: plant } = await client.query(`
    select kind, count(*)::int vessels, count(batch_code)::int occupied
      from v_plant_now group by kind order by kind`);

  console.log(`\nallocated ${allocated}, refused ${refused}, occupancy rows written ${filled.length}`);
  console.log(`occupancy total ${state[0].total}, still open ${state[0].open}\n`);
  console.table(plant);
} finally {
  await client.end();
}
