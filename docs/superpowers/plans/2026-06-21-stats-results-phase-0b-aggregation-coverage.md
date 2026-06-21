# Phase 0B — Aggregation service + Coverage report — implementation plan

Steps below use markdown checkbox (`- [ ]`) syntax. An agentic worker should drive this plan with **superpowers:subagent-driven-development** (independent tasks in-session) or **superpowers:executing-plans** (separate session with review checkpoints).

## Goal

Build the pure, Redis-free aggregation core for the competence "Statistics & Results" feature: a new frozen-singleton service `#results-analytics` that (1) normalizes fetched evaluations into a privacy-reduced `CohortRow[]` frame, (2) flattens an org subtree into a roster, (3) resolves manager-vs-supervisor scope, (4) computes the **R1 Coverage** report (overall / by-group / pending), and (5) exposes a `resolve(cycleID, filter, reportKey)` entrypoint that switches between live compute (ACTIVE cycle) and snapshot projection (CLOSED cycle). Every aggregation primitive is a pure function taking injected data, unit-tested with `node --test` and hand-built fixtures — no Redis, no DOM. The walking-skeleton goal is that org-wide Coverage produces a **non-empty roster** (real `N`, real `notStarted`) in both live and snapshot modes.

## Architecture

- **`packages/competence/application/results-analytics.js`** — `ResultsAnalytics` class, frozen singleton (`module.exports.instance = Object.freeze(new ResultsAnalytics())`), mirroring `task-resolver.js:131-132` and `data-manager.js:1062-1063`. Pure compute methods take injected data; the only I/O method (`resolve`) wires the real singletons into an injectable pure core (`_resolveWith(deps, …)`) so the live/snapshot branch is unit-testable with stubbed deps — the same seam `task-resolver.js` uses for its injected predicate.
- **`packages/competence/application/organization-manager.js`** — gains one new pure accessor `getOrganizationRootUnitID()` (the org-graph node whose `parent` attribute is `null`, verified id `"1"`). This closes the blocker where whole-org roster resolution would pass `getOrganizationUnitSubtree("")` → `null` → empty roster.
- **Data flow:** `resolve` → `getCycle` (status switch) → live: `fetchEvaluations` → `buildCohortFrame` → `buildRoster(getOrganizationUnitSubtree(rootUnitID))` → `computeCoverage` → `{coverage, meta}`; snapshot: `getResultsSnapshot` projection (whole-org) or recompute (narrow filter).

## Tech Stack

- CommonJS (`require`/`module.exports`), internal `#alias` imports (`#results-analytics` added to competence `package.json` `"imports"`).
- Tests: Node built-in `node --test` + `node:assert/strict` over `packages/competence/test/*.test.js`, hand-built fixtures (the `task-resolver.test.js` precedent at `task-resolver.test.js:9-12`).
- Alpine CSP / DOM concerns are out of scope here (that is Phase 0A chart infra + Phase 0D Insights screen).

## Depends on

**None.** This component is self-contained against the existing `#data-manager` and `#organization-manager` singletons. The CLOSED-whole-org branch consumes `dataManager.instance.getResultsSnapshot(cycleID)` — the 8th-Redis-key accessor from the **Phase 0C snapshot store** component — but that branch is fully unit-tested here through `_resolveWith` with a stubbed `getResultsSnapshot`, so 0B can land and be verified before 0C. Sequence 0C before wiring the Phase 0D `load-report-coverage` endpoint against a real closed cycle.

## File structure

```
packages/competence/
  application/
    results-analytics.js        (new)
    organization-manager.js     (modify: add getOrganizationRootUnitID)
  test/
    results-analytics.test.js   (new)
    organization-manager.test.js (new or modify: add root-unit-id test)
  package.json                  (modify: add "#results-analytics" import)
```

---

### Task B0: Add `getOrganizationRootUnitID()` accessor to organization-manager

The whole-org Coverage path needs a real root unit id; passing `""` to `getOrganizationUnitSubtree` returns `null` (verified `organization-manager.js:395-396`) which yields an empty roster. There is no existing root accessor (every caller passes a user's own unit id). The org graph stores `parent` as a node attribute (verified `organization-manager.js:94`), and the root is the unit with `parent === null` (verified `config.organization-structure.json`: id `"1"`, `parent: null`).

**Files**
- Modify: `packages/competence/application/organization-manager.js`
- Test: `packages/competence/test/organization-manager.test.js`

**Steps**

- [ ] Check whether `packages/competence/test/organization-manager.test.js` already exists:
  ```
  ls packages/competence/test/organization-manager.test.js
  ```
  If it exists, append the `describe` block below; if not, create it with the standard GPL header (copy the 7-line header from `task-resolver.test.js:1-7`) plus the two require lines:
  ```js
  const { describe, it } = require( "node:test" );
  const assert = require( "node:assert/strict" );

  const organizationManager = require( "#organization-manager" );
  ```

- [ ] Write the failing test. Append to `packages/competence/test/organization-manager.test.js`:
  ```js
  describe( "OrganizationManager.getOrganizationRootUnitID", () => {

      it( "is a function on the exported singleton", () => {
          assert.equal( typeof organizationManager.instance.getOrganizationRootUnitID, "function" );
      } );

      it( "returns the configured root unit id (the unit whose parent is null)", () => {
          // The seeded org structure roots at unit "1" (config.organization-structure.json: parent === null).
          // When the chart is not built in a bare unit test, the accessor returns null rather than throwing.
          const rootID = organizationManager.instance.getOrganizationRootUnitID();
          assert.ok( rootID === "1" || rootID === null );
      } );

  } );
  ```
  (The chart is built lazily from Redis via `buildOrganizationChart`; in a bare `node --test` run it is empty, so the accessor must degrade to `null` rather than throw. The `=== "1"` arm documents the real-graph contract verified manually in Task B6.)

- [ ] Run it — expect FAIL:
  ```
  node --test packages/competence/test/organization-manager.test.js
  ```
  Expected: `TypeError: organizationManager.instance.getOrganizationRootUnitID is not a function`.

- [ ] Implement the accessor. Insert into `class OrganizationManager`, immediately after `getOrganizationUnitSubtree` (after `organization-manager.js:400`), before the `/* Private interface */` marker:
  ```js
      /**
       * Returns the organization root unit ID — the single organization-unit node whose `parent` attribute is null
       * (verified config.organization-structure.json: id "1"). Used by the analytics layer to root a whole-org
       * roster walk. Returns null when the chart is not yet built (bare unit-test / pre-bootstrap) so callers degrade
       * to an empty roster rather than throwing.
       *
       * @method
       * @returns {string|null}
       * @public
       */
      getOrganizationRootUnitID() {
          if ( !this.#organizationChart ) {
              return null;
          }
          const unitNodeIDs = this.#organizationChart.nodes().filter( ( nodeID ) => {
              return this.#organizationChart.getNodeAttribute( nodeID, "nodeType" ) === "organizationUnit";
          } );
          for ( const nodeID of unitNodeIDs ) {
              const parent = this.#organizationChart.getNodeAttribute( nodeID, "parent" );
              if ( parent === null || parent === undefined || parent === "" ) {
                  return this.#organizationChart.getNodeAttribute( nodeID, "id" );
              }
          }
          return null;
      }
  ```

- [ ] Run it — expect PASS:
  ```
  node --test packages/competence/test/organization-manager.test.js
  ```
  Expected: `# pass 2  # fail 0`.

- [ ] Commit:
  ```
  git add packages/competence/application/organization-manager.js packages/competence/test/organization-manager.test.js
  git commit -m "feat(competence): add getOrganizationRootUnitID accessor for whole-org roster (CA-F2)

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task B1: Create `results-analytics.js` as a frozen singleton + register `#results-analytics`

**Files**
- Create: `packages/competence/application/results-analytics.js`
- Modify: `packages/competence/package.json`
- Test: `packages/competence/test/results-analytics.test.js`

**Steps**

- [ ] Add the import alias. In `packages/competence/package.json`, inside `"imports"` (the block at `package.json:7-23`), add a line after `"#organization-manager"` (line 21), keeping alphabetical order:
  ```json
      "#organization-manager": "./application/organization-manager.js",
      "#results-analytics": "./application/results-analytics.js",
      "#task-resolver": "./application/task-resolver.js"
  ```

- [ ] Write the failing module-shape test. Create `packages/competence/test/results-analytics.test.js`:
  ```js
  /*
   * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
   * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
   * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
   * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
   * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
  */

  const { describe, it } = require( "node:test" );
  const assert = require( "node:assert/strict" );

  const resultsAnalytics = require( "#results-analytics" );

  describe( "ResultsAnalytics — module shape", () => {

      it( "exports a frozen singleton instance", () => {
          assert.ok( resultsAnalytics.instance, "expected an exported instance" );
          assert.equal( Object.isFrozen( resultsAnalytics.instance ), true );
      } );

      it( "returns the same instance on re-require (singleton)", () => {
          const again = require( "#results-analytics" );
          assert.equal( again.instance, resultsAnalytics.instance );
      } );

  } );
  ```

- [ ] Run it — expect FAIL (module does not exist):
  ```
  node --test packages/competence/test/results-analytics.test.js
  ```
  Expected: `Error: Cannot find module '#results-analytics'`.

- [ ] Create the minimal module. `packages/competence/application/results-analytics.js`:
  ```js
  /*
   * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
   * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
   * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
   * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
   * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
  */

  const dataManager = require( "#data-manager" );
  const organizationManager = require( "#organization-manager" );

  // Grade-letter → numeric weight (mirrors competence-framework.js:17-22). Empty "" → null (ungraded, excluded from means).
  const GRADE_WEIGHTS = Object.freeze( { S: 1.3, R: 1.0, U: 0.6, N: 0.0 } );

  // Synthetic roster-minus-evaluations label — NOT the NOT_STARTED enum value.
  const NOT_STARTED_LABEL = "Not started";

  /**
   * Cross-evaluation cohort analytics. Pure compute + (later) snapshot projection. Mirrors the frozen-singleton
   * pattern of the other application modules (cf. data-manager.js:1062-1063). The aggregation primitives are pure:
   * they take injected data (evaluations / roster / cycle) so they unit-test with hand-built fixtures (no Redis),
   * following the task-resolver.js precedent.
   *
   * @class ResultsAnalytics
   * @singleton
   * @public
   */
  class ResultsAnalytics {

      static #instance = null;

      /**
       * @constructor
       * @returns {ResultsAnalytics}
       */
      constructor() {
          if ( !ResultsAnalytics.#instance ) {
              ResultsAnalytics.#instance = this;
          }
          return ResultsAnalytics.#instance;
      }

  }

  const instance = new ResultsAnalytics();
  module.exports.instance = Object.freeze( instance );
  ```
  (`dataManager` / `organizationManager` are required now so Task B5's `resolve` can wire them; they are unused until then. `NOT_STARTED_LABEL` and `GRADE_WEIGHTS` are consumed in B2/B3.)

- [ ] Run it — expect PASS:
  ```
  node --test packages/competence/test/results-analytics.test.js
  ```
  Expected: `# pass 2  # fail 0`.

- [ ] Commit:
  ```
  git add packages/competence/application/results-analytics.js packages/competence/test/results-analytics.test.js packages/competence/package.json
  git commit -m "feat(competence): scaffold results-analytics frozen singleton (CA-F2)

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task B2: PURE `buildCohortFrame(evaluations, cycleID, filter)` → `CohortRow[]`

The frame is the one normalized, privacy-reduced pass every report reads. Org-unit resolution is **injected** (`filter.resolveOrgUnit`) so the function stays pure and testable without the organization graph; the live `resolve` (Task B5) supplies `organizationManager.instance.resolveOrganizationUnitIDForEmployee`. Self grade is `grades[code].employee` (verified `data-objects.types.js:146-150`); team is `grades[code].team.cumulative` ONLY (`competence-framework.js:468`, `team.individual[]` never copied); relevancy is read from the evaluation's own `snapshot[]` keyed by `stageLevel` (`competence-framework.js:464`).

**Files**
- Modify: `packages/competence/application/results-analytics.js`
- Test: `packages/competence/test/results-analytics.test.js`

**Steps**

- [ ] Write failing tests for the frame builder. Append to `packages/competence/test/results-analytics.test.js`:
  ```js
  const resultsAnalyticsInstance = require( "#results-analytics" ).instance;

  // Hand-built evaluation fixture. Mirrors the real shape: grades[code].{employee, manager, team:{cumulative,individual}},
  // and the per-evaluation snapshot[] carrying relevancy keyed by stageLevel (competence-framework.js:464).
  function evaluationFixture( over = {} ) {
      const stageLevel = over.stageLevel || "S2";
      return {
          evaluationID: over.evaluationID || "ev1",
          employeeID: over.employeeID || "emp1",
          managerID: over.managerID || "mgr1",
          cycleID: over.cycleID || "2026-H2",
          status: ( over.status !== undefined ) ? over.status : "Ready",
          roleFamily: over.roleFamily || "SE",
          specialization: ( over.specialization !== undefined ) ? over.specialization : null,
          stageLevel: stageLevel,
          interviewDate: ( over.interviewDate !== undefined ) ? over.interviewDate : "2026-06-10",
          finalScore: ( over.finalScore !== undefined ) ? over.finalScore : { score: 100, interpretation: "T3" },
          scores: over.scores || { E: { score: 100, interpretation: "T3" }, I: { score: 100, interpretation: "T3" }, C: { score: 100, interpretation: "T3" } },
          grades: ( over.grades !== undefined ) ? over.grades : {
              "E1-1": { employee: "S", manager: "R", team: { cumulative: "R", individual: [ "R", "S" ] } }
          },
          snapshot: over.snapshot || [
              { code: "E1-1", category: "E", subcategory: "E1", relevancy: { S2: 7, R1: 4 } }
          ]
      };
  }

  // Default injected org-unit resolver for the pure tests.
  function filterFixture( over = {} ) {
      return {
          organizationUnitID: ( over.organizationUnitID !== undefined ) ? over.organizationUnitID : null,
          roleFamily: ( over.roleFamily !== undefined ) ? over.roleFamily : null,
          specialization: ( over.specialization !== undefined ) ? over.specialization : null,
          stageLevel: ( over.stageLevel !== undefined ) ? over.stageLevel : null,
          level: ( over.level !== undefined ) ? over.level : null,
          source: over.source || "blended",
          groupBy: over.groupBy || "roleFamily",
          allowedEmployeeIDs: ( over.allowedEmployeeIDs !== undefined ) ? over.allowedEmployeeIDs : null,
          rootUnitID: ( over.rootUnitID !== undefined ) ? over.rootUnitID : "1",
          resolveOrgUnit: over.resolveOrgUnit || ( ( employeeID ) => ( employeeID === "emp1" ? "unit-A" : "unit-B" ) )
      };
  }

  describe( "ResultsAnalytics.buildCohortFrame — normalization", () => {

      it( "keeps only rows whose cycleID matches", () => {
          const evals = [
              evaluationFixture( { evaluationID: "a", cycleID: "2026-H2" } ),
              evaluationFixture( { evaluationID: "b", cycleID: "2025-H1" } )
          ];
          const frame = resultsAnalyticsInstance.buildCohortFrame( evals, "2026-H2", filterFixture() );
          assert.equal( frame.length, 1 );
          assert.equal( frame[ 0 ].evaluationID, "a" );
      } );

      it( "carries the status as the enum VALUE string (with the space in 'In Review')", () => {
          const frame = resultsAnalyticsInstance.buildCohortFrame( [ evaluationFixture( { status: "In Review" } ) ], "2026-H2", filterFixture() );
          assert.equal( frame[ 0 ].status, "In Review" );
      } );

      it( "maps grades[code].employee → competencies[code].self", () => {
          const frame = resultsAnalyticsInstance.buildCohortFrame( [ evaluationFixture() ], "2026-H2", filterFixture() );
          assert.equal( frame[ 0 ].competencies[ "E1-1" ].self, "S" );
      } );

      it( "populates team from grades[code].team.cumulative ONLY (never individual[])", () => {
          const frame = resultsAnalyticsInstance.buildCohortFrame( [ evaluationFixture() ], "2026-H2", filterFixture() );
          assert.equal( frame[ 0 ].competencies[ "E1-1" ].team, "R" );
          assert.equal( Object.prototype.hasOwnProperty.call( frame[ 0 ].competencies[ "E1-1" ], "individual" ), false );
          // The serialized row must not leak the per-peer grades anywhere.
          assert.equal( JSON.stringify( frame[ 0 ] ).includes( "individual" ), false );
      } );

      it( "resolves numeric gradeWeights and maps '' → null (ungraded, never 0)", () => {
          const grades = { "E1-1": { employee: "S", manager: "", team: { cumulative: "N" } } };
          const frame = resultsAnalyticsInstance.buildCohortFrame( [ evaluationFixture( { grades } ) ], "2026-H2", filterFixture() );
          const c = frame[ 0 ].competencies[ "E1-1" ];
          assert.equal( c.selfWeight, 1.3 );
          assert.equal( c.managerWeight, null );   // "" → null, NOT 0
          assert.equal( c.teamWeight, 0.0 );        // "N" → 0.0 (a real grade), NOT null
      } );

      it( "reads relevancy from the evaluation's own snapshot keyed by stageLevel", () => {
          const frame = resultsAnalyticsInstance.buildCohortFrame( [ evaluationFixture( { stageLevel: "S2" } ) ], "2026-H2", filterFixture() );
          assert.equal( frame[ 0 ].competencies[ "E1-1" ].relevancy, 7 );
      } );

      it( "defaults missing snapshot relevancy to 0", () => {
          const snapshot = [ { code: "E1-1", category: "E", subcategory: "E1", relevancy: { R1: 4 } } ];
          const frame = resultsAnalyticsInstance.buildCohortFrame( [ evaluationFixture( { stageLevel: "S2", snapshot } ) ], "2026-H2", filterFixture() );
          assert.equal( frame[ 0 ].competencies[ "E1-1" ].relevancy, 0 );
      } );

      it( "resolves organizationUnitID via the injected resolveOrgUnit", () => {
          const frame = resultsAnalyticsInstance.buildCohortFrame( [ evaluationFixture( { employeeID: "emp1" } ) ], "2026-H2", filterFixture() );
          assert.equal( frame[ 0 ].organizationUnitID, "unit-A" );
      } );

      it( "derives roleFamily/stageLevel/level/isScored onto the row", () => {
          const frame = resultsAnalyticsInstance.buildCohortFrame( [ evaluationFixture( { roleFamily: "SE", stageLevel: "S2" } ) ], "2026-H2", filterFixture() );
          assert.equal( frame[ 0 ].roleFamily, "SE" );
          assert.equal( frame[ 0 ].stageLevel, "S2" );
          assert.equal( frame[ 0 ].level, "S" );   // stage-family letter
          assert.equal( frame[ 0 ].isScored, true );
      } );

      it( "marks an unscored ACTIVE-cycle row (no finalScore) isScored:false but still keeps it in the frame", () => {
          const frame = resultsAnalyticsInstance.buildCohortFrame( [ evaluationFixture( { status: "Open", finalScore: null } ) ], "2026-H2", filterFixture() );
          assert.equal( frame.length, 1 );
          assert.equal( frame[ 0 ].isScored, false );
          assert.equal( frame[ 0 ].finalScore, null );
      } );

  } );
  ```

- [ ] Run it — expect FAIL (`buildCohortFrame` not a function):
  ```
  node --test packages/competence/test/results-analytics.test.js
  ```
  Expected: `TypeError: resultsAnalyticsInstance.buildCohortFrame is not a function`.

- [ ] Implement `buildCohortFrame` (and the small pure helpers) on the class. Add inside `class ResultsAnalytics`, after the constructor:
  ```js
      /**
       * Builds the normalized, privacy-reduced CohortRow[] frame for a cycle from already-fetched evaluations.
       * Pure: org-unit resolution is injected via `filter.resolveOrgUnit` so the function unit-tests without the
       * organization graph. DELETED rows are assumed already excluded by the caller (fetchEvaluations strips them);
       * the raw-read recompute branch re-applies the exclusion explicitly (see _resolveWith, Task B5).
       *
       * @method
       * @param {Array<Object>} evaluations - Already-fetched evaluations (DELETED already excluded).
       * @param {string} cycleID
       * @param {Object} filter - CohortFilter; `filter.resolveOrgUnit(employeeID)` injected by the caller.
       * @returns {Array<Object>} CohortRow[]
       * @public
       */
      buildCohortFrame( evaluations, cycleID, filter ) {
          if ( !Array.isArray( evaluations ) || !cycleID ) {
              return [];
          }
          const resolveOrgUnit = ( filter && typeof filter.resolveOrgUnit === "function" ) ? filter.resolveOrgUnit : () => "";
          const rows = [];

          for ( const evaluation of evaluations ) {
              if ( !evaluation || evaluation.cycleID !== cycleID ) {
                  continue;
              }

              const stageLevel = evaluation.stageLevel || "";
              const snapshotByCode = new Map();
              const snapshot = Array.isArray( evaluation.snapshot ) ? evaluation.snapshot : [];
              for ( const entry of snapshot ) {
                  if ( entry && entry.code ) {
                      snapshotByCode.set( entry.code, entry );
                  }
              }

              const competencies = {};
              const grades = ( evaluation.grades && typeof evaluation.grades === "object" ) ? evaluation.grades : {};
              for ( const [ code, gradeEntry ] of Object.entries( grades ) ) {
                  if ( !gradeEntry ) {
                      continue;
                  }
                  const snapEntry = snapshotByCode.get( code );
                  const relevancy = ( snapEntry && snapEntry.relevancy && typeof snapEntry.relevancy[ stageLevel ] === "number" ) ? snapEntry.relevancy[ stageLevel ] : 0;
                  const self = this.#letterOrEmpty( gradeEntry.employee );      // grades[code].employee → self
                  const manager = this.#letterOrEmpty( gradeEntry.manager );
                  const team = this.#teamCumulative( gradeEntry.team );          // cumulative ONLY
                  competencies[ code ] = {
                      self: self,
                      manager: manager,
                      team: team,
                      selfWeight: this.#gradeWeight( self ),
                      managerWeight: this.#gradeWeight( manager ),
                      teamWeight: this.#gradeWeight( team ),
                      subcategory: snapEntry ? snapEntry.subcategory : null,
                      category: snapEntry ? snapEntry.category : null,
                      relevancy: relevancy
                  };
              }

              const finalScore = ( evaluation.finalScore && typeof evaluation.finalScore.score === "number" ) ? evaluation.finalScore : null;

              rows.push( {
                  evaluationID: evaluation.evaluationID,
                  employeeID: evaluation.employeeID,
                  managerID: evaluation.managerID || "",
                  status: evaluation.status,                                  // enum VALUE string
                  roleFamily: evaluation.roleFamily || "",
                  specialization: ( evaluation.specialization !== undefined ) ? evaluation.specialization : null,
                  stageLevel: stageLevel,
                  level: stageLevel ? stageLevel.charAt( 0 ) : "",            // stage-family letter (N/J/R/S/X/T)
                  organizationUnitID: resolveOrgUnit( evaluation.employeeID ) || "",
                  interviewDate: ( evaluation.interviewDate !== undefined ) ? evaluation.interviewDate : null,
                  isScored: finalScore !== null,
                  finalScore: finalScore,
                  finalInterpretation: finalScore ? ( finalScore.interpretation || null ) : null,
                  competencies: competencies
              } );
          }

          return rows;
      }

      /**
       * Returns the grade letter unchanged, or "" for a missing/empty value.
       * @method
       * @param {string} [letter]
       * @returns {string}
       * @private
       */
      #letterOrEmpty( letter ) {
          return ( typeof letter === "string" && letter !== "" ) ? letter : "";
      }

      /**
       * Extracts ONLY the team cumulative letter; never copies individual[] (structural peer anonymity).
       * @method
       * @param {Object|string} [team]
       * @returns {string}
       * @private
       */
      #teamCumulative( team ) {
          if ( typeof team === "string" ) {
              return this.#letterOrEmpty( team );
          }
          if ( team && typeof team === "object" ) {
              return this.#letterOrEmpty( team.cumulative );
          }
          return "";
      }

      /**
       * Maps a grade letter to its numeric weight; "" → null (ungraded, excluded from means — never 0).
       * @method
       * @param {string} letter
       * @returns {number|null}
       * @private
       */
      #gradeWeight( letter ) {
          if ( letter === "" || letter === undefined || letter === null ) {
              return null;
          }
          return Object.prototype.hasOwnProperty.call( GRADE_WEIGHTS, letter ) ? GRADE_WEIGHTS[ letter ] : null;
      }
  ```

- [ ] Run it — expect PASS:
  ```
  node --test packages/competence/test/results-analytics.test.js
  ```
  Expected: all `buildCohortFrame` cases pass (the module-shape pair still passes).

- [ ] Commit:
  ```
  git add packages/competence/application/results-analytics.js packages/competence/test/results-analytics.test.js
  git commit -m "feat(competence): pure buildCohortFrame normalizer for results-analytics (CA-F2)

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task B3: PURE `computeCoverage(frame, roster, filter)` → coverage payload

Roster is `[{employeeID, name, roleFamily, organizationUnitID}]` (the flattened subtree members; the builder is Task B4). `frame` is the Task-B2 output. Coverage needs no scores, only status + roster membership. "Completed" = Ready + Closed; "Not started" = roster-minus-evaluations (synthetic `"Not started"` label, NOT the `NOT_STARTED` enum).

**Files**
- Modify: `packages/competence/application/results-analytics.js`
- Test: `packages/competence/test/results-analytics.test.js`

**Steps**

- [ ] Write failing tests for `computeCoverage`. Append to the test file:
  ```js
  // Minimal roster member fixture (shape produced by buildRoster in Task B4).
  function rosterMember( over = {} ) {
      return {
          employeeID: over.employeeID || "emp1",
          name: ( over.name !== undefined ) ? over.name : "Name(" + ( over.employeeID || "emp1" ) + ")",
          roleFamily: over.roleFamily || "SE",
          organizationUnitID: over.organizationUnitID || "unit-A"
      };
  }

  describe( "ResultsAnalytics.computeCoverage — overall", () => {

      it( "counts N (in-scope roster), n (completed = Ready+Closed), and the four live byStatus buckets", () => {
          const roster = [
              rosterMember( { employeeID: "emp1" } ),
              rosterMember( { employeeID: "emp2" } ),
              rosterMember( { employeeID: "emp3" } ),
              rosterMember( { employeeID: "emp4" } )   // no evaluation → Not started
          ];
          const frame = [
              { evaluationID: "a", employeeID: "emp1", status: "Closed", roleFamily: "SE", organizationUnitID: "unit-A" },
              { evaluationID: "b", employeeID: "emp2", status: "Ready", roleFamily: "SE", organizationUnitID: "unit-A" },
              { evaluationID: "c", employeeID: "emp3", status: "In Review", roleFamily: "SE", organizationUnitID: "unit-A" }
          ];
          const coverage = resultsAnalyticsInstance.computeCoverage( frame, roster, filterFixture( { groupBy: "roleFamily" } ) );
          assert.equal( coverage.overall.N, 4 );
          assert.equal( coverage.overall.n, 2 );                 // completed = Ready + Closed
          assert.equal( coverage.overall.pct, 50 );              // 2/4
          assert.equal( coverage.overall.notStarted, 1 );        // emp4 has no evaluation
          assert.deepEqual( coverage.overall.byStatus, { "Open": 0, "In Review": 1, "Ready": 1, "Closed": 1 } );
      } );

      it( "computes pct as 0 for an empty roster (no divide-by-zero)", () => {
          const coverage = resultsAnalyticsInstance.computeCoverage( [], [], filterFixture() );
          assert.equal( coverage.overall.N, 0 );
          assert.equal( coverage.overall.pct, 0 );
      } );

      it( "groups by roleFamily with per-group N / byStatus / notStarted / pct", () => {
          const roster = [
              rosterMember( { employeeID: "emp1", roleFamily: "SE" } ),
              rosterMember( { employeeID: "emp2", roleFamily: "SE" } ),
              rosterMember( { employeeID: "emp3", roleFamily: "QA" } )
          ];
          const frame = [
              { evaluationID: "a", employeeID: "emp1", status: "Ready", roleFamily: "SE", organizationUnitID: "unit-A" }
          ];
          const coverage = resultsAnalyticsInstance.computeCoverage( frame, roster, filterFixture( { groupBy: "roleFamily" } ) );
          const se = coverage.byGroup.find( ( g ) => g.groupKey === "SE" );
          const qa = coverage.byGroup.find( ( g ) => g.groupKey === "QA" );
          assert.equal( se.groupType, "roleFamily" );
          assert.equal( se.N, 2 );
          assert.equal( se.notStarted, 1 );    // emp2 has no eval
          assert.equal( se.pct, 50 );
          assert.equal( qa.N, 1 );
          assert.equal( qa.notStarted, 1 );    // emp3 has no eval
          assert.equal( qa.pct, 0 );
      } );

      it( "groups by orgUnit when filter.groupBy === 'orgUnit'", () => {
          const roster = [
              rosterMember( { employeeID: "emp1", organizationUnitID: "unit-A" } ),
              rosterMember( { employeeID: "emp2", organizationUnitID: "unit-B" } )
          ];
          const frame = [
              { evaluationID: "a", employeeID: "emp1", status: "Closed", roleFamily: "SE", organizationUnitID: "unit-A" }
          ];
          const coverage = resultsAnalyticsInstance.computeCoverage( frame, roster, filterFixture( { groupBy: "orgUnit" } ) );
          const a = coverage.byGroup.find( ( g ) => g.groupKey === "unit-A" );
          assert.equal( a.groupType, "orgUnit" );
          assert.equal( a.N, 1 );
          assert.equal( a.pct, 100 );
      } );

      it( "lists pending: in-progress evals (Open/In Review) AND Not-started roster gaps", () => {
          const roster = [
              rosterMember( { employeeID: "emp1" } ),
              rosterMember( { employeeID: "emp2" } ),
              rosterMember( { employeeID: "emp3" } )
          ];
          const frame = [
              { evaluationID: "a", employeeID: "emp1", status: "Closed", roleFamily: "SE", organizationUnitID: "unit-A" },
              { evaluationID: "b", employeeID: "emp2", status: "Open", roleFamily: "SE", organizationUnitID: "unit-A" }
          ];
          const coverage = resultsAnalyticsInstance.computeCoverage( frame, roster, filterFixture() );
          const open = coverage.pending.find( ( p ) => p.employeeID === "emp2" );
          const gap = coverage.pending.find( ( p ) => p.employeeID === "emp3" );
          assert.equal( open.status, "Open" );
          assert.equal( open.evaluationID, "b" );
          assert.equal( gap.status, "Not started" );    // synthetic label
          assert.equal( gap.evaluationID, null );
          // A completed (Closed) row is NOT pending.
          assert.equal( coverage.pending.some( ( p ) => p.employeeID === "emp1" ), false );
      } );

  } );
  ```

- [ ] Run it — expect FAIL (`computeCoverage` not a function):
  ```
  node --test packages/competence/test/results-analytics.test.js
  ```
  Expected: `TypeError: resultsAnalyticsInstance.computeCoverage is not a function`.

- [ ] Implement `computeCoverage` plus its three private helpers. Add to the class:
  ```js
      /**
       * Computes the Coverage report payload from a frame + the in-scope roster. "Completed" = Ready + Closed
       * (resolved decision §7.1); "Not started" = roster employees with no evaluation row (synthetic label, not the
       * NOT_STARTED enum). Groups by roleFamily or orgUnit per filter.groupBy.
       *
       * @method
       * @param {Array<Object>} frame - CohortRow[] (only status/employeeID/roleFamily/organizationUnitID/evaluationID read).
       * @param {Array<Object>} roster - [{employeeID, name, roleFamily, organizationUnitID}].
       * @param {Object} filter - CohortFilter; filter.groupBy ∈ {"roleFamily","orgUnit"}.
       * @returns {Object} coverage payload
       * @public
       */
      computeCoverage( frame, roster, filter ) {
          const rows = Array.isArray( frame ) ? frame : [];
          const members = Array.isArray( roster ) ? roster : [];
          const groupBy = ( filter && filter.groupBy === "orgUnit" ) ? "orgUnit" : "roleFamily";

          const rowByEmployee = new Map();
          for ( const row of rows ) {
              if ( row && row.employeeID ) {
                  rowByEmployee.set( row.employeeID, row );
              }
          }

          const overall = this.#emptyCoverageBucket();
          const groups = new Map();   // groupKey → { groupType, groupKey, groupLabel, bucket }
          const pending = [];

          for ( const member of members ) {
              const row = rowByEmployee.get( member.employeeID ) || null;
              const groupKey = ( groupBy === "orgUnit" ) ? ( member.organizationUnitID || "" ) : ( member.roleFamily || "" );
              if ( !groups.has( groupKey ) ) {
                  groups.set( groupKey, { groupType: groupBy, groupKey: groupKey, groupLabel: groupKey, bucket: this.#emptyCoverageBucket() } );
              }
              const group = groups.get( groupKey );

              this.#tallyCoverage( overall, row );
              this.#tallyCoverage( group.bucket, row );

              const status = row ? row.status : NOT_STARTED_LABEL;
              if ( status !== "Ready" && status !== "Closed" ) {
                  pending.push( {
                      evaluationID: row ? row.evaluationID : null,
                      employeeID: member.employeeID,
                      name: ( member.name !== undefined ) ? member.name : null,
                      groupLabel: groupKey,
                      status: status   // one of Open / In Review / "Not started"
                  } );
              }
          }

          return {
              overall: this.#finalizeCoverageBucket( overall ),
              byGroup: Array.from( groups.values() ).map( ( g ) => Object.assign(
                  { groupType: g.groupType, groupKey: g.groupKey, groupLabel: g.groupLabel },
                  this.#finalizeCoverageBucket( g.bucket )
              ) ),
              pending: pending
          };
      }

      /**
       * @method
       * @returns {Object} A fresh coverage accumulator.
       * @private
       */
      #emptyCoverageBucket() {
          return { N: 0, n: 0, notStarted: 0, byStatus: { "Open": 0, "In Review": 0, "Ready": 0, "Closed": 0 } };
      }

      /**
       * Tallies one roster member (with its evaluation row or null) into a coverage accumulator.
       * @method
       * @param {Object} bucket
       * @param {Object|null} row
       * @private
       */
      #tallyCoverage( bucket, row ) {
          bucket.N += 1;
          if ( !row ) {
              bucket.notStarted += 1;
              return;
          }
          if ( Object.prototype.hasOwnProperty.call( bucket.byStatus, row.status ) ) {
              bucket.byStatus[ row.status ] += 1;
          }
          if ( row.status === "Ready" || row.status === "Closed" ) {
              bucket.n += 1;
          }
      }

      /**
       * Finalizes an accumulator: appends the rounded completion pct.
       * @method
       * @param {Object} bucket
       * @returns {Object}
       * @private
       */
      #finalizeCoverageBucket( bucket ) {
          const pct = ( bucket.N > 0 ) ? Math.round( ( bucket.n / bucket.N ) * 100 ) : 0;
          return { N: bucket.N, n: bucket.n, pct: pct, byStatus: bucket.byStatus, notStarted: bucket.notStarted };
      }
  ```

- [ ] Run it — expect PASS:
  ```
  node --test packages/competence/test/results-analytics.test.js
  ```
  Expected: all `computeCoverage` cases pass.

- [ ] Commit:
  ```
  git add packages/competence/application/results-analytics.js packages/competence/test/results-analytics.test.js
  git commit -m "feat(competence): pure computeCoverage report (overall/byGroup/pending) (CA-F2)

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task B4: PURE `buildRoster(subtree)` (recursive subtree flatten) + `resolveScopeFilter`

`getOrganizationUnitSubtree(rootUnitID)` returns a nested node whose `.employees` are **direct-only**; descendants live under `.children` (verified `organization-manager.js:459-470`). The roster = walk `.children` recursively, concatenating each node's `.employees`. Supervisor scope = org-root subtree (whole org), rooted at the resolved root from Task B0; manager scope = the manager's own unit subtree. Both pure: they take the already-fetched subtree node / an injected authority descriptor.

**Files**
- Modify: `packages/competence/application/results-analytics.js`
- Test: `packages/competence/test/results-analytics.test.js`

**Steps**

- [ ] Write failing tests. Append to the test file:
  ```js
  // Mirrors getOrganizationUnitSubtree output: nested {id,name,employees(direct-only),children[]} (organization-manager.js:459-470).
  function subtreeFixture() {
      return {
          id: "1",
          name: "Org",
          employees: [ { employeeID: "ceo", name: "CEO", roleFamily: "MG", organizationUnitID: "1" } ],
          children: [
              {
                  id: "unit-A",
                  name: "Unit A",
                  employees: [
                      { employeeID: "emp1", name: "Emp One", roleFamily: "SE", organizationUnitID: "unit-A" },
                      { employeeID: "emp2", name: "Emp Two", roleFamily: "SE", organizationUnitID: "unit-A" }
                  ],
                  children: [
                      {
                          id: "unit-A1",
                          name: "Unit A1",
                          employees: [ { employeeID: "emp3", name: "Emp Three", roleFamily: "QA", organizationUnitID: "unit-A1" } ],
                          children: []
                      }
                  ]
              },
              {
                  id: "unit-B",
                  name: "Unit B",
                  employees: [ { employeeID: "emp4", name: "Emp Four", roleFamily: "SE", organizationUnitID: "unit-B" } ],
                  children: []
              }
          ]
      };
  }

  describe( "ResultsAnalytics.buildRoster — recursive subtree flatten", () => {

      it( "flattens every node's direct employees across the whole subtree (walks .children)", () => {
          const roster = resultsAnalyticsInstance.buildRoster( subtreeFixture() );
          const ids = roster.map( ( m ) => m.employeeID ).sort();
          assert.deepEqual( ids, [ "ceo", "emp1", "emp2", "emp3", "emp4" ] );
      } );

      it( "carries employeeID/name/roleFamily/organizationUnitID onto each roster member", () => {
          const roster = resultsAnalyticsInstance.buildRoster( subtreeFixture() );
          const emp3 = roster.find( ( m ) => m.employeeID === "emp3" );
          assert.deepEqual( emp3, { employeeID: "emp3", name: "Emp Three", roleFamily: "QA", organizationUnitID: "unit-A1" } );
      } );

      it( "de-duplicates an employee that appears under two nodes (defensive against graph cycles)", () => {
          const tree = subtreeFixture();
          tree.children[ 1 ].employees.push( { employeeID: "emp1", name: "Emp One", roleFamily: "SE", organizationUnitID: "unit-B" } );
          const roster = resultsAnalyticsInstance.buildRoster( tree );
          assert.equal( roster.filter( ( m ) => m.employeeID === "emp1" ).length, 1 );
      } );

      it( "returns [] for a null subtree (e.g. an unresolved root id)", () => {
          assert.deepEqual( resultsAnalyticsInstance.buildRoster( null ), [] );
      } );

  } );

  describe( "ResultsAnalytics.resolveScopeFilter — manager vs supervisor", () => {

      it( "supervisor scope is whole-org: allowedEmployeeIDs null, rootUnitID is the resolved org root", () => {
          const scope = resultsAnalyticsInstance.resolveScopeFilter( { isSupervisor: true, employeeID: "sup", orgRootUnitID: "1" } );
          assert.equal( scope.allowedEmployeeIDs, null );
          assert.equal( scope.rootUnitID, "1" );
      } );

      it( "manager scope roots at the manager's own unit and allow-lists their subtree", () => {
          const scope = resultsAnalyticsInstance.resolveScopeFilter( {
              isSupervisor: false,
              employeeID: "mgr1",
              managerUnitID: "unit-A",
              subtreeEmployeeIDs: [ "emp1", "emp2", "emp3" ]
          } );
          assert.equal( scope.rootUnitID, "unit-A" );
          assert.deepEqual( scope.allowedEmployeeIDs.sort(), [ "emp1", "emp2", "emp3" ] );
      } );

  } );
  ```

- [ ] Run it — expect FAIL (`buildRoster`/`resolveScopeFilter` not functions):
  ```
  node --test packages/competence/test/results-analytics.test.js
  ```
  Expected: `TypeError: resultsAnalyticsInstance.buildRoster is not a function`.

- [ ] Implement `buildRoster` and `resolveScopeFilter`. Add to the class:
  ```js
      /**
       * Recursively flattens an org subtree node into a de-duplicated roster. The subtree's `.employees` are direct
       * members only; descendants live under `.children` (organization-manager.js:459-470), so the roster walks
       * `.children` recursively concatenating each node's `.employees`.
       *
       * @method
       * @param {Object|null} subtree - Output of organizationManager.getOrganizationUnitSubtree(rootUnitID).
       * @returns {Array<Object>} [{employeeID, name, roleFamily, organizationUnitID}]
       * @public
       */
      buildRoster( subtree ) {
          const seen = new Set();
          const roster = [];
          const walk = ( node ) => {
              if ( !node || typeof node !== "object" ) {
                  return;
              }
              const employees = Array.isArray( node.employees ) ? node.employees : [];
              for ( const employee of employees ) {
                  if ( !employee || !employee.employeeID || seen.has( employee.employeeID ) ) {
                      continue;
                  }
                  seen.add( employee.employeeID );
                  roster.push( {
                      employeeID: employee.employeeID,
                      name: ( employee.name !== undefined ) ? employee.name : null,
                      roleFamily: employee.roleFamily || "",
                      organizationUnitID: employee.organizationUnitID || ""
                  } );
              }
              const children = Array.isArray( node.children ) ? node.children : [];
              for ( const child of children ) {
                  walk( child );
              }
          };
          walk( subtree );
          return roster;
      }

      /**
       * Resolves the cohort scope from an injected authority descriptor. Supervisor → whole org (allowedEmployeeIDs
       * null, rooted at the resolved org root — the web layer computes orgRootUnitID via
       * organizationManager.getOrganizationRootUnitID(), Task B0). Manager → own subtree (rooted at the manager's
       * unit, allow-listed by the pre-computed subtree member IDs). The web layer computes
       * managerUnitID/subtreeEmployeeIDs via organizationManager + isSuperiorManagerOfEmployee (resolved decision
       * §7.7: full multi-level subtree).
       *
       * @method
       * @param {Object} authority - { isSupervisor, employeeID, orgRootUnitID?, managerUnitID?, subtreeEmployeeIDs? }
       * @returns {Object} { rootUnitID, allowedEmployeeIDs }
       * @public
       */
      resolveScopeFilter( authority ) {
          if ( authority && authority.isSupervisor === true ) {
              return { rootUnitID: authority.orgRootUnitID || "", allowedEmployeeIDs: null };
          }
          return {
              rootUnitID: ( authority && authority.managerUnitID ) || "",
              allowedEmployeeIDs: ( authority && Array.isArray( authority.subtreeEmployeeIDs ) ) ? authority.subtreeEmployeeIDs.slice() : []
          };
      }
  ```

- [ ] Run it — expect PASS:
  ```
  node --test packages/competence/test/results-analytics.test.js
  ```
  Expected: all `buildRoster` / `resolveScopeFilter` cases pass.

- [ ] Commit:
  ```
  git add packages/competence/application/results-analytics.js packages/competence/test/results-analytics.test.js
  git commit -m "feat(competence): pure buildRoster subtree flatten + manager/supervisor scope (CA-F2)

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task B5: `resolve(cycleID, filter, reportKey)` live/snapshot switch (keyed on cycle.status)

The public entrypoint that funnels Coverage through the live-vs-snapshot branch — the only method here that touches I/O (`#data-manager`, `#organization-manager`). The branch logic is split into an **injectable pure core** `_resolveWith(deps, cycleID, filter, reportKey)` so the decision is unit-tested with stubbed deps (no Redis), while the thin public `resolve` wires the real singletons. CLOSED → snapshot projection (whole-org) / recompute (narrow); ACTIVE → live (`mode:"live"`, `meta.partial`/`pctReporting`).

Critical correction from review: the real `dataManager.instance.getCycle` **rejects** with `E_APP_RESOURCE_NOT_FOUND` for an unknown cycle (verified `data-manager.js:529-530, 536`); it never resolves `null`. The pure core handles a falsy cycle defensively, so the real `deps.getCycle` is wrapped to swallow not-found into `null` (so the falsy-cycle branch is actually reachable). The whole-org root must be a real unit id resolved via Task B0's `getOrganizationRootUnitID()`, never the empty string (passing `""` to `getOrganizationUnitSubtree` returns `null` → empty roster; verified `organization-manager.js:395`).

**Files**
- Modify: `packages/competence/application/results-analytics.js`
- Test: `packages/competence/test/results-analytics.test.js`

**Steps**

- [ ] Write failing tests for the pure resolve core. Append to the test file:
  ```js
  // Builds a deps stub for _resolveWith: getCycle / fetchEvaluations / getResultsSnapshot / buildSubtree / resolveOrgUnit.
  function depsFixture( over = {} ) {
      return {
          getCycle: over.getCycle || ( ( id ) => Promise.resolve( { cycleID: id, status: over.cycleStatus || "ACTIVE" } ) ),
          fetchEvaluations: over.fetchEvaluations || ( () => Promise.resolve( over.evaluations || [] ) ),
          getResultsSnapshot: over.getResultsSnapshot || ( () => Promise.resolve( over.snapshot || null ) ),
          buildSubtree: over.buildSubtree || ( () => over.subtree || subtreeFixture() ),
          resolveOrgUnit: over.resolveOrgUnit || ( ( employeeID ) => ( employeeID === "emp1" ? "unit-A" : "unit-B" ) )
      };
  }

  describe( "ResultsAnalytics.resolve — live vs snapshot switch", () => {

      it( "ACTIVE cycle → live mode: computes a NON-EMPTY org-wide roster, sets meta.mode 'live' and partial flag", async () => {
          const evaluations = [
              evaluationFixture( { evaluationID: "a", employeeID: "emp1", status: "Ready" } ),
              evaluationFixture( { evaluationID: "b", employeeID: "emp2", status: "Open", finalScore: null } )
          ];
          const deps = depsFixture( { cycleStatus: "ACTIVE", evaluations } );
          const result = await resultsAnalyticsInstance._resolveWith( deps, "2026-H2", filterFixture( { allowedEmployeeIDs: null } ), "coverage" );
          assert.equal( result.meta.mode, "live" );
          assert.equal( result.meta.cycleStatus, "ACTIVE" );
          // Walking-skeleton guard: the whole-org roster (from subtreeFixture) is non-empty, so N reflects the roster, not just the eval count.
          assert.equal( result.coverage.overall.N, 5 );
          assert.equal( result.coverage.overall.notStarted, 3 );   // ceo, emp3, emp4 have no eval
          assert.equal( typeof result.coverage.overall.pct, "number" );
          // partial ⇒ not everyone reporting (only Ready/Closed report).
          assert.equal( result.meta.partial, true );
      } );

      it( "CLOSED cycle with a snapshot → snapshot mode, partial:false, no recompute", async () => {
          let fetched = false;
          const snapshot = { reports: { coverage: { overall: { N: 5, n: 5, pct: 100, notStarted: 0, byStatus: { "Open": 0, "In Review": 0, "Ready": 0, "Closed": 5 } }, byGroup: [], pending: [] } } };
          const deps = depsFixture( { cycleStatus: "CLOSED", snapshot, fetchEvaluations: () => { fetched = true; return Promise.resolve( [] ); } } );
          const result = await resultsAnalyticsInstance._resolveWith( deps, "2026-H2", filterFixture( { allowedEmployeeIDs: null } ), "coverage" );
          assert.equal( result.meta.mode, "snapshot" );
          assert.equal( result.meta.cycleStatus, "CLOSED" );
          assert.equal( result.meta.partial, false );
          assert.equal( result.coverage.overall.pct, 100 );
          assert.equal( fetched, false, "whole-org closed snapshot must not recompute" );
      } );

      it( "CLOSED cycle with a narrower-than-whole-org filter → snapshot-recompute branch (still mode 'snapshot')", async () => {
          let fetched = false;
          const evaluations = [ evaluationFixture( { evaluationID: "a", employeeID: "emp1", status: "Closed" } ) ];
          const deps = depsFixture( {
              cycleStatus: "CLOSED",
              snapshot: { reports: { coverage: {} } },
              fetchEvaluations: () => { fetched = true; return Promise.resolve( evaluations ); }
          } );
          const filter = filterFixture( { allowedEmployeeIDs: [ "emp1" ] } );   // narrower than whole-org
          const result = await resultsAnalyticsInstance._resolveWith( deps, "2026-H2", filter, "coverage" );
          assert.equal( result.meta.mode, "snapshot" );
          assert.equal( result.meta.partial, false );
          assert.equal( fetched, true, "narrow closed filter must recompute from closed evals" );
      } );

      it( "applies allowedEmployeeIDs to both the frame and the roster (privacy allow-list)", async () => {
          const evaluations = [
              evaluationFixture( { evaluationID: "a", employeeID: "emp1", status: "Ready" } ),
              evaluationFixture( { evaluationID: "b", employeeID: "emp4", status: "Ready" } )
          ];
          const deps = depsFixture( { cycleStatus: "ACTIVE", evaluations } );
          const filter = filterFixture( { allowedEmployeeIDs: [ "emp1", "emp2", "emp3" ] } );   // excludes emp4 / unit-B / ceo
          const result = await resultsAnalyticsInstance._resolveWith( deps, "2026-H2", filter, "coverage" );
          // Roster (from subtreeFixture) limited to the allow-list; emp4 and ceo excluded.
          assert.equal( result.coverage.overall.N, 3 );
          assert.equal( result.coverage.pending.some( ( p ) => p.employeeID === "emp4" ), false );
      } );

      it( "treats a falsy cycle (not-found swallowed to null) as CLOSED snapshot/empty rather than throwing", async () => {
          const deps = depsFixture( { getCycle: () => Promise.resolve( null ), getResultsSnapshot: () => Promise.resolve( null ) } );
          const result = await resultsAnalyticsInstance._resolveWith( deps, "missing", filterFixture( { allowedEmployeeIDs: null } ), "coverage" );
          assert.equal( result.meta.mode, "snapshot" );
          assert.equal( result.coverage.overall.N, 0 );
          assert.equal( result.coverage.overall.pct, 0 );
      } );

  } );
  ```

- [ ] Run it — expect FAIL (`_resolveWith` not a function):
  ```
  node --test packages/competence/test/results-analytics.test.js
  ```
  Expected: `TypeError: resultsAnalyticsInstance._resolveWith is not a function`.

- [ ] Implement the pure resolve core, the public `resolve`, and the meta/dispatch helpers. Add to the class:
  ```js
      /**
       * Pure live/snapshot resolution core. Deps are injected so the branch logic unit-tests without Redis. The public
       * `resolve` wires the real singletons. A falsy cycle (the real getCycle rejection is swallowed to null by the
       * public wrapper) is treated as a CLOSED whole-org read, which projects an empty snapshot. CLOSED + whole-org →
       * snapshot projection (no recompute); CLOSED + narrow filter → recompute from the still-present closed evals
       * (re-applying the DELETED exclusion, since the raw path bypasses fetchEvaluations' default filter). ACTIVE →
       * live compute with meta.partial / pctReporting. (Coverage is the only reportKey for Phase 0.)
       *
       * @method
       * @param {Object} deps - { getCycle, fetchEvaluations, getResultsSnapshot, buildSubtree, resolveOrgUnit }
       * @param {string} cycleID
       * @param {Object} filter - CohortFilter (allowedEmployeeIDs decides whole-org vs narrow; rootUnitID roots the roster).
       * @param {string} reportKey - "coverage" for Phase 0.
       * @returns {Promise<Object>} report payload merged with { meta }.
       * @public
       */
      _resolveWith( deps, cycleID, filter, reportKey ) {
          return deps.getCycle( cycleID ).then( ( cycle ) => {
              const status = cycle ? cycle.status : "CLOSED";   // falsy cycle (not-found) → treated as closed/empty
              const wholeOrg = !filter || filter.allowedEmployeeIDs === null;

              if ( status === "CLOSED" && wholeOrg ) {
                  return deps.getResultsSnapshot( cycleID ).then( ( snapshot ) => {
                      const payload = ( snapshot && snapshot.reports && snapshot.reports[ reportKey ] ) ? { coverage: snapshot.reports[ reportKey ] } : this.#emptyReport( reportKey );
                      return this.#withMeta( payload, cycleID, status, null, false );
                  } );
              }

              // ACTIVE (live), or CLOSED + narrow filter (recompute) — both read evals and re-apply DELETED exclusion.
              return deps.fetchEvaluations( null, false ).then( ( evaluations ) => {
                  const allowed = ( filter && Array.isArray( filter.allowedEmployeeIDs ) ) ? new Set( filter.allowedEmployeeIDs ) : null;
                  const liveEvals = evaluations.filter( ( evaluation ) => {
                      if ( !evaluation || evaluation.status === "Deleted" ) {   // explicit DELETED re-filter on the raw path
                          return false;
                      }
                      return allowed === null || allowed.has( evaluation.employeeID );
                  } );
                  const frameFilter = Object.assign( {}, filter, { resolveOrgUnit: deps.resolveOrgUnit } );
                  const frame = this.buildCohortFrame( liveEvals, cycleID, frameFilter );

                  let roster = this.buildRoster( deps.buildSubtree( filter ) );
                  if ( allowed !== null ) {
                      roster = roster.filter( ( member ) => allowed.has( member.employeeID ) );
                  }

                  const payload = this.#computeReport( reportKey, frame, roster, frameFilter );
                  return this.#withMeta( payload, cycleID, status, frame, status === "ACTIVE" );
              } );
          } );
      }

      /**
       * Public entrypoint: wires the real singletons into the pure resolve core. The web layer first computes the
       * scope (resolveScopeFilter) and injects rootUnitID + allowedEmployeeIDs into `filter`. The real getCycle
       * REJECTS with E_APP_RESOURCE_NOT_FOUND for an unknown cycle (data-manager.js:529-530), so it is wrapped to
       * resolve null on that one exception — letting the pure core's falsy-cycle branch handle it instead of throwing.
       *
       * @method
       * @param {string} cycleID
       * @param {Object} filter - CohortFilter with rootUnitID + allowedEmployeeIDs already resolved by the web layer.
       * @param {string} reportKey
       * @returns {Promise<Object>}
       * @public
       */
      resolve( cycleID, filter, reportKey ) {
          const deps = {
              getCycle: ( id ) => dataManager.instance.getCycle( id ).catch( ( error ) => {
                  if ( error && error.code === "E_APP_RESOURCE_NOT_FOUND" ) {
                      return null;
                  }
                  throw error;
              } ),
              fetchEvaluations: ( employeeID, filterClosed ) => dataManager.instance.fetchEvaluations( employeeID, filterClosed ),
              getResultsSnapshot: ( id ) => dataManager.instance.getResultsSnapshot( id ),
              buildSubtree: ( f ) => organizationManager.instance.getOrganizationUnitSubtree( f ? f.rootUnitID : "" ),
              resolveOrgUnit: ( employeeID ) => organizationManager.instance.resolveOrganizationUnitIDForEmployee( employeeID )
          };
          return this._resolveWith( deps, cycleID, filter, reportKey );
      }

      /**
       * Dispatches a frame+roster to the requested report computation. Phase 0 supports "coverage" only.
       * @method
       * @param {string} reportKey
       * @param {Array<Object>} frame
       * @param {Array<Object>} roster
       * @param {Object} filter
       * @returns {Object}
       * @private
       */
      #computeReport( reportKey, frame, roster, filter ) {
          if ( reportKey === "coverage" ) {
              return { coverage: this.computeCoverage( frame, roster, filter ) };
          }
          return this.#emptyReport( reportKey );
      }

      /**
       * @method
       * @param {string} reportKey
       * @returns {Object}
       * @private
       */
      #emptyReport( reportKey ) {
          return ( reportKey === "coverage" )
              ? { coverage: { overall: this.#finalizeCoverageBucket( this.#emptyCoverageBucket() ), byGroup: [], pending: [] } }
              : {};
      }

      /**
       * Wraps a report payload with the shared ResultMeta envelope. `reporting` = Ready+Closed rows in the frame;
       * `partial` is true only for ACTIVE cycles where not everyone is reporting. CLOSED / snapshot is always
       * partial:false (no frame is passed, so total/reporting are 0).
       * @method
       * @param {Object} payload
       * @param {string} cycleID
       * @param {string} cycleStatus
       * @param {Array<Object>|null} frame - frame (live/recompute) used for reporting counts; null for projection.
       * @param {boolean} isActive
       * @returns {Object}
       * @private
       */
      #withMeta( payload, cycleID, cycleStatus, frame, isActive ) {
          const mode = ( cycleStatus === "ACTIVE" ) ? "live" : "snapshot";
          let total = 0;
          let reporting = 0;
          if ( Array.isArray( frame ) ) {
              total = frame.length;
              reporting = frame.filter( ( row ) => row && ( row.status === "Ready" || row.status === "Closed" ) ).length;
          }
          const pctReporting = ( total > 0 ) ? Math.round( ( reporting / total ) * 100 ) : 0;
          const meta = {
              cycleID: cycleID,
              mode: mode,
              cycleStatus: ( cycleStatus === "ACTIVE" ) ? "ACTIVE" : "CLOSED",
              computedAt: new Date().toISOString(),
              total: total,
              reporting: reporting,
              pctReporting: pctReporting,
              partial: ( isActive === true ) && ( reporting < total )
          };
          return Object.assign( {}, payload, { meta: meta } );
      }
  ```
  Note: `_resolveWith` is intentionally public (single-underscore convention, not a `#private`) so the test can call it with stubbed deps — the same seam that keeps `resolve` thin. `fetchEvaluations` is called with `filterClosed=false` so closed evals remain in the recompute branch; the explicit `"Deleted"` re-filter is the mandated raw-path DELETED guard. The `getCycle` wrapper swallows `E_APP_RESOURCE_NOT_FOUND` to `null` so the falsy-cycle branch is reachable (the real getCycle never resolves null).

- [ ] Run it — expect PASS:
  ```
  node --test packages/competence/test/results-analytics.test.js
  ```
  Expected: all `resolve` cases pass.

- [ ] Run the whole package suite to confirm no regressions:
  ```
  cd packages/competence && npm test
  ```
  Expected: existing suites plus `results-analytics.test.js` and `organization-manager.test.js` all green (`# fail 0`).

- [ ] Commit:
  ```
  git add packages/competence/application/results-analytics.js packages/competence/test/results-analytics.test.js
  git commit -m "feat(competence): live/snapshot resolve switch keyed on cycle.status (CA-F2)

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task B6: Manual verification — non-empty org-wide roster against the real graph

The unit tests prove the pure compute, but the walking-skeleton blocker (org-wide roster emptiness) is only fully closed against the **real** built org graph: `getOrganizationRootUnitID()` must return `"1"` and `resolve(...)` against an ACTIVE cycle must yield `overall.N > 0` with `notStarted > 0`. This is a manual check (it needs Redis + the bootstrapped chart), not an automated `node --test` (the chart is empty in a bare test run).

**Files**
- (verification only — no file changes)

**Steps**

- [ ] Launch the app per the project's run skill (use the **run** skill / project launch pattern) so Redis is seeded and `buildOrganizationChart` has run.

- [ ] In a Node REPL or a one-off script wired into the running process context, confirm the root accessor against the real graph:
  ```js
  const organizationManager = require( "#organization-manager" );
  console.log( organizationManager.instance.getOrganizationRootUnitID() );   // expect: "1"
  ```
  Expected output: `1`.

- [ ] Resolve whole-org Coverage for the active cycle and confirm a non-empty roster (replace `<ACTIVE_CYCLE_ID>` with the seeded active cycle):
  ```js
  const resultsAnalytics = require( "#results-analytics" );
  const organizationManager = require( "#organization-manager" );
  const rootUnitID = organizationManager.instance.getOrganizationRootUnitID();
  resultsAnalytics.instance.resolve( "<ACTIVE_CYCLE_ID>", { groupBy: "orgUnit", allowedEmployeeIDs: null, rootUnitID: rootUnitID }, "coverage" )
      .then( ( r ) => console.log( "N=", r.coverage.overall.N, "notStarted=", r.coverage.overall.notStarted, "mode=", r.meta.mode ) );
  ```
  Expected: `N=` is the seeded headcount (a number > 0, NOT 0 and NOT merely the evaluation count), `notStarted=` is `> 0` (roster-minus-evaluations), `mode= live`. If `N` equals the evaluation count and `notStarted` is `0`, the roster walk collapsed — re-check that `rootUnitID` is `"1"` and that `getOrganizationUnitSubtree("1")` is non-null.

- [ ] Record the observed `N` / `notStarted` / `mode` in the PR description as the walking-skeleton evidence. No commit (verification only).

---

## Done when

- [ ] `node --test packages/competence/test/results-analytics.test.js` passes with **0 failures**, covering: module shape (2), `buildCohortFrame` normalization (10), `computeCoverage` (5), `buildRoster` + `resolveScopeFilter` (6), and `resolve` live/snapshot switch (6).
- [ ] `node --test packages/competence/test/organization-manager.test.js` passes, including the new `getOrganizationRootUnitID` cases.
- [ ] `cd packages/competence && npm test` is green across the whole package (no regressions in existing suites).
- [ ] `#results-analytics` is registered in `packages/competence/package.json` `"imports"` and `require("#results-analytics").instance` returns a frozen singleton.
- [ ] `ResultsAnalytics` exposes the pure, injected-data API: `buildCohortFrame`, `computeCoverage`, `buildRoster`, `resolveScopeFilter`, `_resolveWith` (testable seam), and `resolve` (real-singleton entrypoint).
- [ ] `organizationManager.instance.getOrganizationRootUnitID()` exists and returns the `parent: null` unit (`"1"` against the real graph, `null` when the chart is unbuilt).
- [ ] **Manual (Task B6):** against the running app, whole-org `resolve(..., "coverage")` produces `overall.N > 0` and `overall.notStarted > 0` in `live` mode — the walking-skeleton roster is provably non-empty.
- [ ] The contract for Phase 0D is locked: `resolve(cycleID, filter, "coverage")` returns `{ coverage: { overall, byGroup, pending }, meta }`, where `meta` carries `mode` / `cycleStatus` / `partial` / `pctReporting`, so the Insights screen can drive the gauge (`coverage.overall.pct/100`) and stacked bars (`coverage.byGroup[].byStatus` + `notStarted`).

---

**Notes carried into sibling components:**
- **Phase 0C (snapshot store):** `resolve()` calls `dataManager.instance.getResultsSnapshot(cycleID)` — the 8th-key accessor from 0C. The CLOSED-whole-org branch is unit-tested here via a stubbed `getResultsSnapshot`; sequence 0C before wiring the 0D `load-report-coverage` endpoint against a real closed cycle. When 0C writes the whole-org snapshot, it must root the roster walk at `organizationManager.instance.getOrganizationRootUnitID()` (Task B0) — never `getOrganizationUnitSubtree("")`.
- **Phase 0D (IA/access):** the `load-report-coverage` handler computes scope via `organizationManager.instance.isSuperiorManagerOfEmployee` + `getOrganizationRootUnitID` (supervisor) / the manager's own unit + subtree IDs (manager), calls `resolveScopeFilter(...)`, injects `rootUnitID`/`allowedEmployeeIDs` into the `CohortFilter` (the supervisor `filter` MUST carry `rootUnitID: getOrganizationRootUnitID()`, not an unset value), then calls `resolve(cycleID, filter, "coverage")`.

**Key files for the parent agent:**
- `C:\Users\kosta\WebstormProjects\ti-engine\packages\competence\application\results-analytics.js` (new)
- `C:\Users\kosta\WebstormProjects\ti-engine\packages\competence\application\organization-manager.js` (modify: add `getOrganizationRootUnitID` after `:400`)
- `C:\Users\kosta\WebstormProjects\ti-engine\packages\competence\test\results-analytics.test.js` (new)
- `C:\Users\kosta\WebstormProjects\ti-engine\packages\competence\test\organization-manager.test.js` (new or append)
- `C:\Users\kosta\WebstormProjects\ti-engine\packages\competence\package.json` (add `#results-analytics` at `:22`)
