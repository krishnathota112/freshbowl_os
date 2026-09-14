import pg from 'pg'; import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const q=async(l,s)=>{const r=await c.query(s);console.log('\n== '+l+' ==');console.table(r.rows);};
await q('profiles privileges',`select grantee,privilege_type from information_schema.role_table_grants
 where table_name='profiles' and grantee in ('anon','authenticated') order by 1,2`);
await q('profiles policies',`select policyname,cmd,roles::text,qual,with_check from pg_policies where tablename='profiles'`);
await q('profiles columns',`select column_name,data_type from information_schema.columns
 where table_name='profiles' and table_schema='public' order by ordinal_position`);
await q('auth.uid exists',`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='auth' and p.proname='uid'`);
await q('tables with INSERT/UPDATE granted to authenticated',`
 select table_name, string_agg(privilege_type,',') g from information_schema.role_table_grants
 where table_schema='public' and grantee='authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
 group by 1 order by 1`);
await c.end();
