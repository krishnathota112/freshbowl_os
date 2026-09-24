// DEMO batch · the Lab gate chain, end to end, with no fixture shortcuts on the production side.
//   Supervisor does every step up to the gated one (demo = no clock, so no waiting) →
//   Supervisor is REFUSED at the gated step → Lab takes the sample, records, submits →
//   still refused → GM rejects with a remark (Admin sees it; still refused) → Lab resubmits →
//   GM approves with a remark (Admin sees verdict, remark, who, when) → Supervisor starts.
// ONE transaction, rolled back.   node scripts/demo-lab-gate-proof.mjs [--with 0126_file.sql]
import { readFileSync } from 'node:fs';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env.local', import.meta.url) });
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
const q = async (s, a = []) => (await db.query(s, a)).rows;
const one = async (s, a) => (await q(s, a))[0];
const results = [];
const check = (id, name, ok, actual) => { results.push({ id, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}\n        ${actual}`); };
const ids = {};
async function as(role) {
  await db.query('reset role');
  if (!ids[role]) ids[role] = (await one('select id from profiles where role=$1::app_role and is_active order by created_at limit 1', [role]))?.id;
  if (!ids[role]) throw new Error(`no active ${role} login`);
  await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: ids[role], role: 'authenticated', app_metadata: { app_role: role } })]);
  await db.query('set local role authenticated');
}
async function attempt(sql, args) {
  await db.query('savepoint a');
  try { const r = await db.query(sql, args); await db.query('release savepoint a'); return { ok: true, rows: r.rows }; }
  catch (e) { await db.query('rollback to savepoint a'); return { ok: false, error: e.message }; }
}
/** Photos: the storage object + evidence row the camera screen writes (the only fixture). */
async function photos(activityId) {
  const role = (await one("select current_setting('role') r")).r;
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
  if (role === 'authenticated') await db.query('set local role authenticated');
}
async function values(activityId) {
  const rows = await q(`select field_key, datatype, sop_value, sop_min, sop_max from batch_activity_value where batch_activity_id=$1 and operator_input='required'`, [activityId]);
  return JSON.stringify(Object.fromEntries(rows.map(r => [r.field_key,
    r.datatype === 'check' ? 'true'
    : (r.datatype === 'number' || r.datatype === 'numeric') ? String(r.sop_min != null && r.sop_max != null ? (Number(r.sop_min) + Number(r.sop_max)) / 2 : r.sop_min ?? r.sop_max ?? 1)
    : r.sop_value?.includes('|') ? r.sop_value.split('|')[0] : r.sop_value ?? 'ok'])));
}
const act = (batch, code) => one('select * from batch_activity where master_batch_id=$1 and code=$2', [batch, code]);
async function labSubmit(labAct, cp, round) {
  await as('lab_tech');
  if (['READY', 'RETURNED'].includes((await one('select state from batch_activity where id=$1', [labAct.id])).state)) {
    await q('select start_activity($1)', [labAct.id]);
  }
  const sample = await one("select open_lab_sample($1,$2,$3,now()) id", [labAct.id, cp.id, `demo sample ${round}`]);
  for (const p of cp.parameters) {
    const t = await one("select request_lab_test($1,$2,'user') id", [sample.id, p]);
    const s = await one('select target_min, target_max from lab_test where id=$1', [t.id]);
    await q('select record_lab_result($1,$2)', [t.id, s.target_min != null && s.target_max != null ? (Number(s.target_min) + Number(s.target_max)) / 2 : 50]);
  }
  await photos(labAct.id);
  return one("select * from submit_activity($1,'{}'::jsonb,$2,null,null,'{}'::jsonb)", [labAct.id, `lab submit ${round}`]);
}
const adminView = async (batch, labId) => { await as('admin'); return one('select * from v_lab_approval_queue where master_batch_id=$1 and activity_id=$2', [batch, labId]); };

try {
  await db.connect();
  await db.query('begin');
  const w = process.argv.indexOf('--with');
  if (w > 0) {
    await db.query(readFileSync(new URL(`../supabase/migrations/${process.argv[w + 1]}`, import.meta.url), 'utf8'));
    console.log(`loaded ${process.argv[w + 1]} inside the transaction`);
  }

  // demo batch, created the way the screen creates it
  await as('admin');
  const cur = await one('select * from v_process_catalogue where is_current');
  const roles = await q(`select e.role, m.code material_code, true lead from material_role_eligibility e join material m on m.id=e.material_id where e.is_default_lead`);
  const { id } = await one(`select create_master_batch($1,$1,current_date,'{}'::jsonb,$2::jsonb,null,null,now(),$3) id`, [`TEST-DEMO-GATE-${Date.now()}`, JSON.stringify(roles), cur.process_definition_id]);
  await q('select generate_activity_plan($1)', [id]);
  await q('select mark_batch_demo($1)', [id]);
  const pcp = await one('select id from lab_checkpoint where is_prebatch order by code limit 1');
  const ps = await one("select open_prebatch_sample($1,$2,'demo') id", [id, pcp.id]);
  const pt = await one("select request_lab_test($1,'moisture_pct','user') id", [ps.id]);
  await q('select record_lab_result($1,56.2)', [pt.id]);
  await q('select activate_batch($1)', [id]);

  // Supervisor works the fibre line up to the gated step, for real
  await db.query('reset role');
  const chain = await q(`with recursive d(id) as (
      select pred.id from batch_activity cur join gate_rule g on g.process_activity_id=cur.process_activity_id and g.kind='PREDECESSOR' and g.phase='entry' and g.is_enabled
        join batch_activity pred on pred.master_batch_id=cur.master_batch_id and g.config->'activity_codes' ? pred.code
       where cur.master_batch_id=$1 and cur.code='FIB-BUNK-LOAD'
      union
      select pred.id from d join batch_activity cur on cur.id=d.id join gate_rule g on g.process_activity_id=cur.process_activity_id and g.kind='PREDECESSOR' and g.phase='entry' and g.is_enabled
        join batch_activity pred on pred.master_batch_id=cur.master_batch_id and g.config->'activity_codes' ? pred.code)
    select a.id, a.code, a.responsible_role, a.is_hold from d join batch_activity a on a.id=d.id order by a.baseline_start_hour, a.seq`, [id]);
  const done = [];
  for (let pass = 0; pass < 5 && done.length < chain.length; pass++) {
    for (const a of chain) {
      if (done.includes(a.code)) continue;
      await as(a.responsible_role === 'lab_tech' ? 'lab_tech' : 'supervisor');
      // a passive hold is not started: the task screen offers "Confirm the condition is met" (Finish)
      const s = a.is_hold ? { ok: true } : await attempt('select start_activity($1)', [a.id]);
      if (!s.ok && !/already/i.test(s.error)) { if (pass === 4) console.log('         start', a.code, s.error); continue; }
      await photos(a.id);
      const f = await attempt('select * from complete_activity($1,$2::jsonb,$3,$4::jsonb)', [a.id, await values(a.id), 'demo', '{}']);
      await db.query('reset role');
      if ((await one('select state from batch_activity where id=$1', [a.id])).state === 'COMPLETED') done.push(a.code);
      else console.log('         finish', a.code, f.ok ? JSON.stringify(f.rows[0]) : f.error);
    }
  }
  check('G1', 'Supervisor completes every step before the gated one (demo: no waiting)', done.length === chain.length, `${done.join(' → ')} (${done.length}/${chain.length})`);

  const gated = await act(id, 'FIB-BUNK-LOAD');
  await as('supervisor');
  const early = await attempt('select start_activity($1)', [gated.id]);
  check('G2', 'Supervisor cannot start the gated step before Lab + GM', !early.ok, early.ok ? 'STARTED — gate bypassed' : early.error);

  const labAct = await one(`select a.* from batch_activity a join lab_checkpoint_activity lca on lca.process_activity_id=a.process_activity_id
                             where a.master_batch_id=$1 and lca.gates_activity_code='FIB-BUNK-LOAD' limit 1`, [id]);
  const cp = await one(`select lc.* from lab_checkpoint lc join lab_checkpoint_activity lca on lca.checkpoint_code=lc.code and lca.checkpoint_map=lc.checkpoint_map where lca.process_activity_id=$1 limit 1`, [labAct.process_activity_id]);
  await as('lab_tech');
  const inQueue = await one('select state from v_lab_queue where activity_id=$1', [labAct.id]);
  const sub1 = await labSubmit(labAct, cp, 1);
  check('G3', 'Lab sees the checkpoint, samples, records, submits', Boolean(inQueue) && sub1.new_state === 'COMPLETED', `queue ${inQueue?.state}; submit ${JSON.stringify(sub1)}`);
  const self = await attempt("select decide_lab_submission($1,'approved','self')", [labAct.id]);
  await as('supervisor');
  const afterSubmit = await attempt('select start_activity($1)', [gated.id]);
  let a1 = await adminView(id, labAct.id);
  check('G4', 'After submit: Lab cannot approve; Supervisor still refused; Admin sees "awaiting GM"',
    !self.ok && !afterSubmit.ok && a1?.awaiting_decision === true,
    `self-approve: ${self.error ?? 'ACCEPTED'} | supervisor: ${afterSubmit.error ?? 'STARTED'} | admin: awaiting ${a1?.awaiting_decision}`);

  // GM rejects with a remark
  await as('gm');
  const gmQueue = await one('select awaiting_decision from v_lab_approval_queue where activity_id=$1', [labAct.id]);
  await q("select decide_lab_submission($1,'rejected','Moisture too high — re-sample after flipping')", [labAct.id]);
  a1 = await adminView(id, labAct.id);
  await as('supervisor');
  const afterReject = await attempt('select start_activity($1)', [gated.id]);
  check('G5', 'GM rejects with a remark → Admin sees REJECTED + remark + GM name; Supervisor still refused',
    gmQueue?.awaiting_decision && a1?.latest_verdict === 'rejected' && /too high/.test(a1?.latest_reason ?? '') && !afterReject.ok,
    `admin: ${a1?.latest_verdict} "${a1?.latest_reason}" by ${a1?.decided_by_name} (${a1?.decided_role}) at ${a1?.decided_at?.toISOString?.()} | awaiting ${a1?.awaiting_decision} | supervisor: ${afterReject.error ?? 'STARTED'}`);
  await db.query('reset role');
  const labAfter = await one('select state, blocked_reason from batch_activity where id=$1', [labAct.id]);
  const note = await one("select message, reason from notification where batch_activity_id=$1 and to_role='lab_tech' order by sent_at desc limit 1", [labAct.id]);
  check('G5b', 'The rejection goes back to the Lab (RETURNED with the remark) and the Lab is notified',
    labAfter.state === 'RETURNED' && /too high/.test(labAfter.blocked_reason ?? '') && Boolean(note),
    `${labAfter.state}: ${labAfter.blocked_reason} | notification: ${note ? `${note.message} (${note.reason})` : 'none'}`);

  // Lab resubmits, GM approves with a remark
  const sub2 = await attempt('select 1', []);
  const resub = await labSubmit(labAct, cp, 2).then(r => ({ ok: true, r }), e => ({ ok: false, e: e.message }));
  a1 = await adminView(id, labAct.id);
  check('G6', 'Lab re-samples and resubmits after a rejection; Admin sees it awaiting the GM again',
    resub.ok && a1?.awaiting_decision === true, resub.ok ? `submit ${JSON.stringify(resub.r)}; awaiting ${a1?.awaiting_decision}` : resub.e);
  void sub2;
  await as('gm');
  await q("select decide_lab_submission($1,'approved','Within spec on re-sample — go ahead with bunker filling')", [labAct.id]);
  a1 = await adminView(id, labAct.id);
  check('G7', 'GM approves with a remark → Admin sees APPROVED + remark + GM name + time',
    a1?.latest_verdict === 'approved' && a1?.is_approved && /go ahead/.test(a1?.latest_reason ?? '') && a1?.decided_by_name,
    `${a1?.latest_verdict} "${a1?.latest_reason}" by ${a1?.decided_by_name} at ${a1?.decided_at?.toISOString?.()}; decisions on record ${a1?.decision_count}`);

  // Supervisor starts
  await as('supervisor');
  const my = await one('select state, blocked_reason from v_my_work where activity_id=$1', [gated.id]);
  const go = await attempt('select start_activity($1)', [gated.id]);
  await db.query('reset role');
  const g = await one('select state, actual_start from batch_activity where id=$1', [gated.id]);
  check('G8', 'Supervisor now sees the step READY and starts it; start time recorded', go.ok && g.state === 'IN_PROGRESS' && g.actual_start,
    `My Work: ${my?.state}; start ${go.ok ? 'ok' : go.error}; now ${g.state} at ${g.actual_start?.toISOString?.()}`);
  await as('supervisor');
  const supSees = await attempt('select latest_verdict, latest_reason from v_lab_approval_queue where activity_id=$1', [labAct.id]);
  check('G9', 'Can the Supervisor read the GM remark? (for the task screen)', true,
    supSees.ok ? (supSees.rows[0] ? `yes: ${supSees.rows[0].latest_verdict} "${supSees.rows[0].latest_reason}"` : 'no row visible (RLS)') : `no: ${supSees.error}`);
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
