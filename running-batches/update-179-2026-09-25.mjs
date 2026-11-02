// 179,180,181 (stays on PROCESS-2026L — its reported photos are attached there). Owner's sheet 25/09/2026:
// "BUNKER LOADING : 24/09 [1:45 PM] -> BUNKER[14 & 15]". Dry run unless --apply. Run from mushroomos/.
import pg from 'pg'; import dotenv from 'dotenv';
dotenv.config({ path: new URL('../mushroomos/.env.local', import.meta.url) });
const APPLY = process.argv.includes('--apply');
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
const q = async (s, a = []) => (await db.query(s, a)).rows;
const SRC = 'Reported to Admin by the owner on 25/09/2026, factory sheet: "179,180,181 -> BUNKER LOADING : 24/09 [1:45 PM] -> BUNKER[14 & 15]" (all times are starting times)';
await db.connect(); await db.query('begin');
try {
  const b = (await q(`select id from master_batch where code='179,180,181' and status='active'`))[0];
  const id = async (c) => (await q('select id from batch_activity where master_batch_id=$1 and code=$2', [b.id, c]))[0].id;
  const at = async (d, t) => (await q('select factory_instant($1::date,$2::time) t', [d, t]))[0].t;
  const load = await at('2026-09-24', '13:45');
  const loadEnd = new Date(new Date(load).getTime() + 2 * 3600e3);
  await q(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: '8c21e85b-f65c-47c4-8b9f-bdb239e1c52d', role: 'authenticated', app_metadata: { app_role: 'admin' } })]);
  await db.query('set local role authenticated');
  await q(`select admin_record_reported_work($1,$2,$3,'{}'::jsonb,$4)`, [await id('FIB-HEAP'), await at('2026-09-24', '07:30'), load,
    `${SRC}. Heap began 07:30 (24 Sep shift report, already recorded); it ended when bunker loading started at 13:45. Entered by Admin.`]);
  await q(`select admin_record_reported_work($1,$2,$3,'{}'::jsonb,$4)`, [await id('FIB-BUNK-LOAD'), load, loadEnd,
    `${SRC}. Times: end = start + 2 h standard duration (estimated from the SOP, not a clock reading). Bunkers 14 & 15. Entered by Admin.`]);
  await q(`select admin_record_reported_work($1,$2,null,'{}'::jsonb,$3)`, [await id('FIB-COND-1'), loadEnd,
    `${SRC}. Bunker rest (60 h, owner) in Bunkers 14 & 15; start = end of bunker loading (estimated from the SOP). Still running. Entered by Admin.`]);
  // Formulation weights (Batch No 179: paddy 14.7, bagasse 6.3×3 = 18.9, CM 9.2, gypsum 1.65, AS 0.18 t) cannot be added:
  // the server refuses pre-H0 material values on an ACTIVE batch. They go in when 179 is re-loaded on PROCESS-2026M.
  await db.query('reset role');
  console.table(await q(`select code, state::text, to_char(actual_start at time zone 'Asia/Kolkata','DD/MM HH24:MI') s, to_char(actual_end at time zone 'Asia/Kolkata','DD/MM HH24:MI') e from batch_activity where master_batch_id=$1 and (actual_start is not null or state in ('READY','IN_PROGRESS')) order by baseline_start_hour`, [b.id]));
  await db.query(APPLY ? 'commit' : 'rollback'); console.log(APPLY ? 'COMMITTED' : 'ROLLED BACK (dry run)');
} catch (e) { await db.query('rollback'); console.error('FAILED, nothing saved:', e.message); process.exitCode = 1; }
await db.end();
