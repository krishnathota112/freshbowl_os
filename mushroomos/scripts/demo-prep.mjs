#!/usr/bin/env node
// Prepares the demo: one fully-planned ACTIVE batch as a fallback, and leaves the stage
// clear for building a fresh one live.

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

// Start clean.
await c.query(`delete from master_batch`);

const cfgRows = await c.query(
  `select pa.code from process_activity pa
   join process_definition pd on pd.id = pa.process_definition_id
   where pd.code = 'PROCESS-2026B' and pa.is_time_gate`
);
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
for (const r of cfgRows.rows) cfg['rest_hr_' + r.code] = 48;

const roles = [
  { role: 'PRIMARY_FIBRE', material_code: 'BAGASSE_NEW', lead: true },
  { role: 'STRUCTURAL_STRAW', material_code: 'PADDY_PUNJAB', lead: true },
  { role: 'NITROGEN_SOURCE', material_code: 'CHICKEN_MANURE', lead: true },
  { role: 'MINERAL', material_code: 'GYPSUM', lead: true },
];

// ── The fallback: a batch already laid out and running ────────────────────────
const made = await c.query(
  `select public.create_master_batch($1,$2,$3,$4,$5,$6,$7) id`,
  ['MB-2026-09-20', 'MB-2026-09-20', '2026-09-20', JSON.stringify(cfg),
   JSON.stringify(roles), 'Ramarao', 'Clear, humid']
);
const id = made.rows[0].id;

// Fill in every choice so validation is clean and nothing looks half-done.
const people = await c.query(`select id, role::text from profiles where is_active`);
const op = people.rows.find((p) => p.role === 'operator').id;
const lab = people.rows.find((p) => p.role === 'lab_tech').id;

const bunkers = (await c.query(`select id, code from location where kind='BUNKER' order by code`)).rows;
const tunnels = (await c.query(`select id, code from location where kind='TUNNEL' order by code`)).rows;
const turners = (await c.query(`select id, code from machine where kind='TURNER' order by code`)).rows;

// Assignee on every row: lab work to the technician, everything else to the operator.
await c.query(
  `update batch_activity
      set assigned_person_id =
            case when responsible_role = 'lab_tech' then $2::uuid else $3::uuid end
    where master_batch_id = $1`,
  [id, lab, op]
);

// Vessels. Stage-0 fill then a reload into a different bunker.
await c.query(
  `update batch_activity set destination_location_id = $2
    where master_batch_id = $1 and code = 'FIB1-BUNK-LOAD'`,
  [id, bunkers[2].id]
);
await c.query(
  `update batch_activity set source_location_id = $2, destination_location_id = $3
    where master_batch_id = $1 and code = 'FIB1-BUNK-RELOAD'`,
  [id, bunkers[2].id, bunkers[6].id]
);
await c.query(
  `update batch_activity set destination_location_id = $2
    where master_batch_id = $1 and code = 'STRAW-BUNK-STORE'`,
  [id, bunkers[3].id]
);

// Phase-1: line n fills bunker n, reloads into a different one.
for (let i = 1; i <= 3; i += 1) {
  await c.query(
    `update batch_activity set destination_location_id = $3
      where master_batch_id = $1 and code = 'P1-BUNK-LOAD' and instance_no = $2`,
    [id, i, bunkers[i - 1].id]
  );
  await c.query(
    `update batch_activity set source_location_id = $3, destination_location_id = $4
      where master_batch_id = $1 and code = 'P1-BUNK-RELOAD' and instance_no = $2`,
    [id, i, bunkers[i - 1].id, bunkers[7 + i - 1].id]
  );
  await c.query(
    `update batch_activity set destination_location_id = $3
      where master_batch_id = $1 and code = 'TN-LOAD' and instance_no = $2`,
    [id, i, tunnels[i - 1].id]
  );
}

// Two turners: T1 on one, T2 on the other. This is the parallelism.
await c.query(
  `update batch_activity set assigned_machine_id = $2
    where master_batch_id = $1 and code = 'TR-T1'`,
  [id, turners[0].id]
);
await c.query(
  `update batch_activity set assigned_machine_id = $2
    where master_batch_id = $1 and code = 'TR-T2'`,
  [id, turners[1].id]
);

// The hopper passes need a mode chosen, since Auto is unavailable.
await c.query(
  `update batch_activity set variant_code = 'WATER'
    where master_batch_id = $1 and code in ('FIB1-HOP-2','FIB1-HOP-3')`,
  [id]
);

const findings = await c.query(`select severity, count(*)::int n from public.validate_batch($1) group by 1`, [id]);
console.log('\nvalidation before activation:');
for (const f of findings.rows) console.log(`  ${f.severity.padEnd(9)} ${f.n}`);

const blocking = findings.rows.find((f) => f.severity === 'blocking');
if (!blocking) {
  await c.query(`select public.activate_batch($1)`, [id]);
  console.log('\n  MB-2026-09-20 activated as the fallback batch');
} else {
  const detail = await c.query(
    `select message from public.validate_batch($1) where severity='blocking' limit 5`, [id]
  );
  console.log('\n  left as a draft — blocking findings remain:');
  for (const d of detail.rows) console.log(`    ${d.message}`);
}

const summary = await c.query(
  `select count(*)::int total,
          sum(case when state='READY' then 1 else 0 end)::int ready,
          sum(case when responsible_role='lab_tech' then 1 else 0 end)::int lab
     from batch_activity where master_batch_id = $1`, [id]
);
const s = summary.rows[0];
console.log(`  ${s.total} tasks · ${s.ready} open now · ${s.lab} lab checks\n`);
await c.end();
