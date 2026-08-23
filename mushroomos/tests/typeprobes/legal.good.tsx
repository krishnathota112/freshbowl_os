/**
 * The counterpart to the `.bad` probes: these MUST compile.
 *
 * Without this file the A3 and A4 tests would pass just as well against a component that rejects
 * everything, which would be a type test measuring nothing.
 */

import { Bar, Skeleton } from '../../src/components/primitives';
import { TimeLabel } from '../../src/components/domain/TimeLabel';
import { HumanDuration, Variance } from '../../src/components/domain/HumanDuration';

// All three registers present. `baselineHours` comes from process_definition at every real call
// site; here it is a caller-supplied number like any other prop.
export const fullLabel = (
  <TimeLabel
    startAt="2026-09-20T05:00:00Z"
    hour={126}
    baselineHours={480}
    timezone="Asia/Kolkata"
  />
);

// The live case today: H0 unknown because TBD-50 is open. Registers 2 and 3 still render.
export const noH0 = (
  <TimeLabel
    startAt={null}
    hour={126}
    baselineHours={480}
    timezone={null}
    timezoneConflictId="TBD-50"
  />
);

// The one legal Bar: material quantity, with its unit.
export const materialBar = <Bar kind="material" value={17.5} max={21} unit="MT" />;

export const loading = <Skeleton label="Reading the batch's activities" lines={3} />;

export const spoken = <HumanDuration minutes={200} />;

export const variance = <Variance minutes={200} />;

export const noComparison = <Variance minutes={null} />;
