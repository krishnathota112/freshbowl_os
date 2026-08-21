#!/usr/bin/env node
// Removes throwaway batches created by the smoke tests.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local') });
const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const r = await c.query(
  `delete from master_batch
    where code like 'SMOKE-%' or code like 'UI-%' or code like 'SB-%'
    returning code`
);
console.log(`removed ${r.rowCount} test batch(es): ${r.rows.map((x) => x.code).join(', ') || '—'}`);
const left = await c.query(`select code, status from master_batch order by created_at`);
console.log('remaining:', left.rows.map((x) => `${x.code}/${x.status}`).join(', ') || 'none');
await c.end();
