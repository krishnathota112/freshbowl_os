# ADMIN CONFIGURABILITY MODEL

**[DICTATED 20 Aug 2026]** *"we need give much more free option selection for admin cause they
have different things they can do, like instead of bagasse they may use mustard."*

This document defines how far Admin's freedom extends, and — equally important — where it
stops. It is the reason `PROCESS-2026B` cannot name a material anywhere in its definition.

---

## 1. The problem with `BG-WEIGH`

`PROCESS_V2_FACTORY_CONFIRMED.md §17` names its activities `BG-WEIGH`, `BG-HOP-1`,
`BG-BUNK-LOAD` — *bagasse*. That was correct as a transcription of the walkthrough and is
wrong as a schema.

The historical record already proves materials vary batch to batch:

| Master batch | Fibre composition | Source |
|---|---|---|
| 366–368 | Bagasse 47 · Paddy 53 | S3a |
| 372–374 | Bagasse 36 · Paddy 53 · Wheat 11 | S3b |
| 391–394 | Bagasse 38 · Paddy 53 · Wheat 9 | S3f |
| 267–269 | Bagasse new 30 · Bagasse old 10 · Paddy 47.5 · Mustard 12.5 | S5a |
| 303–305 | Bagasse new **0** · Bagasse old 41 · Paddy 46 · Mustard 13 | S5a |

Batch 303–305 used **no new bagasse at all**. The schedule sheet carries `Wheat wetting`,
`Mustard wetting + B/L`, and `BAG + MUSTARD (H1&H2)-R/L` as first-class activity tokens.

**Conclusion: the streams are process-shaped, not material-shaped.** A material flows through
the "conditioned fibre" stream because of *how it behaves*, not because it is bagasse.

---

## 2. Material roles

**[DECISION]** The process definition binds to **roles**. Day-0 binds materials to roles.

| Role | Behaviour that defines it | Materials that can fill it |
|---|---|---|
| `PRIMARY_FIBRE` | bulky, low-N, wetted at the hopper, conditioned in a bunker | Bagasse (new/old) |
| `SECONDARY_FIBRE` | waxy, slow to absorb, wetted separately then bunker-loaded | Wheat straw, Mustard straw |
| `STRUCTURAL_STRAW` | absorbs on contact, soaked not hopper-wetted, gives structure | Paddy straw (local / Punjab) |
| `NITROGEN_SOURCE` | dry-mixed, never wetted alone | Chicken manure |
| `MINERAL` | dry-mixed with the nitrogen source | Gypsum, Ammonium Sulphate, Lime, Urea |
| `PH_CORRECTOR` | applied to a specific material, conditionally | Lime |

**[FACT]** The role split is not invented — it is stated in S1c: *"Paddy straw does not possess
more wax coating like wheat/mustard straw, it absorbs water as soon as it comes in contact with
water. Therefore, the period of prewet is calculated by number of hours rather than number of
days."* That single sentence is why paddy soaks and wheat/mustard wet, and why they cannot
share a stream.

### 2.1 Roles are many-to-many with materials

A role can be filled by **several** materials at once — batch 267–269 puts new bagasse *and*
old bagasse *and* mustard into fibre roles simultaneously. So:

```sql
batch_material_role
  master_batch_id
  role                       -- PRIMARY_FIBRE | SECONDARY_FIBRE | ...
  material_id
  pct_of_role                -- e.g. new bagasse 75 %, old bagasse 25 %
  dry_mt, fresh_mt
  is_role_lead               -- the material whose name labels the stream
```

`is_role_lead` drives the display name. If bagasse leads `PRIMARY_FIBRE`, the operator sees
**"Bagasse Weighment"**. If mustard leads it, they see **"Mustard Weighment"**. Same activity,
same code, same gates.

---

## 3. Role-based activity codes

**[DECISION]** The seed uses role codes. Labels are templates resolved at Day-0.

| §17 code | Role-based code | `label_template` | Renders as (demo) |
|---|---|---|---|
| `BG-WEIGH` | `FIB1-WEIGH` | `{role_lead} Weighment` | Bagasse Weighment |
| `BG-HOP-1` | `FIB1-HOP-1` | `{role_lead} Hopper Pass 1` | Bagasse Hopper Pass 1 |
| `BG-HOP-2` | `FIB1-HOP-2` | `{role_lead} Hopper Pass 2` | Bagasse Hopper Pass 2 |
| `BG-BUNK-LOAD` | `FIB1-BUNK-LOAD` | `{role_lead} Bunker Loading` | Bagasse Bunker Loading |
| `BG-REST-1` | `FIB1-REST-1` | `{role_lead} Rest` | Bagasse Rest |
| `BG-UNLOAD` | `FIB1-UNLOAD` | `{role_lead} Unload` | Bagasse Unload |
| `BG-HOP-3` | `FIB1-HOP-3` | `{role_lead} Hopper Pass` | Bagasse Hopper Pass |
| `BG-BUNK-RELOAD` | `FIB1-BUNK-RELOAD` | `{role_lead} Reload` | Bagasse Reload |
| `BG-YARD-UNLOAD` | `FIB1-YARD-UNLOAD` | `{role_lead} to Yard` | Bagasse to Yard |
| *(new)* | `FIB2-WET` | `{role_lead} Wetting` | Wheat Wetting — **TBD-2** |
| *(new)* | `FIB2-BUNK-LOAD` | `{role_lead} Bunker Loading` | Wheat Bunker Loading |
| `PD-RECEIPT` | `STRAW-RECEIPT` | `{role_lead} Receipt` | Paddy Receipt |
| `PD-BALE-CUT` | `STRAW-BALE-CUT` | `{role_lead} Bale Cutting` | Paddy Bale Cutting |
| `PD-SOAK-n` | `STRAW-SOAK-n` | `{role_lead} Soaking {n}` | Paddy Soaking 1 |
| `PD-BUNK-STORE` | `STRAW-BUNK-STORE` | `{role_lead} Bunker Storage` | Paddy Bunker Storage |
| `PD-YARD-LOAD` | `STRAW-YARD-LOAD` | `{role_lead} Piles to Yard` | Paddy Piles to Yard |
| `NM-ROTAVATE` | `NMIX-ROTAVATE` | Nitrogen + Mineral Mix | Nitrogen + Mineral Mix |
| `YD-*`, `TR-*`, `P1-*`, `TN-*` | unchanged | material-agnostic already | — |

Streams rename accordingly: `BAGASSE` → `PRIMARY_FIBRE`, `PADDY` → `STRUCTURAL_STRAW`,
`MANURE_MINERAL` → `NITROGEN_MINERAL`. `YARD`, `BUNKER`, `TUNNEL` are unchanged.

**The register in `PROCESS_V2 §17` remains valid** — read it as the definition *instantiated
with bagasse filling `PRIMARY_FIBRE` and paddy filling `STRUCTURAL_STRAW`*, which is the demo
configuration.

---

## 4. Stream enablement

**[DECISION]** A stream runs only if a material is bound to its role.

| Config | Effect |
|---|---|
| No material in `SECONDARY_FIBRE` | the `FIB2-*` activities are **not generated** |
| Wheat **and** mustard both in `SECONDARY_FIBRE` | Admin chooses: one shared stream, or two parallel streams |
| Two materials in `PRIMARY_FIBRE` (new + old bagasse) | one stream by default; splittable |
| `PH_CORRECTOR` bound | the lime-correction step appears inside `FIB1-WEIGH` |
| No `MINERAL` bound | `NMIX-ROTAVATE` still runs with nitrogen source alone, and says so |

Stream enablement is evaluated by the same cardinality engine as everything else. Nothing in
application code knows how many streams exist.

**Instance-count consequence:** binding wheat to `SECONDARY_FIBRE` for the demo batch would add
~6 activity instances and 1 bunker occupancy. The Day-0 preview shows this before commit.

---

## 5. The full Admin option surface

Grouped by what Admin may do without governance, and what needs GM sign-off.

### 5.1 Free — Admin decides, per batch, no approval

| Group | Options |
|---|---|
| **Materials** | which materials fill which roles · proportion per material · dry/fresh quantities · supplier, vehicle, driver, age, source region per lot |
| **Quantities** | required MT per role · expected load capacity → **load count is derived** |
| **Structure** | bunker line count · yard pile count · straw pile count · tunnel count · room count (incl. fractions) |
| **Streams** | enable/disable any optional stream · split or merge a role's stream |
| **Repetitions** | number of soaks · number of flips · number of hopper passes · number of turner passes |
| **Durations** | Day-0 target for every activity, within the SOP band where one exists · **rest durations are mandatory, no default** |
| **Variance** | allowed customisation per field |
| **Operator plan** | which fields the operator records: required / optional / not collected |
| **Evidence** | add a requirement · relax a non-gating one · change permitted media · set capture hints |
| **Lab plan** | add a parameter to a checkpoint · sample counts · Day-0 targets within spec |
| **Resources** | bunker, tunnel, machine, vehicle, operator assignment per activity |
| **Movement** | source → destination per move · planned timing · planned quantity |
| **Process options** | hopper mode per pass · reload count · moisture correction · lime correction · probe intervals · video allowed |
| **People** | supervisor, compost manager, operators per activity group, lab technicians |

### 5.2 Governed — needs GM publish

| Action | Why |
|---|---|
| Create a **new process definition** (e.g. `PROCESS-2026C` for a mustard-led route) | it becomes the SOP for every future batch on that route |
| Add or remove an **activity** from a published definition | changes what the process *is* |
| Remove an evidence requirement marked `gates_submission` | weakens the record |
| Remove a lab parameter a gate depends on | removes a quality gate |
| Change a **SOP value** (column ① of the six) | changes the standard, not this batch |
| Enable a `gate_rule` currently disabled by a documented conflict | resolves a conflict the factory has not resolved |

**[DECISION]** Admin can **draft** any of the above and submit it. Publishing is GM's.
This is the escape hatch that lets a genuinely new process exist without a code change.

### 5.3 Never — not available to anyone through the UI

- Editing a **frozen baseline** after activation. Change goes through deviation → supervisor
  decision, or override request → GM approval.
- Editing an **actual** value in place. Corrections append a new version.
- Deleting evidence, a lab result, a deviation, or an audit event.
- Setting a duration or utilisation figure by hand — those are generated from timestamps.

---

## 6. Day-0 templates and cloning

**[DECISION]** Three starting points, in expected order of use:

1. **Clone the last batch on this process** — copies materials, quantities, structure,
   durations, resources, operator plan, lab plan, evidence config. The real factory practice:
   S5a is a chain of small edits from batch 267 onward.
2. **Named template** — e.g. "Bagasse-led, 3 lines, 3 tunnels", "Mustard-led, wet season".
   Admin saves any completed Day-0 config as a template.
3. **From the process definition defaults** — everything at its seeded value.

A clone shows a **diff against its source** before commit, so Admin sees exactly what they
changed. Nobody should discover on Day 12 that a cloned duration was never reviewed.

---

## 7. What Admin must always see while configuring

Freedom without consequence is a trap. Every configuration screen shows, live:

| Signal | Example |
|---|---|
| **Derived counts** | `21.0 MT ÷ 2.0 MT → 11 loads` · `3 bunker lines → 72 activity instances` |
| **Chemistry** | N 1.53 % · Ash 20.4 % · C:N 26.1, each against the historical band from S5a |
| **Resource conflicts** | `TURNER-01 double-booked D8` · `Bunker 5 held by MB 387-390 until 01 Oct` |
| **Deltas from last batch** | `C:N 26.1 (+1.4 vs MB 387-390)` |
| **Open conflicts touching this config** | amber marker naming the conflict ID |
| **Plan size** | activity instances · lab samples · evidence items · vessel reservations |

---

## 8. Open questions this raises

**[TBD-38]** When a material other than bagasse leads `PRIMARY_FIBRE` — mustard, say — do the
*durations* change? S1c implies waxy straws need longer pre-wet than bagasse. If so, duration
defaults belong to the **role + material** pair, not the role alone.

**[TBD-39]** Are `Wheat wetting` and `Mustard wetting + B/L` (schedule tokens, **TBD-2**) the
`SECONDARY_FIBRE` stream? If yes, that stream's activities need defining — the walkthrough
did not cover them.

**[TBD-40]** Can `STRUCTURAL_STRAW` ever be something other than paddy? Every record uses
paddy, but the role exists to allow otherwise.

**[TBD-41]** How many named Day-0 templates does the factory actually want, and who owns them?
