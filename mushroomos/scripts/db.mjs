#!/usr/bin/env node
// Applies migrations then seeds, in filename order, against SUPABASE_DB_URL.
// Migrations are forward-only. Seeds are idempotent, so re-running is safe.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
dotenv.config({ path: join(root, '.env.local') });

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('SUPABASE_DB_URL is not set in .env.local');
  process.exit(1);
}

// F49: this runner has no ledger and re-executes every file, so it must never reach a shared database.
const host = new URL(url).hostname;
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  console.error(
    `Refusing to run: SUPABASE_DB_URL points at ${host}.\n` +
      'This script re-runs every migration and seed and keeps no record of what already ran (F49).\n' +
      'For the local stack use `npx supabase db reset`. Apply a reviewed migration to a shared\n' +
      'database one file at a time with scripts/apply.mjs.'
  );
  process.exit(1);
}

const only = process.argv[2]; // 'migrations' | 'seed' | undefined = both

function filesIn(dir) {
  try {
    return readdirSync(join(root, 'supabase', dir))
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch {
    return [];
  }
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 120_000,
});

const phases = only ? [only] : ['migrations', 'seed'];

try {
  await client.connect();
  console.log(`connected · ${new URL(url).host}\n`);

  for (const phase of phases) {
    const files = filesIn(phase);
    if (files.length === 0) {
      console.log(`${phase}: no files`);
      continue;
    }
    console.log(`── ${phase} ──`);
    for (const file of files) {
      const sql = readFileSync(join(root, 'supabase', phase, file), 'utf8');
      const started = Date.now();
      try {
        await client.query(sql);
        console.log(`  ok    ${file}  ${Date.now() - started} ms`);
      } catch (e) {
        console.error(`  FAIL  ${file}`);
        console.error(`        ${e.message}`);
        if (e.position) {
          const pos = Number(e.position);
          const around = sql.slice(Math.max(0, pos - 200), pos + 200);
          console.error(`        near: ...${around.replace(/\s+/g, ' ')}...`);
        }
        process.exit(1);
      }
    }
    console.log('');
  }
  console.log('done');
} catch (e) {
  console.error(`connection failed: ${e.message}`);
  console.error(
    '\nIf this is a DNS or network error, the direct Postgres host may be IPv6-only.\n' +
      'Use the Supabase connection pooler host instead (Project Settings > Database >\n' +
      'Connection pooling), and put that URI in SUPABASE_DB_URL.'
  );
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
