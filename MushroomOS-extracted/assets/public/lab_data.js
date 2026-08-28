/**
 * Mushroom OS – Lab Technician data layer.
 *
 * One master batch, ten checkpoint days. The lab tech never sees the whole
 * process graph: they see a vertical list of checkpoints, exactly one of which
 * is open for entry.
 *
 * STATUS IS DERIVED, NOT STORED. A day is:
 *   submitted — a record exists for it
 *   pending   — no record, but every earlier checkpoint day has one
 *   locked    — some earlier checkpoint day is still missing
 * That single rule gives the progression requirement (a day unlocks only when
 * the previous checkpoint is submitted) for free, and it cannot drift out of
 * sync with the records the way a stored status field would.
 *
 * NOTHING IS PRE-FILLED. There is no seeded history: on a clean install the
 * first checkpoint is pending and the other nine are locked, so every one of
 * them is entered by hand through the same path.
 *
 * `approved` is read but never written here. Approval belongs to a supervisor
 * screen that does not exist yet; when it does, it sets `approved` on the
 * record and this file already reports it.
 *
 * Keys look like:  mos.lab.MB-2026-09-001.day4
 * Note these are deliberately OUTSIDE the `mushroomos.` namespace, so the demo
 * Reset in demo.js (which clears `mushroomos.*`) does not wipe lab entries.
 * Use LabData.resetLab() to clear them on purpose.
 */
(function () {
  'use strict';

  const LAB_KEY = 'mos.lab';
  // Retained only so the old seed marker gets cleaned off devices that ran the
  // previous build. Nothing writes it any more.
  const SEED_FLAG = LAB_KEY + '.seeded';

  const MASTER_BATCH = {
    id: 'MB-2026-09-001',
    name: 'Sep Batch 01',
    startDate: '2026-09-01',
    checkpointDays: [0, 1, 4, 5, 6, 7, 8, 12, 15, 22],
  };

  // The ONLY name a lab tech sees. Day numbers are an internal ordering device
  // — they survive in the storage keys and in this map's own keys, but never on
  // screen. A tech knows "Unloading Sample", not "Day 4".
  const ACTIVITY = {
    0:  'Bagasse Weighment',
    1:  'Bagasse Wetting',
    4:  'Unloading Sample',
    5:  'Paddy Soaking 1',
    6:  'Paddy Soaking 2',
    7:  'Paddy Soaking 3',
    8:  'Turner Passes',
    12: 'Bunker Reloading',
    15: 'Tunnel Loading',
    22: 'Tunnel Unloading',
  };

  // Abbreviations for the checkpoint dot strip, where ten full names will not
  // fit across a phone.
  const ACTIVITY_TINY = {
    0:  'Weighment',
    1:  'Wetting',
    4:  'Unloading',
    5:  'Soak 1',
    6:  'Soak 2',
    7:  'Soak 3',
    8:  'Turners',
    12: 'Reloading',
    15: 'Tunnel In',
    22: 'Tunnel Out',
  };

  // ── Field vocabulary ──────────────────────────────────────────────────────
  // Built as data rather than ten hand-written HTML blocks: the entry page and
  // the read-only view both render from this, so a field can never appear in
  // one and be missing from the other.
  const F = {
    moisture: (label) => ({ key: 'moisture', label: label || 'Moisture', unit: '%', step: '0.1', placeholder: '68.5' }),
    ph:       ()      => ({ key: 'ph',       label: 'pH',                unit: '',  step: '0.1', placeholder: '7.0' }),
    ec:       ()      => ({ key: 'ec',       label: 'EC',                unit: 'mS/cm', step: '0.01', placeholder: '1.20' }),
    tds:      ()      => ({ key: 'tds',      label: 'TDS',               unit: 'mg/L', step: '1', placeholder: '850' }),
    n:        (label) => ({ key: 'n',        label: label || 'N (Nitrogen)', unit: '%', step: '0.01', placeholder: '1.85' }),
    ash:      (label) => ({ key: 'ash',      label: label || 'Ash',      unit: '%', step: '0.1', placeholder: '22.0' }),
    cn:       ()      => ({ key: 'cn',       label: 'C:N Ratio',         unit: '',  step: '0.1', placeholder: '28.0' }),
    // Placeholders double as the demo fill value (see demo.js fillStage), so
    // they carry a realistic figure rather than a bare 0.
    dryWt:    (ph)    => ({ key: 'dryWeight', label: 'Dry Weight',       unit: 'kg', step: '1', placeholder: ph || '0' }),
    height:   (key, label, ph) => ({ key: key, label: label, unit: 'cm', step: '1', placeholder: ph || '0' }),
  };

  const MPE = () => [F.moisture(), F.ph(), F.ec()];
  const FULL_PANEL = () => [F.ph(), F.ec(), F.moisture(), F.n(), F.ash(), F.cn()];

  // Common Observation — required wherever material is stored in, or taken out
  // of, a bunker or tunnel.
  const OBSERVATION = () => [
    { key: 'smell',   label: 'Smell',        type: 'segment', options: ['Normal', 'Off-Odour'] },
    { key: 'colour',  label: 'Colour',       type: 'segment', options: ['Dark Brown', 'Light Brown', 'Black'] },
    { key: 'squeeze', label: 'Squeeze Test', type: 'segment', options: ['Too Dry', 'OK', 'Too Wet'] },
  ];

  const PIT_WATER = () => [F.ph(), F.ec(), F.tds()];

  /** The three-reading sub-section shape used all over Day 1 and Day 4. */
  const sub = (key, title, icon, note) => ({
    key, title, icon, note, collapsible: true,
    fields: MPE(),
    photos: [{ key: 'photo', label: 'Sample photo' }],
  });

  const DAY_FORMS = {
    0: {
      icon: 'scale',
      detail: 'Raw material intake',
      sections: [{
        key: 'rawBagasse', title: 'Raw Bagasse Sample', icon: 'grass',
        fields: [F.moisture(), F.ph(), F.dryWt('21000')],
        photos: [{ key: 'photo', label: 'Instrument / sample' }],
      }],
    },

    1: {
      icon: 'water_drop',
      detail: 'Checked at BW, H1, H2 and before bunker loading',
      sections: [
        sub('bw',      'BW (Bagasse Wetting)',  'water_drop', 'Will be checked for BW, H1, H2, Bunker Loading'),
        sub('hopper1', 'Hopper 1',              'filter_alt', 'Will be checked for BW, H1, H2, Bunker Loading'),
        sub('hopper2', 'Hopper 2',              'filter_alt', 'Will be checked for BW, H1, H2, Bunker Loading'),
        sub('preBunker', 'Before Bunker Loading', 'inventory_2', 'Will be checked for BW, H1, H2, Bunker Loading'),
      ],
    },

    4: {
      icon: 'unarchive',
      detail: 'Unload, hopper pass and reload — plus paddy weighment',
      sections: [
        sub('unloading',  'Unloading Sample',   'unarchive'),
        sub('preHopper',  'Before Hopper Pass', 'filter_alt'),
        sub('preReload',  'Before Reloading',   'inventory_2'),
        {
          key: 'paddyWeighment', title: 'Paddy Weighment', icon: 'agriculture', collapsible: true,
          fields: [F.moisture(), F.dryWt('4500')],
          photos: [{ key: 'photo', label: 'Sample photo' }],
        },
      ],
    },

    5: {
      icon: 'opacity',
      detail: 'Soak pit water · approx. 8–10 hours',
      sections: [
        { key: 'beforeSoak', title: 'Soak Pit Water — Before Soaking', icon: 'opacity',
          fields: PIT_WATER(), photos: [{ key: 'photo', label: 'Before soaking' }] },
        { key: 'afterSoak',  title: 'Soak Pit Water — After Soaking',  icon: 'opacity',
          fields: PIT_WATER(), photos: [{ key: 'photo', label: 'After soaking' }] },
      ],
    },

    6: {
      icon: 'opacity',
      detail: 'Soak pit water · approx. 8–10 hours',
      sections: [
        { key: 'beforeSoak', title: 'Soak Pit Water — Before Soaking', icon: 'opacity',
          fields: PIT_WATER(), photos: [{ key: 'photo', label: 'Before soaking' }] },
        { key: 'afterSoak',  title: 'Soak Pit Water — After Soaking',  icon: 'opacity',
          fields: PIT_WATER(), photos: [{ key: 'photo', label: 'After soaking' }] },
      ],
    },

    7: {
      icon: 'opacity',
      detail: 'Soak pit water and chicken manure on arrival · 8–10 h, then rest 14–16 h',
      sections: [
        { key: 'beforeSoak', title: 'Soak Pit Water — Before Soaking', icon: 'opacity',
          fields: PIT_WATER(), photos: [{ key: 'photo', label: 'Before soaking' }] },
        { key: 'afterSoak',  title: 'Soak Pit Water — After Soaking',  icon: 'opacity',
          fields: PIT_WATER(), photos: [{ key: 'photo', label: 'After soaking' }] },
        {
          key: 'chickenManure', title: 'Chicken Manure (CM) — On Arrival', icon: 'pets',
          collapsible: true,
          note: 'Re-tested when taken out for mixing',
          fields: [F.n(), F.ash()],
          photos: [{ key: 'photo', label: 'On arrival' }],
          reveal: {
            key: 'retest',
            label: 'CM re-test before mixing',
            note: 'Turn on if the mix-out sample was tested',
            // Distinct keys, not a second `n`/`ash`: the re-test must not
            // overwrite the on-arrival reading, and two inputs cannot share an id.
            fields: [
              { key: 'nPost',   label: 'N (Nitrogen) — After Bunker Rest', unit: '%', step: '0.01', placeholder: '1.85' },
              { key: 'ashPost', label: 'Ash — After Bunker Rest',          unit: '%', step: '0.1',  placeholder: '22.0' },
            ],
          },
        },
      ],
    },

    8: {
      icon: 'rotate_right',
      detail: 'After 2nd flip, then T0 / T1 / T2, into bunker loading',
      sections: [
        { key: 'after2ndFlip', title: 'After 2nd Flip', icon: 'rotate_right', collapsible: true,
          fields: [F.moisture(), F.ph()],
          photos: [{ key: 'photo', label: 'Sample photo' }] },
        { key: 't0', title: 'After T0', icon: 'agriculture', collapsible: true,
          fields: [F.moisture()],
          observation: true,
          photos: [{ key: 'before', label: 'Before' }, { key: 'after', label: 'After' }] },
        { key: 't1', title: 'After T1', icon: 'agriculture', collapsible: true,
          note: 'Record average of individual pile readings',
          fields: [F.moisture('Moisture (avg across piles)')],
          observation: true,
          photos: [{ key: 'before', label: 'Before' }, { key: 'after', label: 'After' }] },
        { key: 't2', title: 'After T2', icon: 'agriculture', collapsible: true,
          note: 'Record average of individual pile readings',
          fields: [F.moisture('Moisture (avg across piles)')],
          observation: true,
          photos: [{ key: 'before', label: 'Before' }, { key: 'after', label: 'After' }] },
        { key: 'preBunkerLoad', title: 'Before Bunker Loading', icon: 'inventory_2',
          fields: [F.height('bunkerHeight', 'Bunker Height', '260')].concat(FULL_PANEL()),
          observation: true,
          photos: [{ key: 'photo', label: 'Sample photo' }] },
      ],
    },

    12: {
      icon: 'move_down',
      detail: 'Approx. 9 hours per bunker',
      sections: [
        {
          key: 'beforeReload', title: 'Before Reloading', icon: 'straighten',
          fields: [F.height('shrunkenHeight', 'Shrunken Height', '230'), F.moisture()],
          reveal: {
            key: 'waterAdded',
            label: 'Water added via hopper',
            note: 'Turn on if moisture was low and water was added',
            fields: [
              { key: 'phPost',       label: 'pH — After Water Addition',       unit: '', step: '0.1', placeholder: '7.0' },
              { key: 'ecPost',       label: 'EC — After Water Addition',       unit: 'mS/cm', step: '0.01', placeholder: '1.20' },
              { key: 'moisturePost', label: 'Moisture — After Water Addition', unit: '%', step: '0.1', placeholder: '73.0' },
            ],
          },
        },
        {
          key: 'duringReload', title: 'During Reloading', icon: 'move_down',
          fields: FULL_PANEL(),
          observation: true,
          photos: [{ key: 'before', label: 'Before' }, { key: 'after', label: 'After' }],
        },
      ],
    },

    15: {
      icon: 'login',
      detail: 'Approx. 6–8 hours per tunnel',
      sections: [{
        key: 'tunnelLoad', title: 'Tunnel Loading', icon: 'login',
        fields: [F.height('tunnelHeight', 'Tunnel Height', '200')].concat(FULL_PANEL()),
        observation: true,
        photos: [{ key: 'before', label: 'Before' }, { key: 'after', label: 'After' }],
      }],
    },

    22: {
      icon: 'logout',
      detail: 'Approx. 8 hours',
      sections: [{
        key: 'tunnelUnload', title: 'Tunnel Unloading', icon: 'logout',
        fields: [F.height('shrinkingHeight', 'Shrinking Height', '180')].concat(FULL_PANEL()),
        extras: [{
          key: 'actinomycetes', label: 'Actinomycetes', type: 'segment',
          options: ['Present', 'Absent'],
          note: 'Visual observation — white powdery growth',
        }],
        observation: true,
        photos: [{ key: 'before', label: 'Before' }, { key: 'after', label: 'After' }],
      }],
    },
  };

  // ── Storage ───────────────────────────────────────────────────────────────
  const recordKey = (batchId, day) => `${LAB_KEY}.${batchId}.day${day}`;

  function getLabRecord(batchId, day) {
    try { return JSON.parse(localStorage.getItem(recordKey(batchId, day)) || 'null'); }
    catch (e) { return null; }
  }

  function saveLabRecord(batchId, day, data) {
    const u = window.Auth && window.Auth.currentUser();
    const rec = {
      batchId, day: Number(day),
      at: Date.now(),
      by: u ? u.name : 'Unknown',
      role: u ? u.role : null,
      values: (data && data.values) || {},
      photos: (data && data.photos) || {},
    };
    try { localStorage.setItem(recordKey(batchId, day), JSON.stringify(rec)); }
    catch (e) { return null; }
    return rec;
  }

  const days = () => MASTER_BATCH.checkpointDays;

  /** The checkpoint immediately before `day`, or null for the first one. */
  function prevCheckpoint(day) {
    const i = days().indexOf(Number(day));
    return i > 0 ? days()[i - 1] : null;
  }

  function nextCheckpoint(day) {
    const i = days().indexOf(Number(day));
    return (i !== -1 && i < days().length - 1) ? days()[i + 1] : null;
  }

  /** 'submitted' | 'approved' | 'pending' | 'locked' — derived, never stored. */
  function getBatchStatus(batchId, day) {
    const rec = getLabRecord(batchId, day);
    if (rec) return rec.approved ? 'approved' : 'submitted';
    const earlier = days().slice(0, days().indexOf(Number(day)));
    const allDone = earlier.every(d => !!getLabRecord(batchId, d));
    return allDone ? 'pending' : 'locked';
  }

  /** The one checkpoint currently open for entry, or null when all are done. */
  function currentDay(batchId) {
    return days().find(d => getBatchStatus(batchId, d) === 'pending') ?? null;
  }

  function summary(batchId) {
    const s = { pending: 0, submitted: 0, approved: 0, locked: 0, awaitingApproval: 0, total: days().length };
    days().forEach(d => {
      const st = getBatchStatus(batchId, d);
      s[st] = (s[st] || 0) + 1;
      if (st === 'submitted') s.awaitingApproval++;
    });
    return s;
  }

  // ── Fresh start, nothing pre-filled ───────────────────────────────────────
  // No seeding. With zero records the derived status leaves the FIRST
  // checkpoint pending and every later one locked, so all ten behave
  // identically and the tech walks the sequence themselves.
  //
  // One-time cleanup: an earlier build shipped two checkpoints pre-submitted.
  // Those records still sit in localStorage on any device that ran it and would
  // keep showing as submitted forever, since nothing else ever deletes them.
  // Only records carrying the `seeded` flag are removed — a real submission is
  // never touched. Safe to delete this once no device holds seeded data.
  function clearSeededRecords() {
    try {
      days().forEach(d => {
        const rec = getLabRecord(MASTER_BATCH.id, d);
        if (rec && rec.seeded) localStorage.removeItem(recordKey(MASTER_BATCH.id, d));
      });
      localStorage.removeItem(SEED_FLAG);
    } catch (e) {}
  }

  /** Clear every lab record for this batch, back to a fresh first checkpoint. */
  function resetLab() {
    try {
      days().forEach(d => localStorage.removeItem(recordKey(MASTER_BATCH.id, d)));
      localStorage.removeItem(SEED_FLAG);
    } catch (e) {}
  }

  clearSeededRecords();

  window.LabData = {
    MASTER_BATCH, ACTIVITY, ACTIVITY_TINY, DAY_FORMS, OBSERVATION,
    saveLabRecord, getLabRecord, getBatchStatus,
    prevCheckpoint, nextCheckpoint, currentDay, summary,
    resetLab, recordKey,
  };
})();
