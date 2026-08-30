# Open questions — only the factory can answer these

**Four items. None may be inferred, guessed, defaulted, or decided by an engineer, an agent, or a
model.** Each is one `UPDATE` on a settings row once answered — not a migration, not a redesign.

Until answered they are `UNRESOLVED`. **Build no gate on any of them.**

---

## 1 · The loader — is it a modelled resource?

**What we know.** The loader does the bunker fill (2 h × 3), the unload/reload (2 h × 3) and the
tunnel load (2 h × 3). That is eighteen hours of work per batch on the critical path, between the
Turner and the tunnel.

**What is missing.** It appears in no source spreadsheet as a tracked resource and in no
`resource_requirement` row. The Turner sheet meticulously tracks two turner machines — 24 passes,
36 machine-hours, no double-booking — and then schedules the loader's work in the same grid with no
row for the machine doing it and no conflict check.

**Why it matters.** The two turners run at **6 % utilisation** — 36 machine-hours against a 296-hour
cycle. They are nowhere near the constraint. The constraint is the tunnel and the loader. A capacity
conversation that starts with turners starts in the wrong place.

**The question.** *How many loaders are there, and should the system track their occupancy the way
it tracks the turners?*

**If the answer is yes**, `0021_resources.sql` already has the machinery — the loader is simply not
declared. The activity names a **class**, never a unit.

---

## 2 · Turner changeover and repositioning time

**What we know.** In the source schedule every one of the 24 passes butt-joins the next at exactly
1.5 hours. M1 finishes T2 on pile 6 at 03:30 and starts T3 on pile 1 at 03:30 — crossing the whole
platform in zero minutes.

**What is missing.** No repositioning, no water refill, no operator handover, no breakdown
allowance, anywhere in the 23-hour span.

**Why it matters.** Ten minutes of real drift per pass compounds to two hours by T3, and pushes
bunker filling out of a window that already has thirty minutes of slack on stream 1.

**The question.** *How long does a turner actually take to reposition between piles?*

**Interim handling.** Recorded `CONFIGURABLE`, **default zero** — so nothing changes today — and
made **visible on screen**, so the assumption stops being invisible.

---

## 3 · The receiving bunker for each reload

**What we know.** At H259 / H261 / H263 each bunker unloads and reloads in 2 hours.

**What is missing.** The source names no destination bunker.

**Why it matters.** If it is the **same** bunker, there is no wash or turnaround time in the model
and there should be. If it is a **different** bunker, that fourth, fifth and sixth bunker does not
exist anywhere in the model.

**The question.** *Does a reload go back into the same bunker, or into a different one — and if
different, how many bunkers are there in total?*

---

## 4 · The moisture band between 67 % and 68 %

**What we know.** At `FIB-MOIST-DEC` (H133) the SOP says: moisture **≥ 68 %** → proceed; moisture
**< 67 %** → controlled mist through the hopper, then re-measure.

**What is missing.** It does not say what happens at **67.4 %**.

**Why it matters.** This is a branch point in the process. An invented threshold here would be a
factory rule created by an engineer, which is exactly what the confidence discipline exists to
prevent — and it would be invisible, because it would look like it came from the SOP.

**The question.** *What happens to a reading between 67 % and 68 %?*

**Interim handling.** The reading is **recorded**, **flagged**, and **referred**. It does not
auto-proceed and it does not auto-mist. Out-of-range never blocks recording — it forces a remark and
raises a deviation.

---

## Also open, but these are policy rather than physics

Seven approval-chain settings exist as columns of `extension_policy`, each carrying a TBD marker:

- Is GM approval always required, or only above a threshold?
- Manager first then GM, or either order?
- Is there a cap on requested hours?
- Is evidence required with a request?
- Do unused approvals expire?
- How many extensions may one activity carry?
- Are requests after completion ever permitted?

**Answering one is an `UPDATE`, not a migration**, and a test already proves that flipping
`gm_approval_required` really changes the outcome.

---

## How to handle these when you hit one

```
DO NOT INVENT
DO NOT PATCH THE SCREEN
DO NOT CHANGE THE PROCESS RULE
DO NOT ALTER THE BASELINE
```

Record it `UNRESOLVED`, report the missing decision, update the handover, and work on something
else. A gate built on a guess is worse than no gate, because it will be enforced, believed, and —
after activation — frozen.
