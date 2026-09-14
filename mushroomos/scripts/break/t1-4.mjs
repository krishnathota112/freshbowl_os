#!/usr/bin/env node
/**
 * ADVERSARIAL PASS - TESTS 1..4
 *   1 role attacks   2 batch isolation   3 duplicate taps   4 lost response / idempotency
 *
 * Run:  node scripts/break/t1-4.mjs
 */
import { cast, buildBatch, rpc, rest, readOrDie, patch, upload, id, msg, section, note, warn,
         mustRefuse, mustHold, report } from './lib.mjs';

const P = await cast();
section('SETUP - three overlapping PROCESS-2026C batches');
const [A, B, Cc] = [
  await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'A' }),
  await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'B' }),
  await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'C' }),
];
for (const b of [A, B, Cc]) note(`${b.code}  ${b.activities} activities  activated=${b.activated}  H0 ${b.h0}`);

const workOf = async (t, batch, role = 'operator', state = 'READY') =>
  (await rest(t, `v_my_work?select=activity_id,code,title,state,responsible_role,master_batch_id&master_batch_id=eq.${batch}&responsible_role=eq.${role}&state=eq.${state}&limit=20`)).rows;

const withEvidence = async (t, rows) => {
  for (const r of rows) {
    const q = await readOrDie(t, `batch_activity_evidence_req?select=key&batch_activity_id=eq.${r.activity_id}`, 'reqs');
    if (q.length >= 2) return r;
  }
  return rows[0];
};
const aOp = await withEvidence(P.operator, await workOf(P.operator, A.B));
const bOp = await withEvidence(P.operator, await workOf(P.operator, B.B));
const aLab = (await workOf(P.lab, A.B, 'lab_tech'))[0];
note(`A operator task: ${aOp?.code}   B operator task: ${bOp?.code}   A lab task: ${aLab?.code}`);

/* ══ TEST 1 - ROLE ATTACKS ══════════════════════════════════════════════════ */
section('TEST 1 - ROLE ATTACKS (every important write, with the wrong JWT)');

mustRefuse({ id: 'R-01', sev: 'P1', attack: 'operator creates a batch',
  expected: 'refused - admin or gm only',
  res: await rpc(P.operator, 'create_master_batch', { p_code: `MB-EVIL-${Date.now()%9999}`, p_label: 'evil',
    p_start_date: new Date().toISOString().slice(0,10), p_config: {}, p_roles: [] }) });

mustRefuse({ id: 'R-02', sev: 'P0', attack: 'operator approves a lab submission',
  expected: 'refused - supervisor or gm only',
  res: await rpc(P.operator, 'decide_lab_submission', { p_activity: aLab?.activity_id, p_verdict: 'APPROVED', p_reason: 'evil' }) });

mustRefuse({ id: 'R-03', sev: 'P0', attack: 'lab technician approves a lab submission (C-32)',
  expected: 'refused - a lab tech may never decide their own work',
  res: await rpc(P.lab, 'decide_lab_submission', { p_activity: aLab?.activity_id, p_verdict: 'APPROVED', p_reason: 'evil' }) });

mustRefuse({ id: 'R-04', sev: 'P1', attack: 'operator starts a lab activity',
  expected: 'refused - lab_tech work',
  res: await rpc(P.operator, 'start_activity', { p_activity: aLab?.activity_id }) });

mustRefuse({ id: 'R-05', sev: 'P1', attack: 'lab technician starts operator work',
  expected: 'refused - operator work',
  res: await rpc(P.lab, 'start_activity', { p_activity: aOp?.activity_id }) });

mustRefuse({ id: 'R-06', sev: 'P0', attack: 'operator grants an extension as GM',
  expected: 'refused - gm only',
  res: await rpc(P.operator, 'gm_decide_extension', { p_request: aOp?.activity_id, p_approve: true, p_reason: 'evil' }) });

mustRefuse({ id: 'R-07', sev: 'P0', attack: 'operator overrides a deviation as GM',
  expected: 'refused - gm only',
  res: await rpc(P.operator, 'gm_decide_override', { p_deviation: aOp?.activity_id, p_approve: true, p_reason: 'evil' }) });

mustRefuse({ id: 'R-08', sev: 'P0', attack: 'operator publishes a process definition',
  expected: 'refused - admin/gm only',
  res: await rpc(P.operator, 'publish_process_definition', { p_definition: A.pdid, p_reason: 'evil' }) });

mustRefuse({ id: 'R-09', sev: 'P0', attack: 'operator switches the current process version',
  expected: 'refused - admin/gm only',
  res: await rpc(P.operator, 'set_current_process', { p_definition: A.pdid, p_reason: 'evil' }) });

mustRefuse({ id: 'R-10', sev: 'P0', attack: 'operator moves the factory clock (set_dev_clock_h)',
  expected: 'refused - a clock an operator can move falsifies every actual',
  res: await rpc(P.operator, 'set_dev_clock_h', { p_batch: A.B, p_h: 400 }) });

mustRefuse({ id: 'R-11', sev: 'P0', attack: 'operator pauses the factory clock',
  expected: 'refused',
  res: await rpc(P.operator, 'pause_dev_clock', {}) });

mustRefuse({ id: 'R-12', sev: 'P0', attack: 'operator changes the factory timezone',
  expected: 'refused - admin/gm only',
  res: await rpc(P.operator, 'set_factory_timezone', { p_timezone: 'UTC', p_reason: 'evil' }) });

mustRefuse({ id: 'R-13', sev: 'P0', attack: 'operator corrects an actual',
  expected: 'refused - a correction is a supervisor act',
  res: await rpc(P.operator, 'correct_actual', { p_activity: aOp?.activity_id, p_field: 'actual_start',
    p_value: new Date(Date.now() - 86400000).toISOString(), p_reason: 'evil' }) });

mustRefuse({ id: 'R-14', sev: 'P1', attack: 'operator cancels a batch',
  expected: 'refused - admin/gm only', res: await rpc(P.operator, 'cancel_batch', { p_batch: A.B, p_reason: 'evil' }) });

mustRefuse({ id: 'R-15', sev: 'P1', attack: 'operator assigns work to somebody else',
  expected: 'refused - supervisor act',
  res: await rpc(P.operator, 'assign_activity', { p_activity: bOp?.activity_id,
    p_person: '00000000-0000-0000-0000-000000000000', p_reason: 'evil' }) });

mustRefuse({ id: 'R-16', sev: 'P1', attack: 'lab technician cancels a batch',
  expected: 'refused', res: await rpc(P.lab, 'cancel_batch', { p_batch: A.B, p_reason: 'evil' }) });

mustRefuse({ id: 'R-17', sev: 'P1', attack: 'operator releases elapsed rests (supervisor+)',
  expected: 'refused', res: await rpc(P.operator, 'release_elapsed_rests', { p_batch: A.B }) });

mustRefuse({ id: 'R-18', sev: 'P0', attack: 'operator PATCHes batch_activity straight over PostgREST',
  expected: 'refused - rule 5, writes go through RPCs and never a table PATCH',
  res: await patch(P.operator, `batch_activity?id=eq.${aOp?.activity_id}`, { state: 'COMPLETED' }) });

mustRefuse({ id: 'R-19', sev: 'P0', attack: 'operator PATCHes master_batch to move H0',
  expected: 'refused',
  res: await patch(P.operator, `master_batch?id=eq.${A.B}`, { start_at: new Date(Date.now() - 9e8).toISOString() }) });

mustRefuse({ id: 'R-20', sev: 'P0', attack: 'operator PATCHes the audit trail',
  expected: 'refused - the trail is append-only and not theirs',
  res: await patch(P.operator, `audit_event?action=eq.start_activity&limit=1`, { reason: 'rewritten' }) });

/* ══ TEST 2 - BATCH ISOLATION ═══════════════════════════════════════════════ */
section('TEST 2 - BATCH ISOLATION (A must not reach B or C)');

// A real photo, so the rejection is about the PATH and not the payload.
const jpeg = Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,0,0,0,1,0,1,0,0,0xff,0xd9]);

const up1 = await upload(P.operator, `${B.B}/${aOp.activity_id}/cross-${Date.now()}.jpg`, jpeg);
mustRefuse({ id: 'X-01', sev: 'P1', attack: "A's activity filed under B's batch folder",
  expected: 'storage refuses the mismatched path',
  res: { ok: up1.ok, status: up1.status } });

const up2 = await upload(P.operator, `${A.B}/${bOp.activity_id}/cross-${Date.now()}.jpg`, jpeg);
mustRefuse({ id: 'X-02', sev: 'P1', attack: "B's activity filed under A's batch folder",
  expected: 'storage refuses the mismatched path',
  res: { ok: up2.ok, status: up2.status } });

mustRefuse({ id: 'X-03', sev: 'P1', attack: "evidence bound to B's activity using A's storage path",
  expected: 'bind_evidence refuses a path that is not this activity’s',
  res: await rpc(P.operator, 'bind_evidence', { p_activity: bOp.activity_id, p_requirement_key: 'BEFORE_PHOTO',
    p_storage_path: `${A.B}/${aOp.activity_id}/whatever.jpg`, p_media_kind: 'photo' }) });

// A lab sample opened on A's activity but pointed at B's checkpoint id.
const cpB = (await rest(P.lab, `lab_checkpoint?select=id,code&limit=5`)).rows;
mustRefuse({ id: 'X-04', sev: 'P1', attack: 'a lab sample opened on a batch the activity does not belong to',
  expected: 'refused - the sample must belong to the activity’s own batch',
  res: await rpc(P.lab, 'open_prebatch_sample', { p_batch: B.B, p_checkpoint: cpB[0]?.id,
    p_label: 'cross', p_at: new Date(Date.parse(A.h0) - 3600_000).toISOString() }) });

// Does completing work on A change anything at all on B or C?
const snap = async (b) => (await rest(P.supervisor,
  `batch_activity?select=state&master_batch_id=eq.${b}`)).rows.map(r => r.state).sort().join(',');
const beforeB = await snap(B.B), beforeC = await snap(Cc.B);

await rpc(P.operator, 'start_activity', { p_activity: aOp.activity_id });
const reqs = await readOrDie(P.operator, `batch_activity_evidence_req?select=key,min_count&batch_activity_id=eq.${aOp.activity_id}`, 'A evidence reqs');
note(`${aOp.code} requires: ${reqs.map(r=>r.key).join(', ') || '(nothing)'}`);
for (const r of reqs) {
  const path = `${A.B}/${aOp.activity_id}/${r.key}-${Date.now()}.jpg`;
  await upload(P.operator, path, jpeg);
  const bd = await rpc(P.operator, 'bind_evidence', { p_activity: aOp.activity_id, p_requirement_key: r.key,
    p_storage_path: path, p_media_kind: 'photo' });
  if (!bd.ok) throw new Error(`harness could not bind ${r.key}: ${msg(bd.body)}`);
}
const done = await rpc(P.operator, 'submit_activity', { p_activity: aOp.activity_id, p_remarks: 'adversarial' });
note(`A ${aOp.code} submitted: ${done.ok}`);

mustHold({ id: 'X-05', sev: 'P1', attack: 'work on A leaves B untouched',
  expected: 'B’s activity states unchanged', actual: 'changed', ok: (await snap(B.B)) === beforeB });
mustHold({ id: 'X-06', sev: 'P1', attack: 'work on A leaves C untouched',
  expected: 'C’s activity states unchanged', actual: 'changed', ok: (await snap(Cc.B)) === beforeC });

const evA = (await rest(P.supervisor, `evidence_media?select=master_batch_id&master_batch_id=eq.${A.B}`)).rows.length;
const evB = (await rest(P.supervisor, `evidence_media?select=master_batch_id&master_batch_id=eq.${B.B}`)).rows.length;
mustHold({ id: 'X-07', sev: 'P1', attack: 'the evidence just uploaded belongs only to A',
  expected: `A has files, B has none`, actual: `A=${evA} B=${evB}`, ok: evA > 0 && evB === 0 });

const fA = (await rest(P.supervisor, `v_batch_forecast?select=h0,standard_hr&master_batch_id=eq.${A.B}`)).rows[0];
const fB = (await rest(P.supervisor, `v_batch_forecast?select=h0,standard_hr&master_batch_id=eq.${B.B}`)).rows[0];
mustHold({ id: 'X-08', sev: 'P1', attack: 'each batch keeps its own H0',
  expected: 'different H0 per batch', actual: `${fA?.h0} vs ${fB?.h0}`, ok: fA?.h0 !== fB?.h0 });

/* ══ TEST 3 - DUPLICATE TAPS ════════════════════════════════════════════════ */
section('TEST 3 - DUPLICATE TAPS (the factory phone will do this)');

const dupTarget = await withEvidence(P.operator, (await workOf(P.operator, B.B)).filter(r => r.activity_id !== bOp.activity_id));
note(`target ${dupTarget.code} on ${B.code}`);

// five simultaneous starts, as a jittery thumb produces
const bursts = await Promise.all([1,2,3,4,5].map(() => rpc(P.operator, 'start_activity', { p_activity: dupTarget.activity_id })));
const okStarts = bursts.filter(r => r.ok).length;
const row1 = (await rest(P.supervisor, `batch_activity?select=state,actual_start&id=eq.${dupTarget.activity_id}`)).rows[0];
mustHold({ id: 'D-01', sev: 'P2', attack: 'five simultaneous START taps produce exactly one start',
  expected: 'one actual_start, state IN_PROGRESS',
  actual: `${okStarts}/5 accepted, state=${row1.state}, actual_start=${row1.actual_start}`,
  ok: row1.state === 'IN_PROGRESS' && !!row1.actual_start });

const auditStarts = (await rest(P.gm, `audit_event?select=id&action=eq.start_activity&entity_id=eq.${dupTarget.activity_id}`)).rows.length;
mustHold({ id: 'D-02', sev: 'P3', attack: 'the audit trail is not spammed by duplicate taps',
  expected: '1 start_activity audit row', actual: `${auditStarts} rows`, ok: auditStarts === 1 });

// duplicate evidence: the same file bound five times to the same requirement
const reqB = await readOrDie(P.operator, `batch_activity_evidence_req?select=key&batch_activity_id=eq.${dupTarget.activity_id}`, 'B evidence reqs');
note(`${dupTarget.code} requires: ${reqB.map(r=>r.key).join(', ') || '(nothing)'}`);
const rk = reqB[0]?.key;
const dupPath = `${B.B}/${dupTarget.activity_id}/${rk}-dup-${Date.now()}.jpg`;
await upload(P.operator, dupPath, jpeg);
const binds = await Promise.all([1,2,3,4,5].map(() => rpc(P.operator, 'bind_evidence',
  { p_activity: dupTarget.activity_id, p_requirement_key: rk, p_storage_path: dupPath, p_media_kind: 'photo' })));
const media = (await rest(P.supervisor, `evidence_media?select=id,storage_path&batch_activity_id=eq.${dupTarget.activity_id}`)).rows;
const sameFile = media.filter(m => m.storage_path === dupPath).length;
mustHold({ id: 'D-03', sev: 'P2', attack: 'binding the SAME file five times does not create five evidence records',
  expected: '1 record for one file', actual: `${binds.filter(r=>r.ok).length}/5 accepted, ${sameFile} rows for that path`,
  ok: sameFile === 1 });

// duplicate submits
for (const r of reqB) {
  if (r.key === rk) continue;
  const p = `${B.B}/${dupTarget.activity_id}/${r.key}-${Date.now()}.jpg`;
  await upload(P.operator, p, jpeg);
  await rpc(P.operator, 'bind_evidence', { p_activity: dupTarget.activity_id, p_requirement_key: r.key, p_storage_path: p, p_media_kind: 'photo' });
}
const subs = await Promise.all([1,2,3,4,5].map(() => rpc(P.operator, 'submit_activity', { p_activity: dupTarget.activity_id, p_remarks: 'dup' })));
const row2 = (await rest(P.supervisor, `batch_activity?select=state,actual_start,actual_end&id=eq.${dupTarget.activity_id}`)).rows[0];
const auditSubs = (await rest(P.gm, `audit_event?select=id&action=eq.submit_activity&entity_id=eq.${dupTarget.activity_id}`)).rows.length;
mustHold({ id: 'D-04', sev: 'P1', attack: 'five simultaneous FINISH taps produce exactly one completion',
  expected: 'one actual_end, one submit in the trail',
  actual: `${subs.filter(r=>r.ok).length}/5 accepted, state=${row2.state}, actual_end=${row2.actual_end}, ${auditSubs} audit row(s)`,
  ok: row2.state === 'COMPLETED' && auditSubs === 1 });

/* ══ TEST 4 - LOST RESPONSE ═════════════════════════════════════════════════ */
section('TEST 4 - LOST RESPONSE (server did it, phone never heard, phone retries)');

const retryTarget = (await workOf(P.operator, Cc.B))[0];
note(`target ${retryTarget.code} on ${Cc.code}`);

const first = await rpc(P.operator, 'start_activity', { p_activity: retryTarget.activity_id });
const t1 = (await rest(P.supervisor, `batch_activity?select=actual_start&id=eq.${retryTarget.activity_id}`)).rows[0].actual_start;
await new Promise(r => setTimeout(r, 2500));           // the phone waits, times out, tries again
const again = await rpc(P.operator, 'start_activity', { p_activity: retryTarget.activity_id });
const t2 = (await rest(P.supervisor, `batch_activity?select=actual_start&id=eq.${retryTarget.activity_id}`)).rows[0].actual_start;

mustHold({ id: 'L-01', sev: 'P0', attack: 'a retried START does not move the official actual_start',
  expected: 'actual_start identical after the retry',
  actual: `${t1} then ${t2} (retry HTTP ${again.status})`, ok: t1 === t2 });

note(`first start HTTP ${first.status}; retry HTTP ${again.status} ${again.ok ? '(accepted)' : '(refused: ' + msg(again.body) + ')'}`);

report('TESTS 1-4');
console.log(`batches: ${A.code} ${B.code} ${Cc.code}`);
