const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function load() {
  const context = { window: { TK: {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../www/flow-model.js'), 'utf8'), context);
  return context.window.TK.flowModel;
}
const plain = v => JSON.parse(JSON.stringify(v));
const H = 3600000, T0 = Date.parse('2026-03-01T08:00:00Z');

// The owner's own 21 group starts, read from his workbook (every group starts at 08:00).
const HIS_STARTS = [['339, 340, 341', '2026-02-12'], ['342, 343, 344', '2026-02-14'], ['345, 346, 347', '2026-02-16'], ['348, 349, 350', '2026-02-18'], ['351, 352, 353', '2026-02-20'], ['354, 355, 356', '2026-02-24'], ['357,358, 359', '2026-02-26'], ['360, 361, 362', '2026-02-28'], ['363, 364, 365', '2026-03-02'], ['366, 367, 368,  369', '2026-03-05'], ['370, 371, 372,  373', '2026-03-08'], ['001, 002, 003,  004', '2026-03-11'], ['005, 006, 007,  008', '2026-03-14'], ['009, 010, 011,  012', '2026-03-17'], ['013, 014, 015,  016', '2026-03-20'], ['017, 018, 019,  020', '2026-03-23'], ['021, 022, 023,  024', '2026-03-26'], ['025, 026, 027,  028', '2026-03-29'], ['029, 030, 031,  032', '2026-04-01'], ['033, 034, 035,  036', '2026-04-04'], ['037, 038, 039,  040', '2026-04-07']];
const hisBatches = HIS_STARTS.map(([n, d], i) => ({ id: 'g' + i, name: n, h0: d + 'T08:00:00Z' }));

test('the template reproduces the hours per platform that the owner marked for one group', () => {
  const m = load(), hours = {};
  m.TEMPLATE.windows.forEach(w => { hours[w.platform] = (hours[w.platform] || 0) + (w.to - w.from + 1); });
  hours['4'] = 3;                                                                    // the three hours before hour 1
  assert.deepEqual(plain(hours), { '4': 3, '1A': 17, '3': 29, '5': 51, '2': 42, '1B': 24 });
});

test('hour 1 begins at the batch start; hour n spans [start+(n-1)h, start+n h]; "before hour 1" windows start earlier', () => {
  const m = load(), w = m.windowsFor(T0, 0);
  const a1 = w.find(x => x.platform === '1A'); assert.equal(a1.startMs, T0); assert.equal(a1.endMs, T0 + 17 * H);
  const b = w.find(x => x.label.startsWith('First bunker')); assert.equal(b.startMs, T0 + 17 * H); assert.equal(b.endMs, T0 + 24 * H);
  const pre = w.find(x => x.platform === '4'); assert.equal(pre.startMs, T0 - 3 * H); assert.equal(pre.endMs, T0);
});

test('slip moves every window later by the same amount and keeps the planned time for comparison', () => {
  const m = load(), w = m.windowsFor(T0, 6)[1];
  assert.equal(w.startMs, T0 + 6 * H); assert.equal(w.plannedStartMs, T0);
});

test('replaying the owner\'s own 21 starts reproduces his loads: 1A/2/4 never shared, 5 and 1B reach two, platform 3 reaches three', () => {
  const m = load(), pg = m.placed(m.groups(hisBatches, []));
  assert.equal(pg.length, 21);
  const lo = Math.min(...pg.map(g => g.startMs)) - 5 * H, hi = Math.max(...pg.map(g => g.startMs)) + 600 * H;
  const peak = {}; m.PLATFORMS.forEach(p => { peak[p] = m.peakLoad(pg, p, lo, hi); });
  assert.deepEqual(plain(peak), { '1A': 1, '1B': 2, '2': 1, '3': 3, '4': 1, '5': 2 });
  assert.equal(m.conflicts(pg, m.CAPACITY).length, 0);                          // within the capacities inferred from his plan
});

test('the same plan is flagged when a platform is treated as exclusive', () => {
  const m = load(), pg = m.placed(m.groups(hisBatches, [])), strict = Object.assign({}, m.CAPACITY, { '3': 1 });
  const c = m.conflicts(pg, strict); assert(c.length > 0); assert(c.every(x => x.platform === '3' && x.load > 1 && x.capacity === 1));
  assert(c[0].groups.length >= 2);
});

test('groups started 48 h apart (his cadence) fit; 24 h apart collide on the exclusive Turner platform; 10 h apart also collide on 1A', () => {
  const m = load(), cap = m.CAPACITY, mk = (id, name, hours) => ({ id: id, name: name, h0: new Date(T0 + hours * H).toISOString() });
  const a = mk('a', '100,101', 0);
  assert.equal(m.conflicts(m.placed(m.groups([a, mk('b', '102,103', 48)], [])), cap).length, 0);
  const day = m.conflicts(m.placed(m.groups([a, mk('c', '104', 24)], [])), cap);
  assert(day.length > 0); assert(day.every(x => x.platform === '2' && x.capacity === 1 && x.load === 2));        // the 34 h T0/T1 window cannot share
  const tight = m.conflicts(m.placed(m.groups([a, mk('d', '105', 10)], [])), cap).filter(x => x.platform === '1A');
  assert.equal(tight.length, 1); assert.deepEqual(plain(tight[0].groups.slice().sort()), ['100,101', '105']); assert.equal((tight[0].endMs - tight[0].startMs) / H, 7);
});

test('a slip pushes a group into the next one: a clean 48 h start becomes a conflict once the first slips', () => {
  const m = load(), mk = (id, hours) => ({ id: id, name: id, h0: new Date(T0 + hours * H).toISOString() });
  const rows = [mk('a', 0), mk('b', 48)];
  assert.equal(m.conflicts(m.placed(m.groups(rows, [], { a: 0 })), m.CAPACITY).length, 0);
  const slipped = m.conflicts(m.placed(m.groups(rows, [], { b: 40 })), m.CAPACITY).filter(x => x.platform === '2');   // b is 40 h late: its Turner window now sits on a's... no, later; use a negative control below
  assert.equal(slipped.length, 0);                                               // moving the LATER group even later separates them further
  const earlier = m.conflicts(m.placed(m.groups(rows, [], { a: 30 })), m.CAPACITY).filter(x => x.platform === '2');       // the EARLIER group slips 30 h into the later one
  assert(earlier.length > 0); assert(earlier.every(x => x.groups.includes('a') && x.groups.includes('b')));
});

test('slip is the median start-vs-suggested delay of the last three finished tasks; unknown stays unknown; early never counts negative', () => {
  const m = load(), t = (end, delayH) => ({ status: 'done', suggested_at: new Date(T0).toISOString(), started_at: new Date(T0 + delayH * H).toISOString(), ended_at: new Date(T0 + end * H).toISOString() });
  assert.equal(m.slipHours([t(10, 4), t(11, 2), t(12, 8), t(1, 99)]), 4);                  // the 99 h one is older than the last three
  assert.equal(m.slipHours([t(10, -3)]), 0);
  assert.equal(m.slipHours([]), null); assert.equal(m.slipHours([{ status: 'done', started_at: null, suggested_at: null, ended_at: null }]), null);
});

test('a viewer override replaces the estimate; unknown slip is treated as zero but reported as unknown', () => {
  const m = load(), b = { id: 'x', name: '1,2,3', h0: new Date(T0).toISOString() };
  const g0 = m.groups([b], [])[0]; assert.equal(g0.slip, 0); assert.equal(g0.slipKnown, false); assert.equal(g0.batches, 3);
  const g1 = m.groups([b], [], { x: 9 })[0]; assert.equal(g1.slip, 9); assert.equal(g1.slipOverridden, true); assert.equal(g1.slipKnown, true);
});

test('earliest start returns the first whole hour with no platform over capacity, and is later when the factory is busier', () => {
  const m = load(), cap = m.CAPACITY;
  const a = { id: 'a', name: '1,2,3', h0: new Date(T0).toISOString() };
  const free = m.earliestStart([], cap, T0, 24 * 5); assert.equal(free.fits, true); assert.equal(free.startMs, T0);
  const one = m.placed(m.groups([a], []));
  const e = m.earliestStart(one, cap, T0, 24 * 21); assert.equal(e.fits, true); assert(e.startMs >= T0);
  assert.equal(m.violationHours(one, cap, e.startMs), 0);
  const strict = Object.assign({}, cap, { '1A': 1 }); const e2 = m.earliestStart(one, strict, T0, 24 * 21);
  assert(e2.startMs >= T0 + 17 * H, 'must wait for the 17 h platform 1A window of the running group to end'); assert.equal(m.violationHours(one, strict, e2.startMs), 0);
});

test('when nothing fits inside the horizon, the least-bad start is returned and flagged', () => {
  const m = load(), cap = { '1A': 0, '1B': 9, '2': 9, '3': 9, '4': 9, '5': 9 };           // platform 1A has no capacity at all
  const r = m.earliestStart([], cap, T0, 24); assert.equal(r.fits, false); assert(r.violationHours > 0);
});

test('status reports the hour counter, the platform window in progress, and the next hand-over', () => {
  const m = load(), g = m.placed(m.groups([{ id: 'a', name: '9', h0: new Date(T0).toISOString() }], []));
  const s = m.status(g, T0 + 20 * H)[0]; assert.equal(Math.round(s.hour), 20); assert.equal(s.current.platform, '3'); assert.equal(s.next.platform, '3'); assert.equal(s.next.from, 90);
  const before = m.status(g, T0 - 48 * H)[0]; assert.equal(before.started, false); assert.equal(before.current, null);
  assert.equal(m.status(g, T0 + 700 * H)[0].finished, true);
});

test('merging: a continuous over-capacity stretch with the same groups is one conflict, not many', () => {
  const m = load(), cap = Object.assign({}, m.CAPACITY, { '2': 1 });
  const a = { id: 'a', name: 'A', h0: new Date(T0).toISOString() }, b = { id: 'b', name: 'B', h0: new Date(T0 + 5 * H).toISOString() };
  const c = m.conflicts(m.placed(m.groups([a, b], [])), cap).filter(x => x.platform === '2'); assert.equal(c.length, 3);   // a's T0/T1 vs b's T0/T1, then a's T2 vs b's T0/T1, then a's T2 vs b's T2: three separate stretches
  assert(c.every(x => x.groups.length === 2));
});

test('an empty factory and rows without a start time produce nothing and no error', () => {
  const m = load(); assert.equal(m.groups([], []).length, 0); assert.equal(m.groups([{ id: 'x', name: 'n', h0: null }], []).length, 0);
  assert.equal(m.conflicts([], m.CAPACITY).length, 0);
});
