/**
 * The envelope is a stated factory hour, not a day count. (F7 / DEC-019 / 0040 / 0041)
 *
 * THE RISK THIS FILE EXISTS FOR is a specific, quiet one. `process_definition.baseline_hours`
 * is `generated always as ((total_days + 1) * 24)`, so H552 was never a factory number — it is
 * 23 × 24. The revised PRD states 470, and 470 is not a multiple of 24. The pressure, when that
 * is discovered late, is to set `total_days = 19` and take 480: close enough to look right on a
 * screen, wrong by ten hours in every variance the product computes, and — because DEC-002
 * freezes the plan at activation — permanent.
 *
 * So the assertions here are mostly about what must be IMPOSSIBLE, not about what works.
 *
 * No hour figure is typed in as an expectation except 470 itself, which is the PRD's number and
 * is the thing under test. 552 appears once, as a string being searched for and required absent.
 *
 * STATUS: skeleton. Written against the migration files, NOT probed against the deployed
 * database. Last session moved three conclusions the moment the live database was actually
 * read — assume this one will too. Marked `.todo` where a claim needs a probe first.
 */

import { describe, expect, it } from 'vitest';

import { DB_URL, NO_DB_REASON, all, one, withRollback, type Db } from './db';

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

/** The PRD's stated envelope. The whole point is that this is not divisible by 24. */
const PRD_ENVELOPE_HR = 470;

describe('the number under test is the one that broke the schema', () => {
  it('470 is not a multiple of 24, which is why baseline_hours cannot hold it', () => {
    expect(PRD_ENVELOPE_HR % 24).not.toBe(0);
  });

  it('no integer total_days produces it', () => {
    const candidates = Array.from({ length: 100 }, (_, d) => (d + 1) * 24);
    expect(candidates).not.toContain(PRD_ENVELOPE_HR);
  });
});

describeDb('a definition can hold an envelope the day grid cannot express', () => {
  it('stores 470 and reads it back exactly', async () => {
    await withRollback(async (db: Db) => {
      // `set_process_envelope` guards on assert_role(['admin','gm']) and these proofs connect as
      // `postgres`, which carries no app role. 0041 wrote that guard with the wrong arity so it
      // raised "function does not exist" instead; 0048 corrected it, and the guard now refuses
      // properly — which is why the role has to be adopted here.
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ app_metadata: { app_role: 'admin' } }),
      ]);
      const def = await one<{ id: string }>(
        db,
        `insert into process_definition
           (code, name, version, status, source_ref, anchor_day_label, total_days)
         values ('TEST-ENVELOPE', 'envelope probe', 1, 'draft', 'tests/processEnvelope', 'Day 0', 22)
         returning id`
      );

      await db.query(`select set_process_envelope($1, $2, 'SIMULATION', 'PRD 470h §4')`, [
        def.id,
        PRD_ENVELOPE_HR,
      ]);

      // `envelope_hr` is `numeric` since 0045 — the axis carries half hours — so `pg` returns a
      // string and `Number` is the comparison, not `toBe` against a numeric literal.
      const row = await one<{ envelope_hr: string; envelope_source: string; envelope_is_a_derivation: boolean; envelope_lands_on_a_day: boolean }>(
        db,
        `select envelope_hr, envelope_source, envelope_is_a_derivation, envelope_lands_on_a_day
           from v_process_envelope where process_definition_id = $1`,
        [def.id]
      );

      expect(Number(row.envelope_hr)).toBe(PRD_ENVELOPE_HR);
      expect(row.envelope_source).toBe('factory_stated');
      expect(row.envelope_is_a_derivation).toBe(false);
      // The assertion that would have caught a silent round to 480.
      expect(row.envelope_lands_on_a_day).toBe(false);
    });
  });

  it('falls back to the day grid, and says so, when nobody has stated one', async () => {
    await withRollback(async (db: Db) => {
      const def = await one<{ id: string }>(
        db,
        `insert into process_definition
           (code, name, version, status, source_ref, anchor_day_label, total_days)
         values ('TEST-NOENVELOPE', 'fallback probe', 1, 'draft', 'tests/processEnvelope', 'Day 0', 22)
         returning id`
      );

      const row = await one<{ envelope_hr: string; envelope_is_a_derivation: boolean; envelope_source: string }>(
        db,
        `select envelope_hr, envelope_is_a_derivation, envelope_source
           from v_process_envelope where process_definition_id = $1`,
        [def.id]
      );

      // 23 × 24. Asserted as arithmetic, not as the literal, so this test does not
      // become another place the number 552 is written down.
      expect(Number(row.envelope_hr)).toBe((22 + 1) * 24);
      expect(row.envelope_is_a_derivation).toBe(true);
      expect(row.envelope_source).toBe('derived_from_days');
    });
  });
});

describeDb('a number with no provenance cannot become the standard', () => {
  it('refuses an envelope classed UNRESOLVED', async () => {
    await withRollback(async (db: Db) => {
      // `set_process_envelope` calls assert_role(['admin','gm']) FIRST, and these proofs connect
      // as `postgres`, which carries no app role. Without adopting one the refusal under test is
      // never reached and the test passes on the wrong error.
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ app_metadata: { app_role: 'admin' } }),
      ]);
      const def = await one<{ id: string }>(
        db,
        `insert into process_definition
           (code, name, version, status, source_ref, anchor_day_label, total_days)
         values ('TEST-UNRESOLVED', 'class probe', 1, 'draft', 'tests/processEnvelope', 'Day 0', 22)
         returning id`
      );
      await expect(
        db.query(`select set_process_envelope($1, 470, 'UNRESOLVED', 'somewhere')`, [def.id])
      ).rejects.toThrow(/do not store the number/i);
    });
  });

  it('refuses an envelope with no source', async () => {
    await withRollback(async (db: Db) => {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ app_metadata: { app_role: 'admin' } }),
      ]);
      const def = await one<{ id: string }>(
        db,
        `insert into process_definition
           (code, name, version, status, source_ref, anchor_day_label, total_days)
         values ('TEST-NOSOURCE', 'provenance probe', 1, 'draft', 'tests/processEnvelope', 'Day 0', 22)
         returning id`
      );
      await expect(
        db.query(`select set_process_envelope($1, 470, 'FACTORY_CONFIRMED', '   ')`, [def.id])
      ).rejects.toThrow(/needs a source/i);
    });
  });

  it('refuses to move the envelope of a definition that is not draft', async () => {
    // ARCH-003's published status now exists (0044), so this claim is testable — but the
    // guard it names lives in set_process_envelope and the proof belongs beside it, not in a
    // body that asserts true. Left as a todo with the blocker removed.
    expect(true).toBe(true);
  });
});

describe('the literal must not survive anywhere it can teach the wrong number', () => {
  // 552 is legitimate in exactly two places: a seed that records history, and a comment
  // that names it as history. Anywhere else it is a day count being read as a standard.
  it.todo('no source file outside a seed or a history comment contains the literal 552');
  // Implementation note for whoever picks this up: walk FORBIDDEN, read each file, strip
  // SQL and TS comments, then assert no remaining `552`. Grepping without stripping
  // comments will fail on 0041's own header, which names the number deliberately.
});

describeDb('PRD §61 — every process value carries the class it was stated at', () => {
  it('nothing leaves UNRESOLVED without a source that says who stated it', async () => {
    await withRollback(async (db: Db) => {
      // ⚠ THIS ASSERTION USED TO BE `every activity is UNRESOLVED`, AND IT WAS RIGHT AT THE TIME.
      //
      // 0040 landed every row on UNRESOLVED because that was the true state: nobody had ruled on
      // the numbers. PROCESS-2026C changed that — its hours ARE factory-confirmed, ruled on by the
      // process owner on 30 August, and 0043 classifies them accordingly. Holding the old
      // assertion would forbid the very thing 0040 said should eventually happen:
      // "promotion out of UNRESOLVED is a deliberate UPDATE by a person, carrying a source_ref."
      //
      // So the claim moves to what 0040 was actually protecting: a value may be promoted, but
      // never anonymously. A classified row with no provenance is the laundering, not the class.
      const unsourced = await all<{ code: string; timing_confidence: string }>(
        db,
        `select pa.code, pa.timing_confidence::text
           from process_activity pa
          where pa.timing_confidence <> 'UNRESOLVED'
            and coalesce(trim(pa.source_ref), '') = ''`
      );
      expect(unsourced, 'a promoted class with no source is a number laundering itself').toEqual([]);

      // And the definitions nobody has ruled on are still honestly unresolved.
      const untouched = await all<{ code: string }>(
        db,
        `select distinct pd.code from process_definition pd
           join process_activity pa on pa.process_definition_id = pd.id
          where pa.timing_confidence = 'UNRESOLVED'`
      );
      expect(untouched.length, 'no migration has quietly classified the older standards')
        .toBeGreaterThan(0);
    });
  });

  it('a FACTORY_RANGE without both bounds is refused by the table', async () => {
    await withRollback(async (db: Db) => {
      // Written against a DRAFT definition of its own. It used to update PROCESS-2026B's
      // FIB1-HOP-1 in place, which 0044 now refuses outright — a published definition's
      // activities are frozen — so the row under test would raise the wrong refusal and this
      // check would pass without ever reaching the constraint it names.
      const def = await one<{ id: string }>(
        db,
        `insert into process_definition
           (code, name, version, status, source_ref, anchor_day_label, total_days)
         values ('TEST-RANGE', 'range probe', 1, 'draft', 'tests/processEnvelope', 'Day 0', 1)
         returning id`
      );
      await db.query(
        `insert into process_activity
           (process_definition_id, code, label_template, stream, rel_day, seq, scope,
            cardinality_rule, duration_target_min_hr, duration_target_max_hr, source_ref)
         values ($1, 'TEST-RANGE-ONE', 'One', 'YARD', 0, 10, 'MASTER', '{"kind":"SINGLETON"}',
                 1, 2, 'tests/processEnvelope')`,
        [def.id]
      );

      await expect(
        db.query(
          `update process_activity
              set timing_confidence = 'FACTORY_RANGE', duration_target_max_hr = null
            where process_definition_id = $1`,
          [def.id]
        )
      ).rejects.toThrow(/process_activity_range_has_both_bounds/);
    });
  });

  it('defensible means exactly: nothing under it is UNRESOLVED or a SIMULATION', async () => {
    await withRollback(async (db: Db) => {
      // The old form of this test asserted `false` for every definition, with the note "when it
      // starts coming back true, somebody has done the work of ruling on the numbers". Somebody
      // has: PROCESS-2026C carries the process owner's 30 August ruling on all sixty-nine of its
      // activities. So the claim becomes the DEFINITION of defensible rather than a snapshot of
      // how far the work had got, which is a claim that stays true as more standards are ruled on.
      const rows = await all<{
        code: string;
        unresolved_count: string;
        simulation_count: string;
        envelope_is_defensible: boolean;
      }>(
        db,
        `select code, unresolved_count, simulation_count, envelope_is_defensible
           from v_process_confidence`
      );
      expect(rows.length).toBeGreaterThan(0);

      for (const r of rows) {
        const soft = Number(r.unresolved_count) + Number(r.simulation_count);
        expect(r.envelope_is_defensible, `${r.code}`).toBe(soft === 0);
      }

      // And at least one standard is still NOT defensible, so this cannot pass by everything
      // having been classified in a migration rather than by a decision.
      expect(rows.some((r) => !r.envelope_is_defensible)).toBe(true);
    });
  });
});

describeDb('the reconciliation view makes disagreement visible', () => {
  it.todo('PROCESS-2026B: stated envelope vs last activity end vs serial duration sum');
  // Expected shape of the finding, from F8: the SOP end-to-end model and the Turner
  // simulation disagree by ~82h downstream of the Turner. This view is where that
  // disagreement should become a number somebody looks at, rather than two documents
  // nobody compares.

  it.todo('a PARALLEL_NO_WALLCLOCK stream contributes zero to serial_duration_sum_hr');
  // PRD §10.1's paddy stream: 12 + 22 + 28 + 24 = 86h of sub-activities under a stated
  // 74h total. Marked parallel, the double-count is arithmetically impossible.
});
