import pg from 'pg'; import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const c=new pg.Client({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false}});
await c.connect();
const q=async(l,s)=>{const r=await c.query(s);console.log('\n== '+l+' ==');r.rows.length?console.table(r.rows):console.log('(none)')};
await q('profiles',`select id, display_name, role::text, is_active from public.profiles order by role limit 20`);
await q('session role',`select current_user, session_user`);
await q('roles exist',`select rolname from pg_roles where rolname in ('authenticated','anon')`);
await c.end();
