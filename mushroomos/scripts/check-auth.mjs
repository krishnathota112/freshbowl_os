#!/usr/bin/env node
// Signs in as each demo account and reports whether the access token carries
// app_metadata.app_role. On a hosted project the custom access token hook must be enabled
// in the dashboard (Authentication > Hooks) — config.toml only applies to a local stack.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local') });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
const PASSWORD = 'mushroom2026';

const ACCOUNTS = [
  'gm@freshbowl.demo',
  'manager@freshbowl.demo',
  'admin@freshbowl.demo',
  'supervisor@freshbowl.demo',
  'operator@freshbowl.demo',
  'lab@freshbowl.demo',
];

function decode(token) {
  const p = token.split('.')[1];
  return JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
}

let anyClaim = false;
console.log('\nSIGN-IN CHECK\n');
console.log('  account                      status  role claim');
console.log('  ' + '─'.repeat(60));

for (const email of ACCOUNTS) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await res.json();
  if (!res.ok) {
    console.log(`  ${email.padEnd(28)} FAIL    ${body.error_description ?? body.msg ?? res.status}`);
    continue;
  }
  const payload = decode(body.access_token);
  const claim = payload.app_metadata?.app_role;
  if (claim) anyClaim = true;
  console.log(`  ${email.padEnd(28)} ok      ${claim ?? '(absent)'}`);
}

console.log('');
if (!anyClaim) {
  console.log('The role claim is ABSENT from every token.');
  console.log('');
  console.log('Enable it in the Supabase dashboard:');
  console.log('  Authentication > Hooks > Customize Access Token (JWT) Claims');
  console.log('  Enable, and select the Postgres function public.custom_access_token_hook');
  console.log('');
  console.log('Reference-data reads still work without it, because the read policy is');
  console.log('"any authenticated user". Role-scoped writes and role routing need the claim.');
} else {
  console.log('Role claim present. Authorisation is reading from the signed token.');
}
