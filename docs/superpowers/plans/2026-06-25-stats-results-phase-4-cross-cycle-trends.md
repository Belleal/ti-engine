# Statistics & Results — Phase 4: Cross-cycle Trends — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the four cross-cycle trend reports (overall score trend, gap-closure over time, ladder movement, cohort comparison) plus a per-employee historical line, all reading the persisted per-cycle `ResultsSnapshot`s — completing the final phase of the Statistics & Results capability (design `packages/competence/design/statistics-and-results.md` §3 Cross-cycle, §6 Phase 4 CA-X1..X4).

**Architecture:** Trends read only persisted snapshots (never raw historical evals), x-axis = cycles ordered by `chronoKey`, rightmost point may be the live ACTIVE cycle (dashed/provisional). A new `ti-chart-line` primitive renders mean+band lines, sparklines, and stacked-area mixes. A new single cross-cycle read method in `results-analytics.js` (mirroring the single-cycle `resolve()`/`_resolveWith()` DI shape) reads `getAllResultsSnapshots()`, appends a provisional active-cycle compute, slices by access scope, suppresses small cohorts, and shapes to chart contracts. The per-employee line is a separate access-gated path over raw `fetchEvaluations(employeeID)`.

**Tech Stack:** CommonJS, Node `node --test`, Alpine.js (CSP build) + HTMX fragments, the `ti-charts.js` primitive library, Redis-JSON-backed snapshot store.

## Readiness finding (from the Phase-4 understand workflow `wf_19a881c9`)

- **Snapshot store (read side) — READY.** `data-manager.js` has `cacheEntryKeyResultsSnapshots = "ti:competence:data:results-snapshots"` (`:22`), seeded in `initialize()` (`:68`), with `saveResultsSnapshot`/`getResultsSnapshot`/`getAllResultsSnapshots` (`:319-380`, the last sorted ascending by `chronoKey`). Written on close via `#closeCycle → resultsAnalytics.persistResultsSnapshot` (`competence-web-application.js:2088-2096`, fire-and-forget). Tested (`test/results-snapshots.test.js`).
- **Snapshot compute (write side) — PARTIAL.** `buildResultsSnapshot` (`results-analytics.js:1233-1300`) populates `bySubcategory`, `byStageLevel`, `chronoKey`, versions, and the six `reports.*`, but emits **six substrate fields as empty `{}` placeholders**: `overall.finalScore`, `overall.tBandMix`, `byCategory`, `ladderOrdinalHistogram`, `byRoleFamily`, `byOrgUnit` (`:1292-1298`). There is **no cross-cycle read method** — `resolve()`/`_resolveWith()` are strictly single-cycle.

**Consequence:** Phase 4 = complete the deferred substrate (**Task X0**, was CA-F3 lock-shape-only) **before** the trend screens can have data, plus the new read layer, line primitive, screens, and per-employee path.

## Global Constraints

- **CommonJS** everywhere; internal imports via `#alias`, cross-package via the `exports` map (`@ti-engine/web-framework/...`).
- **Alpine CSP:** in HTML expressions — no inline `style="..."` (use CSS classes), no optional chaining `?.`, no `Array`/`Object` globals (use `tiApplication` JS helpers). `.js` files allow `?.`.
- **ti-charts CSP:** SVG built with `createElementNS` + `setAttribute` only; **never** `element.style.*` except `setProperty("--var", …)`; every chart ships an `.ti-sr-only` a11y table; events via `addEventListener` only; dynamic sizing via `figure[data-ti-chart-type]` CSS caps.
- **deepFreeze** on config; **frozen singletons** (`module.exports.instance = Object.freeze(instance)`).
- **Privacy (design §5):** any cohort cell with `n < minCohortSize` (default `MIN_COHORT_SIZE = 3`) is suppressed to `{ n, suppressed: true }` **at aggregation time** — this MUST be applied to `byRoleFamily`/`byOrgUnit` (highest de-anon risk). Snapshots never carry `employeeID` or peer-individual grades. Reuse the verified guards verbatim: `#requireSessionUser`, `#requireRole`, `isSuperiorManagerOfEmployee` (the authoritative cohort predicate — never `managerID` equality).
- **Snapshots are never back-fillable.** Populating the substrate only affects cycles closed *after* this change; historical cycles keep empty substrate. Therefore: **bump `schemaVersion` 1 → 2**, and every reader must tolerate a snapshot whose substrate field is missing/empty (skip + flag, never throw).
- **Raw-code cross-cycle drill stays deferred** behind `competency-code-map.json` (design §6 / CA-X3) — NOT built in this phase.
- **Cadence:** `node --test` green + eslint clean per checkpoint; small thematic Conventional Commits scoped `competence`/`web-framework` with the CA card id; log work in YouTrack; never commit `.run/*.run.xml`.
- **Scoring constants (verbatim):** `gradeWeights` S/R/U/N = 1.3/1.0/0.6/0.0; `evaluationWeights` self/team/manager = 0.2/0.3/0.5; `performanceThresholds` T1–T5 = 76/89/105/119/150; ladder families N/J/R/S/X/T.

---

## Task X0 — Complete the cross-cycle substrate in `buildResultsSnapshot`

**Why first:** every trend reads these fields; they are currently empty `{}`. Non-back-fillable, so land ASAP.

**Files:**
- Modify: `packages/competence/application/results-analytics.js`
  - `buildCohortFrame` (`:125-140`) — capture per-category `scores` and `organizationUnitName` onto each `CohortRow`.
  - New private pure helpers (mirror `#computeBySubcategory` `:507-536`): `#computeOverallStats(frame)`, `#computeTBandMix(rows)`, `#computeByCategory(rows)`, `#computeLadderOrdinalHistogram(rows)`, `#computeByRoleFamily(frame)`, `#computeByOrgUnit(frame)`.
  - `buildResultsSnapshot` (`:1264-1299`) — assign the six fields; bump `schemaVersion: 1 → 2`.
  - `persistResultsSnapshot` (`:1181-1214`) — inject an org-unit-name resolver into the frame filter (for `byOrgUnit.unitName`).
- Test: `packages/competence/test/results-analytics.snapshot-substrate.test.js` (new).

**Interfaces — Produces (consumed by X2):**
- `CohortRow.scores: { [cat]: { score:number, interpretation:string } } | null` (from `evaluation.scores`).
- `CohortRow.organizationUnitName: string`.
- Snapshot substrate, all over the **reported** subset (`isScored && status ∈ {Ready, Closed}`):
  - `overall.finalScore = { mean, median, p25, p75, min, max, stdev, n }` (scores 0–150; `null`-safe; `{}` when n=0).
  - `overall.tBandMix = { T1,T2,T3,T4,T5 }` (zero-filled counts of `finalInterpretation`).
  - `byCategory = { E:{mean,median,p25,p75,n,tBandMix}, I:…, C:… }` (over per-category `scores[cat].score`).
  - `ladderOrdinalHistogram = { "1":n,…,"5":n }` and `meanRung:number|null` (ordinal map `N→1, J→2, R→3, S→4, X→5, T→5`).
  - `byRoleFamily = { [fam]: { n, finalScoreMean, byCategory, bySubcategoryGap } | { n, suppressed:true } }`.
  - `byOrgUnit = { [unitID]: { n, unitName, finalScoreMean, byCategory } | { n, suppressed:true } }`.

**Key algorithms (real code):**

```js
// module-level, near STAGE_LEVELS / MIN_COHORT_SIZE
const LADDER_ORDINAL = { N: 1, J: 2, R: 3, S: 4, X: 5, T: 5 };   // X and T collapse to the top ordinal (design §3)
const T_BANDS = [ "T1", "T2", "T3", "T4", "T5" ];

// population standard deviation of a numeric array (returns null for n<1)
function stdev( values ) {
    const n = values.length;
    if ( n < 1 ) { return null; }
    let sum = 0; for ( const v of values ) { sum += v; }
    const mean = sum / n;
    let sq = 0; for ( const v of values ) { sq += ( v - mean ) * ( v - mean ); }
    return Math.round( Math.sqrt( sq / n ) * 1000 ) / 1000;
}

// five-number summary + mean + stdev over already-collected finalScore.score values
#scoreStats( scores ) {
    if ( !scores.length ) { return {}; }
    const sorted = scores.slice().sort( ( a, b ) => a - b );
    let sum = 0; for ( const s of sorted ) { sum += s; }
    return {
        n: sorted.length,
        mean: Math.round( sum / sorted.length ),
        median: nearestRankPercentile( sorted, 0.5 ),
        p25: nearestRankPercentile( sorted, 0.25 ),
        p75: nearestRankPercentile( sorted, 0.75 ),
        min: sorted[ 0 ],
        max: sorted[ sorted.length - 1 ],
        stdev: stdev( sorted )
    };
}

#reportedRows( frame ) {
    return frame.filter( ( r ) => r && r.isScored && r.finalScore && typeof r.finalScore.score === "number"
        && ( r.status === configurationLoader.evaluationStatus.READY || r.status === configurationLoader.evaluationStatus.CLOSED ) );
}

#computeTBandMix( rows ) {
    const mix = { T1: 0, T2: 0, T3: 0, T4: 0, T5: 0 };
    for ( const r of rows ) { if ( r.finalInterpretation && mix[ r.finalInterpretation ] !== undefined ) { mix[ r.finalInterpretation ]++; } }
    return mix;
}

#computeLadderOrdinalHistogram( rows ) {
    const hist = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    let ordinalSum = 0, counted = 0;
    for ( const r of rows ) {
        const ord = LADDER_ORDINAL[ r.level ];
        if ( !ord ) { continue; }
        hist[ String( ord ) ]++; ordinalSum += ord; counted++;
    }
    return { hist: hist, meanRung: counted ? ( Math.round( ( ordinalSum / counted ) * 100 ) / 100 ) : null };
}
```

- `#computeOverallStats(frame)` → `this.#scoreStats(this.#reportedRows(frame).map(r => r.finalScore.score))`.
- `#computeByCategory(rows)` → for each cat in `["E","I","C"]`: collect `r.scores[cat].score` where present; `{ ...this.#scoreStats(catScores), tBandMix: histogram of r.scores[cat].interpretation }`.
- `#computeByRoleFamily(frame)` → group `#reportedRows` by `roleFamily`; per family `n = group.length`; if `n < MIN_COHORT_SIZE` → `{ n, suppressed:true }`; else `{ n, finalScoreMean: Math.round(meanScore), byCategory: #computeByCategory(group), bySubcategoryGap: map of #computeBySubcategory(group)[code].gap }`.
- `#computeByOrgUnit(frame)` → group by `organizationUnitID`; same shape + `unitName` from the row; `n<k` suppressed.
- In `buildResultsSnapshot`, replace lines `:1292-1298`:

```js
const reported = this.#reportedRows( frame );
const ladder = this.#computeLadderOrdinalHistogram( reported );
// ...
schemaVersion: 2,
// ...
overall: { finalScore: this.#computeOverallStats( frame ), tBandMix: this.#computeTBandMix( reported ) },
byCategory: this.#computeByCategory( reported ),
bySubcategory: bySubcategory,
byStageLevel: byStageLevel,
ladderOrdinalHistogram: ladder.hist,
ladderMeanRung: ladder.meanRung,
byRoleFamily: this.#computeByRoleFamily( frame ),
byOrgUnit: this.#computeByOrgUnit( frame )
```

**Checkpoints (TDD):**
- [ ] Test `#scoreStats`/stdev/tBandMix/ladder-ordinal (X+T→5) on a synthetic frame; assert suppression for a 2-row family. Run `node --test test/results-analytics.snapshot-substrate.test.js` — fails (helpers absent).
- [ ] Implement the frame extension + six helpers + `buildResultsSnapshot` wiring + `schemaVersion:2`.
- [ ] Tests pass; full `node --test` green; eslint clean.
- [ ] **Commit:** `feat(competence): populate cross-cycle snapshot substrate (overall/byCategory/ladder/byRoleFamily/byOrgUnit) + schemaVersion 2 (CA-X0)`

---

## Task X1 — `ti-chart-line` primitive (web-framework)

**Independent of X0** — pure geometry + render, mirroring the radar primitive I added in Phase 3.

**Files:**
- Modify: `packages/web-framework/bin/static/scripts/ti-charts.js` — add `lineLayout(series, opts)` (pure) + `renderLine(figure, spec)`; register `"line"` in `SUPPORTED_TYPES`; add the `renderChart` dispatch case.
- Modify: `packages/web-framework/bin/static/scripts/ti-framework.css` — `.ti-chart-line-*` (axis, gridline, series line, band area, dot, sparkline) using `--chart-seq-1…5`; add `line` to the `figure[data-ti-chart-type]` size-cap block (~320px; sparkline compact).
- Test: `packages/web-framework/test/ti-charts.test.js` — `lineLayout` math + a `renderLine` smoke test.

**Interfaces — Produces (consumed by X3):** a `line` spec:
```js
{ type:"line", options:{ sparkline?:bool, mode?:"line"|"area"|"stacked-area", provisionalLastPoint?:bool, yMax?:number, zeroBaseline?:bool },
  data:{ x:[{ id, label }], series:[{ key, tone?, style?:"dashed", values:[number|null], band?:[ [lo,hi]|null ] }] },
  a11yLabel:"…" }
```

**Geometry (real code, mirrors `radarLayout`):**
```js
function lineLayout( series, opts ) {
    const o = opts || {};
    const W = o.width || 320, H = o.height || ( o.sparkline ? 64 : 200 );
    const padL = o.sparkline ? 0 : 34, padR = o.sparkline ? 0 : 6, padT = 6, padB = o.sparkline ? 0 : 22;
    const n = o.xCount || ( series[ 0 ] && series[ 0 ].values.length ) || 0;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    // y-domain: explicit yMax, else max over all finite values & band highs; zeroBaseline pins min at 0
    let yMax = ( typeof o.yMax === "number" ) ? o.yMax : 0, yMin = o.zeroBaseline ? 0 : Infinity;
    for ( const s of series ) {
        for ( const v of s.values ) { if ( typeof v === "number" ) { if ( v > yMax ) yMax = v; if ( v < yMin ) yMin = v; } }
        for ( const b of ( s.band || [] ) ) { if ( b ) { if ( b[ 1 ] > yMax ) yMax = b[ 1 ]; if ( !o.zeroBaseline && b[ 0 ] < yMin ) yMin = b[ 0 ]; } }
    }
    if ( !isFinite( yMin ) ) yMin = 0;
    if ( yMax <= yMin ) yMax = yMin + 1;
    const x = ( i ) => padL + ( n <= 1 ? innerW / 2 : ( innerW * i ) / ( n - 1 ) );
    const y = ( v ) => padT + innerH * ( 1 - ( ( v - yMin ) / ( yMax - yMin ) ) );
    return { W, H, padL, padR, padT, padB, innerW, innerH, n, yMin, yMax, x, y };
}
```
- `renderLine`: build `<svg viewBox="0 0 W H">`; gridlines + y-ticks (skip when sparkline); for each series — a band `<path>` (area between `y(lo)`/`y(hi)`, class `.ti-chart-line-band` tone), the line `<polyline>`/`<path>` (`stroke-dasharray` when `style:"dashed"`), and vertex dots; for `mode:"stacked-area"` accumulate series into stacked areas (T-band mix / ladder); `provisionalLastPoint` → dash only the final segment + open the last dot. Append the `.ti-sr-only` table (x labels × series values). All attributes via `setAttribute`; tones via `setProperty("--chart-seq-k")`.

**Checkpoints:**
- [ ] Test: `lineLayout` maps `values[0]` to `padL`, last to `W-padR` (n>1), value@yMax to `padT`, `zeroBaseline` pins yMin=0; band high lifts yMax. Run `node --test test/ti-charts.test.js` — fails.
- [ ] Implement `lineLayout` + `renderLine` + register + dispatch + CSS.
- [ ] Render smoke test: a 3-cycle, 2-series spec with a band + a provisional last point → asserts `<polyline>` count, band path present, dashed last segment, sr-table rows. Tests pass; eslint clean.
- [ ] Verify in the preview harness (`docs/superpowers/preview/build-preview.js`) in both themes.
- [ ] **Commit:** `feat(web-framework): ti-chart line primitive (mean+band, sparkline, stacked-area, provisional) (CA-X1)`

---

## Task X2 — Cross-cycle read layer + `load-results-trend` endpoint

**Files:**
- Modify: `packages/competence/application/results-analytics.js` — add a `getAllResultsSnapshots` dep + `_computeTrendWith(deps, params)` pure core + `computeTrend(params)` public wrapper (mirror `_resolveWith`/`resolve` `:987-1066`).
- Modify: `packages/competence/bin/competence-web-application.js` — `#loadResultsTrend(session, params)` (mirror `#loadLeadershipReport`); add the `processDataRequest` branch for `load-results-trend`.
- Test: `packages/competence/test/results-analytics.trend.test.js` (new).

**Interfaces:**
- Consumes: `dataManager.getAllResultsSnapshots()` (exists), `getResultsSnapshot`, the X0 substrate fields.
- Produces: `computeTrend({ metric, dimension, key, window, allowedOrgUnits })` →
  ```js
  { meta:{ cycles:[{ cycleID, chronoKey, provisional }], window, partial },
    series:[{ key, label, values:[number|null], band?:[[lo,hi]|null] }],
    suppressedCycles:[cycleID], legacyCycles:[cycleID] }   // legacy = snapshot missing the requested substrate (schemaVersion<2)
  ```

**Behavior:**
- `metric ∈ { overallScore, gapClosure, ladder, cohort }`; `dimension ∈ { roleFamily, orgUnit, stageLevel }` (cohort/ladder); `key` selects a slice (e.g. a family); `window` = max trailing cycles.
- Read all snapshots (already chrono-sorted); take the trailing `window`.
- **Provisional active cycle:** if `deps.activeCycle` exists and has no snapshot, append a live-computed substrate (reuse the X0 helpers over a freshly built frame) tagged `provisional:true` (dashed last point).
- **Access-gate slices:** SUPERVISOR → all; MANAGER → restrict `byOrgUnit`/cohort slices to `allowedOrgUnits` (subtree); never expose other units.
- **n<k tolerance:** skip suppressed cells (→ `null` in the series, recorded in `suppressedCycles`).
- **Legacy tolerance:** a snapshot with `schemaVersion < 2` or an empty requested field contributes `null` and is listed in `legacyCycles`; never throws.
- Shape per metric: `overallScore` → one mean line + p25/p75 band + a stacked-area `tBandMix`; `gapClosure` → 9 sparkline series (`bySubcategory[code].gap`); `ladder` → stacked-area of `ladderOrdinalHistogram` + a `ladderMeanRung` line; `cohort` → one line per dimension key + a delta vs first cycle.

**Access (endpoint):** `#requireSessionUser` + `#requireRole(session, MANAGER, SUPERVISOR)`; resolve `allowedOrgUnits` from the manager subtree (reuse `#resolveReportScope`); supervisors pass `allowedOrgUnits = null`.

**Checkpoints:**
- [ ] Test `_computeTrendWith` with a deps stub returning 3 snapshots (one legacy schemaVersion 1, empty substrate): assert legacy → null + listed; assert provisional active appended + dashed; assert manager `allowedOrgUnits` filters byOrgUnit; assert n<k → suppressed. Run — fails.
- [ ] Implement `_computeTrendWith` + `computeTrend` + `#loadResultsTrend` + the request branch.
- [ ] Tests pass; full `node --test`; eslint clean.
- [ ] **Commit:** `feat(competence): cross-cycle trend read layer + load-results-trend (snapshot-only, access-gated, legacy-tolerant) (CA-X2)`

---

## Task X3 — The four trend screens

**Files:**
- Modify: `packages/competence/bin/static/scripts/competence-user-interface.js` — a `configureTrendsScreen()` factory (or extend `configureInsightsScreen`) with four spec-builders that map a `load-results-trend` payload to `line` specs; info-blocks pulled from labels; a provisional caveat banner when the last cycle is ACTIVE.
- Create: `packages/competence/bin/static/fragments/frame-insights-trends.html` — `ti-card-grid` with the four cards (`x-ti-chart`, `.ti-card-note` methodology blocks), mirroring `frame-insights-cycle.html`.
- Modify: `packages/competence/bin/static/fragments/components/component-sidebar.html` — Insights group → "Trends" entry (`@click="navigate('insights-trends','insights-trends')"`).
- Modify: `packages/competence/bin/competence-web-application.js` — `addFragment("insights-trends", …)`; `sidebarNavMapping["insights-trends"]`; the data request already branches `load-results-trend`.
- Modify: `packages/competence/bin/localization/competence-labels.json` — `interface.insights.trends.<overall|gapClosure|ladder|cohort>.{title,whatItShows,methodology}` (en/bg) + a `provisionalCaveat` label.
- Test: covered by `test:json` (label/JSON integrity) + manual preview render.

**Screens:** (1) **Overall score trend** — mean line + p25–p75 band + stacked-area T-band mix. (2) **Gap-closure** — 9 zero-baseline sparklines of `bySubcategory.gap`; drill to that cycle's heatmap row (within-cycle, codes safe). (3) **Ladder movement** — stacked-area `ladderOrdinalHistogram` + mean-rung line; UI caveat "cohort-composition movement, not individual promotion." (4) **Cohort comparison** — grouped lines per dimension key + delta. Each card carries its labels-sourced methodology/what-it-shows block (the C1 information-block requirement applied to Phase 4).

**Checkpoints:**
- [ ] Add labels (en/bg) for the four screens + caveat; `npm run test:json` green.
- [ ] Add the four spec-builders + the fragment + sidebar + addFragment + nav mapping.
- [ ] Verify each screen renders in the preview harness (both themes); provisional caveat shows when last cycle is ACTIVE.
- [ ] **Commit:** `feat(competence): four cross-cycle trend screens + Insights "Trends" entry (CA-X3)`

---

## Task X4 — Per-employee historical line (separate access-gated path)

**Files:**
- Modify: `packages/competence/bin/competence-web-application.js` — `#loadEmployeeHistory(session, employeeID)` reading raw `dataManager.fetchEvaluations(employeeID)` (READY/CLOSED only), shaping `finalScore.score` per cycle into a `line` spec. **Never reads snapshots.** Add the `load-employee-history` request branch.
- Modify: `packages/competence/bin/static/scripts/competence-user-interface.js` + a fragment section (reuse the individual results view or a small card) — render the historical line.
- Modify labels: `interface.insights.history.*` (en/bg).
- Test: `packages/competence/test/competence-web-application.history.test.js` or extend an existing endpoint test for the access gate.

**Access:** self (`employeeID === session.user.employeeID`) **or** `isSuperiorManagerOfEmployee(userID, employeeID)` **or** SUPERVISOR — re-checked server-side (defense in depth). Returns `{ noHistory:true }` when fewer than two reported cycles.

**Checkpoints:**
- [ ] Test: self allowed; non-manager other-employee → 403; manager-of allowed; <2 cycles → `{noHistory:true}`. Run — fails.
- [ ] Implement `#loadEmployeeHistory` + branch + UI.
- [ ] Tests pass; eslint clean.
- [ ] **Commit:** `feat(competence): per-employee historical score line (raw, access-gated, snapshot-free) (CA-X4)`

---

## Finalization (after X0–X4)

- [ ] **Adversarial review workflow** (refute-by-default) over the non-`node`-covered surfaces: substrate suppression correctness + non-back-fill/legacy tolerance; trend access-gating (manager subtree slice leakage); X4 IDOR; line-primitive CSP. Fix confirmed findings (receiving-code-review discipline).
- [ ] **Version bump** — the whole Statistics & Results capability is unreleased on competence 3.3.1 / web-framework 1.9.3. Bump both (`competence` minor, `web-framework` minor for the line primitive) + CHANGELOG entries covering Phases 1–4. (Confirm timing with the user — may bundle the whole capability.)
- [ ] **Design log** — append the Phase 4 completion entry to `statistics-and-results.md`.
- [ ] **YouTrack** — create the Phase 4 CA cards (X0–X4) under epic CA-61 "Statistics & Results" (Phase-4 epic "Cross-cycle"), reference ids in commits, set Stage→Test, log work.

## Self-review notes

- **Spec coverage:** §3 cross-cycle trends 1–4 → X3; their substrate → X0; `ti-chart-line` (CA-X1) → X1; `load-results-trend` metric/dimension/key/window (CA-X2) → X2; per-employee raw path (CA-X4) → X4; `competency-code-map.json` raw-code drill (CA-X3) → **deferred per design**. ✓
- **Substrate gap:** the design assumed CA-F3 locked *and populated* the substrate; the workflow proved it was shape-only — X0 closes that gap and is sequenced first. ✓
- **Privacy:** n<k suppression explicitly added to `byRoleFamily`/`byOrgUnit` (X0) and honored in slicing (X2); X4 re-checks authority server-side. ✓
- **Non-back-fill:** `schemaVersion 1→2` + legacy tolerance in every reader (X0/X2). ✓
- **Scoping decision surfaced:** manager-subtree trends are served from the snapshot's `byOrgUnit` slices (no historical recompute); a full subtree re-aggregation over raw closed evals is out of scope (follow-up).
