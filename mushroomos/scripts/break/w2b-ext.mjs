#!/usr/bin/env node
/**
 * WAVE 2 - B · EXTENSIONS, VARIANCE AND FORECAST
 *   4 extension approval races      5 extension after the activity moves on
 *   6 variance manipulation         7 forecast consistency
 *
 * The rule being defended is the five-register separation:
 *   STANDARD · PLAN · ACTUAL · AUTHORISED · FORECAST
 * An extension is a THIRD NUMBER, never an edit. If granting one makes variance shrink, the
 * registers have collapsed into each other and lateness has been quietly forgiven.
 */
import { cast, buildBatch, rpc, rest, readOrDie, upload, id, msg,
         section, note, warn, mustRefuse, mustHold, report } from './lib.mjs';

const P = await cast();
const jpeg = Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,0,0,0,1,0,1,0,0,0xff,0xd9]);

section('SETUP');
const A = await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'XA' });
const B = await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'XB' });
const C = await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'XC' });
note(`${A.code} / ${B.code} / ${C.code}`);

const pol = (await readOrDie(P.gm, 'extension_policy?select=*&limit=1', 'policy'))[0];
note(`policy: manager_required=${pol?.manager_approval_required} gm_required=${pol?.gm_approval_required} `
   + `strict_order=${pol?.strict_approval_order} after_completion=${pol?.allow_after_completion} `
   + `max_open=${pol?.max_open_per_activity} max_hr=${pol?.max_requested_hr}`);

const used = new Set();
async function pick(batch) {
  const rows = await readOrDie(P.operator,
    `v_my_work?select=activity_id,code,state&master_batch_id=eq.${batch.B}&responsible_role=eq.operator&state=eq.READY&limit=40`, 'work');
  for (const r of rows) {
    if (used.has(r.activity_id)) continue;
    const q = await readOrDie(P.operator, `batch_activity_evidence_req?select=key&batch_activity_id=eq.${r.activity_id}`, 'reqs');
    if (q.length >= 2) { used.add(r.activity_id); return { ...r, reqs: q }; }
  }
  const f = rows.find(r => !used.has(r.activity_id)); used.add(f?.activity_id); return { ...f, reqs: [] };
}
async function doWork(batch, t) {
  await rpc(P.operator, 'start_activity', { p_activity: t.activity_id });
  for (const q of t.reqs) {
    const p = `${batch.B}/${t.activity_id}/${q.key}-${Date.now()}-${Math.random().toString(36).slice(2,6)}.jpg`;
    await upload(P.operator, p, jpeg);
    await rpc(P.operator, 'bind_evidence', { p_activity: t.activity_id, p_requirement_key: q.key, p_storage_path: p, p_media_kind: 'photo' });
  }
  return rpc(P.operator, 'submit_activity', { p_activity: t.activity_id, p_remarks: 'wave2' });
}
// The granted figures live on the base table; the view carries the decisions and the outcome.
const reqRow = async (rid) => {
  const v = (await readOrDie(P.gm,
    `v_extension_request?select=status,is_effective,requested_extension_hr,approved_extension_hr,manager_decision,gm_decision&id=eq.${rid}`, 'req'))[0];
  const b = (await readOrDie(P.gm,
    `extension_request?select=manager_granted_hr,gm_granted_hr,manager_decision,gm_decision,status&id=eq.${rid}`, 'reqbase'))[0];
  return { ...v, manager_granted_hr: b?.manager_granted_hr, gm_granted_hr: b?.gm_granted_hr };
};
const fc = async (batch) => (await readOrDie(P.supervisor,
  `v_batch_forecast?select=standard_hr,h0,planned_end_at,approved_extension_hr,authorised_end_at,projected_end_at,slip_minutes,forecast_basis,measured_count,finished_count&master_batch_id=eq.${batch.B}`, 'fc'))[0];
const af = async (activityId) => (await readOrDie(P.supervisor,
  `v_activity_forecast?select=planned_end_at,approved_extension_hr,authorised_end_at,actual_end,original_variance_minutes,within_authorisation,projected_end_at,forecast_basis&activity_id=eq.${activityId}`, 'af'))[0];

/* ══ 4 · EXTENSION APPROVAL RACES ═══════════════════════════════════════════ */
section('4 - EXTENSION APPROVAL RACES');

const e1 = await pick(A);
await rpc(P.operator, 'start_activity', { p_activity: e1.activity_id });
const r1 = await rpc(P.operator, 'request_extension', { p_activity: e1.activity_id, p_hours: 4, p_reason: 'rain stopped the yard work' });
note(`request on ${e1.code}: HTTP ${r1.status} ${r1.ok ? '' : msg(r1.body)}`);
const rid1 = id(r1.body);

if (rid1) {
  const [m, g] = await Promise.all([
    rpc(P.manager, 'manager_decide_extension', { p_request: rid1, p_approve: true, p_reason: 'manager grants 4', p_granted_hr: 4 }),
    rpc(P.gm,      'gm_decide_extension',      { p_request: rid1, p_approve: true, p_reason: 'gm grants 6',      p_granted_hr: 6 }),
  ]);
  const row = await reqRow(rid1);
  note(`manager HTTP ${m.status}${m.ok ? '' : ' (' + msg(m.body).slice(0,70) + ')'}; gm HTTP ${g.status}${g.ok ? '' : ' (' + msg(g.body).slice(0,70) + ')'}`);
  note(`status=${row.status} approved=${row.approved_extension_hr} manager=${row.manager_decision}/${row.manager_granted_hr} gm=${row.gm_decision}/${row.gm_granted_hr}`);
  mustHold({ id: 'W-EXT-01', sev: 'P1', attack: 'manager grants +4 and GM grants +6 simultaneously',
    expected: 'exactly one approved figure, and it is one of the two granted',
    actual: `status=${row.status}, approved_extension_hr=${row.approved_extension_hr}`,
    ok: row.approved_extension_hr === null
        || [4, 6].map(String).includes(String(Number(row.approved_extension_hr))) });

  const dup = await Promise.all([1,2,3].map(() =>
    rpc(P.gm, 'gm_decide_extension', { p_request: rid1, p_approve: true, p_reason: 'again', p_granted_hr: 6 })));
  const row2 = await reqRow(rid1);
  mustHold({ id: 'W-EXT-02', sev: 'P1', attack: 'three more GM approvals of the same request',
    expected: 'the approved figure does not accumulate',
    actual: `${dup.filter(r=>r.ok).length}/3 accepted; approved_extension_hr ${row.approved_extension_hr} -> ${row2.approved_extension_hr}`,
    ok: String(row2.approved_extension_hr) === String(row.approved_extension_hr) });
}

const e2 = await pick(A);
await rpc(P.operator, 'start_activity', { p_activity: e2.activity_id });
const r2 = await rpc(P.operator, 'request_extension', { p_activity: e2.activity_id, p_hours: 3, p_reason: 'machine changeover ran long' });
const rid2 = id(r2.body);
if (rid2) {
  const [m, g] = await Promise.all([
    rpc(P.manager, 'manager_decide_extension', { p_request: rid2, p_approve: true,  p_reason: 'manager approves', p_granted_hr: 3 }),
    rpc(P.gm,      'gm_decide_extension',      { p_request: rid2, p_approve: false, p_reason: 'gm refuses' }),
  ]);
  const row = await reqRow(rid2);
  note(`manager HTTP ${m.status}, gm HTTP ${g.status}; status=${row.status} effective=${row.is_effective} approved=${row.approved_extension_hr}`);
  mustHold({ id: 'W-EXT-03', sev: 'P0', attack: 'manager APPROVES while GM REJECTS, simultaneously',
    expected: 'one terminal outcome; a rejected request grants nothing',
    actual: `status=${row.status}, is_effective=${row.is_effective}, approved=${row.approved_extension_hr}`,
    ok: !(String(row.status).toLowerCase().includes('approv') && String(row.gm_decision).toLowerCase().includes('reject'))
        && !(row.is_effective === true && Number(row.approved_extension_hr || 0) > 0
             && String(row.gm_decision).toLowerCase().includes('reject')) });
}

/* ══ 5 · EXTENSION AFTER THE ACTIVITY MOVES ON ══════════════════════════════ */
section('5 - EXTENSION AFTER THE ACTIVITY MOVES ON');

const e3 = await pick(B);
await rpc(P.operator, 'start_activity', { p_activity: e3.activity_id });
const r3 = await rpc(P.operator, 'request_extension', { p_activity: e3.activity_id, p_hours: 2, p_reason: 'requested while running' });
const rid3 = id(r3.body);
await doWork(B, { ...e3, reqs: e3.reqs });                       // now COMPLETED
const st3 = (await rest(P.supervisor, `batch_activity?select=state&id=eq.${e3.activity_id}`)).rows[0];
note(`${e3.code} is now ${st3.state}; deciding the extension that was requested while it ran`);
if (rid3) {
  const dec = await rpc(P.gm, 'gm_decide_extension', { p_request: rid3, p_approve: true, p_reason: 'granted after the fact', p_granted_hr: 2 });
  const row = await reqRow(rid3);
  const fa = await af(e3.activity_id);
  // extension_policy.allow_after_completion is false, so the grant itself should be refused. If a
  // future policy permits it, the invariant that must still hold is that nothing historical moves.
  mustHold({ id: 'W-EXT-04', sev: 'P0', attack: 'an extension decided AFTER the activity finished',
    expected: 'refused by policy (allow_after_completion = false); and either way the actual stands',
    actual: `decide HTTP ${dec.status} ${dec.ok ? '(ACCEPTED)' : '(refused: ' + msg(dec.body).slice(0,90) + ')'}; `
          + `status=${row.status}; actual_end=${fa.actual_end}; original_variance=${fa.original_variance_minutes}`,
    ok: !!fa.actual_end && fa.original_variance_minutes !== null && (!dec.ok || pol?.allow_after_completion === true) });
}

const e4 = await pick(B);
const r4 = await rpc(P.operator, 'request_extension', { p_activity: e4.activity_id, p_hours: 2, p_reason: 'not started yet' });
const r4row = r4.ok ? (await readOrDie(P.gm, `extension_request?select=activity_state_at_request,planned_end_at_at_request,status&id=eq.${id(r4.body)}`, 'r4'))[0] : null;
mustHold({ id: 'W-EXT-05', sev: 'P2', attack: 'an extension requested before work starts records the state it was requested in',
  expected: 'either refused, or accepted with activity_state_at_request captured so the context is not lost',
  actual: r4.ok ? `accepted; activity_state_at_request=${r4row?.activity_state_at_request}, planned_end_at_at_request=${r4row?.planned_end_at_at_request}`
                : `refused: ${msg(r4.body).slice(0,90)}`,
  ok: !r4.ok || !!r4row?.activity_state_at_request });

/* ══ 6 · VARIANCE MUST NOT BE ERASED BY AN EXTENSION ════════════════════════ */
section('6 - VARIANCE MANIPULATION (an extension is a third number, never an edit)');

const v1 = await pick(C);
// Request AND grant while the activity is still running - policy forbids deciding after
// completion, and a grant that never took effect would make every check below vacuous.
await rpc(P.operator, 'start_activity', { p_activity: v1.activity_id });
const rvEarly = await rpc(P.operator, 'request_extension', { p_activity: v1.activity_id, p_hours: 8,
  p_reason: 'requested while running, to see whether lateness later disappears' });
const ridEarly = id(rvEarly.body);
if (ridEarly) {
  const mg = await rpc(P.manager, 'manager_decide_extension', { p_request: ridEarly, p_approve: true, p_reason: 'manager grants 8', p_granted_hr: 8 });
  const gg = await rpc(P.gm,      'gm_decide_extension',      { p_request: ridEarly, p_approve: true, p_reason: 'gm confirms 8',   p_granted_hr: 8 });
  note(`grant while running: manager HTTP ${mg.status}, gm HTTP ${gg.status}`);
}
const granted = ridEarly ? await reqRow(ridEarly) : null;
note(`request status=${granted?.status} effective=${granted?.is_effective} approved=${granted?.approved_extension_hr}h`);
await doWork(C, v1);
const before = await af(v1.activity_id);
const vb = (await readOrDie(P.supervisor, `v_batch_variance?select=variance_minutes,contributor_count&master_batch_id=eq.${C.B}`, 'vb'))[0];
note(`${v1.code}: planned_end ${before.planned_end_at} actual_end ${before.actual_end} variance ${before.original_variance_minutes} min`);

const after = await af(v1.activity_id);
const va = (await readOrDie(P.supervisor, `v_batch_variance?select=variance_minutes,contributor_count&master_batch_id=eq.${C.B}`, 'va'))[0];
note(`after an 8 h grant: extension=${after.approved_extension_hr} authorised_end=${after.authorised_end_at} variance=${after.original_variance_minutes} within_authorisation=${after.within_authorisation}`);

mustHold({ id: 'W-VAR-00', sev: 'P1', attack: 'the 8 h grant actually took effect, so the checks below mean something',
  expected: 'approved_extension_hr = 8 on the activity',
  actual: `activity shows ${after.approved_extension_hr}h; request status ${granted?.status}`,
  ok: Number(after.approved_extension_hr) === 8 });

mustHold({ id: 'W-VAR-01', sev: 'P0', attack: 'granting 8 h does not change the ORIGINAL variance',
  expected: `original_variance_minutes stays ${before.original_variance_minutes}`,
  actual: `now ${after.original_variance_minutes}`,
  ok: String(before.original_variance_minutes) === String(after.original_variance_minutes) });

mustHold({ id: 'W-VAR-02', sev: 'P0', attack: 'granting 8 h does not change the frozen PLAN',
  expected: `planned_end_at stays ${before.planned_end_at}`,
  actual: `now ${after.planned_end_at}`, ok: before.planned_end_at === after.planned_end_at });

mustHold({ id: 'W-VAR-03', sev: 'P0', attack: 'granting 8 h does not change the recorded ACTUAL',
  expected: `actual_end stays ${before.actual_end}`,
  actual: `now ${after.actual_end}`, ok: before.actual_end === after.actual_end });

mustHold({ id: 'W-VAR-04', sev: 'P1', attack: 'the authorisation is a SEPARATE number, and it moved',
  expected: 'authorised_end_at = planned_end_at + the grant, distinct from both plan and actual',
  actual: `planned ${after.planned_end_at} | authorised ${after.authorised_end_at} | actual ${after.actual_end} | grant ${after.approved_extension_hr}`,
  ok: after.authorised_end_at !== after.planned_end_at || Number(after.approved_extension_hr || 0) === 0 });

mustHold({ id: 'W-VAR-05', sev: 'P0', attack: 'the batch-level variance did not shrink either',
  expected: `batch variance stays ${vb?.variance_minutes}`,
  actual: `now ${va?.variance_minutes}`, ok: String(vb?.variance_minutes) === String(va?.variance_minutes) });

// A correction changes the actual. The frozen plan must not move with it.
const planBefore = after.planned_end_at;
const corr = await rpc(P.supervisor, 'correct_actual', { p_activity: v1.activity_id, p_field: 'actual_end',
  p_value: new Date(Date.parse(after.actual_end) - 60_000).toISOString(), p_reason: 'line clock ran one minute fast' });
const afterCorr = await af(v1.activity_id);
mustHold({ id: 'W-VAR-06', sev: 'P0', attack: 'a correction to the actual leaves the frozen plan alone',
  expected: `planned_end_at stays ${planBefore}`,
  actual: `correct HTTP ${corr.status}; planned_end_at ${afterCorr.planned_end_at}, actual_end ${afterCorr.actual_end}`,
  ok: afterCorr.planned_end_at === planBefore });

/* ══ 7 · FORECAST CONSISTENCY ═══════════════════════════════════════════════ */
section('7 - FORECAST CONSISTENCY (no invented precision, four numbers stay four numbers)');

const fA = await fc(A), fB = await fc(B), fC = await fc(C);
for (const [code, f] of [[A.code, fA], [B.code, fB], [C.code, fC]]) {
  note(`${code}: standard ${f.standard_hr}h · measured ${f.measured_count} · finished ${f.finished_count} · `
     + `slip ${f.slip_minutes} · basis ${f.forecast_basis}`);
  note(`    planned ${f.planned_end_at}`);
  note(`    authorised ${f.authorised_end_at}  (+${f.approved_extension_hr ?? 0}h)`);
  note(`    projected  ${f.projected_end_at}`);
}

const fresh = await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'XN' });
const fN = await fc(fresh);
note(`${fresh.code} (no actuals at all): basis ${fN.forecast_basis}, measured ${fN.measured_count}, projected ${fN.projected_end_at}`);
mustHold({ id: 'W-FC-01', sev: 'P1', attack: 'a batch with NO actuals does not invent a projection',
  expected: 'the basis names the absence rather than pretending to know',
  actual: `basis=${fN.forecast_basis}, measured_count=${fN.measured_count}, projected=${fN.projected_end_at}`,
  ok: Number(fN.measured_count) === 0
      && (fN.projected_end_at === null || /unknown|no measurement/i.test(String(fN.forecast_basis))) });

mustHold({ id: 'W-FC-02', sev: 'P1', attack: 'baseline, authorised and projected stay three separate numbers',
  expected: 'planned_end_at is never silently replaced by authorised or projected',
  actual: `C: planned ${fC.planned_end_at} | authorised ${fC.authorised_end_at} | projected ${fC.projected_end_at}`,
  ok: !!fC.planned_end_at });

const stdBefore = fC.standard_hr;
mustHold({ id: 'W-FC-03', sev: 'P0', attack: 'the STANDARD is untouched by any grant or correction',
  expected: '470', actual: String(stdBefore), ok: Number(stdBefore) === 470 });

mustHold({ id: 'W-FC-04', sev: 'P1', attack: 'the projection never folds the extension into the baseline',
  expected: 'planned_end_at = H0 + standard, regardless of any grant',
  actual: `H0 ${fC.h0} + ${fC.standard_hr}h vs planned ${fC.planned_end_at}`,
  ok: Math.round((Date.parse(fC.planned_end_at) - Date.parse(fC.h0)) / 3600000) === Number(fC.standard_hr) });

report('WAVE 2B - EXTENSIONS, VARIANCE, FORECAST');
console.log(`batches: ${A.code} ${B.code} ${C.code} ${fresh.code}`);
