# MushroomOS Tasks

Current release: **v1.9 / code 10**. APK Logout is restored with confirmation.
Admin timing defaults, automatic scheduling,
and safe kg/tons switching: see `../docs/AUTO_TIMING_AND_WEIGHT_UNITS.md`.
Task starts are independent (0155); the older sequence/gate description below is historical.

A separate, simple task app: the Admin writes the SOP as a table (like Excel), publishes versions, creates a batch
on a version, and every row becomes a task on the phone. Lines run side by side; inside a line tasks go in order;
Lab rows any time; a Lab gate waits for GM approval. Same logins as MushroomOS, own tables `tk_*` (migration 0144).

Full requirements, status and next steps: `../docs/PRD_MUSHROOMOS_TASKS.md`.

v1.1 adds an optional suggested date/time column to each SOP row. The Admin writes example dates against an SOP
reference H0; a new batch shifts them to its H0. Task screens show the suggested time beside actual execution.
Migrations `../database/0144`–`0147` are applied to the live database. Current APK: v1.2 (versionCode 3).

- `www/` is the whole app (plain HTML/JS) — the same files are the APK and the web page.
- Package `in.freshbowl.tasks`, name "MushroomOS Tasks". Android shell copied from `datalog-app/` (Capacitor 6).
- Build: `npx cap sync android && cd android && JAVA_HOME=/c/Users/prath/.jdks/jbr-17.0.14 ./gradlew.bat assembleDebug`
- Web: `npx wrangler@4 pages deploy www --project-name mushroomos-tasks --branch main` (owner runs it).
