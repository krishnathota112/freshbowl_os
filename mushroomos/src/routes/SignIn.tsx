import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ROLE_HOME, ROLE_LABEL, signIn, useAuth } from '../lib/auth';
import { humanError } from '../lib/humanError';
import { Chip } from '../components/primitives';

const DEMO_ACCOUNTS = [
  { email: 'admin@freshbowl.demo', role: 'admin' as const },
  { email: 'operator@freshbowl.demo', role: 'operator' as const },
  { email: 'lab@freshbowl.demo', role: 'lab_tech' as const },
  { email: 'supervisor@freshbowl.demo', role: 'supervisor' as const },
  { email: 'manager@freshbowl.demo', role: 'manager' as const },
  { email: 'gm@freshbowl.demo', role: 'gm' as const },
];

const DEMO_PASSWORD = 'mushroom2026';

/**
 * The mark from the Mushroom OS build the factory already has, inline rather than linked.
 * Inline because it is the first thing drawn: an icon font that has not arrived yet renders its
 * ligature as raw text, which is exactly the wrong first impression.
 */
function MushroomMark() {
  return (
    <svg viewBox="0 0 32 32" width="34" height="34" fill="var(--on-accent)" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M16 3C9.4 3 4 8.2 4 14.6c0 1.3 1.1 2.4 2.4 2.4h19.2c1.3 0 2.4-1.1 2.4-2.4C28 8.2 22.6 3 16 3ZM8.2 9.6a2 2 0 1 0 4 0a2 2 0 1 0-4 0ZM17.05 7.6a1.35 1.35 0 1 0 2.7 0a1.35 1.35 0 1 0-2.7 0ZM21 12.2a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0ZM13.15 13.4a1.05 1.05 0 1 0 2.1 0a1.05 1.05 0 1 0-2.1 0Z"
      />
      <path d="M12.9 19.1h6.2l-.7 7.3a2.5 2.5 0 0 1-5 0l-.5-7.3Z" />
    </svg>
  );
}

export function SignIn() {
  const { session, role, loading } = useAuth();
  const [email, setEmail] = useState('admin@freshbowl.demo');
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (!loading && session && role) return <Navigate to={ROLE_HOME[role]} replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await signIn(email, password);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    navigate('/');
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/*
          THE FIRST SCREEN ANYONE SEES, so it says who this is for and nothing else.

          It used to read "Fresh Bowl Horticulture · compost operations · PROCESS-2026B" and close
          with "Real Supabase Auth. The role is carried as a signed claim in the access token."
          Both were true and both were written for an engineer. `PROCESS-2026B` is an internal
          definition code; the second sentence describes how the login is implemented. Neither
          means anything to the person holding the phone.
        */}
        <div className="flex flex-col items-center gap-3 text-center">
          <span
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: 'var(--accent)' }}
          >
            <MushroomMark />
          </span>
          <div>
            <h1 className="font-head text-[28px] font-800 leading-none tracking-tight">
              Mushroom OS
            </h1>
            <p className="mt-1.5 text-[14px] font-500" style={{ color: 'var(--muted)' }}>
              Fresh Bowl Horticulture
            </p>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="mt-7 border p-5"
          style={{
            borderColor: 'var(--line)',
            background: 'var(--surface)',
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="font-head text-[11px] font-600 uppercase tracking-wider text-ink2">
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              className="rounded border bg-surface px-2 py-2 text-sm"
              style={{ borderColor: 'var(--line-2)', color: 'var(--ink)' }}
            />
          </label>

          <label className="mt-3 flex flex-col gap-1">
            <span className="font-head text-[11px] font-600 uppercase tracking-wider text-ink2">
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="rounded border bg-surface px-2 py-2 text-sm"
              style={{ borderColor: 'var(--line-2)', color: 'var(--ink)' }}
            />
          </label>

          {error && (
            /*
              The failure, in words a person can act on. This used to print the browser's own
              `Failed to fetch`, which is what made the app get described as "empty" — it says
              nothing about signal, nothing about the clock, and nothing about whether the work
              was lost.
            */
            <div
              className="mt-4 border px-3 py-2.5"
              style={{
                borderRadius: 12,
                borderColor: 'var(--crit)',
                background: 'var(--crit-soft)',
                color: 'var(--crit)',
              }}
            >
              <p className="font-head text-[13px] font-700">{humanError(error).title}</p>
              <p className="mt-0.5 text-[12px] leading-snug">{humanError(error).detail}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-5 w-full font-head text-[15px] font-700"
            style={{
              minHeight: 52,
              borderRadius: 999,
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-5">
          {/*
            `uppercase` on the paragraph rendered `mushroom2026` as `MUSHROOM2026`, and the password
            is case-sensitive. Anyone typing what the screen showed was rejected. The label keeps
            the styling; the value is excluded from it and marked `normal-case`.
          */}
          <p className="font-head text-[11px] font-600 tracking-wider text-muted">
            <span className="uppercase">Demo accounts · password </span>
            <span className="mono normal-case" style={{ color: 'var(--ink-2)' }}>
              {DEMO_PASSWORD}
            </span>
          </p>
          <div className="mt-2 grid gap-1">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                onClick={() => {
                  setEmail(a.email);
                  setPassword(DEMO_PASSWORD);
                }}
                className="flex items-center justify-between border px-3 text-left"
                style={{
                  minHeight: 48,
                  borderRadius: 12,
                  borderColor: 'var(--line)',
                  background: 'var(--surface)',
                }}
              >
                <span className="mono text-[12px]">{a.email}</span>
                <Chip tone="accent">{ROLE_LABEL[a.role]}</Chip>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px]" style={{ color: 'var(--muted)' }}>
            Tap an account to fill the form. These are for trying the app out.
          </p>
        </div>
      </div>
    </div>
  );
}
