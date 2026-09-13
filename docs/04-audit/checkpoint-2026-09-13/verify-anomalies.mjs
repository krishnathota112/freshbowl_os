// Read-only follow-up checks on the migration classification. Files and saved snapshot only.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO = process.argv[2];
const MIG = join(REPO, 'mushroomos/supabase/migrations');
const snap = JSON.parse(readFileSync(join(REPO, 'docs/04-audit/context-comparison-2026-09-13/database-readonly.json'), 'utf8'));
const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
const read = (f) => readFileSync(join(MIG, f), 'utf8');
const norm = (s) => s.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').trim();
const liveSrc = (name) => snap.functions.filter((f) => f.proname === name).map((f) => { const m = f.body.match(/AS (\$[A-Za-z_]*\$)([\s\S]*)\1/); return m ? norm(m[2]) : ''; });
const bodiesIn = (file, name) => [...read(file).matchAll(new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?"?${name}"?\\s*\\([\\s\\S]*?\\bas\\s+(\\$[A-Za-z_]*\\$)([\\s\\S]*?)\\1`, 'gi'))].map((m) => norm(m[2]));

console.log('═══ 1 · functions whose final migration body differs from live');
const differ = { set_activity_plan: '0007', send_alert: '0007', set_factory_timezone: '0011', set_batch_start_at: '0011', release_elapsed_rests: '0012', cancel_batch: '0013', validate_batch: '0032', create_master_batch: '0044', advance_batch: '0077' };
for (const [fn, from] of Object.entries(differ)) {
  const live = liveSrc(fn);
  const touching = files.filter((f) => new RegExp(`\\b${fn}\\b`).test(read(f))).map((f) => f.slice(0, 4));
  const exactIn = files.filter((f) => bodiesIn(f, fn).some((b) => live.includes(b))).map((f) => f.slice(0, 4));
  // does live equal the file body with an assert_role guard line inserted?
  const fileBody = bodiesIn(files.find((f) => f.startsWith(from)), fn)[0] || '';
  const liveNoGuard = live.map((l) => l.split('\n').filter((x) => !/assert_role|assert_may_execute/.test(x)).join('\n'));
  const fileNoGuard = fileBody.split('\n').filter((x) => !/assert_role|assert_may_execute/.test(x)).join('\n');
  const guardOnly = liveNoGuard.includes(fileNoGuard);
  const liveHasGuard = live.some((l) => /assert_role|assert_may_execute/.test(l));
  console.log(`${fn.padEnd(22)} final def in ${from} · live has guard: ${liveHasGuard} · live = file body minus guard lines: ${guardOnly} · exact body match in: [${exactIn.join(',') || 'none'}] · mentioned in: ${touching.join(',')}`);
}

console.log('\n═══ 2 · how 0058/0059 change function bodies');
for (const f of files.filter((x) => /^005[89]/.test(x))) {
  const t = read(f);
  console.log(`${f}: dynamic rewrite (execute/format/pg_get_functiondef): ${/pg_get_functiondef|execute\s+format|execute\s+replace|regexp_replace/i.test(t)} · assert_role count: ${(t.match(/assert_role/g) || []).length}`);
}

console.log('\n═══ 3 · catalog-unverifiable migrations: targeted evidence');
const col = (t, c) => snap.columns.find((x) => x.table_name === t && x.column_name === c);
console.log(`0042 half-hour axis · process_activity.standard_start_hour type = ${col('process_activity', 'standard_start_hour')?.data_type}`);
const anonFns = snap.functions.filter((f) => /(^|[{,])anon=X/.test(f.proacl || '')).map((f) => f.proname);
const publicFns = snap.functions.filter((f) => /(^|[{,])=X\//.test(f.proacl || '')).map((f) => f.proname);
console.log(`0057 no anon execute · functions executable by anon: ${anonFns.length} ${anonFns.slice(0, 6).join(',')} · by PUBLIC: ${publicFns.length} ${publicFns.slice(0, 6).join(',')}`);
const views = snap.relations.filter((r) => r.relkind === 'v');
const invoker = views.filter((r) => /security_invoker=(true|on)/i.test(JSON.stringify(r.reloptions)));
console.log(`0061 views not a back door · views with security_invoker: ${invoker.length}/${views.length}`);
console.log(`0063 lab approval queue · v_lab_approval_queue present: ${snap.views.some((v) => v.viewname === 'v_lab_approval_queue')}`);
const pa = snap.process_activity || [];
const holds = pa.filter((r) => r.is_hold === true);
console.log(`0047 holds need nobody · process_activity rows in snapshot: ${pa.length} · holds: ${holds.length} · holds with a responsible_role: ${holds.filter((h) => h.responsible_role).length}`);
const lca = snap.lab_checkpoint_activity || [];
console.log(`0052 lab checkpoint map · lab_checkpoint_activity rows: ${lca.length} · distinct maps in lab_checkpoint: ${[...new Set((snap.lab_checkpoint || []).map((r) => r.checkpoint_map))].join(',')}`);
const gr = snap.gate_rule || [];
console.log(`0055 evidence gates 2026c · gate_rule rows in snapshot: ${gr.length}`);
for (const f of ['0042', '0046', '0047', '0052', '0055', '0057', '0059', '0061', '0063', '0077']) {
  const file = files.find((x) => x.startsWith(f));
  const head = read(file).split('\n').filter((l) => l.startsWith('--')).slice(0, 3).map((l) => l.slice(2).trim()).join(' / ');
  console.log(`  ${file}: ${head.slice(0, 200)}`);
}

console.log('\n═══ 4 · 0042 "absent view public" parse artefact check');
console.log((read(files.find((x) => x.startsWith('0042'))).match(/create\s+(?:or\s+replace\s+)?view\s+\S+/gi) || []).join(' | '));
