# Stats & Results — Phase 3: Individual results — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (sequential). Steps use checkbox (`- [ ]`) syntax.

**Goal:** The evaluee's own results — an enhanced READY view on the evaluation screen (gauge hero, per-category bars, 9-subcategory radar, source-comparison bars, strengths/gaps, feedback recap) plus a "My results" Workspace entry for the latest READY/CLOSED evaluation.

**Architecture:** Reuses the Phase 1A chart primitives + adds **radar** (web-framework). The READY view-model `buildResults()` runs **client-side**, recomputing per-source category/subcategory means from the raw `grades{}` letters + the per-evaluation snapshot relevancy (because `scores[E/I/C]` is pre-blended `self·0.2+team·0.3+mgr·0.5` and irreversible). CLOSED history reads the **raw closed evaluation** self-scoped (NOT the anonymized snapshot). Verified by audit `wf_81aef643`.

**Tech Stack:** CommonJS; `node --test` (radar primitive); Alpine CSP (the evaluation component + fragment); existing `load-evaluation` payload + a new `load-my-results`.

## Global Constraints / pinned facts (verified)
- **scores[E/I/C].score is pre-blended → cannot decompose.** The client recomputes per source from raw grades + snapshot relevancy.
- **Self key is `grades[code].employee`** (raw eval), NOT `.self` (that's the analytics-frame key). Manager `grades[code].manager`; team `grades[code].team.cumulative` (a string at READY after the peer-collapse).
- **T-band cascade (mirror exactly, `competence-framework.js:487-491/507-511`):** iterate thresholds ascending T1→T5, assign the FIRST where `score <= threshold`, else T5. (`105 → T3`, not T4.)
- **Category score** = `ceil((selfShare·0.2 + teamShare·0.3 + mgrShare·0.5)·100)`, share = `Σ(gradeWeight·relevancy)/Σ relevancy`; final = `ceil(mean of category scores)`.
- **gradeWeights** S/R/U/N = 1.3/1.0/0.6/0.0 (derivable client-side from `config.grades[code].value`).
- **CLOSED individual data source = the raw closed evaluation** (`fetchEvaluations(employeeID)` keeps CLOSED). The snapshot is anonymized-by-construction and is NEVER an individual source — **correct the design §3 wording.**
- **Privacy:** `load-my-results` ALWAYS re-applies `anonymizeEvaluationGrades/Scores(EMPLOYEE)` (incl. CLOSED) — peer `individual[]` collapsed to `team.cumulative` (`competence-framework.js:609-613`). Alpine CSP: no inline style, no `?.`, `x-text-label`/`x-ti-chart`/method calls only.

## File structure
```
packages/web-framework/bin/static/scripts/ti-charts.js   (modify: radarLayout + renderRadar + SUPPORTED_TYPES + dispatch + export)
packages/web-framework/bin/static/scripts/ti-framework.css (modify: .ti-chart-radar-* + [data-ti-chart-type=radar] cap)
packages/web-framework/test/ti-charts.test.js            (modify: radarLayout + render tests)
packages/competence/bin/competence-web-application.js     (modify: config view + evaluationWeights/performanceThresholds; load-evaluation READY snapshot relevancy; load-my-results)
packages/competence/bin/static/scripts/competence-user-interface.js (modify: buildResults() + tBand + spec-builders on the evaluation component; My results nav)
packages/competence/bin/static/fragments/frame-competence-evaluation.html (modify: READY results blocks; widen team-comments guard :417)
packages/competence/bin/static/fragments/components/component-sidebar.html (modify: "My results" Workspace entry, EMPLOYEE-gated)
packages/competence/bin/localization/competence-labels.json (modify: results-block + My-results labels en/bg)
packages/competence/application/results-analytics.js / data-objects.types.js (doc: none required; design-doc §3 wording fix)
```

---

## Task P1 — Radar primitive (web-framework, TDD)
**Contract:** `{ axes:[{id,label,max}], series:[{key,values:{E1:..},tone,style?}] }`.
**Produces:** pure `radarLayout(axes, series, opts)` + `renderRadar(figure, spec)`; `radar` in SUPPORTED_TYPES + dispatch + export.

- [ ] **radarLayout** (pure): N axes spaced `360/N` from `startAngle=-90` (top), clockwise; per axis outer point at `rMax` (via `_polar`); rings as polygons at fractions [0.25,0.5,0.75,1]; per series a polygon `points` string with each vertex at `rMax·clamp(value/axis.max,0,1)` on its axis + per-vertex dots; axis label positions at `rMax+pad`. Returns `{ cx, cy, rMax, axes:[{id,label,angle,outerX,outerY,labelX,labelY}], rings:[{points}], series:[{key,tone,style,points,dots:[{x,y,axisId}]}] }`.
- [ ] **Tests** (failing→pass): N axes → angles `-90, -90+360/N, …`; value=max → vertex at `rMax` distance from centre; value=0 → at centre; value>max clamped; polygon `points` has N coords; ring count = 4; carries tone/style/label.
- [ ] **renderRadar**: rings (`.ti-chart-radar-ring` polygons) → spokes (optional) → axis labels → per-series polygons (`.ti-chart-radar-poly tone-<tone>`; `style:"dashed"`/expected via `stroke-dasharray` presentation attr) → vertex dots (`tabindex`/`role`+`_attachSelect`) → sr-table (rows=axes, cols=series). createElementNS+setAttribute only.
- [ ] **CSS** (ti-framework.css): `.ti-chart-radar-ring/spoke/axis-label/poly` + tone variants + expected-dashed; `.ti-chart[data-ti-chart-type="radar"] svg { max-width: 360px; }` (square, centred).
- [ ] **Commit:** `feat(web-framework): ti-chart radar primitive (CA-69)`

## Task P2 — Config + READY payload plumbing (competence web)
- [ ] Add `evaluationWeights` {self:0.2,team:0.3,manager:0.5} + `performanceThresholds` {T1..T5} to the `config` data view (from the framework frozen singletons).
- [ ] In the `load-evaluation` READY payload, include the per-competency snapshot relevancy (so the client can decompose). Verify the field/shape vs what's already sent; add minimally.
- [ ] **Commit:** `feat(competence): expose evaluationWeights/thresholds + READY snapshot relevancy for client results (CA-69)`

## Task P3 — `buildResults()` view-model + T-band (competence UI)
- [ ] On the evaluation Alpine component: `tBand(score, thresholds)` (ascending first-match) + `buildResults()` recomputing per-source category/subcategory means (`Σ(gradeWeight·relevancy)/Σrelevancy`, source key `grades[code].employee/manager/team.cumulative`), category/final via the blend + cascade. Returns the spec objects + strengths/gaps lists.
- [ ] Spec-builders: `resultsGaugeSpec` (finalScore vs T1–T5 bands), `resultsCategoryBarsSpec` (per-category, per-source), `resultsRadarSpec` (9 subcats × self/manager/team + expected), `resultsSourceBarsSpec` (grouped self/manager/team). Reuse Phase-1 spec shapes.
- [ ] **Commit:** `feat(competence): client-side buildResults view-model + exact T-band cascade (CA-69)`

## Task P4 — READY results blocks + team-comments guard (fragment)
- [ ] Insert the results blocks (gauge/category-bars/radar/source-bars + strengths/gaps + feedback recap) ABOVE the (demoted/expandable) competency tables, gated `evaluation.status === 'Ready'`.
- [ ] Widen the team-comments guard (`:417`, currently `userRole === 2`) to also show EMPLOYEE at READY.
- [ ] Labels (en/bg) for the new blocks. CSS for `.competence-results-*` if needed (prefer framework primitives).
- [ ] **Commit:** `feat(competence): individual READY results blocks + employee team-comments at READY (CA-69)`

## Task P5 — "My results" + load-my-results (CA-I2)
- [ ] `load-my-results(session)`: self-scoped `fetchEvaluations(session.user.employeeID)`; pick latest with status ∈ {Ready,Closed}; ALWAYS apply `anonymizeEvaluationGrades/Scores(EMPLOYEE)` (incl. CLOSED); return the `load-evaluation` payload shape; empty-state when none READY/CLOSED. Register the view route.
- [ ] "My results" Workspace sidebar entry (EMPLOYEE-gated) deep-linking the results view; `sidebarNavMapping`. The fragment reuses the READY results blocks.
- [ ] Correct the design §3 wording (CLOSED individual = raw closed eval, not snapshot) in the design doc + log.
- [ ] **Commit:** `feat(competence): My results workspace entry + load-my-results (raw closed eval, self-scoped) (CA-69)`

## Verification gate
`npm --prefix packages/web-framework test` + `npm --prefix packages/competence test` green; eslint clean; the radar renders + caps correctly (both themes); an EMPLOYEE at READY sees gauge/category/radar/source blocks with correct T-bands (105→T3) + anonymous team comments; My results shows the latest READY/CLOSED with peer grades collapsed; empty-state otherwise. Then an adversarial review workflow (decomposition correctness, T-band edges, privacy/peer-leak on CLOSED, radar CSP) before CA-69 done.

## Self-review
- Radar is node-tested (pure layout); the client view-model mirrors the verified server formula + cascade exactly; self key = `.employee`. ✓
- CLOSED individual data = raw closed eval, peer-collapsed; snapshot never an individual source. ✓
- No new persisted config; only config-view exposure + READY payload relevancy. ✓
