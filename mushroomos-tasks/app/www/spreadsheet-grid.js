/* Spreadsheet gestures for the existing plan editor. Saves still use its guarded RPCs. */
(function () {
  var owners = new WeakMap();
  function parse(text) {
    var rows = [], row = [], value = '', quoted = false;
    text = String(text).replace(/\r\n?/g, '\n');
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') { value += '"'; i++; }
        else if (quoted || !value) quoted = !quoted;
        else value += c;
      } else if (!quoted && (c === '\t' || c === '\n')) {
        row.push(value); value = '';
        if (c === '\n') { rows.push(row); row = []; }
      } else value += c;
    }
    if (quoted) throw new Error('The pasted range has an unclosed quoted cell.');
    row.push(value);
    if (row.length > 1 || row[0] || !rows.length) rows.push(row);
    return rows;
  }
  function encode(rows) {
    return rows.map(function (row) { return row.map(function (v) {
      v = String(v); return /[\t\n\r"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join('\t'); }).join('\n');
  }
  function create(root, options) {
    if (owners.has(root)) owners.get(root).destroy();
    var history = [JSON.stringify(options.snapshot())], position = 0, restoring = false;
    var anchor = null, focus = null, fields = [], rows = [];
    function cell(target) { return target && target.closest && target.closest('[data-field]'); }
    function coordinate(input) {
      if (!input || !root.contains(input)) return null;
      var tr = input.closest('tr[data-row]');
      return tr ? { r: rows.indexOf(tr), c: fields.indexOf(input.dataset.field) } : null;
    }
    function control(r, c) { return rows[r] && rows[r].querySelector('[data-field="' + fields[c] + '"]'); }
    function range() {
      if (!anchor || !focus) return null;
      return { r0: Math.min(anchor.r, focus.r), r1: Math.max(anchor.r, focus.r), c0: Math.min(anchor.c, focus.c), c1: Math.max(anchor.c, focus.c) };
    }
    function message(text, error) {
      var status = root.querySelector('[data-sheet-status]');
      if (status) { status.textContent = text; status.classList.toggle('error', !!error); }
    }
    function paint() {
      root.querySelectorAll('.sheet-selected').forEach(function (el) { el.classList.remove('sheet-selected'); });
      var box = range();
      if (box) {
        for (var r = box.r0; r <= box.r1; r++) for (var c = box.c0; c <= box.c1; c++) {
          var input = control(r, c); if (input) input.classList.add('sheet-selected');
        }
        message((box.r1 - box.r0 + 1) + ' rows × ' + (box.c1 - box.c0 + 1) + ' columns selected.');
      }
      var undo = root.querySelector('[data-sheet-undo]'), redo = root.querySelector('[data-sheet-redo]');
      if (undo) undo.disabled = position === 0;
      if (redo) redo.disabled = position === history.length - 1;
    }
    function record() {
      if (restoring) return;
      options.sync();
      var next = JSON.stringify(options.snapshot());
      if (history[position] === next) return;
      history = history.slice(0, position + 1); history.push(next);
      if (history.length > 60) history.shift();
      position = history.length - 1; paint();
    }
    function travel(delta) {
      record();
      var next = position + delta;
      if (next < 0 || next >= history.length) return;
      position = next; restoring = true;
      try { options.restore(JSON.parse(history[position])); options.changed(); }
      finally { restoring = false; }
      paint(); message(delta < 0 ? 'Undone. Save the plan to keep this version.' : 'Redone. Save the plan to keep this version.');
    }
    function selected() {
      var box = range(), out = [];
      if (!box) return out;
      for (var r = box.r0; r <= box.r1; r++) {
        var line = [];
        for (var c = box.c0; c <= box.c1; c++) { var input = control(r, c); line.push(input ? input.value : ''); }
        out.push(line);
      }
      return out;
    }
    function validate(input, value) {
      if (!input || input.disabled || input.readOnly) throw new Error('This range includes a protected cell. Recorded work cannot be changed.');
      if (input.tagName === 'SELECT' && !Array.from(input.options).some(function (o) { return o.value === value; })) throw new Error('Use a listed value for ' + input.dataset.field + '.');
      if (input.type === 'number' && value !== '') {
        var n = Number(value);
        if (!Number.isFinite(n) || !Number.isInteger(n) || input.min !== '' && n < Number(input.min) || input.max !== '' && n > Number(input.max)) throw new Error('Enter a valid whole number for ' + input.dataset.field + '.');
      }
      if (input.type === 'datetime-local' && value && !Number.isFinite(Date.parse(value))) throw new Error('Use a date and time such as 2026-11-03T08:00.');
    }
    function apply(matrix, fill) {
      var box = range(); if (!box) return;
      var changes = [], height = fill ? box.r1 - box.r0 + 1 : matrix.length;
      var width = fill ? box.c1 - box.c0 + 1 : Math.max.apply(null, matrix.map(function (r) { return r.length; }));
      if (box.r0 + height > rows.length || box.c0 + width > fields.length) throw new Error('The pasted range exceeds this page. Paste a smaller range or change the task page first.');
      for (var r = 0; r < height; r++) for (var c = 0; c < width; c++) {
        var value = fill ? matrix[0][c % matrix[0].length] : (matrix[r][c] === undefined ? '' : matrix[r][c]);
        var input = control(box.r0 + r, box.c0 + c); validate(input, value);
        changes.push([input, value]);
      }
      record();
      changes.forEach(function (entry) { entry[0].value = entry[1]; });
      options.sync(); options.changed(); options.render();
      message('Updated ' + changes.length + ' cells. Review and save the plan.');
    }
    function safely(fn) { try { fn(); } catch (error) { message(error.message, true); } }
    function down() {
      var data = selected();
      if (data.length < 2) throw new Error('Select at least two rows; the first row fills the rows below.');
      apply([data[0]], true);
    }
    function click(event) {
      var input = cell(event.target), at = coordinate(input);
      if (!at || at.r < 0 || at.c < 0) return;
      if (!event.shiftKey || !anchor) anchor = at;
      focus = at; paint();
    }
    function keydown(event) {
      if (!cell(event.target)) return;
      var command = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
      if (command && key === 'z') { event.preventDefault(); event.stopPropagation(); travel(event.shiftKey ? 1 : -1); return; }
      if (command && key === 'y') { event.preventDefault(); event.stopPropagation(); travel(1); return; }
      if (command && key === 'd') { event.preventDefault(); safely(down); return; }
      var current = coordinate(cell(event.target));
      if (event.shiftKey && /^Arrow/.test(event.key) && current) {
        if (!anchor) anchor = current;
        var next = { r: current.r + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0), c: current.c + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0) };
        var target = control(next.r, next.c);
        if (target) { event.preventDefault(); target.focus(); focus = next; paint(); }
      }
      var box = range();
      if (event.key === 'Delete' && box && (box.r0 !== box.r1 || box.c0 !== box.c1)) { event.preventDefault(); safely(function () { apply([['']], true); }); }
    }
    function copy(event) {
      if (!cell(event.target) || !range() || !event.clipboardData) return;
      event.preventDefault(); event.clipboardData.setData('text/plain', encode(selected()));
    }
    function paste(event) {
      if (!cell(event.target) || !event.clipboardData) return;
      var text = event.clipboardData.getData('text/plain'), box = range();
      if (!box) { anchor = focus = coordinate(cell(event.target)); box = range(); }
      if (!/[\t\n\r]/.test(text) && box.r0 === box.r1 && box.c0 === box.c1) return;
      event.preventDefault(); safely(function () { var values = parse(text); apply(values, values.length === 1 && values[0].length === 1); });
    }
    root.addEventListener('click', click);
    root.addEventListener('keydown', keydown, true);
    root.addEventListener('copy', copy);
    root.addEventListener('paste', paste);
    function wire() {
      rows = Array.from(root.querySelectorAll('tr[data-row]'));
      fields = [];
      rows.forEach(function (row) { row.querySelectorAll('[data-field]').forEach(function (input) { if (!fields.includes(input.dataset.field)) fields.push(input.dataset.field); }); });
      var table = root.querySelector('.grid-wrap');
      if (!table) return;
      var bar = document.createElement('div'); bar.className = 'sheet-toolbar';
      bar.innerHTML = '<button type="button" class="btn sm" data-sheet-undo>Undo</button><button type="button" class="btn sm" data-sheet-redo>Redo</button><button type="button" class="btn sm" data-sheet-fill>Fill down</button><span class="muted small">Shift-click or Shift+arrows selects a range · Ctrl+C/V copies/pastes · Ctrl+D fills down · Ctrl+Z undoes</span><span class="small" data-sheet-status role="status" aria-live="polite"></span>';
      table.before(bar);
      bar.querySelector('[data-sheet-undo]').onclick = function () { travel(-1); };
      bar.querySelector('[data-sheet-redo]').onclick = function () { travel(1); };
      bar.querySelector('[data-sheet-fill]').onclick = function () { safely(down); };
      if (!focus || focus.r >= rows.length || focus.c >= fields.length) anchor = focus = null;
      paint();
    }
    var owner = {record:record,wire:wire,destroy:function () {
      root.removeEventListener('click',click);root.removeEventListener('keydown',keydown,true);root.removeEventListener('copy',copy);root.removeEventListener('paste',paste);
    }};
    owners.set(root,owner); return owner;
  }
  window.TK.spreadsheetGrid = { create:create,parse:parse,encode:encode };
})();
