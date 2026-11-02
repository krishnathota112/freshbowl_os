/* User-initiated APK downloads. No silent install and no session tokens sent to the download site. */
(function () {
  var build = window.TK.build, endpoint = window.MOS.config.updateManifest;
  function validate(data, base) {
    var origin = new URL(base);
    if (origin.protocol !== 'https:') throw new Error('Update address must use HTTPS.');
    if (!data || data.packageId !== build.packageId || !Number.isSafeInteger(data.versionCode) || data.versionCode < 1 || typeof data.version !== 'string') throw new Error('The update information is invalid.');
    var apk = new URL(data.apk, base);
    if (apk.origin !== origin.origin || apk.username || apk.password || !apk.pathname.endsWith('.apk')) throw new Error('The APK must come from the trusted download website.');
    if (!/^[a-f0-9]{64}$/i.test(data.sha256 || '') || !Number.isSafeInteger(data.bytes) || data.bytes < 1) throw new Error('The update file details are missing.');
    return Object.assign({}, data, { apk: apk.href, newer: data.versionCode > build.versionCode });
  }
  async function check() {
    if (!endpoint) throw new Error('The download address has not been configured yet.');
    var abort = new AbortController(), timer = setTimeout(function () { abort.abort(); }, 15000);
    try {
      var res = await fetch(endpoint, { cache: 'no-store', credentials: 'omit', signal: abort.signal });
      if (!res.ok) throw new Error('Update check failed (' + res.status + '). Try again later.');
      return validate(await res.json(), endpoint);
    } finally { clearTimeout(timer); }
  }
  var button = document.getElementById('appUpdate');
  if (button) button.onclick = async function () {
    if (document.getElementById('updateDialog')) return;
    var dialog = document.createElement('dialog'); dialog.id = 'updateDialog'; dialog.className = 'update-dialog';
    dialog.setAttribute('aria-labelledby', 'updateTitle');
    dialog.innerHTML = '<h2 id="updateTitle">App updates</h2><p data-installed></p><p data-status role="status">Checking for updates…</p><p data-notes class="note" hidden></p><p data-help class="muted small" hidden></p><div class="row"><a data-download class="btn pri" hidden>Download APK</a><button class="btn" data-close>Close</button></div>';
    var native = window.Capacitor && window.Capacitor.isNativePlatform();
    dialog.querySelector('[data-installed]').textContent = native ? 'Installed: ' + build.version : 'Website build: ' + build.version + ' · Android download';
    var status = dialog.querySelector('[data-status]'), close = dialog.querySelector('[data-close]');
    close.onclick = function () { dialog.close(); };
    dialog.onclose = function () { dialog.remove(); button.focus(); };
    document.body.appendChild(dialog); dialog.showModal();
    try {
      var release = await check(); if (!dialog.isConnected) return;
      status.textContent = native && !release.newer ? 'You have the latest published app.' : 'Version ' + release.version + ' is available · ' + (release.bytes / 1048576).toFixed(1) + ' MB';
      if (native && !release.newer) return;
      var notes = dialog.querySelector('[data-notes]'); notes.textContent = release.notes || ''; notes.hidden = !release.notes;
      var link = dialog.querySelector('[data-download]'); link.href = release.apk; link.hidden = false;
      // Capacitor opens external HTTPS navigation in Android's browser. The browser owns download/install permission.
      if (!native) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      var help = dialog.querySelector('[data-help]'); help.hidden = false;
      help.textContent = 'Save your work first. Download the APK, open it from Downloads, then confirm Update in Android. If asked, allow your browser to install this app. Do not uninstall the existing app.';
    } catch (e) {
      if (dialog.isConnected) status.textContent = e.name === 'AbortError' ? 'No response. Check your signal and try again.' : e.message;
    }
  };
  window.TK.updates = { validate: validate, check: check };
})();
