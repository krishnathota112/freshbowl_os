# 01 — PRODUCT PURPOSE AND CORE MODEL

## Purpose

Define exactly what MushroomOS is, what problem it solves, and the architecture/product rules that must remain stable.

## What the application must do

MushroomOS must behave as a factory process execution and monitoring system, not a generic task list. It must make planned work, actual execution, variance, blockers, Lab/GM decisions, exceptions, resource readiness and forecast understandable to a non-technical Admin.

The product must remain the existing application. Do not replace the architecture because process rules change.

The official product state is built from:
versioned process data + batch H0/configuration + frozen plan + dependencies/gates/readiness + actual execution + readings/evidence + Lab/GM decisions + tickets/extensions/exceptions.

## Acceptance / proof

A reviewer can explain, in plain factory terms, what MushroomOS is for and why its process state can be trusted.

No product rule is implemented only in React when it belongs in process/domain data.

## Detailed source context

The following sections from the consolidated Geetha source are included below. They are implementation context, not permission to invent a different product.


# 1. WHAT MUSHROOMOS ACTUALLY IS


MushroomOS is Freshbowl Horticulture's **factory process execution and monitoring system** for the
button-mushroom compost process.

It is not a generic task manager, not a simple checklist, and not a dashboard that merely counts
completed tasks.

Its job is to make the following understandable and traceable:

- What should have happened according to the selected SOP/process version.
- When it should have happened.
- What physically happened.
- When it physically happened.
- Who performed it.
- What readings were taken.
- What evidence was captured.
- What the Laboratory reported.
- Whether a Lab result is merely recorded or actually approved.
- Who approved/rejected a Lab result.
- What is blocking production.
- Whether a late event really affects downstream work.
- What exception/extension was authorized.
- What the current forecast is.
- What management needs to know next.

The central product equation is:

```text
VERSIONED PROCESS DATA
        +
BATCH H0 / CONFIGURATION
        +
FROZEN BASELINE / PLAN
        +
DEPENDENCIES + GATES + READINESS
        +
ACTUAL EXECUTION
        +
READINGS + EVIDENCE
        +
LAB RESULTS + GM DECISIONS
        +
TICKETS / EXTENSIONS / EXCEPTIONS
        =
TRUSTWORTHY PROCESS STATE + FORECAST + AUDIT
```

The application must help a non-technical Admin answer, without hunting through unrelated screens:

> Where is this batch?
> What should have happened by now?
> What actually happened?
> What is late?
> Why is it late?
> What is blocking it?
> Is Lab/GM holding anything?
> Are we still on the SOP timeline?
> Did the delay affect the controlling path?
> When do we now expect to finish?

---


# 2. SOURCE AND AUTHORITY DISCIPLINE


This document consolidates the intended product/process model, but exact implementation values must
always be verified against the active runtime process/version and database.

Use this source discipline:

## 2.1 Product/core authority

The existing MushroomOS product/architecture is fixed. Do not rebuild it because a process rule
changes.

Core capabilities include:

- authentication
- roles and permissions
- Admin web
- one Operations/Supervisor field workflow
- Lab mobile
- GM authority/oversight
- batch lifecycle
- new batch creation
- existing-running-batch onboarding
- process versions
- plan generation
- task state
- parallel streams
- dependencies
- gates
- passive holds
- readings/checklists
- evidence/native camera
- timestamps
- performer accountability
- Lab submission
- GM approval
- tickets/late work/extensions
- monitoring
- audit/history

## 2.2 Process authority

The factory SOP/process is **data**. Process stages, activities, durations, streams, dependencies,
gates, holds, readings, evidence requirements, variant rules, and other process-specific behavior
belong in the versioned process model.

Do not create process-specific React logic such as:

```ts
if (paddy === 'local') hideSoak3()
if (stage === 'Turner') ...
const H470 = ...
```

when that rule belongs in process/domain data.

## 2.3 Laboratory authority

The Lab specification defines Lab checkpoint semantics. It distinguishes:

- **GATE** — hard stop until approved result exists
- **DECISION** — reading chooses a defined branch
- **RECORD** — captured for traceability/trend and never blocks by itself

The Lab document explicitly states that 4 of the 25 checkpoints are GATEs, 1 is a DECISION, and 20
are RECORDs. It also states that unresolved rules must remain unresolved rather than being invented.

## 2.4 Historical/supporting documents

The Geetha worked example, Admin examples, UML/blueprints, implementation audits, truth matrices,
and historical migrations are context and evidence.

They must not be used to silently override the actual active process version.

## 2.5 Runtime is proof

A migration existing in git is not proof.

A TypeScript build passing is not proof.

A query returning data is not proof of correct factory behavior.

A screen displaying a number is not proof that the backend calculated it correctly.

Important changes require runtime evidence against DEMO/TEST batches in a safe environment.

---


# 3. NON-NEGOTIABLE PRODUCT RULES


1. **Do not redesign the architecture.**
2. **Do not create a second process engine or scheduler.**
3. **Do not flatten the process into one linear task list.**
4. **Do not rewrite an activated batch baseline.**
5. **Do not rewrite a published process version.**
6. **Do not fabricate historical timestamps, performers, photos, readings, approvals, or completions.**
7. **Do not bypass server-side gates through UI logic.**
8. **Do not treat demo mode as permission to break process rules.**
9. **Do not put process rules in React that belong in process data/backend logic.**
10. **Do not use “READY” to mean merely “exists and has no predecessor.”** READY must be understandable to a human as startable now.
11. **Do not make an unrelated parallel task late because another branch is late.**
12. **Do not let an approved extension rewrite the original baseline or fake actual delay.**
13. **Do not allow Lab to approve its own result.**
14. **Do not make records behave like gates.**
15. **Do not hide an incorrect process task with CSS/filtering.**
16. **Do not delete production history to fix a UI/data problem.**
17. **Do not guess unresolved factory rules.** Mark them `NEEDS FACTORY DECISION`.
18. **Do not call a feature complete until the relevant runtime scenario has been tested.**
19. **Operator and Supervisor are the same field workflow.** Do not create two human-facing operational applications.
20. **Admin is the monitoring/configuration/administration workstation, not the person physically performing compost work.**

---

