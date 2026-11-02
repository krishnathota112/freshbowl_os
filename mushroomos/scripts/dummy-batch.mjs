#!/usr/bin/env node
/**
 * A DUMMY BATCH, walked end to end over HTTP as the real roles.
 *
 *   node scripts/dummy-batch.mjs [--keep]
 *
 * WHY OVER HTTP AND NOT THROUGH `pg`
 *   `postgres` has BYPASSRLS and a null `auth.uid()`, so every JWT-derived check is invisible to it.
 *   This signs in as the demo accounts and calls the same endpoints the browser calls. If a step
 *   here passes, a person can do it; if it is refused, a person is refused.
 *
 * WHAT IT PROVES, IN ORDER
 *   ADMIN     create on PROCESS-2026C · generate · validate · activate · plan freezes
 *   OPERATOR  start (server stamps) · finish REFUSED for missing evidence · photo · finish
 *   LAB       sample · test · result · complete
 *   GATE      still shut, because submission is not approval
 *   GM        decide_lab_submission → the gate opens and downstream becomes eligible
 *
 * THE PHOTOGRAPH
 *   One real JPEG, reused for every requirement. It is deliberately a placeholder nobody could
 *   mistake for factory evidence, and every row it creates is on a batch whose code says DUMMY.
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
const PASSWORD = 'mushroom2026';
const IMAGE = process.env.DUMMY_IMAGE
  ?? 'D:/exisiting_freshbowl/image_for_dummy_batch/wp2318297-ben-affleck-batman-wallpapers.jpg';

let pass = 0, fail = 0;
const step = (n) => console.log(`\n\x1b[1m── ${n}\x1b[0m`);
function ok(label, cond, detail = '') {
  if (cond) { pass++; console.log(`   \x1b[32m✓\x1b[0m ${label}`); }
  else { fail++; console.log(`   \x1b[31m✗ ${label}\x1b[0m${detail ? '\n       ' + detail : ''}`); }
  return cond;
}

async function signIn(email) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const b = await r.json();
  if (!b.access_token) throw new Error(`sign-in failed ${email}: ${JSON.stringify(b)}`);
  return { token: b.access_token, id: b.user.id, email };
}
const H = (s, extra = {}) => ({ apikey: ANON, Authorization: `Bearer ${s.token}`, ...extra });

async function parse(r) {
  const t = await r.text();
  let body = t;
  try { body = t ? JSON.parse(t) : null; } catch { /* keep raw */ }
  return { status: r.status, ok: r.ok, body };
}
const rest = async (s, path) => parse(await fetch(`${URL_}/rest/v1/${path}`, { headers: H(s) }));
const rpc = async (s, fn, args) =>
  parse(await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: H(s, { 'Content-Type': 'application/json' }), body: JSON.stringify(args),
  }));
const upload = async (s, path, bytes) =>
  parse(await fetch(`${URL_}/storage/v1/object/evidence/${path}`, {
    method: 'POST', headers: H(s, { 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }), body: bytes,
  }));
const msg = (r) => (typeof r.body === 'object' && r.body?.message) || JSON.stringify(r.body).slice(0, 200);

const photo = readFileSync(IMAGE);
console.log(`\x1b[1mMushroomOS · dummy batch\x1b[0m`);
console.log(`endpoint  ${URL_}`);
console.log(`photo     ${IMAGE} (${(photo.length / 1024).toFixed(0)} KB)`);

const admin = await signIn('admin@freshbowl.demo');
const operator = await signIn('operator@freshbowl.demo');
const lab = await signIn('lab@freshbowl.demo');
const gm = await signIn('gm@freshbowl.demo');
const supervisor = await signIn('supervisor@freshbowl.demo');

// ─────────────────────────────────────────────────────────────────────────── ADMIN
step('ADMIN · create on PROCESS-2026C');

const cat = await rest(admin, 'v_process_catalogue?select=*&is_selectable=eq.true');
const c2026 = (cat.body ?? []).find((p) => p.code === 'PROCESS-2026C');
ok('PROCESS-2026C is selectable', Boolean(c2026), msg(cat));
ok(`its STANDARD is calculated, not stated — H${c2026?.standard_hr}`, Number(c2026?.standard_hr) === 470);
console.log(`       process ${c2026.code} v${c2026.version} · standard H${c2026.standard_hr} · full span H${c2026.full_span_hr} · ${c2026.activity_count} activities`);

const code = `MB-DUMMY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now() % 10000}`;
const h0 = new Date(Date.now() - 6 * 3600_000).toISOString();

/*
 * MATERIAL ROLES.
 *
 * An earlier run passed `p_roles: []` and generated 94 activities instead of 110. That was not a
 * bug: all 16 missing rows carry a `material_role`, and without a material bound to PRIMARY_FIBRE
 * there is no fibre to weigh. FIB-BUNK-LOAD — the activity LAB-BNK-PRE holds shut — was one of
 * them, so the gate would have had nothing to hold.
 *
 * The roles are read from the process itself and the material from `material_role_eligibility`,
 * so this picks what the factory says is eligible rather than naming a material in a script.
 */
const needRoles = await rest(admin,
  `process_activity?select=material_role&process_definition_id=eq.${c2026.process_definition_id}&material_role=not.is.null`);
const roleSet = [...new Set((needRoles.body ?? []).map((r) => r.material_role))];
const elig = await rest(admin, 'material_role_eligibility?select=role,is_default_lead,material:material(code,name)');
const roles = roleSet.map((role) => {
  const lead = (elig.body ?? []).find((e) => e.role === role && e.is_default_lead)
            ?? (elig.body ?? []).find((e) => e.role === role);
  return lead ? { role, material_code: lead.material.code, lead: true } : null;
}).filter(Boolean);
ok(`every material role PROCESS-2026C needs has an eligible material (${roleSet.length})`,
   roles.length === roleSet.length, `bound ${roles.length} of ${roleSet.length}`);
console.log(`       ${roles.map((r) => `${r.role}=${r.material_code}`).join(' · ')}`);

// PostgREST resolves an overload by the EXACT set of named arguments, so every parameter is
// passed explicitly — omitting one that has a default makes the function simply not be found.
const made = await rpc(admin, 'create_master_batch', {
  p_code: code,
  p_label: 'DUMMY — flow test, not a real batch',
  p_start_date: h0.slice(0, 10),
  p_start_at: h0,
  p_config: {},
  p_roles: roles,
  p_supervisor: null,
  p_weather: null,
  p_process_definition_id: c2026.process_definition_id,
});
if (!ok('admin creates the batch', made.ok, msg(made))) process.exit(1);
const batchId = typeof made.body === 'string' ? made.body : made.body?.id ?? made.body;
console.log(`       ${code}  ${batchId}`);

const opTry = await rpc(operator, 'create_master_batch', {
  p_code: `${code}-BYOP`, p_label: 'x', p_start_date: h0.slice(0, 10), p_start_at: h0,
  p_config: {}, p_roles: [], p_supervisor: null, p_weather: null,
  p_process_definition_id: c2026.process_definition_id,
});
ok('an operator CANNOT create a batch', !opTry.ok, `got ${opTry.status}`);

step('ADMIN · generate the plan');
const gen = await rpc(admin, 'generate_activity_plan', { p_batch_id: batchId });
if (!ok('plan generated', gen.ok, msg(gen))) process.exit(1);
const counts = Array.isArray(gen.body) ? gen.body[0] : gen.body;
console.log(`       ${counts?.activities} activities · ${counts?.evidence_items} evidence items · ${counts?.field_values} field values`);
ok('all 110 activities generated — 69 operator + 41 lab', counts?.activities === 110,
   `got ${counts?.activities}. Every missing row carries a material_role; check the bindings above.`);

const labCount = await rest(admin, `batch_activity?select=id&master_batch_id=eq.${batchId}&responsible_role=eq.lab_tech`);
ok('41 lab activities exist on the batch', (labCount.body ?? []).length === 41, `got ${(labCount.body ?? []).length}`);

step('ADMIN · assign the work, and take the incoming-material check');

/*
 * Activation refuses while any activity that needs a person has none, and while no incoming
 * material check is on record. Both are real preconditions, not paperwork: the second is client
 * decision 2 — the material is sampled and accepted BEFORE the batch clock starts.
 */
const unassigned = await rest(admin,
  `batch_activity?select=id,code,responsible_role&master_batch_id=eq.${batchId}&assigned_person_id=is.null&is_time_gate=eq.false&is_hold=eq.false`);

/*
 * ASSIGNMENT FOLLOWS `responsible_role`, and it has to.
 *
 * An earlier run assigned every activity to an operator, including the 41 lab checkpoints. Two
 * things went wrong, both correctly: the lab technician's evidence upload was refused by the
 * storage policy — `can_capture_for_activity` wants the ASSIGNEE or a supervisor, and the lab tech
 * was neither — and the operator's own work list filled up with lab checkpoints that were never
 * theirs.
 */
const staff = await rest(admin, 'profiles?select=id,display_name,role&is_active=eq.true');
const byRole = (role) => (staff.body ?? []).find((p) => p.role === role);
ok('there is an active operator and an active lab technician',
   Boolean(byRole('operator') && byRole('lab_tech')), msg(staff));

let assigned = 0, refusedAssign = 0, skipped = 0;
for (const a of unassigned.body ?? []) {
  const person = byRole(a.responsible_role) ?? byRole('operator');
  if (!person) { skipped++; continue; }
  const r = await rpc(supervisor, 'assign_activity', {
    p_activity: a.id, p_person: person.id, p_reason: 'DUMMY batch — flow test',
  });
  r.ok ? assigned++ : refusedAssign++;
  if (!r.ok && refusedAssign === 1) console.log(`       first refusal: ${msg(r).slice(0, 150)}`);
}
ok(`supervisor assigned every activity to its responsible role (${assigned})`,
   refusedAssign === 0 && skipped === 0, `${refusedAssign} refused, ${skipped} had no matching role`);

const preCp = await rest(lab, 'lab_checkpoint?select=id,code&is_prebatch=eq.true&limit=1');
const preSample = await rpc(lab, 'open_prebatch_sample', {
  p_batch: batchId, p_checkpoint: preCp.body?.[0]?.id,
  p_label: 'DUMMY incoming assay',
  p_at: new Date(new Date(h0).getTime() - 3600_000).toISOString(),
});
ok('lab opens the pre-batch sample BEFORE H0', preSample.ok, msg(preSample));
const preSampleId = typeof preSample.body === 'string' ? preSample.body : preSample.body?.id;

for (const [parameter, value] of [['moisture_pct', 56.2], ['ph', 5.63]]) {
  const t = await rpc(lab, 'request_lab_test', { p_sample: preSampleId, p_parameter: parameter, p_via: 'system' });
  const rr = await rpc(lab, 'record_lab_result', { p_test: typeof t.body === 'string' ? t.body : t.body?.id, p_numeric: value });
  const acc = await rpc(lab, 'accept_lab_result', {
    p_result: typeof rr.body === 'string' ? rr.body : rr.body?.id,
    p_reason: 'DUMMY batch — recorded value accepted as final',
  });
  ok(`incoming ${parameter} recorded and accepted`, acc.ok, msg(acc));
}

step('ADMIN · validate, then activate');
const val = await rpc(admin, 'validate_batch', { p_batch: batchId });
const findings = Array.isArray(val.body) ? val.body : [];
if (!val.ok) console.log(`       validate_batch: ${msg(val)}`);
const errors = findings.filter((v) => v.severity === 'error');
const warns = findings.filter((v) => v.severity !== 'error');
console.log(`       ${errors.length} error(s), ${warns.length} warning(s)`);
for (const e of errors.slice(0, 5)) console.log(`       ERROR ${e.code}: ${e.message}`);
ok('no blocking validation errors', errors.length === 0);

const act = await rpc(admin, 'activate_batch', { p_batch_id: batchId });
if (!ok('batch activated', act.ok, msg(act))) process.exit(1);

const regen = await rpc(admin, 'generate_activity_plan', { p_batch_id: batchId });
ok('the plan CANNOT be regenerated once active', !regen.ok, `got ${regen.status}`);
if (!regen.ok) console.log(`       refusal: ${msg(regen).slice(0, 150)}`);

// ─────────────────────────────────────────────────────────────────────────── OPERATOR
step('OPERATOR · start, and be refused for missing evidence');

const work = await rest(operator, `v_my_work?select=*&master_batch_id=eq.${batchId}&state=eq.READY&responsible_role=eq.operator&order=planned_start_at.asc`);
ok('the operator sees work on v_my_work', (work.body ?? []).length > 0, msg(work));
const target = (work.body ?? []).find((w) => (w.required_count ?? 0) >= 2 && !w.is_hold)
            ?? (work.body ?? []).find((w) => (w.required_count ?? 0) >= 1 && !w.is_hold);
if (!ok('found an activity that requires evidence', Boolean(target))) process.exit(1);
console.log(`       ${target.code} — ${target.title} · needs ${target.required_count}: ${target.outstanding_labels}`);

const started = await rpc(operator, 'start_activity', { p_activity: target.activity_id });
ok('start_activity accepted (no timestamp was sent)', started.ok, msg(started));

const after = await rest(operator, `v_my_work?select=actual_start,state&activity_id=eq.${target.activity_id}`);
const stamped = after.body?.[0]?.actual_start;
ok('the SERVER stamped actual_start', Boolean(stamped));
console.log(`       actual_start = ${stamped}  (state ${after.body?.[0]?.state})`);

const early = await rpc(operator, 'complete_activity', { p_activity: target.activity_id, p_values: {}, p_remarks: null });
const earlyRow = Array.isArray(early.body) ? early.body[0] : early.body;
ok('finishing is REFUSED while evidence is short',
   !early.ok || Boolean(earlyRow?.outstanding_evidence),
   `status ${early.status} · ${msg(early).slice(0, 160)}`);
if (earlyRow?.outstanding_evidence) console.log(`       outstanding: ${earlyRow.outstanding_evidence}`);

step('OPERATOR · the photograph, into private Storage');

const reqs = await rest(operator, `v_evidence_state?select=key,label,min_count,satisfied_count,media_kinds&batch_activity_id=eq.${target.activity_id}`);
const need = [...new Map((reqs.body ?? []).map((r) => [r.key, r])).values()];
console.log(`       ${need.length} requirement(s): ${need.map((n) => `${n.key} ${n.satisfied_count}/${n.min_count}`).join(' · ')}`);

for (const r of need) {
  for (let i = r.satisfied_count; i < r.min_count; i++) {
    const path = `${batchId}/${target.activity_id}/${r.key}-${Date.now()}-${i}.jpg`;
    const up = await upload(operator, path, photo);
    ok(`uploaded ${r.key} #${i + 1} (${(photo.length / 1024).toFixed(0)} KB)`, up.ok, msg(up));
    const bind = await rpc(operator, 'bind_evidence', {
      p_activity: target.activity_id, p_requirement_key: r.key,
      p_storage_path: path, p_media_kind: 'photo',
    });
    const bound = Array.isArray(bind.body) ? bind.body[0] : bind.body;
    ok(`bound ${r.key} → ${bound?.satisfied_count}/${bound?.min_count}`, bind.ok, msg(bind));
  }
}

const done = await rpc(operator, 'complete_activity', { p_activity: target.activity_id, p_values: {}, p_remarks: null });
const doneRow = Array.isArray(done.body) ? done.body[0] : done.body;
ok('finish ACCEPTED once evidence is bound', done.ok && !doneRow?.outstanding_evidence, msg(done));

const ended = await rest(operator, `v_my_work?select=actual_end,state,variance_minutes&activity_id=eq.${target.activity_id}`);
ok('the SERVER stamped actual_end', Boolean(ended.body?.[0]?.actual_end));
console.log(`       actual_end = ${ended.body?.[0]?.actual_end} · state ${ended.body?.[0]?.state} · variance ${ended.body?.[0]?.variance_minutes} min`);

const tamper = await rpc(operator, 'correct_actual', {
  p_activity: target.activity_id, p_field: 'actual_end',
  p_value: new Date(Date.now() - 86400_000).toISOString(),
  p_reason: 'trying to make a late activity look on time',
});
ok('an operator CANNOT rewrite an actual', !tamper.ok, `got ${tamper.status}`);

// ─────────────────────────────────────────────────────────────────────────── LAB
step('LAB · a reading on a gating checkpoint');

const queue = await rest(lab, `v_lab_approval_queue?select=*&master_batch_id=eq.${batchId}&is_gate=eq.true&order=activity_code.asc`);
if (!ok('the batch has gating lab checkpoints', Array.isArray(queue.body) && queue.body.length > 0, msg(queue))) process.exit(1);
const gaters = [...new Map((queue.body ?? []).map((r) => [r.checkpoint_code, r])).values()];
console.log(`       ${gaters.length} gating checkpoint(s): ${gaters.map((g) => `${g.checkpoint_code}→${g.gates_activity_code}`).join(' · ')}`);

const lrow = (queue.body ?? [])[0];
const held = lrow.gates_activity_code;

const heldBefore = await rest(operator, `v_my_work?select=state,blocked_reason&master_batch_id=eq.${batchId}&code=eq.${held}`);
console.log(`       ${held} is ${heldBefore.body?.[0]?.state}`);
ok(`${held} is held before any decision`, heldBefore.body?.[0]?.state !== 'READY',
   `state ${heldBefore.body?.[0]?.state}`);
if (heldBefore.body?.[0]?.blocked_reason) console.log(`       reason: ${heldBefore.body[0].blocked_reason}`);

const cp = await rest(lab, `lab_checkpoint?select=id,code&code=eq.${lrow.checkpoint_code}`);
const sample = await rpc(lab, 'open_lab_sample', {
  p_activity: lrow.activity_id, p_checkpoint: cp.body?.[0]?.id, p_label: 'DUMMY-S1',
});
ok('lab opens a sample', sample.ok, msg(sample));

const test = await rpc(lab, 'request_lab_test', {
  p_sample: typeof sample.body === 'string' ? sample.body : sample.body?.id,
  p_parameter: 'moisture',
});
ok('lab requests a test', test.ok, msg(test));

const result = await rpc(lab, 'record_lab_result', {
  p_test: typeof test.body === 'string' ? test.body : test.body?.id,
  p_numeric: 67.4,
});
ok('lab records a reading', result.ok, msg(result));

await rpc(lab, 'start_activity', { p_activity: lrow.activity_id });

/*
 * A LAB ACTIVITY CARRIES EVIDENCE TOO. 0053 put 46 evidence requirements on the LAB-2026A
 * activities, so `complete_activity` refuses a checkpoint exactly as it refuses a production task.
 * An earlier run skipped this, the completion was silently refused, and the activity sat at
 * IN_PROGRESS — which is why it never showed as awaiting a decision.
 */
const labReqs = await rest(lab,
  `v_evidence_state?select=key,min_count,satisfied_count&batch_activity_id=eq.${lrow.activity_id}`);
const labNeed = [...new Map((labReqs.body ?? []).map((r) => [r.key, r])).values()];
console.log(`       lab evidence: ${labNeed.map((n) => `${n.key} ${n.satisfied_count}/${n.min_count}`).join(' · ') || 'none required'}`);
for (const r of labNeed) {
  for (let i = r.satisfied_count; i < r.min_count; i++) {
    const path = `${batchId}/${lrow.activity_id}/${r.key}-${Date.now()}-${i}.jpg`;
    const up = await upload(lab, path, photo);
    const bind = await rpc(lab, 'bind_evidence', {
      p_activity: lrow.activity_id, p_requirement_key: r.key,
      p_storage_path: path, p_media_kind: 'photo',
    });
    ok(`lab bound ${r.key}`, up.ok && bind.ok, msg(up.ok ? bind : up));
  }
}

const labDone = await rpc(lab, 'complete_activity', { p_activity: lrow.activity_id, p_values: {}, p_remarks: null });
const labRow = Array.isArray(labDone.body) ? labDone.body[0] : labDone.body;
ok('lab completes the checkpoint activity', labDone.ok && !labRow?.outstanding_evidence,
   `${msg(labDone)} ${labRow?.outstanding_evidence ?? ''}`);

step('GATE · submission is not approval');

const stillHeld = await rest(operator, `v_my_work?select=state,blocked_reason&master_batch_id=eq.${batchId}&code=eq.${held}`);
ok(`${held} is STILL held after the lab submitted`, stillHeld.body?.[0]?.state !== 'READY',
   `state ${stillHeld.body?.[0]?.state}`);
console.log(`       ${held} = ${stillHeld.body?.[0]?.state}`);

const awaiting = await rest(gm, `v_lab_approval_queue?select=*&activity_id=eq.${lrow.activity_id}`);
ok('it appears as awaiting a decision', awaiting.body?.[0]?.awaiting_decision === true,
   JSON.stringify(awaiting.body?.[0] ?? {}).slice(0, 200));

const labSelfApprove = await rpc(lab, 'decide_lab_submission', {
  p_activity: lrow.activity_id, p_verdict: 'approved', p_reason: 'approving my own submission',
});
ok('a LAB TECH cannot approve their own submission', !labSelfApprove.ok, `got ${labSelfApprove.status}`);
if (!labSelfApprove.ok) console.log(`       refusal: ${msg(labSelfApprove).slice(0, 160)}`);

const opApprove = await rpc(operator, 'decide_lab_submission', {
  p_activity: lrow.activity_id, p_verdict: 'approved', p_reason: 'operator trying to open a gate',
});
ok('an OPERATOR cannot approve a lab submission', !opApprove.ok, `got ${opApprove.status}`);

step('GM · the decision that opens the gate');

const decided = await rpc(gm, 'decide_lab_submission', {
  p_activity: lrow.activity_id, p_verdict: 'approved',
  p_reason: 'DUMMY BATCH — moisture within the SOP band, released for the flow test.',
});
ok('GM approves', decided.ok, msg(decided));

const opened = await rest(operator, `v_my_work?select=state,blocked_reason&master_batch_id=eq.${batchId}&code=eq.${held}`);
console.log(`       ${held} = ${opened.body?.[0]?.state}`);
ok(`${held} is now eligible`, opened.body?.[0]?.state === 'READY',
   `state ${opened.body?.[0]?.state} · ${opened.body?.[0]?.blocked_reason ?? ''}`);

const afterQ = await rest(gm, `v_lab_approval_queue?select=latest_verdict,is_approved,decided_by_name,decided_role&activity_id=eq.${lrow.activity_id}`);
ok('the decision is recorded with who made it', afterQ.body?.[0]?.is_approved === true,
   JSON.stringify(afterQ.body?.[0] ?? {}));
console.log(`       ${afterQ.body?.[0]?.latest_verdict} by ${afterQ.body?.[0]?.decided_by_name} (${afterQ.body?.[0]?.decided_role})`);

// ─────────────────────────────────────────────────────────────────────────── FORECAST
step('MANAGEMENT · plan, authorisation and forecast stay separate');

const fc = await rest(supervisor, `v_batch_forecast?select=*&master_batch_id=eq.${batchId}`);
const f = fc.body?.[0];
console.log(`       process ${f?.process_code} · standard H${f?.standard_hr} · H0 ${f?.h0}`);
console.log(`       baseline end ${f?.planned_end_at}`);
console.log(`       authorised   ${f?.authorised_end_at} (extension ${f?.approved_extension_hr ?? 'none'})`);
console.log(`       projected    ${f?.projected_end_at ?? '—'} (basis: ${f?.forecast_basis})`);
ok('the baseline is H0 + the calculated standard, not a day grid',
   Math.round((new Date(f.planned_end_at) - new Date(f.h0)) / 3600_000) === Number(f.standard_hr),
   `${Math.round((new Date(f.planned_end_at) - new Date(f.h0)) / 3600_000)} h vs standard ${f.standard_hr}`);
ok('the projection does not fold in an extension',
   f?.approved_extension_hr == null || f.projected_end_at !== f.authorised_end_at);

const hist = await rest(supervisor, `v_actual_history?select=*&activity_id=eq.${target.activity_id}`);
ok('the actual is recorded as history', Boolean(hist.body?.[0]?.actual_end));
console.log(`       corrections: ${hist.body?.[0]?.correction_count} · has_been_corrected ${hist.body?.[0]?.has_been_corrected}`);

// ─────────────────────────────────────────────────────────────────────────── DONE
console.log(`\n\x1b[1m${'─'.repeat(70)}\x1b[0m`);
console.log(`\x1b[1m${pass} passed, ${fail} failed\x1b[0m`);
console.log(`\nbatch  ${code}`);
console.log(`id     ${batchId}`);
console.log(fail === 0
  ? '\n\x1b[32mThe flow is correct end to end.\x1b[0m'
  : '\n\x1b[31mSomething in the flow is wrong — see the failures above.\x1b[0m');
console.log('\nThis batch is ACTIVE and carries real evidence rows. It is a test fixture:');
console.log(`  delete with   select cancel_batch('${batchId}', 'dummy flow test complete');`);

process.exit(fail === 0 ? 0 : 1);
