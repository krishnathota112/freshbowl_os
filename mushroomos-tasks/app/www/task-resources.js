/* Crew and registered-machine observations on a task. Blank is unknown, not zero. */
(function () {
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function num(v, label) {
    var raw = String(v == null ? '' : v).trim();
    if (raw === '') return null;
    var n = Number(raw);
    if (!/^\d+(?:\.\d{1,3})?$/.test(raw) || !Number.isFinite(n) || n > 999999999) throw new Error(label + ' must be a non-negative km reading, with up to three decimals.');
    return n;
  }
  function machineRow(machines, saved) {
    saved = saved || {};
    var chosen = saved.machine_id || '';
    var machine = machines.find(function (m) { return m.id === chosen; });
    var options = '<option value="">Choose machine…</option>' + machines.filter(function (m) { return m.active || m.id === chosen; }).map(function (m) {
      return '<option value="' + esc(m.id) + '"' + (m.id === chosen ? ' selected' : '') + '>' + esc(m.name) + ' · ' + (m.kind === 'heavy_machine' ? 'heavy machine' : 'machine') + (m.active ? '' : ' (inactive)') + '</option>';
    }).join('');
    function picture(which, title) {
      var id = saved[which + '_photo_id'] || '';
      return '<label class="shoot' + (id ? ' done' : '') + ' task-meter-photo"><span class="ms">photo_camera</span><span data-photo-text>' + (id ? title + ' ✓ (tap to replace)' : title) + '</span>' +
        '<input type="file" accept="image/*" capture="environment" data-meter-photo="' + which + '" data-photo-id="' + esc(id) + '"></label>';
    }
    return '<div class="resource-machine" data-resource-machine><div class="row"><select class="grow" data-machine-id aria-label="Machine">' + options + '</select>' +
      '<button class="btn sm" type="button" data-remove-machine aria-label="Remove machine">Remove</button></div>' +
      '<div class="resource-meter"' + (machine && machine.has_odometer ? '' : ' hidden') + '><p class="muted small">Odometer in km. A reading needs its matching photo. Both readings calculate kilometres used; a single reading stays partial.</p>' +
      '<div class="resource-meter-grid"><div><label class="lbl">Start odometer (km)</label><input type="number" min="0" max="999999999" step="0.001" inputmode="decimal" data-meter="start" value="' + esc(saved.odometer_start_km) + '">' + picture('start', 'Start odometer photo') + '</div>' +
      '<div><label class="lbl">End odometer (km)</label><input type="number" min="0" max="999999999" step="0.001" inputmode="decimal" data-meter="end" value="' + esc(saved.odometer_end_km) + '">' + picture('end', 'End odometer photo') + '</div></div></div></div>';
  }
  function summary(saved) {
    if (!saved) return '<p class="muted small">No crew or machine use recorded yet.</p>';
    var text = '<p class="small"><b>Labour:</b> ' + (saved.labour_count == null ? 'not recorded' : esc(saved.labour_count)) + '</p>';
    (saved.machines || []).forEach(function (m) {
      text += '<p class="small"><b>' + esc(m.machine_name || 'Machine') + '</b> · ' + (m.machine_kind === 'heavy_machine' ? 'heavy machine' : 'machine') +
        (m.distance_km == null ? ' · km not calculated' : ' · ' + esc(m.distance_km) + ' km') + '</p>';
    });
    return text;
  }
  function render(machines, saved, editable) {
    var h = '<div class="card" id="resourceCard"><div class="caps">Labour & machines</div>' + summary(saved);
    if (!editable) return h + '</div>';
    h += '<p class="muted small">Enter the crew actually on this task. Leave blank if unknown; 0 means none. Machine readings are optional for equipment without an odometer.</p>' +
      '<label class="lbl" for="crewCount">Labour count</label><input id="crewCount" type="number" min="0" max="10000" step="1" inputmode="numeric" value="' + esc(saved ? saved.labour_count : null) + '">' +
      '<div class="caps" style="margin-top:16px">Machines used on this task</div><div id="resourceMachines" class="stack">' +
      (saved && saved.machines || []).map(function (m) { return machineRow(machines, m); }).join('') + '</div>' +
      '<button class="btn sm" type="button" id="addResourceMachine"' + (machines.some(function (m) { return m.active; }) ? '' : ' disabled') + '>+ Add machine</button>' +
      (machines.some(function (m) { return m.active; }) ? '' : '<p class="muted small">Admin needs to add an active machine to the machine list.</p>') +
      '<p class="muted small">Save while the task is running to keep a start reading. Finish also saves these fields with the task. Corrections after finishing create a new record; earlier entries remain in history.</p>' +
      '<button class="btn full" id="resourceSaveB" type="button">Save labour & machines</button><div class="small" role="status" id="resourceStatus"></div></div>';
    return h;
  }
  function read(root, machines) {
    var crewEl = root.querySelector('#crewCount');
    if (!crewEl) return { labour_count:null, machines:[] };
    var raw = crewEl.value.trim(), labour = raw === '' ? null : Number(raw);
    if (labour !== null && (!Number.isInteger(labour) || labour < 0 || labour > 10000)) throw new Error('Labour count must be a whole number from 0 to 10000.');
    var used = new Set(), entries = [];
    root.querySelectorAll('[data-resource-machine]').forEach(function (row) {
      var id = row.querySelector('[data-machine-id]').value;
      if (!id) throw new Error('Choose a machine or remove the empty row.');
      if (used.has(id)) throw new Error('List each machine only once per task.');
      used.add(id);
      var machine = machines.find(function (m) { return m.id === id; });
      if (!machine) throw new Error('The chosen machine is not in the machine list. Refresh this task.');
      var item = { machine_id:id };
      if (machine.has_odometer) {
        ['start','end'].forEach(function (which) {
          var value = num(row.querySelector('[data-meter="' + which + '"]').value, which === 'start' ? 'Start odometer' : 'End odometer');
          var photo = row.querySelector('[data-meter-photo="' + which + '"]').dataset.photoId || null;
          if (value !== null && !photo) throw new Error('Take the ' + which + ' odometer photo for ' + machine.name + '.');
          item['odometer_' + which + '_km'] = value;
          item[which + '_photo_id'] = photo;
        });
        if (item.odometer_start_km !== null && item.odometer_end_km !== null && item.odometer_end_km < item.odometer_start_km)
          throw new Error('End odometer cannot be below start odometer for ' + machine.name + '.');
      }
      entries.push(item);
    });
    return { labour_count:labour, machines:entries };
  }
  function wire(root, machines, api, task, onError, savedRevision) {
    var card = root.querySelector('#resourceCard'), uploads = 0, expectedRevision = savedRevision == null ? null : savedRevision;
    if (!card || !card.querySelector('#crewCount')) return { read:function () { return { labour_count:null, machines:[] }; }, busy:function () { return false; }, expected:function () { return expectedRevision; } };
    card.querySelector('#addResourceMachine').onclick = function () {
      var box = card.querySelector('#resourceMachines');
      if (box.children.length >= 20) return onError(new Error('At most 20 machines can be listed on one task.'));
      box.insertAdjacentHTML('beforeend', machineRow(machines, {}));
    };
    card.addEventListener('click', function (e) {
      var b = e.target.closest('[data-remove-machine]'); if (b) b.closest('[data-resource-machine]').remove();
    });
    card.addEventListener('change', function (e) {
      var el = e.target;
      if (el.matches('[data-machine-id]')) {
        var machine = machines.find(function (m) { return m.id === el.value; });
        el.closest('[data-resource-machine]').querySelector('.resource-meter').hidden = !(machine && machine.has_odometer);
      }
      if (!el.matches('[data-meter-photo]')) return;
      var file = el.files && el.files[0]; if (!file) return;
      var label = el.closest('.shoot'), status = label.querySelector('[data-photo-text]');
      el.disabled = true; uploads++; status.textContent = 'Uploading odometer photo…';
      api.addPhoto(task.batch_id, task.id, 'other', file).then(function (id) {
        el.dataset.photoId = id; label.classList.add('done'); status.textContent = 'Odometer photo saved ✓';
      }).catch(function (error) { status.textContent = 'Upload not confirmed — retry'; onError(error); })
        .finally(function () { el.disabled = false; el.value = ''; uploads--; });
    });
    return { read:function () { return read(card, machines); }, busy:function () { return uploads > 0; },
      expected:function () { return expectedRevision; }, saved:function (id) { expectedRevision = id; } };
  }
  window.TK = window.TK || {};
  window.TK.taskResources = { render:render, read:read, wire:wire, machineRow:machineRow };
})();
