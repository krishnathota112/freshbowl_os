// Read-only audit inventory of Tasks batch creations and associated evidence.
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
const local=createRequire(import.meta.url),sibling=createRequire(new URL('../../mushroomos/package.json',import.meta.url));
function dep(n){try{return local(n);}catch{return sibling(n);}}
dep('dotenv').config({path:existsSync(new URL('.env.local',import.meta.url))?new URL('.env.local',import.meta.url):new URL('../../mushroomos/.env.local',import.meta.url),quiet:true});
const db=new (dep('pg').Client)({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false},statement_timeout:30000});
await db.connect();
try{
 await db.query('begin read only');
 const creations=(await db.query("select id,entity_id,occurred_at,action,coalesce(after_state->>'name',after_state->'batch'->>'name',after_state->'after'->'batch'->>'name',before_state->'batch'->>'name') as name,case when jsonb_typeof(after_state->'after'->'rows')='array' then jsonb_array_length(after_state->'after'->'rows') else null end as snapshot_rows from public.audit_event where entity_table='tk_batch' order by occurred_at desc limit 100")).rows;
 const activity=(await db.query("select date_trunc('day',occurred_at) as event_date,action,count(*)::int n from public.audit_event where entity_table in ('tk_task','tk_photo','tk_reading','tk_decision') group by 1,2 order by 1 desc,2 limit 80")).rows;
 const known=(await db.query("select id,entity_id,occurred_at,action,coalesce(after_state->>'name',after_state->'batch'->>'name',after_state->'after'->'batch'->>'name') as name from public.audit_event where entity_id=any($1::text[]) order by occurred_at",[['5054bdb7-c66f-408a-9b57-fbd50eb99756','5e1702a6-b053-4c0f-bd63-f7e97c2cf285']])).rows;
 const snapshots=(await db.query("with ranked as (select entity_id,occurred_at,after_state->'after' as snap,row_number() over(partition by entity_id order by occurred_at desc,id desc) rn from public.audit_event where entity_table='tk_batch' and action='tk_batch_plan_edit') select entity_id,occurred_at,snap->'batch'->>'name' as name,jsonb_array_length(snap->'rows') as rows,(select count(*)::int from jsonb_array_elements(snap->'rows') r where r->>'status' <> 'todo') as progressed,(select count(*)::int from jsonb_array_elements(snap->'rows') r where r->>'note' is not null or r->>'answer' is not null) as notes_or_answers from ranked where rn=1 order by occurred_at desc")).rows;
 const batchAuditDetails=(await db.query("select action,entity_table,count(*)::int n,min(occurred_at) first_at,max(occurred_at) last_at from public.audit_event where action like 'tk_%' group by 1,2 order by n desc limit 60")).rows;
 const latestActions=(await db.query("select occurred_at,action,entity_table,entity_id from public.audit_event where action like 'tk_%' order by occurred_at desc limit 8")).rows;
 const extension=(await db.query("select exists(select 1 from pg_extension where extname='pg_stat_statements') enabled")).rows[0].enabled;
 let deleteStatements=[];
 if(extension){try{deleteStatements=(await db.query("select left(query,240) query,calls from pg_stat_statements where query ilike '%delete%tk_batch%' or query ilike '%delete%tk_photo%' or query ilike '%delete%storage.objects%' order by calls desc limit 20")).rows;}catch(e){deleteStatements=[{unavailable:e.code||e.message}];}}
 const counts={};for(const t of ['tk_batch','tk_task','tk_photo','tk_reading','tk_decision'])counts[t]=(await db.query('select count(*)::int n from public.'+t)).rows[0].n;
 const stored=(await db.query("select count(*)::int n from storage.objects where bucket_id='tasks'")).rows[0].n;
 console.log(JSON.stringify({counts,storedTaskObjects:stored,creations,activity,known,snapshots,batchAuditDetails,latestActions,deleteStatements},null,2));
 await db.query('rollback');
}finally{await db.end();}
