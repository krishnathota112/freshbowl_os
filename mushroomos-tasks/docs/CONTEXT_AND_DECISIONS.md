# Context and decisions — how MushroomOS Tasks came to be

Latest owner correction: ordinary Lab checks are separate tasks, shown in a Lab tab with the same master row
numbers as Process. Add Admin Description and per-pile Turner records/photos. The owner explicitly confirmed
Turner stages only. Implemented as Compost standard v2; see `LAB_PILES_UPDATE.md`. The older rejection of
per-pile convenience no longer applies to this authorized scope.

The full story of the working session (25–27 Sep 2026) between the owner (Freshbowl Horticulture, button-mushroom
compost factory) and Claude, so another person or agent can continue without re-asking. Newest decisions win.

## The factory in one paragraph
Compost is made in batches over ~470 hours from H0 (the batch clock): bagasse wetting and hopper passes, heap and
first bunker conditioning, a parallel **paddy** stream (bale prep + 3 soaks for Punjab paddy, 2 for local), a parallel
**chicken-manure / minerals** stream, meeting points (convergences), then the **Turner** on ~6 piles with two machines
(M1, M2; T0 → T1 → 8 h rest → T2 → T3 per pile), piles paired into three **bunkers** (P1+P2 → B1 …), reloads, then
**tunnels** (144 h), and the grow room. The **Lab** takes 25 checkpoints; 4 are **gates** (production waits for an
approved result: Lab submits, GM approves), 1 is a decision (moisture), the rest are records. **Cleaning** of
bunkers/tunnels runs in parallel. Sources: `reference/factory-sources/`, `reference/main-app-product-docs/`.

## The main MushroomOS app (context, not this project)
A React + Supabase web app plus a phone field app that plans every batch from a versioned SOP (PROCESS-2026M, 127
steps), enforces planned times, due times, late tickets, Lab gates and evidence. During the session:
- Real running batches 155–181 were loaded onto it with their times, weights and vessels.
- A **Compost Log** app (`workingcode/datalog-app`, tables `dc_*`) was built to collect data on running batches
  (typed tasks per lane, photos, timestamps, catch-up).
- An **Experimental Mode** was designed and built inside the main engine (migrations 0142/0143, experiment screens,
  field-app 1.1 "Record a movement"). It is live but **parked** — see "Rejected directions".

## What the owner asked for, in his words (chronological, 27 Sep)
1. An experimental process where "Admin decides things, movement and anything and everything"; the factory executes
   when it wants; the system records it. "No time gates."
2. On seeing the design grow: **"i want the editing in this format . the entire sop process , where i can change this
   thing anytime i want to. i just need an apk and an sop publishing thing where i will create a new batch and select
   the sop or i will create the sop in the above format , which i can customize anytime i want to , i can change the
   task name and i can change the type of process , and there is no set duration kind of like excel"**
3. **"i need an apk seperate from the current application and also the web page should be seperate , take things from
   the existing application."**
4. **"THIS IS A SIMPLE TASK ALLOCATION APPLICATION WHY ARE WE OVERCOMPLICATING THINGS ANY TASK I ENTER IT SHOULD BE
   SHOWN IN THE APPLICATION"**
5. **"THE LAB GATE IS SAME , DONT CHANGE ANYTHING IN THE LAB GATE . THERE ARE SOME DECISION POINTS RIGHT THERE THE LAB
   GATE SHOULD BE APPLIED , OTHER THAN THAT ANYWHERE LAB CAN BE DONE BEFORE OR DURING THE PROCESS ."**
6. Answers to the last questions:
   - Next task in a line opens only after the previous one is done → **YES**.
   - Lab enters results and GM approves in the same new app with existing logins → **YES**.
   - Per-pile rows → **"LET ME DO IT , LET ME HAVE THE CONTROL TO DO THIS"** (he types P1–P6 himself).
   - Editing → **"ANY EDITS THAT I MAKE TO THE SOP , MAKE IT INTO A NEW VERSION WHICH I CAN OPT TO USE OR NOT"**.
   - Parallel / dependencies → **"THE ENTIRE CONFIG WILL BE DONE BY THE ADMIN , PARALLEL IS CLEANING AND PADDY RIGHT WHY
     ARE WE OVERCOMPLICATING THIS"** (so: lines, no cross-line links).
   - Compost Log → **"NEW APK ENTIRELY SEPEARATE FROM WHAT WE HAVE . TAKE DESIGN ELEMENTS FROM THE EXISTING APK ."**
7. **"the excel thing is for reference , like tasks assigning will be assigned in a excel manner not in the parsing
   way i want to improve this further"** → the reference table shows the format; the editor must behave like a
   spreadsheet (see `NEXT_STEPS.md` §1).

## What was built (MushroomOS Tasks)
- Database `0144_tasks_app.sql` (live): SOP tables with versions, batches, tasks, photos, Lab readings, GM decisions;
  rules in functions (line order, Lab row never holds, Lab gate holds until GM approves, photos + asked value to
  finish, catch-up, Admin edits only of unstarted tasks). Proof 9/9.
- App `app/www` (APK + web page, same files): Batches, SOPs (table editor + paste), Lab work, Approvals; task screens
  per role; field-app look. APK `apk/MushroomOS-Tasks-2026-09-27.apk`.

## Rejected directions (do not bring back without the owner asking)
| Idea | Why it was dropped |
|---|---|
| A canvas / "game" process builder with nodes and wires | Duplicated the SOP builder; not how the owner thinks (he thinks in tables). Deleted. |
| Experimental Mode inside the main SOP engine (observed-time batches, process maps, movement events) | Too complex for what he needs; he wants a separate simple app. Parked, live, hidden from the main menu. |
| "For each pile" automation | He wants to type P1–P6 rows himself. |
| Cross-line dependencies, meeting points, option/decision engines, loops | "Why are we overcomplicating this" — lines + order + Lab gate is enough. |
| Growing Compost Log into this | He wants an entirely new APK. |
| Paste-and-parse as the way to build the SOP | It is a convenience only; editing must feel like Excel. |

## Constraints that held throughout
- One live shared database with real data: additive changes only, rollback file + rolled-back proof before applying.
- No secrets in app folders; the assistant never types passwords; the owner signs in and runs deploys.
- Don't invent factory rules; ask.


## 27 Sep evening — Weighbridge (raw-material weighment)
Owner: a separate, fixed interface with its own login where weighbridge slips (photo + weight) are subtracted from the
required weight Admin sets per batch and material (with a calculation slip), alerting Admin when it goes over (21 of 20)
or ends short (19 of 20). Answers: per batch + material; subtract net; allowance per requirement; short when Finished;
fixed list + Admin can add materials; tons and kg; Admin creates logins (and may enter slips); in-app badge.
Built: `docs/WEIGHBRIDGE.md`. Two assistants edited this folder at the same time that evening; migration file numbers
were reconciled (lab piles 0148/0149, weighbridge 0150/0151).
