// One-time additive 0160 install. Saves a fresh safety copy and refuses any existing-row/photo change.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const local=createRequire(import.meta.url),sibling=createRequire(new URL('../../mushroomos/package.json',import.meta.url));
function dep(name){try{return local(name);}catch{return sibling(name);}}
const env=new URL('.env.local',import.meta.url);
dep('dotenv').config({path:existsSync(env)?env:new URL('../../mushroomos/.env.local',import.meta.url),quiet:true});
const backup=new URL('recovery/tasks-before-0160-2026-10-01.json',import.meta.url);
if(existsSync(backup))throw Error('Safety copy already exists; refusing to overwrite or reapply.');
const migration=readFileSync(new URL('0160_process_time_sop.sql',import.meta.url),'utf8');
const safe=migration.replace(/--[^\n]*/g,'').replace(/\bon\s+delete\s+restrict\b/gi,'');
if(/\b(?:drop|delete|truncate)\b/i.test(safe))throw Error('Migration contains a destructive SQL verb.');
const pg=dep('pg'),client=new pg.Client({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false},statement_timeout:120000});
const tables=['tk_sop','tk_sop_row','tk_batch','tk_task','tk_photo','tk_reading','tk_decision'];
async function fingerprint(){
  const out={};
  for(const table of tables){const {rows}=await client.query(`select count(*)::int n,md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) hash from public.${table} t`);out[table]=rows[0];}
  const {rows}=await client.query("select count(*)::int n,md5(coalesce(jsonb_agg(to_jsonb(o) order by id)::text,'')) hash from storage.objects o where bucket_id='tasks'");
  out.photos_storage=rows[0];return out;
}
await client.connect();let committed=false;
try{
  await client.query('begin isolation level repeatable read');
  await client.query("set local lock_timeout='5s'");
  const {rows:installed}=await client.query("select to_regclass('public.tk_process_time_standard') is not null standard, to_regclass('public.tk_process_time_revision') is not null revision, to_regprocedure('public.tk_process_time_save(jsonb)') is not null save_rpc");
  if(Object.values(installed[0]).some(Boolean))throw Error('0160 is already installed or partially present; refusing to reapply.');
  const before=await fingerprint(),copy={createdAt:new Date().toISOString(),counts:before,tables:{}};
  for(const table of tables){const {rows}=await client.query(`select to_jsonb(t) row from public.${table} t order by id`);copy.tables[table]=rows.map(x=>x.row);}
  const objects=await client.query("select to_jsonb(o) row from storage.objects o where bucket_id='tasks' order by id");
  copy.tables.photos_storage=objects.rows.map(x=>x.row);
  writeFileSync(backup,JSON.stringify(copy,null,2)+'\n',{flag:'wx'});
  await client.query(migration);
  const after=await fingerprint();
  assert.deepEqual(after,before,'Existing Tasks rows or photo metadata changed; refusing to commit.');
  await client.query('commit');committed=true;
  console.log(JSON.stringify({committed:true,existingUnchanged:true,safetyCopy:'database/recovery/tasks-before-0160-2026-10-01.json',counts:Object.fromEntries(Object.entries(before).map(([k,v])=>[k,v.n]))}));
}catch(error){if(!committed)await client.query('rollback').catch(()=>{});throw error;}
finally{await client.end();}
