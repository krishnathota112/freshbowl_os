// SUPERSEDED by weighbridge-batch-proof.mjs after 0153 (requirements now hang off typed batch numbers, not Tasks
// batches; wb_requirement_create was replaced). Kept as the record of the 0151 checks (10/10 on 27 Sep).
// 0151 proof — Weighbridge. ONE transaction, always rolled back. Needs 0144 and 0150 applied (0150 adds the role).
//   node proof/weighbridge-proof.mjs          loads 0151 from the FILE inside the transaction
//   node proof/weighbridge-proof.mjs --live   uses what is applied
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
async function upload(req, kind) {                         // an object in the bucket, as the app's upload leaves it
  await db.query('reset role');
  const path = `${req}/${kind}-${Date.now()}-${n++}.jpg`;
  await q(`insert into storage.objects (bucket_id, name, metadata) values ('weighments', $1, '{"size": 2048, "mimetype": "image/jpeg"}')`, [path]);
  return path;
}
const T = (t) => t * 1000;                                  // tons → kg
const state = async (req) => one('select state, received_kg::float got, remaining_kg::float rem, open_alerts from wb_v_requirement where id=$1', [req]);

try {
  await db.connect();
  await db.query('begin');
  const before = await one(`select md5(string_agg(id::text||status||coalesce(ended_at::text,''),',' order by id)) h from tk_task`);
  if (!LIVE) await db.query(readFileSync(new URL('../0151_weighbridge.sql', import.meta.url), 'utf8'));

  // W1 · Admin makes a weighbridge login (the new role) and a batch to weigh for
  const admin = await as('admin');
  const wbId = (await one(`select admin_create_user('wb.proof.${Date.now()}@example.invalid','Proof-pass-123','Weighbridge proof','weighbridge') id`)).id;
  const sop = (await one(`select tk_sop_create('WB proof SOP', null, '[{"title":"Wetting"}]'::jsonb) id`)).id;
  await q('select tk_sop_publish($1)', [sop]);
  const batch = (await one(`select tk_batch_create('WB-PROOF ${Date.now()}', $1, now(), null) id`, [sop])).id;
  const role = await one('select role::text r from profiles where id=$1', [wbId]);
  check('W1', 'Admin creates a login with the Weighbridge role', role.r === 'weighbridge', `role ${role.r}`);

  // W2 · Admin sets "Bagasse 20 t" with a calculation slip; the weighbridge login cannot set requirements
  const bag = (await one(`select wb_requirement_create($1,'bagasse',$2,0,'dry weight') id`, [batch, T(20)])).id;
  const calc = await upload(bag, 'calc');
  await asUser(admin, 'admin'); await q('select wb_set_calc_slip($1,$2)', [bag, calc]);
  await asUser(wbId, 'weighbridge');
  const rWbCreate = await refused(`select wb_requirement_create($1,'gypsum',1000,0,null)`, [batch]);
  const s0 = await state(bag);
  check('W2', 'Admin sets Bagasse 20 t + calculation slip; weighbridge cannot set requirements',
    s0.rem === 20000 && s0.state === 'receiving' && rWbCreate, `remaining ${s0.rem} kg; "${rWbCreate}"`);

  // W3 · slip 1: 2 t (gross 14 t − tare 12 t) → 18 t remaining
  const p1 = await upload(bag, 'slip'); await asUser(wbId, 'weighbridge');
  const r1 = (await one(`select wb_add_slip($1,'T-1001','TN 01 AB 1234','Sri Sugars',$2,$3,null,$4) j`, [bag, T(14), T(12), p1])).j;
  check('W3', 'slip 1 (gross 14 t − tare 12 t = 2 t) → 18 t remaining', Number(r1.net_kg) === 2000 && Number(r1.remaining_kg) === 18000 && !r1.over,
    `net ${r1.net_kg} kg, remaining ${r1.remaining_kg} kg`);

  // W4 · the slip rules
  const p2 = await upload(bag, 'slip'); await asUser(wbId, 'weighbridge');
  const rDup = await refused(`select wb_add_slip($1,'t-1001 ',null,null,null,null,1000,$2)`, [bag, p2]);
  const rTare = await refused(`select wb_add_slip($1,'T-1002',null,null,1000,1000,null,$2)`, [bag, p2]);
  const rMismatch = await refused(`select wb_add_slip($1,'T-1002',null,null,15000,12000,2000,$2)`, [bag, p2]);
  const rNoPhoto = await refused(`select wb_add_slip($1,'T-1002',null,null,null,null,1000,$2)`, [bag, `${bag}/missing.jpg`]);
  const rNoWeight = await refused(`select wb_add_slip($1,'T-1002',null,null,null,null,null,$2)`, [bag, p2]);
  check('W4', 'refused: same ticket again (any case/space), tare ≥ gross, net ≠ gross − tare, photo not uploaded, no weight',
    rDup && rTare && rMismatch && rNoPhoto && rNoWeight, `"${rDup}" · "${rTare}" · "${rMismatch}" · "${rNoPhoto}" · "${rNoWeight}"`);

  // W5 · slips up to exactly 20 t → complete, no alert
  await q(`select wb_add_slip($1,'T-1002',null,null,null,null,$2,$3)`, [bag, T(10), p2]);
  const p3 = await upload(bag, 'slip'); await asUser(wbId, 'weighbridge');
  await q(`select wb_add_slip($1,'T-1003',null,null,null,null,$2,$3)`, [bag, T(8), p3]);
  await asUser(admin, 'admin');
  const s5 = await state(bag);
  check('W5', '2 + 10 + 8 t = 20 t → complete, remaining 0, no alert', s5.state === 'complete' && s5.rem === 0 && s5.open_alerts === 0, JSON.stringify(s5));

  // W6 · one more tonne → 21 t → "over" alert to Admin at once
  const p4 = await upload(bag, 'slip'); await asUser(wbId, 'weighbridge');
  const r6 = (await one(`select wb_add_slip($1,'T-1004',null,null,null,null,$2,$3) j`, [bag, T(1), p4])).j;
  await asUser(admin, 'admin');
  const s6 = await state(bag);
  const a6 = await one(`select kind, amount_kg::float amt, message from wb_v_alert where requirement_id=$1 and ack_at is null`, [bag]);
  check('W6', '21 t against 20 t → over alert (1 t) the moment the slip is saved',
    r6.over && s6.state === 'over' && a6 && a6.kind === 'over' && a6.amt === 1000, `${a6?.message}`);

  // W7 · only Admin voids; the voided slip stays; the total recalculates; the alert stays as history
  const s1004 = (await one(`select id from wb_slip where ticket_no='T-1004'`)).id;
  await asUser(wbId, 'weighbridge');
  const rWbVoid = await refused(`select wb_void_slip($1,'x')`, [s1004]);
  await asUser(admin, 'admin');
  await q(`select wb_void_slip($1,'double weighed')`, [s1004]);
  const s7 = await state(bag);
  const kept = await one('select voided_at, void_reason from wb_v_slip where id=$1', [s1004]);
  check('W7', 'weighbridge cannot void; Admin voids with a reason → back to 20 t complete; slip kept, marked void',
    rWbVoid && s7.state === 'complete' && s7.got === 20000 && kept.voided_at && kept.void_reason === 'double weighed', `"${rWbVoid}"`);

  // W8 · tolerance and "short": paddy 10 t ±0.5 finished at 9.6 → fine; gypsum 5 t finished at 4 t → short alert
  const pad = (await one(`select wb_requirement_create($1,'paddy_punjab',$2,$3,null) id`, [batch, T(10), 500])).id;
  const gyp = (await one(`select wb_requirement_create($1,'gypsum',$2,0,null) id`, [batch, T(5)])).id;
  const pp = await upload(pad, 'slip'), pg1 = await upload(gyp, 'slip');
  await asUser(wbId, 'weighbridge');
  await q(`select wb_add_slip($1,'P-1',null,null,null,null,9600,$2)`, [pad, pp]);
  await q(`select wb_add_slip($1,'G-1',null,null,null,null,4000,$2)`, [gyp, pg1]);
  await q(`select wb_finish($1,null)`, [pad]);
  const fin = (await one(`select wb_finish($1,'lorry did not come') j`, [gyp])).j;
  const pg2 = await upload(gyp, 'slip'); await asUser(wbId, 'weighbridge');
  const rAfter = await refused(`select wb_add_slip($1,'G-2',null,null,null,null,1000,$2)`, [gyp, pg2]);
  await asUser(admin, 'admin');
  const sp = await state(pad), sg = await state(gyp);
  const ag = await one(`select kind, amount_kg::float amt from wb_v_alert where requirement_id=$1`, [gyp]);
  check('W8', 'paddy 9.6 t of 10 t with ±0.5 t → complete, no alert; gypsum finished at 4 t of 5 t → short alert 1 t; no slips after Finished',
    sp.state === 'complete' && sp.open_alerts === 0 && fin.short && sg.state === 'short' && ag.kind === 'short' && ag.amt === 1000 && rAfter,
    `paddy ${sp.state}; gypsum ${sg.state}, alert ${ag.kind} ${ag.amt} kg; "${rAfter}"`);

  // W9 · Admin reopens gypsum (reason), acknowledges alerts; tons and kg; the weighbridge sees weighments only
  await q(`select wb_reopen($1,'second lorry coming')`, [gyp]);
  const pg3 = await upload(gyp, 'slip'); await asUser(admin, 'admin');
  await q(`select wb_add_slip($1,'G-2',null,null,null,null,1000,$2)`, [gyp, pg3]);                  // Admin may enter a slip too
  for (const a of await q('select id from wb_v_alert where ack_at is null and batch_id=$1', [batch])) await q(`select wb_ack_alert($1,'checked with supplier')`, [a.id]);
  const openLeft = await one('select count(*)::int n from wb_v_alert where ack_at is null and batch_id=$1', [batch]);
  const sg9 = await state(gyp);
  await asUser(wbId, 'weighbridge');
  const seeReq = await one('select count(*)::int n from wb_v_requirement where batch_id=$1', [batch]);
  const seeAlerts = await one('select count(*)::int n from wb_alert');
  const seeTasks = await one('select count(*)::int n from tk_task');
  const seeSops = await one('select count(*)::int n from tk_sop');
  const seeMain = await one('select count(*)::int n from batch_activity');
  const rWbAck = await refused(`select wb_reopen($1,'x')`, [gyp]);
  check('W9', 'reopen + Admin slip → gypsum complete at 5 t; alerts acknowledged; weighbridge sees its 3 requirements but no alerts, no Tasks-app tasks or SOPs, cannot reopen (main-app tables are readable by any login — pre-existing, noted)',
    sg9.state === 'complete' && openLeft.n === 0 && seeReq.n === 3 && seeAlerts.n === 0 && seeTasks.n === 0 && seeSops.n === 0 && rWbAck,
    `requirements ${seeReq.n}, alerts ${seeAlerts.n}, tasks ${seeTasks.n}, SOPs ${seeSops.n}, main ${seeMain.n}`);

  // W10 · a requirement's weight can be changed by Admin; going below the received total raises "over"
  await asUser(admin, 'admin');
  await q(`select wb_requirement_update($1,$2,0,'recalculated')`, [bag, T(19)]);
  const s10 = await state(bag);
  const a10 = await one(`select count(*)::int n from wb_v_alert where requirement_id=$1 and ack_at is null and kind='over'`, [bag]);
  await db.query('reset role');
  const after = await one(`select md5(string_agg(id::text||status||coalesce(ended_at::text,''),',' order by id)) h from tk_task where batch_id <> $1`, [batch]);
  const beforeOther = before.h;
  check('W10', 'Admin changes Bagasse to 19 t → 20 t received is 1 t over → alert; other Tasks batches untouched',
    s10.state === 'over' && a10.n === 1 && after.h === beforeOther, `${JSON.stringify(s10)}`);
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
