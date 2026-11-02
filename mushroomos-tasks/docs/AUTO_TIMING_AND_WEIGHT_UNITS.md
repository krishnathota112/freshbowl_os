# Automatic planning and weight units — 30 September 2026

Tasks website and Android v1.8 (versionCode 9, package `in.freshbowl.tasks`).

## Planning

- Admin → Timing setup → choose SOP → Edit reusable template. Set hours/minutes, select the scheduling scope, click **Use durations for following tasks**, then save/publish.
- New batches use saved timing rules relative to the bagasse-wetting start. Each parallel stream/pile has its own initial date; before-batch preparation remains before the wetting anchor. Unknown durations are never fabricated. Zero is an explicit instantaneous checkpoint.
- Linked rows follow the preceding planned finish in their stream/pile, or the preceding master row for whole-batch sequencing. An optional signed whole-minute gap supports extra waits/overlaps.
- Editing a start makes that row a fixed anchor. Linked dates recalculate. The default checked option also shifts following manually scheduled dates; scope defaults to the same stream/pile. Changes remain unsaved until Save.
- Recorded rows are protected boundaries. Actual times, notes, Lab results and evidence remain untouched. Planning rules are advisory, not execution gates.
- Single-task details link to the batch row editor for timing/stream changes so rescheduling is reviewed together.
- Incomplete linked schedules can be saved as SOP drafts, but cannot be published or saved as a finished batch plan. Set the missing predecessor duration/start or supply a manual anchor.
- `0156_tasks_auto_schedule.sql` is applied. `database/auto-schedule.mjs` proves planning RPC round trips, old-client preservation, Admin/recorded/stale/closed safeguards, and independent task starts. Fixtures roll back; digests confirm original records unchanged.
- Existing SOPs/batches are not reconfigured automatically. Admin must supply authoritative durations and publish a timed version once. Old APKs must update before editing timed SOPs.

## Weight fix

- New/add-material unit selectors formerly reinterpreted unchanged digits; kg → tons could multiply the intended weight by 1,000. Edit switching restored saved values, losing unsaved changes. Summary columns always showed kg.
- Switching now converts current inputs while preserving their physical weight and unsaved edits. Choose the unit before entering a new amount. Blank inputs stay blank; placeholders and headers reflect the unit.
- Requirements are stored in kg. For example, 51.85 tons is sent as 51,850 kg once. Tables show the selected unit plus its equivalent; previews show conversions before saving. Preference is remembered on that device.
- Invalid allowances are rejected rather than silently saved as zero. Existing allowances are shown and flagged if at least as large as the requirement. Slip ledgers retain explicitly labeled kg columns.
- User-confirmed corrections for batch 183,184,185 / Paddy (Local): required **51,850 kg (51.85 tons)**, allowed variation **100 kg (0.1 ton)**. Applied through audited Admin RPCs using `database/correct-paddy-183.mjs --apply` then `--allowance --apply`. Note unchanged; state is Receiving with no slips. No other records corrected.

## Verification / release

- 54 automated tests pass, including six weight-unit and ten automatic-schedule tests.
- Browser verified the corrected quantity and conversion of an unsaved 20 tons input to 20,000 kg without submitting a material.
- Android build succeeds; package/version verified; signing certificate matches v1.7 for in-place updates. No physical phone installation performed.
- Website: `https://mushroomos-tasks.pages.dev/`, deployment `e9359882`. APK: `https://freshbowl-tasks-downloads.pages.dev/`.
- `app/scripts/verify-release.mjs` verified live website bytes, v1.8 manifest/headers, APK checksum and size. Published APKs must never be overwritten with different bytes.
