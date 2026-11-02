# Android v1.4 — updates and performance

27 September 2026. Android package `in.freshbowl.tasks`, versionCode **5**, versionName **1.4**.

## Update delivery

The owner chose a visible **Update** button and approved publicly hosting the installer at
`https://freshbowl-tasks-downloads.pages.dev` (separate from the factory web app).
**Published and verified:** stable manifest and APK return HTTP 200; CORS is enabled for the manifest,
which uses `Cache-Control: no-store`. The hosted APK's size and SHA-256 match the local build exactly.
The local app's Update dialog successfully fetched and offered v1.4; the download page was also checked.
Deployment: `https://a9df5dc8.freshbowl-tasks-downloads.pages.dev`.
The public site contains only the APK, download page and release metadata. Anyone can inspect the APK's
code and bundled template text. Authentication and database permissions remain unchanged.

The button checks `latest.json` on demand, without sending factory session tokens. It accepts only this
HTTPS origin, the Tasks package ID, an integer versionCode, and an APK URL on the same origin. A larger
versionCode offers a download; equal/older versions do not offer a downgrade inside Android.
The external HTTPS link opens through Capacitor's existing Android browser intent. Users download the APK,
open it and confirm **Update** in Android. No silent installer, new install permission, OTA JavaScript
service, background download or automatic restart has been added.

Existing v1.3 and earlier APKs need **one manual installation of v1.4** to obtain the button. Do not uninstall.
v1.4 and v1.3 signatures were verified and their signing certificate SHA-256 fingerprints match.
The existing debug signing identity was preserved; this is still a debug build, not a Play Store release.
Keep that keystore safe for future upgrades. APK checksums are published for manual verification; the app
does not independently hash the browser's downloaded file. Android enforces upgrade signing identity.

## Performance changes

- SOP editor renders at most 20 rows at once, with Previous/Next controls at both ends. All master rows
  remain in memory and are included in validation/save. Process/Lab numbering, pile setup, descriptions,
  date shifting, copy/insert/move/delete and Enter navigation are preserved.
- Advanced settings dropdowns are constructed only when Task settings is opened.
- Batch Process/Lab/stream filters reuse the current response instead of fetching the entire batch again.
- Background batch/home checks flag the Refresh button when data changes, without replacing the screen.
  They skip hidden documents and do not overlap. Press Refresh to retrieve the latest visible data.
  Refresh warns before discarding a screen with editable controls.
- Route-generation guards prevent delayed screen loads from taking over a newer route.
- Approval/weighment badges no longer block the initial home screen from rendering.
- Identical simultaneous reads share a request. Network calls have a timeout, and writes are not retried
  automatically after ambiguous failures. Unknown photo-registration outcomes do not delete evidence.
- Task photos over 700 KiB are prepared locally, at up to 2000px on the longest side, JPEG quality 85%;
  the original is used if the prepared copy is larger. JPEG/PNG/WebP inputs up to 30 MiB are accepted.
  The raw camera file is not separately archived; this is a resized evidence image. Existing photos are untouched.
- Photo completion updates its upload status without wiping machine, remarks or Lab entries. Task buttons
  reject duplicate taps while running and wait for active photo uploads. Existing gallery images load lazily.
- Existing Admin weighments functionality remains. The separate Weighbridge APK was not changed.

## Verification

`cd app; npm test` — 16 tests; three consecutive successful runs after correcting a test's asynchronous
hashchange wait. Covers pagination, hidden-row preservation, numbering, settings, row duplication/addition,
date offsets, Enter navigation, stale responses, filter request counts, upload form preservation,
non-destructive background checks, image dimension calculation, manifest restrictions, read deduplication,
ambiguous registration cleanup and existing Turner template invariants.

Browser checks used the existing signed-in local app, read-only: batch Lab filter, new batch template,
20-row pages and separate Turner rows. No batch was created or modified. Android `assembleDebug` succeeded;
`apksigner verify` passed; `aapt` confirmed package ID, code 5 and version 1.4.

**Still needs a real phone test:** upgrade from the installed version, camera capture/rotation, upload on
factory signal, keyboard/scroll behaviour and the external browser/Android install flow. Desktop browser
checks do not prove all device-specific glitches are fixed. No physical-device profiling was performed.

The dependency audit reports two existing development-tool advisories (`@capacitor/cli` / its `tar`
dependency). They are not shipped in `www` or the APK. A major Capacitor migration was not mixed into this
patch; it requires a separate compatibility/build review.

## Publish future releases

1. Bump `app/android/app/build.gradle` versionCode/versionName and `app/www/build-info.js` together.
   Update the package version and asset cache suffixes too. Never reuse a published version for changed bytes.
2. Run `npm test` in `app`, `npx cap sync android`, and `android/gradlew.bat -p android assembleDebug`
   with Java 17. Keep the same signing identity. Test the upgrade on one factory phone first.
3. Verify the APK signature and package/version. Run `node app/scripts/prepare-release.mjs` from the project.
   This copies the APK into `apk/` and `release-site/`, computes its SHA-256/size, and creates `latest.json`.
   `RELEASE_NOTES` can supply the change summary. `--replace-unpublished` is for unpublished local builds only.
4. With the owner's release approval, deploy **only** `release-site/`:

   `npx wrangler@4 pages deploy release-site --project-name freshbowl-tasks-downloads --branch main`

5. Verify the stable URL's manifest, no-store/CORS headers and downloaded APK hash. Keep older published APKs
   in the release directory for existing download links. Workers tap **Update** when ready.

No database migration is required. Existing batches, SOP snapshots, photos and records remain unchanged.
The factory website is still a separate deployment; publishing the download site does not update it.
