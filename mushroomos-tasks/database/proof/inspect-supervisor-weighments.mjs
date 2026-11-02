import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
const local=createRequire(import.meta.url),sibling=createRequire(new URL('../../../mushroomos/package.json',import.meta.url));
function dep(n){try{return local(n);}catch{return sibling(n);}}
const env=new URL('../.env.local',import.meta.url);
dep('dotenv').config({path:existsSync(env)?env:new URL('../../../mushroomos/.env.local',import.meta.url)});
const db=new (dep('pg').Client)({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false},statement_timeout:30000});
await db.connect();
try{
 const master=(await db.query("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='wb_batch' and column_name='master_batch_id') installed")).rows[0].installed;
 const slip=(await db.query("select pg_get_functiondef('public.wb_add_slip(uuid,text,text,text,numeric,numeric,numeric,text)'::regprocedure) body")).rows[0].body;
 const views=(await db.query("select viewname, definition from pg_views where schemaname='public' and viewname in ('wb_v_requirement','wb_v_slip') order by viewname")).rows.map(r=>({view:r.viewname,supervisor:r.definition.includes('supervisor')}));
 console.log(JSON.stringify({masterLinkInstalled:master,slipAllowsSupervisor:slip.includes("'supervisor'"),views},null,2));
}finally{await db.end();}
