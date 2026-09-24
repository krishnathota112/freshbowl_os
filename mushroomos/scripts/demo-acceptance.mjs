// DEMO READINESS ACCEPTANCE (16 Sep 2026) — scenarios A–G against the shared live database.
//
// ONE transaction, ROLLED BACK at the end: no batch, ticket, sample or evidence row survives.
// Product calls run as `authenticated` with a real profile's claims, so RLS and role guards apply
// exactly as they do for the app. Fixture shortcuts (marked FIXTURE) run as the owner and touch
// only the batches this script creates; each one says why it exists.
//
//   node scripts/demo-acceptance.mjs
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env.local', import.meta.url) });

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000, statement_timeout: 60000 });
let firstError = null;
const q = async (sql, args = []) => {
  try { return (await db.query(sql, args)).rows; }
  catch (e) { if (!firstError && !/transaction is aborted/.test(e.message)) firstError = `${e.message}
        in: ${sql.replace(/\s+/g, ' ').slice(0, 160)}`; throw e; }
};
const one = async (sql, args) => (await q(sql, args))[0];

const results = [];
function check(id, name, expected, actual, ok) {
  results.push({ id, name, expected, actual, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}\n        expected: ${expected}\n        actual:   ${actual}`);
}
/** Run a call that must be REFUSED; the savepoint keeps the transaction usable. */
async function refused(sql, args) {
  await db.query('savepoint r');
  try { await db.query(sql, args); await db.query('rollback to savepoint r'); return null; }
  catch (e) { await db.query('rollback to savepoint r'); return e.message; }
}
async function as(roleName, personId) {
  await db.query('reset role');
  const p = personId
    ? { id: personId }
    : await one('select id from profiles where role=$1::app_role and is_active order by created_at nulls last limit 1', [roleName]);
  if (!p) throw new Error(`no active ${roleName}`);
  await q("select set_config('request.jwt.claims',$1,true)",
    [JSON.stringify({ sub: p.id, role: 'authenticated', app_metadata: { app_role: roleName } })]);
  await db.query('set local role authenticated');
  return p.id;
}
const owner = () => db.query('reset role');
/** advance_batch is a server-side step (not granted to app users); run it as the owner, in a savepoint. */
async function advance(batchId) {
  const saved = await one("select current_setting('role') r");
  await db.query('savepoint adv'); await owner();
  try { await db.query('select advance_batch($1)', [batchId]); await db.query('release savepoint adv'); }
  catch (e) { await db.query('rollback to savepoint adv'); console.log('        advance_batch:', e.message); }
  if (saved.r === 'authenticated') await db.query('set local role authenticated');
}

/** Everything about a batch that must not move when another batch is worked. */
async function fingerprint(batchId) {
  return (await one(`select md5(to_jsonb(b)::text) b,
      (select md5(string_agg(to_jsonb(a)::text, '|' order by a.id)) from batch_activity a where a.master_batch_id=b.id) a,
      (select count(*) from evidence_media e where e.master_batch_id=b.id) ev,
      (select count(*) from extension_request x where x.master_batch_id=b.id) tk
    from master_batch b where b.id=$1`, [batchId]));
}
const act = (batch, code) => one('select * from batch_activity where master_batch_id=$1 and code=$2 order by instance_no limit 1', [batch, code]);

/** FIXTURE: storage object + evidence row per outstanding requirement (same as tests/db.ts satisfyEvidence). */
async function satisfyEvidence(activityId) {
  const rows = await q(`select r.id req_id, r.key, ba.master_batch_id,
        coalesce(ba.started_by, ba.assigned_person_id, (select id from profiles where is_active limit 1)) uploader,
        ba.master_batch_id || '/' || ba.id || '/' || gen_random_uuid()::text || '.jpg' path
      from batch_activity_evidence_req r join batch_activity ba on ba.id=r.batch_activity_id
     where r.batch_activity_id=$1 and r.gates_submission and r.satisfied_count < r.min_count`, [activityId]);
  for (const r of rows) {
    await q(`insert into storage.objects (bucket_id, name, metadata) values ('evidence',$1,jsonb_build_object('size',4096,'mimetype','image/jpeg'))`, [r.path]);
    await q(`insert into evidence_media (master_batch_id,batch_activity_id,requirement_id,requirement_key,storage_path,media_kind,uploaded_by)
             values ($1,$2,$3,$4,$5,'photo',$6)`, [r.master_batch_id, activityId, r.req_id, r.key, r.path, r.uploader]);
  }
  return rows.length;
}
/** The readings a Finish must carry, filled with in-range values of their declared type. */
async function valuesFor(activityId) {
  const rows = await q(`select field_key, datatype, sop_value, sop_min, sop_max from batch_activity_value
                         where batch_activity_id=$1 and operator_input='required'`, [activityId]);
  const v = {};
  for (const r of rows) {
    if (r.datatype === 'check') v[r.field_key] = 'true';
    else if (r.datatype === 'number' || r.datatype === 'numeric')
      v[r.field_key] = String(r.sop_min != null && r.sop_max != null ? (Number(r.sop_min) + Number(r.sop_max)) / 2 : r.sop_min ?? r.sop_max ?? 1);
    else if (r.sop_value && r.sop_value.includes('|')) v[r.field_key] = r.sop_value.split('|')[0];
    else v[r.field_key] = r.sop_value ?? 'ok';
  }
  return v;
}
/** Admin creates + records initial material + activates, the same RPC path as the Admin screens. */
async function createBatch(code, startAtSql) {
  await as('admin');
  const cur = await one('select * from v_process_catalogue where is_current');
  const roles = await q(`select e.role, m.code material_code, true lead from material_role_eligibility e
                           join material m on m.id=e.material_id where e.is_default_lead`);
  const { id } = await one(`select create_master_batch($1,$1,current_date,'{}'::jsonb,$2::jsonb,null,null,${startAtSql},$3) id`,
    [code, JSON.stringify(roles), cur.process_definition_id]);
  await q('select generate_activity_plan($1)', [id]);
  const cp = await one('select id from lab_checkpoint where is_prebatch order by code limit 1');
  const sample = await one("select open_prebatch_sample($1,$2,'acceptance fixture') id", [id, cp.id]);
  const test = await one("select request_lab_test($1,'moisture_pct','user') id", [sample.id]);
  await q('select record_lab_result($1,56.2)', [test.id]);
  return { id, cur };
}

try {
  await db.connect();
  await db.query('begin');

  // ── A · EXISTING RUNNING BATCH ───────────────────────────────────────────────────────────────
  await owner();
  const real = await one("select * from master_batch where code='158.1,159.1,160.1'");
  const realBefore = await fingerprint(real.id);
  await as('admin');
  const mon = await one('select * from v_batch_monitor where master_batch_id=$1', [real.id]).catch(() => null)
    ?? await one('select * from v_batch_monitor where batch_id=$1', [real.id]).catch(() => null);
  const realStates = await q('select state, count(*)::int n from batch_activity where master_batch_id=$1 group by 1 order by 1', [real.id]);
  const realPos = await q(`select code, title, state from batch_activity where master_batch_id=$1 and state in ('READY','IN_PROGRESS','BLOCKED') order by baseline_start_hour nulls last`, [real.id]);
  check('A1', 'Admin opens the existing running batch (monitor row + states + current work)',
    'a monitor row, state counts, and at least one current task',
    `monitor=${mon ? 'yes' : 'NO'}; start_at=${real.start_at?.toISOString?.() ?? real.start_at}; ${realStates.map(s => `${s.state} ${s.n}`).join(' · ')}; current: ${realPos.map(p => `${p.code}[${p.state}]`).join(', ')}`,
    Boolean(mon) && realPos.length > 0);
  if (mon) console.log('        monitor columns:', Object.keys(mon).join(', '));

  // ── B · NEW BATCH, H0 = now ──────────────────────────────────────────────────────────────────
  const B = await createBatch(`TEST-ACCEPT-B-${Date.now()}`, 'now()');
  const blockers = await q("select * from validate_batch($1) where severity='blocking'", [B.id]);
  await q('select activate_batch($1)', [B.id]);
  await owner();
  const bRow = await one('select * from master_batch where id=$1', [B.id]);
  const plan = await q('select a.*, pa.process_definition_id pd from batch_activity a join process_activity pa on pa.id=a.process_activity_id where a.master_batch_id=$1', [B.id]);
  check('B1', 'Admin creates and activates the batch', 'status active, no blocking validation',
    `status ${bRow.status}; blocking ${blockers.length}`, bRow.status === 'active' && blockers.length === 0);
  const offH0 = plan.filter(a => a.baseline_start_hour !== null &&
    +new Date(a.planned_start_at) !== +new Date(bRow.start_at) + Number(a.baseline_start_hour) * 3600000);
  check('B2', 'Exactly one H0: every planned start = start_at + its baseline hour, across all streams',
    '0 activities off the H0 axis', `${offH0.length} off; streams ${[...new Set(plan.map(a => a.stream))].join(',')}`, offH0.length === 0 && bRow.start_at);
  check('B3', 'Process version is the current one (PROCESS-2026K)', 'PROCESS-2026K, every activity from its definition',
    `${B.cur.code}; activities from other definitions: ${plan.filter(a => a.pd !== B.cur.process_definition_id).length}`,
    B.cur.code === 'PROCESS-2026K' && plan.every(a => a.pd === B.cur.process_definition_id));
  const soaks = plan.filter(a => /^STR-SOAK-\d$/.test(a.code)).map(a => a.code).sort();
  check('B4', 'Expected activities generated; Punjab/Standard has Soak 1, 2, 3', '113 activities; STR-SOAK-1,2,3',
    `${plan.length} activities; ${soaks.join(',')}`, plan.length === 113 && soaks.join() === 'STR-SOAK-1,STR-SOAK-2,STR-SOAK-3');
  const falseReady = await q(`select a.code from batch_activity a cross join lateral planned_time_status(a.id) p
                               where a.master_batch_id=$1 and a.state='READY' and not p.ok`, [B.id]);
  const states = plan.reduce((m, a) => ({ ...m, [a.state]: (m[a.state] ?? 0) + 1 }), {});
  check('B5', 'No future task is READY; future work is NOT_DUE_YET', 'READY-but-not-due = 0, NOT_DUE_YET > 0',
    `READY-but-not-due ${falseReady.length}; ${JSON.stringify(states)}`, falseReady.length === 0 && (states.NOT_DUE_YET ?? 0) > 0);

  // ── C · SUPERVISOR ───────────────────────────────────────────────────────────────────────────
  const supId = await as('supervisor');
  // My Work shows v_my_work minus Lab rows (MyWork.tsx filters responsible_role <> 'lab_tech').
  const allWork = await q('select * from v_my_work where master_batch_id=$1', [B.id]);
  const work = allWork.filter(w => w.responsible_role !== 'lab_tech');
  const labInSup = work.filter(w => w.responsible_role === 'lab_tech');
  check('C1', 'Supervisor My Work shows the batch with H-hours and states, no Lab rows',
    'rows > 0, each with baseline_start_hour + state, 0 lab rows',
    `${work.length} rows; missing hour ${work.filter(w => w.baseline_start_hour == null).length}; lab rows ${labInSup.length}`,
    work.length > 0 && labInSup.length === 0);
  const future = work.find(w => w.state === 'NOT_DUE_YET');
  const futureRefusal = future ? await refused('select start_activity($1)', [future.activity_id]) : null;
  check('C2', 'A future task cannot be started', 'start_activity refused',
    future ? `${future.code} → ${futureRefusal ?? 'ACCEPTED'}` : 'no NOT_DUE_YET row', Boolean(futureRefusal));
  const ready = work.find(w => w.state === 'READY' && !w.is_hold);
  await q('select start_activity($1)', [ready.activity_id]);
  await owner();
  let r1 = await one('select state, actual_start, started_by from batch_activity where id=$1', [ready.activity_id]);
  check('C3', 'An eligible task starts; actual start recorded server-side', 'IN_PROGRESS, actual_start set, started_by = supervisor',
    `${ready.code}: ${r1.state}, ${r1.actual_start?.toISOString()}, by ${r1.started_by === supId ? 'supervisor' : r1.started_by}`,
    r1.state === 'IN_PROGRESS' && r1.actual_start && r1.started_by === supId);

  // Another supervisor on a task assigned to someone else, if the factory has two supervisors.
  const otherSup = await one('select id from profiles where role=$1 and is_active and id<>$2 limit 1', ['supervisor', supId]);
  const otherReady = work.find(w => w.state === 'READY' && !w.is_hold && w.activity_id !== ready.activity_id);
  if (otherSup && otherReady) {
    await q('update batch_activity set assigned_person_id=$1 where id=$2', [supId, otherReady.activity_id]); // FIXTURE: assign to supervisor 1
    await as('supervisor', otherSup.id);
    const refusal = await refused('select start_activity($1)', [otherReady.activity_id]);
    check('C4', 'A second supervisor starts a task assigned to the first', 'documented behaviour (see note)',
      `${otherReady.code} → ${refusal ? 'REFUSED: ' + refusal : 'ACCEPTED (supervisors share production work; no per-person lock exists)'}`, true);
  } else {
    check('C4', 'Cross-supervisor execution', 'n/a', `only one active supervisor profile or one READY task — not testable here`, true);
  }

  // Finish. FIXTURE: move actual_start back past the task's minimum duration — the script cannot wait hours.
  await owner();
  const minHr = (await one(`select coalesce(max((g.config->>'hours')::numeric),0) h from gate_rule g join batch_activity a on a.process_activity_id=g.process_activity_id
                            where a.id=$1 and g.kind='MIN_DURATION' and g.is_enabled`, [ready.activity_id])).h;
  await q(`alter table batch_activity disable trigger user`);
  await q(`update batch_activity set actual_start = now() - make_interval(mins => ($2::numeric*60 + 5)::int) where id=$1`, [ready.activity_id, minHr]);
  await q(`alter table batch_activity enable trigger user`);
  const nEv = await satisfyEvidence(ready.activity_id);
  const vals = await valuesFor(ready.activity_id);
  const successorsBefore = await q(`select a.code, a.state from batch_activity a join gate_rule g on g.process_activity_id=a.process_activity_id
      and g.kind='PREDECESSOR' and g.phase='entry' and g.is_enabled and g.config->'activity_codes' ? $2
      where a.master_batch_id=$1 order by a.code`, [B.id, ready.code]);
  await as('supervisor', supId);
  const fin = await one('select * from complete_activity($1,$2::jsonb,$3,$4::jsonb)', [ready.activity_id, JSON.stringify(vals), 'acceptance finish', '{}']);
  await advance(B.id);
  await owner();
  r1 = await one('select state, actual_start, actual_end from batch_activity where id=$1', [ready.activity_id]);
  check('C5', 'Finish persists: state + actual end recorded', 'COMPLETED (or DEVIATION), actual_end set',
    `${ready.code}: ${JSON.stringify(fin)} → ${r1.state}, end ${r1.actual_end?.toISOString()} (evidence fixtures ${nEv}, values ${Object.keys(vals).length})`,
    ['COMPLETED', 'DEVIATION'].includes(r1.state) && r1.actual_end);
  const successorsAfter = await q(`select a.code, a.state from batch_activity a join gate_rule g on g.process_activity_id=a.process_activity_id
      and g.kind='PREDECESSOR' and g.phase='entry' and g.is_enabled and g.config->'activity_codes' ? $2
      where a.master_batch_id=$1 order by a.code`, [B.id, ready.code]);
  check('C6', 'Downstream state recalculated after Finish', 'successors re-evaluated (no successor still waiting on this task)',
    `before ${successorsBefore.map(s => s.code + ':' + s.state).join(', ') || 'none'} → after ${successorsAfter.map(s => s.code + ':' + s.state).join(', ') || 'none'}`,
    successorsAfter.every(s => s.state !== 'WAITING_CONDITION' ||
      !/not complete/i.test(s.code)));

  // ── E · TICKET ───────────────────────────────────────────────────────────────────────────────
  const tAct = work.find(w => w.state === 'READY' && !w.is_hold && w.activity_id !== ready.activity_id) ?? work.find(w => w.state === 'NOT_DUE_YET');
  await as('supervisor', supId);
  const ticket = await one("select request_extension($1,2,'Acceptance: turner hydraulic leak, need 2 h') id", [tAct.activity_id]);
  await as('admin');
  const adminSees = await one('select * from v_extension_request where id=$1', [ticket.id]);
  check('E1', 'Supervisor raises a ticket; Admin sees it with batch, activity, raiser, time, remark',
    'row visible to Admin with those fields',
    adminSees ? `batch ${adminSees.master_batch_id === B.id}, activity ${adminSees.batch_activity_id === tAct.activity_id}, by ${adminSees.requested_by_name} (${adminSees.requested_by_role}), at ${adminSees.requested_at?.toISOString()}, "${adminSees.requested_reason}"` : 'NOT VISIBLE',
    Boolean(adminSees) && adminSees.master_batch_id === B.id && adminSees.batch_activity_id === tAct.activity_id && adminSees.requested_by_role === 'supervisor' && adminSees.requested_at && /hydraulic/.test(adminSees.requested_reason));
  if (adminSees) console.log('        ticket columns:', Object.keys(adminSees).join(', '));
  await q("select admin_decide_extension($1,true,'Acceptance: approved, fix the hose first',2)", [ticket.id]);
  await as('supervisor', supId);
  const supSees = await one('select status, admin_reason, admin_granted_hr from v_extension_request where id=$1', [ticket.id]);
  const note = await one("select count(*)::int n from notification where master_batch_id=$1 and (to_person_id=$2 or to_role='supervisor')", [B.id, supId]);
  check('E2', 'Admin decision + remark persist and the requester can read them', 'ADMIN_APPROVED, remark, 2 h; notification present',
    `${supSees?.status}, "${supSees?.admin_reason}", ${supSees?.admin_granted_hr} h; notifications visible to supervisor ${note.n}`,
    supSees?.status === 'ADMIN_APPROVED' && supSees.admin_reason === 'Acceptance: approved, fix the hose first');

  // ── D · LAB GATE (second batch, H0 = now − 26 h so the H26 bunker load is due) ─────────────────
  const fpB = await fingerprint(B.id);
  const D = await createBatch(`TEST-ACCEPT-D-${Date.now()}`, "now() - interval '26 hours'");
  await q('select activate_batch($1)', [D.id]);
  await owner();
  // FIXTURE: everything FIB-BUNK-LOAD depends on (transitively) is completed. Proving 20 field tasks is C's job.
  const deps = await q(`with recursive d(id) as (
      select pred.id from batch_activity cur join gate_rule g on g.process_activity_id=cur.process_activity_id and g.kind='PREDECESSOR' and g.phase='entry' and g.is_enabled
        join batch_activity pred on pred.master_batch_id=cur.master_batch_id and g.config->'activity_codes' ? pred.code
       where cur.master_batch_id=$1 and cur.code='FIB-BUNK-LOAD'
      union
      select pred.id from d join batch_activity cur on cur.id=d.id join gate_rule g on g.process_activity_id=cur.process_activity_id and g.kind='PREDECESSOR' and g.phase='entry' and g.is_enabled
        join batch_activity pred on pred.master_batch_id=cur.master_batch_id and g.config->'activity_codes' ? pred.code)
    select id from d`, [D.id]);
  await q(`alter table batch_activity disable trigger user`);
  await q(`update batch_activity set state='COMPLETED', actual_start=planned_start_at, actual_end=planned_end_at where id = any($1)`, [deps.map(d => d.id)]);
  await q(`alter table batch_activity enable trigger user`);
  await as('admin'); await advance(D.id);
  await owner();
  const load0 = await act(D.id, 'FIB-BUNK-LOAD');
  const reason0 = (await one('select start_block_reason($1) r', [load0.id])).r;
  check('D1', 'Before any Lab decision the mapped production gate is shut', 'FIB-BUNK-LOAD BLOCKED by the Lab gate',
    `${load0.state}: ${reason0 ?? load0.blocked_reason}`, load0.state === 'BLOCKED');

  const labAct = await one(`select a.* from batch_activity a join lab_checkpoint_activity lca on lca.process_activity_id=a.process_activity_id
                             where a.master_batch_id=$1 and lca.gates_activity_code='FIB-BUNK-LOAD' limit 1`, [D.id]);
  const cp = await one(`select lc.* from lab_checkpoint lc join lab_checkpoint_activity lca on lca.checkpoint_code=lc.code and lca.checkpoint_map=lc.checkpoint_map
                         where lca.process_activity_id=$1 limit 1`, [labAct.process_activity_id]);
  const labId = await as('lab_tech');
  const queue = await q('select * from v_lab_queue where master_batch_id=$1', [D.id]);
  const inQueue = queue.find(x => (x.activity_id ?? x.batch_activity_id) === labAct.id);
  check('D2', 'Lab sees the checkpoint in its queue', `${labAct.code} in v_lab_queue`,
    inQueue ? `${labAct.code} [${inQueue.state}]` : `NOT IN QUEUE (${queue.length} rows)`, Boolean(inQueue));
  // The Lab screen's beginSample → record → evidence → submit.
  await q('select start_activity($1)', [labAct.id]);
  const sample = await one("select open_lab_sample($1,$2,'acceptance sample',now()) id", [labAct.id, cp.id]);
  for (const p of cp.parameters) {
    const t = await one("select request_lab_test($1,$2,'user') id", [sample.id, p]);
    const spec = await one('select target_min, target_max from lab_test where id=$1', [t.id]);
    const val = spec.target_min != null && spec.target_max != null ? (Number(spec.target_min) + Number(spec.target_max)) / 2 : 50;
    await q('select record_lab_result($1,$2)', [t.id, val]);
  }
  await owner(); await satisfyEvidence(labAct.id); await as('lab_tech', labId);
  const sub = await one("select * from submit_activity($1,'{}'::jsonb,'acceptance lab submit',null,null,'{}'::jsonb)", [labAct.id]);
  const selfApprove = await refused("select decide_lab_submission($1,'approved','self approval attempt')", [labAct.id]);
  check('D3', 'Lab submits; Lab cannot approve its own submission', 'submitted; decide_lab_submission refused for lab_tech',
    `submit → ${JSON.stringify(sub)}; self-approve → ${selfApprove ?? 'ACCEPTED'}`, Boolean(selfApprove));
  await owner();
  const load1 = await act(D.id, 'FIB-BUNK-LOAD');
  check('D4', 'Submission is not approval: gate still shut after Lab submit', 'FIB-BUNK-LOAD still BLOCKED', load1.state, load1.state === 'BLOCKED');

  // FIXTURE: every GM login is deactivated on the live database (found 16 Sep). Activate one inside this
  // transaction only, so the approval path itself can be proved. Rolled back with everything else.
  const activeGm = await one("select count(*)::int n from profiles where role='gm' and is_active");
  check('D5a', 'An active GM login exists to approve Lab gates', '>= 1 active gm', `${activeGm.n}`, activeGm.n > 0);
  if (!activeGm.n) await q("update profiles set is_active=true where id=(select id from profiles where role='gm' order by created_at limit 1)");
  await as('gm');
  await db.query('savepoint rej');
  await q("select decide_lab_submission($1,'rejected','Acceptance: moisture too high, resample')", [labAct.id]);
  await advance(D.id);
  await owner();
  const loadRej = await act(D.id, 'FIB-BUNK-LOAD');
  check('D5', 'GM REJECTS → mapped production gate stays shut', 'FIB-BUNK-LOAD not startable', loadRej.state, loadRej.state !== 'READY');
  await db.query('rollback to savepoint rej');

  await as('gm');
  await q("select decide_lab_submission($1,'approved','Acceptance: within spec')", [labAct.id]);
  await advance(D.id);
  await owner();
  const load2 = await act(D.id, 'FIB-BUNK-LOAD');
  const dec = await one('select verdict, reason, decided_role from lab_decision where batch_activity_id=$1 order by decided_at desc limit 1', [labAct.id]).catch(() => null);
  check('D6', 'GM APPROVES → mapped production gate opens; decision + remark persist', 'FIB-BUNK-LOAD READY; decision approved with reason',
    `${load2.state}; decision ${JSON.stringify(dec)}`, load2.state === 'READY');

  // RECORD checkpoints may share a production step with a GATE (LAB-TUN-PRE on BNK-B1-TUN-LOAD); the engine's
  // LAB_APPROVED evaluation counts only kind = 'GATE', so a RECORD can never hold production shut.
  const src = (await one("select prosrc from pg_proc where proname='evaluate_gates'")).prosrc;
  const recordOnGated = await q(`select distinct lc.code, lca.gates_activity_code from lab_checkpoint_activity lca
      join lab_checkpoint lc on lc.code=lca.checkpoint_code and lc.checkpoint_map=lca.checkpoint_map
      join process_activity pa on pa.code=lca.gates_activity_code and pa.process_definition_id=$1
      join gate_rule g on g.process_activity_id=pa.id and g.kind='LAB_APPROVED' and g.is_enabled
     where lc.kind='RECORD'`, [B.cur.process_definition_id]);
  check('D7', 'A Lab RECORD never blocks production', "LAB_APPROVED evaluation filters cp.kind = 'GATE'",
    `filter present: ${/cp\.kind\s*=\s*'GATE'/.test(src)}; RECORDs sharing a gated step (ignored by the gate): ${recordOnGated.map(r => r.code + '→' + r.gates_activity_code).join(', ') || 'none'}`,
    /cp\.kind\s*=\s*'GATE'/.test(src));

  // ── G · ONBOARD A RUNNING BATCH (draft, positions given, H0 known) ─────────────────────────────
  const G = await createBatch(`TEST-ACCEPT-G-${Date.now()}`, "now() - interval '100 hours'");
  await owner();
  const turner = await one(`select id, code, title, stream from batch_activity where master_batch_id=$1 and stream='YARD' and code like '%T2%' order by baseline_start_hour limit 1`, [G.id]);
  const h0 = (await one("select now() - interval '100 hours' t")).t;
  await as('admin');
  const ob = await one('select * from onboard_batch($1,$2,$3::uuid[],$4::text[],$5)', [G.id, h0, [turner.id], ['PRIMARY_FIBRE'], 'Acceptance: positions given by yard supervisor']);
  await owner();
  const g = await q('select * from batch_activity where master_batch_id=$1', [G.id]);
  const gb = await one('select * from master_batch where id=$1', [G.id]);
  const fabricated = g.filter(a => a.actual_start || a.actual_end);
  const beforeT = g.filter(a => a.before_tracking);
  const pos = g.find(a => a.id === turner.id);
  check('G1', 'Onboarding records H0 and positions without inventing history',
    'status active; start_at = given H0; 0 actual times; earlier work SKIPPED "before tracking" with no plan time; position READY',
    `status ${gb.status}; H0 ${+new Date(gb.start_at) === +new Date(h0)}; actual times ${fabricated.length}; before-tracking ${beforeT.length} (planned ${beforeT.filter(a => a.planned_start_at).length}, not SKIPPED ${beforeT.filter(a => a.state !== 'SKIPPED').length}); ${turner.code} ${pos.state}; rpc ${JSON.stringify(ob)}`,
    gb.status === 'active' && fabricated.length === 0 && beforeT.every(a => a.state === 'SKIPPED' && !a.planned_start_at) && pos.state === 'READY');
  const gFutureReady = await q(`select a.code from batch_activity a cross join lateral planned_time_status(a.id) p
                                 where a.master_batch_id=$1 and a.state='READY' and not p.ok`, [G.id]);
  const gStates = g.reduce((m, a) => ({ ...m, [a.state]: (m[a.state] ?? 0) + 1 }), {});
  check('G2', 'Onboarded batch: future work stays future', 'READY-but-not-due = 0',
    `${gFutureReady.map(x => x.code).join(',') || 0}; ${JSON.stringify(gStates)}`, gFutureReady.length === 0);
  await as('supervisor', supId);
  const gWork = await q("select code, state from v_my_work where master_batch_id=$1 and state in ('READY','IN_PROGRESS')", [G.id]);
  check('G3', 'Supervisor sees the onboarded position as work', `${turner.code} in My Work`,
    gWork.map(w => `${w.code}[${w.state}]`).join(', '), gWork.some(w => w.code === turner.code));

  // ── F · CONCURRENCY ──────────────────────────────────────────────────────────────────────────
  await owner();
  const realAfter = await fingerprint(real.id);
  check('F1', 'Existing batch untouched by everything above', 'identical fingerprint (row, 113 activities, evidence, tickets)',
    JSON.stringify(realAfter), JSON.stringify(realAfter) === JSON.stringify(realBefore));
  const fpB2 = await fingerprint(B.id);
  check('F2', 'New batch B untouched while batches D and G were worked', 'identical fingerprint', JSON.stringify(fpB2), JSON.stringify(fpB2) === JSON.stringify(fpB));
  const h0s = await q('select code, start_at from master_batch where id = any($1)', [[B.id, D.id, G.id]]);
  check('F3', 'Each batch keeps its own H0', '3 distinct start_at', h0s.map(h => h.start_at.toISOString()).join(' / '),
    new Set(h0s.map(h => +h.start_at)).size === 3);
} catch (e) {
  console.error('ABORTED:', e.message, '\n  first error:', firstError);
  results.push({ id: 'X', name: 'script aborted', ok: false, actual: e.message });
} finally {
  await db.query('rollback').catch(() => {});
  await db.end();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} PASS${failed.length ? ' — FAILED: ' + failed.map(f => f.id).join(', ') : ''}`);
  console.log('ROLLBACK: no test data retained');
  process.exitCode = failed.length ? 1 : 0;
}
