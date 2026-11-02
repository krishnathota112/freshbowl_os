// Fills one running-batch template per batch from the owner's 25 Sep 2026 factory sheet.
// Run from mushroomos/:  node ../running-batches/fill-2026-09-25.mjs
// Rule per part (unit): rows before the part's first reported event → "Done - time unknown"; from the first
// event to the part's current step → "Done" (times derived by the loader from the SOP); the current step →
// "Running now"; after it → blank. A part with no event is finished ("time unknown") when it ends by the
// batch's latest current step in the standard, else not started.
import ExcelJS from 'exceljs';
const TEMPLATE = '../running-batches/running-batch-template.xlsx';
const OUT = '../running-batches/2026M';
const SRC = 'Reported to Admin by the owner on 25/09/2026: factory sheet "ALL TIMES ARE STARTING TIMES" (tunnel loading / bunker / flipping / soaking start times per batch), the H1 start-time register and the bunker/tunnel board';

const unitOf = (c) => {
  let m;
  if ((m = c.match(/^TRN-P(\d)-/))) return `pile${m[1]}`;
  if ((m = c.match(/^(?:TN-B|BNK-B)(\d)-(?:TUN-LOAD|PREP|LEVEL|HEAT|PAST|COOL|COND)/)) || (m = c.match(/^TUN-DISCHARGE-(\d)/))) return `tunnel${m[1]}`;
  if ((m = c.match(/^BNK-B(\d)-/))) return `bunker${m[1]}`;
  if (c.startsWith('FIB-')) return 'fibre';
  if (c.startsWith('STR-')) return 'straw';
  if (c.startsWith('CM-')) return 'nitrogen';
  return 'yard';
};


// Formulations: "Batch Formulations & Chemical Composition  Original.xlsx" → sheet "Fixed Formulations" (Quantity = DRY tons).
// Owner 25/09/2026: the bagasse figure is per part — ×3 for the batch (6 → 18). Weights are entered in tons.
const F = {
  A: { w: { Paddy: 14.4, Wheat: 0, Bagasse: 6 * 3, 'Chicken Manure': 8.1, Gypsum: 1.6, 'Ammonium Sulphate': 0.2 },
       n: 'LOCAL Paddy 70.588% 14.4 t N 0.85 Ash 13 · Wheat 0 · Bagasse 6 t per part (×3 = 18 t) N 0.45 Ash 1.7 · Chicken Manure 8.1 t N 3 Ash 29.4 · Gypsum 1.6 t Ash 84.8 · Ammonium Sulphate 0.2 t N 20.5 · Total 30.3 t · Total N2 433.4 · Total Ash 5712.2 · 1 bag urea before soaking 3 → N 1.43% Ash 18.852% · C:N 28.366' },
  B: { w: { Paddy: 15, Wheat: 0, Bagasse: 6 * 3, 'Chicken Manure': 8.4, Gypsum: 1.65, 'Ammonium Sulphate': 0.2 },
       n: 'LOCAL Paddy 71.429% 15 t N 0.85 Ash 13 · Wheat 0 · Bagasse 6 t per part (×3 = 18 t) N 0.45 Ash 1.7 · Chicken Manure 8.4 t N 3 Ash 29.4 · Gypsum 1.65 t Ash 84.8 · Ammonium Sulphate 0.2 t N 20.5 · Total 31.25 t · Total N2 447.5 · Total Ash 5920.8 · N 1.432% Ash 18.947% · C:N 28.301' },
  C: { w: { Paddy: 14.7, Wheat: 0, Bagasse: 6.3 * 3, 'Chicken Manure': 9.2, Gypsum: 1.65, 'Ammonium Sulphate': 0.2 },
       n: 'LOCAL Paddy 70% 14.7 t N 0.85 Ash 13 · Wheat 0 · Bagasse 6.3 t per part (×3 = 18.9 t) N 0.35 Ash 1.7 · Chicken Manure 9.2 t N 3 Ash 29.4 · Gypsum 1.65 t Ash 84.8 · Ammonium Sulphate 0.2 t N 20.5 · Total 32.05 t · Total N2 464 · Total Ash 6122.1 · N 1.448% Ash 19.102% · C:N 27.94' },
  D: { w: { Paddy: 15, Wheat: 0, Bagasse: 6 * 3, 'Chicken Manure': 9.2, Gypsum: 1.65, 'Ammonium Sulphate': 0.17 },
       n: 'LOCAL Paddy 71.429% 15 t N 0.85 Ash 13 · Wheat 0 · Bagasse 6 t per part (×3 = 18 t) N 0.45 Ash 1.7 · Chicken Manure 9.2 t N 3 Ash 29.4 · Gypsum 1.65 t Ash 84.8 · Ammonium Sulphate 0.17 t N 20.5 · Total 32.02 t · Total N2 465.35 · Total Ash 6156 · N 1.453% Ash 19.225% · C:N 27.79' },
  E: { w: { Paddy: 14.7, Wheat: 0, Bagasse: 6.3 * 3, 'Chicken Manure': 9.2, Gypsum: 1.65, 'Ammonium Sulphate': 0.18 },
       n: 'Batch No 179: LOCAL Paddy 70% 14.7 t N 0.85 Ash 13 · Wheat 0 · Bagasse 6.3 t per part (×3 = 18.9 t) N 0.45 Ash 1.7 · Chicken Manure 9.2 t N 3 Ash 29.4 · Gypsum 1.65 t Ash 84.8 · Ammonium Sulphate 0.18 t N 20.5 · Total 32.03 t · Total N2 466.2 · Total Ash 6122.1 · N 1.456% Ash 19.114% · C:N 27.786' },
};
const FORM = { '155,156,157': 'A', '158,159,160': 'A', '161,162,163': 'A', '164,165,166': 'A', '167,168,169': 'B', '170,171,172': 'B', '173,174,175': 'C', '176,177,178': 'D', '179,180,181': 'E' };

const batches = [
  { file: '155,156,157', code: '155,156,157', h0: ['02/09/2026', '20:00'], replace: true,
    label: 'Local paddy · 155 = Tunnel 4 · 156 = Tunnel 10 (unloaded 25/09 → grow room) · 157 = Tunnel 2',
    notes: 'Three soaks done; soak pit drained after 2nd soaking 09/09/2026. Parts: 155 → Tunnel 4, 156 → Tunnel 10, 157 → Tunnel 2.',
    events: { 'FIB-WET-1': ['Done', '02/09/2026 20:00', 'Hopper pass 1 = H0'],
      'BNK-B1-TUN-LOAD': ['Done', '18/09/2026 01:40', '155 → Tunnel 4'], 'BNK-B2-TUN-LOAD': ['Done', '18/09/2026 05:15', '156 → Tunnel 10'],
      'BNK-B3-TUN-LOAD': ['Done', '19/09/2026 01:30', '157 → Tunnel 2'],
      'TN-B1-COOL-2': ['Running now', '24/09/2026 10:00', '155 venting'], 'TN-B3-COOL-2': ['Running now', '24/09/2026 20:00', '157 venting'],
      'TUN-DISCHARGE-2': ['Done', '25/09/2026 07:00', '156 unloaded from Tunnel 10, goes to growing room'] },
    unknownNotes: { 'STR-SOAK-2': 'soak pit drained after 2nd soaking on 09/09/2026', 'STR-SOAK-3': 'three soaks done; 1 bag urea before soaking 3' } },
  { file: '158,159,160', code: '158,159,160', h0: ['05/09/2026', '11:50'], label: 'Local paddy · 158 = Tunnel 7 · 159 = Tunnel 9 · 160 = Tunnel 3 · all in Conditioning 2',
    events: { 'BNK-B1-TUN-LOAD': ['Done', '20/09/2026 23:00', '158 → Tunnel 7'], 'BNK-B2-TUN-LOAD': ['Done', '21/09/2026 09:20', '159 → Tunnel 9'],
      'BNK-B3-TUN-LOAD': ['Done', '21/09/2026 15:00', '160 → Tunnel 3'],
      'TN-B1-COND-2': ['Running now', null, '158 in Conditioning 2'], 'TN-B2-COND-2': ['Running now', null, '159 in Conditioning 2'], 'TN-B3-COND-2': ['Running now', null, '160 in Conditioning 2'] } },
  { file: '161,162,163', code: '161,162,163', unknownNotes: { 'STR-SOAK-2': 'soak pit drained after 2nd soaking on 13/09/2026 (formulation sheet)' }, h0: ['09/09/2026', '09:30'], label: 'Local paddy · 161 = Tunnel 5 · 162 = Tunnel 11 (heating) · 163 = Tunnel 6',
    events: { 'BNK-B1-TUN-LOAD': ['Done', '23/09/2026 02:00', '161 → Tunnel 5'], 'BNK-B2-TUN-LOAD': ['Done', '23/09/2026 20:00', '162 → Tunnel 11'],
      'BNK-B3-TUN-LOAD': ['Done', '23/09/2026 12:30', '163 → Tunnel 6'],
      'TN-B1-COND-2': ['Running now', null, '161 in Conditioning 2'], 'TN-B2-HEAT': ['Running now', null, '162 heating'], 'TN-B3-COND-2': ['Running now', null, '163 in Conditioning 2'] } },
  { file: '164,165,166', code: '164,165,166', h0: ['10/09/2026', '20:40'], label: 'Local paddy · Phase 1D-A · 164 = Bunker 11 (holding) · 165 = Bunker 7 → Tunnel 1 · 166 = Bunker 8 (holding)',
    events: { 'BNK-B1-RELOAD': ['Done', '23/09/2026 09:30', '164 → Bunker 11'], 'BNK-B1-HOLD-2': ['Running now', null, '164 bunker rest'],
      'BNK-B3-RELOAD': ['Done', '23/09/2026 15:30', '166 (Bunker 8 per board)'], 'BNK-B3-HOLD-2': ['Running now', null, '166 bunker rest'],
      'BNK-B2-TUN-LOAD': ['Done', '25/09/2026 14:00', '165 from Bunker 7 → Tunnel 1, loading completed'], 'TN-B2-LEVEL': ['Running now', null, '165 in Tunnel 1 after loading'] } },
  { file: '167,168,169', code: '167,168,169', unknownNotes: { 'STR-SOAK-2': 'soak pit drained after 2nd soaking on 18/09/2026 (formulation sheet)' }, h0: ['15/09/2026', '04:20'], label: 'Local paddy · 167 = Bunker 9 (from 6) · 168 = Bunker 10 (reloaded) · 169 = Bunker 13 → 7 (reloading)',
    readings: { 'Moisture %': 58.6, pH: 4, 'Dry weight (t)': 18 }, replace: true,
    events: { 'BNK-B1-FILL': ['Done', '22/09/2026 09:30', '167 → Bunker 6; shifted to Bunker 9 on 24/09/2026 11:00 (a move, not a reload)'], 'BNK-B1-HOLD-1': ['Running now', null, '167 holding 1'],
      'BNK-B2-FILL': ['Done', '22/09/2026 13:20', '168 → Bunker 10'], 'BNK-B2-RELOAD': ['Done', '25/09/2026 10:30', '168 reloaded Bunker 10 → 10 (bunkers not available)'], 'BNK-B2-HOLD-2': ['Running now', null, '168 holding 2'],
      'BNK-B3-FILL': ['Done', '22/09/2026 16:00', '169 → Bunker 13'], 'BNK-B3-RELOAD': ['Running now', '25/09/2026 16:50', '169 reloading Bunker 13 → 7'] } },
  { file: '170,171,172', code: '170,171,172', h0: ['16/09/2026', '19:50'], label: 'Local paddy · 170 = Bunker 12 · 171 = Bunker 5 · 172 = Bunker 6 · holding 1',
    readings: { 'Moisture %': 57.7, pH: 4, 'Dry weight (t)': 18 }, replace: true, cancel: ['171,172,173'],
    events: { 'FIB-WEIGH': ['Done', '16/09/2026 20:26', 'recorded in the app 16/09 (batch then coded 171,172,172)', '16/09/2026 20:28'],
      'FIB-WET-1': ['Done', '16/09/2026 20:26', 'recorded in the app 16/09', '17/09/2026 02:15'], 'FIB-REST-1': ['Done', '17/09/2026 02:15', 'recorded in the app', '17/09/2026 12:59'],
      'FIB-HOP-2': ['Done', '17/09/2026 19:49', 'recorded in the app', '19/09/2026 21:22'], 'FIB-HEAP': ['Done', '19/09/2026 21:23', 'started in the app; finish not recorded'],
      'STR-WEIGH': ['Done', '19/09/2026 21:09', 'started in the app; finish not recorded'],
      'BNK-B1-FILL': ['Done', '24/09/2026 20:00', '170 → Bunker 12'], 'BNK-B1-HOLD-1': ['Running now', null, '170 holding 1'],
      'BNK-B2-FILL': ['Done', '25/09/2026 00:15', '171 → Bunker 5'], 'BNK-B2-HOLD-1': ['Running now', null, '171 holding 1'],
      'BNK-B3-FILL': ['Done', '25/09/2026 03:45', '172 → Bunker 6'], 'BNK-B3-HOLD-1': ['Running now', null, '172 holding 1'] } },
  { file: '173,174,175', code: '173,174,175', unknownNotes: { 'STR-SOAK-2': 'soak pit drained after 2nd soaking on 23/09/2026 (formulation sheet)' }, h0: ['18/09/2026', '20:00'], label: 'Local paddy · Stage 1C-B · flipping 1 + 2',
    readings: { 'Moisture %': 58.3, pH: 4, 'Dry weight (t)': 18.9 }, replace: true,
    events: { 'YARD-FLIP': ['Running now', '25/09/2026 14:25', 'flipping 1 started 14:25, flipping 2 started 16:35'] } },
  { file: '176,177,178', code: '176,177,178', h0: ['22/09/2026', '16:00'], label: 'Local paddy · Stage 1C-A · bagasse in Bunkers 3 & 4 · paddy soaking 1',
    events: { 'FIB-BUNK-LOAD': ['Done', '25/09/2026 08:30', 'bagasse → Bunkers 3 & 4 (pile held 12 h after hopper pass 2, then 60 h in bunker — owner)'],
      'FIB-COND-1': ['Running now', '25/09/2026 12:00', 'bunker holding, Bunkers 3 & 4'], 'STR-SOAK-1': ['Running now', '24/09/2026 23:30', 'paddy soaking 1'] } },
  { file: '179,180,181', code: '179,180,181', h0: ['24/09/2026', '00:15'], replace: true,
    label: 'New bagasse (white) · Local paddy · Bunkers 14 & 15',
    source: 'Carried over from the earlier 179,180,181 record (PROCESS-2026L, entered 24/09/2026 from the WhatsApp shift reports; cancelled 25/09/2026 when the owner moved the batch to PROCESS-2026M) plus the factory sheet the owner gave on 25/09/2026',
    readings: { 'Moisture %': 59.2, 'Dry weight (t)': 18 }, freshWeights: { Bagasse: 44.1 },
    notes: 'Shift report 24/09/2026: H0 = hopper pass 1 at 00:15 with full water, ZX 3, operator Gopal, supervisor Hussain; H1 completed 02:20. Weighment (new bagasse, white): dry 18,000 kg, fresh 44,100 kg, moisture 59.2%. Hopper pass 2 without water 06:00–07:30, ZX 4, operator Gopal, supervisor Shiva; reported at pass 2: moisture 74%, pH 3.95, EC 0.457 (pH/EC are Lab readings, not entered). Bunker loading 24/09 13:45 → Bunkers 14 & 15. The two shift-report photos (hopper pass 1, hopper pass 2) stay attached to the cancelled earlier record — a stored photo can be bound to one step only.',
    values: { 'FIB-HOP-2': 'moisture_pct=74' },
    events: { 'FIB-WET-1': ['Done', '24/09/2026 00:15', 'Shift report 24 Sep (WhatsApp), ZX 3, operator Gopal, supervisor Hussain: hopper pass 1 with full water, started 00:15, H1 completed 02:20. Photo sent with that report (on the earlier record)', '24/09/2026 02:20'],
      'FIB-REST-1': ['Done', '24/09/2026 02:20', 'Derived from the 24 Sep shift reports: pass 1 finished 02:20, pass 2 began 06:00', '24/09/2026 06:00'],
      'FIB-HOP-2': ['Done', '24/09/2026 06:00', 'Shift report 24 Sep (WhatsApp), ZX 4, operator Gopal, supervisor Shiva: hopper pass 2 without water, 06:00–07:30 (90 min), MC 74%. Photo sent with that report (on the earlier record)', '24/09/2026 07:30'],
      'FIB-HEAP': ['Done', '24/09/2026 07:30', 'Heap from the end of hopper pass 2 until bunker loading started (owner sheet: bunker loading 24/09 13:45)', '24/09/2026 13:45'],
      'FIB-BUNK-LOAD': ['Done', '24/09/2026 13:45', 'Owner sheet 25/09: BUNKER LOADING 24/09 [1:45 PM] → Bunkers 14 & 15'],
      'FIB-COND-1': ['Running now', null, 'bunker rest (60 h) in Bunkers 14 & 15'] } },
];

const base = new ExcelJS.Workbook();
await base.xlsx.readFile(TEMPLATE);
const rowsOf = (wb) => { const out = []; wb.getWorksheet('Steps').eachRow((r, i) => { if (i > 1) out.push(r); }); return out; };
const hourOf = (r) => Number(String(r.getCell(4).value).match(/H([\d.]+)/)[1]);
const endOf = (r) => Number(String(r.getCell(4).value).match(/–([\d.]+)/)[1]);

for (const b of batches) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE);
  const f = F[FORM[b.code]];
  b.weights = f.w;
  b.notes = [`Formulation (Batch Formulations & Chemical Composition, Fixed Formulations): ${f.n}.`, b.notes].filter(Boolean).join(' ');
  const B = { 'Batch code': b.code, Label: b.label, 'H0 date': b.h0[0], 'H0 time': b.h0[1], 'Main fibre': 'BAGASSE_NEW', Paddy: 'PADDY_LOCAL',
    'Source of this information': b.source ?? SRC, Notes: b.notes ?? '', ...(b.readings ?? {}) };
  wb.getWorksheet('Batch').eachRow((r, i) => { const k = r.getCell(1).value; if (i > 1 && k in B) r.getCell(2).value = B[k]; });
  wb.getWorksheet('Weights').eachRow((r, i) => { const k = r.getCell(1).value; if (i > 1 && b.weights && k in b.weights) r.getCell(2).value = b.weights[k]; if (i > 1 && b.freshWeights && k in b.freshWeights) r.getCell(3).value = b.freshWeights[k]; });

  const rows = rowsOf(wb);
  const positions = rows.filter((r) => b.events[r.getCell(1).value]?.[0] === 'Running now');
  const maxPos = Math.max(...positions.map(hourOf), ...Object.keys(b.events).map((c) => hourOf(rows.find((r) => r.getCell(1).value === c))));
  const byUnit = {};
  for (const r of rows) (byUnit[unitOf(r.getCell(1).value)] ??= []).push(r);
  for (const list of Object.values(byUnit)) {
    const idx = list.map((r, i) => (b.events[r.getCell(1).value] ? i : -1)).filter((i) => i >= 0);
    const set = (r, status, start, note, end) => {
      r.getCell(5).value = status;
      if (start) { const [d, t] = start.split(' '); r.getCell(6).value = d; r.getCell(7).value = t; }
      if (end) { const [d, t] = end.split(' '); r.getCell(8).value = d; r.getCell(9).value = t; }
      if (note) r.getCell(10).value = note;
    };
    if (!idx.length) {
      if (Math.max(...list.map(endOf)) <= maxPos) list.forEach((r) => set(r, 'Done - time unknown', null, b.unknownNotes?.[r.getCell(1).value]));
      continue;
    }
    const first = idx[0], last = idx[idx.length - 1];
    const lastIsRunning = b.events[list[last].getCell(1).value][0] === 'Running now';
    const unitDone = Math.max(...list.map(endOf)) <= maxPos;
    list.forEach((r, i) => {
      const ev = b.events[r.getCell(1).value];
      if (b.values?.[r.getCell(1).value]) r.getCell(11).value = b.values[r.getCell(1).value];
      if (ev) return set(r, ev[0], ev[1], ev[2], ev[3]);
      if (i < first) return set(r, 'Done - time unknown', null, b.unknownNotes?.[r.getCell(1).value]);
      if (i < last) return set(r, 'Done');
      if (!lastIsRunning && unitDone) return set(r, 'Done - time unknown', null, b.unknownNotes?.[r.getCell(1).value]);
    });
  }
  await wb.xlsx.writeFile(`${OUT}/${b.file}.xlsx`);
  const flags = [b.replace ? '--replace' : '--free-code', ...(b.cancel ?? []).flatMap((c) => ['--cancel', c])];
  console.log(`${b.file}.xlsx\t${flags.join(' ')}`);
}
