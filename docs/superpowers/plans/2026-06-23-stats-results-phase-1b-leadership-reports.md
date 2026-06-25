# Stats & Results — Phase 1B: Leadership report aggregation (R2–R6) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (sequential, single branch) — NOT parallel. All five compute methods land on the one file `results-analytics.js` and all touch the same dispatcher/empty-report/snapshot lines; parallel work WILL collide. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement the five remaining leadership reports (R2 time-distribution, R3 alignment, R4 heatmap, R5 level-distribution, R6 predictive-drivers) as pure compute methods on `results-analytics.js` over the existing CohortRow frame, wire them through `resolve`/snapshot, surface them on the supervisor-gated insights-cycle screen, and give each report a **methodology info block** sourced from `competence-labels.json` (en/bg).

**Architecture:** New pure methods on the `ResultsAnalytics` singleton, each taking the already-built frame (+ roster/slots/today as needed) and returning a chart-ready payload matching a `ti-chart-*` contract. The web layer adds `load-report-*` endpoints mirroring `#loadReportCoverage`; the UI adds per-report spec-builders + fragment cards + info blocks. Everything is verified against the real code by the 2026-06-23 readiness audit (workflow `wf_b5cf6d99`).

**Tech Stack:** CommonJS; `node --test` + hand-built fixtures (the Coverage/`task-resolver` precedent — no Redis, no DOM); the Phase 1A `ti-chart-*` primitives (scatter/heatmap/box/grouped/diverging) already shipped.

## Global Constraints

- **Sequential, one branch.** Shared-file hot spots: `#computeReport` dispatch (`results-analytics.js:425-430`), `#emptyReport` (`:438-441`), `buildResultsSnapshot.reports{}` (`:569-576`). Step 0 refactors these once so each report step touches only its own method + one dispatch line.
- **Reuse the exact scoring path.** Grade weights S/R/U/N = 1.3/1.0/0.6/0.0; evaluationWeights self/team/manager = 0.2/0.3/0.5; thresholds T1–T5 = 76/89/105/119/150; `SUBCATEGORIES` = E1,E2,E3,I1,I2,I3,C1,C2,C3 (`competence-framework.js:38`). Category score = `ceil((selfShare·0.2+teamShare·0.3+mgrShare·0.5)·100)`, each share = `Σ(gradeWeight·relevancy)/Σrelevancy`; final = `ceil(mean of category scores)`; band cascade ascending T1→T5, first `score<=threshold` else T5.
- **Score-based reports (R3–R6) use the *reported* subset** (`isScored && status ∈ {Ready,Closed}`). Coverage/Time use the full in-scope set.
- **Privacy:** team is cumulative-only in the frame already; small-n suppression `n < 3` (`minCohortSize`). Drill re-gates `isSuperiorManagerOfEmployee` server-side.
- **CommonJS, `#alias` imports, no new npm deps** (hand-roll `#pearson`), Promise-chain style for I/O methods, frozen singleton.

## Pinned decisions (resolved this session; no further owner input needed)

1. **R5 expected curve = maturity-step (Candidate 1), owner-approved.** Per competency, from its `relevancyArchetype` weight curve `w[level]`: `peak = max(w)`, `intro = 0.5·peak`, `mature = 0.9·peak`; `expectedGrade = w < intro ? "U" : (w < mature ? "R" : "S")` (**strict `<`**). Per-level expected score = run the exact scoring path with this expected grade substituted for **all three sources**, using the cohort's snapshot relevancy at that level. Verified rising (not strictly monotone). Render the per-box expected marker + keep T3=105 reference; a11y/info-block must say "typical target-performer trend, not guaranteed monotone."
2. **R4 expected REUSES R5's `#expectedGradeForArchetype`** (the only grounded definition) — no separate heatmap-expected formula.
3. **R6 per-(row,subcategory) value** feeding Pearson = the subcategory's blended share `(selfShare·0.2+teamShare·0.3+mgrShare·0.5)` restricted to that subcategory's competencies (shares = `Σ(gradeWeight·relevancy)/Σrelevancy` over the subcat's comps) — i.e. the subcategory's own contribution in score space. Correlate that per-row vector against `finalScore.score`.
4. **R6 empiricalShare** = `|r| / Σ|r|` over the 9 subcategories (abs, since negative correlation still signals influence). `misweightFlag` when `|empiricalRank − configuredRank| ≥ 2`.
5. **R6 / R5 stats helpers hand-rolled** (no dep): `#pearson(x,y)` → `null` for n<2 or zero-variance; `#nearestRankPercentile(sortedArr, p)` for the box five-number summary.
6. **R2 "held" is a labeled proxy** (`interviewDate ≤ today AND status ∈ {Ready,Closed}`), surfaced as "finalized (proxy for held)"; "planned" = booked calendar slots by month; "unscheduledReady" = Ready with no `interviewDate`. `today` + slots injected via the resolve deps (verify `slot.date`/`slot.status` shapes during R2).
7. **R3 byCategory[E|I|C]** ships "overall" first; per-category is a follow-up (not a blocker).

## File structure

```
packages/competence/
  application/results-analytics.js   (modify: Step 0 scaffolding + 5 compute methods + getAlignmentForEmployee + snapshot population)
  bin/config/config.application.json (modify: + performanceAppraisals.alignmentQuadrantMidpoint: 1.0)   [R3 only]
  bin/data/schemas/config.application.schema.json (modify: + alignmentQuadrantMidpoint property)          [R3 only]
  application/data-objects.types.js  (modify: correct stale interviewDate comment :197)                   [R2]
  bin/competence-web-application.js  (modify: + 5 load-report-* + 1 alignment-drill endpoint)
  bin/static/scripts/competence-user-interface.js (modify: insightsCycle + 5 spec-builders + info-block accessors)
  bin/static/fragments/frame-insights-cycle.html  (modify: + 5 report cards + info blocks)
  bin/localization/competence-labels.json (modify: + interface.insights.cycle.reports.<key>.{title,whatItShows,methodology} en/bg)
  test/results-analytics.test.js     (modify: per-report describe blocks)
```

---

## Task 0 — Shared scaffolding (do once, commit alone)

**Files:** `results-analytics.js`, `test/results-analytics.test.js`.

**Produces:** `#computeReport` as a 6-key dispatch (coverage real + 5 stubs → `#emptyReport`); per-key `#emptyReport`; pure `#expectedGradeForArchetype(weights, stageLevel)`; pure `#pearson(x,y)`; pure `#nearestRankPercentile(sortedAsc, p)`. (`#expectedGradeForArchetype`, `#pearson`, `#nearestRankPercentile` exposed for tests via a thin non-`#` wrapper or tested through their consuming method — prefer a module-level export of the pure stats helpers, mirroring `pickCycleForRequest`.)

- [ ] **Step 1 — failing tests** for the pure helpers (export them at module level like `pickCycleForRequest`):
  - `expectedGradeForArchetype({N1:6,J1:7,...,T1:9}, "N1")` → `"R"`; at a level where `w >= 0.9·peak` → `"S"`; where `w < 0.5·peak` → `"U"`. Use Archetype A weights `[6,7,7,8,8,8,9,9,9,9,9,9]` (peak 9 → intro 4.5, mature 8.1): N1(6)→R, R3(9)→S, and a synthetic `w=4`→U.
  - `pearson([1,2,3],[2,4,6])` → `1`; `pearson([1,2,3],[6,4,2])` → `-1`; constant vector → `null`; n<2 → `null`.
  - `nearestRankPercentile([10,20,30,40,50], 0.5)` → `30` (median); `0` → `10`; `1` → `50`; `0.25` → `20`.
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — implement** the three pure helpers (module-level, frozen exports) + refactor `#computeReport` into a dispatch object `{ coverage, timeDistribution, alignment, heatmap, levelDistribution, predictiveDrivers }` where the five new keys initially delegate to `#emptyReport`; extend `#emptyReport` to return a per-key empty shape (e.g. `{ timeDistribution: { rows: [], perManager: [] } }`, `{ alignment: { points: [], quadrantCounts: {}, diagonal: true } }`, etc.).
- [ ] **Step 4 — run → PASS** (coverage behavior unchanged; new keys return empty shapes).
- [ ] **Step 5 — commit:** `feat(competence): results-analytics Step 0 — dispatch map + expected-grade/pearson/percentile helpers (CA-67)`

---

## Task 1 — R5 `computeLevelDistribution` (FIRST — locks the expected helper R4 needs)

**Contract:** `{ groups:[{id,label,min,q1,median,q3,max,n,mean,expected,suppressed?}], reference:[{v:105,label:"T3"}] }` keyed by the 12 stage-levels (N1,J1–J3,R1–R3,S1–S3,X1,T1), kept even when empty (drift narrative).

**Method:** `computeLevelDistribution(frame, filter, archetypeWeightsByCode)` — pure; archetype weights injected (the live `resolve` supplies them from `configurationLoader` + the competency→archetype map; tests pass fixtures). For each stage-level bucket of reported rows: five-number summary via `nearestRankPercentile` over `finalScore.score`; `mean`; **`expected`** = per-level expected score computed by substituting `expectedGradeForArchetype` for all three sources over the cohort's per-competency relevancy at that level, through the exact scoring path. Suppress `n<3`.

- [ ] **Step 1 — failing tests** with hand-built fixtures keyed to the audited curve: a single-archetype-A cohort yields per-level expected `[100×6 (N1..R3), 130×6 (S1..T1)]` (A: R below S1, S from S1); assert `expected` at N1=100 and S1=130. A mixed full-cohort fixture asserts the expected is rising overall (`expected[T1] > expected[N1]`) and non-strict (allow a dip). Five-number summary correctness on a known score vector.
- [ ] **Step 2 → FAIL. Step 3 — implement.** Reuse the scoring math exactly (skip competencies with no snapshot entry / zero relevancy, mirror `framework.js:476-478,500-503`).
- [ ] **Step 4 → PASS.** Wire `levelDistribution` into the dispatch map (delegate to `computeLevelDistribution`) + populate `snapshot.byStageLevel`/`reports.levelDistribution`.
- [ ] **Step 5 — commit:** `feat(competence): R5 level-distribution box-plots + rising archetype-mix expected curve (CA-67)`

---

## Task 2 — R4 `computeCompetenceHeatmap` (reuses R5 expected)

**Contract:** `{ rows:[{id,label}](9 subcats), cols:[{id,label}](groups), cells:[{r,c,v,n,expected,delta,suppressed?}] }`, `options.scale` sequential(value)|diverging(gap).

**Method:** `computeCompetenceHeatmap(frame, filter, archetypeWeightsByCode)` — per `(subcategory, groupKey)`: relevancy-weighted mean of the selected `filter.source` grade (`v`); `expected` = relevancy-weighted mean of `expectedGradeForArchetype` over the same competencies at the rows' levels; `delta = v − expected`; suppress `n<3`.

- [ ] **Step 1 — failing tests:** cell `v` is the relevancy-weighted source mean; `expected` uses the R5 helper; `delta = v − expected`; small-n suppressed. **Step 2 → FAIL. Step 3 — implement. Step 4 → PASS** + dispatch + `snapshot.bySubcategory`.
- [ ] **Step 5 — commit:** `feat(competence): R4 competence heatmap (value + gap vs archetype-mix expected) (CA-67)`

---

## Task 3 — R6 `computePredictiveDrivers` (uses #pearson)

**Contract:** `{ rows:[{id,label,r,empiricalShare,configuredShare,divergence,misweightFlag}], insufficientData?:bool }`, sorted by `r` desc. Min N=5.

**Method:** per subcategory, build the per-row value vector (decision 3) + the `finalScore.score` vector → `pearson`; `empiricalShare = |r|/Σ|r|`; `configuredShare[subcat] = Σ relevancy in subcat / Σ relevancy all subcats` (over the cohort, decision 4); `divergence`; `misweightFlag` rank Δ≥2.

- [ ] **Step 1 — failing tests:** a fabricated cohort where E1 perfectly tracks final → `r(E1)≈1`; `<5` rows → `insufficientData`; configuredShare sums to ~1; a planted rank gap raises `misweightFlag`. **Step 2 → FAIL. Step 3 — implement. Step 4 → PASS** + dispatch + `snapshot` (drivers are per-cycle; store in `reports.predictiveDrivers`).
- [ ] **Step 5 — commit:** `feat(competence): R6 predictive drivers — Pearson influence vs configured relevancy share (CA-67)`

---

## Task 4 — R2 `computeTimeDistribution` (needs slots + today)

**Contract:** `{ rows:[{monthKey,planned,held,unscheduledReady,n}], perManager:[{managerID,rows:[...]}] }`.

**Method:** `computeTimeDistribution(frame, slots, today, filter)`. held(proxy)=`interviewDate≤today && status∈{Ready,Closed}` bucketed by `interviewDate` month; planned = booked slots (`slot.status==="booked"`) by `slot.date` month; unscheduledReady = Ready && no `interviewDate`. Per-manager via `row.managerID`. **First verify `slot.date`/`slot.status` (and whether a `slot.booking.evaluationID` join is needed) by reading the calendar code.** Thread `slots`+`today` into the `resolve` deps (the only report that changes wiring — isolate). Correct the stale `interviewDate` typedef comment (`data-objects.types.js:197`).

- [ ] **Steps:** failing tests (held/planned/unscheduledReady bucketing by month; per-manager) → FAIL → implement (+ resolve deps wiring for slots/today) → PASS → dispatch + `snapshot.reports.timeDistribution` → **commit:** `feat(competence): R2 interview time distribution (planned/held-proxy/unscheduledReady) (CA-67)`

---

## Task 5 — R3 `computeAlignment` + drill (LAST — config + schema + drill skeleton)

**Contract:** `{ points:[{evaluationID,employeeRef,roleFamily,organizationUnitID,x,y,z,quadrant,gap}], quadrantCounts:{}, diagonal:true }`. `x=avgManager, y=avgSelf, z=avgTeam` (relevancy-weighted per-source means over graded comps). Quadrant split at `getSetting("performanceAppraisals.alignmentQuadrantMidpoint", 1.0)`.

- [ ] **Step A — config:** add `alignmentQuadrantMidpoint: 1.0` under `performanceAppraisals` in `config.application.json` **and** the matching property (type number, default 1.0, description) in `config.application.schema.json`; commit alone (`feat(competence): add alignmentQuadrantMidpoint setting + schema (CA-67)`) so the config/schema change is off the critical path.
- [ ] **Step B — compute:** `computeAlignment(frame, filter, midpoint)` per-source means + quadrant + `gap=|x−y|` + counts; tests; dispatch + `snapshot.reports.alignment`.
- [ ] **Step C — drill:** `getAlignmentForEmployee(cycleID, employeeID)` returning per-competency self/manager/team + gap sorted desc; the web endpoint threads `session.user.employeeID` and re-gates `isSuperiorManagerOfEmployee(requesterID, employeeID)` (a DIFFERENT skeleton than the 5 supervisor-only report endpoints).
- [ ] **Step D — commit:** `feat(competence): R3 alignment quadrant + per-employee blind-spot drill (CA-67)`

---

## Task 6 — Web endpoints + UI spec-builders + fragment cards + info-block labels

Additive, non-conflicting once the compute layer exists. Batch after the compute methods (or incrementally per report).

- [ ] **Web:** add `#loadReportTimeDistribution/Alignment/Heatmap/LevelDistribution/PredictiveDrivers` mirroring `#loadReportCoverage` (`competence-web-application.js:2553`) + the 5 `processDataRequest` branches (`:240`); the alignment **drill** endpoint uses the requesterID-threaded skeleton.
- [ ] **UI:** extend `insightsCycle` `loadAll` Promise.all with the 5 endpoints; add `build<Report>Spec(payload, meta)` per report producing the right `ti-chart` spec (R2→bars grouped, R3→scatter, R4→heatmap, R5→box, R6→bars diverging); per-report `get<Report>AriaLabel()`.
- [ ] **Fragment:** add a `.ti-card` per report in the `.ti-insights-grid` with `x-ti-chart` + an **info block** (`<p class="ti-panel-body-intro" x-text-label="interface.insights.cycle.reports.<key>.methodology">`), plus a `whatItShows` line. Also add the missing `.ti-insights-grid` / `.ti-card-wide` CSS (Phase 0 gap) to `competence-main.css`.
- [ ] **Labels (info-block content — owner-requested first-class deliverable):** add `interface.insights.cycle.reports.<key>.{title,whatItShows,methodology}` (en + bg) for all six reports. **Author the copy from the locked semantics** (correct the audit draft): R5 methodology must explain the maturity-step expected as "the score a typical performer who has *mastered the competencies expected at their level* would earn — it trends upward because more competencies are expected at the 'strong' level as people advance, though it is a trend, not a strict step." R2 must label held as "finalized (proxy for the interview having taken place)." R4 must describe sequential value vs diverging gap-vs-expected. Verify E/I/C category display names against existing labels before writing. (BG may be marked pending native review, per the repo convention.)
- [ ] **Commit(s):** `feat(competence): leadership report endpoints + screen cards + methodology info blocks (CA-67)` (split per report or batched as size dictates).

## Verification gate (Phase 1B done)

`npm --prefix packages/competence test` green (per-report describe blocks); `npm --prefix packages/competence run test:json` green (config schema accepts `alignmentQuadrantMidpoint`); eslint clean; all six reports render live + from snapshot on the insights-cycle screen in both themes, each with its info block; R3 drill re-gates server-side. Then an adversarial review pass (workflow) over the five new compute methods before marking CA-67 done.

## Self-review checklist

- Every report maps to a Phase-1A primitive (R2→bars grouped, R3→scatter, R4→heatmap, R5→box, R6→bars diverging). ✓
- R4 and R5 share ONE expected definition (`#expectedGradeForArchetype`). ✓
- Only R3 adds config; schema updated in lockstep. ✓
- Score-based reports filter to the reported subset; small-n suppressed; team cumulative-only; drill re-gated. ✓
- Sequential single-branch; Step 0 removes the dispatcher/empty/snapshot merge hot spots. ✓
