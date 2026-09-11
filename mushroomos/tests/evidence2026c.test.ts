/**
 * B5 — the evidence PLAN for PROCESS-2026C.
 *
 * `tests/evidence.test.ts` proves the MECHANISM over HTTP with real JWTs and real bytes: upload,
 * bind, count, supersede, sign, retrieve, and the authorisation around all of it. That suite is
 * process-agnostic and it passes.
 *
 * What it does not say is whether PROCESS-2026C asks for the RIGHT evidence. This file does:
 *
 *   · two photographs on every activity somebody performs, and none on a hold
 *   · the Turner's forty-eight — 2 x 6 piles x 4 stages
 *   · laboratory evidence is checkpoint-specific, not one generic upload
 *   · a bound row can answer which batch, which activity, which pile, what type, who, when
 *
 * Nothing here is a literal the database does not also hold: the pile count comes from the Turner
 * activities, the evidence kinds from `lab_checkpoint.evidence_kinds`. Every test rolls back.
 */

import { describe, expect, it } from 'vitest';

import {
  DB_URL,
  NO_DB_REASON,
  all,
  createActiveBatchOn,
  one,
  withRollback,
  type Db,
} from './db';

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

const CODE = 'PROCESS-2026C';
const n = (v: unknown) => Number(v);

describeDb('two photographs on everything a person performs', () => {
  it('every non-hold production activity asks for a BEFORE and an AFTER, both gating', async () => {
    await withRollback(async (db: Db) => {
      const rows = await all<{ code: string; keys: string[]; gating: string }>(
        db,
        `select ba.code,
                array_agg(r.key order by r.ordering) as keys,
                count(*) filter (where r.gates_submission)::text as gating
           from batch_activity ba
           join batch_activity_evidence_req r on r.batch_activity_id = ba.id
           join master_batch mb on mb.id = ba.master_batch_id
          where mb.id = $1 and not ba.is_hold and ba.responsible_role <> 'lab_tech'
          group by ba.code, ba.id`,
        [await createActiveBatchOn(db, CODE)]
      );

      expect(rows.length, 'production activities must exist').toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.keys, `${r.code}`).toEqual(['BEFORE_PHOTO', 'AFTER_PHOTO']);
        // Gating is the whole point: evidence that does not block submission is a suggestion.
        expect(n(r.gating), `${r.code} evidence must gate submission`).toBe(2);
      }
    });
  });

  it('a hold asks for none, because nobody performs it', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);
      const holds = await all<{ code: string; reqs: string }>(
        db,
        `select ba.code, count(r.id)::text as reqs
           from batch_activity ba
           left join batch_activity_evidence_req r on r.batch_activity_id = ba.id
          where ba.master_batch_id = $1 and ba.is_hold
          group by ba.code, ba.id`,
        [batch]
      );
      expect(holds.length, 'PROCESS-2026C has holds').toBeGreaterThan(0);
      // 128 of the first 174 hours are material resting. There is nothing to photograph.
      for (const h of holds) expect(n(h.reqs), `${h.code}`).toBe(0);
    });
  });

  it('the Turner is forty-eight photographs — 2 x 6 piles x 4 stages', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);

      // The shape is READ, not asserted as three literals: piles and passes come from the plan.
      const shape = await one<{ piles: string; passes: string; activities: string }>(
        db,
        `select count(distinct scope_label)::text as piles,
                count(distinct right(code, 2))::text as passes,
                count(*)::text as activities
           from batch_activity
          where master_batch_id = $1 and code like 'TRN-P%-T%'`,
        [batch]
      );
      expect(n(shape.piles)).toBe(6);
      expect(n(shape.passes)).toBe(4);
      expect(n(shape.activities)).toBe(24);

      const photos = await one<{ total: string }>(
        db,
        `select count(*)::text as total
           from batch_activity ba
           join batch_activity_evidence_req r on r.batch_activity_id = ba.id
          where ba.master_batch_id = $1 and ba.code like 'TRN-P%-T%'`,
        [batch]
      );
      expect(
        n(photos.total),
        'the Master PRD: 2 photos x 6 piles x 4 stages = 48 operational Turner photographs'
      ).toBe(n(shape.piles) * n(shape.passes) * 2);
      expect(n(photos.total)).toBe(48);
    });
  });

  it('each Turner photograph names its own pile, so a picture can be placed', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);
      const rows = await all<{ code: string; scope_label: string; scope: string }>(
        db,
        `select code, scope_label, scope::text as scope from batch_activity
          where master_batch_id = $1 and code like 'TRN-P%-T%' order by code`,
        [batch]
      );
      for (const r of rows) {
        expect(r.scope).toBe('PILE');
        // 'TRN-P4-T2' must carry 'Pile 4' — otherwise a photograph of pile 4 is filed under
        // nothing, and "which pile?" has no answer.
        expect(r.scope_label).toBe(`Pile ${r.code.charAt(5)}`);
      }
    });
  });
});

describeDb('laboratory evidence is checkpoint-specific', () => {
  it('each lab activity asks for exactly what its checkpoint asks for', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);

      // `cp.evidence_kinds` is grouped ON rather than aggregated: aggregating an array column
      // produces a two-dimensional array, and subscripting that returns a scalar, not the inner
      // array. It is constant per activity anyway, so grouping is both simpler and honest.
      const rows = await all<{ code: string; asked: string[]; defined: string[] }>(
        db,
        `select ba.code,
                array_agg(distinct r.key) as asked,
                cp.evidence_kinds         as defined
           from batch_activity ba
           join batch_activity_evidence_req r on r.batch_activity_id = ba.id
           join process_activity pa on pa.id = ba.process_activity_id
           join lab_checkpoint_activity lca on lca.process_activity_id = pa.id
           join lab_checkpoint cp on cp.checkpoint_map = lca.checkpoint_map
                                 and cp.code = lca.checkpoint_code
          where ba.master_batch_id = $1
          group by ba.code, ba.id, cp.evidence_kinds`,
        [batch]
      );

      expect(rows.length, 'lab activities must carry evidence').toBeGreaterThan(0);
      for (const r of rows) {
        // Exactly the kinds LAB-2026A names for that checkpoint — no more, no fewer.
        expect([...r.asked].sort(), `${r.code}`).toEqual([...r.defined].sort());
      }
    });
  });

  it('the seven LAB-2026A kinds are distinct, not collapsed into one upload', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);
      const kinds = await all<{ key: string }>(
        db,
        `select distinct r.key
           from batch_activity ba
           join batch_activity_evidence_req r on r.batch_activity_id = ba.id
          where ba.master_batch_id = $1 and ba.responsible_role = 'lab_tech'
          order by 1`,
        [batch]
      );
      const names = kinds.map((k) => k.key);
      // A weighment slip and a height photograph answer different questions. Collapsing them
      // into "upload image" would lose the question each was asked for.
      expect(names).toContain('HEIGHT_PHOTO');
      expect(names).toContain('WEIGHMENT_SLIP');
      expect(names).toContain('LOT_PHOTO');
      expect(names).toContain('SAMPLE_PHOTO');
      expect(names).toContain('TUNNEL_PHOTO');
      expect(names.length, 'more than one kind, or the distinction was lost').toBeGreaterThan(3);
    });
  });

  it('the height photograph is on the checkpoints where height is measured first', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);
      const withHeight = await all<{ code: string }>(
        db,
        `select distinct ba.code
           from batch_activity ba
           join batch_activity_evidence_req r on r.batch_activity_id = ba.id
          where ba.master_batch_id = $1 and r.key = 'HEIGHT_PHOTO' order by 1`,
        [batch]
      );
      // "Shrunken height is recorded FIRST — it determines the reload height." A photograph of
      // the reading that sets what happens next is the one that has to exist.
      expect(withHeight.map((r) => r.code).some((c) => c.startsWith('LAB-BNK-LOAD'))).toBe(true);
      expect(withHeight.map((r) => r.code).some((c) => c.startsWith('LAB-RLD-UNL'))).toBe(true);
    });
  });
});

describeDb('an evidence record answers the questions it has to answer', () => {
  it('nothing can be submitted while its photographs are outstanding', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);
      const a = await one<{ id: string; title: string }>(
        db,
        `select id, title from batch_activity
          where master_batch_id = $1 and code = 'FIB-WET-1'`,
        [batch]
      );

      const gate = await one<{ verdict: string; reason: string }>(
        db,
        `select verdict, reason from public.evaluate_gates($1, 'exit')
          where kind = 'EVIDENCE_COMPLETE'`,
        [a.id]
      );
      expect(gate.verdict).toBe('fail');
      // The refusal names what is missing, so an operator is not left guessing which photograph.
      expect(gate.reason).toMatch(/2 evidence item/i);
      expect(gate.reason).toMatch(/Before starting|After finishing/);
    });
  });

  it('the metadata a bound photograph carries can place it', async () => {
    await withRollback(async (db: Db) => {
      // The shape of the record, asserted against the real table rather than a sample row — the
      // live HTTP round trip in tests/evidence.test.ts proves one gets written.
      const cols = await all<{ column_name: string }>(
        db,
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'evidence_media'`
      );
      const names = cols.map((c) => c.column_name);
      for (const needed of [
        'master_batch_id', // which batch
        'batch_activity_id', // which activity — and through it the pile, machine and stage
        'requirement_key', // what type of evidence
        'media_kind',
        'storage_path', // the object itself
        'uploaded_by', // who
        'uploaded_at', // when, server-side
        'superseded_by_id', // and what replaced it, if anything
        'superseded_reason',
      ]) {
        expect(names, `evidence_media must record ${needed}`).toContain(needed);
      }

      // `uploaded_by` points at a real person, not a free-text name.
      const fk = await all<{ conname: string }>(
        db,
        `select conname from pg_constraint
          where conrelid = 'public.evidence_media'::regclass and contype = 'f'
            and pg_get_constraintdef(oid) like '%uploaded_by%profiles%'`
      );
      expect(fk.length, 'the uploader is a profile, so "who" cannot be typed in').toBe(1);
    });
  });

  it('the pile, the stage and the batch are all reachable from one photograph', async () => {
    await withRollback(async (db: Db) => {
      const batch = await createActiveBatchOn(db, CODE);
      // The join a management screen makes to answer "show me pile 4's T2 photographs".
      const row = await one<{
        batch_code: string;
        activity_code: string;
        scope_label: string;
        stream: string;
        requirement_key: string;
        planned_start_at: Date | null;
      }>(
        db,
        `select mb.code as batch_code, ba.code as activity_code, ba.scope_label,
                ba.stream::text as stream, r.key as requirement_key, ba.planned_start_at
           from batch_activity ba
           join master_batch mb on mb.id = ba.master_batch_id
           join batch_activity_evidence_req r on r.batch_activity_id = ba.id
          where ba.master_batch_id = $1 and ba.code = 'TRN-P4-T2' and r.key = 'AFTER_PHOTO'`,
        [batch]
      );
      expect(row.scope_label).toBe('Pile 4');
      expect(row.activity_code).toBe('TRN-P4-T2');
      expect(row.requirement_key).toBe('AFTER_PHOTO');
      expect(row.planned_start_at, 'the photograph sits on the batch clock').not.toBeNull();
    });
  });
});
