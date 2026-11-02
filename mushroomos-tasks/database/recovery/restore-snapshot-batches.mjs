// Reconstruct batches with complete batch/task audit snapshots.
// Defaults to a rollback-only trial. Pass --commit only after reviewing trial output.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const local = createRequire(import.meta.url);
const sibling = createRequire(new URL('../../../mushroomos/package.json', import.meta.url));
function dep(name) { try { return local(name); } catch { return sibling(name); } }
dep('dotenv').config({
  path: existsSync(new URL('../.env.local', import.meta.url))
    ? new URL('../.env.local', import.meta.url)
    : new URL('../../../mushroomos/.env.local', import.meta.url),
  quiet: true,
});

const commit = process.argv.includes('--commit');
const ids = [
  '2319a416-657e-43f8-adf0-f14e4afcffd4', // 173,174,175
  '5054bdb7-c66f-408a-9b57-fbd50eb99756', // 176,177,178
  '0448c5ce-b37f-4f35-b66c-b6ecb18c8b72', // 179,180,181
  '143ba35e-c6ab-428b-beca-16a1de195e0f', // 182
];
const saved = JSON.parse(await readFile(new URL('./tasks-audit-2026-09-30.json', import.meta.url), 'utf8'));
const events = saved.audit;

const restore = [];
for (const id of ids) {
  const edit = events.filter(e => e.action === 'tk_batch_plan_edit' && e.entity_id === id).at(-1);
  if (!edit?.after_state?.after?.batch || !Array.isArray(edit.after_state.after.rows)) throw new Error(`No complete snapshot for ${id}`);
  const batch = structuredClone(edit.after_state.after.batch);
  const rows = edit.after_state.after.rows.map(r => { const row = structuredClone(r); delete row._locked; return row; });
  if (batch.id !== id || rows.some(r => r.batch_id !== id)) throw new Error(`Snapshot identity mismatch for ${id}`);
  const rowMap = new Map(rows.map(r => [r.id, r]));
  if (rowMap.size !== rows.length) throw new Error(`Duplicate task IDs in ${id}`);
  const later = events.filter(e => e.entity_table === 'tk_task' && rowMap.has(e.entity_id) && Date.parse(e.occurred_at) > Date.parse(edit.occurred_at));
  for (const e of later) {
    const r = rowMap.get(e.entity_id);
    if (e.action === 'tk_done_before') {
      const eligible = rows.filter(x => x.line === r.line && x.ord <= r.ord && ['todo', 'returned'].includes(x.status));
      const count = e.after_state?.rows;
      if (eligible.length !== count) throw new Error(`Catch-up count mismatch in ${batch.name}: expected ${count}, found ${eligible.length}`);
      for (const x of eligible) x.status = 'done_before';
    } else if (e.action === 'tk_start') {
      if (r.status !== 'todo') throw new Error(`Start state mismatch in ${batch.name}, task ${r.id}: ${r.status}`);
      r.status = 'running';
      r.started_at = e.occurred_at;
      r.started_by = e.actor_id;
      r.start_source = 'app';
    } else if (e.action === 'tk_finish') {
      if (r.status !== 'running') throw new Error(`Finish state mismatch in ${batch.name}, task ${r.id}: ${r.status}`);
      r.status = 'done';
      r.ended_at = e.occurred_at;
      r.ended_by = e.actor_id;
      r.answer = e.after_state?.answer?.trim() || null;
    } else {
      throw new Error(`Unhandled post-snapshot action ${e.action} in ${batch.name}`);
    }
  }
  restore.push({ batch, rows, snapshotAt: edit.occurred_at, replayed: later.length });
}

const db = new (dep('pg').Client)({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
await db.connect();
let transactionOpen = false;
try {
  await db.query('BEGIN'); transactionOpen = true;
  if (commit) await db.query('LOCK TABLE public.tk_batch, public.tk_task IN SHARE ROW EXCLUSIVE MODE');
  const counts = {};
  for (const table of ['tk_batch', 'tk_task', 'tk_photo', 'tk_reading', 'tk_decision']) {
    counts[table] = (await db.query(`SELECT count(*)::int n FROM public.${table}`)).rows[0].n;
  }
  if (Object.values(counts).some(n => n !== 0)) throw new Error(`Live Tasks tables changed; refusing restore: ${JSON.stringify(counts)}`);
  const maxLiveId = (await db.query("SELECT max(id)::text id FROM public.audit_event WHERE entity_table IN ('tk_batch','tk_task') AND action LIKE 'tk_%'")).rows[0].id;
  const maxSavedId = events.filter(e => ['tk_batch','tk_task'].includes(e.entity_table)).at(-1)?.id;
  if (maxLiveId !== maxSavedId) throw new Error(`New batch/task audit activity since export: live ${maxLiveId}, saved ${maxSavedId}`);

  const columnInfo = {};
  for (const table of ['tk_batch', 'tk_task']) {
    const result = await db.query("SELECT column_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [table]);
    columnInfo[table] = new Map(result.rows.map(r => [r.column_name, r]));
  }
  function project(table, row) {
    const projected = {};
    for (const [key, value] of Object.entries(row)) {
      const info = columnInfo[table].get(key);
      if (!info) continue;
      if (value === null && info.is_nullable === 'NO' && info.column_default) continue;
      projected[key] = value;
    }
    return projected;
  }
  async function insertRows(table, rows) {
    const groups = new Map();
    for (const original of rows) {
      const row = project(table, original);
      const keys = Object.keys(row).sort();
      const signature = keys.join('|');
      if (!groups.has(signature)) groups.set(signature, { keys, rows: [] });
      groups.get(signature).rows.push(row);
    }
    for (const {keys,rows: group} of groups.values()) {
      const quote = value => `"${value.replaceAll('"', '""')}"`;
      const names = keys.map(quote).join(',');
      const values = [];
      const places = group.map(row => '(' + keys.map(key => { values.push(row[key]); return `$${values.length}`; }).join(',') + ')').join(',');
      await db.query(`INSERT INTO public.${table} (${names}) VALUES ${places}`, values);
    }
  }
  await insertRows('tk_batch', restore.map(x => x.batch));
  await insertRows('tk_task', restore.flatMap(x => x.rows));
  const after = {};
  for (const table of ['tk_batch', 'tk_task']) after[table] = (await db.query(`SELECT count(*)::int n FROM public.${table}`)).rows[0].n;
  const expectedTasks = restore.reduce((sum, x) => sum + x.rows.length, 0);
  if (after.tk_batch !== restore.length || after.tk_task !== expectedTasks) throw new Error(`Verification mismatch: ${JSON.stringify(after)}`);
  const report = restore.map(x => ({ name: x.batch.name, id: x.batch.id, rows: x.rows.length, status: x.rows.reduce((o,r) => { o[r.status] = (o[r.status] || 0) + 1; return o; }, {}), snapshotAt: x.snapshotAt, replayedEvents: x.replayed }));
  if (commit) await db.query('COMMIT'); else await db.query('ROLLBACK');
  transactionOpen = false;
  console.log(JSON.stringify({ mode: commit ? 'COMMITTED' : 'DRY_RUN_ROLLED_BACK', after, report, caveat: 'Photo metadata/files and post-snapshot unlogged notes are not included.' }, null, 2));
} catch (error) {
  if (transactionOpen) await db.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await db.end();
}
