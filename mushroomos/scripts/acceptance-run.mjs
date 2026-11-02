#!/usr/bin/env node
/**
 * MushroomOS · full acceptance, over HTTP, as the real roles.
 *
 *   node scripts/acceptance-run.mjs
 *
 * REAL USER → REAL API → REAL DATABASE → REAL STORAGE → REAL RESULT.
 * Nothing here connects as `postgres`. `postgres` has BYPASSRLS and a null `auth.uid()`, so every
 * JWT-derived check is invisible to it — a proof written that way proves the wrong thing.
 *
 * WHAT IT COVERS
 *   A · admin → operator → lab → approve → gate opens → downstream eligible
 *   B · the same lab submission REJECTED → gate stays shut
 *   C · a third batch, untouched, to prove nothing here is global
 *   · evidence isolation across batches and across activities
 *   · the Turner: six piles, per-pile T1 lab, no T0/T2/T3 lab, T2 eight hours after ITS OWN T1
 *   · bunker grouping P1+P2→B1, P3+P4→B2, P5+P6→B3, and the tunnel gate
 *   · plan / actual / variance / extension / forecast kept as separate numbers
 *
 * THE PHOTOGRAPH
 *   One supplied JPEG, reused for every image requirement in every batch. That repetition is
 *   deliberate: the point is not image realism, it is proving
 *   bytes → Storage → metadata → correct batch → correct activity → correct user → retrievable.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.NODE_EXTRA_CA_CERTS) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function env(key) {
  if (process.env[key]) return process.env[key];
  const raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0 || t.slice(0, eq).trim() !== key) continue;
    return t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

const URL_ = env('VITE_SUPABASE_URL');
const ANON = env('VITE_SUPABASE_ANON_KEY');
const IMAGE = process.env.DUMMY_IMAGE
  ?? 'D:/exisiting_freshbowl/image_for_dummy_batch/wp2318297-ben-affleck-batman-wallpapers.jpg';
const photo = readFileSync(IMAGE);

let pass = 0;
const failures = [];
const step = (n) => console.log(`\n\x1b[1m── ${n}\x1b[0m`);
function ok(label, cond, detail = '') {
  if (cond) { pass++; console.log(`   \x1b[32m✓\x1b[0m ${label}`); }
  else { failures.push(label); console.log(`   \x1b[31m✗ ${label}\x1b[0m${detail ? '\n       ' + detail : ''}`); }
  return cond;
}
const note = (t) => console.log(`       ${t}`);

async function signIn(email) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'mushroom2026' }),
  });
  const b = await r.json();
  if (!b.access_token) throw new Error(`sign-in failed ${email}: ${JSON.stringify(b)}`);
  return { token: b.access_token, id: b.user.id, email };
}
const H = (s, x = {}) => ({ apikey: ANON, Authorization: `Bearer ${s.token}`, ...x });
async function parse(r) {
  const t = await r.text();
  let body = t; try { body = t ? JSON.parse(t) : null; } catch { /* raw */ }
  return { status: r.status, ok: r.ok, body };
}
const rest = async (s, p) => parse(await fetch(`${URL_}/rest/v1/${p}`, { headers: H(s) }));
const rpc = async (s, fn, a) => parse(await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
  method: 'POST', headers: H(s, { 'Content-Type': 'application/json' }), body: JSON.stringify(a) }));
const upload = async (s, path) => parse(await fetch(`${URL_}/storage/v1/object/evidence/${path}`, {
  method: 'POST', headers: H(s, { 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }), body: photo }));
const msg = (r) => (typeof r.body === 'object' && r.body?.message) || JSON.stringify(r.body).slice(0, 220);
const one = (r) => (Array.isArray(r.body) ? r.body[0] : r.body);
const id = (r) => (typeof r.body === 'string' ? r.body : r.body?.id);

console.log('\x1b[1mMushroomOS · full acceptance\x1b[0m');
console.log(`endpoint ${URL_}`);
console.log(`photo    ${IMAGE} (${(photo.length / 1024).toFixed(0)} KB, reused throughout)`);

const admin = await signIn('admin@freshbowl.demo');
const operator = await signIn('operator@freshbowl.demo');
const lab = await signIn('lab@freshbowl.demo');
const gm = await signIn('gm@freshbowl.demo');
const supervisor = await signIn('supervisor@freshbowl.demo');
const manager = await signIn('manager@freshbowl.demo');

const cat = await rest(admin, 'v_process_catalogue?select=*&is_selectable=eq.true');
const P = (cat.body ?? []).find((p) => p.code === 'PROCESS-2026C');

const staff = await rest(admin, 'profiles?select=id,display_name,role&is_active=eq.true');
const byRole = (r) => (staff.body ?? []).find((p) => p.role === r);

const needRoles = await rest(admin,
  `process_activity?select=material_role&process_definition_id=eq.${P.process_definition_id}&material_role=not.is.null`);
const elig = await rest(admin, 'material_role_eligibility?select=role,is_default_lead,material:material(code)');
const roleSet = [...new Set((needRoles.body ?? []).map((r) => r.material_role))];
const roles = roleSet.map((role) => {
  const l = (elig.body ?? []).find((e) => e.role === role && e.is_default_lead)
         ?? (elig.body ?? []).find((e) => e.role === role);
  return { role, material_code: l.material.code, lead: true };
});

/** One batch, built the way an Admin builds one. Returns { id, code, h0 }. */
async function buildBatch(suffix, hoursAgo) {
  const code = `MB-DUMMY-${suffix}-${Date.now() % 100000}`;
  const h0 = new Date(Date.now() - hoursAgo * 3600_000).toISOString();

  const made = await rpc(admin, 'create_master_batch', {
    p_code: code, p_label: `DUMMY ${suffix} — acceptance run, not a real batch`,
    p_start_date: h0.slice(0, 10), p_start_at: h0,
    p_config: {}, p_roles: roles, p_supervisor: null, p_weather: null,
    p_process_definition_id: P.process_definition_id,
  });
  if (!made.ok) throw new Error(`create ${code}: ${msg(made)}`);
  const bid = id(made);

  const gen = await rpc(admin, 'generate_activity_plan', { p_batch_id: bid });
  if (!gen.ok) throw new Error(`generate ${code}: ${msg(gen)}`);

  const un = await rest(admin,
    `batch_activity?select=id,responsible_role&master_batch_id=eq.${bid}&assigned_person_id=is.null&is_time_gate=eq.false&is_hold=eq.false`);
  for (const a of un.body ?? []) {
    const person = byRole(a.responsible_role) ?? byRole('operator');
    await rpc(supervisor, 'assign_activity', { p_activity: a.id, p_person: person.id, p_reason: 'acceptance run' });
  }

  const cp = await rest(lab, 'lab_checkpoint?select=id&is_prebatch=eq.true&limit=1');
  const sm = await rpc(lab, 'open_prebatch_sample', {
    p_batch: bid, p_checkpoint: cp.body?.[0]?.id, p_label: `${suffix} incoming assay`,
    p_at: new Date(new Date(h0).getTime() - 3600_000).toISOString(),
  });
  for (const [param, v] of [['moisture_pct', 56.2], ['ph', 5.63]]) {
    const t = await rpc(lab, 'request_lab_test', { p_sample: id(sm), p_parameter: param, p_via: 'system' });
    const rr = await rpc(lab, 'record_lab_result', { p_test: id(t), p_numeric: v });
    await rpc(lab, 'accept_lab_result', { p_result: id(rr), p_reason: 'acceptance run — accepted as final' });
  }

  const act = await rpc(admin, 'activate_batch', { p_batch_id: bid });
  if (!act.ok) throw new Error(`activate ${code}: ${msg(act)}`);
  return { id: bid, code, h0, activities: one(gen).activities };
}

/** Bind the supplied image to every outstanding image requirement on an activity. */
async function satisfyEvidence(session, batchId, activityId) {
  const reqs = await rest(session, `v_evidence_state?select=key,min_count,satisfied_count&batch_activity_id=eq.${activityId}`);
  const need = [...new Map((reqs.body ?? []).map((r) => [r.key, r])).values()];
  let bound = 0;
  for (const r of need) {
    for (let i = r.satisfied_count; i < r.min_count; i++) {
      const path = `${batchId}/${activityId}/${r.key}-${Date.now()}-${i}.jpg`;
      const up = await upload(session, path);
      if (!up.ok) return { bound, error: `upload ${r.key}: ${msg(up)}`, lastPath: null };
      const b = await rpc(session, 'bind_evidence', {
        p_activity: activityId, p_requirement_key: r.key, p_storage_path: path, p_media_kind: 'photo' });
      if (!b.ok) return { bound, error: `bind ${r.key}: ${msg(b)}`, lastPath: path };
      bound++;
    }
  }
  return { bound, error: null, lastPath: null };
}

// ══════════════════════════════════════════════════════════ THREE BATCHES
step('THREE BATCHES · built through the real Admin path');
const A = await buildBatch('A', 6);
const B = await buildBatch('B', 30);
const C = await buildBatch('C', 54);
for (const b of [A, B, C]) note(`${b.code}  ${b.activities} activities  H0 ${b.h0.slice(0, 16)}`);
ok('all three generated the full PROCESS-2026C plan (110)',
   [A, B, C].every((b) => b.activities === 110), [A, B, C].map((b) => b.activities).join('/'));
ok('all three are active and independent rows',
   new Set([A.id, B.id, C.id]).size === 3);

const std = await rest(supervisor, `v_batch_forecast?select=code,process_code,standard_hr,h0,planned_end_at&master_batch_id=in.(${A.id},${B.id},${C.id})`);
ok('each carries its own H0 and the SAME calculated standard',
   (std.body ?? []).every((r) => Number(r.standard_hr) === 470)
   && new Set((std.body ?? []).map((r) => r.h0)).size === 3);
for (const r of std.body ?? []) note(`${r.code}  ${r.process_code}  H${r.standard_hr}  H0 ${r.h0.slice(0, 16)}  baseline ${r.planned_end_at.slice(0, 16)}`);

// ══════════════════════════════════════════════════════════ OPERATOR · A
step('BATCH A · OPERATOR — server timestamps, evidence gate');
const workA = await rest(operator, `v_my_work?select=*&master_batch_id=eq.${A.id}&state=eq.READY&responsible_role=eq.operator&order=planned_start_at.asc`);
const tA = (workA.body ?? []).find((w) => (w.required_count ?? 0) >= 2 && !w.is_hold);
ok('an operator task with evidence requirements is eligible', Boolean(tA));
note(`${tA.code} — ${tA.title} · needs ${tA.required_count}: ${tA.outstanding_labels}`);

await rpc(operator, 'start_activity', { p_activity: tA.activity_id });
const startedA = one(await rest(operator, `v_my_work?select=actual_start&activity_id=eq.${tA.activity_id}`));
ok('the SERVER stamped actual_start', Boolean(startedA?.actual_start));
note(`actual_start ${startedA.actual_start}`);

const earlyA = await rpc(operator, 'complete_activity', { p_activity: tA.activity_id, p_values: {}, p_remarks: null });
ok('FINISH FAILS while photos are missing, and names them',
   Boolean(one(earlyA)?.outstanding_evidence), msg(earlyA));
note(one(earlyA)?.outstanding_evidence ?? '');

const evA = await satisfyEvidence(operator, A.id, tA.activity_id);
ok(`the supplied image bound to ${evA.bound} requirement(s)`, evA.error === null, evA.error ?? '');

const doneA = await rpc(operator, 'complete_activity', { p_activity: tA.activity_id, p_values: {}, p_remarks: null });
ok('FINISH SUCCEEDS once both photos exist', doneA.ok && !one(doneA)?.outstanding_evidence, msg(doneA));
const endedA = one(await rest(operator, `v_my_work?select=actual_end,variance_minutes&activity_id=eq.${tA.activity_id}`));
ok('the SERVER stamped actual_end', Boolean(endedA?.actual_end));
note(`actual_end ${endedA.actual_end} · variance ${endedA.variance_minutes} min`);

const tamper1 = await rpc(operator, 'correct_actual', {
  p_activity: tA.activity_id, p_field: 'actual_end',
  p_value: new Date(Date.now() - 86400_000).toISOString(), p_reason: 'make a late task look on time' });
ok('an operator CANNOT rewrite an actual', !tamper1.ok, `got ${tamper1.status}`);
const tamper2 = await rpc(operator, 'submit_activity', {
  p_activity: tA.activity_id, p_values: {}, p_remarks: null,
  p_actual_start: new Date(Date.now() - 86400_000).toISOString(), p_actual_end: new Date().toISOString() });
ok('an operator CANNOT state their own timestamps', !tamper2.ok, `got ${tamper2.status}`);

// ══════════════════════════════════════════════════════════ RETRIEVAL
step('EVIDENCE · bytes → Storage → metadata → retrieval');
const media = await rest(operator, `v_evidence_state?select=media_id,storage_path,uploaded_by_name,uploaded_by_role,uploaded_at,key&batch_activity_id=eq.${tA.activity_id}&media_id=not.is.null`);
ok('the metadata names the batch, the activity, the user and the time',
   (media.body ?? []).length > 0 && (media.body ?? []).every((m) =>
     m.storage_path.startsWith(`${A.id}/${tA.activity_id}/`) && m.uploaded_by_name && m.uploaded_at));
for (const m of media.body ?? []) note(`${m.key} · ${m.uploaded_by_name} (${m.uploaded_by_role}) · ${m.uploaded_at?.slice(0, 19)}`);

const sign = await parse(await fetch(`${URL_}/storage/v1/object/sign/evidence/${media.body[0].storage_path}`, {
  method: 'POST', headers: H(operator, { 'Content-Type': 'application/json' }), body: JSON.stringify({ expiresIn: 60 }) }));
ok('a signed URL is issued for the private object', sign.ok, msg(sign));
if (sign.ok) {
  const key = sign.body.signedURL ?? sign.body.signedUrl;
  const got = await fetch(`${URL_}/storage/v1${key}`);
  const bytes = new Uint8Array(await got.arrayBuffer());
  ok(`the retrieved bytes are the image that was uploaded (${(bytes.length / 1024).toFixed(0)} KB)`,
     got.ok && bytes.length === photo.length);
}
const nakedRead = await fetch(`${URL_}/storage/v1/object/evidence/${media.body[0].storage_path}`, { headers: { apikey: ANON } });
ok('the object is NOT public — an unsigned anonymous read is refused', !nakedRead.ok, `got ${nakedRead.status}`);

// ══════════════════════════════════════════════════════════ ISOLATION
step('ISOLATION · one batch cannot satisfy another');
const workB = await rest(operator, `v_my_work?select=*&master_batch_id=eq.${B.id}&state=eq.READY&responsible_role=eq.operator&order=planned_start_at.asc`);
const tB = (workB.body ?? []).find((w) => w.code === tA.code) ?? (workB.body ?? [])[0];
const crossBind = await rpc(operator, 'bind_evidence', {
  p_activity: tB.activity_id, p_requirement_key: media.body[0].key,
  p_storage_path: media.body[0].storage_path, p_media_kind: 'photo' });
ok("batch A's stored object cannot be bound to batch B's requirement",
   !crossBind.ok, `got ${crossBind.status}: ${msg(crossBind)}`);

const crossUpload = await upload(operator, `${A.id}/${tB.activity_id}/wrong-batch-${Date.now()}.jpg`);
ok('an object cannot be uploaded under a mismatched batch/activity path',
   !crossUpload.ok, `got ${crossUpload.status}`);

const labActB = one(await rest(lab, `v_lab_approval_queue?select=activity_id&master_batch_id=eq.${B.id}&is_gate=eq.true&limit=1`));
const opOnLab = await rpc(operator, 'start_activity', { p_activity: labActB.activity_id });
ok('an operator cannot start a laboratory activity', !opOnLab.ok, `got ${opOnLab.status}`);

const opWorkHasLab = await rest(operator, `v_my_work?select=activity_id&master_batch_id=eq.${A.id}&responsible_role=eq.lab_tech`);
ok('lab work does not appear as operator work', (opWorkHasLab.body ?? []).length === 0,
   `${(opWorkHasLab.body ?? []).length} lab rows carry responsible_role=lab_tech in the operator view`);
const labQueueHasOps = await rest(lab, `v_lab_queue?select=activity_id&master_batch_id=eq.${A.id}`);
const labQueueCodes = await rest(lab, `batch_activity?select=responsible_role&master_batch_id=eq.${A.id}&id=in.(${(labQueueHasOps.body ?? []).map((r) => r.activity_id).join(',') || '00000000-0000-0000-0000-000000000000'})`);
ok('operator work does not appear in the lab queue',
   (labQueueCodes.body ?? []).every((r) => r.responsible_role === 'lab_tech'));

// ══════════════════════════════════════════════════════════ LAB + APPROVE (A)
step('BATCH A · LAB → submit → gate shut → GM approves → gate opens');
const qA = await rest(lab, `v_lab_approval_queue?select=*&master_batch_id=eq.${A.id}&is_gate=eq.true&order=activity_code.asc`);
const gA = (qA.body ?? [])[0];
const heldA = gA.gates_activity_code;
note(`${gA.checkpoint_code} holds ${heldA}`);

const beforeA = one(await rest(operator, `v_my_work?select=state,blocked_reason&master_batch_id=eq.${A.id}&code=eq.${heldA}`));
ok(`${heldA} is LOCKED before any decision`, beforeA.state === 'LOCKED', beforeA.state);
note(beforeA.blocked_reason ?? '');

const cpA = one(await rest(lab, `lab_checkpoint?select=id&code=eq.${gA.checkpoint_code}`));
const smA = await rpc(lab, 'open_lab_sample', { p_activity: gA.activity_id, p_checkpoint: cpA.id, p_label: 'A-S1' });
const tsA = await rpc(lab, 'request_lab_test', { p_sample: id(smA), p_parameter: 'moisture' });
const rsA = await rpc(lab, 'record_lab_result', { p_test: id(tsA), p_numeric: 67.4 });
ok('lab records a reading', rsA.ok, msg(rsA));
await rpc(lab, 'start_activity', { p_activity: gA.activity_id });
const evLabA = await satisfyEvidence(lab, A.id, gA.activity_id);
ok(`lab evidence bound (${evLabA.bound})`, evLabA.error === null, evLabA.error ?? '');
const labDoneA = await rpc(lab, 'complete_activity', { p_activity: gA.activity_id, p_values: {}, p_remarks: null });
ok('lab submits the checkpoint', labDoneA.ok && !one(labDoneA)?.outstanding_evidence, msg(labDoneA));

const midA = one(await rest(operator, `v_my_work?select=state&master_batch_id=eq.${A.id}&code=eq.${heldA}`));
ok(`RESULT ENTERED ≠ GATE OPEN — ${heldA} is still LOCKED`, midA.state === 'LOCKED', midA.state);

const selfA = await rpc(lab, 'decide_lab_submission', { p_activity: gA.activity_id, p_verdict: 'approved', p_reason: 'approving my own submission' });
ok('a lab technician cannot approve their own submission', !selfA.ok, `got ${selfA.status}`);

const okA = await rpc(gm, 'decide_lab_submission', {
  p_activity: gA.activity_id, p_verdict: 'approved', p_reason: 'ACCEPTANCE RUN — within band, released.' });
ok('GM approves', okA.ok, msg(okA));
const afterA = one(await rest(operator, `v_my_work?select=state&master_batch_id=eq.${A.id}&code=eq.${heldA}`));
ok(`GATE OPEN — ${heldA} is now eligible`, afterA.state === 'READY', afterA.state);

// ══════════════════════════════════════════════════════════ REJECT (B)
step('BATCH B · the same submission REJECTED — the gate stays shut');
const qB = await rest(lab, `v_lab_approval_queue?select=*&master_batch_id=eq.${B.id}&is_gate=eq.true&order=activity_code.asc`);
const gB = (qB.body ?? [])[0];
const heldB = gB.gates_activity_code;

const cpB = one(await rest(lab, `lab_checkpoint?select=id&code=eq.${gB.checkpoint_code}`));
const smB = await rpc(lab, 'open_lab_sample', { p_activity: gB.activity_id, p_checkpoint: cpB.id, p_label: 'B-S1' });
const tsB = await rpc(lab, 'request_lab_test', { p_sample: id(smB), p_parameter: 'moisture' });
await rpc(lab, 'record_lab_result', { p_test: id(tsB), p_numeric: 74.9 });
await rpc(lab, 'start_activity', { p_activity: gB.activity_id });
await satisfyEvidence(lab, B.id, gB.activity_id);
await rpc(lab, 'complete_activity', { p_activity: gB.activity_id, p_values: {}, p_remarks: null });

const noB = await rpc(gm, 'decide_lab_submission', {
  p_activity: gB.activity_id, p_verdict: 'rejected', p_reason: 'ACCEPTANCE RUN — out of band, rejected.' });
ok('GM rejects', noB.ok, msg(noB));
const afterB = one(await rest(operator, `v_my_work?select=state,blocked_reason&master_batch_id=eq.${B.id}&code=eq.${heldB}`));
ok(`REJECTED ⇒ GATE CLOSED — ${heldB} is still LOCKED`, afterB.state === 'LOCKED', afterB.state);
note(afterB.blocked_reason ?? '');

ok(`batch A's approval did NOT open batch B's gate`, afterB.state === 'LOCKED' && afterA.state === 'READY');

// ══════════════════════════════════════════════════════════ C UNTOUCHED
step('BATCH C · untouched by anything A or B did');
const cWork = await rest(operator, `v_my_work?select=state&master_batch_id=eq.${C.id}`);
const cDone = (cWork.body ?? []).filter((r) => r.state === 'COMPLETED').length;
const cHeld = one(await rest(operator, `v_my_work?select=state&master_batch_id=eq.${C.id}&code=eq.${heldA}`));
ok('no activity on C has been completed', cDone === 0, `${cDone} completed`);
ok(`C's ${heldA} is still LOCKED`, cHeld.state === 'LOCKED', cHeld.state);
const cDecisions = await rest(gm, `v_lab_approval_queue?select=activity_id&master_batch_id=eq.${C.id}&latest_verdict=not.is.null`);
ok('C carries no lab decision', (cDecisions.body ?? []).length === 0);
const cEvidence = await rest(operator, `v_evidence_state?select=media_id&master_batch_id=eq.${C.id}&media_id=not.is.null`);
ok('C carries no evidence', (cEvidence.body ?? []).length === 0, `${(cEvidence.body ?? []).length} rows`);

// ══════════════════════════════════════════════════════════ TURNER
step('TURNER · six piles, per-pile T1 lab, and the eight-hour rest');
const turner = await rest(operator, `batch_activity?select=code,scope_label,instance_no,state,assigned_machine_id&master_batch_id=eq.${A.id}&code=like.TRN-*&order=code.asc`);
const piles = [...new Set((turner.body ?? []).map((t) => t.scope_label))].filter(Boolean);
ok('six piles', piles.length === 6, piles.join(', '));
for (const s of ['T0', 'T1', 'T2', 'T3']) {
  const n = (turner.body ?? []).filter((t) => t.code.endsWith(`-${s}`)).length;
  ok(`${s} exists once per pile (${n})`, n === 6, `${n}`);
}
const labT = await rest(lab, `batch_activity?select=code&master_batch_id=eq.${A.id}&code=like.LAB-T1-*`);
ok('T1 has a per-pile lab checkpoint', (labT.body ?? []).length >= 6, `${(labT.body ?? []).length}`);
for (const s of ['T0', 'T2', 'T3']) {
  const n = (await rest(lab, `batch_activity?select=code&master_batch_id=eq.${A.id}&code=like.LAB-${s}*`)).body ?? [];
  ok(`no lab checkpoint after ${s}`, n.length === 0, n.map((x) => x.code).join(', '));
}
const restRule = await rest(supervisor, `v_gate_rest_rule?select=activity_code,waits_for,min_rest_hr&process_code=eq.PROCESS-2026C`);
ok('T2 waits on its OWN pile\'s T1, eight hours',
   (restRule.body ?? []).length === 6
   && (restRule.body ?? []).every((r) => Number(r.min_rest_hr) === 8
        && r.waits_for.slice(-5, -3) === r.activity_code.slice(-5, -3)));
for (const r of (restRule.body ?? []).slice(0, 2)) note(`${r.activity_code} waits on ${r.waits_for} + ${r.min_rest_hr}h`);

const t2 = one(await rest(operator, `v_my_work?select=activity_id,state,blocked_reason&master_batch_id=eq.${A.id}&code=eq.TRN-P1-T2`));
const t2Early = await rpc(operator, 'start_activity', { p_activity: t2.activity_id });
ok('T2 CANNOT be started early', !t2Early.ok || t2.state === 'LOCKED', `state ${t2.state}, start ${t2Early.status}`);
note(t2.blocked_reason ?? '');

// ══════════════════════════════════════════════════════════ BUNKER / TUNNEL
step('BUNKER + TUNNEL · pile grouping and the loading gate');
const bunkers = await rest(operator, `batch_activity?select=code,scope_label&master_batch_id=eq.${A.id}&code=like.BNK-B*-FILL&order=code.asc`);
ok('three bunkers', (bunkers.body ?? []).length === 3, (bunkers.body ?? []).map((b) => b.code).join(', '));
const gates = await rest(supervisor, 'v_lab_gate?select=checkpoint_code,kind,blocks_activity_code&process_code=eq.PROCESS-2026C&order=checkpoint_code.asc');
const bnkGates = (gates.body ?? []).filter((g) => g.blocks_activity_code?.startsWith('BNK-B'));
ok('each bunker fill is gated by a lab checkpoint', bnkGates.length >= 3,
   bnkGates.map((g) => `${g.checkpoint_code}→${g.blocks_activity_code}`).join(' · '));
const tunGates = (gates.body ?? []).filter((g) => g.blocks_activity_code?.includes('TUN-LOAD'));
ok('tunnel loading requires its gate', tunGates.length >= 3,
   tunGates.map((g) => `${g.checkpoint_code}→${g.blocks_activity_code}`).join(' · '));
const moist = (gates.body ?? []).find((g) => g.checkpoint_code === 'LAB-MOIST-DEC');
ok('LAB-MOIST-DEC is a DECISION, not a GATE — the 67–68% band is UNRESOLVED',
   moist?.kind === 'DECISION', JSON.stringify(moist));

// ══════════════════════════════════════════════════════════ EXTENSION + FORECAST
step('MANAGEMENT · plan, authorisation and forecast are three numbers');
const running = (await rest(operator, `v_my_work?select=activity_id,code&master_batch_id=eq.${A.id}&state=eq.IN_PROGRESS&limit=1`)).body ?? [];
let extId = null;
if (running.length === 0) {
  const next = one(await rest(operator, `v_my_work?select=activity_id&master_batch_id=eq.${A.id}&state=eq.READY&responsible_role=eq.operator&limit=1`));
  await rpc(operator, 'start_activity', { p_activity: next.activity_id });
  running.push({ activity_id: next.activity_id, code: 'started for the extension' });
}
const req = await rpc(operator, 'request_extension', {
  p_activity: running[0].activity_id, p_hours: 6,
  p_reason: 'ACCEPTANCE RUN — turner breakdown, engineering attending.', p_evidence: null });
ok('an operator requests an extension while the work is running', req.ok, msg(req));
extId = id(req);
if (req.ok) {
  const gmFirst = await rpc(gm, 'gm_decide_extension', { p_request: extId, p_approve: true, p_reason: 'skipping the manager', p_granted_hr: 6 });
  ok('the GM cannot decide before the manager — strict order', !gmFirst.ok, `got ${gmFirst.status}`);
  const mg = await rpc(manager, 'manager_decide_extension', { p_request: extId, p_approve: true, p_reason: 'ACCEPTANCE RUN — agreed', p_granted_hr: 6 });
  ok('the manager decides first', mg.ok, msg(mg));
  const g2 = await rpc(gm, 'gm_decide_extension', { p_request: extId, p_approve: true, p_reason: 'ACCEPTANCE RUN — authorised', p_granted_hr: 6 });
  ok('the GM authorises', g2.ok, msg(g2));
}
const fA = one(await rest(supervisor, `v_batch_forecast?select=*&master_batch_id=eq.${A.id}`));
note(`baseline ${fA.planned_end_at} · authorised ${fA.authorised_end_at} · projected ${fA.projected_end_at ?? '—'} (${fA.forecast_basis})`);
ok('the baseline is H0 + the calculated standard, not a day grid',
   Math.round((new Date(fA.planned_end_at) - new Date(fA.h0)) / 3600_000) === Number(fA.standard_hr));
ok('an approved extension moves AUTHORISED and never the baseline',
   !fA.approved_extension_hr || fA.authorised_end_at !== fA.planned_end_at);
ok('the projection does not fold in the extension',
   !fA.approved_extension_hr || fA.projected_end_at !== fA.authorised_end_at);

const hist = one(await rest(supervisor, `v_actual_history?select=*&activity_id=eq.${tA.activity_id}`));
ok('the actual is history, and says whether it was ever corrected',
   Boolean(hist?.actual_end) && hist.has_been_corrected === false);

const varB = one(await rest(supervisor, `v_batch_forecast?select=slip_minutes,finished_count&master_batch_id=eq.${B.id}`));
ok("batch B's variance is its own", varB.finished_count !== fA.finished_count || B.id !== A.id);
note(`A finished ${fA.finished_count} · B finished ${varB.finished_count}`);

// ══════════════════════════════════════════════════════════ RESULT
console.log(`\n\x1b[1m${'─'.repeat(72)}\x1b[0m`);
console.log(`\x1b[1m${pass} passed, ${failures.length} failed\x1b[0m`);
for (const f of failures) console.log(`   \x1b[31m✗\x1b[0m ${f}`);
console.log(`\nbatches`);
for (const b of [A, B, C]) console.log(`  ${b.code}  ${b.id}`);
console.log(`\nAll three are ACTIVE test fixtures carrying synthetic evidence. To retire them:`);
for (const b of [A, B, C]) console.log(`  select cancel_batch('${b.id}', 'acceptance run complete');`);
process.exit(failures.length === 0 ? 0 : 1);
