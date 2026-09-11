import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { ROLE_HOME, isFieldRole, useAuth } from './lib/auth';
import type { AppRole } from './domain/types';
import { Skeleton } from './components/primitives';

/**
 * BOTH SHELLS ARE LAZY, and that is what makes "chosen by role" true of the download and not only of
 * the render. Imported statically, each one would land in the entry chunk, so an operator would
 * download the management nav table — every management route, by name — to render a screen with no nav
 * bar. A field session now fetches `FieldShell` and never `AppShell`.
 *
 * The pair is declared at module scope so each is a stable component type: a `lazy()` created during
 * render would remount its subtree on every render.
 */
const AppShell = lazy(() => import('./components/layout/AppShell').then((m) => ({ default: m.AppShell })));
const FieldShell = lazy(() =>
  import('./components/layout/FieldShell').then((m) => ({ default: m.FieldShell }))
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
const SignIn = lazy(() => import('./routes/SignIn').then((m) => ({ default: m.SignIn })));

// Management.
const AdminHome = lazy(() => import('./routes/AdminHome').then((m) => ({ default: m.AdminHome })));
const BatchStart = lazy(() => import('./routes/BatchStart').then((m) => ({ default: m.BatchStart })));
const PrepareBatch = lazy(() => import('./routes/PrepareBatch').then((m) => ({ default: m.PrepareBatch })));
const OnboardBatch = lazy(() => import('./routes/OnboardBatch').then((m) => ({ default: m.OnboardBatch })));
const AdminToday = lazy(() => import('./routes/AdminToday').then((m) => ({ default: m.AdminToday })));
const Batches = lazy(() => import('./routes/Batches').then((m) => ({ default: m.Batches })));
const MonthlySchedule = lazy(() =>
  import('./routes/MonthlySchedule').then((m) => ({ default: m.MonthlySchedule }))
);
const NewBatch = lazy(() => import('./routes/NewBatch').then((m) => ({ default: m.NewBatch })));
const BatchPage = lazy(() => import('./routes/BatchPage').then((m) => ({ default: m.BatchPage })));
const Plant = lazy(() => import('./routes/Plant').then((m) => ({ default: m.Plant })));
const ScheduleBuilder = lazy(() =>
  import('./routes/ScheduleBuilder').then((m) => ({ default: m.ScheduleBuilder }))
);
const ProcessExplorer = lazy(() =>
  import('./routes/ProcessExplorer').then((m) => ({ default: m.ProcessExplorer }))
);
const ReferenceData = lazy(() =>
  import('./routes/ReferenceData').then((m) => ({ default: m.ReferenceData }))
);
const ControlTower = lazy(() =>
  import('./routes/ControlTower').then((m) => ({ default: m.ControlTower }))
);
const ControlRoom = lazy(() => import('./routes/ControlRoom').then((m) => ({ default: m.ControlRoom })));
const Resources = lazy(() => import('./routes/Resources').then((m) => ({ default: m.Resources })));

// The field surface.
const MyWork = lazy(() => import('./routes/MyWork').then((m) => ({ default: m.MyWork })));
const LabQueue = lazy(() => import('./routes/LabQueue').then((m) => ({ default: m.LabQueue })));
const LabCheckpoint = lazy(() =>
  import('./routes/LabCheckpoint').then((m) => ({ default: m.LabCheckpoint }))
);
const LabApprovals = lazy(() =>
  import('./routes/LabApprovals').then((m) => ({ default: m.LabApprovals }))
);

/**
 * DEV ONLY, and the guard is on the DECLARATION rather than on the route.
 *
 * The route was already wrapped in `import.meta.env.DEV`, but the `lazy()` call sat at module scope
 * where nothing removed it — so a production build emitted a Gallery chunk of its own, carrying the
 * staircase, the rail and `api/tower` with it. Measured, not assumed: it was 17.98 kB in the build
 * before this line changed.
 *
 * `import.meta.env.DEV` is substituted with the literal `false` at build time, so this conditional
 * folds and the dynamic import disappears with it. `tests/fieldShell.test.ts` asserts no Gallery chunk
 * is emitted.
 */
const Gallery = import.meta.env.DEV
  ? lazy(() => import('./routes/Gallery').then((m) => ({ default: m.Gallery })))
  : null;

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

  if (loading) return <p className="p-6 text-sm text-muted">Loading…</p>;
  if (!session) return <Navigate to="/sign-in" replace />;
  if (!role) return <p className="p-6 text-sm text-muted">Resolving role…</p>;
  if (!allow.includes(role)) return <Navigate to={ROLE_HOME[role]} replace />;

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

function Landing() {
  const { session, role, loading } = useAuth();
  if (loading) return <p className="p-6 text-sm text-muted">Loading…</p>;
  if (!session) return <Navigate to="/sign-in" replace />;
  if (!role) return <Navigate to="/admin/today" replace />;
  return <Navigate to={ROLE_HOME[role]} replace />;
}

const ALL: AppRole[] = ['gm', 'manager', 'admin', 'supervisor', 'operator', 'lab_tech'];
const MGMT: AppRole[] = ['gm', 'manager', 'admin', 'supervisor'];
const OPS: AppRole[] = ['operator', 'supervisor', 'admin', 'gm', 'manager'];

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
        <Route path="/admin/batch/start" element={<RoleGuard allow={['admin', 'gm']}><BatchStart mode="new" /></RoleGuard>} />
        <Route path="/admin/batch/ongoing" element={<RoleGuard allow={['admin', 'gm']}><BatchStart mode="ongoing" /></RoleGuard>} />
        {/*
          Onboarding a batch the factory is already running. Supervisor included deliberately: the
          server accepts a stated past time only from a supervisor (or a lab technician), so the one
          person who can complete this must be able to open it.
        */}
        <Route path="/admin/batch/:id/onboard" element={<RoleGuard allow={['admin', 'gm', 'supervisor']}><OnboardBatch /></RoleGuard>} />
        <Route path="/admin/batch/:id/prepare" element={<RoleGuard allow={['admin', 'gm', 'supervisor']}><PrepareBatch /></RoleGuard>} />
        <Route path="/admin/today" element={<RoleGuard allow={MGMT}><AdminToday /></RoleGuard>} />
        <Route path="/admin/batches" element={<RoleGuard allow={MGMT}><Batches /></RoleGuard>} />
        <Route path="/admin/schedule" element={<RoleGuard allow={MGMT}><MonthlySchedule /></RoleGuard>} />
        <Route path="/admin/batch/new" element={<RoleGuard allow={['admin', 'gm']}><NewBatch /></RoleGuard>} />
        <Route path="/admin/batch/:id/schedule" element={<RoleGuard allow={['admin', 'gm', 'supervisor']}><ScheduleBuilder /></RoleGuard>} />
        {/*
          C4 · THE ROUTE MOVE. `/batch/:id` is the shared management batch page — one page at six
          densities, per `UI_IMPLEMENTATION_PLAN §1.1`, never `/gm/batch/:id` beside
          `/admin/batch/:id`. The old admin path is a redirect that KEEPS THE QUERY STRING, so a
          link carrying `?h=` or `?activity=` arrives at the right hour rather than at hour 1.
        */}
        {/*
          THE PLANT. The factory as a place — every bunker and tunnel, occupied or empty.
          Management-wide, not GM-only: a supervisor asking which bunker is free is asking the same
          question as the owner, and the answer is the same screen.
        */}
        <Route path="/plant" element={<RoleGuard allow={MGMT}><Plant /></RoleGuard>} />
        <Route path="/batch/:id" element={<RoleGuard allow={MGMT}><BatchPage /></RoleGuard>} />
        <Route path="/admin/batch/:id" element={<RedirectToBatchPage />} />
        <Route path="/admin/process-explorer" element={<RoleGuard allow={MGMT}><ProcessExplorer /></RoleGuard>} />
        <Route path="/admin/reference" element={<RoleGuard allow={MGMT}><ReferenceData /></RoleGuard>} />

        <Route path="/operator/my-work" element={<RoleGuard allow={OPS}><MyWork /></RoleGuard>} />
        <Route path="/lab/queue" element={<RoleGuard allow={['lab_tech', 'supervisor']}><LabQueue /></RoleGuard>} />
        {/*
          UI-001 · one lab checkpoint, sample to submit. The lab technician's own workstation — the
          `/operator` guard is NOT widened to lab_tech. The URL carries the activity, so a refresh or an
          app restart re-reads the same checkpoint from the server.
        */}
        <Route path="/lab/checkpoint/:activityId" element={<RoleGuard allow={['lab_tech', 'supervisor']}><LabCheckpoint /></RoleGuard>} />
        {/*
          The decision that opens a gate. Guarded to MGMT so a supervisor or GM can reach it — and
          deliberately NOT to lab_tech, who may never decide a lab submission. `decide_lab_submission`
          enforces that server-side whatever this guard says; while C-32 is open the server accepts
          either gm or supervisor, and the screen reads which from `approver_roles` rather than
          hardcoding one.
        */}
        <Route path="/lab/approvals" element={<RoleGuard allow={MGMT}><LabApprovals /></RoleGuard>} />
        <Route path="/supervisor/control-room" element={<RoleGuard allow={['supervisor', 'gm']}><ControlRoom /></RoleGuard>} />
        <Route path="/manager/resources" element={<RoleGuard allow={['manager', 'admin', 'gm']}><Resources /></RoleGuard>} />
        {/*
          S1 · the Control Tower. Management sees the whole factory, so it is not GM-only — §9 calls it
          "the home screen for GM and owner", and a manager or admin looking at the same board is the
          point of a control tower.
        */}
        <Route path="/gm/control-tower" element={<RoleGuard allow={MGMT}><ControlTower /></RoleGuard>} />
        {/*
          The old path. Kept as a redirect rather than deleted: it is the GM's bookmark, it is
          ROLE_HOME's previous value, and a dead link on the home screen of the person the product is for
          is not an acceptable way to rename a route.
        */}
        <Route path="/gm/command-center" element={<Navigate to="/gm/control-tower" replace />} />

        {/* Gallery is excluded from production builds — declaration and route both. */}
        {import.meta.env.DEV && Gallery && (
          <Route path="/dev/gallery" element={<RoleGuard allow={ALL}><Gallery /></RoleGuard>} />
        )}

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
