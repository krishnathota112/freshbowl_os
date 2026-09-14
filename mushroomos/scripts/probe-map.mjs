import pg from 'pg'; import dotenv from 'dotenv'; import {writeFileSync} from 'node:fs';
dotenv.config({ path: '.env.local' });
const c=new pg.Client({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false}});
await c.connect();
const q=async s=>(await c.query(s)).rows;
const out={};
out.tables=await q(`select c.relname tbl, c.relrowsecurity rls,
   (select count(*) from pg_policies p where p.tablename=c.relname) pols,
   (select string_agg(distinct p.cmd,',') from pg_policies p where p.tablename=c.relname and p.cmd<>'SELECT') writecmds,
   (select string_agg(distinct coalesce(p.with_check,p.qual),' | ') from pg_policies p where p.tablename=c.relname and p.cmd<>'SELECT') writerule
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' order by 1`);
out.funcs=await q(`select p.proname fn, p.prosecdef secdef,
   exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          join pg_roles r on r.oid=a.grantee where r.rolname='authenticated' and a.privilege_type='EXECUTE') auth_exec,
   pg_get_function_identity_arguments(p.oid) args
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' order by 1`);
out.views=await q(`select c.relname v from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('v','m') order by 1`);
out.triggers=await q(`select c.relname tbl, t.tgname trg, p.proname fn
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and not t.tgisinternal order by 1,2`);
writeFileSync(process.env.MAPOUT, JSON.stringify(out,null,1));
console.log('tables',out.tables.length,'funcs',out.funcs.length,'views',out.views.length,'triggers',out.triggers.length);
await c.end();
