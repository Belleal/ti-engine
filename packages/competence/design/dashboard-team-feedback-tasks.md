# Design — Dashboard tasks for team-member evaluation feedback

## Meta

- **Status:** Approved design (pre-implementation)
- **Date:** 2026-06-18
- **Package:** `competence` (no `core` / `web-framework` changes in this scope)
- **Scope:** **A** — the team-member peer-feedback loop, end-to-end, surfaced as dashboard tasks, plus the accompanying logic required for the evaluation process to complete. See [[project-tasks-system]] for the two-stage plan (the later goal is a reusable tasks module in `@ti-engine/web-framework`).
- **Owner:** Boris Kostadinov

---

## 1. Context & current state

The evaluation process cannot currently complete: team members assigned as reviewers on an evaluation have **no way to discover, open, or be prompted** to provide their feedback. The review only matters because an evaluation advances `OPEN → IN_REVIEW` (the manager's turn) **only once every assigned reviewer has submitted**.

The review established that the **feedback machinery already exists and works** — the gap is discovery/navigation, not the feedback logic:

- **Works today:** reviewer assignment into `evaluation.workflow.team` (array of employeeIDs) at `start-evaluation`; team-member authorization on `load-evaluation` / `submit-evaluation` via `workflow.team.includes(userID)`; team submit writing per-member grades to `grades[code].team.individual[]`, appending `feedback.teamComments`, removing the member from `workflow.team`, and on the last submission computing `cumulative` + setting `teamEvaluationCompleted`; the `OPEN → IN_REVIEW` transition; grade anonymization for team members; and `load-dashboard` already *counting* pending reviews as `employeeMetrics.peerFeedback.requested`.
- **Missing:** (1) `_buildTasks()` generates **no task** for pending peer reviews; (2) no UI lists *which* evaluations need the user or hands over the `evaluationID` to open one; (3) no backend handler returns the **list** (only the count); (4) **no escape hatch** when a reviewer never submits — one no-show stalls the evaluation forever; (5) the three workflow deadlines (`selfEvaluationDeadline` / `teamEvaluationDeadline` / `managerEvaluationDeadline`) are initialized to `""` and **never populated**, so no deadline is ever enforced.

---

## 2. Locked decisions

1. **Scope A.** Team-feedback loop only. Tasks are a **derived view** of evaluation/workflow state — no stored task entity. Keep the derivation **encapsulated** so it can later be lifted into a reusable `web-framework` module.
2. **One task per pending review.** Clicking opens the **existing** `competence-evaluation` screen (team-member view) by `evaluationID`. Existing self-eval / manager-review / interview tasks are left untouched.
3. **One-shot submit** for team members (no draft). `save-evaluation-draft` continues to reject `TEAM_MEMBER`.
4. **Manager/Supervisor can finalize team feedback early** ("Proceed to manager review"):
   - Available **only once the team-feedback deadline has passed**.
   - **Allowed with zero submissions**, gated by a new app setting (default on).
   - Triggerable by the evaluatee's **manager** (org-hierarchy) **or a Supervisor**.
   - **Writes an audit entry.**
5. **Team-feedback deadline** = a **cycle-level date** (`cycle.teamFeedbackDeadline`), defaulted from an app-setting window and **overridable in Cycle Setup**. `workflow.teamEvaluationDeadline` becomes **required**, set at evaluation creation from the cycle. Resulting policy: reviewers submit **up to** the deadline (existing hard block after it stays); past it, only the manager/supervisor finalizes.

---

## 3. Design

### 3.1 Config (app settings)

`bin/config/config.application.json` → `performanceAppraisals`, plus `config.application.schema.json`:

- `teamFeedbackWindowDays` — integer, default **14**. Default window used to derive a cycle's `teamFeedbackDeadline`.
- `allowFinalizeTeamWithoutSubmissions` — boolean, default **true**. When false, finalize requires ≥ 1 team submission.

### 3.2 Cycle deadline

`bin/data/schemas/cycle.schema.json` (note `additionalProperties:false`) gains:

- `teamFeedbackDeadline` — `format: date`. The cycle-wide team-feedback deadline.

Derivation & editing:

- **create-cycle** sets the default: `teamFeedbackDeadline = cycleStart + teamFeedbackWindowDays`, clamped to `≤ cycleDate`.
- **Cycle Setup** (`frame-cycle-setup.html` + `competenceCycleSetup`) shows an **editable date field** (PLANNING-only, Supervisor); `load-cycle-setup` returns it; a save path persists it via `DataManager` (extend the cycle update path / add `setCycleTeamFeedbackDeadline(cycleID, date)`).
- The **seed cycle** (`2026-H2`) gets a computed default so it conforms.

### 3.3 Evaluation deadline (required)

- `createNewEvaluation` (`competence-framework.js`) sets `workflow.teamEvaluationDeadline = cycle.teamFeedbackDeadline` at creation.
- `EvaluationWorkflow.teamEvaluationDeadline` becomes **required** (typedef in `data-objects.types.js`; `evaluation.schema.json` if it constrains the field). Self/manager deadlines stay as-is (empty, unenforced) — out of scope.

### 3.4 Task resolver (Approach 2)

New `application/task-resolver.js` — frozen singleton `module.exports.instance`, mirroring the other app singletons. Pure/derived; no persistence and no singleton reach-ins (org lookups are injected, see below).

```
resolveTasks(userID, ctx, evaluations) -> TaskDescriptor[]
  ctx = { isSupervisor: boolean, canManage: (employeeID) => boolean, today: "YYYY-MM-DD" }
```

In-scope descriptor types:

- **`team-feedback`** — for each `OPEN` evaluation where `userID ∈ workflow.team` (and `userID !== employeeID`):
  `{ type:"team-feedback", evaluationID, employeeID, employeeName, deadline, overdue }`
- **`team-finalize`** — when `isSupervisor || canManage(employeeID)`, for each `OPEN` evaluation where `today > workflow.teamEvaluationDeadline` **and** `workflow.team` is non-empty:
  `{ type:"team-finalize", evaluationID, employeeID, employeeName, pendingCount, submittedCount }`

The resolver receives already-fetched `evaluations` plus an injected `canManage` predicate and `today` (the handler does the I/O and the `organizationManager` lookups), so it stays pure and unit-testable with a stubbed `ctx`. Existing self-eval/manager/interview tasks remain in client `_buildTasks` for now.

### 3.5 Backend handlers (`competence-web-application.js`)

- **`load-dashboard`** — fetch the user's relevant evaluations (reuse the existing all-evaluations fetch), call `taskResolver.instance.resolveTasks(...)`, and add the descriptors to the payload (existing counts retained; `peerFeedback.submitted/requested` may be populated accurately from the resolver as a minor side benefit).
- **New `finalize-team-feedback`** service handler — params `{ evaluationID }`:
  - **Authz:** evaluatee's manager (`#canManagerPerformEvaluation`) **or** Supervisor; else `403`.
  - **Preconditions:** status `OPEN`; `today > workflow.teamEvaluationDeadline`; `workflow.team` non-empty; if no team submissions yet, require `allowFinalizeTeamWithoutSubmissions`. Violations → `E_APP_*` with the appropriate 4xx.
  - **Effect:** drop the still-pending reviewers from `workflow.team`; set `teamEvaluationCompleted = true`; compute `cumulative` from whoever submitted (`calculateTeamCumulativeGrades`); if `selfEvaluationCompleted` is also true, transition `OPEN → IN_REVIEW` (else stay OPEN, awaiting self); persist.
  - **Audit:** `appendAuditEntry` — see §3.7.
- **Cycle Setup save** path for `teamFeedbackDeadline`; **create-cycle** default computation.

### 3.6 UI (`competence-user-interface.js`, fragments, localization)

- **`configureDashboard._buildTasks`** renders the server-provided `team-feedback` and `team-finalize` descriptors as task cards alongside the existing tasks (shape `{ id, tone, title, sub, action, evaluationID }`). Deadline/overdue reflected in tone/sub.
- **`handleTaskClick`** routes:
  - `team-feedback` → `competence-evaluation?evaluationID=<id>`.
  - `team-finalize` → `competence-evaluation?evaluationID=<id>` (manager view); a **"Proceed to manager review"** action (confirm modal) on that screen calls `finalize-team-feedback`. (Alternative considered: inline dashboard confirm — rejected so the manager sees who/how-many submitted before finalizing.)
- **Cycle Setup** — editable team-feedback-deadline date field (Supervisor, PLANNING-only).
- **Localization** (`competence-labels.json`, en + bg): task titles/subs for both new types; finalize action + confirm copy; the deadline field label; new error messages (deadline-not-reached, no-submissions-not-allowed, etc.).

### 3.7 Audit entry (corrected)

The audit log's `subjectType` enum is `"employee" | "cycle" | "activeCompetencySet"` and `getAuditEntriesForEmployee` reads only the `"employee"` bucket. So the finalize entry is scoped to the **evaluatee** to surface in their audit trail:

```
appendAuditEntry({
  subjectType: "employee",
  subjectID:   <evaluatee employeeID>,
  changedBy:   <actor userID>,
  field:       "evaluation.teamFeedbackFinalized",
  oldValue:    <pending reviewer count before>,
  newValue:    <"In Review" | "Open (awaiting self)">,
  reason:      "Team feedback finalized after the deadline by <actor role>; N pending reviewer(s) dropped (evaluation <shortID>)."
})
```

---

## 4. Testing (`node --test`)

- `test/task-resolver.test.js` — `team-feedback` discovery (membership, OPEN-only, excludes self); `team-finalize` discovery (deadline passed, pending non-empty, manager/supervisor scope); overdue flag; no false positives before the deadline.
- `test/competence-framework.finalize.test.js` (or extend an existing suite) — finalize: drops pending reviewers, computes `cumulative` from submitted, transitions to `IN_REVIEW` only when self complete, respects `allowFinalizeTeamWithoutSubmissions`, rejects before the deadline / when not OPEN, writes one audit entry.
- `test:json` — schema updates validate: cycle `teamFeedbackDeadline`, the two new settings; seed cycle + `config.application.json` conform.

---

## 5. Out of scope (future)

Team draft-save; scheduled auto-advance at the deadline; self/manager deadline population & enforcement; hardening the existing self-eval/manager-review/interview tasks; extracting the reusable `web-framework` tasks module (the resolver is its seed); a dedicated "Peer reviews" list screen / sidebar entry (revisit only if per-review tasks crowd the dashboard).

---

## 6. Details to confirm during implementation

- Exact `field` string + `oldValue`/`newValue` rendering in the Employee-Management audit tab.
- Whether `team-finalize` should suppress when self is also incomplete (current decision: show it regardless; finalizing then waits on self).
- Confirm the all-evaluations fetch in `load-dashboard` is an acceptable cost for resolving tasks (it already runs there).

---

## 7. Implementation log

_(Append one entry per checkpointed commit during implementation.)_
