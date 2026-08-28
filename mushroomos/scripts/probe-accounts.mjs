import pg from 'pg';
import { readFileSync } from 'node:fs';
const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const url = raw.split('\n').map(l => l.trim()).find(l => l.startsWith('SUPABASE_DB_URL=')).slice('SUPABASE_DB_URL='.length).trim().replace(/^["']|["']$/g, '');
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
const { rows } = await db.query(`select u.email, p.role::text, p.display_name, p.is_active from auth.users u join public.profiles p on p.id = u.id order by p.role, u.email`);
for (const r of rows) console.log(JSON.stringify(r));
await db.end();
