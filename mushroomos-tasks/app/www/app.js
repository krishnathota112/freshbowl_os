/**
 * MushroomOS Tasks — one page, hash routes. docs/PRD_MUSHROOMOS_TASKS.md.
 *
 *   #/                 home: tabs by role (Batches · SOPs · Lab work · Approvals)
 *   #/b/<batch>        a batch: its lines, each task in order
 *   #/t/<task>         one task: start / photos / finish (Supervisor), readings (Lab), approve (GM), edit (Admin)
 *   #/sop/<sop>        the SOP table (edit a draft; a published version is frozen → "Make new version")
 *   #/new              new batch (Admin): name, SOP version, H0
 *
 * The rules live in the database (0144): which task may start, what a finish needs, the Lab gate and GM approval.
 * This page shows the server's answer and repeats its refusal word for word.
 */
(function () {
  var api = window.TK.api;
  var me = window.Auth.currentUser();
  if (!me) { window.location.replace('login.html'); return; }
  if (me.role === 'manager') { window.location.replace('operations.html'); return; }
  var role = me.role;                       // admin | supervisor | lab_tech | gm | manager
  var isAdmin = role === 'admin', isSup = role === 'supervisor' || role === 'operator', isLab = role === 'lab_tech', isGm = role === 'gm';
  var view = document.getElementById('view');
  var titleEl = document.getElementById('title');
  var backBtn = document.getElementById('back');
  var homeTab = null;
  var checkpoints = null;                   // the Lab register (same checkpoints and parameters as the main app)
  var timer = null, screenVersion = 0, editingPlan = null;
  function screenGuard() {
    var version = ++screenVersion, hash = location.hash;
    clearTimeout(timer);
    return function () { return version === screenVersion && hash === location.hash; };
  }
  function hasEdits() { return !!view.querySelector('form,input:not([type=file]),textarea,select'); }
  function flagUpdate() {
    var refresh = document.getElementById('refresh');
    refresh.classList.add('has-update'); refresh.title = 'New data available — tap to refresh';
    refresh.setAttribute('aria-label', 'New data available — Refresh');
  }
  var detailsEnabled = false, detailsCheck = null, taskSource = 'tk_v_task_v2';
  var pendingDetails = 'This planner needs the latest database timing update before changes can be saved.';

  document.getElementById('who').innerHTML = esc(me.name || '') + '<br>' + esc((window.Auth.ROLE_LABEL[role] || role));
  var outBtn = document.getElementById('out');
  var nativeApp = !!(window.Capacitor && window.Capacitor.isNativePlatform());
  outBtn.hidden = false;
  if (nativeApp) {
    outBtn.textContent = 'Logout';
    outBtn.className = 'btn sm';
    outBtn.setAttribute('aria-label', 'Logout');
    var topBar = outBtn.closest('header');
    if (topBar) topBar.style.flexWrap = 'wrap';
  }
  outBtn.onclick = function () {
    if (outBtn.disabled) return;
    if (nativeApp && !window.confirm('Log out of MushroomOS Tasks? Make sure any work is saved and photo uploads have finished. You will need to sign in again.')) return;
    outBtn.disabled = true;
    window.Auth.signOut().finally(function () { window.location.replace('login.html'); });
  };
  document.getElementById('refresh').onclick = function () {
    if (hasEdits() && !window.confirm('Refresh this screen? Unsaved entries will be discarded.')) return;
    route();
  };
  backBtn.onclick = function () { history.length > 1 ? history.back() : go('#/'); };
  window.addEventListener('hashchange', route);
  route();

  // ── helpers ─────────────────────────────────────────────────────────────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function go(h) { if (location.hash === h) route(); else location.hash = h; }
  function when(at) { if (!at) return ''; var d = new Date(at); return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function whenFull(at) { if (!at) return ''; var d = new Date(at); return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function localDateTime(at) { if (!at) return ''; var d = new Date(at); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  function spanTime(ms) {
    var minutes = Math.ceil(Math.abs(ms) / 60000), hours = Math.floor(minutes / 60);
    return (hours ? hours + 'h ' : '') + (minutes % 60 ? minutes % 60 + 'm' : hours ? '' : '0m');
  }
  function convergenceCard(result, editable) {
    if (!result) return '';
    var heading = '<div class="caps">Paddy → second convergence · planning advisory</div>';
    var targetEditor = editable && result.targetIndex >= 0 && !result.targetLocked ?
      '<label class="lbl">Intended second convergence<input type="datetime-local" data-paddy-target value="' + localDateTime(result.target) + '"></label>' : '';
    if (result.state === 'unknown') return '<div class="card convergence-card"><div class="big">Complete Paddy timing setup</div>' + heading +
      targetEditor +
      '<p class="muted">A reliable backward suggestion and warning cannot be calculated yet. ' + esc((result.problems || []).join(' ')) + '</p>' +
      (result.suggested && result.suggested.length ? '<p><b>Reference starts if the SOP spacing is kept:</b></p><div class="convergence-steps">' +
        result.suggested.map(function (s) { return '<div><span>' + esc(s.title) + '</span><span>' + whenFull(s.start) + '</span></div>'; }).join('') + '</div>' : '') +
      '<p class="muted small">These are shifted template dates, not verified readiness times. Set the missing durations in the rows or reusable SOP to enable a forecast; no soak or rest time is guessed.</p></div>';
    var status = result.state === 'miss' ? (result.uncertain ? 'At least ' : 'Expected ') + 'shortfall: ' + spanTime(result.shortfallMs) :
      result.state === 'waiting' ? 'Paddy ready early · waiting ' + spanTime(result.waitingMs) : 'Paddy ready at the target';
    var detail = result.state === 'miss' ? '<p><b>Cause:</b> ' + esc(result.cause) + '.</p><p><b>Next paddy-based convergence:</b> ' + whenFull(result.nextFeasible) +
      '. Check the bagasse/CM stream and physical resource before moving the batch plan.</p>' :
      '<p class="muted">Early-ready Paddy is waiting, not late. Keep the intended convergence time unless the production plan changes.</p>';
    return '<div class="card convergence-card ' + (result.state === 'miss' ? 'convergence-alert' : '') + '" role="status"><div class="big">' + status + '</div>' + heading +
      targetEditor +
      '<p><b>Target:</b> ' + whenFull(result.target) + ' · <b>Projected Paddy ready:</b> ' + whenFull(result.ready) + '</p>' + detail +
      (result.uncertain ? '<p class="note">A running Paddy step has passed its planned duration. This is an earliest estimate; confirm its remaining time before relying on it.</p>' : '') +
      '<div class="convergence-steps"><b>Work backward from the target</b>' + result.suggested.map(function (s) {
        return '<div><span>' + esc(s.title) + '</span><span>' + whenFull(s.start) + ' → ' + whenFull(s.finish) + '</span></div>';
      }).join('') + '</div>' + (editable ? '<button type="button" class="btn" data-apply-paddy>Put suggested Paddy starts into editable rows</button>' : '') +
      '<p class="muted small">Uses the saved SOP’s stage durations and waits. It does not validate material readiness, Lab results or bunker/tunnel availability, and never changes actual work or task gates.</p></div>';
  }
  function mountConvergence(root, rows, reference, base, grid) {
    if (!root || !window.TK.paddyConvergence) return;
    var result = window.TK.paddyConvergence.plan(rows, reference, Date.parse(base));
    root.innerHTML = convergenceCard(result, !!grid);
    var apply = root.querySelector('[data-apply-paddy]');
    if (apply) apply.onclick = function () {
      var changed = grid.setPlannedStarts(result.suggested);
      if (changed) mountConvergence(root, grid.read(), reference, base, grid);
    };
    var targetInput = root.querySelector('[data-paddy-target]');
    if (targetInput) targetInput.onchange = function () {
      if (!targetInput.value) return;
      var changed = grid.setPlannedStarts([{ index:result.targetIndex, start:new Date(targetInput.value).getTime() }]);
      if (changed) mountConvergence(root, grid.read(), reference, base, grid);
    };
  }
  function newEntryId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    if (!window.crypto || !window.crypto.getRandomValues) throw new Error('This device cannot safely identify a new entry. Update the browser or APK.');
    var bytes = new Uint8Array(16); window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    var hex = Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    return hex.slice(0,8) + '-' + hex.slice(8,12) + '-' + hex.slice(12,16) + '-' + hex.slice(16,20) + '-' + hex.slice(20);
  }
  function set(title, back, wide) { titleEl.textContent = title; backBtn.hidden = !back; view.className = 'wrap' + (wide ? ' wide' : ''); }
  function errBox(e) { return '<div class="error">' + esc(e && e.message ? e.message : String(e)) + '</div>'; }
  function fail(e, where) { (where || view).insertAdjacentHTML('afterbegin', errBox(e)); window.scrollTo(0, 0); }
  function poll(fn, current) {
    clearTimeout(timer);
    timer = setTimeout(async function tick() {
      if (!current()) return;
      try { if (!document.hidden) await fn(); } catch (e) { /* Keep the existing screen on weak signal. */ }
      if (current()) timer = setTimeout(tick, 30000);
    }, 30000);
  }
  var KIND = { work: 'Work', rest: 'Rest', cleaning: 'Cleaning', lab: 'Lab', lab_gate: 'Lab gate' };
  var PHOTOS = { none: 'No photo', before: 'Before', after: 'After', both: 'Before + after' };
  var ASK = { none: '—', bunker: 'Bunker no.', tunnel: 'Tunnel no.', bunker_tunnel: 'Bunker / tunnel no.', machine: 'Machine' };
  function chip(t) {
    var s = t.status;
    if (s === 'done') return '<span class="chip c-done">' + (t.kind === 'lab_gate' ? 'Approved' : 'Done') + '</span>';
    if (s === 'done_before') return '<span class="chip c-before">Before app</span>';
    if (s === 'running') return '<span class="chip c-run">Running</span>';
    if (s === 'submitted') return '<span class="chip c-lab">Waiting GM</span>';
    if (s === 'returned') return '<span class="chip c-bad">Returned</span>';
    if (t.kind === 'lab' || t.kind === 'lab_gate') return '<span class="chip c-lab">Lab</span>';
    if (t.can_start) return '<span class="chip c-open">Open</span>';
    return '<span class="chip c-todo">Waiting</span>';
  }
  async function loadCheckpoints() { if (!checkpoints) checkpoints = await api.select('tk_v_checkpoint', { order: 'code.asc' }); return checkpoints; }

  async function route() {
    if (editingPlan) {
      if (editingPlan.saving() || (editingPlan.hash !== location.hash && editingPlan.dirty() && !window.confirm('Leave without saving your batch changes?'))) {
        history.replaceState(null, '', editingPlan.hash); return;
      }
      editingPlan = null; window.onbeforeunload = null;
    }
    var current = screenGuard();
    var refresh = document.getElementById('refresh');
    refresh.classList.remove('has-update'); refresh.title = ''; refresh.setAttribute('aria-label', 'Refresh');
    if (!detailsCheck) detailsCheck = api.select('tk_sop_row', { select: 'description,pile,turner_pass,schedule_mode,schedule_gap_minutes', limit: '0' }).then(function () { detailsEnabled = true; taskSource = 'tk_v_task_v3'; }).catch(function () { detailsEnabled = false; });
    await detailsCheck;
    if (!current()) return;
    var h = location.hash.replace(/^#/, '') || '/';
    var m;
    if ((m = h.match(/^\/b\/([\w-]+)\/report$/))) {
      set('Batch progress report', true, true);
      return window.TK.batchReport.mount(view, api, m[1], current);
    }
    if ((m = h.match(/^\/b\/([\w-]+)\/edit$/))) return editBatchView(m[1]);
    if ((m = h.match(/^\/b\/([\w-]+)/))) return batchView(m[1]);
    if ((m = h.match(/^\/t\/([\w-]+)/))) return taskView(m[1]);
    if ((m = h.match(/^\/sop\/([\w-]+)/))) return sopView(m[1]);
    if ((m = h.match(/^\/w\/([\w-]+)/)) && ((isAdmin && window.TKWB) || (isSup && window.TKWB_SUP))) {
      set('Weighment', true); view.innerHTML = '<div data-weighment></div>';
      return (isAdmin ? window.TKWB : window.TKWB_SUP).detail(view.firstElementChild, m[1], go, function (t) { if (current()) set(t, true); });
    }
    if (h === '/new' || h.indexOf('/new?') === 0) return newBatchView();
    return homeView();
  }

  // ── home ────────────────────────────────────────────────────────────────────────────────────────────────────
  async function homeView() {
    var current = screenGuard();
    set('MushroomOS Tasks', false);
    var tabs = [['batches', 'Batches', 'inventory_2']];
    if (window.TK.planning) {
      tabs.push(['daily', isAdmin ? 'Assign daily tasks' : 'Daily tasks', 'event_available']);
      tabs.push(['monthly', 'Monthly task chart', 'calendar_month']);
    }
    if (isAdmin) tabs.push(['sops', 'Task SOPs', 'table']);
    if (isAdmin) tabs.push(['timing', 'Process Time SOP', 'schedule']);
    if (isAdmin) tabs.push(['machines', 'Machines', 'precision_manufacturing']);
    if (isAdmin || isSup) tabs.push(['fuel', 'Fuel log', 'local_gas_station']);
    if (isLab || isAdmin) tabs.push(['lab', 'Lab work', 'science']);
    if (isGm || isAdmin) tabs.push(['gm', 'Approvals', 'approval']);
    if ((isAdmin && window.TKWB) || (isSup && window.TKWB_SUP)) tabs.push(['wb', 'Weighments', 'scale']);
    if (isAdmin) tabs.push(['data-orientation', 'Data Orientation', 'dataset']);
    if (!homeTab) homeTab = isLab ? 'lab' : isGm ? 'gm' : 'batches';
    var pending = 0, wbAlerts = 0; // Badges load without holding up the screen.
    var head = '<div class="tabs">' + tabs.map(function (t) {
      return '<button class="tab' + (homeTab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '"><span class="ms">' + t[2] + '</span>' + t[1] +
        (t[0] === 'gm' && pending ? ' <span class="badge">' + pending + '</span>' : '') +
        (t[0] === 'wb' && wbAlerts ? ' <span class="badge">' + wbAlerts + '</span>' : '') + '</button>';
    }).join('') + '</div><div id="pane"><div class="card muted">Loading…</div></div>';
    view.innerHTML = head;
    view.querySelectorAll('[data-tab]').forEach(function (b) { b.onclick = function () {
      var activePane = document.getElementById('pane');
      if (homeTab === 'timing' && activePane && activePane.dataset.processTimeDirty === '1' &&
          !window.confirm('Leave Process Time SOP without saving your edited standards?')) return;
      homeTab = b.dataset.tab; homeView();
    }; });
    var pane = document.getElementById('pane');
    function badge(tab, count) {
      if (!current() || !count) return;
      var button = view.querySelector('[data-tab="' + tab + '"]');
      if (button) button.insertAdjacentHTML('beforeend', ' <span class="badge">' + Number(count) + '</span>');
    }
    api.select(taskSource, { select: 'id', status: 'eq.submitted', batch_status: 'eq.active' }).then(function (r) { badge('gm', r.length); }).catch(function () {});
    if (isAdmin && window.TKWB) window.TKWB.openAlertCount().then(function (n) { badge('wb', n); }).catch(function () {});
    try {
      if (homeTab === 'wb') await (isAdmin ? window.TKWB : window.TKWB_SUP).pane(pane, go);
      else if (homeTab === 'machines' && isAdmin) await machinesPane(pane);
      else if (homeTab === 'fuel' && (isAdmin || isSup)) await fuelPane(pane);
      else if (homeTab === 'daily' && window.TK.planning) await window.TK.planning.mountDaily(pane, planningCtx(current));
      else if (homeTab === 'monthly' && window.TK.planning) await window.TK.planning.mountMonthly(pane, planningCtx(current));
      else if (homeTab === 'data-orientation' && isAdmin) dataOrientationPane(pane);
      else if (homeTab === 'sops') await sopsPane(pane);
      else if (homeTab === 'timing') await processTimePane(pane);
      else if (homeTab === 'lab') await labPane(pane);
      else if (homeTab === 'gm') await gmPane(pane);
      else await batchesPane(pane);
    } catch (e) { pane.innerHTML = errBox(e); }
    if (!current()) return;
    var snapshot;
    async function checkHome() {
      var data = await Promise.all([api.select('tk_v_batch', { order: 'id.asc' }), api.select(taskSource, { select: 'id,status', status: 'in.(submitted,returned)', batch_status: 'eq.active', order: 'id.asc' })]);
      if (!current()) return;
      var next = JSON.stringify(data);
      if (snapshot && snapshot !== next) flagUpdate();
      snapshot = next;
    }
    checkHome().catch(function () {});
    poll(checkHome, current);
  }

  // The daily sheet and monthly chart live in planning-views.js; this hands them what they may use.
  function planningCtx(current) {
    return {
      api: api, isAdmin: isAdmin, esc: esc, chip: chip, go: go, current: current, taskSource: taskSource,
      openDay: function (key, batchId) { window.TK.planning.setDay(key, batchId); homeTab = 'daily'; homeView(); },
    };
  }

  function dataOrientationPane(pane) {
    pane.innerHTML = '<div class="card"><div class="caps">Data Orientation</div>' +
      '<div class="big" style="margin-top:8px">Factory Operations · Manager view</div>' +
      '<p class="muted">A separate read-only dashboard for batches, actual task times, manpower, machines and measured refuelling. Planned and actual data remain distinct.</p>' +
      '<p class="row"><a class="btn pri" href="operations.html">Open Factory Operations</a><a class="btn" href="director.html">Director brief</a><a class="btn" href="flow.html">Factory Flow · planning advisory</a></p>' +
      '<p class="muted small">The Manager login is created from that page by Admin. Existing batches and photos are never moved into a separate system.</p></div>';
  }

  async function machinesPane(pane) {
    var machines = await api.select('tk_machine', { order: 'name.asc' });
    pane.innerHTML = '<div class="card"><div class="big">Machine list</div><p class="muted">Admin registers each real machine once. Supervisors choose from this list on work and cleaning tasks. Deactivating a machine hides it from new entries but keeps its history.</p>' +
      '<form id="machineForm" class="stack"><input type="hidden" id="machineId"><div><label class="lbl">Machine name or number</label><input id="machineName" maxlength="100" required placeholder="e.g. Turner M1"></div>' +
      '<div><label class="lbl">Type</label><select id="machineKind"><option value="machine">Machine</option><option value="heavy_machine">Heavy machine</option></select></div>' +
      '<label class="row"><input id="machineOdometer" type="checkbox" style="width:auto;min-height:auto">Has an odometer (km)</label>' +
      '<label class="row"><input id="machineActive" type="checkbox" style="width:auto;min-height:auto" checked>Active for new task entries</label>' +
      '<div class="row"><button class="btn pri" type="submit" id="machineSave">Save machine</button><button class="btn" type="button" id="machineClear">Clear</button></div><div role="status" id="machineStatus"></div></form></div>' +
      (machines.length ? machines.map(function (m) { return '<div class="card"><div class="row"><div class="grow"><b>' + esc(m.name) + '</b><div class="muted small">' + (m.kind === 'heavy_machine' ? 'Heavy machine' : 'Machine') + (m.has_odometer ? ' · odometer (km)' : ' · no odometer') + (m.active ? '' : ' · inactive') + '</div></div><button class="btn sm" type="button" data-edit-machine="' + esc(m.id) + '">Edit</button></div></div>'; }).join('') : '<div class="card muted">No machines registered yet.</div>');
    var form = pane.querySelector('#machineForm');
    function fill(m) {
      form.querySelector('#machineId').value = m ? m.id : '';
      form.querySelector('#machineName').value = m ? m.name : '';
      form.querySelector('#machineKind').value = m ? m.kind : 'machine';
      form.querySelector('#machineOdometer').checked = !!(m && m.has_odometer);
      form.querySelector('#machineActive').checked = !m || m.active;
      form.querySelector('#machineSave').textContent = m ? 'Save changes' : 'Add machine';
    }
    pane.querySelector('#machineClear').onclick = function () { fill(null); };
    pane.querySelectorAll('[data-edit-machine]').forEach(function (button) { button.onclick = function () {
      fill(machines.find(function (m) { return m.id === button.dataset.editMachine; }));
      form.scrollIntoView({ behavior:'smooth', block:'start' });
    }; });
    form.onsubmit = async function (event) {
      event.preventDefault();
      var button = form.querySelector('#machineSave'), status = form.querySelector('#machineStatus');
      button.disabled = true; status.textContent = 'Saving…';
      try {
        await api.rpc('tk_machine_save', { p_machine:form.querySelector('#machineId').value || null,
          p_name:form.querySelector('#machineName').value.trim(),p_kind:form.querySelector('#machineKind').value,
          p_has_odometer:form.querySelector('#machineOdometer').checked,p_active:form.querySelector('#machineActive').checked });
        status.textContent = 'Saved. Loading the updated list…';
        try { await machinesPane(pane); } catch (readError) { status.textContent = 'Saved, but the list did not refresh. Refresh before making another change.'; }
      } catch (error) { status.textContent = error.message; button.disabled = false; }
    };
  }

  async function fuelPane(pane) {
    var entryId = isSup ? newEntryId() : null;
    var results = await Promise.all([api.select('tk_machine', { order:'name.asc' }),
      api.select('tk_v_machine_refuel', { order:'event_at.desc', limit:'100' }),
      api.select('tk_v_machine_refuel_totals', { order:'machine_name.asc' })]);
    var machines = results[0], entries = results[1], totals = results[2];
    pane.innerHTML = '<div class="card"><div class="big">Fuel added to machines</div>' +
      '<p class="muted">Record actual litres when a machine is refuelled. Kilometres on a task do not tell us litres consumed by that task. These entries are machine-level totals, not a task allocation.</p>' +
      (isSup ? '<form id="fuelForm" class="stack"><div><label class="lbl">Machine</label><select id="fuelMachine" required><option value="">Choose machine…</option>' +
        machines.filter(function (m) { return m.active; }).map(function (m) { return '<option value="' + esc(m.id) + '">' + esc(m.name) + '</option>'; }).join('') +
        '</select></div><div><label class="lbl">Litres added (L)</label><input id="fuelLitres" type="number" min="0.001" max="100000" step="0.001" inputmode="decimal" required></div>' +
        '<div><label class="lbl">Fuel type</label><input id="fuelType" maxlength="40" required placeholder="e.g. Diesel"></div>' +
        '<div><label class="lbl">When refuelled</label><input id="fuelWhen" type="datetime-local" required value="' + esc(localDateTime(new Date().toISOString())) + '"></div>' +
        '<div><label class="lbl">Note (optional)</label><input id="fuelNote" maxlength="500" placeholder="Pump slip or other context"></div>' +
        '<button class="btn pri full" type="submit" id="fuelSave">Record refuelling</button><div role="status" id="fuelStatus"></div></form>' : '') + '</div>' +
      '<div class="card"><div class="caps">Total measured fuel added · all time</div>' +
      (totals.length ? totals.map(function (x) { return '<div class="row small"><span class="grow">' + esc(x.machine_name) + '</span><b>' + esc(x.litres_added) + ' L</b><span class="muted">' + esc(x.refuels) + ' refuels</span></div>'; }).join('') : '<p class="muted">No machines registered.</p>') +
      '</div><div class="card"><div class="caps">Latest refuelling entries · up to 100</div>' +
      (entries.length ? entries.map(function (r) { return '<div class="resource-fuel-entry"><div class="row"><div class="grow"><b>' + esc(r.machine_name) + '</b> · ' + esc(r.litres) + ' L ' + esc(r.fuel_type) +
        '<div class="muted small">' + whenFull(r.event_at) + ' · by ' + esc(r.recorded_by_name || 'Supervisor') +
        (r.voided_at ? ' · VOID: ' + esc(r.void_reason) : '') + '</div>' + (r.note ? '<div class="small">' + esc(r.note) + '</div>' : '') +
        '</div>' + (isAdmin && !r.voided_at ? '<button type="button" class="btn sm bad" data-void-fuel="' + esc(r.id) + '">Void</button>' : '') + '</div></div>'; }).join('') : '<p class="muted">No refuelling entries yet.</p>') + '</div>';
    var form = pane.querySelector('#fuelForm');
    if (form) form.onsubmit = async function (event) {
      event.preventDefault();
      var button = form.querySelector('#fuelSave'), status = form.querySelector('#fuelStatus');
      button.disabled = true; status.textContent = 'Saving…';
      try {
        var time = form.querySelector('#fuelWhen').value;
        await api.rpc('tk_refuel_record', { p_entry:entryId,p_machine:form.querySelector('#fuelMachine').value,
          p_litres:Number(form.querySelector('#fuelLitres').value),p_fuel_type:form.querySelector('#fuelType').value.trim(),
          p_event_at:new Date(time).toISOString(),p_note:form.querySelector('#fuelNote').value.trim() || null });
        status.textContent = 'Refuelling recorded. Loading the updated list…';
        try { await fuelPane(pane); } catch (readError) { status.textContent = 'Recorded, but the list did not refresh. Refresh before entering another refuel.'; }
      } catch (error) { status.textContent = error.message; button.disabled = false; }
    };
    pane.querySelectorAll('[data-void-fuel]').forEach(function (button) { button.onclick = async function () {
      var reason = window.prompt('Why should this refuelling entry be voided? The original record stays in history.');
      if (reason == null) return;
      button.disabled = true;
      try { await api.rpc('tk_refuel_void', { p_refuel:button.dataset.voidFuel, p_reason:reason }); await fuelPane(pane); }
      catch (error) { fail(error, pane); button.disabled = false; }
    }; });
  }

  async function batchesPane(pane) {
    var bs = await api.select('tk_v_batch', { status: 'eq.active', order: 'created_at.desc' });
    pane.innerHTML = (isAdmin ? '<button class="btn pri full" id="newB" style="margin-top:8px"><span class="ms">add</span>New batch</button>' : '') +
      (bs.length ? bs.map(function (b) {
        return '<button class="card tap" data-b="' + b.id + '"><div class="row"><div class="grow"><div class="big">' + esc(b.name) + '</div>' +
          '<div class="muted">' + esc(b.sop_name) + ' v' + b.sop_version + ' · Batch start ' + whenFull(b.h0) + '</div></div>' +
          '<div style="text-align:right"><div class="mono big">' + b.done + '/' + b.tasks + '</div><div class="muted small">done</div></div></div>' +
          '<div class="row small" style="margin-top:8px">' + (b.running ? '<span class="chip c-run">' + b.running + ' running</span>' : '') +
          (b.awaiting_gm ? '<span class="chip c-lab">' + b.awaiting_gm + ' waiting GM</span>' : '') +
          '<span class="muted">' + esc((b.lines || []).join(' · ')) + '</span></div>' +
          (isAdmin ? '<div class="convergence-home" data-convergence-batch="' + esc(b.id) + '"></div>' : '') + '</button>';
      }).join('') : '<div class="card muted">No open batch.' + (isAdmin ? ' Press <b>New batch</b> and pick an SOP.' : '') + '</div>');
    pane.querySelectorAll('[data-b]').forEach(function (el) { el.onclick = function () { go('#/b/' + el.dataset.b); }; });
    var nb = document.getElementById('newB'); if (nb) nb.onclick = function () { go('#/new'); };
    if (isAdmin && bs.length && window.TK.paddyConvergence) {
      api.select(taskSource, { batch_status:'eq.active', order:'ord.asc' }).then(function (tasks) {
        bs.forEach(function (b) {
          var node = pane.querySelector('[data-convergence-batch="' + b.id + '"]');
          if (!node) return;
          var result = window.TK.paddyConvergence.plan(tasks.filter(function (t) { return t.batch_id === b.id; }), null, Date.parse(b.h0));
          if (result.state === 'miss') node.textContent = '⚠ Paddy forecast: ' + (result.uncertain ? 'at least ' : '') + spanTime(result.shortfallMs) + ' short of second convergence. Open batch for cause and next timing.';
          else if (result.state === 'unknown') node.textContent = 'Paddy convergence forecast needs timing setup.';
        });
      }).catch(function () {});
    }
  }

  async function labPane(pane) {
    var ts = await api.select(taskSource, { kind: 'in.(lab,lab_gate)', batch_status: 'eq.active', status: 'in.(todo,returned,submitted)', order: 'batch_name.asc,ord.asc' });
    pane.innerHTML = '<p class="muted" style="margin:8px 0">Lab rows can be done any time. Lab approval rows still record the GM’s decision, but do not block other tasks.</p>' +
      (ts.length ? ts.map(taskRow).join('') : '<div class="card muted">No Lab work waiting.</div>');
    wireTasks(pane);
  }

  async function gmPane(pane) {
    var ts = await api.select(taskSource, { status: 'eq.submitted', batch_status: 'eq.active', order: 'ended_at.asc' });
    pane.innerHTML = '<p class="muted" style="margin:8px 0">Lab gate results waiting for approval.</p>' +
      (ts.length ? ts.map(taskRow).join('') : '<div class="card muted">Nothing to approve.</div>');
    wireTasks(pane);
  }

  function taskRow(t) {
    var cls = t.status === 'running' ? ' running' : (t.can_start ? ' open' : '');
    cls += t.kind === 'lab_gate' ? ' gate' : t.kind === 'lab' ? ' labr' : '';
    return '<button class="task' + cls + '" data-t="' + t.id + '"><span class="num">' + t.ord + '</span>' +
      '<span class="grow"><b>' + esc(t.title) + '</b><br><span class="muted small">' +
      [t.batch_name && !location.hash.match(/^#\/b\//) ? esc(t.batch_name) : '', esc(t.line), t.pile ? esc(t.pile + ' · ' + t.turner_pass.replace(/_/g, ' ')) : '',
        t.suggested_at ? 'Suggested ' + whenFull(t.suggested_at) : '',
        t.status === 'running' && t.started_at ? 'since ' + when(t.started_at) : '', t.status === 'done' && t.ended_at ? when(t.ended_at) : '',
        t.answer ? esc(t.answer) : '', !t.can_start && t.status === 'todo' && t.blocked_by && t.kind !== 'lab' && t.kind !== 'lab_gate' ? 'after “' + esc(t.blocked_by) + '”' : '']
        .filter(Boolean).join(' · ') + '</span></span>' + chip(t) + '</button>';
  }
  function wireTasks(root) { root.querySelectorAll('[data-t]').forEach(function (el) { el.onclick = function () { go('#/t/' + el.dataset.t); }; }); }

  // ── a batch ─────────────────────────────────────────────────────────────────────────────────────────────────
  var lineFilter = {}, batchTab = {};
  async function batchView(id, supplied) {
    var current = screenGuard();
    set('Batch', true);
    try {
      var r = supplied || await Promise.all([api.select('tk_v_batch', { id: 'eq.' + id }), api.select(taskSource, { batch_id: 'eq.' + id, order: 'ord.asc' })]);
      if (!current()) return;
      var b = r[0][0], ts = r[1];
      if (!b) { view.innerHTML = '<div class="card">No such batch.</div>'; return; }
      set(b.name, true);
      var lines = []; ts.forEach(function (t) { if (lines.indexOf(t.line) === -1) lines.push(t.line); });
      var f = lineFilter[id] || 'all', mode = batchTab[id] || (isLab ? 'lab' : 'process');
      var visible = ts.filter(function (t) { var lab = t.kind === 'lab' || t.kind === 'lab_gate'; return mode === 'all' || (mode === 'lab' ? lab : !lab); });
      var piles = Array.from(new Set(ts.map(function (t) { return t.pile; }).filter(Boolean)));
      var html = '<div class="card"><div class="caps">Batch</div><div class="big">' + esc(b.name) + '</div>' +
        '<div class="muted">' + esc(b.sop_name) + ' v' + b.sop_version + ' · Batch start ' + whenFull(b.h0) + ' · ' + b.done + '/' + b.tasks + ' done</div>' +
        (b.status !== 'active' ? '<div class="error">This batch is closed.</div>' : '') +
        (isAdmin && b.status === 'active' ? '<button class="btn pri" id="editBatch" style="margin-top:12px">Edit batch · rows</button>' : '') +
        '<a class="btn" style="margin:12px 0 0 8px" href="#/b/' + b.id + '/report">Progress report · Excel</a></div>' +
        (isAdmin && window.TK.paddyConvergence ? convergenceCard(window.TK.paddyConvergence.plan(ts, null, Date.parse(b.h0)), false) : '') +
        '<div class="tabs" role="tablist" aria-label="Batch task views">' + [['process','Process'],['lab','Lab'],['all','All tasks']].map(function (tab) {
          return '<button role="tab" aria-selected="' + (mode === tab[0]) + '" class="tab' + (mode === tab[0] ? ' on' : '') + '" data-mode="' + tab[0] + '">' + tab[1] + '</button>';
        }).join('') + '</div><p class="muted small">All tasks can be started independently. Process and Lab keep the same master task numbers.</p>' +
        (piles.length ? '<div class="pile-summary">' + piles.map(function (p) {
          var work = ts.filter(function (t) { return t.pile === p && ['T0','T1','T2','T3'].indexOf(t.turner_pass) !== -1; });
          var done = work.filter(function (t) { return t.status === 'done' || t.status === 'done_before'; }).length;
          var stream = ts.find(function (t) { return t.pile === p; }).line;
          return '<button class="btn" data-l="' + esc(stream) + '">' + esc(p) + '<br><span class="small">' + done + '/' + work.length + ' passes done</span></button>';
        }).join('') + '</div>' : '') +
        '<div class="tabs"><button class="tab' + (f === 'all' ? ' on' : '') + '" data-l="all">All lines</button>' +
        lines.map(function (l) { return '<button class="tab' + (f === l ? ' on' : '') + '" data-l="' + esc(l) + '">' + esc(l) + '</button>'; }).join('') + '</div>';
      if (f === 'all') html += '<p class="muted small">All tasks in serial order. Choose a stream above to see only its tasks.</p>' + visible.map(taskRow).join('') +
        (isAdmin && b.status === 'active' ? '<button class="btn" data-add="Main">+ Add task</button>' : '');
      lines.filter(function (l) { return f === l; }).forEach(function (l) {
        var lt = visible.filter(function (t) { return t.line === l; });
        var done = lt.filter(function (t) { return t.status === 'done' || t.status === 'done_before'; }).length;
        html += '<div class="line-head"><div class="caps">' + esc(l) + ' · ' + done + '/' + lt.length + '</div>' +
          (isAdmin && b.status === 'active' ? '<button class="btn sm" data-add="' + esc(l) + '"><span class="ms">add</span>Task</button>' : '') + '</div>' +
          lt.map(taskRow).join('');
      });
      if (isAdmin && b.status === 'active') html += '<div class="card"><div class="caps">Admin</div><p class="muted">Close the batch when its work is finished. Nothing can be recorded on it afterwards.</p><button class="btn bad" id="closeB">Close batch</button><div id="addBox"></div></div>';
      view.innerHTML = html;
      wireTasks(view);
      var editBatch = document.getElementById('editBatch');
      if (editBatch) editBatch.onclick = function () { go('#/b/' + id + '/edit'); };
      view.querySelectorAll('[data-mode]').forEach(function (el) { el.onclick = function () { batchTab[id] = el.dataset.mode; batchView(id, r); }; });
      view.querySelectorAll('[data-l]').forEach(function (el) { el.onclick = function () { lineFilter[id] = el.dataset.l; batchView(id, r); }; });
      view.querySelectorAll('[data-add]').forEach(function (el) { el.onclick = function () { addTaskForm(id, el.dataset.add); }; });
      var cb = document.getElementById('closeB');
      if (cb) cb.onclick = async function () {
        if (cb.dataset.sure !== '1') { cb.dataset.sure = '1'; cb.textContent = 'Tap again to close ' + b.name; return; }
        try { await api.rpc('tk_batch_close', { p_batch: id }); go('#/'); } catch (e) { fail(e); }
      };
      poll(async function () {
        var next = await Promise.all([api.select('tk_v_batch', { id: 'eq.' + id }), api.select(taskSource, { batch_id: 'eq.' + id, order: 'ord.asc' })]);
        if (current() && JSON.stringify(next) !== JSON.stringify(r)) flagUpdate();
      }, current);
    } catch (e) { if (current()) view.innerHTML = errBox(e); }
  }

  async function addTaskForm(batchId, line) {
    if (!detailsEnabled) { fail(new Error(pendingDetails)); return; }
    var cps = await loadCheckpoints().catch(function () { return []; });
    var box = document.getElementById('addBox');
    if (!box || location.hash !== '#/b/' + batchId) return;
    var pile = /^Turner · (P\d+)$/.exec(line), lab = batchTab[batchId] === 'lab';
    var initial = { line: line, kind: lab ? 'lab' : 'work', photos: lab ? 'none' : 'both', ask: pile && !lab ? 'machine' : 'none' };
    if (pile) { initial.pile = pile[1]; initial.turner_pass = lab ? 'LAB_AFTER_T1' : 'T3'; }
    box.innerHTML = '<form id="addForm" class="stack" style="margin-top:12px"><div class="caps">New task at the end of the ' + esc(line) + ' line</div>' +
      rowFields(initial, cps) +
      (pile ? '<input type="hidden" data-f="pile" value="' + esc(pile[1]) + '"><label class="lbl">Turner stage</label><select data-f="turner_pass">' + (lab ? ['LAB_BEFORE_T1','LAB_AFTER_T1'] : ['T0','T1','T2','T3']).map(function (stage) { return '<option value="' + stage + '">' + stage.replace(/_/g, ' ') + '</option>'; }).join('') + '</select>' : '') +
      '<div class="row"><button class="btn pri" type="submit">Add task</button><button class="btn" type="button" id="cancelAdd">Cancel</button></div></form>';
    box.scrollIntoView({ behavior: 'smooth' });
    document.getElementById('cancelAdd').onclick = function () { box.innerHTML = ''; };
    document.getElementById('addForm').onsubmit = async function (e) {
      e.preventDefault();
      try { await api.rpc('tk_task_add_v3', { p_batch: batchId, p_after: null, p_row: readRowFields(box) }); batchView(batchId); } catch (err) { fail(err, box); }
    };
  }

  function rowFields(r, cps) {
    var opt = function (map, v) { return Object.keys(map).map(function (k) { return '<option value="' + k + '"' + (k === v ? ' selected' : '') + '>' + map[k] + '</option>'; }).join(''); };
    return '<label class="lbl">Task</label><input data-f="title" value="' + esc(r.title || '') + '" placeholder="e.g. Turner T0 — P1">' +
      '<label class="lbl">Stream</label><input data-f="line" value="' + esc(r.line || 'Main') + '"><input type="hidden" data-f="h_ref" value="' + esc(r.h_ref || '') + '">' +
      '<label class="lbl">Description</label><textarea data-f="description" placeholder="Instructions and context for the team">' + esc(r.description || '') + '</textarea>' +
      (r.pile ? '<p class="note">Pile ' + esc(r.pile) + ' · ' + esc(r.turner_pass) + ' — photos and times belong to this pile and pass.</p>' : '') +
      '<label class="lbl">Suggested date and time</label><input type="datetime-local" data-f="suggested_at" value="' + localDateTime(r.suggested_at) + '">' +
      '<label class="lbl">Planned duration (optional)</label><div class="duration-input"><label>Hours<input type="number" min="0" max="8760" step="1" data-f="duration_hours" value="' + (r.planned_duration_minutes == null ? '' : Math.floor(r.planned_duration_minutes / 60)) + '"></label><label>Minutes<input type="number" min="0" max="59" step="1" data-f="duration_minutes" value="' + (r.planned_duration_minutes == null ? '' : r.planned_duration_minutes % 60) + '"></label></div>' +
      '<label class="lbl">Report section (optional heading)</label><input data-f="report_section" maxlength="200" value="' + esc(r.report_section) + '">' +
      '<div class="row"><div class="grow"><label class="lbl">Type</label><select data-f="kind">' + opt(KIND, r.kind || 'work') + '</select></div>' +
      '<div class="grow"><label class="lbl">Photos</label><select data-f="photos">' + opt(PHOTOS, r.photos || 'both') + '</select></div>' +
      '<div class="grow"><label class="lbl">Ask for</label><select data-f="ask">' + opt(ASK, r.ask || 'none') + '</select></div></div>' +
      '<label class="lbl">Lab / control</label><input data-f="control" value="' + esc(r.control || '') + '" placeholder="Moisture, pH, EC">' +
      '<label class="lbl">Lab checkpoint (for Lab rows)</label><select data-f="lab_checkpoint"><option value="">—</option>' +
      (cps || []).map(function (c) { return '<option value="' + esc(c.code) + '"' + (c.code === r.lab_checkpoint ? ' selected' : '') + '>' + esc(c.code + ' · ' + c.name + (c.kind === 'GATE' ? ' (GATE)' : '')) + '</option>'; }).join('') + '</select>';
  }
  function readRowFields(root) {
    var o = {};
    root.querySelectorAll('[data-f]').forEach(function (el) { o[el.dataset.f] = el.value; });
    o.suggested_at = o.suggested_at ? new Date(o.suggested_at).toISOString() : null;
    o.planned_duration_minutes = window.TK.duration.read(o.duration_hours, o.duration_minutes);
    if (Number.isNaN(o.planned_duration_minutes)) throw new Error('Enter whole hours and 0–59 minutes, or leave both blank.');
    delete o.duration_hours; delete o.duration_minutes;
    return o;
  }

  // ── a task ──────────────────────────────────────────────────────────────────────────────────────────────────
  async function taskView(id) {
    var current = screenGuard();
    set('Task', true);
    try {
      var r = await Promise.all([
        api.select(taskSource, { id: 'eq.' + id }),
        api.select('tk_photo', { task_id: 'eq.' + id, order: 'taken_at.asc' }),
        api.select('tk_reading', { task_id: 'eq.' + id, order: 'round.asc,entered_at.asc' }),
        api.select('tk_decision', { task_id: 'eq.' + id, order: 'decided_at.asc' }),
      ]);
      if (!current()) return;
      var t = r[0][0], photos = r[1], reads = r[2], decs = r[3];
      if (!t) { view.innerHTML = '<div class="card">No such task.</div>'; return; }
      var machineList = [], savedResources = null, resourcesReady = false, resourceProblem = '';
      if (window.TK.taskResources && (t.kind === 'work' || t.kind === 'cleaning')) {
        try {
          var resourceReads = await Promise.all([api.select('tk_machine', { order:'name.asc' }),
            api.select('tk_v_task_resources', { task_id:'eq.' + id })]);
          machineList = resourceReads[0]; savedResources = resourceReads[1][0] || null; resourcesReady = true;
          if (savedResources) (savedResources.machines || []).forEach(function (used) {
            var catalogued = machineList.find(function (m) { return m.id === used.machine_id; });
            if (catalogued && used.has_odometer) catalogued.has_odometer = true;
          });
        } catch (error) { resourceProblem = error.message; }
      }
      if (!current()) return;
      if (isAdmin) await loadCheckpoints().catch(function () { return []; });   // the edit form's checkpoint list
      if (!current()) return;
      set(t.batch_name, true);
      var active = t.batch_status === 'active';
      var labRow = t.kind === 'lab' || t.kind === 'lab_gate';
      var html = '<div class="card"><div class="row"><div class="grow"><div class="caps">' + esc(t.line) + ' · #' + t.ord + ' · ' + KIND[t.kind] + '</div>' +
        '<div class="big">' + esc(t.title) + '</div></div>' + chip(t) + '</div>' +
        (t.suggested_at ? '<p class="small" style="margin:8px 0 0"><b>Suggested:</b> ' + whenFull(t.suggested_at) + ' · record the task when it actually happens.</p>' : '') +
        (t.planned_duration_minutes != null ? '<p class="small"><b>Planned duration:</b> ' + window.TK.duration.label(t.planned_duration_minutes) + '</p>' : '') +
        (t.description ? '<div class="note" style="margin-top:10px"><b>Description</b><br>' + esc(t.description) + '</div>' : '') +
        (t.pile ? '<p class="small"><b>Pile:</b> ' + esc(t.pile) + ' · ' + esc(t.turner_pass.replace(/_/g, ' ')) + '</p>' : '') +
        (t.control ? '<p class="muted" style="margin:6px 0 0">' + esc(t.control) + '</p>' : '') +
        (t.started_at ? '<p class="small" style="margin:8px 0 0">Started ' + whenFull(t.started_at) + (t.start_source === 'reported' ? ' (stated by Admin)' : '') + (t.started_by_name ? ' · ' + esc(t.started_by_name) : '') + '</p>' : '') +
        (t.ended_at && !labRow ? '<p class="small" style="margin:2px 0 0">Finished ' + whenFull(t.ended_at) + (t.ended_by_name ? ' · ' + esc(t.ended_by_name) : '') + '</p>' : '') +
        (t.answer ? '<p class="small" style="margin:2px 0 0"><b>' + ASK[t.ask] + ':</b> ' + esc(t.answer) + '</p>' : '') +
        (t.status === 'todo' && !labRow && !t.can_start && t.blocked_by ? '<div class="note" style="margin-top:10px">Waiting for “' + esc(t.blocked_by) + '” — it comes before this in the ' + esc(t.line) + ' line.</div>' : '') +
        '</div>';

      // Supervisor: the work
      if (!labRow && isSup && active) html += workBlock(t, photos, resourcesReady);
      if (!labRow && resourcesReady) html += window.TK.taskResources.render(machineList, savedResources,
        isSup && active && ['work','cleaning'].includes(t.kind) && ['running','done','done_before'].includes(t.status));
      else if (!labRow && isSup && active && resourceProblem) html += '<div class="card muted small">Labour and machine fields are unavailable: ' + esc(resourceProblem) + '. Existing task actions still work.</div>';
      if (!labRow && isSup && active && t.status === 'running') html += finishActionBlock(t, photos);
      // Lab: the readings
      if (labRow) html += await labBlock(t, reads, decs, active);
      // GM: approve or return
      if (t.kind === 'lab_gate' && t.status === 'submitted' && isGm && active) {
        html += '<div class="card"><div class="caps">GM decision</div><label class="lbl">Remark (required to return)</label><textarea id="gmNote"></textarea>' +
          '<div class="row" style="margin-top:10px"><button class="btn pri grow" id="gmOk"><span class="ms">check</span>Approve</button><button class="btn bad grow" id="gmNo">Return to Lab</button></div></div>';
      }
      // Photos (everyone sees them)
      if (photos.length) html += '<div class="card"><div class="caps">Photos · ' + photos.length + '</div><div class="photos">' +
        photos.map(function (p) { return '<img loading="lazy" decoding="async" data-path="' + esc(p.storage_path) + '" alt="' + esc(p.kind) + ' photo" title="' + esc(p.kind + ' · ' + when(p.taken_at)) + '">'; }).join('') + '</div></div>';
      if (t.note) html += '<div class="card"><div class="caps">Notes</div><div class="note">' + esc(t.note) + '</div></div>';
      if (active) html += '<div class="card"><label class="lbl" style="margin-top:0">Add a note</label><div class="row"><input id="noteIn" class="grow" style="width:auto"><button class="btn" id="noteBtn">Add</button></div></div>';
      // Admin: change, catch up
      if (isAdmin && active && detailsEnabled) html += adminBlock(t);
      if (!current()) return;
      view.innerHTML = html;
      wireTask(t, current, resourcesReady ? machineList : null, savedResources, photos);
      view.querySelectorAll('img[data-path]').forEach(function (img) {
        api.signedUrl(img.dataset.path).then(function (u) { img.src = u; img.onclick = function () { openViewer(u); }; }).catch(function () { img.alt = 'photo unavailable'; });
      });
    } catch (e) { if (current()) view.innerHTML = errBox(e); }
  }

  function workBlock(t, photos, resourcesReady) {
    var photoSuffix = t.pile ? ' · ' + t.pile + ' · ' + t.turner_pass : '';
    var has = function (k) { return photos.some(function (p) { return p.kind === k; }); };
    var h = '<div class="card">';
    if (t.status === 'todo') {
      h += t.can_start ? '<button class="btn pri full" id="startB"><span class="ms">play_arrow</span>Start</button><p class="muted small" style="text-align:center">The time is taken when you press Start.</p>'
                       : '<button class="btn full" disabled>Start</button>';
    } else if (t.status === 'running') {
      var needB = t.photos === 'before' || t.photos === 'both', needA = t.photos === 'after' || t.photos === 'both';
      h += '<div class="stack">' +
        (needB ? shoot('before', 'Step 1 · Before photo' + photoSuffix, has('before')) : '') +
        (needA ? shoot('after', 'Step ' + (needB ? '2' : '1') + ' · After photo' + photoSuffix, has('after')) +
          '<p class="muted small photo-finish-reminder">The after photo does not finish the task. Wait for “Uploaded ✓”, then tap <b>Finish task</b> below.</p>' : '') +
        shoot('other', 'Extra photo', false) +
        (t.ask !== 'none' ? '<div><label class="lbl">' + ASK[t.ask] + (t.ask === 'machine' && resourcesReady ? ' reference (optional if selected below)' : '') + '</label><input id="answerIn" placeholder="' + (t.ask === 'machine' ? 'e.g. M1' : 'e.g. 12') + '"></div>' : '') +
        '<div><label class="lbl">Remark (optional)</label><input id="finNote"></div></div>';
    } else {
      h += '<p class="muted" style="margin:0">' + (t.status === 'done_before' ? 'This was done before the app was used.' : 'Done.') + '</p>';
    }
    return h + '</div>';
  }
  function finishPhotoState(t, uploaded) {
    var missing = [];
    if (t.photos === 'before' || t.photos === 'both') { if (!uploaded.before) missing.push('before photo'); }
    if (t.photos === 'after' || t.photos === 'both') { if (!uploaded.after) missing.push('after photo'); }
    if (missing.length) return { ready:false, message:'Still needed: ' + missing.join(' and ') + '. Upload ' + (missing.length > 1 ? 'both photos' : 'that photo') + ', then tap Finish task.' };
    if (t.photos === 'after' || t.photos === 'both') return { ready:true, message:'After photo saved ✓. Now tap Finish task to complete this task. The photo alone does not mark it done.' };
    if (t.photos === 'before') return { ready:true, message:'Before photo saved ✓. Tap Finish task when the work is done.' };
    return { ready:true, message:'When the work is done, tap Finish task to record its finish time.' };
  }
  function finishActionBlock(t, photos) {
    var uploaded = { before:photos.some(function (p) { return p.kind === 'before'; }), after:photos.some(function (p) { return p.kind === 'after'; }) };
    var state = finishPhotoState(t, uploaded);
    var step = t.photos === 'both' ? 3 : t.photos === 'before' || t.photos === 'after' ? 2 : 1;
    return '<div class="card finish-task-card' + (state.ready ? ' ready' : '') + '" id="finishTaskCard"><div class="caps">Final step</div>' +
      '<div class="finish-task-prompt" id="finishPrompt" role="status">' + esc(state.message) + '</div>' +
      '<button class="btn pri full" id="finishB"' + (state.ready ? '' : ' disabled') + '><span class="ms">check_circle</span>Step ' + step + ' · Finish task</button>' +
      '<p class="muted small" style="margin-bottom:0">The finish time is recorded only when you tap this button.</p></div>';
  }
  function shoot(kind, label, done) {
    return '<label class="shoot' + (done ? ' done' : '') + '"><span class="ms" style="font-size:28px">photo_camera</span>' + label + (done ? ' ✓ (tap to add another)' : '') +
      '<input type="file" accept="image/*" capture="environment" data-shoot="' + kind + '"></label>';
  }

  async function labBlock(t, reads, decs, active) {
    var cps = await loadCheckpoints().catch(function () { return []; });
    var cp = cps.filter(function (c) { return c.code === t.lab_checkpoint; })[0];
    var rounds = {}; reads.forEach(function (x) { (rounds[x.round] = rounds[x.round] || []).push(x); });
    var h = '';
    Object.keys(rounds).forEach(function (n) {
      var d = decs.filter(function (x) { return String(x.round) === String(n); })[0];
      h += '<div class="card"><div class="caps">Result · round ' + n + ' · ' + when(rounds[n][0].entered_at) + '</div>' +
        rounds[n].map(function (x) { return '<div class="row small"><span class="grow">' + esc(x.label) + '</span><b class="mono">' + esc(x.value) + (x.unit ? ' ' + esc(x.unit) : '') + '</b></div>'; }).join('') +
        (d ? '<div class="' + (d.approved ? 'ok' : 'error') + '">' + (d.approved ? 'Approved by GM' : 'Returned by GM') + (d.note ? ' — ' + esc(d.note) : '') + ' · ' + when(d.decided_at) + '</div>' : '') + '</div>';
    });
    if (t.kind === 'lab_gate' && t.status === 'submitted') h += '<div class="card"><div class="note">Waiting for the GM’s decision on this Lab result. Other tasks remain open.</div></div>';
    if (isLab && active && t.lab_can_enter) {
      var params = cp && cp.params && cp.params.length ? cp.params : [{ param: 'reading', label: 'Reading', unit: '' }];
      h += '<div class="card"><div class="caps">' + (t.status === 'returned' ? 'Retest — enter the new result' : 'Enter the result') + (cp ? ' · ' + esc(cp.code) : '') + '</div>' +
        '<div class="stack" id="labForm">' + params.map(function (p) {
          var input = p.kind === 'choice' && p.choices ? '<select data-param="' + esc(p.param) + '" data-label="' + esc(p.label) + '" data-unit="' + esc(p.unit || '') + '"><option value=""></option>' +
            (Array.isArray(p.choices) ? p.choices : []).map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select>'
            : '<input data-param="' + esc(p.param) + '" data-label="' + esc(p.label) + '" data-unit="' + esc(p.unit || '') + '"' + (p.kind === 'numeric' ? ' inputmode="decimal"' : '') + '>';
          return '<div><label class="lbl">' + esc(p.label) + (p.unit ? ' (' + esc(p.unit) + ')' : '') + '</label>' + input + '</div>';
        }).join('') +
        '<div id="extraReads"></div><button class="btn sm" type="button" id="moreRead"><span class="ms">add</span>Another reading</button>' +
        shoot('lab', 'Sample photo', false) +
        '<div><label class="lbl">Remark</label><input id="labNote"></div>' +
        '<button class="btn lab full" id="labSubmit"><span class="ms">send</span>' + (t.kind === 'lab_gate' ? 'Submit for GM approval' : 'Save result') + '</button></div></div>';
    } else if (!Object.keys(rounds).length) {
      h += '<div class="card muted">' + (isLab ? 'Nothing to enter.' : 'The Lab has not entered a result yet.') + '</div>';
    }
    return h;
  }

  function adminBlock(t) {
    var h = '<div class="card"><div class="caps">Admin</div>';
    if (t.status === 'todo') {
      h += '<p class="note">To change planned times, durations or streams and update following tasks, <a href="#/b/' + esc(t.batch_id) + '/edit">open the batch row editor</a>.</p><form id="editForm" class="stack">' + rowFields(t, checkpoints || []) + '<div class="row"><button class="btn pri" type="submit">Save changes</button><button class="btn bad" type="button" id="removeT">Remove task</button></div></form>' +
        '<div style="border-top:1px solid var(--line);margin-top:14px;padding-top:10px"><div class="caps">Batch already running before the app?</div>' +
        '<p class="muted small">Mark this and the earlier tasks in the ' + esc(t.line) + ' line as done before the app (no times are invented), or say since when this task has been running.</p>' +
        '<div class="row"><button class="btn" id="doneBefore">Done before the app</button></div>' +
        (t.kind !== 'lab' && t.kind !== 'lab_gate' ? '<label class="lbl">Running since</label><div class="row"><input type="datetime-local" id="sinceIn" class="grow" style="width:auto"><button class="btn" id="sinceBtn">Set</button></div>' : '') + '</div>';
    } else {
      h += '<p class="muted small" style="margin:0">It has started — what happened stays as it happened.</p>';
    }
    return h + '</div>';
  }

  function wireTask(t, current, machineList, savedResources, photos) {
    var uploads = 0;
    var reload = function () { if (current()) taskView(t.id); };
    var photoComplete = { before:photos.some(function (p) { return p.kind === 'before'; }), after:photos.some(function (p) { return p.kind === 'after'; }) };
    function refreshFinishCue() {
      var card = document.getElementById('finishTaskCard'), prompt = document.getElementById('finishPrompt'), button = document.getElementById('finishB');
      if (!card || !prompt || !button) return finishPhotoState(t, photoComplete);
      var state = finishPhotoState(t, photoComplete);
      prompt.textContent = state.message;
      card.classList.toggle('ready', state.ready);
      button.disabled = !state.ready;
      return state;
    }
    var resourceForm = machineList && window.TK.taskResources && window.TK.taskResources.wire(view, machineList, api, t, fail, savedResources && savedResources.revision_id);
    var on = function (id, fn) {
      var el = document.getElementById(id);
      if (el) el.onclick = async function (event) {
        if (el.disabled || !current()) return;
        if ((uploads || resourceForm && resourceForm.busy()) && id !== 'moreRead') { fail(new Error('Wait for the photo upload to finish.')); return; }
        el.disabled = true;
        try { await fn(event); } finally { el.disabled = false; }
      };
    };
    on('startB', async function () { try { await api.rpc('tk_start', { p_task: t.id }); reload(); } catch (e) { fail(e); } });
    on('finishB', async function () {
      var a = document.getElementById('answerIn'), n = document.getElementById('finNote');
      try {
        if (resourceForm) {
          var values = resourceForm.read();
          await api.rpc('tk_finish_with_resources', { p_task:t.id, p_answer:a ? a.value : null,
            p_note:n ? n.value : null, p_labour_count:values.labour_count, p_machines:values.machines,
            p_expected_revision:resourceForm.expected() });
        } else await api.rpc('tk_finish', { p_task:t.id, p_answer:a ? a.value : null, p_note:n ? n.value : null });
        reload();
      } catch (e) { fail(e); }
    });
    on('resourceSaveB', async function () {
      try {
        var values = resourceForm.read();
        var savedId = await api.rpc('tk_resources_record', { p_task:t.id, p_labour_count:values.labour_count,
          p_machines:values.machines,p_expected_revision:resourceForm.expected() });
        resourceForm.saved(savedId);
        var status = document.getElementById('resourceStatus'); if (status) status.textContent = 'Saved. Refresh to see the latest record.';
      } catch (e) { fail(e); }
    });
    view.querySelectorAll('[data-shoot]').forEach(function (inp) {
      inp.onchange = async function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        var lab = inp.closest('.shoot'); lab.style.opacity = .5; inp.disabled = true; uploads++;
        var status = lab.querySelector('[data-upload-status]') || document.createElement('span');
        status.dataset.uploadStatus = ''; status.className = 'small'; status.textContent = 'Preparing and uploading…'; lab.appendChild(status);
        try {
          await api.addPhoto(t.batch_id, t.id, inp.dataset.shoot, f);
          lab.classList.add('done');
          if (inp.dataset.shoot === 'before' || inp.dataset.shoot === 'after') {
            photoComplete[inp.dataset.shoot] = true;
            var next = refreshFinishCue();
            status.textContent = next.ready ? 'Uploaded ✓ — now tap Finish task below' : 'Uploaded ✓ — complete the other required photo';
          } else status.textContent = 'Uploaded ✓ — tap to add another';
          // Do not reload: the machine, remarks and Lab readings must remain untouched.
        } catch (e) { status.textContent = 'Upload not confirmed'; if (current()) fail(e); }
        finally { lab.style.opacity = 1; inp.disabled = false; inp.value = ''; uploads--; }
      };
    });
    on('moreRead', function () {
      document.getElementById('extraReads').insertAdjacentHTML('beforeend', '<div class="row"><input class="grow" style="width:auto" placeholder="What (e.g. Temperature °C)" data-free-label><input class="grow" style="width:auto" placeholder="Value" data-free-value></div>');
    });
    on('labSubmit', async function () {
      var reads = [];
      view.querySelectorAll('#labForm [data-param]').forEach(function (el) { if (el.value.trim()) reads.push({ param: el.dataset.param, label: el.dataset.label, value: el.value.trim(), unit: el.dataset.unit || null }); });
      view.querySelectorAll('#extraReads .row').forEach(function (r) {
        var l = r.querySelector('[data-free-label]').value.trim(), v = r.querySelector('[data-free-value]').value.trim();
        if (l && v) reads.push({ param: '', label: l, value: v, unit: null });
      });
      try { await api.rpc('tk_lab_submit', { p_task: t.id, p_readings: reads, p_note: (document.getElementById('labNote') || {}).value || null }); reload(); } catch (e) { fail(e); }
    });
    on('gmOk', async function () { try { await api.rpc('tk_gm_decide', { p_task: t.id, p_approve: true, p_note: document.getElementById('gmNote').value || null }); reload(); } catch (e) { fail(e); } });
    on('gmNo', async function () { try { await api.rpc('tk_gm_decide', { p_task: t.id, p_approve: false, p_note: document.getElementById('gmNote').value || null }); reload(); } catch (e) { fail(e); } });
    on('noteBtn', async function () { var v = document.getElementById('noteIn').value.trim(); if (!v) return; try { await api.rpc('tk_note', { p_task: t.id, p_note: v }); reload(); } catch (e) { fail(e); } });
    var ef = document.getElementById('editForm');
    if (ef) {
      ['suggested_at','duration_hours','duration_minutes','line'].forEach(function(key){ef.querySelector('[data-f="'+key+'"]').disabled=true;});
      ef.onsubmit = async function (e) { e.preventDefault(); try { var row=readRowFields(ef); row.suggested_at=t.suggested_at;row.planned_duration_minutes=t.planned_duration_minutes;row.line=t.line;await api.rpc('tk_task_edit_v3', { p_task: t.id, p_row: row }); reload(); } catch (err) { fail(err); } };
    }
    on('removeT', async function (e) {
      var b = e.currentTarget; if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tap again to remove'; return; }
      try {
        var plan = await api.rpc('tk_batch_plan_get', {p_batch:t.batch_id});
        var existing = plan.rows.find(function (row) { return row.id === t.id; });
        if (!existing) throw new Error('This task is no longer in the batch. Refresh before making another change.');
        if (existing._locked) throw new Error('This task has recorded work or notes and cannot be removed.');
        await api.rpc('tk_batch_plan_save', {p_batch:t.batch_id,p_expected:plan.token,p_name:plan.batch.name,p_note:plan.batch.note,
          p_rows:plan.rows.filter(function (row) { return row.id !== t.id; })});
        go('#/b/' + t.batch_id);
      } catch (err) { fail(err); }
    });
    on('doneBefore', async function () { try { await api.rpc('tk_done_before', { p_task: t.id }); go('#/b/' + t.batch_id); } catch (e) { fail(e); } });
    on('sinceBtn', async function () {
      var v = document.getElementById('sinceIn').value; if (!v) return;
      try { await api.rpc('tk_running_since', { p_task: t.id, p_at: new Date(v).toISOString() }); reload(); } catch (e) { fail(e); }
    });
  }

  function openViewer(url) {
    var v = document.createElement('div');
    v.className = 'viewer';
    v.innerHTML = '<div class="vb"><button class="btn sm">Close</button></div><div class="vi"><img src="' + esc(url) + '" alt="photo"></div>';
    v.onclick = function () { v.remove(); };
    document.body.appendChild(v);
  }

  // ── Factory-wide planned times (Admin) ────────────────────────────────────────────────────────────────────
  async function processTimePane(pane) {
    var loaded = await Promise.all([
      api.select('tk_v_sop', { status: 'eq.published', order: 'name.asc,version.desc' }),
      api.select('tk_process_time_standard', { order: 'line.asc,title.asc' })
    ]);
    if (!pane.isConnected || homeTab !== 'timing') return;
    var latest = loaded[0].filter(function (s) { return s.is_latest_published; });
    var groups = await Promise.all(latest.map(function (s) { return api.select('tk_sop_row', { sop_id: 'eq.' + s.id, order: 'ord.asc' }); }));
    if (!pane.isConnected || homeTab !== 'timing') return;
    var standards = loaded[1], byKey = new Map(standards.map(function (s) { return [s.process_key, s]; }));
    var rows = window.TK.processTimeSop.catalog(groups.flat());
    rows.forEach(function (r) {
      var saved = byKey.get(r.process_key);
      if (saved) { r.templateTitle = r.title; r.title = saved.title; r.planned_duration_minutes = saved.planned_duration_minutes; r.saved = true; }
    });
    var known = new Set(rows.map(function (r) { return r.process_key; }));
    standards.forEach(function (s) { if (!known.has(s.process_key)) rows.push(Object.assign({ saved: true, occurrences: 0 }, s)); });
    rows.sort(function (a, b) { return a.line.localeCompare(b.line) || a.title.localeCompare(b.title); });
    pane.innerHTML = '<div class="card"><div class="big">Process Time SOP</div>' +
      '<p class="muted">One factory-wide list of <b>standard planned hours</b> for process, rest, cleaning and Lab tasks. This is separate from the Task SOP (task order, descriptions and checks) and from actual times recorded in Factory Operations.</p>' +
      '<p class="muted small">A saved standard is used when preparing every new batch from any Task SOP. You can edit its display name here and override its duration in an individual batch. To rename the actual tasks people see and complete, edit the Task SOP; existing batches and completed work are never renamed here.</p>' +
      '<div class="row"><label class="grow lbl" for="processTimeSearch">Find task<input id="processTimeSearch" type="search" placeholder="e.g. hopper pass, T0, paddy soak"></label><button class="btn pri" id="saveProcessTimes" type="button">Save standards</button></div><div id="processTimeStatus" role="status"></div></div>' +
      '<div class="card"><div class="big">Add a standard for a new task</div><div class="row"><label class="grow lbl">Task name<input id="newProcessTitle" placeholder="e.g. Hopper Pass 3"></label><label class="grow lbl">Stream<input id="newProcessLine" value="Main"></label><label class="grow lbl">Type<select id="newProcessKind"><option value="work">Work</option><option value="rest">Rest</option><option value="cleaning">Cleaning</option><option value="lab">Lab</option><option value="lab_gate">Lab gate</option></select></label><button class="btn" id="addProcessTime" type="button">Add to list</button></div></div>' +
      '<div class="card"><p id="processTimeCount" class="muted small"></p><div class="grid-wrap"><table class="sop process-time-table"><thead><tr><th>Standard name · editable</th><th>Stream / type</th><th>Standard hours</th><th>Minutes</th><th>Source</th></tr></thead><tbody id="processTimeRows"></tbody></table></div><p class="muted small">Blank means the standard is not known; zero means an instantaneous checkpoint. These are planning estimates, not measured averages.</p></div>';
    var body = pane.querySelector('#processTimeRows'), status = pane.querySelector('#processTimeStatus');
    var dirty = false;
    function render() {
      var q = pane.querySelector('#processTimeSearch').value.trim().toLowerCase();
      var visible = rows.map(function (r, i) { return { r: r, i: i }; }).filter(function (x) {
        return !q || (x.r.title + ' ' + (x.r.templateTitle || '') + ' ' + x.r.line + ' ' + x.r.kind + ' ' + (x.r.turner_pass || '')).toLowerCase().includes(q);
      });
      pane.querySelector('#processTimeCount').textContent = visible.length + ' of ' + rows.length + ' standards · ' + standards.length + ' saved';
      body.innerHTML = visible.map(function (x) {
        var r = x.r, mins = r.planned_duration_minutes;
        return '<tr data-process-row="' + x.i + '"><td><input data-process-title type="text" maxlength="200" aria-label="Standard name for ' + esc(r.title) + '" value="' + esc(r.title) + '">' +
          (r.templateTitle && r.templateTitle !== r.title ? '<div class="muted small">Task SOP name: ' + esc(r.templateTitle) + '</div>' : '') +
          (r.turner_pass ? '<div class="muted small">All Turner piles · ' + esc(r.turner_pass) + '</div>' : '') + '</td><td>' + esc(r.line) + ' · ' + esc(KIND[r.kind] || r.kind) + '</td>' +
          '<td><input data-process-hours type="number" min="0" max="8760" step="1" aria-label="' + esc(r.title) + ' hours" value="' + (mins == null ? '' : Math.floor(mins / 60)) + '"></td>' +
          '<td><input data-process-minutes type="number" min="0" max="59" step="1" aria-label="' + esc(r.title) + ' minutes" value="' + (mins == null ? '' : mins % 60) + '"></td>' +
          '<td class="small muted">' + (r.saved ? 'Saved standard' : r.conflicting ? 'Template durations differ · review' : 'From Task SOP · not saved') + '</td></tr>';
      }).join('');
      body.querySelectorAll('input').forEach(function (el) { el.oninput = function () { dirty = true; pane.dataset.processTimeDirty = '1'; status.textContent = 'Unsaved changes. Save standards to use them for new batches.'; }; });
    }
    function capture() {
      body.querySelectorAll('tr[data-process-row]').forEach(function (tr) {
        var r = rows[Number(tr.dataset.processRow)], title = tr.querySelector('[data-process-title]').value.trim(), h = tr.querySelector('[data-process-hours]').value, m = tr.querySelector('[data-process-minutes]').value;
        if (!title || title.length > 200) throw new Error('Each standard needs a name of 1–200 characters.');
        r.title = title;
        if (!r.saved && !r.occurrences) r.process_key = window.TK.processTimeSop.key(r);
        var minutes = window.TK.duration.read(h, m);
        if (Number.isNaN(minutes)) throw new Error('Enter valid hours and minutes for ' + r.title + '.');
        r.planned_duration_minutes = minutes;
      });
      if (new Set(rows.map(function (r) { return r.process_key; })).size !== rows.length) {
        throw new Error('Two standards now have the same task identity. Give the new task a distinct name.');
      }
    }
    pane.querySelector('#processTimeSearch').oninput = function () {
      try { capture(); render(); } catch (e) { status.innerHTML = errBox(e); }
    };
    pane.querySelector('#addProcessTime').onclick = function () {
      try {
        capture();
        var title = pane.querySelector('#newProcessTitle').value.trim(), line = pane.querySelector('#newProcessLine').value.trim();
        var kind = pane.querySelector('#newProcessKind').value;
        if (!title || !line) throw new Error('Enter a task name and stream.');
        var row = { title: title, line: line, kind: kind, planned_duration_minutes: null, occurrences: 0 };
        row.process_key = window.TK.processTimeSop.key(row);
        if (rows.some(function (r) { return r.process_key === row.process_key; })) throw new Error('That task and stream already have a standard. Find it in the list.');
        rows.push(row); rows.sort(function (a, b) { return a.line.localeCompare(b.line) || a.title.localeCompare(b.title); });
        pane.querySelector('#processTimeSearch').value = title;
        pane.querySelector('#newProcessTitle').value = '';
        dirty = true; pane.dataset.processTimeDirty = '1'; render(); status.textContent = 'New standard added to this form. Set its time and press Save standards.';
      } catch (e) { status.innerHTML = errBox(e); }
    };
    pane.querySelector('#saveProcessTimes').onclick = async function (event) {
      var button = event.currentTarget;
      try {
        capture();
        var payload = rows.map(function (r) { return {
          process_key: r.process_key, title: r.title, line: r.line, kind: r.kind,
          turner_pass: r.turner_pass || null, planned_duration_minutes: r.planned_duration_minutes
        }; });
        button.disabled = true;
        var count = await api.rpc('tk_process_time_save', { p_rows: payload });
        dirty = false; pane.dataset.processTimeDirty = '0'; rows.forEach(function (r) { r.saved = true; });
        status.innerHTML = '<div class="ok">Saved ' + Number(count) + ' factory-wide planned times. New batches will use them; existing batches are unchanged.</div>';
        render();
      } catch (e) { status.innerHTML = errBox(e); }
      finally { button.disabled = false; }
    };
    render();
  }

  // ── Task SOPs (Admin) ───────────────────────────────────────────────────────────────────────────────────────
  async function sopsPane(pane) {
    var ss = await api.select('tk_v_sop', { order: 'name.asc,version.desc' });
    var fam = {}; var order = [];
    ss.forEach(function (s) { if (!fam[s.family_id]) { fam[s.family_id] = []; order.push(s.family_id); } fam[s.family_id].push(s); });
    pane.innerHTML = '<div class="card"><div class="big">Task SOPs</div><p class="muted">These define the task sequence, streams, descriptions, Lab checks and photo requirements. Standard planned durations live in the separate <b>Process Time SOP</b> tab.</p></div><button class="btn pri full" id="newSop" style="margin-top:8px"><span class="ms">add</span>New Task SOP from template</button>' +
      '<div id="newSopBox"></div>' +
      (order.length ? order.map(function (fid) {
        var vs = fam[fid];
        return '<div class="card"><div class="big">' + esc(vs[0].name) + '</div>' +
          vs.map(function (s) {
            return '<button class="task" data-sop="' + s.id + '"><span class="num">v' + s.version + '</span><span class="grow"><b>' +
              (s.status === 'draft' ? 'Draft — being edited' : s.status === 'published' ? 'Published' : 'Archived') + '</b><br><span class="muted small">' +
              s.row_count + ' rows · ' + s.batch_count + ' batches' + (s.published_at ? ' · ' + when(s.published_at) : '') + (s.note ? ' · ' + esc(s.note) : '') + '</span></span>' +
              '<span class="chip ' + (s.status === 'draft' ? 'c-run' : s.is_latest_published ? 'c-done' : 'c-todo') + '">' + (s.status === 'draft' ? 'draft' : s.is_latest_published ? 'latest' : 'older') + '</span></button>';
          }).join('') + '</div>';
      }).join('') : '<div class="card muted">No SOP yet. Press <b>New SOP</b>, then type or paste the rows.</div>');
    pane.querySelectorAll('[data-sop]').forEach(function (el) { el.onclick = function () { go('#/sop/' + el.dataset.sop); }; });
    if (!pane.isConnected) return;
    pane.querySelector('#newSop').onclick = function () {
      var box = document.getElementById('newSopBox');
      box.innerHTML = '<form class="card stack" id="nsf"><label class="lbl" style="margin-top:0">SOP name</label><input id="nsName" placeholder="e.g. Compost standard (Sep 2026)" required>' +
        '<label class="lbl">Start from</label><select id="nsSource">' + ss.filter(function (s) { return s.status === 'published'; }).map(function (s) { return '<option value="' + s.id + '"' + (s.family_id === '14600000-0000-4000-8000-000000000001' && s.is_latest_published ? ' selected' : '') + '>' + esc(s.name) + ' · v' + s.version + '</option>'; }).join('') + '<option value="">Blank table</option></select>' +
        '<label class="lbl">Example batch start — bagasse wetting</label><input type="datetime-local" id="nsH0" value="' + localDateTime(new Date()) + '" required>' +
        '<label class="lbl">Note</label><input id="nsNote"><button class="btn pri" type="submit">Create and open the table</button></form>';
      document.getElementById('nsf').onsubmit = async function (e) {
        e.preventDefault();
        if (!detailsEnabled) { fail(new Error(pendingDetails), box); return; }
        var button = e.currentTarget.querySelector('button[type="submit"]'); button.disabled = true;
        try {
          var sourceId = document.getElementById('nsSource').value;
          var rows = sourceId ? await api.select('tk_sop_row', { sop_id: 'eq.' + sourceId, order: 'ord.asc' }) : [];
          var id = await api.rpc('tk_sop_create_v3', { p_name: document.getElementById('nsName').value, p_note: document.getElementById('nsNote').value, p_rows: rows, p_reference_h0: new Date(document.getElementById('nsH0').value).toISOString() }); go('#/sop/' + id);
        }
        catch (err) { fail(err, box); }
        finally { button.disabled = false; }
      };
    };
  }

  var sopRows = null, sopDirty = false, sopReferenceH0 = null;
  async function sopView(id) {
    var current = screenGuard();
    set('SOP', true, true);
    try {
      var r = await Promise.all([api.select('tk_sop', { id: 'eq.' + id }), api.select('tk_sop_row', { sop_id: 'eq.' + id, order: 'ord.asc' }), loadCheckpoints().catch(function () { return []; }), api.select('tk_process_time_standard')]);
      if (!current()) return;
      var s = r[0][0];
      if (!s) { view.innerHTML = '<div class="card">No such SOP.</div>'; return; }
      sopRows = window.TK.processTimeSop.apply(r[1], r[3]);
      sopReferenceH0 = s.reference_h0;
      sopDirty = false;
      set(s.name + ' v' + s.version, true, true);
      renderSop(s, r[2]);
    } catch (e) { if (current()) view.innerHTML = errBox(e); }
  }

  function renderSop(s, cps) {
    var draft = s.status === 'draft' && isAdmin && detailsEnabled;
    var head = '<div class="card"><div class="big">Task SOP · sequence and instructions</div><p class="muted small">Planned durations shown below come from the Process Time SOP where saved. Change factory standards there; change a single batch’s duration in that batch’s editor.</p>' +
      (draft ? '<label class="lbl">SOP name</label><input id="sName" value="' + esc(s.name) + '"><label class="lbl">Example batch start — bagasse wetting</label><input type="datetime-local" id="sH0" value="' + localDateTime(sopReferenceH0) + '" required><label class="lbl">Note</label><input id="sNote" value="' + esc(s.note || '') + '">'
        : '<div class="big">' + esc(s.name) + ' · v' + s.version + '</div><p class="muted">' + esc(s.note || '') + '</p><p class="muted">Example batch start: ' + whenFull(sopReferenceH0) + '</p>') +
      '<div class="row" style="margin-top:12px">' +
      (draft ? '<button class="btn pri" id="saveSop">Save template</button><button class="btn" id="pubSop">Publish template</button><button class="btn" id="pasteBtn">Paste from Excel</button><button class="btn bad" id="delSop">Delete draft</button>'
        : (isAdmin ? '<button class="btn pri" id="useSop">Use for new batch</button><button class="btn" id="newVer">Edit reusable template</button>' : '')) +
      '</div><div id="sopMsg"></div><div id="pasteBox"></div></div><div id="sopGrid"></div>';
    view.innerHTML = (!detailsEnabled ? '<div class="note">' + pendingDetails + '</div>' : '') + head;
    var grid = window.TK.scheduleGrid.mount(document.getElementById('sopGrid'), {
      rows: sopRows, base: sopReferenceH0, checkpoints: cps, readonly: !draft, durationReadonly: true,
      onChange: function () { sopDirty = true; }
    });
    var msg = function (html) { document.getElementById('sopMsg').innerHTML = html; };
    var on = function (id, fn) { var el = document.getElementById(id); if (el) el.onclick = fn; };
    var ref = document.getElementById('sH0');
    if (ref) ref.onchange = function () {
      if (!ref.value) return;
      sopReferenceH0 = new Date(ref.value).toISOString();
      grid.setBase(sopReferenceH0); sopDirty = true;
    };
    var save = async function () {
      if (!ref.value) throw new Error('Choose an example batch start.');
      grid.validate(false);
      return api.rpc('tk_sop_save_v3', { p_sop: s.id, p_name: document.getElementById('sName').value,
        p_note: document.getElementById('sNote').value, p_rows: grid.read(), p_reference_h0: sopReferenceH0 });
    };
    on('saveSop', async function (e) {
      e.currentTarget.disabled = true;
      try { var n = await save(); sopDirty = false; msg('<div class="ok">Saved — ' + n + ' rows.</div>'); }
      catch (err) { msg(errBox(err)); }
      finally { var b = document.getElementById('saveSop'); if (b) b.disabled = false; }
    });
    on('pubSop', async function (e) {
      var b = e.currentTarget;
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tap again to publish'; return; }
      b.disabled = true;
      try { grid.validate(); await save(); await api.rpc('tk_sop_publish', { p_sop: s.id }); sopDirty = false; sopView(s.id); }
      catch (err) { msg(errBox(err)); b.disabled = false; }
    });
    on('useSop', function () { go('#/new?sop=' + s.id); });
    on('newVer', async function () {
      try { if (!detailsEnabled) throw new Error(pendingDetails); var id = await api.rpc('tk_sop_new_version_v3', { p_from: s.id }); go('#/sop/' + id); }
      catch (e) { msg(errBox(e)); }
    });
    on('delSop', async function (e) {
      var b = e.currentTarget;
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tap again to delete this draft'; return; }
      try { await api.rpc('tk_sop_delete_draft', { p_sop: s.id }); sopDirty = false; homeTab = 'sops'; go('#/'); }
      catch (err) { msg(errBox(err)); }
    });
    on('pasteBtn', function () {
      document.getElementById('pasteBox').innerHTML = '<p class="muted">Paste task names, or the original Time / H-hour / Task / Lab-control table. Check and set the calendar dates after adding.</p><textarea id="pasteIn" rows="6"></textarea><button class="btn" id="pasteGo">Add rows</button>';
      document.getElementById('pasteGo').onclick = function () {
        grid.append(parsePaste(document.getElementById('pasteIn').value, 'Main'));
        document.getElementById('pasteBox').innerHTML = '';
      };
    });
    window.onbeforeunload = function () { return sopDirty ? 'Unsaved changes' : undefined; };
  }

  // Excel copies rows as tab-separated lines; a cell with a line break inside comes wrapped in "quotes".
  function tsv(text) {
    var TAB = String.fromCharCode(9), NL = String.fromCharCode(10), CR = String.fromCharCode(13);
    var rows = [], row = [], cell = '', q = false, t = String(text || '').split(CR + NL).join(NL).split(CR).join(NL);
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (q) { if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; continue; }
      if (ch === '"' && cell === '') { q = true; continue; }
      if (ch === TAB) { row.push(cell); cell = ''; continue; }
      if (ch === NL) { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
      cell += ch;
    }
    row.push(cell); rows.push(row);
    // A wrapped cell pasted WITHOUT quotes arrives as two short lines (2 cells, then 3): join them back.
    var out = [];
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j].map(function (x) { return x.replace(/\s+/g, ' ').trim(); });
      var nx = rows[j + 1];
      if (r.length === 2 && nx && nx.length === 3) { out.push([r[0], (r[1] + ' ' + nx[0]).trim(), nx[1], nx[2]]); j++; continue; }
      out.push(r);
    }
    return out;
  }

  function parsePaste(text, line) {
    var out = [];
    tsv(text).forEach(function (c) {
      if (!c.join('')) return;
      if (/^(time|h-hour|process|task)$/i.test(c[0]) || /^process$/i.test(c[2] || '')) return;       // a header row
      var h = '', title = '', control = '';
      if (c.length >= 4) { h = c[1]; title = c[2]; control = c.slice(3).join(' '); }
      else if (c.length === 3) { h = c[0]; title = c[1]; control = c[2]; }
      else if (c.length === 2) { h = c[0]; title = c[1]; }
      else { title = c[0]; }
      if (!title) return;
      var gate = /\bgate\b/i.test(control);
      out.push({ line: line || 'Main', h_ref: h, title: title, kind: gate ? 'lab_gate' : 'work', control: control === '—' ? '' : control, lab_checkpoint: '', photos: gate ? 'none' : 'both', ask: 'none' });
    });
    return out;
  }

  // The source SOP and batch start stay fixed; dates below belong to this batch only.
  async function editBatchView(id) {
    var current = screenGuard();
    set('Edit batch · rows', true, true);
    if (!isAdmin) { view.innerHTML = '<div class="card">Only Admin edits batch plans.</div>'; return; }
    view.innerHTML = '<div class="card muted">Loading this batch’s rows…</div>';
    try {
      var loaded = await Promise.all([api.rpc('tk_batch_plan_get', { p_batch: id }), loadCheckpoints()]);
      if (!current()) return;
      var plan = loaded[0], b = plan.batch, dirty = false, saving = false;
      if (b.status !== 'active') { view.innerHTML = '<div class="card">This batch is closed. Its records are read-only.</div>'; return; }
      var originals = {};
      var rows = plan.rows.map(function (t) {
        originals[t.id] = t;
        return Object.assign({}, t, { suggested_offset_minutes: t.suggested_at ? (Date.parse(t.suggested_at) - Date.parse(b.h0)) / 60000 : null });
      });
      var paddyReference = rows.map(function (r) { return Object.assign({}, r); });
      view.innerHTML = '<form id="ebForm"><fieldset id="ebFields" style="border:0;padding:0;margin:0;min-width:0"><div class="card"><div class="big">Edit this batch’s tasks</div>' +
        '<p class="muted">Change upcoming rows, dates, descriptions and order. Add, duplicate or remove tasks. Your reusable SOP stays unchanged.</p>' +
        '<label class="lbl" for="ebName">Batch name</label><input id="ebName" value="' + esc(b.name) + '" required>' +
        '<label class="lbl" for="ebNote">Batch note</label><input id="ebNote" value="' + esc(b.note) + '">' +
        '<p class="muted small">Batch start: ' + whenFull(b.h0) + ' · Edit each suggested date in the rows below.</p>' +
        '<div class="note">Rows with recorded work, notes, photos or Lab results are protected. Put new process tasks after recorded work in their stream. Task numbers update automatically when you change the plan.</div></div>' +
        '<div id="ebConvergence"></div><div id="ebGrid"></div><div class="plan-submit"><div id="ebMsg" role="status" aria-live="polite"></div><div class="row"><button class="btn pri" type="submit" id="saveBatch">Save batch changes</button><button class="btn" type="button" id="cancelBatch">Cancel</button></div></div></fieldset></form>';
      var paddyTimer;
      var changed = function () { dirty = true; clearTimeout(paddyTimer); paddyTimer = setTimeout(function () {
        if (current() && grid) mountConvergence(document.getElementById('ebConvergence'), grid.read(), paddyReference, b.h0, grid);
      }, 180); };
      var grid = window.TK.scheduleGrid.mount(document.getElementById('ebGrid'), {
        rows: rows, base: b.h0, checkpoints: loaded[1], allowPileResize: false, preciseDates: true, onChange: changed
      });
      mountConvergence(document.getElementById('ebConvergence'), grid.read(), paddyReference, b.h0, grid);
      var form = document.getElementById('ebForm'), fields = document.getElementById('ebFields'), message = document.getElementById('ebMsg');
      var name = document.getElementById('ebName'), note = document.getElementById('ebNote');
      name.oninput = changed; note.oninput = changed;
      editingPlan = { hash: location.hash, dirty: function () { return dirty; }, saving: function () { return saving; } };
      window.onbeforeunload = function () { return dirty || saving ? 'Unsaved batch changes' : undefined; };
      document.getElementById('cancelBatch').onclick = function () { go('#/b/' + id); };
      form.onsubmit = async function (e) {
        e.preventDefault(); if (saving) return;
        try {
          grid.validate();
          if (!name.value.trim()) throw new Error('Give the batch a name.');
          var proposed = grid.read().map(function (row) {
            var original = originals[row.id];
            var at = row.suggested_offset_minutes == null ? null : new Date(Date.parse(b.h0) + row.suggested_offset_minutes * 60000).toISOString();
            // Preserve timestamp seconds on untouched dates and all protected rows.
            if (original && (row._locked || localDateTime(at) === localDateTime(original.suggested_at))) at = original.suggested_at;
            return Object.assign({}, row, { suggested_at: at });
          });
          var removed = plan.rows.filter(function (t) { return !proposed.some(function (r) { return r.id === t.id; }); }).length;
          if (removed && !window.confirm('Save this plan and remove ' + removed + ' unrecorded task row(s)? Recorded work and photos are kept.')) return;
          saving = true; fields.disabled = true; message.textContent = 'Saving batch changes…';
          await api.rpc('tk_batch_plan_save', { p_batch: id, p_expected: plan.token, p_name: name.value.trim(), p_note: note.value, p_rows: proposed });
          dirty = false; saving = false; editingPlan = null; window.onbeforeunload = null;
          if (current()) go('#/b/' + id);
        } catch (err) {
          if (current()) message.innerHTML = errBox(err);
        } finally { saving = false; fields.disabled = false; }
      };
    } catch (e) { if (current()) view.innerHTML = errBox(e); }
  }

  // ── new batch (Admin) ───────────────────────────────────────────────────────────────────────────────────────
  async function newBatchView() {
    var current = screenGuard();
    set('New batch · edit SOP', true, true);
    if (!isAdmin) { view.innerHTML = '<div class="card">Only Admin creates batches.</div>'; return; }
    view.innerHTML = '<div class="card muted">Loading your ready template…</div>';
    try {
      var loaded = await Promise.all([api.select('tk_v_sop', { status: 'eq.published', order: 'name.asc,version.desc' }), loadCheckpoints().catch(function () { return []; }), api.select('tk_process_time_standard')]);
      if (!current()) return;
      var ss = loaded[0], grid = null, dirty = false, request = 0;
      var preferred = new URLSearchParams(location.hash.split('?')[1] || '').get('sop') || '14600000-0000-4000-8000-000000000001';
      // Prefer the latest published revision of the ready template.
      var source = ss.find(function (s) { return s.id === preferred; });
      if (source && !location.hash.includes('?sop=')) source = ss.find(function (s) { return s.family_id === source.family_id && s.is_latest_published; }) || source;
      if (!source) source = ss[0];
      if (!source) { view.innerHTML = '<div class="card">No published template is available yet.</div>'; return; }
      view.innerHTML = '<form id="nbf"><div class="card"><div class="big">Your batch Task SOP is ready to edit</div><p class="muted">Enter the bagasse-wetting start. The factory-wide Process Time SOP fills standard planned durations. You may override them in this batch; changing a planned start or duration updates following timings. Actual records are never changed.</p>' +
        '<div class="row"><div class="grow"><label class="lbl" for="nbName">Batch name</label><input id="nbName" placeholder="e.g. 182,183,184" required></div>' +
        '<div class="grow"><label class="lbl" for="nbH0">Batch start — bagasse wetting</label><input type="datetime-local" id="nbH0" value="' + localDateTime(new Date()) + '" required></div></div>' +
        '<label class="lbl" for="nbSop">Start from template</label><select id="nbSop">' + ss.map(function (s) {
          return '<option value="' + s.id + '"' + (s.id === source.id ? ' selected' : '') + '>' + esc(s.name) + ' · v' + s.version + ' · ' + s.row_count + ' rows</option>';
        }).join('') + '</select><p class="muted small">Changing the batch start shifts all suggested dates together, including preparation before the start. You can edit any date separately.</p>' +
        '<label class="lbl" for="nbNote">Batch note</label><input id="nbNote"><div id="templateNote" class="note" style="margin-top:12px"></div></div><div id="nbConvergence"></div><div id="nbGrid"></div>' +
        '<div class="plan-submit"><div id="nbMsg"></div><div class="row"><button class="btn pri" id="createBatch" type="submit" disabled>Create batch with these tasks</button><button class="btn" type="button" id="savePlanTemplate" disabled>Save a reusable copy</button></div></div></form>';
      var picker = document.getElementById('nbSop'), date = document.getElementById('nbH0'), submit = document.getElementById('createBatch'), copy = document.getElementById('savePlanTemplate');
      var msg = function (html) { document.getElementById('nbMsg').innerHTML = html; };
      var activeSource = source.id, paddyReference = [], paddyTimer;
      async function loadRows() {
        var ticket = ++request, chosen = picker.value;
        grid = null; submit.disabled = true; copy.disabled = true;
        document.getElementById('nbGrid').innerHTML = '<div class="card muted">Loading template…</div>';
        try {
          var rows = await api.select('tk_sop_row', { sop_id: 'eq.' + chosen, order: 'ord.asc' });
          if (!current() || ticket !== request || !document.getElementById('nbGrid')) return;
          if (!detailsEnabled && chosen === '14600000-0000-4000-8000-000000000001') rows = window.TK.turnerPlan.completeTemplate(rows);
          rows = window.TK.processTimeSop.apply(rows, loaded[2]);
          paddyReference = rows.map(function (r) { return Object.assign({}, r); });
          grid = window.TK.scheduleGrid.mount(document.getElementById('nbGrid'), {
            rows: rows, base: new Date(date.value).toISOString(), checkpoints: loaded[1],
            onChange: function () { dirty = true; clearTimeout(paddyTimer); paddyTimer = setTimeout(function () {
              if (current() && grid) mountConvergence(document.getElementById('nbConvergence'), grid.read(), paddyReference, new Date(date.value).toISOString(), grid);
            }, 180); }
          });
          mountConvergence(document.getElementById('nbConvergence'), grid.read(), paddyReference, new Date(date.value).toISOString(), grid);
          activeSource = chosen; dirty = false;
          var unset=rows.filter(function(r){return r.planned_duration_minutes==null;}).length;
          document.getElementById('templateNote').textContent = ((ss.find(function (s) { return s.id === chosen; }) || {}).note || 'Edit this copy to suit the batch.') + (unset ? ' '+unset+' durations are still unknown. Template dates are kept; unknown durations are not guessed. Set those standards in Process Time SOP or override them in this batch.' : ' All task durations are set.') + ' ' + loaded[2].length + ' factory-wide standards saved.';
          submit.disabled = !detailsEnabled; copy.disabled = !detailsEnabled;
          if (!detailsEnabled) msg('<div class="note">' + pendingDetails + '</div>');
        } catch (e) { if (current() && ticket === request) msg(errBox(e)); }
      }
      picker.onchange = function () {
        if (dirty && !window.confirm('Replace your edited rows with the selected template?')) { picker.value = activeSource; return; }
        loadRows();
      };
      date.onchange = function () { if (grid && date.value) { grid.setBase(new Date(date.value).toISOString()); dirty = true;
        mountConvergence(document.getElementById('nbConvergence'), grid.read(), paddyReference, new Date(date.value).toISOString(), grid); } };
      window.onbeforeunload = function () { return dirty ? 'Unsaved batch plan' : undefined; };
      document.getElementById('nbf').onsubmit = async function (e) {
        e.preventDefault(); if (!grid || submit.disabled) return;
        submit.disabled = true; copy.disabled = true;
        try {
          grid.validate();
          var id = await api.rpc('tk_batch_create_plan_v3', { p_name: document.getElementById('nbName').value, p_sop: activeSource,
            p_h0: new Date(date.value).toISOString(), p_note: document.getElementById('nbNote').value || null, p_rows: grid.read() });
          dirty = false; window.onbeforeunload = null; go('#/b/' + id);
        } catch (err) { msg(errBox(err)); submit.disabled = false; copy.disabled = false; }
      };
      copy.onclick = async function () {
        if (!grid) return;
        var name = window.prompt('Name this reusable SOP copy:', 'Compost standard — edited');
        if (!name || !name.trim()) return;
        copy.disabled = true; submit.disabled = true;
        try {
          grid.validate();
          var id = await api.rpc('tk_sop_create_v3', { p_name: name.trim(), p_note: document.getElementById('nbNote').value,
            p_rows: grid.read(), p_reference_h0: new Date(date.value).toISOString() });
          msg('<div class="ok">Reusable draft saved. <a href="#/sop/' + id + '">Open it to publish for future batches</a>. Your batch plan is still here.</div>');
        } catch (e) { msg(errBox(e)); }
        finally { copy.disabled = false; submit.disabled = false; }
      };
      await loadRows();
    } catch (e) { if (current()) view.innerHTML = errBox(e); }
  }
})();
