import { PageHeading } from '../components/layout/PageHeading';
import { Chip, EmptyState } from '../components/primitives';

/**
 * A role home whose screen belongs to a later step, stated rather than faked.
 *
 * `UI_DESIGN_SPEC §5` — never "No data" — and `KIRO_BUILD_INSTRUCTIONS §1` item 10, which forbids
 * faking a workflow in the frontend. So this says what will fill the screen and which step fills it,
 * and renders no placeholder cards and no zero counts.
 *
 * It used to live in `routes/Placeholders.tsx` alongside the screens that use it. That file also held
 * `Resources`, so the lab technician's route and the manager's route shared one module and therefore
 * one chunk. `Resources` is where the vessel Gantt lands at A5 (`UI_IMPLEMENTATION_PLAN §3.1`:
 * "extracted to its own file, Gantt added at A5"), and C-FIELD requires the field entry to exclude
 * it. One module per route, sharing this.
 */
export function Pending({
  title,
  subtitle,
  waitingFor,
  step,
}: {
  title: string;
  subtitle: string;
  waitingFor: string;
  step: string;
}) {
  return (
    <>
      <PageHeading title={title} subtitle={subtitle} right={<Chip tone="lock">{step}</Chip>} />
      <EmptyState
        title={waitingFor}
        detail={`This screen is built in ${step}. Steps 1 and 2 build the process definition and the mechanisms that read it; nothing has instantiated a batch yet, so there is no work to show. Filling this with placeholder cards would be faking the workflow in the frontend, which the build instructions forbid.`}
      />
    </>
  );
}
