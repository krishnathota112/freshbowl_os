import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROLE_LABEL, signOut, useAuth } from '../../lib/auth';

/**
 * FieldShell — the operator and lab-technician counterpart to `AppShell`.
 * `BUILD_SEQUENCE_KIRO.md §C-FIELD`, `UI_DESIGN_SPEC.md §4.1`, `UI_COMPONENT_ARCHITECTURE.md §6`.
 *
 * ONE APPLICATION. This is a second SHELL, not a second app: same Vite entry, same `index.html`,
 * same `supabase` client, same `useAuth`, same tokens, same primitives. `UI_ACCEPTANCE_CRITERIA §E`
 * item 8 fails the workstream for "a second design system, a second application, or a role-specific
 * fork of a shared screen", and none of those happens here — the SCREENS are shared, only the chrome
 * around them differs. §C-FIELD chose this over splitting after the client confirmed reliable
 * realtime internet and ~30 users.
 *
 * §C-FIELD specifies it by five properties, four of them negative:
 *
 *   one task on screen    a single centred column, no grid, no side rail. `UI_COMPONENT_ARCHITECTURE
 *                         §6`: "A desktop operator gets a centred single column, not a rebuilt
 *                         layout."
 *   ≥48 px targets        both controls this shell owns are 48 px tall. `UI_DESIGN_SPEC §4.1`.
 *   NO nav bar            there is no `NavLink` in this file and no route table. An operator has one
 *                         screen; a link to a second place is a link to somewhere they cannot go.
 *   NO theme toggle       and it does not set a theme either — see below.
 *   persistent offline    a chip that stays on screen for as long as the condition lasts, never a
 *   chip                  modal. `UI_DESIGN_SPEC §4.1`.
 *
 * WHAT IS DELIBERATELY NOT HERE, and why, because each of these is a silence in the documents rather
 * than an instruction:
 *
 *   · No `document.documentElement.dataset.theme` write. `AppShell`'s `useTheme` owns that, and a
 *     shell with no toggle has nothing to persist. Whatever theme is set stays set — `index.html`
 *     ships `data-theme="light"`, so a field user who has never seen a toggle gets light. Setting it
 *     here would mean two writers of one attribute, and the second one to mount would win.
 *   · No role-claim banner. `AppShell` carries one because an admin can act on it; an operator
 *     cannot, and `0015_role_claim.sql` has since made it dormant everywhere.
 *   · No process code. `AppShell` prints `PROCESS-2026B` in its header; that is a material-free
 *     definition code hard-coded into chrome, and it is not being copied into a second file.
 *   · No back affordance. The field surface is one screen today. The route that needs one is S9,
 *     `/operator/task/:id`, which belongs to C6 and does not exist yet — a back button to nowhere
 *     would be placeholder chrome.
 *
 * WHAT IS HERE BESIDES THE TASK: who is signed in, and a way out. Sign-out is an account action, not
 * navigation, and an operator handing a shared phone to the next shift needs it. Naming the person
 * matters more here than anywhere else in the product, because everything they submit is recorded
 * against them.
 */

/**
 * The browser's own view of connectivity, and nothing more.
 *
 * `navigator.onLine` is a local signal: it says the device has a network interface, not that Supabase
 * is reachable. That is why the chip states the consequence rather than a status — "you are offline"
 * is only useful if it says what will happen next.
 *
 * OFFLINE IS OUT OF SCOPE (§C-FIELD, `ARCHITECTURE_V2 §5` as of 22 Aug 2026). There is no queue, no
 * IndexedDB cache and no blob capture behind this chip. It exists so that a submit which is going to
 * fail is explained BEFORE it fails, not so that work continues without a network.
 */
function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
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

/** 48 px, per `UI_DESIGN_SPEC §4.1`. Written once so the two controls cannot drift apart. */
const TARGET_PX = 48;

export function FieldShell({ children }: { children: ReactNode }) {
  const { role, displayName } = useAuth();
  const online = useOnline();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-full flex-col" style={{ background: 'var(--paper)' }}>
      {/*
        Sticky, so it is still there after scrolling a long task. A persistent chip is the specified
        treatment; a modal would block the very screen the operator is trying to finish.
      */}
      {!online && (
        <div
          className="sticky top-0 z-20 flex items-center gap-2 px-4 py-2 text-[15px] font-600"
          style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}
          role="status"
        >
          <span aria-hidden>⚠</span>
          <span>Offline — a submission will not save until this clears.</span>
        </div>
      )}

      <header
        className="flex items-center gap-3 border-b px-4 py-2"
        style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
      >
        {/* Whose session this is. Everything submitted is recorded against this person. */}
        <div className="min-w-0">
          <p className="truncate font-head text-[15px] font-700 leading-tight">
            {displayName ?? 'Signed in'}
          </p>
          {role && <p className="text-[13px] leading-tight text-muted">{ROLE_LABEL[role]}</p>}
        </div>

        <button
          onClick={async () => {
            await signOut();
            navigate('/sign-in');
          }}
          className="ml-auto rounded-md border px-4 font-head text-[15px] font-600"
          style={{ borderColor: 'var(--line-2)', color: 'var(--ink-2)', minHeight: TARGET_PX }}
        >
          Sign out
        </button>
      </header>

      {/*
        ONE COLUMN. `max-w-[560px]` and `mx-auto` together are what make a desktop operator get a
        centred single column rather than a stretched one, per §6. `min-w-0` on the header above and
        `overflow-x-hidden` here are the two places a long unbroken string could otherwise push the
        page sideways — criterion 49 and E.10 forbid horizontal page scroll at 375 px in any state.
      */}
      <main className="mx-auto w-full max-w-[560px] flex-1 overflow-x-hidden px-4 py-4">
        {children}
      </main>
    </div>
  );
}
