import pg from 'pg'; import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const q = async (l,s)=>{const r=await c.query(s);console.log('\n== '+l+' ==');console.table(r.rows);};
await q('table privileges on batch_activity',`
 select grantee, privilege_type from information_schema.role_table_grants
 where table_name='batch_activity' and grantee in ('anon','authenticated') order by 1,2`);
await q('RLS policies on batch_activity',`
 select policyname, cmd, roles::text from pg_policies where tablename='batch_activity'`);
await q('rls enabled + forced',`
 select relname, relrowsecurity, relforcerowsecurity from pg_class where relname='batch_activity'`);
await q('functions that can write plan cols (proacl)',`
 select p.proname, p.prosecdef, coalesce(array_to_string(p.proacl,' | '),'(default: PUBLIC)') as acl
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in
  ('repoint_batch_activities','repoint_one_activity','set_batch_start_at','set_activity_plan',
   'clear_planned_time','generate_activity_plan','current_app_role') order by 1`);
await q('batches present',`select status, count(*) from master_batch group by 1`);
await c.end();
