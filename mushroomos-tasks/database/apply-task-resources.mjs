// Purpose-specific, one-time application of additive migration 0159.
// Refuses an existing install and refuses to commit if any pre-existing Tasks row or photo-object digest changes.
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const local=createRequire(import.meta.url),sibling=createRequire(new URL('../../mushroomos/package.json',import.meta.url));
function dep(name){try{return local(name);}catch{return sibling(name);}}
const env=new URL('.env.local',import.meta.url);
dep('dotenv').config({path:existsSync(env)?env:new URL('../../mushroomos/.env.local',import.meta.url),quiet:true});
const backup=new URL('recovery/tasks-before-0159-2026-10-01.json',import.meta.url);
if(!existsSync(backup))throw Error('Read-only safety copy is missing; refusing to apply.');
const saved=JSON.parse(readFileSync(backup,'utf8'));
const migration=readFileSync(new URL('0159_task_resources.sql',import.meta.url),'utf8');
const code=migration.replace(/--[^\n]*/g,'').replace(/\bon\s+delete\s+restrict\b/gi,'');
if(/\b(?:drop|delete|truncate)\b/i.test(code))throw Error('Migration contains a destructive SQL verb; refusing to apply.');
const pg=dep('pg'),client=new pg.Client({connectionString:process.env.SUPABASE_DB_URL,
  ssl:{rejectUnauthorized:false},statement_timeout:120000});
const one=async(sql,args=[]) => (await client.query(sql,args)).rows[0];
const existing=['tk_sop','tk_sop_row','tk_batch','tk_task','tk_photo','tk_reading','tk_decision'];
async function digest(){
 const out={};
 for(const table of existing){
   out[table]=await one(`select count(*)::int n,md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) hash from public.${table} t`);
 }
 out['storage.objects:tasks']=await one("select count(*)::int n,md5(coalesce(jsonb_agg(to_jsonb(o) order by id)::text,'')) hash from storage.objects o where bucket_id='tasks'");
 return out;
}
await client.connect();
let committed=false;
try{
 await client.query('begin isolation level repeatable read');
 await client.query("set local lock_timeout='5s'");
 const installed=await one("select to_regclass('public.tk_machine') is not null as machine, to_regclass('public.tk_task_resource_revision') is not null as resource, to_regclass('public.tk_machine_refuel') is not null as fuel");
 if(installed.machine||installed.resource||installed.fuel)throw Error('0159 is already present or partially present; refusing to reapply.');
 const before=await digest();
 for(const [table,rows] of Object.entries(saved.tables)){
   if(before[table] && before[table].n<rows.length)throw Error(`${table} has fewer rows than the safety copy; refusing to apply.`);
 }
 await client.query(migration);
 const after=await digest();
 assert.deepEqual(after,before,'Existing Tasks rows or photo objects changed; refusing to commit.');
 const objects=await one("select to_regclass('public.tk_machine') is not null as machine, to_regclass('public.tk_task_resource_revision') is not null as resource, to_regclass('public.tk_machine_refuel') is not null as fuel");
 assert(objects.machine&&objects.resource&&objects.fuel,'New resource tables are missing.');
 await client.query('commit');committed=true;
 console.log(JSON.stringify({committed:true,existingUnchanged:true,counts:Object.fromEntries(Object.entries(before).map(([name,v])=>[name,v.n])),newTables:objects}));
}catch(error){
 if(!committed)await client.query('rollback').catch(()=>{});
 throw error;
}finally{await client.end();}
