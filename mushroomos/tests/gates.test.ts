/**
 * B1 — evaluate_gates.
 *
 * THE PROOF THIS FILE EXISTS FOR is `DEMO_PLAN_V2` criterion 15, which is also the one thing
 * `STEP_1_2_BUILD_SPEC §2.6` says a wrong build fails on:
 *
 *     three piles · T1 completed OUT OF ORDER (pile 2 first)
 *     → pile 2's T2 becomes READY while piles 1 and 3 are still in T1
 *
 * The old engine could not express that. It opened work when every activity on every EARLIER
 * `rel_day` was complete, which is a global barrier: pile 2's T2 waited on piles 1 and 3 as well.
 * The test below fails against that engine and passes against this one, which is the only reason
 * it is worth writing.
 *
 * Every test runs in a transaction that is ROLLED BACK, and answers TBD-50 with `UTC` inside that
 * transaction only, because a batch cannot be activated without an H0 and H0 needs a zone (A2 §4).
 */

import { describe, expect, it } from 'vitest';

import {
  DB_URL,
  NO_DB_REASON,
  all,
  createActiveBatch,
  createDraftBatch,
  one,
  satisfyEvidence,
  withRollback,
  type Db,
} from './db';

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

type Activity = {
  id: string;
  code: string;
  title: string;
  instance_no: number;
  scope_label: string;
  state: string;
  blocked_reason: string | null;
  seq: number;
};

/**
 * Drive an activity to COMPLETED the way an operator would: satisfy its evidence, then submit.
 *
 * `satisfyEvidence` lives in `tests/db.ts` — `tests/recordedActuals.test.ts` needs the same thing,
 * and two copies of "what counts as satisfied evidence" is exactly the duplication A4 removed from
 * the server. Its reasoning, including why it writes the rows rather than calling `bind_evidence`,
 * is documented there. This file is about gate ordering.
 */
async function completeAsOperator(db: Db, activityId: string): Promise<void> {
  await satisfyEvidence(db, activityId);
  await db.query(`select * from public.submit_activity($1, '{}'::jsonb, 'proof run')`, [activityId]);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Everything upstream of `code` finished, so `code` itself is the thing under test.
 *
 * Driven server-side in one round trip. Each activity would otherwise cost several, and with ~70
 * of them the proof would be measuring the latency to another region rather than the engine. It
 * still goes through the real RPCs — `submit_activity`, `advance_batch` — and touches no state
 * directly except the rest clock and the evidence pair, for the reasons given above and below.
 *
 * THE REST CLOCK. Postgres freezes `now()` for the whole transaction, and these proofs run inside
 * one. A rest window can therefore never elapse on its own here, however short it is set. The
 * driver pushes `unblocks_at` into the past, which is exactly what the passage of time would do,
 * and it is the only state this helper writes.
 */
async function completeEverythingBefore(db: Db, batch: string, code: string): Promise<void> {
  // The batch id comes from our own insert, but it is being interpolated into a DO block (which
  // takes no parameters), so it is checked rather than trusted.
  if (!UUID.test(batch)) throw new Error(`not a uuid: ${batch}`);

  await db.query(`
    do $drive$
    declare
      v_batch  uuid := '${batch}';
      v_target int;
      v_row    record;
      v_req    record;
      v_guard  int := 0;
    begin
      select min(seq) into v_target from batch_activity
       where master_batch_id = v_batch and code = ${literal(code)};
      if v_target is null then
        raise exception 'no activity with code % in this batch', ${literal(code)};
      end if;

      loop
        v_guard := v_guard + 1;
        if v_guard > 500 then
          raise exception 'driver did not converge — % still open',
            (select count(*) from batch_activity
              where master_batch_id = v_batch and seq < v_target
                and state not in ('COMPLETED','SKIPPED'));
        end if;

        perform public.advance_batch(v_batch);

        -- A rest whose window would have elapsed by now. now() is frozen in this transaction.
        update batch_activity set unblocks_at = now() - interval '1 second'
         where master_batch_id = v_batch and seq < v_target
           and state = 'WAITING_TIME' and unblocks_at is not null and unblocks_at > now();

        perform public.advance_batch(v_batch);

        select ba.id into v_row from batch_activity ba
         where ba.master_batch_id = v_batch and ba.seq < v_target
           and ba.state in ('READY','IN_PROGRESS','RETURNED')
         order by ba.seq, ba.instance_no
         limit 1;

        exit when not found;

        -- Evidence, the A4 way: an object in storage, then a row bound to it. The trigger on
        -- evidence_media recounts satisfied_count, so the gate sees real files rather than a
        -- counter somebody incremented.
        for v_req in
          select r.id as req_id, r.key,
                 ba.master_batch_id || '/' || ba.id || '/' || gen_random_uuid()::text || '.jpg' as path,
                 coalesce(ba.assigned_person_id,
                          (select id from profiles where role = 'operator' and is_active limit 1)) as uploader
            from batch_activity_evidence_req r
            join batch_activity ba on ba.id = r.batch_activity_id
           where r.batch_activity_id = v_row.id
             and r.gates_submission and r.satisfied_count < r.min_count
        loop
          insert into storage.objects (bucket_id, name, metadata)
          values ('evidence', v_req.path,
                  jsonb_build_object('size', 4096, 'mimetype', 'image/jpeg'));

          insert into evidence_media (master_batch_id, batch_activity_id, requirement_id,
                                      requirement_key, storage_path, media_kind, uploaded_by)
          select ba.master_batch_id, ba.id, v_req.req_id, v_req.key, v_req.path, 'photo',
                 v_req.uploader
            from batch_activity ba where ba.id = v_row.id;
        end loop;

        perform public.submit_activity(v_row.id, '{}'::jsonb, 'proof run');
      end loop;
    end
    $drive$;
  `);
}

/** Quote a literal for a DO block. Only ever used with codes read from the process definition. */
function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const piles = (rows: Activity[], code: string) =>
  rows.filter((r) => r.code === code).sort((a, b) => a.instance_no - b.instance_no);

async function activities(db: Db, batch: string): Promise<Activity[]> {
  return all<Activity>(
    db,
    `select id, code, title, instance_no, scope_label, state::text as state, blocked_reason, seq
       from batch_activity where master_batch_id = $1 order by seq, instance_no`,
    [batch]
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────

describeDb('the rules are read, not reimplemented', () => {
  it('every seeded gate kind reaches a stated verdict, and every kind is reached', async () => {
    await withRollback(async (db) => {
      const batch = await createDraftBatch(db);

      // One query, both phases, every instance. A per-activity loop would be ~200 round trips.
      const seen = await all<{ kind: string; verdict: string; n: string }>(
        db,
        `select v.kind, v.verdict, count(*)::text as n
           from batch_activity ba
           cross join lateral (
             select * from evaluate_gates(ba.id, 'entry')
             union all
             select * from evaluate_gates(ba.id, 'exit')
           ) v
          where ba.master_batch_id = $1
          group by v.kind, v.verdict
          order by v.kind, v.verdict`,
        [batch]
      );

      for (const r of seen) {
        expect(['pass', 'fail', 'skipped', 'unevaluable'], `${r.kind} → ${r.verdict}`).toContain(
          r.verdict
        );
      }

      // Every kind that is seeded anywhere on this definition must be reachable. A kind that
      // produced no verdict at all would mean the engine never looked at it.
      const seeded = await all<{ kind: string }>(
        db,
        `select distinct g.kind from gate_rule g
           join batch_activity ba on ba.process_activity_id = g.process_activity_id
          where ba.master_batch_id = $1 order by 1`,
        [batch]
      );
      expect(seeded.length).toBeGreaterThan(5);
      const evaluated = new Set(seen.map((r) => r.kind));
      expect([...seeded.map((s) => s.kind)].filter((k) => !evaluated.has(k))).toEqual([]);
    });
  });

  it('a disabled rule decides nothing, and C-28 keeps an inferred limit from auto-failing', async () => {
    await withRollback(async (db) => {
      const batch = await createDraftBatch(db);
      const rows = await all<{
        kind: string;
        verdict: string;
        is_enabled: boolean;
        mapping_confidence: string;
      }>(
        db,
        `select v.kind, v.verdict, v.is_enabled, v.mapping_confidence
           from batch_activity ba
           cross join lateral evaluate_gates(ba.id, 'exit') v
          where ba.master_batch_id = $1`,
        [batch]
      );
      expect(rows.length).toBeGreaterThan(0);

      for (const r of rows) {
        if (!r.is_enabled) expect(r.verdict).toBe('skipped');
        // C-28 · a limit that is not dictated or sop_direct must not auto-fail anything.
        if (
          ['FIELD_IN_RANGE', 'SENSOR_THRESHOLD'].includes(r.kind) &&
          !['dictated', 'sop_direct'].includes(r.mapping_confidence)
        ) {
          expect(r.verdict).not.toBe('fail');
        }
      }
    });
  });

  it('every reason a gate produces is fully rendered — no placeholder reaches an operator', async () => {
    await withRollback(async (db) => {
      const batch = await createDraftBatch(db);
      const reasons = await all<{ reason: string }>(
        db,
        `select v.reason from batch_activity ba
           cross join lateral evaluate_gates(ba.id, 'entry') v
          where ba.master_batch_id = $1 and v.reason is not null`,
        [batch]
      );
      expect(reasons.length).toBeGreaterThan(0);
      for (const r of reasons) {
        expect(r.reason, r.reason).not.toMatch(/[{}]/);
        expect(r.reason.trim().length).toBeGreaterThan(0);
      }
    });
  });
});

describeDb('the rel_day barrier is gone', () => {
  it('no function reads rel_day to decide state', async () => {
    await withRollback(async (db) => {
      const offenders = await all<{ proname: string }>(
        db,
        `select p.proname
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('advance_batch','activate_batch','submit_activity',
                              'evaluate_gates','release_elapsed_rests')
            and p.prosrc ~ 'rel_day'
          order by 1`
      );
      expect(offenders.map((o) => o.proname)).toEqual([]);
    });
  });

  it('only the enumerated functions write batch_activity.state', async () => {
    // B1's second exit proof. The list is exhaustive and each entry states why it is allowed; a
    // sixth writer appearing makes this fail, which is the point.
    const SANCTIONED: Record<string, string> = {
      advance_batch: 'the only gate-driven writer — it calls evaluate_gates and nothing else decides',
      generate_activity_plan: 'the initial insert, entirely LOCKED. Not a transition',
      start_activity: 'an actor transition: a person opens READY/RETURNED work',
      submit_activity: 'an actor transition: a person submits. Delegates the unlock to advance_batch',
      repair_plan_states: 'the idempotent repair tool from 0010, which then re-derives via advance_batch',
      cancel_batch:
        'an actor transition: a person stops the batch, with a mandatory reason. Terminal, so no ' +
        'gate can follow it, and it deliberately leaves COMPLETED and SKIPPED rows untouched — ' +
        'cancelling must not rewrite what actually happened. Added at A3 (0013)',
      release_activity:
        'an actor transition: a supervisor RELEASES, which is a verdict and not a gate. It is ' +
        'refused while any deviation still awaits one, then delegates the unlock to ' +
        'advance_batch. ROLE_AND_APPROVAL_MODEL §3.1. Added at B2 (0017)',
      hold_activity:
        'an actor transition: a supervisor HOLDS with a mandatory reason. No gate can move it ' +
        'back — only another verdict can. §3.1. Added at B2 (0017)',
      return_activity:
        'an actor transition: a supervisor RETURNS to the operator queue with what to redo. ' +
        '§3.1. Added at B2 (0017)',
    };

    await withRollback(async (db) => {
      // Matches an assignment to the `state` COLUMN, or an insert into batch_activity whose column
      // list names it. `\y` is a word boundary, so `after_state` in an audit payload does not
      // count — that is a JSON key, not a state write.
      // `[^;]*` cannot cross a statement boundary, so this matches an UPDATE whose own SET list
      // assigns `state` — not `where ba.state = 'READY'`, which is a comparison, and not
      // `after_state` in an audit payload, which `\y` excludes because `_` is a word character.
      const writers = await all<{ proname: string }>(
        db,
        `select distinct p.proname
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.prosrc ~* 'batch_activity'
            and (p.prosrc ~* 'update[^;]*\\yset\\y[^;]*\\ystate\\y[[:space:]]*='
              or p.prosrc ~* 'insert[[:space:]]+into[[:space:]]+(public\\.)?batch_activity[^;]*\\ystate\\y')
          order by 1`
      );
      const unexpected = writers.map((w) => w.proname).filter((n) => !(n in SANCTIONED));
      expect(
        unexpected,
        'A new writer of batch_activity.state appeared. Either route it through advance_batch, ' +
          'or add it to SANCTIONED with the reason it is an actor transition rather than a gate.'
      ).toEqual([]);
      // And evaluate_gates itself must stay pure.
      expect(writers.map((w) => w.proname)).not.toContain('evaluate_gates');
    });
  });

  it('evaluate_gates is declared STABLE, so it cannot write', async () => {
    await withRollback(async (db) => {
      const row = await one<{ volatility: string }>(
        db,
        `select p.provolatile as volatility from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'evaluate_gates'`
      );
      // 's' = stable, 'i' = immutable, 'v' = volatile.
      expect(['s', 'i']).toContain(row.volatility);
    });
  });
});

describeDb('SAME_SCOPE_INSTANCE — criterion 15, the T1 to T2 rule', () => {
  it('pile 2 T2 goes READY on pile 2 T1 alone, with piles 1 and 3 still in T1', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);

      // Three piles at the turner, from the Day-0 answer, never a constant.
      const config = await one<{ turner_pile_count: string }>(
        db,
        `select config->>'turner_pile_count' as turner_pile_count from master_batch where id = $1`,
        [batch]
      );
      const pileCount = Number(config.turner_pile_count);
      expect(pileCount).toBeGreaterThanOrEqual(3);

      await completeEverythingBefore(db, batch, 'TR-T1');

      let rows = await activities(db, batch);
      const t1 = piles(rows, 'TR-T1');
      const t2 = piles(rows, 'TR-T2');
      expect(t1.length).toBe(pileCount);
      expect(t2.length).toBe(pileCount);

      // WHY THIS TEST DISCRIMINATES. T1 and T2 sit on the SAME rel_day, so the old barrier —
      // "open when every activity on every earlier rel_day is complete" — could not tell them
      // apart: it would have opened all three T2s at the same moment as the T1s, before a single
      // pile had been turned. The assertions below therefore fail against that engine and pass
      // against this one, which is the only thing that makes them worth writing.
      const relDays = await all<{ code: string; rel_day: number }>(
        db,
        `select distinct code, rel_day from batch_activity
          where master_batch_id = $1 and code in ('TR-T1','TR-T2') order by code`,
        [batch]
      );
      expect(relDays.length).toBe(2);
      expect(relDays[0].rel_day).toBe(relDays[1].rel_day);

      // Every T1 open, every T2 shut and saying it waits on ITS OWN pile.
      for (const a of t1) expect(['READY', 'IN_PROGRESS'], a.scope_label).toContain(a.state);
      for (const a of t2) {
        expect(a.state, a.scope_label).toBe('LOCKED');
        expect(a.blocked_reason, a.scope_label).toMatch(/T1 not complete/);
        expect(a.blocked_reason, a.scope_label).toContain(a.scope_label);
      }

      // ── OUT OF ORDER. Pile 2 first, which the day barrier could not express. ──
      const pile2 = t1.find((a) => a.instance_no === 2)!;
      await completeAsOperator(db, pile2.id);

      rows = await activities(db, batch);
      const t1After = piles(rows, 'TR-T1');
      const t2After = piles(rows, 'TR-T2');

      // Pile 2's T1 is done and pile 2's T2 is now available.
      expect(t1After.find((a) => a.instance_no === 2)!.state).toBe('COMPLETED');
      expect(
        t2After.find((a) => a.instance_no === 2)!.state,
        "pile 2's T2 must open on pile 2's T1 alone"
      ).toBe('READY');

      // Piles 1 and 3 are untouched, and their T2s are still shut for their own reason.
      for (const n of [1, 3]) {
        expect(t1After.find((a) => a.instance_no === n)!.state, `pile ${n} T1`).toBe('READY');
        const other = t2After.find((a) => a.instance_no === n)!;
        expect(other.state, `pile ${n} T2`).toBe('LOCKED');
        expect(other.blocked_reason, `pile ${n} T2`).toMatch(/T1 not complete/);
      }
    });
  });

  it('an ALL_INSTANCES gate downstream of the piles waits for every pile', async () => {
    await withRollback(async (db) => {
      const batch = await createActiveBatch(db);
      await completeEverythingBefore(db, batch, 'TR-T1');

      // P1-BUNK-LOAD's entry rule is PREDECESSOR TR-T2 with ALL_INSTANCES — pooling needs them all.
      // This is the counterpart to the test above: the two bindings must behave differently.
      const t1 = piles(await activities(db, batch), 'TR-T1');
      await completeAsOperator(db, t1.find((a) => a.instance_no === 2)!.id);

      const t2 = piles(await activities(db, batch), 'TR-T2');
      await completeAsOperator(db, t2.find((a) => a.instance_no === 2)!.id);

      const bunker = piles(await activities(db, batch), 'P1-BUNK-LOAD');
      expect(bunker.length).toBeGreaterThan(0);
      for (const b of bunker) {
        expect(b.state, b.scope_label).toBe('LOCKED');
        expect(b.blocked_reason, b.scope_label).toMatch(/T2 not complete on all piles/);
      }
    });
  });

  it('every SAME_SCOPE_INSTANCE rule pairs activities of equal cardinality', async () => {
    // A SAME_SCOPE rule whose predecessor produces a different number of instances would silently
    // match nothing for the surplus instances, and an empty predecessor set is satisfied — so the
    // gate would open work it should hold. There is no such pair today; this keeps it that way.
    await withRollback(async (db) => {
      const batch = await createDraftBatch(db);
      const mismatched = await all<{ code: string; pred: string; n: string; pred_n: string }>(
        db,
        `with rules as (
           select pa.code,
                  jsonb_array_elements_text(g.config->'activity_codes') as pred
             from gate_rule g
             join process_activity pa on pa.id = g.process_activity_id
            where g.kind = 'PREDECESSOR' and g.predecessor_binding = 'SAME_SCOPE_INSTANCE'
         )
         select r.code, r.pred,
                (select count(*)::text from batch_activity b
                  where b.master_batch_id = $1 and b.code = r.code) as n,
                (select count(*)::text from batch_activity b
                  where b.master_batch_id = $1 and b.code = r.pred) as pred_n
           from rules r
          where (select count(*) from batch_activity b
                  where b.master_batch_id = $1 and b.code = r.code) > 0
            and (select count(*) from batch_activity b
                  where b.master_batch_id = $1 and b.code = r.pred) > 0
            and (select count(*) from batch_activity b
                  where b.master_batch_id = $1 and b.code = r.code)
              <> (select count(*) from batch_activity b
                   where b.master_batch_id = $1 and b.code = r.pred)`,
        [batch]
      );
      expect(mismatched).toEqual([]);
    });
  });
});

describeDb('the two kinds outside B1s six families', () => {
  /**
   * REWRITTEN BY A5, NOT DELETED. This test used to end by asserting `machine_usage` did NOT exist —
   * B1's honest record that the predicate was passing vacuously and would start biting when A5
   * landed. A5 landed, so the switch has flipped, and the assertion that recorded the old world
   * became the one red test in the suite. Deleting it would have thrown away the claim; what it
   * asserts now is the other side of the same claim.
   *
   * `tests/resources.test.ts` proves the open → fail → closed → pass transition. What this suite
   * uniquely knows is that the predicate is SCOPED TO ONE ACTIVITY — `mu.batch_activity_id = ba.id`
   * — so one machine left running does not hold the other 38 rules' activities. A predicate that
   * read the table without the scope would pass the transition proof and fail this one.
   */
  it('MACHINE_STINT_CLOSED is live now A5 landed, and holds only the activity with the open stint', async () => {
    await withRollback(async (db) => {
      const batch = await createDraftBatch(db);

      // The switch that flipped. `evaluate_gates` checks for this table before running the predicate,
      // so its existence is what makes the 38 enabled `dictated` rules real.
      const exists = await one<{ present: boolean }>(
        db,
        `select exists (select 1 from information_schema.tables
                         where table_schema='public' and table_name='machine_usage') as present`
      );
      expect(exists.present, 'A5 built machine_usage, so the predicate is no longer vacuous').toBe(
        true
      );

      const before = await all<{ id: string; verdict: string }>(
        db,
        `select ba.id, v.verdict from batch_activity ba
           cross join lateral evaluate_gates(ba.id, 'exit') v
          where ba.master_batch_id = $1 and v.kind = 'MACHINE_STINT_CLOSED'
          order by ba.seq`,
        [batch]
      );
      expect(before.length, 'the rules are seeded and reached').toBeGreaterThan(1);
      // No stint recorded is not the same as a machine left running. Nothing is held.
      for (const r of before) expect(r.verdict).toBe('pass');

      // One open stint, on the FIRST of them.
      const machine = await one<{ id: string }>(db, `select id from machine order by code limit 1`);
      await db.query(
        `insert into machine_usage (machine_id, master_batch_id, batch_activity_id, started_at)
         values ($1, $2, $3, now() - interval '1 hour')`,
        [machine.id, batch, before[0].id]
      );

      const after = await all<{ id: string; verdict: string; reason: string }>(
        db,
        `select ba.id, v.verdict, v.reason from batch_activity ba
           cross join lateral evaluate_gates(ba.id, 'exit') v
          where ba.master_batch_id = $1 and v.kind = 'MACHINE_STINT_CLOSED'
          order by ba.seq`,
        [batch]
      );
      const held = after.filter((r) => r.verdict === 'fail');
      expect(
        held.map((r) => r.id),
        'exactly the activity whose machine is still running is held'
      ).toEqual([before[0].id]);
      // The reason names the machine, from `gate_rule`'s own template — not a string built here.
      expect(held[0].reason).toMatch(/stint/i);
    });
  });

  it('GM_APPROVAL fails, holds TN-LOAD, and says which checkpoint it is waiting on', async () => {
    await withRollback(async (db) => {
      const batch = await createDraftBatch(db);
      const rows = await all<{ verdict: string; reason: string }>(
        db,
        `select v.verdict, v.reason from batch_activity ba
           cross join lateral evaluate_gates(ba.id, 'entry') v
          where ba.master_batch_id = $1 and ba.code = 'TN-LOAD' and v.kind = 'GM_APPROVAL'`,
        [batch]
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.verdict).toBe('fail');
        expect(r.reason).toMatch(/GM approval/);
        expect(r.reason).toMatch(/checkpoint 3/i);
      }

      // ── THIS CLAUSE WAS "and there is nowhere to record the decision". ──────
      //
      // B1 was right to report that, and B6 has since built the place: `management_checkpoint` and
      // `checkpoint_decision`. Asserting absence would now fail for the right reason, which makes it a
      // useless test — the same substitution `demoBatches.test.ts` needed once history was staged.
      //
      // What is still worth asserting, and is what B1 actually cared about: the gate fails because NO
      // DECISION EXISTS on this batch, not because approval is impossible. So the recording mechanism
      // is present, and this batch has not used it.
      const mechanism = await one<{ tables: string; rpc: string }>(
        db,
        `select (select count(*)::text from information_schema.tables
                  where table_schema='public'
                    and table_name in ('management_checkpoint','checkpoint_decision')) as tables,
                (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='record_checkpoint_decision') as rpc`
      );
      expect(mechanism.tables, 'B6 builds both checkpoint tables').toBe('2');
      expect(mechanism.rpc, 'B6 builds the RPC that records a decision').toBe('1');

      const decided = await one<{ n: string }>(
        db,
        `select count(*)::text as n from checkpoint_decision d
           join management_checkpoint c on c.id = d.management_checkpoint_id
          where c.master_batch_id = $1`,
        [batch]
      );
      expect(
        Number(decided.n),
        'the gate must be failing because this batch has no decision, not because none can exist'
      ).toBe(0);
    });
  });
});
