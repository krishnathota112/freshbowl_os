// Read-only post-install verification. Does not call any mutating RPC.
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
const local=createRequire(import.meta.url),sibling=createRequire(new URL('../../mushroomos/package.json',import.meta.url));
function dep(name){try{return local(name);}catch{return sibling(name);}}
const env=new URL('.env.local',import.meta.url);
dep('dotenv').config({path:existsSync(env)?env:new URL('../../mushroomos/.env.local',import.meta.url),quiet:true});
const saved=JSON.parse(readFileSync(new URL('recovery/tasks-before-0159-2026-10-01.json',import.meta.url),'utf8'));
const db=new (dep('pg').Client)({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false},statement_timeout:30000});
await db.connect();
try{
 await db.query('begin read only');
 const counts={};
 for(const [table,rows] of Object.entries(saved.tables)){
   const sql=table==='storage.objects:tasks' ? "select count(*)::int n from storage.objects where bucket_id='tasks'" : `select count(*)::int n from public.${table}`;
   counts[table]=(await db.query(sql)).rows[0].n;
   assert(counts[table]>=rows.length,`${table} contains fewer rows than the pre-migration safety copy`);
 }
 const newTables={};
 for(const table of ['tk_machine','tk_task_resource_revision','tk_machine_refuel']){
   newTables[table]=(await db.query(`select count(*)::int n from public.${table}`)).rows[0].n;
 }
 const functions=(await db.query("select to_regprocedure('public.tk_machine_save(uuid,text,text,boolean,boolean)') is not null as machine_save, to_regprocedure('public.tk_resources_record(uuid,integer,jsonb,bigint)') is not null as resources_record, to_regprocedure('public.tk_refuel_record(uuid,uuid,numeric,text,timestamptz,text)') is not null as refuel_record")).rows[0];
 assert(Object.values(functions).every(Boolean),'An expected RPC is missing.');
 await db.query('rollback');
 console.log(JSON.stringify({existingCounts:counts,newTables,functions}));
}finally{await db.end();}
const context={window:{}};
runInNewContext(readFileSync(new URL('../app/www/config.js',import.meta.url),'utf8'),context);
const config=context.window.MOS.config;
const response=await fetch(config.url+'/rest/v1/tk_machine?select=id&limit=0',{
 headers:{apikey:config.anon},signal:AbortSignal.timeout(15000)});
const body=await response.json().catch(()=>({}));
const code=body.code||null;
if(code==='PGRST205'||/schema cache/i.test(body.message||''))throw Error('PostgREST has not reloaded the new table yet.');
console.log(JSON.stringify({postgrestStatus:response.status,postgrestCode:code,schemaCacheHasMachine:true}));
