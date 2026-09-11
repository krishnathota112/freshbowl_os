# UI system

**The design language every MushroomOS screen is built from.** Three files, one job each:

| File | Answers |
|---|---|
| `UI-SYSTEM.md` — this file | how the product looks, speaks and behaves, everywhere |
| `WORKSTATIONS.md` | which screens exist, for whom, and what each one does |
| `VISUAL-LANGUAGE.md` | the visualisation primitives already solved, and what must never reach the product |

The data every screen shows comes from `docs/02-architecture/DATA-CONTRACTS.md`. **A screen that
needs a value not in its contract has found a backend task, not a frontend workaround.**

---

## The north star

> **Can a person who has never seen this screen understand what to do within three seconds?**

If not, the screen is not finished. This outranks every other rule in this file.

The operator should think *"I know exactly what I need to do."* The manager should think *"I know
exactly what is happening."* Nobody should think *"what a sophisticated application."*

---

## The feeling

**Industrial. Calm. Obvious. Trustworthy. Quiet.**

A digital control system for a factory floor — not a SaaS dashboard, and not a collection of database
screens. Apple-level *clarity*; not the Apple *aesthetic*.

It is **quiet**: `MushroomOS · Operations Control`, then it simply works. No marketing voice, no
"smart", no celebration. A completed task says `Completed · 14:32` and moves on.

---

## Every screen answers five questions, in this order

```
1  Where am I?                    top bar · the batch and the task, in words
2  What needs attention?          the one thing, stated
3  What do I do?                  ONE green button
4  Why can't I?                   the server's sentence, verbatim
5  What happens next?             one line, below the action
```

A screen that answers them in a different order, or answers a sixth question nobody asked, is noisier
than it needs to be.

---

## Density follows the job, not the role's seniority

The workstations share one design system and deliberately **do not** share one dashboard.

| Workstation | Density | Why |
|---|---|---|
| **Operator** | almost none | at night, on a phone, one hand free. Every field added is a field somebody is trained on and can get wrong. |
| **Supervisor** | operational | needs the context around the work: who, which batch, what is waiting. |
| **Lab** | precise | exact values, units, bands, retests — precision is the job. |
| **Admin / Manager / GM** | the most | creating, assigning, monitoring, resolving. Complexity lives here and nowhere else. |

**Admin gets complexity. Operators do not.** When in doubt, the information moves up the density
ladder, never down.

---

## The product is a state machine — so states look the same everywhere

This is the most important visual language in the product. **A person should understand the factory
by scanning states alone.** Every state has one word, one tone and one shape, on every screen.

Shape matters as much as colour: state is never carried by hue alone.

| The database says (`activity_state`) | The screen says | Tone | Shape |
|---|---|---|---|
| `READY` | **Ready** | action | outlined, green |
| `IN_PROGRESS` | **In progress** | action | filled, green, small live dot |
| `LOCKED` · `BLOCKED` | **Locked** | neutral | lock glyph, grey — always with the reason |
| `AWAITING_LAB` | **Waiting for lab** | neutral | hollow clock |
| `WAITING_TIME` | **Resting** | neutral | striped band, counts down to a server instant — *not a task* |
| `WAITING_CONDITION` | **Waiting** | neutral | hollow clock |
| `AWAITING_SUPERVISOR` | **With supervisor** | attention | hollow clock, amber |
| `SUBMITTED` | **Submitted** | neutral | tick in outline |
| `RETURNED` | **Returned to you** | attention | amber, return arrow |
| `DEVIATION` | **Needs a decision** | attention | amber flag |
| `COMPLETED` | **Completed · 14:32** | success | tick, filled — with the server time |
| `SKIPPED` | **Skipped** | neutral | dash |
| `CANCELLED` | **Cancelled** | neutral | struck through |

Decisions carry their own three words, again the same everywhere:

| Decision | The screen says | Tone |
|---|---|---|
| submitted, no decision yet | **Waiting for approval** | attention |
| `approved` | **Approved** | success |
| `rejected` | **Rejected** — with who and why | critical |

The labels already exist in `src/api/work.ts` as `STATE_LABEL`. **That map is the single source; no
screen spells a state word of its own.** A new `activity_state` value must appear there before any
screen can show it, so a missing label fails loudly instead of rendering a raw enum.

### `Delayed` is not a state

It is a *judgement about time*, and **what "late" means is a factory rule** (`VISUAL-LANGUAGE.md`,
Part 2). A screen may say `Delayed` only when a server-supplied field says so. It never compares
`planned_end_at` with the clock itself.

> **Contract gap.** Today no field says that a *running* task is overdue — `variance_minutes` exists
> only once work finishes. Until the contract carries one (`CT-001`), running work shows its planned
> end and no `Delayed` word. Showing nothing is honest; computing it in the browser is not.

---

## One visual grammar

The same eight parts, in the same places, on every screen.

```
TOP BAR          MushroomOS · the workstation · the person        quiet, always there
WHERE            batch and task, in words                          largest text on the screen
STATE            one chip, from the table above
PRIMARY          ONE green button — the next thing to do          full width on a phone, bottom
SECONDARY        quiet, neutral, never green                      "Open", "Back", "Not now"
EVIDENCE         1 / 2 photos                                     a counter, beside the step it belongs to
REASON           the server's sentence, verbatim                  under the state, never in a toast
DONE             Completed · 14:32                                server time, then the next task
```

**One primary action per screen.** Two green buttons is a screen asking the person to decide what the
process is. The process already decided.

### Colour

Light, neutral surfaces · deep text · **one restrained green** for action and "go". Nothing else is
green. The existing tokens stay — this file assigns them roles, it does not replace them:

| Token | Role |
|---|---|
| `--accent` | the primary action and `Ready` / `In progress` — the only green |
| `--ok` | `Completed`, `Approved` |
| `--warn` · `--warn-soft` | attention: waiting on a person, returned, a decision needed |
| `--danger` | `Rejected`, a refusal, a failed capture |
| `--ink` · `--ink-2` · `--muted` | text, in three strengths |
| `--surface` · `--line` | ground and dividers |

Light and dark are both defined, per `VISUAL-LANGUAGE.md` §11. Semantic tones (ok / warn / danger)
are not the accent and are never used as decoration.

### Type

One family. **Tabular numerals for every number, time and count**, so columns of times line up. A
monospaced face is for codes shown to supervisors and admins — never the primary text on an operator
screen. Headings balanced; body text short.

### Touch

Primary targets at least 48 px high. The primary action sits where a thumb reaches it. Nothing
important depends on hover — a phone has none.

---

## Words: the backend's machinery disappears

The backend holds RLS, RPCs, gates, append-only actuals, evidence bindings, approval state,
extensions, forecasting, process versions and a frozen baseline. **The person using the screen should
barely notice any of it.**

| Not this | This |
|---|---|
| `LAB-BNK-LOAD = PENDING` | **Locked** · Waiting for lab approval before this work can begin. |
| `Upload file` | **BEFORE PHOTO** · Take a photo of the pile before turning. **[ Capture photo ]** |
| `gate_rule EVIDENCE_COMPLETE failed` | **1 photo still needed** · After finishing |
| `state = SUBMITTED, awaiting_decision = true` | **Waiting for approval** |
| `FIB-WET-1 · PRIMARY_FIBRE` as the title | **Bagasse wetting — first pass** as the title; the code small, for supervisors |

Rules that make that possible without the screen inventing anything:

- **Titles come from the data** (`title`, `scope_label`). A screen never maps a code to a name.
- **Reasons come from the data** — `blocked_reason` is already a sentence; render it verbatim.
- **Evidence words come from the data** — each requirement carries `label` and `capture_hint`
  (`v_evidence_state`). "Take a photo of the pile before turning" is the requirement's own text.
- **Codes are for the people who need them.** Operator screens show none as primary text.

> **Contract gap.** Some `blocked_reason` sentences lead with a code an operator does not know —
> *"LAB-BNK-PRE: 0 of 1 approved…"*. The screen may not rewrite the server's sentence, so the fix is
> the sentence (`CT-002`), not a frontend translation table.

---

## Evidence is part of the work, not an upload

A photograph is a step in the task, named for what it proves, captured at the moment it is true.

```
BEFORE PHOTO
Take a photo of the pile before turning.
[ Capture photo ]                              1 / 2 photos
```

- **The device camera, not a gallery.** Production capture opens the camera and nothing else
  (`DEC-026`). The handset run showed `<input type="file" capture="environment">` opening the system
  Photo Picker on current Android — a gallery, from which last week's photo would satisfy "before you
  begin". That is an evidence-integrity defect, not a convenience one.
- **The captured image is shown back** before the step is marked done, so the person sees what they
  proved.
- **A retake is a replacement with a reason**, never a second copy. The original stays on record.
- **A requirement is satisfied only by a bound, non-empty, real object** — the server enforces this;
  the screen reflects `satisfied_count` and never counts on its own.

---

## Failure is honest

The handset run proved the backend fails cleanly. The screen must too.

**A refusal names what to do instead**, and the server supplies it:

```
YOU CANNOT DO THIS        the state, in one word
HERE IS WHY               the server's sentence, verbatim
HERE IS WHAT TO DO NEXT   the server's sentence names it; the screen offers that action if it exists
```

Never *"Something went wrong."* `src/lib/humanError.ts` already turns a database refusal into this.

**A failed capture says nothing was recorded** — proven on the device with the network cut:
*"Capture failed — nothing was recorded."* A screen must never show a tick for a write the server
did not confirm. No optimistic success on anything that becomes evidence, an actual, or a decision.

---

## Every state of every screen is designed

| State | Rule |
|---|---|
| **Loading** | a quiet skeleton of the real layout; never a spinner on an empty page |
| **Empty** | written in words, and it distinguishes — *"Nothing assigned to you right now"* is not *"All done for today"* (`VISUAL-LANGUAGE.md` §10) |
| **Locked / waiting** | the reason, and what happens next — never a disabled button with no explanation |
| **Refused** | the server's sentence, beside the action it refused |
| **Offline / failed** | says nothing was recorded, keeps what the person typed, offers retry |
| **Done** | `Completed · 14:32`, then the next task — no celebration |

---

## What the screens may and may not compute

**Allowed:** layout · formatting a server timestamp in the factory timezone · grouping rows the
server already classified · counting down to a server-supplied instant.

**Forbidden:** eligibility · gate outcomes · lateness or `Delayed` · variance · forecast · required
evidence or its count · approval authority · official timestamps · the process sequence · what
"on time" means. `DATA-CONTRACTS.md` §0 states the same rule from the other side.

---

## Deliberately avoided

Huge analytics dashboards · charts that do not change a decision · gradients · animation for its own
sake · fifteen card types · complicated sidebars · database terminology on worker screens · giant
tables on a phone · decoration that does not help someone do their job.

**The whole component set is small on purpose:** top bar · state chip · primary button · secondary
button · task card · step · evidence step · counter · reason panel · rest countdown · empty state ·
confirmation. If a screen seems to need a new kind of card, it is usually two screens.
