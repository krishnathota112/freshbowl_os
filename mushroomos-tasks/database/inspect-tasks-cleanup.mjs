// Read-only inventory for the owner's requested Tasks-app cleanup. Never prints credentials.
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
const local=createRequire(import.meta.url),sibling=createRequire(new URL('../../mushroomos/package.json',import.meta.url));
function dep(n){try{return local(n);}catch{return sibling(n);}}
dep('dotenv').config({path:existsSync(new URL('.env.local',import.meta.url))?new URL('.env.local',import.meta.url):new URL('../../mushroomos/.env.local',import.meta.url),quiet:true});
const db=new (dep('pg').Client)({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false},statement_timeout:30000});
await db.connect();
try {
 await db.query('begin read only');
 const batches=(await db.query('select id,name,status,created_at from public.tk_batch order by created_at')).rows;
 const counts={};
 for(const table of ['tk_batch','tk_task','tk_photo','tk_reading','tk_decision','wb_requirement','wb_slip','wb_alert','tk_sop','tk_sop_row','profiles','wb_material']) counts[table]=(await db.query('select count(*)::int n from public.'+table)).rows[0].n;
 const objects=(await db.query("select bucket_id,count(*)::int files,coalesce(sum((metadata->>'size')::bigint),0)::text bytes from storage.objects group by bucket_id order by bucket_id")).rows;
 const fks=(await db.query("select conrelid::regclass::text child,confrelid::regclass::text parent,pg_get_constraintdef(oid) definition from pg_constraint where contype='f' and confrelid in ('public.tk_batch'::regclass,'public.tk_task'::regclass,'public.tk_photo'::regclass,'public.tk_reading'::regclass,'public.tk_decision'::regclass,'public.wb_requirement'::regclass,'public.wb_slip'::regclass,'public.wb_alert'::regclass) order by parent,child")).rows;
 const triggers=(await db.query("select c.relname,t.tgname,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname in ('tk_batch','tk_task','tk_photo','tk_reading','tk_decision','wb_requirement','wb_slip','wb_alert') and not t.tgisinternal")).rows;
 const keys=['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SERVICE_KEY','SUPABASE_SECRET_KEY','SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL','VITE_SUPABASE_URL','SUPABASE_ACCESS_TOKEN'].filter(k=>!!process.env[k]);
 console.log(JSON.stringify({batches,counts,storageBuckets:objects,foreignKeys:fks,triggers,availableCredentialNames:keys},null,2));
 await db.query('rollback');
}finally{await db.end();}
