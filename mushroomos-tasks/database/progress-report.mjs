// Default: install + prove in a rolled-back transaction. --apply commits only DDL after proofs.
// --live proves the installed functions, always rolling back fixtures.
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
async function digest(){const out={};for(const table of ['tk_sop','tk_sop_row','tk_batch','tk_task','tk_reading','tk_photo','tk_decision'])out[table]=(await one(`select md5(coalesce(jsonb_agg(to_jsonb(t)-'planned_duration_minutes'-'report_section' order by id)::text,'')) hash from ${table} t`)).hash;return out;}
const get=async id=>(await one('select tk_batch_plan_get($1) p',[id])).p;
const save=p=>one('select tk_batch_plan_save($1,$2,$3,$4,$5) n',[p.batch.id,p.token,p.batch.name,p.batch.note,JSON.stringify(p.rows)]);
const report=async id=>(await one('select tk_batch_progress($1) p',[id])).p;
await db.connect();
try{
 await db.query('begin isolation level repeatable read');await db.query("set local lock_timeout='10s'");const before=await digest();
 if(!process.argv.includes('--live'))await db.query(readFileSync(new URL('0154_tasks_progress_report.sql',import.meta.url),'utf8'));
 await db.query('savepoint fixtures');await as('admin');
 const input=[{title:'Report proof',line:'Main',kind:'work',photos:'none',ask:'none',planned_duration_minutes:210,report_section:'Bagasse',suggested_offset_minutes:0},
  {title:'Lab',line:'Main',kind:'lab',photos:'none',ask:'none',lab_checkpoint:'LAB-RM-01',planned_duration_minutes:0},
  {title:'Turner T0 P1',line:'Turner · P1',kind:'work',photos:'both',ask:'machine',pile:'P1',turner_pass:'T0',planned_duration_minutes:null}];
 const sop=(await one('select tk_sop_create_v3($1,null,$2,$3) id',['Progress proof '+Date.now(),JSON.stringify(input),'2026-09-28T17:30:00Z'])).id;
 const sr=(await db.query('select * from tk_sop_row where sop_id=$1 order by ord',[sop])).rows;
 assert.equal(sr[0].planned_duration_minutes,210);assert.equal(sr[0].report_section,'Bagasse');assert.equal(sr[1].planned_duration_minutes,0);assert.equal(sr[2].planned_duration_minutes,null);
 await one('select tk_sop_save_v3($1,$2,null,$3,$4)',[sop,'Progress proof',JSON.stringify(input),'2026-09-28T17:30:00Z']);
 await one('select tk_sop_publish($1)',[sop]);const next=(await one('select tk_sop_new_version_v3($1) id',[sop])).id;
 assert.equal((await one('select planned_duration_minutes from tk_sop_row where sop_id=$1 and ord=1',[next])).planned_duration_minutes,210);pass('SOP create, save and new version preserve duration, zero, unknown and section');
 const id=(await one('select tk_batch_create_plan_v3($1,$2,$3,null,$4) id',['Progress fixture',sop,'2026-09-28T17:30:00Z',JSON.stringify(input)])).id;
 let plan=await get(id);assert.equal(plan.rows[0].planned_duration_minutes,210);assert.equal(plan.rows[0].report_section,'Bagasse');
 plan.rows[0].planned_duration_minutes=150;plan.rows[0].report_section='Updated section';await save(plan);plan=await get(id);assert.equal(plan.rows[0].planned_duration_minutes,150);
 const older=copy(plan);delete older.rows[0].planned_duration_minutes;delete older.rows[0].report_section;await save(older);plan=await get(id);assert.equal(plan.rows[0].planned_duration_minutes,150);pass('Batch creation/edit persists fields; older clients do not clear existing duration');
 for(const value of [-1,1.5,525601,'abc'])await refuses(()=>one('select tk_task_add_v3($1,null,$2)',[id,JSON.stringify({...input[0],planned_duration_minutes:value})]),/duration/,`Invalid duration ${value} refused`);
 await refuses(()=>one('select tk_task_add_v3($1,null,$2)',[id,JSON.stringify({...input[0],report_section:'x'.repeat(201)})]),/section/,'Overlong section refused');
 const added=(await one('select tk_task_add_v3($1,null,$2) id',[id,JSON.stringify({...input[0],title:'Added',planned_duration_minutes:5})])).id;
 await one('select tk_task_edit_v3($1,$2)',[added,JSON.stringify({...input[0],title:'Edited',planned_duration_minutes:15})]);assert.equal((await one('select planned_duration_minutes from tk_task where id=$1',[added])).planned_duration_minutes,15);pass('Single task add/edit persists duration');
 await db.query('reset role');await db.query("update tk_task set status='done',started_at='2026-09-28T17:30:00Z',ended_at='2026-09-30T06:00:00Z' where id=$1",[plan.rows[0].id]);
 await db.query("insert into tk_reading(task_id,round,param,label,value,unit) values($1,1,'moisture','Moisture','72','%'),($1,2,'moisture','Moisture','73','%')",[plan.rows[1].id]);
 await db.query("insert into tk_photo(task_id,kind,storage_path) values($1,'before',$2),($1,'after',$3)",[plan.rows[2].id,id+'/before.jpg',id+'/after.jpg']);
 await as('admin');plan=await get(id);const changed=copy(plan);changed.rows[0].planned_duration_minutes=999;await refuses(()=>save(changed),/recorded work/,'Recorded duration cannot be rewritten');
 const stale=copy(plan);await db.query('select tk_note($1,$2)',[added,'Fixture note']);await refuses(()=>save(stale),/changed while/,'Stale plan token still blocks lost updates');
 for(const role of ['admin','supervisor','lab_tech','gm']){
  await as(role);const r=await report(id);assert.equal(r.rows.length,4);assert.equal(r.rows[0].planned_duration_minutes,150);assert.equal(r.rows[1].readings.length,2);assert.equal(r.rows[2].before_photos,1);assert.equal(r.rows[2].after_photos,1);assert(!JSON.stringify(r).includes('storage_path'));pass(role+' gets complete ordered report, Lab rounds and per-pile photo counts');
 }
 await db.query('reset role');await db.query('set local role anon');await refuses(()=>report(id),/permission/,'Anonymous report access refused');await db.query('reset role');
 await db.query("insert into tk_task(batch_id,ord,line,title,kind,photos,ask) select $1,n,'Large proof','Task '||n,'work','none','none' from generate_series(5,1005) n",[id]);
 await as('admin');assert.equal((await report(id)).rows.length,1005);pass('Report is not truncated at the 1000-row API limit');
 await db.query('select tk_batch_close($1)',[id]);assert.equal((await report(id)).batch.status,'closed');pass('Closed batch report remains available');
 await db.query('reset role');await db.query('rollback to savepoint fixtures');assert.deepEqual(await digest(),before);pass('Every existing SOP, batch, task, photo, reading and decision is unchanged');
 if(process.argv.includes('--apply') && !process.argv.includes('--live')){await db.query('commit');console.log('Installed 0154 after proofs. All fixture records rolled back.');}
 else{await db.query('rollback');console.log('Proof complete; all changes rolled back.');}
}catch(e){await db.query('rollback');throw e;}finally{await db.end();}
