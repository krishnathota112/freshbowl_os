// Applies 0145 inside one transaction, checks the schedule, and always rolls back.
// Run with a server-side SUPABASE_DB_URL or database/.env.local. Never put DB credentials in app/www.
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const localRequire = createRequire(import.meta.url);
const siblingRequire = createRequire(new URL('../../../mushroomos/package.json', import.meta.url));
function dependency(name) {
  try { return localRequire(name); } catch { return siblingRequire(name); }
}
const pg = dependency('pg');
const dotenv = dependency('dotenv');
const live = process.argv.includes('--live');
const localEnv = new URL('../.env.local', import.meta.url);
const siblingEnv = new URL('../../../mushroomos/.env.local', import.meta.url);
if (!process.env.SUPABASE_DB_URL) dotenv.config({ path: existsSync(localEnv) ? localEnv : siblingEnv });
if (!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL is needed for the rolled-back proof.');

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
async function one(sql, args = []) { return (await db.query(sql, args)).rows[0]; }
function expect(ok, description) { if (!ok) throw new Error(description); console.log('PASS  ' + description); }
async function admin() {
  await db.query('reset role');
  const profile = await one("select id from profiles where role='admin' and is_active limit 1");
  if (!profile) throw new Error('No active Admin profile for proof.');
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: profile.id, role: 'authenticated', app_metadata: { app_role: 'admin' } })]);
  await db.query('set local role authenticated');
}

let connected = false;
try {
  await db.connect();
  connected = true;
  await db.query('begin');
  if (!live) await db.query(readFileSync(new URL('../0145_tasks_suggested_time.sql', import.meta.url), 'utf8'));
  await admin();

  const exampleH0 = '2026-09-01T03:30:00Z';
  const batchH0 = '2026-10-01T03:30:00Z';
  const rows = [
    { line: 'Main', h_ref: 'H0', title: 'Bagasse wetting', kind: 'work', photos: 'none', suggested_offset_minutes: 0 },
    { line: 'Main', h_ref: 'H26', title: 'Before bunker load', kind: 'lab_gate', photos: 'none', suggested_offset_minutes: 1560 },
    { line: 'Main', h_ref: 'H26', title: 'Bunker load', kind: 'work', photos: 'none', suggested_offset_minutes: 1560 },
    { line: 'Paddy', h_ref: 'H86', title: 'Paddy soak 1', kind: 'work', photos: 'none', suggested_offset_minutes: 5160 },
    { line: 'Cleaning', h_ref: 'H72', title: 'Clean bunker', kind: 'cleaning', photos: 'none', suggested_offset_minutes: 4320 },
  ];
  const sop = (await one('select tk_sop_create_v2($1,$2,$3::jsonb,$4::timestamptz) id', ['0145 proof', null, JSON.stringify(rows), exampleH0])).id;
  const saved = await one('select reference_h0 from tk_sop where id=$1', [sop]);
  const paddy = await one("select suggested_offset_minutes from tk_sop_row where sop_id=$1 and line='Paddy'", [sop]);
  expect(new Date(saved.reference_h0).getTime() === Date.parse(exampleH0) && paddy.suggested_offset_minutes === 5160,
    'SOP saves example H0 and the Paddy offset');

  await db.query('select tk_sop_publish($1)', [sop]);
  const batch = (await one('select tk_batch_create_v2($1,$2,$3::timestamptz,$4) id', ['0145 proof batch', sop, batchH0, null])).id;
  const tasks = (await db.query('select line, title, suggested_at, can_start, blocked_by from tk_v_task_v2 where batch_id=$1 order by ord', [batch])).rows;
  const byTitle = Object.fromEntries(tasks.map(t => [t.title, t]));
  expect(new Date(byTitle['Paddy soak 1'].suggested_at).getTime() - Date.parse(batchH0) === 5160 * 60000,
    'Paddy suggestion shifts to this batch H0');
  expect(byTitle['Bagasse wetting'].can_start && byTitle['Paddy soak 1'].can_start && byTitle['Clean bunker'].can_start,
    'Main, Paddy, and Cleaning can open independently of suggested time');
  expect(!byTitle['Bunker load'].can_start && byTitle['Bunker load'].blocked_by === 'Bagasse wetting',
    'existing same-line order still controls the bunker task');

  const version2 = (await one('select tk_sop_new_version_v2($1) id', [sop])).id;
  const copied = await one("select s.reference_h0, r.suggested_offset_minutes from tk_sop s join tk_sop_row r on r.sop_id=s.id where s.id=$1 and r.line='Paddy'", [version2]);
  expect(new Date(copied.reference_h0).getTime() === Date.parse(exampleH0) && copied.suggested_offset_minutes === 5160,
    'a new SOP version retains the example H0 and row suggestions');

  const changed = rows.map(r => r.line === 'Paddy' ? { ...r, suggested_offset_minutes: 5280 } : r);
  await db.query('select tk_sop_save_v2($1,$2,$3,$4::jsonb,$5::timestamptz)', [version2, '0145 proof', null, JSON.stringify(changed), exampleH0]);
  const oldOffset = await one("select suggested_offset_minutes from tk_sop_row where sop_id=$1 and line='Paddy'", [sop]);
  const newOffset = await one("select suggested_offset_minutes from tk_sop_row where sop_id=$1 and line='Paddy'", [version2]);
  expect(oldOffset.suggested_offset_minutes === 5160 && newOffset.suggested_offset_minutes === 5280,
    'editing a draft changes only its own version');

  const paddyTask = (await one("select id from tk_task where batch_id=$1 and line='Paddy'", [batch])).id;
  const movedAt = '2026-10-05T03:30:00Z';
  await db.query('select tk_task_edit_v2($1,$2::jsonb)', [paddyTask, JSON.stringify({ line: 'Paddy', title: 'Paddy soak 1', kind: 'work', photos: 'none', ask: 'none', suggested_at: movedAt })]);
  const edited = await one('select suggested_at from tk_task where id=$1', [paddyTask]);
  expect(new Date(edited.suggested_at).getTime() === Date.parse(movedAt), 'Admin can change an unstarted batch task suggestion');

  const addedAt = '2026-10-04T03:30:00Z';
  const extra = (await one('select tk_task_add_v2($1,$2,$3::jsonb) id', [batch, null, JSON.stringify({ line: 'Cleaning', title: 'Clean tunnel', kind: 'cleaning', photos: 'none', suggested_at: addedAt })])).id;
  const added = await one('select suggested_at from tk_task where id=$1', [extra]);
  expect(new Date(added.suggested_at).getTime() === Date.parse(addedAt), 'Admin can suggest a time for a task added to a running batch');

  if (!live) {
    await db.query('reset role');
    await db.query(readFileSync(new URL('../rollback_0145_tasks_suggested_time.sql', import.meta.url), 'utf8'));
    const rolledBack = await one("select count(*)::int n from information_schema.columns where table_schema='public' and table_name in ('tk_sop','tk_sop_row','tk_task') and column_name in ('reference_h0','suggested_offset_minutes','suggested_at')");
    expect(rolledBack.n === 0, 'rollback removes only the new schedule columns and objects');
  }
} finally {
  if (connected) {
    try { await db.query('rollback'); } finally { await db.end(); }
  }
}
