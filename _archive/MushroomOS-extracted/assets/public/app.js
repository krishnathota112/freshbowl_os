/**
 * Mushroom OS – Shared Application Logic
 * Handles: navigation active states, toggle switches, photo upload simulation,
 * form validation, and shared utilities.
 */

// ─── Navigation ───────────────────────────────────────────────────────────────
(function initNav() {
  document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('[data-navlink]').forEach(link => {
      const target = link.getAttribute('data-navlink');
      if (path === target || (path === '' && target === 'index.html')) {
        link.classList.add('text-primary');
        link.classList.remove('text-outline');
        const icon = link.querySelector('.material-symbols-outlined');
        if (icon) icon.style.fontVariationSettings = "'FILL' 1";
      }
    });
  });
})();

// ─── Toggle Switch ────────────────────────────────────────────────────────────
function initToggle(btn) {
  const knob = btn.querySelector('.toggle-knob');
  btn.addEventListener('click', () => {
    const on = btn.getAttribute('data-on') === 'true';
    btn.setAttribute('data-on', !on);
    if (!on) {
      btn.classList.add('bg-primary');
      btn.classList.remove('bg-outline-variant');
      if (knob) knob.style.transform = 'translateX(24px)';
    } else {
      btn.classList.remove('bg-primary');
      btn.classList.add('bg-outline-variant');
      if (knob) knob.style.transform = 'translateX(0px)';
    }
    checkFormValidity();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.toggle-btn').forEach(initToggle);
});

// ─── Checkbox Item ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.check-item').forEach(item => {
    item.addEventListener('click', () => {
      const checked = item.getAttribute('data-checked') === 'true';
      item.setAttribute('data-checked', !checked);
      const box = item.querySelector('.check-box');
      if (box) {
        if (!checked) {
          box.classList.add('bg-primary', 'border-primary');
          box.innerHTML = '<span class="material-symbols-outlined text-white" style="font-size:14px;">check</span>';
          item.classList.add('bg-primary-fixed/30');
        } else {
          box.classList.remove('bg-primary', 'border-primary');
          box.innerHTML = '';
          item.classList.remove('bg-primary-fixed/30');
        }
      }
      checkFormValidity();
    });
  });
});

// ─── Pass / Fail Buttons ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.pass-fail-group').forEach(group => {
    group.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('button').forEach(b => {
          b.classList.remove('bg-primary', 'text-on-primary');
          b.classList.add('bg-surface-container', 'text-on-surface-variant');
        });
        btn.classList.add('bg-primary', 'text-on-primary');
        btn.classList.remove('bg-surface-container', 'text-on-surface-variant');
        checkFormValidity();
      });
    });
  });
});

// ─── Photo Upload Simulation ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.photo-upload-area').forEach(area => {
    const input = area.querySelector('input[type="file"]');
    if (!input) return;
    input.addEventListener('change', function () {
      if (this.files && this.files[0]) {
        const name = this.files[0].name;
        area.classList.add('bg-primary/10', 'border-primary/40');
        area.classList.remove('border-dashed');
        area.innerHTML = `
          <span class="material-symbols-outlined text-primary" style="font-size:32px;">check_circle</span>
          <span class="font-body-md text-on-surface mt-1">Photo Captured</span>
          <span class="font-body-sm text-outline">${name}</span>
          <input type="file" accept="image/*" capture="environment" class="absolute inset-0 opacity-0 cursor-pointer">
        `;
        // re-bind
        area.querySelector('input').addEventListener('change', arguments.callee.bind(this));
        area.setAttribute('data-photo', 'true');
        checkFormValidity();
      }
    });
  });
});

// ─── Range validation ─────────────────────────────────────────────────────────
// REVERSAL, recorded deliberately: REGRESSION.md §1 used to say "validation is
// presence-based only — a wrong number must never block submission". The SOP
// audit (BUGS.docx, 2026-08-04) requires the opposite: an out-of-range reading
// must stop the stage. The SOP is the authority, so the invariant is inverted.
//
// An input declares its range with native min/max. Out of range =>
//   - the field is flagged inline, immediately, as you type
//   - the stage gate stays locked
//   - a supervisor override can release it (PRD approval level 4/5), and the
//     override is recorded rather than silently forgiven.
const OVERRIDE_KEY = () => 'mushroomos.override.' + (location.pathname.split('/').pop() || '');

function hasOverride() { try { return !!localStorage.getItem(OVERRIDE_KEY()); } catch (e) { return false; } }
function setOverride(by) {
  try { localStorage.setItem(OVERRIDE_KEY(), JSON.stringify({ at: Date.now(), by })); } catch (e) {}
}

/** Inputs whose entered value falls outside their declared min/max. */
function rangeViolations(scope) {
  const root = scope || document;
  return Array.from(root.querySelectorAll('input[type="number"][min][max]')).filter(i => {
    if (i.readOnly || i.disabled) return false;
    const v = i.value.trim();
    if (v === '') return false;                 // empty is a presence problem, not a range one
    const n = parseFloat(v);
    if (isNaN(n)) return false;
    return n < parseFloat(i.min) || n > parseFloat(i.max);
  });
}

function paintRangeFlags() {
  const bad = new Set(rangeViolations());
  document.querySelectorAll('input[type="number"][min][max]').forEach(i => {
    const wrap = i.closest('.flex.flex-col') || i.parentElement;
    let msg = wrap && wrap.querySelector('[data-range-msg]');
    const off = bad.has(i);
    i.classList.toggle('range-bad', off);
    if (off && wrap) {
      if (!msg) {
        msg = document.createElement('p');
        msg.setAttribute('data-range-msg', '');
        msg.className = 'text-[11px] font-bold text-error mt-1 flex items-center gap-1';
        wrap.appendChild(msg);
      }
      msg.textContent = `Must be between ${i.min} and ${i.max}. Entered ${i.value}.`;
      msg.style.display = '';
    } else if (msg) {
      msg.style.display = 'none';
    }
  });
  return bad.size;
}

/**
 * Supervisor override. An out-of-range reading can be real — the SOP wants it
 * stopped, but it must not be unrecordable. This offers the release only when a
 * range violation is the ONLY thing blocking, and it stamps who released it.
 */
function renderOverride(show, count) {
  let box = document.getElementById('rangeOverride');
  if (!show) { if (box) box.remove(); return; }
  if (box) return;

  const banner = document.querySelector('[data-lock-banner]');
  const host = (banner && banner.parentElement) || document.querySelector('[data-form]');
  if (!host) return;

  box = document.createElement('div');
  box.id = 'rangeOverride';
  box.className = 'mx-5 mb-3 p-3 rounded-xl bg-tertiary-container/25 border border-tertiary/30 flex items-start gap-2';
  box.innerHTML = `
    <span class="material-symbols-outlined text-tertiary" style="font-size:18px;">shield_person</span>
    <div class="flex-1">
      <p class="text-[12px] font-bold text-on-surface">${count} reading${count > 1 ? 's are' : ' is'} outside the SOP range</p>
      <p class="text-[11px] text-on-surface-variant mt-0.5">A supervisor can release this stage. The override is recorded against your name.</p>
      <button type="button" id="rangeOverrideBtn"
        class="mt-2 px-3 py-1.5 rounded-lg bg-tertiary text-on-tertiary text-[11px] font-bold active:scale-95 transition-all">
        Supervisor override
      </button>
    </div>`;
  host.insertBefore(box, banner || host.firstChild);

  box.querySelector('#rangeOverrideBtn').addEventListener('click', () => {
    const u = window.Auth && window.Auth.currentUser();
    if (!confirm('Release this stage despite readings outside the SOP range?\n\nThis is recorded against your name.')) return;
    setOverride(u ? u.name : 'Unknown');
    toast('Stage released by override', 'shield_person');
    checkFormValidity();
  });
}

// ─── Form Validity / Submit Unlock ────────────────────────────────────────────
function checkFormValidity() {
  // Steps first, and outside the [data-form] guard — the step engine must run
  // on every page that declares steps, whether or not it declares a form.
  syncSteps();

  const form = document.querySelector('[data-form]');
  if (!form) return;

  const mandatoryChecks = Array.from(form.querySelectorAll('.check-item[data-required]'));
  const allChecked = mandatoryChecks.every(i => i.getAttribute('data-checked') === 'true');

  const mandatoryPhotos = Array.from(form.querySelectorAll('.photo-upload-area[data-required]'));
  const allPhotos = mandatoryPhotos.every(p => p.getAttribute('data-photo') === 'true');

  const mandatoryInputs = Array.from(form.querySelectorAll('input[required], select[required]'));
  const allInputsFilled = mandatoryInputs.every(i => i.value.trim() !== '');

  const mandatoryToggles = Array.from(form.querySelectorAll('.toggle-btn[data-required]'));
  const allToggled = mandatoryToggles.every(t => t.getAttribute('data-on') === 'true');

  const outOfRange = paintRangeFlags();
  const rangeOk = outOfRange === 0 || hasOverride();

  const valid = allChecked && allPhotos && allInputsFilled && allToggled && rangeOk;

  // The topbar "Next" was an <a href> that navigated regardless — it defeated
  // every gate on all 17 stages. Same defect the submit button had. It is now
  // gated too, and says why when it is blocked.
  const topNext = document.querySelector('[data-topbar-next]');
  if (topNext) {
    topNext.classList.toggle('topbar-next-locked', !valid);
    topNext.setAttribute('aria-disabled', String(!valid));
    if (!topNext.dataset.gated) {
      topNext.dataset.gated = '1';
      topNext.addEventListener('click', e => {
        if (topNext.getAttribute('aria-disabled') !== 'true') return;
        e.preventDefault();
        const n = rangeViolations().length;
        toast(n ? 'Readings are outside the SOP range' : 'Complete this stage first', 'lock');
      });
    }
  }

  // Offer the supervisor override only when a range violation is the sole blocker.
  const onlyRangeBlocks = allChecked && allPhotos && allInputsFilled && allToggled && outOfRange > 0;
  renderOverride(onlyRangeBlocks && !hasOverride(), outOfRange);

  const submitBtn = document.querySelector('[data-submit-btn]');
  const lockBanner = document.querySelector('[data-lock-banner]');

  if (submitBtn) {
    if (valid) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      submitBtn.classList.add('active:scale-95');
    } else {
      submitBtn.disabled = true;
      submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
      submitBtn.classList.remove('active:scale-95');
    }
  }

  if (lockBanner) {
    lockBanner.style.display = valid ? 'none' : 'flex';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // bind regular inputs too
  document.querySelectorAll('input[required], select[required]').forEach(el => {
    el.addEventListener('input', checkFormValidity);
    el.addEventListener('change', checkFormValidity);
  });
  checkFormValidity();
});

// ─── Step Engine ──────────────────────────────────────────────────────────────
// Until now `checkFormValidity` was the whole validation engine: one page-wide
// gate driving exactly two things, the submit button and the lock banner. Every
// numbered circle, padlock and "Complete Step 1 to unlock" string was static
// HTML wired to nothing, and several steps carried a hardcoded
// `pointer-events-none` that could never be removed.
//
// This drives them for real. Markup contract, per stage page:
//
//   [data-step="N"]            the step section itself; N is 1-based
//     [data-step-lock]         padlock, shown only while that step is locked
//     [data-step-locked-msg]   placeholder text shown only while locked
//   [data-step-indicator="N"]  the numbered circle in the tracker
//   [data-progress-fill]       element whose width tracks completed/total
//
// A step is COMPLETE when every required control inside it is satisfied, and
// UNLOCKED when all earlier steps are complete. Locked steps get the
// pointer-events-none — set here, never hardcoded — so a step can always unlock.

// ─── Timed steps ──────────────────────────────────────────────────────────────
// Phase-II steps are governed by duration, not just data entry: "Levelling &
// Conditioning, target 20.0h". Nothing in the app tracked time at all — the
// elapsed figure was a hardcoded string and the bar a fixed width.
//
// A step declares data-target-hours. Its start time is written to localStorage
// the moment the step unlocks, so elapsed survives a reload or the phone dying.
// The step cannot complete until the duration has run AND its readings are in.
//
// TIME_SCALE compresses process time so this is demonstrable: at 3600, one
// process-hour elapses per real second, so a 20 h step completes in 20 s.
// SET THIS TO 1 FOR PRODUCTION — the logic is real either way, only the clock
// rate changes. Append ?realtime to any page to force 1 without editing code.
const TIME_SCALE = new URLSearchParams(location.search).has('realtime') ? 1 : 3600;

function timerKey(step) {
  return `mushroomos.timer.${location.pathname.split('/').pop()}.${step}`;
}

/** Hours of process time elapsed since this step unlocked. Starts the clock. */
function stepElapsedHours(el, running) {
  const key = timerKey(el.dataset.step);
  let start = Number(localStorage.getItem(key) || 0);
  if (!start) {
    if (!running) return 0;              // locked steps have not started yet
    start = Date.now();
    try { localStorage.setItem(key, String(start)); } catch (e) {}
  }
  return ((Date.now() - start) / 1000) * (TIME_SCALE / 3600);
}

/** Has this step's declared duration run? Steps without a duration are exempt. */
function stepTimeSatisfied(el) {
  const target = parseFloat(el.dataset.targetHours || '0');
  if (!target) return true;
  return stepElapsedHours(el, el.getAttribute('data-step-state') !== 'locked') >= target;
}

function paintTimer(el) {
  const target = parseFloat(el.dataset.targetHours || '0');
  if (!target) return;
  const running = el.getAttribute('data-step-state') !== 'locked';
  const hrs = Math.min(stepElapsedHours(el, running), target);
  const pct = Math.min(100, (hrs / target) * 100);
  el.querySelectorAll('[data-elapsed]').forEach(n => { n.textContent = hrs.toFixed(1) + 'h'; });
  el.querySelectorAll('[data-time-fill]').forEach(n => { n.style.width = pct + '%'; });
  el.querySelectorAll('[data-time-remaining]').forEach(n => {
    const left = Math.max(0, target - hrs);
    n.textContent = left <= 0 ? 'Duration complete' : left.toFixed(1) + 'h remaining';
  });
}

/** Clear this page's step clocks — ?restart lets a demo be run again. */
function resetTimers() {
  document.querySelectorAll('[data-step]').forEach(el => {
    try { localStorage.removeItem(timerKey(el.dataset.step)); } catch (e) {}
  });
}

/** Are all required controls inside `scope` satisfied? */
function sectionComplete(scope) {
  const every = (sel, test) => Array.from(scope.querySelectorAll(sel)).every(test);
  return every('.check-item[data-required]',       i => i.getAttribute('data-checked') === 'true')
      && every('.photo-upload-area[data-required]', p => p.getAttribute('data-photo')   === 'true')
      && every('input[required], select[required]', i => i.value.trim() !== '')
      && every('.toggle-btn[data-required]',        t => t.getAttribute('data-on')      === 'true');
}

const CIRCLE_BASE = 'w-8 h-8 rounded-full flex items-center justify-center text-[14px] font-bold';

function paintIndicator(n, state) {
  const ind = document.querySelector(`[data-step-indicator="${n}"]`);
  if (!ind) return;
  ind.classList.toggle('opacity-40', state === 'locked');
  const circle = ind.querySelector('div');
  const label  = ind.querySelector('span');
  if (circle) {
    circle.className = CIRCLE_BASE + (state === 'locked'
      ? ' bg-surface-container-high text-on-surface-variant'
      : ' bg-primary text-on-primary ring-4 ring-primary/10');
    if (state === 'complete') {
      circle.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">check</span>';
    } else {
      circle.textContent = String(n);
    }
  }
  if (label) {
    label.className = 'text-[11px] font-bold ' +
      (state === 'locked' ? 'text-on-surface-variant' : 'text-primary');
  }
}

function syncSteps() {
  // Section containers only. A control that merely carries a data-step label is
  // not a step — phase_1A tags individual checkboxes that way to group them, and
  // treating those as sections silently stopped them being clickable.
  const steps = Array.from(document.querySelectorAll('[data-step]'))
    .filter(el => !el.matches('.check-item, .toggle-btn, .photo-upload-area, input, select, button'))
    .sort((a, b) => Number(a.dataset.step) - Number(b.dataset.step));
  if (!steps.length) return;

  let priorAllComplete = true;
  let completed = 0;

  for (const el of steps) {
    const n       = Number(el.dataset.step);
    const enabled = priorAllComplete;
    // A timed step needs BOTH its duration run and its readings in.
    const done    = enabled && sectionComplete(el) && stepTimeSatisfied(el);
    const state   = !enabled ? 'locked' : done ? 'complete' : 'active';

    el.classList.toggle('pointer-events-none', !enabled);
    el.classList.toggle('opacity-60', !enabled);
    el.setAttribute('data-step-state', state);

    const lock = el.querySelector('[data-step-lock]');
    if (lock) lock.style.display = enabled ? 'none' : '';
    const msg = el.querySelector('[data-step-locked-msg]');
    if (msg) msg.style.display = enabled ? 'none' : '';
    const body = el.querySelector('[data-step-body]');
    if (body) body.style.display = enabled ? '' : 'none';

    paintIndicator(n, state);
    paintTimer(el);
    if (done) completed++;
    priorAllComplete = priorAllComplete && done;
  }

  const pct = Math.round((completed / steps.length) * 100);
  document.querySelectorAll('[data-progress-fill]').forEach(el => { el.style.width = pct + '%'; });
  document.querySelectorAll('[data-progress-text]').forEach(el => { el.textContent = pct + '%'; });
}

// Timed steps have to re-evaluate on their own — nothing the user does moves a
// clock. Only ticks on pages that actually declare a duration.
document.addEventListener('DOMContentLoaded', () => {
  if (new URLSearchParams(location.search).has('restart')) resetTimers();
  if (!document.querySelector('[data-target-hours]')) return;
  syncSteps();
  setInterval(syncSteps, 1000);
});

// ─── Lock Banner Placement ────────────────────────────────────────────────────
// The banner and the action bar are both fixed to bottom:64px, so the banner has
// to be lifted by whatever height the bar actually is on this page (76-82px).
function positionLockBanner() {
  const banner = document.querySelector('[data-lock-banner]');
  const submitBtn = document.querySelector('[data-submit-btn]');
  if (!banner || !submitBtn) return;
  const bar = submitBtn.closest('.fixed') || submitBtn.parentElement;
  if (!bar) return;
  document.documentElement.style.setProperty('--action-bar-h', bar.offsetHeight + 'px');
}

document.addEventListener('DOMContentLoaded', () => {
  positionLockBanner();
  const submitBtn = document.querySelector('[data-submit-btn]');
  const bar = submitBtn && (submitBtn.closest('.fixed') || submitBtn.parentElement);
  if (bar && window.ResizeObserver) new ResizeObserver(positionLockBanner).observe(bar);
  window.addEventListener('resize', positionLockBanner);
});

// ─── Drafts ───────────────────────────────────────────────────────────────────
// The Save Draft buttons were decorative. They now persist the form to
// localStorage keyed by page, and the page restores itself on load — so a
// half-finished stage survives a phone dying or the app restarting, which is
// the whole point on a 146-hour process.

function draftKey() {
  return 'mushroomos.draft.' + (window.location.pathname.split('/').pop() || 'index.html');
}

function toast(message, icon) {
  document.querySelectorAll('.mos-toast').forEach(t => t.remove());
  const el = document.createElement('div');
  el.className = 'mos-toast';
  el.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px;">${icon || 'check_circle'}</span><span>${message}</span>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('mos-toast-in'));
  setTimeout(() => { el.classList.remove('mos-toast-in'); setTimeout(() => el.remove(), 250); }, 2200);
}

function collectDraft() {
  const d = { inputs: {}, checks: [], toggles: [], photos: [] };
  document.querySelectorAll('input:not([type=file]), select, textarea').forEach((el, i) => {
    const k = el.id || el.name || 'idx' + i;
    if (el.value !== '') d.inputs[k] = el.value;
  });
  document.querySelectorAll('.check-item').forEach((el, i) => {
    if (el.getAttribute('data-checked') === 'true') d.checks.push(i);
  });
  document.querySelectorAll('.toggle-btn').forEach((el, i) => {
    if (el.getAttribute('data-on') === 'true') d.toggles.push(i);
  });
  document.querySelectorAll('.photo-upload-area').forEach((el, i) => {
    if (el.getAttribute('data-photo') === 'true') d.photos.push(i);
  });
  return d;
}

function saveDraft() {
  try {
    localStorage.setItem(draftKey(), JSON.stringify({ at: Date.now(), data: collectDraft() }));
    toast('Draft saved', 'save');
  } catch (e) {
    toast('Could not save draft', 'error');
  }
}

function restoreDraft() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(draftKey()) || 'null'); } catch (e) { return; }
  if (!saved || !saved.data) return;
  const d = saved.data;

  document.querySelectorAll('input:not([type=file]), select, textarea').forEach((el, i) => {
    const k = el.id || el.name || 'idx' + i;
    if (d.inputs && d.inputs[k] != null) el.value = d.inputs[k];
  });
  // Replay as clicks so each control's own handler runs and the visuals match.
  document.querySelectorAll('.check-item').forEach((el, i) => {
    if (d.checks.includes(i) && el.getAttribute('data-checked') !== 'true') el.click();
  });
  document.querySelectorAll('.toggle-btn').forEach((el, i) => {
    const on = el.getAttribute('data-on') === 'true';
    if (d.toggles.includes(i) !== on) el.click();
  });
  document.querySelectorAll('.photo-upload-area').forEach((el, i) => {
    if (d.photos.includes(i)) el.setAttribute('data-photo', 'true');
  });

  checkFormValidity();
  toast('Draft restored', 'history');
}

document.addEventListener('DOMContentLoaded', () => {
  const btns = Array.from(document.querySelectorAll('button'))
    .filter(b => /save draft/i.test(b.textContent || ''));
  btns.forEach(b => {
    b.setAttribute('data-save-draft', '');
    b.addEventListener('click', e => { e.preventDefault(); saveDraft(); });
  });
  if (document.querySelector('[data-form]')) restoreDraft();
});

// ─── Stage progress ───────────────────────────────────────────────────────────
// workflow.html used to hardcode "2C · IN PROGRESS" — one hand-written class on
// one of 17 rows, with no JS on the page at all. It never moved, and it
// contradicted the home screen, which claimed stage 6. Completing a stage now
// records it, and workflow paints itself from those records.

const STAGE_ORDER = ['stage_0A','stage_0B','stage_0C','stage_0D','stage_1A','stage_1B',
  'stage_1CA','stage_1CB','phase_1A','phase_1B','phase_1C','phase_1DA','phase_1DB',
  'phase_2A','phase_2B','phase_2C','phase_2D'];

const STAGE_LABELS = {
  stage_0A: ['Phase 0 / Pre-Wet',   'Bagasse Pre-Wet & Rest'],
  stage_0B: ['Phase 0 / Bunker',    '1st Bunker Filling'],
  stage_0C: ['Phase 0 / Bunker',    'Unloading & Re-Loading'],
  stage_0D: ['Phase 0 / Bunker',    '2nd Bunker Re-Filling'],
  stage_1A: ['Phase I / Mixing',    'Chicken Manure Dry Mix'],
  stage_1B: ['Phase I / Mixing',    'Wet Mixing'],
  stage_1CA: ['Phase I / Paddy',    'Paddy Preparation'],
  stage_1CB: ['Phase I / Paddy',    'Paddy Soaking'],
  phase_1A: ['Phase I / Compost',   'Heap Turning'],
  phase_1B: ['Phase I / Compost',   'Bunker Loading'],
  phase_1C: ['Phase I / Compost',   'Bunker Conditioning'],
  phase_1DA: ['Phase I / Compost',  'Unload & Reload 1'],
  phase_1DB: ['Phase I / Compost',  'Unload & Reload 2'],
  phase_2A: ['Phase II / Tunnel',   'Tunnel Preparation'],
  phase_2B: ['Phase II / Tunnel',   'Tunnel Filling'],
  phase_2C: ['Phase II / Tunnel',   'Tunnel Process'],
  phase_2D: ['Phase II / Tunnel',   'Tunnel Unloading'],
};

const stageKey = name => 'mushroomos.completed.' + name;
const pageStage = () => (location.pathname.split('/').pop() || '').replace('.html', '');

function stageRecord(name) {
  try { return JSON.parse(localStorage.getItem(stageKey(name)) || 'null'); } catch (e) { return null; }
}

/** The first stage with no completion record — i.e. the one actually in progress. */
function currentStage() {
  return STAGE_ORDER.find(s => !stageRecord(s)) || STAGE_ORDER[STAGE_ORDER.length - 1];
}

// Paint any [data-stage-*] slot with the real current stage. Home used to claim
// "Stage 6 of 17 · Bunker Conditioning" while workflow highlighted 2C — stage 16.
document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('[data-stage-name]')) return;
  const cur = currentStage();
  const idx = STAGE_ORDER.indexOf(cur);
  const [phase, label] = STAGE_LABELS[cur] || ['', cur];
  const pct = Math.round((idx / STAGE_ORDER.length) * 100);
  const set = (sel, v) => document.querySelectorAll(sel).forEach(n => { n.textContent = v; });
  set('[data-stage-name]', label);
  set('[data-stage-phase]', phase);
  set('[data-stage-count]', `Stage ${idx + 1} of ${STAGE_ORDER.length}`);
  set('[data-stage-pct]', `${pct}% Complete`);
  document.querySelectorAll('[data-stage-progress]').forEach(n => { n.style.width = pct + '%'; });
  // "View Activity" should open the stage that is actually current.
  document.querySelectorAll('[data-current-stage-link]').forEach(a => { a.href = cur + '.html'; });
});

/** Called when a stage's submit is pressed. The button is disabled unless the
 *  form is valid, so reaching here means the stage genuinely passed its gates. */
function recordStageComplete() {
  const name = pageStage();
  if (!STAGE_ORDER.includes(name)) return;
  const u = window.Auth && window.Auth.currentUser();
  try {
    localStorage.setItem(stageKey(name), JSON.stringify({
      at: Date.now(), by: u ? u.name : 'Unknown', role: u ? u.role : null,
    }));
    localStorage.removeItem('mushroomos.draft.' + name + '.html');  // draft consumed
  } catch (e) {}
}

// ─── Next Stage Button ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const nextBtn = document.querySelector('[data-next-stage]');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      recordStageComplete();
      const target = nextBtn.getAttribute('data-next-stage');
      if (target) window.location.href = target;
    });
  }
});

// ─── Approval Actions ─────────────────────────────────────────────────────────
function approveCard(btn) {
  const card = btn.closest('.approval-card');
  if (!card) return;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin" style="font-size:18px;">sync</span> Processing...';
  btn.disabled = true;
  setTimeout(() => {
    card.style.transition = 'all 0.3s ease';
    card.style.opacity = '0';
    card.style.transform = 'translateX(100%)';
    setTimeout(() => {
      card.remove();
      updateApprovalCount();
    }, 300);
  }, 600);
}

function rejectCard(btn) {
  const card = btn.closest('.approval-card');
  if (!card) return;
  card.style.transition = 'all 0.3s ease';
  card.style.opacity = '0';
  card.style.transform = 'translateX(-100%)';
  setTimeout(() => {
    card.remove();
    updateApprovalCount();
  }, 300);
}

function updateApprovalCount() {
  const remaining = document.querySelectorAll('.approval-card').length;
  const countEl = document.getElementById('approval-count');
  if (countEl) countEl.textContent = remaining;
  if (remaining === 0) {
    const emptyState = document.getElementById('empty-approval-state');
    if (emptyState) emptyState.classList.remove('hidden');
  }
}

// ─── Records Search ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('records-search');
  if (!searchInput) return;
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase();
    document.querySelectorAll('.record-card').forEach(card => {
      const text = card.textContent.toLowerCase();
      card.style.display = text.includes(q) ? '' : 'none';
    });
  });
});

// ─── Login ────────────────────────────────────────────────────────────────────
// Real sign-in via auth.js (Supabase, local fallback). A wrong password must
// leave the user on this screen — see REGRESSION.md §4.
document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('loginBtn');
  if (!loginBtn) return;

  const errBox = document.getElementById('loginError');
  const errText = document.getElementById('loginErrorText');
  const showError = msg => {
    if (!errBox) return;
    if (errText) errText.textContent = msg;
    errBox.classList.remove('hidden');
    errBox.classList.add('flex');
  };
  const clearError = () => {
    if (!errBox) return;
    errBox.classList.add('hidden');
    errBox.classList.remove('flex');
  };

  loginBtn.addEventListener('click', async e => {
    e.preventDefault();
    clearError();

    const email = (document.getElementById('email') || {}).value || '';
    const password = (document.getElementById('password') || {}).value || '';

    const orig = loginBtn.innerHTML;
    loginBtn.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span>';
    loginBtn.style.opacity = '0.8';
    loginBtn.disabled = true;

    const restore = () => {
      loginBtn.innerHTML = orig;
      loginBtn.style.opacity = '';
      loginBtn.disabled = false;
    };

    let result;
    try {
      result = await window.Auth.signIn(email, password);
    } catch (err) {
      restore();
      showError('Could not sign in. Please try again.');
      return;
    }

    // Land on the screen the role actually works from, not always home.html.
    if (result.ok) {
      const role = result.session && result.session.role;
      window.location.href = window.Auth.landingFor(role);
      return;
    }
    restore();
    showError(result.error);
  });

  const togglePwd = document.getElementById('togglePassword');
  const pwdInput = document.getElementById('password');
  const eyeIcon = document.getElementById('eyeIcon');
  if (togglePwd && pwdInput && eyeIcon) {
    togglePwd.addEventListener('click', () => {
      const show = pwdInput.type === 'password';
      pwdInput.type = show ? 'text' : 'password';
      eyeIcon.textContent = show ? 'visibility_off' : 'visibility';
    });
  }
});

// ─── Profile ──────────────────────────────────────────────────────────────────
// #notif-toggle is a .toggle-btn, so initToggle already handles it; a second
// id-specific handler here would double-fire and invert the visual state.
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    // Clears the session, not just navigates — otherwise Back returns you signed in.
    logoutBtn.addEventListener('click', () => window.Auth.signOut());
  }
});

// Page-local scripts (e.g. the 1C-A pass log) use this too.
window.toast = toast;

// Exposed for demo.js — top-level const is not a window property.
window.sectionComplete = sectionComplete;
window.STAGE_ORDER = STAGE_ORDER;
window.STAGE_LABELS = STAGE_LABELS;
window.stageRecord = stageRecord;
