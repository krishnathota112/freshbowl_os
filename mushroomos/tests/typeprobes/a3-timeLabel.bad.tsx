/**
 * A3 · `TimeLabel` cannot render a batch hour without a wall clock.
 *
 * THIS FILE MUST NOT COMPILE. `tests/uiFoundations.test.ts` runs `tsc` over this directory and
 * asserts that each `.bad.tsx` probe produces an error. A type test that has never been seen to
 * fail proves nothing about the type, which is the same argument `TIME_CONTRACT §2` makes about the
 * grep test's negative check.
 *
 * Each case below is the mistake a hurried caller would actually make.
 */

import { TimeLabel } from '../../src/components/domain/TimeLabel';

// 1 · The hour on its own. This is `H126` as engineer language, which §8.1 forbids.
export const hourAlone = <TimeLabel hour={126} />;

// 2 · An instant with no hour: there is no "current" fallback to lean on.
export const startAtAlone = <TimeLabel startAt="2026-09-20T05:00:00Z" />;

// 3 · Both halves of the time axis, but no scale. Register 3 (`of <baseline>`) has nothing to say,
//     and defaulting it would put the process length into src/ — invariant 8.
export const noBaseline = <TimeLabel hour={126} startAt="2026-09-20T05:00:00Z" timezone={null} />;

// 4 · No timezone field at all. Omitting it would silently mean "use the viewer's zone", which is
//     exactly the failure TIME_CONTRACT §3.2 describes. It has to be stated, even as null.
export const noTimezone = (
  <TimeLabel hour={126} startAt="2026-09-20T05:00:00Z" baselineHours={480} />
);
