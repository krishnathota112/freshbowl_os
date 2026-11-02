/**
 * Tasks app · Admin "Weighments" tab (0151 + 0153). Kept in its own file so the Tasks screens stay untouched.
 *   pane:       open alerts (acknowledge) · NEW: batch numbers typed by Admin + the requirement sheet (material,
 *               required fresh weight, allowed ±) · open batch numbers with a small sheet each · closed · logins
 *   #/w/b-<id>  batch numbers: fix the numbers/note, calculation slip, materials, add a material, close / reopen
 *   #/w/<id>    one material: the owner's Excel sheet (required → slip → balance → "reduce the weight"), change the
 *               weight, void a slip, finish / reopen, alerts
 * Weighment happens before the batch exists in Tasks, so nothing here needs a Tasks batch (owner, 28 Sep 2026).
 * All rules are in the database; this page shows its answers.
 */
(function () {
  var W = window.WB && window.WB.api;
  // the weighbridge styles (wb.css, same file as the Weighbridge app), loaded once so the Tasks stylesheet stays untouched
  if (!document.getElementById('wb-css')) { var l = document.createElement('link'); l.id = 'wb-css'; l.rel = 'stylesheet'; l.href = 'wb.css?v=2'; document.head.appendChild(l); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function when(at) { return at ? new Date(at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; }
  function errBox(e) { return '<div class="error">' + esc(e && e.message ? e.message : String(e)) + '</div>'; }
  function okBox(t) { return '<div class="ok">' + esc(t) + '</div>'; }
  var STATE = { receiving: ['Receiving', 'c-run'], complete: ['Complete', 'c-done'], over: ['OVER', 'c-bad'], short: ['Finished short', 'c-bad'] };
  function chip(r) { var s = STATE[r.state] || ['?', 'c-todo']; return '<span class="chip ' + s[1] + '">' + s[0] + '</span>' + (r.finished_at && r.state !== 'short' ? ' <span class="chip c-before">Finished</span>' : ''); }
  function unitSel(name, u) { return '<select data-unit="' + name + '" style="width:auto;min-height:36px"><option value="kg"' + (u === 'kg' ? ' selected' : '') + '>kg</option><option value="t"' + (u === 't' ? ' selected' : '') + '>tons</option></select>'; }
  function matOptions(mats, sel) { return mats.map(function (m) { return '<option value="' + esc(m.code) + '"' + (m.code === sel ? ' selected' : '') + '>' + esc(m.name) + '</option>'; }).join('') + '<option value="__new">＋ New material…</option>'; }
  function num(kg) { return W.fmt.num(kg); }

  // Materials of one batch as a small sheet: Material | Required | Received | Balance | state
  function batchSheet(rows) {
    return '<div class="lg-wrap"><table class="ledger"><thead><tr><th>Material</th><th class="n">Required (kg)</th><th class="n">Received (kg)</th><th class="n">Balance (kg)</th><th class="lg-rm"></th></tr></thead><tbody>' +
      rows.map(function (x) {
        var bal = Number(x.remaining_kg);
        return '<tr data-open="' + x.id + '" style="cursor:pointer"><td><b>' + esc(x.material_name) + '</b><div class="lg-info">' + x.slips + ' slip' + (x.slips === 1 ? '' : 's') +
          (x.open_alerts ? ' · <b style="color:var(--bad)">' + x.open_alerts + ' alert' + (x.open_alerts === 1 ? '' : 's') + '</b>' : '') + (x.note ? ' · ' + esc(x.note) : '') + '</div><div class="lg-rm2">' + chip(x) + '</div></td>' +
          '<td class="n">' + num(x.required_kg) + '</td><td class="n">' + num(x.received_kg) + '</td><td class="n' + (x.state === 'over' ? ' neg' : '') + '"><b>' + num(bal) + '</b></td><td class="lg-rm">' + chip(x) + '</td></tr>';
      }).join('') + (rows.length ? '' : '<tr><td colspan="5" class="lg-info" style="padding:12px 8px">No materials yet.</td></tr>') + '</tbody></table></div>';
  }

  async function openAlertCount() {
    if (!W) return 0;
    try { return (await W.select('wb_v_alert', { select: 'id', ack_at: 'is.null' })).length; } catch (e) { return 0; }
  }

  // ── the requirement sheet (new batch numbers) ────────────────────────────────────────────────────────────────
  function sheetRow(mats, code) {
    return '<tr><td><select data-f="mat">' + matOptions(mats, code) + '</select><input data-f="newmat" placeholder="New material name" hidden style="margin-top:4px"></td>' +
      '<td class="n"><input data-f="req" inputmode="decimal" placeholder="20000"></td><td class="n"><input data-f="tol" inputmode="decimal" value="0"></td>' +
      '<td><input data-f="note" placeholder="optional"></td><td><button type="button" class="btn sm" data-f="del" aria-label="Remove row">✕</button></td></tr>';
  }
  function wireSheetRows(tb, onChange) {
    tb.querySelectorAll('tr').forEach(function (tr) {
      var s = tr.querySelector('[data-f="mat"]'), nm = tr.querySelector('[data-f="newmat"]');
      s.onchange = function () { nm.hidden = s.value !== '__new'; if (!nm.hidden) nm.focus(); };
      tr.querySelector('[data-f="del"]').onclick = function () { if (tb.rows.length > 1) { tr.remove(); onChange(); } };
      tr.querySelectorAll('input').forEach(function (i) { i.oninput = onChange; });
    });
  }
  // Turns the sheet into rows for wb_batch_create; new material names are added first (Admin can add materials).
  async function readSheet(tb, u) {
    var out = [];
    for (var i = 0; i < tb.rows.length; i++) {
      var tr = tb.rows[i], g = function (f) { return tr.querySelector('[data-f="' + f + '"]').value; };
      if (!g('req').trim() && g('mat') !== '__new') continue;                   // an untouched spare row
      var code = g('mat');
      if (code === '__new') code = await W.rpc('wb_material_add', { p_name: g('newmat') });
      out.push({ material: code, required_kg: W.fmt.toKg(g('req'), u), tolerance_kg: W.fmt.toKg(g('tol') || '0', u) || 0, note: g('note') || null });
    }
    return out;
  }

  async function pane(el, go) {
    if (!W) { el.innerHTML = errBox('wb-api.js is not loaded.'); return; }
    var r = await Promise.all([
      W.select('wb_v_alert', { ack_at: 'is.null', order: 'raised_at.desc' }),
      W.select('wb_v_requirement', { batch_status: 'eq.active', order: 'sort.asc,material_name.asc' }),
      W.select('wb_v_batch', { order: 'created_at.desc', limit: '60' }),
      W.select('wb_material', { active: 'eq.true', order: 'sort.asc,name.asc' }),
      W.select('wb_v_login', { order: 'display_name.asc' }),
    ]);
    var alerts = r[0], reqs = r[1], batches = r[2], mats = r[3], logins = r[4];
    var open = batches.filter(function (b) { return b.status === 'active'; }), closed = batches.filter(function (b) { return b.status !== 'active'; });
    var byBatch = {};
    reqs.forEach(function (x) { (byBatch[x.batch_id] = byBatch[x.batch_id] || []).push(x); });
    el.innerHTML =
      (alerts.length ? '<div class="card" style="border:2px solid var(--bad)"><div class="caps" style="color:var(--bad)">Weighment alerts · ' + alerts.length + '</div>' +
        alerts.map(function (a) {
          return '<div class="slip"><span class="chip ' + (a.kind === 'over' ? 'c-bad' : 'c-run') + '">' + a.kind + '</span><div class="grow"><b>' + esc(a.message) + '</b><br>' +
            '<span class="muted small">' + when(a.raised_at) + (a.ticket_no ? ' · ticket ' + esc(a.ticket_no) : '') + '</span></div>' +
            '<div class="row"><input data-ack-note="' + a.id + '" placeholder="Note (optional)" style="width:180px;min-height:38px"><button class="btn sm" data-ack="' + a.id + '">Acknowledge</button>' +
            '<button class="btn sm" data-open="' + a.requirement_id + '">Open</button></div></div>';
        }).join('') + '</div>' : '') +

      '<details class="card"' + (open.length ? '' : ' open') + '><summary class="caps" style="cursor:pointer">＋ New batch — set requirement</summary><form id="wbNew" class="stack" style="margin-top:10px">' +
        '<div class="grid2"><div><label class="lbl">Batch number(s)</label><input id="wbNo" placeholder="182, 183, 184" autocomplete="off"></div>' +
        '<div><label class="lbl">Note (formulation, dry → fresh…)</label><input id="wbNote"></div></div>' +
        '<div class="row small" style="gap:6px;margin-top:4px">Weights in ' + unitSel('new', 'kg') + '<span class="muted">· required = the fresh weight to arrive on the weighbridge</span></div>' +
        '<div class="grid-wrap" style="margin-top:8px"><table class="wbsheet"><thead><tr><th>Material</th><th class="n">Required fresh weight</th><th class="n">Allowed ±</th><th>Note</th><th></th></tr></thead>' +
        '<tbody id="wbRows">' + sheetRow(mats, 'bagasse') + '</tbody><tfoot><tr class="sum"><td>Total</td><td class="n" id="wbTotal">0</td><td colspan="3"></td></tr></tfoot></table></div>' +
        '<button type="button" class="btn sm" id="wbAddRow" style="margin-top:8px">＋ Add material</button>' +
        '<label class="shoot" style="margin-top:10px"><span class="ms" style="font-size:24px">upload_file</span><span id="wbCalcLbl">Calculation slip (photo or PDF, optional)</span><input type="file" accept="image/*,application/pdf" id="wbCalc"></label>' +
        '<div id="wbNewMsg"></div><button class="btn pri" type="submit">Set requirement</button></form></details>' +

      (open.length ? open.map(function (b) {
        return '<div class="card"><div class="row"><div class="grow"><div class="caps">Batch</div><div style="font-size:20px;font-weight:800">' + esc(b.batch_no) + '</div>' +
          (b.note ? '<div class="muted small">' + esc(b.note) + '</div>' : '') + '</div><button class="btn sm" data-batch="' + b.id + '">Open batch</button></div>' +
          batchSheet(byBatch[b.id] || []) + '</div>';
      }).join('') : '<div class="card muted">No open batch numbers. Set a requirement above.</div>') +

      (closed.length ? '<details class="card"><summary class="caps" style="cursor:pointer">Closed · ' + closed.length + '</summary>' + closed.map(function (b) {
        return '<button class="task" data-batch="' + b.id + '"><span class="grow"><b>Batch ' + esc(b.batch_no) + '</b><br><span class="muted small">' + b.materials + ' materials · closed ' + when(b.closed_at) + (b.close_note ? ' — ' + esc(b.close_note) : '') + '</span></span></button>';
      }).join('') + '</details>' : '') +

      '<details class="card"><summary class="caps" style="cursor:pointer">Weighbridge logins · ' + logins.length + '</summary>' +
        (logins.length ? logins.map(function (l) { return '<div class="small" style="padding:4px 0">' + esc(l.display_name) + (l.is_active ? '' : ' (switched off)') + '</div>'; }).join('') : '<p class="muted small">None yet.</p>') +
        '<form id="wbLogin" class="stack" style="margin-top:10px"><div class="grid2"><div><label class="lbl">Name</label><input id="wlName"></div><div><label class="lbl">Email (login)</label><input id="wlEmail" type="email" autocomplete="off"></div></div>' +
        '<label class="lbl">Password (share it with the person)</label><input id="wlPass" type="text" autocomplete="off">' +
        '<div id="wlMsg"></div><button class="btn" type="submit">Create weighbridge login</button><p class="muted small">This login opens only the Weighbridge app. Switch it off or reset its password in the main MushroomOS → Logins.</p></form></details>';

    el.querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { go('#/w/' + b.dataset.open); }; });
    el.querySelectorAll('[data-batch]').forEach(function (b) { b.onclick = function () { go('#/w/b-' + b.dataset.batch); }; });
    el.querySelectorAll('[data-ack]').forEach(function (b) {
      b.onclick = async function () {
        try { await W.rpc('wb_ack_alert', { p_alert: b.dataset.ack, p_note: (el.querySelector('[data-ack-note="' + b.dataset.ack + '"]') || {}).value || null }); pane(el, go); }
        catch (e) { el.insertAdjacentHTML('afterbegin', errBox(e)); }
      };
    });

    var nf = document.getElementById('wbNew'), tb = document.getElementById('wbRows'), uSel = nf.querySelector('[data-unit="new"]');
    var total = function () {
      var u = uSel.value, sum = 0;
      tb.querySelectorAll('[data-f="req"]').forEach(function (i) { sum += W.fmt.toKg(i.value, u) || 0; });
      document.getElementById('wbTotal').textContent = num(sum) + ' kg' + (u === 't' ? ' (' + W.fmt.tons(sum) + ')' : '');
    };
    wireSheetRows(tb, total);
    uSel.onchange = total;
    document.getElementById('wbAddRow').onclick = function () {
      var used = [].map.call(tb.querySelectorAll('[data-f="mat"]'), function (s) { return s.value; });
      var next = (mats.filter(function (m) { return used.indexOf(m.code) < 0; })[0] || {}).code;
      tb.insertAdjacentHTML('beforeend', sheetRow(mats, next)); wireSheetRows(tb, total);
      tb.rows[tb.rows.length - 1].querySelector('[data-f="req"]').focus();
    };
    var calc = document.getElementById('wbCalc');
    calc.onchange = function () { document.getElementById('wbCalcLbl').textContent = calc.files[0] ? calc.files[0].name + ' ✓' : 'Calculation slip (photo or PDF, optional)'; };
    nf.onsubmit = async function (e) {
      e.preventDefault();
      var msg = document.getElementById('wbNewMsg'), btn = nf.querySelector('[type="submit"]'); msg.innerHTML = '';
      btn.disabled = true;
      try {
        var rows = await readSheet(tb, uSel.value);
        var id = await W.rpc('wb_batch_create', { p_batch_no: document.getElementById('wbNo').value, p_note: document.getElementById('wbNote').value || null, p_rows: rows });
        if (calc.files && calc.files[0]) {
          try { await W.setBatchCalcSlip(id, calc.files[0]); }
          catch (up) { go('#/w/b-' + id); return; }                        // the batch is saved; attach the slip again on its page
        }
        go('#/w/b-' + id);
      } catch (err) { msg.innerHTML = errBox(err); btn.disabled = false; }
    };
    var lf = document.getElementById('wbLogin');
    lf.onsubmit = async function (e) {
      e.preventDefault();
      var msg = document.getElementById('wlMsg'); msg.innerHTML = '';
      try {
        await W.rpc('admin_create_user', { p_email: document.getElementById('wlEmail').value, p_password: document.getElementById('wlPass').value,
          p_display_name: document.getElementById('wlName').value, p_role: 'weighbridge' });
        document.getElementById('wlPass').value = '';
        msg.innerHTML = okBox('Login created. They sign in to the Weighbridge app with this email and password.');
        setTimeout(function () { pane(el, go); }, 1200);
      } catch (err) { msg.innerHTML = errBox(err); }
    };
  }

  async function detail(view, id, go, setTitle) {
    if (/^b-/.test(id)) return batchDetail(view, id.slice(2), go, setTitle);
    return reqDetail(view, id, go, setTitle);
  }

  // ── batch numbers ───────────────────────────────────────────────────────────────────────────────────────────
  async function batchDetail(view, id, go, setTitle) {
    try {
      var r = await Promise.all([W.select('wb_v_batch', { id: 'eq.' + id }), W.select('wb_v_requirement', { batch_id: 'eq.' + id, order: 'sort.asc,material_name.asc' }), W.select('wb_material', { active: 'eq.true', order: 'sort.asc,name.asc' })]);
      var b = r[0][0], reqs = r[1], mats = r[2];
      if (!b) { view.innerHTML = '<div class="card">Not found.</div>'; return; }
      setTitle('Batch ' + b.batch_no);
      var active = b.status === 'active';
      var used = reqs.map(function (x) { return x.material_code; });
      var free = mats.filter(function (m) { return used.indexOf(m.code) < 0; });
      view.innerHTML = '<div class="card"><div class="caps">Batch number(s)' + (active ? '' : ' · <span style="color:var(--bad)">closed ' + when(b.closed_at) + '</span>') + '</div>' +
        (active ? '<div class="grid2" style="margin-top:6px"><div><input id="bNo" value="' + esc(b.batch_no) + '"></div><div><input id="bNote" value="' + esc(b.note || '') + '" placeholder="Note"></div></div>' +
          '<div id="bMsg"></div><button class="btn sm" id="bSave" style="margin-top:8px">Save numbers / note</button>'
          : '<div style="font-size:22px;font-weight:800">' + esc(b.batch_no) + '</div>' + (b.note ? '<div class="muted">' + esc(b.note) + '</div>' : '') + (b.close_note ? '<div class="muted small">Closed: ' + esc(b.close_note) + '</div>' : '')) +
        '<div class="muted small" style="margin-top:6px">Set ' + when(b.created_at) + (b.created_by_name ? ' by ' + esc(b.created_by_name) : '') + '</div></div>' +

        '<div class="card"><div class="caps">Materials</div>' + batchSheet(reqs) + '</div>' +

        (active ? '<div class="card"><div class="caps">Add a material</div><div class="grid-wrap" style="margin-top:8px"><table class="wbsheet"><thead><tr><th>Material</th><th class="n">Required fresh weight</th><th class="n">Allowed ±</th><th>Note</th><th></th></tr></thead>' +
          '<tbody id="addRows">' + sheetRow(mats, (free[0] || {}).code) + '</tbody></table></div><div class="row small" style="gap:6px;margin-top:6px">Weights in ' + unitSel('add', 'kg') + '</div>' +
          '<div id="addMsg"></div><button class="btn" id="addBtn" style="margin-top:8px">Add</button></div>' : '') +

        '<div class="card"><div class="caps">Calculation slip</div>' + (b.calc_slip_path ? '<button class="btn sm" id="calcView"><span class="ms">description</span>Open</button>' : '<p class="muted small">None attached.</p>') +
          (active ? '<label class="shoot" style="margin-top:8px"><span class="ms" style="font-size:22px">upload_file</span>' + (b.calc_slip_path ? 'Replace' : 'Attach') + ' (photo or PDF)<input type="file" accept="image/*,application/pdf" id="calcIn"></label>' : '') + '<div id="calcMsg"></div></div>' +

        '<div class="card"><div class="caps">' + (active ? 'Close' : 'Reopen') + '</div>' + (active
          ? '<p class="muted small">Close when everything is weighed. Materials not yet finished are finished now — anything short alerts you.</p><div class="row"><input id="clNote" placeholder="Note (optional)" class="grow" style="width:auto"><button class="btn" id="clBtn">Close batch numbers</button></div>'
          : '<div class="row"><input id="roWhy" placeholder="Why reopen?" class="grow" style="width:auto"><button class="btn" id="roBtn">Reopen</button></div>') + '<div id="clMsg"></div></div>';

      var reload = function () { batchDetail(view, id, go, setTitle); };
      var on = function (i, fn) { var x = document.getElementById(i); if (x) x.onclick = fn; };
      view.querySelectorAll('[data-open]').forEach(function (x) { x.onclick = function () { go('#/w/' + x.dataset.open); }; });
      on('bSave', async function () {
        try { await W.rpc('wb_batch_update', { p_batch: id, p_batch_no: document.getElementById('bNo').value, p_note: document.getElementById('bNote').value || null }); reload(); }
        catch (e) { document.getElementById('bMsg').innerHTML = errBox(e); }
      });
      var ab = document.getElementById('addRows');
      if (ab) {
        wireSheetRows(ab, function () {});
        on('addBtn', async function () {
          try {
            var rows = await readSheet(ab, view.querySelector('[data-unit="add"]').value);
            if (!rows.length) throw new Error('Enter the required weight.');
            await W.rpc('wb_requirement_add', { p_batch: id, p_material: rows[0].material, p_required_kg: rows[0].required_kg, p_tolerance_kg: rows[0].tolerance_kg, p_note: rows[0].note });
            reload();
          } catch (e) { document.getElementById('addMsg').innerHTML = errBox(e); }
        });
      }
      on('calcView', function () { W.signedUrl(b.calc_slip_path).then(function (u) { window.open(u, '_blank'); }); });
      var ci = document.getElementById('calcIn');
      if (ci) ci.onchange = async function () { if (!ci.files[0]) return; try { await W.setBatchCalcSlip(id, ci.files[0]); reload(); } catch (e) { document.getElementById('calcMsg').innerHTML = errBox(e); } };
      on('clBtn', async function (e) {
        var btn = e.currentTarget;
        if (btn.dataset.sure !== '1') { btn.dataset.sure = '1'; btn.textContent = 'Tap again to close'; return; }
        try { await W.rpc('wb_batch_close', { p_batch: id, p_note: document.getElementById('clNote').value || null }); reload(); }
        catch (err) { document.getElementById('clMsg').innerHTML = errBox(err); }
      });
      on('roBtn', async function () {
        try { await W.rpc('wb_batch_reopen', { p_batch: id, p_reason: document.getElementById('roWhy').value }); reload(); }
        catch (err) { document.getElementById('clMsg').innerHTML = errBox(err); }
      });
    } catch (e) { view.innerHTML = errBox(e); }
  }

  // ── one material: the Excel sheet ───────────────────────────────────────────────────────────────────────────
  async function reqDetail(view, id, go, setTitle) {
    try {
      var r = (await W.select('wb_v_requirement', { id: 'eq.' + id }))[0];
      if (!r) { view.innerHTML = '<div class="card">Not found.</div>'; return; }
      var r2 = await Promise.all([W.select('wb_v_slip', { requirement_id: 'eq.' + id, order: 'recorded_at.asc,entry_seq.asc' }), W.select('wb_v_alert', { requirement_id: 'eq.' + id, order: 'raised_at.desc' })]);
      var slips = r2[0], alerts = r2[1];
      setTitle(r.material_name + ' · Batch ' + r.batch_name);
      var bal = Number(r.remaining_kg), tol = Number(r.tolerance_kg), active = r.batch_status === 'active';
      view.innerHTML = '<div class="card"><div class="row"><div class="grow caps">Batch ' + esc(r.batch_name) + ' · ' + esc(r.material_name) + '</div><button class="btn sm" id="toBatch">Batch page</button></div>' +
        '<div class="muted small" style="margin-top:6px">Balance</div>' +
        '<div class="remain' + (r.state === 'over' ? ' over' : r.state === 'complete' ? ' done' : '') + '" style="font-size:32px">' + num(bal) + ' kg</div>' +
        '<div class="' + (bal < -tol ? 'lg-bad' : 'muted') + '">' + (bal > 0 ? 'still needed · ' + W.fmt.tons(bal) : bal === 0 ? 'exactly received' : bal < -tol ? 'reduce the weight · over by ' + W.fmt.kgs(-bal) : 'over by ' + W.fmt.kgs(-bal) + ' — within the allowance') + '</div>' +
        '<div class="row" style="margin-top:8px">' + chip(r) + (r.note ? '<span class="muted small">' + esc(r.note) + '</span>' : '') +
        (r.calc_slip_path ? '<button class="btn sm" id="calcView" style="margin-left:auto"><span class="ms">description</span>Calculation slip</button>' : '') + '</div></div>' +

        (alerts.length ? '<div class="card"><div class="caps">Alerts</div>' + alerts.map(function (a) {
          return '<div class="small" style="padding:6px 0;border-top:1px solid var(--line)"><span class="chip ' + (a.kind === 'over' ? 'c-bad' : 'c-run') + '">' + a.kind + '</span> ' + esc(a.message) +
            '<br><span class="muted">' + when(a.raised_at) + (a.ack_at ? ' · acknowledged ' + when(a.ack_at) + (a.ack_by_name ? ' by ' + esc(a.ack_by_name) : '') + (a.ack_note ? ' — ' + esc(a.ack_note) : '') : ' · <b style="color:var(--bad)">open</b>') + '</span></div>';
        }).join('') + '</div>' : '') +

        '<div class="card"><div class="caps">Sheet · ' + slips.filter(function (s) { return !s.voided_at; }).length + ' slips</div>' + W.ledger(r, slips, { voidable: active }) + '<div id="voidMsg"></div></div>' +

        (active ? '<div class="card"><div class="caps">Change the requirement</div><div class="row small" style="gap:6px">Weights in ' + unitSel('edit', 'kg') + '</div>' +
          '<div class="grid2"><div><label class="lbl">Required fresh weight</label><input id="edReq" inputmode="decimal" value="' + Number(r.required_kg) + '"></div>' +
          '<div><label class="lbl">Allowed ±</label><input id="edTol" inputmode="decimal" value="' + Number(r.tolerance_kg) + '"></div></div>' +
          '<label class="lbl">Note</label><input id="edNote" value="' + esc(r.note || '') + '"><div id="edMsg"></div><button class="btn" id="edSave" style="margin-top:10px">Save</button></div>' : '') +

        (active ? '<div class="card"><div class="caps">Finish / reopen</div>' + (r.finished_at
          ? '<p class="small">Finished ' + when(r.finished_at) + (r.finish_note ? ' — ' + esc(r.finish_note) : '') + '</p><div class="row"><input id="reWhy" placeholder="Why reopen?" class="grow" style="width:auto"><button class="btn" id="reopenBtn">Reopen</button></div>'
          : '<button class="btn" id="finBtn">Mark finished (short → alert)</button>') + '<div id="finMsg"></div></div>' : '');

      var on = function (i, fn) { var x = document.getElementById(i); if (x) x.onclick = fn; };
      var reload = function () { reqDetail(view, id, go, setTitle); };
      var show = function (where, e) { var m = document.getElementById(where); if (m) m.innerHTML = errBox(e); else view.insertAdjacentHTML('afterbegin', errBox(e)); };
      on('toBatch', function () { go('#/w/b-' + r.batch_id); });
      view.querySelectorAll('[data-photo]').forEach(function (b) { b.onclick = function () { W.signedUrl(b.dataset.photo).then(function (u) { window.open(u, '_blank'); }).catch(function (e) { show('voidMsg', e); }); }; });
      view.querySelectorAll('[data-void-open]').forEach(function (b) {
        b.onclick = function () { var box = view.querySelector('[data-void-box="' + b.dataset.voidOpen + '"]'); box.hidden = !box.hidden; if (!box.hidden) box.querySelector('input').focus(); };
      });
      view.querySelectorAll('[data-void]').forEach(function (b) {
        b.onclick = async function () {
          try { await W.rpc('wb_void_slip', { p_slip: b.dataset.void, p_reason: view.querySelector('[data-void-why="' + b.dataset.void + '"]').value }); reload(); }
          catch (e) { show('voidMsg', e); }
        };
      });
      var ed = view.querySelector('[data-unit="edit"]');
      if (ed) ed.onchange = function () {
        var k = ed.value === 't' ? 1000 : 1;
        document.getElementById('edReq').value = String(Number(r.required_kg) / k); document.getElementById('edTol').value = String(Number(r.tolerance_kg) / k);
      };
      on('edSave', async function () {
        var u = ed.value;
        try { await W.rpc('wb_requirement_update', { p_req: id, p_required_kg: W.fmt.toKg(document.getElementById('edReq').value, u), p_tolerance_kg: W.fmt.toKg(document.getElementById('edTol').value || '0', u) || 0, p_note: document.getElementById('edNote').value || null }); reload(); }
        catch (e) { show('edMsg', e); }
      });
      on('calcView', function () { W.signedUrl(r.calc_slip_path).then(function (u) { window.open(u, '_blank'); }); });
      on('finBtn', async function () { try { await W.rpc('wb_finish', { p_req: id, p_note: null }); reload(); } catch (e) { show('finMsg', e); } });
      on('reopenBtn', async function () { try { await W.rpc('wb_reopen', { p_req: id, p_reason: document.getElementById('reWhy').value }); reload(); } catch (e) { show('finMsg', e); } });
    } catch (e) { view.innerHTML = errBox(e); }
  }

  window.TKWB = { pane: pane, detail: detail, openAlertCount: openAlertCount };
})();
