# Phase 0C — Results snapshot store — implementation plan

Steps use markdown checkbox (`- [ ]`) syntax. An agentic worker should drive this with **superpowers:subagent-driven-development** or **superpowers:executing-plans**.

## Goal

Lock the immutable per-cycle `ResultsSnapshot` envelope and persist it on cycle close, so Phase 0's R1 Coverage report renders identically live **and** from a snapshot. Only `reports.coverage` is populated now; the cross-cycle stable-axis aggregates are present with their final shape but empty (back-fill is impossible — the envelope must be frozen at v1). The snapshot's `cycleClosedAt` must come from the **re-read** cycle's `actualCloseDate`, which `updateCycleStatus` writes (`data-manager.js:602`) only *after* the cycle object that entered `closeCycle`.

## Architecture

- **8th Redis JSON cache key** `cacheEntryKeyResultsSnapshots` (`ti:competence:data:results-snapshots`) keyed by `cycleID`, seeded in `DataManager.initialize()`, with three accessors mirroring the `saveEvaluation`/`getCycle`/`getAllCycles` idioms (`data-manager.js:291-302`, `:521-539`, `:548-559`).
- **Pure builder** `ResultsAnalytics.buildResultsSnapshot(cycleID, input)` — no cache, no I/O; takes the already-built `CohortRow[]` frame and the already-computed Coverage report (Component B output) plus the re-read cycle, returns the locked snapshot. Unit-tested with hand-built fixtures, mirroring `task-resolver.js`.
- **Impure orchestrator** `ResultsAnalytics.persistResultsSnapshot(cycleID)` — re-reads the cycle via `getCycle`, builds frame + coverage (Component B helpers), calls the pure builder, then `saveResultsSnapshot`. Wired into `#closeCycle` (`competence-web-application.js:1965`) as a **post-close, non-blocking** step: a snapshot failure is logged via `@ti-engine/core/logger`, never propagated.
- **Org-root accessor** `OrganizationManager.getOrganizationRootUnitID()` — returns the unit whose `parent` attribute is `null` (the real root id is `"1"`, `config.organization-structure.json:9`). Required because whole-org Coverage must NOT pass `""` to `getOrganizationUnitSubtree` — the guard at `organization-manager.js:395` returns `null` for an empty-string root, yielding an empty roster (`overall.N == evaluation count`, `notStarted == 0`), silently breaking R1 Coverage. `persistResultsSnapshot` and Component B's whole-org `resolve` use this accessor, not `""`.

## Tech Stack

- CommonJS (`require`/`module.exports`); internal `#alias` imports; frozen singleton `module.exports.instance = Object.freeze(new ResultsAnalytics())` (cf. `data-manager.js`).
- Tests: Node built-in `node --test` over `packages/competence/test/*.test.js`; `installInMemoryCache()` helper (`test/helpers/in-memory-cache.js`); pure-function fixture injection (`task-resolver.test.js` precedent). No Redis, no DOM harness.

## Depends on

- **none** for tasks C1, C2, C5, and the new C0 org-root accessor — these are standalone.
- Tasks C3 and C4 add methods to `packages/competence/application/results-analytics.js`, the file **Component B (CA-F2)** creates. If C lands before B: C3 creates the file with the frozen singleton + only these methods; C4 uses temporary Phase-0 stubs for Component B's `#buildCohortFrame` + `getCoverageReport` (noted inline). The `#results-analytics` entry in `package.json` "imports" is added by whichever of B/C lands first — guard against a duplicate.

## File structure

```
packages/competence/
  application/
    organization-manager.js          (MODIFY — add getOrganizationRootUnitID)
    data-manager.js                  (MODIFY — 8th key + seed + 3 accessors)
    results-analytics.js             (CREATE or MODIFY — buildResultsSnapshot + persistResultsSnapshot)
  bin/
    competence-web-application.js     (MODIFY — wire persistResultsSnapshot into #closeCycle)
  package.json                        (MODIFY — add #results-analytics import)
  design/
    statistics-and-results.md         (MODIFY — Implementation-log verify-and-cite entry)
  test/
    organization-root-unit.test.js               (CREATE)
    results-snapshots.test.js                     (CREATE)
    results-analytics.snapshot-builder.test.js    (CREATE)
    results-analytics.persist.test.js             (CREATE)
```

---

### Task C0: `getOrganizationRootUnitID()` accessor (whole-org root, not `""`)

Whole-org Coverage must resolve the real org-root unit id. `getOrganizationUnitSubtree("")` returns `null` (guard at `organization-manager.js:395`), so `buildRoster(null)` returns `[]` — an empty roster makes `notStarted` always `0` and the gauge/bars render `0/0`. The root unit is the node whose `parent` attribute is `null` (id `"1"`, `config.organization-structure.json:9`). The chart already stores each unit's `parent` attribute (`organization-manager.js:94`).

**Files**
- Modify: `packages/competence/application/organization-manager.js`
- Test: `packages/competence/test/organization-root-unit.test.js` (new)

**Steps**

- [ ] Write the failing test. Create `packages/competence/test/organization-root-unit.test.js`:
```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const organizationManager = require( "#organization-manager" );

before( async () => {
    installInMemoryCache();
    process.env.COMPETENCE_PRELOAD_DATA = "true";
    const dataManager = require( "#data-manager" );
    await dataManager.instance.initialize();
    await organizationManager.instance.buildOrganizationChart();
} );

describe( "OrganizationManager.getOrganizationRootUnitID", () => {

    it( "returns the unit whose parent is null (the org root, id '1')", () => {
        assert.equal( organizationManager.instance.getOrganizationRootUnitID(), "1" );
    } );

    it( "returns a non-empty subtree for the resolved root (roster is not empty)", () => {
        const root = organizationManager.instance.getOrganizationRootUnitID();
        const subtree = organizationManager.instance.getOrganizationUnitSubtree( root );
        assert.ok( subtree, "subtree for the org root must not be null" );
        assert.equal( subtree.id, "1" );
    } );

} );
```

- [ ] Run it — expect FAIL (`getOrganizationRootUnitID is not a function`):
```
node --test packages/competence/test/organization-root-unit.test.js
```
Expected: `TypeError: organizationManager.instance.getOrganizationRootUnitID is not a function`.

- [ ] Implement the accessor. In `organization-manager.js`, insert in the public interface immediately before `getOrganizationUnitSubtree` (before line 385's doc comment):
```js
    /**
     * Returns the organization-chart root unit ID — the unit whose `parent` attribute is null. Used by whole-org
     * reporting (Coverage) so the roster is built from the real root subtree instead of an empty-string root, which
     * getOrganizationUnitSubtree rejects (guard at :395). Returns "" when the chart is not built or has no root.
     *
     * @method
     * @returns {string}
     * @public
     */
    getOrganizationRootUnitID() {
        if ( !this.#organizationChart ) {
            return "";
        }
        const rootNodeID = this.#organizationChart.nodes().find( ( nodeID ) => {
            if ( this.#organizationChart.getNodeAttribute( nodeID, "nodeType" ) !== "organizationUnit" ) {
                return false;
            }
            return this.#organizationChart.getNodeAttribute( nodeID, "parent" ) == null;
        } );
        if ( !rootNodeID ) {
            return "";
        }
        return this.#organizationChart.getNodeAttribute( rootNodeID, "id" );
    }

```

- [ ] Run the test — expect PASS:
```
node --test packages/competence/test/organization-root-unit.test.js
```
Expected: `# pass 2  # fail 0`.

- [ ] Commit:
```
git add packages/competence/application/organization-manager.js packages/competence/test/organization-root-unit.test.js
git commit -m "feat(competence): add getOrganizationRootUnitID for whole-org reporting roster (CA-F3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task C1: 8th cache key `cacheEntryKeyResultsSnapshots` + `initialize()` seed

**Files**
- Modify: `packages/competence/application/data-manager.js`
- Test: `packages/competence/test/results-snapshots.test.js` (new)

**Steps**

- [ ] Write the failing test asserting the key is seeded as `{}` after `initialize()`. Create `packages/competence/test/results-snapshots.test.js`:
```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, before, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const cache = require( "@ti-engine/core/cache" );

let dataManager;

before( () => {
    installInMemoryCache();
    dataManager = require( "#data-manager" );
} );

beforeEach( () => {
    installInMemoryCache();
} );

describe( "DataManager — results-snapshots cache key", () => {

    it( "initialize() seeds the results-snapshots key as an empty object", async () => {
        delete process.env.COMPETENCE_PRELOAD_DATA;
        await dataManager.instance.initialize();
        const raw = await cache.instance.getJSON( "ti:competence:data:results-snapshots", "$" );
        assert.deepEqual( raw, [ {} ] );
    } );

} );
```

- [ ] Run it — expect FAIL (key never seeded, `getJSON` returns `null`):
```
node --test packages/competence/test/results-snapshots.test.js
```
Expected: `AssertionError [ERR_ASSERTION]: Expected values to be deeply equal: null !== [ {} ]`.

- [ ] Add the constant beside the existing seven. In `data-manager.js`, after line 21 (`const cacheEntryKeyRoleFamilies = …`):
```js
const cacheEntryKeyResultsSnapshots = "ti:competence:data:results-snapshots"; // { [cycleID]: ResultsSnapshot }
```

- [ ] Seed `{}` in `initialize()`. In `data-manager.js`, after line 66 (`promises.push( cache.instance.setJSON( cacheEntryKeyRoleFamilies, {}, "$", 1 ) );`):
```js
        promises.push( cache.instance.setJSON( cacheEntryKeyResultsSnapshots, {}, "$", 1 ) );
```

- [ ] Run the test — expect PASS:
```
node --test packages/competence/test/results-snapshots.test.js
```
Expected: `# pass 1  # fail 0`.

- [ ] Commit:
```
git add packages/competence/application/data-manager.js packages/competence/test/results-snapshots.test.js
git commit -m "feat(competence): add results-snapshots cache key + initialize seed (CA-F3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task C2: `saveResultsSnapshot` / `getResultsSnapshot` / `getAllResultsSnapshots` accessors

These mirror the `saveEvaluation` (`data-manager.js:291-302`, merge keyed by id), `getCycle` (`:521-539`, single-key `getJSON` with array-unwrap + `cloneDeep`, `null` when missing), and `getAllCycles` (`:548-559`, `getJSON "$"` + `Object.values` + sort) idioms. `getAllResultsSnapshots` sorts by `chronoKey` ascending (oldest→newest) for cross-cycle x-axis ordering.

**Files**
- Modify: `packages/competence/application/data-manager.js`
- Test: `packages/competence/test/results-snapshots.test.js` (extend)

**Steps**

- [ ] Write failing tests for the three accessors. Append to `results-snapshots.test.js`:
```js
describe( "DataManager — results-snapshots accessors", () => {

    beforeEach( async () => {
        delete process.env.COMPETENCE_PRELOAD_DATA;
        await dataManager.instance.initialize();
    } );

    it( "saveResultsSnapshot persists and getResultsSnapshot returns it by cycleID", async () => {
        const snap = { cycleID: "2026-H2", schemaVersion: 1, chronoKey: 4053 };
        await dataManager.instance.saveResultsSnapshot( snap );
        const got = await dataManager.instance.getResultsSnapshot( "2026-H2" );
        assert.deepEqual( got, snap );
    } );

    it( "getResultsSnapshot returns null for an unknown cycleID", async () => {
        const got = await dataManager.instance.getResultsSnapshot( "1999-H1" );
        assert.equal( got, null );
    } );

    it( "saveResultsSnapshot rejects a snapshot without a cycleID", async () => {
        await assert.rejects( () => dataManager.instance.saveResultsSnapshot( { schemaVersion: 1 } ) );
    } );

    it( "getAllResultsSnapshots returns every snapshot sorted by chronoKey ascending", async () => {
        await dataManager.instance.saveResultsSnapshot( { cycleID: "2027-H1", chronoKey: 4054 } );
        await dataManager.instance.saveResultsSnapshot( { cycleID: "2026-H1", chronoKey: 4052 } );
        await dataManager.instance.saveResultsSnapshot( { cycleID: "2026-H2", chronoKey: 4053 } );
        const all = await dataManager.instance.getAllResultsSnapshots();
        assert.deepEqual( all.map( ( s ) => s.cycleID ), [ "2026-H1", "2026-H2", "2027-H1" ] );
    } );

    it( "getAllResultsSnapshots returns [] when nothing is stored", async () => {
        const all = await dataManager.instance.getAllResultsSnapshots();
        assert.deepEqual( all, [] );
    } );

} );
```

- [ ] Run — expect FAIL (`dataManager.instance.saveResultsSnapshot is not a function`):
```
node --test packages/competence/test/results-snapshots.test.js
```
Expected: the five new tests fail (TypeError), the C1 seed test still passes.

- [ ] Implement the three accessors. In `data-manager.js`, insert after `saveEvaluation` (after its closing `}` at line 302):
```js
    /* ------------------------------------------------------------------ */
    /*                        Results snapshots                            */
    /* ------------------------------------------------------------------ */

    /**
     * Persists an immutable per-cycle results snapshot, keyed by `cycleID`. Merge-write (saveEvaluation idiom): because
     * the snapshot shape is fixed, re-saving the same cycle replaces all of that cycle's populated leaves.
     *
     * @method
     * @param {Object} snapshot - A ResultsSnapshot; must carry `cycleID`.
     * @returns {Promise<Object>}
     * @public
     */
    saveResultsSnapshot( snapshot ) {
        return new Promise( ( resolve, reject ) => {
            if ( !snapshot || !snapshot.cycleID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { snapshot } ) );
            }
            cache.instance.editJSON( cacheEntryKeyResultsSnapshots, { [ snapshot.cycleID ]: snapshot } ).then( () => {
                resolve( snapshot );
            } ).catch( ( error ) => {
                reject( error );
            } );
        } );
    }

    /**
     * Returns the results snapshot for a cycle, or null when none has been persisted.
     *
     * @method
     * @param {string} cycleID
     * @returns {Promise<Object|null>}
     * @public
     */
    getResultsSnapshot( cycleID ) {
        return new Promise( ( resolve, reject ) => {
            if ( !cycleID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { cycleID } ) );
            }
            if ( cache.instance.isOperational ) {
                cache.instance.getJSON( cacheEntryKeyResultsSnapshots, `${ cycleID }` ).then( ( result ) => {
                    const snapshot = _.cloneDeep( ( result instanceof Array ) ? result[ 0 ] : result );
                    resolve( snapshot || null );
                } ).catch( reject );
            } else {
                resolve( null );
            }
        } );
    }

    /**
     * Returns every persisted results snapshot, ordered by `chronoKey` ascending (oldest cycle first) so cross-cycle
     * trend axes read left-to-right in chronological order.
     *
     * @method
     * @returns {Promise<Array<Object>>}
     * @public
     */
    getAllResultsSnapshots() {
        return new Promise( ( resolve, reject ) => {
            if ( cache.instance.isOperational ) {
                cache.instance.getJSON( cacheEntryKeyResultsSnapshots, "$" ).then( ( result ) => {
                    const source = _.cloneDeep( ( result instanceof Array ) ? result[ 0 ] : result );
                    if ( !source || typeof source !== "object" ) {
                        return resolve( [] );
                    }
                    const snapshots = Object.values( source );
                    snapshots.sort( ( a, b ) => ( a.chronoKey || 0 ) - ( b.chronoKey || 0 ) );
                    resolve( snapshots );
                } ).catch( reject );
            } else {
                resolve( [] );
            }
        } );
    }

```

- [ ] Run — expect PASS (all six tests):
```
node --test packages/competence/test/results-snapshots.test.js
```
Expected: `# pass 6  # fail 0`.

- [ ] Commit:
```
git add packages/competence/application/data-manager.js packages/competence/test/results-snapshots.test.js
git commit -m "feat(competence): add results-snapshot accessors to data-manager (CA-F3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task C3: PURE `buildResultsSnapshot(cycleID, input)` (locked shape; only Coverage populated)

`buildResultsSnapshot` is **pure**: it takes the already-built `CohortRow[]` frame (Component B's `#buildCohortFrame` output) and the already-computed `coverageReport` (Component B's `getCoverageReport` output — accepted as input so this builder stays free of cross-module compute) plus the re-read `cycle` object, and returns the locked `ResultsSnapshot`. No cache, no `dataManager`. The stable-axis cross-cycle aggregates are present with the correct **shape** but empty for Phase 0 (`overall`/`byCategory`/`bySubcategory`/`byStageLevel`/`ladderOrdinalHistogram`/`byRoleFamily`/`byOrgUnit`), per §4 and the §6 lock requirement.

`dictionaryVersion` = the competence package version (`3.3.1`, `package.json:3`), passed in by the caller (C4 reads `require("../package.json").version`) so this stays pure. `chronoKey = year*2 + (H2 ? 1 : 0)` parsed from `cycleID` ("2026-H2" → 2026*2 + 1 = 4053). `competencyCodeEra` is the constant `"v3.0.0"` (the renumber era — see C5).

**Files**
- Create (if Component B has not yet) or Modify: `packages/competence/application/results-analytics.js`
- Modify: `packages/competence/package.json` (add `#results-analytics` import — only if not already added by Component B)
- Test: `packages/competence/test/results-analytics.snapshot-builder.test.js` (new)

**Steps**

- [ ] Write the failing test. Create `packages/competence/test/results-analytics.snapshot-builder.test.js`:
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

function cycle( over = {} ) {
    return {
        cycleID: over.cycleID || "2026-H2",
        status: over.status || "CLOSED",
        actualCloseDate: ( over.actualCloseDate !== undefined ) ? over.actualCloseDate : "2027-01-15"
    };
}

function coverageReport( over = {} ) {
    return {
        overall: { n: over.n || 2, N: over.N || 3, pct: over.pct || 66.7, byStatus: over.byStatus || {}, notStarted: over.notStarted || 1 },
        byGroup: over.byGroup || [],
        pending: over.pending || []
    };
}

describe( "ResultsAnalytics.buildResultsSnapshot — locked shape", () => {

    it( "produces the locked top-level keys with coverage populated and stable axes stubbed", () => {
        const snap = resultsAnalytics.instance.buildResultsSnapshot( "2026-H2", {
            frame: [ { evaluationID: "e1" }, { evaluationID: "e2" } ],
            coverageReport: coverageReport(),
            cycle: cycle(),
            dictionaryVersion: "3.3.1",
            meta: { cycleID: "2026-H2", mode: "snapshot", cycleStatus: "CLOSED" }
        } );

        assert.equal( snap.cycleID, "2026-H2" );
        assert.equal( snap.schemaVersion, 1 );
        assert.equal( snap.dictionaryVersion, "3.3.1" );
        assert.equal( snap.competencyCodeEra, "v3.0.0" );
        assert.equal( snap.provisional, false );
        assert.equal( snap.cycleClosedAt, "2027-01-15" );
        assert.ok( typeof snap.computedAt === "string" && snap.computedAt.length > 0 );
        assert.deepEqual( snap.reports.coverage, coverageReport() );

        // stable-axis aggregate stubs present with the correct shape, empty for Phase 0
        assert.deepEqual( snap.overall, { finalScore: {}, tBandMix: {} } );
        assert.deepEqual( snap.byCategory, {} );
        assert.deepEqual( snap.bySubcategory, {} );
        assert.deepEqual( snap.byStageLevel, {} );
        assert.deepEqual( snap.ladderOrdinalHistogram, {} );
        assert.deepEqual( snap.byRoleFamily, {} );
        assert.deepEqual( snap.byOrgUnit, {} );

        // other Phase-0 report slots present but null (locked envelope)
        assert.equal( snap.reports.timeDistribution, null );
        assert.equal( snap.reports.alignment, null );
        assert.equal( snap.reports.heatmap, null );
        assert.equal( snap.reports.levelDistribution, null );
        assert.equal( snap.reports.predictiveDrivers, null );
    } );

    it( "computes chronoKey = year*2 + (H2?1:0)", () => {
        const h2 = resultsAnalytics.instance.buildResultsSnapshot( "2026-H2", {
            frame: [], coverageReport: coverageReport(), cycle: cycle( { cycleID: "2026-H2" } ),
            dictionaryVersion: "3.3.1", meta: {}
        } );
        const h1 = resultsAnalytics.instance.buildResultsSnapshot( "2026-H1", {
            frame: [], coverageReport: coverageReport(), cycle: cycle( { cycleID: "2026-H1" } ),
            dictionaryVersion: "3.3.1", meta: {}
        } );
        assert.equal( h2.chronoKey, 4053 );
        assert.equal( h1.chronoKey, 4052 );
    } );

    it( "derives cohort counts from the frame and coverage report", () => {
        const snap = resultsAnalytics.instance.buildResultsSnapshot( "2026-H2", {
            frame: [ { evaluationID: "e1" }, { evaluationID: "e2" } ],
            coverageReport: coverageReport( { n: 2, N: 3, pct: 66.7 } ),
            cycle: cycle(), dictionaryVersion: "3.3.1", meta: {}
        } );
        assert.equal( snap.cohort.nEligible, 3 );
        assert.equal( snap.cohort.nClosed, 2 );
        assert.equal( snap.cohort.reportingPct, 66.7 );
    } );

    it( "tolerates a null coverageReport (degraded snapshot still locks the envelope)", () => {
        const snap = resultsAnalytics.instance.buildResultsSnapshot( "2026-H2", {
            frame: [], coverageReport: null, cycle: cycle(), dictionaryVersion: "3.3.1", meta: {}
        } );
        assert.equal( snap.reports.coverage, null );
        assert.equal( snap.cohort.nEligible, 0 );
        assert.equal( snap.cohort.reportingPct, 0 );
    } );

} );
```

- [ ] Run — expect FAIL. If Component B has not created `results-analytics.js`, the failure is `Cannot find module '#results-analytics'`; otherwise `buildResultsSnapshot is not a function`:
```
node --test packages/competence/test/results-analytics.snapshot-builder.test.js
```

- [ ] Add the `#results-analytics` import to `package.json` **only if not already present** (Component B may have added it). In `packages/competence/package.json`, in `"imports"` after the `#organization-manager` line (`:21`):
```json
    "#results-analytics": "./application/results-analytics.js",
```

- [ ] Implement `buildResultsSnapshot`. If `results-analytics.js` does not exist yet, create it with the scaffold below (Component B adds the rest of its methods to the same class); if it exists, add only the method:
```js
    /**
     * Builds the immutable ResultsSnapshot for a closed cycle. PURE — takes the already-built cohort `frame`, the
     * already-computed Coverage report, and the re-read `cycle` (so `actualCloseDate` is populated). For Phase 0 only
     * `reports.coverage` is populated; the cross-cycle stable-axis aggregates are present with their locked shape but
     * empty (back-fill is impossible, so the envelope is locked now — §4 / §6).
     *
     * @method
     * @param {string} cycleID
     * @param {Object} input
     * @param {Array<Object>} input.frame - The CohortRow[] (Component B); used for cohort counts.
     * @param {Object|null} input.coverageReport - The Coverage payload (Component B getCoverageReport output).
     * @param {Object} input.cycle - The re-read cycle (carries `actualCloseDate`).
     * @param {string} input.dictionaryVersion - The competence package version (code-drift guard).
     * @param {Object} input.meta - The ResultMeta envelope.
     * @returns {Object} The locked ResultsSnapshot.
     * @public
     */
    buildResultsSnapshot( cycleID, input ) {
        const frame = Array.isArray( input.frame ) ? input.frame : [];
        const coverageReport = input.coverageReport || null;
        const cycle = input.cycle || {};
        const overall = ( coverageReport && coverageReport.overall ) ? coverageReport.overall : {};

        const parts = String( cycleID ).split( "-" );
        const year = Number( parts[ 0 ] ) || 0;
        const half = parts[ 1 ];
        const chronoKey = ( year * 2 ) + ( half === "H2" ? 1 : 0 );

        return {
            cycleID: cycleID,
            schemaVersion: 1,
            dictionaryVersion: input.dictionaryVersion || null,
            competencyCodeEra: "v3.0.0",
            computedAt: new Date().toISOString(),
            cycleClosedAt: cycle.actualCloseDate || null,
            provisional: false,
            chronoKey: chronoKey,
            meta: input.meta || {},
            cohort: {
                nEligible: ( overall.N != null ) ? overall.N : 0,
                nClosed: frame.length,
                nScored: frame.length,
                reportingPct: ( overall.pct != null ) ? overall.pct : 0
            },

            // Phase 0: only coverage is populated; the rest of the locked report envelope is present but null.
            reports: {
                coverage: coverageReport,
                timeDistribution: null,
                alignment: null,
                heatmap: null,
                levelDistribution: null,
                predictiveDrivers: null
            },

            // Cross-cycle stable-axis substrate — locked SHAPE now, populated in later phases (never back-fillable).
            overall: { finalScore: {}, tBandMix: {} },
            byCategory: {},
            bySubcategory: {},
            byStageLevel: {},
            ladderOrdinalHistogram: {},
            byRoleFamily: {},
            byOrgUnit: {}
        };
    }
```
If creating the file fresh, the surrounding scaffold is:
```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * @class ResultsAnalytics
 * @singleton
 * @public
 */
class ResultsAnalytics {

    static #instance = null;

    constructor() {
        if ( !ResultsAnalytics.#instance ) {
            ResultsAnalytics.#instance = this;
        }
        return ResultsAnalytics.#instance;
    }

    /* …buildResultsSnapshot here… */

}

module.exports.instance = Object.freeze( new ResultsAnalytics() );
```

- [ ] Run — expect PASS:
```
node --test packages/competence/test/results-analytics.snapshot-builder.test.js
```
Expected: `# pass 4  # fail 0`.

- [ ] Commit:
```
git add packages/competence/application/results-analytics.js packages/competence/package.json packages/competence/test/results-analytics.snapshot-builder.test.js
git commit -m "feat(competence): pure buildResultsSnapshot with locked shape, coverage-only (CA-F3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task C4: `persistResultsSnapshot(cycleID)` + wire into `#closeCycle` (re-read cycle for `actualCloseDate`)

`persistResultsSnapshot(cycleID)` is the **impure** persistence step: it `getCycle(cycleID)` (re-read so `actualCloseDate` is populated — `updateCycleStatus` wrote it at `data-manager.js:602` *after* the cycle object that entered `closeCycle`), builds the whole-org frame + coverage (Component B's `#buildCohortFrame` + `getCoverageReport`, scoped to the **resolved org root** from C0 — never `""`), calls the pure `buildResultsSnapshot`, then `saveResultsSnapshot`.

**Contract — getCycle rejection (major issue):** `dataManager.getCycle` **rejects** with `E_APP_RESOURCE_NOT_FOUND` for an unknown cycleID (`data-manager.js:530`/`:536`) — it never resolves `null`. `persistResultsSnapshot` is only ever called post-close on a just-closed (hence existing) cycle, so the not-found path is unreachable in practice; the `#closeCycle` `.catch` (below) logs any rejection rather than relying on a null cycle `getCycle` never produces. This contract is recorded in the method doc.

**Wiring rule (verified):** `#closeCycle` resolves with the updated cycle at `competence-web-application.js:1965`. `persistResultsSnapshot` runs **inside that `.then`, after** `closeCycle` resolves (so `actualCloseDate` is already written), re-reads the cycle itself via `getCycle`, and must **not** block or fail the close response — a snapshot error is logged via `@ti-engine/core/logger`, not propagated (the cycle is already CLOSED).

**Files**
- Modify: `packages/competence/application/results-analytics.js`
- Modify: `packages/competence/bin/competence-web-application.js`
- Test: `packages/competence/test/results-analytics.persist.test.js` (new)

**Steps**

- [ ] Write the failing test. Create `packages/competence/test/results-analytics.persist.test.js`:
```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, before, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const configurationLoader = require( "#configuration-loader" );

let dataManager;
let resultsAnalytics;

before( () => {
    installInMemoryCache();
    dataManager = require( "#data-manager" );
    resultsAnalytics = require( "#results-analytics" );
} );

beforeEach( async () => {
    installInMemoryCache();
    delete process.env.COMPETENCE_PRELOAD_DATA;
    await dataManager.instance.initialize();
} );

describe( "ResultsAnalytics.persistResultsSnapshot — re-reads cycle for actualCloseDate", () => {

    it( "persists a snapshot whose cycleClosedAt equals the re-read cycle.actualCloseDate", async () => {
        // A cycle already transitioned to CLOSED (actualCloseDate written by updateCycleStatus on →CLOSED).
        await dataManager.instance.createCycle( {
            cycleID: "2026-H2", name: "Autumn '26", cycleStart: "2026-07-01", cycleDate: "2026-11-30", cycleEnd: "2026-12-31"
        } );
        await dataManager.instance.updateCycleStatus( "2026-H2", configurationLoader.cycleStatus.CLOSED );

        const saved = await resultsAnalytics.instance.persistResultsSnapshot( "2026-H2" );
        assert.equal( saved.cycleID, "2026-H2" );

        const reread = await dataManager.instance.getCycle( "2026-H2" );
        const stored = await dataManager.instance.getResultsSnapshot( "2026-H2" );
        assert.ok( stored, "snapshot must be persisted" );
        assert.equal( stored.cycleClosedAt, reread.actualCloseDate );
        assert.equal( stored.schemaVersion, 1 );
        assert.equal( stored.provisional, false );
        assert.equal( stored.competencyCodeEra, "v3.0.0" );
        // coverage slot present (object when B's helpers exist, null with the Phase-0 stub) — slot must exist:
        assert.ok( "coverage" in stored.reports, "coverage report slot must be present in the snapshot" );
    } );

} );
```

- [ ] Run — expect FAIL (`persistResultsSnapshot is not a function`):
```
node --test packages/competence/test/results-analytics.persist.test.js
```

- [ ] Implement `persistResultsSnapshot` in `results-analytics.js`. Add the requires at the top (after the GPL header):
```js
const dataManager = require( "#data-manager" );
const organizationManager = require( "#organization-manager" );
const packageVersion = require( "../package.json" ).version;
```
Add the method (the frame/coverage builders are Component B's `#buildCohortFrame` + `getCoverageReport`; the whole-org scope uses the C0 root accessor, never `""`):
```js
    /**
     * Builds and persists the immutable results snapshot for a just-closed cycle. RE-READS the cycle via getCycle so
     * `actualCloseDate` (written by updateCycleStatus on ACTIVE→CLOSED, data-manager.js:602) is captured — the cycle
     * object that entered closeCycle predates that write. CONTRACT: only ever called post-close on an existing cycle;
     * getCycle rejects (E_APP_RESOURCE_NOT_FOUND) for an unknown cycleID rather than resolving null, and that rejection
     * is logged by the caller's catch, not swallowed here. Whole-org scope uses the resolved org-root unit id (never
     * the empty string, which getOrganizationUnitSubtree rejects → empty roster). Idempotent: re-running merge-writes
     * the cycle's snapshot, and since the shape is fixed every populated leaf is replaced.
     *
     * @method
     * @param {string} cycleID
     * @returns {Promise<Object>} The persisted ResultsSnapshot.
     * @public
     */
    persistResultsSnapshot( cycleID ) {
        return dataManager.instance.getCycle( cycleID ).then( ( cycle ) => {
            const rootUnitID = organizationManager.instance.getOrganizationRootUnitID();
            const filter = { groupBy: "orgUnit", allowedEmployeeIDs: null, rootUnitID: rootUnitID };
            return this.#buildCohortFrame( cycleID, filter ).then( ( frame ) => {
                const coverageReport = this.getCoverageReport( frame, filter );
                const meta = {
                    cycleID: cycleID,
                    mode: "snapshot",
                    cycleStatus: cycle.status,
                    computedAt: new Date().toISOString(),
                    partial: false
                };
                const snapshot = this.buildResultsSnapshot( cycleID, {
                    frame: frame,
                    coverageReport: coverageReport,
                    cycle: cycle,
                    dictionaryVersion: packageVersion,
                    meta: meta
                } );
                return dataManager.instance.saveResultsSnapshot( snapshot );
            } );
        } );
    }
```

> **Component-B dependency:** `#buildCohortFrame` and `getCoverageReport` are CA-F2 (Component B) deliverables. If C4 lands before B, add temporary Phase-0 stubs to `results-analytics.js` so the wiring and the re-read are testable now (B replaces them with the real implementations) — track this handoff in the implementation log:
> ```js
>     // TEMPORARY Phase-0 stub — replaced by Component B (CA-F2). Returns an empty whole-org frame so the
>     // persist orchestration + cycle re-read are testable before B lands.
>     #buildCohortFrame( cycleID, filter ) {
>         return Promise.resolve( [] );
>     }
>
>     // TEMPORARY Phase-0 stub — replaced by Component B (CA-F2).
>     getCoverageReport( frame, filter ) {
>         return { overall: { n: 0, N: 0, pct: 0, byStatus: {}, notStarted: 0 }, byGroup: [], pending: [] };
>     }
> ```

- [ ] Run — expect PASS:
```
node --test packages/competence/test/results-analytics.persist.test.js
```
Expected: `# pass 1  # fail 0`.

- [ ] Wire `persistResultsSnapshot` into `#closeCycle`. Add two requires at the top of `competence-web-application.js` — beside the existing `taskResolver` require (`:17`) add `resultsAnalytics`, and add the core logger (the file does not yet import one):
```js
const taskResolver = require( "#task-resolver" );
const resultsAnalytics = require( "#results-analytics" );
const logger = require( "@ti-engine/core/logger" );
```
Then replace the `#closeCycle` resolve body (`competence-web-application.js:1965-1969`):
```js
            competenceFramework.instance.closeCycle( cycleID ).then( ( cycle ) => {
                resolve( cycle );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
```
with — snapshot runs after the close, re-reads the cycle itself, and never blocks/fails the close response:
```js
            competenceFramework.instance.closeCycle( cycleID ).then( ( cycle ) => {
                // Post-close: persist the immutable results snapshot. persistResultsSnapshot re-reads the cycle (for
                // actualCloseDate) itself, so it does not depend on `cycle` freshness. A snapshot failure — including
                // the getCycle not-found rejection, which cannot occur here since the cycle was just closed — is logged,
                // not propagated: the cycle is already CLOSED and the close response must still succeed.
                resultsAnalytics.instance.persistResultsSnapshot( cycleID ).catch( ( snapshotError ) => {
                    logger.log( `Failed to persist results snapshot for cycle '${ cycleID }': ${ snapshotError && snapshotError.message ? snapshotError.message : snapshotError }`, logger.logSeverity.WARNING, { cycleID: cycleID } );
                } );
                resolve( cycle );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
```
> Note: `logger.log(message, level, data)` and `logger.logSeverity` are the verified core API (`packages/core/utils/logger.js:71`, `:32`). The base `TiWebAppManager` exposes no `reportError`/`reportHealthIssue` method, so logging goes through the core logger directly.

- [ ] Run the full competence suite to confirm no regression in the close path:
```
cd packages/competence && npm test
```
Expected: all suites pass, including the four new snapshot/org-root suites.

- [ ] Commit:
```
git add packages/competence/application/results-analytics.js packages/competence/bin/competence-web-application.js packages/competence/test/results-analytics.persist.test.js
git commit -m "feat(competence): persistResultsSnapshot wired into closeCycle, re-reads cycle for actualCloseDate (CA-F3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task C5: Verify-and-cite the subcategory-axis stability gate (§6 lock; doc-only)

No code; this is the **§6 verify-and-cite gate** that must be satisfied before the snapshot shape is considered locked. The cross-cycle substrate (`bySubcategory`, `byRoleFamily[].bySubcategoryGap`) rests on the 9 subcategory codes (E1..C3) and their 3 category rollups being invariant across the v3.0.0 164→108 renumber. The citations are in the **competence** package CHANGELOG, not the repo-root one — the path must carry the `packages/competence/` prefix (the line numbers `:84`/`:104` are correct and verified).

**Files**
- Modify: `packages/competence/design/statistics-and-results.md` (Implementation-log entry only)

**Steps**

- [ ] Confirm the citation with a Read before quoting. `packages/competence/CHANGELOG.md:84` states the rebuild went "from 164 to **108** finalized competencies … Drop 64 retired codes and add 8 … the `I1` range is renumbered clean" — i.e. **leaf** codes changed. `packages/competence/CHANGELOG.md:104` states "The config file shapes, JSON schemas, and framework logic are unchanged — this is a content replacement, not an API change." The subcategory set `["E1","E2","E3","I1","I2","I3","C1","C2","C3"]` is a frozen framework constant (`competence-framework.js:38`), independent of leaf-code count. Therefore the E1..C3 subcategory axis and the E/I/C category rollups are **invariant** across the renumber; only **raw leaf-code** cross-cycle drill inherits drift risk (already deferred behind `competency-code-map.json`, §7 decision 8).

- [ ] Record the verified citation in the Implementation log of `statistics-and-results.md` (replace the `- _(not started — Phase 0 next)_` placeholder line, or append below it):
```md
- 2026-06-21 — CA-F3 subcategory-axis stability gate VERIFIED: the v3.0.0 164→108 renumber changed leaf competency codes only (`packages/competence/CHANGELOG.md:84`), and "config file shapes, JSON schemas, and framework logic are unchanged — content replacement, not an API change" (`packages/competence/CHANGELOG.md:104`). The E1..C3 subcategory axis is a frozen framework constant (`competence-framework.js:38`), independent of leaf-code count. Conclusion: subcategory/category cross-cycle aggregates rest on a verified-stable axis; raw leaf-code drill stays deferred behind `competency-code-map.json` (§7.8). `competencyCodeEra` locked to `"v3.0.0"` in the ResultsSnapshot shape.
```

- [ ] Commit:
```
git add packages/competence/design/statistics-and-results.md
git commit -m "docs(competence): verify+cite subcategory-axis stability gate for snapshot lock (CA-F3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Component C — manual verification (no DOM; orchestration only)

Component C has **no UI surface** — its deliverable is verified by the automated suites above plus one end-to-end manual check that a real cycle-close writes a snapshot **with a non-empty org-wide roster** (the C0 fix). The live/snapshot Coverage *render* is verified in Component D's manual steps.

- [ ] **Manual:** Launch the app per the project run/verify skill (`/run`), sign in as a Supervisor, close an ACTIVE cycle via the Cycles screen, then confirm via the data layer that `ti:competence:data:results-snapshots` now contains an entry for that `cycleID` with: (a) `cycleClosedAt` equal to the cycle's `actualCloseDate`; (b) `reports.coverage` populated; and **(c) `reports.coverage.overall.N` greater than the closed-evaluation count and `notStarted` greater than 0** — proving the whole-org roster resolved through the real org root (`getOrganizationRootUnitID()` → `"1"`) rather than the empty-string root that yields an empty roster. Mark this as **manual verification**, not an automated test.

---

## Done when

- [ ] `node --test packages/competence/test/organization-root-unit.test.js` passes (2/2): root id is `"1"` and its subtree is non-empty.
- [ ] `node --test packages/competence/test/results-snapshots.test.js` passes (6/6): 8th key seeded; `saveResultsSnapshot`/`getResultsSnapshot`/`getAllResultsSnapshots` behave (merge-write, `null` on miss, reject without `cycleID`, sort by `chronoKey`, `[]` when empty).
- [ ] `node --test packages/competence/test/results-analytics.snapshot-builder.test.js` passes (4/4): locked shape, coverage-only populated, stable-axis stubs present-but-empty, `chronoKey`/`competencyCodeEra` correct, null-coverage tolerated.
- [ ] `node --test packages/competence/test/results-analytics.persist.test.js` passes (1/1): persisted `cycleClosedAt` equals the **re-read** cycle's `actualCloseDate`.
- [ ] `cd packages/competence && npm test` is green (no regression in the close path).
- [ ] `#closeCycle` (`competence-web-application.js:1965`) calls `persistResultsSnapshot` inside the close `.then`, non-blocking, logging any failure via `@ti-engine/core/logger` (no `this.reportError`).
- [ ] `persistResultsSnapshot` resolves the whole-org root via `getOrganizationRootUnitID()` and never passes `""` to `getOrganizationUnitSubtree`.
- [ ] `#results-analytics` is present exactly once in `packages/competence/package.json` "imports".
- [ ] The §6 subcategory-axis-stability gate is recorded in `statistics-and-results.md` citing `packages/competence/CHANGELOG.md:84`/`:104` and `competence-framework.js:38`.
- [ ] **Manual:** a Supervisor cycle-close writes a snapshot whose `reports.coverage.overall.N` exceeds the evaluation count and whose `notStarted > 0` (roster resolved org-wide), in the running app.

---

**Issues applied:** the two org-root blockers → new Task C0 accessor + `persistResultsSnapshot` uses it (filter carries `rootUnitID`, never `""`) + manual check asserts non-zero roster; the getCycle-rejection major → documented contract in the method doc + the `#closeCycle` catch logs (it never relies on a null cycle); the CHANGELOG-path minor → `packages/competence/CHANGELOG.md:84`/`:104` (line numbers verified correct, only the path was wrong; the variant issue claiming lines ~5/~25 is itself mistaken — the strings are verbatim at `:84`/`:104`); the idempotency-wording minor → softened to "merge-writes … shape is fixed so every populated leaf is replaced"; and the wiring's nonexistent `this.reportError` → replaced with the verified `logger.log(message, logger.logSeverity.WARNING, data)`. The gauge-sublabel, sidebar-anchor, and renderGauge minors target Components A/D and are out of scope here.
