# MushroomOS

A production management and traceability system for Fresh Bowl Horticulture's compost factory.

Every batch runs on a **552-hour clock**. Every activity records who did it, with which machine, in
which vessel, what was measured and what proves it. Management can ask *"why is this batch late"* and
follow it down to a photograph.

---

## Run it on your laptop

You need **Node 20 or newer** (built and tested on Node 24) and a Supabase project.

```bash
git clone https://github.com/krishnathota112/freshbowl_os.git
cd freshbowl_os/mushroomos
npm install
cp .env.example .env.local     # then fill in the three values
npm run dev
```

Open **http://localhost:5173**.

### Filling in `.env.local`

Open `.env.example` — it explains each value and where to get it. Two of the three are all the app
needs to run; the third is only for migrations and tests.

**One thing that catches people out:** use the Supabase **session pooler** connection string, not
the direct one. The direct host resolves to IPv6 only and will not connect from most laptops. And
percent-encode the password if it contains `@`, `:`, `/`, `#` or a space.

### Signing in

Demo accounts, password `mushroom2026` (lowercase):

| | |
|---|---|
| `admin@freshbowl.demo` | creates batches, plans them, activates |
| `gm@freshbowl.demo` | the control tower, batch stories, the plant |
| `supervisor@freshbowl.demo` | decisions, deviations, releases |
| `operator@freshbowl.demo` | the floor — one task at a time |
| `lab@freshbowl.demo` | the lab queue |
| `manager@freshbowl.demo` | resources |

The role decides the screens, not the device. A general manager on a phone gets the control tower; an
operator at a desk gets their task list.

---

## Commands

| | |
|---|---|
| `npm run dev` | development server on port 5173 |
| `npm run build` | production build into `dist/` |
| `npm run preview` | serve the production build on port 4173 |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | the full suite — **see the note below** |
| `npm run db:migrate` | apply every migration, in order, forward-only |
| `npm run db:seed` | apply the seed data — the process definition itself |

### Running the tests

Most tests talk to the real database, and they share one Supabase project, so they must not run in
parallel:

```bash
npx vitest run --no-file-parallelism
```

Without that flag they contend on the connection pooler and fail intermittently for reasons that
have nothing to do with the code.

---

## The Android app

The same build, wrapped. One installable file for every role — the login decides the experience.

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

The APK lands in `android/app/build/outputs/apk/debug/`. It needs a JDK and the Android SDK; set
`sdk.dir` in `android/local.properties` to your SDK path, with forward slashes.

**The whole web build ships inside the APK** — there is no server to host. Only the data is remote.
That also means an update is a new APK; there is no over-the-air path.

---

## How it is laid out

```
mushroomos/
  src/
    api/          the only layer that talks to the database
    components/
      primitives/ buttons, chips, cards, empty states
      domain/     things that know domain shapes
      composite/  the rail, the narrative, the movement plan…
      layout/     AppShell (management) · FieldShell (the floor)
    routes/       the screens — the only layer that queries
    domain/       shared types, and pure time functions
    theme/        every colour and typeface, as tokens
  supabase/
    migrations/   forward-only, numbered
    seed/         the process definition, as data
  tests/
docs/             the product blueprint, the specs, the audits
mails/            the factory's own source documents
```

**Two rules the tests enforce, not convention:**

1. Nothing below `routes/` may import `api/`. Components take props, so they render the same from a
   fixture as from a live row.
2. The process length is never written into code. It comes from the process definition.

**The process is data.** Activities, durations, dependencies, evidence requirements, lab parameters
and resource rules are rows, not code. Changing a duration is a data edit — no screen changes.

---

## Where to start reading

| | |
|---|---|
| `docs/MUSHROOMOS_PRODUCT_BLUEPRINT.md` | what the product is, in factory language |
| `docs/UI_PRODUCT_SPEC_V2.md` | the interaction model — seven primitives, six lenses |
| `docs/AUDIT_BEFORE_V2.md` | honest state of the codebase |
| `docs/SOURCE_READ_2026-08-23.md` | what the factory's own documents say |

---

## Known state

The test suite is **not fully green**. Two process definitions currently exist in the database —
`PROCESS-2026B` (552 hours) and `ROUTE-2026A` (480 hours) — and several tests query without
distinguishing them. The storage-backed evidence tests skip unless a storage key is present.

`docs/AUDIT_BEFORE_V2.md` has the full picture and what each failure is.
