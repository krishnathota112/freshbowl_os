import { supabase } from '../api/client';

/**
 * ONE SOURCE OF "NOW" FOR THE WHOLE APPLICATION.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS EXISTS TO FIX
 *
 * The database has a dev clock — a settable effective time, with play and pause, so a demo can
 * stand at any hour of a batch's life. It is enabled, and it was found set to 14 September 12:30.
 *
 * The UI did not know it existed. Twenty-one call sites asked the browser what time it was.
 *
 * So the backend believed one instant and every screen believed another. The now-marker on the
 * rail, every rest countdown, every "waiting on you for 33h", every batch hour — all computed
 * against the wrong moment, all silently. Nothing looked broken; everything was wrong.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY IT IS FETCHED RATHER THAN GUESSED
 *
 * The effective clock lives in the database because that is what the gates read. A rest opens when
 * the SERVER says the window has passed, and a screen that disagrees with the server about the time
 * will show a countdown that hits zero while the gate stays shut.
 *
 * The offset is measured once and applied locally after that, so this is one request rather than
 * one per render. The offset is what is stored, not the instant, so the clock keeps ticking between
 * refreshes rather than freezing at the moment it was read.
 *
 * WHEN THE DEV CLOCK IS OFF — which is how a real factory runs — the offset is zero and this is
 * exactly the browser clock, so there is no cost to using it everywhere.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

/** Milliseconds to add to the browser clock to get the factory's effective now. */
let offsetMs = 0;
let resolved = false;

/**
 * Ask the database what time it is, once, and remember the difference.
 *
 * Called at start-up. If it fails — offline, or the function is not present in an older database —
 * the offset stays zero and the app runs on the browser clock, which is the correct fallback rather
 * than refusing to render.
 */
export async function syncEffectiveNow(): Promise<void> {
  try {
    const { data, error } = await supabase.rpc('get_effective_now');
    if (error || data === null || data === undefined) return;
    const server = Date.parse(data as string);
    if (!Number.isFinite(server)) return;
    offsetMs = server - Date.now();
    resolved = true;
  } catch {
    // Browser clock. Stated here rather than thrown: a demo with no network should still draw.
  }
}

/**
 * The effective now, in milliseconds.
 *
 * Drop-in for `Date.now()`. Every screen and every api module uses this instead, so the product
 * and the gate engine can never disagree about the time.
 */
export function nowMs(): number {
  return Date.now() + offsetMs;
}

/** The effective now, as a Date. */
export function nowDate(): Date {
  return new Date(nowMs());
}

/**
 * Whether the clock is being driven by the dev clock rather than the wall clock.
 *
 * The UI SAYS SO when it is. A demo standing at a fabricated hour must not look like live
 * production — someone would read a real decision off it.
 */
export function isTimeTravelled(): boolean {
  return resolved && Math.abs(offsetMs) > 60_000;
}

/** How far from the real clock, for the banner that admits it. */
export function timeTravelOffsetMs(): number {
  return offsetMs;
}
