// Places every running batch's CURRENT step in the bunker(s)/tunnel(s) the factory board and the owner's 25/09/2026 sheet
// name (0134 allocate_vessels). Dry run (rolled back) unless --apply. `--with-migration <sql>` (dry run only) loads 0134 first.
// Run from mushroomos/:  node ../running-batches/place-vessels-2026-09-25.mjs [--apply]
import { readFileSync } from 'node:fs';
import pg from 'pg'; import dotenv from 'dotenv';
dotenv.config({ path: new URL('../mushroomos/.env.local', import.meta.url) });
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const MIG = args.includes('--with-migration') ? args[args.indexOf('--with-migration') + 1] : null;
if (APPLY && MIG) throw new Error('--with-migration is for dry runs only');
const SRC = 'Factory board (bunkers 1–17, tunnels 1–12) and the owner\'s factory sheet, 25/09/2026';
// [batch, step, vessels, since (optional: when the material entered THIS vessel), note]
const PLACE = [
  ['155,156,157', 'TN-B1-COOL-2', ['TUNNEL-04'], null, '155 venting in Tunnel 4'],
  ['155,156,157', 'TN-B3-COOL-2', ['TUNNEL-02'], null, '157 venting in Tunnel 2'],
  ['155,156,157', 'TUN-DISCHARGE-2', ['TUNNEL-10'], null, '156 unloaded from Tunnel 10 on 25/09 (goes to the growing room)'],
  ['158,159,160', 'TN-B1-COND-2', ['TUNNEL-07'], null, '158 in Tunnel 7'],
  ['158,159,160', 'TN-B2-COND-2', ['TUNNEL-09'], null, '159 in Tunnel 9'],
  ['158,159,160', 'TN-B3-COND-2', ['TUNNEL-03'], null, '160 in Tunnel 3'],
  ['161,162,163', 'TN-B1-COND-2', ['TUNNEL-05'], null, '161 in Tunnel 5'],
  ['161,162,163', 'TN-B2-HEAT', ['TUNNEL-11'], null, '162 in Tunnel 11'],
  ['161,162,163', 'TN-B3-COND-2', ['TUNNEL-06'], null, '163 in Tunnel 6'],
  ['164,165,166', 'BNK-B1-HOLD-2', ['BUNKER-11'], null, '164 in Bunker 11'],
  ['164,165,166', 'BNK-B3-HOLD-2', ['BUNKER-08'], null, '166 in Bunker 8'],
  ['164,165,166', 'TN-B2-LEVEL', ['TUNNEL-01'], null, '165 in Tunnel 1 (loaded 25/09 14:00 from Bunker 7)'],
  ['167,168,169', 'BNK-B1-HOLD-1', ['BUNKER-09'], '2026-09-24 11:00+05:30', '167 shifted Bunker 6 → Bunker 9 on 24/09 11:00'],
  ['167,168,169', 'BNK-B2-HOLD-2', ['BUNKER-10'], null, '168 reloaded Bunker 10 → 10 on 25/09 10:30'],
  ['167,168,169', 'BNK-B3-RELOAD', ['BUNKER-07'], null, '169 reloading Bunker 13 → 7 since 25/09 16:50'],
  ['170,171,172', 'BNK-B1-HOLD-1', ['BUNKER-12'], null, '170 in Bunker 12'],
  ['170,171,172', 'BNK-B2-HOLD-1', ['BUNKER-05'], null, '171 in Bunker 5'],
  ['170,171,172', 'BNK-B3-HOLD-1', ['BUNKER-06'], null, '172 in Bunker 6'],
  ['176,177,178', 'FIB-COND-1', ['BUNKER-03', 'BUNKER-04'], null, 'bagasse resting in Bunkers 3 & 4'],
  ['179,180,181', 'FIB-COND-1', ['BUNKER-14', 'BUNKER-15'], null, 'bagasse resting in Bunkers 14 & 15'],
];
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
const q = async (s, a = []) => (await db.query(s, a)).rows;
await db.connect(); await db.query('begin');
try {
  if (MIG) await db.query(readFileSync(MIG, 'utf8'));
  for (const [code, step, vessels, since, note] of PLACE) {
    const act = (await q(`select a.id from batch_activity a join master_batch b on b.id=a.master_batch_id where b.code=$1 and b.status='active' and a.code=$2`, [code, step]))[0];
    if (!act) throw new Error(`${code} ${step}: no such active step`);
    const locs = (await q(`select id from location where code = any($1)`, [vessels])).map((r) => r.id);
    if (locs.length !== vessels.length) throw new Error(`${code}: unknown vessel in ${vessels}`);
    await q(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: '8c21e85b-f65c-47c4-8b9f-bdb239e1c52d', role: 'authenticated', app_metadata: { app_role: 'admin' } })]);
    await db.query('set local role authenticated');
    await q('select allocate_vessels($1,$2::uuid[],$3,$4)', [act.id, locs, `${note} — ${SRC}. Entered by Admin.`, since]);
    await db.query('reset role');
  }
  const rows = await q(`select label, kind, occupied_by_batch, to_char(occupied_since at time zone 'Asia/Kolkata','DD/MM HH24:MI') since, is_ready, not_ready_reason
                          from v_vessel_readiness where kind in ('BUNKER','TUNNEL') order by kind, code`);
  for (const r of rows) console.log(`${r.label.padEnd(10)} ${r.is_ready ? 'READY' : '     '}  ${r.occupied_by_batch ? `in use by ${r.occupied_by_batch} since ${r.since}` : (r.not_ready_reason ?? 'free')}`);
  const needs = await q(`select batch_code, activity_code, needs_kind, to_char(needed_at at time zone 'Asia/Kolkata','DD/MM HH24:MI') at from v_resource_need order by needed_at`);
  console.log(`\n"What the batches will need": ${needs.length} rows`); for (const n of needs) console.log(`  ${n.batch_code}  ${n.activity_code}  needs ${n.needs_kind}  ~${n.at}`);
  await db.query(APPLY ? 'commit' : 'rollback'); console.log(APPLY ? '\nCOMMITTED' : '\nROLLED BACK (dry run)');
} catch (e) { await db.query('rollback'); console.error('FAILED, nothing saved:', e.message); process.exitCode = 1; }
await db.end();
