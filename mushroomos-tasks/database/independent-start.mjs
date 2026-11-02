// --apply installs only after proofs pass; all fixture records are rolled back.
// No flag: test migration and roll everything back. --live: test installed code.
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const local=createRequire(import.meta.url),sibling=createRequire(new URL('../../mushroomos/package.json',import.meta.url));
function dep(n){try{return local(n);}catch{return sibling(n);}}
const env=new URL('.env.local',import.meta.url);
dep('dotenv').config({path:existsSync(env)?env:new URL('../../mushroomos/.env.local',import.meta.url)});
const db=new (dep('pg').Client)({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false},statement_timeout:60000});
const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
async function as(role){await db.query('reset role');const p=await one('select id from profiles where role=$1 and is_active limit 1',[role]);if(!p)throw Error('Missing '+role+' profile');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:p.id,role:'authenticated',app_metadata:{app_role:role}})]);await db.query('set local role authenticated');}
const pass=s=>console.log('PASS '+s);
async function refuses(fn,pattern,label){await db.query('savepoint refuses');let e;try{await fn();}catch(err){e=err;}await db.query('rollback to savepoint refuses');assert(e,label);assert.match(e.message,pattern);pass(label);}
async function digest(){const out={};for(const table of ['tk_sop','tk_sop_row','tk_batch','tk_task','tk_reading','tk_photo','tk_decision'])out[table]=(await one(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) hash from ${table} t`)).hash;return out;}
await db.connect();
try{
 // Compare our own effects on a stable snapshot while factory users keep working.
 await db.query('begin isolation level repeatable read');await db.query("set local lock_timeout='10s'");const before=await digest();
 if(!process.argv.includes('--live'))await db.query(readFileSync(new URL('0155_tasks_independent_start.sql',import.meta.url),'utf8'));
 await db.query('savepoint fixtures');await as('admin');
 const rows=Array.from({length:8},(_,i)=>({title:'Independent proof '+i,line:'Main',kind:'work',photos:'both',ask:'none'}));
 rows[1]={...rows[1],kind:'lab_gate',photos:'none',lab_checkpoint:'LAB-04'};
 rows[3]={...rows[3],line:'Turner · P1',pile:'P1',turner_pass:'T0'};
 rows[4]={...rows[4],line:'Turner · P1',pile:'P1',turner_pass:'T3'};
 const id=(await one('select tk_batch_create_plan_v3($1,$2,now(),null,$3) id',['Independent fixture','14900000-0000-4000-8000-000000000001',JSON.stringify(rows)])).id;
 const tasks=(await db.query('select * from tk_task where batch_id=$1 order by ord',[id])).rows;
 for(const view of ['tk_v_task','tk_v_task_v2','tk_v_task_v3']){
  const t=(await db.query(`select * from ${view} where batch_id=$1 order by ord`,[id])).rows;
  assert(t.filter(r=>r.kind==='work').every(r=>r.can_start && r.blocked_by===null && r.blocked_by_id===null));assert.equal(t[1].can_start,false);
 }pass('All API versions open every unstarted work row; Lab stays a Lab action');
 await as('supervisor');await one('select tk_start($1)',[tasks[2].id]);await one('select tk_start($1)',[tasks[4].id]);
 assert.equal((await one('select status from tk_task where id=$1',[tasks[0].id])).status,'todo');assert.equal((await one('select status from tk_task where id=$1',[tasks[3].id])).status,'todo');
 pass('Start later work with earlier work/Lab unfinished; start Turner T3 with T0 unfinished');
 await refuses(()=>one('select tk_start($1)',[tasks[1].id]),/Lab/,'Lab task cannot be treated as process work');
 await refuses(()=>one('select tk_finish($1,null,null)',[tasks[4].id]),/photo/i,'Per-pile before/after photo requirements still enforced');
 await db.query('reset role');await db.query("update tk_task set status='submitted' where id=$1",[tasks[1].id]);
 await as('supervisor');await one('select tk_start($1)',[tasks[5].id]);pass('Pending GM approval does not block another task');
 await refuses(()=>one('select tk_gm_decide($1,true,null)',[tasks[1].id]),/role|permission|allowed|Only/i,'Removing dependency gates does not grant GM permissions');
 await as('admin');await one("select tk_running_since($1,now()-interval '1 hour')",[tasks[6].id]);pass('Admin catch-up can start a later row independently');
 await refuses(()=>one("select tk_running_since($1,now()+interval '1 hour')",[tasks[7].id]),/already passed/,'Future actual start still refused');
 await as('lab_tech');await refuses(()=>one('select tk_start($1)',[tasks[7].id]),/role|permission|allowed|Only/i,'Existing role limits remain unchanged');
 await as('admin');await one('select tk_batch_close($1)',[id]);
 assert((await db.query('select can_start from tk_v_task_v3 where batch_id=$1',[id])).rows.every(r=>!r.can_start));
 await as('supervisor');await refuses(()=>one('select tk_start($1)',[tasks[7].id]),/closed/,'Closed batches remain read-only');
 await db.query('reset role');await db.query('set local role anon');await refuses(()=>one('select tk_start($1)',[tasks[7].id]),/permission/,'Anonymous start denied');
 await db.query('reset role');await db.query('rollback to savepoint fixtures');assert.deepEqual(await digest(),before);pass('All existing records and evidence unchanged');
 if(process.argv.includes('--apply') && !process.argv.includes('--live')){await db.query('commit');console.log('Installed 0155. Every current and future task now starts independently.');}
 else{await db.query('rollback');console.log('All proof changes rolled back.');}
}catch(e){await db.query('rollback');throw e;}finally{await db.end();}
