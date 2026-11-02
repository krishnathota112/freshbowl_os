// Running-batch template — one Excel file per already-running batch, filled by the owner, loaded by
// load-running-batch.mjs through the same Admin functions the app uses.
//
//   node scripts/running-batch/make-template.mjs [PROCESS-2026M] [out.xlsx] [--with-migration <sql>]
//   (--with-migration: read the steps of a version that is not applied yet — the file runs inside a
//    transaction that is rolled back.)
//
// READ-ONLY against the database: the step list is read from the chosen published process version,
// so the template always matches the process the batch will be created on. Laboratory steps are left
// out on purpose — Lab records its own readings and GM approves them; Admin never enters those.
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env.local', import.meta.url) });

const argv = process.argv.slice(2);
const mi = argv.indexOf('--with-migration');
const MIGRATION = mi >= 0 ? argv.splice(mi, 2)[1] : null;
const PROCESS = argv[0] ?? 'PROCESS-2026M';
const OUT = argv[1] ?? `running-batch-template-${PROCESS}.xlsx`;

const STATUS = {
  DONE: 'Done',
  UNKNOWN: 'Done - time unknown',
  RUNNING: 'Running now',
};
const WEIGHT_MATERIALS = [
  ['paddy', 'Paddy'], ['bagasse', 'Bagasse'], ['wheat', 'Wheat'], ['mustard', 'Mustard'],
  ['chicken_manure', 'Chicken Manure'], ['gypsum', 'Gypsum'], ['ammonium_sulphate', 'Ammonium Sulphate'],
  ['urea', 'Urea'], ['nitrogen', 'Nitrogen'], ['ash', 'Ash'],
];

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false },
  options: MIGRATION ? '' : '-c default_transaction_read_only=on' });
await db.connect();
await db.query('begin');
if (MIGRATION) await db.query(readFileSync(MIGRATION, 'utf8'));
const def = (await db.query(`select id, code, version from process_definition where code=$1 and status in ('published'${MIGRATION ? ",'draft'" : ''}) order by version desc limit 1`, [PROCESS])).rows[0];
if (!def) throw new Error(`${PROCESS} is not a published process version.`);
const acts = (await db.query(`
  select a.code, a.label_template, a.stream, a.scope, a.standard_start_hour s, a.standard_end_hour e, a.is_hold
    from process_activity a
   where a.process_definition_id = $1 and coalesce(a.responsible_role::text,'') <> 'lab_tech'
   order by a.standard_start_hour nulls first, a.seq`, [def.id])).rows;
const mats = (await db.query(`select e.role::text role, m.code from material_role_eligibility e join material m on m.id=e.material_id order by 1,2`)).rows;
await db.query('rollback');
await db.end();

const unitOf = (a) => {
  const m = a.code.match(/^TRN-P(\d)-/); if (m) return `Pile ${m[1]}`;
  const t = a.code.match(/^(?:TN-B|BNK-B)(\d)-(?:TUN-LOAD|PREP|LEVEL|HEAT|PAST|COOL|COND)/); if (t) return `Part ${t[1]} tunnel`;
  const b = a.code.match(/^BNK-B(\d)-/); if (b) return `Part ${b[1]} bunker`;
  const d = a.code.match(/^TUN-DISCHARGE-(\d)/); if (d) return `Part ${d[1]} tunnel`;
  return 'Whole batch';
};

const wb = new ExcelJS.Workbook();
const head = (ws, row) => { const r = ws.getRow(row); r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5D50' } }; }); };
const yellow = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8D6' } };

// ── How to fill ────────────────────────────────────────────────────────────
const how = wb.addWorksheet('How to fill');
how.getColumn(1).width = 120;
[
  'RUNNING BATCH TEMPLATE — fill the yellow cells only. One file per batch.',
  '',
  '1. Batch sheet: batch code, H0 (the date and time Hopper pass 1 started), materials, and WHERE THIS INFORMATION CAME FROM',
  '   (who reported it, when, how — WhatsApp, register, phone). That sentence is saved with every time you enter.',
  '2. Weights sheet: dry and/or fresh weight in TONS (e.g. 14.4). Bagasse = the whole batch (all three parts, e.g. 6 per part → 18).',
  '   Leave a cell blank if you do not know it — blank is never saved as 0.',
  '3. Steps sheet: one row per production step. For each step choose a Status:',
  `     (blank)              = not started yet`,
  `     ${STATUS.DONE}                 = finished. Give the START date+time; the end is optional —`,
  '                            left blank, it is the start of the next step of the same part if you gave one,',
  '                            otherwise start + the standard duration (saved as "estimated from the SOP").',
  '                            A Done step with no start takes the end of the step before it in the same part.',
  `     ${STATUS.UNKNOWN}   = finished, but you do not know when (it is saved as "before tracking", no time is invented)`,
  `     ${STATUS.RUNNING}          = happening right now. Tracking continues from here. Start optional (same rule).`,
  '   Dates as dd/mm/yyyy, times as hh:mm (24 hour). All times you give are START times.',
  '   Readings column: the reported readings of a Done step, e.g. moisture_pct=74 (field names of that step).',
  '4. Laboratory readings are NOT in this file: Lab records them in the app and GM approves them.',
  '5. Send the file back. It is first loaded as a DRY RUN (nothing saved) and you get the result table to check.',
  '   Only after you say OK is it saved.',
].forEach((t, i) => { how.getCell(i + 1, 1).value = t; if (i === 0) how.getCell(1, 1).font = { bold: true, size: 13 }; });

// ── Batch ──────────────────────────────────────────────────────────────────
const bs = wb.addWorksheet('Batch');
bs.columns = [{ width: 34 }, { width: 70 }, { width: 60 }];
bs.addRow(['Field', 'Value', 'Help']); head(bs, 1);
const pick = (role) => ['Not used', ...mats.filter((m) => m.role === role).map((m) => m.code)];
const fields = [
  ['Batch code', '', 'e.g. 155,156,157 — must not already exist'],
  ['Label', '', 'short description shown on the batch card (optional)'],
  ['Process version', def.code, 'leave as is unless told otherwise'],
  ['H0 date', '', 'dd/mm/yyyy — the day Hopper pass 1 started'],
  ['H0 time', '', 'hh:mm 24h'],
  ['Supervisor / in-charge', '', 'optional'],
  ['Main fibre', 'BAGASSE_NEW', 'choose'],
  ['Second fibre', 'Not used', 'choose'],
  ['Third fibre', 'Not used', 'choose'],
  ['Paddy', 'PADDY_PUNJAB', 'PADDY_LOCAL or PADDY_PUNJAB'],
  ['Nitrogen source', 'CHICKEN_MANURE', 'choose'],
  ['Mineral', 'GYPSUM', 'choose'],
  ['Moisture %', '', 'pre-H0 material reading (optional)'],
  ['pH', '', 'pre-H0 material reading (optional)'],
  ['Dry weight (t)', '', 'pre-H0 material reading in tons (optional)'],
  ['Source of this information', '', 'REQUIRED: who reported it, when and how (min 20 characters)'],
  ['Notes', '', 'anything else, word for word (e.g. the whole weight sheet, tunnel numbers)'],
];
fields.forEach((f) => bs.addRow(f));
const lists = { 'Main fibre': pick('PRIMARY_FIBRE').slice(1), 'Second fibre': pick('SECONDARY_FIBRE'), 'Third fibre': pick('TERTIARY_FIBRE'),
  Paddy: pick('STRUCTURAL_STRAW').slice(1), 'Nitrogen source': pick('NITROGEN_SOURCE').slice(1), Mineral: pick('MINERAL').slice(1) };
bs.eachRow((r, i) => {
  if (i === 1) return;
  const c = r.getCell(2); c.fill = yellow; c.alignment = { wrapText: true, vertical: 'top' };
  const l = lists[r.getCell(1).value];
  if (l) c.dataValidation = { type: 'list', allowBlank: false, formulae: [`"${l.join(',')}"`] };
});
bs.getRow(fields.length + 1).height = 90;
bs.getRow(fields.length).height = 45;

// ── Weights ────────────────────────────────────────────────────────────────
const ws = wb.addWorksheet('Weights');
ws.columns = [{ width: 24 }, { width: 16 }, { width: 16 }, { width: 40 }];
ws.addRow(['Material', 'Dry weight (t)', 'Fresh weight (t)', 'Note']); head(ws, 1);
for (const [, label] of WEIGHT_MATERIALS) {
  const r = ws.addRow([label, null, null, '']);
  [2, 3, 4].forEach((c) => { r.getCell(c).fill = yellow; });
}

// ── Steps ──────────────────────────────────────────────────────────────────
const st = wb.addWorksheet('Steps', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
st.columns = [
  { header: 'Code', width: 17 }, { header: 'Step', width: 48 }, { header: 'Part', width: 20 },
  { header: 'Planned H', width: 11 }, { header: 'Status', width: 21 },
  { header: 'Start date', width: 12 }, { header: 'Start time', width: 10 },
  { header: 'End date', width: 12 }, { header: 'End time', width: 10 }, { header: 'Note', width: 60 },
  { header: 'Readings (field=value; …)', width: 30 },
];
head(st, 1);
for (const a of acts) {
  const r = st.addRow([a.code, a.label_template + (a.is_hold ? '  (rest)' : ''), unitOf(a),
    `H${Number(a.s)}–${Number(a.e)}`, null, null, null, null, null, null, null]);
  for (let c = 5; c <= 11; c++) r.getCell(c).fill = yellow;
  r.getCell(5).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${Object.values(STATUS).join(',')}"`] };
  for (const c of [6, 7, 8, 9]) r.getCell(c).numFmt = '@';
}
await wb.xlsx.writeFile(OUT);
console.log(`Wrote ${OUT}: ${acts.length} production steps from ${def.code} v${def.version}.`);
