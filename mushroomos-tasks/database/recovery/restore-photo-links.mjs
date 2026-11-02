// Rebuild missing Tasks photo indexes from checksum-verified Storage upload logs.
// Exact existing batch/task IDs only; never overwrite or delete live data.
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
if (createHash('sha256').update(raw).digest('hex') !== '69fec4fb83fda2e1f2d21454082f27478a2084264abda5e79cb8e397576354f1') {
  throw new Error('Photo manifest checksum mismatch.');
}
const manifest = JSON.parse(raw).map(([name, version, size, at]) => {
  const match = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\/(before|after|lab|other)-\d+\.jpe?g$/.exec(name);
  if (!match || !/^[0-9a-f-]{36}$/.test(version) || !Number.isSafeInteger(size) || size <= 0 || !Number.isFinite(Date.parse(at))) {
    throw new Error('Malformed photo manifest row.');
  }
  return { name, version, size, at, batchId: match[1], taskId: match[2], kind: match[3] };
});
if (manifest.length !== 43 || new Set(manifest.map(x => x.name)).size !== 43) throw new Error('Unexpected manifest count.');

const stage = process.argv.find(x => x.startsWith('--stage='))?.slice(8);
const commit = process.argv.includes('--commit');
const includeOrphanObjects = process.argv.includes('--include-orphan-objects');
if (!['metadata', 'photos'].includes(stage)) throw new Error('Choose --stage=metadata or --stage=photos.');
if (includeOrphanObjects && stage !== 'metadata') throw new Error('Orphan objects can only be restored as metadata, never attached to a guessed task.');

const db = new (dep('pg').Client)({ connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }, statement_timeout: 60000 });
await db.connect();
let open = false;
try {
  await db.query('BEGIN'); open = true;
  const summary = { mode: commit ? 'COMMITTED' : 'DRY_RUN_ROLLED_BACK', stage,
    inserted: 0, alreadyPresent: 0, skippedMissingTask: 0, skippedMissingObject: 0,
    byBatch: {} };
  for (const item of manifest) {
    const task = (await db.query('SELECT batch_id FROM public.tk_task WHERE id=$1', [item.taskId])).rows[0];
    if (!task || task.batch_id !== item.batchId) {
      if (!(includeOrphanObjects && item.batchId === 'e9c10c1a-8853-48da-9a47-fc49ba9fa25a')) {
        summary.skippedMissingTask++; continue;
      }
    }
    const counter = summary.byBatch[item.batchId] ||= { inserted: 0, alreadyPresent: 0 };
    if (stage === 'metadata') {
      const prior = (await db.query("SELECT id FROM storage.objects WHERE bucket_id='tasks' AND name=$1", [item.name])).rows[0];
      if (prior) { summary.alreadyPresent++; counter.alreadyPresent++; continue; }
      const metadata = {
        size: item.size, mimetype: 'image/jpeg', cacheControl: 'no-cache',
        lastModified: new Date(item.at).toISOString(), contentLength: item.size, httpStatusCode: 200,
      };
      const result = await db.query(`
        INSERT INTO storage.objects(bucket_id,name,version,metadata,created_at,updated_at)
        VALUES('tasks',$1,$2,$3::jsonb,$4::timestamptz,$4::timestamptz)
        ON CONFLICT DO NOTHING RETURNING id
      `, [item.name, item.version, JSON.stringify(metadata), new Date(item.at).toISOString()]);
      if (result.rowCount) { summary.inserted++; counter.inserted++; }
      else { summary.alreadyPresent++; counter.alreadyPresent++; }
    } else {
      const object = (await db.query("SELECT (metadata->>'size')::bigint AS size FROM storage.objects WHERE bucket_id='tasks' AND name=$1", [item.name])).rows[0];
      if (!object || Number(object.size) !== item.size) { summary.skippedMissingObject++; continue; }
      const result = await db.query(`
        INSERT INTO public.tk_photo(task_id,kind,storage_path,taken_at)
        VALUES($1,$2,$3,$4::timestamptz)
        ON CONFLICT (storage_path) DO NOTHING RETURNING id
      `, [item.taskId, item.kind, item.name, new Date(item.at).toISOString()]);
      if (result.rowCount) { summary.inserted++; counter.inserted++; }
      else { summary.alreadyPresent++; counter.alreadyPresent++; }
    }
  }
  if (commit) await db.query('COMMIT'); else await db.query('ROLLBACK');
  open = false;
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  if (open) await db.query('ROLLBACK').catch(() => {});
  throw error;
} finally { await db.end(); }
