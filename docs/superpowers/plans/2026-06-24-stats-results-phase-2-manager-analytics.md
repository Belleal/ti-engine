# Stats & Results — Phase 2: Manager / team analytics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (sequential, single branch). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Re-scope the six leadership reports to a manager's multi-level subtree (a Team analytics screen), add the **Grader Calibration** report, and the by-name roster + drill-to-person — reusing the Phase 1 compute layer unchanged.

**Architecture:** The analytics layer is already manager-ready (verified, audit `wf_43cccae0`): `_resolveWith` narrows **both** frame and roster by `filter.allowedEmployeeIDs` once, before dispatch, so all six computes inherit the subtree cohort with zero edits; `resolveScopeFilter({isSupervisor:false,managerUnitID,subtreeEmployeeIDs})` already returns the right filter. Phase 2 is almost entirely **web + UI wiring** plus the one new `computeCalibration` algorithm.

**Tech Stack:** CommonJS; `node --test`; Alpine CSP; the Phase 1A `ti-chart-*` primitives + Phase 1B spec-builders (reused).

## Global Constraints
- **Manager cohort = `isSuperiorManagerOfEmployee(managerID, employeeID)`** (multi-level), never `managerID` equality (resolved §7.7). Build `subtreeEmployeeIDs` by `buildRoster(getOrganizationUnitSubtree(managerUnitID))`.
- **Scope by the requesting user's own subtree.** Team screen = YOUR subtree (manager → their team; supervisor → their unit's subtree). No manager-selector in this MVP (supervisor-over-manager calibration selection is a noted follow-up).
- **CLOSED-cycle manager recompute** (allow-list ⇒ recompute branch, not snapshot projection): identical numbers, slower first view — surface in the caveat copy.
- **Privacy:** team is cumulative-only (structural); small-n suppression `n<3` (`MIN_COHORT_SIZE`); the team roster is by-name *because the allow-list pre-filters frame+roster*, so every row is in-scope by construction; drill re-gates `isSuperiorManagerOfEmployee` server-side.

## Pinned decisions (design-faithful defaults; flagged to owner)
1. **Calibration gaps = plain unweighted deltas in weight space** (mgr−self, mgr−team; S=1.3/R=1.0/U=0.6/N=0.0). Exclude pairs where a side is ungraded; roll up to subcategory/category/overall by plain mean of per-competency gaps, tracking `n`; suppress `n<3`. `+` ⇒ grader more lenient. (Design §3 says "signed gaps in weight space," no relevancy — unlike R6.)
2. **`computeCalibration(frame, filter)`** dispatched via `#computeReport` (the design's `getCalibrationReport(cycleID, managerID)` predates the locked `(frame, filter)` convention; `filter.managerID` carries the grader). Filters the (already subtree-scoped) frame to rows where `managerID === filter.managerID` (the requesting grader's own grading).
3. **Drill-to-person reuses `load-evaluation`** (already re-gates via `#canManagerPerformEvaluation`/`isSuperiorManagerOfEmployee`; hard-rejects CLOSED — acceptable, the team view is for live cycles). The per-competency alignment gap drill (`#loadAlignmentDrill`) already exists from Phase 1.

## File structure
```
packages/competence/
  application/results-analytics.js        (modify: + computeCalibration + dispatch + #emptyReport case + snapshot)
  bin/competence-web-application.js       (modify: scope-aware report filter helper; widen handlers MANAGER|SUPERVISOR on scope=team; load-insights-team; load-report-calibration; addFragment; sidebarNavMapping)
  bin/static/fragments/components/component-sidebar.html  (modify: + insights-team button)
  bin/static/fragments/frame-insights-team.html           (new: clone of cycle, x-data=insightsTeam, + calibration card)
  bin/static/scripts/competence-user-interface.js         (modify: + configureInsightsTeam + buildCalibrationSpec + alpine:init)
  bin/localization/competence-labels.json                 (modify: + interface.navigation.insights-team + interface.insights.team.* + reports.calibration.*)
  test/results-analytics.test.js          (modify: computeCalibration + manager-scope resolve tests)
```

---

## Task M1a — Scope-aware report filter (web layer)
**Files:** `competence-web-application.js`, `test` (none — web handlers aren't unit-tested; verify via syntax+eslint+manual).

**Produces:** a private `#resolveReportScope(session, options)` → `{ cycle, filter }` that, for `options.query.scope === "team"`, gates `MANAGER|SUPERVISOR` and builds the requesting user's subtree allow-list (`resolveOrganizationUnitIDForEmployee(userID)` → `getOrganizationUnitSubtree` → `buildRoster` → ids → `resolveScopeFilter`); else gates `SUPERVISOR` and uses whole-org (`allowedEmployeeIDs:null`, org-root). Both pick the cycle via `pickCycleForRequest`.

- [ ] Refactor `#loadReportCoverage` and `#loadLeadershipReport` to call `#resolveReportScope`, then set their groupBy/source/category/reportKey and call `resolve`. Coverage keeps `groupBy:"orgUnit"` default.
- [ ] The whole-org (cycle screen) path is unchanged behaviorally (scope omitted → SUPERVISOR whole-org).
- [ ] Commit: `feat(competence): scope-aware leadership-report filter (team subtree vs org) (CA-68)`

## Task M1b — Team screen shell + IA
- [ ] `addFragment("insights-team", …)`; `sidebarNavMapping["insights-team"]="insights"`.
- [ ] `load-insights-team` handler (clone `#loadInsightsCycle`, gate `MANAGER|SUPERVISOR`, subtitle notes subtree scope).
- [ ] Sidebar button (after `insights-cycle`, **no nested `hasRole(3)`** — parent group already gates Manager+Supervisor).
- [ ] `frame-insights-team.html` (clone `frame-insights-cycle.html`; `x-data="insightsTeam"`; team title/subtitle; the six cards request `?scope=team`).
- [ ] `configureInsightsTeam` (clone `configureInsightsCycle`; load-insights-team + the six reports with `&scope=team`; reuse all spec-builders) + `Alpine.data("insightsTeam", …)`.
- [ ] Labels: `interface.navigation.insights-team`, `interface.insights.team.{title,sub,…}`.
- [ ] Commit: `feat(competence): team analytics screen (subtree-scoped six reports) (CA-68)`

## Task M3 — By-name roster + drill-to-person
- [ ] Roster by-name is free (allow-list pre-filters). Wire the coverage pending-row + (where useful) report drill to open the person's evaluation via the existing `load-evaluation` screen (navigation), re-gated server-side.
- [ ] Commit (may fold into M1b): `feat(competence): team coverage by-name + drill-to-person (CA-68)`

## Task M2 — Grader Calibration
**Contract:** `{ cohortSize, pairsCompared:{self,team}, overall:{vsSelf:{meanGap,n},vsTeam:{meanGap,n}}, byCategory:{E,I,C:{vsSelf,vsTeam}}, bySubcategory:{E1..C3:{vsSelf,vsTeam}}, perCompetency:[{code,subcategory,vsSelf,vsTeam}] }`. Each `{meanGap,n}` or `{suppressed:true,n}` when `n<3`.

- [ ] **TDD** `computeCalibration(frame, filter)`: filter to `managerID===filter.managerID`; per competency, `mgr−self` / `mgr−team` over graded pairs; plain-mean rollups + `n`; small-n suppression. Tests: a cohort where the manager is uniformly +0.3 vs self → overall.vsSelf.meanGap≈0.3; ungraded pairs excluded; n<3 cell suppressed.
- [ ] Dispatch `calibration` in `#computeReport` + `#emptyReport` shape; populate snapshot `reports.calibration` (optional — calibration is manager-scoped; may stay live-only since the whole-org snapshot can't carry per-manager calibration — note it).
- [ ] Endpoint `load-report-calibration` (scope=team; `filter.managerID = requesting userID`).
- [ ] UI: `buildCalibrationSpec` (ti-chart-bars diverging, one row per subcategory, vs-self/vs-team) + an overall-gap KPI (ti-chart-stat) + per-competency drill table; calibration card in `frame-insights-team.html`; methodology + title labels.
- [ ] Commit: `feat(competence): grader calibration report (mgr vs self/team gaps) (CA-68)`

## Verification gate
`npm --prefix packages/competence test` green (computeCalibration + manager-scope resolve tests); eslint clean; a manager sees ONLY their subtree, a supervisor sees their org subtree, calibration over the requester's own grading; team is cumulative-only; drill re-gated. Then an adversarial review workflow (scope-leak, calibration math, CSP/wiring) before CA-68 done.

## Self-review
- Manager cohort uses `isSuperiorManagerOfEmployee` (via subtree roster), never `managerID` equality. ✓
- The six computes are reused unchanged; only `_resolveWith` allow-list narrows. ✓
- Calibration is the only new compute; plain weight-space deltas; small-n suppressed. ✓
- CLOSED manager recompute trade-off surfaced in caveat copy. ✓
