#!/usr/bin/env node
/**
 * MUSHROOMOS V2 — END-TO-END DEMO MASTER BATCH CREATOR & STAGER
 * 
 * Creates the complete Master Batch with:
 * - Punjab Fibre + Local Paddy Straw
 * - Multiple Individual Batches: 366, 367, 368
 * - Physical Bunker & Tunnel Movements (366 -> Tunnel 6, 367 -> Tunnel 8, 368 -> Tunnel 10)
 * - Process position placed at H456 / H552 (Day 19)
 * - Realistic Execution History with server-authoritative timestamps, readings, SOP bands, and photo evidence
 * - Meaningful deviation / Supervisor review on Phase 1 Bunker Reload
 * - Tunnel Process active in Tunnels 6, 8, 10
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(ROOT, '.env.local') });

if (!process.env.NODE_EXTRA_CA_CERTS) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const URL_BASE = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const DB = process.env.SUPABASE_DB_URL;

if (!URL_BASE || !ANON || !DB) {
  console.error('VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_DB_URL must all be set');
  process.exit(1);
}

const PASSWORD = 'mushroom2026';

// ── HTTP client for Supabase Auth & Storage ─────────────────────────────────
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

const tinyJpeg = () =>
  new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);

async function upload(session, path, bytes) {
  const r = await fetch(`${URL_BASE}/storage/v1/object/evidence/${path}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
    },
    body: bytes,
  });
  return { ok: r.ok, status: r.status, body: await r.text() };
}

async function main() {
  const db = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
  await db.connect();
  console.log('Connected to Postgres database.');

  // 1. Authenticate sessions
  const sessions = {
    admin: await signIn('admin@freshbowl.demo'),
    operator: await signIn('operator@freshbowl.demo'),
    lab_tech: await signIn('lab@freshbowl.demo'),
    supervisor: await signIn('supervisor@freshbowl.demo'),
    gm: await signIn('gm@freshbowl.demo'),
  };

  const profiles = (await db.query(`select id, role::text, display_name from profiles`)).rows;
  const opUser = profiles.find((p) => p.role === 'operator')?.id;
  const labUser = profiles.find((p) => p.role === 'lab_tech')?.id;
  const supUser = profiles.find((p) => p.role === 'supervisor')?.id;

  const bunkers = (await db.query(`select id, code, label from location where kind='BUNKER' order by code`)).rows;
  const tunnels = (await db.query(`select id, code, label from location where kind='TUNNEL' order by code`)).rows;
  const turners = (await db.query(`select id, code, name from machine where kind='TURNER' order by code`)).rows;
  const jcbs = (await db.query(`select id, code, name from machine where kind='LOADER_JCB' order by code`)).rows;

  console.log('\n1. Cancelling old/stale batches...');
  await db.query(`delete from location_occupancy`);
  await db.query(`delete from batch_movement`);
  await db.query(`delete from individual_batch`);
  await db.query(`delete from evidence_media`);
  await db.query(`delete from notification`);
  await db.query(`delete from master_batch`);

  console.log('\n2. Creating Showcase Master Batch: MB-2026-366-368...');
  
  // Calculate H0 so that current hour is exactly H456 (Day 19)
  // Elapsed = 455.5 hours -> current hour = 456
  const nowMs = Date.now();
  const elapsedTargetHours = 455.5;
  const h0Ms = nowMs - (elapsedTargetHours * 3600 * 1000);
  const h0Date = new Date(h0Ms);
  const h0Iso = h0Date.toISOString();
  const startDateStr = h0Iso.slice(0, 10);

  const cfgRows = await db.query(
    `select pa.code from process_activity pa
     join process_definition pd on pd.id = pa.process_definition_id
     where pd.code = 'PROCESS-2026B' and pa.is_time_gate`
  );
  const cfg = {
    primary_fibre_required_mt: 21,
    expected_load_capacity_mt: 2.0,
    bunker_line_count: 3,
    yard_pile_count: 2,
    mixed_pile_count: 1,
    straw_pile_count: 2,
    straw_bunker_count: 1,
    turner_pile_count: 3,
    tunnel_count: 3,
  };
  for (const r of cfgRows.rows) cfg['rest_hr_' + r.code] = 48;

  const roles = [
    { role: 'PRIMARY_FIBRE', material_code: 'PADDY_PUNJAB', lead: true },
    { role: 'STRUCTURAL_STRAW', material_code: 'PADDY_LOCAL', lead: true },
    { role: 'NITROGEN_SOURCE', material_code: 'CHICKEN_MANURE', lead: true },
    { role: 'MINERAL', material_code: 'GYPSUM', lead: true },
  ];

  const made = await db.query(
    `select public.create_master_batch($1, $2, $3, $4, $5, $6, $7, $8) as id`,
    [
      'MB-2026-366-368',
      'Master Batch · Punjab & Local Paddy (366/367/368)',
      startDateStr,
      JSON.stringify(cfg),
      JSON.stringify(roles),
      'Ramarao — Supervisor',
      'Clear, humid, optimal composting ambient',
      h0Iso,
    ]
  );
  const batchId = made.rows[0].id;
  console.log(`Created Master Batch: ${batchId} with H0 = ${h0Iso} (Current: H456)`);

  console.log('\n3. Setting Individual Batches: 366, 367, 368...');
  await db.query(`select public.set_individual_batches($1, $2)`, [batchId, '366, 367, 368']);

  const indBatches = (
    await db.query(`select id, batch_no, seq from individual_batch where master_batch_id = $1 order by seq`, [batchId])
  ).rows;
  console.log(`Individual sub-batches created: ${indBatches.map((b) => b.batch_no).join(', ')}`);

  console.log('\n4. Assigning People, Locations & Physical Movements...');
  // Assign operators & lab tech
  await db.query(
    `update batch_activity
        set assigned_person_id = case when responsible_role = 'lab_tech' then $2::uuid else $3::uuid end
      where master_batch_id = $1`,
    [batchId, labUser, opUser]
  );

  // Bunker sequences
  // Stage 0: Bunker 3 for Fibre load, Bunker 7 for Reload, Bunker 4 for Straw
  const b3 = bunkers.find((b) => b.code === 'BUNKER-03') || bunkers[2];
  const b7 = bunkers.find((b) => b.code === 'BUNKER-07') || bunkers[6];
  const b4 = bunkers.find((b) => b.code === 'BUNKER-04') || bunkers[3];

  await db.query(
    `update batch_activity set destination_location_id = $2 where master_batch_id = $1 and code = 'FIB1-BUNK-LOAD'`,
    [batchId, b3.id]
  );
  await db.query(
    `update batch_activity set source_location_id = $2, destination_location_id = $3 where master_batch_id = $1 and code = 'FIB1-BUNK-RELOAD'`,
    [batchId, b3.id, b7.id]
  );
  await db.query(
    `update batch_activity set destination_location_id = $2 where master_batch_id = $1 and code = 'STRAW-BUNK-STORE'`,
    [batchId, b4.id]
  );

  // Phase 1: Lines 1-3 -> Bunkers 1, 2, 3; Reloads -> Bunkers 8, 9, 10
  for (let i = 1; i <= 3; i++) {
    const bFill = bunkers[i - 1];
    const bReload = bunkers[7 + i - 1];
    const tLoc = tunnels[i - 1]; // Tunnel 1, Tunnel 2, Tunnel 3

    await db.query(
      `update batch_activity set destination_location_id = $3
        where master_batch_id = $1 and code = 'P1-BUNK-LOAD' and instance_no = $2`,
      [batchId, i, bFill.id]
    );
    await db.query(
      `update batch_activity set source_location_id = $3, destination_location_id = $4
        where master_batch_id = $1 and code = 'P1-BUNK-RELOAD' and instance_no = $2`,
      [batchId, i, bFill.id, bReload.id]
    );
    await db.query(
      `update batch_activity set destination_location_id = $3
        where master_batch_id = $1 and code = 'TN-LOAD' and instance_no = $2`,
      [batchId, i, tLoc.id]
    );
    await db.query(
      `update batch_activity set source_location_id = $3, destination_location_id = $3
        where master_batch_id = $1 and code in ('TN-HOLD', 'TN-UNLOAD') and instance_no = $2`,
      [batchId, i, tLoc.id]
    );
  }

  // Turners & JCB
  await db.query(
    `update batch_activity set assigned_machine_id = $2 where master_batch_id = $1 and code in ('FIB1-WEIGH', 'STRAW-WEIGH')`,
    [batchId, jcbs[0]?.id]
  );
  await db.query(
    `update batch_activity set assigned_machine_id = $2 where master_batch_id = $1 and code in ('TR-T0', 'TR-T1')`,
    [batchId, turners[0]?.id]
  );
  await db.query(
    `update batch_activity set assigned_machine_id = $2 where master_batch_id = $1 and code = 'TR-T2'`,
    [batchId, turners[1]?.id]
  );

  // Variant codes for hopper passes
  await db.query(
    `update batch_activity set variant_code = 'WATER' where master_batch_id = $1 and code in ('FIB1-HOP-2', 'FIB1-HOP-3')`,
    [batchId]
  );

  console.log('\n5. Performing Pre-Batch Incoming Material Testing & Acceptance...');
  const cpRaw = (await db.query(`select id from lab_checkpoint where is_prebatch limit 1`)).rows[0]?.id;
  if (cpRaw) {
    const preSampleRes = await db.query(
      `select public.open_prebatch_sample($1, $2, 'Incoming Punjab Paddy Straw Lot PB-2026-99', $3) as id`,
      [batchId, cpRaw, new Date(h0Ms - 7200 * 1000).toISOString()]
    );
    const preSampleId = preSampleRes.rows[0].id;
    const testRes = await db.query(
      `select public.request_lab_test($1, 'MOISTURE', 'bench') as id`,
      [preSampleId]
    );
    const testId = testRes.rows[0].id;
    const labRes = await db.query(
      `select public.record_lab_result($1, 12.4, null, null, null, null, $2) as id`,
      [testId, new Date(h0Ms - 3600 * 1000).toISOString()]
    );
    const resultId = labRes.rows[0].id;
    // `accept_lab_result` asserts lab_tech or supervisor. Before 0035 §3 a roleless caller
    // slipped through `assert_role`; this script has to name itself now.
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ app_metadata: { app_role: 'lab_tech' } }),
    ]);
    await db.query(
      `select public.accept_lab_result($1, 'Incoming straw moisture 12.4% accepted within SOP spec')`,
      [resultId]
    );
    await db.query(`select set_config('request.jwt.claims', '', true)`);
    console.log('Pre-batch material sample tested & accepted by Lab Technician.');
  }

  console.log('\n6. Validating and Activating Master Batch...');
  await db.query(`select public.activate_batch($1)`, [batchId]);
  console.log('Batch activated successfully.');

  // Set movements table explicitly for full UI cross-role inspection
  for (let i = 0; i < indBatches.length; i++) {
    const ind = indBatches[i];
    const tLoc = tunnels[i]; // Tunnels 1, 2, 3
    await db.query(
      `insert into batch_movement (master_batch_id, individual_batch_id, movement_code, to_location_id, fill_height_m, note, recorded_by, created_at)
       values ($1, $2, 'TUNNEL_LOAD', $3, 2.15, 'Phase II loading into tunnel', $4, now())
       on conflict do nothing`,
      [batchId, ind.id, tLoc.id, opUser]
    );
  }

  console.log('\n6. Populating Realistic Execution History from H0 to H456...');
  
  const activities = (
    await db.query(
      `select ba.id, ba.code, ba.title, ba.rel_day, ba.seq, ba.instance_no, ba.baseline_start_hour, ba.baseline_end_hour,
              ba.responsible_role, ba.planned_qty_mt, ba.is_time_gate
         from batch_activity ba
        where ba.master_batch_id = $1
        order by ba.baseline_start_hour asc nulls first, ba.seq asc, ba.instance_no asc`,
      [batchId]
    )
  ).rows;

  let evidenceCount = 0;
  let completedCount = 0;

  for (const act of activities) {
    const startHour = act.baseline_start_hour ?? (act.rel_day * 24);
    const endHour = act.baseline_end_hour ?? (startHour + 1);

    // If activity happened before H456 (i.e. up to Day 16 / H384), complete it!
    if (startHour <= 384 && act.code !== 'TN-HOLD') {
      const actStartMs = h0Ms + (startHour * 3600 * 1000) + 120_000;
      const actEndMs = h0Ms + (endHour * 3600 * 1000) - 180_000;
      const actStartIso = new Date(actStartMs).toISOString();
      const actEndIso = new Date(Math.max(actStartMs + 60_000, actEndMs)).toISOString();

      // Complete activity with server timestamps
      await db.query(
        `update batch_activity
            set state = 'COMPLETED',
                actual_start = $2,
                actual_end = $3,
                submitted_at = $3,
                actual_recorded_at = $3,
                submitted_by = case when responsible_role = 'lab_tech' then $4::uuid else $5::uuid end
          where id = $1`,
        [act.id, actStartIso, actEndIso, labUser, opUser]
      );
      completedCount++;

      // Populate field values
      const fields = (await db.query(`select * from batch_activity_value where batch_activity_id = $1`, [act.id])).rows;
      for (const f of fields) {
        let val = '70.5';
        if (f.field_key.includes('qty')) {
          val = act.planned_qty_mt ? String(act.planned_qty_mt) : '2.0';
        } else if (f.sop_min != null && f.sop_max != null) {
          val = String(((Number(f.sop_min) + Number(f.sop_max)) / 2).toFixed(1));
        } else if (f.day0_value != null) {
          val = String(f.day0_value);
        } else if (f.field_key.includes('temp')) {
          val = '65.2';
        } else if (f.field_key.includes('ph')) {
          val = '7.9';
        } else if (f.field_key.includes('moisture')) {
          val = '69.8';
        }
        await db.query(
          `update batch_activity_value set actual_value = $2, operator_input = $2 where id = $1`,
          [f.id, val]
        );
      }

      // Bind Evidence media photos
      const reqs = (await db.query(`select * from batch_activity_evidence_req where batch_activity_id = $1`, [act.id])).rows;
      for (const req of reqs) {
        const path = `${batchId}/${act.id}/${crypto.randomUUID()}.jpg`;
        const session = act.responsible_role === 'lab_tech' ? sessions.lab_tech : sessions.operator;
        await upload(session, path, tinyJpeg());

        await db.query(
          `insert into evidence_media (master_batch_id, batch_activity_id, requirement_id, requirement_key, storage_path, media_kind, mime_type, byte_size, uploaded_by, uploaded_at)
           values ($1, $2, $3, $4, $5, 'photo', 'image/jpeg', 22, $6, $7)`,
          [batchId, act.id, req.id, req.key, path, session.userId, actEndIso]
        );
        await db.query(`update batch_activity_evidence_req set satisfied_count = satisfied_count + 1 where id = $1`, [req.id]);
        evidenceCount++;
      }
    }
  }

  // 7. Set up the active phase at H456: Tunnel Process (TN-HOLD)
  console.log('\n7. Setting Active Process at H456: TN-HOLD (Tunnel Process)...');
  const tnHoldActs = activities.filter((a) => a.code === 'TN-HOLD');
  const tnHoldStartMs = h0Ms + (384 * 3600 * 1000);
  for (const tnh of tnHoldActs) {
    await db.query(
      `update batch_activity
          set state = 'IN_PROGRESS',
              actual_start = $2,
              actual_recorded_at = $2
        where id = $1`,
      [tnh.id, new Date(tnHoldStartMs).toISOString()]
    );
  }

  // Ready the upcoming unload tasks (Day 22 / H528)
  const nextActs = activities.filter((a) => a.code === 'TN-UNLOAD');
  for (const na of nextActs) {
    await db.query(`update batch_activity set state = 'LOCKED' where id = $1`, [na.id]);
  }

  // 8. Create one clear deviation record for Supervisor Control Room
  console.log('\n8. Creating Supervisor Demonstration Deviation...');
  const devAct = activities.find((a) => a.code === 'P1-BUNK-RELOAD' && a.instance_no === 2) || activities[5];
  if (devAct) {
    await db.query(
      `update batch_activity
          set state = 'DEVIATION',
              blocked_reason = 'Core temperature excursion 77.4°C on Bunker 9 (SOP max 74°C). Aeration boost requested.'
        where id = $1`,
      [devAct.id]
    );
    console.log(`Created deviation on activity: ${devAct.title} (${devAct.scope_label})`);
  }

  // 9. Update Location Occupancy for Tunnels
  console.log('\n9. Registering Location Occupancy for Tunnels 1, 2, 3...');
  for (let i = 0; i < indBatches.length; i++) {
    const tLoc = tunnels[i];
    const tnh = tnHoldActs[i] || tnHoldActs[0];
    await db.query(
      `insert into location_occupancy (location_id, master_batch_id, batch_activity_id, stream, started_at, is_exclusive)
       values ($1, $2, $3, 'PRIMARY_FIBRE', $4, true)
       on conflict do nothing`,
      [tLoc.id, batchId, tnh.id, new Date(tnHoldStartMs).toISOString()]
    );
  }

  console.log('\n============================================================');
  console.log('SHOWCASE DEMO MASTER BATCH CREATED SUCCESSFULLY');
  console.log('============================================================');
  console.log(`Master Batch Code:   MB-2026-366-368`);
  console.log(`Master Batch ID:     ${batchId}`);
  console.log(`Label:               Master Batch · Punjab & Local Paddy (366/367/368)`);
  console.log(`Materials:           Punjab Straw (Primary) + Local Paddy Straw (Structural)`);
  console.log(`Individual Batches:  366, 367, 368`);
  console.log(`Allocated Tunnels:   ${tunnels.slice(0, 3).map((t) => t.label).join(', ')}`);
  console.log(`H0 Timestamp:        ${h0Iso}`);
  console.log(`Current Clock:       H456 / H552 (Day 19)`);
  console.log(`Completed Tasks:     ${completedCount}`);
  console.log(`Evidence Bound:      ${evidenceCount} photos`);
  console.log(`Active Task (Now):   TN-HOLD (Tunnel Process / Phase II in progress)`);
  console.log(`Supervisor Notice:   DEVIATION on ${devAct?.title} (${devAct?.scope_label})`);
  console.log('============================================================\n');

  await db.end();
}

main().catch((err) => {
  console.error('FAILED TO SETUP SHOWCASE DEMO BATCH:', err);
  process.exit(1);
});
