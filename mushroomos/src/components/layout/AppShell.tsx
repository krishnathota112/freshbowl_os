import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ROLE_LABEL, signOut, useAuth } from '../../lib/auth';
import { Chip } from '../primitives';

const NAV: Record<string, { to: string; label: string }[]> = {
  admin: [
    { to: '/admin/today', label: 'Today' },
    { to: '/admin/batches', label: 'Batches' },
    { to: '/admin/batch/new', label: '+ New Batch' },
    { to: '/operator/my-work', label: 'Tasks' },
    { to: '/admin/process-explorer', label: 'Process' },
    { to: '/admin/reference', label: 'Reference' },
    { to: '/dev/gallery', label: 'Gallery' },
  ],
  operator: [{ to: '/operator/my-work', label: 'My Work' }],
  lab_tech: [{ to: '/lab/queue', label: 'Lab Queue' }],
  supervisor: [
    { to: '/supervisor/control-room', label: 'Control Room' },
    { to: '/admin/batches', label: 'Batches' },
    { to: '/operator/my-work', label: 'Tasks' },
    { to: '/admin/process-explorer', label: 'Process' },
  ],
  manager: [
    { to: '/manager/resources', label: 'Resources' },
    { to: '/admin/batches', label: 'Batches' },
  ],
  gm: [
    // S1's name, and its real route. The nav pointed at `/gm/command-center` — which still
    // resolves, because it is kept as a redirect for the GM's bookmark — but sending every
    // in-app click through a redirect, under the screen's PREVIOUS name, is how a rename stays
    // half-done forever.
    { to: '/gm/control-tower', label: 'Control Tower' },
    { to: '/admin/batches', label: 'Batches' },
    { to: '/admin/process-explorer', label: 'Process' },
  ],
};

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (localStorage.getItem('mushroomos.theme') as 'light' | 'dark') ?? 'light'
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('mushroomos.theme', theme);
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')) };
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { role, displayName, roleSource } = useAuth();
  const { theme, toggle } = useTheme();
  const online = useOnline();
  const navigate = useNavigate();
  const nav = role ? NAV[role] ?? [] : [];

  return (
    <div className="flex min-h-full flex-col">
      {/*
        Stated plainly rather than hidden. The routing role is coming from profiles because
        the access-token hook is not switched on yet; RLS still reads only the claim, so
        role-scoped writes are refused for everyone until it is.
      */}
      {roleSource === 'profile' && (
        <div
          className="flex flex-wrap items-center gap-2 px-4 py-1.5 text-[12px]"
          style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}
        >
          <span aria-hidden>⚠</span>
          <span>
            Role is being read from <span className="mono">profiles</span>, not from the token.
            Enable <span className="mono">Authentication → Hooks → Customize Access Token</span> and
            point it at <span className="mono">public.custom_access_token_hook</span> to make the
            claim authoritative. Routing works either way; role-scoped writes stay refused until
            it is on.
          </span>
        </div>
      )}
      <header
        className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2"
        style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
      >
        <span className="font-head text-sm font-800 tracking-tight">MushroomOS</span>
        <span className="mono text-[11px] text-muted">PROCESS-2026B</span>

        <nav className="flex flex-wrap items-center gap-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className="rounded px-2 py-1 font-head text-[12px] font-600"
              style={({ isActive }) =>
                isActive
                  ? { background: 'var(--accent-soft)', color: 'var(--accent-ink)' }
                  : { color: 'var(--ink-2)' }
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Offline state is a persistent chip, never a modal. */}
          {!online && <Chip tone="warn">offline</Chip>}
          {role && (
            <Chip
              tone={roleSource === 'claim' ? 'accent' : 'warn'}
              title={
                roleSource === 'claim'
                  ? 'Role read from the signed access token'
                  : 'Role read from profiles — the access-token hook is not enabled'
              }
            >
              {ROLE_LABEL[role]}
            </Chip>
          )}
          {displayName && <span className="text-[12px] text-muted">{displayName}</span>}
          <button
            onClick={toggle}
            className="rounded border px-2 py-1 font-head text-[11px] font-600"
            style={{ borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
          >
            {theme === 'light' ? 'Dark' : 'Light'}
          </button>
          <button
            onClick={async () => {
              await signOut();
              navigate('/sign-in');
            }}
            className="rounded border px-2 py-1 font-head text-[11px] font-600"
            style={{ borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5">{children}</main>
    </div>
  );
}

/**
 * `PageHeading` MOVED to `./PageHeading.tsx`.
 *
 * It is not re-exported from here on purpose. Ten routes import it, `MyWork` among them, and a
 * re-export would keep every one of them pulling this file — the nav table, the theme toggle,
 * `useAuth`, `signOut` — into their chunk. That is exactly what `C-FIELD`'s bundle requirement
 * forbids for the field entry. See the module header of `PageHeading.tsx`.
 */
