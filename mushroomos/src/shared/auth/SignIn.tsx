import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { APP_ROLES, ROLE_HOME, ROLE_LABEL, isNativeApp, roleAllowedHere, signIn, signOut, useAuth } from './auth';
import type { AppRole } from '../../domain/types';
import { humanError } from '../utils/humanError';
import { Chip } from '../ui/primitives';

const ALL_DEMO_ACCOUNTS = [
  { email: 'admin@freshbowl.demo', role: 'admin' as const },
  { email: 'operator@freshbowl.demo', role: 'operator' as const },
  { email: 'lab@freshbowl.demo', role: 'lab_tech' as const },
  { email: 'supervisor@freshbowl.demo', role: 'supervisor' as const },
  { email: 'manager@freshbowl.demo', role: 'manager' as const },
  { email: 'gm@freshbowl.demo', role: 'gm' as const },
];

// The Android app offers only its three logins; the web keeps every account.
const DEMO_ACCOUNTS = isNativeApp()
  ? ALL_DEMO_ACCOUNTS.filter((a) => APP_ROLES.includes(a.role))
  : ALL_DEMO_ACCOUNTS;

// The quick-fill list and its password are for the phone app and local development only. A page
// served on a public link (tunnel / hosting) shows a plain sign-in form.
// 15 Sep 2026 · a shipped build never shows accounts or a password: the APK printed every login, Admin and GM
// included, on its sign-in page. Only a local development server (npm run dev) keeps the quick-fill list.
const SHOW_DEMO_ACCOUNTS = import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(window.location.hostname);

/** Shown when an account the Android app does not serve is signed in on the phone. */
export function RoleNotInApp({ role }: { role: AppRole }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-12">
      <div className="mos-card w-full max-w-md space-y-4 border border-line p-6 shadow-card">
        <p className="font-head text-[18px] font-extrabold text-ink">
          {ROLE_LABEL[role]} accounts use the web
        </p>
        <p className="text-[14px] text-ink-2">
          This app is for Supervisor, Lab and General Manager. Sign out and sign in with one of those
          accounts, or open MushroomOS in a browser.
        </p>
        <button
          type="button"
          onClick={async () => {
            try {
              await signOut();
            } finally {
              window.location.href = '/sign-in';
            }
          }}
          className="w-full rounded-xl py-3.5 font-head text-[15px] font-bold"
          style={{ background: 'var(--accent)', color: '#ffffff' }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

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
  const [email, setEmail] = useState(SHOW_DEMO_ACCOUNTS ? (DEMO_ACCOUNTS[0]?.email ?? '') : '');
  const [password, setPassword] = useState(SHOW_DEMO_ACCOUNTS ? DEMO_PASSWORD : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (!loading && session && role && !roleAllowedHere(role)) return <RoleNotInApp role={role} />;
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
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-12 page-in">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl shadow-card"
            style={{ background: 'linear-gradient(135deg, #16794a 0%, #1a9c62 100%)' }}
          >
            <MushroomMark />
          </div>
          <div>
            <h1 className="font-head text-[30px] font-extrabold tracking-tight text-ink">
              Mushroom OS
            </h1>
            <p className="mt-1 text-[13px] font-semibold text-muted tracking-wide uppercase">
              Fresh Bowl Horticulture Operations
            </p>
          </div>
        </div>

        {/* Login Form */}
        <form
          onSubmit={submit}
          className="mos-card p-6 border border-line space-y-4 shadow-card"
        >
          <div className="space-y-1">
            <span className="label-caps text-muted">
              Account Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              className="w-full rounded-xl border bg-surface px-3.5 py-3 font-mono text-sm transition-all focus:outline-none focus:ring-2 focus:ring-accent/30"
              style={{ borderColor: 'var(--line-2)', color: 'var(--ink)' }}
            />
          </div>

          <div className="space-y-1">
            <span className="label-caps text-muted">
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-xl border bg-surface px-3.5 py-3 font-mono text-sm transition-all focus:outline-none focus:ring-2 focus:ring-accent/30"
              style={{ borderColor: 'var(--line-2)', color: 'var(--ink)' }}
            />
          </div>

          {error && (
            <div
              className="rounded-xl border p-3.5"
              style={{
                borderColor: 'var(--crit)',
                background: 'var(--crit-soft)',
                color: 'var(--crit)',
              }}
            >
              <p className="font-head text-[13px] font-bold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base">error</span>
                {humanError(error).title}
              </p>
              <p className="mt-1 text-[12px] leading-snug">{humanError(error).detail}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full font-head text-[15px] font-bold py-3.5 rounded-xl transition-all shadow-card tappable flex items-center justify-center gap-2"
            style={{
              background: 'linear-gradient(135deg, #16794a 0%, #1a9c62 100%)',
              color: '#ffffff',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Signing in…
              </>
            ) : (
              <>
                <span>Sign in to Mushroom OS</span>
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </>
            )}
          </button>
        </form>

        {/* Demo Account Quick-Fill */}
        {SHOW_DEMO_ACCOUNTS && (
        <div className="mos-card p-5 border border-line space-y-3 shadow-card">
          <div className="flex items-center justify-between">
            <span className="label-caps text-muted">Demo Accounts</span>
            <span className="font-mono text-[11px] text-muted">Password: <strong className="text-ink">{DEMO_PASSWORD}</strong></span>
          </div>
          <div className="grid gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword(DEMO_PASSWORD);
                }}
                className="flex items-center justify-between border px-3.5 py-2.5 rounded-xl text-left transition-all hover:border-accent/40 hover:bg-surface-2 tappable"
                style={{
                  borderColor: 'var(--line)',
                  background: 'var(--surface)',
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="mos-icon-tile w-7 h-7 bg-surface-2 text-accent">
                    <span className="material-symbols-outlined text-sm">person</span>
                  </div>
                  <span className="font-mono text-[12px] font-semibold text-ink">{a.email}</span>
                </div>
                <Chip tone="accent">{ROLE_LABEL[a.role]}</Chip>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted text-center pt-1">
            Select an account above to test role-specific workflows.
          </p>
        </div>
        )}
      </div>
    </div>

  );
}
