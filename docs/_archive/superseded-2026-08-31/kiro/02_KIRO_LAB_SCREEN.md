> **ARCHIVED 31 Aug 2026 — historical record, not an instruction.**
> Superseded by `docs/AGENT-BRIEF.md` (all coding agents) and `docs/CLAUDE-CODE.md`.

# Kiro prompt 02 · the laboratory capture screen

**Ships tomorrow.** Standing context must already be in the session. Prompt 01 must be done.

---

```text
TASK — build the laboratory capture screen. It ships as an APK tomorrow and a real technician
uses it on a real batch.

READ FIRST
  docs\01-process\LAB-2026A-The-Laboratory-Process.pdf   section 13 especially — the minimum set
  docs\02-architecture\DATA-CONTRACTS.md
  docs\05-ui\VISUAL-LANGUAGE.md

THE ONE ARCHITECTURAL RULE

  This screen ships a form renderer. It never ships forms.

  It does not know that moisture exists. It does not know what a Turner is. It reads
  v_lab_checkpoint_spec, and it draws whatever came back: a numeric field for NUMERIC, a chooser
  for OBSERVATION with options, a text field for OBSERVATION without.

  Grep test at the end of this task: search the whole screen directory for 'moisture', 'pH', 'EC',
  'nitrogen', 'ash', 'T1', 'bunker', 'pile 6'. Every hit is a bug. There should be none.

THE FLOW — four taps to a saved reading, and no more

  1  Pick the batch.        One list. Usually one entry. Remembered between sessions.
  2  Pick the checkpoint.   From v_lab_checkpoint_spec. Never typed. Checkpoints already captured
                            are visibly done, not hidden — the technician needs to see the shape
                            of the day.
  3  Pick the pile.         ONLY for checkpoints where per_pile is true. 1 to 6. For every other
                            checkpoint this step does not exist and must not be shown.
  4  Enter, photograph, submit.

WHAT IS CAPTURED, AND ALL OF IT IS CAPTURED

  batch · checkpoint · pile (where it applies) · every parameter the spec asked for ·
  a photograph taken on the device · who, from the login · when, twice:

      captured_at_device   the device clock at the moment of capture
      received_at_server   the server clock at the moment of receipt

  Store both. They will disagree. The disagreement is the single most useful diagnostic this
  system will have in its first month, and you only get it if you store both from day one.

  Never let the actor be typed or chosen from a dropdown of names. It comes from the login.
  A "who" that can be selected is a "who" that means nothing.

THE PHOTOGRAPH

  Taken through the camera, at the bench, at the time. Not chosen from the gallery.
  The value of the photograph is entirely the WHEN, and a gallery pick destroys it.
  The label must be legible in frame — put that sentence on the camera screen, in words.

OFFLINE IS THE NORMAL CASE, NOT THE EDGE CASE

  The bench has poor signal. Assume every submission is made offline.

  · Queue locally. Submit when there is signal. Never block the technician on a network call.
  · The queue is visible. "3 readings waiting to send" on the main screen, always, not hidden in
    a menu. A technician who cannot see the queue does not trust the app.
  · Retry is automatic and idempotent. A submission sent twice must create one row. Generate the
    idempotency key on the device at capture, not at send.
  · Nothing is ever silently dropped. If a submission fails permanently, it stays in the queue,
    visible, with what went wrong in a sentence.

WHAT SHIPS TOMORROW, AND WHAT DOES NOT

  SHIPS
    batch · checkpoint · pile · values · photograph · who · when · offline queue

  DOES NOT SHIP — and this is deliberate, not a shortcut
    · Threshold colouring. There are no confirmed thresholds. Colouring against invented numbers
      teaches the technician to distrust the app in week one.
    · Gate enforcement. is_enforced is false everywhere. The screen must not simulate it.
    · Approval as a separate act. Capture only. Approval arrives when M-1 is answered.
    · A trend screen. Twenty readings is not a trend.

  If a value comes back out of range from the resolver, record it, show it plainly, and move on.
  Never refuse it. Never ask the technician to enter it again until it looks acceptable.
  A system that scolds a technician for a bad reading gets good readings, always, within three
  weeks — and every one of them is a lie.

THE SCREEN COMPUTES NOTHING

  It receives is_out_of_range. It does not compare a value to a threshold.
  It receives blocked_reason as a finished sentence. It does not compose one from a code.
  It receives expected_count and captured_count. It does not count.

  A component that computes has to be rewritten when the contract moves. A component that
  computes nothing survives.

ACCEPTANCE

  1  The grep test above returns zero hits.
  2  Adding a parameter row makes a new field appear with no code change and no rebuild.
  3  Aeroplane mode: capture four readings, close the app, reopen, restore signal — four rows
    arrive, exactly four, and the queue empties visibly.
  4  Submitting the same capture twice creates one row.
  5  A per-pile checkpoint asks for the pile. Every other checkpoint does not.
  6  The photograph cannot be selected from the gallery.
  7  captured_at_device and received_at_server are both stored and both visible in the batch file.

Write the session report. Update Now.md. Stop and report.
```