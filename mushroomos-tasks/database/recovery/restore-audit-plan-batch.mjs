// Restore a Tasks batch whose creation plan survived but whose row IDs/H0 did not.
// Requires an explicitly supplied original H0. Defaults to a rollback-only trial.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const local = createRequire(import.meta.url);
const sibling = createRequire(new URL('../../../mushroomos/package.json', import.meta.url));
function dep(name) { try { return local(name); } catch { return sibling(name); } }
dep('dotenv').config({
  path: existsSync(new URL('../.env.local', import.meta.url))
    ? new URL('../.env.local', import.meta.url)
    : new URL('../../../mushroomos/.env.local', import.meta.url),
  quiet: true,
});
const args = Object.fromEntries(process.argv.slice(2).filter(x => x.startsWith('--') && x.includes('=')).map(x => x.slice(2).split(/=(.*)/s).slice(0,2)));
const commit = process.argv.includes('--commit');
const id = args.batch;
const h0 = args.h0;
if (!id || !h0 || !Number.isFinite(Date.parse(h0))) throw new Error('Pass --batch=<audited batch UUID> and --h0=<original ISO date/time>.');
if (commit && args.test_anchor) throw new Error('Refusing to commit with a test anchor.');
const saved = JSON.parse(await readFile(new URL('./tasks-audit-2026-09-30.json', import.meta.url), 'utf8'));
const create = saved.audit.find(e => e.action === 'tk_batch_create' && e.entity_id === id);
const plan = saved.audit.find(e => e.action === 'tk_batch_plan' && e.entity_id === id);
if (!create || !plan || !Array.isArray(plan.after_state?.rows)) throw new Error('No audited creation plan for that batch.');
if (saved.audit.some(e => e.action === 'tk_batch_plan_edit' && e.entity_id === id)) throw new Error('This batch has a fuller snapshot; use snapshot recovery instead.');
if (!saved.sops.some(s => s.id === plan.after_state.source_sop)) throw new Error('Source SOP is missing.');

const db = new (dep('pg').Client)({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
await db.connect();
let transactionOpen = false;
try {
  await db.query('BEGIN'); transactionOpen = true;
  if (commit) await db.query('LOCK TABLE public.tk_batch, public.tk_task IN SHARE ROW EXCLUSIVE MODE');
  const exists = (await db.query('SELECT id FROM public.tk_batch WHERE id=$1 OR (status=$2 AND lower(name)=lower($3))', [id, 'active', create.after_state.name])).rows;
  if (exists.length) throw new Error(`Batch already exists: ${JSON.stringify(exists)}`);
  const clean = (await db.query('SELECT public.tk_clean_rows($1::jsonb) AS rows', [JSON.stringify(plan.after_state.rows)])).rows[0].rows;
  const raw = plan.after_state.rows.filter(r => String(r.title || '').trim());
  if (clean.length !== raw.length) throw new Error(`Row cleaning changed count: ${raw.length} -> ${clean.length}`);
  const batch = {
    id, name: create.after_state.name, sop_id: plan.after_state.source_sop,
    h0: new Date(h0).toISOString(), status: 'active',
    note: 'Recovered from audit on 30 Sep 2026. Task completion and photos after creation were not preserved; verify before use.',
    created_by: create.actor_id, created_at: create.occurred_at,
  };
  await db.query('INSERT INTO public.tk_batch(id,name,sop_id,h0,status,note,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', Object.values(batch));
  const rows = clean.map((c, i) => {
    const r = raw[i];
    const offset = r.suggested_offset_minutes === null || r.suggested_offset_minutes === undefined || r.suggested_offset_minutes === '' ? null : Number(r.suggested_offset_minutes);
    if (offset !== null && !Number.isInteger(offset)) throw new Error(`Invalid suggested offset at row ${i+1}`);
    return {
      id: randomUUID(), batch_id: id, ord: c.ord, line: c.line, h_ref: c.h_ref,
      title: c.title, kind: c.kind, control: c.control,
      lab_checkpoint: c.lab_checkpoint, photos: c.photos, ask: c.ask,
      suggested_at: offset === null ? null : new Date(Date.parse(h0) + offset * 60000).toISOString(),
      description: r.description || null, pile: r.pile || null, turner_pass: r.turner_pass || null,
      planned_duration_minutes: r.planned_duration_minutes ?? null,
      report_section: r.report_section || null,
      schedule_mode: r.schedule_mode || 'fixed', schedule_gap_minutes: r.schedule_gap_minutes ?? 0,
    };
  });
  const keys = Object.keys(rows[0]);
  const quote = value => `"${value.replaceAll('"', '""')}"`;
  const values = [];
  const places = rows.map(row => '(' + keys.map(key => { values.push(row[key]); return `$${values.length}`; }).join(',') + ')').join(',');
  await db.query(`INSERT INTO public.tk_task (${keys.map(quote).join(',')}) VALUES ${places}`, values);
  const view = (await db.query('SELECT id,name,status,tasks,done,h0 FROM public.tk_v_batch WHERE id=$1', [id])).rows[0];
  if (!view || view.tasks !== rows.length || view.done !== 0) throw new Error(`View verification failed: ${JSON.stringify(view)}`);
  if (commit) await db.query('COMMIT'); else await db.query('ROLLBACK');
  transactionOpen = false;
  console.log(JSON.stringify({ mode: commit ? 'COMMITTED' : 'DRY_RUN_ROLLED_BACK', view, warning: 'Original task IDs and task progress were not in the creation audit. These rows have new IDs and are marked todo.' }, null, 2));
} catch(error) {
  if (transactionOpen) await db.query('ROLLBACK').catch(() => {});
  throw error;
} finally { await db.end(); }
