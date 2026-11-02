#!/usr/bin/env node
/**
 * Removes every master batch except the ones named in KEEP.
 *
 *   node scripts/clean-demo-data.mjs            # dry run — counts only, changes nothing
 *   node scripts/clean-demo-data.mjs --apply    # actually deletes
 *
 * WHY A HARD DELETE AND NOT `cancel_batch`.
 *   Cancelling is the factory's answer to "this batch must not run" and it is deliberately
 *   one-way — the row stays, and the Batches screen keeps listing it. 102 rows had already been
 *   cancelled and all 102 were still on screen. What was wanted here is not a cancellation, it is
 *   the removal of test fixtures that never described anything real. `clean-batches.mjs` already
 *   set the precedent for deleting throwaway rows outright.
 *
 *   Everything under a batch cascades (batch_activity, evidence_media, lab_sample, deviation,
 *   location_occupancy, …) EXCEPT `monthly_schedule_group`, which is ON DELETE RESTRICT — so the
 *   link is cleared first, deliberately and visibly, rather than discovered as a failure.
 *
 * WHAT THIS DOES NOT TOUCH
 *   Objects already in the `evidence` storage bucket. The rows that pointed at them are gone, so
 *   they are unreachable from the application; they are still bytes in the bucket.
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
const env = {};
for (const l of raw.split('\n')) {
  const t = l.trim(); if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('='); if (i < 0) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const KEEP = (process.env.KEEP ?? 'BATCHexp').split(',').map((s) => s.trim()).filter(Boolean);
const APPLY = process.argv.includes('--apply');

const c = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 300_000 });
await c.connect();

const { rows: doomed } = await c.query(
  `select id, code, status::text as status, label from master_batch where code <> all($1) order by status::text, code`, [KEEP]);
const { rows: kept } = await c.query(
  `select code, status::text as status from master_batch where code = any($1) order by code`, [KEEP]);

console.log(`KEEP (${kept.length}): ${kept.map((k) => `${k.code}/${k.status}`).join(', ') || '— none matched —'}`);
console.log(`DELETE (${doomed.length}):`);
const byStatus = {};
for (const d of doomed) byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
console.log('  by status: ' + Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(' · '));
for (const d of doomed.filter((x) => x.status !== 'cancelled')) console.log(`  ${d.status.padEnd(9)} ${d.code.padEnd(20)} ${(d.label ?? '').slice(0, 44)}`);
if (doomed.some((x) => x.status === 'cancelled')) console.log(`  (+ ${byStatus.cancelled} cancelled test fixtures, not listed)`);

const { rows: [pre] } = await c.query(
  `select (select count(*) from batch_activity) a, (select count(*) from evidence_media) e, (select count(*) from lab_sample) l`);
console.log(`\nbefore: ${pre.a} batch_activity · ${pre.e} evidence_media · ${pre.l} lab_sample`);

if (!APPLY) { console.log('\nDRY RUN — nothing changed. Re-run with --apply to delete.'); await c.end(); process.exit(0); }
if (kept.length === 0) { console.error('\nREFUSING: none of the KEEP codes exist. That would delete everything.'); await c.end(); process.exit(1); }

/*
 * A BATCH CARRYING A CORRECTION CANNOT BE DELETED, AND THAT IS THE POINT.
 *
 * `trg_correction_is_append_only` fires BEFORE DELETE on `actual_correction` and refuses — so the
 * cascade from `master_batch` dies with "a correction of a correction is another correction". It
 * refuses the table owner too; CLAUDE.md's rule 2 is enforced here, not merely intended.
 *
 * Getting past it would mean disabling an append-only audit guard to destroy audit rows, which is
 * the exact thing the product exists to make hard. So those batches are SKIPPED and named. Four
 * cancelled fixtures left on screen is a much smaller problem than a precedent for switching that
 * trigger off.
 */
const { rows: protectedRows } = await c.query(
  `select distinct mb.code from actual_correction ac join master_batch mb on mb.id = ac.master_batch_id
    where mb.code <> all($1) order by 1`, [KEEP]);
const SKIP = [...KEEP, ...protectedRows.map((r) => r.code)];
if (protectedRows.length) {
  console.log(`
skipping ${protectedRows.length} batch(es) that carry an append-only correction:`);
  console.log('  ' + protectedRows.map((r) => r.code).join(', '));
  console.log('  (deleting these would mean disabling trg_correction_is_append_only)');
}

await c.query('begin');
const sg = await c.query(`delete from monthly_schedule_group where master_batch_id in (select id from master_batch where code <> all($1)) returning id`, [SKIP]);
const del = await c.query(`delete from master_batch where code <> all($1) returning code`, [SKIP]);
await c.query('commit');

const { rows: [post] } = await c.query(
  `select (select count(*) from batch_activity) a, (select count(*) from evidence_media) e, (select count(*) from lab_sample) l, (select count(*) from master_batch) b`);
console.log(`\ncleared ${sg.rowCount} monthly_schedule_group link(s)`);
console.log(`deleted ${del.rowCount} batch(es)`);
console.log(`after:  ${post.a} batch_activity · ${post.e} evidence_media · ${post.l} lab_sample · ${post.b} master_batch`);
const { rows: left } = await c.query(`select code, status::text as status from master_batch order by code`);
console.log('remaining: ' + left.map((x) => `${x.code}/${x.status}`).join(', '));
await c.end();
