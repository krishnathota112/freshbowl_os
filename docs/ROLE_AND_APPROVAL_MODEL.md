# ROLE AND APPROVAL MODEL

Labels: **[FACT]** cited · **[INFER]** derived · **[DECISION]** product decision · **[TBD]** confirm.

---

## 1. Roles

Six roles. **[FACT]** The existing app has three (`operator`, `admin`, `chairman` — S8d);
the three missing ones (Supervisor, Lab Technician, Manager) are precisely the people whose
work the paper system records: S3f names `Supervisor / In-charge: RAMARAO`, S4a is written
for a lab technician, and S6a/S7a are a manager's planning artefacts.

| Role | Authority | Primary surface | Answers |
|---|---|---|---|
| **General Manager** | Management decision authority. Approves or returns at 4 checkpoints. | GM Web — Factory Command Center | "Is this batch worth continuing, and where does it go?" |
| **Manager** | Resource authority. Allocates vessels, equipment, vehicles, people. Resolves conflicts. | Management Web — Resources | "Can the factory physically do this plan?" |
| **Admin** | Instantiation authority. Turns an approved schedule slot into a configured, validated, activated master batch. | Management Web — Schedule & Batch Creation | "What exactly is this batch supposed to be?" |
| **Supervisor** | **Operational control authority.** Releases, holds, returns. Handles deviations. Requests overrides. | Supervisor Mobile — Control Room | "What is stuck, and what do I do about it?" |
| **Field Operator** | Execution. Records actuals, times, equipment used, evidence. | Operator Mobile — My Work | "What is my next task, and what is the target?" |
| **Lab Technician** | Measurement and validation. Records structured results, runs retests. | Lab Mobile — Lab Queue | "What samples are waiting and what do I measure?" |

**[DECISION]** The GM does **not** approve operator activities. This is the single largest
behavioural change from the existing app, whose `approvals.html` routes work items to a
"chairman". At ~10 concurrent batches × 17 activities × 2–3 lines, GM-per-task is ~400 open
approvals at any moment.

---

## 2. Authority matrix

| Action | Op | Lab | Sup | Admin | Mgr | GM |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| View own task queue | ✅ | ✅ | ✅ | | | |
| Record operator actual | ✅ | | | | | |
| Capture evidence | ✅ | ✅ | ✅ | | | |
| Submit activity | ✅ | | | | | |
| Record lab result | | ✅ | | | | |
| Order retest | | ✅ | ✅ | | | |
| Accept a lab result as final | | ✅ | ✅ | | | |
| Release activity | | | ✅ | | | |
| Hold activity | | | ✅ | | | |
| Return activity to operator | | | ✅ | | | |
| Mark activity SKIPPED (with reason) | | | ✅ | | | |
| Raise deviation | ✅ | ✅ | ✅ | | | ✅ |
| Accept-with-deviation | | | ✅ | | | ✅ |
| Escalate deviation | | | ✅ | | | |
| Request controlled override | | | ✅ | | | |
| **Approve** controlled override | | | | | | ✅ |
| Create master batch from slot | | | | ✅ | | |
| Configure Day-0 baseline | | | | ✅ | | |
| Edit Day-0 after activation | | | | ❌ | | ❌ |
| **Activate** batch | | | | ✅ *(requires GM checkpoint 1)* | | ✅ |
| Allocate vessels/equipment/vehicles | | | | ✅ *(proposes)* | ✅ *(approves)* | |
| Resolve resource conflict | | | | | ✅ | |
| Assign personnel | | | | ✅ | ✅ | |
| Approve management checkpoint 2–4 | | | | | | ✅ |
| Return checkpoint for review | | | | | | ✅ |
| Compare batches / view intelligence | | | ✅ | ✅ | ✅ | ✅ |
| Edit route / SOP definition | | | | ✅ *(draft)* | | ✅ *(publish)* |
| Manage users & roles | | | | ✅ | | |

**[DECISION] Nothing in this matrix is enforced in the browser.** Every ✅ is an RLS policy
plus, for state transitions, an Edge Function. See ARCHITECTURE_V2.md §4.

---

## 3. Supervisor: the operational control authority

The supervisor is the pivot. Everything an operator or technician does converges here.

### 3.1 Supervisor verdicts

| Verdict | Effect | Requires |
|---|---|---|
| **RELEASE** | activity → COMPLETED; dependents re-evaluate | all exit-gate conditions satisfied, **or** an accept-with-deviation on each failing one |
| **HOLD** | activity → BLOCKED with an explicit reason; nothing downstream moves | reason text (mandatory) |
| **RETURN** | activity → RETURNED → operator's queue | reason text + what specifically to redo |
| **ACCEPT WITH DEVIATION** | one failing condition is waived for this batch | reason text; deviation stays open on the record and appears in every downstream GM package |
| **REQUEST OVERRIDE** | asks GM to waive a *protected* gate | reason text; GM must approve |

### 3.2 Protected vs waivable gates

**[DECISION]** A supervisor may accept-with-deviation on most gates. Four categories are
**protected** — only a GM-approved override can pass them:

| Protected gate | Why | Source |
|---|---|---|
| Pasteurisation not achieved (compost < 54 °C or held < 8 h) | food-safety equivalent; S1c: "improper pasteurisation" | S1c 29–40 h band |
| Ammonia not cleared at tunnel out | S1c: "volatile ammonia > 0.05 % will inhibit spawn growth… above 0.10 % toxic" | S1c |
| Tunnel fill height above SOP maximum | S3f names 2.25 m fill as a root cause of batch failure | S1a P2B / S3f |
| Any gate whose failure is `critical` severity at a management checkpoint | by definition | WORKFLOW_MODEL §7 |

### 3.3 Supervisor Control Room — what it shows

Ordered by urgency, not by batch:

1. **Time-critical gates** — anything whose trigger window opens or expires within 4 hours
   (e.g. "Bunker 5 at 71 °C, 29 h elapsed — reload trigger at 30 h").
2. **Lab failures** — results that failed spec and are blocking.
3. **Open deviations** awaiting a verdict.
4. **Awaiting supervisor** queue — submitted activities needing release.
5. **Evidence review** — submissions with photos flagged for check.
6. **Active batches board** — every live master batch with its current position.

---

## 4. Operator: one task at a time

**[DECISION]** The operator app never shows the 17-stage map as a navigation menu (the old
app's `workflow.html` did — S8b). It shows **My Work**: the tasks assigned to this person, on
this shift, for the batches they are on.

A task card carries exactly five things:

```
┌────────────────────────────────────────────┐
│  MB 391-394  ·  Line 2  ·  Bunker 3        │  ← scope, always visible
│                                            │
│  0B  1st Bunker Filling                    │  ← what
│                                            │
│  TARGET   fill height 2.6 – 2.7 m          │  ← target (SOP or Day-0)
│  LAST     2.9 m  (MB 387-390)              │  ← last batch's actual, for calibration
│                                            │
│  [  ACTUAL   ______  m  ]                  │  ← the one input
│  [ 📷 bunker ] [ 📷 probe ]                 │  ← evidence
│                                            │
│  ⚠ Stage-0B decides compost breathability  │  ← the golden rule, verbatim from S1a
│    for the next 20 days                    │
└────────────────────────────────────────────┘
```

- **[DECISION]** Show the previous batch's actual next to the target. S3f proves operators are
  already calibrating against history; the paper form hides it.
- **[DECISION]** The golden rule from S1a appears on the operator card. It is the only piece
  of the SOP written *for* the person doing the work.
- **[DECISION]** Out-of-range never blocks the submit button. It shows a warning, requires a
  remark, and raises a deviation server-side.
- **[DECISION]** Offline-first. Bunkers and tunnels have poor connectivity; submissions queue
  locally and sync with a client-generated idempotency key.

---

## 5. GM: decision packages, not tasks

**[DECISION]** At each of the 4 checkpoints, the GM receives a single generated package.
Its sections are derived directly from the questions the batch narratives in S3a–f already
answer by hand.

```
DECISION PACKAGE — MB 391,392,393,394 · Checkpoint 3: Phase-1 → Phase-2

1  PLAN                what was committed at Day-0
   route ROUTE-2026A · formulation F-391 (Paddy 53 / Bagasse 38 / Wheat 9)
   target 200 MT, 50 MT per room · 4 rooms · bunkers 2,3,4 · tunnels TBD
   planned tunnel loading 10 Apr

2  ACTUAL EXECUTION    plan vs actual, every activity
   0A ✅ on time   0B ⚠ +1 d   0C ✅   0D ✅   1A ✅ …
   P1C  fill 2.9 m vs 2.6–2.7 m target
   P1D-A peak 9 / 14 / 10 h  ·  hold 44 / 35 / 35 h   ← spread flagged
   P1D-B timings MISSING — "data not available due to communication issue"

3  QUALITY             every lab result vs spec, with trend
   tunnel-load MC 74.3 % (spec 72.5–74) ⚠   EC 1.83   pH —
   bunker N 1.52 → 1.59 → 1.68 (rising, in band)

4  EVIDENCE            18 photos, 3 flagged by supervisor

5  DEVIATIONS          2 open, 1 accepted-with-deviation
   D-11 Stage-0B held 67.1 °C vs max 58 °C  — ACCEPTED (supervisor: "sweet smell,
        no anaerobic sign") — still open on record
   D-14 Reload-1 hold-time spread 9 h across lines — OPEN

6  CORRECTIVE ACTIONS  1 recorded, 0 verified by retest

7  RESOURCE USAGE      3 bunkers × 3 stints · turner 4 passes · 2 vehicles

8  CURRENT POSITION    P1D-B complete, 44 h hold satisfied at 06:20 today

9  PROPOSED NEXT STEP  ← the actual decision
   Allocate reload-2 bunkers 8,9,10 → tunnels 3, 1, 10, 9
   Fill heights 1.95 / 1.95 / 2.25 / 2.25 m
   ⚠ 2 tunnels proposed at 2.25 m, above the 2.2 m SOP maximum
   ⚠ 3 bunkers pooling into 4 tunnels — uneven maturity risk

   [ APPROVE ]   [ APPROVE WITH CONDITIONS ]   [ RETURN FOR REVIEW ]
```

Section 9 is the point of the whole document. **[FACT]** In S3f, the 2.25 m fill height and
the 3→4 pooling were both real, both known at that moment, and both later identified as root
causes. This package is the screen that would have surfaced them while the decision was still
open.

**[DECISION]** A package is **snapshotted** when the decision is made. The GM's approval is
bound to exactly what they saw, not to whatever the data later became.

---

## 6. Manager: resource authority

**[FACT]** S7a is the resource ledger this role owns — bunker and tunnel allocation across
overlapping batches, with times.

Manager surfaces:

- **Vessel timeline** — Gantt of bunkers 1–11 and tunnels 1–12 across the next 21 days, with
  planned occupancy from active batches and proposed occupancy from batches being configured.
- **Conflict list** — every double-booking, with the two batches and the contested window.
- **Equipment load** — turner, hopper, rotovator, loaders per day. **[FACT]** S6a `May'26`
  frequently schedules `T2 + B/L` and `F1+F2 + PF-T0` on the same date for different columns;
  both need the turner.
- **Personnel roster** — assignment per batch, per shift; certification for lab and turner.
- **Capacity forecast** — from the schedule, how much compost lands in which week.

**[DECISION]** Admin *proposes* allocation during Day-0 configuration; Manager *approves* it.
On a single-manager factory this can be configured as auto-approve, but the two acts stay
distinct in the data so the audit trail is honest.

---

## 7. Admin

Admin is not a superuser. Admin's authority is **instantiation and configuration**, and it
ends at activation.

- Admin cannot invent a batch. The schedule slot is upstream (BATCH_CREATION_SPEC.md §2).
- Admin cannot edit the Day-0 baseline after activation. Post-activation change requires a
  supervisor deviation or a GM-approved override.
- Admin manages users, roles, materials, vessels, rooms, equipment and route drafts.
- **[DECISION]** Publishing a route version requires GM sign-off, because it changes what
  "the SOP says" for every future batch.

---

## 8. Enforcement model

| Layer | What it does | What it is NOT |
|---|---|---|
| **UI** | shows the right screens, disables the wrong buttons | not a boundary |
| **RLS** | row visibility and column-level write permission per role | cannot express "may this transition happen now" |
| **Edge Functions** | all state transitions: activate, submit, record result, evaluate gate, decide | the actual authority |
| **DB constraints + triggers** | append-only history, no orphan lab result, no double vessel occupancy, `blocked_reason` NOT NULL when blocked | the last line |

**[DECISION]** The following operations exist **only** as Edge Functions and are `REVOKE`d
from the anon and authenticated roles at table level:
`activate_batch`, `submit_activity`, `record_lab_result`, `supersede_lab_result`,
`supervisor_decide`, `gm_decide`, `allocate_tunnel_pooling`, `raise_deviation`,
`approve_override`.

This is the direct answer to the existing app's own admission (S8d) that its role checks are
"NOT a security boundary" and that its thresholds are "advisory only — must never block".

---

## 9. Open questions

**[TBD-9]** Does a Compost Manager exist as a distinct role from Supervisor? S2b has a field
`Compost Manager`; S3f has `Supervisor / In-charge`. S1c refers to "the compost manager" as
the person judging mixing uniformity and "the manager" as the escalation point for tunnel
temperature fluctuation. Currently modelled as two fields on `master_batch` filled by the same
person; confirm whether they need separate role authority.

**[TBD-10]** Shift model. S2b has a `Day/Night` column on Stage-0 operations, and S7a records
bunker loading times spanning 00:00–23:20. Confirm shift boundaries so task assignment and
"my work" filtering are correct.

**[TBD-11]** Is Manager a real person at this factory today, or is resource allocation done by
the Supervisor/Admin? If the role is aspirational, ship it as a permission set that Admin can
hold, rather than a mandatory extra login.
