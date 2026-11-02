/* Read-only factory metrics. Missing observations remain missing, never zero or estimated. */
(function () {
  function time(value) { var n = value ? Date.parse(value) : NaN; return Number.isFinite(n) ? n : null; }
  function number(value) { if (value == null || value === '') return null; var n = Number(value); return Number.isFinite(n) ? n : null; }
  function completed(task) { return task.status === 'done' || task.status === 'done_before'; }
  function elapsedMinutes(task) {
    if (!completed(task)) return null;
    var start = time(task.started_at), end = time(task.ended_at);
    return start != null && end != null && end >= start ? (end - start) / 60000 : null;
  }
  function taskKey(task) {
    return [task.kind || '', task.line || '', task.turner_pass || '', String(task.title || '').trim().replace(/\s+/g, ' ').toLowerCase()].join('|');
  }
  function uniqueTasks(active, finished) {
    var map = new Map();
    (active || []).concat(finished || []).forEach(function (t) { if (t && t.id) map.set(t.id, t); });
    return Array.from(map.values());
  }
  function stage(task) {
    var words = [task.report_section, task.title, task.line].join(' ').toLowerCase();
    if (/tunnel|grow.room/.test(words)) return 'Tunnel & discharge';
    if (/bunker|conditioning/.test(words)) return 'Bunker & conditioning';
    if (/turner|\bt[0-3]\b/.test(words)) return 'Turner';
    if (/paddy|soak|lagoon/.test(words)) return 'Paddy';
    if (/bagasse|hopper|heap/.test(words)) return 'Bagasse';
    if (/mix|manure|rotavator|flip/.test(words)) return 'Mixing';
    return 'Other';
  }
  function model(input) {
    input = input || {};
    var activeBatches = input.batches || [], activeTasks = input.activeTasks || [], finished = input.finishedTasks || [];
    var all = uniqueTasks(activeTasks, finished), byId = new Map(all.map(function (t) { return [t.id, t]; }));
    var resources = new Map((input.resources || []).map(function (r) { return [r.task_id, r]; }));
    var now = number(input.now) || Date.now(), since = number(input.since) || 0;
    var durations = new Map(), manpower = new Map(), measured = 0, missingTime = 0, labourHours = 0, labourHoursCoverage = 0;
    var machineMap = new Map((input.machines || []).map(function (m) { return [m.id, { id:m.id, name:m.name, kind:m.kind, uses:0, distanceKm:0, distanceCount:0, litresAdded:0, refuels:0 }]; }));
    function machine(id, fallback) {
      if (!machineMap.has(id)) machineMap.set(id, { id:id, name:fallback || 'Unregistered machine', kind:'', uses:0, distanceKm:0, distanceCount:0, litresAdded:0, refuels:0 });
      return machineMap.get(id);
    }
    var relevantFinished = finished.filter(function (t) { return completed(t) && time(t.ended_at) != null && time(t.ended_at) >= since && time(t.ended_at) <= now; });
    relevantFinished.forEach(function (t) {
      var key = taskKey(t), crew = resources.get(t.id), count = crew && number(crew.labour_count);
      var group = manpower.get(key);
      if (!group) { group = {key:key,title:t.title||'Untitled',line:t.line||'',kind:t.kind||'',pass:t.turner_pass||'',finished:0,crewRecorded:0,crewSum:0,labourHours:0,labourHoursCoverage:0};manpower.set(key,group); }
      group.finished++;
      if (count != null && count >= 0) { group.crewRecorded++;group.crewSum+=count; }
      var minutes = elapsedMinutes(t);
      if (minutes == null) { missingTime++; return; }
      measured++;
      var g = durations.get(key);
      if (!g) { g = { key:key, title:t.title || 'Untitled', line:t.line || '', kind:t.kind || '', pass:t.turner_pass || '', count:0, totalMinutes:0, plannedMinutes:0, plannedCount:0 }; durations.set(key,g); }
      g.count++; g.totalMinutes += minutes;
      var planned = number(t.planned_duration_minutes);
      if (planned != null && planned >= 0) { g.plannedMinutes += planned; g.plannedCount++; }
      if (count != null && count >= 0) { var observed=count*minutes/60;labourHours+=observed;labourHoursCoverage++;group.labourHours+=observed;group.labourHoursCoverage++; }
    });
    var currentAssignments = 0, currentCrewRecorded = 0, running = activeTasks.filter(function (t) { return t.status === 'running'; });
    running.forEach(function (t) {
      var r = resources.get(t.id), count = r && number(r.labour_count);
      if (count != null && count >= 0) { currentAssignments += count; currentCrewRecorded++; }
    });
    uniqueTasks(running, relevantFinished).forEach(function (t) {
      var r = resources.get(t.id);
      if (!r) return;
      (Array.isArray(r.machines) ? r.machines : []).forEach(function (entry) {
        if (!entry || !entry.machine_id) return;
        var m = machine(entry.machine_id, entry.machine_name);
        m.uses++;
        var distance = number(entry.distance_km);
        if (distance != null && distance >= 0) { m.distanceKm += distance; m.distanceCount++; }
      });
    });
    (input.refuels || []).forEach(function (r) {
      var at = time(r.event_at), litres = number(r.litres);
      if (r.voided_at || at == null || at < since || at > now || litres == null || litres <= 0) return;
      var m = machine(r.machine_id, r.machine_name); m.litresAdded += litres; m.refuels++;
    });
    var boards = activeBatches.map(function (b) {
      var tasks = activeTasks.filter(function (t) { return t.batch_id === b.id; }).sort(function (a,c) { return (a.ord || 0) - (c.ord || 0); });
      var current = tasks.filter(function (t) { return t.status === 'running'; });
      var last = tasks.filter(completed).sort(function (a,c) { return (time(c.ended_at) || 0) - (time(a.ended_at) || 0); })[0] || null;
      var next = tasks.filter(function (t) { return t.status === 'todo'; }).sort(function (a,c) { return (time(a.suggested_at) || Infinity) - (time(c.suggested_at) || Infinity) || (a.ord || 0) - (c.ord || 0); })[0] || null;
      return { batch:b, current:current, last:last, next:next, stages:Array.from(new Set(current.map(stage))), tasks:tasks };
    });
    return {
      generatedAt:now, since:since, boards:boards, allTasks:all, resources:resources, taskById:byId,
      averages:Array.from(durations.values()).map(function (g) { return Object.assign(g,{ averageMinutes:g.totalMinutes/g.count, averagePlannedMinutes:g.plannedCount ? g.plannedMinutes/g.plannedCount : null }); }).sort(function (a,b) { return b.count-a.count || a.title.localeCompare(b.title); }),
      manpower:Array.from(manpower.values()).map(function(g){return Object.assign(g,{averageCrew:g.crewRecorded?g.crewSum/g.crewRecorded:null});}).sort(function(a,b){return b.labourHours-a.labourHours || a.title.localeCompare(b.title);}),
      machines:Array.from(machineMap.values()).sort(function (a,b) { return a.name.localeCompare(b.name); }),
      quality:{ completedInPeriod:relevantFinished.length, validDurations:measured, missingTime:missingTime, labourHours:labourHours, labourHoursCoverage:labourHoursCoverage, runningTasks:running.length, currentAssignments:currentAssignments, currentCrewRecorded:currentCrewRecorded }
    };
  }
  function csv(rows) {
    return '\ufeff' + rows.map(function (row) { return row.map(function (value) {
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
      var s = String(value == null ? '' : value);
      if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    }).join(','); }).join('\r\n') + '\r\n';
  }
  window.TK = window.TK || {};
  window.TK.operationsAnalytics = { model:model, csv:csv, elapsedMinutes:elapsedMinutes, stage:stage, taskKey:taskKey };
})();
