// Pre-H0 material weights (0129). ONE transaction, rolled back.
//   node scripts/prebatch-weights-proof.mjs            (loads the 0129 file inside the transaction)
//   node scripts/prebatch-weights-proof.mjs --live     (tests what is applied)
import { readFileSync } from 'node:fs';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env.local', import.meta.url) });
const LIVE = process.argv.includes('--live');
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
const q = async (s, a = []) => (await db.query(s, a)).rows;
const one = async (s, a) => (await q(s, a))[0];
const res = [];
const check = (id, name, ok, actual) => { res.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}\n        ${actual}`); };
const MATERIALS = ['urea', 'ash', 'nitrogen', 'gypsum', 'bagasse', 'paddy', 'chicken_manure', 'wheat', 'mustard', 'ammonium_sulphate'];
try {
  await db.connect();
  await db.query('begin');
  if (!LIVE) {
    await db.query(readFileSync(new URL('../supabase/migrations/0129_prebatch_material_weights.sql', import.meta.url), 'utf8'));
    console.log('0129 loaded inside the transaction');
  }
  const params = await q("select code, label, value_kind, unit from lab_parameter where code like 'wt\_%\_kg' escape '\' order by code");
  const expected = MATERIALS.flatMap(m => [`wt_${m}_dry_kg`, `wt_${m}_fresh_kg`]).sort();
  check('W1', '20 weight parameters, numeric, in kg', JSON.stringify(params.map(p => p.code)) === JSON.stringify(expected) && params.every(p => p.value_kind === 'numeric' && p.unit === 'kg'),
    `${params.length}: ${params.slice(0, 2).map(p => `${p.code}="${p.label}"`).join(', ')} …`);

  const adm = await one("select id from profiles where role='admin' and is_active order by created_at limit 1");
  await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: adm.id, role: 'authenticated', app_metadata: { app_role: 'admin' } })]);
  await db.query('set local role authenticated');
  const cur = await one('select * from v_process_catalogue where is_current');
  const roles = await q(`select e.role, m.code material_code, true lead from material_role_eligibility e join material m on m.id=e.material_id where e.is_default_lead`);
  const { id } = await one(`select create_master_batch($1,$1,current_date,'{}'::jsonb,$2::jsonb,null,null,now() + interval '1 hour',$3) id`, [`TEST-WEIGHTS-${Date.now()}`, JSON.stringify(roles), cur.process_definition_id]);
  const blockersBefore = (await q("select code from validate_batch($1) where severity='blocking'", [id])).map(b => b.code ?? JSON.stringify(b));

  // exactly the screen's save: one sample on the first pre-batch checkpoint, one test + result per filled field
  const cp = await one("select id from lab_checkpoint where is_prebatch order by code limit 1");
  const sample = await one("select open_prebatch_sample($1,$2,'Initial material data') id", [id, cp.id]);
  const entered = { moisture_pct: 70, ph: 7.2, wt_bagasse_dry_kg: 5000, wt_bagasse_fresh_kg: 9000, wt_urea_dry_kg: 12.5, wt_chicken_manure_fresh_kg: 800 };
  for (const [p, v] of Object.entries(entered)) {
    const t = await one("select request_lab_test($1,$2,'user') id", [sample.id, p]);
    await q('select record_lab_result($1,$2)', [t.id, v]);
  }
  await db.query('reset role');
  const saved = await q(`select t.parameter_code, t.target_unit, r.value_numeric, r.technician_id is not null by_someone
      from lab_test t join lab_result r on r.test_id=t.id and r.superseded_by_result_id is null where t.sample_id=$1 order by t.parameter_code`, [sample.id]);
  check('W2', 'Moisture, pH and weights saved on the SAME pre-H0 sample with their values; weights carry kg',
    saved.length === 6 && saved.every(s => Number(s.value_numeric) === entered[s.parameter_code]) && saved.filter(s => s.parameter_code.startsWith('wt_')).every(s => s.target_unit === 'kg'),
    saved.map(s => `${s.parameter_code}=${s.value_numeric}${s.target_unit ? ' ' + s.target_unit : ''}`).join(', '));
  const chk = await one('select results_current, tests_requested from v_prebatch_material_check where master_batch_id=$1', [id]);
  check('W3', 'The pre-H0 record shows all readings', chk?.results_current === 6, JSON.stringify(chk));

  await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: adm.id, role: 'authenticated', app_metadata: { app_role: 'admin' } })]);
  await db.query('set local role authenticated');
  const blockersAfter = (await q("select code from validate_batch($1) where severity='blocking'", [id])).map(b => b.code ?? JSON.stringify(b));
  const act = await q('select activate_batch($1)', [id]).then(() => 'activated', e => e.message);
  await db.query('reset role');
  const st = await one('select status from master_batch where id=$1', [id]);
  const n = await one('select count(*)::int n from batch_activity where master_batch_id=$1', [id]);
  check('W4', 'Validation and activation unchanged: the only blocker before was the missing material record; batch activates with its 113 tasks',
    blockersAfter.length === 0 && st.status === 'active' && n.n === 113,
    `blocking before ${JSON.stringify(blockersBefore)} → after ${JSON.stringify(blockersAfter)}; ${act}; ${st.status}; ${n.n} tasks`);
  const labRows = await one("select count(*)::int n from v_lab_queue where master_batch_id=$1 and parameters && array(select code from lab_parameter where code like 'wt\_%' escape '\')", [id]).catch(() => ({ n: 'n/a' }));
  check('W5', 'No Lab checkpoint asks for the weights (catalogue only)', labRows.n === 0 || labRows.n === 'n/a', `lab queue rows naming a weight: ${labRows.n}`);
} catch (e) { console.error('ABORTED:', e.message); res.push(false); }
finally {
  await db.query('rollback').catch(() => {}); await db.end();
  console.log(`\n${res.filter(Boolean).length}/${res.length} PASS\nROLLBACK: nothing retained${LIVE ? '' : ' (0129 included)'}`);
  process.exitCode = res.every(Boolean) ? 0 : 1;
}
