// Local safety copy of the Tasks records after audit-based recovery.
// Reads the live database; never writes to it.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const local = createRequire(import.meta.url);
const sibling = createRequire(new URL('../../../mushroomos/package.json', import.meta.url));
function dep(name) { try { return local(name); } catch { return sibling(name); } }
dep('dotenv').config({ path: existsSync(new URL('../.env.local', import.meta.url)) ? new URL('../.env.local', import.meta.url) : new URL('../../../mushroomos/.env.local', import.meta.url), quiet: true });
const db = new (dep('pg').Client)({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 60000 });
const outputName = process.argv.find(x => x.startsWith('--output='))?.slice('--output='.length)
  || 'tasks-live-recovered-2026-09-30.json';
if (!/^[a-zA-Z0-9._-]+\.json$/.test(outputName)) throw new Error('Use a simple .json output filename.');
const path = new URL('./' + outputName, import.meta.url);
if (existsSync(path)) throw new Error('Safety copy already exists; refusing to overwrite it.');
await db.connect();
try {
  await db.query('BEGIN READ ONLY');
  const tables = {};
  for (const table of ['tk_sop', 'tk_sop_row', 'tk_batch', 'tk_task', 'tk_photo', 'tk_reading', 'tk_decision']) {
    tables[table] = (await db.query(`SELECT * FROM public.${table} ORDER BY id`)).rows;
  }
  tables['storage.objects:tasks'] = (await db.query("SELECT * FROM storage.objects WHERE bucket_id='tasks' ORDER BY id")).rows;
  await db.query('ROLLBACK');
  const payload = JSON.stringify({ exportedAt: new Date().toISOString(), tables });
  await writeFile(path, payload, { flag: 'wx' });
  console.log(JSON.stringify({ path: path.pathname, bytes: Buffer.byteLength(payload), sha256: createHash('sha256').update(payload).digest('hex'), counts: Object.fromEntries(Object.entries(tables).map(([name,rows]) => [name,rows.length])) }));
} finally { await db.end(); }
