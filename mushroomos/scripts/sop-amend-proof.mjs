// Proof for 0130 (SOP drafts + batch amendments). Everything runs in ONE transaction that is rolled
// back, including the migration itself, unless --keep-migration is passed (then only the migration
// is committed; every fixture batch/draft is still rolled back).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env.local', import.meta.url) });
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000, statement_timeout: 60000 });
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const one = async (sql, args) => (await q(sql, args))[0];
let passed = 0;
async function refused(sql, args, re) {
  await db.query('savepoint sp');
  try { await db.query(sql, args); } catch (e) { await db.query('rollback to savepoint sp'); assert.match(e.message, re); return; }
  throw new Error('expected a refusal: ' + sql);
}
const pass = (name) => { passed += 1; console.log('PASS', name); };
async function role(name) {
  await db.query('reset role');
  const p = await one('select id from profiles where role=$1::app_role and is_active order by id limit 1', [name]);
  assert.ok(p, `active ${name}`);
  await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: p.id, role: 'authenticated', app_metadata: { app_role: name } })]);
  await db.query('set local role authenticated');
}
const fingerprint = () => q(`select b.id, md5(to_jsonb(b)::text) batch,
  (select md5(string_agg(to_jsonb(a)::text, '' order by a.id)) from batch_activity a where a.master_batch_id=b.id) acts
  from master_batch b where b.status in ('active','draft') order by b.id`);
const planCols = (id) => q(`select id, code, baseline_start_hour, baseline_end_hour, planned_start_at, planned_end_at
  from batch_activity where master_batch_id=$1 order by id`, [id]);
const proj = async (id) => Object.fromEntries((await q('select * from project_batch($1)', [id])).map((r) => [r.code, r]));

async function newBatch(defId, label) {
  const roles = await q(`select e.role, m.code material_code, true lead from material_role_eligibility e
    join material m on m.id=e.material_id where e.is_default_lead`);
  const { id } = await one(`select create_master_batch($1,$1,current_date,'{}'::jsonb,$2::jsonb,null,null,now(),$3) id`,
    [label, JSON.stringify(roles), defId]);
  await q('select generate_activity_plan($1)', [id]);
  const cp = await one('select id from lab_checkpoint where is_prebatch order by code limit 1');
  const sample = await one("select open_prebatch_sample($1,$2,'0130 rollback fixture') id", [id, cp.id]);
  const test = await one("select request_lab_test($1,'moisture_pct','user') id", [sample.id]);
  await q('select record_lab_result($1,56.2)', [test.id]);
  const blockers = await q("select * from validate_batch($1) where severity='blocking'", [id]);
  assert.deepEqual(blockers, [], 'no activation blockers');
  await q('select activate_batch($1)', [id]);
  return id;
}

const keep = process.argv.includes('--keep-migration');
try {
  await db.connect();
  await db.query('begin');
  // --live: 0130 is already applied to this database; prove against it as deployed.
  if (!process.argv.includes('--live')) await db.query(fs.readFileSync(new URL('../supabase/migrations/0130_sop_editing_and_batch_amendments.sql', import.meta.url), 'utf8'));
  if (keep) { await db.query('commit'); await db.query('begin'); console.log('0130 committed'); }
  const before = await fingerprint();
  await role('admin');
  const current = await one('select * from v_process_catalogue where is_current');
  console.log('current SOP', current.code, 'v' + current.version, current.standard_hr + 'h');

  // ── A · amend a running batch ──────────────────────────────────────────────
  const bid = await newBatch(current.process_definition_id, `TEST-0130-AMEND-${Date.now()}`);
  const planBefore = await planCols(bid);
  const pBefore = await proj(bid);
  const water = await one("select * from batch_activity where master_batch_id=$1 and code='MIX-HOP-WATER'", [bid]);
  const deps = await q(`select ba.code from batch_activity ba join gate_rule g on g.process_activity_id=ba.process_activity_id
     where ba.master_batch_id=$1 and g.phase='entry' and g.kind='PREDECESSOR' and g.config->'activity_codes' ? 'MIX-HOP-WATER'
       and coalesce(g.config->>'when','')<>'started'`, [bid]);
  console.log('water pass', water.baseline_start_hour, '→', water.baseline_end_hour, '· waited on by', deps.map((d) => d.code).join(', '));

  await role('supervisor');
  await refused("select amend_batch_add_activity($1,$2,'MIX-HOP-NEW','Extra hopper pass',7,false,'none','none','supervisor should be refused')", [bid, water.id], /requires role admin/);
  pass('a Supervisor cannot amend a batch');
  await role('admin');
  await refused("select amend_batch_add_activity($1,$2,'MIX-HOP-NEW','Extra hopper pass',7,false,'none','none','')", [bid, water.id], /Say why/);
  pass('an amendment without a reason is refused');

  const { id: newId } = await one(`select amend_batch_add_activity($1,$2,'MIX-HOP-NEW','Extra hopper pass',7,false,'none','none',
      'Moisture still low after the water pass — trial extra pass') id`, [bid, water.id]);
  const added = await one('select * from batch_activity where id=$1', [newId]);
  assert.equal(Number(added.baseline_start_hour), Number(water.baseline_end_hour));
  assert.equal(Number(added.baseline_end_hour), Number(water.baseline_end_hour) + 7);
  pass(`new task ${added.code} planned H${added.baseline_start_hour}–H${added.baseline_end_hour}, state ${added.state}`);

  const planAfter = await planCols(bid);
  const changed = planAfter.filter((r) => r.id !== newId).filter((r) => {
    const o = planBefore.find((x) => x.id === r.id);
    return JSON.stringify(o) !== JSON.stringify(r);
  });
  assert.deepEqual(changed, [], 'no frozen plan column moved');
  pass(`all ${planBefore.length} existing plan rows are byte-identical (baseline frozen)`);

  for (const d of deps) {
    const now = await one(`select g.config->'activity_codes' codes from batch_activity ba join gate_rule g on g.process_activity_id=ba.process_activity_id
      where ba.master_batch_id=$1 and ba.code=$2 and g.phase='entry' and g.kind='PREDECESSOR' and g.config->'activity_codes' ? $3`, [bid, d.code, added.code]);
    assert.ok(now, `${d.code} now waits for ${added.code}`);
  }
  pass(`dependents (${deps.map((d) => d.code).join(', ')}) now wait for the new task`);

  const pAfter = await proj(bid);
  const shift = (c) => (new Date(pAfter[c].projected_start_at) - new Date(pBefore[c].projected_start_at)) / 3600000;
  for (const d of deps) assert.ok(new Date(pAfter[d.code].ready_at) >= new Date(pAfter[added.code].projected_end_at), `${d.code} ready after new task`);
  const parallel = ['STR-SOAK-1', 'STR-SOAK-2', 'CM-WEIGH'].filter((c) => pBefore[c]);
  for (const c of parallel) assert.equal(shift(c), 0, `${c} unchanged`);
  const endBefore = Math.max(...Object.values(pBefore).map((r) => +new Date(r.projected_end_at)));
  const endAfter = Math.max(...Object.values(pAfter).map((r) => +new Date(r.projected_end_at)));
  console.log(`  forecast shift: ${deps.map((d) => `${d.code} +${shift(d.code)}h`).join(', ')} · parallel ${parallel.map((c) => `${c} +${shift(c)}h`).join(', ')} · finish +${((endAfter - endBefore) / 3600000).toFixed(1)}h`);
  pass('forecast moves only down the dependency chain; parallel paddy/CM work unchanged');

  const gate = await q(`select verdict from batch_activity ba cross join lateral evaluate_gates(ba.id,'entry') g
     where ba.master_batch_id=$1 and ba.code=$2 and g.kind='PREDECESSOR'`, [bid, deps[0].code]);
  assert.ok(gate.some((g) => g.verdict === 'fail'), 'dependent start is gated');
  pass(`${deps[0].code} cannot start until ${added.code} is done (entry gate fails)`);

  const am = await one('select * from v_batch_amendment where master_batch_id=$1', [bid]);
  assert.equal(am.lab_check, 'none'); assert.ok(am.reason.startsWith('Moisture'));
  pass('amendment is recorded with reason and re-wired steps (Lab checks: amend-lab-clean-proof.mjs)');

  const { id: second } = await one(`select amend_batch_add_activity($1,$2,'MIX-HOP-REST','Short rest',2,true,'none','none','Second amendment on the same point') id`, [bid, newId]);
  const s2 = await one('select * from batch_activity where id=$1', [second]);
  assert.ok(s2.is_hold && Number(s2.baseline_start_hour) === Number(added.baseline_end_hour));
  pass(`a second amendment chains after the first (${s2.code}, passive rest)`);

  // ── B · draft a new SOP version, insert, publish, create a batch ───────────
  const { id: draftId } = await one("select clone_process_definition($1,null,null) id", [current.process_definition_id]);
  const draft = await one('select * from process_definition where id=$1', [draftId]);
  assert.equal(draft.status, 'draft'); assert.equal(draft.code, current.code);
  const n0 = await one('select count(*)::int n from process_activity where process_definition_id=$1', [draftId]);
  assert.equal(n0.n, Number(current.activity_count));
  pass(`${draft.code} v${draft.version} drafted from v${current.version} with ${n0.n} activities`);

  const hours = async (def, codes) => Object.fromEntries((await q('select code, standard_start_hour s, standard_end_hour e from process_activity where process_definition_id=$1 and code = any($2)', [def, codes])).map((r) => [r.code, [Number(r.s), Number(r.e)]]));
  const watch = ['MIX-HOP-WATER', 'MIX-HOP-NEW', 'MIX-HOP-REST', 'YARD-ADD', 'TUN-DISCHARGE-3', 'STR-SOAK-2', 'STR-SOAK-3', 'CM-WEIGH'];
  const h0 = await hours(draftId, watch);
  const ins = await one("select * from draft_insert_activity($1,'MIX-HOP-WATER','MIX-HOP-NEW','Extra hopper pass',7,false)", [draftId]);
  const h1 = await hours(draftId, watch);
  console.log('  draft insert', ins.new_code, 'moved', ins.moved, 'activities; standard now', ins.standard_hr + 'h');
  for (const c of watch) console.log(`    ${c.padEnd(16)} H${h0[c]?.[0]}–H${h0[c]?.[1]}  →  H${h1[c]?.[0]}–H${h1[c]?.[1]}`);
  assert.deepEqual(h1['STR-SOAK-2'], h0['STR-SOAK-2']); assert.deepEqual(h1['CM-WEIGH'], h0['CM-WEIGH']);
  assert.ok(h1['MIX-HOP-NEW'][0] >= h0['MIX-HOP-WATER'][1] + 7);
  pass('draft insert re-times dependents only; parallel paddy and CM hours unchanged');

  const pubBefore = await one('select md5(string_agg(to_jsonb(p)::text, \'\' order by p.id)) h from process_activity p where process_definition_id=$1', [current.process_definition_id]);
  await q("select publish_process_definition($1,'0130 proof')", [draftId]);
  await q("select set_current_process($1,'0130 proof')", [draftId]);
  const pubAfter = await one('select md5(string_agg(to_jsonb(p)::text, \'\' order by p.id)) h from process_activity p where process_definition_id=$1', [current.process_definition_id]);
  assert.equal(pubAfter.h, pubBefore.h);
  pass(`draft published and made current; ${current.code} v${current.version} untouched`);

  const nb = await newBatch(draftId, `TEST-0130-NEWSOP-${Date.now()}`);
  const nplan = await q('select code from batch_activity where master_batch_id=$1', [nb]);
  assert.ok(nplan.some((r) => r.code === ins.new_code));
  pass(`a new batch on v${draft.version} gets ${nplan.length} tasks including ${ins.new_code}`);

  await db.query('reset role');
  const after = await fingerprint();
  const stable = before.every((b) => after.find((a) => a.id === b.id)?.acts === b.acts && after.find((a) => a.id === b.id)?.batch === b.batch);
  assert.ok(stable, 'every pre-existing batch unchanged');
  pass(`all ${before.length} pre-existing batches byte-identical`);
  console.log(`\n${passed} checks passed.`);
} catch (e) {
  console.error('FAIL', e.message);
  process.exitCode = 1;
} finally {
  await db.query('rollback').catch(() => {});
  await db.end();
  console.log(keep ? 'Fixtures rolled back (0130 kept).' : 'Rolled back — nothing persisted.');
}
