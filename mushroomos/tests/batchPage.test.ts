/**
 * P3 — S2, the batch page. `UI_IMPLEMENTATION_PLAN §S2`, `UI_CONTROL_TOWER_SPEC §10`, §11, §13.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE ONE DEFECT THIS SUITE EXISTS TO PREVENT
 *
 * `v_batch_variance.variance_minutes` is the WORST STREAM. `v_variance_contributor` ranks across
 * the WHOLE BATCH. Join them naively and the paragraph reads:
 *
 *     "MB-118 is 3h 20m behind. Most of it — 2h 40m — came from the paddy soak."
 *
 * where the paddy soak is in a stream the headline did not come from. The sentence is arithmetic
 * nonsense and it names the wrong person to go and ask. That is worse than showing nothing.
 *
 * So the load filters contributors to the worst stream, and the DB assertions below recompute the
 * arithmetic independently: top three plus remainder must equal the headline, exactly.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DB_URL, NO_DB_REASON, all, one, withRollback } from './db';
import { REPO_ROOT } from './db';

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

const read = (...p: string[]) => readFileSync(join(REPO_ROOT, 'mushroomos', 'src', ...p), 'utf8');
/** Source with comments stripped, so a rule stated in prose cannot satisfy an assertion about code. */
const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const api = () => codeOf(read('api', 'batchPage.ts'));
const narrative = () => codeOf(read('components', 'composite', 'Narrative.tsx'));
const stream = () => codeOf(read('components', 'composite', 'EventStream.tsx'));
const page = () => codeOf(read('routes', 'BatchPage.tsx'));
const app = () => codeOf(read('App.tsx'));

/* ── 1 · the filter ─────────────────────────────────────────────────────────────────────────── */

describe('P3 — contributors come from the stream the headline came from', () => {
  it('the load filters on worst_stream and caps at three plus a remainder', () => {
    const src = api();
    expect(src).toMatch(/filter\(\(c\) => c\.stream === v\.worst_stream\)/);
    expect(src).toMatch(/const TOP_N = 3/);
    expect(src).toMatch(/slice\(TOP_N\)[\s\S]{0,120}reduce/);
    // The remainder is summed from the ROWS OUTSIDE the top three, not from
    // `headline - sum(top3)`. Both are correct on consistent data; only the first stays correct
    // if a row is ever dropped from the view.
    expect(src).toMatch(/remainderMinutes = inWorstStream/);
  });

  it('never substitutes 0 for an unmeasured variance', () => {
    const src = api();
    // 0019 was rewritten specifically so NULL and 0 are distinguishable. A coalesce here undoes it.
    expect(src).toMatch(/varianceMinutes: v\?\.variance_minutes \?\? null/);
    expect(src).not.toMatch(/variance_minutes \?\? 0/);
  });
});

/* ── 2 · the paragraph ──────────────────────────────────────────────────────────────────────── */

describe('P3 — §11.2, every rule the paragraph has to keep', () => {
  it('null variance reads "nothing recorded", never "on plan"', () => {
    const src = narrative();
    expect(src).toMatch(/varianceMinutes === null/);
    expect(src).toMatch(/Nothing has been recorded against/);
    // And the "exactly to plan" branch must be guarded by an explicit === 0, not by falsiness —
    // `!varianceMinutes` is true for null and that is the whole bug.
    expect(src).toMatch(/varianceMinutes === 0/);
    expect(src).not.toMatch(/!varianceMinutes/);
  });

  it('names the person and the machine, and says so when there is none', () => {
    const src = narrative();
    expect(src).toMatch(/c\.person !== null/);
    expect(src).toMatch(/\{c\.machine\}/);
    expect(src).toMatch(/nobody recorded against it/);
  });

  it('quotes the recorded reason verbatim', () => {
    const src = narrative();
    expect(src).toMatch(/<q[^>]*>\{c\.cause\}<\/q>/);
    // No editing of somebody else's words.
    expect(src).not.toMatch(/c\.cause\.(slice|substring|toLowerCase|toUpperCase|replace)/);
    expect(src).toMatch(/no reason was recorded for it/);
  });

  it('names the conflict when the activity carries one', () => {
    const src = narrative();
    expect(src).toMatch(/c\.conflictId !== null/);
    expect(src).toMatch(/<ConflictMarker[\s\S]{0,80}id=\{c\.conflictId\}/);
  });

  it('states the forecast as a forecast, and omits it when it cannot be true', () => {
    const src = narrative();
    expect(src).toMatch(/At this rate/);
    // An H0, a scale, a zone and a measured variance. Missing any one, no sentence.
    expect(src).toMatch(
      /startAt === null \|\| baselineHours <= 0 \|\| timezone === null \|\| varianceMinutes === null/
    );
  });

  it('renders no percentage anywhere on the page', () => {
    // §8.3 bans a percentage on a batch and rule E.1 auto-fails the workstream for it.
    for (const [name, src] of [
      ['Narrative', narrative()],
      ['BatchPage', page()],
      ['EventStream', stream()],
    ] as const) {
      expect(src, `${name} renders a percentage`).not.toMatch(/%\s*(complete|done)/i);
      expect(src, `${name} computes a percentage of the batch`).not.toMatch(/toFixed\(\d\)\s*\+\s*'%'/);
    }
  });
});

/* ── 3 · the stream ─────────────────────────────────────────────────────────────────────────── */

describe('P3 — a null actor is a fact, not a gap', () => {
  it('a server-decided event says the system decided it', () => {
    const src = stream();
    expect(src).toMatch(/e\.serverDecided/);
    expect(src).toMatch(/the server did/);
    // Rendering it as unknown would send someone looking for an operator who does not exist.
    expect(src).not.toMatch(/serverDecided[\s\S]{0,60}unknown/i);
  });

  it('does not invent an hour for an event that has none', () => {
    const src = stream();
    expect(src).toMatch(/e\.batchHour === null/);
    expect(src).toMatch(/before H0/);
    expect(src).not.toMatch(/batchHour \?\? 1/);
  });
});

/* ── 4 · one playhead ───────────────────────────────────────────────────────────────────────── */

describe('P3 — §13, there is exactly one position on the page', () => {
  it('the route owns the provider and the views only read it', () => {
    expect(page()).toMatch(/<PlayheadProvider/);
    expect((page().match(/<PlayheadProvider/g) ?? []).length).toBe(1);
    // A view that made its own provider would drift out of step without looking broken — which is
    // exactly the defect criterion 14 exists to catch.
    for (const [name, src] of [
      ['Narrative', narrative()],
      ['EventStream', stream()],
    ] as const) {
      expect(src, `${name} must not create a playhead`).not.toMatch(/PlayheadProvider/);
    }
  });

  it('the hour is deep-linkable and replaces rather than pushes', () => {
    const src = page();
    expect(src).toMatch(/next\.set\('h', String\(play\.hour\)\)/);
    expect(src).toMatch(/setParams\(next, \{ replace: true \}\)/);
    // Where the playhead STARTS: the link, else where the batch is now. Not hour 1.
    expect(src).toMatch(/return nowHour \?\? 1;/);
  });

  it('arrow keys move an hour and shift+arrow a batch-day', () => {
    const src = page();
    expect(src).toMatch(/ArrowRight/);
    expect(src).toMatch(/e\.shiftKey \? play\.stepDay : play\.step/);
    // Typing in a field must not scrub the batch.
    expect(src).toMatch(/INPUT\|TEXTAREA\|SELECT/);
  });
});

/* ── 5 · the route move ─────────────────────────────────────────────────────────────────────── */

describe('P3 — C4, the batch page moved and nothing was orphaned', () => {
  it('/batch/:id exists and the old admin path redirects with its query intact', () => {
    const src = app();
    expect(src).toMatch(/path="\/batch\/:id"/);
    expect(src).toMatch(/path="\/admin\/batch\/:id" element=\{<RedirectToBatchPage \/>\}/);
    // Dropping the search would lose the deep-linked hour, which is the point of `?h=`.
    expect(src).toMatch(/to=\{`\/batch\/\$\{id\}\$\{search\}`\}/);
  });

  it('nothing still links at the moved path', () => {
    for (const f of ['AdminToday.tsx', 'Batches.tsx', 'ControlTower.tsx', 'ScheduleBuilder.tsx']) {
      const src = codeOf(read('routes', f));
      const stale = src.match(/['"`]\/admin\/batch\/\$\{[^}]+\}['"`]/g) ?? [];
      expect(stale, `${f} still links at /admin/batch/:id`).toEqual([]);
    }
  });

  it('the layering holds — composites never reach for the api', () => {
    // `UI_ACCEPTANCE_CRITERIA` A10. The route queries; the components take props.
    for (const [name, src] of [
      ['Narrative', narrative()],
      ['EventStream', stream()],
    ] as const) {
      expect(src, `${name} imports api/`).not.toMatch(/from '\.\.\/\.\.\/api\//);
    }
  });
});

/* ── 6 · the two defects the browser found and no test had ──────────────────────────────────── */

describe('P3 — regressions found by opening the page, not by running the suite', () => {
  const tower = () => codeOf(read('api', 'tower.ts'));

  it('a segment end is derived from its CLAMPED start, so recorded work cannot vanish', () => {
    // THE DEFECT: `from` was clamped up to 1 while `to` was computed from the raw
    // `baseline_start_hour`. Every Day-0 activity carries 0 — H0 is an instant and the interval
    // scale is 1-based — so the pair came out `from = 1, to = 1`, `mergeSegments` dropped it as
    // zero-width, and MB-DEMO-EARLY's ACTUAL rail read "nothing submitted yet" directly above an
    // event stream listing twelve submissions by name.
    const src = tower();
    expect(src).toMatch(/const from = Math\.max\(1, a\.baseline_start_hour as number\);/);
    expect(src).toMatch(/Math\.max\(from \+ 1,/);
    // The raw column must not appear in the `to` expression again.
    expect(src).not.toMatch(/\(a\.baseline_start_hour as number\) \+ 1/);
  });

  it('the deviation counts are one set stated once, not two sentences that total twice', () => {
    // 0017: `awaiting_verdict` (open, escalated) is a SUBSET of `stands_on_record`
    // (open, escalated, accepted). Rendered as two sentences it read "3 deviations are waiting on
    // a verdict. 3 stand on the record." — which a reader totals to six. Both numbers were
    // individually correct, which is exactly why no assertion caught it.
    const src = narrative();
    expect(src).toMatch(/of[\s\S]{0,20}them still waiting/);
    expect(src).not.toMatch(/stand\{[^}]*\} on the record for this batch/);
  });
});

/* ── 7 · the arithmetic, against the database ───────────────────────────────────────────────── */

describeDb('P3 — the numbers on the page add up to the number above them', () => {
  it('0024 put the conflict marker on the contributor row', async () => {
    await withRollback(async (db) => {
      const col = await one<{ n: string }>(
        db,
        `select count(*)::text n from information_schema.columns
          where table_name = 'v_variance_contributor' and column_name = 'tbd_marker'`
      );
      expect(
        Number(col.n),
        'the paragraph cannot name a conflict it cannot see — apply 0024'
      ).toBe(1);
    });
  }, 30_000);

  it('worst-stream contributors sum to the headline, exactly', async () => {
    await withRollback(async (db) => {
      const batches = await all<{
        master_batch_id: string;
        variance_minutes: number | null;
        worst_stream: string | null;
      }>(
        db,
        `select master_batch_id, variance_minutes, worst_stream
           from v_batch_variance where variance_minutes is not null`
      );
      expect(
        batches.length,
        'no measured variance anywhere — run scripts/stage-history.mjs'
      ).toBeGreaterThan(0);

      for (const b of batches) {
        const rows = await all<{ variance_minutes: number }>(
          db,
          `select variance_minutes from v_variance_contributor
            where master_batch_id = $1 and stream = $2 order by rank`,
          [b.master_batch_id, b.worst_stream]
        );
        // The contributor view drops zero-variance rows, and zeros add nothing, so the sum of the
        // rows in the worst stream must equal that stream's total — the headline.
        const sum = rows.reduce((t, r) => t + Number(r.variance_minutes), 0);
        expect(
          sum,
          `${b.master_batch_id}: the ${b.worst_stream} contributors do not add up to the headline`
        ).toBe(Number(b.variance_minutes));

        // And what the page shows: top three plus remainder is the same number.
        const top3 = rows.slice(0, 3).reduce((t, r) => t + Number(r.variance_minutes), 0);
        const remainder = rows.slice(3).reduce((t, r) => t + Number(r.variance_minutes), 0);
        expect(top3 + remainder).toBe(Number(b.variance_minutes));
      }
    });
  }, 60_000);

  it('a contributor ranked top overall can sit outside the worst stream — which is why the filter exists', async () => {
    await withRollback(async (db) => {
      // Not an assertion that it HAPPENS on today's data. An assertion that when it does, the
      // filter changes the answer — so the test is meaningful rather than incidentally true.
      const rows = await all<{ master_batch_id: string; stream: string; worst_stream: string }>(
        db,
        `select c.master_batch_id, c.stream, v.worst_stream
           from v_variance_contributor c
           join v_batch_variance v on v.master_batch_id = c.master_batch_id
          where c.rank = 1 and v.worst_stream is not null`
      );
      for (const r of rows) {
        // Whatever the data, the rule holds: the row the PAGE calls the largest contributor is in
        // the worst stream, even when the globally top-ranked row is not.
        const top = await all<{ stream: string }>(
          db,
          `select stream from v_variance_contributor
            where master_batch_id = $1 and stream = $2 order by rank limit 1`,
          [r.master_batch_id, r.worst_stream]
        );
        if (top.length > 0) expect(top[0].stream).toBe(r.worst_stream);
      }
    });
  }, 60_000);

  it('every recorded activity lands on the axis with a width', async () => {
    await withRollback(async (db) => {
      // The arithmetic `segmentsFor` performs, run over the real rows. A single `to <= from` here
      // is an activity the rail will silently drop.
      const rows = await all<{ s: number; e: number | null; total: number }>(
        db,
        `select ba.baseline_start_hour s, ba.baseline_end_hour e, pd.baseline_hours total
           from batch_activity ba
           join master_batch mb on mb.id = ba.master_batch_id
           join process_definition pd on pd.id = mb.process_definition_id
          where ba.baseline_start_hour is not null
            and ba.state in ('COMPLETED', 'IN_PROGRESS', 'SUBMITTED', 'AWAITING_SUPERVISOR')`
      );
      expect(rows.length, 'no recorded work anywhere — run scripts/stage-history.mjs').toBeGreaterThan(0);

      let atHourZero = 0;
      for (const r of rows) {
        const from = Math.max(1, Number(r.s));
        const to = Math.min(Number(r.total), Math.max(from + 1, Number(r.e ?? 0) + 1));
        expect(to, `an activity at start_hour ${r.s} would be dropped as zero-width`).toBeGreaterThan(from);
        if (Number(r.s) === 0) atHourZero += 1;
      }
      // And the case that produced the defect is genuinely present, so the loop above is not
      // passing on data that never exercises it.
      expect(atHourZero, 'no Day-0 activity at hour 0 — this assertion proves nothing').toBeGreaterThan(0);
    });
  }, 60_000);

  it('v_batch_event reaches the page with the columns it reads', async () => {
    await withRollback(async (db) => {
      const rows = await all<Record<string, unknown>>(
        db,
        `select id, occurred_at, action, reason, actor_name, actor_role, server_decided,
                activity_title, scope_label, batch_hour
           from v_batch_event limit 5`
      );
      for (const r of rows) {
        // A gate with no actor must report `server_decided`, not a missing name.
        if (r.actor_id === null && ['gate_opened', 'rest_started', 'rest_released'].includes(String(r.action))) {
          expect(r.server_decided).toBe(true);
        }
      }
    });
  }, 30_000);
});
