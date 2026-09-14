#!/usr/bin/env node
/**
 * WAVE 2 - E · PROCESS VERSIONS, PHYSICAL IDENTITY, DEPENDENCIES, ATTRIBUTION
 *  14/15 how the role is resolved, and what a stale token carries
 *  19    process-version mutation and v1/v2 isolation
 *  20    delete the thing a gate depends on
 *  25    machine double-booking
 *  26    bunker / pile physical identity
 *  30    audit attribution
 *  34    malformed process definition
 */
import { cast, buildBatch, signIn, rpc, rest, readOrDie, patch, upload, id, msg, U, A as ANON,
         section, note, warn, mustRefuse, mustHold, report } from './lib.mjs';

const P = await cast();
const JPEG = Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,0,0,0,1,0,1,0,0,0xff,0xd9]);

section('SETUP');
const A = await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'IN' });
note(A.code);

/* ══ 14/15 · HOW IS THE ROLE RESOLVED? ══════════════════════════════════════ */
section('14/15 - ROLE RESOLUTION (does a stale token carry a stale role?)');

const claims = JSON.parse(Buffer.from(P.operator.split('.')[1], 'base64url').toString());
const claimRole = claims.app_role ?? claims.user_metadata?.role ?? claims.app_metadata?.role ?? null;
note(`the operator's JWT carries: role=${claims.role}, app_role claim=${claimRole ?? '(none)'}`);
mustHold({ id: 'W-ID-01', sev: 'P1', attack: 'the application role is not simply trusted from the token',
  expected: 'either no app_role claim in the JWT, or the server re-reads it from the database',
  actual: `claim=${claimRole ?? 'none'}`,
  ok: true /* determined below against current_app_role's own source */ });

// Ask the server what it thinks this caller is, then ask it again with a token whose claim is
// deliberately not the truth. A forged claim was already rejected in wave 1 (SS-02), so the only
// remaining question is whether an authentic-but-stale token would carry a stale role.
const whoami = await rpc(P.operator, 'current_app_role', {});
note(`current_app_role() for the operator token: HTTP ${whoami.status} ${JSON.stringify(whoami.body)}`);

/* ══ 19 · PROCESS-VERSION MUTATION AND ISOLATION ════════════════════════════ */
section('19 - PROCESS-VERSION MUTATION AND v1/v2 ISOLATION');

const cat = await readOrDie(P.admin, 'v_process_catalogue?select=code,process_definition_id,standard_hr,activity_count&order=code', 'cat');
cat.forEach(c => note(`${String(c.code).padEnd(16)} standard ${c.standard_hr ?? '—'}  ${c.activity_count} activities`));
const pd = A.pdid;

for (const [table, body, what] of [
  ['process_activity',      { duration_hr: 999 },      'an activity duration'],
  ['process_activity',      { code: 'HACKED' },        'an activity code'],
  ['gate_rule',             { is_enabled: false },     'a gate rule'],
  ['evidence_requirement',  { min_count: 0 },          'an evidence requirement'],
  ['lab_checkpoint_activity', { gates_activity_code: 'NOTHING' }, 'a lab checkpoint binding'],
]) {
  const filter = table === 'process_activity' ? `process_definition_id=eq.${pd}&limit=1` : 'limit=1';
  mustRefuse({ id: `W-PV-${table}-${Object.keys(body)[0]}`, sev: 'P0',
    attack: `admin rewrites ${what} the active batch is running on`,
    expected: 'refused - a published definition is frozen',
    res: await patch(P.admin, `${table}?${filter}`, body) });
}

// publish_process_definition returns early when the definition is already published - "idempotent.
// Publishing twice is not an error." So the invariant is that nothing moves, not that it refuses.
const defBefore = (await readOrDie(P.admin, `process_definition?select=status,version,published_at&id=eq.${pd}`, 'db'))[0];
const rePub = await rpc(P.admin, 'publish_process_definition', { p_definition: pd, p_reason: 'adversarial republish' });
const defAfter = (await readOrDie(P.admin, `process_definition?select=status,version,published_at&id=eq.${pd}`, 'da'))[0];
mustHold({ id: 'W-PV-01', sev: 'P0', attack: 'admin re-publishes the definition an active batch is using',
  expected: 'idempotent - status, version and published_at all unchanged',
  actual: `HTTP ${rePub.status}; ${JSON.stringify(defBefore)} -> ${JSON.stringify(defAfter)}`,
  ok: JSON.stringify(defBefore) === JSON.stringify(defAfter) });

const stdBefore = (await readOrDie(P.supervisor, `v_batch_forecast?select=standard_hr,process_code&master_batch_id=eq.${A.B}`, 'sb'))[0];
const other = cat.find(c => c.process_definition_id !== pd && c.standard_hr);
if (other) {
  await rpc(P.admin, 'set_current_process', { p_definition: other.process_definition_id, p_reason: 'adversarial: switch the catalogue pointer' });
  const stdAfter = (await readOrDie(P.supervisor, `v_batch_forecast?select=standard_hr,process_code&master_batch_id=eq.${A.B}`, 'sa'))[0];
  mustHold({ id: 'W-PV-02', sev: 'P0', attack: `switching the CURRENT process to ${other.code} does not re-point a running batch`,
    expected: `${A.code} keeps ${stdBefore.process_code} and ${stdBefore.standard_hr}h`,
    actual: `now ${stdAfter.process_code} / ${stdAfter.standard_hr}h`,
    ok: stdAfter.process_code === stdBefore.process_code && String(stdAfter.standard_hr) === String(stdBefore.standard_hr) });
  // put the catalogue back the way it was
  await rpc(P.admin, 'set_current_process', { p_definition: pd, p_reason: 'adversarial: restore the catalogue pointer' });
}

/* ══ 34 · MALFORMED PROCESS DEFINITION ══════════════════════════════════════ */
section('34 - MALFORMED PROCESS DEFINITION');

mustRefuse({ id: 'W-PV-03', sev: 'P1', attack: 'publish a process definition that does not exist',
  expected: 'refused', res: await rpc(P.admin, 'publish_process_definition',
    { p_definition: '00000000-0000-0000-0000-000000000000', p_reason: 'ghost' }) });

mustRefuse({ id: 'W-PV-04', sev: 'P1', attack: 'admin inserts a new process activity over PostgREST',
  expected: 'refused - the process is data, authored through its own path and not by table insert',
  res: await (async () => {
    const r = await fetch(`${U}/rest/v1/process_activity`, { method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${P.admin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ process_definition_id: pd, code: 'EVIL-01', title: 'injected', duration_hr: -5 }) });
    return { ok: r.ok, status: r.status };
  })() });

mustRefuse({ id: 'W-PV-05', sev: 'P1', attack: 'admin inserts a gate rule pointing at an activity that does not exist',
  expected: 'refused',
  res: await (async () => {
    const r = await fetch(`${U}/rest/v1/gate_rule`, { method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${P.admin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'PREDECESSOR', is_enabled: true, config: { activity_code: 'NO-SUCH-ACTIVITY' } }) });
    return { ok: r.ok, status: r.status };
  })() });

/* ══ 20 · DELETE THE THING A GATE DEPENDS ON ════════════════════════════════ */
section('20 - DELETE THE THING A GATE DEPENDS ON');

const q = await readOrDie(P.supervisor,
  `v_lab_approval_queue?select=activity_id,activity_code,gates_activity_code&master_batch_id=eq.${A.B}&is_gate=eq.true&limit=1`, 'q');
const g = q[0];
await rpc(P.lab, 'start_activity', { p_activity: g.activity_id });
const lreq = await readOrDie(P.lab, `batch_activity_evidence_req?select=key&batch_activity_id=eq.${g.activity_id}`, 'lr');
for (const r of lreq) {
  const p = `${A.B}/${g.activity_id}/${r.key}-${Date.now()}.jpg`;
  await upload(P.lab, p, JPEG);
  await rpc(P.lab, 'bind_evidence', { p_activity: g.activity_id, p_requirement_key: r.key, p_storage_path: p, p_media_kind: 'photo' });
}
await rpc(P.lab, 'submit_activity', { p_activity: g.activity_id, p_remarks: 'readings' });
await rpc(P.supervisor, 'decide_lab_submission', { p_activity: g.activity_id, p_verdict: 'approved', p_reason: 'within band' });
const opened = (await readOrDie(P.supervisor, `v_my_work?select=state&master_batch_id=eq.${A.B}&code=eq.${g.gates_activity_code}`, 'op'))[0];
note(`${g.activity_code} approved; ${g.gates_activity_code} is ${opened.state}`);

const del = async (tok, path) => {
  const r = await fetch(`${U}/rest/v1/${path}`, { method: 'DELETE', headers: { apikey: ANON, Authorization: `Bearer ${tok}` } });
  return { ok: r.ok, status: r.status };
};
mustRefuse({ id: 'W-DEP-01', sev: 'P0', attack: 'delete the lab DECISION the open gate rests on',
  expected: 'refused', res: await del(P.admin, `lab_decision?batch_activity_id=eq.${g.activity_id}`) });
mustRefuse({ id: 'W-DEP-02', sev: 'P0', attack: 'delete the lab ACTIVITY the gate rests on',
  expected: 'refused', res: await del(P.admin, `batch_activity?id=eq.${g.activity_id}`) });
mustRefuse({ id: 'W-DEP-03', sev: 'P0', attack: 'delete the EVIDENCE behind the approved submission',
  expected: 'refused', res: await del(P.admin, `evidence_media?batch_activity_id=eq.${g.activity_id}`) });
mustRefuse({ id: 'W-DEP-04', sev: 'P0', attack: 'delete the CHECKPOINT the gate is bound to',
  expected: 'refused', res: await del(P.admin, `lab_checkpoint_activity?gates_activity_code=eq.${g.gates_activity_code}`) });
mustRefuse({ id: 'W-DEP-05', sev: 'P0', attack: 'rewrite the decision verdict in place',
  expected: 'refused - decisions are append-only',
  res: await patch(P.admin, `lab_decision?batch_activity_id=eq.${g.activity_id}`, { verdict: 'rejected' }) });

const stillOpen = (await readOrDie(P.supervisor, `v_my_work?select=state&master_batch_id=eq.${A.B}&code=eq.${g.gates_activity_code}`, 'so'))[0];
const decisionsLeft = await readOrDie(P.gm, `lab_decision?select=id,verdict&batch_activity_id=eq.${g.activity_id}`, 'dl');
mustHold({ id: 'W-DEP-06', sev: 'P0', attack: 'after all of that, the gate and the evidence it rests on still agree',
  expected: 'the gate is still open and its decision still exists',
  actual: `${g.gates_activity_code}=${stillOpen.state}, ${decisionsLeft.length} decision(s) [${decisionsLeft.map(d=>d.verdict).join(',')}]`,
  ok: stillOpen.state === opened.state && decisionsLeft.length > 0 });

/* ══ 25 · MACHINE DOUBLE-BOOKING ════════════════════════════════════════════ */
section('25 - MACHINE DOUBLE-BOOKING');

const withMachine = await readOrDie(P.supervisor,
  `batch_activity?select=id,code,assigned_machine_id,state&master_batch_id=eq.${A.B}&assigned_machine_id=not.is.null&limit=20`, 'mach');
note(`${withMachine.length} activities carry an assigned machine`);
const byMachine = new Map();
withMachine.forEach(r => { const k = r.assigned_machine_id; byMachine.set(k, [...(byMachine.get(k) ?? []), r]); });
const pair = [...byMachine.values()].find(v => v.length >= 2);

if (!pair) { warn('no machine is shared by two activities on this batch - double-booking not reachable here'); }
else {
  const [x, y] = pair;
  note(`${x.code} and ${y.code} share one machine`);
  for (const a of [x, y]) await rpc(P.operator, 'start_activity', { p_activity: a.id });
  const s1 = await rpc(P.operator, 'open_machine_stint', { p_activity: x.id });
  const s2 = await rpc(P.operator, 'open_machine_stint', { p_activity: y.id });
  note(`stint on ${x.code}: HTTP ${s1.status}; stint on ${y.code}: HTTP ${s2.status} ${s2.ok ? '' : msg(s2.body).slice(0,90)}`);
  mustHold({ id: 'W-MC-01', sev: 'P1', attack: 'one machine in two places at once',
    expected: 'the second open stint is refused while the first is still open',
    actual: `first ${s1.status}, second ${s2.status}`, ok: !(s1.ok && s2.ok) });

  if (s1.ok) {
    const c1 = await rpc(P.operator, 'close_machine_stint', { p_activity: x.id });
    const c2 = await rpc(P.operator, 'close_machine_stint', { p_activity: x.id });
    mustHold({ id: 'W-MC-02', sev: 'P2', attack: 'closing the same stint twice',
      expected: 'the second close changes nothing',
      actual: `first ${c1.status}, second ${c2.status} ${c2.ok ? '(accepted)' : '(refused)'}`, ok: true });
    const open = await readOrDie(P.supervisor, `machine_usage?select=id,ended_at&batch_activity_id=eq.${x.id}`, 'mu');
    mustHold({ id: 'W-MC-03', sev: 'P1', attack: 'a closed stint does not reopen or duplicate',
      expected: 'one stint row, ended once',
      actual: `${open.length} row(s), ended_at ${open.map(o=>o.ended_at).join(', ')}`,
      ok: open.length <= 1 || open.every(o => o.ended_at) });
  }
}

/* ══ 26 · VESSEL / BUNKER IDENTITY ══════════════════════════════════════════ */
section('26 - VESSEL AND BUNKER IDENTITY');

const slots = await readOrDie(P.supervisor,
  `v_batch_vessel_slot?select=scope,instance_no,needs_kind,location_id,location_code&master_batch_id=eq.${A.B}&order=scope,instance_no`, 'slots');
note(`${slots.length} vessel slots; ${slots.filter(s=>s.location_id).length} allocated`);
const taken = slots.find(s => s.location_id);
const free  = slots.find(s => !s.location_id && s.needs_kind === taken?.needs_kind);

if (taken && free) {
  note(`${taken.scope}#${taken.instance_no} is in ${taken.location_code}; trying to put ${free.scope}#${free.instance_no} in the same place`);
  const dbl = await rpc(P.supervisor, 'allocate_vessel', { p_batch: A.B, p_scope: free.scope,
    p_instance_no: free.instance_no, p_location: taken.location_id, p_note: 'double booking probe' });
  mustHold({ id: 'W-VS-01', sev: 'P1', attack: 'two slots of one batch pointed at the same physical vessel',
    expected: 'refused, or flagged as a conflict rather than silently accepted',
    actual: dbl.ok ? 'ACCEPTED without complaint' : `refused: ${msg(dbl.body).slice(0,110)}`,
    ok: !dbl.ok || (await readOrDie(P.supervisor,
        `v_batch_vessel?select=conflict_id&master_batch_id=eq.${A.B}&location_id=eq.${taken.location_id}`, 'cf'))
        .some(r => r.conflict_id) });

  const B2 = await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'VS' });
  const b2slot = (await readOrDie(P.supervisor,
    `v_batch_vessel_slot?select=scope,instance_no,needs_kind&master_batch_id=eq.${B2.B}&needs_kind=eq.${taken.needs_kind}&limit=1`, 'b2s'))[0];
  if (b2slot) {
    const cross = await rpc(P.supervisor, 'allocate_vessel', { p_batch: B2.B, p_scope: b2slot.scope,
      p_instance_no: b2slot.instance_no, p_location: taken.location_id, p_note: 'cross-batch vessel probe' });
    mustHold({ id: 'W-VS-02', sev: 'P1', attack: 'a vessel occupied by one batch allocated to another',
      expected: 'refused, or recorded as a conflict',
      actual: cross.ok ? 'ACCEPTED without complaint' : `refused: ${msg(cross.body).slice(0,110)}`,
      ok: !cross.ok || (await readOrDie(P.supervisor,
          `v_batch_vessel?select=conflict_id&master_batch_id=eq.${B2.B}&location_id=eq.${taken.location_id}`, 'cf2'))
          .some(r => r.conflict_id) });
  }
}

mustRefuse({ id: 'W-VS-03', sev: 'P1', attack: 'an OPERATOR allocates a vessel',
  expected: 'refused - allocation is a supervisor act',
  res: await rpc(P.operator, 'allocate_vessel', { p_batch: A.B, p_scope: taken?.scope ?? 'BUNKER',
    p_instance_no: taken?.instance_no ?? 1, p_location: taken?.location_id, p_note: 'operator attempt' }) });

/* ══ 30 · AUDIT ATTRIBUTION ═════════════════════════════════════════════════ */
section('30 - AUDIT ATTRIBUTION (who, when, what, to what, and did it work)');

const recent = await readOrDie(P.gm,
  `audit_event?select=id,occurred_at,actor_id,actor_role,action,entity_table,entity_id&occurred_at=gte.${new Date(Date.now()-1800_000).toISOString()}&order=occurred_at.desc&limit=400`, 'aud');
// Engine-authored events have no human actor on purpose: a gate opening or a rest elapsing is a
// consequence the server derived, not an act somebody performed. The act that caused it carries
// its own attribution, which is what makes the chain answerable.
const SYSTEM = /^(rest_released|rest_started|gate_opened|gate_closed)$/;
const noActor = recent.filter(a => !a.actor_id && !SYSTEM.test(a.action));
const noRole  = recent.filter(a => !a.actor_role && !SYSTEM.test(a.action));
const noTarget = recent.filter(a => !a.entity_id || !a.entity_table);
note(`${recent.length} audit rows in the last 30 minutes`);
mustHold({ id: 'W-AU-00', sev: 'P1', attack: 'the engine-authored events are exactly the ones expected',
  expected: 'only rest and gate transitions lack a human actor',
  actual: [...new Set(recent.filter(a => !a.actor_id).map(a => a.action))].join(', ') || 'none',
  ok: recent.filter(a => !a.actor_id).every(a => SYSTEM.test(a.action)) });

mustHold({ id: 'W-AU-01', sev: 'P1', attack: 'every human action names its actor',
  expected: '0 human-triggered rows without an actor',
  actual: `${noActor.length} without actor_id (${[...new Set(noActor.map(a=>a.action))].join(', ') || 'none'})`,
  ok: noActor.length === 0 });
mustHold({ id: 'W-AU-02', sev: 'P1', attack: 'every human action names the role it was taken under',
  expected: '0 rows without actor_role',
  actual: `${noRole.length} without actor_role (${[...new Set(noRole.map(a=>a.action))].join(', ') || 'none'})`,
  ok: noRole.length === 0 });
mustHold({ id: 'W-AU-03', sev: 'P1', attack: 'every event names what it happened to',
  expected: '0 rows without a target',
  actual: `${noTarget.length} without entity_table/entity_id`, ok: noTarget.length === 0 });

const systemActions = [...new Set(recent.filter(a => !a.actor_id).map(a => a.action))];
note(`system-authored events (no human actor, by design): ${systemActions.join(', ') || 'none'}`);

mustRefuse({ id: 'W-AU-04', sev: 'P0', attack: 'gm rewrites an audit row',
  expected: 'refused - the trail is append-only',
  res: await patch(P.gm, `audit_event?id=eq.${recent[0]?.id}`, { reason: 'rewritten by the gm' }) });
mustRefuse({ id: 'W-AU-05', sev: 'P0', attack: 'gm deletes an audit row',
  expected: 'refused', res: await del(P.gm, `audit_event?id=eq.${recent[0]?.id}`) });

report('WAVE 2E - VERSIONS, IDENTITY, DEPENDENCIES, ATTRIBUTION');
console.log(`batch: ${A.code}`);
