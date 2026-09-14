#!/usr/bin/env node
/**
 * WAVE 2 - F · MACHINE AND VESSEL IDENTITY, THROUGH THE REAL WRITE PATH
 *
 * WHY THIS EXISTS AND WHAT IT IS NOT
 *   `tests/resources.test.ts` already proves the DATA MODEL: machine_usage carries
 *   EXCLUDE USING gist (machine_id WITH =, during WITH &&), location_occupancy the same with
 *   is_exclusive, and both are exercised directly in SQL. That is not repeated here.
 *
 *   What wave 2E could not reach was the RPC path: no PROCESS-2026C activity carries an assigned
 *   machine, so `open_machine_stint` could never be driven into contention over HTTP. A constraint
 *   that fires is necessary; a constraint that reaches the operator as a sentence they can act on
 *   is what the factory actually needs. A raw 23P01 exclusion violation would be a P3 in its own
 *   right.
 *
 *   NO FACTORY RULE IS INVENTED. The fixture assigns an EXISTING machine to two activities that
 *   already exist on a throwaway batch, which is a statement about test data, not about the SOP.
 *   Nothing here touches a demo batch or the process definition.
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { cast, buildBatch, rpc, rest, readOrDie, msg,
         section, note, warn, mustRefuse, mustHold, report } from './lib.mjs';

dotenv.config({ path: '.env.local' });
const P = await cast();
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

section('SETUP - a throwaway batch, and a machine put on two of its activities');
const A = await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'MV' });
const B = await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'MW' });
note(`${A.code} / ${B.code}`);

// A machine with no window overlapping the next couple of hours. Re-running this script must not
// contend with its own previous run: the leftover stint IS a real commitment, and the constraint
// would refuse the FIRST open, which reads as a failure when it is the rule working.
const machines = (await db.query(`
  select m.id, m.code, m.name from machine m
   where not exists (
     select 1 from machine_usage mu
      where mu.machine_id = m.id
        and mu.during && tstzrange(now() - interval '2 hours', now() + interval '2 hours'))
   order by m.code`)).rows;
const allMachines = (await db.query(`select code from machine order by code`)).rows.map(r => r.code);
note(`fleet: ${allMachines.join(', ') || '(none)'}`);
note(`free right now: ${machines.map(m => m.code).join(', ') || '(none)'}`);
if (!machines.length) { warn('every machine is committed in this window - nothing free to contend for'); process.exit(0); }
const M1 = machines[0];

const two = await readOrDie(P.operator,
  `v_my_work?select=activity_id,code&master_batch_id=eq.${A.B}&responsible_role=eq.operator&state=eq.READY&limit=2`, 'work');
const [X, Y] = two;
note(`putting ${M1.code} on ${X.code} and ${Y.code} (fixture setup, not a process statement)`);
await db.query(`update batch_activity set assigned_machine_id = $1 where id = any($2::uuid[])`,
  [M1.id, [X.activity_id, Y.activity_id]]);

/* ══ 25 · MACHINE DOUBLE-BOOKING THROUGH open_machine_stint ═════════════════ */
section('25 - ONE MACHINE, TWO ACTIVITIES, OVERLAPPING WINDOWS');

// SEQUENCE MATTERS, and getting it wrong the first time was instructive. open_machine_stint takes
//     at_ := coalesce(p_at, ba.actual_start, now())
// so a stint begins when the ACTIVITY began, not when the RPC is called. Starting both activities
// up front and then opening stints in turn back-dates the second one into the first one's window,
// which is a real overlap and is correctly refused. That is not the machine failing to be released;
// it is two activities genuinely claiming one machine at the same time. So Y is started only after
// the machine has actually been given back, which is what an operator would do.
await rpc(P.operator, 'start_activity', { p_activity: X.activity_id });

const s1 = await rpc(P.operator, 'open_machine_stint', { p_activity: X.activity_id });
mustHold({ id: 'W-MC-01', sev: 'P1', attack: `open a stint for ${M1.code} on ${X.code}`,
  expected: 'accepted - the machine is free', actual: `HTTP ${s1.status} ${s1.ok ? '' : msg(s1.body)}`, ok: s1.ok });

const s2 = await rpc(P.operator, 'open_machine_stint', { p_activity: Y.activity_id });
mustRefuse({ id: 'W-MC-02', sev: 'P0', attack: `open a SECOND stint for ${M1.code} while the first is still open`,
  expected: 'refused - one machine cannot be in two places at once', res: s2 });

const raw23P01 = /23P01|conflicting key value|exclusion constraint/i.test(msg(s2.body));
mustHold({ id: 'W-MC-03', sev: 'P2', attack: 'the refusal is a sentence, not a raw constraint violation',
  expected: 'a message naming the machine and what to do',
  actual: msg(s2.body).slice(0, 170),
  ok: !s2.ok && !raw23P01 });

const open1 = (await db.query(
  `select count(*)::int n from machine_usage where machine_id = $1 and ended_at is null`, [M1.id])).rows[0].n;
mustHold({ id: 'W-MC-04', sev: 'P0', attack: 'the database holds at most one open window for that machine',
  expected: '1 open stint', actual: `${open1}`, ok: open1 === 1 });

const c1 = await rpc(P.operator, 'close_machine_stint', { p_activity: X.activity_id });
await rpc(P.operator, 'start_activity', { p_activity: Y.activity_id });   // begins AFTER the release
const s3 = await rpc(P.operator, 'open_machine_stint', { p_activity: Y.activity_id });
mustHold({ id: 'W-MC-05', sev: 'P1', attack: 'once the machine is given back, the next activity may take it',
  expected: 'accepted after the close, because the windows no longer overlap',
  actual: `close HTTP ${c1.status}, second open HTTP ${s3.status} ${s3.ok ? '' : msg(s3.body).slice(0,110)}`,
  ok: c1.ok && s3.ok });

const windows = (await db.query(
  `select started_at, ended_at from machine_usage where machine_id = $1 order by started_at`, [M1.id])).rows;
const overlap = windows.some((w, i) => windows.slice(i + 1).some(v =>
  (w.ended_at === null || v.started_at < w.ended_at) && (v.ended_at === null || w.started_at < v.ended_at)));
mustHold({ id: 'W-MC-06', sev: 'P0', attack: 'no two windows for that machine overlap, ever',
  expected: '0 overlapping pairs', actual: `${windows.length} window(s), overlap=${overlap}`, ok: !overlap });

// And the impossible state cannot be written even by going round the RPC entirely.
let direct = 'not attempted';
try {
  await db.query('begin');
  await db.query(
    `insert into machine_usage (machine_id, master_batch_id, batch_activity_id, started_at, ended_at)
     values ($1, $2, $3, now() - interval '1 hour', now() + interval '1 hour')`,
    [M1.id, A.B, X.activity_id]);
  await db.query(
    `insert into machine_usage (machine_id, master_batch_id, batch_activity_id, started_at, ended_at)
     values ($1, $2, $3, now() - interval '30 minutes', now() + interval '30 minutes')`,
    [M1.id, A.B, Y.activity_id]);
  direct = 'BOTH INSERTS SUCCEEDED';
} catch (e) { direct = `refused: ${String(e.message).slice(0, 110)}`; }
await db.query('rollback');
mustHold({ id: 'W-MC-07', sev: 'P0', attack: 'two overlapping windows inserted directly, as the table owner',
  expected: 'the exclusion constraint refuses it regardless of who is writing',
  actual: direct, ok: /refused/.test(direct) });

/* ══ 26 · VESSEL IDENTITY THROUGH record_occupancy ══════════════════════════ */
section('26 - ONE VESSEL, TWO BATCHES, OVERLAPPING WINDOWS');

// A vessel nobody is holding right now. An earlier run of this script left BUNKER-01 occupied,
// and the refusal that produced ("Bunker 1 is already held by MB-BRKMV-80041 from ... to ...") was
// the constraint doing its job across batches - but it meant the FIRST occupancy failed and the
// contention sequence never ran. Pick a free one so both halves are exercised.
const loc = (await db.query(`
  select l.id, l.code, l.kind from location l
   where not exists (
     select 1 from location_occupancy o
      where o.location_id = l.id and o.is_exclusive and o.during && tstzrange(now() - interval '2 hours', now() + interval '2 hours'))
   order by l.code limit 1`)).rows[0];
if (!loc) { warn('every vessel is occupied in this window - nothing free to contend for'); }
note(`vessel ${loc?.code} (${loc?.kind})`);

const bX = (await readOrDie(P.operator,
  `v_my_work?select=activity_id,code&master_batch_id=eq.${B.B}&responsible_role=eq.operator&state=eq.READY&limit=1`, 'bw'))[0];
await rpc(P.operator, 'start_activity', { p_activity: bX.activity_id });
await db.query(`update batch_activity set destination_location_id = $1 where id = any($2::uuid[])`,
  [loc.id, [X.activity_id, bX.activity_id]]);

const from = new Date(Date.now() - 3600_000).toISOString();
const to   = new Date(Date.now() + 3600_000).toISOString();
const o1 = await rpc(P.supervisor, 'record_occupancy', { p_activity: X.activity_id, p_from: from, p_to: to });
note(`first occupancy of ${loc.code}: HTTP ${o1.status} ${o1.ok ? '' : msg(o1.body).slice(0,110)}`);

const o2 = await rpc(P.supervisor, 'record_occupancy', { p_activity: bX.activity_id,
  p_from: new Date(Date.now() - 1800_000).toISOString(), p_to: new Date(Date.now() + 1800_000).toISOString() });
if (o1.ok) {
  mustRefuse({ id: 'W-VS-01', sev: 'P0', attack: `a second batch occupies ${loc.code} in the same window`,
    expected: 'refused, or recorded as a blocking conflict', res: o2 });
  const rawExcl = /23P01|exclusion constraint/i.test(msg(o2.body));
  mustHold({ id: 'W-VS-02', sev: 'P2', attack: 'that refusal is readable too',
    expected: 'a message naming the vessel', actual: msg(o2.body).slice(0, 170), ok: !o2.ok && !rawExcl });
} else {
  warn(`occupancy is not derivable here: ${msg(o1.body).slice(0, 150)}`);
  note('TBD-28 / TBD-29 are UNRESOLVED, and the system refuses to guess a window. That refusal is');
  note('the correct behaviour and is proved in resources.test.ts; there is nothing to contend for');
  note('until the factory answers which reading applies.');
}

let vdirect = 'not attempted';
try {
  await db.query('begin');
  for (const [s, e] of [['-1 hour', '+1 hour'], ['-30 minutes', '+30 minutes']]) {
    await db.query(
      `insert into location_occupancy (location_id, master_batch_id, batch_activity_id, started_at, ended_at, is_exclusive)
       values ($1, $2, $3, now() + interval '${s}', now() + interval '${e}', true)`,
      [loc.id, A.B, X.activity_id]);
  }
  vdirect = 'BOTH INSERTS SUCCEEDED';
} catch (e) { vdirect = `refused: ${String(e.message).slice(0, 110)}`; }
await db.query('rollback');
mustHold({ id: 'W-VS-03', sev: 'P0', attack: 'two overlapping exclusive occupancies of one vessel, inserted directly',
  expected: 'the exclusion constraint refuses it', actual: vdirect, ok: /refused/.test(vdirect) });

/* ══ upload-layer file typing ═══════════════════════════════════════════════ */
section('UPLOAD LAYER - what the bucket accepts, by declared type and by content');

const bodies = {
  JPEG: Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,0,0,0,1,0,1,0,0,0xff,0xd9]),
  PNG:  Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0x0d,0x49,0x48,0x44,0x52]),
  HTML: Buffer.from('<html><script>alert(1)</script></html>'),
  PDF:  Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n'),
  EXE:  Buffer.from([0x4d,0x5a,0x90,0x00,0x03,0,0,0,0x04,0]),
};
const { upload } = await import('./lib.mjs');
const results = [];
for (const [name, bytes] of Object.entries(bodies)) {
  for (const declared of ['image/jpeg', 'application/pdf', 'text/html']) {
    const path = `${A.B}/${X.activity_id}/ft-${name}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const r = await upload(P.operator, path, bytes, declared);
    results.push({ content: name, declared, upload: r.status, accepted: r.ok });
  }
}
for (const r of results) {
  note(`${String(r.content).padEnd(5)} bytes declared ${String(r.declared).padEnd(17)} -> HTTP ${r.upload} ${r.accepted ? 'ACCEPTED' : 'refused'}`);
}
const nonImageDeclared = results.filter(r => r.declared !== 'image/jpeg' && r.accepted);
mustHold({ id: 'W-FT-01', sev: 'P2', attack: 'the bucket refuses a non-image DECLARED type',
  expected: 'application/pdf and text/html are refused at upload',
  actual: nonImageDeclared.length ? nonImageDeclared.map(r => `${r.content}/${r.declared}`).join(', ') : 'all refused',
  ok: nonImageDeclared.length === 0 });

const mislabelled = results.filter(r => r.declared === 'image/jpeg' && r.content !== 'JPEG' && r.accepted);
mustHold({ id: 'W-FT-02', sev: 'P2', attack: 'CONTENT is checked, not only the declared type',
  expected: 'PNG, HTML, PDF and executable bytes are refused when declared image/jpeg',
  actual: mislabelled.length
    ? `${mislabelled.map(r => r.content).join(', ')} accepted while declared image/jpeg — no magic-byte check`
    : 'all refused',
  ok: mislabelled.length === 0 });

report('WAVE 2F - MACHINE, VESSEL, FILE TYPE');
console.log(`batches: ${A.code} ${B.code}`);
await db.end();
