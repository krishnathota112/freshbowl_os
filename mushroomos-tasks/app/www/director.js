/* Director brief — read-only. Loads what the Manager login can already read, hands it to director-model.js, and draws the result.
 * No write call exists on this page. A failed section says so and the rest still renders. */
(function () {
  if (!window.Auth.requireRole('manager', 'admin')) return;
  var api = window.TK.api, M = window.TK.directorModel, user = window.Auth.currentUser(), generation = 0, model = null, zone = 'Asia/Kolkata';
  var status = document.getElementById('dirStatus'), content = document.getElementById('dirContent');
  var HOUR = 3600000;

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clock(ms) { return ms == null ? 'Not recorded' : new Date(ms).toLocaleString('en-GB', { timeZone: zone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
  function clockFull(ms) { return ms == null ? '' : new Date(ms).toLocaleString('en-GB', { timeZone: zone, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
  function dayLabel(iso) { var p = iso.split('-'); return p[2] + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(p[1]) - 1]; }
  function dur(ms) { var m = Math.round(Math.abs(ms) / 60000), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60); return d ? d + ' d ' + h + ' h' : h ? h + ' h' + (m % 60 ? ' ' + m % 60 + ' m' : '') : m + ' m'; }
  function ago(ms) { return ms == null ? '' : dur(model.generatedAt - ms) + ' ago'; }
  function hrs(min) { return min == null ? '—' : (Math.round(Math.abs(min) / 6) / 10).toLocaleString('en-IN') + ' h'; }
  function delay(min) { if (min == null) return '—'; if (Math.abs(min) < 5) return 'on time'; return (min > 0 ? '+' : '−') + hrs(min) + (min > 0 ? ' late' : ' early'); }
  function pct(v) { return v == null ? '—' : Math.round(v) + '%'; }
  function num(n, d) { return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: d == null ? 1 : d }); }
  function qty(kg, unit) { return kg == null ? '—' : unit === 't' ? num(kg / 1000, 2) + ' t' : num(kg, 0) + ' kg'; }

  async function pages(table, params) {
    var rows = [], size = 500;
    for (var page = 0; page < 20; page++) {
      var part = await api.select(table, Object.assign({}, params, { limit: String(size), offset: String(page * size) }));
      rows.push.apply(rows, part);
      if (part.length < size) return rows;
    }
    throw new Error('More than 10,000 rows in ' + table + '. No partial figures were shown; choose a shorter period.');
  }

  async function load() {
    var seq = ++generation, days = Number(document.getElementById('period').value), now = Date.now();
    var istMidnight = Math.floor((now + 19800000) / 86400000) * 86400000 - 19800000, since = istMidnight - (days - 1) * 86400000;   // whole India calendar days, today included
    status.className = 'muted'; status.textContent = 'Loading the factory picture…'; content.hidden = true;
    try {
      var main = await Promise.all([
        pages('tk_v_batch', { status: 'eq.active', order: 'created_at.desc' }),
        pages('tk_v_task_v3', { batch_status: 'eq.active', order: 'batch_id.asc,ord.asc' }),
        pages('tk_v_task_v3', { status: 'in.(done,done_before)', ended_at: 'gte.' + new Date(since).toISOString(), order: 'ended_at.desc' })
      ]);
      var requirements = null, materialsError = '';
      try { requirements = await pages('wb_v_requirement', { batch_status: 'eq.active', order: 'batch_created_at.desc,sort.asc,material_name.asc' }); }
      catch (e) { materialsError = e && e.message ? e.message : 'unavailable'; }
      if (seq !== generation) return;
      model = M.model({ now: now, since: since, batches: main[0], tasks: main[1], finished: main[2], requirements: requirements || [],
        convergence: window.TK.paddyConvergence && window.TK.paddyConvergence.plan });
      model.materialsError = materialsError; model.days = days;
      render(); content.hidden = false; status.className = 'muted'; status.textContent = 'Snapshot as of ' + clockFull(model.generatedAt) + ' IST. Press Refresh for newer entries.';
    } catch (error) { if (seq === generation) { model = null; status.className = 'error'; status.textContent = 'Could not load a complete picture: ' + (error && error.message ? error.message : error); } }
  }

  function renderKpis() {
    var s = model.summary, a = model.attention, att = a.high + a.medium + a.low, days = model.throughput.days;
    var top = Math.max.apply(null, days.map(function (d) { return d.done; }).concat([1])), W = 120, H = 26, step = days.length > 1 ? W / (days.length - 1) : W;
    var line = days.map(function (d, i) { return (i * step).toFixed(1) + ',' + (H - 2 - (H - 6) * d.done / top).toFixed(1); }).join(' ');
    var spark = days.length > 1 ? '<svg class="dir-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + line + '" fill="none" stroke="var(--pri)" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>' : '';
    var cards = [
      [s.behind ? 'bad' : s.batches && s.onTrack === s.batches ? 'good' : 'warn', 'Batches on track', s.onTrack + ' <small>of ' + s.batches + '</small>', s.behind + (s.behind === 1 ? ' batch is' : ' batches are') + ' behind plan'],
      [a.high ? 'bad' : att ? 'warn' : 'good', 'Needs attention', String(att), a.high + ' high · ' + a.medium + ' medium · ' + a.low + ' low'],
      ['', 'Tasks completed', String(s.completedInPeriod), (model.throughput.perDay == null ? '' : num(model.throughput.perDay, 1) + ' a day · ') + 'last ' + model.days + ' days' + spark],
      [s.materialsAtRisk ? 'bad' : 'good', 'Materials at risk', model.materialsError ? '—' : String(s.materialsAtRisk), model.materialsError ? 'Weighment data could not be read' : 'of ' + model.materials.length + ' active requirements']
    ];
    document.getElementById('kpis').innerHTML = cards.map(function (c) { return '<div class="dir-kpi ' + c[0] + '"><dl><dt>' + esc(c[1]) + '</dt><dd class="v">' + c[2] + '</dd><dd class="d">' + c[3] + '</dd></dl></div>'; }).join('');
  }

  function exItem(e) {
    var label = { high: 'High', medium: 'Medium', low: 'Low' }[e.severity];
    return '<li class="dir-ex ' + e.severity + '"><span class="dir-sev">' + label + '</span><div><strong>' + esc(e.headline) + '</strong>' + (e.detail ? '<p>' + esc(e.detail) + '</p>' : '') +
      '<small>' + (e.batchName ? '<b>Batch ' + esc(e.batchName) + '</b>' : '') + (e.batchName && e.sinceAt != null ? ' · ' : '') + (e.sinceAt != null ? 'for ' + dur(model.generatedAt - e.sinceAt) : '') + '</small></div></li>';
  }
  function renderAttention() {
    var list = model.exceptions, el = document.getElementById('attention'), a = model.attention;
    document.getElementById('attSub').textContent = list.length ? a.high + ' high, ' + a.medium + ' medium, ' + a.low + ' low · most serious first, then longest waiting.' : '';
    if (!list.length) { el.innerHTML = '<div class="dir-calm">Nothing needs attention right now. No late starts, overruns, waiting approvals, convergence shortfalls or material alerts were found in the recorded data.</div>'; return; }
    var head = list.slice(0, 8), rest = list.slice(8);
    el.innerHTML = '<ul class="dir-ex-list">' + head.map(exItem).join('') + '</ul>' + (rest.length ? '<details class="dir-more"><summary>Show ' + rest.length + ' more</summary><ul class="dir-ex-list">' + rest.map(exItem).join('') + '</ul></details>' : '');
  }

  function convChip(c) {
    if (!c) return '';
    if (c.state === 'miss') return '<li class="bad">Paddy: ' + (c.uncertain ? 'at least ' : '') + dur(c.shortfallMs || 0) + ' short of convergence</li>';
    if (c.state === 'waiting') return '<li class="ok">Paddy: ready early</li>';
    if (c.state === 'unknown') return '<li>Paddy forecast: timing setup incomplete</li>';
    return '<li class="ok">Paddy: on schedule</li>';
  }
  function renderHealth() {
    var el = document.getElementById('health');
    if (!model.batches.length) { el.innerHTML = '<div class="dir-calm">No active batch.</div>'; return; }
    var label = { on_track: 'On track', watch: 'Watch', behind: 'Behind plan', unknown: 'No tasks' };
    el.innerHTML = model.batches.map(function (b) {
      var facts = [];
      if (b.running) facts.push('<li>' + b.running + ' running</li>');
      if (b.lateStarts) facts.push('<li class="' + (b.lateStarts >= model.thresholds.lateHighCount ? 'bad' : 'warn') + '">' + b.lateStarts + ' late to start</li>');
      if (b.overruns) facts.push('<li class="warn">' + b.overruns + ' over plan</li>');
      if (b.waitingGm) facts.push('<li class="warn">' + b.waitingGm + ' waiting GM</li>');
      if (b.returned) facts.push('<li class="warn">' + b.returned + ' returned to Lab</li>');
      facts.push(convChip(b.convergence));
      return '<article class="dir-batch"><header><h3>' + esc(b.name) + '</h3><span class="dir-pill s-' + b.status + '">' + label[b.status] + '</span></header>' +
        '<div class="dir-track" aria-hidden="true"><i style="width:' + Math.min(100, b.actualPct || 0) + '%"></i>' + (b.total ? '<b style="left:' + Math.min(100, b.expectedPct || 0) + '%"></b>' : '') + '</div>' +
        '<p class="nums"><b>' + b.done + '</b> of <b>' + b.total + '</b> tasks done (' + pct(b.actualPct) + ') · plan expected ' + pct(b.expectedPct) + ' by now</p>' +
        '<ul class="dir-facts">' + facts.join('') + '</ul>' +
        '<p class="dir-next">' + (b.next ? '<b>Next planned:</b> ' + esc(b.next.title) + (b.next.at != null ? ' · ' + clock(b.next.at) : '') : 'No unstarted task remains.') +
        (b.lastActivityAt ? '<br>Last recorded activity ' + ago(b.lastActivityAt) : '') + '</p></article>';
    }).join('');
  }

  function renderThroughput() {
    var t = model.throughput, days = t.days, el = document.getElementById('throughput');
    if (!days.length || !t.total) { el.innerHTML = '<p class="muted">No task was completed in this period.</p>' + (t.doneBeforeExcluded ? '<p class="dir-note">' + t.doneBeforeExcluded + ' task(s) were marked done-before-the-app and are not counted as work.</p>' : ''); return; }
    var W = 520, H = 190, padL = 6, padB = 26, padT = 18, top = Math.max.apply(null, days.map(function (d) { return d.done; })), bw = (W - padL) / days.length, every = Math.ceil(days.length / 7);
    var bars = days.map(function (d, i) {
      var h = d.done ? (H - padB - padT) * d.done / top : 3, x = padL + i * bw + bw * .18, w = bw * .64, y = H - padB - h;
      return '<rect class="' + (d.done ? '' : 'zero') + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2"><title>' + dayLabel(d.date) + ': ' + d.done + ' completed</title></rect>' +
        (d.done ? '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (y - 5).toFixed(1) + '" text-anchor="middle">' + d.done + '</text>' : '') +
        (i % every === 0 || i === days.length - 1 ? '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + dayLabel(d.date) + '</text>' : '');
    }).join('');
    el.innerHTML = '<svg class="dir-bars" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Tasks completed per day">' + bars + '</svg>' +
      '<p class="dir-note">' + t.total + ' tasks completed in ' + days.length + ' days (India dates). ' + (t.doneBeforeExcluded ? t.doneBeforeExcluded + ' marked done-before-the-app are excluded: they record catching up, not work.' : '') + '</p>';
  }

  function renderAdherence() {
    var tm = model.timing, el = document.getElementById('adherence');
    if (!tm.measured && !tm.missingTimes) { el.innerHTML = '<p class="muted">No finished task in this period.</p>'; return; }
    el.innerHTML = '<div class="dir-stats"><div><div class="v">' + esc(delay(tm.startDelayMedianMin)) + '</div><div class="l">Typical start vs plan</div></div><div><div class="v">' + esc(delay(tm.startDelayP90Min)) + '</div><div class="l">Slowest 1 in 10</div></div><div><div class="v">' + hrs(tm.overrunHours * 60) + '</div><div class="l">Time over plan</div></div></div>' +
      (tm.stages.length ? '<table class="dir-table"><thead><tr><th>Stage</th><th class="n">Tasks</th><th class="n">Typical start</th><th class="n">Over plan</th></tr></thead><tbody>' +
        tm.stages.map(function (s) { return '<tr><td>' + esc(s.stage) + '</td><td class="n">' + s.n + '</td><td class="n">' + esc(delay(s.medianDelayMin)) + '</td><td class="n">' + (s.plannedKnown ? hrs(s.overrunHours * 60) + (s.overrunTasks ? ' · ' + s.overrunTasks + ' task' + (s.overrunTasks === 1 ? '' : 's') : '') : '—') + '</td></tr>'; }).join('') + '</tbody></table>' : '') +
      '<p class="dir-note">' + tm.startDelayCount + ' of ' + tm.measured + ' measured tasks had a suggested start. ' + (tm.missingTimes ? tm.missingTimes + ' finished task(s) lack a usable start or finish time and are left out, not counted as zero.' : 'Every finished task had usable times.') + '</p>';
  }

  function renderMaterials() {
    var el = document.getElementById('materials');
    if (model.materialsError) { el.innerHTML = '<p class="muted">Weighment requirements could not be read for this login (' + esc(model.materialsError) + '). The rest of the brief is unaffected.</p>'; return; }
    if (!model.materials.length) { el.innerHTML = '<p class="muted">No active weighment requirement.</p>'; return; }
    var groups = {}, order = [];
    model.materials.forEach(function (m) { if (!groups[m.batchName]) { groups[m.batchName] = []; order.push(m.batchName); } groups[m.batchName].push(m); });
    var chip = { receiving: ['s-watch', 'Receiving'], complete: ['s-on_track', 'Complete'], over: ['s-behind', 'Over'], short: ['s-behind', 'Closed short'] };
    el.innerHTML = order.map(function (name) {
      return '<div class="dir-mat-group"><h3>Batch ' + esc(name) + '</h3>' + groups[name].map(function (m) {
        var c = chip[m.state] || chip.receiving;
        return '<div class="dir-mat ' + esc(m.state) + '"><strong>' + esc(m.material) + '</strong><div class="bar" aria-hidden="true"><i style="width:' + Math.min(100, m.pct || 0) + '%"></i></div>' +
          '<div class="q">' + qty(m.received, m.unit) + ' of ' + qty(m.required, m.unit) + (m.pct != null ? ' · ' + pct(m.pct) : '') + '</div><span class="dir-pill ' + c[0] + '">' + c[1] + (m.openAlerts ? ' · ' + m.openAlerts + ' alert' + (m.openAlerts === 1 ? '' : 's') : '') + '</span></div>';
      }).join('') + '</div>';
    }).join('');
  }

  function renderMethod() {
    var T = model.thresholds;
    document.getElementById('method').innerHTML = '<ul>' +
      '<li><strong>Everything is a recorded fact or a clearly labelled comparison.</strong> A missing time, crew count or reading stays missing; it is never shown as zero or estimated.</li>' +
      '<li><strong>Plan vs actual.</strong> “Plan expected by now” is the share of a batch’s tasks whose suggested time has already passed. It is guidance, not a gate: tasks can start in any order. “Behind” means completed work trails that share by ' + T.behindGapPts + ' points or more, or ' + T.lateHighCount + '+ tasks are late, or the Paddy forecast misses its target.</li>' +
      '<li><strong>Late to start</strong> = not started more than ' + T.graceStartMin / 60 + ' h after its suggested time. <strong>Over plan</strong> = running more than ' + T.overrunMin + ' min past its planned duration (only when a planned duration exists).</li>' +
      '<li><strong>Waiting on approval</strong> counts Lab gate results awaiting GM; flagged after ' + T.gmWaitMedHours + ' h and as high after ' + T.gmWaitHighHours + ' h.</li>' +
      '<li><strong>Paddy forecast</strong> is the existing advisory planner. It does not prove bagasse or manure readiness, or bunker and tunnel availability.</li>' +
      '<li><strong>Throughput</strong> counts tasks finished in the period (India dates). Tasks marked done-before-the-app are excluded. <strong>Start vs plan</strong> compares actual and suggested start, only where both exist.</li>' +
      '<li><strong>Materials</strong> come from the weighbridge ledger: over-delivery and short closes are high; unacknowledged alerts are medium.</li>' +
      '<li>These thresholds are set in <code>director-model.js</code> and can be tuned once you have seen real batches.</li></ul>';
  }

  function render() {
    var hour = new Date().getHours(), first = String(user.name || user.email || '').split(/\s+/)[0];
    document.getElementById('greeting').textContent = (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') + (first ? ', ' + first : '');
    renderKpis(); renderAttention(); renderHealth(); renderThroughput(); renderAdherence(); renderMaterials(); renderMethod();
  }

  function download(name, rows) {
    var url = URL.createObjectURL(new Blob([M.csv(rows)], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a');
    a.href = url; a.download = 'director-' + name + '-' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function exportAttention() {
    if (!model) return;
    download('attention', [['Severity', 'Batch', 'Issue', 'Detail', 'Waiting since (IST)', 'Snapshot (IST)']].concat(model.exceptions.map(function (e) { return [e.severity, e.batchName, e.headline, e.detail, e.sinceAt == null ? '' : clockFull(e.sinceAt), clockFull(model.generatedAt)]; })));
  }
  function exportHealth() {
    if (!model) return;
    download('batch-health', [['Batch', 'Status', 'Tasks done', 'Tasks total', 'Completed %', 'Planned by now %', 'Late to start', 'Running over plan', 'Running', 'Waiting GM', 'Returned', 'Paddy forecast', 'Next planned', 'Next planned time (IST)', 'Snapshot (IST)']]
      .concat(model.batches.map(function (b) { return [b.name, b.status, b.done, b.total, b.actualPct == null ? '' : Math.round(b.actualPct), b.expectedPct == null ? '' : Math.round(b.expectedPct), b.lateStarts, b.overruns, b.running, b.waitingGm, b.returned, b.convergence ? b.convergence.state : '', b.next ? b.next.title : '', b.next && b.next.at != null ? clockFull(b.next.at) : '', clockFull(model.generatedAt)]; })));
  }

  document.getElementById('identity').textContent = (user.name || user.email) + ' · ' + (user.role === 'admin' ? 'Admin preview' : 'Read-only Manager');
  document.getElementById('refresh').onclick = load;
  document.getElementById('period').onchange = load;
  document.getElementById('print').onclick = function () { window.print(); };
  document.getElementById('signout').onclick = function () { window.Auth.signOut().finally(function () { window.location.replace('login.html'); }); };
  document.getElementById('exportAttention').onclick = exportAttention;
  document.getElementById('exportHealth').onclick = exportHealth;
  load();
})();
