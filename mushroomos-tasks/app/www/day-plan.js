/**
 * Daily task sheet and monthly task chart — the pure part (no DOM, no network).
 * Planned times come from each task's suggested_at / planned_duration_minutes, exactly as the batch plan stores them.
 * Nothing here records or changes actual work. Moving a task to another day reuses the batch plan editor's own rules
 * (plan-scheduler.js) and its guarded save (tk_batch_plan_save), so recorded rows stay protected.
 */
(function () {
  window.TK = window.TK || {};
  var DAY = 86400000, HOUR = 3600000;
  var DEFAULT_MINUTES = 60;                 // only for drawing a bar when no duration was set; never stored

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(k) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k || '');
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null;
  }
  function addDays(k, n) { var d = parse(k); d.setDate(d.getDate() + n); return key(d); }
  function dayWindow(k) { var s = parse(k), e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1); return { start: s, end: e }; }
  function monthKey(d) { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function parseMonth(ym) {
    var m = /^(\d{4})-(\d{2})$/.exec(ym || '');
    if (!m || +m[2] < 1 || +m[2] > 12) return null;
    return new Date(+m[1], +m[2] - 1, 1);
  }
  function addMonths(ym, n) { var d = parseMonth(ym); d.setMonth(d.getMonth() + n); return monthKey(d); }
  function monthWindow(ym) { var s = parseMonth(ym); return { start: s, end: new Date(s.getFullYear(), s.getMonth() + 1, 1) }; }
  function monthDays(ym, todayKey) {
    var w = monthWindow(ym), out = [];
    for (var d = new Date(w.start); d < w.end; d.setDate(d.getDate() + 1)) {
      out.push({ key: key(d), day: d.getDate(), dow: d.getDay(), weekend: d.getDay() === 0 || d.getDay() === 6, today: key(d) === todayKey });
    }
    return out;
  }

  function startMs(t) { return t.suggested_at ? Date.parse(t.suggested_at) : null; }
  function endMs(t) {
    var s = startMs(t);
    return s != null && Number.isInteger(t.planned_duration_minutes) ? s + t.planned_duration_minutes * 60000 : null;
  }
  function isDone(t) { return t.status === 'done' || t.status === 'done_before'; }

  /** done · running · waiting (Lab sent, GM to decide) · behind (planned time passed, not started) · planned */
  function state(t, now) {
    if (isDone(t)) return 'done';
    if (t.status === 'running') return 'running';
    if (t.status === 'submitted') return 'waiting';
    var s = startMs(t);
    if ((t.status === 'todo' || t.status === 'returned') && s != null && s < now) return 'behind';
    return 'planned';
  }
  var RANK = { behind: 4, running: 3, waiting: 2, planned: 1, done: 0 };
  /** One colour for a cell that holds several tasks: the one needing most attention wins; all done → done. */
  function worst(states) {
    var best = 'done';
    states.forEach(function (s) { if (RANK[s] > RANK[best]) best = s; });
    return states.length ? best : null;
  }

  function byTime(a, b) { return (startMs(a) || 0) - (startMs(b) || 0) || (a.ord || 0) - (b.ord || 0); }

  /** Tasks grouped per batch, batches in order of their first planned task. */
  function groupByBatch(tasks) {
    var map = {}, order = [];
    tasks.forEach(function (t) {
      if (!map[t.batch_id]) { map[t.batch_id] = { batchId: t.batch_id, name: t.batch_name, status: t.batch_status, tasks: [] }; order.push(map[t.batch_id]); }
      map[t.batch_id].tasks.push(t);
    });
    order.forEach(function (g) { g.tasks.sort(byTime); });
    order.sort(function (a, b) { return byTime(a.tasks[0], b.tasks[0]); });
    return order;
  }

  /** Open work in an active batch that is not on the selected day: planned earlier (carried over) or without a date. */
  function carriedOver(openTasks, dayStart) {
    return openTasks.filter(function (t) { var s = startMs(t); return s != null && s < dayStart.getTime() && !isDone(t); }).sort(byTime);
  }
  function unscheduled(openTasks) {
    return openTasks.filter(function (t) { return !t.suggested_at && t.status === 'todo' && t.batch_status === 'active'; })
      .sort(function (a, b) { return String(a.batch_name).localeCompare(String(b.batch_name)) || a.ord - b.ord; });
  }

  /**
   * The hour-by-hour board (the owner's "Status" grid): hours down, batches across, one block per task.
   * A task that has been started is placed where it was actually done (start → finish, or → now while running);
   * every other task is placed at its planned start for its planned duration and flagged `actual: false`.
   * Blocks snap to whole hours like the spreadsheet. Parallel tasks of one batch get their own lane (sub-column).
   */
  function board(tasks, startKey, days, now) {
    var from = parse(startKey).getTime(), rows = days * 24, to = from + rows * HOUR, byBatch = {}, order = [];
    tasks.forEach(function (t) {
      var actual = !!t.started_at, s = actual ? Date.parse(t.started_at) : startMs(t), e;
      if (s == null || !Number.isFinite(s)) return;
      if (actual) e = t.ended_at ? Date.parse(t.ended_at) : Math.max(now, s);
      else { e = endMs(t); if (e == null) e = s + DEFAULT_MINUTES * 60000; }
      if (e <= s) e = s + 15 * 60000;
      if (e <= from || s >= to) return;
      var rowStart = Math.floor((Math.max(s, from) - from) / HOUR), rowEnd = Math.ceil((Math.min(e, to) - from) / HOUR);
      if (rowEnd <= rowStart) rowEnd = rowStart + 1;
      var g = byBatch[t.batch_id] || (byBatch[t.batch_id] = { batchId: t.batch_id, name: t.batch_name, status: t.batch_status, items: [], lanes: 1, first: s });
      if (g.items.length === 0) order.push(g);
      g.first = Math.min(g.first, s);
      g.items.push({ task: t, s: s, e: e, actual: actual, exact: actual || endMs(t) != null, rowStart: rowStart, rowEnd: rowEnd, cutBefore: s < from, cutAfter: e > to, state: state(t, now), tone: tone(t, now) });
    });
    order.forEach(function (g) {
      var lanes = [];
      g.items.sort(function (a, b) { return a.rowStart - b.rowStart || a.rowEnd - b.rowEnd || byTime(a.task, b.task); });
      g.items.forEach(function (it) {
        var lane = 0;
        while (lanes[lane] != null && lanes[lane] > it.rowStart) lane++;
        lanes[lane] = it.rowEnd; it.lane = lane;
      });
      g.lanes = Math.max(1, lanes.length);
    });
    order.sort(function (a, b) { return a.first - b.first; });
    var hours = [];
    for (var r = 0; r < rows; r++) {
      var at = new Date(from + r * HOUR), h = at.getHours();
      hours.push({ row: r, key: key(at), hour: h, label: two(h) + ' - ' + two((h + 1) % 24 === 0 ? 24 : h + 1), dayStart: h === 0 });
    }
    var nowRow = now >= from && now < to ? (now - from) / HOUR : null;
    return { batches: order, hours: hours, rows: rows, nowRow: nowRow };
  }
  function two(n) { return pad(n); }

  /**
   * The month chart: a row for every active batch (and any batch with tasks planned that month), a column per day.
   * cell = tasks of that batch planned on that day, with the counts the colour and the badge need.
   */
  function monthMatrix(tasks, batches, ym, now) {
    var days = monthDays(ym, key(now)), rows = {}, order = [];
    function row(id, name, status, h0) {
      if (!rows[id]) { rows[id] = { batchId: id, name: name, status: status, h0: h0 || null, cells: {}, total: 0, first: null }; order.push(rows[id]); }
      return rows[id];
    }
    batches.forEach(function (b) { if (b.status === 'active') row(b.id, b.name, b.status, b.h0); });
    var from = monthWindow(ym).start.getTime(), to = monthWindow(ym).end.getTime(), nowMs = now.getTime ? now.getTime() : now;
    tasks.forEach(function (t) {
      var s = startMs(t);
      if (s == null) return;
      var e = endMs(t), last = e != null && e > s ? e - 1 : s;       // last millisecond the task covers
      if (last < from || s >= to) return;
      var r = row(t.batch_id, t.batch_name, t.batch_status, t.h0);
      if (s >= from) { r.total++; if (r.first == null || s < r.first) r.first = s; }
      // A stage that runs for days (a rest, a bunker fill) shows on every day it covers, as the owner's schedule does.
      var firstKey = key(Math.max(s, from)), lastKey = key(Math.min(last, to - 1)), startKey = key(s), k = firstKey;
      for (var guard = 0; guard < 62; guard++) {
        var c = r.cells[k] || (r.cells[k] = { key: k, tasks: [], states: [], cont: {} });
        c.tasks.push(t); c.states.push(state(t, nowMs)); c.cont[t.id] = k !== startKey;
        if (k >= lastKey) break;
        k = addDays(k, 1);
      }
    });
    order.forEach(function (r) {
      Object.keys(r.cells).forEach(function (k) { var c = r.cells[k]; c.state = worst(c.states); c.done = c.states.filter(function (s) { return s === 'done'; }).length; c.tasks.sort(function (a, b) { return (c.cont[a.id] ? 0 : 1) - (c.cont[b.id] ? 0 : 1) || byTime(a, b); }); });
    });
    order.sort(function (a, b) {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      var ah = a.h0 ? Date.parse(a.h0) : (a.first || 0), bh = b.h0 ? Date.parse(b.h0) : (b.first || 0);
      return ah - bh || String(a.name).localeCompare(String(b.name));
    });
    return { days: days, rows: order };
  }

  // ── editing the plan ────────────────────────────────────────────────────────────────────────────────────────
  /** What the owner calls the task types. `work` is "Process". Lab gates keep their own approval flow and are not switchable here. */
  var KIND_LABEL = { work: 'Process', rest: 'Rest', lab: 'Lab', cleaning: 'Cleaning', lab_gate: 'Lab gate' };
  var SWITCHABLE = ['work', 'rest', 'cleaning', 'lab'];
  var MODES = ['fixed', 'stream', 'batch'];

  /** How a cell/block is coloured (the owner's rule): orange = a task, white = rest, red = missed. */
  function tone(t, now) { return state(t, now) === 'behind' ? 'missed' : t.kind === 'rest' ? 'rest' : 'task'; }

  function photosFor(kind) { return kind === 'work' || kind === 'cleaning' ? 'both' : 'none'; }   // the batch editor's defaults
  /** Plan rows with their start as minutes after the batch start, the form plan-scheduler.js works in. */
  function prepare(plan) {
    var h0 = Date.parse(plan.batch.h0), hadStart = {};
    var rows = plan.rows.map(function (t) {
      hadStart[t.id] = !!t.suggested_at;
      return Object.assign({}, t, { suggested_offset_minutes: t.suggested_at ? (Date.parse(t.suggested_at) - h0) / 60000 : null });
    });
    return { h0: h0, rows: rows, hadStart: hadStart };
  }
  function openBatch(plan) { if (plan.batch.status !== 'active') throw new Error('This batch is closed. Its records are read-only.'); }
  /** Turn working rows back into what tk_batch_plan_save takes. Untouched rows keep their exact stored timestamp (seconds included). */
  function finish(plan, p, exceptId) {
    var lost = p.rows.filter(function (r) { return r.id && p.hadStart[r.id] && r.suggested_offset_minutes == null; });
    if (lost.length) throw new Error('This change would leave ' + lost.length + ' linked task(s) without a start time. Open Edit batch · rows to reschedule them together.');
    var originals = {}, alsoMoved = 0;
    plan.rows.forEach(function (t) { originals[t.id] = t; });
    var out = p.rows.map(function (r) {
      var original = r.id ? originals[r.id] : null, at = r.suggested_offset_minutes == null ? null : new Date(p.h0 + r.suggested_offset_minutes * 60000).toISOString();
      if (original && (r._locked || at === null && original.suggested_at == null ||
          original.suggested_at && Math.round((Date.parse(original.suggested_at) - p.h0) / 60000) === r.suggested_offset_minutes)) at = original.suggested_at || null;
      if (original && r.id !== exceptId && (original.suggested_at || null) !== at) alsoMoved++;
      return Object.assign({}, r, { suggested_at: at });
    });
    return { rows: out, alsoMoved: alsoMoved };
  }

  /**
   * Build the full row list for tk_batch_plan_save with one unstarted task changed or removed.
   *   changes = any of { startAt (ms|ISO), title, kind, line, description, scheduleMode ('fixed'|'stream'|'batch'), gap (minutes),
   *                      minutes (planned duration, whole minutes or null), remove (true) }
   *   shift   = also move the later fixed-time tasks of the same stream by the same amount (the batch editor's default scope)
   * Linked tasks follow automatically (plan-scheduler). Throws, without changing anything, when the change is not allowed
   * or would leave a linked task without a start time.
   */
  function edit(plan, taskId, changes, shift, scheduler) {
    openBatch(plan);
    var p = prepare(plan), rows = p.rows, index = -1;
    rows.forEach(function (r, i) { if (r.id === taskId) index = i; });
    if (index < 0) throw new Error('That task is no longer in this batch plan. Refresh and try again.');
    var row = rows[index];
    if (row._locked) throw new Error('This task already has recorded work, so it cannot be changed.');
    if (changes.remove) {
      rows.splice(index, 1);
      scheduler.recalculate(rows);
      return finish(plan, p, taskId);
    }
    var before = Object.assign({}, row);
    var moveStart = changes.startAt !== undefined, target = typeof changes.startAt === 'number' ? changes.startAt : Date.parse(changes.startAt);
    if (moveStart && !Number.isFinite(target)) throw new Error('Choose a date and time.');
    if (changes.title !== undefined) {
      var title = String(changes.title).trim();
      if (!title) throw new Error('Give the task a name.');
      if (title.length > 200) throw new Error('Shorten the task name to 200 characters.');
      row.title = title;
    }
    if (changes.kind !== undefined && changes.kind !== row.kind) {
      if (SWITCHABLE.indexOf(changes.kind) < 0 || SWITCHABLE.indexOf(row.kind) < 0) throw new Error('A Lab gate keeps its own approval step and cannot be switched here. Use Edit batch · rows.');
      row.kind = changes.kind;
      if (row.kind === 'work' || row.kind === 'cleaning') { if (row.photos === 'none') row.photos = 'both'; } else row.photos = 'none';
    }
    if (changes.line !== undefined) {
      var line = String(changes.line).trim() || 'Main';
      if (line.length > 100) throw new Error('Shorten the stream name to 100 characters.');
      if (row.pile && line !== row.line) throw new Error('A Turner pile task stays on its pile. Use Edit batch · rows to change it.');
      row.line = line;
    }
    if (changes.description !== undefined) row.description = String(changes.description).trim() || null;
    if (changes.scheduleMode !== undefined) {
      if (MODES.indexOf(changes.scheduleMode) < 0) throw new Error('Choose how this task is timed.');
      row.schedule_mode = changes.scheduleMode;
    }
    if (changes.gap !== undefined) {
      if (!Number.isInteger(changes.gap) || Math.abs(changes.gap) > 525600) throw new Error('The extra wait must be whole minutes within one year.');
      row.schedule_gap_minutes = changes.gap;
    }
    var durationChanged = false;
    if (changes.minutes !== undefined) {
      var m = changes.minutes;
      if (m !== null && (!Number.isInteger(m) || m < 0 || m > 525600)) throw new Error('Enter the duration as whole hours and 0–59 minutes, or leave it blank.');
      durationChanged = m !== row.planned_duration_minutes;
      row.planned_duration_minutes = m;
    }
    if (moveStart) row.suggested_offset_minutes = Math.round((target - p.h0) / 60000);
    if (shift && (moveStart || durationChanged)) scheduler.edit(rows, index, before, 'stream');
    else {
      if (moveStart) { row.schedule_mode = 'fixed'; row.schedule_gap_minutes = 0; }
      scheduler.recalculate(rows);
    }
    return finish(plan, p, taskId);
  }
  /** Move one task to a new planned start (kept for the Assign controls). */
  function assign(plan, taskId, startAt, shift, scheduler) { return edit(plan, taskId, { startAt: startAt }, shift, scheduler); }

  /**
   * Add a new task to the end of the plan (the batch editor's own rule: new process tasks go after recorded work).
   *   spec = { title, kind, line, description, startAt (ms|ISO), minutes }
   */
  function addTask(plan, spec, scheduler) {
    openBatch(plan);
    var p = prepare(plan), title = String(spec.title || '').trim(), kind = spec.kind || 'work', at = typeof spec.startAt === 'number' ? spec.startAt : Date.parse(spec.startAt);
    if (!title) throw new Error('Give the new task a name.');
    if (title.length > 200) throw new Error('Shorten the task name to 200 characters.');
    if (SWITCHABLE.indexOf(kind) < 0) throw new Error('Choose Process, Rest, Lab or Cleaning.');
    if (!Number.isFinite(at)) throw new Error('Choose a date and time.');
    var minutes = spec.minutes === undefined ? null : spec.minutes;
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 0 || minutes > 525600)) throw new Error('Enter the duration as whole hours and 0–59 minutes, or leave it blank.');
    var line = String(spec.line || '').trim() || (kind === 'cleaning' ? 'Cleaning' : 'Main');
    if (line.length > 100) throw new Error('Shorten the stream name to 100 characters.');
    p.rows.push({ id: null, ord: p.rows.length + 1, line: line, h_ref: null, title: title, kind: kind, control: null, lab_checkpoint: null,
      photos: photosFor(kind), ask: 'none', description: String(spec.description || '').trim() || null, pile: null, turner_pass: null,
      suggested_offset_minutes: Math.round((at - p.h0) / 60000), planned_duration_minutes: minutes, report_section: null,
      schedule_mode: 'fixed', schedule_gap_minutes: 0, _locked: false });
    scheduler.recalculate(p.rows);
    return finish(plan, p, null);
  }

  /** The first unstarted task's planned start — "batch start" for a batch that has not begun. */
  function anchor(tasks) {
    var started = tasks.some(function (t) { return t.status !== 'todo'; }), best = null, count = 0;
    tasks.forEach(function (t) { var s = startMs(t); if (t.status === 'todo' && s != null) { count++; if (best == null || s < best) best = s; } });
    return { ms: best, started: started, movable: count };
  }
  /**
   * Move the whole batch: every unstarted task that has a planned time moves by the same amount, so the first one lands on
   * `newStart`. This is what changing the batch start does when a batch is created — all the tasks below it fill down together.
   * Recorded tasks never move.
   */
  function shiftBatch(plan, newStart, scheduler) {
    openBatch(plan);
    var p = prepare(plan), first = null;
    p.rows.forEach(function (r) { if (!r._locked && r.suggested_offset_minutes != null && (first == null || r.suggested_offset_minutes < first)) first = r.suggested_offset_minutes; });
    if (first == null) throw new Error('No unstarted task has a planned time to move.');
    var at = typeof newStart === 'number' ? newStart : Date.parse(newStart);
    if (!Number.isFinite(at)) throw new Error('Choose a date and time.');
    var delta = Math.round((at - p.h0) / 60000) - first;
    if (delta !== 0) p.rows.forEach(function (r) { if (!r._locked && r.suggested_offset_minutes != null) r.suggested_offset_minutes += delta; });
    var res = finish(plan, p, null);
    res.delta = delta * 60000;
    return res;
  }
  /** Set the planned start of specific rows (used to apply the Paddy planner's suggested starts or its target). Recorded rows are skipped. */
  function restart(plan, updates, scheduler) {
    openBatch(plan);
    var p = prepare(plan), applied = 0;
    (updates || []).forEach(function (u) {
      var r = p.rows[u.index];
      if (!r || r._locked || !Number.isFinite(u.start)) return;
      r.suggested_offset_minutes = Math.round((u.start - p.h0) / 60000); r.schedule_mode = 'fixed'; r.schedule_gap_minutes = 0; applied++;
    });
    if (!applied) throw new Error('Nothing could be changed — those tasks already have recorded work.');
    scheduler.recalculate(p.rows);
    var res = finish(plan, p, null);
    res.applied = applied;
    return res;
  }

  window.TK.dayPlan = {
    key: key, parse: parse, addDays: addDays, dayWindow: dayWindow,
    monthKey: monthKey, parseMonth: parseMonth, addMonths: addMonths, monthWindow: monthWindow, monthDays: monthDays,
    startMs: startMs, endMs: endMs, state: state, worst: worst, groupByBatch: groupByBatch,
    carriedOver: carriedOver, unscheduled: unscheduled, board: board, monthMatrix: monthMatrix, assign: assign, edit: edit, tone: tone, addTask: addTask, shiftBatch: shiftBatch, restart: restart, anchor: anchor, KIND_LABEL: KIND_LABEL,
  };
})();
