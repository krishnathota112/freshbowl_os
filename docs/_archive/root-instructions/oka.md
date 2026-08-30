> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

This plan is **much closer**, but I would not let Antigravity execute it exactly as written yet. The structure is right; there are a few places where it is still turning meeting notes into implementation facts too aggressively.

### What I agree with

The sequence is good:

```text
A  audit
↓
B  PRE-H0 vs H0–H552
↓
C  3-pile concurrency
↓
D  tunnel planning
↓
E  operator/lab scoping
↓
F  process-graph UI
```

That order is sensible because the UI should come after the time/dependency model is correct.

The plan also correctly captures the new pile chain:

```text
Pile 1: T0 → REST → T1 → REST → T2 → Bunker
Pile 2: T0 → REST → T1 → REST → T2 → Bunker
Pile 3: T0 → REST → T1 → REST → T2 → Bunker
```

and the important rule that there is **no global T2 barrier**.

### But I would make five corrections before execution

**1. Don't automatically decide that `rel_day < 0` means PRE-H0.**

Your existing time contract treats H0 as an actual boundary, and you've previously established that actual execution before H0 is not allowed inside the normal batch activity model.

So Phase A should first inspect the current schema and decide whether PRE-H0 needs a distinct representation rather than simply negative `rel_day`.

Tell Antigravity:

```text
Do not implement PRE_H0 by conventionally setting rel_day < 0
until you inspect the existing time constraints and activity model.

PRE-H0 may require an explicit phase/anchor representation.

Show the proposed data representation before migration/code changes.
```

**2. Don't hard-code the “10 hours before H0” into `time.ts` just because the meeting said it.**

The plan says:

> `getPreBatchWeighmentTime(h0, offsetHours = 10)`

That's fine as a helper **only if the offset is configuration/data**. It must not become a magic constant in the time engine.

Better:

```text
H0
↓
pre_batch_weighment_offset
↓
pre-H0 timestamp
```

with the configured offset coming from the process/batch configuration.

**3. “T0 = 6–7h” should not become a single fake duration.**

You have a range, not an exact fixed value.

So don't make:

```text
duration = 6.5h
```

or silently pick 6 or 7.

Instead the process definition should represent the factory-supported duration range, and actual execution records the real duration.

**4. H240 tunnel deadline needs to be modeled as a planning deadline, not as a tunnel activity.**

This part is good conceptually, but:

```text
tunnel allocation deadline = H240
```

should be treated as:

```text
PLANNING DEADLINE
```

not:

```text
physical tunnel process starts at H240
```

And the examples `366→T10`, `367→T8`, `368→T6` should remain examples unless they are actually the selected demo data.

**5. The verification plan contains one dangerous assumption.**

This:

> “at H456 shows TN-HOLD (Tunnel Process) in Tunnels 1, 2, 3”

is too specific unless your dev fixture actually has that exact state.

Don't bake expected tunnel IDs or a specific TN-HOLD result into the acceptance test unless the fixture is deliberately created that way.

Make the test:

```text
At H456:
show the activity that is actually scheduled/eligible for the
selected demo batch, and its real assigned tunnel/resource.
```

---

## I would also change one thing about Phase F

This:

```text
[3 PARALLEL PILES]
        ↓
[TUNNEL PLAN]
        ↓
[PHASE II TUNNEL PROCESS]
```

is a little too linear visually.

The actual story is more like:

```text
                    H0 → H552
                        │
             ┌──────────┼──────────┐
             │          │          │
           Pile 1      Pile 2     Pile 3
             │          │          │
          T0→R→T1→R→T2 T0→R→T1→R→T2 T0→R→T1→R→T2
             │          │          │
             └───── each pile ────┘
                        │
                  bunker movement
                        │
                 individual batches
                        │
                 tunnel plan due H240
                        │
               366 → tunnel A
               367 → tunnel B
               368 → tunnel C
                        │
                  tunnel process
                        │
                       H552
```

Because the **pile streams are parallel**, not a single vertical sequence.

---

# I would approve the plan after this amendment

Send Antigravity this before it starts:

```text
APPROVED WITH REQUIRED PRE-IMPLEMENTATION CORRECTIONS

The 6-phase sequence is approved.

Before writing code, make these corrections:

1. PRE-H0 REPRESENTATION
Do not automatically use rel_day < 0.
Inspect the existing time constraints and propose the explicit PRE-H0
representation first.

2. PRE-H0 WEIGHMENT OFFSET
Represent the approximately 10h pre-H0 relationship as data/configuration.
Do not hard-code 10h into the time engine.

3. T0 DURATION
Do not collapse the 6–7h factory range into an invented fixed duration.
Represent the supported range and record actual execution separately.

4. TUNNEL DEADLINE
H240 is a planning deadline for tunnel selection.
It is not the physical tunnel start.
Do not hard-code example tunnel numbers unless they are actual selected
demo data.

5. H456 VERIFICATION
Do not assume TN-HOLD or tunnel IDs.
At the test batch's actual current H, show the activity and resource
that the batch data actually says is active/eligible.

6. PROCESS GRAPH
Keep the three piles visually parallel.
Do not render them as a sequential phase list.

Before Phase B code:
show:
A. proposed PRE-H0 data representation
B. exact T0/T1/T2 dependency graph
C. exact tunnel-deadline representation
D. affected existing tables/RPCs/components

Do not modify schema until this audit is complete.
```

That gives you a much safer implementation plan.

And yes — **this is the right plan to work from now**, provided Antigravity does that Phase A audit before touching the schema. The previous problem was that we kept letting agents turn an operational statement into a database fact without checking whether the existing architecture could represent it cleanly. This version can stop that.
