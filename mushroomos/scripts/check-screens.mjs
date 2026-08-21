#!/usr/bin/env node
/**
 * Runs the EXACT PostgREST queries the new demo screens issue, through a real user session.
 *
 * The acceptance script proves the engine. This proves the screens have something to draw:
 * a panel that renders an empty state because its embed name is wrong still typechecks and
 * still builds, and you only find out with a projector on.
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local') });
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

let failures = 0;

async function signIn(email) {
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'mushroom2026' }),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(b.error_description ?? b.msg ?? `sign-in ${r.status}`);
  return b.access_token;
}

async function q(token, path) {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });
  const body = await r.json();
  return { status: r.status, body };
}

function report(label, ok, detail) {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(42)} ${detail}`);
}

const admin = await signIn('admin@freshbowl.demo');
const operator = await signIn('operator@freshbowl.demo');

// ── the batch the demo runs on ────────────────────────────────────────────────
const mb = await q(admin, 'master_batch?select=id,code,label,status,start_date&status=eq.active');
const batch = Array.isArray(mb.body) ? mb.body[0] : null;
if (!batch) {
  console.log('\nNo active batch. Run: npm run demo:prep\n');
  process.exit(1);
}

console.log(`\nSCREEN DATA · ${batch.code} (${batch.label})\n`);

// ── Batch Detail · MovementMap ────────────────────────────────────────────────
const mv = await q(
  admin,
  'batch_activity?select=code,title,scope_label,rel_day,seq,instance_no,state,' +
    'source:location!batch_activity_source_location_id_fkey(label),' +
    'destination:location!batch_activity_destination_location_id_fkey(label),' +
    'machine:machine!batch_activity_assigned_machine_id_fkey(code)' +
    `&master_batch_id=eq.${batch.id}&destination_location_id=not.is.null&order=seq,instance_no`
);
const moves = Array.isArray(mv.body) ? mv.body : [];
report(
  'MovementMap embeds resolve',
  mv.status === 200,
  mv.status === 200 ? `${moves.length} moves` : JSON.stringify(mv.body)
);
const named = moves.filter((m) => m.destination?.label);
report(
  'MovementMap destinations are labelled',
  moves.length === 0 || named.length === moves.length,
  moves.length === 0
    ? 'no vessels chosen yet — empty state is correct'
    : `${named[0]?.source?.label ?? 'Yard'} -> ${named[0]?.machine?.code ?? 'n/a'} -> ${named[0]?.destination?.label}`
);

// ── Batch Detail · EvidenceSummary ────────────────────────────────────────────
const ev = await q(
  admin,
  'batch_activity_evidence_req?select=id,label,min_count,satisfied_count,gates_submission,' +
    'batch_activity!inner(title,scope_label,rel_day,state,master_batch_id)' +
    `&batch_activity.master_batch_id=eq.${batch.id}&order=ordering`
);
const reqs = Array.isArray(ev.body) ? ev.body : [];
const done = reqs.filter((r) => r.satisfied_count >= r.min_count).length;
report(
  'EvidenceSummary inner join resolves',
  ev.status === 200 && reqs.length > 0,
  ev.status === 200 ? `${done} / ${reqs.length} complete` : JSON.stringify(ev.body)
);
report(
  'evidence requirements are named',
  reqs.every((r) => typeof r.label === 'string' && r.label.length > 3),
  reqs.length ? `e.g. "${reqs[0].label}"` : 'none'
);
report(
  'some requirement gates submission',
  reqs.some((r) => r.gates_submission),
  `${reqs.filter((r) => r.gates_submission).length} gating`
);

// ── admin questions and day spans ─────────────────────────────────────────────
// Scoped to the PUBLISHED definition. ROUTE-2026A is archived and deliberately unedited —
// it exists to prove a superseded route stays readable, not to be maintained.
const aq = await q(
  admin,
  'process_activity?select=code,admin_question,day_span_label,' +
    'process_definition!inner(code,status)&process_definition.code=eq.PROCESS-2026B&limit=200'
);
const acts = Array.isArray(aq.body) ? aq.body : [];
const withQ = acts.filter((a) => a.admin_question);
report(
  'every activity has a plain-language question',
  acts.length > 0 && withQ.length === acts.length,
  `${withQ.length} / ${acts.length}`
);
report(
  'day-span labels seeded for rests',
  acts.some((a) => a.day_span_label),
  `${acts.filter((a) => a.day_span_label).length} labelled`
);

// ── Operator · My Work ────────────────────────────────────────────────────────
const mw = await q(
  operator,
  'batch_activity?select=id,code,title,scope_label,rel_day,state,blocked_reason,unblocks_at,' +
    'planned_qty_mt,day0_duration_hr,duration_target_min_hr,duration_target_max_hr,tbd_marker,' +
    'golden_rule,master_batch_id,master_batch!inner(code,label,status,start_date)' +
    '&state=in.(READY,IN_PROGRESS,RETURNED,DEVIATION,WAITING_TIME,BLOCKED)&order=rel_day,seq'
);
const work = Array.isArray(mw.body) ? mw.body : [];
report(
  'My Work returns open tasks for operator',
  mw.status === 200 && work.length > 0,
  mw.status === 200 ? `${work.length} open` : JSON.stringify(mw.body)
);
report(
  'every card knows its scope',
  work.every((w) => w.scope_label),
  work.length ? `e.g. "${work[0].scope_label}"` : 'none'
);

const weigh = await q(
  operator,
  'batch_activity?select=code,state,planned_qty_mt,master_batch_id,master_batch!inner(status)' +
    '&master_batch.status=eq.active&code=eq.FIB1-WEIGH'
);
const loads = Array.isArray(weigh.body) ? weigh.body : [];
const targetMt = loads.reduce((s, l) => s + Number(l.planned_qty_mt ?? 0), 0);
report(
  'weighment loads derive a target',
  loads.length > 0 && targetMt > 0,
  `${loads.length} loads · ${targetMt.toFixed(1)} MT`
);

// ── TaskDrawer · the exact embed set ──────────────────────────────────────────
const first = work.find((w) => w.state === 'READY') ?? work[0];
const td = await q(
  operator,
  'batch_activity?select=id,code,title,scope_label,rel_day,state,blocked_reason,golden_rule,' +
    'tbd_marker,planned_qty_mt,day0_duration_hr,duration_target_min_hr,duration_target_max_hr,' +
    'actual_start,unblocks_at,master_batch_id,variant_code,assigned_machine_id,' +
    'source_location_id,destination_location_id,' +
    'source:location!batch_activity_source_location_id_fkey(label),' +
    'destination:location!batch_activity_destination_location_id_fkey(label),' +
    'machine:machine!batch_activity_assigned_machine_id_fkey(code),' +
    `process_activity(admin_question)&id=eq.${first.id}`
);
const detail = Array.isArray(td.body) ? td.body[0] : null;
report(
  'TaskDrawer embeds resolve',
  td.status === 200 && !!detail,
  td.status === 200 ? `${detail?.code} · ${detail?.state}` : JSON.stringify(td.body)
);
report(
  'TaskDrawer shows the admin question',
  !!detail?.process_activity,
  detail?.process_activity
    ? `"${String(
        Array.isArray(detail.process_activity)
          ? detail.process_activity[0]?.admin_question
          : detail.process_activity.admin_question
      ).slice(0, 52)}…"`
    : 'missing embed'
);

// ── the rest gate, as the screen sees it ──────────────────────────────────────
const rests = await q(
  admin,
  'batch_activity?select=code,scope_label,state,day0_duration_hr,unblocks_at&' +
    `master_batch_id=eq.${batch.id}&state=in.(WAITING_TIME,LOCKED)&day0_duration_hr=not.is.null&order=seq`
);
const restRows = Array.isArray(rests.body) ? rests.body : [];
const waiting = restRows.filter((r) => r.state === 'WAITING_TIME');
report(
  'rests carry a Day-0 duration',
  restRows.length > 0,
  `${restRows.length} timed activities`
);
const unstamped = waiting.filter((r) => !r.unblocks_at);
report(
  'every resting activity has a server unblocks_at',
  unstamped.length === 0,
  waiting.length === 0
    ? 'nothing resting yet — correct before Day 0 completes'
    : `${waiting.length} resting, ${unstamped.length} with no clock`
);

// ── deviation reason is human-readable where present ──────────────────────────
const dev = await q(
  admin,
  `batch_activity?select=code,scope_label,state,blocked_reason&master_batch_id=eq.${batch.id}` +
    '&blocked_reason=not.is.null&limit=3'
);
const devRows = Array.isArray(dev.body) ? dev.body : [];
report(
  'blocked reasons are sentences, not codes',
  devRows.every((r) => String(r.blocked_reason).includes(' ')),
  devRows.length ? `"${String(devRows[0].blocked_reason).slice(0, 60)}…"` : 'none blocked yet'
);

console.log(
  failures === 0
    ? '\nALL SCREEN QUERIES RETURN DRAWABLE DATA\n'
    : `\n${failures} SCREEN QUER${failures === 1 ? 'Y' : 'IES'} WOULD RENDER EMPTY\n`
);
process.exit(failures === 0 ? 0 : 1);
