   # MushroomOS — standing brief

## What this project is
A 552-hour production control tower for a mushroom-compost factory. The system records what a
Master Batch was supposed to do, what actually happened, who did it, with what machine, what
was measured, what proves it, and who allowed the process to continue.

## Your role
You implement. You do not decide architecture, invent business rules, resolve factory
questions, or change the process definition. Those are decided by the client and specified in
`docs/`. If a spec and the code disagree, the spec wins. If two specs disagree, the precedence
list below wins. If the specs are silent, you STOP AND ASK — you do not choose.

## Document precedence — higher wins
1. `docs/KIRO_BUILD_INSTRUCTIONS.md` §0.5 (five frozen decisions), §0.6, §1 (non-negotiables)
2. `docs/TIME_CONTRACT.md` — normative, frozen
3. `docs/BUILD_SEQUENCE_KIRO.md` — the order of work
4. `docs/UI_DESIGN_SPEC.md` + `docs/UI_CONTROL_TOWER_SPEC.md` — the design system
5. `docs/UI_IMPLEMENTATION_PLAN.md` / `UI_COMPONENT_ARCHITECTURE.md` / `UI_DATA_CONTRACTS.md`
6. `MUSHROOMOS_V2_END_TO_END_PRODUCT_CONTRACT.md` — product scope
7. `docs/CONTRACT_AUDIT_2026-08-22.md` — what exists, what is missing, what must not be touched

## Ten rules that are never suspended
1. **Never resolve a factory or process conflict.** 31 conflicts + 41 TBDs live in
   `docs/SOURCE_CONFLICTS.md`. Where sources disagree, carry BOTH, mark BOTH with the conflict
   ID, and add a register row. New IDs start at C-37 / TBD-51.
2. **Never invent a number** — no threshold, no duration, no rest hours, no lab spec, no
   approver, no schedule mapping. A value with no source is `null` plus a marker, never a
   default.
3. **The process is data.** Adding an activity, changing a duration or adding an evidence
   requirement is a seed-SQL change with zero application-code change. If a change needs code,
   you have modelled it wrong.
4. **No hard-coded counts or time literals.** Not `10` loads, not `3` bunkers, not `4` batches,
   not `552`, not `23`, not `05:00`. Everything derives from `process_definition` or Day-0
   config.
5. **No material name in a generic process definition.** The database enforces this with a
   CHECK constraint on `process_activity.code`. Activities bind to roles
   (`PRIMARY_FIBRE`, `STRUCTURAL_STRAW`, …), never to bagasse or paddy.
6. **The server is the authority.** Every state transition is a `SECURITY DEFINER` RPC. The
   frontend may mirror state for display; it never decides it. Device clocks never open gates.
7. **Never fake a state.** No demo-only transitions, no placeholder workflow, no plausible
   fixture the engine could not produce, no zero count that actually means "not built".
8. **Do not rebuild what exists.** `docs/CONTRACT_AUDIT_2026-08-22.md` §6 lists nine things that
   were paid for once and must survive. Read it before touching the schema.
9. **No second application.** One design system, one auth model, one backend. The legacy APK in
   `legacy/`/`apk_extracted/` is visual reference only — never forked.
10. **No step is done until its exit proof runs green** in `npm test` or `mushroomos/scripts/`.
    Prose is not an exit proof.

## Stop and ask
Halt and report rather than choosing, whenever you hit: a conflict ID, a missing duration, an
unnamed approver, a disputed threshold, two sources that disagree, or a spec that is silent on
something you need. `docs/BUILD_SEQUENCE_KIRO.md` has the full stop-and-ask register.

## How to report
Every task ends with:
- what was built (files touched)
- which exit proofs now pass, with the command and its output
- which acceptance criteria now pass (by ID)
- which conflicts/TBDs were touched, and how they were preserved
- what was left undone, and why
- anything you had to stop and ask about
