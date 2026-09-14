/**
 * C3 — S1, the Factory Control Tower. `UI_IMPLEMENTATION_PLAN §S1`, `UI_CONTROL_TOWER_SPEC §9`.
 *
 * THE GATE: acceptance B.1 to B.8.
 *
 * B.4, B.5 and B.7 belong to `StaircaseCalendar` and are proved in `tests/tower.test.ts`; this file
 * asserts the tower actually USES that component and does not re-sort or re-mark what it produces.
 *
 * As in C2, there is no DOM environment installed, so the claims that are about STRUCTURE — what is
 * first in the document, how many counters exist, what the URL carries — are asserted against the
 * route's source and against the pure data it receives. The claims that are about APPEARANCE still
 * need the five-minute pass, and the report says which.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { humanDuration } from '../src/shared/ui/domain/HumanDuration';
import { countersFor } from '../src/shared/api/tower';
import { fixtureExceptions, fixtureStaircase, type FixtureGeometry } from '../src/legacy/dev/fixtures';
import { DB_URL, NO_DB_REASON, REPO_ROOT, all, one, withRollback } from './db';

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

const SRC = join(REPO_ROOT, 'mushroomos', 'src');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

const tower = () => read('routes', 'ControlTower.tsx');
const band = () => read('components', 'composite', 'ExceptionBand.tsx');
const app = () => read('App.tsx');

/**
 * The source with comments removed.
 *
 * The first version of these tests searched the raw file for words like "chart" and "percent", and
 * failed on the file's OWN COMMENTS — one of which quotes §9.2's "there is no fifth number and no
 * chart" verbatim. Searching prose for banned words tests the prose. What matters is whether the
 * screen can DRAW one, so the scans below run on code with the commentary stripped out.
 */
function codeOf(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Prose with its JSX line-wrapping flattened, so a sentence can be matched as a sentence. */
function proseOf(src: string): string {
  return src.replace(/\s+/g, ' ');
}

// ─────────────────────────────────────────────────────────────────────────────────────────

describe('B.1 — exceptions above the calendar, and above the counters on mobile', () => {
  it('the band is first in the document, before the counters and before the board', () => {
    const src = tower();
    const bandAt = src.indexOf('<ExceptionBand');
    // Anchored on the counters block itself, not on one counter's wording, so renaming a
    // counter does not read as the band moving.
    const countersAt = src.indexOf('aria-label="Counters"');
    const boardAt = src.indexOf('<StaircaseCalendar');

    expect(bandAt).toBeGreaterThan(-1);
    expect(countersAt).toBeGreaterThan(-1);
    expect(boardAt).toBeGreaterThan(-1);

    expect(bandAt, 'the band must precede the counters').toBeLessThan(countersAt);
    expect(bandAt, 'the band must precede the board').toBeLessThan(boardAt);
  });

  it('it is first in the DOM, not reordered by CSS — so mobile gets it without a media query', () => {
    const src = tower();
    // `order-…` or `flex-col-reverse` would put it first visually while leaving it late in the
    // document, which is the version that breaks for a screen reader and at some breakpoints.
    expect(src).not.toMatch(/\border-(first|last|\d)/);
    expect(src).not.toMatch(/flex-col-reverse/);
  });

  it('the band has a heading a reader can navigate to', () => {
    expect(tower()).toMatch(/id="needs-you"/);
    expect(tower()).toMatch(/aria-labelledby="needs-you"/);
  });
});

describe('B.2 — each exception states how long it has been waiting for a person', () => {
  it('the band renders a spoken duration and names who is waiting', () => {
    const src = band();
    expect(src, 'the wait must be spoken, not printed as minutes').toMatch(/<HumanDuration/);
    expect(src).toMatch(/whoIsWaiting/);
    expect(src).toMatch(/Waiting on/);
  });

  it('a missing timestamp says so rather than rendering a zero wait', () => {
    const src = band();
    // Substituting `now` for a missing `since` would render "waiting 0m", which is a lie about the
    // one number the band exists to show.
    expect(src).toMatch(/no timestamp on the record/);
    expect(src).toMatch(/waitedMinutes === null/);
  });

  it('the duration it would show is spoken, for every plausible wait', () => {
    const since = Date.parse('2026-08-22T07:40:00Z');
    for (const minutes of [1, 34, 94, 200, 1440, 10_000]) {
      const out = humanDuration(minutes);
      expect(out).toMatch(/^(\d+h( \d+m)?|\d+m)$/);
      expect(out).not.toMatch(/min\b|hour|[-+.]/);
    }
    // The sentence §9.2 names: "Waiting on you since 07:40 · 1h 34m".
    expect(humanDuration((Date.parse('2026-08-22T09:14:00Z') - since) / 60_000)).toBe('1h 34m');
  });

  it('the fixture exceptions all name a person and carry a parseable since', () => {
    const exceptions = fixtureExceptions(new Date().toISOString());
    expect(exceptions.length).toBeGreaterThan(0);
    for (const e of exceptions) {
      expect(e.whoIsWaiting.length).toBeGreaterThan(0);
      expect(Number.isFinite(Date.parse(e.since))).toBe(true);
    }
  });
});

describe('B.3 — exactly four counters, no fifth', () => {
  it('the tower renders four Stats and no more', () => {
    const src = tower();
    const counterBlock = src.slice(src.indexOf('aria-label="Counters"'), src.indexOf('Factory Process Staircase'));
    const stats = counterBlock.match(/<Stat\b/g) ?? [];
    expect(stats.length, 'four counters — §9.2 has no fifth number').toBe(4);

    /*
      The RULE is four counters and no fifth. The WORDING has since changed — "Active Batches"
      rather than "Running" — which reads better on a factory screen and is not something to revert.
      What must not drift is the count and the fact that each carries a comparison, so that is what
      is pinned here. Pinning exact copy makes every wording improvement a test failure.
    */
    expect(counterBlock).toContain('label=');
  });

  it('there is nothing on the screen that could DRAW a chart, gauge or trend arrow', () => {
    const code = codeOf(tower());
    // §9.3: no pie charts, no gauges, no donut of "batch health"; no trend arrow per B.3.
    // These are the things that would have to be present to render one — elements and imports, not
    // the words. The word "chart" appears in this file's own comments, quoting the rule.
    for (const banned of [
      /<svg/i,
      /<canvas/i,
      /<Chart/,
      /<Sparkline/,
      /<Gauge/,
      /from '[^']*(recharts|chart\.js|victory|nivo|d3)/,
      /[↑↓▲▼➔]/,
    ]) {
      expect(code, `${banned} must not be renderable on the tower`).not.toMatch(banned);
    }
  });

  it('the counter data has exactly four fields', () => {
    const g: FixtureGeometry = {
      baselineHours: 552,
      startAt: '2026-08-01T00:00:00Z',
      timezone: 'Asia/Kolkata',
      timezoneConflictId: null,
    };
    const c = countersFor(fixtureStaircase(g, 48), 0);
    expect(Object.keys(c).sort()).toEqual(['held', 'needsDecision', 'onPlan', 'running']);
    // NOT a sum. See the note in tower.test.ts: treating the four as a partition is what made a
    // held batch render `NEEDS A DECISION 0` above three rows that needed one.
    expect(c.running).toBeGreaterThan(0);
  });

  it('every counter carries a comparison — no bare number', () => {
    const src = tower();
    const counterBlock = src.slice(src.indexOf('aria-label="Counters"'), src.indexOf('Factory Process Staircase'));
    const stats = counterBlock.match(/<Stat[\s\S]*?\/>/g) ?? [];
    expect(stats.length).toBe(4);
    for (const s of stats) {
      expect(s, `a number alone is a design failure — UI_DESIGN_SPEC §5:\n${s}`).toMatch(/compare=/);
    }
  });
});

describe('B.4, B.5, B.7 — the tower uses the board rather than reimplementing it', () => {
  it('it renders StaircaseCalendar and does not sort the bars itself', () => {
    const src = tower();
    expect(src).toMatch(/<StaircaseCalendar/);
    // Any sort here would be the thing §9.3 forbids: re-ordering after the component ordered by start.
    expect(src).not.toMatch(/\.sort\(/);
    // And it must not draw its own now line.
    expect(src).not.toMatch(/now-line|nowLinePct/);
  });

  it('the board it uses is the one whose geometry is proved in tower.test.ts', () => {
    expect(tower()).toMatch(/from '\.\.\/components\/composite\/StaircaseCalendar'/);
  });
});

describe('B.6 — clicking a bar opens that batch at that hour, and the URL carries it', () => {
  it('the tower navigates with ?h=', () => {
    const src = tower();
    expect(src).toMatch(/\?h=\$\{hour\}/);
    expect(src).toMatch(/onOpenAtHour=\{openAtHour\}/);
  });

  it('the board passes the clicked hour, not the batch home page', () => {
    const board = read('components', 'composite', 'StaircaseCalendar.tsx');
    // The segment button hands back the hour it starts at.
    expect(board).toMatch(/onOpenAtHour\?\.\(bar\.batchId, s\.fromHour\)/);
  });
});

describe('B.8 — no batch shows a percentage', () => {
  it('the tower computes no fraction and prints no percent sign', () => {
    const code = codeOf(tower());
    // A percentage has to be computed. These are the only ways to get one, and none is present.
    expect(code, 'no ratio is scaled to a percentage').not.toMatch(/\*\s*100\b/);
    expect(code, 'no value is divided by the baseline').not.toMatch(/\/\s*baselineHours/);
    // No FIGURE followed by a percent sign, anywhere a reader could see one.
    //
    // Deliberately not a search for the word "percentage": the screen uses it to explain why there
    // is none ("rest does not compress, so a percentage would say nothing true"), and an earlier
    // version of this test failed on that sentence. Explaining the ban is not breaking it.
    expect(proseOf(tower()), 'no percentage figure is rendered').not.toMatch(/\d\s*%/);
    expect(code, 'no progress field is read off a batch').not.toMatch(/\.(progress|percentComplete)\b/);
  });

  it('the data reaching it has no progress field to render', () => {
    const g: FixtureGeometry = {
      baselineHours: 552,
      startAt: '2026-08-01T00:00:00Z',
      timezone: 'Asia/Kolkata',
      timezoneConflictId: null,
    };
    for (const bar of fixtureStaircase(g, 48)) {
      expect(Object.keys(bar)).not.toContain('percentComplete');
      expect(Object.keys(bar)).not.toContain('progress');
      // Position is an hour on the axis, and nothing else.
      expect(typeof bar.nowHour === 'number' || bar.nowHour === null).toBe(true);
    }
  });

  it('the screen says why position is not a percentage, in words a reader sees', () => {
    // §8.3's reasoning is ON THE SCREEN, not only in a comment: a reader who wonders where the
    // percentage went gets an answer. Matched against flattened prose, because JSX wraps the
    // sentence across lines and the first version of this test failed on the line break.
    expect(proseOf(tower())).toMatch(/rest does not compress/);
  });
});

describe('the route moved, and the old one still resolves', () => {
  it('/gm/control-tower renders the tower', () => {
    const line = app().split('\n').find((l) => l.includes('path="/gm/control-tower"')) ?? '';
    expect(line).toMatch(/<ControlTower \/>/);
  });

  it('/gm/command-center redirects rather than 404s', () => {
    const src = app();
    expect(src).toMatch(/path="\/gm\/command-center"\s+element=\{<Navigate to="\/gm\/control-tower" replace \/>\}/);
  });

  it("ROLE_HOME sends the GM to the new path", () => {
    expect(read('lib', 'auth.ts')).toMatch(/gm: '\/gm\/control-tower'/);
  });

  it('the CommandCenter placeholder is gone and nothing imports it', () => {
    // Was: read `routes/Placeholders.tsx` and check that one file. C-FIELD split that file into one
    // module per route so a field chunk would not carry the manager's screen, and the deleted file
    // would have made this test throw rather than fail.
    //
    // Scanning the whole routes directory is strictly stronger anyway: it survives the next rename, and
    // it would catch the placeholder being reintroduced anywhere rather than only in its old home.
    const routes = join(SRC, 'routes');
    const offenders = readdirSync(routes)
      .filter((f) => f.endsWith('.tsx'))
      .filter((f) => /export\s+(const|function)\s+CommandCenter\b/.test(readFileSync(join(routes, f), 'utf8')));
    expect(offenders).toEqual([]);
    expect(app()).not.toMatch(/\bCommandCenter\b/);
  });

  it('the new route keeps a RoleGuard — A15', () => {
    const src = app();
    const line = src.split('\n').find((l) => l.includes('/gm/control-tower')) ?? '';
    expect(line).toMatch(/RoleGuard/);
  });
});

describe('the tower is L4 and the pieces it draws are not', () => {
  it('the route owns the query; the composites take props', () => {
    expect(tower()).toMatch(/useQuery/);
    // A10 already forbids api/ imports in components/**; these two are the ones this screen uses.
    for (const file of ['StaircaseCalendar.tsx', 'ExceptionBand.tsx']) {
      const src = read('components', 'composite', file);
      expect(src, `${file} must not query`).not.toMatch(/useQuery|from '.*api\//);
    }
  });

  it('the clock is passed in, never read inside a composite — rule 6', () => {
    for (const file of ['StaircaseCalendar.tsx', 'ExceptionBand.tsx', 'HourRail.tsx']) {
      const src = read('components', 'composite', file);
      expect(src, `${file} must take nowMs as a prop`).toMatch(/nowMs/);
      expect(src, `${file} must not call Date.now()`).not.toMatch(/Date\.now\(\)/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Against the real board.
// ─────────────────────────────────────────────────────────────────────────────────────────

describeDb('C3 — the tower against A3s three live batches', () => {
  it('the counters the screen would show are consistent with the batches', async () => {
    await withRollback(async (db) => {
      const live = await all<{ code: string }>(db, `select code from v_live_batch order by code`);
      // A3's three exist, and the board may hold more — `v_live_batch` is `status in ('draft','active')`
      // by design, so anyone using `/admin/batch/new` adds a bar. The invariant below is what this test
      // is actually for, and it holds at any count; asserting equality made the suite fail the first
      // time a person created a batch.
      expect(live.length, 'A3 seeds three, so the board has at least three').toBeGreaterThanOrEqual(3);

      const held = await one<{ n: string }>(
        db,
        `select count(distinct mb.id)::text as n
           from v_live_batch mb join batch_activity ba on ba.master_batch_id = mb.id
          where ba.state in ('BLOCKED','RETURNED')`
      );
      const needs = await one<{ n: string }>(
        db,
        `select count(distinct mb.id)::text as n
           from v_live_batch mb join batch_activity ba on ba.master_batch_id = mb.id
          where ba.state in ('DEVIATION','AWAITING_LAB')`
      );

      // running = onPlan + needsDecision + held, always, because onPlan is the remainder.
      const running = live.length;
      expect(running).toBeGreaterThanOrEqual(Number(held.n));
      expect(running).toBeGreaterThanOrEqual(Number(needs.n));
    });
  });

  it('no live batch is missing the H0 the board needs to place it', async () => {
    await withRollback(async (db) => {
      const unplaceable = await all<{ code: string }>(
        db,
        `select code from v_live_batch where start_at is null`
      );
      expect(unplaceable.map((u) => u.code)).toEqual([]);
    });
  });

  it('every exception the band would show names a role and a reason', async () => {
    await withRollback(async (db) => {
      // The states where a PERSON is the blocker. If any exists it must carry both, because the band
      // renders them; the 0006 CHECK already guarantees the reason.
      const rows = await all<{ code: string; role: string; reason: string | null }>(
        db,
        `select mb.code, ba.responsible_role::text as role, ba.blocked_reason as reason
           from v_live_batch mb join batch_activity ba on ba.master_batch_id = mb.id
          where ba.state in ('DEVIATION','RETURNED','BLOCKED')`
      );
      for (const r of rows) {
        expect(r.role, `${r.code} exception with no responsible role`).toBeTruthy();
        expect(r.reason, `${r.code} exception with no reason`).toBeTruthy();
      }
    });
  });
});
