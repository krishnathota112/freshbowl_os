/**
 * A3 — three staggered master batches, proved against the deployed project.
 *
 * THE GATE: three batches activate, and `validate_batch` returns no blocking findings on them.
 *
 * These tests read the seeded state; they do NOT create it. `s11_demo_batches.sql` is the artefact
 * and `npm run db:seed` is what runs it, so a test that built its own batches would prove the test
 * right rather than the seed. The one thing asserted inside a rolled-back transaction is the
 * capacity claim, because probing it means writing.
 *
 * The provenance assertions matter as much as the gate. Every rest duration this seed supplies has
 * to be traceable to a stated band or to the hour axis, because frozen decision 2 forbids a default
 * and rule 2 forbids an invented number. A batch that activates on made-up hours would pass the
 * gate and fail the product.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { batchDay, isWithinBaseline } from '../src/domain/time';
import { DB_URL, NO_DB_REASON, REPO_ROOT, all, one, withRollback, type Db } from './db';

/** The stagger between consecutive batches in the factory's own grid, in hours. */
function book1CadenceHours(): number {
  const grid = JSON.parse(
    readFileSync(join(REPO_ROOT, 'docs', 'source', 'book1_hour_grid.json'), 'utf8')
  ) as { batches: { start_date: string }[] };
  const [first, second] = grid.batches;
  return (
    (Date.parse(`${second.start_date}T00:00:00Z`) - Date.parse(`${first.start_date}T00:00:00Z`)) /
    3_600_000
  );
}

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

const DEMO = `code like 'MB-DEMO-%'`;

type Batch = {
  id: string;
  code: string;
  status: string;
  start_at: string;
  baseline_hours: number;
  now_hour: number;
};

async function demoBatches(db: Db): Promise<Batch[]> {
  return all<Batch>(
    db,
    `select mb.id, mb.code, mb.status::text as status, mb.start_at, pd.baseline_hours,
            (floor(extract(epoch from (now() - mb.start_at)) / 3600) + 1)::int as now_hour
       from master_batch mb
       join process_definition pd on pd.id = mb.process_definition_id
      where mb.${DEMO}
      order by mb.start_at`
  );
}

describeDb('A3 — the gate', () => {
  it('three batches exist and all three are active', async () => {
    await withRollback(async (db) => {
      const batches = await demoBatches(db);
      expect(batches.map((b) => b.code)).toEqual([
        'MB-DEMO-LATE',
        'MB-DEMO-MID',
        'MB-DEMO-EARLY',
      ]);
      for (const b of batches) expect(b.status, b.code).toBe('active');
    });
  });

  it('validate_batch returns NO blocking findings on any of them', async () => {
    await withRollback(async (db) => {
      const findings = await all<{ code: string; finding: string; message: string }>(
        db,
        `select mb.code, f.code as finding, f.message
           from master_batch mb cross join lateral validate_batch(mb.id) f
          where mb.${DEMO} and f.severity = 'blocking'
          order by 1, 2`
      );
      expect(
        findings.map((f) => `${f.code} · ${f.finding}: ${f.message}`),
        'a blocking finding means the batch should not have activated'
      ).toEqual([]);
    });
  });

  it('every one has an H0, and it is the factory start hour rather than a midnight', async () => {
    await withRollback(async (db) => {
      const clock = await one<{ h0_hour_of_day: number; timezone: string }>(
        db,
        `select h0_hour_of_day, timezone from factory_clock where id = 1`
      );
      expect(clock.timezone, 'TBD-50 is closed, so a zone must be stored').not.toBeNull();

      const rows = await all<{ code: string; local_hour: number; local_minute: number }>(
        db,
        `select mb.code,
                extract(hour from (mb.start_at at time zone fc.timezone))::int as local_hour,
                extract(minute from (mb.start_at at time zone fc.timezone))::int as local_minute
           from master_batch mb cross join factory_clock fc
          where mb.${DEMO} and fc.id = 1`
      );
      expect(rows.length).toBe(3);
      for (const r of rows) {
        expect(r.local_hour, r.code).toBe(clock.h0_hour_of_day);
        expect(r.local_minute, r.code).toBe(0);
      }
    });
  });
});

describeDb('A3 — the stagger and the three positions', () => {
  it('every H0 sits on the stagger cadence Book1 states', async () => {
    // The cadence is READ from the grid — the gap between consecutive Book1 batches' start dates —
    // not typed here. §A3 asks for that stagger; these three are three of the twelve batches alive
    // at once, so their gaps are multiples of it rather than one of it. See the seed's header.
    const cadenceHours = book1CadenceHours();
    expect(cadenceHours).toBeGreaterThan(0);

    await withRollback(async (db) => {
      const batches = await demoBatches(db);
      const base = Date.parse(batches[0].start_at) / 3_600_000;
      for (const b of batches) {
        const gap = Date.parse(b.start_at) / 3_600_000 - base;
        expect(gap % cadenceHours, `${b.code} is off the ${cadenceHours} h cadence`).toBe(0);
      }
      // And they are genuinely spread, not three batches two days apart.
      const span = Date.parse(batches.at(-1)!.start_at) - Date.parse(batches[0].start_at);
      expect(span / 3_600_000).toBeGreaterThan(cadenceHours);
    });
  });

  it('the three sit at early, mid-yard and tunnel-hold positions on their own axis', async () => {
    await withRollback(async (db) => {
      const batches = await demoBatches(db);

      // Positions are read from the clock, not asserted as constants: what matters is that they are
      // far apart, in order, and inside the baseline.
      const byCode = new Map(batches.map((b) => [b.code, b]));
      const early = byCode.get('MB-DEMO-EARLY')!;
      const mid = byCode.get('MB-DEMO-MID')!;
      const late = byCode.get('MB-DEMO-LATE')!;

      for (const b of [early, mid, late]) {
        expect(isWithinBaseline(b.now_hour, b.baseline_hours), b.code).toBe(true);
      }

      expect(early.now_hour).toBeLessThan(mid.now_hour);
      expect(mid.now_hour).toBeLessThan(late.now_hour);

      // Which day of the process each one is on, via the frozen function.
      const days = {
        early: batchDay(early.now_hour),
        mid: batchDay(mid.now_hour),
        late: batchDay(late.now_hour),
      };

      // The stated shape: one in Stage 0, one at the turner/yard day, one inside the tunnel phase.
      // The day each phase begins is READ from the process definition, never typed.
      const phases = await one<{ yard_day: number; tunnel_day: number }>(
        db,
        `select (select rel_day from process_activity pa
                   join process_definition pd on pd.id = pa.process_definition_id
                  where pd.code = 'PROCESS-2026B' and pa.code = 'TR-T1') as yard_day,
                (select rel_day from process_activity pa
                   join process_definition pd on pd.id = pa.process_definition_id
                  where pd.code = 'PROCESS-2026B' and pa.code = 'TN-HOLD') as tunnel_day`
      );

      expect(days.early, 'EARLY must be in Stage 0').toBeLessThan(phases.yard_day);
      expect(days.mid, 'MID must be at or past the turner day').toBeGreaterThanOrEqual(
        phases.yard_day
      );
      expect(days.mid, 'MID must not yet be in the tunnel').toBeLessThan(phases.tunnel_day);
      expect(days.late, 'LATE must be in the tunnel phase').toBeGreaterThanOrEqual(
        phases.tunnel_day
      );
    });
  });

  it('the whole straw stream is present — an unbound role would silently drop it', async () => {
    await withRollback(async (db) => {
      // The bug this catches: binding STRUCTURAL_STRAW to a material code that does not exist leaves
      // the role unbound, and generate_activity_plan skips the stream by design. Ten activities
      // vanish, the convergence gates have nothing to wait on, and nothing errors.
      const missing = await all<{ code: string; batch: string }>(
        db,
        `select pa.code, mb.code as batch
           from master_batch mb
           join process_definition pd on pd.id = mb.process_definition_id
           cross join process_activity pa
          where mb.${DEMO} and pa.process_definition_id = pd.id and pa.default_enabled
            and not exists (select 1 from batch_activity ba
                             where ba.master_batch_id = mb.id
                               and ba.process_activity_id = pa.id)
          order by 1, 2`
      );
      expect(missing.map((m) => `${m.batch} is missing ${m.code}`)).toEqual([]);

      // And every role that has a default lead is actually bound.
      const unbound = await all<{ code: string; role: string }>(
        db,
        `select mb.code, mre.role::text as role
           from master_batch mb
           cross join material_role_eligibility mre
          where mb.${DEMO} and mre.is_default_lead
            and not exists (select 1 from batch_material_role bmr
                             where bmr.master_batch_id = mb.id and bmr.role = mre.role)
          order by 1, 2`
      );
      expect(unbound.map((u) => `${u.code} has no ${u.role}`)).toEqual([]);
    });
  });
});

describeDb('A3 — no rest duration is an invented number', () => {
  it('every time gate has a duration, and every one is traceable', async () => {
    await withRollback(async (db) => {
      const gates = await all<{
        batch: string;
        code: string;
        day0: number;
        dmin: number | null;
        dmax: number | null;
        start_hour: number;
        successor_hour: number | null;
        src: string | null;
      }>(
        db,
        `select mb.code as batch, ba.code, ba.day0_duration_hr as day0,
                ba.duration_target_min_hr as dmin, ba.duration_target_max_hr as dmax,
                pa.standard_start_hour as start_hour,
                (select min(succ.standard_start_hour)
                   from gate_rule gr
                   join process_activity succ on succ.id = gr.process_activity_id
                  where gr.phase = 'entry' and gr.kind = 'PREDECESSOR'
                    and gr.config->'activity_codes' ? pa.code
                    and succ.process_definition_id = pa.process_definition_id
                    and succ.standard_start_hour > pa.standard_start_hour) as successor_hour,
                mb.config->>('rest_src_' || ba.code) as src
           from batch_activity ba
           join master_batch mb on mb.id = ba.master_batch_id
           join process_activity pa on pa.id = ba.process_activity_id
          where mb.${DEMO} and ba.is_time_gate
          order by 1, pa.seq`
      );

      expect(gates.length).toBeGreaterThan(0);

      for (const g of gates) {
        const where = `${g.batch} · ${g.code}`;
        expect(g.day0, `${where} has no Day-0 duration`).not.toBeNull();
        expect(Number(g.day0), where).toBeGreaterThan(0);

        // Every value must carry its provenance in the batch's own config.
        expect(g.src, `${where} has no rest_src_ record`).not.toBeNull();

        // And it must equal one of exactly two derivations. No free numbers.
        const fromBand = g.dmax !== null && Number(g.day0) === Number(g.dmax);
        const fromAxis =
          g.successor_hour !== null && Number(g.day0) === g.successor_hour - g.start_hour;

        expect(
          fromBand || fromAxis,
          `${where} · ${g.day0} h matches neither the stated band (${g.dmin}-${g.dmax}) nor the ` +
            `hour-axis gap (H${g.start_hour} to H${g.successor_hour}). A duration with no source ` +
            `is exactly what rule 2 forbids.`
        ).toBe(true);

        // A stated band wins over the axis, so a value inside a band is never overridden.
        if (g.dmax !== null) expect(fromBand, `${where} must follow its stated band`).toBe(true);
      }
    });
  });

  it('the process definition still carries NO default duration — the system never defaults one', async () => {
    await withRollback(async (db) => {
      // Frozen decision 2 is about the SYSTEM. The Day-0 answers above live on the batch; the
      // template must stay silent, or a future batch would inherit a duration nobody chose.
      const seeded = await all<{ code: string }>(
        db,
        `select pa.code from process_activity pa
           join process_definition pd on pd.id = pa.process_definition_id
          where pd.code = 'PROCESS-2026B' and pa.is_time_gate
            and pa.tbd_marker is not null
            and pa.duration_target_max_hr is not null`
      );
      expect(
        seeded.map((s) => s.code),
        'a rest with an unresolved TBD must not carry a template duration'
      ).toEqual([]);

      // And a fresh batch with no rest answers must still refuse to activate.
      const bid = await one<{ id: string }>(
        db,
        `select public.create_master_batch(
                  'TEST-NO-RESTS', 'TEST-NO-RESTS', current_date,
                  (select jsonb_object_agg(e.key, e.value)
                     from jsonb_each(public.demo_day0_config()) e
                    where e.key not like 'rest_hr_%'),
                  (select jsonb_agg(jsonb_build_object('role', mre.role, 'material_code', m.code, 'lead', true))
                     from material_role_eligibility mre join material m on m.id = mre.material_id
                    where mre.is_default_lead),
                  'Ramarao', null, public.factory_h0_instant(current_date)) as id`
      );
      await expect(db.query(`select public.activate_batch($1)`, [bid.id])).rejects.toThrow(
        /no duration set/
      );
    });
  });
});

describeDb('A3 — vessels are allocated, not overbooked', () => {
  it('no two demo batches hold the same vessel inside the double-booking window', async () => {
    await withRollback(async (db) => {
      // Stricter than validate_batch, which only compares against batches that are already active.
      // This holds regardless of status, so the allocation survives all three running at once.
      const clashes = await all<{ a: string; b: string; loc: string }>(
        db,
        `select ma.code || ' ' || a.code || ' ' || a.scope_label as a,
                mb2.code || ' ' || b.code || ' ' || b.scope_label as b,
                l.code as loc
           from batch_activity a
           join master_batch ma on ma.id = a.master_batch_id
           join location l on l.id = a.destination_location_id
           join batch_activity b on b.destination_location_id = a.destination_location_id
                                and b.master_batch_id <> a.master_batch_id
           join master_batch mb2 on mb2.id = b.master_batch_id
          where ma.${DEMO} and mb2.${DEMO}
            and b.planned_start_at between a.planned_start_at - interval '2 days'
                                       and a.planned_start_at + interval '2 days'
          limit 20`
      );
      expect(clashes.map((c) => `${c.loc}: ${c.a} vs ${c.b}`)).toEqual([]);
    });
  });

  it('every movement that needs a vessel has one, and a reload moves elsewhere', async () => {
    await withRollback(async (db) => {
      const missing = await all<{ batch: string; code: string; scope: string; kind: string }>(
        db,
        `select mb.code as batch, ba.code, ba.scope_label as scope, mr.destination_kind::text as kind
           from batch_activity ba
           join master_batch mb on mb.id = ba.master_batch_id
           join movement_rule mr on mr.process_activity_id = ba.process_activity_id
          where mb.${DEMO} and mr.destination_kind in ('BUNKER','TUNNEL')
            and ba.destination_location_id is null`
      );
      expect(missing.map((m) => `${m.batch} ${m.code} ${m.scope} needs a ${m.kind}`)).toEqual([]);

      const sameVessel = await all<{ batch: string; code: string; scope: string }>(
        db,
        `select mb.code as batch, ba.code, ba.scope_label as scope
           from batch_activity ba
           join master_batch mb on mb.id = ba.master_batch_id
           join movement_rule mr on mr.process_activity_id = ba.process_activity_id
          where mb.${DEMO} and mr.requires_distinct_vessel
            and ba.source_location_id is not null
            and ba.source_location_id = ba.destination_location_id`
      );
      expect(sameVessel.map((s) => `${s.batch} ${s.code} ${s.scope} reloads into its own vessel`)).toEqual(
        []
      );
    });
  });

  it('no YARD destination is set — one yard cannot host three concurrent batches', async () => {
    await withRollback(async (db) => {
      // Stated rather than implied: the double-booking check would fire on every pair of concurrent
      // batches if a yard destination were assigned, because the factory records exactly one YARD
      // location. Yard piles are scope_label plus the movement rule's creates_locations, and turning
      // them into occupancy is A5.
      const yardCount = await one<{ n: string }>(
        db,
        `select count(*)::text as n from location where kind = 'YARD'`
      );
      expect(Number(yardCount.n)).toBe(1);

      const assigned = await all<{ code: string }>(
        db,
        `select ba.code from batch_activity ba
           join master_batch mb on mb.id = ba.master_batch_id
           join location l on l.id = ba.destination_location_id
          where mb.${DEMO} and l.kind = 'YARD'`
      );
      expect(assigned).toEqual([]);
    });
  });
});

describeDb('A3 — the pre-A2 batches were replaced, not repaired', () => {
  it('all three are cancelled, and nothing was deleted', async () => {
    await withRollback(async (db) => {
      const old = await all<{ code: string; status: string; acts: string }>(
        db,
        `select mb.code, mb.status::text as status,
                (select count(*)::text from batch_activity b where b.master_batch_id = mb.id) as acts
           from master_batch mb
          where mb.code in ('batch','MB-2026-08-20','MB-2026-09-20')
          order by mb.code`
      );
      expect(old.length, 'the records must survive cancellation').toBe(3);
      for (const o of old) {
        expect(o.status, o.code).toBe('cancelled');
        expect(Number(o.acts), `${o.code} kept its activities`).toBeGreaterThan(0);
      }
    });
  });

  it('cancelling preserved the one activity that had genuinely been completed', async () => {
    await withRollback(async (db) => {
      const kept = await one<{ n: string }>(
        db,
        `select count(*)::text as n from batch_activity ba
           join master_batch mb on mb.id = ba.master_batch_id
          where mb.code = 'MB-2026-09-20' and ba.state = 'COMPLETED'`
      );
      expect(Number(kept.n), 'a cancellation must not rewrite what actually happened').toBe(1);
    });
  });

  it('the live-batch view excludes them', async () => {
    await withRollback(async (db) => {
      // WHAT THIS TEST IS FOR: the cancelled pre-A2 batches must not appear on the board.
      //
      // It used to assert the live set was EXACTLY the three demo codes, which made it fail the first
      // time a person used `/admin/batch/new` — `v_live_batch` is `status in ('draft','active')` by
      // design, because the Batches list has to show a draft for somebody to go and activate it, and
      // `UI_IMPLEMENTATION_PLAN §S2` criterion 17 wants a draft on the tower showing its plan rail
      // alone. A suite that cannot survive the product being used is testing the wrong thing.
      const live = await all<{ code: string }>(db, `select code from v_live_batch order by code`);
      const codes = live.map((l) => l.code);

      // The three demo batches are live.
      for (const code of ['MB-DEMO-EARLY', 'MB-DEMO-LATE', 'MB-DEMO-MID']) {
        expect(codes, `${code} is missing from the live board`).toContain(code);
      }

      // And nothing cancelled is, whatever else has been created since.
      const cancelled = await all<{ code: string }>(
        db,
        `select code from master_batch where status = 'cancelled'`
      );
      expect(cancelled.length, 'the pre-A2 batches should still be on file as cancelled').toBeGreaterThan(0);
      for (const c of cancelled) {
        expect(codes, `cancelled ${c.code} is on the live board`).not.toContain(c.code);
      }

      // Every batch on the board is one of the two live statuses — the view's own contract.
      const wrong = await all<{ code: string; status: string }>(
        db,
        `select code, status::text as status from v_live_batch
          where status not in ('draft','active')`
      );
      expect(wrong).toEqual([]);
    });
  });
});

describeDb('A3 — no work history was fabricated', () => {
  /**
   * THE TITLE IS UNCHANGED AND STILL THE POINT. What changed is that history now EXISTS.
   *
   * A3 staged position-on-the-axis and no completed work, so this asserted absence: nothing
   * COMPLETED, no counter above zero. `scripts/stage-history.mjs` has since walked the three batches
   * forward through `submit_activity` and `bind_evidence` over HTTP as the seeded accounts, on the
   * client's instruction.
   *
   * Asserting absence would now fail for the right reason, which makes it a useless test. Asserting
   * AUTHENTICITY is what the title always meant and is strictly harder: every completed activity must
   * carry the marks only `submit_activity` leaves, and every satisfied requirement must have a real
   * stored object behind it. A fabricated history — rows inserted, counters incremented — fails these
   * where it passed the old ones.
   */
  it('every completed activity went through submit_activity, and says who by', async () => {
    await withRollback(async (db) => {
      const forged = await all<{ code: string; title: string; why: string }>(
        db,
        `select mb.code, ba.title,
                case when ba.actual_end is null then 'no actual_end'
                     when ba.submitted_at is null then 'no submitted_at'
                     when ba.submitted_by is null then 'no submitted_by — nobody submitted it'
                     when ba.actual_recorded_at is null then 'no actual_recorded_at'
                end as why
           from batch_activity ba join master_batch mb on mb.id = ba.master_batch_id
          where mb.${DEMO} and ba.state in ('COMPLETED','DEVIATION')
            and (ba.actual_end is null or ba.submitted_at is null
                 or ba.submitted_by is null or ba.actual_recorded_at is null)`
      );
      expect(
        forged.map((f) => `${f.code} ${f.title}: ${f.why}`),
        'a completed activity with no submitter did not come from submit_activity'
      ).toEqual([]);
    });
  });

  it('every satisfied evidence requirement has a real stored object behind it', async () => {
    await withRollback(async (db) => {
      // The original intent of this block, kept verbatim in spirit: a counter may never be above zero
      // without a file. A4 made `satisfied_count` a count of live `evidence_media` rows, and this is
      // the assertion that the rows point at objects that exist in the bucket.
      const forged = await all<{ code: string; label: string; n: string }>(
        db,
        `select mb.code, r.label, r.satisfied_count::text as n
           from batch_activity_evidence_req r
           join batch_activity ba on ba.id = r.batch_activity_id
           join master_batch mb on mb.id = ba.master_batch_id
          where mb.${DEMO} and r.satisfied_count > 0
            and r.satisfied_count <> (
              select count(*) from evidence_media m
               join storage.objects o
                 on o.bucket_id = 'evidence' and o.name = m.storage_path
              where m.requirement_id = r.id and m.superseded_by_id is null)`
      );
      expect(
        forged.map((f) => `${f.code} ${f.label}: counter ${f.n} with no matching object`),
        'an evidence counter above zero with no stored file is a forged record'
      ).toEqual([]);

      const anonymous = await one<{ n: string }>(
        db,
        `select count(*)::text as n from evidence_media m
           join master_batch mb on mb.id = m.master_batch_id
          where mb.${DEMO} and (m.uploaded_by is null or m.uploaded_at is null)`
      );
      expect(Number(anonymous.n), 'evidence with no uploader is not evidence').toBe(0);
    });
  });

  it('no activity is COMPLETED while its own gating evidence is outstanding — criterion 17', async () => {
    await withRollback(async (db) => {
      // The state the engine cannot produce. `submit_activity` holds at IN_PROGRESS instead, which is
      // why two of the staged loads are sitting there rather than completed.
      const impossible = await all<{ code: string; title: string; label: string }>(
        db,
        `select mb.code, ba.title, r.label
           from batch_activity ba
           join master_batch mb on mb.id = ba.master_batch_id
           join batch_activity_evidence_req r on r.batch_activity_id = ba.id
          where mb.${DEMO} and ba.state = 'COMPLETED'
            and r.gates_submission and r.satisfied_count < r.min_count`
      );
      expect(
        impossible.map((i) => `${i.code} ${i.title} completed without ${i.label}`),
        'evidence gates submission — a completed activity cannot owe a photograph'
      ).toEqual([]);
    });
  });

  it('the staged history is real: three batches, three depths, and variance that derives', async () => {
    await withRollback(async (db) => {
      const depth = await all<{ code: string; done: string; ends: string; variance: string }>(
        db,
        `select mb.code,
                count(*) filter (where ba.state = 'COMPLETED')::text as done,
                count(ba.actual_end)::text as ends,
                count(ba.variance_minutes)::text as variance
           from batch_activity ba join master_batch mb on mb.id = ba.master_batch_id
          where mb.${DEMO} group by 1 order by 1`
      );
      // Every batch has work, and no two are at the same depth — the staircase needs more than one
      // bar to exist, and it needs them at different positions.
      for (const d of depth) {
        expect(Number(d.done), `${d.code} has no completed work`).toBeGreaterThan(0);
      }
      const depths = depth.map((d) => Number(d.done));
      expect(new Set(depths).size, 'two batches sit at the same depth').toBe(depths.length);

      // `variance_minutes` is generated. Where it exists it must equal actual_end - planned_end_at,
      // and where either side is missing it must be null — never zero standing in for unknown.
      const wrong = await all<{ code: string; title: string }>(
        db,
        `select mb.code, ba.title
           from batch_activity ba join master_batch mb on mb.id = ba.master_batch_id
          where mb.${DEMO}
            and ba.variance_minutes is distinct from case
              when ba.actual_end is not null and ba.planned_end_at is not null
                then (extract(epoch from (ba.actual_end - ba.planned_end_at)) / 60)::int
              end`
      );
      expect(wrong.map((w) => `${w.code} ${w.title}`), 'variance is not deriving').toEqual([]);
    });
  });

  it('and the old absence assertion is deliberately gone, not lost', async () => {
    await withRollback(async (db) => {
      // Guard against this file being "repaired" back to asserting an empty board. If a future run
      // wipes the staged history, THIS fails and names the reason, instead of the suite going green on
      // a product with nothing in it.
      const n = await one<{ n: string }>(
        db,
        `select count(*)::text as n from batch_activity ba
           join master_batch mb on mb.id = ba.master_batch_id
          where mb.${DEMO} and ba.state = 'COMPLETED'`
      );
      expect(
        Number(n.n),
        'the demo batches have no completed work — re-run scripts/stage-history.mjs'
      ).toBeGreaterThan(0);
    });
  });

  it('every state on the board was derived by the engine, and every locked row explains itself', async () => {
    await withRollback(async (db) => {
      const unexplained = await all<{ code: string; title: string; state: string }>(
        db,
        `select mb.code, ba.title, ba.state::text as state
           from batch_activity ba join master_batch mb on mb.id = ba.master_batch_id
          where mb.${DEMO}
            and ba.state in ('LOCKED','WAITING_TIME','WAITING_CONDITION','AWAITING_LAB','BLOCKED','DEVIATION')
            and coalesce(ba.blocked_reason, '') = ''`
      );
      expect(unexplained).toEqual([]);

      const placeholders = await all<{ reason: string }>(
        db,
        `select distinct ba.blocked_reason as reason
           from batch_activity ba join master_batch mb on mb.id = ba.master_batch_id
          where mb.${DEMO} and ba.blocked_reason ~ '[{}]'`
      );
      expect(placeholders).toEqual([]);
    });
  });
});
