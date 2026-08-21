# DEMO SPRINT — ADMIN → OPERATOR

**~1 hour. Do not expand scope.** The goal is one end-to-end story that works on real
Supabase data, not a complete product.

---

## 0. Three things that will break it — fix these first

### 0.1 🔴 The rest gate does not open by itself. This is the demo's climax.

`release_elapsed_rests(p_batch)` exists and is correct — it opens the gate on the **server**
clock, so a phone set 48 h forward can't cheat it. But:

```
src/api/batch.ts:187        releaseElapsedRests()  — the wrapper exists
src/routes/BatchDetail.tsx:36   wired as a MUTATION — someone has to click it
src/routes/MyWork.tsx           never calls it at all
```

So the countdown will reach `00:00` on the operator's screen **and nothing will happen** until
an admin walks to Batch Detail and clicks a button.

**Fix — on `MyWork`, poll it:**

```ts
// every 15s, ask the server whether any rest window has elapsed, then refetch
useEffect(() => {
  const t = setInterval(async () => {
    for (const b of activeBatchIds) await releaseElapsedRests(b);
    queryClient.invalidateQueries({ queryKey: ['my-work'] });
  }, 15_000);
  return () => clearInterval(t);
}, [activeBatchIds]);
```

This is **not** a fake timer. The client only asks; the server decides using its own clock and
the Day-0 duration. Keep it that way.

**Prove this beat works before building anything else.** Everything else in this sprint is
already half-built; this one is broken and it is the moment the demo rests on.

### 0.2 Two npm scripts are broken

- `npm run lint` calls eslint — **eslint is not installed.** Either install it or drop the
  script. Do not let it fail the pre-flight.
- `npm run db:seed` points at `scripts/seed.mjs` — **that file does not exist.** Point it at
  the real seed path or remove it.

Run `npm run typecheck` and `npm run build` first and fix blockers before touching features.

### 0.3 🔴 The deviation demo needs a field that can actually go out of range

Day 0–1 activities have **no SOP bounds** — `sop_min`/`sop_max` are NULL, correctly, because
the sources give none and C-01 is unresolved. The only `sop_direct` enabled bounds
(tunnel fill 1.8–2.2 m, bunker fill 2.6–2.7 m, T2 moisture 73–75 %) are on **Day 8+**
activities, outside the demo window.

**Do not invent a threshold to make the demo work.** That is the one rule this product exists
to enforce.

**Use the Day-0 target instead.** The six-column model computes variance against column ②
(Day-0 target) when present, falling back to column ① (SOP). The admin sets **2.0 MT per
load** on Day 0 — that is a real, present target. So:

```
Load 07 · target 2.0 MT · operator enters 3.6 MT
  → recorded ✓
  → variance +1.6 MT against the Day-0 plan
  → deviation raised
  → next dependent activity BLOCKED with a stated reason
```

Nothing invented. It demonstrates the exact principle — *the system records reality and blocks
the gate, not the recording* — using a number the admin herself set twenty minutes earlier in
the same demo. That is a stronger story than an SOP bound anyway.

---

## 1. Build order — risk first, then the spine

### Minutes 0–10 · Pre-flight
- `npm run typecheck`, `npm run build`, fix blockers
- Fix the two broken npm scripts (0.2)
- **Wire and verify the rest-gate poll (0.1)** — set a 2-minute rest on any batch, watch it
  open on the operator screen with nobody clicking anything. **Do not proceed until this works.**

### Minutes 10–25 · Admin
- Schedule → open a column header → create Master Batch
- Show inherited values marked as inherited
- Material roles; **21 MT bagasse, 2.0 MT/load → 11 loads appear**; change to 2.5 → 9
- Bunker allocation, drawn as `Bunker 3 ──► Bunker 7`
- **Rest duration = 3 minutes** — the real Day-0 field, not a demo flag
- Validate → Activate → baseline frozen

### Minutes 25–45 · Operator
- My Work shows the activated batch immediately
- **Day 0 Weighment**: target / cumulative / remaining / `Load n of 11`, machine, operator,
  duration. Record 3–4 loads so the bar visibly climbs.
- **Day 1 Hopper Pass**: Water or Dry as the admin configured; before photo, after photo;
  **submit disabled at 1/2, enabled at 2/2**
- **Bunker Loading**: source → destination, duration, before/after
- **RESTING · 02:47 remaining** → countdown expires → next task unlocks unaided

### Minutes 45–55 · The failure, and two cheap wins
- **Deviation**: enter 3.6 MT on a 2.0 MT load → records, raises a deviation, next activity
  shows BLOCKED with its reason on the card
- **Movement map** on Batch Detail — three boxes and two arrows:
  `BUNKER 3 → HOPPER → BUNKER 7`. Read from `material_movement` / the movement plan.
- **Evidence summary** — `8 / 10 complete` plus the named missing ones. You already store
  named requirements, so this is a query and a list, not a feature.

### Minutes 55–60 · Rehearse it end to end, twice.

---

## 2. Cut list

**Cut the calendar view.** GPT's item 10 is the one thing in the revised plan that is still
scope creep. "Click a date → 4 concurrent batches with progress and evidence counts" needs
**four seeded batches at four different days with realistic evidence** before the screen means
anything. That is seed work plus aggregation plus a screen. It is the single most expensive
item on the list and it is not on the critical path.

Build it after the demo, when there are real batches to show.

**Do not build:** Lab, Supervisor, GM, Resources, Days 2–22, the APK integration, a second
auth path, a second workflow engine.

**Do not fake:** workflow state in React, backend state, lab results, a countdown that isn't
server-driven.

---

## 3. If you fall behind — cut in this order

1. Evidence summary
2. Movement map
3. The deviation beat
4. Bunker Loading — end the operator flow at the hopper pass

**Never cut:** the load calculation, the evidence gate at 1/2 → 2/2, or the rest gate opening
by itself. Those three are the demo. Everything else is decoration.

---

## 4. Acceptance — the story, unbroken

```
Admin opens the schedule
  → creates a Master Batch from a scheduled column
  → 21 MT ÷ 2.0 MT → 11 loads appear
  → Bunker 3 ──► Bunker 7
  → rest duration 3 min
  → validates → activates → baseline freezes
       │
Operator signs in
  → My Work shows the batch
  → Day 0 Weighment · load 1 of 11 · total climbs
  → Day 1 Hopper Pass · Water as configured
  → 1/2 photos: submit disabled.  2/2: enabled.
  → Bunker Loading
  → RESTING · 02:47 remaining
  → nobody touches anything
  → the gate opens · the next task appears
       │
Operator enters 3.6 MT on a 2.0 MT load
  → recorded
  → deviation raised
  → next activity BLOCKED, reason visible on the card
```

Stop when that runs twice in a row without intervention.

---

## 5. Why this is the right demo

It shows, in ten minutes, every claim the architecture makes:

| Beat | What it proves |
|---|---|
| 21 ÷ 2 → 11 loads, 2.5 → 9 | nothing is hard-coded; the process is data |
| Bunker 3 → Bunker 7 | material has a location and a history |
| submit blocked at 1/2 photos | evidence is a named requirement, enforced server-side |
| the gate opens with nobody watching | process state is the authority, on the server clock |
| 3.6 MT records **and** blocks | the system records reality and gates the process, not the person |

A half-built Lab queue and an empty GM dashboard would prove none of it.
