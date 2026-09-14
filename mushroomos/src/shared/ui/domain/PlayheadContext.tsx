/**
 * One position on the hour axis, shared by every view on the batch page.
 *
 * `UI_CONTROL_TOWER_SPEC §13` and manual criterion 14: dragging the playhead must move the graph,
 * the event stream and the narrative TOGETHER. That only holds if there is exactly one position,
 * so it lives in a context and each view reads it rather than keeping its own.
 *
 * L2 — no `api/`, no query. The route owns the URL (`?h=`) and feeds it in, which keeps
 * criterion 6 (a clicked bar opens the batch at that hour) a routing concern rather than a
 * component one.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Playhead = {
  /** The Book1 hour under the playhead. 1-based, clamped to the baseline. */
  hour: number;
  setHour: (hour: number) => void;
  /** Arrow keys move one hour; Shift+arrow moves one batch-day. Criterion 15. */
  step: (delta: number) => void;
  stepDay: (delta: number) => void;
  baselineHours: number;
};

const PlayheadCtx = createContext<Playhead | null>(null);

const HOURS_PER_BATCH_DAY = 24;

export function PlayheadProvider({
  baselineHours,
  initialHour = 1,
  children,
}: {
  /** From `process_definition`. The clamp has no meaning without it, so it is required. */
  baselineHours: number;
  initialHour?: number;
  children: ReactNode;
}) {
  const clamp = useCallback(
    (h: number) => Math.min(Math.max(1, Math.round(h)), Math.max(1, baselineHours)),
    [baselineHours]
  );

  const [hour, setHourRaw] = useState(() => clamp(initialHour));

  const value = useMemo<Playhead>(() => {
    const setHour = (h: number) => setHourRaw(clamp(h));
    return {
      hour,
      setHour,
      step: (delta: number) => setHourRaw((h) => clamp(h + delta)),
      stepDay: (delta: number) => setHourRaw((h) => clamp(h + delta * HOURS_PER_BATCH_DAY)),
      baselineHours,
    };
  }, [hour, clamp, baselineHours]);

  return <PlayheadCtx.Provider value={value}>{children}</PlayheadCtx.Provider>;
}

/**
 * Throws outside a provider rather than returning a default.
 *
 * A silent default would give each view its own hour 1 and they would drift apart without anything
 * looking broken — which is precisely the defect criterion 14 exists to catch.
 */
export function usePlayhead(): Playhead {
  const ctx = useContext(PlayheadCtx);
  if (ctx === null) {
    throw new Error(
      'usePlayhead must be used inside a PlayheadProvider. There is exactly one playhead per ' +
        'batch page, and a component that makes its own will drift out of step with the others.'
    );
  }
  return ctx;
}
