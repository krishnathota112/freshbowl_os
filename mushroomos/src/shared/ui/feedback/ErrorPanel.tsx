import { humanError } from '../../utils/humanError';

/**
 * A refusal or a failure, in words a person can act on. `UI-SYSTEM.md` — "Failure is honest".
 *
 * The server's own sentence is shown when it has one (a refusal from the database names what to do
 * instead); a network failure is translated by `humanError`, which never claims more than it knows.
 * It sits beside the action that failed, never in a toast that disappears.
 */
export function ErrorPanel({
  error,
  prefix,
  onRetry,
}: {
  error: unknown;
  /** What did not happen, e.g. "The sample was not recorded." */
  prefix?: string;
  onRetry?: () => void;
}) {
  const h = humanError(error);
  return (
    <div
      className="rounded-lg border px-4 py-3 text-[14px]"
      style={{ borderColor: 'var(--crit)', background: 'var(--crit-soft)', color: 'var(--crit)' }}
      role="alert"
    >
      <p className="font-700">
        {prefix ? `${prefix} ` : ''}
        {h.title}.
      </p>
      {h.detail && <p className="mt-1">{h.detail}</p>}
      {onRetry && h.retryable && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-md border px-4 font-head text-[14px] font-700"
          style={{ minHeight: 44, borderColor: 'var(--crit)', color: 'var(--crit)' }}
        >
          Try again
        </button>
      )}
    </div>
  );
}
