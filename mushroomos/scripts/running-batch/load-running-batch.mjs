// Load one filled running-batch template (make-template.mjs) into MushroomOS.
//
//   node scripts/running-batch/load-running-batch.mjs <file.xlsx>            DRY RUN — one transaction, rolled back
//   node scripts/running-batch/load-running-batch.mjs <file.xlsx> --apply    saves it
// options:
//   --free-code             a CANCELLED batch holding this code is renamed "<code> (cancelled <date>)" (nothing deleted)
//   --replace               an ACTIVE/DRAFT batch holding this code is cancelled first (cancel_batch, reason recorded),
//                           then renamed as above — for re-loading a batch onto another process version
//   --cancel <code>         also cancel this other batch (e.g. a duplicate under a wrong code); repeatable
//   --with-migration <sql>  DRY RUN ONLY: run this migration file inside the transaction first (to test a
//                           process version that is not applied yet); refused together with --apply
//   --admin <profile id>    whose Admin login the records carry (default: P. Nair — Admin)
//
// No new write path. As an authenticated Admin (RLS and role guards apply) it calls what the Admin screens call:
//   create_master_batch → generate_activity_plan → pre-H0 readings (open_prebatch_sample / request_lab_test /
//   record_lab_result) → onboard_batch (exact units) → admin_record_reported_work
//
// TIMES (owner, 25 Sep 2026: "all times are starting times … the end is in the SOP"). Within one part (unit),
// in process order, for a row marked Done:
//   start = its reported start, else the end of the previous step of the same part (when that one is timed)
//   end   = its reported end, else the reported start of the NEXT step of the same part, else
//           start + the step's standard duration from the process version
// A Running row without a start takes the end of the previous step of its part the same way.
// Every derived time says so in the record's reason ("estimated from the SOP", not a clock reading).
// "Done - time unknown" stays BEFORE TRACKING and breaks the chain: nothing is derived across it.
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env.local', import.meta.url) });

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const many = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const valued = new Set(['--admin', '--cancel', '--with-migration', '--show']);
const FILE = args.find((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
const APPLY = args.includes('--apply');
const FREE_CODE = args.includes('--free-code') || args.includes('--replace');
const REPLACE = args.includes('--replace');
const CANCEL = many('--cancel');
const MIGRATION = opt('--with-migration');
const PLACEHOLDER = args.includes('--dry-placeholder');
const SHOW = opt('--show');   // regex of step codes to list whatever their state (e.g. next steps' planned times)   // dry runs only: stand-in reading when none is given
const ADMIN = opt('--admin') ?? '8c21e85b-f65c-47c4-8b9f-bdb239e1c52d';
if (!FILE) { console.error('usage: load-running-batch.mjs <file.xlsx> [--apply] [--free-code|--replace] [--cancel <code>]'); process.exit(2); }
if (APPLY && PLACEHOLDER) { console.error('--dry-placeholder is for dry runs only.'); process.exit(2); }
if (APPLY && MIGRATION) { console.error('--with-migration is for dry runs only. Apply the migration itself first.'); process.exit(2); }

const DONE = 'done', UNKNOWN = 'done - time unknown', RUNNING = 'running now';
const WEIGHTS = { Paddy: 'paddy', Bagasse: 'bagasse', Wheat: 'wheat', Mustard: 'mustard', 'Chicken Manure': 'chicken_manure',
  Gypsum: 'gypsum', 'Ammonium Sulphate': 'ammonium_sulphate', Urea: 'urea', Nitrogen: 'nitrogen', Ash: 'ash' };
// Weights are entered in TONS (owner, 25 Sep 2026) and stored in kg, the parameters' own unit. An older file whose
// headers say kg is read as kg.
const READINGS = { 'Moisture %': ['moisture_pct', 1], pH: ['ph', 1], 'Dry weight (t)': ['dry_weight', 1000], 'Dry weight kg': ['dry_weight', 1] };

// ── read the file ──────────────────────────────────────────────────────────
const text = (v) => {
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') return String(v.text ?? v.result ?? v.richText?.map((t) => t.text).join('') ?? '').trim();
  return String(v).trim();
};
const asDate = (v) => {             // → 'YYYY-MM-DD'
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = String(v).match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
};
const asTime = (v) => {             // → 'HH:MM'
  if (v instanceof Date) return v.toISOString().slice(11, 16);
  if (typeof v === 'number') { const m = Math.round(v * 1440); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
  const m = String(v).replace(/\s/g, '').toLowerCase().match(/^(\d{1,2})[:.](\d{2})(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
};
const num = (raw) => { const n = Number(String(raw).replace(/,/g, '')); return Number.isFinite(n) && n >= 0 ? n : null; };

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(FILE);
const problems = [];
const B = {};
wb.getWorksheet('Batch').eachRow((r, i) => { if (i > 1) B[text(r.getCell(1).value)] = text(r.getCell(2).value); });
const readings = [];
const wsW = wb.getWorksheet('Weights');
const perT = /kg/i.test(text(wsW.getRow(1).getCell(2).value)) ? 1 : 1000;   // kg per unit entered
wsW.eachRow((r, i) => {
  if (i === 1) return;
  const key = WEIGHTS[text(r.getCell(1).value)];
  for (const [col, kind] of [[2, 'dry'], [3, 'fresh']]) {
    const raw = text(r.getCell(col).value);
    if (raw === '' || raw instanceof Date) continue;
    if (!key || num(raw) === null) problems.push(`Weights row ${i}: "${raw}" is not a weight in kg`);
    else readings.push({ parameter: `wt_${key}_${kind}_kg`, value: Math.round(num(raw) * perT * 1000) / 1000 });
  }
});
for (const [field, [code, factor]] of Object.entries(READINGS)) {
  const raw = B[field];
  if (raw == null || raw === '') continue;
  if (num(raw) === null) problems.push(`Batch: ${field} "${raw}" is not a number`);
  else readings.push({ parameter: code, value: Math.round(num(raw) * factor * 1000) / 1000 });
}
const steps = [];
wb.getWorksheet('Steps').eachRow((r, i) => {
  if (i === 1) return;
  const status = text(r.getCell(5).value).toLowerCase();
  if (!status) return;
  const s = { row: i, code: text(r.getCell(1).value), title: text(r.getCell(2).value), status, note: text(r.getCell(10).value), values: {} };
  for (const kv of String(text(r.getCell(11).value)).split(';').map((x) => x.trim()).filter(Boolean)) {
    const [k, ...v] = kv.split('=');
    if (!k || !v.length) problems.push(`Steps row ${i} ${s.code}: reading "${kv}" is not field=value`);
    else s.values[k.trim()] = v.join('=').trim();
  }
  if (![DONE, UNKNOWN, RUNNING].includes(status)) problems.push(`Steps row ${i} ${s.code}: unknown status "${status}"`);
  const pair = (d, t, what) => {
    if (text(d) === '' && text(t) === '') return null;
    const dd = asDate(text(d)), tt = asTime(t instanceof Date || typeof t === 'number' ? t : text(t));
    if (!dd || !tt) { problems.push(`Steps row ${i} ${s.code}: ${what} "${text(d)} ${text(t)}" is not dd/mm/yyyy hh:mm`); return null; }
    return [dd, tt];
  };
  if (status !== UNKNOWN) { s.start = pair(r.getCell(6).value, r.getCell(7).value, 'start'); s.end = pair(r.getCell(8).value, r.getCell(9).value, 'end'); }
  if (s.status === RUNNING && s.end) problems.push(`Steps row ${i} ${s.code}: a step that is running now has no end`);
  steps.push(s);
});
const source = B['Source of this information'] ?? '';
if (!B['Batch code']) problems.push('Batch: Batch code is empty');
if (!asDate(text(B['H0 date'])) || !asTime(B['H0 time'])) problems.push('Batch: H0 date/time must be dd/mm/yyyy and hh:mm');
if (source.length < 20) problems.push('Batch: "Source of this information" is required (at least 20 characters)');
if (problems.length) { console.error('The file cannot be loaded:\n  ' + problems.join('\n  ')); process.exit(1); }

// ── load ───────────────────────────────────────────────────────────────────
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
const q = async (s, a = []) => (await db.query(s, a)).rows;
const one = async (s, a) => (await q(s, a))[0];
const asAdmin = async () => {
  await db.query('reset role');
  await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: ADMIN, role: 'authenticated', app_metadata: { app_role: 'admin' } })]);
  await db.query('set local role authenticated');
};
const instant = async ([d, t]) => new Date((await one('select factory_instant($1::date,$2::time) at', [d, t])).at);
const ist = (d) => d ? new Date(d).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '') : '';
const plusH = (d, h) => new Date(d.getTime() + h * 3600e3);
const today = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });

try {
  await db.connect();
  await db.query('begin');
  if (MIGRATION) { await db.query(readFileSync(MIGRATION, 'utf8')); console.log(`(dry run with ${MIGRATION.split(/[\\/]/).pop()} loaded inside the transaction)`); }
  const admin = await one("select display_name from profiles where id=$1 and role='admin' and is_active", [ADMIN]);
  if (!admin) throw new Error(`Profile ${ADMIN} is not an active Admin.`);
  const code = B['Batch code'];
  let def = await one("select id, code, version, status from process_definition where code=$1 and status='published' order by version desc limit 1", [B['Process version']]);
  if (!def && MIGRATION) {
    def = await one("select id, code, version, status from process_definition where code=$1 and status='draft' order by version desc limit 1", [B['Process version']]);
    if (def) { await asAdmin(); await q("select publish_process_definition($1,'dry run')", [def.id]); await db.query('reset role'); }
  }
  if (!def) throw new Error(`${B['Process version']} is not a published process version.`);

  const cancel = async (id, why) => { await asAdmin(); await q('select cancel_batch($1,$2)', [id, why]); await db.query('reset role'); };
  for (const c of CANCEL) {
    const b = await one("select id, status from master_batch where code=$1", [c]);
    if (!b) throw new Error(`--cancel ${c}: no such batch`);
    if (b.status !== 'cancelled') { await cancel(b.id, `Replaced by ${code}, loaded from the running-batch template on ${today} (owner). Kept, not deleted.`); console.log(`Cancelled ${c} (replaced by ${code}).`); }
  }
  const holder = await one('select id, status, created_at from master_batch where code=$1', [code]);
  let replacedId = null;
  if (holder) {
    if (holder.status !== 'cancelled') {
      if (!REPLACE) throw new Error(`Batch code ${code} is already used by a ${holder.status} batch. Add --replace to cancel it and load this one in its place.`);
      await cancel(holder.id, `Re-loaded on ${def.code} from the running-batch template on ${today} (owner). Kept, not deleted.`);
      replacedId = holder.id;
      console.log(`Cancelled the ${holder.status} ${code} (re-loaded on ${def.code}).`);
    }
    if (!FREE_CODE) throw new Error(`Batch code ${code} is held by a cancelled batch. Add --free-code to rename it out of the way.`);
    const base = `${code} (cancelled ${new Date().toISOString().slice(0, 10)})`;
    let renamed = base;
    for (let k = 2; await one('select 1 from master_batch where code=$1', [renamed]); k++) renamed = `${base} #${k}`;
    await q('update master_batch set code=$2 where id=$1', [holder.id, renamed]);   // as owner; audited by trg_audit_upd
    console.log(`Freed the code: the cancelled batch is now "${renamed}" (nothing deleted).`);
  }

  const H0 = await instant([asDate(text(B['H0 date'])), asTime(B['H0 time'])]);
  const roles = [['PRIMARY_FIBRE', 'Main fibre'], ['SECONDARY_FIBRE', 'Second fibre'], ['TERTIARY_FIBRE', 'Third fibre'],
    ['STRUCTURAL_STRAW', 'Paddy'], ['NITROGEN_SOURCE', 'Nitrogen source'], ['MINERAL', 'Mineral']]
    .filter(([, f]) => B[f] && B[f] !== 'Not used').map(([role, f]) => ({ role, material_code: B[f], lead: true }));

  await asAdmin();
  const { id: batch } = await one('select create_master_batch($1,$2,$3::date,$4::jsonb,$5::jsonb,$6,null,$7,$8) id',
    [code, B.Label || code, asDate(text(B['H0 date'])), '{}', JSON.stringify(roles), B['Supervisor / in-charge'] || null, H0, def.id]);
  await q('select generate_activity_plan($1)', [batch]);

  if (!readings.length && PLACEHOLDER) { readings.push({ parameter: 'moisture_pct', value: 0 }); console.log('(dry run: stand-in moisture 0 so activation can be tested — NOT a real value)'); }
  if (readings.length) {
    const cp = await one('select id from lab_checkpoint where is_prebatch order by code limit 1');
    const s = await one("select open_prebatch_sample($1,$2,$3) id", [batch, cp.id, 'Running batch — material values from the factory']);
    for (const w of readings) {
      const t = await one("select request_lab_test($1,$2,'user') id", [s.id, w.parameter]);
      await q('select record_lab_result($1,$2)', [t.id, w.value]);
    }
  }

  const acts = await q(`select id, code, stream::text stream, scope_label, baseline_start_hour::float bs, baseline_end_hour::float be, seq
                          from batch_activity where master_batch_id=$1`, [batch]);
  const byCode = Object.fromEntries(acts.map((a) => [a.code, a]));
  const missing = steps.filter((s) => !byCode[s.code]);
  if (missing.length) throw new Error(`Not steps of ${def.code}: ${missing.map((s) => s.code).join(', ')}`);
  const unit = (a) => `${a.stream}|${a.scope_label}`;
  const said = Object.fromEntries(steps.map((s) => [s.code, s]));
  const units = {};
  for (const a of acts) if (!/^LAB-/.test(a.code)) (units[unit(a)] ??= []).push(a);

  // ── times: reported, else derived along each part ──
  const now = new Date();
  for (const s of steps) { if (s.start) s._at = await instant(s.start); if (s.end) s._end = await instant(s.end); }
  for (const list of Object.values(units)) {
    list.sort((a, b) => (a.bs ?? 1e9) - (b.bs ?? 1e9) || (a.be ?? 1e9) - (b.be ?? 1e9) || a.seq - b.seq);
    let prevEnd = null, prevTitle = null;
    list.forEach((a, i) => {
      const s = said[a.code];
      if (!s || s.status === UNKNOWN) { prevEnd = null; return; }
      const dur = (a.be ?? a.bs) - a.bs;
      if (!s._at && prevEnd) { s._at = prevEnd; s._startSrc = `start = end of "${prevTitle}"`; }
      if (s.status === RUNNING) { prevEnd = null; return; }
      if (!s._at) throw new Error(`${s.code} (${s.title}) is Done but has no start, and the step before it in its part is not timed. Give a start, or mark it "Done - time unknown".`);
      if (!s._end) {
        const next = said[list[i + 1]?.code];
        if (next?.start) { s._end = null; s._endFromNext = next; }
        else { s._end = plusH(s._at, dur); s._endSrc = `end = start + ${dur} h standard duration`; }
      }
      prevEnd = s._end; prevTitle = s.title;
    });
  }
  for (const s of steps) if (s._endFromNext) { s._end = s._endFromNext._at; s._endSrc = `end = reported start of "${s._endFromNext.title}"`; }
  for (const s of steps) {
    if (s._at && s._at > now) throw new Error(`${s.code} would start ${ist(s._at)}, after now. Check its time or the step before it.`);
    if (s.status === DONE && s._end > now) throw new Error(`${s.code} (${s.title}) would end ${ist(s._end)} by the standard, after now — mark it "Running now" instead of Done.`);
  }

  const finished = Object.entries(units).filter(([, l]) => l.every((a) => said[a.code]?.status === DONE || said[a.code]?.status === UNKNOWN)).map(([u]) => u);
  const positions = steps.filter((s) => s.status === RUNNING).map((s) => byCode[s.code].id);
  const unknownNotes = steps.filter((s) => s.status === UNKNOWN && s.note).map((s) => `${s.code}: ${s.note}`);
  const note = [`Running batch loaded from template (${FILE.split(/[\\/]/).pop()}).`, `Source: ${source}`,
    B.Notes ? `Notes: ${B.Notes}` : '', unknownNotes.length ? `Finished, time not recorded as an actual: ${unknownNotes.join(' · ')}` : '']
    .filter(Boolean).join('\n');

  // 0136 · each current step is planned from its real start (reported or derived), not from the moment of loading
  const starts = Object.fromEntries(steps.filter((s) => s.status === RUNNING && s._at).map((s) => [byCode[s.code].id, s._at.toISOString()]));
  const has0136 = await one(`select count(*)::int n from pg_proc where proname='onboard_batch' and pronargs=8`);
  if (has0136.n) await q('select * from onboard_batch($1,$2,$3::uuid[],$4::text[],$5,$6::text[],true,$7::jsonb)', [batch, H0, positions, [], note, finished, JSON.stringify(starts)]);
  else await q('select * from onboard_batch($1,$2,$3::uuid[],$4::text[],$5,$6::text[],true)', [batch, H0, positions, [], note, finished]);

  const timed = steps.filter((s) => s._at).sort((a, b) => a._at - b._at);
  for (const s of timed) {
    const how = [s._startSrc, s._endSrc].filter(Boolean);
    const reason = `${source}${s.note ? ` — ${s.note}` : ''}.`
      + (how.length ? ` Times: ${how.join('; ')} (estimated from the SOP, not a clock reading — owner 25/09/2026: reported times are start times).` : '')
      + ' Entered by Admin from the running-batch template; nothing was recorded in the app at the time.';
    await q('select admin_record_reported_work($1,$2,$3,$4::jsonb,$5)', [byCode[s.code].id, s._at, s.status === DONE ? s._end : null, JSON.stringify(s.values), reason]);
  }

  // ── the replaced record's bunkers/tunnels move with the batch (same physical batch, same steps) ──
  await db.query('reset role');
  if (replacedId) {
    const moved = await q(`with m as (select o.code, n.id new_id, o.id old_id from batch_activity o join batch_activity n on n.code = o.code and n.master_batch_id = $2
                                        where o.master_batch_id = $1),
                            a as (update batch_vessel_allocation x set master_batch_id = $2 where x.master_batch_id = $1
                                    and x.activity_code in (select code from m) returning x.activity_code),
                            o as (update location_occupancy y set master_batch_id = $2, batch_activity_id = m.new_id from m
                                   where y.master_batch_id = $1 and y.batch_activity_id = m.old_id returning y.id)
                       select (select count(*) from a)::int alloc, (select count(*) from o)::int occ`, [replacedId, batch]);
    if (moved[0].alloc || moved[0].occ) {
      await q(`insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
               values ($1, 'admin', 'carry_vessels', 'master_batch', $2, $3::jsonb, $4)`,
        [ADMIN, batch, JSON.stringify({ from_batch: replacedId, ...moved[0] }), `Bunker/tunnel records moved from the replaced record of ${code} (same physical batch, re-loaded ${today}).`]);
      console.log(`Carried ${moved[0].alloc} vessel allocation(s) and ${moved[0].occ} occupancy record(s) from the replaced record.`);
    }
  }
  // ── read back ──
  const mb = await one("select code, status, to_char(start_at at time zone 'Asia/Kolkata','DD/MM/YYYY HH24:MI') h0 from master_batch where id=$1", [batch]);
  const rows = await q(`select code, title, state::text state, before_tracking bt, onboarded_position pos, actual_start, actual_end, planned_start_at, baseline_start_hour
                          from batch_activity where master_batch_id=$1 order by baseline_start_hour nulls first, planned_start_at nulls first, code`, [batch]);
  const counts = rows.reduce((m, r) => ({ ...m, [r.state]: (m[r.state] ?? 0) + 1 }), {});
  console.log(`\n${APPLY ? 'SAVED' : 'DRY RUN (rolled back)'} — batch ${mb.code} · ${def.code} v${def.version} · ${mb.status} · H0 ${mb.h0} IST · as ${admin.display_name}`);
  console.log(`pre-H0 values ${readings.length} · finished parts ${finished.length} · positions ${positions.length} · timed steps ${timed.length} (estimated: ${timed.filter((s) => s._startSrc || s._endSrc).length})`);
  console.log('states:', JSON.stringify(counts));
  console.log('\ncode                 state              actual start   actual end     planned / next');
  for (const r of rows) {
    const s = said[r.code];
    const shown = SHOW && new RegExp(SHOW).test(r.code);
    if (!shown && (!s || s.status === UNKNOWN) && !['READY', 'IN_PROGRESS', 'NOT_DUE_YET'].includes(r.state)) continue;
    const est = s && (s._startSrc || s._endSrc) ? ' ~est' : '';
    console.log(`${r.code.padEnd(20)} ${r.state.padEnd(18)} ${ist(r.actual_start).padEnd(13)}  ${ist(r.actual_end).padEnd(13)}  ${r.actual_start ? '' : ist(r.planned_start_at)}${r.baseline_start_hour != null ? ` (H${Number(r.baseline_start_hour)})` : ''}${est}`);
  }
  const hidden = rows.filter((r) => (!said[r.code] || said[r.code].status === UNKNOWN) && !['READY', 'IN_PROGRESS', 'NOT_DUE_YET'].includes(r.state));
  console.log(`(${hidden.filter((r) => r.bt).length} other steps before tracking, ${hidden.filter((r) => !r.bt).length} waiting — not listed)`);
  await db.query(APPLY ? 'commit' : 'rollback');
  console.log(APPLY ? 'COMMITTED.' : 'Rolled back — nothing saved. Re-run with --apply to save.');
} catch (e) {
  await db.query('rollback').catch(() => {});
  console.error('\nREFUSED / FAILED — nothing saved:\n ', e.message);
  process.exitCode = 1;
} finally { await db.end(); }
