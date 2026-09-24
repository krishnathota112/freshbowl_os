#!/usr/bin/env node
/**
 * Puts ONE lab checkpoint into the state a demo needs: sampled, tested, readings recorded,
 * submitted — and deliberately NOT decided.
 *
 *   BATCH=BATCHLAB node scripts/lab-demo-state.mjs
 *
 * WHY THIS IS NOT PART OF THE BATCH WALK.
 *   `src/api/lab.ts` deliberately does not resolve which lab checkpoint an activity belongs to.
 *   Both checkpoint maps are offered, day-matched rows are sorted first as "a CONVENIENCE ORDERING
 *   ONLY", and the screen requires the technician to choose — because C-33 and TBD-36 leave the
 *   mapping unsettled. A script that picked one silently, on every one of 41 checkpoints, would be
 *   deciding something the factory has not, and would bury it in seed data.
 *
 *   So this does what the technician does, ONCE, and says which checkpoint it chose and why. The
 *   choice is recorded in the sample label, so anyone looking at the row can see a script made it.
 *
 * WHAT IT PROVES ON SCREEN
 *   `/lab/queue`      the checkpoint leaves "what to sample next"
 *   `/lab/approvals`  it arrives as WAITING APPROVAL with real readings behind it
 *   the gate          the production activity it holds stays LOCKED until somebody decides
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.NODE_EXTRA_CA_CERTS) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
const env = {};
for (const l of raw.split('\n')) {
  const t = l.trim(); if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('='); if (i < 0) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const URL_ = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const BATCH = process.env.BATCH ?? 'BATCHLAB';

async function signIn(email) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'mushroom2026' }),
  });
  const b = await r.json();
  if (!b.access_token) throw new Error(`sign-in failed ${email}`);
  return { token: b.access_token };
}
const H = (s, x = {}) => ({ apikey: ANON, Authorization: `Bearer ${s.token}`, ...x });
async function parse(r) {
  const t = await r.text();
  let body = t; try { body = t ? JSON.parse(t) : null; } catch { /* raw */ }
  return { status: r.status, ok: r.ok, body };
}
const rest = async (s, p) => parse(await fetch(`${URL_}/rest/v1/${p}`, { headers: H(s) }));
const rpc = async (s, fn, args) => parse(await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
  method: 'POST', headers: H(s, { 'Content-Type': 'application/json' }), body: JSON.stringify(args),
}));
const msg = (r) => (typeof r.body === 'object' && r.body?.message) || String(JSON.stringify(r.body)).slice(0, 200);
const idOf = (r) => (typeof r.body === 'string' ? r.body : (Array.isArray(r.body) ? r.body[0] : r.body)?.id);

const lab = await signIn('lab@freshbowl.demo');
console.log(`lab demo state · batch ${BATCH}`);

const b = await rest(lab, `master_batch?select=id&code=eq.${encodeURIComponent(BATCH)}`);
const batchId = b.body?.[0]?.id;
if (!batchId) { console.error(`no such batch: ${BATCH}`); process.exit(1); }

// A checkpoint still waiting to be sampled, with parameters to record.
const queue = await rest(lab, `v_lab_queue?select=*&master_batch_id=eq.${batchId}&action_required=eq.true`);
const target = (queue.body ?? []).find((r) => (r.parameters ?? []).length > 0 && Number(r.samples ?? 0) === 0);
if (!target) { console.error('nothing in the lab queue is waiting to be sampled'); process.exit(1); }
console.log(`\nactivity   ${target.activity_title} · ${target.scope_label}`);
console.log(`parameters ${(target.parameters ?? []).join(', ')}`);

/*
 * THE CHOICE THE TECHNICIAN MAKES, made explicitly here.
 *
 * Both maps are listed exactly as `loadCheckpointOptions` lists them. The one chosen is the
 * checkpoint whose own parameter list overlaps this activity's most — a defensible reading of
 * "which checkpoint is this", and NOT a claim that the mapping is settled. It is named in the
 * output and in the sample label.
 */
const cps = await rest(lab, 'lab_checkpoint?select=id,code,name,checkpoint_map,parameters,is_prebatch&is_prebatch=eq.false');
const want = new Set(target.parameters ?? []);
const scored = (cps.body ?? [])
  .map((c) => ({ c, overlap: (c.parameters ?? []).filter((p) => want.has(p)).length }))
  .filter((x) => x.overlap > 0)
  .sort((a, b) => b.overlap - a.overlap || a.c.code.localeCompare(b.c.code));
if (scored.length === 0) { console.error('no checkpoint shares a parameter with this activity'); process.exit(1); }
const cp = scored[0].c;
console.log(`checkpoint ${cp.code} — ${cp.name} (${cp.checkpoint_map}), ${scored[0].overlap} parameter(s) in common`);
console.log(`           chosen by parameter overlap; ${scored.length} candidate(s) shared at least one`);

const started = await rpc(lab, 'start_activity', { p_activity: target.activity_id });
if (!started.ok) console.log(`start: ${msg(started)}`);

const sample = await rpc(lab, 'open_lab_sample', {
  p_activity: target.activity_id, p_checkpoint: cp.id,
  p_label: `${BATCH} demo — checkpoint ${cp.code} chosen by script`,
  p_at: new Date(Date.now() - 3600_000).toISOString(),
});
if (!sample.ok) { console.error(`open_lab_sample refused: ${msg(sample)}`); process.exit(1); }
const sampleId = idOf(sample);
console.log(`\nsample     opened (${sampleId})`);

// Mid-band readings, so nothing reads as a deliberate out-of-spec result.
const READING = { moisture_pct: 68.4, ph: 7.2, ec: 1.9, dry_weight: 21.0, moisture: 67.8, n_pct: 1.8, ash_pct: 18.5, temperature: 58.0 };
let recorded = 0;
for (const p of target.parameters ?? []) {
  const t = await rpc(lab, 'request_lab_test', { p_sample: sampleId, p_parameter: p });
  if (!t.ok) { console.log(`  ${p}: test refused — ${msg(t)}`); continue; }
  const value = READING[p] ?? 50;
  const rr = await rpc(lab, 'record_lab_result', { p_test: idOf(t), p_numeric: value });
  if (rr.ok) { recorded++; console.log(`  ${p} = ${value}`); }
  else console.log(`  ${p}: result refused — ${msg(rr)}`);
}
console.log(`readings   ${recorded} recorded`);

// Evidence, then submit. The DECISION is deliberately not made.
const reqs = await rest(lab, `v_evidence_state?select=key,min_count,satisfied_count&batch_activity_id=eq.${target.activity_id}`);
const PHOTO = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
for (const r of [...new Map((reqs.body ?? []).map((x) => [x.key, x])).values()]) {
  for (let i = Number(r.satisfied_count ?? 0); i < Number(r.min_count ?? 0); i++) {
    const path = `${batchId}/${target.activity_id}/${r.key}-${Date.now()}-${i}.jpg`;
    await parse(await fetch(`${URL_}/storage/v1/object/evidence/${path}`, {
      method: 'POST', headers: H(lab, { 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }), body: PHOTO,
    }));
    await rpc(lab, 'bind_evidence', {
      p_activity: target.activity_id, p_requirement_key: r.key, p_storage_path: path, p_media_kind: 'photo',
    });
  }
}

const done = await rpc(lab, 'complete_activity', { p_activity: target.activity_id, p_values: {}, p_remarks: `${BATCH} — submitted for decision; left undecided on purpose` });
const row = Array.isArray(done.body) ? done.body[0] : done.body;
console.log(`submitted  ${done.ok ? row?.new_state : msg(done)}${row?.outstanding_evidence ? ' · ' + row.outstanding_evidence : ''}`);

const q = await rest(lab, `v_lab_approval_queue?select=activity_code,checkpoint_code,gates_activity_code,gates_activity_state,awaiting_decision,sample_count,result_count&activity_id=eq.${target.activity_id}`);
const a = q.body?.[0];
if (a) {
  console.log(`\nnow in /lab/approvals:`);
  console.log(`  ${a.checkpoint_code} · awaiting_decision=${a.awaiting_decision} · samples=${a.sample_count} · readings=${a.result_count}`);
  if (a.gates_activity_code) console.log(`  holds ${a.gates_activity_code} (${a.gates_activity_state})`);
}
console.log(`\nDecide it in the UI as supervisor or GM — that is the demo.`);
