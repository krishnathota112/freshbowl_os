/**
 * THE EVENT STREAM — what actually happened to this batch, in order.
 *
 * `UI_CONTROL_TOWER_SPEC §13`: one of the three views under a single playhead. Scrubbing the rail
 * moves this list; clicking a row moves the rail. Neither keeps its own hour — `usePlayhead` is
 * the only position on the page.
 *
 * L3 — takes rows as props, reads the shared playhead, never queries.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY A NULL ACTOR IS RENDERED AS A FACT, NOT AS A GAP
 *
 * `v_batch_event.server_decided` is true exactly when a gate event has no actor. 0018 §6 states
 * why: "A null actor is not missing data. It means the server decided, which is what a gate is."
 *
 * So these rows read `the system` — plainly, with the same weight as a person's name. Rendering
 * them as `—` or `unknown` would invite someone to go looking for the operator who opened a gate
 * that no operator opened, and it would quietly undermine the one guarantee the gate engine
 * exists to make: device clocks never open gates, the server does.
 *
 * WHAT IT WILL NOT DO
 *   · invent a batch hour. `batch_hour` is null for events before H0 and on batches predating A2.
 *     Those rows say so and sort to the end rather than being placed at hour 1.
 *   · re-word a reason. Quoted verbatim, as in the paragraph, for the same reason.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useRef } from 'react';

import type { BatchBar, BatchEvent } from '../../../domain/contracts';
import { usePlayhead } from '../domain/PlayheadContext';
import { TimeLabel } from '../domain/TimeLabel';
import { EmptyState } from '../primitives';

/**
 * Plain English for the audit verbs. Unknown actions fall back to the raw action rather than to a
 * blank — a new event type must be legible the day it is added, not the day someone remembers to
 * extend this map.
 */
const SPOKEN: Record<string, string> = {
  gate_opened: 'gate opened',
  rest_started: 'rest started',
  rest_released: 'rest released',
  insert: 'created',
  update: 'changed',
  delete: 'removed',
};

export function EventStream({ bar, events }: { bar: BatchBar; events: BatchEvent[] }) {
  const play = usePlayhead();
  const listRef = useRef<HTMLOListElement>(null);

  // Newest first, with un-placed events last. The API already orders by time; this only decides
  // where the rows that have no hour go.
  const ordered = useMemo(
    () =>
      [...events].sort((a, b) => {
        if ((a.batchHour === null) !== (b.batchHour === null)) return a.batchHour === null ? 1 : -1;
        return Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
      }),
    [events]
  );

  // The row the playhead is sitting on: the most recent event at or before the current hour.
  const currentId = useMemo(() => {
    const at = ordered.find((e) => e.batchHour !== null && e.batchHour <= play.hour);
    return at?.id ?? null;
  }, [ordered, play.hour]);

  /*
    Scrubbing the rail scrolls THIS LIST to match — and only this list.

    `scrollIntoView({ block: 'nearest' })` was the obvious call and it is wrong here: it walks every
    scrollable ancestor, so on a 390px screen it scrolled the PAGE as well, landing the reader below
    the rail and the paragraph the moment a batch opened. §S2's phone rule is explicit that the
    narrative comes first there.

    So the offset is set on the list element directly. Nothing outside this box moves.
  */
  useEffect(() => {
    const list = listRef.current;
    if (currentId === null || list === null) return;
    const el = list.querySelector<HTMLElement>(`[data-event-id="${currentId}"]`);
    if (el === null) return;

    const top = el.offsetTop - list.offsetTop;
    const bottom = top + el.offsetHeight;
    // Already visible: leave it alone rather than re-centring on every scrub.
    if (top >= list.scrollTop && bottom <= list.scrollTop + list.clientHeight) return;
    list.scrollTop = top - list.clientHeight / 3;
  }, [currentId]);

  if (ordered.length === 0) {
    return (
      <EmptyState
        title="Nothing has happened to this batch yet"
        detail="Every gate the server opens and every decision a person makes is written here, in order, with who did it and why. The list fills itself once work starts."
      />
    );
  }

  return (
    <ol
      ref={listRef}
      className="flex max-h-[28rem] flex-col gap-0 overflow-y-auto"
      aria-label="Event stream"
    >
      {ordered.map((e) => {
        // AFTER the playhead: dimmed, not hidden. Hiding would make the list look shorter than the
        // record is, and the record is the point of this view.
        const ahead = e.batchHour !== null && e.batchHour > play.hour;
        const here = e.id === currentId;

        return (
          <li
            key={e.id}
            data-event-id={e.id}
            className="border-l-2 py-2 pl-3"
            style={{
              borderColor: here ? 'var(--accent)' : 'var(--line)',
              opacity: ahead ? 0.45 : 1,
              background: here ? 'var(--accent-soft)' : undefined,
            }}
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <button
                type="button"
                disabled={e.batchHour === null}
                onClick={() => e.batchHour !== null && play.setHour(e.batchHour)}
                className="mono text-[11px] disabled:cursor-default"
                style={{ color: e.batchHour === null ? 'var(--muted)' : 'var(--accent-ink)' }}
                title={e.batchHour === null ? undefined : `Move the playhead to H${e.batchHour}`}
              >
                {e.batchHour === null ? 'before H0' : `H${e.batchHour}`}
              </button>

              <span className="font-head text-[13px] font-700">
                {SPOKEN[e.action] ?? e.action}
              </span>

              {e.activityTitle !== null && (
                <span className="text-[12px] text-muted">
                  {e.activityTitle}
                  {e.scopeLabel !== null ? ` · ${e.scopeLabel}` : ''}
                </span>
              )}
            </div>

            <div className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-2)' }}>
              {e.serverDecided ? (
                // Stated, not apologised for. See the header.
                <span style={{ color: 'var(--muted)' }}>
                  the system — no person opened this, the server did
                </span>
              ) : e.actorName !== null ? (
                <>
                  {e.actorName}
                  {e.actorRole !== null ? ` · ${e.actorRole}` : ''}
                </>
              ) : (
                <span style={{ color: 'var(--muted)' }}>no actor recorded</span>
              )}
              {e.reason !== null && (
                <>
                  {' — '}
                  <q className="italic">{e.reason}</q>
                </>
              )}
            </div>

            {here && e.batchHour !== null && (
              <div className="mt-1">
                <TimeLabel
                  startAt={bar.clock.startAt}
                  hour={e.batchHour}
                  baselineHours={bar.clock.baselineHours}
                  timezone={bar.clock.timezone}
                  timezoneConflictId={bar.clock.timezoneConflictId}
                  size="sm"
                />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
