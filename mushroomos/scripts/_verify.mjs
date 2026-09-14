import pg from 'pg';
import { readFileSync } from 'node:fs';
const raw=readFileSync('.env.local','utf8');const env={};
for(const l of raw.split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;env[t.slice(0,i).trim()]=t.slice(i+1).trim();}
const c=new pg.Client({connectionString:env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false}});await c.connect();
const q=async s=>(await c.query(s)).rows;
console.log('── Stage 1B window on PROCESS-2026C (H130–165) ──');
for (const r of await q(`select pa.code, pa.standard_start_hour s, pa.standard_end_hour e, pa.label_template l from process_activity pa join process_definition pd on pd.id=pa.process_definition_id where pd.code='PROCESS-2026C' and pa.standard_start_hour between 130 and 165 and pa.stream<>'YARD' order by pa.standard_start_hour, pa.code`)) console.log(`  H${r.s}–${r.e ?? '?'}  ${r.code.padEnd(16)} ${r.l.slice(0,75)}`);
console.log('\n── lab approvals recorded with NO sample and NO result (empirical) ──');
console.log(JSON.stringify(await q(`select mb.code batch, count(*) approved_with_nothing from lab_decision d join batch_activity ba on ba.id=d.batch_activity_id join master_batch mb on mb.id=ba.master_batch_id
  where d.verdict='approved' and not exists (select 1 from lab_sample s where s.batch_activity_id=ba.id) group by 1`)));
const body = fn => q(`select pg_get_functiondef(p.oid) b from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='${fn}'`).then(r=>r[0].b);
const d = await body('decide_lab_submission');
console.log('\n── decide_lab_submission mentions lab_sample / lab_result / COMPLETED? ──', /lab_sample/.test(d), /lab_result/.test(d), /COMPLETED|SUBMITTED/.test(d));
const s = await body('submit_activity'); const ca = await body('complete_activity');
console.log('── submit_activity mentions lab_sample/lab_result? ──', /lab_sample|lab_result/.test(s), '· complete_activity?', /lab_sample|lab_result/.test(ca));
console.log('\n── batches and activity counts now ──');
console.log(JSON.stringify(await q(`select mb.code, mb.status::text, pd.code proc, (select count(*) from batch_activity x where x.master_batch_id=mb.id) n from master_batch mb join process_definition pd on pd.id=mb.process_definition_id where mb.status::text<>'cancelled' order by 1`)));
await c.end();
