// Read-only: classify every migration file against the saved catalog snapshot. No database access.
import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const REPO = process.argv[2];
const MIG = join(REPO, 'mushroomos/supabase/migrations');
const snap = JSON.parse(readFileSync(join(REPO, 'docs/04-audit/context-comparison-2026-09-13/database-readonly.json'), 'utf8'));

const norm = (s) => s.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').trim();
const liveFns = new Map();
for (const f of snap.functions) {
  const m = f.body.match(/AS (\$[A-Za-z_]*\$)([\s\S]*)\1/);
  const src = m ? norm(m[2]) : null;
  if (!liveFns.has(f.proname)) liveFns.set(f.proname, []);
  liveFns.get(f.proname).push({ src, acl: f.proacl || '' });
}
const liveRel = new Set(snap.relations.map((r) => r.relname));
const liveCol = new Set(snap.columns.map((c) => `${c.table_name}.${c.column_name}`));
const liveView = new Set(snap.views.map((v) => v.viewname));
const liveTrg = new Set(snap.triggers.map((t) => t.tgname));
const livePol = new Set(snap.policies.map((p) => `${p.tablename}.${p.policyname}`));

const tracked = new Set(execSync('git ls-files mushroomos/supabase/migrations', { cwd: REPO }).toString().split('\n').filter(Boolean).map((p) => p.split('/').pop()));
const modified = new Set(execSync('git diff --name-only -- mushroomos/supabase/migrations', { cwd: REPO }).toString().split('\n').filter(Boolean).map((p) => p.split('/').pop()));

const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');

// last file that creates or drops each function / view, so superseded definitions are not misread as unapplied
const lastFn = new Map(), lastView = new Map();
const parsed = files.map((file) => {
  const raw = readFileSync(join(MIG, file), 'utf8');
  const sql = stripComments(raw);
  const fns = [];
  const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?(\w+)"?\s*\([\s\S]*?\bas\s+(\$[A-Za-z_]*\$)([\s\S]*?)\2/gi;
  let m;
  // bodies must be taken from the raw text: comments inside a body are part of prosrc
  const reRaw = new RegExp(re.source, 'gi');
  while ((m = reRaw.exec(raw))) fns.push({ name: m[1].toLowerCase(), src: norm(m[3]) });
  const drops = [...sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi)].map((x) => x[1].toLowerCase());
  const views = [...sql.matchAll(/create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?"?(\w+)"?/gi)].map((x) => x[1].toLowerCase());
  const dropViews = [...sql.matchAll(/drop\s+view\s+(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi)].map((x) => x[1].toLowerCase());
  const tables = [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi)].map((x) => x[1].toLowerCase());
  const cols = [...sql.matchAll(/alter\s+table\s+(?:only\s+)?(?:public\.)?"?(\w+)"?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?/gi)].map((x) => `${x[1]}.${x[2]}`.toLowerCase());
  const trgs = [...sql.matchAll(/create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+"?(\w+)"?/gi)].map((x) => x[1].toLowerCase());
  const pols = [...sql.matchAll(/create\s+policy\s+("[^"]+"|\w+)\s+on\s+(?:public\.)?"?(\w+)"?/gi)].map((x) => `${x[2]}.${x[1].replace(/"/g, '')}`.toLowerCase());
  const data = /\b(insert\s+into|update\s+\w|delete\s+from)\b/i.test(sql) || /\bdo\s+\$/i.test(sql);
  const acl = /\b(grant|revoke)\b/i.test(sql);
  return { file, fns, drops, views, dropViews, tables, cols, trgs, pols, data, acl };
});
for (const p of parsed) {
  for (const f of p.fns) lastFn.set(f.name, p.file);
  for (const d of p.drops) if (!p.fns.some((f) => f.name === d)) lastFn.set(d, `DROP:${p.file}`);
  for (const v of p.views) lastView.set(v, p.file);
  for (const v of p.dropViews) if (!p.views.includes(v)) lastView.set(v, `DROP:${p.file}`);
}

const rows = [];
for (const p of parsed) {
  const ev = { match: [], mismatch: [], superseded: [], present: [], absent: [] };
  for (const f of p.fns) {
    const live = liveFns.get(f.name) || [];
    if (lastFn.get(f.name) !== p.file) { ev.superseded.push(f.name); continue; }
    if (live.length === 0) ev.absent.push(`fn ${f.name}`);
    else if (live.some((l) => l.src === f.src)) ev.match.push(`fn ${f.name}`);
    else ev.mismatch.push(`fn ${f.name}`);
  }
  const chk = (list, set, label) => list.forEach((x) => (set.has(x) ? ev.present : ev.absent).push(`${label} ${x}`));
  chk(p.tables.filter((t) => !p.file.includes('drop')), liveRel, 'table');
  chk(p.cols, liveCol, 'col');
  chk(p.views.filter((v) => lastView.get(v) === p.file), liveView, 'view');
  chk(p.trgs, liveTrg, 'trigger');
  chk(p.pols, livePol, 'policy');

  let verdict;
  const positive = ev.match.length + ev.present.length;
  if (ev.mismatch.length && !ev.match.length) verdict = 'NOT APPLIED (final function bodies differ from live)';
  else if (ev.mismatch.length) verdict = 'PARTIAL / DIFFERS (some final bodies differ)';
  else if (ev.absent.length && !positive) verdict = 'NOT APPLIED (objects absent)';
  else if (ev.absent.length) verdict = 'UNCERTAIN (some objects absent)';
  else if (positive) verdict = 'APPLIED (every final object matches live)';
  else if (ev.superseded.length) verdict = 'SUPERSEDED (all its definitions replaced by later files)';
  else verdict = 'NOT VERIFIABLE FROM CATALOG (grants/data/constraints only)';

  const git = !tracked.has(p.file) ? 'untracked (new)' : modified.has(p.file) ? 'tracked, MODIFIED' : 'tracked, unchanged';
  rows.push({ file: p.file, git, verdict, data: p.data, acl: p.acl, ...ev });
}

const fmt = (a) => (a.length ? a.join(', ') : '');
for (const r of rows) {
  console.log(`${r.file.padEnd(58)} | ${r.git.padEnd(18)} | ${r.verdict}`);
  const bits = [];
  if (r.mismatch.length) bits.push(`differs: ${fmt(r.mismatch)}`);
  if (r.absent.length) bits.push(`absent: ${fmt(r.absent)}`);
  if (r.superseded.length) bits.push(`superseded: ${r.superseded.length}`);
  if (r.data) bits.push('has data statements');
  if (r.acl) bits.push('has grant/revoke');
  if (bits.length) console.log(`${''.padEnd(58)} |   ${bits.join(' · ')}`);
}
const tally = {};
for (const r of rows) { const k = `${r.git} → ${r.verdict.split(' (')[0]}`; tally[k] = (tally[k] || 0) + 1; }
console.log('\nTALLY'); for (const [k, v] of Object.entries(tally).sort()) console.log(`  ${String(v).padStart(3)}  ${k}`);
