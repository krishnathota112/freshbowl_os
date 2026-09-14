/**
 * Mushroom OS – authentication.
 *
 * Hybrid by design. Sign-in tries real Supabase GoTrue first; if the project is
 * unreachable (no network in the demo room, DNS blocked, or the auth.users NULL
 * bug in supabase/fix_auth_nulls.sql still unfixed) it falls back to a local
 * check of the same four demo accounts.
 *
 * The invariant that must hold on BOTH paths: a wrong password is rejected.
 * That is what makes this auth rather than a navigation button.
 *
 * The offline path is a demo affordance, not security — the account table ships
 * inside the app and anyone can read it. Digests are sha256(email + ':' + pw),
 * unsalted, so they only avoid shipping plaintext passwords; they do not make
 * the fallback safe to point at real data. Real enforcement is Postgres RLS,
 * which only applies on the Supabase path. See REGRESSION.md known gaps.
 */

const SUPABASE_URL  = 'https://omsxtifyzlldaxkeqerx.supabase.co';
// Publishable key: client-safe by design, respects RLS. NEVER put sb_secret_* here.
const SUPABASE_ANON = 'sb_publishable_ISIjiMhm2O5GRaKvvB14hg_vjMbUNf3';

const SESSION_KEY = 'mushroomos.session';
const NETWORK_TIMEOUT_MS = 3500;   // demo-room wifi must not hang the button

// Offline fallback accounts — mirrors supabase/seed_test_users.sql.
const LOCAL_ACCOUNTS = [
  { email: 'op1@freshbowl.dev',   name: 'Ramesh',   role: 'operator', h: '0b54786a0ac2b045855123785db7a8887d0e0fa6459ee62e5115603c13dedd6b' },
  { email: 'op2@freshbowl.dev',   name: 'Suresh',   role: 'operator', h: '0ccba231a4d3ee26af1b1092c23dacc9377bd2979d3b50c3164c825b860ad6f7' },
  { email: 'admin@freshbowl.dev', name: 'Mike',     role: 'admin',    h: '3a066f0a696a591814948f03f3f84ae5fcb6190ed46378fa7dc6d035dedb933e' },
  { email: 'chair@freshbowl.dev', name: 'Chairman', role: 'chairman', h: '948722c514339d4ae39ecef4702b09057765f50fb02b5c9210bad6e59d07f476' },
];

const ROLE_LABEL = {
  operator: 'Composting Operator',
  admin:    'Administrator',
  chairman: 'Management Viewer',
};

// ─── Session ────────────────────────────────────────────────────────────────
function saveSession(s) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {} }

function currentUser() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return s && s.email ? s : null;
  } catch (e) { return null; }
}

function signOut() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  window.location.href = 'login.html';
}

/** Redirect to the login screen if nobody is signed in. */
function requireAuth() {
  if (!currentUser()) { window.location.replace('login.html'); return false; }
  return true;
}

/**
 * Keep a page to the roles allowed to see it. Call after requireAuth().
 *
 * Scope note, so this is not mistaken for more than it is: this is a client
 * -side guard. It reads the role from the session, not from the DOM, so it is
 * not a "UI-only" check — but the session lives in localStorage and a
 * determined user can edit it. It is correct navigation behaviour and defence
 * in depth, NOT a security boundary. The boundary is Postgres RLS, which
 * enforces per-role access server-side on the data itself. That only bites
 * once screens actually read from the database, which they do not yet.
 */
function requireRole(...allowed) {
  const u = currentUser();
  if (!u) { window.location.replace('login.html'); return false; }
  if (!allowed.includes(u.role)) {
    window.location.replace('home.html?denied=' + encodeURIComponent(allowed.join('/')));
    return false;
  }
  return true;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fetchWithTimeout(url, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NETWORK_TIMEOUT_MS);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

// ─── Supabase path ──────────────────────────────────────────────────────────
/**
 * @returns {'rejected'|'unavailable'|object} a session on success, 'rejected'
 *          when Supabase positively says the credentials are wrong, and
 *          'unavailable' for anything else (offline, 5xx, timeout).
 */
async function trySupabase(email, password) {
  const headers = { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' };
  let res, body;

  try {
    res = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers, body: JSON.stringify({ email, password }),
    });
    body = await res.json();
  } catch (e) {
    return 'unavailable';                       // offline / DNS / timeout
  }

  // 400 is GoTrue saying the credentials are wrong — authoritative, do not fall back.
  if (res.status === 400) return 'rejected';
  // 500 is the auth.users NULL-column bug; anything else non-OK is not a verdict.
  if (!res.ok || !body.access_token) return 'unavailable';

  // Signed in. Read the role from profiles — RLS applies to this request.
  let name = (body.user && body.user.user_metadata && body.user.user_metadata.display_name) || email.split('@')[0];
  let role = 'operator';
  try {
    const p = await fetchWithTimeout(
      `${SUPABASE_URL}/rest/v1/profiles?select=display_name,role&id=eq.${body.user.id}`,
      { headers: { ...headers, Authorization: `Bearer ${body.access_token}` } });
    const rows = await p.json();
    if (Array.isArray(rows) && rows[0]) {
      role = rows[0].role || role;
      name = rows[0].display_name || name;
    }
  } catch (e) { /* signed in but profile unreadable — keep the metadata defaults */ }

  return { email, name, role, mode: 'supabase', token: body.access_token, at: Date.now() };
}

// ─── Offline path ───────────────────────────────────────────────────────────
async function tryLocal(email, password) {
  const acct = LOCAL_ACCOUNTS.find(a => a.email === email.trim().toLowerCase());
  if (!acct) return null;
  const h = await sha256Hex(`${acct.email}:${password}`);
  if (h !== acct.h) return null;
  return { email: acct.email, name: acct.name, role: acct.role, mode: 'offline', at: Date.now() };
}

// ─── Public entry point ─────────────────────────────────────────────────────
async function signIn(email, password) {
  if (!email || !password) return { ok: false, error: 'Enter your email and password.' };

  const remote = await trySupabase(email.trim().toLowerCase(), password);

  if (remote !== 'rejected' && remote !== 'unavailable') {
    saveSession(remote);
    return { ok: true, session: remote };
  }
  if (remote === 'rejected') {
    return { ok: false, error: 'Incorrect email or password.' };
  }

  // Supabase gave no verdict — check locally so the demo survives a dead network.
  const local = await tryLocal(email, password);
  if (local) { saveSession(local); return { ok: true, session: local }; }
  return { ok: false, error: 'Incorrect email or password.' };
}

// ─── Identity rendering ─────────────────────────────────────────────────────
// Any element with data-user="name|email|role|role-label" gets filled in.
function renderIdentity() {
  const u = currentUser();
  if (!u) return;
  const values = {
    name: u.name,
    email: u.email,
    role: u.role,
    'role-label': ROLE_LABEL[u.role] || u.role,
    mode: u.mode === 'supabase' ? 'Signed in via Supabase' : 'Signed in offline',
  };
  document.querySelectorAll('[data-user]').forEach(el => {
    const v = values[el.getAttribute('data-user')];
    if (v != null) el.textContent = v;
  });
  // Screens marked admin-only disappear for non-admins. Cosmetic only — the
  // guard in requireRole is what actually keeps them off the page.
  if (u.role !== 'admin') document.querySelectorAll('[data-admin-only]').forEach(el => el.remove());

  // Bounced off a page their role cannot see — say so rather than silently landing.
  const denied = new URLSearchParams(location.search).get('denied');
  const banner = document.getElementById('deniedBanner');
  if (denied && banner) {
    const text = document.getElementById('deniedBannerText');
    if (text) text.textContent =
      `That screen is for ${denied} accounts. You are signed in as ${ROLE_LABEL[u.role] || u.role}.`;
    banner.classList.remove('hidden');
    banner.classList.add('flex');
  }
}

document.addEventListener('DOMContentLoaded', renderIdentity);

window.Auth = { signIn, signOut, currentUser, requireAuth, requireRole, renderIdentity, ROLE_LABEL };
