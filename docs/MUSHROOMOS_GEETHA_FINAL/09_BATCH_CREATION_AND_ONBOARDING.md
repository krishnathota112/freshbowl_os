# 09 — BATCH CREATION AND RUNNING-BATCH ONBOARDING

## Purpose

Define exactly what Admin must enter at the beginning and how an already-running physical batch is introduced without fake history.

## What the application must do

New Batch Creation captures true starting/configuration information:
batch identity, selected process/version, material-role bindings, paddy variant, H0, Day-0 starting information, required configurable rest/hold values, required resource/person/machine assignments, and required incoming-material acceptance where the active contract demands it.

Future process readings belong to the activity that physically takes them. Do not ask Admin to enter future readings during batch creation.

For an existing-running batch, Admin records H0 if known and the current position of each active stream, marking prior physical work as BEFORE TRACKING rather than fabricating historical actuals.

The selected process/version must reach plan generation. Active batches must keep their frozen baseline.

## Acceptance / proof

DEMO/TEST proves:
- selected process/version is used in plan generation;
- Local vs Punjab changes the generated plan correctly;
- no fabricated history occurs during onboarding;
- current positions become the tracking entry points;
- future activities remain governed by the selected process and dependency graph.

## Detailed source context

The following sections from the consolidated Geetha source are included below. They are implementation context, not permission to invent a different product.


# 10. BATCH CREATION — WHAT ADMIN ENTERS


Batch Creation is for **true starting/configuration information**.

Do not put every future process reading into the Batch Creation form.

Admin should supply, as required by the active process/configuration:

- batch code/identity
- label if used
- selected process/version
- selected materials/material-role bindings
- paddy selection (Standard/Punjab vs Local)
- H0/start date/time
- true Day-0 starting information
- every Day-0 rest/hold duration when the SOP does not define a fixed value
- planned resource/vessel allocations where required
- people assignments for non-passive work where the product requires pre-assignment
- Turner machine allocations where required
- required incoming-material Lab acceptance before activation where the active batch contract requires it
- Supervisor/weather/operational note where configured

### Material selection

The Admin chooses the actual material.

Example:

```text
STRUCTURAL_STRAW = PADDY_LOCAL
```

The generated plan must automatically follow the Local Paddy rule.

The Admin should not be asked to separately choose “2 soaks.”

Likewise:

```text
STRUCTURAL_STRAW = PADDY_PUNJAB
```

must generate the Standard/Punjab path, including Soak 3.

### Vessel selection

Where bunker/tunnel work requires a physical resource, the relevant resource/vessel should be
selected at the appropriate setup/process point according to the active model.

Do not allocate a vessel that is occupied or not READY.

---


# 11. PROCESS-TIME INPUTS BELONG TO THE ACTIVITY


This is a critical product rule.

Do not ask Admin at batch creation for measurements that are physically taken later.

The correct model is:

```text
BATCH CREATION
→ starting/configuration data

ACTIVITY BECOMES ELIGIBLE
→ Supervisor/Operations opens the activity
→ activity-specific reading/input form appears
→ work + evidence
→ Finish
→ data persists + audit
```

The process/activity definition should specify the fields.

The UI renders those definitions dynamically.

## Weighment examples

Where the factory/process definition requires numerical measurement, the activity should contain
its configured fields such as:

```text
Fresh / incoming quantity [configured unit]
Dry weight              [configured unit]
Other configured weight/readings
```

Do not invent units or field names when the source has not confirmed them.

Known Lab specification examples include:

- Raw material / bagasse: Moisture %, pH, Dry weight (kg)
- Paddy weighment: Moisture %, Dry weight (kg)
- Chicken manure arrival/use: Moisture %, pH, Nitrogen %, Ash %
- Bunker loading: Bunker height, pH, EC, moisture, nitrogen, ash, C:N ratio, observations
- Tunnel loading: pH, EC, moisture, nitrogen, ash, C:N ratio, observations
- Final QC: pH, EC, moisture, nitrogen, ash, C:N ratio, shrunken height, actinomycetes, observations

The current implementation must be audited to determine which execution-side fields exist and which
are still missing.

Do not pretend a photo proves a weight was recorded.

Do not put a measurement only in a note field when the process requires a structured value.

---


# 22. EXISTING RUNNING BATCH ONBOARDING


An already-running physical batch is different from a new H0 batch.

Example:

```text
Physical batch is already at Turner P4 T2
```

Admin records current position.

MushroomOS should represent:

```text
Before current physical position
→ BEFORE TRACKING

Current position
→ live tracking

Future work
→ normal generated/planned tracking
```

Never fabricate old:

- timestamps
- performers
- photos
- readings
- completions

The onboarding engine must respect parallel streams.

If P4 is already at T2, P1–P6's earlier passes within the same physical tracking scope must not
remain nonsensically open simply because only P4 was selected.

The 0106 regression scenario is a required test.

---


# 23. PLAN GENERATION AND VERSION ISOLATION


The process/version relationship must be:

```text
Published process version
        ↓
Admin selects version (or current default)
        ↓
Batch created
        ↓
Plan generated
        ↓
Baseline frozen on activation
        ↓
Actuals recorded against that baseline
```

Published version is immutable.

Activated batch baseline is immutable.

Future SOP changes:

```text
new draft
→ edit/process review
→ validate
→ publish as new version
→ future batches use new version
→ existing active batches remain on old version
```

Never solve SOP change by editing a published version underneath live batches.

---

