# Visual theme layer — 1 October 2026 (Japanese restraint)

A presentation-only redesign of the Tasks website/APK and the Weighbridge app. **No functionality, data, class name, id or
rule was changed.** The app logic (`app.js` and every other script) is untouched.

## Direction
The earlier versions (glossy gradients, soft shadows, emerald green) read as generic. This version follows Japanese design
principles instead:

- **Ma — negative space.** Wider gutters, 24 px card padding, 64 px between menu and content, fewer boxes.
- **Restraint.** Flat washi-paper surfaces, 1 px hairlines, 6-8 px radii, no gradients, no shadows (only dialogs and the sticky
  plan bar), no glow or ripple. Motion is a quiet fade; the only loop is the slow dot on a *running* task.
- **Palette.** Washi `#f6f3ec`, kinari cards `#fdfcf9`, sumi ink `#23251f`, one deep pine green `#3f5d4b` for action, indigo
  `#3d4b6b` for Lab, ochre `#86661c` for running, beni `#9c3b2e` for problems.
- **Type.** Shippori Mincho for headings, Zen Kaku Gothic New for text, generous line height and light letter-spacing; icons at a
  light weight (Material Symbols wght 300).
- **Illustration.** The supplied botanical print (white mushrooms, moss gills, rosemary) appears only on flat pine panels: the foot
  of the desktop menu and the sign-in page.

## The soul: mycelium, spores, and the production thread
Restraint alone read as empty, so the refined palette now carries the story of growing mushrooms:
- **Mycelium.** A fine hyphae network (generated procedurally; `web-light.svg` on the page, `web-dark.svg` on dark panels) creeps in from
  the page corners. On the sign-in hero it *draws itself* (`hero-web.svg`, CSS stroke animation inside the SVG).
- **Spores.** Luminous lime motes drift up through every dark forest panel (sign-in hero, home summary band).
- **Sign-in scene.** Full-height forest-floor panel: the botanical print, a headline, a vertical `きのこ` mark and a production thread
  (Wetting - Turner - Bunker - Tunnel - Harvest) whose nodes light up in sequence. On phones it becomes a banner above the form.
- **Home summary band.** `theme.js` builds a dark band above the batch list: greeting, and four counts (batches, tasks done, running,
  awaiting GM) that count up. It only *reads* the batch cards already on screen, so no extra data access.
- **Progress lines** end in a small glowing tip, like the growing end of a hypha.
- One lime accent (`--glow`) is the only bright colour; everything else stays pine, washi and ink.

## Layout
- **Desktop (>= 900 px):** the Home tabs are a quiet left menu with a green marker on the active item. CSS only; applies when
  `.tabs` sits directly above `#pane`, so batch/task screens are unchanged.
- **Phones and tablets:** tabs are underlined labels in a swipeable row (wrapping from 720 px).

## Files
| File | Role |
|---|---|
| `app/www/theme.css` | The whole look. Loaded after `app.css`; wb-class overrides use a `:root` prefix so they beat `wb.css`. |
| `app/www/theme.js` | Cosmetic helpers only: header border on scroll, fade-in of rendered content, Loading/empty states, progress lines parsed from each batch's own "done/total" text, name · role separator. |
| `app/www/web-light.svg`, `web-dark.svg`, `hero-web.svg` | Generated mycelium artwork (page background, dark panels, animated sign-in hero). |
| `app/www/mushroom-illustration.webp`, `logo.webp`, `logo-192.png` | Recoloured renders of the supplied vector (`app/art-source/`, not shipped). |
| `app/www/app.html`, `login.html`, `role_not_served.html` | Font links, logo image, rebuilt sign-in page (same ids and script). |
| `app/android/.../values/styles.xml` | Washi-coloured status bar with dark icons (needs an APK rebuild). |
| `weighbridge-app/www/*` | Same theme, assets and HTML hooks. |

## Reverting
Remove the `theme.css`/`theme.js` tags (and the `brand-mark` image) from the HTML shells; the original look returns exactly.

## Releasing
Nothing has been built or deployed. Normal flow: `cd app && npm test`, bump `versionCode`/`versionName`, `npx cap sync android`,
build, deploy the website. `app/scripts/verify-release.mjs` also checks the theme and artwork files on the live site.

## Known limits
- Fonts load from Google Fonts like the existing ones; offline the app falls back to a system serif/sans.
- No dark mode. The Android splash screen and launcher icon are still the stock Capacitor ones.
- Checked in a browser at phone and desktop widths with fake data; not tested on a physical phone.

## Release 2.4 (1 October 2026) — published
Tasks APK **v2.4, versionCode 15**, published to https://freshbowl-tasks-downloads.pages.dev (manifest, headers and the downloaded APK's
SHA-256 `b5236640…cedd9` verified live). Signed with the same certificate as v2.3 (`a8f96316…d94c6`), so phones update in place via **Update**.
The factory **website** (`mushroomos-tasks.pages.dev`) and the **Weighbridge** APK were *not* redeployed.

**What is in it:** the published v2.3 web code, byte-for-byte (verified against the v2.3 APK), plus only the theme files
(`theme.css/js`, artwork, `app.html`, `login.html`, `role_not_served.html`) and the status-bar colour.

**What is deliberately NOT in it:** another session's in-progress **Manager "Factory Operations"** work (`operations.html/js/css`,
`operations-analytics.js`, the manager redirect in `app.js`/`auth.js`, the Admin link). It was edited after v2.3 and was not part of this
request. It lives only in the working tree. **The next release must be >= 2.5** (2.4 is taken by different bytes); build it, test it, and
only then publish. `prepare-release.mjs` refuses to reuse a published version with different bytes.

The release was built from an isolated copy of the project (v2.3 baseline + theme) so the working tree was never altered. Tests in that
copy: 75 pass; the 5 failures are exactly the Operations tests, whose code is intentionally absent.

Not tested on a physical phone. Install-over-existing (v2.3 -> v2.4) should be checked on one factory phone.

## Release 2.5 (1 October 2026) — combined

The subsequent v2.5/code 16 release publishes this theme together with the Manager Factory Operations feature to the Tasks website and APK. It supersedes the web/APK split documented above, while the separate v2.4 artifact remains unchanged. See `RELEASE_2_5_THEME_AND_OPERATIONS.md` for verified URLs, hashes and device-test limits.
