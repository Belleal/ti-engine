# Deadline Governance & Manual Stall Recovery

## Meta

- **Status:** Implemented (2026-07-15)
- **Date:** 2026-07-14
- **Package:** `competence`
- **Scope:** Makes the evaluation process run to completion instead of stalling. Populates the self/manager evaluation deadlines (dead since creation), activating the existing late-submit guards; renormalizes the final score to the participating grade sources on the server (matching the client, and fixing the latent no-team depression); adds manual, reason-justified, audited stall-recovery actions for the self and manager rounds; adds a Supervisor-only cancel/withdraw path so a mistaken or permanently-stalled evaluation can be removed; surfaces overdue stages as dashboard tasks; and introduces a Supervisor **Evaluations Oversight** screen as the cockpit for these actions. No scheduler, no notification channel, no automatic skipping of any human judgement.
- **Owner:** Boris Kostadinov
- **Related:** [[interview-closure]] (CA-78 — the finalize→audit pattern this reuses, and the Step-8 completion this builds past), [[dashboard-team-feedback-tasks]] (the evaluation-scoped audit subsystem + `finalizeTeamFeedback`, the template for the new escapes), [[dashboard-interview-tasks]] (task-resolver seam), `design/completed/statistics-and-results.md` (CA-61 — the analytics whose `#sourceWeight` must stay consistent with the score renormalization)
- **Tracking:** [CA-59](https://belleal.youtrack.cloud/issue/CA-59) "Enforce self/manager evaluation deadlines" (expanded) — subtask of CA-7 "Evaluation Workflow"; relates to CA-1 "Dashboard & Tasks"

## 1. Context & problem

The appraisal workflow is functionally complete through Step 8 (interview outcome + formal closure, shipped 3.11.0). But "complete" only holds on the happy path where every actor submits. The process has **three unrecoverable stalls**, all upstream of the interview step, and they share one code root.

- **Self-eval never submitted → `OPEN` forever.** `selfEvaluationCompleted` is written only by the evaluatee (`competence-web-application.js` self-submit branch). `OPEN → IN_REVIEW` requires it (submit handler ~`:735`), and `finalizeTeamFeedback` explicitly parks the evaluation at `"Open (awaiting self)"` when self is not done (`competence-framework.js:360-365`). If the employee leaves, is on long leave, or refuses, there is no proxy, skip, or override — the evaluation can never advance.
- **Manager never submits → `IN_REVIEW` forever.** `IN_REVIEW → READY` happens only on manager submit (`competence-web-application.js:727`), gated by `#canManagerPerformEvaluation` = `isSuperiorManagerOfEmployee` (org-line only). There is no manager-stage equivalent of `finalizeTeamFeedback`, and a bare Supervisor (e.g. HR, out of the reporting line) cannot act.
- **A mistaken or stalled evaluation bricks the employee's whole cycle.** `DELETED` is defined in the status enum and handled read-side (`data-manager.js` filters it out of fetches) but **no code path ever writes it** — there is no cancel/withdraw service. Because `start-evaluation` rejects with `error.evaluation.active-evaluation-exists` (409) when the employee has any `OPEN`/`IN_REVIEW`/`READY` evaluation (`competence-web-application.js:1159-1168`), a bad record cannot be removed and no replacement can be started.

**The code root of the first two stalls:** `workflow.selfEvaluationDeadline` and `workflow.managerEvaluationDeadline` are hard-coded to `""` in `createNewEvaluation` (`competence-framework.js:540,542`) and **never populated anywhere** (grep confirms the only other occurrences are a test fixture). Only `teamEvaluationDeadline` is wired (`:546`, from `cycle.teamFeedbackDeadline`). Consequently the four late-submit guards that read those fields (`competence-web-application.js:642,711,804,819`, each guarded `if ( deadline && today > deadline )`) are **dead code** — they can never fire. So the self and manager rounds have no enforced deadline and no deadline-driven recourse.

**Adjacent scoring defect.** `calculateFinalEvaluationScores` (`competence-framework.js:603-673`) applies **fixed** weights (self 0.20 / team 0.30 / manager 0.50) and treats a non-participating source as a plain zero — it does **not** renormalize to the sources that actually graded. Only the *client* reweights to participating sources for the score bar (`competence-user-interface.js:832-835`). So a source that never participates silently depresses the stored `finalScore` and its threshold label by up to its weight. This already affects **no-team** evaluations (the 0.30 team weight applied to zero), and it is precisely why "skip self" cannot be decided without a scoring rule.

`README.md:171` already flags the fix direction: *"Automatic deadline-based transitions are planned for a future release."*

## 2. Locked decisions

1. **Deadlines reuse existing cycle dates** — no new config, no new cycle fields, no Cycle Setup UI. `managerEvaluationDeadline = cycle.cycleDate` (already defined as the manager-review deadline); `selfEvaluationDeadline = cycle.teamFeedbackDeadline || cycle.cycleDate` (self and team are the parallel grading round). Both snapshot onto the evaluation at creation, exactly as `teamEvaluationDeadline` does today.
2. **No scheduler, no auto-skip.** Nothing advances on the passage of time. Every advance that involves human judgement stays a manual action. Overdue visibility is pull-based (dashboard tasks). A background sweep, a notification channel, and any automatic skipping of a person's assessment are explicitly **out of scope** (§12).
3. **Self stall recovery is a manual Supervisor action, reason ALWAYS required, audited.** Waiving the employee's own self-assessment is a human decision with HR / EU-AI-Act sensitivity, so it is never automatic and never unattended, and the justification is recorded on the evaluation's audit trail.
4. **Manager stall recovery is proxy-completion, not skipping.** An authorized person enters the manager grades so the dominant (50%) component still participates. An **org-line superior manager** already may do this and continues to do so **without any extra input** (legitimate line authority). A **Supervisor** (who may be HR, outside the reporting line) may now also do it, but **must enter a reason/justification**, which is audited. Crucially, the manager deadline is **not** a hard block: a late manager submit is never rejected (blocking the decisive 50% input would only create a new stall) — the deadline drives the `overdue-manager` nudge and enables the proxy. Only the **self** round hard-blocks late input, with the Supervisor waive (`finalizeSelfEvaluation`) as its escape.
5. **Scoring renormalizes to participating sources on the server**, matching the client. A source participates iff it contributed at least one grade. This fixes both the skipped-self case and the pre-existing no-team depression. The change is **forward-only** (already-stored scores and per-cycle snapshots are not recomputed).
6. **Cancel/withdraw → `DELETED` is Supervisor-only, reason required**, permitted from `OPEN`/`IN_REVIEW`/`READY` (never `CLOSED`), releases any booked interview slot, and is irreversible (no un-delete in scope).
7. **Overdue stages surface as dashboard tasks only** (`overdue-self`, `overdue-manager`) — pure, derived in `task-resolver.js`, no persistence, no cron.
8. **A new Supervisor-gated "Evaluations Oversight" screen** is the cockpit for the three recovery actions. Manager proxy-completion is additionally reachable from the evaluation form (a Supervisor edits manager grades and confirms a reason on submit).
9. **Reasons live in the evaluation audit trail** via `appendAuditEntry` (the `finalizeTeamFeedback` pattern) — **no new persistent fields** on the evaluation record for the justifications.

## 3. Data model

- **Populate the deadlines** in `createNewEvaluation` (`competence-framework.js:537-549`): replace `selfEvaluationDeadline: ""` and `managerEvaluationDeadline: ""` with the decision-§2.1 cycle-derived values, mirroring the existing `teamEvaluationDeadline` line (`:546`) including its legacy fallback to `cycle.cycleDate`.
- **No schema change required.** `DELETED` is already a member of the `EvaluationStatus` enum (`configuration-loader.js`) and is handled read-side (`data-manager.js` fetch filters). Justification reasons are recorded as audit entries, not evaluation fields.
- **Migration — one-time startup backfill, not a read-time fallback.** Evaluations created before this change carry `""` deadlines, and the code reads the raw `workflow.selfEvaluationDeadline`/`managerEvaluationDeadline` everywhere (the guards, the finalize preconditions, the overdue tasks) — an empty string is simply falsy, so a legacy `OPEN`/`IN_REVIEW` record would never be deadline-enforced or surface as overdue if left as-is. Rather than adding a read-time fallback at every one of those consumption sites, `CompetenceFramework.backfillMissingEvaluationDeadlines()` is invoked once at service start (`bin/competence-web-server.js` `onStart`, after data-manager init) and *writes* the missing deadlines onto every legacy `OPEN`/`IN_REVIEW` evaluation, resolving each one's cycle and deriving `selfEvaluationDeadline`/`managerEvaluationDeadline` exactly as `createNewEvaluation` does. It fills only an empty field — a populated deadline is never overwritten — so it is idempotent and safe to run on every restart; `CLOSED`/`DELETED` evaluations are never touched, an evaluation whose cycle cannot be resolved is left alone (logged at DEBUG), and no audit entries are written (a system migration, not a user action). Once it has run, every existing consumer works unchanged on legacy evaluations too — no read-time fallback was needed after all. A stalled legacy evaluation that still cannot be recovered by the backfill (e.g. an unresolvable cycle) remains recoverable the ordinary way — Supervisor `withdrawEvaluation` + a fresh `start-evaluation`.

## 4. Scoring — participating-source renormalization

`calculateFinalEvaluationScores` currently computes, per category:

```
category_score = ceil( ( self/max·0.20 + team/max·0.30 + manager/max·0.50 ) · 100 )
```

with the weights fixed regardless of which sources graded. Change it to divide by the **sum of the participating weights**:

```
participating = { s ∈ {self,team,manager} : s graded ≥ 1 competency in this evaluation }
W             = Σ ( weight[s] for s ∈ participating )
category_score = ceil( ( Σ ( (source_s/max)·weight[s] for s ∈ participating ) / W ) · 100 )
```

- **Participation rule.** A source participates iff its completion flag is set — `selfEvaluationCompleted` / `teamEvaluationCompleted` / `managerEvaluationCompleted`. The manager-submit flow sets `managerEvaluationCompleted` before invoking scoring, so all three flags are accurate at scoring time. This is **non-destructive and needs no schema change**: a **waived** self round (§5 `finalizeSelfEvaluation`) simply leaves `selfEvaluationCompleted` false, so self is excluded — residual draft self-grades, if any, never count. A no-team evaluation leaves `teamEvaluationCompleted` false, so team is excluded (matching the client's participation test at `competence-user-interface.js:764-786`).
- **Implementation note.** Confirm `teamEvaluationCompleted` is set exactly when team grades should count (true after all peers submit or after `finalizeTeamFeedback`; false when no team was requested) so the flag-based rule matches the intended participation; the client's grade-presence test is the cross-check.
- **Reference points hold.** All-R with any subset of sources now scores ~100 (T3), not a weight-depressed value; full participation is unchanged. The README "Reference Score Points" table stays correct and gains a note that it holds for whichever sources participated.
- **Forward-only.** Scores are computed at manager submit and stored; per-cycle `ResultsSnapshot`s are immutable. This change affects only evaluations scored after it ships. Do **not** recompute historical scores.
- **Analytics consistency.** `results-analytics.js` has its own `#sourceWeight` (`:521`) for cohort computations. Verify it already reweights to participating sources (its `"blended"` path); if it diverges from this rule, reconcile so the analytics blend and the stored `finalScore` agree. No snapshot `schemaVersion` bump is expected.

## 5. Framework methods (`application/competence-framework.js`)

**`finalizeSelfEvaluation( evaluationID, actorID, reason )`** — async, modelled on `finalizeTeamFeedback` (`:329-379`):

- Preconditions (all `E_APP_SERVICE_ERROR` / 422 with label-key details):
  - status is `OPEN` → `error.evaluation.self-finalize-not-open`
  - self deadline resolved (with §3 fallback) and `today > deadline` → `error.evaluation.self-finalize-deadline-not-reached`
  - self not already completed → `error.evaluation.self-finalize-already-complete`
  - `reason` is a non-empty trimmed string → `error.evaluation.reason-required`
- Effect: set `workflow.selfEvaluationWaived = true` (persisted, optional schema field; a repeat waiver is then rejected) and leave `selfEvaluationCompleted` **false**. Scoring (§4) keys on `selfEvaluationCompleted`, so the waived self stays excluded; the separate `selfEvaluationWaived` flag **satisfies the `OPEN→IN_REVIEW` transition** — both `#submitEvaluation` and `finalizeTeamFeedback` treat `selfEvaluationCompleted || selfEvaluationWaived` — so a later team completion advances the evaluation rather than re-stalling it. Advance to `IN_REVIEW` **iff** the team round is done (`teamEvaluationCompleted` or no team was requested), otherwise hold `OPEN` (symmetric to `finalizeTeamFeedback`'s awaiting-self hold, with `newValueLabel = "In Review"` or `"Open (awaiting team)"`). *(The `selfEvaluationWaived` marker reverses this doc's original "no marker field" choice — see the CodeRabbit review-round log entry below.)*
- Persist via `dataManager.instance.saveEvaluation`, then `appendAuditEntry({ subjectType: "evaluation", subjectID, changedBy: actorID, field: "workflow.selfEvaluation", oldValue: "pending", newValue: "waived → " + <status label>, reason })`. Returns the saved evaluation. Does **not** compute scores (those run at manager submit as today, where the §4 renormalization excludes the waived self).

**`withdrawEvaluation( evaluationID, actorID, reason )`** — async:

- Preconditions (422): status ∈ {`OPEN`,`IN_REVIEW`,`READY`} → `error.evaluation.withdraw-not-active`; `reason` non-empty → `error.evaluation.reason-required`.
- Effect: if a booked interview slot references this evaluation, release it (reuse the `#cancelInterviewBooking` slot-release logic — set `slot.status = available`, clear the `booking`, clear `evaluation.interviewDate`); set `status = DELETED`.
- Persist, then `appendAuditEntry({ subjectType: "evaluation", subjectID, changedBy: actorID, field: "status", oldValue: <prior>, newValue: "Deleted", reason })`. Returns `{ evaluationID, status }`. The withdrawn record then drops out of all fetches (read-side `DELETED` filter), so `start-evaluation` immediately permits a fresh evaluation for that employee.

**Manager proxy-completion needs no new framework method** — it reuses `updateManagerEvaluationGrades` + `calculateFinalEvaluationScores` on the normal manager-submit path. The change is authorization + reason capture at the service layer (§6).

## 6. Services & authorization (`bin/competence-web-application.js`)

**New service `advance-self-evaluation` → `#advanceSelfEvaluation( session, { evaluationID, reason } )`**
- Gate: `#requireRole(session, SUPERVISOR)`. Delegates to `competenceFramework.instance.finalizeSelfEvaluation(evaluationID, userID, reason)`. Returns the anonymized saved evaluation (or a compact `{ evaluationID, status }`).

**New service `withdraw-evaluation` → `#withdrawEvaluation( session, { evaluationID, reason } )`**
- Gate: `#requireRole(session, SUPERVISOR)`. Delegates to `competenceFramework.instance.withdrawEvaluation(evaluationID, userID, reason)`. Returns `{ evaluationID, status }`.

**New service `load-evaluations-oversight` → `#loadEvaluationsOversight( session )`**
- Gate: `#requireRole(session, SUPERVISOR)`. Returns the active cycle's non-closed, non-deleted evaluations, each row carrying: employee name + org unit, `status`, the three deadlines, `selfOverdue`/`managerOverdue` flags (deadline passed and that round incomplete), whether a booked interview exists, and per-row action flags (`canAdvanceSelf`, `canCompleteManager`, `canWithdraw`). Employee names via `organizationManager`, consistent with `#loadInterviewSchedule`.

**Manager proxy authorization** — extend `#canManagerPerformEvaluation( userID, employeeID )` (used at `:630,:792,:906,:1142`) so the manager-grade save/submit path additionally admits a **Supervisor**:
- Org-line superior (`isSuperiorManagerOfEmployee`) — unchanged, **no reason** required.
- Supervisor (holds `SUPERVISOR`, not an org-line superior of the employee) — permitted, but the **manager submit** requires a non-empty `reason` (`error.evaluation.reason-required`) and writes `appendAuditEntry({ subjectType: "evaluation", subjectID, changedBy: userID, field: "grades.managerProxy", newValue: { by: "supervisor" }, reason })`. **The manager deadline is not a hard block:** unlike the self round, a past-deadline manager submit is never rejected — the manager grade is the decisive 50% input and blocking it would only create a new stall. Populating `managerEvaluationDeadline` drives the `overdue-manager` nudge and enables this proxy path, but the existing manager late-submit guards in `#submitEvaluation` (`:711`) and `#saveEvaluationDraft` (`:819`) are **removed**, so the assigned manager and any org-line superior can always complete. Only the **self** round is hard-enforced (late self submit/draft rejected), with `finalizeSelfEvaluation` as its Supervisor escape.

**Reason validation** is centralized in one helper (`#requireReason(reason)`), reused by all three reason-bearing paths.

## 7. Dashboard tasks (`application/task-resolver.js` — pure, unit-tested)

Two new Supervisor-facing tasks, derived from evaluation fields alone (no new ctx predicates beyond `isSupervisor` and `today`, both already available):

| Task | Audience | Condition | Shape |
|---|---|---|---|
| `overdue-self` | Supervisor (aggregate) | status `OPEN` ∧ self deadline set ∧ `today > deadline` ∧ ¬`selfEvaluationCompleted` | `{ type: "overdue-self", count }` |
| `overdue-manager` | Supervisor (aggregate) | status `IN_REVIEW` ∧ manager deadline set ∧ `today > deadline` ∧ ¬`managerEvaluationCompleted` | `{ type: "overdue-manager", count }` |

Both emit a single aggregate counter after the loop (mirroring `interview-schedule`/`interview-close`) and deep-link to the Evaluations Oversight screen (`action: "oversight"`). The existing `team-finalize` task is unchanged. New label keys `interface.dashboard.task-overdue-self` / `-manager` (+ `-sub`), en + bg.

## 8. UI

### 8.1 Evaluations Oversight screen (new)

`bin/static/fragments/frame-evaluations-oversight.html` + a `configureEvaluationsOversight` Alpine component in `competence-user-interface.js` + a route, registered via `addFragment("evaluations-oversight", { …, roles: [ SUPERVISOR ] })` (the web-framework fragment gate rejects other roles with 403), plus a Supervisor-only sidebar entry.

- A table of the active cycle's active evaluations: employee, org unit, status chip, the self/team/manager deadlines with an **overdue** badge where applicable, and interview state.
- Per-row actions, each gated by the row's action flags:
  - **Advance without self** (`canAdvanceSelf`: `OPEN`, self overdue, self incomplete) → opens the shared **reason modal** → `advance-self-evaluation` → refresh.
  - **Complete manager review** (`canCompleteManager`: `IN_REVIEW`, manager incomplete) → navigates to the evaluation form in manager-grading mode for that evaluation.
  - **Withdraw** (`canWithdraw`: any active status) → shared **reason modal** (with an explicit "this cannot be undone; a booked interview will be released" warning) → `withdraw-evaluation` → refresh; the row disappears.
- All Alpine CSP rules observed: no inline `style`, no `?.` in template expressions, helpers on the component, labels via the `text-label` directive / `getLabel`.

### 8.2 Reason modal (shared)

A single reusable confirm-with-reason modal (title, contextual body, required textarea, confirm/cancel), driven by the component; confirm is disabled until the reason is non-empty. Reused by advance-self, withdraw, and the Supervisor manager-proxy submit.

### 8.3 Evaluation form — Supervisor manager proxy

When a Supervisor opens an `IN_REVIEW` evaluation they do not manage, the manager-grade inputs are editable (backed by the §6 authz change), and **Submit** raises the reason modal before calling `submit-evaluation`. The employee/manager grading UX is otherwise unchanged. (Org-line superiors keep submitting with no reason.)

### 8.4 Status surfaces

`DELETED` evaluations are filtered out server-side, so they simply vanish from the employees list, dashboard, and oversight table — no new pill needed. The existing `getStatusPillTone()` already covers the active statuses. No milestone-track change.

## 9. Localization (`bin/localization/competence-labels.json`, en + bg)

New `{ en, bg }` keys: `interface.oversight.*` (screen title, intro, column headers, the three action buttons, overdue badge, empty state); `interface.oversight.reason-modal-*` (title, prompt, confirm/cancel, withdraw warning); `interface.dashboard.task-overdue-self` / `-manager` (+ `-sub`); and the error keys `error.evaluation.self-finalize-not-open`, `self-finalize-deadline-not-reached`, `self-finalize-already-complete`, `withdraw-not-active`, `reason-required`. BG drafted alongside EN (native review remains the standing follow-up).

## 10. Testing (`node --test`)

- **`test/competence-framework.finalize.test.js`** (extend): `finalizeSelfEvaluation` — each precondition rejection (not-open / deadline-not-reached / already-complete / missing-reason), success advancing to `IN_REVIEW` when team done, holding `OPEN` when team pending, and the audit entry contents (incl. `reason`).
- **`test/competence-framework.closure.test.js`** or a new `withdraw` suite: `withdrawEvaluation` — precondition rejections, success from each of `OPEN`/`IN_REVIEW`/`READY`, booked-slot release, `DELETED` status + audit entry, and that a withdrawn evaluation no longer blocks a new `start-evaluation`.
- **Scoring matrix** (extend the framework scoring tests): renormalization for full participation (unchanged ~100 all-R), no-team, waived-self, and self+team only — assert the reweighted `finalScore` and interpretation, and that a waived self contributes nothing.
- **`test/task-resolver.test.js`** (extend): `overdue-self` and `overdue-manager` — happy-path `deepEqual`, non-supervisor negative, not-yet-overdue negative, and completed-round negative.
- **Authorization:** a Supervisor manager-proxy submit requires a reason; an org-line superior does not; a non-authorized manager is still rejected. Exercised through the framework/handler seams (no HTTP harness exists).
- Full competence suite + `test:json` + `npx eslint .` stay green.

## 11. Versioning & tracking

- **competence `3.11.1 → 3.12.0`** — `feat(competence)`; commits bundled thematically (deadlines + scoring renormalization; framework escapes + services/authz; oversight screen + reason modal + tasks; labels; docs/version), each referencing **CA-59**. No `core`/`web-framework` changes required.
- `CHANGELOG.md` `## Version 3.12.0` entry cites this doc.
- **README updates:** Status-lifecycle note (`README.md:171`) rewritten from "planned" to the shipped deadline governance; Step 3/6 note the deadline enforcement and the manual recovery; a new "Evaluations Oversight" screen entry; the Scoring Algorithm "Reference Score Points" note clarified for participating sources; the Data Visibility / process narrative touched only as needed. (The broader README + skill reconciliation for 3.11.0/3.11.1 drift is tracked separately from this feature.)
- YouTrack: **CA-59** expanded per this doc (scope note added), `State`/`Stage` transitions + work-time logged; this doc mirrored to the KB per convention. Consider splitting the cancel/withdraw path (§5 `withdrawEvaluation`, Piece C) into its own `subtask of` CA-7 if it is delivered independently.

## 12. Out of scope (future)

- **Scheduled / deadline-driven auto-advance** and any background sweep — deliberately excluded (decision §2.2). All advances stay manual.
- **A push / email notification channel** — dashboard tasks remain the notification model (per [[interview-closure]] §2.9).
- **Dedicated self/manager deadline configuration** (`selfEvaluationWindowDays` / `managerEvaluationWindowDays`) and Cycle Setup editors for them — deferred in favor of reusing existing cycle dates (decision §2.1). Revisit if independently-tunable windows are needed.
- **Reopen / un-delete** of a `DELETED` or `CLOSED` evaluation — withdrawal is irreversible, mirroring closure.
- **Surfacing the evaluation-scoped audit trail in the UI** (CA-56) — the reasons recorded here make this more valuable, but it stays its own card.
- **Goal carry-forward, PIP attachments, `workflow.currentStep` retirement, and `closedAt`-based analytics** — unchanged standing deferrals from [[interview-closure]] §12.

---

## Implementation log

### 2026-07-15 — Shipped as competence `3.12.0`

Implemented end-to-end per this design, in thematically-bundled commits `5665d66..b6a5220` on branch `current` (base commit `5665d66`, the CA-59 implementation-plan doc-consistency fix), plus this docs/version commit:

- **T1–T2 (deadlines + scoring):** `fc57611` populates `workflow.selfEvaluationDeadline` / `managerEvaluationDeadline` at `createNewEvaluation` from the cycle's dates, with a read-time legacy fallback; `773e517` renormalizes `calculateFinalEvaluationScores` to the participating grade sources (`selfEvaluationCompleted` / `teamEvaluationCompleted` / `managerEvaluationCompleted`), fixing the no-team depression and excluding a waived self round.
- **T3–T6 (framework escapes + services + manager-proxy authz):** `5b878b3` adds `finalizeSelfEvaluation`; `b981fa7` adds `withdrawEvaluation` (→ `Deleted`, releases any booked interview slot); `76544ad` adds the `advance-self-evaluation` / `withdraw-evaluation` services (Supervisor-gated); `8981ec6` extends `#canManagerPerformEvaluation`'s callers so a Supervisor may proxy-complete the manager round (reason required, audited as `grades.managerProxy`) and drops the manager-round late-submit/draft guards (the deadline is a nudge, not a block); `50efe97` fixes the evaluation-form load side so the manager grade inputs are actually editable for a proxying Supervisor.
- **T7–T8 (overdue tasks + oversight loader):** `9f14984` adds the `overdue-self` / `overdue-manager` Supervisor aggregate dashboard tasks to `task-resolver.js`; `727eb53` adds the `load-evaluations-oversight` service backing the new screen.
- **T9–T10 (Oversight screen + client task wiring):** `629fc1a` adds the Evaluations Oversight screen (fragment + `configureEvaluationsOversight` Alpine component + route, `roles: [SUPERVISOR]`); `209cfca` wires the dashboard's client-side `overdue-self` / `overdue-manager` task-card cases and the `oversight` deep-link action.
- **T11 (labels):** `7d6d68e` adds the `interface.oversight.*`, `interface.dashboard.task-overdue-self(-manager)(-sub)`, and `error.evaluation.{self-finalize-not-open,self-finalize-deadline-not-reached,self-finalize-already-complete,withdraw-not-active,reason-required}` label keys, en + bg (bg pending native review).
- **T13 (eval-form manager-proxy reason capture, design §8.3 gap):** `b6a5220` adds the `isManagerProxy` state + the submit-confirmation modal's reason section, closing the loop between the Oversight screen's "Complete manager review" action and the Supervisor-proxy submit authorization added in T6.
- **T12 (this commit — docs + version):** README (`Evaluation Status Lifecycle` note, Steps 3/6, `Current Status`, a new `Evaluations Oversight` screen entry, and the `Scoring Algorithm` renormalization + `Reference Score Points` note, with the `results-analytics.js` `#sourceWeight` reconciliation flagged as a tracked follow-up per §4), `CHANGELOG.md` `## Version 3.12.0`, `package.json` version bump, and a `task-resolver.js` JSDoc extension (`OverdueSelfTask` / `OverdueManagerTask` typedefs + `resolveTasks` `@returns`, a deferred Minor from T7 — no runtime change).

**Verification:** `npm test` 334/334, `npm run test:json` 19/19, `npx eslint .` 0 errors (2 pre-existing warnings, unrelated to this feature, noted in Task 1's and an unrelated results-analytics test's self-review), `node --check application/task-resolver.js` OK. Per-task reviews (see `.superpowers/sdd/task-*-report.md`) all returned spec-OK/quality-approved; browser verification of the UI-only tasks (T9, T10, T13) is flagged PENDING in their reports — no dev server/Redis was available in the implementation environment.

**Deviations from this doc:** none substantive. `finalizeSelfEvaluation` reads the pending-state audit label as `"waived → " + newValueLabel` rather than a fixed string, to distinguish an immediate advance to `In Review` from a hold at `"Open (awaiting team)"` — an implementation refinement of the same audited-escape shape described in §5, not a behavior change.

**Open follow-ups (unchanged from §12, plus one raised during T2's review):** the scheduler/auto-advance, notification channel, reopen/undo, and audit-trail UI items remain out of scope as designed. Additionally, `results-analytics.js`'s `#sourceWeight` "blended" path does not yet renormalize to participating sources the way the per-evaluation score now does (§4 "Analytics consistency"); a no-team or waived-self evaluation's cohort-level blended figure can therefore diverge from that evaluation's own `finalScore`. This is now called out in the README and tracked as a follow-up, not fixed in this feature.

### 2026-07-15 — Correction: forward-only deadline migration (docs fix, no framework-logic change)

The `CHANGELOG.md` `## Version 3.12.0` entry and this doc's §3 "Migration" bullet previously claimed legacy (pre-deploy, empty-deadline) evaluations "fall back to the same cycle dates at read time." That fallback was never implemented — `competence-framework.js` and `competence-web-application.js` read the raw `workflow.selfEvaluationDeadline`/`managerEvaluationDeadline` at every consumption site, with no cycle-derived substitution when the stored value is `""`. Both documents are corrected to state the actual, forward-only behavior: pre-existing in-flight evaluations retain empty deadlines and are therefore never deadline-enforced or surfaced as overdue; the manual `withdrawEvaluation` + restart path (already shipped, §5/§6) is the recovery route for a stalled legacy record. A read-time fallback/backfill for legacy evaluations remains a tracked follow-up, now called out explicitly rather than assumed shipped.

### 2026-07-15 — Legacy deadline backfill implemented (CA-59 follow-up, folded into the branch as Task 14)

The read-time-fallback/backfill deferral raised by the correction above is now closed, by the write-time approach rather than a read-time one: `CompetenceFramework.backfillMissingEvaluationDeadlines()` (`application/competence-framework.js`) is a new, idempotent, re-runnable framework method — fetches every non-deleted evaluation (`dataManager.instance.fetchEvaluations(null, false)`), keeps only `OPEN`/`IN_REVIEW` ones, and for any whose `workflow.selfEvaluationDeadline`/`managerEvaluationDeadline` is still empty, resolves its cycle (`dataManager.instance.getCycle(cycleID)`, memoized per cycle within a single run) and fills **only** the empty field(s) with the same values `createNewEvaluation` would have written (`selfEvaluationDeadline = cycle.teamFeedbackDeadline || cycle.cycleDate || ""`; `managerEvaluationDeadline = cycle.cycleDate || ""`), then persists via `dataManager.instance.saveEvaluation`. An already-populated deadline is never overwritten (idempotent — a second run updates nothing), `CLOSED`/`DELETED` evaluations are never considered, and an evaluation whose cycle cannot be resolved is left untouched with a DEBUG log line rather than failing the run. No audit entries are written (a system migration, not a user action); a single NOTICE-level summary log (`{ scanned, updated }`) is emitted instead. Wired into `bin/competence-web-server.js` `onStart`, invoked once after `configurationLoader.initialize()` (the last step of the existing init chain) so it participates in the same top-level `.catch` as the rest of startup.

This supersedes §3's "Migration" bullet above, which is rewritten in place (rather than left as a second correction) to describe the backfill as shipped — the "forward-only, no read-time fallback" framing was accurate at the time it was written but is now superseded. Every existing consumer of the deadline fields (the self/manager late-submit guards, `finalizeSelfEvaluation`'s deadline precondition, the `overdue-self`/`overdue-manager` dashboard tasks, and Oversight's `canAdvanceSelf` flag) required no changes — they already read `workflow.selfEvaluationDeadline`/`managerEvaluationDeadline` directly, and now find those fields populated on legacy evaluations too.

### 2026-07-15 — CodeRabbit review round (PR #91)

Addressed the automated review on the PR; three findings fixed, two declined with reasons (replied on-thread).

- **Zero-submission team round excluded from scoring** (`d97c558`): a team round finalized with zero submissions (`allowFinalizeTeamWithoutSubmissions`) is marked complete but carries no grades. `calculateFinalEvaluationScores` now requires `teamEvaluationsSubmitted > 0` for the team source to participate, so its 0.30 weight no longer depresses an all-R self/manager result to 70. Regression test added.
- **Enum constants in `task-resolver.js`** (`d97c558`): the `overdue-self`/`overdue-manager` status checks now use `configurationLoader.evaluationStatus.OPEN`/`.IN_REVIEW` rather than `"Open"`/`"In Review"` literals, matching the rest of the file.
- **README fenced-block language tag** (`d97c558`).
- **`selfEvaluationWaived` workflow flag** (this commit): reverses this doc's original "no marker field" choice (§4/§5). `finalizeSelfEvaluation` now persists `workflow.selfEvaluationWaived = true` (optional schema field; a repeat waiver is rejected), and both `OPEN→IN_REVIEW` transitions treat `selfEvaluationCompleted || selfEvaluationWaived`, so a self round waived while the team round is still pending advances on team completion instead of re-stalling. Scoring is unchanged (still keyed on `selfEvaluationCompleted`, so a waived self stays excluded). The `overdue-self` task and Oversight's `canAdvanceSelf` now also exclude waived rounds so the action does not re-nag. Tests added: repeat-waiver rejection, flag-set, no-re-stall advance, overdue exclusion.
- **Declined:** replace `x-model` (it is the established CSP-mode convention here — 40+ shipped uses; the CA-88 `@input` pattern was specific to getter/setter placeholder logic, not a CSP ban) and localize the modal close label (`aria-label="Close"` is hardcoded in every existing modal — a codebase-wide localization is a separate follow-up).

**Verification:** `npm test` 347/347, `npm run test:json` 19/19, `npx eslint .` 0 errors (1 pre-existing unrelated warning).

**Testing:** `test/competence-framework.backfill.test.js` (new) — fills both empty deadlines from the cycle's dates; falls back to `cycleDate` when the cycle has no `teamFeedbackDeadline`; does not overwrite an evaluation with already-set deadlines (including the "only one field empty" partial case); idempotent (second run updates 0); leaves `CLOSED` and `DELETED` evaluations untouched; and does not throw (leaves the evaluation alone) when its cycle cannot be resolved.

**Verification:** `npm test` 334 → 342/342 (334 + 8 new), `npm run test:json` 19/19, `npx eslint .` 0 errors, `node --check bin/competence-web-server.js` OK.
