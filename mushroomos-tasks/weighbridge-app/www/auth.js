/**
 * Mushroom OS — who is signed in.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ONE WAY IN, AND IT IS THE REAL ONE. Sign-in is Supabase GoTrue against the factory's own project.
 * The bundled account table, the sha256 digests and the offline fallback that used to live here are
 * GONE: they shipped five logins and a password inside the APK, and they let somebody hold a session
 * that no database had ever agreed to. There is no offline sign-in. Without a network there is no
 * session, and without a session there is no data — which is the truth, and better than a screen
 * full of numbers nobody can save.
 *
 * ROLE COMES FROM THE SIGNED TOKEN. `app_metadata.app_role` inside the access token is what Postgres
 * reads when it decides what you may see or do (RLS calls `current_app_role()`). This file decodes
 * the same claim for ROUTING ONLY. If the access-token hook is not enabled the claim is absent, and
 * it falls back to reading `profiles.role` — again for routing only, and it says so in `roleSource`.
 * Nothing here is a permission: every refusal comes from the server.
 *
 * THREE LOGINS: Supervisor, Lab, General Manager. Admin and manager work on the web application, and
 * an account this app does not serve is told so rather than dropped onto somebody else's home.
 */
(function () {
  var cfg = window.MOS && window.MOS.config;
  if (!cfg) throw new Error('config.js must load before auth.js');

  var SESSION_KEY = 'moswb.session';
  var TIMEOUT_MS = 12000;
  // A refresh is the one call that decides whether the person stays signed in, and it is made on
  // whatever signal the shed has. It gets a longer budget than an ordinary read.
  var REFRESH_TIMEOUT_MS = 25000;

  /** The roles this app serves, and where each one lands. */
  var ROLE_HOME = {
    weighbridge: 'app.html',
    admin: 'app.html',
  };

  var ROLE_LABEL = {
    supervisor: 'Supervisor',
    lab_tech: 'Lab Technician',
    gm: 'General Manager',
    admin: 'Admin',
    manager: 'Manager',
    weighbridge: 'Weighbridge',
    operator: 'Field Operator',
  };

  // The engine treats an operator as a supervisor on the floor; the app shows one word for both.
  function normalise(role) {
    return role === 'operator' ? 'supervisor' : role;
  }

  function servesRole(role) {
    return Object.prototype.hasOwnProperty.call(ROLE_HOME, normalise(role));
  }

  function landingFor(role) {
    return ROLE_HOME[normalise(role)] || 'role_not_served.html';
  }

  // ── Session storage ───────────────────────────────────────────────────────
  function save(session) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (e) {}
  }

  function currentUser() {
    try {
      var s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return s && s.access_token ? s : null;
    } catch (e) {
      return null;
    }
  }

  function clear() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  async function signOut() {
    // A shared phone must not keep ringing for the previous person's tasks.
    try { if (window.TK && window.TK.alarms) await window.TK.alarms.cancelAll(); } catch (e) {}
    var s = currentUser();
    if (s) {
      try {
        await fetch(cfg.url + '/auth/v1/logout?scope=local', {
          method: 'POST',
          headers: { apikey: cfg.anon, Authorization: 'Bearer ' + s.access_token },
        });
      } catch (e) {
        /* the local session is cleared either way */
      }
    }
    clear();
    window.location.replace('login.html');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function withTimeout(url, opts, budget) {
    var ctrl = new AbortController();
    var t = setTimeout(function () {
      ctrl.abort();
    }, budget || TIMEOUT_MS);
    return fetch(url, Object.assign({}, opts, { signal: ctrl.signal })).finally(function () {
      clearTimeout(t);
    });
  }

  function decodeClaims(token) {
    try {
      var part = token.split('.')[1];
      return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    } catch (e) {
      return null;
    }
  }

  /** The authoritative read for routing: the role claim inside the access token. */
  function roleFromToken(token) {
    var c = decodeClaims(token);
    var meta = c && c.app_metadata;
    return meta && meta.app_role ? normalise(meta.app_role) : null;
  }

  function expiresAt(session) {
    var c = decodeClaims(session.access_token);
    return c && c.exp ? c.exp * 1000 : 0;
  }

  // ── Sign in ───────────────────────────────────────────────────────────────
  /**
   * @returns {{ok: true, session: object} | {ok: false, error: string}}
   * A wrong password is refused by GoTrue, and that refusal is shown as it is.
   */
  async function signIn(email, password) {
    if (!email || !password) return { ok: false, error: 'Enter your email and password.' };

    var res, body;
    try {
      res = await withTimeout(cfg.url + '/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { apikey: cfg.anon, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: String(email).trim().toLowerCase(), password: password }),
      });
      body = await res.json();
    } catch (e) {
      return {
        ok: false,
        error: 'No connection to the factory server. Sign-in needs a network — there is no offline sign-in.',
      };
    }

    if (!res.ok || !body.access_token) {
      return { ok: false, error: body.error_description || body.msg || 'Incorrect email or password.' };
    }

    var session = {
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      user_id: body.user.id,
      email: body.user.email,
      name: (body.user.user_metadata && body.user.user_metadata.display_name) || body.user.email,
      role: roleFromToken(body.access_token),
      role_source: roleFromToken(body.access_token) ? 'claim' : null,
      at: Date.now(),
    };

    // No claim yet (the access-token hook is off): read profiles for ROUTING, and say where it came from.
    if (!session.role) {
      try {
        var p = await withTimeout(
          cfg.url + '/rest/v1/profiles?select=display_name,role&id=eq.' + body.user.id,
          { headers: { apikey: cfg.anon, Authorization: 'Bearer ' + body.access_token } }
        );
        var rows = await p.json();
        if (Array.isArray(rows) && rows[0]) {
          session.role = normalise(rows[0].role);
          session.role_source = 'profile';
          if (rows[0].display_name) session.name = rows[0].display_name;
        }
      } catch (e) {
        /* signed in, but the role is unknown — handled below */
      }
    } else {
      try {
        var q = await withTimeout(
          cfg.url + '/rest/v1/profiles?select=display_name&id=eq.' + body.user.id,
          { headers: { apikey: cfg.anon, Authorization: 'Bearer ' + body.access_token } }
        );
        var r2 = await q.json();
        if (Array.isArray(r2) && r2[0] && r2[0].display_name) session.name = r2[0].display_name;
      } catch (e) {}
    }

    if (!session.role) {
      return {
        ok: false,
        error: 'Signed in, but this account has no role yet. An administrator sets that up.',
      };
    }

    save(session);
    return { ok: true, session: session };
  }

  /**
   * WHY A FAILED REFRESH IS NOT THE SAME AS AN ENDED SESSION.
   *
   * There are two ways this call comes back empty and they mean opposite things. The server can
   * REFUSE the refresh token — then the session really is over and the person must sign in. Or the
   * phone simply could not reach the server: a shed with one bar, a tunnel, a moment of nothing.
   * Reporting the second as the first is how someone gets thrown out of the app while holding a
   * perfectly good session. So the reason is recorded, and the caller is told which happened.
   */
  var lastError = null; // 'network' | 'rejected' | null

  async function refreshOnce() {
    var s = currentUser();
    if (!s || !s.refresh_token) {
      lastError = 'rejected';
      return null;
    }
    var res, body;
    try {
      res = await withTimeout(
        cfg.url + '/auth/v1/token?grant_type=refresh_token',
        {
          method: 'POST',
          headers: { apikey: cfg.anon, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: s.refresh_token }),
        },
        REFRESH_TIMEOUT_MS
      );
      body = await res.json();
    } catch (e) {
      lastError = 'network'; // no answer — say nothing about the session
      return null;
    }
    if (!res.ok || !body.access_token) {
      lastError = 'rejected'; // the server looked at this token and said no
      return null;
    }
    // Re-read rather than reuse the copy taken above: another screen may have saved in the meantime.
    var cur = currentUser() || s;
    cur.access_token = body.access_token;
    cur.refresh_token = body.refresh_token || cur.refresh_token;
    var claimed = roleFromToken(body.access_token);
    if (claimed) {
      cur.role = claimed;
      cur.role_source = 'claim';
    }
    save(cur);
    lastError = null;
    return cur;
  }

  /**
   * ONE REFRESH AT A TIME, HOWEVER MANY SCREENS ASK FOR ONE.
   *
   * A task form opens six reads at once. Left alone, each would trade the SAME refresh token for a
   * new one; the server rotates the token on the first trade, the other five are holding a token it
   * has just retired, and the last write to storage wins — which may be a token the server no longer
   * honours. The next read is then told the session has ended, and it has not. Every caller waits on
   * the same promise instead, so exactly one trade is ever made.
   */
  var inflight = null;

  function refresh() {
    if (inflight) return inflight;
    inflight = refreshOnce().then(
      function (r) {
        inflight = null;
        return r;
      },
      function (e) {
        inflight = null;
        lastError = 'network';
        return null;
      }
    );
    return inflight;
  }

  /** A session whose token is still good, refreshing it first when it is within two minutes of expiry. */
  async function freshSession() {
    var s = currentUser();
    if (!s) {
      lastError = 'rejected';
      return null;
    }
    var exp = expiresAt(s);
    if (!exp || Date.now() < exp - 120000) {
      lastError = null;
      return s;
    }
    var r = await refresh();
    if (r) return r;
    // The refresh did not go through. If the token in hand has NOT actually expired yet, carry on
    // with it: a slow minute on the network is not a reason to throw somebody out mid-shift.
    if (lastError === 'network' && Date.now() < exp - 5000) return currentUser();
    return null;
  }

  // ── Page guards ───────────────────────────────────────────────────────────
  /** Send anyone without a session to sign-in, before the page paints. */
  function requireAuth() {
    if (!currentUser()) {
      window.location.replace('login.html');
      return false;
    }
    return true;
  }

  /**
   * Keep a page to the roles it is for. Client-side navigation only, and defence in depth — the
   * boundary is RLS and the server functions, which refuse the same person the same things.
   */
  function requireRole() {
    var allowed = Array.prototype.slice.call(arguments);
    var u = currentUser();
    if (!u) {
      window.location.replace('login.html');
      return false;
    }
    if (allowed.indexOf(u.role) === -1) {
      window.location.replace(landingFor(u.role) + '?denied=' + encodeURIComponent(allowed.join('/')));
      return false;
    }
    return true;
  }

  // ── Identity on the page ──────────────────────────────────────────────────
  /** Any element with data-user="name|first-name|email|role|role-label" is filled in. */
  function renderIdentity() {
    var u = currentUser();
    if (!u) return;
    var values = {
      name: u.name,
      'first-name': String(u.name || '').trim().split(' ')[0],
      email: u.email,
      role: u.role,
      'role-label': ROLE_LABEL[u.role] || u.role,
      initial: String(u.name || u.email || '?').trim().charAt(0).toUpperCase(),
    };
    document.querySelectorAll('[data-user]').forEach(function (el) {
      var v = values[el.getAttribute('data-user')];
      if (v != null) el.textContent = v;
    });

    var denied = new URLSearchParams(location.search).get('denied');
    var banner = document.getElementById('deniedBanner');
    if (denied && banner) {
      var text = document.getElementById('deniedBannerText');
      if (text) {
        text.textContent =
          'That screen is for ' + denied + ' accounts. You are signed in as ' + (ROLE_LABEL[u.role] || u.role) + '.';
      }
      banner.classList.remove('hidden');
      banner.classList.add('flex');
    }
  }

  document.addEventListener('DOMContentLoaded', renderIdentity);

  window.Auth = {
    signIn: signIn,
    signOut: signOut,
    currentUser: currentUser,
    freshSession: freshSession,
    refresh: refresh,
    clear: clear,
    lastError: function () { return lastError; },
    requireAuth: requireAuth,
    requireRole: requireRole,
    renderIdentity: renderIdentity,
    landingFor: landingFor,
    servesRole: servesRole,
    ROLE_LABEL: ROLE_LABEL,
    ROLE_HOME: ROLE_HOME,
  };
})();
