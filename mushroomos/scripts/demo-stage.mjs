#!/usr/bin/env node
// Clears the stage so the admin can build a batch LIVE, on camera.
//
// Why this exists alongside demo:prep: the fallback batch that demo:prep activates already
// holds Bunker 3 and Bunker 7. Create a second batch live and pick the same vessels, and
// validate_batch correctly refuses it as double-booked — which is right, and a terrible
// thing to discover with an audience watching. Run this when you intend to do the admin
// flow live. Run demo:prep instead when you want a running batch to fall back on.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local') });
const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const gone = await c.query(`delete from master_batch returning code, status`);
await c.query(`delete from notification`);

const ref = await c.query(
  `select
     (select count(*) from process_activity pa
        join process_definition pd on pd.id = pa.process_definition_id
       where pd.code = 'PROCESS-2026B')::int as activities,
     (select count(*) from location where kind = 'BUNKER')::int as bunkers,
     (select count(*) from machine where kind = 'TURNER')::int as turners,
     (select count(*) from profiles where is_active)::int as people`
);
const r = ref.rows[0];

console.log(`\nSTAGE CLEAR · removed ${gone.rowCount} batch(es)`);
if (gone.rowCount) console.log(`  ${gone.rows.map((b) => `${b.code}/${b.status}`).join(', ')}`);
console.log(
  `\n  ${r.activities} activities · ${r.bunkers} bunkers free · ${r.turners} turners · ${r.people} people\n` +
    '\n  Now, in the browser as admin@freshbowl.demo:\n' +
    '    1. Schedule -> New Batch\n' +
    '    2. 21 MT bagasse, 2.0 MT per load  -> 11 loads appear\n' +
    '       change 2.0 to 2.5              -> 9 loads (derived, not stored)\n' +
    '    3. Bunker 3 as the fill, Bunker 7 as the reload\n' +
    '    4. Rest durations: set the FIRST one to 3 MINUTES (unit selector), rest 48 h\n' +
    '    5. Validate -> Activate\n' +
    '  Then sign in as operator@freshbowl.demo -> My Work\n'
);
await c.end();
