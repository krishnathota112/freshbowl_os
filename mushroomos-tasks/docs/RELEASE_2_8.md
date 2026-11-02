# Release 2.8 / Android code 19

Prepared 3 November 2026 for the owner's new Cloudflare account. The release keeps the original Tasks backend at `szwosmyqwvpaqugjtzcp.supabase.co`.

## Included

- Daily task assignment and monthly batch chart, including task/batch editing and Paddy timing advice.
- Spreadsheet range selection by Shift-click or Shift+arrows, rectangular TSV copy/paste, fill-down, and undo/redo in the shared SOP/batch grid.
- Spreadsheet changes are local edits until the existing Save action is used. Protected rows remain protected; invalid bulk ranges are rejected atomically. A range is limited to the visible task page; select another page to edit its rows.
- Complete paginated reads for planning data, year-long planned interval look-back, and stale-response guards on rapid navigation.
- Individual task removal now goes through the existing batch snapshot/save guard, preserving recorded notes and other protected work without a new migration.
- Navigation links to Operations, Director brief and Factory Flow. Flow remains an explicitly labeled advisory using inferred reference capacities.
- Portable setup/preview/check scripts and the data visualization roadmap.

## Release evidence

Record the final test count, deployment URL, Git commit and APK hash in `DEPLOYMENT.json` after validation. Source and Android metadata identify v2.8/code 19. New Gradle/JDK caches, local SDK paths, credentials, private record snapshots, node_modules and generated assets are excluded from Git and the portable archive.

## Acceptance limits

Automated frontend tests use fixtures and mock API responses. A factory login walkthrough and physical Android camera/update check require the owner's real account/device. No production database migration, reset or bulk delete is part of this release.

The prior APK and this computer have different signing certificates. This release therefore installs separately as **MushroomOS Tasks GK**, package `in.freshbowl.tasks.gk`. Keep the old app installed and save/sync pending work there. Sign in to the new app with the existing factory account; server records use the same backend. Local sessions and unsynced data are not copied between installations. Future APKs need the same signing key as this release; signing keys stay outside Git and the source ZIP.
