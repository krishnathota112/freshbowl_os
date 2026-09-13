/**
 * A PostgREST / Storage / Auth client for the proofs that must go over HTTP with a real JWT.
 *
 * WHY THIS EXISTS. Most database proofs connect as `postgres` through `pg`, which is the right tool
 * for asserting schema and gate logic. It is the WRONG tool for asserting authorisation: `postgres`
 * has `BYPASSRLS` and `auth.uid()` is null, so every RLS policy and every JWT-derived check is
 * invisible to it. A4's gate says so explicitly — "asserted by a direct PostgREST call with a valid
 * JWT, not by clicking".
 *
 * So this signs in as the real demo accounts and talks to the real endpoints, the same ones the
 * browser uses.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { assertLocalTarget } from './target';

const APP_ROOT = fileURLToPath(new URL('../', import.meta.url));

/**
 * ⚠ TLS verification is relaxed FOR THIS TEST PROCESS ONLY.
 *
 * This machine's network intercepts TLS with a root CA that Node does not trust, so `fetch` fails
 * with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` before any assertion runs. `scripts/db.mjs` already
 * accommodates the same interception for Postgres — it has passed `ssl: { rejectUnauthorized: false }`
 * since before this step — so this is the existing posture applied to the HTTP half, not a new one.
 *
 * It is set HERE, in `tests/`, and nowhere else. `tests/uiFoundations.test.ts` asserts that neither
 * this flag nor any TLS relaxation appears anywhere in `src/`, because in the shipped application it
 * would be a real vulnerability rather than a local inconvenience.
 *
 * The proper fix on a managed machine is `NODE_EXTRA_CA_CERTS=<corporate-root.pem>`, which leaves
 * verification on. If that variable is already set, this leaves verification alone.
 */
if (!process.env.NODE_EXTRA_CA_CERTS) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

function envValue(key: string): string | null {
  if (process.env[key]) return process.env[key] as string;
  let raw: string;
  try {
    raw = readFileSync(join(APP_ROOT, '.env.local'), 'utf8');
  } catch {
    return null;
  }
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0 || t.slice(0, eq).trim() !== key) continue;
    return t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

export const SUPABASE_URL = assertLocalTarget(envValue('VITE_SUPABASE_URL'), 'VITE_SUPABASE_URL');
export const ANON_KEY = envValue('VITE_SUPABASE_ANON_KEY');

export const HTTP_READY = Boolean(SUPABASE_URL && ANON_KEY);
export const NO_HTTP_REASON =
  'VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set, so the JWT-level proofs cannot run';

/** The demo accounts, seeded by s07. The password is the same for all of them. */
export const DEMO_PASSWORD = 'mushroom2026';
export const ACCOUNTS = {
  operator: 'operator@freshbowl.demo',
  lab: 'lab@freshbowl.demo',
  supervisor: 'supervisor@freshbowl.demo',
  admin: 'admin@freshbowl.demo',
  gm: 'gm@freshbowl.demo',
  manager: 'manager@freshbowl.demo',
} as const;

export type Session = { accessToken: string; userId: string; email: string };

export async function signIn(email: string, password = DEMO_PASSWORD): Promise<Session> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = (await r.json()) as { access_token?: string; user?: { id: string }; error_description?: string };
  if (!r.ok || !body.access_token) {
    throw new Error(`sign-in failed for ${email}: ${r.status} ${JSON.stringify(body)}`);
  }
  return { accessToken: body.access_token, userId: body.user!.id, email };
}

/** Ends the session server-side, so a later call with the same token is genuinely rejected. */
export async function signOut(s: Session): Promise<void> {
  await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
    method: 'POST',
    headers: { apikey: ANON_KEY!, Authorization: `Bearer ${s.accessToken}` },
  });
}

const headers = (s: Session, extra: Record<string, string> = {}) => ({
  apikey: ANON_KEY!,
  Authorization: `Bearer ${s.accessToken}`,
  ...extra,
});

export type Reply<T = unknown> = { status: number; ok: boolean; body: T };

async function parse<T>(r: Response): Promise<Reply<T>> {
  const text = await r.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep the raw text — an error page is worth seeing verbatim */
  }
  return { status: r.status, ok: r.ok, body: body as T };
}

export async function rest<T = unknown>(s: Session, path: string): Promise<Reply<T>> {
  return parse<T>(await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers(s) }));
}

export async function rpc<T = unknown>(
  s: Session,
  fn: string,
  args: Record<string, unknown>
): Promise<Reply<T>> {
  return parse<T>(
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: headers(s, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(args),
    })
  );
}

/** A real upload of real bytes into the private bucket. */
export async function upload(
  s: Session,
  bucket: string,
  path: string,
  bytes: Uint8Array,
  contentType = 'image/jpeg'
): Promise<Reply> {
  return parse(
    await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: headers(s, { 'Content-Type': contentType, 'x-upsert': 'false' }),
      body: bytes as unknown as BodyInit,
    })
  );
}

/**
 * Remove one object through the Storage API.
 *
 * It has to be the API and not SQL: Supabase installs `storage.protect_delete()`, a trigger that
 * refuses a direct `delete from storage.objects` with "Use the Storage API instead" — because
 * removing the metadata row would leave the actual bytes orphaned in the bucket. The
 * `evidence_delete_unbound` policy is what permits this, and only for an object no
 * `evidence_media` row references.
 */
export async function removeObject(s: Session, bucket: string, path: string): Promise<Reply> {
  return parse(
    await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      method: 'DELETE',
      headers: headers(s),
    })
  );
}

/** A signed URL for a private object. The only way an image reaches a screen. */
export async function signUrl(
  s: Session,
  bucket: string,
  path: string,
  expiresIn = 60
): Promise<Reply<{ signedURL?: string }>> {
  return parse(
    await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`, {
      method: 'POST',
      headers: headers(s, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn }),
    })
  );
}

export async function fetchSigned(signedPath: string): Promise<Reply> {
  // The signed URL comes back relative to /storage/v1.
  const url = signedPath.startsWith('http')
    ? signedPath
    : `${SUPABASE_URL}/storage/v1${signedPath.startsWith('/') ? '' : '/'}${signedPath}`;
  const r = await fetch(url);
  return { status: r.status, ok: r.ok, body: await r.arrayBuffer() };
}

/**
 * The smallest thing that is genuinely a JPEG: SOI, a minimal APP0 JFIF segment, and EOI.
 * Real bytes, so the bucket's mime and size limits are exercised rather than mocked.
 */
export function tinyJpeg(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
    0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xd9, // EOI
  ]);
}
