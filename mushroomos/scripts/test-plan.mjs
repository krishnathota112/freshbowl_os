#!/usr/bin/env node
// Creates a batch through the real function and prints the generated plan.

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

const code = `MB-TEST-${Date.now().toString().slice(-6)}`;

const config = {
  primary_fibre_required_mt: 21,
  expected_load_capacity_mt: 2,
  bunker_line_count: 3,
  yard_pile_count: 2,
  mixed_pile_count: 1,
  straw_pile_count: 2,
  straw_bunker_count: 1,
  turner_pile_count: 3,
  tunnel_count: 3,
  'rest_hr_FIB1-REST-1': 48,
  'rest_hr_STRAW-REST-1': 12,
  'rest_hr_STRAW-REST-2': 15,
  'rest_hr_YD-REST': 9,
  'rest_hr_P1-REST-1': 48,
  'rest_hr_P1-REST-2': 44,
  'rest_hr_TN-HOLD': 144,
};

const roles = [
  { role: 'PRIMARY_FIBRE', material_code: 'BAGASSE_NEW', lead: true },
  { role: 'STRUCTURAL_STRAW', material_code: 'PADDY_PUNJAB', lead: true },
  { role: 'NITROGEN_SOURCE', material_code: 'CHICKEN_MANURE', lead: true },
  { role: 'MINERAL', material_code: 'GYPSUM', lead: true },
  { role: 'MINERAL', material_code: 'AMMONIUM_SULPHATE', lead: false },
];

try {
  const { rows } = await c.query(
    `select public.create_master_batch($1,$2,$3,$4,$5,$6,$7) as id`,
    [code, '391, 392, 393', '2026-09-20', JSON.stringify(config), JSON.stringify(roles),
     'Ramarao', 'Clear']
  );
  const id = rows[0].id;
  console.log(`\ncreated ${code} · ${id}\n`);

  const summary = await c.query(
    `select count(*)::int total,
            count(*) filter (where state='READY')::int ready,
            count(*) filter (where state='WAITING_TIME')::int waiting,
            count(*) filter (where state='LOCKED')::int locked,
            count(*) filter (where blocked_reason is null and state<>'READY')::int no_reason
     from batch_activity where master_batch_id=$1`, [id]);
  console.log('plan summary:', summary.rows[0]);

  const byStream = await c.query(
    `select stream, count(*)::int n from batch_activity
     where master_batch_id=$1 group by stream order by min(seq)`, [id]);
  console.log('\nby stream:');
  for (const r of byStream.rows) console.log(`  ${r.stream.padEnd(20)} ${r.n}`);

  const loads = await c.query(
    `select scope_label, planned_qty_mt from batch_activity
     where master_batch_id=$1 and code='FIB1-WEIGH' order by instance_no`, [id]);
  console.log(`\nweighment loads (${loads.rows.length}):`);
  console.log('  ' + loads.rows.map(r => `${r.scope_label.replace('Load ','')}=${r.planned_qty_mt}`).join('  '));

  const t = await c.query(
    `select title, scope_label, state, blocked_reason from batch_activity
     where master_batch_id=$1 and code in ('TR-T1','TR-T2') order by code, instance_no`, [id]);
  console.log('\nturner passes:');
  for (const r of t.rows) console.log(`  ${r.title.padEnd(16)} ${r.scope_label.padEnd(14)} ${r.state.padEnd(8)} ${r.blocked_reason ?? ''}`);

  const sample = await c.query(
    `select rel_day, title, scope_label, state, blocked_reason
     from batch_activity where master_batch_id=$1 order by seq, instance_no limit 14`, [id]);
  console.log('\nfirst 14 steps:');
  for (const r of sample.rows) {
    console.log(`  D${String(r.rel_day).padStart(2)}  ${r.title.slice(0,34).padEnd(34)} ${r.scope_label.padEnd(14)} ${r.state.padEnd(13)} ${(r.blocked_reason ?? '').slice(0,44)}`);
  }

  await c.query(`delete from master_batch where id=$1`, [id]);
  console.log(`\ncleaned up ${code}`);
} catch (e) {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
