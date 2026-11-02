/* Factory-wide planned durations. These are standards, never observed task times. */
(function () {
  function normal(value) {
    return String(value == null ? '' : value).trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  }
  function key(row) {
    if (row.pile && row.turner_pass) return 'turner:' + normal(row.turner_pass);
    return ['task', normal(row.kind || 'work'), normal(row.line || 'Main'), normal(row.title)].join(':');
  }
  function catalog(rows) {
    var byKey = new Map();
    (rows || []).forEach(function (row) {
      if (!normal(row.title)) return;
      var id = key(row), duration = row.planned_duration_minutes == null ? null : Number(row.planned_duration_minutes);
      if (!byKey.has(id)) byKey.set(id, {
        process_key: id, title: row.pile && row.turner_pass ? row.title.trim().replace(/^P\d+\s*[·:-]\s*/i, '') : row.title.trim(),
        line: row.pile && row.turner_pass ? 'Turner · all piles' : row.line || 'Main', kind: row.kind || 'work',
        turner_pass: row.pile ? row.turner_pass || null : null,
        planned_duration_minutes: duration, occurrences: 0, conflicting: false
      });
      var item = byKey.get(id);
      if (item.planned_duration_minutes !== duration) item.conflicting = true;
      item.occurrences++;
    });
    return Array.from(byKey.values()).sort(function (a, b) {
      return a.line.localeCompare(b.line) || a.title.localeCompare(b.title) || a.kind.localeCompare(b.kind);
    });
  }
  function apply(rows, saved) {
    var byKey = new Map((saved || []).map(function (entry) { return [entry.process_key, entry]; }));
    return (rows || []).map(function (row) {
      var standard = byKey.get(key(row));
      return standard ? Object.assign({}, row, { planned_duration_minutes: standard.planned_duration_minutes }) : Object.assign({}, row);
    });
  }
  window.TK.processTimeSop = { key: key, catalog: catalog, apply: apply };
})();
