// Default: test migration then roll back. --apply commits DDL only after proofs.
// --live tests the installed version; all fixture records are always rolled back.
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const local=createRequire(import.meta.url),sibling=createRequire(new URL('../../mushroomos/package.json',import.meta.url));
function dep(n){try{return local(n);}catch{return sibling(n);}}
const env=new URL('.env.local',import.meta.url);
dep('dotenv').config({path:existsSync(env)?env:new URL('../../mushroomos/.env.local',import.meta.url)});
const db=new (dep('pg').Client)({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false},statement_timeout:60000});
const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
const pass=s=>console.log('PASS '+s),copy=x=>JSON.parse(JSON.stringify(x));
async function as(role){await db.query('reset role');const p=await one('select id from profiles where role=$1 and is_active limit 1',[role]);if(!p)throw Error('Missing '+role+' profile');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:p.id,role:'authenticated',app_metadata:{app_role:role}})]);await db.query('set local role authenticated');}
async function refuses(fn,pattern,label){await db.query('savepoint refuses');let e;try{await fn();}catch(err){e=err;}await db.query('rollback to savepoint refuses');assert(e,label);assert.match(e.message,pattern);pass(label);}
async function digest(){const out={};for(const table of ['tk_sop','tk_sop_row','tk_batch','tk_task','tk_reading','tk_photo','tk_decision'])out[table]=(await one(`select md5(coalesce(jsonb_agg(to_jsonb(t)-'schedule_mode'-'schedule_gap_minutes' order by id)::text,'')) hash from ${table} t`)).hash;return out;}
const get=async id=>(await one('select tk_batch_plan_get($1) p',[id])).p;
const save=p=>one('select tk_batch_plan_save($1,$2,$3,$4,$5) n',[p.batch.id,p.token,p.batch.name,p.batch.note,JSON.stringify(p.rows)]);
await db.connect();
try{
 await db.query('begin isolation level repeatable read');await db.query("set local lock_timeout='10s'");const before=await digest();
 if(!process.argv.includes('--live'))await db.query(readFileSync(new URL('0156_tasks_auto_schedule.sql',import.meta.url),'utf8'));
 await db.query('savepoint fixtures');await as('admin');
 const start='2026-09-30T03:30:00Z';
 const input=[{title:'Bagasse wetting proof',line:'Main',kind:'work',photos:'none',ask:'none',planned_duration_minutes:120,suggested_offset_minutes:0,schedule_mode:'fixed',schedule_gap_minutes:0},
  {title:'Lab proof',line:'Main',kind:'lab',photos:'none',ask:'none',lab_checkpoint:'LAB-RM-01',planned_duration_minutes:0,suggested_offset_minutes:135,schedule_mode:'stream',schedule_gap_minutes:15},
  {title:'Hopper proof',line:'Main',kind:'work',photos:'none',ask:'none',planned_duration_minutes:60,suggested_offset_minutes:135,schedule_mode:'stream',schedule_gap_minutes:0},
  {title:'Paddy proof',line:'Paddy',kind:'work',photos:'none',ask:'none',planned_duration_minutes:60,suggested_offset_minutes:4440,schedule_mode:'fixed',schedule_gap_minutes:0}];
 const sop=(await one('select tk_sop_create_v3($1,null,$2,$3) id',['Auto timing proof '+Date.now(),JSON.stringify(input),start])).id;
 let sr=(await db.query('select * from tk_sop_row where sop_id=$1 order by ord',[sop])).rows;
 assert.equal(sr[0].planned_duration_minutes,120);assert.equal(sr[1].schedule_mode,'stream');assert.equal(sr[1].schedule_gap_minutes,15);
 await one('select tk_sop_save_v3($1,$2,null,$3,$4)',[sop,'Timing proof',JSON.stringify(input),start]);
 await refuses(()=>one('select tk_sop_save_v3($1,$2,null,$3,$4)',[sop,'Timing proof',JSON.stringify(input.map(({schedule_mode,schedule_gap_minutes,...r})=>r)),start]),/Update the app/,'Old SOP editors cannot silently discard automatic timing rules');
 await one('select tk_sop_publish($1)',[sop]);const next=(await one('select tk_sop_new_version_v3($1) id',[sop])).id;
 sr=(await db.query('select * from tk_sop_row where sop_id=$1 order by ord',[next])).rows;
 assert.equal(sr[0].planned_duration_minutes,120);assert.equal(sr[1].schedule_mode,'stream');assert.equal(sr[1].schedule_gap_minutes,15);pass('SOP create/save/publish/clone retains durations and timing rules');
 const id=(await one('select tk_batch_create_plan_v3($1,$2,$3,null,$4) id',['Timing fixture',sop,start,JSON.stringify(input)])).id;
 let plan=await get(id);assert.equal(plan.rows[1].schedule_mode,'stream');assert.equal(plan.rows[1].schedule_gap_minutes,15);assert.equal(Date.parse(plan.rows[1].suggested_at)-Date.parse(start),135*60000);
 const originalIds=plan.rows.map(r=>r.id);plan.rows[0].planned_duration_minutes=180;
 plan.rows[1].suggested_at=new Date(Date.parse(start)+195*60000).toISOString();plan.rows[2].suggested_at=plan.rows[1].suggested_at;
 await save(plan);plan=await get(id);assert.deepEqual(plan.rows.map(r=>r.id),originalIds);assert.equal(plan.rows[0].planned_duration_minutes,180);assert.equal(plan.rows[1].schedule_mode,'stream');assert.equal(Date.parse(plan.rows[2].suggested_at)-Date.parse(start),195*60000);assert.equal(Date.parse(plan.rows[3].suggested_at)-Date.parse(start),4440*60000);
 const legacy=copy(plan);legacy.rows.forEach(r=>{delete r.schedule_mode;delete r.schedule_gap_minutes;});await save(legacy);plan=await get(id);assert.equal(plan.rows[1].schedule_mode,'stream');assert.equal(plan.rows[1].schedule_gap_minutes,15);pass('Batch create/edit/reopen persists planned times; older batch clients preserve rules');
 const view=(await db.query('select * from tk_v_task_v3 where batch_id=$1 order by ord',[id])).rows;assert.equal(view[1].schedule_gap_minutes,15);assert(view.filter(r=>r.kind==='work').every(r=>r.can_start && r.blocked_by===null));pass('API exposes rules without restoring dependency gates');
 for(const [field,value] of [['schedule_mode','garbage'],['schedule_gap_minutes',1.5],['schedule_gap_minutes',525601]])await refuses(()=>one('select tk_task_add_v3($1,null,$2)',[id,JSON.stringify({...input[0],[field]:value})]),/timing|Timing/,'Invalid '+field+' '+value+' refused');
 const added=(await one('select tk_task_add_v3($1,null,$2) id',[id,JSON.stringify({...input[0],title:'Extra proof',schedule_mode:'batch',schedule_gap_minutes:30})])).id;
 await one('select tk_task_edit_v3($1,$2)',[added,JSON.stringify({...input[0],schedule_mode:'stream',schedule_gap_minutes:45})]);
 await one('select tk_task_edit_v3($1,$2)',[added,JSON.stringify(input.map(({schedule_mode,schedule_gap_minutes,...r})=>r)[0])]);
 const addedRow=await one('select * from tk_task where id=$1',[added]);assert.equal(addedRow.schedule_mode,'stream');assert.equal(addedRow.schedule_gap_minutes,45);pass('Single-task add/edit roundtrips timing metadata without clearing omitted fields');
 await as('supervisor');await refuses(()=>save(plan),/role|permission|allowed|Only/i,'Only Admin can change the batch plan');await one('select tk_start($1)',[plan.rows[2].id]);pass('A later task can still start while earlier tasks are unfinished');
 await as('admin');plan=await get(id);assert(plan.rows[2]._locked);const recorded=copy(plan);recorded.rows[2].schedule_gap_minutes=60;await refuses(()=>save(recorded),/recorded work/,'Recorded timing rules cannot change');
 const changeTime=copy(plan);changeTime.rows[2].suggested_at=start;await refuses(()=>save(changeTime),/recorded work/,'Recorded planned timestamps cannot change');
 const stale=copy(plan);await db.query('select tk_note($1,$2)',[added,'Fixture note']);await refuses(()=>save(stale),/changed while/,'Stale-plan protection remains intact');
 await one('select tk_batch_close($1)',[id]);await refuses(async()=>save(await get(id)),/closed/,'Closed batches cannot be rescheduled');
 await db.query('reset role');await db.query('rollback to savepoint fixtures');assert.deepEqual(await digest(),before);pass('Every existing SOP, batch, task and evidence record is unchanged');
 if(process.argv.includes('--apply') && !process.argv.includes('--live')){await db.query('commit');console.log('Installed 0156. All test records rolled back.');}
 else{await db.query('rollback');console.log('All proof changes rolled back.');}
}catch(e){await db.query('rollback');throw e;}finally{await db.end();}
