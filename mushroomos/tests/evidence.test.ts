/**
 * A4 — evidence storage. `BUILD_SEQUENCE_KIRO.md §A4`.
 *
 * THE GATE, verbatim:
 *   · criterion 17
 *   · a photo survives sign-out
 *   · a second user CANNOT satisfy another user's requirement — asserted by a direct PostgREST call
 *     with a valid JWT, not by clicking
 *
 * EVERY TEST HERE GOES OVER HTTP WITH A REAL TOKEN. That is not stylistic. The `pg` connection used
 * by the other suites is `postgres`, which has `BYPASSRLS` and a null `auth.uid()`, so it cannot see
 * a single one of the checks this step exists to add. An authorisation proof made as a superuser
 * proves nothing about authorisation.
 *
 * Real bytes are uploaded to the real private bucket. `pg` is used only to read state back and to
 * clean up afterwards — never to stand in for a client.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ACCOUNTS,
  HTTP_READY,
  NO_HTTP_REASON,
  fetchSigned,
  removeObject,
  rest,
  rpc,
  signIn,
  signOut,
  signUrl,
  tinyJpeg,
  upload,
  type Session,
} from './http';
import { DB_URL, all, one, withRollback } from './db';
import pg from 'pg';

type Row = Record<string, unknown>;

const ready = HTTP_READY && Boolean(DB_URL);
const describeHttp = ready ? describe : describe.skip;
if (!ready) console.warn(`\n  SKIPPED: ${NO_HTTP_REASON}\n`);

type Target = {
  activity_id: string;
  batch_id: string;
  title: string;
  requirement_key: string;
  requirement_label: string;
  min_count: number;
};

/** Paths this run created, so nothing is left in the bucket. */
const created: string[] = [];

let operator: Session;
let lab: Session;
let admin: Session;
let target: Target;
let labTarget: Target;

/**
 * Read state back through `pg`. Used ONLY to observe and to clean up — never to stand in for a
 * client, because `postgres` has BYPASSRLS and would make every authorisation assertion vacuous.
 */
async function dbRows<R extends Row = Row>(sql: string, values?: unknown[]): Promise<R[]> {
  const c = new pg.Client({ connectionString: DB_URL!, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const { rows } = await c.query<R>(sql, values);
    return rows;
  } finally {
    await c.end();
  }
}

async function dbExec(sql: string, values?: unknown[]): Promise<void> {
  await dbRows(sql, values);
}

/** An activity on a live batch, assigned to `role`, with an outstanding gating requirement. */
async function pickTarget(role: 'operator' | 'lab_tech'): Promise<Target> {
  const rows = await dbRows<Target>(
    `select ba.id as activity_id, ba.master_batch_id as batch_id, ba.title,
            r.key as requirement_key, r.label as requirement_label, r.min_count
       from batch_activity ba
       join master_batch mb on mb.id = ba.master_batch_id
       join batch_activity_evidence_req r on r.batch_activity_id = ba.id
       join profiles p on p.id = ba.assigned_person_id
      where mb.status = 'active'
        and p.role = $1
        and r.gates_submission
        -- The LIVE ROW COUNT, not satisfied_count. It is the predicate bind_evidence itself
        -- applies, and asking a different question here is how this suite once chose a target the
        -- server then refused: a counter left stale by a crashed run reads as outstanding while the
        -- row it should have counted is still there.
        and not exists (
          select 1 from evidence_media m
           where m.requirement_id = r.id and m.superseded_by_id is null
        )
      order by ba.seq, r.ordering, ba.id
      limit 1`,
    [role]
  );
  if (rows.length === 0) throw new Error(`no outstanding ${role} requirement on a live batch`);
  return rows[0];
}

const pathFor = (t: Target) => `${t.batch_id}/${t.activity_id}/${crypto.randomUUID()}.jpg`;

/**
 * Put the three demo batches back to carrying NO evidence, and empty the bucket of anything
 * nothing references.
 *
 * Run BEFORE the suite as well as after, and that is the point. This suite writes to real storage,
 * which is not transactional, so a run that crashes half way leaves live evidence behind — and the
 * next run then picks a target the server refuses, or trips A3's "no work history was fabricated".
 * Sweeping at both ends makes the suite idempotent instead of order-dependent.
 *
 * SCOPE IS DELIBERATELY NARROW: `MB-DEMO-%` only, the codes `tests/demoBatches.test.ts` owns. A3's
 * own gate asserts those batches carry no evidence, so anything found here is residue by
 * definition. It will not touch a batch a person actually worked.
 */
async function sweepDemoEvidence(): Promise<{ rows: number; objects: number; failed: string[] }> {
  // ⚠ SCOPED TO EVIDENCE ON WORK THAT IS NOT FINISHED, and the qualifier is load-bearing.
  //
  // This swept every evidence row on `MB-DEMO-%` wholesale, which was right while A3's batches were
  // asserted to carry NO evidence. `scripts/stage-history.mjs` has since bound 50 real photographs to
  // work it completed through the RPCs — and the first run of this suite afterwards DELETED ALL OF
  // THEM, leaving 49 activities COMPLETED with zero proof behind them. That is a state the engine
  // cannot produce, so the recount trigger silently manufactured a false record.
  //
  // It was caught by `demoBatches.test.ts`'s criterion-17 assertion within one run of that assertion
  // existing. The rule that separates the two kinds of evidence:
  //
  //   staged history  belongs to activities this suite never touches, because staging COMPLETED them
  //   suite residue   belongs to activities that are still open, because this suite only ever targets
  //                   requirements that are OUTSTANDING and it never submits
  //
  // So finished work keeps its proof, and anything this suite could have left behind is still swept.
  const bound = await dbRows<{ storage_path: string }>(
    `select m.storage_path from evidence_media m
       join master_batch mb on mb.id = m.master_batch_id
       join batch_activity ba on ba.id = m.batch_activity_id
      where mb.code like 'MB-DEMO-%'
        and ba.state not in ('COMPLETED','DEVIATION','SKIPPED')`
  );
  if (bound.length > 0) {
    await dbExec(`delete from evidence_media where storage_path = any($1)`, [
      bound.map((r) => r.storage_path),
    ]);
  }

  // Anything in the bucket that no row references — including the residue of a bind that failed
  // after its upload succeeded, which is exactly what UPLOAD FIRST leaves behind on a refusal.
  const orphans = await dbRows<{ name: string }>(
    `select o.name from storage.objects o
      where o.bucket_id = 'evidence'
        and not exists (select 1 from evidence_media m where m.storage_path = o.name)`
  );
  if (orphans.length === 0) return { rows: bound.length, objects: 0, failed: [] };

  // The objects go through the Storage API: `storage.protect_delete()` refuses a direct
  // `delete from storage.objects`, because that would leave the bytes orphaned in the bucket.
  // As the supervisor, whom `can_capture_for_activity` admits for any activity on a live batch.
  const cleaner = await signIn(ACCOUNTS.supervisor);
  const failed: string[] = [];
  for (const { name } of orphans) {
    const r = await removeObject(cleaner, 'evidence', name);
    if (!r.ok) failed.push(`${name} → ${r.status} ${JSON.stringify(r.body)}`);
  }
  return { rows: bound.length, objects: orphans.length - failed.length, failed };
}

beforeAll(async () => {
  if (!ready) return;
  [operator, lab, admin] = await Promise.all([
    signIn(ACCOUNTS.operator),
    signIn(ACCOUNTS.lab),
    signIn(ACCOUNTS.admin),
  ]);

  // Said out loud rather than cleaned up quietly: residue means a previous run did not finish.
  const swept = await sweepDemoEvidence();
  if (swept.rows > 0 || swept.objects > 0) {
    console.warn(
      `\n  a previous run left residue — swept ${swept.rows} evidence row(s) and ` +
        `${swept.objects} object(s) before starting\n`
    );
  }

  target = await pickTarget('operator');
  labTarget = await pickTarget('lab_tech');
}, 180_000);

afterAll(async () => {
  if (!ready) return;

  // ⚠ FIRST, EVERYTHING THIS RUN BOUND, WHEREVER IT BOUND IT.
  //
  // `sweepDemoEvidence` is scoped to `MB-DEMO-%` on purpose — it must never touch a batch a person
  // actually worked. But `pickTarget` is NOT so scoped: it takes any outstanding requirement on any
  // live batch, and the only lab_tech targets in this database are on a real one. So the suite was
  // binding evidence it could not clean, and each run permanently consumed a target — until the
  // last one went and `pickTarget` threw "no outstanding lab_tech requirement on a live batch",
  // failing the whole suite at collection.
  //
  // Keyed on `created[]` — the exact paths this process uploaded — so it removes what this run made
  // and cannot reach anything else. The recount trigger puts the requirement back to outstanding.
  if (created.length > 0) {
    await dbExec(`delete from evidence_media where storage_path = any($1)`, [created]);
  }

  // Leave the deployed project as it was found: no rows, no objects, counters back to reality.
  // The recount trigger fires on delete, so the requirements go back to outstanding by themselves.
  const swept = await sweepDemoEvidence();

  const left = await dbRows<{ n: string }>(
    `select count(*)::text n from storage.objects where bucket_id = 'evidence'`
  );
  if (swept.failed.length > 0 || Number(left[0].n) > 0) {
    console.warn(
      `\n  cleanup left ${left[0].n} object(s) in the evidence bucket:\n    ` +
        `${swept.failed.join('\n    ')}\n`
    );
  }
}, 180_000);

// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * THE PRECONDITION. Every assertion below it is vacuous without this one.
 *
 * `current_app_role()` reads `app_metadata.app_role` out of the verified token and nothing else.
 * Until 0015 nothing populated it, so it returned NULL for every real session and every role check
 * in the system — RLS, RPC guards, `has_role`, `audit_event.actor_role` — was dead. A4's
 * `can_capture_for_activity` refused all six accounts, including the ones it is meant to admit, so
 * the negative proofs passed for the wrong reason and the positive controls failed.
 *
 * These tests exist so that regression cannot happen quietly again.
 */
describeHttp('the role claim reaches the server', () => {
  const claimOf = (s: Session) =>
    (
      JSON.parse(Buffer.from(s.accessToken.split('.')[1], 'base64url').toString()) as {
        app_metadata?: { app_role?: string };
      }
    ).app_metadata?.app_role ?? null;

  it('every demo account carries its own role in the token', async () => {
    const expected = await dbRows<{ id: string; role: string }>(
      `select p.id, p.role::text as role from profiles p`
    );
    const byId = new Map(expected.map((r) => [r.id, r.role]));

    for (const s of [operator, lab, admin]) {
      expect(claimOf(s), `${s.email} has no app_role claim`).toBe(byId.get(s.userId));
    }
  });

  it('the SERVER agrees — current_app_role() is not null under a real token', async () => {
    // The claim being in the token is half of it. This is the half that matters: the database
    // resolving it. A null here means every policy in the system fails closed and nothing works.
    const r = await rpc<string>(operator, 'current_app_role', {});
    expect(r.ok, JSON.stringify(r.body)).toBe(true);
    expect(r.body).toBe('operator');
  });

  it('the "role is unknown, allow it" escape hatch is gone from the admin-write policies', async () => {
    // 0004 wrote the clause and said it should be removed once the claim exists. It exists.
    const hatches = await dbRows<{ tbl: string; polname: string }>(
      `select c.relname as tbl, p.polname
         from pg_policy p join pg_class c on c.oid = p.polrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and coalesce(pg_get_expr(polqual, polrelid), '')
              || coalesce(pg_get_expr(polwithcheck, polrelid), '')
              ilike '%current_app_role() IS NULL%'`
    );
    expect(hatches, 'a policy still allows a write when the role is unknown').toEqual([]);
  });
});

describeHttp('the bucket is private, and the old forgeable path is gone', () => {
  it('the evidence bucket exists and is NOT public', async () => {
    const rows = await dbRows<{ id: string; public: boolean }>(
      `select id, public from storage.buckets where id = 'evidence'`
    );
    expect(rows.length, 'A4 requires a private bucket named evidence').toBe(1);
    expect(rows[0].public, 'the bucket must be private').toBe(false);
  });

  it('mark_evidence no longer exists, so no counter-only path is callable', async () => {
    const gone = await dbRows(
      `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'mark_evidence'`
    );
    expect(gone.length, 'mark_evidence must be dropped, not deprecated').toBe(0);

    // And a client calling it gets a hard failure rather than a silent success.
    const r = await rpc(operator, 'mark_evidence', { p_req: target.activity_id });
    expect(r.ok).toBe(false);
    expect([404, 400]).toContain(r.status);
  });

  it('the counter cannot be written directly either', async () => {
    // Otherwise dropping the RPC would just move the forgery one table across.
    const { SUPABASE_URL, ANON_KEY } = await import('./http');
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/batch_activity_evidence_req?key=eq.${target.requirement_key}`,
      {
        method: 'PATCH',
        headers: {
          apikey: ANON_KEY!,
          Authorization: `Bearer ${operator.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ satisfied_count: 99 }),
      }
    );
    expect(r.ok, 'a client must not be able to write satisfied_count').toBe(false);
  });

  it('bind_evidence refuses a path that belongs to another activity', async () => {
    const patch = await rpc(operator, 'bind_evidence', {
      p_activity: target.activity_id,
      p_requirement_key: target.requirement_key,
      p_storage_path: 'nope/nope/nope.jpg',
      p_media_kind: 'photo',
    });
    expect(patch.ok).toBe(false);
    expect(JSON.stringify(patch.body)).toMatch(/does not belong to this activity/);
  });
});

describeHttp('UPLOAD FIRST, THEN BIND — the integrity rule', () => {
  it('binding a path with no object in storage is refused', async () => {
    const path = pathFor(target);
    const r = await rpc(operator, 'bind_evidence', {
      p_activity: target.activity_id,
      p_requirement_key: target.requirement_key,
      p_storage_path: path,
      p_media_kind: 'photo',
    });
    expect(r.ok, 'a row claiming a photo that is not in storage is a false record').toBe(false);
    expect(JSON.stringify(r.body)).toMatch(/upload the file first/);

    // And nothing was written.
    const rows = await dbRows(`select 1 from evidence_media where storage_path = $1`, [path]);
    expect(rows.length).toBe(0);
  });

  it('upload then bind succeeds, and the count is derived from the file', async () => {
    const path = pathFor(target);
    const up = await upload(operator, 'evidence', path, tinyJpeg());
    expect(up.ok, `upload failed: ${JSON.stringify(up.body)}`).toBe(true);
    created.push(path);

    const bound = await rpc<
      { media_id: string; requirement_key: string; satisfied_count: number; min_count: number; uploaded_at: string }[]
    >(operator, 'bind_evidence', {
      p_activity: target.activity_id,
      p_requirement_key: target.requirement_key,
      p_storage_path: path,
      p_media_kind: 'photo',
    });
    expect(bound.ok, `bind failed: ${JSON.stringify(bound.body)}`).toBe(true);

    const row = bound.body[0];
    expect(row.requirement_key).toBe(target.requirement_key);
    expect(row.satisfied_count).toBe(1);

    // The counter is DERIVED: it matches the number of live rows, not a number anybody sent.
    const state = await dbRows<{ satisfied_count: number; live: string }>(
      `select r.satisfied_count,
              (select count(*)::text from evidence_media m
                where m.requirement_id = r.id and m.superseded_by_id is null) as live
         from batch_activity_evidence_req r
        where r.batch_activity_id = $1 and r.key = $2`,
      [target.activity_id, target.requirement_key]
    );
    expect(Number(state[0].live)).toBe(state[0].satisfied_count);
  });

  it('the uploader and the capture time come from the server, not the caller', async () => {
    const rows = await dbRows<{
      uploaded_by: string;
      uploaded_at: string;
      mime_type: string;
      byte_size: string;
    }>(
      `select uploaded_by, uploaded_at::text as uploaded_at, mime_type, byte_size::text as byte_size
         from evidence_media where storage_path = $1`,
      [created[created.length - 1]]
    );
    expect(rows.length).toBe(1);
    // From the JWT.
    expect(rows[0].uploaded_by).toBe(operator.userId);
    // From the server clock, and close to now.
    expect(Math.abs(Date.now() - Date.parse(rows[0].uploaded_at))).toBeLessThan(5 * 60_000);
    // Read off the stored object, not sent by the client.
    expect(rows[0].mime_type).toBe('image/jpeg');
    expect(Number(rows[0].byte_size)).toBeGreaterThan(0);
  });

  it('the same object cannot be bound twice to inflate a count', async () => {
    const path = created[created.length - 1];
    const again = await rpc(operator, 'bind_evidence', {
      p_activity: target.activity_id,
      p_requirement_key: target.requirement_key,
      p_storage_path: path,
      p_media_kind: 'photo',
    });
    expect(again.ok).toBe(false);
  });
});

describeHttp('a second user CANNOT satisfy another user\u2019s requirement', () => {
  it("the lab technician cannot upload into the operator's activity path", async () => {
    // The storage policy refuses it, before any row could exist. This is what makes upload-first safe.
    const path = pathFor(target);
    const up = await upload(lab, 'evidence', path, tinyJpeg());
    expect(up.ok, 'the storage INSERT policy must refuse a path the caller does not own').toBe(false);
    expect([400, 403]).toContain(up.status);
  });

  it("the lab technician cannot bind to the operator's requirement even with a real object", async () => {
    // Belt and braces: the operator uploads a legitimate object, then the OTHER user tries to bind it.
    // If only the storage policy guarded this, the RPC would be a second way in.
    const path = pathFor(target);
    const up = await upload(operator, 'evidence', path, tinyJpeg());
    expect(up.ok).toBe(true);
    created.push(path);

    const stolen = await rpc(lab, 'bind_evidence', {
      p_activity: target.activity_id,
      p_requirement_key: target.requirement_key,
      p_storage_path: path,
      p_media_kind: 'photo',
    });
    expect(stolen.ok, 'ownership must be checked in the RPC as well as in storage').toBe(false);
    expect(JSON.stringify(stolen.body)).toMatch(/Not permitted/);

    // And nothing was recorded against the lab technician on the operator's activity.
    const rows = await dbRows(
      `select 1 from evidence_media where uploaded_by = $1 and batch_activity_id = $2`,
      [lab.userId, target.activity_id]
    );
    expect(rows.length).toBe(0);
  });

  it('an admin may not capture evidence at all — the permission matrix says so', async () => {
    // ROLE_AND_APPROVAL_MODEL §2: "Capture evidence" is ticked for operator, lab_tech and supervisor
    // only. Admin can do almost everything else on a batch and is still refused here.
    const path = pathFor(target);
    const up = await upload(admin, 'evidence', path, tinyJpeg());
    expect(up.ok, 'admin must not be able to upload evidence').toBe(false);
  });

  it('the lab technician CAN satisfy a requirement on their own activity', async () => {
    // The negative tests above would also pass against a policy that refuses everyone. This is the
    // control: the same user, on the activity they are assigned, succeeds.
    const path = pathFor(labTarget);
    const up = await upload(lab, 'evidence', path, tinyJpeg());
    expect(up.ok, `lab upload failed: ${JSON.stringify(up.body)}`).toBe(true);
    created.push(path);

    const bound = await rpc<{ satisfied_count: number }[]>(lab, 'bind_evidence', {
      p_activity: labTarget.activity_id,
      p_requirement_key: labTarget.requirement_key,
      p_storage_path: path,
      p_media_kind: 'photo',
    });
    expect(bound.ok, `lab bind failed: ${JSON.stringify(bound.body)}`).toBe(true);
    expect(bound.body[0].satisfied_count).toBe(1);
  });
});

describeHttp('a photo survives sign-out', () => {
  it('the row and the object are still there after the session ends, and a fresh session reads them', async () => {
    const path = pathFor(target);
    const up = await upload(operator, 'evidence', path, tinyJpeg());
    expect(up.ok).toBe(true);
    created.push(path);

    const bound = await rpc(operator, 'bind_evidence', {
      p_activity: target.activity_id,
      p_requirement_key: target.requirement_key,
      p_storage_path: path,
      p_media_kind: 'photo',
      p_supersedes: null,
      p_supersede_reason: null,
    });
    // The first requirement is already satisfied by an earlier test, so this either binds to a second
    // slot or is refused for being complete. Either way the point of this test is what SURVIVES.
    void bound;

    const before = await dbRows(`select 1 from evidence_media where storage_path = $1`, [created[0]]);
    expect(before.length).toBe(1);

    await signOut(operator);

    // Sign in again — a genuinely new session, new token.
    const again = await signIn(ACCOUNTS.operator);
    expect(again.accessToken).not.toBe(operator.accessToken);
    operator = again;

    // The row is still readable.
    const seen = await rest<{ storage_path: string }[]>(
      operator,
      `evidence_media?select=storage_path,uploaded_at&storage_path=eq.${encodeURIComponent(created[0])}`
    );
    expect(seen.ok, JSON.stringify(seen.body)).toBe(true);
    expect(seen.body.length).toBe(1);

    // And the OBJECT is still there: a signed URL is minted and the bytes come back.
    const signed = await signUrl(operator, 'evidence', created[0]);
    expect(signed.ok, JSON.stringify(signed.body)).toBe(true);
    expect(signed.body.signedURL).toBeTruthy();

    const bytes = await fetchSigned(signed.body.signedURL!);
    expect(bytes.ok, 'the stored object must still be downloadable').toBe(true);
    expect((bytes.body as ArrayBuffer).byteLength).toBeGreaterThan(0);
  });

  it('the bucket really is private — the same path without a signature is refused', async () => {
    const { SUPABASE_URL } = await import('./http');
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/public/evidence/${created[0]}`);
    expect(r.ok, 'a private bucket must not serve objects on the public route').toBe(false);
  });
});

describeHttp('criterion 17 — cannot submit with 2 of 3 satisfied, and the outstanding one is named', () => {
  it('the three-requirement activity refuses submission and names what is missing', async () => {
    // NMIX-ROTAVATE is the reference case: three NAMED requirements, the third being the ammonium
    // sulphate spread by hand. EVIDENCE_CONFIGURATION_MODEL §1.
    //
    // The instance is chosen with all three requirements OUTSTANDING and in a fixed order. It used
    // to be `limit 1` with no ordering over three live batches, so which one it got varied between
    // runs, and if that one had already been touched the first bind was refused for being complete
    // — the test failing on its own earlier arrangement rather than on the rule it is proving.
    const nmix = await dbRows<{
      activity_id: string;
      batch_id: string;
      keys: string[];
      labels: string[];
    }>(
      `select ba.id as activity_id, ba.master_batch_id as batch_id,
              array_agg(r.key order by r.ordering) as keys,
              array_agg(r.label order by r.ordering) as labels
         from batch_activity ba
         join master_batch mb on mb.id = ba.master_batch_id
         join batch_activity_evidence_req r on r.batch_activity_id = ba.id
        where mb.status = 'active' and ba.code = 'NMIX-ROTAVATE'
          and not exists (
            select 1 from evidence_media m
             where m.requirement_id = r.id and m.superseded_by_id is null
          )
        group by ba.id, ba.master_batch_id
       having count(*) = 3
        order by ba.id
        limit 1`
    );
    expect(
      nmix.length,
      'no NMIX-ROTAVATE instance has all three requirements outstanding — evidence was left behind'
    ).toBe(1);
    const { activity_id, batch_id, keys, labels } = nmix[0];

    // Satisfy exactly two of the three, through the real path.
    for (const key of keys.slice(0, 2)) {
      const path = `${batch_id}/${activity_id}/${crypto.randomUUID()}.jpg`;
      const up = await upload(operator, 'evidence', path, tinyJpeg());
      expect(up.ok, `upload failed: ${JSON.stringify(up.body)}`).toBe(true);
      created.push(path);

      const bound = await rpc(operator, 'bind_evidence', {
        p_activity: activity_id,
        p_requirement_key: key,
        p_storage_path: path,
        p_media_kind: 'photo',
      });
      expect(bound.ok, `bind failed: ${JSON.stringify(bound.body)}`).toBe(true);
    }

    const state = await dbRows<{ key: string; satisfied_count: number; min_count: number }>(
      `select key, satisfied_count, min_count from batch_activity_evidence_req
        where batch_activity_id = $1 order by ordering`,
      [activity_id]
    );
    expect(
      state.filter((r) => r.satisfied_count >= r.min_count).length,
      'exactly two of three satisfied'
    ).toBe(2);

    // The exit gate refuses, and names the outstanding one by its LABEL — not "1 photo missing".
    const verdict = await dbRows<{ verdict: string; reason: string }>(
      `select verdict, reason from evaluate_gates($1, 'exit') where kind = 'EVIDENCE_COMPLETE'`,
      [activity_id]
    );
    expect(verdict.length).toBe(1);
    expect(verdict[0].verdict).toBe('fail');
    expect(verdict[0].reason).toContain(labels[2]);
    expect(verdict[0].reason).toMatch(/1 evidence item/);
  });
});

describeHttp('a retake supersedes, it never deletes', () => {
  it('the original is kept, pointing at what replaced it, with a reason', async () => {
    const t = await pickTarget('operator').catch(() => null);
    if (!t) return; // every operator requirement is satisfied; nothing left to retake against

    const first = `${t.batch_id}/${t.activity_id}/${crypto.randomUUID()}.jpg`;
    expect((await upload(operator, 'evidence', first, tinyJpeg())).ok).toBe(true);
    created.push(first);
    const a = await rpc<{ media_id: string }[]>(operator, 'bind_evidence', {
      p_activity: t.activity_id,
      p_requirement_key: t.requirement_key,
      p_storage_path: first,
      p_media_kind: 'photo',
    });
    expect(a.ok, JSON.stringify(a.body)).toBe(true);

    const second = `${t.batch_id}/${t.activity_id}/${crypto.randomUUID()}.jpg`;
    expect((await upload(operator, 'evidence', second, tinyJpeg())).ok).toBe(true);
    created.push(second);

    // A retake with no reason is refused — the record has to say why it was replaced.
    const noReason = await rpc(operator, 'bind_evidence', {
      p_activity: t.activity_id,
      p_requirement_key: t.requirement_key,
      p_storage_path: second,
      p_media_kind: 'photo',
      p_supersedes: a.body[0].media_id,
      p_supersede_reason: null,
    });
    expect(noReason.ok).toBe(false);

    const retake = await rpc<{ media_id: string; satisfied_count: number }[]>(
      operator,
      'bind_evidence',
      {
        p_activity: t.activity_id,
        p_requirement_key: t.requirement_key,
        p_storage_path: second,
        p_media_kind: 'photo',
        p_supersedes: a.body[0].media_id,
        p_supersede_reason: 'first frame was blurred',
      }
    );
    expect(retake.ok, JSON.stringify(retake.body)).toBe(true);

    const rows = await dbRows<{
      storage_path: string;
      superseded_by_id: string | null;
      superseded_reason: string | null;
    }>(
      `select storage_path, superseded_by_id, superseded_reason
         from evidence_media where storage_path in ($1, $2) order by uploaded_at`,
      [first, second]
    );
    expect(rows.length, 'the original must still exist').toBe(2);
    expect(rows[0].superseded_by_id).toBe(retake.body[0].media_id);
    expect(rows[0].superseded_reason).toBe('first frame was blurred');
    expect(rows[1].superseded_by_id).toBeNull();

    // And the count stays at one: a retake replaces, it does not add.
    expect(retake.body[0].satisfied_count).toBe(1);
  });
});

describeHttp('the recount survives a deletion too', () => {
  it('removing a row puts the counter back', async () => {
    await withRollback(async (c) => {
      const before = await one<{ n: string }>(
        c,
        `select count(*)::text n from evidence_media where superseded_by_id is null`
      );
      expect(Number(before.n)).toBeGreaterThan(0);

      const row = await one<{ requirement_id: string; storage_path: string }>(
        c,
        `select requirement_id, storage_path from evidence_media where superseded_by_id is null limit 1`
      );
      await c.query(`delete from evidence_media where storage_path = $1`, [row.storage_path]);

      const after = await all<{ satisfied_count: number; live: string }>(
        c,
        `select r.satisfied_count,
                (select count(*)::text from evidence_media m
                  where m.requirement_id = r.id and m.superseded_by_id is null) as live
           from batch_activity_evidence_req r where r.id = $1`,
        [row.requirement_id]
      );
      expect(after[0].satisfied_count).toBe(Number(after[0].live));
    });
  });
});
