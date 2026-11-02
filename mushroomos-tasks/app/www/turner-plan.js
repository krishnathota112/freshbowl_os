/* Turner-only pile tasks. Each row owns its own time, evidence and Lab results. */
(function () {
  var steps = [
    ['T0', 'T0', 'work', '', 'First Turner pass. Take before and after photos for this pile. No Lab after T0.'],
    ['LAB_BEFORE_T1', 'Lab before T1', 'lab', 'LAB-T1-PRE', 'Sample this pile before its T1 pass.'],
    ['T1', 'T1', 'work', '', 'Record this pile’s T1 pass and its own before and after photos.'],
    ['LAB_AFTER_T1', 'Lab after T1', 'lab', 'LAB-T1-POST', 'Record post-T1 moisture for this pile.'],
    ['REST', 'Rest after T1', 'rest', '', 'Allow this pile its own 8-hour rest after T1 before starting T2.'],
    ['T2', 'T2', 'work', '', 'After this pile’s rest. Take before and after photos. No Lab after T2.'],
    ['T3', 'T3', 'work', '', 'Final Turner pass for this pile. Take before and after photos. No Lab after T3.']
  ];
  function pileRows(pile) {
    return steps.map(function (s) {
      return { line: 'Turner · ' + pile, pile: pile, turner_pass: s[0], title: pile + ' · ' + s[1], kind: s[2],
        lab_checkpoint: s[3], description: s[4], control: s[2] === 'lab' ? 'Use this checkpoint’s readings for ' + pile + '.' : '',
        photos: s[2] === 'work' ? 'both' : 'none', ask: s[2] === 'work' ? 'machine' : 'none', suggested_offset_minutes: null };
    });
  }
  function resize(rows, count) {
    if (!Number.isInteger(count) || count < 1 || count > 50) throw new Error('Choose between 1 and 50 Turner piles.');
    var byPile = {}, rest = [], first = -1;
    rows.forEach(function (r) {
      if (r.pile) { if (first < 0) first = rest.length; (byPile[r.pile] = byPile[r.pile] || []).push(r); }
      else rest.push(r);
    });
    if (first < 0) { first = rest.findIndex(function (r) { return /^Turner start$/i.test(r.title); }); first = first < 0 ? rest.length : first + 1; }
    var added = [];
    for (var n = 1; n <= count; n++) added = added.concat(byPile['P' + n] || pileRows('P' + n));
    rest.splice.apply(rest, [first, 0].concat(added));
    return rest;
  }
  // Preview the fuller standard while its additive database update is pending.
  function completeTemplate(originals) {
    var labs = [
      [1,1,'Raw material / bagasse Lab check','LAB-RM-01','Moisture, pH, EC, dry weight; advisory.'],
      [2,1,'Lab after Hopper Pass 1','LAB-WET-01','Moisture, pH, EC.'],
      [4,1,'Lab after Hopper Pass 2','LAB-WET-02','Moisture, pH, EC.'],
      [9,1,'Paddy weighment Lab check','LAB-PDY-WGH','Moisture + dry weight.'],
      [10,1,'Paddy soak 1 — pit water Lab check','LAB-PDY-S1','pH, EC, TDS.'],
      [11,-2,'Bunker unloading Lab check','LAB-UNL-01','Moisture, pH, EC.'],
      [11,1,'Bunker reloading Lab check','LAB-RLD-01','Moisture, pH, EC.'],
      [12,1,'Paddy soak 2 — pit water Lab check','LAB-PDY-S2','pH, EC, TDS.'],
      [13,1,'Chicken manure arrival Lab check','LAB-CM-ARR','Nitrogen, ash.'],
      [18,-1,'Lab before water hopper passes','LAB-HOP-PRE','Moisture and temperature before the hopper passes.'],
      [23,-1,'Pre-Turner Lab check','LAB-PRE-T','Pre-Turner readings from the Lab register.'],
      [29,-1,'Lab gate — Bunker 1 fill','LAB-BNK-LOAD','Height, moisture and full loading set; P1 + P2.',true],
      [30,-1,'Lab gate — Bunker 2 fill','LAB-BNK-LOAD','Height, moisture and full loading set; P3 + P4.',true],
      [31,-1,'Lab gate — Bunker 3 fill','LAB-BNK-LOAD','Height, moisture and full loading set; P5 + P6.',true],
      [32,-1,'Lab before Bunker 1 reload','LAB-RLD2-UNL','Height, moisture and full unloading set.'],
      [32,1,'Lab after Bunker 1 reload','LAB-RLD2-RE','Height, moisture and full reloading set.'],
      [33,-1,'Lab before Bunker 2 reload','LAB-RLD2-UNL','Height, moisture and full unloading set.'],
      [33,1,'Lab after Bunker 2 reload','LAB-RLD2-RE','Height, moisture and full reloading set.'],
      [34,-1,'Lab before Bunker 3 reload','LAB-RLD2-UNL','Height, moisture and full unloading set.'],
      [34,1,'Lab after Bunker 3 reload','LAB-RLD2-RE','Height, moisture and full reloading set.'],
      [35,-1,'Tunnel readiness Lab check','LAB-TUN-PRE','Tunnel readiness before loading.'],
      [41,-1,'Final QC — first grow-room stream','LAB-QC-FINAL','Final QC for the first discharge stream.'],
      [42,-1,'Final QC — second discharge stream','LAB-QC-FINAL','Final QC as configured for this stream.'],
      [43,-1,'Final QC — final discharge stream','LAB-QC-FINAL','Final QC for full batch discharge.']
    ];
    var all = [];
    originals.forEach(function (r) {
      if (r.ord >= 24 && r.ord <= 28) return;
      var row = Object.assign({}, r, { sort: r.ord * 100 });
      if (r.kind !== 'lab' && r.kind !== 'lab_gate') { row.description = row.control; row.control = ''; }
      if (r.ord === 15) { row.kind = 'lab'; row.photos = 'none'; row.lab_checkpoint = 'LAB-MOIST-DEC'; row.control = r.control; }
      all.push(row);
    });
    labs.forEach(function (l) {
      var source = originals.find(function (r) { return r.ord === l[0]; });
      if (!source) return;
      all.push({ sort: l[0] * 100 + l[1], line: source.line, title: l[2], kind: l[5] ? 'lab_gate' : 'lab',
        lab_checkpoint: l[3], control: l[4], description: l[5] ? 'Lab submits; GM approves before the associated process task.' : 'Record this Lab result separately from the process task.',
        photos: 'none', ask: 'none', suggested_offset_minutes: source.suggested_offset_minutes });
    });
    for (var p=1;p<=6;p++) pileRows('P'+p).forEach(function (r,i) { r.sort=2400+(p-1)*10+i; all.push(r); });
    return all.sort(function (a,b) { return a.sort-b.sort; });
  }
  window.TK.turnerPlan = { pileRows: pileRows, resize: resize, completeTemplate: completeTemplate };
})();
