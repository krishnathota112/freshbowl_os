/* Reduce camera uploads before sending; no factory photo leaves this device for conversion. */
(function () {
  function fit(width, height, limit) {
    var scale = Math.min(1, limit / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  }
  async function prepare(file) {
    if (!file || !file.size) throw new Error('That photo is empty — take it again.');
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error('Use a JPEG, PNG or WebP photo.');
    if (file.size > 30 * 1024 * 1024) throw new Error('Photo is over 30 MB. Choose a smaller photo.');
    if (file.size <= 700 * 1024) return file;
    var source, url;
    try {
      if (typeof createImageBitmap === 'function') source = await createImageBitmap(file, { imageOrientation: 'from-image' });
      else {
        url = URL.createObjectURL(file);
        source = await new Promise(function (resolve, reject) {
          var img = new Image(); img.onload = function () { resolve(img); }; img.onerror = reject; img.src = url;
        });
      }
      var size = fit(source.width, source.height, 2000), canvas = document.createElement('canvas');
      canvas.width = size.width; canvas.height = size.height;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size.width, size.height);
      ctx.drawImage(source, 0, 0, size.width, size.height);
      var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', .85); });
      canvas.width = canvas.height = 1;
      if (!blob) throw new Error('Could not prepare the photo.');
      return blob.size < file.size ? blob : file;
    } catch (e) { throw new Error('Could not read this photo. Please take another JPEG photo.'); }
    finally { if (source && source.close) source.close(); if (url) URL.revokeObjectURL(url); }
  }
  window.TK = window.TK || {};
  window.TK.photos = { prepare: prepare, fit: fit };
})();
