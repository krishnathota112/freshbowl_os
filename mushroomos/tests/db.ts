/**
 * The database harness for the engine proofs.
 *
 * EVERY test runs inside a transaction that is ROLLED BACK. The only database available is the
 * deployed demo project, which holds the three staged batches the demo runs on, and a test that
 * leaves rows behind is a test that quietly corrupts the thing it was meant to protect. Rollback
 * also means two proofs can create a batch with the same shape without colliding.
 *
 * If `SUPABASE_DB_URL` is absent the suites skip with a stated reason rather than passing
 * vacuously. If it is present and the connection fails, they FAIL — a green run must mean the
 * assertions were actually made.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import pg from 'pg';
// `createActiveBatch` asserts the batch is genuinely activatable before activating it, so the
// harness needs the matcher. A helper that silently forced activation would make every suite that
// used it prove less than it claims.
import { expect } from 'vitest';

export type Db = InstanceType<typeof pg.Client>;

const APP_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Read `SUPABASE_DB_URL` from the environment, falling back to `.env.local`.
 *
 * Parsed by hand rather than with `dotenv` so this file needs no second untyped dependency. The
 * value is split on the FIRST `=` only: the connection string is a URI whose percent-encoded
 * password can itself contain `=`.
 */
export function databaseUrl(): string | null {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;

  let raw: string;
  try {
    raw = readFileSync(join(APP_ROOT, '.env.local'), 'utf8');
  } catch {
    return null;
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    if (trimmed.slice(0, eq).trim() !== 'SUPABASE_DB_URL') continue;
    return trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return null;
}

export const DB_URL = databaseUrl();
export const NO_DB_REASON =
  'SUPABASE_DB_URL is not set (checked the environment and mushroomos/.env.local), ' +
  'so the database proofs cannot run';

/** Open a connection, run `fn` inside a transaction, then roll back unconditionally. */
export async function withRollback<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  if (!DB_URL) throw new Error(NO_DB_REASON);

  const client = new pg.Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 120_000,
  });

  await client.connect();
  try {
    await client.query('begin');
    try {
      return await fn(client);
    } finally {
      await client.query('rollback');
    }
  } finally {
    await client.end();
  }
}

/** One row, or a thrown error naming the query. Keeps the assertions readable. */
export async function one<R = Record<string, unknown>>(
  db: Db,
  sql: string,
  values?: unknown[]
): Promise<R> {
  const { rows } = await db.query<R>(sql, values);
  if (rows.length !== 1) {
    throw new Error(`expected exactly one row, got ${rows.length}: ${sql.trim().slice(0, 120)}`);
  }
  return rows[0];
}

export async function all<R = Record<string, unknown>>(
  db: Db,
  sql: string,
  values?: unknown[]
): Promise<R[]> {
  const { rows } = await db.query<R>(sql, values);
  return rows;
}

/** The Day-0 answers a generated plan needs. Mirrors DEFAULT_STRUCTURE in src/api/batch.ts. */
export const DAY0_STRUCTURE: Record<string, number> = {
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

/**
 * The role bindings, READ from `material_role_eligibility.is_default_lead`.
 *
 * These were hard-coded material codes and one of them was wrong: `PADDY_STRAW` does not exist —
 * the materials are `PADDY_PUNJAB` and `PADDY_LOCAL` — so `STRUCTURAL_STRAW` went unbound and
 * `generate_activity_plan` skipped the whole straw stream, exactly as it is designed to when a role
 * has no material. Ten activities were quietly absent from every test plan, including the
 * convergence gates that wait on the straw stream. Reading the defaults removes the possibility.
 */
export async function defaultRoleBindings(db: Db) {
  const rows = await all<{ role: string; code: string }>(
    db,
    `select mre.role::text as role, m.code
       from material_role_eligibility mre
       join material m on m.id = mre.material_id
      where mre.is_default_lead
      order by 1`
  );
  if (rows.length === 0) {
    throw new Error('no default role leads in material_role_eligibility — s02 has not run');
  }
  return rows.map((r) => ({ role: r.role, material_code: r.code, lead: true }));
}

/**
 * A draft batch with every Day-0 answer filled in, including a rest duration for every time gate
 * so `validate_batch` has no REST_NO_DURATION finding to raise.
 *
 * `restHours` is small on purpose: a proof about gate order should not wait on a real rest window.
 */
export async function createDraftBatch(
  db: Db,
  opts: { code?: string; startDate?: string; startAt?: string | null; restHours?: number } = {}
): Promise<string> {
  const code = opts.code ?? `TEST-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const startDate = opts.startDate ?? '2026-09-20';
  // Zero, not "very short". Postgres freezes now() for the whole transaction and these proofs run
  // inside one, so a rest of any positive length can never elapse here. Setting it to zero keeps
  // validate_batch's REST_NO_DURATION satisfied (it checks for NULL) without pretending the
  // factory stated an hour it never has — TBD-21 is untouched by this.
  const restHours = opts.restHours ?? 0;

  const gates = await all<{ code: string }>(
    db,
    `select pa.code from process_activity pa
       join process_definition pd on pd.id = pa.process_definition_id
      where pd.code = 'PROCESS-2026B' and pa.is_time_gate`
  );

  const config: Record<string, number> = { ...DAY0_STRUCTURE };
  for (const g of gates) config[`rest_hr_${g.code}`] = restHours;

  const roles = await defaultRoleBindings(db);

  const row = await one<{ id: string }>(
    db,
    `select public.create_master_batch($1,$2,$3,$4,$5,$6,$7,$8) as id`,
    [
      code,
      code,
      startDate,
      JSON.stringify(config),
      JSON.stringify(roles),
      'Ramarao',
      'Clear',
      opts.startAt ?? null,
    ]
  );
  return row.id;
}

/**
 * An object in storage and a row bound to it, for every outstanding gating requirement on one
 * activity. The database equivalent of an operator photographing what the process asked for.
 *
 * A4 replaced `mark_evidence` — which forged a counter with no file — so satisfying a requirement
 * now means a real object in storage AND a row that points at it. This does both halves in the same
 * order the browser does: the `storage.objects` row stands in for the upload, then the
 * `evidence_media` row binds it, and the trigger recounts `satisfied_count` from the live rows.
 *
 * It writes the rows directly rather than calling `bind_evidence`, because that RPC takes its
 * uploader from the JWT and these proofs connect as `postgres`, where `auth.uid()` is null and it
 * correctly refuses. `bind_evidence` itself — and the authorisation it enforces — is proved over
 * HTTP with real tokens in `tests/evidence.test.ts`.
 *
 * Lives here rather than in one suite because two now need it, and two copies of "what counts as
 * satisfied evidence" is exactly the duplication A4 removed from the server.
 */
export async function satisfyEvidence(db: Db, activityId: string): Promise<void> {
  // Two statements per item rather than one, so the storage row exists before the evidence row
  // references it — upload first, then bind, in the test as in the browser.
  const { rows } = await db.query<{
    req_id: string;
    key: string;
    master_batch_id: string;
    uploader: string;
    path: string;
  }>(
    `select r.id as req_id, r.key, ba.master_batch_id,
            coalesce(ba.assigned_person_id,
                     (select id from profiles where role = 'operator' and is_active limit 1)) as uploader,
            ba.master_batch_id || '/' || ba.id || '/' || gen_random_uuid()::text || '.jpg' as path
       from batch_activity_evidence_req r
       join batch_activity ba on ba.id = r.batch_activity_id
      where r.batch_activity_id = $1
        and r.gates_submission
        and r.satisfied_count < r.min_count`,
    [activityId]
  );

  for (const r of rows) {
    await db.query(
      `insert into storage.objects (bucket_id, name, metadata)
       values ('evidence', $1, jsonb_build_object('size', 4096, 'mimetype', 'image/jpeg'))`,
      [r.path]
    );
    await db.query(
      `insert into evidence_media (master_batch_id, batch_activity_id, requirement_id,
                                   requirement_key, storage_path, media_kind, uploaded_by)
       values ($1, $2, $3, $4, $5, 'photo', $6)`,
      [r.master_batch_id, activityId, r.req_id, r.key, r.path, r.uploader]
    );
  }
}

/**
 * A batch that is actually running: H0 set, every row assigned, every destination chosen, then
 * activated. `validate_batch` refuses activation while any blocking finding stands, so this is the
 * shortest HONEST path to an active batch rather than a way around the checks — the blocking set is
 * asserted empty before `activate_batch` is called, so a batch that could not really run fails the
 * suite instead of being forced through.
 *
 * Lives here rather than in one suite because `tests/gates.test.ts` and
 * `tests/recordedActuals.test.ts` both need it, and two copies of "what makes a batch activatable"
 * would drift the moment `validate_batch` gains a check.
 */
export async function createActiveBatch(
  db: Db,
  opts: { restHours?: number; startDate?: string; startAt?: string | null } = {}
): Promise<string> {
  // The zone is pinned for the transaction so a planned instant is reproducible whatever the
  // deployed `factory_clock` says. TBD-50 is closed (Asia/Kolkata) and this is rolled back, so it
  // asserts nothing about the factory — it only keeps the arithmetic in these proofs stable.
  await db.query(`update factory_clock set timezone = 'UTC' where id = 1`);

  const batch = await createDraftBatch(db, {
    restHours: opts.restHours,
    startDate: opts.startDate,
    startAt: opts.startAt,
  });

  const person = await one<{ id: string }>(
    db,
    `select id from profiles where is_active order by created_at nulls last limit 1`
  );
  await db.query(
    `update batch_activity set assigned_person_id = $2
      where master_batch_id = $1 and not is_time_gate`,
    [batch, person.id]
  );

  // A destination for every movement that needs one, and a distinct vessel for a reload.
  await db.query(
    `update batch_activity ba
        set destination_location_id = pick.id
       from (select ba2.id as activity_id,
                    (select l.id from location l
                      where l.kind = mr.destination_kind
                      order by l.code
                      offset (ba2.instance_no - 1) % greatest(
                        (select count(*) from location l2 where l2.kind = mr.destination_kind), 1)
                      limit 1) as id
               from batch_activity ba2
               join movement_rule mr on mr.process_activity_id = ba2.process_activity_id
              where ba2.master_batch_id = $1 and mr.destination_kind is not null) as pick
      where ba.id = pick.activity_id and pick.id is not null`,
    [batch]
  );

  // T1 and T2 must be different turners — validate_batch blocks when they are the same, and the
  // seed deliberately leaves both blank because choosing them is the admin's decision.
  const turners = await all<{ id: string }>(
    db,
    `select id from machine where kind = 'TURNER' order by code`
  );
  if (turners.length >= 2) {
    await db.query(
      `update batch_activity set assigned_machine_id = $2 where master_batch_id = $1 and code = 'TR-T1'`,
      [batch, turners[0].id]
    );
    await db.query(
      `update batch_activity set assigned_machine_id = $2 where master_batch_id = $1 and code = 'TR-T2'`,
      [batch, turners[1].id]
    );
  }

  const blocking = await all<{ code: string; message: string }>(
    db,
    `select code, message from validate_batch($1) where severity = 'blocking'`,
    [batch]
  );
  expect(
    blocking.map((b) => `${b.code}: ${b.message}`),
    'the batch must be genuinely activatable, not force-activated'
  ).toEqual([]);

  await db.query(`select public.activate_batch($1)`, [batch]);
  return batch;
}

/**
 * Assert a statement is REFUSED, and leave the transaction usable afterwards.
 *
 * Postgres aborts a transaction on any error, so a plain `expect(...).rejects` proves the refusal
 * and then makes every following query fail with "current transaction is aborted". That matters
 * here: "the server refused it" is only half the claim, and "and nothing was written" is the half
 * that needs a read. A savepoint gives both.
 *
 * Returns the error message so the caller can assert WHICH refusal it was. A refusal that says the
 * wrong thing is a refusal an operator cannot act on.
 */
export async function refuses(db: Db, sql: string, values?: unknown[]): Promise<string> {
  // A fixed name: re-declaring a savepoint is legal and shadows the previous one, and a generated
  // name would mean interpolating an identifier into SQL for no benefit.
  await db.query('savepoint refusal_probe');
  try {
    await db.query(sql, values);
  } catch (e) {
    await db.query('rollback to savepoint refusal_probe');
    return (e as Error).message;
  }
  await db.query('release savepoint refusal_probe');
  throw new Error(
    `expected this to be refused, but it succeeded: ${sql.trim().replace(/\s+/g, ' ').slice(0, 140)}`
  );
}
