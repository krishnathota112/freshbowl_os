// 0153 proof — Weighbridge with batch numbers typed by Admin + the owner's Excel sheet. ONE transaction, always
// rolled back. Replaces weighbridge-proof.mjs (0151) now that requirements hang off batch numbers, not Tasks batches.
//   node proof/weighbridge-batch-proof.mjs          loads 0153 from the FILE inside the transaction (needs 0151 live)
//   node proof/weighbridge-batch-proof.mjs --live   uses what is applied
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
async function upload(owner, kind, back) {                // an object in the bucket, as the app's upload leaves it
  await db.query('reset role');
  const path = `${owner}/${kind}-${Date.now()}-${n++}.jpg`;
  await q(`insert into storage.objects (bucket_id, name, metadata) values ('weighments', $1, '{"size": 2048, "mimetype": "image/jpeg"}')`, [path]);
  if (back) await asUser(...back);
  return path;
}
const state = async (req) => one('select state, received_kg::float got, remaining_kg::float rem, open_alerts from wb_v_requirement where id=$1', [req]);
const ledger = async (req) => q('select slip_no, net_kg::float net, balance_after_kg::float bal from wb_v_slip where requirement_id=$1 and voided_at is null order by slip_no', [req]);

try {
  await db.connect();
  await db.query('begin');
  const tkBefore = await one(`select count(*)::int n, md5(coalesce(string_agg(id::text||status,',' order by id),'')) h from tk_batch`);
  if (!LIVE) await db.query(readFileSync(new URL('../0153_weighbridge_batch_numbers.sql', import.meta.url), 'utf8'));
  const NO = `9${Date.now() % 100000}`;                     // batch numbers nobody uses

  // B1 · Admin types batch numbers + the requirement sheet in one go — no Tasks batch needed
  const admin = await as('admin');
  const wbId = (await one(`select admin_create_user('wb.proof.${Date.now()}@example.invalid','Proof-pass-123','Weighbridge proof','weighbridge') id`)).id;
  const rows = [{ material: 'bagasse', required_kg: 20000, tolerance_kg: 0, note: 'fresh weight' }, { material: 'gypsum', required_kg: 500, tolerance_kg: 0 }];
  const b = (await one(`select wb_batch_create($1,'formulation v3',$2::jsonb) id`, [`${NO}, ${Number(NO) + 1},  ${Number(NO) + 2}`, JSON.stringify(rows)])).id;
  const wb = await one('select batch_no, status, materials from wb_v_batch where id=$1', [b]);
  const bag = (await one(`select id from wb_requirement where wb_batch_id=$1 and material_code='bagasse'`, [b])).id;
  const gyp = (await one(`select id from wb_requirement where wb_batch_id=$1 and material_code='gypsum'`, [b])).id;
  const tkAfter = await one(`select count(*)::int n from tk_batch`);
  check('B1', 'Admin types batch numbers "N, N+1, N+2" and two rows (Bagasse 20,000 kg, Gypsum 500 kg) → 2 requirements, no Tasks batch made',
    wb.batch_no === `${NO}, ${Number(NO) + 1}, ${Number(NO) + 2}` && wb.status === 'active' && wb.materials === 2 && tkAfter.n === tkBefore.n,
    `"${wb.batch_no}", ${wb.materials} materials, Tasks batches ${tkBefore.n} → ${tkAfter.n}`);

  // B2 · the sheet's rules: same numbers can't be open twice; a bad row stops the whole sheet; the weighbridge can't set it
  const rDupNo = await refused(`select wb_batch_create($1,null,'[{"material":"bagasse","required_kg":1}]'::jsonb)`, [`${NO},${Number(NO) + 1},${Number(NO) + 2}`]);
  const rBadRow = await refused(`select wb_batch_create('X-${NO}',null,'[{"material":"bagasse","required_kg":1000},{"material":"gypsum","required_kg":0}]'::jsonb)`);
  const leftover = await one(`select count(*)::int n from wb_batch where batch_no='X-${NO}'`);
  const rDupMat = await refused(`select wb_requirement_add($1,'bagasse',100,0,null)`, [b]);
  const rNoNo = await refused(`select wb_batch_create('  ',null,'[{"material":"bagasse","required_kg":1}]'::jsonb)`);
  await asUser(wbId, 'weighbridge');
  const rWb = await refused(`select wb_batch_create('Y-${NO}',null,'[{"material":"bagasse","required_kg":1}]'::jsonb)`);
  await asUser(admin, 'admin');
  check('B2', 'refused: same numbers already open (spaces ignored), a 0 kg row (whole sheet kept out), a material twice, no numbers, weighbridge login',
    rDupNo && rBadRow && leftover.n === 0 && rDupMat && rNoNo && rWb, `"${rDupNo}" · "${rBadRow}" · "${rDupMat}" · "${rNoNo}" · "${rWb}"`);

  // B3 · the owner's Excel sheet: 20000 − 4000 − 4000 − 4000 − 4000 − 5000 → 16000, 12000, 8000, 4000, −1000 "reduce the weight"
  const res = [];
  for (const [i, kg] of [4000, 4000, 4000, 4000, 5000].entries()) {
    const p = await upload(bag, 'slip', [wbId, 'weighbridge']);
    res.push((await one(`select wb_add_slip($1,$2,null,null,null,null,$3,$4) j`, [bag, `XL-${NO}-${i + 1}`, kg, p])).j);
  }
  await asUser(admin, 'admin');
  const l3 = await ledger(bag);
  const a3 = await q(`select kind, amount_kg::float amt, message from wb_v_alert where requirement_id=$1`, [bag]);
  const s3 = await state(bag);
  check('B3', 'Excel: slips 1–5 → balance 16000 · 12000 · 8000 · 4000 · −1000; one OVER alert on slip 5 saying "Reduce the weight"',
    l3.map((x) => x.bal).join() === '16000,12000,8000,4000,-1000' && l3.map((x) => x.slip_no).join() === '1,2,3,4,5'
      && res.filter((x) => x.over).length === 1 && res[4].over && Number(res[4].remaining_kg) === -1000
      && a3.length === 1 && a3[0].amt === 1000 && /Reduce the weight/.test(a3[0].message) && s3.state === 'over',
    `ledger ${l3.map((x) => `${x.slip_no}:${x.net}→${x.bal}`).join(' ')} · alert "${a3[0]?.message}"`);

  // B4 · Admin voids slip 2 (double entry) → the sheet renumbers and re-balances; the void stays on record
  const s2 = (await one(`select id from wb_slip where ticket_no=$1`, [`XL-${NO}-2`])).id;
  await q(`select wb_void_slip($1,'entered twice')`, [s2]);
  const l4 = await ledger(bag);
  const v4 = await one('select slip_no, balance_after_kg, void_reason from wb_v_slip where id=$1', [s2]);
  check('B4', 'void slip 2 → valid slips 1–4 read 16000 · 12000 · 8000 · 3000; voided slip kept with its reason, no number/balance',
    l4.map((x) => x.bal).join() === '16000,12000,8000,3000' && l4.map((x) => x.slip_no).join() === '1,2,3,4' && v4.slip_no === null && v4.balance_after_kg === null && v4.void_reason === 'entered twice',
    `ledger ${l4.map((x) => `${x.slip_no}→${x.bal}`).join(' ')}`);

  // B5 · one calculation slip for the batch (filed under the batch numbers) shows on every material
  const calc = await upload(b, 'calc', [admin, 'admin']);
  await q('select wb_batch_set_calc_slip($1,$2)', [b, calc]);
  const cs = await q('select calc_slip_path from wb_v_requirement where batch_id=$1', [b]);
  const rWrongPlace = await refused('select wb_batch_set_calc_slip($1,$2)', [b, `${bag}/calc-x.jpg`]);
  check('B5', 'calculation slip attached to the batch numbers → both materials show it; a file filed elsewhere is refused',
    cs.length === 2 && cs.every((x) => x.calc_slip_path === calc) && rWrongPlace, `"${rWrongPlace}"`);

  // B6 · Admin fixes a typo in the numbers; a material can be added later
  await q(`select wb_batch_update($1,$2,'formulation v3 (corrected)')`, [b, `${NO}, ${Number(NO) + 1}`]);
  const pad = (await one(`select wb_requirement_add($1,'paddy_punjab',8000,200,null) id`, [b])).id;
  const b6 = await one('select batch_no, materials from wb_v_batch where id=$1', [b]);
  const alertName = await one('select batch_name from wb_v_alert where requirement_id=$1', [bag]);
  check('B6', 'Admin corrects the numbers → everything shows the new numbers; Paddy (Punjab) 8000 ±200 added later',
    b6.batch_no === `${NO}, ${Number(NO) + 1}` && b6.materials === 3 && alertName.batch_name === b6.batch_no, JSON.stringify(b6));

  // B7 · the weighbridge login sees the batch numbers and its materials, and no Tasks batches at all any more
  await asUser(wbId, 'weighbridge');
  const seeReq = await one('select count(*)::int n from wb_v_requirement where batch_id=$1', [b]);
  const seeBatch = await one('select count(*)::int n from wb_v_batch where id=$1', [b]);
  const seeTk = await one('select count(*)::int n from tk_batch');
  const seeAlerts = await one('select count(*)::int n from wb_v_alert');
  check('B7', 'weighbridge login: sees 3 materials under these numbers; reads 0 Tasks batches and 0 alerts',
    seeReq.n === 3 && seeBatch.n === 1 && seeTk.n === 0 && seeAlerts.n === 0, `requirements ${seeReq.n}, Tasks batches ${seeTk.n}, alerts ${seeAlerts.n}`);

  // B8 · Admin closes the numbers: unfinished materials are finished (short → alert), then no more slips
  await asUser(admin, 'admin');
  const pp = await upload(pad, 'slip', [wbId, 'weighbridge']);
  await q(`select wb_add_slip($1,$2,null,null,null,null,7900,$3)`, [pad, `P-${NO}`, pp]);             // within ±200
  await asUser(admin, 'admin');
  const closedNow = (await one(`select wb_batch_close($1,'all weighed') n`, [b])).n;
  const shortAlert = await one(`select amount_kg::float amt from wb_v_alert where requirement_id=$1 and kind='short'`, [gyp]);
  const padAlerts = await one(`select count(*)::int n from wb_v_alert where requirement_id=$1`, [pad]);
  const pLate = await upload(pad, 'slip', [wbId, 'weighbridge']);
  const rLate = await refused(`select wb_add_slip($1,$2,null,null,null,null,100,$3)`, [pad, `L-${NO}`, pLate]);
  await asUser(admin, 'admin');
  const b8 = await one('select status, unfinished from wb_v_batch where id=$1', [b]);
  check('B8', 'close → 3 materials finished; Gypsum (0 of 500 kg) short alert; Paddy 7900 of 8000 ±200 no alert; later slip refused',
    closedNow === 3 && shortAlert?.amt === 500 && padAlerts.n === 0 && rLate && b8.status === 'closed' && b8.unfinished === 0,
    `finished ${closedNow}; gypsum short ${shortAlert?.amt} kg; "${rLate}"`);

  // B9 · reopen needs a reason; the same numbers can then be weighed again
  const rNoWhy = await refused(`select wb_batch_reopen($1,' ')`, [b]);
  await q(`select wb_batch_reopen($1,'one more lorry')`, [b]);
  await q(`select wb_reopen($1,'one more lorry')`, [gyp]);
  const pg1 = await upload(gyp, 'slip', [wbId, 'weighbridge']);
  const r9 = (await one(`select wb_add_slip($1,$2,null,null,null,null,500,$3) j`, [gyp, `G-${NO}`, pg1])).j;
  await asUser(admin, 'admin');
  check('B9', 'reopen refused without a reason; reopened → Gypsum 500 of 500 kg, balance 0',
    rNoWhy && Number(r9.remaining_kg) === 0 && (await state(gyp)).state === 'complete', `"${rNoWhy}"`);

  // B10 · Tasks untouched
  await db.query('reset role');
  const tkEnd = await one(`select count(*)::int n, md5(coalesce(string_agg(id::text||status,',' order by id),'')) h from tk_batch`);
  check('B10', 'Tasks batches unchanged by any of this', tkEnd.h === tkBefore.h, `${tkBefore.n} → ${tkEnd.n}`);
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
