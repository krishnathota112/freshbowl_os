# MushroomOS Tasks — portable project

Freshbowl's SOP-to-batch planner, factory evidence capture and management views. Release **2.8 / Android versionCode 19** includes daily/monthly planning, spreadsheet range editing and the advisory Factory Flow view.

## Work on your laptop

Install Node.js 22 or newer and Git. Clone the release branch or extract the complete source ZIP, then open this folder:

```sh
cd mushroomos-tasks
npm run setup
npm run check
npm test
npm run dev
```

Open `http://127.0.0.1:5190/`. The server also exposes the separate weighbridge app at `/weighbridge/` and prepared Android downloads at `/downloads/`.

The public configuration connects to the restored factory Supabase project. Real logins and edits use live factory data. For isolated development, change `app/www/config.js` to a compatible test project with its matching publishable key. The older datacollection database is not compatible with Tasks.

## Included source

| Folder | Purpose |
| --- | --- |
| `app/www/` | Complete Tasks frontend, also packaged in Android |
| `app/tests/` | Automated fixture tests |
| `app/android/` | Capacitor Android project and Gradle wrapper |
| `weighbridge-app/` | Separate weighbridge frontend and Android source |
| `database/` | Migrations 0144–0160, rollback/proof/recovery scripts |
| `docs/` | Release notes, visualization roadmap, historical product decisions |
| `reference/` | Factory process references and planning workbooks |
| `scripts/` | Preview, source checks and deployment verification |
| `release-site/` | APK download page and manifest; installers are distribution artifacts |

The containing repository also preserves the larger React MushroomOS engine in `../mushroomos/`. Tasks owns `tk_*` records; weighments use `wb_*`. They share existing Supabase authentication and infrastructure.

Git and the source ZIP exclude credentials, database/storage backups, live-record snapshots, node_modules, Gradle caches, machine-specific SDK paths and signing keys. Lockfiles and the Gradle wrapper are included. Keep private backups and signing keys separately.

## Spreadsheet editing

- Type into the SOP/batch grid; Enter moves down and Tab moves between fields.
- Shift-click or Shift+arrows selects a rectangular range on the visible task page.
- Ctrl+C / Ctrl+V copies/pastes TSV ranges to/from Excel, including quoted multiline cells.
- Ctrl+D or **Fill down** repeats the first selected row into rows below.
- Ctrl+Z / Ctrl+Y or **Undo / Redo** restores local edits and row additions/removals.
- Save commits through the existing guarded plan operation. Protected rows cannot be changed. Pasting beyond the visible page is refused with an explanation.

## Android build

Install **JDK 17** and the Android SDK platform/build tools required by `app/android/variables.gradle`. Set `JAVA_HOME` and `ANDROID_HOME` on your laptop; Android Studio can configure the SDK.

```sh
cd app
npm ci
npx cap sync android
cd android
./gradlew assembleDebug
```

On Windows use `gradlew.bat assembleDebug`. Open `app/android` in Android Studio if preferred. Output: `app/android/app/build/outputs/apk/debug/app-debug.apk`.

Update `app/www/build-info.js`, `app/package.json`, its lockfile and `app/android/app/build.gradle` together. Re-sync after the final frontend edit. Use the same signing key as an installed release for an in-place update; compare certificates before claiming compatibility. `npm run release:prepare` creates a versioned installer and manifest after building.

Version 2.8.1 installs alongside the older app as **MushroomOS Tasks GK**, package `in.freshbowl.tasks.gk`, because the original signing key is unavailable. Keep the old app installed and sync pending work there. Use the same factory login in the GK app. The current build uses this computer's debug signing key; preserve that key privately for future GK updates, or plan a separately signed production package. Never commit signing keys.

## Database work

Install dependencies in `database/`, copy `.env.example` to `.env.local` and supply a server-side connection privately. Never put a database password or service-role key in `www/` or Git.

These migrations depend on the existing project's role helpers, profiles, audit table and Lab register. They are not a complete bootstrap for an empty database. Normal frontend development does not require migrations. Never reset/reseed the factory database; `flush-tasks-batches.mjs` is intentionally disabled.

## Deployment and roadmap

The November release targets free Cloudflare Pages project `freshbowl-factory-tasks`. Static deployment uses `app/www/` at the root, prepared APK downloads under `/downloads/`, and the weighbridge frontend under `/weighbridge/`.

```sh
npm run check
npm test
node scripts/stage-site.mjs
npm run release:verify -- https://freshbowl-factory-tasks.pages.dev/
```

See [release notes](docs/RELEASE_2_8.md), [visualization plan](docs/DATA_VISUALIZATION_PLAN.md), and `DEPLOYMENT.json` for publication evidence. Factory Flow is advisory: inferred capacities and reference windows do not prove occupancy, readiness or Lab clearance.

`stage-site.mjs` copies only public frontend and prepared download assets into a fresh `.work/pages/` directory. Deploy that directory to the existing Pages project with your own Cloudflare login. The original project used a different account. Do not deploy the repository root.

[PROJECT_HISTORY.md](docs/PROJECT_HISTORY.md) preserves the old README. Later code and explicit owner decisions supersede historical sequence-gate rules, release versions and hosting addresses.
