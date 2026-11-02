/**
 * MushroomOS Weighbridge — one fixed job: record weighment slips against what each batch needs.
 *
 *   #/            open materials to receive, grouped by the batch numbers Admin typed: needed · received · BALANCE
 *   #/r/<id>      one material: balance, new slip (photo + ticket + weights), the sheet (owner's Excel), Finished
 *
 * The sheet is the owner's Excel (28 Sep): "req fresh weight 20000 · slip1 4000 → 16000 · … · slip5 5000 → −1000
 * reduce the weight". The database (0151 + 0153) does the subtraction, numbers the slips, refuses duplicates and wrong
 * weights, and alerts Admin when a material goes over (or is finished short). This page shows the server's answer
 * and repeats its refusal word for word.
 */
(function () {
  var api = window.WB.api, f = api.fmt;
  var me = window.Auth.currentUser();
  if (!me) { window.location.replace('login.html'); return; }
  var view = document.getElementById('view'), titleEl = document.getElementById('title'), backBtn = document.getElementById('back');
  var timer = null, showFinished = false;
  var seq = 0;                                          // the screen being drawn; a slower, older load never draws over a newer one
  var unit = 'kg';                                     // how weights are typed and shown: kg (like the sheet) or tons; remembered on this device
  var shownForReq = null;                              // Admin's material unit is the default when opening a material
  try { unit = localStorage.getItem('wb.unit') || 'kg'; } catch (e) { /* private mode */ }

  document.getElementById('who').innerHTML = esc(me.name || '') + '<br>' + esc(window.Auth.ROLE_LABEL[me.role] || me.role);
  document.getElementById('out').onclick = function () { window.Auth.signOut().finally(function () { window.location.replace('login.html'); }); };
  document.getElementById('refresh').onclick = function () { route(); };
  backBtn.onclick = function () { history.length > 1 ? history.back() : go('#/'); };
  window.addEventListener('hashchange', route);
  route();

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function go(h) { if (location.hash === h) route(); else location.hash = h; }
  function when(at) { return at ? new Date(at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; }
  function errBox(e) { return '<div class="error">' + esc(e && e.message ? e.message : String(e)) + '</div>'; }
  function set(title, back) { titleEl.textContent = title; backBtn.hidden = !back; }
  var STATE = { receiving: ['Receiving', 'c-run'], complete: ['Complete', 'c-done'], over: ['OVER — reduce the weight', 'c-bad'], short: ['Finished short', 'c-bad'] };
  function chip(r) {
    var s = STATE[r.state] || ['?', 'c-todo'];
    return '<span class="chip ' + s[1] + '">' + s[0] + '</span>' + (r.finished_at && r.state !== 'short' ? ' <span class="chip c-before">Finished</span>' : '');
  }
  function pct(r) { return Math.min(100, Math.round(100 * Number(r.received_kg) / Number(r.required_kg))); }
  function w(kg) { return f.inUnit(kg, unit); }
  function balanceText(kg) { kg = Number(kg); return kg < 0 ? '−' + w(-kg) : w(kg); }
  function unitSwitch() {
    return '<div class="unit" role="group" aria-label="Unit"><button type="button" data-unit="kg" class="' + (unit === 'kg' ? 'on' : '') + '">kg</button><button type="button" data-unit="t" class="' + (unit === 't' ? 'on' : '') + '">t</button></div>';
  }
  function wireUnit(again) {
    view.querySelectorAll('[data-unit]').forEach(function (b) { b.onclick = function () { unit = b.dataset.unit; try { localStorage.setItem('wb.unit', unit); } catch (e) {} again(); }; });
  }

  var isAdmin = me.role === 'admin' && window.TKWB;
  function route() {
    clearInterval(timer);
    seq++;
    var h = location.hash.replace(/^#/, '') || '/', m;
    // Admin signed in here gets the same requirement screens as Tasks → Weighments (weighments-admin.js)
    if (isAdmin && h === '/admin') { set('Set requirements', true); view.innerHTML = '<div></div>'; return window.TKWB.pane(view.firstElementChild, go).catch(function (e) { view.innerHTML = errBox(e); }); }
    if (isAdmin && (m = h.match(/^\/w\/([\w-]+)/))) { set('Weighments', true); view.innerHTML = '<div></div>'; return window.TKWB.detail(view.firstElementChild, m[1], go, function (t) { titleEl.textContent = t; }); }
    m = h.match(/^\/r\/([\w-]+)/);
    return m ? reqView(m[1]) : homeView();
  }

  // ── open materials, by batch numbers ────────────────────────────────────────────────────────────────────────
  async function homeView() {
    var my = seq;
    shownForReq = null;
    set('Weighbridge', false);
    try {
      var rs = await api.select('wb_v_requirement', { batch_status: 'eq.active', order: 'batch_created_at.asc,sort.asc' });
      if (my !== seq) return;
      var list = rs.filter(function (r) { return showFinished || !r.finished_at; });
      var byBatch = {}; var order = [];
      list.forEach(function (r) { if (!byBatch[r.batch_id]) { byBatch[r.batch_id] = []; order.push(r.batch_id); } byBatch[r.batch_id].push(r); });
      var alertsN = isAdmin ? await window.TKWB.openAlertCount() : 0;
      if (my !== seq) return;
      view.innerHTML = (isAdmin ? '<button class="btn pri full" id="adminBtn" style="margin-top:12px"><span class="ms">edit_note</span>Admin · batch numbers &amp; required weights' +
          (alertsN ? ' <span class="badge">' + alertsN + '</span>' : '') + '</button>' : '') +
        '<div class="row" style="margin-top:12px"><div class="grow caps">Materials to receive</div>' + unitSwitch() + '</div>' +
        '<label class="small" style="display:block;margin-top:6px"><input type="checkbox" id="fin"' + (showFinished ? ' checked' : '') + ' style="width:auto;min-height:auto"> Show finished</label>' +
        (order.length ? order.map(function (b) {
          var rows = byBatch[b];
          return '<div class="caps" style="margin-top:16px">Batch ' + esc(rows[0].batch_name) + '</div>' + (rows[0].batch_note ? '<div class="muted small">' + esc(rows[0].batch_note) + '</div>' : '') + rows.map(function (r) {
            var bal = Number(r.remaining_kg);
            return '<button class="card tap" data-r="' + r.id + '"><div class="row"><div class="grow"><div style="font-size:18px;font-weight:800">' + esc(r.material_name) + '</div>' +
              '<div class="muted small">Needed ' + w(r.required_kg) + ' · received ' + w(r.received_kg) + ' · ' + r.slips + ' slip' + (r.slips === 1 ? '' : 's') + '</div></div>' +
              '<div style="text-align:right"><div class="remain" style="font-size:24px' + (r.state === 'over' ? ';color:var(--bad)' : '') + '">' + esc(balanceText(bal)) + '</div><div class="muted small">balance</div></div></div>' +
              '<div class="bar"><i class="' + (r.state === 'over' ? 'over' : '') + '" style="width:' + pct(r) + '%"></i></div>' +
              '<div class="row small" style="margin-top:8px">' + chip(r) + '</div></button>';
          }).join('');
        }).join('') : '<div class="card muted">Nothing to receive yet. ' + (isAdmin ? 'Tap <b>Admin · batch numbers &amp; required weights</b> above to set the first one.' : 'Admin sets the batch numbers and what each needs.') + '</div>');
      if (isAdmin) document.getElementById('adminBtn').onclick = function () { go('#/admin'); };
      document.getElementById('fin').onchange = function (e) { showFinished = e.target.checked; homeView(); };
      wireUnit(homeView);
      view.querySelectorAll('[data-r]').forEach(function (el) { el.onclick = function () { go('#/r/' + el.dataset.r); }; });
      clearInterval(timer);
      timer = setInterval(function () { if (my === seq) homeView(); }, 30000);
    } catch (e) { view.innerHTML = errBox(e); }
  }

  // ── one material ────────────────────────────────────────────────────────────────────────────────────────────
  var lastResult = null;
  async function reqView(id) {
    var my = seq;
    set('Weighbridge', true);
    try {
      var r = (await api.select('wb_v_requirement', { id: 'eq.' + id }))[0];
      if (my !== seq) return;
      if (!r) { view.innerHTML = '<div class="card">Not found.</div>'; return; }
      if (shownForReq !== id) { unit = r.weight_unit === 'kg' || r.weight_unit === 't' ? r.weight_unit : unit; shownForReq = id; }
      var slips = await api.select('wb_v_slip', { requirement_id: 'eq.' + id, order: 'recorded_at.asc,entry_seq.asc' });
      if (my !== seq) return;
      set(r.material_name, true);
      var bal = Number(r.remaining_kg), tol = Number(r.tolerance_kg);
      var open = !r.finished_at && r.batch_status === 'active';
      var html = '<div class="card"><div class="row"><div class="grow caps">Batch ' + esc(r.batch_name) + ' · ' + esc(r.material_name) + '</div>' + unitSwitch() + '</div>' +
        '<div class="muted small" style="margin-top:6px">Balance</div>' +
        '<div class="remain ' + (r.state === 'over' ? 'over' : r.state === 'complete' ? 'done' : '') + '">' + esc(balanceText(bal)) + '</div>' +
        '<div class="' + (bal < -tol ? 'lg-bad' : 'muted') + '">' + (bal > 0 ? 'still needed' : bal === 0 ? 'exactly received' : bal < -tol ? 'reduce the weight · over by ' + f.kgs(-bal) : 'over by ' + f.kgs(-bal) + ' — within the allowance') + '</div>' +
        '<div class="bar"><i class="' + (r.state === 'over' ? 'over' : '') + '" style="width:' + pct(r) + '%"></i></div>' +
        '<div class="figs"><div><span class="muted small">Required fresh</span><b>' + w(r.required_kg) + '</b></div><div><span class="muted small">Received</span><b>' + w(r.received_kg) + '</b></div>' +
        '<div><span class="muted small">Allowed ±</span><b>' + w(r.tolerance_kg) + '</b></div></div>' +
        '<div class="row" style="margin-top:10px">' + chip(r) + (r.note ? '<span class="muted small">' + esc(r.note) + '</span>' : '') +
        (r.calc_slip_path ? '<button class="btn sm" id="calcBtn" style="margin-left:auto"><span class="ms">description</span>Calculation slip</button>' : '') + '</div></div>';

      if (lastResult && lastResult.req === id) {
        var lr = lastResult.data, lb = Number(lr.remaining_kg);
        html += '<div class="result ' + (lr.over ? 'over' : 'ok') + '">' + (lr.over
          ? 'Saved ' + f.kgs(lr.net_kg) + '. Balance ' + f.num(lb) + ' kg — over by ' + f.kgs(-lb) + '. Reduce the weight. Admin has been alerted.'
          : 'Saved ' + f.kgs(lr.net_kg) + '. Balance now ' + f.num(lb) + ' kg' + (lb < 0 ? ' (within the allowance)' : '') + '.') + '</div>';
        lastResult = null;
      }

      if (open) html += slipForm();
      else html += '<div class="card muted">' + (r.batch_status !== 'active' ? 'These batch numbers are closed.' : 'Marked finished ' + when(r.finished_at) + '. Admin can reopen it.') + '</div>';

      html += '<div class="card"><div class="caps">Sheet · ' + slips.filter(function (s) { return !s.voided_at; }).length + ' slips</div>' + api.ledger(r, slips) + '</div>';

      if (open) html += '<div class="card"><div class="caps">When the last lorry is in</div><p class="muted small">Finished closes this material. If it is below what is needed, Admin is alerted.</p>' +
        '<button class="btn full" id="finishBtn"><span class="ms">flag</span>Finished — no more slips</button></div>';

      view.innerHTML = html;
      wire(r);
      clearInterval(timer);
      timer = setInterval(function () { if (my === seq && !document.querySelector('#slipForm input:focus') && !pendingFile && !formTyped()) reqView(id); }, 30000);
    } catch (e) { view.innerHTML = errBox(e); }
  }

  var pendingFile = null;
  function formTyped() { return ['ticket', 'vehicle', 'supplier', 'gross', 'tare', 'net'].some(function (i) { var el = document.getElementById(i); return el && el.value; }); }
  function slipForm() {
    return '<form class="card" id="slipForm"><div class="caps">New slip</div>' +
      '<label class="shoot' + (pendingFile ? ' done' : '') + '" style="margin-top:12px"><span class="ms" style="font-size:28px">photo_camera</span><span id="photoLbl">' + (pendingFile ? 'Slip photo ready ✓ (tap to retake)' : 'Photo of the weighment slip') + '</span>' +
      '<input type="file" accept="image/*" capture="environment" id="photoIn"></label>' +
      '<div class="grid2"><div><label class="lbl">Ticket no.</label><input id="ticket" autocomplete="off"></div><div><label class="lbl">Vehicle no.</label><input id="vehicle" autocomplete="off"></div></div>' +
      '<label class="lbl">Supplier</label><input id="supplier" autocomplete="off">' +
      '<div class="grid2"><div><label class="lbl">Gross (' + unit + ')</label><input id="gross" inputmode="decimal"></div><div><label class="lbl">Tare (' + unit + ')</label><input id="tare" inputmode="decimal"></div></div>' +
      '<label class="lbl">Net (' + unit + ') — worked out from gross − tare, or type the net on the slip</label><input id="net" inputmode="decimal">' +
      '<div id="netHint" class="small" style="margin-top:6px"></div>' +
      '<div id="formErr"></div><button class="btn pri full" type="submit" id="saveSlip" style="margin-top:12px"><span class="ms">save</span>Save slip</button></form>';
  }

  function wire(r) {
    var on = function (id, fn) { var el = document.getElementById(id); if (el) el.onclick = fn; };
    wireUnit(function () { reqView(r.id); });
    on('calcBtn', function () { api.signedUrl(r.calc_slip_path).then(function (u) { /\.pdf$/i.test(r.calc_slip_path) ? window.open(u, '_blank') : openViewer(u); }).catch(function (e) { view.insertAdjacentHTML('afterbegin', errBox(e)); }); });
    view.querySelectorAll('[data-photo]').forEach(function (b) {
      b.onclick = function () { api.signedUrl(b.dataset.photo).then(openViewer).catch(function (e) { view.insertAdjacentHTML('afterbegin', errBox(e)); }); };
    });
    var form = document.getElementById('slipForm');
    if (form) {
      document.getElementById('photoIn').onchange = function (e) {
        pendingFile = e.target.files && e.target.files[0] || null;
        e.target.closest('.shoot').classList.toggle('done', !!pendingFile);
        document.getElementById('photoLbl').textContent = pendingFile ? 'Slip photo ready ✓ (tap to retake)' : 'Photo of the weighment slip';
      };
      var g = document.getElementById('gross'), t = document.getElementById('tare'), n = document.getElementById('net'), hint = document.getElementById('netHint');
      var tol = Number(r.tolerance_kg), bal = Number(r.remaining_kg);
      var after = function (nk) {
        var b = bal - nk;
        hint.className = 'small ' + (b < -tol ? 'lg-bad' : 'muted');
        hint.textContent = 'Net ' + f.kgs(nk) + ' · balance after this slip: ' + f.num(b) + ' kg' +
          (b < -tol ? ' — over by ' + f.kgs(-b) + '. Reduce the weight. (You can still save the real slip; Admin will be alerted.)' : b <= 0 ? ' — complete' : '');
      };
      var calc = function () {
        var gk = f.toKg(g.value, unit), tk = f.toKg(t.value, unit);
        if (gk != null && tk != null) {
          var nk = gk - tk; n.value = unit === 't' ? (nk / 1000).toFixed(3) : String(Math.round(nk * 1000) / 1000); n.readOnly = true;
          if (nk > 0) after(nk); else { hint.className = 'small lg-bad'; hint.textContent = 'Tare must be less than gross.'; }
        } else {
          n.readOnly = false; var only = f.toKg(n.value, unit);
          if (only) after(only); else hint.textContent = '';
        }
      };
      g.oninput = t.oninput = n.oninput = calc;
      form.onsubmit = async function (e) {
        e.preventDefault();
        var errEl = document.getElementById('formErr'); errEl.innerHTML = '';
        if (!pendingFile) { errEl.innerHTML = errBox('Take the photo of the slip first.'); return; }
        var btn = document.getElementById('saveSlip'); btn.disabled = true; btn.textContent = 'Saving…';
        try {
          var data = await api.addSlip(r.id, { ticket: document.getElementById('ticket').value, vehicle: document.getElementById('vehicle').value, supplier: document.getElementById('supplier').value,
            gross_kg: f.toKg(g.value, unit), tare_kg: f.toKg(t.value, unit), net_kg: (g.value && t.value) ? null : f.toKg(n.value, unit) }, pendingFile);
          pendingFile = null;
          lastResult = { req: r.id, data: data };
          form.reset();
          reqView(r.id);
          window.scrollTo(0, 0);
        } catch (err) { errEl.innerHTML = errBox(err); btn.disabled = false; btn.innerHTML = '<span class="ms">save</span>Save slip'; }
      };
    }
    on('finishBtn', async function (e) {
      var b = e.currentTarget;
      var rem = Number(r.remaining_kg);
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = rem > Number(r.tolerance_kg) ? 'Tap again — ' + f.kgs(rem) + ' is still short; Admin will be alerted' : 'Tap again to mark finished'; return; }
      try { await api.rpc('wb_finish', { p_req: r.id, p_note: null }); go('#/'); } catch (err) { view.insertAdjacentHTML('afterbegin', errBox(err)); }
    });
  }

  function openViewer(url) {
    var v = document.createElement('div');
    v.className = 'viewer';
    v.innerHTML = '<div class="vb"><button class="btn sm">Close</button></div><div class="vi"><img src="' + esc(url) + '" alt="slip"></div>';
    v.onclick = function () { v.remove(); };
    document.body.appendChild(v);
  }
})();
