// 0144 proof — MushroomOS Tasks (separate app). ONE transaction, always rolled back.
//   node scripts/tasks-app-proof.mjs          loads the migration FILE inside the transaction
//   node scripts/tasks-app-proof.mjs --live   uses what is applied
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const localRequire = createRequire(import.meta.url);
const siblingRequire = createRequire(new URL('../../../mushroomos/package.json', import.meta.url));
function dependency(name) { try { return localRequire(name); } catch { return siblingRequire(name); } }
const pg = dependency('pg'), dotenv = dependency('dotenv');
const localEnv = new URL('../.env.local', import.meta.url);
dotenv.config({ path: existsSync(localEnv) ? localEnv : new URL('../../../mushroomos/.env.local', import.meta.url) });
const LIVE = process.argv.includes('--live');
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
const q = async (s, a = []) => (await db.query(s, a)).rows;
const one = async (s, a) => (await q(s, a))[0];
const results = [];
const check = (id, name, ok, actual) => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}\n        ${actual}`); };
async function as(role) {
  await db.query('reset role');
  const p = await one('select id from profiles where role=$1 and is_active limit 1', [role]);
  await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: p.id, role: 'authenticated', app_metadata: { app_role: role } })]);
  await db.query('set local role authenticated');
  return p.id;
}
async function refused(sql, args) {
  await db.query('savepoint r');
  try { await db.query(sql, args); await db.query('release savepoint r'); return null; }
  catch (e) { await db.query('rollback to savepoint r'); return e.message; }
}
async function photo(batch, task, kind, role = 'supervisor') {
  await db.query('reset role');
  const path = `${batch}/${task}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`;
  await q(`insert into storage.objects (bucket_id, name, metadata) values ('tasks', $1, '{"size": 2048, "mimetype": "image/jpeg"}')`, [path]);
  await as(role);
  await q('select tk_add_photo($1,$2,$3)', [task, kind, path]);
}

// The owner's own table shape: line, H-hour, task, type, lab/control. One empty row, dropped.
const ROWS = [
  { line: 'Main', h_ref: 'H0', title: 'Bagasse wetting + Hopper pass 1', kind: 'work', control: 'Moisture, pH, EC', ask: 'machine' },
  { line: 'Main', h_ref: 'H1', title: 'Moisture after hopper 1', kind: 'lab', control: 'Moisture, pH, EC', lab_checkpoint: 'LAB-WET-01' },
  { line: 'Main', h_ref: 'H3', title: 'Material rest', kind: 'rest' },
  { line: 'Main', h_ref: 'H26', title: 'Before first bunker load', kind: 'lab_gate', control: 'LAB-04 + GM gate', lab_checkpoint: 'LAB-BNK-PRE' },
  { line: 'Main', h_ref: 'H26', title: 'Bunker fill', kind: 'work', ask: 'bunker' },
  { line: '', title: '   ' },
  { line: 'Paddy', h_ref: 'H74', title: 'Paddy preparation', kind: 'work', photos: 'after' },
  { line: 'Paddy', h_ref: 'H86', title: 'Paddy soak 1', kind: 'work', photos: 'none' },
  { line: 'Cleaning', title: 'Clean bunker 2', kind: 'cleaning', ask: 'bunker' },
];

try {
  await db.connect();
  await db.query('begin');
  const mainBefore = await one(`select md5(string_agg(id::text||state||coalesce(actual_start::text,''),',' order by id)) h from batch_activity`);
  if (!LIVE) await db.query(readFileSync(new URL('../0144_tasks_app.sql', import.meta.url), 'utf8'));

  // T1 · Admin types an SOP as a table
  await as('supervisor');
  const r0 = await refused(`select tk_sop_create('x', null, '[]'::jsonb)`);
  await as('admin');
  const v1 = (await one(`select tk_sop_create('Compost trial SOP', 'proof', $1::jsonb) id`, [JSON.stringify(ROWS)])).id;
  const rows = await q('select * from tk_sop_row where sop_id=$1 order by ord', [v1]);
  check('T1', 'Admin creates an SOP from typed rows (empty row dropped, defaults for photos, lines kept); supervisor cannot',
    rows.length === 8 && rows[0].photos === 'both' && rows[2].photos === 'none' && rows[3].kind === 'lab_gate' && rows[5].line === 'Paddy' && r0,
    `${rows.length} rows; lines ${[...new Set(rows.map((r) => r.line))].join('/')}; refusal "${r0}"`);

  // T2 · versions: published is frozen; any change is a new version; the old one stays usable
  await q('select tk_sop_publish($1)', [v1]);
  const rFrozen = await refused(`select tk_sop_save($1,'x',null,'[]'::jsonb)`, [v1]);
  const v2 = (await one('select tk_sop_new_version($1) id', [v1])).id;
  const rTwoDrafts = await refused('select tk_sop_new_version($1)', [v1]);
  const edited = ROWS.map((r) => (r.title === 'Material rest' ? { ...r, title: 'Material rest (10 h trial)' } : r));
  await q(`select tk_sop_save($1,'Compost trial SOP','v2: longer rest',$2::jsonb)`, [v2, JSON.stringify(edited)]);
  await q('select tk_sop_publish($1)', [v2]);
  const vs = await q(`select version, status, is_latest_published, row_count from tk_v_sop where family_id=$1 order by version`, [v1]);
  check('T2', 'published v1 is frozen; editing makes v2 (one draft at a time); both versions stay published and selectable',
    rFrozen && rTwoDrafts && vs.length === 2 && vs.every((v) => v.status === 'published') && vs[1].is_latest_published && !vs[0].is_latest_published,
    `${vs.map((v) => `v${v.version} ${v.status}${v.is_latest_published ? ' (latest)' : ''} ${v.row_count} rows`).join(' · ')}; "${rFrozen}" · "${rTwoDrafts}"`);

  // T3 · a batch on v1 (the Admin opts for the older version)
  const b = (await one(`select tk_batch_create('182,183,184 (proof)', $1, now() - interval '2 hours', null) id`, [v1])).id;
  const t = Object.fromEntries((await q('select title, id from tk_task where batch_id=$1', [b])).map((x) => [x.title, x.id]));
  const vb = await one('select * from tk_v_batch where id=$1', [b]);
  check('T3', 'batch copies the chosen version (v1) row for row', vb.tasks === 8 && vb.sop_version === 1 && t['Material rest'],
    `${vb.tasks} tasks from ${vb.sop_name} v${vb.sop_version}; lines ${vb.lines.join('/')}`);

  // T4 · order inside a line; lines side by side; a Lab record row never holds anything
  const can = async () => Object.fromEntries((await q('select title, can_start, blocked_by from tk_v_task where batch_id=$1', [b])).map((x) => [x.title, x]));
  let c = await can();
  await as('supervisor');
  const rOrder = await refused('select tk_start($1)', [t['Material rest']]);
  check('T4', 'Main: only the first task can start; Paddy and Cleaning can start at the same time (parallel lines)',
    c['Bagasse wetting + Hopper pass 1'].can_start && !c['Material rest'].can_start && c['Paddy preparation'].can_start && c['Clean bunker 2'].can_start
      && !c['Paddy soak 1'].can_start && rOrder,
    `rest blocked by "${c['Material rest'].blocked_by}"; refusal "${rOrder}"`);

  // T5 · evidence and the question are required to finish
  const w = t['Bagasse wetting + Hopper pass 1'];
  await q('select tk_start($1)', [w]);
  const rNoPhoto = await refused("select tk_finish($1,'M1',null)", [w]);
  await photo(b, w, 'before'); await photo(b, w, 'after');
  const rNoAnswer = await refused('select tk_finish($1,null,null)', [w]);
  await q("select tk_finish($1,'Hopper 1','wet enough')", [w]);
  c = await can();
  check('T5', 'finish needs the before + after photos and the asked value (machine); then the rest opens — the Lab row in between does not hold it',
    rNoPhoto && rNoAnswer && c['Material rest'].can_start, `"${rNoPhoto}" · "${rNoAnswer}"`);

  // T6 · Lab gate: Lab submits, GM returns (with a reason), Lab retests, GM approves → the next task opens
  await q('select tk_start($1)', [t['Material rest']]);
  await q('select tk_finish($1,null,null)', [t['Material rest']]);
  c = await can();
  const gate = t['Before first bunker load'];
  const fill = t['Bunker fill'];
  const rSupLab = await refused(`select tk_lab_submit($1,'[{"param":"moisture_pct","label":"Moisture","value":"66","unit":"%"}]'::jsonb)`, [gate]);
  await as('lab_tech');
  const cp = await one(`select params from tk_v_checkpoint where code='LAB-BNK-PRE'`);
  await q(`select tk_lab_submit($1,'[{"param":"moisture_pct","label":"Moisture","value":"66","unit":"%"},{"param":"ph","label":"pH","value":"7.9"}]'::jsonb,'sample 1')`, [gate]);
  const rLabGm = await refused('select tk_gm_decide($1,true,null)', [gate]);
  await as('supervisor');
  const rFillWhileSubmitted = await refused('select tk_start($1)', [fill]);
  await as('gm');
  const rNoWhy = await refused('select tk_gm_decide($1,false,null)', [gate]);
  await q("select tk_gm_decide($1,false,'moisture low — mist and retest')", [gate]);
  await as('lab_tech');
  await q(`select tk_lab_submit($1,'[{"param":"moisture_pct","label":"Moisture","value":"69","unit":"%"}]'::jsonb)`, [gate]);
  await as('gm');
  await q("select tk_gm_decide($1,true,'ok')", [gate]);
  await as('supervisor');
  const cf = (await one('select can_start from tk_v_task where id=$1', [fill])).can_start;
  const reads = await one('select count(*)::int n, count(distinct round)::int rounds from tk_reading where task_id=$1', [gate]);
  const decs = await q('select approved, note from tk_decision where task_id=$1 order by decided_at', [gate]);
  check('T6', 'Lab gate: fill waits while submitted; GM must give a reason to return; retest is round 2; GM approval opens the fill; every reading and decision kept; roles enforced',
    c['Bunker fill'].can_start === false && rFillWhileSubmitted && rNoWhy && cf && reads.rounds === 2 && reads.n === 3 && decs.length === 2 && !decs[0].approved && decs[1].approved
      && rSupLab && rLabGm && cp.params.length === 3,
    `readings ${reads.n} in ${reads.rounds} rounds; decisions ${decs.map((d) => (d.approved ? 'approved' : 'returned: ' + d.note)).join(' → ')}; checkpoint LAB-BNK-PRE asks ${cp.params.map((p) => p.label).join(', ')}`);

  // T7 · catch-up for a batch already running
  await as('admin');
  const nBefore = (await one('select tk_done_before($1) n', [t['Paddy preparation']])).n;
  const rFuture = await refused("select tk_running_since($1, now() + interval '1 hour')", [t['Paddy soak 1']]);
  await q("select tk_running_since($1, now() - interval '5 hours')", [t['Paddy soak 1']]);
  const ps = await one('select status, start_source, started_at from tk_task where id=$1', [t['Paddy soak 1']]);
  check('T7', 'catch-up: "done before the app" (no times invented); "running since" a stated past time; future refused',
    nBefore === 1 && ps.status === 'running' && ps.start_source === 'reported' && rFuture, `${nBefore} done-before; soak 1 ${ps.status}/${ps.start_source}; "${rFuture}"`);

  // T8 · the Admin changes the running batch: add after a task (joins its line), edit a waiting one, remove a waiting one, not a started one
  const added = (await one(`select tk_task_add($1,$2,'{"title":"Extra flip","kind":"work","photos":"none"}'::jsonb) id`, [b, fill])).id;
  const ad = await one('select line, ord, added_later from tk_task where id=$1', [added]);
  await q(`select tk_task_edit($1,'{"title":"Clean bunker 2 and 3","kind":"cleaning","ask":"bunker"}'::jsonb)`, [t['Clean bunker 2']]);
  const rRemStarted = await refused('select tk_task_remove($1)', [t['Paddy soak 1']]);
  await q('select tk_task_remove($1)', [added]);
  const cl = await one('select title from tk_task where id=$1', [t['Clean bunker 2']]);
  check('T8', 'Admin adds a task after "Bunker fill" (joins the Main line), renames a waiting task, removes a waiting task; a started one stays',
    ad.line === 'Main' && ad.added_later && cl.title === 'Clean bunker 2 and 3' && rRemStarted, `added in ${ad.line} at #${ad.ord}; "${rRemStarted}"`);

  // T9 · the main app is untouched
  await db.query('reset role');
  const mainAfter = await one(`select md5(string_agg(id::text||state||coalesce(actual_start::text,''),',' order by id)) h from batch_activity`);
  check('T9', 'the main MushroomOS batches are untouched', mainAfter.h === mainBefore.h, mainAfter.h);
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
