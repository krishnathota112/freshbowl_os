/**
 * A4 · `Bar` cannot be used for batch progress.
 *
 * THIS FILE MUST NOT COMPILE.
 *
 * A bar is the obvious thing to reach for when showing "17 of 23 tasks done", and that is a batch
 * percentage — banned by `UI_CONTROL_TOWER_SPEC §8.3` and an automatic workstream failure under
 * `UI_ACCEPTANCE_CRITERIA` rule E.1. Half the process is resting and rest does not compress, so a
 * batch at "50%" tells the reader nothing true.
 *
 * Two live violations existed when this probe was written — a done/total bar on the batch page and
 * an instance-count bar against an arbitrary maximum. Both were deleted.
 */

import { Bar } from '../../src/components/primitives';

// 1 · Batch progress, in the shape it actually appeared in.
export const batchProgress = <Bar value={17} max={45} />;

// 2 · Naming a kind the union does not have does not get you past it either.
export const wrongKind = <Bar kind="batch_progress" value={17} max={45} unit="tasks" />;

// 3 · Material quantity but no unit — a fraction wearing a disguise.
export const noUnit = <Bar kind="material" value={17.5} max={21} />;
