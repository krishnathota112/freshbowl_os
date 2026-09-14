import type { ReactNode } from 'react';

/**
 * The title block every screen starts with.
 *
 * IT LIVES IN ITS OWN MODULE FOR A CODE-SPLITTING REASON, and the reason is worth stating because
 * it is invisible otherwise. `PageHeading` used to be exported from `AppShell.tsx`, which also
 * contains the management nav table, the theme toggle, `useAuth` and `signOut`. Ten routes import
 * `PageHeading` — including `MyWork`, the operator's screen — so every one of them pulled the whole
 * management shell in with it.
 *
 * That is what defeated `C-FIELD`'s bundle requirement. Both shells are lazily loaded in `App.tsx`, so
 * `AppShell` gets a chunk of its own — but while `MyWork` imported `PageHeading` from it, the operator's
 * route chunk depended on that chunk and pulled the management nav table down with the screen.
 * Splitting the file is the fix, and `tests/fieldShell.test.ts` asserts no field chunk reaches
 * `AppShell`.
 *
 * Nothing about the component changed.
 */
export function PageHeading({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-head text-xl font-800 tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
