# MushroomOS — documentation folder

Everything about the project in one place, written on 15 Sep 2026. Start with 01 and read in order.

| File | What it covers |
|---|---|
| [01-project-overview.md](01-project-overview.md) | What MushroomOS is, the problem it solves, the roles, how a batch runs |
| [02-what-we-did.md](02-what-we-did.md) | Everything built and changed, in order, with the migration numbers |
| [03-process-flow.md](03-process-flow.md) | The standard process PROCESS-2026J, H0 → H476, every task with its rules |
| [04-database-tables.md](04-database-tables.md) | Every table and view, what it holds, and the key server functions |
| [05-roles-and-permissions.md](05-roles-and-permissions.md) | What each role can and cannot do, screen by screen |
| [06-file-structure.md](06-file-structure.md) | The repository and source-code layout |
| [07-operations-runbook.md](07-operations-runbook.md) | How to run it: batches, failsafe, logins, web link, APK, rollback |
| [08-security-and-monitoring.md](08-security-and-monitoring.md) | The anti-cheat rules, the role audit, and the monitoring views |
| [09-open-items.md](09-open-items.md) | Decisions still open and work still to do |

## Current state (15 Sep 2026)

- **Current process:** PROCESS-2026J (time gates, day plan).
- **Batches:** none running. All earlier test batches were cancelled (kept on record) so testing starts clean.
- **Database:** Supabase project `szwosmyqwvpaqugjtzcp`, migrations up to **0105**.
- **Web (Admin / GM):** served from this laptop through a Cloudflare quick tunnel (see 07).
- **Phone app:** Android APK (Supervisor, Lab, GM), built from `mushroomos/`.
- **Code:** local git only (branch `main`), not pushed.
