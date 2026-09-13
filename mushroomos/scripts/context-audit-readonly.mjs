// Read-only context comparison. Does not call application RPCs or execute tests.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const pg = require('pg');
const dotenv = require('dotenv');
const env = dotenv.parse(readFileSync(new URL('../.env.local', import.meta.url)));
const db = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000, statement_timeout: 20000, options: '-c default_transaction_read_only=on' });
const out = { capturedAt: new Date().toISOString(), mode: 'read-only; catalog inspection, no behavioral mutation probes' };
try {
  await db.connect();
  await db.query('BEGIN READ ONLY');
  const q = async (key, sql) => { out[key] = (await db.query(sql)).rows; };
  await q('session', 'select now() as server_now, current_setting(\'transaction_read_only\') as read_only');
  await q('relations', "select c.relname,c.relkind,c.relrowsecurity,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v','m') order by 1");
  await q('columns', "select table_name,column_name,data_type,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position");
  await q('functions', "select p.proname,pg_get_function_identity_arguments(p.oid) as args,p.prosecdef,p.proacl,pg_get_functiondef(p.oid) as body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e') order by 1");
  await q('views', "select viewname,definition from pg_views where schemaname='public' order by 1");
  await q('triggers', "select c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal order by 1,2");
  await q('policies', "select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by 1,2");
  await q('grants', "select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') order by 1,2,3");
  for (const table of ['v_process_catalogue','process_catalogue','process_definition','process_activity','lab_checkpoint_activity','lab_checkpoint','lab_spec','lab_setting','lab_approval_reading','extension_policy','factory_clock','dev_environment_marker','resource_requirement','vessel_scope_map','gate_rule']) {
    await q(table, `select * from public.${table}`);
  }
  await q('batches', `select mb.id,mb.code,mb.status,mb.is_demo,mb.config,mb.process_definition_id,mb.start_at,
    (select count(*) from batch_activity a where a.master_batch_id=mb.id) as activities,
    (select count(*) from batch_activity a where a.master_batch_id=mb.id and a.state='COMPLETED') as completed,
    (select count(*) from lab_sample s where s.master_batch_id=mb.id) as samples,
    (select count(*) from lab_decision d join batch_activity a on a.id=d.batch_activity_id where a.master_batch_id=mb.id) as decisions
    from master_batch mb order by mb.code`);
  await q('lab_evidence_counts', `select mb.code,
    count(distinct a.id) filter (where a.responsible_role='lab_tech') as lab_activities,
    count(distinct a.id) filter (where a.responsible_role='lab_tech' and a.state='COMPLETED' and not exists(select 1 from lab_sample s where s.batch_activity_id=a.id)) as completed_lab_without_sample,
    (select count(*) from evidence_media e where e.master_batch_id=mb.id) as evidence_rows
    from master_batch mb left join batch_activity a on a.master_batch_id=mb.id group by mb.id,mb.code order by mb.code`);
  const dir = new URL('../../docs/04-audit/context-comparison-2026-09-13/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('database-readonly.json', dir), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({mode:out.mode,session:out.session,relations:out.relations.length,functions:out.functions.length,catalogue:out.v_process_catalogue,batches:out.batches,labEvidence:out.lab_evidence_counts},null,2));
} catch(e) { console.error(JSON.stringify({code:e.code,message:e.message})); process.exitCode=1; }
finally { await db.query('ROLLBACK').catch(()=>{}); await db.end().catch(()=>{}); }
