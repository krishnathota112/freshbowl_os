/**
 * "Assign daily tasks" and "Monthly task chart" — the two planning screens (home tabs `daily` and `monthly`).
 *
 * They are views of the batch plans: each task shows on the day of its planned start (suggested_at) for its planned
 * duration. Colours follow the owner's rule: orange = a task, white = rest, red = missed (planned time passed, not started).
 *
 * Admin edits them like a table, as much as the plan allows:
 *   - a task: name, type (Process / Rest / Lab / Cleaning), stream, description, how it is timed, date, start time, duration; remove it
 *   - add a new task of any type onto a day
 *   - a whole batch: name, note and START — changing the start moves every unstarted task by the same amount, which is the
 *     same "fill down from the batch start" the New batch screen does
 *   - the Paddy → second convergence planner (forecast, suggested soak starts, target) for each batch
 *   - drag a task to another day (chart) or hour (board)
 * Every change is saved through the batch plan editor's own guarded call (tk_batch_plan_get → tk_batch_plan_save), so recorded
 * work stays protected and linked start times follow. Supervisor, Lab and GM see the same screens read-only (they also see the
 * Paddy forecast). Actual work is never touched here.
 */
(function () {
  var P = window.TK.dayPlan;
  var COLS = 'id,batch_id,batch_name,batch_status,h0,ord,line,title,kind,status,suggested_at,planned_duration_minutes,started_at,ended_at,can_start,pile,turner_pass,description,schedule_mode,schedule_gap_minutes';
  /** Older databases (before 0156) lack these columns; the planning screens still work without them. */
  function cols(ctx) { return ctx.taskSource === 'tk_v_task_v3' ? COLS : COLS.replace(',pile,turner_pass,description,schedule_mode,schedule_gap_minutes', ''); }
  var STATE_LABEL = { planned: 'Planned', running: 'Running', waiting: 'Waiting GM', behind: 'Missed — planned time passed', done: 'Done' };
  var MARK = { done: '✓ ', running: '▶ ', waiting: '⧖ ' };
  var KINDS = ['work', 'rest', 'lab', 'cleaning'];
  var KIND_LABEL = P.KIND_LABEL;
  var MODE_LABEL = { fixed: 'Fixed date and time', stream: 'After the previous task in its stream', batch: 'After the previous task in the batch' };
  var HOUR = 3600000;
  var state = { day: null, span: 1, batch: '', month: null, sel: null, panel: null, dragShift: false, notice: null, types: { work: true, rest: true, lab: true, cleaning: true } };
  var dragging = null;                       // the task being dragged: { id, batchId, start }
  var loadGeneration = 0;
  function beginLoad(ctx) {
    var generation = ++loadGeneration, current = ctx._rootCurrent || ctx.current;
    return Object.assign({}, ctx, {_rootCurrent:current,current:function () { return current() && generation === loadGeneration; }});
  }
  function all(ctx, table, params) { return ctx.api.selectAll ? ctx.api.selectAll(table, params) : ctx.api.select(table, params); }

  function today() { return P.key(new Date()); }
  function two(n) { return (n < 10 ? '0' : '') + n; }
  function clock(ms) { var d = new Date(ms); return two(d.getHours()) + ':' + two(d.getMinutes()); }
  function dayLong(k) { return P.parse(k).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }); }
  function dayShort(k) { return P.parse(k).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); }
  function monthLong(ym) { return P.parseMonth(ym).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function when(ms) { return dayShort(P.key(ms)) + ' ' + clock(ms); }
  function whenFull(ms) { return P.parse(P.key(ms)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + clock(ms); }
  function localInput(ms) { return P.key(ms) + 'T' + clock(ms); }
  function spanText(ms) {
    var minutes = Math.ceil(Math.abs(ms) / 60000), days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60), mins = minutes % 60;
    return [days ? days + ' d' : '', hours ? hours + ' h' : '', mins && !days ? mins + ' m' : ''].filter(Boolean).join(' ') || '0 m';
  }
  function asLocalMs(k, hhmm) {
    var d = P.parse(k), m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
    if (!d || !m || +m[1] > 23 || +m[2] > 59) return NaN;
    d.setHours(+m[1], +m[2], 0, 0);
    return d.getTime();
  }
  function minutesOf(hours, minutes) {
    if (window.TK.duration && window.TK.duration.read) return window.TK.duration.read(hours, minutes);
    var h = String(hours).trim(), m = String(minutes).trim();
    if (!h && !m) return null;
    var hh = h ? +h : 0, mm = m ? +m : 0;
    return Number.isInteger(hh) && Number.isInteger(mm) && hh >= 0 && mm >= 0 && mm < 60 ? hh * 60 + mm : NaN;
  }
  function typeKey(t) { return t.kind === 'lab_gate' ? 'lab' : t.kind; }
  function visible(t) { return state.types[typeKey(t)] !== false; }
  function kindOptions(selected, withAll) {
    return (withAll ? '<option value="">All types</option>' : '') + KINDS.map(function (k) { return '<option value="' + k + '"' + (k === selected ? ' selected' : '') + '>' + KIND_LABEL[k] + '</option>'; }).join('');
  }

  // ── full screen (the whole pane, so the toolbar, chart and editor stay together and a save does not leave it) ──
  var full = { pane: null, native: false };
  function syncFullButtons(pane) {
    var on = pane.classList.contains('dp-full');
    pane.querySelectorAll('[data-dp-full]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(on));
      b.innerHTML = '<span class="ms">' + (on ? 'fullscreen_exit' : 'fullscreen') + '</span>' + (on ? 'Exit full screen' : 'Full screen');
    });
  }
  function escKey(e) { if (e.key === 'Escape' && full.pane && !full.native) { e.preventDefault(); leaveFull(); } }
  function fsChange() { if (full.pane && full.native && document.fullscreenElement !== full.pane) leaveFull(); }
  function leaveFull() {
    var pane = full.pane;
    document.removeEventListener('keydown', escKey, true); document.removeEventListener('fullscreenchange', fsChange);
    document.documentElement.classList.remove('dp-fs-open');
    full.pane = null;
    if (!pane) return;
    pane.classList.remove('dp-full');
    if (document.fullscreenElement === pane && document.exitFullscreen) Promise.resolve(document.exitFullscreen()).catch(function () {});
    syncFullButtons(pane);
  }
  function enterFull(pane) {
    full.pane = pane; full.native = false;
    pane.classList.add('dp-full'); document.documentElement.classList.add('dp-fs-open');
    document.addEventListener('keydown', escKey, true); document.addEventListener('fullscreenchange', fsChange);
    syncFullButtons(pane);
    try {
      if (pane.requestFullscreen) Promise.resolve(pane.requestFullscreen()).then(function () { full.native = document.fullscreenElement === pane; }).catch(function () {});
    } catch (e) { /* the fixed-position layout is the fallback */ }
  }
  /** Called by every mount: a pane left behind by a tab change must not keep the page locked. */
  function resetFullIfStale(pane) {
    if (full.pane && full.pane !== pane) leaveFull();
    if (!pane.classList.contains('dp-full')) document.documentElement.classList.remove('dp-fs-open');
  }
  function wireFull(pane) {
    pane.querySelectorAll('[data-dp-full]').forEach(function (b) {
      b.onclick = function () { if (pane.classList.contains('dp-full')) leaveFull(); else enterFull(pane); };
    });
    syncFullButtons(pane);
  }
  function fullButton() { return '<button type="button" class="btn sm" data-dp-full aria-pressed="false"><span class="ms">fullscreen</span>Full screen</button>'; }
  function typeFilterHtml() {
    return '<div class="dp-types" role="group" aria-label="Task types shown"><span class="muted small">Show</span>' + KINDS.map(function (k) {
      return '<label class="dp-type t-' + (k === 'rest' ? 'rest' : 'task') + '"><input type="checkbox" data-dp-type="' + k + '"' + (state.types[k] !== false ? ' checked' : '') + '>' + KIND_LABEL[k] + '</label>';
    }).join('') + '</div>';
  }
  function wireTypeFilter(pane, reload) {
    pane.querySelectorAll('[data-dp-type]').forEach(function (box) {
      box.onchange = function () { state.types[box.dataset.dpType] = box.checked; reload(); };
    });
  }
  function dragShiftBox(ctx) {
    return ctx.isAdmin ? '<label class="dp-dragshift"><input type="checkbox" data-dp-dragshift' + (state.dragShift ? ' checked' : '') + '>Moving a task also moves the later tasks of its stream</label>' : '';
  }
  function noticeHtml() {
    var n = state.notice; state.notice = null;
    return '<div id="dpNote" role="status" aria-live="polite">' + (n ? '<div class="' + (n.error ? 'error' : 'note') + '">' + n.text + '</div>' : '') + '</div>';
  }

  // ── pieces shared by both screens ───────────────────────────────────────────────────────────────────────────
  function span(t, k) {
    var s = P.startMs(t);
    if (s == null) return 'No planned time yet';
    var e = P.endMs(t), day = P.dayWindow(P.key(s));
    var text = e == null ? 'from ' + clock(s) : clock(s) + '–' + clock(e) + (e >= day.end.getTime() ? ' (+' + Math.max(1, Math.ceil((e - day.end.getTime()) / 86400000)) + 'd)' : '');
    return k && P.key(s) !== k ? dayShort(P.key(s)) + ' ' + text : text;
  }
  function canEdit(ctx, t) { return ctx.isAdmin && t.status === 'todo' && t.batch_status === 'active'; }
  function legendHtml() {
    return '<div class="dp-legend"><span><i class="t-task"></i>Task</span><span><i class="t-rest"></i>Rest</span><span><i class="t-missed"></i>Missed (planned time passed, not started)</span>' +
      '<span class="dp-marks">✓ done · ▶ running · ⧖ waiting for GM</span></div>';
  }
  function itemHtml(ctx, t, opts) {
    opts = opts || {};
    var now = Date.now(), st = P.state(t, now), tn = P.tone(t, now), esc = ctx.esc;
    var cls = (t.status === 'running' ? ' running' : (t.can_start ? ' open' : '')) + (t.kind === 'lab_gate' ? ' gate' : t.kind === 'lab' ? ' labr' : '') + ' tn-' + tn;
    var meta = [opts.batch ? esc(t.batch_name) : '', span(t, opts.day), esc(KIND_LABEL[t.kind] || t.kind), esc(t.line), t.pile ? esc(t.pile) : ''].filter(Boolean).join(' · ');
    return '<div class="dp-item" data-dp-item="' + esc(t.id) + '"><div class="dp-itemrow">' +
      '<button type="button" class="task' + cls + '" data-t="' + esc(t.id) + '"><span class="num">' + esc(t.ord) + '</span>' +
      '<span class="grow"><b>' + (MARK[st] || '') + esc(t.title) + '</b><br><span class="muted small">' + meta + '</span></span>' +
      (tn === 'missed' ? '<span class="chip c-bad">Missed</span>' : '') + ctx.chip(t) + '</button>' +
      (canEdit(ctx, t) ? '<button type="button" class="btn sm" data-dp-move="' + esc(t.id) + '"><span class="ms">edit_calendar</span>' + (t.suggested_at ? 'Edit' : 'Assign') + '</button>' : '') +
      '</div></div>';
  }
  function linesOf(all, batchId) {
    var seen = {}, out = [];
    Object.keys(all).forEach(function (id) { var t = all[id]; if (t.batch_id === batchId && t.line && !seen[t.line]) { seen[t.line] = true; out.push(t.line); } });
    ['Main', 'Paddy', 'Cleaning'].forEach(function (l) { if (!seen[l]) out.push(l); });
    return out;
  }

  /** Edit one task like a table row: name, type, stream, description, timing, date, time, duration. */
  function editorHtml(ctx, t, dayKey, lines) {
    var esc = ctx.esc, s = P.startMs(t), k = s != null ? P.key(s) : (dayKey || today()), dur = t.planned_duration_minutes;
    var h = Number.isInteger(dur) ? Math.floor(dur / 60) : '', m = Number.isInteger(dur) ? dur % 60 : '';
    var switchable = KINDS.indexOf(t.kind) >= 0, mode = t.schedule_mode || 'fixed', linked = mode !== 'fixed';
    var id = 'ed' + String(t.id).replace(/[^\w]/g, '');
    return '<form class="dp-move" data-dp-moveform="' + esc(t.id) + '">' +
      '<label class="lbl">Task name<input data-m-title maxlength="200" required value="' + esc(t.title) + '"></label>' +
      '<div class="dp-fields">' +
      '<label class="lbl">Type<select data-m-kind' + (switchable ? '' : ' disabled') + '>' + (switchable ? kindOptions(t.kind) : '<option>' + esc(KIND_LABEL[t.kind] || t.kind) + '</option>') + '</select></label>' +
      '<label class="lbl">Stream<input data-m-line list="' + id + '" maxlength="100" value="' + esc(t.line) + '"' + (t.pile ? ' disabled' : '') + '><datalist id="' + id + '">' + lines.map(function (l) { return '<option value="' + esc(l) + '">'; }).join('') + '</datalist></label>' +
      '<label class="lbl">How it is timed<select data-m-mode>' + Object.keys(MODE_LABEL).map(function (key) { return '<option value="' + key + '"' + (key === mode ? ' selected' : '') + '>' + MODE_LABEL[key] + '</option>'; }).join('') + '</select></label>' +
      '<label class="lbl" data-m-gapwrap' + (linked ? '' : ' hidden') + '>Extra wait (minutes)<input type="number" inputmode="numeric" data-m-gap value="' + (t.schedule_gap_minutes || 0) + '"></label>' +
      '<label class="lbl">Date<input type="date" data-m-date value="' + k + '" required' + (linked ? ' disabled' : '') + '></label>' +
      '<label class="lbl">Start time<input type="time" data-m-time value="' + (s != null ? clock(s) : '08:00') + '" required' + (linked ? ' disabled' : '') + '></label>' +
      '<label class="lbl">Duration (hours)<input type="number" inputmode="numeric" min="0" data-m-h value="' + h + '"></label>' +
      '<label class="lbl">Minutes<input type="number" inputmode="numeric" min="0" max="59" data-m-min value="' + m + '"></label></div>' +
      '<label class="lbl">Description<input data-m-desc maxlength="1000" value="' + esc(t.description || '') + '"></label>' +
      shiftBox() + '<div class="row"><button class="btn pri sm" type="submit">Save changes</button>' +
      '<button class="btn sm" type="button" data-m-cancel>Cancel</button><button class="btn bad sm" type="button" data-m-remove style="margin-left:auto"><span class="ms">delete</span>Remove task</button></div><div role="status" data-m-msg></div></form>';
  }
  function shiftBox() {
    return '<label class="row dp-shift"><input type="checkbox" data-m-shift>Also move the later tasks of this stream by the same amount</label>';
  }
  /** Only what the person actually changed is sent, so an untouched linked time stays linked. */
  function readEditor(form, t) {
    var changes = {}, title = form.querySelector('[data-m-title]').value.trim(), kind = form.querySelector('[data-m-kind]');
    if (title !== t.title) changes.title = title;
    if (!kind.disabled && kind.value !== t.kind) changes.kind = kind.value;
    var line = form.querySelector('[data-m-line]');
    if (!line.disabled && line.value.trim() !== t.line) changes.line = line.value.trim();
    var desc = form.querySelector('[data-m-desc]').value.trim();
    if (desc !== (t.description || '')) changes.description = desc;
    var mode = form.querySelector('[data-m-mode]').value, oldMode = t.schedule_mode || 'fixed';
    if (mode !== oldMode) changes.scheduleMode = mode;
    var gapText = form.querySelector('[data-m-gap]').value.trim(), gap = gapText === '' ? 0 : Number(gapText);
    if (mode !== 'fixed' && gap !== (t.schedule_gap_minutes || 0)) changes.gap = gap;
    if (mode === 'fixed') {
      var at = asLocalMs(form.querySelector('[data-m-date]').value, form.querySelector('[data-m-time]').value);
      if (!Number.isFinite(at)) throw new Error('Choose a date and a start time.');
      var was = P.startMs(t);
      if (was == null || Math.round(at / 60000) !== Math.round(was / 60000)) changes.startAt = at;
    }
    var minutes = minutesOf(form.querySelector('[data-m-h]').value, form.querySelector('[data-m-min]').value);
    if (Number.isNaN(minutes)) throw new Error('Enter the duration as whole hours and 0–59 minutes, or leave it blank.');
    var oldMinutes = Number.isInteger(t.planned_duration_minutes) ? t.planned_duration_minutes : null;
    if (minutes !== oldMinutes) changes.minutes = minutes;
    return changes;
  }

  /** Read the batch plan, apply the plan editor's own rules, save through the guarded call. */
  async function savePlan(ctx, batchId, build, meta) {
    var plan = await ctx.api.rpc('tk_batch_plan_get', { p_batch: batchId });
    var res = build(plan);
    await ctx.api.rpc('tk_batch_plan_save', { p_batch: batchId, p_expected: plan.token, p_name: (meta && meta.name != null ? meta.name : plan.batch.name), p_note: (meta && meta.note != null ? meta.note : plan.batch.note) || '', p_rows: res.rows });
    return res;
  }
  function saveEdit(ctx, t, changes, shift) {
    return savePlan(ctx, t.batch_id, function (plan) { return P.edit(plan, t.id, changes, !!shift, window.TK.scheduler); });
  }
  function savedNotice(ctx, text, res) {
    return { text: ctx.esc(text) + (res && res.alsoMoved ? ' ' + ctx.esc(plural(res.alsoMoved, 'later task', 'later tasks') + ' moved with it.') : '') };
  }
  function wireEditors(root, ctx, tasksById, afterSave, dayKey) {
    root.querySelectorAll('[data-dp-move]').forEach(function (btn) {
      btn.onclick = function () {
        var item = btn.closest('.dp-item'), open = item.querySelector('.dp-move');
        if (open) { open.remove(); return; }
        var t = tasksById[btn.dataset.dpMove];
        item.insertAdjacentHTML('beforeend', editorHtml(ctx, t, dayKey, linesOf(tasksById, t.batch_id)));
        var form = item.querySelector('.dp-move'), msg = form.querySelector('[data-m-msg]'), mode = form.querySelector('[data-m-mode]');
        form.querySelector('[data-m-cancel]').onclick = function () { form.remove(); };
        mode.onchange = function () {
          var linked = mode.value !== 'fixed';
          form.querySelector('[data-m-gapwrap]').hidden = !linked;
          form.querySelector('[data-m-date]').disabled = linked; form.querySelector('[data-m-time]').disabled = linked;
        };
        var removeBtn = form.querySelector('[data-m-remove]');
        removeBtn.onclick = async function () {
          if (removeBtn.dataset.sure !== '1') { removeBtn.dataset.sure = '1'; removeBtn.lastChild.textContent = 'Tap again to remove'; return; }
          removeBtn.disabled = true; msg.textContent = 'Removing…';
          try {
            var res = await saveEdit(ctx, t, { remove: true }, false);
            if (ctx.current()) { state.notice = savedNotice(ctx, 'Removed “' + t.title + '”.', res); afterSave(); }
          } catch (err) { msg.innerHTML = '<div class="error">' + ctx.esc(err.message || err) + '</div>'; removeBtn.disabled = false; removeBtn.dataset.sure = ''; removeBtn.lastChild.textContent = 'Remove task'; }
        };
        form.onsubmit = async function (e) {
          e.preventDefault();
          var submit = form.querySelector('[type=submit]'); submit.disabled = true; msg.textContent = 'Saving…';
          try {
            var changes = readEditor(form, t);
            if (!Object.keys(changes).length) { msg.textContent = 'Nothing was changed.'; submit.disabled = false; return; }
            var res = await saveEdit(ctx, t, changes, form.querySelector('[data-m-shift]').checked);
            if (ctx.current()) { state.notice = savedNotice(ctx, 'Saved “' + (changes.title || t.title) + '”.', res); afterSave(); }
          } catch (err) { msg.innerHTML = '<div class="error">' + ctx.esc(err.message || err) + '</div>'; submit.disabled = false; }
        };
      };
    });
  }

  /** Move an existing task, or add a new one of any type, onto a day. */
  function assignOption(t) {
    var s = P.startMs(t);
    return '#' + t.ord + ' · ' + t.title + ' (' + (KIND_LABEL[t.kind] || t.kind) + ') — ' + (s != null ? 'now ' + when(s) : 'no date yet');
  }
  function assignCardHtml(ctx, opts) {
    var esc = ctx.esc;
    return '<form class="card dp-assign" data-dp-assign="' + esc(opts.id || '') + '"' + (opts.fixedBatch ? ' data-batch-id="' + esc(opts.fixedBatch) + '"' : '') + '><div class="caps">' + esc(opts.heading) + '</div>' +
      '<div class="dp-modes" role="group" aria-label="What to do"><button type="button" class="on" data-a-mode="existing">Move an existing task</button><button type="button" data-a-mode="new">Add a new task</button></div>' +
      '<div class="dp-assigngrid">' +
      (opts.batches ? '<label class="lbl dp-a-batch">Batch<select data-a-batch required>' + opts.batches.map(function (b) { return '<option value="' + esc(b.id) + '"' + (b.id === opts.batchId ? ' selected' : '') + '>' + esc(b.name) + '</option>'; }).join('') + '</select></label>' : '') +
      (opts.withDate ? '<label class="lbl dp-a-date">Date<input type="date" data-a-date value="' + (opts.date || today()) + '" required></label>' : '') +
      '<label class="lbl dp-a-time">Start time<input type="time" data-a-time value="08:00" required></label></div>' +
      '<div class="dp-assigngrid" data-a-existing><label class="lbl dp-a-type">Type<select data-a-filter>' + kindOptions('', true) + '</select></label>' +
      '<label class="lbl dp-a-task">Task<select data-a-task required></select></label></div>' +
      '<div class="dp-assigngrid" data-a-new hidden>' +
      '<label class="lbl dp-a-type">Type<select data-a-kind>' + kindOptions('work') + '</select></label>' +
      '<label class="lbl dp-a-stream">Stream<input data-a-line list="dpLines' + esc(opts.listId || '') + '" maxlength="100" value="Main"><datalist id="dpLines' + esc(opts.listId || '') + '" data-a-lines></datalist></label>' +
      '<label class="lbl dp-a-task">New task name<input data-a-title maxlength="200" placeholder="e.g. Bunker rain washing"></label>' +
      '<label class="lbl dp-a-dur">Hours<input type="number" inputmode="numeric" min="0" data-a-h></label>' +
      '<label class="lbl dp-a-dur">Minutes<input type="number" inputmode="numeric" min="0" max="59" data-a-min></label></div>' +
      '<div data-a-shiftwrap>' + shiftBox().replace('data-m-shift', 'data-a-shift') + '</div>' +
      '<div class="row"><button class="btn pri dp-a-go" type="submit"><span class="ms">event_available</span><span data-a-label>' + esc(opts.button) + '</span></button></div><div role="status" data-a-msg></div></form>';
  }
  function wireAssignCard(form, ctx, getTasks, getLines, dateKey, afterSave) {
    if (!form) return;
    var batchSel = form.querySelector('[data-a-batch]'), taskSel = form.querySelector('[data-a-task]'), msg = form.querySelector('[data-a-msg]');
    var filter = form.querySelector('[data-a-filter]'), kind = form.querySelector('[data-a-kind]'), line = form.querySelector('[data-a-line]');
    var mode = 'existing', shown = [], loaded = [], autoLine = 'Main';
    function batchId() { return batchSel ? batchSel.value : form.dataset.batchId || null; }
    function renderList() {
      shown = loaded.filter(function (t) { return !filter.value || typeKey(t) === filter.value; });
      taskSel.innerHTML = shown.length ? shown.map(function (t, i) { return '<option value="' + i + '">' + ctx.esc(assignOption(t)) + '</option>'; }).join('') : '<option value="">No unstarted tasks of this type</option>';
      if (mode === 'existing') form.querySelector('[type=submit]').disabled = !shown.length;
    }
    async function fill() {
      loaded = await getTasks(batchId());
      renderList();
      form.querySelector('[data-a-lines]').innerHTML = getLines(batchId()).map(function (l) { return '<option value="' + ctx.esc(l) + '">'; }).join('');
    }
    function showMode(next) {
      mode = next;
      form.querySelectorAll('[data-a-mode]').forEach(function (b) { b.classList.toggle('on', b.dataset.aMode === next); });
      form.querySelector('[data-a-existing]').hidden = next !== 'existing';
      form.querySelector('[data-a-new]').hidden = next !== 'new';
      form.querySelector('[data-a-shiftwrap]').hidden = next !== 'existing';
      form.querySelector('[data-a-label]').textContent = next === 'new' ? 'Add task' : (form.querySelector('[data-a-label]').dataset.was || form.querySelector('[data-a-label]').textContent);
      form.querySelector('[type=submit]').disabled = next === 'existing' && !shown.length;
    }
    var label = form.querySelector('[data-a-label]'); label.dataset.was = label.textContent;
    form.querySelectorAll('[data-a-mode]').forEach(function (b) { b.onclick = function () { if (b.dataset.aMode === 'existing') label.textContent = label.dataset.was; showMode(b.dataset.aMode); }; });
    filter.onchange = renderList;
    kind.onchange = function () {
      var want = kind.value === 'cleaning' ? 'Cleaning' : 'Main';
      if (!line.value.trim() || line.value === autoLine) line.value = want;
      autoLine = want;
    };
    if (batchSel) batchSel.onchange = function () { fill().catch(function (e) { msg.innerHTML = '<div class="error">' + ctx.esc(e.message) + '</div>'; }); };
    fill().catch(function (e) { msg.innerHTML = '<div class="error">' + ctx.esc(e.message) + '</div>'; });
    form.onsubmit = async function (e) {
      e.preventDefault();
      var submit = form.querySelector('[type=submit]');
      submit.disabled = true; msg.textContent = 'Saving…';
      try {
        var dateInput = form.querySelector('[data-a-date]'), at = asLocalMs(dateInput ? dateInput.value : dateKey, form.querySelector('[data-a-time]').value);
        if (!Number.isFinite(at)) throw new Error('Choose a date and a start time.');
        var res, text;
        if (mode === 'new') {
          var minutes = minutesOf(form.querySelector('[data-a-h]').value, form.querySelector('[data-a-min]').value);
          if (Number.isNaN(minutes)) throw new Error('Enter the duration as whole hours and 0–59 minutes, or leave it blank.');
          var spec = { title: form.querySelector('[data-a-title]').value, kind: kind.value, line: line.value, startAt: at, minutes: minutes };
          res = await savePlan(ctx, batchId(), function (plan) { return P.addTask(plan, spec, window.TK.scheduler); });
          text = 'Added “' + spec.title.trim() + '” (' + KIND_LABEL[spec.kind] + ').';
        } else {
          var t = shown[+taskSel.value];
          if (!t) { submit.disabled = false; msg.textContent = ''; return; }
          res = await saveEdit(ctx, t, { startAt: at }, form.querySelector('[data-a-shift]').checked);
          text = 'Saved “' + t.title + '”.';
        }
        if (ctx.current()) { state.notice = savedNotice(ctx, text, res); afterSave(); }
      } catch (err) { msg.innerHTML = '<div class="error">' + ctx.esc(err.message || err) + '</div>'; submit.disabled = false; }
    };
  }
  function wireTaskLinks(root, ctx) {
    root.querySelectorAll('[data-t]').forEach(function (el) { el.onclick = function () { ctx.go('#/t/' + el.dataset.t); }; });
  }
  function wireDragShift(pane) {
    var box = pane.querySelector('[data-dp-dragshift]');
    if (box) box.onchange = function () { state.dragShift = box.checked; };
  }
  function byId(list) { var m = {}; list.forEach(function (t) { m[t.id] = t; }); return m; }
  function loadingCard() { return '<div class="card muted">Loading…</div>'; }
  function showNotice(pane, ctx, text, error) {
    var box = pane.querySelector('#dpNote');
    if (box) box.innerHTML = '<div class="' + (error ? 'error' : 'note') + '">' + ctx.esc(text) + '</div>';
  }
  function startDrag(e, t) {
    dragging = { id: t.id, batchId: t.batch_id, start: P.startMs(t) };
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', t.id); } catch (x) { /* some browsers refuse */ } }
  }
  function endDrag(root) { dragging = null; root.querySelectorAll('.drop').forEach(function (x) { x.classList.remove('drop'); }); }

  // ── Paddy → second convergence (the existing planner, shown per batch) ──────────────────────────────────────
  function planRows(tasks) { return tasks.slice().sort(function (a, b) { return a.ord - b.ord; }).map(function (t) { return Object.assign({ _locked: t.status !== 'todo' }, t); }); }
  /** null when the batch has no Paddy stream at all, so batches without Paddy show nothing. */
  function paddyOf(tasks, batch) {
    if (!window.TK.paddyConvergence || !tasks.some(function (t) { return /paddy/i.test(t.line || ''); })) return null;
    return window.TK.paddyConvergence.plan(planRows(tasks), null, Date.parse(batch.h0));
  }
  function paddyPillHtml(ctx, r, batchId) {
    if (!r) return '';
    var text = r.state === 'miss' ? 'Paddy ⚠ ' + (r.uncertain ? 'at least ' : '') + spanText(r.shortfallMs) + ' short' : r.state === 'waiting' ? 'Paddy ready early · waits ' + spanText(r.waitingMs) :
      r.state === 'on_time' ? 'Paddy on time' : 'Paddy timing needs setup';
    return '<button type="button" class="dp-pill ' + (r.state === 'miss' ? 'bad' : r.state === 'unknown' ? 'warn' : 'ok') + '" data-dp-panel-open="' + ctx.esc(batchId) + '" title="Paddy → second convergence forecast">' + ctx.esc(text) + '</button>';
  }
  function paddyCardHtml(ctx, r, editable) {
    var esc = ctx.esc;
    if (!r) return '<div class="card convergence-card"><div class="caps">Paddy → second convergence</div><p class="muted">This batch has no Paddy stream.</p></div>';
    var head = '<div class="caps">Paddy → second convergence · planning advisory</div>';
    var target = editable && r.targetIndex >= 0 && !r.targetLocked ? '<label class="lbl">Intended second convergence<input type="datetime-local" data-dp-target value="' + (r.target != null ? localInput(r.target) : '') + '"></label>' +
      '<button type="button" class="btn sm" data-dp-target-save>Set target</button>' : '';
    if (r.state === 'unknown') return '<div class="card convergence-card"><div class="big">Complete Paddy timing setup</div>' + head + target +
      '<p class="muted">A reliable backward suggestion and warning cannot be calculated yet. ' + esc((r.problems || []).join(' ')) + '</p>' +
      (r.suggested && r.suggested.length ? '<p><b>Reference starts if the SOP spacing is kept:</b></p><div class="convergence-steps">' + r.suggested.map(function (s) { return '<div><span>' + esc(s.title) + '</span><span>' + esc(whenFull(s.start)) + '</span></div>'; }).join('') + '</div>' : '') +
      '<p class="muted small">These are shifted template dates, not verified readiness times. Set the missing durations in the rows or reusable SOP to enable a forecast; no soak or rest time is guessed.</p></div>';
    var status = r.state === 'miss' ? (r.uncertain ? 'At least ' : 'Expected ') + 'shortfall: ' + spanText(r.shortfallMs) : r.state === 'waiting' ? 'Paddy ready early · waiting ' + spanText(r.waitingMs) : 'Paddy ready at the target';
    return '<div class="card convergence-card ' + (r.state === 'miss' ? 'convergence-alert' : '') + '" role="status"><div class="big">' + esc(status) + '</div>' + head + target +
      '<p><b>Target:</b> ' + esc(whenFull(r.target)) + ' · <b>Projected Paddy ready:</b> ' + esc(whenFull(r.ready)) + '</p>' +
      (r.state === 'miss' ? '<p><b>Cause:</b> ' + esc(r.cause) + '.</p><p><b>Next Paddy-based convergence:</b> ' + esc(whenFull(r.nextFeasible)) + '. Check the bagasse/CM stream and physical resource before moving the batch plan.</p>' : '<p class="muted">Early-ready Paddy is waiting, not late. Keep the intended convergence time unless the production plan changes.</p>') +
      (r.uncertain ? '<p class="note">A running Paddy step has passed its planned duration. This is an earliest estimate; confirm its remaining time before relying on it.</p>' : '') +
      '<div class="convergence-steps"><b>Work backward from the target</b>' + r.suggested.map(function (s) { return '<div><span>' + esc(s.title) + '</span><span>' + esc(whenFull(s.start) + ' → ' + whenFull(s.finish)) + '</span></div>'; }).join('') + '</div>' +
      (editable ? '<button type="button" class="btn" data-dp-paddy-apply>Put suggested Paddy starts into the plan</button>' : '') +
      '<p class="muted small">Uses the saved SOP’s stage durations and waits. It does not validate material readiness, Lab results or bunker/tunnel availability, and never changes actual work or task gates.</p></div>';
  }

  // ── a batch as a whole: name, note, START (fills every task down), Paddy, add a task ───────────────────────
  function panelHtml(ctx, b, tasks, opts) {
    var esc = ctx.esc, a = P.anchor(tasks), r = paddyOf(tasks, b), unstarted = tasks.filter(function (t) { return t.status === 'todo'; });
    var head = '<div class="row"><div class="grow"><div class="big">' + esc(b.name) + '</div><div class="muted">' + plural(tasks.length, 'task', 'tasks') + (a.started ? ' · work has started' : ' · not started yet') +
      '</div></div><button type="button" class="btn sm" data-dp-panel-close>Close</button></div>';
    if (!ctx.isAdmin) return '<div class="card dp-panel">' + head + '</div>' + (r ? paddyCardHtml(ctx, r, false) : '');
    var startLabel = a.started ? 'Remaining tasks start (first unstarted task)' : 'Batch start (first task)';
    return '<div class="card dp-panel" data-dp-panel="' + esc(b.id) + '">' + head +
      '<form class="dp-batchform" data-dp-batchform><div class="dp-fields">' +
      '<label class="lbl">Batch name<input data-b-name maxlength="100" required value="' + esc(b.name) + '"></label>' +
      '<label class="lbl">Batch note<input data-b-note maxlength="500" value="' + esc(b.note || '') + '"></label>' +
      '<label class="lbl">' + esc(startLabel) + '<input type="datetime-local" data-b-start value="' + (a.ms != null ? localInput(a.ms) : '') + '"' + (a.ms == null ? ' disabled' : '') + '></label></div>' +
      '<p class="muted small" data-b-preview>' + (a.ms != null ? 'Changing the start moves all ' + plural(a.movable, 'unstarted task', 'unstarted tasks') + ' below it together, the same way the New batch screen fills a batch down from its start. Recorded work never moves.' : 'No unstarted task has a planned time yet. Add or assign one below.') + '</p>' +
      '<div class="row"><button class="btn pri sm" type="submit">Save batch</button> <a class="btn sm" href="#/b/' + esc(b.id) + '/edit">Open the full row editor</a></div><div role="status" data-b-msg></div></form></div>' +
      (r ? paddyCardHtml(ctx, r, true) : '') +
      (b.status === 'active' ? assignCardHtml(ctx, { id: 'panel', fixedBatch: b.id, heading: 'Add or move a task in ' + b.name, withDate: true, date: a.ms != null ? P.key(a.ms) : today(), button: 'Put on this day', listId: 'P' + String(b.id).replace(/[^\w]/g, '') }) : '');
  }
  function wirePanel(box, ctx, b, tasks, all, afterSave, closePanel) {
    var close = box.querySelector('[data-dp-panel-close]');
    if (close) close.onclick = closePanel;
    var form = box.querySelector('[data-dp-batchform]');
    if (!ctx.isAdmin || !form) return;
    var a = P.anchor(tasks), startInput = form.querySelector('[data-b-start]'), preview = form.querySelector('[data-b-preview]'), msg = form.querySelector('[data-b-msg]');
    startInput.onchange = function () {
      if (a.ms == null || !startInput.value) return;
      var next = new Date(startInput.value).getTime(), delta = next - a.ms;
      if (Number.isFinite(next)) preview.textContent = delta === 0 ? 'No change.' : 'Moves ' + plural(a.movable, 'unstarted task', 'unstarted tasks') + ' ' + spanText(delta) + (delta > 0 ? ' later' : ' earlier') + ' (first one to ' + whenFull(next) + '). Recorded work stays where it is.';
    };
    form.onsubmit = async function (e) {
      e.preventDefault();
      var submit = form.querySelector('[type=submit]'); submit.disabled = true; msg.textContent = 'Saving…';
      try {
        var name = form.querySelector('[data-b-name]').value.trim(), note = form.querySelector('[data-b-note]').value.trim();
        if (!name) throw new Error('Give the batch a name.');
        var next = startInput.value ? new Date(startInput.value).getTime() : null, moves = a.ms != null && next != null && Math.round(next / 60000) !== Math.round(a.ms / 60000);
        if (!moves && name === b.name && note === (b.note || '')) { msg.textContent = 'Nothing was changed.'; submit.disabled = false; return; }
        var res = await savePlan(ctx, b.id, function (plan) {
          return moves ? P.shiftBatch(plan, next, window.TK.scheduler) : { rows: plan.rows, alsoMoved: 0 };
        }, { name: name, note: note });
        if (ctx.current()) { state.notice = { text: ctx.esc('Saved ' + name + '.') + (moves ? ' ' + ctx.esc('Every unstarted task moved ' + spanText(res.delta) + (res.delta > 0 ? ' later' : ' earlier') + '.') : '') }; afterSave(); }
      } catch (err) { msg.innerHTML = '<div class="error">' + ctx.esc(err.message || err) + '</div>'; submit.disabled = false; }
    };
    var apply = box.querySelector('[data-dp-paddy-apply]'), save = box.querySelector('[data-dp-target-save]');
    function paddyUpdate(build, text) {
      return async function () {
        var button = this; button.disabled = true;
        try {
          var res = await savePlan(ctx, b.id, function (plan) { return P.restart(plan, build(plan), window.TK.scheduler); });
          if (ctx.current()) { state.notice = savedNotice(ctx, text, res); afterSave(); }
        } catch (err) { msg.innerHTML = '<div class="error">' + ctx.esc(err.message || err) + '</div>'; button.disabled = false; }
      };
    }
    function fresh(plan) { return window.TK.paddyConvergence.plan(planRows(plan.rows), null, Date.parse(plan.batch.h0)); }
    if (apply) apply.onclick = paddyUpdate(function (plan) {
      var r = fresh(plan);
      if (r.state === 'unknown') throw new Error('Finish the Paddy timing setup first: ' + (r.problems || []).join(' '));
      return r.suggested.map(function (s) { return { index: s.index, start: s.start }; });
    }, 'Suggested Paddy starts saved into the plan.');
    if (save) save.onclick = function () {
      var input = box.querySelector('[data-dp-target]'), at = input.value ? new Date(input.value).getTime() : NaN;
      if (!Number.isFinite(at)) { msg.innerHTML = '<div class="error">Choose a date and time for the second convergence.</div>'; return; }
      paddyUpdate(function (plan) {
        var r = fresh(plan);
        if (r.targetIndex == null || r.targetIndex < 0) throw new Error('Name the intended “Second convergence” row first.');
        return [{ index: r.targetIndex, start: at }];
      }, 'Second convergence moved.').call(save);
    };
    // This add-task form is bound to the batch, not to a day: its own Date field decides.
    wireAssignCard(box.querySelector('[data-dp-assign="panel"]'), ctx, async function () { return tasks.filter(function (t) { return t.status === 'todo'; }); }, function () { return linesOf(all, b.id); }, null, afterSave);
  }
  function wirePaddyOpeners(root, setPanel) {
    root.querySelectorAll('[data-dp-panel-open]').forEach(function (b) { b.onclick = function () { setPanel(b.dataset.dpPanelOpen); }; });
  }

  // ── Assign daily tasks ──────────────────────────────────────────────────────────────────────────────────────
  var LOOKBACK = 366 * 86400000;             // the editor permits a planned stage lasting up to one year
  async function loadDay(ctx, k, span) {
    var from = P.dayWindow(k).start, to = P.dayWindow(P.addDays(k, span - 1)).end;
    var a = new Date(from.getTime() - LOOKBACK).toISOString(), z = to.toISOString();
    var res = await Promise.all([
      // Planned OR actually started inside the window, so the board can show real work as well as the plan.
      all(ctx, ctx.taskSource, { select: cols(ctx), or: '(and(suggested_at.gte.' + a + ',suggested_at.lt.' + z + '),and(started_at.gte.' + a + ',started_at.lt.' + z + '))', order: 'suggested_at.asc,ord.asc' }),
      all(ctx, ctx.taskSource, { select: cols(ctx), batch_status: 'eq.active', order: 'batch_name.asc,ord.asc' }),
      all(ctx, 'tk_v_batch', { select: 'id,name,note,status,h0', status: 'eq.active', order: 'h0.asc' }),
    ]);
    var open = res[1].filter(function (t) { return ['todo', 'running', 'returned', 'submitted'].indexOf(t.status) >= 0; });
    return { near: res[0], open: open, every: res[1], batches: res[2], from: from, to: to };
  }

  /** The owner's "Status" grid: date + hour down the side, a column per batch, one block per task. */
  function boardHtml(ctx, b) {
    var esc = ctx.esc, col = 3, tracks = ['78px', '64px'], head = '', body = '';
    b.batches.forEach(function (g) {
      g.col = col; col += g.lanes;
      for (var i = 0; i < g.lanes; i++) tracks.push('minmax(150px, 1fr)');
      head += '<div class="dp-bh" style="grid-row:1;grid-column:' + g.col + ' / span ' + g.lanes + '" title="' + esc(g.name) + '">' + esc(g.name) + '</div>';
      body += '<div class="dp-bbg" data-batch="' + esc(g.batchId) + '" style="grid-row:2 / span ' + b.rows + ';grid-column:' + g.col + ' / span ' + g.lanes + '"></div>';
    });
    b.hours.forEach(function (h) {
      body += '<div class="dp-bt' + (h.dayStart ? ' day' : '') + '" style="grid-row:' + (h.row + 2) + ';grid-column:2">' + h.label + '</div>';
      if (h.dayStart) body += '<div class="dp-bd" style="grid-row:' + (h.row + 2) + ' / span ' + Math.min(24, b.rows - h.row) + ';grid-column:1"><span>' +
        esc(P.parse(h.key).toLocaleDateString('en-GB', { weekday: 'short' })) + '<b>' + esc(dayShort(h.key)) + '</b></span></div>';
    });
    b.batches.forEach(function (g) {
      g.items.forEach(function (it) {
        var t = it.task, whenText = it.actual ? 'Recorded ' + clock(it.s) + (t.ended_at ? '–' + clock(it.e) : ' – running') : 'Planned ' + span(t, null);
        var drag = canEdit(ctx, t) && !it.actual;
        body += '<button type="button" class="dp-block t-' + it.tone + (it.actual ? '' : ' plan') + (it.cutBefore ? ' cut-b' : '') + (it.cutAfter ? ' cut-a' : '') + '" data-t="' + esc(t.id) + '" data-batch="' + esc(g.batchId) + '"' + (drag ? ' draggable="true" data-dp-drag="' + esc(t.id) + '"' : '') + ' style="grid-row:' + (it.rowStart + 2) + ' / ' + (it.rowEnd + 2) + ';grid-column:' + (g.col + it.lane) + '" title="' + esc(g.name + ' · #' + t.ord + ' ' + t.title + ' (' + (KIND_LABEL[t.kind] || t.kind) + ') · ' + whenText + ' · ' + STATE_LABEL[it.state]) + '"><b>' + (MARK[it.state] || '') + esc(t.title) + '</b><span>' + esc(it.actual ? clock(it.s) + (t.ended_at ? '–' + clock(it.e) : ' →') : span(t, null)) + '</span></button>';
      });
    });
    if (b.nowRow != null) body += '<div class="dp-now" style="grid-row:' + (Math.floor(b.nowRow) + 2) + ';grid-column:1 / -1;margin-top:calc(var(--dp-row) * ' + (b.nowRow % 1).toFixed(3) + ')" aria-hidden="true"></div>';
    return '<div class="card dp-board"><div class="caps">Hour by hour' + (b.rows > 24 ? ' · ' + (b.rows / 24) + ' days' : '') + '</div>' +
      '<div class="dp-boardscroll"><div class="dp-boardgrid" style="grid-template-columns:' + tracks.join(' ') + ';grid-template-rows:30px repeat(' + b.rows + ', var(--dp-row))">' +
      '<div class="dp-bh dp-corner" style="grid-row:1;grid-column:1 / span 2">Date · Time</div>' + head + body + '</div></div>' +
      '<p class="muted small" style="margin:6px 0 0">Solid blocks are recorded work (start to finish, or to now while running). Dashed blocks are the plan.' + (ctx.isAdmin ? ' Drag a dashed block to another hour of its own batch column to re-plan it.' : '') + ' Blocks snap to whole hours; hover for exact times.</p></div>';
  }

  async function mountDaily(pane, ctx) {
    ctx = beginLoad(ctx);
    resetFullIfStale(pane);
    if (!state.day || !P.parse(state.day)) state.day = today();
    if ([1, 2, 3].indexOf(state.span) < 0) state.span = 1;
    var k = state.day, esc = ctx.esc, spanDays = state.span;
    pane.innerHTML = loadingCard();
    var data;
    try { data = await loadDay(ctx, k, spanDays); } catch (e) { if (ctx.current()) pane.innerHTML = '<div class="error">' + esc(e.message) + '</div>'; return; }
    if (!ctx.current()) return;
    var dayStart = data.from, filter = state.batch, batches = {};
    data.every.concat(data.near).forEach(function (t) { if (t.batch_status === 'active') batches[t.batch_id] = t.batch_name; });
    if (filter && !batches[filter]) filter = state.batch = '';
    function pick(list) { return (filter ? list.filter(function (t) { return t.batch_id === filter; }) : list).filter(visible); }
    var planned = pick(data.near.filter(function (t) { var s = P.startMs(t); return s != null && s >= data.from.getTime() && s < data.to.getTime(); }));
    var groups = P.groupByBatch(planned), grid = P.board(pick(Object.values(byId(data.near.concat(data.every)))), k, spanDays, Date.now());
    var isToday = k === today();
    var carried = isToday ? pick(P.carriedOver(data.open, dayStart)) : [];
    var loose = pick(P.unscheduled(data.open));
    var counts = { done: 0, running: 0, missed: 0 };
    planned.forEach(function (t) { var st = P.state(t, Date.now()); if (st === 'done') counts.done++; else if (st === 'running') counts.running++; if (P.tone(t, Date.now()) === 'missed') counts.missed++; });
    var all = byId(data.near.concat(data.every));
    var openBatches = Object.keys(batches).map(function (id) { return { id: id, name: batches[id] }; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var batchInfo = {}; data.batches.forEach(function (b) { batchInfo[b.id] = b; });
    var shownBatches = openBatches.filter(function (b) { return !filter || b.id === filter; }).filter(function (b) { return batchInfo[b.id]; });
    var title = dayLong(k) + (spanDays > 1 ? ' → ' + dayLong(P.addDays(k, spanDays - 1)) : '') + (isToday ? ' · today' : '');
    var strip = shownBatches.map(function (b) {
      var tasks = data.every.filter(function (t) { return t.batch_id === b.id; });
      return '<div class="dp-batchchip"><b>' + esc(b.name) + '</b>' + paddyPillHtml(ctx, paddyOf(tasks, batchInfo[b.id]), b.id) +
        '<button type="button" class="btn sm" data-dp-panel-open="' + esc(b.id) + '"><span class="ms">' + (ctx.isAdmin ? 'tune' : 'info') + '</span>' + (ctx.isAdmin ? 'Edit batch' : 'Details') + '</button></div>';
    }).join('');

    pane.innerHTML = '<div class="dp">' +
      '<div class="dp-toolbar"><button type="button" class="btn sm" data-dp-prev aria-label="Previous day"><span class="ms">chevron_left</span></button>' +
      '<input type="date" data-dp-date value="' + k + '" aria-label="Day">' +
      '<button type="button" class="btn sm" data-dp-next aria-label="Next day"><span class="ms">chevron_right</span></button>' +
      '<button type="button" class="btn sm" data-dp-today' + (isToday ? ' disabled' : '') + '>Today</button>' +
      '<select data-dp-span aria-label="Days shown">' + [1, 2, 3].map(function (n) { return '<option value="' + n + '"' + (n === spanDays ? ' selected' : '') + '>' + n + (n === 1 ? ' day' : ' days') + '</option>'; }).join('') + '</select>' +
      '<select data-dp-batch aria-label="Batch"><option value="">All batches</option>' + openBatches.map(function (b) { return '<option value="' + esc(b.id) + '"' + (b.id === filter ? ' selected' : '') + '>' + esc(b.name) + '</option>'; }).join('') + '</select>' + fullButton() +
      (ctx.isAdmin ? '<a class="btn sm" href="#/new"><span class="ms">add</span>New batch</a>' : '') + '</div>' +
      typeFilterHtml() + noticeHtml() + dragShiftBox(ctx) +
      (strip ? '<div class="dp-batchstrip">' + strip + '</div>' : '') + '<div id="dpPanel"></div>' +
      '<div class="dp-head"><div class="big">' + esc(title) + '</div><div class="muted">' +
        (planned.length ? plural(planned.length, 'task', 'tasks') + ' planned' + (counts.done ? ' · ' + counts.done + ' done' : '') + (counts.running ? ' · ' + counts.running + ' running' : '') + (counts.missed ? ' · ' + counts.missed + ' missed' : '') : 'No tasks are planned for this day.') +
        '</div></div>' + (planned.length || grid.batches.length ? legendHtml() : '') +
      (ctx.isAdmin && openBatches.length ? assignCardHtml(ctx, { id: 'main', heading: 'Add or move a task on ' + dayLong(k), batches: openBatches, batchId: filter || openBatches[0].id, button: 'Put on this day' }) : '') +
      (grid.batches.length ? boardHtml(ctx, grid) : '') +
      groups.map(function (g) {
        return '<div class="dp-group"><div class="dp-grouphead"><span class="caps">Batch</span> <b>' + esc(g.name) + '</b> <span class="muted small">' + plural(g.tasks.length, 'task', 'tasks') + '</span></div>' +
          g.tasks.map(function (t) { return itemHtml(ctx, t, { day: k }); }).join('') + '</div>';
      }).join('') +
      (carried.length ? '<div class="dp-group"><div class="dp-grouphead"><span class="caps">Carried over</span> <span class="muted small">planned earlier, not finished</span></div>' + carried.map(function (t) { return itemHtml(ctx, t, { batch: true, day: k }); }).join('') + '</div>' : '') +
      (loose.length ? '<div class="dp-group"><div class="dp-grouphead"><span class="caps">Not on a day yet</span> <span class="muted small">' + plural(loose.length, 'task', 'tasks') + ' without a planned time' + (ctx.isAdmin ? ' — use Assign to put one on ' + esc(dayLong(k)) : '') + '</span></div>' + loose.slice(0, 60).map(function (t) { return itemHtml(ctx, t, { batch: true }); }).join('') + (loose.length > 60 ? '<p class="muted small">Showing 60 of ' + loose.length + '. Pick a batch above to narrow the list.</p>' : '') + '</div>' : '') +
      '</div>';

    function reload() { mountDaily(pane, ctx); }
    function setDay(next) { if (P.parse(next)) { state.day = next; reload(); } }
    pane.querySelector('[data-dp-prev]').onclick = function () { setDay(P.addDays(k, -1)); };
    pane.querySelector('[data-dp-next]').onclick = function () { setDay(P.addDays(k, 1)); };
    pane.querySelector('[data-dp-today]').onclick = function () { setDay(today()); };
    pane.querySelector('[data-dp-date]').onchange = function (e) { setDay(e.target.value); };
    pane.querySelector('[data-dp-span]').onchange = function (e) { state.span = +e.target.value; reload(); };
    pane.querySelector('[data-dp-batch]').onchange = function (e) { state.batch = e.target.value; reload(); };
    wireFull(pane); wireDragShift(pane); wireTypeFilter(pane, reload); wireTaskLinks(pane, ctx);
    function renderPanel() {
      var box = pane.querySelector('#dpPanel'), id = state.panel, b = id && batchInfo[id];
      if (!b) { box.innerHTML = ''; return; }
      var tasks = data.every.filter(function (t) { return t.batch_id === id; });
      box.innerHTML = panelHtml(ctx, b, tasks);
      wirePanel(box, ctx, b, tasks, all, reload, function () { state.panel = null; renderPanel(); });
      box.scrollIntoView && box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    wirePaddyOpeners(pane, function (id) { state.panel = id; renderPanel(); });
    if (state.panel) renderPanel();
    // Start the board at the current hour (today) or the first block, not at midnight.
    var scroller = pane.querySelector('.dp-boardscroll');
    if (scroller && grid.batches.length) {
      var target = grid.nowRow != null ? grid.nowRow : Math.min.apply(null, grid.batches.map(function (g) { return Math.min.apply(null, g.items.map(function (it) { return it.rowStart; })); }));
      scroller.scrollTop = Math.max(0, target * 28 - 60);
    }
    if (ctx.isAdmin) {
      wireEditors(pane, ctx, all, reload, k);
      wireAssignCard(pane.querySelector('[data-dp-assign="main"]'), ctx, async function (batchId) {
        return data.open.filter(function (t) { return t.batch_id === batchId && t.status === 'todo'; }).sort(function (a, b) { return a.ord - b.ord; });
      }, function (batchId) { return linesOf(all, batchId); }, k, reload);
      wireBoardDrag(pane, ctx, all, data.from.getTime(), grid.rows, reload);
    }
  }

  /** Drag a planned block to another hour of its own batch column. */
  function wireBoardDrag(pane, ctx, all, fromMs, rows, reload) {
    var gridEl = pane.querySelector('.dp-boardgrid');
    if (!gridEl) return;
    gridEl.querySelectorAll('[data-dp-drag]').forEach(function (el) {
      el.ondragstart = function (e) { startDrag(e, all[el.dataset.dpDrag]); el.classList.add('dragging'); };
      el.ondragend = function () { el.classList.remove('dragging'); endDrag(gridEl); };
    });
    function rowAt(e) {
      var rect = gridEl.getBoundingClientRect(), rowPx = parseFloat(getComputedStyle(gridEl).getPropertyValue('--dp-row')) || 28;
      return Math.floor((e.clientY - rect.top - 30) / rowPx);
    }
    function targetBatch(e) { var el = e.target.closest && e.target.closest('[data-batch]'); return el ? el.dataset.batch : null; }
    gridEl.ondragover = function (e) {
      if (!dragging) return;
      var row = rowAt(e);
      if (targetBatch(e) === dragging.batchId && row >= 0 && row < rows) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; }
    };
    gridEl.ondrop = async function (e) {
      if (!dragging) return;
      e.preventDefault();
      var drag = dragging, row = rowAt(e), batch = targetBatch(e);
      endDrag(gridEl);
      var t = all[drag.id];
      if (!t || batch !== drag.batchId) { showNotice(pane, ctx, 'A task can only be moved within its own batch column.', true); return; }
      if (row < 0 || row >= rows) return;
      var oldStart = P.startMs(t), minutes = oldStart != null ? new Date(oldStart).getMinutes() : 0;   // local clock: IST is a half-hour zone
      var next = fromMs + row * HOUR + minutes * 60000;
      if (oldStart != null && Math.round(next / 60000) === Math.round(oldStart / 60000)) return;
      try {
        var res = await saveEdit(ctx, t, { startAt: next }, state.dragShift);
        if (ctx.current()) { state.notice = savedNotice(ctx, 'Saved “' + t.title + '”.', res); reload(); }
      } catch (err) { showNotice(pane, ctx, err.message || String(err), true); }
    };
  }

  // ── Monthly task chart ──────────────────────────────────────────────────────────────────────────────────────
  async function loadMonth(ctx, ym) {
    var w = P.monthWindow(ym), a = new Date(w.start.getTime() - LOOKBACK).toISOString();
    var res = await Promise.all([
      all(ctx, ctx.taskSource, { select: cols(ctx), and: '(suggested_at.gte.' + a + ',suggested_at.lt.' + w.end.toISOString() + ')', order: 'suggested_at.asc,ord.asc' }),
      all(ctx, 'tk_v_batch', { select: 'id,name,note,status,h0', status: 'eq.active', order: 'h0.asc' }),
      all(ctx, ctx.taskSource, { select: cols(ctx), batch_status: 'eq.active', order: 'batch_name.asc,ord.asc' }),
    ]);
    return { tasks: res[0], batches: res[1], every: res[2] };
  }
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MAX_LINES = 3;

  /** The owner's monthly schedule: a row per date, a column per batch, the stage(s) of that day in each cell. */
  function chartHtml(ctx, m, byBatch, info) {
    var esc = ctx.esc, now = Date.now();
    var head = '<th class="dp-date" scope="col">Date</th>' + m.rows.map(function (r) {
      var tasks = byBatch[r.batchId] || [], first = null;
      tasks.forEach(function (t) { var s = P.startMs(t); if (s != null && (first == null || s < first)) first = s; });
      var pill = info[r.batchId] ? paddyPillHtml(ctx, paddyOf(tasks, info[r.batchId]), r.batchId) : '';
      return '<th class="dp-bcol" scope="col"><div class="dp-bhead"><b>' + esc(r.name) + '</b>' +
        (info[r.batchId] ? '<button type="button" class="btn sm dp-hedit" data-dp-panel-open="' + esc(r.batchId) + '" title="' + (ctx.isAdmin ? 'Edit this batch: name, start, Paddy, add a task' : 'Batch details') + '" aria-label="' + (ctx.isAdmin ? 'Edit batch ' : 'Details of batch ') + esc(r.name) + '"><span class="ms">' + (ctx.isAdmin ? 'tune' : 'info') + '</span></button>' : '') + '</div>' +
        '<span class="muted small">' + (r.status !== 'active' ? 'Closed · ' : '') + (first != null ? 'first task ' + esc(when(first)) + ' · ' : '') + plural(r.total, 'task', 'tasks') + '</span>' + pill + '</th>';
    }).join('');
    var body = m.days.map(function (d) {
      var cells = m.rows.map(function (r) {
        var c = r.cells[d.key], on = state.sel && state.sel.batchId === r.batchId && state.sel.key === d.key, id = esc(r.batchId) + '|' + d.key;
        var open = ctx.isAdmin && r.status === 'active';
        if (!c && !open) return '<td class="dp-cellwrap"></td>';
        if (!c) return '<td class="dp-cellwrap"><div class="dp-cell empty' + (on ? ' sel' : '') + '" role="button" tabindex="0" data-dp-cell="' + id + '" data-batch="' + esc(r.batchId) + '" data-key="' + d.key + '" aria-label="' + esc(r.name + ', ' + dayLong(d.key) + ', nothing planned. Assign a task') + '"><span class="ms">add</span></div></td>';
        var ordered = c.tasks.filter(function (t) { return t.kind !== 'lab' && t.kind !== 'lab_gate'; }).concat(c.tasks.filter(function (t) { return t.kind === 'lab' || t.kind === 'lab_gate'; }));
        var lines = ordered.slice(0, MAX_LINES).map(function (t) {
          var st = P.state(t, now), cont = c.cont[t.id], drag = canEdit(ctx, t) && !cont;
          return '<span class="dp-line t-' + P.tone(t, now) + (cont ? ' cont' : '') + (t.kind === 'lab' || t.kind === 'lab_gate' ? ' lab' : '') + '"' + (drag ? ' draggable="true" data-dp-drag="' + esc(t.id) + '"' : '') + '>' + (MARK[st] || '') + (cont ? '↳ ' : '') + esc(t.title) + '</span>';
        }).join('') + (ordered.length > MAX_LINES ? '<span class="dp-more">+' + (ordered.length - MAX_LINES) + ' more</span>' : '');
        var tip = ordered.slice(0, 12).map(function (t) { return '#' + t.ord + ' ' + t.title + ' (' + (KIND_LABEL[t.kind] || t.kind) + ') · ' + span(t, d.key) + ' · ' + STATE_LABEL[P.state(t, now)]; }).join('\n') + (ordered.length > 12 ? '\n+' + (ordered.length - 12) + ' more' : '');
        return '<td class="dp-cellwrap"><div class="dp-cell' + (on ? ' sel' : '') + (c.tasks.some(function (t) { return P.tone(t, now) === 'missed'; }) ? ' has-missed' : '') + '" role="button" tabindex="0" data-dp-cell="' + id + '" data-batch="' + esc(r.batchId) + '" data-key="' + d.key + '" title="' + esc(tip) + '" aria-label="' + esc(r.name + ', ' + dayLong(d.key) + ', ' + plural(c.tasks.length, 'task', 'tasks')) + '">' + lines + '</div></td>';
      }).join('');
      return '<tr class="dp-dayrow' + (d.today ? ' today' : '') + (d.weekend ? ' we' : '') + '"><th class="dp-date" scope="row"><button type="button" data-dp-pickday="' + d.key + '" title="Open ' + esc(dayLong(d.key)) + ' hour by hour">' +
        dayShort(d.key) + '</button><span class="dp-dow">' + DOW[d.dow] + '</span></th>' + cells + '</tr>';
    }).join('');
    return '<div class="card dp-chart"><div class="dp-monthscroll"><table class="dp-month"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }

  async function mountMonthly(pane, ctx) {
    ctx = beginLoad(ctx);
    resetFullIfStale(pane);
    if (!state.month || !P.parseMonth(state.month)) state.month = P.monthKey(new Date());
    var ym = state.month, esc = ctx.esc;
    pane.innerHTML = loadingCard();
    var data;
    try { data = await loadMonth(ctx, ym); } catch (e) { if (ctx.current()) pane.innerHTML = '<div class="error">' + esc(e.message) + '</div>'; return; }
    if (!ctx.current()) return;
    var visibleTasks = data.tasks.filter(visible);
    var m = P.monthMatrix(visibleTasks, data.batches, ym, new Date());
    var thisMonth = P.monthKey(new Date()) === ym, all = byId(data.tasks.concat(data.every));
    var byBatch = {}, info = {};
    data.every.forEach(function (t) { (byBatch[t.batch_id] = byBatch[t.batch_id] || []).push(t); });
    data.batches.forEach(function (b) { info[b.id] = b; });
    var total = m.rows.reduce(function (n, r) { return n + r.total; }, 0);
    var unscheduled = data.every.filter(function (t) { return !t.suggested_at && t.status === 'todo'; }).length;
    pane.innerHTML = '<div class="dp">' +
      '<div class="dp-toolbar"><button type="button" class="btn sm" data-dp-prev aria-label="Previous month"><span class="ms">chevron_left</span></button>' +
      '<div class="dp-monthname">' + esc(monthLong(ym)) + '</div>' +
      '<button type="button" class="btn sm" data-dp-next aria-label="Next month"><span class="ms">chevron_right</span></button>' +
      '<button type="button" class="btn sm" data-dp-this' + (thisMonth ? ' disabled' : '') + '>This month</button>' + fullButton() +
      (ctx.isAdmin ? '<a class="btn sm" href="#/new"><span class="ms">add</span>New batch</a>' : '') + '</div>' +
      typeFilterHtml() + noticeHtml() + dragShiftBox(ctx) +
      '<div class="muted dp-sub">' + (total ? plural(total, 'task', 'tasks') + ' start this month across ' + plural(m.rows.filter(function (r) { return r.total; }).length, 'batch', 'batches') + '. A stage that runs for days shows on each day (↳).' : 'Nothing is planned this month yet.') +
        (ctx.isAdmin ? ' Tap a batch’s <b>tune</b> button to edit the batch (its start fills every task down), drag a task to another day, or tap a cell to edit it.' : ' Tap a cell to see its tasks.') + ' Tap a date for the hour-by-hour board.</div>' + legendHtml() +
      '<div id="dpPanel"></div>' +
      (m.rows.length ? chartHtml(ctx, m, byBatch, info) : '<div class="card muted">No open batch and nothing planned this month.</div>') +
      '<div id="dpDrawer"></div>' +
      (unscheduled ? '<div class="note" style="margin-top:12px">' + plural(unscheduled, 'unstarted task has', 'unstarted tasks have') + ' no planned time yet. ' + (ctx.isAdmin ? 'Tap a cell to assign one, or use <b>Assign daily tasks</b>.' : '') + '</div>' : '') + '</div>';

    function reload() { mountMonthly(pane, ctx); }
    pane.querySelector('[data-dp-prev]').onclick = function () { state.month = P.addMonths(ym, -1); state.sel = null; reload(); };
    pane.querySelector('[data-dp-next]').onclick = function () { state.month = P.addMonths(ym, 1); state.sel = null; reload(); };
    pane.querySelector('[data-dp-this]').onclick = function () { state.month = P.monthKey(new Date()); state.sel = null; reload(); };
    wireFull(pane); wireDragShift(pane); wireTypeFilter(pane, reload);
    pane.querySelectorAll('[data-dp-pickday]').forEach(function (b) { b.onclick = function () { ctx.openDay(b.dataset.dpPickday, ''); }; });
    function renderPanel() {
      var box = pane.querySelector('#dpPanel'), id = state.panel, b = id && info[id];
      if (!b) { box.innerHTML = ''; return; }
      var tasks = byBatch[id] || [];
      box.innerHTML = panelHtml(ctx, b, tasks);
      wirePanel(box, ctx, b, tasks, all, reload, function () { state.panel = null; renderPanel(); });
      box.scrollIntoView && box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    wirePaddyOpeners(pane, function (id) { state.panel = id; state.sel = null; pane.querySelector('#dpDrawer').innerHTML = ''; pane.querySelectorAll('.dp-cell.sel').forEach(function (x) { x.classList.remove('sel'); }); renderPanel(); });
    pane.querySelectorAll('[data-dp-cell]').forEach(function (b) {
      function select() {
        var parts = b.dataset.dpCell.split('|');
        state.sel = { batchId: parts[0], key: parts[1] };
        pane.querySelectorAll('.dp-cell.sel').forEach(function (x) { x.classList.remove('sel'); });
        b.classList.add('sel');
        drawer();
      }
      b.onclick = select;
      b.onkeydown = function (e) { if (e.target === b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(); } };
    });
    if (ctx.isAdmin) wireChartDrag(pane, ctx, all, reload);

    function drawer() {
      var box = pane.querySelector('#dpDrawer');
      if (!state.sel) { box.innerHTML = ''; return; }
      var row = m.rows.filter(function (r) { return r.batchId === state.sel.batchId; })[0];
      if (!row) { box.innerHTML = ''; return; }
      var cell = row.cells[state.sel.key], list = cell ? cell.tasks : [], k = state.sel.key;
      box.innerHTML = '<div class="card dp-drawer"><div class="row"><div class="grow"><div class="big">' + esc(row.name) + '</div><div class="muted">' + esc(dayLong(k)) + ' · ' +
        (list.length ? plural(list.length, 'task', 'tasks') + ' on this day' : 'nothing planned') + '</div></div>' +
        '<button type="button" class="btn sm" data-dp-openday><span class="ms">calendar_view_day</span>Open day</button></div>' +
        list.map(function (t) { return itemHtml(ctx, t, { day: k }); }).join('') +
        (ctx.isAdmin && row.status === 'active' ? assignCardHtml(ctx, { id: 'drawer', fixedBatch: row.batchId, heading: 'Add or move a task on this day for ' + row.name, button: 'Put on ' + dayLong(k), listId: 'D' + String(row.batchId).replace(/[^\w]/g, '') }) : '') + '</div>';
      box.querySelector('[data-dp-openday]').onclick = function () { ctx.openDay(k, row.batchId); };
      wireTaskLinks(box, ctx);
      if (ctx.isAdmin) {
        wireEditors(box, ctx, all, reload, k);
        wireAssignCard(box.querySelector('[data-dp-assign="drawer"]'), ctx, async function () {
          return (byBatch[row.batchId] || []).filter(function (t) { return t.status === 'todo'; }).sort(function (a, b) { return a.ord - b.ord; });
        }, function () { return linesOf(all, row.batchId); }, k, reload);
      }
      box.scrollIntoView && box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    if (state.panel) renderPanel();
    if (state.sel) drawer();
    // Start on today's row instead of the 1st; the date column and batch header stay in view.
    var scroller = pane.querySelector('.dp-monthscroll'), todayRow = pane.querySelector('.dp-dayrow.today');
    if (scroller && todayRow) scroller.scrollTop = Math.max(0, todayRow.offsetTop - 120);
  }

  /** Drag a task to another day of its own batch. The time of day is kept. */
  function wireChartDrag(pane, ctx, all, reload) {
    pane.querySelectorAll('.dp-line[data-dp-drag]').forEach(function (el) {
      el.ondragstart = function (e) { e.stopPropagation(); startDrag(e, all[el.dataset.dpDrag]); el.classList.add('dragging'); };
      el.ondragend = function () { el.classList.remove('dragging'); endDrag(pane); };
    });
    pane.querySelectorAll('.dp-cell').forEach(function (cell) {
      cell.ondragover = function (e) {
        if (!dragging || cell.dataset.batch !== dragging.batchId) return;
        e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; cell.classList.add('drop');
      };
      cell.ondragleave = function () { cell.classList.remove('drop'); };
      cell.ondrop = async function (e) {
        if (!dragging) return;
        e.preventDefault();
        var drag = dragging, t = all[drag.id];
        endDrag(pane);
        if (!t) return;
        if (cell.dataset.batch !== drag.batchId) { showNotice(pane, ctx, 'A task can only be moved within its own batch column.', true); return; }
        var was = P.startMs(t);
        if (was == null || P.key(was) === cell.dataset.key) return;
        var next = asLocalMs(cell.dataset.key, clock(was));
        try {
          var res = await saveEdit(ctx, t, { startAt: next }, state.dragShift);
          if (ctx.current()) { state.notice = savedNotice(ctx, 'Saved “' + t.title + '”.', res); reload(); }
        } catch (err) { showNotice(pane, ctx, err.message || String(err), true); }
      };
    });
  }

  window.TK.planning = {
    mountDaily: mountDaily, mountMonthly: mountMonthly,
    /** Jump from the chart to a day (optionally one batch). */
    setDay: function (k, batchId) { state.day = k; state.batch = batchId || ''; },
    reset: function () { leaveFull(); state = { day: null, span: 1, batch: '', month: null, sel: null, panel: null, dragShift: false, notice: null, types: { work: true, rest: true, lab: true, cleaning: true } }; },
  };
})();
