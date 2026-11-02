// One-object pilot: reconstruct ONLY the missing Storage index for an audited upload.
// Does not create a tk_photo row, touch existing photos, or delete anything.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const local = createRequire(import.meta.url);
const sibling = createRequire(new URL('../../../mushroomos/package.json', import.meta.url));
const dep = name => { try { return local(name); } catch { return sibling(name); } };
dep('dotenv').config({ path: existsSync(new URL('../.env.local', import.meta.url))
  ? new URL('../.env.local', import.meta.url)
  : new URL('../../../mushroomos/.env.local', import.meta.url), quiet: true });

const raw = gunzipSync(Buffer.from((await readFile(new URL('./photo-logs-24h.b64', import.meta.url), 'utf8')).trim(), 'base64')).toString('utf8');
if (createHash('sha256').update(raw).digest('hex') !== '69fec4fb83fda2e1f2d21454082f27478a2084264abda5e79cb8e397576354f1') throw new Error('Photo manifest checksum mismatch.');
const [name, version, size, at] = JSON.parse(raw)[0];
const [batchId, taskId] = name.split('/');
const commit = process.argv.includes('--commit');
const metadata = {
  eTag: '"224c807eddf7ae3a724ec1fb51796602"',
  size, mimetype: 'image/jpeg', cacheControl: 'no-cache',
  lastModified: new Date(at).toISOString(), contentLength: size, httpStatusCode: 200,
};

const db = new (dep('pg').Client)({ connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }, statement_timeout: 60000 });
await db.connect();
let open = false;
try {
  await db.query('BEGIN'); open = true;
  const task = (await db.query('SELECT id,batch_id,title FROM public.tk_task WHERE id=$1', [taskId])).rows[0];
  if (!task || task.batch_id !== batchId) throw new Error('Audited photo task is not present in its original batch.');
  const prior = (await db.query("SELECT id FROM storage.objects WHERE bucket_id='tasks' AND name=$1", [name])).rows[0];
  if (prior) throw new Error('Storage metadata already exists; pilot refuses to overwrite.');
  const photo = (await db.query('SELECT id FROM public.tk_photo WHERE storage_path=$1', [name])).rows[0];
  if (photo) throw new Error('Photo record already exists; pilot refuses to overwrite.');
  const insert = await db.query(`
    INSERT INTO storage.objects(bucket_id,name,version,metadata,created_at,updated_at)
    VALUES('tasks',$1,$2,$3::jsonb,$4::timestamptz,$4::timestamptz)
    RETURNING id,bucket_id,name,version,(metadata->>'size')::int AS size
  `, [name,version,JSON.stringify(metadata),new Date(at).toISOString()]);
  if (insert.rowCount !== 1) throw new Error('Pilot inserted an unexpected row count.');
  if (commit) await db.query('COMMIT'); else await db.query('ROLLBACK');
  open = false;
  console.log(JSON.stringify({ mode: commit ? 'COMMITTED' : 'DRY_RUN_ROLLED_BACK', task, object: insert.rows[0] }, null, 2));
} catch (error) {
  if (open) await db.query('ROLLBACK').catch(() => {});
  throw error;
} finally { await db.end(); }
