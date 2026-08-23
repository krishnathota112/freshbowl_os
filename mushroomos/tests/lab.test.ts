/**
 * B5 — lab logic. `0022_lab.sql`, `s12_lab.sql`, `BUILD_SEQUENCE_KIRO.md §B5`.
 *
 * THE EXIT PROOF, in §B5's own words:
 *
 *   "A result is superseded by a retest with the original preserved and both visible."
 *   "A result with no spec records `no_spec` and never auto-fails (TBD-13)."
 *
 * Both are asserted below, and so are the two blocks §B5 says to carry rather than resolve:
 * C-32 (who approves a lab submission) and C-33 (which checkpoint map is authoritative).
 *
 * Everything runs as `postgres` inside a rolled-back transaction. Where a ROLE matters, the test
 * sets `request.jwt.claims` for the transaction — which is what `current_app_role()` reads and what
 * PostgREST sets in production — so the role guards are genuinely exercised rather than skipped
 * because a superuser bypassed them.
 */

import { describe, expect, it } from 'vitest';
import {
  DB_URL,
  NO_DB_REASON,
  all,
  createActiveBatch,
  one,
  refuses,
  withRollback,
  type Db,
} from './db';

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

/**
 * Adopt an app role for the rest of the transaction.
 *
 * `current_app_role()` reads `request.jwt.claims -> app_metadata ->> app_role`, so setting that
 * one GUC is exactly what a real request does. No `sub` is set, so `auth.uid()` stays null and the
 * nullable actor columns record it as such — honest for a test, and it keeps the FK to `profiles`
 * satisfied without borrowing somebody's identity.
 */
async function beRole(db: Db, role: string) {
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ app_metadata: { app_role: role } }),
  ]);
}
async function beNobody(db: Db) {
  await db.query(`select set_config('request.jwt.claims', '', true)`);
}

/** The S4b `TUNNEL_LOAD` checkpoint — one of only three whose code is identical in `lab_spec`. */
async function tunnelLoadCheckpoint(db: Db) {
  return one<{ id: string; spec_checkpoint_code: string }>(
    db,
    `select id, spec_checkpoint_code from lab_checkpoint
      where checkpoint_map = 'S4B_COLUMNS' and code = 'TUNNEL_LOAD'`
  );
}

/** A sample on a real lab activity of a real active batch, plus one requested test. */
async function sampleAndTest(db: Db, parameter: string, checkpointId?: string) {
  const batch = await createActiveBatch(db);
  const act = await one<{ id: string }>(
    db,
    `select id from batch_activity
      where master_batch_id = $1 and responsible_role = 'lab_tech' order by seq limit 1`,
    [batch]
  );
  const cp = checkpointId ?? (await tunnelLoadCheckpoint(db)).id;
  const sample = await one<{ id: string }>(db, `select public.open_lab_sample($1, $2) as id`, [
    act.id,
    cp,
  ]);
  const test = await one<{ id: string }>(db, `select public.request_lab_test($1, $2) as id`, [
    sample.id,
    parameter,
  ]);
  return { batch, activity: act.id, sample: sample.id, test: test.id };
}

describeDb('B5 — the chain, and the refusals LAB_MODEL §9 names', () => {
  it('there is no path to a number without a sample — the chain is NOT NULL end to end', async () => {
    await withRollback(async (db) => {
      // §9: "A number with no `lab_sample` is not traceable and is rejected at the database level."
      // Asserted against the catalogue rather than by trying one insert, so it covers every path.
      const nulls = await all<{ table_name: string; column_name: string; is_nullable: string }>(
        db,
        `select table_name, column_name, is_nullable
           from information_schema.columns
          where table_schema = 'public'
            and (table_name, column_name) in
                (('lab_result','test_id'), ('lab_test','sample_id'), ('lab_sample','master_batch_id'),
                 ('lab_sample','checkpoint_id'))
          order by table_name, column_name`
      );
      expect(nulls.length).toBe(4);
      for (const c of nulls) {
        expect(c.is_nullable, `${c.table_name}.${c.column_name} must be NOT NULL`).toBe('NO');
      }

      // And the refusal is real, not just declared.
      const why = await refuses(db, `insert into lab_result (test_id, value_numeric) values (null, 74)`);
      expect(why).toMatch(/null value in column "test_id"|not-null/i);
    });
  });

  it('a result must say something — a row with no value and no invalid reason is refused', async () => {
    await withRollback(async (db) => {
      const { test } = await sampleAndTest(db, 'moisture_pct');
      const why = await refuses(
        db,
        `insert into lab_result (test_id, version) values ($1, 1)`,
        [test]
      );
      expect(why).toMatch(/lab_result_has_a_value/);
    });
  });

  it('the verdict is GENERATED, so no client can assert a pass', async () => {
    await withRollback(async (db) => {
      const gen = await one<{ is_generated: string }>(
        db,
        `select is_generated from information_schema.columns
          where table_schema='public' and table_name='lab_result' and column_name='verdict'`
      );
      expect(gen.is_generated).toBe('ALWAYS');

      const { test } = await sampleAndTest(db, 'moisture_pct');
      // 76.4 against the frozen 72.5–74 band. This is LAB_MODEL §5's own worked example.
      await db.query(`select public.record_lab_result($1, 76.4)`, [test]);
      const why = await refuses(
        db,
        `update lab_result set verdict = 'pass' where test_id = $1`,
        [test]
      );
      expect(why).toMatch(/can only be updated to DEFAULT/i);
    });
  });
});

describeDb('B5 — exit proof 1 · a retest supersedes, and the original survives', () => {
  it('v1 FAIL is preserved and pointed forward; v2 PASS becomes the head; BOTH are visible', async () => {
    await withRollback(async (db) => {
      const { test } = await sampleAndTest(db, 'moisture_pct');

      // The band was frozen at request time from lab_spec TUNNEL_LOAD.moisture_pct = 72.5–74.
      const t = await one<{ target_min: string; target_max: string; spec_found: boolean }>(
        db,
        `select target_min, target_max, spec_found from lab_test where id = $1`,
        [test]
      );
      expect(t.spec_found).toBe(true);
      expect(Number(t.target_min)).toBe(72.5);
      expect(Number(t.target_max)).toBe(74);

      // LAB_MODEL §5 verbatim: "lab_result v1 MC 76.4 % verdict FAIL (tunnel-load spec 72.5–74)".
      const v1 = await one<{ id: string }>(db, `select public.record_lab_result($1, 76.4) as id`, [
        test,
      ]);
      const r1 = await one<{ verdict: string; version: number }>(
        db,
        `select verdict, version from lab_result where id = $1`,
        [v1.id]
      );
      expect(r1.version).toBe(1);
      expect(r1.verdict).toBe('fail');

      await beRole(db, 'lab_tech');
      // "lab_result v2 MC 73.8 % verdict PASS ... supersedes → v1"
      const v2 = await one<{ id: string }>(
        db,
        `select public.order_retest($1, 'post_corrective_action', 73.8) as id`,
        [test]
      );
      await beNobody(db);

      const rows = await all<{
        version: number;
        value_numeric: string;
        verdict: string;
        is_current: boolean;
        supersedes_result_id: string | null;
        superseded_by_result_id: string | null;
        retest_reason: string | null;
      }>(
        db,
        `select version, value_numeric, verdict, is_current, supersedes_result_id,
                superseded_by_result_id, retest_reason
           from v_lab_result_history where test_id = $1 order by version`,
        [test]
      );

      // ── BOTH VISIBLE. This is the assertion §B5 asked for. ──────────────────
      expect(rows.length, 'the original must still be there').toBe(2);

      expect(rows[0].version).toBe(1);
      expect(Number(rows[0].value_numeric)).toBe(76.4);
      expect(rows[0].verdict, 'v1 keeps its own verdict — a retest does not rewrite history').toBe(
        'fail'
      );
      expect(rows[0].is_current).toBe(false);
      expect(rows[0].superseded_by_result_id, 'v1 points forward at v2').toBe(v2.id);
      expect(rows[0].supersedes_result_id, 'v1 supersedes nothing').toBeNull();

      expect(rows[1].version).toBe(2);
      expect(Number(rows[1].value_numeric)).toBe(73.8);
      expect(rows[1].verdict).toBe('pass');
      expect(rows[1].is_current).toBe(true);
      expect(rows[1].supersedes_result_id, 'v2 points back at v1').toBe(v1.id);
      expect(rows[1].retest_reason).toBe('post_corrective_action');

      // "MC 76.4 → 73.8 (retest)" is renderable from this view alone, which is what §5 requires of
      // the timeline and every decision package.
      const current = await all<{ version: number }>(
        db,
        `select version from v_lab_result_current where test_id = $1`,
        [test]
      );
      expect(current.map((c) => c.version), 'exactly one head').toEqual([2]);
    });
  });

  it('overwriting is not a code path — a second first result is refused, naming the retest', async () => {
    await withRollback(async (db) => {
      const { test } = await sampleAndTest(db, 'moisture_pct');
      await db.query(`select public.record_lab_result($1, 76.4)`, [test]);
      const why = await refuses(db, `select public.record_lab_result($1, 73.8)`, [test]);
      expect(why).toMatch(/immutable and versioned/);
      expect(why).toMatch(/retest/);
    });
  });

  it('two live heads on one test is unwritable', async () => {
    await withRollback(async (db) => {
      const { test } = await sampleAndTest(db, 'moisture_pct');
      const v1 = await one<{ id: string }>(db, `select public.record_lab_result($1, 76.4) as id`, [
        test,
      ]);
      // A hand-written v2 that supersedes v1 but never demotes it, bypassing the RPC entirely. Both
      // rows would then be unsuperseded, and "the current result" would be ambiguous.
      const why = await refuses(
        db,
        `insert into lab_result (test_id, version, value_numeric, target_min, target_max,
                                 retest_reason, supersedes_result_id)
         values ($1, 2, 73.8, 72.5, 74, 'sampling_error', $2)`,
        [test, v1.id]
      );
      expect(why).toMatch(/uq_lab_result_one_head|duplicate key/i);
    });
  });

  it('a retest with no reason code is unwritable, and v1 may not claim to supersede anything', async () => {
    await withRollback(async (db) => {
      const { test } = await sampleAndTest(db, 'moisture_pct');
      const v1 = await one<{ id: string }>(db, `select public.record_lab_result($1, 76.4) as id`, [
        test,
      ]);

      // LAB_MODEL §5: "A retest requires a reason code."
      const noReason = await refuses(
        db,
        `insert into lab_result (test_id, version, value_numeric, supersedes_result_id)
         values ($1, 2, 73.8, $2)`,
        [test, v1.id]
      );
      expect(noReason).toMatch(/lab_result_retest_needs_reason/);

      // And the symmetric claim: version 1 supersedes nothing.
      const badV1 = await refuses(
        db,
        `insert into lab_result (test_id, version, value_numeric, supersedes_result_id)
         values ($1, 1, 73.8, $2)`,
        [test, v1.id]
      );
      expect(badV1).toMatch(/lab_result_v1_supersedes_nothing|duplicate key/i);
    });
  });

  it('an operator cannot make a failing number go away', async () => {
    await withRollback(async (db) => {
      const { test } = await sampleAndTest(db, 'moisture_pct');
      await db.query(`select public.record_lab_result($1, 76.4)`, [test]);

      // ROLE_AND_APPROVAL_MODEL ticks "Order retest" for Lab and Supervisor only.
      await beRole(db, 'operator');
      const why = await refuses(db, `select public.order_retest($1, 'sampling_error', 73.8)`, [test]);
      expect(why).toMatch(/may not order a retest/);
      expect(why).toMatch(/failing number go away/);

      // The control: the same call from a supervisor is allowed, so the guard is about the role and
      // not about the call.
      await beRole(db, 'supervisor');
      const v2 = await one<{ id: string }>(
        db,
        `select public.order_retest($1, 'supervisor_request', 73.8) as id`,
        [test]
      );
      expect(v2.id).toBeTruthy();
      await beNobody(db);
    });
  });

  it('the retest escalation threshold is DATA, not a literal in the function body', async () => {
    await withRollback(async (db) => {
      // Non-negotiable rule 4. LAB_MODEL §5 states "more than 2", so the number is sourced — but a
      // sourced number in a function body is still a hard-coded count.
      const setting = await one<{ int_value: number; source_ref: string }>(
        db,
        `select int_value, source_ref from lab_setting where key = 'retest_escalation_above'`
      );
      expect(setting.int_value).toBeGreaterThan(0);
      expect(setting.source_ref).toMatch(/LAB_MODEL/);

      const src = await one<{ body: string }>(
        db,
        `select prosrc as body from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'order_retest'`
      );
      expect(src.body, 'the threshold must be read, not written into the code').toMatch(
        /retest_escalation_above/
      );
      expect(
        src.body.replace(/--[^\n]*/g, ''),
        'no bare comparison against a literal count'
      ).not.toMatch(/n_prior\s*>\s*\d/);
    });
  });
});

describeDb('B5 — exit proof 2 · no spec means no_spec, and no_spec never fails', () => {
  it('TBD-13 · a spec row that states NO band produces no_spec, whatever the value', async () => {
    await withRollback(async (db) => {
      // lab_spec carries TUNNEL_LOAD.ec with null bounds and conflict_id TBD-13, precisely so the
      // absence of a band is DATA rather than a missing row.
      const { test } = await sampleAndTest(db, 'ec');
      const t = await one<{
        spec_found: boolean;
        target_min: string | null;
        target_max: string | null;
        spec_conflict_id: string | null;
        spec_source_ref: string;
      }>(
        db,
        `select spec_found, target_min, target_max, spec_conflict_id, spec_source_ref
           from lab_test where id = $1`,
        [test]
      );
      expect(t.spec_found, 'the spec row EXISTS — it just states no bound').toBe(true);
      expect(t.target_min).toBeNull();
      expect(t.target_max).toBeNull();
      expect(t.spec_conflict_id).toBe('TBD-13');
      expect(t.spec_source_ref).toMatch(/no compost EC band/);

      // An absurdly high reading. Under any invented band this would fail.
      //
      // Recorded in its own statement, deliberately: `record_lab_result` is VOLATILE, so putting it
      // in a WHERE clause makes Postgres call it once per row scanned. The first draft of this test
      // did exactly that and inserted repeatedly while matching nothing.
      const id = await one<{ id: string }>(
        db,
        `select public.record_lab_result($1, 999) as id`,
        [test]
      );
      const r = await one<{ verdict: string }>(
        db,
        `select verdict from lab_result where id = $1`,
        [id.id]
      );
      expect(r.verdict, 'no band means no verdict to fail — TBD-13').toBe('no_spec');
    });
  });

  it('no_spec never becomes a fail, whatever the reading', async () => {
    await withRollback(async (db) => {
      // A spread rather than one lucky value, so the claim is about the RULE. One sample and one
      // test per value, because a test may hold only one first result — which is itself the point.
      const cp = await tunnelLoadCheckpoint(db);
      const batch = await createActiveBatch(db);
      const act = await one<{ id: string }>(
        db,
        `select id from batch_activity where master_batch_id = $1 and responsible_role = 'lab_tech'
          order by seq limit 1`,
        [batch]
      );

      for (const value of [-5, 0, 0.001, 73, 999999]) {
        const sample = await one<{ id: string }>(
          db,
          `select public.open_lab_sample($1, $2) as id`,
          [act.id, cp.id]
        );
        const test = await one<{ id: string }>(
          db,
          `select public.request_lab_test($1, 'ec') as id`,
          [sample.id]
        );
        const rid = await one<{ id: string }>(
          db,
          `select public.record_lab_result($1, $2) as id`,
          [test.id, value]
        );
        const r = await one<{ verdict: string }>(
          db,
          `select verdict from lab_result where id = $1`,
          [rid.id]
        );
        expect(r.verdict, `${value} must be no_spec, never fail`).toBe('no_spec');
      }
    });
  });

  it('TBD-36 · an UNMAPPED checkpoint freezes no band at all, and says so differently', async () => {
    await withRollback(async (db) => {
      // The distinction that matters: TBD-13 is a spec row stating no band; an unmapped checkpoint
      // has no spec row to read. Both give no_spec, but only one is a factory question about a
      // band, and `spec_found` is what keeps them apart.
      const cp = await one<{ id: string; code: string }>(
        db,
        `select id, code from lab_checkpoint
          where checkpoint_map = 'LAB_DICTATION' and code = 'DURING_TUNNEL_LOADING'`
      );
      const { test } = await sampleAndTest(db, 'moisture_pct', cp.id);
      const t = await one<{ spec_found: boolean; target_min: string | null }>(
        db,
        `select spec_found, target_min from lab_test where id = $1`,
        [test]
      );
      expect(t.spec_found, 'no spec row was found, as opposed to one with null bounds').toBe(false);
      expect(t.target_min).toBeNull();

      const rid = await one<{ id: string }>(
        db,
        `select public.record_lab_result($1, 76.4) as id`,
        [test]
      );
      const r = await one<{ verdict: string }>(
        db,
        `select verdict from lab_result where id = $1`,
        [rid.id]
      );
      expect(r.verdict).toBe('no_spec');

      const markers = await all<{ conflict_id: string }>(
        db,
        `select conflict_id from lab_checkpoint_conflict where checkpoint_id = $1 order by 1`,
        [cp.id]
      );
      expect(markers.map((m) => m.conflict_id)).toContain('TBD-36');
    });
  });

  it('a band with no number is invalid, not a fail — a limit cannot judge an absent reading', async () => {
    await withRollback(async (db) => {
      const { test } = await sampleAndTest(db, 'moisture_pct');
      const rid = await one<{ id: string }>(
        db,
        `select public.record_lab_result($1, null, 'sample lost in transit', null,
                                         'no usable sample reached the bench') as id`,
        [test]
      );
      const r = await one<{ verdict: string }>(
        db,
        `select verdict from lab_result where id = $1`,
        [rid.id]
      );
      // 'fail' here would invent a judgement about a measurement nobody made. This mirrors
      // `evaluate_gates`' `unevaluable`.
      expect(r.verdict).toBe('invalid');
    });
  });

  it('the frozen band survives a later spec change — no silent re-judgement', async () => {
    await withRollback(async (db) => {
      const { test } = await sampleAndTest(db, 'moisture_pct');
      const v1 = await one<{ id: string }>(db, `select public.record_lab_result($1, 76.4) as id`, [
        test,
      ]);
      const before = await one<{ verdict: string }>(
        db,
        `select verdict from lab_result where id = $1`,
        [v1.id]
      );
      expect(before.verdict).toBe('fail');

      // Somebody widens the spec so 76.4 would now pass. LAB_MODEL §2: "Changing a spec must never
      // silently re-judge a historical result."
      await db.query(
        `update lab_spec set min_value = 70, max_value = 80
          where checkpoint_code = 'TUNNEL_LOAD' and parameter_code = 'moisture_pct'`
      );
      const after = await one<{ verdict: string; target_max: string }>(
        db,
        `select verdict, target_max from lab_result where id = $1`,
        [v1.id]
      );
      expect(Number(after.target_max), 'the frozen copy is untouched').toBe(74);
      expect(after.verdict, 'the historical verdict is untouched').toBe('fail');

      // And a retest is judged against the ORIGINAL band too, which is what makes v1 and v2
      // comparable at all.
      await beRole(db, 'lab_tech');
      const v2 = await one<{ id: string }>(
        db,
        `select public.order_retest($1, 'result_implausible', 76.4) as id`,
        [test]
      );
      await beNobody(db);
      const r2 = await one<{ verdict: string; target_max: string }>(
        db,
        `select verdict, target_max from lab_result where id = $1`,
        [v2.id]
      );
      expect(Number(r2.target_max)).toBe(74);
      expect(r2.verdict, 'same value, same band, same verdict').toBe('fail');
    });
  });
});

describeDb('B5 — C-33 · both checkpoint maps are carried, and neither is preferred', () => {
  it('two maps exist, both populated, and nothing merged them', async () => {
    await withRollback(async (db) => {
      const maps = await all<{ checkpoint_map: string; n: string; mapped: string }>(
        db,
        `select checkpoint_map, count(*)::text as n, count(spec_checkpoint_code)::text as mapped
           from lab_checkpoint group by checkpoint_map order by checkpoint_map`
      );
      expect(maps.map((m) => m.checkpoint_map)).toEqual(['LAB_DICTATION', 'S4B_COLUMNS']);
      for (const m of maps) expect(Number(m.n)).toBeGreaterThan(1);

      // THE PROOF THAT THEY WERE NOT MERGED: the same physical moment is present in both maps
      // under different codes with different panels. A merge would have collapsed these.
      const tunnelLoading = await all<{ checkpoint_map: string; code: string; n_params: number }>(
        db,
        `select checkpoint_map, code, array_length(parameters, 1) as n_params
           from lab_checkpoint
          where code in ('DURING_TUNNEL_LOADING','TUNNEL_LOAD') order by checkpoint_map`
      );
      expect(tunnelLoading.length, 'tunnel loading appears once per map').toBe(2);
      expect(new Set(tunnelLoading.map((t) => t.checkpoint_map)).size).toBe(2);
    });
  });

  it('EVERY checkpoint in both maps carries C-33 — an unmarked row would claim they agree', async () => {
    await withRollback(async (db) => {
      const unmarked = await all<{ checkpoint_map: string; code: string }>(
        db,
        `select cp.checkpoint_map, cp.code from lab_checkpoint cp
          where not exists (select 1 from lab_checkpoint_conflict cc
                             where cc.checkpoint_id = cp.id and cc.conflict_id = 'C-33')
          order by 1, 2`
      );
      expect(
        unmarked.map((u) => `${u.checkpoint_map}.${u.code}`),
        'CONTRACT_AUDIT §2.E disagrees at every point either map describes'
      ).toEqual([]);
    });
  });

  it('the registry rows the markers depend on exist, and the FK is what proves it', async () => {
    await withRollback(async (db) => {
      // CONTRACT_AUDIT §6 item 3 — "conflict_register as a table with FK-enforced markers". C-32
      // and C-33 were never registered before B5, so every marker would have been a dangling link.
      const rows = await all<{ conflict_id: string; kind: string; status: string }>(
        db,
        `select conflict_id, kind, status from conflict_register
          where conflict_id in ('C-32','C-33') order by conflict_id`
      );
      expect(rows.map((r) => r.conflict_id)).toEqual(['C-32', 'C-33']);
      for (const r of rows) {
        expect(r.kind).toBe('conflict');
        expect(r.status, 'neither has been answered').toBe('open');
      }

      const why = await refuses(
        db,
        `insert into lab_checkpoint_conflict (checkpoint_id, conflict_id)
         select id, 'C-99' from lab_checkpoint limit 1`
      );
      expect(why).toMatch(/foreign key|conflict_register/i);
    });
  });

  it('a sample records WHICH MAP it was filed under', async () => {
    await withRollback(async (db) => {
      const { sample } = await sampleAndTest(db, 'moisture_pct');
      const filed = await one<{ checkpoint_map: string; code: string }>(
        db,
        `select cp.checkpoint_map, cp.code from lab_sample s
           join lab_checkpoint cp on cp.id = s.checkpoint_id where s.id = $1`,
        [sample]
      );
      // Not "a checkpoint" but "a checkpoint from a named map". While C-33 is open that provenance
      // is the difference between a traceable number and an ambiguous one.
      expect(filed.checkpoint_map).toBe('S4B_COLUMNS');
      expect(filed.code).toBe('TUNNEL_LOAD');
    });
  });

  it('the nine existing lab activities were NOT rebuilt or retired', async () => {
    await withRollback(async (db) => {
      // CONTRACT_AUDIT §6 item 9 protects the seeded gate rules, and s08's nine lab activities are
      // the third map C-33 names. B5 adds beside them; it does not touch them.
      const acts = await all<{ code: string }>(
        db,
        `select pa.code from process_activity pa
           join process_definition pd on pd.id = pa.process_definition_id
          where pd.code = 'PROCESS-2026B' and pa.responsible_role = 'lab_tech'
          order by pa.code`
      );
      expect(acts.length, 's08 seeded nine lab activities and they are all still here').toBe(9);

      const gates = await all<{ code: string; kind: string }>(
        db,
        `select pa.code, g.kind from gate_rule g
           join process_activity pa on pa.id = g.process_activity_id
          where g.config->'activity_codes' ?| array['LAB-FIB-MOISTURE-1','LAB-FIB-MOISTURE-2',
                                                    'LAB-BUNK-FILL','LAB-BUNK-RELOAD']
          order by pa.code`
      );
      expect(gates.length, 'the four seeded lab PREDECESSOR rules survive').toBe(4);
      for (const g of gates) expect(g.kind).toBe('PREDECESSOR');
    });
  });
});

describeDb('B5 — C-32 · both readings carried, the approver not chosen', () => {
  it('both readings are on file, they name DIFFERENT roles, and NEITHER is enabled', async () => {
    await withRollback(async (db) => {
      const rows = await all<{
        reading_code: string;
        approver_role: string;
        is_enabled: boolean;
        source_ref: string;
        consequence: string;
      }>(
        db,
        `select reading_code, approver_role, is_enabled, source_ref, consequence
           from lab_approval_reading order by reading_code`
      );
      expect(rows.length, 'C-32 has two readings and both must be carried').toBe(2);
      expect(new Set(rows.map((r) => r.approver_role)).size, 'they disagree about the role').toBe(2);
      expect(rows.filter((r) => r.is_enabled).length, '§B5 says leave it configurable').toBe(0);
      for (const r of rows) {
        expect(r.source_ref.length, `${r.reading_code} has no source`).toBeGreaterThan(20);
        expect(r.consequence.length, `${r.reading_code} states no cost`).toBeGreaterThan(20);
      }
      // The two roles the sources actually name.
      expect(rows.map((r) => r.approver_role).sort()).toEqual(['gm', 'supervisor']);
    });
  });

  it('two enabled readings is unwritable', async () => {
    await withRollback(async (db) => {
      await db.query(
        `update lab_approval_reading set is_enabled = true
          where reading_code = 'GM_APPROVES_EVERY_LAB_SUBMISSION'`
      );
      const why = await refuses(
        db,
        `update lab_approval_reading set is_enabled = true
          where reading_code = 'SUPERVISOR_ACCEPTS_LAB_RESULT'`
      );
      expect(why).toMatch(/uq_lab_approval_one_enabled|duplicate key/i);
    });
  });

  it('while C-32 is open, EITHER named role may decide — and the row records which reading', async () => {
    await withRollback(async (db) => {
      const a = await sampleAndTest(db, 'moisture_pct');
      const b = await sampleAndTest(db, 'moisture_pct');

      await beRole(db, 'gm');
      await db.query(`select public.decide_lab_submission($1, 'approved', 'Panel looks right')`, [
        a.activity,
      ]);
      await beRole(db, 'supervisor');
      await db.query(`select public.decide_lab_submission($1, 'rejected', 'Retake the photo')`, [
        b.activity,
      ]);
      await beNobody(db);

      const decided = await all<{
        verdict: string;
        decided_role: string;
        authorised_under_reading: string;
        reading_was_enabled: boolean;
      }>(
        db,
        `select verdict, decided_role, authorised_under_reading, reading_was_enabled
           from lab_decision where batch_activity_id in ($1, $2) order by seq`,
        [a.activity, b.activity]
      );
      expect(decided.length).toBe(2);
      expect(decided[0].decided_role).toBe('gm');
      expect(decided[0].authorised_under_reading).toBe('GM_APPROVES_EVERY_LAB_SUBMISSION');
      expect(decided[1].decided_role).toBe('supervisor');
      expect(decided[1].authorised_under_reading).toBe('SUPERVISOR_ACCEPTS_LAB_RESULT');
      // The whole point: the decision is authorised, and it says under WHICH unresolved reading.
      for (const d of decided) expect(d.reading_was_enabled).toBe(false);
    });
  });

  it('a role NEITHER reading names is refused, and the refusal names C-32', async () => {
    await withRollback(async (db) => {
      const { activity } = await sampleAndTest(db, 'moisture_pct');
      await beRole(db, 'operator');
      const why = await refuses(
        db,
        `select public.decide_lab_submission($1, 'approved', 'looks fine to me')`,
        [activity]
      );
      await beNobody(db);
      expect(why).toMatch(/C-32 is open/);
      expect(why).toMatch(/neither has been chosen/);
      expect(why, 'the refusal names the roles that ARE on file').toMatch(/gm or supervisor/);
    });
  });

  it('once a reading IS enabled, only that role may decide', async () => {
    await withRollback(async (db) => {
      const { activity } = await sampleAndTest(db, 'moisture_pct');
      // This is the shape of answering C-32: one UPDATE, no code change.
      await db.query(
        `update lab_approval_reading set is_enabled = true
          where reading_code = 'SUPERVISOR_ACCEPTS_LAB_RESULT'`
      );

      await beRole(db, 'gm');
      const why = await refuses(
        db,
        `select public.decide_lab_submission($1, 'approved', 'GM sign-off')`,
        [activity]
      );
      expect(why).toMatch(/C-32 has been answered/);
      expect(why).toMatch(/SUPERVISOR_ACCEPTS_LAB_RESULT/);

      await beRole(db, 'supervisor');
      const ok = await one<{ id: string }>(
        db,
        `select public.decide_lab_submission($1, 'approved', 'Panel accepted') as id`,
        [activity]
      );
      await beNobody(db);
      expect(ok.id).toBeTruthy();
    });
  });

  it('a decision needs a reason, and a non-lab activity is not a lab submission', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      const lab = await one<{ id: string }>(
        db,
        `select id from batch_activity where master_batch_id = $1 and responsible_role = 'lab_tech'
          order by seq limit 1`,
        [batch]
      );
      const op = await one<{ id: string }>(
        db,
        `select id from batch_activity where master_batch_id = $1 and responsible_role = 'operator'
          order by seq limit 1`,
        [batch]
      );

      await beRole(db, 'gm');
      const noReason = await refuses(
        db,
        `select public.decide_lab_submission($1, 'approved', '   ')`,
        [lab.id]
      );
      expect(noReason).toMatch(/needs a stated reason/);

      const notLab = await refuses(
        db,
        `select public.decide_lab_submission($1, 'approved', 'fine')`,
        [op.id]
      );
      expect(notLab).toMatch(/not a lab activity/);
      // And it points at the right mechanism rather than just refusing.
      expect(notLab).toMatch(/record_checkpoint_decision/);
      await beNobody(db);
    });
  });
});

describeDb('B5 — the queue, and the duration nobody stated', () => {
  it('the queue reads real lab activities on the staged batches', async () => {
    await withRollback(async (db) => {
      const rows = await all<{ batch_code: string; n: string }>(
        db,
        `select batch_code, count(*)::text as n from v_lab_queue group by batch_code order by 1`
      );
      // The three demo batches are staged and active, and each generates the same lab plan.
      expect(rows.length, 'the staged batches must appear').toBeGreaterThanOrEqual(3);
      for (const r of rows) expect(Number(r.n)).toBeGreaterThan(0);

      const shape = await one<{
        parameters: string[];
        band: string;
        overdue_unknown_reason: string;
      }>(
        db,
        `select parameters, band, overdue_unknown_reason from v_lab_queue
          where parameters is not null limit 1`
      );
      expect(shape.parameters.length).toBeGreaterThan(0);
      expect(['today', 'retest']).toContain(shape.band);
    });
  });

  it('TBD-55 · the queue cannot say "overdue", and it says why instead of guessing', async () => {
    await withRollback(async (db) => {
      const bands = await all<{ band: string }>(db, `select distinct band from v_lab_queue`);
      // No source gives a lab turnaround time. An 'overdue' here would be an invented duration.
      expect(bands.map((b) => b.band).sort()).not.toContain('overdue');

      const reason = await one<{ overdue_unknown_reason: string }>(
        db,
        `select overdue_unknown_reason from v_lab_queue limit 1`
      );
      expect(reason.overdue_unknown_reason).toMatch(/turnaround/i);

      // And the missing value is on file as a null with a marker, not absent.
      const setting = await one<{ int_value: number | null; conflict_id: string }>(
        db,
        `select int_value, conflict_id from lab_setting where key = 'lab_turnaround_hours'`
      );
      expect(setting.int_value).toBeNull();
      expect(setting.conflict_id).toBe('TBD-55');
    });
  });

  it('a retest moves the activity into the retest band', async () => {
    await withRollback(async (db) => {
      const { activity, test } = await sampleAndTest(db, 'moisture_pct');
      await db.query(`select public.record_lab_result($1, 76.4)`, [test]);
      const before = await one<{ band: string }>(
        db,
        `select band from v_lab_queue where activity_id = $1`,
        [activity]
      );
      expect(before.band).toBe('today');

      await beRole(db, 'lab_tech');
      await db.query(`select public.order_retest($1, 'sampling_error', 73.8)`, [test]);
      await beNobody(db);

      const after = await one<{ band: string }>(
        db,
        `select band from v_lab_queue where activity_id = $1`,
        [activity]
      );
      expect(after.band).toBe('retest');
    });
  });
});

describeDb('B5 — no instrument was invented', () => {
  it('the instrument table is EMPTY, because no source gives a fleet', async () => {
    await withRollback(async (db) => {
      const n = await one<{ n: string }>(db, `select count(*)::text as n from lab_instrument`);
      // LAB_MODEL §2 gives the KIND enum; nothing anywhere gives a serial, a count or an interval.
      expect(n.n, 'inventing instruments is exactly what rule 2 forbids').toBe('0');

      const interval = await one<{ is_nullable: string }>(
        db,
        `select is_nullable from information_schema.columns
          where table_schema='public' and table_name='lab_instrument'
            and column_name='calibration_interval_days'`
      );
      expect(interval.is_nullable).toBe('YES');
    });
  });

  it('a result with no instrument reports calibration unknown, never valid', async () => {
    await withRollback(async (db) => {
      const { test } = await sampleAndTest(db, 'moisture_pct');
      const rid = await one<{ id: string }>(
        db,
        `select public.record_lab_result($1, 73.2) as id`,
        [test]
      );
      const r = await one<{ calibration_status: string; instrument_code: string | null }>(
        db,
        `select r.calibration_status, i.code as instrument_code
           from lab_result r left join lab_instrument i on i.id = r.instrument_id
          where r.id = $1`,
        [rid.id]
      );
      expect(r.instrument_code).toBeNull();
      expect(r.calibration_status).toBe('unknown');
    });
  });

  it('an instrument with no stated interval still reports unknown — not valid by default', async () => {
    await withRollback(async (db) => {
      const inst = await one<{ id: string }>(
        db,
        `insert into lab_instrument (code, name, kind, last_calibrated_on, source_ref)
         values ('TEST-PH-01', 'Test pH meter', 'ph_meter', current_date, 'test only')
         returning id`
      );
      const { test } = await sampleAndTest(db, 'moisture_pct');
      const rid = await one<{ id: string }>(
        db,
        `select public.record_lab_result($1, 73.2, null, $2) as id`,
        [test, inst.id]
      );
      const r = await one<{ calibration_status: string }>(
        db,
        `select calibration_status from lab_result where id = $1`,
        [rid.id]
      );
      // Calibrated TODAY, but no interval is stated anywhere, so "valid" cannot be concluded.
      // `lab_method.calibration_note` says "Calibrate DAILY" in prose; prose is not a number.
      expect(r.calibration_status).toBe('unknown');
    });
  });
});
