import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ROLE_HOME, useAuth } from './lib/auth';
import type { AppRole } from './domain/types';
import { AppShell } from './components/layout/AppShell';
import { SignIn } from './routes/SignIn';
import { AdminToday } from './routes/AdminToday';
import { ProcessExplorer } from './routes/ProcessExplorer';
import { Gallery } from './routes/Gallery';
import { Batches } from './routes/Batches';
import { NewBatch } from './routes/NewBatch';
import { BatchDetail } from './routes/BatchDetail';
import { ScheduleBuilder } from './routes/ScheduleBuilder';
import { MyWork } from './routes/MyWork';
import { CommandCenter, ControlRoom, LabQueue, Resources } from './routes/Placeholders';
import { ReferenceData } from './routes/ReferenceData';

/**
 * Route guard. DEFENCE IN DEPTH ONLY.
 *
 * RLS in Postgres is the authorisation boundary. This exists so a user does not land on a
 * screen with no data; it is not what stops them reading another role's rows. Anyone who
 * bypasses it gets the same result from the database.
 */
function RoleGuard({ allow, children }: { allow: AppRole[]; children: ReactNode }) {
  const { session, role, loading } = useAuth();

  if (loading) return <p className="p-6 text-sm text-muted">Loading…</p>;
  if (!session) return <Navigate to="/sign-in" replace />;
  if (!role) return <p className="p-6 text-sm text-muted">Resolving role…</p>;
  if (!allow.includes(role)) return <Navigate to={ROLE_HOME[role]} replace />;
  return <AppShell>{children}</AppShell>;
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
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/" element={<Landing />} />

      <Route path="/admin/today" element={<RoleGuard allow={MGMT}><AdminToday /></RoleGuard>} />
      <Route path="/admin/batches" element={<RoleGuard allow={MGMT}><Batches /></RoleGuard>} />
      <Route path="/admin/batch/new" element={<RoleGuard allow={['admin', 'gm']}><NewBatch /></RoleGuard>} />
      <Route path="/admin/batch/:id/schedule" element={<RoleGuard allow={['admin', 'gm', 'supervisor']}><ScheduleBuilder /></RoleGuard>} />
      <Route path="/admin/batch/:id" element={<RoleGuard allow={MGMT}><BatchDetail /></RoleGuard>} />
      <Route path="/admin/process-explorer" element={<RoleGuard allow={MGMT}><ProcessExplorer /></RoleGuard>} />
      <Route path="/admin/reference" element={<RoleGuard allow={MGMT}><ReferenceData /></RoleGuard>} />

      <Route path="/operator/my-work" element={<RoleGuard allow={OPS}><MyWork /></RoleGuard>} />
      <Route path="/lab/queue" element={<RoleGuard allow={['lab_tech', 'supervisor']}><LabQueue /></RoleGuard>} />
      <Route path="/supervisor/control-room" element={<RoleGuard allow={['supervisor', 'gm']}><ControlRoom /></RoleGuard>} />
      <Route path="/manager/resources" element={<RoleGuard allow={['manager', 'admin', 'gm']}><Resources /></RoleGuard>} />
      <Route path="/gm/command-center" element={<RoleGuard allow={['gm']}><CommandCenter /></RoleGuard>} />

      {/* Gallery is excluded from production builds. */}
      {import.meta.env.DEV && (
        <Route path="/dev/gallery" element={<RoleGuard allow={ALL}><Gallery /></RoleGuard>} />
      )}

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
