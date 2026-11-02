(async function () {
  var status = document.getElementById('status');
  try {
    var response = await fetch('latest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Download information is not available yet. Please try later.');
    var release = await response.json(), url = new URL(release.apk, location.href);
    if (release.packageId !== 'in.freshbowl.tasks.gk' || url.origin !== location.origin || !url.pathname.endsWith('.apk')) throw new Error('Download information is invalid.');
    status.textContent = 'Version ' + release.version + ' · ' + (release.bytes / 1048576).toFixed(1) + ' MB';
    var button = document.getElementById('download');button.href = url.href; button.textContent = 'Download v' + release.version + ' for Android';button.hidden = false;
    document.getElementById('notes').textContent = release.notes;
    document.getElementById('hash').textContent = release.sha256;
  } catch (error) { status.textContent = error.message; }
})();
