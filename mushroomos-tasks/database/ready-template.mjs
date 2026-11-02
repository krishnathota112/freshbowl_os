// Default: prove migration inside a rolled-back transaction. --apply: install after proof.
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const local = createRequire(import.meta.url);
const sibling = createRequire(new URL('../../mushroomos/package.json', import.meta.url));
function dep(name) { try { return local(name); } catch { return sibling(name); } }
const pg = dep('pg');
const localEnv = new URL('.env.local', import.meta.url);
dep('dotenv').config({ path: existsSync(localEnv) ? localEnv : new URL('../../mushroomos/.env.local', import.meta.url) });
if (!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL is required.');
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
const apply = process.argv.includes('--apply'), live = process.argv.includes('--live'), checkpoints = process.argv.includes('--checkpoints');
const migration = checkpoints ? '0147_tasks_template_checkpoints.sql' : '0146_tasks_ready_template.sql';
const template = '14600000-0000-4000-8000-000000000001';
async function one(sql, args = []) { return (await db.query(sql, args)).rows[0]; }
function check(ok, label) { if (!ok) throw new Error(label); console.log('PASS ' + label); }
async function role(name) {
  await db.query('reset role');
  const profile = await one('select id from profiles where role=$1 and is_active limit 1', [name]);
  if (!profile) throw new Error('Missing role for proof: ' + name);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: profile.id, role: 'authenticated', app_metadata: { app_role: name } })]);
  await db.query('set local role authenticated');
}
async function refusal(sql, args, message) {
  await db.query('savepoint invalid_case');
  let failed = false;
  try { await db.query(sql, args); } catch { failed = true; }
  await db.query('rollback to savepoint invalid_case');
  check(failed, message);
}
await db.connect();
try {
  await db.query('begin');
  if (!live) await db.query(readFileSync(new URL(migration, import.meta.url), 'utf8'));
  if (apply) {
    await db.query('commit');
    console.log('Applied ' + migration);
  } else {
    await role('admin');
    const original = (await db.query('select * from tk_sop_row where sop_id=$1 order by ord', [template])).rows;
    if (checkpoints) {
      const missing = await one("select count(*)::int n from tk_sop_row r left join tk_v_checkpoint c on c.code=r.lab_checkpoint and c.kind='GATE' where r.sop_id=$1 and r.kind='lab_gate' and c.code is null", [template]);
      check(missing.n === 0, 'Every ready-template gate maps to the existing Lab register');
    }
    check(original.length === 43 && original[0].suggested_offset_minutes === -2040, '43 template rows; preparation is 34 hours before batch start');
    check(original.filter(r => r.suggested_offset_minutes == null).length === 2, 'T2 and T3 remain unscheduled until per-pile times are chosen');
    check(original[18].suggested_offset_minutes === 8880, 'Calendar date wins for the 6 Sep 13:00 rest');
    const before = (await one('select count(*)::int n from tk_batch')).n;
    const rows = [
      { ...original[1], title: 'Edited bagasse task', suggested_offset_minutes: 30, photos: 'none' },
      { ...original[5], title: 'Test gate' },
      { ...original[6], title: 'After gate', photos: 'none' },
      { ...original[9], suggested_offset_minutes: -60, photos: 'none' },
      { line: 'Cleaning', title: 'Clean test bunker', kind: 'cleaning', photos: 'none', suggested_offset_minutes: null }
    ];
    const sql = 'select tk_batch_create_plan($1,$2,$3::timestamptz,$4,$5::jsonb) id';
    const args = ['0146 proof ' + Date.now(), template, new Date().toISOString(), 'Proof only', JSON.stringify(rows)];
    const batch = (await one(sql, args)).id;
    const tasks = (await db.query('select * from tk_v_task_v2 where batch_id=$1 order by ord', [batch])).rows;
    check(tasks.length === 5 && tasks.every((t,i) => t.ord === i + 1), 'Only edited rows become tasks, in the selected serial order');
    check(tasks[0].title === rows[0].title && new Date(tasks[0].suggested_at).getTime() - Date.parse(args[2]) === 1800000, 'Edited task and calendar time are saved');
    check(new Date(tasks[3].suggested_at).getTime() - Date.parse(args[2]) === -3600000 && tasks[4].suggested_at === null, 'Pre-start and unscheduled tasks retain their times');
    check(tasks[3].can_start && tasks[4].can_start, 'Paddy and Cleaning remain independent streams');
    await db.query('select tk_done_before($1)', [tasks[0].id]);
    const blocked = await one('select can_start, blocked_by from tk_v_task_v2 where id=$1', [tasks[2].id]);
    check(!blocked.can_start && blocked.blocked_by === 'Test gate', 'GM gate still blocks later work in its stream');
    const after = (await db.query('select * from tk_sop_row where sop_id=$1 order by ord', [template])).rows;
    check(JSON.stringify(original) === JSON.stringify(after), 'Batch customization does not modify the reusable SOP');
    await refusal(sql, [args[0] + ' empty', template, args[2], null, '[]'], 'Empty plans are rejected');
    await refusal(sql, args, 'Duplicate batch creation is rejected');
    await refusal(sql, [args[0] + ' invalid', template, args[2], null, JSON.stringify([{ ...rows[0], suggested_offset_minutes: 'bad' }])], 'Invalid dates roll back the whole batch creation');
    check((await one('select count(*)::int n from tk_batch')).n === before + 1, 'Failed creates leave no partial batches');
    await role('supervisor');
    await refusal(sql, [args[0] + ' denied', template, args[2], null, JSON.stringify(rows)], 'Non-admin cannot customize or create batch plans');
    await db.query('reset role');
    if (!live && !checkpoints) {
      await db.query(readFileSync(new URL('rollback_0146_tasks_ready_template.sql', import.meta.url), 'utf8'));
      check(!!(await one('select id from tk_sop where id=$1', [template])), 'Rollback retains a template referenced by a batch');
      check(!(await one("select to_regprocedure('public.tk_batch_create_plan(text,uuid,timestamptz,text,jsonb)') f")).f, 'Rollback removes the added RPC');
    }
    if (!live && checkpoints) {
      await db.query(readFileSync(new URL('rollback_0147_tasks_template_checkpoints.sql', import.meta.url), 'utf8'));
      check((await one('select lab_checkpoint from tk_sop_row where sop_id=$1 and ord=6', [template])).lab_checkpoint === 'LAB-04', 'Checkpoint rollback restores the source shorthand');
    }
    await db.query('rollback');
    console.log('Proof complete; all test data rolled back.');
  }
} catch (e) { await db.query('rollback'); throw e; }
finally { await db.end(); }
