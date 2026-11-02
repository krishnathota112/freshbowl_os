# Android v1.9 — Logout restored

30 September 2026. Package `in.freshbowl.tasks`, versionCode 10.

- Restores a visible **Logout** button in the native APK header for every signed-in role.
- Requires confirmation, reminding the user to save work and finish photo uploads first. Cancel leaves the session untouched. Disabling the button after confirmation prevents duplicate sign-out calls.
- The native header can wrap on narrow screens. Website sign-out remains available as before.
- All 54 app tests pass, including native cancellation, confirmation and duplicate-tap protection. Android build succeeds; package/version verified and signing identity matches v1.8 for in-place upgrades.
- No database or factory-record changes. No physical-phone installation was performed.
- Website and APK use the existing Cloudflare Pages projects. Keep older APKs so previous download links continue working. Install via the app's **Update** button; do not uninstall first.
