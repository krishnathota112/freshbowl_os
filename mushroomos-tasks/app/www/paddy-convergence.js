/* Advisory only. Never changes actual work, task gates, or saved plans. */
(function () {
  function time(value) { var n = Date.parse(value || ''); return Number.isFinite(n) ? n : null; }
  function start(row, base) {
    if (Object.prototype.hasOwnProperty.call(row,'suggested_offset_minutes'))
      return Number.isFinite(row.suggested_offset_minutes) && base != null ? base + row.suggested_offset_minutes * 60000 : null;
    return row.suggested_at ? time(row.suggested_at) : null;
  }
  function label(row) { return String(row.title || '').trim(); }
  function stage(row) {
    if (row.kind === 'lab' || row.kind === 'lab_gate' || !/paddy/i.test(row.line || '')) return null;
    if (/\b(prepar|weighment)\w*/i.test(label(row)) && !/\blab\b/i.test(label(row))) return 0;
    var match = /\bsoak(?:ing)?\s*(?:stage\s*)?([1-9])\b/i.exec(label(row));
    return match ? +match[1] : null;
  }
  function identify(rows) {
    var target = rows.findIndex(function (r) { return r.kind !== 'lab' && r.kind !== 'lab_gate' && /\bsecond convergence\b/i.test(label(r)); });
    var candidates = rows.map(function (r, i) { return { row:r, index:i, stage:stage(r) }; }).filter(function (x) { return x.stage !== null; });
    var problems = [], stages = [];
    if (target < 0) problems.push('Add or name the intended “Second convergence” process row.');
    if (!candidates.some(function (x) { return x.stage === 0; })) problems.push('Identify a Paddy preparation process row.');
    var soaks = candidates.filter(function (x) { return x.stage > 0; });
    var count = soaks.length ? Math.max.apply(null, soaks.map(function (x) { return x.stage; })) : 0;
    if (count !== 2 && count !== 3) problems.push('This planner needs a two- or three-soak Paddy route; name the required soak rows “Paddy soak 1”, “Paddy soak 2” and, if used, “Paddy soak 3”.');
    for (var n=0; n<=count && n<=3; n++) {
      var matches = candidates.filter(function (x) { return x.stage === n; });
      if (matches.length !== 1) problems.push((n ? 'Paddy soak '+n : 'Paddy preparation') + ' must have exactly one process row.');
      else stages.push(matches[0]);
    }
    return { target:target, stages:stages, problems:problems };
  }
  function rules(rows, base) {
    var found = identify(rows), problems = found.problems.slice(), at = found.stages.map(function (x) { return start(x.row, base); });
    var target = found.target < 0 ? null : start(rows[found.target], base);
    if (found.target >= 0 && target == null) problems.push('Set the Second convergence target date and time.');
    found.stages.forEach(function (x, i) {
      if (at[i] == null) problems.push('Set the suggested start of '+label(x.row)+'.');
      if (!Number.isInteger(x.row.planned_duration_minutes) || x.row.planned_duration_minutes < 0)
        problems.push('Set the planned duration of '+label(x.row)+' in Admin timing setup.');
    });
    var waits = [];
    if (!problems.length) {
      found.stages.forEach(function (x, i) {
        var next = i+1 < at.length ? at[i+1] : target;
        var gap = (next-at[i])/60000 - x.row.planned_duration_minutes;
        if (gap < 0) problems.push(label(x.row)+' overlaps the next Paddy milestone or convergence. Review its date and duration.');
        waits.push(gap);
      });
    }
    return { found:found, problems:problems, waits:waits, target:target };
  }
  function plan(rows, reference, base, now) {
    var model = rules(reference || rows, base), current = identify(rows), target = current.target < 0 ? null : start(rows[current.target], base);
    var problems = model.problems.slice();
    if (current.problems.length) problems = problems.concat(current.problems);
    if (target == null) problems.push('Set the intended Second convergence date and time.');
    if (model.found.stages.length !== current.stages.length) problems.push('The Paddy route changed; save or reload its timing rules.');
    if (problems.length) {
      var referenceStarts = model.found.stages.map(function (x) { return start(x.row, base); });
      var illustrative = target != null && model.target != null && referenceStarts.every(function (n) { return n != null; }) ?
        model.found.stages.map(function (x, i) { return { index:current.stages[i] && current.stages[i].index,
          title:label(x.row), start:referenceStarts[i]+target-model.target }; }) : [];
      return { state:'unknown', problems:Array.from(new Set(problems)), target:target, targetIndex:current.target,
        targetLocked:current.target>=0 && !!rows[current.target]._locked, suggested:illustrative };
    }
    var stages = current.stages, waits = model.waits, suggested = [], cursor = target;
    for (var i=stages.length-1;i>=0;i--) {
      var duration = stages[i].row.planned_duration_minutes;
      if (!Number.isInteger(duration) || duration < 0) problems.push('Set the planned duration of '+label(stages[i].row)+'.');
      else { cursor -= (duration+waits[i])*60000; suggested[i] = { index:stages[i].index, title:label(stages[i].row), start:cursor, finish:cursor+duration*60000 }; }
    }
    if (problems.length) return { state:'unknown', problems:problems, target:target, targetIndex:current.target,
      targetLocked:current.target>=0 && !!rows[current.target]._locked };
    var forecast = null, cause = '', uncertain = false, clock = Number.isFinite(now) ? now : Date.now();
    stages.forEach(function (entry, i) {
      var row = entry.row, planned = start(row, base), duration = row.planned_duration_minutes * 60000;
      if (planned == null) { problems.push('Set the suggested start of '+label(row)+'.'); return; }
      if (i && forecast == null) return;
      var prior = i ? forecast + waits[i-1]*60000 : -Infinity;
      var earliest = Math.max(planned, prior, clock);
      if (row.status === 'done' || row.status === 'done_before') {
        var actualStart = time(row.started_at), actualEnd = time(row.ended_at);
        if (actualStart == null || actualEnd == null) problems.push('Record or verify both actual start and finish of '+label(row)+'.');
        else if (actualEnd < actualStart) problems.push('The finish time of '+label(row)+' is before its start.');
        else if (actualStart < prior) problems.push(label(row)+' started before the planned inter-stage wait elapsed; review the Paddy sequence.');
        else forecast = Math.max(actualEnd, actualStart+duration);
      } else if (row.status === 'running') {
        var actual = time(row.started_at);
        if (actual == null) problems.push('Record or verify the start time of '+label(row)+'.');
        else if (actual < prior) problems.push(label(row)+' started before the planned inter-stage wait elapsed; review the Paddy sequence.');
        else { forecast = Math.max(actual+duration, clock); uncertain = uncertain || actual+duration < clock; }
      } else forecast = earliest+duration;
      if (!cause && forecast != null && forecast > planned+duration) cause = label(row) + (row.status === 'running' ? ' is still running' : row.status === 'todo' ? ' has not started by its planned time' : ' finished later than planned');
    });
    if (problems.length) return { state:'unknown', problems:problems, target:target, targetIndex:current.target,
      targetLocked:current.target>=0 && !!rows[current.target]._locked, suggested:suggested };
    var ready = forecast+waits[waits.length-1]*60000, gap = ready-target;
    if (uncertain && gap <= 0) return { state:'unknown', target:target, targetIndex:current.target,
      targetLocked:!!rows[current.target]._locked, suggested:suggested,
      problems:['A Paddy step is still running beyond its planned duration. Confirm its expected finish before calling Paddy ready or waiting.'] };
    return { state:gap>0?'miss':gap<0?'waiting':'on_time', target:target, targetIndex:current.target,
      targetLocked:!!rows[current.target]._locked, ready:ready,
      shortfallMs:Math.max(0,gap), waitingMs:Math.max(0,-gap), nextFeasible:Math.max(target,ready),
      cause:gap>0?(cause || 'the saved Paddy timing exceeds the convergence target'):'',
      uncertain:uncertain, suggested:suggested, soakCount:stages.length-1, problems:[] };
  }
  window.TK = window.TK || {}; window.TK.paddyConvergence = { identify:identify, rules:rules, plan:plan };
})();
