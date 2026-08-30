> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# MUSHROOMOS — CURRENT APPLICATION REALITY AUDIT
## BEFORE ANY UI REDESIGN

We are pausing implementation changes.

Before redesigning the application, perform a complete black-box +
data-layer audit of the CURRENT MushroomOS application.

The purpose is to determine:

1. What actually works
2. What only looks implemented
3. What data is persisted correctly
4. What is missing
5. Whether the same batch state is reflected across all roles
6. Whether evidence/photos actually propagate through the system
7. Whether timestamps and actor identities are trustworthy
8. Whether the current process actually matches the authoritative factory
   process

DO NOT redesign anything during this audit.

============================================================
1. WORKSPACE
============================================================

Work ONLY in:

D:\freshbowl_os\mushroomos-alpha

Do not modify:

D:\freshbowl_os\mushroomos

Do not modify:

D:\freshbowl_os\mushroomos-codex

Do not modify:

D:\freshbowl_os\apk_extracted

============================================================
2. ROLE INVENTORY
============================================================

Verify all seven roles actually exist in the current application:

1. Admin
2. Operator
3. Lab Technician
4. Supervisor
5. Manager
6. General Manager
7. Chairman / Owner

For each role report:

ROLE
LOGIN / AUTH SOURCE
PRIMARY ROUTE
VISIBLE NAVIGATION
CAN READ
CAN CREATE
CAN EDIT
CAN EXECUTE
CAN APPROVE
CAN VIEW EVIDENCE
CAN VIEW AUDIT
CAN VIEW OTHER USERS' ACTIONS

Do not infer permissions from UI labels.
Trace the actual route guards, API calls, RPCs and RLS.

============================================================
3. MASTER BATCH TEST
============================================================

Use ONE dedicated DEV batch.

DO NOT use an old/stale demo batch if it was generated before the
latest process changes.

Create/use:

Primary Fibre:
Punjab

Structural Straw:
Local Paddy

Individual Batches:
366
367
368

Set an explicit H0.

Record:

master_batch.id
master_batch.code
H0 timestamp
process_definition/version

============================================================
4. PLAN GENERATION AUDIT
============================================================

After batch creation, inspect the actual database rows.

Verify:

PRE-H0
- material lab
- bagasse weighment
- bale cutting evidence

H0
- Bagasse Wetting starts at H0

Bagasse Wetting internal flow:
- Hopper Pass 1
- Lab
- Hopper Pass 2 conditional branch
- Bunker Loading

Rest periods

Parallel paddy work

Yard preparation

Three piles:
Pile 1
Pile 2
Pile 3

Each:
T0
→ Rest
→ T1
→ Rest
→ T2
→ Bunker

No global T2 barrier.

Tunnel planning deadline H240.

Tunnel loading later.

Tunnel process.

Tunnel unloading.

H552.

Report the actual batch_activity rows and compare them against the
authoritative process matrix.

============================================================
5. OPERATOR ASSIGNMENT TEST
============================================================

For the dedicated DEV batch:

Assign at least two activities to an Operator.

Verify:

batch_activity.assigned_person_id
operator identity
machine identity
planned hour
state

Then execute:

START
→ ACTUAL_START
→ COMPLETE
→ ACTUAL_END

Verify timestamps are server-authoritative.

Verify batch hour at execution.

Verify audit event creation.

Then open Operator My Work.

Confirm the exact same activity appears there.

PASS means:
assignment in DB == assignment in API == assignment in UI.

============================================================
6. LAB ASSIGNMENT TEST
============================================================

Assign/open a real lab checkpoint for the same batch.

Verify:

batch
checkpoint
lab technician
target specifications
result fields

Enter a real DEV result.

Upload a real image.

Submit.

Verify:

lab result stored
result values stored
actor stored
server timestamp stored
submission state stored
approval state stored

Then check the batch detail screen.

PASS means:
the actual submitted result appears there.

============================================================
7. PHOTO / EVIDENCE FORENSIC AUDIT
============================================================

This is CRITICAL.

Take ONE real DEV photo from the Operator side.

Take ONE real DEV photo from the Lab side.

For each uploaded image determine:

1. Which UI action performs the upload?
2. Storage bucket
3. Storage object path
4. Evidence metadata table
5. Evidence record ID
6. Associated batch ID
7. Associated activity ID
8. Actor ID
9. Timestamp
10. MIME type
11. File size
12. Retrieval mechanism
13. Whether the image can be displayed again

Then verify the SAME image can be seen from:

Operator history
Lab activity
Batch Detail
Management / Control Tower where appropriate

Do not accept:
"photo count = 1"

We need:

"the actual image renders."

PASS means:
upload → storage → metadata → retrieval → visible media.

============================================================
8. AUDIT TRAIL TEST
============================================================

Perform these actions:

1. Admin creates/changes something
2. Operator starts a task
3. Operator completes a task
4. Lab submits a result
5. Supervisor reviews/changes a decision
6. GM approves/rejects

For each action capture:

actor
role
timestamp
entity
entity ID
batch ID
batch hour
old state
new state
reason where applicable
evidence where applicable

Verify management can reconstruct the timeline.

============================================================
9. TIME REGISTER TEST
============================================================

For one activity verify all four registers:

STANDARD
ADMIN PLAN
ACTUAL
FORECAST

Test a controlled plan adjustment.

Verify:

STANDARD remains unchanged.

ADMIN PLAN changes.

Reason is recorded if required.

ACTUAL only changes through real execution.

FORECAST recalculates.

No register overwrites another.

============================================================
10. IMAGE PROPAGATION TEST
============================================================

Take an operator photo.

Then independently inspect:

- Operator
- Batch Detail
- Lab / management where applicable
- Control Tower drill-down

Take a lab photo.

Repeat.

Create a PASS/FAIL matrix:

IMAGE
UPLOADED BY
BATCH
ACTIVITY
STORAGE
OPERATOR VIEW
LAB VIEW
BATCH DETAIL
MANAGEMENT VIEW

============================================================
11. SAME-BATCH CONSISTENCY TEST
============================================================

The exact same batch must produce consistent state across:

Admin
Operator
Lab
Supervisor
Manager
GM
Chairman

For the same batch report:

Current H
Current activity
Individual batches
Pile states
Tunnel states
Exceptions
Evidence count
Actual timestamps

Any discrepancy is a defect.

============================================================
12. RESPONSIBILITY TRACEABILITY TEST
============================================================

We need to answer the founder's core question:

"Why was this batch delayed?"

Take a controlled delayed activity.

Example:

STANDARD:
H204 → H211

Operator actually starts:
H210

Then verify the application can show:

STANDARD
ADMIN PLAN
ACTUAL
FORECAST

and calculate remaining H552 buffer.

Management must be able to identify:

- which task slipped
- how much
- who performed it
- when it actually started
- when it actually ended
- whether the schedule was adjusted
- who approved the adjustment
- evidence attached
- impact on final completion

============================================================
13. PROCESS VS UI AUDIT
============================================================

For every screen mark:

DATA CORRECT
DATA INCORRECT
UI CORRECT
UI INCORRECT

We care about data first.

============================================================
14. FINAL REPORT
============================================================

Return a table:

AREA | PASS | FAIL | BLOCKED | EVIDENCE

Sections:

1. Roles
2. Batch creation
3. H0 clock
4. Plan generation
5. Operator assignment
6. Operator execution
7. Lab assignment
8. Lab execution
9. Evidence upload
10. Evidence retrieval
11. Audit trail
12. Time registers
13. Tunnel allocation
14. Three-pile concurrency
15. Management visibility
16. H552 forecast / buffer
17. Cross-role consistency

For every FAIL:

SCREEN
ACTION
EXPECTED
ACTUAL
ROOT CAUSE
DATABASE RECORD
API/RPC
UI

============================================================
15. IMPORTANT
============================================================

DO NOT FIX ANYTHING DURING THIS AUDIT.

We need a truthful photograph of the current application before
redesign begins.

At the end report:

WHAT IS ACTUALLY WORKING
WHAT IS PARTIALLY WORKING
WHAT IS FAKE / PLACEHOLDER
WHAT IS BROKEN
WHAT SHOULD BE PRESERVED
WHAT SHOULD BE REBUILT