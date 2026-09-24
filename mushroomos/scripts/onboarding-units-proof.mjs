// 0125 proof — exact per-unit onboarding + preview. ONE transaction, rolled back.
//   node scripts/onboarding-units-proof.mjs          (tests the migration FILE inside the transaction)
//   node scripts/onboarding-units-proof.mjs --live   (tests what is already applied)
import { readFileSync } from 'node:fs';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env.local', import.meta.url) });
const LIVE = process.argv.includes('--live');
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
const q = async (s, a = []) => (await db.query(s, a)).rows;
const one = async (s, a) => (await q(s, a))[0];
const results = [];
const check = (id, name, ok, actual) => { results.push({ id, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}\n        ${actual}`); };
async function asAdmin() {
  await db.query('reset role');
  const p = await one("select id from profiles where role='admin' and is_active order by created_at limit 1");
  await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: p.id, role: 'authenticated', app_metadata: { app_role: 'admin' } })]);
  await db.query('set local role authenticated');
}
async function draft(tag) {
  await asAdmin();
  const cur = await one('select * from v_process_catalogue where is_current');
  const roles = await q(`select e.role, m.code material_code, true lead from material_role_eligibility e join material m on m.id=e.material_id where e.is_default_lead`);
  const { id } = await one(`select create_master_batch($1,$1,current_date,'{}'::jsonb,$2::jsonb,null,null,now(),$3) id`, [`TEST-ONBOARD-${tag}-${Date.now()}`, JSON.stringify(roles), cur.process_definition_id]);
  await q('select generate_activity_plan($1)', [id]);
  const cp = await one('select id from lab_checkpoint where is_prebatch order by code limit 1');
  const s = await one("select open_prebatch_sample($1,$2,'proof') id", [id, cp.id]);
  const t = await one("select request_lab_test($1,'moisture_pct','user') id", [s.id]);
  await q('select record_lab_result($1,56.2)', [t.id]);
  return id;
}
const ids = (batch, codes) => q('select id from batch_activity where master_batch_id=$1 and code = any($2)', [batch, codes]).then(r => r.map(x => x.id));
const stateOf = async (batch) => Object.fromEntries((await q(`select code, state::text s, before_tracking bt, planned_start_at is not null planned, actual_start is not null act from batch_activity where master_batch_id=$1`, [batch])).map(r => [r.code, r]));
async function refused(sql, args) {
  await db.query('savepoint r');
  try { await db.query(sql, args); await db.query('rollback to savepoint r'); return null; }
  catch (e) { await db.query('rollback to savepoint r'); return e.message; }
}
const H0 = new Date(Date.now() - 200 * 3600 * 1000);

try {
  await db.connect();
  await db.query('begin');

  // 0 · the OLD call's answer, before the migration, for a fixed scenario
  const oldScenario = { positions: ['BNK-B1-HOLD-1', 'TRN-P3-T2', 'TRN-P4-T1'], done: ['PRIMARY_FIBRE'] };
  let before = null;
  if (!LIVE) {
    await db.query('savepoint old');
    const b0 = await draft('OLD');
    await q('select * from onboard_batch($1,$2,$3::uuid[],$4::text[],null)', [b0, H0, await ids(b0, oldScenario.positions), oldScenario.done]);
    await db.query('reset role');
    before = Object.fromEntries(Object.entries(await stateOf(b0)).map(([k, v]) => [k, `${v.s}/${v.bt}/${v.planned}`]));
    await db.query('rollback to savepoint old');
    await db.query('reset role');
    await db.query(readFileSync(new URL('../supabase/migrations/0125_onboarding_exact_units_and_preview.sql', import.meta.url), 'utf8'));
    console.log('migration 0125 loaded inside the transaction');
  }

  // 1 · backwards compatible: same call, same result
  if (!LIVE) {
    const b1 = await draft('COMPAT');
    await q('select * from onboard_batch($1,$2,$3::uuid[],$4::text[],null)', [b1, H0, await ids(b1, oldScenario.positions), oldScenario.done]);
    await db.query('reset role');
    const after = Object.fromEntries(Object.entries(await stateOf(b1)).map(([k, v]) => [k, `${v.s}/${v.bt}/${v.planned}`]));
    const diff = Object.keys(before).filter(k => before[k] !== after[k]);
    check('U1', 'old-style call (no units) gives the identical result after 0125', diff.length === 0, diff.length ? diff.map(k => `${k}: ${before[k]} → ${after[k]}`).join('; ') : `${Object.keys(after).length} activities identical`);
  }

  // 2 · the owner's scenario, exact units
  const b2 = await draft('EXACT');
  const exactFinished = ['PRIMARY_FIBRE|Whole batch', 'STRUCTURAL_STRAW|Whole batch', 'NITROGEN_MINERAL|Whole batch', 'YARD|Whole batch', 'YARD|Pile 1'];
  const exactPos = await ids(b2, ['TRN-P2-T2', 'BNK-B1-FILL']);
  const draftBefore = await one('select to_jsonb(b) b from master_batch b where id=$1', [b2]);
  const prevRows = await q('select * from preview_onboard_batch($1,$2,$3::uuid[],$4::text[],null,$5::text[],true)', [b2, H0, exactPos, [], exactFinished]);
  await db.query('reset role');
  const stillDraft = await one('select status, (select count(*)::int from batch_activity where master_batch_id=$1 and before_tracking) bt from master_batch where id=$1', [b2]);
  const auditFromPreview = await one("select count(*)::int n from audit_event where entity_id=$1 and action='onboard_batch'", [b2]);
  check('U2', 'preview leaves the draft untouched (status, no audit row)', stillDraft.status === 'draft' && stillDraft.bt === 0 && auditFromPreview.n === 0, `status ${stillDraft.status}; before-tracking rows ${stillDraft.bt}; onboarding audit rows ${auditFromPreview.n}; preview rows ${prevRows.length}`);

  await asAdmin();
  const ob = await one('select * from onboard_batch($1,$2,$3::uuid[],$4::text[],$5,$6::text[],true)', [b2, H0, exactPos, [], 'proof: P1 finished, P2 at T2, B1 filling', exactFinished]);
  await db.query('reset role');
  const s2 = await stateOf(b2);
  const mb2 = await one('select * from master_batch where id=$1', [b2]);
  const prevMap = Object.fromEntries(prevRows.map(r => [r.code, `${r.state}/${r.before_tracking}`]));
  const realMap = Object.fromEntries(Object.entries(s2).map(([k, v]) => [k, `${v.s}/${v.bt}`]));
  const pdiff = Object.keys(realMap).filter(k => prevMap[k] !== realMap[k]);
  check('U3', 'preview = what confirm actually saved (every activity)', pdiff.length === 0, pdiff.length ? pdiff.slice(0, 8).map(k => `${k}: preview ${prevMap[k]} saved ${realMap[k]}`).join('; ') : `${Object.keys(realMap).length} identical`);
  const pile = n => ['T0', 'T1', 'T2', 'T3'].map(t => `${t}:${s2[`TRN-P${n}-${t}`].s[0]}${s2[`TRN-P${n}-${t}`].bt ? '*' : ''}`).join(' ');
  check('U4', 'P1 finished; P2 at T2 (T0,T1 done; T3 open); P3–P6 not started (nothing done)',
    ['T0', 'T1', 'T2', 'T3'].every(t => s2[`TRN-P1-${t}`].bt) &&
    s2['TRN-P2-T0'].bt && s2['TRN-P2-T1'].bt && !s2['TRN-P2-T2'].bt && s2['TRN-P2-T2'].s === 'READY' && !s2['TRN-P2-T3'].bt &&
    [3, 4, 5, 6].every(n => ['T0', 'T1', 'T2', 'T3'].every(t => !s2[`TRN-P${n}-${t}`].bt)),
    `P1 ${pile(1)} | P2 ${pile(2)} | P3 ${pile(3)} | P6 ${pile(6)}  (*=before tracking)`);
  check('U5', 'B1 filling is current; B2 and B3 are NOT assumed filled',
    s2['BNK-B1-FILL'].s === 'READY' && !s2['BNK-B2-FILL'].bt && !s2['BNK-B3-FILL'].bt && !s2['BNK-B2-HOLD-1'].bt,
    `B1-FILL ${s2['BNK-B1-FILL'].s}; B2-FILL ${s2['BNK-B2-FILL'].s}/${s2['BNK-B2-FILL'].bt}; B3-FILL ${s2['BNK-B3-FILL'].s}/${s2['BNK-B3-FILL'].bt}`);
  const fab = Object.entries(s2).filter(([, v]) => v.act);
  const planned = Object.entries(s2).filter(([, v]) => v.bt && v.planned);
  check('U6', 'no invented history: 0 actual times; before-tracking work has no plan time; H0 kept; batch active',
    fab.length === 0 && planned.length === 0 && +mb2.start_at === +H0 && mb2.status === 'active',
    `actual ${fab.length}; planned-before-tracking ${planned.length}; H0 ${+mb2.start_at === +H0}; ${mb2.status}; rpc ${JSON.stringify(ob)}`);
  const notDue = await q(`select a.code from batch_activity a cross join lateral planned_time_status(a.id) p where a.master_batch_id=$1 and a.state='READY' and not p.ok`, [b2]);
  check('U7', 'future work stays future (no READY that is not due)', notDue.length === 0, notDue.map(x => x.code).join(',') || '0');
  const audit = await one("select after_state from audit_event where entity_id=$1 and action='onboard_batch' order by occurred_at desc limit 1", [b2]);
  check('U8', 'audit trail records the finished units and exact mode', audit?.after_state?.exact_units === true && audit.after_state.finished_units.length === 5, JSON.stringify(audit?.after_state?.finished_units));

  // 3 · contradictions are refused, not converted into history
  const b3 = await draft('CONFLICT');
  await asAdmin();
  const r1 = await refused('select * from onboard_batch($1,$2,$3::uuid[],$4::text[],null,$5::text[],true)',
    [b3, H0, await ids(b3, ['BNK-B1-HOLD-1', 'TRN-P2-T1']), [], exactFinished]);
  check('U9', 'Bunker 1 past filling while Pile 2 is at T1 → refused, naming the pile step', /pile 2/i.test(r1 ?? ''), r1 ?? 'ACCEPTED');
  const r2 = await refused('select * from onboard_batch($1,$2,$3::uuid[],$4::text[],null,$5::text[],true)',
    [b3, H0, await ids(b3, ['TRN-P2-T2']), [], []]);
  check('U10', 'Pile 2 at T2 with mixing/fibre left "not started" → refused, naming the UNITS', /\[YARD\|Whole batch\]/.test(r2 ?? '') && /\[PRIMARY_FIBRE\|Whole batch\]/.test(r2 ?? ''), r2 ?? 'ACCEPTED');
  const r3 = await refused('select * from onboard_batch($1,$2,$3::uuid[],$4::text[],null,$5::text[],true)',
    [b3, H0, await ids(b3, ['TRN-P2-T2']), [], ['YARD|Pile 2']]);
  check('U11', 'a unit both finished and current → refused', /both/i.test(r3 ?? ''), r3 ?? 'ACCEPTED');
  const r4 = await refused('select * from preview_onboard_batch($1,$2,$3::uuid[],$4::text[],null,$5::text[],true)',
    [b3, H0, await ids(b3, ['BNK-B1-HOLD-1', 'TRN-P2-T1']), [], exactFinished]);
  check('U12', 'preview surfaces the same refusal', r4 === r1, r4 ?? 'ACCEPTED');

  // 4 · roles and the other laptop's world: supervisor cannot preview; the real batch is unchanged
  await db.query('reset role');
  const sup = await one("select id from profiles where role='supervisor' and is_active limit 1");
  await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: sup.id, role: 'authenticated', app_metadata: { app_role: 'supervisor' } })]);
  await db.query('set local role authenticated');
  const r5 = await refused('select * from preview_onboard_batch($1,null,$2::uuid[])', [b3, []]);
  check('U13', 'only Admin may preview', Boolean(r5), r5 ?? 'ACCEPTED');
  const work = await q("select code, state from v_my_work where master_batch_id=$1 and responsible_role <> 'lab_tech' and state in ('READY','IN_PROGRESS')", [b2]);
  check('U14', 'Supervisor My Work shows the onboarded positions', work.some(w => w.code === 'TRN-P2-T2') && work.some(w => w.code === 'BNK-B1-FILL'), work.map(w => `${w.code}[${w.state}]`).join(', '));
  await db.query('reset role');
  const lab = await one('select id from profiles where role=$1 and is_active limit 1', ['lab_tech']);
  await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: lab.id, role: 'authenticated', app_metadata: { app_role: 'lab_tech' } })]);
  await db.query('set local role authenticated');
  const lq = await q('select activity_title, state from v_lab_queue where master_batch_id=$1', [b2]);
  const lqStates = lq.reduce((m, r) => ({ ...m, [r.state]: (m[r.state] ?? 0) + 1 }), {});
  check('U15', 'Lab queue for the onboarded batch is readable and has no before-tracking checkpoint as open work', lq.length > 0 && !lq.some(r => r.state === 'SKIPPED'), JSON.stringify(lqStates));
} catch (e) {
  console.error('ABORTED:', e.message);
  results.push({ id: 'X', ok: false });
} finally {
  await db.query('rollback').catch(() => {});
  await db.end();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} PASS${failed.length ? ' — FAILED: ' + failed.map(f => f.id).join(', ') : ''}\nROLLBACK: nothing retained${LIVE ? '' : ' (migration included)'}`);
  process.exitCode = failed.length ? 1 : 0;
}
