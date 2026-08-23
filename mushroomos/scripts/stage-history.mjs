#!/usr/bin/env node
/**
 * Stage work history on the demo batches — THROUGH THE REAL RPCs, OVER HTTP, AS REAL PEOPLE.
 *
 * Every state this produces is a state the engine produced. There is not one `insert into
 * batch_activity`, not one `update ... set state`, and not one row written as `postgres`. It signs in
 * as the seeded demo accounts, so `submitted_by`, `actual_recorded_by` and `uploaded_by` name real
 * profiles and the audit trail reads as work rather than as a fixture.
 *
 *   evidence   upload the bytes, then `bind_evidence`            — the A4 path, in that order
 *   actuals    `submit_activity` with p_actual_start/p_actual_end — the ACTUALS path
 *   gates      whatever `advance_batch` decides afterwards        — never touched directly
 *
 * WHAT IS STAGED AND WHAT IS RECORDED AS STAGED. The timestamps are transcribed from each activity's
 * own plan, so the actuals sit where the work was planned to happen rather than at `now()`. They are
 * still MY numbers, not the factory's, so every submission carries a remark saying so and the audit
 * event carries `stated_by_submitter: true`. The record says it was transcribed; nothing here
 * pretends these are field observations.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS CANNOT REACH DAY 8 OR DAY 16 TODAY, and why that is correct
 *
 * A rest gate's clock starts when the gate is ENTERED, in server time:
 *
 *     unblocks_at = coalesce(ba.actual_start, now()) + day0_duration_hr     (0018, and 0012 before it)
 *
 * `actual_start` on a rest row is null until the gate opens, so it becomes `now()`. The rest window
 * therefore begins at the moment the predecessor is submitted — NOT at the predecessor's recorded
 * `actual_end`. Backdating the work does not backdate the rest.
 *
 * The rest gates between Day 0 and Day 15 on the fibre/pile path are 48 + 24 + 16 + 10 + 48 + 48 =
 * 194 hours. Reaching Day 15 through the real path needs 194 hours of wall clock, and no parameter
 * shortens it: the server clock is the authority, which is exactly what `0008` was built to guarantee
 * and what `demoBatches.test.ts` asserts a phone set forward cannot bypass.
 *
 * So this walks each batch as deep as the engine allows TODAY and stops where the engine stops it,
 * with the engine's own stated reason. See docs/REPORTS/STAGING.md §3 for the wall and the open
 * question it raises.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   node scripts/stage-history.mjs --dry-run     report the plan, write nothing
 *   node scripts/stage-history.mjs               execute
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(ROOT, '.env.local') });

// This machine's network intercepts TLS with a root Node does not trust. Same posture scripts/db.mjs
// has always used for Postgres, applied to the HTTP half. Not a shipped code path.
if (!process.env.NODE_EXTRA_CA_CERTS) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const URL_BASE = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const DB = process.env.SUPABASE_DB_URL;
if (!URL_BASE || !ANON || !DB) {
  console.error('VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_DB_URL must all be set');
  process.exit(1);
}

const DRY = process.argv.includes('--dry-run');
const PASSWORD = 'mushroom2026';

// ─────────────────────────────────────────────────────────────────────────────
// HTTP — the same endpoints the browser uses
// ─────────────────────────────────────────────────────────────────────────────

async function signIn(email) {
  const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const b = await r.json();
  if (!r.ok || !b.access_token) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(b)}`);
  return { email, token: b.access_token, userId: b.user.id };
}

const head = (s, extra = {}) => ({ apikey: ANON, Authorization: `Bearer ${s.token}`, ...extra });

async function rpc(s, fn, args) {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: head(s, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(args),
  });
  const text = await r.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: r.ok, status: r.status, body };
}

async function upload(s, path, bytes) {
  const r = await fetch(`${URL_BASE}/storage/v1/object/evidence/${path}`, {
    method: 'POST',
    headers: head(s, { 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }),
    body: bytes,
  });
  return { ok: r.ok, status: r.status, body: await r.text() };
}

/** The smallest thing that is genuinely a JPEG: SOI, a minimal JFIF APP0, EOI. Real bytes. */
const tinyJpeg = () =>
  new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);

// ─────────────────────────────────────────────────────────────────────────────
// Reads go through pg. It observes; it never stands in for a client.
// ─────────────────────────────────────────────────────────────────────────────

const db = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });

const all = async (sql, v) => (await db.query(sql, v)).rows;

// ─────────────────────────────────────────────────────────────────────────────
// The plan. How deep each batch is walked, and what is deliberately left undone.
// ─────────────────────────────────────────────────────────────────────────────

const PLAN = [
  {
    code: 'MB-DEMO-LATE',
    // As deep as the engine permits. It will stall at the first rest gate it enters and at TN-LOAD's
    // GM approval; both stalls are the point, not a failure.
    maxDay: 15,
    // Minutes added to every planned instant, so variance is real and non-zero. Deterministic, so
    // B4's contributors are hand-checkable.
    lateBy: (seq) => (seq % 7) * 11,
    deviation: null,
    holdOnEvidence: null,
  },
  {
    code: 'MB-DEMO-MID',
    maxDay: 1,
    lateBy: (seq) => (seq % 5) * 6,
    deviation: null,
    holdOnEvidence: null,
  },
  {
    code: 'MB-DEMO-EARLY',
    maxDay: 0,
    lateBy: () => 0,
    // DEMO_SPRINT_ORDER §0.3 — one load at 3.6 MT against a 2.0 MT target. `submit_activity` sees
    // 80% over and raises a deviation; B2's `deviation` row and the BLOCKED successor follow from
    // that, and are LEFT OPEN so the Control Room has a real decision to make.
    deviation: { instance: 7, qty: '3.6' },
    // One load submitted with its evidence deliberately NOT captured. `submit_activity` records the
    // reading and holds at IN_PROGRESS naming the outstanding requirement — a correct engine outcome,
    // shown rather than worked around.
    holdOnEvidence: 9,
  },
];

// ─────────────────────────────────────────────────────────────────────────────

const log = [];
const note = (line) => {
  log.push(line);
  console.log(line);
};

/**
 * A value with a STATED expectation behind it, or nothing.
 *
 * In order: the Day-0 target for the field · the midpoint of the SOP band · whichever bound exists ·
 * for a quantity field, the activity's own `planned_qty_mt`.
 *
 * That last one is not a guess. `submit_activity` measures a `%qty%` field against
 * `ba.planned_qty_mt` when the field states no target of its own, so the planned load quantity IS the
 * expectation for it — and without it the eleven weighment loads submit with no quantity at all and
 * the running total reads zero against a 21 MT target.
 *
 * Where none of those exists the field has no stated expectation and NOTHING is recorded for it. A
 * number with nothing behind it would be invented.
 */
function valueFor(v, activity) {
  if (v.day0_value != null && /^-?\d+(\.\d+)?$/.test(String(v.day0_value))) return String(v.day0_value);
  if (v.sop_min != null && v.sop_max != null) {
    return String(Math.round(((Number(v.sop_min) + Number(v.sop_max)) / 2) * 100) / 100);
  }
  if (v.sop_min != null) return String(v.sop_min);
  if (v.sop_max != null) return String(v.sop_max);
  if (/qty/.test(v.field_key) && activity.planned_qty_mt != null) return String(activity.planned_qty_mt);
  return null;
}

const iso = (d) => new Date(d).toISOString();

async function main() {
  await db.connect();
  console.log(`connected · ${new globalThis.URL(DB).host}${DRY ? '  (DRY RUN — nothing is written)' : ''}\n`);

  const sessions = {
    operator: await signIn('operator@freshbowl.demo'),
    lab_tech: await signIn('lab@freshbowl.demo'),
    supervisor: await signIn('supervisor@freshbowl.demo'),
  };
  const byProfile = new Map(
    (
      await all(`select id, role::text as role, display_name from profiles where is_active`)
    ).map((p) => [p.id, p])
  );

  let uploads = 0;
  let submits = 0;
  const stalls = [];

  for (const spec of PLAN) {
    const [batch] = await all(
      `select id, code, start_at from master_batch where code = $1 and status = 'active'`,
      [spec.code]
    );
    if (!batch) {
      note(`SKIP ${spec.code} — not an active batch`);
      continue;
    }
    note(`\n── ${batch.code} · H0 ${iso(batch.start_at)} · walking to Day ${spec.maxDay} ──`);

    const h0 = new Date(batch.start_at).getTime();
    let pass = 0;

    // Loop until a pass makes no progress. Each submit calls advance_batch server-side, which may
    // open work this pass has not seen.
    for (;;) {
      pass += 1;
      const ready = await all(
        `select ba.id, ba.code, ba.title, ba.rel_day, ba.seq, ba.instance_no, ba.scope_label,
                ba.state::text as state, ba.assigned_person_id, ba.planned_start_at, ba.planned_end_at,
                ba.planned_qty_mt
           from batch_activity ba
          where ba.master_batch_id = $1 and ba.state in ('READY','RETURNED')
            and ba.rel_day <= $2
          order by ba.seq, ba.instance_no`,
        [batch.id, spec.maxDay]
      );
      if (ready.length === 0) break;

      let progressed = 0;

      for (const a of ready) {
        const person = byProfile.get(a.assigned_person_id);
        const session = person ? sessions[person.role] : sessions.supervisor;
        if (!session) {
          stalls.push(`${batch.code} ${a.title} — no session for role ${person?.role}`);
          continue;
        }

        const isDeviation = spec.deviation && a.instance_no === spec.deviation.instance
          && a.planned_qty_mt != null;
        const isHold = spec.holdOnEvidence != null && a.instance_no === spec.holdOnEvidence
          && a.planned_qty_mt != null;

        // ── evidence, unless this one is the deliberate hold ──────────────────
        const reqs = await all(
          `select r.key, r.label, r.min_count, r.media_kinds,
                  (select count(*) from evidence_media m
                    where m.requirement_id = r.id and m.superseded_by_id is null)::int as live
             from batch_activity_evidence_req r
            where r.batch_activity_id = $1 and r.gates_submission
            order by r.ordering`,
          [a.id]
        );

        if (!isHold) {
          for (const req of reqs) {
            for (let i = req.live; i < req.min_count; i += 1) {
              const path = `${batch.id}/${a.id}/${crypto.randomUUID()}.jpg`;
              if (DRY) {
                uploads += 1;
                continue;
              }
              const up = await upload(session, path, tinyJpeg());
              if (!up.ok) {
                stalls.push(`${batch.code} ${a.title} — upload refused: ${up.body}`);
                break;
              }
              const bound = await rpc(session, 'bind_evidence', {
                p_activity: a.id,
                p_requirement_key: req.key,
                p_storage_path: path,
                p_media_kind: (req.media_kinds ?? ['photo'])[0],
              });
              if (!bound.ok) {
                stalls.push(`${batch.code} ${a.title} · ${req.key} — bind refused: ${JSON.stringify(bound.body)}`);
                break;
              }
              uploads += 1;
            }
          }
        }

        // ── the readings ──────────────────────────────────────────────────────
        // Every field this activity carries, in the order the screen shows them. The assigned person
        // is the one who records them — the lab technician for a LAB-* activity, the operator
        // otherwise — which is why the session is chosen from `assigned_person_id` above.
        //
        // `valueFor` is the filter that matters: it returns null where the field states neither an
        // SOP band nor a Day-0 target, and nothing is recorded for those. A number with no stated
        // expectation behind it would be invented.
        const fields = await all(
          `select field_key, label, unit, sop_min, sop_max, day0_value
             from batch_activity_value
            where batch_activity_id = $1
            order by display_order, field_key`,
          [a.id]
        );
        const values = {};
        for (const f of fields) {
          // THE OVERRIDE HITS THE ACTUAL FIELD ONLY. `FIB1-WEIGH` carries both `target_qty_mt`
          // ("Target quantity", which is the Day-0 plan shown to the operator) and `actual_qty_mt`.
          // A `/qty/` match wrote 3.6 into both, so the record claimed the TARGET was 3.6 against a
          // plan of 2.0 — a false statement about the plan — and 0017 correctly raised a deviation
          // for each. The overfilled load is an ACTUAL that missed its target; the target itself did
          // not move.
          const v =
            isDeviation && /^actual/.test(f.field_key) ? spec.deviation.qty : valueFor(f, a);
          if (v != null) values[f.field_key] = v;
        }

        // ── the actuals, transcribed from this activity's own plan ────────────
        const late = spec.lateBy(a.seq) * 60_000;
        let actualStart = null;
        let actualEnd = null;
        if (a.planned_start_at) {
          const s = Math.max(h0, new Date(a.planned_start_at).getTime() + late);
          if (s <= Date.now()) actualStart = iso(s);
        }
        if (a.planned_end_at) {
          const e = Math.max(h0, new Date(a.planned_end_at).getTime() + late);
          if (e <= Date.now()) actualEnd = iso(e);
        }

        // ── WHERE THE PLAN STATES NO END ──────────────────────────────────────
        // `FIB1-WEIGH` and the other unstated-duration activities have a null `planned_end_at`,
        // because the process definition states no duration for them — that is TBD-21's territory,
        // not an omission here.
        //
        // An end is unavoidable: `submit_activity` writes `coalesce(p_actual_end, actual_end, now())`,
        // so leaving it out stamps `now()`. For a load transcribed from 6 August that would claim a
        // sixteen-DAY weighment, and `duration_actual_min` is generated from the pair — a plausible
        // wrong number is worse than an obviously unmeasured one.
        //
        // So the end equals the start: `duration_actual_min` reads 0, which says "no span was
        // measured" rather than something false, and `variance_minutes` stays null because there is
        // no `planned_end_at` to measure against. THIS IS THE ONE PLACE STAGING HAD TO CHOOSE; it is
        // written into the remark on every affected row and reported in docs/REPORTS/STAGING.md §5.
        const endUnstated = actualStart != null && actualEnd == null;
        if (endUnstated) actualEnd = actualStart;

        const remark = isDeviation
          ? 'Overfilled — weighbridge slip confirms 3.6 MT. Staged history, transcribed from the plan.'
          : endUnstated
            ? 'Staged history — start transcribed from the plan. No duration is stated for this ' +
              'activity, so no span was recorded (TBD-21).'
            : "Staged history — actuals transcribed from this activity's own plan, not observed.";

        if (DRY) {
          submits += 1;
          note(
            `  would submit ${a.code} ${a.scope_label} · day ${a.rel_day} · ` +
              `${Object.keys(values).length} value(s) · ${reqs.length} req(s)` +
              `${actualStart ? ` · start ${actualStart.slice(0, 16)}` : ' · NO planned start'}` +
              `${actualEnd ? ` end ${actualEnd.slice(0, 16)}` : ' · NO planned end → server clock'}` +
              `${isDeviation ? '  ⚠ DEVIATION 3.6 MT' : ''}${isHold ? '  ⚠ HELD on evidence' : ''}`
          );
          progressed += 1;
          continue;
        }

        const r = await rpc(session, 'submit_activity', {
          p_activity: a.id,
          p_values: values,
          p_remarks: remark,
          p_actual_start: actualStart,
          p_actual_end: actualEnd,
        });
        if (!r.ok) {
          stalls.push(`${batch.code} ${a.title} (${a.scope_label}) — submit refused: ${JSON.stringify(r.body)}`);
          continue;
        }
        const row = Array.isArray(r.body) ? r.body[0] : r.body;
        submits += 1;
        progressed += 1;
        note(
          `  ${row.new_state.padEnd(12)} ${a.code} ${a.scope_label}` +
            `${row.out_of_range > 0 ? `  ⚠ ${row.out_of_range} out of range` : ''}` +
            `${row.outstanding_evidence ? `  ⏸ ${row.outstanding_evidence}` : ''}`
        );
      }

      // Ask the server whether any rest window has elapsed. It decides, from its own clock.
      if (!DRY) await rpc(sessions.supervisor, 'release_elapsed_rests', { p_batch: batch.id });

      // A DRY RUN IS ONE PASS, and it has to be. Nothing is submitted, so no gate opens and the same
      // READY rows come back next pass — counting them as progress spun this loop to its own limit and
      // reported 2050 submissions that never happened. A dry run can only honestly report the work
      // that is open RIGHT NOW; what `advance_batch` would open next is not knowable without asking it.
      if (DRY) {
        note(`  (dry run: one pass. What this opens next is up to advance_batch, which is not called.)`);
        break;
      }
      if (progressed === 0) break;
      if (pass > 60) {
        stalls.push(`${batch.code} — stopped after 60 passes, which should not happen`);
        break;
      }
    }

    // Where the engine stopped this batch, in its own words.
    const held = await all(
      `select ba.state::text as state, ba.code, ba.scope_label, ba.blocked_reason,
              ba.unblocks_at::text
         from batch_activity ba
        where ba.master_batch_id = $1
          and ba.state in ('WAITING_TIME','LOCKED','BLOCKED','DEVIATION','IN_PROGRESS')
          and ba.rel_day <= $2
        order by ba.seq, ba.instance_no limit 6`,
      [batch.id, spec.maxDay]
    );
    for (const h of held) {
      note(`  ⤷ ${h.state.padEnd(13)} ${h.code} ${h.scope_label} — ${h.blocked_reason ?? '—'}`);
    }
  }

  // ── what the board looks like now ──────────────────────────────────────────
  note('\n── the board ──');
  for (const r of await all(
    `select mb.code, ba.state::text as state, count(*)::int n
       from batch_activity ba join master_batch mb on mb.id = ba.master_batch_id
      where mb.code like 'MB-DEMO-%' group by 1,2 order by 1,2`
  )) {
    note(`  ${r.code.padEnd(14)} ${r.state.padEnd(13)} ${r.n}`);
  }
  for (const r of await all(
    `select mb.code,
            count(ba.actual_end)::int with_actuals,
            count(ba.variance_minutes)::int with_variance,
            coalesce(max(ba.variance_minutes), 0)::int worst_variance
       from batch_activity ba join master_batch mb on mb.id = ba.master_batch_id
      where mb.code like 'MB-DEMO-%' group by 1 order by 1`
  )) {
    note(
      `  ${r.code.padEnd(14)} actual ends ${String(r.with_actuals).padStart(3)} · variance rows ` +
        `${String(r.with_variance).padStart(3)} · worst ${r.worst_variance} min`
    );
  }
  note(`\n  evidence objects bound: ${uploads}   submissions: ${submits}`);

  if (stalls.length > 0) {
    note(`\n── where the engine refused (${stalls.length}) ──`);
    for (const s of [...new Set(stalls)].slice(0, 25)) note(`  ${s}`);
  }

  await db.end();
}

main().catch(async (e) => {
  console.error(`\nFAILED: ${e.message}`);
  await db.end().catch(() => {});
  process.exit(1);
});
