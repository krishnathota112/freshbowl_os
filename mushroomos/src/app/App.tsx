import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { ROLE_HOME, isFieldRole, pathAllowedHere, roleAllowedHere, useAuth } from '../shared/auth/auth';
import type { AppRole } from '../domain/types';
import { Skeleton } from '../shared/ui/primitives';

/**
 * BOTH SHELLS ARE LAZY, and that is what makes "chosen by role" true of the download and not only of
 * the render. Imported statically, each one would land in the entry chunk, so an operator would
 * download the management nav table — every management route, by name — to render a screen with no nav
 * bar. A field session now fetches `FieldShell` and never `AppShell`.
 *
 * The pair is declared at module scope so each is a stable component type: a `lazy()` created during
 * render would remount its subtree on every render.
 */
const AppShell = lazy(() => import('../shared/ui/layout/AppShell').then((m) => ({ default: m.AppShell })));
const FieldShell = lazy(() =>
  import('../shared/ui/layout/FieldShell').then((m) => ({ default: m.FieldShell }))
);

/**
 * EVERY SCREEN IS LOADED ON DEMAND. `BUILD_SEQUENCE_KIRO.md §C-FIELD`.
 *
 * "Route-level code splitting so the field entry does not download the staircase, the production graph
 * or the Gantt." One `lazy()` per route is what makes Rollup emit one chunk per route, so an operator
 * arriving at `/operator/my-work` downloads the entry, the field shell and their own screen — and
 * nothing belonging to the tower, the process graph or the manager's resource view.
 *
 * This is the ONE application, split by route. Not a second entry point, not a second Vite target, not
 * Capacitor. `tests/fieldShell.test.ts` asserts the chunk boundaries against the real build output,
 * because a comment claiming a bundle shape is not evidence.
 *
 * `SignIn` is lazy too. It is the only screen a signed-out visitor sees, so keeping it eager would put
 * it in the chunk every signed-in user downloads and never renders.
 */
const SignIn = lazy(() => import('../shared/auth/SignIn').then((m) => ({ default: m.SignIn })));
// Android app: an account the app does not serve (admin, manager, operator) gets this, not a screen.
const RoleNotInApp = lazy(() => import('../shared/auth/SignIn').then((m) => ({ default: m.RoleNotInApp })));

// Management.
const AdminHome = lazy(() => import('../features/admin/pages/AdminHome').then((m) => ({ default: m.AdminHome })));
const BatchStart = lazy(() => import('../features/admin/pages/BatchStart').then((m) => ({ default: m.BatchStart })));
const PrepareBatch = lazy(() => import('../features/admin/pages/PrepareBatch').then((m) => ({ default: m.PrepareBatch })));
const OnboardBatch = lazy(() => import('../features/admin/pages/OnboardBatch').then((m) => ({ default: m.OnboardBatch })));
const AdminToday = lazy(() => import('../features/admin/pages/AdminToday').then((m) => ({ default: m.AdminToday })));
const Batches = lazy(() => import('../features/admin/pages/Batches').then((m) => ({ default: m.Batches })));
const MonthlySchedule = lazy(() =>
  import('../features/admin/pages/MonthlySchedule').then((m) => ({ default: m.MonthlySchedule }))
);
const BatchPage = lazy(() => import('../features/admin/pages/BatchPage').then((m) => ({ default: m.BatchPage })));
const ProcessExplorer = lazy(() =>
  import('../features/admin/pages/ProcessExplorer').then((m) => ({ default: m.ProcessExplorer }))
);
const ReferenceData = lazy(() =>
  import('../features/admin/pages/ReferenceData').then((m) => ({ default: m.ReferenceData }))
);
// Retired screens (Control Tower, Control Room, Plant, Resources, the old New Batch, Schedule Builder,
// the dev Gallery) live in NOT_NEEDED/frontend_legacy/ and are not routed.

// The field surface.
const MyWork = lazy(() => import('../features/supervisor/pages/MyWork').then((m) => ({ default: m.MyWork })));
const LabQueue = lazy(() => import('../features/lab/pages/LabQueue').then((m) => ({ default: m.LabQueue })));
const LabCheckpoint = lazy(() =>
  import('../features/lab/pages/LabCheckpoint').then((m) => ({ default: m.LabCheckpoint }))
);
const LabApprovals = lazy(() =>
  import('../features/gm/pages/LabApprovals').then((m) => ({ default: m.LabApprovals }))
);
const AdminTickets = lazy(() =>
  import('../features/admin/pages/AdminTickets').then((m) => ({ default: m.AdminTickets }))
);
const AdminNow = lazy(() => import('../features/admin/pages/AdminNow').then((m) => ({ default: m.AdminNow })));
const AdminResources = lazy(() => import('../features/admin/pages/AdminResources').then((m) => ({ default: m.AdminResources })));
const AdminLogins = lazy(() => import('../features/admin/pages/AdminLogins').then((m) => ({ default: m.AdminLogins })));
const GmPeople = lazy(() => import('../features/gm/pages/GmPeople').then((m) => ({ default: m.GmPeople })));
const GmProgress = lazy(() =>
  import('../features/gm/pages/GmProgress').then((m) => ({ default: m.GmProgress }))
);

/**
 * Route guard, and the one place a shell is chosen. DEFENCE IN DEPTH ONLY.
 *
 * RLS in Postgres is the authorisation boundary. This exists so a user does not land on a screen with
 * no data; it is not what stops them reading another role's rows. Anyone who bypasses it gets the same
 * result from the database.
 *
 * THE SHELL IS CHOSEN BY ROLE, NOT BY URL — `§C-FIELD`. `isFieldRole` is the only test, it lives in
 * `lib/auth.ts` beside `ROLE_HOME`, and it is used here and nowhere else. Choosing by URL prefix would
 * mean a supervisor opening `/operator/my-work` lost their nav bar, which is exactly the trap §C-FIELD
 * describes when it says "a supervisor is genuinely both roles".
 */
function RoleGuard({ allow, children }: { allow: AppRole[]; children: ReactNode }) {
  const { session, role, loading } = useAuth();
  const { pathname } = useLocation();

  if (loading) return <p className="p-6 text-sm text-muted">Loading…</p>;
  if (!session) return <Navigate to="/sign-in" replace />;
  if (!role) return <p className="p-6 text-sm text-muted">Resolving role…</p>;
  if (!roleAllowedHere(role)) return <RoleNotInApp role={role} />;
  if (!allow.includes(role)) return <Navigate to={ROLE_HOME[role]} replace />;
  // Android app: each role reaches only its own screens (operating flow §8).
  if (!pathAllowedHere(role, pathname)) return <Navigate to={ROLE_HOME[role]} replace />;

  const Shell = isFieldRole(role) ? FieldShell : AppShell;

  /*
    TWO Suspense boundaries, and the nesting is the point.

    The outer one covers the shell. It suspends once per session — after that the shell's chunk is
    cached and it never suspends again, so navigating between screens does not tear the chrome down.

    The inner one covers the screen, INSIDE the shell, so a route change leaves the header in place and
    only the content area shows a skeleton. `UI_DESIGN_SPEC §5`: "Skeletons in the shape of the content.
    Never a spinner over the whole page."
  */
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">Loading…</p>}>
      <Shell>
        <Suspense fallback={<Skeleton label="Opening" lines={4} />}>{children}</Suspense>
      </Shell>
    </Suspense>
  );
}

/**
 * `/admin/batch/:id` → `/batch/:id`, query string intact.
 *
 * A bare `<Navigate to="/batch/:id">` would send the literal `:id`, and dropping the search would
 * lose the deep-linked hour — the thing `?h=` exists for.
 */
function RedirectToBatchPage() {
  const { id = '' } = useParams();
  const { search } = useLocation();
  return <Navigate to={`/batch/${id}${search}`} replace />;
}

function RedirectToPrepare() {
  const { id = '' } = useParams();
  return <Navigate to={`/admin/batch/${id}/prepare`} replace />;
}

function Landing() {
  const { session, role, loading } = useAuth();
  if (loading) return <p className="p-6 text-sm text-muted">Loading…</p>;
  if (!session) return <Navigate to="/sign-in" replace />;
  if (!role) return <Navigate to="/admin/today" replace />;
  if (!roleAllowedHere(role)) return <RoleNotInApp role={role} />;
  return <Navigate to={ROLE_HOME[role]} replace />;
}

const MGMT: AppRole[] = ['gm', 'manager', 'admin', 'supervisor'];
/*
 * WHO MAY OPEN THE TASK SCREEN — the roles the server lets START work, and no one else.
 *
 * This used to include admin, gm and manager. `start_activity` and `submit_activity` refuse all
 * three (403, "requires role operator or supervisor or lab_tech"), so they could open a list of
 * work with no button on it that would succeed. The lab technician is excluded on purpose, as
 * before: UI-001 gave them their own checkpoint screen.
 */
const OPS: AppRole[] = ['operator', 'supervisor'];

export default function App() {
  return (
    // `/` and `/sign-in` are outside RoleGuard (A15), so they need their own boundary for the lazy
    // chunk. Landing renders no chunk of its own — it only redirects.
    <Suspense fallback={<p className="p-6 text-sm text-muted">Loading…</p>}>
      <Routes>
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/" element={<Landing />} />

        {/*
          A1 · the Admin home. Two doors — a NEW batch, and one the factory is ALREADY RUNNING —
          because what MushroomOS watched from the start and what it was told about afterwards are
          different in kind. `WORKSTATIONS.md` §4.
        */}
        <Route path="/admin" element={<RoleGuard allow={MGMT}><AdminHome /></RoleGuard>} />
        <Route path="/admin/batch/start" element={<RoleGuard allow={['admin']}><BatchStart mode="new" /></RoleGuard>} />
        <Route path="/admin/batch/ongoing" element={<RoleGuard allow={['admin']}><BatchStart mode="ongoing" /></RoleGuard>} />
        {/*
          Onboarding a batch the factory is already running, and preparing a new one: Admin only
          (current process baseline §9, §11.1). The server enforces the same (0091).
        */}
        <Route path="/admin/batch/:id/onboard" element={<RoleGuard allow={['admin']}><OnboardBatch /></RoleGuard>} />
        <Route path="/admin/batch/:id/prepare" element={<RoleGuard allow={['admin']}><PrepareBatch /></RoleGuard>} />
        <Route path="/admin/today" element={<RoleGuard allow={MGMT}><AdminToday /></RoleGuard>} />
        <Route path="/admin/batches" element={<RoleGuard allow={MGMT}><Batches /></RoleGuard>} />
        <Route path="/admin/schedule" element={<RoleGuard allow={MGMT}><MonthlySchedule /></RoleGuard>} />
        {/* The retired schedule builder's address now opens the batch's setup page. */}
        <Route path="/admin/batch/:id/schedule" element={<RedirectToPrepare />} />
        {/*
          C4 · THE ROUTE MOVE. `/batch/:id` is the shared management batch page — one page at six
          densities, per `UI_IMPLEMENTATION_PLAN §1.1`, never `/gm/batch/:id` beside
          `/admin/batch/:id`. The old admin path is a redirect that KEEPS THE QUERY STRING, so a
          link carrying `?h=` or `?activity=` arrives at the right hour rather than at hour 1.
        */}
        <Route path="/batch/:id" element={<RoleGuard allow={MGMT}><BatchPage /></RoleGuard>} />
        <Route path="/admin/batch/:id" element={<RedirectToBatchPage />} />
        <Route path="/admin/process-explorer" element={<RoleGuard allow={MGMT}><ProcessExplorer /></RoleGuard>} />
        <Route path="/admin/reference" element={<RoleGuard allow={MGMT}><ReferenceData /></RoleGuard>} />

        <Route path="/operator/my-work" element={<RoleGuard allow={OPS}><MyWork /></RoleGuard>} />
        <Route path="/lab/queue" element={<RoleGuard allow={['lab_tech']}><LabQueue /></RoleGuard>} />
        {/*
          UI-001 · one lab checkpoint, sample to submit. The lab technician's own workstation — the
          `/operator` guard is NOT widened to lab_tech. The URL carries the activity, so a refresh or an
          app restart re-reads the same checkpoint from the server.
        */}
        <Route path="/lab/checkpoint/:activityId" element={<RoleGuard allow={['lab_tech']}><LabCheckpoint /></RoleGuard>} />
        {/*
          The decision that opens a gate. Guarded to MGMT so a supervisor or GM can reach it — and
          deliberately NOT to lab_tech, who may never decide a lab submission. `decide_lab_submission`
          enforces that server-side whatever this guard says; while C-32 is open the server accepts
          either gm or supervisor, and the screen reads which from `approver_roles` rather than
          hardcoding one.
        */}
        <Route path="/lab/approvals" element={<RoleGuard allow={['gm']}><LabApprovals /></RoleGuard>} />
        <Route path="/admin/now" element={<RoleGuard allow={MGMT}><AdminNow /></RoleGuard>} />
        <Route path="/admin/resources" element={<RoleGuard allow={['admin', 'manager']}><AdminResources /></RoleGuard>} />
        <Route path="/admin/logins" element={<RoleGuard allow={['admin']}><AdminLogins /></RoleGuard>} />
        <Route path="/gm/people" element={<RoleGuard allow={['gm', 'admin', 'manager']}><GmPeople /></RoleGuard>} />
        <Route path="/gm/progress" element={<RoleGuard allow={['gm', 'admin', 'manager']}><GmProgress /></RoleGuard>} />
        <Route path="/admin/tickets" element={<RoleGuard allow={['admin', 'gm', 'manager']}><AdminTickets /></RoleGuard>} />
        {/* Anything else — including the retired screens' old addresses — goes to the role's home. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
