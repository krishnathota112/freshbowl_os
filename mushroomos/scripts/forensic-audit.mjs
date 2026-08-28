import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: './.env.local' });

const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

console.log('================================================================================');
console.log('PART 18 — FORENSIC AUDIT OF DEVELOPMENT DATABASE & PLAN GENERATOR');
console.log('================================================================================\n');

// A/D. Process Definitions
console.log('--- A/D. PROCESS DEFINITIONS ---');
const procDefs = await c.query('select id, code, version, status, name from process_definition');
console.table(procDefs.rows);

// A/B/C. Current Master Batches
console.log('\n--- A/B/C. CURRENT MASTER BATCHES ---');
const batches = await c.query('select id, code, label, start_at, status, process_definition_id from master_batch order by created_at desc limit 5');
console.table(batches.rows);

const activeBatch = batches.rows.find(b => b.code === 'MB-2026-366-368') || batches.rows[0];
console.log(`Auditing target master batch: ID = ${activeBatch.id}, CODE = ${activeBatch.code}, START_AT = ${activeBatch.start_at}`);

// E/F. Process Activity Definition for FIB1-WEIGH
console.log('\n--- E/F. PROCESS_ACTIVITY FOR FIB1-WEIGH ---');
const paWeigh = await c.query("select id, code, label_template, rel_day, seq, scope, cardinality_rule, standard_start_hour, standard_end_hour, standard_hour_source from process_activity where code like '%WEIGH%' or code like '%FIB%'");
console.table(paWeigh.rows);

// E. Batch Activity Instances for FIB1-WEIGH
console.log('\n--- E. ALL BATCH_ACTIVITY ROWS FOR FIB1-WEIGH ---');
const baWeigh = await c.query(`select id, code, title, seq, scope, scope_label, instance_no, instance_count, baseline_start_hour, baseline_end_hour, state, actual_start, actual_end from batch_activity where master_batch_id = '${activeBatch.id}' and (code like '%WEIGH%' or code like '%FIB%') order by seq, instance_no`);
console.table(baWeigh.rows);

// H. All Process Activities in PROCESS-2026B
console.log('\n--- H. ALL PROCESS_ACTIVITIES IN PROCESS-2026B ---');
const paAll = await c.query(`
  select pa.id, pa.code, pa.label_template, pa.rel_day, pa.seq, pa.scope,
         pa.cardinality_rule, pa.standard_start_hour, pa.standard_end_hour,
         pa.duration_target_min_hr, pa.duration_target_max_hr, pa.stream
  from process_activity pa
  join process_definition pd on pd.id = pa.process_definition_id
  where pd.code = 'PROCESS-2026B'
  order by pa.rel_day, pa.seq
`);
console.table(paAll.rows);

// H/I. Generated Batch Activity Rows in Active Batch
console.log('\n--- H/I. GENERATED BATCH_ACTIVITY ROWS IN ACTIVE BATCH ---');
const baAll = await c.query(`
  select id, code, title, scope, scope_label, instance_no, rel_day, seq,
         baseline_start_hour, baseline_end_hour, state
  from batch_activity
  where master_batch_id = '${activeBatch.id}'
  order by baseline_start_hour, rel_day, seq, instance_no
`);
console.table(baAll.rows);

// K. Turner & Piles
console.log('\n--- K. PILES / TURNER PROCESS_ACTIVITIES & SCOPES ---');
const paPiles = await c.query(`
  select code, label_template, rel_day, seq, scope, cardinality_rule,
         standard_start_hour, standard_end_hour, duration_target_min_hr, duration_target_max_hr
  from process_activity
  where code like 'TR-%' or code like 'P1-%' or code like 'PILE%'
  order by rel_day, seq
`);
console.table(paPiles.rows);

// L. Individual Sub-Batches
console.log('\n--- L. INDIVIDUAL SUB-BATCHES IN DATABASE ---');
const ibs = await c.query(`select id, master_batch_id, batch_no, seq from individual_batch where master_batch_id = '${activeBatch.id}' order by seq`);
console.table(ibs.rows);

// Movements
console.log('\n--- TUNNEL MOVEMENTS & ALLOCATIONS ---');
const bms = await c.query(`select bm.id, bm.movement_code, bm.individual_batch_id, ib.batch_no, bm.from_location_id, bm.to_location_id, l.code as to_code, l.label as to_label from batch_movement bm left join individual_batch ib on ib.id = bm.individual_batch_id left join location l on l.id = bm.to_location_id where bm.master_batch_id = '${activeBatch.id}'`);
console.table(bms.rows);

// Evaluate Cardinality Function
console.log('\n--- EVALUATE_CARDINALITY DEFINITION ---');
const cardFunc = await c.query("select pg_get_functiondef(oid) as def from pg_proc where proname = 'evaluate_cardinality'");
console.log(cardFunc.rows[0]?.def);

await c.end();
