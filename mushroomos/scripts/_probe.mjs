import pg from 'pg'; import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`
  select p.proname, pg_get_function_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.provolatile='v'
    and has_function_privilege('authenticated', p.oid, 'execute')
  order by p.proname`);
console.log(`${r.rows.length} volatile functions executable by authenticated:\n`);
r.rows.forEach(x => console.log(`${x.proname}(${x.args})`));
console.log('\n--- process versions ---');
console.table((await c.query(`select code, standard_hr, activity_count from v_process_catalogue order by code`)).rows);
await c.end();
