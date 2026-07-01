# Design — Dashboard interview tasks (role-correct scheduling + booking notifications)

## Meta

- **Status:** Implemented (2026-07-01).
- **Date:** 2026-07-01
- **Package:** `competence`
- **Scope:** Fix two dashboard-task defects around interview scheduling: (1) a plain employee whose own evaluation reaches `Ready` was shown a "Schedule your interview" task that routes to the Supervisor-only `interview-schedule` screen and 403s, carrying a mislabeled subtext; (2) once a Supervisor books an interview, neither the evaluatee nor their manager receives any task about it. Move all interview tasks into the pure `task-resolver.js` and delete the broken client-side task.
- **Owner:** Boris Kostadinov
- **Related:** [[dashboard-team-feedback-tasks]] (the `task-resolver` seed this extends), [[screen-access-control]] (the `interview-schedule` role gate), [[auto-org-derived-roles]] (the role derivation the tasks scope on)

---

## 1. Context & problem

Dashboard **tasks** are assembled in two places:

- **Server** — `application/task-resolver.js` (pure singleton) derives `team-feedback` / `team-finalize` from `OPEN` evaluations with injected org lookups; `#loadDashboard` sends them as `tasks`.
- **Client** — `configureDashboard._buildTasks()` renders those server tasks and adds a few purely client-derived ones (self-eval, manager-review) from `myEvaluation` / `teamEvaluations`.

Two defects, both rooted in the client-side interview task:

1. **Mis-targeted "Schedule your interview" task.** `_buildTasks()` pushed an `interview` task (`action: "schedule"`) whenever the **viewer's own** evaluation was `Ready`. `action: "schedule"` routes to the `interview-schedule` screen, which is gated `[MANAGER, SUPERVISOR]`, and **booking a slot requires SUPERVISOR** (`#bookInterviewSlot`). A plain employee is the *subject* of the interview, not its scheduler, so the screen load correctly 403s. Interview scheduling is a Supervisor action.

2. **Strange, static subtext.** The task reused the Supervisor screen's own labels — title `interface.schedule.title` → "Ready Evaluations", sub `interface.schedule.no-evaluations` → "No evaluations are currently awaiting interview scheduling." (the screen's *empty-state* copy). The hard-coded fallbacks in code were dead (the keys exist), so the subtext was a constant that **never varied with evaluation or interview state** — only with language.

3. **No booking notification.** `task-resolver.js` only inspects `OPEN` evaluations and never reads `interviewDate`; `#loadDashboard`'s `myEvaluation` payload does not even carry `interviewDate`. Booking sets `evaluation.interviewDate` but nothing surfaces it, so neither the evaluatee nor the manager is told.

## 2. Locked decisions

1. **All interview tasks are server-derived** in `task-resolver.js` (single source of truth, unit-tested), matching `team-feedback`/`team-finalize`. The client-side `Ready → schedule` block is deleted. `#loadDashboard` is unchanged — the resolver already receives org-wide evaluations carrying `status` + `interviewDate`.
2. **Scheduling prompt → Supervisor only.** The only role that can book a slot. Managers already have a read-only "Team Interviews" view and are not prompted.
3. **Aggregate scheduling task.** A Supervisor schedules org-wide, so the prompt is a single aggregate task carrying a `count` of `Ready` evaluations with no `interviewDate`, rather than one task per evaluation. Mirrors the existing aggregate `manager-review` task.
4. **Booking notifications → employee + conducting manager.** When a `Ready` evaluation has an `interviewDate`:
   - the **evaluatee** sees "Your interview is scheduled · \<date\>" → opens their own evaluation;
   - the **manager conducting the interview** — the owner of the booked calendar slot — sees "\<name\>'s interview is scheduled · \<date\>" → opens the Team Interviews view.
5. **Manager notification follows the booked slot, not the reporting line.** The recipient is the manager *conducting* the interview — the owner of the booked calendar slot (`isInterviewManager`, keyed by evaluationID = `interviewManagerByEvaluationID.get(evaluationID) === userID`), resolved in `#loadDashboard` from the active cycle's booked slots. It is deliberately NOT derived from the org graph: a performance interview can be booked into a *different* manager's calendar when the evaluatee's usual manager is away, and that stand-in is the real participant who must be notified. Deriving it from `canManage` / `isSuperiorManagerOfEmployee` (any ancestor) was wrong twice over — it notified every manager up the chain (including skip-level supervisors) yet could still miss the actual interviewer. `canManage` remains only for team-finalize (where any superior may legitimately act).
6. **New, dedicated labels.** Interview task copy gets its own `interface.dashboard.task-interview-*` labels (en+bg); the `interface.schedule.*` labels stay owned by the real Supervisor screen.

## 3. Task model (resolver output)

| Descriptor | Condition | Fields |
|-----------|-----------|--------|
| `interview-schedule` | `isSupervisor` AND ≥1 `Ready` eval with no `interviewDate`. Emitted **once** after the loop. | `type`, `count` |
| `interview-scheduled` (self) | The viewer's own `Ready` eval has an `interviewDate`. | `type`, `audience: "self"`, `evaluationID`, `interviewDate` |
| `interview-scheduled` (manager) | `isInterviewManager(evaluationID)` (owner of the booked slot) AND `employeeID !== userID`, `Ready` eval with an `interviewDate`. | `type`, `audience: "manager"`, `evaluationID`, `employeeID`, `employeeName`, `interviewDate` |

**Control flow:** iterate evaluations → `OPEN` keeps the existing team-feedback/finalize logic → `READY` branch: no `interviewDate` ⇒ increment the Supervisor counter; else emit self and/or manager notifications. After the loop, if `isSupervisor` and counter > 0, push the aggregate.

## 4. Client rendering (`_buildTasks`)

- Delete the `s === "Ready"` interview block.
- Add three cases to the `serverTasks` switch:
  - `interview-schedule` → title `task-interview-schedule` + `(count)`, sub `task-interview-pending`, `action: "schedule"` (→ interview-schedule screen).
  - `interview-scheduled` + `audience: "self"` → title `task-interview-scheduled-self`, sub `task-interview-on` + formatted `interviewDate`, `evaluationID` (→ own evaluation).
  - `interview-scheduled` + `audience: "manager"` → title `task-interview-scheduled-team`, sub `employeeName` + `task-interview-on` + date, `action: "schedule"` (→ Team Interviews). Keyed by `employeeID`; deliberately carries no `evaluationID` on the rendered task so `handleTaskClick` uses the action path.
- `handleTaskClick` is unchanged.

## 5. Testing (`node --test`)

Extend `test/task-resolver.test.js`:
- aggregate: supervisor + N `Ready`-unscheduled ⇒ one task, `count === N`; excludes already-scheduled; **no** aggregate for a non-supervisor; none when count is 0.
- self: viewer's own `Ready` + `interviewDate` ⇒ self notification; not when `interviewDate` empty.
- manager: `canManage` + `Ready` + `interviewDate` (not own) ⇒ manager notification; not for a plain user.
- negatives: no interview tasks for `OPEN` / `Closed` evaluations.

## 6. Versioning & tracking

- **competence**: minor bump `3.9.1` → `3.10.0` (`feat(competence)`), `CHANGELOG.md` entry.
- Tracked as **CA-77** (subtask of the CA-1 "Dashboard & Tasks" epic; relates to CA-8 "Interview Scheduling"); the ID is referenced in the feature commit.

---

## Implementation log

- **Resolver (TDD)** — extended `test/task-resolver.test.js` first (interview-schedule aggregate, interview-scheduled self/manager, negatives): red (4 positive-emission cases failed, feature missing) → implemented the READY branch + aggregate in `application/task-resolver.js` → green.
- **Conducting-manager scoping (end-to-end)** — end-to-end testing showed the manager notification propagating up the whole reporting chain (a skip-level Supervisor received it), because it used `canManage` (any superior). The correct recipient is the manager *conducting* the interview — the booked slot's owner — since a stand-in can run the interview when the usual manager is away. TDD: red cases ("a superior who is not conducting gets nothing"; "a covering manager not in the chain IS notified") → introduced an injected `isInterviewManager(evaluationID)` predicate; `#loadDashboard` now builds an `evaluationID → slot.managerID` map from the active cycle's booked slots (`fetchAllCalendarSlots`). `canManage` stays for team-finalize. Full task-resolver suite 30/30.

- **Team Interviews visibility for a covering manager (actioned)** — the manager notification opens the Team Interviews screen, whose evaluation list (`#loadInterviewSchedule`) was scoped to a manager's *closest*-manager reports only, so a covering manager conducting an interview for someone outside their reports would be notified but not see it there. Broadened `#loadInterviewSchedule`: a manager's list now also includes any READY evaluation whose interview is booked into one of their own calendar slots (in addition to their direct reports). The slot scoping (`visibleSlots` / `bookedSlotByEvaluationID`) is computed before the evaluation filter and reused, so a manager only ever sees interviews genuinely on their own calendar — no org-wide leak. (These I/O handlers have no unit harness in the suite — like the rest of the web-application data loaders — so this is covered by the pure resolver tests plus end-to-end verification.)
- **Client** — deleted the `s === "Ready"` interview block in `_buildTasks()` (the 403-ing employee task); added `interview-schedule` + `interview-scheduled` (self/manager) render cases to the `serverTasks` switch; `handleTaskClick` unchanged. The old `interface.schedule.*` labels now referenced only by `frame-interview-schedule.html`.
- **Labels** — added the five `interface.dashboard.task-interview-*` labels (en + bg).
- **Verification** — competence suite 285/285, `test:json` 19/19, ESLint clean, `node --check` on both changed JS files.
- **Release** — competence `3.9.1` → `3.10.0` + CHANGELOG.
