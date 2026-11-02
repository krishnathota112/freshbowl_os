/* Factory Flow — platform occupancy planning, derived from the owner's own workbook.
 *
 * SOURCE: "20260217 Compost new procedure_2 (1).xlsx", sheet "New version V2 Bunker Reloa (2)". All 21 batch groups in that sheet
 * follow the SAME pattern of platform windows, counted in hours from the start of bagasse wetting (hour 1 = the first hour after
 * the batch start). A group = 3-4 batches processed together; a new group starts every 2-3 days.
 *
 * WHAT THIS IS: a PLANNING REFERENCE. Windows are placed from each batch group's recorded start; a "forecast" simply moves them later
 * by the group's current slip. It is not a measurement of who is physically on a platform. Stage names are matched from the Process
 * sheet by order and duration and should be confirmed with the owner. Platform capacities are inferred (see CAPACITY) and editable. */
(function () {
  var HOUR = 3600000;

  // [platform, first hour, last hour, label]. "Hours -2..0" are the three hours before hour 1 that the sheet marks on platform 4.
  var TEMPLATE = {
    source: '20260217 Compost new procedure_2 (1).xlsx — "New version V2 Bunker Reloa (2)"', totalHours: 544,
    windows: [
      { platform: '4',  from: -2,  to: 0,   label: 'Old bagasse preparation (before hour 1)' },
      { platform: '1A', from: 1,   to: 17,  label: 'Bagasse mix, wetting and heap rest (Stage 0A)' },
      { platform: '3',  from: 18,  to: 24,  label: 'First bunker filling (Stage 0B)' },
      { platform: '3',  from: 90,  to: 100, label: 'Unload and reload into second bunker (Stages 0C-0D)' },
      { platform: '5',  from: 137, to: 142, label: 'Chicken manure and minerals dry mix (Stage 1A)' },
      { platform: '3',  from: 159, to: 169, label: 'Conditioned bagasse and dry nitrogen mixing (Stage 1B)' },
      { platform: '5',  from: 170, to: 214, label: 'Paddy preparation, paddy and bagasse mixing (Stage 1C)' },
      { platform: '2',  from: 219, to: 252, label: 'Turner passes T0 and T1 (Phase 1A)' },
      { platform: '2',  from: 255, to: 262, label: 'Turner pass T2 (Phase 1B)' },
      { platform: '1B', from: 263, to: 265, label: 'Bunker filling after T2 (Phase 1C)' },
      { platform: '1B', from: 283, to: 289, label: 'Unload and reload 1 (Phase 1D-A)' },
      { platform: '1B', from: 318, to: 324, label: 'Unload and reload 2 (Phase 1D-B)' },
      { platform: '1B', from: 386, to: 392, label: 'Tunnel filling (Phase 2B)' }
    ]
  };
  // Capacity = the most groups the owner's own plan ever put on that platform at the same time. Platforms 1A, 2 and 4 were never
  // shared; platform 3 (the bunker area) reached three. These are inferred, not stated by him: confirm and edit.
  var CAPACITY = { '1A': 1, '1B': 2, '2': 1, '3': 3, '4': 1, '5': 2 };
  var PLATFORMS = ['1A', '1B', '2', '3', '4', '5'];

  function num(v) { if (v == null || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
  function ms(v) { var n = v ? Date.parse(v) : NaN; return isFinite(n) ? n : null; }
  function batchCount(name) { var n = String(name || '').split(',').filter(function (s) { return s.trim(); }).length; return n || 1; }

  /** Platform windows of one group, in absolute time. Hour n spans [start+(n-1)h, start+n h]. */
  function windowsFor(startMs, slipHours, template) {
    var t = template || TEMPLATE, shift = (slipHours || 0) * HOUR;
    return t.windows.map(function (w) {
      return { platform: w.platform, label: w.label, from: w.from, to: w.to, startMs: startMs + (w.from - 1) * HOUR + shift, endMs: startMs + w.to * HOUR + shift,
        plannedStartMs: startMs + (w.from - 1) * HOUR, plannedEndMs: startMs + w.to * HOUR };
    });
  }

  /** Current slip of a batch: median start-vs-suggested delay (hours, never negative) of its last three finished tasks. null = unknown. */
  function slipHours(tasks) {
    var d = (tasks || []).filter(function (t) { return (t.status === 'done') && ms(t.started_at) != null && ms(t.suggested_at) != null && ms(t.ended_at) != null; })
      .sort(function (a, b) { return ms(b.ended_at) - ms(a.ended_at); }).slice(0, 3).map(function (t) { return (ms(t.started_at) - ms(t.suggested_at)) / HOUR; })
      .sort(function (a, b) { return a - b; });
    if (!d.length) return null;
    var m = d[Math.floor((d.length - 1) / 2)];
    return Math.max(0, Math.round(m * 10) / 10);
  }

  /** Build the group list from batch rows (tk_v_batch) and their tasks. `overrides` maps group id -> slip hours chosen by the viewer. */
  function groups(batches, tasks, overrides) {
    overrides = overrides || {};
    return (batches || []).map(function (b) {
      var start = ms(b.h0); if (start == null) return null;
      var mine = (tasks || []).filter(function (t) { return t.batch_id === b.id; }), est = slipHours(mine);
      var slip = overrides[b.id] != null ? num(overrides[b.id]) : est;
      return { id: b.id, name: b.name, batches: batchCount(b.name), startMs: start, slipEstimate: est, slipOverridden: overrides[b.id] != null, slip: slip == null ? 0 : slip, slipKnown: slip != null };
    }).filter(Boolean).sort(function (a, b) { return a.startMs - b.startMs; });
  }

  function placed(gs, template) { return gs.map(function (g) { return Object.assign({}, g, { windows: windowsFor(g.startMs, g.slip, template) }); }); }

  /** Where any platform carries more groups than its capacity. Adjacent over-capacity stretches with the same set of groups are merged. */
  function conflicts(placedGroups, capacity) {
    capacity = capacity || CAPACITY; var out = [];
    PLATFORMS.forEach(function (p) {
      var ev = [];
      placedGroups.forEach(function (g) { g.windows.forEach(function (w) { if (w.platform === p) { ev.push({ t: w.startMs, d: 1, g: g }); ev.push({ t: w.endMs, d: -1, g: g }); } }); });
      ev.sort(function (a, b) { return a.t - b.t || a.d - b.d; });
      var active = [], last = null;
      ev.forEach(function (e, i) {
        if (last != null && e.t > last && active.length > (capacity[p] == null ? 1 : capacity[p])) {
          var ids = active.map(function (g) { return g.id; }).sort().join('|'), prev = out[out.length - 1];
          if (prev && prev.platform === p && prev.endMs === last && prev.key === ids) prev.endMs = e.t;
          else out.push({ platform: p, startMs: last, endMs: e.t, load: active.length, capacity: capacity[p] == null ? 1 : capacity[p], groups: active.map(function (g) { return g.name; }), key: ids });
        }
        if (e.d === 1) active.push(e.g); else active.splice(active.indexOf(e.g), 1);
        last = e.t;
      });
    });
    return out.sort(function (a, b) { return a.startMs - b.startMs || a.platform.localeCompare(b.platform); });
  }

  function peakLoad(placedGroups, platform, fromMs, toMs) {
    var ev = []; placedGroups.forEach(function (g) { g.windows.forEach(function (w) { if (w.platform === platform && w.endMs > fromMs && w.startMs < toMs) { ev.push([Math.max(w.startMs, fromMs), 1]); ev.push([Math.min(w.endMs, toMs), -1]); } }); });
    ev.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }); var n = 0, peak = 0; ev.forEach(function (e) { n += e[1]; if (n > peak) peak = n; }); return peak;
  }

  /** Over-capacity hours that adding one more group starting at startMs would create (0 = it fits). */
  function violationHours(placedGroups, capacity, startMs, template) {
    capacity = capacity || CAPACITY; var bad = 0;
    windowsFor(startMs, 0, template).forEach(function (w) {
      var cap = capacity[w.platform] == null ? 1 : capacity[w.platform];
      for (var t = w.startMs; t < w.endMs; t += HOUR) { if (peakLoad(placedGroups, w.platform, t, t + HOUR) + 1 > cap) bad++; }
    });
    return bad;
  }

  /** First hour (from `fromMs`, whole-hour steps) at which a new group fits with no platform over capacity; also the least-bad hour if none does. */
  function earliestStart(placedGroups, capacity, fromMs, horizonHours, template) {
    var h = horizonHours || 24 * 21, start = Math.ceil(fromMs / HOUR) * HOUR, best = null;
    for (var i = 0; i <= h; i++) {
      var s = start + i * HOUR, v = violationHours(placedGroups, capacity, s, template);
      if (v === 0) return { startMs: s, violationHours: 0, fits: true };
      if (!best || v < best.violationHours) best = { startMs: s, violationHours: v, fits: false };
    }
    return best;
  }

  /** Where each group is now: hour counter, current planned platform window (if any) and its next window. */
  function status(placedGroups, now) {
    return placedGroups.map(function (g) {
      var hour = (now - g.startMs) / HOUR, cur = g.windows.find(function (w) { return w.startMs <= now && now < w.endMs; }) || null;
      var next = g.windows.filter(function (w) { return w.startMs > now; }).sort(function (a, b) { return a.startMs - b.startMs; })[0] || null;
      return { id: g.id, name: g.name, hour: hour, started: hour >= 0, finished: hour > TEMPLATE.totalHours + g.slip, current: cur, next: next };
    });
  }

  window.TK = window.TK || {};
  window.TK.flowModel = { TEMPLATE: TEMPLATE, CAPACITY: CAPACITY, PLATFORMS: PLATFORMS, HOUR: HOUR, windowsFor: windowsFor, slipHours: slipHours, groups: groups, placed: placed,
    conflicts: conflicts, peakLoad: peakLoad, violationHours: violationHours, earliestStart: earliestStart, status: status, batchCount: batchCount };
})();
