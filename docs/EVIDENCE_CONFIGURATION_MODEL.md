# EVIDENCE CONFIGURATION MODEL

**[DICTATED §37]** *"Evidence is configured at Day 0."* ·
*"The task is not complete until the configured evidence requirement is satisfied."*

---

## 1. Evidence is a requirement, not a photo count

The walkthrough gives one activity — `NM-ROTAVATE` — with **three** evidence items, and the
third is not "a third photo" but a **specific, named thing**: the ammonium sulphate being mixed
*by hand*. That is why evidence must be modelled as **N named requirements**, each individually
satisfied, and not as `required_photos: 3`.

**[DICTATED]** *"This is an IMPORTANT example of multiple evidence requirements inside one
activity."*

---

## 2. Model

```sql
evidence_requirement            -- part of the PROCESS DEFINITION (route seed)
  id
  route_activity_id
  key                           -- 'before' | 'after' | 'as_hand_mixing' | 'bunker_id_plate'
  label                         -- 'Photo before mixing'
  media_kinds[]                 -- {photo} | {photo,video} | {video}
  min_count, max_count          -- usually 1..1
  is_required                   -- Day-0 may relax a non-gating requirement
  capture_hint                  -- 'Show the whole pile including the near edge'
  ordering                      -- before/after pairs must render in order
  gates_submission              -- true = cannot submit without it

batch_activity_evidence_req     -- the DAY-0 FROZEN copy, per batch
  id, batch_activity_id, key, label, media_kinds[], min_count,
  is_required, capture_hint, ordering, gates_submission
  -- frozen at activation, exactly like the six-column SOP values

evidence                        -- the actual captured item
  id
  batch_activity_evidence_req_id     -- WHICH requirement this satisfies
  batch_activity_id
  master_batch_id
  storage_path
  media_kind                    -- photo | video
  captured_at                   -- SERVER timestamp
  captured_by
  device_hint, exif_json        -- retained, never trusted as the record of when
  width, height, bytes
  superseded_by_id              -- a retake keeps the original
```

**Every evidence row points at the requirement it satisfies.** That is what makes
"1 / 2 uploaded" computable and what makes a submission gate real rather than advisory.

---

## 3. The requirement catalogue for `PROCESS-2026B`

Seed data. Derived directly from the walkthrough — nothing added, nothing assumed.

| Activity | Key | Label | Media | Req |
|---|---|---|---|---|
| `BG-WEIGH` (per load) | `load` | Load photo | photo | Day-0 configured |
| `BG-HOP-1` | `before` / `after` | Before pass / After pass | photo | ✅ |
| `BG-HOP-2` | `before` / `after` | Before pass / After pass | photo | ✅ |
| `BG-BUNK-LOAD` | `before` / `after` | Before loading / After loading | photo | ✅ |
| `BG-UNLOAD` | `before` / `after` | Before unloading / After unloading | photo | ✅ |
| `BG-HOP-3` | `before` / `after` | Before pass / After pass | **photo or video** | ✅ |
| `BG-BUNK-RELOAD` | `before` / `after` | Before reload / After reload | photo | ✅ |
| `PD-BALE-CUT` | `before` / `after` | Before bale cutting / After bale cutting | photo | ✅ |
| `PD-SOAK-1/2/3` | `before` / `after` | Before soaking / After soaking | photo | ✅ |
| `PD-BUNK-STORE` | `before` / `after` | Before loading / After loading | photo | ✅ |
| **`NM-ROTAVATE`** | `before` | Before mixing | photo | ✅ |
| | `after` | After mixing | photo | ✅ |
| | **`as_hand_mixing`** | **Ammonium sulphate hand mixing** | photo | ✅ |
| `BG-YARD-UNLOAD` | `before` / `after` | Before unloading / After unloading | photo | ✅ |
| `YD-NMIX-ADD` | `before` / `after` | Before mixing / After mixing | photo | ✅ |
| `YD-FLIP-1/2/3/4` | `before` / `after` | Before flip / After flip | photo | ✅ |
| `YD-HOP-COMBINE` | `before` / `after` | Before pass / After pass | photo | ✅ |
| `PD-YARD-LOAD` | `before` / `after` | Before loading / After loading | photo | ✅ |
| `TR-T0` | `before` / `after` | Before turner pass / After turner pass | photo | ✅ |
| `TR-T1` (per pile) | `before` / `after` | Before T1 / After T1 | photo | ✅ |
| `TR-T2` (per pile) | `before` / `after` | Before T2 / After T2 | photo | ✅ |
| `P1-BUNK-LOAD` (per bunker) | `before` / `after` | Before loading / After loading | photo | ✅ |
| `P1-BUNK-RELOAD` (per bunker) | `before` / `after` | Before reload / After reload | photo | ✅ |
| `TN-LOAD` (per tunnel) | `before` / `after` | Before loading / After loading | photo | ✅ |
| `TN-UNLOAD` (per tunnel) | `before` / `after` | Before unloading / After unloading | photo | ✅ |

**Only two activities depart from the before/after pair:** `NM-ROTAVATE` (three items) and
`BG-HOP-3` (video permitted). Both are dictated. Both are the reason the model is
requirement-based.

**[TBD-34]** `BG-WEIGH` evidence per load is not specified in the walkthrough — one photo per
load × 11 loads is a lot of capture on a phone. Day-0 configurable; default proposed as
**one photo per load, weighbridge slip or loaded vehicle**. Confirm.

---

## 4. Operator experience

**[DICTATED §37]** The operator must always know what is required and how much is done.

```
┌──────────────────────────────────────────────┐
│  NM-ROTAVATE · Manure + Mineral Mix          │
│                                              │
│  EVIDENCE REQUIRED          2 / 3 uploaded   │
│  ────────────────────────────────────────    │
│  ✓  Before mixing                    [ view ]│
│  ✓  After mixing                     [ view ]│
│  ○  Ammonium sulphate hand mixing  [ 📷 ]    │
│     Show the AS being spread by hand         │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  SUBMIT · 1 evidence item outstanding  │  │  ← disabled
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

Once complete:

```
  EVIDENCE REQUIRED          3 / 3 uploaded ✓
  [           SUBMIT ACTIVITY              ]
```

Rules:
- Each requirement is its **own capture slot** with its own label and hint — never a generic
  "add photos" tray.
- Before/after render **in order**, so the pair reads as a pair.
- Retaking does not delete: the original is kept with `superseded_by_id`.
- Capture works offline; blobs queue in IndexedDB and upload on reconnect, and the activity
  cannot leave `SUBMITTED` until every blob has actually landed in Storage.

---

## 5. Enforcement

**Server-side, in `submit_activity`:**

```
FOR each batch_activity_evidence_req WHERE is_required AND gates_submission:
    count non-superseded evidence rows pointing at it
    IF count < min_count → REJECT submission
```

The client disables the button as a courtesy. The Edge Function is the authority — consistent
with `ARCHITECTURE_V2.md §3`.

**What evidence never does:** it never blocks *recording a value*. An operator with a dead
camera can record the moisture reading; the activity simply cannot be submitted until the
evidence lands. If evidence genuinely cannot be captured, the supervisor may waive that
requirement with a mandatory reason, which raises a deviation and stays on the record.

---

## 6. Day-0 configuration surface

Part of the Operator Plan (`BATCH_CREATION_SPEC.md`). Per activity:

```
NM-ROTAVATE · Manure + Mineral Mix                    duration 6 h

  EVIDENCE                        MEDIA        REQUIRED   GATES SUBMIT
  Before mixing                   photo          ☑           ☑
  After mixing                    photo          ☑           ☑
  Ammonium sulphate hand mixing   photo          ☑           ☑
  + add requirement
```

Admin may **add** a requirement, **relax** a non-gating one, or change permitted media.
Admin may **not** remove a requirement the process definition marks `gates_submission` —
that is a route change, and route changes are governed (`ROLE_AND_APPROVAL_MODEL.md §7`).

---

## 7. Storage

Per `ARCHITECTURE_V2.md §7`: private bucket, signed URLs with short TTL, client downscale to
≤1600 px / JPEG q80, server-side capture timestamp and user.

**Volume for `PROCESS-2026B`, one master batch:**

| | |
|---|---|
| Activity instances requiring evidence | ~60 |
| Evidence items | ~120 photos + 11 load photos ≈ **131** |
| At ~400 kB each | **~52 MB per batch** |
| At one batch every 2.5 days | **~7.6 GB / year** |

Roughly double the old estimate, because the new decomposition is finer. Still small; storage
remains the only cost line worth tracking.

**[TBD-35]** Video on `BG-HOP-3` changes this materially — a 60-second clip is ~15–30 MB
against 0.4 MB for a photo. Confirm whether video is genuinely wanted there, and if so cap
duration and resolution at capture.
