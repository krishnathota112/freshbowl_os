#!/usr/bin/env node
/**
 * BATCHexp — one batch walked end to end, through EVERY stage, over HTTP as the real roles.
 *
 *   node scripts/batchexp-run.mjs
 *
 * WHY OVER HTTP AND NOT THROUGH `pg`
 *   `postgres` has BYPASSRLS and a null `auth.uid()`, so every JWT-derived check is invisible to
 *   it. This signs in as the demo accounts and calls the endpoints the browser calls. If a step
 *   here passes, a person can do it; if it is refused, a person is refused.
 *
 * WHY H0 IS IN THE PAST, AND WHY THAT IS NOT CHEATING
 *   A rest gate is `predecessor.actual_end + min_rest_hr` measured against `now()` — real wall
 *   clock. The dev clock cannot help: ARCH-008 keeps `get_effective_now` out of everything
 *   authoritative, which is exactly why an actual is evidence. So a batch whose H0 is this
 *   morning genuinely cannot reach H470 for 470 hours, and no script changes that.
 *
 *   The factory's own answer to this is the paper-slip path — `submit_activity` with a stated
 *   `p_actual_start` / `p_actual_end`, the flow `/admin/batch/:id/onboard` exists for. The server
 *   still refuses a stated time in the FUTURE or one BEFORE H0, and still refuses an operator
 *   stating any time at all. So this run sets H0 ~490 h ago and records each activity in its own
 *   planned window — every time it writes is a legal past time a supervisor could have typed.
 *
 * WHAT IS NOT SIMULATED
 *   Nothing about authorisation. Every refusal below is the server's. The lab still submits and
 *   somebody else still decides; evidence is still bound before an activity may close.
 */
import { readFileSync, writeFileSync } from 'node:fs';
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
const CODE = process.env.BATCH_CODE ?? 'BATCHexp';
const LABEL = process.env.BATCH_LABEL ?? `${CODE} — full end-to-end walk`;

/*
 * THE DAY-0 STRUCTURE, which BATCHexp was created without.
 *
 * `p_config: {}` is accepted and generates all 110 activities, so nothing fails — but the load
 * plan is DERIVED from the tonnage, and with no tonnage the intake weighment reads "Target 0.0 MT
 * (0 loads)" forever. The plan freezes at activation, so it cannot be answered afterwards. These
 * are `DEFAULT_STRUCTURE` from `src/api/batch.ts` — the same numbers the New Batch screen offers.
 */
const STRUCTURE = {
  primary_fibre_required_mt: 21,
  expected_load_capacity_mt: 2,
  bunker_line_count: 3,
  yard_pile_count: 2,
  mixed_pile_count: 1,
  straw_pile_count: 2,
  straw_bunker_count: 1,
  turner_pile_count: 3,
  tunnel_count: 3,
};

/*
 * HOW MUCH LAB WORK TO LEAVE LIVE.
 *
 * A batch walked to 110/110 is a perfect audit record and a useless lab demo: `/lab/queue` and
 * `/lab/approvals` are both empty, because nothing is waiting. LEAVE_LAB_OPEN keeps the last N
 * gating checkpoints unfinished — one still to be sampled, one submitted and awaiting a decision —
 * so the lab workstation has real work in it.
 */
const LEAVE_LAB_OPEN = Number(process.env.LEAVE_LAB_OPEN ?? 0);

/*
 * WHERE TO STOP.
 *
 * A batch at 110/110 is a complete audit record and an empty demo — `/operator/my-work` and the
 * control room have nothing in them, because nothing is left to do. STOP_AT_HR records only the
 * work planned up to that hour of the process, leaving everything after it genuinely READY. The
 * batch is then mid-process in exactly the way a real one is at that hour.
 */
const STOP_AT_HR = process.env.STOP_AT_HR ? Number(process.env.STOP_AT_HR) : null;

/*
 * A REAL JPEG, and deliberately a tiny one.
 *
 * The plan carries ~150 evidence items. The existing dummy run reused a 937 KB wallpaper, which
 * would put ~140 MB of placeholder into the evidence bucket for a flow test. This is a valid
 * 1×1 baseline JPEG — the storage policy and `bind_evidence` treat it exactly the same, and it
 * is unmistakably not factory evidence.
 */
const PHOTO = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64'
);

const log = [];
let pass = 0, fail = 0;
function say(s = '') { console.log(s); log.push(s.replace(/\x1b\[[0-9;]*m/g, '')); }
const step = (n) => say(`\n\x1b[1m── ${n}\x1b[0m`);
function ok(label, cond, detail = '') {
  if (cond) { pass++; say(`   \x1b[32m✓\x1b[0m ${label}`); }
  else { fail++; say(`   \x1b[31m✗ ${label}\x1b[0m${detail ? '\n       ' + detail : ''}`); }
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
const msg = (r) => (typeof r.body === 'object' && r.body?.message) || String(JSON.stringify(r.body)).slice(0, 220);
const one = (b) => (Array.isArray(b) ? b[0] : b);
const idOf = (r) => (typeof r.body === 'string' ? r.body : one(r.body)?.id ?? one(r.body));

say(`\x1b[1mMushroomOS · ${CODE} — end to end, every stage\x1b[0m`);
say(`endpoint  ${URL_}`);
say(`photo     1×1 placeholder JPEG (${PHOTO.length} bytes), reused for every requirement`);

const admin = await signIn('admin@freshbowl.demo');
const operator = await signIn('operator@freshbowl.demo');
const lab = await signIn('lab@freshbowl.demo');
const gm = await signIn('gm@freshbowl.demo');
const supervisor = await signIn('supervisor@freshbowl.demo');
say(`roles     admin · operator · lab_tech · gm · supervisor  (all signed in)`);

// ══════════════════════════════════════════════════════════════════ 1 · CREATE
step('1 · ADMIN creates BATCHexp on PROCESS-2026C');

const cat = await rest(admin, 'v_process_catalogue?select=*&is_selectable=eq.true');
const proc = (cat.body ?? []).find((p) => p.code === 'PROCESS-2026C');
if (!ok('PROCESS-2026C is selectable', Boolean(proc), msg(cat))) process.exit(1);
ok(`its standard is CALCULATED, not stated — H${proc.standard_hr}`, Number(proc.standard_hr) === 470);
say(`       ${proc.code} v${proc.version} · standard H${proc.standard_hr} · full span H${proc.full_span_hr} · ${proc.activity_count} activities`);

/*
 * H0, AND THE MARGIN.
 *
 * The full span is H474, not H470 — the standard is the longest STREAM, and other streams run
 * past it. Anchoring H0 at span + 16 h ago leaves every planned window, including the last, safely
 * in the past, so no stated time lands in the future and gets refused.
 */
const SPAN_HR = Number(proc.full_span_hr ?? 474);
let H0 = new Date(Date.now() - (SPAN_HR + 16) * 3600_000);
say(`       H0 set to ${H0.toISOString()} — ${SPAN_HR + 16} h ago, so the whole span is recordable past`);

const needRoles = await rest(admin,
  `process_activity?select=material_role&process_definition_id=eq.${proc.process_definition_id}&material_role=not.is.null`);
const roleSet = [...new Set((needRoles.body ?? []).map((r) => r.material_role))];
const elig = await rest(admin, 'material_role_eligibility?select=role,is_default_lead,material:material(code,name)');
const roles = roleSet.map((role) => {
  const lead = (elig.body ?? []).find((e) => e.role === role && e.is_default_lead)
            ?? (elig.body ?? []).find((e) => e.role === role);
  return lead ? { role, material_code: lead.material.code, lead: true } : null;
}).filter(Boolean);
ok(`every material role the process needs has an eligible material (${roleSet.length})`, roles.length === roleSet.length);
say(`       ${roles.map((r) => `${r.role}=${r.material_code}`).join(' · ')}`);

const made = await rpc(admin, 'create_master_batch', {
  p_code: CODE,
  p_label: LABEL,
  p_start_date: H0.toISOString().slice(0, 10),
  p_start_at: H0.toISOString(),
  p_config: STRUCTURE,
  p_roles: roles,
  p_supervisor: null,
  p_weather: null,
  p_process_definition_id: proc.process_definition_id,
});
/*
 * RE-RUNNABLE, because `master_batch.code` is UNIQUE and the name is the thing being tracked.
 *
 * A second run must not quietly become BATCHexp-2. If the code is already taken the batch is
 * picked up where it stands and the walk resumes — which is the honest shape of the work anyway,
 * since the walk is a fixpoint loop that closes whatever is still open.
 */
let batchId;
let resuming = false;
if (made.ok) {
  batchId = idOf(made);
  ok(`admin creates ${CODE}`, true);
  say(`       ${CODE}  ${batchId}`);
} else {
  const existing = await rest(admin, `master_batch?select=id,status,start_at&code=eq.${encodeURIComponent(CODE)}`);
  const row = existing.body?.[0];
  if (!row) { ok(`admin creates ${CODE}`, false, msg(made)); process.exit(1); }
  batchId = row.id;
  resuming = true;
  H0 = new Date(row.start_at);
  ok(`${CODE} already exists (${row.status}) — resuming it, not creating a second one`, true);
  say(`       ${CODE}  ${batchId} · H0 ${row.start_at}`);
}

const opTry = await rpc(operator, 'create_master_batch', {
  p_code: `${CODE}-BYOP`, p_label: 'x', p_start_date: H0.toISOString().slice(0, 10),
  p_start_at: H0.toISOString(), p_config: {}, p_roles: [], p_supervisor: null, p_weather: null,
  p_process_definition_id: proc.process_definition_id,
});
ok('an OPERATOR cannot create a batch', !opTry.ok, `got ${opTry.status}`);

// ══════════════════════════════════════════════════════════════════ 2 · PLAN
if (!resuming) {
step('2 · ADMIN generates the plan');
const gen = await rpc(admin, 'generate_activity_plan', { p_batch_id: batchId });
if (!ok('plan generated', gen.ok, msg(gen))) process.exit(1);
const counts = one(gen.body);
say(`       ${counts?.activities} activities · ${counts?.evidence_items} evidence items · ${counts?.field_values} field values`);
ok('all 110 activities generated', counts?.activities === 110, `got ${counts?.activities}`);

// ══════════════════════════════════════════════════════════════════ 3 · CREW
step('3 · SUPERVISOR assigns every activity to its responsible role');
const staff = await rest(admin, 'profiles?select=id,display_name,role&is_active=eq.true');
const byRole = (role) => (staff.body ?? []).find((p) => p.role === role);
ok('there is an active operator and an active lab technician', Boolean(byRole('operator') && byRole('lab_tech')));

const unassigned = await rest(admin,
  `batch_activity?select=id,code,responsible_role&master_batch_id=eq.${batchId}&assigned_person_id=is.null&is_time_gate=eq.false&is_hold=eq.false`);
let assigned = 0, refusedAssign = 0;
for (const a of unassigned.body ?? []) {
  const person = byRole(a.responsible_role) ?? byRole('operator');
  if (!person) continue;
  const r = await rpc(supervisor, 'assign_activity', { p_activity: a.id, p_person: person.id, p_reason: `${CODE} — end-to-end walk` });
  r.ok ? assigned++ : refusedAssign++;
  if (!r.ok && refusedAssign === 1) say(`       first refusal: ${msg(r).slice(0, 150)}`);
}
ok(`every activity assigned to its responsible role (${assigned})`, refusedAssign === 0, `${refusedAssign} refused`);

// ══════════════════════════════════════════════════════════════════ 4 · INCOMING MATERIAL
step('4 · LAB takes the incoming-material check, before H0');
const preCp = await rest(lab, 'lab_checkpoint?select=id,code&is_prebatch=eq.true&limit=1');
const preSample = await rpc(lab, 'open_prebatch_sample', {
  p_batch: batchId, p_checkpoint: preCp.body?.[0]?.id,
  p_label: `${CODE} incoming assay`,
  p_at: new Date(H0.getTime() - 3600_000).toISOString(),
});
ok('lab opens the pre-batch sample BEFORE H0', preSample.ok, msg(preSample));
const preSampleId = idOf(preSample);
for (const [parameter, value] of [['moisture_pct', 56.2], ['ph', 5.63]]) {
  const t = await rpc(lab, 'request_lab_test', { p_sample: preSampleId, p_parameter: parameter, p_via: 'system' });
  const rr = await rpc(lab, 'record_lab_result', { p_test: idOf(t), p_numeric: value });
  const acc = await rpc(lab, 'accept_lab_result', { p_result: idOf(rr), p_reason: `${CODE} — recorded value accepted as final` });
  ok(`incoming ${parameter} recorded and accepted as final`, acc.ok, msg(acc));
}
/*
 * SEPARATION OF DUTIES, PROVED ON ITS OWN READING.
 *
 * A result is immutable and one per test, so this opens a FRESH test rather than reusing one —
 * an earlier version reused the pH test, got "a result already exists", and the assertion passed
 * for the wrong reason. The refusal that matters is about the ROLE, not about the row.
 */
const probeTest = await rpc(lab, 'request_lab_test', { p_sample: preSampleId, p_parameter: 'ph', p_via: 'system' });
const probeResult = await rpc(lab, 'record_lab_result', { p_test: idOf(probeTest), p_numeric: 5.7 });
const adminAccept = await rpc(admin, 'accept_lab_result', {
  p_result: idOf(probeResult), p_reason: 'admin trying to sign off incoming material',
});
ok('an ADMIN cannot accept a lab result as final', !adminAccept.ok, `got ${adminAccept.status}`);
if (!adminAccept.ok) say(`       refusal: ${msg(adminAccept).slice(0, 170)}`);
// That extra reading must not be left outstanding or activation will block on it.
const stray = await rest(lab, `v_lab_result_current?select=result_id,accepted,is_current&master_batch_id=eq.${batchId}&accepted=eq.false&is_current=eq.true`);
for (const r of stray.body ?? []) {
  await rpc(lab, 'accept_lab_result', { p_result: r.result_id, p_reason: `${CODE} — confirmatory pH, accepted as final` });
}

// ══════════════════════════════════════════════════════════════════ 5 · ACTIVATE
step('5 · ADMIN validates, then activates — the one-way door');
const val = await rpc(admin, 'validate_batch', { p_batch: batchId });
const findings = Array.isArray(val.body) ? val.body : [];
const errors = findings.filter((v) => v.severity === 'error');
say(`       ${errors.length} error(s), ${findings.length - errors.length} warning(s)`);
for (const e of errors.slice(0, 6)) say(`       ERROR ${e.code}: ${e.message}`);
ok('no blocking validation errors', errors.length === 0);

const act = await rpc(admin, 'activate_batch', { p_batch_id: batchId });
if (!ok('batch activated — the plan is now frozen', act.ok, msg(act))) process.exit(1);
const regen = await rpc(admin, 'generate_activity_plan', { p_batch_id: batchId });
ok('the plan CANNOT be regenerated once active', !regen.ok);
if (!regen.ok) say(`       refusal: ${msg(regen).slice(0, 150)}`);

// ══════════════════════════════════════════════════════════════════ 6 · PROOFS ON THE FIRST TASK
step('6 · OPERATOR · the rules that hold on a live task');
const firstWork = await rest(operator, `v_my_work?select=*&master_batch_id=eq.${batchId}&state=eq.READY&responsible_role=eq.operator&order=planned_start_at.asc`);
const probe = (firstWork.body ?? []).find((w) => (w.required_count ?? 0) >= 1 && !w.is_hold);
if (probe) {
  say(`       ${probe.code} — ${probe.title} · needs ${probe.required_count}: ${probe.outstanding_labels}`);
  const started = await rpc(operator, 'start_activity', { p_activity: probe.activity_id });
  ok('start_activity accepted — no timestamp was sent', started.ok, msg(started));
  const after = await rest(operator, `v_my_work?select=actual_start,state&activity_id=eq.${probe.activity_id}`);
  ok('the SERVER stamped actual_start', Boolean(after.body?.[0]?.actual_start));
  say(`       actual_start = ${after.body?.[0]?.actual_start} (state ${after.body?.[0]?.state})`);

  const early = await rpc(operator, 'complete_activity', { p_activity: probe.activity_id, p_values: {}, p_remarks: null });
  const earlyRow = one(early.body);
  ok('finishing is REFUSED while evidence is short', !early.ok || Boolean(earlyRow?.outstanding_evidence),
     `status ${early.status} · ${msg(early).slice(0, 140)}`);
  if (earlyRow?.outstanding_evidence) say(`       outstanding: ${earlyRow.outstanding_evidence}`);

  const tamper = await rpc(operator, 'correct_actual', {
    p_activity: probe.activity_id, p_field: 'actual_end',
    p_value: new Date(Date.now() - 86400_000).toISOString(),
    p_reason: 'trying to make a late activity look on time',
  });
  ok('an OPERATOR cannot rewrite an actual', !tamper.ok, `got ${tamper.status}`);
} else {
  ok('found a live operator task to prove the rules on', false, 'no READY operator activity with evidence');
}

} else {
  say('');
  say("   steps 2-6 were completed on this batch's first run; resuming at the walk.");
}

// ══════════════════════════════════════════════════════════ 6b · VESSELS
/*
 * THE FACTORY AS A PLACE.
 *
 * Compost is held in a vessel, and which one is not a detail — `v_vessel_availability` is what the
 * Plant screen and the tower's occupancy grid read, and the batch page's "material movement" panel
 * says "no vessels chosen yet" until this runs. The Activities view flags the tunnel decision as
 * OVERDUE at H240 for exactly this reason, so a walk that never allocates has skipped a stage the
 * product itself is asking for.
 *
 * `allocate_vessel` refuses a vessel of the wrong kind and refuses a collision with another batch,
 * so this reads what the batch needs from `vessel_scope_map` rather than naming a bunker.
 */
step('6b · SUPERVISOR allocates the vessels this batch occupies');
const scopeMap = await rest(supervisor, 'vessel_scope_map?select=scope,location_kind&location_kind=not.is.null');
const kindFor = new Map((scopeMap.body ?? []).map((m) => [m.scope, m.location_kind]));
const needSlots = await rest(supervisor,
  `batch_activity?select=instance_no,process_activity!inner(scope)&master_batch_id=eq.${batchId}`);
const slots = [...new Map((needSlots.body ?? [])
  .map((r) => [`${r.process_activity?.scope}·${r.instance_no}`, { scope: r.process_activity?.scope, instance_no: r.instance_no }])
  .filter(([, v]) => kindFor.has(v.scope))).values()];

const free = await rest(supervisor, 'location?select=id,kind,code,label,status&is_exclusive=eq.true&status=eq.available&order=kind.asc,code.asc');
const pool = new Map();
for (const v of free.body ?? []) {
  if (!pool.has(v.kind)) pool.set(v.kind, []);
  pool.get(v.kind).push(v);
}
const already = await rest(supervisor, `v_vessel_availability?select=location_code&master_batch_id=eq.${batchId}`);
let placed = 0, placedRefused = 0;
if ((already.body ?? []).length > 0) {
  say(`       ${(already.body ?? []).length} vessel(s) already allocated to this batch — leaving them`);
} else {
  /*
   * `location.status` IS NOT OCCUPANCY, and taking it for one is how the first run tried to put
   * this batch into Tunnel 1 — which `allocate_vessel` refused, correctly, because
   * MB-2026-366-368 has been in it since 26 Aug and never released it. Status is the vessel's own
   * lifecycle (available / maintenance / retired); whether something is IN it right now is a
   * different question, and the only authority on it is the refusal itself. So try candidates in
   * order and let the server be the one that says no.
   */
  for (const sl of slots) {
    const kind = kindFor.get(sl.scope);
    const candidates = pool.get(kind) ?? [];
    let done = false;
    const refusals = [];
    while (candidates.length > 0 && !done) {
      const v = candidates.shift();
      const r = await rpc(supervisor, 'allocate_vessel', {
        p_batch: batchId, p_scope: sl.scope, p_instance_no: sl.instance_no,
        p_location: v.id, p_note: `${CODE} — end-to-end walk`,
      });
      if (r.ok) { placed++; done = true; say(`       ${sl.scope} #${sl.instance_no} → ${v.code}`); }
      else refusals.push(`${v.code}: ${msg(r).slice(0, 90)}`);
    }
    if (!done) {
      placedRefused++;
      say(`       ${sl.scope} #${sl.instance_no} — no free ${kind}. Tried ${refusals.length}:`);
      for (const f of refusals.slice(0, 3)) say(`         ${f}`);
    } else if (refusals.length) {
      say(`         (${refusals.length} already occupied, skipped)`);
    }
  }
}
ok(`every vessel this batch needs is allocated (${placed} placed, ${slots.length} needed)`,
   placedRefused === 0, `${placedRefused} refused`);

const wrongKind = (pool.get('BUNKER') ?? [])[0];
if (wrongKind && slots.some((sl) => kindFor.get(sl.scope) === 'TUNNEL')) {
  const bad = await rpc(supervisor, 'allocate_vessel', {
    p_batch: batchId, p_scope: 'TUNNEL', p_instance_no: 99,
    p_location: wrongKind.id, p_note: 'a bunker where a tunnel belongs',
  });
  ok('a TUNNEL scope refuses a BUNKER', !bad.ok, `got ${bad.status}`);
  if (!bad.ok) say(`       refusal: ${msg(bad).slice(0, 150)}`);
}

// ══════════════════════════════════════════════════════════════════ 7 · THE WALK
step('7 · THE WALK — every activity, in dependency order, to COMPLETED');
say('   Evidence is bound before anything closes. Lab checkpoints are submitted by the lab and');
say('   decided by the GM. Times are stated inside each activity\'s own planned window.');

/** Field values the activity carries, filled to the middle of the SOP band where there is one. */
async function fieldValues(session, activityId) {
  const r = await rest(session, `batch_activity_value?select=field_key,sop_min,sop_max,sop_value,day0_value,actual_value&batch_activity_id=eq.${activityId}`);
  const out = {};
  for (const v of r.body ?? []) {
    if (!v.field_key || v.actual_value != null) continue;
    let val = null;
    if (v.sop_min != null && v.sop_max != null) val = (Number(v.sop_min) + Number(v.sop_max)) / 2;
    else if (v.sop_min != null) val = Number(v.sop_min);
    else if (v.sop_max != null) val = Number(v.sop_max);
    else if (v.day0_value != null) val = v.day0_value;
    else if (v.sop_value != null && /^[\d.]+$/.test(String(v.sop_value))) val = v.sop_value;
    if (val !== null) out[v.field_key] = String(val);
  }
  return out;
}

/** Bind the placeholder against every outstanding requirement. Returns how many it bound. */
async function bindEvidence(session, activityId) {
  const reqs = await rest(session, `v_evidence_state?select=key,min_count,satisfied_count&batch_activity_id=eq.${activityId}`);
  const need = [...new Map((reqs.body ?? []).map((r) => [r.key, r])).values()];
  let bound = 0;
  for (const r of need) {
    for (let i = Number(r.satisfied_count ?? 0); i < Number(r.min_count ?? 0); i++) {
      const path = `${batchId}/${activityId}/${r.key}-${Date.now()}-${i}.jpg`;
      const up = await upload(session, path, PHOTO);
      if (!up.ok) { evidenceRefusals.push(`${r.key}: ${msg(up).slice(0, 90)}`); continue; }
      const bind = await rpc(session, 'bind_evidence', {
        p_activity: activityId, p_requirement_key: r.key, p_storage_path: path, p_media_kind: 'photo',
      });
      if (bind.ok) bound++;
      else evidenceRefusals.push(`${r.key}: ${msg(bind).slice(0, 90)}`);
    }
  }
  return bound;
}

/** The stated window for an activity: its own plan, clamped to the legal past. */
function statedWindow(a) {
  const floor = H0.getTime() + 60_000;
  const ceil = Date.now() - 120_000;
  let s = a.planned_start_at ? new Date(a.planned_start_at).getTime() : floor;
  let e = a.planned_end_at ? new Date(a.planned_end_at).getTime() : s + 3600_000;
  s = Math.min(Math.max(s, floor), ceil - 60_000);
  e = Math.min(Math.max(e, s + 60_000), ceil);
  return { start: new Date(s).toISOString(), end: new Date(e).toISOString() };
}

/*
 * THE LAB DEMO SET, chosen BEFORE the walk so the walk simply never touches it.
 *
 * Two roles, and they are different screens:
 *   · `hold`    — never sampled. Sits in `/lab/queue` as work the technician still has to do.
 *   · `submit`  — sampled, tested, a reading recorded, then left. Sits in `/lab/approvals` as a
 *                 submission awaiting somebody else's decision, which is the rule the product is
 *                 built on: a submission is not an approval.
 */
const labHold = new Set();
const labSubmitOnly = new Set();
if (LEAVE_LAB_OPEN > 0) {
  /*
   * READ THE ACTIVITIES, NOT THE QUEUE.
   *
   * `v_lab_approval_queue` is a QUEUE: a row exists only while a submission is undecided. Before
   * the walk nothing has been submitted, so it is empty — an earlier version reserved from it and
   * silently held back nothing at all. The lab checkpoints themselves are simply the lab's
   * activities, and they exist from the moment the plan is generated.
   */
  const gating = await rest(lab,
    `v_my_work?select=activity_id,code,title,baseline_start_hour&master_batch_id=eq.${batchId}&responsible_role=eq.lab_tech&order=baseline_start_hour.desc`);
  const uniq = [...new Map((gating.body ?? []).map((r) => [r.activity_id, r])).values()];

  /*
   * THE RESERVED SET HAS TO BE REACHABLE.
   *
   * With STOP_AT_HR the walk never gets past that hour, so every lab checkpoint after it is
   * already unfinished and already fills `/lab/queue` — reserving more of them would prove
   * nothing. What that run cannot produce on its own is a SUBMITTED, UNDECIDED reading, so the
   * reservation is taken from INSIDE the recorded window instead.
   */
  const inWindow = STOP_AT_HR === null ? uniq : uniq.filter((r) => Number(r.baseline_start_hour ?? 0) <= STOP_AT_HR);
  if (STOP_AT_HR === null) {
    for (const r of uniq.slice(0, LEAVE_LAB_OPEN)) labHold.add(r.activity_id);
    for (const r of uniq.slice(LEAVE_LAB_OPEN, LEAVE_LAB_OPEN * 2)) labSubmitOnly.add(r.activity_id);
  } else {
    for (const r of inWindow.slice(0, LEAVE_LAB_OPEN)) labSubmitOnly.add(r.activity_id);
  }
  say(`   reserved for the lab demo: ${labHold.size} unsampled (/lab/queue) · ${labSubmitOnly.size} submitted, undecided (/lab/approvals)`);
}

const evidenceRefusals = [];
const labApproved = new Set();
const stuck = new Map();
let completed = 0, labDone = 0, gatesOpened = 0, corrections = 0;

for (let round = 1; round <= 30; round++) {
  await rpc(supervisor, 'release_elapsed_rests', { p_batch: batchId });

  const all = await rest(supervisor, `v_my_work?select=*&master_batch_id=eq.${batchId}&order=planned_start_at.asc`);
  const rows = all.body ?? [];
  const open = rows.filter((r) => r.state !== 'COMPLETED');
  if (open.length === 0) { say(`   round ${round}: nothing open — the batch is fully recorded`); break; }

  // Anything the lab has submitted and nobody has decided yet. The gate opens here, not above.
  const queue = await rest(gm, `v_lab_approval_queue?select=*&master_batch_id=eq.${batchId}&awaiting_decision=eq.true`);
  for (const q of queue.body ?? []) {
    if (labApproved.has(q.activity_id)) continue;
    if (labSubmitOnly.has(q.activity_id) || labHold.has(q.activity_id)) continue; // left for the demo
    const d = await rpc(gm, 'decide_lab_submission', {
      p_activity: q.activity_id, p_verdict: 'approved',
      p_reason: `${CODE} — reading within the SOP band, released.`,
    });
    if (d.ok) { labApproved.add(q.activity_id); gatesOpened++; }
    else stuck.set(`decide ${q.activity_code ?? q.activity_id}`, msg(d).slice(0, 160));
  }

  let progressed = 0;
  for (const a of open) {
    if (labHold.has(a.activity_id)) continue;           // never sampled — stays in the lab queue
    if (STOP_AT_HR !== null && Number(a.baseline_start_hour ?? 0) > STOP_AT_HR) continue; // not reached yet
    const isLab = a.responsible_role === 'lab_tech';
    const who = isLab ? lab : supervisor;

    // A lab checkpoint has to produce a reading before it can be submitted.
    if (isLab) {
      const q = await rest(lab, `v_lab_approval_queue?select=checkpoint_code,sample_id&activity_id=eq.${a.activity_id}`);
      const cpCode = q.body?.[0]?.checkpoint_code;
      if (cpCode && !q.body?.[0]?.sample_id) {
        const cp = await rest(lab, `lab_checkpoint?select=id&code=eq.${cpCode}`);
        const sample = await rpc(lab, 'open_lab_sample', { p_activity: a.activity_id, p_checkpoint: cp.body?.[0]?.id, p_label: `${CODE}-${a.code}` });
        if (sample.ok) {
          const t = await rpc(lab, 'request_lab_test', { p_sample: idOf(sample), p_parameter: 'moisture' });
          if (t.ok) { await rpc(lab, 'record_lab_result', { p_test: idOf(t), p_numeric: 67.4 }); labDone++; }
        }
      }
    }

    if (labSubmitOnly.has(a.activity_id)) {
      // The reading is recorded and the evidence bound; the activity is closed so it reaches the
      // approval queue. What is deliberately NOT done is the decision.
      await bindEvidence(lab, a.activity_id);
      const w0 = statedWindow(a);
      await rpc(lab, 'submit_activity', {
        p_activity: a.activity_id, p_values: {},
        p_remarks: `${CODE} — submitted for decision, left undecided for the lab demo`,
        p_actual_start: w0.start, p_actual_end: w0.end,
      });
      continue;
    }

    await bindEvidence(who, a.activity_id);
    const values = await fieldValues(who, a.activity_id);
    const w = statedWindow(a);

    /*
     * A START THAT IS ALREADY ON THE RECORD WINS, AND HAS TO.
     *
     * `submit_activity` coalesces — it does not move an `actual_start` that exists. Step 6 starts
     * one activity live to prove the server stamps its own clock, so that row carries a start of
     * NOW while its planned window is in the past, and a stated end inside that window is an end
     * before its start. The database refuses it on `batch_activity_actual_end_after_start`, which
     * is correct and is the constraint doing its job.
     *
     * The factory's answer is not to overwrite the stamp — rule 2 forbids that — but to SUPERSEDE
     * it: `correct_actual` as a supervisor, with a reason, leaving the original on the record. It
     * is the same call `markRunning` makes in the app when work began before anyone opened it.
     */
    if (a.actual_start && new Date(a.actual_start).getTime() >= new Date(w.end).getTime()) {
      const fix = await rpc(supervisor, 'correct_actual', {
        p_activity: a.activity_id, p_field: 'actual_start', p_value: w.start,
        p_reason: `${CODE} — the stamp recorded when this was opened for the walk, superseded by the time the work actually ran.`,
      });
      if (fix.ok) corrections++;
      else stuck.set(a.code, `correct_actual: ${msg(fix).slice(0, 150)}`);
    }

    const sub = await rpc(who, 'submit_activity', {
      p_activity: a.activity_id,
      p_values: values,
      p_remarks: `${CODE} — recorded in its planned window during the end-to-end walk`,
      p_actual_start: w.start,
      p_actual_end: w.end,
    });
    const row = one(sub.body);
    if (sub.ok && row?.new_state === 'COMPLETED') { completed++; progressed++; stuck.delete(a.code); }
    else if (row?.outstanding_evidence) stuck.set(a.code, `evidence outstanding: ${row.outstanding_evidence}`);
    else if (!sub.ok) stuck.set(a.code, msg(sub).slice(0, 170));
    else stuck.set(a.code, `state ${row?.new_state ?? '?'}`);
  }

  const still = (await rest(supervisor, `v_my_work?select=activity_id&master_batch_id=eq.${batchId}&state=neq.COMPLETED`)).body ?? [];
  say(`   round ${round}: ${progressed} closed this pass · ${still.length} still open · ${gatesOpened} lab gate(s) opened so far`);
  if (progressed === 0) { say('   no further progress is possible — remaining blockers are listed below'); break; }
}

// ══════════════════════════════════════════════════════════════════ 8 · RESULT
step('8 · WHERE THE BATCH ENDED UP');
const final = await rest(supervisor, `v_my_work?select=code,title,state,blocked_reason,responsible_role&master_batch_id=eq.${batchId}`);
const rowsF = final.body ?? [];
const done = rowsF.filter((r) => r.state === 'COMPLETED');
const notDone = rowsF.filter((r) => r.state !== 'COMPLETED');
say(`       ${done.length} of ${rowsF.length} activities COMPLETED`);
const reserved = labHold.size + labSubmitOnly.size;
if (STOP_AT_HR !== null) {
  const late = rowsF.filter((r) => r.state !== 'COMPLETED').length;
  ok(`the batch is mid-process at H${STOP_AT_HR} — ${done.length} done, ${late} still ahead of it`, done.length > 0);
  say(`       ${labHold.size} checkpoint(s) waiting in /lab/queue · ${labSubmitOnly.size} waiting in /lab/approvals`);
} else {
  ok(reserved > 0
       ? `everything is complete except the ${reserved} checkpoint(s) held back for the lab demo`
       : 'every activity on the batch is complete',
     notDone.length === reserved, `${notDone.length} open, ${reserved} deliberately held`);
}

if (notDone.length) {
  say('\n   STILL OPEN — the server\'s own reason for each:');
  const grouped = new Map();
  for (const r of notDone) {
    const why = stuck.get(r.code) ?? r.blocked_reason ?? `state ${r.state}`;
    if (!grouped.has(why)) grouped.set(why, []);
    grouped.get(why).push(r.code);
  }
  for (const [why, codes] of [...grouped].sort((a, b) => b[1].length - a[1].length)) {
    say(`     · ${codes.length}× ${codes.slice(0, 6).join(', ')}${codes.length > 6 ? ', …' : ''}`);
    say(`         ${why}`);
  }
}
if (evidenceRefusals.length) {
  const u = [...new Set(evidenceRefusals)].slice(0, 5);
  say(`\n   evidence refusals (${evidenceRefusals.length} total, ${u.length} distinct shown):`);
  for (const e of u) say(`     · ${e}`);
}

step('9 · MANAGEMENT — plan, authorisation and forecast stay separate');
const fc = await rest(supervisor, `v_batch_forecast?select=*&master_batch_id=eq.${batchId}`);
const f = fc.body?.[0];
if (f) {
  say(`       process ${f.process_code} · standard H${f.standard_hr} · H0 ${f.h0}`);
  say(`       baseline end ${f.planned_end_at}`);
  say(`       authorised   ${f.authorised_end_at} (extension ${f.approved_extension_hr ?? 'none'})`);
  say(`       projected    ${f.projected_end_at ?? '—'} (basis: ${f.forecast_basis})`);
  ok('the baseline is H0 + the calculated standard, not a day grid',
     Math.round((new Date(f.planned_end_at) - new Date(f.h0)) / 3600_000) === Number(f.standard_hr));
}
const ev = await rest(supervisor, `v_evidence_state?select=batch_activity_id&master_batch_id=eq.${batchId}&satisfied_count=gt.0`);
say(`       evidence rows bound: ${(ev.body ?? []).length}`);
say(`       superseding corrections recorded: ${corrections}`);

say(`\n\x1b[1m${'─'.repeat(72)}\x1b[0m`);
say(`\x1b[1m${pass} passed, ${fail} failed\x1b[0m`);
say(`\nbatch  ${CODE}`);
say(`id     ${batchId}`);
say(`open   http://localhost:5173/batch/${batchId}`);
say(`\nThis batch carries real rows. To remove it:`);
say(`  select cancel_batch('${batchId}', '${CODE} end-to-end walk complete');`);

writeFileSync(join(ROOT, 'batchexp-run.txt'), log.join('\n') + '\n', 'utf8');
say(`\nwritten to mushroomos/batchexp-run.txt`);
process.exit(fail === 0 ? 0 : 1);
