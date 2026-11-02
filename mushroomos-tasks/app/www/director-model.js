/* Director brief — read-only metrics.
 * Everything here is derived from records the Manager login can already read (batches, tasks, weighment requirements).
 * Rules: missing observations stay missing (never zero, never estimated); planned, forecast and actual stay separate;
 * every threshold is named in THRESHOLDS and explained on the page, so a director can see why something is flagged. */
(function () {
  var THRESHOLDS = {
    graceStartMin: 120,          // a task is "late to start" once its suggested time is this far in the past
    overrunMin: 30,              // a running task is "over plan" once it has run this long past its planned duration
    overrunHighMin: 240,         // ...and "high" beyond this
    lateHighCount: 8,            // this many late starts in one batch is high severity
    lateHighHours: 12,           // ...as is any single task this late
    gmWaitMedHours: 4,           // a Lab gate waiting on GM this long is flagged
    gmWaitHighHours: 24,
    quietHours: 12,              // an active batch with nothing running and no activity this long is flagged (low)
    behindGapPts: 15,            // completed share this many points below the share planned by now = behind
    watchGapPts: 5
  };

  function ms(v) { var n = v ? Date.parse(v) : NaN; return isFinite(n) ? n : null; }
  function num(v) { if (v == null || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
  function completed(t) { return t.status === 'done' || t.status === 'done_before'; }
  function stage(t) {
    var words = [t.report_section, t.title, t.line].join(' ').toLowerCase();
    if (/tunnel|grow.room/.test(words)) return 'Tunnel & discharge';
    if (/bunker|conditioning/.test(words)) return 'Bunker & conditioning';
    if (/turner|\bt[0-3]\b/.test(words)) return 'Turner';
    if (/paddy|soak|lagoon/.test(words)) return 'Paddy';
    if (/bagasse|hopper|heap/.test(words)) return 'Bagasse';
    if (/mix|manure|rotavator|flip/.test(words)) return 'Mixing';
    return 'Other';
  }
  function percentile(values, p) {
    if (!values.length) return null;
    var a = values.slice().sort(function (x, y) { return x - y; }), i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return a[lo] + (a[hi] - a[lo]) * (i - lo);
  }
  function istDay(t) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t)); }
  var SEV = { high: 3, medium: 2, low: 1 };
  var HOUR = 3600000, MIN = 60000;

  function model(input) {
    input = input || {};
    var now = num(input.now) || Date.now(), since = num(input.since) || now - 7 * 86400000;
    var batches = input.batches || [], tasks = input.tasks || [], finished = input.finished || [], reqs = input.requirements || [];
    var plan = typeof input.convergence === 'function' ? input.convergence : null;
    var exceptions = [], T = THRESHOLDS;
    function raise(severity, kind, batch, headline, detail, sinceAt) {
      exceptions.push({ severity: severity, kind: kind, batchId: batch ? batch.id : null, batchName: batch ? batch.name : '', headline: headline, detail: detail || '', sinceAt: sinceAt == null ? null : sinceAt,
        rank: SEV[severity] * 1e13 + (sinceAt == null ? 0 : Math.max(0, now - sinceAt)) });
    }

    // ── per-batch health ─────────────────────────────────────────────────────────────────────────────────────
    var rows = batches.map(function (b) {
      var list = tasks.filter(function (t) { return t.batch_id === b.id; }).sort(function (a, c) { return (a.ord || 0) - (c.ord || 0); });
      var total = list.length, done = list.filter(completed).length;
      var running = list.filter(function (t) { return t.status === 'running'; });
      var waiting = list.filter(function (t) { return t.status === 'submitted'; });
      var returned = list.filter(function (t) { return t.status === 'returned'; });
      var due = list.filter(function (t) { var s = ms(t.suggested_at); return s != null && s <= now; });
      var lateStarts = list.filter(function (t) { var s = ms(t.suggested_at); return t.status === 'todo' && s != null && s < now - T.graceStartMin * MIN; })
        .sort(function (a, c) { return ms(a.suggested_at) - ms(c.suggested_at); });
      var overruns = running.map(function (t) {
        var st = ms(t.started_at), pl = num(t.planned_duration_minutes);
        return st != null && pl != null ? { task: t, overMin: (now - st) / MIN - pl } : null;
      }).filter(function (o) { return o && o.overMin > T.overrunMin; }).sort(function (a, c) { return c.overMin - a.overMin; });
      var next = list.filter(function (t) { return t.status === 'todo'; }).sort(function (a, c) { return (ms(a.suggested_at) == null ? Infinity : ms(a.suggested_at)) - (ms(c.suggested_at) == null ? Infinity : ms(c.suggested_at)) || (a.ord || 0) - (c.ord || 0); })[0] || null;
      var last = 0; list.forEach(function (t) { last = Math.max(last, ms(t.started_at) || 0, ms(t.ended_at) || 0); });
      var actualPct = total ? 100 * done / total : null, expectedPct = total && due.length ? 100 * due.length / total : (total ? 0 : null);
      var gap = actualPct == null ? null : actualPct - expectedPct;
      var conv = null;
      if (plan) { try { var r = plan(list, null, ms(b.h0), now); conv = r ? { state: r.state, shortfallMs: r.shortfallMs == null ? null : r.shortfallMs, uncertain: !!r.uncertain, cause: r.cause || '' } : null; } catch (e) { conv = { state: 'unknown', shortfallMs: null, uncertain: true, cause: '' }; } }
      var status = !total ? 'unknown'
        : (gap <= -T.behindGapPts || lateStarts.length >= T.lateHighCount || (conv && conv.state === 'miss')) ? 'behind'
        : (gap <= -T.watchGapPts || lateStarts.length || overruns.length || waiting.length || returned.length) ? 'watch' : 'on_track';

      if (conv && conv.state === 'miss')
        raise('high', 'convergence', b, 'Paddy forecast misses the second convergence', (conv.uncertain ? 'At least ' : '') + 'about ' + Math.round(Math.abs(conv.shortfallMs || 0) / HOUR * 10) / 10 + ' h short' + (conv.cause ? ' — ' + conv.cause : '') + '.', null);
      if (lateStarts.length) {
        var oldest = lateStarts[0], lateH = (now - ms(oldest.suggested_at)) / HOUR;
        raise(lateStarts.length >= T.lateHighCount || lateH >= T.lateHighHours ? 'high' : 'medium', 'late_start', b,
          lateStarts.length + (lateStarts.length === 1 ? ' task is' : ' tasks are') + ' past the suggested start',
          'Longest wait: “' + oldest.title + '” (' + oldest.line + '), ' + Math.round(lateH * 10) / 10 + ' h after its suggested time.', ms(oldest.suggested_at));
      }
      overruns.forEach(function (o) {
        raise(o.overMin >= T.overrunHighMin ? 'high' : 'medium', 'overrun', b, '“' + o.task.title + '” is running over plan',
          Math.round(o.overMin / 6) / 10 + ' h beyond its planned ' + Math.round(num(o.task.planned_duration_minutes) / 6) / 10 + ' h (' + o.task.line + ').', ms(o.task.started_at));
      });
      waiting.forEach(function (t) {
        var since2 = ms(t.ended_at), h = since2 == null ? null : (now - since2) / HOUR;
        if (h == null || h >= T.gmWaitMedHours) raise(h != null && h >= T.gmWaitHighHours ? 'high' : 'medium', 'gm_wait', b, '“' + t.title + '” is waiting for GM approval',
          h == null ? 'Submission time not recorded.' : 'Submitted ' + Math.round(h * 10) / 10 + ' h ago.', since2);
      });
      returned.forEach(function (t) { raise('medium', 'returned', b, '“' + t.title + '” was returned to Lab', 'Needs a new Lab submission.', ms(t.ended_at)); });
      if (total && !running.length && last && now - last >= T.quietHours * HOUR)
        raise('low', 'quiet', b, 'Nothing running and no activity recorded', 'Last recorded activity ' + Math.round((now - last) / HOUR * 10) / 10 + ' h ago.', last);

      return { batch: b, id: b.id, name: b.name, total: total, done: done, running: running.length, waitingGm: waiting.length, returned: returned.length,
        due: due.length, lateStarts: lateStarts.length, overruns: overruns.length, actualPct: actualPct, expectedPct: expectedPct, gapPts: gap,
        convergence: conv, next: next ? { title: next.title, at: ms(next.suggested_at), line: next.line } : null, lastActivityAt: last || null, status: status };
    });

    // ── throughput and schedule adherence (finished work in the selected period) ──────────────────────────────
    var inPeriod = finished.filter(function (t) { var e = ms(t.ended_at); return e != null && e >= since && e <= now; });
    var real = inPeriod.filter(function (t) { return t.status === 'done'; });            // "done before the app" is catch-up, not work
    var days = [], seen = {};
    for (var d = since; d <= now + 86400000 - 1; d += 86400000) { var key = istDay(Math.min(d, now)); if (!seen[key]) { seen[key] = days.length; days.push({ date: key, done: 0 }); } }
    real.forEach(function (t) { var k = istDay(ms(t.ended_at)); if (seen[k] != null) days[seen[k]].done++; });
    var delays = [], stageMap = {}, overrunMinTotal = 0, measured = 0, missingTimes = 0;
    real.forEach(function (t) {
      var st = ms(t.started_at), en = ms(t.ended_at), sg = ms(t.suggested_at), pl = num(t.planned_duration_minutes), s = stage(t);
      var g = stageMap[s] || (stageMap[s] = { stage: s, n: 0, delays: [], overrunMin: 0, overrunTasks: 0, plannedKnown: 0 });
      if (st == null || en == null || en < st) { missingTimes++; return; }
      measured++; g.n++;
      if (sg != null) { var dl = (st - sg) / MIN; delays.push(dl); g.delays.push(dl); }
      if (pl != null) { g.plannedKnown++; var over = (en - st) / MIN - pl; if (over > T.overrunMin) { g.overrunMin += over; g.overrunTasks++; overrunMinTotal += over; } }
    });
    var stages = Object.keys(stageMap).map(function (k) { var g = stageMap[k];
      return { stage: g.stage, n: g.n, medianDelayMin: percentile(g.delays, .5), delayCount: g.delays.length, overrunHours: g.overrunMin / 60, overrunTasks: g.overrunTasks, plannedKnown: g.plannedKnown }; })
      .sort(function (a, c) { return c.overrunHours - a.overrunHours || a.stage.localeCompare(c.stage); });

    // ── materials (weighment requirements of active batches) ──────────────────────────────────────────────────
    var materials = reqs.filter(function (r) { return !r.batch_status || r.batch_status === 'active'; }).map(function (r) {
      var required = num(r.required_kg), received = num(r.received_kg), tol = num(r.tolerance_kg);
      var atRisk = r.state === 'over' || r.state === 'short' || Number(r.open_alerts) > 0;
      return { id: r.id, batchName: r.batch_name || '', material: r.material_name || r.material_code || '', required: required, received: received, remaining: num(r.remaining_kg), tolerance: tol,
        pct: required > 0 && received != null ? 100 * received / required : null, state: r.state || 'receiving', openAlerts: Number(r.open_alerts) || 0, unit: r.weight_unit === 'kg' ? 'kg' : 't', atRisk: atRisk, finished: !!r.finished_at, sort: num(r.sort) };
    }).sort(function (a, c) { return a.batchName.localeCompare(c.batchName) || (a.sort == null ? 99 : a.sort) - (c.sort == null ? 99 : c.sort) || a.material.localeCompare(c.material); });
    function qty(kg, unit) { return unit === 't' ? Math.round(kg / 100) / 10 + ' t' : Math.round(kg) + ' kg'; }
    materials.forEach(function (m) {
      var b = { id: null, name: m.batchName };
      if (m.state === 'over') raise('high', 'material_over', b, m.material + ' received above the requirement', 'Received ' + qty(m.received, m.unit) + ' against ' + qty(m.required, m.unit) + '.', null);
      else if (m.state === 'short') raise('high', 'material_short', b, m.material + ' was closed short', 'Received ' + qty(m.received, m.unit) + ' against ' + qty(m.required, m.unit) + '.', null);
      else if (m.openAlerts > 0) raise('medium', 'material_alert', b, m.material + ' has ' + m.openAlerts + ' open alert' + (m.openAlerts === 1 ? '' : 's'), 'Raised on the weighbridge; not yet acknowledged.', null);
    });

    exceptions.sort(function (a, c) { return c.rank - a.rank; });
    var count = { high: 0, medium: 0, low: 0 }; exceptions.forEach(function (e) { count[e.severity]++; });
    return {
      generatedAt: now, since: since, thresholds: THRESHOLDS, batches: rows, exceptions: exceptions, attention: count,
      throughput: { days: days, total: real.length, doneBeforeExcluded: inPeriod.length - real.length, perDay: days.length ? real.length / days.length : null },
      timing: { startDelayMedianMin: percentile(delays, .5), startDelayP90Min: percentile(delays, .9), startDelayCount: delays.length, overrunHours: overrunMinTotal / 60, measured: measured, missingTimes: missingTimes, stages: stages },
      materials: materials,
      summary: { batches: rows.length, onTrack: rows.filter(function (r) { return r.status === 'on_track'; }).length, behind: rows.filter(function (r) { return r.status === 'behind'; }).length,
        completedInPeriod: real.length, materialsAtRisk: materials.filter(function (m) { return m.atRisk; }).length, running: rows.reduce(function (n, r) { return n + r.running; }, 0) }
    };
  }

  function csv(rows) {
    return '﻿' + rows.map(function (row) { return row.map(function (value) {
      if (typeof value === 'number' && isFinite(value)) return String(value);
      var s = String(value == null ? '' : value);
      if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    }).join(','); }).join('\r\n') + '\r\n';
  }

  window.TK = window.TK || {};
  window.TK.directorModel = { model: model, csv: csv, stage: stage, percentile: percentile, THRESHOLDS: THRESHOLDS };
})();
