// Default: migration + fixture proofs + rollback, all in one transaction.
// --apply installs only the additive RPCs; --live proves installed RPCs, rolling back fixtures.
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const local=createRequire(import.meta.url), sibling=createRequire(new URL('../../mushroomos/package.json',import.meta.url));
function dep(name){try{return local(name);}catch{return sibling(name);}}
const env=new URL('.env.local',import.meta.url);
dep('dotenv').config({path:existsSync(env)?env:new URL('../../mushroomos/.env.local',import.meta.url)});
if(!process.env.SUPABASE_DB_URL)throw new Error('SUPABASE_DB_URL required');
const db=new (dep('pg').Client)({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false},statement_timeout:60000});
const live=process.argv.includes('--live'),apply=process.argv.includes('--apply');
const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
const pass=label=>console.log('PASS '+label);
async function as(role){
 await db.query('reset role');const p=await one('select id from profiles where role=$1 and is_active limit 1',[role]);
 if(!p)throw new Error('Missing '+role+' profile');
 await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:p.id,role:'authenticated',app_metadata:{app_role:role}})]);
 await db.query('set local role authenticated');
}
async function refuses(fn,pattern,label){
 await db.query('savepoint refused');let error;
 try{await fn();}catch(e){error=e;}
 await db.query('rollback to savepoint refused');
 assert(error,label);assert.match(error.message,pattern,label);pass(label);
}
const get=async id=>(await one('select tk_batch_plan_get($1) plan',[id])).plan;
const save=(plan,rows=plan.rows,name=plan.batch.name,note=plan.batch.note)=>one(
 'select tk_batch_plan_save($1,$2,$3,$4,$5::jsonb) n',[plan.batch.id,plan.token,name,note,JSON.stringify(rows)]);
const copy=x=>JSON.parse(JSON.stringify(x));
await db.connect();
try{
 await db.query('begin');await db.query("set local lock_timeout='10s'");
 if(!live)await db.query(readFileSync(new URL('0152_tasks_edit_batch.sql',import.meta.url),'utf8'));
 if(apply){await db.query('commit');console.log('Applied 0152. No existing batch plans changed.');}
 else{
  await db.query('savepoint fixtures');await as('admin');
  const template='14900000-0000-4000-8000-000000000001';
  const sopBefore=(await one('select jsonb_agg(to_jsonb(r) order by ord) rows from tk_sop_row r where sop_id=$1',[template])).rows;
  const input=Array.from({length:12},(_,i)=>({title:'Proof task '+i,line:'Stream '+i,kind:'work',photos:'both',ask:'none',description:'Context '+i,suggested_offset_minutes:i*60}));
  input[10].line='Stream 0'; input[11]={...input[11],line:'Turner · P1',pile:'P1',turner_pass:'T0'};
  const id=(await one('select tk_batch_create_plan_v3($1,$2,$3,null,$4::jsonb) id',['Edit proof '+Date.now(),template,'2026-09-28T09:00:00Z',JSON.stringify(input)])).id;
  let plan=await get(id);const original=copy(plan);
  assert(plan.rows.every(r=>!r._locked));pass('New batch rows are editable');
  let rows=copy(plan.rows);[rows[1],rows[2]]=[rows[2],rows[1]];
  rows[3].title='Edited title';rows[3].description='Edited context';rows[3].suggested_at='2026-10-01T12:34:00Z';
  rows.splice(9,1);rows.push({title:'New Lab row',line:'Main',kind:'lab',photos:'none',ask:'none',lab_checkpoint:'LAB-RM-01'});
  await save(plan,rows,'Edited proof '+Date.now(),'Changed batch note');
  plan=await get(id);
  assert.deepEqual(plan.rows.slice(0,11).map(r=>r.id),rows.slice(0,11).map(r=>r.id));
  assert(!original.rows.some(r=>r.id===plan.rows[11].id));
  assert.deepEqual(plan.rows.map(r=>r.ord),Array.from({length:12},(_,i)=>i+1));
  assert.equal(plan.rows[3].description,'Edited context');assert.equal(plan.rows[3].title,'Edited title');
  assert.equal(Date.parse(plan.rows[3].suggested_at),Date.parse('2026-10-01T12:34:00Z'));
  assert.equal(plan.batch.h0,original.batch.h0);assert.equal(plan.batch.sop_id,original.batch.sop_id);
  pass('Atomic edit/add/remove/reorder keeps retained IDs, dates, descriptions, start and SOP');
  assert.deepEqual((await one('select jsonb_agg(to_jsonb(r) order by ord) rows from tk_sop_row r where sop_id=$1',[template])).rows,sopBefore);
  pass('Reusable SOP is unchanged');
  await refuses(()=>save(original),/changed while/,'Stale editor cannot overwrite another saved plan');
  await refuses(()=>save(plan,[...plan.rows,plan.rows[0]]),/same task appears twice/,'Duplicate existing ID refused');
  await refuses(()=>save(plan,[{...plan.rows[0],id:'00000000-0000-4000-8000-000000000001'}]),/does not belong/,'Foreign task ID refused');
  await refuses(()=>save(plan,[]),/between 1 and 2000/,'Empty plan refused');
  rows=copy(plan.rows);rows[2].title='';await refuses(()=>save(plan,rows),/Give row/,'Blank task does not silently delete a row');
  rows=copy(plan.rows);rows[10].photos='none';await refuses(()=>save(plan,rows),/before and after/,'Turner photo requirements enforced');
  rows=copy(plan.rows);rows[10].pile='P2';rows[10].line='Turner · P2';await refuses(()=>save(plan,rows),/original pile/,'Existing pile identity cannot be reassigned');
  for(const role of ['supervisor','lab_tech','gm']){
   await as(role);await refuses(()=>save(plan),/role|permission|admin|allowed|Only/i,role+' cannot save batch plans');
   await refuses(()=>get(id),/role|permission|admin|allowed|Only/i,role+' cannot load the editor');
  }
  await db.query('reset role');await db.query('set local role anon');
  await refuses(()=>get(id),/permission/,'Anonymous editor access refused');
  await db.query('reset role');
  const states=['running','done','done_before','submitted','returned'];
  for(let i=0;i<states.length;i++)await db.query('update tk_task set status=$2 where id=$1',[plan.rows[i].id,states[i]]);
  await db.query("insert into tk_photo(task_id,kind,storage_path) values($1,'other',$2)",[plan.rows[5].id,id+'/proof-only.jpg']);
  await db.query("update tk_task set note='Recorded note' where id=$1",[plan.rows[6].id]);
  await db.query("insert into tk_reading(task_id,round,param,label,value) values($1,1,'moisture','Moisture','72')",[plan.rows[7].id]);
  await db.query("insert into tk_decision(task_id,round,approved) values($1,1,true)",[plan.rows[8].id]);
  await as('admin');
  await refuses(()=>save(plan),/changed while/,'New floor records invalidate an open editor');
  plan=await get(id);assert(plan.rows.slice(0,9).every(r=>r._locked));pass('All work states, notes, photos, readings and decisions lock their rows');
  for(let i=0;i<9;i++){
   rows=copy(plan.rows);rows[i].title='Rewrite history';
   await refuses(()=>save(plan,rows),/recorded work/,`Recorded row ${i+1} cannot be rewritten`);
   await refuses(()=>save(plan,plan.rows.filter((_,n)=>n!==i)),/recorded work/,`Recorded row ${i+1} cannot be removed`);
  }
  rows=copy(plan.rows);rows.unshift({title:'New prerequisite',line:plan.rows[0].line,kind:'work',photos:'both',ask:'none'});
  await refuses(()=>save(plan,rows),/after recorded work/,'New prerequisite cannot precede running work');
  rows=copy(plan.rows);rows.unshift(rows.splice(9,1)[0]);
  await refuses(()=>save(plan,rows),/after recorded work/,'Moved prerequisite cannot precede running work');
  rows=copy(plan.rows);rows[9].description='Upcoming task still editable';
  const evidence=async()=> (await one('select jsonb_build_object(\'photos\',(select jsonb_agg(to_jsonb(p)) from tk_photo p where task_id=any($1)),\'readings\',(select jsonb_agg(to_jsonb(p)) from tk_reading p where task_id=any($1)),\'decisions\',(select jsonb_agg(to_jsonb(p)) from tk_decision p where task_id=any($1))) data',[plan.rows.map(r=>r.id)])).data;
  const before=await evidence();await save(plan,rows);const after=await get(id);
  assert.deepEqual(after.rows.slice(0,9),plan.rows.slice(0,9));assert.deepEqual(await evidence(),before);
  assert.equal(after.rows[9].description,'Upcoming task still editable');pass('Upcoming rows remain editable; recorded task and evidence data stay byte-for-byte unchanged');
  await refuses(()=>save(after,after.rows,'   '),/Give the batch/,'Blank batch name refused');
  await db.query('select tk_batch_close($1)',[id]);await refuses(()=>save(after),/closed/,'Closed batch cannot be edited');
  await db.query('reset role');await db.query('rollback to savepoint fixtures');
  if(!live){await db.query(readFileSync(new URL('rollback_0152_tasks_edit_batch.sql',import.meta.url),'utf8'));
   assert.equal((await one("select to_regprocedure('public.tk_batch_plan_get(uuid)') f")).f,null);pass('Migration rollback removes only the added RPCs');}
  await db.query('rollback');console.log('All fixture changes rolled back; existing batches untouched.');
 }
}catch(e){await db.query('rollback');throw e;}finally{await db.end();}
