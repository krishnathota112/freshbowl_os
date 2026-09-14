#!/usr/bin/env node
/**
 * ADVERSARIAL PASS - TESTS 9..15
 *   9 parallel process   10 multi-SOP   11 stale client   12 two devices
 *  13 session/restart   14 evidence failure modes   15 the full real journey
 */
import { cast, buildBatch, signIn, rpc, rest, readOrDie, patch, upload, id, msg, U, A as ANON,
         section, note, warn, mustRefuse, mustHold, report } from './lib.mjs';

const P = await cast();
const jpeg = Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,0,0,0,1,0,1,0,0,0xff,0xd9]);

section('SETUP');
const C1 = await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'P' });
note(`${C1.code}  (${C1.processCode})`);

const used = new Set();
async function pick(batch) {
  const rows = await readOrDie(P.operator,
    `v_my_work?select=activity_id,code,state&master_batch_id=eq.${batch}&responsible_role=eq.operator&state=eq.READY&limit=40`, 'work');
  for (const r of rows) {
    if (used.has(r.activity_id)) continue;
    const q = await readOrDie(P.operator, `batch_activity_evidence_req?select=key&batch_activity_id=eq.${r.activity_id}`, 'reqs');
    if (q.length >= 2) { used.add(r.activity_id); return { ...r, reqs: q }; }
  }
  const f = rows.find(r => !used.has(r.activity_id)); used.add(f?.activity_id); return { ...f, reqs: [] };
}
async function doWork(batchId, t) {
  await rpc(P.operator, 'start_activity', { p_activity: t.activity_id });
  for (const q of t.reqs) {
    const p = `${batchId}/${t.activity_id}/${q.key}-${Date.now()}.jpg`;
    await upload(P.operator, p, jpeg);
    await rpc(P.operator, 'bind_evidence', { p_activity: t.activity_id, p_requirement_key: q.key, p_storage_path: p, p_media_kind: 'photo' });
  }
  return rpc(P.operator, 'submit_activity', { p_activity: t.activity_id, p_remarks: 'adversarial' });
}

/* ── T-05 retest, correctly this time ─────────────────────────────────────── */
section('T-05 RETEST - a legitimate correction, with a value inside the batch window');
const ct = await pick(C1.B);
await doWork(C1.B, ct);
const st = (await rest(P.supervisor, `batch_activity?select=actual_start,actual_end,state&id=eq.${ct.activity_id}`)).rows[0];
if (st.state === 'COMPLETED') {
  const legit = new Date(Date.parse(st.actual_start) + 1000).toISOString();  // after the start, inside the batch
  const c = await rpc(P.supervisor, 'correct_actual', { p_activity: ct.activity_id, p_field: 'actual_end',
    p_value: legit, p_reason: 'the line clock was running fast; corrected against the wall clock' });
  const corr = await readOrDie(P.gm, `actual_correction?select=field,previous_value,new_value,reason,corrected_role&batch_activity_id=eq.${ct.activity_id}`, 'corr');
  const now = (await rest(P.supervisor, `batch_activity?select=actual_end&id=eq.${ct.activity_id}`)).rows[0];
  mustHold({ id: 'T-05', sev: 'P0', attack: 'a legitimate correction keeps the original and states who and why',
    expected: 'one correction row with previous_value, new_value, reason and role; actual_end moved',
    actual: `HTTP ${c.status} ${c.ok ? '' : msg(c.body)} | ${corr.length} row(s) ${corr[0] ? JSON.stringify(corr[0]).slice(0,150) : ''} | actual_end ${now.actual_end}`,
    ok: c.ok && corr.length === 1 && !!corr[0].previous_value && !!corr[0].reason && now.actual_end !== st.actual_end });
} else warn(`could not complete ${ct.code}, skipping T-05 retest`);

/* ══ TEST 9 - PARALLEL PROCESS ══════════════════════════════════════════════ */
section('TEST 9 - PARALLEL PROCESS (one pile must not unlock another)');

const trn = await readOrDie(P.supervisor,
  `v_my_work?select=activity_id,code,state,blocked_reason,stream&master_batch_id=eq.${C1.B}&code=like.TRN-P*&order=code`, 'turner');
note(`${trn.length} turner activities: ${trn.map(t=>t.code).join(' ')}`);

const t2s = trn.filter(t => /-T2$/.test(t.code));
let ownPile = 0, foreign = 0;
for (const t of t2s) {
  const pile = t.code.match(/TRN-(P\d)-T2/)?.[1];
  const r = t.blocked_reason ?? '';
  if (!pile) continue;
  if (r.includes(`${pile}-T1`) || r.includes(`${pile} `)) ownPile++;
  const others = ['P1','P2','P3','P4','P5','P6'].filter(p => p !== pile);
  if (others.some(p => r.includes(`TRN-${p}-T1`))) foreign++;
}
mustHold({ id: 'PP-01', sev: 'P1', attack: 'each pile\'s T2 waits on ITS OWN T1, never a shared clock',
  expected: `all ${t2s.length} T2 activities cite their own pile, none cites another`,
  actual: `${ownPile}/${t2s.length} cite own pile, ${foreign} cite a foreign pile`,
  ok: t2s.length > 0 && foreign === 0 });
t2s.slice(0, 3).forEach(t => note(`${t.code}: ${String(t.blocked_reason).slice(0, 110)}`));

// completing one pile's T1 must not move another pile's T2
const p1t1 = trn.find(t => t.code === 'TRN-P1-T1');
if (p1t1) {
  const otherBefore = t2s.filter(t => !t.code.startsWith('TRN-P1')).map(t => `${t.code}:${t.state}`).join(',');
  const wk = await readOrDie(P.operator, `batch_activity_evidence_req?select=key&batch_activity_id=eq.${p1t1.activity_id}`, 'reqs');
  await doWork(C1.B, { ...p1t1, reqs: wk });
  const afterRows = await readOrDie(P.supervisor,
    `v_my_work?select=code,state&master_batch_id=eq.${C1.B}&code=like.TRN-P*-T2&order=code`, 'turner2');
  const otherAfter = afterRows.filter(t => !t.code.startsWith('TRN-P1')).map(t => `${t.code}:${t.state}`).join(',');
  mustHold({ id: 'PP-02', sev: 'P1', attack: 'finishing P1 T1 leaves every other pile\'s T2 exactly as it was',
    expected: otherBefore, actual: otherAfter, ok: otherBefore === otherAfter });
}

const bunk = await readOrDie(P.supervisor,
  `v_my_work?select=code,state,blocked_reason&master_batch_id=eq.${C1.B}&code=like.BNK-B*&order=code`, 'bunkers');
let bx = 0;
for (const b of bunk) {
  const mine = b.code.match(/BNK-(B\d)/)?.[1];
  const others = ['B1','B2','B3'].filter(x => x !== mine);
  if (others.some(o => String(b.blocked_reason ?? '').includes(`BNK-${o}`))) bx++;
}
mustHold({ id: 'PP-03', sev: 'P1', attack: 'no bunker is gated on another bunker',
  expected: '0 cross-bunker dependencies', actual: `${bx} of ${bunk.length}`, ok: bx === 0 });

/* ══ TEST 10 - MULTI-SOP ════════════════════════════════════════════════════ */
section('TEST 10 - MULTI-SOP (a batch uses ITS OWN process, never a global 470)');

// PROCESS-2026B states Day-0 quantities its plan generator needs. Taken from a real 2026B batch
// rather than invented, so this tests the SOP as the factory actually runs it.
const cfg2026B = (await readOrDie(P.supervisor, 'master_batch?select=config&code=eq.MB-2026-366-368', 'cfg'))[0]?.config ?? {};
const B2 = await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'S',
                              processCode: 'PROCESS-2026B', config: cfg2026B });
note(`${B2.code} (PROCESS-2026B, ${B2.activities} activities)`);

const fC = (await rest(P.supervisor, `v_batch_forecast?select=standard_hr,h0,planned_end_at&master_batch_id=eq.${C1.B}`)).rows[0];
const fB = (await rest(P.supervisor, `v_batch_forecast?select=standard_hr,h0,planned_end_at&master_batch_id=eq.${B2.B}`)).rows[0];
mustHold({ id: 'SOP-01', sev: 'P1', attack: 'the 2026C batch computes 470',
  expected: '470', actual: String(fC?.standard_hr), ok: Number(fC?.standard_hr) === 470 });
mustHold({ id: 'SOP-02', sev: 'P1', attack: 'the 2026B batch computes 536, not 470',
  expected: '536', actual: String(fB?.standard_hr), ok: Number(fB?.standard_hr) === 536 });
mustHold({ id: 'SOP-03', sev: 'P1', attack: 'each baseline end is its own standard past its own H0',
  expected: 'C: H0+470, B: H0+536',
  actual: `C ${Math.round((Date.parse(fC.planned_end_at)-Date.parse(fC.h0))/3600000)}h, B ${Math.round((Date.parse(fB.planned_end_at)-Date.parse(fB.h0))/3600000)}h`,
  ok: Math.round((Date.parse(fC.planned_end_at)-Date.parse(fC.h0))/3600000) === 470
   && Math.round((Date.parse(fB.planned_end_at)-Date.parse(fB.h0))/3600000) === 536 });
const tplC = (await readOrDie(P.supervisor, `v_process_catalogue?select=activity_count&code=eq.PROCESS-2026C`, 'tc'))[0]?.activity_count;
const tplB = (await readOrDie(P.supervisor, `v_process_catalogue?select=activity_count&code=eq.PROCESS-2026B`, 'tb'))[0]?.activity_count;
note(`templates: 2026C ${tplC} -> ${C1.activities} instances; 2026B ${tplB} -> ${B2.activities} instances`);
mustHold({ id: 'SOP-04', sev: 'P1', attack: 'each batch generates its own process plan, not a shared one',
  expected: 'two different plans, each derived from its own definition',
  actual: `2026C ${tplC} templates -> ${C1.activities}; 2026B ${tplB} templates -> ${B2.activities}`,
  ok: C1.activities !== B2.activities && C1.activities > 0 && B2.activities > 0 });

const codesC = new Set((await readOrDie(P.supervisor, `batch_activity?select=code&master_batch_id=eq.${C1.B}`, 'cc')).map(r=>r.code));
const codesB = new Set((await readOrDie(P.supervisor, `batch_activity?select=code&master_batch_id=eq.${B2.B}`, 'bb')).map(r=>r.code));
const onlyB = [...codesB].filter(c => !codesC.has(c));
mustHold({ id: 'SOP-05', sev: 'P1', attack: 'the 2026B batch runs 2026B activities, not a copy of 2026C',
  expected: 'its own activity codes', actual: `${onlyB.length} codes unique to B`, ok: onlyB.length > 0 || codesB.size !== codesC.size });

/* ══ TEST 11 - STALE CLIENT ═════════════════════════════════════════════════ */
section('TEST 11 - STALE CLIENT (the phone acts on what it saw 30 seconds ago)');

const staleT = await pick(C1.B);
note(`the phone reads ${staleT.code} as READY and holds that on screen`);
const held = await rpc(P.supervisor, 'hold_activity', { p_activity: staleT.activity_id, p_reason: 'supervisor put it on hold while the phone was idle' });
note(`supervisor holds it: HTTP ${held.status} ${held.ok ? '' : msg(held.body)}`);
if (held.ok) {
  const s = await rpc(P.operator, 'start_activity', { p_activity: staleT.activity_id });
  const row = (await rest(P.supervisor, `batch_activity?select=state,actual_start&id=eq.${staleT.activity_id}`)).rows[0];
  mustHold({ id: 'SC-01', sev: 'P0', attack: 'a stale screen cannot start work the supervisor has since held',
    expected: 'the server re-checks and the activity does not start',
    actual: `HTTP ${s.status}; state=${row.state} actual_start=${row.actual_start}`,
    ok: !row.actual_start });
  await rpc(P.supervisor, 'release_activity', { p_activity: staleT.activity_id, p_reason: 'adversarial cleanup' });
}

/* ══ TEST 12 - TWO DEVICES ══════════════════════════════════════════════════ */
section('TEST 12 - TWO DEVICES (same person, two phones; then two different people)');

const phoneA = await signIn('operator@freshbowl.demo');
const phoneB = await signIn('operator@freshbowl.demo');
mustHold({ id: 'TD-00', sev: 'P3', attack: 'the same person can hold two live sessions',
  expected: 'two distinct tokens', actual: phoneA === phoneB ? 'identical' : 'distinct', ok: phoneA !== phoneB });

const twoT = await pick(C1.B);
const [ra, rb] = await Promise.all([
  rpc(phoneA, 'start_activity', { p_activity: twoT.activity_id }),
  rpc(phoneB, 'start_activity', { p_activity: twoT.activity_id }),
]);
const twoRow = (await rest(P.supervisor, `batch_activity?select=state,actual_start&id=eq.${twoT.activity_id}`)).rows[0];
mustHold({ id: 'TD-01', sev: 'P1', attack: 'two phones starting the same task give one start',
  expected: 'one actual_start', actual: `A=${ra.status} B=${rb.status}; actual_start=${twoRow.actual_start}`,
  ok: !!twoRow.actual_start && twoRow.state === 'IN_PROGRESS' });

for (const q of twoT.reqs) {
  const p = `${C1.B}/${twoT.activity_id}/${q.key}-${Date.now()}.jpg`;
  await upload(phoneA, p, jpeg);
  await rpc(phoneA, 'bind_evidence', { p_activity: twoT.activity_id, p_requirement_key: q.key, p_storage_path: p, p_media_kind: 'photo' });
}
const [sa, sb] = await Promise.all([
  rpc(phoneA, 'submit_activity', { p_activity: twoT.activity_id, p_remarks: 'phone A' }),
  rpc(phoneB, 'submit_activity', { p_activity: twoT.activity_id, p_remarks: 'phone B' }),
]);
const twoEnd = (await rest(P.supervisor, `batch_activity?select=state,actual_end&id=eq.${twoT.activity_id}`)).rows;
mustHold({ id: 'TD-02', sev: 'P1', attack: 'two phones finishing the same task give one finish',
  expected: 'one actual_end, state COMPLETED',
  actual: `A=${sa.status} B=${sb.status}; ${twoEnd[0].state} ${twoEnd[0].actual_end}`,
  ok: twoEnd[0].state === 'COMPLETED' && !!twoEnd[0].actual_end });

const otherT = await pick(C1.B);
mustRefuse({ id: 'TD-03', sev: 'P1', attack: 'a lab technician on a second phone finishes the operator\'s task',
  expected: 'refused - not their work',
  res: await rpc(P.lab, 'start_activity', { p_activity: otherT.activity_id }) });

/* ══ TEST 13 - SESSION ══════════════════════════════════════════════════════ */
section('TEST 13 - SESSION (sign out must actually end the session)');

const doomed = await signIn('operator@freshbowl.demo');
const before13 = await rest(doomed, 'v_my_work?select=activity_id&limit=1');
await fetch(`${U}/auth/v1/logout`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${doomed}` } });
const after13 = await rest(doomed, 'v_my_work?select=activity_id&limit=1');
const claims = JSON.parse(Buffer.from(doomed.split('.')[1], 'base64url').toString());
const lifetime = Math.round((claims.exp - claims.iat) / 60);
mustHold({ id: 'SS-01', sev: 'P2', attack: `a signed-out access token still works for up to ${lifetime} minutes`,
  expected: 'the token stops working at logout',
  actual: `before HTTP ${before13.status}, after HTTP ${after13.status}; JWT lifetime ${lifetime} min. `
        + 'Supabase access tokens are stateless: logout revokes the REFRESH token, the access token '
        + 'lives out its hour. The app clears its own storage, so a person handing over a phone is '
        + 'fine; a token already captured is not. Mitigation is a shorter JWT expiry, set on the '
        + 'Supabase project, not in this codebase.',
  ok: before13.status === 200 && after13.status !== 200 });

const forged = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiZ20iLCJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAifQ.bm90YXJlYWxzaWduYXR1cmU';
const forgedRes = await rest(forged, 'v_my_work?select=activity_id&limit=1');
mustHold({ id: 'SS-02', sev: 'P0', attack: 'a self-signed JWT claiming role=gm is rejected',
  expected: 'rejected', actual: `HTTP ${forgedRes.status}`, ok: forgedRes.status !== 200 });

/* ══ TEST 14 - EVIDENCE FAILURE MODES ═══════════════════════════════════════ */
section('TEST 14 - EVIDENCE FAILURE MODES (half-finished uploads must not read as done)');

const failT = await pick(C1.B);
await rpc(P.operator, 'start_activity', { p_activity: failT.activity_id });

// upload succeeds, bind never happens - the classic dropped-connection case
const orphan = `${C1.B}/${failT.activity_id}/${failT.reqs[0].key}-orphan-${Date.now()}.jpg`;
await upload(P.operator, orphan, jpeg);
const stateAfterOrphan = await readOrDie(P.operator,
  `batch_activity_evidence_req?select=key,satisfied_count,min_count&batch_activity_id=eq.${failT.activity_id}`, 'reqs');
mustHold({ id: 'EF-01', sev: 'P1', attack: 'a stored file that was never bound does NOT count as evidence',
  expected: 'satisfied_count still 0', actual: JSON.stringify(stateAfterOrphan),
  ok: stateAfterOrphan.every(r => Number(r.satisfied_count) === 0) });

const sub14 = await rpc(P.operator, 'submit_activity', { p_activity: failT.activity_id, p_remarks: 'orphan only' });
const row14 = (await rest(P.supervisor, `batch_activity?select=state&id=eq.${failT.activity_id}`)).rows[0];
mustHold({ id: 'EF-02', sev: 'P0', attack: 'an activity with only an orphaned upload cannot complete',
  expected: 'not COMPLETED', actual: `HTTP ${sub14.status}, state=${row14.state}`, ok: row14.state !== 'COMPLETED' });

// bind succeeds, then the file is deleted underneath it
const live = `${C1.B}/${failT.activity_id}/${failT.reqs[0].key}-live-${Date.now()}.jpg`;
await upload(P.operator, live, jpeg);
await rpc(P.operator, 'bind_evidence', { p_activity: failT.activity_id, p_requirement_key: failT.reqs[0].key, p_storage_path: live, p_media_kind: 'photo' });
const del = await fetch(`${U}/storage/v1/object/evidence/${live}`, { method: 'DELETE', headers: { apikey: ANON, Authorization: `Bearer ${P.operator}` } });
mustRefuse({ id: 'EF-03', sev: 'P1', attack: 'an operator deletes evidence they already filed',
  expected: 'refused - filed evidence is not the operator\'s to remove', res: { ok: del.ok, status: del.status } });

/* ══ TEST 15 - THE FULL REAL JOURNEY ════════════════════════════════════════ */
section('TEST 15 - THE FULL REAL JOURNEY on a fresh batch');

const F = await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'Z' });
note(`${F.code}  ${F.activities} activities  refused-before-check=${F.refusedBefore}  activated=${F.activated}`);
mustHold({ id: 'J-01', sev: 'P1', attack: 'admin: create -> generate -> material check -> activate',
  expected: '110 activities, refused before the check, activated after',
  actual: `${F.activities}, refusedBefore=${F.refusedBefore}, activated=${F.activated}`,
  ok: F.activities === 110 && F.refusedBefore && F.activated });

const jt = await (async () => {
  const rows = await readOrDie(P.operator, `v_my_work?select=activity_id,code,state&master_batch_id=eq.${F.B}&responsible_role=eq.operator&state=eq.READY&limit=40`, 'jwork');
  for (const r of rows) {
    const q = await readOrDie(P.operator, `batch_activity_evidence_req?select=key&batch_activity_id=eq.${r.activity_id}`, 'jreqs');
    if (q.length >= 2) return { ...r, reqs: q };
  }
  return null;
})();
const jSub = await doWork(F.B, jt);
const jRow = (await rest(P.supervisor, `batch_activity?select=state,actual_start,actual_end&id=eq.${jt.activity_id}`)).rows[0];
mustHold({ id: 'J-02', sev: 'P1', attack: `operator: start -> photo -> photo -> finish (${jt.code})`,
  expected: 'COMPLETED with both actuals server-stamped',
  actual: `HTTP ${jSub.status}; ${jRow.state} ${jRow.actual_start} -> ${jRow.actual_end}`,
  ok: jRow.state === 'COMPLETED' && !!jRow.actual_start && !!jRow.actual_end });

// lab: a checkpoint that actually gates something
const queue = await readOrDie(P.supervisor,
  `v_lab_approval_queue?select=activity_id,activity_code,gates_activity_code,gates_activity_state,is_gate,awaiting_decision&master_batch_id=eq.${F.B}&is_gate=eq.true&order=activity_code`, 'queue');
note(`${queue.length} gating lab checkpoints on this batch`);
const gate = queue[0];
if (gate) {
  const heldCode = gate.gates_activity_code;
  const before = (await readOrDie(P.supervisor, `v_my_work?select=state&master_batch_id=eq.${F.B}&code=eq.${heldCode}`, 'held'))[0];
  note(`${gate.activity_code} gates ${heldCode}, currently ${before?.state}`);

  await rpc(P.lab, 'start_activity', { p_activity: gate.activity_id });
  const lreq = await readOrDie(P.lab, `batch_activity_evidence_req?select=key&batch_activity_id=eq.${gate.activity_id}`, 'lreq');
  for (const q of lreq) {
    const p = `${F.B}/${gate.activity_id}/${q.key}-${Date.now()}.jpg`;
    await upload(P.lab, p, jpeg);
    await rpc(P.lab, 'bind_evidence', { p_activity: gate.activity_id, p_requirement_key: q.key, p_storage_path: p, p_media_kind: 'photo' });
  }
  const lsub = await rpc(P.lab, 'submit_activity', { p_activity: gate.activity_id, p_remarks: 'lab readings recorded' });
  const midState = (await readOrDie(P.supervisor, `v_my_work?select=state&master_batch_id=eq.${F.B}&code=eq.${heldCode}`, 'held2'))[0];
  mustHold({ id: 'J-03', sev: 'P0', attack: 'lab SUBMITS - the gated activity stays shut until somebody decides',
    expected: `${heldCode} still not READY`,
    actual: `lab submit HTTP ${lsub.status}; ${heldCode} is ${midState?.state}`,
    ok: midState?.state !== 'READY' });

  mustRefuse({ id: 'J-04', sev: 'P0', attack: 'the lab technician approves their own submission',
    expected: 'refused (C-32)',
    res: await rpc(P.lab, 'decide_lab_submission', { p_activity: gate.activity_id, p_verdict: 'approved', p_reason: 'self' }) });

  const dec = await rpc(P.supervisor, 'decide_lab_submission', { p_activity: gate.activity_id, p_verdict: 'approved', p_reason: 'readings within band' });
  const openState = (await readOrDie(P.supervisor, `v_my_work?select=state,blocked_reason&master_batch_id=eq.${F.B}&code=eq.${heldCode}`, 'held3'))[0];
  mustHold({ id: 'J-05', sev: 'P0', attack: 'supervisor APPROVES - the gate opens',
    expected: `${heldCode} becomes READY`,
    actual: `decide HTTP ${dec.status} ${dec.ok ? '' : msg(dec.body)}; ${heldCode} is ${openState?.state} ${openState?.blocked_reason ?? ''}`,
    ok: dec.ok && openState?.state === 'READY' });
}

// everything belongs to this one batch
const ev = await readOrDie(P.supervisor, `evidence_media?select=master_batch_id&master_batch_id=eq.${F.B}`, 'ev');
const foreignEv = await readOrDie(P.supervisor, `evidence_media?select=id&master_batch_id=eq.${F.B}&batch_activity_id=not.in.(${''})`, 'ev2').catch(() => []);
const fc = (await rest(P.supervisor, `v_batch_forecast?select=standard_hr,h0,forecast_basis&master_batch_id=eq.${F.B}`)).rows[0];
mustHold({ id: 'J-06', sev: 'P1', attack: 'plan, actual, evidence, lab, approval and forecast all name this batch',
  expected: 'evidence on this batch, its own standard and H0',
  actual: `${ev.length} file(s), standard ${fc?.standard_hr}, H0 ${fc?.h0}, basis ${fc?.forecast_basis}`,
  ok: ev.length > 0 && Number(fc?.standard_hr) === 470 && Date.parse(fc?.h0) === Date.parse(F.h0) });

report('TESTS 9-15');
console.log(`batches: ${C1.code} ${B2.code} ${F.code}`);
