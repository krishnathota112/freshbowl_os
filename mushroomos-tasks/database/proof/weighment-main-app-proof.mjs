// 0158 proof — supervisors weigh; Admin links weighments to main-app batches. ONE transaction, always rolled back.
//   node proof/weighment-main-app-proof.mjs          loads 0158 from the FILE inside the transaction
//   node proof/weighment-main-app-proof.mjs --live   uses what is applied
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const dependency = (name) => { try { return require(name); } catch { return createRequire(new URL('../../../mushroomos/package.json', import.meta.url))(name); } };
const pg = dependency('pg'), dotenv = dependency('dotenv');
const localEnv = new URL('../.env.local', import.meta.url);
dotenv.config({ path: existsSync(localEnv) ? localEnv : new URL('../../../mushroomos/.env.local', import.meta.url) });
const LIVE = process.argv.includes('--live');
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
const q = async (s, a = []) => (await db.query(s, a)).rows;
const one = async (s, a) => (await q(s, a))[0];
const results = [];
const check = (id, name, ok, actual) => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}\n        ${actual}`); };
async function asUser(id, role) {
  await db.query('reset role');
  await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: 'authenticated', app_metadata: { app_role: role } })]);
  await db.query('set local role authenticated');
}
async function as(role) { await db.query('reset role'); const p = await one('select id from profiles where role=$1 and is_active limit 1', [role]); await asUser(p.id, role); return p.id; }
async function refused(sql, args) {
  await db.query('savepoint r');
  try { await db.query(sql, args); await db.query('release savepoint r'); return null; }
  catch (e) { await db.query('rollback to savepoint r'); return e.message; }
}
let n = 0;
async function upload(owner, back) {
  await db.query('reset role');
  const path = `${owner}/slip-${Date.now()}-${n++}.jpg`;
  await q(`insert into storage.objects (bucket_id, name, metadata) values ('weighments', $1, '{"size": 2048, "mimetype": "image/jpeg"}')`, [path]);
  if (back) await asUser(...back);
  return path;
}

try {
  await db.connect();
  await db.query('begin');
  const mainBefore = await one(`select count(*)::int n, md5(coalesce(string_agg(id::text||status::text||code,',' order by id),'')) h from master_batch`);
  if (!LIVE) await db.query(readFileSync(new URL('../0158_weighment_main_app.sql', import.meta.url), 'utf8'));
  const NO = `8${Date.now() % 100000}`;
  const admin = await as('admin');
  await db.query('reset role');
  const sup = (await one(`select id from profiles where role='supervisor' and is_active limit 1`)).id;
  const lab = (await one(`select id from profiles where role='lab_tech' and is_active limit 1`)).id;
  const master = await one(`select id, code from master_batch where status::text <> 'cancelled' order by created_at desc limit 1`);
  // a main batch that has no open weighment yet (the proof creates for it inside the transaction)
  await q(`update wb_batch set status='closed' where status='active' and master_batch_id=$1`, [master.id]);
  await q(`update wb_batch set status='closed' where status='active' and lower(regexp_replace(batch_no,'\\s+','','g'))=lower(regexp_replace($1,'\\s+','','g'))`, [master.code]);
  await asUser(admin, 'admin');

  // M1 · Admin sets the weighment for an EXISTING main-app batch: numbers = its code, linked
  const rows = JSON.stringify([{ material: 'bagasse', required_kg: 20000, tolerance_kg: 0 }, { material: 'gypsum', required_kg: 500, tolerance_kg: 0 }]);
  const wb = (await one(`select wb_batch_create_for_master($1,'from main app',$2::jsonb) id`, [master.id, rows])).id;
  const b1 = await one('select batch_no, master_batch_id, master_batch_code, master_linked_by_admin from wb_v_batch where id=$1', [wb]);
  const rDup = await refused(`select wb_batch_create_for_master($1,null,$2::jsonb)`, [master.id, rows]);
  check('M1', 'existing main batch → weighment numbers = its code, linked; a second open one for it refused',
    b1.batch_no === master.code && b1.master_batch_id === master.id && b1.master_linked_by_admin && rDup, `"${b1.batch_no}" linked; "${rDup}"`);

  // M2 · NEW batch: typed numbers link by themselves once a main batch has that code
  const typed = (await one(`select wb_batch_create_v2($1,null,$2::jsonb) id`, [`${NO}, ${Number(NO) + 1}`, rows])).id;
  const before = await one('select master_batch_id from wb_v_batch where id=$1', [typed]);
  await db.query('reset role');
  const pd = (await one('select process_definition_id p from master_batch where id=$1', [master.id])).p;
  const newMain = (await one(`insert into master_batch (code, label, process_definition_id, status, start_date, created_at) values ($1, 'proof', $2, 'draft', current_date, now()) returning id`, [`${NO},${Number(NO) + 1}`, pd])).id;
  await asUser(admin, 'admin');
  const after = await one('select master_batch_id, master_batch_code, master_linked_by_admin from wb_v_batch where id=$1', [typed]);
  check('M2', 'typed "N, N+1" before the batch exists → not linked; main batch "N,N+1" created later → linked automatically',
    before.master_batch_id === null && after.master_batch_id === newMain && after.master_linked_by_admin === false, JSON.stringify(after));

  // M3 · a supervisor sees what to weigh and records a slip — same rules (balance, duplicate ticket, photo)
  const bag = (await one(`select id from wb_requirement where wb_batch_id=$1 and material_code='bagasse'`, [wb])).id;
  await asUser(sup, 'supervisor');
  const sees = await one('select count(*)::int n from wb_v_requirement where batch_id=$1', [wb]);
  const p1 = await upload(bag, [sup, 'supervisor']);
  const r3 = (await one(`select wb_add_slip($1,$2,'TN 01','Sri Sugars',null,null,4000,$3) j`, [bag, `S-${NO}-1`, p1])).j;
  const p2 = await upload(bag, [sup, 'supervisor']);
  const rDupT = await refused(`select wb_add_slip($1,$2,null,null,null,null,100,$3)`, [bag, `s-${NO}-1 `, p2]);
  const led = await one('select slip_no, balance_after_kg::float bal, recorded_by from wb_v_slip where requirement_id=$1', [bag]);
  check('M3', 'supervisor sees the 2 materials, records 4,000 kg → balance 16,000; same ticket again refused',
    sees.n === 2 && Number(r3.remaining_kg) === 16000 && led.bal === 16000 && led.recorded_by === sup && rDupT, `balance ${led.bal}; "${rDupT}"`);

  // M4 · the storage rule: a supervisor may upload under a requirement, not under batch numbers
  await db.query('reset role');
  await asUser(sup, 'supervisor');
  const upReq = await refused(`insert into storage.objects (bucket_id, name, owner, metadata) values ('weighments', $1, $2, '{"size":1}')`, [`${bag}/slip-x-${NO}.jpg`, sup]);
  const upBatch = await refused(`insert into storage.objects (bucket_id, name, owner, metadata) values ('weighments', $1, $2, '{"size":1}')`, [`${wb}/calc-x-${NO}.jpg`, sup]);
  check('M4', 'storage: supervisor photo under a requirement allowed; file under batch numbers (Admin calc slip) refused', !upReq && upBatch, `"${upBatch}"`);

  // M5 · finish short → alert to Admin; supervisor cannot see alerts or do Admin things
  const gyp = (await one(`select id from wb_requirement where wb_batch_id=$1 and material_code='gypsum'`, [wb])).id;
  const fin = (await one(`select wb_finish($1,null) j`, [gyp])).j;
  const supAlerts = await one('select count(*)::int n from wb_v_alert');
  const sv = (await one(`select id from wb_slip where ticket_no=$1`, [`S-${NO}-1`])).id;
  const rVoid = await refused(`select wb_void_slip($1,'x')`, [sv]);
  const rReopen = await refused(`select wb_reopen($1,'x')`, [gyp]);
  const rSet = await refused(`select wb_requirement_update($1,1,0,null)`, [bag]);
  const rCreate = await refused(`select wb_batch_create_for_master($1,null,$2::jsonb)`, [newMain, rows]);
  const rClose = await refused(`select wb_batch_close($1,null)`, [wb]);
  await asUser(admin, 'admin');
  const adminAlert = await one(`select kind, amount_kg::float amt from wb_v_alert where requirement_id=$1`, [gyp]);
  check('M5', 'supervisor finishes Gypsum at 0 of 500 → Admin gets the short alert; supervisor sees 0 alerts and cannot void, reopen, change, create or close',
    fin.short && adminAlert.kind === 'short' && adminAlert.amt === 500 && supAlerts.n === 0 && rVoid && rReopen && rSet && rCreate && rClose,
    `"${rVoid}" · "${rReopen}" · "${rSet}" · "${rCreate}" · "${rClose}"`);

  // M6 · other roles still cannot weigh
  const lp = await upload(bag, [lab, 'lab_tech']);
  const rLab = await refused(`select wb_add_slip($1,$2,null,null,null,null,100,$3)`, [bag, `L-${NO}`, lp]);
  check('M6', 'Lab login cannot record a slip', rLab, `"${rLab}"`);

  // M7 · main-app batches untouched (apart from the proof's own inserted row)
  await db.query('reset role');
  const mainAfter = await one(`select md5(coalesce(string_agg(id::text||status::text||code,',' order by id),'')) h from master_batch where id <> $1`, [newMain]);
  check('M7', 'main-app batches unchanged', mainAfter.h === mainBefore.h, `${mainBefore.n} batches`);
} catch (e) {
  console.error('ERROR', e.message);
  results.push(false);
} finally {
  await db.query('rollback').catch(() => {});
  await db.end();
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} passed — rolled back, nothing kept`);
  process.exit(passed === results.length ? 0 : 1);
}
