/**
 * T0 — the time contract, asserted against the factory's own hour grid.
 *
 * `docs/TIME_CONTRACT.md` §2 defines these eight invariants. Every expected hour, date, slot
 * and bound is READ FROM THE FIXTURE. Nothing is typed in. A test that restates a developer's
 * memory of the spreadsheet proves nothing about the spreadsheet — and writing the process
 * length as a literal here would land it inside `src/`, where invariant 8 forbids it.
 *
 * TBD-47 IS ANSWERED BY THE GRID, and this file is the proof. Two slot conventions were
 * possible; sampling the endpoint hours could not tell them apart. The complete grid can: the
 * workbook uses slot 24, which only one reading can express. Both readings are asserted here,
 * one to match every cell and the other to fail, so the reasoning stays checkable.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import { batchDay, batchHour, batchInstant, isWithinBaseline, preBatchTargetInstant, wallClock } from './time';

// ─────────────────────────────────────────────────────────────────────────────────────────
// Fixture loading
//
// The fixture lives at docs/source/, outside mushroomos/ and therefore outside tsconfig's
// include and Vite's fs root. Read it with node:fs rather than importing it, and verify it
// against the workbook so an edited fixture fails loudly instead of quietly.
// ─────────────────────────────────────────────────────────────────────────────────────────

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const APP_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURE_PATH = join(REPO_ROOT, 'docs', 'source', 'book1_hour_grid.json');
const WORKBOOK_PATH = join(REPO_ROOT, 'mails', 'Book1.xlsx');

/** One grid cell: [Book1 hour, calendar date, hour-of-day slot 1..24]. */
type Cell = [hour: number, date: string, slot: number];

type FixtureBatch = {
  batch: number;
  start_date: string;
  start_slot: number;
  end_date: string;
  end_slot: number;
  total_hours: number;
  contiguous: boolean;
  hours: Cell[];
};

type Fixture = {
  source: string;
  sha256: string;
  revision: number;
  batches: FixtureBatch[];
};

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Fixture;
const batches = fixture.batches;

/**
 * TBD-47, answered by the grid.
 *
 * Two readings were possible: slot k covers `[k-1:00, k:00)` (H0 = 05:00), or slot k covers
 * `[k:00, k+1:00)` (H0 = 06:00). Sampling the two endpoint hours could not tell them apart —
 * both put hour 1 in slot 6 and the last hour in slot 5. The COMPLETE grid does tell them
 * apart, because the workbook uses slot 24, which the second reading cannot express.
 *
 * `CONFIRMED` reproduces all 1,656 cells. `DISPROVEN` is kept and asserted to fail, so the
 * reasoning is preserved rather than reduced to a comment nobody can check.
 *
 * Everything is computed in UTC so results do not depend on the machine's timezone and DST
 * cannot perturb a test about a pure hour axis. Which real zone 05:00 is stated in remains
 * TBD-50, and belongs to rendering, not to this module.
 */
const CONFIRMED = {
  label: 'slot k covers [k-1:00, k:00) — H0 = 05:00',
  h0HourUtc: 5,
  slotOf: (d: Date) => d.getUTCHours() + 1,
} as const;

const DISPROVEN = {
  label: 'slot k covers [k:00, k+1:00) — H0 = 06:00',
  h0HourUtc: 6,
  slotOf: (d: Date) => d.getUTCHours(),
} as const;

const startAtFor = (b: FixtureBatch, h0HourUtc: number) =>
  new Date(`${b.start_date}T${String(h0HourUtc).padStart(2, '0')}:00:00Z`);

const utcDateOf = (d: Date) => d.toISOString().slice(0, 10);

const HOURS_PER_DAY = 24;
const dayBoundaryHours = (b: FixtureBatch) =>
  b.hours.map(([h]) => h).filter((h) => h % HOURS_PER_DAY === 1);

// ─────────────────────────────────────────────────────────────────────────────────────────

describe('fixture provenance', () => {
  it('records the SHA-256 of the workbook it was extracted from', () => {
    const actual = createHash('sha256').update(readFileSync(WORKBOOK_PATH)).digest('hex');
    expect(actual).toBe(fixture.sha256);
  });

  it('is revision 2 — the complete grid, not a sample', () => {
    // Revision 1 held nine sampled checkpoints and could anchor only two of the twenty-three
    // day boundaries, so invariant 5 would have asserted the model against itself for the
    // other twenty-one. TIME_CONTRACT §2.
    expect(fixture.revision).toBeGreaterThanOrEqual(2);
    for (const b of batches) {
      expect(b.hours.length).toBe(b.total_hours);
      expect(dayBoundaryHours(b).length).toBeGreaterThan(2);
    }
  });
});

describe('invariant 1 — hour-cell count', () => {
  it('every batch has exactly total_hours cells', () => {
    for (const b of batches) expect(b.hours.length).toBe(b.total_hours);
  });

  it('total_hours is identical across all three batches', () => {
    expect(new Set(batches.map((b) => b.total_hours)).size).toBe(1);
  });
});

describe('invariant 2 — contiguity', () => {
  it('hours run 1..total_hours with no gap and no repeat', () => {
    for (const b of batches) {
      const hours = b.hours.map(([h]) => h);
      expect(hours).toEqual(Array.from({ length: b.total_hours }, (_, i) => i + 1));
    }
  });
});

describe('TBD-47 — the grid disambiguates its own slot convention', () => {
  it('the workbook uses all 24 slots, including slot 24', () => {
    const slots = new Set(batches.flatMap((b) => b.hours.map(([, , s]) => s)));
    expect(slots.size).toBe(HOURS_PER_DAY);
    expect(slots.has(HOURS_PER_DAY)).toBe(true);
  });

  it('the confirmed reading reproduces every cell', () => {
    let mismatches = 0;
    for (const b of batches) {
      const startAt = startAtFor(b, CONFIRMED.h0HourUtc);
      for (const [hour, date, slot] of b.hours) {
        const w = wallClock(hour, startAt);
        if (utcDateOf(w) !== date || CONFIRMED.slotOf(w) !== slot) mismatches += 1;
      }
    }
    expect(mismatches).toBe(0);
  });

  it('the other reading is disproven — it cannot express slot 24', () => {
    let mismatches = 0;
    for (const b of batches) {
      const startAt = startAtFor(b, DISPROVEN.h0HourUtc);
      for (const [hour, date, slot] of b.hours) {
        const w = wallClock(hour, startAt);
        if (utcDateOf(w) !== date || DISPROVEN.slotOf(w) !== slot) mismatches += 1;
      }
    }
    // One per day boundary that lands on slot 24, across all three batches. If this ever
    // reaches 0, the fixture has been re-sampled and invariant 5 has lost its anchor.
    expect(mismatches).toBeGreaterThan(0);
  });
});

describe(`the grid, read as ${CONFIRMED.label}`, () => {
  const { h0HourUtc, slotOf } = CONFIRMED;

  it('invariant 3 — hour 1 falls on start_date in start_slot', () => {
    for (const b of batches) {
      const w = wallClock(1, startAtFor(b, h0HourUtc));
      expect(utcDateOf(w)).toBe(b.start_date);
      expect(slotOf(w)).toBe(b.start_slot);
    }
  });

  it('invariant 4 — the last hour falls on end_date in end_slot', () => {
    for (const b of batches) {
      const w = wallClock(b.total_hours, startAtFor(b, h0HourUtc));
      expect(utcDateOf(w)).toBe(b.end_date);
      expect(slotOf(w)).toBe(b.end_slot);
    }
  });

  it('reproduces every single cell of the grid', () => {
    // The strongest statement available: every cell of every batch. If the model and the
    // factory's sheet disagree anywhere, this is where it shows.
    for (const b of batches) {
      const startAt = startAtFor(b, h0HourUtc);
      for (const [hour, date, slot] of b.hours) {
        const w = wallClock(hour, startAt);
        expect({ hour, date: utcDateOf(w), slot: slotOf(w) }).toEqual({ hour, date, slot });
      }
    }
  });

  it('invariant 7 — batchHour(wallClock(n)) round-trips for every hour', () => {
    for (const b of batches) {
      const startAt = startAtFor(b, h0HourUtc);
      for (let n = 1; n <= b.total_hours; n += 1) {
        expect(batchHour(wallClock(n, startAt), startAt)).toBe(n);
      }
    }
  });

  it('an instant anywhere inside an hour resolves to that hour', () => {
    for (const b of batches) {
      const startAt = startAtFor(b, h0HourUtc);
      for (const [hour] of b.hours) {
        const start = wallClock(hour, startAt).getTime();
        expect(batchHour(new Date(start), startAt)).toBe(hour);
        expect(batchHour(new Date(start + 59 * 60_000), startAt)).toBe(hour);
      }
    }
  });
});

describe('invariant 5 — the day boundary holds across the whole batch', () => {
  it('every hour = 1 (mod 24) sits in the same slot as hour 1', () => {
    let anchored = 0;
    for (const b of batches) {
      const bySlot = new Map(b.hours.map(([h, , slot]) => [h, slot]));
      for (const h of dayBoundaryHours(b)) {
        expect(bySlot.get(h)).toBe(b.start_slot);
        anchored += 1;
      }
    }
    // 23 boundaries x 3 batches. Each assertion is anchored to a real cell of the workbook,
    // not to the model. This is what proves the boundary holds across all 23 days rather than
    // only at the two ends.
    expect(anchored).toBe(batches.length * dayBoundaryHours(batches[0]).length);
    expect(anchored).toBeGreaterThan(60);
  });
});

describe('invariant 6 — batchDay agrees with the grid', () => {
  it('increments exactly at each day-boundary hour', () => {
    for (const b of batches) {
      for (const h of dayBoundaryHours(b)) {
        expect(batchDay(h)).toBe((h - 1) / HOURS_PER_DAY);
        if (h > 1) expect(batchDay(h - 1)).toBe(batchDay(h) - 1);
      }
    }
  });

  it('is constant across each 24-hour span', () => {
    for (const b of batches) {
      for (const h of dayBoundaryHours(b)) {
        const last = Math.min(h + HOURS_PER_DAY - 1, b.total_hours);
        expect(batchDay(last)).toBe(batchDay(h));
      }
    }
  });

  it('the final hour lands on the last batch-day, bounds read from the fixture', () => {
    for (const b of batches) {
      const lastDay = Math.floor((b.total_hours - 1) / HOURS_PER_DAY);
      expect(batchDay(b.total_hours)).toBe(lastDay);
      // The batch spans one more calendar date than it does batch-days, because H0 is offset
      // into the day. TIME_CONTRACT §2.3.
      const spanDays =
        (Date.parse(`${b.end_date}T00:00:00Z`) - Date.parse(`${b.start_date}T00:00:00Z`)) /
        86_400_000;
      expect(spanDays).toBe(lastDay + 1);
    }
  });
});

describe('interval scale vs point scale — TIME_CONTRACT §1.2', () => {
  it('wallClock(n) and batchInstant(n) differ by exactly one hour', () => {
    const startAt = startAtFor(batches[0], CONFIRMED.h0HourUtc);
    for (const [hour] of batches[0].hours) {
      const diff = batchInstant(hour, startAt).getTime() - wallClock(hour, startAt).getTime();
      expect(diff).toBe(3_600_000);
    }
  });

  it('batchInstant(0) is the batch start; hour 1 begins there', () => {
    const startAt = startAtFor(batches[0], CONFIRMED.h0HourUtc);
    expect(batchInstant(0, startAt).getTime()).toBe(startAt.getTime());
    expect(wallClock(1, startAt).getTime()).toBe(startAt.getTime());
  });

  it('the last hour ends at batchInstant(total_hours)', () => {
    for (const b of batches) {
      const startAt = startAtFor(b, CONFIRMED.h0HourUtc);
      const endOfLastHour = wallClock(b.total_hours, startAt).getTime() + 3_600_000;
      expect(batchInstant(b.total_hours, startAt).getTime()).toBe(endOfLastHour);
    }
  });
});

describe('guards', () => {
  const startAt = new Date('2026-08-01T05:00:00Z');

  it('refuses an instant before H0 rather than returning a negative hour', () => {
    expect(() => batchHour(new Date(startAt.getTime() - 1), startAt)).toThrow(/before H0/);
  });

  it('refuses a non-1-based hour', () => {
    expect(() => wallClock(0, startAt)).toThrow(/1-based/);
    expect(() => batchDay(0)).toThrow(/1-based/);
    expect(() => wallClock(1.5, startAt)).toThrow(/whole number/);
  });

  it('refuses an unparseable instant', () => {
    expect(() => batchHour('not a date', startAt)).toThrow(/valid instant/);
  });

  it('isWithinBaseline takes the baseline as a parameter, from the fixture', () => {
    const total = batches[0].total_hours;
    expect(isWithinBaseline(total, total)).toBe(true);
    expect(isWithinBaseline(total + 1, total)).toBe(false);
  });
});

describe('preBatchTargetInstant — Pre-H0 data-driven target calculation', () => {
  it('calculates the target instant correctly with configured offset', () => {
    const h0 = new Date('2026-08-26T18:00:00.000Z');
    const target10 = preBatchTargetInstant(h0, 10);
    expect(target10.toISOString()).toBe('2026-08-26T08:00:00.000Z');

    const target12 = preBatchTargetInstant(h0, 12);
    expect(target12.toISOString()).toBe('2026-08-26T06:00:00.000Z');
  });

  it('rejects negative offset hours', () => {
    const h0 = new Date('2026-08-26T18:00:00.000Z');
    expect(() => preBatchTargetInstant(h0, -1)).toThrow(RangeError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Invariant 8 — the process length may not be hard-coded.
//
// The exclusion list is exhaustive and written here, not left to the reader's judgement:
// seed data (where the process definition legitimately states its own length) and this file
// (which must contain the search strings). Nothing else.
// ─────────────────────────────────────────────────────────────────────────────────────────

const SCAN_ROOTS = ['src', 'supabase'];
const SCAN_EXTENSIONS = ['.ts', '.tsx', '.sql', '.mjs'];
const EXCLUDED_DIRS = [join('supabase', 'seed')];
const THIS_FILE = relative(APP_ROOT, fileURLToPath(import.meta.url)).split(sep).join('/');

/**
 * Known pre-existing violations, each with the step that removes it.
 *
 * These are NOT permitted forever. The count is asserted exactly, so fixing one makes the test
 * fail until the number here is decremented — which is the point. The debt is visible and it
 * only shrinks deliberately.
 */
const KNOWN_VIOLATIONS: { file: string; count: number; clearedBy: string; note: string }[] = [
  {
    file: 'src/routes/NewBatch.tsx',
    count: 0,
    clearedBy: 'A2',
    note: 'CLEARED at A2 — the Stat now reads baseline_days/baseline_hours from process_definition',
  },
  {
    file: 'src/api/schedule.ts',
    count: 0,
    clearedBy: 'A2',
    note: 'CLEARED at A2 — DAY_TITLES moved to the process_day table, seeded in s10',
  },
  {
    file: 'src/routes/ScheduleBuilder.tsx',
    count: 4,
    clearedBy: 'C8',
    note: 'day-count in a comment, a heading and body copy',
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SCAN_EXTENSIONS.some((e) => full.endsWith(e))) out.push(full);
  }
  return out;
}

/** Returns `relPath -> number of offending lines`. */
function scanForHardCodedLength(): Map<string, number> {
  // Built at runtime so the strings this scanner looks for are not themselves literals in the
  // scanned form. The process length and its day count, as whole-word matches.
  const forbidden = [String(23 * 24), String(24 - 1)];
  // String.raw, NOT a template literal. `\d` is not a recognised escape in a template literal, so
  // JS collapses it to the letter `d` — the lookbehind silently became `(?<![d.])` and the
  // lookahead `(?!d|\.d)`. The guard was matching `23` inside `0023` and inside `1234`, and had
  // been over-reporting since it was written. A regex built by string concatenation needs raw.
  const pattern = new RegExp(
    String.raw`(?<![\d.])(` + forbidden.join('|') + String.raw`)(?!\d|\.\d)`
  );

  const hits = new Map<string, number>();
  for (const root of SCAN_ROOTS) {
    for (const file of walk(join(APP_ROOT, root))) {
      const rel = relative(APP_ROOT, file).split(sep).join('/');
      if (rel === THIS_FILE) continue;
      if (EXCLUDED_DIRS.some((d) => rel.startsWith(d.split(sep).join('/')))) continue;

      const n = readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => pattern.test(line)).length;
      if (n > 0) hits.set(rel, n);
    }
  }
  return hits;
}

describe('invariant 8 — the process length is never hard-coded', () => {
  it('finds no violation outside the enumerated debt list', () => {
    const hits = scanForHardCodedLength();
    const allowed = new Map(KNOWN_VIOLATIONS.map((v) => [v.file, v.count]));

    const unexpected = [...hits.entries()]
      .filter(([file, n]) => n !== (allowed.get(file) ?? 0))
      .map(([file, n]) => `${file}: found ${n}, allowed ${allowed.get(file) ?? 0}`);

    expect(
      unexpected,
      'A new hard-coded process length appeared, or a known one was fixed.\n' +
        'If you FIXED one, decrement its count in KNOWN_VIOLATIONS.\n' +
        'If you ADDED one, read the module header of time.ts instead.'
    ).toEqual([]);
  });

  it('the debt list only shrinks — every entry names the step that clears it', () => {
    for (const v of KNOWN_VIOLATIONS) {
      expect(v.clearedBy).toMatch(/^[A-C][0-9]+$/);
      expect(v.note.length).toBeGreaterThan(10);
    }
  });

  it('NEGATIVE CHECK — the scanner actually fails when a violation is introduced', () => {
    // A grep test that has never been seen to fail is not evidence. TIME_CONTRACT §2.
    const probe = join(APP_ROOT, 'src', 'domain', '__invariant8_probe.tmp.ts');
    const rel = 'src/domain/__invariant8_probe.tmp.ts';
    try {
      writeFileSync(probe, `export const processLengthHours = ${23 * 24};\n`, 'utf8');
      expect(scanForHardCodedLength().get(rel)).toBe(1);
    } finally {
      rmSync(probe, { force: true });
    }
    expect(scanForHardCodedLength().has(rel)).toBe(false);
  });
});
