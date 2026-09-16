import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ROLE_LABEL, isNativeApp, signOut, useAuth } from '../../auth/auth';

const NAV_APP: Record<string, { to: string; label: string }[]> = {
  supervisor: [{ to: '/operator/my-work', label: 'My Work' }],
  lab_tech: [{ to: '/lab/queue', label: 'Lab Queue' }],
  gm: [
    { to: '/lab/approvals', label: 'Approvals' },
    { to: '/gm/progress', label: 'Progress' },
    { to: '/gm/people', label: 'People' },
  ],
};
import { Chip } from '../primitives';
import { isTimeTravelled, timeTravelOffsetMs } from '../../utils/now';

// Less-used screens sit under "More" so the main menu stays short (15 Sep 2026).
const NAV_MORE: Record<string, { to: string; label: string }[]> = {
  admin: [
    { to: '/admin/today', label: 'Today (checks)' },
    { to: '/admin/schedule', label: 'Monthly schedule' },
    { to: '/admin/process-explorer', label: 'Process steps' },
    { to: '/admin/reference', label: 'Reference data' },
  ],
  gm: [
    { to: '/admin/schedule', label: 'Monthly schedule' },
    { to: '/admin/process-explorer', label: 'Process steps' },
  ],
};

const NAV: Record<string, { to: string; label: string }[]> = {
  admin: [
    { to: '/admin', label: 'Home' },
    { to: '/admin/now', label: 'Now' },
    { to: '/admin/batches', label: 'Batches' },
    { to: '/admin/resources', label: 'Resources' },
    { to: '/admin/tickets', label: 'Tickets' },
    { to: '/gm/people', label: 'People' },
    { to: '/admin/logins', label: 'Logins' },
  ],
  operator: [{ to: '/operator/my-work', label: 'My Work' }],
  lab_tech: [{ to: '/lab/queue', label: 'Lab Queue' }],
  supervisor: [
    { to: '/operator/my-work', label: 'My Work' },
    { to: '/admin/batches', label: 'Batches' },
    { to: '/admin/process-explorer', label: 'Process' },
  ],
  manager: [
    { to: '/admin/batches', label: 'Batches' },
    { to: '/gm/progress', label: 'Progress' },
  ],
  gm: [
    { to: '/gm/progress', label: 'Progress' },
    { to: '/admin/now', label: 'Now' },
    { to: '/lab/approvals', label: 'Approvals' },
    { to: '/gm/people', label: 'People' },
    { to: '/admin/batches', label: 'Batches' },
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
  // Android app: only the role's own screens (operating flow §8). The web keeps the full table.
  const nav = role
    ? isNativeApp()
      ? (NAV_APP[role] ?? [])
      : (NAV[role] ?? [])
    : [];

  return (
    <div className="flex min-h-full flex-col">
      {/* A setup note for developers, not for factory users. */}
      {import.meta.env.DEV && roleSource === 'profile' && (
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
        <span className="font-head text-[16px] font-800 tracking-tight">MushroomOS</span>

        <nav className="-mx-1 flex min-w-0 max-w-full items-center gap-1 overflow-x-auto px-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end
              className="inline-flex shrink-0 items-center whitespace-nowrap rounded-lg px-3 font-head text-[14px] font-600"
              style={({ isActive }) =>
                isActive
                  ? { minHeight: 44, background: 'var(--accent-soft)', color: 'var(--accent-ink)' }
                  : { minHeight: 44, color: 'var(--ink-2)' }
              }
            >
              {n.label}
            </NavLink>
          ))}
          {role && !isNativeApp() && (NAV_MORE[role]?.length ?? 0) > 0 && (
            <details className="relative shrink-0">
              <summary
                className="inline-flex cursor-pointer list-none items-center rounded-lg px-3 font-head text-[14px] font-600"
                style={{ minHeight: 44, color: 'var(--ink-2)' }}
              >
                More ▾
              </summary>
              <div
                className="absolute left-0 z-20 mt-1 grid min-w-[200px] gap-0.5 rounded-xl border p-1 shadow-card"
                style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
              >
                {NAV_MORE[role].map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    className="rounded-lg px-3 py-2 text-[14px] no-underline"
                    style={({ isActive }) => ({ color: isActive ? 'var(--accent-ink)' : 'var(--ink)', background: isActive ? 'var(--accent-soft)' : 'transparent' })}
                    onClick={(e) => (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open')}
                  >
                    {n.label}
                  </NavLink>
                ))}
              </div>
            </details>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
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
          {displayName && <span className="hidden text-[13px] text-muted sm:inline">{displayName}</span>}
          {isTimeTravelled() && (
            <span
              className="inline-flex items-center rounded-full px-2.5 font-head text-[10px] font-700 uppercase tracking-wider"
              style={{ minHeight: 28, background: 'var(--warn-soft)', color: 'var(--warn)' }}
              title={`The factory clock is set forward or back by ${Math.round(
                timeTravelOffsetMs() / 3_600_000
              )} hours. Times on screen are not live.`}
            >
              demo clock
            </span>
          )}
          <button
            onClick={toggle}
            className="inline-flex items-center rounded border px-3 font-head text-[11px] font-600"
            style={{ minHeight: 44, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
          >
            {theme === 'light' ? 'Dark' : 'Light'}
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await signOut();
              } finally {
                window.location.href = '/sign-in';
              }
            }}
            className="inline-flex items-center rounded border px-3 font-head text-[11px] font-600 cursor-pointer"
            style={{ minHeight: 44, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5">{children}</main>
    </div>
  );
}
