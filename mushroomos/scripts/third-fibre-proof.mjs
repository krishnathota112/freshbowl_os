// Batch creation with Main + Second + Third fibre (0127/0128). ONE transaction, rolled back.
//   node scripts/third-fibre-proof.mjs
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env.local', import.meta.url) });
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
const q = async (s, a = []) => (await db.query(s, a)).rows;
const one = async (s, a) => (await q(s, a))[0];
const res = [];
const check = (id, name, ok, actual) => { res.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}\n        ${actual}`); };
try {
  await db.connect();
  await db.query('begin');
  const adm = await one("select id from profiles where role='admin' and is_active order by created_at limit 1");
  await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: adm.id, role: 'authenticated', app_metadata: { app_role: 'admin' } })]);
  await db.query('set local role authenticated');
  const cur = await one('select * from v_process_catalogue where is_current');
  // exactly the payload BatchStart builds: one lead binding per chosen role
  const roles = [
    { role: 'PRIMARY_FIBRE', material_code: 'BAGASSE_NEW', lead: true },
    { role: 'SECONDARY_FIBRE', material_code: 'WHEAT_STRAW', lead: true },
    { role: 'TERTIARY_FIBRE', material_code: 'BAGASSE_OLD', lead: true },
    { role: 'STRUCTURAL_STRAW', material_code: 'PADDY_PUNJAB', lead: true },
    { role: 'NITROGEN_SOURCE', material_code: 'CHICKEN_MANURE', lead: true },
    { role: 'MINERAL', material_code: 'GYPSUM', lead: true },
  ];
  const elig = await q("select e.role::text r, m.code from material_role_eligibility e join material m on m.id=e.material_id where e.role::text like '%FIBRE'");
  check('T1', 'Third fibre offers the same fibre materials as Main', ['BAGASSE_NEW', 'BAGASSE_OLD', 'MUSTARD_STRAW', 'WHEAT_STRAW'].every(c => elig.some(e => e.r === 'TERTIARY_FIBRE' && e.code === c)),
    elig.filter(e => e.r === 'TERTIARY_FIBRE').map(e => e.code).join(', '));
  const { id } = await one(`select create_master_batch($1,$1,current_date,'{}'::jsonb,$2::jsonb,null,null,now(),$3) id`, [`TEST-3FIBRE-${Date.now()}`, JSON.stringify(roles), cur.process_definition_id]);
  const bound = await q('select r.role::text, m.code from batch_material_role r join material m on m.id=r.material_id where r.master_batch_id=$1 order by 1', [id]);
  check('T2', 'All three fibres are saved on the batch', bound.some(b => b.role === 'TERTIARY_FIBRE' && b.code === 'BAGASSE_OLD') && bound.length === 6,
    bound.map(b => `${b.role}=${b.code}`).join(', '));
  const n = await one('select count(*)::int n from batch_activity where master_batch_id=$1', [id]);
  const cp = await one('select id from lab_checkpoint where is_prebatch order by code limit 1');
  const s = await one("select open_prebatch_sample($1,$2,'proof') id", [id, cp.id]);
  const t = await one("select request_lab_test($1,'moisture_pct','user') id", [s.id]);
  await q('select record_lab_result($1,56.2)', [t.id]);
  const blockers = await q("select * from validate_batch($1) where severity='blocking'", [id]);
  check('T3', 'Plan unchanged by the third fibre (113 tasks) and nothing blocks once initial material is recorded', n.n === 113 && blockers.length === 0,
    `${n.n} tasks; blocking ${blockers.length} ${JSON.stringify(blockers)}`);
  await q('select activate_batch($1)', [id]);
  const mon = await one('select status, materials from v_batch_monitor where master_batch_id=$1', [id]);
  check('T4', 'Batch activates; the monitor lists the third fibre among its materials', mon.status === 'active' && JSON.stringify(mon.materials).includes('BAGASSE_OLD'),
    `${mon.status}; ${JSON.stringify(mon.materials)}`);
  const b2 = await one(`select create_master_batch($1,$1,current_date,'{}'::jsonb,$2::jsonb,null,null,now(),$3) id`,
    [`TEST-3FIBRE-NONE-${Date.now()}`, JSON.stringify(roles.filter(r => !/SECONDARY|TERTIARY/.test(r.role))), cur.process_definition_id]);
  const n2 = await one('select count(*)::int n from batch_activity where master_batch_id=$1', [b2.id]);
  check('T5', 'Second and Third "Not used" still creates the normal batch', n2.n === 113, `${n2.n} tasks`);
} catch (e) { console.error('ABORTED:', e.message); res.push(false); }
finally {
  await db.query('rollback').catch(() => {}); await db.end();
  console.log(`\n${res.filter(Boolean).length}/${res.length} PASS\nROLLBACK: nothing retained`);
  process.exitCode = res.every(Boolean) ? 0 : 1;
}
