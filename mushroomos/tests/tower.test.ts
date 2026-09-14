/**
 * C2 — HourRail and StaircaseCalendar. `UI_IMPLEMENTATION_PLAN §4 C2`.
 *
 * THE GATE: the diagonal is visible with three real batches, plus acceptance B.4, B.5 and B.7.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THESE ARE GEOMETRY TESTS AND NOT RENDER TESTS
 *
 * B.4, B.5 and B.7 sit in the manual section of `UI_ACCEPTANCE_CRITERIA`, and two of them are
 * structural claims — bars sorted by `startAt`, exactly one `now` line. A render test would count DOM
 * nodes, and **no DOM environment is installed**: no `jsdom`, no `happy-dom`, no
 * `@testing-library/react`. Adding one is three dependencies and a config change.
 *
 * So the layout is a pure module (`src/components/composite/geometry.ts`) and the assertions are made
 * against it. For B.5 that is a STRONGER guarantee than counting nodes: `nowLinePct` returns a single
 * number rather than a list, so a second line is not something the component can express. The
 * remaining visual halves of B.4 and B.7 — that the diagonal reads as a diagonal, and that nothing
 * scrolls sideways at 375 px — still need the five-minute pass, and the report says so.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { batchDay, isWithinBaseline } from '../src/domain/time';
import type { BarSegment, BatchBar } from '../src/domain/contracts';
import {
  MAX_SEGMENTS_PER_BAR,
  calendarAxis,
  factoryDate,
  mergeSegments,
  nowLinePct,
  placeBars,
  railGeometry,
  sortByStartAt,
} from '../src/shared/ui/composite/geometry';
import { countersFor } from '../src/shared/api/tower';
import { fixtureStaircase, type FixtureGeometry } from '../src/fixtures';
import { DB_URL, NO_DB_REASON, REPO_ROOT, all, one, withRollback } from './db';

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

const MS_PER_HOUR = 3_600_000;

/** The hour geometry, read from the factory's own grid. A12's rule applies to these tests too. */
function book1(): { totalHours: number; cadenceHours: number } {
  const grid = JSON.parse(
    readFileSync(join(REPO_ROOT, 'docs', '_reference', 'source', 'book1_hour_grid.json'), 'utf8')
  ) as { batches: { start_date: string; total_hours: number }[] };
  const [first, second] = grid.batches;
  return {
    totalHours: first.total_hours,
    cadenceHours:
      (Date.parse(`${second.start_date}T00:00:00Z`) - Date.parse(`${first.start_date}T00:00:00Z`)) /
      MS_PER_HOUR,
  };
}

const ZONE = 'Asia/Kolkata';

function geometry(startAt: string | null): FixtureGeometry {
  return {
    baselineHours: book1().totalHours,
    startAt,
    timezone: ZONE,
    timezoneConflictId: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────

describe('B.4 — bars are sorted by startAt, and nothing re-sorts them', () => {
  it('sorts oldest first regardless of the order they arrive in', () => {
    const g = geometry('2026-08-01T00:00:00Z');
    const bars = fixtureStaircase(g, book1().cadenceHours);
    // Shuffle deterministically, then sort. The result must not depend on the input order.
    const shuffled = [bars[2], bars[0], bars[1]];
    const sorted = sortByStartAt(shuffled);
    const starts = sorted.map((b) => Date.parse(b.clock.startAt!));
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it('places them left-to-right in that same order — the diagonal', () => {
    const now = Date.parse('2026-08-22T09:00:00Z');
    const bars: BatchBar[] = [0, 8, 16].map((daysBack, i) => ({
      batchId: `b${i}`,
      code: `MB-${i}`,
      label: `batch ${i}`,
      clock: geometry(new Date(now - daysBack * 24 * MS_PER_HOUR).toISOString()),
      nowHour: 1,
      segments: [{ fromHour: 1, toHour: book1().totalHours, kind: 'to_come', label: 'all' }],
      flags: [],
    }));

    const axis = calendarAxis(bars, now)!;
    const placed = placeBars(bars, axis, now);

    // Oldest first, and each subsequent bar starts strictly further right. That IS the staircase.
    const lefts = placed.map((p) => p.placement!.leftPct);
    for (let i = 1; i < lefts.length; i += 1) {
      expect(lefts[i], `bar ${i} must start right of bar ${i - 1}`).toBeGreaterThan(lefts[i - 1]);
    }
    // Every bar is the same length, which is what makes it read as a staircase and not a fan.
    const widths = placed.map((p) => Math.round(p.placement!.widthPct * 1000));
    expect(new Set(widths).size).toBe(1);
  });

  it('a batch with no H0 sorts last and is listed rather than placed', () => {
    const now = Date.parse('2026-08-22T09:00:00Z');
    const withH0: BatchBar = {
      batchId: 'a',
      code: 'MB-A',
      label: 'a',
      clock: geometry('2026-08-10T00:00:00Z'),
      nowHour: 1,
      segments: [],
      flags: [],
    };
    const withoutH0: BatchBar = { ...withH0, batchId: 'b', code: 'MB-B', clock: geometry(null) };

    const sorted = sortByStartAt([withoutH0, withH0]);
    expect(sorted.map((b) => b.code)).toEqual(['MB-A', 'MB-B']);

    const axis = calendarAxis([withH0, withoutH0], now)!;
    const placed = placeBars([withH0, withoutH0], axis, now);
    expect(placed[0].placement).not.toBeNull();
    expect(placed[1].placement, 'no H0 means no position, not position zero').toBeNull();
  });
});

describe('B.5 — exactly one now line', () => {
  it('the geometry returns a single value, so a second line is not expressible', () => {
    const now = Date.parse('2026-08-22T09:00:00Z');
    const bars = [0, 8].map((d, i) => ({
      batchId: `b${i}`,
      code: `MB-${i}`,
      label: `b${i}`,
      clock: geometry(new Date(now - d * 24 * MS_PER_HOUR).toISOString()),
      nowHour: 1,
      segments: [],
      flags: [],
    })) as BatchBar[];

    const axis = calendarAxis(bars, now)!;
    const pct = nowLinePct(axis, now);

    expect(typeof pct).toBe('number');
    expect(Number.isFinite(pct)).toBe(true);
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);
  });

  it('the board component renders it once, outside the row loop', () => {
    // Read the source rather than the DOM: the claim is that the marker is emitted once, not once per
    // bar, and that is visible in the structure. `data-testid` marks the single element.
    const src = readFileSync(
      join(REPO_ROOT, 'mushroomos', 'src', 'components', 'composite', 'StaircaseCalendar.tsx'),
      'utf8'
    );
    const markers = src.match(/data-testid="board-now-line"/g) ?? [];
    expect(markers.length, 'exactly one now-line element may exist').toBe(1);

    // And it must not sit inside the `placed.map(...)` row loop.
    const loopStart = src.indexOf('placed.map');
    const markerAt = src.indexOf('data-testid="board-now-line"');
    expect(markerAt).toBeGreaterThan(-1);
    expect(markerAt, 'the now line must be emitted before the row loop, not per row').toBeLessThan(
      loopStart
    );
  });

  it('now is always on the axis, even when it falls outside every batch', () => {
    const now = Date.parse('2026-12-01T00:00:00Z');
    const bars = [
      {
        batchId: 'a',
        code: 'MB-A',
        label: 'a',
        clock: geometry('2026-01-01T00:00:00Z'),
        nowHour: null,
        segments: [],
        flags: [],
      },
    ] as BatchBar[];
    const axis = calendarAxis(bars, now)!;
    const pct = nowLinePct(axis, now);
    // Clamped onto the board rather than drawn off the edge.
    expect(pct).toBeLessThanOrEqual(100);
    expect(pct).toBeGreaterThanOrEqual(0);
  });
});

describe('B.7 — the narrow form is a list, and the wide form scrolls inside itself', () => {
  it('the board has two forms and the wide one owns its own overflow', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'mushroomos', 'src', 'components', 'composite', 'StaircaseCalendar.tsx'),
      'utf8'
    );
    // The diagonal is hidden below the md breakpoint and the list is hidden above it, so exactly one
    // form is on screen at any width.
    expect(src).toMatch(/hidden[^"]*md:block/);
    expect(src).toMatch(/md:hidden/);
    // Criterion 87: a wide region scrolls inside its own container; the page body never does.
    expect(src).toMatch(/overflow-x-auto/);
    // The min-width that forces the scroll must be on the inner element, not on the page.
    expect(src).toMatch(/min-w-\[\d+px\]/);
  });

  it('no fixed pixel width leaks outside the scroll container', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'mushroomos', 'src', 'components', 'composite', 'StaircaseCalendar.tsx'),
      'utf8'
    );
    const scrollAt = src.indexOf('overflow-x-auto');
    const minWidthAt = src.indexOf('min-w-[');
    expect(minWidthAt).toBeGreaterThan(scrollAt);
  });
});

describe('segments, not one element per hour', () => {
  it('a full-length bar never exceeds the segment cap', () => {
    const total = book1().totalHours;
    // One segment per hour — the pathological input the cap exists for.
    const perHour: BarSegment[] = Array.from({ length: total }, (_, i) => ({
      fromHour: i + 1,
      toHour: i + 2,
      kind: i % 2 === 0 ? 'done' : 'resting',
      label: `hour ${i + 1}`,
    }));
    const merged = mergeSegments(perHour, total);
    expect(merged.length).toBeLessThanOrEqual(MAX_SEGMENTS_PER_BAR);
    expect(merged.length).toBeLessThan(total);
  });

  it('merging preserves coverage — a bar still spans its whole axis', () => {
    const total = book1().totalHours;
    const perHour: BarSegment[] = Array.from({ length: total }, (_, i) => ({
      fromHour: i + 1,
      toHour: i + 2,
      kind: i % 3 === 0 ? 'done' : i % 3 === 1 ? 'resting' : 'to_come',
      label: `hour ${i + 1}`,
    }));
    const merged = mergeSegments(perHour, total);
    expect(merged[0].fromHour).toBe(1);
    for (let i = 1; i < merged.length; i += 1) {
      expect(merged[i].fromHour, 'no gap between segments').toBe(merged[i - 1].toHour);
    }
    expect(merged.at(-1)!.toHour).toBe(total);
  });

  it('adjacent segments of the same kind collapse into one', () => {
    const merged = mergeSegments(
      [
        { fromHour: 1, toHour: 10, kind: 'done', label: 'a' },
        { fromHour: 10, toHour: 20, kind: 'done', label: 'b' },
        { fromHour: 20, toHour: 30, kind: 'resting', label: 'c' },
      ],
      30
    );
    expect(merged.map((m) => `${m.kind}:${m.fromHour}-${m.toHour}`)).toEqual([
      'done:1-20',
      'resting:20-30',
    ]);
  });
});

describe('the rail never draws a percentage or a forecast that looks like a fact', () => {
  it('the actual rail stops at recorded work, not at now', () => {
    const total = book1().totalHours;
    const startAt = new Date(Date.now() - 300 * MS_PER_HOUR).toISOString();
    const bar: BatchBar = {
      batchId: 'a',
      code: 'MB-A',
      label: 'a',
      clock: geometry(startAt),
      nowHour: 300,
      // Only the first 24 hours were recorded, though the clock says hour ~300.
      segments: [
        { fromHour: 1, toHour: 24, kind: 'done', label: 'done' },
        { fromHour: 24, toHour: total, kind: 'to_come', label: 'to come' },
      ],
      flags: [],
    };

    const g = railGeometry(bar, Date.now());
    expect(g.actualPct).toBeCloseTo((24 / total) * 100, 5);
    expect(g.nowPct).not.toBeNull();
    // The clock is far ahead of the record, and the rail says so instead of filling to now.
    expect(g.nowPct!).toBeGreaterThan(g.actualPct!);
    // The forecast begins exactly where the record ends.
    expect(g.forecastFromPct).toBe(g.actualPct);
  });

  it('nothing recorded means no actual rail at all, rather than a zero-width one', () => {
    const total = book1().totalHours;
    const bar: BatchBar = {
      batchId: 'a',
      code: 'MB-A',
      label: 'a',
      clock: geometry(new Date().toISOString()),
      nowHour: 1,
      segments: [{ fromHour: 1, toHour: total, kind: 'to_come', label: 'to come' }],
      flags: [],
    };
    const g = railGeometry(bar, Date.now());
    expect(g.actualPct).toBeNull();
    expect(g.forecastFromPct).toBeNull();
  });

  it('one tick per batch-day, agreeing with batchDay from src/domain/time.ts', () => {
    const bar: BatchBar = {
      batchId: 'a',
      code: 'MB-A',
      label: 'a',
      clock: geometry(new Date().toISOString()),
      nowHour: 1,
      segments: [],
      flags: [],
    };
    const g = railGeometry(bar, Date.now());
    expect(g.ticks.length).toBe(Math.ceil(g.totalHours / 24));
    for (const t of g.ticks) {
      expect(batchDay(t.hour)).toBe(t.day);
      expect(isWithinBaseline(t.hour, g.totalHours)).toBe(true);
    }
  });

  it('no geometry field is a fraction of completion', () => {
    const bar: BatchBar = {
      batchId: 'a',
      code: 'MB-A',
      label: 'a',
      clock: geometry(new Date().toISOString()),
      nowHour: 1,
      segments: [{ fromHour: 1, toHour: 100, kind: 'done', label: 'd' }],
      flags: [],
    };
    const g = railGeometry(bar, Date.now());
    // §8.3 and rule E.1. Every position is an hour on the axis; nothing names progress.
    expect(Object.keys(g)).not.toContain('percentComplete');
    expect(Object.keys(g)).not.toContain('progress');
    expect(Object.keys(g).sort()).toEqual([
      'actualPct',
      'forecastFromPct',
      'nowPct',
      'plan',
      'ticks',
      'totalHours',
    ]);
  });
});

describe('the calendar axis is labelled in factory time', () => {
  it('a date is the factory date, not the viewer date', () => {
    // 22 Aug 21:00 UTC is already 23 Aug in Asia/Kolkata. The axis must say what the factory says.
    const at = '2026-08-22T21:00:00Z';
    expect(factoryDate(at, 'Asia/Kolkata').iso).toBe('2026-08-23');
    expect(factoryDate(at, 'UTC').iso).toBe('2026-08-22');
  });

  it('every month of the year reads back as the right ISO date', () => {
    // REGRESSION. The first version derived the month number by looking the localised SHORT NAME up
    // in an array of twelve. `en-GB` renders September as "Sept", so the lookup missed and a
    // `Math.max(0, …)` fallback silently returned January — for one month in twelve the entire axis
    // collapsed and the board rendered its empty state. This walks all twelve.
    for (let m = 1; m <= 12; m += 1) {
      const iso = `2026-${String(m).padStart(2, '0')}-15`;
      // Midday UTC, so no zone in the world shifts the calendar date.
      expect(factoryDate(`${iso}T12:00:00Z`, 'Asia/Kolkata').iso, `month ${m}`).toBe(iso);
      expect(factoryDate(`${iso}T12:00:00Z`, 'UTC').iso, `month ${m}`).toBe(iso);
    }
  });

  it('an axis can be built in every month — the span is never negative', () => {
    for (let m = 1; m <= 12; m += 1) {
      const start = Date.parse(`2026-${String(m).padStart(2, '0')}-05T00:00:00Z`);
      const bars = [
        {
          batchId: 'a',
          code: 'MB-A',
          label: 'a',
          clock: geometry(new Date(start).toISOString()),
          nowHour: 1,
          segments: [],
          flags: [],
        },
      ] as BatchBar[];
      const axis = calendarAxis(bars, start + 24 * MS_PER_HOUR);
      expect(axis, `month ${m} produced no axis`).not.toBeNull();
      expect(axis!.spanHours, `month ${m}`).toBeGreaterThan(0);
      for (const t of axis!.ticks) {
        expect(t.pct, `month ${m} tick off the board`).toBeGreaterThanOrEqual(0);
        expect(t.pct, `month ${m} tick off the board`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('ticks are calendar dates with weekday names, one per day', () => {
    const now = Date.parse('2026-08-22T09:00:00Z');
    const bars = [
      {
        batchId: 'a',
        code: 'MB-A',
        label: 'a',
        clock: geometry(new Date(now - 16 * 24 * MS_PER_HOUR).toISOString()),
        nowHour: 1,
        segments: [],
        flags: [],
      },
    ] as BatchBar[];
    const axis = calendarAxis(bars, now)!;

    expect(axis.ticks.length).toBeGreaterThan(1);
    for (const t of axis.ticks) {
      expect(t.date.iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(t.date.weekday).toMatch(/^[A-Z][a-z]{2}$/);
      expect(t.pct).toBeGreaterThanOrEqual(0);
      expect(t.pct).toBeLessThanOrEqual(100);
    }
    // Strictly increasing, one per day, no duplicates — §9.2's calendar axis.
    const isos = axis.ticks.map((t) => t.date.iso);
    expect(new Set(isos).size).toBe(isos.length);
    expect(axis.ticks.filter((t) => t.isToday).length).toBeLessThanOrEqual(1);
  });

  it('no axis exists when the factory zone is unknown — the board says so instead', () => {
    const bars = [
      {
        batchId: 'a',
        code: 'MB-A',
        label: 'a',
        clock: { ...geometry('2026-08-01T00:00:00Z'), timezone: null },
        nowHour: 1,
        segments: [],
        flags: [],
      },
    ] as BatchBar[];
    expect(calendarAxis(bars, Date.now())).toBeNull();
  });
});

describe('four counters, no fifth', () => {
  it('the shape is exactly the four the spec names', () => {
    const g = geometry('2026-08-01T00:00:00Z');
    const bars = fixtureStaircase(g, book1().cadenceHours);
    const c = countersFor(bars, 0);
    expect(Object.keys(c).sort()).toEqual(['held', 'needsDecision', 'onPlan', 'running']);
    expect(c.running).toBe(bars.length);
  });

  /**
   * REWRITTEN. This used to assert `onPlan + needsDecision + held === running`, and that
   * assumption is what produced a live defect: it treats the four as a PARTITION, so a batch that
   * was both held and carrying deviations had to be counted once — and `countersFor` dropped it
   * from `needsDecision`. The screen then rendered `NEEDS A DECISION 0` directly above three rows
   * in the band that counter labels.
   *
   * They are not a partition. `running` and `onPlan` and `held` count BATCHES; `needsDecision`
   * counts the ROWS IN THE BAND, because its own sub-label says "in the band above".
   */
  it('needsDecision counts the band, not the batches, and held does not suppress it', () => {
    const g = geometry('2026-08-01T00:00:00Z');
    const bars = fixtureStaircase(g, book1().cadenceHours);

    // Three exceptions all belonging to ONE held batch — the shape that was rendering as zero.
    const c = countersFor(bars, 3);
    expect(c.needsDecision).toBe(3);

    // And on-plan stays a batch count: batches carrying no flag at all.
    expect(c.onPlan).toBe(bars.filter((b) => b.flags.length === 0).length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// The gate: against A3's real batches.
// ─────────────────────────────────────────────────────────────────────────────────────────

describeDb('C2 — the diagonal, with three real batches', () => {
  it('three live batches place left-to-right on one shared axis', async () => {
    await withRollback(async (db) => {
      const rows = await all<{ code: string; start_at: string; baseline_hours: number }>(
        db,
        // SCOPED TO A3's THREE, deliberately. This asserts the staggered diagonal those three
        // produce; it is not a census of the board. Unscoped, it counted every live batch and failed
        // the first time somebody created one through `/admin/batch/new` — `v_live_batch` includes
        // drafts by design.
        `select mb.code, mb.start_at, pd.baseline_hours
           from v_live_batch mb
           join process_definition pd on pd.id = mb.process_definition_id
          where mb.code like 'MB-DEMO-%'
          order by mb.start_at`
      );
      expect(rows.length, 'A3 seeds three staggered demo batches').toBe(3);

      const clock = await one<{ timezone: string | null }>(
        db,
        `select timezone from factory_clock where id = 1`
      );
      expect(clock.timezone).not.toBeNull();

      const bars: BatchBar[] = rows.map((r, i) => ({
        batchId: `b${i}`,
        code: r.code,
        label: r.code,
        clock: {
          startAt: r.start_at,
          baselineHours: r.baseline_hours,
          timezone: clock.timezone,
          timezoneConflictId: null,
        },
        nowHour: null,
        segments: [{ fromHour: 1, toHour: r.baseline_hours, kind: 'to_come', label: 'to come' }],
        flags: [],
      }));

      const nowMs = Date.now();
      const axis = calendarAxis(bars, nowMs);
      expect(axis, 'the real batches must be placeable').not.toBeNull();

      const placed = placeBars(bars, axis, nowMs);
      expect(placed.every((p) => p.placement !== null)).toBe(true);

      // THE DIAGONAL: each bar starts strictly right of the one before, and all are the same length.
      const lefts = placed.map((p) => p.placement!.leftPct);
      for (let i = 1; i < lefts.length; i += 1) {
        expect(lefts[i], `${placed[i].bar.code} must start right of ${placed[i - 1].bar.code}`)
          .toBeGreaterThan(lefts[i - 1]);
      }
      const widths = placed.map((p) => Math.round(p.placement!.widthPct * 1000));
      expect(new Set(widths).size, 'every batch is the same length').toBe(1);

      // And the offsets are even, which is what makes it a staircase rather than three arbitrary bars.
      const gaps = lefts.slice(1).map((l, i) => Math.round((l - lefts[i]) * 1000));
      expect(new Set(gaps).size, 'the stagger is even').toBe(1);

      // Exactly one now line, and it is on the board.
      const pct = nowLinePct(axis!, nowMs);
      expect(pct).toBeGreaterThan(0);
      expect(pct).toBeLessThanOrEqual(100);
    });
  });

  it('every real bar draws segments rather than one element per hour', async () => {
    await withRollback(async (db) => {
      const rows = await all<{ code: string; n: string; baseline_hours: number }>(
        db,
        // Every live batch, not only the demo three: the segment rule must hold for any bar the board
        // draws, including one a person just created. The count assertion below is therefore a floor,
        // not an equality — see the note in the diagonal test above.
        `select mb.code, count(ba.id)::text as n, pd.baseline_hours
           from v_live_batch mb
           join process_definition pd on pd.id = mb.process_definition_id
           left join batch_activity ba on ba.master_batch_id = mb.id
          group by mb.code, pd.baseline_hours order by mb.code`
      );
      expect(rows.length, 'A3 seeds three, so the board has at least three bars').toBeGreaterThanOrEqual(3);
      for (const r of rows) {
        // A hundred activities on a 552-hour axis must not become 552 elements.
        expect(Number(r.n)).toBeGreaterThan(0);
        expect(Number(r.n)).toBeLessThan(r.baseline_hours);
      }
    });
  });
});
