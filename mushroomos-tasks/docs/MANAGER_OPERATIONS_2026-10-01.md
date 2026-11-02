# Factory Operations — Manager view and analysis plan

## Why this exists

The machinery owner works in Excel and wants to see the whole factory, not just individual task cards: every active batch, what is happening on the field, elapsed time versus plan, manpower, machinery, and fuel. His spreadsheet is a useful model for **cross-batch time and resource visibility**. The Tasks app must remain the source of recorded field events, while this separate Manager view translates those records into an inspectable factory picture. It does not replace Supervisor, Lab, GM, Weighbridge or Admin workflows.

The source workbook is `C:\Users\prath\DATA\20260217 Compost new procedure_2 (1).xlsx` (read-only review). `Process` lists the process stages and durations from bagasse through paddy, Turner, bunkers and tunnels. `New version V2 Bunker Reloading` and `New version V2 Bunker Reloa (2)` lay multiple batch groups across an hourly calendar, exposing overlap. This is a **planning reference**, not evidence that a task happened or a resource was occupied. Some written time/duration labels require factory confirmation before they become an automatic scheduling rule.

The parent-folder `minimap_for_visuals` PNG is a **mockup** with invented batch labels and resource positions. The owner clarified that a batch may use **up to three bunkers and three tunnels**, not that the mockup's B1–B4/T1–T3 are the factory's real equipment IDs. Therefore this release uses a functional process map, not a purported live physical map.

## Implemented first view (website)

- `manager` is an existing server role with read access and no task/machine/approval write privileges. It now lands on `operations.html` after normal sign-in. Opening `app.html` as Manager redirects to the new view. Admin can preview it from Data Orientation.
- Admin-only account setup on the operations page uses the existing audited `admin_create_user` function. Email is prefilled from the owner's request; Admin enters the correct display name and a private initial password. **No account is silently created** and no password is put into source code or this document.
- Active batch cards show *every* recorded running task, its stream/pile and actual start; last finished and earliest suggested unstarted task are clearly distinct. No running record is reported as “none marked running,” not “factory idle.”
- The stage view groups running task names into bagasse, paddy, mixing, Turner, bunker/conditioning, tunnel/discharge or other. It is explicitly a text-derived process view, **not** verified equipment occupancy or a floor-plan locator.
- Average duration is arithmetic mean of completed tasks finished in the selected period with valid actual start and finish, grouped by normalized title, stream, type and Turner pass. Sample count and average plan (where available) accompany each bar. Historical `done_before` or missing times are not invented.
- Current running crew totals are summed **task assignments, not distinct people**. A task-by-task table shows average recorded crew and observed labour-hours with separate coverage counts. Labour-hours use recorded crew count × actual elapsed hours for completed tasks; the count is assumed constant during that task.
- Machine use counts running tasks now plus tasks finished in the period; kilometres only use valid paired odometer readings. Fuel shows measured **litres added at refuelling** by machine and period, excluding voids. It never claims task-level fuel consumption or fuel-burn efficiency.
- Task ledger preserves serial number, suggested time, actual times, planned duration, descriptions, piles, photos, crew and machine evidence. Tables download as UTF-8 CSV (opens in Excel) with formula-like text neutralized. Each active batch also has its existing full Excel progress report download. A snapshot timestamp and IST labels appear throughout.
- The view only reads authenticated records on load; account creation is the one explicit Admin action. There is no new database migration, data copy, batch edit, photo delete or bulk mutation.

## What to add next, after the owner validates this view

1. **Physical resource register.** Record actual bunker/tunnel IDs, available capacities, planned and actual allocation start/end, and cleaning/maintenance blocks. Only then can the app warn that two batches are scheduled for the same physical space, or draw trustworthy live occupancy on a real map.
2. **Manpower quality.** Decide whether staff identity/shift is needed. Task crew counts cannot answer unique-person headcount or individual productivity. Confirm how changing crews during a long task should be recorded.
3. **Machine economics.** Confirm which equipment has odometers versus hour meters, which refuel events belong to which tank, and whether cost/maintenance needs to be tracked. Refuelling litres alone cannot establish fuel consumed by a task.
4. **Planning grid.** Recreate the spreadsheet's hour/day overlap for upcoming batches using actual resource allocation rules and the approved SOP durations. Keep planned, forecast and actual rows separate. Apply the paddy convergence warning as one input; it does not by itself prove bunker/tunnel availability.
5. **Data coverage.** Review which tasks are still missing actual start/finish, labour counts and machine observations. The owner can only trust comparisons when coverage is visible and improves.

## Release and verification boundary

This change is web-focused. The existing APK is not rebuilt or redeployed here. All existing database records remain untouched. Local automated tests cover role routing, read-only loading, missing-time exclusions, machine/fuel separation, CSV safety and existing Tasks flows. A real Manager login and production data read must be verified after Admin creates the account.

Published to `https://mushroomos-tasks.pages.dev/` on 1 October 2026; final deployment `https://3d6f5864.mushroomos-tasks.pages.dev/`. All 80 local app tests passed. The public `operations.html`, CSS, JavaScript, auth, app and login files returned HTTP 200 and matched their tested local bytes. No account was created by the deployment.

The subsequent v2.5 release combines this Manager view with the new theme on the website and factory-phone APK. See `RELEASE_2_5_THEME_AND_OPERATIONS.md` for the current deployment and phone-update details.
