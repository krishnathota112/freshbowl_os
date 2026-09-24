// Proof for 0132 (amendment Lab checks + cleaning are real work). One transaction, rolled back.
//   node scripts/amend-lab-clean-proof.mjs          applies 0132 inside the transaction
//   node scripts/amend-lab-clean-proof.mjs --live   0132 already applied; prove against it
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env.local', import.meta.url) });
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 60000 });
const q = async (s, a = []) => (await db.query(s, a)).rows;
const one = async (s, a) => (await q(s, a))[0];
let passed = 0;
const pass = (n) => { passed += 1; console.log('PASS', n); };
async function role(name) {
  await db.query('reset role');
  const p = await one('select id from profiles where role=$1::app_role and is_active order by id limit 1', [name]);
  await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: p.id, role: 'authenticated', app_metadata: { app_role: name } })]);
  await db.query('set local role authenticated');
  return p.id;
}
const gates = (bid, code) => q(`select g.kind, g.verdict, g.reason from batch_activity ba cross join lateral evaluate_gates(ba.id,'entry') g
  where ba.master_batch_id=$1 and ba.code=$2 and g.verdict <> 'skipped'`, [bid, code]);
const fp = () => q(`select b.id, md5(to_jsonb(b)::text) h, (select md5(string_agg(to_jsonb(a)::text,'' order by a.id)) from batch_activity a where a.master_batch_id=b.id) a
  from master_batch b where b.status in ('active','draft') order by b.id`);

try {
  await db.connect();
  await db.query('begin');
  if (!process.argv.includes('--live')) await db.query(fs.readFileSync(new URL('../supabase/migrations/0132_amendment_lab_checks_and_cleaning.sql', import.meta.url), 'utf8'));
  const before = await fp();
  const adminId = await role('admin');
  const cur = await one('select process_definition_id from v_process_catalogue where is_current');
  const roles = await q(`select e.role, m.code material_code, true lead from material_role_eligibility e join material m on m.id=e.material_id where e.is_default_lead`);
  const { id: bid } = await one(`select create_master_batch($1,$1,current_date,'{}'::jsonb,$2::jsonb,null,null,now(),$3) id`, [`TEST-0131-${Date.now()}`, JSON.stringify(roles), cur.process_definition_id]);
  await q('select generate_activity_plan($1)', [bid]);
  const cp = await one('select id from lab_checkpoint where is_prebatch order by code limit 1');
  const s = await one("select open_prebatch_sample($1,$2,'0131 fixture') id", [bid, cp.id]);
  const t = await one("select request_lab_test($1,'moisture_pct','user') id", [s.id]);
  await q('select record_lab_result($1,56.2)', [t.id]);
  await q('select activate_batch($1)', [bid]);

  const water = await one("select * from batch_activity where master_batch_id=$1 and code='MIX-HOP-WATER'", [bid]);
  const bunker = await one(`select location_id, label from v_vessel_readiness where kind='BUNKER' and is_ready and open_task_id is null order by code desc limit 1`);
  const suggested = await one(`select lab_parameters from process_activity where process_definition_id=$1 and code='LAB-HOP-PRE'`, [cur.process_definition_id]);
  console.log('  suggested params from SOP:', suggested.lab_parameters.join(', '), '· bunker:', bunker.label);

  const { id: newId } = await one(`select amend_batch_add_activity(p_batch=>$1, p_after=>$2, p_template_code=>'MIX-HOP-NEW', p_title=>'Extra hopper pass',
      p_duration_hr=>3, p_is_hold=>false, p_lab_check=>'both', p_cleaning=>'before', p_reason=>'0131 proof: moisture low',
      p_lab_params=>array['moisture_pct','ph'], p_lab_gate=>true, p_clean_locations=>array[$3::uuid], p_clean_wait=>true) id`,
    [bid, water.id, bunker.location_id]);
  const nw = await one('select code from batch_activity where id=$1', [newId]);
  const am = await one('select * from v_batch_amendment where new_activity_id=$1', [newId]);
  assert.equal(am.lab_activity_ids.length, 2); assert.equal(am.cleaning_task_ids.length, 1);
  pass(`amendment ${nw.code} created 2 Lab tasks and 1 cleaning job (${bunker.label})`);

  const labs = await q(`select ba.code, ba.lab_parameters, ba.responsible_role::text r, cp.kind, cp.parameters, l.gates_activity_code g
     from batch_activity ba join lab_checkpoint_activity l on l.process_activity_id=ba.process_activity_id
     join lab_checkpoint cp on cp.checkpoint_map=l.checkpoint_map and cp.code=l.checkpoint_code where ba.id = any($1) order by ba.code, l.gates_activity_code`, [am.lab_activity_ids]);
  for (const l of labs) console.log(`  ${l.code} · ${l.r} · ${l.kind} · [${l.parameters.join(', ')}] · gates ${l.g}`);
  assert.ok(labs.every((l) => l.r === 'lab_tech' && l.kind === 'GATE' && l.parameters.join() === 'moisture_pct,ph'));
  assert.ok(labs.some((l) => l.g === nw.code) && labs.some((l) => l.g === 'MIX-HOP-NEW'));
  pass('Lab tasks carry exactly the ticked parameters, are GATEs, gate the new step (before) and MIX-HOP-NEW (after)');

  await role('lab_tech');
  const queue = await q('select activity_title, parameters from v_lab_queue where master_batch_id=$1 and activity_id = any($2)', [bid, am.lab_activity_ids]);
  assert.equal(queue.length, 2);
  pass('both Lab checks are in the Lab queue');
  await role('admin');

  let g = await gates(bid, nw.code);
  console.log('  new step gates:', g.map((x) => `${x.kind}=${x.verdict}`).join(', '));
  assert.equal(g.find((x) => x.kind === 'LAB_APPROVED')?.verdict, 'fail');
  assert.equal(g.find((x) => x.kind === 'VESSEL_READY')?.verdict, 'fail');
  assert.match(g.find((x) => x.kind === 'VESSEL_READY').reason, new RegExp(bunker.label));
  pass(`new step is shut by the Lab gate AND by "${g.find((x) => x.kind === 'VESSEL_READY').reason}"`);

  const dep = await gates(bid, 'MIX-HOP-NEW');
  assert.equal(dep.find((x) => x.kind === 'LAB_APPROVED')?.verdict, 'fail');
  assert.equal(dep.find((x) => x.kind === 'VESSEL_READY'), undefined);
  pass('the step after waits for the after-check approval, not for the cleaning (cleaning was "before")');

  // The cleaning job: a photo + every checklist item, as the Resources screen does it.
  const task = await one('select * from vessel_readiness_task where id=$1', [am.cleaning_task_ids[0]]);
  await db.query('reset role');
  await q(`insert into vessel_readiness_media (task_id, storage_path, uploaded_by) values ($1, $2, $3)`, [task.id, `proof/${task.id}.jpg`, adminId]);
  await role('admin');
  await q('select start_vessel_cleaning($1)', [task.id]);
  await q('select complete_vessel_cleaning($1,$2,null)', [task.id, JSON.stringify(task.checklist.map((i) => ({ key: i.key, done: true })))]);
  g = await gates(bid, nw.code);
  assert.equal(g.find((x) => x.kind === 'VESSEL_READY')?.verdict, 'pass');
  assert.equal(g.find((x) => x.kind === 'LAB_APPROVED')?.verdict, 'fail');
  pass('cleaning done → the cleaning wait opens; the Lab gate still holds (recorded ≠ approved)');

  // Record-only: no gate anywhere.
  const w2 = await one("select id from batch_activity where master_batch_id=$1 and code='TN-PREP'", [bid]);
  if (w2) {
    const { id: rid } = await one(`select amend_batch_add_activity(p_batch=>$1, p_after=>$2, p_template_code=>'MIX-HOP-NEW', p_title=>'Tunnel pre-check',
        p_duration_hr=>1, p_lab_check=>'after', p_reason=>'0131 proof: record only', p_lab_params=>array['ph'], p_lab_gate=>false) id`, [bid, w2.id]);
    const rc = await one('select code from batch_activity where id=$1', [rid]);
    const labKinds = await q(`select cp.kind from batch_amendment am cross join unnest(am.lab_activity_ids) x(id) join batch_activity ba on ba.id=x.id
        join lab_checkpoint_activity l on l.process_activity_id=ba.process_activity_id join lab_checkpoint cp on cp.checkpoint_map=l.checkpoint_map and cp.code=l.checkpoint_code
        where am.new_activity_id=$1`, [rid]);
    assert.deepEqual(labKinds.map((k) => k.kind), ['RECORD']);
    pass(`a Record-only Lab check (${rc.code}) creates a RECORD that never blocks`);
  }

  await role('admin');
  const err = await (async () => { await db.query('savepoint s'); try { await q(`select amend_batch_add_activity(p_batch=>$1,p_after=>$2,p_template_code=>'MIX-HOP-NEW',p_title=>'x',p_duration_hr=>1,p_cleaning=>'before',p_reason=>'no resource ticked')`, [bid, water.id]); } catch (e) { await db.query('rollback to savepoint s'); return e.message; } return null; })();
  assert.match(err ?? '', /Tick which bunker or tunnel/);
  pass('cleaning without a ticked resource is refused');

  await db.query('reset role');
  const after = await fp();
  assert.ok(before.every((b) => after.find((x) => x.id === b.id)?.a === b.a && after.find((x) => x.id === b.id)?.h === b.h));
  pass(`all ${before.length} pre-existing batches byte-identical`);
  console.log(`\n${passed} checks passed.`);
} catch (e) {
  console.error('FAIL', e.message);
  process.exitCode = 1;
} finally {
  await db.query('rollback').catch(() => {});
  await db.end();
  console.log('Rolled back — nothing persisted.');
}
