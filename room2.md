This latest Kiro/Claude check is actually useful because it tells us **exactly where we should stop arguing with the existing implementation and where we need to make product decisions**.

For the five-hour build, I would not let these three unresolved items derail Day 0–6. But I also would not silently encode them.

Here is the clean decision set I recommend:

### 1. Straw bunker rest: do not assume 12h yet

Kiro is right. The existing definition has that duration unresolved. So keep:

```text
STRAW BUNKER REST
Duration: ADMIN CONFIGURATION REQUIRED
Default: none
```

The UI can show:

```text
REST DURATION
[ ___ hours ]

Required before activation
```

That is much better than pretending 12h is authoritative.

### 2. Pre-H0 material testing: separate it conceptually, but don't block the five-hour build on a new subsystem

The source evidence is genuinely contradictory here: one source puts raw-material moisture/pH/dry weight at Day 0, while your operational description says the material is tested before the batch clock begins. The repository also isn't modeled for a true pre-batch lot assay yet.  

For the demo/build:

```text
PRE-BATCH MATERIAL CHECK
        ↓
attach result to planned Master Batch
        ↓
H0 begins
        ↓
weighment
```

But **do not add a new `material_lot` architecture in the middle of the five-hour sprint** unless the current code truly cannot represent the required flow. Mark it as a later schema refinement.

In other words: represent the business state cleanly; don't let a schema debate consume your entire build.

### 3. Day-1 lab checks: for the actual product, I would use the factory workflow you just confirmed

You have now told me directly that Day 1 needs:

```text
Bagasse wetting
    ↓
Lab

Hopper 1
    ↓
Lab

Hopper 2
    ↓
Lab

Before bunker loading
    ↓
Lab
```

The lab document supports exactly that four-check structure. 

So **for the product we are building**, I would implement those four checkpoints rather than preserve the older single-check demo behavior.

But the system should keep the checkpoint-map/version concept because the repository already recognizes that source maps conflict. We're not pretending the historical conflict never existed; we're selecting the **current factory workflow for the build**.

---

# So I would send Kiro this now

```text
Proceed with Day 0–6 implementation using the following product decisions.

1. STRAW BUNKER REST
   Keep duration configurable.
   No default.
   Admin must enter/confirm it before activation.
   Do not seed 12h as fact.

2. PRE-H0 MATERIAL CHECK
   Treat incoming material testing as a pre-batch prerequisite for the
   current product flow.
   Do not redesign the database around material_lot during this sprint.
   Represent the result against the pending Master Batch in the current
   implementation where possible.
   Keep the source conflict documented internally.
   Do not move the check into the H0 clock.

3. DAY-1 LAB CHECKPOINTS
   For the current factory workflow, implement four separate checkpoints:
   - Bagasse wetting
   - Hopper 1
   - Hopper 2
   - Before bunker loading

   Each checkpoint must be independently recorded and timestamped.

4. DAY-1 HOPPER 2
   Do not hard-code the moisture threshold.
   Show the lab result and the configured Water/Dry decision.
   Preserve the existing no-invented-threshold rule.

5. DAY-4
   Keep these as distinct activities:
   - Bunker unloading
   - Paddy inspection
   - Paddy weighment
   - Hopper pass
   - Reload

6. DAY-5
   Keep:
   - Paddy Soak 1
   - pH
   - EC
   - TDS
   - bunker storage/rest

7. TIME
   Everything uses H0–H552.
   Day labels are navigation only.
   Activities may cross the 24h visual boundary.
   Actual duration = server finish - server start.

8. EVIDENCE
   Before/after evidence is tied to the activity.
   Unloading supports video where required.
   Never fabricate evidence.

9. MOBILE + WEB
   Same backend.
   Same process data.
   Same activity state.
   Same timestamps.
   Same evidence.
   Same management truth.

Do not modify the architecture beyond what is required to make these
Day 0–6 workflows work end-to-end.

After implementation, test:

PRE-BATCH → H0
→ WEIGHMENT
→ DAY 1 WETTING
→ HOPPER 1
→ LAB
→ HOPPER 2
→ LAB
→ BUNKER
→ REST
→ DAY 4 UNLOAD
→ PADDY INSPECTION
→ PADDY WEIGHMENT
→ HOPPER
→ RELOAD
→ DAY 5 SOAK 1
→ LAB
→ BUNKER REST
→ DAY 6 SOAK 2

from:

ADMIN WEB
OPERATOR MOBILE
LAB MOBILE
MANAGEMENT WEB
MANAGEMENT MOBILE
```

And one correction to the earlier plan: **Day 6 should end with Soak 2, but Day 7 must be the next implementation slice because that is where the system first exercises the really difficult mechanisms: multiple parallel streams, pile-scoped turning, scope instance creation, and the dense process day.** Kiro itself noted that Day 7 is the densest part of the definition. 

So the build sequence should now be:

```text
SLICE 1
H0 → H168
Day 0–6
        ↓
SLICE 2
H168 → H240
Day 7–9
        ↓
SLICE 3
H240 → H552
Day 10–23
        ↓
FINAL
Web + Mobile + Management + Export
```

That is much more manageable than trying to swallow all 23 days at once.
