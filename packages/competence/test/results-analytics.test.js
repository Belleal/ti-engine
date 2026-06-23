/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const exceptions = require( "@ti-engine/core/exceptions" );
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

    it( "resolve() swallows E_APP_RESOURCE_NOT_FOUND (numeric code) and returns empty snapshot, not a rejection", async () => {
        // Verifies the fix: error.code is a numeric enum value (5004), NOT the string key "E_APP_RESOURCE_NOT_FOUND".
        // The old code compared against the string and the catch never matched, causing the rejection to propagate.
        // We simulate the fixed resolve() getCycle wrapper: reject with a genuine TiException, catch only on the
        // numeric constant (exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND === 5004), and resolve null for that case.
        const notFoundException = exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: "Cycle 'no-such-cycle' not found!" } );
        const wrappedGetCycle = ( id ) => Promise.reject( notFoundException ).catch( ( error ) => {
            if ( error && error.code === exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND ) {
                return null;
            }
            throw error;
        } );
        const deps = depsFixture( {
            getCycle: wrappedGetCycle,
            getResultsSnapshot: () => Promise.resolve( null )
        } );
        const result = await resultsAnalyticsInstance._resolveWith( deps, "no-such-cycle", filterFixture( { allowedEmployeeIDs: null } ), "coverage" );
        assert.equal( result.meta.mode, "snapshot" );
        assert.equal( result.coverage.overall.N, 0 );
        assert.equal( result.coverage.overall.pct, 0 );
        // Confirm the TiException carries the numeric code (not the string key) — the old string comparison was dead.
        assert.equal( notFoundException.code, exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND );
        assert.equal( typeof notFoundException.code, "number" );
    } );

} );

/* ===================== Phase 1B — Step 0: shared scaffolding ===================== */

describe( "ResultsAnalytics — #emptyReport / dispatch shapes (Step 0)", () => {

    // The empty shapes are observed through the resolve() snapshot-projection path (CLOSED + whole-org + no snapshot).
    function emptyDeps() {
        return {
            getCycle: ( id ) => Promise.resolve( { cycleID: id, status: "CLOSED" } ),
            fetchEvaluations: () => Promise.resolve( [] ),
            getResultsSnapshot: () => Promise.resolve( null ),   // null snapshot forces #emptyReport(reportKey)
            buildSubtree: () => null,
            resolveOrgUnit: () => ""
        };
    }

    it( "returns the locked empty shape per report key (whole-org closed cycle, no snapshot)", async () => {
        const filter = { groupBy: "orgUnit", allowedEmployeeIDs: null, rootUnitID: "1" };
        const td = await resultsAnalyticsInstance._resolveWith( emptyDeps(), "2026-H2", filter, "timeDistribution" );
        assert.deepEqual( td.timeDistribution, { rows: [], unscheduledReady: 0, perManager: [] } );
        const al = await resultsAnalyticsInstance._resolveWith( emptyDeps(), "2026-H2", filter, "alignment" );
        assert.deepEqual( al.alignment, { points: [], quadrantCounts: {}, diagonal: true } );
        const hm = await resultsAnalyticsInstance._resolveWith( emptyDeps(), "2026-H2", filter, "heatmap" );
        assert.deepEqual( hm.heatmap, { rows: [], cols: [], cells: [] } );
        const ld = await resultsAnalyticsInstance._resolveWith( emptyDeps(), "2026-H2", filter, "levelDistribution" );
        assert.deepEqual( ld.levelDistribution, { groups: [], reference: [] } );
        const pd = await resultsAnalyticsInstance._resolveWith( emptyDeps(), "2026-H2", filter, "predictiveDrivers" );
        assert.deepEqual( pd.predictiveDrivers, { rows: [], insufficientData: true } );
    } );

} );

describe( "ResultsAnalytics — expectedGradeForArchetype (maturity-step, Candidate 1)", () => {
    // Archetype A weights (live config): peak 9 → intro 4.5, mature 8.1.
    const A = { N1: 6, J1: 7, J2: 7, J3: 8, R1: 8, R2: 8, R3: 9, S1: 9, S2: 9, S3: 9, X1: 9, T1: 9 };

    it( "maps w<0.5*peak→U, 0.5*peak<=w<0.9*peak→R, w>=0.9*peak→S (strict <)", () => {
        assert.equal( resultsAnalytics.expectedGradeForArchetype( A, "N1" ), "R" );   // 6 ∈ [4.5,8.1)
        assert.equal( resultsAnalytics.expectedGradeForArchetype( A, "R3" ), "S" );   // 9 ≥ 8.1
        assert.equal( resultsAnalytics.expectedGradeForArchetype( { L: 3, M: 8 }, "L" ), "U" ); // 3 < 0.5*8 = 4
    } );
    it( "boundary at exactly mature → S (w >= 0.9*peak)", () => {
        // peak 10 → mature 9.0; a level at exactly 9 is S.
        assert.equal( resultsAnalytics.expectedGradeForArchetype( { a: 9, b: 10 }, "a" ), "S" );
    } );
    it( "a flat archetype (constant weight) → all S, not the all-R trap", () => {
        assert.equal( resultsAnalytics.expectedGradeForArchetype( { a: 5, b: 5, c: 5 }, "b" ), "S" );
    } );
    it( "a degenerate all-zero curve → U (grade never affects the score anyway)", () => {
        assert.equal( resultsAnalytics.expectedGradeForArchetype( { a: 0, b: 0 }, "a" ), "U" );
    } );
} );

describe( "ResultsAnalytics — pearson", () => {
    it( "is +1 for a perfectly increasing linear relation and -1 for decreasing", () => {
        assert.equal( resultsAnalytics.pearson( [ 1, 2, 3 ], [ 2, 4, 6 ] ), 1 );
        assert.equal( resultsAnalytics.pearson( [ 1, 2, 3 ], [ 6, 4, 2 ] ), -1 );
    } );
    it( "returns null for a constant (zero-variance) vector or n<2 or mismatched length", () => {
        assert.equal( resultsAnalytics.pearson( [ 1, 2, 3 ], [ 5, 5, 5 ] ), null );
        assert.equal( resultsAnalytics.pearson( [ 1 ], [ 1 ] ), null );
        assert.equal( resultsAnalytics.pearson( [ 1, 2 ], [ 1 ] ), null );
    } );
} );

describe( "ResultsAnalytics — nearestRankPercentile", () => {
    it( "returns nearest-rank values (no interpolation)", () => {
        const v = [ 10, 20, 30, 40, 50 ];
        assert.equal( resultsAnalytics.nearestRankPercentile( v, 0 ), 10 );
        assert.equal( resultsAnalytics.nearestRankPercentile( v, 0.25 ), 20 );
        assert.equal( resultsAnalytics.nearestRankPercentile( v, 0.5 ), 30 );
        assert.equal( resultsAnalytics.nearestRankPercentile( v, 1 ), 50 );
    } );
    it( "returns null for an empty array", () => {
        assert.equal( resultsAnalytics.nearestRankPercentile( [], 0.5 ), null );
    } );
} );

/* ===================== R5 — level distribution + maturity-step expected curve ===================== */

describe( "ResultsAnalytics.computeLevelDistribution (R5)", () => {
    // Live archetype A weight curve (peak 9 → intro 4.5, mature 8.1): R below S1, S from S1 up.
    const ARCH_A = { N1: 6, J1: 7, J2: 7, J3: 8, R1: 8, R2: 8, R3: 9, S1: 9, S2: 9, S3: 9, X1: 9, T1: 9 };

    // A reported CohortRow at `stageLevel` with one all-archetype-A competency per category (E/I/C).
    function levelRow( stageLevel, score, over = {} ) {
        const curve = over.curve || ARCH_A;
        const rel = curve[ stageLevel ];
        return {
            evaluationID: over.evaluationID || ( "ev-" + stageLevel + "-" + score ),
            stageLevel: stageLevel,
            status: ( over.status !== undefined ) ? over.status : "Ready",
            isScored: ( over.isScored !== undefined ) ? over.isScored : true,
            finalScore: { score: score, interpretation: over.interpretation || "T3" },
            competencies: {
                "E1-1": { category: "E", relevancy: rel, relevancyCurve: curve },
                "I1-1": { category: "I", relevancy: rel, relevancyCurve: curve },
                "C1-1": { category: "C", relevancy: rel, relevancyCurve: curve }
            }
        };
    }

    const groupById = ( report, id ) => report.groups.find( ( g ) => g.id === id );

    it( "produces all 12 stage-level groups in ladder order + the T3=105 reference", () => {
        const report = resultsAnalyticsInstance.computeLevelDistribution( [], {} );
        assert.equal( report.groups.length, 12 );
        assert.deepEqual( report.groups.map( ( g ) => g.id ), [ "N1", "J1", "J2", "J3", "R1", "R2", "R3", "S1", "S2", "S3", "X1", "T1" ] );
        assert.deepEqual( report.reference, [ { v: 105, label: "T3" } ] );
        assert.equal( report.groups[ 0 ].suppressed, true );   // empty level
        assert.equal( report.groups[ 0 ].n, 0 );
    } );

    it( "computes the nearest-rank five-number summary + mean for a level (n>=3)", () => {
        const frame = [ levelRow( "S1", 120 ), levelRow( "S1", 130 ), levelRow( "S1", 128 ) ];
        const s1 = groupById( resultsAnalyticsInstance.computeLevelDistribution( frame, {} ), "S1" );
        assert.equal( s1.n, 3 );
        assert.equal( s1.min, 120 );
        assert.equal( s1.q1, 120 );    // sorted [120,128,130], nearestRank(0.25)=index0
        assert.equal( s1.median, 128 );
        assert.equal( s1.q3, 130 );
        assert.equal( s1.max, 130 );
        assert.equal( s1.mean, 126 );  // (120+128+130)/3
        assert.equal( s1.suppressed, undefined );
    } );

    it( "all-archetype-A cohort: expected = 100 at N1 (all-R) and 130 at S1 (all-S)", () => {
        const n1Frame = [ levelRow( "N1", 95 ), levelRow( "N1", 100 ), levelRow( "N1", 105 ) ];
        const s1Frame = [ levelRow( "S1", 120 ), levelRow( "S1", 125 ), levelRow( "S1", 130 ) ];
        assert.equal( groupById( resultsAnalyticsInstance.computeLevelDistribution( n1Frame, {} ), "N1" ).expected, 100 );
        assert.equal( groupById( resultsAnalyticsInstance.computeLevelDistribution( s1Frame, {} ), "S1" ).expected, 130 );
    } );

    it( "the expected curve rises N1 -> S1 (the maturity-step intent)", () => {
        const frame = [
            levelRow( "N1", 95 ), levelRow( "N1", 100 ), levelRow( "N1", 105 ),
            levelRow( "S1", 120 ), levelRow( "S1", 125 ), levelRow( "S1", 130 )
        ];
        const groups = resultsAnalyticsInstance.computeLevelDistribution( frame, {} ).groups;
        assert.ok( groupById( { groups }, "S1" ).expected > groupById( { groups }, "N1" ).expected );
    } );

    it( "suppresses a level with fewer than minCohortSize (3) reported rows", () => {
        const r1 = groupById( resultsAnalyticsInstance.computeLevelDistribution( [ levelRow( "R1", 100 ), levelRow( "R1", 110 ) ], {} ), "R1" );
        assert.equal( r1.suppressed, true );
        assert.equal( r1.n, 2 );
        assert.equal( r1.median, undefined );
    } );

    it( "excludes non-reported rows (Open / not scored) from the level cohort", () => {
        const frame = [
            levelRow( "S1", 120 ), levelRow( "S1", 130 ), levelRow( "S1", 128 ),
            levelRow( "S1", 60, { status: "Open", isScored: false } )   // excluded
        ];
        assert.equal( groupById( resultsAnalyticsInstance.computeLevelDistribution( frame, {} ), "S1" ).n, 3 );
    } );
} );

/* ===================== R4 — competence heatmap ===================== */

describe( "ResultsAnalytics.computeCompetenceHeatmap (R4)", () => {
    const ARCH_A = { N1: 6, J1: 7, J2: 7, J3: 8, R1: 8, R2: 8, R3: 9, S1: 9, S2: 9, S3: 9, X1: 9, T1: 9 };
    const W = { S: 1.3, R: 1.0, U: 0.6, N: 0.0, "": null };

    // A reported row with one competency per given (code, subcategory, grades). All archetype A at `stageLevel`.
    function hmRow( evaluationID, roleFamily, stageLevel, comps ) {
        const rel = ARCH_A[ stageLevel ];
        const competencies = {};
        for ( const code of Object.keys( comps ) ) {
            const g = comps[ code ];
            competencies[ code ] = {
                subcategory: g.subcategory, relevancy: rel, relevancyCurve: ARCH_A,
                selfWeight: W[ g.self !== undefined ? g.self : "R" ],
                managerWeight: W[ g.manager !== undefined ? g.manager : "R" ],
                teamWeight: W[ g.team !== undefined ? g.team : "R" ]
            };
        }
        return { evaluationID: evaluationID, roleFamily: roleFamily, organizationUnitID: "u1", stageLevel: stageLevel, status: "Ready", isScored: true, finalScore: { score: 100 }, competencies: competencies };
    }
    const cellAt = ( report, subIdx, colIdx ) => report.cells.find( ( c ) => c.r === subIdx && c.c === colIdx );

    it( "rows are the 9 subcategories; cols are the distinct group keys, sorted", () => {
        const frame = [
            hmRow( "a", "SE", "R1", { "E1-1": { subcategory: "E1" } } ),
            hmRow( "b", "SE", "R1", { "E1-1": { subcategory: "E1" } } ),
            hmRow( "c", "SE", "R1", { "E1-1": { subcategory: "E1" } } ),
            hmRow( "d", "BA", "R1", { "E1-1": { subcategory: "E1" } } ),
            hmRow( "e", "BA", "R1", { "E1-1": { subcategory: "E1" } } ),
            hmRow( "f", "BA", "R1", { "E1-1": { subcategory: "E1" } } )
        ];
        const report = resultsAnalyticsInstance.computeCompetenceHeatmap( frame, { groupBy: "roleFamily", source: "blended" } );
        assert.deepEqual( report.rows.map( ( r ) => r.id ), [ "E1", "E2", "E3", "I1", "I2", "I3", "C1", "C2", "C3" ] );
        assert.deepEqual( report.cols.map( ( c ) => c.id ), [ "BA", "SE" ] );   // sorted
    } );

    it( "blended cell v = relevancy-weighted blended grade; expected from maturity-step; delta = v − expected", () => {
        // 3 SE rows at R1 (archetype A → expected grade R = 1.0), all grades S (blended = 1.3).
        const frame = [
            hmRow( "a", "SE", "R1", { "E1-1": { subcategory: "E1", self: "S", manager: "S", team: "S" } } ),
            hmRow( "b", "SE", "R1", { "E1-1": { subcategory: "E1", self: "S", manager: "S", team: "S" } } ),
            hmRow( "c", "SE", "R1", { "E1-1": { subcategory: "E1", self: "S", manager: "S", team: "S" } } )
        ];
        const report = resultsAnalyticsInstance.computeCompetenceHeatmap( frame, { groupBy: "roleFamily", source: "blended" } );
        const cell = cellAt( report, 0, 0 );   // E1 × SE
        assert.equal( cell.n, 3 );
        assert.equal( cell.v, 1.3 );
        assert.equal( cell.expected, 1 );      // R at R1
        assert.equal( cell.delta, 0.3 );
    } );

    it( "source='self' uses only the self grade weight", () => {
        const frame = [
            hmRow( "a", "SE", "R1", { "E1-1": { subcategory: "E1", self: "S", manager: "N", team: "N" } } ),
            hmRow( "b", "SE", "R1", { "E1-1": { subcategory: "E1", self: "S", manager: "N", team: "N" } } ),
            hmRow( "c", "SE", "R1", { "E1-1": { subcategory: "E1", self: "S", manager: "N", team: "N" } } )
        ];
        const cell = cellAt( resultsAnalyticsInstance.computeCompetenceHeatmap( frame, { groupBy: "roleFamily", source: "self" } ), 0, 0 );
        assert.equal( cell.v, 1.3 );   // self = S, ignores the N manager/team
    } );

    it( "suppresses a cell with fewer than minCohortSize (3) contributing evaluations", () => {
        const frame = [
            hmRow( "a", "SE", "R1", { "E1-1": { subcategory: "E1" } } ),
            hmRow( "b", "SE", "R1", { "E1-1": { subcategory: "E1" } } )
        ];
        const cell = cellAt( resultsAnalyticsInstance.computeCompetenceHeatmap( frame, { groupBy: "roleFamily", source: "blended" } ), 0, 0 );
        assert.equal( cell.suppressed, true );
        assert.equal( cell.n, 2 );
        assert.equal( cell.v, undefined );
    } );
} );

/* ===================== R6 — predictive drivers ===================== */

describe( "ResultsAnalytics.computePredictiveDrivers (R6)", () => {
    // A reported row; comps: { code: { subcategory, relevancy, w } } where w is the grade weight on all three sources
    // (so the blended per-subcat value equals w for a single-competency subcategory).
    function drvRow( evaluationID, score, comps ) {
        const competencies = {};
        for ( const code of Object.keys( comps ) ) {
            const c = comps[ code ];
            competencies[ code ] = { subcategory: c.subcategory, relevancy: c.relevancy, selfWeight: c.w, managerWeight: c.w, teamWeight: c.w };
        }
        return { evaluationID: evaluationID, status: "Ready", isScored: true, finalScore: { score: score }, competencies: competencies };
    }
    const rowById = ( report, id ) => report.rows.find( ( r ) => r.id === id );

    it( "returns insufficientData with fewer than 5 reported rows", () => {
        const frame = [ drvRow( "a", 100, { "E1-1": { subcategory: "E1", relevancy: 5, w: 1.0 } } ) ];
        const report = resultsAnalyticsInstance.computePredictiveDrivers( frame, {} );
        assert.equal( report.insufficientData, true );
        assert.deepEqual( report.rows, [] );
    } );

    it( "Pearson r ≈ 1 for a subcategory that tracks the final score, null for a constant one", () => {
        const frame = [
            drvRow( "a", 0, { "E1-1": { subcategory: "E1", relevancy: 5, w: 0.0 }, "E2-1": { subcategory: "E2", relevancy: 5, w: 1.0 } } ),
            drvRow( "b", 60, { "E1-1": { subcategory: "E1", relevancy: 5, w: 0.6 }, "E2-1": { subcategory: "E2", relevancy: 5, w: 1.0 } } ),
            drvRow( "c", 100, { "E1-1": { subcategory: "E1", relevancy: 5, w: 1.0 }, "E2-1": { subcategory: "E2", relevancy: 5, w: 1.0 } } ),
            drvRow( "d", 100, { "E1-1": { subcategory: "E1", relevancy: 5, w: 1.0 }, "E2-1": { subcategory: "E2", relevancy: 5, w: 1.0 } } ),
            drvRow( "e", 130, { "E1-1": { subcategory: "E1", relevancy: 5, w: 1.3 }, "E2-1": { subcategory: "E2", relevancy: 5, w: 1.0 } } )
        ];
        const report = resultsAnalyticsInstance.computePredictiveDrivers( frame, {} );
        assert.equal( report.insufficientData, false );
        assert.equal( rowById( report, "E1" ).r, 1 );        // value = score/100 exactly
        assert.equal( rowById( report, "E2" ).r, null );     // constant → no correlation
        assert.equal( report.rows[ 0 ].id, "E1" );           // sorted by r desc → E1 first
    } );

    it( "configuredShare is the subcategory's slice of total relevancy mass (sums to 1 over present subcats)", () => {
        const frame = [];
        for ( let i = 0; i < 5; i++ ) {
            frame.push( drvRow( "r" + i, 100, { "E1-1": { subcategory: "E1", relevancy: 5, w: 1.0 }, "E2-1": { subcategory: "E2", relevancy: 5, w: 1.0 } } ) );
        }
        const report = resultsAnalyticsInstance.computePredictiveDrivers( frame, {} );
        assert.equal( rowById( report, "E1" ).configuredShare, 0.5 );
        assert.equal( rowById( report, "E2" ).configuredShare, 0.5 );
        assert.equal( rowById( report, "C3" ).configuredShare, 0 );   // no competencies
    } );

    it( "raises misweightFlag when a subcategory's empirical rank diverges from its configured rank by >= 2", () => {
        // E3 perfectly correlates (empirical rank 1) but has the LOWEST relevancy (configured rank 3) → gap 2 → flagged.
        // E1 (highest relevancy) and E2 are constant → no correlation.
        const frame = [
            drvRow( "a", 0, { "E1-1": { subcategory: "E1", relevancy: 9, w: 1.0 }, "E2-1": { subcategory: "E2", relevancy: 5, w: 1.0 }, "E3-1": { subcategory: "E3", relevancy: 1, w: 0.0 } } ),
            drvRow( "b", 60, { "E1-1": { subcategory: "E1", relevancy: 9, w: 1.0 }, "E2-1": { subcategory: "E2", relevancy: 5, w: 1.0 }, "E3-1": { subcategory: "E3", relevancy: 1, w: 0.6 } } ),
            drvRow( "c", 100, { "E1-1": { subcategory: "E1", relevancy: 9, w: 1.0 }, "E2-1": { subcategory: "E2", relevancy: 5, w: 1.0 }, "E3-1": { subcategory: "E3", relevancy: 1, w: 1.0 } } ),
            drvRow( "d", 100, { "E1-1": { subcategory: "E1", relevancy: 9, w: 1.0 }, "E2-1": { subcategory: "E2", relevancy: 5, w: 1.0 }, "E3-1": { subcategory: "E3", relevancy: 1, w: 1.0 } } ),
            drvRow( "e", 130, { "E1-1": { subcategory: "E1", relevancy: 9, w: 1.0 }, "E2-1": { subcategory: "E2", relevancy: 5, w: 1.0 }, "E3-1": { subcategory: "E3", relevancy: 1, w: 1.3 } } )
        ];
        const report = resultsAnalyticsInstance.computePredictiveDrivers( frame, {} );
        assert.equal( rowById( report, "E3" ).misweightFlag, true );
        assert.equal( rowById( report, "E3" ).r, 1 );
    } );
} );

/* ===================== R2 — time distribution ===================== */

describe( "ResultsAnalytics.computeTimeDistribution (R2)", () => {
    function evalRow( evaluationID, status, interviewDate, managerID ) {
        return { evaluationID: evaluationID, status: status, interviewDate: ( interviewDate !== undefined ) ? interviewDate : null, managerID: managerID || "m1" };
    }
    function slot( date, status, managerID ) {
        return { date: date, status: status, managerID: managerID || "m1" };
    }
    const monthRow = ( report, monthKey ) => report.rows.find( ( r ) => r.monthKey === monthKey );

    it( "held(proxy) = Ready/Closed with interviewDate <= today, bucketed by interview month", () => {
        const frame = [
            evalRow( "a", "Ready", "2026-03-10" ),
            evalRow( "b", "Closed", "2026-03-20" ),
            evalRow( "c", "Ready", "2026-04-05" ),
            evalRow( "d", "Ready", "2026-12-31" )   // future → not held yet
        ];
        const report = resultsAnalyticsInstance.computeTimeDistribution( frame, [], "2026-06-23" );
        assert.equal( monthRow( report, "2026-03" ).held, 2 );
        assert.equal( monthRow( report, "2026-04" ).held, 1 );
        assert.equal( monthRow( report, "2026-12" ), undefined );   // future interview not counted
    } );

    it( "planned = booked slots bucketed by slot month; available/other slots ignored", () => {
        const slots = [ slot( "2026-03-15", "booked" ), slot( "2026-03-18", "booked" ), slot( "2026-04-01", "available" ) ];
        const report = resultsAnalyticsInstance.computeTimeDistribution( [], slots, "2026-06-23" );
        assert.equal( monthRow( report, "2026-03" ).planned, 2 );
        assert.equal( monthRow( report, "2026-04" ), undefined );   // available slot not planned
    } );

    it( "unscheduledReady = Ready with no interviewDate (actionable bucket)", () => {
        const frame = [ evalRow( "a", "Ready", null ), evalRow( "b", "Ready", "2026-03-10" ), evalRow( "c", "Open", null ) ];
        const report = resultsAnalyticsInstance.computeTimeDistribution( frame, [], "2026-06-23" );
        assert.equal( report.unscheduledReady, 1 );
    } );

    it( "breaks down per manager (held + unscheduledReady from evals, planned from slots)", () => {
        const frame = [ evalRow( "a", "Ready", "2026-03-10", "m1" ), evalRow( "b", "Ready", null, "m2" ) ];
        const slots = [ slot( "2026-03-15", "booked", "m1" ) ];
        const report = resultsAnalyticsInstance.computeTimeDistribution( frame, slots, "2026-06-23" );
        const m1 = report.perManager.find( ( m ) => m.managerID === "m1" );
        const m2 = report.perManager.find( ( m ) => m.managerID === "m2" );
        assert.deepEqual( m1, { managerID: "m1", planned: 1, held: 1, unscheduledReady: 0 } );
        assert.deepEqual( m2, { managerID: "m2", planned: 0, held: 0, unscheduledReady: 1 } );
    } );
} );
