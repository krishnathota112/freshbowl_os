# Next steps — MushroomOS Tasks

> **27 Sep evening — Weighbridge built** (`WEIGHBRIDGE.md`). Next for it: a real weighbridge login on a phone and
> the Admin Weighments tab with a real Admin login; deploy both web pages. Next migration number: **0152**.


The later Lab/pile update is complete: see `LAB_PILES_UPDATE.md`. Process/Lab tabs keep master row numbers,
Description is saved, and Turner has separate pile/pass records. The owner confirmed Turner-only pile tracking.
The latest ready template is Compost standard v2, with 104 rows. 0148/0149 are live.

Latest: the owner requested the pasted schedule as a ready editable template. This is implemented; see
`READY_TEMPLATE_UPDATE.md`. New batch opens with the filled table, editable calendar dates and serial order.
The shared editor supports add/duplicate/move/remove and task settings. Range selection, fill-down and undo
remain separate future spreadsheet improvements. Earlier “format reference only” notes below are historical.

## 1. FIRST: real spreadsheet editing (owner's instruction, 27 Sep 2026)

> "The Excel thing is for reference — tasks will be assigned in an Excel manner, not in the parsing way. I want to
> improve this further."

The H0–H474 table the owner pasted (`reference/owner_sop_reference_table.md`) shows the **format** he thinks in. It
is not a file to import. What he wants is that **making the SOP and assigning tasks feels like working in Excel**:
the Admin types straight into a grid.

27 Sep update: the existing row editor now includes an optional **Suggested date/time** column. The Admin types
example dates against an SOP reference H0; batch creation shifts them to the batch's H0. These are suggestions, not
eligibility gates. Migrations 0144–0147 are live; the v1.2 APK is built but not yet installed on a phone, and the web page
has not been deployed. This is a column addition; the keyboard/range spreadsheet behavior below is still to be built.

Today's editor (`app/www/app.js` → `renderSop`) is a table of form inputs with ↑ ↓ ＋ ⧉ ✕ buttons and a
"Paste from Excel" box. Keep "Paste" only as a convenience; the grid is the main way.

What "an Excel manner" should mean (confirm details with the owner before building):
- Click a cell and type; **Enter** moves down, **Tab** moves right, **arrow keys** move between cells; typing on the
  last row adds a new row.
- Select a cell / range / whole rows; **Ctrl+C / Ctrl+V** copies and pastes ranges inside the grid and to/from Excel
  (tab-separated); **Delete** clears cells; **Ctrl+D / drag** fills down (e.g. the Line "Paddy" for ten rows).
- Insert / delete / move rows from a right-click menu or row handles (drag to reorder).
- Dropdown cells for Type, Photos, Ask for, Lab checkpoint (type the first letters to choose).
- Undo / redo (Ctrl+Z / Ctrl+Y) while editing a draft.
- Frozen header row and first columns; row numbers; the Lab-gate rows tinted as today.
- Save = the whole table (the database already works this way: `tk_sop_save` replaces a draft's rows).
- The **same grid for a running batch's tasks** (Admin): add / rename / reorder tasks that have not started;
  started and done rows are read-only (the database already refuses changes to started tasks).
- Works on a laptop first; on a phone the grid scrolls and cells open a small editor.

Implementation hint: stay framework-free like the rest of `www/` (a small custom grid, ~400–600 lines) or embed a
proven MIT grid library from `cdn.jsdelivr.net` (must work offline in the APK → vendor the file into `www/`).
No database change is needed for the grid itself.

Open questions to ask the owner (do not guess):
- Resolved: "assigning" means putting tasks on the SOP/batch. Tasks are **not assigned to named people**; the
  appropriate logged-in worker can open and perform them.
- Should the Admin be able to edit a running batch's tasks in the grid, or only the SOP?
- Any columns missing from his table (e.g. Machine, Location, Notes)?

## 2. Then
- Owner walk-through with real logins (Admin, Supervisor, Lab, GM) on the APK and the local web page; fix what they
  report. Nothing has been tried with a real login yet.
- Deploy the web page (`README.md`).
- Probable asks — build only when asked: notifications for the Lab and GM queues; a batch report / Excel export
  (times, photos, readings); archive an SOP version; offline capture.

## 3. Status at hand-over (27 Sep 2026)
| Piece | State |
|---|---|
| Database 0144 | Live; proof 9/9 against live |
| App (web + APK) | Built; screens clicked through with a fake-login test page; not yet used with real logins or on a phone |
| Web hosting | Not deployed |
