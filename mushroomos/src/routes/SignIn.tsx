import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ROLE_HOME, ROLE_LABEL, signIn, useAuth } from '../lib/auth';
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
        <h1 className="font-head text-2xl font-800 tracking-tight">MushroomOS</h1>
        <p className="mt-1 text-sm text-muted">
          Fresh Bowl Horticulture · compost operations · <span className="mono">PROCESS-2026B</span>
        </p>

        <form
          onSubmit={submit}
          className="mt-6 rounded-md border p-4"
          style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
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
            <p
              className="mt-3 rounded border px-2 py-1.5 text-[12px]"
              style={{
                borderColor: 'var(--crit)',
                background: 'var(--crit-soft)',
                color: 'var(--crit)',
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-4 w-full rounded px-3 py-3 font-head text-sm font-700"
            style={{ background: 'var(--accent)', color: '#fff', opacity: busy ? 0.6 : 1 }}
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
                className="flex items-center justify-between rounded border px-2 py-1.5 text-left"
                style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
              >
                <span className="mono text-[12px]">{a.email}</span>
                <Chip tone="accent">{ROLE_LABEL[a.role]}</Chip>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted">
            Real Supabase Auth. The role is carried as a signed claim in the access token, so
            editing browser storage changes nothing.
          </p>
        </div>
      </div>
    </div>
  );
}
