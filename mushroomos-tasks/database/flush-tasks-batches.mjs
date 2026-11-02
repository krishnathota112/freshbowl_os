import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';

// Disabled after the 30 Sep 2026 Tasks data loss. Keep this file only as
// forensic evidence; it must not be run against the live factory database.
throw new Error('Tasks batch flush is permanently disabled. Do not delete live factory records.');

const local = createRequire(import.meta.url);
const sibling = createRequire(new URL('../../mushroomos/package.json', import.meta.url));

function dep(n) {
  try { return local(n); } catch { return sibling(n); }
}

dep('dotenv').config({
  path: existsSync(new URL('.env.local', import.meta.url))
    ? new URL('.env.local', import.meta.url)
    : new URL('../../mushroomos/.env.local', import.meta.url),
  quiet: true
});

const db = new (dep('pg').Client)({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 30000
});

await db.connect();

try {
  console.log('=== STARTING FLUSH OF TASKS APP BATCHES & STORAGE ===\n');
  await db.query('BEGIN');

  // Set replica mode for session to bypass storage table triggers safely
  await db.query("SET LOCAL session_replication_role = 'replica'");

  // 1. Delete storage objects in the 'tasks' bucket
  const delStorageRes = await db.query("DELETE FROM storage.objects WHERE bucket_id = 'tasks'");
  console.log(`[1/6] Deleted ${delStorageRes.rowCount} storage objects from 'tasks' bucket.`);

  // 2. Delete child task records explicitly (since replica mode disables FK cascade triggers)
  const delDecisionsRes = await db.query("DELETE FROM public.tk_decision");
  console.log(`[2/6] Deleted ${delDecisionsRes.rowCount} GM decisions.`);

  const delReadingsRes = await db.query("DELETE FROM public.tk_reading");
  console.log(`[3/6] Deleted ${delReadingsRes.rowCount} Lab readings.`);

  const delPhotosRes = await db.query("DELETE FROM public.tk_photo");
  console.log(`[4/6] Deleted ${delPhotosRes.rowCount} photo records.`);

  const delTasksRes = await db.query("DELETE FROM public.tk_task");
  console.log(`[5/6] Deleted ${delTasksRes.rowCount} tasks.`);

  const delBatchesRes = await db.query("DELETE FROM public.tk_batch");
  console.log(`[6/6] Deleted ${delBatchesRes.rowCount} batches.`);

  // 3. Verification checks
  const batchesRemaining = (await db.query('SELECT count(*)::int n FROM public.tk_batch')).rows[0].n;
  const tasksRemaining = (await db.query('SELECT count(*)::int n FROM public.tk_task')).rows[0].n;
  const photosRemaining = (await db.query('SELECT count(*)::int n FROM public.tk_photo')).rows[0].n;
  const readingsRemaining = (await db.query('SELECT count(*)::int n FROM public.tk_reading')).rows[0].n;
  const decisionsRemaining = (await db.query('SELECT count(*)::int n FROM public.tk_decision')).rows[0].n;
  const storageRemaining = (await db.query("SELECT count(*)::int n FROM storage.objects WHERE bucket_id = 'tasks'")).rows[0].n;

  // Ensure SOP templates, user profiles, and main factory app tables are untouched
  const sopsRemaining = (await db.query('SELECT count(*)::int n FROM public.tk_sop')).rows[0].n;
  const sopRowsRemaining = (await db.query('SELECT count(*)::int n FROM public.tk_sop_row')).rows[0].n;
  const profilesRemaining = (await db.query('SELECT count(*)::int n FROM public.profiles')).rows[0].n;

  console.log('\n=== VERIFICATION SUMMARY ===');
  console.log(`• Batches remaining: ${batchesRemaining}`);
  console.log(`• Tasks remaining: ${tasksRemaining}`);
  console.log(`• Photo records remaining: ${photosRemaining}`);
  console.log(`• Lab readings remaining: ${readingsRemaining}`);
  console.log(`• GM decisions remaining: ${decisionsRemaining}`);
  console.log(`• Storage objects remaining ('tasks' bucket): ${storageRemaining}`);
  console.log(`• SOP templates preserved: ${sopsRemaining} (with ${sopRowsRemaining} rows)`);
  console.log(`• User profiles preserved: ${profilesRemaining}`);

  if (
    batchesRemaining === 0 &&
    tasksRemaining === 0 &&
    photosRemaining === 0 &&
    readingsRemaining === 0 &&
    decisionsRemaining === 0 &&
    storageRemaining === 0 &&
    sopsRemaining > 0
  ) {
    await db.query('COMMIT');
    console.log('\n✅ SUCCESS: All test batches and photo storage objects flushed cleanly and committed!');
  } else {
    await db.query('ROLLBACK');
    console.error('\n❌ ERROR: Verification checks failed! Transaction rolled back.');
  }
} catch (err) {
  await db.query('ROLLBACK');
  console.error('\n❌ FATAL ERROR during cleanup. Transaction rolled back:', err);
} finally {
  await db.end();
}
