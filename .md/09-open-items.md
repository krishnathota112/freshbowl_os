# 09 · Open items

## Decisions for the factory / owner

- [ ] **67–68 % moisture rule** at the moisture decision (still open in the SOP).
- [ ] **Turner planning durations** (1.5 h per pass kept).
- [ ] **Start time of a step already running at onboarding** — should the Admin enter it, so the time gate counts
      from the real start instead of the Start tap?
- [ ] **Lab result acceptance** — Lab and supervisor may accept a result as final; should it be Lab only?
- [ ] **Bunker hold hours** — the process uses 63 h / 60 h; the SOP text says "48+ h" / "36+ h".
- [ ] **Grace window** — 30 minutes (Admin-configurable in `extension_policy`).

## Before real use

- [ ] Replace the demo passwords (Admin → Logins) or switch those accounts off.
- [ ] Create real logins for every supervisor, lab technician and GM; test one sign-in on the phone.
- [ ] Decide on a permanent web address (the Cloudflare quick tunnel changes when restarted).
- [ ] Floor staff use the APK only (camera-only photos).

## Still to build

- [ ] Variance report screen (planned / extended / actual) on top of `v_activity_schedule`.
- [ ] UI walk-through of every screen on a phone for each role, and further clean-up from what it shows.
- [ ] Push the code to a remote repository (currently local git only) when asked.
