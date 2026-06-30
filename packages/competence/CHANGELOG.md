# ti-engine competence package changelog

This document contains the list of changes made to the competence package. The format is based on the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

## Version 3.7.0

Leaner, more descriptive individual-results view on the evaluation screen, plus context-correctness fixes (CA-61). Requires web-framework ≥ 1.12.0 for the chart legend/value-label support.

* feat(competence): condense the evaluation results section into three lean bands — a full-width hero merging the final score with per-category score chips, the subcategory radar and source-comparison charts side by side, and strengths / development areas — replacing the seven stacked, unstyled cards (the `ti-card-title` headings had no CSS rule and rendered as oversized default `<h2>`s)
* feat(competence): make the results charts self-explanatory — legends + value labels on the source comparison, a legend (incl. the dashed expected curve) on the radar, a "what it shows" intro and a "How it's calculated" methodology disclosure per chart (en + bg)
* fix(competence): the final-score band name now resolves through `getLabel` instead of rendering the raw threshold label key (e.g. `framework.performance.threshold.name.T3`)
* fix(competence): the results panel header is now role-aware — a manager/team viewer sees "Results" / "…for {employee}" instead of the second-person "Your results"
* fix(competence): strengths and development areas now show the same signed deviation-vs-expected quantity (e.g. `+0.30` / `-0.43`) with semantic colour, instead of mixing absolute mean with gap
* fix(competence): the score bars now fill against the form's **true** ceiling — `ceil(S × Σ participating-source-weights × 100)` = 130 at full participation — instead of the arbitrary T5 band value (150); the maximum is derived from config and, because the score is a relevancy-normalised weighted average, is independent of family/competencies
* feat(competence): the results charts now use the same identity colours as the grading form — per-category score chips match the E/I/C letter-box colours, and the source charts (bars + radar) use the SELF/MANAGER/TEAM column colours (self=info, manager=accent, team=success); the radar's "expected" curve is a distinct dashed grey
* feat(competence): the subcategory-profile and source-comparison cards now stretch to equal height and centre their charts, removing the empty gap below the shorter card; each chart's legend now sits beneath the chart (not beside it) so it no longer steals horizontal space or clips
* feat(competence): the radar axis labels (E1…C3) are now coloured by category to match the letter boxes / score chips, and the radar strokes are thinned (≈half) for the denser nine-axis profile
* feat(competence): the self/manager/team comparison bars are thinned to ≈⅓ height with a smaller value caption, for a more compact three-source read
* feat(competence): the cross-cycle score-history trend now also appears for an authorized manager/supervisor viewing a finalized report (the endpoint already gates access), not only on "My results"
* build(release): bump package version from `3.6.2` to `3.7.0`

## Version 3.6.2

Post-review fixes from the CA-72 CodeRabbit review (PR #85): test-user backdoor hardening, interview-slot privacy scoping, Supervisor-revoke confirmation, and grant/revoke robustness.

* fix(competence): hard-gate the temporary `ti-test-user` cookie behind the off-by-default `COMPETENCE_TEST_USER_ENABLED` env flag — without it the cookie (which injects identity AND an optional numeric roles override) is ignored entirely, so it can no longer bypass org-derived/grant-based authorization in production (CA-72)
* fix(competence): scope the interview-schedule available-slots projection to the calling manager's own slots — a plain manager previously received every other manager's availability and names (only `readyEvaluations` was scoped); a Supervisor still sees the whole calendar (CA-72)
* fix(competence): require a confirmation modal before revoking a Supervisor grant, mirroring the assign flow, so a single misclick can no longer remove broad access (CA-72)
* fix(competence): guard the grant/revoke detail reloads against a mid-flight selection change so a slow response can no longer replace the now-selected employee's detail or misdirect a later save (CA-72)
* fix(competence): make the grant/revoke audit append best-effort — an audit-write failure is logged but no longer rejects an already-committed authorization change (CA-72)
* docs(competence): document `COMPETENCE_TEST_USER_ENABLED` in the README; note the single-instance grant-mirror assumption in code, with cross-instance invalidation tracked as CA-73 (CA-72)
* build(release): bump package version from `3.6.1` to `3.6.2`

## Version 3.6.1

Post-review fixes from the CA-71 CodeRabbit review: evaluation-data + interview-schedule access scoping, lock-cycle specialization-source consistency, and confirmation-modal focus management.

* fix(competence): scope the new-evaluation data endpoint to the evaluatee's manager (direct or skip-level) or a Supervisor, mirroring `start-evaluation` — a plain manager could previously load any employee's preview and eligible-reviewer roster (CA-71)
* fix(competence): scope the interview-schedule view — a Supervisor still sees every READY interview (the only role that books), but a plain manager now sees only their own reports instead of org-wide evaluatee names, manager names, and final scores (CA-71)
* fix(competence): `lockCycle` normalizes empty specializations from the same role-family source `validateCycleForLock` uses (the seeded copy, falling back to config) rather than static config via `getSpecializationCodes`, so a stored/config divergence can no longer persist unvalidated specializations or skip stored-only ones (CA-71)
* fix(competence): the submit and finalize-team confirmation modals now move keyboard focus into the dialog on open, trap Tab/Shift+Tab within it, and return focus to the triggering control on close (CA-71)
* test(competence): cover `lockCycle` normalization when the stored role-family source diverges from static config (CA-71)
* build(release): bump package version from `3.6.0` to `3.6.1`

## Version 3.6.0

Org-derived roles & Supervisor grant management (CA-72). Requires web-framework ≥ 1.11.0.

* feat(competence): derive EMPLOYEE/MANAGER/SUPERVISOR roles from org-chart position at login, replacing manual role injection (CA-72)
* feat(competence): auto-supervisors can assign/remove the Supervisor role from Employee Management; structural (auto) supervisors are immutable (CA-72)
* feat(competence): audited role-grants store (ti:competence:data:role-grants) with a synchronous in-memory mirror for login-time derivation (CA-72)
* build(release): bump package version from `3.5.0` to `3.6.0`

## Version 3.5.0

Team peer-reviewer picker & eligibility for the New Evaluation flow, plus Org Chart / Employee Management review fixes (CA-71).

* feat(competence): the New Evaluation "Team Reviewers" control is a custom popover picker replacing the native `<select>` — each colleague row shows a colour-coded stage-level pip, name, monospace ID, and role-family · specialization; keyboard-accessible (Esc / click-away close, focus return to the trigger) with an empty state when no eligible colleagues remain
* feat(competence): peer-reviewer eligibility — `OrganizationManager.isEligibleTeamReviewer` excludes the evaluatee and any manager in their reporting chain (direct or skip-level); the candidate roster filters on it so ineligible people never reach the picker, and `#startEvaluation` re-applies it to the submitted team as defense-in-depth (replacing the prior self + direct-manager filter); candidates now carry a `stageLevel` for the row pip
* feat(competence): the reviewer popover flips above the trigger when space below is tight, opts its panel out of `.ti-panel` `overflow: hidden` so the open list isn't clipped, and stacks above the sticky action bar
* feat(competence): Employee Management shows the Org Chart "You" chip when a Supervisor opens their own profile (the `.competence-you-tag` style is now reusable)
* fix(competence): the Org Chart hides the "Manage" action on your own row unless you're a Supervisor — a plain manager managing themselves hit a 403 (`#loadEmployeeDetail` forbids non-supervisor self-management); the button gate now mirrors that backend rule
* test(competence): unit coverage for `isEligibleTeamReviewer` (in/out-of-unit peers, direct & skip-level managers, self, missing input)
* style(competence): minor formatting normalization in `configuration-loader.js`
* build(release): bump package version from `3.4.3` to `3.5.0`

## Version 3.4.3

Appraisal-flow and Cycle Setup fixes on top of the 3.4.x Statistics & Results work.

* fix(competence): the Competence Evaluation submit and "finalize team feedback" confirmations use the app's custom `.ti-modal` dialog instead of the native browser `confirm()` — themed, with a busy-disabled confirm button and Esc/backdrop dismissal (these were the last native dialogs in the app)
* fix(competence): the dashboard "review pending" task and the team open/in-review/ready stats scope to an evaluatee's *closest* manager resolved live from the org graph (`OrganizationManager.resolveClosestManagerIDForEmployee`) instead of the persisted, optional `evaluation.managerID`; an `IN_REVIEW` evaluation is no longer hidden from the manager who must rate it when the stored manager id is unset or stale, and the interview-schedule view resolves the reviewing manager the same way
* fix(competence): locking a cycle records every empty specialization of an included family as an explicit "intentionally empty" set, so a locked cycle is self-documenting — functionally identical to leaving it unconfigured (an absent specialization already resolves to baseline-only) and applied only after lock validation passes
* fix(competence): Cycle Setup — the family-exclusion row gains top spacing so it no longer crowds the baseline editor above it
* style(competence): minor formatting normalization in the dashboard / results-scope handler
* build(release): bump package version from `3.4.2` to `3.4.3`

## Version 3.4.2

Post-merge fixes and polish over the Statistics & Results screens (CA-61). Requires web-framework ≥ 1.10.2.

* fix(competence): the Insights screens (Cycle, Team, Trends) gain their topbar titles and adopt the shared design-system primitives — `.ti-page-head` (eyebrow + subtitle), `.ti-panel`/`.ti-panel-head` report cards, the standard select control, and design-compliant empty states (icon + description) — so they match the rest of the app
* fix(competence): the cycle/team heatmap-view selects resolve their accessible name through a `getLabel` component method (it was an undefined variable that threw in the Alpine CSP scope), and the Trends screen loads its five metrics sequentially — the framework single-flights GET requests per path, so firing them in parallel aborted four of the five and hung the screen on "Loading…"
* fix(competence): the coverage "By group" chart is legible — each group bar is labelled with its name and the percent complete (Ready/Closed), with a localized status legend (en/bg)
* fix(competence): "My results" presents as a results view rather than the self-evaluation form — its own topbar and page title, with the grading-task role banner and the "how to grade" instructions hidden (the shared evaluation fragment is now results-aware via an `isMyResults` flag)
* refactor(competence): remove the redundant Insights landing screen (`insights-overview`, fragment + route + Alpine component + nav entry + labels) — the sidebar group opens the report screens directly and the Dashboard stays the entry point
* build(release): bump package version from `3.4.1` to `3.4.2`

## Version 3.4.1

Review fixes for the Statistics & Results capability (CA-61, PR #83 — CodeRabbit pass).

* fix(competence): Coverage `meta.total`/`pctReporting`/`partial` derive from the in-scope roster instead of the evaluation count, so an active cycle with not-started employees no longer reads 100% complete
* fix(competence): the per-cycle results snapshot anchors interview "held" counts to the cycle close date (not wall-clock) so re-persisting a closed cycle stays idempotent; whole-org coverage resolves the org root instead of collapsing to an empty roster; org-unit coverage groups label by display name rather than the raw unit id
* fix(competence): privacy & access — team-feedback free-text comments are manager-only (the grade-collapsing never anonymized free text); employee-history access requires the `MANAGER` role alongside org-graph superiority; team-analytics `scope=team` filters the subtree by `isSuperiorManagerOfEmployee` (the reporting chain, §7.7) so a manager can't see unit peers or unrelated reports
* fix(competence): individual results renormalize the blended subcategory score over only the sources present (a missing team grade no longer fabricates a development gap), and scale the results charts by the configured `performanceThresholds.T5` instead of a literal `150`
* fix(competence): the Insights sidebar tracks a per-route active key (buttons + `sidebarNavMapping`), and the heatmap-view selects gain accessible names and bind their value on the control
* test(competence): valid `QE` role-family fixture, a zero-preserving coverage helper, and the roster `organizationUnitName` field
* build(release): bump package version from `3.4.0` to `3.4.1`

## Version 3.4.0

### Statistics & Results reporting (CA-61, Phases 0–4)

A complete competency-analytics reporting capability over the appraisal data — reading live for the active cycle and from immutable per-cycle snapshots for closed cycles. Design + running log: `design/completed/statistics-and-results.md`. Requires web-framework ≥ 1.10.0 (the ti-chart primitives).

* feat(competence): aggregation service `application/results-analytics.js` — a frozen-singleton with pure cohort-frame + report computations and a live/snapshot resolver; the eighth Redis-JSON cache key `ti:competence:data:results-snapshots` with `saveResultsSnapshot`/`getResultsSnapshot`/`getAllResultsSnapshots` accessors, written immutably on cycle close (`#closeCycle → persistResultsSnapshot`, re-reading `actualCloseDate`). (Phase 0, CA-62…65)
* feat(competence): six leadership reports on the Insights → Cycle analytics screen — Coverage (gauge + by-group bars + pending list), Interview timing, Self-vs-manager alignment quadrant, competence heatmap, score-distribution-by-level box plots, and predictive drivers — each with a labels-sourced methodology / what-it-shows block (en/bg). (Phase 1, CA-66/67)
* feat(competence): Insights → Team analytics — the six reports re-scoped to a manager's (or supervisor's) multi-level subtree via `isSuperiorManagerOfEmployee`, plus the Grader Calibration report. (Phase 2, CA-68)
* feat(competence): individual results — the evaluee's READY/CLOSED results on the evaluation view (final-score hero, per-category + source-comparison bars, 9-subcategory radar vs the maturity-step expected, strengths/gaps), with the client decomposition reconciled exactly to the server score; plus a self-scoped "My results" workspace screen (closed history from the raw evaluation, always anonymized). (Phase 3, CA-69)
* feat(competence): cross-cycle Trends screen (Supervisor) — overall score trend (line + p25–p75 band) with performance-band mix, gap-closure over time, ladder movement, and cohort comparison; plus a per-employee historical score line (access-gated self / supervisor / manager-of-subtree, from the raw evaluations — never the anonymous snapshots). (Phase 4, CA-70)
* feat(competence): privacy by construction — snapshots carry only counts/means/percentiles (never identities or peer-individual grades), and every cohort cell with fewer than three reported people is suppressed at aggregation time, so the breakdowns can't de-anonymize a small team.
* build(release): bump package version from `3.3.1` to `3.4.0`

## Version 3.3.1

Bug fixes and polish from the first QA pass over the 3.3.0 team-feedback feature.

* fix(web-app): the team-reviewer evaluation view (newly reachable via the dashboard tasks) rendered a blank SELF column header and bare "–" placeholders. The SELF header now renders for every role, and competencies hidden from a viewer (self/manager for team reviewers — in both the per-competency and collective sub-category modes) show a lock icon
* feat(web-app): once an evaluation reaches `Ready`, the employee can see the manager grade and the team cumulative so they can prepare for the interview; individual peer grades remain anonymous. Enforced in `CompetenceFramework.anonymizeEvaluationGrades` (revealed only at `Ready`) and reflected in the evaluation grid
* fix(web-app): the dashboard "Performance Appraisal Form" task no longer shows the misleading "No active evaluation found for this cycle." copy, and it now appears only while the self-evaluation is genuinely outstanding (gated on `selfEvaluationCompleted`, surfaced on the dashboard payload) — a submitted self-eval awaiting peers/manager shows no stale task
* feat(css): an awaited (empty) grade now renders an hourglass glyph for permitted viewers (managers/supervisors, and the employee's own pending self-grades) instead of a dash — promoted onto the shared `.ti-grade-chip.empty` primitive (requires web-framework ≥ 1.9.3)
* test: +4 unit tests for the employee reveal-at-Ready anonymization behavior
* build(release): bump package version from `3.3.0` to `3.3.1`

## Version 3.3.0

### Dashboard tasks for team-member evaluation feedback

* feat(web-app): team members now discover their pending peer reviews as **dashboard tasks**. `load-dashboard` derives `team-feedback` and `team-finalize` descriptors from evaluation/workflow state via a new pure `TaskResolver` (`application/task-resolver.js`; the manager predicate and name lookup are injected, so it is persistence-free and unit-tested), and the dashboard renders them as cards that open the referenced colleague's evaluation by `employeeID` + `evaluationID`
* feat(framework): a manager (org-hierarchy) or Supervisor can **finalize team feedback** once the team-feedback deadline has passed ("Proceed to manager review") — `CompetenceFramework.finalizeTeamFeedback` drops the still-pending reviewers, recomputes the team cumulative from whoever submitted, and advances `OPEN → IN_REVIEW` only when the self-evaluation is also complete (otherwise it stays OPEN, awaiting self). Exposed via the `finalize-team-feedback` service; gated by the new `allowFinalizeTeamWithoutSubmissions` app setting (default `true`)
* feat(web-app): a Supervisor can open any evaluation as a **read-only process facilitator** — manager-level visibility but no rating or draft (`submit-evaluation` / `save-evaluation-draft` continue to reject any non-org-manager). The only action exposed is finalize, gated on a server-authoritative `canFinalizeTeam` flag returned by `load-evaluation`
* feat(data): the team-feedback deadline is now a **cycle-level date** (`cycle.teamFeedbackDeadline`), defaulted at cycle creation from the new `teamFeedbackWindowDays` setting (clamped to the manager-review deadline `cycleDate`) and editable in Cycle Setup (Supervisor + PLANNING, via `set-cycle-team-feedback-deadline` → `DataManager.setCycleTeamFeedbackDeadline`). `workflow.teamEvaluationDeadline` becomes required and is populated from the cycle at evaluation creation
* feat(data): finalize records an **evaluation-scoped audit entry** (`subjectType: "evaluation"`) — adds the `evaluations` audit bucket and `getAuditEntriesForEvaluation`; recorded but not yet surfaced in the UI
* feat(localization): en/bg labels for both task types, the finalize action + confirm copy, the facilitator notice, the Cycle Setup deadline field, and the finalize errors; also adds the previously-missing `error.cycle.*` messages (`invalid-id-format`, `invalid-date-range`, `not-in-planning`, `cannot-mark-baseline-empty`, `cannot-clear-baseline`)
* refactor(css): promote the bespoke `competence-empmgmt-actions-spacer` to a shared `.ti-spacer` primitive in `@ti-engine/web-framework` (requires web-framework ≥ 1.9.2)
* test: add 31 unit tests (16 task-resolver, 8 finalize, 6 cycle-deadline derivation, 1 evaluation-deadline) plus 2 cycle-schema conformance checks
* build(release): bump package version from `3.2.4` to `3.3.0`

## Version 3.2.4

* fix(web-app): the Dashboard no longer throws "Cannot read property of null or undefined" for an employee with no evaluation (e.g. a fresh hire). The "Your Self-Grades" stat card's three `x-show` expressions dereferenced `myEvaluation.status` unguarded; they now short-circuit on `myEvaluation` first (the Alpine CSP build forbids `?.`), matching the hero section's existing guard
* fix(web-app): the Dashboard "Tasks for you" panel now lists real tasks. `_buildTasks` compared `evaluation.status` against uppercase enum *keys* (`OPEN`/`READY`/`IN_REVIEW`), but the stored values are the title-case enum *values* (`Open`/`Ready`/`In Review`), so the self-evaluation / interview / manager-review tasks never matched; the casing is corrected, the three hardcoded placeholder tasks are removed, and the real "All caught up!" empty state now shows when there are genuinely no tasks
* refactor(web-app): drop the unused `statusColorClass` and `stageProgressPct` dashboard helpers (referenced nowhere; both carried the same status-casing bug)
* fix(css): minor layout cleanups — remove the `bottom` offset from the sticky `.competence-empmgmt-actions-panel`, the leftover `padding` on `.competence-empmgmt-evaluations`, a now-redundant `display: flex` on a scrolling content pane, and a fixed `min-width` on a right-aligned value cell

## Version 3.2.3

* fix(web-app): the Cycle Setup screen no longer shows a phantom vertical scrollbar with the bottom of the tree falling past the fold. The screen now fills the content area (`.competence-cycle-setup-page`) as a flex column and the role-family tree and the editor scroll inside their own panes, instead of document-scrolling a sticky tree sized to the full viewport. The old `max-height: calc(100vh - …)` could not account for the page head and the conditional read-only banner stacked above the tree in the same scroll container (already `100vh - topbar`), so the bottom always spilled past the fold. Narrow viewports (≤960px) still collapse to a single document-scrolling column
* fix(web-app): the Cycle Setup editor pane now keeps its header (family/specialization name + description) pinned while the body — cap usage, subcategory coverage, and the competency list — scrolls inside the pane, mirroring the tree pane. Previously the whole pane scrolled, clipping the header off the top and the list off the bottom
* fix(web-app): apply the same master/detail layout to the Employee Management screen — the page fills the content area, the employee list (master) and the detail card each scroll inside their own pane, and the detail's head + tabs stay fixed while the tab content (Details/Evaluations/Audit) scrolls. Removes the viewport-sized sticky master that produced the same phantom scroll. Narrow viewports (≤1080px) still collapse to a single document-scrolling column

## Version 3.2.2

* refactor(web-app): align the evaluation screens with the shared design-system primitives. `frame-competence-evaluation` and `frame-new-evaluation` now use `.ti-panel` + `.ti-panel-head-aside` + `.ti-panel-body-intro` for their grade-guide / feedback / team panels, and the new-evaluation employee header reuses the evaluation screen's `.competence-eval-employee-card` + `.competence-eval-context-*` layout (role family / specialization / stage-level) for a consistent look. Removes the now-unused `competence-eval-grade-guide*`, `competence-eval-grade-scale-tag`, and `competence-new-eval-*` CSS
* style(localization): Title-Case the evaluation labels `Cycle & Framework`, `Team Reviewers`, `Add Reviewer`, and `Open Evaluation`
* build(release): bump package version from `3.2.1` to `3.2.2`

## Version 3.2.1

* fix(web-app): the lock-cycle, close-cycle, and Cycle Setup lock confirmation modals no longer report a non-validation error (e.g. "another cycle is already ACTIVE") via a toast left behind the open modal. The confirm modal now closes and the error surfaces as a toast (which also carries the details line); the lock **validation** errors keep their dedicated `lock-errors` modal

## Version 3.2.0

### Family exclusion + stricter lock validation

* fix(framework): `validateCycleForLock` no longer lets a cycle lock with an *included* role family left unconfigured. The previous logic silently skipped any family with no competencies; a new `family-not-configured` rule now blocks the lock unless the family is configured or explicitly excluded
* feat(web-app): a role family can be **excluded** from a cycle. A Supervisor toggles inclusion per family on the Cycle Setup baseline editor (`set-family-excluded`, Supervisor + PLANNING only); an excluded family is skipped by lock validation, its specializations are hidden in the tree, and its header is muted with an "Excluded" tag — letting a cycle be locked with only the families that can be completed
* feat(data): add `cycle.excludedFamilies` (schema + `DataManager.setCycleExcludedFamilies`); `validateCycleForLock` reads it. The seeded cycle excludes the families it has no data for, so it stays lockable out of the box
* test(framework): cover the inclusion rule (an included empty family blocks the lock; an excluded family is skipped entirely) and adjust the no-empty-baseline case for the new seed exclusions

## Version 3.1.0

### Role-family competency pool restored

* feat(config): restore the per-family competency **pool** (applicability universe) as `config.role-family-competencies.json` — `{ <family>: [codes] }`. Every role family gets a pool: the populated families carry family-specific + shared (SE 61 / BA 52 / PM 55), and the six not-yet-populated families (QE/XD/DA/IO/MC/PD) carry the 30 shared canonical competencies only, so they share the core even now. The pool was previously carried by the keys of `config.competency-relevancy.json`, which `3.0.0`'s archetype refactor retired without a replacement; relevancy stays global, the pool is restored as its own document
* feat(build): `bin/build/build-competency-relevancy.js` now also emits the pool — family-specific codes from the `## Assignments — <family>` sections of `design/competency-relevancy-model.md` plus the shared set, for every family in `config.role-families.json` — so the generator stays the single source of truth for both archetypes and pool
* feat(framework): `validateCycleForLock` gains a fifth rule, `pool-membership` — every competency in a family's baseline/specialization sets must belong to that family's pool
* feat(web-app): the Cycle Setup competency picker now lists exactly the selected family's pool (an empty picker when the family has none); the `set-active-competency-set` save path rejects out-of-pool codes server-side
* feat(config): register `role-family-competencies` as a store-backed, exportable, restorable config document (read-only — no inline editor yet); add the `poolReferenceIntegrity` validator (pool families exist; pool codes exist) and an `activeSetsWithinPool` validator on the active competency sets
* test(json): add pool schema validation plus integrity guards (pool ⊆ dictionary, pool families defined, active sets ⊆ pool) and `activeSetsWithinPool` / `poolReferenceIntegrity` unit tests
* fix(test): load the relocated `config.application.schema.json` from `bin/data/schemas/`, keyed by filename (the package-local schema has no `$id`)

### Cycle Setup fixes

* fix(web-app): show the Cycle Setup screen's topbar title — add the missing `interface.topbar.cycle-setup` label (and the likewise-missing titles for the archetype-assignment, archetype-editor, and role-families admin screens)
* fix(web-app): when configuring a specialization, the competency picker shows the family's baseline competencies as disabled and flagged "in baseline" instead of offering them as duplicate additions
* fix(web-app): toggling the "no extra competencies" marker now correctly drives the Save button, and un-marking a previously intentionally-empty specialization clears it back to "not configured" via a new `clear-active-competency-set` endpoint (`DataManager.deleteActiveCompetencySet`)

## Version 3.0.0

### Competency content rebuild

* feat(config)!: rebuild the competency dictionary from 164 to **108** finalized competencies — SE 31, BA 22, PM 25, plus 30 shared canonical — regenerated from the source-of-truth documents now in `design/`. Drop 64 retired codes and add 8 (`C1-8`, `E1-42`..`E1-47`, `E2-41`); retired numbers are left intentionally vacant, and the `I1` range is renumbered clean (`I1-1`..`I1-7` — e.g. `I1-7` is reassigned to PM "Change management within projects")
* feat(localization): rebuild EN + BG localization for all 108 competencies with complete, non-empty name, description, and six scope anchors in both languages; the unchanged SE entries are preserved verbatim and the `PostgresSQL` → `PostgreSQL` typo is fixed. Add a `relevancy-archetype` name/description label section (BG pending native-speaker review) for the UI
* feat(config): materialize `config.competency-relevancy.json` (168 rows — SE 61 / BA 52 / PM 55) by expanding the seven archetype curves defined in `design/competency-relevancy-model.md`; shared competencies carry the same curve in every family
* feat(config): reseed `config.active-competency-sets.json` with sensible default baselines per family for cycle `2026-H2` (SE 22 / BA 21 / PM 21), each covering all nine subcategories within the cap; specializations are left for HR to select per cycle
* test(json): add a content-integrity guard that fails if any competency referenced by an active set — or any catalog competency — has an empty `en`/`bg` name, description, or scope level
* chore(build): replace the obsolete CSV-based compile scripts with `bin/build/build-competency-relevancy.js`, the re-runnable generator for the relevancy config and the archetype labels

### Correctness and code-quality fixes

* fix(framework): creating a cycle whose ID already exists now raises `E_APP_RESOURCE_ALREADY_EXISTS` with HTTP `409`; it previously referenced an undefined exception code and surfaced as a generic unknown error (requires `@ti-engine/core` ≥ 1.5.0)
* fix(web-app): authorization failures across the evaluation, employee, and cycle handlers now return HTTP `403` (Forbidden), reserving `401` for genuinely unauthenticated requests — matching the framework's own `authorization.requireRole` guard
* refactor(config): derive the stage-level ladder from `config.stage-levels.json` in one place (new `getStageLevelCodes` / `getStageLevelLadder` / `getArchetypeStageLevels` loader helpers) instead of hardcoding it in the config editors, the employee form, and the relevancy build script
* refactor(config): convert the semantic config validators from async/await to Promise chains (matching the framework's Promise-based style) and document them with full `@param`/`@returns` JSDoc (new `ValidationIssue` / `ValidatorContext` typedefs)
* refactor(framework): drop the unused per-cycle collision parameter from `generateShortID` (the short ID is display-only — evaluations are keyed by UUID) and remove the redundant `Promise` wrappers around the `validateCycleForLock` and web-server `onStart` chains
* refactor(web-app): replace an inline IIFE in the config data view with a private helper; clone via `structuredClone` in the config editors and use `&&`-chaining in the config validators
* chore(build): rewrite `bin/build/build-competency-relevancy.js` to the project code style and source its stage levels from `config.stage-levels.json`
* docs: relocate the phase-0 inventory notes into `design/` (kebab-case) alongside the other competence design documents

### BREAKING CHANGES

* 64 competency codes were removed and the `I1` subcategory renumbered. Stored evaluation data keyed by the old codes (e.g. the separate pilot/analysis dataset) must be migrated. The config file shapes, JSON schemas, and framework logic are unchanged — this is a content replacement, not an API change

## Version 2.1.0

### Catalog and relevancy

* feat(config)!: split per-role relevancy out of `config.competencies.json` into a new role-family-keyed `config.competency-relevancy.json` (with matching `competency-relevancy.schema.json`). The same competency carries different importance across disciplines (e.g., transversal `I2`/`I3` score differently for SE vs BA vs PM), and the new file expresses that directly
* feat(config): grow the catalog from 64 to 164 entries — 45 BA-specific (`E1-10`..`E1-25`, `E2-17`..`E2-28`, `E3-8`..`E3-17`, `I1-8`..`I1-14`), 55 PM-specific (`E1-26`..`E1-41`, `E2-29`..`E2-40`, `E3-18`..`E3-27`, `I1-15`..`I1-18`, `I2-6`..`I2-11`, `I3-4`..`I3-7`, `C2-6`, `C3-6`..`C3-7`); transversal entries (most `C1`/`C2`/`C3`, `I2-1`..`I2-5`, `I3-1`..`I3-3`) are reused across families
* feat(config): seed curated BA + PM baselines and specializations in `config.active-competency-sets.json`; clear the stale PM placeholder set that had been a copy of SE
* feat(framework): `buildEvaluationSnapshot` now reads relevancy from `configCompetencyRelevancy[roleFamily][code]`; snapshots remain frozen at evaluation creation so existing evaluations are unaffected
* feat(web-app): the cycle-planning endpoint exposes `relevancyByFamily` instead of a single ambiguous `relevancy` field
* test(json): add the relevancy schema check and two coverage tests — every active-set code has relevancy for its family, and every relevancy code exists in the catalog

### Cycle Setup screen reshape

* feat(html): redesign the Cycle Setup page chrome to match the refreshed handoff bundle — title block (mono `cycleID` + name) on the left, status pill + back button on the right; read-only banner uses a muted/sunken treatment with left-border accent and copy that adapts to ACTIVE vs CLOSED cycle status
* feat(html): drop `.ti-content.pane` wrappers — the tree pane is a sticky card on the left and the editor is its own card on the right; an action bar is extracted into a separate sticky sibling card mirroring `.competence-empmgmt-actions-panel`
* feat(html): family head uses `.ti-tag` mono with an 8x8 status dot indicator replacing the circular badge; specialization rows get a tree-line connector
* feat(html): editor title uses `.ti-tag` mono for the family code; cap text shows `N` followed by a muted "of CAP competencies for ..." qualifier; floor pills include check/x icons + a hint; competencies render as a single bordered list with internal dividers; empty state uses the shared `.ti-empty-state` primitive
* fix(ui): null-safe `isPickerCodeSelected` and `pickerRowClass` helpers — fixes "Cannot read property of null or undefined" errors that fired during the modal teardown re-evaluation race
* refactor(ui): drop the obsolete `getCapText` / `getNodeStatusGlyph` helpers and the `cap-usage` / `competencies-empty-*` localization keys they fed
* fix(ui): CSP-safe `capBarStyle()` — return an object (`{ "--pct": pct + "%" }`) instead of a string so Alpine's CSP build dispatches the binding through `element.style.setProperty(...)` rather than the inline-style attribute write that tripped the strict CSP `style-src` policy on every editor re-render

### People screen reshape and audit timeline

* feat(html): action-oriented page head ("Manage all employees" / "Manage your team") with an audit-aware subtitle; filters compacted to a 2x2 grid; meta bar (count + Clear filters) between filters and list; empty list uses `.ti-empty-state`
* feat(html): sticky master pane (filters always visible) and scrolling detail pane; both panes carry explicit card chrome since `.ti-content.pane` was dropped
* feat(html): xl avatar, `fs-2xl` name, level pip inline in the sub line, employee-ID tag stacked under the employment-status pill in the detail head
* feat(html): manager readonly is now a single-row sunken pill (avatar + name + hint pushed to the right)
* feat(ui): split Level into two selects (letter + stage number) inside one form-row cell with `availableStagesForLevel` / `availableStagesForDraft` filtering Stage to the valid options per Level (N/X/T → [1]; J/R/S → [1..3]); `onLevelChange` re-snaps Stage when the current value is invalid for the new level (e.g., R3 → T becomes T1)
* fix(ui): Level / Stage / Specialization selects now use `x-effect="syncXSelect($el)"` + a `$nextTick` value assignment, avoiding the Alpine race where `element.value` is set before the inner `x-for` renders the option children (which otherwise left selects stuck on their first option, or Specialization stuck on the hardcoded Generalist fallback)
* feat(html): lift the action bar out of the form into its own `.competence-empmgmt-actions-panel` sibling card with sticky positioning; detail and actions wrap inside a `.competence-empmgmt-detail-stack` column
* feat(html): rebuild the Evaluations tab as a `.ti-data-grid bordered` with columns Eval / Cycle / Level / Status / Interview / Open; new `openEvaluation` method navigates to `/competence-evaluation`
* feat(web-app): enrich `#loadEmployeeDetail` with `statusTone`, `stageLevel`, and `interviewDate` per in-flight evaluation, plus a private `#evaluationStatusTone` helper
* feat(css): replace flat `.competence-empmgmt-audit-*` / `.competence-audit-row` styles with a single shared `.competence-audit-timeline` primitive (dot + connecting line per entry, `.created` and `tone-*` variants on the action chip); both the People audit tab and the Cycles audit modal render through it

### Design tweaks across screens

* feat(html): split the sidebar into Workspace and Manage sections; Manage is role-gated (Manager / Supervisor) and uses `x-show` (not `x-if`) so htmx wires its `hx-*` handlers at load; org chart stays in Workspace because regular employees use it to browse their team
* feat(localization): rename "Employees" → "Org chart" across sidebar, topbar, and page-header labels
* feat(html): theme glyph mirrors the action — sun in daylight, moon in glass
* feat(html): wire the new web-framework `topbarPrimaryCta` slot on Cycles (New cycle), People (Add employee, supervisor-only), and Cycle Setup (Lock cycle, disabled until validation passes); inline lock-confirm modal added to Cycle Setup
* feat(html): per-row "History" icon button on Cycles opens an audit modal built from the existing `createdAt`/`lockedAt`/`actualCloseDate` fields; closed entries fall back to "system" until `closedBy` lands in the schema
* feat(html): org-chart actions column 200 → 240px so Open / Start / Manage don't wrap
* feat(html): inline empty state on New Evaluation (cycles-loop icon + copy) when the backend reports `no-active-cycle`, replacing the toast + inert action bar
* feat(web-app): org-chart payload now returns `hasActiveCycle` alongside the org tree; "Start Evaluation" button is gated on it client-side (server-side enforcement remains the real guard)

### CSP and role-check hardening

* fix(ui): replace inline `Array.isArray($store.tiApplication.user.roles)` template expressions with calls to `tiApplication.hasRole(roleCode)` — the Alpine CSP build does not expose `Array` as a global to its expression evaluator, which blew up on the dashboard with `Undefined variable: Array`. Call sites updated: `component-sidebar.html` (Cycles, People entries), `frame-employees-list.html` (per-row Manage action)

### Post-refactor cleanup

* refactor(web-app): tighten `#loadNewEvaluationData` to require a strictly ACTIVE cycle via `dataManager.instance.getActiveCycle()`, mirroring `#startEvaluation` — the preview screen used to load against a PLANNING cycle and the user only saw "no active cycle" after clicking Open Evaluation; the error now surfaces on navigation
* refactor(localization): rename `interface.employees.col.career-path` ("CAREER PATH" / "КАРИЕРЕН ПЪТ") → `interface.employees.col.role` ("ROLE" / "РОЛЯ") to match the column data (role family + specialization); drop three orphan keys — `interface.evaluation.appraisal.career-path`, `interface.evaluation.new-eval.kv-career-path`, `interface.evaluation.columns.career-path`
* refactor(localization): update the New-Evaluation `cycle-desc` copy from "Competencies are determined by career path and level" to "...by role family, specialization, and stage-level" in both en and bg
* refactor(schema): update `competencies.schema.json` description strings to refer to "stage-level" instead of the residual "career path level" / "career path tier"
* docs(framework): clean stale "until the dedicated rendering lands in later phases" comment from `#formatRoleFamilyLabel` JSDoc — that rendering landed
* build(release): bump package version from `2.0.0` to `2.1.0`

## Version 2.0.0

* feat(competence)!: introduce a three-dimensional competency model — Role Family × Specialization × Stage-Level — replacing the two-dimensional Career Path model. Cycles become first-class entities with a `PLANNING → ACTIVE → CLOSED` lifecycle, evaluations carry a frozen Active Competency Set snapshot at creation time, and supervisors gain dedicated UI for managing the cycle configuration and employee roster end-to-end. Breaking: existing pilot data is discarded (destructive reseed); no backward-compatibility shims for the old `CareerPathCode` enum, `careerPath` field, or `getAllowedCompetencyCodes(...)` API.

### Phase 1 — Data model and configuration

* feat(config): add `config.role-families.json` — 9 families (`SE`, `QE`, `BA`, `PM`, `XD`, `DA`, `IO`, `MC`, `PD`), 38 specializations, with localization keys and per-specialization e-CF placeholder arrays
* feat(config): add `config.active-competency-sets.json` (nested `{family: {baseline | <SPEC>: {<cycleID>: [codes…]}}}`); seeded baselines for `SE`/`BA`/`PM` cover all nine subcategories for cycle `2026-H2`; seeded specializations include `SE/BACKEND`, `SE/FRONTEND`, `BA/REQUIREMENTS`, `PM/AGILE`
* feat(config): rename `config.career-path-levels.json` → `config.stage-levels.json` (content unchanged)
* feat(config): extend every competency in `config.competencies.json` with an optional `eCFMapping` array (defaults to empty)
* refactor(config): remove `config.career-path-competencies.json`
* feat(schemas): migrate every schema under `bin/data/schemas/`; add `role-families`, `active-competency-sets`, `stage-levels`, `cycle`, `audit-entry`; rewrite `employee.schema.json` and `evaluation.schema.json` for the new shape (gradeValue enum now includes `N`)
* feat(config-loader): introduce `roleFamilyCode` (9 codes) and `cycleStatus` (`PLANNING/ACTIVE/CLOSED`) enums + `getSpecializationCodes(familyCode)` helper; drop `CareerPathCode`
* feat(types): replace `CareerPathCodeValue` with `RoleFamilyCodeValue`; add `SpecializationCodeValue`, `Cycle`, `CycleStatusValue`, `AuditEntry`, `SnapshotEntry`, `RoleFamily`, `Specialization`, `ECFMapping`
* feat(data-manager): role families CRUD (`getRoleFamilies`, `getRoleFamily`, `getSpecializationsForFamily`)
* feat(data-manager): cycles CRUD (`createCycle`, `getCycle`, `getAllCycles`, `updateCycleStatus`, `getActiveCycle`)
* feat(data-manager): active competency sets CRUD (`getActiveCompetencySet`, `getBaselineSet`, `getSpecializationSet`, `getActiveCompetencySetsForFamily`, `setActiveCompetencySet`)
* feat(data-manager): audit log (`appendAuditEntry`, `getAuditEntriesForEmployee`); employee `saveEmployee` helper
* feat(data-manager): destructive reseed under `COMPETENCE_PRELOAD_DATA=true` for all new collections; cycle metadata derived from cycle IDs found in the active-competency-sets config
* feat(seed): rewrite `seeders/employees.json` — 11 employees with `roleFamily` + optional `specialization` + `employmentStatus`; stage-levels span N1/J3/R2/S1/T1; mixed specializations and generalists
* feat(seed): empty `seeders/evaluations.json` (the seeded `2026-H2` cycle is in PLANNING)
* feat(localization): full `role-family.{name,description}.<CODE>` and `role-family.<CODE>.specialization.{name,description}.<SPEC>` trees in `en` + `bg`; `framework.cycle.status.*` keys
* test(json): introduce `test/json-config-validation.test.js` covering schema validity for all five configs and both seed files, plus integrity checks (baseline floor coverage, referenced competency codes exist, specialization keys valid)

### Phase 2 — Application logic

* feat(framework)!: `getActiveCompetencySet(roleFamily, specialization, cycleID)` — async; baseline ∪ specialization, deduplicated, sorted; throws when baseline is missing or empty
* feat(framework): `buildEvaluationSnapshot(roleFamily, specialization, cycleID)` — freezes the resolved set into self-contained entries (code, localization keys, scope, relevancy, eCFMapping, origin marker)
* feat(framework): `validateCycleForLock(cycleID)` — pure structured validator with four rules: baseline floor coverage, cap, reference integrity, no-empty-baseline-when-specialization-data-exists; returns `{ valid, errors:[{family, specialization?, rule, detail}] }`
* feat(framework): `lockCycle(cycleID, actorID)` and `closeCycle(cycleID)` enforcing the one-way `PLANNING → ACTIVE → CLOSED` state machine and the single-active-cycle invariant
* feat(framework): `createNewEvaluation(employee, cycle, snapshot)` deep-clones the snapshot; grades pre-populated keyed off the snapshot
* feat(framework): `calculateFinalEvaluationScores` rewritten to read per-stage-level relevancy from the snapshot; `updateSelfEvaluationGrades` / `updateTeamEvaluationGrades` / `updateManagerEvaluationGrades` filter to snapshot codes
* feat(framework): `buildCompetenciesTreeFromSnapshot(snapshot, language)` — renders the evaluation form's competency tree exclusively from the snapshot
* refactor(framework): removed `getAllowedCompetencyCodes`, `#calculateEvaluationScoreMatrices`, and all hardcoded `evaluationCycle*` fields
* feat(org): graph employee nodes now carry `roleFamily` + `specialization` + `employmentStatus`; `resolveEmployeeAttributes` returns localized `roleFamilyName` / `specializationName`
* refactor(web-app): every `careerPath` / `careerPathName` / `careerPathCode` / `evaluationCycleID` call site migrated; helpers `#resolveCurrentCycle` and `#formatRoleFamilyLabel` introduced
* feat(web-app): `/app/config` exposes the resolved current cycle; `#startEvaluation` resolves the active cycle and builds the snapshot; `start-evaluation` errors clearly when there is no active cycle
* test(framework): four new node-test suites (resolution, validation, lifecycle, snapshot) under `packages/competence/test/`; in-memory cache helper for isolated runs

### Phase 3 — Cycle Management and Cycle Setup screens

* feat(web-app): register `cycles` and `cycle-setup` fragments; add `load-cycle-list` + `load-cycle-setup?cycleID=X` data views (Supervisor-only)
* feat(web-app): add `create-cycle`, `lock-cycle`, `close-cycle`, `set-active-competency-set`, `mark-active-set-empty` service handlers; active-set mutations write append-only audit entries
* feat(framework): introduce `.ti-modal*` primitive (backdrop, sizes, danger/warn tones, both themes) and `.ti-input.has-error` error state
* feat(config): add `performanceAppraisals.activeCompetencySetCap` (default 30) to `config.application.json` and its schema
* feat(html): add `frame-cycles.html` — cycle list with status pills, evaluation counts, and create / lock / close / validation-errors / close modals
* feat(html): add `frame-cycle-setup.html` — two-pane editor with tree (families → baseline + specializations) status indicators, cap usage, floor-coverage pills, "no extras" checkbox, picker modal, clone modal
* feat(ui): add `competenceCycleManagement` and `competenceCycleSetup` Alpine factories
* feat(css): `competence-cycle-*` namespace covering tree, floor pills, cap indicator, picker, clone modal
* feat(sidebar): add `Cycles` nav entry, gated client-side by Supervisor role
* feat(localization): full `interface.cycles.*` and `interface.cycle-setup.*` trees in `en` + `bg`

### Phase 4 — Employee Management screen

* refactor(schema): drop `employee.managerID` — the org chart is the single source of truth for manager assignment via the unit-walk in `OrganizationManager`
* feat(web-app): register `employee-management` fragment; add `load-employee-management-list` (scope-aware) and `load-employee-detail` data views
* feat(web-app): add `create-employee` (Supervisor) and `update-employee` (field-level gating) service handlers; one audit entry per changed field
* feat(web-app): validation rules — name required, work-mode / work-location / employment-status enum-constrained, role-family + specialization-for-family valid, stage-level dual-track (N/X/T only stage 1), organization unit exists, email format
* feat(html): add `frame-employee-management.html` — master/detail layout with filters, search, tabbed editor (Details/Evaluations/Audit), role-family-change confirmation with in-flight count, specialization-change confirmation, Create Employee modal
* feat(ui): add `competenceEmployeeManagement` Alpine factory with in-memory drafts, per-field diff Save, and scope-aware list filtering
* feat(css): `competence-empmgmt-*` master/detail shell, tabs, audit list
* feat(sidebar): add `People` nav entry (Supervisor + Manager); add per-row `Manage` action on `frame-employees-list.html` cross-linking to the management screen
* feat(localization): full `interface.employee-management.*` and `error.employee.*` trees in `en` + `bg`

### Phase 5 — Evaluation form and start-evaluation tightening

* feat(framework): snapshot entries gain `originLabel` (localization key) — `"interface.evaluation.context.origin.baseline"` for baseline-origin codes, or the spec's `name` key for spec-origin codes; snapshots remain language-independent
* feat(framework): `buildCompetenciesTreeFromSnapshot` resolves `originLabel` to `originName` per item; older snapshots fall back to "Baseline" or the raw spec code
* refactor(web-app): `#startEvaluation` now requires a strictly `ACTIVE` cycle via `dataManager.instance.getActiveCycle()`; PLANNING / CLOSED / missing cycles all surface `error.evaluation.no-active-cycle`
* feat(schema): optional `originLabel` field added to evaluation `snapshotEntry`
* feat(html): `frame-competence-evaluation.html` — new three-item context strip (Role family / Specialization-with-Generalist-fallback / Stage-level) below the employee name; per-competency origin badge and e-CF tags (only when present)
* feat(css): `competence-eval-context*`, `competence-comp-origin`, `competence-comp-ecf` styles; both themes
* feat(localization): `interface.evaluation.context.*` tree (role-family, specialization, stage-level, generalist, origin.baseline, ecf-prefix); `error.evaluation.no-active-cycle` and `error.evaluation.empty-competency-set` labels
* test(framework): snapshot suite extended with two new cases — `originLabel` correctness (baseline vs spec), and generalist (specialization === null) snapshot

### Phase 6 — Cleanup and documentation

* chore: strip residual `CareerPathCode` references from production code (`configuration-loader.js` JSDoc, `role-families.schema.json` description). Historical CHANGELOG entries and the Phase 0 inventory deliberately retain the old terminology as a record of the pre-refactor state.
* docs: rewrite `packages/competence/README.md` — Career Paths section becomes Role Families + Specializations, Mermaid `Start Evaluation` sequence step updated, hardcoded-cycle commentary removed
* docs: refresh `.claude/commands/ti-engine.md` orientation doc — `CareerPathCode` replaced with `RoleFamilyCode` + `CycleStatus`; competence file list updated to reflect renamed configs; package version bumped to `2.0.0`; specialization mentioned in the package role
* build(release): bump package version to `2.0.0`

## Version 1.5.0

* feat(config): add `interviewCalendar` configuration block to `config.application.json` with `slotDurationMinutes`, `workingHoursStart`, `workingHoursEnd`, and `workingDays` settings
* feat(data-manager): initialize `ti:competence:data:calendars` Redis root key in `initialize()`
* feat(data-manager): add `fetchManagerCalendar(cycleID, managerID)` to retrieve a manager's active availability slots for a given cycle
* feat(data-manager): add `fetchAllCalendarSlots(cycleID)` to retrieve all active availability slots across all managers for a given cycle
* feat(data-manager): add `saveCalendarSlot(slot)` for persisting calendar slot state with logical deletion support
* feat(web-app): add `manager-calendar` and `interview-schedule` fragment registrations
* feat(web-app): add `load-manager-calendar` data view returning availability slots, cycle metadata, and calendar configuration for the authenticated manager
* feat(web-app): add `load-interview-schedule` data view returning READY evaluations with booking state and all available slots for supervisor scheduling
* feat(web-app): add `toggle-calendar-slot` service handler — MANAGER-only: creates or logically deletes an availability slot by date and start time; booked slots cannot be toggled
* feat(web-app): add `book-interview-slot` service handler — SUPERVISOR-only: books an available slot for a READY evaluation, sets `slot.status = "booked"` and `evaluation.interviewDate`
* feat(web-app): add `cancel-interview-booking` service handler — SUPERVISOR-only: cancels a booked slot, restores it to `"available"`, and clears `evaluation.interviewDate`
* feat(ui): add `managerCalendar` Alpine.js controller with week grid rendering (`getWeekDays`, `getTimeSlots`), slot state resolution (`getSlotState`, `getSlotBookingLabel`), toggle support, and cycle-bounded week navigation (`prevWeek`, `nextWeek`, `canGoPrev`, `canGoNext`)
* feat(ui): add `interviewSchedule` Alpine.js controller with slot listing (`getAvailableSlots`), booking (`bookSlot`), booking cancellation (`cancelBooking`), and formatted slot label output (`formatSlotLabel`)
* feat(ui): add `manager-calendar` and `interview-schedule` sidebar navigation buttons to `frame-application.html`
* feat(html): add `frame-manager-calendar.html` — visual weekly availability grid with click-to-toggle cells, booking occupancy display, slot state legend, and prev/next week navigation
* feat(html): add `frame-interview-schedule.html` — supervisor interface listing READY evaluations with schedule and cancel actions, and an inline slot picker for selecting available slots
* feat(css): add calendar grid layout CSS variables (`--calendar-time-col-width`, `--calendar-day-col-width`, `--calendar-slot-height`) and component classes (`.calendar-table`, `.calendar-row`, `.calendar-slot-cell`, `.calendar-legend`, etc.)
* feat(css): add interview schedule layout classes (`.interview-schedule-list`, `.interview-schedule-row`, `.interview-slot-picker`, `.interview-slot-item`)
* feat(css): add `.ti-icon.calendar` and `.ti-icon.schedule` embedded SVG mask icons for sidebar buttons
* feat(localization): add `interface.calendar.*` labels for calendar title, week navigation, and slot states
* feat(localization): add `interface.schedule.*` labels for schedule title, actions, columns, and empty-state messages
* feat(localization): add `error.calendar.*` error message labels for slot state violations (`slot-not-found`, `slot-not-available`, `slot-already-booked`, `cannot-toggle-booked`)
* feat(config-loader): add `slotStatus` enum with values `AVAILABLE`, `BOOKED`, `BUSY`, and `DELETED`
* refactor(web-app): replace all hardcoded slot status strings with `slotStatus` enum references across `toggle-calendar-slot`, `book-interview-slot`, `cancel-interview-booking`, and `load-interview-schedule`
* feat(web-app): extend `toggle-calendar-slot` with an optional `targetStatus` parameter (`available` or `busy`); toggling a slot with the same status removes it, toggling with a different non-booked status updates it in place
* feat(web-app): include `employeeName` (resolved via `OrganizationManager`) in the booking record created by `book-interview-slot`
* feat(ui): add `busy` slot state to the manager calendar — empty cells display a split hover with a ✓ mark-as-available button and a ✕ mark-as-busy button; busy slots render in amber and toggle off on click
* feat(ui): update `getSlotBookingLabel` to display `booking.employeeName` instead of raw `booking.employeeID`
* fix(ui): fix `canGoPrev()` in `managerCalendar` controller to compare ISO date strings instead of `Date` objects, preventing the prev-week button from remaining active on the current week
* feat(ui): replace the flat slot list in `interviewSchedule` with a 4-column weekly grid — `getSlotViewWeeks()` groups available slots by week, navigation shifts the window by 4 weeks at a time bounded at today's Monday, slot buttons show day/time and manager name on separate lines
* feat(html): update `frame-manager-calendar.html` with split hover action buttons on empty cells and a `busy` entry in the legend
* feat(html): replace the flat slot list in `frame-interview-schedule.html` with a 4-column weekly grid and `← Previous` / `Next →` navigation controls
* feat(css): add `.calendar-slot-cell.busy` amber variant and `.calendar-slot-actions` / `.calendar-slot-action` split-button hover styles for the manager calendar grid
* feat(css): add `.interview-slot-weeks`, `.interview-slot-week-column`, `.interview-slot-week-header`, `.interview-slot-item`, `.interview-slot-time`, and `.interview-slot-manager` styles for the weekly slot picker layout
* feat(localization): add `interface.calendar.slot-busy`, `interface.calendar.mark-available`, and `interface.calendar.mark-busy` labels
* feat(localization): add `interface.schedule.week-nav-prev` and `interface.schedule.week-nav-next` labels
* fix(data-manager): use array-based Redis JSON paths in `fetchManagerCalendar` and `fetchAllCalendarSlots` to prevent misinterpretation of cycle IDs containing dots or other JSONPath special characters
* build(release): bump package version to `1.5.0`

## Version 1.4.0

* feat(framework): expose `evaluationCycleID` and `evaluationCycleDate` as public getters on `CompetenceFramework`
* feat(web-app): add `new-evaluation` fragment registration
* feat(web-app): add `load-new-evaluation-data` data view to assemble employee, manager context, cycle metadata, and available team member list for the new evaluation screen
* feat(web-app): add `#loadNewEvaluationData()` private method for new evaluation screen data resolution
* feat(web-app): update `#startEvaluation()` to accept and apply `team` parameter for pre-populating evaluation team members at creation
* fix(ui): rename `startEvaluation()` to `startNewEvaluation()` in `employeesList` Alpine.js controller and update corresponding `frame-employees-list.html` button binding
* feat(ui): add `startNewEvaluation()` navigation helper to `employeesList` controller to route to the `new-evaluation` fragment
* feat(ui): implement `configureNewEvaluation` Alpine.js controller with `loadData()`, `applyData()`, `addTeamMember()`, `removeTeamMember()`, `submitNewEvaluation()`, and `cancel()` methods
* feat(html): add `frame-new-evaluation.html` fragment — evaluation initialization form displaying personal information and an interactive team member selection panel
* feat(css): add `.new-evaluation-team-selection` grid layout, `.new-evaluation-team-list` scrollable container, and `.new-evaluation-team-member` row styles
* feat(css): add `.ti-icon.remove-small` embedded SVG mask icon for inline remove buttons
* feat(localization): add labels for new evaluation data section (`appraisal.data`, `appraisal.team-selection`, `appraisal.employee-list`, `appraisal.empty-team-list`) and action buttons (`actions.cancel`, `actions.remove`, `actions.add-team-member`)
* build(release): bump package version to `1.4.0`

## Version 1.3.1

* feat(org): add `isSuperiorManagerOfEmployee()` to support superior-manager checks through the organization unit hierarchy
* feat(auth): replace direct-manager-only checks with hierarchy-aware `#canManagerPerformEvaluation()` across evaluation load/save/submit/start flows
* fix(web-app): calculate employees-list evaluation date by evaluation status (`OPEN` self/team deadline, `IN_REVIEW` manager deadline, `READY` interview date)
* feat(web-app): include `isCurrentUser` in employees-list payload entries
* fix(ui): update employees-list evaluation status rendering and prevent starting evaluations for the current user
* refactor(ui): remove hardcoded `employeesList` mock data from initial UI models
* build(release): bump package version to `1.3.1`

## Version 1.3.0

* feat(web-app): add `load-employee-list` data view and implement `#loadEmployeeList()` for organization-tree employee loading with role-aware visibility and evaluation access
* feat(org): extend `OrganizationManager` graph employee nodes with `careerPath`, `level`, `stage`, and `startingDate`
* feat(org): add organization graph query helpers (`resolveOrganizationUnitIDForEmployee`, `resolveEmployeeName`, `resolveParentUnitNames`, `getOrganizationUnitSubtree`)
* feat(data-manager): extend `fetchEvaluations()` to support bulk retrieval when `employeeID` is omitted
* feat(ui): implement employees-list controller data loading from `/app/load-employee-list` and add evaluation actions (`startEvaluation`, `openEvaluation`)
* feat(ui): rework `frame-employees-list` to render organization units and employees from the new hierarchical backend payload
* feat(css): update employees-list screen styling for organization section, career-path column, evaluation status display, and action layout
* feat(localization): add/update labels for employees-list organization/list sections and rename position label keys to career-path equivalents
* feat(config-loader): replace position-based exports with career-path-based exports and add grade code `N` (`Not Utilized`)
* feat(config): add/rename config files to `config.career-path-competencies.json`, `config.career-path-levels.json`, and `config.competencies.json`; remove `positions.json`
* feat(config): update organization structure seed naming/types (Organization/Division/Team display metadata)
* refactor(web-app): migrate evaluation and competency resolution logic from `position` to `careerPath`
* refactor(data): migrate employee seed data from `personal.position` to `personal.careerPath`
* refactor(schema): update employee and competencies schemas to use career-path terminology
* refactor(types): align data object typedefs with career-path naming and add organization-unit typedef
* refactor(ui): update competence-evaluation personal section bindings from `position` to `career-path`
* build(package): bump package version to `1.3.0` and update package import aliases for renamed config files
* build(scripts): add local build scripts for compiling competencies and competence labels from CSV sources (`bin/build/*.js`)
* chore(web-server): remove unused `#configuration-loader` import
* chore(test): remove obsolete competence package test suite files under `packages/competence/test/`
* docs(readme): expand module status/process workflow and role-based permission notes

## Version 1.2.0

* feat(org): add `OrganizationManager` singleton powered by `graphology` to build an organization chart from units and employees
* feat(org): add manager and organization context resolution (`resolveManagerIDForEmployee`, `resolveEmployeeOrganizationContext`) with parent-unit fallback
* feat(config): add `bin/config/config.organization-structure.json` and expose `configOrganizationStructure` via configuration loader
* feat(data-manager): add `fetchEmployees()` for bulk employee retrieval from cache or seeded fallback data
* feat(web-server): initialize organizational graph on startup after data initialization
* feat(web-app): add `employees-list` fragment registration and sidebar navigation action for the new screen
* feat(web-app): augment loaded evaluation personal context with `organizationUnitName` and graph-resolved manager info
* feat(web-app): set new evaluations `managerID` via organization graph resolution and use graph-based manager authorization checks
* feat(web-app): return grades from `evaluationGrade.properties` instead of external grades JSON configuration
* feat(ui): add employees list UI model and fragment scaffold with flat and hierarchical unit rendering
* feat(ui): update evaluation personal section to display organization unit name instead of department
* feat(css): add dedicated employees list layout and responsive styles
* feat(localization): add labels for employees list screen and rename personal section label key to organization unit
* refactor(data): replace employee `department`/embedded manager seed structure with `organizationUnitID` mapping and expanded seed dataset
* refactor(schema): update employee JSON schema to use `organizationUnitID` and remove required manager object
* refactor(types): align employee type definitions with organization-unit fields and optional manager data
* refactor(ui): migrate cloning and date formatting usage to framework toolbox helpers and remove `ti-user-interface.js` include from package index
* build(package): add import aliases `#config-organization-structure` and `#organization-manager`; remove `#config-grades`
* build(scripts): add local build utilities for generating competencies and competence labels from CSV sources (`bin/build/*.js`)
* build(deps): add `graphology` dependency
* build(release): bump package version from `1.1.0` to `1.2.0`
* test(app): update web application tests for organization unit and manager context behavior
* test(data): update data manager tests to validate `organizationUnitID`-based employee structure
* test(json): add organization-structure consistency validation between units and employee manager references

## Version 1.1.0

* feat(web-app): add `start-evaluation` service request handler with position-based competency initialization and active evaluation guard
* feat(web-app): add `#startEvaluation(session, employeeID)` private method to handle new evaluation creation flow
* feat(web-app): add `#getAllowedCompetencyCodes(positionKey, cycleID)` private method to compute position-based allowed competency codes
* feat(web-app): add `canEdit` and `deadlineDate` metadata to `load-evaluation` response for UI state management
* feat(web-app): update `#loadEvaluation` to return 404 `error.evaluation.no-evaluation-found` when no evaluation exists, instead of creating a new one
* feat(web-app): rework role-based grade anonymization; team data returns empty string for `TEAM_MEMBER`, cumulative value for `MANAGER`
* feat(ui): add `canEdit` and `deadlineDate` state properties to the competency evaluation model
* feat(ui): navigate to dashboard on HTTP 401 during `loadEmployeeEvaluation` and on successful `submitEvaluation`
* feat(ui): update `formatDate` to accept a `placeholder` parameter and return the corresponding label for invalid dates
* feat(ui): simplify `getItemGrade` and `setItemGrade` to use a flat `grades[competencyCode][role]` structure, removing team cumulative branching
* feat(ui): add a role banner to the evaluation form with employee, manager, and team color variants
* feat(ui): add `canEdit` guard to evaluation form container and action buttons
* feat(ui): replace interview date input with a static display showing the interview date and submission deadline
* feat(localization): add evaluation state labels (`active-evaluation-exists`, `already-completed-manager-evaluation`, `already-completed-team-evaluation`, `incomplete-grades`, `no-employee-found`, `no-evaluation-found`)
* feat(localization): add role-based banner labels (`interface.evaluation.banners.employee/manager/team`)
* feat(localization): add submission deadline and interview date UI labels for personal and appraisal sections
* feat(css): add `.role-banner` container with `employee`, `manager`, and `team` gradient color variants
* feat(error-handling): enforce explicit HTTP 401 on unauthorized access, 404 on missing employee/evaluation, and 422 on incomplete grades
* feat(config): add `COMPETENCE_PRELOAD_DATA` environment variable (default: `false`) to control data preloading at startup
* refactor(data): update `evaluations.json` seeder to use empty grade placeholders across all evaluation records
* build(deps): remove `postgres` direct dependency (delegated to framework layer)

## Version 1.0.2

* feat(config): add `config.application.json` with `performanceAppraisals` settings (`minTeamEvaluationMembers`, `numberOfNextPeriodGoals`)
* feat(config-loader): replace `organizationRoleCode` with `roleCode`; add `evaluationStatus` and `evaluationGrade` enum exports
* feat(data): add `bin/data/seeders/evaluations.json` seeder with workflow-aware evaluation records
* feat(data-manager): replace `data-loader` with `data-manager` that supports data storage and retrieval from Redis Cache
* feat(definitions): add typedefs for `Employee` and `Evaluation` with corresponding JSON Schemas
* feat(definitions): add `EvaluationStatusValue`, `EvaluationWorkflow`, and `EvaluationFeedback` typedefs
* feat(definitions): expand `Evaluation` typedef with `managerID`, `comment`, `feedback`, and `workflow` properties
* feat(definitions): restructure `Employee` typedef using `EmployeePersonalInformation` and `EmployeeManagerInformation` sub-types
* feat(definitions): add `CompetencyScope`, `CompetencyRelevancy`, `Competency`, and `RoleCodeValue` typedefs
* feat(definitions): update `EvaluationGradeEntry` with structured `team` grade containing `cumulative` and `individual` sub-fields
* feat(localization): add error messages for application and evaluation error scenarios
* feat(localization): add notification labels for `draft-saved` and `submitted` UI feedback messages
* feat(schema): update `employee.schema.json` with nested `personal` and `manager` objects
* feat(schema): update `evaluation.schema.json` with `managerID`, `comment`, `feedback`, `workflow` fields and expanded `status` enum (added `Ready`)
* feat(ui): add button bar to the evaluation screen with `save draft`, `reset`, and `submit` actions
* feat(ui): add team grade handling with `cumulative` and `individual` sub-structures in `getItemGrade`/`setItemGrade`
* feat(web-app): replace `load-employee-competencies` view with `load-evaluation` view
* feat(web-app): add `submit-evaluation` service request handler with role checks, deadline enforcement, and status transitions
* feat(web-app): add `save-evaluation-draft` service request handler with role-based authorization
* feat(web-app): add evaluation initialization logic with default workflow state, grades, feedback, and comment structures
* feat(web-app): add grade anonymization based on user role before returning evaluation responses
* feat(web-server): change `onStart` sequence to also initialize the new data manager
* refactor(config): remove static `roles.json` configuration file (replaced by dynamic role codes in configuration-loader)
* refactor(css): migrate CSS custom properties and class selectors from `competence-*` to `ti-*` design token naming scheme
* refactor(data): update `employees.json` seeder to use nested `manager` object structure
* refactor(data): move seed data files to `bin/data/seeders/` directory
* refactor(package): update `#data-employees` and `#data-evaluations` import mappings to reference seeder files; remove `#config-roles` import
* refactor(test): update all test references from `load-employee-competencies` to `load-evaluation` view
* refactor(test): remove `organizationRoleCode` test suite from configuration-loader tests
* refactor(ui): replace `isEmployee`/`isEmployeeManager` helpers with numeric `userRole` checks
* refactor(ui): rename `loadEmployee` to `loadEmployeeEvaluation` and update backend URL to `/app/load-evaluation`
* refactor(web-app): rename competency property keys (`code` → `competencyCode`, `categoryId` → `categoryID`, `subId` → `subID`)
* fix(data-manager): replace `E_WEB_INVALID_REQUEST_PARAMETERS` with `E_APP_RESOURCE_NOT_FOUND` for not-found scenarios
* fix(data-manager): use config-driven status values in `fetchEvaluations` instead of hard-coded strings
* fix(data-manager): update `saveEvaluation` to correctly return `Promise<Evaluation>` resolving with the saved evaluation
* docs(competence): add `README.md` with module overview and default process workflow diagram (Mermaid)

## Version 1.0.1

* feat(config): add new position competencies mapping file `bin/config/positionCompetencies.json`
* feat(config): add evaluation grades configuration file `bin/config/grades.json`
* feat(config): add comprehensive competency mappings for SOFTWARE_ENGINEER, PROJECT_MANAGER, and BUSINESS_ANALYST across all levels (N1-T1)
* feat(data): add employee data file `bin/data/employees.json` with sample employee records
* feat(data): add evaluation data file `bin/data/evaluations.json` with sample evaluation records
* feat(loader): add a configuration loader module for centralized configuration access with immutability guarantees
* feat(loader): add data loader singleton for employee and evaluation data retrieval
* feat(web-app): add `processDataRequest` method for handling data view requests
* feat(web-app): add config view support with augmented grades configuration
* feat(web-app): add a load-employee-competencies view with comprehensive data assembly
* feat(web-app): add competencies tree building with localization and position-based filtering
* feat(web-app): add grade normalization for employee, manager, and team evaluations
* feat(ui): add competence evaluation HTML fragment with Alpine.js integration
* feat(ui): add competence evaluation client-side data model and UI logic
* feat(ui): add nested competency list with category/subcategory/item hierarchy
* feat(ui): add personal information and appraisal panels
* feat(ui): add interactive grade selection inputs for employee, manager, and team roles
* feat(ui): add data loading, merging, and state management utilities
* feat(ui): add summary calculation methods (per-category and total)
* feat(ui): add date formatting and role-checking utilities
* feat(css): add comprehensive competence UI stylesheet with design system
* feat(css): add grid-based layouts for competency display and data values
* feat(css): add responsive media queries for mobile/tablet viewports
* feat(css): add special styling for grade inputs and category/subcategory headers
* feat(html): add main index.html page with HTMX integration and CSP nonce support
* feat(localization): add Bulgarian translations for competency labels
* feat(localization): add framework grades localization (R, S, U)
* feat(localization): add interface evaluation labels for personal, appraisal, and competencies sections
* feat(definitions): add new configuration exports (configEvaluationLevels, configCompetencies, configEvaluationGrades)
* feat(package): add package imports for all config and data files
* feat(package): add configuration-loader and data-loader import mappings
* feat(package): add test scripts (`test` and `test:json`)
* feat(test): add comprehensive unit tests for CompetenceWebApplication (50+ tests)
* feat(test): add comprehensive unit tests for CompetenceWebServer (70+ tests)
* feat(test): add comprehensive unit tests for configuration-loader (70+ tests)
* feat(test): add comprehensive unit tests for data-loader (40+ tests)
* feat(test): add JSON configuration validation tests (28 tests, all passing)
* feat(test): add test README with execution instructions and coverage summary
* feat(test): add test generation summary document with detailed metrics
* refactor(config): rename "competence" to "competency" throughout configuration and localization
* refactor(config): update competency IDs from string-based positions to position code-based mappings
* refactor(definitions): reorganize exports to use configuration-loader constants
* refactor(localization): expand and refine English descriptions for competencies
* build(deps): update postgres from ^3.4.7 to ^3.4.8
* build(engines): update Node.js requirement from >=18.0.0 to >=20.0.0
* build(env): update TI_AUDITING_LOG_MIN_LEVEL from 200 to 0
* docs(copyright): update copyright year from 2025 to 2026
* chore(cleanup): remove obsolete employee.json template file

## Version 1.0.0

* feat: first working prototype version
