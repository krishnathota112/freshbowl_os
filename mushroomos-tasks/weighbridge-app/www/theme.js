/**
 * MushroomOS — presentation helpers for theme.css. Purely cosmetic: adds classes and decorative nodes, never reads or writes
 * application data, never intercepts events (all listeners are passive) and fails silently — if this file did not load,
 * the app would work exactly the same, only plainer.
 *
 *   · header gains a deeper shadow once the page scrolls
 *   · screen content rises in with a short stagger whenever a screen or pane is (re)rendered
 *   · "Loading…" and "No …" cards get a spinner / an illustrated empty state
 *   · batch cards and the batch header gain a progress bar parsed from their own "done/total" text
 *   · the title swaps with a short animation; Refresh spins; the active tab is scrolled into view
 */
(function () {
  'use strict';
  try {
    var view = document.getElementById('view');
    var header = document.querySelector('header.top');
    var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    function qsa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
    function text(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim(); }

    /* ── header shadow on scroll ───────────────────────────────────────────────────────────────────────────── */
    if (header) {
      var ticking = false;
      var onScroll = function () {
        if (ticking) return; ticking = true;
        window.requestAnimationFrame(function () { header.classList.toggle('scrolled', window.scrollY > 4); ticking = false; });
      };
      window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    }

    /* ── "Name · Role": app.css hides the line break on phones, which glued the two words together ─────────── */
    var who = document.getElementById('who');
    if (who && window.MutationObserver) {
      var split = function () {
        var br = who.querySelector('br');
        if (!br || who.querySelector('.who-sep')) return;
        var sep = document.createElement('span'); sep.className = 'who-sep'; sep.setAttribute('aria-hidden', 'true'); sep.textContent = '·';
        br.parentNode.insertBefore(sep, br.nextSibling);
      };
      split(); new MutationObserver(split).observe(who, { childList: true });
    }

    /* ── title swap + refresh spin ─────────────────────────────────────────────────────────────────────────── */
    var title = document.getElementById('title');
    if (title && !reduce && window.MutationObserver) {
      var last = text(title);
      new MutationObserver(function () {
        var now = text(title); if (now === last) return; last = now;
        title.classList.remove('tw-swap'); void title.offsetWidth; title.classList.add('tw-swap');
      }).observe(title, { childList: true, characterData: true, subtree: true });
    }
    var refresh = document.getElementById('refresh');
    if (refresh && !reduce) refresh.addEventListener('click', function () {
      refresh.classList.remove('tw-spin'); void refresh.offsetWidth; refresh.classList.add('tw-spin');
      setTimeout(function () { refresh.classList.remove('tw-spin'); }, 800);
    }, { passive: true });

    /* ── decorating rendered content ───────────────────────────────────────────────────────────────────────── */
    function progress(percent) {
      var bar = document.createElement('div'), fill = document.createElement('i');
      bar.className = 'tw-progress' + (percent >= 100 ? ' full' : ''); bar.setAttribute('aria-hidden', 'true');
      fill.style.setProperty('--p', Math.max(2, Math.min(100, percent)) + '%');
      bar.appendChild(fill); return bar;
    }
    /* A summary band above the batch list. Everything in it is read from the batch cards already on screen
       (their "done/total" and "n running / n waiting GM" labels); nothing is fetched or stored. */
    function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function addSummary(pane) {
      if (!pane || pane.querySelector('.tw-hero')) return;
      var cards = qsa(pane, '.card.tap[data-b]'); if (!cards.length) return;
      var done = 0, total = 0, running = 0, waiting = 0;
      cards.forEach(function (c) {
        var n = c.querySelector('.mono.big'), m = n && /(\d+)\s*\/\s*(\d+)/.exec(text(n));
        if (m) { done += Number(m[1]); total += Number(m[2]); }
        var r = /(\d+)\s+running/i.exec(text(c)), g = /(\d+)\s+waiting GM/i.exec(text(c));
        if (r) running += Number(r[1]); if (g) waiting += Number(g[1]);
      });
      var hour = new Date().getHours(), who = document.getElementById('who');
      var name = who && who.firstChild ? String(who.firstChild.textContent || '').split(/\s[—–-]\s/)[0].trim() : '';
      var pct = total ? Math.round(100 * done / total) : 0;
      // a hand-drawn hypha: a gently waving line with small side-branches (drawn once; the filled part grows to `pct`)
      var wave = 'M0 14', branches = '', i, x;
      for (i = 0; i < 20; i++) { x = (i + 1) * 50; wave += 'Q' + (x - 25) + ' ' + (i % 2 ? 6 : 22) + ' ' + x + ' 14'; }
      [[110, -1], [260, 1], [405, -1], [560, 1], [690, -1], [830, 1], [940, -1]].forEach(function (b) { branches += 'M' + b[0] + ' 14q7 ' + (b[1] * 9) + ' 17 ' + (b[1] * 11); });
      var hero = document.createElement('section'); hero.className = 'tw-hero';
      hero.innerHTML =
        '<div class="tw-hero-top"><div><p class="tw-hero-eyebrow"><span>きのこ</span>Today on the floor</p><h2>' +
        (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') + (name ? ', ' + esc(name) : '') + '</h2></div>' +
        '<dl class="tw-hero-stats"><div><dt>Batches</dt><dd data-n="' + cards.length + '">' + cards.length + '</dd></div><div><dt>Tasks done</dt><dd data-n="' + done + '">' + done + '</dd></div>' +
        '<div class="run"><dt>Running</dt><dd data-n="' + running + '">' + running + '</dd></div><div><dt>Awaiting GM</dt><dd data-n="' + waiting + '">' + waiting + '</dd></div></dl></div>' +
        '<div class="tw-thread" aria-hidden="true"><svg viewBox="0 0 1000 28" preserveAspectRatio="none"><path class="branch" d="' + branches + '"/><path class="track" d="' + wave + '"/>' +
        '<path class="fill" pathLength="1000" d="' + wave + '" style="stroke-dasharray:0 1000"/></svg><i class="tw-thread-tip"></i></div>' +
        '<p class="tw-hero-note">' + pct + '% of all tasks across ' + cards.length + (cards.length === 1 ? ' batch is' : ' batches are') + ' complete.</p>';
      pane.insertBefore(hero, pane.firstChild);
      var fill = hero.querySelector('.fill'), tip = hero.querySelector('.tw-thread-tip');
      function place() {
        var len = fill.getTotalLength(), pt = fill.getPointAtLength(len * pct / 100);
        fill.style.strokeDasharray = (pct * 10) + ' 1000'; tip.style.left = (pt.x / 10) + '%'; tip.style.opacity = pct > 0 ? '1' : '0';
      }
      if (reduce) { place(); return; }
      window.requestAnimationFrame(function () { window.requestAnimationFrame(place); });
      qsa(hero, '[data-n]').forEach(function (el) {                 // count up from zero
        var to = Number(el.getAttribute('data-n')), start = null; if (!to) return; el.textContent = '0';
        window.requestAnimationFrame(function tick(now) {
          if (start === null) start = now;
          var k = Math.min(1, (now - start) / 1100); el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
          if (k < 1) window.requestAnimationFrame(tick);
        });
      });
    }
    function decorate(root) {
      if (!root || root.nodeType !== 1 || /(^| )(tw-rip|tw-progress|tw-hero)( |$)/.test(root.className || '')) return;
      var cards = (root.matches && root.matches('.card') ? [root] : []).concat(qsa(root, '.card'));
      cards.forEach(function (card) {
        var t = text(card);
        if (card.classList.contains('tw-loading') && !/^Loading/i.test(t)) card.classList.remove('tw-loading');
        if (/^Loading/i.test(t) && t.length < 40 && !card.querySelector('input,button,select,textarea')) card.classList.add('tw-loading');
        else if (card.classList.contains('muted') && /^(No|Nothing|None)\b/.test(t) && t.length < 160 && !card.querySelector('input,select,textarea,form')) card.classList.add('tw-empty');
      });
      // batch cards on Home: "3/12" in .mono.big
      qsa(root, '.card.tap[data-b]').concat(root.matches && root.matches('.card.tap[data-b]') ? [root] : []).forEach(function (card) {
        if (card.querySelector('.tw-progress')) return;
        var n = card.querySelector('.mono.big'), m = n && /(\d+)\s*\/\s*(\d+)/.exec(text(n)), row = card.querySelector('.row');
        if (m && Number(m[2]) > 0 && row) row.parentNode.insertBefore(progress(Math.round(100 * m[1] / m[2])), row.nextSibling);
      });
      var homePane = document.getElementById('pane'); if (homePane && root.closest && root.closest('#pane')) addSummary(homePane);
      // batch screen header: "… · 3/12 done"
      qsa(root, '.card > .muted').forEach(function (line) {
        var m = /(\d+)\s*\/\s*(\d+) done$/.exec(text(line));
        if (!m || Number(m[2]) <= 0 || line.parentNode.querySelector('.tw-progress') || !line.parentNode.querySelector('.caps')) return;
        line.parentNode.insertBefore(progress(Math.round(100 * m[1] / m[2])), line.nextSibling);
      });
      // keep the chosen tab visible in a scrolled tab bar
      qsa(root, '.tabs').concat(root.matches && root.matches('.tabs') ? [root] : []).forEach(function (bar) {
        window.requestAnimationFrame(function () {
          var on = bar.querySelector('.tab.on'); if (!on || bar.scrollWidth <= bar.clientWidth) return;
          bar.scrollLeft += on.getBoundingClientRect().left - bar.getBoundingClientRect().left - (bar.clientWidth - on.offsetWidth) / 2;
        });
      });
    }

    /* ── staggered entrance for freshly rendered screens / panes ───────────────────────────────────────────── */
    function isScreenTarget(el) { return el === view || (el && (el.id === 'pane' || el.hasAttribute && el.hasAttribute('data-weighment'))); }
    function enter(record) {
      if (reduce || document.hidden || !isScreenTarget(record.target)) return;
      var replacedTabs = Array.prototype.some.call(record.removedNodes, function (n) { return n.nodeType === 1 && n.classList.contains('tabs'); });
      var index = 0;
      Array.prototype.forEach.call(record.addedNodes, function (node) {
        if (node.nodeType !== 1) return;
        var cls = node.className || '';
        if (node.id === 'pane' || /(^| )(tw-progress|viewer|plan-expanded|plan-submit)( |$)/.test(cls) || (replacedTabs && /(^| )tabs( |$)/.test(cls))) return;
        if (index > 11) return;
        node.style.animationDelay = (index * 45) + 'ms'; index++;
        node.classList.add('tw-in');
        var clear = function () { node.classList.remove('tw-in'); node.style.animationDelay = ''; node.removeEventListener('animationend', onEnd); };
        var onEnd = function (e) { if (e.target === node) clear(); };
        node.addEventListener('animationend', onEnd);
        setTimeout(clear, 1600 + index * 45);   // fallback: never leave the helper class behind
      });
    }

    if (view && window.MutationObserver) {
      decorate(view);
      new MutationObserver(function (records) {
        records.forEach(function (record) {
          enter(record);
          Array.prototype.forEach.call(record.addedNodes, decorate);
          if (record.type === 'characterData' || (record.type === 'childList' && record.target !== view)) {
            var card = record.target.nodeType === 1 ? record.target.closest('.tw-loading') : record.target.parentNode && record.target.parentNode.closest && record.target.parentNode.closest('.tw-loading');
            if (card && !/^Loading/i.test(text(card))) card.classList.remove('tw-loading');
          }
        });
      }).observe(view, { childList: true, subtree: true, characterData: true });
    }
  } catch (e) { /* styling must never break the app */ }
})();
