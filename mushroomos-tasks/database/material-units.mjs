// Transactional proof for 0157. Default rolls everything back; --apply commits DDL only.
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
async function digest(){const out={};for(const table of ['wb_batch','wb_requirement','wb_slip','wb_alert'])out[table]=(await one(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) hash from ${table} t`)).hash;return out;}
await db.connect();
try{
 await db.query('begin');await db.query("set local lock_timeout='10s'");const before=await digest();
 if(!process.argv.includes('--live'))await db.query(readFileSync(new URL('0157_weighment_material_units.sql',import.meta.url),'utf8'));
 assert.equal((await one("select weight_unit from wb_material where code='ammonium_sulphate'")).weight_unit,'kg');
 assert.equal((await one("select weight_unit from wb_material where code='paddy_local'")).weight_unit,'t');
 console.log('PASS ammonium sulphate defaults kg; other materials default tons');
 await db.query('savepoint fixtures');await as('admin');
 const name='Unit proof '+Date.now();
 const batch=(await one('select wb_batch_create_v2($1,null,$2::jsonb) id',[name,JSON.stringify([{material:'bagasse',required_kg:20000,tolerance_kg:100,weight_unit:'t'}])])).id;
 const bag=await one("select r.id,r.required_kg,m.weight_unit from wb_requirement r join wb_material m on m.code=r.material_code where r.wb_batch_id=$1 and r.material_code='bagasse'",[batch]);
 assert.equal(Number(bag.required_kg),20000);assert.equal(bag.weight_unit,'t');
 const req=(await one("select wb_requirement_add_v2($1,'ammonium_sulphate',125,1,null,'kg') id",[batch])).id;
 assert.equal(Number((await one('select required_kg from wb_requirement where id=$1',[req])).required_kg),125);
 await one("select wb_requirement_update_v2($1,126,2,null,'kg')",[req]);
 assert.equal(Number((await one('select required_kg from wb_requirement where id=$1',[req])).required_kg),126);
 await one("select wb_material_set_unit('bagasse','kg')");
 assert.equal((await one('select weight_unit from wb_v_requirement where id=$1',[bag.id])).weight_unit,'kg');
 assert.equal(Number((await one('select required_kg from wb_requirement where id=$1',[bag.id])).required_kg),20000);
 console.log('PASS create/add/edit + preference leave canonical kg unchanged');
 await as('supervisor');await db.query('savepoint forbidden');let error;
 try{await one("select wb_material_set_unit('bagasse','t')");}catch(e){error=e;}
 await db.query('rollback to savepoint forbidden');assert(error);assert.match(error.message,/role|Only|allowed|permission/i);
 console.log('PASS non-Admin cannot change material preferences');
 await db.query('reset role');await db.query('rollback to savepoint fixtures');assert.deepEqual(await digest(),before);
 console.log('PASS every existing batch, requirement, slip and alert unchanged');
 if(process.argv.includes('--apply')&&!process.argv.includes('--live')){await db.query('commit');console.log('Installed 0157; fixtures rolled back.');}
 else{await db.query('rollback');console.log('All migration and fixture changes rolled back.');}
}catch(e){await db.query('rollback');throw e;}finally{await db.end();}
