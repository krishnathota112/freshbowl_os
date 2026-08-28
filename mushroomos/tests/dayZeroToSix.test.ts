/**
 * SLICE 1 · H0 → H168, Day 0–6, end to end.
 *
 * The nine product decisions of 23 August 2026 (`room2.md`), and the walk the client asked for:
 *
 *   PRE-BATCH → H0 → WEIGHMENT → DAY 1 WETTING → HOPPER 1 → LAB → HOPPER 2 → LAB → BUNKER
 *   → REST → DAY 4 UNLOAD → PADDY INSPECTION → PADDY WEIGHMENT → HOPPER → RELOAD
 *   → DAY 5 SOAK 1 → LAB → BUNKER REST → DAY 6 SOAK 2
 *
 * ⚠ THE WALK IS NOT SCRIPTED. It does not call the activities in that order. It repeatedly asks the
 * engine "what is READY?" and completes whatever comes back, then asserts the ORDER THAT EMERGED
 * matches the chain above. A scripted walk would pass even if every gate were missing; this one
 * fails if any dependency is wrong, and it is the only form that proves the gates rather than the
 * test's own arithmetic.
 *
 * Everything runs as `postgres` inside a rolled-back transaction, except the last suite, which goes
 * over HTTP with real JWTs because decision 9 is a claim about what five different roles can see.
 */

import { describe, expect, it } from 'vitest';
import {
  DB_URL,
  NO_DB_REASON,
  all,
  createActiveBatch,
  createDraftBatch,
  one,
  refuses,
  satisfyEvidence,
  satisfyPrebatchMaterialCheck,
  withRollback,
  type Db,
} from './db';
import { ACCOUNTS, HTTP_READY, NO_HTTP_REASON, rest, rpc, signIn } from './http';

const describeDb = DB_URL ? describe : describe.skip;
const describeHttp = DB_URL && HTTP_READY ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);
else if (!HTTP_READY) console.warn(`\n  SKIPPED (http only): ${NO_HTTP_REASON}\n`);

/** The last day of this slice. Read from the chain the client named, not from a process constant. */
const SLICE_LAST_DAY = 6;

/** A start date far enough back that a backdated actual still lands after H0. */
function startDateDaysBack(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * A value for every field on an activity that will NOT trip a variance.
 *
 * Mirrors `submit_activity`'s own comparison order, which is what makes the walk complete rather
 * than stalling on deviations: a quantity field is compared against `planned_qty_mt`, everything
 * else against `day0_value`, and a banded field against its band.
 */
async function inRangeValues(db: Db, activityId: string): Promise<Record<string, string>> {
  const rows = await all<{ field_key: string; value: string }>(
    db,
    `select v.field_key,
            case
              when v.field_key like '%qty%' and ba.planned_qty_mt is not null
                then ba.planned_qty_mt::text
              when af.datatype in ('numeric','duration') then
                coalesce(
                  case
                    when v.sop_min is not null and v.sop_max is not null
                      then ((v.sop_min + v.sop_max) / 2)::text
                    when v.sop_min is not null then v.sop_min::text
                    when v.sop_max is not null then v.sop_max::text
                  end,
                  nullif(v.day0_value, ''),
                  '1')
              else coalesce(nullif(v.day0_value, ''), 'recorded')
            end as value
       from batch_activity_value v
       join batch_activity ba on ba.id = v.batch_activity_id
       join activity_field af on af.process_activity_id = ba.process_activity_id
                             and af.key = v.field_key
      where v.batch_activity_id = $1
        -- An operator submits what they were asked for. A not_collected field, such as a rest
        -- duration, is a Day-0 answer rather than something recorded at the card.
        and coalesce(v.operator_input, 'required') <> 'not_collected'`,
    [activityId]
  );
  return Object.fromEntries(rows.map((r) => [r.field_key, r.value]));
}

type Completed = { code: string; scope: string; instance: number; day: number };

/** Every state in the slice, as one comparable string. Used to detect a genuinely stalled engine. */
async function stateFingerprint(db: Db, batch: string, lastDay: number): Promise<string> {
  const rows = await all<{ line: string }>(
    db,
    `select ba.code || ':' || ba.instance_no || '=' || ba.state as line
       from batch_activity ba
      where ba.master_batch_id = $1 and ba.rel_day <= $2
      order by ba.seq, ba.instance_no`,
    [batch, lastDay]
  );
  return rows.map((r) => r.line).join('|');
}

/**
 * Drive the batch forward by asking the engine what is READY, until nothing moves at all.
 *
 * Returns the order things actually completed in. `advance_batch` and `release_elapsed_rests` are
 * called every round because a time gate opens on the SERVER clock, not because a test said so.
 *
 * ⚠ THE STOP CONDITION IS "NOTHING CHANGED", NOT "NOTHING IS READY".
 *
 * The first version stopped as soon as no WORK was ready, and it stalled with eight activities LOCKED
 * behind the two rests. That was the driver's fault, not the engine's: a rest needs one round to move
 * `LOCKED → WAITING_TIME` (which is when `advance_batch` writes `unblocks_at`) and a further round
 * for `now() >= unblocks_at` to be re-read and complete it. A round with no ready work is therefore a
 * normal part of passing a time gate, and breaking on it abandons the walk one step early.
 */
async function walkForward(db: Db, batch: string, lastDay: number): Promise<Completed[]> {
  const done: Completed[] = [];

  // Bounded so a genuinely stalled engine fails the test instead of hanging.
  for (let round = 0; round < 80; round++) {
    const before = await stateFingerprint(db, batch, lastDay);

    await db.query(`select public.release_elapsed_rests($1)`, [batch]);
    await db.query(`select public.advance_batch($1)`, [batch]);

    // ⚠ TIME GATES ARE INCLUDED, and that is how the engine actually works.
    //
    // `advance_batch` step 1 moves a rest whose window has elapsed to **READY**, not to COMPLETED —
    // it still has to be submitted to close it out, and `submit_activity` re-checks the
    // `DAY0_DURATION` exit gate, so submitting one early is refused. Excluding time gates left every
    // rest sitting at READY and eight activities LOCKED behind them.
    const ready = await all<{
      id: string;
      code: string;
      scope_label: string;
      instance_no: number;
      rel_day: number;
      is_time_gate: boolean;
    }>(
      db,
      `select ba.id, ba.code, ba.scope_label, ba.instance_no, ba.rel_day, ba.is_time_gate
         from batch_activity ba
        where ba.master_batch_id = $1
          and ba.rel_day <= $2
          and ba.state in ('READY','IN_PROGRESS')
        order by ba.seq, ba.instance_no`,
      [batch, lastDay]
    );

    for (const a of ready) {
      // A rest is nobody's task: no start, no evidence, no fields. `start_activity` would also
      // rewrite `actual_start`, which is what `unblocks_at` was derived from.
      if (!a.is_time_gate) {
        await db.query(`select public.start_activity($1)`, [a.id]);
        await satisfyEvidence(db, a.id);
      }
      const values = a.is_time_gate ? {} : await inRangeValues(db, a.id);
      const r = await one<{ new_state: string; outstanding_evidence: string | null }>(
        db,
        `select new_state, outstanding_evidence from public.submit_activity($1, $2::jsonb)`,
        [a.id, JSON.stringify(values)]
      );
      expect(
        r.new_state,
        `${a.code} ${a.scope_label} did not complete: ${r.outstanding_evidence ?? r.new_state}`
      ).toBe('COMPLETED');
      done.push({
        code: a.code,
        scope: a.scope_label,
        instance: a.instance_no,
        day: a.rel_day,
      });
    }

    if ((await stateFingerprint(db, batch, lastDay)) === before) break;
  }
  return done;
}

/** The index of the FIRST completion of a code, or -1. */
const firstAt = (done: Completed[], code: string) => done.findIndex((d) => d.code === code);
/** The index of the LAST completion of a code, or -1. */
const lastAt = (done: Completed[], code: string) =>
  done.reduce((acc, d, i) => (d.code === code ? i : acc), -1);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describeDb('Day 0–6 · decision 2 · the incoming material check is a real prerequisite', () => {
  it('a batch with no material check CANNOT be activated, and the refusal says why', async () => {
    await withRollback(async (db) => {
      const batch = await createDraftBatch(db);

      const finding = await all<{ code: string; message: string }>(
        db,
        `select code, message from validate_batch($1) where code = 'MATERIAL_NOT_CHECKED'`,
        [batch]
      );
      expect(finding.length, 'the prerequisite is not reported at all').toBe(1);
      expect(finding[0].message).toMatch(/before the batch clock starts/);

      // And it genuinely blocks — `activate_batch` refuses while any blocking finding stands, and it
      // quotes the finding's own MESSAGE rather than its code, because the message is what an admin
      // can act on.
      const why = await refuses(db, `select public.activate_batch($1)`, [batch]);
      expect(why).toMatch(/Cannot activate/);
      expect(why).toMatch(/No incoming-material check is on record/);
    });
  });

  it('the check is recorded against the PENDING batch and sits outside the hour axis', async () => {
    await withRollback(async (db) => {
      const batch = await createDraftBatch(db);
      await satisfyPrebatchMaterialCheck(db, batch);

      const c = await one<{
        tests_requested: number;
        accepted: number;
        failed: number;
        before_h0: boolean | null;
        checkpoint_code: string;
      }>(
        db,
        `select tests_requested, accepted, failed, before_h0, checkpoint_code
           from v_prebatch_material_check where master_batch_id = $1`,
        [batch]
      );
      expect(c.tests_requested).toBe(2);
      expect(c.accepted).toBe(2);
      expect(c.failed).toBe(0);
      // ⚠ THE CLAIM DECISION 2 MAKES. The reading was taken before the clock started.
      expect(c.before_h0, 'the check must sit before H0, not inside the 552-hour clock').toBe(true);

      // NOT on the hour axis: no activity, therefore no batch hour, therefore nothing to place.
      const onAxis = await one<{ n: string }>(
        db,
        `select count(*)::text as n from lab_sample s
          where s.master_batch_id = $1 and s.batch_activity_id is not null`,
        [batch]
      );
      expect(onAxis.n, 'a pre-batch sample must not be bound to an activity').toBe('0');

      // And the finding is gone, so the batch can now start.
      const blocking = await all<{ code: string }>(
        db,
        `select code from validate_batch($1) where severity = 'blocking'`,
        [batch]
      );
      expect(blocking.map((b) => b.code)).not.toContain('MATERIAL_NOT_CHECKED');
    });
  });

  it('once the batch is running, an incoming check can no longer be back-filled', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      const cp = await one<{ id: string }>(
        db,
        `select id from lab_checkpoint where is_prebatch order by checkpoint_map limit 1`
      );
      const why = await refuses(db, `select public.open_prebatch_sample($1, $2)`, [batch, cp.id]);
      expect(why).toMatch(/prerequisite for activation/);
      expect(why).toMatch(/active/);
    });
  });

  it('a mid-batch checkpoint is refused — only incoming material is pre-batch', async () => {
    await withRollback(async (db) => {
      const batch = await createDraftBatch(db);
      // The nitrogen-source and straw checks are `material_lot` scoped too, and are deliberately
      // NOT flagged: they happen inside the clock. Flagging them would deadlock every batch.
      const cp = await one<{ id: string; code: string }>(
        db,
        `select id, code from lab_checkpoint
          where checkpoint_map = 'LAB_DICTATION' and code = 'NITROGEN_SOURCE_ARRIVAL'`
      );
      const why = await refuses(db, `select public.open_prebatch_sample($1, $2)`, [batch, cp.id]);
      expect(why).toMatch(/not a pre-batch checkpoint/);
    });
  });

  it('a FAILING incoming result blocks, and a retest clears it — hold, correct, retest', async () => {
    await withRollback(async (db) => {
      const batch = await createDraftBatch(db);
      const cp = await one<{ id: string }>(
        db,
        `select id from lab_checkpoint where is_prebatch order by checkpoint_map limit 1`
      );
      const sample = await one<{ id: string }>(
        db,
        `select public.open_prebatch_sample($1, $2) as id`,
        [batch, cp.id]
      );

      // A parameter that HAS a band, so a fail is reachable. The raw-material checkpoint maps to no
      // lab_spec row (TBD-36), so the band is attached to the test directly to make the point.
      const test = await one<{ id: string }>(
        db,
        `select public.request_lab_test($1, 'moisture_pct', 'system') as id`,
        [sample.id]
      );
      await db.query(`update lab_test set target_min = 40, target_max = 55, spec_found = true
                       where id = $1`, [test.id]);
      const v1 = await one<{ id: string }>(
        db,
        `select public.record_lab_result($1, 56.2) as id`,
        [test.id]
      );
      const r1 = await one<{ verdict: string }>(db, `select verdict from lab_result where id = $1`, [
        v1.id,
      ]);
      expect(r1.verdict).toBe('fail');

      const failed = await all<{ code: string; message: string }>(
        db,
        `select code, message from validate_batch($1) where code = 'MATERIAL_FAILED'`,
        [batch]
      );
      expect(failed.length, 'an out-of-spec incoming reading must block the batch').toBe(1);
      expect(failed[0].message).toMatch(/Hold the material/);

      // The client's flow: "NO → hold / corrective action / retest". The retest supersedes.
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ app_metadata: { app_role: 'lab_tech' } }),
      ]);
      const v2 = await one<{ id: string }>(
        db,
        `select public.order_retest($1, 'post_corrective_action', 48.0) as id`,
        [test.id]
      );
      await db.query(`select public.accept_lab_result($1, 'Retest within band')`, [v2.id]);
      await db.query(`select set_config('request.jwt.claims', '', true)`);

      const stillFailed = await all<{ code: string }>(
        db,
        `select code from validate_batch($1) where code = 'MATERIAL_FAILED'`,
        [batch]
      );
      expect(stillFailed, 'the retest supersedes the failure, so the block clears').toEqual([]);

      // And v1 is still on the record — it is never hidden.
      const history = await all<{ version: number; verdict: string }>(
        db,
        `select version, verdict from v_lab_result_history where test_id = $1 order by version`,
        [test.id]
      );
      expect(history.map((h) => `v${h.version}:${h.verdict}`)).toEqual(['v1:fail', 'v2:pass']);
    });
  });

  it('an unaccepted result blocks, and only a lab technician or supervisor may accept', async () => {
    await withRollback(async (db) => {
      const batch = await createDraftBatch(db);
      const cp = await one<{ id: string }>(
        db,
        `select id from lab_checkpoint where is_prebatch order by checkpoint_map limit 1`
      );
      const sample = await one<{ id: string }>(
        db,
        `select public.open_prebatch_sample($1, $2) as id`,
        [batch, cp.id]
      );
      const test = await one<{ id: string }>(
        db,
        `select public.request_lab_test($1, 'moisture_pct', 'system') as id`,
        [sample.id]
      );
      const result = await one<{ id: string }>(
        db,
        `select public.record_lab_result($1, 56.2) as id`,
        [test.id]
      );

      const notAccepted = await all<{ code: string; message: string }>(
        db,
        `select code, message from validate_batch($1) where code = 'MATERIAL_NOT_ACCEPTED'`,
        [batch]
      );
      expect(notAccepted.length, 'a recorded but unsigned reading must not clear the batch').toBe(1);
      expect(notAccepted[0].message).toMatch(/accept them before the batch can start/);

      // ROLE_AND_APPROVAL_MODEL ticks "Accept a lab result as final" for Lab and Supervisor only.
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ app_metadata: { app_role: 'operator' } }),
      ]);
      const why = await refuses(db, `select public.accept_lab_result($1)`, [result.id]);
      expect(why).toMatch(/may not accept a lab result as final/);

      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ app_metadata: { app_role: 'supervisor' } }),
      ]);
      await db.query(`select public.accept_lab_result($1, 'Accepted on record')`, [result.id]);
      await db.query(`select set_config('request.jwt.claims', '', true)`);

      const cleared = await all<{ code: string }>(
        db,
        `select code from validate_batch($1) where code = 'MATERIAL_NOT_ACCEPTED'`,
        [batch]
      );
      expect(cleared).toEqual([]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describeDb('Day 0–6 · decision 3 · four Day-1 checkpoints, independently recorded', () => {
  it('all four exist as separate activities, each with its own state and timestamps', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      const rows = await all<{
        code: string;
        seq: number;
        who: string;
        params: string[];
        n: string;
      }>(
        db,
        `select ba.code, ba.seq, ba.responsible_role::text as who, ba.lab_parameters as params,
                count(*)::text as n
           from batch_activity ba
          where ba.master_batch_id = $1 and ba.rel_day = 1 and ba.responsible_role = 'lab_tech'
          group by ba.code, ba.seq, ba.responsible_role, ba.lab_parameters
          order by ba.seq`,
        [batch]
      );

      expect(
        rows.map((r) => r.code),
        'the client asked for four independently recorded Day-1 checkpoints'
      ).toEqual(['LAB-FIB-WET', 'LAB-FIB-MOISTURE-1', 'LAB-FIB-HOP2', 'LAB-FIB-PREBUNK']);

      for (const r of rows) {
        expect(r.who).toBe('lab_tech');
        // The dictation §3.1–§3.4 asks for moisture, pH and EC at every one.
        expect(r.params.slice().sort()).toEqual(['ec', 'moisture_pct', 'ph']);
        // "Independently recorded" means one row each, so each has its own actual_start/end.
        expect(r.n).toBe('1');
      }

      // Separate rows means separate timestamps. Nothing shares an id.
      const ids = await all<{ id: string }>(
        db,
        `select id from batch_activity
          where master_batch_id = $1 and rel_day = 1 and responsible_role = 'lab_tech'`,
        [batch]
      );
      expect(new Set(ids.map((i) => i.id)).size).toBe(4);
    });
  });

  it('each check is gated behind the operation it measures — not READY before it', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      // The hopper-1 check used to have no predecessor at all, so it opened immediately even though
      // it reports what pass 1 produced.
      for (const [check, predecessor] of [
        ['LAB-FIB-MOISTURE-1', 'FIB1-HOP-1'],
        ['LAB-FIB-HOP2', 'FIB1-HOP-2'],
        ['LAB-FIB-PREBUNK', 'LAB-FIB-HOP2'],
      ] as const) {
        const gate = await all<{ pred: string }>(
          db,
          `select jsonb_array_elements_text(g.config->'activity_codes') as pred
             from gate_rule g
             join process_activity pa on pa.id = g.process_activity_id
            where pa.code = $1 and g.kind = 'PREDECESSOR'`,
          [check]
        );
        expect(gate.map((g) => g.pred), `${check} is not gated behind ${predecessor}`).toContain(
          predecessor
        );
      }

      // And the bunker load waits on the pre-bunker reading, which is what "before" means.
      const load = await all<{ pred: string }>(
        db,
        `select jsonb_array_elements_text(g.config->'activity_codes') as pred
           from gate_rule g join process_activity pa on pa.id = g.process_activity_id
          where pa.code = 'FIB1-BUNK-LOAD' and g.kind = 'PREDECESSOR'`
      );
      expect(load.map((l) => l.pred)).toContain('LAB-FIB-PREBUNK');

      // ── AND THE STATE, NOT JUST THE CONFIG ────────────────────────────────
      // Reading `gate_rule` proves the rule was seeded. It does not prove the engine honours it. On a
      // freshly activated batch nothing has been hopper-passed, so all three of these must be shut —
      // the hopper-1 check especially, because before this change it had no predecessor at all and
      // opened immediately alongside the pass it is supposed to measure.
      await db.query(`select public.advance_batch($1)`, [batch]);
      const states = await all<{ code: string; state: string; blocked_reason: string | null }>(
        db,
        `select code, state, blocked_reason from batch_activity
          where master_batch_id = $1
            and code in ('LAB-FIB-WET','LAB-FIB-MOISTURE-1','LAB-FIB-HOP2','LAB-FIB-PREBUNK')
          order by seq`,
        [batch]
      );
      const shut = states.filter((s) => s.code !== 'LAB-FIB-WET');
      for (const s of shut) {
        expect(s.state, `${s.code} is open before the work it measures has happened`).toBe('LOCKED');
        expect(s.blocked_reason, `${s.code} is shut without saying why`).not.toBeNull();
      }
      // The wetting check is the one that CAN be open early — it reads the material as delivered, and
      // its only predecessor is the weighment.
      expect(states.find((s) => s.code === 'LAB-FIB-WET')!.state).toBe('LOCKED');
    });
  });

  it('C-33 is CARRIED, not resolved — both maps still stand and the rows say so', async () => {
    await withRollback(async (db) => {
      const c = await one<{ status: string; ship_with_default: string }>(
        db,
        `select status, ship_with_default from conflict_register where conflict_id = 'C-33'`
      );
      expect(c.status, 'selecting a map for the build is not answering which source is authoritative')
        .toBe('open');
      expect(c.ship_with_default).toMatch(/BUILD SELECTION/);
      expect(c.ship_with_default).toMatch(/BOTH maps remain seeded/);

      // Both maps are still there.
      const maps = await all<{ checkpoint_map: string; n: string }>(
        db,
        `select checkpoint_map, count(*)::text as n from lab_checkpoint
          group by checkpoint_map order by checkpoint_map`
      );
      expect(maps.map((m) => m.checkpoint_map)).toEqual(['LAB_DICTATION', 'S4B_COLUMNS']);

      // And every activity added under the selection carries the marker, so validate_batch reports
      // the open question at the point of use.
      const batch = await createActiveBatch(db);
      const info = await all<{ code: string }>(
        db,
        `select code from validate_batch($1) where severity = 'info'`,
        [batch]
      );
      expect(info.map((i) => i.code), 'the plan must surface C-33').toContain('C-33');
    });
  });

  it('decision 4 · the water/dry choice reads a lab result and NO hard-coded threshold', async () => {
    await withRollback(async (db) => {
      const variants = await all<{
        code: string;
        auto: boolean;
        needs_reason: boolean;
        conflict_id: string | null;
        bands: unknown;
      }>(
        db,
        `select v.code, v.auto_select_enabled as auto, v.requires_reason_on_override as needs_reason,
                v.conflict_id, v.selection_rule->'candidate_bands' as bands
           from activity_variant v
           join process_activity pa on pa.id = v.process_activity_id
          where pa.code = 'FIB1-HOP-2' order by v.code`
      );
      expect(variants.map((v) => v.code)).toEqual(['DRY', 'WATER']);
      for (const v of variants) {
        // FROZEN DECISION 1 — auto-selection stays OFF while C-01/C-29 are open.
        expect(v.auto, 'auto-selection would be a hard-coded threshold').toBe(false);
        expect(v.needs_reason).toBe(true);
        expect(v.conflict_id).toBe('C-29');
      }
      // BOTH candidate bands are on file, so the screen can show them side by side and judge neither.
      const bands = variants.find((v) => v.code === 'WATER')!.bands as { min: number; max: number }[];
      expect(bands.length, 'both disputed bands must be carried').toBe(2);

      // And the reason is a mandatory field, not a convention.
      const field = await one<{ operator_input: string; conflict_id: string }>(
        db,
        `select af.operator_input, af.conflict_id from activity_field af
           join process_activity pa on pa.id = af.process_activity_id
          where pa.code = 'FIB1-HOP-2' and af.key = 'variant_reason'`
      );
      expect(field.operator_input).toBe('required');
      expect(field.conflict_id).toBe('C-29');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describeDb('Day 0–6 · decision 5 · Day 4 keeps five distinct activities', () => {
  it('unloading, inspection, weighment, hopper pass and reload are five separate rows', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      const named = await all<{ code: string; title: string }>(
        db,
        `select distinct ba.code, ba.title from batch_activity ba
          where ba.master_batch_id = $1 and ba.rel_day = 4
            and ba.code in ('FIB1-UNLOAD','STRAW-INSPECT','STRAW-WEIGH','FIB1-HOP-3',
                            'FIB1-BUNK-RELOAD')
          order by ba.code`,
        [batch]
      );
      expect(
        named.map((n) => n.code),
        'all five of the client-named Day-4 activities must exist'
      ).toEqual([
        'FIB1-BUNK-RELOAD',
        'FIB1-HOP-3',
        'FIB1-UNLOAD',
        'STRAW-INSPECT',
        'STRAW-WEIGH',
      ]);

      // ⚠ RULE 5 IS ABOUT THE DEFINITION, NOT THE INSTANCE, and the first version of this assertion
      // got that wrong: it checked the instantiated TITLE and failed on "Bagasse (new) Reload".
      //
      // That title is correct. `label_template` is `{role_lead} Reload` and the generator fills the
      // role with whatever material this batch bound to it — so the instance names bagasse because
      // bagasse is what is actually in the bunker. The rule forbids a material name in the generic
      // PROCESS DEFINITION, which is why the database enforces it with a CHECK on
      // `process_activity.code`. So that is what is asserted here.
      const templates = await all<{ code: string; label_template: string }>(
        db,
        `select pa.code, pa.label_template from process_activity pa
           join process_definition pd on pd.id = pa.process_definition_id
          where pd.code = 'PROCESS-2026B'
            and pa.code in ('FIB1-UNLOAD','STRAW-INSPECT','STRAW-WEIGH','FIB1-HOP-3',
                            'FIB1-BUNK-RELOAD')
          order by pa.code`
      );
      expect(templates.length).toBe(5);
      for (const t of templates) {
        expect(t.code.toLowerCase(), `${t.code} names a material`).not.toMatch(/paddy|bagasse/);
        expect(
          t.label_template.toLowerCase(),
          `${t.code}'s template names a material instead of a role`
        ).not.toMatch(/paddy|bagasse/);
      }

      // And the instantiated titles DO name the material, which is the point of the template.
      const reload = named.find((n) => n.code === 'FIB1-BUNK-RELOAD')!;
      expect(reload.title, 'the instance should say what is actually being moved').not.toBe(
        'FIB1-BUNK-RELOAD'
      );
    });
  });

  it('the weighment lab check records dry weight with NO band — TBD-45', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      const v = await all<{
        field_key: string;
        sop_min: string | null;
        sop_max: string | null;
        conflict_id: string | null;
      }>(
        db,
        `select v.field_key, v.sop_min, v.sop_max, v.conflict_id
           from batch_activity_value v
           join batch_activity ba on ba.id = v.batch_activity_id
          where ba.master_batch_id = $1 and ba.code = 'LAB-STRAW-WEIGH'
          order by v.field_key`,
        [batch]
      );
      expect(v.map((x) => x.field_key)).toEqual(['dry_weight', 'moisture_pct']);
      const dry = v.find((x) => x.field_key === 'dry_weight')!;
      expect(dry.sop_min, 'no source gives a dry-weight band').toBeNull();
      expect(dry.sop_max).toBeNull();
      expect(dry.conflict_id).toBe('TBD-45');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describeDb('Day 0–6 · decision 1 · the straw bunker rest stays required, with no default', () => {
  it('the process definition states NO duration for it, and 12 h was not seeded', async () => {
    await withRollback(async (db) => {
      const pa = await one<{
        dmin: string | null;
        dmax: string | null;
        required: boolean;
        tbd_marker: string;
      }>(
        db,
        `select pa.duration_target_min_hr as dmin, pa.duration_target_max_hr as dmax,
                pa.duration_required_at_day0 as required, pa.tbd_marker
           from process_activity pa
           join process_definition pd on pd.id = pa.process_definition_id
          where pd.code = 'PROCESS-2026B' and pa.code = 'STRAW-REST-1'`
      );
      expect(pa.dmin, 'a stated duration here would be answering TBD-24').toBeNull();
      expect(pa.dmax).toBeNull();
      expect(pa.required, 'the admin must answer it before activation').toBe(true);
      expect(pa.tbd_marker).toBe('TBD-24');

      // TBD-24 offers 2 h OR 12 h and the register has not chosen.
      const c = await one<{ question: string; status: string }>(
        db,
        `select question, status from conflict_register where conflict_id = 'TBD-24'`
      );
      expect(c.status).toBe('open');
      expect(c.question).toMatch(/2 h or 12 h/);
    });
  });

  it('a batch whose straw rest has no answer CANNOT be activated', async () => {
    await withRollback(async (db) => {
      // Every rest answered EXCEPT this one, so the finding is unambiguous.
      const gates = await all<{ code: string }>(
        db,
        `select pa.code from process_activity pa
           join process_definition pd on pd.id = pa.process_definition_id
          where pd.code = 'PROCESS-2026B' and pa.is_time_gate`
      );
      const config: Record<string, number> = {
        primary_fibre_required_mt: 21,
        expected_load_capacity_mt: 2,
        bunker_line_count: 3,
        yard_pile_count: 2,
        mixed_pile_count: 1,
        straw_pile_count: 2,
        straw_bunker_count: 1,
        turner_pile_count: 3,
        tunnel_count: 3,
      };
      for (const g of gates) if (g.code !== 'STRAW-REST-1') config[`rest_hr_${g.code}`] = 0;

      const roles = await all<{ role: string; code: string }>(
        db,
        `select mre.role::text as role, m.code from material_role_eligibility mre
           join material m on m.id = mre.material_id where mre.is_default_lead`
      );
      const batch = await one<{ id: string }>(
        db,
        `select public.create_master_batch($1,$2,$3,$4,$5,$6,$7,$8) as id`,
        [
          'TEST-NOREST',
          'TEST-NOREST',
          '2026-09-20',
          JSON.stringify(config),
          JSON.stringify(roles.map((r) => ({ role: r.role, material_code: r.code, lead: true }))),
          'Ramarao',
          'Clear',
          null,
        ]
      );

      const finding = await all<{ code: string; message: string }>(
        db,
        `select code, message from validate_batch($1) where code = 'REST_NO_DURATION'`,
        [batch.id]
      );
      expect(finding.length, 'the unanswered rest must block').toBeGreaterThan(0);
      expect(finding.some((f) => f.message.includes('Rest'))).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describeDb('Day 0–6 · THE WALK · PRE-BATCH → H0 → … → DAY 6 SOAK 2', () => {
  it(
    'the engine produces the whole chain, and the order it emerges in respects every dependency',
    async () => {
      await withRollback(async (db) => {
        // H0 well in the past, so a backdated actual still lands after it.
        const batch = await createActiveBatch(db, { startDate: startDateDaysBack(20) });

        // PRE-BATCH is on the record for this very batch, before its own H0.
        const pre = await one<{ before_h0: boolean; accepted: number }>(
          db,
          `select before_h0, accepted from v_prebatch_material_check where master_batch_id = $1`,
          [batch]
        );
        expect(pre.before_h0).toBe(true);
        expect(pre.accepted).toBeGreaterThan(0);

        const done = await walkForward(db, batch, SLICE_LAST_DAY);
        const codes = done.map((d) => d.code);

        // ── Everything in the slice actually ran ────────────────────────────────
        const outstanding = await all<{ code: string; scope_label: string; state: string }>(
          db,
          `select code, scope_label, state from batch_activity
            where master_batch_id = $1 and rel_day <= $2
              and state <> 'COMPLETED'
            order by seq, instance_no`,
          [batch, SLICE_LAST_DAY]
        );
        expect(
          outstanding.map((o) => `${o.code} ${o.scope_label}: ${o.state}`),
          'every Day 0–6 activity should have completed'
        ).toEqual([]);

        // ── THE REST STEP · opened by the SERVER clock, not by anyone saying so ──
        //
        // A rest is not in `done`, because nobody submits one. The proof it was passed properly is
        // that the engine wrote `unblocks_at` and then completed it on its own reading of `now()`.
        const rests = await all<{
          code: string;
          state: string;
          unblocks_at: string | null;
          day0_duration_hr: string | null;
        }>(
          db,
          `select code, state, unblocks_at, day0_duration_hr from batch_activity
            where master_batch_id = $1 and rel_day <= $2 and is_time_gate
            order by seq, instance_no`,
          [batch, SLICE_LAST_DAY]
        );
        expect(rests.length, 'Day 0–6 contains rests, so they must appear').toBeGreaterThan(0);
        for (const r of rests) {
          expect(r.state, `${r.code} did not clear its time gate`).toBe('COMPLETED');
          expect(
            r.unblocks_at,
            `${r.code} completed without the server ever setting an unblock time`
          ).not.toBeNull();
          // The duration came from the Day-0 answer. It is never null on an activatable batch —
          // REST_NO_DURATION blocks that — which is decision 1 holding at run time.
          expect(r.day0_duration_hr, `${r.code} has no Day-0 duration`).not.toBeNull();
        }
        // Both named rests are in there: the Day 2–3 fibre rest and the straw bunker rest.
        expect(rests.map((r) => r.code)).toContain('FIB1-REST-1');
        expect(rests.map((r) => r.code)).toContain('STRAW-REST-1');

        // ── The chain the client named, asserted as ORDER, not as a script ──────
        const before = (a: string, b: string) => {
          const ia = lastAt(done, a);
          const ib = firstAt(done, b);
          expect(ia, `${a} never completed`).toBeGreaterThanOrEqual(0);
          expect(ib, `${b} never completed`).toBeGreaterThanOrEqual(0);
          expect(ia, `${a} must complete before ${b} starts`).toBeLessThan(ib);
        };

        // WEIGHMENT → DAY 1 WETTING → HOPPER 1 → LAB → HOPPER 2 → LAB → BUNKER
        before('FIB1-WEIGH', 'FIB1-HOP-1');
        before('FIB1-HOP-1', 'LAB-FIB-MOISTURE-1');
        before('LAB-FIB-MOISTURE-1', 'FIB1-HOP-2');
        before('FIB1-HOP-2', 'LAB-FIB-HOP2');
        before('LAB-FIB-HOP2', 'LAB-FIB-PREBUNK');
        before('LAB-FIB-PREBUNK', 'FIB1-BUNK-LOAD');
        // REST → DAY 4 UNLOAD. The rest is a time gate, so it is not in `done` at all — the proof
        // that it held is that the unload came after the load it rested between.
        before('FIB1-BUNK-LOAD', 'FIB1-UNLOAD');
        // DAY 4 · PADDY INSPECTION → PADDY WEIGHMENT → HOPPER → RELOAD
        before('STRAW-RECEIPT', 'STRAW-INSPECT');
        before('STRAW-INSPECT', 'STRAW-WEIGH');
        before('STRAW-WEIGH', 'LAB-STRAW-WEIGH');
        before('FIB1-UNLOAD', 'FIB1-HOP-3');
        before('FIB1-HOP-3', 'FIB1-BUNK-RELOAD');
        // DAY 5 SOAK 1 → LAB → BUNKER REST → DAY 6 SOAK 2
        before('STRAW-SOAK-1', 'STRAW-BUNK-STORE');
        before('STRAW-SOAK-1', 'STRAW-SOAK-2');

        // The four Day-1 checks each completed exactly once, independently.
        for (const c of ['LAB-FIB-WET', 'LAB-FIB-MOISTURE-1', 'LAB-FIB-HOP2', 'LAB-FIB-PREBUNK']) {
          expect(codes.filter((x) => x === c).length, `${c} should complete once`).toBe(1);
        }

        // The weighment ran per LOAD, and the count was DERIVED, never typed.
        const loads = done.filter((d) => d.code === 'FIB1-WEIGH');
        expect(loads.length, 'weighment is one activity per load').toBeGreaterThan(1);
        const expected = await one<{ n: number }>(
          db,
          `select ceil((mb.config->>'primary_fibre_required_mt')::numeric
                     / (mb.config->>'expected_load_capacity_mt')::numeric)::int as n
             from master_batch mb where mb.id = $1`,
          [batch]
        );
        expect(loads.length, 'the load count must equal quantity / capacity').toBe(expected.n);

        // Every state in the walk was produced by the engine. Nothing was set by hand.
        const engineOnly = await one<{ n: string }>(
          db,
          `select count(*)::text as n from batch_activity
            where master_batch_id = $1 and rel_day <= $2 and not is_time_gate
              and state = 'COMPLETED' and (actual_start is null or actual_end is null)`,
          [batch, SLICE_LAST_DAY]
        );
        expect(engineOnly.n, 'a COMPLETED activity with no timestamps is not a real completion').toBe(
          '0'
        );
      });
    },
    240_000
  );

  it('decision 7 · actual duration is DERIVED from the two server timestamps, never entered', async () => {
    await withRollback(async (db) => {
      const gen = await one<{ is_generated: string }>(
        db,
        `select is_generated from information_schema.columns
          where table_schema='public' and table_name='batch_activity'
            and column_name='duration_actual_min'`
      );
      expect(gen.is_generated, 'a typed-in duration is not an actual').toBe('ALWAYS');

      const batch = await createActiveBatch(db, { startDate: startDateDaysBack(20) });
      const act = await one<{ id: string }>(
        db,
        `select id from batch_activity where master_batch_id = $1 and code = 'FIB1-WEIGH'
          order by instance_no limit 1`,
        [batch]
      );
      await db.query(`select public.start_activity($1)`, [act.id]);
      await satisfyEvidence(db, act.id);

      // A backdated pair three hours apart — the paper-slip case PROCESS_V2 §2 describes.
      const values = await inRangeValues(db, act.id);
      await db.query(
        `select public.submit_activity($1, $2::jsonb, null,
                  now() - interval '5 hours', now() - interval '2 hours')`,
        [act.id, JSON.stringify(values)]
      );

      const r = await one<{ duration_actual_min: number; recorded_at: string; start: string }>(
        db,
        `select duration_actual_min, actual_recorded_at as recorded_at, actual_start as start
           from batch_activity where id = $1`,
        [act.id]
      );
      // finish - start, in minutes. Nobody supplied 180.
      expect(r.duration_actual_min).toBe(180);
      // And the ENTRY time is kept separately, so the trail distinguishes when work happened from
      // when it was typed.
      expect(Date.parse(r.recorded_at)).toBeGreaterThan(Date.parse(r.start));

      const why = await refuses(
        db,
        `update batch_activity set duration_actual_min = 5 where id = $1`,
        [act.id]
      );
      expect(why).toMatch(/can only be updated to DEFAULT/i);
    });
  });

  it('decision 8 · before/after evidence gates submission, and unloading permits video', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);

      // The unload takes video as well as a photo. `{photo,video}` PERMITS video; min_count is 1, so
      // either kind satisfies it and a bad connection is not a blocker.
      const unload = await all<{ key: string; media_kinds: string[]; gates: boolean }>(
        db,
        `select distinct r.key, r.media_kinds, r.gates_submission as gates
           from batch_activity_evidence_req r
           join batch_activity ba on ba.id = r.batch_activity_id
          where ba.master_batch_id = $1 and ba.code = 'FIB1-UNLOAD'
          order by r.key`,
        [batch]
      );
      expect(unload.map((u) => u.key)).toEqual(['after', 'before']);
      for (const u of unload) {
        expect(u.media_kinds.slice().sort()).toEqual(['photo', 'video']);
        expect(u.gates).toBe(true);
      }

      // The new Day-4 activities each carry proof, named for what it shows.
      for (const [code, key] of [
        ['STRAW-RECEIPT', 'delivery'],
        ['STRAW-INSPECT', 'condition'],
        ['STRAW-WEIGH', 'slip'],
      ] as const) {
        const req = await all<{ key: string }>(
          db,
          `select distinct r.key from batch_activity_evidence_req r
             join batch_activity ba on ba.id = r.batch_activity_id
            where ba.master_batch_id = $1 and ba.code = $2`,
          [batch, code]
        );
        expect(req.map((x) => x.key), `${code} has no evidence requirement`).toEqual([key]);
      }

      // AND IT ACTUALLY GATES. Submitting with nothing attached is refused and names what is missing.
      const act = await one<{ id: string }>(
        db,
        `select ba.id from batch_activity ba
          where ba.master_batch_id = $1 and ba.code = 'STRAW-RECEIPT' limit 1`,
        [batch]
      );
      await db.query(`update batch_activity set state = 'READY' where id = $1`, [act.id]);
      const r = await one<{ new_state: string; outstanding_evidence: string | null }>(
        db,
        `select new_state, outstanding_evidence from public.submit_activity($1, '{}'::jsonb)`,
        [act.id]
      );
      expect(r.new_state, 'evidence must hold the submission').not.toBe('COMPLETED');
      expect(r.outstanding_evidence).toMatch(/delivery|Photo of the delivery/i);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describeHttp('Day 0–6 · decision 9 · five viewpoints, one truth', () => {
  it(
    'admin, operator, lab, supervisor and GM read the SAME state, timestamps and evidence',
    async () => {
      // One backend, one auth, one set of rows. The claim is not "they each have a screen" but
      // "there is only one record and all five are reading it".
      const sessions = {
        adminWeb: await signIn(ACCOUNTS.admin),
        operatorMobile: await signIn(ACCOUNTS.operator),
        labMobile: await signIn(ACCOUNTS.lab),
        managementWeb: await signIn(ACCOUNTS.gm),
        managementMobile: await signIn(ACCOUNTS.supervisor),
      };

      // A real Day 0–6 activity on a staged batch, chosen once.
      const probe = await rest<
        { id: string; code: string; state: string; actual_start: string | null }[]
      >(
        sessions.adminWeb,
        'batch_activity?select=id,code,state,actual_start,master_batch!inner(code)' +
          '&master_batch.code=eq.MB-DEMO-LATE&rel_day=lte.6&order=seq&limit=1'
      );
      expect(probe.ok, `admin could not read the plan: ${JSON.stringify(probe.body)}`).toBe(true);
      expect(probe.body.length, 'no Day 0–6 activity to compare across roles').toBe(1);
      const target = probe.body[0];

      const seen: Record<string, { state: string; actual_start: string | null }> = {};
      for (const [viewpoint, session] of Object.entries(sessions)) {
        const r = await rest<{ state: string; actual_start: string | null }[]>(
          session,
          `batch_activity?select=state,actual_start&id=eq.${target.id}`
        );
        expect(r.ok, `${viewpoint} could not read the activity: ${JSON.stringify(r.body)}`).toBe(true);
        expect(r.body.length, `${viewpoint} cannot see the activity at all`).toBe(1);
        seen[viewpoint] = r.body[0];
      }

      // Same state, same timestamp, from every viewpoint. Not "equivalent" — identical.
      const states = new Set(Object.values(seen).map((s) => s.state));
      expect(states.size, `the five viewpoints disagree about state: ${JSON.stringify(seen)}`).toBe(1);
      const starts = new Set(Object.values(seen).map((s) => String(s.actual_start)));
      expect(starts.size, `the five viewpoints disagree about the timestamp`).toBe(1);
    },
    120_000
  );

  it('the process definition is one shared record, not a per-client copy', async () => {
    const admin = await signIn(ACCOUNTS.admin);
    const operator = await signIn(ACCOUNTS.operator);
    const lab = await signIn(ACCOUNTS.lab);

    const day1 = (s: Awaited<ReturnType<typeof signIn>>) =>
      rest<{ code: string }[]>(
        s,
        'process_activity?select=code,rel_day,process_definition!inner(code)' +
          '&process_definition.code=eq.PROCESS-2026B&rel_day=eq.1&order=seq'
      );

    const [a, o, l] = await Promise.all([day1(admin), day1(operator), day1(lab)]);
    for (const [who, r] of [
      ['admin', a],
      ['operator', o],
      ['lab', l],
    ] as const) {
      expect(r.ok, `${who} could not read the process definition`).toBe(true);
    }
    const codes = (r: typeof a) => r.body.map((x) => x.code).join(',');
    expect(codes(o), 'the operator sees a different Day 1 from the admin').toBe(codes(a));
    expect(codes(l), 'the lab sees a different Day 1 from the admin').toBe(codes(a));
    // And it is the four-checkpoint Day 1 the client asked for.
    expect(codes(a)).toContain('LAB-FIB-WET');
    expect(codes(a)).toContain('LAB-FIB-PREBUNK');
  }, 120_000);

  it('the pre-batch material check is readable by management, not just by the lab', async () => {
    const gm = await signIn(ACCOUNTS.gm);
    const lab = await signIn(ACCOUNTS.lab);
    for (const [who, s] of [
      ['gm', gm],
      ['lab', lab],
    ] as const) {
      const r = await rest<unknown[]>(s, 'v_prebatch_material_check?select=batch_code,before_h0');
      expect(r.ok, `${who} cannot read the incoming-material check: ${JSON.stringify(r.body)}`).toBe(
        true
      );
    }
  }, 60_000);

  it('an operator still cannot do a supervisor’s job — one backend does not mean one authority', async () => {
    const operator = await signIn(ACCOUNTS.operator);
    // Decision 9 says the five surfaces share a backend. It does NOT say they share authority, and
    // the write boundary is what keeps "same truth" from becoming "same permissions".
    const r = await rpc(operator, 'accept_lab_result', {
      p_result: '00000000-0000-0000-0000-000000000000',
      p_reason: 'trying it on',
    });
    expect(r.ok, 'an operator was allowed to accept a lab result').toBe(false);
    expect(JSON.stringify(r.body)).toMatch(/may not accept|No such lab result/);
  }, 60_000);
});
