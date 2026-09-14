/**
 * Turns a thrown error into something a person on the factory floor can act on.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * The app was handed out and came back described as "empty". It was not empty — it rendered fine.
 * What had happened was that the connection failed, and every screen in the product answered that
 * with the browser's own words:
 *
 *     Failed to fetch
 *
 * That is three words of JavaScript. It does not say the phone is offline, it does not say to try
 * again, and it does not say the work is safe. Someone holding the phone reasonably concludes the
 * application is broken or empty.
 *
 * Traced on a device, the underlying cause that day was `ERR_CERT_AUTHORITY_INVALID` — a network
 * intercepting HTTPS. The other common causes are a phone with no signal and, very often on cheap
 * Android hardware, a device clock set to the wrong date, which makes every certificate look
 * expired. A factory user can act on all three IF they are told which one it is.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: invent a diagnosis. `Failed to fetch` genuinely does not say
 * why, so the message says the connection failed and lists what is worth checking — it never
 * asserts "you are offline" when it cannot know that.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

export type HumanError = {
  /** One line, in plain words. */
  title: string;
  /** What to do about it. Empty when there is nothing useful to suggest. */
  detail: string;
  /** True when trying again might genuinely work — the caller shows a retry. */
  retryable: boolean;
};

/** The browser's wording for "the request never completed", across engines. */
const NETWORK_SHAPES = [
  'failed to fetch',
  'networkerror',
  'network request failed',
  'load failed',
  'err_internet_disconnected',
  'err_name_not_resolved',
  'err_connection',
  'err_cert',
  'err_timed_out',
  'the internet connection appears to be offline',
];

/**
 * The server's own sentence, whatever shape the thrower used.
 *
 * `supabase-js` does NOT throw `Error`. A refusal from Postgres arrives as a PLAIN OBJECT —
 * `{ code, message, details, hint }` (`PostgrestError`), and `AuthError` is its own class whose
 * instances also failed the `instanceof Error` test across bundler/realm boundaries. Both fell
 * through to `String(err)`, which for an object is the literal text `[object Object]`.
 *
 * That is how the prepare screen came to say "Nothing was accepted. [object Object]" while the
 * database was answering with a sentence naming exactly who may accept a lab result. The refusal
 * message is the single most useful thing the server produces — rule "a refusal must name what to
 * do instead" is worthless if the message never reaches the screen.
 *
 * So: read `.message` off anything that carries one, and keep `details`/`hint` as a second line,
 * because a Postgres RAISE puts the "do this instead" half in `hint` more often than not.
 */
function errorText(err: unknown): { message: string; extra: string } {
  if (err == null) return { message: '', extra: '' };
  if (typeof err === 'string') return { message: err, extra: '' };

  if (typeof err === 'object') {
    const o = err as { message?: unknown; details?: unknown; hint?: unknown; error_description?: unknown };
    const message =
      typeof o.message === 'string' && o.message.length > 0
        ? o.message
        : typeof o.error_description === 'string'
          ? o.error_description
          : '';
    const extra = [o.hint, o.details]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .join(' ');
    // Only fall back to String() when the object genuinely carries no message — and never let
    // "[object Object]" through as if it were words.
    if (message.length === 0) {
      const s = String(err);
      return { message: s === '[object Object]' ? '' : s, extra };
    }
    return { message, extra };
  }

  return { message: String(err), extra: '' };
}

export function humanError(err: unknown): HumanError {
  const { message: raw, extra } = errorText(err);
  const low = raw.toLowerCase();

  if (NETWORK_SHAPES.some((s) => low.includes(s))) {
    return {
      title: 'Could not reach the server',
      detail:
        'Nothing you entered has been lost. Check the phone has signal or Wi-Fi, and that its ' +
        'date and time are correct — a wrong date stops the secure connection. Then try again.',
      retryable: true,
    };
  }

  if (low.includes('invalid login credentials')) {
    return {
      title: 'That email and password do not match',
      detail: 'Check for a capital letter or a stray space, then try again.',
      retryable: false,
    };
  }

  if (low.includes('jwt') || low.includes('token') || low.includes('session')) {
    return {
      title: 'You have been signed out',
      detail: 'Sign in again to carry on. Anything already submitted is saved.',
      retryable: false,
    };
  }

  // The factory names a master batch by its INDIVIDUAL BATCH NUMBERS — "366,367,368", "1,2,3" —
  // one master batch covering three of them. The screen defaults to a date-based code, so creating
  // a second batch on one day collides on `master_batch_code_key` and Postgres answers with the
  // constraint name, which tells a factory admin nothing.
  if (low.includes('master_batch_code_key') || (low.includes('duplicate key') && low.includes('code'))) {
    return {
      title: 'That batch name is already used',
      detail:
        'Every batch needs its own name. Use the batch numbers this master batch covers — for ' +
        'example 366,367,368 — which is how the factory refers to it everywhere else.',
      retryable: false,
    };
  }

  if (low.includes('duplicate key')) {
    return {
      title: 'That already exists',
      detail: 'Something with the same identifier is already on record. Change it and try again.',
      retryable: false,
    };
  }

  if (low.includes('row-level security') || low.includes('permission denied')) {
    return {
      title: 'This is not yours to open',
      detail: 'Your account does not have access to this. Ask a supervisor if you think it should.',
      retryable: false,
    };
  }

  // Anything else: show what the server actually said, because a real message from the database —
  // "this reload goes back into the bunker it came from" — is far more useful than a generic
  // apology. Only the shapes above are worth translating.
  const said = [raw, extra].filter((v) => v.length > 0).join(' ');
  return {
    title: 'That did not go through',
    detail: said.length > 0 ? said : 'No reason was given. Nothing has been changed.',
    retryable: true,
  };
}
