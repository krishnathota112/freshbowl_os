/* Shared, explicit hours/minutes entry; null means not planned, zero is valid. */
(function () {
  function read(hours, minutes) {
    if (hours === '' && minutes === '') return null;
    var h = hours === '' ? 0 : Number(hours), m = minutes === '' ? 0 : Number(minutes);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59 || h * 60 + m > 525600) return NaN;
    return h * 60 + m;
  }
  function label(n) { return n == null ? '' : Math.floor(n / 60) + 'h ' + (n % 60) + 'm'; }
  window.TK.duration = { read: read, label: label };
})();
