#!/usr/bin/env node
// Signs in as a real user and reads through PostgREST exactly as the browser does.
// This is the path the UI takes, so if this works the screens have data.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local') });
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

async function signIn(email) {
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'mushroom2026' }),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(b.error_description ?? b.msg ?? `sign-in ${r.status}`);
  return b.access_token;
}

async function get(token, path) {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });
  const body = await r.json();
  return { status: r.status, body };
}

const token = await signIn('admin@freshbowl.demo');
console.log('\nAUTHENTICATED READS (admin session)\n');

const reads = [
  ['process_definition', 'process_definition?select=code,status,total_days'],
  ['process_activity (PROCESS-2026B)', 'process_activity?select=code,label_template,stream,rel_day,scope&order=seq&limit=6'],
  ['gate_rule SAME_SCOPE_INSTANCE', 'gate_rule?select=kind,predecessor_binding,blocked_reason_template&predecessor_binding=eq.SAME_SCOPE_INSTANCE&limit=3'],
  ['material_role_eligibility', 'material_role_eligibility?select=role,is_default_lead&is_default_lead=is.true'],
  ['conflict_register', 'conflict_register?select=conflict_id&limit=5'],
  ['lab_spec', 'lab_spec?select=checkpoint_code,parameter_code&limit=4'],
  ['v_sop_limit_mapping', 'v_sop_limit_mapping?select=sop_activity,mapping_confidence&limit=4'],
  ['machine (turners)', 'machine?select=code,kind&kind=eq.TURNER'],
];

for (const [label, path] of reads) {
  const { status, body } = await get(token, path);
  const n = Array.isArray(body) ? body.length : 0;
  const ok = status === 200 && n > 0;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(34)} ${status} · ${n} rows`);
  if (!ok && !Array.isArray(body)) console.log(`        ${JSON.stringify(body)}`);
}

// The write boundary: an authenticated non-admin must not be able to write reference data.
const opToken = await signIn('operator@freshbowl.demo');
const w = await fetch(`${url}/rest/v1/material`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${opToken}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  },
  body: JSON.stringify({ code: 'PROBE_MATERIAL', name: 'probe', category: 'additive' }),
});
console.log(
  `\n  ${w.status >= 400 ? 'ok  ' : 'FAIL'}  operator write to material         ${w.status} ` +
    `(${w.status >= 400 ? 'refused, as it should be' : 'ALLOWED — policy is wrong'})`
);

// audit_event must be immutable for everyone.
const patch = await fetch(`${url}/rest/v1/audit_event?id=gt.0`, {
  method: 'PATCH',
  headers: {
    apikey: key,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ reason: 'tamper' }),
});
console.log(
  `  ${patch.status >= 400 ? 'ok  ' : 'FAIL'}  admin PATCH audit_event            ${patch.status} ` +
    `(${patch.status >= 400 ? 'refused' : 'ALLOWED — audit is not immutable'})`
);
console.log('');
