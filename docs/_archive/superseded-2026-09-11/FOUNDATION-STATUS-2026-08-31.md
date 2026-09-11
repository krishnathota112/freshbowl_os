# Foundation status

**31 August 2026 · red-team Phase 1.** One line per area, one of four words. `GREEN` = a test asserts
it against a real database. `AMBER` = implemented, proof incomplete. `RED` = broken or bypassable.
`UNRESOLVED` = needs a factory decision. "The migrations exist" and "the demo works" are not GREEN.

Detail: `WRITE-PATH-MATRIX.md` · `SECURITY-ATTACK-MATRIX.md` · `IDEMPOTENCE.md`.

---

## The board

| Area | Status | One line |
|---|---|---|
| **View write-bypass** | **RED** | `anon` writes `master_batch`/`deviation` through `postgres`-owned auto-updatable views — confirmed live over HTTPS. The systemic hole. |
| **TRUNCATE exposure** | **RED** | `anon`/`authenticated` can truncate `audit_event`, `batch_activity`, `evidence_media`; RLS does not cover TRUNCATE. |
| **Actual immutability** | **RED** | `submit_activity` overwrites `actual_end` via `coalesce`; no guard, no trigger, no supersession. MISSION §4.1, confirmed. |
| **Process-definition publish** | **RED** | No publish/freeze; a definition active batches ran on is still editable, and swappable via the view bypass. |
| **Manager/GM decision integrity** | **RED** | Forgeable through `v_deviation_open` (`state`, `decided_by_role`, `decision_reason`). |
| **Capture idempotence** | **RED** | `raise_deviation`, `record_occupancy`, lab-capture chain, `open_machine_stint` all duplicate on replay. Urgent for tomorrow's field use. |
| **Plan / baseline immutability** | **GREEN** | `0034`, 14 tests; base-table writes refused; H0-move and un-activate refused even through the view. |
| **Role resolution (fail-closed)** | **GREEN** | `0035`, 9 tests; `has_role` is `coalesce(...,false)`. |
| **Extension register** | **GREEN** | `0036`, 21 tests. Not re-forged this pass. |
| **Operator/actor identity** | **GREEN** | No RPC takes a caller-supplied actor; all 28 read `auth.uid()`. |
| **Dev clock isolation** | **GREEN** | Not reachable from any ACTUAL/AUDIT writer; writer gated on dev-mode + admin/gm. *(grep-test still to be written — Phase 2.)* |
| **Activity state transitions** | **AMBER** | Top-level state guard confirmed; the ten forbidden transitions not each individually forged. |
| **send_alert authorisation** | **AMBER** | `SECURITY DEFINER`, granted `anon`, no role guard in body — confirmed. |
| **Audit-event integrity** | **AMBER** | Actor columns nullable/no-default; append-only triggers present but not re-forged; TRUNCATE hole tracked as RED above. |
| **Resource occupancy** | **AMBER** | Writer sound; no unique key; 3 orphan rows are stale demo data, not a live defect. |
| **Evidence** | **RED (unproven)** | `storage_path` dedup key and supersession exist, but the end-to-end chain is unproven — storage-key tests skip; direct storage-object delete not probed. |
| **Lab result / approval (existing `0022`)** | **AMBER** | Writer identity sound; replay creates spurious versions. Distinct from the parallel team's new `lab_*`. |

---

## Overall

**RED.** The foundation has one systemic authorisation hole (auto-updatable views) and two
table-level ones (TRUNCATE, actual mutability) that between them let an insider with the shipped anon
key rewrite a batch's clock authorship, its Day-0 config, its process definition, delete it, forge a
manager decision, and empty the audit trail. The parts that were hardened in the last pass — plan
immutability, role resolution, extensions, identity, the dev clock — **held under attack**, including
through the view layer. The hardening is real; it is just not yet systemic.

The single highest-value fix is `security_invoker = true` on the views (or revoking view writes from
client roles): it closes the batch-clock, config, definition-swap, delete, and manager-decision
forgeries in one move.

---

## Ranked, with the one-sentence exploit and the proposed fix (proposed, not applied)

1. **View write-bypass (RED).** *An insider PATCHes `/rest/v1/v_live_batch` with the anon key and
   rewrites or deletes any batch.* → `security_invoker=true` on all `public` views (or revoke
   INSERT/UPDATE/DELETE on views from `anon`/`authenticated`); test that no auto-updatable view lacks
   it. Coordinate on `v_lab_checkpoint_map` with the lab team.
2. **Actual mutability (RED).** *A second submit while IN_PROGRESS, or after `return_activity`,
   overwrites a recorded `actual_end`.* → `BEFORE UPDATE` trigger refusing change to a non-null
   actual; corrections as superseding records (model on `evidence_media.superseded_by_id`); probe the
   hold/return/release flows first (MISSION §4.1).
3. **TRUNCATE (RED).** *`anon` truncates `audit_event` in one call.* → `REVOKE TRUNCATE ON ALL TABLES
   IN SCHEMA public FROM anon, authenticated`; test no client role holds it.
4. **Process-definition publish (RED).** *An admin edits, or anon swaps, the definition a live batch
   ran on.* → publish/freeze flag + activation snapshot; narrow `ref_write` to unpublished (§4.4).
5. **Capture idempotence (RED, urgent).** *A replayed offline capture creates a second deviation /
   occupancy / lab sample.* → a per-capture idempotency key on the field RPCs, designed with the lab
   team (`IDEMPOTENCE.md`). **Report only — do not patch under deadline.**
6. **send_alert (AMBER).** *Any signed-in user alerts any role.* → add `assert_role`.
7. **State transitions (AMBER).** *Unproven whether every forbidden transition is refused.* → forge
   all ten; add tests.
8. **Evidence end-to-end (RED-unproven).** *"Evidence is real" is asserted, not proven.* → configure a
   storage service key; run the skipped 20; probe direct storage-object delete.

---

## What could not be probed, stated so the silence is not read as "fine"

- **Direct Supabase Storage object deletion by a client** — no storage service key on this machine.
  Unproven, not cleared.
- **The parallel team's `lab_*` tables and the two capture screens** — out of boundary by
  instruction. Reported where visible; not probed.
- **The full ten-transition state matrix** — guard confirmed, transitions not each forged.
- **`audit_event` append-only triggers under UPDATE and DELETE** — present; not re-forged this pass
  (the live hole is TRUNCATE, which they do not cover).
- **The A9 manager-decision forge end-to-end** — the write path is open (identical view mechanism to
  the confirmed A1–A8), but no open deviation was staged to complete the demonstration.