#!/usr/bin/env node
// Regenerates docs/SCHEMA.md from the DEPLOYED database.
// This file exists because two agents specified a table that already existed,
// under a different shape, and neither found out until one tried to create it.
//
//   node scripts/schema-snapshot.mjs
//
// Requires SUPABASE_DB_URL (or DATABASE_URL) in the environment.
// Commit the output. Regenerate it after every migration.

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

// The repository root intentionally has no second package. Resolve the pinned database client
// from the existing application package instead of installing a duplicate dependency here.
const requireFromApp = createRequire(new URL('../mushroomos/package.json', import.meta.url));
const pg = requireFromApp('pg');
const dotenv = requireFromApp('dotenv');

// Match the application's established local configuration path. Existing exported values win;
// dotenv only fills values that are absent, and credentials are never copied into the snapshot.
dotenv.config({ path: new URL('../mushroomos/.env.local', import.meta.url) });

const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!url) { console.error('SUPABASE_DB_URL or DATABASE_URL required'); process.exit(1); }

const db = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 120_000,
});
await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;

const tables = await q(`
  select c.relname as name, c.relkind as kind, c.relrowsecurity as rls,
         obj_description(c.oid) as comment
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','v','m','p')
   order by c.relkind, c.relname`);

const cols = await q(`
  select table_name, column_name, data_type, is_nullable, column_default
    from information_schema.columns where table_schema='public'
   order by table_name, ordinal_position`);

const cons = await q(`
  select conrelid::regclass::text as tbl, conname, contype,
         pg_get_constraintdef(oid) as def
    from pg_constraint
   where connamespace = 'public'::regnamespace
   order by conrelid::regclass::text, contype, conname`);

const fns = await q(`
  select p.proname as name, pg_get_function_identity_arguments(p.oid) as args,
         p.prosecdef as definer, pg_get_userbyid(p.proowner) as owner,
         array(select unnest(p.proacl)::text) as acl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' order by p.proname`);

const grants = await q(`
  select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
    from information_schema.role_table_grants
   where table_schema='public' and grantee in ('anon','authenticated','service_role')
   group by table_name, grantee order by table_name, grantee`);

const pols = await q(`
  select tablename, policyname, cmd, roles::text, qual, with_check
    from pg_policies where schemaname='public' order by tablename, policyname`);

const trg = await q(`
  select tgrelid::regclass::text as tbl, tgname, pg_get_triggerdef(oid) as def
    from pg_trigger where not tgisinternal
     and tgrelid in (select oid from pg_class where relnamespace='public'::regnamespace)
   order by tgrelid::regclass::text, tgname`);

const viewSec = await q(`
  select c.relname,
         coalesce((select option_value from pg_options_to_table(c.reloptions)
                    where option_name='security_invoker'),'false') as security_invoker,
         pg_get_userbyid(c.relowner) as owner
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='v' order by c.relname`);

await db.end();

const by = (rows, k) => rows.reduce((a, r) => ((a[r[k]] ||= []).push(r), a), {});
const C = by(cols, 'table_name'), K = by(cons, 'tbl'), G = by(grants, 'table_name');
const P = by(pols, 'tablename'), T = by(trg, 'tbl');
const KIND = { r: 'table', v: 'view', m: 'matview', p: 'partitioned' };

const L = [];
L.push('# Schema — generated from the deployed database');
L.push('');
L.push(`**Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/schema-snapshot.mjs\`. Do not edit by hand.**`);
L.push('');
L.push('> **Read this before writing any migration, any table name, or any RPC signature.**');
L.push('> Migration files describe intent. This file describes what is actually deployed.');
L.push('> A table name that appears here is TAKEN. Check before you specify a new one.');
L.push('');
L.push(`${tables.filter(t=>t.kind==='r').length} tables · ${tables.filter(t=>t.kind==='v').length} views · ${fns.length} functions`);
L.push('');
L.push('## Name index — every relation in `public`');
L.push('');
L.push('| name | kind | RLS |');
L.push('|---|---|---|');
for (const t of tables) L.push(`| \`${t.name}\` | ${KIND[t.kind]} | ${t.kind === 'r' ? (t.rls ? 'on' : '**off**') : '—'} |`);
L.push('');
L.push('## Function index — every callable in `public`');
L.push('');
L.push('| function | definer | owner | granted to |');
L.push('|---|---|---|---|');
for (const f of fns) {
  const cl = (f.acl || []).filter(a => /^(anon|authenticated|PUBLIC)=/.test(a)).map(a => a.split('=')[0] || 'PUBLIC');
  L.push(`| \`${f.name}(${f.args})\` | ${f.definer ? '**DEFINER**' : 'invoker'} | ${f.owner} | ${cl.join(', ') || '—'} |`);
}
L.push('');
L.push('## Views — write-bypass check');
L.push('');
L.push('| view | owner | security_invoker |');
L.push('|---|---|---|');
// Postgres stores the reloption exactly as it was written, so a view created with
// `security_invoker = on` reads back as 'on', not 'true'. Comparing to 'true' alone reported all
// 38 views as bypassing RLS on 2026-09-11 while every one of them was in fact security_invoker —
// the one document agents are told to trust above all others, saying the opposite of the truth.
const isOn = (x) => ['on', 'true', '1', 'yes'].includes(String(x).toLowerCase());
for (const v of viewSec) L.push(`| \`${v.relname}\` | ${v.owner} | ${isOn(v.security_invoker) ? 'true' : '**false**'} |`);
L.push('');
L.push('---');
L.push('');
L.push('## Detail');
for (const t of tables) {
  L.push('');
  L.push(`### \`${t.name}\` — ${KIND[t.kind]}${t.kind === 'r' && !t.rls ? '  ⚠ RLS OFF' : ''}`);
  if (t.comment) L.push(`_${t.comment}_`);
  L.push('');
  L.push('| column | type | null | default |');
  L.push('|---|---|---|---|');
  for (const c of C[t.name] || []) L.push(`| ${c.column_name} | ${c.data_type} | ${c.is_nullable} | ${c.column_default ?? ''} |`);
  const kk = K[t.name] || [];
  if (kk.length) { L.push(''); L.push('**Constraints**'); L.push(''); for (const c of kk) L.push(`- \`${c.conname}\` — ${c.def}`); }
  const gg = G[t.name] || [];
  if (gg.length) { L.push(''); L.push('**Grants** — ' + gg.map(g => `${g.grantee}: ${g.privs}`).join(' · ')); }
  const pp = P[t.name] || [];
  if (pp.length) { L.push(''); L.push('**Policies**'); L.push(''); for (const p of pp) L.push(`- \`${p.policyname}\` ${p.cmd} to ${p.roles} — using \`${p.qual ?? '—'}\` check \`${p.with_check ?? '—'}\``); }
  const tt = T[t.name] || [];
  if (tt.length) { L.push(''); L.push('**Triggers**'); L.push(''); for (const x of tt) L.push(`- \`${x.tgname}\``); }
}
writeFileSync('docs/SCHEMA.md', L.join('\n') + '\n');
console.log(`docs/SCHEMA.md written — ${tables.length} relations, ${fns.length} functions`);
