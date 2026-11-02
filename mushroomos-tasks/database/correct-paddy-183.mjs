// User-confirmed correction, 30 Sep 2026: batch 183,184,185 Paddy = 51.85 tons.
// Default rolls back; --apply uses the normal audited Admin RPC and commits.
// --allowance applies the separately confirmed 100 kg allowance after weight correction.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../mushroomos/package.json',import.meta.url));
require('dotenv').config({path:new URL('../../mushroomos/.env.local',import.meta.url)});
const db=new (require('pg').Client)({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false},statement_timeout:30000});
await db.connect();
try{
 await db.query('begin');await db.query("set local lock_timeout='5s'");
 const admin=(await db.query("select id from profiles where role='admin' and is_active limit 1")).rows[0];assert(admin);
 await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:admin.id,role:'authenticated',app_metadata:{app_role:'admin'}})]);
 const batch='214d244c-997c-4589-ad29-850cf693fe9c';
 const all=(await db.query('select id,required_kg,tolerance_kg,note,material_name,batch_name from wb_v_requirement where batch_id=$1',[batch])).rows;
 console.log('Scoped saved requirements:',all.map(r=>({id:r.id,material:r.material_name,batch:r.batch_name,kg:r.required_kg,tolerance_kg:r.tolerance_kg})));
 if(process.argv.includes('--inspect')){await db.query('rollback');}
 else {
 const rows=all.filter(r=>r.material_name.replace(/\s/g,'').toLowerCase()==='paddy(local)');
 assert.equal(rows.length,1,'Expected exactly one Paddy (Local) requirement');const target=rows[0];
 assert.equal(target.batch_name,'183,184,185');
 const locked=(await db.query('select * from wb_requirement where id=$1 for update',[target.id])).rows[0];
 const allowance=process.argv.includes('--allowance');
 assert.equal(Number(locked.required_kg),allowance?51850:51850000,'Saved weight changed; review before correction');
 if(allowance)assert.equal(Number(locked.tolerance_kg),100000,'Saved allowance changed; review before correction');
 const nextTolerance=allowance?100:locked.tolerance_kg;
 await db.query('set local role authenticated');
 await db.query('select wb_requirement_update($1,$2,$3,$4)',[target.id,51850,nextTolerance,locked.note]);
 const after=(await db.query('select required_kg,tolerance_kg,note from wb_requirement where id=$1',[target.id])).rows[0];
 assert.equal(Number(after.required_kg),51850);assert.equal(Number(after.tolerance_kg),Number(nextTolerance));assert.equal(after.note,locked.note);
 const state=(await db.query('select state,received_kg,slips from wb_v_requirement where id=$1',[target.id])).rows[0];
 await db.query(process.argv.includes('--apply')?'commit':'rollback');
 console.log(JSON.stringify({applied:process.argv.includes('--apply'),batch:target.batch_name,material:target.material_name,required_kg:51850,tons:51.85,tolerance_kg:Number(nextTolerance),note:'unchanged',state,method:'audited Admin requirement update'}));
 }
}catch(e){await db.query('rollback');throw e;}finally{await db.end();}
