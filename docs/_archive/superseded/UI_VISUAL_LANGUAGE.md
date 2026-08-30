> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# UI visual language — read this before opening the prototype

Source: `MushroomOS_Stakeholder_FactoryNow_Visual_Reference.html`, 655 lines, single file.

The prototype's own footer is honest about what it is:

> *"not the production UI. The visual language, hierarchy and interaction ideas are being frozen
> here; process values, activities, durations and states must come from the live process definition
> and operational records."*

That is exactly right, and this file exists because the distinction is easy to lose once someone
opens the file and starts copying. **The design thinking in it is good and should be kept. The data
model in it is stale and would destroy the product if it survived.**

---

## Part 1 — patterns to promote to primitives

These are real design decisions, correctly made. Lift them.

### 1 · Machine utilisation is the UNION of intervals, never the sum

The prototype gets this right and says why, in a comment:

> *"A machine is either busy or not, so utilisation is the UNION of its intervals — never the sum,
> which would report more than 24 hours in a day. Any overlap is contention: one machine cannot flip
> two piles at once, whether or not they belong to the same batch."*

`busyUnion()` merges overlapping intervals before totalling. Summing would report 27 hours of work
in a 24-hour day and nobody would notice until someone checked.

**Primitive: Resource Card.** Utilisation is a merged-interval total. The computation belongs in a
view, not in the component — but the *rule* is this one.

### 2 · Overlap is contention, and it is shown

`clashSet()` finds intervals that overlap on the same machine, outlines those segments in the alert
colour, and rolls the count up to a header pill: *"3 over-committed"*.

**Primitive: Resource Conflict.** A conflict is a first-class thing to look at, not an artefact to
tidy away. Freeze §12 requires no impossible overlap — this is how it surfaces when one occurs.

### 3 · A rest is a held state, not a task with a variance

Gate rows get a different treatment entirely: a striped `restband` reading *"held · 4h 30m elapsed
of 24h"*, spanning the columns where a normal row shows planned / actual / variance, and labelled
*"time gate"*. **No variance chip.**

That is correct. A rest has no variance because nobody is performing it. Giving it one would invite
somebody to explain why the material rested four minutes too long.

**Primitives: Rest Countdown, Locked Activity.**

### 4 · Planned above, actual below, same track

A 26px track carrying two 8px bars: planned in ghost grey on top, actual underneath coloured by
variance class. Same axis, same scale, instantly comparable, and it cannot be misread as one bar.

**Primitive: Activity Timeline Row.** This is the plan-versus-actual atom of the whole product.

### 5 · Colour identifies the batch, not the status

In the lane views each batch keeps a stable palette colour, so a machine's day reads as *which
batches used it*. Status is carried by pattern instead — striped for running, faded for pending,
outlined for clash.

**Rule: in any resource or multi-batch lane, hue = identity, pattern = state.** Do not spend hue on
status where identity is the question being asked.

### 6 · A calendar cell carries its own load

Each date shows a mini bar for that day's task load plus a count. The month reads as a workload
profile rather than a list of dates.

**Primitive: Production Calendar.**

### 7 · Cumulative drift as a per-batch sparkline

An 80×22 SVG of cumulative variance across the batch's life so far, with a zero line and the last
point marked. One glance says whether a batch is drifting or holding.

**Primitive: Drift Sparkline.** The basis must be labelled — the forecasting formula is not
confirmed and the UI must not present it as one.

### 8 · "Where the time went"

Finished tasks that ran over, ranked, with the person and the machine on each. Not a chart of
variance — a list of causes, largest first.

**Primitive: Attention Stream.** This is the causality view the product exists to produce.

### 9 · Evidence completeness names what is missing

Not *"78%"* alone. A percentage bar per batch, then a list: *"MB-2026-004 · Bunker Loading — Before
photo"*. Named requirements, and truncation is explicit (*"and 6 more"*).

**Primitive: Evidence Drawer.** Matches the rule that evidence requirements are **named**, never
counted.

### 10 · Empty states are written in words, and they distinguish

*"Nothing on the floor."* · *"Nothing ran over today."* · *"No operator work finished yet today."*
· *"Every required photo is bound."* And for machines: **"not needed"** where a machine has no work
today, versus **"idle"** where it has work but none right now.

That distinction — not-applicable versus idle — is the same discipline the freeze asks for between
empty, zero, not-recorded and unavailable.

**Primitive: Empty State.**

### 11 · The token system

Light and dark defined as CSS custom properties on `:root`, with both `prefers-color-scheme` and an
explicit `data-theme` override. Semantic names — `--ahead`, `--minor`, `--major`, `--lab`,
`--ghost`, `--idle` — not colour names. Tabular-numeral monospace for every number.

**Keep this wholesale.** It is the starting point for `docs/ui/UI_SYSTEM.md`.

---

## Part 2 — what must never reach the product

### The one that matters most: `const PROC = {…}`

Lines 290–343 are **a hardcoded twenty-three-day process timeline in UI code**, with activity codes,
labels, scopes, instance counts, start hours, durations, roles and machine classes.

It is the single most dangerous thing in the file, because it does not look dangerous. It looks like
a well-organised data structure that a developer would naturally wire up to a screen.

It violates the rule the whole architecture rests on: **no factory rule lives in code or in a
screen.** And the exit gate asks for exactly this: *"no duplicate hardcoded process timeline
exists."*

**Delete it on sight. It is the thing this file exists to warn about.**

### The process model in it is stale, and wrong in specifics

| In the prototype | Confirmed model |
|---|---|
| `H0→H552`, `PROC_DAYS = 23`, "Day X of 22" | **H0→H470**, Turner anchor **H174** |
| `TR-T0`, `TR-T1`, `TR-T2` — **no T3** | **T0 → T1 → T2 → T3** |
| `TURNER-A` / `TURNER-B` classes | **M1 and M2** |
| 3 pile instances, flips assigned to a turner | **6 piles**; the 8-hour gate runs from that pile's own **T1 actual end** |
| 11 bunkers, 12 tunnels | **3 bunker streams** (P1+P2, P3+P4, P5+P6), one tunnel per batch |
| A 15-machine `FLEET` with `unitFor()` assigning units by `idx % 4` | Resource **units** come from the resource register; a process activity names a **class** |

### Every value on the page is invented

`h32()` is a deterministic hash used to synthesise variance, evidence percentages, who did the work,
which machine, and whether something is blocked. `PEOPLE` is four invented names. Evidence
completeness is literally `72 + hash × 26`.

Fine for a prototype. **Fatal if one of them survives into a screen**, because a fabricated
variance is indistinguishable from a real one and management would act on it.

### `NOW_HOUR = 14.5`

Factory time is server-authoritative and continuous. A client-side constant — or a browser clock —
must never determine what "now" is. Every screen reads `factory_now_at` from the server.

### `vesselsFor()` computes occupancy in the browser

From `b.idx % 2` and a day range. Occupancy is **recorded movement**: source pile, destination
bunker, actual start and end, loader, actor, evidence.

### Variance thresholds live in the UI

```js
vari <= 0.02 ? 'ok' : vari <= 0.5 ? 'min' : 'maj'
```

**What "on time" means is a factory rule.** It arrives as data. The screen colours what it is told
to colour.

---

## Part 3 — how to use the file

1. Read this document first.
2. Take the token block, the layout grammar, the ten primitives above.
3. **Delete `PROC`, `PEOPLE`, `FLEET`, `unitFor`, `vesselsFor`, `h32` and `NOW_HOUR` before writing
   a single component.** Nothing that depends on them survives.
4. Every primitive gets documented with: purpose · states · required data · interaction rules ·
   loading, empty, error and blocked states · responsive behaviour · accessibility ·
   **allowed computation** · **forbidden computation**.

That last pair is the important one. A component that is allowed to compute a variance will
eventually compute it differently from the server, and then two places will disagree about whether a
batch was late with nothing to notice.

---

## What the prototype proves

It is worth saying plainly, because the instinct after a list of corrections is to discard the
thing: **this prototype demonstrates that the hard visualisation problems have already been solved.**

Concurrent batches on one axis, machine contention, plan against actual at a glance, rest as a held
state, drift over time, causality ranked, evidence named. Those are the difficult parts of this
interface and they are done and they are right.

What is stale is the data underneath — and that is the part the contracts replace.
