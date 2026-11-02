/**
 * MushroomOS Weighbridge — the only way this app talks to the database.
 * Reads the wb_v_* views (RLS decides what a login sees); writes only through the wb_* functions (migration 0151),
 * which stamp the time on the server, subtract the slip and raise Admin alerts. Photos and calculation slips go to the
 * private `weighments` bucket under <requirement>/<file> or <batch>/<file> (0153: batch numbers typed by Admin).
 * Shared by the Weighbridge app and the Tasks app's Admin tab (same file in both — keep them identical).
 */
(function () {
  var cfg = window.MOS && window.MOS.config;
  if (!cfg) throw new Error('config.js must load before wb-api.js');

  function Refusal(message, status) { var e = new Error(message); e.name = 'Refusal'; e.status = status || null; return e; }
  function headersFor(s, extra) { return Object.assign({ apikey: cfg.anon, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' }, extra || {}); }
  function sessionGone() {
    if (window.Auth.lastError() === 'network') throw Refusal('No signal to the server. You are still signed in — try again.');
    window.Auth.clear();
    window.location.replace('login.html');
    throw Refusal('Your session has ended. Sign in again.');
  }
  async function withSession(send) {
    var s = await window.Auth.freshSession();
    if (!s) return sessionGone();
    var res = await send(s);
    if (res.status === 401) { var again = await window.Auth.refresh(); if (!again) return sessionGone(); res = await send(again); }
    return res;
  }
  async function handle(res) {
    var text = await res.text(), body = null;
    try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
    if (res.ok) return body;
    throw Refusal((body && (body.message || body.error_description || body.error || body.msg)) || res.statusText || 'The server refused.', res.status);
  }
  async function select(from, params) {
    var q = new URLSearchParams();
    q.set('select', (params && params.select) || '*');
    Object.keys(params || {}).forEach(function (k) { if (k !== 'select') q.set(k, params[k]); });
    return (await handle(await withSession(function (s) { return fetch(cfg.url + '/rest/v1/' + from + '?' + q.toString(), { headers: headersFor(s) }); }))) || [];
  }
  async function rpc(fn, args) {
    var body = JSON.stringify(args || {});
    return await handle(await withSession(function (s) { return fetch(cfg.url + '/rest/v1/rpc/' + fn, { method: 'POST', headers: headersFor(s), body: body }); }));
  }

  /** Upload a file to weighments/<requirement>/<kind>-<time>.<ext>; returns the path. */
  async function upload(reqId, kind, file) {
    if (!file || file.size === 0) throw Refusal('That file is empty — take the photo again.');
    var name = (file.name || '').toLowerCase();
    var ext = /\.pdf$/.test(name) || file.type === 'application/pdf' ? 'pdf' : /png/.test(file.type) ? 'png' : 'jpg';
    var path = reqId + '/' + kind + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '.' + ext;
    var up = await withSession(function (s) {
      return fetch(cfg.url + '/storage/v1/object/weighments/' + encodeURI(path), {
        method: 'POST',
        headers: { apikey: cfg.anon, Authorization: 'Bearer ' + s.access_token, 'Content-Type': file.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg'), 'x-upsert': 'false' },
        body: file,
      });
    });
    if (!up.ok) { var why = ''; try { why = (await up.json()).message || ''; } catch (e) {} throw Refusal('The file did not upload — nothing was recorded. ' + why, up.status); }
    return path;
  }
  async function removeUpload(path) {
    await withSession(function (s) { return fetch(cfg.url + '/storage/v1/object/weighments/' + encodeURI(path), { method: 'DELETE', headers: headersFor(s) }); }).catch(function () {});
  }

  /** Photo first, then the slip; if the slip is refused the orphan photo is removed. */
  async function addSlip(reqId, slip, file) {
    var path = await upload(reqId, 'slip', file);
    try {
      return await rpc('wb_add_slip', { p_req: reqId, p_ticket: slip.ticket, p_vehicle: slip.vehicle || null, p_supplier: slip.supplier || null,
        p_gross_kg: slip.gross_kg, p_tare_kg: slip.tare_kg, p_net_kg: slip.net_kg, p_photo_path: path });
    } catch (e) { await removeUpload(path); throw e; }
  }
  async function setCalcSlip(reqId, file) {
    var path = await upload(reqId, 'calc', file);
    try { await rpc('wb_set_calc_slip', { p_req: reqId, p_path: path }); return path; } catch (e) { await removeUpload(path); throw e; }
  }
  /** One calculation slip for the batch numbers (0153), filed under weighments/<batch>/. */
  async function setBatchCalcSlip(batchId, file) {
    var path = await upload(batchId, 'calc', file);
    try { await rpc('wb_batch_set_calc_slip', { p_batch: batchId, p_path: path }); return path; } catch (e) { await removeUpload(path); throw e; }
  }
  async function signedUrl(path) {
    var body = await handle(await withSession(function (s) {
      return fetch(cfg.url + '/storage/v1/object/sign/weighments/' + encodeURI(path), { method: 'POST', headers: headersFor(s), body: JSON.stringify({ expiresIn: 600 }) });
    }));
    if (!body || !body.signedURL) throw Refusal('The file link could not be made.');
    return cfg.url + '/storage/v1' + body.signedURL;
  }

  // ── tons and kilograms, one way everywhere ──
  function tons(kg) { return (Math.round(Number(kg || 0)) / 1000).toFixed(3) + ' t'; }
  function kgs(kg) { return Math.round(Number(kg || 0)).toLocaleString('en-IN') + ' kg'; }
  function both(kg) { return tons(kg) + ' · ' + kgs(kg); }
  function num(kg) { var v = Math.round(Number(kg || 0)); return (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-IN'); }   // sheet style: 16,000 / −1,000
  function inUnit(kg, unit) { return unit === 't' ? tons(kg) : kgs(kg); }
  function toKg(value, unit) { var v = Number(String(value).replace(/,/g, '')); if (!isFinite(v) || String(value).trim() === '') return null; return unit === 't' ? Math.round(v * 1000 * 1000) / 1000 : v; }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /**
   * The owner's Excel sheet, one per material (28 Sep 2026):
   *   req fresh weight            20000
   *   slip1        4000           16000
   *   …
   *   slip5        5000           -1000   reduce the weight
   * `slips` come from wb_v_slip (slip_no and balance_after_kg are worked out by the database); voided slips stay in
   * the sheet, struck through, with no balance. opts.voidable adds a Void button per valid slip (Admin).
   */
  function ledger(r, slips, opts) {
    opts = opts || {};
    var unit=opts.unit==='t'?'t':'kg';
    function shown(kg){return unit==='t'?(Number(kg)/1000).toLocaleString('en-IN',{maximumFractionDigits:6}):num(kg);}
    var tol = Number(r.tolerance_kg || 0);
    var rows = slips.slice().sort(function (a, b) { return a.recorded_at < b.recorded_at ? -1 : a.recorded_at > b.recorded_at ? 1 : Number(a.entry_seq) - Number(b.entry_seq); });
    function remark(bal) {
      if (bal < -tol) return '<span class="lg-bad">reduce the weight · over by ' + kgs(-bal) + '</span>';
      if (bal < 0) return '<span class="lg-ok">over by ' + kgs(-bal) + ' — within ± ' + kgs(tol) + '</span>';
      if (bal === 0) return '<span class="lg-ok">complete</span>';
      if (bal <= tol) return '<span class="lg-ok">complete — ' + kgs(bal) + ' short, within ± ' + kgs(tol) + '</span>';
      return '';
    }
    var body = rows.map(function (s) {
      var when = new Date(s.recorded_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      var info = 'Ticket ' + esc(s.ticket_no) + (s.vehicle_no ? ' · ' + esc(s.vehicle_no) : '') + (s.supplier ? ' · ' + esc(s.supplier) : '') + ' · ' + when +
        (s.gross_kg != null ? ' · ' + num(s.gross_kg) + ' − ' + num(s.tare_kg) : '') + (s.recorded_by_name ? ' · ' + esc(s.recorded_by_name) : '');
      var photo = '<button type="button" class="lg-ph" data-photo="' + esc(s.photo_path) + '" aria-label="Slip photo"><span class="ms">image</span></button>';
      if (s.voided_at) {
        return '<tr class="lg-void"><td>' + photo + '<b>Void</b><div class="lg-info">' + info + '<br>Voided' + (s.voided_by_name ? ' by ' + esc(s.voided_by_name) : '') + ': ' + esc(s.void_reason) + '</div></td>' +
          '<td class="n"><s>' + shown(s.net_kg) + '</s></td><td class="n">—</td><td class="lg-rm"></td></tr>';
      }
      var bal = Number(s.balance_after_kg);
      return '<tr><td>' + photo + '<b>Slip ' + s.slip_no + '</b><div class="lg-info">' + info + '</div>' +
        (opts.voidable ? '<div class="lg-voidbox" hidden data-void-box="' + s.id + '"><input data-void-why="' + s.id + '" placeholder="Why is this slip wrong?"><button type="button" class="btn sm bad" data-void="' + s.id + '">Void slip</button></div>' : '') + '</td>' +
        '<td class="n">' + shown(s.net_kg) + '</td><td class="n' + (bal < -tol ? ' neg' : '') + '"><b>' + shown(bal) + '</b><div class="lg-rm2">' + remark(bal) + '</div>' +
        (opts.voidable ? '<div class="lg-rm2"><button type="button" class="lg-x" data-void-open="' + s.id + '">void…</button></div>' : '') + '</td><td class="lg-rm">' + remark(bal) +
        (opts.voidable ? ' <button type="button" class="lg-x" data-void-open="' + s.id + '">void…</button>' : '') + '</td></tr>';
    }).join('');
    return '<div class="lg-wrap"><table class="ledger"><thead><tr><th></th><th class="n">Slip weight ('+unit+')</th><th class="n">Balance ('+unit+')</th><th class="lg-rm"></th></tr></thead><tbody>' +
      '<tr class="lg-req"><td><b>Required fresh weight</b>' + (tol ? '<div class="lg-info">allowed ± ' + kgs(tol) + '</div>' : '') + '</td><td class="n"></td><td class="n"><b>' + shown(r.required_kg) + '</b></td><td class="lg-rm"></td></tr>' +
      body + (rows.length ? '' : '<tr><td colspan="4" class="lg-info" style="padding:12px 8px">No slips yet.</td></tr>') + '</tbody></table></div>';
  }

  window.WB = window.WB || {};
  window.WB.api = { select: select, rpc: rpc, addSlip: addSlip, setCalcSlip: setCalcSlip, setBatchCalcSlip: setBatchCalcSlip, signedUrl: signedUrl, Refusal: Refusal,
    ledger: ledger, fmt: { tons: tons, kgs: kgs, both: both, num: num, inUnit: inUnit, toKg: toKg } };
})();
