# MushroomOS Weighbridge

The weighbridge operator's app: pick the material a batch still needs, photograph the weighment slip, enter ticket,
vehicle, supplier and weights (t or kg) — the database subtracts it and alerts Admin on over / short. Own login role
`weighbridge` (Admin can use it too). Tables `wb_*`, migration `../database/0151_weighbridge.sql`. Full notes:
`../docs/WEIGHBRIDGE.md`.

- `www/` is the whole app (plain HTML/JS); the same files are the APK and the web page. `wb-api.js` is shared with the
  Tasks app's Admin Weighments tab (keep the two copies identical).
- Package `in.freshbowl.weighbridge`, name "MushroomOS Weighbridge". Shell copied from `../app/android`.
- Build: `npx cap sync android && cd android && JAVA_HOME=/c/Users/prath/.jdks/jbr-17.0.14 ./gradlew.bat assembleDebug`
- Web: `npx wrangler@4 pages deploy www --project-name mushroomos-weighbridge --branch main` (owner runs it).
