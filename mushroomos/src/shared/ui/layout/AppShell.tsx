import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ROLE_LABEL, isNativeApp, signOut, useAuth } from '../../auth/auth';
import { Chip } from '../primitives';
import { isTimeTravelled, timeTravelOffsetMs } from '../../utils/now';

/**
 * The management shell (25 Sep 2026 redesign): a light sidebar with the navigation grouped by job,
 * a calm content area, and a compact top bar on narrow screens. Light only — the owner asked for
 * "clean and neat, not dark"; a device that stored the old dark choice is reset to light.
 */
type Item = { to: string; label: string; icon: keyof typeof ICON };
type Group = { title: string; items: Item[] };

// Android app: only the role's own screens (operating flow §8).
const NAV_APP: Record<string, Item[]> = {
  supervisor: [{ to: '/operator/my-work', label: 'My Work', icon: 'work' }],
  lab_tech: [{ to: '/lab/queue', label: 'Lab Queue', icon: 'lab' }],
  gm: [
    { to: '/lab/approvals', label: 'Approvals', icon: 'lab' },
    { to: '/gm/progress', label: 'Progress', icon: 'home' },
    { to: '/gm/people', label: 'People', icon: 'people' },
  ],
};

const NAV: Record<string, Group[]> = {
  admin: [
    { title: 'Today', items: [
      { to: '/admin', label: 'Home', icon: 'home' },
      { to: '/admin/now', label: 'Now', icon: 'now' },
      { to: '/admin/today', label: 'Daily checks', icon: 'check' },
    ] },
    { title: 'Batches', items: [
      { to: '/admin/batches', label: 'Batches', icon: 'batch' },
      { to: '/admin/simulate', label: 'Simulation', icon: 'sim' },
      { to: '/admin/schedule', label: 'Monthly schedule', icon: 'calendar' },
    ] },
    { title: 'Process', items: [
      { to: '/admin/sop', label: 'SOP', icon: 'sop' },
      { to: '/admin/process-explorer', label: 'Process steps', icon: 'steps' },
    ] },
    { title: 'Floor', items: [
      { to: '/admin/resources', label: 'Bunkers & tunnels', icon: 'floor' },
      { to: '/admin/tickets', label: 'Tickets', icon: 'ticket' },
    ] },
    { title: 'Team', items: [
      { to: '/gm/people', label: 'People', icon: 'people' },
      { to: '/admin/logins', label: 'Logins', icon: 'key' },
      { to: '/admin/reference', label: 'Reference data', icon: 'book' },
    ] },
  ],
  gm: [
    { title: 'Today', items: [
      { to: '/gm/progress', label: 'Progress', icon: 'home' },
      { to: '/admin/now', label: 'Now', icon: 'now' },
      { to: '/lab/approvals', label: 'Lab approvals', icon: 'lab' },
    ] },
    { title: 'Batches', items: [
      { to: '/admin/batches', label: 'Batches', icon: 'batch' },
      { to: '/admin/simulate', label: 'Simulation', icon: 'sim' },
      { to: '/admin/schedule', label: 'Monthly schedule', icon: 'calendar' },
    ] },
    { title: 'Process', items: [
      { to: '/admin/sop', label: 'SOP', icon: 'sop' },
      { to: '/admin/process-explorer', label: 'Process steps', icon: 'steps' },
    ] },
    { title: 'Team', items: [{ to: '/gm/people', label: 'People', icon: 'people' }] },
  ],
  manager: [
    { title: 'Batches', items: [
      { to: '/admin/batches', label: 'Batches', icon: 'batch' },
      { to: '/gm/progress', label: 'Progress', icon: 'home' },
    ] },
  ],
  supervisor: [
    { title: 'Work', items: [
      { to: '/operator/my-work', label: 'My Work', icon: 'work' },
      { to: '/admin/batches', label: 'Batches', icon: 'batch' },
      { to: '/admin/process-explorer', label: 'Process', icon: 'steps' },
    ] },
  ],
  operator: [{ title: 'Work', items: [{ to: '/operator/my-work', label: 'My Work', icon: 'work' }] }],
  lab_tech: [{ title: 'Lab', items: [{ to: '/lab/queue', label: 'Lab Queue', icon: 'lab' }] }],
};

const ICON = {
  home: 'M4 11l8-6 8 6v8a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1z',
  now: 'M12 7v5l3 2M12 21a9 9 0 110-18 9 9 0 010 18z',
  check: 'M9 12l2 2 4-4M5 4h14v16H5z',
  batch: 'M4 7h16M4 12h16M4 17h10',
  sim: 'M5 4l14 8-14 8z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5',
  sop: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  steps: 'M4 6h6M4 12h10M4 18h14M16 4v4M18 10v4',
  floor: 'M3 20V9l6-4 6 4v11M15 12h6v8M3 20h18',
  ticket: 'M4 7h16v4a2 2 0 000 4v4H4v-4a2 2 0 000-4zM10 7v12',
  people: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 0112 0v1M17 11a3 3 0 100-6M22 21v-1a5 5 0 00-4-4.9',
  key: 'M15 7a4 4 0 11-3.9 5H8v3H5v-3H3v-3h8.1A4 4 0 0115 7z',
  book: 'M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h11',
  work: 'M9 6V4h6v2M4 7h16v12H4zM4 12h16',
  lab: 'M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3',
} as const;

function Icon({ name }: { name: keyof typeof ICON }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON[name]} />
    </svg>
  );
}

/** The mark: a mushroom cap and stem, drawn in the accent. */
function Mark() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M3 15C3 8 9 3 16 3s13 5 13 12c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2z" fill="var(--accent)" />
      <circle cx="10" cy="10" r="1.8" fill="var(--accent-soft)" />
      <circle cx="17" cy="7.5" r="1.4" fill="var(--accent-soft)" />
      <circle cx="22" cy="11" r="1.6" fill="var(--accent-soft)" />
      <path d="M12 17h8l-1 10a2 2 0 01-2 2h-2a2 2 0 01-2-2z" fill="var(--surface-3)" stroke="var(--line-2)" />
    </svg>
  );
}

function useLightTheme() {
  useEffect(() => {
    document.documentElement.dataset.theme = 'light';
    try { localStorage.setItem('mushroomos.theme', 'light'); } catch { /* private mode */ }
  }, []);
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

const doSignOut = async () => {
  try {
    await signOut();
  } finally {
    window.location.href = '/sign-in';
  }
};

export function AppShell({ children }: { children: ReactNode }) {
  const { role, displayName, roleSource } = useAuth();
  useLightTheme();
  const online = useOnline();
  const groups: Group[] = role
    ? isNativeApp()
      ? [{ title: '', items: NAV_APP[role] ?? [] }]
      : (NAV[role] ?? [])
    : [];
  const flat = groups.flatMap((g) => g.items);

  const status = (
    <>
      {!online && <Chip tone="warn">offline</Chip>}
      {isTimeTravelled() && (
        <span className="inline-flex items-center rounded-full px-2.5 font-head text-[10px] font-700 uppercase tracking-wider"
              style={{ minHeight: 26, background: 'var(--warn-soft)', color: 'var(--warn)' }}
              title={`The factory clock is set forward or back by ${Math.round(timeTravelOffsetMs() / 3_600_000)} hours. Times on screen are not live.`}>
          demo clock
        </span>
      )}
    </>
  );

  return (
    <div className="flex min-h-full" style={{ background: 'var(--paper)' }}>
      {/* Sidebar — wide screens. */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r lg:flex"
             style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-3 px-5 pt-5 pb-4">
          <Mark />
          <div className="leading-tight">
            <div className="font-display text-[19px] font-600">MushroomOS</div>
            <div className="text-[11px] text-muted">Freshbowl compost</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
          {groups.map((g) => (
            <div key={g.title} className="mt-4 first:mt-1">
              {g.title && <div className="px-3 pb-1.5 text-[10.5px] font-700 uppercase tracking-[0.12em] text-muted">{g.title}</div>}
              {g.items.map((n) => (
                <NavLink key={n.to} to={n.to} end
                         className="mb-0.5 flex items-center gap-3 rounded-lg px-3 text-[14px] font-600 no-underline transition-colors"
                         style={({ isActive }) => ({
                           minHeight: 40,
                           background: isActive ? 'var(--accent-soft)' : 'transparent',
                           color: isActive ? 'var(--accent-ink)' : 'var(--ink-2)',
                         })}>
                  <Icon name={n.icon} />
                  {n.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t px-4 py-4" style={{ borderColor: 'var(--line)' }}>
          <div className="mb-3 flex flex-wrap items-center gap-2">{status}</div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-700"
                 style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
              {(displayName ?? '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[13px] font-600">{displayName ?? 'Signed in'}</div>
              {role && (
                <div className="text-[11px]" style={{ color: roleSource === 'claim' ? 'var(--muted)' : 'var(--warn)' }}
                     title={roleSource === 'claim' ? 'Role read from the signed access token' : 'Role read from profiles — the access-token hook is not enabled'}>
                  {ROLE_LABEL[role]}
                </div>
              )}
            </div>
            <button type="button" onClick={doSignOut} className="rounded-lg px-2 text-[12px] font-600 text-muted" style={{ minHeight: 36 }}>Sign out</button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* A setup note for developers, not for factory users. */}
        {import.meta.env.DEV && roleSource === 'profile' && (
          <div className="px-4 py-1.5 text-[12px]" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
            Role is being read from <span className="mono">profiles</span>, not from the token. Enable the Customize Access Token hook
            (<span className="mono">public.custom_access_token_hook</span>) to make the claim authoritative.
          </div>
        )}

        {/* Top bar — narrow screens. */}
        <header className="sticky top-0 z-10 flex flex-col gap-2 border-b px-4 py-2 lg:hidden" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
          <div className="flex items-center gap-2">
            <Mark />
            <span className="font-display text-[17px] font-600">MushroomOS</span>
            <div className="ml-auto flex items-center gap-2">
              {status}
              <button type="button" onClick={doSignOut} className="rounded-lg border px-3 text-[12px] font-600" style={{ minHeight: 40, borderColor: 'var(--line-2)' }}>Sign out</button>
            </div>
          </div>
          <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="Main">
            {flat.map((n) => (
              <NavLink key={n.to} to={n.to} end
                       className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-[13px] font-600"
                       style={({ isActive }) => ({ minHeight: 40, background: isActive ? 'var(--accent-soft)' : 'transparent', color: isActive ? 'var(--accent-ink)' : 'var(--ink-2)' })}>
                <Icon name={n.icon} />{n.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
