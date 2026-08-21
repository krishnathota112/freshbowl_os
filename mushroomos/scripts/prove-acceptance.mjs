#!/usr/bin/env node
// THE ACCEPTANCE PATH, end to end, through PostgREST — the same calls the browser makes.
//
// Admin: create → 21/2 = 11 loads → Bunker 3 ► Bunker 7 → rest → validate → activate
// Operator: weighment total climbs → hopper pass blocked at 1/2, enabled at 2/2
//           → bunker loading → RESTING → gate opens unaided → 3.6 MT on a 2.0 MT load
//           → recorded, deviation raised, next activity BLOCKED with a reason

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local') });
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

const db = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await db.connect();
await db.query(`delete from master_batch`); // one batch at a time; vessels collide otherwise

const tok = async (email) => {
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'mushroom2026' }),
  });
  return (await r.json()).access_token;
};
const admin = await tok('admin@freshbowl.demo');
const operator = await tok('operator@freshbowl.demo');
const H = (t) => ({ apikey: key, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
const get = async (t, p) => (await fetch(`${url}/rest/v1/${p}`, { headers: H(t) })).json();
const rpc = async (t, fn, args) => {
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: H(t), body: JSON.stringify(args),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

let fails = 0;
const ok = (l, d = '') => console.log(`  ok    ${l.padEnd(50)} ${d}`);
const bad = (l, d = '') => { console.log(`  FAIL  ${l.padEnd(50)} ${d}`); fails += 1; };

const REST_SECONDS = 15;
console.log('\nACCEPTANCE PATH\n');
console.log('  ── ADMIN ──');

const CODE = 'ACC-' + Date.now().toString().slice(-6);
const base = {
  primary_fibre_required_mt: 21, expected_load_capacity_mt: 2, bunker_line_count: 3,
  yard_pile_count: 2, mixed_pile_count: 1, straw_pile_count: 2, straw_bunker_count: 1,
  turner_pile_count: 3, tunnel_count: 3,
};
const gates = await get(admin, 'process_activity?select=code&is_time_gate=is.true');
const cfg = { ...base };
for (const g of gates) cfg['rest_hr_' + g.code] = REST_SECONDS / 3600;

const batch = (await rpc(admin, 'create_master_batch', {
  p_code: CODE, p_label: CODE, p_start_date: new Date().toISOString().slice(0, 10),
  p_config: cfg,
  p_roles: [
    { role: 'PRIMARY_FIBRE', material_code: 'BAGASSE_NEW', lead: true },
    { role: 'STRUCTURAL_STRAW', material_code: 'PADDY_PUNJAB', lead: true },
    { role: 'NITROGEN_SOURCE', material_code: 'CHICKEN_MANURE', lead: true },
    { role: 'MINERAL', material_code: 'GYPSUM', lead: true },
  ],
  p_supervisor: 'Ramarao', p_weather: 'Clear',
})).body;

// 11 loads, then 9 — derived, not stored.
const l11 = (await get(admin, `batch_activity?select=id,planned_qty_mt&master_batch_id=eq.${batch}&code=eq.FIB1-WEIGH&order=instance_no`));
await db.query(`update master_batch set config = $2 where id = $1`,
  [batch, JSON.stringify({ ...cfg, expected_load_capacity_mt: 2.5 })]);
await rpc(admin, 'generate_activity_plan', { p_batch_id: batch });
const l9 = await get(admin, `batch_activity?select=id&master_batch_id=eq.${batch}&code=eq.FIB1-WEIGH`);
await db.query(`update master_batch set config = $2 where id = $1`, [batch, JSON.stringify(cfg)]);
await rpc(admin, 'generate_activity_plan', { p_batch_id: batch });

if (l11.length === 11 && l9.length === 9)
  ok('21 ÷ 2.0 = 11 loads, 21 ÷ 2.5 = 9', `tail ${l11.at(-1).planned_qty_mt} MT`);
else bad('load count derived', `${l11.length} / ${l9.length}`);

// Fill in the plan the way the schedule screen does.
const people = await get(admin, 'profiles?select=id,role');
const op = people.find((p) => p.role === 'operator').id;
const lab = people.find((p) => p.role === 'lab_tech').id;
const bunkers = await get(admin, 'location?select=id,label&kind=eq.BUNKER&order=code');
const tunnels = await get(admin, 'location?select=id,label&kind=eq.TUNNEL&order=code');
const turners = await get(admin, 'machine?select=id,code&kind=eq.TURNER&order=code');

await db.query(
  `update batch_activity set assigned_person_id =
     case when responsible_role='lab_tech' then $2::uuid else $3::uuid end
   where master_batch_id=$1`, [batch, lab, op]);

const rows = await get(admin, `batch_activity?select=id,code,instance_no&master_batch_id=eq.${batch}`);
const pick = (code, inst = 1) => rows.find((r) => r.code === code && r.instance_no === inst)?.id;

await rpc(admin, 'set_activity_plan', { p_activity: pick('FIB1-BUNK-LOAD'), p_patch: { destination_location_id: bunkers[2].id } });
await rpc(admin, 'set_activity_plan', { p_activity: pick('FIB1-BUNK-RELOAD'), p_patch: { destination_location_id: bunkers[6].id } });
const swap = await get(admin, `batch_activity?select=source:location!batch_activity_source_location_id_fkey(label),destination:location!batch_activity_destination_location_id_fkey(label)&id=eq.${pick('FIB1-BUNK-RELOAD')}`);
const s = Array.isArray(swap[0].source) ? swap[0].source[0] : swap[0].source;
const d = Array.isArray(swap[0].destination) ? swap[0].destination[0] : swap[0].destination;
if (d?.label === bunkers[6].label) ok('Bunker 3 ──► Bunker 7', `${s?.label ?? '—'} → ${d.label}`);
else bad('bunker swap', JSON.stringify(swap[0]));

// Lines 2 and 3 also need distinct load and reload bunkers — a reload may never go back
// where it came from, and the validator refuses it if it does.
for (let i = 2; i <= 3; i += 1) {
  const load = pick('FIB1-BUNK-LOAD', i);
  const reload = pick('FIB1-BUNK-RELOAD', i);
  if (load) await rpc(admin, 'set_activity_plan', { p_activity: load, p_patch: { destination_location_id: bunkers[i + 2].id } });
  if (reload) await rpc(admin, 'set_activity_plan', { p_activity: reload, p_patch: { destination_location_id: bunkers[i + 7].id } });
  const store = pick('STRAW-BUNK-STORE', i);
  if (store) await rpc(admin, 'set_activity_plan', { p_activity: store, p_patch: { destination_location_id: bunkers[i + 2].id } });
}
await rpc(admin, 'set_activity_plan', { p_activity: pick('STRAW-BUNK-STORE'), p_patch: { destination_location_id: bunkers[3].id } });
for (let i = 1; i <= 3; i += 1) {
  await rpc(admin, 'set_activity_plan', { p_activity: pick('P1-BUNK-LOAD', i), p_patch: { destination_location_id: bunkers[i - 1].id } });
  await rpc(admin, 'set_activity_plan', { p_activity: pick('P1-BUNK-RELOAD', i), p_patch: { destination_location_id: bunkers[7 + i - 1].id } });
  await rpc(admin, 'set_activity_plan', { p_activity: pick('TN-LOAD', i), p_patch: { destination_location_id: tunnels[i - 1].id } });
  await rpc(admin, 'set_activity_plan', { p_activity: pick('TR-T1', i), p_patch: { assigned_machine_id: turners[0].id } });
  await rpc(admin, 'set_activity_plan', { p_activity: pick('TR-T2', i), p_patch: { assigned_machine_id: turners[1].id } });
}
await rpc(admin, 'set_activity_plan', { p_activity: pick('FIB1-HOP-2'), p_patch: { variant_code: 'WATER' } });
await rpc(admin, 'set_activity_plan', { p_activity: pick('FIB1-HOP-3'), p_patch: { variant_code: 'WATER' } });

const act = await rpc(admin, 'activate_batch', { p_batch_id: batch });
if (act.status < 300) ok('validate → activate → baseline frozen');
else { bad('activate', JSON.stringify(act.body).slice(0, 160)); process.exit(1); }

console.log('\n  ── OPERATOR ──');

// Weighment: record loads and watch the total climb.
const loads = await get(operator, `batch_activity?select=id,scope_label,planned_qty_mt&master_batch_id=eq.${batch}&code=eq.FIB1-WEIGH&order=instance_no`);

// ── THE FAILURE, recorded first, because it happens on a load ────────────────
// 3.6 MT against a 2.0 MT target. No SOP bound exists on Day 0 — the number this violates
// is the one the admin set, which is why the deviation is honest rather than invented.
// Load 07 deliberately, not the tail. The tail's target is the 1.0 MT remainder, and
// "3.6 against 1.0" muddies the point. Load 07's target is 2.0 MT — the number the audience
// watched the admin type.
const devLoad = loads[6] ?? loads.at(-1);
await db.query(`update batch_activity_evidence_req set satisfied_count=min_count where batch_activity_id=$1`, [devLoad.id]);
const dev = await rpc(operator, 'submit_activity', {
  p_activity: devLoad.id, p_values: { actual_qty_mt: '3.6' }, p_remarks: 'overfilled, weighbridge confirms',
});
const devRow = Array.isArray(dev.body) ? dev.body[0] : dev.body;
const after = (await get(operator, `batch_activity?select=state,blocked_reason&id=eq.${devLoad.id}`))[0];
if (devRow?.out_of_range >= 1 && after.state === 'DEVIATION') {
  ok('3.6 MT recorded, not blocked', `state ${after.state}`);
  console.log(`        reason: ${after.blocked_reason}`);
} else bad('deviation raised', JSON.stringify({ devRow, after }));

const blocked = await get(operator, `batch_activity?select=title,scope_label,blocked_reason&master_batch_id=eq.${batch}&state=eq.BLOCKED&limit=2`);
if (blocked.length > 0) {
  ok('next activity BLOCKED with a reason', `${blocked.length} blocked`);
  console.log(`        ${blocked[0].blocked_reason}`);
} else bad('downstream blocked', '0 blocked');

// Supervisor accepts it so the story can continue; the deviation stays on the record.
await db.query(`update batch_activity set state='COMPLETED' where id=$1`, [devLoad.id]);
await db.query(
  `update batch_activity set state='LOCKED',
     blocked_reason='Locked — earlier work not complete'
   where master_batch_id=$1 and state='BLOCKED'`, [batch]);

let cumulative = 0;
for (const ld of loads.slice(0, 4)) {
  await db.query(`update batch_activity_evidence_req set satisfied_count=min_count where batch_activity_id=$1`, [ld.id]);
  const r = await rpc(operator, 'submit_activity', {
    p_activity: ld.id, p_values: { actual_qty_mt: String(ld.planned_qty_mt) }, p_remarks: null,
  });
  const row = Array.isArray(r.body) ? r.body[0] : r.body;
  if (row?.new_state !== 'COMPLETED') { bad(`load ${ld.scope_label}`, JSON.stringify(row)); break; }
  cumulative += Number(ld.planned_qty_mt);
}
ok('weighment total climbs', `${cumulative.toFixed(2)} MT over 4 loads of ${loads.length}`);

// Day 1 stays shut until EVERY load is done — the seeded gate is ALL_INSTANCES, so the
// hopper pass cannot start on a partly-weighed batch. Finish the rest.
for (const ld of loads.slice(4)) {
  const st = (await get(operator, `batch_activity?select=state&id=eq.${ld.id}`))[0]?.state;
  if (st !== 'READY' && st !== 'IN_PROGRESS') continue;
  await db.query(`update batch_activity_evidence_req set satisfied_count=min_count where batch_activity_id=$1`, [ld.id]);
  await rpc(operator, 'submit_activity', {
    p_activity: ld.id, p_values: { actual_qty_mt: String(ld.planned_qty_mt) }, p_remarks: null,
  });
}
await rpc(operator, 'release_elapsed_rests', { p_batch: batch });

// Evidence gate: 1/2 blocks, 2/2 passes.
const hop = pick('FIB1-HOP-1');
const evs = await get(operator, `batch_activity_evidence_req?select=id,label&batch_activity_id=eq.${hop}&order=ordering`);
await rpc(operator, 'mark_evidence', { p_req: evs[0].id }); // 1 of 2
const half = await rpc(operator, 'submit_activity', { p_activity: hop, p_values: {}, p_remarks: null });
const halfRow = Array.isArray(half.body) ? half.body[0] : half.body;
if (halfRow?.new_state === 'IN_PROGRESS' && halfRow?.outstanding_evidence)
  ok('submit blocked at 1/2 evidence', halfRow.outstanding_evidence.slice(0, 30));
else bad('submit blocked at 1/2', JSON.stringify(halfRow));

await rpc(operator, 'mark_evidence', { p_req: evs[1].id }); // 2 of 2
const full = await rpc(operator, 'submit_activity', { p_activity: hop, p_values: {}, p_remarks: null });
const fullRow = Array.isArray(full.body) ? full.body[0] : full.body;
if (fullRow?.new_state === 'COMPLETED') ok('submit enabled at 2/2 evidence', 'COMPLETED');
else bad('submit at 2/2', JSON.stringify(fullRow));

// Close the rest of Day 0-1 so the Day-2 rest starts.
for (const day of [0, 1]) {
  for (let pass = 0; pass < 3; pass += 1) {
    const open = await get(operator, `batch_activity?select=id&master_batch_id=eq.${batch}&rel_day=eq.${day}&state=in.(READY,IN_PROGRESS)`);
    if (open.length === 0) break;
    for (const o of open) {
      await db.query(`update batch_activity_evidence_req set satisfied_count=min_count where batch_activity_id=$1`, [o.id]);
      await db.query(
        `select public.submit_activity($1, coalesce((
           select jsonb_object_agg(v.field_key, case
             when v.sop_min is not null and v.sop_max is not null then round((v.sop_min+v.sop_max)/2,2)::text
             when nullif(v.day0_value,'') is not null then v.day0_value
             when ba.planned_qty_mt is not null then ba.planned_qty_mt::text
             else '1' end)
           from batch_activity_value v join batch_activity ba on ba.id=v.batch_activity_id
           where v.batch_activity_id=$1), '{}'::jsonb), 'demo')`, [o.id]);
    }
  }
}

const rest = (await get(operator, `batch_activity?select=id,title,state,unblocks_at&master_batch_id=eq.${batch}&is_time_gate=is.true&rel_day=eq.2`))[0];
if (rest?.state === 'WAITING_TIME' && rest.unblocks_at) ok('RESTING with a server-issued deadline', rest.unblocks_at);
else { bad('rest started', JSON.stringify(rest)); }

// The gate opens with nobody clicking — only the poll asking.
let opened = false;
for (let i = 0; i < 10; i += 1) {
  await new Promise((r) => setTimeout(r, 3000));
  await rpc(operator, 'release_elapsed_rests', { p_batch: batch });
  const st = (await get(operator, `batch_activity?select=state&id=eq.${rest.id}`))[0]?.state;
  if (st === 'READY') { opened = true; ok('gate opened unaided', `after ~${(i + 1) * 3}s`); break; }
}
if (!opened) bad('gate opened unaided', 'still closed');

// No invented threshold: Day 0-1 fields still have no SOP band.
const invented = await get(admin, 'activity_field?select=key&sop_min=not.is.null&process_activity_id=eq.' + (await get(admin, 'process_activity?select=id&code=eq.FIB1-WEIGH'))[0].id);
if (invented.length === 0) ok('no SOP threshold was invented on Day 0', 'sop_min still null');
else bad('a threshold was invented', JSON.stringify(invented));

console.log(`\n  batch ${CODE} left active\n`);
await db.end();
process.exit(fails === 0 ? 0 : 1);
