> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# MushroomOS — demo script and the test APK

**23 August 2026.**

---

## 1 · The APK

`mushroomos/dist-apk/MushroomOS-demo.apk` — 3.9 MB, debug-signed, Android.

**It is a new build, not an edit.** There was no APK before today. The Android project
(`mushroomos/android/`) was created in this session with Capacitor, and it is committed — it
carries the app id, the label and the manifest, and regenerating it elsewhere would silently change
all three.

| | |
|---|---|
| App id | `in.freshbowl.mushroomos` |
| Label | MushroomOS |
| Ships | the entire web build inside the APK — no hosting, no server to keep up |
| Talks to | Supabase directly over HTTPS |
| Permissions | `INTERNET` only |

**No hosting was needed and none was set up.** The UI is bundled; only the data is remote. That
also means **an update requires a new APK** — there is no over-the-air path. Acceptable for 30
people at demo stage; say so if anyone asks.

### Installing it

Send the file. On the phone: **Settings → Apps → Special access → Install unknown apps → (the app
they opened it from) → Allow**, then tap the APK. Play Protect will warn that the developer is
unknown — "Install anyway". That is expected for a debug-signed build and is not a defect.

### Rebuilding after a code change

```bash
cd mushroomos && npm run build && npx cap sync android && cd android && ./gradlew assembleDebug
```

---

## 2 · The two field logins

Both accounts already existed. What did not exist until today was **a screen behind the lab one** —
`/lab/queue` was a placeholder reading *"Samples appear here… Step 8"*.

| Login | Password | Lands on |
|---|---|---|
| `operator@freshbowl.demo` | `mushroom2026` | **My Work** — Ravi, Field Operator |
| `lab@freshbowl.demo` | `mushroom2026` | **Lab** — K. Menon, Lab Technician |

Both open into `FieldShell`: one task on screen, 48 px targets, no nav bar, a persistent offline
chip. Neither ever renders the management chrome.

Management logins, same password: `gm@`, `admin@`, `supervisor@`, `manager@`.

> The sign-in screen used to render the password in uppercase while the real value is lowercase and
> case-sensitive. Anyone typing what they saw was rejected. Fixed today.

---

## 3 · The demo, in the order that lands

### A · The operator has real work — 90 seconds

Sign in as **operator**. The screen opens on 48 open tasks with a weighment progress card:
`TARGET 63.0 MT · LOADED 57.00 MT · REMAINING 6.00 MT · LOADS 30/33`, labelled **derived, not
typed** — the numbers come from recorded loads, not from anyone's estimate.

Tap **Load 09 of 11**. The drawer shows:

- the admin question the process asks — *"How much fibre does this batch need, and how much fits on
  one truck?"*
- target and actual quantity, each stating **`no target — W §2 — no SOP bound for a single load`**
  rather than inventing a limit
- **`EVIDENCE · 0 / 1`** and a submit button that reads
  **`Submit · 1 evidence item(s) outstanding`**

**Say this out loud:** the button is not disabled to be difficult. The server refuses a short
submission whatever the button does. The photograph is uploaded first and only then bound to the
named requirement — *a record of a photograph that is not in storage would be a false record.*

Scroll to **Day 2**: three rests showing `RESTING · 30 h 07 min remaining`. Those timers are the
server's. A phone set 48 hours forward does not open a gate.

### B · The lab records a reading nobody can quietly change — 2 minutes

Sign in as **lab**. 35 activities waiting.

Tap **Take a sample**. This is the moment worth pausing on:

> **Two source maps describe the same moments under different codes, and nothing in the sources says
> which one the factory follows. Pick the one you are actually working to — the system will not
> choose for you, and your choice is recorded with the sample.**

Both maps are listed — 27 rows from the lab dictation, 18 from the S4b columns — each carrying
**C-33**, **TBD-36**, and whatever else it touches. Several say plainly: *"No spec is mapped to this
checkpoint (TBD-36), so readings taken here will have no pass/fail band."*

Pick one. Record `71.4`. It comes back:

```
moisture_pct = 71.4          no spec to judge it against
v1 · K. Menon — Lab Technician · BEFORE_HOPPER_PASS_D4 (LAB_DICTATION) · calibration unknown
Measured again? Order a retest
```

**Three things to point at.** *No spec to judge it against* — the system did not pass it and did not
fail it, because the sources disagree and nobody has decided. *Calibration unknown* — no source
gives a calibration interval, so it does not claim the instrument was fine. And there is **no edit
button anywhere**: a wrong reading is corrected by a retest that names its reason and keeps v1 on
the record.

### C · The owner's view — 2 minutes

Sign in as **gm**. **Control Tower** → `look at it` on any exception → the batch page.

The paragraph is the thing to read aloud:

> **MB-DEMO-LATE is 3h 51m behind plan**, on the bunker stream — the slowest one, which is the one
> that sets the batch. Measured on 16 of 100 activities. The largest single piece — **44m** — came
> from Bunker Fill Check · Line 1 of 3, run by **K. Menon**, and no reason was recorded for it. […]
> At this rate it finishes **Sat 29 Aug, 8 am** — about 3h 51m after the planned Sat 29 Aug, 5 am.

Every fact in it is a database row. Nobody wrote it. *And no reason was recorded for it* is the
sentence that makes someone go and ask.

Press **Shift + ←**. The rail, the event stream and the paragraph move together — one playhead, one
position, three views.

---

## 4 · What to say when it is asked about

**"Why does it keep saying it doesn't know?"** Because the source documents disagree with each other
in 31 places, and the system carries both readings with a marker instead of picking one. A number
that looks confident and is wrong costs more than a number that says it is disputed.

**"Why no percentage complete?"** Half the process is resting, and rest does not compress. A batch
at hour 419 of 552 is not 76% done in any sense a person can act on. Position on the axis is the
honest indicator.

**"Can we change X?"** Adding an activity, a duration or an evidence requirement is a database seed
change with no application code involved. Changing the *decisions* — which spec applies, who
approves what — needs the factory to answer the open questions first.

---

## 5 · What is NOT in this demo, and will be noticed

Say these before someone finds them.

- **Evidence photographs do not display anywhere.** Fifty are staged in storage. The operator can
  capture one; nobody can look at one yet. That is the next thing built.
- **The Control Tower bars are not individually clickable.** `look at it` works; clicking a bar at a
  point on the axis does not.
- **No Excel export.** Nineteen sheets, not started.
- **Supervisor and manager screens are thinner than the other four.**
- **Nobody outside this build has used it.** Every screen has been driven by the developer. A real
  operator on a real phone will find things — that is what sending it out is for.
- **The APK has not been installed on a physical device by anyone yet.** It builds, and the exact
  bundle inside it was verified running as a production build in a browser. The first install is
  still the first install.

---

## 6 · State

```
379 tests · 21 files · typecheck clean · build clean
migrations 0001 … 0024
APK  in.freshbowl.mushroomos  3.9 MB  debug-signed
```
