/**
 * Mushroom OS – demo scaffolding.
 *
 * This exists because the APK goes out to stakeholders who will open it alone,
 * with nobody to explain it. Without help they hit a locked stage, do not know
 * which field is missing, and put the phone down.
 *
 * Everything here is DELIBERATELY SEPARATE from the app. It adds no behaviour
 * to the product — it only drives the real controls the way a person would, so
 * the real gating is still what is being demonstrated. Deleting this one file
 * and its <script> tag removes demo mode completely.
 *
 * Provides:
 *   - a seeded starting state, so the app opens mid-batch rather than empty
 *   - Fill  : populates the current stage's required controls
 *   - Next  : completes the stage and moves to the next one
 *   - Reset : clears all demo progress and re-seeds
 */
(function () {
  'use strict';

  const SEED_THROUGH = 'stage_1B';        // stages up to and including this start done
  const SEED_FLAG    = 'mushroomos.demo.seeded';
  const OPERATORS    = ['Ramesh', 'Suresh', 'Prasad'];

  const order = () => (window.STAGE_ORDER || []);
  const pageName = () => (location.pathname.split('/').pop() || '').replace('.html', '');

  // ── Seeded history ────────────────────────────────────────────────────────
  // Real completion records, just pre-written, so the workflow list and home
  // screen open with plausible history instead of an empty batch.
  function seedIfNeeded() {
    if (localStorage.getItem(SEED_FLAG)) return;
    const stages = order();
    const upto = stages.indexOf(SEED_THROUGH);
    if (upto === -1) return;
    const now = Date.now();
    stages.slice(0, upto + 1).forEach((s, i) => {
      // spread them back over the last ~2 days so timestamps look like a run
      const at = now - (upto - i + 1) * 5.5 * 3600 * 1000;
      localStorage.setItem('mushroomos.completed.' + s, JSON.stringify({
        at, by: OPERATORS[i % OPERATORS.length], role: 'operator', seeded: true,
      }));
    });
    localStorage.setItem(SEED_FLAG, String(now));
  }

  function resetDemo() {
    Object.keys(localStorage)
      .filter(k => k.startsWith('mushroomos.') && k !== 'mushroomos.session')
      .forEach(k => localStorage.removeItem(k));
    seedIfNeeded();
    location.href = 'home.html';
  }

  // ── Fill the current stage ────────────────────────────────────────────────
  // Drives the real inputs and fires the real events — it does not bypass the
  // validator, it satisfies it. Same path a user's fingers would take.
  function fillStage() {
    const d = document;
    d.querySelectorAll('input[required], select[required]').forEach(i => {
      if (i.value) return;
      if (i.type === 'time') i.value = '08:30';
      else if (i.tagName === 'SELECT') { if (i.options.length > 1) i.selectedIndex = 1; }
      else if (i.type === 'number') {
        const min = parseFloat(i.min), max = parseFloat(i.max);
        i.value = (!isNaN(min) && !isNaN(max)) ? ((min + max) / 2).toFixed(1)
                : !isNaN(min) ? String(min + 1) : '2.5';
      } else i.value = 'OK';
      i.dispatchEvent(new Event(i.tagName === 'SELECT' || i.type === 'time' ? 'change' : 'input', { bubbles: true }));
    });
    d.querySelectorAll('.check-item[data-required]').forEach(c => {
      if (c.getAttribute('data-checked') !== 'true') c.click();
    });
    d.querySelectorAll('.toggle-btn[data-required]').forEach(t => {
      if (t.getAttribute('data-on') !== 'true') t.click();
    });
    d.querySelectorAll('.pass-fail-group').forEach(g => {
      const b = g.querySelector('button'); if (b) b.click();
    });
    d.querySelectorAll('.photo-upload-area input[type=file]').forEach(inp => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'capture.jpg', { type: 'image/jpeg' }));
      inp.files = dt.files;
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    });
    if (window.toast) toast('Stage filled — gates released', 'auto_fix_high');
  }

  // ── Next ──────────────────────────────────────────────────────────────────
  function nextStage() {
    const stages = order();
    const here = pageName();
    const idx = stages.indexOf(here);

    if (idx !== -1) {
      if (typeof window.recordStageComplete === 'function') window.recordStageComplete();
      const next = stages[idx + 1];
      location.href = next ? next + '.html' : 'records.html';
      return;
    }
    // Not on a stage page — jump to whichever stage is currently in progress.
    const cur = typeof window.currentStage === 'function' ? window.currentStage() : stages[0];
    location.href = cur + '.html';
  }

  // ── Toolbar ───────────────────────────────────────────────────────────────
  const PRE_AUTH = ['index', 'login'];

  function build() {
    if (document.getElementById('demoBar')) return;
    // No demo controls on the splash or sign-in — there is nothing to drive yet,
    // and a scaffolding badge on the first screen undercuts the whole app.
    if (PRE_AUTH.includes(pageName())) return;
    const onStage = order().indexOf(pageName()) !== -1;

    const bar = document.createElement('div');
    bar.id = 'demoBar';
    bar.className = 'demo-bar';
    bar.innerHTML = `
      <button type="button" class="demo-toggle" aria-expanded="false" aria-controls="demoActions">
        <span class="material-symbols-outlined" style="font-size:17px;">bolt</span><span>Demo</span>
      </button>
      <div class="demo-actions" id="demoActions" hidden>
        ${onStage ? '<button type="button" data-demo="fill"><span class="material-symbols-outlined" style="font-size:16px;">auto_fix_high</span>Fill stage</button>' : ''}
        <button type="button" data-demo="next"><span class="material-symbols-outlined" style="font-size:16px;">arrow_forward</span>${onStage ? 'Next stage' : 'Go to current stage'}</button>
        <button type="button" data-demo="reset"><span class="material-symbols-outlined" style="font-size:16px;">restart_alt</span>Reset demo</button>
      </div>`;
    document.body.appendChild(bar);

    const toggle = bar.querySelector('.demo-toggle');
    const actions = bar.querySelector('.demo-actions');
    toggle.addEventListener('click', () => {
      const open = !actions.hidden;
      actions.hidden = open;
      toggle.setAttribute('aria-expanded', String(!open));
      bar.classList.toggle('demo-open', !open);
    });

    bar.addEventListener('click', e => {
      const b = e.target.closest('[data-demo]');
      if (!b) return;
      const what = b.getAttribute('data-demo');
      if (what === 'fill') fillStage();
      if (what === 'next') nextStage();
      if (what === 'reset' && confirm('Reset the demo?\n\nClears all recorded progress and drafts, then restores the starting state.')) resetDemo();
    });
  }

  seedIfNeeded();
  document.addEventListener('DOMContentLoaded', build);

  window.Demo = { fillStage, nextStage, resetDemo, seedIfNeeded };
})();
