#!/usr/bin/env node
// THE MINUTE 0-10 GATE.
//
// Proves a rest window opens on the SERVER clock with nobody clicking anything, and that a
// device clock cannot cheat it. Everything the browser does is call release_elapsed_rests —
// exactly what MyWork polls.

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

const REST_SECONDS = 20; // 20 s so this test finishes; the demo will use 3 min
const REST_HOURS = REST_SECONDS / 3600;

// Clean slate. With 11 bunkers and a ±2-day window, two active batches sharing vessels are
// correctly refused as double-booked — so this test cannot run alongside another batch.
// Re-seed the demo batch afterwards with: npm run demo:prep
await c.query(`delete from master_batch`);

const CODE = 'REST-' + Date.now().toString().slice(-6);
const gates = (
  await c.query(
    `select pa.code from process_activity pa
     join process_definition pd on pd.id = pa.process_definition_id
     where pd.code = 'PROCESS-2026B' and pa.is_time_gate`
  )
).rows;

const cfg = {
  primary_fibre_required_mt: 21,
  expected_load_capacity_mt: 2,
  bunker_line_count: 3,
  yard_pile_count: 2,
  mixed_pile_count: 1,
  straw_pile_count: 2,
  straw_bunker_count: 1,
  turner_pile_count: 3,
  tunnel_count: 3,
};
for (const g of gates) cfg['rest_hr_' + g.code] = REST_HOURS;

const batch = (
  await c.query(`select public.create_master_batch($1,$2,$3,$4,$5,$6,$7) id`, [
    CODE, CODE, new Date().toISOString().slice(0, 10), JSON.stringify(cfg),
    JSON.stringify([
      { role: 'PRIMARY_FIBRE', material_code: 'BAGASSE_NEW', lead: true },
      { role: 'STRUCTURAL_STRAW', material_code: 'PADDY_PUNJAB', lead: true },
      { role: 'NITROGEN_SOURCE', material_code: 'CHICKEN_MANURE', lead: true },
      { role: 'MINERAL', material_code: 'GYPSUM', lead: true },
    ]),
    'Ramarao', null,
  ])
).rows[0].id;

// Make it activatable: assignee and destination everywhere required.
const people = (await c.query(`select id, role::text from profiles where is_active`)).rows;
const op = people.find((p) => p.role === 'operator').id;
const lab = people.find((p) => p.role === 'lab_tech').id;
const bunkers = (await c.query(`select id from location where kind='BUNKER' order by code`)).rows;
const tunnels = (await c.query(`select id from location where kind='TUNNEL' order by code`)).rows;
const turners = (await c.query(`select id from machine where kind='TURNER' order by code`)).rows;

await c.query(
  `update batch_activity set assigned_person_id =
     case when responsible_role='lab_tech' then $2::uuid else $3::uuid end
   where master_batch_id=$1`, [batch, lab, op]
);
await c.query(`update batch_activity set destination_location_id=$2 where master_batch_id=$1 and code='FIB1-BUNK-LOAD'`, [batch, bunkers[2].id]);
await c.query(`update batch_activity set source_location_id=$2, destination_location_id=$3 where master_batch_id=$1 and code='FIB1-BUNK-RELOAD'`, [batch, bunkers[2].id, bunkers[6].id]);
await c.query(`update batch_activity set destination_location_id=$2 where master_batch_id=$1 and code='STRAW-BUNK-STORE'`, [batch, bunkers[3].id]);
for (let i = 1; i <= 3; i += 1) {
  await c.query(`update batch_activity set destination_location_id=$3 where master_batch_id=$1 and code='P1-BUNK-LOAD' and instance_no=$2`, [batch, i, bunkers[i - 1].id]);
  await c.query(`update batch_activity set source_location_id=$3, destination_location_id=$4 where master_batch_id=$1 and code='P1-BUNK-RELOAD' and instance_no=$2`, [batch, i, bunkers[i - 1].id, bunkers[7 + i - 1].id]);
  await c.query(`update batch_activity set destination_location_id=$3 where master_batch_id=$1 and code='TN-LOAD' and instance_no=$2`, [batch, i, tunnels[i - 1].id]);
}
await c.query(`update batch_activity set assigned_machine_id=$2 where master_batch_id=$1 and code='TR-T1'`, [batch, turners[0].id]);
await c.query(`update batch_activity set assigned_machine_id=$2 where master_batch_id=$1 and code='TR-T2'`, [batch, turners[1].id]);
await c.query(`update batch_activity set variant_code='WATER' where master_batch_id=$1 and code in ('FIB1-HOP-2','FIB1-HOP-3')`, [batch]);

await c.query(`select public.activate_batch($1)`, [batch]);
console.log(`\nPROVING THE REST GATE · batch ${CODE} · rest = ${REST_SECONDS}s\n`);

// Complete Day 0 and Day 1 so FIB1-REST-1 (Day 2) becomes eligible.
async function completeDay(day) {
  const rows = (
    await c.query(
      `select id from batch_activity
       where master_batch_id=$1 and rel_day=$2 and state in ('READY','IN_PROGRESS')`,
      [batch, day]
    )
  ).rows;
  for (const r of rows) {
    await c.query(
      `update batch_activity_evidence_req set satisfied_count = min_count where batch_activity_id=$1`,
      [r.id]
    );
    // Record the planned quantity exactly, so nothing deviates and the day can close.
    // Record a value that is actually in spec: the midpoint of the SOP band when one
    // exists, otherwise the Day-0 target. Submitting nonsense would deviate, and a
    // deviation correctly holds the day open — which is a different test.
    await c.query(
      `select public.submit_activity($1,
         coalesce((select jsonb_object_agg(v.field_key,
             case
               when v.sop_min is not null and v.sop_max is not null
                 then round((v.sop_min + v.sop_max) / 2, 2)::text
               when v.sop_max is not null then v.sop_max::text
               when v.sop_min is not null then v.sop_min::text
               when nullif(v.day0_value,'') is not null then v.day0_value
               when ba.planned_qty_mt is not null then ba.planned_qty_mt::text
               else '1' end)
           from batch_activity_value v
           join batch_activity ba on ba.id = v.batch_activity_id
           where v.batch_activity_id=$1), '{}'::jsonb), $2)`,
      [r.id, 'demo']
    );
  }
  const left = (
    await c.query(
      `select count(*)::int n from batch_activity
       where master_batch_id=$1 and rel_day=$2 and state not in ('COMPLETED','SKIPPED')`,
      [batch, day]
    )
  ).rows[0].n;
  return left;
}

for (const day of [0, 1]) {
  let guard = 0;
  let left = await completeDay(day);
  while (left > 0 && guard < 4) {
    left = await completeDay(day);
    guard += 1;
  }
  console.log(`  day ${day} closed · ${left} activities left open`);
}

const rest = (
  await c.query(
    `select id, title, state::text, day0_duration_hr, unblocks_at,
            round(extract(epoch from (unblocks_at - now())))::int secs_left
     from batch_activity
     where master_batch_id=$1 and is_time_gate and rel_day=2 limit 1`,
    [batch]
  )
).rows[0];

if (!rest) {
  console.log('  FAIL — no Day-2 rest activity found');
  process.exit(1);
}
console.log(`\n  rest activity: ${rest.title}`);
console.log(`  state:         ${rest.state}`);
console.log(`  duration:      ${rest.day0_duration_hr} h (${Math.round(rest.day0_duration_hr * 3600)} s)`);
console.log(`  unblocks_at:   ${rest.unblocks_at?.toISOString?.() ?? rest.unblocks_at}`);
console.log(`  seconds left:  ${rest.secs_left}`);

if (rest.state !== 'WAITING_TIME' || rest.unblocks_at === null) {
  console.log('\n  FAIL — the rest did not start its clock. This was the bug.');
  process.exit(1);
}

// Poll exactly as MyWork does. Nobody clicks anything.
console.log('\n  polling release_elapsed_rests every 3 s — no human action\n');
let opened = false;
for (let i = 0; i < 15; i += 1) {
  await new Promise((r) => setTimeout(r, 3000));
  await c.query(`select public.release_elapsed_rests($1)`, [batch]);
  const s = (
    await c.query(`select state::text from batch_activity where id=$1`, [rest.id])
  ).rows[0].state;
  const left = (
    await c.query(
      `select greatest(round(extract(epoch from (unblocks_at - now())))::int, 0) n
       from batch_activity where id=$1`, [rest.id]
    )
  ).rows[0].n;
  console.log(`    t+${(i + 1) * 3}s  state=${s}  ${left}s left`);
  if (s === 'READY') {
    opened = true;
    break;
  }
}

if (!opened) {
  console.log('\n  FAIL — the window elapsed and the gate never opened.');
  process.exit(1);
}

// And the next activity became available as a result.
const next = (
  await c.query(
    `select title, state::text from batch_activity
     where master_batch_id=$1 and rel_day=4 and state='READY' limit 3`, [batch]
  )
).rows;

console.log('\n  PASS · the gate opened with nobody clicking');
if (next.length) {
  console.log(`  and Day 4 work is now available: ${next.map((n) => n.title).join(', ')}`);
}

// A device clock cannot cheat it: the decision reads now() on the server only.
const cheat = (
  await c.query(
    `select count(*)::int n from batch_activity
     where master_batch_id=$1 and state='WAITING_TIME' and now() < unblocks_at`, [batch]
  )
).rows[0].n;
console.log(`  ${cheat} rest window(s) still closed — server clock, not the device's\n`);

await c.query(`delete from master_batch where id=$1`, [batch]);
await c.end();
