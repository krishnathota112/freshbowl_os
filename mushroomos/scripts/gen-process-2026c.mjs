#!/usr/bin/env node
/**
 * gen-process-2026c.mjs — docs/01-process/schedule.json  →  0043_process_2026c.sql
 *
 * WHY A GENERATOR AND NOT A HAND-WRITTEN SEED
 *   `docs/00-START-HERE.md` puts `schedule.json` above `STANDARD.md` in the precedence
 *   order: "every hour figure, mechanically". A hand-typed seed is a second copy of
 *   sixty-nine hour figures, and the day one of them is corrected in schedule.json is the
 *   day the two disagree with nobody noticing. This script is the only thing that turns
 *   those figures into rows, so the SQL is a build artefact — checked in so a migration
 *   run needs no Node, regenerated whenever schedule.json moves.
 *
 *   Run:  node scripts/gen-process-2026c.mjs
 *   Then: node scripts/db.mjs migrations   (or apply 0043 directly)
 *
 * WHAT IT DELIBERATELY DOES NOT EMIT
 *   · No machine assignment. STANDARD §3 rule 3: "Machine assignment is recorded as
 *     actual, never planned." M1/M2 appear in schedule.json and are dropped here.
 *   · No T2 = T0 + 24 h. The rest before T2 is 8 h from that pile's own T1 ACTUAL end
 *     (F10), so it is a gate on an actual, not a planned offset — it is emitted as a
 *     gate rule, never as a planned hour.
 *   · No material name in any code. Enforced by process_activity_code_has_no_material_name.
 *   · No invented duration. Where the standard states none, the column stays null.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');
const repo = join(app, '..');

const S = JSON.parse(readFileSync(join(repo, 'docs/01-process/schedule.json'), 'utf8'));

const CODE = 'PROCESS-2026C';
const VERSION = 1;
const SOURCE = 'docs/01-process/schedule.json · PROCESS-2026C v1, confirmed 30 Aug 2026';

// ── helpers ─────────────────────────────────────────────────────────────────
const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const n = (v) => (v === null || v === undefined ? 'null' : String(v));
const relDay = (h) => Math.floor(h / 24);

/** Half-hour granularity is a constraint in 0042. Catch a bad figure here, not in Postgres. */
function hour(h, where) {
  if (h === null || h === undefined) return null;
  if (h * 2 !== Math.floor(h * 2)) {
    throw new Error(`${where}: H${h} is not on a half hour. The axis carries half hours only.`);
  }
  if (h < 0) throw new Error(`${where}: H${h} is before H0.`);
  return h;
}

const SINGLETON = '{"kind":"SINGLETON"}';
const fixed = (label) => JSON.stringify({ kind: 'FIXED_LABEL', label });

const rows = [];
let seq = 0;

/**
 * One process activity. `start`/`end` are batch hours; rel_day is derived, never stated,
 * because 0042's constraint is rel_day = floor(start/24) and a stated day is a second
 * source for the same fact.
 */
function activity(a) {
  const start = hour(a.start, a.code);
  const end = a.end === null || a.end === undefined ? null : hour(a.end, a.code);
  seq += 10;
  rows.push({
    code: a.code,
    label: a.label,
    material_role: a.material_role ?? null,
    stream: a.stream,
    rel_day: relDay(start),
    seq,
    scope: a.scope,
    cardinality: a.cardinality ?? SINGLETON,
    dmin: a.dmin ?? null,
    dmax: a.dmax ?? null,
    start,
    end,
    is_hold: a.is_hold ? true : false,
    role: a.role ?? 'operator',
    golden: a.golden ?? null,
    confidence: a.confidence ?? 'FACTORY_CONFIRMED',
    lab_params: a.lab_params ?? null,
  });
}

// ── 1 · The main rail, H0 → H174. Fifteen activities, contiguous. ───────────
// Titles carry {role_lead} wherever the material is the subject, so no material name
// enters the definition (rule 4). The rest of each title is the factory's own wording.
const RAIL_LABEL = {
  'FIB-WET-1': '{role_lead} wetting — hopper pass 1 (full water, target 69–71% moisture)',
  'FIB-REST-1': 'Material rest',
  'FIB-HOP-2': 'Hopper pass 2 (dry, or water to reach target moisture)',
  'FIB-HEAP': 'Heap formation (height ≤1.5 m) + rest',
  'FIB-BUNK-LOAD': 'Flipping + bunker filling (ht 2.6–2.7 m), no water',
  'FIB-COND-1': 'Bunker conditioning, 45–55 °C. Unload trigger ≥58 °C or ≥60 h',
  'FIB-RELOAD-1': 'Loader unload, flipping, reload to new bunker (no water)',
  'FIB-COND-2': 'Conditioning. Unload trigger ≥58 °C or ≥40 h',
  'FIB-MOIST-DEC': 'Unload. If moisture ≥68% proceed; if <67% controlled mist via hopper',
  'MIX-CM-ADD': 'Add {role_lead} mix to conditioned fibre + loader mix + flip 1 + flip 2',
  'MIX-HOP-WATER': 'Hopper pass, full water (target 73% moisture, temp <45–50 °C)',
  'MIX-REST': 'Rest',
  'YARD-PILES': 'Preparation of 2 equal piles on platform',
  'YARD-ADD': 'Add fibre + nitrogen mix gradually onto the 2 straw piles',
  'YARD-FLIP': 'Flipping 1 + flipping 2, back to back',
};

const RAIL_STREAM = (code) =>
  code.startsWith('FIB-') ? 'PRIMARY_FIBRE' : 'YARD';

// Only the FIB rail is bound to a material role. MIX and YARD are convergences: they run
// whatever arrived, so binding them to one role would make them disappear from a batch
// that bound a different one.
const RAIL_ROLE = (code) => (code.startsWith('FIB-') ? 'PRIMARY_FIBRE' : null);

for (const a of S.main) {
  activity({
    code: a.code,
    label: RAIL_LABEL[a.code] ?? a.title,
    // MIX-CM-ADD belongs to the nitrogen role, not to the fibre rail: it is the activity that
    // adds the nitrogen mix, so a batch binding no nitrogen source must not generate it. It also
    // carries {role_lead}, and a template with no role resolves to the literal word "Material".
    material_role: a.code === 'MIX-CM-ADD' ? 'NITROGEN_SOURCE' : RAIL_ROLE(a.code),
    stream: RAIL_STREAM(a.code),
    scope: a.code === 'FIB-BUNK-LOAD' || a.code.startsWith('FIB-COND') ? 'BUNKER_LINE' : 'MASTER',
    cardinality: SINGLETON,
    dmin: a.mn,
    dmax: a.dur,
    start: a.start,
    end: a.end,
    is_hold: a.kind === 'HOLD',
    golden:
      a.code === 'FIB-MOIST-DEC'
        ? 'A reading between 67 % and 68 % is recorded, flagged and referred. It does not auto-proceed and it does not auto-mist.'
        : null,
  });
}

// ── 2 · Structural straw, H74 → H160. Zero slack against the rail. ──────────
for (const a of S.paddy) {
  activity({
    code: a.code,
    label: a.code === 'STR-WEIGH' ? '{role_lead} bale weighment + cutting + thread removal' : a.title,
    material_role: 'STRUCTURAL_STRAW',
    stream: 'STRUCTURAL_STRAW',
    scope: 'MASTER',
    dmin: a.dur,
    dmax: a.dur,
    start: a.start,
    end: a.end,
    golden:
      a.code === 'STR-WEIGH'
        ? 'Latest start H74. Eighty-six hours of work against eighty-six hours of room — one hour late here is one hour late on the batch, and nothing on the main rail will show why.'
        : null,
  });
}

// ── 3 · Nitrogen / minerals, H130 → H136. Ready at the first convergence. ───
for (const a of S.nitro) {
  activity({
    code: a.code,
    label:
      a.code === 'CM-WEIGH'
        ? '{role_lead} + mineral weighment'
        : 'Dry mix + rotavator to break lumps (no water)',
    material_role: 'NITROGEN_SOURCE',
    stream: 'NITROGEN_MINERAL',
    scope: 'MASTER',
    dmin: a.dur,
    dmax: a.dur,
    start: a.start,
    end: a.end,
  });
}

// ── 4 · The Turner, H174 → H197. Twenty-four pile-passes, no machine. ───────
// One activity per pile-pass because each carries its own hour. A PER_SCOPE_INSTANCE rule
// would put all six piles on one hour, which is the thing the Turner sheet is not.
for (const t of S.turner) {
  activity({
    code: `TRN-P${t.pile}-${t.pas}`,
    label: `Turner ${t.pas} — pile ${t.pile}`,
    stream: 'YARD',
    scope: 'PILE',
    cardinality: fixed(`Pile ${t.pile}`),
    dmin: Number((t.end - t.start).toFixed(1)),
    dmax: Number((t.end - t.start).toFixed(1)),
    start: t.start,
    end: t.end,
    golden:
      t.pas === 'T2'
        ? 'Eligible eight hours after THIS pile’s own T1 actual end. Not T0 start + 24 h.'
        : t.pas === 'T1'
          ? 'The gap after T0 is normal — 1.5 to 4.5 h. The continuity belongs to the machines, not to the pile.'
          : null,
    lab_params: t.pas === 'T1' ? ['moisture'] : null,
  });
}

// ── 5 · The bunkers. Three streams, rolling, one after another. ─────────────
// P1+P2 → B1 · P3+P4 → B2 · P5+P6 → B3. The pairing is in schedule.json, not here.
for (const s of S.streams) {
  const B = `B${s.n}`;
  const label = `Bunker ${s.n}`;
  const piles = s.piles.join(' + ');
  const step = (suffix, title, span, opts = {}) =>
    activity({
      code: `BNK-${B}-${suffix}`,
      label: `${title} — bunker ${s.n}`,
      stream: 'BUNKER',
      scope: 'BUNKER_LINE',
      cardinality: fixed(label),
      dmin: span[1] - span[0],
      dmax: span[1] - span[0],
      start: span[0],
      end: span[1],
      ...opts,
    });

  step('FILL', 'Bunker fill', s.fill, {
    golden: `Rolling. The bunker opens when the first of piles ${piles} leaves T3; the second joins as it finishes. There is no six-pile barrier.`,
  });
  step('HOLD-1', 'Conditioning hold 1', s.hold1, {
    is_hold: true,
    golden:
      'Approximately 15 h to reach 70 °C, then 48 h at temperature. Reload trigger 73–74 °C with the hold satisfied, whichever comes first. Both recorded.',
  });
  step('RELOAD', 'Unload, flip and reload', s.reload, {
    golden:
      'Shrunken height is recorded FIRST — it determines the reload height. Then moisture. If water is added, pH, EC and moisture are taken again and the original reading is never overwritten.',
  });
  step('HOLD-2', 'Conditioning hold 2', s.hold2, { is_hold: true });
  step('TUN-LOAD', 'Tunnel loading', s.tload);
}

// ── 6 · The tunnel. One vessel, 144 h of phases. ────────────────────────────
// Anchored on stream 1, whose tproc span [326, 470] is what H470 — the standard end —
// is measured on. Streams 2 and 3 discharge at H472 and H474; those are emitted below as
// their own activities rather than as a second, disagreeing set of phase hours.
{
  let cursor = S.streams[0].tproc[0];
  for (const [code, title, std, mn, mx] of S.tunnel) {
    const start = cursor;
    const end = Number((cursor + std).toFixed(1));
    activity({
      code,
      label: title,
      stream: 'TUNNEL',
      scope: 'TUNNEL',
      dmin: mn,
      dmax: mx,
      start,
      end,
      is_hold: true,
      confidence: mn === mx ? 'FACTORY_CONFIRMED' : 'FACTORY_RANGE',
    });
    cursor = end;
  }
  const expected = S.streams[0].tproc[1];
  if (cursor !== expected) {
    throw new Error(
      `Tunnel phases sum to H${cursor}, but stream 1 discharges at H${expected}. ` +
        `schedule.json disagrees with itself — report it, do not adjust a duration to close it.`
    );
  }
}

// ── 7 · Discharge. Three streams, H470 · H472 · H474. ───────────────────────
// No duration: the standard states the hour each stream begins unloading and states no
// length for the unloading itself. An invented one would be indistinguishable from a
// factory figure the moment it is stored.
for (const s of S.streams) {
  activity({
    code: `TUN-DISCHARGE-${s.n}`,
    label: `Tunnel discharge to grow-room — stream ${s.n}`,
    stream: 'TUNNEL',
    scope: 'TUNNEL',
    cardinality: fixed(`Stream ${s.n}`),
    dmin: null,
    dmax: null,
    start: s.gr,
    end: null,
    golden: s.n === 1 ? 'H470 is the standard end, and it is measured on stream 1.' : null,
  });
}

// ── assertions on the emitted set, before a line of SQL is written ──────────
const codes = rows.map((r) => r.code);
if (new Set(codes).size !== codes.length) throw new Error('Duplicate activity code emitted.');
const anchor = rows.find((r) => r.code === 'TRN-P1-T0');
if (!anchor || anchor.start !== S.anchor) {
  throw new Error(`Turner anchor is H${anchor?.start}, expected H${S.anchor}.`);
}
const lastRail = rows.filter((r) => r.stream === 'PRIMARY_FIBRE' || r.stream === 'YARD');
const railEnd = Math.max(...S.main.map((a) => a.end));
if (railEnd !== S.anchor) throw new Error(`Main rail ends at H${railEnd}, not the anchor.`);
const discharge = Math.max(...rows.map((r) => r.start));
if (discharge !== S.full_discharge) {
  throw new Error(`Last activity starts at H${discharge}, expected H${S.full_discharge}.`);
}
const totalDays = Math.max(...rows.map((r) => r.rel_day));

// ── SQL ─────────────────────────────────────────────────────────────────────
const L = [];
const w = (s = '') => L.push(s);

w(`-- ─────────────────────────────────────────────────────────────────────────────`);
w(`-- 0043 · PROCESS-2026C — the 470-hour standard.`);
w(`--`);
w(`-- GENERATED by scripts/gen-process-2026c.mjs from docs/01-process/schedule.json.`);
w(`-- DO NOT EDIT BY HAND. Change schedule.json and regenerate, or the two disagree and`);
w(`-- nobody finds out until a variance is wrong.`);
w(`--`);
w(`--   activities   ${rows.length}`);
w(`--   envelope     H${S.envelope}   (stream 1 discharge — the standard end)`);
w(`--   anchor       H${S.anchor}   (Turner)`);
w(`--   discharged   H${S.full_discharge}   (stream 3 — all three streams out)`);
w(`--   rel_day      0 … ${totalDays}`);
w(`--`);
w(`-- PROCESS-2026B IS NOT TOUCHED. Batches were generated from it and their baselines are`);
w(`-- frozen; a new standard is a new version beside the old one, never an edit to it.`);
w(`-- ─────────────────────────────────────────────────────────────────────────────`);
w();
w();
w(`-- ── 1 · One named instance, stated by the definition. ───────────────────────`);
w(`-- evaluate_cardinality had six kinds and none of them said "exactly one, and it is`);
w(`-- called this". A Turner pass belongs to pile 4 and to no other; PER_SCOPE_INSTANCE`);
w(`-- would put all six piles on one hour, and SINGLETON would label it "Whole batch".`);
w(`-- The label is data in the rule, so no count and no pile name enters any code path.`);
w();
w(`-- The six original kinds move aside under their own name rather than being retyped here.`);
w(`-- Retyping them is how a rule that has been correct since 0005 acquires a difference.`);
w(`do $$`);
w(`begin`);
w(`  if not exists (`);
w(`    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace`);
w(`     where n.nspname = 'public' and p.proname = 'evaluate_cardinality_v1') then`);
w(`    alter function public.evaluate_cardinality(jsonb, jsonb) rename to evaluate_cardinality_v1;`);
w(`  end if;`);
w(`end $$;`);
w();
w(`create or replace function public.evaluate_cardinality(`);
w(`  p_rule jsonb, p_config jsonb`);
w(`) returns table (instance_no int, scope_label text, planned_qty_mt numeric)`);
w(`language plpgsql stable as $fn$`);
w(`begin`);
w(`  if p_rule->>'kind' = 'FIXED_LABEL' then`);
w(`    if coalesce(p_rule->>'label', '') = '' then`);
w(`      raise exception 'A FIXED_LABEL cardinality rule must carry a label.';`);
w(`    end if;`);
w(`    return query select 1, p_rule->>'label', null::numeric;`);
w(`    return;`);
w(`  end if;`);
w(`  return query select * from public.evaluate_cardinality_v1(p_rule, p_config);`);
w(`end;`);
w(`$fn$;`);
w();
w(`comment on function public.evaluate_cardinality(jsonb, jsonb) is`);
w(`  'Seven rule kinds. FIXED_LABEL (0043) is one instance carrying a label the definition`);
w(`  states — a Turner pile-pass, a bunker line, a tunnel stream. Everything else delegates`);
w(`  to evaluate_cardinality_v1, which is 0005 unchanged.';`);
w();
w();
w(`-- ── 2 · A hold is not a task. ──────────────────────────────────────────────`);
w(`-- Six of the fifteen rail activities and both bunker conditionings are HOLD: material`);
w(`-- resting, nobody working. 128 of the first 174 hours are holds. Without this column`);
w(`-- the operator's queue offers a 63-hour bunker conditioning as something to press`);
w(`-- START on, and the two kinds become indistinguishable the moment they are planned.`);
w();
w(`alter table public.process_activity add column if not exists is_hold boolean not null default false;`);
w(`alter table public.batch_activity   add column if not exists is_hold boolean not null default false;`);
w();
w(`comment on column public.process_activity.is_hold is`);
w(`  'true = material is resting and no one is working. STANDARD.md KIND = HOLD. 0043.';`);
w();
w();
w(`-- ── 3 · The definition. ────────────────────────────────────────────────────`);
w();
w(`insert into public.process_definition`);
w(`  (code, name, version, status, source_ref, anchor_day_label, total_days)`);
w(`values`);
w(`  (${q(CODE)}, 'The 470-hour standard', ${VERSION}, 'draft', ${q(SOURCE)},`);
w(`   'H0 = fibre wetting, hopper pass 1', ${totalDays})`);
w(`on conflict (code, version) do update set`);
w(`  name = excluded.name, source_ref = excluded.source_ref, total_days = excluded.total_days,`);
w(`  -- Back to draft for the length of this file. 0044 freezes a PUBLISHED definition's`);
w(`  -- activities at the table, so regenerating from schedule.json would otherwise be refused`);
w(`  -- on every run after the first. s12 publishes it again once the rows are in. The window`);
w(`  -- is one migration long and it is inside the same run.`);
w(`  status = 'draft';`);
w();
w(`-- The envelope is a factory statement, not (total_days + 1) × 24. 0041 / F7.`);
w(`-- 470 is not a multiple of 24 and baseline_hours physically cannot hold it.`);
w(`update public.process_definition`);
w(`   set envelope_hours       = ${S.envelope},`);
w(`       envelope_hour_source = 'factory_stated',`);
w(`       envelope_confidence  = 'FACTORY_CONFIRMED'`);
w(` where code = ${q(CODE)} and version = ${VERSION};`);
w();
w(`-- Days exist so the calendar screens have a title per rel_day. The day grid is not the`);
w(`-- envelope — 0041 §2 — it is a label.`);
w(`with pd as (select id from public.process_definition where code = ${q(CODE)} and version = ${VERSION})`);
w(`insert into public.process_day (process_definition_id, rel_day, title, source_ref)`);
w(`select pd.id, d, 'Day ' || d, ${q(SOURCE)} from pd, generate_series(0, ${totalDays}) d`);
w(`on conflict (process_definition_id, rel_day) do update set title = excluded.title;`);
w();
w();
w(`-- ── 4 · ${rows.length} activities. ─────────────────────────────────────────`);
w();
w(`with pd as (select id from public.process_definition where code = ${q(CODE)} and version = ${VERSION})`);
w(`insert into public.process_activity (`);
w(`  process_definition_id, code, label_template, material_role, stream, rel_day, seq, scope,`);
w(`  cardinality_rule, duration_target_min_hr, duration_target_max_hr,`);
w(`  standard_start_hour, standard_end_hour, standard_hour_source,`);
w(`  is_hold, responsible_role, golden_rule, source_ref, timing_confidence, lab_parameters)`);
w(`select pd.id, a.code, a.label, a.material_role::material_role_code, a.stream::stream_code,`);
w(`       a.rel_day, a.seq, a.scope::activity_scope, a.cardinality::jsonb,`);
w(`       a.dmin, a.dmax, a.hstart, a.hend, 'factory_stated',`);
w(`       a.is_hold, a.role::app_role, a.golden, ${q(SOURCE)},`);
w(`       a.confidence::process_confidence, a.lab_params`);
w(`from pd, (values`);

const body = rows.map((r) => {
  const labParams =
    r.lab_params === null ? 'null::text[]' : `array[${r.lab_params.map(q).join(',')}]::text[]`;
  return (
    `  (${q(r.code)}, ${q(r.label)}, ${q(r.material_role)}, ${q(r.stream)}, ${r.rel_day}, ${r.seq}, ` +
    `${q(r.scope)}, ${q(r.cardinality)}, ${n(r.dmin)}, ${n(r.dmax)}, ${n(r.start)}, ${n(r.end)}, ` +
    `${r.is_hold}, ${q(r.role)}, ${q(r.golden)}, ${q(r.confidence)}, ${labParams})`
  );
});
w(body.join(',\n'));
w(`) as a(code, label, material_role, stream, rel_day, seq, scope, cardinality, dmin, dmax,`);
w(`       hstart, hend, is_hold, role, golden, confidence, lab_params)`);
w(`on conflict (process_definition_id, code) do update set`);
w(`  label_template = excluded.label_template,`);
w(`  material_role  = excluded.material_role,`);
w(`  stream         = excluded.stream,`);
w(`  rel_day        = excluded.rel_day,`);
w(`  seq            = excluded.seq,`);
w(`  scope          = excluded.scope,`);
w(`  cardinality_rule = excluded.cardinality_rule,`);
w(`  duration_target_min_hr = excluded.duration_target_min_hr,`);
w(`  duration_target_max_hr = excluded.duration_target_max_hr,`);
w(`  standard_start_hour  = excluded.standard_start_hour,`);
w(`  standard_end_hour    = excluded.standard_end_hour,`);
w(`  standard_hour_source = excluded.standard_hour_source,`);
w(`  is_hold          = excluded.is_hold,`);
w(`  responsible_role = excluded.responsible_role,`);
w(`  golden_rule      = excluded.golden_rule,`);
w(`  timing_confidence = excluded.timing_confidence,`);
w(`  lab_parameters   = excluded.lab_parameters;`);
w();
w();
w(`-- ── 5 · Two photographs on every activity someone actually performs. ───────`);
w(`-- Master PRD: BEFORE / START and AFTER / FINISH. A hold has nobody to photograph it,`);
w(`-- so holds are excluded — which is also why is_hold exists.`);
w();
w(`with pa as (`);
w(`  select pa.id from public.process_activity pa`);
w(`  join public.process_definition pd on pd.id = pa.process_definition_id`);
w(`  where pd.code = ${q(CODE)} and pd.version = ${VERSION}`);
w('    and not pa.is_hold');
w("    -- ⚠ AND NOT A LABORATORY ACTIVITY. 0053 adds 41 of them to this same definition,");
w("    -- and on a REPLAY they already exist when this statement runs — so 'every non-hold");
w("    -- activity' silently gave a moisture reading a BEFORE and an AFTER photograph on top");
w("    -- of the SAMPLE_PHOTO its checkpoint actually asks for. Laboratory evidence is");
w("    -- checkpoint-specific and 0053 is the only thing that may seed it.");
w("    and pa.responsible_role <> 'lab_tech')");
w(`insert into public.evidence_requirement`);
w(`  (process_activity_id, key, label, media_kinds, min_count, is_required, gates_submission,`);
w(`   capture_hint, ordering)`);
w(`select pa.id, r.key, r.label, array['photo']::text[], 1, true, true, r.hint, r.ord`);
w(`from pa, (values`);
w(`  ('BEFORE_PHOTO', 'Before starting', 'Photograph the material and the position before you begin.', 10),`);
w(`  ('AFTER_PHOTO',  'After finishing', 'Photograph the result before you finish the task.', 20)`);
w(`) as r(key, label, hint, ord)`);
w(`on conflict do nothing;`);
w();
w();
w(`-- ── 6 · The gate the Turner actually has. ──────────────────────────────────`);
w(`-- Eight hours from THAT pile's own T1 ACTUAL end (F10). It is a condition on an actual,`);
w(`-- so it is a gate rule and never a planned hour. T2 = T0 start + 24 h was rejected on`);
w(`-- 30 Aug and must not be built.`);
w();
w(`with pd as (select id from public.process_definition where code = ${q(CODE)} and version = ${VERSION})`);
w(`insert into public.gate_rule`);
w(`  (process_activity_id, phase, kind, config, predecessor_binding, is_enabled,`);
w(`   mapping_confidence, blocked_reason_template, ordering)`);
w(`select t2.id, 'entry', 'PREDECESSOR',`);
w(`       jsonb_build_object('activity_codes', jsonb_build_array(t1.code), 'min_rest_hr', 8),`);
w(`       'SAME_SCOPE_INSTANCE', true, 'dictated',`);
w(`       'Locked — {predecessor_label} finished less than 8 hours ago. This pile''s T2 is eligible 8 hours after its own T1 actual end.',`);
w(`       10`);
w(`from pd`);
w(`join public.process_activity t2 on t2.process_definition_id = pd.id and t2.code like 'TRN-P%-T2'`);
w(`join public.process_activity t1 on t1.process_definition_id = pd.id`);
w(`  and t1.code = replace(t2.code, '-T2', '-T1')`);
w(`where not exists (`);
w(`  select 1 from public.gate_rule g`);
w(`   where g.process_activity_id = t2.id and g.phase = 'entry' and g.kind = 'PREDECESSOR');`);
w();

writeFileSync(join(app, 'supabase/migrations/0043_process_2026c.sql'), L.join('\n') + '\n');

console.log(`0043_process_2026c.sql written`);
console.log(`  activities  ${rows.length}`);
console.log(`  holds       ${rows.filter((r) => r.is_hold).length}`);
console.log(`  turner      ${rows.filter((r) => r.code.startsWith('TRN-')).length}`);
console.log(`  bunker      ${rows.filter((r) => r.code.startsWith('BNK-')).length}`);
console.log(`  tunnel      ${rows.filter((r) => r.code.startsWith('TN-') || r.code.startsWith('TUN-')).length}`);
console.log(`  rel_day     0 … ${totalDays}`);
console.log(`  envelope    H${S.envelope} · anchor H${S.anchor} · discharged H${S.full_discharge}`);
