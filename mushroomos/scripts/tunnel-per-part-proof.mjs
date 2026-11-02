// 0133 proof — PROCESS-2026M (one tunnel per part). ONE transaction, always rolled back.
//   node scripts/tunnel-per-part-proof.mjs          loads the migration FILE inside the transaction
//   node scripts/tunnel-per-part-proof.mjs --live   uses the applied draft/published 2026M
import { readFileSync } from 'node:fs';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env.local', import.meta.url) });
const LIVE = process.argv.includes('--live');
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
const q = async (s, a = []) => (await db.query(s, a)).rows;
const one = async (s, a) => (await q(s, a))[0];
const results = [];
const check = (id, name, ok, actual) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}\n        ${actual}`); };
const ADMIN = '8c21e85b-f65c-47c4-8b9f-bdb239e1c52d';
async function asAdmin() {
  await db.query('reset role');
  await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: ADMIN, role: 'authenticated', app_metadata: { app_role: 'admin' } })]);
  await db.query('set local role authenticated');
}
const fingerprint = () => q(`select b.code, md5(string_agg(a.id::text || a.state || coalesce(a.actual_start::text,'') || coalesce(a.actual_end::text,'') || coalesce(a.planned_start_at::text,''), ',' order by a.id)) f
  from master_batch b join batch_activity a on a.master_batch_id = b.id where b.status = 'active' group by b.code order by b.code`);

try {
  await db.connect();
  await db.query('begin');
  const before = await fingerprint();
  if (!LIVE) await db.query(readFileSync(new URL('../supabase/migrations/0133_process_2026m_tunnel_per_part.sql', import.meta.url), 'utf8'));
  const m = await one("select id, status from process_definition where code='PROCESS-2026M' and version=1");
  await asAdmin();
  if (m.status === 'draft') await q("select publish_process_definition($1,'proof')", [m.id]);
  await db.query('reset role');
  const env = await one('select * from v_process_envelope where process_definition_id=$1', [m.id]);
  check('M1', '2026M publishes: 127 activities, activities agree with the stated H472', env.activity_count == 127 && !env.envelope_disagrees && Number(env.calculated_standard_hr) === 472,
    `activities ${env.activity_count}; calculated ${env.calculated_standard_hr}; stated ${env.stated_envelope_hr}; disagrees ${env.envelope_disagrees}`);

  // a fresh batch on 2026M
  await asAdmin();
  const roles = [{ role: 'PRIMARY_FIBRE', material_code: 'BAGASSE_NEW', lead: true }, { role: 'STRUCTURAL_STRAW', material_code: 'PADDY_LOCAL', lead: true },
    { role: 'NITROGEN_SOURCE', material_code: 'CHICKEN_MANURE', lead: true }, { role: 'MINERAL', material_code: 'GYPSUM', lead: true }];
  const H0 = new Date(Date.now() - 400 * 3600e3);
  const mk = async (tag) => {
    const { id } = await one("select create_master_batch($1,$1,current_date,'{}'::jsonb,$2::jsonb,null,null,$3,$4) id", [`PROOF-M-${tag}-${Date.now()}`, JSON.stringify(roles), H0, m.id]);
    await q('select generate_activity_plan($1)', [id]);
    const cp = await one('select id from lab_checkpoint where is_prebatch order by code limit 1');
    const sm = await one("select open_prebatch_sample($1,$2,'proof') id", [id, cp.id]);
    const t = await one("select request_lab_test($1,'wt_paddy_dry_kg','user') id", [sm.id]);
    await q('select record_lab_result($1,14400)', [t.id]);
    return id;
  };
  const b1 = await mk('PLAN');
  await db.query('reset role');
  const rows = await q(`select code, stream::text stream, scope_label, baseline_start_hour s, baseline_end_hour e from batch_activity where master_batch_id=$1`, [b1]);
  const by = Object.fromEntries(rows.map((r) => [r.code, r]));
  const chain = (x) => ['PREP', 'LEVEL', 'HEAT', 'PAST', 'COOL-1', 'COND-2', 'COOL-2'].map((s) => by[`TN-B${x}-${s}`]);
  check('M2', 'plan: 127 rows; each part has its own 7-step tunnel chain in unit TUNNEL|Bunker x with its unloading',
    rows.length === 127 && [1, 2, 3].every((x) => chain(x).every((r) => r && r.stream === 'TUNNEL' && r.scope_label === `Bunker ${x}`) && by[`TUN-DISCHARGE-${x}`].scope_label === `Bunker ${x}`) && !by['TN-LEVEL'],
    `${rows.length} rows; units ${[1, 2, 3].map((x) => `${x}:${chain(x).map((r) => r?.scope_label ?? '∅').join('/')}`).join(' ')}`);
  const hrs = (c) => `${Number(by[c].s)}–${Number(by[c].e)}`;
  check('M3', 'hours: fill 317/319/321 kept; unloading 466/468/470; ends 472',
    [1, 2, 3].every((x) => Number(by[`TUN-DISCHARGE-${x}`].s) === 464 + 2 * x && Number(by[`BNK-B${x}-TUN-LOAD`].s) === 315 + 2 * x),
    [1, 2, 3].map((x) => `B${x}: prep ${hrs(`TN-B${x}-PREP`)} load ${hrs(`BNK-B${x}-TUN-LOAD`)} level ${hrs(`TN-B${x}-LEVEL`)} cond2 ${hrs(`TN-B${x}-COND-2`)} unload ${hrs(`TUN-DISCHARGE-${x}`)}`).join(' | '));

  // the 155,156,157 situation that 2026L refused: part 2 unloaded while parts 1 and 3 are still cooling
  const b2 = await mk('155');
  const ids = async (codes) => (await q('select id from batch_activity where master_batch_id=$1 and code = any($2)', [b2, codes])).map((r) => r.id);
  const units = (await q(`select distinct stream::text || '|' || scope_label u from batch_activity where master_batch_id=$1 and code !~ '^LAB-'`, [b2])).map((r) => r.u)
    .filter((u) => !['TUNNEL|Bunker 1', 'TUNNEL|Bunker 3'].includes(u));
  let err = null;
  await db.query('savepoint ob');
  try { await q('select * from onboard_batch($1,$2,$3::uuid[],$4::text[],$5,$6::text[],true)', [b2, H0, await ids(['TN-B1-COOL-2', 'TN-B3-COOL-2']), [], 'proof', units]); }
  catch (e) { err = e.message; await db.query('rollback to savepoint ob'); }
  await db.query('reset role');
  const st = Object.fromEntries((await q('select code, state::text s, before_tracking bt from batch_activity where master_batch_id=$1', [b2])).map((r) => [r.code, r]));
  check('M4', '155 case accepted: unloading 2 finished while cooling 2 of parts 1 and 3 is current',
    !err && st['TN-B1-COOL-2'].s === 'READY' && st['TN-B3-COOL-2'].s === 'READY' && st['TUN-DISCHARGE-2'].bt && !st['TUN-DISCHARGE-1'].bt,
    err ?? `B1-COOL-2 ${st['TN-B1-COOL-2'].s}; B3-COOL-2 ${st['TN-B3-COOL-2'].s}; DISCHARGE-2 ${st['TUN-DISCHARGE-2'].s}/bt=${st['TUN-DISCHARGE-2'].bt}; DISCHARGE-1 ${st['TUN-DISCHARGE-1'].s}`);

  // independence: finishing part 1's cooling opens part 1's unloading only
  await asAdmin();
  const c1 = (await ids(['TN-B1-COOL-2']))[0];
  await q("select admin_record_reported_work($1, now() - interval '20 hours', now() - interval '1 hour', '{}'::jsonb, 'proof: part 1 cooling 2 finished an hour ago')", [c1]);
  await db.query('reset role');
  const st2 = Object.fromEntries((await q('select code, state::text s from batch_activity where master_batch_id=$1', [b2])).map((r) => [r.code, r.s]));
  check('M5', 'part 1 cooling done → unloading 1 opens; unloading 3 still waits for part 3',
    !['WAITING_CONDITION', 'BLOCKED', 'LOCKED'].includes(st2['TUN-DISCHARGE-1']) && st2['TUN-DISCHARGE-3'] !== 'READY',
    `DISCHARGE-1 ${st2['TUN-DISCHARGE-1']}; DISCHARGE-3 ${st2['TUN-DISCHARGE-3']}; B3-COOL-2 ${st2['TN-B3-COOL-2']}`);

  const after = await fingerprint();
  const same = before.every((b) => after.find((a) => a.code === b.code)?.f === b.f);
  check('M6', 'every existing active batch unchanged', same, before.map((b) => b.code).join(', '));
} catch (e) {
  console.error('ERROR', e.message);
  results.push(false);
} finally {
  await db.query('rollback').catch(() => {});
  await db.end();
  console.log(`\n${results.filter(Boolean).length}/${results.length} PASS — rolled back, nothing saved.`);
  if (results.some((r) => !r)) process.exitCode = 1;
}
