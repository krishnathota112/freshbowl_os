#!/usr/bin/env node
/**
 * ADVERSARIAL PASS - TESTS 5..8
 *   5 evidence attacks   6 timestamp attacks   7 gate attacks   8 frozen baseline
 */
import { cast, buildBatch, rpc, rest, readOrDie, patch, upload, id, msg,
         section, note, warn, mustRefuse, mustHold, report } from './lib.mjs';

const P = await cast();
section('SETUP');
const A = await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'E' });
const B = await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'F' });
note(`${A.code} / ${B.code}`);

const jpeg = Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,0,0,0,1,0,1,0,0,0xff,0xd9]);

const used = new Set();
async function pick(batch, role = 'operator', exclude = []) {
  exclude.forEach((e) => used.add(e));
  const rows = await readOrDie(P[role === 'operator' ? 'operator' : 'lab'],
    `v_my_work?select=activity_id,code,state&master_batch_id=eq.${batch}&responsible_role=eq.${role === 'operator' ? 'operator' : 'lab_tech'}&state=eq.READY&limit=40`, 'work');
  for (const r of rows) {
    if (used.has(r.activity_id)) continue;
    const q = await readOrDie(P.operator, `batch_activity_evidence_req?select=key,min_count&batch_activity_id=eq.${r.activity_id}`, 'reqs');
    if (q.length >= 2) { used.add(r.activity_id); return { ...r, reqs: q }; }
  }
  const f = rows.find((r) => !used.has(r.activity_id)) ?? rows[0];
  used.add(f.activity_id);
  return { ...f, reqs: [] };
}
const tA = await pick(A.B);
const tB = await pick(B.B);
note(`A target ${tA.code} (${tA.reqs.map(r=>r.key).join(', ')})   B target ${tB.code}`);
await rpc(P.operator, 'start_activity', { p_activity: tA.activity_id });

/* ══ TEST 5 - EVIDENCE ATTACKS ══════════════════════════════════════════════ */
section('TEST 5 - EVIDENCE ATTACKS');
const key = tA.reqs[0].key;
const good = `${A.B}/${tA.activity_id}/${key}-${Date.now()}.jpg`;
await upload(P.operator, good, jpeg);

mustRefuse({ id: 'E-01', sev: 'P1', attack: 'bind a requirement key this activity does not have',
  expected: 'refused - unknown requirement',
  res: await rpc(P.operator, 'bind_evidence', { p_activity: tA.activity_id, p_requirement_key: 'NOT_A_REAL_KEY',
    p_storage_path: good, p_media_kind: 'photo' }) });

mustRefuse({ id: 'E-02', sev: 'P0', attack: 'bind a storage path that was never uploaded',
  expected: 'refused - evidence must point at a real stored object',
  res: await rpc(P.operator, 'bind_evidence', { p_activity: tA.activity_id, p_requirement_key: key,
    p_storage_path: `${A.B}/${tA.activity_id}/ghost-${Date.now()}.jpg`, p_media_kind: 'photo' }) });

mustRefuse({ id: 'E-03', sev: 'P1', attack: 'bind evidence to another person\'s activity',
  expected: 'refused - not the operator\'s work',
  res: await rpc(P.lab, 'bind_evidence', { p_activity: tA.activity_id, p_requirement_key: key,
    p_storage_path: good, p_media_kind: 'photo' }) });

const trav = await upload(P.operator, `${A.B}/${tA.activity_id}/../../escape-${Date.now()}.jpg`, jpeg);
mustRefuse({ id: 'E-04', sev: 'P1', attack: 'path traversal out of the activity folder',
  expected: 'refused', res: { ok: trav.ok, status: trav.status } });

const zero = await upload(P.operator, `${A.B}/${tA.activity_id}/${key}-zero-${Date.now()}.jpg`, Buffer.alloc(0));
note(`zero-byte upload: HTTP ${zero.status} ${zero.ok ? 'ACCEPTED' : 'refused'}`);
if (zero.ok) {
  const zpath = `${A.B}/${tA.activity_id}/${key}-zero2-${Date.now()}.jpg`;
  await upload(P.operator, zpath, Buffer.alloc(0));
  const zb = await rpc(P.operator, 'bind_evidence', { p_activity: tA.activity_id, p_requirement_key: key,
    p_storage_path: zpath, p_media_kind: 'photo' });
  mustRefuse({ id: 'E-05', sev: 'P2', attack: 'a zero-byte file satisfies a photo requirement',
    expected: 'refused - an empty file is not a photograph', res: zb });
}

const html = await upload(P.operator, `${A.B}/${tA.activity_id}/${key}-x-${Date.now()}.html`,
  Buffer.from('<script>alert(1)</script>'), 'text/html');
mustRefuse({ id: 'E-06', sev: 'P2', attack: 'upload text/html into the evidence bucket',
  expected: 'refused - photo evidence only', res: { ok: html.ok, status: html.status } });

mustRefuse({ id: 'E-07', sev: 'P1', attack: 'operator writes evidence_media directly',
  expected: 'refused - rule 5',
  res: await patch(P.operator, `evidence_media?batch_activity_id=eq.${tA.activity_id}`, { requirement_key: 'FORGED' }) });

/* ══ TEST 6 - TIMESTAMP ATTACKS ═════════════════════════════════════════════ */
section('TEST 6 - TIMESTAMP ATTACKS (the official actual is the server\'s, never the phone\'s)');

// TEST 5 deliberately polluted tA (the zero-byte file consumed a requirement slot), so the
// timestamp attacks run against a clean activity of their own.
const tT = await pick(A.B, 'operator', [tA.activity_id]);
note(`timestamp target ${tT.code}`);
await rpc(P.operator, 'start_activity', { p_activity: tT.activity_id });
for (const r of tT.reqs) {
  const p = `${A.B}/${tT.activity_id}/${r.key}-real-${Date.now()}.jpg`;
  await upload(P.operator, p, jpeg);
  const bd = await rpc(P.operator, 'bind_evidence', { p_activity: tT.activity_id, p_requirement_key: r.key, p_storage_path: p, p_media_kind: 'photo' });
  if (!bd.ok) throw new Error(`bind ${r.key}: ${msg(bd.body)}`);
}

const yesterday = new Date(Date.now() - 86400000).toISOString();
const nextWeek  = new Date(Date.now() + 7 * 86400000).toISOString();
const realStart = (await rest(P.supervisor, `batch_activity?select=actual_start&id=eq.${tT.activity_id}`)).rows[0].actual_start;

const backdate = await rpc(P.operator, 'submit_activity', {
  p_activity: tT.activity_id, p_remarks: 'backdated', p_actual_start: yesterday, p_actual_end: yesterday });
const after = (await rest(P.supervisor, `batch_activity?select=actual_start,actual_end,state&id=eq.${tT.activity_id}`)).rows[0];
const tookIt = after.actual_start !== realStart || (after.actual_end && Date.parse(after.actual_end) < Date.now() - 3600_000);
mustHold({ id: 'T-01', sev: 'P0', attack: 'operator submits a BACKDATED actual_start / actual_end',
  expected: 'the client timestamps are ignored; the server\'s own clock stands',
  actual: `HTTP ${backdate.status}; actual_start ${after.actual_start}, actual_end ${after.actual_end}`,
  ok: !tookIt });

const t2 = await pick(B.B);
await rpc(P.operator, 'start_activity', { p_activity: t2.activity_id });
for (const r of t2.reqs) {
  const p = `${B.B}/${t2.activity_id}/${r.key}-${Date.now()}.jpg`;
  await upload(P.operator, p, jpeg);
  await rpc(P.operator, 'bind_evidence', { p_activity: t2.activity_id, p_requirement_key: r.key, p_storage_path: p, p_media_kind: 'photo' });
}
const future = await rpc(P.operator, 'submit_activity', {
  p_activity: t2.activity_id, p_remarks: 'from the future', p_actual_end: nextWeek });
const f2 = (await rest(P.supervisor, `batch_activity?select=actual_end&id=eq.${t2.activity_id}`)).rows[0];
mustHold({ id: 'T-02', sev: 'P0', attack: 'operator submits an actual_end a week in the future',
  expected: 'a future finish time is never stored',
  actual: `HTTP ${future.status}; actual_end ${f2.actual_end}`,
  ok: !f2.actual_end || Date.parse(f2.actual_end) < Date.now() + 60_000 });

mustRefuse({ id: 'T-03', sev: 'P0', attack: 'operator clears an actual through correct_actual',
  expected: 'refused - operator may not correct, and an actual cannot become unknown',
  res: await rpc(P.operator, 'correct_actual', { p_activity: tT.activity_id, p_field: 'actual_end', p_value: null, p_reason: 'evil' }) });

mustRefuse({ id: 'T-04', sev: 'P0', attack: 'supervisor clears an actual through correct_actual',
  expected: 'refused - there is no un-happen',
  res: await rpc(P.supervisor, 'correct_actual', { p_activity: tT.activity_id, p_field: 'actual_end', p_value: null, p_reason: 'cleanup' }) });

const corrBefore = (await readOrDie(P.gm, `actual_correction?select=id&batch_activity_id=eq.${tT.activity_id}`, 'corr')).length;
const stT = (await rest(P.supervisor, `batch_activity?select=actual_start,actual_end,state&id=eq.${tT.activity_id}`)).rows[0];

// A correction that would place work BEFORE H0 must be refused. This is a real guarantee, not an
// obstacle: nothing in a batch can have happened before the batch began.
mustRefuse({ id: 'T-05a', sev: 'P0', attack: 'a correction that would move work to before H0',
  expected: 'refused - nothing in the batch happened before H0',
  res: await rpc(P.supervisor, 'correct_actual', { p_activity: tT.activity_id, p_field: 'actual_end',
    p_value: new Date(Date.parse(A.h0) - 3600_000).toISOString(), p_reason: 'ten minutes fast' }) });

// And a correction INSIDE the window must be kept, with the original preserved.
if (stT.state === 'COMPLETED' && stT.actual_start) {
  const legit = new Date(Date.parse(stT.actual_start) + 1000).toISOString();
  const corr = await rpc(P.supervisor, 'correct_actual', { p_activity: tT.activity_id, p_field: 'actual_end',
    p_value: legit, p_reason: 'the line clock was running fast; corrected against the wall clock' });
  const rows = await readOrDie(P.gm, `actual_correction?select=previous_value,new_value,reason,corrected_role&batch_activity_id=eq.${tT.activity_id}`, 'corr2');
  const nowEnd = (await rest(P.supervisor, `batch_activity?select=actual_end&id=eq.${tT.activity_id}`)).rows[0];
  mustHold({ id: 'T-05b', sev: 'P0', attack: 'a legitimate correction keeps the original and states who and why',
    expected: 'one new correction row carrying previous_value, reason and role',
    actual: `HTTP ${corr.status} ${corr.ok ? '' : msg(corr.body)} | ${rows.length} row(s) | actual_end ${nowEnd.actual_end}`,
    ok: corr.ok && rows.length === corrBefore + 1 && !!rows[rows.length-1]?.previous_value && !!rows[rows.length-1]?.reason });
} else warn(`${tT.code} is ${stT.state}, so the correction half is not applicable here`);

const t3 = await pick(B.B);
mustRefuse({ id: 'T-06', sev: 'P1', attack: 'finish an activity that was never started',
  expected: 'refused - cannot finish what has not begun',
  res: await rpc(P.operator, 'submit_activity', { p_activity: t3.activity_id, p_remarks: 'never started' }) });

/* ══ TEST 7 - GATE ATTACKS ══════════════════════════════════════════════════ */
section('TEST 7 - GATE ATTACKS (can anything make a gate READY that should not be?)');

const locked = await readOrDie(P.supervisor,
  `v_my_work?select=activity_id,code,state,blocked_reason&master_batch_id=eq.${A.B}&state=eq.LOCKED&limit=40`, 'locked');
note(`${locked.length} LOCKED activities on ${A.code}`);
const gateTarget = locked[0];

mustRefuse({ id: 'G-01', sev: 'P0', attack: 'start a LOCKED activity directly over HTTP',
  expected: 'refused - the gate is the server\'s, not the screen\'s',
  res: await rpc(P.operator, 'start_activity', { p_activity: gateTarget.activity_id }) });

mustRefuse({ id: 'G-02', sev: 'P0', attack: 'submit a LOCKED activity directly',
  expected: 'refused', res: await rpc(P.operator, 'submit_activity', { p_activity: gateTarget.activity_id, p_remarks: 'bypass' }) });

mustRefuse({ id: 'G-03', sev: 'P0', attack: 'release a LOCKED activity as the operator',
  expected: 'refused - release is a supervisor act',
  res: await rpc(P.operator, 'release_activity', { p_activity: gateTarget.activity_id, p_reason: 'bypass' }) });

// A lab RESULT is not a lab APPROVAL. Enter a result and prove the gate stays shut.
const labRow = (await readOrDie(P.lab,
  `v_my_work?select=activity_id,code,state&master_batch_id=eq.${A.B}&responsible_role=eq.lab_tech&state=eq.READY&limit=5`, 'lab'))[0];
if (labRow) {
  const held = await readOrDie(P.supervisor,
    `v_lab_approval_queue?select=gates_activity_code,gates_activity_state,is_approved&master_batch_id=eq.${A.B}&activity_code=eq.${labRow.code}`, 'queue');
  note(`${labRow.code} gates ${held[0]?.gates_activity_code ?? '(nothing)'} - currently ${held[0]?.gates_activity_state ?? 'n/a'}`);
  if (held[0]?.gates_activity_code) {
    const before = held[0].gates_activity_state;
    await rpc(P.lab, 'start_activity', { p_activity: labRow.activity_id });
    const sm = await rpc(P.lab, 'open_lab_sample', { p_activity: labRow.activity_id, p_checkpoint: null, p_label: 'attack' });
    if (sm.ok) {
      const tst = await rpc(P.lab, 'request_lab_test', { p_sample: id(sm.body), p_parameter: 'moisture_pct', p_via: 'user' });
      if (tst.ok) await rpc(P.lab, 'record_lab_result', { p_test: id(tst.body), p_numeric: 69.5 });
    }
    const stillHeld = await readOrDie(P.supervisor,
      `v_lab_approval_queue?select=gates_activity_state&master_batch_id=eq.${A.B}&activity_code=eq.${labRow.code}`, 'queue2');
    mustHold({ id: 'G-04', sev: 'P0', attack: 'entering a lab RESULT does not open the gate it holds',
      expected: `${held[0].gates_activity_code} stays ${before}`,
      actual: `now ${stillHeld[0]?.gates_activity_state}`,
      ok: stillHeld[0]?.gates_activity_state === before });
  }
}

mustRefuse({ id: 'G-05', sev: 'P0', attack: 'operator PATCHes gate_rule to disable a gate',
  expected: 'refused', res: await patch(P.operator, `gate_rule?limit=1`, { is_enabled: false }) });

mustRefuse({ id: 'G-06', sev: 'P0', attack: 'supervisor PATCHes gate_rule to disable a gate',
  expected: 'refused - gate rules are process data, not runtime state',
  res: await patch(P.supervisor, `gate_rule?limit=1`, { is_enabled: false }) });

/* ══ TEST 8 - FROZEN BASELINE ═══════════════════════════════════════════════ */
section('TEST 8 - FROZEN BASELINE (activation freezes the plan, for everyone, by every path)');

const planBefore = (await rest(P.supervisor, `batch_activity?select=planned_start_at,planned_end_at,baseline_start_hour&id=eq.${tB.activity_id}`)).rows[0];

mustRefuse({ id: 'F-01', sev: 'P0', attack: 'admin moves H0 after activation',
  expected: 'refused - the plan freezes at activation',
  res: await rpc(P.admin, 'set_batch_start_at', { p_batch: A.B, p_start_at: new Date(Date.now() - 9e8).toISOString() }) });

mustRefuse({ id: 'F-02', sev: 'P0', attack: 'gm moves H0 after activation',
  expected: 'refused', res: await rpc(P.gm, 'set_batch_start_at', { p_batch: A.B, p_start_at: new Date(Date.now() - 9e8).toISOString() }) });

mustRefuse({ id: 'F-03', sev: 'P0', attack: 'admin regenerates the plan of an active batch',
  expected: 'refused - regeneration would rewrite the frozen baseline',
  res: await rpc(P.admin, 'generate_activity_plan', { p_batch_id: A.B }) });

mustRefuse({ id: 'F-04', sev: 'P0', attack: 'supervisor edits a planned time on an active batch',
  expected: 'refused',
  res: await rpc(P.supervisor, 'set_activity_plan', { p_activity: tB.activity_id,
    p_patch: { planned_start_at: new Date(Date.now() + 9e8).toISOString() } }) });

mustRefuse({ id: 'F-05', sev: 'P0', attack: 'admin edits a planned time on an active batch',
  expected: 'refused',
  res: await rpc(P.admin, 'set_activity_plan', { p_activity: tB.activity_id,
    p_patch: { planned_start_at: new Date(Date.now() + 9e8).toISOString() } }) });

mustRefuse({ id: 'F-06', sev: 'P0', attack: 'admin clears a planned time on an active batch',
  expected: 'refused', res: await rpc(P.admin, 'clear_planned_time', { p_activity: tB.activity_id }) });

mustRefuse({ id: 'F-07', sev: 'P0', attack: 'admin PATCHes batch_activity planned columns',
  expected: 'refused',
  res: await patch(P.admin, `batch_activity?id=eq.${tB.activity_id}`, { planned_start_at: new Date().toISOString() }) });

mustRefuse({ id: 'F-08', sev: 'P0', attack: 'admin PATCHes master_batch.start_at',
  expected: 'refused', res: await patch(P.admin, `master_batch?id=eq.${A.B}`, { start_at: new Date().toISOString() }) });

// Re-activation returns 204. Measured rather than assumed: it changes nothing - not the status,
// not activated_at, not one row of the plan. That is idempotence, which is what a retrying phone
// needs, so the invariant to assert is "nothing moved", not "it was refused".
const mb0 = (await rest(P.supervisor, `master_batch?select=status,activated_at,start_at&id=eq.${A.B}`)).rows[0];
const plan0 = await readOrDie(P.supervisor, `batch_activity?select=id,planned_start_at,baseline_start_hour&master_batch_id=eq.${A.B}&order=id`, 'plan0');
const reAct = await rpc(P.admin, 'activate_batch', { p_batch_id: A.B });
const mb1 = (await rest(P.supervisor, `master_batch?select=status,activated_at,start_at&id=eq.${A.B}`)).rows[0];
const plan1 = await readOrDie(P.supervisor, `batch_activity?select=id,planned_start_at,baseline_start_hour&master_batch_id=eq.${A.B}&order=id`, 'plan1');
mustHold({ id: 'F-09', sev: 'P0', attack: 're-activating an active batch changes nothing',
  expected: 'status, activated_at and every planned time identical',
  actual: `HTTP ${reAct.status}; activated_at ${mb0.activated_at} -> ${mb1.activated_at}; plan ${JSON.stringify(plan0) === JSON.stringify(plan1) ? 'identical' : 'CHANGED'}`,
  ok: mb0.activated_at === mb1.activated_at && mb0.start_at === mb1.start_at
      && JSON.stringify(plan0) === JSON.stringify(plan1) });

mustRefuse({ id: 'F-10', sev: 'P0', attack: 'admin edits the published process definition an active batch uses',
  expected: 'refused - a published definition is frozen',
  res: await patch(P.admin, `process_activity?process_definition_id=eq.${A.pdid}&limit=1`, { duration_hr: 999 }) });

const planAfter = (await rest(P.supervisor, `batch_activity?select=planned_start_at,planned_end_at,baseline_start_hour&id=eq.${tB.activity_id}`)).rows[0];
mustHold({ id: 'F-11', sev: 'P0', attack: 'after all of that, the plan is byte-for-byte what it was',
  expected: JSON.stringify(planBefore), actual: JSON.stringify(planAfter),
  ok: JSON.stringify(planBefore) === JSON.stringify(planAfter) });

const stdA = (await rest(P.supervisor, `v_batch_forecast?select=standard_hr&master_batch_id=eq.${A.B}`)).rows[0];
mustHold({ id: 'F-12', sev: 'P1', attack: 'the standard is still what the process computes',
  expected: '470', actual: String(stdA?.standard_hr), ok: Number(stdA?.standard_hr) === 470 });

report('TESTS 5-8');
console.log(`batches: ${A.code} ${B.code}`);
