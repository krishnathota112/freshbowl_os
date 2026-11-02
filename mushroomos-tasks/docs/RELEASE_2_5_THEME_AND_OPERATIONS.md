# Tasks v2.5 — one web and APK release

Published 1 October 2026. This combines the v2.4 washi-and-pine visual theme with the read-only Factory Operations Manager dashboard that was already on the website. It changes no database schema or existing batch, task, photo, Lab or weighment records.

## Versions and distribution

- Android package: `in.freshbowl.tasks`, v2.5, versionCode 16. APK: `release-site/MushroomOS-Tasks-v2.5.apk` (6,568,135 bytes), SHA-256 `7053a0bcc61264ee6f13ff1fd08ac230f30574b9e6d35cd5bb1354d992e838b7`.
- Signing certificate SHA-256: `a8f9631604bb0ad4666b5b1608879822cb7a20bf836fa3beeea3aa02cd4d94c6`, identical to the published v2.4 APK. This preserves in-place update compatibility; a physical-phone install was not tested here.
- Tasks website: https://mushroomos-tasks.pages.dev/ (deployment https://61c2e11c.mushroomos-tasks.pages.dev/).
- APK update site: https://freshbowl-tasks-downloads.pages.dev/ (deployment https://69ada961.freshbowl-tasks-downloads.pages.dev/). `latest.json` advertises v2.5/code 16, so older APKs show it through their existing **Update** button. Installation is initiated and confirmed by the phone user; no silent install or forced sign-out occurs.
- The v2.4 APK remains available at its versioned URL. The Weighbridge app/site was not changed.

## Checks completed

1. All 80 app tests passed against the combined source.
2. Capacitor sync completed; the APK contains `operations.html`, its JavaScript/CSS, the Manager routing changes, the v2.4 theme, and build-info 2.5. Eleven key APK assets were hashed against the tested local source and matched.
3. Android package ID, versionName and versionCode were read from the built APK; signature matched v2.4.
4. The published stable website returned all 31 checked files byte-for-byte equal to local source, including Manager and theme files.
5. The public manifest, CORS/cache headers, downloaded APK size and full SHA-256 matched the local release. `/app`, `/operations` and the previous v2.4 APK URL returned HTTP 200.

## Follow-up on a real device

Before asking all factory phones to update, install v2.5 over v2.4 on one phone through **Update**, confirm the saved login survives, and check camera/photo completion and a normal task. The Manager account still needs to be created separately by Admin with the correct display name and a privately chosen password; publication did not create an account.
