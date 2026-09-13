> **ARCHIVED 31 Aug 2026 — historical record, not an instruction.**
> Superseded by `docs/AGENT-BRIEF.md` (all coding agents) and `docs/CLAUDE-CODE.md`.

# Kiro prompt 03 · the operator capture screen

**Ships tomorrow, alongside the lab APK.** Standing context must already be in the session.

---

```text
TASK — build the operator capture screen. Same day, same batch, different person, different job.

READ FIRST
  docs\01-process\STANDARD.md                the 470-hour process, hour by hour
  docs\02-architecture\DATA-CONTRACTS.md
  docs\05-ui\VISUAL-LANGUAGE.md
  docs\01-process\LAB-2026A-...pdf §2, §13   what the operator needs to know about the lab

WHO THIS IS FOR

Somebody standing next to a bunker, on a phone, possibly at 3am, with one hand free.
Everything below follows from that sentence.

WHAT THE OPERATOR NEEDS, IN THIS ORDER

  1  What am I meant to be doing right now?
  2  What is running, and how far behind is it?
  3  Let me record that I did something.

Not a dashboard. Not a Gantt chart. Three questions, answered in that order, on a phone.

WHAT IS CAPTURED

  activity started · activity completed · which machine (M1 or M2) · which pile (1–6) ·
  which vessel (which bunker, which tunnel) · a photograph where the activity requires one ·
  who, from the login · when, device clock and server clock, both stored.

  M1 and M2 are turner machines 1 and 2. A pass is recorded against whichever machine performed
  it. The operator picks the machine; the system never guesses it.

TIME — the one thing that must be right

  Every activity has an H-hour: continuous hours from H0, the moment the batch started.
  H-hours do NOT reset at midnight. H26 is the morning after H2, not two o'clock.

  Show both, always, together:
      H132 · Tue 02 Sep, 21:00

  The H-hour is what the process is written in and what management asks about. The clock time is
  what the operator lives in. Showing one without the other has produced a real error on this
  project already, and it will produce more.

  Never make the operator do the conversion. Never make the operator type a time.

DEVIATION IS NORMAL, NOT AN EXCEPTION SCREEN

  Activities run late. That is the ordinary state of a factory, not an error condition.

  · Show the variance as a number and as a sentence: "40 min behind plan".
  · Never colour it red on its own. Red is for something a human must act on now.
  · Never make recording a late activity harder than recording an on-time one. If it is harder,
    the operator will record it as on-time, and the entire product loses its purpose.

  The product exists to answer: what should have happened, what did happen, when it diverged, who
  did it, what proved it, who authorised the difference. Every one of those answers depends on a
  tired person choosing to tell the truth at 3am on a phone. Design for that person.

LABORATORY GATES ARE OFF TOMORROW

  is_enforced is false on all four. The operator is never blocked by the laboratory tomorrow.

  Where a gate would apply, show it as information and nothing more:
      "Laboratory: moisture, pH, EC — not yet recorded"
  Never a lock. Never a disabled button. Never a red bar.

  When gates are turned on later, the screen changes because the data changed — the reason arrives
  from blocked_reason as a finished sentence, and the tile disables itself. No release.

OFFLINE, IDEMPOTENCE, THE VISIBLE QUEUE

  Identical requirements to the laboratory screen, prompt 02. Read that section and implement the
  same behaviour. Ideally the same queue component serves both apps.

WHAT DOES NOT SHIP TOMORROW

  · Forecast, projected end, or any forward number. The forecast register is not proved.
  · Extension requests and approvals.
  · Anything that edits a recorded actual. There is no edit anywhere in this product.
  · Any screen that asks the operator to type a time.

ACCEPTANCE

  1  From cold start, an operator records a completed activity in under fifteen seconds.
  2  Every time shown carries its H-hour and its clock time, together, everywhere, with no
    exception.
  3  Recording a two-hour-late activity takes exactly the same number of taps as an on-time one.
  4  Aeroplane mode: four captures survive a restart and arrive exactly once.
  5  No laboratory gate blocks anything, and a test asserts it.
  6  The machine (M1/M2) and the pile are recorded on every Turner pass.

Write the session report. Update Now.md. Stop and report.
```