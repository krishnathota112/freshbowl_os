/* One read-only snapshot and one presentation model for the website and Excel. */
(function () {
  var zone = 'Asia/Kolkata', dayMs = 86400000;
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function at(v) { var n = v ? Date.parse(v) : NaN; return Number.isFinite(n) ? n : null; }
  function date(n) { return n == null ? '' : new Date(n).toLocaleDateString('en-GB', { timeZone:zone, day:'2-digit',month:'short',year:'numeric' }); }
  function time(n) { return n == null ? '' : new Date(n).toLocaleTimeString('en-GB', { timeZone:zone, hour:'2-digit',minute:'2-digit',hourCycle:'h23' }); }
  function full(n) { return n == null ? '' : date(n) + ' ' + time(n); }
  function duration(n) { return n == null ? '' : Math.floor(n / 60) + 'h ' + Math.floor(n % 60) + 'm'; }
  // Excel has no timezone. Store factory-local serials, not the viewer's device timezone.
  function serial(n) { return n == null ? null : (n + 330 * 60000) / dayMs + 25569; }
  var labels = { todo:'Planned',running:'Actual · in progress',done:'Actual',done_before:'Actual · before app',submitted:'Actual · waiting GM',returned:'Actual · returned to Lab' };
  function model(snapshot) {
    if (!snapshot || !snapshot.batch || !Array.isArray(snapshot.rows)) throw new Error('No such batch or you do not have access.');
    var rows = snapshot.rows.slice().sort(function (a,b) { return a.ord-b.ord; }).map(function (t) {
      var p = at(t.suggested_at), minutes = t.planned_duration_minutes;
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > 525600) minutes = null;
      var pe = p != null && minutes != null ? p + minutes * 60000 : null;
      var actual = t.status !== 'todo' || at(t.started_at) != null || at(t.ended_at) != null;
      var start = actual ? at(t.started_at) : p, end = actual ? at(t.ended_at) : pe;
      var elapsed = actual && start != null && end != null && end >= start ? Math.round((end-start)/60000) : null;
      var status = labels[t.status] || 'Unknown status';
      if (t.status === 'todo' && actual) status = 'Actual · incomplete';
      if (t.kind === 'lab_gate' && t.status === 'done') status = 'Actual · approved';
      var remarks = [t.description, t.control ? 'Lab / control: ' + t.control : '', t.note ? 'Note: ' + t.note : ''];
      if (t.answer) remarks.push(({machine:'Machine',bunker:'Bunker',tunnel:'Tunnel',bunker_tunnel:'Bunker / tunnel'}[t.ask] || 'Recorded answer') + ': ' + t.answer);
      if (t.resources) {
        remarks.push('Labour: ' + (t.resources.labour_count == null ? 'not recorded' : t.resources.labour_count));
        (t.resources.machines || []).forEach(function (m) {
          remarks.push('Machine: ' + m.machine_name + (m.machine_kind === 'heavy_machine' ? ' (heavy)' : '') +
            (m.distance_km == null ? ' · km not calculated' : ' · ' + m.distance_km + ' km'));
        });
      }
      if (actual && p != null) remarks.push('Plan: ' + full(p) + (pe == null ? '' : ' → ' + full(pe)));
      if (end != null && (start == null || date(start) !== date(end))) remarks.push('End date: ' + date(end));
      if (start != null && end != null && end < start) remarks.push('Check recorded times: end is before start; duration not calculated.');
      if (t.status === 'done_before') remarks.push('Marked completed before app; missing actual times are not estimated.');
      if (t.start_source === 'reported') remarks.push('Actual start stated by Admin.');
      if ((t.kind === 'lab' || t.kind === 'lab_gate') && end != null) remarks.push('End time is the Lab submission time, not GM approval time.');
      if (t.last_decision != null) remarks.push('GM: ' + (t.last_decision ? 'Approved' : 'Returned') + (t.last_decision_note ? ' — ' + t.last_decision_note : ''));
      (t.readings || []).forEach(function (r) { remarks.push('Lab round ' + r.round + ' · ' + r.label + ': ' + r.value + (r.unit ? ' ' + r.unit : '')); });
      if (t.photos !== 'none' || t.before_photos || t.after_photos || t.other_photos) remarks.push('Photos: ' + (t.before_photos || 0) + ' before / ' + (t.after_photos || 0) + ' after' + (t.other_photos ? ' / ' + t.other_photos + ' other' : ''));
      var context = [t.line, t.pile, t.turner_pass && t.turner_pass.replace(/_/g,' '), t.kind === 'lab_gate' ? 'Lab gate' : t.kind === 'lab' ? 'Lab' : '', t.lab_checkpoint].filter(Boolean).join(' · ');
      return { id:t.id,ord:t.ord,title:t.title,context:context,section:t.report_section || '',minutes:minutes,start:start,end:end,date:start == null ? end : start,
        elapsed:elapsed,remarks:remarks.filter(Boolean).join('\n'),status:status,
        style:!actual ? 'planned' : t.status === 'done_before' ? 'unknown' : t.status === 'done' ? 'actual' : 'partial',
        lab:t.kind === 'lab' || t.kind === 'lab_gate' };
    });
    return { batch:snapshot.batch,generated:at(snapshot.generated_at),rows:rows };
  }
  function note(report) { return 'Times: IST (Asia/Kolkata). Durations: h:mm, nearest minute. Blank = not recorded / not planned. Time Taken is actual only. Snapshot: ' + full(report.generated); }
  function table(report) {
    var section = '', body = '';
    report.rows.forEach(function (r) {
      if (r.section !== section) { section = r.section; body += '<tr class="report-section"><th colspan="9">' + esc(section || 'Other tasks') + '</th></tr>'; }
      body += '<tr class="report-' + r.style + '"><td>' + r.ord + '</td><td><a href="#/t/' + encodeURIComponent(r.id) + '">' + esc(r.title) + '</a><div class="small muted">' + esc(r.context) + '</div></td><td>' + esc(duration(r.minutes)) + '</td><td>' + esc(date(r.date)) + '</td><td>' + esc(time(r.start)) + '</td><td>' + esc(time(r.end)) + (r.end != null && date(r.date) !== date(r.end) ? '<div class="small">' + esc(date(r.end)) + '</div>' : '') + '</td><td>' + esc(duration(r.elapsed)) + '</td><td class="report-remark">' + esc(r.remarks) + '</td><td>' + esc(r.status) + '</td></tr>';
    });
    return '<div class="report-scroll"><table class="progress-report"><thead><tr><th rowspan="2">Sr.No</th><th rowspan="2">Button Mushroom Compost Standard Process</th><th rowspan="2">Hours<br>(planned)</th><th colspan="6">' + esc(report.batch.name) + '</th></tr><tr><th>Date</th><th>Start Time</th><th>End Time</th><th>Time Taken</th><th>Remark</th><th>Actual / Planned</th></tr></thead><tbody>' + (body || '<tr><td colspan="9">No tasks recorded in this batch.</td></tr>') + '</tbody></table></div>';
  }
  async function mount(root, api, id, current) {
    root.innerHTML = '<div class="card muted">Loading batch progress…</div>';
    try {
      var report = model(await api.rpc('tk_batch_progress',{p_batch:id}));
      if (!current()) return;
      root.innerHTML = '<div class="card report-toolbar"><div class="row"><div class="grow"><div class="big">' + esc(report.batch.name) + ' · Progress report</div><p class="muted small">' + report.rows.length + ' tasks · ' + report.rows.filter(function (r) { return r.lab; }).length + ' Lab tasks. Original task numbers and pile records are included.</p></div><button class="btn pri" type="button" data-excel>Download Excel</button><button class="btn" type="button" data-print>Print</button><a class="btn" href="#/b/' + encodeURIComponent(id) + '">Back to batch</a></div><p class="small">' + esc(note(report)) + '</p><p class="small muted">Green = completed actual work · Blue = recorded work in progress / awaiting approval · Yellow = planned. Blank times are never estimated. Refresh to load newer records.</p><div role="status" data-report-msg></div></div>' + table(report);
      root.querySelector('[data-print]').onclick = function () { window.print(); };
      var button = root.querySelector('[data-excel]'), message = root.querySelector('[data-report-msg]');
      button.onclick = async function () {
        if (button.disabled) return; button.disabled=true; message.textContent='Preparing Excel…';
        try {
          var res=await fetch('report-layout.json?v=1'); if (!res.ok) throw new Error('Report layout could not load. Try again.');
          var bytes=xlsx(report,await res.json());
          if (!current()) return;
          var url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
          var a=document.createElement('a');a.href=url;a.download=(report.batch.name || 'Batch').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,100)+' Progress.xlsx';
          document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},60000);
          message.textContent='Excel download ready. Includes all '+report.rows.length+' tasks from this snapshot.';
        } catch(e) { if(current()) message.textContent=e.message; }
        finally { button.disabled=false; }
      };
    } catch(e) { if(current()) root.innerHTML='<div class="error">'+esc(e.message)+'</div>'; }
  }
  function xml(v) { return esc(String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,'')); }
  // Fill the artifact-tool-authored layout. Literal text is always inlineStr, never a formula.
  function xlsx(report, layout) {
    var parts=Object.assign({},layout.parts), key=Object.keys(parts).find(function(k){return /^xl\/worksheets\/sheet\d+\.xml$/.test(k);});
    if (layout.version!==1 || !key) throw new Error('Unsupported report layout. Reload the website.');
    var doc=new DOMParser().parseFromString(parts[key],'application/xml');
    function style(cell) { var c=Array.from(doc.getElementsByTagNameNS('*','c')).find(function(n){return n.getAttribute('r')===cell;});return c ? c.getAttribute('s') || '0' : '0'; }
    function cell(col,row,value,s) {
      var attrs=' r="'+col+row+'" s="'+s+'"';
      if(value==null || value==='')return '<c'+attrs+'/>';
      return typeof value==='number' ? '<c'+attrs+'><v>'+value+'</v></c>' : '<c'+attrs+' t="inlineStr"><is><t xml:space="preserve">'+xml(value)+'</t></is></c>';
    }
    var cols='ABCDEFGHI'.split(''),rows=[],merges=['A1:A2','B1:B2','C1:C2','D1:I1','A3:I3'];
    function row(n,values,template,height) { rows.push('<row r="'+n+'" ht="'+height+'" customHeight="1">'+cols.map(function(c,i){return cell(c,n,values[i],style(c+template));}).join('')+'</row>'); }
    row(1,['Sr.No','Button Mushroom Compost Standard Process','Hours\n(planned)',report.batch.name],1,42);
    row(2,[null,null,null,'Date','Start Time','End Time','Time Taken','Remark','Actual / Planned'],2,34);
    row(3,[note(report)],3,32);
    function wrapped(text,width) {
      return text.split('\n').reduce(function(all,line){
        while(line.length>width){var cut=line.lastIndexOf(' ',width);if(cut<width/2)cut=width;all.push(line.slice(0,cut));line=line.slice(cut).replace(/^ /,'');}
        all.push(line);return all;
      },[]);
    }
    var n=4, section='';
    report.rows.forEach(function(r){
      if(r.section!==section){section=r.section;merges.push('A'+n+':I'+n);row(n++,[section || 'Other tasks'],4,26);}
      var titleLines=wrapped(r.title+'\n'+r.context,48),remarkLines=wrapped(r.remarks,58),first=true;
      // Excel caps row heights. Split very long remarks into visible continuation rows, never truncate.
      do {
        var title=titleLines.splice(0,22),remark=remarkLines.splice(0,22),height=Math.max(54,Math.max(title.length,remark.length)*15+8);
        var values=first ? [r.ord,title.join('\n'),r.minutes==null?null:r.minutes/1440,serial(r.date),serial(r.start),serial(r.end),r.elapsed==null?null:r.elapsed/1440,remark.join('\n'),r.status] :
          [null,title.join('\n') || 'Task '+r.ord+' — continued',null,null,null,null,null,remark.join('\n'),null];
        row(n++,values,{actual:5,planned:6,partial:7,unknown:8}[r.style],height);first=false;
      } while(titleLines.length || remarkLines.length);
    });
    var columnXml=doc.getElementsByTagNameNS('*','cols')[0];
    parts[key]='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:I'+(n-1)+'"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/>'+(columnXml?new XMLSerializer().serializeToString(columnXml):'')+'<sheetData>'+rows.join('')+'</sheetData><mergeCells count="'+merges.length+'">'+merges.map(function(m){return '<mergeCell ref="'+m+'"/>';}).join('')+'</mergeCells><pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="8" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
    return zip(parts);
  }
  // ZIP STORE keeps exports dependency-free and entirely on the signed-in device.
  // No private batch data is sent to a conversion service.
  function zip(parts) {
    var encoder=new TextEncoder(),chunks=[],central=[],offset=0;
    function crc(bytes){var c=0xffffffff;for(var i=0;i<bytes.length;i++){c^=bytes[i];for(var j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
    function header(size){var b=new Uint8Array(size);return {b:b,v:new DataView(b.buffer)};}
    Object.keys(parts).forEach(function(name){
      var filename=encoder.encode(name),data=encoder.encode(parts[name]),sum=crc(data),h=header(30),c=header(46);
      h.v.setUint32(0,0x04034b50,true);h.v.setUint16(4,20,true);h.v.setUint16(6,0x800,true);h.v.setUint32(14,sum,true);h.v.setUint32(18,data.length,true);h.v.setUint32(22,data.length,true);h.v.setUint16(26,filename.length,true);
      c.v.setUint32(0,0x02014b50,true);c.v.setUint16(4,20,true);c.v.setUint16(6,20,true);c.v.setUint16(8,0x800,true);c.v.setUint32(16,sum,true);c.v.setUint32(20,data.length,true);c.v.setUint32(24,data.length,true);c.v.setUint16(28,filename.length,true);c.v.setUint32(42,offset,true);
      chunks.push(h.b,filename,data);central.push(c.b,filename);offset+=30+filename.length+data.length;
    });
    var size=central.reduce(function(n,b){return n+b.length;},0),e=header(22),count=Object.keys(parts).length;
    e.v.setUint32(0,0x06054b50,true);e.v.setUint16(8,count,true);e.v.setUint16(10,count,true);e.v.setUint32(12,size,true);e.v.setUint32(16,offset,true);
    var out=new Uint8Array(offset+size+22),p=0;chunks.concat(central,[e.b]).forEach(function(b){out.set(b,p);p+=b.length;});return out;
  }
  window.TK.batchReport={mount:mount,model:model,xlsx:xlsx};
})();
