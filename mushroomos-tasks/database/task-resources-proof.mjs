// Read/write fixture proof for migration 0159. Entire transaction is ALWAYS rolled back.
// Run from this directory: node task-resources-proof.mjs
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const local=createRequire(import.meta.url),sibling=createRequire(new URL('../../mushroomos/package.json',import.meta.url));
function dep(name){try{return local(name);}catch{return sibling(name);}}
const env=new URL('.env.local',import.meta.url);
dep('dotenv').config({path:existsSync(env)?env:new URL('../../mushroomos/.env.local',import.meta.url)});
const client=new (dep('pg').Client)({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false},statement_timeout:60000});
const one=async(sql,args=[]) => (await client.query(sql,args)).rows[0];
async function as(role){
 await client.query('reset role');
 const profile=await one('select id from profiles where role=$1 and is_active limit 1',[role]);
 assert(profile,'Missing active '+role+' fixture profile');
 await client.query("select set_config('request.jwt.claims',$1,true)",[
   JSON.stringify({sub:profile.id,role:'authenticated',app_metadata:{app_role:role}})]);
 await client.query('set local role authenticated');
 return profile.id;
}
async function refuses(sql,args,pattern){
 await client.query('savepoint refusal');let error;
 try{await client.query(sql,args);}catch(e){error=e;}
 await client.query('rollback to savepoint refusal');
 assert(error,'Expected refusal');assert.match(error.message,pattern);
}
await client.connect();
try{
 await client.query('begin isolation level repeatable read');
 await client.query("set local lock_timeout='5s'");
 await client.query(readFileSync(new URL('0159_task_resources.sql',import.meta.url),'utf8'));
 console.log('PASS 0159 migration parses and installs within a rolled-back transaction');
 await as('supervisor');
 await refuses("select tk_machine_save(null,'Unauthorized','machine',false,true)",[],/admin|role|access/i);
 await as('admin');
 const turner=(await one("select tk_machine_save(null,'Proof Turner','heavy_machine',true,true) id")).id;
 const hopper=(await one("select tk_machine_save(null,'Proof Hopper','machine',false,true) id")).id;
 assert.equal((await one('select kind from tk_machine where id=$1',[turner])).kind,'heavy_machine');
 await refuses("select tk_machine_save(null,'proof turner','machine',false,true)",[],/unique|duplicate/i);
 console.log('PASS Admin machine registry, role guard and case-insensitive uniqueness');
 await client.query('reset role');
 const sup=(await one("select id from profiles where role='supervisor' and is_active limit 1")).id;
 const sop=(await one("insert into tk_sop(family_id,name,created_by) values(gen_random_uuid(),'resource proof',$1) returning id",[sup])).id;
 const batch=(await one("insert into tk_batch(name,sop_id,h0,status) values($1,$2,now(),'active') returning id",['resource-proof-'+Date.now(),sop])).id;
 const task=(await one("insert into tk_task(batch_id,ord,line,title,kind,photos,ask,status,started_at,started_by) values($1,1,'Main','Turner proof','work','none','machine','running',now(),$2) returning id",[batch,sup])).id;
 const lab=(await one("insert into tk_task(batch_id,ord,line,title,kind,photos,ask,status) values($1,2,'Main','Lab proof','lab','none','none','todo') returning id",[batch])).id;
 const startPhoto=(await one("insert into tk_photo(task_id,kind,storage_path) values($1,'other',$2) returning id",[task,batch+'/'+task+'/proof-start.jpg'])).id;
 const endPhoto=(await one("insert into tk_photo(task_id,kind,storage_path) values($1,'other',$2) returning id",[task,batch+'/'+task+'/proof-end.jpg'])).id;
 await as('supervisor');
 await refuses('select tk_resources_record($1,1,$2::jsonb,null)',[lab,'[]'],/started work|cleaning/i);
 await refuses('select tk_resources_record($1,1,$2::jsonb,null)',[task,JSON.stringify([{machine_id:turner,odometer_start_km:100}])],/start odometer photo/i);
 await refuses('select tk_resources_record($1,1,$2::jsonb,null)',[task,JSON.stringify([{machine_id:turner,odometer_start_km:101,start_photo_id:startPhoto,odometer_end_km:100,end_photo_id:endPhoto}])],/End odometer/i);
 const usage=[{machine_id:turner,odometer_start_km:100,start_photo_id:startPhoto,odometer_end_km:105.5,end_photo_id:endPhoto},{machine_id:hopper}];
 const revision1=(await one('select tk_resources_record($1,0,$2::jsonb,null) id',[task,JSON.stringify(usage)])).id;
 const summary=await one('select * from tk_v_task_resources where task_id=$1',[task]);
 assert.equal(summary.labour_count,0);assert.equal(summary.machines.length,2);
 assert.equal(Number(summary.machines[0].distance_km),5.5);
 assert.equal(summary.machines[1].distance_km,null);
 console.log('PASS zero crew, multiple machine types, photos and measured km; missing km stays null');
 await refuses('select tk_resources_record($1,4,$2::jsonb,null)',[task,JSON.stringify([{machine_id:hopper}])],/changed since/i);
 const revision2=(await one('select tk_resources_record($1,4,$2::jsonb,$3) id',[task,JSON.stringify([{machine_id:hopper}]),revision1])).id;
 assert.equal((await one('select count(*)::int n from tk_task_resource_revision where task_id=$1',[task])).n,2);
 assert.equal((await one('select labour_count from tk_v_task_resources where task_id=$1',[task])).labour_count,4);
 assert(revision1);console.log('PASS corrections append a new revision, retaining the earlier entry');
 await one('select tk_finish_with_resources($1,null,null,$2,$3::jsonb,$4)',[task,3,JSON.stringify(usage),revision2]);
 const finished=await one('select status,answer from tk_task where id=$1',[task]);
 assert.equal(finished.status,'done');assert.match(finished.answer,/Proof Turner/);assert.match(finished.answer,/Proof Hopper/);
 const report=(await one('select tk_batch_progress($1) value',[batch])).value;
 assert.equal(report.rows[0].resources.labour_count,3);
 assert.equal(report.rows[0].resources.machines.length,2);
 console.log('PASS atomic Finish, legacy machine answer and report snapshot');
 const refuel=(await one('select gen_random_uuid() id')).id, fuelAt=new Date().toISOString();
 await refuses('select tk_refuel_record($1,$2,0,$3,$4,null)',[refuel,turner,'Diesel',fuelAt],/measured litres/i);
 await one('select tk_refuel_record($1,$2,$3,$4,$5,$6)',[refuel,turner,42.75,'Diesel',fuelAt,'Pump reading']);
 await one('select tk_refuel_record($1,$2,$3,$4,$5,$6)',[refuel,turner,42.75,'Diesel',fuelAt,'Pump reading']);
 assert.equal((await one('select count(*)::int n from tk_machine_refuel where id=$1',[refuel])).n,1);
 const fuel=await one('select * from tk_v_machine_refuel where id=$1',[refuel]);
 assert.equal(Number(fuel.litres),42.75);assert.equal(fuel.unit,'L');assert.equal(fuel.machine_name,'Proof Turner');
 assert.equal(Number((await one('select litres_added from tk_v_machine_refuel_totals where machine_id=$1',[turner])).litres_added),42.75);
 await refuses('select tk_refuel_void($1,$2)',[refuel,'Correction'],/admin|role|access/i);
 await as('admin');await one('select tk_refuel_void($1,$2)',[refuel,'Proof voided entry']);
 assert((await one('select voided_at from tk_machine_refuel where id=$1',[refuel])).voided_at);
 assert.equal(Number((await one('select litres_added from tk_v_machine_refuel_totals where machine_id=$1',[turner])).litres_added),0);
 console.log('PASS measured refuelling litres are machine-linked, Supervisor-only to enter, Admin-only to void');
} finally {
 try{await client.query('reset role');await client.query('rollback');console.log('ROLLED BACK — no live records or schema changed');}
 finally{await client.end();}
}
