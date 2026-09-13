#!/usr/bin/env node
/**
 * gen-lab-2026a.mjs — lab_checkpoints.json + schedule.json → 0052_lab_2026a.sql
 *
 * LAB-2026A, as PROCESS-2026C actually runs it.
 *
 * 25 checkpoints · 4 gates · 1 decision · 20 records. The definitions come from
 * `docs/01-process/lab_checkpoints.json`; the HOURS come from `schedule.json`, because a
 * checkpoint's hour is a property of the process it sits in, not of the laboratory. The same
 * checkpoint set under a different process would sit on different hours, which is why the two
 * files are separate and why this generator joins them rather than either one carrying both.
 *
 * ── WHY LAB WORK BECOMES ACTIVITIES ─────────────────────────────────────────
 * `v_lab_queue` selects `batch_activity` rows whose `responsible_role` is `lab_tech`. The engine
 * already treats laboratory work as work: it has a state machine, evidence requirements, a
 * submission path, gates and an approval. Modelling checkpoints as a parallel structure beside all
 * of that would mean a second state machine, a second evidence path and a second approval — and
 * the brief is explicit that there must not be a second Lab application.
 *
 * So each checkpoint produces BOTH:
 *   · a `lab_checkpoint` row — the definition: parameters, evidence kinds, gate/record/decision
 *   · one or more `process_activity` rows — the work, on the hour axis, in the plan
 *
 * ── PARALLEL, AND THEREFORE WEIGHTLESS ──────────────────────────────────────
 * Every lab activity is `PARALLEL_NO_WALLCLOCK`. The laboratory runs alongside production and
 * contributes no wall clock to the envelope — `v_process_standard` excludes that class precisely
 * so adding forty-one lab activities cannot silently move PROCESS-2026C's 470-hour standard.
 * Asserted after seeding, not assumed.
 *
 * ── NO INVENTED DURATION ────────────────────────────────────────────────────
 * `standard_end_hour` is null on every one of them. `v_lab_queue` already says why:
 * "No source gives a lab turnaround time, so an overdue band cannot be computed without inventing
 * a duration." This generator does not invent one either.
 *
 * ── WHAT IS DEFINED BUT NOT PLANNED ─────────────────────────────────────────
 * `LAB-RLD2-UNL` and `LAB-RLD2-RE` — the second reload. Their own note says "Only where the
 * process runs a second reload." PROCESS-2026C runs ONE (STANDARD §4: fill → hold → unload/reload
 * → hold → tunnel load). They are seeded as DEFINITIONS so a process that does run a second reload
 * can bind them, and they produce no activity here. That is stated conditionality, not a conflict.
 *
 *   Run:  node scripts/gen-lab-2026a.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');
const repo = join(app, '..');

const LAB = JSON.parse(readFileSync(join(repo, 'docs/01-process/lab_checkpoints.json'), 'utf8'));
const S = JSON.parse(readFileSync(join(repo, 'docs/01-process/schedule.json'), 'utf8'));

const PROCESS = 'PROCESS-2026C';
const VERSION = 1;
const MAP = 'LAB_2026A';
const SOURCE = 'LAB-2026A · docs/01-process/lab_checkpoints.json + schedule.json';

const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const arr = (xs) => (xs && xs.length ? `array[${xs.map(q).join(',')}]::text[]` : 'null::text[]');

// ── Parameter vocabulary ────────────────────────────────────────────────────
// LAB-2026A's own parameter codes, mapped onto the ones already in the database. A second
// vocabulary for the same measurements would mean `lab_spec` could not find a band for a reading,
// and every existing lab suite would be testing a different set of names.
const PARAM = {
  moisture: 'moisture_pct',
  ph: 'ph',
  ec: 'ec',
  tds: 'tds',
  dry_weight: 'dry_weight',
  nitrogen: 'n_pct',
  ash: 'ash_pct',
  cn_ratio: 'cn_ratio',
  bunker_height: 'bunker_height',
  shrunken_height: 'shrunken_height',
  tunnel_height: 'tunnel_height',
  actinomycetes: 'actinomycetes',
  smell: 'smell',
  colour: 'colour',
  squeeze: 'spring',
};

// ── Where each checkpoint sits in PROCESS-2026C ─────────────────────────────
//
// Every entry is justified by the checkpoint's OWN `where` text, quoted beside it, against
// PROCESS-2026C's activity hours. Nothing here is a guess; where the source does not place a
// checkpoint in this process, it is `null` and produces no activity.
//
//   anchor  the 2026C activity this checkpoint belongs to, for the gate binding in 0053
//   hour    a fixed batch hour, OR a function of the pile / bunker for the repeated ones
const rail = Object.fromEntries(S.main.map((a) => [a.code, a]));
const paddy = Object.fromEntries(S.paddy.map((a) => [a.code, a]));
const nitro = Object.fromEntries(S.nitro.map((a) => [a.code, a]));
const t1For = (pile) => S.turner.find((t) => t.pile === pile && t.pas === 'T1');

const PLACEMENT = {
  // "Incoming lot, before the clock starts." ADVISORY — never gates H0.
  'LAB-RM-01': { anchor: 'FIB-WET-1', hour: 0, preH0: 10 },
  // "During / at the end of hopper pass 1."
  'LAB-WET-01': { anchor: 'FIB-WET-1', hour: rail['FIB-WET-1'].end },
  // "At the end of hopper pass 2."
  'LAB-WET-02': { anchor: 'FIB-HOP-2', hour: rail['FIB-HOP-2'].end },
  // "Immediately before bunker filling begins." GATE on FIB-BUNK-LOAD.
  'LAB-BNK-PRE': { anchor: 'FIB-BUNK-LOAD', hour: rail['FIB-BUNK-LOAD'].start },
  // "At unload, on the sample taken." The first conditioning ends and the material comes out.
  'LAB-UNL-01': { anchor: 'FIB-RELOAD-1', hour: rail['FIB-RELOAD-1'].start },
  // "Between unload and the hopper pass."
  'LAB-HOP-PRE': { anchor: 'FIB-RELOAD-1', hour: rail['FIB-RELOAD-1'].start + 2 },
  // "During reload."
  'LAB-RLD-01': { anchor: 'FIB-RELOAD-1', hour: rail['FIB-RELOAD-1'].end },
  // "When the manure is received."
  'LAB-CM-ARR': { anchor: 'CM-WEIGH', hour: nitro['CM-WEIGH'].start },
  // "On unload for the final mix." GATE on MIX-CM-ADD.
  'LAB-CM-USE': { anchor: 'MIX-CM-ADD', hour: rail['MIX-CM-ADD'].start },
  // "After the second conditioning cycle." DECISION — the 67–68 % band is UNRESOLVED.
  'LAB-MOIST-DEC': { anchor: 'FIB-MOIST-DEC', hour: rail['FIB-MOIST-DEC'].start },
  // "At bale weighment, before soaking."
  'LAB-PDY-WGH': { anchor: 'STR-WEIGH', hour: paddy['STR-WEIGH'].start },
  'LAB-PDY-S1': { anchor: 'STR-SOAK-1', hour: paddy['STR-SOAK-1'].start },
  'LAB-PDY-S2': { anchor: 'STR-SOAK-2', hour: paddy['STR-SOAK-2'].start },
  'LAB-PDY-S3': { anchor: 'STR-SOAK-3', hour: paddy['STR-SOAK-3'].start },
  // "After the second yard flip, before the Turner begins."
  'LAB-PRE-T': { anchor: 'YARD-FLIP', hour: rail['YARD-FLIP'].end },

  // "After T0, before T1 — ONE READING PER PILE." Each pile's own T1 start.
  'LAB-T1-PRE': { perPile: true, anchor: (p) => `TRN-P${p}-T1`, hour: (p) => t1For(p).start },
  // "Immediately after T1 — ONE READING PER PILE." Each pile's own T1 end.
  'LAB-T1-POST': { perPile: true, anchor: (p) => `TRN-P${p}-T1`, hour: (p) => t1For(p).end },

  // "At each bunker fill — ONE PER BUNKER." GATE. Height first — it sets the fill.
  'LAB-BNK-LOAD': { perBunker: true, anchor: (n) => `BNK-B${n}-FILL`, hour: (n) => S.streams[n - 1].fill[0] },
  // "At unload, before reloading." Shrunken height determines the reload height.
  'LAB-RLD-UNL': { perBunker: true, anchor: (n) => `BNK-B${n}-RELOAD`, hour: (n) => S.streams[n - 1].reload[0] },
  // "During reload."
  'LAB-RLD-RE': { perBunker: true, anchor: (n) => `BNK-B${n}-RELOAD`, hour: (n) => S.streams[n - 1].reload[1] },

  // "Only where the process runs a second reload." PROCESS-2026C runs one. Defined, not planned.
  'LAB-RLD2-UNL': null,
  'LAB-RLD2-RE': null,

  // "After tunnel preparation, before filling." Height checked first.
  'LAB-TUN-PRE': { anchor: 'BNK-B1-TUN-LOAD', hour: S.streams[0].tload[0] },
  // "During tunnel filling." GATE, per bunker — each stream's load is gated on its own assay.
  'LAB-TUN-LOAD': { perBunker: true, anchor: (n) => `BNK-B${n}-TUN-LOAD`, hour: (n) => S.streams[n - 1].tload[0] },
  // "At 24 °C, when unloading begins." The release record for the batch.
  'LAB-QC-FINAL': { anchor: 'TUN-DISCHARGE-1', hour: S.streams[0].gr },
};

// ── Build ───────────────────────────────────────────────────────────────────
const checkpoints = [];
const activities = [];
let seq = 10000; // Well clear of the production activities, which end below 700.

for (const cp of LAB.checkpoints) {
  const place = PLACEMENT[cp.code];
  if (place === undefined) throw new Error(`${cp.code} has no placement entry. Add one, or null it.`);

  const params = cp.params.map((p) => {
    const mapped = PARAM[p.code];
    if (!mapped) throw new Error(`${cp.code}: no database parameter for '${p.code}'`);
    return mapped;
  });

  checkpoints.push({
    code: cp.code,
    name: cp.title,
    kind: cp.kind,
    stage: cp.stage,
    where_note: cp.where,
    note: cp.note || null,
    params,
    evidence: cp.evidence,
    perPile: !!cp.per_pile,
    sortOrder: cp.sort_order,
    confidence: cp.confidence,
    planned: place !== null,
  });

  if (place === null) continue;

  const emit = (suffix, label, anchor, hour, instanceLabel) => {
    seq += 10;
    if (hour * 2 !== Math.floor(hour * 2)) {
      throw new Error(`${cp.code}${suffix}: H${hour} is not on a half hour.`);
    }
    activities.push({
      code: cp.code + suffix,
      label,
      checkpointCode: cp.code,
      anchor,
      hour,
      seq,
      relDay: Math.floor(hour / 24),
      params,
      evidence: cp.evidence,
      scope: instanceLabel ? (place.perPile ? 'PILE' : 'BUNKER_LINE') : 'MASTER',
      cardinality: instanceLabel
        ? JSON.stringify({ kind: 'FIXED_LABEL', label: instanceLabel })
        : '{"kind":"SINGLETON"}',
      preH0: place.preH0 ?? null,
    });
  };

  if (place.perPile) {
    for (let p = 1; p <= 6; p++) {
      emit(`-P${p}`, `${cp.title} — pile ${p}`, place.anchor(p), place.hour(p), `Pile ${p}`);
    }
  } else if (place.perBunker) {
    for (let n = 1; n <= 3; n++) {
      emit(`-B${n}`, `${cp.title} — bunker ${n}`, place.anchor(n), place.hour(n), `Bunker ${n}`);
    }
  } else {
    emit('', cp.title, place.anchor, place.hour, null);
  }
}

// ── Assertions before a line of SQL ─────────────────────────────────────────
const counts = checkpoints.reduce((a, c) => ((a[c.kind] = (a[c.kind] || 0) + 1), a), {});
if (checkpoints.length !== 25) throw new Error(`expected 25 checkpoints, built ${checkpoints.length}`);
if (counts.GATE !== 4) throw new Error(`expected 4 gates, built ${counts.GATE}`);
if (counts.DECISION !== 1) throw new Error(`expected 1 decision, built ${counts.DECISION}`);
if (counts.RECORD !== 20) throw new Error(`expected 20 records, built ${counts.RECORD}`);

// The Turner rule, asserted rather than trusted: before T1 and after T1, and nothing else.
const turner = checkpoints.filter((c) => c.stage === 'Turner');
if (turner.length !== 2 || !turner.every((c) => c.perPile)) {
  throw new Error('the Turner must carry exactly two per-pile checkpoints');
}
for (const absent of LAB.absent) {
  if (checkpoints.some((c) => c.code === absent.code)) {
    throw new Error(`${absent.code} is recorded as deliberately absent but was built`);
  }
}
const t1pre = activities.filter((a) => a.checkpointCode === 'LAB-T1-PRE');
const t1post = activities.filter((a) => a.checkpointCode === 'LAB-T1-POST');
if (t1pre.length !== 6 || t1post.length !== 6) throw new Error('six readings per Turner checkpoint');
for (const a of t1pre) {
  const pile = Number(a.code.slice(-1));
  if (a.hour !== t1For(pile).start) throw new Error(`${a.code} is not at its own T1 start`);
}
for (const a of t1post) {
  const pile = Number(a.code.slice(-1));
  if (a.hour !== t1For(pile).end) throw new Error(`${a.code} is not at its own T1 end`);
}

// ── SQL ─────────────────────────────────────────────────────────────────────
const L = [];
const w = (s = '') => L.push(s);

w('-- ─────────────────────────────────────────────────────────────────────────────');
w('-- 0053 · LAB-2026A, as PROCESS-2026C runs it.');
w('--');
w('-- GENERATED by scripts/gen-lab-2026a.mjs from docs/01-process/lab_checkpoints.json and');
w('-- schedule.json. DO NOT EDIT BY HAND.');
w('--');
w(`--   checkpoints   ${checkpoints.length}  (${counts.GATE} gates · ${counts.DECISION} decision · ${counts.RECORD} records)`);
w(`--   planned       ${checkpoints.filter((c) => c.planned).length} of them produce work in PROCESS-2026C`);
w(`--   activities    ${activities.length}`);
w('--');
w('-- The laboratory is PARALLEL: every activity below is PARALLEL_NO_WALLCLOCK and contributes');
w("-- nothing to the 470-hour envelope. And no lab activity carries a duration — no source states");
w('-- a laboratory turnaround time, and this file does not invent one.');
w('--');
w('-- LAB-RLD2-UNL and LAB-RLD2-RE are seeded as DEFINITIONS and produce no activity: their own');
w('-- note says "only where the process runs a second reload", and PROCESS-2026C runs one.');
w('-- ─────────────────────────────────────────────────────────────────────────────');
w();
w();
w('-- ── 1 · The checkpoint set is a version of its own. ────────────────────────');
w('-- Beside LAB_DICTATION and S4B_COLUMNS, never replacing them: batches reference those maps and');
w('-- a lab result points at the checkpoint it was taken against.');
w();
w('do $$');
w('begin');
w(`  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid`);
w(`                 where t.typname = 'lab_checkpoint_map' and e.enumlabel = '${MAP}') then`);
w(`    alter type public.lab_checkpoint_map add value '${MAP}';`);
w('  end if;');
w('end $$;');
w();
w();
w('-- ── 2 · What a checkpoint is, beyond its parameters. ───────────────────────');
w('-- `kind` is the whole of LAB-2026A\'s gate model: a GATE stops production until approved, a');
w('-- DECISION branches the process, a RECORD is evidence and nothing else. It was nowhere in the');
w('-- schema, so no engine could tell them apart.');
w();
w('alter table public.lab_checkpoint');
w("  add column if not exists kind           text not null default 'RECORD',");
w('  add column if not exists evidence_kinds text[] not null default array[]::text[],');
w('  add column if not exists per_pile       boolean not null default false,');
w('  add column if not exists stage          text,');
w('  add column if not exists where_note     text,');
w('  add column if not exists guidance       text,');
w('  add column if not exists sort_order     int,');
w('  add column if not exists confidence     text;');
w();
w('alter table public.lab_checkpoint drop constraint if exists lab_checkpoint_kind_known;');
w('alter table public.lab_checkpoint add constraint lab_checkpoint_kind_known check (');
w("  kind in ('GATE', 'DECISION', 'RECORD'));");
w();
w('comment on column public.lab_checkpoint.kind is');
w("  'GATE stops production until an APPROVED result exists. DECISION branches the process. '");
w("  'RECORD is evidence. LAB-2026A: 4 gates, 1 decision, 20 records. 0052.';");
w();
w('comment on column public.lab_checkpoint.evidence_kinds is');
w("  'The checkpoint-specific evidence LAB-2026A asks for — LOT_PHOTO, WEIGHMENT_SLIP, '");
w("  'SAMPLE_PHOTO, BEFORE_PHOTO, HEIGHT_PHOTO, TUNNEL_PHOTO, AFTER_PHOTO. Not one generic '");
w("  'upload: a weighment slip and a height photo answer different questions. 0052.';");
w();
w();
w(`-- ── 3 · The ${checkpoints.length} checkpoints. ───────────────────────────────────────────`);
w();
w('insert into public.lab_checkpoint');
w('  (checkpoint_map, code, name, kind, stage, where_note, guidance, parameters, evidence_kinds,');
w('   per_pile, sort_order, confidence, scope, source_ref)');
w('values');
w(
  checkpoints
    .map(
      (c) =>
        `  ('${MAP}', ${q(c.code)}, ${q(c.name)}, ${q(c.kind)}, ${q(c.stage)}, ${q(c.where_note)}, ` +
        `${q(c.note)}, ${arr(c.params)}, ${arr(c.evidence)}, ${c.perPile}, ${c.sortOrder}, ` +
        `${q(c.confidence)}, ${q(c.perPile ? 'pile' : 'master')}, ${q(SOURCE)})`
    )
    .join(',\n')
);
w('on conflict (checkpoint_map, code) do update set');
w('  name = excluded.name, kind = excluded.kind, stage = excluded.stage,');
w('  where_note = excluded.where_note, guidance = excluded.guidance,');
w('  parameters = excluded.parameters, evidence_kinds = excluded.evidence_kinds,');
w('  per_pile = excluded.per_pile, sort_order = excluded.sort_order,');
w('  confidence = excluded.confidence, scope = excluded.scope;');
w();
w();
w('-- ── 4 · The work, on the hour axis of PROCESS-2026C. ───────────────────────');
w('-- A published definition is frozen (0044), so the standard drops to draft for the length of');
w('-- this file and is published again at the end. Nothing can be planned against a draft, so no');
w('-- baseline can be generated while the window is open.');
w();
w(`update public.process_definition set status = 'draft'`);
w(` where code = ${q(PROCESS)} and version = ${VERSION};`);
w();
w(`with pd as (select id from public.process_definition where code = ${q(PROCESS)} and version = ${VERSION})`);
w('insert into public.process_activity (');
w('  process_definition_id, code, label_template, stream, rel_day, seq, scope, cardinality_rule,');
w('  standard_start_hour, standard_hour_source, responsible_role, lab_parameters,');
w('  timing_confidence, is_pre_h0, pre_h0_offset, source_ref)');
w("select pd.id, a.code, a.label, 'YARD'::stream_code, a.rel_day, a.seq, a.scope::activity_scope,");
w("       a.cardinality::jsonb, a.hour, 'factory_stated', 'lab_tech'::app_role, a.params,");
w("       'PARALLEL_NO_WALLCLOCK'::process_confidence,");
w(`       (a.pre_h0 is not null), a.pre_h0, ${q(SOURCE)}`);
w('from pd, (values');
w(
  activities
    .map(
      (a) =>
        `  (${q(a.code)}, ${q(a.label)}, ${a.relDay}, ${a.seq}, ${q(a.scope)}, ${q(a.cardinality)}, ` +
        `${a.hour}, ${arr(a.params)}, ${a.preH0 === null ? 'null::int' : a.preH0})`
    )
    .join(',\n')
);
w(') as a(code, label, rel_day, seq, scope, cardinality, hour, params, pre_h0)');
w('on conflict (process_definition_id, code) do update set');
w('  label_template = excluded.label_template, rel_day = excluded.rel_day, seq = excluded.seq,');
w('  scope = excluded.scope, cardinality_rule = excluded.cardinality_rule,');
w('  standard_start_hour = excluded.standard_start_hour,');
w('  standard_hour_source = excluded.standard_hour_source,');
w('  responsible_role = excluded.responsible_role, lab_parameters = excluded.lab_parameters,');
w('  timing_confidence = excluded.timing_confidence, is_pre_h0 = excluded.is_pre_h0,');
w('  pre_h0_offset = excluded.pre_h0_offset;');
w();
w();
w('-- ── 5 · Which activity carries which checkpoint. ───────────────────────────');
w('-- The join 0053 needs to bind a gate, and the join a client needs to render a checkpoint form');
w('-- from its definition rather than from twenty-five hand-written screens.');
w();
w('create table if not exists public.lab_checkpoint_activity (');
w('  checkpoint_map      public.lab_checkpoint_map not null,');
w('  checkpoint_code     text not null,');
w('  process_activity_id uuid not null references public.process_activity(id) on delete cascade,');
w('  gates_activity_code text,');
w('  primary key (checkpoint_map, checkpoint_code, process_activity_id)');
w(');');
w();
w('comment on table public.lab_checkpoint_activity is');
w("  'Which planned activity carries which laboratory checkpoint, and — for a GATE — which '");
w("  'PRODUCTION activity it holds. lab_checkpoints.json supplies blocks_activity_code as null on '");
w("  'purpose: real activity codes are read from process_activity, never invented. 0052.';");
w();
w('alter table public.lab_checkpoint_activity enable row level security;');
w('drop policy if exists lab_checkpoint_activity_read on public.lab_checkpoint_activity;');
w('create policy lab_checkpoint_activity_read on public.lab_checkpoint_activity');
w('  for select to authenticated using (true);');
w('grant select on public.lab_checkpoint_activity to authenticated;');
w();
w(`with pd as (select id from public.process_definition where code = ${q(PROCESS)} and version = ${VERSION})`);
w('insert into public.lab_checkpoint_activity');
w('  (checkpoint_map, checkpoint_code, process_activity_id, gates_activity_code)');
w(`select '${MAP}', m.checkpoint_code, pa.id, m.gates_code`);
w('from pd');
w('join (values');
w(
  activities
    .map((a) => `  (${q(a.code)}, ${q(a.checkpointCode)}, ${q(a.anchor)})`)
    .join(',\n')
);
w(') as m(activity_code, checkpoint_code, gates_code) on true');
w('join public.process_activity pa on pa.process_definition_id = pd.id and pa.code = m.activity_code');
w('on conflict do nothing;');
w();
w();
w('-- ── 6 · Checkpoint-specific evidence. ──────────────────────────────────────');
w('-- LAB-2026A asks for seven distinct kinds and the difference matters: a HEIGHT_PHOTO proves the');
w('-- measurement that sets the reload height, and a WEIGHMENT_SLIP is a document. Collapsing them');
w('-- into one "upload image" would lose the question each was answering.');
w();
w(`with pd as (select id from public.process_definition where code = ${q(PROCESS)} and version = ${VERSION})`);
w('insert into public.evidence_requirement');
w('  (process_activity_id, key, label, media_kinds, min_count, is_required, gates_submission,');
w('   capture_hint, ordering)');
w("select pa.id, e.key, e.label, array['photo']::text[], 1, true, true, e.hint, e.ord");
w('from pd');
w('join (values');

const EVIDENCE_LABEL = {
  LOT_PHOTO: ['Lot photograph', 'Photograph the incoming lot as received.'],
  WEIGHMENT_SLIP: ['Weighment slip', 'Photograph the weighbridge slip so the figure is traceable.'],
  SAMPLE_PHOTO: ['Sample photograph', 'Photograph the sample as taken, before testing.'],
  BEFORE_PHOTO: ['Before photograph', 'Photograph the material before the operation begins.'],
  HEIGHT_PHOTO: ['Height photograph', 'Photograph the height measurement — it sets what happens next.'],
  TUNNEL_PHOTO: ['Tunnel photograph', 'Photograph the prepared tunnel.'],
  AFTER_PHOTO: ['After photograph', 'Photograph the result.'],
};
const evRows = [];
for (const a of activities) {
  a.evidence.forEach((kind, i) => {
    const [label, hint] = EVIDENCE_LABEL[kind] ?? [kind, null];
    evRows.push(`  (${q(a.code)}, ${q(kind)}, ${q(label)}, ${q(hint)}, ${(i + 1) * 10})`);
  });
}
w(evRows.join(',\n'));
w(') as e(activity_code, key, label, hint, ord) on true');
w('join public.process_activity pa on pa.process_definition_id = pd.id and pa.code = e.activity_code');
w('on conflict (process_activity_id, key) do update set');
w('  label = excluded.label, capture_hint = excluded.capture_hint, ordering = excluded.ordering;');
w();
w();
w('-- ── 7 · Published again, and the envelope must not have moved. ─────────────');
w();
w(`update public.process_definition`);
w(`   set status = 'published', published_at = coalesce(published_at, now())`);
w(` where code = ${q(PROCESS)} and version = ${VERSION};`);
w();
w('do $$');
w('declare s record;');
w('begin');
w(`  select * into s from public.v_process_envelope where code = ${q(PROCESS)};`);
w('  if s.envelope_disagrees then');
w('    raise exception');
w("      'Seeding the laboratory moved PROCESS-2026C''s standard: its activities now compute %h "
  + "against a stated envelope of %h. Laboratory work is parallel and must contribute no wall "
  + "clock — check that every lab activity is PARALLEL_NO_WALLCLOCK.',");
w('      s.calculated_standard_hr, s.stated_envelope_hr;');
w('  end if;');
w('end $$;');

// ── The enum value, alone, because it must commit before anything uses it. ──
writeFileSync(
  join(app, 'supabase/migrations/0052_lab_checkpoint_map.sql'),
  [
    '-- ─────────────────────────────────────────────────────────────────────────────',
    `-- 0052 · The ${MAP} checkpoint map value. Nothing else.`,
    '--',
    '-- ONE STATEMENT, ON PURPOSE. Postgres refuses to USE a new enum value in the transaction that',
    '-- added it — "unsafe use of new value" — and scripts/db.mjs sends each migration file as a',
    '-- single query, which is a single implicit transaction. So the value is added here and used in',
    '-- 0053. Merging the two files back together fails on a fresh database and passes on one where',
    '-- the value already exists, which is the worst of both.',
    '--',
    '-- LAB_DICTATION and S4B_COLUMNS are untouched. Batches reference them, and a lab result points',
    '-- at the checkpoint it was taken against.',
    '-- ─────────────────────────────────────────────────────────────────────────────',
    '',
    'do $$',
    'begin',
    '  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid',
    `                  where t.typname = 'lab_checkpoint_map' and e.enumlabel = '${MAP}') then`,
    `    alter type public.lab_checkpoint_map add value '${MAP}';`,
    '  end if;',
    'end $$;',
    '',
  ].join('\n')
);

writeFileSync(join(app, 'supabase/migrations/0053_lab_2026a.sql'), L.join('\n') + '\n');

console.log('0052_lab_checkpoint_map.sql + 0053_lab_2026a.sql written');
console.log(`  checkpoints  ${checkpoints.length}  (${counts.GATE} gates · ${counts.DECISION} decision · ${counts.RECORD} records)`);
console.log(`  planned      ${checkpoints.filter((c) => c.planned).length}`);
console.log(`  definition-only ${checkpoints.filter((c) => !c.planned).map((c) => c.code).join(', ')}`);
console.log(`  activities   ${activities.length}`);
console.log(`  evidence     ${evRows.length}`);
console.log(`  per-pile     LAB-T1-PRE x6 @ own T1 start · LAB-T1-POST x6 @ own T1 end`);
console.log(`  absent       ${LAB.absent.map((a) => a.code).join(', ')}  (deliberate)`);
