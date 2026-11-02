import pg from 'pg'; import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env.local', import.meta.url) });
const APPLY = process.argv.includes('--apply');
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false} });
const q = async (s,a=[]) => (await db.query(s,a)).rows;
await db.connect(); await db.query('begin');
try {
  if ((await q(`select 1 from master_batch where code='171,172,173'`)).length) throw new Error('171,172,173 already exists');
  const r = await q(`update master_batch set code='171,172,173', label=case when label='171,172,172' then '171,172,173' else label end where code='171,172,172' and status='active' returning id, code, label, status`);
  if (r.length !== 1) throw new Error('expected exactly one active 171,172,172');
  console.log(r);
  const n = await q(`select count(*)::int n from batch_activity where master_batch_id=$1`, [r[0].id]); console.log('activities untouched:', n[0].n);
  await db.query(APPLY ? 'commit' : 'rollback'); console.log(APPLY ? 'COMMITTED' : 'ROLLED BACK (dry run)');
} catch (e) { await db.query('rollback'); console.error('FAILED, nothing saved:', e.message); process.exitCode = 1; }
await db.end();
