# Process Time SOP · v2.6

The factory had three different concepts shown too close together:

- **Task SOP**: the reusable task sequence, streams, descriptions, Lab checks, photo rules, and scheduling relationships.
- **Process Time SOP**: one factory-wide catalog of standard *planned* hours and minutes for each task handed out. It includes process, rest, cleaning, Lab, and Turner stages. Turner standards are shared across piles by pass; each pile still has its own task and actual record.
- **Factory Operations actual-time chart**: observed durations from completed work, with `n` showing the sample count. These observations never silently change the standard.

Admin now edits planned standards directly in the **Process Time SOP** tab, without making or publishing a Task SOP version. The catalog collects distinct tasks from the latest published Task SOP in each family; unsaved template durations are displayed as starting suggestions, and conflicting template values are flagged for review. Admin can add another task to the catalog and save all standards. A blank duration means unknown, not zero.

When creating a batch, saved factory standards overlay the selected Task SOP's durations before the schedule is shown. Admin can override a duration for that batch. Changing standards later affects future new batches only; it does **not** rewrite existing batches, tasks, photos, Lab results, or measured actual times. The Task SOP editor displays saved standards as read-only while still allowing task order and start-timing rules to be edited. Older APKs keep using their bundled SOP durations until updated.

Migration `database/0160_process_time_sop.sql` adds only `tk_process_time_standard`, an append-only revision history, and an Admin-only save function. A rollback-only compilation proof passed against the live database. The installer made a fresh local safety copy, then verified before/after digests for all existing Tasks tables and photo-object metadata in the same transaction before committing. At installation: 6 batches, 253 tasks, 59 photo records and 66 photo objects were unchanged.

The initial v2.6 release was published and verified byte-for-byte on the live website and APK download site. An immediate v2.7 follow-up added an editable **standard display name** in this catalog. Renaming that label keeps the stable matching key and does not rename Task SOP rows, existing batch tasks, or work history. A renamed label remains visible after reopening the catalog; the original Task SOP name is shown beneath it for clarity.

All 98 app tests passed for v2.7. Android package `in.freshbowl.tasks` was published as v2.7/versionCode 18, signed with the same certificate as v2.5 and v2.6. The stable website files, `latest.json`, downloadable APK bytes and SHA-256 were verified against local source/release files. The v2.6 versioned APK remains available. Test an in-place update on one factory phone before asking everyone to install it. Admin still needs to review and save the factory-wide standard times; no durations were silently chosen from conflicting templates.
