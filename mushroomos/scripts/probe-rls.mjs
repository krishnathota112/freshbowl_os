import pg from 'pg'; import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const q=async(l,s)=>{const r=await c.query(s);console.log('\n== '+l+' =='); if(!r.rows.length)console.log('(none)'); else console.table(r.rows);};
await q('TABLES WITH RLS DISABLED (any row here is an open table)',`
 select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and not c.relrowsecurity order by 1`);
await q('WRITE POLICIES for anon/authenticated (cmd ALL/INSERT/UPDATE/DELETE)',`
 select tablename, policyname, cmd, roles::text, coalesce(qual,'-') qual, coalesce(with_check,'-') wc
 from pg_policies where schemaname='public' and cmd <> 'SELECT'
   and (roles::text like '%authenticated%' or roles::text like '%anon%' or roles::text='{public}')
 order by 1,3`);
await q('policies that call current_app_role (recursion check on profiles)',`
 select tablename,policyname from pg_policies where schemaname='public'
   and (coalesce(qual,'')||coalesce(with_check,'')) like '%current_app_role%' and tablename='profiles'`);
await c.end();
