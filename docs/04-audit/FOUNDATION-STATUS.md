# Foundation status

**11 September 2026 · the backend freeze.** One line per area, one of four words. `GREEN` = proved
against the deployed database by using it. `AMBER` = implemented, proof incomplete. `RED` = broken or
bypassable. `UNRESOLVED` = needs a factory decision. "The migrations exist" and "the demo works" are
not GREEN.

The 31 August board — every row RED where it mattered — is at
`docs/_archive/superseded-2026-09-11/FOUNDATION-STATUS-2026-08-31.md`. Detail:
`SECURITY-ATTACK-MATRIX.md` §G · `IDEMPOTENCE.md` · `WRITE-PATH-MATRIX.md`.

---

## The board

| Area | Status | Proof |
|---|---|---|
| **Views** | **GREEN** | 38 of 38 `security_invoker`; `anon` holds nothing; an event trigger closes the class for new views (`0061`, `0069`) |
| **Table writes · TRUNCATE** | **GREEN** | 0 write or `TRUNCATE` grants to any client role; an event trigger for new tables (`0074`) |
| **Function execute** | **GREEN** | 0 functions executable by `anon`; an event trigger for new functions (`0067`) |
| **Plan / baseline immutability** | **GREEN** | no plan moved after activation, for admin or GM, by any path (Wave 1 T-8, Wave 2) |
| **Actual immutability** | **GREEN** | `trg_actual_is_append_only` refused a clear from a superuser connection; client timestamps ignored or refused at every entry point |
| **Process-version freeze** | **GREEN** | published activities, gates, evidence and bindings refuse admin edits; 2026B 536 and 2026C 470 each compute their own standard |
| **Role resolution · fail-closed** | **GREEN** | wrong-JWT attacks on every important write refused; a lab technician and an operator cannot decide a lab submission |
| **Lab gate** | **GREEN** | submission leaves the gate shut; approval opens it; **a later rejection shuts it again** (`0072`); proven on the device |
| **Evidence** | **GREEN** | proven on the device — uploaded, bound, byte-identical in storage, shown through a signed URL; empty files refused; bound objects undeletable by every role |
| **Duplicate taps · lost responses** | **GREEN** | start, finish, bind, accept, extension decision, activation: one row each (`IDEMPOTENCE.md`) |
| **Machine and vessel exclusion** | **GREEN** at model and RPC level | exclusion constraints refuse both, with a sentence. **No 2026C activity carries a machine**, so a batch waiting behind one has never been seen on the real process |
| **Audit trail** | **RED** | every human act attributed; audit rows undeletable — **but `advance_batch` writes 30 untrue `gate_opened` events per poll** (F47, a `0072` regression). Fix `0077` written, **not applied** |
| **Lab capture replay** | **AMBER** | `open_lab_sample`, `request_lab_test`, `record_lab_result`, `raise_deviation` duplicate on replay; no idempotency key exists (F39). Nothing replays until an offline queue exists |
| **`request_lab_test` authorisation** | **AMBER** | no role guard (F37) |
| **File content at upload** | **AMBER** | declared type enforced, bytes not inspected (F40) |
| **Session revocation** | **AMBER** | a role change or sign-out lags until the access token expires; 1800 s decided, to be set (F41) |
| **Resource occupancy data** | **RED** | `ARCH-006` — occupancy rows for vessels nobody allocated; diagnosed as stale demo data |
| **Schema drift** | **AMBER** | `ARCH-008` not run this cycle; `SCHEMA.md` regenerated 11 Sep after its generator was found reporting the opposite of the truth |
| **Production readiness** | **RED** | dev clock marker, shared demo accounts, demo batches beside real ones (F42, F43) — deployment, not code |
| **The loader · changeover · receiving bunker · 67–68 %** | **UNRESOLVED** | factory decisions; no gate built on any |

---

## Overall

**AMBER, with one RED that is one migration from GREEN.** The foundation held under 195 adversarial
attacks and a full run of the loop on a device; the systemic holes of 31 August are closed and each
has an event trigger so the class cannot quietly return. The RED is a regression from this cycle's own
fix, caught by the existing suite — `0077` corrects it and waits only for approval to apply.

**Ready for the three workstations, subject to `0077` and to the deployment items before any real
factory use.**

---

## The test suite

`npx vitest run`, 12 September, against the deployed database, after the Lab workstation (UI-001):
**570 passed · 18 failed · 3 todo · 591 total.** No failure is an unexplained product defect, and
none was introduced by UI-001/UI-002. The three `resources` failures of 11 Sep have cleared, as
predicted, now the 9 Sep occupancy is out of their window. (11 Sep: 562 · 21 · 3 · 586.)

| Suite | n | Cause | Kind |
|---|---|---|---|
| `demoBatches` | 6 | the demo set was regenerated onto 2026C and never re-staged | fixture state |
| `hourlyPlan` | 5 | no draft activity at the expected day; the vessel it picks is not the one holding another batch | fixture state |
| `varianceAttribution` | 3 | no completed work on the demo batches to attribute | fixture state |
| `plant` | 2 | `ARCH-006` | fixture state, diagnosed |
| `evidence` | 1 | needs an activity with three outstanding requirements | fixture state |
| `eventTrail` | 1 | **F47** — passes once `0077` is applied | **product regression** |

**Eleven more were failing this morning** and were fixed on the test side, because the product had
become stricter than the fixture: nine `deviations` tests submitted work that was never started
(refused since `0071`); `roleResolution` expected a self-promotion to update zero rows, and since
`0074` it is refused outright; `extensionRegister` asserted a database-wide expiry count that open
requests on cancelled batches inflate (F46). **Each assertion still proves the same claim — only the
mechanism it is proven through changed.**

**Do not delete active demo batches to turn these green.** Re-staging the demo set is `ARCH-011`.

---

## What could not be proved, stated so the silence is not read as "fine"

- **A real Android handset.** The device run was an emulator. The camera behaviour (F32) is the first
  thing a real phone must confirm.
- **Machine contention on the real process** — see the board.
- **Offline capture** — not built, so replay safety is reasoned, not observed.
- **The migrations-built schema equals the deployed one** — `ARCH-008`.
