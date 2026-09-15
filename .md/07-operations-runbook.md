# 07 · Operations runbook

## Starting batches (Admin web → Home)

| Batch | Steps |
|---|---|
| New batch | **Start a new batch** → process (current is pre-selected) → name → materials → H0 date/time → set up → Start |
| Batch already running | **Add a batch already running** → name → materials → for each stream choose *Not started* / *At a step* / *Completed* → Confirm. Tracking and the day plan start now |
| Demo / test | Either of the above with **DEMO / TEST** ticked before starting (cannot be added later). No clock: no time gates, rests or late blocks |

Stream choices for a running batch: a stream whose work is all done = *Completed*; the stream being worked = *At a
step* (pick it; use "+ another position" only for piles/bunkers worked at the same time); not begun = *Not started*.

## Failsafe — when something goes wrong

Open the batch → **Activities** → tap the task → **Fix this task (Admin)**. Write a reason (10+ characters).

| Problem | Fix |
|---|---|
| Task stuck, will not open | Open this task now |
| Work done on the floor but not in the app (phone dead, app failed) | Mark as done (work was done) |
| Task finished or skipped by mistake | Reopen this task |
| Recorded start/finish time wrong | Time correction (Admin, reason) |
| Task blocked for lateness | Approve the late ticket on **Tickets** |
| Whole batch tracked wrongly | Cancel the batch → Add a batch already running at its true position |

Every fix is audited and shown to the GM on **People → Overrides and decisions**.

## Logins (Admin web → Logins)

- **+ New login:** name, email (login ID), password (8+), role, shift.
- **Set password**, **Change role**, **Switch off / on** per person.
- Replace the published demo passwords before real use (`*@freshbowl.demo`).

## Web link (Admin / GM on a browser)

The web app is built into `mushroomos/dist` and served from this laptop:

1. Preview server: `vite preview` on `http://127.0.0.1:4173` (Claude desktop launch config `mushroomos-public-preview`).
2. Public link: Cloudflare quick tunnel
   `%USERPROFILE%\tools\cloudflared\cloudflared.exe tunnel --no-autoupdate --url http://127.0.0.1:4173`
3. Current link: **https://weapon-quilt-issued-fisheries.trycloudflare.com**

A quick tunnel lives only while the laptop is on and the process runs; restarting it gives a **new** link. If the
link does not open on this laptop but works elsewhere, run `ipconfig /flushdns`. For a permanent link, host `dist/`
on a static host (e.g. Cloudflare Pages / Netlify) or use a named Cloudflare tunnel.

Rebuild after code changes: `npm run build` in `mushroomos/` (the preview serves the new files immediately).

## Android APK

In `mushroomos/`:
1. `npm run build`
2. `npx cap sync android`
3. `cd android` then, with `JAVA_HOME=%USERPROFILE%\.jdks\jbr-17.0.14`, run `gradlew assembleDebug`
4. APK: `android/app/build/outputs/apk/debug/app-debug.apk`

Uninstall the old app before installing a build signed on another machine. Emulator: Android Studio → Device Manager
→ Medium_Phone ▶.

## Database changes and rollback

- Every change is a migration file in `supabase/migrations/` (next number 0106), trialled in a rolled-back
  transaction, then applied.
- Rollback files: `db-rollback-2026-09-13/pre_00xx__*.sql` (function bodies before the change) and
  `rollback_00xx.sql`.
- Published process versions are never edited; a change is a new version, then **set current**.
- Supabase also keeps daily backups (dashboard → Database → Backups).

## Things not to do

- Do not run the demo/test scripts in `mushroomos/scripts/` against real data (clean-demo-data, dummy-batch,
  realtime-batches, acceptance-run, batchexp-run, lab-demo-state).
- Do not commit `.env.local`, `key.txt`, `.mcp.json`, `android/app/src/debug/`.
- Do not delete batches; cancel them (history stays).
