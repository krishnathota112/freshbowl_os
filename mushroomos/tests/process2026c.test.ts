/**
 * SLICE 1 — Admin: create a batch, set H0, generate the plan, activate, and the baseline freezes.
 *
 * WHAT THIS FILE IS ACTUALLY DEFENDING
 *   Not "470". 470 h is a property of PROCESS-2026C and of nothing else; another standard
 *   computes its own number and this application must hold both at once. So every expected hour
 *   here is READ FROM `docs/01-process/schedule.json` — the file `docs/00-START-HERE.md` puts at
 *   the top of the precedence order, "every hour figure, mechanically" — and the same figures are
 *   read from the database and compared. No hour is typed into an assertion.
 *
 *   The claims are therefore structural, and they hold for any future standard:
 *
 *     · a process version's standard is CALCULATED from its own activities, never from
 *       (total_days + 1) x 24, and two versions can disagree in the same database
 *     · the plan a batch freezes is generated from the version it names
 *     · a half hour survives the trip from the standard to a planned instant
 *     · activation freezes the plan, by the table, for every path
 *
 * Every test runs in a transaction that is rolled back.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DB_URL,
  NO_DB_REASON,
  REPO_ROOT,
  actAs,
  all,
  createDraftBatch,
  one,
  refuses,
  satisfyPrebatchMaterialCheck,
  withRollback,
  type Db,
} from './db';

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

// ─────────────────────────────────────────────────────────────────────────────
// The source of truth for every hour in this file.
// ─────────────────────────────────────────────────────────────────────────────

type Schedule = {
  anchor: number;
  envelope: number;
  full_discharge: number;
  main: { code: string; start: number; end: number; kind: 'WORK' | 'HOLD' }[];
  paddy: { code: string; start: number; end: number }[];
  nitro: { code: string; start: number; end: number }[];
  turner: { pile: number; pas: string; start: number; end: number }[];
  streams: { n: number; fill: [number, number]; gr: number }[];
};

const SCHEDULE: Schedule = JSON.parse(
  readFileSync(join(REPO_ROOT, 'docs/01-process/schedule.json'), 'utf8')
);

const CODE = 'PROCESS-2026C';
const MS_PER_HOUR = 3_600_000;

/** `numeric` comes back from `pg` as a string. Compare numbers, never strings. */
const num = (v: unknown): number => Number(v);

describeDb('the standard belongs to the process version, not to the application', () => {
  it('PROCESS-2026C computes its standard from its own activities', async () => {
    await withRollback(async (db: Db) => {
      const row = await one<{
        standard_hr: string;
        full_span_hr: string;
        stated_envelope_hr: number | null;
        envelope_disagrees: boolean;
        baseline_hours: number;
        activity_count: string;
      }>(
        db,
        `select e.standard_hr, e.full_span_hr, e.stated_envelope_hr, e.envelope_disagrees,
                e.baseline_hours, e.activity_count
           from v_process_envelope e where e.code = $1`,
        [CODE]
      );

      // The standard is what schedule.json says the process reaches, not a number in this file.
      expect(num(row.standard_hr)).toBe(SCHEDULE.envelope);

      // The last stream is out AFTER the standard. Two numbers, both true, never conflated —
      // the standard is measured on stream 1 and the third stream discharges later.
      expect(num(row.full_span_hr)).toBe(SCHEDULE.full_discharge);
      expect(num(row.full_span_hr)).toBeGreaterThan(num(row.standard_hr));

      // The stated envelope and the activities beneath it describe the same process.
      expect(row.stated_envelope_hr).toBe(SCHEDULE.envelope);
      expect(row.envelope_disagrees).toBe(false);

      // ⚠ THE DEFECT THIS SLICE EXISTS FOR. `baseline_hours` is (total_days + 1) x 24 and is
      // NOT the standard. If a screen ever reads it again this assertion says what it would show.
      expect(row.baseline_hours).not.toBe(SCHEDULE.envelope);
    });
  });

  it('two published standards disagree about their own length, in the same database', async () => {
    await withRollback(async (db: Db) => {
      const rows = await all<{ code: string; standard_hr: string | null }>(
        db,
        `select code, standard_hr from v_process_catalogue where is_selectable order by code`
      );
      expect(rows.length, 'more than one standard must be usable at once').toBeGreaterThan(1);

      const lengths = new Set(rows.map((r) => num(r.standard_hr)));
      expect(
        lengths.size,
        'if every version reported the same length, the number would be the application’s and not the process’s'
      ).toBeGreaterThan(1);

      const c = rows.find((r) => r.code === CODE);
      expect(c && num(c.standard_hr)).toBe(SCHEDULE.envelope);
    });
  });

  it('no process code is compiled into the function that starts a batch', async () => {
    await withRollback(async (db: Db) => {
      const { body } = await one<{ body: string }>(
        db,
        `select pg_get_functiondef(p.oid) as body
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'create_master_batch'`
      );
      // The literal 'PROCESS-2026B' lived here from 0005 until 0044, which meant a batch was a
      // 552-hour batch however many standards were published beside it.
      expect(body).not.toMatch(/PROCESS-20\d\d[A-Z]/);
      expect(body, 'the standard is read from the catalogue').toMatch(
        /current_process_definition/
      );
    });
  });
});

describeDb('the plan is generated from the version the batch names', () => {
  it('lays the whole of PROCESS-2026C onto the hour axis', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createDraftBatch(db, { processCode: CODE });

      const planned = await all<{ code: string; hstart: string; hend: string | null }>(
        db,
        `select code, baseline_start_hour as hstart, baseline_end_hour as hend
           from batch_activity where master_batch_id = $1`,
        [batch]
      );
      const byCode = new Map(planned.map((p) => [p.code, p]));

      // Every activity in every stream of the source lands where the source puts it.
      const expected = [
        ...SCHEDULE.main.map((a) => ({ code: a.code, start: a.start, end: a.end })),
        ...SCHEDULE.paddy.map((a) => ({ code: a.code, start: a.start, end: a.end })),
        ...SCHEDULE.nitro.map((a) => ({ code: a.code, start: a.start, end: a.end })),
        ...SCHEDULE.turner.map((t) => ({
          code: `TRN-P${t.pile}-${t.pas}`,
          start: t.start,
          end: t.end,
        })),
        ...SCHEDULE.streams.map((s) => ({
          code: `BNK-B${s.n}-FILL`,
          start: s.fill[0],
          end: s.fill[1],
        })),
      ];

      for (const e of expected) {
        const got = byCode.get(e.code);
        expect(got, `${e.code} is missing from the generated plan`).toBeDefined();
        expect(num(got!.hstart), `${e.code} start`).toBe(e.start);
        expect(num(got!.hend), `${e.code} end`).toBe(e.end);
      }

      // The three discharges, which state an hour and no duration. An invented duration would be
      // indistinguishable from a factory figure once it was stored.
      for (const s of SCHEDULE.streams) {
        const d = byCode.get(`TUN-DISCHARGE-${s.n}`);
        expect(d, `stream ${s.n} discharge`).toBeDefined();
        expect(num(d!.hstart)).toBe(s.gr);
        expect(d!.hend, 'no duration is stated for unloading, so none is stored').toBeNull();
      }

      // The Turner anchor, named by the source rather than typed here.
      expect(num(byCode.get('TRN-P1-T0')!.hstart)).toBe(SCHEDULE.anchor);
    });
  });

  it('a half hour survives from the standard to the planned instant', async () => {
    await withRollback(async (db: Db) => {
      // The whole reason 0042 widened the axis and 0046 stopped make_interval rounding it.
      const halves = SCHEDULE.turner.filter((t) => t.start * 2 !== Math.floor(t.start) * 2);
      expect(halves.length, 'the Turner is what makes this test necessary').toBeGreaterThan(0);

      const batch = await createDraftBatch(db, { processCode: CODE, startAt: '2026-09-20T09:00:00Z' });
      const h0 = await one<{ start_at: Date }>(
        db,
        `select start_at from master_batch where id = $1`,
        [batch]
      );

      for (const t of halves) {
        const row = await one<{ hstart: string; planned: Date }>(
          db,
          `select baseline_start_hour as hstart, planned_start_at as planned
             from batch_activity where master_batch_id = $1 and code = $2`,
          [batch, `TRN-P${t.pile}-${t.pas}`]
        );
        expect(num(row.hstart), `pile ${t.pile} ${t.pas} hour`).toBe(t.start);
        // The instant, to the minute. A truncating placement would land it 30 minutes early.
        expect(
          row.planned.getTime() - h0.start_at.getTime(),
          `pile ${t.pile} ${t.pas} instant`
        ).toBe(t.start * MS_PER_HOUR);
      }
    });
  });

  it('material resting is planned but is not work anyone is assigned to', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createDraftBatch(db, { processCode: CODE });

      const holds = await all<{ code: string }>(
        db,
        `select code from batch_activity where master_batch_id = $1 and is_hold`,
        [batch]
      );
      const expectedHolds = SCHEDULE.main.filter((a) => a.kind === 'HOLD').map((a) => a.code);
      for (const code of expectedHolds) {
        expect(holds.map((h) => h.code), `${code} is a HOLD in the source`).toContain(code);
      }

      // The finding that used to ask which person performs sixty-three hours of compost sitting
      // in a bunker at temperature.
      const nobody = await all<{ message: string }>(
        db,
        `select message from validate_batch($1)
          where code = 'NO_ASSIGNEE'
            and activity_id in (select id from batch_activity where master_batch_id = $1 and is_hold)`,
        [batch]
      );
      expect(nobody, 'a hold has nobody to assign').toEqual([]);
    });
  });

  it('no generated title contains the word the label resolver falls back to', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createDraftBatch(db, { processCode: CODE });
      // `{role_lead}` on an activity with no material_role resolved to the literal "Material",
      // which read as a translation failure and was actually a missing role binding.
      const leaked = await all<{ code: string; title: string }>(
        db,
        `select code, title from batch_activity
          where master_batch_id = $1 and (title like '%{role_lead}%' or title like '% Material %')`,
        [batch]
      );
      expect(leaked).toEqual([]);
    });
  });
});

describeDb('activation freezes the baseline', () => {
  /** Everything `validate_batch` blocks on, done honestly rather than forced. */
  async function makeActivatable(db: Db, batch: string): Promise<void> {
    const person = await one<{ id: string }>(
      db,
      `select id from profiles where is_active order by created_at nulls last limit 1`
    );
    // Holds excluded, because 0047 stopped asking for a person to perform them.
    await db.query(
      `update batch_activity set assigned_person_id = $2
        where master_batch_id = $1 and not is_time_gate and not is_hold`,
      [batch, person.id]
    );
    await satisfyPrebatchMaterialCheck(db, batch);
  }

  it('activates, and then refuses every path that would move the plan', async () => {
    await withRollback(async (db: Db) => {
      await db.query(`update factory_clock set timezone = 'UTC' where id = 1`);
      const batch = await createDraftBatch(db, { processCode: CODE });
      await makeActivatable(db, batch);

      const blocking = await all<{ code: string; message: string }>(
        db,
        `select code, message from validate_batch($1) where severity = 'blocking'`,
        [batch]
      );
      expect(
        blocking.map((b) => `${b.code}: ${b.message}`),
        'the batch must be genuinely activatable, not force-activated'
      ).toEqual([]);

      const before = await one<{ hstart: string; planned: Date }>(
        db,
        `select baseline_start_hour as hstart, planned_start_at as planned
           from batch_activity where master_batch_id = $1 and code = 'TRN-P1-T0'`,
        [batch]
      );

      // 0058 · activation is admin-or-GM. This proof is about the FREEZE, not about who may
      // activate, so it wears the role that legitimately does.
      await actAs(db, 'admin');
      await db.query(`select public.activate_batch($1)`, [batch]);

      const status = await one<{ status: string; activated_at: Date | null }>(
        db,
        `select status, activated_at from master_batch where id = $1`,
        [batch]
      );
      expect(status.status).toBe('active');
      expect(status.activated_at).not.toBeNull();

      // Three ways to move a plan, all refused, each naming what to do instead.
      for (const [sql, values] of [
        [`select public.generate_activity_plan($1)`, [batch]],
        [`select public.set_batch_start_at($1, '2026-10-01T06:00:00+00')`, [batch]],
        [
          `update batch_activity set baseline_start_hour = 1 where master_batch_id = $1`,
          [batch],
        ],
      ] as const) {
        const message = await refuses(db, sql, [...values]);
        expect(message).toMatch(/frozen|cannot be regenerated|active/i);
      }

      // And the plan is where it was.
      const after = await one<{ hstart: string; planned: Date }>(
        db,
        `select baseline_start_hour as hstart, planned_start_at as planned
           from batch_activity where master_batch_id = $1 and code = 'TRN-P1-T0'`,
        [batch]
      );
      expect(num(after.hstart)).toBe(num(before.hstart));
      expect(after.planned.getTime()).toBe(before.planned.getTime());
    });
  });

  it('refuses to plan a batch against a standard that is not published', async () => {
    await withRollback(async (db: Db) => {
      const draft = await one<{ id: string }>(
        db,
        `insert into process_definition
           (code, name, version, status, source_ref, anchor_day_label, total_days)
         values ('PROCESS-TEST-DRAFT', 'not published', 1, 'draft', 'test', 'H0', 1)
         returning id`
      );
      await actAs(db, 'admin');
      const message = await refuses(
        db,
        `select public.create_master_batch('TEST-DRAFT','TEST-DRAFT','2026-09-20',
                  '{}'::jsonb, '[]'::jsonb, null, null, null, $1)`,
        [draft.id]
      );
      // A draft standard can still change, and this batch's baseline would freeze hours nobody
      // had stated.
      expect(message).toMatch(/draft/i);
    });
  });

  it('refuses to publish a standard that disagrees with its own activities', async () => {
    await withRollback(async (db: Db) => {
      // A published definition is frozen, so this proves the check on a fresh draft rather than
      // by corrupting PROCESS-2026C.
      const d = await one<{ id: string }>(
        db,
        `insert into process_definition
           (code, name, version, status, source_ref, anchor_day_label, total_days,
            envelope_hours, envelope_hour_source, envelope_confidence)
         values ('PROCESS-TEST-LIAR', 'stated envelope is a lie', 1, 'draft', 'test', 'H0', 0,
                 99, 'factory_stated', 'FACTORY_CONFIRMED')
         returning id`
      );
      await db.query(
        `insert into process_activity
           (process_definition_id, code, label_template, stream, rel_day, seq, scope,
            cardinality_rule, standard_start_hour, standard_end_hour, standard_hour_source,
            source_ref)
         values ($1, 'TEST-ONE', 'One', 'YARD', 0, 10, 'MASTER', '{"kind":"SINGLETON"}',
                 0, 4, 'factory_stated', 'test')`,
        [d.id]
      );

      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ app_metadata: { app_role: 'admin' } }),
      ]);
      const message = await refuses(db, `select public.publish_process_definition($1)`, [d.id]);
      // The rule generalises: not "must equal 470", but "the stated number and the process
      // beneath it must describe the same process".
      expect(message).toMatch(/disagrees with itself|compute/i);
      expect(message).toContain('99');
    });
  });
});
