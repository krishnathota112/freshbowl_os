# Android v1.5 — prevent accidental logout

28 September 2026. Package `in.freshbowl.tasks`, versionCode 6, versionName 1.5.

The owner requested removal of the logout button in the mobile APK because it is tapped accidentally.
The normal Tasks toolbar starts with logout hidden in HTML. Native Capacitor removes the element entirely
before it can be tapped; the website reveals and wires its existing Sign out button. Login, session refresh,
session expiry and server permissions are unchanged. The separate wrong-role recovery screen retains its
Sign out action so an unsupported account is not trapped there. No extra menu or replacement logout button
was added to normal mobile screens. The separate Weighbridge APK was not changed.

All 18 Node tests pass, including native removal/session preservation and website logout with/without the
Capacitor web shim. Updater tests now compare against the current versionCode rather than a hardcoded release.
No factory batches, photos, templates or users were changed. The earlier question about hiding batches
was answered: closing a batch removes it from active working lists but retains its records and photos;
no batches were closed as part of this release.

The v1.4 update flow and download destination remain unchanged. Users already on v1.4 can tap **Update**
to download the next published APK. Older installs can use https://freshbowl-tasks-downloads.pages.dev/.
Keep the same signing identity; install over the existing app without uninstalling.

Published to the existing download site and verified: stable `latest.json` reports code 6/version 1.5,
and the downloaded APK exactly matches the local SHA-256 and size (6,278,194 bytes). Android build and
signature verification passed; the signer matches v1.4. Packaged HTML/JS/build metadata match source.
Deployment: https://a8c5f3a7.freshbowl-tasks-downloads.pages.dev/.
Native toolbar behaviour was tested with a simulated Capacitor platform; a real-phone check remains.
