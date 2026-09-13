import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ROLE_LABEL, signOut, useAuth } from '../../lib/auth';
import { Chip } from '../primitives';
import { isTimeTravelled, timeTravelOffsetMs } from '../../lib/now';

const NAV: Record<string, { to: string; label: string }[]> = {
  admin: [
    { to: '/admin', label: 'Home' },
    { to: '/admin/today', label: 'Today' },
    { to: '/admin/batches', label: 'Batches' },
    { to: '/admin/schedule', label: 'Schedule' },
    { to: '/admin/batch/start', label: '+ New Batch' },
    /*
      `Tasks` (→ /operator/my-work) used to sit here. Every button on that screen is refused for an
      admin: `start_activity` and `submit_activity` require operator, supervisor or lab_tech, and
      answer an admin with a 403. A menu item whose every action fails is not access, it is a trap.
      An admin assigns work (Prepare → "Who is doing the work?", or the batch schedule); they do
      not perform it.
    */
    { to: '/admin/process-explorer', label: 'Process' },
    { to: '/admin/reference', label: 'Reference' },
    /*
      `/dev/gallery` used to sit here. It is a component gallery for developers, it is excluded
      from production builds entirely, and a factory admin clicking it lands on a page of sample
      widgets. It is reachable by typing the address in a dev build, which is who it is for.
    */
  ],
  operator: [{ to: '/operator/my-work', label: 'My Work' }],
  lab_tech: [{ to: '/lab/queue', label: 'Lab Queue' }],
  /*
    THE SUPERVISOR DECIDES LAB WORK, so the lab screens are theirs.

    The server lets a supervisor accept a lab result as final (`accept_lab_result`) and decide a lab
    submission (`decide_lab_submission`, while C-32 is open). Neither screen was in this menu, so the
    person who opens production gates had to know the URL. The Lab Queue is included because a
    supervisor may also take the sample — the route already allows it.
  */
  supervisor: [
    { to: '/supervisor/control-room', label: 'Control Room' },
    { to: '/lab/approvals', label: 'Lab Approvals' },
    { to: '/lab/queue', label: 'Lab Queue' },
    { to: '/admin/batches', label: 'Batches' },
    { to: '/operator/my-work', label: 'Tasks' },
    { to: '/admin/process-explorer', label: 'Process' },
  ],
  manager: [
    { to: '/manager/resources', label: 'Resources' },
    { to: '/admin/batches', label: 'Batches' },
  ],
  gm: [
    { to: '/gm/control-tower', label: 'Control Tower' },
    { to: '/plant', label: 'Plant' },
    // The GM is one of the two roles C-32 lets decide a lab submission — see `lab_approval_reading`.
    { to: '/lab/approvals', label: 'Lab Approvals' },
    { to: '/admin/batches', label: 'Batches' },
    { to: '/admin/schedule', label: 'Schedule' },
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
        {/*
          The header used to print `PROCESS-2026B` beside the name, on every management screen. It
          is the internal code for the process definition — meaningful to whoever seeds the
          database and to nobody in the factory. The definition is still named on the Process
          screen, which is where someone goes to ask about it.
        */}
        <span className="text-[11px] text-muted">Fresh Bowl Horticulture</span>

        {/*
          EVERY ROLE CAN BE ON A PHONE.

          The management shell used to assume a mouse, because management meant a browser. It does
          not any more: the same build ships inside the APK and the role alone decides which screens
          a person gets, so a chairman opening the app on a phone lands here.

          These controls were 26 px tall — under half a fingertip. `min-height: 44px` is the touch
          minimum; the field shell uses 48 because an operator may be wearing gloves, and a chairman
          is not. Padding is unchanged, so nothing grows on a desktop that was already fine.
        */}
        <nav className="flex flex-wrap items-center gap-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className="inline-flex items-center rounded px-3 font-head text-[12px] font-600"
              style={({ isActive }) =>
                isActive
                  ? { minHeight: 44, background: 'var(--accent-soft)', color: 'var(--accent-ink)' }
                  : { minHeight: 44, color: 'var(--ink-2)' }
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
          {/*
            THE PRODUCT ADMITS WHEN IT IS NOT SHOWING LIVE TIME.

            The database carries a settable clock so a demo can stand at any hour of a batch's life.
            That is useful and it is also dangerous: every hour, countdown and variance on screen is
            then computed against a fabricated instant, and somebody could read a real decision off
            it. When the clock is moved, the chrome says so on every screen.
          */}
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

/**
 * `PageHeading` MOVED to `./PageHeading.tsx`.
 *
 * It is not re-exported from here on purpose. Ten routes import it, `MyWork` among them, and a
 * re-export would keep every one of them pulling this file — the nav table, the theme toggle,
 * `useAuth`, `signOut` — into their chunk. That is exactly what `C-FIELD`'s bundle requirement
 * forbids for the field entry. See the module header of `PageHeading.tsx`.
 */
