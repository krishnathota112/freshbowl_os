# 01 · Project overview

## What MushroomOS is

MushroomOS is the process-control and **employee-monitoring** system for **Fresh Bowl's mushroom compost yard**.
It turns the compost SOP into day-by-day work for the floor and checks that every step is done **in order, on
time, with photo evidence, by the right person** — and shows management exactly what happened.

- **Web app** — Admin (sets up batches, decides tickets, manages logins) and GM / Manager.
- **Android app (APK)** — Supervisor (field work), Lab technician (Lab checks), GM (approvals, progress, people).

## The problem

A compost batch runs about 20 days (H0 → H476) through bagasse conditioning, paddy soaking, chicken-manure
mixing, hopper passes, six Turner piles, three bunkers with two holding cycles, and the tunnel programme.
Quality depends on each step happening at the right time, for the right duration, at the right temperature.

On paper, steps get skipped, durations shortened, photos taken afterwards and times written in later.
MushroomOS exists so that **the record cannot look better than what really happened**, and so the GM can see
whether people are actually doing the work.

## The fixed core

1. **The SOP is versioned data, not code.** A process version holds the tasks, durations, readings, photos,
   gates and the day plan. A published version is frozen; any change becomes a new version
   (2026E → F → G → H → I → **J**, current). A batch keeps the version it started on.
2. **Admin configures, the floor executes, the GM approves.** Nobody does another role's work.
3. **The server decides.** Every rule is enforced in the database with the server's clock, not only on screen.

## Roles

| Role | Where | Does |
|---|---|---|
| Admin | Web | Creates and onboards batches, marks DEMO batches, decides late tickets, manages logins, repairs tasks (failsafe) |
| Supervisor (= operator) | APK | Starts and finishes field tasks, photos, readings, checklists, late tickets on own tasks |
| Lab technician | APK | Samples, readings and photos for Lab checks, late tickets on Lab checks |
| GM | APK / web | Approves Lab submissions, decides deviations, watches progress, people and overrides |
| Manager | Web | Read-only overview |

## How a batch runs

1. **Admin creates the batch** — *new* (with H0) or *already running* (says where each stream is now).
2. **Supervisor and Lab** see "Today" and "Coming up" for each batch.
3. **A task opens** when the steps before it are finished (and, for gated steps, when the GM approved the Lab check).
4. **Doing a task:** Start → before photo (within 30 min) → readings → after photo → Finish.
   The after photo and Finish unlock only when the SOP time has passed.
5. **Holds** (rests) begin by themselves and are confirmed on time and/or temperature.
6. **Late work** (past day-plan time + 30 min) is blocked until Admin approves a late ticket; granted hours move every later step.
7. **GM** approves Lab submissions with the readings and photos, and follows progress and people.
8. **DEMO / TEST batches** follow everything except the clock, for testing.

## Technology

React 18 + TypeScript + Vite + TanStack Query; Capacitor 6 (Android, native camera); Supabase (Postgres, row-level
security, SECURITY DEFINER server functions, Storage bucket `evidence`).
