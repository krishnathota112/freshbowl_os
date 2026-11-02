/**
 * MushroomOS Tasks — the only way this app talks to the database.
 * Reads the tk_* tables / tk_v_* views (RLS decides what a login sees); writes only through the tk_* functions (0144),
 * which stamp the time on the server and check the login's role. Photos go to the private `tasks` bucket.
 * Never touches the main MushroomOS process tables.
 */
(function () {
  var cfg = window.MOS && window.MOS.config;
  if (!cfg) throw new Error('config.js must load before tk-api.js');

  function Refusal(message, status) {
    var e = new Error(message);
    e.name = 'Refusal';
    e.status = status || null;
    return e;
  }

  function headersFor(s, extra) {
    return Object.assign({ apikey: cfg.anon, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' }, extra || {});
  }

  // Reads may be tried again. An interrupted write has an unknown outcome and is never retried here.
  async function request(url, options, timeout) {
    var abort = new AbortController(), clock = setTimeout(function () { abort.abort(); }, timeout || 25000);
    try { return await fetch(url, Object.assign({}, options, { signal: abort.signal })); }
    catch (e) {
      throw Refusal(options && options.method && options.method !== 'GET'
        ? 'Connection interrupted. The result is not confirmed — refresh and check before trying again.'
        : 'The server could not be reached. Check your signal and press Refresh.');
    } finally { clearTimeout(clock); }
  }
  var reads = new Map();

  function sessionGone() {
    if (window.Auth.lastError() === 'network') throw Refusal('No signal to the server. You are still signed in — try again.');
    window.Auth.clear();
    window.location.replace('login.html');
    throw Refusal('Your session has ended. Sign in again.');
  }

  async function withSession(send) {
    var s = await window.Auth.freshSession();
    if (!s) return sessionGone();
    var res = await send(s);
    if (res.status === 401) {
      var again = await window.Auth.refresh();
      if (!again) return sessionGone();
      res = await send(again);
    }
    return res;
  }

  async function handle(res) {
    var text = await res.text();
    var body = null;
    try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
    if (res.ok) return body;
    var msg = (body && (body.message || body.error_description || body.error || body.msg)) || res.statusText || 'The server refused.';
    throw Refusal(msg, res.status);
  }

  async function select(from, params) {
    var q = new URLSearchParams();
    q.set('select', (params && params.select) || '*');
    Object.keys(params || {}).forEach(function (k) { if (k !== 'select') q.set(k, params[k]); });
    var user = window.Auth.currentUser(), key = (user && user.id || '') + ':' + from + '?' + q.toString();
    if (reads.has(key)) return reads.get(key);
    var pending = (async function () {
      var res = await withSession(function (s) { return request(cfg.url + '/rest/v1/' + from + '?' + q.toString(), { headers: headersFor(s) }); });
      return (await handle(res)) || [];
    })();
    reads.set(key, pending);
    try { return await pending; } finally { if (reads.get(key) === pending) reads.delete(key); }
  }

  /** Offset advances by returned rows, so a server-side row cap cannot truncate the result. */
  async function selectAll(from, params) {
    var rows = [], offset = 0;
    for (var page = 0; page < 400; page++) {
      var q = new URLSearchParams();
      Object.keys(params || {}).forEach(function (key) { if (key !== 'limit' && key !== 'offset') q.set(key, params[key]); });
      if (!q.has('select')) q.set('select', '*');
      var order = q.get('order') || '';
      if (!/(^|,)id\./.test(order)) q.set('order', (order ? order + ',' : '') + 'id.asc');
      q.set('limit', '500'); q.set('offset', String(offset));
      var response = await withSession(function (session) {
        return request(cfg.url + '/rest/v1/' + from + '?' + q.toString(), {headers:headersFor(session,{Prefer:'count=exact'})});
      });
      var part = await handle(response);
      if (!Array.isArray(part)) throw Refusal('The server returned an unreadable task list. No partial schedule was shown.');
      rows.push.apply(rows, part); offset += part.length;
      var range = response.headers.get('content-range') || '', count = /\/(\d+)$/.exec(range);
      if (!part.length || count && offset >= Number(count[1])) return rows;
    }
    throw Refusal('This selection is too large to load completely. No partial schedule was shown.');
  }

  async function rpc(fn, args) {
    var body = JSON.stringify(args || {});
    var res = await withSession(function (s) {
      return request(cfg.url + '/rest/v1/rpc/' + fn, { method: 'POST', headers: headersFor(s), body: body });
    });
    return await handle(res);
  }

  /** Upload the bytes first, then register the photo. A failed registration removes the orphan file. */
  async function addPhoto(batchId, taskId, kind, file) {
    if (!file || file.size === 0) throw Refusal('That photo is empty — take it again.');
    if (window.TK.photos) file = await window.TK.photos.prepare(file);
    var ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    var path = batchId + '/' + taskId + '/' + kind + '-' + Date.now() + '.' + ext;
    var up = await withSession(function (s) {
      return request(cfg.url + '/storage/v1/object/tasks/' + encodeURI(path), {
        method: 'POST',
        headers: { apikey: cfg.anon, Authorization: 'Bearer ' + s.access_token, 'Content-Type': file.type || 'image/jpeg', 'x-upsert': 'false' },
        body: file,
      }, 120000);
    });
    if (!up.ok) {
      var why = '';
      try { why = (await up.json()).message || ''; } catch (e) {}
      throw Refusal('The photo did not upload — nothing was recorded. ' + why, up.status);
    }
    try {
      return await rpc('tk_add_photo', { p_task: taskId, p_kind: kind, p_path: path });
    } catch (e) {
      // Never delete evidence after a timeout/5xx: registration might have committed.
      if (e.status >= 400 && e.status < 500) await withSession(function (s) {
        return request(cfg.url + '/storage/v1/object/tasks/' + encodeURI(path), { method: 'DELETE', headers: headersFor(s) });
      }).catch(function () {});
      throw e;
    }
  }

  async function signedUrl(path) {
    var res = await withSession(function (s) {
      return request(cfg.url + '/storage/v1/object/sign/tasks/' + encodeURI(path), {
        method: 'POST', headers: headersFor(s), body: JSON.stringify({ expiresIn: 600 }),
      });
    });
    var body = await handle(res);
    if (!body || !body.signedURL) throw Refusal('The photo link could not be made.');
    return cfg.url + '/storage/v1' + body.signedURL;
  }

  window.TK = window.TK || {};
  window.TK.api = { select: select, selectAll: selectAll, rpc: rpc, addPhoto: addPhoto, signedUrl: signedUrl, Refusal: Refusal };
})();
