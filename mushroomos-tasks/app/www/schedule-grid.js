/* Calendar-first editor shared by reusable SOPs and batch plans. */
(function () {
  var kinds = { work: 'Work', rest: 'Rest', cleaning: 'Cleaning', lab: 'Lab', lab_gate: 'Lab gate' };
  var photos = { none: 'No photo', before: 'Before', after: 'After', both: 'Before + after' };
  var asks = { none: '—', bunker: 'Bunker no.', tunnel: 'Tunnel no.', bunker_tunnel: 'Bunker / tunnel no.', machine: 'Machine' };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function local(at) { var d = new Date(at); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  function blank(line) { return { line: line || 'Main', title: '', kind: 'work', control: '', photos: 'both', ask: 'none', lab_checkpoint: '', suggested_offset_minutes: null, schedule_mode: 'fixed', schedule_gap_minutes: 0 }; }
  var fullscreenOwners = new WeakMap();
  // Keep the same grid DOM in place: toggling must never reset a field or submit a form.
  function fullscreenControls(root, readonly) {
    if (fullscreenOwners.has(root)) fullscreenOwners.get(root).destroy();
    var expanded = false, nativeActive = false, generation = 0, observer = null, background = [], attributes = {};
    var fallback = false, scroll = null;
    function sync() {
      var toggle = root.querySelector('[data-fullscreen]'), hint = root.querySelector('[data-fullscreen-hint]');
      if (toggle) {
        toggle.setAttribute('aria-pressed', String(expanded));
        toggle.textContent = expanded ? (nativeActive ? 'Exit full screen' : 'Exit expanded view') : 'Full screen';
      }
      var footer = root.querySelector('[data-fullscreen-footer]');
      if (footer) footer.hidden = !expanded;
      if (hint) hint.textContent = (fallback ? 'Browser full screen unavailable here. Using the available window. ' : '') +
        (readonly ? 'Press Esc or Back to editor to return.' : 'Edits are kept. Back to editor to save your changes.');
    }
    function restore(focus) {
      if (!expanded) return;
      expanded = false; nativeActive = false; generation++;
      root.classList.remove('plan-expanded'); document.documentElement.classList.remove('plan-fullscreen-open');
      background.forEach(function (entry) { if (!entry[1]) entry[0].removeAttribute('inert'); }); background = [];
      Object.keys(attributes).forEach(function (name) { if (attributes[name] == null) root.removeAttribute(name); else root.setAttribute(name, attributes[name]); });
      document.removeEventListener('fullscreenchange', fullscreenChanged);
      document.removeEventListener('keydown', keydown, true);
      if (observer) { observer.disconnect(); observer = null; }
      sync();
      var wrap = root.querySelector('.grid-wrap');
      if (wrap && scroll) { wrap.scrollLeft = scroll.left; wrap.scrollTop = scroll.top; }
      if (focus && root.isConnected) root.querySelector('[data-fullscreen]').focus({ preventScroll: true });
    }
    function exitNative() {
      if (document.fullscreenElement === root && document.exitFullscreen) return document.exitFullscreen();
      return Promise.resolve();
    }
    async function leave() {
      try { await exitNative(); restore(true); }
      catch (e) { var hint = root.querySelector('[data-fullscreen-hint]'); if (hint) hint.textContent = 'Press Esc to leave full screen. Your edits are kept.'; }
    }
    function fullscreenChanged() {
      if (document.fullscreenElement === root) { nativeActive = true; sync(); }
      else if (nativeActive) restore(true); // Browser Esc, tab switch or OS exit.
    }
    function keydown(e) {
      if (e.key === 'Escape') { e.preventDefault(); leave(); }
      if (e.key !== 'Tab') return;
      var controls = Array.from(root.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)'));
      var first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    }
    function enter() {
      if (expanded || !root.isConnected) return;
      expanded = true; fallback = false; var ticket = ++generation;
      var wrap = root.querySelector('.grid-wrap'); scroll = wrap ? { left: wrap.scrollLeft, top: wrap.scrollTop } : null;
      ['role','aria-modal','aria-label'].forEach(function (name) { attributes[name] = root.getAttribute(name); });
      root.setAttribute('role','dialog'); root.setAttribute('aria-modal','true'); root.setAttribute('aria-label','Task rows — expanded editor');
      root.classList.add('plan-expanded'); document.documentElement.classList.add('plan-fullscreen-open');
      // The original form and unsaved data stay in place. Only the surrounding UI is inactive.
      for (var node = root; node.parentElement && node !== document.body; node = node.parentElement) {
        Array.from(node.parentElement.children).forEach(function (sibling) {
          if (sibling !== node && !/^(SCRIPT|STYLE|LINK)$/.test(sibling.tagName)) {
            background.push([sibling, sibling.hasAttribute('inert')]); sibling.setAttribute('inert','');
          }
        });
      }
      document.addEventListener('fullscreenchange', fullscreenChanged);
      document.addEventListener('keydown', keydown, true);
      observer = new MutationObserver(function () { if (!root.isConnected) destroy(); });
      observer.observe(document.body, { childList: true, subtree: true });
      sync(); root.querySelector('[data-fullscreen]').focus({ preventScroll: true });
      // Call directly in the click gesture; denial is a supported expanded-window fallback.
      try {
        if (!root.requestFullscreen) throw new Error('Fullscreen unavailable');
        Promise.resolve(root.requestFullscreen()).then(function () {
          if (!expanded || generation !== ticket || !root.isConnected) {
            if ((!expanded || !root.isConnected) && fullscreenOwners.get(root) === control) exitNative().catch(function () {});
            return;
          }
          nativeActive = document.fullscreenElement === root; fallback = !nativeActive; sync();
        }).catch(function () { if (expanded && generation === ticket) { fallback = true; sync(); } });
      } catch (e) { fallback = true; sync(); }
    }
    function destroy() { restore(false); exitNative().catch(function () {}); }
    var control = { sync: sync, toggle: function () { return expanded ? leave() : enter(); }, leave: leave, destroy: destroy };
    fullscreenOwners.set(root, control); return control;
  }
  function mount(root, options) {
    var rows = options.rows.map(function (r) { return Object.assign({schedule_mode:'fixed',schedule_gap_minutes:0}, r); });
    var base = options.base, readonly = !!options.readonly, advanced = !!options.timingOnly, filter = options.timingOnly ? 'all' : 'process', page = 0, pageSize = 20;
    var scheduler = window.TK.scheduler, shiftScope = 'stream', shiftTimes = true, issues = [];
    if (scheduler && !readonly) issues = scheduler.recalculate(rows);
    var fullscreen = fullscreenControls(root, readonly);
    function matches(r) { return filter === 'all' || (filter === 'lab' ? isLab(r) : !isLab(r)); }
    function showRow(index) {
      var visible = rows.map(function (r, i) { return matches(r) ? i : -1; }).filter(function (i) { return i >= 0; });
      page = Math.max(0, Math.floor(visible.indexOf(index) / pageSize));
    }
    function isLab(r) { return r.kind === 'lab' || r.kind === 'lab_gate'; }
    var spreadsheet = null;
    function changed() { if (spreadsheet) spreadsheet.record(); if (options.onChange) options.onChange(); }
    function opts(map, selected) { return Object.keys(map).map(function (key) { return '<option value="' + esc(key) + '"' + (key === selected ? ' selected' : '') + '>' + esc(map[key]) + '</option>'; }).join(''); }
    function pull() {
      var edits = [];
      root.querySelectorAll('tr[data-row]').forEach(function (tr) {
        var row = rows[+tr.dataset.row], before = Object.assign({}, row);
        tr.querySelectorAll('[data-field]').forEach(function (el) {
          if (el.dataset.field === 'date') {
            var displayed = row.suggested_offset_minutes == null ? '' : local(Date.parse(base) + row.suggested_offset_minutes * 60000);
            if (el.value !== displayed) {
              var offset = el.value ? (Date.parse(el.value) - Date.parse(base)) / 60000 : null;
              row.suggested_offset_minutes = offset == null || options.preciseDates ? offset : Math.round(offset);
            }
          }
          else if (el.dataset.field === 'duration_hours') row._durationHours = el.value;
          else if (el.dataset.field === 'duration_minutes') row._durationMinutes = el.value;
          else if (el.dataset.field === 'schedule_gap_minutes') row.schedule_gap_minutes = el.value === '' ? 0 : Number(el.value);
          else row[el.dataset.field] = el.value;
        });
        if (row._durationHours !== undefined) row.planned_duration_minutes = window.TK.duration.read(row._durationHours, row._durationMinutes);
        if (before.kind !== row.kind) {
          if (row.kind !== 'work' && row.kind !== 'cleaning') row.photos = 'none';
          else if (row.photos === 'none') row.photos = 'both';
        }
        if (before.suggested_offset_minutes !== row.suggested_offset_minutes || before.planned_duration_minutes !== row.planned_duration_minutes) edits.push({i:+tr.dataset.row,before:before});
      });
      if (scheduler && !readonly) {
        edits.forEach(function (e) {
          if (shiftTimes) scheduler.edit(rows,e.i,e.before,shiftScope);
          else if (rows[e.i].suggested_offset_minutes !== e.before.suggested_offset_minutes) { rows[e.i].schedule_mode='fixed';rows[e.i].schedule_gap_minutes=0; }
        });
        issues=scheduler.recalculate(rows);
        // Reconcile visible fields so the next read cannot undo cascading updates.
        root.querySelectorAll('tr[data-row]').forEach(function(tr){
          var r=rows[+tr.dataset.row],date=tr.querySelector('[data-field="date"]'),mode=tr.querySelector('[data-field="schedule_mode"]'),gap=tr.querySelector('[data-field="schedule_gap_minutes"]');
          if(date)date.value=r.suggested_offset_minutes==null?'':local(Date.parse(base)+r.suggested_offset_minutes*60000);
          if(mode)mode.value=r.schedule_mode || 'fixed';if(gap)gap.value=r.schedule_gap_minutes || 0;
          var finish=tr.querySelector('[data-finish]'),end=scheduler.end(r);
          if(finish)finish.textContent=end==null?'Finish: set start and duration':'Finish: '+local(Date.parse(base)+end*60000).replace('T',' ');
        });
        var message=root.querySelector('[data-timing-msg]');if(message)message.textContent=issues.length ? issues.length+' start time(s) need setup. '+issues[0] : 'Planned times are up to date. Save to keep these changes.';
      }
      return rows;
    }
    function render() {
      if (scheduler && !readonly) issues=scheduler.recalculate(rows);
      var visibleRows = rows.map(function (r, i) { return matches(r) ? i : -1; }).filter(function (i) { return i >= 0; });
      var pages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
      page = Math.max(0, Math.min(page, pages - 1));
      var shown = new Set(visibleRows.slice(page * pageSize, (page + 1) * pageSize));
      var pager = '<div class="plan-toolbar" aria-label="Task pages"><button type="button" class="btn sm" data-page="-1"' + (!page ? ' disabled' : '') + '>Previous</button><span>Page ' + (page + 1) + ' of ' + pages + ' · ' + visibleRows.length + ' tasks</span><button type="button" class="btn sm" data-page="1"' + (page === pages - 1 ? ' disabled' : '') + '>Next</button></div>';
      var cps = { '': '—' };
      (options.checkpoints || []).forEach(function (c) { cps[c.code] = c.code + ' · ' + c.name; });
      rows.forEach(function (r) { if (r.lab_checkpoint && !cps[r.lab_checkpoint]) cps[r.lab_checkpoint] = r.lab_checkpoint; });
      var pileCount = new Set(rows.filter(function (r) { return r.pile; }).map(function (r) { return r.pile; })).size;
      root.classList.toggle('timing-only',!!options.timingOnly);
      root.innerHTML = (scheduler && !readonly ? '<div class="timing-setup"><div class="row"><label class="small"><input type="checkbox" data-shift-times'+(shiftTimes?' checked':'')+'> Shift following timings when I edit</label><label class="small">Apply to <select data-shift-scope><option value="stream"'+(shiftScope==='stream'?' selected':'')+'>Same stream / pile</option><option value="batch"'+(shiftScope==='batch'?' selected':'')+'>Every later row</option></select></label><button type="button" class="btn sm" data-link-timing>Use durations for following tasks</button></div><p class="muted small">' + (options.durationReadonly ? 'Standard hours come from the separate Process Time SOP. Here, set task order and start timing rules.' : 'Use factory Process Time SOP durations or override this batch’s hours and minutes.') + ' The first task of each stream needs a start date; following tasks can start at the previous planned finish. Blank duration means unknown, not zero.</p><div class="small" data-timing-msg role="status">'+esc(issues.length ? issues.length+' start time(s) need setup. '+issues[0] : 'Changing the batch start moves its whole plan. These are suggestions, not task-start gates.')+'</div></div>' : '') + '<div class="tabs" role="tablist" aria-label="SOP task views">' + [['process','Process'],['lab','Lab'],['all','All tasks']].map(function (f) {
        var count = rows.filter(function (r) { return f[0] === 'all' || (f[0] === 'lab' ? isLab(r) : !isLab(r)); }).length;
        return '<button type="button" role="tab" aria-selected="' + (filter === f[0]) + '" class="tab' + (filter === f[0] ? ' on' : '') + '" data-filter="' + f[0] + '">' + f[1] + ' (' + count + ')</button>';
      }).join('') + '</div><p class="muted small plan-help">One master sequence. Numbers stay the same across Process and Lab; gaps belong to the other tab.</p>' +
        (!readonly && options.allowPileResize !== false ? '<div class="pile-setup"><label for="turnerPileCount">Turner piles</label><input id="turnerPileCount" type="number" min="1" max="50" value="' + (pileCount || 6) + '"><button type="button" class="btn sm" data-piles>Set pile count</button><span class="muted small">Each pile has its own passes, Lab checks, times and photos. If you change the count, review the later bunker pairings.</span><div data-grid-msg></div></div>' : '') +
        '<div class="plan-toolbar plan-controls"><span class="muted">' + rows.length + ' rows in the master sequence</span><div class="row"><button type="button" class="btn sm" data-fullscreen aria-pressed="false">Full screen</button><label class="small"><input type="checkbox" data-advanced' + (advanced ? ' checked' : '') + '> Task settings</label></div></div>' +
        pager + '<div class="grid-wrap"><table class="sop calendar-grid' + (advanced ? ' settings' : '') + '"><thead><tr><th>#</th><th>Suggested start / finish</th><th>Process / task</th><th>Stream</th><th>Description</th><th>Lab / control</th><th>Planned duration</th>' + (advanced ? '<th class="setting timing-rule">Start timing</th><th class="setting timing-rule">Extra wait (minutes)</th><th class="setting">Report section (optional)</th><th class="setting">Type</th><th class="setting">Lab checkpoint</th><th class="setting">Photos</th><th class="setting">Ask for</th>' : '') + (readonly ? '' : '<th>Row</th>') + '</tr></thead><tbody>' +
        rows.map(function (r, i) {
          if (!shown.has(i)) return '';
          var locked = readonly || !!r._locked;
          var date = r.suggested_offset_minutes == null ? '' : local(Date.parse(base) + r.suggested_offset_minutes * 60000);
          var finish = scheduler ? scheduler.end(r) : null;
          var field = function (key, val, type) { return locked ? esc(val) : '<input type="' + (type || 'text') + '" data-field="' + key + '" aria-label="Row ' + (i + 1) + ' ' + key + '" value="' + esc(val) + '">'; };
          var select = function (key, map) { return locked ? esc(map[r[key]]) : '<select data-field="' + key + '" aria-label="Row ' + (i + 1) + ' ' + key + '">' + opts(map, r[key]) + '</select>'; };
          return '<tr data-row="' + i + '" class="' + (r.kind === 'lab_gate' ? 'gate' : '') + '"><td class="n">' + (i + 1) + '</td><td>' +
            (locked ? esc(date.replace('T', ' ') || 'Set when ready') : field('date', date, 'datetime-local')) + (scheduler ? '<div class="small muted" data-finish>' + (finish == null ? 'Finish: set start and duration' : 'Finish: '+local(Date.parse(base)+finish*60000).replace('T',' ')) + '</div>' : '') + '</td><td>' + field('title', r.title) +
            (r._locked ? '<span class="small gate-label">Recorded work · protected</span>' : '') +
            (r.kind === 'lab_gate' ? '<span class="small gate-label">Lab → GM approval</span>' : '') +
            (r.pile ? '<span class="small gate-label">Pile ' + esc(r.pile) + ' · ' + esc(r.turner_pass.replace(/_/g, ' ')) + '</span>' : '') + '</td><td>' + (r.pile ? esc(r.line) : field('line', r.line)) + '</td><td>' +
            (locked ? esc(r.description) : '<textarea rows="2" data-field="description" aria-label="Row ' + (i + 1) + ' description">' + esc(r.description) + '</textarea>') + '</td><td>' +
            (locked ? esc(r.control) : '<textarea rows="2" data-field="control" aria-label="Row ' + (i + 1) + ' lab / control">' + esc(r.control) + '</textarea>') +
            '</td><td class="duration-cell">' + (locked || options.durationReadonly ? (window.TK.duration.label(r.planned_duration_minutes) || 'Not set') + (options.durationReadonly && !locked ? '<div class="muted small">Process Time SOP</div>' : '') :
              '<div class="duration-input"><label>Hours<input type="number" min="0" max="8760" step="1" data-field="duration_hours" aria-label="Row ' + (i+1) + ' planned hours" value="' + esc(r._durationHours !== undefined ? r._durationHours : r.planned_duration_minutes == null ? '' : Math.floor(r.planned_duration_minutes / 60)) + '"></label>' +
              '<label>Minutes<input type="number" min="0" max="59" step="1" data-field="duration_minutes" aria-label="Row ' + (i+1) + ' planned minutes" value="' + esc(r._durationMinutes !== undefined ? r._durationMinutes : r.planned_duration_minutes == null ? '' : r.planned_duration_minutes % 60) + '"></label></div>') + '</td>' +
            (advanced ? '<td class="setting timing-rule">' + select('schedule_mode', {fixed:'Set date / batch-start offset',stream:'After previous in stream / pile',batch:'After previous row in batch'}) + '</td><td class="setting timing-rule">' + field('schedule_gap_minutes',r.schedule_gap_minutes,'number') + '</td><td class="setting">' + field('report_section', r.report_section) + '</td><td class="setting">' + select('kind', kinds) + '</td><td class="setting">' + select('lab_checkpoint', cps) + '</td><td class="setting">' + select('photos', photos) + '</td><td class="setting">' + select('ask', asks) + '</td>' : '') +
            (readonly ? '' : '<td class="acts">' + [['up','↑','Move up'],['down','↓','Move down'],['copy','⧉','Duplicate'],['insert','+','Insert below'],['delete','×','Remove']].map(function (a) { return '<button type="button" data-action="' + a[0] + '" aria-label="' + a[2] + ' row ' + (i + 1) + '" title="' + a[2] + '"' + ((r._locked && ['up','down','delete'].indexOf(a[0]) !== -1 || a[0] === 'up' && i === 0 || a[0] === 'down' && i === rows.length - 1) ? ' disabled' : '') + '>' + a[1] + '</button>'; }).join(' ') + '</td>') + '</tr>';
        }).join('') + '</tbody></table></div>' + pager + (readonly ? '' : '<div class="row" style="margin-top:12px"><button type="button" class="btn" data-add="Main">+ Add process task</button><button type="button" class="btn" data-add="Lab">+ Add Lab task</button><button type="button" class="btn" data-add="Cleaning">+ Add cleaning task</button></div>') +
        '<p class="muted small plan-help">All tasks can start independently; row numbers and dates are guidance, not gates. Planned duration calculates the report’s planned end; leave it blank if unknown. Report sections (under Task settings) add headings only. Lab approvals are recorded without blocking other tasks.</p>' +
        '<div class="plan-fullscreen-footer" data-fullscreen-footer hidden><span class="muted small" data-fullscreen-hint role="status"></span><button type="button" class="btn pri sm" data-fullscreen-back>Back to editor</button></div>';
      root.querySelector('[data-fullscreen]').onclick = fullscreen.toggle;
      root.querySelector('[data-fullscreen-back]').onclick = fullscreen.leave;
      fullscreen.sync();
      var scopeInput=root.querySelector('[data-shift-scope]'),shiftInput=root.querySelector('[data-shift-times]'),linkButton=root.querySelector('[data-link-timing]');
      if(scopeInput)scopeInput.onchange=function(){pull();shiftScope=scopeInput.value;};
      if(shiftInput){shiftInput.parentElement.lastChild.textContent=' Shift following manual dates too';shiftInput.onchange=function(){pull();shiftTimes=shiftInput.checked;};}
      if(linkButton)linkButton.onclick=function(){
        pull();
        if(!window.confirm('Rebuild following start times from the durations '+(shiftScope==='batch'?'in the whole batch':'within each stream / pile')+'? Keep a starting date for each chain, including bagasse wetting. Missing durations will need to be filled before saving this batch or publishing the template. Recorded work stays unchanged.'))return;
        issues=scheduler.link(rows,shiftScope);render();changed();
      };
      root.querySelector('[data-advanced]').onchange = function (e) { pull(); advanced = e.target.checked; render(); };
      root.querySelectorAll('[data-filter]').forEach(function (b) { b.onclick = function () { pull(); filter = b.dataset.filter; page = 0; render(); }; });
      root.querySelectorAll('[data-page]').forEach(function (b) { b.onclick = function () { pull(); page += Number(b.dataset.page); render(); }; });
      var pileButton = root.querySelector('[data-piles]');
      if (pileButton) pileButton.onclick = function () {
        pull(); var count = Number(root.querySelector('#turnerPileCount').value);
        try {
          if (count < pileCount && !window.confirm('Remove the unsaved Turner rows for piles above P' + count + '?')) return;
          rows = window.TK.turnerPlan.resize(rows, count); render(); changed();
        } catch (e) { root.querySelector('[data-grid-msg]').textContent = e.message; }
      };
      root.querySelectorAll('[data-field]').forEach(function (el) {
        el.onkeydown = function (e) {
          if (e.key !== 'Enter' || el.tagName === 'TEXTAREA') return;
          e.preventDefault();
          var visible = Array.from(root.querySelectorAll('tr[data-row]'));
          var next = visible.indexOf(el.closest('tr')) + (e.shiftKey ? -1 : 1);
          var target = visible[next] && visible[next].querySelector('[data-field="' + el.dataset.field + '"]');
          if (target) target.focus();
          else if (next < 0 && page > 0 || next >= visible.length && page < pages - 1) {
            var field = el.dataset.field; pull(); page += e.shiftKey ? -1 : 1; render();
            var nextPage = Array.from(root.querySelectorAll('tr[data-row]'));
            var row = nextPage[e.shiftKey ? nextPage.length - 1 : 0];
            if (row) { var cell = row.querySelector('[data-field="' + field + '"]'); if (cell) cell.focus(); }
          }
        };
        el.oninput = changed;
        el.onchange = function () {
          if (['date','duration_hours','duration_minutes','schedule_mode','schedule_gap_minutes','line'].indexOf(el.dataset.field)!==-1) pull();
          if (el.dataset.field === 'kind') {
            pull(); var row = rows[+el.closest('tr').dataset.row];
            if (row.kind !== 'work' && row.kind !== 'cleaning') row.photos = 'none';
            render();
          }
          changed();
        };
      });
      root.querySelectorAll('[data-action]').forEach(function (button) {
        button.onclick = function () {
          pull(); var i = +button.closest('tr').dataset.row, action = button.dataset.action, row = rows[i];
          if (row._locked && ['up', 'down', 'delete'].indexOf(action) !== -1) return;
          if (action === 'up' && i > 0) { rows.splice(i, 1); rows.splice(i - 1, 0, row); }
          if (action === 'down' && i < rows.length - 1) { rows.splice(i, 1); rows.splice(i + 1, 0, row); }
          if (action === 'copy') rows.splice(i + 1, 0, fresh(row));
          if (action === 'insert') { var inserted = row.pile ? Object.assign(fresh(row), { title: '', description: '', suggested_offset_minutes: null }) : blank(row.line); if (filter === 'lab') { inserted.kind = 'lab'; inserted.photos = 'none'; } rows.splice(i + 1, 0, inserted); }
          if (action === 'delete') rows.splice(i, 1);
          if (action === 'copy' || action === 'insert' || action === 'down') showRow(i + 1);
          if (action === 'up') showRow(i - 1);
          render(); changed();
        };
      });
      root.querySelectorAll('[data-add]').forEach(function (button) {
        button.onclick = function () { pull(); var row = blank(button.dataset.add); if (row.line === 'Cleaning') row.kind = 'cleaning'; if (row.line === 'Lab') { row.line = 'Main'; row.kind = 'lab'; row.photos = 'none'; filter = 'lab'; } else filter = 'process'; rows.push(row); showRow(rows.length - 1); render(); changed(); root.querySelector('tr:last-child [data-field="title"]').focus(); };
      });
      if (spreadsheet) spreadsheet.wire();
    }
    // A duplicate is a new planned task, never a second reference to recorded work.
    function fresh(row) {
      var out = {};
      ['line','h_ref','title','kind','control','photos','ask','lab_checkpoint','description','pile','turner_pass','suggested_offset_minutes','planned_duration_minutes','report_section','schedule_mode','schedule_gap_minutes','_durationHours','_durationMinutes'].forEach(function (key) { out[key] = row[key]; });
      return out;
    }
    if (!readonly && window.TK.spreadsheetGrid) spreadsheet = window.TK.spreadsheetGrid.create(root, {
      snapshot: function () { return {rows:rows.map(function (row) {
        var saved=Object.assign({},row); delete saved._durationHours; delete saved._durationMinutes; return saved;
      }),base:base}; }, sync:pull, render:render, changed:changed,
      restore: function (state) { rows=state.rows; base=state.base; render(); }
    });
    render();
    return {
      read: function () { return pull().map(function (r) { return Object.assign({}, r); }); },
      setPlannedStarts: function (updates) {
        if (readonly) return 0;
        pull(); var count = 0;
        (updates || []).forEach(function (update) {
          var row = rows[update.index];
          if (!row || row._locked || !Number.isFinite(update.start)) return;
          row.suggested_offset_minutes = (update.start-Date.parse(base))/60000;
          row.schedule_mode = 'fixed'; row.schedule_gap_minutes = 0; count++;
        });
        if (count) { render(); changed(); }
        return count;
      },
      setBase: function (at) { pull(); base = at; render(); },
      append: function (added) { pull(); rows = rows.concat(added); render(); changed(); },
      validate: function (requireSchedule) {
        pull(); if (!rows.length) throw new Error('Add at least one task.');
        rows.forEach(function (r, i) { if (!r.title.trim()) throw new Error('Give row ' + (i + 1) + ' a task name, or remove it.'); });
        rows.forEach(function (r, i) {
          if (r.planned_duration_minutes != null && (!Number.isInteger(r.planned_duration_minutes) || r.planned_duration_minutes < 0 || r.planned_duration_minutes > 525600)) throw new Error('Row ' + (i+1) + ': enter whole hours and 0–59 minutes (up to one year), or leave both blank.');
          if ((r.report_section || '').length > 200) throw new Error('Row ' + (i+1) + ': shorten the report section to 200 characters.');
          var gap=r.schedule_gap_minutes==null?0:r.schedule_gap_minutes;
          if (!Number.isInteger(gap) || Math.abs(gap)>525600) throw new Error('Row '+(i+1)+': extra wait must be whole minutes within one year.');
        });
        if(requireSchedule!==false && issues.length)throw new Error('Complete Admin timing setup first. '+issues[0]+' You can set a date manually to make a new starting point.');
      }
    };
  }
  window.TK.scheduleGrid = { mount: mount };
})();
