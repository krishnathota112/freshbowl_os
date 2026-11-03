# November source and Tasks release handoff

Start with `mushroomos-tasks/README.md` for the deployed Tasks app. `mushroomos/` is the separate React process engine. The source snapshot preserves all currently present required code and migrations, and records the checkout's existing removal of legacy/decompiled archives. Private credentials, dependencies, build caches, database/storage backups and signing keys are excluded.

## Tasks 2.8.1

- Production: https://freshbowl-factory-tasks.pages.dev/
- Android: https://freshbowl-factory-tasks.pages.dev/downloads/
- 162 frontend tests passed; source checks passed. Browser fixture checks verified daily/monthly rendering, protected rows, fill-down, undo, and guarded plan save without factory writes.
- APK built successfully with JDK 17. New package `in.freshbowl.tasks.gk` installs alongside the older app because the original signing key is unavailable. Sign in using the existing factory account. Keep the older installation and sync its pending work.
- Factory Flow capacity planning is advisory. See `mushroomos-tasks/docs/DATA_VISUALIZATION_PLAN.md` for metric definitions, source mappings, phases and acceptance criteria.
- No production database migration or reset was performed. Existing guarded RPCs implement plan saving.
- Capacitor Android/Core/CLI are patched to 6.2.3. The shipped runtime dependency audit reports zero vulnerabilities. Five development-toolchain alerts remain in the legacy CLI dependency chain; a future toolchain migration needs separate validation. The other native source projects need their own dependency review before APK distribution. See the detailed Tasks release notes.

## React engine validation limits

`npm run build` passed. The broader `npm test` run reported 11 passing files and 35 failing files: database suites refused the saved remote target through the local-only guard, the hour-grid fixture `docs/_reference/source/book1_hour_grid.json` is absent, and two structure assertions still expect removed legacy files / reject existing component test names. These are separate from the Tasks release. Do not bypass the database target guard to make the test run pass. Use an isolated local stack for database tests.

## Laptop setup

Extract the source ZIP, open `mushroomos-tasks`, then run `npm run setup`, `npm run check`, `npm test`, and `npm run dev`. Node.js 20+ is required. Android builds additionally need JDK 17 and an Android SDK. Factory records remain in Supabase and are not embedded in this source archive. Obtain any private development credentials separately.

The release was prepared on branch `codex/tasks-release-2026-11-03` and is now included in `main`. Git ancestry checks confirmed that `main` could be fast-forwarded to the tested release without conflicts. No force-push was used.
