#!/usr/bin/env node
// Row counts for the tables the seed owns. Used to prove seed idempotency:
// apply the seed twice and these numbers must not move.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local') });

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const r = await c.query(`
  select
    (select count(*) from process_definition)::int      as process_definitions,
    (select count(*) from process_activity)::int        as activities_all,
    (select count(*) from process_activity pa join process_definition pd
       on pd.id = pa.process_definition_id
      where pd.code = 'PROCESS-2026B')::int             as activities_2026b,
    (select count(*) from activity_field)::int          as activity_fields,
    (select count(*) from activity_variant)::int        as variants,
    (select count(*) from evidence_requirement)::int    as evidence_reqs,
    (select count(*) from gate_rule)::int               as gate_rules,
    (select count(*) from movement_rule)::int           as movement_rules,
    (select count(*) from resource_requirement)::int    as resource_reqs,
    (select count(*) from material)::int                as materials,
    (select count(*) from material_role_eligibility)::int as role_eligibility,
    (select count(*) from material_spec)::int           as material_specs,
    (select count(*) from location)::int                as locations,
    (select count(*) from machine)::int                 as machines,
    (select count(*) from lab_spec)::int                as lab_specs,
    (select count(*) from lab_method)::int              as lab_methods,
    (select count(*) from phase2_control_band)::int     as control_bands,
    (select count(*) from conflict_register)::int       as conflict_entries
`);
console.log(JSON.stringify(r.rows[0], null, 2));
await c.end();
