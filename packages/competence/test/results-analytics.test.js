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
