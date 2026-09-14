/**
 * Shared machinery for the adversarial pass.
 *
 * EVERYTHING HERE TALKS HTTP, AS A REAL PERSON. No service-role key, and no direct SQL for any
 * attack. If an attack succeeds here, somebody holding a phone and the public anon key can do it
 * too. A hidden button is not a defence and is never accepted as one.
 */
import { readFileSync } from 'node:fs';
if (!process.env.NODE_EXTRA_CA_CERTS) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const raw = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8');
export const env = (k) => {
  for (const l of raw.split('\n')) {
    const t = l.trim(), e = t.indexOf('=');
    if (e > 0 && t.slice(0, e).trim() === k) return t.slice(e + 1).trim().replace(/^["']|["']$/g, '');
  }
};
export const U = env('VITE_SUPABASE_URL');
export const A = env('VITE_SUPABASE_ANON_KEY');

export const signIn = async (m) => (await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: m, password: 'mushroom2026' }),
})).json()).access_token;

const H = (t) => (t
  ? { apikey: A, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }
  : { apikey: A, 'Content-Type': 'application/json' });

export const rpc = async (t, f, a = {}) => {
  const r = await fetch(`${U}/rest/v1/rpc/${f}`, { method: 'POST', headers: H(t), body: JSON.stringify(a) });
  const x = await r.text();
  let b = x; try { b = JSON.parse(x); } catch { /* text is the body */ }
  return { ok: r.ok, status: r.status, body: b };
};
export const rest = async (t, p) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { headers: H(t) });
  const j = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, rows: Array.isArray(j) ? j : [], raw: j };
};

/**
 * A read whose failure must not look like an empty result.
 *
 * WHY THIS EXISTS. The first run of this harness reported three defects that were not defects. It
 * had selected `requirement_key` from `batch_activity_evidence_req`, whose column is `key`;
 * PostgREST answered with an error object, `rest()` turned "not an array" into `[]`, and the run
 * concluded that evidence was missing, that binds were rejected, and that duplicate submits were
 * accepted. All three were the same typo wearing three costumes.
 *
 * A test harness that converts its own errors into quiet emptiness will invent findings. Any read
 * whose emptiness would be evidence goes through here instead, and a broken query is fatal.
 */
export async function readOrDie(t, p, what) {
  const r = await rest(t, p);
  if (!r.ok || !Array.isArray(r.raw)) {
    throw new Error(`harness read failed (${what}): HTTP ${r.status} ${msg(r.raw)}\n    ${p}`);
  }
  return r.rows;
}
export const patch = async (t, p, body) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { method: 'PATCH', headers: H(t), body: JSON.stringify(body) });
  const x = await r.text();
  return { ok: r.ok, status: r.status, body: x };
};
export const upload = async (t, path, bytes, mime = 'image/jpeg') =>
  fetch(`${U}/storage/v1/object/evidence/${path}`, {
    method: 'POST', headers: { apikey: A, Authorization: `Bearer ${t}`, 'Content-Type': mime }, body: bytes });

export const id = (b) => (typeof b === 'string' ? b : (Array.isArray(b) ? id(b[0]) : b?.id));
export const msg = (b) => String(typeof b === 'string' ? b
  : (b?.message || b?.hint || b?.error || JSON.stringify(b))).replace(/\s+/g, ' ').slice(0, 190);

/* ── findings ─────────────────────────────────────────────────────────────────
 * P0 corrupts or falsifies process history / bypasses a critical gate
 * P1 wrong actor performs a critical operation / cross-batch contamination
 * P2 workflow can break or become inconsistent
 * P3 usability or recoverability
 */
export const findings = [];
let passed = 0;
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };

export const section = (s) => console.log(`\n${C.b}== ${s} ${C.x}`);
export const note = (s) => console.log(`   ${C.d}${s}${C.x}`);
export const warn = (s) => console.log(`   ${C.y}!${C.x} ${s}`);

/** An attack that MUST be refused. Refusal is res.ok === false. */
export function mustRefuse({ id, sev, attack, expected, res, extra }) {
  if (res && res.ok === false) {
    passed++; console.log(`   ${C.g}OK${C.x} ${attack}  ${C.d}(${res.status})${C.x}`); return true;
  }
  const actual = extra ?? `ACCEPTED - HTTP ${res?.status} ${msg(res?.body)}`;
  findings.push({ id, sev, attack, expected, actual, reproducible: 'deterministic' });
  console.log(`   ${C.r}XX ${sev} ${id} - ${attack}${C.x}\n       expected: ${expected}\n       actual:   ${actual}`);
  return false;
}

/** An invariant that must hold. */
export function mustHold({ id, sev, attack, expected, actual, ok }) {
  if (ok) { passed++; console.log(`   ${C.g}OK${C.x} ${attack}`); return true; }
  findings.push({ id, sev, attack, expected, actual, reproducible: 'deterministic' });
  console.log(`   ${C.r}XX ${sev} ${id} - ${attack}${C.x}\n       expected: ${expected}\n       actual:   ${actual}`);
  return false;
}

export function report(title) {
  const by = (s) => findings.filter((f) => f.sev === s);
  console.log(`\n${C.b}${'-'.repeat(74)}${C.x}`);
  console.log(`${C.b}${title}${C.x}   ${C.g}${passed} attacks repelled${C.x}, ${findings.length ? C.r : C.g}${findings.length} defect(s)${C.x}`);
  for (const s of ['P0', 'P1', 'P2', 'P3']) {
    const f = by(s); if (!f.length) continue;
    console.log(`\n  ${s} - ${f.length}`);
    f.forEach((x) => console.log(`    ${x.id}  ${x.attack}\n        expected: ${x.expected}\n        actual:   ${x.actual}`));
  }
  const verdict = (by('P0').length || by('P1').length) ? 'FAIL' : findings.length ? 'FAIL (P2/P3)' : 'PASS';
  console.log(`\n${C.b}SANITY_RESULT: ${verdict === 'PASS' ? C.g : C.r}${verdict}${C.x}\n`);
  return findings;
}

/** Everyone, signed in for real. */
export async function cast() {
  const [admin, supervisor, lab, operator, manager, gm] = await Promise.all([
    signIn('admin@freshbowl.demo'), signIn('supervisor@freshbowl.demo'), signIn('lab@freshbowl.demo'),
    signIn('operator@freshbowl.demo'), signIn('manager@freshbowl.demo'), signIn('gm@freshbowl.demo'),
  ]);
  return { admin, supervisor, lab, operator, manager, gm, anon: null };
}

/**
 * A throwaway batch, built exactly the way an Admin builds one.
 *
 * Named MB-BRK* so nothing here is ever confused with a demo fixture. Destructive attacks run
 * against these and never against MB-DEMO-*.
 */
export async function buildBatch({ adm, sup, lab, tag, processCode = 'PROCESS-2026C',
                                  h0 = new Date().toISOString(), config = null,
                                  materialCheck = true, activate = true }) {
  const P = (await rest(adm, `v_process_catalogue?select=*&code=eq.${processCode}`)).rows[0];
  if (!P) throw new Error(`no process ${processCode}`);
  const need = (await rest(adm, `process_activity?select=material_role&process_definition_id=eq.${P.process_definition_id}&material_role=not.is.null`)).rows;
  const elig = (await rest(adm, 'material_role_eligibility?select=role,is_default_lead,material:material(code)')).rows;
  const roles = [...new Set(need.map((r) => r.material_role))].map((role) => {
    const l = elig.find((e) => e.role === role && e.is_default_lead) ?? elig.find((e) => e.role === role);
    return { role, material_code: l.material.code, lead: true };
  });
  const staff = (await rest(adm, 'profiles?select=id,role&is_active=eq.true')).rows;
  const cps = (await rest(lab, 'lab_checkpoint?select=id,code&is_prebatch=eq.true&order=code')).rows;

  const code = `MB-BRK${tag}-${Date.now() % 100000}`;
  const made = await rpc(adm, 'create_master_batch', {
    p_code: code, p_label: `adversarial ${tag}`, p_start_date: h0.slice(0, 10), p_start_at: h0,
    p_config: config ?? {}, p_roles: roles, p_supervisor: null, p_weather: null,
    p_process_definition_id: P.process_definition_id,
  });
  if (!made.ok) throw new Error(`${code}: ${msg(made.body)}`);
  const B = id(made.body);
  const gen = await rpc(adm, 'generate_activity_plan', { p_batch_id: B });
  const activities = Array.isArray(gen.body) ? gen.body[0].activities : null;

  const refusedBefore = !(await rpc(adm, 'activate_batch', { p_batch_id: B })).ok;

  // `materialCheck: false` leaves the batch in draft with the incoming assay still outstanding,
  // which is what a test of the pre-batch gate itself needs.
  if (materialCheck) {
    const at = new Date(Date.parse(h0) - 3600_000).toISOString();
    const sm = await rpc(sup, 'open_prebatch_sample', { p_batch: B, p_checkpoint: cps[0].id, p_label: 'incoming assay', p_at: at });
    for (const [par, val] of [['moisture_pct', 56.2], ['ph', 5.63]]) {
      const t = await rpc(sup, 'request_lab_test', { p_sample: id(sm.body), p_parameter: par, p_via: 'user' });
      const r = await rpc(sup, 'record_lab_result', { p_test: id(t.body), p_numeric: val });
      await rpc(sup, 'accept_lab_result', { p_result: id(r.body), p_reason: 'accepted before H0' });
    }
  }
  const un = (await rest(adm, `batch_activity?select=id,responsible_role&master_batch_id=eq.${B}&assigned_person_id=is.null&is_time_gate=eq.false&is_hold=eq.false`)).rows;
  for (const a of un) {
    const p = staff.find((s) => s.role === a.responsible_role) ?? staff.find((s) => s.role === 'operator');
    await rpc(sup, 'assign_activity', { p_activity: a.id, p_person: p.id, p_reason: 'adversarial run' });
  }
  const act = activate ? await rpc(adm, 'activate_batch', { p_batch_id: B }) : { ok: false, status: 0 };
  return { code, B, h0, activities, refusedBefore, activated: act.ok, processCode,
           pdid: P.process_definition_id, prebatchCheckpointId: cps[0]?.id };
}
