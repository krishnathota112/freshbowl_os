// Prove the Lab/pile update in one rolled-back transaction, or install with --apply.
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const local=createRequire(import.meta.url), sibling=createRequire(new URL('../../mushroomos/package.json',import.meta.url));
function dep(name){try{return local(name);}catch{return sibling(name);}}
const env=new URL('.env.local',import.meta.url);
dep('dotenv').config({path:existsSync(env)?env:new URL('../../mushroomos/.env.local',import.meta.url)});
if(!process.env.SUPABASE_DB_URL)throw new Error('SUPABASE_DB_URL required');
const db=new (dep('pg').Client)({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false},statement_timeout:120000});
const live=process.argv.includes('--live'),apply=process.argv.includes('--apply');
const migrations=['0148_tasks_lab_piles.sql','0149_tasks_complete_template.sql'];
const template='14900000-0000-4000-8000-000000000001';
const ctx={window:{TK:{}}};vm.runInNewContext(readFileSync(new URL('../app/www/turner-plan.js',import.meta.url),'utf8'),ctx);
const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
function check(ok,label){if(!ok)throw new Error(label);console.log('PASS '+label);}
async function as(role){
 await db.query('reset role');const p=await one('select id from profiles where role=$1 and is_active limit 1',[role]);
 if(!p)throw new Error('Missing '+role+' profile');
 await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:p.id,role:'authenticated',app_metadata:{app_role:role}})]);
 await db.query('set local role authenticated');
}
async function refuses(sql,args,label){
 await db.query('savepoint refused');let failed=false;
 try{await db.query(sql,args);}catch{failed=true;}
 await db.query('rollback to savepoint refused');check(failed,label);
}
async function photo(batch,task,kind){
 await db.query('reset role');const path=batch+'/'+task+'/'+kind+'.jpg';
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('tasks',$1,'{\"size\":2048,\"mimetype\":\"image/jpeg\"}')",[path]);
 await as('supervisor');await db.query('select tk_add_photo($1,$2,$3)',[task,kind,path]);
}
await db.connect();
try{
 await db.query('begin');
 if(!live)for(const file of migrations)await db.query(readFileSync(new URL(file,import.meta.url),'utf8'));
 if(apply){await db.query('commit');console.log('Applied 0148 and 0149.');}
 else{
  await db.query('savepoint fixtures');await as('admin');
  const rows=(await db.query('select * from tk_sop_row where sop_id=$1 order by ord',[template])).rows;
  check(rows.length===104,'104 master rows in the full SOP');
  check(rows.filter(r=>['lab','lab_gate'].includes(r.kind)).length===40,'40 actual Lab tasks, including 12 pile-specific T1 checks');
  check(rows.filter(r=>r.pile&&r.kind==='work'&&r.photos==='both').length===24,'24 independently photographed Turner passes');
  check((await one('select count(*)::int n from tk_sop_row r left join tk_v_checkpoint c on c.code=r.lab_checkpoint where r.sop_id=$1 and r.kind in (\'lab\',\'lab_gate\') and c.code is null',[template])).n===0,'Every Lab row resolves to the existing register');
  const old=(await db.query("select * from tk_sop_row where sop_id='14600000-0000-4000-8000-000000000001' order by ord")).rows;
  const preview=ctx.window.TK.turnerPlan.completeTemplate(old);
  check(JSON.stringify(rows.map(r=>[r.title,r.kind,r.pile||null]))===JSON.stringify(preview.map(r=>[r.title,r.kind,r.pile||null])),'Pending preview and installed template have the same task order');
  const version=(await one('select tk_sop_new_version_v3($1) id',[template])).id;
  check((await one("select count(*)::int n from tk_sop_row where sop_id=$1 and pile is not null",[version])).n===42,'Reusable template copies retain all 42 pile rows');
  const selected=rows.filter(r=>r.pile==='P1'||r.pile==='P2');selected[0].description='Admin instructions for P1';
  const create='select tk_batch_create_plan_v3($1,$2,$3::timestamptz,$4,$5::jsonb) id';
  const args=['Lab/pile proof '+Date.now(),template,new Date().toISOString(),null,JSON.stringify(selected)];
  const batch=(await one(create,args)).id;
  const tasks=(await db.query('select * from tk_v_task_v3 where batch_id=$1 order by ord',[batch])).rows;
  const task=(p,stage)=>tasks.find(t=>t.pile===p&&t.turner_pass===stage);
  check(task('P1','T0').description==='Admin instructions for P1','Admin description persists on the task');
  check(task('P1','T0').can_start&&task('P2','T0').can_start&&!task('P1','T1').can_start,'Piles start independently and each pile follows its own order');
  await as('supervisor');
  await db.query('select tk_start($1)',[task('P1','T0').id]);await db.query('select tk_start($1)',[task('P2','T0').id]);
  await photo(batch,task('P1','T0').id,'before');await photo(batch,task('P1','T0').id,'after');
  await refuses('select tk_finish($1,$2,$3)',[task('P2','T0').id,'M2',null],'P1 photos cannot satisfy P2 photo requirements');
  await db.query('select tk_finish($1,$2,$3)',[task('P1','T0').id,'M1',null]);
  check((await one('select can_start from tk_v_task_v3 where id=$1',[task('P1','T1').id])).can_start,'P1 moves to T1 independently of P2 and plain Lab records');
  await as('lab_tech');await db.query('select tk_lab_submit($1,$2::jsonb,$3)',[task('P1','LAB_BEFORE_T1').id,JSON.stringify([{param:'moisture_pct',label:'Moisture',value:'72',unit:'%'}]),null]);
  check((await one('select count(*)::int n from tk_reading where task_id=$1',[task('P2','LAB_BEFORE_T1').id])).n===0,'Lab readings belong only to their selected pile');
  await refuses(create,args,'Lab cannot create or alter a batch plan');
  await as('admin');
  await refuses('select tk_task_edit_v3($1,$2::jsonb)',[task('P1','T0').id,JSON.stringify(selected[0])],'Started pile records cannot be rewritten');
  await refuses(create,[args[0]+' invalid',template,args[2],null,JSON.stringify([{...selected[0],photos:'none'}])],'Turner passes cannot disable before/after evidence');
  await db.query('reset role');await db.query('rollback to savepoint fixtures');
  if(!live){
   await db.query(readFileSync(new URL('rollback_0149_tasks_complete_template.sql',import.meta.url),'utf8'));
   await db.query(readFileSync(new URL('rollback_0148_tasks_lab_piles.sql',import.meta.url),'utf8'));
   check(!(await one("select to_regclass('public.tk_v_task_v3') v")).v,'Both update rollbacks work without deleting existing batches');
  }
  await db.query('rollback');console.log('All proof data rolled back.');
 }
}catch(e){await db.query('rollback');throw e;}finally{await db.end();}
