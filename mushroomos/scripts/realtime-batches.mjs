#!/usr/bin/env node
/**
 * Three PROCESS-2026C batches on the REAL clock, built the way an Admin builds them.
 *
 *   node scripts/realtime-batches.mjs
 *
 * WHAT "REAL TIME" MEANS HERE
 *   H0 is now — not backdated, not fabricated. Every actual timestamp is stamped by the server as
 *   the work happens, so a task started in this run is genuinely late or early against a baseline
 *   the server derived seconds earlier. Nothing sets a clock; nothing pretends.
 *
 * WHAT IT PROVES
 *   1 · the pre-H0 activity is planned BEFORE H0 (0068)
 *   2 · the incoming-material check gates activation, and clears it
 *   3 · one, two and three batches coexist without touching each other
 *   4 · a real elapsed variance, measured against a baseline set minutes ago
 */
import { readFileSync } from 'node:fs';
if (!process.env.NODE_EXTRA_CA_CERTS) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = (k) => {
  for (const l of raw.split('\n')) {
    const t = l.trim(); const e = t.indexOf('=');
    if (e > 0 && t.slice(0, e).trim() === k) return t.slice(e + 1).trim().replace(/^["']|["']$/g, '');
  }
};
const U = env('VITE_SUPABASE_URL'), A = env('VITE_SUPABASE_ANON_KEY');

const si = async (m) => {
  const r = await fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: m, password: 'mushroom2026' }),
  });
  return (await r.json()).access_token;
};
const H = (t) => ({ apikey: A, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
const rpc = async (t, f, a) => {
  const r = await fetch(`${U}/rest/v1/rpc/${f}`, { method: 'POST', headers: H(t), body: JSON.stringify(a) });
  const x = await r.text(); let b = x; try { b = JSON.parse(x); } catch {}
  return { ok: r.ok, status: r.status, body: b };
};
const rest = async (t, p) => (await fetch(`${U}/rest/v1/${p}`, { headers: H(t) })).json();
const id = (b) => (typeof b === 'string' ? b : b?.id);

let pass = 0; const fails = [];
const step = (s) => console.log(`\n\x1b[1m── ${s}\x1b[0m`);
const ok = (l, c, d = '') => {
  if (c) { pass++; console.log(`   \x1b[32m✓\x1b[0m ${l}`); }
  else { fails.push(l); console.log(`   \x1b[31m✗ ${l}\x1b[0m${d ? '\n       ' + d : ''}`); }
  return c;
};
const note = (t) => console.log(`       ${t}`);

const adm = await si('admin@freshbowl.demo');
const sup = await si('supervisor@freshbowl.demo');
const lab = await si('lab@freshbowl.demo');
const opr = await si('operator@freshbowl.demo');
const gm  = await si('gm@freshbowl.demo');

const P = (await rest(adm, 'v_process_catalogue?select=*&code=eq.PROCESS-2026C'))[0];
const need = await rest(adm, `process_activity?select=material_role&process_definition_id=eq.${P.process_definition_id}&material_role=not.is.null`);
const elig = await rest(adm, 'material_role_eligibility?select=role,is_default_lead,material:material(code)');
const roles = [...new Set(need.map((r) => r.material_role))].map((role) => {
  const l = elig.find((e) => e.role === role && e.is_default_lead) ?? elig.find((e) => e.role === role);
  return { role, material_code: l.material.code, lead: true };
});
const staff = await rest(adm, 'profiles?select=id,role&is_active=eq.true');
const cps = await rest(lab, 'lab_checkpoint?select=id,code&is_prebatch=eq.true&order=code');

/** Build one batch on the real clock. Returns everything the later checks need. */
async function build(tag) {
  const h0 = new Date().toISOString();               // NOW. Not backdated.
  const code = `MB-RT${tag}-${Date.now() % 100000}`;
  const made = await rpc(adm, 'create_master_batch', {
    p_code: code, p_label: `real-time run ${tag}`, p_start_date: h0.slice(0, 10), p_start_at: h0,
    p_config: {}, p_roles: roles, p_supervisor: null, p_weather: null,
    p_process_definition_id: P.process_definition_id,
  });
  if (!made.ok) throw new Error(`${code}: ${JSON.stringify(made.body).slice(0, 200)}`);
  const B = id(made.body);
  const gen = await rpc(adm, 'generate_activity_plan', { p_batch_id: B });
  const activities = Array.isArray(gen.body) ? gen.body[0].activities : null;

  // Refused until the incoming material is on record.
  const early = await rpc(adm, 'activate_batch', { p_batch_id: B });

  const at = new Date(Date.parse(h0) - 3600_000).toISOString();
  const sm = await rpc(sup, 'open_prebatch_sample', {
    p_batch: B, p_checkpoint: cps[0].id, p_label: 'Incoming material assay, recorded before H0', p_at: at,
  });
  for (const [par, val] of [['moisture_pct', 56.2], ['ph', 5.63]]) {
    const t = await rpc(sup, 'request_lab_test', { p_sample: id(sm.body), p_parameter: par, p_via: 'user' });
    const r = await rpc(sup, 'record_lab_result', { p_test: id(t.body), p_numeric: val });
    await rpc(sup, 'accept_lab_result', { p_result: id(r.body), p_reason: 'Incoming material assay, accepted as final before H0.' });
  }

  const un = await rest(adm, `batch_activity?select=id,responsible_role&master_batch_id=eq.${B}&assigned_person_id=is.null&is_time_gate=eq.false&is_hold=eq.false`);
  for (const a of un) {
    const p = staff.find((s) => s.role === a.responsible_role) ?? staff.find((s) => s.role === 'operator');
    await rpc(sup, 'assign_activity', { p_activity: a.id, p_person: p.id, p_reason: 'real-time run' });
  }
  const act = await rpc(adm, 'activate_batch', { p_batch_id: B });
  return { code, B, h0, activities, refusedBefore: !early.ok, activated: act.ok, actBody: act.body };
}

// ── ONE ───────────────────────────────────────────────────────────────────────
step('ONE BATCH · H0 = now');
const A1 = await build('A');
note(`${A1.code}  H0 ${A1.h0}`);
ok('110 activities generated', A1.activities === 110, `got ${A1.activities}`);
ok('activation REFUSED before the material check', A1.refusedBefore);
ok('activation ACCEPTED after it', A1.activated, JSON.stringify(A1.actBody).slice(0, 180));

step('PRE-H0 · 0068');
const pre = await rest(sup, `batch_activity?select=code,is_pre_h0,pre_h0_offset,baseline_start_hour,planned_start_at&master_batch_id=eq.${A1.B}&is_pre_h0=eq.true`);
ok('the pre-H0 flag survives plan generation', pre.length === 1, `${pre.length} rows carry is_pre_h0`);
if (pre.length === 1) {
  const off = Number(pre[0].pre_h0_offset);
  const delta = (Date.parse(pre[0].planned_start_at) - Date.parse(A1.h0)) / 3600_000;
  note(`${pre[0].code} · offset ${off} h · planned ${delta.toFixed(2)} h relative to H0`);
  ok(`it is planned ${off} h BEFORE H0`, Math.abs(delta + off) < 0.02, `delta ${delta}`);
  ok('its baseline hour is untouched — the standard is the SOP\'s', Number(pre[0].baseline_start_hour) === 0);
}
const std = (await rest(sup, `v_batch_forecast?select=standard_hr,planned_end_at,h0&master_batch_id=eq.${A1.B}`))[0];
ok('the standard still computes 470', Number(std.standard_hr) === 470, `got ${std.standard_hr}`);
ok('baseline end is H0 + 470 h exactly',
   Math.round((Date.parse(std.planned_end_at) - Date.parse(std.h0)) / 3600_000) === 470);

// ── TWO ───────────────────────────────────────────────────────────────────────
step('TWO BATCHES');
const A2 = await build('B');
note(`${A2.code}  H0 ${A2.h0}`);
ok('the second also generates 110 and activates', A2.activities === 110 && A2.activated);
ok('they are different batches with different H0', A1.B !== A2.B && A1.h0 !== A2.h0);

// real work on ONE of them, on the real clock
step('REAL WORK · server-stamped, on the real clock');
const work = await rest(opr, `v_my_work?select=*&master_batch_id=eq.${A1.B}&state=eq.READY&responsible_role=eq.operator&order=planned_start_at.asc`);
const target = work.find((w) => (w.required_count ?? 0) >= 2 && !w.is_hold) ?? work[0];
ok('the operator sees work on the new batch', Boolean(target), `${work.length} ready rows`);
note(`${target.code} — ${target.title}`);
note(`planned ${target.planned_start_at}`);

const t0 = Date.now();
await rpc(opr, 'start_activity', { p_activity: target.activity_id });
const started = (await rest(opr, `v_my_work?select=actual_start,state&activity_id=eq.${target.activity_id}`))[0];
ok('the SERVER stamped actual_start', Boolean(started.actual_start));
const skew = Math.abs(Date.parse(started.actual_start) - t0) / 1000;
ok(`the stamp is the server's own clock (±${skew.toFixed(1)} s from this machine)`, skew < 120, `${skew} s apart`);
note(`actual_start ${started.actual_start}`);

// evidence, then finish — real elapsed time between the two
const reqs = await rest(opr, `v_evidence_state?select=key,min_count,satisfied_count&batch_activity_id=eq.${target.activity_id}`);
const need2 = [...new Map((reqs ?? []).map((r) => [r.key, r])).values()];
const photo = readFileSync(process.env.DUMMY_IMAGE
  ?? 'D:/exisiting_freshbowl/image_for_dummy_batch/wp2318297-ben-affleck-batman-wallpapers.jpg');
let bound = 0;
for (const r of need2) {
  for (let i = r.satisfied_count; i < r.min_count; i++) {
    const path = `${A1.B}/${target.activity_id}/${r.key}-${Date.now()}-${i}.jpg`;
    const up = await fetch(`${U}/storage/v1/object/evidence/${path}`, {
      method: 'POST', headers: { apikey: A, Authorization: `Bearer ${opr}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'false' },
      body: photo,
    });
    if (!up.ok) { ok(`upload ${r.key}`, false, await up.text()); continue; }
    const b = await rpc(opr, 'bind_evidence', {
      p_activity: target.activity_id, p_requirement_key: r.key, p_storage_path: path, p_media_kind: 'photo',
    });
    if (b.ok) bound++;
  }
}
ok(`${bound} photograph(s) uploaded and bound`, bound === need2.reduce((s, r) => s + (r.min_count - r.satisfied_count), 0));

const done = await rpc(opr, 'complete_activity', { p_activity: target.activity_id, p_values: {}, p_remarks: null });
const row = Array.isArray(done.body) ? done.body[0] : done.body;
ok('finished', done.ok && !row?.outstanding_evidence, JSON.stringify(done.body).slice(0, 160));
const fin = (await rest(opr, `v_my_work?select=actual_end,variance_minutes&activity_id=eq.${target.activity_id}`))[0];
const elapsed = (Date.parse(fin.actual_end) - Date.parse(started.actual_start)) / 1000;
note(`actual_end ${fin.actual_end}  ·  really elapsed ${elapsed.toFixed(1)} s  ·  variance ${fin.variance_minutes} min`);
ok('the elapsed time is real, not fabricated', elapsed > 0 && elapsed < 600, `${elapsed}s`);

// ── THREE ─────────────────────────────────────────────────────────────────────
step('THREE BATCHES · independence');
const A3 = await build('C');
note(`${A3.code}  H0 ${A3.h0}`);
ok('the third generates 110 and activates', A3.activities === 110 && A3.activated);

const counts = {};
for (const [tag, b] of [['A', A1], ['B', A2], ['C', A3]]) {
  const rows = await rest(sup, `v_batch_forecast?select=code,finished_count,activity_count,standard_hr,h0,slip_minutes&master_batch_id=eq.${b.B}`);
  counts[tag] = rows[0];
  note(`${tag} ${rows[0].code}  ${rows[0].finished_count}/${rows[0].activity_count} done  H${rows[0].standard_hr}  slip ${rows[0].slip_minutes ?? '—'}`);
}
ok('only the batch that was worked has a completed activity',
   Number(counts.A.finished_count) > 0 && Number(counts.B.finished_count) === 0 && Number(counts.C.finished_count) === 0);
ok('each carries its own H0', new Set([counts.A.h0, counts.B.h0, counts.C.h0]).size === 3);
ok('all three compute the same standard, being the same SOP',
   [counts.A, counts.B, counts.C].every((x) => Number(x.standard_hr) === 470));

const ev = await rest(sup, `v_evidence_state?select=media_id&master_batch_id=eq.${A2.B}&media_id=not.is.null`);
ok('batch B carries no evidence from batch A', ev.length === 0, `${ev.length} rows`);

console.log(`\n\x1b[1m${'─'.repeat(66)}\x1b[0m`);
console.log(`\x1b[1m${pass} passed, ${fails.length} failed\x1b[0m`);
for (const f of fails) console.log(`   \x1b[31m✗\x1b[0m ${f}`);
console.log('\nbatches');
for (const b of [A1, A2, A3]) console.log(`  ${b.code}  ${b.B}`);
process.exit(fails.length === 0 ? 0 : 1);
