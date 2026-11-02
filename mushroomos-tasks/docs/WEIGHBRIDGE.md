# Weighbridge — raw-material weighment (27 Sep 2026)

## What the owner asked (his words, condensed)
> A different interface for weighment of raw materials. Raw materials arrive on the weighbridge, a weighment ticket is
> generated, and it is uploaded to the app with the slip and the weight. Weighment of all raw materials happens at
> random times. Admin enters the required weight with a calculation slip; that is the number we subtract from. Each
> slip is subtracted — "dry weight need 20 tons; slip 1 → 2 tons; now needed 18" — until it reaches zero. If it
> reaches 21 → send an Admin alert; 19 → send an Admin alert. The login is different and the interface is fixed for
> weighments only.

Answers to the planning questions: requirement per Tasks batch + material (yes) · subtract the slip's **net** weight,
same unit, no conversion (yes) · allowed difference set per requirement (yes) · "short" is decided when someone taps
**Finished** (yes) · materials Bagasse, Paddy (Local), Paddy (Punjab), Chicken manure, Gypsum, Ammonium sulphate +
Admin can add (yes) · **tons and kg** · Admin creates the weighbridge logins and may also enter slips (interpreted from
"admin") · in-app alert badge for Admin (yes).

## 30 Sep 2026 — weighment in the MAIN app (0158, live)
Owner: *"weighment is decided by the admin for a new batch or existing batch; any supervisor will have the access for
the weighbridge; the logic that I decided will be the same… supervisors will do the weighing, build it into the main app."*
- **Database (0158, proof `database/proof/weighment-main-app-proof.mjs --live` 7/7):** `supervisor` (and operator,
  which `current_app_role()` maps to supervisor) may `wb_add_slip`, `wb_finish`, read wb tables/views and upload slip
  photos under a requirement. Not alerts, not Admin actions. `wb_batch.master_batch_id` + `wb_batch_create_for_master(p_master,
  p_note, p_rows)` for an EXISTING main batch (numbers = its code); typed numbers link automatically in `wb_v_batch` once
  a main batch with that code exists (`wb_match_master`, spaces ignored, cancelled ignored; no trigger on main tables).
- **Supervisors weigh in the main field APK** (`workingcode/field-app`, `in.freshbowl.mushroomos`, **v1.2 code 3**):
  bottom tab **Weighbridge** → `weighment.html`, which runs THIS app's screens (`wb-app.js`, `wb-api.js`, `wb.css`,
  `wb-app.css`) copied by `field-app/scripts/sync-weighbridge.mjs` — **re-run it before every field-app build** so the
  two apps stay identical. Account → **Update** (same update checker) reads `…/mushroomos/latest.json`.
- **Admin sets it in the main web app:** https://mushroomos.pages.dev → **Weighments** (`src/features/weighments/`):
  existing batch (pick) or new batch (type numbers) + the sheet; batch page; material page with the Excel sheet, void,
  finish/reopen, alerts. Tests `src/features/weighments/weighments.test.ts` 4/4.
- Release: `field-app/scripts/prepare-release.mjs` writes `release-site/mushroomos/`. The download site now has three
  apps: `/` Tasks, `/weighbridge/`, `/mushroomos/` — **always deploy the whole `release-site/` folder**.
- The separate Weighbridge app and weighbridge logins keep working (a PC/phone at the weighbridge can still use them).

## Live addresses and releases (29 Sep 2026)
| What | Where |
|---|---|
| Weighbridge web page | https://mushroomos-weighbridge.pages.dev (Pages project `mushroomos-weighbridge`, from `weighbridge-app/www`) |
| Tasks web page (Admin → Weighments) | https://mushroomos-tasks.pages.dev (project `mushroomos-tasks`, from `app/www`) |
| APK downloads — send this link to staff | https://freshbowl-tasks-downloads.pages.dev (Tasks) and https://freshbowl-tasks-downloads.pages.dev/weighbridge/ |
| Current versions | Tasks **1.7** (code 8) · Weighbridge **1.1** (code 2) — both signed with the same key as every earlier APK |

**Updates:** Weighbridge 1.1 has the same **Update** button as Tasks. It reads `…/weighbridge/latest.json` and offers
the APK when its versionCode is higher. v1.0 has no button → one manual install of 1.1 (don't uninstall).
**To release a new Weighbridge version:** bump `weighbridge-app/www/build-info.js` + `android/app/build.gradle`
together (and `?v=` suffixes in `app.html`) → `npx cap sync android` → `android/gradlew.bat assembleDebug` (Java 17,
same debug keystore) → `RELEASE_NOTES="…" node weighbridge-app/scripts/prepare-release.mjs` →
`npx wrangler@4 pages deploy release-site --project-name freshbowl-tasks-downloads --branch main`. Tasks releases are in
`docs/APK_UPDATES_AND_PERFORMANCE.md`; **both apps share `release-site/`, so always deploy the whole folder.**
Web pages: `npx wrangler@4 pages deploy weighbridge-app/www --project-name mushroomos-weighbridge --branch main`
and `… app/www --project-name mushroomos-tasks …`.
Tasks 1.7 also shipped the other assistant's batch progress report / planned durations (0154, live; 38/38 tests).

## 28 Sep 2026 update — batch numbers typed by Admin + the Excel sheet (migration 0153, live)
Owner: *"weighment is a thing which will be done before the batch creation so, add an input option where they can
enter batch numbers in the system. Set requirement … take proper inspo from the excel sheet."* His sheet:
`req fresh weight 20000 · slip1 4000 → 16000 · slip2–4 4000 each → 12000, 8000, 4000 · slip5 5000 → -1000 "reduce the weight"`.
- **No Tasks batch needed.** Admin types the **batch number(s)** as free text ("182, 183, 184"), a note, and a small
  sheet — one row per material: **required fresh weight**, allowed ±, note — plus one calculation slip for the batch.
  One tap creates it all (a bad row keeps the whole sheet out). New table `wb_batch`; requirements hang off it.
  Available in Tasks → Weighments **and** in the Weighbridge app when signed in as Admin (green Admin button).
- Same numbers can't be open twice; Admin can fix the numbers, add a material, **close** (unfinished → finished,
  short → alert) and **reopen** with a reason.
- **Each material shows the Excel sheet** in both apps: Required fresh weight → Slip 1, 2, 3… with slip weight and
  **balance**; "reduce the weight · over by X kg" in red past the allowance. The database numbers slips and works out
  balances (`wb_v_slip.slip_no`, `balance_after_kg`, ordered by `entry_seq`); a voided slip stays, struck through.
- The slip form shows the balance-after while typing; the real slip can still be saved (Admin alerted). kg by default.
- Weighbridge logins no longer read Tasks batches at all (0151's `tk_batch` read rule removed).
- Functions: `wb_batch_create`, `wb_requirement_add`, `wb_batch_update`, `wb_batch_set_calc_slip`, `wb_batch_close`,
  `wb_batch_reopen`; `wb_requirement_create` dropped. Proof `database/proof/weighbridge-batch-proof.mjs --live` 10/10.

## How it works (0151 — still true except where the updates above say otherwise)
1. **Admin** (Tasks app → **Weighments** tab): New requirement → batch, material, required weight (t or kg), allowed ±,
   note (e.g. "dry weight"), calculation slip (photo or PDF).
2. **Weighbridge operator** (MushroomOS Weighbridge app, own login): list of materials to receive with the big
   **remaining** figure → open one → **New slip**: photo of the slip (required), ticket no., vehicle no., supplier,
   gross and tare (net worked out) or the printed net, in **t or kg** → Save → "Saved 3.000 t. Remaining now 15.000 t".
3. The database subtracts every slip. States: **Receiving** → **Complete** (remaining within ± allowance) →
   **OVER** (past required + allowance: Admin alerted the moment the slip is saved) or **Finished short** (Finished
   tapped below required − allowance: Admin alerted).
4. **Admin** sees a red badge on Weighments, acknowledges each alert with a note, can change the required weight or
   allowance (lowering it below what arrived raises "over"), replace the calculation slip, **void** a wrong slip with a
   reason (kept on record, total recalculates), **finish** or **reopen** (reason) a material, and create weighbridge
   logins (name, email, password).
5. Rules the database enforces: the same ticket number can't be entered twice (any case/spaces); tare < gross;
   a typed net must match gross − tare (±1 kg); the slip photo must really be uploaded; no slips after Finished;
   only Admin voids / reopens / changes; every action is in `audit_event`.

## Pieces
| Piece | Where |
|---|---|
| Role `weighbridge` | `database/0150_weighbridge_role.sql` (live; was applied under the file name 0148_weighbridge_role) |
| Tables `wb_material`, `wb_requirement`, `wb_slip`, `wb_alert`; functions `wb_*`; views `wb_v_requirement`, `wb_v_slip`, `wb_v_alert`, `wb_v_batch`, `wb_v_login`; bucket `weighments`; `admin_create_user` / `admin_set_user_role` accept Weighbridge | `database/0151_weighbridge.sql` (live; was applied under the file name 0149_weighbridge) + rollback |
| Proof | `node database/proof/weighbridge-proof.mjs --live` → **10/10** (rolled back) |
| Weighbridge app (APK + web page, same files) | `weighbridge-app/www/` (`app.js`, `wb-api.js`, `wb.css`), package `in.freshbowl.weighbridge` → `apk/MushroomOS-Weighbridge-2026-09-27-v1.0.apk` |
| Admin tab in Tasks | `app/www/weighments-admin.js` + `wb-api.js` + `wb.css`; three small hooks in `app.js` (tab, badge, `#/w/<id>` route) → `apk/MushroomOS-Tasks-2026-09-27-v1.3.apk` |
| Main app | Logins screen offers the Weighbridge role (needs the main app's next deploy) |

Run locally: `python -m http.server 5191 --directory weighbridge-app/www` → http://localhost:5191 (sign in with a
weighbridge or Admin login). Deploy (owner): `npx wrangler@4 pages deploy weighbridge-app/www --project-name mushroomos-weighbridge --branch main`.

## Verified vs not
- Verified: all rules in the database (10/10 live, rolled back); the original Tasks proof still 9/9; the Weighbridge
  screens on a fake-login test page (list with 18.000 t remaining / 1.000 t over, slip form, gross − tare = net,
  "photo first" refusal, save result); syntax of every page; both APKs contain the new files.
- Not yet: a real weighbridge login on a phone; the Admin tab with a real Admin login (it was built after the
  owner's last session); the web pages are not deployed.

## Notes for whoever continues
- **Two assistants worked in this folder at the same time on 27 Sep.** Both applied a "0148" and a "0149". The
  database is fine (there is no migration-tracking table; all four are live). The weighbridge files were renamed to
  **0150/0151** afterwards; the lab-piles ones keep 0148/0149. All are recorded in
  `workingcode/mushroomos/supabase/migrations/`. **Next free number: 0152.**
- Found while testing, not changed: the main MushroomOS tables `master_batch` / `batch_activity` have a read rule of
  `true`, so **any signed-in login (including weighbridge) can read main-app batch data through the API**. The apps
  never show it. Tightening it is a main-app decision for the owner.
- This project's database makes every new view `security_invoker` (an event trigger), so views read with the viewer's
  rights. That is why the weighbridge role has one extra read rule: batch names (`tk_batch`), nothing else of Tasks.
