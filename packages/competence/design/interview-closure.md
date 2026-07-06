# Step 8 — Interview Meeting and Closure

## Meta

- **Status:** Approved (2026-07-06) — not started
- **Date:** 2026-07-06
- **Package:** `competence`
- **Scope:** Implements the final step of the appraisal process: recording the interview meeting outcome (written feedback, next-period goals, optional Performance Improvement Plan) on a `Ready` evaluation, and the Supervisor's formal closure of the evaluation (`Ready → Closed`, irreversible). Extends the Interview Schedule screen into the interviews hub (schedule → record outcome → close), reveals the closure artifacts to the employee on the Scores screen once closed, adds the two missing dashboard tasks, and makes cycle close warn about not-yet-closed evaluations. No analytics changes.
- **Owner:** Boris Kostadinov
- **Related:** [[dashboard-interview-tasks]] (CA-77 — conducting-manager rule, task-resolver seam), [[evaluation-scores-split]] (CA-75 — Scores as the post-closure surface), [[screen-access-control]] (CA-74 — fragment role gates), `design/completed/statistics-and-results.md` (CA-61 — the "interview held" proxy this step finally grounds), `design/completed/dashboard-team-feedback-tasks.md` (evaluation-scoped audit subsystem)
- **Tracking:** [CA-78](https://belleal.youtrack.cloud/issue/CA-78) — subtask of CA-7 "Evaluation Workflow"; relates to CA-8 "Interview Scheduling" and CA-1 "Dashboard & Tasks"

## 1. Context & problem

The process README defines Step 8 (§"Step 8 — Interview Meeting and Closure *(planned)*"): during the interview meeting the Supervisor and/or Manager add written feedback, set concrete goals for the next appraisal period (up to `performanceAppraisals.numberOfNextPeriodGoals`, default 5), optionally attach a formal Performance Improvement Plan, and — grades staying immutable — the Supervisor formally closes the evaluation. Nothing of this exists yet:

- No code path ever sets `evaluation.status = Closed`. The only status writes are `Open` at creation, `In Review` in `finalizeTeamFeedback`, and `Ready` on manager submit.
- The `Evaluation` record has no fields for interview feedback, goals, a PIP, or closure metadata; `numberOfNextPeriodGoals` is a config knob read nowhere.
- `#loadEvaluation` hard-rejects `Closed` evaluations (422 `error.evaluation.status-is-closed`), and `#loadResults` strips `feedback` from its payload — a closed evaluation's Step-8 artifacts would be stored but visible on no screen.
- The interview lifecycle ends at booking: nothing marks an interview as held, no task prompts closure, and the analytics "held" metric is a labeled proxy (`interviewDate <= today`).
- `closeCycle` silently freezes the immutable results snapshot regardless of evaluation states.

Two prior decisions constrain the design:

- **Reveal-at-Ready shipped deliberately** (CA-36): the employee already sees manager grades, team cumulative, and scores at `Ready` — "so they can prepare for the interview". The README's data-visibility note ("hidden until closure *(planned)*") is stale.
- **The conducting manager is the booked-slot owner** (CA-77), not necessarily the org reporting line — but every evaluation *write* gate today uses org-line superiority, so a stand-in who conducted the interview could not record its outcome. The Supervisor is likewise read-only (facilitator) on evaluations today.

## 2. Locked decisions

1. **Split visibility.** Grades/scores stay revealed to the employee at `Ready` (CA-36 behavior kept). The Step-8 artifacts — interview feedback, goals, PIP — become visible to the employee only at `Closed`. The README data-visibility table is corrected accordingly.
2. **Writers of the interview outcome** on a `Ready` evaluation: the **conducting manager** (owner of the booked calendar slot, per the CA-77 rule) ∪ any **org-line superior manager** ∪ the **Supervisor**. The Supervisor's facilitator read-only stance on grading is unchanged — the write grant is scoped to the closure artifacts only.
3. **Formal closure is Supervisor-only** and **irreversible** (no reopen), consistent with the one-way transition convention.
4. **Close preconditions** (strict variant): status `Ready` **and** `interviewDate` set **and** `interviewDate <= today` **and** an outcome recorded (non-empty feedback **or** at least one goal). Closing therefore implies the meeting happened — giving the data a real "interview held" signal.
5. **Goals** are a structured list on the evaluation — `{ text, targetDate|null }` — capped by `numberOfNextPeriodGoals`. No cross-cycle carry-forward tracking (future work).
6. **PIP** is `{ required: boolean, plan: string }` on the evaluation. A T1-threshold final score makes the UI suggest (not force) a PIP. No file attachments.
7. **Cycle close warns, never blocks:** the close-cycle modal shows how many of the cycle's evaluations are still Open / In Review / Ready and requires explicit confirmation. Server behavior of `close-cycle` is unchanged.
8. **Post-closure surface is the Scores screen** (the CA-75 designated READY+CLOSED results surface). The grading screen keeps rejecting `Closed`.
9. **Dashboard tasks are the notifications** (CA-77): a Supervisor aggregate "interviews held, awaiting closure" task, and an employee "evaluation closed" notice time-boxed to 14 days after `closedAt`. The existing `interview-scheduled` self/manager notices stop once the interview date is in the past (stale after the meeting; the close-pending task takes over).
10. **`workflow.currentStep` stays untouched.** The field is dead (always 1, never advanced, schema-required); adopting or removing it is explicitly out of scope.

## 3. Data model

One new nested object on the `Evaluation` record:

```js
closure: {
    feedback: "",                          // written interview feedback (meeting outcome)
    goals: [],                             // [ { text: string, targetDate: string|null } ], max numberOfNextPeriodGoals
    pip: { required: false, plan: "" },    // Performance Improvement Plan
    closedAt: null,                        // ISO-8601 timestamp, set by closeEvaluation only
    closedBy: null                         // Supervisor employeeID, set by closeEvaluation only
}
```

- **Schema:** declared in `bin/data/schemas/evaluation.schema.json` (the file is `additionalProperties: false` at every level, so every field is explicit). `closure` is **optional** (not in the `required` list) so existing records and seeds remain valid. `goals` items require non-empty `text`; `targetDate` is `["string","null"]` format `date`; `pip` and `closure` sub-objects are `additionalProperties: false`.
- **Typedefs:** `EvaluationClosure`, `EvaluationGoal`, and the `closure` property on `Evaluation` added to `application/data-objects.types.js`.
- **Migration-free:** records created before this feature simply lack `closure`; `recordInterviewOutcome` initializes the full shape on first write. `saveEvaluation` uses RedisJSON `JSON.MERGE` (RFC 7396) — arrays replace wholesale, so a goals save never half-merges.
- `createNewEvaluation` initializes `closure` with the defaults above for new evaluations.

## 4. Framework methods (`application/competence-framework.js`)

**`recordInterviewOutcome( evaluation, outcome )`** — sync, mutates the evaluation (same style as `updateManagerEvaluationGrades`):

- Validates (all `E_APP_SERVICE_ERROR` / 422 with label-key details):
  - status is `Ready` → `error.evaluation.outcome-not-ready`
  - `outcome.goals` is an array of at most `numberOfNextPeriodGoals` entries → `error.evaluation.too-many-goals`
  - every goal has non-empty trimmed `text` → `error.evaluation.invalid-goal`; `targetDate` is `YYYY-MM-DD` or null
  - `outcome.pip` normalizes to `{ required: boolean, plan: string }`
- Writes `evaluation.closure.{feedback, goals, pip}` (normalizing the shape if `closure` is absent). Never touches `closedAt` / `closedBy` / `status`.

**`closeEvaluation( evaluationID, actorID )`** — async, modeled on `finalizeTeamFeedback` (fetch → validate → mutate → save → audit):

- Validates (all 422):
  - status is `Ready` → `error.evaluation.close-not-ready`
  - `interviewDate` set → `error.evaluation.close-no-interview`
  - `interviewDate <= today` (string date compare, matching existing conventions) → `error.evaluation.close-interview-not-held`
  - outcome recorded: trimmed `closure.feedback` non-empty **or** `closure.goals.length > 0` → `error.evaluation.close-no-outcome`
- Mutates: `status = Closed`, `closure.closedAt = new Date().toISOString()`, `closure.closedBy = actorID`.
- Persists via `dataManager.instance.saveEvaluation`, then `appendAuditEntry({ subjectType: "evaluation", subjectID, changedBy: actorID, field: "status", oldValue: "Ready", newValue: "Closed" })`. Returns the saved evaluation.

**Anonymization:** `anonymizeEvaluationGrades`/`anonymizeEvaluationScores` are unchanged (the READY‖CLOSED reveal branch already exists). The `closure` object is **not** part of these methods' concern — the web layer decides whether to include it in a payload (see §5), which keeps the split-visibility rule in one place.

## 5. Services & authorization (`bin/competence-web-application.js`)

**New service `save-interview-outcome` → `#saveInterviewOutcome( session, { evaluationID, feedback, goals, pip } )`**

- Gate: `#requireRole(session, MANAGER, SUPERVISOR)`, then per-evaluation authorization — the user must be one of:
  - Supervisor (`userRoles` contains SUPERVISOR), or
  - org-line superior: `organizationManager.instance.isSuperiorManagerOfEmployee(userID, evaluation.employeeID)`, or
  - **conducting manager**: owner (`slot.managerID === userID`) of the booked slot whose `booking.evaluationID` matches, resolved from `fetchAllCalendarSlots(evaluation.cycleID)` — the same slot-owner rule as `#loadDashboard`'s `interviewManagerByEvaluationID` map.
- A user passing the role gate but failing the per-evaluation union is rejected `E_SEC_UNAUTHORIZED_ACCESS` 403 with details `error.evaluation.outcome-not-authorized`.
- Calls `recordInterviewOutcome`, saves, and writes an audit entry with a **compact summary** (`field: "closure.outcome"`, newValue `{ goalsCount, pipRequired, feedbackLength }`) — no personal prose duplicated into the audit log.
- Returns the saved `closure` block.

**New service `close-evaluation` → `#closeEvaluation( session, { evaluationID } )`**

- Gate: `#requireRole(session, SUPERVISOR)`. Delegates to `competenceFramework.instance.closeEvaluation(evaluationID, userID)`. Returns `{ evaluationID, status, closedAt }`.

**`#loadInterviewSchedule` extension** — each `Ready` evaluation row additionally carries:

- `closure` (current outcome values, for editing in the panel; `null` normalized to the default shape),
- `interviewHeld` (`interviewDate` set and `<= today`),
- `canRecordOutcome` (per-row: the §2.2 union — supervisor, org superior, or booked-slot owner),
- `canClose` (`isSupervisor && interviewHeld && outcomeRecorded`).

The row population stays `Ready`-only — a closed evaluation leaves the hub; its history lives on the Scores screen.

**`#loadResults` extension** — include the `closure` block in the payload **only when `status === Closed`** (decision §2.1: employee sees the artifacts at Closed; writers use the hub during Ready). The existing `delete current.feedback` stays — `closure` travels as its own top-level payload field. All existing viewers of Scores (evaluee, org superior, Supervisor) see the closure section once closed.

**`#loadCycleList` extension** — each cycle row gains per-status evaluation counts (`open`, `inReview`, `ready`) alongside the existing `inProgress`/`completed`, so the close-cycle modal can render the §2.7 warning. The `close-cycle` service itself is unchanged.

## 6. Dashboard tasks (`application/task-resolver.js` — pure, unit-tested)

Extending the `Ready` branch and adding a `Closed` branch:

| Task | Audience | Condition | Shape |
|---|---|---|---|
| `interview-close` | Supervisor (aggregate) | status `Ready` ∧ `interviewDate` set ∧ `interviewDate <= today`; counter emitted once after the loop (mirrors `interview-schedule`) | `{ type: "interview-close", count }` |
| `evaluation-closed` | Evaluee | status `Closed` ∧ `employeeID === userID` ∧ `closure.closedAt` within **14 days** of `today` (constant `CLOSED_NOTICE_WINDOW_DAYS = 14` in the resolver) | `{ type: "evaluation-closed", evaluationID, closedAt }` |

Behavior change riding along: **`interview-scheduled` (self + manager) is emitted only while `interviewDate >= today`** — after the meeting date the notice is stale and the Supervisor's `interview-close` aggregate takes over. Existing test negatives ("Closed emits nothing") are updated: `Closed` now emits exactly the evaluee notice within its window.

Client (`computedTasks` in `competence-user-interface.js`): `interview-close` → tone warn, deep-link `action: "schedule"` (Interview Schedule); `evaluation-closed` → tone success, deep-link to `my-results`. New label keys under `interface.dashboard.task-*`.

`#loadDashboard` context: no new ctx predicates needed — both new tasks derive from evaluation fields alone (`interviewDate`, `closure.closedAt`, `status`, `today`, `isSupervisor`).

## 7. UI

### 7.1 Interview Schedule hub (`frame-interview-schedule.html` + `configureInterviewSchedule`)

- **Per-row status chip:** "Awaiting interview" (no date) / "Interview held — outcome pending" (`interviewHeld`, no outcome) / "Ready to close" (`interviewHeld` + outcome recorded).
- **Record outcome** button (`x-show`: `canRecordOutcome`) toggles an inline expandable panel below the row (same expansion pattern as the slot picker; only one panel open at a time):
  - feedback textarea (`@ti-input` binding),
  - goals editor — list rows of text input + optional target-date input, add/remove buttons, a "n / 5" cap counter driven by `numberOfNextPeriodGoals` from the config payload,
  - PIP checkbox revealing the plan textarea; when the row's threshold interpretation is `T1`, a hint line suggests a PIP is expected,
  - **Save outcome** button → POST `save-interview-outcome`, then refresh.
- **Close evaluation** button (`x-show`: the existing `canSchedule` Supervisor flag; `x-bind:disabled` until the row's `canClose`) opens a confirm modal (employee name, final score + threshold, goals count, PIP flag) → POST `close-evaluation`, then refresh; the row disappears.
- All Alpine CSP rules observed: no inline `style`, no `?.` in template expressions, helpers on the component, labels via `x-text-label`/`getLabel`.

### 7.2 Scores screen (`frame-competence-evaluation.html`, my-results mode)

New **closure section**, rendered when the payload carries `closure` (i.e. status `Closed`): interview-feedback card, goals list (text + target date), PIP notice (visible flag + plan text). Sits after the strengths/development-areas band. Bilingual labels; no charts.

### 7.3 Cycles screen

The close-cycle modal gains a warning block: "N evaluations are not yet closed (a open / b in review / c ready)" from the extended `#loadCycleList` payload, and requires the existing explicit confirmation. Copy in `interface.cycles.close-modal-*`.

### 7.4 Status surfaces

- Client `getStatusPillTone()` gains the `Closed` → muted/neutral branch (today it maps only Open/In Review/Ready). The milestone track already handles `Closed` (step index 3).
- The server-side "next relevant date" projection (its inline copies in `#loadEmployeeList`, the dashboard projection, and the employee-management detail) gains a `Closed` branch: no next date (render "—"); the employees-list row shows the closed state via the status pill.

## 8. Analytics — deliberately untouched

`Closed` already counts as "reported" in every report; coverage's `Closed` bucket and the snapshot's `cohort.nClosed` simply become meaningful. The R2 "held" proxy (`interviewDate <= today`) is unchanged — closure's preconditions now guarantee the proxy is truthful for `Closed` rows. Switching R2 to a `closedAt`-based signal is flagged as future work (§12). Snapshot `schemaVersion` stays 2.

## 9. Localization (`bin/localization/competence-labels.json`, en + bg)

New keys (all `{ en, bg }` leaves):

- `interface.schedule.outcome-*` — panel title, feedback/goals/PIP labels, cap counter, add/remove-goal, save button, the three status chips, close button, close-modal copy, T1 PIP hint.
- `interface.evaluation.results.closure-*` — Scores closure section heading, feedback/goals/PIP card titles, target-date label, closed-on line.
- `interface.dashboard.task-interview-close`, `task-interview-close-sub`, `task-evaluation-closed`, `task-evaluation-closed-sub`.
- `interface.cycles.close-modal-pending` (count warning line).
- `error.evaluation.outcome-not-ready`, `too-many-goals`, `invalid-goal`, `close-not-ready`, `close-no-interview`, `close-interview-not-held`, `close-no-outcome`, `outcome-not-authorized`.

BG strings drafted alongside EN (native review pass remains a standing follow-up, as with the rest of the label file).

## 10. Testing (`node --test`)

- **`test/competence-framework.closure.test.js`** (new): `recordInterviewOutcome` — status gate, goals cap, invalid goal text/date, pip normalization, shape-normalization on legacy records; `closeEvaluation` — each precondition rejection (not-ready / no-interview / future-interview / no-outcome), success path (status, `closedAt`, `closedBy`, audit entry contents), idempotence rejection (closing a `Closed` evaluation fails).
- **`test/task-resolver.test.js`** (extended): new describes "TaskResolver — interview-close (supervisor aggregate)" and "TaskResolver — evaluation-closed (evaluee notice)" using the existing `evaluation()`/`ctx()` builders — happy-path `deepEqual`, non-supervisor negative, window-expiry negative (day 15), and the `interview-scheduled` past-date suppression change with updated `Closed` negatives.
- **`test:json`**: `evaluation.schema.json` additions validated; seeds (empty evaluations) unaffected.
- Full competence suite + ESLint must stay green; handler-layer logic stays thin (no HTTP test harness exists) and is exercised through the framework/resolver units.

## 11. Versioning & tracking

- **competence `3.10.0 → 3.11.0`** — `feat(competence)`; commits bundled thematically (data model + framework, services + tasks, UI + labels, docs), each referencing **CA-78**. No web-framework changes required.
- `CHANGELOG.md` version section cites this doc (`design/interview-closure.md`).
- **README updates:** Step 8 section rewritten as implemented (writers union, preconditions, split visibility); status-lifecycle footnote (`CLOSED*` planned-marker) removed; stale "maximum implemented status is `READY`" line corrected; data-visibility table row for manager grades corrected (revealed at Ready; closure artifacts at Closed); Current Status list + sequence diagram updated; Interview Schedule screen description extended; `numberOfNextPeriodGoals` loses its *(planned feature)* marker; new `closure` fields noted in the Data bullets.
- YouTrack: CA-78 `State`/`Stage` transitions + work-time logged; this doc mirrored to the KB per convention.

## 12. Out of scope (future)

- Goal carry-forward tracking into the next cycle's evaluation (review of previous goals at the next appraisal).
- Switching the R2 "held" proxy to `closedAt` / an explicit interview-held signal in analytics + snapshot (would need `schemaVersion` 3).
- PIP document attachments or external references; PIP follow-up workflow.
- Reopen/undo of a closed evaluation.
- Surfacing the evaluation-scoped audit trail in the UI (standing deferral from the team-feedback work).
- Adopting or removing the dead `workflow.currentStep` field.
- Scheduled auto-advance / deadline-driven transitions (standing deferral).

---

## Implementation log

*(to be filled during implementation — dated entries per checkpoint, with commit SHAs and verification evidence)*
