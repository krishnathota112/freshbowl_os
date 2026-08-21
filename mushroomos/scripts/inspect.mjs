#!/usr/bin/env node
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

const fns = await c.query(`
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('generate_batch_plan','generate_activity_plan','create_master_batch',
                      'activate_batch','evaluate_cardinality','resolve_activity_label',
                      'scope_count_field','scope_noun','fn_instance_count','fn_config_number',
                      'fn_scope_count_field','submit_activity','mark_evidence')
  order by 1`);
console.log('\nFUNCTIONS PRESENT');
for (const r of fns.rows) console.log('  ' + r.fn);

const routing = await c.query(`
  select 'template' src, responsible_role::text role, count(*)::int n
  from process_activity group by 1,2
  union all
  select 'instance', responsible_role::text, count(*)::int
  from batch_activity group by 1,2
  order by 1,2`);
console.log('\nROUTING');
for (const r of routing.rows) console.log(`  ${r.src.padEnd(9)} ${String(r.role).padEnd(10)} ${r.n}`);

const labs = await c.query(`
  select code, responsible_role::text role, rel_day, array_length(lab_parameters,1) params
  from process_activity where code like 'LAB-%' order by seq`);
console.log('\nLAB TEMPLATES');
for (const r of labs.rows) console.log(`  ${r.code.padEnd(22)} ${r.role} · day ${r.rel_day} · ${r.params} params`);
await c.end();
