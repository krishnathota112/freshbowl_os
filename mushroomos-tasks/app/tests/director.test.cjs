const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function load() {
  const context = { window: { TK: {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../www/director-model.js'), 'utf8'), context);
  return context.window.TK.directorModel;
}
const H = 3600000, NOW = Date.parse('2026-10-01T12:00:00Z');
const iso = ms => new Date(ms).toISOString();
const batch = (id, name, extra) => Object.assign({ id, name, h0: iso(NOW - 48 * H) }, extra);
let seq = 0;
const task = (b, o) => Object.assign({ id: 't' + (++seq), batch_id: b, ord: seq, line: 'Main', kind: 'work', status: 'todo', title: 'Task ' + seq }, o);

test('a batch with everything on plan is on track and raises nothing', () => {
  const m = load().model({ now: NOW, since: NOW - 7 * 86400000, batches: [batch('b1', '182')],
    tasks: [task('b1', { status: 'done', suggested_at: iso(NOW - 10 * H) }), task('b1', { status: 'todo', suggested_at: iso(NOW + 5 * H) })] });
  assert.equal(m.batches[0].status, 'on_track'); assert.equal(m.exceptions.length, 0); assert.equal(m.summary.onTrack, 1);
});

test('late starts use a grace period and are grouped into one entry per batch, naming the longest wait', () => {
  const t = [task('b1', { title: 'Mix', suggested_at: iso(NOW - 30 * H) }), task('b1', { title: 'Wet', suggested_at: iso(NOW - 3 * H) }), task('b1', { title: 'Just due', suggested_at: iso(NOW - 1 * H) })];
  const m = load().model({ now: NOW, since: NOW - 86400000, batches: [batch('b1', '183')], tasks: t });
  const late = m.exceptions.filter(e => e.kind === 'late_start');
  assert.equal(late.length, 1); assert.match(late[0].headline, /^2 tasks are past/); assert.match(late[0].detail, /“Mix”/);
  assert.equal(late[0].severity, 'high');                                   // 30 h late >= 12 h
});

test('running past the planned duration is flagged; a task with no planned time is never flagged', () => {
  const t = [task('b1', { status: 'running', title: 'Soak', started_at: iso(NOW - 6 * H), planned_duration_minutes: 120 }),
    task('b1', { status: 'running', title: 'Unplanned', started_at: iso(NOW - 40 * H), planned_duration_minutes: null })];
  const m = load().model({ now: NOW, since: NOW - 86400000, batches: [batch('b1', '184')], tasks: t });
  const over = m.exceptions.filter(e => e.kind === 'overrun');
  assert.equal(over.length, 1); assert.match(over[0].headline, /Soak/); assert.equal(over[0].severity, 'high');    // 4 h over >= 240 min
});

test('GM waits are medium after 4 h and high after 24 h; an unknown submit time is flagged without inventing an age', () => {
  const t = [task('b1', { status: 'submitted', title: 'Gate A', ended_at: iso(NOW - 5 * H) }), task('b1', { status: 'submitted', title: 'Gate B', ended_at: iso(NOW - 30 * H) }),
    task('b1', { status: 'submitted', title: 'Gate C', ended_at: iso(NOW - 1 * H) }), task('b1', { status: 'submitted', title: 'Gate D', ended_at: null })];
  const m = load().model({ now: NOW, since: NOW - 86400000, batches: [batch('b1', '185')], tasks: t });
  const by = n => m.exceptions.find(e => e.headline.includes(n));
  assert.equal(by('Gate A').severity, 'medium'); assert.equal(by('Gate B').severity, 'high'); assert.equal(by('Gate C'), undefined);
  assert.equal(by('Gate D').detail, 'Submission time not recorded.');
});

test('expected-by-now is measured against all tasks; behind means completion trails the plan by the stated points', () => {
  const t = []; for (let i = 0; i < 10; i++) t.push(task('b1', { status: i < 2 ? 'done' : 'todo', suggested_at: iso(NOW - (10 - i) * H) }));
  const m = load().model({ now: NOW, since: NOW - 86400000, batches: [batch('b1', '186')], tasks: t });
  const b = m.batches[0]; assert.equal(b.due, 10); assert.equal(Math.round(b.expectedPct), 100); assert.equal(Math.round(b.actualPct), 20);
  assert.equal(b.status, 'behind'); assert.equal(Math.round(b.gapPts), -80);
});

test('tasks marked done-before-the-app count as complete for the batch but never as throughput', () => {
  const fin = [task('b1', { status: 'done_before', ended_at: iso(NOW - 2 * H) }), task('b1', { status: 'done', started_at: iso(NOW - 4 * H), ended_at: iso(NOW - 3 * H) })];
  const m = load().model({ now: NOW, since: NOW - 7 * 86400000, batches: [], finished: fin });
  assert.equal(m.throughput.total, 1); assert.equal(m.throughput.doneBeforeExcluded, 1);
});

test('throughput buckets use India dates and ignore work outside the selected period', () => {
  const at = s => iso(Date.parse(s));
  const fin = [task('b1', { status: 'done', started_at: at('2026-10-01T04:00:00Z'), ended_at: at('2026-10-01T05:00:00Z') }),
    task('b1', { status: 'done', started_at: at('2026-09-30T20:00:00Z'), ended_at: at('2026-09-30T20:30:00Z') }),   // 01:30 IST on 1 Oct
    task('b1', { status: 'done', started_at: at('2026-09-10T04:00:00Z'), ended_at: at('2026-09-10T05:00:00Z') })];  // outside period
  const m = load().model({ now: NOW, since: NOW - 3 * 86400000, batches: [], finished: fin });
  const oct1 = m.throughput.days.find(d => d.date === '2026-10-01'); assert.equal(oct1.done, 2); assert.equal(m.throughput.total, 2);
});

test('start delay is median/p90 of actual start minus suggested start, only where both exist; overrun counts only beyond tolerance', () => {
  const mk = (delayMin, actualMin, plannedMin) => task('b1', { status: 'done', title: 'Hopper pass', line: 'Main', suggested_at: iso(NOW - 10 * H), started_at: iso(NOW - 10 * H + delayMin * 60000), ended_at: iso(NOW - 10 * H + (delayMin + actualMin) * 60000), planned_duration_minutes: plannedMin });
  const fin = [mk(10, 60, 60), mk(30, 100, 60), mk(50, 61, 60), task('b1', { status: 'done', started_at: iso(NOW - 5 * H), ended_at: iso(NOW - 4 * H), suggested_at: null })];
  const m = load().model({ now: NOW, since: NOW - 86400000, batches: [], finished: fin });
  assert.equal(m.timing.startDelayCount, 3); assert.equal(m.timing.startDelayMedianMin, 30);
  assert.equal(Math.round(m.timing.overrunHours * 60), 40);                 // only the 100-vs-60 task is beyond the 30-minute tolerance
  assert.equal(m.timing.measured, 4); assert.equal(m.timing.missingTimes, 0);
});

test('finished tasks with missing or reversed times are counted as missing, never as zero-length work', () => {
  const fin = [task('b1', { status: 'done', started_at: null, ended_at: iso(NOW - H) }), task('b1', { status: 'done', started_at: iso(NOW - H), ended_at: iso(NOW - 2 * H) })];
  const m = load().model({ now: NOW, since: NOW - 86400000, batches: [], finished: fin });
  assert.equal(m.timing.missingTimes, 2); assert.equal(m.timing.measured, 0); assert.equal(m.timing.startDelayMedianMin, null);
});

test('a Paddy convergence miss becomes a high exception; unknown or waiting does not', () => {
  const t = [task('b1', {})];
  const conv = state => () => ({ state: state, shortfallMs: 5 * H, uncertain: true, cause: 'Paddy soak 2 started late' });
  const miss = load().model({ now: NOW, since: NOW - 86400000, batches: [batch('b1', '187')], tasks: t, convergence: conv('miss') });
  assert.equal(miss.exceptions[0].kind, 'convergence'); assert.equal(miss.exceptions[0].severity, 'high'); assert.match(miss.exceptions[0].detail, /^At least about 5 h short — Paddy soak 2/); assert.equal(miss.batches[0].status, 'behind');
  ['unknown', 'waiting'].forEach(s => assert.equal(load().model({ now: NOW, since: NOW - 86400000, batches: [batch('b1', '187')], tasks: t, convergence: conv(s) }).exceptions.filter(e => e.kind === 'convergence').length, 0));
  const broken = load().model({ now: NOW, since: NOW - 86400000, batches: [batch('b1', '187')], tasks: t, convergence: () => { throw new Error('x'); } });
  assert.equal(broken.batches[0].convergence.state, 'unknown');             // a failing forecast never breaks the page
});

test('materials: over and short are high, open alerts medium, active batches only, units follow the requirement', () => {
  const rq = (o) => Object.assign({ id: 'r' + (++seq), batch_name: '183,184,185', batch_status: 'active', material_name: 'Paddy', required_kg: 51850, received_kg: 20000, remaining_kg: 31850, tolerance_kg: 100, state: 'receiving', open_alerts: 0, weight_unit: 't' }, o);
  const m = load().model({ now: NOW, since: NOW - 86400000, batches: [], requirements: [rq({ state: 'over', received_kg: 52000, material_name: 'Over mat' }), rq({ state: 'short', material_name: 'Short mat', weight_unit: 'kg', required_kg: 900, received_kg: 700 }),
    rq({ open_alerts: 2, material_name: 'Alert mat' }), rq({ material_name: 'Fine' }), rq({ batch_status: 'closed', state: 'over', material_name: 'Closed' })] });
  assert.equal(m.materials.length, 4); assert.equal(m.summary.materialsAtRisk, 3);
  const by = n => m.exceptions.find(e => e.headline.includes(n));
  assert.equal(by('Over mat').severity, 'high'); assert.match(by('Short mat').detail, /700 kg against 900 kg/); assert.equal(by('Alert mat').severity, 'medium'); assert.equal(by('Fine'), undefined); assert.equal(by('Closed'), undefined);
});

test('exceptions are ranked high before medium before low, older before newer within a level', () => {
  const t = [task('b1', { status: 'submitted', title: 'New', ended_at: iso(NOW - 5 * H) }), task('b1', { status: 'submitted', title: 'Old', ended_at: iso(NOW - 10 * H) })];
  const m = load().model({ now: NOW, since: NOW - 86400000, batches: [batch('b1', '188')], tasks: t, requirements: [{ id: 'r', batch_name: 'x', batch_status: 'active', material_name: 'Over', state: 'over', required_kg: 10, received_kg: 20, weight_unit: 'kg' }] });
  const plain = v => JSON.parse(JSON.stringify(v));   // values built inside the model's sandbox are compared as plain data
  assert.deepEqual(plain(m.exceptions.map(e => e.severity)), ['high', 'medium', 'medium']); assert.match(m.exceptions[1].headline, /Old/);
  assert.deepEqual(plain(m.attention), { high: 1, medium: 2, low: 0 });
});

test('a quiet active batch is flagged low; one with a running task is not', () => {
  const quiet = load().model({ now: NOW, since: NOW - 86400000, batches: [batch('b1', 'q')], tasks: [task('b1', { status: 'done', ended_at: iso(NOW - 20 * H), suggested_at: iso(NOW - 30 * H) }), task('b1', { suggested_at: iso(NOW + 9 * H) })] });
  assert.equal(quiet.exceptions.filter(e => e.kind === 'quiet').length, 1);
  const busy = load().model({ now: NOW, since: NOW - 86400000, batches: [batch('b1', 'q')], tasks: [task('b1', { status: 'running', started_at: iso(NOW - 20 * H) })] });
  assert.equal(busy.exceptions.filter(e => e.kind === 'quiet').length, 0);
});

test('CSV output neutralizes formulas and quotes cells so Excel opens it safely', () => {
  const csv = load().csv([['Name', 'Note'], ['=HYPERLINK("x")', 'a "b", c'], [12.5, null]]);
  assert(csv.startsWith('﻿')); assert(csv.includes('"\'=HYPERLINK(""x"")"')); assert(csv.includes('"a ""b"", c"')); assert(csv.includes('12.5,""'));
});

test('an empty factory produces an empty, safe model', () => {
  const m = load().model({ now: NOW, since: NOW - 7 * 86400000 });
  assert.equal(m.summary.batches, 0); assert.equal(m.exceptions.length, 0); assert.equal(m.throughput.total, 0); assert.equal(m.timing.startDelayMedianMin, null); assert.equal(m.materials.length, 0);
});
