// Run 0160 inside a rolled-back transaction. Verify existing Tasks data and photos are unchanged.
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const local=createRequire(import.meta.url),sibling=createRequire(new URL('../../mushroomos/package.json',import.meta.url));
function dep(name){try{return local(name);}catch{return sibling(name);}}
const env=new URL('.env.local',import.meta.url);
dep('dotenv').config({path:existsSync(env)?env:new URL('../../mushroomos/.env.local',import.meta.url),quiet:true});
const sql=readFileSync(new URL('0160_process_time_sop.sql',import.meta.url),'utf8');
const stripped=sql.replace(/--[^\n]*/g,'').replace(/\bon\s+delete\s+restrict\b/gi,'');
if(/\b(?:drop|delete|truncate)\b/i.test(stripped))throw Error('Refusing a destructive migration.');
const pg=dep('pg'),client=new pg.Client({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false},statement_timeout:120000});
const tables=['tk_sop','tk_sop_row','tk_batch','tk_task','tk_photo','tk_reading','tk_decision'];
async function fingerprint(){
  const result={};
  for(const table of tables){const {rows}=await client.query(`select count(*)::int n, md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) hash from public.${table} t`);result[table]=rows[0];}
  const {rows}=await client.query("select count(*)::int n, md5(coalesce(jsonb_agg(to_jsonb(o) order by id)::text,'')) hash from storage.objects o where bucket_id='tasks'");
  result.photos_storage=rows[0];return result;
}
await client.connect();
try{
  await client.query('begin isolation level repeatable read');
  await client.query("set local lock_timeout='5s'");
  const before=await fingerprint();
  await client.query(sql);
  const after=await fingerprint();
  assert.deepEqual(after,before,'Existing Tasks rows or photo objects changed.');
  const {rows}=await client.query("select to_regclass('public.tk_process_time_standard') is not null standard, to_regclass('public.tk_process_time_revision') is not null revision, to_regprocedure('public.tk_process_time_save(jsonb)') is not null save_rpc");
  assert(rows[0].standard && rows[0].revision && rows[0].save_rpc);
  console.log(JSON.stringify({migrationCompiles:true,transaction:'rolled back',existingUnchanged:true,counts:Object.fromEntries(Object.entries(before).map(([k,v])=>[k,v.n]))}));
}finally{await client.query('rollback').catch(()=>{});await client.end();}
