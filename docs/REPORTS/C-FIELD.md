# REPORT — C-FIELD · the field shell

**22 August 2026.** `BUILD_SEQUENCE_KIRO.md §C-FIELD` (which supersedes and withdraws §C-SPLIT),
`UI_COMPONENT_ARCHITECTURE.md §6`, `UI_DESIGN_SPEC.md §4.1/§4.2`. Format per the steering brief's
*How to report*.

**Status: ✅ GATE GREEN.** An operator lands on the field shell and can reach no management route. A
management role never sees the field shell. The field entry excludes the tower, graph and Gantt
chunks, asserted against real build output. **212 tests · 10 files · typecheck clean · build clean.**

**ONE application.** One `index.html`, one Vite target, one Supabase client, one auth model, one
design system, no Capacitor. Two shells, chosen by role. Asserted, not asserted-to.

---

## 1. What was built

```
new   src/components/layout/FieldShell.tsx      the field chrome
new   src/components/layout/PageHeading.tsx     extracted from AppShell — the coupling that
                                                defeated the bundle requirement
new   src/routes/Pending.tsx                    the stated-blocked screen, shared
new   src/routes/LabQueue.tsx                   split out of Placeholders — a FIELD route
new   src/routes/ControlRoom.tsx                split out of Placeholders
new   src/routes/Resources.tsx                  split out of Placeholders — where the Gantt lands
new   public/manifest.webmanifest                the PWA manifest
new   tests/fieldShell.test.ts                  31 tests — the gate

edit  src/App.tsx                  every route lazy · the shell chosen by isFieldRole
edit  src/lib/auth.ts              FIELD_ROLES + isFieldRole, beside ROLE_HOME
edit  src/components/layout/AppShell.tsx   PageHeading removed, with the reason recorded
edit  src/routes/ControlTower.tsx  carries the CommandCenter history note
edit  index.html                   the manifest link and its reasoning
edit  vite.config.ts               build.manifest — so the chunk graph can be asserted
edit  .gitignore                   dist-audit
edit  tests/controlTower.test.ts   one C3 assertion, made stronger
edit  10 route files               PageHeading import repointed

del   src/routes/Placeholders.tsx  split into the four modules above
```

### FieldShell — specified by five properties, four of them negative

§C-FIELD: *"One task on screen, ≥48 px targets, no nav bar, no theme toggle, persistent offline chip.
Chosen by role, not by URL."* Each is a test.

| Property | How it is built | How it is asserted |
|---|---|---|
| one task on screen | one centred column, `max-w-[560px] mx-auto`, `overflow-x-hidden`, no grid | no `grid-cols`, no `overflow-x-auto`; criterion 49 / E.10 |
| ≥48 px targets | one `TARGET_PX` constant, used by both controls the shell owns | the constant exists, is ≥48, and is used |
| no nav bar | there is no `NavLink`, no `<nav>` and no route table in the file | scanned, comments stripped |
| no theme toggle | and it does not **write** the theme either | no `dataset.theme`, no `localStorage`, no `useTheme` |
| persistent offline chip | sticky, and it states the consequence rather than a status | `navigator.onLine`, `sticky`, no modal, and the copy is asserted |
| chosen by role | `isFieldRole(role) ? FieldShell : AppShell`, in one place | `FieldShell` is named in exactly one file besides its own |

The offline chip says **"Offline — a submission will not save until this clears."** rather than
"offline". Criterion 84 asks for the reason on the face of the thing; a status word is not a reason,
and since offline is out of scope a submit made offline genuinely will not save.

**Nothing offline is built.** No queue, no IndexedDB cache, no blob capture, no service worker —
asserted across the whole of `src/`, not only in this file. §C-FIELD: *"Offline is out of scope.
`ARCHITECTURE_V2 §5` remains the specification if the network assumption ever changes. Do not build
the queue."*

### Four silences, filled by reading rather than by choosing

The documents specify FieldShell by those five properties and are silent on everything else. Each of
these is stated in the file's header, at the point where a reader would otherwise wonder:

| Silence | What I did |
|---|---|
| which theme, with no toggle | **nothing.** `AppShell`'s `useTheme` owns `documentElement.dataset.theme`; a shell with no toggle has nothing to persist. `index.html` ships `data-theme="light"`. Two writers of one attribute would mean the last shell to mount wins |
| the role-claim banner | **omitted.** `AppShell` carries it because an admin can act on it; an operator cannot, and `0015_role_claim.sql` has since made it dormant everywhere |
| sign-out, and who is signed in | **kept.** Sign-out is an account action, not navigation, and an operator handing a shared phone to the next shift needs it. The person is named because everything they submit is recorded against them |
| a back affordance | **omitted.** The field surface is one screen today. The route that needs one is S9 `/operator/task/:id`, which is C6's. A back button to nowhere is placeholder chrome |

`AppShell` prints `PROCESS-2026B` in its header — a definition code hard-coded into chrome. That is
pre-existing and was **not copied** into a second file.

### The supervisor keeps the management shell, deliberately

`FIELD_ROLES` is `operator` and `lab_tech`. A supervisor is **not** in it, even though `OPS` lets them
open `/operator/my-work`. §C-FIELD's own argument against a second application is that *"a supervisor
is genuinely both roles — on the floor and in the control room"*, and a supervisor who lost the nav bar
on the operator's screen would be stranded there with no way out. They see the operator's screen inside
the management chrome. There is a test for it.

---

## 2. Exit proofs

```
$ node node_modules/typescript/bin/tsc --noEmit
(no output, exit 0)

$ node node_modules/vitest/vitest.mjs run
 ✓ tests/fieldShell.test.ts (31 tests) 2085ms
 ✓ tests/evidence.test.ts (20 tests) 23760ms
 ✓ tests/gates.test.ts (11 tests) 28922ms
 ✓ tests/uiFoundations.test.ts (21 tests) 2808ms
 ✓ tests/demoBatches.test.ts (16 tests) 8914ms
 ✓ tests/tower.test.ts (23 tests) 1232ms
 ✓ tests/hourAxis.test.ts (21 tests) 14223ms
 ✓ tests/recordedActuals.test.ts (14 tests) 23647ms
 ✓ src/domain/time.test.ts (27 tests) 107ms
 ✓ tests/controlTower.test.ts (28 tests) 1807ms

 Test Files  10 passed (10)
      Tests  212 passed (212)
   Duration  110.00s
```

```
$ node node_modules/vite/bin/vite.js build
✓ 178 modules transformed.
dist/index.html                            2.78 kB │ gzip:  1.42 kB
dist/.vite/manifest.json                   6.62 kB │ gzip:  0.99 kB
dist/assets/index-CQ3Z-enO.css            14.29 kB │ gzip:  4.14 kB
dist/assets/LabQueue-Ctj2YTrL.js           0.31 kB │ gzip:  0.25 kB
dist/assets/ControlRoom-B3C3Ocrs.js        0.35 kB │ gzip:  0.27 kB
dist/assets/PageHeading-BXR5MuoT.js        0.37 kB │ gzip:  0.26 kB
dist/assets/Pending-fUDxGX3I.js            0.60 kB │ gzip:  0.40 kB
dist/assets/browser-CK5CJpoQ.js            0.62 kB │ gzip:  0.43 kB
dist/assets/FieldShell-C2xlMAnq.js         1.59 kB │ gzip:  0.77 kB
dist/assets/Resources-Cpf0_4CA.js          2.91 kB │ gzip:  1.26 kB
dist/assets/useMutation-BsxKYDSE.js        2.91 kB │ gzip:  1.23 kB
dist/assets/Batches-q1XMqC1f.js            3.09 kB │ gzip:  1.45 kB
dist/assets/SignIn-Dkv5noIs.js             3.24 kB │ gzip:  1.25 kB
dist/assets/AppShell-Dd_KcO6I.js           3.81 kB │ gzip:  1.49 kB
dist/assets/cardinality-CShWFG3D.js        4.69 kB │ gzip:  1.95 kB
dist/assets/batch-B2pm9ZLG.js              4.81 kB │ gzip:  1.80 kB
dist/assets/MyWork-CfQfK-pN.js             5.10 kB │ gzip:  2.14 kB
dist/assets/AdminToday-CX2ZQL55.js         5.23 kB │ gzip:  1.99 kB
dist/assets/ReferenceData-BjTBk0yO.js      6.04 kB │ gzip:  1.99 kB
dist/assets/useQuery-CZbscXqU.js          10.37 kB │ gzip:  3.65 kB
dist/assets/BatchDetail-DDx5oDpZ.js       10.94 kB │ gzip:  3.58 kB
dist/assets/TaskDrawer-Dm4eFc5c.js        11.06 kB │ gzip:  3.68 kB
dist/assets/NewBatch-CWS9Da4u.js          12.80 kB │ gzip:  4.60 kB
dist/assets/ProcessExplorer-DwFM0Olb.js   15.12 kB │ gzip:  5.45 kB
dist/assets/ControlTower-B_0-bfA_.js      16.34 kB │ gzip:  5.83 kB
dist/assets/ScheduleBuilder-DG8GcBNj.js   19.77 kB │ gzip:  5.88 kB
dist/assets/index-rPOKSKY1.js            311.47 kB │ gzip: 94.79 kB
✓ built in 2.59s
```

**Before this step it was one chunk: `index-CvJCn3fy.js`, 444.46 kB.** Now the entry is 311.47 kB and
every screen is its own chunk.

Measured by the test, from the audit build:

```
field entry 340.9 kB · management entry 381.2 kB
```

The field entry is entry + `FieldShell` + `MyWork` + `LabQueue` and their static imports. The
management figure is entry + `AppShell` + tower + graph + schedule builder. Both are unminified-source
byte totals of the emitted chunks, printed by the test so the report carries measured numbers rather
than adjectives.

---

## 3. The gate, item by item

### "an operator lands on the field shell and can reach no management route"

Stated **positively**, so a new management route that forgets to exclude the operator fails this
rather than slipping past a deny-list:

```
✓ an operator can open exactly one route, and it is their own      → ['/operator/my-work']
✓ a lab technician can open exactly one route, and it is their own → ['/lab/queue']
✓ no route allowing a field role is a management route
✓ every route is guarded except the landing page, sign-in and the bare redirects — A15
```

The route table is **parsed out of `App.tsx`**, not retyped in the test: paths, guards, the `allow`
list, whether the element is a bare redirect, and whether it sits inside the DEV block. A
hand-maintained copy is the thing that goes stale first, and a stale copy would let a management route
become operator-reachable while the suite stayed green. The named sets (`ALL`, `MGMT`, `OPS`) are read
from their own declarations, and the parser asserts it found something so it cannot pass vacuously.

**A15 now has the route-table test the acceptance document asks for.** Its wording is "except `/` and
`/sign-in`"; a route whose element is a bare `<Navigate>` has no component and no data, so there is
nothing for a guard to protect. Those are listed as an exception rather than waved through.

### "a management role never sees the field shell"

```
✓ isFieldRole is false for every management role
✓ the supervisor keeps the management shell on the operator screen, deliberately
✓ the shell is selected in exactly ONE place, and only by isFieldRole
```

The last one matters most: it asserts `FieldShell` is named in exactly one file besides its own
definition, that the selection is the `isFieldRole(role) ? FieldShell : AppShell` expression, and that
there is **no URL-based path into the field shell** — no `pathname` test, no `startsWith('/operator')`.
"Chosen by role, not by URL" is enforced rather than intended.

### "the field entry's initial bundle excludes the tower/graph/Gantt chunks, asserted against build output"

The test runs the real production build with sourcemaps into its own directory and reads two things
Rollup emits:

- **`.vite/manifest.json`** — the chunk graph, and crucially the split between `imports` (static:
  downloaded with the chunk) and `dynamicImports` (lazy: downloaded only when that route is opened).
  **That distinction is the whole proof.** "Initial bundle" means the transitive closure of static
  imports and nothing else.
- **`*.js.map`** — each chunk's `sources` array, which names every source module inside it.
  Un-minified and exact, so *"this chunk contains the staircase"* is read from the build rather than
  guessed from a file name.

The forbidden layer is named by **module**, not by chunk file, because Rollup merges a route's
dependencies into the route's own chunk and file names carry hashes:

```
StaircaseCalendar · HourRail · geometry · ExceptionBand · api/tower · ControlTower
FiveLayerNode · ProcessExplorer · Resources (where the Gantt lands at A5) · AppShell
```

Four assertions, not one:

```
✓ every route is its own chunk, so the entry carries no screen at all
✓ the field entry contains none of the heavy layer
✓ and it excludes them by BOUNDARY, not because they are missing from the build
✓ the management entry DOES contain the tower, so the two really differ
✓ the field entry is smaller than the management entry — a real reduction, not a nominal one
✓ the field shell is in the field entry and the management shell is not
✓ no field chunk reaches the management shell, by any path
```

The third is the positive control: without it, **deleting** the control tower would make the second
pass.

### ⚠ The negative check, and it failed to fail on the first try

A bundle test that has never rejected anything proves nothing about the bundle — the same argument
`TIME_CONTRACT §2` makes about the grep test. So `StaircaseCalendar` was imported into
`routes/LabQueue.tsx` on purpose to watch the assertion bite.

**It did not.** 31 tests still passed, because the import was unused and Rollup tree-shook it away. The
probe was too weak, not the test — but I could not have known which without checking. Made into a real
use, the assertion failed and named exactly what leaked:

```
AssertionError: the field entry downloads:
  the staircase (src/components/composite/StaircaseCalendar.tsx)
```

The probe was then removed. The assertion is now known to work rather than believed to.

---

## 4. Three defects found on the way

### 4.1 The test was auditing a build the deploy would never produce

The audit build emitted a **Gallery chunk** while the same command run by hand did not. Cause: vitest
runs with `NODE_ENV=test`, `execFileSync` inherits the environment, and **Vite honours an `NODE_ENV`
that is already set** — so `isProduction` stayed false, `import.meta.env.DEV` compiled to `true`, and
the DEV-only branch survived.

Every bundle assertion was therefore being made against a dev-ish build. Fixed by forcing
`NODE_ENV=production` and `--mode production` on the child process. **The Gallery assertion is now the
canary for it**: if this build ever stops being a production build, a Gallery chunk reappears and that
test fails.

### 4.2 The DEV-only gallery was shipping in production

`/dev/gallery`'s **route** was already wrapped in `import.meta.env.DEV`, but the `lazy()` call sat at
module scope where nothing removed it. Measured before the fix: **a 17.98 kB Gallery chunk in the
production build**, carrying the staircase, the hour rail and `api/tower` with it.

The guard is now on the **declaration**, so the conditional folds at build time and the dynamic import
disappears with it. A test asserts no Gallery module and no Gallery chunk exists in the production
build.

### 4.3 `PageHeading` coupled every screen to the management shell

`PageHeading` was exported from `AppShell.tsx` — the same module that holds the management nav table,
the theme toggle, `useAuth` and `signOut`. **Ten routes import it, `MyWork` among them**, so the
operator's route chunk depended on the management shell.

Extracted to its own module and the ten imports repointed. Nothing about the component changed. A test
asserts no field chunk reaches `AppShell` by any static path.

Both shells are also **lazily loaded now**, which is what makes "chosen by role" true of the download
and not only of the render. Imported statically, each would land in the entry chunk — so an operator
would download the management nav table, every management route by name, to render a screen with no nav
bar.

### 4.4 A field route shared a module with the manager's screen

`routes/Placeholders.tsx` held `LabQueue` (a field route) beside `ControlRoom` and `Resources`. One
module is one chunk, so a lab technician downloaded the manager's screen — and `Resources` is where
`VesselGantt` and `MachineLoadGrid` land at A5.

Split into one module per route, plus a shared `Pending`. `UI_IMPLEMENTATION_PLAN §3.1` asked for the
`Resources` extraction independently — *"extracted to its own file, Gantt added at A5"*. **The boundary
is asserted now, so the Gantt cannot land inside the field entry later without failing the test.**

The `CommandCenter` history note that lived in that file — what the placeholder promised versus what
shipped — moved into `ControlTower.tsx`, where a reader looking for it would go. C3's assertion that
read `Placeholders.tsx` by name would have **thrown** rather than failed once the file was gone; it now
scans the whole routes directory, which is strictly stronger and survives the next rename.

---

## 5. A finding this step surfaced: `HourRail` has no production consumer

Once the gallery stopped being emitted, `HourRail` had nothing rendering it, so Rollup dropped it. The
staircase draws its own segments straight from `geometry`; the **only** consumer of the rail is the DEV
gallery.

**It is not dead code to delete.** `UI_IMPLEMENTATION_PLAN §S2` puts the full rail — plan, actual,
forecast, rest bands — on the batch page, which is **C4**. So the fact is asserted out loud in its own
test, which also checks the file is still present and still exercised by the gallery. When C4 lands
that test fails, and the entry becomes an ordinary positive control. Flagged rather than quietly
excepted.

---

## 6. The PWA manifest

```json
{ "name": "MushroomOS", "start_url": "/", "scope": "/", "display": "standalone",
  "orientation": "portrait", "theme_color": "#0e5d6b", "background_color": "#faf7f2" }
```

### `start_url` is `/`, and that IS the field home

A manifest carries exactly one `start_url`, and there are **two** field homes —
`ROLE_HOME.operator` is `/operator/my-work`, `ROLE_HOME.lab_tech` is `/lab/queue`. §C-FIELD says "the
field home" and does not pick one. Naming either would put the wrong screen on the other person's home
screen; copying the mapping into the manifest would make it a second source of truth for something
`lib/auth.ts` already decides.

`/` is the `Landing` route, whose only job is to redirect to `ROLE_HOME[role]`. An operator lands on
their work, a lab technician on theirs, and because the shell is chosen by role **neither ever renders
the management chrome** — which is what §C-FIELD actually asks for. The test asserts `start_url` is `/`
**and** that `Landing` really does redirect by role, so the claim is not left resting on prose.

### The colours are token values, and it is the one place they are duplicated

A manifest is JSON read by the operating system, with no access to the document's custom properties, so
`var(--accent)` is not available. `theme_color` and `background_color` are the light-theme `--accent`
and `--paper` from `theme/tokens.css`, and a test reads the stylesheet and asserts they match — so the
duplicate cannot drift. Light-theme values because the OS chrome draws before any theme attribute
exists.

### ⚠ No icons, and what that costs

**Android Chrome will not offer "Install" without a 192 px and a 512 px icon, one of them `maskable`.**
So this manifest is installable on desktop and addable-to-home-screen on iOS, but **will not trigger
Android's install prompt** — and the factory's phones are Android.

I did not invent one. An icon is the product's visual identity, criterion 86 forbids placeholder
content, and a manifest naming a file that does not exist is worse than one that says nothing. A test
asserts the manifest claims no icon it does not have, so adding the key later cannot half-work.

**This needs one thing from you: a logo, or permission to draw a plain wordmark.** Two PNGs and three
lines of JSON once it exists.

**No service worker**, by instruction — §C-FIELD, "do not build the queue". Worth knowing that this is
the second half of why Android will not prompt: historically Chrome also wants a service worker with a
fetch handler. Both halves are stated rather than quietly worked around.

---

## 7. Conflicts and TBDs touched

**None resolved.** C-FIELD is chrome, routing and bundling; it holds no threshold, duration, approver
or schedule mapping.

| Marker | State |
|---|---|
| **C-37, C-35, C-32, C-33, C-36, TBD-24a** | untouched |
| **TBD-21, TBD-24** | untouched |
| **TBD-50** | closed already; this step reads no clock and formats no time |
| **C-19 / C-20** | untouched. `/admin/schedule` is still not built (S5, C10) |

`conflict_register` count unchanged. **No new ID was needed.**

Two client decisions of 22 August were applied as written, not interpreted:

- **Offline is OUT OF SCOPE.** No queue, no IndexedDB, no blob capture, no service worker — asserted
  across `src/`. `ARCHITECTURE_V2 §5` keeps its dated note as a specification.
- **ONE application.** §C-FIELD supersedes §C-SPLIT. One HTML entry (asserted), no `@capacitor`
  dependency (asserted), one design system, one auth model, one backend.

---

## 8. Where I did not choose

| Question | What I did |
|---|---|
| **the manifest icon** | not invented. §6 |
| **`start_url`, given two field homes** | `/`, which resolves through the one existing mapping rather than duplicating it. §6 |
| **per-density type and spacing** | **there is none to read.** `UI_DESIGN_SPEC §2.2` defines density as *which layers are shown and what is emphasised* — no type ramp, no spacing scale, no density tokens anywhere in the design documents. So `FieldShell` uses only the sizes §4.1 states outright (48 px targets, ≥15 px body) and invents no ramp |
| **the theme, with no toggle** | nothing written. §1 |
| **what a supervisor sees at `/operator/my-work`** | the management shell, per §C-FIELD's own argument. §1 |
| **rebuilding `MyWork` to S8's three bands** | **not done — that is C6.** §7 below |

---

## 9. Left undone, and why

- **`MyWork` and `TaskDrawer` are unchanged.** They render inside `FieldShell` now, but they are still
  S8 and S9 as C2/C3 left them, and they do not yet meet their own criteria: grouping is by `Day n`
  rather than S8's **now / waiting on a clock / later today** bands (criterion 44); type sizes are
  10–14 px against "body ≥15 px, numbers ≥18 px" (48); the value input is `text-base` in a `py-2` box
  against "≥28 px mono in a ≥56 px-tall target" (50); the empty state names no specific wait (47);
  there is no `RunningTotal` on load-scoped activities (54). **All of that is `C6`**, which
  `UI_IMPLEMENTATION_PLAN §4` scopes as "S9 + S8 operator route, bands, `RunningTotal`,
  `advance_batch` poll". C-FIELD is the shell; rebuilding the screens inside it would have meant doing
  C6 without being asked and inventing the density values §8 says do not exist.
- **No operator input for a transcribed actual.** TASK 2's server side is done and
  `submitActivity` carries the pair, but the input belongs on S9's submit form — C6 — and it needs the
  factory-zone conversion that `TIME_CONTRACT §3.2` requires of a wall clock. Named as owed in
  `ACTUALS.md §8` and still owed.
- **`/operator/task/:id` does not exist.** S9 is a drawer today. C6.
- **The manual pass.** Section B's appearance halves and all of section C are a both-themes,
  375/768/1280 px review in a real browser. No DOM environment is installed — no jsdom, no
  `@testing-library` — so the structural halves are automated and the visual halves are not. Same trade
  and same disclosure as C2 and C3. **Specifically unverified: that the field shell reads as one task
  at 375 px, and that nothing scrolls sideways in a real browser.** The absence of `grid-cols` and
  `overflow-x-auto` and the presence of `overflow-x-hidden` are asserted; how it looks is not.
- **`MyWork` still imports `TaskDrawer`**, which `UI_COMPONENT_ARCHITECTURE §1` rule 5 forbids — "no
  component imports another route". It is pre-existing, it is what C6 fixes by promoting `TaskDrawer`
  to a route, and it does not affect the chunk boundary. Recorded, not fixed here.
- **`MyWork` hard-codes `FIB1-WEIGH`** in its running-totals query — an activity code baked into the
  UI, which is in tension with rule 3, "the process is data". Pre-existing and outside this gate.
  Worth a decision in C6.
- **Consolidating `api/batch.ts` and `api/batches.ts`.** Still owed from `C1 §4`, now four steps old.
- **B6 and S15** — not started, per your instruction.

## 10. Stopped and asked

Nothing was resolved that should not have been. **One thing genuinely needs you: an app icon**, or
permission to draw a plain wordmark, before an Android phone will offer to install the field app (§6).
Everything else in this step was derivable from the documents, and where they were silent the silence
is named in the code and in §8 rather than filled with a plausible value.
