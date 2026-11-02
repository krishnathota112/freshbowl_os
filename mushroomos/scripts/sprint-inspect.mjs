// Read-only MVP inspection. Never prints connection strings or credentials.
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env.local', import.meta.url) });
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
  statement_timeout: 20000, options: '-c default_transaction_read_only=on' });
try {
  await db.connect();
  for (const [name, sql] of [
    ['process', 'select * from v_process_catalogue where is_current'],
    ['lab_states', "select a.state,count(*) from batch_activity a join master_batch b on b.id=a.master_batch_id where b.status='active' and a.responsible_role='lab_tech' group by a.state"],
    ['roles', 'select role,count(*) from profiles where is_active group by role'],
    ['views', "select viewname,definition from pg_views where schemaname='public' and viewname in ('v_my_work','v_lab_queue','v_extension_request')"],
  ]) console.log(name, JSON.stringify((await db.query(sql)).rows));
} catch (e) { console.error(e.code ?? '', e.message); process.exitCode = 1; }
finally { await db.end(); }
