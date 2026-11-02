// Apply only 0145 to the shared Tasks database, in one transaction.
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const localRequire = createRequire(import.meta.url);
const siblingRequire = createRequire(new URL('../../mushroomos/package.json', import.meta.url));
function dependency(name) {
  try { return localRequire(name); } catch { return siblingRequire(name); }
}
const pg = dependency('pg');
const dotenv = dependency('dotenv');
const localEnv = new URL('.env.local', import.meta.url);
const siblingEnv = new URL('../../mushroomos/.env.local', import.meta.url);
if (!process.env.SUPABASE_DB_URL) dotenv.config({ path: existsSync(localEnv) ? localEnv : siblingEnv });
if (!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL is required.');

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
let connected = false;
let inTransaction = false;
try {
  await db.connect();
  connected = true;
  await db.query('begin');
  inTransaction = true;
  const existing = (await db.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='tk_sop' and column_name='reference_h0'")).rows[0].n;
  if (existing) throw new Error('0145 appears already applied; no changes made.');
  await db.query(readFileSync(new URL('0145_tasks_suggested_time.sql', import.meta.url), 'utf8'));
  await db.query('commit');
  inTransaction = false;
  console.log('Applied 0145_tasks_suggested_time.sql.');
} catch (error) {
  if (inTransaction) await db.query('rollback');
  throw error;
} finally {
  if (connected) await db.end();
}
