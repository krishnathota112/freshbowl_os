# UI DESIGN SPEC

**[DICTATED 20 Aug 2026]** *"The application should not look like a giant ERP form."* ·
*"ui must be good and effective for all — operator, lab or gm or admin — it should not look
sloppy."*

The approved Admin mockups are the visual baseline:
https://claude.ai/code/artifact/acf656c9-fcd1-4a5b-b7cb-af915ce95953

**Do not redesign.** Extend that language to the other five roles.

---

## 1. Design tokens — fixed

Carried from the approved mockups. Implement as CSS custom properties; every component reads
tokens, never literals.

```
NEUTRALS — warm, ochre-biased. Never a blue-grey.
  paper      #FAF7F2      surface    #FFFFFF     surface-2  #F4F0E9
  ink        #1B1815      ink-2      #4A423A     muted      #7A7066
  line       #E4DCD1      line-2     #D3C8B9

ACCENT — probe teal. Instrumentation, not decoration.
  accent     #0E5D6B      accent-ink #08414B     accent-soft #E1EEF0

SEMANTIC — separate from the accent. This is the working vocabulary of the product.
  ok         #2C7A4B  / soft #E3F1E8      in range, released, complete
  warn       #B0700F  / soft #FAEEDA      out of Day-0 band, variance, TBD marker
  crit       #A83A2C  / soft #FAE7E3      out of SOP band, conflict, blocked
  inherit    #8A6A2F  / soft #F4EBD9      straw — inherited from schedule, awaiting operator
  lock       #5C5248  / soft #EDE9E2      frozen baseline, SOP column, read-only

DARK THEME — full token redefinition. Both themes get equal care.
```

**Type**
```
Archivo          headings, labels, buttons, chips   500/600/700/800
Public Sans      body, descriptions                 400/500/600
IBM Plex Mono    every number, code, batch ID, time, duration, quantity
```

`font-variant-numeric: tabular-nums` everywhere digits align in a column. Non-negotiable —
this product is read as columns of numbers.

---

## 2. The five-layer node — the unifying component

**[DICTATED]** *"every box can carry the same five-layer information: SOP → Day-0 Plan →
Actual → Evidence → Decision."*

**One component. Used in the production graph, the timeline, the task card, the decision
package and the batch detail.** Everything else in this spec is a layout around it.

```
┌────────────────────────────────────────────────────────────┐
│  ⬤ FIB1-WEIGH · Bagasse Weighment          Load 08 of 11   │
│    Day 0 · PRIMARY_FIBRE · LOAD scope         IN PROGRESS  │
├────────────────────────────────────────────────────────────┤
│ ①  SOP        —                                    (lock)  │
│ ②  PLAN       2.0 MT · JCB-02 · Ravi · 12 min      (accent)│
│ ③  ACTUAL     2.08 MT · 08:10 → 08:19 · 9 min       ✓ ok   │
│ ④  EVIDENCE   1 / 1                                 ✓ ok   │
│ ⑤  DECISION   —                                            │
└────────────────────────────────────────────────────────────┘
```

With a variance and a decision:

```
┌────────────────────────────────────────────────────────────┐
│  ⬤ FIB1-BUNK-LOAD · Bagasse Bunker Loading     Line 1      │
│    Day 1 · PRIMARY_FIBRE · BUNKER_LINE      COMPLETED      │
├────────────────────────────────────────────────────────────┤
│ ①  SOP        fill 2.6 – 2.7 m  (max 2.8)      S1a 0B      │
│ ②  PLAN       2.7 m · Bunker 3 · JCB-02 · 2 h              │
│ ③  ACTUAL     2.9 m · 14:20 → 17:07 · 2 h 47   ⚠ +0.2 m    │
│                                                 ⚠ +47 min  │
│ ④  EVIDENCE   2 / 2                                  ✓     │
│ ⑤  DECISION   Released with deviation — Ramarao            │
│               "settled to 2.6 m at 4 h"          D-11 open │
└────────────────────────────────────────────────────────────┘
```

### 2.1 Layer rules

| Layer | Colour | Editable | Empty state |
|---|---|---|---|
| ① SOP | `lock` | never | `—` with the source ref, e.g. `S1a 0B` |
| ② PLAN | `accent` | frozen at activation | `—` |
| ③ ACTUAL | `ok` / `warn` / `crit` by variance | append-only | greyed placeholder in the field shape |
| ④ EVIDENCE | `ok` when complete, `inherit` when outstanding | append-only | `0 / 2` |
| ⑤ DECISION | `warn` if a deviation is open, `ok` if released | append-only | `—` |

**A layer with no data shows `—`, never a blank.** An empty SOP layer means "the source gives
no bound here", which is information (`LAB_MODEL.md §9`), not an omission.

### 2.2 Progressive disclosure by role

Same component, different density. This is how one component serves six roles without becoming
a compromise.

| Role | Layers shown | Emphasis |
|---|---|---|
| **Operator** | ② ③ ④ prominent · ① small line above the input · ⑤ hidden unless returned | one input, large controls |
| **Lab tech** | ① ③ ④ · ② as the Day-0 target · ⑤ hidden | spec beside the value |
| **Supervisor** | all five, equal weight | ③ vs ① variance, and ⑤ as the action |
| **Admin** | ① ② ④ during config · all five after activation | ② is the editable one |
| **Manager** | ② ③ collapsed to timing and resources | occupancy and conflict |
| **GM** | ① ② ③ ⑤ aggregated per stream | exception first, detail on demand |

---

## 3. The production graph — the spine of the app

**[DICTATED]** The shape the client drew:

```
                 MASTER BATCH
                      │
          ┌───────────┼───────────┐
      PRIMARY      STRUCTURAL   NITROGEN
       FIBRE         STRAW      + MINERAL
          │           │           │
      WEIGHMENT     SOAK 1     ROTAVATOR
          │           │           │
       HOPPER       SOAK 2       YARD
          │           │           │
       BUNKER       SOAK 3        MIX
          │           │           │
        REST         REST        FLIPS
          │           │           │
       RELOAD         └────┬──────┘
          │               │
          └───────┬───────┘
                  ▼
            T0 / T1 / T2
                  │
          ┌───────┼───────┐
          ▼       ▼       ▼
      TUNNEL 1 TUNNEL 2 TUNNEL 3
          │       │       │
          └───────┼───────┘
                  ▼
               UNLOAD
```

### 3.1 Rendering rules

**Layout.** One column per stream, vertical time axis, top to bottom. Streams converge with
drawn edges into the yard, then into the bunkers, then into the tunnels. Column count comes
from the enabled streams — never fixed at three.

**Nodes.** Each node is the five-layer component in a compact form: title, scope, state chip,
and a two-line summary of ② vs ③. Click expands to the full five layers inline.

**State encoding — form, not colour alone.**

| State | Node treatment |
|---|---|
| `COMPLETED` | filled, `ok` left rail, variance chip if any |
| `IN_PROGRESS` | filled, `accent` left rail, **slow pulse** on the rail only |
| `READY` | outlined, `accent` rail, solid border |
| `WAITING_TIME` | outlined, `inherit` rail, **live countdown in the node** |
| `AWAITING_LAB` / `AWAITING_SUPERVISOR` | outlined, `accent` dashed rail |
| `BLOCKED` / `DEVIATION` | `crit` rail, **the reason string is always visible on the node**, never behind a hover |
| `LOCKED` | 55 % opacity, `lock` rail |
| `SKIPPED` | strikethrough title, reason visible |

**Edges.** Solid = material moved. Dashed = dependency only, no movement. Every material edge
carries the machine that performed it (`via JCB-02`) and, for a vessel change, the swap:
`Bunker 3 → Bunker 7`.

**Time.** Each node's height is proportional to actual duration where known, with a **ghost
bar behind it at planned duration**. Variance is legible as the overhang — no number needed to
see that something ran long.

**Current position.** Exactly one marker per active stream. Do not mark six things as "now".

**Zoom.** Three levels: `STREAM` (six nodes, one per stream, rolled up) → `DAY` (default) →
`INSTANCE` (every load, every pile, every bunker). The demo opens at `DAY`.

### 3.2 What the graph must never do

- No animated edge tracing, no particles, no gradients on nodes. The pulse on an in-progress
  rail is the only motion. Honour `prefers-reduced-motion`.
- No colour as the sole carrier of state — every state has a distinct border, fill or glyph.
- No hidden reasons. A blocked node states why on its face.
- No horizontal page scroll. The graph scrolls inside its own container.

---

## 4. Per-role screens — the quality bar

### 4.1 Operator — mobile, one hand, bright sun, gloves

```
┌──────────────────────────────┐
│ MB 20-SEP · LOAD 08 of 11    │  ← scope always visible
│                              │
│ Bagasse Weighment            │  ← 20px+, Archivo 700
│                              │
│ TARGET      2.0 MT           │  ← ② plan
│ LAST LOAD   2.08 MT          │  ← calibration
│                              │
│ ┌──────────────────────────┐ │
│ │        2.08          MT  │ │  ← 28px mono, 56px tall target
│ └──────────────────────────┘ │
│                              │
│ MACHINE  JCB-02   [ change ] │
│ ■ FINISH · running 9 min     │  ← machine stint
│                              │
│ EVIDENCE            1 / 1 ✓  │
│ [ ✓ Load photo ]             │
│                              │
│ ⚠ Stage-0A mixing is         │  ← golden rule, verbatim
│   hydration, not aeration    │
│                              │
│ [        SUBMIT        ]     │  ← 52px, full width
└──────────────────────────────┘
```

Rules: minimum tap target 48 px · body text ≥ 15 px, numbers ≥ 18 px · one primary action per
screen · numeric keypads for numeric fields · **no horizontal scrolling, ever** · offline
state visible as a persistent chip, never a modal.

**The running-total component** (`PROCESS_V2 §2`) sits above the load list and is the operator's
whole sense of progress:

```
TARGET     21.0 MT
LOADED     17.8 MT   ████████████████░░░░  85%
REMAINING   3.2 MT
LOADS       9 / ~11
```

### 4.2 Lab — mobile, bench-side, one sample at a time

Queue in three bands: **overdue** (with what each is blocking), **today**, **retest required**.
Result entry shows spec inline, method sheet one tap away, instrument picker with calibration
state as a chip. Verdict computes live per parameter as values are entered — the technician
sees `⚠ below` before submitting, not after.

Derived values (`C:N`, `TDS`) render in `lock` colour with a `derived` chip and no input.

### 4.3 Supervisor — Control Room, tablet or desktop

Ordered by **urgency, not by batch**. Six bands, each collapsible, each with a count:
time-critical gates (window opening or expiring within 4 h) · lab failures · open deviations ·
awaiting release · evidence review · active batches board.

Every row is actionable in place. Release / hold / return with a mandatory reason should take
two taps, not a navigation.

### 4.4 Admin — desktop, per the approved mockups

Screens 01–12 as approved. The Day-0 wizard gains the material-role binder
(`ADMIN_CONFIGURABILITY_MODEL.md §2`) as a new panel in step 2, and the live-consequence panel
(§7 of that doc) as a persistent right rail across every wizard step.

### 4.5 Manager — desktop, resource-first

Vessel Gantt across bunkers and tunnels, 21-day window, all batches. Paddy occupancy visually
distinct from compost but equally blocking. Machine load grid below it. Conflicts as a list
with both contending batches named and a resolve action.

### 4.6 GM — desktop, exception-first

Command Center opens on **what is wrong**, not on what is fine. Live batches as a compact
board; checkpoints pending as cards; the nine-section decision package as a full-page read
with a fixed approve/return bar.

---

## 5. Cross-cutting rules

**Conflict and TBD markers.** Any value affected by an unresolved item shows an amber marker
naming the ID, inline, at the point of use:

```
Rest duration   [ ____ ] h    ⚠ TBD-21 — duration not specified by the factory
Moisture target 68–69 % / 75–78 %  ⚠ C-01 — two sources disagree
```

Clicking opens the conflict entry. **Never a silent default. Never a made-up number.**

**Numbers.** Always mono, always tabular, always with a unit, always with the comparison
value beside them. A number alone on a screen is a design failure in this product.

**Empty states** say what will fill them and when — "Lab samples appear here when the bunker
load is submitted" — never "No data".

**Errors** state what went wrong and what to do. No apologies, no codes without text.

**Loading.** Skeletons in the shape of the content. Never a spinner over the whole page.

**Accessibility.** Visible keyboard focus on every interactive element · 4.5:1 contrast in
both themes · state never carried by colour alone · `prefers-reduced-motion` honoured.

---

## 6. What "not sloppy" means concretely

A reviewer should be able to check these in five minutes:

1. Every number is tabular mono with a unit.
2. Every blocked or waiting item states its reason on its face.
3. Every screen works at 375 px wide without horizontal scroll.
4. Both themes are complete — no element inherits the wrong ground.
5. Semantic colour is used only for meaning, never for decoration.
6. No lorem, no placeholder, no "Card Title" anywhere.
7. One primary action per screen, obvious at a glance.
8. Every table with more than four columns scrolls inside its own container.
9. Every unresolved conflict is visible where it matters, with its ID.
10. The five layers appear in the same order, with the same colours, on every surface.
