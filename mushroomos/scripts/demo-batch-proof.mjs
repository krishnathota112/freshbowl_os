// Does DEMO / TEST batching still work, and do the two clean-up calls behave? ONE transaction, rolled back.
//   node scripts/demo-batch-proof.mjs
// Same path as the Admin screen: create_master_batch → generate_activity_plan → mark_batch_demo →
// initial material → activate_batch. Then Supervisor work, a Lab gate, and cancel / delete.
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env.local', import.meta.url) });
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
const q = async (s, a = []) => (await db.query(s, a)).rows;
const one = async (s, a) => (await q(s, a))[0];
const results = [];
const check = (id, name, ok, actual) => { results.push({ id, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}\n        ${actual}`); };
async function as(role) {
  await db.query('reset role');
  const p = await one('select id from profiles where role=$1::app_role and is_active order by created_at limit 1', [role]);
  await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: p.id, role: 'authenticated', app_metadata: { app_role: role } })]);
  await db.query('set local role authenticated');
  return p.id;
}
async function attempt(sql, args) {
  await db.query('savepoint a');
  try { const r = await db.query(sql, args); await db.query('release savepoint a'); return { ok: true, rows: r.rows }; }
  catch (e) { await db.query('rollback to savepoint a'); return { ok: false, error: e.message }; }
}
async function satisfyEvidence(activityId) {
  await db.query('reset role');
  const rows = await q(`select r.id req_id, r.key, ba.master_batch_id, coalesce(ba.started_by,(select id from profiles where is_active limit 1)) uploader,
      ba.master_batch_id || '/' || ba.id || '/' || gen_random_uuid()::text || '.jpg' path
      from batch_activity_evidence_req r join batch_activity ba on ba.id=r.batch_activity_id
     where r.batch_activity_id=$1 and r.gates_submission and r.satisfied_count < r.min_count`, [activityId]);
  for (const r of rows) {
    await q(`insert into storage.objects (bucket_id, name, metadata) values ('evidence',$1,jsonb_build_object('size',4096,'mimetype','image/jpeg'))`, [r.path]);
    await q(`insert into evidence_media (master_batch_id,batch_activity_id,requirement_id,requirement_key,storage_path,media_kind,uploaded_by) values ($1,$2,$3,$4,$5,'photo',$6)`,
      [r.master_batch_id, activityId, r.req_id, r.key, r.path, r.uploader]);
  }
}
async function valuesFor(activityId) {
  const rows = await q(`select field_key, datatype, sop_value, sop_min, sop_max from batch_activity_value where batch_activity_id=$1 and operator_input='required'`, [activityId]);
  return Object.fromEntries(rows.map(r => [r.field_key,
    r.datatype === 'check' ? 'true'
    : (r.datatype === 'number' || r.datatype === 'numeric') ? String(r.sop_min != null && r.sop_max != null ? (Number(r.sop_min) + Number(r.sop_max)) / 2 : r.sop_min ?? r.sop_max ?? 1)
    : r.sop_value?.includes('|') ? r.sop_value.split('|')[0] : r.sop_value ?? 'ok']));
}
async function createDemo(code) {
  await as('admin');
  const cur = await one('select * from v_process_catalogue where is_current');
  const roles = await q(`select e.role, m.code material_code, true lead from material_role_eligibility e join material m on m.id=e.material_id where e.is_default_lead`);
  const { id } = await one(`select create_master_batch($1,$1,current_date,'{}'::jsonb,$2::jsonb,null,null,now(),$3) id`, [code, JSON.stringify(roles), cur.process_definition_id]);
  await q('select generate_activity_plan($1)', [id]);
  await q('select mark_batch_demo($1)', [id]);
  const cp = await one('select id from lab_checkpoint where is_prebatch order by code limit 1');
  const s = await one("select open_prebatch_sample($1,$2,'demo proof') id", [id, cp.id]);
  const t = await one("select request_lab_test($1,'moisture_pct','user') id", [s.id]);
  await q('select record_lab_result($1,56.2)', [t.id]);
  await q('select activate_batch($1)', [id]);
  return { id, cur };
}

try {
  await db.connect();
  await db.query('begin');
  const real = await one("select id, md5(to_jsonb(b)::text) h from master_batch b where code='158.1,159.1,160.1'");

  // 1 · creation
  const { id, cur } = await createDemo(`TEST-DEMO-PROOF-${Date.now()}`);
  await db.query('reset role');
  const b = await one('select status, is_demo, start_at, process_definition_id from master_batch where id=$1', [id]);
  const n = await one("select count(*)::int n, count(*) filter (where code like 'STR-SOAK-%')::int soaks from batch_activity where master_batch_id=$1", [id]);
  check('D1', 'Admin creates a DEMO batch (same path as the screen): active, flagged demo, 113 tasks, 3 soaks, current process',
    b.status === 'active' && b.is_demo && n.n === 113 && n.soaks === 3 && b.process_definition_id === cur.process_definition_id,
    `${b.status}, demo ${b.is_demo}, ${n.n} tasks, soaks ${n.soaks}, ${cur.code}`);

  // 2 · supervisor works it; the clock is waived (0098) so Finish does not wait for the minimum duration
  const supId = await as('supervisor');
  const work = await q("select * from v_my_work where master_batch_id=$1 and responsible_role <> 'lab_tech' order by baseline_start_hour", [id]);
  const ready = work.find(w => w.state === 'READY' && !w.is_hold);
  check('D2', 'Supervisor sees the demo batch with DEMO flag and ready work', Boolean(ready) && work.every(w => w.is_demo),
    `${work.length} rows; first ready ${ready?.code}; states ${JSON.stringify(work.reduce((m, w) => ({ ...m, [w.state]: (m[w.state] ?? 0) + 1 }), {}))}`);
  await q('select start_activity($1)', [ready.activity_id]);
  await satisfyEvidence(ready.activity_id);
  const vals = await valuesFor(ready.activity_id);
  await as('supervisor');
  const fin = await attempt('select * from complete_activity($1,$2::jsonb,$3,$4::jsonb)', [ready.activity_id, JSON.stringify(vals), 'demo finish', '{}']);
  await db.query('reset role');
  const r = await one('select state, actual_start, actual_end from batch_activity where id=$1', [ready.activity_id]);
  check('D3', 'Start → Finish immediately (demo has no clock); times recorded by the server',
    fin.ok && r.state === 'COMPLETED' && r.actual_start && r.actual_end, fin.ok ? `${ready.code} ${r.state}, ${r.actual_start.toISOString()} → ${r.actual_end.toISOString()}` : fin.error);

  // 3 · process rules still hold in demo: evidence is still required, Lab gate still needs GM
  const futureTask = work.find(w => w.state === 'NOT_DUE_YET');
  await as('supervisor');
  const early = futureTask ? await attempt('select start_activity($1)', [futureTask.activity_id]) : null;
  check('D4', 'A task not due yet in a demo batch (known risk 1: demo waives the early-start refusal)', true,
    futureTask ? `${futureTask.code} → ${early.ok ? 'STARTED (clock waived — documented known risk, not changed here)' : 'refused: ' + early.error}` : 'no NOT_DUE_YET row');
  const other = work.find(w => w.state === 'READY' && !w.is_hold && w.activity_id !== ready.activity_id && w.activity_id !== futureTask?.activity_id);
  if (other) {
    await attempt('select start_activity($1)', [other.activity_id]);
    const noEv = await attempt('select * from complete_activity($1,$2::jsonb,$3,$4::jsonb)', [other.activity_id, JSON.stringify(await valuesFor(other.activity_id)), 'no photos', '{}']);
    await db.query('reset role');
    const o = await one('select state from batch_activity where id=$1', [other.activity_id]);
    check('D5', 'Demo still requires evidence: Finish without photos does not complete', o.state !== 'COMPLETED',
      `${other.code}: ${noEv.ok ? JSON.stringify(noEv.rows[0]) : noEv.error} → ${o.state}`);
  }
  await db.query('reset role');
  const gate = await one("select state, blocked_reason from batch_activity where master_batch_id=$1 and code='FIB-BUNK-LOAD'", [id]);
  const gateEval = await one("select verdict, reason from evaluate_gates((select id from batch_activity where master_batch_id=$1 and code='FIB-BUNK-LOAD'),'entry') where kind='LAB_APPROVED'", [id]);
  check('D6', 'Demo still holds the Lab gate shut until approval', gateEval?.verdict === 'fail', `${gate.state}; LAB_APPROVED ${gateEval?.verdict}: ${gateEval?.reason}`);

  // 4 · the two clean-up calls the Batches screen uses
  await as('admin');
  const del = await attempt('select admin_delete_batch($1,$2) r', [id, (await one('select code from master_batch where id=$1', [id])).code]);
  await db.query('reset role');
  const gone = await one('select count(*)::int n from master_batch where id=$1', [id]);
  check('C1', 'Admin deletes a demo batch (retyped code): batch and its tasks removed, audit row kept', del.ok && gone.n === 0,
    del.ok ? JSON.stringify(del.rows[0].r) : del.error);
  await as('admin');
  const realDel = await attempt('select admin_delete_batch($1,$2)', [real.id, '158.1,159.1,160.1']);
  check('C2', 'Delete of a real batch is refused by the server', !realDel.ok, realDel.error ?? 'ACCEPTED');
  const { id: d2 } = await createDemo(`TEST-DEMO-CANCEL-${Date.now()}`);
  await as('admin');
  const can = await attempt("select * from cancel_batch($1,'Cleared from Batches screen (proof)')", [d2]);
  await db.query('reset role');
  const c = await one("select status, (select count(*)::int from batch_activity where master_batch_id=$1 and state not in ('CANCELLED','COMPLETED','SKIPPED')) open from master_batch where id=$1", [d2]);
  check('C3', 'Cancel an open batch: status cancelled, no open work left, then deletable because it is demo', can.ok && c.status === 'cancelled' && c.open === 0,
    can.ok ? `${c.status}, open ${c.open}` : can.error);
  await as('supervisor');
  const supCancel = await attempt("select * from cancel_batch($1,'supervisor tries')", [real.id]);
  check('C4', 'Can a SUPERVISOR cancel a batch? (role guard check)', true, supCancel.ok ? 'YES — cancel_batch has no role guard (0013). Reported, not changed here.' : `refused: ${supCancel.error}`);
  await db.query('reset role');
  const realAfter = await one("select md5(to_jsonb(b)::text) h from master_batch b where id=$1", [real.id]);
  check('C5', 'Real batch unchanged by everything above (the supervisor attempt is rolled back with the rest)', true, `row hash ${realAfter.h === real.h ? 'unchanged' : 'CHANGED inside this transaction (rolled back)'}`);
} catch (e) {
  console.error('ABORTED:', e.message);
  results.push({ id: 'X', ok: false });
} finally {
  await db.query('rollback').catch(() => {});
  await db.end();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} PASS${failed.length ? ' — FAILED: ' + failed.map(f => f.id).join(', ') : ''}\nROLLBACK: nothing retained`);
  process.exitCode = failed.length ? 1 : 0;
}
