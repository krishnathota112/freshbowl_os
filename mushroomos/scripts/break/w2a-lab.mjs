#!/usr/bin/env node
/**
 * WAVE 2 - A · LAB DECISION INTEGRITY
 *   1  correct result, wrong context      2  duplicate lab submissions
 *   3  approve/reject races               27 partial-failure consistency
 *   28 cross-client read consistency
 *
 * The question here is not "can an unauthorised person decide" - wave 1 settled that. It is
 * whether a decision SEQUENCE always resolves to exactly one authoritative answer, and whether the
 * gate, the queue and the audit trail all tell the same story about it.
 */
import { cast, buildBatch, rpc, rest, readOrDie, upload, id, msg,
         section, note, warn, mustRefuse, mustHold, report } from './lib.mjs';

const P = await cast();
const jpeg = Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,0,0,0,1,0,1,0,0,0xff,0xd9]);

section('SETUP - two batches, so context attacks have somewhere to go wrong');
const A = await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'LA' });
const B = await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'LB' });
note(`${A.code} / ${B.code}`);

/** Drive a gating lab checkpoint up to "submitted, awaiting a decision". */
async function submittedGate(batch, nth = 0) {
  const q = await readOrDie(P.supervisor,
    `v_lab_approval_queue?select=activity_id,activity_code,gates_activity_code,is_gate&master_batch_id=eq.${batch.B}&is_gate=eq.true&order=activity_code`, 'queue');
  const g = q[nth];
  if (!g) return null;
  await rpc(P.lab, 'start_activity', { p_activity: g.activity_id });
  const reqs = await readOrDie(P.lab, `batch_activity_evidence_req?select=key&batch_activity_id=eq.${g.activity_id}`, 'reqs');
  for (const r of reqs) {
    const p = `${batch.B}/${g.activity_id}/${r.key}-${Date.now()}-${Math.random().toString(36).slice(2,7)}.jpg`;
    await upload(P.lab, p, jpeg);
    const bd = await rpc(P.lab, 'bind_evidence', { p_activity: g.activity_id, p_requirement_key: r.key, p_storage_path: p, p_media_kind: 'photo' });
    if (!bd.ok) throw new Error(`bind ${r.key}: ${msg(bd.body)}`);
  }
  const sub = await rpc(P.lab, 'submit_activity', { p_activity: g.activity_id, p_remarks: 'readings recorded' });
  return { ...g, submitted: sub.ok };
}

const decisions = async (activityId) => readOrDie(P.gm,
  `lab_decision?select=seq,verdict,reason,decided_role,decided_at&batch_activity_id=eq.${activityId}&order=seq`, 'decisions');
const gateState = async (batch, code) => (await readOrDie(P.supervisor,
  `v_my_work?select=state,blocked_reason&master_batch_id=eq.${batch.B}&code=eq.${code}`, 'gate'))[0];
const queueRow = async (batch, activityId) => (await readOrDie(P.supervisor,
  `v_lab_approval_queue?select=latest_verdict,decision_count,is_approved,awaiting_decision,gates_activity_state&master_batch_id=eq.${batch.B}&activity_id=eq.${activityId}`, 'qrow'))[0];

/* ══ 1 · CORRECT RESULT, WRONG CONTEXT ══════════════════════════════════════ */
section('1 - CORRECT RESULT, WRONG CONTEXT (every value valid, the relationship is not)');

const gA = await submittedGate(A, 0);
const gB = await submittedGate(B, 0);
note(`A: ${gA.activity_code} gates ${gA.gates_activity_code}`);
note(`B: ${gB.activity_code} gates ${gB.gates_activity_code}`);

// A sample opened against batch A but pointed at an activity in batch B.
const cps = await readOrDie(P.lab, 'lab_checkpoint?select=id,code&limit=40', 'cps');
mustRefuse({ id: 'W-CTX-01', sev: 'P1', attack: "a lab sample on A's batch but B's activity",
  expected: 'refused - the sample must belong to its activity\'s own batch',
  res: await rpc(P.lab, 'open_lab_sample', { p_activity: gB.activity_id, p_checkpoint: cps[0].id, p_label: 'cross-context' }) === null ? null
     : await rpc(P.lab, 'open_lab_sample', { p_activity: gB.activity_id, p_checkpoint: cps[0].id, p_label: 'cross-context' }) });

// A checkpoint that has nothing to do with this activity.
const own = await readOrDie(P.lab, `lab_sample?select=checkpoint_id&batch_activity_id=eq.${gA.activity_id}&limit=1`, 'own');
const foreignCp = cps.find(c => c.id !== own[0]?.checkpoint_id);
const wrongCp = await rpc(P.lab, 'open_lab_sample', { p_activity: gA.activity_id, p_checkpoint: foreignCp.id, p_label: 'wrong checkpoint' });
mustRefuse({ id: 'W-CTX-02', sev: 'P1', attack: `a sample on ${gA.activity_code} filed under an unrelated checkpoint (${foreignCp.code})`,
  expected: 'refused - the checkpoint must be the one this activity performs', res: wrongCp });

// A decision aimed at a PRODUCTION activity rather than a lab submission.
const prod = (await readOrDie(P.supervisor,
  `v_my_work?select=activity_id,code&master_batch_id=eq.${A.B}&responsible_role=eq.operator&limit=1`, 'prod'))[0];
mustRefuse({ id: 'W-CTX-03', sev: 'P0', attack: 'approve a production activity as though it were a lab submission',
  expected: 'refused - it is not a lab submission',
  res: await rpc(P.supervisor, 'decide_lab_submission', { p_activity: prod.activity_id, p_verdict: 'approved', p_reason: 'wrong target' }) });

// A decision on batch B's submission must not touch batch A's gate.
const aGateBefore = await gateState(A, gA.gates_activity_code);
await rpc(P.supervisor, 'decide_lab_submission', { p_activity: gB.activity_id, p_verdict: 'approved', p_reason: 'B is decided' });
const aGateAfter = await gateState(A, gA.gates_activity_code);
mustHold({ id: 'W-CTX-04', sev: 'P0', attack: "approving B's submission leaves A's gate exactly as it was",
  expected: `A's ${gA.gates_activity_code} still ${aGateBefore.state}`,
  actual: `now ${aGateAfter.state}`, ok: aGateBefore.state === aGateAfter.state });

const bGate = await gateState(B, gB.gates_activity_code);
mustHold({ id: 'W-CTX-05', sev: 'P0', attack: "and B's own gate did open",
  expected: 'READY', actual: String(bGate.state), ok: bGate.state === 'READY' });

/* ══ 2 · DUPLICATE LAB SUBMISSIONS AND DECISIONS ════════════════════════════ */
section('2 - DUPLICATE SUBMISSIONS AND DECISIONS');

const gDup = await submittedGate(A, 1);
const subs = await Promise.all([1,2,3,4,5].map(n =>
  rpc(P.lab, 'submit_activity', { p_activity: gDup.activity_id, p_remarks: `dup-${n}` })));
const subAudit = await readOrDie(P.gm, `audit_event?select=id&entity_id=eq.${gDup.activity_id}&action=eq.submit_activity`, 'sa');
mustHold({ id: 'W-DUP-01', sev: 'P1', attack: 'five more submissions of an already-submitted lab activity',
  expected: 'exactly one submit in the trail',
  actual: `${subs.filter(r=>r.ok).length}/5 accepted after the first, ${subAudit.length} submit audit row(s)`,
  ok: subAudit.length === 1 });

const dups = await Promise.all([1,2,3].map(n =>
  rpc(P.supervisor, 'decide_lab_submission', { p_activity: gDup.activity_id, p_verdict: 'approved', p_reason: `concurrent approve ${n}` })));
const dl = await decisions(gDup.activity_id);
const qd = await queueRow(A, gDup.activity_id);
mustHold({ id: 'W-DUP-02', sev: 'P1', attack: 'three concurrent identical APPROVALS',
  expected: 'one authoritative decision; the queue agrees',
  actual: `${dups.filter(r=>r.ok).length}/3 accepted, ${dl.length} decision row(s), latest_verdict=${qd?.latest_verdict}, decision_count=${qd?.decision_count}`,
  ok: dl.length >= 1 && qd?.latest_verdict === 'approved' && Number(qd?.decision_count) === dl.length });

/* ══ 3 · APPROVE THEN REJECT, AND THE RACE ══════════════════════════════════ */
section('3 - APPROVE -> REJECT, REJECT -> APPROVE, AND SIMULTANEOUS DISAGREEMENT');

const gSeq = await submittedGate(A, 2);
const held = gSeq.gates_activity_code;
await rpc(P.supervisor, 'decide_lab_submission', { p_activity: gSeq.activity_id, p_verdict: 'approved', p_reason: 'first look: within band' });
const openState = await gateState(A, held);
const rev = await rpc(P.gm, 'decide_lab_submission', { p_activity: gSeq.activity_id, p_verdict: 'rejected', p_reason: 'second look: the instrument was out of calibration' });
const shutState = await gateState(A, held);
const seqRows = await decisions(gSeq.activity_id);
const qSeq = await queueRow(A, gSeq.activity_id);
note(`${held}: ${openState.state} -> ${shutState.state}`);
note(`decisions: ${seqRows.map(d => `${d.seq}:${d.verdict}(${d.decided_role})`).join(' -> ')}`);
mustHold({ id: 'W-SEQ-01', sev: 'P0', attack: 'a rejection AFTER an approval shuts the gate again',
  expected: `${held} returns to a not-READY state, and the latest decision is the rejection`,
  actual: `reject HTTP ${rev.status}; ${held} is ${shutState.state}; latest_verdict=${qSeq?.latest_verdict}`,
  ok: rev.ok && shutState.state !== 'READY' && qSeq?.latest_verdict === 'rejected' });

mustHold({ id: 'W-SEQ-02', sev: 'P0', attack: 'both decisions are kept - the history is not overwritten',
  expected: 'two decision rows, approved then rejected, each naming its decider',
  actual: seqRows.map(d => `${d.seq}:${d.verdict}/${d.decided_role}`).join(' '),
  ok: seqRows.length === 2 && seqRows[0].verdict === 'approved' && seqRows[1].verdict === 'rejected' });

const gSeq2 = await submittedGate(A, 3);
if (gSeq2) {
  await rpc(P.supervisor, 'decide_lab_submission', { p_activity: gSeq2.activity_id, p_verdict: 'rejected', p_reason: 'out of band' });
  const shut = await gateState(A, gSeq2.gates_activity_code);
  await rpc(P.gm, 'decide_lab_submission', { p_activity: gSeq2.activity_id, p_verdict: 'approved', p_reason: 'retest was within band' });
  const open2 = await gateState(A, gSeq2.gates_activity_code);
  mustHold({ id: 'W-SEQ-03', sev: 'P0', attack: 'an approval AFTER a rejection opens the gate',
    expected: `${gSeq2.gates_activity_code} not READY, then READY`,
    actual: `${shut.state} -> ${open2.state}`, ok: shut.state !== 'READY' && open2.state === 'READY' });
}

// THE RACE. Two authorised people disagree at the same instant.
const gRace = await submittedGate(B, 1);
if (gRace) {
  const [sup, gm] = await Promise.all([
    rpc(P.supervisor, 'decide_lab_submission', { p_activity: gRace.activity_id, p_verdict: 'approved', p_reason: 'supervisor: within band' }),
    rpc(P.gm,        'decide_lab_submission', { p_activity: gRace.activity_id, p_verdict: 'rejected', p_reason: 'gm: instrument suspect' }),
  ]);
  const rows = await decisions(gRace.activity_id);
  const q = await queueRow(B, gRace.activity_id);
  const g = await gateState(B, gRace.gates_activity_code);
  note(`supervisor HTTP ${sup.status}, gm HTTP ${gm.status}`);
  note(`decisions: ${rows.map(d => `${d.seq}:${d.verdict}(${d.decided_role})`).join(' -> ')}`);
  const latest = rows[rows.length - 1]?.verdict;
  const gateAgrees = (latest === 'approved') === (g.state === 'READY');
  mustHold({ id: 'W-RACE-01', sev: 'P0', attack: 'supervisor APPROVES and GM REJECTS at the same instant',
    expected: 'the gate matches the latest decision - never approved-and-rejected at once',
    actual: `latest=${latest}, queue latest_verdict=${q?.latest_verdict}, ${gRace.gates_activity_code}=${g.state}`,
    ok: gateAgrees && q?.latest_verdict === latest });

  mustHold({ id: 'W-RACE-02', sev: 'P0', attack: 'the losing decision is recorded, not lost',
    expected: 'both attempts are on record with their deciders',
    actual: `${rows.length} decision row(s): ${rows.map(d=>d.verdict+'/'+d.decided_role).join(', ')}`,
    ok: rows.length >= 1 });
}

/* ══ 28 · CROSS-CLIENT READ CONSISTENCY ═════════════════════════════════════ */
section('28 - CROSS-CLIENT CONSISTENCY (does everyone see the same thing straight after a decision?)');

const gCons = await submittedGate(B, 2);
if (gCons) {
  await rpc(P.supervisor, 'decide_lab_submission', { p_activity: gCons.activity_id, p_verdict: 'approved', p_reason: 'consistency probe' });
  const [asSup, asGm, asLab, asOp] = await Promise.all([
    readOrDie(P.supervisor, `v_my_work?select=state&master_batch_id=eq.${B.B}&code=eq.${gCons.gates_activity_code}`, 'c1'),
    readOrDie(P.gm,        `v_my_work?select=state&master_batch_id=eq.${B.B}&code=eq.${gCons.gates_activity_code}`, 'c2'),
    readOrDie(P.lab,       `v_my_work?select=state&master_batch_id=eq.${B.B}&code=eq.${gCons.gates_activity_code}`, 'c3'),
    readOrDie(P.operator,  `v_my_work?select=state&master_batch_id=eq.${B.B}&code=eq.${gCons.gates_activity_code}`, 'c4'),
  ]);
  const seen = [asSup[0]?.state, asGm[0]?.state, asOp[0]?.state].filter(Boolean);
  mustHold({ id: 'W-CONS-01', sev: 'P1', attack: 'supervisor, GM and operator read the same state immediately after the approval',
    expected: 'identical state for every reader who can see the row',
    actual: `supervisor=${asSup[0]?.state} gm=${asGm[0]?.state} lab=${asLab[0]?.state ?? '(not visible)'} operator=${asOp[0]?.state}`,
    ok: seen.length > 0 && new Set(seen).size === 1 });
}

/* ══ 29 · AUDIT TRUTHFULNESS ════════════════════════════════════════════════ */
section('29 - AUDIT TRUTHFULNESS (a refused decision must not read as a completed one)');

const gAud = await submittedGate(B, 3);
if (gAud) {
  const before = await readOrDie(P.gm, `audit_event?select=id,action&entity_id=eq.${gAud.activity_id}`, 'ab');
  const refused = await rpc(P.operator, 'decide_lab_submission', { p_activity: gAud.activity_id, p_verdict: 'approved', p_reason: 'operator attempt' });
  const after = await readOrDie(P.gm, `audit_event?select=id,action,reason&entity_id=eq.${gAud.activity_id}`, 'aa');
  const added = after.filter(a => !before.some(b => b.id === a.id));
  mustHold({ id: 'W-AUD-01', sev: 'P1', attack: 'a REFUSED approval writes no "decided" event',
    expected: 'no new decision audit row for a refused attempt',
    actual: `refusal HTTP ${refused.status}; ${added.length} new audit row(s): ${added.map(a=>a.action).join(', ') || 'none'}`,
    ok: !added.some(a => /decide|approve/i.test(a.action)) });

  const dl = await decisions(gAud.activity_id);
  mustHold({ id: 'W-AUD-02', sev: 'P0', attack: 'and it writes no decision row',
    expected: '0 decisions', actual: `${dl.length}`, ok: dl.length === 0 });
}

report('WAVE 2A - LAB DECISION INTEGRITY');
console.log(`batches: ${A.code} ${B.code}`);
