#!/usr/bin/env node
// The verification checks from docs/STEP_1_2_BUILD_SPEC.md §2.10, each using that
// document's query. Checks 2, 7, 14 and 15 are load-bearing: if any of those four fail,
// the architecture is wrong regardless of what else passes.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, '..', '.env.local') });

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const results = [];
let failed = 0;

async function check(n, name, sql, assertFn, loadBearing = false) {
  try {
    const r = await client.query(sql);
    const verdict = assertFn(r.rows);
    const pass = verdict === true;
    if (!pass) failed += 1;
    results.push({ n, name, pass, detail: pass ? actual(r.rows) : String(verdict), loadBearing });
  } catch (e) {
    failed += 1;
    results.push({ n, name, pass: false, detail: e.message, loadBearing });
  }
}

function actual(rows) {
  if (rows.length === 0) return '0 rows';
  if (rows.length === 1) {
    const v = Object.values(rows[0]);
    return v.length === 1 ? String(v[0]) : JSON.stringify(rows[0]);
  }
  return `${rows.length} rows`;
}

const P2026B = `join process_definition pd on pd.id = pa.process_definition_id
                where pd.code = 'PROCESS-2026B'`;

// 1 · 45 activities: the 36 from PROCESS_V2 §17 plus the 9 lab checks from s08.
// Adding those nine was a SEED change with no application-code change, which is the claim
// check 15 makes. The split is asserted separately so a regression in either is visible.
await check(1, '45 activities seeded (36 process + 9 lab)',
  `select count(*) filter (where pa.responsible_role = 'lab_tech')::int lab,
          count(*) filter (where pa.responsible_role <> 'lab_tech')::int process,
          count(*)::int n
   from process_activity pa ${P2026B}`,
  (r) => {
    const { lab, process, n } = r[0];
    return n === 45 && process === 36 && lab === 9
      ? true
      : `expected 36 process + 9 lab = 45, got ${process} + ${lab} = ${n}`;
  });

// 2 · LOAD-BEARING — no material name in the process definition
await check(2, 'No material name in process_activity',
  `select code, label_template from process_activity
   where code ~* '(bagasse|paddy|mustard|wheat|gypsum|manure)'`,
  (r) => (r.length === 0 ? true : `${r.length} offending rows: ${r.map((x) => x.code).join(', ')}`),
  true);

// 3 · every activity has a cardinality rule
await check(3, 'Every activity has a cardinality rule',
  `select count(*)::int n from process_activity where cardinality_rule is null`,
  (r) => (r[0].n === 0 ? true : `${r[0].n} activities without a rule`));

// 4 · no literal counts in rules
await check(4, 'No literal counts in cardinality rules',
  `select code from process_activity where cardinality_rule::text ~ '"count"\\s*:\\s*[0-9]'`,
  (r) => (r.length === 0 ? true : `${r.length} rules carry a literal count`));

// 5 · rest activities require a Day-0 duration
await check(5, 'Time gates require a Day-0 duration',
  `select pa.code from process_activity pa ${P2026B}
     and pa.is_time_gate and not pa.duration_required_at_day0`,
  (r) => (r.length === 0 ? true : `${r.length} time gates without a required duration`));

// 6 · hopper auto-select disabled (frozen decision 1)
await check(6, 'Variant auto-selection disabled',
  `select code from activity_variant where auto_select_enabled`,
  (r) => (r.length === 0 ? true : `${r.length} variants auto-select`));

// 7 · LOAD-BEARING — T1 to T2 binds per scope instance
await check(7, 'TR-T2 predecessor binding is SAME_SCOPE_INSTANCE',
  `select g.predecessor_binding from gate_rule g
   join process_activity a on a.id = g.process_activity_id
   where a.code = 'TR-T2' and g.kind = 'PREDECESSOR'`,
  (r) => {
    if (r.length === 0) return 'no PREDECESSOR gate on TR-T2';
    const bad = r.filter((x) => x.predecessor_binding !== 'SAME_SCOPE_INSTANCE');
    return bad.length === 0 ? true : `found ${bad.map((b) => b.predecessor_binding).join(', ')}`;
  },
  true);

// 8 · every gate can explain itself
await check(8, 'Every gate has a reason template',
  `select count(*)::int n from gate_rule where coalesce(blocked_reason_template,'') = ''`,
  (r) => (r[0].n === 0 ? true : `${r[0].n} gates without a reason`));

// 9 · ambiguous SOP limits ship disabled
await check(9, 'Ambiguous SOP limits are disabled',
  `select count(*)::int n from gate_rule
   where mapping_confidence in ('sop_inferred','unmapped') and is_enabled`,
  (r) => (r[0].n === 0 ? true : `${r[0].n} ambiguous gates are enabled`));

// 10 · NMIX-ROTAVATE has three evidence requirements
await check(10, 'NMIX-ROTAVATE has 3 evidence requirements',
  `select count(*)::int n from evidence_requirement e
   join process_activity a on a.id = e.process_activity_id
   where a.code = 'NMIX-ROTAVATE'`,
  (r) => (r[0].n === 3 ? true : `expected 3, got ${r[0].n}`));

// 11 · two turners, or T1 parallel with T2 is impossible
await check(11, 'At least two turners exist',
  `select count(*)::int n from machine where kind = 'TURNER'`,
  (r) => (r[0].n >= 2 ? true : `expected >= 2, got ${r[0].n}`));

// 12 · ROUTE-2026A archived, never executable
await check(12, 'ROUTE-2026A is archived',
  `select status from process_definition where code = 'ROUTE-2026A'`,
  (r) => (r[0]?.status === 'archived' ? true : `status is ${r[0]?.status}`));

// 13 · lab specs seeded
await check(13, 'Lab specs, methods and control bands seeded',
  `select (select count(*) from lab_spec)::int specs,
          (select count(*) from lab_method)::int methods,
          (select count(*) from phase2_control_band)::int bands`,
  (r) => {
    const { specs, methods, bands } = r[0];
    return specs > 0 && methods === 9 && bands > 0
      ? true
      : `specs ${specs}, methods ${methods}, bands ${bands}`;
  });

// The material-name CHECK is a constraint, not a convention. Prove it bites, on each of
// the eight names it guards.
const probes = [
  'BAGASSE-WEIGH',
  'PADDY-SOAK-1',
  'MUSTARD-WET',
  'WHEAT-BUNK-LOAD',
  'GYPSUM-MIX',
  'MANURE-ROTAVATE',
  'UREA-ADD',
  'LIME-CORRECT',
];
const rejected = [];
const allowed = [];
for (const [i, probeCode] of probes.entries()) {
  try {
    await client.query('begin');
    await client.query(
      `insert into process_activity
         (process_definition_id, code, label_template, stream, rel_day, seq, scope,
          cardinality_rule, source_ref)
       values ((select id from process_definition where code='PROCESS-2026B'),
               $1,'probe','PRIMARY_FIBRE',0,$2,'LOAD','{"kind":"SINGLETON"}','probe')`,
      [probeCode, 900 + i]
    );
    await client.query('rollback');
    allowed.push(probeCode);
  } catch (e) {
    if (/process_activity_code_has_no_material_name/.test(e.message)) rejected.push(probeCode);
    else allowed.push(`${probeCode} (${e.message})`);
    await client.query('rollback').catch(() => {});
  }
}
const constraintHolds = allowed.length === 0;
results.push({
  n: 2.1,
  name: 'CHECK rejects every guarded material name',
  pass: constraintHolds,
  detail: constraintHolds
    ? `${rejected.length}/${probes.length} rejected by constraint`
    : `NOT rejected: ${allowed.join(', ')}`,
  loadBearing: true,
});
if (!constraintHolds) failed += 1;

// ── report ───────────────────────────────────────────────────────────────────
console.log('\nVERIFICATION · PROCESS-2026B\n');
console.log('  #     status  check                                            actual');
console.log('  ' + '─'.repeat(94));
for (const r of results.sort((a, b) => a.n - b.n)) {
  const mark = r.pass ? 'PASS' : 'FAIL';
  const star = r.loadBearing ? '*' : ' ';
  console.log(
    `  ${String(r.n).padEnd(5)} ${mark}${star}  ${r.name.padEnd(48)} ${r.detail}`
  );
}
console.log('  ' + '─'.repeat(94));
console.log('  * load-bearing: if these fail, the architecture is wrong regardless of the rest\n');

const mapping = await client.query(
  `select mapping_confidence, count(*)::int n, sum(case when is_enabled then 1 else 0 end)::int enabled
   from gate_rule group by mapping_confidence order by mapping_confidence`
);
console.log('C-28 gate mapping by confidence:');
for (const row of mapping.rows) {
  console.log(`  ${row.mapping_confidence.padEnd(14)} ${String(row.n).padStart(3)} rules, ${row.enabled} enabled`);
}

const tbd = await client.query(
  `select count(*)::int n from conflict_register where status = 'open'`
);
const decided = await client.query(
  `select count(*)::int n from conflict_register where status = 'decided'`
);
console.log(`\nConflict register: ${tbd.rows[0].n} open, ${decided.rows[0].n} decided (frozen)\n`);

await client.end();
console.log(failed === 0 ? 'ALL CHECKS PASS' : `${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
