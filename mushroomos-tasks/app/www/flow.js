/* Factory flow — read-only. Loads active batches and their tasks (the Manager login can already read both), places each batch group's
 * platform windows with flow-model.js, and draws them. Nothing here writes to the database; capacity edits and what-if slips live only in
 * this browser tab (capacity is remembered in this browser's local storage as a convenience). */
(function () {
  if (!window.Auth.requireRole('manager', 'admin')) return;
  var api = window.TK.api, F = window.TK.flowModel, user = window.Auth.currentUser(), HOUR = F.HOUR, zone = 'Asia/Kolkata', generation = 0;
  var status = document.getElementById('dirStatus'), content = document.getElementById('dirContent');
  var COLORS = ['#3f5d4b', '#3d4b6b', '#86661c', '#2f6f73', '#6b4a73', '#55606e', '#5c6b2f', '#7a6a45'];
  var state = { now: Date.now(), batches: [], tasks: [], overrides: {}, capacity: loadCapacity(), planStart: null, planTouched: false };

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clock(ms) { return new Date(ms).toLocaleString('en-GB', { timeZone: zone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
  function dayShort(ms) { return new Date(ms).toLocaleDateString('en-GB', { timeZone: zone, weekday: 'short', day: '2-digit' }); }
  function dur(hours) { var h = Math.abs(hours), d = Math.floor(h / 24), r = Math.round(h % 24); return d ? d + ' d ' + r + ' h' : Math.round(h) + ' h'; }
  function localInput(ms) { var d = new Date(ms + 19800000); return d.toISOString().slice(0, 16); }                       // value for an IST datetime-local box
  function fromInput(v) { var t = Date.parse(v + ':00Z'); return isFinite(t) ? t - 19800000 : null; }
  function loadCapacity() { var c = Object.assign({}, F.CAPACITY); try { var s = JSON.parse(localStorage.getItem('tk.flow.capacity') || 'null'); if (s) F.PLATFORMS.forEach(function (p) { if (Number(s[p]) >= 1 && Number(s[p]) <= 9) c[p] = Number(s[p]); }); } catch (e) { /* private mode: defaults */ } return c; }
  function saveCapacity() { try { localStorage.setItem('tk.flow.capacity', JSON.stringify(state.capacity)); } catch (e) { /* convenience only */ } }
  function istMidnight(t) { return Math.floor((t + 19800000) / 86400000) * 86400000 - 19800000; }
  function color(i) { return COLORS[i % COLORS.length]; }

  async function pages(table, params) {
    var rows = [], size = 500;
    for (var page = 0; page < 20; page++) {
      var part = await api.select(table, Object.assign({}, params, { limit: String(size), offset: String(page * size) }));
      rows.push.apply(rows, part); if (part.length < size) return rows;
    }
    throw new Error('More than 10,000 rows in ' + table + '.');
  }

  async function load() {
    var seq = ++generation; status.className = 'muted'; status.textContent = 'Loading batch groups…'; content.hidden = true;
    try {
      var data = await Promise.all([pages('tk_v_batch', { status: 'eq.active', order: 'created_at.desc' }), pages('tk_v_task_v3', { batch_status: 'eq.active', order: 'batch_id.asc,ord.asc' })]);
      if (seq !== generation) return;
      state.now = Date.now(); state.batches = data[0]; state.tasks = data[1];
      draw(); content.hidden = false; status.className = 'muted'; status.textContent = 'Snapshot as of ' + clock(state.now) + ' IST. Press Refresh for newer entries.';
    } catch (e) { if (seq === generation) { status.className = 'error'; status.textContent = 'Could not load the batch groups: ' + (e && e.message ? e.message : e); } }
  }

  // The real groups plus (when chosen) a hypothetical new group, placed with each group's slip.
  function build() {
    var real = F.placed(F.groups(state.batches, state.tasks, state.overrides));
    var withSlip = document.getElementById('forecast').checked;
    if (!withSlip) real = real.map(function (g) { return Object.assign({}, g, { windows: F.windowsFor(g.startMs, 0) }); });
    var active = real.filter(function (g) { return F.status([g], state.now)[0].finished === false; });
    var plan = null, drawn = active;
    if (state.planStart != null) { plan = Object.assign(F.placed([{ id: '__new', name: 'New group', batches: 1, startMs: state.planStart, slip: 0 }])[0], { ghost: true }); drawn = active.concat([plan]); }
    return { all: real, active: active, plan: plan, drawn: drawn };
  }

  function stack(windows) {                                  // greedy sub-rows so simultaneous windows on a platform sit side by side
    var rows = [], out = [];
    windows.slice().sort(function (a, b) { return a.startMs - b.startMs; }).forEach(function (w) {
      var r = 0; while (r < rows.length && rows[r] > w.startMs) r++;
      rows[r] = w.endMs; out.push({ w: w, row: r });
    });
    return { items: out, rows: Math.max(1, rows.length) };
  }

  function renderTimeline(b, conflicts) {
    var days = Number(document.getElementById('horizon').value), from = istMidnight(state.now) - 48 * HOUR, to = istMidnight(state.now) + days * 24 * HOUR;
    var W = 1200, L = 84, R = 14, top = 28, rowH = 24, pad = 10, px = (W - L - R) / ((to - from) / HOUR);
    function X(t) { return L + (Math.min(Math.max(t, from), to) - from) / HOUR * px; }
    var lanes = F.PLATFORMS.map(function (p) {
      var ws = []; b.drawn.forEach(function (g) { g.windows.forEach(function (w) { if (w.platform === p && w.endMs > from && w.startMs < to) ws.push({ w: w, g: g }); }); });
      var st = stack(ws.map(function (x, i) { return Object.assign({}, x.w, { _x: x }); }));
      return { p: p, st: st, h: st.rows * rowH + pad * 2 };
    });
    var H = top + lanes.reduce(function (n, l) { return n + l.h; }, 0) + 6, svg = '', y = top;
    for (var t = from; t <= to; t += 86400000) {
      var x = X(t); svg += '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + (top - 6) + '" y2="' + (H - 6) + '" stroke="var(--line)"/>';
      if (((t - from) / 86400000) % (days > 21 ? 2 : 1) === 0) svg += '<text class="day" x="' + (x + 3).toFixed(1) + '" y="14">' + esc(dayShort(t)) + '</text>';
    }
    if (state.now > from) svg += '<rect x="' + L + '" y="' + (top - 6) + '" width="' + (X(state.now) - L).toFixed(1) + '" height="' + (H - top) + '" fill="var(--soft)" fill-opacity=".55"/>';
    lanes.forEach(function (lane) {
      svg += '<line x1="0" x2="' + W + '" y1="' + y + '" y2="' + y + '" stroke="var(--line2)"/>';
      svg += '<text class="lane-name" x="14" y="' + (y + lane.h / 2 + 2) + '">' + lane.p + '</text><text class="lane-cap" x="14" y="' + (y + lane.h / 2 + 15) + '">holds ' + (state.capacity[lane.p] || 1) + '</text>';
      conflicts.filter(function (c) { return c.platform === lane.p && c.endMs > from && c.startMs < to; }).forEach(function (c) {
        svg += '<rect class="conf" x="' + X(c.startMs).toFixed(1) + '" y="' + (y + 2) + '" width="' + Math.max(2, X(c.endMs) - X(c.startMs)).toFixed(1) + '" height="' + (lane.h - 4) + '" rx="4"><title>Over capacity: ' + esc(c.groups.join(' + ')) + '</title></rect>';
      });
      lane.st.items.forEach(function (it) {
        var w = it.w._x.w, g = it.w._x.g, gi = Math.max(0, b.active.indexOf(g)), c = g.ghost ? 'var(--ink2)' : color(gi), x0 = X(w.startMs), x1 = X(w.endMs), by = y + pad + it.row * rowH, wd = Math.max(2, x1 - x0);
        var slipped = !g.ghost && Math.abs(w.startMs - w.plannedStartMs) > HOUR / 2;
        if (slipped) svg += '<rect x="' + X(w.plannedStartMs).toFixed(1) + '" y="' + (by + 1) + '" width="' + Math.max(2, X(w.plannedEndMs) - X(w.plannedStartMs)).toFixed(1) + '" height="' + (rowH - 6) + '" rx="3" fill="none" stroke="' + c + '" stroke-dasharray="3 3" stroke-opacity=".7"/>';
        var chars = Math.floor((wd - 8) / 5.8), name = g.name.replace(/\s+/g, ''), label = chars >= 4 ? (name.length <= chars ? name : name.slice(0, chars - 1) + '…') : '';
        svg += '<g class="block"><rect class="' + (g.ghost ? 'ghost' : '') + '" x="' + x0.toFixed(1) + '" y="' + (by + 1) + '" width="' + wd.toFixed(1) + '" height="' + (rowH - 6) + '" rx="3" fill="' + c + '"' + (g.ghost ? ' stroke="' + c + '"' : ' fill-opacity=".9"') + '>' +
          '<title>' + esc('Group ' + g.name + ' · platform ' + w.platform + '\nHours ' + w.from + '–' + w.to + ': ' + w.label + '\n' + clock(w.startMs) + ' → ' + clock(w.endMs) + ' IST' + (slipped ? '\nPlanned: ' + clock(w.plannedStartMs) + ' (moved ' + dur((w.startMs - w.plannedStartMs) / HOUR) + ' later)' : '')) + '</title></rect>' +
          (label && !g.ghost ? '<text x="' + (x0 + 5).toFixed(1) + '" y="' + (by + 13) + '">' + esc(label) + '</text>' : '') + '</g>';
      });
      y += lane.h;
    });
    svg += '<line x1="0" x2="' + W + '" y1="' + y + '" y2="' + y + '" stroke="var(--line2)"/>';
    var nx = X(state.now); svg += '<line x1="' + nx.toFixed(1) + '" x2="' + nx.toFixed(1) + '" y1="' + (top - 8) + '" y2="' + y + '" stroke="var(--bad)" stroke-width="1.6"/><text x="' + (nx + 4).toFixed(1) + '" y="' + (top - 12) + '" style="font-size:10px;fill:var(--bad);font-weight:700">now</text>';
    document.getElementById('timeline').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Platform timeline">' + svg + '</svg>';
    document.getElementById('legend').innerHTML = b.active.map(function (g, i) { return '<span><i style="background:' + color(i) + '"></i>' + esc(g.name) + '</span>'; }).join('') +
      '<span><i class="dash"></i>planned time (when moved by slip)</span><span><i class="red"></i>over capacity</span>' + (b.plan ? '<span><i class="dash"></i>new group (preview)</span>' : '');
  }

  function renderKpis(b, conflicts) {
    var st = F.status(b.active, state.now), ahead = conflicts.filter(function (c) { return c.endMs > state.now; });
    var peak = F.PLATFORMS.map(function (p) { return { p: p, load: F.peakLoad(b.active, p, state.now, state.now + Number(document.getElementById('horizon').value) * 24 * HOUR), cap: state.capacity[p] || 1 }; }).sort(function (a, c) { return c.load / c.cap - a.load / a.cap || c.load - a.load; })[0];
    var next = null; b.active.forEach(function (g) { g.windows.forEach(function (w) { if (w.startMs > state.now && (!next || w.startMs < next.w.startMs)) next = { w: w, g: g }; }); });
    var batches = b.active.reduce(function (n, g) { return n + g.batches; }, 0);
    var cards = [
      ['', 'Groups in flow', String(b.active.length), batches + ' batches · hour counts run to ' + F.TEMPLATE.totalHours],
      [ahead.length ? 'bad' : 'good', 'Conflicts ahead', String(ahead.length), ahead.length ? 'First: platform ' + ahead[0].platform + ', ' + clock(Math.max(ahead[0].startMs, state.now)) : 'No platform over its capacity'],
      [peak && peak.load >= peak.cap ? 'warn' : 'good', 'Busiest platform', peak ? peak.p : '—', peak ? 'Peaks at ' + peak.load + ' of ' + peak.cap + ' group' + (peak.cap === 1 ? '' : 's') + ' in the window' : ''],
      ['', 'Next hand-over', next ? 'in ' + dur((next.w.startMs - state.now) / HOUR) : '—', next ? 'Platform ' + next.w.platform + ' · group ' + next.g.name : 'No further platform window']
    ];
    document.getElementById('kpis').innerHTML = cards.map(function (c) { return '<div class="dir-kpi ' + c[0] + '"><dl><dt>' + esc(c[1]) + '</dt><dd class="v">' + esc(c[2]) + '</dd><dd class="d">' + esc(c[3]) + '</dd></dl></div>'; }).join('');
    return st;
  }

  function renderConflicts(conflicts) {
    var ahead = conflicts.filter(function (c) { return c.endMs > state.now; }), el = document.getElementById('conflicts');
    document.getElementById('cfSub').textContent = ahead.length ? ahead.length + ' stretch' + (ahead.length === 1 ? '' : 'es') + ' where a platform holds more groups than its capacity, earliest first.' : '';
    if (!ahead.length) { el.innerHTML = '<div class="dir-calm">No platform is over its capacity in the planned windows. Slips can create conflicts: change a group’s slip below to see what-if.</div>'; return; }
    el.innerHTML = '<ul class="flow-cf">' + ahead.slice(0, 20).map(function (c) {
      return '<li><strong>Platform ' + esc(c.platform) + ' · ' + esc(clock(Math.max(c.startMs, state.now))) + ' → ' + esc(clock(c.endMs)) + ' (' + dur((c.endMs - Math.max(c.startMs, state.now)) / HOUR) + ')</strong>' +
        '<p>' + c.load + ' groups on a platform that holds ' + c.capacity + ': ' + esc(c.groups.join('  ·  ')) + '</p><small>Planned windows only; whether work can really overlap here is for the floor to confirm.</small></li>'; }).join('') + '</ul>' + (ahead.length > 20 ? '<p class="dir-note">Showing the first 20 of ' + ahead.length + '.</p>' : '');
  }

  function renderGroups(b) {
    var st = F.status(b.active, state.now), el = document.getElementById('groups');
    if (!b.active.length) { el.innerHTML = '<p class="muted">No active batch group has a start time.</p>'; return; }
    el.innerHTML = '<div class="table-scroll" style="overflow:auto"><table class="dir-table flow-groups"><thead><tr><th>Group</th><th>Started</th><th class="n">Hour</th><th>On a platform now</th><th>Next hand-over</th><th class="n">Slip (h)</th></tr></thead><tbody>' +
      b.active.map(function (g, i) {
        var s = st[i], note = g.slipOverridden ? 'your what-if' : g.slipKnown ? 'from last 3 tasks' : 'no finished task yet';
        return '<tr><td><span class="sw" style="background:' + color(i) + '"></span><strong>' + esc(g.name) + '</strong><span class="flow-tag">' + g.batches + ' batch' + (g.batches === 1 ? '' : 'es') + '</span></td><td>' + esc(clock(g.startMs)) + '</td>' +
          '<td class="n">' + (s.started ? Math.floor(s.hour) + ' of ' + F.TEMPLATE.totalHours : 'not started') + '</td>' +
          '<td class="wrap">' + (s.current ? '<strong>Platform ' + esc(s.current.platform) + '</strong><span class="flow-tag">' + esc(s.current.label) + '</span>' : '<span class="muted">none (resting or between windows)</span>') + '</td>' +
          '<td class="wrap">' + (s.next ? 'Platform ' + esc(s.next.platform) + ' in ' + esc(dur((s.next.startMs - state.now) / HOUR)) + '<span class="flow-tag">' + esc(s.next.label) + '</span>' : '—') + '</td>' +
          '<td class="n"><input class="flow-slip" type="number" step="0.5" min="0" max="240" data-slip="' + esc(g.id) + '" value="' + (g.slipKnown ? g.slip : '') + '" placeholder="0" aria-label="Slip in hours for group ' + esc(g.name) + '"><span class="flow-tag">' + note + (g.slipOverridden ? ' · <a href="#" data-reset="' + esc(g.id) + '">reset</a>' : '') + '</span></td></tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="dir-note">Slip = how much later this group’s recent tasks started than suggested (median of its last three finished tasks, never negative). It moves every future window by the same amount. Type a number to ask “what if it slips this much?”.</p>';
  }

  function renderPlan(b) {
    var el = document.getElementById('plan'), base = b.active, best = F.earliestStart(base, state.capacity, state.now, 24 * Number(document.getElementById('horizon').value) + 24 * 7);
    if (state.planStart == null && !state.planTouched) state.planStart = null;
    var chosen = state.planStart != null ? state.planStart : best.startMs, v = F.violationHours(base, state.capacity, chosen);
    var mine = state.planStart != null ? F.conflicts(F.placed([{ id: '__new', name: 'New group', batches: 1, startMs: chosen, slip: 0 }]).concat(base), state.capacity).filter(function (c) { return c.groups.indexOf('New group') >= 0 && c.endMs > state.now; }) : [];
    el.innerHTML = '<div class="flow-plan"><label>Start of bagasse wetting (India time)<input id="planStart" type="datetime-local" value="' + localInput(chosen) + '"></label>' +
      '<div class="flow-result ' + (best.fits ? 'ok' : 'warn') + '"><strong>' + (best.fits ? 'Earliest start with no platform over capacity: ' : 'Nothing fits inside the window; least-conflict start: ') + esc(clock(best.startMs)) + '</strong><br>' + esc(dur((best.startMs - state.now) / HOUR)) + ' from now' + (best.fits ? '' : ' · ' + best.violationHours + ' platform-hours over capacity') +
      '<br><button class="btn sm" type="button" id="planUse" style="margin-top:8px">Preview this start on the timeline</button> <button class="btn sm" type="button" id="planClear" style="margin-top:8px">Clear preview</button></div>' +
      (state.planStart != null ? '<div class="flow-result ' + (v ? 'bad' : 'ok') + '">' + (v ? '<strong>Starting ' + esc(clock(chosen)) + ' puts ' + v + ' platform-hour' + (v === 1 ? '' : 's') + ' over capacity.</strong>' + mine.slice(0, 6).map(function (c) { return '<br>Platform ' + esc(c.platform) + ': ' + esc(clock(c.startMs)) + ' → ' + esc(clock(c.endMs)) + ' with ' + esc(c.groups.filter(function (n) { return n !== 'New group'; }).join(', ')); }).join('') : '<strong>Starting ' + esc(clock(chosen)) + ' fits.</strong> No platform goes over capacity.') + '</div>' : '') +
      '<p class="dir-note">Uses the same 544-hour template and each group’s slip. It does not check bunker or tunnel space, people or materials.</p></div>';
    document.getElementById('planStart').onchange = function () { var t = fromInput(this.value); if (t != null) { state.planStart = t; state.planTouched = true; draw(); } };
    document.getElementById('planUse').onclick = function () { state.planStart = best.startMs; state.planTouched = true; draw(); };
    document.getElementById('planClear').onclick = function () { state.planStart = null; state.planTouched = false; draw(); };
  }

  function renderCapacity() {
    var base = { '1A': 'never shared in his plan', '1B': 'reached 2', '2': 'never shared in his plan', '3': 'reached 3 — the bunker area', '4': 'never shared in his plan', '5': 'reached 2' };
    document.getElementById('capacity').innerHTML = '<p class="muted" style="margin:6px 0 0">How many groups can work on a platform at once. Starting values are the most the owner’s own February plan ever put there at the same time — inferred, so please confirm. Changes affect only this browser.</p><div class="flow-cap">' +
      F.PLATFORMS.map(function (p) { return '<label>Platform ' + p + '<input type="number" min="1" max="9" step="1" data-cap="' + p + '" value="' + (state.capacity[p] || 1) + '"><small>' + base[p] + '</small></label>'; }).join('') +
      '</div><p style="margin:14px 0 0"><button class="btn sm" type="button" id="capReset">Reset to his plan</button></p>';
    document.getElementById('capReset').onclick = function () { state.capacity = Object.assign({}, F.CAPACITY); saveCapacity(); draw(); };
  }

  function renderMethod() {
    document.getElementById('method').innerHTML = '<ul>' +
      '<li><strong>Source.</strong> The windows come from the owner’s workbook (“' + esc(F.TEMPLATE.source) + '”). All 21 groups in it follow the same pattern: hours counted from the start of bagasse wetting, 544 hours end to end, a new group every 2–3 days.</li>' +
      '<li><strong>Planned, not measured.</strong> A window shows when a group is <em>planned</em> to need a platform. Nobody is detected on a platform; the app has no platform record yet. The dashed outlines show the planned time when a slip has moved a window.</li>' +
      '<li><strong>Slip.</strong> Estimated from how late a group’s last three finished tasks actually started against their suggested times; type a value to test “what if”. A group with no finished task yet has no estimate and is shown unmoved.</li>' +
      '<li><strong>Capacity</strong> is inferred from his plan (see the box above) and is yours to correct. Over-capacity is a prompt to look, not a prohibition.</li>' +
      '<li><strong>Not covered yet:</strong> bunker and tunnel occupancy, temperature/time unload triggers (≥58 °C or ≥40 h), moisture targets, people and machines. Stage names are matched from the Process sheet by order and duration; confirm them with the owner.</li></ul>';
  }

  function draw() {
    var b = build(), conflicts = F.conflicts(b.drawn, state.capacity), realConflicts = F.conflicts(b.active, state.capacity);
    renderKpis(b, realConflicts); renderTimeline(b, conflicts); renderConflicts(realConflicts); renderGroups(b); renderPlan(b); renderCapacity(); renderMethod();
  }

  document.getElementById('groups').addEventListener('change', function (e) { var id = e.target && e.target.getAttribute('data-slip'); if (id == null) return; if (e.target.value === '') delete state.overrides[id]; else state.overrides[id] = Math.max(0, Number(e.target.value) || 0); draw(); });
  document.getElementById('groups').addEventListener('click', function (e) { var id = e.target && e.target.getAttribute && e.target.getAttribute('data-reset'); if (id != null) { e.preventDefault(); delete state.overrides[id]; draw(); } });
  document.getElementById('capacity').addEventListener('change', function (e) { var p = e.target && e.target.getAttribute('data-cap'); if (!p) return; state.capacity[p] = Math.min(9, Math.max(1, Math.round(Number(e.target.value) || 1))); saveCapacity(); draw(); });
  document.getElementById('forecast').onchange = draw; document.getElementById('horizon').onchange = draw;
  document.getElementById('identity').textContent = (user.name || user.email) + ' · ' + (user.role === 'admin' ? 'Admin preview' : 'Read-only Manager');
  document.getElementById('refresh').onclick = load; document.getElementById('print').onclick = function () { window.print(); };
  document.getElementById('signout').onclick = function () { window.Auth.signOut().finally(function () { window.location.replace('login.html'); }); };
  load();
})();
