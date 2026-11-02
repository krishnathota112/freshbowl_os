// Read-only: identify which batch system contains the owner's records.
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
const local=createRequire(import.meta.url),sibling=createRequire(new URL('../../mushroomos/package.json',import.meta.url));
function dep(n){try{return local(n);}catch{return sibling(n);}}
dep('dotenv').config({path:existsSync(new URL('.env.local',import.meta.url))?new URL('.env.local',import.meta.url):new URL('../../mushroomos/.env.local',import.meta.url),quiet:true});
const db=new (dep('pg').Client)({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false},statement_timeout:30000});
await db.connect();
try{
 await db.query('begin read only');
 const tasks=(await db.query('select id,name,status,created_at from public.tk_batch order by created_at desc limit 20')).rows;
 const taskView=(await db.query('select id,name,status,tasks,done from public.tk_v_batch order by created_at desc limit 20')).rows;
 const weighments=(await db.query('select b.id,b.batch_no,b.status,b.created_at,count(r.id)::int materials from public.wb_batch b left join public.wb_requirement r on r.wb_batch_id=b.id group by b.id order by b.created_at desc limit 20')).rows;
 const master=(await db.query('select id,code,status,created_at from public.master_batch order by created_at desc limit 20')).rows;
 const counts={};
 for(const t of ['tk_batch','wb_batch','master_batch'])counts[t]=(await db.query('select status::text,count(*)::int n from public.'+t+' group by status order by status')).rows;
 console.log(JSON.stringify({counts,tasks,taskView,weighments,master},null,2));
 await db.query('rollback');
}finally{await db.end();}
