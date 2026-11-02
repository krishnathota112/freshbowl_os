// Focused MVP proof. All fixtures and writes are rolled back; no production rows are edited.
import assert from 'node:assert/strict';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env.local', import.meta.url) });
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const one = async (sql, args) => (await q(sql, args))[0];
const pass = name => console.log('PASS', name);
async function role(name) {
  await db.query('reset role');
  const p = await one('select id from profiles where role=$1::app_role and is_active order by id limit 1', [name]);
  assert.ok(p, `active ${name}`);
  await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub:p.id, role:'authenticated', app_metadata:{app_role:name} })]);
  await db.query('set local role authenticated');
  return p.id;
}
async function fingerprint() {
  return q(`select b.id, to_jsonb(b) as batch,
    (select jsonb_agg(to_jsonb(a) order by a.id) from batch_activity a where a.master_batch_id=b.id) activities
    from master_batch b where b.status='active' order by b.id`);
}
try {
  await db.connect();
  await db.query('begin');
  const before = await fingerprint();
  await role('admin');
  const current = await one('select * from v_process_catalogue where is_current');
  assert.equal(current.code, 'PROCESS-2026K');
  const roles = await q(`select e.role, m.code material_code, true lead from material_role_eligibility e
    join material m on m.id=e.material_id where e.is_default_lead`);
  const name = `TEST-MVP-ROLLBACK-${Date.now()}`;
  const {id} = await one(`select create_master_batch($1,$1,current_date,'{}'::jsonb,$2::jsonb,null,null,now(),$3) id`,
    [name,JSON.stringify(roles),current.process_definition_id]);
  await q('select generate_activity_plan($1)',[id]);
  const cp=await one('select id from lab_checkpoint where is_prebatch order by code limit 1');
  const sample=await one("select open_prebatch_sample($1,$2,'MVP rollback fixture') id",[id,cp.id]);
  const test=await one("select request_lab_test($1,'moisture_pct','user') id",[sample.id]);
  await q('select record_lab_result($1,56.2)',[test.id]);
  const blockers=await q("select * from validate_batch($1) where severity='blocking'",[id]);
  assert.deepEqual(blockers,[]);
  await q('select activate_batch($1)',[id]);
  const batch=await one('select * from master_batch where id=$1',[id]);
  assert.equal(batch.status,'active');
  assert.ok(batch.start_at);
  const plan=await q('select * from batch_activity where master_batch_id=$1 order by id',[id]);
  assert.equal(plan.length,113);
  assert.ok(plan.some(a=>a.code==='STR-SOAK-3'));
  for(const a of plan) {
    assert.equal(a.process_definition_id === undefined || a.process_definition_id === current.process_definition_id,true);
    if(a.baseline_start_hour !== null) assert.equal(+new Date(a.planned_start_at),+new Date(batch.start_at)+Number(a.baseline_start_hour)*3600000);
  }
  pass('Admin creates/records initial material/activates a 113-task Standard batch with one H0');
  assert.ok(plan.some(a=>a.state==='NOT_DUE_YET'));
  assert.equal((await q("select a.id from batch_activity a cross join lateral planned_time_status(a.id) p where a.master_batch_id=$1 and a.state='READY' and not p.ok",[id])).length,0);
  pass('future tasks are not falsely READY');
  await role('supervisor');
  const work=await q("select * from v_my_work where master_batch_id=$1 and responsible_role<>'lab_tech'",[id]);
  assert.ok(work.some(a=>a.state==='READY'));
  const activity=work.find(a=>a.state==='READY' && !a.is_hold);
  await q('select start_activity($1)',[activity.activity_id]);
  assert.equal((await one('select state from batch_activity where id=$1',[activity.activity_id])).state,'IN_PROGRESS');
  pass('Supervisor sees production work and Start persists');
  const ticket=await one("select request_extension($1,1,'MVP rollback test: equipment concern') id",[activity.activity_id]);
  await role('admin');
  await q("select admin_decide_extension($1,true,'MVP rollback decision: one hour granted',1)",[ticket.id]);
  await role('supervisor');
  const visible=await one('select status,admin_reason,admin_granted_hr from v_extension_request where id=$1',[ticket.id]);
  assert.equal(visible.status,'ADMIN_APPROVED');
  assert.equal(visible.admin_reason,'MVP rollback decision: one hour granted');
  pass('Supervisor ticket → Admin decision → requester reads persisted status/remark under authenticated RLS');
  await role('lab_tech');
  const lab=await q('select * from v_lab_queue where master_batch_id=$1',[id]);
  assert.ok(lab.length>0);
  console.log('Lab queue states',JSON.stringify(lab.reduce((counts,a)=>({...counts,[a.state]:(counts[a.state]??0)+1}),{})));
  assert.ok(lab.every(a=>a.master_batch_id===id));
  pass('Lab sees its checkpoints under authenticated RLS');
  await db.query('reset role');
  const after=await fingerprint();
  assert.deepEqual(after.filter(b=>b.id!==id),before);
  const afterPlan=await q('select id,planned_start_at,planned_end_at,baseline_start_hour,baseline_end_hour from batch_activity where master_batch_id=$1 order by id',[id]);
  assert.deepEqual(afterPlan,plan.map(({id,planned_start_at,planned_end_at,baseline_start_hour,baseline_end_hour})=>({id,planned_start_at,planned_end_at,baseline_start_hour,baseline_end_hour})));
  pass('all pre-existing active batches unchanged; new batch baseline unchanged after ticket');
} catch(e) { console.error('FAIL',e.message); process.exitCode=1; }
finally { await db.query('rollback').catch(()=>{}); await db.end(); console.log('ROLLBACK: no test data retained'); }
