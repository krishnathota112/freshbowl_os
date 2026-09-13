#!/usr/bin/env node
// Apply named migration files, in the order given, inside ONE transaction.
//   node scripts/apply.mjs 0034_baseline_immutability.sql 0035_role_resolution.sql
//
// One transaction on purpose: a half-applied security fix is worse than none.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(root, '.env.local') });

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node scripts/apply.mjs <file.sql> [...]');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 120_000,
});

await client.connect();
console.log(`connected · ${new URL(process.env.SUPABASE_DB_URL).host}\n`);

try {
  await client.query('begin');
  for (const f of files) {
    const sql = readFileSync(join(root, 'supabase', 'migrations', f), 'utf8');
    const t = Date.now();
    await client.query(sql);
    console.log(`  ok    ${f}  ${Date.now() - t} ms`);
  }
  await client.query('commit');
  console.log('\ncommitted');
} catch (e) {
  await client.query('rollback');
  console.error(`\nFAILED — nothing applied\n${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
