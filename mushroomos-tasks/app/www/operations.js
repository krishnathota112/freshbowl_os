/* Separate read-only Manager home. All displayed business facts come from authenticated RLS reads. */
(function () {
  if (!window.Auth.requireRole('manager', 'admin')) return;
  var api = window.TK.api, analytics = window.TK.operationsAnalytics;
  var user = window.Auth.currentUser(), model = null, generation = 0;
  var status = document.getElementById('operationsStatus'), content = document.getElementById('operationsContent');
  var zone = 'Asia/Kolkata';
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function at(v) { var n = v ? Date.parse(v) : NaN; return Number.isFinite(n) ? n : null; }
  function clock(v) { var n = typeof v === 'number' ? v : at(v); return n == null ? 'Not recorded' : new Date(n).toLocaleString('en-GB',{timeZone:zone,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}); }
  function hours(m) { return m == null ? '—' : (m / 60).toLocaleString('en-IN',{maximumFractionDigits:1}) + ' h'; }
  function num(n,places) { return Number(n || 0).toLocaleString('en-IN',{maximumFractionDigits:places == null ? 1 : places}); }
  function empty(message) { return '<p class="muted">' + esc(message) + '</p>'; }
  async function pages(table, params) {
    var rows = [], size = 500;
    for (var page = 0; page < 20; page++) {
      var part = await api.select(table,Object.assign({},params,{limit:String(size),offset:String(page*size)}));
      rows.push.apply(rows,part);
      if (part.length < size) return rows;
    }
    throw new Error('The selected period exceeds 10,000 rows in ' + table + '. No partial figures were shown. Choose a shorter period.');
  }
  async function taskResources(tasks) {
    var ids = Array.from(new Set(tasks.map(function(t){return t.id;}).filter(Boolean))), chunks = [], result = [];
    for(var i=0;i<ids.length;i+=70) chunks.push(ids.slice(i,i+70));
    for(var start=0;start<chunks.length;start+=4) {
      var found = await Promise.all(chunks.slice(start,start+4).map(function(ids){return api.select('tk_v_task_resources',{task_id:'in.(' + ids.join(',') + ')'});}));
      found.forEach(function(part){result.push.apply(result,part);});
    }
    return result;
  }
  async function load() {
    var seq = ++generation, days = Number(document.getElementById('period').value), now = Date.now(), since = now-days*86400000;
    status.className = 'muted'; status.textContent = 'Loading current batches and the last ' + days + ' days of recorded work…'; content.hidden = true;
    try {
      var main = await Promise.all([
        pages('tk_v_batch',{status:'eq.active',order:'created_at.desc'}),
        pages('tk_v_task_v3',{batch_status:'eq.active',order:'batch_id.asc,ord.asc'}),
        pages('tk_v_task_v3',{status:'in.(done,done_before)',ended_at:'gte.'+new Date(since).toISOString(),order:'ended_at.desc'}),
        pages('tk_machine',{order:'name.asc'}),
        pages('tk_v_machine_refuel',{event_at:'gte.'+new Date(since).toISOString(),order:'event_at.desc'})
      ]);
      if (seq !== generation) return;
      status.textContent = 'Loading labour and machine observations…';
      var resources = await taskResources(main[1].concat(main[2]));
      if (seq !== generation) return;
      model = analytics.model({batches:main[0],activeTasks:main[1],finishedTasks:main[2],machines:main[3],refuels:main[4],resources:resources,now:now,since:since});
      render(); content.hidden = false; status.className='muted small'; status.textContent='Read-only snapshot loaded. Press Refresh data for newer entries.';
    } catch (error) { if(seq===generation){model=null;status.className='error';status.textContent='Could not load a complete snapshot: '+error.message;} }
  }
  function renderSummary() {
    var q=model.quality, cards=[
      [model.boards.length,'Active batches','Live batch records'],
      [q.runningTasks,'Tasks running now','Parallel tasks counted separately'],
      [q.currentCrewRecorded+'/'+q.runningTasks,'Running crews recorded',num(q.currentAssignments,0)+' task-assignment slots; not unique people'],
      [hours(q.labourHours*60),'Observed labour-hours',q.labourHoursCoverage+'/'+q.completedInPeriod+' finished tasks had crew count and elapsed time'],
      [q.validDurations+'/'+q.completedInPeriod,'Durations measurable','Finished in period with both actual times'],
      [num(model.machines.reduce(function(n,m){return n+m.litresAdded;},0),2)+' L','Fuel logged as added','From '+model.machines.reduce(function(n,m){return n+m.refuels;},0)+' refuelling entries; not task consumption']
    ];
    document.getElementById('snapshotStamp').textContent='As of '+clock(model.generatedAt)+' IST · task averages from '+clock(model.since)+' to now.';
    document.getElementById('summaryCards').innerHTML=cards.map(function(c){return '<div class="summary-card"><div class="value">'+esc(c[0])+'</div><div class="label">'+esc(c[1])+'</div><div class="detail">'+esc(c[2])+'</div></div>';}).join('');
  }
  function renderBoard() {
    var el=document.getElementById('fieldBoard');
    if(!model.boards.length){el.innerHTML=empty('No active batches are recorded. Historical task analysis remains available below.');return;}
    el.innerHTML=model.boards.map(function(b){
      var body=b.current.length ? b.current.map(function(t){var r=model.resources.get(t.id);return '<div class="task-now"><strong>#'+esc(t.ord)+' '+esc(t.title)+'</strong><span>'+esc(t.line)+(t.pile?' · '+esc(t.pile):'')+' · since '+esc(clock(t.started_at))+(r&&r.labour_count!=null?' · crew '+esc(r.labour_count):' · crew not recorded')+'</span></div>';}).join('') : '<div class="task-now"><strong>No task marked running</strong><span>This is not proof that the field is idle. Check recording coverage.</span></div>';
      return '<article class="batch-card"><h3>'+esc(b.batch.name)+'</h3><div class="batch-meta">'+esc(b.batch.done||0)+'/'+esc(b.batch.tasks||0)+' tasks finished · '+esc(b.batch.running||0)+' running · '+esc(b.batch.awaiting_gm||0)+' awaiting GM</div>'+body+
        '<div class="batch-meta">Last recorded: '+(b.last?esc(b.last.title)+' · '+esc(clock(b.last.ended_at)):'none')+'</div><div class="batch-meta">Earliest suggested unstarted: '+(b.next?esc(b.next.title)+' · '+esc(clock(b.next.suggested_at)):'none')+'</div><div class="batch-links"><button class="btn sm" type="button" data-batch-excel="'+esc(b.batch.id)+'">Download batch Excel</button></div></article>';
    }).join('');
  }
  function renderMap() {
    var stages=['Bagasse','Paddy','Mixing','Turner','Bunker & conditioning','Tunnel & discharge','Other'];
    document.getElementById('processMap').innerHTML=stages.map(function(stage){
      var entries=model.boards.filter(function(b){return b.stages.indexOf(stage)!==-1;});
      return '<div class="process-stage"><strong>'+esc(stage)+'</strong>'+(entries.length?entries.map(function(b){return '<small>'+esc(b.batch.name)+' · '+b.current.filter(function(t){return analytics.stage(t)===stage;}).length+' running</small>';}).join(''):'<small>No running task recorded here</small>')+'</div>';
    }).join('');
  }
  function renderAverages() {
    var el=document.getElementById('durationChart'), groups=model.averages;
    if(!groups.length){el.innerHTML=empty('No completed task in this period has both actual start and finish times.');return;}
    var max=Math.max.apply(null,groups.map(function(g){return g.averageMinutes;}))||1;
    el.innerHTML=groups.map(function(g){return '<div class="chart-row"><div class="chart-name"><strong>'+esc(g.title)+'</strong><small>'+esc(g.line)+(g.pass?' · '+esc(g.pass):'')+' · '+esc(g.kind)+'</small></div><div class="chart-track"><span class="chart-bar" style="width:'+Math.min(100,100*g.averageMinutes/max).toFixed(1)+'%"></span></div><div class="chart-value">'+hours(g.averageMinutes)+'<small>n='+g.count+(g.averagePlannedMinutes==null?'':' · plan '+hours(g.averagePlannedMinutes))+'</small></div></div>';}).join('');
  }
  function renderManpower() {
    var el=document.getElementById('manpowerTable');
    if(!model.manpower.length){el.innerHTML=empty('No task has a finish timestamp in the selected period.');return;}
    el.innerHTML='<table class="operations-table"><thead><tr><th>Task</th><th>Stream / pass</th><th>Finished</th><th>Crew recorded</th><th>Average crew</th><th>Labour-hours observed</th><th>Hours coverage</th></tr></thead><tbody>'+model.manpower.map(function(g){return '<tr><td class="wrap-text">'+esc(g.title)+'</td><td>'+esc(g.line)+(g.pass?' · '+esc(g.pass):'')+'</td><td>'+g.finished+'</td><td>'+g.crewRecorded+'/'+g.finished+'</td><td>'+(g.averageCrew==null?'—':num(g.averageCrew,1))+'</td><td>'+(g.labourHoursCoverage?num(g.labourHours,1):'—')+'</td><td>'+g.labourHoursCoverage+'/'+g.finished+'</td></tr>';}).join('')+'</tbody></table>';
  }
  function renderMachines() {
    var el=document.getElementById('machineTable');
    if(!model.machines.length){el.innerHTML=empty('No registered machines or refuelling data available.');return;}
    el.innerHTML='<table class="operations-table"><thead><tr><th>Machine</th><th>Type</th><th>Task uses</th><th>Measured km</th><th>Km coverage</th><th>Fuel added (L)</th><th>Refuels</th></tr></thead><tbody>'+model.machines.map(function(m){return '<tr><td>'+esc(m.name)+'</td><td>'+esc(m.kind||'—')+'</td><td>'+m.uses+'</td><td>'+(m.distanceCount?num(m.distanceKm,3):'—')+'</td><td>'+m.distanceCount+'/'+m.uses+'</td><td>'+(m.refuels?num(m.litresAdded,3):'—')+'</td><td>'+m.refuels+'</td></tr>';}).join('')+'</tbody></table>';
  }
  function taskRows() {
    return model.allTasks.slice().sort(function(a,b){return String(a.batch_name||'').localeCompare(String(b.batch_name||'')) || (a.ord||0)-(b.ord||0);});
  }
  function renderLedger() {
    var search=document.getElementById('taskSearch').value.trim().toLowerCase(), rows=taskRows().filter(function(t){return !search || [t.batch_name,t.title,t.line,t.pile,t.turner_pass].join(' ').toLowerCase().indexOf(search)!==-1;});
    document.getElementById('ledgerCount').textContent=rows.length+' matching tasks; first '+Math.min(rows.length,200)+' shown. Download includes all '+model.allTasks.length+' loaded tasks.';
    document.getElementById('taskLedger').innerHTML='<table class="operations-table"><thead><tr><th>Batch</th><th>#</th><th>Task</th><th>Stream / pile</th><th>Status</th><th>Suggested start</th><th>Actual start</th><th>Actual finish</th><th>Actual hours</th><th>Crew</th><th>Machines</th></tr></thead><tbody>'+rows.slice(0,200).map(function(t){var r=model.resources.get(t.id);return '<tr><td>'+esc(t.batch_name)+'</td><td>'+esc(t.ord)+'</td><td class="wrap-text">'+esc(t.title)+'</td><td>'+esc(t.line)+(t.pile?' · '+esc(t.pile):'')+'</td><td>'+esc(t.status)+'</td><td>'+esc(t.suggested_at?clock(t.suggested_at):'—')+'</td><td>'+esc(t.started_at?clock(t.started_at):'—')+'</td><td>'+esc(t.ended_at?clock(t.ended_at):'—')+'</td><td>'+hours(analytics.elapsedMinutes(t))+'</td><td>'+(r&&r.labour_count!=null?esc(r.labour_count):'—')+'</td><td class="wrap-text">'+esc(r?(r.machines||[]).map(function(m){return m.machine_name;}).join(', '):'—')+'</td></tr>';}).join('')+'</tbody></table>';
  }
  function renderMethods() {
    var q=model.quality;
    document.getElementById('methodNotes').innerHTML='<p><strong>Coverage.</strong> '+q.completedInPeriod+' tasks have a finish timestamp in this period; '+q.validDurations+' have a valid start and finish. '+q.missingTime+' finished tasks lack a usable elapsed time. Work marked complete before the app is never assigned an invented duration.</p><p><strong>Manpower.</strong> Crew counts are task observations. Concurrent counts can include the same person twice; they are not unique headcount. Labour-hours multiply recorded crew count by actual task duration and assume that count stayed constant.</p><p><strong>Machine / fuel.</strong> Task uses and paired odometer km cover running tasks now plus tasks finished in this period. Litres are refuelling events in the period, not litres consumed by a task or reconciled tank inventory. Voided entries are excluded.</p><p><strong>Stage map.</strong> Stages are inferred from running task titles, streams and report sections. The supplied minimap is a mockup; no actual bunker, tunnel or yard location is asserted unless entered as a field record.</p><p><strong>Period.</strong> Actual-duration averages include only completed tasks with finish timestamps in the selected period. Current active batches and their full task lists are shown regardless of period. Refresh manually to get a new snapshot. All display times use India Standard Time.</p>';
  }
  function render() { renderSummary();renderBoard();renderMap();renderAverages();renderManpower();renderMachines();renderLedger();renderMethods(); }
  function download(name, rows) {
    var blob=new Blob([analytics.csv(rows)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='Factory Operations '+name+' '+new Date(model.generatedAt).toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},60000);
  }
  function exportData(type) {
    if(!model)return;
    if(type==='averages')download('task averages',[['Task','Stream','Type','Turner pass','Sample count','Average actual minutes','Average planned minutes','Period start IST','Snapshot IST']].concat(model.averages.map(function(g){return [g.title,g.line,g.kind,g.pass,g.count,Number(g.averageMinutes.toFixed(2)),g.averagePlannedMinutes==null?'':Number(g.averagePlannedMinutes.toFixed(2)),clock(model.since),clock(model.generatedAt)];})));
    if(type==='manpower')download('manpower by task',[['Task','Stream','Type','Turner pass','Finished in period','Crew counts recorded','Average recorded crew','Observed labour-hours','Labour-hours coverage','Period start IST','Snapshot IST']].concat(model.manpower.map(function(g){return [g.title,g.line,g.kind,g.pass,g.finished,g.crewRecorded,g.averageCrew==null?'':Number(g.averageCrew.toFixed(2)),g.labourHoursCoverage?Number(g.labourHours.toFixed(2)):'',g.labourHoursCoverage,clock(model.since),clock(model.generatedAt)];})));
    if(type==='machines')download('machines and refuelling',[['Machine','Type','Task uses (running now + finished in period)','Measured km','Uses with paired km','Litres added in period','Refuelling entries','Period start IST','Snapshot IST']].concat(model.machines.map(function(m){return [m.name,m.kind,m.uses,m.distanceCount?Number(m.distanceKm.toFixed(3)):'',m.distanceCount,m.refuels?Number(m.litresAdded.toFixed(3)):'',m.refuels,clock(model.since),clock(model.generatedAt)];})));
    if(type==='tasks')download('task ledger',[['Batch','Serial','Task','Description','Stream','Pile','Turner pass','Type','Status','Suggested start IST','Planned duration minutes','Actual start IST','Actual finish IST','Actual elapsed minutes','Crew count','Machines','Machine km','Before photos','After photos','Start source']].concat(taskRows().map(function(t){var r=model.resources.get(t.id),ms=r&&r.machines||[];return [t.batch_name,t.ord,t.title,t.description,t.line,t.pile,t.turner_pass,t.kind,t.status,t.suggested_at?clock(t.suggested_at):'',t.planned_duration_minutes,t.started_at?clock(t.started_at):'',t.ended_at?clock(t.ended_at):'',analytics.elapsedMinutes(t),r&&r.labour_count,ms.map(function(m){return m.machine_name;}).join('; '),ms.map(function(m){return m.machine_name+': '+(m.distance_km==null?'unknown':m.distance_km+' km');}).join('; '),t.before_photos,t.after_photos,t.start_source];})));
  }
  async function batchExcel(id,button) {
    button.disabled=true;status.className='muted small';status.textContent='Preparing batch Excel…';
    try {
      var snapshot=await api.rpc('tk_batch_progress',{p_batch:id});
      var layoutResponse=await fetch('report-layout.json?v=1');
      if(!layoutResponse.ok)throw new Error('The Excel layout could not load.');
      var report=window.TK.batchReport.model(snapshot),bytes=window.TK.batchReport.xlsx(report,await layoutResponse.json());
      var url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),a=document.createElement('a');
      a.href=url;a.download=String(report.batch.name||'Batch').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,100)+' Progress.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},60000);
      status.textContent='Batch Excel downloaded from a fresh read-only snapshot.';
    } catch(error){status.className='error';status.textContent='Excel download failed: '+error.message;}
    finally{button.disabled=false;}
  }
  document.getElementById('identity').textContent=(user.name||user.email)+' · '+(user.role==='admin'?'Admin preview':'Read-only Manager');
  document.getElementById('refresh').onclick=load;
  document.getElementById('period').onchange=load;
  document.getElementById('taskSearch').oninput=function(){if(model)renderLedger();};
  document.getElementById('signout').onclick=function(){window.Auth.signOut();};
  content.addEventListener('click',function(e){var x=e.target.closest('[data-export]');if(x)return exportData(x.dataset.export);var b=e.target.closest('[data-batch-excel]');if(b)batchExcel(b.dataset.batchExcel,b);});
  if(user.role==='admin'){
    document.getElementById('managerSetup').hidden=false;
    document.getElementById('managerForm').onsubmit=async function(e){
      e.preventDefault();var button=e.target.querySelector('[type=submit]'),message=document.getElementById('managerMessage');button.disabled=true;message.textContent='Creating Manager login…';
      try { await api.rpc('admin_create_user',{p_email:document.getElementById('managerEmail').value.trim(),p_display_name:document.getElementById('managerName').value.trim(),p_password:document.getElementById('managerPassword').value,p_role:'manager'});document.getElementById('managerPassword').value='';message.textContent='Manager login created. Share the password privately and ask them to sign in at this website.'; }
      catch(error){message.textContent='Login was not created: '+error.message;}
      finally{button.disabled=false;}
    };
  }
  load();
})();
