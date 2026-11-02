// Read-only search for surviving batch context and physical-photo clues.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const local = createRequire(import.meta.url);
const sibling = createRequire(new URL('../../../mushroomos/package.json', import.meta.url));
const dep = name => { try { return local(name); } catch { return sibling(name); } };
dep('dotenv').config({
  path: existsSync(new URL('../.env.local', import.meta.url))
    ? new URL('../.env.local', import.meta.url)
    : new URL('../../../mushroomos/.env.local', import.meta.url),
  quiet: true,
});

const db = new (dep('pg').Client)({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 60000,
});
await db.connect();
try {
  await db.query('BEGIN READ ONLY');
  const tables = (await db.query(`
    SELECT table_name, array_agg(column_name ORDER BY ordinal_position) AS columns
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (table_name LIKE '%batch%' OR table_name LIKE '%photo%' OR table_name LIKE '%evidence%')
    GROUP BY table_name ORDER BY table_name
  `)).rows;
  const wb = (await db.query(`
    SELECT id,batch_no,status,master_batch_id,created_at
    FROM public.wb_batch ORDER BY created_at
  `)).rows;
  const master = (await db.query(`
    SELECT id,code,status,created_at
    FROM public.master_batch
    WHERE code ~ '17[0-9]|18[0-9]' ORDER BY code
  `)).rows;
  const storage = (await db.query(`
    SELECT bucket_id, count(*)::int AS n,
      left(min(name),160) AS first_name,
      left(max(name),160) AS last_name
    FROM storage.objects GROUP BY bucket_id ORDER BY bucket_id
  `)).rows;
  const taskObjects = (await db.query(`
    SELECT id,bucket_id,name,owner,owner_id,metadata,path_tokens,version,created_at,updated_at
    FROM storage.objects WHERE bucket_id='tasks' ORDER BY created_at LIMIT 3
  `)).rows;
  const storageObjectColumns = (await db.query(`
    SELECT column_name,is_nullable,column_default,data_type
    FROM information_schema.columns
    WHERE table_schema='storage' AND table_name='objects'
    ORDER BY ordinal_position
  `)).rows;
  const taskPhotos = (await db.query(`
    SELECT * FROM public.tk_photo ORDER BY taken_at LIMIT 3
  `)).rows;
  const audit = (await db.query(`
    SELECT entity_table,action,count(*)::int AS n
    FROM public.audit_event
    WHERE entity_table LIKE 'tk_%' OR entity_table LIKE 'wb_%'
    GROUP BY entity_table,action ORDER BY entity_table,action
  `)).rows;
  console.log(JSON.stringify({tables,wb,master,storage,storageObjectColumns,taskObjects,taskPhotos,audit},null,2));
  await db.query('ROLLBACK');
} finally { await db.end(); }
