// Read-only comparison of the preserved Storage logs with current live records.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const local = createRequire(import.meta.url);
const sibling = createRequire(new URL('../../../mushroomos/package.json', import.meta.url));
const dep = name => { try { return local(name); } catch { return sibling(name); } };
dep('dotenv').config({
  path: existsSync(new URL('../.env.local', import.meta.url))
    ? new URL('../.env.local', import.meta.url)
    : new URL('../../../mushroomos/.env.local', import.meta.url),
  quiet: true,
});

const encoded = (await readFile(new URL('./photo-logs-24h.b64', import.meta.url), 'utf8')).trim();
const raw = gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
const hash = createHash('sha256').update(raw).digest('hex');
if (hash !== '69fec4fb83fda2e1f2d21454082f27478a2084264abda5e79cb8e397576354f1') {
  throw new Error('Preserved Storage log manifest failed its checksum.');
}
const manifest = JSON.parse(raw).map(([name, version, size, at]) => {
  const parts = name.split('/');
  if (parts.length !== 3 || !/^[0-9a-f-]{36}$/.test(parts[0]) || !/^[0-9a-f-]{36}$/.test(parts[1])) {
    throw new Error('Unexpected photo path in the log manifest.');
  }
  return { name, version, size, at, batchId: parts[0], taskId: parts[1], kind: parts[2].split('-')[0] };
});
if (manifest.length !== 43 || new Set(manifest.map(x => x.name)).size !== 43) throw new Error('Manifest row count changed.');

const db = new (dep('pg').Client)({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 60000,
});
await db.connect();
try {
  await db.query('BEGIN READ ONLY');
  const ids = manifest.map(x => x.name);
  const objects = (await db.query("SELECT name FROM storage.objects WHERE bucket_id='tasks' AND name=ANY($1::text[])", [ids])).rows;
  const photos = (await db.query('SELECT storage_path FROM public.tk_photo WHERE storage_path=ANY($1::text[])', [ids])).rows;
  const tasks = (await db.query('SELECT id,batch_id,title,status FROM public.tk_task WHERE id=ANY($1::uuid[])', [manifest.map(x => x.taskId)])).rows;
  const objectNames = new Set(objects.map(x => x.name));
  const photoNames = new Set(photos.map(x => x.storage_path));
  const taskMap = new Map(tasks.map(x => [x.id, x]));
  const rows = manifest.map(x => ({...x, objectPresent: objectNames.has(x.name), photoPresent: photoNames.has(x.name), taskPresent: taskMap.get(x.taskId)?.batch_id === x.batchId, title: taskMap.get(x.taskId)?.title || null}));
  const summary = rows.reduce((out, x) => {
    const item = out[x.batchId] ||= { total: 0, missingObjects: 0, missingPhotos: 0, matchingTasks: 0 };
    item.total++;
    item.missingObjects += !x.objectPresent;
    item.missingPhotos += !x.photoPresent;
    item.matchingTasks += !!x.taskPresent;
    return out;
  }, {});
  console.log(JSON.stringify({ manifestRows: rows.length, summary, missing: rows.filter(x => !x.objectPresent || !x.photoPresent) }, null, 2));
  await db.query('ROLLBACK');
} finally { await db.end(); }
