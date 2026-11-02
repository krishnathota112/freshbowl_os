import pg from 'pg'; import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env.local', import.meta.url) });
const APPLY = process.argv.includes('--apply');
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false} });
const q = async (s,a=[]) => (await db.query(s,a)).rows;
await db.connect(); await db.query('begin');
try {
  const b = (await q(`select id from master_batch where code='155,156,157' and status='active'`))[0];
  const act = (await q(`select id from batch_activity where master_batch_id=$1 and code='TN-COOL-2'`, [b.id]))[0];
  const at = (await q(`select factory_instant('2026-09-24','10:00') t`))[0].t;
  await q(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub:'8c21e85b-f65c-47c4-8b9f-bdb239e1c52d', role:'authenticated', app_metadata:{ app_role:'admin' } })]);
  await db.query('set local role authenticated');
  await q(`select admin_record_reported_work($1,$2,null,'{}'::jsonb,$3)`, [act.id, at,
    'Reported to Admin by the owner on 25/09/2026: venting/cooling started 24/09/2026 10:00 for 155 (Tunnel 4) and 24/09/2026 20:00 for 157 (Tunnel 2). The process has one tunnel chain per batch, so the first start (155, 10:00) is entered; 157 started 10 h later. 156 (Tunnel 10) is out of the tunnel since the 25/09/2026 07:00 unloading. Still running, so no finish is claimed. Entered by Admin; nothing was recorded in the app at the time.']);
  await db.query('reset role');
  await q(`update master_batch set label=$2 where id=$1`, [b.id, 'Local paddy · 155 = Tunnel 4 · 156 = Tunnel 10 (unloaded 25/09) · 157 = Tunnel 2']);
  const rows = await q(`select code, state::text, to_char(actual_start at time zone 'Asia/Kolkata','DD/MM HH24:MI') s, to_char(planned_start_at at time zone 'Asia/Kolkata','DD/MM HH24:MI') p, blocked_reason from batch_activity where master_batch_id=$1 and not before_tracking order by planned_start_at`, [b.id]);
  console.table(rows);
  await db.query(APPLY ? 'commit' : 'rollback'); console.log(APPLY ? 'COMMITTED' : 'ROLLED BACK (dry run)');
} catch (e) { await db.query('rollback'); console.error('FAILED, nothing saved:', e.message); process.exitCode = 1; }
await db.end();
