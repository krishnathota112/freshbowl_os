# Lab Technician Batch Process & UI Requirements

## 1. Purpose

This document captures the complete lab technician workflow described
for the composting/raw-material process, including:

-   Day-wise activities
-   Parameters to be tested at each activity
-   Photo evidence requirements
-   Observational checks
-   Conditional actions such as adding water
-   Batch approval workflow
-   Parallel processing of multiple batches
-   Proposed lab technician UI structure

The process is **batch-centric**: each master batch can be at a
different day/stage, and the lab technician works on whichever batch
currently requires action.

------------------------------------------------------------------------

## 2. Core Workflow

The lab technician logs in with their credentials and sees a dashboard
containing all **master batches**.

Each master batch has its own progress. For example:

-   Master Batch 1 → Day 4
-   Master Batch 2 → Day 8
-   Master Batch 3 → Day 12
-   Master Batch 4 → Day 1

The technician opens a batch and sees the activities and parameters
required for that batch's current stage.

For each required activity:

1.  Perform the test/observation.
2.  Enter the test values into the appropriate input fields.
3.  Upload photo(s) as evidence/proof of the test.
4.  Submit the activity/stage for approval.
5.  The submission goes to the **GM (General Manager)** for
    approval/rejection.
6.  The lab technician **does not wait for the GM's approval**.
7.  The technician can immediately move to another batch and continue
    working.

Therefore, **multiple batches progress concurrently and independently**.

A batch should advance through its process according to the approval
workflow, while the technician remains free to work on other batches.

------------------------------------------------------------------------

# 3. Day-wise Process

## Day 0 --- Bagasse Weighment / Raw Material Weighment

The weighment activity is on **Day 0**, not Day 1.

During weighment, the lab technician checks:

-   Moisture
-   pH
-   Dry weight

These measurements apply to the raw materials being weighed.

### Evidence

For the activity, the technician should:

-   Enter the measured values.
-   Upload photo evidence/proof.
-   Submit the activity for GM approval.

------------------------------------------------------------------------

## Day 1 --- Bagasse Wetting, Hopper Checks & Bunker Loading

### 1. Bagasse Wetting

During bagasse wetting, check:

-   Moisture
-   pH
-   EC

### 2. Hopper 1

Check:

-   Moisture
-   pH
-   EC

### 3. Hopper 2

Check:

-   Moisture
-   pH
-   EC

### 4. Before Bunker Loading

Before bunker loading, check:

-   Moisture
-   pH
-   EC

The bagasse wetting, Hopper 1, Hopper 2, and bunker-loading checks
described above are **Day 1 activities**.

### Evidence

For each required test/activity:

-   Enter the test values.
-   Upload photo evidence.
-   Submit for GM approval.

------------------------------------------------------------------------

# 4. Day 4 --- Unloading, Hopper Pass, Reloading & Paddy Weighment

## 4.1 Unloading

During unloading, the technician takes a sample and checks:

-   Moisture
-   pH
-   EC

## 4.2 Before Hopper Pass

Before hopper pass, check:

-   Moisture
-   pH
-   EC

## 4.3 Reloading

During reloading, check the relevant parameters including:

-   Moisture
-   pH
-   EC

## 4.4 Paddy Weighment

Before weighing the paddy:

-   Check moisture.
-   Determine/check dry weight.

### Evidence

The technician records the values and uploads photo evidence for the
relevant activity before submitting it for approval.

------------------------------------------------------------------------

# 5. Day 5 --- Paddy Soaking 1

The paddy is soaked in the soak pit.

The water in the soak pit must be tested.

Parameters:

-   pH
-   EC
-   TDS

**TDS = Total Dissolved Solids.**

The technician records the values and uploads photo evidence.

------------------------------------------------------------------------

# 6. Day 6 --- Paddy Soaking 2

During the second soaking of the paddy, check:

-   pH
-   EC
-   TDS

The same three parameters from Day 5 are repeated.

------------------------------------------------------------------------

# 7. Day 7 --- Paddy Soaking 3

During the third soaking of the paddy, again check:

-   pH
-   EC
-   TDS

The same three parameters are repeated on Day 7.

------------------------------------------------------------------------

# 8. Chicken Manure --- Nitrogen & Ash Monitoring

This happens in parallel with the paddy-soaking activities.

When the chicken manure/raw material arrives, it has an initial:

-   Nitrogen percentage
-   Ash percentage

The chicken manure is then stored/rested in the bunker.

Because the chicken manure remains in the bunker for a period of time,
its composition may change.

When the chicken manure is later unloaded from the bunker for mixing
with the bagasse and paddy, the technician must test it again for:

-   Nitrogen
-   Ash

The purpose is to verify the current nitrogen and ash content after the
resting/storage period.

------------------------------------------------------------------------

# 9. Day 8 --- Flipping, Turnings & Bunker Loading

## 9.1 Flipping

On Day 8, the mixture is flipped.

After the second flipping, check:

-   Moisture
-   pH

## 9.2 Turnings

There are three turning stages:

-   T0
-   T1
-   T2

After every turning, moisture is checked/recorded.

The records may be maintained as:

-   Moisture after T0
-   Moisture after T1
-   Moisture after T2

An average moisture value may also be calculated/recorded when required
for future reference.

------------------------------------------------------------------------

## 9.3 Bunker Loading

On the same Day 8, the material is loaded into the bunker.

Before loading, first check:

-   Bunker height

Then check:

-   pH
-   EC
-   Moisture
-   Nitrogen
-   Ash
-   C:N ratio

The bunker-loading activity may continue until **Day 9**.

After this, the material is given a rest period.

------------------------------------------------------------------------

# 10. Storage/Handling Observations

There are common observational checks that should be available whenever
the compost/material is being stored in or handled around a bunker or
tunnel, including relevant loading/unloading stages.

These include:

## 10.1 Smell Test

Record the observed smell/odour condition.

## 10.2 Colour

Record the observed colour of the material.

## 10.3 Spring / Squeeze Test

The technician takes a sample/handful of the material and squeezes it.

The purpose is to observe how much water/moisture is present, for
example:

-   Too dry
-   Acceptable/normal
-   Too wet
-   Excessively wet/dripping

This is a physical/observational check and should be represented
separately from the numerical moisture value.

------------------------------------------------------------------------

# 11. Day 12 --- Bunker Unloading & Reloading

The material is handled again on Day 12.

## 11.1 Unloading From Bunker

Before reloading, the material is unloaded from the bunker.

During unloading, check:

-   Shrunken/shrinked height
-   Moisture

The shrunken height helps determine the appropriate reloading height.

## 11.2 Moisture-Based Decision

After checking moisture:

### If moisture meets the required threshold

Reload the material into the new bunker.

### If moisture is below the required threshold

Add water using a hopper while reloading/handling the material.

After adding water, check again:

-   pH
-   EC
-   Moisture

Then reload the material into the bunker.

## 11.3 Reloading Parameters

During reloading, check:

-   pH
-   EC
-   Moisture
-   Nitrogen
-   Ash
-   C:N ratio

Relevant storage/handling observations such as smell, colour, and
squeeze/spring test should also be captured where applicable.

------------------------------------------------------------------------

# 12. Day 15 --- Tunnel Loading

On Day 15, the material is unloaded from the bunker and loaded into a
tunnel.

## 12.1 Before Tunnel Loading

First check:

-   Tunnel height

## 12.2 During Tunnel Loading

Check:

-   pH
-   EC
-   Moisture
-   Nitrogen
-   Ash
-   C:N ratio

The relevant observational checks should also be available where
applicable:

-   Smell
-   Colour
-   Spring/squeeze test

The tunnel-loading activity may continue for several days.

------------------------------------------------------------------------

# 13. Day 22 --- Tunnel Unloading

During tunnel unloading on Day 22, check:

-   pH
-   EC
-   Moisture
-   Nitrogen
-   Ash
-   C:N ratio
-   Shrunken/shrinked height

## Actinomycetes Observation

The lab technician also records an observation for **actinomycetes**.

This is treated as an observation rather than a standard numerical
parameter.

The technician may observe/report whether actinomycetes are:

-   Visible or not visible
-   Weak/low in appearance
-   More clearly/strongly present

The exact UI representation can be finalized based on the lab's
preferred terminology.

Relevant physical observations can also include:

-   Smell
-   Colour
-   Spring/squeeze test

------------------------------------------------------------------------

# 14. Evidence Requirement

For each test/activity, the lab technician should provide **photo
evidence/proof**.

The general pattern is:

> Activity → Test/Observation → Enter Values → Upload Photo Evidence →
> Submit for Approval

The photo is intended to allow the GM to verify the test/activity before
approving or rejecting the submission.

The UI should therefore make photo upload a clear part of the activity
rather than treating it as an optional afterthought, wherever evidence
is required.

------------------------------------------------------------------------

# 15. GM Approval Workflow

The GM means **General Manager**.

The lab technician submits each completed activity/stage for GM
approval.

The GM can:

-   Approve
-   Reject

The lab technician does **not** need to wait for the GM's response
before working on another batch.

This is important because several master batches may be progressing
simultaneously.

------------------------------------------------------------------------

# 16. Concurrent Batch Processing

Each master batch can be at a different stage.

Example:

  -----------------------------------------------------------------------
  Master Batch            Current Progress        Technician Action
  ----------------------- ----------------------- -----------------------
  Master Batch 1          Day 4                   Enter Day 4 test
                                                  results + photos and
                                                  submit

  Master Batch 2          Day 8                   Enter Day 8 test
                                                  results + photos and
                                                  submit

  Master Batch 3          Day 12                  Perform reloading
                                                  checks

  Master Batch 4          Day 1                   Perform bagasse wetting
                                                  / hopper /
                                                  bunker-loading checks
  -----------------------------------------------------------------------

The technician should be able to:

1.  Open Master Batch 1.
2.  Complete its current activity.
3.  Upload evidence.
4.  Submit for GM approval.
5.  Leave Master Batch 1.
6.  Immediately open Master Batch 2.
7.  Work on Master Batch 2's current activity.

The batches therefore move **in parallel**, rather than the technician
completing one entire batch before starting another.

------------------------------------------------------------------------

# 17. Proposed Lab Technician UI Structure

## 17.1 Login

The technician logs in with their credentials.

After login, take them directly to the lab technician dashboard.

------------------------------------------------------------------------

## 17.2 Master Batch Dashboard

The main screen should show all master batches.

Each batch card/list item should clearly show:

-   Master batch name/ID
-   Current day
-   Current activity/stage
-   Progress
-   Status
-   Whether action is required
-   Whether the previous submission is pending approval, approved, or
    rejected

Example:

``` text
Master Batch 1
Day 4 — Unloading
Action Required
[Open Batch]

Master Batch 2
Day 8 — Turning / Bunker Loading
Action Required
[Open Batch]

Master Batch 3
Day 12 — Reloading
Action Required
[Open Batch]

Master Batch 4
Day 1 — Bagasse Wetting
Submitted for Approval
```

------------------------------------------------------------------------

## 17.3 Batch Detail Screen

When the technician opens a batch, show:

### Batch Header

-   Master Batch ID/name
-   Current day
-   Current activity
-   Overall progress timeline

Example:

``` text
Day 0 → Day 1 → Day 4 → Day 5 → Day 6 → Day 7
                    ↑
              Current Stage
```

The technician should immediately understand:

> "This is the batch, this is where it currently is, and this is what I
> need to do now."

------------------------------------------------------------------------

## 17.4 Current Activity Section

Only show the parameters required for the batch's current activity.

For example, if the batch is at Day 4 unloading:

``` text
Day 4 — Unloading

Moisture       [ input ]
pH             [ input ]
EC             [ input ]

Photo Evidence
[ Upload Photo ]

[ Submit for Approval ]
```

If the activity requires additional parameters, display those fields
dynamically.

This avoids showing the technician every parameter from every day at
once.

------------------------------------------------------------------------

# 18. Parameter Input Types

The UI should distinguish between different types of information.

## Numerical Measurements

Examples:

-   Moisture
-   pH
-   EC
-   TDS
-   Dry weight
-   Nitrogen
-   Ash
-   C:N ratio
-   Bunker height
-   Tunnel height
-   Shrunken height

These should use appropriate numerical input fields and, where known,
display the relevant unit.

## Observational Fields

Examples:

-   Smell
-   Colour
-   Spring/squeeze test
-   Actinomycetes

These should use suitable selection/input controls rather than forcing
everything into numerical fields.

For example, the squeeze test could provide choices such as:

-   Too dry
-   Normal
-   Too wet
-   Dripping

Actinomycetes could use an observation control that captures
visibility/strength according to the lab's terminology.

------------------------------------------------------------------------

# 19. Photo Evidence Section

Each activity should have a clearly visible photo-evidence section.

Example:

``` text
Photo Evidence

[ + Upload Photo ]

Uploaded:
✓ IMG_001
✓ IMG_002
```

The technician should be able to review the uploaded evidence before
submission.

------------------------------------------------------------------------

# 20. Submission State

After submission, the batch/activity should clearly show:

**Submitted for GM Approval**

The technician should then be able to return to the dashboard and work
on another batch.

The UI should not block the technician simply because another batch is
awaiting approval.

------------------------------------------------------------------------

# 21. Rejection / Resubmission

If the GM rejects a submission, the relevant batch/activity should
return to the technician's attention.

The technician should be able to see that the activity requires
correction/resubmission and then update the required values/evidence.

The exact rejection-comment UI can be finalized later.

------------------------------------------------------------------------

# 22. Key UI Principle

The main design principle is:

> **Show the technician what needs to be done for the selected batch at
> its current stage, not the entire process at once.**

The dashboard provides the overall view of all batches, while the batch
detail page provides the focused view of the current activity.

This keeps the workflow simple even when many batches are moving through
different days simultaneously.

------------------------------------------------------------------------

# 23. Complete Process Summary

  -----------------------------------------------------------------------
  Day                     Activity                Key Parameters / Checks
  ----------------------- ----------------------- -----------------------
  **Day 0**               Bagasse/raw material    Moisture, pH, Dry
                          weighment               Weight

  **Day 1**               Bagasse wetting         Moisture, pH, EC

  **Day 1**               Hopper 1                Moisture, pH, EC

  **Day 1**               Hopper 2                Moisture, pH, EC

  **Day 1**               Before bunker loading   Moisture, pH, EC

  **Day 4**               Unloading               Moisture, pH, EC

  **Day 4**               Before hopper pass      Moisture, pH, EC

  **Day 4**               Reloading               Moisture, pH, EC and
                                                  applicable checks

  **Day 4 / relevant      Paddy weighment         Moisture, Dry Weight
  stage**                                         

  **Day 5**               Paddy soaking 1         pH, EC, TDS

  **Day 6**               Paddy soaking 2         pH, EC, TDS

  **Day 7**               Paddy soaking 3         pH, EC, TDS

  **Parallel**            Chicken manure          Nitrogen, Ash
                          monitoring              

  **Day 8**               Flipping                Moisture, pH

  **Day 8**               T0/T1/T2 turnings       Moisture after each
                                                  turning; optional
                                                  average

  **Day 8--9**            Bunker loading          Bunker Height, pH, EC,
                                                  Moisture, Nitrogen,
                                                  Ash, C:N

  **Day 12**              Bunker                  Shrunken Height,
                          unloading/reloading     Moisture; pH, EC,
                                                  Moisture after water
                                                  addition where
                                                  required; Nitrogen,
                                                  Ash, C:N

  **Day 15**              Tunnel loading          Tunnel Height, pH, EC,
                                                  Moisture, Nitrogen,
                                                  Ash, C:N

  **Day 22**              Tunnel unloading        Shrunken Height, pH,
                                                  EC, Moisture, Nitrogen,
                                                  Ash, C:N, Actinomycetes
                                                  observation
  -----------------------------------------------------------------------

### Common physical/observational checks

Where applicable during storage/handling:

-   Smell test
-   Colour
-   Spring/squeeze test
-   Actinomycetes observation at the relevant tunnel-unloading stage

### Evidence

For every applicable activity:

-   Test values
-   Observations
-   Photo evidence
-   Submission for GM approval

### Workflow

-   Multiple master batches can be active simultaneously.
-   Each batch has independent progress.
-   The technician submits one batch and can immediately move to
    another.
-   The GM approval process does not block the technician's work on
    other batches.
