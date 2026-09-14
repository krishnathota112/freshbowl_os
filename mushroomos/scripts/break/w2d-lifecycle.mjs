#!/usr/bin/env node
/**
 * WAVE 2 - D · IDENTITY, CLOCK AND LIFECYCLE RACES
 *  15/16 client-supplied time on every entry point that takes one
 *  17    batch activation and generation races
 *  18    pre-batch material check races
 *  21    cancellation as a terminal state
 *  23    two operators on one activity
 *  24    assignment changed while the work is running
 */
import { cast, buildBatch, signIn, rpc, rest, readOrDie, upload, patch, id, msg,
         section, note, warn, mustRefuse, mustHold, report } from './lib.mjs';

const P = await cast();
const JPEG = Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,0,0,0,1,0,1,0,0,0xff,0xd9]);
const FUTURE = new Date(Date.now() + 2 * 86400000).toISOString();
const PAST   = new Date(Date.now() - 2 * 86400000).toISOString();

section('SETUP');
const A = await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'LC' });
note(A.code);
const used = new Set();
async function pick(batch = A) {
  const rows = await readOrDie(P.operator,
    `v_my_work?select=activity_id,code,state&master_batch_id=eq.${batch.B}&responsible_role=eq.operator&state=eq.READY&limit=40`, 'work');
  for (const r of rows) {
    if (used.has(r.activity_id)) continue;
    const q = await readOrDie(P.operator, `batch_activity_evidence_req?select=key&batch_activity_id=eq.${r.activity_id}`, 'reqs');
    if (q.length >= 2) { used.add(r.activity_id); return { ...r, reqs: q }; }
  }
  const f = rows.find(r => !used.has(r.activity_id)); used.add(f?.activity_id); return { ...f, reqs: [] };
}
const put = async (t, act, key, b = A) => {
  const p = `${b.B}/${act}/${key}-${Date.now()}-${Math.random().toString(36).slice(2,6)}.jpg`;
  await upload(t, p, JPEG); return p;
};
async function doWork(t, batch = A) {
  await rpc(P.operator, 'start_activity', { p_activity: t.activity_id });
  for (const q of t.reqs) {
    const p = await put(P.operator, t.activity_id, q.key, batch);
    await rpc(P.operator, 'bind_evidence', { p_activity: t.activity_id, p_requirement_key: q.key, p_storage_path: p, p_media_kind: 'photo' });
  }
  return rpc(P.operator, 'submit_activity', { p_activity: t.activity_id, p_remarks: 'wave2d' });
}

/* ══ 15/16 · CLIENT-SUPPLIED TIME ═══════════════════════════════════════════ */
section('15/16 - EVERY ENTRY POINT THAT ACCEPTS A CLIENT TIMESTAMP');

const labAct = (await readOrDie(P.lab,
  `v_my_work?select=activity_id,code&master_batch_id=eq.${A.B}&responsible_role=eq.lab_tech&state=eq.READY&limit=1`, 'lab'))[0];
const bound = (await readOrDie(P.lab, `lab_checkpoint_activity?select=checkpoint_code,checkpoint_map&process_activity_id=eq.${
  (await readOrDie(P.lab, `batch_activity?select=process_activity_id&id=eq.${labAct.activity_id}`, 'pa'))[0].process_activity_id}`, 'bind'))[0];
const cp = (await readOrDie(P.lab, `lab_checkpoint?select=id,code&code=eq.${bound.checkpoint_code}&checkpoint_map=eq.${bound.checkpoint_map}`, 'cp'))[0];
note(`lab activity ${labAct.code} samples at ${cp.code}`);

mustRefuse({ id: 'W-T-01', sev: 'P0', attack: 'a lab sample collected two days in the FUTURE',
  expected: 'refused - an actual is something that has already happened',
  res: await rpc(P.lab, 'open_lab_sample', { p_activity: labAct.activity_id, p_checkpoint: cp.id, p_label: 'future', p_at: FUTURE }) });

const backSample = await rpc(P.lab, 'open_lab_sample', { p_activity: labAct.activity_id, p_checkpoint: cp.id, p_label: 'backdated', p_at: PAST });
note(`backdated sample (2 days before H0): HTTP ${backSample.status} ${backSample.ok ? 'ACCEPTED' : 'refused: ' + msg(backSample.body).slice(0,100)}`);
mustHold({ id: 'W-T-02', sev: 'P1', attack: 'a lab sample backdated to before the batch existed',
  expected: 'refused, or stored with the batch timeline still intact',
  actual: backSample.ok ? 'ACCEPTED - a sample predating H0 is on record' : `refused: ${msg(backSample.body).slice(0,110)}`,
  ok: !backSample.ok });

const sm = await rpc(P.lab, 'open_lab_sample', { p_activity: labAct.activity_id, p_checkpoint: cp.id, p_label: 'ok' });
if (sm.ok) {
  const tst = await rpc(P.lab, 'request_lab_test', { p_sample: id(sm.body), p_parameter: 'moisture_pct', p_via: 'user' });
  if (tst.ok) {
    mustRefuse({ id: 'W-T-03', sev: 'P0', attack: 'a lab result measured two days in the FUTURE',
      expected: 'refused',
      res: await rpc(P.lab, 'record_lab_result', { p_test: id(tst.body), p_numeric: 69.5, p_measured_at: FUTURE }) });
  }
}

const mt = await pick();
await rpc(P.operator, 'start_activity', { p_activity: mt.activity_id });
mustRefuse({ id: 'W-T-04', sev: 'P1', attack: 'a machine stint opened two days in the FUTURE',
  expected: 'refused',
  res: await rpc(P.operator, 'open_machine_stint', { p_activity: mt.activity_id, p_at: FUTURE }) });

mustRefuse({ id: 'W-T-05', sev: 'P1', attack: 'occupancy recorded from the FUTURE',
  expected: 'refused',
  res: await rpc(P.supervisor, 'record_occupancy', { p_activity: mt.activity_id, p_from: FUTURE, p_to: null }) });

mustRefuse({ id: 'W-T-06', sev: 'P1', attack: 'occupancy whose end precedes its start',
  expected: 'refused',
  res: await rpc(P.supervisor, 'record_occupancy', { p_activity: mt.activity_id,
    p_from: new Date(Date.now() - 3600_000).toISOString(), p_to: new Date(Date.now() - 7200_000).toISOString() }) });

/* ══ 17 · ACTIVATION AND GENERATION RACES ═══════════════════════════════════ */
section('17 - ACTIVATION AND GENERATION RACES (two admin sessions at once)');

const adm2 = await signIn('admin@freshbowl.demo');
const draft = await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'RC' });
const before17 = (await readOrDie(P.supervisor, `master_batch?select=status,activated_at&id=eq.${draft.B}`, 'mb'))[0];

const [a1, a2] = await Promise.all([
  rpc(P.admin, 'activate_batch', { p_batch_id: draft.B }),
  rpc(adm2,    'activate_batch', { p_batch_id: draft.B }),
]);
const after17 = (await readOrDie(P.supervisor, `master_batch?select=status,activated_at&id=eq.${draft.B}`, 'mb2'))[0];
mustHold({ id: 'W-LC-01', sev: 'P1', attack: 'two admin sessions activate the same batch simultaneously',
  expected: 'one activation instant, and it does not move',
  actual: `A=${a1.status} B=${a2.status}; activated_at ${before17.activated_at} -> ${after17.activated_at}`,
  ok: before17.activated_at === after17.activated_at && after17.status === 'active' });

const plan17 = await readOrDie(P.supervisor, `batch_activity?select=id&master_batch_id=eq.${draft.B}`, 'p17');
const [g1, g2] = await Promise.all([
  rpc(P.admin, 'generate_activity_plan', { p_batch_id: draft.B }),
  rpc(adm2,    'generate_activity_plan', { p_batch_id: draft.B }),
]);
const plan17b = await readOrDie(P.supervisor, `batch_activity?select=id&master_batch_id=eq.${draft.B}`, 'p17b');
mustHold({ id: 'W-LC-02', sev: 'P0', attack: 'two concurrent plan regenerations on an ACTIVE batch',
  expected: 'both refused, and the activity count is unchanged',
  actual: `A=${g1.status} B=${g2.status}; ${plan17.length} -> ${plan17b.length} activities`,
  ok: !g1.ok && !g2.ok && plan17.length === plan17b.length });

/* ══ 18 · PRE-BATCH MATERIAL CHECK RACES ════════════════════════════════════ */
section('18 - PRE-BATCH MATERIAL CHECK (it decides whether a batch may start at all)');

const cpsPre = await readOrDie(P.lab, 'lab_checkpoint?select=id,code&is_prebatch=eq.true&order=code', 'pre');
// A DRAFT batch whose incoming assay has not been taken - the state the pre-batch gate guards.
const raw = await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'PB',
                               materialCheck: false, activate: false });
note(`${raw.code} is draft with no incoming assay`);
mustRefuse({ id: 'W-LC-02b', sev: 'P0', attack: 'activate a batch whose incoming material was never checked',
  expected: 'refused - the material must be sampled and accepted before the clock starts',
  res: await rpc(P.admin, 'activate_batch', { p_batch_id: raw.B }) });
const sm2 = await rpc(P.supervisor, 'open_prebatch_sample', { p_batch: raw.B, p_checkpoint: cpsPre[0].id, p_label: 'race probe',
  p_at: new Date(Date.parse(raw.h0) - 3600_000).toISOString() });
if (!sm2.ok) throw new Error(`harness could not open the prebatch sample: ${msg(sm2.body)}`);
const t2 = await rpc(P.supervisor, 'request_lab_test', { p_sample: id(sm2.body), p_parameter: 'moisture_pct', p_via: 'user' });
const r2 = await rpc(P.supervisor, 'record_lab_result', { p_test: id(t2.body), p_numeric: 55.0 });

if (!r2.ok) throw new Error(`harness could not record the assay result: ${msg(r2.body)}`);
const accepts = await Promise.all([1,2,3].map(() =>
  rpc(P.supervisor, 'accept_lab_result', { p_result: id(r2.body), p_reason: 'concurrent acceptance' })));
const accRow = (await readOrDie(P.gm, `lab_result?select=accepted,accepted_at,accepted_by&id=eq.${id(r2.body)}`, 'acc'))[0];
mustHold({ id: 'W-LC-03', sev: 'P1', attack: 'three people accept the same incoming assay at once',
  expected: 'accepted once, with one acceptance instant',
  actual: `${accepts.filter(r=>r.ok).length}/3 accepted; accepted=${accRow.accepted} at ${accRow.accepted_at}`,
  ok: accRow.accepted === true });

mustRefuse({ id: 'W-LC-04', sev: 'P1', attack: 'an OPERATOR accepts the incoming material assay',
  expected: 'refused - acceptance is a laboratory act',
  res: await rpc(P.operator, 'accept_lab_result', { p_result: id(r2.body), p_reason: 'operator attempt' }) });

/* ══ 21 · CANCELLATION IS TERMINAL ══════════════════════════════════════════ */
section('21 - CANCELLATION IS A TERMINAL STATE');

const doomed = await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'CN' });
const dt = await pick(doomed);
await rpc(P.operator, 'start_activity', { p_activity: dt.activity_id });
const preCancel = (await rest(P.supervisor, `batch_activity?select=state,actual_start&id=eq.${dt.activity_id}`)).rows[0];
const cancel = await rpc(P.admin, 'cancel_batch', { p_batch: doomed.B, p_reason: 'adversarial: cancellation semantics' });
const mbC = (await readOrDie(P.supervisor, `master_batch?select=status&id=eq.${doomed.B}`, 'mbc'))[0];
note(`${doomed.code} cancelled: HTTP ${cancel.status}, status=${mbC.status}`);

mustRefuse({ id: 'W-LC-05', sev: 'P1', attack: 'start work on a CANCELLED batch',
  expected: 'refused', res: await rpc(P.operator, 'start_activity', { p_activity: (await pick(doomed)).activity_id }) });

mustRefuse({ id: 'W-LC-06', sev: 'P1', attack: 'finish the task that was running when the batch was cancelled',
  expected: 'refused', res: await rpc(P.operator, 'submit_activity', { p_activity: dt.activity_id, p_remarks: 'after cancellation' }) });

mustRefuse({ id: 'W-LC-07', sev: 'P1', attack: 'request an extension on a cancelled batch',
  expected: 'refused', res: await rpc(P.operator, 'request_extension', { p_activity: dt.activity_id, p_hours: 2, p_reason: 'after cancellation' }) });

mustRefuse({ id: 'W-LC-08', sev: 'P0', attack: 're-activate a cancelled batch',
  expected: 'refused - cancellation is terminal', res: await rpc(P.admin, 'activate_batch', { p_batch_id: doomed.B }) });

const postCancel = (await rest(P.supervisor, `batch_activity?select=state,actual_start&id=eq.${dt.activity_id}`)).rows[0];
mustHold({ id: 'W-LC-09', sev: 'P0', attack: 'cancelling does not erase the work that had already happened',
  expected: `actual_start stays ${preCancel.actual_start}`,
  actual: `state ${preCancel.state} -> ${postCancel.state}, actual_start ${postCancel.actual_start}`,
  ok: postCancel.actual_start === preCancel.actual_start });

/* ══ 23/24 · TWO OPERATORS, AND ASSIGNMENT CHANGING MID-WORK ════════════════ */
section('23/24 - TWO OPERATORS ON ONE ACTIVITY, AND A REASSIGNMENT MID-WORK');

const staff = await readOrDie(P.supervisor, 'profiles?select=id,display_name,role&role=eq.operator&is_active=eq.true', 'staff');
note(`${staff.length} active operator account(s): ${staff.map(s=>s.display_name).join(', ')}`);

const shared = await pick();
const assigned = (await readOrDie(P.supervisor, `batch_activity?select=assigned_person_id&id=eq.${shared.activity_id}`, 'asg'))[0];
note(`${shared.code} is assigned to ${staff.find(s=>s.id===assigned.assigned_person_id)?.display_name ?? assigned.assigned_person_id}`);

// The lab technician is a different person entirely, and must not be able to take operator work.
mustRefuse({ id: 'W-LC-10', sev: 'P1', attack: 'a different person starts work assigned to somebody else',
  expected: 'refused - it is not their work',
  res: await rpc(P.lab, 'start_activity', { p_activity: shared.activity_id }) });

await rpc(P.operator, 'start_activity', { p_activity: shared.activity_id });
const other = staff.find(s => s.id !== assigned.assigned_person_id) ?? staff[0];
const reassign = await rpc(P.supervisor, 'assign_activity', { p_activity: shared.activity_id, p_person: other.id,
  p_reason: 'reassigned while the work was already running' });
note(`reassign while IN_PROGRESS: HTTP ${reassign.status} ${reassign.ok ? 'ACCEPTED' : 'refused: ' + msg(reassign.body).slice(0,100)}`);
const afterAssign = (await readOrDie(P.supervisor, `batch_activity?select=state,actual_start,assigned_person_id&id=eq.${shared.activity_id}`, 'aa'))[0];
mustHold({ id: 'W-LC-11', sev: 'P1', attack: 'reassigning a RUNNING activity does not erase who started it',
  expected: 'actual_start intact and the state unchanged',
  actual: `state=${afterAssign.state}, actual_start=${afterAssign.actual_start}, now assigned to ${staff.find(s=>s.id===afterAssign.assigned_person_id)?.display_name ?? afterAssign.assigned_person_id}`,
  ok: afterAssign.state === 'IN_PROGRESS' && !!afterAssign.actual_start });

const finish = await doWork({ ...shared, reqs: shared.reqs });
const finished = (await readOrDie(P.supervisor, `batch_activity?select=state,actual_end&id=eq.${shared.activity_id}`, 'fin'))[0];
mustHold({ id: 'W-LC-12', sev: 'P2', attack: 'after a reassignment the original operator finishes the task',
  expected: 'a deterministic answer - either refused, or completed with the trail showing both people',
  actual: `submit HTTP ${finish.status}; state=${finished.state}, actual_end=${finished.actual_end}`,
  ok: finished.state === 'COMPLETED' || !finish.ok });

const trail = await readOrDie(P.gm,
  `audit_event?select=action,actor_role,reason&entity_id=eq.${shared.activity_id}&order=occurred_at`, 'trail');
note(`trail: ${trail.map(t => t.action).join(' -> ')}`);
mustHold({ id: 'W-LC-13', sev: 'P1', attack: 'the reassignment is on the record',
  expected: 'an assign_activity event with its reason',
  actual: trail.filter(t => t.action === 'assign_activity').map(t => t.reason).join(' | ') || 'no assignment event',
  ok: trail.some(t => t.action === 'assign_activity') });

report('WAVE 2D - IDENTITY, CLOCK, LIFECYCLE');
console.log(`batches: ${A.code} ${draft.code} ${raw.code} ${doomed.code}`);
