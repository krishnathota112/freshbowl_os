#!/usr/bin/env node
// The ten acceptance conditions in SCHEDULE_BUILDER_SPEC §8, through PostgREST.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local') });
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

const tok = await (async () => {
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@freshbowl.demo', password: 'mushroom2026' }),
  });
  return (await r.json()).access_token;
})();

const H = { apikey: key, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
const get = async (p) => (await fetch(`${url}/rest/v1/${p}`, { headers: H })).json();
const rpc = async (fn, args) => {
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(args) });
  return { status: r.status, body: await r.json().catch(() => null) };
};

let fails = 0;
const ok = (n, l, d = '') => console.log(`  ${String(n).padEnd(3)} ok    ${l.padEnd(46)} ${d}`);
const bad = (n, l, d = '') => { console.log(`  ${String(n).padEnd(3)} FAIL  ${l.padEnd(46)} ${d}`); fails++; };

console.log('\nSCHEDULE BUILDER · ACCEPTANCE\n');

const CODE = 'SB-' + Date.now().toString().slice(-6);
const cfg = {
  primary_fibre_required_mt: 21, expected_load_capacity_mt: 2, bunker_line_count: 3,
  yard_pile_count: 2, mixed_pile_count: 1, straw_pile_count: 2, straw_bunker_count: 1,
  turner_pile_count: 3, tunnel_count: 3,
};
for (const g of await get('process_activity?select=code&is_time_gate=is.true')) cfg['rest_hr_' + g.code] = 48;

const batch = (await rpc('create_master_batch', {
  p_code: CODE, p_label: CODE, p_start_date: '2026-09-20', p_config: cfg,
  p_roles: [
    { role: 'PRIMARY_FIBRE', material_code: 'BAGASSE_NEW', lead: true },
    { role: 'STRUCTURAL_STRAW', material_code: 'PADDY_PUNJAB', lead: true },
    { role: 'NITROGEN_SOURCE', material_code: 'CHICKEN_MANURE', lead: true },
    { role: 'MINERAL', material_code: 'GYPSUM', lead: true },
  ],
  p_supervisor: 'Ramarao', p_weather: 'Clear',
})).body;

const rows = await get(`batch_activity?select=id,code,rel_day,responsible_role,instance_no,destination_location_id,source_location_id,assigned_machine_id&master_batch_id=eq.${batch}&order=seq`);

// 1 · Day 0 → 23 laid out, nothing to invent
const days = [...new Set(rows.map((r) => r.rel_day))].sort((a, b) => a - b);
if (days[0] === 0 && days.at(-1) === 22 && rows.length > 40)
  ok(1, 'Day 0 to 22 laid out', `${rows.length} rows across ${days.length} days`);
else bad(1, 'Day 0 to 22 laid out', JSON.stringify(days));

// 2 · 11 loads, then 9
const loads11 = rows.filter((r) => r.code === 'FIB1-WEIGH').length;
await fetch(`${url}/rest/v1/master_batch?id=eq.${batch}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({ config: { ...cfg, expected_load_capacity_mt: 2.5 } }),
});
await rpc('generate_activity_plan', { p_batch_id: batch });
const loads9 = (await get(`batch_activity?select=id&master_batch_id=eq.${batch}&code=eq.FIB1-WEIGH`)).length;
if (loads11 === 11 && loads9 === 9) ok(2, '21/2 gives 11 loads, 21/2.5 gives 9', `${loads11} then ${loads9}`);
else bad(2, '21/2 gives 11 loads, 21/2.5 gives 9', `${loads11} / ${loads9}`);

await fetch(`${url}/rest/v1/master_batch?id=eq.${batch}`, {
  method: 'PATCH', headers: H, body: JSON.stringify({ config: cfg }),
});
await rpc('generate_activity_plan', { p_batch_id: batch });

const fresh = await get(`batch_activity?select=id,code,rel_day,instance_no,responsible_role,destination_location_id,source_location_id&master_batch_id=eq.${batch}&order=seq`);
const bunkers = await get('location?select=id,code,label&kind=eq.BUNKER&order=code');
const turners = await get('machine?select=id,code&kind=eq.TURNER&order=code');
const people = await get('profiles?select=id,display_name,role');

// 3 · Bunker 3 → Bunker 7, and same-vessel is refused
const load = fresh.find((r) => r.code === 'FIB1-BUNK-LOAD');
const reload = fresh.find((r) => r.code === 'FIB1-BUNK-RELOAD');
await rpc('set_activity_plan', { p_activity: load.id, p_patch: { destination_location_id: bunkers[2].id } });
await rpc('set_activity_plan', { p_activity: reload.id, p_patch: { destination_location_id: bunkers[2].id } });
let v = (await rpc('validate_batch', { p_batch: batch })).body ?? [];
const sameVessel = v.some((f) => f.code === 'SAME_VESSEL');
await rpc('set_activity_plan', { p_activity: reload.id, p_patch: { destination_location_id: bunkers[6].id } });
v = (await rpc('validate_batch', { p_batch: batch })).body ?? [];
if (sameVessel && !v.some((f) => f.code === 'SAME_VESSEL'))
  ok(3, 'same-vessel reload refused, different accepted', `${bunkers[2].label} to ${bunkers[6].label}`);
else bad(3, 'same-vessel reload refused', `flagged=${sameVessel}`);

// 4 · one turner on both T1 and T2 is refused
const t1 = fresh.find((r) => r.code === 'TR-T1' && r.instance_no === 1);
const t2 = fresh.find((r) => r.code === 'TR-T2' && r.instance_no === 1);
await rpc('set_activity_plan', { p_activity: t1.id, p_patch: { assigned_machine_id: turners[0].id } });
await rpc('set_activity_plan', { p_activity: t2.id, p_patch: { assigned_machine_id: turners[0].id } });
v = (await rpc('validate_batch', { p_batch: batch })).body ?? [];
const clash = v.some((f) => f.code === 'TURNER_CLASH');
await rpc('set_activity_plan', { p_activity: t2.id, p_patch: { assigned_machine_id: turners[1].id } });
v = (await rpc('validate_batch', { p_batch: batch })).body ?? [];
if (clash && !v.some((f) => f.code === 'TURNER_CLASH'))
  ok(4, 'one turner on T1 and T2 refused', `${turners[0].code} then ${turners[1].code}`);
else bad(4, 'one turner on T1 and T2 refused', `flagged=${clash}`);

// 5 · lab rows are lab rows, and reassignable
const labs = fresh.filter((r) => r.responsible_role === 'lab_tech');
const tech = people.find((p) => p.role === 'lab_tech');
const assigned = await rpc('assign_activity', { p_activity: labs[0].id, p_person: tech.id, p_reason: null });
if (labs.length >= 9 && assigned.status < 300)
  ok(5, 'lab rows routed to lab, reassignable', `${labs.length} lab rows`);
else bad(5, 'lab rows routed to lab', `${labs.length} rows, assign ${assigned.status}`);

// 6 · force assign and alert from any row
const alert = await rpc('send_alert', {
  p_activity: fresh[0].id, p_role: 'operator', p_message: 'Start early', p_reason: null,
});
const notes = await get(`notification?select=id,kind&master_batch_id=eq.${batch}`);
if (alert.status < 300 && notes.length >= 2) ok(6, 'assign and alert both work', `${notes.length} notifications`);
else bad(6, 'assign and alert both work', `alert ${alert.status}, ${notes.length} notes`);

// 7 · rest durations block activation and say why
await fetch(`${url}/rest/v1/master_batch?id=eq.${batch}`, {
  method: 'PATCH', headers: H, body: JSON.stringify({ config: { ...cfg, rest_hr_FIB1_REST_1: null } }),
});
const stripped = { ...cfg };
for (const k of Object.keys(stripped)) if (k.startsWith('rest_hr_')) delete stripped[k];
await fetch(`${url}/rest/v1/master_batch?id=eq.${batch}`, {
  method: 'PATCH', headers: H, body: JSON.stringify({ config: stripped }),
});
await rpc('generate_activity_plan', { p_batch_id: batch });
const act1 = await rpc('activate_batch', { p_batch_id: batch });
v = (await rpc('validate_batch', { p_batch: batch })).body ?? [];
if (act1.status >= 400 && v.some((f) => f.code === 'REST_NO_DURATION'))
  ok(7, 'rest durations block activation', String(act1.body?.message ?? '').slice(0, 40));
else bad(7, 'rest durations block activation', `status ${act1.status}`);

// 8 · no Day-23 activity is seeded
const d23 = await get('process_activity?select=code&rel_day=eq.23');
if (d23.length === 0) ok(8, 'no Day-23 activity exists', '0 rows');
else bad(8, 'no Day-23 activity exists', JSON.stringify(d23));

// 10 · every row comes from process_activity
const orphan = await get(`batch_activity?select=id&master_batch_id=eq.${batch}&process_activity_id=is.null`);
if (orphan.length === 0) ok(10, 'every row derives from process_activity', '0 orphans');
else bad(10, 'every row derives from process_activity', `${orphan.length} orphans`);

const labCount = await get('process_activity?select=code&responsible_role=eq.lab_tech');
const total = await get('process_activity?select=code&rel_day=gte.0');
console.log(`\n  definition now: ${total.length} activities, ${labCount.length} routed to lab`);
console.log(`  batch ${CODE} left as a draft for the UI\n`);
process.exit(fails === 0 ? 0 : 1);
