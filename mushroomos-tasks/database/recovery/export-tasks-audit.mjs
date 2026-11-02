// Preserve surviving Tasks audit evidence before attempting recovery.
// This script reads the live database but never writes to it.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const local = createRequire(import.meta.url);
const sibling = createRequire(new URL('../../../mushroomos/package.json', import.meta.url));
function dep(name) { try { return local(name); } catch { return sibling(name); } }
dep('dotenv').config({
  path: existsSync(new URL('../.env.local', import.meta.url))
    ? new URL('../.env.local', import.meta.url)
    : new URL('../../../mushroomos/.env.local', import.meta.url),
  quiet: true,
});

const db = new (dep('pg').Client)({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 60000,
});
const outPath = fileURLToPath(new URL('./tasks-audit-2026-09-30.json', import.meta.url));
await db.connect();
try {
  await db.query('BEGIN READ ONLY');
  const audit = (await db.query(`
    SELECT id, occurred_at, actor_id, actor_role, action, entity_table,
           entity_id, before_state, after_state, reason
      FROM public.audit_event
     WHERE action LIKE 'tk_%'
     ORDER BY id
  `)).rows;
  const sops = (await db.query('SELECT * FROM public.tk_sop ORDER BY created_at, id')).rows;
  const sopRows = (await db.query('SELECT * FROM public.tk_sop_row ORDER BY sop_id, ord')).rows;
  const liveCounts = {};
  for (const table of ['tk_batch', 'tk_task', 'tk_photo', 'tk_reading', 'tk_decision']) {
    liveCounts[table] = (await db.query(`SELECT count(*)::int n FROM public.${table}`)).rows[0].n;
  }
  await db.query('ROLLBACK');
  const payload = JSON.stringify({ exportedAt: new Date().toISOString(), liveCounts, audit, sops, sopRows });
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, payload);
  console.log(JSON.stringify({ path: outPath, bytes: Buffer.byteLength(payload), sha256: createHash('sha256').update(payload).digest('hex'), auditEvents: audit.length, sops: sops.length, sopRows: sopRows.length, liveCounts }));
} finally {
  await db.end();
}
